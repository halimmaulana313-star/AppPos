/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileCode,
  FileSpreadsheet,
  FileText,
  Printer,
  Sparkles,
  Store,
  TrendingUp,
  X,
} from 'lucide-react';
import { DailySalesReport, StoreProfile } from '../types/pos';
import { formatDateOnly, formatDateTime, formatNumber, formatRupiah, formatTimeOnly } from '../utils/formatters';
import {
  exportReportToCSV,
  exportReportToExcel,
  exportReportToHTML,
} from '../utils/reportUtils';
import { sounds } from '../utils/soundEffects';

interface TableReportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: DailySalesReport;
  store: StoreProfile;
}

export const TableReportExportModal: React.FC<TableReportExportModalProps> = ({
  isOpen,
  onClose,
  report,
  store,
}) => {
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDownloadExcel = () => {
    sounds.playCashRegister();
    exportReportToExcel(report, store);
    setDownloadSuccess('File Excel (.xls) berformat tabel rapi berhasil diunduh!');
    setTimeout(() => setDownloadSuccess(null), 4000);
  };

  const handleDownloadHTML = () => {
    sounds.playCashRegister();
    exportReportToHTML(report, store);
    setDownloadSuccess('Dokumen HTML Tabel Rapi berhasil diunduh!');
    setTimeout(() => setDownloadSuccess(null), 4000);
  };

  const handleDownloadCSV = () => {
    sounds.playCashRegister();
    exportReportToCSV(report, store.storeName);
    setDownloadSuccess('File CSV dengan pemisah tabel rapi berhasil diunduh!');
    setTimeout(() => setDownloadSuccess(null), 4000);
  };

  const handlePrintDocument = () => {
    sounds.playThermalTick();
    window.print();
  };

  const paymentNames: Record<string, string> = {
    cash: 'Tunai (Cash)',
    qris: 'QRIS Dinamis / Statis',
    transfer: 'Transfer Bank',
    debit: 'Kartu Debit EDC',
    credit: 'Kartu Kredit',
  };

  const totalGross = report.totalGrossSales || 1;
  const totalTrx = report.totalTransactions || 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs overflow-y-auto print:static print:p-0 print:bg-white print:block">
      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto max-h-[92vh] flex flex-col animate-scaleIn print:max-h-none print:shadow-none print:border-none print:rounded-none print:overflow-visible print:animate-none print:block">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-800 text-white p-5 sm:px-6 flex items-center justify-between shrink-0 shadow-sm print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center text-emerald-300">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-extrabold tracking-tight">
                  Format Laporan Tabel Terstruktur
                </h2>
                <span className="bg-emerald-400/20 text-emerald-200 border border-emerald-400/30 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">
                  Siap Ekspor
                </span>
              </div>
              <p className="text-xs text-emerald-100/90 mt-0.5">
                Data disajikan rapi dalam bentuk tabel bergaris, kolom teratur, dan format mata uang otomatis.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Export Buttons Toolbar */}
        <div className="bg-slate-50 border-b border-slate-200 p-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <span>Pilihan Format Ekspor:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Download Excel (.xls) */}
            <button
              onClick={handleDownloadExcel}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all active:scale-[0.98] cursor-pointer"
              title="Unduh Spreadsheet Excel dengan format tabel dan garis rapi"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
              <span>Ekspor Excel (.xls Tabel)</span>
            </button>

            {/* Print / Save PDF */}
            <button
              onClick={handlePrintDocument}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs shadow-xs transition-all active:scale-[0.98] cursor-pointer"
              title="Cetak atau Simpan sebagai PDF dokumen A4"
            >
              <Printer className="w-4 h-4 text-slate-300" />
              <span>Cetak / PDF (A4)</span>
            </button>

            {/* Download HTML */}
            <button
              onClick={handleDownloadHTML}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-xs shadow-2xs transition-all cursor-pointer"
              title="Unduh dokumen web HTML mandiri"
            >
              <FileCode className="w-4 h-4 text-teal-600" />
              <span className="hidden sm:inline">Dokumen HTML</span>
            </button>

            {/* Download CSV */}
            <button
              onClick={handleDownloadCSV}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-xs shadow-2xs transition-all cursor-pointer"
              title="Unduh data tabular CSV dengan UTF-8"
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span className="hidden sm:inline">Data CSV</span>
            </button>
          </div>
        </div>

        {/* Success Toast */}
        {downloadSuccess && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2.5 flex items-center gap-2 text-xs text-emerald-800 font-medium animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{downloadSuccess}</span>
          </div>
        )}

        {/* Modal Scrollable Body: Live Table Document Preview */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6 text-slate-800 text-xs bg-slate-100/50 print:bg-white print:p-0 print:overflow-visible">
          {/* Printable Container */}
          <div
            id="a4-report-print-target"
            className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm print:shadow-none print:border-none print:p-0 space-y-6"
          >
            {/* Header Document */}
            <div className="border-b-2 border-emerald-600 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-emerald-950 tracking-tight">
                  {store.storeName}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {store.address || 'Alamat Toko'} &bull; Telp: {store.phone || '-'}
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold text-[11px]">
                  <span>LAPORAN PENJUALAN HARIAN (Z-REPORT)</span>
                </div>
              </div>

              <div className="text-left sm:text-right text-xs text-slate-600 space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div>
                  <span className="text-slate-400">Tanggal Laporan: </span>
                  <span className="font-bold text-slate-800">{formatDateOnly(report.date)}</span>
                </div>
                <div>
                  <span className="text-slate-400">Waktu Cetak: </span>
                  <span className="font-medium text-slate-800">{new Date().toLocaleString('id-ID')}</span>
                </div>
                <div>
                  <span className="text-slate-400">Status Pembukuan: </span>
                  <span className="font-bold text-emerald-700">Tutup Buku Selesai</span>
                </div>
              </div>
            </div>

            {/* TABEL 1: RINGKASAN KINERJA PENJUALAN */}
            <div>
              <div className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                <span>1. Tabel Ringkasan Kinerja Penjualan (KPI Utama)</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse">
                  <tbody>
                    <tr className="bg-slate-50/80 border-b border-slate-200">
                      <td className="p-3 w-1/4 border-r border-slate-200">
                        <div className="text-[10px] text-slate-500 uppercase font-semibold">Total Omset Kotor</div>
                        <div className="text-base font-extrabold text-emerald-700 mt-0.5 font-mono">{formatRupiah(report.totalGrossSales)}</div>
                      </td>
                      <td className="p-3 w-1/4 border-r border-slate-200">
                        <div className="text-[10px] text-slate-500 uppercase font-semibold">Total Transaksi Selesai</div>
                        <div className="text-base font-extrabold text-slate-900 mt-0.5 font-mono">{report.totalTransactions} Trx</div>
                      </td>
                      <td className="p-3 w-1/4 border-r border-slate-200">
                        <div className="text-[10px] text-slate-500 uppercase font-semibold">Total Produk Terjual</div>
                        <div className="text-base font-extrabold text-slate-900 mt-0.5 font-mono">{report.totalItemsSold} Pcs</div>
                      </td>
                      <td className="p-3 w-1/4">
                        <div className="text-[10px] text-slate-500 uppercase font-semibold">Rata-rata Nota (AOV)</div>
                        <div className="text-base font-extrabold text-slate-900 mt-0.5 font-mono">{formatRupiah(report.averageOrderValue)}</div>
                      </td>
                    </tr>
                    <tr className="bg-white">
                      <td className="p-3 border-r border-slate-200">
                        <div className="text-[10px] text-slate-500 uppercase font-semibold">Total Potongan Diskon</div>
                        <div className="text-sm font-bold text-rose-600 mt-0.5 font-mono">-{formatRupiah(report.totalDiscounts)}</div>
                      </td>
                      <td className="p-3 border-r border-slate-200">
                        <div className="text-[10px] text-slate-500 uppercase font-semibold">Total Pajak (PPN)</div>
                        <div className="text-sm font-bold text-slate-800 mt-0.5 font-mono">{formatRupiah(report.totalTax)}</div>
                      </td>
                      <td className="p-3 border-r border-slate-200">
                        <div className="text-[10px] text-slate-500 uppercase font-semibold">Estimasi Modal HPP</div>
                        <div className="text-sm font-bold text-slate-600 mt-0.5 font-mono">{formatRupiah(report.totalCost)}</div>
                      </td>
                      <td className="p-3 bg-emerald-50/50">
                        <div className="text-[10px] text-emerald-800 uppercase font-semibold">Estimasi Laba Kotor</div>
                        <div className="text-sm font-extrabold text-emerald-700 mt-0.5 font-mono">{formatRupiah(report.totalProfit)}</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* TABEL 2: RINCIAN METODE PEMBAYARAN */}
            <div>
              <div className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                <span>2. Tabel Rincian Penerimaan Kas & Metode Pembayaran</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-emerald-800 text-white font-bold text-[11px]">
                      <th className="py-2.5 px-3 text-center w-12 border-r border-emerald-700">No</th>
                      <th className="py-2.5 px-3 border-r border-emerald-700">Metode Pembayaran</th>
                      <th className="py-2.5 px-3 text-center border-r border-emerald-700">Jumlah Transaksi</th>
                      <th className="py-2.5 px-3 text-center border-r border-emerald-700">Persentase Trx</th>
                      <th className="py-2.5 px-3 text-right border-r border-emerald-700">Total Nominal (Rp)</th>
                      <th className="py-2.5 px-3 text-center">Porsi Omset</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {Object.entries(report.paymentBreakdown).map(([key, data], idx) => {
                      const trxPct = ((data.count / totalTrx) * 100).toFixed(1);
                      const amountPct = ((data.total / totalGross) * 100).toFixed(1);
                      return (
                        <tr key={key} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                          <td className="py-2 px-3 text-center border-r border-slate-200">{idx + 1}</td>
                          <td className="py-2 px-3 font-semibold text-slate-800 border-r border-slate-200">{paymentNames[key] || key}</td>
                          <td className="py-2 px-3 text-center border-r border-slate-200">{data.count} Trx</td>
                          <td className="py-2 px-3 text-center border-r border-slate-200 text-slate-600">{trxPct}%</td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 border-r border-slate-200">{formatRupiah(data.total)}</td>
                          <td className="py-2 px-3 text-center font-medium text-emerald-700">{amountPct}%</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-emerald-50/80 font-bold border-t-2 border-emerald-600 text-emerald-950">
                      <td colSpan={2} className="py-2.5 px-3 text-center border-r border-slate-300">TOTAL AKUMULASI METODE</td>
                      <td className="py-2.5 px-3 text-center border-r border-slate-300">{report.totalTransactions} Trx</td>
                      <td className="py-2.5 px-3 text-center border-r border-slate-300">100%</td>
                      <td className="py-2.5 px-3 text-right font-mono font-extrabold text-emerald-800 border-r border-slate-300">{formatRupiah(report.totalGrossSales)}</td>
                      <td className="py-2.5 px-3 text-center text-emerald-800">100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* TABEL 3: PRODUK TERLARIS */}
            <div>
              <div className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                <span>3. Tabel Produk Terlaris (Top Selling Menu)</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-emerald-800 text-white font-bold text-[11px]">
                      <th className="py-2.5 px-3 text-center w-12 border-r border-emerald-700">No</th>
                      <th className="py-2.5 px-3 border-r border-emerald-700">Nama Menu / Produk</th>
                      <th className="py-2.5 px-3 text-center border-r border-emerald-700">Jumlah Terjual</th>
                      <th className="py-2.5 px-3 text-right border-r border-emerald-700">Harga Rata-rata</th>
                      <th className="py-2.5 px-3 text-right border-r border-emerald-700">Total Pendapatan (Rp)</th>
                      <th className="py-2.5 px-3 text-center">Porsi Omset</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {report.topProducts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-slate-400">Belum ada transaksi</td>
                      </tr>
                    ) : (
                      report.topProducts.map((p, idx) => {
                        const pct = ((p.totalRevenue / totalGross) * 100).toFixed(1);
                        const avgPrice = p.quantity > 0 ? Math.round(p.totalRevenue / p.quantity) : 0;
                        return (
                          <tr key={p.id} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                            <td className="py-2 px-3 text-center border-r border-slate-200">{idx + 1}</td>
                            <td className="py-2 px-3 font-semibold text-slate-800 border-r border-slate-200">{p.name}</td>
                            <td className="py-2 px-3 text-center font-bold border-r border-slate-200">{p.quantity} Pcs</td>
                            <td className="py-2 px-3 text-right font-mono text-slate-600 border-r border-slate-200">{formatRupiah(avgPrice)}</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 border-r border-slate-200">{formatRupiah(p.totalRevenue)}</td>
                            <td className="py-2 px-3 text-center text-emerald-700 font-semibold">{pct}%</td>
                          </tr>
                        );
                      })
                    )}
                    {report.topProducts.length > 0 && (
                      <tr className="bg-emerald-50/80 font-bold border-t-2 border-emerald-600 text-emerald-950">
                        <td colSpan={2} className="py-2.5 px-3 text-center border-r border-slate-300">TOTAL SELURUH ITEM TERJUAL</td>
                        <td className="py-2.5 px-3 text-center border-r border-slate-300">{report.totalItemsSold} Pcs</td>
                        <td className="py-2.5 px-3 text-right border-r border-slate-300">-</td>
                        <td className="py-2.5 px-3 text-right font-mono font-extrabold text-emerald-800 border-r border-slate-300">{formatRupiah(report.totalGrossSales)}</td>
                        <td className="py-2.5 px-3 text-center text-emerald-800">100%</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* TABEL 4: DAFTAR TRANSAKSI NOTA */}
            <div>
              <div className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                  <span>4. Tabel Rincian Seluruh Transaksi Nota ({report.transactions.length} Nota)</span>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-96 print:max-h-none print:overflow-visible">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead className="sticky top-0 z-10 shadow-xs">
                    <tr className="bg-emerald-800 text-white font-bold">
                      <th className="py-2 px-2.5 text-center w-10 border-r border-emerald-700">No</th>
                      <th className="py-2 px-2.5 border-r border-emerald-700 w-24">No. Nota</th>
                      <th className="py-2 px-2.5 text-center border-r border-emerald-700 w-20">Jam</th>
                      <th className="py-2 px-2.5 border-r border-emerald-700 w-24">Kasir</th>
                      <th className="py-2 px-2.5 border-r border-emerald-700 w-28">Pelanggan / Meja</th>
                      <th className="py-2 px-2.5 text-center border-r border-emerald-700 w-20">Metode</th>
                      <th className="py-2 px-2.5 border-r border-emerald-700">Rincian Menu</th>
                      <th className="py-2 px-2.5 text-right border-r border-emerald-700 w-24">Subtotal</th>
                      <th className="py-2 px-2.5 text-right border-r border-emerald-700 w-20">Diskon</th>
                      <th className="py-2 px-2.5 text-right border-r border-emerald-700 w-28">Total Akhir</th>
                      <th className="py-2 px-2.5 text-center w-16">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {report.transactions.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-6 text-center text-slate-400">Tidak ada transaksi tercatat pada tanggal ini</td>
                      </tr>
                    ) : (
                      report.transactions.map((tx, idx) => {
                        const cust = tx.customerName || (tx.tableNumber ? `Meja ${tx.tableNumber}` : 'Pelanggan Walk-In');
                        const itemsSummary = tx.items.map((i) => `${i.quantity}x ${i.product.name}`).join(', ');
                        const txTime = new Date(tx.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                        return (
                          <tr key={tx.id} className={idx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                            <td className="py-2 px-2.5 text-center border-r border-slate-200">{idx + 1}</td>
                            <td className="py-2 px-2.5 font-mono font-bold text-slate-800 border-r border-slate-200">#{tx.id}</td>
                            <td className="py-2 px-2.5 text-center text-slate-600 border-r border-slate-200">{txTime}</td>
                            <td className="py-2 px-2.5 text-slate-700 border-r border-slate-200">{tx.cashierName || 'Kasir'}</td>
                            <td className="py-2 px-2.5 font-medium text-slate-800 border-r border-slate-200">{cust}</td>
                            <td className="py-2 px-2.5 text-center border-r border-slate-200 font-semibold">{paymentNames[tx.paymentMethod] || tx.paymentMethod.toUpperCase()}</td>
                            <td className="py-2 px-2.5 text-slate-600 border-r border-slate-200 text-[10px] leading-tight">{itemsSummary}</td>
                            <td className="py-2 px-2.5 text-right font-mono text-slate-700 border-r border-slate-200">{formatRupiah(tx.subtotal)}</td>
                            <td className="py-2 px-2.5 text-right font-mono text-rose-600 border-r border-slate-200">{tx.discount > 0 ? `-${formatRupiah(tx.discount)}` : '-'}</td>
                            <td className="py-2 px-2.5 text-right font-mono font-bold text-emerald-800 border-r border-slate-200">{formatRupiah(tx.total)}</td>
                            <td className="py-2 px-2.5 text-center font-bold text-emerald-600">Selesai</td>
                          </tr>
                        );
                      })
                    )}
                    {report.transactions.length > 0 && (
                      <tr className="bg-emerald-50/80 font-bold border-t-2 border-emerald-600 text-emerald-950">
                        <td colSpan={7} className="py-2.5 px-3 text-center border-r border-slate-300">TOTAL KESELURUHAN NOTA HARI INI</td>
                        <td className="py-2.5 px-3 text-right font-mono border-r border-slate-300">{formatRupiah(report.totalNetSales + report.totalDiscounts)}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-rose-600 border-r border-slate-300">-{formatRupiah(report.totalDiscounts)}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-extrabold text-emerald-800 border-r border-slate-300">{formatRupiah(report.totalGrossSales)}</td>
                        <td className="py-2.5 px-3 text-center text-emerald-800">SELESAI</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tanda Tangan Penanggung Jawab */}
            <div className="pt-6 border-t border-slate-200 grid grid-cols-2 gap-8 text-center text-xs">
              <div>
                <p className="text-slate-500 font-medium">Kasir Bertugas</p>
                <div className="mt-12 font-bold text-slate-900 border-b border-dashed border-slate-400 pb-1 max-w-[200px] mx-auto">
                  ( ........................................ )
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Staf Operasional</p>
              </div>
              <div>
                <p className="text-slate-500 font-medium">Supervisor / Pemilik Toko</p>
                <div className="mt-12 font-bold text-slate-900 border-b border-dashed border-slate-400 pb-1 max-w-[200px] mx-auto">
                  ( ........................................ )
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Penanggung Jawab Toko</p>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:px-6 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 print:hidden">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>Format tabel rapi kompatibel dengan Microsoft Excel, WPS Office, Google Sheets, & PDF printer.</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs transition-all cursor-pointer"
            >
              Tutup
            </button>
            <button
              onClick={handleDownloadExcel}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Unduh Excel Tabel (.xls)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
