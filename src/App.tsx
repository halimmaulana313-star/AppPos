/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, LogOut, Menu, QrCode, ShoppingBag } from 'lucide-react';
import { CashierPOSView } from './components/CashierPOSView';
import { CustomerOrderPortal } from './components/CustomerOrderPortal';
import { DailyReportsView } from './components/DailyReportsView';
import { LoginPage } from './components/LoginPage';
import { LogoManagementView } from './components/LogoManagementView';
import { Navbar } from './components/Navbar';
import { OnlineOrdersView } from './components/OnlineOrdersView';
import { PaymentModal } from './components/PaymentModal';
import { PrinterSettingsModal } from './components/PrinterSettingsModal';
import { ProductManagementView } from './components/ProductManagementView';
import { ReceiptModal } from './components/ReceiptModal';
import { ReportReceiptModal } from './components/ReportReceiptModal';
import { SettingsView } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';
import { TableQRView } from './components/TableQRView';
import { TransactionHistoryView } from './components/TransactionHistoryView';
import { UserManagementView } from './components/UserManagementView';
import {
  ActiveTab,
  AppUser,
  CartItem,
  DailySalesReport,
  OnlineOrder,
  Order,
  PaymentMethod,
  PrinterConfig,
  Product,
  StoreProfile,
} from './types/pos';
import {
  bluetoothPrinter,
  BluetoothPrinterState,
} from './utils/bluetoothThermalPrinter';
import { onlineOrdersManager, PaidPosEvent } from './utils/onlineOrdersManager';
import {
  DEFAULT_PRINTER_CONFIG,
  DEFAULT_STORE_PROFILE,
  DEFAULT_USERS,
  INITIAL_PRODUCTS,
  getInitialOrders,
} from './utils/initialData';
import { formatRupiah, getLocalDateString } from './utils/formatters';
import { sounds } from './utils/soundEffects';

