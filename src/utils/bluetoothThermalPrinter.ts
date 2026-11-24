/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CashierClosing,
  DailySalesReport,
  Order,
  PrinterConfig,
  StoreProfile,
} from '../types/pos';
import {
  centerText,
  createSeparator,
  formatDateOnly,
  formatDateTime,
  formatNumber,
  formatOrderTypeLabel,
  formatPaymentMethodLabel,
  formatRupiah,
  formatShortDate,
  formatTimeOnly,
  getLineCharLimit,
  justifyWrappedLines,
  resolveReceiptTexts,
  sanitizeThermalAscii,
  wrapTextLines,
} from './formatters';
import { sanitizeSafeImageUrl } from './sanitize';

// Common Bluetooth Low Energy (BLE) Thermal Printer Service UUIDs
const KNOWN_PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard Printer Service
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent UART (Most common on POS-58 / Panda / MPT)
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Pos-58 series
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HMSoft / Feasycom UART
  '0000fff0-0000-1000-8000-00805f9b34fb', // Chinese generic thermal
  '0000ff00-0000-1000-8000-00805f9b34fb',
];

export interface BluetoothPrinterState {
  isSupported: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  deviceName: string | null;
  error: string | null;
}

class BluetoothThermalPrinterManager {
  private device: any | null = null;
  private characteristic: any | null = null;
  private isConnecting: boolean = false;
  private stateChangeListeners: ((state: BluetoothPrinterState) => void)[] = [];

