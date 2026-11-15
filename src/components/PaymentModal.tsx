/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Eye,
  Image as ImageIcon,
  Maximize2,
  QrCode,
  Receipt,
  RotateCcw,
  Smartphone,
  Trash2,
  Upload,
  Wallet,
  X,
  ZoomIn,
} from 'lucide-react';
import { CartItem, PaymentMethod, PrinterConfig, StoreProfile } from '../types/pos';
import { formatNumber, formatRupiah } from '../utils/formatters';
import { getStoreQrisImageDataUrl } from '../utils/qrCodeGenerator';
import { sounds } from '../utils/soundEffects';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  subtotal: number;
  discount: number;
  discountPercent?: number;
  taxAmount: number;
  taxRate: number;
  serviceChargeAmount: number;
  serviceChargeRate: number;
  total: number;
  customerName: string;
  tableNumber: string;
  orderType: 'dine_in' | 'takeaway' | 'delivery';
  cashierName: string;
  store: StoreProfile;
  printerConfig: PrinterConfig;
  isMaster?: boolean;
  defaultPaymentMethod?: PaymentMethod;
  onUpdateStore?: React.Dispatch<React.SetStateAction<StoreProfile>>;
  onCompleteOrder: (paymentDetails: {
    paymentMethod: PaymentMethod;
    amountPaid: number;
    change: number;
    shouldAutoPrint: boolean;
  }) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  cart,
  subtotal,
  discount,
  discountPercent,
  taxAmount,
  taxRate,
  serviceChargeAmount,
  serviceChargeRate,
  total,
  customerName,
  tableNumber,
  orderType,
  cashierName,
  store,
  printerConfig,
  isMaster = true,
  defaultPaymentMethod = 'cash',
  onUpdateStore,
  onCompleteOrder,
}) => {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(defaultPaymentMethod);
  const [cashGiven, setCashGiven] = useState<number>(total);
  const [cashInputString, setCashInputString] = useState<string>(String(total));
  const [shouldAutoPrint, setShouldAutoPrint] = useState<boolean>(printerConfig.autoPrintOnPayment);
  const [showKeypad, setShowKeypad] = useState<boolean>(true);
  const [isQrisEnlarged, setIsQrisEnlarged] = useState<boolean>(false);
  const [confirmRemoveQris, setConfirmRemoveQris] = useState<boolean>(false);
  const [resolvedQrisUrl, setResolvedQrisUrl] = useState<string>(store.qrisImageUrl || '');
  const qrisFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void getStoreQrisImageDataUrl(store)
      .then((url) => {
        if (active) setResolvedQrisUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [store.qrisImageUrl, store.qrisMerchantName, store.storeName, store.qrisNmid]);

  useEffect(() => {
    if (isOpen) {
      setPaymentMethod(defaultPaymentMethod);
      setCashGiven(total);
      setCashInputString(String(total));
      setShouldAutoPrint(printerConfig.autoPrintOnPayment);
      setIsQrisEnlarged(false);
      setConfirmRemoveQris(false);
    }
  }, [isOpen, total, printerConfig.autoPrintOnPayment, defaultPaymentMethod]);

  if (!isOpen) return null;

  const handleNumpadPress = (val: string) => {
    sounds.playItemBeep();
    if (val === 'C') {
      setCashGiven(0);
      setCashInputString('0');
    } else if (val === '⌫') {
      const nextStr = cashInputString.length > 1 ? cashInputString.slice(0, -1) : '0';
      setCashInputString(nextStr);
      setCashGiven(parseInt(nextStr, 10) || 0);
    } else if (val === '+10rb') {
      const nextVal = cashGiven + 10000;
      setCashGiven(nextVal);
      setCashInputString(String(nextVal));
    } else if (val === '+20rb') {
      const nextVal = cashGiven + 20000;
      setCashGiven(nextVal);
      setCashInputString(String(nextVal));
    } else if (val === '+50rb') {
      const nextVal = cashGiven + 50000;
      setCashGiven(nextVal);
      setCashInputString(String(nextVal));
    } else if (val === '000') {
      if (cashInputString !== '0' && cashInputString.length < 9) {
        const nextStr = cashInputString + '000';
        setCashInputString(nextStr);
        setCashGiven(parseInt(nextStr, 10) || 0);
      }
    } else {
      // Digits 0-9
      if (cashInputString.length < 10) {
        const nextStr = cashInputString === '0' ? val : cashInputString + val;
        setCashInputString(nextStr);
        setCashGiven(parseInt(nextStr, 10) || 0);
      }
    }
  };

  const handleQrisFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64 && onUpdateStore) {
        onUpdateStore((prev) => ({
          ...prev,
          qrisImageUrl: base64,
        }));
        sounds.playItemBeep();
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveQris = () => {
    if (onUpdateStore) {
      onUpdateStore((prev) => ({
        ...prev,
        qrisImageUrl: undefined,
      }));
      sounds.playError();
    }
    setConfirmRemoveQris(false);
  };

  const change = Math.max(0, cashGiven - total);
  const isCashInsufficient = paymentMethod === 'cash' && cashGiven < total;

  // Generate smart quick cash suggestions
  const getQuickNominals = (amount: number): number[] => {
    const list = new Set<number>();
    list.add(amount); // Uang Pas

    // Round up to nearest 10k, 20k, 50k, 100k
    const roundTo = (val: number, step: number) => Math.ceil(val / step) * step;

    if (amount <= 50000) {
      list.add(50000);
      list.add(100000);
    } else if (amount <= 100000) {
      list.add(roundTo(amount, 10000));
      list.add(100000);
      list.add(150000);
      list.add(200000);
    } else {
      list.add(roundTo(amount, 50000));
      list.add(roundTo(amount, 100000));
      list.add(Math.ceil(amount / 100000) * 100000 + 50000);
    }

    return Array.from(list).sort((a, b) => a - b).slice(0, 5);
  };

  const quickNominals = getQuickNominals(total);

  const handleCashSelect = (val: number) => {
    setCashGiven(val);
    setCashInputString(String(val));
    sounds.playItemBeep();
  };

  const handleCustomCashInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    const num = Number(raw) || 0;
    setCashInputString(raw);
    setCashGiven(num);
  };

  const handleFinish = () => {
    if (isCashInsufficient) {
      sounds.playError();
      return;
    }

    // Play pleasant cash register sound
    sounds.playCashRegister();

    // Trigger confetti celebration
    try {
      confetti({
        particleCount: 60,
        spread: 60,
        origin: { y: 0.6 },
      });
    } catch {
      // ignore
    }

    onCompleteOrder({
      paymentMethod,
      amountPaid: paymentMethod === 'cash' ? cashGiven : total,
      change: paymentMethod === 'cash' ? change : 0,
      shouldAutoPrint,
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-3xl max-w-xl md:max-w-2xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">Pembayaran Pesanan</h3>
            <p className="text-xs text-slate-500">
              {cart.reduce((sum, i) => sum + i.quantity, 0)} Item • {customerName || 'Pelanggan Walk-In'} •{' '}
              {tableNumber ? `Meja ${tableNumber}` : orderType === 'takeaway' ? 'Bungkus' : 'Dine-In'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Total Bill Display */}
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-500/15">
            <span className="text-xs uppercase tracking-wider font-semibold opacity-90">Total Tagihan</span>
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-1">{formatRupiah(total)}</div>
            {discount > 0 && (
              <div className="mt-2 text-xs bg-white/20 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium">
                <span>Hemat {formatRupiah(discount)}</span>
                <span className="bg-white/25 px-1.5 py-0.5 rounded text-[11px] font-bold">
                  Diskon {discountPercent ? `${discountPercent}%` : `${Math.round((discount / (subtotal || 1)) * 100)}%`}
                </span>
              </div>
            )}
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              Pilih Metode Pembayaran
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('cash');
                  sounds.playItemBeep();
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                  paymentMethod === 'cash'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20 font-bold'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Banknote className="w-5 h-5 mb-1 text-emerald-600" />
                <span className="text-xs">Tunai (Cash)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('qris');
                  sounds.playItemBeep();
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                  paymentMethod === 'qris'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20 font-bold'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <QrCode className="w-5 h-5 mb-1 text-teal-600" />
                <span className="text-xs">QRIS Digital</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('transfer');
                  sounds.playItemBeep();
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                  paymentMethod === 'transfer'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20 font-bold'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Smartphone className="w-5 h-5 mb-1 text-blue-600" />
                <span className="text-xs">Transfer Bank</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setPaymentMethod('debit');
                  sounds.playItemBeep();
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                  paymentMethod === 'debit'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20 font-bold'
                    : 'border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <CreditCard className="w-5 h-5 mb-1 text-purple-600" />
                <span className="text-xs">Kartu Debit/EDC</span>
              </button>
            </div>
          </div>

          {/* Dynamic Content Based on Payment Method */}
          {paymentMethod === 'cash' ? (
            <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              {/* Quick Nominal Buttons */}
              <div>
                <span className="text-xs text-slate-500 font-medium block mb-2">Pilihan Nominal Cepat:</span>
                <div className="flex flex-wrap gap-2">
                  {quickNominals.map((nom) => (
                    <button
                      key={nom}
                      type="button"
                      onClick={() => handleCashSelect(nom)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        cashGiven === nom
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {nom === total ? 'Uang Pas' : formatNumber(nom)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Cash Input & Kembalian */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Uang Diterima (Rp)
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowKeypad(!showKeypad)}
                      className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                    >
                      <span>{showKeypad ? 'Sembunyikan Keypad' : 'Tampilkan Keypad Sentuh'}</span>
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-bold text-sm">
                      Rp
                    </span>
                    <input
                      type="text"
                      value={cashInputString}
                      onChange={handleCustomCashInput}
                      className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm sm:text-base font-mono"
                      placeholder="0"
                    />
                  </div>
                  {isCashInsufficient && (
                    <p className="text-[11px] text-rose-600 font-medium mt-1">
                      Uang diterima kurang sebesar {formatRupiah(total - cashGiven)}
                    </p>
                  )}
                </div>

                {/* Kembalian / Change */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kembalian
                  </label>
                  <div
                    className={`p-2.5 rounded-xl border font-bold text-lg flex items-center justify-between ${
                      change > 0
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-white border-slate-200 text-slate-700'
                    }`}
                  >
                    <span className="font-mono">{formatRupiah(change)}</span>
                    {change === 0 && <span className="text-xs font-normal text-slate-500">Uang Pas</span>}
                  </div>
                </div>
              </div>

              {/* Tablet On-Screen Touch Numpad */}
              {showKeypad && (
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Keypad Layar Sentuh Tablet (Cepat & Tanpa Keyboard HP)
                    </span>
                    <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Mode POS Tablet
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
                    {[
                      { label: '1', val: '1', style: 'bg-white text-slate-800 border-slate-200' },
                      { label: '2', val: '2', style: 'bg-white text-slate-800 border-slate-200' },
                      { label: '3', val: '3', style: 'bg-white text-slate-800 border-slate-200' },
                      { label: '+10rb', val: '+10rb', style: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold' },
                      { label: '4', val: '4', style: 'bg-white text-slate-800 border-slate-200' },
                      { label: '5', val: '5', style: 'bg-white text-slate-800 border-slate-200' },
                      { label: '6', val: '6', style: 'bg-white text-slate-800 border-slate-200' },
                      { label: '+20rb', val: '+20rb', style: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold' },
                      { label: '7', val: '7', style: 'bg-white text-slate-800 border-slate-200' },
                      { label: '8', val: '8', style: 'bg-white text-slate-800 border-slate-200' },
                      { label: '9', val: '9', style: 'bg-white text-slate-800 border-slate-200' },
                      { label: '+50rb', val: '+50rb', style: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold' },
                      { label: 'C', val: 'C', style: 'bg-rose-50 text-rose-700 border-rose-200 font-bold' },
                      { label: '0', val: '0', style: 'bg-white text-slate-800 border-slate-200 font-bold' },
                      { label: '000', val: '000', style: 'bg-white text-slate-800 border-slate-200 font-bold' },
                      { label: '⌫ Hapus', val: '⌫', style: 'bg-slate-200 text-slate-700 border-slate-300 font-bold' },
                    ].map((btn) => (
                      <button
                        key={btn.label}
                        type="button"
                        onClick={() => handleNumpadPress(btn.val)}
                        className={`py-3 px-2 rounded-xl text-sm sm:text-base font-semibold border shadow-2xs hover:brightness-95 active:scale-95 transition-all flex items-center justify-center cursor-pointer select-none ${btn.style}`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : paymentMethod === 'qris' ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col items-center text-center space-y-3">
              {/* Hidden file input for uploading QRIS image */}
              <input
                type="file"
                ref={qrisFileInputRef}
                accept="image/*"
                onChange={handleQrisFileUpload}
                className="hidden"
              />

              {resolvedQrisUrl ? (
                /* Display Unified Store QRIS (Uploaded or Store Default) */
                <div className="w-full flex flex-col items-center">
                  <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 w-full max-w-xs relative group">
                    {/* Header banner like genuine Indonesian QRIS */}
                    <div className="bg-red-600 text-white rounded-t-xl py-1 px-3 flex items-center justify-between mb-2">
                      <span className="font-extrabold text-[11px] tracking-wider">QRIS</span>
                      <span className="text-[9px] font-semibold opacity-90">PEMBAYARAN NASIONAL</span>
                    </div>

                    {/* Merchant Name */}
                    <div className="text-center mb-1.5">
                      <h4 className="font-bold text-xs text-slate-900 truncate">
                        {store.qrisMerchantName || store.storeName}
                      </h4>
                      <p className="text-[10px] text-slate-500 font-mono">
                        NMID: {store.qrisNmid || 'ID102003004005'}
                      </p>
                    </div>

                    {/* QRIS Image */}
                    <div
                      onClick={() => setIsQrisEnlarged(true)}
                      className="cursor-pointer relative overflow-hidden rounded-xl border border-slate-100 flex items-center justify-center bg-slate-50 min-h-[180px] max-h-[220px]"
                      title="Klik untuk memperbesar QRIS"
                    >
                      <img
                        src={resolvedQrisUrl}
                        alt="QRIS Toko"
                        className="w-full max-h-[220px] object-contain"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-semibold gap-1.5 transition-opacity">
                        <ZoomIn className="w-4 h-4" />
                        <span>Klik Perbesar</span>
                      </div>
                    </div>

                    {/* Total Amount Tag */}
                    <div className="mt-2.5 bg-emerald-50 border border-emerald-200 rounded-xl p-2 text-center">
                      <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Bayar:</span>
                      <span className="text-base font-extrabold text-emerald-800">{formatRupiah(total)}</span>
                    </div>

                    <div className="mt-1 text-[10px] text-slate-400">
                      Mendukung BCA, GoPay, OVO, Dana, ShopeePay, LinkAja, dll.
                    </div>
                  </div>

                  {/* Actions for QRIS */}
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-2.5">
                    <button
                      type="button"
                      onClick={() => setIsQrisEnlarged(true)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span>Perbesar QR</span>
                    </button>

                    {isMaster && (
                      <>
                        <button
                          type="button"
                          onClick={() => qrisFileInputRef.current?.click()}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs font-semibold border border-teal-200 transition-colors cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>{store.qrisImageUrl ? 'Ganti Gambar' : 'Unggah Foto QRIS'}</span>
                        </button>

                        {store.qrisImageUrl && (
                          confirmRemoveQris ? (
                            <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
                              <button
                                type="button"
                                onClick={handleRemoveQris}
                                className="text-[11px] font-bold text-rose-700 hover:text-rose-900 cursor-pointer"
                              >
                                Hapus?
                              </button>
                              <span className="text-slate-300">|</span>
                              <button
                                type="button"
                                onClick={() => setConfirmRemoveQris(false)}
                                className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveQris(true)}
                              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Hapus gambar QRIS khusus"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-sm flex flex-col items-center py-4 space-y-2 text-xs text-slate-500">
                  <QrCode className="w-8 h-8 text-teal-600 animate-pulse" />
                  <span>Menyiapkan QRIS Toko...</span>
                </div>
              )}
            </div>
          ) : paymentMethod === 'transfer' ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs text-slate-700">
              <p className="font-bold text-slate-800">Rekening Tujuan Pembayaran:</p>
              <div className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center">
                <div>
                  <span className="font-bold text-blue-700">BCA</span>: 8820-1234-5678
                  <p className="text-[11px] text-slate-500">a.n. {store.storeName}</p>
                </div>
                <span className="font-bold text-slate-900">{formatRupiah(total)}</span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2">
              <p className="font-bold text-slate-800">Instruksi Mesin EDC:</p>
              <p className="text-slate-600">
                Silakan gesek/tap kartu pelanggan pada mesin EDC dengan nominal tagihan:
              </p>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-extrabold text-base text-slate-900 text-center">
                {formatRupiah(total)}
              </div>
            </div>
          )}

          {/* Options: Auto Print */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={shouldAutoPrint}
                onChange={(e) => setShouldAutoPrint(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
              />
              <Receipt className="w-4 h-4 text-emerald-600" />
              <span>Otomatis cetak struk ke printer thermal Bluetooth</span>
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-100 transition-colors"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={handleFinish}
            disabled={isCashInsufficient}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-6 rounded-xl font-bold text-sm text-white shadow-md transition-all ${
              isCashInsufficient
                ? 'bg-slate-300 cursor-not-allowed text-slate-500 shadow-none'
                : 'bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98]'
            }`}
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>Selesaikan & Proses Struk</span>
          </button>
        </div>
      </div>

      {/* Enlarged QRIS Pop-up for Customer Scan */}
      {isQrisEnlarged && resolvedQrisUrl && (
        <div
          onClick={() => setIsQrisEnlarged(false)}
          className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl relative animate-in zoom-in-95 duration-150"
          >
            <button
              onClick={() => setIsQrisEnlarged(false)}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>

            {/* QRIS Red Banner */}
            <div className="bg-red-600 text-white rounded-t-2xl py-2 px-4 flex items-center justify-between mb-3">
              <span className="font-extrabold text-sm tracking-wider">QRIS</span>
              <span className="text-[10px] font-semibold opacity-95">PEMBAYARAN NASIONAL</span>
            </div>

            <h3 className="font-bold text-base text-slate-900">{store.qrisMerchantName || store.storeName}</h3>
            <p className="text-xs text-slate-500 font-mono mt-0.5">NMID: {store.qrisNmid || 'ID102003004005'}</p>

            <div className="my-3 p-2 bg-white rounded-2xl border-2 border-slate-200 flex items-center justify-center">
              <img
                src={resolvedQrisUrl}
                alt="QRIS Toko Full"
                className="w-full max-h-[340px] object-contain rounded-xl"
              />
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 mb-2">
              <span className="text-xs text-slate-600 font-medium block">Total yang Harus Dibayar:</span>
              <span className="text-2xl font-black text-emerald-800">{formatRupiah(total)}</span>
            </div>

            <p className="text-[11px] text-slate-500">
              Arahkan kamera smartphone pelanggan ke kode QR di atas untuk membayar.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
