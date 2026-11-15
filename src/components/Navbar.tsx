/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Clock,
  LogOut,
  QrCode,
  ShoppingBag,
  Store,
} from 'lucide-react';
import { AppUser, PrinterConfig, StoreProfile } from '../types/pos';
import { BluetoothPrinterState } from '../utils/bluetoothThermalPrinter';

interface NavbarProps {
  store: StoreProfile;
  currentUser: AppUser | null;
  onLogout: () => void;
  onOpenLogoManager?: () => void;
  printerState?: BluetoothPrinterState;
  printerConfig?: PrinterConfig;
  onOpenPrinterModal?: () => void;
  onQuickConnectBluetooth?: () => void;
  pendingOnlineOrdersCount?: number;
  onOpenOnlineOrders?: () => void;
  onOpenTableQR?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  store,
  currentUser,
  onLogout,
  onOpenLogoManager,
  pendingOnlineOrdersCount = 0,
  onOpenOnlineOrders,
  onOpenTableQR,
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const isMaster = currentUser?.role === 'master';

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
      setCurrentDate(
        now.toLocaleDateString('id-ID', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: Brand Logo & Name */}
          <div className="flex items-center space-x-3">
            {/* Store Logo with Owner Quick-Edit */}
            <div
              onClick={isMaster && onOpenLogoManager ? onOpenLogoManager : undefined}
              className={`w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden shrink-0 relative transition-transform ${
                isMaster && onOpenLogoManager ? 'cursor-pointer hover:scale-105 group' : ''
              } ${
                store.logoUrl
                  ? 'bg-white border border-slate-200 shadow-2xs'
                  : 'bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-500/20'
              }`}
              title={isMaster ? 'Klik untuk mengganti logo usaha (Khusus Owner)' : store.storeName}
            >
              {store.logoUrl ? (
                <img
                  src={store.logoUrl}
                  alt={store.storeName}
                  className="w-full h-full object-contain p-0.5"
                />
              ) : (
                <Store className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-900 tracking-tight text-base sm:text-xl">
                  {store.storeName}
                </span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wide">
                  POS
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block truncate max-w-[200px] md:max-w-xs">
                {store.tagline || 'Sistem Kasir & Cetak Struk Bluetooth'}
              </p>
            </div>
          </div>

          {/* Right Section: Digital Clock, Administrator/User Card, & Logout */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Green Digital Clock Display matching other buttons */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500 shadow-md shadow-emerald-600/20 transition-all">
              {/* Pulsing live beacon & clock icon */}
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-200 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                </span>
                <Clock className="w-3.5 h-3.5 text-emerald-100" />
              </div>

              {/* Digital time */}
              <span className="font-mono font-black text-xs sm:text-sm tracking-wider text-white drop-shadow-xs">
                {currentTime}
              </span>

              {/* Date & WIB badge */}
              <div className="flex items-center gap-1.5 pl-1.5 border-l border-emerald-400/50">
                {currentDate && (
                  <span className="text-[10px] font-bold text-emerald-100 hidden xl:inline">
                    {currentDate}
                  </span>
                )}
                <span className="text-[9px] font-black bg-emerald-800/80 text-white px-1.5 py-0.2 rounded uppercase tracking-wider shadow-2xs border border-emerald-400/30">
                  WIB
                </span>
              </div>
            </div>

            {/* Online Orders Quick Button */}
            {onOpenOnlineOrders && (
              <button
                type="button"
                onClick={onOpenOnlineOrders}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer shadow-2xs shrink-0 ${
                  pendingOnlineOrdersCount > 0
                    ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300 ring-2 ring-rose-500/20'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
                title="Lihat Pesanan Online & Barcode Meja"
              >
                <div className="relative">
                  <ShoppingBag className={`w-4 h-4 ${pendingOnlineOrdersCount > 0 ? 'text-rose-600' : 'text-emerald-700'}`} />
                  {pendingOnlineOrdersCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-rose-500 text-white text-[9px] rounded-full flex items-center justify-center font-black animate-pulse">
                      {pendingOnlineOrdersCount}
                    </span>
                  )}
                </div>
                <span className="hidden sm:inline">Pesanan Online</span>
              </button>
            )}

            {/* Table QR Button */}
            {onOpenTableQR && (
              <button
                type="button"
                onClick={onOpenTableQR}
                className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                title="Lihat & Cetak QR Code Meja"
              >
                <QrCode className="w-3.5 h-3.5 text-emerald-700" />
                <span>QR Meja</span>
              </button>
            )}

            {/* Administrator / User Logged-in Profile Display */}
            {currentUser && (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                <div className="flex items-center gap-2.5 bg-slate-50 hover:bg-slate-100 p-1.5 pr-2.5 rounded-xl border border-slate-200 transition-colors">
                  {/* Avatar Icon */}
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 shadow-2xs ${
                      isMaster
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    }`}
                    title={`Akun: ${currentUser.name} (${isMaster ? 'Administrator / Master' : 'Kasir'})`}
                  >
                    {isMaster ? '👑' : '👤'}
                  </div>

                  {/* Name and Role Info */}
                  <div className="text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-extrabold text-slate-900 leading-tight truncate max-w-[120px] sm:max-w-[150px]">
                        {currentUser.name}
                      </span>
                      <span
                        className={`text-[9px] font-black px-1.5 py-0.2 rounded uppercase ${
                          isMaster
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        }`}
                      >
                        {isMaster ? 'Administrator' : 'Kasir'}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 block truncate max-w-[130px] sm:max-w-[160px] font-mono leading-none mt-0.5">
                      {currentUser.email}
                    </span>
                  </div>
                </div>

                {/* Logout Button */}
                <button
                  type="button"
                  onClick={onLogout}
                  title="Keluar dari Akun Kasir"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 border border-rose-200 text-xs font-bold transition-all shadow-2xs cursor-pointer shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-600" />
                  <span className="hidden sm:inline">Keluar</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
