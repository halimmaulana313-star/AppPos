/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  FileText,
  Pencil,
  Receipt,
  RotateCcw,
  Save,
  Sparkles,
  Wifi,
  X,
} from 'lucide-react';
import { Order, PrinterConfig, ReceiptCustomTexts, StoreProfile } from '../types/pos';
import {
  DEFAULT_RECEIPT_TEXTS,
  formatNumber,
  formatOrderTypeLabel,
  formatPaymentMethodLabel,
  formatRupiah,
  formatShortDate,
  formatTimeOnly,
  getLineCharLimit,
  resolveReceiptTexts,
} from '../utils/formatters';
import { sanitizeReceiptTexts } from '../utils/sanitize';
import { sounds } from '../utils/soundEffects';

interface ReceiptEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  store: StoreProfile;
  setStore: React.Dispatch<React.SetStateAction<StoreProfile>>;
  printerConfig: PrinterConfig;
  setPrinterConfig: React.Dispatch<React.SetStateAction<PrinterConfig>>;
  previewOrder?: Order | null;
  isMaster: boolean;
}

function buildSamplePreviewOrder(): Order {
  const nowIso = new Date().toISOString();
  const datePart = nowIso.slice(0, 10).replace(/-/g, '');
  return {
    id: `ORD-${datePart}-001`,
    orderNumber: 1,
    timestamp: nowIso,
    cashierName: 'Siti Kasir',
    customerName: 'Budi',
    tableNumber: 'Meja 04',
    orderType: 'dine_in',
    items: [
      {
        product: {
          id: 'sample-1',
          name: 'Kopi Susu Gula Aren',
          category: 'Minuman',
          price: 18000,
          costPrice: 8000,
          stock: 20,
          sku: 'KOP-001',
        },
        quantity: 2,
        discount: 0,
        note: 'Es sedang',
      },
      {
        product: {
          id: 'sample-2',
          name: 'Croissant Butter',
          category: 'Snack',
          price: 22000,
          costPrice: 10000,
          stock: 15,
          sku: 'SNK-001',
        },
        quantity: 1,
        discount: 0,
      },
    ],
    subtotal: 58000,
    discount: 5800,
    discountPercent: 10,
    taxRate: 0.11,
    taxAmount: 5742,
    serviceChargeRate: 0.05,
    serviceChargeAmount: 2610,
    total: 60552,
    paymentMethod: 'cash',
    amountPaid: 100000,
    change: 39448,
    status: 'completed',
  };
}

