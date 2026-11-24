/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import { DailySalesReport, Order, PrinterConfig, StoreProfile } from '../types/pos';
import {
  formatDateOnly,
  formatDateTime,
  formatNumber,
  formatOrderTypeLabel,
  formatPaymentMethodLabel,
  formatRupiah,
  formatShortDate,
  formatTimeOnly,
  resolveReceiptTexts,
} from './formatters';
import { sanitizeFilename, sanitizeSafeImageUrl } from './sanitize';

/**
 * Convert any validated image URL / raster data URL into a PNG data URL
 * so jsPDF can reliably embed it without format or XSS risks.
 */
async function loadImageAsPngDataUrl(src: string): Promise<string | null> {
  const safeSrc = sanitizeSafeImageUrl(src, { allowPresetSvg: true });
  if (!safeSrc) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 2000);

    img.onload = () => {
      clearTimeout(timer);
      try {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);

        // Preserve aspect ratio
        const ratio = Math.min(size / (img.width || size), size / (img.height || size));
        const drawW = (img.width || size) * ratio;
        const drawH = (img.height || size) * ratio;
        const offsetX = (size - drawW) / 2;
        const offsetY = (size - drawH) / 2;
        ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };

    img.src = safeSrc;
  });
}

/**
 * Measure total vertical height needed for an Order Receipt PDF,
 * then render all lines crisply with 58mm or 80mm thermal paper dimensions.
 */
