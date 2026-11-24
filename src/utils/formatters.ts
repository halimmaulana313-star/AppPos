/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PaperWidth, ReceiptCustomTexts, StoreProfile } from '../types/pos';

export const DEFAULT_RECEIPT_TEXTS: Required<ReceiptCustomTexts> = {
  headerNote: '',
  phoneLabel: 'Telp',
  receiptNumberLabel: 'No',
  dateLabel: 'Tgl',
  cashierLabel: 'Kasir',
  customerLabel: 'Plg',
  subtotalLabel: 'Subtotal',
  discountLabel: 'Diskon Nota',
  taxLabel: 'Pajak',
  serviceLabel: 'Biaya Layanan',
  totalLabel: 'TOTAL',
  paymentMethodLabel: 'Metode Bayar',
  amountPaidLabel: 'Nominal Bayar',
  changeLabel: 'Kembalian',
  wifiLabel: 'WiFi',
  wifiPasswordLabel: 'Pass',
};

export function resolveReceiptTexts(store?: Partial<StoreProfile> | null): Required<ReceiptCustomTexts> {
  const custom = store?.receiptTexts || {};
  const pick = (val: string | undefined, fallback: string) => {
    if (typeof val !== 'string') return fallback;
    const trimmed = val.trim();
    return trimmed || fallback;
  };
  return {
    headerNote: typeof custom.headerNote === 'string' ? custom.headerNote.trim() : '',
    phoneLabel: pick(custom.phoneLabel, DEFAULT_RECEIPT_TEXTS.phoneLabel),
    receiptNumberLabel: pick(custom.receiptNumberLabel, DEFAULT_RECEIPT_TEXTS.receiptNumberLabel),
    dateLabel: pick(custom.dateLabel, DEFAULT_RECEIPT_TEXTS.dateLabel),
    cashierLabel: pick(custom.cashierLabel, DEFAULT_RECEIPT_TEXTS.cashierLabel),
    customerLabel: pick(custom.customerLabel, DEFAULT_RECEIPT_TEXTS.customerLabel),
    subtotalLabel: pick(custom.subtotalLabel, DEFAULT_RECEIPT_TEXTS.subtotalLabel),
    discountLabel: pick(custom.discountLabel, DEFAULT_RECEIPT_TEXTS.discountLabel),
    taxLabel: pick(custom.taxLabel, DEFAULT_RECEIPT_TEXTS.taxLabel),
    serviceLabel: pick(custom.serviceLabel, DEFAULT_RECEIPT_TEXTS.serviceLabel),
    totalLabel: pick(custom.totalLabel, DEFAULT_RECEIPT_TEXTS.totalLabel),
    paymentMethodLabel: pick(custom.paymentMethodLabel, DEFAULT_RECEIPT_TEXTS.paymentMethodLabel),
    amountPaidLabel: pick(custom.amountPaidLabel, DEFAULT_RECEIPT_TEXTS.amountPaidLabel),
    changeLabel: pick(custom.changeLabel, DEFAULT_RECEIPT_TEXTS.changeLabel),
    wifiLabel: pick(custom.wifiLabel, DEFAULT_RECEIPT_TEXTS.wifiLabel),
    wifiPasswordLabel: pick(custom.wifiPasswordLabel, DEFAULT_RECEIPT_TEXTS.wifiPasswordLabel),
  };
}

export function formatRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .format(value)
    .replace(/[\u00A0\u202F]/g, ' ');
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('id-ID').format(value).replace(/[\u00A0\u202F]/g, ' ');
}

/**
 * Converts any Unicode string into pure 7-bit printable ASCII (0x20-0x7E)
 * so Chinese-firmware ESC/POS thermal printers (GBK/GB18030) never decode
 * UTF-8 multi-byte sequences (like NBSP 0xC2 0xA0) as Kanji/Hanzi characters.
 */
export function sanitizeThermalAscii(text: string): string {
  return text
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[–—−]/g, '-')
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/…/g, '...')
    .replace(/[•·]/g, '*')
    .replace(/↳/g, '>')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E\r\n]/g, ' ');
}

export function formatDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return isoString;
  }
}

export function getLocalDateString(dateInput: string | Date = new Date()): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateOnly(dateString: string): string {
  try {
    let d: Date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [y, m, day] = dateString.split('-').map(Number);
      d = new Date(y, m - 1, day);
    } else {
      d = new Date(dateString);
    }
    return new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return dateString;
  }
}

export function formatTimeOnly(isoString: string): string {
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(d);
  } catch {
    return isoString;
  }
}

export function formatShortDate(dateString: string): string {
  try {
    let d: Date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [y, m, day] = dateString.split('-').map(Number);
      d = new Date(y, m - 1, day);
    } else {
      d = new Date(dateString);
    }
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return dateString;
  }
}

