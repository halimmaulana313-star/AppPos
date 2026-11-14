/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  AlertCircle,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  Flame,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Search,
  ShoppingBag,
  Sparkles,
  Trash2,
  User,
  UtensilsCrossed,
  X,
  XCircle,
} from 'lucide-react';
import { CartItem, OnlineOrder, OnlineOrderStatus, PrinterConfig, Product, StoreProfile } from '../types/pos';
import { formatNumber, formatRupiah, formatTimeOnly } from '../utils/formatters';
import { sounds } from '../utils/soundEffects';
import { onlineOrdersManager } from '../utils/onlineOrdersManager';
import { BluetoothPrinterState, bluetoothPrinter } from '../utils/bluetoothThermalPrinter';

interface OnlineOrdersViewProps {
  onlineOrders: OnlineOrder[];
  products: Product[];
  store: StoreProfile;
  printerConfig: PrinterConfig;
  printerState: BluetoothPrinterState;
  onLoadOrderToPOS: (order: OnlineOrder) => void;
  onOpenCustomerView: (tableNumber?: string) => void;
}

export const OnlineOrdersView: React.FC<OnlineOrdersViewProps> = ({
  onlineOrders,
  products,
  store,
  printerConfig,
  printerState,
  onLoadOrderToPOS,
  onOpenCustomerView,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'accepted' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [orderToReject, setOrderToReject] = useState<OnlineOrder | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('Bahan menu habis');
  const [orderIdToDelete, setOrderIdToDelete] = useState<string | null>(null);
  const [toastNotification, setToastNotification] = useState<{ type: 'info' | 'error' | 'success'; message: string } | null>(null);

  const pendingCount = onlineOrders.filter((o) => o.status === 'pending').length;
  const acceptedCount = onlineOrders.filter((o) => o.status === 'accepted' || o.status === 'preparing').length;
  const completedCount = onlineOrders.filter((o) => o.status === 'completed').length;

  // Filter orders
  const filteredOrders = onlineOrders.filter((o) => {
    const matchStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'pending'
        ? o.status === 'pending'
        : statusFilter === 'accepted'
        ? o.status === 'accepted' || o.status === 'preparing' || o.status === 'ready'
        : o.status === 'completed';

    const q = searchQuery.toLowerCase().trim();
    const matchSearch =
      !q ||
      o.id.toLowerCase().includes(q) ||
      o.orderCode.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      (o.tableNumber && o.tableNumber.toLowerCase().includes(q)) ||
      o.items.some((i) => i.product.name.toLowerCase().includes(q));

    return matchStatus && matchSearch;
  });

  // Actions
  const handleAcceptOrder = (order: OnlineOrder) => {
    sounds.playItemBeep();
    onlineOrdersManager.updateOrderStatus(order.id, 'accepted');
  };

  const handleCompleteOrder = (order: OnlineOrder) => {
    sounds.playCashRegister();
    onlineOrdersManager.updateOrderStatus(order.id, 'completed');
  };

  const handleRejectOrder = (order: OnlineOrder) => {
    sounds.playError();
    setRejectReason('Bahan menu habis');
    setOrderToReject(order);
  };

  const handleConfirmRejectOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderToReject) return;
    onlineOrdersManager.updateOrderStatus(orderToReject.id, 'cancelled', rejectReason);
    setToastNotification({
      type: 'info',
      message: `Pesanan #${orderToReject.orderCode} telah dibatalkan.`,
    });
    setOrderToReject(null);
  };

  const handleDeleteOrder = (orderId: string) => {
    setOrderIdToDelete(orderId);
  };

  const handleConfirmDeleteOrder = () => {
    if (!orderIdToDelete) return;
    onlineOrdersManager.deleteOrder(orderIdToDelete);
    sounds.playItemBeep();
    setToastNotification({
      type: 'info',
      message: 'Pesanan dihapus dari daftar riwayat online.',
    });
    setOrderIdToDelete(null);
  };

  // Demo order generator for quick testing
  const handleCreateDemoOrder = () => {
    sounds.playOrderNotification();
    const tables = ['02', '03', '05', '07', '10'];
    const randomTable = tables[Math.floor(Math.random() * tables.length)];
    const demo = onlineOrdersManager.createDemoOrder(products, store, randomTable);
    onlineOrdersManager.addOrder(demo);
  };

  // Print kitchen order ticket via Bluetooth
  const handlePrintKitchenTicket = async (order: OnlineOrder) => {
    sounds.playThermalTick();
    if (printerState.isConnected) {
      try {
        // Create an Order object adaptively for thermal printing
        const pseudoOrder = {
          ...order,
          orderNumber: 1,
          cashierName: 'Pesanan Meja',
          taxRate: store.enableTax ? store.taxPercentage / 100 : 0,
          serviceChargeRate: store.enableServiceCharge ? store.serviceChargePercentage / 100 : 0,
          paymentMethod: 'cash' as const,
          amountPaid: order.total,
          change: 0,
        };
        const bytes = bluetoothPrinter.generateReceiptBytes(pseudoOrder as any, store, printerConfig);
        await bluetoothPrinter.sendRawData(bytes);
        setToastNotification({
          type: 'success',
          message: `Berhasil mencetak tiket pesanan #${order.orderCode} ke printer Bluetooth!`,
        });
      } catch (err) {
        console.warn('Gagal print ke printer Bluetooth:', err);
        setToastNotification({
          type: 'error',
          message: 'Terjadi kendala saat mengirim data ke printer Bluetooth.',
        });
      }
    } else {
      sounds.playError();
      setToastNotification({
        type: 'error',
        message: 'Printer Bluetooth belum terhubung. Silakan sambungkan printer di menu Pengaturan Toko.',
      });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Toast Notification Banner */}
      {toastNotification && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between shadow-sm animate-in fade-in duration-200 ${
            toastNotification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : toastNotification.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-bold">
            {toastNotification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{toastNotification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastNotification(null)}
            className="text-xs hover:opacity-75 cursor-pointer ml-3 font-semibold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Banner & Stats */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold relative">
              <ShoppingBag className="w-5 h-5" />
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center font-black animate-pulse">
                  {pendingCount}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Pesanan Online & Barcode Meja</h2>
              <p className="text-xs text-slate-500">
                Pesanan yang dipesan langsung oleh pelanggan melalui scan barcode meja atau link online.
              </p>
            </div>
          </div>
        </div>

        {/* Action Tools */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCreateDemoOrder}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
            title="Simulasikan ada pelanggan yang memesan dari Meja 03"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>+ Simulasi Pesanan Masuk</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenCustomerView()}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Buka QR Menu Pelanggan</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-slate-200/70 p-1 rounded-2xl overflow-x-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semua ({onlineOrders.length})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'pending'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Menunggu Konfirmasi</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-rose-500 text-white">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('accepted')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              statusFilter === 'accepted'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Diproses Dapur</span>
            {acceptedCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-500 text-white">
                {acceptedCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('completed')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'completed'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Selesai ({completedCount})
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kode, nama, meja..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Orders Grid */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <ShoppingBag className="w-7 h-7" />
          </div>
          <h3 className="font-extrabold text-slate-700 text-base">Tidak Ada Pesanan Online</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {statusFilter === 'pending'
              ? 'Belum ada pesanan online baru yang menunggu konfirmasi saat ini.'
              : 'Belum ada pesanan yang sesuai dengan filter yang dipilih.'}
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={handleCreateDemoOrder}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
            >
              Coba Buat Pesanan Simulasi (Meja 03)
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOrders.map((order) => {
            const isPending = order.status === 'pending';
            const isAccepted = order.status === 'accepted' || order.status === 'preparing';
            const isCompleted = order.status === 'completed';
            const isCancelled = order.status === 'cancelled';

            return (
              <div
                key={order.id}
                className={`bg-white rounded-2xl border p-4.5 space-y-3 shadow-xs hover:shadow-md transition-all flex flex-col justify-between ${
                  isPending
                    ? 'border-amber-400 ring-2 ring-amber-400/20 bg-amber-50/20'
                    : isAccepted
                    ? 'border-teal-300 bg-teal-50/15'
                    : 'border-slate-200'
                }`}
              >
                {/* Header: Table & Status */}
                <div>
                  <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-xl bg-slate-900 text-white font-mono font-black text-xs shadow-xs">
                        {order.tableNumber ? `MEJA ${order.tableNumber}` : 'BUNGKUS'}
                      </span>
                      <span className="text-xs font-bold text-emerald-800 font-mono">
                        #{order.orderCode}
                      </span>
                    </div>

                    {/* Status Badge */}
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        isPending
                          ? 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                          : isAccepted
                          ? 'bg-teal-100 text-teal-800 border border-teal-300'
                          : isCompleted
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {isPending
                        ? 'Menunggu'
                        : isAccepted
                        ? 'Dimasak'
                        : isCompleted
                        ? 'Selesai'
                        : 'Dibatalkan'}
                    </span>
                  </div>

                  {/* Customer Info & Time */}
                  <div className="flex items-center justify-between text-xs text-slate-500 pt-2 pb-1">
                    <span className="font-bold text-slate-800 truncate">{order.customerName}</span>
                    <span className="text-[11px] font-mono">{formatTimeOnly(order.timestamp)}</span>
                  </div>

                  {/* Items List */}
                  <div className="space-y-1.5 py-2 max-h-36 overflow-y-auto">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-start text-xs text-slate-700">
                        <div className="min-w-0 flex-1 pr-2">
                          <span className="font-semibold">
                            {item.quantity}x {item.product.name}
                          </span>
                          {item.note && (
                            <span className="text-[10px] text-amber-700 block italic bg-amber-50 px-1.5 py-0.2 rounded mt-0.5">
                              ↳ {item.note}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-slate-900 shrink-0">
                          {formatNumber(item.product.price * item.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Customer Note if any */}
                  {order.notes && (
                    <div className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-200 italic">
                      Catatan: &quot;{order.notes}&quot;
                    </div>
                  )}

                  {/* Rejection Reason if cancelled */}
                  {isCancelled && order.rejectionReason && (
                    <div className="text-[11px] text-rose-700 bg-rose-50 p-2 rounded-xl border border-rose-200 mt-1.5">
                      Alasan ditolak: <span className="font-semibold">{order.rejectionReason}</span>
                    </div>
                  )}
                </div>

                {/* Footer Totals & Action Buttons */}
                <div className="space-y-2.5 pt-2 border-t border-slate-100">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">
                      Total ({order.items.reduce((s, i) => s + i.quantity, 0)} menu):
                    </span>
                    <span className="font-extrabold text-sm text-slate-900 font-mono">
                      {formatRupiah(order.total)}
                    </span>
                  </div>

                  {/* Contextual Actions */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {isPending && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleAcceptOrder(order)}
                          className="py-2 px-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Terima & Masak</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRejectOrder(order)}
                          className="py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Tolak</span>
                        </button>
                      </>
                    )}

                    {/* Load to Cashier POS for Payment (hidden for already cancelled orders) */}
                    {!isCancelled && (
                      <button
                        type="button"
                        onClick={() => onLoadOrderToPOS(order)}
                        className={`py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer flex items-center justify-center gap-1 ${
                          isPending ? 'col-span-2' : ''
                        }`}
                        title="Muat pesanan ini ke keranjang kasir untuk langsung dibayar"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Muat ke Kasir & Bayar</span>
                      </button>
                    )}

                    {/* Print ticket */}
                    {!isPending && !isCancelled && (
                      <button
                        type="button"
                        onClick={() => handlePrintKitchenTicket(order)}
                        className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1"
                        title="Cetak tiket dapur via Bluetooth"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Cetak Dapur</span>
                      </button>
                    )}

                    {/* Delete finished or cancelled order */}
                    {(isCompleted || isCancelled) && (
                      <button
                        type="button"
                        onClick={() => handleDeleteOrder(order.id)}
                        className={`py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                          isCancelled ? 'col-span-2' : 'col-span-2'
                        }`}
                        title="Hapus pesanan dari daftar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus Riwayat</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reject Order Modal */}
      {orderToReject && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmRejectOrder}
            className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center">
                  <XCircle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">Tolak Pesanan #{orderToReject.orderCode}</h4>
                  <p className="text-[11px] text-slate-500">{orderToReject.customerName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOrderToReject(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Alasan Penolakan (opsional):
              </label>
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Contoh: Bahan menu habis"
                autoFocus
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOrderToReject(null)}
                className="py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-100 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm cursor-pointer"
              >
                Tolak Pesanan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Delete Order Confirm Modal */}
      {orderIdToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Hapus Pesanan Online?</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pesanan ini akan dihapus permanen dari daftar pesanan online.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOrderIdToDelete(null)}
                className="py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-100 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteOrder}
                className="py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
