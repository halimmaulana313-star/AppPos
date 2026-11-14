/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DailySalesReport, Order, PrinterConfig, StoreProfile } from '../types/pos';
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
} from './formatters';

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

  /* =========================================================
   * ESC/POS BYTE GENERATORS
   * ========================================================= */

  /**
   * Generate raw ESC/POS bytes for an Order Receipt
   */
  generateReceiptBytes(order: Order, store: StoreProfile, config: PrinterConfig): Uint8Array {
    const maxChars = getLineCharLimit(config.paperWidth);
    const builder = new EscPosBuilder();

    // 1. Initialize Printer
    builder.init();

    // 2. Open Cash Drawer if enabled
    if (config.openCashDrawer) {
      builder.openCashDrawer();
    }

    // 3. Store Header (Centered)
    builder.alignCenter();
    builder.bold(true);
    builder.doubleSize(true);
    builder.line(store.storeName.toUpperCase());
    builder.doubleSize(false);

    if (store.tagline) {
      builder.bold(false);
      builder.line(store.tagline);
    }

    builder.bold(false);
    if (store.address) {
      builder.line(store.address);
    }
    if (store.phone) {
      builder.line(`Telp: ${store.phone}`);
    }

    // Divider
    builder.alignLeft();
    builder.line(createSeparator('=', maxChars));

    // 4. Order Metadata
    builder.line(justifyLine(`No: #${order.id}`, formatTimeOnly(order.timestamp), maxChars));
    builder.line(justifyLine(`Tgl: ${formatDateOnly(order.timestamp)}`, `Kasir: ${order.cashierName}`, maxChars));
    
    if (order.customerName || order.tableNumber) {
      const custInfo = order.customerName ? `Plg: ${order.customerName}` : '';
      const tableInfo = order.tableNumber ? `Meja: ${order.tableNumber}` : (order.orderType === 'takeaway' ? 'Bungkus' : '');
      builder.line(justifyLine(custInfo, tableInfo, maxChars));
    }

    builder.line(createSeparator('-', maxChars));

    // 5. Items
    for (const item of order.items) {
      const itemTitle = `${item.quantity}x ${item.product.name}`;
      const itemPrice = formatNumber(item.product.price * item.quantity);
      builder.line(justifyLine(itemTitle, itemPrice, maxChars));

      // Optional note or item discount
      if (item.note) {
        builder.line(`  * ${item.note}`);
      }
      if (item.discount > 0) {
        builder.line(justifyLine('  Diskon Item', `-${formatNumber(item.discount)}`, maxChars));
      }
    }

    builder.line(createSeparator('-', maxChars));

    // 6. Totals
    builder.line(justifyLine('Subtotal', formatRupiah(order.subtotal), maxChars));

    if (order.discount > 0) {
      const pct = order.discountPercent ?? (order.subtotal > 0 ? Math.round((order.discount / order.subtotal) * 100) : 0);
      const discTitle = pct > 0 ? `Diskon Nota (${pct}%)` : 'Diskon Nota';
      builder.line(justifyLine(discTitle, `-${formatRupiah(order.discount)}`, maxChars));
    }

    if (order.taxAmount > 0) {
      builder.line(justifyLine(`Pajak (${Math.round(order.taxRate * 100)}%)`, formatRupiah(order.taxAmount), maxChars));
    }

    if (order.serviceChargeAmount > 0) {
      builder.line(justifyLine(`Layanan (${Math.round(order.serviceChargeRate * 100)}%)`, formatRupiah(order.serviceChargeAmount), maxChars));
    }

    builder.line(createSeparator('=', maxChars));

    // Grand Total (Bold Double Height)
    builder.bold(true);
    builder.doubleHeight(true);
    builder.line(justifyLine('TOTAL', formatRupiah(order.total), maxChars));
    builder.doubleHeight(false);
    builder.bold(false);

    // Payment details
    const methodLabels: Record<string, string> = {
      cash: 'TUNAI',
      qris: 'QRIS',
      transfer: 'TRANSFER',
      debit: 'DEBIT',
      credit: 'KREDIT',
    };
    builder.line(justifyLine('Metode Bayar', methodLabels[order.paymentMethod] || order.paymentMethod.toUpperCase(), maxChars));

    if (order.paymentMethod === 'cash') {
      builder.line(justifyLine('Bayar', formatRupiah(order.amountPaid), maxChars));
      builder.line(justifyLine('Kembalian', formatRupiah(order.change), maxChars));
    }

    builder.line(createSeparator('-', maxChars));

    // 7. Footer
    builder.alignCenter();
    if (config.printWifiInfo && store.wifiName) {
      builder.line(`WiFi: ${store.wifiName} | Pass: ${store.wifiPassword || '-'}`);
    }

    if (config.printFooterNote && store.footerNote) {
      builder.line(store.footerNote);
    } else {
      builder.line('Terima Kasih Atas Kunjungan Anda!');
      builder.line('Barang yang sudah dibeli tidak dapat ditukar');
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
    const maxChars = getLineCharLimit(config.paperWidth);
    const builder = new EscPosBuilder();

    builder.init();
    builder.alignCenter();
    builder.bold(true);
    builder.doubleHeight(true);
    builder.line('LAPORAN PENJUALAN HARIAN');
    builder.doubleHeight(false);
    builder.line(store.storeName.toUpperCase());
    builder.bold(false);
    builder.line(createSeparator('=', maxChars));

    builder.alignLeft();
    builder.line(justifyLine('Tanggal Laporan:', formatDateOnly(report.date), maxChars));
    builder.line(justifyLine('Waktu Cetak:', formatDateTime(new Date().toISOString()), maxChars));
    builder.line(justifyLine('Dicetak Oleh:', 'Kasir Utama', maxChars));
    builder.line(createSeparator('-', maxChars));

    // Summary Section
    builder.bold(true);
    builder.line('RINGKASAN PENJUALAN');
    builder.bold(false);
    builder.line(justifyLine('Total Transaksi', `${report.totalTransactions} Trx`, maxChars));
    builder.line(justifyLine('Total Item Terjual', `${report.totalItemsSold} Pcs`, maxChars));
    builder.line(justifyLine('Rata-rata/Nota (AOV)', formatRupiah(report.averageOrderValue), maxChars));
    builder.line(justifyLine('Total Diskon', formatRupiah(report.totalDiscounts), maxChars));
    builder.line(justifyLine('Total Pajak', formatRupiah(report.totalTax), maxChars));
    if (report.totalServiceCharge > 0) {
      builder.line(justifyLine('Total Layanan', formatRupiah(report.totalServiceCharge), maxChars));
    }

    builder.line(createSeparator('-', maxChars));
    builder.bold(true);
    builder.doubleHeight(true);
    builder.line(justifyLine('TOTAL OMSET', formatRupiah(report.totalGrossSales), maxChars));
    builder.doubleHeight(false);
    builder.bold(false);
    builder.line(createSeparator('=', maxChars));

    // Breakdown By Payment Method
    builder.bold(true);
    builder.line('RINCIAN METODE PEMBAYARAN');
    builder.bold(false);
    builder.line(
      justifyLine(
        `Tunai (${report.paymentBreakdown.cash.count}x)`,
        formatRupiah(report.paymentBreakdown.cash.total),
        maxChars
      )
    );
    builder.line(
      justifyLine(
        `QRIS (${report.paymentBreakdown.qris.count}x)`,
        formatRupiah(report.paymentBreakdown.qris.total),
        maxChars
      )
    );
    builder.line(
      justifyLine(
        `Transfer (${report.paymentBreakdown.transfer.count}x)`,
        formatRupiah(report.paymentBreakdown.transfer.total),
        maxChars
      )
    );
    builder.line(
      justifyLine(
        `Debit/Kredit (${report.paymentBreakdown.debit.count + report.paymentBreakdown.credit.count}x)`,
        formatRupiah(report.paymentBreakdown.debit.total + report.paymentBreakdown.credit.total),
        maxChars
      )
    );

    builder.line(createSeparator('-', maxChars));

    // Top Selling Products
    builder.bold(true);
    builder.line('PRODUK TERLARIS (TOP SALES)');
    builder.bold(false);
    if (report.topProducts.length === 0) {
      builder.line(centerText('Belum ada data', maxChars));
    } else {
      report.topProducts.slice(0, 5).forEach((p, index) => {
        const itemLine = `${index + 1}. ${p.name}`;
        builder.line(justifyLine(itemLine, `${p.quantity}x | ${formatNumber(p.totalRevenue)}`, maxChars));
      });
    }

    builder.line(createSeparator('=', maxChars));

    // Signatures
    builder.alignCenter();
    builder.line('Tanda Tangan Penanggung Jawab');
    builder.feedLines(3);
    builder.line('( .............................. )');
    builder.line('Kasir / Supervisor Toko');

    builder.feedLines(3);
    if (config.autoCutPaper) {
      builder.cutPaper();
    }

    return builder.getBytes();
  }

  /**
   * Generate raw ESC/POS bytes for a Test Print
   */
  generateTestBytes(store: StoreProfile, config: PrinterConfig): Uint8Array {
    const maxChars = getLineCharLimit(config.paperWidth);
    const builder = new EscPosBuilder();

    builder.init();
    builder.alignCenter();
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
  private encoder = new TextEncoder();

  init(): this {
    this.buffer.push(0x1b, 0x40); // ESC @
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
    const cleanText = text.replace(/[\r\n]+/g, ' ');
    const encoded = this.encoder.encode(cleanText + '\n');
    for (let i = 0; i < encoded.length; i++) {
      this.buffer.push(encoded[i]);
    }
    return this;
  }

  getBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

export const bluetoothPrinter = new BluetoothThermalPrinterManager();
