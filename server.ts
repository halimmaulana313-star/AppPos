import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { OnlineOrder, OnlineOrderStatus, Order, Product, StoreProfile } from './src/types/pos';

interface PersistedOnlineState {
  orders: OnlineOrder[];
  paidPosOrders: Order[];
  catalog: {
    store: StoreProfile | null;
    products: Product[] | null;
    updatedAt: string | null;
  };
}

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DATA_DIR = path.join(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'pos-online-state.json');

function loadStateFromDisk(): PersistedOnlineState {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PersistedOnlineState>;
      return {
        orders: Array.isArray(parsed.orders) ? parsed.orders : [],
        paidPosOrders: Array.isArray(parsed.paidPosOrders) ? parsed.paidPosOrders : [],
        catalog: {
          store: parsed.catalog?.store ?? null,
          products: Array.isArray(parsed.catalog?.products) ? parsed.catalog.products : null,
          updatedAt: parsed.catalog?.updatedAt ?? null,
        },
      };
    }
  } catch (err) {
    console.warn('[POS Server] Gagal membaca file state online, menggunakan state kosong:', err);
  }
  return {
    orders: [],
    paidPosOrders: [],
    catalog: {
      store: null,
      products: null,
      updatedAt: null,
    },
  };
}

function saveStateToDisk(state: PersistedOnlineState): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tempFile, DATA_FILE);
  } catch (err) {
    console.warn('[POS Server] Gagal menyimpan state online ke disk:', err);
  }
}

const state: PersistedOnlineState = loadStateFromDisk();

// Active SSE subscribers
const sseClients = new Set<Response>();

function broadcastSSE(event: string, payload: unknown): void {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(data);
    } catch {
      sseClients.delete(client);
    }
  }
}

