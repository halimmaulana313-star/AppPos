/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const rawMsg = error instanceof Error ? error.message : String(error);
    let friendly = 'Terjadi kendala sementara pada aplikasi.';
    if (rawMsg.includes('Quota exceeded')) {
      friendly =
        'Batas penggunaan harian tercapai. Silakan coba kembali besok atau periksa kuota penyimpanan.';
    } else if (rawMsg.includes('Missing or insufficient permissions')) {
      friendly =
        'Akses ditolak untuk tindakan ini. Pastikan akun Anda aktif dan memiliki hak akses yang sesuai.';
    }
    return { hasError: true, errorMessage: friendly };
  }

  override componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    console.error('[App ErrorBoundary]', error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-lg max-w-md w-full p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Ups, Terjadi Kendala</h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-1">{this.state.errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Muat Ulang Aplikasi</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
