/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  costPrice: number; // HPP (Harga Pokok Penjualan)
  stock: number;
  sku: string;
  image?: string;
  description?: string;
  color?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  note?: string;
  discount: number; // Diskon item (Rp)
}

export type PaymentMethod = 'cash' | 'qris' | 'transfer' | 'debit' | 'credit';

export interface Order {
  id: string; // e.g. "ORD-20261102-001"
  orderNumber: number;
  timestamp: string; // ISO string
  cashierName: string;
  customerName?: string;
  tableNumber?: string;
  orderType: 'dine_in' | 'takeaway' | 'delivery';
  items: CartItem[];
  subtotal: number;
  discount: number; // Global discount (Rp)
  discountPercent?: number; // Global discount percentage (e.g. 10 for 10%)
  taxRate: number; // e.g. 0.11 for 11%
  taxAmount: number;
  serviceChargeRate: number; // e.g. 0.05
  serviceChargeAmount: number;
  total: number;
  paymentMethod: PaymentMethod;
  amountPaid: number;
  change: number; // Kembalian
  status: 'completed' | 'cancelled' | 'refunded';
  notes?: string;
}

export interface ReceiptCustomTexts {
  headerNote?: string;
  phoneLabel?: string;
  receiptNumberLabel?: string;
  dateLabel?: string;
  cashierLabel?: string;
  customerLabel?: string;
  subtotalLabel?: string;
  discountLabel?: string;
  taxLabel?: string;
  serviceLabel?: string;
  totalLabel?: string;
  paymentMethodLabel?: string;
  amountPaidLabel?: string;
  changeLabel?: string;
  wifiLabel?: string;
  wifiPasswordLabel?: string;
}

export interface StoreProfile {
  storeName: string;
  tagline: string;
  address: string;
  phone: string;
  instagram?: string;
  wifiName?: string;
  wifiPassword?: string;
  footerNote: string;
  logoUrl?: string;
  qrisImageUrl?: string; // Base64 data URL or image link for Store QRIS
  qrisMerchantName?: string;
  qrisNmid?: string;
  enableTax: boolean;
  taxPercentage: number;
  enableServiceCharge: boolean;
  serviceChargePercentage: number;
  lowStockThreshold?: number; // Configurable stock threshold (default: 10)
  currency: string;
  receiptTexts?: ReceiptCustomTexts;
}

export type PaperWidth = '58mm' | '80mm';

export interface PrinterConfig {
  paperWidth: PaperWidth;
  connectedDeviceName: string | null;
  autoPrintOnPayment: boolean;
  autoCutPaper: boolean;
  openCashDrawer: boolean;
  printStoreLogo: boolean;
  printFooterNote: boolean;
  printWifiInfo: boolean;
  isSimulationMode: boolean;
  customCharPerLine?: number; // 32 for 58mm, 48 for 80mm
}

export interface DailySalesReport {
  date: string; // YYYY-MM-DD
  totalTransactions: number;
  totalGrossSales: number; // Omset kotor
  totalNetSales: number; // Penjualan bersih setelah diskon
  totalCost: number; // Total HPP
  totalProfit: number; // Laba kotor
  totalDiscounts: number;
  totalTax: number;
  totalServiceCharge: number;
  totalItemsSold: number;
  averageOrderValue: number;
  paymentBreakdown: {
    cash: { count: number; total: number };
    qris: { count: number; total: number };
    transfer: { count: number; total: number };
    debit: { count: number; total: number };
    credit: { count: number; total: number };
  };
  topProducts: {
    id: string;
    name: string;
    quantity: number;
    totalRevenue: number;
  }[];
  hourlySales: {
    hour: string; // e.g. "08:00", "09:00"
    total: number;
    count: number;
  }[];
  transactions: Order[];
}

export type UserRole = 'master' | 'cashier';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

export interface CashierClosing {
  id: string;
  date: string; // YYYY-MM-DD
  closedAt: string; // ISO string
  cashierUid?: string;
  cashierName: string;
  shiftLabel?: string;
  openingCash: number;
  cashOut: number;
  cashOutNote?: string;
  systemCashSales: number;
  systemNonCashSales: number;
  qrisSales: number;
  transferSales: number;
  cardSales: number;
  totalSales: number;
  totalDiscounts: number;
  totalTax: number;
  totalServiceCharge: number;
  totalTransactions: number;
  totalItemsSold: number;
  expectedCash: number;
  actualCash: number;
  cashDifference: number;
  notes?: string;
  status: 'closed';
}

export type ActiveTab =
  | 'pos'
  | 'closing'
  | 'reports'
  | 'history'
  | 'products'
  | 'users'
  | 'settings'
  | 'logo';