function sortOrdersNewestFirst(orders: OnlineOrder[]): OnlineOrder[] {
  return [...orders].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

const VALID_STATUSES: OnlineOrderStatus[] = [
  'pending',
  'accepted',
  'preparing',
  'ready',
  'completed',
  'cancelled',
];

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  app.use(express.json({ limit: '15mb' }));

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, ordersCount: state.orders.length });
  });

  // SSE stream for real-time sync between Customer Portal (HP/Browser) and Cashier POS
  app.get('/api/online-orders/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    sseClients.add(res);

    // Send initial snapshot immediately
    res.write(
      `event: init\ndata: ${JSON.stringify({
        orders: state.orders,
        paidPosOrders: state.paidPosOrders,
        catalog: state.catalog,
      })}\n\n`
    );

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  // Get all online orders
  app.get('/api/online-orders', (_req: Request, res: Response) => {
    res.json({ orders: state.orders });
  });

  // Get POS transactions automatically settled via QRIS Portal
  app.get('/api/pos-synced-orders', (_req: Request, res: Response) => {
    res.json({ paidPosOrders: state.paidPosOrders });
  });

  // Create a new online order (idempotent by order.id)
  app.post('/api/online-orders', (req: Request, res: Response) => {
    const incoming = (req.body?.order ?? req.body) as Partial<OnlineOrder> | undefined;

    if (
      !incoming ||
      typeof incoming.id !== 'string' ||
      !incoming.id.trim() ||
      typeof incoming.customerName !== 'string' ||
      !incoming.customerName.trim() ||
      !Array.isArray(incoming.items) ||
      incoming.items.length === 0
    ) {
      res.status(400).json({
        error: 'Data pesanan tidak lengkap. Nama pemesan dan daftar menu wajib diisi.',
      });
      return;
    }

    const existing = state.orders.find((o) => o.id === incoming.id);
    if (existing) {
      res.status(200).json({ ok: true, order: existing, orders: state.orders, duplicate: true });
      return;
    }

    const newOrder: OnlineOrder = {
      id: incoming.id,
      orderCode: incoming.orderCode || `ORD-${Date.now().toString().slice(-4)}`,
      timestamp: incoming.timestamp || new Date().toISOString(),
      customerName: incoming.customerName.trim(),
      customerPhone: incoming.customerPhone?.trim() || undefined,
      orderType: incoming.orderType || 'dine_in',
      tableNumber: incoming.tableNumber?.trim() || undefined,
      items: incoming.items,
      subtotal: Number(incoming.subtotal) || 0,
      taxAmount: Number(incoming.taxAmount) || 0,
      serviceChargeAmount: Number(incoming.serviceChargeAmount) || 0,
      total: Number(incoming.total) || 0,
      status: VALID_STATUSES.includes(incoming.status as OnlineOrderStatus)
        ? (incoming.status as OnlineOrderStatus)
        : 'pending',
      notes: incoming.notes?.trim() || undefined,
      rejectionReason: incoming.rejectionReason?.trim() || undefined,
      paymentPreference: incoming.paymentPreference || 'pay_at_cashier',
      paymentStatus:
        incoming.paymentStatus ||
        (incoming.paymentPreference === 'qris_online' ? 'waiting_payment' : 'unpaid'),
      paidAt: incoming.paidAt,
      paymentReference: incoming.paymentReference,
      posOrderId: incoming.posOrderId,
      acceptedAt: incoming.acceptedAt,
      completedAt: incoming.completedAt,
    };

    state.orders = sortOrdersNewestFirst([newOrder, ...state.orders]);
    saveStateToDisk(state);

    broadcastSSE('new_order', { order: newOrder, orders: state.orders });

    res.status(201).json({ ok: true, order: newOrder, orders: state.orders });
  });

  // Automated QRIS Payment Settlement for an Online Order (idempotent)
  app.post('/api/online-orders/:id/pay-qris', (req: Request, res: Response) => {
    const { id } = req.params;
    const idx = state.orders.findIndex((o) => o.id === id);

    if (idx === -1) {
      res.status(404).json({ error: 'Pesanan online tidak ditemukan.' });
      return;
    }

    const existingOrder = state.orders[idx];
    if (existingOrder.status === 'cancelled') {
      res.status(400).json({ error: 'Pesanan yang telah dibatalkan tidak dapat dibayar.' });
      return;
    }

    if (existingOrder.paymentStatus === 'paid') {
      const existingPosOrder = state.paidPosOrders.find(
        (po) => po.id === (existingOrder.posOrderId || `ORD-QRIS-${existingOrder.id}`)
      );
      res.json({
        ok: true,
        order: existingOrder,
        posOrder: existingPosOrder || null,
        orders: state.orders,
        alreadyPaid: true,
      });
      return;
    }

    const now = new Date().toISOString();
    const cleanCode = existingOrder.orderCode.replace(/[^A-Z0-9]/gi, '') || 'QRIS';
    const paymentReference = `QRIS-${cleanCode}-${Date.now().toString().slice(-5)}`;
    const posOrderId = `ORD-QRIS-${existingOrder.id}`;

    const updatedOrder: OnlineOrder = {
      ...existingOrder,
      paymentPreference: 'qris_online',
      paymentStatus: 'paid',
      paidAt: now,
      paymentReference,
      posOrderId,
      status: existingOrder.status === 'completed' ? 'completed' : 'preparing',
      acceptedAt: existingOrder.acceptedAt || now,
    };

    const storeConfig = state.catalog.store;
    const taxRate = storeConfig?.enableTax
      ? (storeConfig.taxPercentage || 0) / 100
      : existingOrder.subtotal > 0
      ? existingOrder.taxAmount / existingOrder.subtotal
      : 0;
    const serviceChargeRate = storeConfig?.enableServiceCharge
      ? (storeConfig.serviceChargePercentage || 0) / 100
      : existingOrder.subtotal > 0
      ? existingOrder.serviceChargeAmount / existingOrder.subtotal
      : 0;

    const nextSeq = state.paidPosOrders.length + 1;
    const posOrder: Order = {
      id: posOrderId,
      orderNumber: nextSeq,
      timestamp: now,
      cashierName: 'QRIS Online Portal',
      customerName: updatedOrder.customerName,
      tableNumber: updatedOrder.tableNumber,
      orderType: updatedOrder.orderType,
      items: updatedOrder.items,
      subtotal: updatedOrder.subtotal,
      discount: 0,
      discountPercent: 0,
      taxRate,
      taxAmount: updatedOrder.taxAmount,
      serviceChargeRate,
      serviceChargeAmount: updatedOrder.serviceChargeAmount,
      total: updatedOrder.total,
      paymentMethod: 'qris',
      amountPaid: updatedOrder.total,
      change: 0,
      status: 'completed',
      notes: `Bayar Otomatis QRIS Portal (#${updatedOrder.orderCode}) • Ref: ${paymentReference}`,
    };

    state.orders = state.orders.map((o) => (o.id === id ? updatedOrder : o));
    state.paidPosOrders = [
      posOrder,
      ...state.paidPosOrders.filter((po) => po.id !== posOrder.id),
    ];
    saveStateToDisk(state);

    broadcastSSE('qris_paid', {
      order: updatedOrder,
      posOrder,
      orders: state.orders,
    });
    broadcastSSE('status_changed', {
      order: updatedOrder,
      orders: state.orders,
    });

    res.json({
      ok: true,
      order: updatedOrder,
      posOrder,
      orders: state.orders,
    });
  });

  // Update online order status
  app.patch('/api/online-orders/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const status = req.body?.status as OnlineOrderStatus | undefined;
    const rejectionReason = req.body?.rejectionReason as string | undefined;

    if (!status || !VALID_STATUSES.includes(status)) {
      res.status(400).json({ error: 'Status pesanan tidak valid.' });
      return;
    }

    const idx = state.orders.findIndex((o) => o.id === id);
    if (idx === -1) {
      res.status(404).json({ error: 'Pesanan online tidak ditemukan.' });
      return;
    }

    const now = new Date().toISOString();
    const updatedOrder: OnlineOrder = {
      ...state.orders[idx],
      status,
    };

    if (status === 'accepted') updatedOrder.acceptedAt = now;
    if (status === 'completed') updatedOrder.completedAt = now;
    if (status === 'cancelled' && rejectionReason !== undefined) {
      updatedOrder.rejectionReason = rejectionReason.trim() || undefined;
    }

    state.orders = state.orders.map((o) => (o.id === id ? updatedOrder : o));
    saveStateToDisk(state);

    broadcastSSE('status_changed', { order: updatedOrder, orders: state.orders });

    res.json({ ok: true, order: updatedOrder, orders: state.orders });
  });

  // Delete an online order
  app.delete('/api/online-orders/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    const beforeLen = state.orders.length;
    state.orders = state.orders.filter((o) => o.id !== id);

    if (state.orders.length !== beforeLen) {
      saveStateToDisk(state);
      broadcastSSE('order_deleted', { orderId: id, orders: state.orders });
    }

    res.json({ ok: true, orders: state.orders });
  });

  // Catalog (store profile + live products) sync so QR customer phones see live menu/store
  app.get('/api/catalog', (_req: Request, res: Response) => {
    res.json(state.catalog);
  });

  app.post('/api/catalog', (req: Request, res: Response) => {
    const store = (req.body?.store ?? null) as StoreProfile | null;
    const products = Array.isArray(req.body?.products) ? (req.body.products as Product[]) : null;

    if (!store && !products) {
      res.status(400).json({ error: 'Data katalog tidak valid.' });
      return;
    }

    state.catalog = {
      store: store ?? state.catalog.store,
      products: products ?? state.catalog.products,
      updatedAt: new Date().toISOString(),
    };
    saveStateToDisk(state);
    broadcastSSE('catalog_updated', state.catalog);

    res.json({ ok: true, catalog: state.catalog });
  });

  if (IS_PRODUCTION) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[POS Server] Berjalan di http://0.0.0.0:${PORT} (${IS_PRODUCTION ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('[POS Server] Gagal menjalankan server:', err);
  process.exit(1);
});
