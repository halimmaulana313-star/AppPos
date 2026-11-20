/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  AlertCircle,
  Coffee,
  ShieldCheck,
} from 'lucide-react';
import { AppUser, StoreProfile } from '../types/pos';
import { useFirebase } from '../contexts/FirebaseContext';
import { syncFirebaseUserProfile } from '../lib/firestoreSync';
import { sounds } from '../utils/soundEffects';

interface LoginPageProps {
  store: StoreProfile;
  authReady: boolean;
  isResolvingProfile: boolean;
  externalError?: string | null;
  onClearExternalError?: () => void;
  onLogin: (user: AppUser) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  store,
  authReady,
  isResolvingProfile,
  externalError,
  onClearExternalError,
  onLogin,
}) => {
  const { signInWithGoogle, signOutFirebase, isAuthenticating } = useFirebase();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const displayedError = errorMessage || externalError;

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    onClearExternalError?.();
    setIsLoading(true);
    try {
      const fbUser = await signInWithGoogle();
      const syncedUser = await syncFirebaseUserProfile(fbUser);
      if (!syncedUser.isActive) {
        await signOutFirebase();
        setErrorMessage(
          'Akun ini sedang dinonaktifkan oleh Master Toko. Hubungi pemilik toko untuk mengaktifkan kembali.'
        );
        sounds.playError();
        return;
      }
      sounds.playCashRegister();
      onLogin(syncedUser);
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      const msg = err instanceof Error ? err.message : String(err);
      if (
        code.includes('popup-closed-by-user') ||
        code.includes('cancelled-popup-request') ||
        msg.includes('popup-closed-by-user') ||
        msg.includes('cancelled-popup-request')
      ) {
        return;
      }
      if (code.includes('popup-blocked') || msg.includes('popup-blocked')) {
        setErrorMessage(
          'Pop-up masuk Google diblokir oleh browser. Izinkan pop-up untuk situs ini lalu coba lagi.'
        );
      } else if (code.includes('network-request-failed') || msg.includes('network-request-failed')) {
        setErrorMessage('Koneksi internet bermasalah. Periksa jaringan Anda dan coba lagi.');
      } else {
        setErrorMessage('Gagal masuk dengan akun Google terverifikasi. Silakan coba lagi.');
      }
      sounds.playError();
    } finally {
      setIsLoading(false);
    }
  };

  const busy = !authReady || isResolvingProfile || isLoading || isAuthenticating;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 px-4 text-slate-100">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Icon / Logo */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-xl shadow-emerald-500/25 flex items-center justify-center text-white mb-4">
          <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center overflow-hidden p-1">
            {store.logoUrl ? (
              <img
                src={store.logoUrl}
                alt={store.storeName}
                className="w-full h-full object-contain"
              />
            ) : (
              <Coffee className="w-8 h-8 text-emerald-400" />
            )}
          </div>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
          {store.storeName}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Sistem POS Kasir & Cetak Struk Thermal Bluetooth
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-800/90 backdrop-blur-xl py-8 px-5 sm:px-8 shadow-2xl rounded-2xl border border-slate-700/80">
          {/* Header text */}
          <div className="mb-6 pb-4 border-b border-slate-700/80 text-center">
            <h2 className="text-lg font-bold text-white flex items-center justify-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Masuk ke Aplikasi
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Otentikasi aman menggunakan akun Google terverifikasi Firebase
            </p>
          </div>

          {/* Error Alert */}
          {displayedError && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{displayedError}</span>
            </div>
          )}

          {/* Google Sign-In Button */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={busy}
            className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-white hover:bg-slate-100 text-slate-900 shadow-lg transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
          >
            {busy ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-300 border-t-emerald-600 rounded-full animate-spin" />
                <span>Memverifikasi Sesi...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.1.74-2.51 1.18-4.22 1.18-3.24 0-5.99-2.19-6.97-5.13H1.04v3.14C3.05 21.18 7.21 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.03 14.04c-.25-.74-.39-1.54-.39-2.36 0-.82.14-1.62.39-2.36V6.18H1.04C.38 7.5 0 8.99 0 10.68s.38 3.18 1.04 4.5l3.99-1.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.79 0 3.41.62 4.68 1.83l3.51-3.51C18.07 1.09 15.3 0 12 0 7.21 0 3.05 2.82 1.04 6.96l3.99 3.14c.98-2.94 3.73-5.35 6.97-5.35Z"
                  />
                </svg>
                <span>Masuk dengan Google</span>
              </>
            )}
          </button>

          <div className="mt-5 p-3.5 rounded-xl bg-slate-900/70 border border-slate-700/70 text-[11px] text-slate-400 leading-relaxed">
            Staf kasir baru dapat langsung masuk menggunakan akun Google masing-masing. Akses akan otomatis terdaftar sebagai <strong className="text-slate-200">Kasir</strong> dan dapat dikelola oleh Master Toko.
          </div>
        </div>

        {/* Footer info */}
        <p className="mt-4 text-center text-xs text-slate-500">
          Dilindungi oleh Firebase Auth & Kontrol Akses Peran (RBAC)
        </p>
      </div>
    </div>
  );
};
