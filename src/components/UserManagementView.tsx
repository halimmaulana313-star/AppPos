/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Edit2,
  KeyRound,
  Lock,
  Mail,
  Phone,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { AppUser, UserRole } from '../types/pos';
import { sounds } from '../utils/soundEffects';

interface UserManagementViewProps {
  users: AppUser[];
  setUsers: React.Dispatch<React.SetStateAction<AppUser[]>>;
  currentUser: AppUser;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  users,
  setUsers,
  currentUser,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'master' | 'cashier'>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('cashier');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Password reset modal
  const [passwordModalUser, setPasswordModalUser] = useState<AppUser | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Delete confirmation modal & banner notification
  const [userToDelete, setUserToDelete] = useState<AppUser | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const openAddModal = () => {
    setEditingUser(null);
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormPhone('');
    setFormRole('cashier');
    setFormIsActive(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (user: AppUser) => {
    setEditingUser(user);
    setFormName(user.name);
    setFormEmail(user.email);
    setFormPassword(user.password);
    setFormPhone(user.phone || '');
    setFormRole(user.role);
    setFormIsActive(user.isActive);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = formName.trim();
    const trimmedEmail = formEmail.trim().toLowerCase();
    const trimmedPass = formPassword.trim();

    if (!trimmedName || !trimmedEmail || !trimmedPass) {
      setFormError('Nama lengkap, email, dan kata sandi wajib diisi.');
      return;
    }

    // Check duplicate email
    const duplicate = users.find(
      (u) =>
        u.email.toLowerCase() === trimmedEmail &&
        (!editingUser || u.id !== editingUser.id)
    );
    if (duplicate) {
      setFormError(`Email ${trimmedEmail} sudah digunakan oleh pengguna lain.`);
      return;
    }

    if (editingUser) {
      // Prevent demoting the last master
      if (
        editingUser.role === 'master' &&
        formRole !== 'master' &&
        users.filter((u) => u.role === 'master').length <= 1
      ) {
        setFormError('Sistem harus memiliki setidaknya satu Akun Master.');
        return;
      }

      setUsers((prev) =>
        prev.map((u) =>
          u.id === editingUser.id
            ? {
                ...u,
                name: trimmedName,
                email: trimmedEmail,
                password: trimmedPass,
                phone: formPhone.trim() || undefined,
                role: formRole,
                isActive: formIsActive,
              }
            : u
        )
      );
      sounds.playCashRegister();
      setIsModalOpen(false);
    } else {
      const newUser: AppUser = {
        id: `usr-${Date.now()}`,
        name: trimmedName,
        email: trimmedEmail,
        password: trimmedPass,
        phone: formPhone.trim() || undefined,
        role: formRole,
        isActive: formIsActive,
        createdAt: new Date().toISOString(),
      };
      setUsers((prev) => [...prev, newUser]);
      sounds.playCashRegister();
      setIsModalOpen(false);
    }
  };

  const handleDeleteUser = (user: AppUser) => {
    if (user.id === currentUser.id) {
      setNotification('Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif digunakan.');
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    if (user.role === 'master' && users.filter((u) => u.role === 'master').length <= 1) {
      setNotification('Tidak dapat menghapus akun master terakhir dalam sistem.');
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    setUserToDelete(user);
  };

  const confirmDeleteUser = () => {
    if (userToDelete) {
      setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id));
      sounds.playCashRegister();
      setUserToDelete(null);
    }
  };

  const handleToggleActive = (user: AppUser) => {
    if (user.id === currentUser.id) {
      setNotification('Anda tidak dapat menonaktifkan akun Anda sendiri.');
      setTimeout(() => setNotification(null), 4000);
      return;
    }
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, isActive: !u.isActive } : u))
    );
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordModalUser || !newPassword.trim()) return;

    setUsers((prev) =>
      prev.map((u) =>
        u.id === passwordModalUser.id ? { ...u, password: newPassword.trim() } : u
      )
    );
    sounds.playCashRegister();
    setNotification(`Kata sandi untuk ${passwordModalUser.name} berhasil diperbarui.`);
    setPasswordModalUser(null);
    setNewPassword('');
  };

  // Filtered users list
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
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs sm:text-sm font-medium flex items-center justify-between animate-in fade-in">
          <span>{notification}</span>
          <button
            onClick={() => setNotification(null)}
            className="text-amber-600 hover:text-amber-800 font-bold ml-2 text-xs"
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
            Tambahkan dan atur akun kasir untuk melayani transaksi tanpa izin mengubah data produk atau pengaturan.
          </p>
        </div>

        <button
          onClick={openAddModal}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-md shadow-emerald-600/20 transition-all cursor-pointer self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>Tambah Kasir Baru</span>
        </button>
      </div>

      {/* RBAC Info Notice Card */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-blue-950 uppercase tracking-wider">
              Keamanan Hak Akses Peran (RBAC)
            </h4>
            <p className="text-xs text-blue-800 mt-0.5 leading-relaxed">
              <strong>Akun Kasir</strong> hanya memiliki hak untuk membuka kasir, memilih produk, menerima pembayaran (Tunai, QRIS, dll), dan mencetak struk belanja. Kasir <strong>tidak diizinkan</strong> menambah/mengubah harga barang, mengubah info toko, menghapus transaksi, atau mereset data.
            </p>
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
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kasir berdasarkan nama, email, atau no HP..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <button
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

      {/* Users Table / Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wider">
                <th className="py-3.5 px-4 sm:px-6">Pengguna</th>
                <th className="py-3.5 px-4">Peran (Role)</th>
                <th className="py-3.5 px-4">Kontak / HP</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Password</th>
                <th className="py-3.5 px-4 text-right sm:pr-6">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
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
                          onClick={() => handleToggleActive(user)}
                          disabled={isCurrent}
                          title={isCurrent ? 'Tidak bisa menonaktifkan akun sendiri' : 'Klik untuk ubah status'}
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

                      {/* Password Info */}
                      <td className="py-4 px-4 text-xs font-mono text-slate-500">
                        <div className="flex items-center gap-2">
                          <span>••••••••</span>
                          <button
                            type="button"
                            onClick={() => {
                              setPasswordModalUser(user);
                              setNewPassword('');
                            }}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                            title="Ganti Password"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 text-right sm:pr-6">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(user)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                            title="Edit Data Kasir"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {!isCurrent && (
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(user)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Hapus Kasir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
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

      {/* Add / Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-scale-up">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {editingUser ? 'Edit Data Pengguna' : 'Tambah Akun Kasir Baru'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {editingUser ? 'Perbarui informasi kasir' : 'Daftarkan kasir baru untuk melayani penjualan'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Lengkap Kasir *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Contoh: Dimas Saputra"
                  required
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alamat Email (Untuk Login) *
                </label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="kasir.dimas@kopiliterasi.com"
                  required
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kata Sandi (Password) *
                </label>
                <input
                  type="text"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  required
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
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
                    onClick={() => setFormRole('cashier')}
                    className={`p-3 rounded-xl border text-left transition-all ${
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
                      Hanya penjualan & cetak struk (tidak bisa ubah data).
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormRole('master')}
                    className={`p-3 rounded-xl border text-left transition-all ${
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
                      Akses penuh kelola produk, laporan, kasir, & pengaturan.
                    </p>
                  </button>
                </div>
              </div>

              {/* Is Active Toggle */}
              <div className="pt-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Status Akun Aktif</span>
                <button
                  type="button"
                  onClick={() => setFormIsActive(!formIsActive)}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
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
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20"
                >
                  {editingUser ? 'Simpan Perubahan' : 'Daftarkan Kasir'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden animate-scale-up">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-600" />
                <h4 className="font-bold text-slate-900 text-sm">Ganti Password Kasir</h4>
              </div>
              <button
                type="button"
                onClick={() => setPasswordModalUser(null)}
                className="p-1 rounded text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="p-5 space-y-4">
              <div>
                <p className="text-xs text-slate-600 mb-2">
                  Atur ulang kata sandi untuk akun <strong>{passwordModalUser.name}</strong> ({passwordModalUser.email}):
                </p>
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Kata sandi baru..."
                  required
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordModalUser(null)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 p-6 text-center space-y-4 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Hapus Akun Kasir?</h3>
              <p className="text-xs text-slate-500 mt-1">
                Yakin ingin menghapus kasir <strong>{userToDelete.name}</strong> ({userToDelete.email})? Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDeleteUser}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
