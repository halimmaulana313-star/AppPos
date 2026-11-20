/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  AlertCircle,
  Edit2,
  Info,
  Mail,
  Phone,
  Search,
  Shield,
  Users,
  X,
} from 'lucide-react';
import { updateManagedUserRoleOrStatus } from '../lib/firestoreSync';
import { AppUser, UserRole } from '../types/pos';
import { sounds } from '../utils/soundEffects';

interface UserManagementViewProps {
  users: AppUser[];
  setUsers: React.Dispatch<React.SetStateAction<AppUser[]>>;
  currentUser: AppUser;
  isBootstrapAdmin: boolean;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  users,
  setUsers,
  currentUser,
  isBootstrapAdmin,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'master' | 'cashier'>('all');

  // Edit Modal State
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('cashier');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [notification, setNotification] = useState<{
    type: 'warning' | 'success';
    text: string;
  } | null>(null);

  const showBanner = (type: 'warning' | 'success', text: string) => {
    setNotification({ type, text });
    window.setTimeout(() => setNotification(null), 5000);
  };

  const openEditModal = (user: AppUser) => {
    setEditingUser(user);
    setFormName(user.name);
    setFormPhone(user.phone || '');
    setFormRole(user.role);
    setFormIsActive(user.isActive);
    setFormError(null);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setFormError(null);

    const trimmedName = formName.trim().slice(0, 100);
    const trimmedPhone = formPhone.trim().slice(0, 32);

    if (!trimmedName) {
      setFormError('Nama pengguna wajib diisi.');
      return;
    }

    if (editingUser.id === currentUser.id && !formIsActive) {
      setFormError('Anda tidak dapat menonaktifkan akun Anda sendiri.');
      return;
    }

    if (
      editingUser.role === 'master' &&
      formRole !== 'master' &&
      users.filter((u) => u.role === 'master').length <= 1
    ) {
      setFormError('Sistem harus memiliki setidaknya satu Akun Master.');
      return;
    }

    if (editingUser.id === currentUser.id && formRole !== editingUser.role) {
      setFormError('Anda tidak dapat menurunkan peran akun Anda sendiri.');
      return;
    }

    setIsSaving(true);
    try {
      await updateManagedUserRoleOrStatus(
        editingUser.id,
        {
          displayName: trimmedName,
          phone: trimmedPhone,
          role: formRole,
          isActive: formIsActive,
        },
        currentUser.id
      );

      setUsers((prev) =>
        prev.map((u) =>
          u.id === editingUser.id
            ? {
                ...u,
                name: trimmedName,
                phone: trimmedPhone || undefined,
                role: formRole,
                isActive: formIsActive,
              }
            : u
        )
      );
      sounds.playCashRegister();
      setEditingUser(null);
      showBanner('success', `Data pengguna ${trimmedName} berhasil diperbarui di database.`);
    } catch {
      setFormError('Gagal menyimpan perubahan ke database. Pastikan hak akses Master Anda aktif.');
      sounds.playError();
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActive = async (user: AppUser) => {
    if (user.id === currentUser.id) {
      showBanner('warning', 'Anda tidak dapat menonaktifkan akun Anda sendiri.');
      return;
    }

    const nextActive = !user.isActive;
    try {
      await updateManagedUserRoleOrStatus(
        user.id,
        { isActive: nextActive },
        currentUser.id
      );
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isActive: nextActive } : u))
      );
      sounds.playCashRegister();
      showBanner(
        'success',
        `Status ${user.name} diubah menjadi ${nextActive ? 'Aktif' : 'Nonaktif'}.`
      );
    } catch {
      showBanner('warning', 'Gagal memperbarui status pengguna di server.');
      sounds.playError();
    }
  };

  const filteredUsers = users.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.phone && u.phone.includes(q))
    );
  });

  const totalCashiers = users.filter((u) => u.role === 'cashier').length;
  const activeCashiers = users.filter((u) => u.role === 'cashier' && u.isActive).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Notification Banner */}
      {notification && (
        <div
          className={`p-4 rounded-xl border text-xs sm:text-sm font-medium flex items-center justify-between animate-in fade-in ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          <span>{notification.text}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="font-bold ml-2 text-xs opacity-75 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Kelola Pengguna & Kasir
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
              👑 Akses Khusus Master
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Atur peran (Kasir / Master) dan status aktif staf yang telah masuk menggunakan Email atau Google Sign-In.
          </p>
        </div>
      </div>

      {/* Onboarding & Security Info Cards */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-blue-950 uppercase tracking-wider">
              Otentikasi Firebase & Kontrol Hak Akses (RBAC)
            </h4>
            <p className="text-xs text-blue-800 mt-0.5 leading-relaxed">
              Setiap staf baru mendaftar otomatis sebagai <strong>Kasir</strong> saat pertama kali masuk dengan email terverifikasi atau akun Google mereka. Master dapat mengaktifkan, menonaktifkan, atau mengubah peran staf di sini.
            </p>
            {!isBootstrapAdmin && (
              <p className="text-[11px] text-indigo-800 mt-1.5 flex items-center gap-1 font-semibold">
                <Info className="w-3.5 h-3.5 shrink-0" />
                Daftar lengkap seluruh staf hanya ditampilkan kepada Pemilik Utama toko demi privasi PII.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-xs">
          <div className="bg-white/80 border border-blue-200 px-3 py-1.5 rounded-xl font-medium text-slate-700">
            Total Kasir: <strong className="text-slate-900">{totalCashiers}</strong>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl font-medium text-emerald-800">
            Kasir Aktif: <strong className="text-emerald-900">{activeCashiers}</strong>
          </div>
        </div>
      </div>

      {/* Search & Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            maxLength={100}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kasir berdasarkan nama, email, atau no HP..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRoleFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              roleFilter === 'all'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Semua ({users.length})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('master')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              roleFilter === 'master'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            👑 Master ({users.filter((u) => u.role === 'master').length})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('cashier')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              roleFilter === 'cashier'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            👤 Kasir ({users.filter((u) => u.role === 'cashier').length})
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider">
                <th className="py-3.5 px-4 sm:px-6">Pengguna</th>
                <th className="py-3.5 px-4">Peran (Role)</th>
                <th className="py-3.5 px-4">Kontak / HP</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right sm:pr-6">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="font-medium">Tidak ada data pengguna yang sesuai.</p>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isCurrent = user.id === currentUser.id;
                  const isMasterUser = user.role === 'master';

                  return (
                    <tr key={user.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* Name & Email */}
                      <td className="py-4 px-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                              isMasterUser
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            }`}
                          >
                            {isMasterUser ? '👑' : user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{user.name}</span>
                              {isCurrent && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-semibold border border-slate-200">
                                  Anda
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono mt-0.5">
                              <Mail className="w-3 h-3 text-slate-400" />
                              <span>{user.email}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="py-4 px-4">
                        {isMasterUser ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            👑 Master (Owner)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            👤 Kasir (Sales Only)
                          </span>
                        )}
                      </td>

                      {/* Phone */}
                      <td className="py-4 px-4 text-xs text-slate-600 font-mono">
                        {user.phone ? (
                          <div className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{user.phone}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4">
                        <button
                          type="button"
                          onClick={() => void handleToggleActive(user)}
                          disabled={isCurrent}
                          title={
                            isCurrent
                              ? 'Tidak bisa menonaktifkan akun sendiri'
                              : 'Klik untuk ubah status aktif'
                          }
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer disabled:cursor-not-allowed transition-all ${
                            user.isActive
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              user.isActive ? 'bg-emerald-600' : 'bg-rose-600'
                            }`}
                          />
                          <span>{user.isActive ? 'Aktif' : 'Nonaktif'}</span>
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-right sm:pr-6">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(user)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                            title="Edit Peran & Profil Pengguna"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-scale-up">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    Edit Peran & Profil Pengguna
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">{editingUser.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveUser(e)} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Tampilan *
                </label>
                <input
                  type="text"
                  value={formName}
                  maxLength={100}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor HP / WhatsApp (Opsional)
                </label>
                <input
                  type="text"
                  value={formPhone}
                  maxLength={32}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="0812-xxxx-xxxx"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Role selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Hak Akses (Peran)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={editingUser.id === currentUser.id}
                    onClick={() => setFormRole('cashier')}
                    className={`p-3 rounded-xl border text-left transition-all disabled:opacity-60 ${
                      formRole === 'cashier'
                        ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">👤</span>
                      <span className="font-bold text-xs text-slate-900">Kasir</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Hanya penjualan & cetak struk.
                    </p>
                  </button>

                  <button
                    type="button"
                    disabled={editingUser.id === currentUser.id}
                    onClick={() => setFormRole('master')}
                    className={`p-3 rounded-xl border text-left transition-all disabled:opacity-60 ${
                      formRole === 'master'
                        ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/20'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">👑</span>
                      <span className="font-bold text-xs text-slate-900">Master</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Akses penuh produk, laporan, & pengaturan.
                    </p>
                  </button>
                </div>
              </div>

              {/* Is Active Toggle */}
              <div className="pt-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Status Akun Aktif</span>
                <button
                  type="button"
                  disabled={editingUser.id === currentUser.id}
                  onClick={() => setFormIsActive(!formIsActive)}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors disabled:opacity-60 ${
                    formIsActive ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      formIsActive ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 disabled:opacity-60"
                >
                  {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
