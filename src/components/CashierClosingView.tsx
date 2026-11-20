/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Lock,
  Package,
  Printer,
  Receipt,
  Search,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  AppUser,
  CashierClosing,
  DailySalesReport,
  Order,
  StoreProfile,
} from '../types/pos';
import {
  formatDateOnly,
  formatRupiah,
  formatTimeOnly,
  getLocalDateString,
} from '../utils/formatters';
import { calculateDailyReport } from '../utils/reportUtils';
import { sounds } from '../utils/soundEffects';

interface CashierClosingViewProps {
  orders: Order[];
  closings: CashierClosing[];
  currentUser: AppUser | null;
  store: StoreProfile;
  isMaster: boolean;
  initialDate?: string;
  onSaveClosing: (closing: CashierClosing) => Promise<void>;
  onDeleteClosing?: (closingId: string) => Promise<void>;
  onOpenClosingReceipt: (closing: CashierClosing) => void;
  onSelectOrderReceipt: (order: Order) => void;
  onOpenReportReceiptModal: (report: DailySalesReport) => void;
}

const SHIFT_OPTIONS = ['Full Day', 'Shift Pagi', 'Shift Siang', 'Shift Malam'] as const;

export const CashierClosingView: React.FC<CashierClosingViewProps> = ({
  orders,
  closings,
  currentUser,
  isMaster,
  initialDate,
  onSaveClosing,
  onDeleteClosing,
  onOpenClosingReceipt,
  onSelectOrderReceipt,
  onOpenReportReceiptModal,
}) => {
  const todayStr = useMemo(() => getLocalDateString(new Date()), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return getLocalDateString(d);
  }, []);

  const [selectedDate, setSelectedDate] = useState<string>(initialDate || todayStr);

  useEffect(() => {
    if (initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)) {
      setSelectedDate(initialDate);
    }
  }, [initialDate]);
  const [cashierName, setCashierName] = useState<string>(currentUser?.name || 'Kasir');
  const [shiftLabel, setShiftLabel] = useState<string>('Full Day');
  const [openingCashInput, setOpeningCashInput] = useState<string>('200000');
  const [cashOutInput, setCashOutInput] = useState<string>('0');
  const [cashOutNote, setCashOutNote] = useState<string>('');
  const [actualCashInput, setActualCashInput] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [txSearch, setTxSearch] = useState<string>('');
  const [closingSearch, setClosingSearch] = useState<string>('');
  const [closingToDelete, setClosingToDelete] = useState<CashierClosing | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Daily report strictly computed for selectedDate
  const report = useMemo(() => calculateDailyReport(orders, selectedDate), [orders, selectedDate]);

  // Distinct recent dates with activity (orders or closings) for quick switching
  const activeDates = useMemo(() => {
    const set = new Set<string>([todayStr, yesterdayStr]);
    orders.forEach((o) => {
      if (o.status === 'completed') {
        const d = getLocalDateString(o.timestamp);
        if (d) set.add(d);
      }
    });
    closings.forEach((c) => {
      if (c.date) set.add(c.date);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a)).slice(0, 7);
  }, [orders, closings, todayStr, yesterdayStr]);

  // Closings matching selectedDate
  const closingsForSelectedDate = useMemo(() => {
    return closings.filter((c) => c.date === selectedDate);
  }, [closings, selectedDate]);

  // Financial numbers for reconciliation
  const openingCash = Math.max(0, Number(openingCashInput) || 0);
  const cashOut = Math.max(0, Number(cashOutInput) || 0);
  const systemCashSales = report.paymentBreakdown.cash.total;
  const qrisSales = report.paymentBreakdown.qris.total;
  const transferSales = report.paymentBreakdown.transfer.total;
  const cardSales =
    report.paymentBreakdown.debit.total + report.paymentBreakdown.credit.total;
  const systemNonCashSales = qrisSales + transferSales + cardSales;

  const expectedCash = openingCash + systemCashSales - cashOut;
  const hasActualInput = actualCashInput.trim() !== '';
  const actualCash = hasActualInput ? Math.max(0, Number(actualCashInput) || 0) : expectedCash;
  const cashDifference = actualCash - expectedCash;

  const filteredDayTransactions = useMemo(() => {
    if (!txSearch.trim()) return report.transactions;
    const q = txSearch.toLowerCase();
    return report.transactions.filter(
      (tx) =>
        tx.id.toLowerCase().includes(q) ||
        (tx.customerName && tx.customerName.toLowerCase().includes(q)) ||
        (tx.cashierName && tx.cashierName.toLowerCase().includes(q))
    );
  }, [report.transactions, txSearch]);

  const filteredClosings = useMemo(() => {
    const sorted = [...closings].sort(
      (a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime()
    );
    if (!closingSearch.trim()) return sorted;
    const q = closingSearch.toLowerCase();
    return sorted.filter(
      (c) =>
        c.date.includes(q) ||
        formatDateOnly(c.date).toLowerCase().includes(q) ||
        c.cashierName.toLowerCase().includes(q) ||
        (c.shiftLabel && c.shiftLabel.toLowerCase().includes(q)) ||
        c.id.toLowerCase().includes(q)
    );
  }, [closings, closingSearch]);

  const handleSaveClosing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const cleanCashier = cashierName.trim() || currentUser?.name || 'Kasir';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
      setStatusBanner({ type: 'error', message: 'Pilih tanggal laporan yang valid.' });
      sounds.playError();
      return;
    }

    setIsSaving(true);
    setStatusBanner(null);

    try {
      const dateCompact = selectedDate.replace(/-/g, '');
      const seqNum = closingsForSelectedDate.length + 1;
      const closingId = `CLS-${dateCompact}-${String(seqNum).padStart(2, '0')}-${String(
        Date.now()
      ).slice(-4)}`;

      const newClosing: CashierClosing = {
        id: closingId,
        date: selectedDate,
        closedAt: new Date().toISOString(),
        cashierUid: currentUser?.id,
        cashierName: cleanCashier.slice(0, 100),
        shiftLabel,
        openingCash: Math.round(openingCash),
        cashOut: Math.round(cashOut),
        cashOutNote: cashOutNote.trim().slice(0, 200) || undefined,
        systemCashSales: Math.round(systemCashSales),
        systemNonCashSales: Math.round(systemNonCashSales),
        qrisSales: Math.round(qrisSales),
        transferSales: Math.round(transferSales),
        cardSales: Math.round(cardSales),
        totalSales: Math.round(report.totalGrossSales),
        totalDiscounts: Math.round(report.totalDiscounts),
        totalTax: Math.round(report.totalTax),
        totalServiceCharge: Math.round(report.totalServiceCharge),
        totalTransactions: report.totalTransactions,
        totalItemsSold: report.totalItemsSold,
        expectedCash: Math.round(expectedCash),
        actualCash: Math.round(actualCash),
        cashDifference: Math.round(cashDifference),
        notes: notes.trim().slice(0, 500) || undefined,
        status: 'closed',
      };

      await onSaveClosing(newClosing);
      sounds.playCashRegister();
      setStatusBanner({
        type: 'success',
        message: `Tutupan kasir tanggal ${formatDateOnly(selectedDate)} (${shiftLabel}) berhasil disimpan.`,
      });
      setCashOutInput('0');
      setCashOutNote('');
      setActualCashInput('');
      setNotes('');
      onOpenClosingReceipt(newClosing);
    } catch {
      sounds.playError();
      setStatusBanner({
        type: 'error',
        message: 'Gagal menyimpan tutupan kasir ke server. Periksa koneksi internet Anda.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!closingToDelete || !onDeleteClosing || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDeleteClosing(closingToDelete.id);
      sounds.playItemBeep();
      setClosingToDelete(null);
    } catch {
      sounds.playError();
      setStatusBanner({
        type: 'error',
        message: 'Gagal menghapus riwayat tutupan kasir.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header & Date Picker Bar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                Tutupan Kasir &amp; Laporan Harian
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Rekonsiliasi laci kas, simpan tutup shift, dan lihat laporan penjualan sesuai tanggal pilihan.
              </p>
            </div>
          </div>
        </div>

        {/* Date Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-medium">
            <button
              type="button"
              onClick={() => setSelectedDate(todayStr)}
              className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedDate === todayStr
                  ? 'bg-white text-emerald-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hari Ini
            </button>
            <button
              type="button"
              onClick={() => setSelectedDate(yesterdayStr)}
              className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                selectedDate === yesterdayStr
                  ? 'bg-white text-emerald-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kemarin
            </button>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5">
            <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                if (e.target.value) setSelectedDate(e.target.value);
              }}
              aria-label="Pilih tanggal laporan dan tutupan kasir"
              className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-none tabular-nums"
            />
          </div>

          <button
            type="button"
            onClick={() => onOpenReportReceiptModal(report)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Struk Laporan Tgl</span>
          </button>
        </div>
      </div>

      {/* Quick Active Date Switcher */}
      {activeDates.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs font-semibold text-slate-500 whitespace-nowrap shrink-0">
            Tanggal Aktif:
          </span>
          {activeDates.map((d) => {
            const isSelected = d === selectedDate;
            const hasClosed = closings.some((c) => c.date === d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDate(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer tabular-nums ${
                  isSelected
                    ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>{d === todayStr ? 'Hari Ini' : d === yesterdayStr ? 'Kemarin' : formatDateOnly(d)}</span>
                {hasClosed && (
                  <CheckCircle2
                    className={`w-3.5 h-3.5 ${isSelected ? 'text-emerald-100' : 'text-emerald-600'}`}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Status Notification */}
      {statusBanner && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
            statusBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium">
            {statusBanner.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{statusBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-xs font-bold underline cursor-pointer shrink-0"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Selected Date Daily Report KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-semibold">Omset Tanggal Terpilih</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums">
            {formatRupiah(report.totalGrossSales)}
          </div>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {formatDateOnly(selectedDate)} · Diskon {formatRupiah(report.totalDiscounts)}
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-semibold">Penjualan Tunai (Laci)</span>
            <Banknote className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-emerald-700 tabular-nums">
            {formatRupiah(systemCashSales)}
          </div>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {report.paymentBreakdown.cash.count} transaksi tunai
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-semibold">Non-Tunai (QRIS/TF/Card)</span>
            <Wallet className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums">
            {formatRupiah(systemNonCashSales)}
          </div>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {report.totalTransactions - report.paymentBreakdown.cash.count} transaksi digital
          </p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-semibold">Total Nota &amp; Produk</span>
            <Receipt className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900 tabular-nums">
            {report.totalTransactions} Trx
          </div>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {report.totalItemsSold} item terjual · Status:{' '}
            {closingsForSelectedDate.length > 0 ? 'Sudah Tutup' : 'Belum Tutup'}
          </p>
        </div>
      </div>

      {/* Main Two-Column Section: Left = Tutupan Kasir Form, Right = Daily Report Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Form Tutupan Kasir */}
        <form
          onSubmit={handleSaveClosing}
          className="lg:col-span-5 bg-white rounded-2xl p-5 border border-slate-200 space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="font-bold text-slate-900 text-base">
                Rekonsiliasi &amp; Simpan Tutupan Kasir
              </h2>
              <p className="text-xs text-slate-500">
                Tanggal laporan: <strong className="text-slate-800">{formatDateOnly(selectedDate)}</strong>
              </p>
            </div>
            <ClipboardCheck className="w-5 h-5 text-emerald-600 shrink-0" />
          </div>

          {closingsForSelectedDate.length > 0 && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Tanggal ini sudah memiliki {closingsForSelectedDate.length} arsip Tutupan Kasir
                </span>
              </div>
              <p className="text-emerald-800">
                Terakhir ditutup oleh <strong>{closingsForSelectedDate[0].cashierName}</strong> ·{' '}
                {closingsForSelectedDate[0].shiftLabel || 'Full Day'} · pukul{' '}
                {formatTimeOnly(closingsForSelectedDate[0].closedAt)}. Anda tetap dapat menyimpan tutupan shift baru jika diperlukan.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Kasir / Petugas
              </label>
              <input
                type="text"
                required
                maxLength={100}
                value={cashierName}
                onChange={(e) => setCashierName(e.target.value)}
                placeholder="Nama kasir bertugas"
                className="w-full px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Shift</label>
              <select
                value={shiftLabel}
                onChange={(e) => setShiftLabel(e.target.value)}
                className="w-full px-3 py-2 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {SHIFT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">Modal Awal Laci (Rp)</label>
              <div className="flex items-center gap-1">
                {[100000, 200000, 300000, 500000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setOpeningCashInput(String(preset))}
                    className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer tabular-nums"
                  >
                    {preset / 1000}rb
                  </button>
                ))}
              </div>
            </div>
            <input
              type="number"
              min={0}
              step={1000}
              value={openingCashInput}
              onChange={(e) => setOpeningCashInput(e.target.value)}
              className="w-full px-3 py-2 text-sm font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kas Keluar Laci (Rp)
              </label>
              <input
                type="number"
                min={0}
                step={1000}
                value={cashOutInput}
                onChange={(e) => setCashOutInput(e.target.value)}
                className="w-full px-3 py-2 text-sm font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Keterangan Kas Keluar
              </label>
              <input
                type="text"
                maxLength={200}
                value={cashOutNote}
                onChange={(e) => setCashOutNote(e.target.value)}
                placeholder="Mis. beli es batu / plastik"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Expected Cash Summary */}
          <div className="py-3 border-y border-slate-200 space-y-1.5 text-xs tabular-nums">
            <div className="flex justify-between text-slate-600">
              <span>Modal Awal Laci</span>
              <span className="font-semibold text-slate-800">{formatRupiah(openingCash)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>+ Penjualan Tunai Sistem</span>
              <span className="font-semibold text-emerald-700">+{formatRupiah(systemCashSales)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>- Kas Keluar Laci</span>
              <span className="font-semibold text-rose-600">-{formatRupiah(cashOut)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-100 text-sm font-extrabold text-slate-900">
              <span>Estimasi Kas Seharusnya</span>
              <span>{formatRupiah(expectedCash)}</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700">
                Uang Tunai Fisik di Laci (Rp)
              </label>
              <button
                type="button"
                onClick={() => setActualCashInput(String(Math.max(0, expectedCash)))}
                className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
              >
                Samakan dgn Estimasi
              </button>
            </div>
            <input
              type="number"
              min={0}
              step={1000}
              value={actualCashInput}
              onChange={(e) => setActualCashInput(e.target.value)}
              placeholder={String(Math.max(0, expectedCash))}
              className="w-full px-3 py-2.5 text-base font-extrabold bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums"
            />
          </div>

          {/* Variance Readout */}
          <div
            className={`p-3 rounded-xl border flex items-center justify-between text-xs font-bold tabular-nums ${
              cashDifference === 0
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : cashDifference > 0
                  ? 'bg-blue-50 border-blue-200 text-blue-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {cashDifference === 0 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle
                  className={`w-4 h-4 shrink-0 ${
                    cashDifference > 0 ? 'text-blue-600' : 'text-rose-600'
                  }`}
                />
              )}
              <span>
                {cashDifference === 0
                  ? 'Selisih Kas: Pas / Sesuai'
                  : cashDifference > 0
                    ? 'Selisih Kas: Lebih (Surplus)'
                    : 'Selisih Kas: Kurang (Defisit)'}
              </span>
            </div>
            <span className="text-sm font-extrabold">
              {cashDifference === 0
                ? 'Rp 0'
                : cashDifference > 0
                  ? `+${formatRupiah(cashDifference)}`
                  : `-${formatRupiah(Math.abs(cashDifference))}`}
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Catatan Tutupan Shift (Opsional)
            </label>
            <textarea
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Contoh: Setoran tunai diserahkan ke owner, laci disisakan modal awal."
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Lock className="w-4 h-4" />
            <span>{isSaving ? 'Menyimpan Tutupan Kasir...' : 'Simpan & Cetak Struk Tutup Kasir'}</span>
          </button>
        </form>

        {/* Right: Laporan Harian Detail sesuai tanggal */}
        <div className="lg:col-span-7 space-y-6">
          {/* Rincian Pembayaran & Top Produk Tanggal Terpilih */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h2 className="font-bold text-slate-900 text-base">
                  Laporan Penjualan Tanggal {formatDateOnly(selectedDate)}
                </h2>
                <p className="text-xs text-slate-500">
                  Rincian metode pembayaran, pajak, diskon, dan produk terlaris pada tanggal terpilih.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-500 tabular-nums whitespace-nowrap">
                Rata-rata Nota: {formatRupiah(report.averageOrderValue)}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Metode Pembayaran Table */}
              <div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                  Rincian Pembayaran
                </h3>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs tabular-nums">
                  {[
                    {
                      label: 'Tunai (Cash)',
                      count: report.paymentBreakdown.cash.count,
                      total: report.paymentBreakdown.cash.total,
                    },
                    {
                      label: 'QRIS Digital',
                      count: report.paymentBreakdown.qris.count,
                      total: report.paymentBreakdown.qris.total,
                    },
                    {
                      label: 'Transfer Bank',
                      count: report.paymentBreakdown.transfer.count,
                      total: report.paymentBreakdown.transfer.total,
                    },
                    {
                      label: 'Kartu Debit / Kredit',
                      count:
                        report.paymentBreakdown.debit.count + report.paymentBreakdown.credit.count,
                      total: cardSales,
                    },
                  ].map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between px-3.5 py-2.5 bg-white"
                    >
                      <div>
                        <div className="font-semibold text-slate-800">{row.label}</div>
                        <div className="text-[11px] text-slate-500">{row.count} transaksi</div>
                      </div>
                      <div className="text-right font-bold text-slate-900">
                        {formatRupiah(row.total)}
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 font-extrabold text-slate-900">
                    <span>Total Omset ({report.totalTransactions} Trx)</span>
                    <span className="text-emerald-700">{formatRupiah(report.totalGrossSales)}</span>
                  </div>
                </div>
              </div>

              {/* Top Produk Tanggal Terpilih */}
              <div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-slate-500" />
                  <span>Produk Terlaris Tanggal Ini</span>
                </h3>
                {report.topProducts.length === 0 ? (
                  <div className="py-10 px-4 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                    Belum ada produk terjual pada {formatDateOnly(selectedDate)}.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs tabular-nums">
                    {report.topProducts.slice(0, 5).map((item, idx) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between px-3.5 py-2.5 bg-white"
                      >
                        <div className="min-w-0 pr-3">
                          <div className="font-semibold text-slate-800 truncate">
                            {idx + 1}. {item.name}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {formatRupiah(item.totalRevenue)}
                          </div>
                        </div>
                        <span className="font-bold text-emerald-700 whitespace-nowrap shrink-0">
                          {item.quantity} terjual
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Daftar Transaksi pada Tanggal Terpilih */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Transaksi Tanggal {formatDateOnly(selectedDate)}
                </h3>
                <p className="text-xs text-slate-500 tabular-nums">
                  {filteredDayTransactions.length} dari {report.totalTransactions} transaksi selesai
                </p>
              </div>
              <div className="relative w-full sm:w-56">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={txSearch}
                  onChange={(e) => setTxSearch(e.target.value)}
                  placeholder="Cari nota, kasir, pelanggan..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {filteredDayTransactions.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                Tidak ada transaksi selesai pada tanggal {formatDateOnly(selectedDate)}.
              </div>
            ) : (
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-left text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="py-2">Nota · Jam</th>
                      <th className="py-2">Kasir · Pelanggan</th>
                      <th className="py-2">Metode</th>
                      <th className="py-2 text-right">Total</th>
                      <th className="py-2 text-right">Struk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDayTransactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 pr-2">
                          <div className="font-bold text-slate-900 font-mono">#{tx.id}</div>
                          <div className="text-[11px] text-slate-500">
                            {formatTimeOnly(tx.timestamp)}
                          </div>
                        </td>
                        <td className="py-2.5 pr-2">
                          <div className="font-medium text-slate-800">{tx.cashierName}</div>
                          <div className="text-[11px] text-slate-500">
                            {tx.customerName || 'Pelanggan'} · {tx.items.reduce((s, i) => s + i.quantity, 0)} pcs
                          </div>
                        </td>
                        <td className="py-2.5 pr-2 uppercase font-semibold text-slate-700">
                          {tx.paymentMethod}
                        </td>
                        <td className="py-2.5 pr-2 text-right font-bold text-slate-900">
                          {formatRupiah(tx.total)}
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => onSelectOrderReceipt(tx)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold cursor-pointer whitespace-nowrap"
                          >
                            <Printer className="w-3 h-3" />
                            <span>Struk</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Arsip Riwayat Tutupan Kasir (Klik Tanggal untuk Lihat Laporan Harian) */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600" />
              <span>Arsip Tutupan Kasir (Klik Tanggal untuk Lihat Laporan)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Total {closings.length} catatan tutup kasir tersimpan di cloud.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={closingSearch}
              onChange={(e) => setClosingSearch(e.target.value)}
              placeholder="Cari tanggal, shift, atau kasir..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {filteredClosings.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
            Belum ada riwayat tutupan kasir tersimpan. Gunakan form di atas untuk menutup kasir pada tanggal pilihan Anda.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-left text-xs tabular-nums">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 pl-2">Tanggal Laporan</th>
                  <th className="py-2.5">Kasir · Shift</th>
                  <th className="py-2.5 text-right">Omset Hari Ini</th>
                  <th className="py-2.5 text-right">Kas Seharusnya</th>
                  <th className="py-2.5 text-right">Kas Fisik</th>
                  <th className="py-2.5 text-right">Selisih</th>
                  <th className="py-2.5 pr-2 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClosings.map((cls) => {
                  const isCurrentSelected = cls.date === selectedDate;
                  return (
                    <tr
                      key={cls.id}
                      className={`transition-colors ${
                        isCurrentSelected ? 'bg-emerald-50/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3 pl-2">
                        <button
                          type="button"
                          onClick={() => setSelectedDate(cls.date)}
                          className="text-left group cursor-pointer"
                          title="Klik untuk tampilkan laporan harian tanggal ini"
                        >
                          <div className="font-bold text-slate-900 group-hover:text-emerald-700 group-hover:underline">
                            {formatDateOnly(cls.date)}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Tutup {formatTimeOnly(cls.closedAt)} · #{cls.id}
                          </div>
                        </button>
                      </td>
                      <td className="py-3">
                        <div className="font-semibold text-slate-800">{cls.cashierName}</div>
                        <div className="text-[11px] text-slate-500">
                          {cls.shiftLabel || 'Full Day'} · {cls.totalTransactions} trx
                        </div>
                      </td>
                      <td className="py-3 text-right font-bold text-slate-900">
                        {formatRupiah(cls.totalSales)}
                      </td>
                      <td className="py-3 text-right text-slate-700">
                        {formatRupiah(cls.expectedCash)}
                      </td>
                      <td className="py-3 text-right font-semibold text-slate-900">
                        {formatRupiah(cls.actualCash)}
                      </td>
                      <td className="py-3 text-right font-bold">
                        {cls.cashDifference === 0 ? (
                          <span className="text-emerald-700">Pas (Rp 0)</span>
                        ) : cls.cashDifference > 0 ? (
                          <span className="text-blue-700">
                            Lebih +{formatRupiah(cls.cashDifference)}
                          </span>
                        ) : (
                          <span className="text-rose-700">
                            Kurang -{formatRupiah(Math.abs(cls.cashDifference))}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-2 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedDate(cls.date)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                          >
                            Lihat Laporan
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenClosingReceipt(cls)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Struk</span>
                          </button>
                          {isMaster && onDeleteClosing && (
                            <button
                              type="button"
                              onClick={() => setClosingToDelete(cls)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                              title="Hapus catatan tutupan kasir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Hapus</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal (Master Only) */}
      {closingToDelete && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Hapus Catatan Tutupan Kasir?</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Yakin ingin menghapus tutupan kasir tanggal{' '}
                <strong>{formatDateOnly(closingToDelete.date)}</strong> ({closingToDelete.shiftLabel || 'Full Day'}) oleh{' '}
                <strong>{closingToDelete.cashierName}</strong>?
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setClosingToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void handleConfirmDelete()}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
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
