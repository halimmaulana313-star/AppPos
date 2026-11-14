/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PaperWidth } from '../types/pos';

export function formatRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('id-ID').format(value);
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

/**
 * Returns character capacity per line for thermal printers.
 * 58mm is typically 32 characters (Font A).
 * 80mm is typically 48 characters (Font A).
 */
export function getLineCharLimit(paperWidth: PaperWidth): number {
  return paperWidth === '80mm' ? 48 : 32;
}

/**
 * Creates a two-column aligned line, e.g.:
 * "1x Es Kopi Susu          22.000"
 */
export function justifyLine(left: string, right: string, maxLen: number): string {
  const leftTrimmed = left.trim();
  const rightTrimmed = right.trim();
  
  if (leftTrimmed.length + rightTrimmed.length + 1 > maxLen) {
    // If left is too long, truncate left or wrap
    const allowedLeft = Math.max(4, maxLen - rightTrimmed.length - 1);
    const safeLeft = leftTrimmed.substring(0, allowedLeft);
    const spaces = Math.max(1, maxLen - safeLeft.length - rightTrimmed.length);
    return safeLeft + ' '.repeat(spaces) + rightTrimmed;
  }
  
  const spaces = Math.max(1, maxLen - leftTrimmed.length - rightTrimmed.length);
  return leftTrimmed + ' '.repeat(spaces) + rightTrimmed;
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
