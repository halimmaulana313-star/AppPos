/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Bluetooth,
  Calendar,
  CheckCircle2,
  Clock,
  Coffee,
  DollarSign,
  Download,
  Eye,
  FileSpreadsheet,
  Flame,
  Moon,
  Package,
  Printer,
  Receipt,
  RotateCw,
  Search,
  ShoppingBag,
  Sparkles,
  Sun,
  Sunrise,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { DailySalesReport, Order, PrinterConfig, StoreProfile } from '../types/pos';
import { bluetoothPrinter, BluetoothPrinterState } from '../utils/bluetoothThermalPrinter';
import {
  formatDateOnly,
  formatNumber,
  formatRupiah,
  formatTimeOnly,
} from '../utils/formatters';
import {
  calculateDailyReport,
  exportReportToCSV,
  exportReportToExcel,
} from '../utils/reportUtils';
import { TableReportExportModal } from './TableReportExportModal';
import { sounds } from '../utils/soundEffects';

interface DailyReportsViewProps {
  orders: Order[];
  store: StoreProfile;
  printerConfig: PrinterConfig;
  printerState: BluetoothPrinterState;
  onOpenPrinterModal: () => void;
  onSelectOrderReceipt: (order: Order) => void;
  onOpenReportReceiptModal: (report: DailySalesReport) => void;
}

