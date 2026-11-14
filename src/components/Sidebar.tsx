/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  FileSpreadsheet,
  History,
  Package,
  QrCode,
  Settings,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Users,
} from 'lucide-react';
import { ActiveTab, AppUser } from '../types/pos';
import { sounds } from '../utils/soundEffects';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  cartCount: number;
  pendingOnlineCount?: number;
  currentUser: AppUser | null;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  cartCount,
  pendingOnlineCount = 0,
  currentUser,
  isSidebarOpen,
  setIsSidebarOpen,
}) => {
  const isMaster = currentUser?.role === 'master';

  const handleTabClick = (tab: ActiveTab) => {
    sounds.playItemBeep();
    setActiveTab(tab);
    // On mobile screens (< 768px), auto close drawer after selecting
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  const menuItems = [
    {
      id: 'pos' as ActiveTab,
      label: 'Kasir POS',
      sublabel: 'Input pesanan & struk',
      icon: ShoppingCart,
      badge: cartCount > 0 ? `${cartCount}` : null,
      badgeColor: 'bg-emerald-500 text-white',
    },
    {
      id: 'online_orders' as ActiveTab,
      label: 'Pesanan Online',
      sublabel: 'Barcode meja & takeaway',
      icon: ShoppingBag,
      badge: pendingOnlineCount > 0 ? `${pendingOnlineCount} Baru` : null,
      badgeColor: 'bg-rose-500 text-white font-black animate-pulse shadow-sm shadow-rose-500/50',
    },
    {
      id: 'table_qr' as ActiveTab,
      label: 'QR Meja & Barcode',
      sublabel: 'Cetak barcode meja',
      icon: QrCode,
      badge: null,
    },
    {
      id: 'history' as ActiveTab,
      label: 'Riwayat Transaksi',
      sublabel: 'Daftar nota & cetak ulang',
      icon: History,
      badge: null,
    },
  ];

  const adminMenuItems = [
    {
      id: 'reports' as ActiveTab,
      label: 'Laporan Harian',
      sublabel: 'Omset & Z-Report tabel',
      icon: FileSpreadsheet,
      badge: 'Z-Report',
      badgeColor: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
    },
    {
      id: 'products' as ActiveTab,
      label: 'Kelola Produk',
      sublabel: 'Menu, harga & stok',
      icon: Package,
      badge: null,
    },
    {
      id: 'users' as ActiveTab,
      label: 'Kelola Kasir',
      sublabel: 'Akun staf & hak akses',
      icon: Users,
      badge: null,
    },
    {
      id: 'settings' as ActiveTab,
      label: 'Pengaturan Toko',
      sublabel: 'Profil, logo, QRIS & printer',
      icon: Settings,
      badge: null,
    },
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Sidebar Container with Smooth Collapse/Expand */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 bg-white border-r border-slate-200 flex flex-col shrink-0 transition-all duration-300 ease-in-out select-none ${
          isSidebarOpen
            ? 'w-64 translate-x-0 shadow-2xl md:shadow-none opacity-100'
            : '-translate-x-full md:translate-x-0 md:w-0 md:border-r-0 md:opacity-0 md:pointer-events-none overflow-hidden'
        }`}
      >
        <div className="w-64 flex flex-col h-full shrink-0">
          {/* Sidebar Header */}
          <div className="px-4 py-3.5 border-b border-slate-100 flex items-center bg-slate-50/80">
            <span className="font-extrabold text-xs text-slate-700 tracking-wider uppercase">Menu Navigasi</span>
          </div>

        {/* Sidebar Nav Content */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-6">
          {/* Main Transaction Menu */}
          <div>
            <div className="px-3 mb-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Menu Transaksi
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
                          item.badgeColor || (isActive ? 'bg-white text-emerald-800' : 'bg-emerald-600 text-white')
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

          {/* Master / Administrator Menu */}
          {isMaster && (
            <div>
              <div className="px-3 mb-2 flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Shield className="w-3 h-3 text-amber-500" />
                  <span>Menu Administrator</span>
                </span>
                <span className="text-[9px] bg-amber-50 text-amber-700 font-bold px-1.5 py-0.2 rounded border border-amber-200 uppercase">
                  Master
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

                      {item.badge && (
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-bold shrink-0 ${
                            isActive ? 'bg-white/20 text-white' : item.badgeColor
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
          )}
        </div>

        {/* Sidebar Footer info */}
        <div className="p-3.5 pl-20 border-t border-slate-100 bg-slate-50/80 text-[11px] text-slate-400 flex items-center justify-between shrink-0 h-16">
          <span>KasirKu POS v2.0</span>
          <span className="font-mono text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
            Thermal ESC/POS
          </span>
        </div>
      </div>
    </aside>
    </>
  );
};
