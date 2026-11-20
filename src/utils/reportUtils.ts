/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DailySalesReport, Order, StoreProfile } from '../types/pos';
import { formatDateOnly, formatDateTime, formatRupiah, getLocalDateString } from './formatters';
import { escapeHtml, sanitizeCsvCell, sanitizeFilename } from './sanitize';

export function calculateDailyReport(orders: Order[], targetDate: string): DailySalesReport {
  const dayOrders = orders.filter((o) => {
    if (o.status !== 'completed') return false;
    const orderDate = getLocalDateString(o.timestamp);
    return orderDate === targetDate;
  });

  let totalGrossSales = 0;
  let totalNetSales = 0;
  let totalDiscounts = 0;
  let totalTax = 0;
  let totalServiceCharge = 0;
  let totalItemsSold = 0;
  let totalCost = 0;

  const paymentBreakdown = {
    cash: { count: 0, total: 0 },
    qris: { count: 0, total: 0 },
    transfer: { count: 0, total: 0 },
    debit: { count: 0, total: 0 },
    credit: { count: 0, total: 0 },
  };

  const productMap = new Map<string, { id: string; name: string; quantity: number; totalRevenue: number }>();

  // Hourly buckets: 07:00 to 23:00
  const hourlyMap: Record<string, { total: number; count: number }> = {};
  for (let h = 7; h <= 23; h++) {
    const hourLabel = `${String(h).padStart(2, '0')}:00`;
    hourlyMap[hourLabel] = { total: 0, count: 0 };
  }

  for (const order of dayOrders) {
    totalGrossSales += order.total;
    totalNetSales += order.subtotal - order.discount;
    totalDiscounts += order.discount;
    totalTax += order.taxAmount;
    totalServiceCharge += order.serviceChargeAmount;

    // Payment breakdown
    const pm = order.paymentMethod;
    if (paymentBreakdown[pm]) {
      paymentBreakdown[pm].count += 1;
      paymentBreakdown[pm].total += order.total;
    }

    // Items and costs
    for (const item of order.items) {
      totalItemsSold += item.quantity;
      const itemCost = (item.product.costPrice || 0) * item.quantity;
      totalCost += itemCost;

      const existing = productMap.get(item.product.id);
      const itemRev = item.product.price * item.quantity - item.discount;
      if (existing) {
        existing.quantity += item.quantity;
        existing.totalRevenue += itemRev;
      } else {
        productMap.set(item.product.id, {
          id: item.product.id,
          name: item.product.name,
          quantity: item.quantity,
          totalRevenue: itemRev,
        });
      }
    }

    // Hourly
    try {
      const orderDate = new Date(order.timestamp);
      const h = orderDate.getHours();
      const hourLabel = `${String(h).padStart(2, '0')}:00`;
      if (!hourlyMap[hourLabel]) {
        hourlyMap[hourLabel] = { total: 0, count: 0 };
      }
      hourlyMap[hourLabel].total += order.total;
      hourlyMap[hourLabel].count += 1;
    } catch {
      // ignore
    }
  }

  const topProducts = Array.from(productMap.values()).sort((a, b) => b.quantity - a.quantity);
  const hourlySales = Object.entries(hourlyMap).map(([hour, val]) => ({
    hour,
    total: val.total,
    count: val.count,
  }));

  const totalTransactions = dayOrders.length;
  const averageOrderValue = totalTransactions > 0 ? Math.round(totalGrossSales / totalTransactions) : 0;
  const totalProfit = totalGrossSales - totalCost;

  return {
    date: targetDate,
    totalTransactions,
    totalGrossSales,
    totalNetSales,
    totalCost,
    totalProfit,
    totalDiscounts,
    totalTax,
    totalServiceCharge,
    totalItemsSold,
    averageOrderValue,
    paymentBreakdown,
    topProducts,
    hourlySales,
    transactions: dayOrders,
  };
}

/**
 * Builds a structured, beautifully styled HTML document containing complete tables
 * with borders, colors, and alignments for Excel (.xls) and standalone HTML report.
 */
