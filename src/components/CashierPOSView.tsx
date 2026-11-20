/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Columns2,
  CreditCard,
  Edit3,
  LayoutGrid,
  Minus,
  Percent,
  Plus,
  Receipt,
  Search,
  ShoppingBag,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { CartItem, Product, StoreProfile } from '../types/pos';
import { formatRupiah } from '../utils/formatters';
import { sounds } from '../utils/soundEffects';

interface CashierPOSViewProps {
  products: Product[];
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  store: StoreProfile;
  customerName: string;
  setCustomerName: (name: string) => void;
  tableNumber: string;
  setTableNumber: (table: string) => void;
  orderType: 'dine_in' | 'takeaway' | 'delivery';
  setOrderType: (type: 'dine_in' | 'takeaway' | 'delivery') => void;
  globalDiscountPercent: number;
  setGlobalDiscountPercent: (discPercent: number) => void;
  lowStockThreshold?: number;
  onOpenPaymentModal: () => void;
}

export const CashierPOSView: React.FC<CashierPOSViewProps> = ({
  products,
  cart,
  setCart,
  store,
  customerName,
  setCustomerName,
  tableNumber,
  setTableNumber,
  orderType,
  setOrderType,
  globalDiscountPercent,
  setGlobalDiscountPercent,
  lowStockThreshold = 10,
  onOpenPaymentModal,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isFullCatalogOnTablet, setIsFullCatalogOnTablet] = useState<boolean>(false);
  const [stockAlertToast, setStockAlertToast] = useState<string | null>(null);
  const [activeItemNoteModal, setActiveItemNoteModal] = useState<{
    index: number;
    currentNote: string;
  } | null>(null);
  const [noteDraft, setNoteDraft] = useState<string>('');
  const [discountModalOpen, setDiscountModalOpen] = useState<boolean>(false);
  const [customDiscountPercent, setCustomDiscountPercent] = useState<string>('');

  // Extract unique categories
  const categories = useMemo(() => {
    const list = Array.from(new Set(products.map((p) => p.category)));
    return ['Semua', ...list];
  }, [products]);

  // Filter products by category and search
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
  const showStockToast = (message: string) => {
    sounds.playError();
    setStockAlertToast(message);
    window.setTimeout(() => setStockAlertToast(null), 3500);
  };

  const handleAddToCart = (product: Product) => {
    if (product.stock <= 0) {
      showStockToast(`Stok untuk "${product.name}" sedang habis (0 pcs).`);
      return;
    }

    const existingItem = cart.find((item) => item.product.id === product.id);
    const currentQty = existingItem ? existingItem.quantity : 0;
    if (currentQty >= product.stock) {
      showStockToast(
        `Maksimal stok tersedia untuk "${product.name}" adalah ${product.stock} pcs.`
      );
      return;
    }

    sounds.playItemBeep();
    setCart((prev) => {
      const existingIdx = prev.findIndex((item) => item.product.id === product.id);
      if (existingIdx >= 0) {
        return prev.map((item, idx) =>
          idx === existingIdx ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1, discount: 0 }];
    });
  };

  const handleUpdateQuantity = (index: number, delta: number) => {
    const target = cart[index];
    if (!target) return;

    const latestProduct = products.find((p) => p.id === target.product.id);
    const availableStock = latestProduct ? latestProduct.stock : target.product.stock;
    const newQty = target.quantity + delta;

    if (delta > 0 && newQty > availableStock) {
      showStockToast(
        `Jumlah "${target.product.name}" tidak boleh melebihi stok (${availableStock} pcs).`
      );
      return;
    }

    sounds.playItemBeep();
    setCart((prev) => {
      if (newQty <= 0) {
        return prev.filter((_, idx) => idx !== index);
      }
      return prev.map((item, idx) => (idx === index ? { ...item, quantity: newQty } : item));
    });
  };

  const handleProceedToCheckout = () => {
    for (const item of cart) {
      const latestProd = products.find((p) => p.id === item.product.id);
      const avail = latestProd ? latestProd.stock : item.product.stock;
      if (item.quantity > avail) {
        showStockToast(
          `Stok "${item.product.name}" hanya tersisa ${avail} pcs. Kurangi jumlah sebelum bayar.`
        );
        return;
      }
    }
    onOpenPaymentModal();
  };

  const handleSaveItemNote = (noteText: string) => {
    if (activeItemNoteModal !== null) {
      const targetIdx = activeItemNoteModal.index;
      setCart((prev) =>
        prev.map((item, idx) =>
          idx === targetIdx ? { ...item, note: noteText.trim().slice(0, 300) } : item
        )
      );
      setActiveItemNoteModal(null);
      setNoteDraft('');
    }
  };

  // Calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.price * item.quantity - (item.discount || 0), 0);
  }, [cart]);

  // Derived nominal discount amount from percentage
  const globalDiscountAmount = useMemo(() => {
    return Math.round(subtotal * (globalDiscountPercent / 100));
  }, [subtotal, globalDiscountPercent]);

  const taxAmount = useMemo(() => {
    if (!store.enableTax) return 0;
    const base = Math.max(0, subtotal - globalDiscountAmount);
    return Math.round(base * (store.taxPercentage / 100));
  }, [subtotal, globalDiscountAmount, store.enableTax, store.taxPercentage]);

  const serviceChargeAmount = useMemo(() => {
    if (!store.enableServiceCharge) return 0;
    const base = Math.max(0, subtotal - globalDiscountAmount);
    return Math.round(base * (store.serviceChargePercentage / 100));
  }, [subtotal, globalDiscountAmount, store.enableServiceCharge, store.serviceChargePercentage]);

  const grandTotal = useMemo(() => {
    return Math.max(0, subtotal - globalDiscountAmount + taxAmount + serviceChargeAmount);
  }, [subtotal, globalDiscountAmount, taxAmount, serviceChargeAmount]);

  const totalCartCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-5">
      {/* Toast Alert for Out of Stock */}
      {stockAlertToast && (
        <div className="mb-4 p-3.5 bg-rose-600 text-white rounded-xl shadow-lg flex items-center justify-between text-xs sm:text-sm font-bold animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{stockAlertToast}</span>
          </div>
          <button
            onClick={() => setStockAlertToast(null)}
            className="text-white/80 hover:text-white px-2 cursor-pointer font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Product Catalog & Cart Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 lg:gap-6 items-start">
        {/* Left: Product Catalog */}
        <div className={`${isFullCatalogOnTablet ? 'col-span-12' : 'col-span-1 md:col-span-7 xl:col-span-8'} space-y-4`}>
          {/* Search & Category Pills */}
          <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={searchQuery}
                  maxLength={100}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama menu atau kode produk..."
                  className="w-full pl-10 pr-8 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Tablet view mode toggle */}
              <button
                type="button"
                onClick={() => setIsFullCatalogOnTablet(!isFullCatalogOnTablet)}
                className="hidden md:flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold shrink-0 cursor-pointer transition-all active:scale-95"
                title={isFullCatalogOnTablet ? 'Kembali ke mode kasir belah layar' : 'Tampilkan katalog menu layar penuh'}
              >
                {isFullCatalogOnTablet ? (
                  <>
                    <Columns2 className="w-4 h-4 text-emerald-600" />
                    <span className="hidden lg:inline">Mode Belah Layar</span>
                  </>
                ) : (
                  <>
                    <LayoutGrid className="w-4 h-4 text-emerald-600" />
                    <span className="hidden lg:inline">Katalog Penuh</span>
                  </>
                )}
              </button>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none touch-pan-x">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setSelectedCategory(cat);
                    sounds.playItemBeep();
                  }}
                  className={`px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all cursor-pointer active:scale-95 select-none ${
                    selectedCategory === cat
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product Cards Grid */}
          <div className={`grid gap-3 sm:gap-4 ${
            isFullCatalogOnTablet
              ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
              : 'grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
          }`}>
            {filteredProducts.map((product) => {
              const inCart = cart.find((i) => i.product.id === product.id);
              const isOutOfStock = product.stock <= 0;
              const isLowStock = product.stock > 0 && product.stock <= lowStockThreshold;

              return (
                <div
                  key={product.id}
                  onClick={() => handleAddToCart(product)}
                  className={`group bg-white rounded-2xl border transition-all duration-200 overflow-hidden cursor-pointer select-none flex flex-col justify-between hover:shadow-md relative active:scale-[0.98] ${
                    inCart
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                      : isOutOfStock
                      ? 'border-rose-300 opacity-70 bg-rose-50/10'
                      : isLowStock
                      ? 'border-amber-400 ring-1 ring-amber-400/40 bg-amber-50/10 hover:border-amber-500'
                      : 'border-slate-200 shadow-xs hover:border-emerald-300'
                  }`}
                >
                  {/* Badge for quantity in cart */}
                  {inCart && (
                    <div className="absolute top-2 right-2 z-10 bg-emerald-600 text-white font-bold text-xs px-2 py-0.5 rounded-full shadow-md animate-in zoom-in-75">
                      {inCart.quantity}x
                    </div>
                  )}

                  {/* Stock Status Badge Overlay */}
                  {isOutOfStock ? (
                    <div className="absolute top-2 left-2 z-10 bg-rose-600 text-white font-black text-[9px] px-2 py-0.5 rounded-full shadow-md border border-white/50 animate-pulse">
                      ❌ Habis
                    </div>
                  ) : isLowStock ? (
                    <div className="absolute top-2 left-2 z-10 bg-amber-500 text-slate-950 font-black text-[9px] px-2 py-0.5 rounded-full shadow-md border border-white/60">
                      ⚠️ Sisa {product.stock}!
                    </div>
                  ) : null}

                  {/* Product Image */}
                  <div className="h-32 sm:h-36 w-full bg-slate-100 overflow-hidden relative">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-white font-bold text-2xl"
                        style={{ backgroundColor: product.color || '#10b981' }}
                      >
                        {product.name.charAt(0)}
                      </div>
                    )}
                    <span className="absolute bottom-2 left-2 text-[10px] font-semibold bg-black/60 text-white px-2 py-0.5 rounded backdrop-blur-xs">
                      {product.category}
                    </span>
                  </div>

                  {/* Product Info */}
                  <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs sm:text-sm line-clamp-1 group-hover:text-emerald-700 transition-colors">
                        {product.name}
                      </h4>
                      {product.description && (
                        <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                          {product.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <div>
                        <span className="font-extrabold text-xs sm:text-sm text-slate-900 block">
                          {formatRupiah(product.price)}
                        </span>
                        {isLowStock && (
                          <span className="text-[10px] font-bold text-amber-700">
                            Stok: {product.stock}
                          </span>
                        )}
                      </div>

                      <span
                        className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 ${
                          isOutOfStock
                            ? 'bg-rose-100 text-rose-700 text-[10px]'
                            : isLowStock
                            ? 'bg-amber-100 text-amber-900 hover:bg-amber-500 hover:text-white'
                            : 'bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white'
                        }`}
                      >
                        {isOutOfStock ? 'Habis' : '+'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredProducts.length === 0 && (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
              <UtensilsCrossed className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">Tidak ada produk ditemukan</p>
              <p className="text-xs text-slate-400 mt-1">Coba gunakan kata kunci lain atau pilih kategori Semua.</p>
            </div>
          )}
        </div>

        {/* Right: Cashier Order Cart & Checkout Panel */}
        <div
          id="pos-cart-panel"
          className={`${
            isFullCatalogOnTablet
              ? 'hidden'
              : 'col-span-1 md:col-span-5 xl:col-span-4'
          } bg-white rounded-2xl border border-slate-200 shadow-md flex flex-col md:sticky md:top-20 md:max-h-[calc(100vh-5.5rem)]`}
        >
          {/* Order Header / Customer Info */}
          <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-slate-50 rounded-t-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-600" />
                <h3 className="font-bold text-slate-900 text-sm">Pesanan Baru</h3>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Kosongkan</span>
                </button>
              )}
            </div>

            {/* Order Type Toggle (Dine In / Takeaway) */}
            <div className="grid grid-cols-2 gap-1.5 bg-slate-200/70 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setOrderType('dine_in')}
                className={`py-2 px-2.5 rounded-lg transition-all cursor-pointer select-none active:scale-95 ${
                  orderType === 'dine_in'
                    ? 'bg-white text-emerald-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🍽️ Makan di Tempat
              </button>
              <button
                type="button"
                onClick={() => setOrderType('takeaway')}
                className={`py-2 px-2.5 rounded-lg transition-all cursor-pointer select-none active:scale-95 ${
                  orderType === 'takeaway'
                    ? 'bg-white text-emerald-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🛍️ Bawa Pulang
              </button>
            </div>

            {/* Customer & Table Inputs */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Pelanggan</label>
                <input
                  type="text"
                  value={customerName}
                  maxLength={120}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nama (opsional)"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">
                  {orderType === 'dine_in' ? 'No. Meja' : 'No. Antrian'}
                </label>
                <input
                  type="text"
                  value={tableNumber}
                  maxLength={40}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder={orderType === 'dine_in' ? 'Contoh: 05' : 'Contoh: A-12'}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Cart Item List (Scrollable) */}
          <div className="p-3.5 sm:p-4 overflow-y-auto flex-1 divide-y divide-slate-100 max-h-72 md:max-h-[calc(100vh-22rem)]">
            {cart.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <ShoppingBag className="w-10 h-10 mx-auto text-slate-300" />
                <p className="text-xs font-semibold text-slate-600">Keranjang masih kosong</p>
                <p className="text-[11px] text-slate-400">Klik menu di sebelah kiri untuk menambahkan pesanan.</p>
              </div>
            ) : (
              cart.map((item, index) => {
                const isLowStock = item.product.stock > 0 && item.product.stock <= lowStockThreshold;
                const isExceedingStock = item.quantity > item.product.stock;

                return (
                  <div key={`${item.product.id}-${index}`} className="py-2.5 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs text-slate-800 truncate">{item.product.name}</div>
                        <div className="text-[11px] text-slate-500">{formatRupiah(item.product.price)} / pcs</div>

                        {/* Low stock or stock exceed badge in cart */}
                        {isExceedingStock ? (
                          <div className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md flex items-center gap-1 mt-1">
                            <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
                            <span>Melebihi stok! (Tersedia: {item.product.stock} pcs)</span>
                          </div>
                        ) : isLowStock ? (
                          <div className="text-[10px] font-bold text-amber-900 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-md flex items-center gap-1 mt-1">
                            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                            <span>Stok menipis: sisa {item.product.stock} pcs</span>
                          </div>
                        ) : null}

                        {item.note && (
                          <div className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded inline-block mt-0.5 font-medium">
                            Catatan: {item.note}
                          </div>
                        )}
                      </div>

                      {/* Quantity controls with touch-friendly targets */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(index, -1)}
                          className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 flex items-center justify-center transition-all active:scale-90 cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-8 text-center text-xs sm:text-sm font-bold text-slate-800 font-mono">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(index, 1)}
                          className="w-8 h-8 rounded-lg bg-emerald-100 hover:bg-emerald-200 active:bg-emerald-300 text-emerald-800 flex items-center justify-center transition-all active:scale-90 font-bold cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setNoteDraft(item.note || '');
                          setActiveItemNoteModal({
                            index,
                            currentNote: item.note || '',
                          });
                        }}
                        className="text-[10px] text-slate-500 hover:text-emerald-700 flex items-center gap-1"
                      >
                        <Edit3 className="w-2.5 h-2.5" />
                        <span>{item.note ? 'Ubah Catatan' : '+ Catatan/Request'}</span>
                      </button>
                      <span className="font-bold text-xs text-slate-900">
                        {formatRupiah(item.product.price * item.quantity)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Cart Pricing Summary & Checkout Button */}
          <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl space-y-3">
            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Subtotal ({totalCartCount} item)</span>
                <span className="font-semibold text-slate-900">{formatRupiah(subtotal)}</span>
              </div>

              {/* Discount Row */}
              <div className="flex justify-between items-center text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setCustomDiscountPercent(globalDiscountPercent > 0 ? String(globalDiscountPercent) : '');
                    setDiscountModalOpen(true);
                  }}
                  className="text-emerald-700 hover:text-emerald-800 flex items-center gap-1.5 font-semibold group cursor-pointer"
                >
                  <span className="w-4 h-4 rounded bg-emerald-100 group-hover:bg-emerald-200 text-emerald-700 flex items-center justify-center transition-colors">
                    <Percent className="w-2.5 h-2.5" />
                  </span>
                  <span>
                    {globalDiscountPercent > 0
                      ? `Diskon Nota (${globalDiscountPercent}%)`
                      : '+ Tambah Diskon (%)'}
                  </span>
                </button>
                {globalDiscountPercent > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-emerald-700">-{formatRupiah(globalDiscountAmount)}</span>
                    <button
                      type="button"
                      onClick={() => setGlobalDiscountPercent(0)}
                      className="text-slate-400 hover:text-rose-600 p-0.5 rounded transition-colors cursor-pointer"
                      title="Hapus diskon"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Optional Tax */}
              {store.enableTax && (
                <div className="flex justify-between">
                  <span>Pajak (PPN {store.taxPercentage}%)</span>
                  <span className="font-semibold text-slate-900">{formatRupiah(taxAmount)}</span>
                </div>
              )}

              {/* Optional Service Charge */}
              {store.enableServiceCharge && (
                <div className="flex justify-between">
                  <span>Biaya Layanan ({store.serviceChargePercentage}%)</span>
                  <span className="font-semibold text-slate-900">{formatRupiah(serviceChargeAmount)}</span>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 pt-2 flex items-center justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Pembayaran</span>
                <span className="text-xl font-extrabold text-slate-900">{formatRupiah(grandTotal)}</span>
              </div>

              <button
                type="button"
                onClick={handleProceedToCheckout}
                disabled={cart.length === 0}
                className={`py-3 px-5 rounded-xl font-bold text-sm text-white shadow-md flex items-center gap-2 transition-all active:scale-[0.98] ${
                  cart.length === 0
                    ? 'bg-slate-300 cursor-not-allowed text-slate-500 shadow-none'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Bayar Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Item Note Modal */}
      {activeItemNoteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b pb-2">
              <h4 className="font-bold text-slate-900 text-sm">Catatan Khusus Produk</h4>
              <button onClick={() => setActiveItemNoteModal(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Contoh: &quot;Sedikit gula&quot;, &quot;Tanpa bawang&quot;, &quot;Pisah sambal&quot;, dll.
            </p>
            <input
              type="text"
              value={noteDraft}
              maxLength={300}
              onChange={(e) => setNoteDraft(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Ketik catatan..."
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setActiveItemNoteModal(null);
                  setNoteDraft('');
                }}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleSaveItemNote(noteDraft)}
                className="px-4 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discount Modal (Persenan %) */}
      {discountModalOpen && (() => {
        const parsedPercent = Math.min(100, Math.max(0, parseFloat(customDiscountPercent) || 0));
        const previewDiscountRupiah = Math.round(subtotal * (parsedPercent / 100));
        const previewSubtotalAfter = Math.max(0, subtotal - previewDiscountRupiah);

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <Percent className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">Diskon Nota / Promosi</h4>
                    <p className="text-[11px] text-slate-500">Berlaku dalam persentase (%) total belanja</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDiscountModalOpen(false)}
                  className="w-7 h-7 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Input Persentase */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700">Persentase Diskon (%)</label>
                  <span className="text-[11px] text-slate-400">Rentang: 1% – 100%</span>
                </div>

                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={customDiscountPercent}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === '') {
                        setCustomDiscountPercent('');
                      } else {
                        const num = parseFloat(val);
                        if (isNaN(num)) {
                          setCustomDiscountPercent('');
                        } else if (num > 100) {
                          setCustomDiscountPercent('100');
                        } else if (num < 0) {
                          setCustomDiscountPercent('0');
                        } else {
                          setCustomDiscountPercent(val);
                        }
                      }
                    }}
                    placeholder="Contoh: 10"
                    autoFocus
                    className="w-full pl-3 pr-10 py-2.5 border-2 border-emerald-500/60 rounded-xl text-base font-extrabold text-slate-900 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 font-mono"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-emerald-700 font-extrabold text-sm">
                    %
                  </div>
                </div>

                {/* Quick Preset Percentage Chips */}
                <div>
                  <span className="text-[11px] text-slate-500 font-medium block mb-1.5">Pilihan Cepat:</span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[5, 10, 15, 20, 25, 30, 50, 100].map((val) => {
                      const isSelected = parsedPercent === val && customDiscountPercent !== '';
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => {
                            sounds.playItemBeep();
                            setCustomDiscountPercent(String(val));
                          }}
                          className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                            isSelected
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {val}%
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Live Preview Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal Belanja:</span>
                  <span className="font-semibold text-slate-800">{formatRupiah(subtotal)}</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>Potongan Diskon ({parsedPercent}%):</span>
                  <span>-{formatRupiah(previewDiscountRupiah)}</span>
                </div>
                <div className="border-t border-slate-200 pt-1.5 flex justify-between text-slate-900 font-extrabold">
                  <span>Setelah Diskon:</span>
                  <span className="text-sm font-mono text-emerald-800">{formatRupiah(previewSubtotalAfter)}</span>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex justify-between items-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    sounds.playItemBeep();
                    setGlobalDiscountPercent(0);
                    setDiscountModalOpen(false);
                  }}
                  className="text-xs text-rose-600 hover:text-rose-700 font-semibold cursor-pointer hover:underline"
                >
                  Hapus Diskon (0%)
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDiscountModalOpen(false)}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setGlobalDiscountPercent(parsedPercent);
                      if (parsedPercent > 0) sounds.playCashRegister();
                      setDiscountModalOpen(false);
                    }}
                    className="px-4 py-2 text-xs font-bold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 shadow-md shadow-emerald-600/20 transition-all active:scale-95 cursor-pointer"
                  >
                    Terapkan Diskon
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Mobile & Full-Catalog Mode Floating Cart Bar */}
      {cart.length > 0 && (
        <div
          className={`${
            isFullCatalogOnTablet ? 'block' : 'md:hidden'
          } fixed bottom-4 left-4 right-4 z-40 bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-2xl shadow-2xl border border-emerald-600/40 flex items-center justify-between animate-in slide-in-from-bottom-4`}
        >
          <div
            onClick={() => {
              if (isFullCatalogOnTablet) {
                setIsFullCatalogOnTablet(false);
              } else {
                document.getElementById('pos-cart-panel')?.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            className="flex items-center gap-3 cursor-pointer select-none"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center font-bold text-sm relative">
              <ShoppingBag className="w-5 h-5 text-white" />
              <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-black border-2 border-slate-900">
                {totalCartCount}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-emerald-300 uppercase font-semibold block">Total ({totalCartCount} item)</span>
              <span className="text-base font-extrabold text-white font-mono">{formatRupiah(grandTotal)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isFullCatalogOnTablet && (
              <button
                type="button"
                onClick={() => setIsFullCatalogOnTablet(false)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 cursor-pointer"
              >
                Lihat Keranjang
              </button>
            )}
            <button
              type="button"
              onClick={handleProceedToCheckout}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-emerald-950 font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-lg active:scale-95 transition-all cursor-pointer"
            >
              <CreditCard className="w-4 h-4" />
              <span>Bayar</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
