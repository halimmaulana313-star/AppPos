/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Edit3,
  Flame,
  Minus,
  Plus,
  QrCode,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Store,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { CartItem, OnlineOrder, Product, StoreProfile } from '../types/pos';
import { formatNumber, formatRupiah, formatTimeOnly } from '../utils/formatters';
import { sounds } from '../utils/soundEffects';
import { generateQRCodeDataUrl } from '../utils/qrCodeGenerator';
import {
  onlineOrdersManager,
  STORAGE_KEY_CUSTOMER_ACTIVE_ORDER,
} from '../utils/onlineOrdersManager';

interface CustomerOrderPortalProps {
  products: Product[];
  store: StoreProfile;
  initialTable?: string;
  onExitPortal?: () => void;
}

export const CustomerOrderPortal: React.FC<CustomerOrderPortalProps> = ({
  products,
  store,
  initialTable = '',
  onExitPortal,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [tableNumber, setTableNumber] = useState<string>(initialTable || '');
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway'>('dine_in');
  const [orderNotes, setOrderNotes] = useState<string>('');
  const [paymentPreference, setPaymentPreference] = useState<'pay_at_cashier' | 'qris_online'>('pay_at_cashier');
  const [formError, setFormError] = useState<string | null>(null);

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

  // Listen to order status updates in real-time
  useEffect(() => {
    const unsubscribe = onlineOrdersManager.subscribe((orders) => {
      if (activeOrder) {
        const match = orders.find((o) => o.id === activeOrder.id);
        if (match && match.status !== activeOrder.status) {
          setActiveOrder(match);
          if (match.status === 'accepted') {
            sounds.playItemBeep();
          } else if (match.status === 'completed') {
            sounds.playCashRegister();
          }
        }
      }
    });
    return () => unsubscribe();
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

  // Submit Order to Cashier
  const handleSubmitOrder = () => {
    if (cart.length === 0) return;
    if (!customerName.trim()) {
      setFormError('Silakan masukkan nama pemesan terlebih dahulu.');
      sounds.playError();
      return;
    }
    if (orderType === 'dine_in' && !tableNumber.trim()) {
      setFormError('Silakan masukkan nomor meja Anda.');
      sounds.playError();
      return;
    }
    setFormError(null);

    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const existingOrders = onlineOrdersManager.getOrders();
    const orderNumber = existingOrders.length + 1;
    const orderId = `ONL-${dateStr}-${String(orderNumber).padStart(3, '0')}`;
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
    };

    // Save & broadcast to cashier
    onlineOrdersManager.addOrder(newOrder);
    sounds.playCashRegister();
    confetti({
      particleCount: 70,
      spread: 60,
      origin: { y: 0.7 },
    });

    setActiveOrder(newOrder);
    setCart([]);
    setIsCartDrawerOpen(false);
  };

  /* =========================================================
   * VIEW: ACTIVE ORDER CONFIRMATION & LIVE STATUS
   * ========================================================= */
  if (activeOrder) {
    const statusSteps = [
      { key: 'pending', label: 'Menunggu Konfirmasi', desc: 'Pesanan masuk ke kasir' },
      { key: 'accepted', label: 'Diterima & Dimasak', desc: 'Dapur sedang memproses menu' },
      { key: 'completed', label: 'Selesai', desc: 'Siap dinikmati / diambil' },
    ];

    const isCancelled = activeOrder.status === 'cancelled';
    const currentStepIdx =
      activeOrder.status === 'pending'
        ? 0
        : activeOrder.status === 'accepted' || activeOrder.status === 'preparing' || activeOrder.status === 'ready'
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
              <p className={`text-[11px] font-semibold ${isCancelled ? 'text-rose-400' : 'text-emerald-400'}`}>
                {isCancelled ? 'Pesanan Dibatalkan' : 'Pemesanan Online Berhasil'}
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
                  Tunjukkan QR / Kode ini ke kasir saat pembayaran
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

          {/* Live Order Tracker */}
          <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span>Status Pesanan</span>
              <span className={`text-[11px] font-mono ${isCancelled ? 'text-rose-400' : 'text-emerald-400'}`}>
                {activeOrder.status === 'pending'
                  ? 'Menunggu Konfirmasi'
                  : activeOrder.status === 'accepted'
                  ? 'Diterima Kasir'
                  : activeOrder.status === 'completed'
                  ? 'Selesai'
                  : activeOrder.status === 'cancelled'
                  ? 'Dibatalkan'
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

      {/* Return to Cashier link if in test/preview mode */}
      {onExitPortal && (
        <div className="text-center py-6 pb-28">
          <button
            type="button"
            onClick={onExitPortal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-200/90 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 border border-slate-300"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali ke Aplikasi Kasir (Uji Coba)</span>
          </button>
        </div>
      )}

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
                <span className="text-xs font-bold text-slate-700 block">Identitas Pemesan</span>

                <div className="grid grid-cols-2 gap-2.5">
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
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-700 block">Preferensi Pembayaran</span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setPaymentPreference('pay_at_cashier')}
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
                    onClick={() => setPaymentPreference('qris_online')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      paymentPreference === 'qris_online'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800 font-bold ring-2 ring-emerald-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    QRIS Digital
                  </button>
                </div>
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
                onClick={handleSubmitOrder}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-sm shadow-xl shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>Kirim Pesanan ke Kasir Sekarang</span>
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
    </div>
  );
};
