/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CartItem, OnlineOrder, OnlineOrderStatus, Order, Product, StoreProfile } from '../types/pos';
import { getLocalDateString } from './formatters';

export const STORAGE_KEY_ONLINE_ORDERS = 'kasirku_online_orders_v1';
export const STORAGE_KEY_CUSTOMER_ACTIVE_ORDER = 'kasirku_customer_active_order_v1';
export const BROADCAST_CHANNEL_NAME = 'kasirku_orders_sync_channel';

export interface CatalogSnapshot {
  store: StoreProfile | null;
  products: Product[] | null;
  updatedAt?: string | null;
}

export interface PaidPosEvent {
  order: OnlineOrder;
  posOrder: Order;
}

class OnlineOrdersManager {
  private channel: BroadcastChannel | null = null;
  private eventSource: EventSource | null = null;
  private pollIntervalId: number | null = null;
  private reconnectTimeoutId: number | null = null;
  private listeners: Set<(orders: OnlineOrder[], newOrder?: OnlineOrder) => void> = new Set();
  private catalogListeners: Set<(catalog: CatalogSnapshot) => void> = new Set();
  private paidPosListeners: Set<(posOrders: Order[], latestPaid?: PaidPosEvent) => void> = new Set();
  private knownOrderIds: Set<string> = new Set();
  private hasInitializedServer = false;

