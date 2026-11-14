/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  AlertCircle,
  Bluetooth,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  RotateCw,
  X,
} from 'lucide-react';
import { DailySalesReport, PrinterConfig, StoreProfile } from '../types/pos';
import { bluetoothPrinter, BluetoothPrinterState } from '../utils/bluetoothThermalPrinter';
import {
  centerText,
  createSeparator,
  formatDateOnly,
  formatDateTime,
  formatNumber,
  formatRupiah,
  formatTimeOnly,
  getLineCharLimit,
  justifyLine,
} from '../utils/formatters';
import { generateDailyReportReceiptPDF } from '../utils/receiptPdfGenerator';
import { sounds } from '../utils/soundEffects';

interface ReportReceiptModalProps {
  report: DailySalesReport | null;
  isOpen: boolean;
  onClose: () => void;
  store: StoreProfile;
  printerConfig: PrinterConfig;
  printerState: BluetoothPrinterState;
  onOpenPrinterModal: () => void;
}

export const ReportReceiptModal: React.FC<ReportReceiptModalProps> = ({
  report,
  isOpen,
  onClose,
  store,
  printerConfig,
  printerState,
  onOpenPrinterModal,
}) => {
  const [isPrinting, setIsPrinting] = useState(false);
  const [printSuccess, setPrintSuccess] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen || !report) return null;

  const maxChars = getLineCharLimit(printerConfig.paperWidth);

  const generateReportText = () => {
    const lines: string[] = [];
    lines.push(centerText('LAPORAN PENJUALAN HARIAN', maxChars));
    lines.push(centerText(store.storeName, maxChars));
    lines.push(createSeparator('=', maxChars));

    lines.push(justifyLine('Tanggal:', formatDateOnly(report.date), maxChars));
    lines.push(justifyLine('Dicetak:', formatDateTime(new Date().toISOString()), maxChars));
    lines.push(justifyLine('Kasir:', 'Kasir Utama', maxChars));
    lines.push(createSeparator('-', maxChars));

    lines.push('RINGKASAN PENJUALAN');
    lines.push(justifyLine('Total Transaksi', `${report.totalTransactions} Trx`, maxChars));
    lines.push(justifyLine('Item Terjual', `${report.totalItemsSold} Pcs`, maxChars));
    lines.push(justifyLine('AOV (Rata-rata/Nota)', formatRupiah(report.averageOrderValue), maxChars));
    lines.push(justifyLine('Total Diskon', formatRupiah(report.totalDiscounts), maxChars));
    lines.push(justifyLine('Total Pajak', formatRupiah(report.totalTax), maxChars));
    if (report.totalServiceCharge > 0) {
      lines.push(justifyLine('Total Layanan', formatRupiah(report.totalServiceCharge), maxChars));
    }

    lines.push(createSeparator('-', maxChars));
    lines.push(justifyLine('TOTAL OMSET', formatRupiah(report.totalGrossSales), maxChars));
    lines.push(createSeparator('=', maxChars));

    lines.push('RINCIAN PEMBAYARAN');
    lines.push(
      justifyLine(
        `Tunai (${report.paymentBreakdown.cash.count}x)`,
        formatRupiah(report.paymentBreakdown.cash.total),
        maxChars
      )
    );
    lines.push(
      justifyLine(
        `QRIS (${report.paymentBreakdown.qris.count}x)`,
        formatRupiah(report.paymentBreakdown.qris.total),
        maxChars
      )
    );
    lines.push(
      justifyLine(
        `Transfer (${report.paymentBreakdown.transfer.count}x)`,
        formatRupiah(report.paymentBreakdown.transfer.total),
        maxChars
      )
    );
    lines.push(
      justifyLine(
        `Debit/Kredit (${report.paymentBreakdown.debit.count + report.paymentBreakdown.credit.count}x)`,
        formatRupiah(report.paymentBreakdown.debit.total + report.paymentBreakdown.credit.total),
        maxChars
      )
    );

    lines.push(createSeparator('-', maxChars));
    lines.push('PRODUK TERLARIS (TOP SALES)');
    if (report.topProducts.length === 0) {
      lines.push(centerText('Belum ada transaksi', maxChars));
    } else {
      report.topProducts.slice(0, 5).forEach((p, idx) => {
        lines.push(justifyLine(`${idx + 1}. ${p.name}`, `${p.quantity}x | ${formatNumber(p.totalRevenue)}`, maxChars));
      });
    }

    lines.push(createSeparator('=', maxChars));
    lines.push(centerText('Tanda Tangan Penanggung Jawab', maxChars));
    lines.push('\n\n');
    lines.push(centerText('( .............................. )', maxChars));
    lines.push(centerText('Kasir / Supervisor Toko', maxChars));

    return lines.join('\n');
  };

  const handleBluetoothPrint = async () => {
    setIsPrinting(true);
    setPrintError(null);
    setPrintSuccess(null);

    try {
      if (!printerState.isConnected) {
        const res = await bluetoothPrinter.connect();
        if (!res.success) {
          throw new Error(res.error || 'Silakan sambungkan printer Bluetooth terlebih dahulu.');
        }
      }

      const bytes = bluetoothPrinter.generateDailyReportBytes(report, store, printerConfig);
      await bluetoothPrinter.sendRawData(bytes);

      setPrintSuccess('Laporan berhasil dicetak ke printer Bluetooth thermal!');
      sounds.playThermalTick();
      setTimeout(() => setPrintSuccess(null), 4000);
    } catch (err: any) {
      setPrintError(err.message || 'Gagal mencetak laporan ke printer Bluetooth.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadPDF = async () => {
    setIsGeneratingPdf(true);
    setPrintError(null);
    try {
      await generateDailyReportReceiptPDF(report, store, printerConfig);
      sounds.playCashRegister();
      setPrintSuccess(`File PDF laporan harian (${printerConfig.paperWidth}) berhasil diunduh!`);
      setTimeout(() => setPrintSuccess(null), 4000);
    } catch (err: any) {
      sounds.playError();
      setPrintError(err?.message || 'Gagal membuat file PDF laporan.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleBrowserPrint = () => {
    window.print();
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateReportText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Struk Laporan Harian (Z-Report)</h3>
              <p className="text-xs text-slate-500 font-mono">{formatDateOnly(report.date)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notifications */}
        {printSuccess && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2.5 text-emerald-800 text-xs font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{printSuccess}</span>
          </div>
        )}

        {printError && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-2.5 text-rose-800 text-xs font-medium">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <div className="flex-1">
              <p>{printError}</p>
              <button
                onClick={onOpenPrinterModal}
                className="mt-1 text-emerald-700 underline font-semibold hover:text-emerald-800"
              >
                Atur Koneksi Printer
              </button>
            </div>
          </div>
        )}

        {/* Paper Preview */}
        <div className="p-4 sm:p-6 overflow-y-auto bg-slate-100 flex justify-center">
          <div
            className={`receipt-paper rounded-sm p-4 w-full ${
              printerConfig.paperWidth === '80mm' ? 'max-w-[340px]' : 'max-w-[280px]'
            } font-mono-thermal text-xs text-slate-900 border border-slate-200`}
          >
            <div className="receipt-cut-top -mt-4 -mx-4 mb-3"></div>

            <div className="text-center space-y-1">
              <div className="font-extrabold text-sm sm:text-base tracking-wide text-slate-900">
                LAPORAN PENJUALAN HARIAN
              </div>
              <div className="font-bold text-xs text-slate-700">{store.storeName}</div>
            </div>

            <div className="my-2 border-t-2 border-slate-800" />

            <div className="text-[11px] space-y-0.5 text-slate-700">
              <div className="flex justify-between">
                <span>Tanggal:</span>
                <span className="font-semibold">{formatDateOnly(report.date)}</span>
              </div>
              <div className="flex justify-between">
                <span>Waktu Cetak:</span>
                <span>{formatTimeOnly(new Date().toISOString())}</span>
              </div>
              <div className="flex justify-between">
                <span>Kasir:</span>
                <span>Kasir Utama</span>
              </div>
            </div>

            <div className="my-2 border-t border-dashed border-slate-300" />

            {/* Summary */}
            <div className="font-bold text-[11px] text-slate-900 mb-1">RINGKASAN PENJUALAN</div>
            <div className="space-y-0.5 text-[11px] text-slate-700">
              <div className="flex justify-between">
                <span>Total Transaksi</span>
                <span className="font-bold">{report.totalTransactions} Trx</span>
              </div>
              <div className="flex justify-between">
                <span>Item Terjual</span>
                <span>{report.totalItemsSold} Pcs</span>
              </div>
              <div className="flex justify-between">
                <span>Rata-rata/Nota (AOV)</span>
                <span>{formatRupiah(report.averageOrderValue)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Diskon</span>
                <span>{formatRupiah(report.totalDiscounts)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Pajak</span>
                <span>{formatRupiah(report.totalTax)}</span>
              </div>
            </div>

            <div className="my-2 border-t border-dashed border-slate-300" />

            <div className="flex justify-between items-center text-sm font-extrabold text-slate-900">
              <span>TOTAL OMSET</span>
              <span className="text-base text-emerald-700">{formatRupiah(report.totalGrossSales)}</span>
            </div>

            <div className="my-2 border-t-2 border-slate-800" />

            {/* Payments */}
            <div className="font-bold text-[11px] text-slate-900 mb-1">RINCIAN PEMBAYARAN</div>
            <div className="space-y-0.5 text-[11px] text-slate-700">
              <div className="flex justify-between">
                <span>Tunai ({report.paymentBreakdown.cash.count}x)</span>
                <span>{formatRupiah(report.paymentBreakdown.cash.total)}</span>
              </div>
              <div className="flex justify-between">
                <span>QRIS ({report.paymentBreakdown.qris.count}x)</span>
                <span>{formatRupiah(report.paymentBreakdown.qris.total)}</span>
              </div>
              <div className="flex justify-between">
                <span>Transfer ({report.paymentBreakdown.transfer.count}x)</span>
                <span>{formatRupiah(report.paymentBreakdown.transfer.total)}</span>
              </div>
              <div className="flex justify-between">
                <span>Debit/Kredit ({report.paymentBreakdown.debit.count + report.paymentBreakdown.credit.count}x)</span>
                <span>{formatRupiah(report.paymentBreakdown.debit.total + report.paymentBreakdown.credit.total)}</span>
              </div>
            </div>

            <div className="my-2 border-t border-dashed border-slate-300" />

            {/* Top Products */}
            <div className="font-bold text-[11px] text-slate-900 mb-1">PRODUK TERLARIS</div>
            <div className="space-y-1 text-[11px]">
              {report.topProducts.slice(0, 5).map((p, idx) => (
                <div key={idx} className="flex justify-between text-slate-700">
                  <span className="truncate pr-2">
                    {idx + 1}. {p.name}
                  </span>
                  <span className="shrink-0 font-medium">{p.quantity}x</span>
                </div>
              ))}
            </div>

            <div className="my-3 border-t border-dashed border-slate-300" />

            {/* Signature Area */}
            <div className="text-center text-[10px] text-slate-600 pt-2 space-y-8">
              <p>Tanda Tangan Penanggung Jawab</p>
              <div className="border-b border-slate-400 w-3/4 mx-auto" />
              <p className="-mt-6">Kasir / Supervisor Toko</p>
            </div>

            <div className="receipt-cut-bottom -mb-4 -mx-4 mt-3"></div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="p-4 bg-white border-t border-slate-200 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleBluetoothPrint}
              disabled={isPrinting}
              className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm text-white shadow-md transition-all cursor-pointer ${
                printerState.isConnected
                  ? 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98]'
                  : 'bg-teal-600 hover:bg-teal-700 active:scale-[0.98]'
              } ${isPrinting ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {isPrinting ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>Mencetak...</span>
                </>
              ) : (
                <>
                  <Bluetooth className="w-4 h-4" />
                  <span>Cetak BT</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={isGeneratingPdf}
              className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm bg-rose-600 hover:bg-rose-700 text-white active:scale-[0.98] transition-all shadow-md shadow-rose-600/20 cursor-pointer ${
                isGeneratingPdf ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              {isGeneratingPdf ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>Membuat PDF...</span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  <span>Simpan PDF</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleBrowserPrint}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-semibold text-xs sm:text-sm bg-slate-800 text-white hover:bg-slate-900 active:scale-[0.98] transition-all shadow-sm cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Kertas</span>
            </button>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-semibold">Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin Teks Laporan</span>
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>

      {/* Hidden browser print element */}
      <div
        id="thermal-print-target"
        className={`hidden print:block ${printerConfig.paperWidth === '80mm' ? 'paper-80mm' : ''}`}
      >
        <pre className="font-mono text-xs whitespace-pre-wrap leading-tight">{generateReportText()}</pre>
      </div>
    </div>
  );
};