const STORAGE_KEY_STORE = 'kasirku_store_v1';
const STORAGE_KEY_PRODUCTS = 'kasirku_products_v1';
const STORAGE_KEY_ORDERS = 'kasirku_orders_v1';
const STORAGE_KEY_PRINTER = 'kasirku_printer_v1';
const STORAGE_KEY_USERS = 'kasirku_users_v1';
const STORAGE_KEY_AUTH = 'kasirku_auth_user_v1';

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<ActiveTab>('pos');

  // Authentication State
  const [users, setUsers] = useState<AppUser[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_USERS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Ensure master email/password exists
          const hasMaster = parsed.some((u) => u.email === 'kopiliterasi12@gmail.com');
          if (hasMaster) return parsed;
        }
      }
      return DEFAULT_USERS;
    } catch {
      return DEFAULT_USERS;
    }
  });

  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_AUTH);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // Persistent States
  const [store, setStore] = useState<StoreProfile>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_STORE);
      return saved ? JSON.parse(saved) : DEFAULT_STORE_PROFILE;
    } catch {
      return DEFAULT_STORE_PROFILE;
    }
  });

  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PRODUCTS);
      return saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
    } catch {
      return INITIAL_PRODUCTS;
    }
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ORDERS);
      return saved ? JSON.parse(saved) : getInitialOrders();
    } catch {
      return getInitialOrders();
    }
  });

  const [printerConfig, setPrinterConfig] = useState<PrinterConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PRINTER);
      return saved ? JSON.parse(saved) : DEFAULT_PRINTER_CONFIG;
    } catch {
      return DEFAULT_PRINTER_CONFIG;
    }
  });

  // Bluetooth Manager State
  const [printerState, setPrinterState] = useState<BluetoothPrinterState>(bluetoothPrinter.getState());

  useEffect(() => {
    const unsubscribe = bluetoothPrinter.subscribe((state) => {
      setPrinterState(state);
    });
    return () => unsubscribe();
  }, []);

  // Save to LocalStorage safely (guard against quota exceeded errors on large images)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_STORE, JSON.stringify(store));
    } catch (err) {
      console.warn('Gagal menyimpan store ke localStorage:', err);
    }
  }, [store]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(products));
    } catch (err) {
      console.warn('Gagal menyimpan products ke localStorage:', err);
    }
  }, [products]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(orders));
    } catch (err) {
      console.warn('Gagal menyimpan orders ke localStorage:', err);
    }
  }, [orders]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PRINTER, JSON.stringify(printerConfig));
    } catch (err) {
      console.warn('Gagal menyimpan printerConfig ke localStorage:', err);
    }
  }, [printerConfig]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    } catch (err) {
      console.warn('Gagal menyimpan users ke localStorage:', err);
    }
  }, [users]);

  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(currentUser));
      } else {
        localStorage.removeItem(STORAGE_KEY_AUTH);
      }
    } catch {
      // ignore
    }
  }, [currentUser]);

  // Ensure cashiers cannot access restricted management tabs
  useEffect(() => {
    if (currentUser && currentUser.role === 'cashier') {
      if (!['pos', 'history', 'online_orders', 'table_qr'].includes(activeTab)) {
        setActiveTab('pos');
      }
    }
  }, [currentUser, activeTab]);

  // Current Active Cart & Order state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState<string>('');
  const [tableNumber, setTableNumber] = useState<string>('');
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway' | 'delivery'>('dine_in');
  const [globalDiscountPercent, setGlobalDiscountPercent] = useState<number>(0);

  // Modals
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [activeReport, setActiveReport] = useState<DailySalesReport | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isPrinterModalOpen, setIsPrinterModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('kasirku_sidebar_visible_v1');
      if (saved !== null) {
        return saved === 'true';
      }
    } catch {
      // ignore
    }
    return typeof window !== 'undefined' ? window.innerWidth >= 768 : true;
  });

    const handleToggleSidebar = () => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('kasirku_sidebar_visible_v1', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Customer Portal Mode (e.g. Scan Barcode Meja / URL parameter ?mode=order)
  const [isCustomerPortalActive, setIsCustomerPortalActive] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('mode') === 'order' || params.get('order') === 'true';
    }
    return false;
  });

  const [customerPortalTable, setCustomerPortalTable] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('table') || '';
    }
    return '';
  });

  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      const isOrder = params.get('mode') === 'order' || params.get('order') === 'true';
      setIsCustomerPortalActive(isOrder);
      setCustomerPortalTable(params.get('table') || '');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Online Orders State with Server SSE/REST + BroadcastChannel Sync
  const [onlineOrders, setOnlineOrders] = useState<OnlineOrder[]>(() => onlineOrdersManager.getOrders());
  const [newOrderToast, setNewOrderToast] = useState<OnlineOrder | null>(null);
  const [qrisPaidToast, setQrisPaidToast] = useState<PaidPosEvent | null>(null);
  const [activeOnlineOrderId, setActiveOnlineOrderId] = useState<string | null>(null);
  const [activeOnlinePaymentPref, setActiveOnlinePaymentPref] = useState<'pay_at_cashier' | 'qris_online' | null>(null);
  const [remoteCatalog, setRemoteCatalog] = useState<{ store: StoreProfile | null; products: Product[] | null } | null>(null);
  const [isCatalogReady, setIsCatalogReady] = useState<boolean>(false);
  const lastAppliedCatalogAtRef = useRef<string | null>(null);
  const skipNextCatalogPushRef = useRef<boolean>(false);
  const processedPosOrderIdsRef = useRef<Set<string>>(new Set());

  // Keep processed POS order IDs synced with persisted orders so stock is never deducted twice
  useEffect(() => {
    for (const o of orders) {
      processedPosOrderIdsRef.current.add(o.id);
    }
  }, [orders]);

  const reconcilePaidPosOrders = useCallback(
    (posOrders: Order[], latestPaid?: PaidPosEvent) => {
      if (!Array.isArray(posOrders) || posOrders.length === 0) return;

      const unseen = posOrders.filter((po) => !processedPosOrderIdsRef.current.has(po.id));
      if (unseen.length === 0) return;

      // Mark synchronously before state updates to guarantee idempotency
      for (const po of unseen) {
        processedPosOrderIdsRef.current.add(po.id);
      }

      // Compute total quantity sold per product ID across unseen QRIS transactions
      const qtyByProductId = new Map<string, number>();
      for (const po of unseen) {
        for (const item of po.items) {
          qtyByProductId.set(
            item.product.id,
            (qtyByProductId.get(item.product.id) || 0) + item.quantity
          );
        }
      }

      setProducts((prev) =>
        prev.map((p) => {
          const soldQty = qtyByProductId.get(p.id);
          if (!soldQty) return p;
          return { ...p, stock: Math.max(0, p.stock - soldQty) };
        })
      );

      setOrders((prev) => {
        const existingIds = new Set(prev.map((o) => o.id));
        const trulyNew = unseen.filter((po) => !existingIds.has(po.id));
        if (trulyNew.length === 0) return prev;
        return [...trulyNew, ...prev];
      });

      sounds.playOrderNotification();
      sounds.playCashRegister();

      if (latestPaid) {
        setQrisPaidToast(latestPaid);
        setTimeout(() => {
          setQrisPaidToast((curr) =>
            curr?.posOrder.id === latestPaid.posOrder.id ? null : curr
          );
        }, 8000);
      }
    },
    []
  );

  useEffect(() => {
    if (cart.length === 0 && (activeOnlineOrderId || activeOnlinePaymentPref)) {
      setActiveOnlineOrderId(null);
      setActiveOnlinePaymentPref(null);
    }
  }, [cart.length, activeOnlineOrderId, activeOnlinePaymentPref]);

  useEffect(() => {
    const unsubscribe = onlineOrdersManager.subscribe((orders, newOrder) => {
      setOnlineOrders(orders);
      if (
        newOrder &&
        newOrder.status === 'pending' &&
        (newOrder.paymentPreference !== 'qris_online' || newOrder.paymentStatus === 'paid')
      ) {
        sounds.playOrderNotification();
        setNewOrderToast(newOrder);
        setTimeout(() => setNewOrderToast(null), 8000);
      }
    });
    return () => unsubscribe();
  }, []);

  // Reconcile QRIS Portal settled transactions automatically into cashier POS
  useEffect(() => {
    if (isCustomerPortalActive) return;

    const unsubscribePaid = onlineOrdersManager.subscribePaidPosOrders((posOrders, latestPaid) => {
      reconcilePaidPosOrders(posOrders, latestPaid);
    });

    void onlineOrdersManager.fetchPaidPosOrders().then((posOrders) => {
      reconcilePaidPosOrders(posOrders);
    });

    return () => unsubscribePaid();
  }, [isCustomerPortalActive, reconcilePaidPosOrders]);

  // Hydrate & subscribe to live server catalog (Store Profile + QRIS + Menu) across ALL modes & roles
  useEffect(() => {
    let active = true;
    setIsCatalogReady(false);

    const applyIncomingCatalog = (
      snap: { store?: StoreProfile | null; products?: Product[] | null; updatedAt?: string | null },
      isInitial: boolean
    ) => {
      if (!active || (!snap.store && !snap.products)) return;

      setRemoteCatalog({
        store: snap.store ?? null,
        products: snap.products ?? null,
      });

      if (snap.updatedAt && snap.updatedAt === lastAppliedCatalogAtRef.current) {
        return;
      }

      if (snap.updatedAt) {
        lastAppliedCatalogAtRef.current = snap.updatedAt;
      }

      let adoptedNewerMasterSnapshot = false;

      if (!isCustomerPortalActive && snap.store) {
        let shouldAdoptStore = !isInitial || !currentUser || currentUser.role !== 'master';
        if (isInitial && currentUser?.role === 'master') {
          try {
            const localSaved = localStorage.getItem(STORAGE_KEY_STORE);
            const localUpdatedAt = Number(localStorage.getItem('kasirku_store_updated_at_v1') || '0');
            const serverUpdatedAt = snap.updatedAt ? new Date(snap.updatedAt).getTime() : 0;
            if (!localSaved || serverUpdatedAt > localUpdatedAt) {
              shouldAdoptStore = true;
              adoptedNewerMasterSnapshot = true;
            }
          } catch {
            // ignore
          }
        }

        if (shouldAdoptStore) {
          skipNextCatalogPushRef.current = true;
          setStore(snap.store);
          try {
            const serverTs = snap.updatedAt ? new Date(snap.updatedAt).getTime() : Date.now();
            localStorage.setItem('kasirku_store_updated_at_v1', String(serverTs));
          } catch {
            // ignore
          }
        }
      }

      if (!isCustomerPortalActive && snap.products && snap.products.length > 0) {
        if (!currentUser || currentUser.role !== 'master' || adoptedNewerMasterSnapshot) {
          skipNextCatalogPushRef.current = true;
          setProducts(snap.products);
        }
      }
    };

    void onlineOrdersManager
      .fetchCatalogFromServer()
      .then((snap) => {
        if (snap) {
          applyIncomingCatalog(snap, true);
        }
      })
      .finally(() => {
        if (active) setIsCatalogReady(true);
      });

    const unsubscribe = onlineOrdersManager.subscribeCatalog((snap) => {
      applyIncomingCatalog(snap, false);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [isCustomerPortalActive, currentUser?.id, currentUser?.role]);

  // Only Owner (master) pushes store/QRIS & menu catalog updates to server after initial hydration
  useEffect(() => {
    if (!isCatalogReady || isCustomerPortalActive || currentUser?.role !== 'master') {
      return;
    }

    if (skipNextCatalogPushRef.current) {
      skipNextCatalogPushRef.current = false;
      return;
    }

    try {
      localStorage.setItem('kasirku_store_updated_at_v1', String(Date.now()));
    } catch {
      // ignore
    }

    void onlineOrdersManager.syncCatalogToServer(store, products).then((synced) => {
      if (synced?.updatedAt) {
        lastAppliedCatalogAtRef.current = synced.updatedAt;
      }
      setRemoteCatalog({ store, products });
    });
  }, [isCatalogReady, currentUser?.role, isCustomerPortalActive, store, products]);

  const pendingOnlineOrdersCount = useMemo(() => {
    return onlineOrders.filter(
      (o) =>
        o.status === 'pending' &&
        (o.paymentPreference !== 'qris_online' || o.paymentStatus === 'paid')
    ).length;
  }, [onlineOrders]);

  const handleLoadOnlineOrderToPOS = (onlineOrder: OnlineOrder) => {
    sounds.playItemBeep();
    setCart([...onlineOrder.items]);
    setCustomerName(onlineOrder.customerName);
    setTableNumber(onlineOrder.tableNumber || '');
    setOrderType(onlineOrder.orderType);
    setGlobalDiscountPercent(0);
    setActiveOnlineOrderId(onlineOrder.id);
    setActiveOnlinePaymentPref(onlineOrder.paymentPreference || null);
    setActiveTab('pos');
    if (onlineOrder.status === 'pending') {
      void onlineOrdersManager.updateOrderStatus(onlineOrder.id, 'accepted');
    }
  };

  // Cart totals for payment modal
  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.price * item.quantity - (item.discount || 0), 0);
  }, [cart]);

  // Derived nominal discount from percentage
  const globalDiscountAmount = useMemo(() => {
    return Math.round(cartSubtotal * (globalDiscountPercent / 100));
  }, [cartSubtotal, globalDiscountPercent]);

  const taxAmount = useMemo(() => {
    if (!store.enableTax) return 0;
    const base = Math.max(0, cartSubtotal - globalDiscountAmount);
    return Math.round(base * (store.taxPercentage / 100));
  }, [cartSubtotal, globalDiscountAmount, store.enableTax, store.taxPercentage]);

  const serviceChargeAmount = useMemo(() => {
    if (!store.enableServiceCharge) return 0;
    const base = Math.max(0, cartSubtotal - globalDiscountAmount);
    return Math.round(base * (store.serviceChargePercentage / 100));
  }, [cartSubtotal, globalDiscountAmount, store.enableServiceCharge, store.serviceChargePercentage]);

  const grandTotal = useMemo(() => {
    return Math.max(0, cartSubtotal - globalDiscountAmount + taxAmount + serviceChargeAmount);
  }, [cartSubtotal, globalDiscountAmount, taxAmount, serviceChargeAmount]);

  const totalCartCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Handle Complete Order & Checkout
  const handleCompleteOrder = async (details: {
    paymentMethod: PaymentMethod;
    amountPaid: number;
    change: number;
    shouldAutoPrint: boolean;
  }) => {
    const now = new Date();
    const localTodayStr = getLocalDateString(now);
    const dateStr = localTodayStr.replace(/-/g, '');
    const todayOrders = orders.filter((o) => getLocalDateString(o.timestamp) === localTodayStr);
    const maxOrderNum = todayOrders.reduce((max, o) => Math.max(max, o.orderNumber || 0), 0);
    const nextOrderNum = maxOrderNum + 1;
    const orderId = `ORD-${dateStr}-${String(nextOrderNum).padStart(3, '0')}`;

    const newOrder: Order = {
      id: orderId,
      orderNumber: nextOrderNum,
      timestamp: now.toISOString(),
      cashierName: currentUser ? currentUser.name : 'Kasir',
      customerName: customerName.trim() || undefined,
      tableNumber: tableNumber.trim() || undefined,
      orderType,
      items: [...cart],
      subtotal: cartSubtotal,
      discount: globalDiscountAmount,
      discountPercent: globalDiscountPercent,
      taxRate: store.enableTax ? store.taxPercentage / 100 : 0,
      taxAmount,
      serviceChargeRate: store.enableServiceCharge ? store.serviceChargePercentage / 100 : 0,
      serviceChargeAmount,
      total: grandTotal,
      paymentMethod: details.paymentMethod,
      amountPaid: details.amountPaid,
      change: details.change,
      status: 'completed',
    };

    // Decrement inventory stock
    setProducts((prev) =>
      prev.map((p) => {
        const cartMatch = cart.find((i) => i.product.id === p.id);
        if (cartMatch) {
          return { ...p, stock: Math.max(0, p.stock - cartMatch.quantity) };
        }
        return p;
      })
    );

    // Save order
    setOrders((prev) => [newOrder, ...prev]);

    // Mark linked online order as completed if applicable
    if (activeOnlineOrderId) {
      void onlineOrdersManager.updateOrderStatus(activeOnlineOrderId, 'completed');
      setActiveOnlineOrderId(null);
    }

    // Reset current POS inputs
    setCart([]);
    setCustomerName('');
    setTableNumber('');
    setGlobalDiscountPercent(0);
    setIsPaymentModalOpen(false);

    // Open receipt modal
    setReceiptOrder(newOrder);
    setIsReceiptModalOpen(true);

    // Auto-print to Bluetooth if requested and printer connected
    if (details.shouldAutoPrint && printerState.isConnected) {
      try {
        const bytes = bluetoothPrinter.generateReceiptBytes(newOrder, store, printerConfig);
        await bluetoothPrinter.sendRawData(bytes);
        sounds.playThermalTick();
      } catch (err) {
        console.warn('Auto print failed:', err);
      }
    }
  };

  // Quick connect trigger from navbar
  const handleQuickConnect = async () => {
    if (!printerState.isSupported) {
      setIsPrinterModalOpen(true);
      return;
    }
    const res = await bluetoothPrinter.connect();
    if (!res.success) {
      setIsPrinterModalOpen(true);
    }
  };

  // Keyboard shortcut for POS (F9 opens checkout)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F9' && activeTab === 'pos' && cart.length > 0 && !isPaymentModalOpen) {
        e.preventDefault();
        setIsPaymentModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, cart.length, isPaymentModalOpen]);

  // Logout handler - opens confirmation modal
  const handleLogout = () => {
    setIsLogoutModalOpen(true);
  };

  const handleConfirmLogout = () => {
    sounds.playItemBeep();
    setCurrentUser(null);
    localStorage.removeItem(STORAGE_KEY_AUTH);
    setCart([]);
    setActiveTab('pos');
    setIsLogoutModalOpen(false);
  };

  // Reset demo data handler
  const handleResetData = () => {
    setStore(DEFAULT_STORE_PROFILE);
    setProducts(INITIAL_PRODUCTS);
    setOrders(getInitialOrders());
    setPrinterConfig(DEFAULT_PRINTER_CONFIG);
    setUsers(DEFAULT_USERS);
    setCart([]);
    sounds.playCashRegister();
  };

  const handleImportData = (data: any) => {
    if (data.store) setStore(data.store);
    if (data.products) setProducts(data.products);
    if (data.orders) setOrders(data.orders);
    if (data.printerConfig) setPrinterConfig(data.printerConfig);
    if (data.users) setUsers(data.users);
  };

  // If Customer Order Portal is active (e.g. Scanned QR Code Meja / Online link)
  if (isCustomerPortalActive) {
    const portalStore = remoteCatalog?.store || store;
    const portalProducts =
      remoteCatalog?.products && remoteCatalog.products.length > 0
        ? remoteCatalog.products
        : products;

    return (
      <CustomerOrderPortal
        products={portalProducts}
        store={portalStore}
        printerConfig={printerConfig}
        initialTable={customerPortalTable}
      />
    );
  }

  // If not logged in, render the Login Page
  if (!currentUser) {
    return (
      <LoginPage
        store={store}
        users={users}
        onLogin={(user) => {
          setCurrentUser(user);
          setActiveTab('pos');
        }}
      />
    );
  }

  const isMaster = currentUser.role === 'master';

  return (
    <div className="h-screen bg-slate-100 flex flex-col text-slate-800 overflow-hidden relative">
      {/* Top Navbar: Brand Logo, Store Name, Bluetooth status, and Logged-in Administrator */}
      <Navbar
        store={store}
        printerState={printerState}
        printerConfig={printerConfig}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenPrinterModal={() => setIsPrinterModalOpen(true)}
        onQuickConnectBluetooth={handleQuickConnect}
        onOpenLogoManager={() => setActiveTab('logo')}
        pendingOnlineOrdersCount={pendingOnlineOrdersCount}
        onOpenOnlineOrders={() => setActiveTab('online_orders')}
        onOpenTableQR={() => setActiveTab('table_qr')}
      />

      {/* Button Garis Tiga (Menu) di Sudut Kiri Bawah - di luar kotak header */}
      <button
        type="button"
        onClick={handleToggleSidebar}
        className={`fixed bottom-5 left-5 z-50 w-12 h-12 rounded-2xl flex items-center justify-center transition-all cursor-pointer shadow-xl active:scale-90 border ${
          isSidebarOpen
            ? 'bg-slate-800 hover:bg-slate-900 text-white border-slate-700 shadow-slate-900/30'
            : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 shadow-emerald-700/40 ring-4 ring-emerald-500/20'
        }`}
        title={isSidebarOpen ? 'Sembunyikan Menu Navigasi' : 'Tampilkan Menu Navigasi'}
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Main Workspace Body with Left Sidebar and Main Content Router */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Dedicated Left Navigation Menu (Bisa dihilangkan & ditimbulkan kembali) */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          cartCount={totalCartCount}
          pendingOnlineCount={pendingOnlineOrdersCount}
          currentUser={currentUser}
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={(open) => {
            setIsSidebarOpen(open);
            try {
              localStorage.setItem('kasirku_sidebar_visible_v1', String(open));
            } catch {
              // ignore
            }
          }}
        />

        {/* Main View Router */}
        <main className="flex-1 overflow-y-auto min-w-0 pb-16">
          {activeTab === 'pos' && (
            <CashierPOSView
              products={products}
              cart={cart}
              setCart={setCart}
              store={store}
              customerName={customerName}
              setCustomerName={setCustomerName}
              tableNumber={tableNumber}
              setTableNumber={setTableNumber}
              orderType={orderType}
              setOrderType={setOrderType}
              globalDiscountPercent={globalDiscountPercent}
              setGlobalDiscountPercent={setGlobalDiscountPercent}
              lowStockThreshold={store.lowStockThreshold || 10}
              onOpenPaymentModal={() => setIsPaymentModalOpen(true)}
              pendingOnlineOrdersCount={pendingOnlineOrdersCount}
              onNavigateToOnlineOrders={() => setActiveTab('online_orders')}
              onNavigateToTableQR={() => setActiveTab('table_qr')}
            />
          )}

          {activeTab === 'online_orders' && (
            <OnlineOrdersView
              onlineOrders={onlineOrders}
              products={products}
              store={store}
              printerConfig={printerConfig}
              printerState={printerState}
              onLoadOrderToPOS={handleLoadOnlineOrderToPOS}
              onOpenCustomerView={(tbl) => {
                if (isMaster) {
                  void onlineOrdersManager.syncCatalogToServer(store, products);
                }
                if (typeof window !== 'undefined' && window.history) {
                  const targetUrl = tbl
                    ? `${window.location.pathname}?mode=order&table=${encodeURIComponent(tbl)}`
                    : `${window.location.pathname}?mode=order`;
                  window.history.pushState({ portal: true }, '', targetUrl);
                }
                setCustomerPortalTable(tbl || '');
                setIsCustomerPortalActive(true);
              }}
            />
          )}

          {activeTab === 'table_qr' && (
            <TableQRView
              store={store}
              onOpenCustomerView={(tbl) => {
                if (isMaster) {
                  void onlineOrdersManager.syncCatalogToServer(store, products);
                }
                if (typeof window !== 'undefined' && window.history) {
                  const targetUrl = tbl
                    ? `${window.location.pathname}?mode=order&table=${encodeURIComponent(tbl)}`
                    : `${window.location.pathname}?mode=order`;
                  window.history.pushState({ portal: true }, '', targetUrl);
                }
                setCustomerPortalTable(tbl || '');
                setIsCustomerPortalActive(true);
              }}
            />
          )}

          {activeTab === 'reports' && isMaster && (
            <DailyReportsView
              orders={orders}
              store={store}
              printerConfig={printerConfig}
              printerState={printerState}
              onOpenPrinterModal={() => setIsPrinterModalOpen(true)}
              onSelectOrderReceipt={(order) => {
                setReceiptOrder(order);
                setIsReceiptModalOpen(true);
              }}
              onOpenReportReceiptModal={(report) => {
                setActiveReport(report);
                setIsReportModalOpen(true);
              }}
            />
          )}

          {activeTab === 'history' && (
            <TransactionHistoryView
              orders={orders}
              setOrders={setOrders}
              isMaster={isMaster}
              store={store}
              onSelectOrderReceipt={(order) => {
                setReceiptOrder(order);
                setIsReceiptModalOpen(true);
              }}
            />
          )}

          {activeTab === 'products' && isMaster && (
            <ProductManagementView
              products={products}
              setProducts={setProducts}
              lowStockThreshold={store.lowStockThreshold || 10}
              isMaster={isMaster}
            />
          )}

          {activeTab === 'users' && isMaster && (
            <UserManagementView
              users={users}
              setUsers={setUsers}
              currentUser={currentUser}
            />
          )}

          {activeTab === 'logo' && isMaster && (
            <LogoManagementView
              store={store}
              setStore={setStore}
              isMaster={isMaster}
              onNavigateToTab={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'settings' && isMaster && (
            <SettingsView
              store={store}
              setStore={setStore}
              printerConfig={printerConfig}
              setPrinterConfig={setPrinterConfig}
              printerState={printerState}
              onOpenPrinterModal={() => setIsPrinterModalOpen(true)}
              onResetData={handleResetData}
              fullDataPayload={{ store, products, orders, printerConfig, users }}
              onImportData={handleImportData}
              onOpenLogoManager={() => setActiveTab('logo')}
              onQuickConnectBluetooth={handleQuickConnect}
            />
          )}
        </main>
      </div>

      {/* Payment Checkout Modal */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        cart={cart}
        subtotal={cartSubtotal}
        discount={globalDiscountAmount}
        discountPercent={globalDiscountPercent}
        taxAmount={taxAmount}
        taxRate={store.enableTax ? store.taxPercentage / 100 : 0}
        serviceChargeAmount={serviceChargeAmount}
        serviceChargeRate={store.enableServiceCharge ? store.serviceChargePercentage / 100 : 0}
        total={grandTotal}
        customerName={customerName}
        tableNumber={tableNumber}
        orderType={orderType}
        cashierName={currentUser ? currentUser.name : 'Kasir'}
        store={store}
        printerConfig={printerConfig}
        isMaster={isMaster}
        defaultPaymentMethod={activeOnlinePaymentPref === 'qris_online' ? 'qris' : 'cash'}
        onUpdateStore={setStore}
        onCompleteOrder={handleCompleteOrder}
      />

      {/* Order Thermal Receipt Modal */}
      <ReceiptModal
        order={receiptOrder}
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        store={store}
        printerConfig={printerConfig}
        printerState={printerState}
        onOpenPrinterModal={() => setIsPrinterModalOpen(true)}
      />

      {/* Daily Sales Report Thermal Receipt (Z-Report) Modal */}
      <ReportReceiptModal
        report={activeReport}
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        store={store}
        printerConfig={printerConfig}
        printerState={printerState}
        onOpenPrinterModal={() => setIsPrinterModalOpen(true)}
      />

      {/* Bluetooth Thermal Printer Settings Modal */}
      <PrinterSettingsModal
        isOpen={isPrinterModalOpen}
        onClose={() => setIsPrinterModalOpen(false)}
        printerConfig={printerConfig}
        setPrinterConfig={setPrinterConfig}
        printerState={printerState}
        store={store}
      />

      {/* Logout Confirmation Modal */}
      {isLogoutModalOpen && currentUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
                <LogOut className="w-7 h-7" />
              </div>

              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  Konfirmasi Keluar Kasir
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Apakah Anda yakin ingin mengakhiri sesi kasir dan keluar dari sistem?
                </p>
              </div>

              {/* User Identity Info Card */}
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-left flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${
                    currentUser.role === 'master'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  }`}
                >
                  {currentUser.role === 'master' ? '👑' : '👤'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-900 truncate">
                      {currentUser.name}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full uppercase ${
                        currentUser.role === 'master'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      }`}
                    >
                      {currentUser.role === 'master' ? 'Master' : 'Kasir'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500 block truncate font-mono">
                    {currentUser.email}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsLogoutModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleConfirmLogout}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-600/20 transition-all active:scale-[0.98] cursor-pointer"
                >
                  Ya, Keluar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification for Incoming Online Order */}
      {newOrderToast && (
        <div className="fixed top-20 right-5 z-50 bg-slate-950 text-white p-4 rounded-2xl shadow-2xl border-2 border-emerald-500 animate-in slide-in-from-top-4 flex items-center gap-3.5 max-w-sm">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center font-bold text-sm shrink-0">
            <ShoppingBag className="w-5 h-5 animate-bounce" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-emerald-400">Pesanan Online Baru!</span>
              <span className="text-[10px] bg-slate-800 text-slate-300 font-mono px-1 rounded">
                #{newOrderToast.orderCode}
              </span>
            </div>
            <p className="text-xs font-bold text-white truncate">
              {newOrderToast.customerName} {newOrderToast.tableNumber ? `• Meja ${newOrderToast.tableNumber}` : ''}
            </p>
            <span className="text-[11px] text-emerald-300 font-mono font-semibold">
              {newOrderToast.items.reduce((s, i) => s + i.quantity, 0)} menu dipesan
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveTab('online_orders');
              setNewOrderToast(null);
            }}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer shadow-xs"
          >
            Buka
          </button>
        </div>
      )}

      {/* Floating Toast Notification for Automated QRIS Payment Settlement */}
      {qrisPaidToast && (
        <div
          className={`fixed right-5 z-50 bg-emerald-950 text-white p-4 rounded-2xl shadow-2xl border-2 border-teal-400 animate-in slide-in-from-top-4 flex items-center gap-3.5 max-w-sm ${
            newOrderToast ? 'top-44' : 'top-20'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-teal-400 text-emerald-950 flex items-center justify-center font-bold text-sm shrink-0">
            <QrCode className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-300 shrink-0" />
              <span className="text-xs font-black text-teal-300">QRIS Diterima • Proses Dapur!</span>
              <span className="text-[10px] bg-emerald-900 text-emerald-100 font-mono px-1 rounded">
                #{qrisPaidToast.order.orderCode}
              </span>
            </div>
            <p className="text-xs font-bold text-white truncate">
              {qrisPaidToast.order.customerName} • {formatRupiah(qrisPaidToast.order.total)}
            </p>
            <span className="text-[11px] text-emerald-300 font-mono font-semibold block truncate">
              Lunas & otomatis diteruskan ke Dapur
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveTab('online_orders');
              setQrisPaidToast(null);
            }}
            className="px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-xl text-xs font-bold shrink-0 cursor-pointer shadow-xs"
          >
            Lihat
          </button>
        </div>
      )}
    </div>
  );
}
