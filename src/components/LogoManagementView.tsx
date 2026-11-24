/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Crown,
  Eye,
  Image as ImageIcon,
  Lock,
  Receipt,
  RotateCcw,
  Sparkles,
  Store,
  Trash2,
  Upload,
} from 'lucide-react';
import { StoreProfile } from '../types/pos';
import { PRESET_LOGOS, PresetLogo } from '../utils/presetLogos';
import { optimizeLogoImageFile } from '../utils/qrCodeGenerator';
import { sounds } from '../utils/soundEffects';

interface LogoManagementViewProps {
  store: StoreProfile;
  setStore: React.Dispatch<React.SetStateAction<StoreProfile>>;
  isMaster: boolean;
  onNavigateToTab?: (tab: 'pos' | 'settings') => void;
}

export const LogoManagementView: React.FC<LogoManagementViewProps> = ({
  store,
  setStore,
  isMaster,
  onNavigateToTab,
}) => {
  const [previewLogo, setPreviewLogo] = useState<string | undefined>(store.logoUrl);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<'upload' | 'presets'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // If not master / owner, show access denied security card
  if (!isMaster) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4 shadow-md">
          <Lock className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-extrabold text-slate-800">Akses Dibatasi</h2>
        <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
          Fitur penggantian logo usaha hanya tersedia dan dapat diubah oleh akun <strong>Owner / Administrator</strong>. Akun kasir hanya memiliki izin untuk transaksi penjualan.
        </p>
        {onNavigateToTab && (
          <button
            onClick={() => onNavigateToTab('pos')}
            className="mt-6 px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-700 transition-all shadow-md cursor-pointer"
          >
            Kembali ke Kasir POS
          </button>
        )}
      </div>
    );
  }

  const handleProcessFile = (file: File) => {
    setErrorMessage(null);
    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
    if (!allowedTypes.has(file.type.toLowerCase())) {
      setErrorMessage('Format file tidak didukung. Gunakan gambar PNG, JPG, atau WebP.');
      sounds.playError();
      return;
    }

    // Limit to 40MB before canvas optimization
    if (file.size > 40 * 1024 * 1024) {
      setErrorMessage('Ukuran gambar terlalu besar. Maksimal 40MB.');
      sounds.playError();
      return;
    }

    void optimizeLogoImageFile(file)
      .then((dataUrl) => {
        setPreviewLogo(dataUrl);
        setStore((prev) => ({ ...prev, logoUrl: dataUrl }));
        setSaveSuccess(true);
        sounds.playCashRegister();
        setTimeout(() => setSaveSuccess(false), 3000);
      })
      .catch(() => {
        setErrorMessage('Gagal membaca file logo. Pastikan file gambar tidak rusak.');
        sounds.playError();
      });
  };

  const handleSelectPreset = (preset: PresetLogo) => {
    setPreviewLogo(preset.dataUrl);
    setStore((prev) => ({ ...prev, logoUrl: preset.dataUrl }));
    setSaveSuccess(true);
    sounds.playCashRegister();
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleRemoveLogo = () => {
    setPreviewLogo(undefined);
    setStore((prev) => ({ ...prev, logoUrl: undefined }));
    setSaveSuccess(true);
    sounds.playItemBeep();
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Header Banner */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              Ganti Logo Usaha
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
              <Crown className="w-3.5 h-3.5 text-amber-600" />
              <span>Khusus Akun Owner</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Ubah logo brand untuk mempercantik bilah atas aplikasi, struk belanja, dan halaman login kasir.
          </p>
        </div>

        {previewLogo && (
          <button
            type="button"
            onClick={handleRemoveLogo}
            className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 text-xs font-bold transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset ke Logo Standar</span>
          </button>
        )}
      </div>

      {/* Success Notification Alert */}
      {saveSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-semibold flex items-center gap-2.5 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>Logo usaha berhasil diperbarui dan diterapkan ke seluruh sistem!</span>
        </div>
      )}

      {/* Main Grid: Upload & Presets (Left) + Live Preview Mockups (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (Upload / Preset Selector) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Tabs: Upload vs Preset Logos */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="flex border-b border-slate-200 bg-slate-50/70 p-1.5 gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'upload'
                    ? 'bg-white text-emerald-700 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span>Unggah Logo Sendiri</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('presets')}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'presets'
                    ? 'bg-white text-emerald-700 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Pilih dari Preset Logo</span>
              </button>
            </div>

            <div className="p-5">
              {activeTab === 'upload' ? (
                /* Upload Card */
                <div className="space-y-4">
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) handleProcessFile(file);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center ${
                      isDragging
                        ? 'border-emerald-500 bg-emerald-50/60 scale-[0.99]'
                        : 'border-slate-300 hover:border-emerald-400 bg-slate-50/50 hover:bg-slate-50'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) handleProcessFile(file);
                      }}
                    />

                    <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3 shadow-inner">
                      <ImageIcon className="w-8 h-8" />
                    </div>

                    <p className="text-sm font-bold text-slate-800">
                      Klik untuk memilih logo atau seret gambar ke sini
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Mendukung format PNG, JPG, WebP (Rekomendasi: rasio 1:1 / persegi, maks. 40MB)
                    </p>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                    >
                      Pilih File dari Komputer / HP
                    </button>
                  </div>

                  {errorMessage && (
                    <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center justify-between">
                      <span>{errorMessage}</span>
                      <button
                        type="button"
                        onClick={() => setErrorMessage(null)}
                        className="text-xs hover:text-rose-900 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {previewLogo && (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 p-1 flex items-center justify-center shadow-xs">
                          <img
                            src={previewLogo}
                            alt="Logo Aktif"
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800">Logo Sedang Digunakan</p>
                          <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            Aktif di bilah atas & nota
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleRemoveLogo}
                        className="text-xs text-rose-600 hover:text-rose-800 font-bold p-2 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Hapus logo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Presets Grid */
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    Pilih salah satu logo siap pakai di bawah ini. Cukup 1 kali klik untuk langsung menerapkannya:
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {PRESET_LOGOS.map((preset) => {
                      const isSelected = previewLogo === preset.dataUrl;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => handleSelectPreset(preset)}
                          className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center justify-between group cursor-pointer relative ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/30 shadow-xs'
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 bg-white'
                          }`}
                        >
                          {isSelected && (
                            <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                              <Check className="w-3 h-3 stroke-[3]" />
                            </span>
                          )}

                          <div className="w-14 h-14 rounded-xl overflow-hidden p-1 bg-slate-50 border border-slate-100 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                            <img
                              src={preset.dataUrl}
                              alt={preset.name}
                              className="w-full h-full object-contain"
                            />
                          </div>

                          <div className="w-full">
                            <p className="text-xs font-bold text-slate-800 truncate leading-tight">
                              {preset.name}
                            </p>
                            <span className="text-[10px] text-slate-400 block truncate mt-0.5">
                              {preset.category}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column (Live Mockup Previews) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <Eye className="w-4 h-4 text-emerald-600" />
              <h3 className="font-extrabold text-sm text-slate-800">
                Pratinjau Langsung Logo (Live Preview)
              </h3>
            </div>

            {/* Preview 1: Navbar Top Header */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                1. Tampilan Pada Bilah Atas (Navbar)
              </span>
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
                  {previewLogo ? (
                    <img
                      src={previewLogo}
                      alt="Logo Toko"
                      className="w-full h-full object-contain p-1"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white">
                      <Store className="w-5 h-5" />
                    </div>
                  )}
                </div>
                <div className="truncate">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-slate-900 text-sm truncate">
                      {store.storeName}
                    </span>
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                      POS
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">
                    {store.tagline || 'Sistem Kasir & Struk'}
                  </p>
                </div>
              </div>
            </div>

            {/* Preview 2: Struk Thermal Preview */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Receipt className="w-3.5 h-3.5" />
                <span>2. Tampilan Pada Struk Pembayaran</span>
              </span>
              <div className="p-4 bg-slate-50 border border-dashed border-slate-300 rounded-xl font-mono text-center space-y-1.5 text-xs text-slate-700">
                <div className="w-12 h-12 mx-auto rounded-lg bg-white border border-slate-300 p-1 flex items-center justify-center shadow-2xs grayscale">
                  {previewLogo ? (
                    <img
                      src={previewLogo}
                      alt="Logo Struk"
                      className="w-full h-full object-contain filter contrast-125"
                    />
                  ) : (
                    <Store className="w-6 h-6 text-slate-600" />
                  )}
                </div>
                <p className="font-extrabold text-slate-900 tracking-wide">{store.storeName}</p>
                <p className="text-[10px] text-slate-500">{store.address}</p>
                <p className="text-[10px] text-slate-400">Telp: {store.phone}</p>
                <div className="border-b border-dashed border-slate-300 my-2"></div>
                <p className="text-[10px] text-emerald-700 font-bold">#ORD-20261104-001</p>
              </div>
            </div>

            {/* Preview 3: Login Screen Avatar */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                3. Tampilan Pada Halaman Login
              </span>
              <div className="p-4 bg-gradient-to-br from-slate-900 to-emerald-950 rounded-xl text-center text-white space-y-2">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-white p-1.5 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  {previewLogo ? (
                    <img
                      src={previewLogo}
                      alt="Logo Login"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <Store className="w-7 h-7 text-emerald-600" />
                  )}
                </div>
                <p className="font-extrabold text-xs text-white tracking-wide">{store.storeName}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
