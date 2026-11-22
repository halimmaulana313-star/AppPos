/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { deleteApp, initializeApp } from 'firebase/app';
import {
  User,
  createUserWithEmailAndPassword,
  getAuth,
  sendEmailVerification,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AppUser,
  CartItem,
  CashierClosing,
  Order,
  Product,
  StoreProfile,
  UserRole,
} from '../types/pos';
import { sanitizeSafeImageUrl } from '../utils/sanitize';
import { OperationType, auth, db, firebaseConfig, handleFirestoreError } from './firebase';

export const BOOTSTRAP_ADMIN_EMAILS = [
  'halimmaulana133@gmail.com',
  'halimmaulana313@gmail.com',
  'haimmaulana313@gmail.com',
] as const;
export const BOOTSTRAP_ADMIN_EMAIL = 'halimmaulana133@gmail.com';
export const DEFAULT_STORE_DOC_ID = 'default';

const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

function sanitizeFirestoreId(raw: string, fallbackPrefix = 'doc'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 128);
  if (cleaned && ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `${fallbackPrefix}-${Date.now()}`;
}

function clipString(value: string | undefined | null, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

function optionalClipString(value: string | undefined | null, maxLen: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function compactImageForFirestore(
  value: string | undefined | null,
  maxLen: number,
  allowPresetSvg = false
): string | undefined {
  const safe = sanitizeSafeImageUrl(value, { allowPresetSvg, maxLength: maxLen });
  return safe;
}

function clampNumber(value: unknown, min: number, max: number, fallback = 0): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function buildStaffUids(ownerUid: string, extraUids: string[] = []): string[] {
  const unique = Array.from(new Set([ownerUid, ...extraUids].filter((u) => ID_REGEX.test(u))));
  return unique.slice(0, 20);
}

export function isBootstrapAdminUser(user: User | null): boolean {
  const normalizedEmail = user?.email?.trim().toLowerCase() || '';
  return Boolean(
    user &&
      user.emailVerified &&
      (BOOTSTRAP_ADMIN_EMAILS as readonly string[]).includes(normalizedEmail)
  );
}

const inFlightProfileSyncs = new Map<string, Promise<AppUser>>();

/**
 * Ensures /users/{uid} (and /admins/{uid} for verified bootstrap admin) exists cleanly.
 * Deduplicated per UID so concurrent auth triggers never race on create/update.
 */
export async function syncFirebaseUserProfile(firebaseUser: User): Promise<AppUser> {
  if (!firebaseUser.emailVerified) {
    throw new Error('auth/email-not-verified');
  }

  const uid = sanitizeFirestoreId(firebaseUser.uid, 'usr');
  const existingTask = inFlightProfileSyncs.get(uid);
  if (existingTask) {
    return existingTask;
  }

  const task = (async (): Promise<AppUser> => {
    const userDocRef = doc(db, 'users', uid);
    const path = `users/${uid}`;
    const isBootstrap = isBootstrapAdminUser(firebaseUser);
    const email = clipString((firebaseUser.email || `${uid}@kasirku.local`).toLowerCase(), 200);
    const displayName = clipString(
      firebaseUser.displayName?.trim() || email.split('@')[0] || 'Pengguna KasirKu',
      100
    );
    const photoURL = compactImageForFirestore(firebaseUser.photoURL, 500, false);

    let existingSnap;
    try {
      existingSnap = await getDoc(userDocRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }

    if (!existingSnap.exists()) {
      const role: UserRole = isBootstrap ? 'master' : 'cashier';
      const payload: Record<string, unknown> = {
        uid,
        displayName,
        email,
        role,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      };
      if (photoURL) {
        payload.photoURL = photoURL;
      }

      try {
        await setDoc(userDocRef, payload);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }

      if (isBootstrap) {
        const adminPath = `admins/${uid}`;
        try {
          await setDoc(doc(db, 'admins', uid), {
            uid,
            email,
            assignedBy: uid,
            createdAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, adminPath);
        }
      }

      return {
        id: uid,
        name: displayName,
        email,
        role,
        isActive: true,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      };
    }

    const data = existingSnap.data();
    const existingRole: UserRole =
      isBootstrap || data.role === 'master' ? 'master' : 'cashier';
    const isActive = data.isActive !== false;
    const resolvedDisplayName = clipString(
      (typeof data.displayName === 'string' && data.displayName.trim()) || displayName,
      100
    );

    const updatePayload: Record<string, unknown> = {
      displayName: resolvedDisplayName,
      lastLoginAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (photoURL) {
      updatePayload.photoURL = photoURL;
    }
    if (isBootstrap && data.role !== 'master') {
      updatePayload.role = 'master';
    }

    try {
      await updateDoc(userDocRef, updatePayload);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }

    if (isBootstrap) {
      const adminPath = `admins/${uid}`;
      const adminRef = doc(db, 'admins', uid);
      try {
        const adminSnap = await getDoc(adminRef);
        if (!adminSnap.exists()) {
          await setDoc(adminRef, {
            uid,
            email,
            assignedBy: uid,
            createdAt: serverTimestamp(),
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, adminPath);
      }
    }

    const createdAtIso =
      data.createdAt instanceof Timestamp
        ? data.createdAt.toDate().toISOString()
        : new Date().toISOString();

    return {
      id: uid,
      name: clipString(data.displayName || displayName, 100),
      email: clipString(data.email || email, 200),
      role: existingRole,
      phone: optionalClipString(data.phone, 32),
      isActive,
      createdAt: createdAtIso,
      lastLogin: new Date().toISOString(),
    };
  })().finally(() => {
    inFlightProfileSyncs.delete(uid);
  });

  inFlightProfileSyncs.set(uid, task);
  return task;
}

/**
 * Real-time listener for the signed-in user's own /users/{uid} record so role/active status
 * updates (e.g. revocation by Master) apply immediately without reload.
 */
export function subscribeCurrentUserProfile(
  uid: string,
  isBootstrap: boolean,
  onProfileUpdate: (user: AppUser | null) => void
): () => void {
  const safeUid = sanitizeFirestoreId(uid, 'usr');
  const path = `users/${safeUid}`;
  return onSnapshot(
    doc(db, 'users', safeUid),
    (snap) => {
      if (!snap.exists()) {
        onProfileUpdate(null);
        return;
      }
      const d = snap.data();
      onProfileUpdate({
        id: d.uid || safeUid,
        name: clipString(d.displayName || 'Pengguna', 100),
        email: clipString(d.email || '', 200),
        role: isBootstrap || d.role === 'master' ? 'master' : 'cashier',
        phone: optionalClipString(d.phone, 32),
        isActive: d.isActive !== false,
        createdAt:
          d.createdAt instanceof Timestamp
            ? d.createdAt.toDate().toISOString()
            : new Date().toISOString(),
        lastLogin:
          d.lastLoginAt instanceof Timestamp
            ? d.lastLoginAt.toDate().toISOString()
            : undefined,
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

/**
 * Seeds initial store/products only when Firestore collections are genuinely empty.
 */
export async function seedInitialStoreAndProductsIfEmpty(
  ownerUid: string,
  store: StoreProfile,
  products: Product[]
): Promise<void> {
  const safeOwnerUid = sanitizeFirestoreId(ownerUid, 'usr');
  const storeRef = doc(db, 'stores', DEFAULT_STORE_DOC_ID);
  const storeSnap = await getDoc(storeRef).catch((err) =>
    handleFirestoreError(err, OperationType.GET, `stores/${DEFAULT_STORE_DOC_ID}`)
  );

  if (!storeSnap.exists()) {
    await upsertStoreInFirestore(store, safeOwnerUid, [safeOwnerUid]);
  }

  const productsCheck = await getDocs(query(collection(db, 'products'), limit(1))).catch((err) =>
    handleFirestoreError(err, OperationType.LIST, 'products')
  );

  if (productsCheck.empty && products.length > 0) {
    await syncProductsBatchToFirestore(products, safeOwnerUid, [safeOwnerUid]);
  }
}

export async function upsertStoreInFirestore(
  store: StoreProfile,
  ownerUid: string,
  staffUids: string[] = []
): Promise<void> {
  const safeOwnerUid = sanitizeFirestoreId(ownerUid, 'usr');
  const storeRef = doc(db, 'stores', DEFAULT_STORE_DOC_ID);
  const path = `stores/${DEFAULT_STORE_DOC_ID}`;

  let existingSnap;
  try {
    existingSnap = await getDoc(storeRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }

  const existingStaff =
    existingSnap.exists() && Array.isArray(existingSnap.data().staffUids)
      ? (existingSnap.data().staffUids as string[])
      : [];
  const mergedStaff =
    staffUids.length > 1
      ? buildStaffUids(safeOwnerUid, staffUids)
      : buildStaffUids(safeOwnerUid, [...existingStaff, ...staffUids]);

  const logoUrl = compactImageForFirestore(store.logoUrl, 350000, true);
  const qrisImageUrl = compactImageForFirestore(store.qrisImageUrl, 350000, false);
  const instagram = optionalClipString(store.instagram, 80);
  const wifiName = optionalClipString(store.wifiName, 80);
  const wifiPassword = optionalClipString(store.wifiPassword, 80);
  const qrisMerchantName = optionalClipString(store.qrisMerchantName, 120);
  const qrisNmid = optionalClipString(store.qrisNmid, 80);

  const fields: Record<string, unknown> = {
    staffUids: mergedStaff,
    storeName: clipString(store.storeName?.trim() || 'KasirKu Store', 120),
    tagline: clipString(store.tagline || '', 200),
    address: clipString(store.address || '', 300),
    phone: clipString(store.phone || '', 40),
    footerNote: clipString(store.footerNote || '', 500),
    enableTax: Boolean(store.enableTax),
    taxPercentage: clampNumber(store.taxPercentage, 0, 100, 0),
    enableServiceCharge: Boolean(store.enableServiceCharge),
    serviceChargePercentage: clampNumber(store.serviceChargePercentage, 0, 100, 0),
    lowStockThreshold: clampNumber(store.lowStockThreshold, 0, 10000, 10),
    currency: clipString(store.currency || 'IDR', 10),
    updatedAt: serverTimestamp(),
  };

  if (instagram !== undefined) fields.instagram = instagram;
  if (wifiName !== undefined) fields.wifiName = wifiName;
  if (wifiPassword !== undefined) fields.wifiPassword = wifiPassword;
  if (logoUrl !== undefined) fields.logoUrl = logoUrl;
  if (qrisImageUrl !== undefined) fields.qrisImageUrl = qrisImageUrl;
  if (qrisMerchantName !== undefined) fields.qrisMerchantName = qrisMerchantName;
  if (qrisNmid !== undefined) fields.qrisNmid = qrisNmid;

  if (!existingSnap.exists()) {
    try {
      await setDoc(storeRef, {
        id: DEFAULT_STORE_DOC_ID,
        ownerUid: safeOwnerUid,
        ...fields,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  } else {
    try {
      await updateDoc(storeRef, fields);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }
}

export async function syncProductsBatchToFirestore(
  products: Product[],
  ownerUid: string,
  staffUids: string[] = []
): Promise<void> {
  const safeOwnerUid = sanitizeFirestoreId(ownerUid, 'usr');
  const actorUid = sanitizeFirestoreId(auth.currentUser?.uid || safeOwnerUid, 'usr');
  const boundedStaff = buildStaffUids(safeOwnerUid, [actorUid, ...staffUids]);

  const isBootstrapActor = isBootstrapAdminUser(auth.currentUser);
  const existingDocs = await (async () => {
    try {
      const q = isBootstrapActor
        ? collection(db, 'products')
        : query(collection(db, 'products'), where('staffUids', 'array-contains', actorUid));
      const snap = await getDocs(q);
      return new Set(snap.docs.map((d) => d.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'products');
    }
  })();

  const batch = writeBatch(db);
  let opsCount = 0;

  for (const product of products) {
    const productId = sanitizeFirestoreId(product.id, 'prod');
    const docRef = doc(db, 'products', productId);
    const image = compactImageForFirestore(product.image, 300000, false);
    const description = optionalClipString(product.description, 500);
    const color = optionalClipString(product.color, 30);

    const commonFields: Record<string, unknown> = {
      staffUids: boundedStaff,
      name: clipString(product.name?.trim() || 'Produk', 140),
      category: clipString(product.category?.trim() || 'Umum', 80),
      price: clampNumber(product.price, 0, 1000000000, 0),
      costPrice: clampNumber(product.costPrice, 0, 1000000000, 0),
      stock: Math.floor(clampNumber(product.stock, 0, 1000000, 0)),
      sku: clipString(product.sku?.trim() || productId, 60),
      updatedAt: serverTimestamp(),
    };
    if (image !== undefined) commonFields.image = image;
    if (description !== undefined) commonFields.description = description;
    if (color !== undefined) commonFields.color = color;

    if (existingDocs.has(productId)) {
      batch.update(docRef, {
        ...commonFields,
        ...(image === undefined ? { image: deleteField() } : {}),
      });
    } else {
      batch.set(docRef, {
        id: productId,
        ownerUid: actorUid,
        ...commonFields,
        createdAt: serverTimestamp(),
      });
    }
    opsCount += 1;
  }

  // Delete products removed from catalog
  const currentIds = new Set(products.map((p) => sanitizeFirestoreId(p.id, 'prod')));
  for (const existingId of existingDocs) {
    if (!currentIds.has(existingId)) {
      batch.delete(doc(db, 'products', existingId));
      opsCount += 1;
    }
  }

  if (opsCount > 0) {
    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'products');
    }
  }
}

/**
 * Allows both Cashiers and Masters to persist stock decrements atomically upon checkout.
 * Updates only `stock` and `updatedAt`, satisfying tier-2 product update rules.
 */
export async function decrementProductsStockInFirestore(
  items: Array<{ productId: string; newStock: number }>
): Promise<void> {
  if (items.length === 0) return;

  const batch = writeBatch(db);
  for (const item of items) {
    const productId = sanitizeFirestoreId(item.productId, 'prod');
    batch.update(doc(db, 'products', productId), {
      stock: Math.max(0, Math.floor(clampNumber(item.newStock, 0, 1000000, 0))),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, 'products');
  }
}

export async function savePosOrderToFirestore(
  order: Order,
  ownerUid: string,
  cashierUid: string,
  staffUids: string[] = []
): Promise<void> {
  const orderId = sanitizeFirestoreId(order.id, 'ORD');
  const safeOwnerUid = sanitizeFirestoreId(ownerUid, 'usr');
  const safeCashierUid = sanitizeFirestoreId(cashierUid, 'usr');
  const boundedStaff = buildStaffUids(safeOwnerUid, [safeCashierUid, ...staffUids]);
  const orderRef = doc(db, 'posOrders', orderId);
  const path = `posOrders/${orderId}`;

  const customerName = optionalClipString(order.customerName, 120);
  const tableNumber = optionalClipString(order.tableNumber, 40);
  const notes = optionalClipString(order.notes, 500);

  const headerDoc: Record<string, unknown> = {
    id: orderId,
    ownerUid: safeOwnerUid,
    cashierUid: safeCashierUid,
    staffUids: boundedStaff,
    orderNumber: clampNumber(order.orderNumber, 0, 10000000, 1),
    timestamp: clipString(order.timestamp || new Date().toISOString(), 64),
    cashierName: clipString(order.cashierName || 'Kasir', 100),
    orderType: order.orderType,
    itemCount: clampNumber(order.items.length, 1, 1000, 1),
    subtotal: clampNumber(order.subtotal, 0, 10000000000, 0),
    discount: clampNumber(order.discount, 0, 10000000000, 0),
    taxRate: clampNumber(order.taxRate, 0, 1, 0),
    taxAmount: clampNumber(order.taxAmount, 0, 10000000000, 0),
    serviceChargeRate: clampNumber(order.serviceChargeRate, 0, 1, 0),
    serviceChargeAmount: clampNumber(order.serviceChargeAmount, 0, 10000000000, 0),
    total: clampNumber(order.total, 0, 10000000000, 0),
    paymentMethod: order.paymentMethod,
    amountPaid: clampNumber(order.amountPaid, 0, 10000000000, 0),
    change: clampNumber(order.change, 0, 10000000000, 0),
    status: order.status,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (order.discountPercent !== undefined) {
    headerDoc.discountPercent = clampNumber(order.discountPercent, 0, 100, 0);
  }
  if (customerName !== undefined) headerDoc.customerName = customerName;
  if (tableNumber !== undefined) headerDoc.tableNumber = tableNumber;
  if (notes !== undefined) headerDoc.notes = notes;

  const batch = writeBatch(db);
  batch.set(orderRef, headerDoc);

  order.items.forEach((item, index) => {
    const itemId = `item-${index + 1}-${sanitizeFirestoreId(item.product.id, 'p')}`.slice(0, 128);
    const itemRef = doc(db, 'posOrders', orderId, 'items', itemId);
    const itemPayload: Record<string, unknown> = {
      id: itemId,
      orderId,
      ownerUid: safeOwnerUid,
      cashierUid: safeCashierUid,
      staffUids: boundedStaff,
      productId: sanitizeFirestoreId(item.product.id, 'prod'),
      productName: clipString(item.product.name || 'Produk', 140),
      productCategory: clipString(item.product.category || 'Umum', 80),
      productSku: clipString(item.product.sku || 'SKU', 60),
      unitPrice: clampNumber(item.product.price, 0, 1000000000, 0),
      costPrice: clampNumber(item.product.costPrice, 0, 1000000000, 0),
      quantity: clampNumber(item.quantity, 1, 10000, 1),
      discount: clampNumber(item.discount, 0, 1000000000, 0),
      lineTotal: clampNumber(
        item.product.price * item.quantity - (item.discount || 0),
        0,
        10000000000,
        0
      ),
      createdAt: serverTimestamp(),
    };
    const itemNote = optionalClipString(item.note, 300);
    if (itemNote !== undefined) itemPayload.note = itemNote;
    batch.set(itemRef, itemPayload);
  });

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updatePosOrderStatusInFirestore(
  orderId: string,
  status: 'completed' | 'cancelled' | 'refunded',
  notes?: string
): Promise<void> {
  const safeId = sanitizeFirestoreId(orderId, 'ORD');
  const path = `posOrders/${safeId}`;
  const payload: Record<string, unknown> = {
    status,
    updatedAt: serverTimestamp(),
  };
  const safeNotes = optionalClipString(notes, 500);
  if (safeNotes !== undefined) {
    payload.notes = safeNotes;
  }

  try {
    await updateDoc(doc(db, 'posOrders', safeId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deletePosOrderFromFirestore(orderId: string): Promise<void> {
  const safeId = sanitizeFirestoreId(orderId, 'ORD');
  const path = `posOrders/${safeId}`;
  const currentUser = auth.currentUser;
  const isBootstrap = isBootstrapAdminUser(currentUser);
  try {
    const itemsQuery =
      isBootstrap || !currentUser
        ? collection(db, 'posOrders', safeId, 'items')
        : query(
            collection(db, 'posOrders', safeId, 'items'),
            where('staffUids', 'array-contains', currentUser.uid)
          );
    const itemsSnap = await getDocs(itemsQuery);
    const batch = writeBatch(db);
    itemsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(db, 'posOrders', safeId));
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribeStoreProfile(
  uid: string,
  isBootstrap: boolean,
  onStoreData: (
    storeData: Partial<StoreProfile> & { ownerUid?: string; staffUids?: string[] }
  ) => void
): () => void {
  if (isBootstrap) {
    const storeRef = doc(db, 'stores', DEFAULT_STORE_DOC_ID);
    return onSnapshot(
      storeRef,
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        onStoreData({
          ownerUid: d.ownerUid,
          staffUids: Array.isArray(d.staffUids) ? (d.staffUids as string[]) : undefined,
          storeName: d.storeName,
          tagline: d.tagline,
          address: d.address,
          phone: d.phone,
          instagram: d.instagram,
          wifiName: d.wifiName,
          wifiPassword: d.wifiPassword,
          footerNote: d.footerNote,
          logoUrl: sanitizeSafeImageUrl(d.logoUrl, { allowPresetSvg: true, maxLength: 350000 }),
          qrisImageUrl: sanitizeSafeImageUrl(d.qrisImageUrl, { allowPresetSvg: false, maxLength: 350000 }),
          qrisMerchantName: d.qrisMerchantName,
          qrisNmid: d.qrisNmid,
          enableTax: d.enableTax,
          taxPercentage: d.taxPercentage,
          enableServiceCharge: d.enableServiceCharge,
          serviceChargePercentage: d.serviceChargePercentage,
          lowStockThreshold: d.lowStockThreshold,
          currency: d.currency,
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `stores/${DEFAULT_STORE_DOC_ID}`);
      }
    );
  }

  const q = query(collection(db, 'stores'), where('staffUids', 'array-contains', uid));
  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) return;
      const d = snapshot.docs[0].data();
      onStoreData({
        ownerUid: d.ownerUid,
        staffUids: Array.isArray(d.staffUids) ? (d.staffUids as string[]) : undefined,
        storeName: d.storeName,
        tagline: d.tagline,
        address: d.address,
        phone: d.phone,
        instagram: d.instagram,
        wifiName: d.wifiName,
        wifiPassword: d.wifiPassword,
        footerNote: d.footerNote,
        logoUrl: sanitizeSafeImageUrl(d.logoUrl, { allowPresetSvg: true, maxLength: 350000 }),
        qrisImageUrl: sanitizeSafeImageUrl(d.qrisImageUrl, { allowPresetSvg: false, maxLength: 350000 }),
        qrisMerchantName: d.qrisMerchantName,
        qrisNmid: d.qrisNmid,
        enableTax: d.enableTax,
        taxPercentage: d.taxPercentage,
        enableServiceCharge: d.enableServiceCharge,
        serviceChargePercentage: d.serviceChargePercentage,
        lowStockThreshold: d.lowStockThreshold,
        currency: d.currency,
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'stores');
    }
  );
}

export function subscribeProducts(
  uid: string,
  isBootstrap: boolean,
  onProductsData: (products: Product[]) => void
): () => void {
  const q = isBootstrap
    ? collection(db, 'products')
    : query(collection(db, 'products'), where('staffUids', 'array-contains', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) return;
      const list: Product[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: d.id || docSnap.id,
          name: d.name,
          category: d.category,
          price: Number(d.price) || 0,
          costPrice: Number(d.costPrice) || 0,
          stock: Number(d.stock) || 0,
          sku: d.sku || docSnap.id,
          image: sanitizeSafeImageUrl(d.image, { allowPresetSvg: false, maxLength: 300000 }),
          description: d.description,
          color: d.color,
        };
      });
      onProductsData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    }
  );
}

export function subscribePosOrders(
  uid: string,
  isBootstrap: boolean,
  isMaster: boolean,
  onOrdersData: (orders: Order[], removedOrderIds: string[]) => void
): () => void {
  const q = isBootstrap
    ? collection(db, 'posOrders')
    : isMaster
      ? query(collection(db, 'posOrders'), where('staffUids', 'array-contains', uid))
      : query(collection(db, 'posOrders'), where('cashierUid', '==', uid));

  return onSnapshot(
    q,
    async (snapshot) => {
      const removedIds = snapshot
        .docChanges()
        .filter((change) => change.type === 'removed')
        .map((change) => change.doc.id);

      if (snapshot.empty && removedIds.length === 0) return;

      const hydrated: Order[] = await Promise.all(
        snapshot.docs.map(async (orderDoc) => {
          const d = orderDoc.data();
          let items: CartItem[] = [];
          try {
            const itemsQuery = isBootstrap
              ? collection(db, 'posOrders', orderDoc.id, 'items')
              : isMaster
                ? query(
                    collection(db, 'posOrders', orderDoc.id, 'items'),
                    where('staffUids', 'array-contains', uid)
                  )
                : query(
                    collection(db, 'posOrders', orderDoc.id, 'items'),
                    where('cashierUid', '==', uid)
                  );
            const itemsSnap = await getDocs(itemsQuery);
            items = itemsSnap.docs.map((itemDoc) => {
              const idata = itemDoc.data();
              return {
                product: {
                  id: idata.productId,
                  name: idata.productName,
                  category: idata.productCategory,
                  sku: idata.productSku,
                  price: Number(idata.unitPrice) || 0,
                  costPrice: Number(idata.costPrice) || 0,
                  stock: 0,
                },
                quantity: Number(idata.quantity) || 1,
                discount: Number(idata.discount) || 0,
                note: idata.note,
              };
            });
          } catch (err) {
            handleFirestoreError(
              err,
              OperationType.LIST,
              `posOrders/${orderDoc.id}/items`
            );
          }

          return {
            id: d.id || orderDoc.id,
            orderNumber: Number(d.orderNumber) || 1,
            timestamp: d.timestamp,
            cashierName: d.cashierName || 'Kasir',
            customerName: d.customerName,
            tableNumber: d.tableNumber,
            orderType: d.orderType || 'dine_in',
            items,
            subtotal: Number(d.subtotal) || 0,
            discount: Number(d.discount) || 0,
            discountPercent: d.discountPercent !== undefined ? Number(d.discountPercent) : undefined,
            taxRate: Number(d.taxRate) || 0,
            taxAmount: Number(d.taxAmount) || 0,
            serviceChargeRate: Number(d.serviceChargeRate) || 0,
            serviceChargeAmount: Number(d.serviceChargeAmount) || 0,
            total: Number(d.total) || 0,
            paymentMethod: d.paymentMethod || 'cash',
            amountPaid: Number(d.amountPaid) || 0,
            change: Number(d.change) || 0,
            status: d.status || 'completed',
            notes: d.notes,
          };
        })
      );

      hydrated.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      onOrdersData(hydrated, removedIds);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'posOrders');
    }
  );
}

export function subscribeManagedUsers(
  isBootstrap: boolean,
  onUsersData: (users: AppUser[]) => void
): () => void {
  if (!isBootstrap) {
    return () => {};
  }
  return onSnapshot(
    collection(db, 'users'),
    (snapshot) => {
      const list: AppUser[] = snapshot.docs.map((dSnap) => {
        const d = dSnap.data();
        return {
          id: d.uid || dSnap.id,
          name: clipString(d.displayName || 'Pengguna', 100),
          email: clipString(d.email || '', 200),
          role: d.role === 'master' ? 'master' : 'cashier',
          phone: optionalClipString(d.phone, 32),
          isActive: d.isActive !== false,
          createdAt:
            d.createdAt instanceof Timestamp
              ? d.createdAt.toDate().toISOString()
              : new Date().toISOString(),
          lastLogin:
            d.lastLoginAt instanceof Timestamp
              ? d.lastLoginAt.toDate().toISOString()
              : undefined,
        };
      });
      onUsersData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    }
  );
}

export async function updateManagedUserRoleOrStatus(
  targetUid: string,
  updates: { role?: UserRole; isActive?: boolean; displayName?: string; phone?: string },
  adminUid: string
): Promise<void> {
  const safeTarget = sanitizeFirestoreId(targetUid, 'usr');
  const path = `users/${safeTarget}`;
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (updates.role !== undefined) payload.role = updates.role;
  if (updates.isActive !== undefined) payload.isActive = updates.isActive;
  if (updates.displayName !== undefined) payload.displayName = clipString(updates.displayName, 100);
  if (updates.phone !== undefined) payload.phone = clipString(updates.phone, 32);

  try {
    await updateDoc(doc(db, 'users', safeTarget), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }

  if (updates.role === 'master') {
    const userSnap = await getDoc(doc(db, 'users', safeTarget)).catch((err) =>
      handleFirestoreError(err, OperationType.GET, path)
    );
    const email = userSnap.data()?.email || `${safeTarget}@kasirku.local`;
    try {
      await setDoc(doc(db, 'admins', safeTarget), {
        uid: safeTarget,
        email: clipString(email, 200),
        assignedBy: sanitizeFirestoreId(adminUid, 'usr'),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `admins/${safeTarget}`);
    }
  } else if (updates.role === 'cashier') {
    try {
      await deleteDoc(doc(db, 'admins', safeTarget));
    } catch {
      // Ignore if admin doc does not exist
    }
  }
}

export interface RegisterStaffInput {
  displayName: string;
  email: string;
  password: string;
  phone?: string;
  role: UserRole;
  adminUid: string;
}

export interface RegisterStaffResult {
  user: AppUser;
  verificationEmailSent: boolean;
}

/**
 * Allows an authenticated Master/Owner to register a new Cashier (or Master)
 * in Firebase Auth using an isolated secondary Firebase App instance so the
 * active Master session is never signed out, then persists /users/{uid}.
 */
export async function registerStaffAccountByMaster(
  input: RegisterStaffInput
): Promise<RegisterStaffResult> {
  const cleanName = clipString(input.displayName.trim(), 100);
  const cleanEmail = clipString(input.email.trim().toLowerCase(), 200);
  const cleanPhone = optionalClipString(input.phone, 32);
  const role: UserRole = input.role === 'master' ? 'master' : 'cashier';
  const safeAdminUid = sanitizeFirestoreId(input.adminUid, 'usr');

  if (!cleanName) {
    throw new Error('validation/name-required');
  }
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error('auth/invalid-email');
  }
  if (!input.password || input.password.length < 6) {
    throw new Error('auth/weak-password');
  }

  const secondaryAppName = `kasirku-staff-creator-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  const secondaryAuth = getAuth(secondaryApp);

  let newUid = '';
  let verificationEmailSent = false;

  try {
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      cleanEmail,
      input.password
    );
    newUid = sanitizeFirestoreId(credential.user.uid, 'usr');

    await updateProfile(credential.user, { displayName: cleanName }).catch(() => {});

    try {
      await sendEmailVerification(credential.user);
      verificationEmailSent = true;
    } catch {
      verificationEmailSent = false;
    }
  } finally {
    await signOut(secondaryAuth).catch(() => {});
    await deleteApp(secondaryApp).catch(() => {});
  }

  const userPayload: Record<string, unknown> = {
    uid: newUid,
    displayName: cleanName,
    email: cleanEmail,
    role,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (cleanPhone !== undefined) {
    userPayload.phone = cleanPhone;
  }

  try {
    await setDoc(doc(db, 'users', newUid), userPayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `users/${newUid}`);
  }

  if (role === 'master') {
    try {
      await setDoc(doc(db, 'admins', newUid), {
        uid: newUid,
        email: cleanEmail,
        assignedBy: safeAdminUid,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `admins/${newUid}`);
    }
  }

  // Ensure default store's staffUids immediately includes the new staff UID
  try {
    const storeRef = doc(db, 'stores', DEFAULT_STORE_DOC_ID);
    const storeSnap = await getDoc(storeRef);
    if (storeSnap.exists()) {
      const storeData = storeSnap.data();
      const existingStaff = Array.isArray(storeData.staffUids)
        ? (storeData.staffUids as string[])
        : [];
      if (!existingStaff.includes(newUid) && existingStaff.length < 20) {
        const nextStaff = buildStaffUids(storeData.ownerUid || safeAdminUid, [
          ...existingStaff,
          newUid,
        ]);
        await updateDoc(storeRef, {
          staffUids: nextStaff,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch {
    // Best-effort; App.tsx also syncs staffUids on users update
  }

  return {
    user: {
      id: newUid,
      name: cleanName,
      email: cleanEmail,
      role,
      phone: cleanPhone,
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    verificationEmailSent,
  };
}

export async function saveCashierClosingToFirestore(
  closing: CashierClosing,
  ownerUid: string,
  cashierUid: string,
  staffUids: string[]
): Promise<void> {
  const closingId = sanitizeFirestoreId(closing.id, 'CLS');
  const safeOwnerUid = sanitizeFirestoreId(ownerUid, 'usr');
  const safeCashierUid = sanitizeFirestoreId(cashierUid, 'usr');
  const boundedStaff = buildStaffUids(safeOwnerUid, [safeCashierUid, ...staffUids]);
  const path = `cashierClosings/${closingId}`;

  const dateVal = /^\d{4}-\d{2}-\d{2}$/.test(closing.date)
    ? closing.date
    : new Date().toISOString().slice(0, 10);

  const payload: Record<string, unknown> = {
    id: closingId,
    ownerUid: safeOwnerUid,
    cashierUid: safeCashierUid,
    staffUids: boundedStaff,
    date: dateVal,
    closedAt: clipString(closing.closedAt || new Date().toISOString(), 64),
    cashierName: clipString(closing.cashierName || 'Kasir', 100),
    openingCash: clampNumber(closing.openingCash, 0, 10000000000, 0),
    cashOut: clampNumber(closing.cashOut, 0, 10000000000, 0),
    systemCashSales: clampNumber(closing.systemCashSales, 0, 10000000000, 0),
    systemNonCashSales: clampNumber(closing.systemNonCashSales, 0, 10000000000, 0),
    qrisSales: clampNumber(closing.qrisSales, 0, 10000000000, 0),
    transferSales: clampNumber(closing.transferSales, 0, 10000000000, 0),
    cardSales: clampNumber(closing.cardSales, 0, 10000000000, 0),
    totalSales: clampNumber(closing.totalSales, 0, 10000000000, 0),
    totalDiscounts: clampNumber(closing.totalDiscounts, 0, 10000000000, 0),
    totalTax: clampNumber(closing.totalTax, 0, 10000000000, 0),
    totalServiceCharge: clampNumber(closing.totalServiceCharge, 0, 10000000000, 0),
    totalTransactions: clampNumber(closing.totalTransactions, 0, 1000000, 0),
    totalItemsSold: clampNumber(closing.totalItemsSold, 0, 1000000, 0),
    expectedCash: clampNumber(closing.expectedCash, -10000000000, 10000000000, 0),
    actualCash: clampNumber(closing.actualCash, 0, 10000000000, 0),
    cashDifference: clampNumber(closing.cashDifference, -10000000000, 10000000000, 0),
    status: 'closed',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const shiftLabel = optionalClipString(closing.shiftLabel, 60);
  const cashOutNote = optionalClipString(closing.cashOutNote, 200);
  const notes = optionalClipString(closing.notes, 500);
  if (shiftLabel !== undefined) payload.shiftLabel = shiftLabel;
  if (cashOutNote !== undefined) payload.cashOutNote = cashOutNote;
  if (notes !== undefined) payload.notes = notes;

  try {
    await setDoc(doc(db, 'cashierClosings', closingId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteCashierClosingFromFirestore(closingId: string): Promise<void> {
  const safeId = sanitizeFirestoreId(closingId, 'CLS');
  const path = `cashierClosings/${safeId}`;
  try {
    await deleteDoc(doc(db, 'cashierClosings', safeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export function subscribeCashierClosings(
  uid: string,
  isBootstrap: boolean,
  isMaster: boolean,
  onClosingsData: (closings: CashierClosing[], removedClosingIds: string[]) => void
): () => void {
  const q = isBootstrap
    ? collection(db, 'cashierClosings')
    : isMaster
      ? query(collection(db, 'cashierClosings'), where('staffUids', 'array-contains', uid))
      : query(collection(db, 'cashierClosings'), where('cashierUid', '==', uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const removedIds = snapshot
        .docChanges()
        .filter((change) => change.type === 'removed')
        .map((change) => change.doc.id);

      if (snapshot.empty && removedIds.length === 0) return;

      const list: CashierClosing[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: d.id || docSnap.id,
          date: d.date || new Date().toISOString().slice(0, 10),
          closedAt: d.closedAt || new Date().toISOString(),
          cashierUid: d.cashierUid,
          cashierName: d.cashierName || 'Kasir',
          shiftLabel: d.shiftLabel,
          openingCash: Number(d.openingCash) || 0,
          cashOut: Number(d.cashOut) || 0,
          cashOutNote: d.cashOutNote,
          systemCashSales: Number(d.systemCashSales) || 0,
          systemNonCashSales: Number(d.systemNonCashSales) || 0,
          qrisSales: Number(d.qrisSales) || 0,
          transferSales: Number(d.transferSales) || 0,
          cardSales: Number(d.cardSales) || 0,
          totalSales: Number(d.totalSales) || 0,
          totalDiscounts: Number(d.totalDiscounts) || 0,
          totalTax: Number(d.totalTax) || 0,
          totalServiceCharge: Number(d.totalServiceCharge) || 0,
          totalTransactions: Number(d.totalTransactions) || 0,
          totalItemsSold: Number(d.totalItemsSold) || 0,
          expectedCash: Number(d.expectedCash) || 0,
          actualCash: Number(d.actualCash) || 0,
          cashDifference: Number(d.cashDifference) || 0,
          notes: d.notes,
          status: 'closed',
        };
      });

      list.sort(
        (a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime()
      );
      onClosingsData(list, removedIds);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cashierClosings');
    }
  );
}