export async function generateOrderReceiptPDF(
  order: Order,
  store: StoreProfile,
  printerConfig: PrinterConfig
): Promise<void> {
  const is80mm = printerConfig.paperWidth === '80mm';
  const pageWidthMm = is80mm ? 80 : 58;
  const marginX = is80mm ? 5 : 4;
  const contentWidth = pageWidthMm - marginX * 2;
  const baseFontSize = is80mm ? 8.5 : 7.5;
  const lineH = is80mm ? 4.2 : 3.6;

  // Pre-load logo if enabled
  const logoPng =
    printerConfig.printStoreLogo && store.logoUrl
      ? await loadImageAsPngDataUrl(store.logoUrl)
      : null;

  // Helper to wrap long text cleanly inside a temporary doc
  const measureDoc = new jsPDF({ unit: 'mm', format: [pageWidthMm, 300] });
  measureDoc.setFont('courier', 'normal');
  measureDoc.setFontSize(baseFontSize);

  const wrap = (text: string, maxW = contentWidth, fontSize = baseFontSize): string[] => {
    measureDoc.setFontSize(fontSize);
    return measureDoc.splitTextToSize(text, maxW) as string[];
  };

  const rt = resolveReceiptTexts(store);

  // Calculate dynamic height accurately
  let estY = 6;
  if (logoPng) estY += 15;
  estY += wrap(store.storeName, contentWidth, baseFontSize + 2.5).length * (lineH + 1);
  if (store.tagline) estY += wrap(store.tagline, contentWidth, baseFontSize - 0.5).length * lineH;
  if (store.address) estY += wrap(store.address, contentWidth, baseFontSize - 1).length * (lineH - 0.3);
  if (store.phone) estY += lineH;
  if (rt.headerNote) estY += wrap(rt.headerNote, contentWidth, baseFontSize - 0.8).length * lineH;
  estY += 5; // divider + gap

  estY += lineH * 2; // No/Time + Date/Cashier
  if (order.customerName || order.tableNumber || order.orderType !== 'dine_in') estY += lineH;
  estY += 4; // divider

  for (const item of order.items) {
    const titleLines = wrap(`${item.quantity}x ${item.product.name}`, contentWidth * 0.68);
    estY += titleLines.length * lineH;
    if (item.note) estY += wrap(`  * ${item.note}`, contentWidth - 4, baseFontSize - 0.8).length * (lineH - 0.4);
    if (item.discount > 0) estY += lineH - 0.3;
  }

  estY += 4; // divider
  estY += lineH; // subtotal
  if (order.discount > 0) estY += lineH;
  if (order.taxAmount > 0) estY += lineH;
  if (order.serviceChargeAmount > 0) estY += lineH;
  estY += 5; // double divider
  estY += lineH + 2; // TOTAL
  estY += 4; // divider
  estY += lineH; // payment method
  if (order.paymentMethod === 'cash') estY += lineH * 2;
  estY += 5; // divider

  if (printerConfig.printWifiInfo && store.wifiName) {
    estY += wrap(`${rt.wifiLabel}: ${store.wifiName} | ${rt.wifiPasswordLabel}: ${store.wifiPassword || '-'}`, contentWidth, baseFontSize - 0.8).length * lineH;
  }
  if (printerConfig.printFooterNote && store.footerNote) {
    store.footerNote.split('\n').forEach((fn) => {
      estY += wrap(fn, contentWidth, baseFontSize - 0.8).length * lineH;
    });
  } else {
    estY += lineH * 2;
  }
  estY += 10; // bottom padding

  const pageHeightMm = Math.max(90, Math.ceil(estY));
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [pageWidthMm, pageHeightMm],
  });

  let y = 6;
  const centerX = pageWidthMm / 2;
  const rightX = pageWidthMm - marginX;

  const drawDashedLine = () => {
    doc.setDrawColor(148, 163, 184);
    doc.setLineDashPattern([1, 1], 0);
    doc.setLineWidth(0.25);
    doc.line(marginX, y, rightX, y);
    doc.setLineDashPattern([], 0);
    y += 3.2;
  };

  const drawSolidLine = () => {
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.5);
    doc.line(marginX, y, rightX, y);
    y += 3.5;
  };

  const drawRow = (left: string, right: string, bold = false, fontSize = baseFontSize) => {
    doc.setFont('courier', bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    doc.text(left, marginX, y);
    doc.text(right, rightX, y, { align: 'right' });
    y += lineH;
  };

  // Logo
  if (logoPng) {
    const logoSize = 12;
    doc.addImage(logoPng, 'PNG', centerX - logoSize / 2, y, logoSize, logoSize);
    y += logoSize + 2.5;
  }

  // Store Header
  doc.setTextColor(15, 23, 42);
  doc.setFont('courier', 'bold');
  doc.setFontSize(baseFontSize + 2.5);
  const nameLines = doc.splitTextToSize(store.storeName, contentWidth) as string[];
  nameLines.forEach((ln) => {
    doc.text(ln, centerX, y, { align: 'center' });
    y += lineH + 0.6;
  });

  if (store.tagline) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(baseFontSize - 0.5);
    doc.setTextColor(71, 85, 105);
    const tagLines = doc.splitTextToSize(store.tagline, contentWidth) as string[];
    tagLines.forEach((ln) => {
      doc.text(ln, centerX, y, { align: 'center' });
      y += lineH - 0.2;
    });
  }

  if (store.address) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(baseFontSize - 1);
    doc.setTextColor(100, 116, 139);
    const addrLines = doc.splitTextToSize(store.address, contentWidth) as string[];
    addrLines.forEach((ln) => {
      doc.text(ln, centerX, y, { align: 'center' });
      y += lineH - 0.4;
    });
  }

  if (store.phone) {
    doc.setFont('courier', 'normal');
    doc.setFontSize(baseFontSize - 1);
    doc.text(`${rt.phoneLabel}: ${store.phone}`, centerX, y, { align: 'center' });
    y += lineH;
  }

  if (rt.headerNote) {
    doc.setFont('courier', 'italic');
    doc.setFontSize(baseFontSize - 0.8);
    doc.setTextColor(71, 85, 105);
    const hnLines = doc.splitTextToSize(rt.headerNote, contentWidth) as string[];
    hnLines.forEach((ln) => {
      doc.text(ln, centerX, y, { align: 'center' });
      y += lineH - 0.3;
    });
  }

  y += 1;
  drawDashedLine();

  // Order Metadata
  doc.setTextColor(30, 41, 59);
  drawRow(`${rt.receiptNumberLabel}: #${order.id}`, formatTimeOnly(order.timestamp), false, baseFontSize - 0.5);
  drawRow(`${rt.dateLabel}: ${formatShortDate(order.timestamp)}`, `${rt.cashierLabel}: ${order.cashierName}`, false, baseFontSize - 0.5);

  if (order.customerName || order.tableNumber || order.orderType !== 'dine_in') {
    drawRow(
      `${rt.customerLabel}: ${order.customerName || '-'}`,
      formatOrderTypeLabel(order.orderType, order.tableNumber),
      false,
      baseFontSize - 0.5
    );
  }

  y += 0.5;
  drawDashedLine();

  // Items
  doc.setTextColor(15, 23, 42);
  order.items.forEach((item) => {
    const title = `${item.quantity}x ${item.product.name}`;
    const priceText = formatNumber(item.product.price * item.quantity);
    doc.setFont('courier', 'bold');
    doc.setFontSize(baseFontSize);
    const wrappedTitle = doc.splitTextToSize(title, contentWidth * 0.68) as string[];
    wrappedTitle.forEach((ln, idx) => {
      doc.text(ln, marginX, y);
      if (idx === 0) {
        doc.text(priceText, rightX, y, { align: 'right' });
      }
      y += lineH;
    });

    if (item.note) {
      doc.setFont('courier', 'italic');
      doc.setFontSize(baseFontSize - 0.8);
      doc.setTextColor(100, 116, 139);
      const noteLines = doc.splitTextToSize(`  ↳ ${item.note}`, contentWidth - 3) as string[];
      noteLines.forEach((ln) => {
        doc.text(ln, marginX, y);
        y += lineH - 0.4;
      });
      doc.setTextColor(15, 23, 42);
    }

    if (item.discount > 0) {
      doc.setTextColor(5, 150, 105);
      drawRow('  Diskon item', `-${formatNumber(item.discount)}`, false, baseFontSize - 0.8);
      doc.setTextColor(15, 23, 42);
    }
  });

  y += 0.5;
  drawDashedLine();

  // Totals
  doc.setTextColor(51, 65, 85);
  drawRow(rt.subtotalLabel, formatRupiah(order.subtotal), false, baseFontSize - 0.3);

  if (order.discount > 0) {
    const pct =
      order.discountPercent ??
      (order.subtotal > 0 ? Math.round((order.discount / order.subtotal) * 100) : 0);
    const discLabel = pct > 0 ? `${rt.discountLabel} (${pct}%)` : rt.discountLabel;
    doc.setTextColor(5, 150, 105);
    drawRow(discLabel, `-${formatRupiah(order.discount)}`, true, baseFontSize - 0.3);
    doc.setTextColor(51, 65, 85);
  }

  if (order.taxAmount > 0) {
    drawRow(`${rt.taxLabel} (${Math.round(order.taxRate * 100)}%)`, formatRupiah(order.taxAmount), false, baseFontSize - 0.3);
  }

  if (order.serviceChargeAmount > 0) {
    drawRow(
      `${rt.serviceLabel} (${Math.round(order.serviceChargeRate * 100)}%)`,
      formatRupiah(order.serviceChargeAmount),
      false,
      baseFontSize - 0.3
    );
  }

  y += 0.5;
  drawSolidLine();

  // Grand Total
  doc.setTextColor(15, 23, 42);
  drawRow(rt.totalLabel, formatRupiah(order.total), true, baseFontSize + 2);
  y += 0.5;
  drawDashedLine();

  // Payment Method Details
  doc.setTextColor(51, 65, 85);
  drawRow(
    rt.paymentMethodLabel,
    formatPaymentMethodLabel(order.paymentMethod),
    true,
    baseFontSize - 0.3
  );

  if (order.paymentMethod === 'cash') {
    drawRow(rt.amountPaidLabel, formatRupiah(order.amountPaid), false, baseFontSize - 0.3);
    drawRow(rt.changeLabel, formatRupiah(order.change), true, baseFontSize - 0.3);
  }

  y += 0.5;
  drawDashedLine();

  // Footer
  doc.setTextColor(71, 85, 105);
  doc.setFont('courier', 'normal');
  doc.setFontSize(baseFontSize - 0.8);

  if (printerConfig.printWifiInfo && store.wifiName) {
    const wifiLines = doc.splitTextToSize(
      `${rt.wifiLabel}: ${store.wifiName} | ${rt.wifiPasswordLabel}: ${store.wifiPassword || '-'}`,
      contentWidth
    ) as string[];
    wifiLines.forEach((ln) => {
      doc.text(ln, centerX, y, { align: 'center' });
      y += lineH - 0.2;
    });
  }

  if (printerConfig.printFooterNote && store.footerNote) {
    store.footerNote.split('\n').forEach((fn) => {
      const lines = doc.splitTextToSize(fn, contentWidth) as string[];
      lines.forEach((ln) => {
        doc.text(ln, centerX, y, { align: 'center' });
        y += lineH - 0.2;
      });
    });
  } else {
    doc.text('Terima Kasih Atas Kunjungan Anda!', centerX, y, { align: 'center' });
    y += lineH - 0.2;
    doc.text('Barang yang dibeli tidak dapat ditukar', centerX, y, { align: 'center' });
  }

  const cleanStoreName = sanitizeFilename(store.storeName, 'Toko');
  const cleanOrderId = sanitizeFilename(order.id, 'ORD');
  doc.save(`Struk_${cleanOrderId}_${cleanStoreName}.pdf`);
}

