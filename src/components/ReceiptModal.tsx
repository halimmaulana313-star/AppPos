/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Bluetooth,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Pencil,
  Play,
  Printer,
  RotateCw,
  X,
} from 'lucide-react';
import { Order, PrinterConfig, StoreProfile } from '../types/pos';
import { bluetoothPrinter, BluetoothPrinterState } from '../utils/bluetoothThermalPrinter';
import {
  centerText,
  copyTextToClipboard,
  createSeparator,
  formatNumber,
  formatOrderTypeLabel,
  formatPaymentMethodLabel,
  formatRupiah,
  formatShortDate,
  formatTimeOnly,
  getLineCharLimit,
  justifyWrappedLines,
  resolveReceiptTexts,
  wrapTextLines,
} from '../utils/formatters';
import { generateOrderReceiptPDF } from '../utils/receiptPdfGenerator';
import { sounds } from '../utils/soundEffects';

interface ReceiptModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  store: StoreProfile;
  printerConfig: PrinterConfig;
  printerState: BluetoothPrinterState;
  onOpenPrinterModal: () => void;
  isMaster?: boolean;
  onOpenReceiptEditor?: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  order,
  isOpen,
  onClose,
  store,
  printerConfig,
  printerState,
  onOpenPrinterModal,
  isMaster = false,
  onOpenReceiptEditor,
}) => {
  const [isPrinting, setIsPrinting] = useState(false);
  const [printSuccess, setPrintSuccess] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen || !order) return;
    document.body.classList.add('thermal-print-active');
    return () => {
      document.body.classList.remove('thermal-print-active');
    };
  }, [isOpen, order]);

  if (!isOpen || !order) return null;

  const maxChars = getLineCharLimit(printerConfig.paperWidth, printerConfig.customCharPerLine);
  const rt = resolveReceiptTexts(store);

  // Generate plain text formatted for thermal receipt (Salin Struk)
  const generateReceiptText = () => {
    const lines: string[] = [];
    wrapTextLines(store.storeName, maxChars).forEach((ln) => lines.push(centerText(ln, maxChars)));
    if (store.tagline) wrapTextLines(store.tagline, maxChars).forEach((ln) => lines.push(centerText(ln, maxChars)));
    if (store.address) wrapTextLines(store.address, maxChars).forEach((ln) => lines.push(centerText(ln, maxChars)));
    if (store.phone) lines.push(centerText(`${rt.phoneLabel}: ${store.phone}`, maxChars));
    if (rt.headerNote) {
      rt.headerNote.split(/\r?\n/).forEach((hn) => {
        if (hn.trim()) wrapTextLines(hn, maxChars).forEach((ln) => lines.push(centerText(ln, maxChars)));
      });
    }
    lines.push(createSeparator('=', maxChars));

    lines.push(...justifyWrappedLines(`${rt.receiptNumberLabel}: #${order.id}`, formatTimeOnly(order.timestamp), maxChars));
    lines.push(...justifyWrappedLines(`${rt.dateLabel}: ${formatShortDate(order.timestamp)}`, `${rt.cashierLabel}: ${order.cashierName}`, maxChars));
    if (order.customerName || order.tableNumber || order.orderType !== 'dine_in') {
      lines.push(
        ...justifyWrappedLines(
          `${rt.customerLabel}: ${order.customerName || '-'}`,
          formatOrderTypeLabel(order.orderType, order.tableNumber),
          maxChars
        )
      );
    }
    lines.push(createSeparator('-', maxChars));

    order.items.forEach((item) => {
      lines.push(
        ...justifyWrappedLines(
          `${item.quantity}x ${item.product.name}`,
          formatNumber(item.product.price * item.quantity),
          maxChars
        )
      );
      if (item.note) wrapTextLines(`  * ${item.note}`, maxChars).forEach((ln) => lines.push(ln));
      if (item.discount > 0) {
        lines.push(...justifyWrappedLines('  Diskon Item', `-${formatNumber(item.discount)}`, maxChars));
      }
    });

    lines.push(createSeparator('-', maxChars));
    lines.push(...justifyWrappedLines(rt.subtotalLabel, formatRupiah(order.subtotal), maxChars));
    if (order.discount > 0) {
      const pct = order.discountPercent ?? (order.subtotal > 0 ? Math.round((order.discount / order.subtotal) * 100) : 0);
      const discTitle = pct > 0 ? `${rt.discountLabel} (${pct}%)` : rt.discountLabel;
      lines.push(...justifyWrappedLines(discTitle, `-${formatRupiah(order.discount)}`, maxChars));
    }
    if (order.taxAmount > 0) {
      lines.push(...justifyWrappedLines(`${rt.taxLabel} (${Math.round(order.taxRate * 100)}%)`, formatRupiah(order.taxAmount), maxChars));
    }
    if (order.serviceChargeAmount > 0) {
      lines.push(
        ...justifyWrappedLines(
          `${rt.serviceLabel} (${Math.round(order.serviceChargeRate * 100)}%)`,
          formatRupiah(order.serviceChargeAmount),
          maxChars
        )
      );
    }
    lines.push(createSeparator('=', maxChars));
    lines.push(...justifyWrappedLines(rt.totalLabel, formatRupiah(order.total), maxChars));
    lines.push(createSeparator('-', maxChars));

    lines.push(...justifyWrappedLines(rt.paymentMethodLabel, formatPaymentMethodLabel(order.paymentMethod), maxChars));
    if (order.paymentMethod === 'cash') {
      lines.push(...justifyWrappedLines(rt.amountPaidLabel, formatRupiah(order.amountPaid), maxChars));
      lines.push(...justifyWrappedLines(rt.changeLabel, formatRupiah(order.change), maxChars));
    }
    lines.push(createSeparator('-', maxChars));

    if (printerConfig.printWifiInfo && store.wifiName) {
      wrapTextLines(`${rt.wifiLabel}: ${store.wifiName} | ${rt.wifiPasswordLabel}: ${store.wifiPassword || '-'}`, maxChars).forEach((ln) =>
        lines.push(centerText(ln, maxChars))
      );
    }
    if (printerConfig.printFooterNote && store.footerNote) {
      store.footerNote.split(/\r?\n/).forEach((fn) =>
        wrapTextLines(fn, maxChars).forEach((ln) => lines.push(centerText(ln, maxChars)))
      );
    } else {
      lines.push(centerText('Terima Kasih Atas Kunjungan Anda!', maxChars));
      lines.push(centerText('Barang yang dibeli tidak dapat ditukar', maxChars));
    }

    return lines.join('\n');
  };

  const handleBluetoothPrint = async () => {
    setIsPrinting(true);
    setPrintError(null);
    setPrintSuccess(null);

    try {
      if (!printerState.isConnected) {
        // Attempt quick connect
        const res = await bluetoothPrinter.connect();
        if (!res.success) {
          throw new Error(res.error || 'Silakan sambungkan ke printer Bluetooth terlebih dahulu.');
        }
      }

      const bytes = await bluetoothPrinter.generateReceiptBytesWithLogo(order, store, printerConfig);
      await bluetoothPrinter.sendRawData(bytes);

      setPrintSuccess('Struk berhasil dikirim ke printer thermal Bluetooth!');
      sounds.playThermalTick();
      setTimeout(() => setPrintSuccess(null), 4000);
    } catch (err: any) {
      setPrintError(err.message || 'Gagal mencetak ke printer Bluetooth.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadPDF = async () => {
    setIsGeneratingPdf(true);
    setPrintError(null);
    try {
      await generateOrderReceiptPDF(order, store, printerConfig);
      sounds.playCashRegister();
      setPrintSuccess(`File PDF struk (${printerConfig.paperWidth}) berhasil dibuat & diunduh!`);
      setTimeout(() => setPrintSuccess(null), 4000);
    } catch (err: any) {
      sounds.playError();
      setPrintError(err?.message || 'Gagal membuat file PDF struk.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleBrowserPrint = () => {
    window.print();
  };

  const handleSimulatePrint = () => {
    setIsSimulating(true);
    let ticks = 0;
    const interval = setInterval(() => {
      sounds.playThermalTick();
      ticks++;
      if (ticks >= 7) {
        clearInterval(interval);
        setIsSimulating(false);
        setPrintSuccess('Tes cetak thermal selesai!');
        setTimeout(() => setPrintSuccess(null), 3000);
      }
    }, 180);
  };

  const handleCopyText = () => {
    void copyTextToClipboard(generateReceiptText()).then((ok) => {
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    });
  };

  // Shared visual receipt body used for both on-screen preview and browser print (#thermal-print-target)
  const receiptBody = (
    <>
      {/* Receipt Header */}
      <div className="space-y-1 text-center">
        {printerConfig.printStoreLogo && store.logoUrl && (
          <div className="w-16 h-16 mx-auto mb-2 flex items-center justify-center grayscale contrast-125 print:filter-none">
            <img
              src={store.logoUrl}
              alt={store.storeName}
              loading="eager"
              decoding="sync"
              className="max-h-16 max-w-16 w-auto h-auto object-contain print:block"
            />
          </div>
        )}
        <div className="font-extrabold text-sm sm:text-base tracking-wide text-slate-900 print:text-black">
          {store.storeName}
        </div>
        {store.tagline && <p className="text-[11px] text-slate-600 print:text-black">{store.tagline}</p>}
        {store.address && <p className="text-[10px] text-slate-500 print:text-black">{store.address}</p>}
        {store.phone && <p className="text-[10px] text-slate-500 print:text-black">{rt.phoneLabel}: {store.phone}</p>}
        {rt.headerNote && (
          <p className="text-[10px] text-slate-600 print:text-black italic whitespace-pre-line pt-0.5">
            {rt.headerNote}
          </p>
        )}
      </div>

      <div className="my-2 border-t border-dashed border-slate-300 print:border-slate-700" />

      {/* Metadata */}
      <div className="text-[11px] space-y-0.5 text-slate-700 print:text-black tabular-nums">
        <div className="flex justify-between gap-2">
          <span className="break-all">{rt.receiptNumberLabel}: #{order.id}</span>
          <span className="shrink-0">{formatTimeOnly(order.timestamp)}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>{rt.dateLabel}: {formatShortDate(order.timestamp)}</span>
          <span className="text-right break-words">{rt.cashierLabel}: {order.cashierName}</span>
        </div>
        {(order.customerName || order.tableNumber || order.orderType !== 'dine_in') && (
          <div className="flex justify-between gap-2">
            <span className="break-words">{rt.customerLabel}: {order.customerName || '-'}</span>
            <span className="shrink-0">{formatOrderTypeLabel(order.orderType, order.tableNumber)}</span>
          </div>
        )}
      </div>

      <div className="my-2 border-t border-dashed border-slate-300 print:border-slate-700" />

      {/* Items */}
      <div className="space-y-1 text-[11px] tabular-nums">
        {order.items.map((item, idx) => (
          <div key={idx} className="space-y-0.5">
            <div className="flex justify-between items-start gap-2 font-medium text-slate-900 print:text-black">
              <span className="break-words min-w-0">
                {item.quantity}x {item.product.name}
              </span>
              <span className="shrink-0 text-right">{formatNumber(item.product.price * item.quantity)}</span>
            </div>
            {item.note && (
              <div className="text-[10px] text-slate-500 print:text-slate-700 pl-3 italic break-words">
                ↳ {item.note}
              </div>
            )}
            {item.discount > 0 && (
              <div className="flex justify-between text-[10px] text-emerald-600 print:text-black pl-3">
                <span>Diskon item</span>
                <span>-{formatNumber(item.discount)}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="my-2 border-t border-dashed border-slate-300 print:border-slate-700" />

      {/* Calculations */}
      <div className="space-y-0.5 text-[11px] text-slate-700 print:text-black tabular-nums">
        <div className="flex justify-between gap-2">
          <span>{rt.subtotalLabel}</span>
          <span className="shrink-0">{formatRupiah(order.subtotal)}</span>
        </div>
        {order.discount > 0 && (
          <div className="flex justify-between gap-2 text-emerald-600 print:text-black">
            <span>
              {rt.discountLabel}{' '}
              {order.discountPercent
                ? `(${order.discountPercent}%)`
                : order.subtotal > 0
                  ? `(${Math.round((order.discount / order.subtotal) * 100)}%)`
                  : ''}
            </span>
            <span className="shrink-0">-{formatRupiah(order.discount)}</span>
          </div>
        )}
        {order.taxAmount > 0 && (
          <div className="flex justify-between gap-2">
            <span>{rt.taxLabel} ({Math.round(order.taxRate * 100)}%)</span>
            <span className="shrink-0">{formatRupiah(order.taxAmount)}</span>
          </div>
        )}
        {order.serviceChargeAmount > 0 && (
          <div className="flex justify-between gap-2">
            <span>{rt.serviceLabel} ({Math.round(order.serviceChargeRate * 100)}%)</span>
            <span className="shrink-0">{formatRupiah(order.serviceChargeAmount)}</span>
          </div>
        )}
      </div>

      <div className="my-2 border-t-2 border-slate-800 print:border-black" />

      {/* Grand Total */}
      <div className="flex justify-between items-center gap-2 text-sm font-extrabold text-slate-900 print:text-black tabular-nums">
        <span>{rt.totalLabel}</span>
        <span className="text-base">{formatRupiah(order.total)}</span>
      </div>

      <div className="my-2 border-t border-dashed border-slate-300 print:border-slate-700" />

      {/* Payment Details */}
      <div className="text-[11px] space-y-0.5 text-slate-700 print:text-black tabular-nums">
        <div className="flex justify-between gap-2">
          <span>{rt.paymentMethodLabel}</span>
          <span className="font-semibold uppercase">{formatPaymentMethodLabel(order.paymentMethod)}</span>
        </div>
        {order.paymentMethod === 'cash' && (
          <>
            <div className="flex justify-between gap-2">
              <span>{rt.amountPaidLabel}</span>
              <span>{formatRupiah(order.amountPaid)}</span>
            </div>
            <div className="flex justify-between gap-2 font-medium">
              <span>{rt.changeLabel}</span>
              <span>{formatRupiah(order.change)}</span>
            </div>
          </>
        )}
      </div>

      <div className="my-2 border-t border-dashed border-slate-300 print:border-slate-700" />

      {/* Footer */}
      <div className="text-center text-[10px] text-slate-600 print:text-black space-y-1 pt-1">
        {printerConfig.printWifiInfo && store.wifiName && (
          <p className="break-words">
            {rt.wifiLabel}: <span className="font-bold">{store.wifiName}</span> | {rt.wifiPasswordLabel}:{' '}
            <span className="font-bold">{store.wifiPassword || '-'}</span>
          </p>
        )}
        {printerConfig.printFooterNote && store.footerNote ? (
          <div className="whitespace-pre-line break-words">{store.footerNote}</div>
        ) : (
          <>
            <p>Terima Kasih Atas Kunjungan Anda!</p>
            <p>Barang yang dibeli tidak dapat ditukar</p>
          </>
        )}
      </div>
    </>
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Printer className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-800 text-base">Struk Pembayaran</h3>
              <p className="text-xs text-slate-500 font-mono truncate">#{order.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isMaster && onOpenReceiptEditor && (
              <button
                type="button"
                onClick={onOpenReceiptEditor}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-300 hover:bg-amber-100 text-[11px] font-bold text-amber-800 transition-colors cursor-pointer"
                title="Edit kata-kata & label struk (Khusus Master)"
              >
                <Pencil className="w-3 h-3" />
                <span>Edit Kata Struk</span>
              </button>
            )}
            <button
              type="button"
              onClick={onOpenPrinterModal}
              className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-emerald-400 text-[11px] font-semibold text-slate-600 hover:text-emerald-700 transition-colors cursor-pointer"
              title="Ubah ukuran kertas & pengaturan printer"
            >
              {printerConfig.paperWidth} · {maxChars} kol
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status notification */}
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
                Buka Pengaturan Printer
              </button>
            </div>
          </div>
        )}

        {store.logoUrl && !printerConfig.printStoreLogo && (
          <div className="mx-5 mt-3 p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-2 text-amber-900 text-xs">
            <span>Opsi cetak logo pada struk sedang nonaktif.</span>
            <button
              type="button"
              onClick={onOpenPrinterModal}
              className="font-bold text-amber-800 underline hover:text-amber-950 shrink-0 cursor-pointer"
            >
              Aktifkan
            </button>
          </div>
        )}

        {/* Visual Receipt Preview Container */}
        <div className="p-4 sm:p-6 overflow-y-auto bg-slate-100 flex justify-center">
          <div
            className={`receipt-paper rounded-sm p-4 w-full ${
              printerConfig.paperWidth === '80mm' ? 'max-w-[340px]' : 'max-w-[280px]'
            } transition-all duration-300 font-mono-thermal text-xs text-slate-900 border border-slate-200 ${
              isSimulating ? 'translate-y-2 opacity-90' : ''
            }`}
          >
            <div className="receipt-cut-top -mt-4 -mx-4 mb-3"></div>
            {receiptBody}
            <div className="receipt-cut-bottom -mb-4 -mx-4 mt-3"></div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="p-4 bg-white border-t border-slate-200 space-y-2">
          {/* Primary Print & PDF Buttons */}
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
                  <span>{printerState.isConnected ? 'Cetak BT' : 'Bluetooth'}</span>
                </>
              )}
            </button>

            {/* Direct Download PDF Button */}
            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={isGeneratingPdf}
              className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm bg-rose-600 hover:bg-rose-700 text-white active:scale-[0.98] transition-all shadow-md shadow-rose-600/20 cursor-pointer ${
                isGeneratingPdf ? 'opacity-70 cursor-not-allowed' : ''
              }`}
              title="Unduh struk pembayaran langsung menjadi file PDF"
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

            {/* Browser print button */}
            <button
              type="button"
              onClick={handleBrowserPrint}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-semibold text-xs sm:text-sm bg-slate-800 text-white hover:bg-slate-900 active:scale-[0.98] transition-all shadow-sm cursor-pointer"
              title="Cetak lewat dialog printer browser / USB"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Kertas</span>
            </button>
          </div>

          {/* Secondary Actions */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleSimulatePrint}
                disabled={isSimulating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                title="Tes suara & tampilan cetak thermal"
              >
                <Play className="w-3.5 h-3.5 text-blue-600" />
                <span>Tes Suara</span>
              </button>

              <button
                onClick={handleCopyText}
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
                    <span>Salin Struk</span>
                  </>
                )}
              </button>
            </div>

            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Pesanan Baru / Tutup
            </button>
          </div>
        </div>
      </div>

      {/* Portaled visual print target matching preview 1:1 */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            id="thermal-print-target"
            className={`hidden print:block ${printerConfig.paperWidth === '80mm' ? 'paper-80mm' : ''}`}
          >
            <div className="receipt-paper font-mono-thermal text-xs text-black">{receiptBody}</div>
          </div>,
          document.body
        )}
    </div>
  );
};