export const ReceiptEditorModal: React.FC<ReceiptEditorModalProps> = ({
  isOpen,
  onClose,
  store,
  setStore,
  printerConfig,
  setPrinterConfig,
  previewOrder,
  isMaster,
}) => {
  const [storeName, setStoreName] = useState(store.storeName);
  const [tagline, setTagline] = useState(store.tagline);
  const [address, setAddress] = useState(store.address);
  const [phone, setPhone] = useState(store.phone);
  const [wifiName, setWifiName] = useState(store.wifiName || '');
  const [wifiPassword, setWifiPassword] = useState(store.wifiPassword || '');
  const [footerNote, setFooterNote] = useState(store.footerNote);

  const [texts, setTexts] = useState<Required<ReceiptCustomTexts>>(() =>
    resolveReceiptTexts(store)
  );
  const [printStoreLogo, setPrintStoreLogo] = useState(printerConfig.printStoreLogo);
  const [printWifiInfo, setPrintWifiInfo] = useState(printerConfig.printWifiInfo);
  const [printFooterNote, setPrintFooterNote] = useState(printerConfig.printFooterNote);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStoreName(store.storeName);
    setTagline(store.tagline);
    setAddress(store.address);
    setPhone(store.phone);
    setWifiName(store.wifiName || '');
    setWifiPassword(store.wifiPassword || '');
    setFooterNote(store.footerNote);
    setTexts(resolveReceiptTexts(store));
    setPrintStoreLogo(printerConfig.printStoreLogo);
    setPrintWifiInfo(printerConfig.printWifiInfo);
    setPrintFooterNote(printerConfig.printFooterNote);
    setErrorMsg(null);
    setSavedNotice(null);
  }, [isOpen, store, printerConfig]);

  const sampleOrder = useMemo(() => previewOrder || buildSamplePreviewOrder(), [previewOrder]);

  if (!isOpen || !isMaster) return null;

  const maxChars = getLineCharLimit(printerConfig.paperWidth, printerConfig.customCharPerLine);

  const updateTextField = (key: keyof ReceiptCustomTexts, value: string, maxLen: number) => {
    setTexts((prev) => ({
      ...prev,
      [key]: value.slice(0, maxLen),
    }));
  };

  const handleResetDefaults = () => {
    sounds.playItemBeep();
    setTexts({ ...DEFAULT_RECEIPT_TEXTS });
    setSavedNotice('Label & kata struk dikembalikan ke teks standar.');
    setTimeout(() => setSavedNotice(null), 2500);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanStoreName = storeName.trim().slice(0, 120);
    if (!cleanStoreName) {
      sounds.playError();
      setErrorMsg('Nama toko di bagian atas struk tidak boleh kosong.');
      return;
    }

    const customOnly: ReceiptCustomTexts = {};
    (Object.keys(DEFAULT_RECEIPT_TEXTS) as Array<keyof ReceiptCustomTexts>).forEach((key) => {
      const val = (texts[key] || '').trim();
      const def = DEFAULT_RECEIPT_TEXTS[key];
      if (val && val !== def) {
        customOnly[key] = val;
      }
    });

    const sanitizedTexts = sanitizeReceiptTexts(customOnly);

    setStore((prev) => ({
      ...prev,
      storeName: cleanStoreName,
      tagline: tagline.trim().slice(0, 200),
      address: address.trim().slice(0, 300),
      phone: phone.trim().slice(0, 40),
      wifiName: wifiName.trim().slice(0, 80) || undefined,
      wifiPassword: wifiPassword.trim().slice(0, 80) || undefined,
      footerNote: footerNote.slice(0, 500),
      receiptTexts: sanitizedTexts,
    }));

    setPrinterConfig((prev) => ({
      ...prev,
      printStoreLogo,
      printWifiInfo,
      printFooterNote,
    }));

    sounds.playCashRegister();
    setSavedNotice('Kata-kata struk berhasil disimpan & langsung berlaku di semua kasir!');
    setTimeout(() => {
      onClose();
    }, 650);
  };

  const liveRt: Required<ReceiptCustomTexts> = {
    headerNote: texts.headerNote.trim(),
    phoneLabel: texts.phoneLabel.trim() || DEFAULT_RECEIPT_TEXTS.phoneLabel,
    receiptNumberLabel:
      texts.receiptNumberLabel.trim() || DEFAULT_RECEIPT_TEXTS.receiptNumberLabel,
    dateLabel: texts.dateLabel.trim() || DEFAULT_RECEIPT_TEXTS.dateLabel,
    cashierLabel: texts.cashierLabel.trim() || DEFAULT_RECEIPT_TEXTS.cashierLabel,
    customerLabel: texts.customerLabel.trim() || DEFAULT_RECEIPT_TEXTS.customerLabel,
    subtotalLabel: texts.subtotalLabel.trim() || DEFAULT_RECEIPT_TEXTS.subtotalLabel,
    discountLabel: texts.discountLabel.trim() || DEFAULT_RECEIPT_TEXTS.discountLabel,
    taxLabel: texts.taxLabel.trim() || DEFAULT_RECEIPT_TEXTS.taxLabel,
    serviceLabel: texts.serviceLabel.trim() || DEFAULT_RECEIPT_TEXTS.serviceLabel,
    totalLabel: texts.totalLabel.trim() || DEFAULT_RECEIPT_TEXTS.totalLabel,
    paymentMethodLabel:
      texts.paymentMethodLabel.trim() || DEFAULT_RECEIPT_TEXTS.paymentMethodLabel,
    amountPaidLabel: texts.amountPaidLabel.trim() || DEFAULT_RECEIPT_TEXTS.amountPaidLabel,
    changeLabel: texts.changeLabel.trim() || DEFAULT_RECEIPT_TEXTS.changeLabel,
    wifiLabel: texts.wifiLabel.trim() || DEFAULT_RECEIPT_TEXTS.wifiLabel,
    wifiPasswordLabel:
      texts.wifiPasswordLabel.trim() || DEFAULT_RECEIPT_TEXTS.wifiPasswordLabel,
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Pencil className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-slate-900 text-base truncate">
                  Editor Kata-Kata Struk
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 uppercase shrink-0">
                  Khusus Master
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate">
                Ubah teks header, label rincian biaya, dan pesan bawah struk secara langsung.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold shrink-0">
            {errorMsg}
          </div>
        )}
        {savedNotice && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{savedNotice}</span>
          </div>
        )}

        {/* Two-column Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {/* Left: Editable Copy Form */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 border-b lg:border-b-0 lg:border-r border-slate-200">
            {/* Section 1: Header & Sapaan Atas */}
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700">
                  1. Bagian Atas Struk (Header)
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Nama Toko / Judul Struk *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Subjudul / Slogan Toko
                  </label>
                  <input
                    type="text"
                    maxLength={200}
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    placeholder="Contoh: Ruang Baca, Rasa & Cerita"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Alamat di Struk
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Jl. Pemuda No. 12, Yogyakarta"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Label Telepon
                  </label>
                  <input
                    type="text"
                    maxLength={30}
                    value={texts.phoneLabel}
                    onChange={(e) => updateTextField('phoneLabel', e.target.value, 30)}
                    placeholder="Telp"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Nomor Telepon / WhatsApp
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0812-3456-7890"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Catatan / Sapaan Atas Tambahan (Opsional)
                </label>
                <textarea
                  rows={2}
                  maxLength={200}
                  value={texts.headerNote}
                  onChange={(e) => updateTextField('headerNote', e.target.value, 200)}
                  placeholder="Contoh: Selamat Datang! Promo Diskon Member 10%"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Section 2: Label Info Transaksi */}
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200 space-y-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-600" />
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700">
                  2. Label Detail Transaksi
                </h4>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    No. Nota
                  </label>
                  <input
                    type="text"
                    maxLength={30}
                    value={texts.receiptNumberLabel}
                    onChange={(e) => updateTextField('receiptNumberLabel', e.target.value, 30)}
                    placeholder="No"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Tanggal
                  </label>
                  <input
                    type="text"
                    maxLength={30}
                    value={texts.dateLabel}
                    onChange={(e) => updateTextField('dateLabel', e.target.value, 30)}
                    placeholder="Tgl"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Kasir / Staff
                  </label>
                  <input
                    type="text"
                    maxLength={30}
                    value={texts.cashierLabel}
                    onChange={(e) => updateTextField('cashierLabel', e.target.value, 30)}
                    placeholder="Kasir"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Pelanggan
                  </label>
                  <input
                    type="text"
                    maxLength={30}
                    value={texts.customerLabel}
                    onChange={(e) => updateTextField('customerLabel', e.target.value, 30)}
                    placeholder="Plg"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Label Rincian Biaya & Pembayaran */}
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200 space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700">
                  3. Label Rincian Harga & Pembayaran
                </h4>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Label Subtotal
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={texts.subtotalLabel}
                    onChange={(e) => updateTextField('subtotalLabel', e.target.value, 40)}
                    placeholder="Subtotal"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Label Diskon
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={texts.discountLabel}
                    onChange={(e) => updateTextField('discountLabel', e.target.value, 40)}
                    placeholder="Diskon Nota"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Label Pajak
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={texts.taxLabel}
                    onChange={(e) => updateTextField('taxLabel', e.target.value, 40)}
                    placeholder="Pajak"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Label Layanan
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={texts.serviceLabel}
                    onChange={(e) => updateTextField('serviceLabel', e.target.value, 40)}
                    placeholder="Biaya Layanan"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Label Total Akhir
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={texts.totalLabel}
                    onChange={(e) => updateTextField('totalLabel', e.target.value, 40)}
                    placeholder="TOTAL"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Label Metode Bayar
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={texts.paymentMethodLabel}
                    onChange={(e) => updateTextField('paymentMethodLabel', e.target.value, 40)}
                    placeholder="Metode Bayar"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Label Uang Bayar
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={texts.amountPaidLabel}
                    onChange={(e) => updateTextField('amountPaidLabel', e.target.value, 40)}
                    placeholder="Nominal Bayar"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Label Kembalian
                  </label>
                  <input
                    type="text"
                    maxLength={40}
                    value={texts.changeLabel}
                    onChange={(e) => updateTextField('changeLabel', e.target.value, 40)}
                    placeholder="Kembalian"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Section 4: WiFi & Pesan Penutup (Footer) */}
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200 space-y-3">
              <div className="flex items-center gap-2">
                <Wifi className="w-4 h-4 text-emerald-600" />
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700">
                  4. Info WiFi & Ucapan Penutup (Footer)
                </h4>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Label WiFi
                  </label>
                  <input
                    type="text"
                    maxLength={30}
                    value={texts.wifiLabel}
                    onChange={(e) => updateTextField('wifiLabel', e.target.value, 30)}
                    placeholder="WiFi"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Nama WiFi
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    value={wifiName}
                    onChange={(e) => setWifiName(e.target.value)}
                    placeholder="WiFi Toko"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Label Sandi
                  </label>
                  <input
                    type="text"
                    maxLength={30}
                    value={texts.wifiPasswordLabel}
                    onChange={(e) => updateTextField('wifiPasswordLabel', e.target.value, 30)}
                    placeholder="Pass"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Password WiFi
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    value={wifiPassword}
                    onChange={(e) => setWifiPassword(e.target.value)}
                    placeholder="-"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Kata Penutup / Ucapan Bawah Struk (Bisa Multi-Baris)
                </label>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={footerNote}
                  onChange={(e) => setFooterNote(e.target.value)}
                  placeholder="Terima kasih telah berkunjung!&#10;Follow IG kami @tokoanda"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Quick Print Section Toggles */}
              <div className="flex flex-wrap gap-3 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                  <input
                    type="checkbox"
                    checked={printStoreLogo}
                    onChange={(e) => setPrintStoreLogo(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Tampilkan Logo</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                  <input
                    type="checkbox"
                    checked={printWifiInfo}
                    onChange={(e) => setPrintWifiInfo(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Tampilkan Info WiFi</span>
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                  <input
                    type="checkbox"
                    checked={printFooterNote}
                    onChange={(e) => setPrintFooterNote(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Pakai Catatan Penutup</span>
                </label>
              </div>
            </div>
          </div>

          {/* Right: Live Thermal Receipt Preview */}
          <div className="w-full lg:w-[370px] bg-slate-100 p-5 flex flex-col items-center overflow-y-auto shrink-0">
            <div className="w-full flex items-center justify-between mb-3">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                Pratinjau Langsung Struk
              </span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                {printerConfig.paperWidth} · {maxChars} kol
              </span>
            </div>

            <div
              className={`receipt-paper rounded-sm p-4 w-full ${
                printerConfig.paperWidth === '80mm' ? 'max-w-[330px]' : 'max-w-[280px]'
              } font-mono-thermal text-xs text-slate-900 border border-slate-200 shadow-md`}
            >
              <div className="receipt-cut-top -mt-4 -mx-4 mb-3"></div>

              <div className="space-y-1 text-center">
                {printStoreLogo && store.logoUrl && (
                  <div className="w-11 h-11 mx-auto mb-1.5 flex items-center justify-center grayscale contrast-150">
                    <img
                      src={store.logoUrl}
                      alt={storeName || 'Logo'}
                      className="max-h-11 max-w-11 object-contain"
                    />
                  </div>
                )}
                <div className="font-extrabold text-sm tracking-wide text-slate-900">
                  {storeName || 'NAMA TOKO'}
                </div>
                {tagline && <p className="text-[11px] text-slate-600">{tagline}</p>}
                {address && <p className="text-[10px] text-slate-500">{address}</p>}
                {phone && (
                  <p className="text-[10px] text-slate-500">
                    {liveRt.phoneLabel}: {phone}
                  </p>
                )}
                {liveRt.headerNote && (
                  <p className="text-[10px] text-slate-600 italic whitespace-pre-line pt-0.5">
                    {liveRt.headerNote}
                  </p>
                )}
              </div>

              <div className="my-2 border-t border-dashed border-slate-300" />

              <div className="text-[11px] space-y-0.5 text-slate-700 tabular-nums">
                <div className="flex justify-between gap-2">
                  <span className="break-all">
                    {liveRt.receiptNumberLabel}: #{sampleOrder.id}
                  </span>
                  <span className="shrink-0">{formatTimeOnly(sampleOrder.timestamp)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>
                    {liveRt.dateLabel}: {formatShortDate(sampleOrder.timestamp)}
                  </span>
                  <span className="text-right break-words">
                    {liveRt.cashierLabel}: {sampleOrder.cashierName}
                  </span>
                </div>
                {(sampleOrder.customerName ||
                  sampleOrder.tableNumber ||
                  sampleOrder.orderType !== 'dine_in') && (
                  <div className="flex justify-between gap-2">
                    <span className="break-words">
                      {liveRt.customerLabel}: {sampleOrder.customerName || '-'}
                    </span>
                    <span className="shrink-0">
                      {formatOrderTypeLabel(sampleOrder.orderType, sampleOrder.tableNumber)}
                    </span>
                  </div>
                )}
              </div>

              <div className="my-2 border-t border-dashed border-slate-300" />

              <div className="space-y-1 text-[11px] tabular-nums">
                {sampleOrder.items.map((item, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <div className="flex justify-between items-start gap-2 font-medium text-slate-900">
                      <span className="break-words min-w-0">
                        {item.quantity}x {item.product.name}
                      </span>
                      <span className="shrink-0 text-right">
                        {formatNumber(item.product.price * item.quantity)}
                      </span>
                    </div>
                    {item.note && (
                      <div className="text-[10px] text-slate-500 pl-3 italic break-words">
                        ↳ {item.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="my-2 border-t border-dashed border-slate-300" />

              <div className="space-y-0.5 text-[11px] text-slate-700 tabular-nums">
                <div className="flex justify-between gap-2">
                  <span>{liveRt.subtotalLabel}</span>
                  <span className="shrink-0">{formatRupiah(sampleOrder.subtotal)}</span>
                </div>
                {sampleOrder.discount > 0 && (
                  <div className="flex justify-between gap-2 text-emerald-600">
                    <span>
                      {liveRt.discountLabel} ({sampleOrder.discountPercent || 10}%)
                    </span>
                    <span className="shrink-0">-{formatRupiah(sampleOrder.discount)}</span>
                  </div>
                )}
                {sampleOrder.taxAmount > 0 && (
                  <div className="flex justify-between gap-2">
                    <span>
                      {liveRt.taxLabel} ({Math.round(sampleOrder.taxRate * 100)}%)
                    </span>
                    <span className="shrink-0">{formatRupiah(sampleOrder.taxAmount)}</span>
                  </div>
                )}
                {sampleOrder.serviceChargeAmount > 0 && (
                  <div className="flex justify-between gap-2">
                    <span>
                      {liveRt.serviceLabel} ({Math.round(sampleOrder.serviceChargeRate * 100)}%)
                    </span>
                    <span className="shrink-0">
                      {formatRupiah(sampleOrder.serviceChargeAmount)}
                    </span>
                  </div>
                )}
              </div>

              <div className="my-2 border-t-2 border-slate-800" />

              <div className="flex justify-between items-center gap-2 text-sm font-extrabold text-slate-900 tabular-nums">
                <span>{liveRt.totalLabel}</span>
                <span className="text-base">{formatRupiah(sampleOrder.total)}</span>
              </div>

              <div className="my-2 border-t border-dashed border-slate-300" />

              <div className="text-[11px] space-y-0.5 text-slate-700 tabular-nums">
                <div className="flex justify-between gap-2">
                  <span>{liveRt.paymentMethodLabel}</span>
                  <span className="font-semibold uppercase">
                    {formatPaymentMethodLabel(sampleOrder.paymentMethod)}
                  </span>
                </div>
                {sampleOrder.paymentMethod === 'cash' && (
                  <>
                    <div className="flex justify-between gap-2">
                      <span>{liveRt.amountPaidLabel}</span>
                      <span>{formatRupiah(sampleOrder.amountPaid)}</span>
                    </div>
                    <div className="flex justify-between gap-2 font-medium">
                      <span>{liveRt.changeLabel}</span>
                      <span>{formatRupiah(sampleOrder.change)}</span>
                    </div>
                  </>
                )}
              </div>

              <div className="my-2 border-t border-dashed border-slate-300" />

              <div className="text-center text-[10px] text-slate-600 space-y-1 pt-1">
                {printWifiInfo && wifiName.trim() && (
                  <p className="break-words">
                    {liveRt.wifiLabel}: <span className="font-bold">{wifiName}</span> |{' '}
                    {liveRt.wifiPasswordLabel}:{' '}
                    <span className="font-bold">{wifiPassword || '-'}</span>
                  </p>
                )}
                {printFooterNote && footerNote.trim() ? (
                  <div className="whitespace-pre-line break-words">{footerNote}</div>
                ) : (
                  <>
                    <p>Terima Kasih Atas Kunjungan Anda!</p>
                    <p>Barang yang dibeli tidak dapat ditukar</p>
                  </>
                )}
              </div>

              <div className="receipt-cut-bottom -mb-4 -mx-4 mt-3"></div>
            </div>
          </div>

          {/* Sticky Bottom Footer inside Form? Put outside or render cleanly */}
          <button type="submit" className="hidden" aria-hidden="true" />
        </form>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-semibold transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Kata Default</span>
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={(e) => {
                handleSave(e as unknown as React.FormEvent);
              }}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all active:scale-[0.98] cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Simpan Kata Struk</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
