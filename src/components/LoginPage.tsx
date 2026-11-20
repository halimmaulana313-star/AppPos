/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Coffee,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MailCheck,
  RefreshCw,
} from 'lucide-react';
import { StoreProfile } from '../types/pos';
import { useFirebase } from '../contexts/FirebaseContext';
import { sounds } from '../utils/soundEffects';

const LAST_EMAIL_STORAGE_KEY = 'kasirku_last_email_v1';

interface LoginPageProps {
  store: StoreProfile;
  authReady: boolean;
  isResolvingProfile: boolean;
  signedInEmail?: string | null;
  isEmailVerified?: boolean;
  externalError?: string | null;
  onClearExternalError?: () => void;
  onRetrySync?: () => Promise<boolean> | boolean;
}

function mapFirebaseAuthError(err: unknown): { message: string | null; suggestSignup?: boolean } {
  const code = (err as { code?: string })?.code || '';
  const msg = err instanceof Error ? err.message : String(err);
  const combined = `${code} ${msg}`;

  if (
    combined.includes('popup-closed-by-user') ||
    combined.includes('cancelled-popup-request')
  ) {
    return { message: null };
  }

  if (
    combined.includes('invalid-credential') ||
    combined.includes('wrong-password') ||
    combined.includes('user-not-found')
  ) {
    return {
      message: 'Email atau password salah, atau akun belum didaftarkan.',
      suggestSignup: true,
    };
  }

  if (combined.includes('email-already-in-use')) {
    return {
      message: 'Email ini sudah terdaftar. Silakan langsung klik Masuk.',
    };
  }

  if (combined.includes('weak-password')) {
    return { message: 'Password terlalu pendek (minimal 6 karakter).' };
  }

  if (combined.includes('invalid-email')) {
    return { message: 'Format alamat email tidak valid.' };
  }

  if (combined.includes('popup-blocked')) {
    return {
      message:
        'Pop-up login Google diblokir browser. Izinkan pop-up untuk situs ini lalu klik coba lagi.',
    };
  }

  if (combined.includes('unauthorized-domain')) {
    const host = typeof window !== 'undefined' ? window.location.hostname : '';
    return {
      message: `Domain (${host}) belum ditambahkan di Firebase Console → Authentication → Settings → Authorized domains.`,
    };
  }

  if (combined.includes('operation-not-allowed')) {
    return {
      message:
        'Login Email/Password belum diaktifkan di Firebase Console → Sign-in method. Gunakan tombol Google di atas untuk masuk lebih cepat.',
    };
  }

  if (combined.includes('web-storage-unsupported')) {
    return {
      message:
        'Cookie browser diblokir (mis. mode Incognito). Aktifkan cookie untuk situs ini lalu coba lagi.',
    };
  }

  if (combined.includes('network-request-failed')) {
    return {
      message: 'Koneksi internet bermasalah. Periksa jaringan Anda lalu coba lagi.',
    };
  }

  if (combined.includes('account-exists-with-different-credential')) {
    return {
      message: 'Email ini sudah terdaftar dengan metode login lain. Gunakan tombol Google di atas.',
    };
  }

  if (combined.includes('too-many-requests')) {
    return {
      message: 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.',
    };
  }

  const shortCode = code ? ` (${code})` : '';
  return { message: `Gagal masuk${shortCode}. Silakan coba lagi.` };
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

  const [showEmailForm, setShowEmailForm] = useState<boolean>(() => {
    try {
      return Boolean(localStorage.getItem(LAST_EMAIL_STORAGE_KEY));
    } catch {
      return false;
    }
  });
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState<string>(() => {
    try {
      return localStorage.getItem(LAST_EMAIL_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [suggestSignup, setSuggestSignup] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const displayedError = errorMessage || externalError;
  const busy = !authReady || isResolvingProfile || isLoading || isAuthenticating;
  const hasPendingAuthenticatedUser = Boolean(authReady && signedInEmail && !isResolvingProfile);

  // Automatically check verification when returning to this browser tab
  useEffect(() => {
    if (!hasPendingAuthenticatedUser || isEmailVerified || !onRetrySync) return;

    const handleCheckOnFocus = () => {
      if (document.visibilityState === 'hidden') return;
      void Promise.resolve(onRetrySync()).catch(() => {});
    };

    window.addEventListener('focus', handleCheckOnFocus);
    document.addEventListener('visibilitychange', handleCheckOnFocus);
    return () => {
      window.removeEventListener('focus', handleCheckOnFocus);
      document.removeEventListener('visibilitychange', handleCheckOnFocus);
    };
  }, [hasPendingAuthenticatedUser, isEmailVerified, onRetrySync]);

  const rememberEmail = (value: string) => {
    try {
      localStorage.setItem(LAST_EMAIL_STORAGE_KEY, value.trim().toLowerCase().slice(0, 200));
    } catch {
      // ignore storage errors
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    setSuggestSignup(false);
    setInfoMessage(null);
    onClearExternalError?.();
    setIsLoading(true);
    try {
      await signInWithGoogle();
      sounds.playCashRegister();
    } catch (err) {
      const mapped = mapFirebaseAuthError(err);
      if (mapped.message) {
        setErrorMessage(mapped.message);
        sounds.playError();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuggestSignup(false);
    setInfoMessage(null);
    onClearExternalError?.();

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setErrorMessage('Masukkan email dan password.');
      return;
    }
    if (mode === 'signup' && password.length < 6) {
      setErrorMessage('Password minimal 6 karakter.');
      return;
    }

    rememberEmail(trimmedEmail);
    setIsLoading(true);
    try {
      if (mode === 'signin') {
        await signInWithEmail(trimmedEmail, password);
      } else {
        const created = await registerWithEmail(trimmedEmail, password);
        if (!created.emailVerified) {
          setInfoMessage(
            `Akun dibuat! Link verifikasi telah dikirim ke ${trimmedEmail}. Klik link tersebut lalu kembali ke halaman ini.`
          );
        }
      }
      sounds.playCashRegister();
    } catch (err) {
      const mapped = mapFirebaseAuthError(err);
      if (mapped.message) {
        setErrorMessage(mapped.message);
        setSuggestSignup(Boolean(mapped.suggestSignup && mode === 'signin'));
        sounds.playError();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setErrorMessage(null);
    setSuggestSignup(false);
    setInfoMessage(null);
    onClearExternalError?.();

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setErrorMessage('Isi alamat email Anda terlebih dahulu untuk reset password.');
      return;
    }

    setIsLoading(true);
    try {
      await sendPasswordReset(trimmedEmail);
      setInfoMessage(`Link reset password dikirim ke ${trimmedEmail}. Periksa inbox atau folder Spam.`);
      sounds.playItemBeep();
    } catch (err) {
      const mapped = mapFirebaseAuthError(err);
      if (mapped.message) {
        setErrorMessage(mapped.message);
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
        `Link verifikasi baru dikirim ke ${signedInEmail}. Periksa Inbox atau Spam, lalu klik linknya.`
      );
      sounds.playItemBeep();
    } catch (err) {
      const mapped = mapFirebaseAuthError(err);
      if (mapped.message) {
        setErrorMessage(mapped.message);
        sounds.playError();
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualVerificationCheck = async () => {
    setErrorMessage(null);
    setInfoMessage(null);
    onClearExternalError?.();
    if (!onRetrySync) return;
    setIsLoading(true);
    try {
      const ok = await onRetrySync();
      if (!ok) {
        setErrorMessage(
          'Email masih belum terverifikasi. Pastikan Anda sudah mengklik link verifikasi di email Anda.'
        );
        sounds.playError();
      }
    } catch {
      setErrorMessage('Gagal memeriksa status akun. Periksa koneksi internet Anda.');
      sounds.playError();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOutSwitch = async () => {
    setErrorMessage(null);
    setSuggestSignup(false);
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 flex flex-col justify-center py-8 sm:px-6 lg:px-8 px-4 text-slate-100">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Icon / Logo */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-xl shadow-emerald-500/25 flex items-center justify-center text-white mb-3.5">
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
        <p className="mt-1 text-sm text-slate-400">Masuk untuk mulai transaksi kasir</p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-800/90 backdrop-blur-xl py-7 px-5 sm:px-8 shadow-2xl rounded-2xl border border-slate-700/80 space-y-4">
          {/* Info Alert */}
          {infoMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-700/70 text-emerald-200 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{infoMessage}</span>
            </div>
          )}

          {/* Error Alert */}
          {displayedError && (
            <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-200 text-xs space-y-2">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{displayedError}</span>
              </div>
              {suggestSignup && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setErrorMessage(null);
                    setSuggestSignup(false);
                  }}
                  className="ml-6 text-[11px] font-bold text-emerald-300 hover:text-emerald-200 underline cursor-pointer"
                >
                  Belum pernah daftar? Klik di sini untuk daftar dengan email & password ini
                </button>
              )}
            </div>
          )}

          {hasPendingAuthenticatedUser ? (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-700 text-xs text-slate-300 space-y-1.5">
                <div>
                  Masuk sebagai{' '}
                  <strong className="text-white font-mono">{signedInEmail}</strong>
                </div>
                {!isEmailVerified && (
                  <p className="text-amber-300 text-[11px] leading-relaxed">
                    Satu langkah lagi: klik link verifikasi di inbox email Anda. Setelah diklik, halaman ini akan otomatis masuk saat Anda kembali.
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => void handleManualVerificationCheck()}
                disabled={busy}
                className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
                <span>
                  {!isEmailVerified ? 'Saya Sudah Verifikasi, Masuk Sekarang' : 'Coba Masuk Lagi'}
                </span>
              </button>

              {!isEmailVerified && (
                <button
                  type="button"
                  onClick={() => void handleResendVerification()}
                  disabled={busy}
                  className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs bg-slate-700 hover:bg-slate-600 text-white transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <MailCheck className="w-4 h-4 text-emerald-400" />
                  <span>Kirim Ulang Link Verifikasi</span>
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
            <>
              {/* 1-Click Primary Login: Google */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => void handleGoogleSignIn()}
                  disabled={busy}
                  className="w-full py-3.5 px-4 rounded-xl font-bold text-sm bg-white hover:bg-slate-100 text-slate-900 shadow-lg transition-all active:scale-[0.99] flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                >
                  {busy && !showEmailForm ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-300 border-t-emerald-600 rounded-full animate-spin" />
                      <span>
                        {!authReady
                          ? 'Menyiapkan...'
                          : isResolvingProfile
                            ? 'Memuat Akun...'
                            : 'Membuka Google...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
                      <span>Masuk Cepat dengan Google</span>
                    </>
                  )}
                </button>
                <p className="text-[11px] text-center text-slate-400">
                  Paling praktis — cukup 1 klik tanpa password
                </p>
              </div>

              {/* Collapsible Email & Password Login */}
              <div className="pt-2 border-t border-slate-700/80">
                <button
                  type="button"
                  onClick={() => setShowEmailForm((prev) => !prev)}
                  className="w-full py-2 px-3 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-700/40 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    {showEmailForm
                      ? 'Sembunyikan Login Email & Password'
                      : 'Atau Masuk dengan Email & Password'}
                  </span>
                  {showEmailForm ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>

                {showEmailForm && (
                  <form
                    onSubmit={(e) => void handleEmailSubmit(e)}
                    className="mt-3 pt-3 border-t border-slate-700/60 space-y-3"
                  >
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
                          placeholder="Minimal 6 karakter"
                          required
                          className="w-full pl-10 pr-10 py-2.5 bg-slate-900/70 border border-slate-700 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                          aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={busy}
                      className="w-full py-2.5 px-4 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                    >
                      {busy ? (
                        <>
                          <div className="w-4 h-4 border-2 border-emerald-200 border-t-white rounded-full animate-spin" />
                          <span>Memproses...</span>
                        </>
                      ) : (
                        <span>{mode === 'signin' ? 'Masuk' : 'Daftar & Masuk'}</span>
                      )}
                    </button>

                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setMode((prev) => (prev === 'signin' ? 'signup' : 'signin'));
                          setErrorMessage(null);
                          setSuggestSignup(false);
                          setInfoMessage(null);
                        }}
                        className="text-xs text-slate-400 hover:text-emerald-300 cursor-pointer"
                      >
                        {mode === 'signin'
                          ? 'Belum punya akun email? Daftar di sini'
                          : 'Sudah punya akun? Kembali ke Masuk'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
