/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bluetooth,
  BluetoothConnected,
  BluetoothOff,
  Building,
  Check,
  CheckCircle2,
  Crown,
  Database,
  Download,
  Image as ImageIcon,
  Info,
  Printer,
  QrCode,
  Receipt,
  RotateCcw,
  Save,
  Sparkles,
  Store,
  Trash2,
  Upload,
  Wifi,
  X,
} from 'lucide-react';
import { PrinterConfig, StoreProfile } from '../types/pos';
import { BluetoothPrinterState } from '../utils/bluetoothThermalPrinter';
import { getLocalDateString } from '../utils/formatters';
import { DEFAULT_STORE_PROFILE, INITIAL_PRODUCTS, getInitialOrders } from '../utils/initialData';
import { PRESET_LOGOS } from '../utils/presetLogos';
import { getStoreQrisImageDataUrl, optimizeQrisImageFile } from '../utils/qrCodeGenerator';
import { sounds } from '../utils/soundEffects';

interface SettingsViewProps {
  store: StoreProfile;
  setStore: React.Dispatch<React.SetStateAction<StoreProfile>>;
  printerConfig: PrinterConfig;
  setPrinterConfig: React.Dispatch<React.SetStateAction<PrinterConfig>>;
  printerState: BluetoothPrinterState;
  onOpenPrinterModal: () => void;
  onResetData: () => void;
  fullDataPayload: {
    store: StoreProfile;
    products: any[];
    orders: any[];
    printerConfig: PrinterConfig;
    users?: any[];
  };
  onImportData: (data: any) => void;
  onOpenLogoManager?: () => void;
  onQuickConnectBluetooth?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  store,
  setStore,
  printerConfig,
  setPrinterConfig,
  printerState,
  onOpenPrinterModal,
  onResetData,
  fullDataPayload,
  onImportData,
  onOpenLogoManager,
  onQuickConnectBluetooth,
}) => {
  const [formData, setFormData] = useState<StoreProfile>({ ...store });
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showPresetPicker, setShowPresetPicker] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [backupFeedback, setBackupFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [previewStoreQrisUrl, setPreviewStoreQrisUrl] = useState<string>('');
  const [qrisSyncNote, setQrisSyncNote] = useState<string | null>(null);

  useEffect(() => {
    setFormData({ ...store });
  }, [store]);

  useEffect(() => {
    let active = true;
    void getStoreQrisImageDataUrl(formData)
      .then((url) => {
        if (active) setPreviewStoreQrisUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [formData.qrisImageUrl, formData.qrisMerchantName, formData.storeName, formData.qrisNmid]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStore(formData);
    setSavedSuccess(true);
    sounds.playItemBeep();
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleExportBackup = () => {
    const jsonStr = JSON.stringify(fullDataPayload, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Backup_KasirKu_${getLocalDateString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupFeedback({
      type: 'success',
      message: 'File cadangan JSON berhasil diunduh ke komputer/HP Anda.',
    });
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && parsed.products && parsed.store) {
          onImportData(parsed);
          sounds.playCashRegister();
          setBackupFeedback({
            type: 'success',
            message: 'Data berhasil dipulihkan secara lengkap dari backup!',
          });
        } else {
          sounds.playError();
          setBackupFeedback({
            type: 'error',
            message: 'Format file backup tidak valid. Gunakan file JSON cadangan dari aplikasi Kasir.',
          });
        }
      } catch (err) {
        sounds.playError();
        setBackupFeedback({
          type: 'error',
          message: 'Gagal membaca file JSON. Pastikan file tidak rusak.',
        });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Pengaturan Toko & Kasir
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Sesuaikan profil toko, informasi struk thermal, pajak, dan pencadangan database.
          </p>
        </div>
      </div>

      {/* Backup Feedback Alert Banner */}
      {backupFeedback && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between shadow-xs animate-in fade-in duration-150 ${
            backupFeedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                backupFeedback.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'
              }`}
            />
            <span>{backupFeedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setBackupFeedback(null)}
            className="text-xs hover:opacity-75 font-semibold cursor-pointer ml-3 px-2 py-0.5 rounded hover:bg-black/5"
          >
            ✕ Tutup
          </button>
        </div>
      )}

      {savedSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>Pengaturan profil toko berhasil diperbarui!</span>
        </div>
      )}

      {/* Bluetooth Thermal Card Shortcut */}
      <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white rounded-2xl p-5 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-700/80 flex items-center justify-center shrink-0">
            {printerState.isConnected ? (
              <BluetoothConnected className="w-6 h-6 text-emerald-300" />
            ) : printerState.isConnecting ? (
              <Bluetooth className="w-6 h-6 animate-pulse text-amber-300" />
            ) : (
              <BluetoothOff className="w-6 h-6 text-emerald-200" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base">Printer Thermal Bluetooth</h3>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase flex items-center gap-1 ${
                  printerState.isConnected
                    ? 'bg-emerald-400 text-emerald-950 font-black'
                    : printerState.isConnecting
                    ? 'bg-amber-300 text-amber-950 font-bold'
                    : 'bg-white/20 text-white'
                }`}
              >
                {printerState.isConnected && (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-900 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-950"></span>
                  </span>
                )}
                {printerState.isConnected
                  ? 'Terhubung'
                  : printerState.isConnecting
                  ? 'Menghubungkan...'
                  : printerConfig.isSimulationMode
                  ? 'Mode Simulasi'
                  : 'Belum Terhubung'}
              </span>
            </div>
            <p className="text-xs text-emerald-100 mt-0.5">
              Lebar: {printerConfig.paperWidth} • {printerState.deviceName || (printerConfig.isSimulationMode ? 'Simulasi Printer Aktif' : 'Belum ada perangkat terhubung')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          {/* Quick Connect Bluetooth button moved here from Navbar */}
          {!printerState.isConnected && onQuickConnectBluetooth && (
            <button
              type="button"
              onClick={onQuickConnectBluetooth}
              disabled={printerState.isConnecting}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-extrabold text-xs sm:text-sm rounded-xl shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <Bluetooth className="w-4 h-4" />
              <span>{printerState.isConnecting ? 'Menghubungkan...' : 'Hubungkan Bluetooth'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenPrinterModal}
            className="flex-1 sm:flex-none px-4 py-2.5 bg-white text-emerald-900 font-bold text-xs sm:text-sm rounded-xl shadow-sm hover:bg-emerald-50 active:scale-[0.98] transition-all cursor-pointer"
          >
            Buka Manajer Printer
          </button>
        </div>
      </div>

      {/* Store Profile Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
          <Store className="w-4 h-4 text-emerald-600" />
          <h3 className="font-bold text-slate-800 text-sm">Informasi Usaha & Struk</h3>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Toko / Usaha *</label>
              <input
                type="text"
                required
                value={formData.storeName}
                onChange={(e) => setFormData({ ...formData, storeName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Slogan / Tagline Usaha</label>
              <input
                type="text"
                value={formData.tagline}
                onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                placeholder="Contoh: Kopi Pilihan & Santapan Nusantara"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Alamat Lengkap</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Jl. Malioboro No. 45, Yogyakarta"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor Telepon / WhatsApp</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="0812-3456-7890"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nama WiFi Toko (SSID)</label>
              <input
                type="text"
                value={formData.wifiName || ''}
                onChange={(e) => setFormData({ ...formData, wifiName: e.target.value })}
                placeholder="KopiNusantara_Guest"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password WiFi</label>
              <input
                type="text"
                value={formData.wifiPassword || ''}
                onChange={(e) => setFormData({ ...formData, wifiPassword: e.target.value })}
                placeholder="kopienakbanget"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Pesan Kaki Struk (Footer Note)
            </label>
            <textarea
              rows={3}
              value={formData.footerNote}
              onChange={(e) => setFormData({ ...formData, footerNote: e.target.value })}
              placeholder="Terima kasih atas kunjungannya! Follow IG kami @tokokopi"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Teks ini akan tercetak otomatis di bagian paling bawah struk thermal.
            </p>
          </div>

          {/* Logo Usaha Toko Management Card */}
          <div className="pt-3 border-t border-slate-100">
            <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-200/80 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-bold text-slate-800 text-xs sm:text-sm">Logo Usaha & Brand Toko</h4>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-300 uppercase">
                        Khusus Owner
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Tampil di bilah atas aplikasi, struk thermal, dan halaman login kasir
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPresetPicker(!showPresetPicker)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{showPresetPicker ? 'Tutup Pilihan Preset' : 'Ganti Logo Usaha'}</span>
                  </button>

                  {formData.logoUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, logoUrl: undefined });
                        sounds.playItemBeep();
                      }}
                      className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 font-semibold p-1.5 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                      title="Hapus logo"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Presets Grid inside Pengaturan Toko */}
              {showPresetPicker && (
                <div className="p-3 bg-white rounded-xl border border-amber-200/90 space-y-3 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-800">
                      Pilih dari Koleksi Preset Logo Siap Pakai:
                    </p>
                    <span className="text-[10px] text-slate-400">8 Preset Vektor Tajam</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {PRESET_LOGOS.map((preset) => {
                      const isSelected = formData.logoUrl === preset.dataUrl;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, logoUrl: preset.dataUrl });
                            sounds.playCashRegister();
                          }}
                          className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center justify-between group cursor-pointer relative ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-500/30 shadow-xs'
                              : 'border-slate-200 hover:border-amber-300 hover:bg-amber-50/30 bg-white'
                          }`}
                        >
                          {isSelected && (
                            <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </span>
                          )}

                          <div className="w-12 h-12 rounded-lg overflow-hidden p-0.5 bg-slate-50 border border-slate-100 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
                            <img
                              src={preset.dataUrl}
                              alt={preset.name}
                              className="w-full h-full object-contain"
                            />
                          </div>

                          <div className="w-full">
                            <p className="text-[11px] font-bold text-slate-800 truncate leading-tight">
                              {preset.name}
                            </p>
                            <span className="text-[9px] text-slate-400 block truncate mt-0.5">
                              {preset.category}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-white border border-amber-200 p-1 flex items-center justify-center shadow-xs shrink-0">
                  {formData.logoUrl ? (
                    <img
                      src={formData.logoUrl}
                      alt="Logo Usaha"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <Store className="w-7 h-7 text-slate-400" />
                  )}
                </div>

                <div className="flex-1">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 text-xs font-bold rounded-lg cursor-pointer transition-colors shadow-2xs">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{formData.logoUrl ? 'Ganti File Logo Sendiri' : 'Unggah File Logo Baru'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            setFormData({ ...formData, logoUrl: ev.target?.result as string });
                            sounds.playCashRegister();
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Format file: PNG, JPG, SVG, WebP (Rekomendasi rasio 1:1 / persegi)
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* QRIS Toko Management Card */}
          <div className="pt-3 border-t border-slate-100">
            <div className="p-4 bg-teal-50/60 rounded-2xl border border-teal-200/80 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center">
                    <QrCode className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-xs sm:text-sm">Gambar / Barcode QRIS Toko</h4>
                    <p className="text-[11px] text-slate-500">
                      Tampil otomatis di layar saat kasir memilih pembayaran QRIS
                    </p>
                  </div>
                </div>

                {formData.qrisImageUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({ ...prev, qrisImageUrl: undefined }));
                      setStore((prev) => ({ ...prev, qrisImageUrl: undefined }));
                      setQrisSyncNote('QRIS kustom dihapus & dikembalikan ke QRIS Toko default.');
                      setTimeout(() => setQrisSyncNote(null), 4000);
                      sounds.playError();
                    }}
                    className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus QRIS</span>
                  </button>
                )}
              </div>

              {qrisSyncNote && (
                <div className="p-2.5 rounded-xl bg-emerald-100/80 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>{qrisSyncNote}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                {/* QRIS Image Preview / Upload Box */}
                <div className="md:col-span-5 flex flex-col items-center">
                  {formData.qrisImageUrl ? (
                    <div className="relative group p-2 bg-white rounded-xl border border-teal-200 shadow-xs w-full max-w-[200px] text-center">
                      <img
                        src={formData.qrisImageUrl}
                        alt="QRIS Toko"
                        className="w-full max-h-44 object-contain rounded-lg"
                      />
                      <label className="mt-2 block w-full text-center py-1.5 px-3 bg-teal-100 hover:bg-teal-200 text-teal-800 text-[11px] font-bold rounded-lg cursor-pointer transition-colors">
                        Ganti Gambar QRIS
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              void optimizeQrisImageFile(file).then((imgUrl) => {
                                setFormData((prev) => ({ ...prev, qrisImageUrl: imgUrl }));
                                setStore((prev) => ({ ...prev, qrisImageUrl: imgUrl }));
                                setQrisSyncNote('QRIS baru owner tersimpan & disinkronkan ke Kasir dan Portal Online.');
                                setTimeout(() => setQrisSyncNote(null), 5000);
                                sounds.playItemBeep();
                              });
                            }
                          }}
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="w-full max-w-[220px] bg-white p-3 rounded-2xl border border-teal-200 shadow-xs text-center space-y-2">
                      {previewStoreQrisUrl && (
                        <img
                          src={previewStoreQrisUrl}
                          alt="QRIS Digital Toko"
                          className="w-36 h-36 object-contain mx-auto rounded-lg border border-slate-100"
                        />
                      )}
                      <span className="inline-block px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 text-[10px] font-bold">
                        QRIS Digital Toko Aktif
                      </span>
                      <label className="w-full border border-dashed border-teal-400 hover:border-teal-600 bg-teal-50/50 hover:bg-teal-50 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors text-xs font-bold text-teal-800">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Unggah Foto QRIS Toko</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              void optimizeQrisImageFile(file).then((imgUrl) => {
                                setFormData((prev) => ({ ...prev, qrisImageUrl: imgUrl }));
                                setStore((prev) => ({ ...prev, qrisImageUrl: imgUrl }));
                                setQrisSyncNote('QRIS owner berhasil diunggah & disinkronkan ke Kasir dan Portal Online.');
                                setTimeout(() => setQrisSyncNote(null), 5000);
                                sounds.playItemBeep();
                              });
                            }
                          }}
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Merchant Name & NMID Fields */}
                <div className="md:col-span-7 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Nama Merchant di QRIS
                    </label>
                    <input
                      type="text"
                      value={formData.qrisMerchantName || ''}
                      onChange={(e) => setFormData({ ...formData, qrisMerchantName: e.target.value })}
                      placeholder={formData.storeName || 'Contoh: WARUNG KOPI NUSANTARA'}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Kode NMID QRIS (Opsional)
                    </label>
                    <input
                      type="text"
                      value={formData.qrisNmid || ''}
                      onChange={(e) => setFormData({ ...formData, qrisNmid: e.target.value })}
                      placeholder="Contoh: ID102003004005"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                    />
                  </div>

                  <p className="text-[11px] text-teal-800 bg-teal-100/60 p-2.5 rounded-xl">
                    💡 Barcode QRIS Toko ini otomatis dipakai secara identik baik di layar Kasir maupun di Portal Pemesanan Online pelanggan.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Tax and Service Charge settings */}
          <div className="pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-bold text-slate-800">Aktifkan Pajak (PPN)</span>
                <input
                  type="checkbox"
                  checked={formData.enableTax}
                  onChange={(e) => setFormData({ ...formData, enableTax: e.target.checked })}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
              </label>
              {formData.enableTax && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-slate-500">Persentase (%):</span>
                  <input
                    type="number"
                    value={formData.taxPercentage}
                    onChange={(e) => setFormData({ ...formData, taxPercentage: Number(e.target.value) })}
                    className="w-20 px-2 py-1 border border-slate-300 rounded-lg text-xs font-bold text-slate-800"
                  />
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-bold text-slate-800">Biaya Layanan (Service)</span>
                <input
                  type="checkbox"
                  checked={formData.enableServiceCharge}
                  onChange={(e) => setFormData({ ...formData, enableServiceCharge: e.target.checked })}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
              </label>
              {formData.enableServiceCharge && (
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-slate-500">Persentase (%):</span>
                  <input
                    type="number"
                    value={formData.serviceChargePercentage}
                    onChange={(e) =>
                      setFormData({ ...formData, serviceChargePercentage: Number(e.target.value) })
                    }
                    className="w-20 px-2 py-1 border border-slate-300 rounded-lg text-xs font-bold text-slate-800"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Configurable Low Stock Threshold */}
          <div className="pt-3 border-t border-slate-100">
            <div className="p-3.5 bg-amber-50/70 rounded-xl border border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-xs sm:text-sm text-slate-800">
                    Batas Peringatan Stok Menipis (Threshold)
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Tampilkan badge peringatan visual di katalog menu, keranjang kasir, dan kelola produk jika sisa stok ≤ nilai ini.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={formData.lowStockThreshold ?? 10}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      lowStockThreshold: Math.max(1, Number(e.target.value)),
                    })
                  }
                  className="w-20 px-2.5 py-1.5 border border-amber-300 bg-white rounded-xl text-xs font-bold text-slate-900 text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <span className="text-xs font-semibold text-slate-600">pcs</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="submit"
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all active:scale-[0.98]"
          >
            <Save className="w-4 h-4" />
            <span>Simpan Perubahan</span>
          </button>
        </div>
      </form>

      {/* Backup and Data Management */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-emerald-600" />
          <h3 className="font-bold text-slate-800 text-sm">Cadangan Data & Reset</h3>
        </div>

        <p className="text-xs text-slate-500">
          Data tersimpan di penyimpanan peramban (browser). Anda dapat mencadangkan seluruh data transaksi dan katalog produk ke file JSON untuk dipindahkan ke perangkat lain.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleExportBackup}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Unduh Cadangan (Backup JSON)</span>
          </button>

          <label className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-colors cursor-pointer">
            <Upload className="w-4 h-4" />
            <span>Pulihkan Data (Import JSON)</span>
            <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
          </label>

          <button
            type="button"
            onClick={() => setIsResetConfirmOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs transition-colors ml-auto cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Reset ke Data Demo Awal</span>
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Data Reset */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">
                Reset Semua Data ke Demo Awal?
              </h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Tindakan ini akan mengembalikan profil toko, daftar menu, riwayat transaksi, dan pengguna ke data demo awal. Sebaiknya unduh cadangan JSON terlebih dahulu.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  onResetData();
                  setIsResetConfirmOpen(false);
                  setBackupFeedback({
                    type: 'success',
                    message: 'Data aplikasi telah dikembalikan ke pengaturan demo awal.',
                  });
                }}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-600/20 transition-all active:scale-95 cursor-pointer"
              >
                Ya, Reset Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
