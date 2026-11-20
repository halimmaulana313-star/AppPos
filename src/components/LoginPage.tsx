/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Coffee,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  User as UserIcon,
} from 'lucide-react';
import { StoreProfile } from '../types/pos';
import { useFirebase } from '../contexts/FirebaseContext';
import { sounds } from '../utils/soundEffects';

interface LoginPageProps {
  store: StoreProfile;
  authReady: boolean;
  isResolvingProfile: boolean;
  signedInEmail?: string | null;
  isEmailVerified?: boolean;
  externalError?: string | null;
  onClearExternalError?: () => void;
  onRetrySync?: () => Promise<void> | void;
}

function mapFirebaseAuthError(err: unknown): string | null {
  const code = (err as { code?: string })?.code || '';
  const msg = err instanceof Error ? err.message : String(err);
  const combined = `${code} ${msg}`;

  if (
    combined.includes('popup-closed-by-user') ||
    combined.includes('cancelled-popup-request')
  ) {
    return null;
  }

  if (
    combined.includes('invalid-credential') ||
    combined.includes('wrong-password') ||
    combined.includes('user-not-found')
  ) {
    return 'Email atau password salah, atau akun belum terdaftar. Jika belum terdaftar, buka tab Daftar Akun.';
  }

  if (combined.includes('email-already-in-use')) {
    return 'Email ini sudah terdaftar. Silakan masuk melalui tab Masuk atau gunakan Lupa Password.';
  }

  if (combined.includes('weak-password')) {
    return 'Password terlalu lemah (minimal 6 karakter).';
  }

  if (combined.includes('invalid-email')) {
    return 'Format alamat email tidak valid.';
  }

  if (combined.includes('popup-blocked')) {
    return 'Pop-up login Google diblokir oleh browser. Izinkan pop-up untuk situs ini lalu klik lagi (auth/popup-blocked).';
  }

  if (combined.includes('unauthorized-domain')) {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    return `Domain (${host}) belum diotorisasi di Firebase Authentication -> Authorized Domains (auth/unauthorized-domain).`;
  }

  if (combined.includes('operation-not-allowed')) {
    return 'Metode login ini belum diaktifkan di Firebase Console -> Authentication -> Sign-in method (auth/operation-not-allowed).';
  }

  if (combined.includes('web-storage-unsupported')) {
    return 'Penyimpanan/cookie browser diblokir (mis. mode Incognito atau blokir cookie pihak ketiga). Aktifkan cookie untuk situs ini lalu coba lagi (auth/web-storage-unsupported).';
  }

  if (combined.includes('network-request-failed')) {
    return 'Koneksi internet bermasalah atau akses ke server autentikasi terhambat (auth/network-request-failed).';
  }

  if (combined.includes('account-exists-with-different-credential')) {
    return 'Email ini sudah terdaftar dengan metode login yang berbeda (auth/account-exists-with-different-credential).';
  }

  if (combined.includes('too-many-requests')) {
    return 'Terlalu banyak percobaan masuk. Tunggu beberapa saat lalu coba lagi (auth/too-many-requests).';
  }

  const shortCode = code ? ` (${code})` : '';
  return `Gagal masuk ke akun${shortCode}. Silakan coba lagi.`;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  store,
  authReady,
  isResolvingProfile,
  signedInEmail,
  isEmailVerified = false,
  externalError,
  onClearExternalError,
  onRetrySync,
}) => {
  const {
    signInWithGoogle,
    signInWithEmail,
    registerWithEmail,
    resendVerificationEmail,
    sendPasswordReset,
    signOutFirebase,
    isAuthenticating,
  } = useFirebase();

  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const displayedError = errorMessage || externalError;
  const busy = !authReady || isResolvingProfile || isLoading || isAuthenticating;
  const hasPendingAuthenticatedUser = Boolean(authReady && signedInEmail && !isResolvingProfile);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);
    onClearExternalError?.();

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setErrorMessage('Masukkan alamat email dan password.');
      return;
    }
    if (mode === 'signup' && password.length < 6) {
      setErrorMessage('Password minimal 6 karakter.');
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(trimmedEmail, password);
      } else {
        const created = await registerWithEmail(trimmedEmail, password, displayName);
        if (!created.emailVerified) {
          setInfoMessage(
            `Akun dibuat. Link verifikasi telah dikirim ke ${trimmedEmail}. Buka email Anda lalu klik link verifikasi sebelum melanjutkan.`
          );
        }
      }
      sounds.playCashRegister();
    } catch (err) {
      const friendly = mapFirebaseAuthError(err);
      if (friendly) {
        setErrorMessage(friendly);
        sounds.playError();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    onClearExternalError?.();

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setErrorMessage('Masukkan alamat email terlebih dahulu untuk mengirim link reset password.');
      return;
    }

    setIsLoading(true);
    try {
      await sendPasswordReset(trimmedEmail);
      setInfoMessage(`Link reset password telah dikirim ke ${trimmedEmail}.`);
      sounds.playItemBeep();
    } catch (err) {
      const friendly = mapFirebaseAuthError(err);
      if (friendly) {
        setErrorMessage(friendly);
        sounds.playError();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    onClearExternalError?.();
    setIsLoading(true);
    try {
      await signInWithGoogle();
      sounds.playCashRegister();
    } catch (err) {
      const friendly = mapFirebaseAuthError(err);
      if (friendly) {
        setErrorMessage(friendly);
        sounds.playError();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    onClearExternalError?.();
    setIsLoading(true);
    try {
      await resendVerificationEmail();
      setInfoMessage(
        `Email verifikasi dikirim ulang ke ${signedInEmail}. Periksa Inbox atau folder Spam Anda.`
      );
      sounds.playItemBeep();
    } catch (err) {
      const friendly = mapFirebaseAuthError(err);
      if (friendly) {
        setErrorMessage(friendly);
        sounds.playError();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetryVerificationOrSync = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    onClearExternalError?.();
    setIsLoading(true);
    try {
      await onRetrySync?.();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOutSwitch = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    onClearExternalError?.();
    setIsLoading(true);
    try {
      await signOutFirebase();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 flex flex-col justify-center py-10 sm:px-6 lg:px-8 px-4 text-slate-100">
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

      <div className="mt-7 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-800/90 backdrop-blur-xl py-7 px-5 sm:px-8 shadow-2xl rounded-2xl border border-slate-700/80">
          {/* Header text */}
          <div className="mb-5 pb-4 border-b border-slate-700/80 text-center">
            <h2 className="text-lg font-bold text-white flex items-center justify-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Masuk ke Aplikasi
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Otentikasi aman dengan Email & Password atau Akun Google
            </p>
          </div>

          {/* Info Alert */}
          {infoMessage && (
            <div className="mb-4 p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-700/70 text-emerald-200 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{infoMessage}</span>
            </div>
          )}

          {/* Error Alert */}
          {displayedError && (
            <div className="mb-4 p-3.5 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{displayedError}</span>
            </div>
          )}

          {hasPendingAuthenticatedUser ? (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-700 text-xs text-slate-300 space-y-1">
                <div>
                  Terhubung sebagai{' '}
                  <strong className="text-white font-mono">{signedInEmail}</strong>
                </div>
                {!isEmailVerified && (
                  <p className="text-amber-300 text-[11px] leading-relaxed">
                    Email ini belum terverifikasi. Klik link verifikasi yang dikirim ke inbox email tersebut, lalu klik tombol lanjutkan di bawah.
                  </p>
                )}
              </div>

              {!isEmailVerified && (
                <button
                  type="button"
                  onClick={() => void handleResendVerification()}
                  disabled={busy}
                  className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs bg-slate-700 hover:bg-slate-600 text-white transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <MailCheck className="w-4 h-4 text-emerald-400" />
                  <span>Kirim Ulang Email Verifikasi</span>
                </button>
              )}

              {onRetrySync && (
                <button
                  type="button"
                  onClick={() => void handleRetryVerificationOrSync()}
                  disabled={busy}
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
                  <span>
                    {!isEmailVerified
                      ? 'Saya Sudah Verifikasi, Masuk Sekarang'
                      : 'Coba Verifikasi Ulang'}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => void handleSignOutSwitch()}
                disabled={busy}
                className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs bg-white hover:bg-slate-100 text-slate-900 transition-all cursor-pointer disabled:opacity-60"
              >
                Ganti Akun Lain
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Sign-in / Sign-up Mode Toggle */}
              <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-900/80 border border-slate-700/80 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setErrorMessage(null);
                    setInfoMessage(null);
                  }}
                  className={`py-2 rounded-lg transition-colors cursor-pointer ${
                    mode === 'signin'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Masuk Email
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setErrorMessage(null);
                    setInfoMessage(null);
                  }}
                  className={`py-2 rounded-lg transition-colors cursor-pointer ${
                    mode === 'signup'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Daftar Akun
                </button>
              </div>

              <form onSubmit={(e) => void handleEmailSubmit(e)} className="space-y-3.5">
                {mode === 'signup' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Nama Tampilan (Opsional)
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                      <input
                        type="text"
                        value={displayName}
                        maxLength={100}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Owner Kopi Literasi"
                        className="w-full pl-10 pr-3.5 py-2.5 bg-slate-900/70 border border-slate-700 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="email"
                      value={email}
                      maxLength={200}
                      autoComplete="email"
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nama@email.com"
                      required
                      className="w-full pl-10 pr-3.5 py-2.5 bg-slate-900/70 border border-slate-700 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-300">
                      Password
                    </label>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => void handleForgotPassword()}
                        disabled={busy}
                        className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer disabled:opacity-50"
                      >
                        Lupa password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      maxLength={128}
                      autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full pl-10 pr-10 py-2.5 bg-slate-900/70 border border-slate-700 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                      aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                >
                  {busy ? (
                    <>
                      <div className="w-4 h-4 border-2 border-emerald-200 border-t-white rounded-full animate-spin" />
                      <span>
                        {!authReady
                          ? 'Menyiapkan Sesi...'
                          : isResolvingProfile
                            ? 'Memverifikasi Profil...'
                            : 'Memproses...'}
                      </span>
                    </>
                  ) : (
                    <span>{mode === 'signin' ? 'Masuk dengan Email' : 'Daftar Akun Email'}</span>
                  )}
                </button>
              </form>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-700/80" />
                </div>
                <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
                  <span className="bg-slate-800 px-3 text-slate-400 font-semibold">atau</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleGoogleSignIn()}
                disabled={busy}
                className="w-full py-2.5 px-4 rounded-xl font-bold text-sm bg-white hover:bg-slate-100 text-slate-900 shadow-lg transition-all flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
              >
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
              </button>
            </div>
          )}

          <div className="mt-5 p-3.5 rounded-xl bg-slate-900/70 border border-slate-700/70 text-[11px] text-slate-400 leading-relaxed">
            Staf kasir baru dapat masuk menggunakan email terverifikasi atau akun Google masing-masing sebagai <strong className="text-slate-200">Kasir</strong>. Email Master toko akan otomatis dikenali setelah email terverifikasi.
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