  constructor() {
    if (typeof window === 'undefined') return;

    // Initialize known IDs from local cache so we only alert on truly newly-arrived orders
    for (const existing of this.getOrders()) {
      this.knownOrderIds.add(existing.id);
    }

    if ('BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        this.channel.onmessage = (event) => {
          const { type, order, posOrder } = event.data || {};
          if (type === 'NEW_ONLINE_ORDER' && order) {
            const current = this.getOrders();
            const merged = [order, ...current.filter((o) => o.id !== order.id)];
            const isBrandNew = !this.knownOrderIds.has(order.id);
            this.knownOrderIds.add(order.id);
            this.saveOrders(merged);
            this.notifyListeners(merged, isBrandNew ? order : undefined);
          } else if (type === 'QRIS_ORDER_PAID' && order) {
            this.syncCustomerActiveOrderIfMatched(order);
            const current = this.getOrders();
            const merged = current.map((o) => (o.id === order.id ? order : o));
            this.saveOrders(merged);
            this.notifyListeners(merged);
            if (posOrder) {
              this.notifyPaidPosListeners([posOrder], { order, posOrder });
            }
          } else if (type === 'ORDER_STATUS_CHANGED' || type === 'REFRESH_ORDERS') {
            this.notifyListeners(this.getOrders());
          }
        };
      } catch (err) {
        console.warn('BroadcastChannel not available:', err);
      }
    }

    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY_ONLINE_ORDERS) {
        const current = this.getOrders();
        const newlySeen = current.find(
          (o) => o.status === 'pending' && !this.knownOrderIds.has(o.id)
        );
        for (const o of current) {
          this.knownOrderIds.add(o.id);
        }
        this.notifyListeners(current, newlySeen);
      }
    });

    this.connectServerSync();
  }

  private connectServerSync(): void {
    if (typeof window === 'undefined') return;

    // Initial REST pull
    void this.refreshFromServer(false);

    // Real-time SSE stream
    this.openEventSource();

    // Background fallback polling every 5 seconds in case a proxy buffers SSE
    if (this.pollIntervalId === null) {
      this.pollIntervalId = window.setInterval(() => {
        void this.refreshFromServer(true);
      }, 5000);
    }
  }

  private openEventSource(): void {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    try {
      const es = new EventSource('/api/online-orders/stream');
      this.eventSource = es;

      es.addEventListener('init', (evt) => {
        try {
          const data = JSON.parse((evt as MessageEvent).data) as {
            orders?: OnlineOrder[];
            paidPosOrders?: Order[];
            catalog?: CatalogSnapshot;
          };
          if (Array.isArray(data.orders)) {
            this.applyServerOrders(data.orders, this.hasInitializedServer);
            this.hasInitializedServer = true;
          }
          if (Array.isArray(data.paidPosOrders) && data.paidPosOrders.length > 0) {
            this.notifyPaidPosListeners(data.paidPosOrders);
          }
          if (data.catalog && (data.catalog.store || data.catalog.products)) {
            this.notifyCatalogListeners(data.catalog);
          }
        } catch (err) {
          console.warn('SSE init parse error:', err);
        }
      });

      es.addEventListener('new_order', (evt) => {
        try {
          const data = JSON.parse((evt as MessageEvent).data) as {
            order?: OnlineOrder;
            orders?: OnlineOrder[];
          };
          if (Array.isArray(data.orders)) {
            this.applyServerOrders(data.orders, true, data.order);
          } else if (data.order) {
            const current = this.getOrders();
            this.applyServerOrders(
              [data.order, ...current.filter((o) => o.id !== data.order!.id)],
              true,
              data.order
            );
          }
        } catch (err) {
          console.warn('SSE new_order parse error:', err);
        }
      });

      es.addEventListener('qris_paid', (evt) => {
        try {
          const data = JSON.parse((evt as MessageEvent).data) as {
            order?: OnlineOrder;
            posOrder?: Order;
            orders?: OnlineOrder[];
          };
          if (data.order) {
            this.syncCustomerActiveOrderIfMatched(data.order);
          }
          if (Array.isArray(data.orders)) {
            this.applyServerOrders(data.orders, false);
          }
          if (data.posOrder && data.order) {
            this.notifyPaidPosListeners([data.posOrder], {
              order: data.order,
              posOrder: data.posOrder,
            });
          }
        } catch (err) {
          console.warn('SSE qris_paid parse error:', err);
        }
      });

      es.addEventListener('status_changed', (evt) => {
        try {
          const data = JSON.parse((evt as MessageEvent).data) as {
            order?: OnlineOrder;
            orders?: OnlineOrder[];
          };
          if (data.order) {
            this.syncCustomerActiveOrderIfMatched(data.order);
          }
          if (Array.isArray(data.orders)) {
            this.applyServerOrders(data.orders, false);
          }
        } catch (err) {
          console.warn('SSE status_changed parse error:', err);
        }
      });

      es.addEventListener('order_deleted', (evt) => {
        try {
          const data = JSON.parse((evt as MessageEvent).data) as {
            orders?: OnlineOrder[];
          };
          if (Array.isArray(data.orders)) {
            this.applyServerOrders(data.orders, false);
          }
        } catch (err) {
          console.warn('SSE order_deleted parse error:', err);
        }
      });

      es.addEventListener('catalog_updated', (evt) => {
        try {
          const catalog = JSON.parse((evt as MessageEvent).data) as CatalogSnapshot;
          this.notifyCatalogListeners(catalog);
        } catch (err) {
          console.warn('SSE catalog_updated parse error:', err);
        }
      });

      es.onerror = () => {
        es.close();
        this.eventSource = null;
        if (this.reconnectTimeoutId === null) {
          this.reconnectTimeoutId = window.setTimeout(() => {
            this.reconnectTimeoutId = null;
            this.openEventSource();
          }, 4000);
        }
      };
    } catch (err) {
      console.warn('EventSource initialization failed:', err);
    }
  }

  private syncCustomerActiveOrderIfMatched(serverOrder: OnlineOrder): void {
    try {
      const activeRaw = localStorage.getItem(STORAGE_KEY_CUSTOMER_ACTIVE_ORDER);
      if (activeRaw) {
        const active: OnlineOrder = JSON.parse(activeRaw);
        if (active.id === serverOrder.id) {
          localStorage.setItem(STORAGE_KEY_CUSTOMER_ACTIVE_ORDER, JSON.stringify(serverOrder));
        }
      }
    } catch {
      // ignore
    }
  }

  private applyServerOrders(
    serverOrders: OnlineOrder[],
    notifyNewOrder: boolean,
    explicitNewOrder?: OnlineOrder
  ): void {
    let newlyArrived: OnlineOrder | undefined;

    if (notifyNewOrder) {
      if (explicitNewOrder && !this.knownOrderIds.has(explicitNewOrder.id)) {
        newlyArrived = explicitNewOrder;
      } else {
        newlyArrived = serverOrders.find(
          (o) => o.status === 'pending' && !this.knownOrderIds.has(o.id)
        );
      }
    }

    for (const o of serverOrders) {
      this.knownOrderIds.add(o.id);
    }

    // Keep customer active order synced with latest server order
    try {
      const activeRaw = localStorage.getItem(STORAGE_KEY_CUSTOMER_ACTIVE_ORDER);
      if (activeRaw) {
        const active: OnlineOrder = JSON.parse(activeRaw);
        const matched = serverOrders.find((o) => o.id === active.id);
        if (matched) {
          localStorage.setItem(STORAGE_KEY_CUSTOMER_ACTIVE_ORDER, JSON.stringify(matched));
        }
      }
    } catch {
      // ignore
    }

    this.saveOrders(serverOrders);
    this.notifyListeners(serverOrders, newlyArrived);
  }

  async refreshFromServer(detectNew: boolean = true): Promise<OnlineOrder[]> {
    if (typeof window === 'undefined') return [];
    try {
      const res = await fetch('/api/online-orders', { cache: 'no-store' });
      if (!res.ok) return this.getOrders();
      const data = (await res.json()) as { orders?: OnlineOrder[] };
      if (Array.isArray(data.orders)) {
        this.applyServerOrders(data.orders, this.hasInitializedServer && detectNew);
        this.hasInitializedServer = true;
        return data.orders;
      }
    } catch {
      // Fallback to localStorage cache silently
    }
    return this.getOrders();
  }

  getOrders(): OnlineOrder[] {
    if (typeof window === 'undefined') return [];
    try {
      const data = localStorage.getItem(STORAGE_KEY_ONLINE_ORDERS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  saveOrders(orders: OnlineOrder[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY_ONLINE_ORDERS, JSON.stringify(orders));
    } catch {
      // ignore
    }
  }

  async addOrder(order: OnlineOrder): Promise<{ ok: boolean; error?: string }> {
    const orders = this.getOrders();
    const updated = [order, ...orders.filter((o) => o.id !== order.id)];
    const isBrandNew = !this.knownOrderIds.has(order.id);
    this.knownOrderIds.add(order.id);
    this.saveOrders(updated);

    // Save as active customer order for customer view persistence
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOMER_ACTIVE_ORDER, JSON.stringify(order));
    } catch {
      // ignore
    }

    // Notify local listeners immediately
    this.notifyListeners(updated, isBrandNew ? order : undefined);

    // Broadcast across same-browser tabs
    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'NEW_ONLINE_ORDER', order });
      } catch {
        // ignore
      }
    }

    // Persist to server so cashier POS on ANY device receives the order immediately
    try {
      const res = await fetch('/api/online-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        return {
          ok: false,
          error: errBody.error || 'Server gagal memproses pesanan online.',
        };
      }
      const data = (await res.json()) as { orders?: OnlineOrder[] };
      if (Array.isArray(data.orders)) {
        this.applyServerOrders(data.orders, false);
      }
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: 'Koneksi ke server kasir gagal. Periksa jaringan WiFi/internet Anda lalu coba lagi.',
      };
    }
  }

  async updateOrderStatus(
    orderId: string,
    status: OnlineOrderStatus,
    rejectionReason?: string
  ): Promise<void> {
    const orders = this.getOrders();
    const now = new Date().toISOString();
    const updated = orders.map((o) => {
      if (o.id === orderId) {
        const next: OnlineOrder = { ...o, status };
        if (status === 'accepted') next.acceptedAt = now;
        if (status === 'completed') next.completedAt = now;
        if (status === 'cancelled' && rejectionReason !== undefined) {
          next.rejectionReason = rejectionReason.trim() || undefined;
        }
        return next;
      }
      return o;
    });

    this.saveOrders(updated);

    // If active customer order matches, update it too
    try {
      const activeRaw = localStorage.getItem(STORAGE_KEY_CUSTOMER_ACTIVE_ORDER);
      if (activeRaw) {
        const active: OnlineOrder = JSON.parse(activeRaw);
        if (active.id === orderId) {
          active.status = status;
          if (status === 'cancelled' && rejectionReason !== undefined) {
            active.rejectionReason = rejectionReason.trim() || undefined;
          }
          localStorage.setItem(STORAGE_KEY_CUSTOMER_ACTIVE_ORDER, JSON.stringify(active));
        }
      }
    } catch {
      // ignore
    }

    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'ORDER_STATUS_CHANGED', orderId, status });
      } catch {
        // ignore
      }
    }

    this.notifyListeners(updated);

    try {
      const res = await fetch(`/api/online-orders/${encodeURIComponent(orderId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, rejectionReason }),
      });
      if (res.ok) {
        const data = (await res.json()) as { orders?: OnlineOrder[] };
        if (Array.isArray(data.orders)) {
          this.applyServerOrders(data.orders, false);
        }
      }
    } catch {
      // ignore network error
    }
  }

  async deleteOrder(orderId: string): Promise<void> {
    const orders = this.getOrders().filter((o) => o.id !== orderId);
    this.saveOrders(orders);
    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'REFRESH_ORDERS' });
      } catch {
        // ignore
      }
    }
    this.notifyListeners(orders);

    try {
      const res = await fetch(`/api/online-orders/${encodeURIComponent(orderId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const data = (await res.json()) as { orders?: OnlineOrder[] };
        if (Array.isArray(data.orders)) {
          this.applyServerOrders(data.orders, false);
        }
      }
    } catch {
      // ignore
    }
  }

  async payOrderWithQris(
    orderId: string
  ): Promise<{ ok: boolean; order?: OnlineOrder; posOrder?: Order; error?: string }> {
    if (typeof window === 'undefined') {
      return { ok: false, error: 'Tidak berjalan di browser.' };
    }

    try {
      const res = await fetch(`/api/online-orders/${encodeURIComponent(orderId)}/pay-qris`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        order?: OnlineOrder;
        posOrder?: Order;
        orders?: OnlineOrder[];
        error?: string;
      };

      if (!res.ok || !data.order) {
        return {
          ok: false,
          error: data.error || 'Gagal memverifikasi pembayaran QRIS otomatis.',
        };
      }

      this.syncCustomerActiveOrderIfMatched(data.order);

      if (Array.isArray(data.orders)) {
        this.applyServerOrders(data.orders, false);
      } else {
        const merged = this.getOrders().map((o) => (o.id === data.order!.id ? data.order! : o));
        this.saveOrders(merged);
        this.notifyListeners(merged);
      }

      if (this.channel) {
        try {
          this.channel.postMessage({
            type: 'QRIS_ORDER_PAID',
            order: data.order,
            posOrder: data.posOrder,
          });
        } catch {
          // ignore
        }
      }

      if (data.posOrder) {
        this.notifyPaidPosListeners([data.posOrder], {
          order: data.order,
          posOrder: data.posOrder,
        });
      }

      return { ok: true, order: data.order, posOrder: data.posOrder };
    } catch {
      return {
        ok: false,
        error: 'Koneksi ke server kasir gagal saat verifikasi pembayaran QRIS.',
      };
    }
  }

  async fetchPaidPosOrders(): Promise<Order[]> {
    if (typeof window === 'undefined') return [];
    try {
      const res = await fetch('/api/pos-synced-orders', { cache: 'no-store' });
      if (!res.ok) return [];
      const data = (await res.json()) as { paidPosOrders?: Order[] };
      return Array.isArray(data.paidPosOrders) ? data.paidPosOrders : [];
    } catch {
      return [];
    }
  }

  subscribePaidPosOrders(
    callback: (posOrders: Order[], latestPaid?: PaidPosEvent) => void
  ): () => void {
    this.paidPosListeners.add(callback);
    return () => {
      this.paidPosListeners.delete(callback);
    };
  }

  private notifyPaidPosListeners(posOrders: Order[], latestPaid?: PaidPosEvent): void {
    this.paidPosListeners.forEach((cb) => {
      try {
        cb(posOrders, latestPaid);
      } catch (err) {
        console.error('Error in paid POS listener:', err);
      }
    });
  }

  async syncCatalogToServer(store: StoreProfile, products: Product[]): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      await fetch('/api/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store, products }),
      });
    } catch {
      // ignore silently when offline
    }
  }

  async fetchCatalogFromServer(): Promise<CatalogSnapshot | null> {
    if (typeof window === 'undefined') return null;
    try {
      const res = await fetch('/api/catalog', { cache: 'no-store' });
      if (!res.ok) return null;
      return (await res.json()) as CatalogSnapshot;
    } catch {
      return null;
    }
  }

  subscribeCatalog(callback: (catalog: CatalogSnapshot) => void): () => void {
    this.catalogListeners.add(callback);
    return () => {
      this.catalogListeners.delete(callback);
    };
  }

  private notifyCatalogListeners(catalog: CatalogSnapshot): void {
    this.catalogListeners.forEach((cb) => {
      try {
        cb(catalog);
      } catch (err) {
        console.error('Error in catalog listener:', err);
      }
    });
  }

  subscribe(callback: (orders: OnlineOrder[], newOrder?: OnlineOrder) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(orders: OnlineOrder[], newOrder?: OnlineOrder): void {
    this.listeners.forEach((listener) => {
      try {
        listener(orders, newOrder);
      } catch (err) {
        console.error('Error in online order listener:', err);
      }
    });
  }

  generateOrderCode(tableNumber?: string, orderCount: number = 1): string {
    if (tableNumber) {
      const cleanTable = tableNumber.replace(/\D/g, '').padStart(2, '0');
      return `M${cleanTable || '01'}-${orderCount}`;
    }
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const letter = letters[(orderCount - 1) % letters.length];
    const num = String(orderCount).padStart(2, '0');
    return `${letter}${num}`;
  }

  createDemoOrder(products: Product[], store: StoreProfile, table: string = '03'): OnlineOrder {
    const now = new Date();
    const dateStr = getLocalDateString(now).replace(/-/g, '');
    const orders = this.getOrders();
    const orderNumber = orders.length + 1;
    const uniqueSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const orderId = `ONL-${dateStr}-${String(orderNumber).padStart(3, '0')}-${uniqueSuffix}`;

    const sample1 = products[0] || { id: 'p1', name: 'Kopi Susu Gula Aren', price: 18000 };
    const sample2 = products[5] || products[1] || { id: 'p2', name: 'Nasi Goreng Spesial', price: 25000 };

    const items: CartItem[] = [
      {
        product: sample1 as Product,
        quantity: 2,
        note: 'Es sedikit (less ice)',
        discount: 0,
      },
      {
        product: sample2 as Product,
        quantity: 1,
        note: 'Pedas sedang',
        discount: 0,
      },
    ];

    const subtotal = items.reduce((s, i) => s + i.product.price * i.quantity, 0);
    const taxAmount = store.enableTax ? Math.round(subtotal * (store.taxPercentage / 100)) : 0;
    const serviceChargeAmount = store.enableServiceCharge
      ? Math.round(subtotal * (store.serviceChargePercentage / 100))
      : 0;
    const total = subtotal + taxAmount + serviceChargeAmount;

    return {
      id: orderId,
      orderCode: `M${table}-${orderNumber}`,
      timestamp: now.toISOString(),
      customerName: 'Dimas Wicaksono',
      customerPhone: '081234567890',
      orderType: 'dine_in',
      tableNumber: table,
      items,
      subtotal,
      taxAmount,
      serviceChargeAmount,
      total,
      status: 'pending',
      notes: 'Tolong sendok dan tisu tambahan ya.',
      paymentPreference: 'pay_at_cashier',
    };
  }
}

export const onlineOrdersManager = new OnlineOrdersManager();
