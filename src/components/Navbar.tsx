/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Clock, LogOut, Menu, Store } from 'lucide-react';
import { AppUser, PrinterConfig, StoreProfile } from '../types/pos';
import { BluetoothPrinterState } from '../utils/bluetoothThermalPrinter';
import { PWAInstallButton } from './PWAInstallButton';

interface NavbarProps {
  store: StoreProfile;
  currentUser: AppUser | null;
  onLogout: () => void;
  onOpenLogoManager?: () => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  printerState?: BluetoothPrinterState;
  printerConfig?: PrinterConfig;
  onOpenPrinterModal?: () => void;
  onQuickConnectBluetooth?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  store,
  currentUser,
  onLogout,
  onOpenLogoManager,
  isSidebarOpen = true,
  onToggleSidebar,
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
          {/* Sidebar Toggle Button (Left of Logo) + Brand Logo & Store Name */}
          <div className="flex items-center space-x-3">
            {onToggleSidebar && (
              <button
                type="button"
                onClick={onToggleSidebar}
                className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer active:scale-95 border shrink-0 ${
                  isSidebarOpen
                    ? 'bg-slate-800 hover:bg-slate-900 text-white border-slate-700 shadow-xs'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 shadow-sm ring-2 ring-emerald-500/20'
                }`}
                title={isSidebarOpen ? 'Sembunyikan Menu Navigasi' : 'Tampilkan Menu Navigasi'}
                aria-label={isSidebarOpen ? 'Sembunyikan Menu Navigasi' : 'Tampilkan Menu Navigasi'}
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            <div
              onClick={isMaster && onOpenLogoManager ? onOpenLogoManager : undefined}
              className={`w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden shrink-0 transition-transform ${
                isMaster && onOpenLogoManager ? 'cursor-pointer hover:scale-105' : ''
              } ${
                store.logoUrl
                  ? 'bg-white border border-slate-200 shadow-2xs'
                  : 'bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-500/20'
              }`}
              title={isMaster ? 'Klik untuk ganti logo toko' : store.storeName}
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
              <span className="font-extrabold text-slate-900 tracking-tight text-base sm:text-xl block leading-tight">
                {store.storeName}
              </span>
              <p className="text-xs text-slate-500 hidden sm:block truncate max-w-[220px] md:max-w-xs">
                {store.tagline || 'Aplikasi Kasir & Struk Bluetooth'}
              </p>
            </div>
          </div>

          {/* Right Section: Clock, Install App, User Profile, & Logout */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <PWAInstallButton variant="navbar" />
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-900 border border-emerald-200">
              <Clock className="w-3.5 h-3.5 text-emerald-700" />
              <span className="font-mono font-bold text-xs sm:text-sm tracking-wide">
                {currentTime}
              </span>
              {currentDate && (
                <span className="text-[11px] font-medium text-emerald-700 pl-1.5 border-l border-emerald-200 hidden xl:inline">
                  {currentDate}
                </span>
              )}
            </div>

            {currentUser && (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                <div className="flex items-center gap-2.5 bg-slate-50 p-1.5 pr-2.5 rounded-xl border border-slate-200">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${
                      isMaster
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    }`}
                  >
                    {isMaster ? '👑' : '👤'}
                  </div>

                  <div className="text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-900 leading-tight truncate max-w-[120px] sm:max-w-[150px]">
                        {currentUser.name}
                      </span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                          isMaster
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        }`}
                      >
                        {isMaster ? 'Owner' : 'Kasir'}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 block truncate max-w-[130px] sm:max-w-[160px] font-mono leading-none mt-0.5">
                      {currentUser.email}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onLogout}
                  title="Keluar dari akun"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 border border-rose-200 text-xs font-bold transition-all cursor-pointer shrink-0"
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
