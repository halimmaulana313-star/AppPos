/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, LogOut, X } from 'lucide-react';
import { CashierClosingView } from './components/CashierClosingView';
import { CashierPOSView } from './components/CashierPOSView';
import { ClosingReceiptModal } from './components/ClosingReceiptModal';
import { DailyReportsView } from './components/DailyReportsView';
import { LoginPage } from './components/LoginPage';
import { LogoManagementView } from './components/LogoManagementView';
import { Navbar } from './components/Navbar';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PaymentModal } from './components/PaymentModal';
import { PrinterSettingsModal } from './components/PrinterSettingsModal';
import { ProductManagementView } from './components/ProductManagementView';
import { ReceiptEditorModal } from './components/ReceiptEditorModal';
import { ReceiptModal } from './components/ReceiptModal';
import { ReportReceiptModal } from './components/ReportReceiptModal';
import { SettingsView } from './components/SettingsView';
import { Sidebar } from './components/Sidebar';
import { TransactionHistoryView } from './components/TransactionHistoryView';
import { UserManagementView } from './components/UserManagementView';
import {
  ActiveTab,
  AppUser,
  CartItem,
  CashierClosing,
  DailySalesReport,
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
import {
  DEFAULT_PRINTER_CONFIG,
  DEFAULT_STORE_PROFILE,
  INITIAL_PRODUCTS,
  getInitialOrders,
} from './utils/initialData';
import { getLocalDateString } from './utils/formatters';
import {
  safeJsonParse,
  sanitizeCashierClosingList,
  sanitizeOrderList,
  sanitizePrinterConfig,
  sanitizeProductList,
  sanitizeStoreProfile,
} from './utils/sanitize';
import { sounds } from './utils/soundEffects';
import { useFirebase } from './contexts/FirebaseContext';
import { auth } from './lib/firebase';
import {
  decrementProductsStockInFirestore,
  deleteCashierClosingFromFirestore,
  deletePosOrderFromFirestore,
  isBootstrapAdminUser,
  saveCashierClosingToFirestore,
  savePosOrderToFirestore,
  seedInitialStoreAndProductsIfEmpty,
  subscribeCashierClosings,
  subscribeCurrentUserProfile,
  subscribeManagedUsers,
  subscribePosOrders,
  subscribeProducts,
  subscribeStoreProfile,
  syncFirebaseUserProfile,
  syncProductsBatchToFirestore,
  updatePosOrderStatusInFirestore,
  upsertStoreInFirestore,
} from './lib/firestoreSync';

const STORAGE_KEY_STORE = 'kasirku_store_v1';
const STORAGE_KEY_PRODUCTS = 'kasirku_products_v1';
const STORAGE_KEY_ORDERS = 'kasirku_orders_v1';
const STORAGE_KEY_PRINTER = 'kasirku_printer_v1';
const STORAGE_KEY_CLOSINGS = 'kasirku_closings_v1';

export default function App() {
  const { firebaseUser, authReady, reloadAuthUser, signOutFirebase } = useFirebase();

  // Navigation
  const [activeTab, setActiveTab] = useState<ActiveTab>('pos');

  // Verified Authentication State (derived strictly from Firebase Auth + Firestore)
  const [users, setUsers] = useState<AppUser[]>([]);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [isResolvingProfile, setIsResolvingProfile] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [profileRetryNonce, setProfileRetryNonce] = useState<number>(0);

  // Sanitized Persistent States
  const [store, setStore] = useState<StoreProfile>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_STORE);
      if (saved) {
        const parsed = safeJsonParse<unknown>(saved);
        if (parsed) return sanitizeStoreProfile(parsed, DEFAULT_STORE_PROFILE);
      }
    } catch {
      // ignore storage access issues
    }
    return DEFAULT_STORE_PROFILE;
  });

  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PRODUCTS);
      if (saved) {
        const parsed = safeJsonParse<unknown>(saved);
        if (parsed) return sanitizeProductList(parsed, INITIAL_PRODUCTS);
      }
    } catch {
      // ignore
    }
    return INITIAL_PRODUCTS;
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ORDERS);
      if (saved) {
        const parsed = safeJsonParse<unknown>(saved);
        if (parsed) return sanitizeOrderList(parsed, getInitialOrders());
      }
    } catch {
      // ignore
    }
    return getInitialOrders();
  });

  const [printerConfig, setPrinterConfig] = useState<PrinterConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PRINTER);
      if (saved) {
        const parsed = safeJsonParse<unknown>(saved);
        if (parsed) return sanitizePrinterConfig(parsed, DEFAULT_PRINTER_CONFIG);
      }
    } catch {
      // ignore
    }
    return DEFAULT_PRINTER_CONFIG;
  });

  const [cashierClosings, setCashierClosings] = useState<CashierClosing[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CLOSINGS);
      if (saved) {
        const parsed = safeJsonParse<unknown>(saved);
        if (parsed) return sanitizeCashierClosingList(parsed, []);
      }
    } catch {
      // ignore
    }
    return [];
  });

  const latestStoreRef = useRef<StoreProfile>(store);
  latestStoreRef.current = store;
  const latestProductsRef = useRef<Product[]>(products);
  latestProductsRef.current = products;

  // Bluetooth Manager State
  const [printerState, setPrinterState] = useState<BluetoothPrinterState>(
    bluetoothPrinter.getState()
  );

  useEffect(() => {
    const unsubscribe = bluetoothPrinter.subscribe((state) => {
      setPrinterState(state);
    });
    return () => unsubscribe();
  }, []);

  // Save to LocalStorage safely
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_STORE, JSON.stringify(store));
    } catch {
      // ignore quota errors
    }
  }, [store]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(products));
    } catch {
      // ignore quota errors
    }
  }, [products]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(orders));
    } catch {
      // ignore quota errors
    }
  }, [orders]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_PRINTER, JSON.stringify(printerConfig));
    } catch {
      // ignore quota errors
    }
  }, [printerConfig]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CLOSINGS, JSON.stringify(cashierClosings));
    } catch {
      // ignore quota errors
    }
  }, [cashierClosings]);

  // Remove legacy insecure local auth keys if present from older versions
  useEffect(() => {
    try {
      localStorage.removeItem('kasirku_users_v1');
      localStorage.removeItem('kasirku_auth_user_v1');
    } catch {
      // ignore
    }
  }, []);

  // Ensure cashiers cannot access restricted management tabs
  useEffect(() => {
    if (currentUser && currentUser.role === 'cashier') {
      if (!['pos', 'closing', 'history'].includes(activeTab)) {
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

  // Modals & Closing Navigation State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [activeReport, setActiveReport] = useState<DailySalesReport | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [activeClosingReceipt, setActiveClosingReceipt] = useState<CashierClosing | null>(null);
  const [isClosingReceiptModalOpen, setIsClosingReceiptModalOpen] = useState(false);
  const [closingInitialDate, setClosingInitialDate] = useState<string | undefined>(undefined);
  const [isPrinterModalOpen, setIsPrinterModalOpen] = useState(false);
  const [isReceiptEditorOpen, setIsReceiptEditorOpen] = useState(false);
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

  const [firestoreOwnerUid, setFirestoreOwnerUid] = useState<string | null>(null);
  const [firestoreStaffUids, setFirestoreStaffUids] = useState<string[]>([]);
  const [isFirestoreReady, setIsFirestoreReady] = useState<boolean>(false);
  const skipNextFirestoreStorePushRef = useRef<boolean>(false);
  const skipNextFirestoreProductsPushRef = useRef<boolean>(false);
  const isCompletingOrderRef = useRef<boolean>(false);
  const deletedOrderIdsRef = useRef<Set<string>>(new Set());
  const deletedClosingIdsRef = useRef<Set<string>>(new Set());

  // Hydrate Firebase Auth user & attach Firestore real-time listeners when authenticated
  useEffect(() => {
    if (!authReady) return;

    if (!firebaseUser) {
      setCurrentUser(null);
      setUsers([]);
      setFirestoreStaffUids([]);
      setFirestoreOwnerUid(null);
      setIsFirestoreReady(false);
      setIsResolvingProfile(false);
      return;
    }

    const activeAuthUser = auth.currentUser ?? firebaseUser;
    let active = true;
    const isBootstrap = isBootstrapAdminUser(activeAuthUser);
    const unsubscribers: Array<() => void> = [];
    setIsResolvingProfile(true);
    setAuthError(null);

    void syncFirebaseUserProfile(activeAuthUser)
      .then((syncedUser) => {
        if (!active) return;
        if (!syncedUser.isActive) {
          setAuthError(
            'Akun ini sedang dinonaktifkan oleh Master Toko. Hubungi pemilik toko untuk mengaktifkan kembali.'
          );
          setCurrentUser(null);
          setIsResolvingProfile(false);
          void signOutFirebase();
          return;
        }

        // Strict server-verified profile binding (never trust stale local storage)
        setCurrentUser(syncedUser);
        setUsers(isBootstrap ? [] : [syncedUser]);
        setIsResolvingProfile(false);

        // Live listener on own /users/{uid} so deactivations & role changes take effect immediately
        unsubscribers.push(
          subscribeCurrentUserProfile(firebaseUser.uid, isBootstrap, (liveUser) => {
            if (!active) return;
            if (!liveUser || !liveUser.isActive) {
              setAuthError(
                'Sesi Anda dihentikan karena akun dinonaktifkan atau dihapus oleh Master Toko.'
              );
              setCurrentUser(null);
              void signOutFirebase();
              return;
            }
            setCurrentUser(liveUser);
            if (!isBootstrap) {
              setUsers([liveUser]);
            }
          })
        );

        unsubscribers.push(
          subscribeStoreProfile(firebaseUser.uid, isBootstrap, (remoteStore) => {
            if (!active) return;
            const { staffUids: remoteStaffUids, ...remoteStoreFields } = remoteStore;
            if (remoteStoreFields.ownerUid) {
              setFirestoreOwnerUid(remoteStoreFields.ownerUid);
            }
            if (Array.isArray(remoteStaffUids) && remoteStaffUids.length > 0) {
              setFirestoreStaffUids((prev) =>
                Array.from(new Set([...prev, ...remoteStaffUids])).slice(0, 20)
              );
            }
            skipNextFirestoreStorePushRef.current = true;
            setStore((prev) =>
              sanitizeStoreProfile(
                {
                  ...prev,
                  ...remoteStoreFields,
                  logoUrl: remoteStoreFields.logoUrl,
                  qrisImageUrl: remoteStoreFields.qrisImageUrl,
                },
                DEFAULT_STORE_PROFILE
              )
            );
          })
        );

        unsubscribers.push(
          subscribeProducts(firebaseUser.uid, isBootstrap, (remoteProducts) => {
            if (!active) return;
            if (remoteProducts.length > 0) {
              skipNextFirestoreProductsPushRef.current = true;
              setProducts(remoteProducts);
            }
          })
        );

        unsubscribers.push(
          subscribePosOrders(
            firebaseUser.uid,
            isBootstrap,
            syncedUser.role === 'master',
            (remoteOrders, removedOrderIds) => {
              if (!active) return;
              if (remoteOrders.length === 0 && removedOrderIds.length === 0) return;
              const removedSet = new Set(removedOrderIds);
              removedOrderIds.forEach((id) => deletedOrderIdsRef.current.add(id));
              setOrders((prev) => {
                const map = new Map<string, Order>();
                for (const ro of remoteOrders) {
                  if (!deletedOrderIdsRef.current.has(ro.id)) {
                    map.set(ro.id, ro);
                  }
                }
                for (const lo of prev) {
                  if (
                    !map.has(lo.id) &&
                    !removedSet.has(lo.id) &&
                    !deletedOrderIdsRef.current.has(lo.id)
                  ) {
                    map.set(lo.id, lo);
                  }
                }
                return Array.from(map.values()).sort(
                  (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                );
              });
            }
          )
        );

        unsubscribers.push(
          subscribeCashierClosings(
            firebaseUser.uid,
            isBootstrap,
            syncedUser.role === 'master',
            (remoteClosings, removedClosingIds) => {
              if (!active) return;
              if (remoteClosings.length === 0 && removedClosingIds.length === 0) return;
              const removedSet = new Set(removedClosingIds);
              removedClosingIds.forEach((id) => deletedClosingIdsRef.current.add(id));
              setCashierClosings((prev) => {
                const map = new Map<string, CashierClosing>();
                for (const rc of remoteClosings) {
                  if (!deletedClosingIdsRef.current.has(rc.id)) {
                    map.set(rc.id, rc);
                  }
                }
                for (const lc of prev) {
                  if (
                    !map.has(lc.id) &&
                    !removedSet.has(lc.id) &&
                    !deletedClosingIdsRef.current.has(lc.id)
                  ) {
                    map.set(lc.id, lc);
                  }
                }
                return Array.from(map.values()).sort(
                  (a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime()
                );
              });
            }
          )
        );

        if (isBootstrap) {
          unsubscribers.push(
            subscribeManagedUsers(true, (fbUsers) => {
              if (!active) return;
              setUsers(fbUsers);
              setFirestoreStaffUids(fbUsers.map((u) => u.id));
            })
          );

          void seedInitialStoreAndProductsIfEmpty(
            firebaseUser.uid,
            latestStoreRef.current,
            latestProductsRef.current
          ).catch(() => {
            if (active) {
              setSyncWarning(
                'Sebagian data awal gagal disinkronkan ke cloud. Pastikan koneksi internet stabil.'
              );
            }
          });
        }

        setIsFirestoreReady(true);
      })
      .catch((err) => {
        if (!active) return;
        setIsResolvingProfile(false);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('auth/email-not-verified')) {
          setAuthError(
            'Email Google Anda belum terverifikasi. Gunakan akun Google dengan email terverifikasi untuk masuk.'
          );
        } else if (msg.includes('PERMISSION_DENIED') || msg.includes('permission-denied')) {
          setAuthError(
            'Akses database ditolak oleh aturan keamanan server (PERMISSION_DENIED). Coba verifikasi ulang atau hubungi Master Toko.'
          );
        } else if (msg.includes('unavailable') || msg.includes('offline')) {
          setAuthError(
            'Koneksi ke server database terganggu atau sedang offline. Periksa internet Anda lalu klik Coba Verifikasi Ulang.'
          );
        } else {
          setAuthError(
            'Gagal memverifikasi profil pengguna dengan server. Periksa koneksi internet dan coba verifikasi ulang.'
          );
        }
      });

    return () => {
      active = false;
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [authReady, firebaseUser, profileRetryNonce, signOutFirebase]);

  // Persist store edits to Firestore for authenticated Master accounts
  useEffect(() => {
    if (
      !authReady ||
      !firebaseUser ||
      !isFirestoreReady ||
      currentUser?.role !== 'master'
    ) {
      return;
    }

    if (skipNextFirestoreStorePushRef.current) {
      skipNextFirestoreStorePushRef.current = false;
      return;
    }

    const ownerUid = firestoreOwnerUid || firebaseUser.uid;
    const timer = window.setTimeout(() => {
      void upsertStoreInFirestore(store, ownerUid, firestoreStaffUids).catch(() => {
        setSyncWarning('Perubahan pengaturan toko gagal disinkronkan ke database cloud.');
      });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [
    authReady,
    firebaseUser,
    isFirestoreReady,
    currentUser?.role,
    store,
    firestoreOwnerUid,
    firestoreStaffUids,
  ]);

  // Persist product catalog edits to Firestore for authenticated Master accounts
  useEffect(() => {
    if (
      !authReady ||
      !firebaseUser ||
      !isFirestoreReady ||
      currentUser?.role !== 'master'
    ) {
      return;
    }

    if (skipNextFirestoreProductsPushRef.current) {
      skipNextFirestoreProductsPushRef.current = false;
      return;
    }

    const ownerUid = firestoreOwnerUid || firebaseUser.uid;
    const timer = window.setTimeout(() => {
      void syncProductsBatchToFirestore(products, ownerUid, firestoreStaffUids).catch(() => {
        setSyncWarning('Perubahan katalog produk gagal disinkronkan ke database cloud.');
      });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [
    authReady,
    firebaseUser,
    isFirestoreReady,
    currentUser?.role,
    products,
    firestoreOwnerUid,
    firestoreStaffUids,
  ]);

  // Cart totals for payment modal
  const cartSubtotal = useMemo(() => {
    return cart.reduce(
      (sum, item) => sum + item.product.price * item.quantity - (item.discount || 0),
      0
    );
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
  }, [
    cartSubtotal,
    globalDiscountAmount,
    store.enableServiceCharge,
    store.serviceChargePercentage,
  ]);

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
    if (isCompletingOrderRef.current || cart.length === 0) return;

    // Validate stock availability before finalizing
    for (const item of cart) {
      const latestProd = products.find((p) => p.id === item.product.id);
      if (!latestProd || item.quantity > latestProd.stock) {
        setSyncWarning(
          `Stok untuk "${item.product.name}" tidak mencukupi (tersedia ${latestProd?.stock ?? 0} pcs).`
        );
        sounds.playError();
        return;
      }
    }

    isCompletingOrderRef.current = true;

    try {
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
        customerName: customerName.trim().slice(0, 120) || undefined,
        tableNumber: tableNumber.trim().slice(0, 40) || undefined,
        orderType,
        items: [...cart],
        subtotal: cartSubtotal,
        discount: globalDiscountAmount,
        discountPercent: globalDiscountPercent,
        taxRate: store.enableTax ? store.taxPercentage / 100 : 0,
        taxAmount,
        serviceChargeRate: store.enableServiceCharge
          ? store.serviceChargePercentage / 100
          : 0,
        serviceChargeAmount,
        total: grandTotal,
        paymentMethod: details.paymentMethod,
        amountPaid: details.amountPaid,
        change: details.change,
        status: 'completed',
      };

      const stockUpdates: Array<{ productId: string; newStock: number }> = [];
      const nextProducts = products.map((p) => {
        const cartMatch = cart.find((i) => i.product.id === p.id);
        if (cartMatch) {
          const updatedStock = Math.max(0, p.stock - cartMatch.quantity);
          stockUpdates.push({ productId: p.id, newStock: updatedStock });
          return { ...p, stock: updatedStock };
        }
        return p;
      });

      // Avoid redundant full-catalog write when we commit targeted stock updates below
      if (currentUser?.role === 'master') {
        skipNextFirestoreProductsPushRef.current = true;
      }
      setProducts(nextProducts);
      setOrders((prev) => [newOrder, ...prev]);

      if (authReady && firebaseUser) {
        const ownerUid = firestoreOwnerUid || firebaseUser.uid;
        void Promise.all([
          savePosOrderToFirestore(newOrder, ownerUid, firebaseUser.uid, firestoreStaffUids),
          decrementProductsStockInFirestore(stockUpdates),
        ]).catch(() => {
          setSyncWarning(
            'Transaksi tersimpan di perangkat, namun gagal disinkronkan ke cloud server.'
          );
        });
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
          const activeStore = latestStoreRef.current;
          const bytes = await bluetoothPrinter.generateReceiptBytesWithLogo(
            newOrder,
            activeStore,
            printerConfig
          );
          await bluetoothPrinter.sendRawData(bytes);
          sounds.playThermalTick();
        } catch {
          // Printer print error shouldn't fail order
        }
      }
    } finally {
      isCompletingOrderRef.current = false;
    }
  };

  // Cancel completed order (Master only) with Firestore sync
  const handleCancelOrderInFirestore = async (orderId: string) => {
    if (currentUser?.role !== 'master') return;
    if (authReady && firebaseUser) {
      await updatePosOrderStatusInFirestore(orderId, 'cancelled');
    }
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status: 'cancelled' } : o))
    );
  };

  // Permanently delete order (Master only) with Firestore sync
  const handleDeleteOrderInFirestore = async (orderId: string) => {
    if (currentUser?.role !== 'master') return;
    deletedOrderIdsRef.current.add(orderId);
    if (authReady && firebaseUser) {
      try {
        await deletePosOrderFromFirestore(orderId);
      } catch (err) {
        deletedOrderIdsRef.current.delete(orderId);
        throw err;
      }
    }
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
  };

  // Save Cashier Closing (Tutupan Kasir) to Firestore & local state
  const handleSaveCashierClosing = async (closing: CashierClosing) => {
    if (authReady && firebaseUser) {
      const ownerUid = firestoreOwnerUid || firebaseUser.uid;
      await saveCashierClosingToFirestore(
        closing,
        ownerUid,
        firebaseUser.uid,
        firestoreStaffUids
      );
    }
    setCashierClosings((prev) => [
      closing,
      ...prev.filter((c) => c.id !== closing.id),
    ]);
  };

  // Delete Cashier Closing (Master only) with Firestore sync
  const handleDeleteCashierClosing = async (closingId: string) => {
    if (currentUser?.role !== 'master') return;
    deletedClosingIdsRef.current.add(closingId);
    if (authReady && firebaseUser) {
      try {
        await deleteCashierClosingFromFirestore(closingId);
      } catch (err) {
        deletedClosingIdsRef.current.delete(closingId);
        throw err;
      }
    }
    setCashierClosings((prev) => prev.filter((c) => c.id !== closingId));
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
    void signOutFirebase().catch(() => {});
    setCurrentUser(null);
    setCart([]);
    setActiveTab('pos');
    setIsLogoutModalOpen(false);
  };

  // Reset demo data handler (excludes user accounts & keeps auth intact)
  const handleResetData = () => {
    setStore(DEFAULT_STORE_PROFILE);
    setProducts(INITIAL_PRODUCTS);
    setOrders(getInitialOrders());
    setPrinterConfig(DEFAULT_PRINTER_CONFIG);
    setCart([]);
    sounds.playCashRegister();
  };

  const handleImportData = (data: Record<string, unknown>) => {
    if (data.store) {
      setStore(sanitizeStoreProfile(data.store, DEFAULT_STORE_PROFILE));
    }
    if (data.products) {
      setProducts(sanitizeProductList(data.products, products));
    }
    if (data.orders) {
      setOrders(sanitizeOrderList(data.orders, orders));
    }
    if (data.printerConfig) {
      setPrinterConfig(sanitizePrinterConfig(data.printerConfig, DEFAULT_PRINTER_CONFIG));
    }
  };

  // Enforce authenticated Firebase session + active Firestore profile
  if (!authReady || isResolvingProfile || !firebaseUser || !currentUser) {
    return (
      <LoginPage
        store={store}
        authReady={authReady}
        isResolvingProfile={isResolvingProfile}
        signedInEmail={firebaseUser?.email}
        isEmailVerified={Boolean(firebaseUser?.emailVerified)}
        externalError={authError}
        onClearExternalError={() => setAuthError(null)}
        onRetrySync={async () => {
          const verified = await reloadAuthUser();
          if (verified) {
            setAuthError(null);
            setProfileRetryNonce((n) => n + 1);
          }
          return verified;
        }}
      />
    );
  }

  const isMaster = currentUser.role === 'master';
  const isBootstrap = isBootstrapAdminUser(firebaseUser);

  return (
    <div className="h-screen bg-slate-100 flex flex-col text-slate-800 overflow-hidden relative">
      {/* Top Navbar */}
      <Navbar
        store={store}
        printerState={printerState}
        printerConfig={printerConfig}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenPrinterModal={() => setIsPrinterModalOpen(true)}
        onQuickConnectBluetooth={handleQuickConnect}
        onOpenLogoManager={() => setActiveTab('logo')}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={handleToggleSidebar}
      />

      {/* Cloud Sync Warning Banner (Non-blocking) */}
      {syncWarning && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs text-amber-900 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{syncWarning}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncWarning(null)}
            className="text-amber-700 hover:text-amber-900 p-0.5 rounded cursor-pointer"
            title="Tutup pemberitahuan"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          cartCount={totalCartCount}
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
            />
          )}

          {activeTab === 'closing' && (
            <CashierClosingView
              orders={orders}
              closings={cashierClosings}
              currentUser={currentUser}
              store={store}
              isMaster={isMaster}
              initialDate={closingInitialDate}
              onSaveClosing={handleSaveCashierClosing}
              onDeleteClosing={handleDeleteCashierClosing}
              onOpenClosingReceipt={(closing) => {
                setActiveClosingReceipt(closing);
                setIsClosingReceiptModalOpen(true);
              }}
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

          {activeTab === 'reports' && isMaster && (
            <DailyReportsView
              orders={orders}
              closings={cashierClosings}
              store={store}
              printerConfig={printerConfig}
              printerState={printerState}
              isMaster={isMaster}
              onDeleteOrder={handleDeleteOrderInFirestore}
              onOpenPrinterModal={() => setIsPrinterModalOpen(true)}
              onSelectOrderReceipt={(order) => {
                setReceiptOrder(order);
                setIsReceiptModalOpen(true);
              }}
              onOpenReportReceiptModal={(report) => {
                setActiveReport(report);
                setIsReportModalOpen(true);
              }}
              onOpenClosingForDate={(date) => {
                setClosingInitialDate(date);
                setActiveTab('closing');
              }}
              onOpenClosingReceipt={(closing) => {
                setActiveClosingReceipt(closing);
                setIsClosingReceiptModalOpen(true);
              }}
            />
          )}

          {activeTab === 'history' && (
            <TransactionHistoryView
              orders={orders}
              onCancelOrder={handleCancelOrderInFirestore}
              onDeleteOrder={handleDeleteOrderInFirestore}
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
              isBootstrapAdmin={isBootstrap}
              onStaffRegistered={(newUser) => {
                setUsers((prev) =>
                  prev.some((u) => u.id === newUser.id) ? prev : [...prev, newUser]
                );
                setFirestoreStaffUids((prev) =>
                  prev.includes(newUser.id) ? prev : [...prev, newUser.id].slice(0, 20)
                );
              }}
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
              fullDataPayload={{ store, products, orders, printerConfig }}
              onImportData={handleImportData}
              onOpenLogoManager={() => setActiveTab('logo')}
              onQuickConnectBluetooth={handleQuickConnect}
              onOpenReceiptEditor={() => setIsReceiptEditorOpen(true)}
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
        serviceChargeRate={
          store.enableServiceCharge ? store.serviceChargePercentage / 100 : 0
        }
        total={grandTotal}
        customerName={customerName}
        tableNumber={tableNumber}
        orderType={orderType}
        cashierName={currentUser ? currentUser.name : 'Kasir'}
        store={store}
        printerConfig={printerConfig}
        isMaster={isMaster}
        defaultPaymentMethod="cash"
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
        isMaster={isMaster}
        onOpenReceiptEditor={() => setIsReceiptEditorOpen(true)}
      />

      {/* Master Receipt Wording Editor Modal */}
      <ReceiptEditorModal
        isOpen={isReceiptEditorOpen}
        onClose={() => setIsReceiptEditorOpen(false)}
        store={store}
        setStore={setStore}
        printerConfig={printerConfig}
        setPrinterConfig={setPrinterConfig}
        previewOrder={isReceiptModalOpen ? receiptOrder : null}
        isMaster={isMaster}
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

      {/* Cashier Closing (Tutupan Kasir) Thermal Receipt Modal */}
      <ClosingReceiptModal
        closing={activeClosingReceipt}
        isOpen={isClosingReceiptModalOpen}
        onClose={() => setIsClosingReceiptModalOpen(false)}
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

      <OfflineIndicator />
    </div>
  );
}
