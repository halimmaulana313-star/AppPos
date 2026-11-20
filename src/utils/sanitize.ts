/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CartItem,
  CashierClosing,
  Order,
  PaymentMethod,
  PrinterConfig,
  Product,
  StoreProfile,
} from '../types/pos';
import { PRESET_LOGOS } from './presetLogos';

const PRESET_LOGO_URL_SET = new Set(PRESET_LOGOS.map((p) => p.dataUrl));
const RASTER_DATA_URL_REGEX =
  /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i;
const SAFE_COLOR_REGEX = /^#[0-9a-fA-F]{3,8}$/;
const DANGEROUS_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Escapes HTML special characters to neutralize stored XSS in HTML/Excel exports.
 */
export function escapeHtml(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

/**
 * Neutralizes CSV/Spreadsheet formula injection (=, +, -, @, TAB, CR).
 */
export function sanitizeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (!str) return '';
  if (/^[\s]*[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Produces a safe download filename stripped of path traversal and invalid characters.
 */
export function sanitizeFilename(name: string, fallback = 'KasirKu_File'): string {
  const cleaned = String(name || '')
    .replace(/\.\./g, '_')
    .replace(/[<>:"/\\|?*\x00-\x1f\s]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
}

/**
 * Validates that an image source is either an HTTP(S) URL, a safe raster base64 data URL,
 * or (when explicitly enabled for store logos) an exact match from static PRESET_LOGOS.
 * Rejects javascript:, vbscript:, data:text/html, and untrusted SVG data URLs.
 */
export function sanitizeSafeImageUrl(
  value: unknown,
  options: { allowPresetSvg?: boolean; maxLength?: number } = {}
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  const maxLen = options.maxLength ?? 350_000;
  if (!trimmed || trimmed.length > maxLen) return undefined;

  if (options.allowPresetSvg && PRESET_LOGO_URL_SET.has(trimmed)) {
    return trimmed;
  }

  if (RASTER_DATA_URL_REGEX.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    // Reject relative/malformed/unsupported scheme URLs
  }

  return undefined;
}

/**
 * Recursively clones plain JSON structures while dropping prototype-pollution keys.
 */
export function stripDangerousKeys<T>(input: unknown, depth = 0): T {
  if (depth > 16 || input === null || typeof input !== 'object') {
    return input as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => stripDangerousKeys(item, depth + 1)) as unknown as T;
  }
  const cleanObj: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    if (DANGEROUS_PROTO_KEYS.has(key)) continue;
    cleanObj[key] = stripDangerousKeys(val, depth + 1);
  }
  return cleanObj as T;
}

export function safeJsonParse<T>(raw: string): T | null {
  try {
    const parsed = JSON.parse(raw);
    return stripDangerousKeys<T>(parsed);
  } catch {
    return null;
  }
}

function clipText(val: unknown, maxLen: number, fallback = ''): string {
  if (typeof val !== 'string') return fallback;
  const trimmed = val.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLen);
}

function clipOptionalText(val: unknown, maxLen: number): string | undefined {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function clampFinite(val: unknown, min: number, max: number, fallback: number): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export function sanitizeStoreProfile(
  raw: unknown,
  fallback: StoreProfile
): StoreProfile {
  if (!raw || typeof raw !== 'object') return fallback;
  const d = raw as Record<string, unknown>;
  return {
    storeName: clipText(d.storeName, 120, fallback.storeName),
    tagline: clipText(d.tagline, 200, ''),
    address: clipText(d.address, 300, ''),
    phone: clipText(d.phone, 40, ''),
    instagram: clipOptionalText(d.instagram, 80),
    wifiName: clipOptionalText(d.wifiName, 80),
    wifiPassword: clipOptionalText(d.wifiPassword, 80),
    footerNote:
      typeof d.footerNote === 'string'
        ? d.footerNote.slice(0, 500)
        : fallback.footerNote,
    logoUrl: sanitizeSafeImageUrl(d.logoUrl, { allowPresetSvg: true, maxLength: 350_000 }),
    qrisImageUrl: sanitizeSafeImageUrl(d.qrisImageUrl, { allowPresetSvg: false, maxLength: 350_000 }),
    qrisMerchantName: clipOptionalText(d.qrisMerchantName, 120),
    qrisNmid: clipOptionalText(d.qrisNmid, 80),
    enableTax: Boolean(d.enableTax),
    taxPercentage: clampFinite(d.taxPercentage, 0, 100, fallback.taxPercentage),
    enableServiceCharge: Boolean(d.enableServiceCharge),
    serviceChargePercentage: clampFinite(
      d.serviceChargePercentage,
      0,
      100,
      fallback.serviceChargePercentage
    ),
    lowStockThreshold: Math.round(
      clampFinite(d.lowStockThreshold, 1, 500, fallback.lowStockThreshold ?? 10)
    ),
    currency: clipText(d.currency, 10, 'IDR'),
  };
}

export function sanitizeProduct(raw: unknown, indexFallback = 0): Product | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const id = clipText(d.id, 128).replace(/[^a-zA-Z0-9_\-]/g, '-');
  const name = clipText(d.name, 140);
  if (!name) return null;

  const colorRaw = typeof d.color === 'string' ? d.color.trim() : '';

  return {
    id: id || `prod-import-${Date.now()}-${indexFallback}`,
    name,
    category: clipText(d.category, 80, 'Lainnya'),
    price: Math.round(clampFinite(d.price, 0, 1_000_000_000, 0)),
    costPrice: Math.round(clampFinite(d.costPrice, 0, 1_000_000_000, 0)),
    stock: Math.floor(clampFinite(d.stock, 0, 1_000_000, 0)),
    sku: clipText(d.sku, 60, `SKU-${indexFallback + 1}`),
    image: sanitizeSafeImageUrl(d.image, { allowPresetSvg: false, maxLength: 300_000 }),
    description: clipOptionalText(d.description, 500),
    color: SAFE_COLOR_REGEX.test(colorRaw) ? colorRaw : undefined,
  };
}

export function sanitizeProductList(raw: unknown, fallback: Product[]): Product[] {
  if (!Array.isArray(raw)) return fallback;
  const out: Product[] = [];
  for (let i = 0; i < raw.length && i < 1000; i++) {
    const item = sanitizeProduct(raw[i], i);
    if (item) out.push(item);
  }
  return out;
}

const VALID_ORDER_TYPES = new Set(['dine_in', 'takeaway', 'delivery']);
const VALID_PAYMENT_METHODS = new Set<PaymentMethod>([
  'cash',
  'qris',
  'transfer',
  'debit',
  'credit',
]);
const VALID_ORDER_STATUSES = new Set(['completed', 'cancelled', 'refunded']);

export function sanitizeOrder(raw: unknown): Order | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const id = clipText(d.id, 128).replace(/[^a-zA-Z0-9_\-]/g, '-');
  if (!id) return null;

  const rawItems = Array.isArray(d.items) ? d.items : [];
  const items: CartItem[] = [];
  for (let i = 0; i < rawItems.length && i < 200; i++) {
    const it = rawItems[i] as Record<string, unknown> | null;
    if (!it || typeof it !== 'object') continue;
    const prod = sanitizeProduct(it.product, i);
    if (!prod) continue;
    items.push({
      product: prod,
      quantity: Math.floor(clampFinite(it.quantity, 1, 10_000, 1)),
      discount: Math.round(clampFinite(it.discount, 0, 1_000_000_000, 0)),
      note: clipOptionalText(it.note, 300),
    });
  }

  const orderType = VALID_ORDER_TYPES.has(String(d.orderType))
    ? (String(d.orderType) as Order['orderType'])
    : 'dine_in';
  const paymentMethod = VALID_PAYMENT_METHODS.has(d.paymentMethod as PaymentMethod)
    ? (d.paymentMethod as PaymentMethod)
    : 'cash';
  const status = VALID_ORDER_STATUSES.has(String(d.status))
    ? (String(d.status) as Order['status'])
    : 'completed';

  const tsRaw = typeof d.timestamp === 'string' ? d.timestamp : '';
  const tsValid = tsRaw && !Number.isNaN(new Date(tsRaw).getTime())
    ? tsRaw.slice(0, 64)
    : new Date().toISOString();

  return {
    id,
    orderNumber: Math.floor(clampFinite(d.orderNumber, 0, 10_000_000, 1)),
    timestamp: tsValid,
    cashierName: clipText(d.cashierName, 100, 'Kasir'),
    customerName: clipOptionalText(d.customerName, 120),
    tableNumber: clipOptionalText(d.tableNumber, 40),
    orderType,
    items,
    subtotal: Math.round(clampFinite(d.subtotal, 0, 10_000_000_000, 0)),
    discount: Math.round(clampFinite(d.discount, 0, 10_000_000_000, 0)),
    discountPercent:
      d.discountPercent !== undefined
        ? clampFinite(d.discountPercent, 0, 100, 0)
        : undefined,
    taxRate: clampFinite(d.taxRate, 0, 1, 0),
    taxAmount: Math.round(clampFinite(d.taxAmount, 0, 10_000_000_000, 0)),
    serviceChargeRate: clampFinite(d.serviceChargeRate, 0, 1, 0),
    serviceChargeAmount: Math.round(
      clampFinite(d.serviceChargeAmount, 0, 10_000_000_000, 0)
    ),
    total: Math.round(clampFinite(d.total, 0, 10_000_000_000, 0)),
    paymentMethod,
    amountPaid: Math.round(clampFinite(d.amountPaid, 0, 10_000_000_000, 0)),
    change: Math.round(clampFinite(d.change, 0, 10_000_000_000, 0)),
    status,
    notes: clipOptionalText(d.notes, 500),
  };
}

export function sanitizeOrderList(raw: unknown, fallback: Order[]): Order[] {
  if (!Array.isArray(raw)) return fallback;
  const out: Order[] = [];
  for (let i = 0; i < raw.length && i < 2000; i++) {
    const item = sanitizeOrder(raw[i]);
    if (item) out.push(item);
  }
  return out;
}

export function sanitizePrinterConfig(
  raw: unknown,
  fallback: PrinterConfig
): PrinterConfig {
  if (!raw || typeof raw !== 'object') return fallback;
  const d = raw as Record<string, unknown>;
  return {
    paperWidth: d.paperWidth === '80mm' ? '80mm' : '58mm',
    connectedDeviceName: clipOptionalText(d.connectedDeviceName, 100) ?? null,
    autoPrintOnPayment: Boolean(d.autoPrintOnPayment ?? fallback.autoPrintOnPayment),
    autoCutPaper: Boolean(d.autoCutPaper ?? fallback.autoCutPaper),
    openCashDrawer: Boolean(d.openCashDrawer ?? fallback.openCashDrawer),
    printStoreLogo: Boolean(d.printStoreLogo ?? fallback.printStoreLogo),
    printFooterNote: Boolean(d.printFooterNote ?? fallback.printFooterNote),
    printWifiInfo: Boolean(d.printWifiInfo ?? fallback.printWifiInfo),
    isSimulationMode: Boolean(d.isSimulationMode ?? fallback.isSimulationMode),
    customCharPerLine:
      d.customCharPerLine !== undefined
        ? Math.round(clampFinite(d.customCharPerLine, 20, 80, 32))
        : undefined,
  };
}

const DATE_YYYY_MM_DD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function sanitizeCashierClosing(raw: unknown): CashierClosing | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const id = clipText(d.id, 128).replace(/[^a-zA-Z0-9_\-]/g, '-');
  if (!id) return null;

  const dateRaw = typeof d.date === 'string' ? d.date.trim() : '';
  const date = DATE_YYYY_MM_DD_REGEX.test(dateRaw)
    ? dateRaw
    : new Date().toISOString().slice(0, 10);

  const closedAtRaw = typeof d.closedAt === 'string' ? d.closedAt : '';
  const closedAt =
    closedAtRaw && !Number.isNaN(new Date(closedAtRaw).getTime())
      ? closedAtRaw.slice(0, 64)
      : new Date().toISOString();

  const openingCash = Math.round(clampFinite(d.openingCash, 0, 10_000_000_000, 0));
  const cashOut = Math.round(clampFinite(d.cashOut, 0, 10_000_000_000, 0));
  const systemCashSales = Math.round(clampFinite(d.systemCashSales, 0, 10_000_000_000, 0));
  const systemNonCashSales = Math.round(clampFinite(d.systemNonCashSales, 0, 10_000_000_000, 0));
  const expectedCash = Math.round(
    clampFinite(
      d.expectedCash,
      -10_000_000_000,
      10_000_000_000,
      openingCash + systemCashSales - cashOut
    )
  );
  const actualCash = Math.round(clampFinite(d.actualCash, 0, 10_000_000_000, 0));
  const cashDifference = Math.round(
    clampFinite(d.cashDifference, -10_000_000_000, 10_000_000_000, actualCash - expectedCash)
  );

  return {
    id,
    date,
    closedAt,
    cashierUid: clipOptionalText(d.cashierUid, 128),
    cashierName: clipText(d.cashierName, 100, 'Kasir'),
    shiftLabel: clipOptionalText(d.shiftLabel, 60),
    openingCash,
    cashOut,
    cashOutNote: clipOptionalText(d.cashOutNote, 200),
    systemCashSales,
    systemNonCashSales,
    qrisSales: Math.round(clampFinite(d.qrisSales, 0, 10_000_000_000, 0)),
    transferSales: Math.round(clampFinite(d.transferSales, 0, 10_000_000_000, 0)),
    cardSales: Math.round(clampFinite(d.cardSales, 0, 10_000_000_000, 0)),
    totalSales: Math.round(clampFinite(d.totalSales, 0, 10_000_000_000, 0)),
    totalDiscounts: Math.round(clampFinite(d.totalDiscounts, 0, 10_000_000_000, 0)),
    totalTax: Math.round(clampFinite(d.totalTax, 0, 10_000_000_000, 0)),
    totalServiceCharge: Math.round(clampFinite(d.totalServiceCharge, 0, 10_000_000_000, 0)),
    totalTransactions: Math.floor(clampFinite(d.totalTransactions, 0, 1_000_000, 0)),
    totalItemsSold: Math.floor(clampFinite(d.totalItemsSold, 0, 1_000_000, 0)),
    expectedCash,
    actualCash,
    cashDifference,
    notes: clipOptionalText(d.notes, 500),
    status: 'closed',
  };
}

export function sanitizeCashierClosingList(
  raw: unknown,
  fallback: CashierClosing[] = []
): CashierClosing[] {
  if (!Array.isArray(raw)) return fallback;
  const out: CashierClosing[] = [];
  for (let i = 0; i < raw.length && i < 1000; i++) {
    const item = sanitizeCashierClosing(raw[i]);
    if (item) out.push(item);
  }
  return out;
}
