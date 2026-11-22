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

import { sanitizeFilename, sanitizeSafeImageUrl } from './sanitize';

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);
const MAX_IMAGE_FILE_BYTES = 3 * 1024 * 1024;

function validateUploadedRasterFile(file: File): void {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type.toLowerCase())) {
    throw new Error('Format file harus PNG, JPG, atau WebP.');
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_FILE_BYTES) {
    throw new Error('Ukuran gambar tidak valid atau melebihi batas 3MB.');
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result === 'string') resolve(result);
      else reject(new Error('Gagal membaca file gambar.'));
    };
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Resolve the store's exact QRIS barcode image URL for Cashier POS and Store Settings.
 */
export async function getStoreQrisImageDataUrl(store: {
  qrisImageUrl?: string;
  qrisMerchantName?: string;
  storeName: string;
  qrisNmid?: string;
}): Promise<string> {
  const safeCustomQris = sanitizeSafeImageUrl(store.qrisImageUrl, {
    allowPresetSvg: false,
    maxLength: 350_000,
  });
  if (safeCustomQris) {
    return safeCustomQris;
  }
  const payload = buildQrisPayload({
    merchantName: store.qrisMerchantName || store.storeName,
    nmid: store.qrisNmid || 'ID102003004005',
    amount: 0,
  });
  return generateQRCodeDataUrl(payload, { width: 360, margin: 2 });
}

/**
 * Validate & re-encode an uploaded QRIS image through HTML5 canvas so EXIF/polyglots are stripped
 * and size fits reliably within Firestore & localStorage limits.
 */
export async function optimizeQrisImageFile(
  file: File,
  maxDimension: number = 900
): Promise<string> {
  validateUploadedRasterFile(file);
  const rawDataUrl = await readFileAsDataUrl(file);

  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        if (!img.width || !img.height) {
          reject(new Error('File gambar QRIS rusak atau berdimensi 0.'));
          return;
        }
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas browser tidak tersedia untuk memproses gambar.'));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);

        const pngUrl = canvas.toDataURL('image/png');
        if (pngUrl.length <= 340_000) {
          resolve(pngUrl);
          return;
        }
        const jpgUrl = canvas.toDataURL('image/jpeg', 0.88);
        if (jpgUrl.length <= 340_000) {
          resolve(jpgUrl);
          return;
        }
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      } catch {
        reject(new Error('Gagal memproses gambar QRIS.'));
      }
    };
    img.onerror = () => reject(new Error('File bukan gambar PNG/JPG/WebP yang valid.'));
    img.src = rawDataUrl;
  });
}

/**
 * Validate & re-encode an uploaded store logo image through canvas (stripping EXIF/scripts).
 */
export async function optimizeLogoImageFile(
  file: File,
  maxDimension: number = 512
): Promise<string> {
  validateUploadedRasterFile(file);
  const rawDataUrl = await readFileAsDataUrl(file);

  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        if (!img.width || !img.height) {
          reject(new Error('File logo rusak atau berdimensi 0.'));
          return;
        }
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas browser tidak tersedia untuk memproses logo.'));
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const pngUrl = canvas.toDataURL('image/png');
        if (pngUrl.length <= 340_000) {
          resolve(pngUrl);
          return;
        }
        const webpUrl = canvas.toDataURL('image/webp', 0.85);
        if (webpUrl.startsWith('data:image/webp') && webpUrl.length <= 340_000) {
          resolve(webpUrl);
          return;
        }
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch {
        reject(new Error('Gagal memproses gambar logo.'));
      }
    };
    img.onerror = () => reject(new Error('File bukan gambar PNG/JPG/WebP yang valid.'));
    img.src = rawDataUrl;
  });
}

/**
 * Validate, resize, and compress a local product photo through HTML5 canvas
 * so EXIF/scripts are stripped and the output data URL always fits within
 * Firestore's 300,000-char product image limit.
 */
export async function optimizeProductImageFile(
  file: File,
  maxDimension: number = 640
): Promise<string> {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type.toLowerCase())) {
    throw new Error('Format file harus PNG, JPG, atau WebP.');
  }
  const maxUploadBytes = 5 * 1024 * 1024;
  if (file.size <= 0 || file.size > maxUploadBytes) {
    throw new Error('Ukuran gambar tidak valid atau melebihi batas 5MB.');
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const maxDataUrlLen = 285_000;

  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        if (!img.width || !img.height) {
          reject(new Error('File gambar rusak atau berdimensi 0.'));
          return;
        }

        const renderCandidate = (dim: number, mime: 'image/webp' | 'image/jpeg', quality: number) => {
          const scale = Math.min(1, dim / Math.max(img.width, img.height));
          const targetW = Math.max(1, Math.round(img.width * scale));
          const targetH = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;
          if (mime === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, targetW, targetH);
          }
          ctx.drawImage(img, 0, 0, targetW, targetH);
          return canvas.toDataURL(mime, quality);
        };

        const attempts: Array<{ dim: number; mime: 'image/webp' | 'image/jpeg'; q: number }> = [
          { dim: maxDimension, mime: 'image/webp', q: 0.85 },
          { dim: maxDimension, mime: 'image/webp', q: 0.72 },
          { dim: maxDimension, mime: 'image/jpeg', q: 0.82 },
          { dim: maxDimension, mime: 'image/jpeg', q: 0.68 },
          { dim: 480, mime: 'image/jpeg', q: 0.68 },
          { dim: 360, mime: 'image/jpeg', q: 0.6 },
        ];

        for (const attempt of attempts) {
          const url = renderCandidate(attempt.dim, attempt.mime, attempt.q);
          if (url && url.startsWith(`data:${attempt.mime}`) && url.length <= maxDataUrlLen) {
            resolve(url);
            return;
          }
        }

        reject(new Error('Ukuran gambar setelah kompresi masih terlalu besar. Pilih foto lain.'));
      } catch {
        reject(new Error('Gagal memproses foto produk.'));
      }
    };
    img.onerror = () => reject(new Error('File bukan gambar PNG/JPG/WebP yang valid.'));
    img.src = rawDataUrl;
  });
}

/**
 * Download QR Code as PNG file
 */
export function downloadQRImage(dataUrl: string, fileName: string): void {
  const safeSrc = sanitizeSafeImageUrl(dataUrl, { allowPresetSvg: false });
  if (!safeSrc) return;
  const safeName = sanitizeFilename(fileName.replace(/\.png$/i, ''), 'QR_Code');
  const link = document.createElement('a');
  link.href = safeSrc;
  link.download = `${safeName}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
