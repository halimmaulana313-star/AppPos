/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import QRCode from 'qrcode';

export interface GenerateQROptions {
  width?: number;
  margin?: number;
  color?: {
    dark?: string;
    light?: string;
  };
}

/**
 * Generate Base64 Data URL for QR Code
 */
export async function generateQRCodeDataUrl(
  text: string,
  options: GenerateQROptions = {}
): Promise<string> {
  const defaultOpts = {
    width: options.width || 320,
    margin: options.margin !== undefined ? options.margin : 2,
    color: {
      dark: options.color?.dark || '#0f172a',
      light: options.color?.light || '#ffffff',
    },
    errorCorrectionLevel: 'H' as const,
  };

  try {
    return await QRCode.toDataURL(text, defaultOpts);
  } catch (err) {
    console.error('Failed to generate QR Code:', err);
    throw err;
  }
}

/**
 * Build customer ordering URL for a specific table or takeaway
 */
export function buildCustomerOrderUrl(tableNumber?: string): string {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  const pathname = window.location.pathname;
  const params = new URLSearchParams();
  params.set('mode', 'order');
  if (tableNumber) {
    params.set('table', tableNumber);
  }
  return `${origin}${pathname}?${params.toString()}`;
}

/**
 * Compute CRC16-CCITT (0xFFFF) checksum for EMVCo QRIS payloads
 */
function crc16Ccitt(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function tlv(tag: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${tag}${len}${value}`;
}

/**
 * Build an EMVCo QRIS payload with merchant info and optional nominal amount
 */
export function buildQrisPayload(params: {
  merchantName: string;
  nmid?: string;
  amount: number;
  orderCode?: string;
}): string {
  const cleanName = (params.merchantName || 'TOKO KASIRKU').slice(0, 25).toUpperCase();
  const cleanNmid = (params.nmid || 'ID102003004005').replace(/\s+/g, '').slice(0, 20);
  const amountStr = Math.max(0, Math.round(params.amount)).toString();

  const mai = tlv('00', 'ID.CO.QRIS.WWW') + tlv('01', cleanNmid) + tlv('03', 'UMI');
  const additionalData = params.orderCode ? tlv('62', tlv('01', params.orderCode.slice(0, 20))) : '';

  const body =
    tlv('00', '01') +
    tlv('01', amountStr !== '0' ? '12' : '11') +
    tlv('26', mai) +
    tlv('52', '5812') +
    tlv('53', '360') +
    (amountStr !== '0' ? tlv('54', amountStr) : '') +
    tlv('58', 'ID') +
    tlv('59', cleanName) +
    tlv('60', 'INDONESIA') +
    additionalData +
    '6304';

  return body + crc16Ccitt(body);
}

/**
 * Resolve the store's exact QRIS barcode image URL so Cashier POS, Store Settings,
 * and Customer Online Portal always display the identical QRIS Toko barcode.
 */
export async function getStoreQrisImageDataUrl(store: {
  qrisImageUrl?: string;
  qrisMerchantName?: string;
  storeName: string;
  qrisNmid?: string;
}): Promise<string> {
  if (store.qrisImageUrl) {
    return store.qrisImageUrl;
  }
  const payload = buildQrisPayload({
    merchantName: store.qrisMerchantName || store.storeName,
    nmid: store.qrisNmid || 'ID102003004005',
    amount: 0,
  });
  return generateQRCodeDataUrl(payload, { width: 360, margin: 2 });
}

/**
 * Download QR Code as PNG file
 */
export function downloadQRImage(dataUrl: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
