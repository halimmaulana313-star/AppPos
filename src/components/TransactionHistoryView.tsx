/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  History,
  Printer,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Order, StoreProfile } from '../types/pos';
import { formatDateTime, formatRupiah } from '../utils/formatters';
import { exportTransactionsToExcel } from '../utils/reportUtils';
import { sounds } from '../utils/soundEffects';

interface TransactionHistoryViewProps {
  orders: Order[];
  onCancelOrder: (orderId: string) => Promise<void>;
  onDeleteOrder?: (orderId: string) => Promise<void>;
  onSelectOrderReceipt: (order: Order) => void;
  isMaster?: boolean;
  store?: StoreProfile;
}

export const TransactionHistoryView: React.FC<TransactionHistoryViewProps> = ({
  orders,
  onCancelOrder,
  onDeleteOrder,
  onSelectOrderReceipt,
  isMaster = true,
  store,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'cancelled'>('all');
  const [selectedMethod, setSelectedMethod] = useState<string>('all');

  const filteredOrders = useMemo(() => {
    return orders
      .filter((o) => {
        if (statusFilter !== 'all' && o.status !== statusFilter) return false;
        if (selectedMethod !== 'all' && o.paymentMethod !== selectedMethod) return false;
        if (!searchQuery.trim()) return true;

        const q = searchQuery.toLowerCase();
        return (
          o.id.toLowerCase().includes(q) ||
          (o.customerName && o.customerName.toLowerCase().includes(q)) ||
          (o.tableNumber && o.tableNumber.toLowerCase().includes(q)) ||
          o.items.some((i) => i.product.name.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [orders, statusFilter, selectedMethod, searchQuery]);

  const [orderToCancel, setOrderToCancel] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleCancelOrder = (orderId: string) => {
    setCancelError(null);
    setOrderToCancel(orderId);
  };

  const confirmCancelOrder = async () => {
    if (!orderToCancel || isCancelling) return;
    setIsCancelling(true);
    setCancelError(null);
    try {
      await onCancelOrder(orderToCancel);
      sounds.playItemBeep();
      setOrderToCancel(null);
    } catch {
      setCancelError('Gagal membatalkan transaksi di server. Periksa hak akses Master Anda.');
      sounds.playError();
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRequestDeleteOrder = (orderId: string) => {
    setDeleteError(null);
    setOrderToDelete(orderId);
  };

  const confirmDeleteOrder = async () => {
    if (!orderToDelete || !onDeleteOrder || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteOrder(orderToDelete);
      sounds.playItemBeep();
      setOrderToDelete(null);
    } catch {
      setDeleteError('Gagal menghapus pesanan di server. Pastikan Anda masuk sebagai Master/Owner.');
      sounds.playError();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <span>Riwayat Transaksi</span>
            <span className="text-xs bg-slate-100 text-slate-700 font-semibold px-2.5 py-0.5 rounded-full">
              {orders.length} Total
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Daftar seluruh nota penjualan, cetak ulang struk thermal Bluetooth, dan detail pembayaran.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari no. nota, pelanggan, meja, menu..."
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none"
          >
            <option value="all">Semua Status</option>
            <option value="completed">Selesai</option>
            <option value="cancelled">Dibatalkan</option>
          </select>

          {/* Payment filter */}
          <select
            value={selectedMethod}
            onChange={(e) => setSelectedMethod(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none"
          >
            <option value="all">Semua Metode</option>
            <option value="cash">Tunai (Cash)</option>
            <option value="qris">QRIS</option>
            <option value="transfer">Transfer Bank</option>
            <option value="debit">Kartu Debit</option>
          </select>

          {/* Export Excel Button */}
          <button
            onClick={() => {
              sounds.playCashRegister();
              exportTransactionsToExcel(
                filteredOrders,
                store || {
                  storeName: 'Kopi Literasi POS',
                  address: '',
                  phone: '',
                  tagline: '',
                  footerNote: '',
                  enableTax: false,
                  taxPercentage: 0,
                  enableServiceCharge: false,
                  serviceChargePercentage: 0,
                  currency: 'IDR',
                },
                'Daftar Riwayat Transaksi'
              );
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer ml-auto"
            title="Ekspor daftar transaksi tersaring ke format tabel Excel (.xls)"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
            <span>Ekspor Excel Tabel</span>
          </button>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <History className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">Tidak ada riwayat transaksi ditemukan</p>
            <p className="text-xs text-slate-400">Silakan sesuaikan kata kunci atau filter status.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 pl-4 sm:pl-6">No. Nota & Waktu</th>
                  <th className="py-3.5">Pelanggan / Meja</th>
                  <th className="py-3.5">Rincian Menu</th>
                  <th className="py-3.5">Metode Bayar</th>
                  <th className="py-3.5 text-right">Total Transaksi</th>
                  <th className="py-3.5 text-center">Status</th>
                  <th className="py-3.5 pr-4 sm:pr-6 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                    {/* ID & Date */}
                    <td className="py-3.5 pl-4 sm:pl-6">
                      <div className="font-bold text-slate-900 font-mono">#{order.id}</div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{formatDateTime(order.timestamp)}</span>
                      </div>
                    </td>

                    {/* Customer */}
                    <td className="py-3.5">
                      <div className="font-medium text-slate-800">{order.customerName || 'Pelanggan Walk-In'}</div>
                      <div className="text-[10px] text-slate-500">
                        {order.tableNumber ? `Meja: ${order.tableNumber}` : order.orderType === 'takeaway' ? 'Bawa Pulang' : 'Dine-In'}
                      </div>
                    </td>

                    {/* Items preview */}
                    <td className="py-3.5 max-w-xs">
                      <div className="text-slate-700 truncate font-medium">
                        {order.items.map((i) => `${i.quantity}x ${i.product.name}`).join(', ')}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Total {order.items.reduce((s, i) => s + i.quantity, 0)} porsi
                      </div>
                    </td>

                    {/* Payment Method */}
                    <td className="py-3.5">
                      <span className="inline-block px-2 py-0.5 rounded font-bold text-[10px] uppercase bg-slate-100 text-slate-700 border border-slate-200">
                        {order.paymentMethod}
                      </span>
                    </td>

                    {/* Total */}
                    <td className="py-3.5 text-right font-bold text-slate-900 text-sm">
                      <div>{formatRupiah(order.total)}</div>
                      {order.discount > 0 && (
                        <div className="text-[10px] text-emerald-600 font-semibold">
                          Diskon {order.discountPercent ? `${order.discountPercent}%` : `-${formatRupiah(order.discount)}`}
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 text-center">
                      {order.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Selesai</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                          <XCircle className="w-3 h-3" />
                          <span>Dibatalkan</span>
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 pr-4 sm:pr-6 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onSelectOrderReceipt(order)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold transition-colors cursor-pointer"
                          title="Cetak ulang struk ke printer Bluetooth"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Cetak Struk</span>
                        </button>

                        {isMaster && order.status === 'completed' && (
                          <button
                            onClick={() => handleCancelOrder(order.id)}
                            className="p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors cursor-pointer"
                            title="Batalkan status transaksi"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}

                        {isMaster && onDeleteOrder && (
                          <button
                            onClick={() => handleRequestDeleteOrder(order.id)}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition-colors cursor-pointer"
                            title="Hapus pesanan ini secara permanen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Hapus</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cancel Order Confirmation Modal */}
      {orderToCancel && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 p-6 text-center space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Batalkan Transaksi?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Yakin ingin membatalkan transaksi <strong>#{orderToCancel}</strong>? Status transaksi ini akan diubah menjadi &ldquo;Dibatalkan&rdquo;.
              </p>
              {cancelError && (
                <p className="text-xs text-rose-600 font-semibold mt-2">{cancelError}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                disabled={isCancelling}
                onClick={() => setOrderToCancel(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isCancelling}
                onClick={() => void confirmCancelOrder()}
                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs disabled:opacity-50"
              >
                {isCancelling ? 'Memproses...' : 'Batalkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Order Confirmation Modal (Master/Owner Only) */}
      {orderToDelete && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 p-6 text-center space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Hapus Pesanan Permanen?</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Yakin ingin menghapus pesanan <strong>#{orderToDelete}</strong>? Pesanan ini akan dihapus permanen dari riwayat transaksi dan laporan penjualan.
              </p>
              {deleteError && (
                <p className="text-xs text-rose-600 font-semibold mt-2">{deleteError}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setOrderToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void confirmDeleteOrder()}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isDeleting ? 'Menghapus...' : 'Ya, Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
