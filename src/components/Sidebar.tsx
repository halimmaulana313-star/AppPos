/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  FileSpreadsheet,
  History,
  Lock,
  Package,
  Settings,
  Shield,
  ShoppingCart,
  Users,
} from 'lucide-react';
import { ActiveTab, AppUser } from '../types/pos';
import { sounds } from '../utils/soundEffects';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  cartCount: number;
  currentUser: AppUser | null;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  cartCount,
  currentUser,
  isSidebarOpen,
  setIsSidebarOpen,
}) => {
  const isMaster = currentUser?.role === 'master';

  const handleTabClick = (tab: ActiveTab) => {
    sounds.playItemBeep();
    setActiveTab(tab);
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  const menuItems = [
    {
      id: 'pos' as ActiveTab,
      label: 'Kasir POS',
      sublabel: 'Pilih menu & bayar',
      icon: ShoppingCart,
      badge: cartCount > 0 ? `${cartCount}` : null,
      badgeColor: 'bg-emerald-500 text-white',
    },
    {
      id: 'closing' as ActiveTab,
      label: 'Tutupan Kasir',
      sublabel: 'Tutup shift & laporan tgl',
      icon: Lock,
      badge: null,
    },
    {
      id: 'history' as ActiveTab,
      label: 'Riwayat Transaksi',
      sublabel: 'Nota & cetak ulang struk',
      icon: History,
      badge: null,
    },
  ];

  const adminMenuItems = [
    {
      id: 'reports' as ActiveTab,
      label: 'Laporan Harian',
      sublabel: 'Ringkasan penjualan',
      icon: FileSpreadsheet,
    },
    {
      id: 'products' as ActiveTab,
      label: 'Kelola Produk',
      sublabel: 'Menu, harga & stok',
      icon: Package,
    },
    {
      id: 'users' as ActiveTab,
      label: 'Kelola Kasir',
      sublabel: 'Akun staf & akses',
      icon: Users,
    },
    {
      id: 'settings' as ActiveTab,
      label: 'Pengaturan Toko',
      sublabel: 'Profil, QRIS & printer',
      icon: Settings,
    },
  ];

  return (
    <>
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs md:hidden"
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 bg-white border-r border-slate-200 flex flex-col shrink-0 transition-all duration-300 ease-in-out select-none ${
          isSidebarOpen
            ? 'w-64 translate-x-0 shadow-2xl md:shadow-none opacity-100'
            : '-translate-x-full md:translate-x-0 md:w-0 md:border-r-0 md:opacity-0 md:pointer-events-none overflow-hidden'
        }`}
      >
        <div className="w-64 flex flex-col h-full shrink-0">
          <div className="px-4 py-3.5 border-b border-slate-100 flex items-center bg-slate-50/80">
            <span className="font-extrabold text-xs text-slate-700 tracking-wider uppercase">
              Menu Navigasi
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 space-y-6">
            <div>
              <div className="px-3 mb-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Kasir
              </div>
              <div className="space-y-1">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabClick(item.id)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-all group cursor-pointer active:scale-[0.98] ${
                        isActive
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/20 font-bold'
                          : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                            isActive
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200 group-hover:text-emerald-700'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="truncate">
                          <div className="text-xs sm:text-sm leading-tight truncate">{item.label}</div>
                          <div
                            className={`text-[10px] truncate ${
                              isActive ? 'text-emerald-100' : 'text-slate-400'
                            }`}
                          >
                            {item.sublabel}
                          </div>
                        </div>
                      </div>

                      {item.badge && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black shrink-0 ${
                            item.badgeColor ||
                            (isActive ? 'bg-white text-emerald-800' : 'bg-emerald-600 text-white')
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {isMaster && (
              <div>
                <div className="px-3 mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Shield className="w-3 h-3 text-amber-500" />
                    <span>Pengelola Toko</span>
                  </span>
                  <span className="text-[9px] bg-amber-50 text-amber-700 font-bold px-1.5 py-0.2 rounded border border-amber-200 uppercase">
                    Owner
                  </span>
                </div>
                <div className="space-y-1">
                  {adminMenuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleTabClick(item.id)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-all group cursor-pointer active:scale-[0.98] ${
                          isActive
                            ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/20 font-bold'
                            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 font-medium'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                              isActive
                                ? 'bg-white/20 text-white'
                                : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200 group-hover:text-emerald-700'
                            }`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="truncate">
                            <div className="text-xs sm:text-sm leading-tight truncate">{item.label}</div>
                            <div
                              className={`text-[10px] truncate ${
                                isActive ? 'text-emerald-100' : 'text-slate-400'
                              }`}
                            >
                              {item.sublabel}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="p-3.5 pl-20 border-t border-slate-100 bg-slate-50/80 text-[11px] text-slate-400 flex items-center justify-between shrink-0 h-16">
            <span>KasirKu POS</span>
          </div>
        </div>
      </aside>
    </>
  );
};