export function generateReportHTMLTable(report: DailySalesReport, store: StoreProfile): string {
  const exportTime = new Date().toLocaleString('id-ID', {
    dateStyle: 'full',
    timeStyle: 'medium',
  });

  const paymentNames: Record<string, string> = {
    cash: 'Tunai (Cash)',
    qris: 'QRIS Dinamis / Statis',
    transfer: 'Transfer Bank',
    debit: 'Kartu Debit EDC',
    credit: 'Kartu Kredit',
  };

  // Helper calculation for percentages
  const totalGross = report.totalGrossSales || 1;
  const totalTrx = report.totalTransactions || 1;

  // Render rows for payments
  const paymentRows = Object.entries(report.paymentBreakdown).map(([key, data], idx) => {
    const trxPct = ((data.count / totalTrx) * 100).toFixed(1);
    const amountPct = ((data.total / totalGross) * 100).toFixed(1);
    const isEven = idx % 2 === 1;
    const bg = isEven ? '#f8fafc' : '#ffffff';

    return `
      <tr style="background-color: ${bg};">
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 7px 10px;">${idx + 1}</td>
        <td style="border: 1px solid #cbd5e1; padding: 7px 10px; font-weight: 600;">${escapeHtml(paymentNames[key] || key)}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 7px 10px;">${data.count} Trx</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 7px 10px;">${trxPct}%</td>
        <td style="text-align: right; border: 1px solid #cbd5e1; padding: 7px 10px; font-weight: bold; font-family: monospace;">${escapeHtml(formatRupiah(data.total))}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 7px 10px;">${amountPct}%</td>
      </tr>
    `;
  }).join('');

  // Render rows for top products
  const productRows = report.topProducts.map((p, idx) => {
    const isEven = idx % 2 === 1;
    const bg = isEven ? '#f8fafc' : '#ffffff';
    const pct = ((p.totalRevenue / totalGross) * 100).toFixed(1);
    const avgPrice = p.quantity > 0 ? Math.round(p.totalRevenue / p.quantity) : 0;

    return `
      <tr style="background-color: ${bg};">
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 7px 10px;">${idx + 1}</td>
        <td style="border: 1px solid #cbd5e1; padding: 7px 10px; font-weight: 600;">${escapeHtml(p.name)}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 7px 10px; font-weight: bold;">${p.quantity} Pcs</td>
        <td style="text-align: right; border: 1px solid #cbd5e1; padding: 7px 10px; font-family: monospace;">${escapeHtml(formatRupiah(avgPrice))}</td>
        <td style="text-align: right; border: 1px solid #cbd5e1; padding: 7px 10px; font-weight: bold; font-family: monospace;">${escapeHtml(formatRupiah(p.totalRevenue))}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 7px 10px;">${pct}%</td>
      </tr>
    `;
  }).join('');

  // Render rows for hourly sales (active hours only or all)
  const activeHours = report.hourlySales.filter((h) => h.count > 0 || h.total > 0);
  const hourlyRows = (activeHours.length > 0 ? activeHours : report.hourlySales.slice(0, 8)).map((h, idx) => {
    const isEven = idx % 2 === 1;
    const bg = isEven ? '#f8fafc' : '#ffffff';
    const pct = ((h.total / totalGross) * 100).toFixed(1);

    return `
      <tr style="background-color: ${bg};">
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 7px 10px;">${idx + 1}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 7px 10px; font-weight: 600;">${escapeHtml(h.hour)} - ${parseInt(h.hour, 10) + 1}:00</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 7px 10px;">${h.count} Transaksi</td>
        <td style="text-align: right; border: 1px solid #cbd5e1; padding: 7px 10px; font-weight: bold; font-family: monospace;">${escapeHtml(formatRupiah(h.total))}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 7px 10px;">${pct}%</td>
      </tr>
    `;
  }).join('');

  // Render rows for transactions
  const transactionRows = report.transactions.map((tx, idx) => {
    const isEven = idx % 2 === 1;
    const bg = isEven ? '#f8fafc' : '#ffffff';
    const cust = tx.customerName || (tx.tableNumber ? `Meja ${tx.tableNumber}` : 'Pelanggan Walk-In');
    const itemsSummary = tx.items.map((i) => `${i.quantity}x ${i.product.name}`).join(', ');
    const txTime = new Date(tx.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    return `
      <tr style="background-color: ${bg};">
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 7px 10px;">${idx + 1}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 7px 10px; font-family: monospace; font-weight: bold;">#${escapeHtml(tx.id)}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 7px 10px;">${escapeHtml(txTime)}</td>
        <td style="border: 1px solid #cbd5e1; padding: 7px 10px;">${escapeHtml(tx.cashierName || 'Kasir')}</td>
        <td style="border: 1px solid #cbd5e1; padding: 7px 10px;">${escapeHtml(cust)}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 7px 10px;">${escapeHtml(paymentNames[tx.paymentMethod] || tx.paymentMethod.toUpperCase())}</td>
        <td style="border: 1px solid #cbd5e1; padding: 7px 10px; font-size: 10pt; color: #334155;">${escapeHtml(itemsSummary)}</td>
        <td style="text-align: right; border: 1px solid #cbd5e1; padding: 7px 10px; font-family: monospace;">${escapeHtml(formatRupiah(tx.subtotal))}</td>
        <td style="text-align: right; border: 1px solid #cbd5e1; padding: 7px 10px; font-family: monospace; color: #dc2626;">${tx.discount > 0 ? escapeHtml(tx.discountPercent ? `${tx.discountPercent}% (-${formatRupiah(tx.discount)})` : `-${formatRupiah(tx.discount)}`) : 'Rp 0'}</td>
        <td style="text-align: right; border: 1px solid #cbd5e1; padding: 7px 10px; font-family: monospace; font-weight: bold; color: #047857;">${escapeHtml(formatRupiah(tx.total))}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 7px 10px; color: #059669; font-weight: 600;">Selesai</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Laporan Penjualan Harian - ${escapeHtml(store.storeName)} - ${escapeHtml(report.date)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background-color: #ffffff;
      margin: 20px;
      line-height: 1.5;
    }
    .header-box {
      border-bottom: 3px solid #059669;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .store-title {
      font-size: 24px;
      font-weight: 800;
      color: #065f46;
      margin: 0;
    }
    .store-subtitle {
      font-size: 13px;
      color: #64748b;
      margin: 4px 0 0 0;
    }
    .report-title-badge {
      display: inline-block;
      background-color: #ecfdf5;
      color: #047857;
      border: 1px solid #a7f3d0;
      padding: 4px 12px;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 12px;
      margin-top: 8px;
    }
    .section-title {
      font-size: 15px;
      font-weight: 700;
      color: #0f172a;
      margin: 24px 0 10px 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 11pt;
    }
    th {
      background-color: #047857;
      color: #ffffff;
      font-weight: 700;
      text-align: left;
      padding: 9px 12px;
      border: 1px solid #065f46;
      font-size: 11pt;
    }
    th.center, td.center {
      text-align: center;
    }
    th.right, td.right {
      text-align: right;
    }
    td {
      padding: 8px 12px;
      border: 1px solid #cbd5e1;
      font-size: 10.5pt;
    }
    tr.footer-row td {
      background-color: #ecfdf5;
      font-weight: 800;
      border-top: 2px solid #047857;
      color: #064e3b;
    }
    .kpi-table td {
      border: 1px solid #e2e8f0;
      padding: 10px 14px;
    }
    .kpi-label {
      font-size: 10pt;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    .kpi-value {
      font-size: 14pt;
      font-weight: 800;
      color: #0f172a;
      margin-top: 4px;
    }
    .kpi-value.highlight {
      color: #047857;
    }
    .signature-container {
      margin-top: 40px;
      width: 100%;
      page-break-inside: avoid;
    }
    .signature-table td {
      border: none;
      text-align: center;
      padding: 20px 40px;
    }
    @media print {
      body { margin: 10mm; }
      .no-print { display: none; }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; page-break-after: auto; }
      th { background-color: #047857 !important; color: #ffffff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      tr.footer-row td { background-color: #ecfdf5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <!-- Header Info -->
  <div class="header-box">
    <table style="border: none; margin-bottom: 0;">
      <tr style="border: none; background: transparent;">
        <td style="border: none; padding: 0; vertical-align: top;">
          <h1 class="store-title">${escapeHtml(store.storeName)}</h1>
          <p class="store-subtitle">${escapeHtml(store.address || 'Alamat Toko')} &bull; Telp: ${escapeHtml(store.phone || '-')}</p>
          <div class="report-title-badge">LAPORAN PENJUALAN HARIAN (Z-REPORT)</div>
        </td>
        <td style="border: none; padding: 0; text-align: right; vertical-align: top;">
          <div style="font-size: 12px; color: #475569;">
            <div><strong>Tanggal Transaksi:</strong> ${escapeHtml(formatDateOnly(report.date))}</div>
            <div><strong>Waktu Ekspor:</strong> ${escapeHtml(exportTime)}</div>
            <div><strong>Status Kasir:</strong> Tutup Buku Harian</div>
          </div>
        </td>
      </tr>
    </table>
  </div>

  <!-- Tabel 1: Ringkasan KPI Utama -->
  <div class="section-title">1. RINGKASAN KINERJA PENJUALAN</div>
  <table class="kpi-table">
    <tr style="background-color: #f8fafc;">
      <td style="width: 25%;">
        <div class="kpi-label">Total Omset Kotor</div>
        <div class="kpi-value highlight">${formatRupiah(report.totalGrossSales)}</div>
      </td>
      <td style="width: 25%;">
        <div class="kpi-label">Total Transaksi</div>
        <div class="kpi-value">${report.totalTransactions} Transaksi</div>
      </td>
      <td style="width: 25%;">
        <div class="kpi-label">Total Item Terjual</div>
        <div class="kpi-value">${report.totalItemsSold} Pcs</div>
      </td>
      <td style="width: 25%;">
        <div class="kpi-label">Rata-rata Nota (AOV)</div>
        <div class="kpi-value">${formatRupiah(report.averageOrderValue)}</div>
      </td>
    </tr>
    <tr style="background-color: #ffffff;">
      <td>
        <div class="kpi-label">Total Diskon Diberikan</div>
        <div class="kpi-value" style="color: #dc2626;">${formatRupiah(report.totalDiscounts)}</div>
      </td>
      <td>
        <div class="kpi-label">Total Pajak (PPN)</div>
        <div class="kpi-value">${formatRupiah(report.totalTax)}</div>
      </td>
      <td>
        <div class="kpi-label">Estimasi Modal (HPP)</div>
        <div class="kpi-value" style="color: #64748b;">${formatRupiah(report.totalCost)}</div>
      </td>
      <td style="background-color: #ecfdf5;">
        <div class="kpi-label" style="color: #065f46;">Estimasi Laba Kotor</div>
        <div class="kpi-value" style="color: #047857;">${formatRupiah(report.totalProfit)}</div>
      </td>
    </tr>
  </table>

  <!-- Tabel 2: Rincian Metode Pembayaran -->
  <div class="section-title">2. RINCIAN METODE PEMBAYARAN</div>
  <table>
    <thead>
      <tr>
        <th style="width: 50px;" class="center">No</th>
        <th>Metode Pembayaran</th>
        <th class="center" style="width: 140px;">Jumlah Transaksi</th>
        <th class="center" style="width: 130px;">Persentase Trx</th>
        <th class="right" style="width: 180px;">Total Nominal (Rp)</th>
        <th class="center" style="width: 130px;">Porsi Omset</th>
      </tr>
    </thead>
    <tbody>
      ${paymentRows}
      <tr class="footer-row">
        <td colspan="2" style="text-align: center;">TOTAL AKUMULASI</td>
        <td class="center">${report.totalTransactions} Trx</td>
        <td class="center">100%</td>
        <td class="right" style="font-family: monospace;">${formatRupiah(report.totalGrossSales)}</td>
        <td class="center">100%</td>
      </tr>
    </tbody>
  </table>

  <!-- Tabel 3: Produk Terlaris -->
  <div class="section-title">3. DAFTAR PRODUK TERLARIS (TOP SELLING)</div>
  <table>
    <thead>
      <tr>
        <th style="width: 50px;" class="center">No</th>
        <th>Nama Menu / Produk</th>
        <th class="center" style="width: 140px;">Jumlah Terjual</th>
        <th class="right" style="width: 160px;">Harga Rata-rata</th>
        <th class="right" style="width: 180px;">Total Pendapatan (Rp)</th>
        <th class="center" style="width: 130px;">Porsi Omset</th>
      </tr>
    </thead>
    <tbody>
      ${productRows.length > 0 ? productRows : `<tr><td colspan="6" class="center" style="padding: 20px; color: #64748b;">Tidak ada data penjualan</td></tr>`}
      ${productRows.length > 0 ? `
      <tr class="footer-row">
        <td colspan="2" style="text-align: center;">TOTAL ITEM TERJUAL</td>
        <td class="center">${report.totalItemsSold} Pcs</td>
        <td class="right">-</td>
        <td class="right" style="font-family: monospace;">${formatRupiah(report.totalGrossSales)}</td>
        <td class="center">100%</td>
      </tr>
      ` : ''}
    </tbody>
  </table>

  <!-- Tabel 4: Tren Jam Operasional -->
  <div class="section-title">4. TREN PENJUALAN PER JAM</div>
  <table>
    <thead>
      <tr>
        <th style="width: 50px;" class="center">No</th>
        <th class="center" style="width: 180px;">Rentang Jam</th>
        <th class="center" style="width: 160px;">Jumlah Transaksi</th>
        <th class="right" style="width: 200px;">Total Omset (Rp)</th>
        <th class="center" style="width: 140px;">Kontribusi (%)</th>
      </tr>
    </thead>
    <tbody>
      ${hourlyRows.length > 0 ? hourlyRows : `<tr><td colspan="5" class="center" style="padding: 15px; color: #64748b;">Belum ada tren per jam</td></tr>`}
    </tbody>
  </table>

  <!-- Tabel 5: Daftar Seluruh Transaksi Nota Harian -->
  <div class="section-title">5. DAFTAR LENGKAP TRANSAKSI NOTA (${report.transactions.length} NOTA)</div>
  <table>
    <thead>
      <tr>
        <th style="width: 40px;" class="center">No</th>
        <th class="center" style="width: 110px;">No. Nota</th>
        <th class="center" style="width: 80px;">Waktu</th>
        <th style="width: 110px;">Kasir</th>
        <th style="width: 140px;">Pelanggan / Meja</th>
        <th class="center" style="width: 110px;">Metode</th>
        <th>Rincian Pesanan Menu</th>
        <th class="right" style="width: 100px;">Subtotal</th>
        <th class="right" style="width: 80px;">Diskon</th>
        <th class="right" style="width: 110px;">Total (Rp)</th>
        <th class="center" style="width: 70px;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${transactionRows.length > 0 ? transactionRows : `<tr><td colspan="11" class="center" style="padding: 20px; color: #64748b;">Belum ada transaksi pada tanggal ini</td></tr>`}
      ${transactionRows.length > 0 ? `
      <tr class="footer-row">
        <td colspan="7" style="text-align: center;">TOTAL KESELURUHAN NOTA HARIAN</td>
        <td class="right" style="font-family: monospace;">${formatRupiah(report.totalNetSales + report.totalDiscounts)}</td>
        <td class="right" style="font-family: monospace; color: #dc2626;">-${formatRupiah(report.totalDiscounts)}</td>
        <td class="right" style="font-family: monospace; color: #047857;">${formatRupiah(report.totalGrossSales)}</td>
        <td class="center">SELESAI</td>
      </tr>
      ` : ''}
    </tbody>
  </table>

  <!-- Tanda Tangan -->
  <div class="signature-container">
    <table class="signature-table">
      <tr>
        <td style="width: 50%;">
          <div style="font-size: 11pt; color: #64748b;">Dibuat Oleh:</div>
          <div style="margin-top: 55px; font-weight: bold; font-size: 11pt; text-decoration: underline;">
            ( ........................................ )
          </div>
          <div style="font-size: 10pt; color: #475569; margin-top: 4px;">Kasir Bertugas</div>
        </td>
        <td style="width: 50%;">
          <div style="font-size: 11pt; color: #64748b;">Disetujui & Diperiksa:</div>
          <div style="margin-top: 55px; font-weight: bold; font-size: 11pt; text-decoration: underline;">
            ( ........................................ )
          </div>
          <div style="font-size: 10pt; color: #475569; margin-top: 4px;">Supervisor / Pemilik Toko</div>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

/**
 * Export daily report to Excel (.xls) file with complete HTML tables,
 * styled borders, headers, and formatted currency.
 */
export function exportReportToExcel(report: DailySalesReport, store: StoreProfile): void {
  const htmlContent = generateReportHTMLTable(report, store);
  const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Laporan_Tabel_Kasir_${sanitizeFilename(report.date, 'tanggal')}_${sanitizeFilename(store.storeName, 'Toko')}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export daily report to standalone HTML document (.html)
 */
export function exportReportToHTML(report: DailySalesReport, store: StoreProfile): void {
  const htmlContent = generateReportHTMLTable(report, store);
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Laporan_Dokumen_Tabel_${sanitizeFilename(report.date, 'tanggal')}_${sanitizeFilename(store.storeName, 'Toko')}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export daily report to downloadable CSV file with UTF-8 BOM
 * and structured tabular sections.
 */
export function exportReportToCSV(report: DailySalesReport, storeName: string): void {
  const rows: string[][] = [
    ['========================================================================================'],
    ['LAPORAN PENJUALAN HARIAN (Z-REPORT) POS KASIRKU'],
    ['========================================================================================'],
    ['Nama Usaha', storeName],
    ['Tanggal Laporan', report.date],
    ['Waktu Ekspor', new Date().toLocaleString('id-ID')],
    [''],
    ['----------------------------------------------------------------------------------------'],
    ['TABEL 1: RINGKASAN UTAMA KINERJA PENJUALAN'],
    ['----------------------------------------------------------------------------------------'],
    ['Parameter Metrik', 'Nilai / Jumlah'],
    ['Total Transaksi Selesai', `${report.totalTransactions} Transaksi`],
    ['Total Item Produk Terjual', `${report.totalItemsSold} Pcs`],
    ['Total Omset Kotor', String(report.totalGrossSales)],
    ['Total Diskon Diberikan', String(report.totalDiscounts)],
    ['Total Pajak (PPN)', String(report.totalTax)],
    ['Biaya Layanan', String(report.totalServiceCharge)],
    ['Rata-rata Penjualan per Nota (AOV)', String(report.averageOrderValue)],
    ['Estimasi Modal HPP', String(report.totalCost)],
    ['Estimasi Laba Kotor', String(report.totalProfit)],
    [''],
    ['----------------------------------------------------------------------------------------'],
    ['TABEL 2: RINCIAN METODE PEMBAYARAN'],
    ['----------------------------------------------------------------------------------------'],
    ['No', 'Metode Pembayaran', 'Jumlah Transaksi', 'Total Nominal (Rp)'],
    ['1', 'Tunai (Cash)', String(report.paymentBreakdown.cash.count), String(report.paymentBreakdown.cash.total)],
    ['2', 'QRIS', String(report.paymentBreakdown.qris.count), String(report.paymentBreakdown.qris.total)],
    ['3', 'Transfer Bank', String(report.paymentBreakdown.transfer.count), String(report.paymentBreakdown.transfer.total)],
    ['4', 'Kartu Debit', String(report.paymentBreakdown.debit.count), String(report.paymentBreakdown.debit.total)],
    ['5', 'Kartu Kredit', String(report.paymentBreakdown.credit.count), String(report.paymentBreakdown.credit.total)],
    ['TOTAL', 'Seluruh Metode', String(report.totalTransactions), String(report.totalGrossSales)],
    [''],
    ['----------------------------------------------------------------------------------------'],
    ['TABEL 3: PRODUK TERLARIS (TOP SELLING MENU)'],
    ['----------------------------------------------------------------------------------------'],
    ['No', 'Nama Produk', 'Jumlah Terjual (Qty)', 'Total Pendapatan (Rp)'],
  ];

  report.topProducts.forEach((p, idx) => {
    rows.push([String(idx + 1), p.name, String(p.quantity), String(p.totalRevenue)]);
  });

  rows.push(['']);
  rows.push(['----------------------------------------------------------------------------------------']);
  rows.push(['TABEL 4: DAFTAR TRANSAKSI NOTA HARIAN']);
  rows.push(['----------------------------------------------------------------------------------------']);
  rows.push(['No', 'No Nota', 'Jam', 'Kasir', 'Pelanggan / Meja', 'Metode Bayar', 'Rincian Menu', 'Subtotal', 'Diskon', 'Total (Rp)']);

  report.transactions.forEach((tx, idx) => {
    const cust = tx.customerName || (tx.tableNumber ? `Meja ${tx.tableNumber}` : '-');
    const items = tx.items.map((i) => `${i.quantity}x ${i.product.name}`).join('; ');
    rows.push([
      String(idx + 1),
      tx.id,
      new Date(tx.timestamp).toLocaleTimeString('id-ID'),
      tx.cashierName || 'Kasir',
      cust,
      tx.paymentMethod.toUpperCase(),
      items,
      String(tx.subtotal),
      String(tx.discount),
      String(tx.total),
    ]);
  });

  // Prefix with UTF-8 BOM and neutralize CSV spreadsheet formula injection
  const csvContent =
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((val) => `"${sanitizeCsvCell(val).replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Laporan_Kasir_${sanitizeFilename(report.date, 'tanggal')}_${sanitizeFilename(storeName, 'Toko')}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export filtered transactions list to Excel (.xls) table
 */
export function exportTransactionsToExcel(orders: Order[], store: StoreProfile, customTitle?: string): void {
  const exportTime = new Date().toLocaleString('id-ID', {
    dateStyle: 'full',
    timeStyle: 'medium',
  });

  const paymentNames: Record<string, string> = {
    cash: 'Tunai (Cash)',
    qris: 'QRIS',
    transfer: 'Transfer Bank',
    debit: 'Kartu Debit',
    credit: 'Kartu Kredit',
  };

  let grandTotal = 0;
  let totalDiscounts = 0;

  const rows = orders.map((tx, idx) => {
    grandTotal += tx.total;
    totalDiscounts += tx.discount;
    const isEven = idx % 2 === 1;
    const bg = isEven ? '#f8fafc' : '#ffffff';
    const cust = tx.customerName || (tx.tableNumber ? `Meja ${tx.tableNumber}` : 'Pelanggan Walk-In');
    const itemsSummary = tx.items.map((i) => `${i.quantity}x ${i.product.name}`).join(', ');

    return `
      <tr style="background-color: ${bg};">
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 7px 10px;">${idx + 1}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 7px 10px; font-family: monospace; font-weight: bold;">#${escapeHtml(tx.id)}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 7px 10px;">${escapeHtml(formatDateTime(tx.timestamp))}</td>
        <td style="border: 1px solid #cbd5e1; padding: 7px 10px;">${escapeHtml(tx.cashierName || 'Kasir')}</td>
        <td style="border: 1px solid #cbd5e1; padding: 7px 10px;">${escapeHtml(cust)}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 7px 10px;">${escapeHtml(paymentNames[tx.paymentMethod] || tx.paymentMethod.toUpperCase())}</td>
        <td style="border: 1px solid #cbd5e1; padding: 7px 10px; font-size: 10pt; color: #334155;">${escapeHtml(itemsSummary)}</td>
        <td style="text-align: right; border: 1px solid #cbd5e1; padding: 7px 10px; font-family: monospace;">${escapeHtml(formatRupiah(tx.subtotal))}</td>
        <td style="text-align: right; border: 1px solid #cbd5e1; padding: 7px 10px; font-family: monospace; color: #dc2626;">${tx.discount > 0 ? escapeHtml(tx.discountPercent ? `${tx.discountPercent}% (-${formatRupiah(tx.discount)})` : `-${formatRupiah(tx.discount)}`) : 'Rp 0'}</td>
        <td style="text-align: right; border: 1px solid #cbd5e1; padding: 7px 10px; font-family: monospace; font-weight: bold; color: #047857;">${escapeHtml(formatRupiah(tx.total))}</td>
        <td style="text-align: center; border: 1px solid #cbd5e1; padding: 7px 10px; font-weight: 600; color: ${tx.status === 'completed' ? '#059669' : '#dc2626'};">${tx.status === 'completed' ? 'Selesai' : 'Dibatalkan'}</td>
      </tr>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Riwayat Transaksi - ${escapeHtml(store.storeName)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background-color: #ffffff;
      margin: 20px;
    }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
    th { background-color: #047857; color: #ffffff; font-weight: bold; padding: 9px 12px; border: 1px solid #065f46; text-align: left; }
    td { padding: 8px 12px; border: 1px solid #cbd5e1; font-size: 10pt; }
  </style>
</head>
<body>
  <div style="border-bottom: 2px solid #059669; padding-bottom: 12px; margin-bottom: 16px;">
    <h2 style="margin: 0; color: #065f46;">${escapeHtml(store.storeName)} - ${escapeHtml(customTitle || 'Daftar Riwayat Transaksi')}</h2>
    <p style="margin: 4px 0 0; color: #64748b; font-size: 11pt;">Waktu Ekspor: ${escapeHtml(exportTime)} &bull; Total: ${orders.length} Transaksi</p>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 40px; text-align: center;">No</th>
        <th style="width: 110px; text-align: center;">No. Nota</th>
        <th style="width: 140px; text-align: center;">Tanggal & Waktu</th>
        <th style="width: 100px;">Kasir</th>
        <th style="width: 130px;">Pelanggan / Meja</th>
        <th style="width: 100px; text-align: center;">Metode Bayar</th>
        <th>Rincian Pesanan Menu</th>
        <th style="width: 100px; text-align: right;">Subtotal</th>
        <th style="width: 80px; text-align: right;">Diskon</th>
        <th style="width: 110px; text-align: right;">Total (Rp)</th>
        <th style="width: 80px; text-align: center;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr style="background-color: #ecfdf5; font-weight: bold; border-top: 2px solid #047857;">
        <td colspan="7" style="text-align: center;">TOTAL AKUMULASI TRANSAKSI</td>
        <td style="text-align: right; font-family: monospace;">${escapeHtml(formatRupiah(grandTotal + totalDiscounts))}</td>
        <td style="text-align: right; font-family: monospace; color: #dc2626;">-${escapeHtml(formatRupiah(totalDiscounts))}</td>
        <td style="text-align: right; font-family: monospace; color: #047857;">${escapeHtml(formatRupiah(grandTotal))}</td>
        <td style="text-align: center;">-</td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;

  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Riwayat_Transaksi_Tabel_${sanitizeFilename(store.storeName, 'Toko')}_${new Date().toISOString().substring(0, 10)}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