/**
 * Generate and download a Thermal Z-Report PDF (58mm / 80mm)
 */
export async function generateDailyReportReceiptPDF(
  report: DailySalesReport,
  store: StoreProfile,
  printerConfig: PrinterConfig
): Promise<void> {
  const is80mm = printerConfig.paperWidth === '80mm';
  const pageWidthMm = is80mm ? 80 : 58;
  const marginX = is80mm ? 5 : 4;
  const baseFontSize = is80mm ? 8.2 : 7.2;
  const lineH = is80mm ? 4.1 : 3.5;

  const topCount = Math.min(report.topProducts.length, 5);
  const estHeight = Math.max(135, 125 + topCount * lineH + (report.totalServiceCharge > 0 ? lineH : 0));

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [pageWidthMm, estHeight],
  });

  let y = 6;
  const centerX = pageWidthMm / 2;
  const rightX = pageWidthMm - marginX;

  const drawDashedLine = () => {
    doc.setDrawColor(148, 163, 184);
    doc.setLineDashPattern([1, 1], 0);
    doc.setLineWidth(0.25);
    doc.line(marginX, y, rightX, y);
    doc.setLineDashPattern([], 0);
    y += 3.2;
  };

  const drawSolidLine = () => {
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.5);
    doc.line(marginX, y, rightX, y);
    y += 3.5;
  };

  const drawRow = (left: string, right: string, bold = false, fontSize = baseFontSize) => {
    doc.setFont('courier', bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    doc.text(left, marginX, y);
    doc.text(right, rightX, y, { align: 'right' });
    y += lineH;
  };

  // Title
  doc.setTextColor(15, 23, 42);
  doc.setFont('courier', 'bold');
  doc.setFontSize(baseFontSize + 1.5);
  doc.text('LAPORAN PENJUALAN HARIAN', centerX, y, { align: 'center' });
  y += lineH + 0.5;
  doc.setFontSize(baseFontSize + 0.5);
  doc.text(store.storeName, centerX, y, { align: 'center' });
  y += lineH + 1;
  drawSolidLine();

  doc.setTextColor(51, 65, 85);
  drawRow('Tanggal:', formatDateOnly(report.date));
  drawRow('Dicetak:', formatDateTime(new Date().toISOString()), false, baseFontSize - 0.6);
  drawRow('Kasir:', 'Kasir Utama');
  y += 0.5;
  drawDashedLine();

  doc.setFont('courier', 'bold');
  doc.setFontSize(baseFontSize);
  doc.setTextColor(15, 23, 42);
  doc.text('RINGKASAN PENJUALAN', marginX, y);
  y += lineH;

  doc.setTextColor(51, 65, 85);
  drawRow('Total Transaksi', `${report.totalTransactions} Trx`, true);
  drawRow('Item Terjual', `${report.totalItemsSold} Pcs`);
  drawRow('Rata-rata/Nota', formatRupiah(report.averageOrderValue));
  drawRow('Total Diskon', formatRupiah(report.totalDiscounts));
  drawRow('Total Pajak', formatRupiah(report.totalTax));
  if (report.totalServiceCharge > 0) {
    drawRow('Total Layanan', formatRupiah(report.totalServiceCharge));
  }

  y += 0.5;
  drawDashedLine();
  doc.setTextColor(4, 120, 87);
  drawRow('TOTAL OMSET', formatRupiah(report.totalGrossSales), true, baseFontSize + 1.8);
  y += 0.5;
  drawSolidLine();

  doc.setFont('courier', 'bold');
  doc.setFontSize(baseFontSize);
  doc.setTextColor(15, 23, 42);
  doc.text('RINCIAN PEMBAYARAN', marginX, y);
  y += lineH;

  doc.setTextColor(51, 65, 85);
  drawRow(`Tunai (${report.paymentBreakdown.cash.count}x)`, formatRupiah(report.paymentBreakdown.cash.total));
  drawRow(`QRIS (${report.paymentBreakdown.qris.count}x)`, formatRupiah(report.paymentBreakdown.qris.total));
  drawRow(`Transfer (${report.paymentBreakdown.transfer.count}x)`, formatRupiah(report.paymentBreakdown.transfer.total));
  drawRow(
    `Debit/Kredit (${report.paymentBreakdown.debit.count + report.paymentBreakdown.credit.count}x)`,
    formatRupiah(report.paymentBreakdown.debit.total + report.paymentBreakdown.credit.total)
  );

  y += 0.5;
  drawDashedLine();
  doc.setFont('courier', 'bold');
  doc.setFontSize(baseFontSize);
  doc.setTextColor(15, 23, 42);
  doc.text('PRODUK TERLARIS', marginX, y);
  y += lineH;

  doc.setTextColor(51, 65, 85);
  if (report.topProducts.length === 0) {
    doc.setFont('courier', 'normal');
    doc.text('Belum ada transaksi', centerX, y, { align: 'center' });
    y += lineH;
  } else {
    report.topProducts.slice(0, 5).forEach((p, idx) => {
      const rightStr = `${p.quantity}x | ${formatNumber(p.totalRevenue)}`;
      const maxNameChars = is80mm ? 24 : 15;
      const rawName = `${idx + 1}. ${p.name}`;
      const name = rawName.length > maxNameChars ? `${rawName.slice(0, maxNameChars - 1)}…` : rawName;
      drawRow(name, rightStr);
    });
  }

  y += 1;
  drawDashedLine();
  y += 2;
  doc.setFont('courier', 'normal');
  doc.setFontSize(baseFontSize - 0.5);
  doc.text('Tanda Tangan Penanggung Jawab', centerX, y, { align: 'center' });
  y += 12;
  doc.text('( .......................... )', centerX, y, { align: 'center' });
  y += lineH;
  doc.text('Kasir / Supervisor Toko', centerX, y, { align: 'center' });

  const cleanStoreName = sanitizeFilename(store.storeName, 'Toko');
  const cleanDate = sanitizeFilename(report.date, 'tanggal');
  doc.save(`Laporan_Harian_${cleanDate}_${cleanStoreName}.pdf`);
}
