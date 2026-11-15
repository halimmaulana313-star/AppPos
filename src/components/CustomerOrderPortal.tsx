/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  FileDown,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  QrCode,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  Store,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { CartItem, OnlineOrder, Order, PrinterConfig, Product, StoreProfile } from '../types/pos';
import {
  formatDateTime,
  formatNumber,
  formatRupiah,
  getLocalDateString,
} from '../utils/formatters';
import { sounds } from '../utils/soundEffects';
import {
  downloadQRImage,
  generateQRCodeDataUrl,
  getStoreQrisImageDataUrl,
} from '../utils/qrCodeGenerator';
import { generateOrderReceiptPDF } from '../utils/receiptPdfGenerator';
import { DEFAULT_PRINTER_CONFIG } from '../utils/initialData';
import {
  onlineOrdersManager,
  STORAGE_KEY_CUSTOMER_ACTIVE_ORDER,
} from '../utils/onlineOrdersManager';

interface CustomerOrderPortalProps {
  products: Product[];
  store: StoreProfile;
  printerConfig?: PrinterConfig;
  initialTable?: string;
  onExitPortal?: () => void;
}

export const CustomerOrderPortal: React.FC<CustomerOrderPortalProps> = ({
  products,
  store,
  printerConfig = DEFAULT_PRINTER_CONFIG,
  initialTable = '',
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone] = useState<string>('');
  const [tableNumber, setTableNumber] = useState<string>(initialTable || '');
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway'>('dine_in');
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [paymentPreference, setPaymentPreference] = useState<'pay_at_cashier' | 'qris_online'>('pay_at_cashier');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isVerifyingQris, setIsVerifyingQris] = useState<boolean>(false);
  const [qrisPayError, setQrisPayError] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [qrisSecondsLeft, setQrisSecondsLeft] = useState<number>(900);

  // Modals & Drawers
  const [isCartDrawerOpen, setIsCartDrawerOpen] = useState<boolean>(false);
  const [isTableModalOpen, setIsTableModalOpen] = useState<boolean>(false);
  const [tableDraft, setTableDraft] = useState<string>('');
  const [activeItemNoteModal, setActiveItemNoteModal] = useState<{
    product: Product;
    currentNote: string;
  } | null>(null);

  // Active Submitted Order state
  const [activeOrder, setActiveOrder] = useState<OnlineOrder | null>(null);
  const [orderQrDataUrl, setOrderQrDataUrl] = useState<string>('');
  const [dynamicQrisUrl, setDynamicQrisUrl] = useState<string>('');
  const [enlargedQrisModal, setEnlargedQrisModal] = useState<{
    imageUrl: string;
    amount: number;
    label?: string;
  } | null>(null);

  // Check existing active order on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CUSTOMER_ACTIVE_ORDER);
      if (saved) {
        const parsed: OnlineOrder = JSON.parse(saved);
        // Only keep if created within 24 hours
        const diffHours = (Date.now() - new Date(parsed.timestamp).getTime()) / (1000 * 60 * 60);
        if (diffHours < 24 && parsed.status !== 'completed' && parsed.status !== 'cancelled') {
          setActiveOrder(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Listen to order status & paymentStatus updates in real-time
  useEffect(() => {
    const unsubscribe = onlineOrdersManager.subscribe((orders) => {
      if (activeOrder) {
        const match = orders.find((o) => o.id === activeOrder.id);
        if (
          match &&
          (match.status !== activeOrder.status ||
            match.paymentStatus !== activeOrder.paymentStatus ||
            match.paymentReference !== activeOrder.paymentReference)
        ) {
          setActiveOrder(match);
          if (match.paymentStatus === 'paid' && activeOrder.paymentStatus !== 'paid') {
            sounds.playCashRegister();
            confetti({ particleCount: 90, spread: 70, origin: { y: 0.65 } });
          } else if (match.status === 'accepted') {
            sounds.playItemBeep();
          } else if (match.status === 'completed') {
            sounds.playCashRegister();
          }
        }
      }
    });
    return () => unsubscribe();
  }, [activeOrder]);

  // Live 15-minute payment countdown for unpaid QRIS orders
  useEffect(() => {
    if (
      !activeOrder ||
      activeOrder.paymentPreference !== 'qris_online' ||
      activeOrder.paymentStatus === 'paid' ||
      activeOrder.status === 'cancelled'
    ) {
      return;
    }

    const computeRemaining = () => {
      const elapsedSec = Math.floor(
        (Date.now() - new Date(activeOrder.timestamp).getTime()) / 1000
      );
      return Math.max(0, 15 * 60 - elapsedSec);
    };

    setQrisSecondsLeft(computeRemaining());
    const timer = window.setInterval(() => {
      setQrisSecondsLeft(computeRemaining());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeOrder]);

  // Generate QR for active order code
  useEffect(() => {
    if (activeOrder) {
      generateQRCodeDataUrl(`ORDER:${activeOrder.id}|CODE:${activeOrder.orderCode}`)
        .then((url) => setOrderQrDataUrl(url))
        .catch((err) => console.error(err));
    }
  }, [activeOrder]);

  // Categories
  const categories = useMemo(() => {
    const list = Array.from(new Set(products.map((p) => p.category)));
    return ['Semua', ...list];
  }, [products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = selectedCategory === 'Semua' || p.category === selectedCategory;
      const matchSearch =
        !searchQuery.trim() ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Cart operations
  const handleAddToCart = (product: Product) => {
    if (product.stock <= 0) return;
    sounds.playItemBeep();
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: Math.min(product.stock, item.quantity + 1) }
            : item
        );
      }
      return [...prev, { product, quantity: 1, discount: 0 }];
    });
  };

  const handleUpdateQuantity = (productId: string, delta: number) => {
    sounds.playItemBeep();
    setCart((prev) => {
      return prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: Math.min(item.product.stock, newQty) } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[];
    });
  };

  const handleSaveItemNote = (noteText: string) => {
    if (!activeItemNoteModal) return;
    const { product } = activeItemNoteModal;
    setCart((prev) =>
      prev.map((item) =>
        item.product.id === product.id ? { ...item, note: noteText.trim() || undefined } : item
      )
    );
    setActiveItemNoteModal(null);
  };

  // Calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  }, [cart]);

  const taxAmount = useMemo(() => {
    if (!store.enableTax) return 0;
    return Math.round(subtotal * (store.taxPercentage / 100));
  }, [subtotal, store.enableTax, store.taxPercentage]);

  const serviceChargeAmount = useMemo(() => {
    if (!store.enableServiceCharge) return 0;
    return Math.round(subtotal * (store.serviceChargePercentage / 100));
  }, [subtotal, store.enableServiceCharge, store.serviceChargePercentage]);

  const grandTotal = useMemo(() => {
    return subtotal + taxAmount + serviceChargeAmount;
  }, [subtotal, taxAmount, serviceChargeAmount]);

  const totalCartCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Resolve exact Store QRIS image (uploaded QRIS Toko or identical default Store QRIS)
  useEffect(() => {
    let active = true;
    void getStoreQrisImageDataUrl(store)
      .then((url) => {
        if (active) setDynamicQrisUrl(url);
      })
      .catch((err) => console.error(err));
    return () => {
      active = false;
    };
  }, [store.qrisImageUrl, store.qrisMerchantName, store.storeName, store.qrisNmid]);

  // Submit Order to Cashier
  const handleSubmitOrder = async () => {
    if (cart.length === 0 || isSubmitting) return;
    if (!customerName.trim()) {
      setFormError('Silakan masukkan nama pemesan terlebih dahulu.');
      sounds.playError();
      return;
    }
    if (orderType === 'dine_in' && !tableNumber.trim()) {
      setFormError('Silakan masukkan nomor meja atau pilih mode Bawa Pulang.');
      sounds.playError();
      return;
    }
    setFormError(null);
    setIsSubmitting(true);

    const now = new Date();
    const dateStr = getLocalDateString(now).replace(/-/g, '');
    const existingOrders = onlineOrdersManager.getOrders();
    const orderNumber = existingOrders.length + 1;
    const uniqueSuffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const orderId = `ONL-${dateStr}-${String(orderNumber).padStart(3, '0')}-${uniqueSuffix}`;
    const orderCode = onlineOrdersManager.generateOrderCode(
      orderType === 'dine_in' ? tableNumber : undefined,
      orderNumber
    );

    const newOrder: OnlineOrder = {
      id: orderId,
      orderCode,
      timestamp: now.toISOString(),
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || undefined,
      orderType,
      tableNumber: orderType === 'dine_in' ? tableNumber.trim() : undefined,
      items: [...cart],
      subtotal,
      taxAmount,
      serviceChargeAmount,
      total: grandTotal,
      status: 'pending',
      notes: orderNotes.trim() || undefined,
      paymentPreference,
      paymentStatus: paymentPreference === 'qris_online' ? 'waiting_payment' : 'unpaid',
    };

    // Save & send to server so cashier POS receives it in real time
    const result = await onlineOrdersManager.addOrder(newOrder);
    setIsSubmitting(false);

    if (!result.ok) {
      sounds.playError();
      setFormError(result.error || 'Gagal mengirim pesanan ke server kasir. Silakan coba lagi.');
      return;
    }

    sounds.playCashRegister();
    confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.7 },
    });

    setQrisPayError(null);
    setActiveOrder(newOrder);
    setCart([]);
    setIsCartDrawerOpen(false);
  };

  // Automated QRIS Payment Settlement triggered directly in portal
  const handleConfirmAutomatedQrisPayment = async () => {
    if (!activeOrder || isVerifyingQris || activeOrder.paymentStatus === 'paid') return;
    setQrisPayError(null);
    setIsVerifyingQris(true);

    // Brief realistic verification pulse
    await new Promise((r) => setTimeout(r, 700));
    const res = await onlineOrdersManager.payOrderWithQris(activeOrder.id);
    setIsVerifyingQris(false);

    if (!res.ok || !res.order) {
      sounds.playError();
      setQrisPayError(res.error || 'Pembayaran QRIS belum dapat diverifikasi. Coba lagi.');
      return;
    }

    setActiveOrder(res.order);
    setEnlargedQrisModal(null);
    sounds.playCashRegister();
    confetti({
      particleCount: 100,
      spread: 75,
      origin: { y: 0.6 },
    });
  };

  // Download paid QRIS e-receipt as PDF
  const handleDownloadPaidReceiptPdf = async (paidOrder: OnlineOrder) => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      const pdfOrder: Order = {
        id: paidOrder.posOrderId || `ORD-QRIS-${paidOrder.id}`,
        orderNumber: 1,
        timestamp: paidOrder.paidAt || paidOrder.timestamp,
        cashierName: 'QRIS Online Portal',
        customerName: paidOrder.customerName,
        tableNumber: paidOrder.tableNumber,
        orderType: paidOrder.orderType,
        items: paidOrder.items,
        subtotal: paidOrder.subtotal,
        discount: 0,
        discountPercent: 0,
        taxRate: store.enableTax ? store.taxPercentage / 100 : 0,
        taxAmount: paidOrder.taxAmount,
        serviceChargeRate: store.enableServiceCharge ? store.serviceChargePercentage / 100 : 0,
        serviceChargeAmount: paidOrder.serviceChargeAmount,
        total: paidOrder.total,
        paymentMethod: 'qris',
        amountPaid: paidOrder.total,
        change: 0,
        status: 'completed',
        notes: paidOrder.paymentReference ? `Ref: ${paidOrder.paymentReference}` : undefined,
      };
      await generateOrderReceiptPDF(pdfOrder, store, printerConfig);
      sounds.playItemBeep();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  /* =========================================================
   * VIEW: ACTIVE ORDER CONFIRMATION & LIVE STATUS
   * ========================================================= */
  if (activeOrder) {
    const isCancelled = activeOrder.status === 'cancelled';
    const isQrisOrder = activeOrder.paymentPreference === 'qris_online';
    const isQrisPaid = activeOrder.paymentStatus === 'paid';
    const minsLeft = String(Math.floor(qrisSecondsLeft / 60)).padStart(2, '0');
    const secsLeft = String(qrisSecondsLeft % 60).padStart(2, '0');

    const statusSteps = isQrisOrder
      ? [
          {
            key: 'waiting_payment',
            label: 'Menunggu Pembayaran QRIS',
            desc: 'Selesaikan pembayaran menggunakan QRIS Toko di bawah',
          },
          {
            key: 'payment_accepted',
            label: 'Pembayaran Diterima Otomatis',
            desc: 'Sistem otomatis memverifikasi pelunasan QRIS Anda',
          },
          {
            key: 'preparing',
            label: 'Diproses oleh Dapur',
            desc: 'Dapur otomatis menerima & menyiapkan menu Anda',
          },
          {
            key: 'completed',
            label: 'Selesai',
            desc: 'Pesanan siap dinikmati / diambil',
          },
        ]
      : [
          { key: 'pending', label: 'Menunggu Konfirmasi', desc: 'Pesanan masuk ke kasir' },
          { key: 'accepted', label: 'Diterima & Dimasak', desc: 'Dapur sedang memproses menu' },
          { key: 'completed', label: 'Selesai', desc: 'Siap dinikmati / diambil' },
        ];

    const currentStepIdx = isQrisOrder
      ? !isQrisPaid
        ? 0
        : activeOrder.status === 'completed'
        ? 3
        : 2
      : activeOrder.status === 'pending'
      ? 0
      : activeOrder.status === 'accepted' ||
        activeOrder.status === 'preparing' ||
        activeOrder.status === 'ready'
      ? 1
      : 2;

    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between max-w-lg mx-auto shadow-2xl">
        {/* Top Header */}
        <div className="p-4 bg-slate-800/80 border-b border-slate-700 backdrop-blur-md flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center font-bold text-white shadow-md">
              {store.logoUrl ? (
                <img src={store.logoUrl} alt={store.storeName} className="w-full h-full object-contain p-1 rounded-xl" />
              ) : (
                <Store className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="font-extrabold text-sm text-white truncate max-w-[200px]">{store.storeName}</h2>
              <p className={`text-[11px] font-semibold ${isCancelled ? 'text-rose-400' : isQrisOrder && !isQrisPaid ? 'text-amber-300' : 'text-emerald-400'}`}>
                {isCancelled
                  ? 'Pesanan Dibatalkan'
                  : isQrisPaid
                  ? 'Pembayaran Diterima • Diproses Dapur'
                  : isQrisOrder
                  ? 'Menunggu Pembayaran QRIS Toko'
                  : 'Pemesanan Online Berhasil'}
              </p>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-6 flex-1 overflow-y-auto">
          {/* Status Banner */}
          <div className="text-center space-y-2 pt-2">
            {isCancelled ? (
              <>
                <div className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto border-2 border-rose-500/40 animate-in zoom-in duration-300">
                  <AlertCircle className="w-9 h-9" />
                </div>
                <h1 className="text-xl font-black text-white">Pesanan Dibatalkan</h1>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  Mohon maaf, pesanan Anda dibatalkan oleh pihak kasir {store.storeName}.
                  {activeOrder.rejectionReason ? ` Alasan: ${activeOrder.rejectionReason}` : ''}
                </p>
              </>
            ) : isQrisPaid ? (
              <>
                <div className="w-16 h-16 rounded-full bg-emerald-500/25 text-emerald-300 flex items-center justify-center mx-auto border-2 border-emerald-400 animate-in zoom-in duration-300">
                  <ShieldCheck className="w-9 h-9" />
                </div>
                <h1 className="text-xl font-black text-white">Pembayaran Diterima & Diproses Dapur!</h1>
                <p className="text-xs text-emerald-300 max-w-xs mx-auto font-medium">
                  Pembayaran QRIS Anda telah LUNAS otomatis. Dapur {store.storeName} sedang menyiapkan pesanan Anda.
                </p>
              </>
            ) : isQrisOrder ? (
              <>
                <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center mx-auto border-2 border-amber-400/50 animate-pulse">
                  <Clock className="w-9 h-9" />
                </div>
                <h1 className="text-xl font-black text-white">Menunggu Pembayaran QRIS</h1>
                <p className="text-xs text-slate-300 max-w-xs mx-auto">
                  Scan QRIS Toko di bawah ini. Pesanan akan otomatis diterima & diteruskan ke dapur begitu Anda selesai membayar.
                </p>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border-2 border-emerald-500/40 animate-in zoom-in duration-300">
                  <CheckCircle2 className="w-9 h-9" />
                </div>
                <h1 className="text-xl font-black text-white">Pesanan Anda Terkirim!</h1>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  Pesanan telah otomatis masuk ke sistem kasir {store.storeName}.
                </p>
              </>
            )}
          </div>

          {/* Barcode & Order Code Card */}
          <div className="bg-white text-slate-900 rounded-3xl p-5 shadow-2xl text-center space-y-3 relative overflow-hidden">
            <div className={`absolute top-0 inset-x-0 h-2 ${isCancelled ? 'bg-rose-500' : 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600'}`} />
            
            <span className="text-[10px] font-extrabold tracking-widest text-slate-400 uppercase">
              KODE PESANAN ANDA
            </span>
            <div className="text-3xl font-black font-mono tracking-wider text-emerald-700 bg-emerald-50 py-1.5 px-4 rounded-xl inline-block border border-emerald-200">
              {activeOrder.orderCode}
            </div>
            <p className="text-xs font-mono text-slate-500">#{activeOrder.id}</p>

            {/* Generated QR Code for Cashier Scanning */}
            {orderQrDataUrl && !isCancelled && (
              <div className="py-2 flex flex-col items-center">
                <div className="p-2.5 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 shadow-inner inline-block">
                  <img src={orderQrDataUrl} alt="Order QR Code" className="w-36 h-36 object-contain" />
                </div>
                <span className="text-[11px] text-slate-500 mt-2 font-medium">
                  {isQrisPaid
                    ? 'Tunjukkan QR / Kode pesanan ini saat mengambil pesanan'
                    : 'Tunjukkan QR / Kode ini ke kasir jika diperlukan'}
                </span>
              </div>
            )}

            {/* Table & Customer Details */}
            <div className="border-t border-slate-100 pt-3 grid grid-cols-2 gap-2 text-left text-xs text-slate-600">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Pemesan</span>
                <span className="font-bold text-slate-800">{activeOrder.customerName}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  {activeOrder.orderType === 'dine_in' ? 'Nomor Meja' : 'Jenis Pesanan'}
                </span>
                <span className="font-bold text-slate-800">
                  {activeOrder.tableNumber ? `Meja ${activeOrder.tableNumber}` : 'Bawa Pulang'}
                </span>
              </div>
            </div>
          </div>

          {/* QRIS Online Payment Card (when customer selected QRIS Digital) */}
          {activeOrder.paymentPreference === 'qris_online' && !isCancelled && (
            isQrisPaid ? (
              <div className="bg-white text-slate-900 rounded-3xl p-5 shadow-2xl space-y-3.5 border-2 border-emerald-500">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-extrabold uppercase text-emerald-700 block">
                        E-Receipt Pembayaran
                      </span>
                      <h3 className="font-black text-sm text-slate-900">QRIS Digital Otomatis</h3>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-black tracking-wider">
                    LUNAS
                  </span>
                </div>

                <div className="bg-emerald-50/70 rounded-2xl p-3 border border-emerald-200 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total Dibayar</span>
                    <span className="font-black font-mono text-emerald-800 text-sm">
                      {formatRupiah(activeOrder.total)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Ref. Pembayaran</span>
                    <span className="font-mono font-bold text-slate-800">
                      {activeOrder.paymentReference || `QRIS-${activeOrder.orderCode}`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Waktu Lunas</span>
                    <span className="font-mono text-slate-700">
                      {formatDateTime(activeOrder.paidAt || activeOrder.timestamp)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isGeneratingPdf}
                  onClick={() => void handleDownloadPaidReceiptPdf(activeOrder)}
                  className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md"
                >
                  {isGeneratingPdf ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileDown className="w-4 h-4 text-emerald-400" />
                  )}
                  <span>{isGeneratingPdf ? 'Membuat Struk PDF...' : 'Unduh Bukti Bayar (PDF)'}</span>
                </button>
              </div>
            ) : (
              <div className="bg-white text-slate-900 rounded-3xl p-5 shadow-2xl text-center space-y-3 border-2 border-emerald-400">
                <div className="bg-red-600 text-white rounded-xl py-1.5 px-3 flex items-center justify-between">
                  <span className="font-extrabold text-xs tracking-wider">QRIS</span>
                  <span className="text-[10px] font-semibold opacity-95">PEMBAYARAN OTOMATIS</span>
                </div>

                <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl py-1.5 px-3">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Menunggu Pembayaran • Sisa waktu</span>
                  <span className="font-mono font-black text-amber-900">{minsLeft}:{secsLeft}</span>
                </div>

                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    {store.qrisMerchantName || store.storeName}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    NMID: {store.qrisNmid || 'ID102003004005'}
                  </p>
                </div>

                {(store.qrisImageUrl || dynamicQrisUrl) && (
                  <div
                    onClick={() =>
                      setEnlargedQrisModal({
                        imageUrl: store.qrisImageUrl || dynamicQrisUrl,
                        amount: activeOrder.total,
                        label: `Pesanan #${activeOrder.orderCode}`,
                      })
                    }
                    className="p-2.5 bg-slate-50 rounded-2xl border-2 border-slate-200 inline-block cursor-pointer hover:border-emerald-500 transition-colors"
                    title="Ketuk untuk memperbesar QRIS"
                  >
                    <img
                      src={store.qrisImageUrl || dynamicQrisUrl}
                      alt="QRIS Pembayaran"
                      className="w-48 h-48 object-contain mx-auto rounded-lg"
                    />
                  </div>
                )}

                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-2.5">
                  <span className="text-[10px] font-bold uppercase text-emerald-700 block">
                    Total Pembayaran QRIS
                  </span>
                  <span className="text-xl font-black font-mono text-emerald-900">
                    {formatRupiah(activeOrder.total)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setEnlargedQrisModal({
                        imageUrl: store.qrisImageUrl || dynamicQrisUrl,
                        amount: activeOrder.total,
                        label: `Pesanan #${activeOrder.orderCode}`,
                      })
                    }
                    className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                    <span>Perbesar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const img = store.qrisImageUrl || dynamicQrisUrl;
                      if (img) {
                        sounds.playItemBeep();
                        downloadQRImage(img, `QRIS_${activeOrder.orderCode}_${store.storeName.replace(/\s+/g, '_')}`);
                      }
                    }}
                    className="py-2 px-3 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Simpan QRIS</span>
                  </button>
                </div>

                {qrisPayError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold text-left">
                    {qrisPayError}
                  </div>
                )}

                <button
                  type="button"
                  disabled={isVerifyingQris}
                  onClick={() => void handleConfirmAutomatedQrisPayment()}
                  className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                >
                  {isVerifyingQris ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menerima Pembayaran & Mengirim ke Dapur...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Selesai Bayar • Terima & Proses ke Dapur</span>
                    </>
                  )}
                </button>

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Gunakan barcode QRIS Toko di atas via GoPay, OVO, Dana, ShopeePay, BCA, atau m-Banking. Pesanan menunggu sampai pembayaran selesai sebelum diproses oleh dapur.
                </p>
              </div>
            )
          )}

          {/* Live Order Tracker */}
          <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span>Status Pesanan</span>
              <span className={`text-[11px] font-mono ${isCancelled ? 'text-rose-400' : isQrisOrder && !isQrisPaid ? 'text-amber-300' : 'text-emerald-400'}`}>
                {isCancelled
                  ? 'Dibatalkan'
                  : isQrisOrder && !isQrisPaid
                  ? 'Menunggu Pembayaran QRIS'
                  : activeOrder.status === 'pending'
                  ? 'Menunggu Konfirmasi'
                  : activeOrder.status === 'accepted' || activeOrder.status === 'preparing'
                  ? 'Diproses Dapur'
                  : activeOrder.status === 'completed'
                  ? 'Selesai'
                  : 'Diproses'}
              </span>
            </div>

            {isCancelled ? (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200">
                <p className="font-bold">Pesanan ini tidak dapat diproses oleh kasir.</p>
                {activeOrder.rejectionReason && (
                  <p className="mt-1 text-rose-300">Alasan: {activeOrder.rejectionReason}</p>
                )}
                <p className="mt-1 text-slate-300">Silakan buat pesanan baru atau hubungi kasir.</p>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                {statusSteps.map((step, idx) => {
                  const isPassed = idx <= currentStepIdx;
                  const isCurrent = idx === currentStepIdx;

                  return (
                    <div key={step.key} className="flex items-start gap-3">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 transition-all ${
                          isCurrent
                            ? 'bg-emerald-500 text-slate-950 ring-4 ring-emerald-500/30'
                            : isPassed
                            ? 'bg-emerald-700 text-white'
                            : 'bg-slate-700 text-slate-400'
                        }`}
                      >
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold ${isCurrent ? 'text-emerald-300' : isPassed ? 'text-white' : 'text-slate-500'}`}>
                          {step.label}
                        </p>
                        <p className="text-[11px] text-slate-400">{step.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Rincian Pesanan Singkat */}
          <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700 space-y-2 text-xs">
            <span className="text-xs font-bold text-slate-300 block mb-1">Rincian Menu</span>
            {activeOrder.items.map((i, idx) => (
              <div key={idx} className="flex justify-between text-slate-300">
                <span>
                  {i.quantity}x {i.product.name}
                  {i.note && <span className="text-[10px] text-slate-400 block italic pl-3">↳ {i.note}</span>}
                </span>
                <span className="font-mono">{formatNumber(i.product.price * i.quantity)}</span>
              </div>
            ))}
            <div className="border-t border-slate-700 pt-2 flex justify-between font-extrabold text-sm text-white">
              <span>Total Tagihan:</span>
              <span className="text-emerald-400 font-mono">{formatRupiah(activeOrder.total)}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-800/90 border-t border-slate-700 space-y-2">
          <button
            type="button"
            onClick={() => {
              sounds.playItemBeep();
              localStorage.removeItem(STORAGE_KEY_CUSTOMER_ACTIVE_ORDER);
              setActiveOrder(null);
            }}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs sm:text-sm shadow-lg shadow-emerald-600/30 transition-all active:scale-[0.98] cursor-pointer"
          >
            + Buat Pesanan Baru
          </button>
        </div>

        {/* Enlarged QRIS Modal on Active Order Screen */}
        {enlargedQrisModal && (
          <div
            onClick={() => setEnlargedQrisModal(null)}
            className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white text-slate-900 rounded-3xl p-5 max-w-sm w-full text-center shadow-2xl relative space-y-3"
            >
              <button
                type="button"
                onClick={() => setEnlargedQrisModal(null)}
                className="absolute top-3.5 right-3.5 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="bg-red-600 text-white rounded-xl py-1.5 px-3 flex items-center justify-between pr-10">
                <span className="font-extrabold text-xs tracking-wider">QRIS</span>
                <span className="text-[10px] font-semibold">PEMBAYARAN NASIONAL</span>
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900">{store.qrisMerchantName || store.storeName}</h3>
                <p className="text-[11px] text-slate-500 font-mono">NMID: {store.qrisNmid || 'ID102003004005'}</p>
              </div>
              <div className="p-2 bg-white rounded-2xl border-2 border-slate-200 flex items-center justify-center">
                <img src={enlargedQrisModal.imageUrl} alt="QRIS Pembayaran" className="w-full max-h-[300px] object-contain rounded-lg" />
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-2.5">
                <span className="text-[11px] text-slate-600 block">Nominal Pembayaran {enlargedQrisModal.label ? `(${enlargedQrisModal.label})` : ''}:</span>
                <span className="text-xl font-black font-mono text-emerald-800">{formatRupiah(enlargedQrisModal.amount)}</span>
              </div>
              {!isQrisPaid && !isCancelled && activeOrder.paymentPreference === 'qris_online' && (
                <button
                  type="button"
                  disabled={isVerifyingQris}
                  onClick={() => void handleConfirmAutomatedQrisPayment()}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                >
                  {isVerifyingQris ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Memverifikasi Pembayaran...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Saya Sudah Scan • Bayar Otomatis</span>
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  sounds.playItemBeep();
                  downloadQRImage(enlargedQrisModal.imageUrl, `QRIS_${store.storeName.replace(/\s+/g, '_')}`);
                }}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Simpan Gambar QRIS</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* =========================================================
   * VIEW: CATALOG & ORDER PORTAL
   * ========================================================= */
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-28 max-w-lg mx-auto shadow-xl relative">
      {/* Top Banner / Store Header */}
      <header className="bg-gradient-to-r from-emerald-700 to-teal-800 text-white p-4 sticky top-0 z-30 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white text-emerald-800 flex items-center justify-center font-bold text-lg shadow-md shrink-0 overflow-hidden">
              {store.logoUrl ? (
                <img src={store.logoUrl} alt={store.storeName} className="w-full h-full object-contain p-1" />
              ) : (
                <Store className="w-6 h-6 text-emerald-700" />
              )}
            </div>
            <div>
              <h1 className="font-black text-base sm:text-lg leading-tight truncate">{store.storeName}</h1>
              <p className="text-[11px] text-emerald-100 opacity-90 truncate">
                {store.tagline || 'Pesan langsung dari meja tanpa antre'}
              </p>
            </div>
          </div>
        </div>

        {/* Table & Customer Badge Banner */}
        <div className="mt-3 bg-white/10 backdrop-blur-md rounded-xl p-2.5 flex items-center justify-between text-xs border border-white/15">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-xs shadow-2xs">
              {tableNumber ? `M${tableNumber}` : '🍽️'}
            </span>
            <div>
              <span className="text-[10px] text-emerald-200 uppercase font-semibold block">Posisi Pemesanan:</span>
              <span className="font-extrabold text-white text-xs">
                {tableNumber ? `Meja ${tableNumber}` : 'Pilih Meja / Bawa Pulang'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setTableDraft(tableNumber || '01');
              setIsTableModalOpen(true);
            }}
            className="text-[11px] bg-white text-emerald-900 font-bold px-2.5 py-1 rounded-lg hover:bg-emerald-50 shadow-2xs transition-all cursor-pointer"
          >
            {tableNumber ? 'Ubah Meja' : 'Set Meja'}
          </button>
        </div>
      </header>

      {/* Search & Category Filter */}
      <div className="p-4 space-y-3 sticky top-[120px] z-20 bg-slate-50/95 backdrop-blur-md border-b border-slate-200">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kopi, mie, nasi goreng..."
            className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Horizontal Pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                sounds.playItemBeep();
                setSelectedCategory(cat);
              }}
              className={`px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                selectedCategory === cat
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product List */}
      <div className="p-4 space-y-3">
        {filteredProducts.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-6 space-y-2">
            <UtensilsCrossed className="w-10 h-10 text-slate-300 mx-auto" />
            <h3 className="font-bold text-slate-700 text-sm">Menu Tidak Ditemukan</h3>
            <p className="text-xs text-slate-400">Silakan coba kata kunci lain atau pilih kategori lain.</p>
          </div>
        ) : (
          filteredProducts.map((prod) => {
            const inCart = cart.find((i) => i.product.id === prod.id);
            const isOutOfStock = prod.stock <= 0;

            return (
              <div
                key={prod.id}
                className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-2xs hover:shadow-md transition-all flex gap-3 items-center"
              >
                {/* Product Thumbnail */}
                <div className="w-20 h-20 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-100 relative">
                  {prod.image ? (
                    <img src={prod.image} alt={prod.name} className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center font-bold text-white text-xl"
                      style={{ backgroundColor: prod.color || '#059669' }}
                    >
                      {prod.name.charAt(0)}
                    </div>
                  )}
                  {isOutOfStock && (
                    <div className="absolute inset-0 bg-slate-900/70 text-white text-[10px] font-bold flex items-center justify-center">
                      Habis
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">
                    {prod.category}
                  </span>
                  <h3 className="font-extrabold text-sm text-slate-900 truncate">{prod.name}</h3>
                  {prod.description && (
                    <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{prod.description}</p>
                  )}
                  <div className="mt-1 flex items-center justify-between">
                    <span className="font-black text-sm text-emerald-700 font-mono">
                      {formatRupiah(prod.price)}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {isOutOfStock ? 'Stok 0' : `Sisa ${prod.stock}`}
                    </span>
                  </div>

                  {/* Note preview if any */}
                  {inCart?.note && (
                    <div className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md mt-1 truncate">
                      ↳ {inCart.note}
                    </div>
                  )}
                </div>

                {/* Actions (+/- or Add) */}
                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  {inCart ? (
                    <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(prod.id, -1)}
                        className="w-7 h-7 rounded-lg bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center shadow-2xs active:scale-95 transition-all"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center font-extrabold text-xs text-slate-900 font-mono">
                        {inCart.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(prod.id, 1)}
                        disabled={inCart.quantity >= prod.stock}
                        className="w-7 h-7 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white flex items-center justify-center shadow-2xs active:scale-95 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={isOutOfStock}
                      onClick={() => handleAddToCart(prod)}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs shadow-md shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Pesan</span>
                    </button>
                  )}

                  {inCart && (
                    <button
                      type="button"
                      onClick={() =>
                        setActiveItemNoteModal({
                          product: prod,
                          currentNote: inCart.note || '',
                        })
                      }
                      className="text-[10px] text-slate-500 hover:text-emerald-700 font-medium flex items-center gap-0.5 cursor-pointer"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                      <span>{inCart.note ? 'Ubah Catatan' : '+ Catatan'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Sticky Bottom Floating Cart Button */}
      {cart.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 max-w-md mx-auto z-40 animate-in slide-in-from-bottom-4">
          <button
            type="button"
            onClick={() => {
              sounds.playItemBeep();
              setIsCartDrawerOpen(true);
            }}
            className="w-full bg-slate-950/95 hover:bg-slate-900 text-white p-3.5 rounded-2xl shadow-2xl border border-emerald-500/50 backdrop-blur-md flex items-center justify-between transition-all active:scale-[0.99] cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center font-bold text-sm text-white shadow-md relative">
                <ShoppingBag className="w-5 h-5" />
                <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-black border-2 border-slate-950">
                  {totalCartCount}
                </span>
              </div>
              <div className="text-left">
                <span className="text-[10px] uppercase font-semibold text-emerald-400 block">
                  Keranjang ({totalCartCount} Menu)
                </span>
                <span className="text-base font-extrabold text-white font-mono">{formatRupiah(grandTotal)}</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-black text-xs shadow-md">
              <span>Lanjut Pesan</span>
              <Send className="w-3.5 h-3.5" />
            </div>
          </button>
        </div>
      )}

      {/* Customer Cart Checkout Drawer */}
      {isCartDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-white rounded-t-3xl max-w-lg w-full mx-auto max-h-[90vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">Konfirmasi Pemesanan Meja</h3>
                  <p className="text-[11px] text-slate-500">Periksa pesanan Anda sebelum dikirim ke kasir</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCartDrawerOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              {/* Customer Info Form */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700">Identitas Pemesan</span>
                  <div className="flex items-center bg-white rounded-lg p-0.5 border border-slate-200 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setOrderType('dine_in')}
                      className={`px-2.5 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                        orderType === 'dine_in'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Meja
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrderType('takeaway')}
                      className={`px-2.5 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                        orderType === 'takeaway'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Bawa Pulang
                    </button>
                  </div>
                </div>

                <div className={`grid gap-2.5 ${orderType === 'dine_in' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      Nama Anda <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Contoh: Budi"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {orderType === 'dine_in' && (
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                        Nomor Meja <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={tableNumber}
                        onChange={(e) => setTableNumber(e.target.value)}
                        placeholder="Contoh: 05"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Catatan Tambahan untuk Kasir/Dapur (Opsional)
                  </label>
                  <input
                    type="text"
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    placeholder="Contoh: Tolong antar cepat ya, terima kasih"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 block">Daftar Menu ({totalCartCount})</span>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {cart.map((item) => (
                    <div
                      key={item.product.id}
                      className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <span className="font-bold text-slate-800 block truncate">{item.product.name}</span>
                        {item.note && <span className="text-[10px] text-slate-500 italic block">↳ {item.note}</span>}
                        <span className="text-[11px] font-mono text-emerald-700">
                          {formatRupiah(item.product.price * item.quantity)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(item.product.id, -1)}
                          className="w-6 h-6 rounded bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-5 text-center font-bold text-xs">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(item.product.id, 1)}
                          disabled={item.quantity >= item.product.stock}
                          className="w-6 h-6 rounded bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment Preference */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 block">Preferensi Pembayaran</span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playItemBeep();
                      setPaymentPreference('pay_at_cashier');
                    }}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      paymentPreference === 'pay_at_cashier'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800 font-bold ring-2 ring-emerald-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Bayar di Kasir
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      sounds.playItemBeep();
                      setPaymentPreference('qris_online');
                    }}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      paymentPreference === 'qris_online'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800 font-bold ring-2 ring-emerald-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>QRIS Digital</span>
                  </button>
                </div>

                {/* Live QRIS Payment Preview inside Checkout Drawer */}
                {paymentPreference === 'qris_online' && (
                  <div className="bg-white rounded-2xl p-3.5 border-2 border-emerald-300 shadow-xs text-center space-y-2.5 animate-in fade-in duration-200">
                    <div className="bg-red-600 text-white rounded-lg py-1 px-2.5 flex items-center justify-between">
                      <span className="font-extrabold text-[11px] tracking-wider">QRIS</span>
                      <span className="text-[9px] font-semibold opacity-95">QRIS RESMI TOKO</span>
                    </div>

                    <div>
                      <p className="font-extrabold text-xs text-slate-900">
                        {store.qrisMerchantName || store.storeName}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        NMID: {store.qrisNmid || 'ID102003004005'}
                      </p>
                    </div>

                    {(store.qrisImageUrl || dynamicQrisUrl) && (
                      <div
                        onClick={() =>
                          setEnlargedQrisModal({
                            imageUrl: store.qrisImageUrl || dynamicQrisUrl,
                            amount: grandTotal,
                          })
                        }
                        className="p-2 bg-slate-50 rounded-xl border border-slate-200 inline-block cursor-pointer hover:border-emerald-500 transition-colors"
                        title="Ketuk untuk memperbesar QRIS"
                      >
                        <img
                          src={store.qrisImageUrl || dynamicQrisUrl}
                          alt="QRIS Toko"
                          className="w-40 h-40 object-contain mx-auto rounded-lg"
                        />
                      </div>
                    )}

                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2">
                      <span className="text-[10px] text-emerald-700 font-bold uppercase block">
                        Total Bayar QRIS
                      </span>
                      <span className="text-base font-black font-mono text-emerald-900">
                        {formatRupiah(grandTotal)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setEnlargedQrisModal({
                            imageUrl: store.qrisImageUrl || dynamicQrisUrl,
                            amount: grandTotal,
                          })
                        }
                        className="py-1.5 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Maximize2 className="w-3 h-3" />
                        <span>Perbesar QRIS</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const img = store.qrisImageUrl || dynamicQrisUrl;
                          if (img) {
                            sounds.playItemBeep();
                            downloadQRImage(img, `QRIS_${store.storeName.replace(/\s+/g, '_')}`);
                          }
                        }}
                        className="py-1.5 px-2.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3 h-3" />
                        <span>Simpan QRIS</span>
                      </button>
                    </div>

                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Barcode di atas sama dengan QRIS Toko di kasir. Setelah Anda menyelesaikan pembayaran QRIS, pesanan otomatis diterima dan langsung diproses oleh dapur.
                    </p>
                  </div>
                )}
              </div>

              {/* Price Breakdown */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-slate-800">{formatRupiah(subtotal)}</span>
                </div>
                {store.enableTax && (
                  <div className="flex justify-between">
                    <span>Pajak (PPN {store.taxPercentage}%)</span>
                    <span className="font-semibold text-slate-800">{formatRupiah(taxAmount)}</span>
                  </div>
                )}
                {store.enableServiceCharge && (
                  <div className="flex justify-between">
                    <span>Biaya Layanan ({store.serviceChargePercentage}%)</span>
                    <span className="font-semibold text-slate-800">{formatRupiah(serviceChargeAmount)}</span>
                  </div>
                )}
                <div className="border-t border-slate-200 pt-1.5 flex justify-between font-black text-sm text-slate-900">
                  <span>Total Tagihan:</span>
                  <span className="text-emerald-700 font-mono text-base">{formatRupiah(grandTotal)}</span>
                </div>
              </div>
            </div>

            {/* Drawer Submit Action */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-2.5">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => void handleSubmitOrder()}
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 text-white font-extrabold text-sm shadow-xl shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
              >
                {paymentPreference === 'qris_online' ? (
                  <QrCode className="w-4 h-4" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>
                  {isSubmitting
                    ? 'Mengirim Pesanan ke Kasir...'
                    : paymentPreference === 'qris_online'
                    ? 'Buat Pesanan & Bayar QRIS'
                    : 'Kirim Pesanan ke Kasir Sekarang'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Note Modal */}
      {activeItemNoteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-bold text-slate-900 text-sm">Catatan: {activeItemNoteModal.product.name}</h4>
              <button onClick={() => setActiveItemNoteModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Contoh: &quot;Sedikit gula&quot;, &quot;Tanpa sambal&quot;, &quot;Pisah kuah&quot;, dll.
            </p>
            <input
              type="text"
              defaultValue={activeItemNoteModal.currentNote}
              id="customerItemNoteInput"
              autoFocus
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Tulis catatan menu..."
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveItemNoteModal(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const input = document.getElementById('customerItemNoteInput') as HTMLInputElement;
                  handleSaveItemNote(input ? input.value : '');
                }}
                className="px-4 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Table Number Modal */}
      {isTableModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setTableNumber(tableDraft.trim());
              setIsTableModalOpen(false);
              sounds.playItemBeep();
            }}
            className="bg-white rounded-2xl max-w-xs w-full p-5 space-y-4 shadow-2xl border border-slate-200"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="font-bold text-slate-900 text-sm">Atur Nomor Meja</h4>
              <button
                type="button"
                onClick={() => setIsTableModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Masukkan nomor meja Anda:
              </label>
              <input
                type="text"
                value={tableDraft}
                onChange={(e) => setTableDraft(e.target.value)}
                autoFocus
                placeholder="Contoh: 01, 05, VIP 1"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsTableModalOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 cursor-pointer"
              >
                Simpan Meja
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Enlarged QRIS Modal in Catalog/Checkout View */}
      {enlargedQrisModal && (
        <div
          onClick={() => setEnlargedQrisModal(null)}
          className="fixed inset-0 z-60 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white text-slate-900 rounded-3xl p-5 max-w-sm w-full text-center shadow-2xl relative space-y-3"
          >
            <button
              type="button"
              onClick={() => setEnlargedQrisModal(null)}
              className="absolute top-3.5 right-3.5 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="bg-red-600 text-white rounded-xl py-1.5 px-3 flex items-center justify-between pr-10">
              <span className="font-extrabold text-xs tracking-wider">QRIS</span>
              <span className="text-[10px] font-semibold">PEMBAYARAN NASIONAL</span>
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">{store.qrisMerchantName || store.storeName}</h3>
              <p className="text-[11px] text-slate-500 font-mono">NMID: {store.qrisNmid || 'ID102003004005'}</p>
            </div>
            <div className="p-2 bg-white rounded-2xl border-2 border-slate-200 flex items-center justify-center">
              <img src={enlargedQrisModal.imageUrl} alt="QRIS Pembayaran" className="w-full max-h-[300px] object-contain rounded-lg" />
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-2.5">
              <span className="text-[11px] text-slate-600 block">Nominal Pembayaran:</span>
              <span className="text-xl font-black font-mono text-emerald-800">{formatRupiah(enlargedQrisModal.amount)}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                sounds.playItemBeep();
                downloadQRImage(enlargedQrisModal.imageUrl, `QRIS_${store.storeName.replace(/\s+/g, '_')}`);
              }}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Simpan Gambar QRIS</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