  constructor() {
    // Listen for disconnects
  }

  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'bluetooth' in navigator &&
      typeof (navigator as any).bluetooth?.requestDevice === 'function'
    );
  }

  getState(): BluetoothPrinterState {
    return {
      isSupported: this.isSupported(),
      isConnected: Boolean(this.characteristic && this.device?.gatt?.connected),
      isConnecting: this.isConnecting,
      deviceName: this.device?.name || null,
      error: null,
    };
  }

  subscribe(listener: (state: BluetoothPrinterState) => void): () => void {
    this.stateChangeListeners.push(listener);
    listener(this.getState());
    return () => {
      this.stateChangeListeners = this.stateChangeListeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    const state = this.getState();
    this.stateChangeListeners.forEach((listener) => listener(state));
  }

  /**
   * Scan and connect to Bluetooth Thermal Printer
   */
  async connect(): Promise<{ success: boolean; deviceName?: string; error?: string }> {
    if (!this.isSupported()) {
      return {
        success: false,
        error: 'Web Bluetooth tidak didukung pada browser ini. Silakan gunakan Google Chrome di Android atau Desktop.',
      };
    }

    try {
      this.isConnecting = true;
      this.notify();

      // Request device with printer filters and fallback to acceptAllDevices
      let device: any = null;
      try {
        device = await (navigator as any).bluetooth.requestDevice({
          filters: [
            { namePrefix: 'MPT' },
            { namePrefix: 'POS' },
            { namePrefix: 'RPP' },
            { namePrefix: 'Panda' },
            { namePrefix: 'Thermal' },
            { namePrefix: 'Printer' },
            { namePrefix: 'Iware' },
            { namePrefix: 'VSC' },
            { namePrefix: 'Eppos' },
            { namePrefix: 'ZJ' },
          ],
          optionalServices: KNOWN_PRINTER_SERVICES,
        });
      } catch (err: any) {
        if (err.name === 'NotFoundError' || err.message?.includes('cancelled')) {
          this.isConnecting = false;
          this.notify();
          return { success: false, error: 'Pencarian printer dibatalkan oleh pengguna.' };
        }
        // Fallback: accept all devices
        device = await (navigator as any).bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: KNOWN_PRINTER_SERVICES,
        });
      }

      if (!device) {
        throw new Error('Tidak ada printer yang dipilih.');
      }

      this.device = device;
      device.addEventListener('gattserverdisconnected', () => {
        this.characteristic = null;
        this.notify();
      });

      // Connect to GATT Server
      const server = await device.gatt.connect();

      // Find primary service and writable characteristic
      let writeChar: any = null;

      // Try known services first
      for (const serviceUuid of KNOWN_PRINTER_SERVICES) {
        try {
          const service = await server.getPrimaryService(serviceUuid);
          const characteristics = await service.getCharacteristics();
          for (const char of characteristics) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
              writeChar = char;
              break;
            }
          }
          if (writeChar) break;
        } catch {
          // Continue to next service
        }
      }

      // If not found in known services, inspect all services
      if (!writeChar) {
        try {
          const services = await server.getPrimaryServices();
          for (const service of services) {
            try {
              const characteristics = await service.getCharacteristics();
              for (const char of characteristics) {
                if (char.properties.write || char.properties.writeWithoutResponse) {
                  writeChar = char;
                  break;
                }
              }
              if (writeChar) break;
            } catch {
              // ignore
            }
          }
        } catch {
          // ignore
        }
      }

      if (!writeChar) {
        throw new Error('Karakteristik penulisan printer tidak ditemukan pada perangkat ini.');
      }

      this.characteristic = writeChar;
      this.isConnecting = false;
      this.notify();

      return {
        success: true,
        deviceName: device.name || 'Printer Bluetooth',
      };
    } catch (error: any) {
      this.isConnecting = false;
      this.notify();
      return {
        success: false,
        error: error.message || 'Gagal terhubung ke printer Bluetooth.',
      };
    }
  }

  async disconnect(): Promise<void> {
    if (this.device && this.device.gatt?.connected) {
      await this.device.gatt.disconnect();
    }
    this.device = null;
    this.characteristic = null;
    this.notify();
  }

  /**
   * Send raw byte buffer to printer in safe MTU chunks with slight delay
   */
  async sendRawData(data: Uint8Array): Promise<boolean> {
    if (!this.characteristic) {
      throw new Error('Printer Bluetooth belum terhubung.');
    }

    const CHUNK_SIZE = 40; // 40 bytes per chunk is safe across all BLE thermal printers
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      if (this.characteristic.writeValueWithoutResponse) {
        await this.characteristic.writeValueWithoutResponse(chunk);
      } else {
        await this.characteristic.writeValue(chunk);
      }
      await delay(20); // Small pause to prevent buffer overrun
    }

    return true;
  }

  /**
   * Convert store logo URL into ESC/POS GS v 0 monochrome raster bitmap bytes.
   * Composites onto white background and applies Floyd-Steinberg dithering for crisp thermal output.
   */
  private async imageToEscPosRaster(
    logoUrl: string | undefined,
    maxDotWidth: number,
    maxDotHeight: number
  ): Promise<number[] | null> {
    if (typeof document === 'undefined' || !logoUrl) return null;
    const safeUrl = sanitizeSafeImageUrl(logoUrl, { allowPresetSvg: true, maxLength: 350000 });
    if (!safeUrl) return null;

    return new Promise<number[] | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timer = setTimeout(() => resolve(null), 2500);

      img.onload = () => {
        clearTimeout(timer);
        try {
          const naturalW = img.naturalWidth || img.width || 128;
          const naturalH = img.naturalHeight || img.height || 128;
          if (naturalW <= 0 || naturalH <= 0) {
            resolve(null);
            return;
          }

          const scale = Math.min(maxDotWidth / naturalW, maxDotHeight / naturalH, 1);
          const scaledW = Math.max(8, Math.round(naturalW * scale));
          const targetW = Math.ceil(scaledW / 8) * 8;
          const targetH = Math.max(8, Math.round(naturalH * scale));

          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, targetW, targetH);
          const drawOffsetX = Math.floor((targetW - scaledW) / 2);
          ctx.drawImage(img, drawOffsetX, 0, scaledW, targetH);

          const imgData = ctx.getImageData(0, 0, targetW, targetH).data;
          const lum = new Float32Array(targetW * targetH);

          for (let i = 0; i < targetW * targetH; i++) {
            const p = i * 4;
            const alpha = imgData[p + 3] / 255;
            const gray =
              0.299 * imgData[p] + 0.587 * imgData[p + 1] + 0.114 * imgData[p + 2];
            lum[i] = alpha * gray + (1 - alpha) * 255;
          }

          // Floyd-Steinberg dithering for sharp logos & photos
          for (let y = 0; y < targetH; y++) {
            for (let x = 0; x < targetW; x++) {
              const idx = y * targetW + x;
              const oldVal = lum[idx];
              const newVal = oldVal < 168 ? 0 : 255;
              lum[idx] = newVal;
              // Preserve clean pure-white background without stray dots
              if (oldVal >= 242) continue;
              const err = oldVal - newVal;
              if (x + 1 < targetW) lum[idx + 1] += (err * 7) / 16;
              if (y + 1 < targetH) {
                if (x > 0) lum[idx + targetW - 1] += (err * 3) / 16;
                lum[idx + targetW] += (err * 5) / 16;
                if (x + 1 < targetW) lum[idx + targetW + 1] += (err * 1) / 16;
              }
            }
          }

          const widthBytes = targetW / 8;
          const xL = widthBytes & 0xff;
          const xH = (widthBytes >> 8) & 0xff;
          const yL = targetH & 0xff;
          const yH = (targetH >> 8) & 0xff;

          const out: number[] = [0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH];
          for (let y = 0; y < targetH; y++) {
            for (let bx = 0; bx < widthBytes; bx++) {
              let byteVal = 0;
              for (let bit = 0; bit < 8; bit++) {
                const px = bx * 8 + bit;
                if (lum[y * targetW + px] < 128) {
                  byteVal |= 1 << (7 - bit);
                }
              }
              out.push(byteVal);
            }
          }

          resolve(out);
        } catch {
          resolve(null);
        }
      };

      img.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };

      img.src = safeUrl;
    });
  }

  /* =========================================================
   * ESC/POS BYTE GENERATORS
   * ========================================================= */

  /**
   * Async variant of generateReceiptBytes that rasterizes and embeds the store logo
   * at the top of the receipt when config.printStoreLogo && store.logoUrl are active.
   */
  async generateReceiptBytesWithLogo(
    order: Order,
    store: StoreProfile,
    config: PrinterConfig
  ): Promise<Uint8Array> {
    let logoRaster: number[] | null = null;
    if (config.printStoreLogo && store.logoUrl) {
      const maxWidth = config.paperWidth === '80mm' ? 240 : 184;
      const maxHeight = config.paperWidth === '80mm' ? 160 : 128;
      logoRaster = await this.imageToEscPosRaster(store.logoUrl, maxWidth, maxHeight);
    }
    return this.buildOrderReceiptBytes(order, store, config, logoRaster);
  }

  /**
   * Generate raw ESC/POS bytes for an Order Receipt (sync fallback without async image load)
   */
  generateReceiptBytes(order: Order, store: StoreProfile, config: PrinterConfig): Uint8Array {
    return this.buildOrderReceiptBytes(order, store, config, null);
  }

  private buildOrderReceiptBytes(
    order: Order,
    store: StoreProfile,
    config: PrinterConfig,
    logoRaster: number[] | null
  ): Uint8Array {
    const maxChars = getLineCharLimit(config.paperWidth, config.customCharPerLine);
    const builder = new EscPosBuilder();
    const rt = resolveReceiptTexts(store);

    const writeWrapped = (left: string, right: string) => {
      for (const ln of justifyWrappedLines(sanitizeThermalAscii(left), sanitizeThermalAscii(right), maxChars)) {
        builder.line(ln);
      }
    };

    const writeCenteredWrapped = (text: string, lineLimit = maxChars) => {
      for (const ln of wrapTextLines(sanitizeThermalAscii(text), lineLimit)) {
        builder.line(ln);
      }
    };

    // 1. Initialize Printer
    builder.init();

    // 2. Open Cash Drawer if enabled (only on cash transactions)
    if (config.openCashDrawer && order.paymentMethod === 'cash') {
      builder.openCashDrawer();
    }

    // 3. Store Header (Centered)
    builder.alignCenter();
    if (logoRaster && logoRaster.length > 0) {
      builder.rasterImage(logoRaster);
      builder.line('');
    }
    builder.bold(true);
    builder.doubleSize(true);
    writeCenteredWrapped(store.storeName, Math.max(8, Math.floor(maxChars / 2)));
    builder.doubleSize(false);

    builder.bold(false);
    if (store.tagline) {
      writeCenteredWrapped(store.tagline);
    }
    if (store.address) {
      writeCenteredWrapped(store.address);
    }
    if (store.phone) {
      writeCenteredWrapped(`${rt.phoneLabel}: ${store.phone}`);
    }
    if (rt.headerNote) {
      for (const hnLine of rt.headerNote.split(/\r?\n/)) {
        if (hnLine.trim()) writeCenteredWrapped(hnLine);
      }
    }

    // Divider
    builder.alignLeft();
    builder.line(createSeparator('=', maxChars));

    // 4. Order Metadata
    writeWrapped(`${rt.receiptNumberLabel}: #${order.id}`, formatTimeOnly(order.timestamp));
    writeWrapped(`${rt.dateLabel}: ${formatShortDate(order.timestamp)}`, `${rt.cashierLabel}: ${order.cashierName}`);

    if (order.customerName || order.tableNumber || order.orderType !== 'dine_in') {
      const custInfo = `${rt.customerLabel}: ${order.customerName || '-'}`;
      const tableInfo = formatOrderTypeLabel(order.orderType, order.tableNumber);
      writeWrapped(custInfo, tableInfo);
    }

    builder.line(createSeparator('-', maxChars));

    // 5. Items
    for (const item of order.items) {
      const itemTitle = `${item.quantity}x ${item.product.name}`;
      const itemPrice = formatNumber(item.product.price * item.quantity);
      writeWrapped(itemTitle, itemPrice);

      if (item.note) {
        for (const nl of wrapTextLines(`  * ${item.note}`, maxChars)) {
          builder.line(nl);
        }
      }
      if (item.discount > 0) {
        writeWrapped('  Diskon Item', `-${formatNumber(item.discount)}`);
      }
    }

    builder.line(createSeparator('-', maxChars));

    // 6. Totals
    writeWrapped(rt.subtotalLabel, formatRupiah(order.subtotal));

    if (order.discount > 0) {
      const pct =
        order.discountPercent ??
        (order.subtotal > 0 ? Math.round((order.discount / order.subtotal) * 100) : 0);
      const discTitle = pct > 0 ? `${rt.discountLabel} (${pct}%)` : rt.discountLabel;
      writeWrapped(discTitle, `-${formatRupiah(order.discount)}`);
    }

    if (order.taxAmount > 0) {
      writeWrapped(`${rt.taxLabel} (${Math.round(order.taxRate * 100)}%)`, formatRupiah(order.taxAmount));
    }

    if (order.serviceChargeAmount > 0) {
      writeWrapped(
        `${rt.serviceLabel} (${Math.round(order.serviceChargeRate * 100)}%)`,
        formatRupiah(order.serviceChargeAmount)
      );
    }

    builder.line(createSeparator('=', maxChars));

    // Grand Total (Bold Double Height)
    builder.bold(true);
    builder.doubleHeight(true);
    writeWrapped(rt.totalLabel, formatRupiah(order.total));
    builder.doubleHeight(false);
    builder.bold(false);

    builder.line(createSeparator('-', maxChars));

    // Payment details
    writeWrapped(rt.paymentMethodLabel, formatPaymentMethodLabel(order.paymentMethod));

    if (order.paymentMethod === 'cash') {
      writeWrapped(rt.amountPaidLabel, formatRupiah(order.amountPaid));
      writeWrapped(rt.changeLabel, formatRupiah(order.change));
    }

    builder.line(createSeparator('-', maxChars));

    // 7. Footer
    builder.alignCenter();
    if (config.printWifiInfo && store.wifiName) {
      writeCenteredWrapped(`${rt.wifiLabel}: ${store.wifiName} | ${rt.wifiPasswordLabel}: ${store.wifiPassword || '-'}`);
    }

    if (config.printFooterNote && store.footerNote) {
      for (const fnLine of store.footerNote.split(/\r?\n/)) {
        writeCenteredWrapped(fnLine);
      }
    } else {
      writeCenteredWrapped('Terima Kasih Atas Kunjungan Anda!');
      writeCenteredWrapped('Barang yang dibeli tidak dapat ditukar');
    }

    // Spacing & Cut
    builder.feedLines(3);
    if (config.autoCutPaper) {
      builder.cutPaper();
    }

    return builder.getBytes();
  }

  /**
   * Generate raw ESC/POS bytes for Daily Sales Report (Z-Report)
   */
  generateDailyReportBytes(report: DailySalesReport, store: StoreProfile, config: PrinterConfig): Uint8Array {
    const maxChars = getLineCharLimit(config.paperWidth, config.customCharPerLine);
    const builder = new EscPosBuilder();

    const writeWrapped = (left: string, right: string) => {
      for (const ln of justifyWrappedLines(sanitizeThermalAscii(left), sanitizeThermalAscii(right), maxChars)) {
        builder.line(ln);
      }
    };

    builder.init();
    builder.alignCenter();
    builder.bold(true);
    builder.doubleHeight(true);
    for (const ln of wrapTextLines('LAPORAN PENJUALAN HARIAN', maxChars)) {
      builder.line(ln);
    }
    builder.doubleHeight(false);
    for (const ln of wrapTextLines(store.storeName, maxChars)) {
      builder.line(ln);
    }
    builder.bold(false);
    builder.alignLeft();
    builder.line(createSeparator('=', maxChars));

    writeWrapped('Tanggal:', formatDateOnly(report.date));
    writeWrapped('Waktu Cetak:', formatDateTime(new Date().toISOString()));
    writeWrapped('Kasir:', 'Kasir Utama');
    builder.line(createSeparator('-', maxChars));

    // Summary Section
    builder.bold(true);
    builder.line('RINGKASAN PENJUALAN');
    builder.bold(false);
    writeWrapped('Total Transaksi', `${report.totalTransactions} Trx`);
    writeWrapped('Item Terjual', `${report.totalItemsSold} Pcs`);
    writeWrapped('Rata-rata/Nota (AOV)', formatRupiah(report.averageOrderValue));
    writeWrapped('Total Diskon', formatRupiah(report.totalDiscounts));
    writeWrapped('Total Pajak', formatRupiah(report.totalTax));
    if (report.totalServiceCharge > 0) {
      writeWrapped('Total Layanan', formatRupiah(report.totalServiceCharge));
    }

    builder.line(createSeparator('-', maxChars));
    builder.bold(true);
    builder.doubleHeight(true);
    writeWrapped('TOTAL OMSET', formatRupiah(report.totalGrossSales));
    builder.doubleHeight(false);
    builder.bold(false);
    builder.line(createSeparator('=', maxChars));

    // Breakdown By Payment Method
    builder.bold(true);
    builder.line('RINCIAN PEMBAYARAN');
    builder.bold(false);
    writeWrapped(`Tunai (${report.paymentBreakdown.cash.count}x)`, formatRupiah(report.paymentBreakdown.cash.total));
    writeWrapped(`QRIS (${report.paymentBreakdown.qris.count}x)`, formatRupiah(report.paymentBreakdown.qris.total));
    writeWrapped(`Transfer (${report.paymentBreakdown.transfer.count}x)`, formatRupiah(report.paymentBreakdown.transfer.total));
    writeWrapped(
      `Debit/Kredit (${report.paymentBreakdown.debit.count + report.paymentBreakdown.credit.count}x)`,
      formatRupiah(report.paymentBreakdown.debit.total + report.paymentBreakdown.credit.total)
    );

    builder.line(createSeparator('-', maxChars));

    // Top Selling Products
    builder.bold(true);
    builder.line('PRODUK TERLARIS');
    builder.bold(false);
    if (report.topProducts.length === 0) {
      builder.line(centerText('Belum ada transaksi', maxChars));
    } else {
      report.topProducts.slice(0, 5).forEach((p, index) => {
        writeWrapped(`${index + 1}. ${p.name}`, `${p.quantity}x | ${formatNumber(p.totalRevenue)}`);
      });
    }

    builder.line(createSeparator('=', maxChars));

    // Signatures
    builder.alignCenter();
    builder.line('Tanda Tangan Penanggung Jawab');
    builder.feedLines(3);
    builder.line('( ........................ )');
    builder.line('Kasir / Supervisor Toko');

    builder.feedLines(3);
    if (config.autoCutPaper) {
      builder.cutPaper();
    }

    return builder.getBytes();
  }

  /**
   * Generate raw ESC/POS bytes for Cashier Closing (Tutupan Kasir)
   */
  generateCashierClosingBytes(
    closing: CashierClosing,
    store: StoreProfile,
    config: PrinterConfig
  ): Uint8Array {
    const maxChars = getLineCharLimit(config.paperWidth, config.customCharPerLine);
    const builder = new EscPosBuilder();

    const writeWrapped = (left: string, right: string) => {
      for (const ln of justifyWrappedLines(sanitizeThermalAscii(left), sanitizeThermalAscii(right), maxChars)) {
        builder.line(ln);
      }
    };

    builder.init();
    builder.alignCenter();
    builder.bold(true);
    builder.doubleHeight(true);
    for (const ln of wrapTextLines('STRUK TUTUPAN KASIR', maxChars)) {
      builder.line(ln);
    }
    builder.doubleHeight(false);
    for (const ln of wrapTextLines(store.storeName, maxChars)) {
      builder.line(ln);
    }
    builder.bold(false);
    builder.alignLeft();
    builder.line(createSeparator('=', maxChars));

    writeWrapped('No. Tutupan', `#${closing.id}`);
    writeWrapped('Tgl Laporan', formatDateOnly(closing.date));
    writeWrapped('Waktu Tutup', formatDateTime(closing.closedAt));
    writeWrapped('Kasir', closing.cashierName);
    if (closing.shiftLabel) {
      writeWrapped('Shift', closing.shiftLabel);
    }
    builder.line(createSeparator('-', maxChars));

    builder.bold(true);
    builder.line('RINGKASAN PENJUALAN');
    builder.bold(false);
    writeWrapped('Total Transaksi', `${closing.totalTransactions} Trx`);
    writeWrapped('Item Terjual', `${closing.totalItemsSold} Pcs`);
    if (closing.totalDiscounts > 0) {
      writeWrapped('Total Diskon', formatRupiah(closing.totalDiscounts));
    }
    writeWrapped('Total Omset', formatRupiah(closing.totalSales));
    writeWrapped('Tunai Sistem', formatRupiah(closing.systemCashSales));
    writeWrapped('QRIS', formatRupiah(closing.qrisSales));
    writeWrapped('Transfer Bank', formatRupiah(closing.transferSales));
    writeWrapped('Kartu Debit/Kredit', formatRupiah(closing.cardSales));
    builder.line(createSeparator('-', maxChars));

    builder.bold(true);
    builder.line('REKONSILIASI LACI KAS');
    builder.bold(false);
    writeWrapped('Modal Awal Laci', formatRupiah(closing.openingCash));
    writeWrapped('Penjualan Tunai', formatRupiah(closing.systemCashSales));
    writeWrapped('Kas Keluar', `-${formatRupiah(closing.cashOut)}`);
    if (closing.cashOutNote) {
      for (const nl of wrapTextLines(`  Ket: ${closing.cashOutNote}`, maxChars)) {
        builder.line(nl);
      }
    }
    builder.line(createSeparator('-', maxChars));
    builder.bold(true);
    writeWrapped('Kas Seharusnya', formatRupiah(closing.expectedCash));
    writeWrapped('Kas Fisik Laci', formatRupiah(closing.actualCash));
    const diffLabel =
      closing.cashDifference === 0
        ? 'Pas (Rp 0)'
        : closing.cashDifference > 0
          ? `+${formatRupiah(closing.cashDifference)}`
          : `-${formatRupiah(Math.abs(closing.cashDifference))}`;
    writeWrapped('Selisih Kas', diffLabel);
    builder.bold(false);

    if (closing.notes) {
      builder.line(createSeparator('-', maxChars));
      for (const nl of wrapTextLines(`Catatan: ${closing.notes}`, maxChars)) {
        builder.line(nl);
      }
    }

    builder.line(createSeparator('=', maxChars));
    builder.alignCenter();
    builder.line('Tanda Tangan Kasir & Owner');
    builder.feedLines(3);
    builder.line(centerText('( .......... )  ( .......... )', maxChars));
    builder.line(centerText('     Kasir          Owner     ', maxChars));

    builder.feedLines(3);
    if (config.autoCutPaper) {
      builder.cutPaper();
    }

    return builder.getBytes();
  }

  /**
   * Async test print including the Store Logo bitmap if enabled
   */
  async generateTestBytesWithLogo(store: StoreProfile, config: PrinterConfig): Promise<Uint8Array> {
    let logoRaster: number[] | null = null;
    if (config.printStoreLogo && store.logoUrl) {
      const maxWidth = config.paperWidth === '80mm' ? 240 : 184;
      const maxHeight = config.paperWidth === '80mm' ? 160 : 128;
      logoRaster = await this.imageToEscPosRaster(store.logoUrl, maxWidth, maxHeight);
    }
    return this.generateTestBytes(store, config, logoRaster);
  }

  /**
   * Generate raw ESC/POS bytes for a Test Print
   */
  generateTestBytes(
    store: StoreProfile,
    config: PrinterConfig,
    logoRaster: number[] | null = null
  ): Uint8Array {
    const maxChars = getLineCharLimit(config.paperWidth, config.customCharPerLine);
    const builder = new EscPosBuilder();

    builder.init();
    builder.alignCenter();
    if (logoRaster && logoRaster.length > 0) {
      builder.rasterImage(logoRaster);
      builder.line('');
    }
    builder.bold(true);
    builder.doubleSize(true);
    builder.line('TEST CETAK BLUETOOTH');
    builder.doubleSize(false);
    builder.line(store.storeName);
    builder.bold(false);
    builder.line(createSeparator('=', maxChars));

    builder.alignLeft();
    builder.line(`Lebar Kertas: ${config.paperWidth} (${maxChars} Kolom)`);
    builder.line(`Status: Terhubung OK`);
    builder.line(`Waktu: ${formatDateTime(new Date().toISOString())}`);
    builder.line(createSeparator('-', maxChars));

    builder.alignLeft();
    builder.line('Teks Normal Rata Kiri');
    builder.alignCenter();
    builder.line('Teks Normal Rata Tengah');
    builder.alignRight();
    builder.line('Teks Normal Rata Kanan');

    builder.alignLeft();
    builder.line(createSeparator('-', maxChars));
    builder.bold(true);
    builder.line('TEKS TEBAL (BOLD ACTIVE)');
    builder.bold(false);
    builder.doubleHeight(true);
    builder.line('DOUBLE HEIGHT TEXT');
    builder.doubleHeight(false);

    builder.line(createSeparator('=', maxChars));
    builder.alignCenter();
    builder.line('Printer Thermal Siap Digunakan!');
    builder.line('KasirKu POS System');

    builder.feedLines(3);
    if (config.autoCutPaper) {
      builder.cutPaper();
    }

    return builder.getBytes();
  }
}

