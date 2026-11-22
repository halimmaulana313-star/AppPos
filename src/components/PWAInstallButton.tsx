/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { CheckCircle2, Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'navbar' | 'login' | 'card';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'navbar',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  const handleAction = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowGuideModal(true);
  };

  const guideModal = showGuideModal && (
    <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                Pasang Aplikasi di HP ({isIOS ? 'iOS' : 'Android'})
              </h3>
              <p className="text-[11px] text-slate-500">
                Jalan layar penuh seperti aplikasi native + cetak Bluetooth
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowGuideModal(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3 text-xs text-slate-700 leading-relaxed">
          {isIOS ? (
            <ol className="list-decimal list-inside space-y-2">
              <li>
                Buka aplikasi ini lewat browser <strong>Safari</strong> di iPhone / iPad.
              </li>
              <li>
                Ketuk ikon <strong>Bagikan (Share)</strong> di bar bawah Safari.
              </li>
              <li>
                Pilih <strong>Tambah ke Layar Utama (Add to Home Screen)</strong>, lalu ketuk{' '}
                <strong>Tambah</strong>.
              </li>
            </ol>
          ) : (
            <ol className="list-decimal list-inside space-y-2">
              <li>
                Buka URL aplikasi ini di browser <strong>Google Chrome Android</strong> (bukan di dalam pratinjau editor).
              </li>
              <li>
                Ketuk menu titik tiga (<strong>⋮</strong>) di pojok kanan atas Chrome.
              </li>
              <li>
                Pilih <strong>Instal aplikasi (Install app)</strong> atau{' '}
                <strong>Tambahkan ke layar utama</strong>, lalu tekan <strong>Instal</strong>.
              </li>
              <li>
                Ikon <strong>KasirKu POS</strong> akan muncul di app drawer Android dan langsung mendukung cetak struk Bluetooth ESC/POS.
              </li>
            </ol>
          )}
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={() => setShowGuideModal(false)}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
          >
            Mengerti
          </button>
        </div>
      </div>
    </div>
  );

  // Settings Card variant shows installed status or install action
  if (variant === 'card') {
    return (
      <>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                Aplikasi Android &amp; Mode Standalone (PWA)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                {isInstalled
                  ? 'Aplikasi KasirKu sedang berjalan dalam mode aplikasi terpasang (Standalone).'
                  : 'Pasang KasirKu ke layar utama Android atau tablet kasir agar tampil layar penuh tanpa bar browser dan lebih cepat dibuka.'}
              </p>
            </div>
          </div>

          {isInstalled ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold whitespace-nowrap shrink-0">
              <CheckCircle2 className="w-4 h-4" />
              <span>Sudah Terpasang</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => void handleAction()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{isInstallable ? 'Install Aplikasi Android' : 'Cara Pasang di Android'}</span>
            </button>
          )}
        </div>
        {guideModal}
      </>
    );
  }

  // Hide compact install triggers when already running inside standalone installed mode
  if (isInstalled) {
    return null;
  }

  if (variant === 'login') {
    return (
      <>
        <button
          type="button"
          onClick={() => void handleAction()}
          className="mt-4 w-full py-2.5 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-700/90 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{isInstallable ? 'Install Aplikasi Android' : 'Pasang di HP Android'}</span>
        </button>
        {guideModal}
      </>
    );
  }

  // Navbar compact button
  return (
    <>
      <button
        type="button"
        onClick={() => void handleAction()}
        title="Pasang aplikasi di Android / Tablet"
        className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0"
      >
        <Download className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span className="hidden lg:inline">
          {isInstallable ? 'Install App' : 'App Android'}
        </span>
      </button>
      {guideModal}
    </>
  );
};