export const DailyReportsView: React.FC<DailyReportsViewProps> = ({
  orders,
  store,
  printerConfig,
  printerState,
  onOpenPrinterModal,
  onSelectOrderReceipt,
  onOpenReportReceiptModal,
}) => {
  // Date selection state
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [searchTxQuery, setSearchTxQuery] = useState<string>('');
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [printStatus, setPrintStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Hourly visual summary states
  const [chartMetric, setChartMetric] = useState<'revenue' | 'orders'>('revenue');
  const [selectedHourFilter, setSelectedHourFilter] = useState<string | null>(null);

  // Quick date presets
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // Compute daily report
  const report = useMemo(() => {
    return calculateDailyReport(orders, selectedDate);
  }, [orders, selectedDate]);

  // Hourly insights and peak hour calculation
  const hourlyInsights = useMemo(() => {
    let peakHour = report.hourlySales[0] || { hour: '12:00', total: 0, count: 0 };
    let maxRevenue = 0;
    let activeHours = 0;

    for (const h of report.hourlySales) {
      if (h.total > 0) activeHours++;
      if (h.total > maxRevenue) {
        maxRevenue = h.total;
        peakHour = h;
      }
    }

    const avgActiveHourlyRevenue = activeHours > 0 ? Math.round(report.totalGrossSales / activeHours) : 0;

    // Time of Day aggregation
    const timeOfDay = {
      morning: { label: 'Pagi (07:00 - 11:00)', total: 0, count: 0 },
      afternoon: { label: 'Siang (11:00 - 15:00)', total: 0, count: 0 },
      evening: { label: 'Sore (15:00 - 18:00)', total: 0, count: 0 },
      night: { label: 'Malam (18:00 - 23:00)', total: 0, count: 0 },
    };

    for (const h of report.hourlySales) {
      const hourNum = parseInt(h.hour.split(':')[0], 10);
      if (hourNum >= 7 && hourNum < 11) {
        timeOfDay.morning.total += h.total;
        timeOfDay.morning.count += h.count;
      } else if (hourNum >= 11 && hourNum < 15) {
        timeOfDay.afternoon.total += h.total;
        timeOfDay.afternoon.count += h.count;
      } else if (hourNum >= 15 && hourNum < 18) {
        timeOfDay.evening.total += h.total;
        timeOfDay.evening.count += h.count;
      } else if (hourNum >= 18 && hourNum <= 23) {
        timeOfDay.night.total += h.total;
        timeOfDay.night.count += h.count;
      }
    }

    return {
      peakHour,
      activeHours,
      avgActiveHourlyRevenue,
      timeOfDay,
    };
  }, [report.hourlySales, report.totalGrossSales]);

  // Max value for bar chart scaling
  const maxHourlyValue = useMemo(() => {
    if (chartMetric === 'revenue') {
      const maxVal = Math.max(...report.hourlySales.map((h) => h.total), 0);
      return maxVal > 0 ? maxVal : 1;
    } else {
      const maxVal = Math.max(...report.hourlySales.map((h) => h.count), 0);
      return maxVal > 0 ? maxVal : 1;
    }
  }, [report.hourlySales, chartMetric]);

  // Filtered transactions for the day, including optional hour filter
  const filteredTransactions = useMemo(() => {
    return report.transactions.filter((tx) => {
      if (selectedHourFilter) {
        try {
          const txHour = new Date(tx.timestamp).getHours();
          const filterHour = parseInt(selectedHourFilter.split(':')[0], 10);
          if (txHour !== filterHour) return false;
        } catch {
          // ignore
        }
      }

      if (!searchTxQuery.trim()) return true;
      const q = searchTxQuery.toLowerCase();
      return (
        tx.id.toLowerCase().includes(q) ||
        (tx.customerName && tx.customerName.toLowerCase().includes(q)) ||
        (tx.tableNumber && tx.tableNumber.toLowerCase().includes(q))
      );
    });
  }, [report.transactions, searchTxQuery, selectedHourFilter]);

  // Handle direct Bluetooth Print of the daily report
  const handlePrintDailyReportBluetooth = async () => {
    setIsPrinting(true);
    setPrintStatus(null);

    try {
      if (!printerState.isConnected) {
        const conn = await bluetoothPrinter.connect();
        if (!conn.success) {
          throw new Error(conn.error || 'Silakan sambungkan ke printer Bluetooth terlebih dahulu.');
        }
      }

      const bytes = bluetoothPrinter.generateDailyReportBytes(report, store, printerConfig);
      await bluetoothPrinter.sendRawData(bytes);

      sounds.playThermalTick();
      setPrintStatus({
        type: 'success',
        message: 'Laporan Penjualan Harian berhasil dicetak ke printer Bluetooth thermal!',
      });
      setTimeout(() => setPrintStatus(null), 5000);
    } catch (err: any) {
      setPrintStatus({
        type: 'error',
        message: err.message || 'Gagal mencetak laporan ke printer Bluetooth.',
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const [isTableReportModalOpen, setIsTableReportModalOpen] = useState<boolean>(false);

  const handleExportCSV = () => {
    sounds.playCashRegister();
    exportReportToCSV(report, store.storeName);
    setPrintStatus({
      type: 'success',
      message: 'File CSV dengan pemisah tabel rapi berhasil diekspor!',
    });
    setTimeout(() => setPrintStatus(null), 4000);
  };

  const handleExportExcel = () => {
    sounds.playCashRegister();
    exportReportToExcel(report, store);
    setPrintStatus({
      type: 'success',
      message: 'File Excel (.xls) berformat tabel rapi dan bergaris berhasil diekspor!',
    });
    setTimeout(() => setPrintStatus(null), 4000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Header & Date Filter Bar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Laporan Penjualan Harian
            </h1>
            <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
              Z-Report
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Ringkasan omset harian, rincian pembayaran, dan integrasi cetak struk laporan ke printer Bluetooth.
          </p>
        </div>

        {/* Date Selector Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-medium">
            <button
              onClick={() => setSelectedDate(todayStr)}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                selectedDate === todayStr
                  ? 'bg-white text-emerald-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hari Ini
            </button>
            <button
              onClick={() => setSelectedDate(yesterdayStr)}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                selectedDate === yesterdayStr
                  ? 'bg-white text-emerald-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kemarin
            </button>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5">
            <Calendar className="w-4 h-4 text-slate-500" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Notification Toast */}
      {printStatus && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between ${
            printStatus.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-medium">
            {printStatus.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{printStatus.message}</span>
          </div>
          {printStatus.type === 'error' && (
            <button
              onClick={onOpenPrinterModal}
              className="text-xs font-bold underline hover:text-rose-700 ml-3"
            >
              Atur Printer
            </button>
          )}
        </div>
      )}

      {/* Action Bar: Direct Bluetooth Print & Exports */}
      <div className="bg-emerald-900 text-white rounded-2xl p-4 sm:p-5 shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="w-10 h-10 rounded-xl bg-emerald-700/80 flex items-center justify-center shrink-0">
            <Printer className="w-5 h-5 text-emerald-200" />
          </div>
          <div>
            <h3 className="font-bold text-sm sm:text-base">
              Cetak Struk Ringkasan Laporan (Z-Report)
            </h3>
            <p className="text-xs text-emerald-200">
              Format thermal compact untuk arsip fisik harian kasir & pembukuan toko.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          {/* Main Direct Bluetooth Print */}
          <button
            onClick={handlePrintDailyReportBluetooth}
            disabled={isPrinting}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold text-xs sm:text-sm shadow-md transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            {isPrinting ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin" />
                <span>Mencetak Laporan...</span>
              </>
            ) : (
              <>
                <Bluetooth className="w-4 h-4" />
                <span>Cetak via Bluetooth</span>
              </>
            )}
          </button>

          {/* Export Excel (.xls) with Neat Tables */}
          <button
            onClick={handleExportExcel}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 hover:from-emerald-300 hover:to-teal-300 text-emerald-950 font-extrabold text-xs sm:text-sm shadow-md transition-all active:scale-[0.98] cursor-pointer"
            title="Ekspor laporan ke format spreadsheet Excel dengan tabel bergaris rapi"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-950" />
            <span>Ekspor Excel Tabel</span>
          </button>

          {/* View Structured Table Report Modal */}
          <button
            onClick={() => setIsTableReportModalOpen(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm transition-all cursor-pointer"
            title="Buka pratinjau tabel lengkap & cetak PDF dokumen A4"
          >
            <Eye className="w-4 h-4 text-emerald-300" />
            <span>Dokumen Tabel / PDF</span>
          </button>

          {/* View Receipt Format */}
          <button
            onClick={() => onOpenReportReceiptModal(report)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-800/80 hover:bg-emerald-700 text-white font-medium text-xs sm:text-sm transition-all cursor-pointer"
            title="Format struk thermal roll 58mm/80mm"
          >
            <Receipt className="w-4 h-4 text-emerald-300" />
            <span className="hidden sm:inline">Format Struk</span>
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-800/60 hover:bg-emerald-700 text-white font-medium text-xs sm:text-sm transition-all cursor-pointer"
            title="Download CSV Terstruktur"
          >
            <Download className="w-4 h-4 text-emerald-300" />
            <span className="hidden sm:inline">CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Total Omset */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs col-span-2 sm:col-span-1 lg:col-span-2">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Omset</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {formatRupiah(report.totalGrossSales)}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <span>Penjualan Bersih:</span>
            <span className="font-semibold text-slate-700">{formatRupiah(report.totalNetSales)}</span>
          </div>
        </div>

        {/* Total Transaksi */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Transaksi</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {report.totalTransactions}
          </div>
          <p className="mt-2 text-xs text-slate-500">Nota selesai dicetak</p>
        </div>

        {/* Total Items Sold */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Item Terjual</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {report.totalItemsSold}
          </div>
          <p className="mt-2 text-xs text-slate-500">Porsi / Produk</p>
        </div>

        {/* Average Order Value (AOV) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Rata-rata/Nota</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight mt-1">
            {formatRupiah(report.averageOrderValue)}
          </div>
          <p className="mt-2 text-xs text-slate-500">Average Basket</p>
        </div>

        {/* Laba Kotor */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Est. Laba Kotor</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-bold text-emerald-700 tracking-tight mt-1">
            {formatRupiah(report.totalProfit)}
          </div>
          <p className="mt-2 text-xs text-slate-500">Omset - HPP</p>
        </div>
      </div>

      {/* Grid: Payment Method Breakdown & Hourly Peak Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Methods Breakdown */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Metode Pembayaran</h3>
              <p className="text-xs text-slate-500">Komposisi uang masuk per channel bayar</p>
            </div>
            <Wallet className="w-5 h-5 text-slate-400" />
          </div>

          <div className="space-y-3">
            {/* Tunai */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                  💵
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-800">Tunai (Cash)</div>
                  <div className="text-xs text-slate-500">{report.paymentBreakdown.cash.count} transaksi</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-sm text-slate-900">
                  {formatRupiah(report.paymentBreakdown.cash.total)}
                </div>
                <div className="text-[11px] text-slate-500">
                  {report.totalGrossSales > 0
                    ? `${Math.round((report.paymentBreakdown.cash.total / report.totalGrossSales) * 100)}%`
                    : '0%'}
                </div>
              </div>
            </div>

            {/* QRIS */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-xs">
                  📱
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-800">QRIS Digital</div>
                  <div className="text-xs text-slate-500">{report.paymentBreakdown.qris.count} transaksi</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-sm text-slate-900">
                  {formatRupiah(report.paymentBreakdown.qris.total)}
                </div>
                <div className="text-[11px] text-slate-500">
                  {report.totalGrossSales > 0
                    ? `${Math.round((report.paymentBreakdown.qris.total / report.totalGrossSales) * 100)}%`
                    : '0%'}
                </div>
              </div>
            </div>

            {/* Transfer Bank */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                  🏦
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-800">Transfer Bank</div>
                  <div className="text-xs text-slate-500">{report.paymentBreakdown.transfer.count} transaksi</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-sm text-slate-900">
                  {formatRupiah(report.paymentBreakdown.transfer.total)}
                </div>
                <div className="text-[11px] text-slate-500">
                  {report.totalGrossSales > 0
                    ? `${Math.round((report.paymentBreakdown.transfer.total / report.totalGrossSales) * 100)}%`
                    : '0%'}
                </div>
              </div>
            </div>

            {/* Debit / Kartu */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                  💳
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-800">Kartu Debit & Kredit</div>
                  <div className="text-xs text-slate-500">
                    {report.paymentBreakdown.debit.count + report.paymentBreakdown.credit.count} transaksi
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-sm text-slate-900">
                  {formatRupiah(report.paymentBreakdown.debit.total + report.paymentBreakdown.credit.total)}
                </div>
                <div className="text-[11px] text-slate-500">
                  {report.totalGrossSales > 0
                    ? `${Math.round(
                        ((report.paymentBreakdown.debit.total + report.paymentBreakdown.credit.total) /
                          report.totalGrossSales) *
                          100
                      )}%`
                    : '0%'}
                </div>
              </div>
            </div>
          </div>
        </div>

      {/* =========================================================================
       * DEDICATED VISUAL SUMMARY SECTION: HOURLY SALES TRENDS BAR CHART
       * ========================================================================= */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-xs space-y-6">
        {/* Section Header & Interactive Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-900 text-base sm:text-lg tracking-tight">
                  Tren Penjualan per Jam
                </h3>
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full uppercase">
                  Hourly Trends
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Visualisasi dinamika transaksi kasir, jam sibuk (*peak hours*), dan pola penjualan harian.
              </p>
            </div>
          </div>

          {/* Metric Selector Toggle (Revenue vs Order Count) */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setChartMetric('revenue')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  chartMetric === 'revenue'
                    ? 'bg-white text-emerald-800 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>💵 Total Omset (Rp)</span>
              </button>
              <button
                type="button"
                onClick={() => setChartMetric('orders')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  chartMetric === 'orders'
                    ? 'bg-white text-emerald-800 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>🧾 Jumlah Nota (Trx)</span>
              </button>
            </div>

            {selectedHourFilter && (
              <button
                type="button"
                onClick={() => setSelectedHourFilter(null)}
                className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold transition-colors"
                title="Hapus filter jam"
              >
                Reset Filter
              </button>
            )}
          </div>
        </div>

        {/* 4-Item Quick Insights Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {/* Peak Hour Card */}
          <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200/80">
            <div className="flex items-center justify-between text-amber-800 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Jam Puncak (Peak)</span>
              <Flame className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-lg font-black text-slate-900">
              {hourlyInsights.peakHour.total > 0 ? hourlyInsights.peakHour.hour : '-'}
            </div>
            <p className="text-[11px] text-amber-900/80 mt-0.5">
              {hourlyInsights.peakHour.total > 0
                ? `${formatRupiah(hourlyInsights.peakHour.total)} (${hourlyInsights.peakHour.count} nota)`
                : 'Belum ada data'}
            </p>
          </div>

          {/* Average Revenue Per Active Hour */}
          <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200/80">
            <div className="flex items-center justify-between text-emerald-800 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Rata-rata/Jam Aktif</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-lg font-black text-slate-900">
              {formatRupiah(hourlyInsights.avgActiveHourlyRevenue)}
            </div>
            <p className="text-[11px] text-emerald-900/80 mt-0.5">Penjualan per jam aktif</p>
          </div>

          {/* Active Operating Hours */}
          <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200/80">
            <div className="flex items-center justify-between text-blue-800 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Jam Aktif Kasir</span>
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-lg font-black text-slate-900">
              {hourlyInsights.activeHours} Jam
            </div>
            <p className="text-[11px] text-blue-900/80 mt-0.5">dari total 17 jam toko buka</p>
          </div>

          {/* Peak Contribution */}
          <div className="p-3.5 rounded-xl bg-purple-50/80 border border-purple-200/80">
            <div className="flex items-center justify-between text-purple-800 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Kontribusi Puncak</span>
              <Sparkles className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-lg font-black text-slate-900">
              {report.totalGrossSales > 0
                ? `${Math.round((hourlyInsights.peakHour.total / report.totalGrossSales) * 100)}%`
                : '0%'}
            </div>
            <p className="text-[11px] text-purple-900/80 mt-0.5">dari total omset hari ini</p>
          </div>
        </div>

        {/* Selected Hour Filter Banner */}
        {selectedHourFilter && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 flex items-center justify-between text-xs text-emerald-900 font-semibold animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>
                Menampilkan daftar transaksi khusus pada jam <b>{selectedHourFilter}</b> (
                {filteredTransactions.length} nota ditemukan).
              </span>
            </div>
            <button
              onClick={() => setSelectedHourFilter(null)}
              className="text-xs font-bold underline hover:text-emerald-700"
            >
              Tampilkan Semua Jam
            </button>
          </div>
        )}

        {/* Bar Chart Container */}
        <div className="relative pt-6 pb-2">
          {/* Y-Axis Guide Lines */}
          <div className="absolute inset-0 pt-6 pb-8 pointer-events-none flex flex-col justify-between text-[10px] text-slate-400 font-mono">
            <div className="border-b border-dashed border-slate-200 w-full flex justify-between">
              <span>{chartMetric === 'revenue' ? formatRupiah(maxHourlyValue) : `${maxHourlyValue} trx`}</span>
              <span className="text-slate-300">100%</span>
            </div>
            <div className="border-b border-dashed border-slate-200 w-full flex justify-between">
              <span>{chartMetric === 'revenue' ? formatRupiah(Math.round(maxHourlyValue * 0.75)) : `${Math.round(maxHourlyValue * 0.75)} trx`}</span>
              <span className="text-slate-300">75%</span>
            </div>
            <div className="border-b border-dashed border-slate-200 w-full flex justify-between">
              <span>{chartMetric === 'revenue' ? formatRupiah(Math.round(maxHourlyValue * 0.5)) : `${Math.round(maxHourlyValue * 0.5)} trx`}</span>
              <span className="text-slate-300">50%</span>
            </div>
            <div className="border-b border-dashed border-slate-200 w-full flex justify-between">
              <span>{chartMetric === 'revenue' ? formatRupiah(Math.round(maxHourlyValue * 0.25)) : `${Math.round(maxHourlyValue * 0.25)} trx`}</span>
              <span className="text-slate-300">25%</span>
            </div>
            <div className="border-b border-slate-300 w-full flex justify-between text-slate-500 font-semibold">
              <span>0</span>
              <span className="text-slate-300">0%</span>
            </div>
          </div>

          {/* Interactive Bars Grid */}
          <div className="h-56 sm:h-64 flex items-end gap-1.5 sm:gap-2.5 pt-4 pb-2 z-10 relative">
            {report.hourlySales.map((h, idx) => {
              const currentVal = chartMetric === 'revenue' ? h.total : h.count;
              const heightPct = currentVal > 0 ? Math.max(10, Math.round((currentVal / maxHourlyValue) * 100)) : 3;
              const isPeak = currentVal > 0 && currentVal === maxHourlyValue;
              const isSelected = selectedHourFilter === h.hour;

              return (
                <div
                  key={idx}
                  onClick={() => {
                    if (h.count > 0) {
                      setSelectedHourFilter(isSelected ? null : h.hour);
                    }
                  }}
                  className={`flex-1 flex flex-col items-center h-full justify-end group relative ${
                    h.count > 0 ? 'cursor-pointer' : 'cursor-default'
                  }`}
                >
                  {/* Peak Badge */}
                  {isPeak && (
                    <div className="absolute -top-6 text-[10px] font-black bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded-full shadow-md flex items-center gap-0.5 animate-bounce z-20 whitespace-nowrap">
                      <Flame className="w-3 h-3 text-red-600" />
                      <span className="hidden sm:inline">Puncak</span>
                    </div>
                  )}

                  {/* Rich Floating Tooltip on Hover */}
                  <div className="absolute -top-16 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/95 text-white text-[11px] rounded-xl px-3 py-1.5 pointer-events-none whitespace-nowrap z-30 shadow-xl backdrop-blur-xs text-center border border-slate-700">
                    <p className="font-extrabold text-emerald-400">Jam {h.hour} WIB</p>
                    <p className="font-bold">{formatRupiah(h.total)}</p>
                    <p className="text-[10px] text-slate-300">
                      {h.count} nota transaksi {report.totalGrossSales > 0 ? `(${Math.round((h.total / report.totalGrossSales) * 100)}%)` : ''}
                    </p>
                    {h.count > 0 && <p className="text-[9px] text-emerald-300 mt-0.5">Klik untuk lihat nota</p>}
                  </div>

                  {/* The Bar */}
                  <div
                    style={{ height: `${heightPct}%` }}
                    className={`w-full rounded-t-lg transition-all duration-300 relative ${
                      isSelected
                        ? 'bg-gradient-to-t from-teal-600 to-emerald-400 ring-2 ring-emerald-400 shadow-md scale-x-105'
                        : isPeak
                        ? 'bg-gradient-to-t from-amber-500 to-yellow-400 group-hover:from-amber-600 group-hover:to-yellow-500 shadow-sm'
                        : currentVal > 0
                        ? chartMetric === 'revenue'
                          ? 'bg-gradient-to-t from-emerald-600 to-teal-400 group-hover:from-emerald-700 group-hover:to-teal-500'
                          : 'bg-gradient-to-t from-blue-600 to-cyan-400 group-hover:from-blue-700 group-hover:to-cyan-500'
                        : 'bg-slate-100/90 group-hover:bg-slate-200'
                    }`}
                  >
                    {/* Tiny value label on larger screens if tall enough */}
                    {heightPct > 25 && (
                      <span className="hidden lg:block text-[9px] font-bold text-white text-center w-full pt-1 truncate">
                        {chartMetric === 'revenue' ? formatNumber(Math.round(h.total / 1000)) + 'k' : h.count}
                      </span>
                    )}
                  </div>

                  {/* Hour Label */}
                  <span
                    className={`text-[10px] mt-2 font-mono transition-colors ${
                      isSelected
                        ? 'font-extrabold text-emerald-700'
                        : isPeak
                        ? 'font-bold text-amber-700'
                        : 'text-slate-500'
                    }`}
                  >
                    {h.hour.substring(0, 2)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Operational Time-of-Day Segmentation Breakdown */}
        <div className="pt-4 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-bold text-slate-800">Pembagian Waktu Operasional (Time-of-Day Breakdown)</span>
            <span>Klik kolom jam di atas untuk menyaring transaksi</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Morning */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                <span className="font-semibold flex items-center gap-1.5">
                  <Sunrise className="w-3.5 h-3.5 text-amber-500" />
                  <span>Pagi (07:00-11:00)</span>
                </span>
                <span className="font-bold text-slate-900">{formatRupiah(hourlyInsights.timeOfDay.morning.total)}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  style={{
                    width: `${report.totalGrossSales > 0 ? (hourlyInsights.timeOfDay.morning.total / report.totalGrossSales) * 100 : 0}%`,
                  }}
                  className="h-full bg-amber-500 rounded-full"
                />
              </div>
              <div className="text-[10px] text-slate-500 mt-1 flex justify-between">
                <span>{hourlyInsights.timeOfDay.morning.count} transaksi</span>
                <span>
                  {report.totalGrossSales > 0
                    ? `${Math.round((hourlyInsights.timeOfDay.morning.total / report.totalGrossSales) * 100)}%`
                    : '0%'}
                </span>
              </div>
            </div>

            {/* Afternoon */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                <span className="font-semibold flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5 text-amber-600" />
                  <span>Siang (11:00-15:00)</span>
                </span>
                <span className="font-bold text-slate-900">{formatRupiah(hourlyInsights.timeOfDay.afternoon.total)}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  style={{
                    width: `${report.totalGrossSales > 0 ? (hourlyInsights.timeOfDay.afternoon.total / report.totalGrossSales) * 100 : 0}%`,
                  }}
                  className="h-full bg-emerald-500 rounded-full"
                />
              </div>
              <div className="text-[10px] text-slate-500 mt-1 flex justify-between">
                <span>{hourlyInsights.timeOfDay.afternoon.count} transaksi</span>
                <span>
                  {report.totalGrossSales > 0
                    ? `${Math.round((hourlyInsights.timeOfDay.afternoon.total / report.totalGrossSales) * 100)}%`
                    : '0%'}
                </span>
              </div>
            </div>

            {/* Evening */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                <span className="font-semibold flex items-center gap-1.5">
                  <Coffee className="w-3.5 h-3.5 text-orange-600" />
                  <span>Sore (15:00-18:00)</span>
                </span>
                <span className="font-bold text-slate-900">{formatRupiah(hourlyInsights.timeOfDay.evening.total)}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  style={{
                    width: `${report.totalGrossSales > 0 ? (hourlyInsights.timeOfDay.evening.total / report.totalGrossSales) * 100 : 0}%`,
                  }}
                  className="h-full bg-orange-500 rounded-full"
                />
              </div>
              <div className="text-[10px] text-slate-500 mt-1 flex justify-between">
                <span>{hourlyInsights.timeOfDay.evening.count} transaksi</span>
                <span>
                  {report.totalGrossSales > 0
                    ? `${Math.round((hourlyInsights.timeOfDay.evening.total / report.totalGrossSales) * 100)}%`
                    : '0%'}
                </span>
              </div>
            </div>

            {/* Night */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                <span className="font-semibold flex items-center gap-1.5">
                  <Moon className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Malam (18:00-23:00)</span>
                </span>
                <span className="font-bold text-slate-900">{formatRupiah(hourlyInsights.timeOfDay.night.total)}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  style={{
                    width: `${report.totalGrossSales > 0 ? (hourlyInsights.timeOfDay.night.total / report.totalGrossSales) * 100 : 0}%`,
                  }}
                  className="h-full bg-indigo-500 rounded-full"
                />
              </div>
              <div className="text-[10px] text-slate-500 mt-1 flex justify-between">
                <span>{hourlyInsights.timeOfDay.night.count} transaksi</span>
                <span>
                  {report.totalGrossSales > 0
                    ? `${Math.round((hourlyInsights.timeOfDay.night.total / report.totalGrossSales) * 100)}%`
                    : '0%'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Payment Method Breakdown & Top Selling Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Methods Breakdown */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Metode Pembayaran</h3>
              <p className="text-xs text-slate-500">Komposisi uang masuk per channel bayar</p>
            </div>
            <Wallet className="w-5 h-5 text-slate-400" />
          </div>

          <div className="space-y-3">
            {/* Tunai */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
                  💵
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-800">Tunai (Cash)</div>
                  <div className="text-xs text-slate-500">{report.paymentBreakdown.cash.count} transaksi</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-sm text-slate-900">
                  {formatRupiah(report.paymentBreakdown.cash.total)}
                </div>
                <div className="text-[11px] text-slate-500">
                  {report.totalGrossSales > 0
                    ? `${Math.round((report.paymentBreakdown.cash.total / report.totalGrossSales) * 100)}%`
                    : '0%'}
                </div>
              </div>
            </div>

            {/* QRIS */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-xs">
                  📱
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-800">QRIS Digital</div>
                  <div className="text-xs text-slate-500">{report.paymentBreakdown.qris.count} transaksi</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-sm text-slate-900">
                  {formatRupiah(report.paymentBreakdown.qris.total)}
                </div>
                <div className="text-[11px] text-slate-500">
                  {report.totalGrossSales > 0
                    ? `${Math.round((report.paymentBreakdown.qris.total / report.totalGrossSales) * 100)}%`
                    : '0%'}
                </div>
              </div>
            </div>

            {/* Transfer Bank */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
                  🏦
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-800">Transfer Bank</div>
                  <div className="text-xs text-slate-500">{report.paymentBreakdown.transfer.count} transaksi</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-sm text-slate-900">
                  {formatRupiah(report.paymentBreakdown.transfer.total)}
                </div>
                <div className="text-[11px] text-slate-500">
                  {report.totalGrossSales > 0
                    ? `${Math.round((report.paymentBreakdown.transfer.total / report.totalGrossSales) * 100)}%`
                    : '0%'}
                </div>
              </div>
            </div>

            {/* Debit / Kartu */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                  💳
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-800">Kartu Debit & Kredit</div>
                  <div className="text-xs text-slate-500">
                    {report.paymentBreakdown.debit.count + report.paymentBreakdown.credit.count} transaksi
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-sm text-slate-900">
                  {formatRupiah(report.paymentBreakdown.debit.total + report.paymentBreakdown.credit.total)}
                </div>
                <div className="text-[11px] text-slate-500">
                  {report.totalGrossSales > 0
                    ? `${Math.round(
                        ((report.paymentBreakdown.debit.total + report.paymentBreakdown.credit.total) /
                          report.totalGrossSales) *
                          100
                      )}%`
                    : '0%'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top 5 Products Leaderboard */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Produk Terlaris</h3>
              <p className="text-xs text-slate-500">Peringkat penjualan hari ini</p>
            </div>
            <Package className="w-5 h-5 text-slate-400" />
          </div>

          {report.topProducts.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              Belum ada produk terjual pada tanggal ini.
            </div>
          ) : (
            <div className="space-y-3">
              {report.topProducts.slice(0, 5).map((item, idx) => (
                <div key={item.id} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        idx === 0
                          ? 'bg-amber-100 text-amber-800'
                          : idx === 1
                          ? 'bg-slate-200 text-slate-700'
                          : idx === 2
                          ? 'bg-amber-50 text-amber-900 border border-amber-300'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-xs text-slate-800 truncate">{item.name}</p>
                      <p className="text-[11px] text-slate-500">{formatRupiah(item.totalRevenue)}</p>
                    </div>
                  </div>
                  <span className="shrink-0 font-bold text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg border border-emerald-200">
                    {item.quantity} terjual
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

        {/* Transaction History for Selected Date */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4 lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Daftar Transaksi Hari Ini</h3>
              <p className="text-xs text-slate-500">
                {report.totalTransactions} transaksi tercatat pada {formatDateOnly(selectedDate)}
              </p>
            </div>

            <div className="relative w-full sm:w-60">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTxQuery}
                onChange={(e) => setSearchTxQuery(e.target.value)}
                placeholder="Cari ID nota, nama, meja..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {filteredTransactions.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              Tidak ada riwayat transaksi pada tanggal ini.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 pl-2">Nota / Waktu</th>
                    <th className="py-2.5">Pelanggan / Meja</th>
                    <th className="py-2.5">Item</th>
                    <th className="py-2.5">Metode</th>
                    <th className="py-2.5 text-right">Total</th>
                    <th className="py-2.5 pr-2 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 pl-2">
                        <div className="font-bold text-slate-900 font-mono">#{tx.id}</div>
                        <div className="text-[10px] text-slate-400">{formatTimeOnly(tx.timestamp)}</div>
                      </td>
                      <td className="py-3">
                        <div className="font-medium text-slate-800">{tx.customerName || 'Pelanggan'}</div>
                        <div className="text-[10px] text-slate-500">
                          {tx.tableNumber ? tx.tableNumber : tx.orderType === 'takeaway' ? 'Bungkus' : 'Dine-In'}
                        </div>
                      </td>
                      <td className="py-3 text-slate-600">
                        {tx.items.length} item ({tx.items.reduce((acc, i) => acc + i.quantity, 0)} pcs)
                      </td>
                      <td className="py-3">
                        <span className="inline-block px-2 py-0.5 rounded font-bold text-[10px] uppercase bg-slate-100 text-slate-700">
                          {tx.paymentMethod}
                        </span>
                      </td>
                      <td className="py-3 text-right font-bold text-slate-900">
                        {formatRupiah(tx.total)}
                      </td>
                      <td className="py-3 pr-2 text-right">
                        <button
                          onClick={() => onSelectOrderReceipt(tx)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-xs font-semibold transition-colors"
                        >
                          <Printer className="w-3.5 h-3.5" />
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

      {/* Structured Table Report & Export Modal */}
      <TableReportExportModal
        isOpen={isTableReportModalOpen}
        onClose={() => setIsTableReportModalOpen(false)}
        report={report}
        store={store}
      />
    </div>
  );
};
