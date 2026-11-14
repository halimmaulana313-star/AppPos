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
