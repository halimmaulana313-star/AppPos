/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CartItem, OnlineOrder, OnlineOrderStatus, Product, StoreProfile } from '../types/pos';

export const STORAGE_KEY_ONLINE_ORDERS = 'kasirku_online_orders_v1';
export const STORAGE_KEY_CUSTOMER_ACTIVE_ORDER = 'kasirku_customer_active_order_v1';
export const BROADCAST_CHANNEL_NAME = 'kasirku_orders_sync_channel';

class OnlineOrdersManager {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<(orders: OnlineOrder[], newOrder?: OnlineOrder) => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        this.channel.onmessage = (event) => {
          const { type, order, status, orderId } = event.data || {};
          if (type === 'NEW_ONLINE_ORDER' && order) {
            const current = this.getOrders();
            // Avoid duplicates
            if (!current.some((o) => o.id === order.id)) {
              this.notifyListeners([...current, order], order);
            } else {
              this.notifyListeners(current);
            }
          } else if (type === 'ORDER_STATUS_CHANGED') {
            const current = this.getOrders();
            this.notifyListeners(current);
          } else if (type === 'REFRESH_ORDERS') {
            this.notifyListeners(this.getOrders());
          }
        };
      } catch (err) {
        console.warn('BroadcastChannel not available:', err);
      }

      // Also listen to window storage event for cross-tab sync
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY_ONLINE_ORDERS) {
          this.notifyListeners(this.getOrders());
        }
      });
    }
  }

  getOrders(): OnlineOrder[] {
    if (typeof window === 'undefined') return [];
    try {
      const data = localStorage.getItem(STORAGE_KEY_ONLINE_ORDERS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  saveOrders(orders: OnlineOrder[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY_ONLINE_ORDERS, JSON.stringify(orders));
    } catch {
      // ignore
    }
  }

  addOrder(order: OnlineOrder): void {
    const orders = this.getOrders();
    const updated = [order, ...orders.filter((o) => o.id !== order.id)];
    this.saveOrders(updated);

    // Save as active customer order for customer view persistence
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOMER_ACTIVE_ORDER, JSON.stringify(order));
    } catch {
      // ignore
    }

    // Broadcast to cashier window
    if (this.channel) {
      this.channel.postMessage({ type: 'NEW_ONLINE_ORDER', order });
    }

    this.notifyListeners(updated, order);
  }

  updateOrderStatus(orderId: string, status: OnlineOrderStatus, rejectionReason?: string): void {
    const orders = this.getOrders();
    const now = new Date().toISOString();
    const updated = orders.map((o) => {
      if (o.id === orderId) {
        const next: OnlineOrder = { ...o, status };
        if (status === 'accepted') next.acceptedAt = now;
        if (status === 'completed') next.completedAt = now;
        if (status === 'cancelled' && rejectionReason !== undefined) {
          next.rejectionReason = rejectionReason.trim() || undefined;
        }
        return next;
      }
      return o;
    });

    this.saveOrders(updated);

    // If active customer order matches, update it too
    try {
      const activeRaw = localStorage.getItem(STORAGE_KEY_CUSTOMER_ACTIVE_ORDER);
      if (activeRaw) {
        const active: OnlineOrder = JSON.parse(activeRaw);
        if (active.id === orderId) {
          active.status = status;
          if (status === 'cancelled' && rejectionReason !== undefined) {
            active.rejectionReason = rejectionReason.trim() || undefined;
          }
          localStorage.setItem(STORAGE_KEY_CUSTOMER_ACTIVE_ORDER, JSON.stringify(active));
        }
      }
    } catch {
      // ignore
    }

    if (this.channel) {
      this.channel.postMessage({ type: 'ORDER_STATUS_CHANGED', orderId, status });
    }

    this.notifyListeners(updated);
  }

  deleteOrder(orderId: string): void {
    const orders = this.getOrders().filter((o) => o.id !== orderId);
    this.saveOrders(orders);
    if (this.channel) {
      this.channel.postMessage({ type: 'REFRESH_ORDERS' });
    }
    this.notifyListeners(orders);
  }

  subscribe(callback: (orders: OnlineOrder[], newOrder?: OnlineOrder) => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(orders: OnlineOrder[], newOrder?: OnlineOrder): void {
    this.listeners.forEach((listener) => {
      try {
        listener(orders, newOrder);
      } catch (err) {
        console.error('Error in online order listener:', err);
      }
    });
  }

  generateOrderCode(tableNumber?: string, orderCount: number = 1): string {
    if (tableNumber) {
      const cleanTable = tableNumber.replace(/\D/g, '').padStart(2, '0');
      return `M${cleanTable || '01'}-${orderCount}`;
    }
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const letter = letters[(orderCount - 1) % letters.length];
    const num = String(orderCount).padStart(2, '0');
    return `${letter}${num}`;
  }

  createDemoOrder(products: Product[], store: StoreProfile, table: string = '03'): OnlineOrder {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const orders = this.getOrders();
    const orderNumber = orders.length + 1;
    const orderId = `ONL-${dateStr}-${String(orderNumber).padStart(3, '0')}`;

    // Pick 2-3 sample products
    const sample1 = products[0] || { id: 'p1', name: 'Kopi Susu Gula Aren', price: 18000 };
    const sample2 = products[5] || products[1] || { id: 'p2', name: 'Nasi Goreng Spesial', price: 25000 };

    const items: CartItem[] = [
      {
        product: sample1 as Product,
        quantity: 2,
        note: 'Es sedikit (less ice)',
        discount: 0,
      },
      {
        product: sample2 as Product,
        quantity: 1,
        note: 'Pedas sedang',
        discount: 0,
      },
    ];

    const subtotal = items.reduce((s, i) => s + i.product.price * i.quantity, 0);
    const taxAmount = store.enableTax ? Math.round(subtotal * (store.taxPercentage / 100)) : 0;
    const serviceChargeAmount = store.enableServiceCharge ? Math.round(subtotal * (store.serviceChargePercentage / 100)) : 0;
    const total = subtotal + taxAmount + serviceChargeAmount;

    return {
      id: orderId,
      orderCode: `M${table}-1`,
      timestamp: now.toISOString(),
      customerName: 'Dimas Wicaksono',
      customerPhone: '081234567890',
      orderType: 'dine_in',
      tableNumber: table,
      items,
      subtotal,
      taxAmount,
      serviceChargeAmount,
      total,
      status: 'pending',
      notes: 'Tolong sendok dan tisu tambahan ya.',
      paymentPreference: 'pay_at_cashier',
    };
  }
}

export const onlineOrdersManager = new OnlineOrdersManager();
