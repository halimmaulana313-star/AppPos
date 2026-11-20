/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Edit2,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Product } from '../types/pos';
import { formatRupiah } from '../utils/formatters';
import { sanitizeSafeImageUrl } from '../utils/sanitize';
import { sounds } from '../utils/soundEffects';

interface ProductManagementViewProps {
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  lowStockThreshold?: number;
  isMaster?: boolean;
}

export const ProductManagementView: React.FC<ProductManagementViewProps> = ({
  products,
  setProducts,
  lowStockThreshold = 10,
  isMaster = true,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('Semua');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('Kopi & Minuman');
  const [formPrice, setFormPrice] = useState<number>(15000);
  const [formCostPrice, setFormCostPrice] = useState<number>(7000);
  const [formStock, setFormStock] = useState<number>(50);
  const [formSku, setFormSku] = useState('');
  const [formImage, setFormImage] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'low' | 'out'>('all');

  const lowStockProducts = useMemo(() => {
    return products.filter((p) => p.stock > 0 && p.stock <= lowStockThreshold);
  }, [products, lowStockThreshold]);

  const outOfStockProducts = useMemo(() => {
    return products.filter((p) => p.stock <= 0);
  }, [products]);

  const categories = useMemo(() => {
    const list = Array.from(new Set(products.map((p) => p.category)));
    return ['Semua', ...list];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = categoryFilter === 'Semua' || p.category === categoryFilter;
      const matchSearch =
        !searchQuery.trim() ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase());

      let matchStock = true;
      if (stockStatusFilter === 'low') {
        matchStock = p.stock > 0 && p.stock <= lowStockThreshold;
      } else if (stockStatusFilter === 'out') {
        matchStock = p.stock <= 0;
      }

      return matchCat && matchSearch && matchStock;
    });
  }, [products, categoryFilter, searchQuery, stockStatusFilter, lowStockThreshold]);

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setFormName('');
    setFormCategory('Kopi & Minuman');
    setFormPrice(15000);
    setFormCostPrice(7000);
    setFormStock(50);
    setFormSku(`PRD-${Math.floor(100 + Math.random() * 900)}`);
    setFormImage('https://images.unsplash.com/photo-1541167760496-1628856ab772?w=500&auto=format&fit=crop&q=80');
    setFormDescription('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setFormName(p.name);
    setFormCategory(p.category);
    setFormPrice(p.price);
    setFormCostPrice(p.costPrice || 0);
    setFormStock(p.stock);
    setFormSku(p.sku);
    setFormImage(p.image || '');
    setFormDescription(p.description || '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const [productToDelete, setProductToDelete] = useState<{ id: string; name: string } | null>(null);

  const handleDelete = (id: string, name: string) => {
    setProductToDelete({ id, name });
  };

  const confirmDeleteProduct = () => {
    if (productToDelete) {
      setProducts((prev) => prev.filter((p) => p.id !== productToDelete.id));
      sounds.playError();
      setProductToDelete(null);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = formName.trim().slice(0, 140);
    if (!trimmedName) {
      setFormError('Nama produk wajib diisi.');
      return;
    }

    const safePrice = Math.round(Math.min(1_000_000_000, Math.max(0, Number(formPrice) || 0)));
    const safeCostPrice = Math.round(
      Math.min(1_000_000_000, Math.max(0, Number(formCostPrice) || 0))
    );
    const safeStock = Math.floor(Math.min(1_000_000, Math.max(0, Number(formStock) || 0)));
    const safeSku =
      formSku.trim().slice(0, 60) ||
      (editingProduct ? editingProduct.sku : `SKU-${Date.now().toString().slice(-4)}`);
    const safeDesc = formDescription.trim().slice(0, 500);

    let validatedImage: string | undefined;
    if (formImage.trim()) {
      const checked = sanitizeSafeImageUrl(formImage.trim(), {
        allowPresetSvg: false,
        maxLength: 300_000,
      });
      if (!checked) {
        setFormError('URL foto tidak valid. Gunakan URL https:// yang valid.');
        sounds.playError();
        return;
      }
      validatedImage = checked;
    }

    if (editingProduct) {
      // Update
      setProducts((prev) =>
        prev.map((p) =>
          p.id === editingProduct.id
            ? {
                ...p,
                name: trimmedName,
                category: formCategory,
                price: safePrice,
                costPrice: safeCostPrice,
                stock: safeStock,
                sku: safeSku,
                image: validatedImage,
                description: safeDesc,
              }
            : p
        )
      );
    } else {
      // Create new
      const newProduct: Product = {
        id: `prod-${Date.now()}`,
        name: trimmedName,
        category: formCategory,
        price: safePrice,
        costPrice: safeCostPrice,
        stock: safeStock,
        sku: safeSku,
        image: validatedImage,
        description: safeDesc,
      };
      setProducts((prev) => [newProduct, ...prev]);
    }

    setIsModalOpen(false);
    sounds.playItemBeep();
  };

  const handleAdjustStock = (id: string, delta: number) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, stock: Math.max(0, p.stock + delta) } : p))
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Katalog & Stok Produk</span>
            <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2.5 py-0.5 rounded-full">
              {products.length} Menu
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Kelola daftar menu, harga jual, harga modal (HPP), dan ketersediaan stok kasir.
          </p>
        </div>

        {isMaster ? (
          <button
            onClick={handleOpenAdd}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Menu Baru</span>
          </button>
        ) : (
          <div className="text-xs bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5">
            <span>🔒 Mode Kasir: Hanya Lihat</span>
          </div>
        )}
      </div>

      {/* Low Stock Notification Banner */}
      {(lowStockProducts.length > 0 || outOfStockProducts.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-xs sm:text-sm text-slate-900 flex items-center gap-2">
                <span>Peringatan Ketersediaan Stok</span>
                {outOfStockProducts.length > 0 && (
                  <span className="bg-rose-100 text-rose-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                    {outOfStockProducts.length} Habis
                  </span>
                )}
                {lowStockProducts.length > 0 && (
                  <span className="bg-amber-200 text-amber-900 text-[10px] px-2 py-0.5 rounded-full font-bold">
                    {lowStockProducts.length} Menipis (≤{lowStockThreshold} pcs)
                  </span>
                )}
              </h4>
              <p className="text-xs text-slate-600 mt-0.5">
                Beberapa menu memerlukan restok bahan baku agar pesanan kasir tidak terkendala.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setStockStatusFilter((prev) => (prev === 'low' ? 'all' : 'low'))}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                stockStatusFilter === 'low'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white border border-amber-300 text-amber-900 hover:bg-amber-100/60'
              }`}
            >
              {stockStatusFilter === 'low' ? 'Tampilkan Semua' : 'Filter Stok Menipis'}
            </button>

            {outOfStockProducts.length > 0 && (
              <button
                onClick={() => setStockStatusFilter((prev) => (prev === 'out' ? 'all' : 'out'))}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  stockStatusFilter === 'out'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-white border border-rose-300 text-rose-800 hover:bg-rose-100/60'
                }`}
              >
                {stockStatusFilter === 'out' ? 'Tampilkan Semua' : 'Filter Stok Habis'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            maxLength={100}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama menu atau SKU..."
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                categoryFilter === cat
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredProducts.map((p) => {
          const margin = p.price - (p.costPrice || 0);
          const marginPct = p.price > 0 ? Math.round((margin / p.price) * 100) : 0;
          const isOutOfStock = p.stock <= 0;
          const isLowStock = p.stock > 0 && p.stock <= lowStockThreshold;

          return (
            <div
              key={p.id}
              className={`bg-white rounded-2xl border shadow-xs overflow-hidden flex flex-col justify-between hover:shadow-md transition-all ${
                isOutOfStock
                  ? 'border-rose-300 ring-2 ring-rose-500/20 bg-rose-50/10'
                  : isLowStock
                  ? 'border-amber-400 ring-2 ring-amber-500/20 bg-amber-50/10'
                  : 'border-slate-200'
              }`}
            >
              <div>
                <div className="h-36 bg-slate-100 relative overflow-hidden">
                  {p.image ? (
                    <img src={p.image} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-white font-bold text-2xl"
                      style={{ backgroundColor: p.color || '#10b981' }}
                    >
                      {p.name.charAt(0)}
                    </div>
                  )}

                  {/* Stock Status Badge Overlay */}
                  {isOutOfStock ? (
                    <span className="absolute top-2 left-2 z-10 text-[10px] font-black bg-rose-600 text-white px-2.5 py-0.5 rounded-full shadow-md flex items-center gap-1 animate-pulse border border-white/50">
                      ❌ Stok Habis
                    </span>
                  ) : isLowStock ? (
                    <span className="absolute top-2 left-2 z-10 text-[10px] font-black bg-amber-500 text-slate-950 px-2.5 py-0.5 rounded-full shadow-md flex items-center gap-1 border border-white/60">
                      ⚠️ Sisa {p.stock} pcs!
                    </span>
                  ) : (
                    <span className="absolute top-2 left-2 text-[10px] font-bold bg-white/90 text-slate-800 px-2 py-0.5 rounded shadow-xs">
                      {p.sku}
                    </span>
                  )}

                  <span className="absolute top-2 right-2 text-[10px] font-bold bg-emerald-600 text-white px-2 py-0.5 rounded shadow-xs">
                    {p.category}
                  </span>
                </div>

                <div className="p-4 space-y-2">
                  <h4 className="font-bold text-sm text-slate-900 line-clamp-1">{p.name}</h4>
                  {p.description && (
                    <p className="text-xs text-slate-500 line-clamp-2">{p.description}</p>
                  )}

                  {/* Pricing and Profit Margin */}
                  <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Harga Jual</span>
                      <span className="font-extrabold text-slate-900">{formatRupiah(p.price)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Modal (HPP)</span>
                      <span className="font-semibold text-slate-600">{formatRupiah(p.costPrice || 0)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] bg-slate-50 p-2 rounded-lg">
                    <span className="text-slate-500">Margin Laba:</span>
                    <span className="font-bold text-emerald-700">
                      {formatRupiah(margin)} ({marginPct}%)
                    </span>
                  </div>
                </div>
              </div>

              {/* Stock and Actions */}
              <div className="p-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between">
                {/* Stock Controls */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase mr-1">Stok:</span>
                  {isMaster && (
                    <button
                      onClick={() => handleAdjustStock(p.id, -1)}
                      className="w-5 h-5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center justify-center text-xs"
                    >
                      -
                    </button>
                  )}
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded font-extrabold ${
                      isOutOfStock
                        ? 'bg-rose-100 text-rose-700'
                        : isLowStock
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'text-slate-900'
                    }`}
                  >
                    {p.stock}
                  </span>
                  {isMaster && (
                    <button
                      onClick={() => handleAdjustStock(p.id, 1)}
                      className="w-5 h-5 rounded bg-slate-200 hover:bg-slate-300 text-slate-700 flex items-center justify-center text-xs"
                    >
                      +
                    </button>
                  )}
                </div>

                {/* Edit & Delete (Master Only) */}
                {isMaster ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(p)}
                      className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors"
                      title="Ubah Produk"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id, p.name)}
                      className="p-1.5 rounded-lg hover:bg-rose-100 text-rose-500 transition-colors"
                      title="Hapus Produk"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-400 font-mono">Terkunci</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Add / Edit Product */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800 text-base">
                {editingProduct ? 'Ubah Produk' : 'Tambah Menu Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Produk *</label>
                <input
                  type="text"
                  required
                  maxLength={140}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Contoh: Kopi Susu Aren"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Kategori</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="Kopi & Minuman">Kopi & Minuman</option>
                    <option value="Makanan Utama">Makanan Utama</option>
                    <option value="Cemilan & Snack">Cemilan & Snack</option>
                    <option value="Paket Hemat">Paket Hemat</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Kode SKU / Barcode</label>
                  <input
                    type="text"
                    maxLength={60}
                    value={formSku}
                    onChange={(e) => setFormSku(e.target.value)}
                    placeholder="Contoh: KOP-001"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Harga Jual (Rp) *</label>
                  <input
                    type="number"
                    min={0}
                    max={1000000000}
                    required
                    value={formPrice}
                    onChange={(e) => setFormPrice(Math.max(0, Number(e.target.value)))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Harga Modal / HPP (Rp)</label>
                  <input
                    type="number"
                    min={0}
                    max={1000000000}
                    value={formCostPrice}
                    onChange={(e) => setFormCostPrice(Math.max(0, Number(e.target.value)))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Stok Awal</label>
                  <input
                    type="number"
                    min={0}
                    max={1000000}
                    value={formStock}
                    onChange={(e) => setFormStock(Math.max(0, Number(e.target.value)))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">URL Foto Produk</label>
                  <input
                    type="url"
                    maxLength={2000}
                    value={formImage}
                    onChange={(e) => setFormImage(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Deskripsi Singkat</label>
                <textarea
                  value={formDescription}
                  maxLength={500}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Keterangan bahan, rasa, porsi..."
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md"
                >
                  Simpan Produk
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Product Confirmation Modal */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 p-6 text-center space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Hapus Produk?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Apakah Anda yakin ingin menghapus produk <strong>&ldquo;{productToDelete.name}&rdquo;</strong> dari katalog kasir?
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteProduct}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
