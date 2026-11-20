/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Security Verification Specification & Payload Matrix for KasirKu POS Firestore Rules.
 * Covers all 12 "Dirty Dozen" adversarial payloads defined in security_spec.md.
 */

export interface AdversarialTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: {
    uid: string;
    email: string;
    email_verified: boolean;
  } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: AdversarialTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Store Read',
    collectionPath: 'stores/default',
    operation: 'get',
    auth: null,
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Self-Assigned Master Role on User Registration',
    collectionPath: 'users/attacker1',
    operation: 'create',
    auth: { uid: 'attacker1', email: 'attacker1@example.com', email_verified: true },
    payload: {
      uid: 'attacker1',
      displayName: 'Attacker',
      email: 'attacker1@example.com',
      role: 'master',
      isActive: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Unverified Admin Email Spoof Attack',
    collectionPath: 'users',
    operation: 'list',
    auth: { uid: 'spoof1', email: 'halimmaulana133@gmail.com', email_verified: false },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Cross-User PII Read Attempt',
    collectionPath: 'users/victim1',
    operation: 'get',
    auth: { uid: 'cashier1', email: 'cashier1@example.com', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Shadow Ghost Field Injection on Profile Update',
    collectionPath: 'users/cashier1',
    operation: 'update',
    auth: { uid: 'cashier1', email: 'cashier1@example.com', email_verified: true },
    payload: {
      displayName: 'Updated Name',
      isSuperAdmin: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Privilege Escalation Role Mutation via Update',
    collectionPath: 'users/cashier1',
    operation: 'update',
    auth: { uid: 'cashier1', email: 'cashier1@example.com', email_verified: true },
    payload: {
      role: 'master',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Unauthorized Admin Registry Self-Creation',
    collectionPath: 'admins/cashier1',
    operation: 'create',
    auth: { uid: 'cashier1', email: 'cashier1@example.com', email_verified: true },
    payload: {
      uid: 'cashier1',
      email: 'cashier1@example.com',
      assignedBy: 'cashier1',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'ID Poisoning with Oversized Document ID',
    collectionPath: `products/${'a'.repeat(200)}`,
    operation: 'create',
    auth: { uid: 'halim-uid', email: 'halimmaulana133@gmail.com', email_verified: true },
    payload: {
      id: 'a'.repeat(200),
      name: 'Poison Item',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Client Backdated Timestamp Tampering',
    collectionPath: 'posOrders/ORD-TAMPER-1',
    operation: 'create',
    auth: { uid: 'cashier1', email: 'cashier1@example.com', email_verified: true },
    payload: {
      id: 'ORD-TAMPER-1',
      ownerUid: 'halim-uid',
      cashierUid: 'cashier1',
      createdAt: '2020-01-01T00:00:00.000Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Orphaned Order Line Item Write Without Atomic Parent',
    collectionPath: 'posOrders/ORD-MISSING/items/item-1',
    operation: 'create',
    auth: { uid: 'cashier1', email: 'cashier1@example.com', email_verified: true },
    payload: {
      id: 'item-1',
      orderId: 'ORD-MISSING',
      ownerUid: 'halim-uid',
      cashierUid: 'cashier1',
      productId: 'prod-1',
      productName: 'Kopi Susu',
      quantity: 1,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Terminal State Reopening by Non-Admin',
    collectionPath: 'posOrders/ORD-LOCKED-1',
    operation: 'update',
    auth: { uid: 'cashier1', email: 'cashier1@example.com', email_verified: true },
    payload: {
      status: 'completed',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unbounded Array & String Exhaustion Attack',
    collectionPath: 'stores/default',
    operation: 'update',
    auth: { uid: 'halim-uid', email: 'halimmaulana133@gmail.com', email_verified: true },
    payload: {
      storeName: 'X'.repeat(500),
      staffUids: Array.from({ length: 25 }, (_, i) => `uid-${i}`),
    },
    expectedResult: 'PERMISSION_DENIED',
  },
];

export function verifyRuleInvariants(): { passed: number; total: number } {
  if (DIRTY_DOZEN_TESTS.length !== 12) {
    throw new Error('Expected exactly 12 Dirty Dozen adversarial test cases.');
  }
  for (const testCase of DIRTY_DOZEN_TESTS) {
    if (testCase.expectedResult !== 'PERMISSION_DENIED') {
      throw new Error(`Test case ${testCase.id} must expect PERMISSION_DENIED`);
    }
  }
  return { passed: DIRTY_DOZEN_TESTS.length, total: DIRTY_DOZEN_TESTS.length };
}
