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
  Lock,
  Printer,
  RotateCw,
  X,
} from 'lucide-react';
import { CashierClosing, PrinterConfig, StoreProfile } from '../types/pos';
import { bluetoothPrinter, BluetoothPrinterState } from '../utils/bluetoothThermalPrinter';
import {
  centerText,
  copyTextToClipboard,
  createSeparator,
  formatDateOnly,
  formatDateTime,
  formatRupiah,
  formatTimeOnly,
  getLineCharLimit,
  justifyLine,
} from '../utils/formatters';
import { sounds } from '../utils/soundEffects';

interface ClosingReceiptModalProps {
  closing: CashierClosing | null;
  isOpen: boolean;
  onClose: () => void;
  store: StoreProfile;
  printerConfig: PrinterConfig;
  printerState: BluetoothPrinterState;
  onOpenPrinterModal: () => void;
}

export const ClosingReceiptModal: React.FC<ClosingReceiptModalProps> = ({
  closing,
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
  const [copied, setCopied] = useState(false);

  if (!isOpen || !closing) return null;

  const maxChars = getLineCharLimit(printerConfig.paperWidth);

  const diffFormatted =
    closing.cashDifference === 0
      ? 'Pas (Rp 0)'
      : closing.cashDifference > 0
        ? `+${formatRupiah(closing.cashDifference)}`
        : `-${formatRupiah(Math.abs(closing.cashDifference))}`;

  const generateClosingText = () => {
    const lines: string[] = [];
    lines.push(centerText('STRUK TUTUPAN KASIR', maxChars));
    lines.push(centerText(store.storeName, maxChars));
    lines.push(createSeparator('=', maxChars));

    lines.push(justifyLine('No. Tutupan', `#${closing.id}`, maxChars));
    lines.push(justifyLine('Tgl Laporan', formatDateOnly(closing.date), maxChars));
    lines.push(justifyLine('Waktu Tutup', formatDateTime(closing.closedAt), maxChars));
    lines.push(justifyLine('Kasir', closing.cashierName, maxChars));
    if (closing.shiftLabel) {
      lines.push(justifyLine('Shift', closing.shiftLabel, maxChars));
    }
    lines.push(createSeparator('-', maxChars));

    lines.push('RINGKASAN PENJUALAN');
    lines.push(justifyLine('Total Transaksi', `${closing.totalTransactions} Trx`, maxChars));
    lines.push(justifyLine('Item Terjual', `${closing.totalItemsSold} Pcs`, maxChars));
    lines.push(justifyLine('Total Omset', formatRupiah(closing.totalSales), maxChars));
    lines.push(justifyLine('Tunai Sistem', formatRupiah(closing.systemCashSales), maxChars));
    lines.push(justifyLine('QRIS', formatRupiah(closing.qrisSales), maxChars));
    lines.push(justifyLine('Transfer Bank', formatRupiah(closing.transferSales), maxChars));
    lines.push(justifyLine('Debit / Kredit', formatRupiah(closing.cardSales), maxChars));
    lines.push(createSeparator('-', maxChars));

    lines.push('REKONSILIASI LACI KAS');
    lines.push(justifyLine('Modal Awal Laci', formatRupiah(closing.openingCash), maxChars));
    lines.push(justifyLine('Penjualan Tunai', formatRupiah(closing.systemCashSales), maxChars));
    lines.push(justifyLine('Kas Keluar', `-${formatRupiah(closing.cashOut)}`, maxChars));
    if (closing.cashOutNote) {
      lines.push(`  Ket: ${closing.cashOutNote}`);
    }
    lines.push(createSeparator('-', maxChars));
    lines.push(justifyLine('Kas Seharusnya', formatRupiah(closing.expectedCash), maxChars));
    lines.push(justifyLine('Kas Fisik Laci', formatRupiah(closing.actualCash), maxChars));
    lines.push(justifyLine('Selisih Kas', diffFormatted, maxChars));

    if (closing.notes) {
      lines.push(createSeparator('-', maxChars));
      lines.push(`Catatan: ${closing.notes}`);
    }

    lines.push(createSeparator('=', maxChars));
    lines.push(centerText('Disetujui Oleh Kasir & Owner', maxChars));
    lines.push('\n\n');
    lines.push(centerText('( ............ )   ( ............ )', maxChars));

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

      const bytes = bluetoothPrinter.generateCashierClosingBytes(closing, store, printerConfig);
      await bluetoothPrinter.sendRawData(bytes);

      setPrintSuccess('Struk Tutupan Kasir berhasil dicetak ke printer Bluetooth!');
      sounds.playThermalTick();
      setTimeout(() => setPrintSuccess(null), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mencetak struk tutupan kasir.';
      setPrintError(msg);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleBrowserPrint = () => {
    window.print();
  };

  const handleCopy = () => {
    void copyTextToClipboard(generateClosingText()).then((ok) => {
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Struk Tutupan Kasir</h3>
              <p className="text-xs text-slate-500 font-mono">
                {formatDateOnly(closing.date)} · {closing.shiftLabel || 'Full Day'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
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
                type="button"
                onClick={onOpenPrinterModal}
                className="mt-1 text-emerald-700 underline font-semibold hover:text-emerald-800 cursor-pointer"
              >
                Atur Koneksi Printer
              </button>
            </div>
          </div>
        )}

        {/* Thermal Paper Preview */}
        <div className="p-4 sm:p-6 overflow-y-auto bg-slate-100 flex justify-center">
          <div
            className={`receipt-paper rounded-sm p-4 w-full ${
              printerConfig.paperWidth === '80mm' ? 'max-w-[340px]' : 'max-w-[280px]'
            } font-mono-thermal text-xs text-slate-900 border border-slate-200 bg-white`}
          >
            <div className="receipt-cut-top -mt-4 -mx-4 mb-3"></div>

            <div className="text-center space-y-1">
              <div className="font-extrabold text-sm sm:text-base tracking-wide text-slate-900">
                STRUK TUTUPAN KASIR
              </div>
              <div className="font-bold text-xs text-slate-700">{store.storeName}</div>
            </div>

            <div className="my-2 border-t-2 border-slate-800" />

            <div className="text-[11px] space-y-0.5 text-slate-700 tabular-nums">
              <div className="flex justify-between gap-2">
                <span>No. Tutupan</span>
                <span className="font-semibold">#{closing.id}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Tgl Laporan</span>
                <span className="font-semibold">{formatDateOnly(closing.date)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Waktu Tutup</span>
                <span>{formatTimeOnly(closing.closedAt)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span>Kasir</span>
                <span className="font-semibold">{closing.cashierName}</span>
              </div>
              {closing.shiftLabel && (
                <div className="flex justify-between gap-2">
                  <span>Shift</span>
                  <span>{closing.shiftLabel}</span>
                </div>
              )}
            </div>

            <div className="my-2 border-t border-dashed border-slate-300" />

            <div className="font-bold text-[11px] text-slate-900 mb-1">RINGKASAN PENJUALAN</div>
            <div className="space-y-0.5 text-[11px] text-slate-700 tabular-nums">
              <div className="flex justify-between">
                <span>Total Transaksi</span>
                <span className="font-bold">{closing.totalTransactions} Trx</span>
              </div>
              <div className="flex justify-between">
                <span>Item Terjual</span>
                <span>{closing.totalItemsSold} Pcs</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900">
                <span>Total Omset</span>
                <span>{formatRupiah(closing.totalSales)}</span>
              </div>
              <div className="flex justify-between">
                <span>QRIS</span>
                <span>{formatRupiah(closing.qrisSales)}</span>
              </div>
              <div className="flex justify-between">
                <span>Transfer Bank</span>
                <span>{formatRupiah(closing.transferSales)}</span>
              </div>
              <div className="flex justify-between">
                <span>Kartu Debit/Kredit</span>
                <span>{formatRupiah(closing.cardSales)}</span>
              </div>
            </div>

            <div className="my-2 border-t border-dashed border-slate-300" />

            <div className="font-bold text-[11px] text-slate-900 mb-1">REKONSILIASI LACI KAS</div>
            <div className="space-y-0.5 text-[11px] text-slate-700 tabular-nums">
              <div className="flex justify-between">
                <span>Modal Awal Laci</span>
                <span>{formatRupiah(closing.openingCash)}</span>
              </div>
              <div className="flex justify-between">
                <span>Penjualan Tunai</span>
                <span>{formatRupiah(closing.systemCashSales)}</span>
              </div>
              <div className="flex justify-between">
                <span>Kas Keluar</span>
                <span>-{formatRupiah(closing.cashOut)}</span>
              </div>
              {closing.cashOutNote && (
                <div className="text-[10px] text-slate-500 pl-2">Ket: {closing.cashOutNote}</div>
              )}
            </div>

            <div className="my-2 border-t border-dashed border-slate-300" />

            <div className="space-y-1 text-[11px] tabular-nums">
              <div className="flex justify-between font-bold text-slate-900">
                <span>Kas Seharusnya</span>
                <span>{formatRupiah(closing.expectedCash)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900">
                <span>Kas Fisik Laci</span>
                <span>{formatRupiah(closing.actualCash)}</span>
              </div>
              <div
                className={`flex justify-between font-extrabold pt-1 border-t border-slate-200 ${
                  closing.cashDifference === 0
                    ? 'text-emerald-700'
                    : closing.cashDifference > 0
                      ? 'text-blue-700'
                      : 'text-rose-700'
                }`}
              >
                <span>Selisih Kas</span>
                <span>{diffFormatted}</span>
              </div>
            </div>

            {closing.notes && (
              <>
                <div className="my-2 border-t border-dashed border-slate-300" />
                <div className="text-[10px] text-slate-600">Catatan: {closing.notes}</div>
              </>
            )}

            <div className="my-3 border-t border-dashed border-slate-300" />

            <div className="text-center text-[10px] text-slate-600 pt-1 space-y-7">
              <p>Tanda Tangan Kasir &amp; Supervisor</p>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <div className="border-b border-slate-400" />
                  <p className="mt-1">Kasir</p>
                </div>
                <div>
                  <div className="border-b border-slate-400" />
                  <p className="mt-1">Owner</p>
                </div>
              </div>
            </div>

            <div className="receipt-cut-bottom -mb-4 -mx-4 mt-3"></div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="p-4 bg-white border-t border-slate-200 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                  <span>Cetak Bluetooth</span>
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
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700 font-semibold">Tersalin</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Salin Teks Tutupan</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>

      {/* Hidden browser print target */}
      <div
        id="thermal-print-target"
        className={`hidden print:block ${printerConfig.paperWidth === '80mm' ? 'paper-80mm' : ''}`}
      >
        <pre className="font-mono text-xs whitespace-pre-wrap leading-tight">
          {generateClosingText()}
        </pre>
      </div>
    </div>
  );
};