/**
 * Low-level ESC/POS byte builder
 */
class EscPosBuilder {
  private buffer: number[] = [];

  init(): this {
    this.buffer.push(0x1b, 0x40); // ESC @ - Initialize printer
    this.buffer.push(0x1c, 0x2e); // FS .  - Cancel Chinese/Kanji double-byte mode
    this.buffer.push(0x1b, 0x74, 0x00); // ESC t 0 - Select PC437 single-byte ASCII table
    return this;
  }

  alignLeft(): this {
    this.buffer.push(0x1b, 0x61, 0x00);
    return this;
  }

  alignCenter(): this {
    this.buffer.push(0x1b, 0x61, 0x01);
    return this;
  }

  alignRight(): this {
    this.buffer.push(0x1b, 0x61, 0x02);
    return this;
  }

  bold(enable: boolean): this {
    this.buffer.push(0x1b, 0x45, enable ? 0x01 : 0x00);
    return this;
  }

  doubleHeight(enable: boolean): this {
    this.buffer.push(0x1d, 0x21, enable ? 0x01 : 0x00);
    return this;
  }

  doubleSize(enable: boolean): this {
    this.buffer.push(0x1d, 0x21, enable ? 0x11 : 0x00);
    return this;
  }

  underline(enable: boolean): this {
    this.buffer.push(0x1b, 0x2d, enable ? 0x01 : 0x00);
    return this;
  }

  openCashDrawer(): this {
    this.buffer.push(0x1b, 0x70, 0x00, 0x19, 0xfa);
    return this;
  }

  feedLines(lines: number): this {
    this.buffer.push(0x1b, 0x64, Math.max(1, lines));
    return this;
  }

  cutPaper(): this {
    this.buffer.push(0x1d, 0x56, 0x41, 0x10);
    return this;
  }

  line(text: string): this {
    const cleanText = sanitizeThermalAscii(text).replace(/[\r\n]+/g, ' ');
    for (let i = 0; i < cleanText.length; i++) {
      this.buffer.push(cleanText.charCodeAt(i) & 0x7f);
    }
    this.buffer.push(0x0a); // LF
    return this;
  }

  rasterImage(bytes: number[]): this {
    for (let i = 0; i < bytes.length; i++) {
      this.buffer.push(bytes[i]);
    }
    return this;
  }

  getBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

export const bluetoothPrinter = new BluetoothThermalPrinterManager();
