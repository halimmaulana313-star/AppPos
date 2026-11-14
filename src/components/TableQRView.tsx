/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Layers,
  LayoutGrid,
  Printer,
  QrCode,
  Sparkles,
  Store,
  Table as TableIcon,
} from 'lucide-react';
import { StoreProfile } from '../types/pos';
import { buildCustomerOrderUrl, downloadQRImage, generateQRCodeDataUrl } from '../utils/qrCodeGenerator';
import { sounds } from '../utils/soundEffects';

interface TableQRViewProps {
  store: StoreProfile;
  onOpenCustomerView: (tableNumber?: string) => void;
}

export const TableQRView: React.FC<TableQRViewProps> = ({ store, onOpenCustomerView }) => {
  const [selectedTable, setSelectedTable] = useState<string>('01');
  const [isTakeaway, setIsTakeaway] = useState<boolean>(false);
  const [customTableInput, setCustomTableInput] = useState<string>('');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const activeTableLabel = isTakeaway ? 'Bawa Pulang / Takeaway' : selectedTable;
  const orderUrl = buildCustomerOrderUrl(isTakeaway ? undefined : selectedTable);

  useEffect(() => {
    generateQRCodeDataUrl(orderUrl, { width: 400, margin: 2 })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error(err));
  }, [orderUrl]);

  const handleCopyLink = () => {
    sounds.playItemBeep();
    navigator.clipboard.writeText(orderUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    sounds.playItemBeep();
    if (qrDataUrl) {
      downloadQRImage(qrDataUrl, `QR_Meja_${isTakeaway ? 'Takeaway' : selectedTable}_${store.storeName.replace(/\s+/g, '_')}`);
    }
  };

  const handlePrint = () => {
    sounds.playItemBeep();
    window.print();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* View Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <QrCode className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-black text-slate-900">Barcode & QR Code Pemesanan Meja</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Cetak atau bagikan QR Code agar pelanggan dapat scan barcode menu langsung dari meja mereka.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenCustomerView(isTakeaway ? undefined : selectedTable)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Uji Coba Tampilan Pelanggan</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Table Selector & Controls */}
        <div className="lg:col-span-5 space-y-5">
          {/* Table Presets */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-4">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
              1. Pilih Nomor Meja / Mode
            </span>

            {/* Takeaway / Dine In Selector */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  sounds.playItemBeep();
                  setIsTakeaway(false);
                }}
                className={`py-2 px-3 rounded-xl border font-bold transition-all cursor-pointer ${
                  !isTakeaway
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-500 ring-2 ring-emerald-500/20'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Makan di Tempat (Meja)
              </button>
              <button
                type="button"
                onClick={() => {
                  sounds.playItemBeep();
                  setIsTakeaway(true);
                }}
                className={`py-2 px-3 rounded-xl border font-bold transition-all cursor-pointer ${
                  isTakeaway
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-500 ring-2 ring-emerald-500/20'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Pesan Bawa Pulang (Takeaway)
              </button>
            </div>

            {!isTakeaway && (
              <>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-2">
                    Daftar Meja Tersedia:
                  </label>
                  <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
                    {Array.from({ length: 15 }, (_, i) => String(i + 1).padStart(2, '0')).map((tbl) => (
                      <button
                        key={tbl}
                        type="button"
                        onClick={() => {
                          sounds.playItemBeep();
                          setSelectedTable(tbl);
                        }}
                        className={`py-2 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                          selectedTable === tbl
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-md scale-105'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {tbl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Table Input */}
                <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
                  <input
                    type="text"
                    value={customTableInput}
                    onChange={(e) => setCustomTableInput(e.target.value)}
                    placeholder="Input nama meja khusus (e.g. VIP 01, L1)..."
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customTableInput.trim()) {
                        setSelectedTable(customTableInput.trim());
                        setCustomTableInput('');
                      }
                    }}
                    className="px-3 py-2 bg-slate-800 text-white font-bold rounded-xl text-xs hover:bg-slate-900 cursor-pointer"
                  >
                    Terapkan
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-3">
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
              2. Bagikan & Unduh
            </span>

            {/* Copy Link Input */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500">Tautan Pemesanan Langsung:</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={orderUrl}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-600 truncate focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Tersalin' : 'Salin'}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                <span>Unduh PNG</span>
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors shadow-md shadow-emerald-600/20 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Kartu Meja</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Printable Table Tent Card Preview */}
        <div className="lg:col-span-7 flex flex-col items-center">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
            Pratinjau Kartu Meja (Siap Dicetak / Dilaminasi)
          </div>

          {/* Table Tent Card Container */}
          <div
            id="printable-tent-card"
            className="w-full max-w-sm bg-white rounded-3xl p-6 sm:p-7 border-2 border-slate-300 shadow-2xl text-center space-y-4 relative overflow-hidden"
          >
            {/* Top Store Badge */}
            <div className="flex flex-col items-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md p-1 overflow-hidden">
                {store.logoUrl ? (
                  <img src={store.logoUrl} alt={store.storeName} className="w-full h-full object-contain" />
                ) : (
                  <Store className="w-8 h-8" />
                )}
              </div>
              <div>
                <h3 className="font-black text-xl text-slate-900 tracking-tight">{store.storeName}</h3>
                <p className="text-xs text-slate-500 font-medium">
                  {store.tagline || 'Pesan Menu Tanpa Antre'}
                </p>
              </div>
            </div>

            {/* Instruction Banner */}
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 py-2 px-4 rounded-xl text-xs font-extrabold uppercase tracking-wider">
              📱 SCAN UNTUK PESAN DARI HP
            </div>

            {/* Big High-Res QR Code */}
            {qrDataUrl && (
              <div className="p-3 bg-white rounded-2xl border-2 border-slate-900 shadow-inner inline-block">
                <img src={qrDataUrl} alt="QR Code Meja" className="w-56 h-56 object-contain mx-auto" />
              </div>
            )}

            {/* Table Number Identifier */}
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 block">
                LOKASI ANDA
              </span>
              <div className="inline-block px-6 py-2 bg-slate-950 text-white rounded-2xl font-black text-2xl font-mono tracking-wider shadow-md">
                {isTakeaway ? 'TAKEAWAY' : `MEJA ${selectedTable}`}
              </div>
            </div>

            {/* How to use */}
            <div className="border-t border-slate-200 pt-3 text-[11px] text-slate-500 space-y-1">
              <p className="font-semibold text-slate-700">Langkah Pemesanan:</p>
              <p>1. Buka kamera HP & arahkan ke kode QR</p>
              <p>2. Pilih menu favorit & masukkan nama Anda</p>
              <p>3. Pesanan langsung masuk ke dapur & kasir!</p>
            </div>

            {/* WiFi note if configured */}
            {store.wifiName && (
              <div className="pt-1 text-[10px] text-slate-400 font-mono">
                WiFi: <strong className="text-slate-700">{store.wifiName}</strong> | Pass:{' '}
                <strong className="text-slate-700">{store.wifiPassword || '-'}</strong>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
