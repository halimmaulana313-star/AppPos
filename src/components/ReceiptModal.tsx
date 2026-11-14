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
  Eye,
  FileText,
  Play,
  Printer,
  RotateCw,
  X,
} from 'lucide-react';
import { Order, PrinterConfig, StoreProfile } from '../types/pos';
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
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  order,
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
  const [isSimulating, setIsSimulating] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen || !order) return null;

  const maxChars = getLineCharLimit(printerConfig.paperWidth);

  // Generate plain text formatted for thermal receipt
  const generateReceiptText = () => {
    const lines: string[] = [];
    lines.push(centerText(store.storeName, maxChars));
    if (store.tagline) lines.push(centerText(store.tagline, maxChars));
    if (store.address) lines.push(centerText(store.address, maxChars));
    if (store.phone) lines.push(centerText(`Telp: ${store.phone}`, maxChars));
    lines.push(createSeparator('=', maxChars));

    lines.push(justifyLine(`No: #${order.id}`, formatTimeOnly(order.timestamp), maxChars));
    lines.push(justifyLine(`Tgl: ${formatDateOnly(order.timestamp)}`, `Kasir: ${order.cashierName}`, maxChars));
    if (order.customerName || order.tableNumber) {
      lines.push(
        justifyLine(
          order.customerName ? `Plg: ${order.customerName}` : '',
          order.tableNumber ? `Meja: ${order.tableNumber}` : (order.orderType === 'takeaway' ? 'Bungkus' : ''),
          maxChars
        )
      );
    }
    lines.push(createSeparator('-', maxChars));

    order.items.forEach((item) => {
      lines.push(
        justifyLine(
          `${item.quantity}x ${item.product.name}`,
          formatNumber(item.product.price * item.quantity),
          maxChars
        )
      );
      if (item.note) lines.push(`  * ${item.note}`);
      if (item.discount > 0) {
        lines.push(justifyLine('  Diskon Item', `-${formatNumber(item.discount)}`, maxChars));
      }
    });

    lines.push(createSeparator('-', maxChars));
    lines.push(justifyLine('Subtotal', formatRupiah(order.subtotal), maxChars));
    if (order.discount > 0) {
      const pct = order.discountPercent ?? (order.subtotal > 0 ? Math.round((order.discount / order.subtotal) * 100) : 0);
      const discTitle = pct > 0 ? `Diskon Nota (${pct}%)` : 'Diskon Nota';
      lines.push(justifyLine(discTitle, `-${formatRupiah(order.discount)}`, maxChars));
    }
    if (order.taxAmount > 0) {
      lines.push(justifyLine(`Pajak (${Math.round(order.taxRate * 100)}%)`, formatRupiah(order.taxAmount), maxChars));
    }
    if (order.serviceChargeAmount > 0) {
      lines.push(justifyLine(`Layanan (${Math.round(order.serviceChargeRate * 100)}%)`, formatRupiah(order.serviceChargeAmount), maxChars));
    }
    lines.push(createSeparator('=', maxChars));
    lines.push(justifyLine('TOTAL', formatRupiah(order.total), maxChars));

    const methodLabels: Record<string, string> = {
      cash: 'TUNAI',
      qris: 'QRIS',
      transfer: 'TRANSFER',
      debit: 'DEBIT',
      credit: 'KREDIT',
    };
    lines.push(justifyLine('Metode Bayar', methodLabels[order.paymentMethod] || order.paymentMethod.toUpperCase(), maxChars));
    if (order.paymentMethod === 'cash') {
      lines.push(justifyLine('Bayar', formatRupiah(order.amountPaid), maxChars));
      lines.push(justifyLine('Kembalian', formatRupiah(order.change), maxChars));
    }
    lines.push(createSeparator('-', maxChars));

    if (printerConfig.printWifiInfo && store.wifiName) {
      lines.push(centerText(`WiFi: ${store.wifiName} | Pass: ${store.wifiPassword || '-'}`, maxChars));
    }
    if (printerConfig.printFooterNote && store.footerNote) {
      store.footerNote.split('\n').forEach((fn) => lines.push(centerText(fn, maxChars)));
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

      const bytes = bluetoothPrinter.generateReceiptBytes(order, store, printerConfig);
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
        setPrintSuccess('Simulasi cetak thermal selesai!');
        setTimeout(() => setPrintSuccess(null), 3000);
      }
    }, 180);
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(generateReceiptText());
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
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Struk Pembayaran</h3>
              <p className="text-xs text-slate-500 font-mono">#{order.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
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

        {/* Visual Receipt Preview Container */}
        <div className="p-4 sm:p-6 overflow-y-auto bg-slate-100 flex justify-center">
          <div
            className={`receipt-paper rounded-sm p-4 w-full ${
              printerConfig.paperWidth === '80mm' ? 'max-w-[340px]' : 'max-w-[280px]'
            } transition-all duration-300 font-mono-thermal text-xs text-slate-900 border border-slate-200 ${
              isSimulating ? 'translate-y-2 opacity-90' : ''
            }`}
          >
            {/* Top cut serration */}
            <div className="receipt-cut-top -mt-4 -mx-4 mb-3"></div>

            {/* Receipt Body */}
            <div className="space-y-1 text-center">
              {/* Store Logo on thermal receipt if enabled */}
              {printerConfig.printStoreLogo && store.logoUrl && (
                <div className="w-12 h-12 mx-auto mb-2 flex items-center justify-center grayscale contrast-150">
                  <img
                    src={store.logoUrl}
                    alt={store.storeName}
                    className="max-h-12 max-w-12 object-contain"
                  />
                </div>
              )}
              <div className="font-extrabold text-sm sm:text-base tracking-wide text-slate-900">
                {store.storeName}
              </div>
              {store.tagline && <p className="text-[11px] text-slate-600">{store.tagline}</p>}
              {store.address && <p className="text-[10px] text-slate-500">{store.address}</p>}
              {store.phone && <p className="text-[10px] text-slate-500">Telp: {store.phone}</p>}
            </div>

            <div className="my-2 border-t border-dashed border-slate-300" />

            {/* Metadata */}
            <div className="text-[11px] space-y-0.5 text-slate-700">
              <div className="flex justify-between">
                <span>No: #{order.id}</span>
                <span>{formatTimeOnly(order.timestamp)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tgl: {formatDateOnly(order.timestamp)}</span>
                <span>Kasir: {order.cashierName}</span>
              </div>
              {(order.customerName || order.tableNumber) && (
                <div className="flex justify-between">
                  <span>Plg: {order.customerName || '-'}</span>
                  <span>{order.tableNumber ? `Meja: ${order.tableNumber}` : 'Bungkus'}</span>
                </div>
              )}
            </div>

            <div className="my-2 border-t border-dashed border-slate-300" />

            {/* Items */}
            <div className="space-y-1 text-[11px]">
              {order.items.map((item, idx) => (
                <div key={idx} className="space-y-0.5">
                  <div className="flex justify-between font-medium">
                    <span className="truncate pr-2">
                      {item.quantity}x {item.product.name}
                    </span>
                    <span className="shrink-0">{formatNumber(item.product.price * item.quantity)}</span>
                  </div>
                  {item.note && <div className="text-[10px] text-slate-500 pl-3 italic">↳ {item.note}</div>}
                  {item.discount > 0 && (
                    <div className="flex justify-between text-[10px] text-emerald-600 pl-3">
                      <span>Diskon item</span>
                      <span>-{formatNumber(item.discount)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="my-2 border-t border-dashed border-slate-300" />

            {/* Calculations */}
            <div className="space-y-0.5 text-[11px] text-slate-700">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatRupiah(order.subtotal)}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-emerald-600">
                  <span>
                    Diskon Nota {order.discountPercent ? `(${order.discountPercent}%)` : (order.subtotal > 0 ? `(${Math.round((order.discount / order.subtotal) * 100)}%)` : '')}
                  </span>
                  <span>-{formatRupiah(order.discount)}</span>
                </div>
              )}
              {order.taxAmount > 0 && (
                <div className="flex justify-between">
                  <span>Pajak ({Math.round(order.taxRate * 100)}%)</span>
                  <span>{formatRupiah(order.taxAmount)}</span>
                </div>
              )}
              {order.serviceChargeAmount > 0 && (
                <div className="flex justify-between">
                  <span>Biaya Layanan ({Math.round(order.serviceChargeRate * 100)}%)</span>
                  <span>{formatRupiah(order.serviceChargeAmount)}</span>
                </div>
              )}
            </div>

            <div className="my-2 border-t-2 border-slate-800" />

            {/* Grand Total */}
            <div className="flex justify-between items-center text-sm font-extrabold text-slate-900">
              <span>TOTAL</span>
              <span className="text-base">{formatRupiah(order.total)}</span>
            </div>

            <div className="my-2 border-t border-dashed border-slate-300" />

            {/* Payment Details */}
            <div className="text-[11px] space-y-0.5 text-slate-700">
              <div className="flex justify-between">
                <span>Metode Bayar</span>
                <span className="font-semibold uppercase">{order.paymentMethod}</span>
              </div>
              {order.paymentMethod === 'cash' && (
                <>
                  <div className="flex justify-between">
                    <span>Nominal Bayar</span>
                    <span>{formatRupiah(order.amountPaid)}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Kembalian</span>
                    <span>{formatRupiah(order.change)}</span>
                  </div>
                </>
              )}
            </div>

            <div className="my-2 border-t border-dashed border-slate-300" />

            {/* Footer */}
            <div className="text-center text-[10px] text-slate-600 space-y-1 pt-1">
              {printerConfig.printWifiInfo && store.wifiName && (
                <p>
                  WiFi: <span className="font-bold">{store.wifiName}</span> | Pass:{' '}
                  <span className="font-bold">{store.wifiPassword || '-'}</span>
                </p>
              )}
              {printerConfig.printFooterNote && store.footerNote ? (
                <div className="whitespace-pre-line">{store.footerNote}</div>
              ) : (
                <>
                  <p>Terima Kasih Atas Kunjungan Anda!</p>
                  <p>Barang yang dibeli tidak dapat ditukar</p>
                </>
              )}
            </div>

            {/* Bottom cut serration */}
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
                title="Simulasi cetak thermal animasi & suara"
              >
                <Play className="w-3.5 h-3.5 text-blue-600" />
                <span>Simulasi Suara</span>
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

      {/* Hidden browser print element (activated by @media print) */}
      <div
        id="thermal-print-target"
        className={`hidden print:block ${printerConfig.paperWidth === '80mm' ? 'paper-80mm' : ''}`}
      >
        <pre className="font-mono text-xs whitespace-pre-wrap leading-tight">{generateReceiptText()}</pre>
      </div>
    </div>
  );
};