export function formatPaymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    cash: 'TUNAI',
    qris: 'QRIS',
    transfer: 'TRANSFER',
    debit: 'DEBIT',
    credit: 'KREDIT',
  };
  return labels[method] || method.toUpperCase();
}

export function formatOrderTypeLabel(orderType?: string, tableNumber?: string): string {
  if (tableNumber) return `Meja: ${tableNumber}`;
  if (orderType === 'takeaway') return 'Bungkus';
  if (orderType === 'delivery') return 'Delivery';
  return 'Dine-In';
}

/**
 * Returns character capacity per line for thermal printers.
 * 58mm is typically 32 characters (Font A).
 * 80mm is typically 48 characters (Font A).
 */
export function getLineCharLimit(paperWidth: PaperWidth, customCharPerLine?: number): number {
  if (typeof customCharPerLine === 'number' && Number.isFinite(customCharPerLine)) {
    const rounded = Math.round(customCharPerLine);
    if (rounded >= 20 && rounded <= 80) return rounded;
  }
  return paperWidth === '80mm' ? 48 : 32;
}

/**
 * Wraps text into lines not exceeding maxLen characters without losing words.
 */
export function wrapTextLines(text: string, maxLen: number): string[] {
  const safeMax = Math.max(8, maxLen);
  const paragraphs = text.split(/\r?\n/);
  const result: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      result.push('');
      continue;
    }

    const words = trimmed.split(/\s+/);
    let current = '';

    for (const word of words) {
      if (word.length > safeMax) {
        if (current) {
          result.push(current);
          current = '';
        }
        for (let i = 0; i < word.length; i += safeMax) {
          result.push(word.slice(i, i + safeMax));
        }
        continue;
      }

      if (!current) {
        current = word;
      } else if (current.length + 1 + word.length <= safeMax) {
        current += ' ' + word;
      } else {
        result.push(current);
        current = word;
      }
    }

    if (current) result.push(current);
  }

  return result.length > 0 ? result : [''];
}

/**
 * Creates a two-column aligned line, e.g.:
 * "1x Es Kopi Susu          22.000"
 */
export function justifyLine(left: string, right: string, maxLen: number): string {
  const leftTrimmed = left.trim();
  const rightTrimmed = right.trim();

  if (leftTrimmed.length + rightTrimmed.length + 1 > maxLen) {
    const allowedLeft = Math.max(4, maxLen - rightTrimmed.length - 1);
    const safeLeft = leftTrimmed.substring(0, allowedLeft);
    const spaces = Math.max(1, maxLen - safeLeft.length - rightTrimmed.length);
    return safeLeft + ' '.repeat(spaces) + rightTrimmed;
  }

  const spaces = Math.max(1, maxLen - leftTrimmed.length - rightTrimmed.length);
  return leftTrimmed + ' '.repeat(spaces) + rightTrimmed;
}

/**
 * Wraps long left-hand text across multiple lines when left + right exceeds maxLen,
 * keeping the right-hand value cleanly right-aligned without truncating item names.
 */
export function justifyWrappedLines(left: string, right: string, maxLen: number): string[] {
  const leftTrimmed = left.trim();
  const rightTrimmed = right.trim();

  if (!rightTrimmed) {
    return wrapTextLines(leftTrimmed, maxLen);
  }
  if (!leftTrimmed) {
    return [rightTrimmed.padStart(maxLen, ' ')];
  }
  if (leftTrimmed.length + rightTrimmed.length + 1 <= maxLen) {
    return [justifyLine(leftTrimmed, rightTrimmed, maxLen)];
  }

  const wrappedLeft = wrapTextLines(leftTrimmed, maxLen);
  const lastIdx = wrappedLeft.length - 1;
  const lastLine = wrappedLeft[lastIdx];

  if (lastLine.length + rightTrimmed.length + 1 <= maxLen) {
    wrappedLeft[lastIdx] = justifyLine(lastLine, rightTrimmed, maxLen);
    return wrappedLeft;
  }

  wrappedLeft.push(rightTrimmed.padStart(maxLen, ' '));
  return wrappedLeft;
}

/**
 * Center aligns text for thermal receipt
 */
export function centerText(text: string, maxLen: number): string {
  const trimmed = text.trim();
  if (trimmed.length >= maxLen) return trimmed.substring(0, maxLen);
  const leftPadding = Math.floor((maxLen - trimmed.length) / 2);
  const rightPadding = maxLen - trimmed.length - leftPadding;
  return ' '.repeat(leftPadding) + trimmed + ' '.repeat(rightPadding);
}

/**
 * Creates separator line e.g. "--------------------------------"
 */
export function createSeparator(char = '-', maxLen: number): string {
  return char.repeat(maxLen);
}

/**
 * Safely copies text to clipboard, with textarea fallback for restricted iframe contexts.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    } catch {
      return false;
    }
  }
  return false;
}
