/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  AlertCircle,
  Bluetooth,
  BluetoothConnected,
  BluetoothOff,
  CheckCircle2,
  HelpCircle,
  Laptop,
  Power,
  Printer,
  RefreshCw,
  RotateCw,
  Settings,
  Smartphone,
  Sliders,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import { PaperWidth, PrinterConfig, StoreProfile } from '../types/pos';
import { bluetoothPrinter, BluetoothPrinterState } from '../utils/bluetoothThermalPrinter';
import { sounds } from '../utils/soundEffects';

interface PrinterSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  printerConfig: PrinterConfig;
  setPrinterConfig: React.Dispatch<React.SetStateAction<PrinterConfig>>;
  printerState: BluetoothPrinterState;
  store: StoreProfile;
}

export const PrinterSettingsModal: React.FC<PrinterSettingsModalProps> = ({
  isOpen,
  onClose,
  printerConfig,
  setPrinterConfig,
  printerState,
  store,
}) => {
  const [connecting, setConnecting] = useState(false);
  const [testPrinting, setTestPrinting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!isOpen) return null;

  const handleConnect = async () => {
    setConnecting(true);
    setFeedback(null);

    const res = await bluetoothPrinter.connect();
    setConnecting(false);

    if (res.success) {
      setPrinterConfig((prev) => ({
        ...prev,
        connectedDeviceName: res.deviceName || 'Printer Bluetooth',
      }));
      setFeedback({
        type: 'success',
        message: `Berhasil terhubung ke "${res.deviceName || 'Printer Bluetooth'}"!`,
      });
      sounds.playThermalTick();
    } else {
      setFeedback({
        type: 'error',
        message: res.error || 'Gagal mencari perangkat printer.',
      });
    }
  };

  const handleDisconnect = async () => {
    await bluetoothPrinter.disconnect();
    setPrinterConfig((prev) => ({
      ...prev,
      connectedDeviceName: null,
    }));
    setFeedback({
      type: 'success',
      message: 'Koneksi printer Bluetooth telah diputus.',
    });
  };

  const handleTestPrint = async () => {
    setTestPrinting(true);
    setFeedback(null);

    try {
      if (printerState.isConnected) {
        const bytes = bluetoothPrinter.generateTestBytes(store, printerConfig);
        await bluetoothPrinter.sendRawData(bytes);
        sounds.playThermalTick();
        setFeedback({
          type: 'success',
          message: 'Halaman tes berhasil dikirim ke printer Bluetooth!',
        });
      } else {
        // Fallback test sound & virtual simulation
        sounds.playThermalTick();
        setFeedback({
          type: 'success',
          message: 'Simulasi cetak tes berhasil (Printer fisik belum terhubung).',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Gagal mengirim cetak tes.',
      });
    } finally {
      setTestPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Bluetooth className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Pengaturan Printer Thermal Bluetooth</h3>
              <p className="text-xs text-slate-500">Koneksi Web Bluetooth API & Pengaturan Ukuran Kertas</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {/* Feedback alert */}
          {feedback && (
            <div
              className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs font-medium ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
          )}

          {/* Connection Status Box */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    printerState.isConnected
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {printerState.isConnected ? (
                    <BluetoothConnected className="w-5 h-5" />
                  ) : (
                    <BluetoothOff className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">
                      {printerState.isConnected ? printerState.deviceName : 'Belum Terhubung'}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        printerState.isConnected
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {printerState.isConnected ? 'Aktif (Ready)' : 'Offline'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {printerState.isConnected
                      ? 'Siap mencetak struk transaksi & laporan kasir.'
                      : 'Pastikan printer thermal menyala dan Bluetooth aktif.'}
                  </p>
                </div>
              </div>

              {/* Action: Connect / Disconnect */}
              {printerState.isConnected ? (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold text-xs transition-colors"
                >
                  Putus Koneksi
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={connecting}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all active:scale-[0.98] disabled:opacity-70"
                >
                  {connecting ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Mencari...</span>
                    </>
                  ) : (
                    <>
                      <Bluetooth className="w-3.5 h-3.5" />
                      <span>Cari & Sambungkan</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Test Print button */}
            <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between">
              <span className="text-xs text-slate-600">Uji coba cetak strip teks:</span>
              <button
                type="button"
                onClick={handleTestPrint}
                disabled={testPrinting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold shadow-xs transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Halaman Tes</span>
              </button>
            </div>
          </div>

          {/* Paper Size Configuration */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Ukuran Kertas Thermal
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => setPrinterConfig((prev) => ({ ...prev, paperWidth: '58mm' }))}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  printerConfig.paperWidth === '58mm'
                    ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm text-slate-900">58 mm (Standar)</span>
                  <span className="text-[10px] font-mono bg-slate-200 px-1.5 py-0.5 rounded">32 Kolom</span>
                </div>
                <p className="text-xs text-slate-500">
                  Paling populer untuk printer Bluetooth saku / portable mini POS (Panda, Eppos, Iware, POS-58).
                </p>
              </div>

              <div
                onClick={() => setPrinterConfig((prev) => ({ ...prev, paperWidth: '80mm' }))}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  printerConfig.paperWidth === '80mm'
                    ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm text-slate-900">80 mm (Lebar)</span>
                  <span className="text-[10px] font-mono bg-slate-200 px-1.5 py-0.5 rounded">48 Kolom</span>
                </div>
                <p className="text-xs text-slate-500">
                  Untuk printer kasir desktop besar restoran atau mini market dengan ruang cetak lebih luas.
                </p>
              </div>
            </div>
          </div>

          {/* Toggles & Preferences */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Preferensi Cetak Otomatis
            </label>
            <div className="space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-700">
              <label className="flex items-center justify-between cursor-pointer py-1">
                <span>Otomatis cetak struk setelah kasir menekan tombol bayar</span>
                <input
                  type="checkbox"
                  checked={printerConfig.autoPrintOnPayment}
                  onChange={(e) =>
                    setPrinterConfig((prev) => ({ ...prev, autoPrintOnPayment: e.target.checked }))
                  }
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer py-1 border-t border-slate-200/60">
                <span>Kirim perintah potong kertas otomatis (Auto Cut Paper)</span>
                <input
                  type="checkbox"
                  checked={printerConfig.autoCutPaper}
                  onChange={(e) =>
                    setPrinterConfig((prev) => ({ ...prev, autoCutPaper: e.target.checked }))
                  }
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer py-1 border-t border-slate-200/60">
                <span>Buka laci uang kasir (Kick Cash Drawer) saat transaksi tunai</span>
                <input
                  type="checkbox"
                  checked={printerConfig.openCashDrawer}
                  onChange={(e) =>
                    setPrinterConfig((prev) => ({ ...prev, openCashDrawer: e.target.checked }))
                  }
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer py-1 border-t border-slate-200/60">
                <span>Cetak info WiFi toko pada bagian bawah struk</span>
                <input
                  type="checkbox"
                  checked={printerConfig.printWifiInfo}
                  onChange={(e) =>
                    setPrinterConfig((prev) => ({ ...prev, printWifiInfo: e.target.checked }))
                  }
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                />
              </label>
            </div>
          </div>

          {/* Bluetooth Pairing Guide */}
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 space-y-2">
            <div className="flex items-center gap-1.5 font-bold">
              <HelpCircle className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Petunjuk Menghubungkan Printer Bluetooth:</span>
            </div>
            <ol className="list-decimal pl-4 space-y-1 text-blue-800">
              <li>Nyalakan printer Bluetooth (tekan tombol Power hingga lampu LED menyala).</li>
              <li>Jika menggunakan HP Android, pasangkan (pair) terlebih dahulu di menu Bluetooth HP dengan PIN <b>0000</b> atau <b>1234</b>.</li>
              <li>Klik tombol <b>&quot;Cari & Sambungkan&quot;</b> di atas, pilih printer dari jendela browser pop-up.</li>
              <li>Dukungan browser: Google Chrome di Android, Windows, Mac, atau browser berbasis Chromium.</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-colors"
          >
            Selesai & Simpan
          </button>
        </div>
      </div>
    </div>
  );
};
