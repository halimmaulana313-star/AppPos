# KasirKu POS Security Specification (Phase 0 TDD)

## 1. Core Data Invariants
1. **Strict Authentication & Verification**: Every read/write on POS collections requires an authenticated Firebase user (`request.auth != null`), and all write operations require a verified email (`request.auth.token.email_verified == true`).
2. **No Self-Escalation of Privileges**: A non-admin user creating `/users/{userId}` can only create `role: "cashier"` for their own UID (`request.auth.uid == userId`), and can never modify `role`, `isActive`, or `/admins/{userId}`. Only verified admins (bootstrapped admin email `halimmaulana133@gmail.com` with `email_verified == true`, or members of `/admins/{uid}`) may assign `master` roles or edit admin entries.
3. **PII Isolation**: `/users/{userId}` contains `email` and `phone`. Single-document `get` is strictly limited to `request.auth.uid == userId || isAdmin()`. `list` on `/users` is restricted to `isAdmin()`.
4. **Master Gate & Atomic Batch Consistency**: Line items under `/posOrders/{orderId}/items/{itemId}` MUST reference an existing parent document on `get` (`get(...)`) and verify atomic parent creation via `existsAfter(...)` / `getAfter(...)` during `create`.
5. **No Blanket List / No Cost-Explosion Queries**: Every `allow list` validates `resource.data` directly (zero `get()` or `exists()` lookups inside `allow list`).
6. **Temporal Integrity & Immortality**: `createdAt` and `updatedAt` are strictly enforced against `request.time`; `createdAt`, `uid`, `ownerUid`, and `cashierUid` are immutable after creation.
7. **Terminal State Locking**: Only `isAdmin()` may transition `posOrders` from `'completed'` to `'cancelled'` or `'refunded'`. Once `'cancelled'` or `'refunded'`, orders are strictly immutable. Non-admin staff can never mutate order status.
8. **Payload, Stock Monotonicity & Document ID Hardening**: All document IDs match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars), all string fields enforce explicit `maxLength` bounds matching `firebase-blueprint.json`, `staffUids` arrays are bounded `<= 20`, image URLs reject `javascript:`, `vbscript:`, and `data:text/html:` schemes, and cashier product stock updates are strictly monotonic non-increasing (`0 <= incoming.stock <= existing.stock`).

## 2. The "Dirty Dozen" Attack Payloads (Must All Return PERMISSION_DENIED)

1. **Unauthenticated Store Read (`stores/default`)**: Unauthenticated caller (`auth: null`) attempts `get(/stores/default)`. Expected: `PERMISSION_DENIED`.
2. **Self-Assigned Master Role (`users/attacker1`)**: Verified user `attacker1` attempts `create(/users/attacker1)` with `{"uid": "attacker1", "role": "master", ...}`. Expected: `PERMISSION_DENIED`.
3. **Unverified Admin Email Spoof (`users/spoof1`)**: Caller with `email: "halimmaulana133@gmail.com"` and `email_verified: false` attempts `list(/users)` or `write(/stores/default)`. Expected: `PERMISSION_DENIED`.
4. **Cross-User PII Read (`users/victim1`)**: Non-admin user `cashier1` attempts `get(/users/victim1)`. Expected: `PERMISSION_DENIED`.
5. **Shadow Ghost Field Injection (`users/cashier1`)**: `cashier1` attempts `update(/users/cashier1)` adding `{"isSuperAdmin": true, "displayName": "X", "updatedAt": request.time}`. Expected: `PERMISSION_DENIED`.
6. **Privilege Escalation via Update (`users/cashier1`)**: `cashier1` attempts `update(/users/cashier1)` changing `{"role": "master", "updatedAt": request.time}`. Expected: `PERMISSION_DENIED`.
7. **Admin Table Self-Registration (`admins/cashier1`)**: Non-admin `cashier1` attempts `create(/admins/cashier1)`. Expected: `PERMISSION_DENIED`.
8. **ID Poisoning Attack (`products/<1500-char-invalid-id>`)**: Authenticated user attempts `create` with oversized or special-character document ID containing `/` or spaces or >128 chars. Expected: `PERMISSION_DENIED`.
9. **Timestamp Tampering (`posOrders/ORD-1`)**: Cashier attempts `create(/posOrders/ORD-1)` with backdated `createdAt` timestamp (`!= request.time`). Expected: `PERMISSION_DENIED`.
10. **Orphaned Order Line Item (`posOrders/NONEXISTENT/items/item-1`)**: Cashier attempts `create` on child item without atomically creating parent `/posOrders/NONEXISTENT` in the same batch (`existsAfter` fails). Expected: `PERMISSION_DENIED`.
11. **Terminal Order Tampering (`posOrders/ORD-LOCKED-1`)**: Non-admin cashier attempts to update `posOrders/ORD-LOCKED-1` after `status == 'refunded'` back to `'completed'`. Expected: `PERMISSION_DENIED`.
12. **Unbounded Array / Payload Exhaustion (`stores/default`)**: User attempts to write `staffUids` with 25 entries (`> 20`) or `storeName` > 120 chars. Expected: `PERMISSION_DENIED`.
