# KOSMO Security & Verification Standards

This document outlines the security controls, cryptographic standards, concurrency safeguards, and defensive programming practices enforced across the **KOSMO** platform.

---

## 1. Authentication & Token Security

### Stateless Bearer JWT Tokens
- **Algorithm:** HMAC SHA-256 (`HS256`).
- **Standard Expiration:** 7 days (`7d`).
- **Header Delivery:** All API requests pass tokens via the standard `Authorization: Bearer <token>` HTTP header.
- **Strict Claims Enforcement:** Every token payload must validate `{ id: string, email: string, role: UserRole }`. Malformed or expired claims immediately trigger `401 Unauthorized` or `403 Forbidden`.

### Elimination of JWT in URL Query Parameters
Long-lived JWT tokens are strictly prohibited from appearing in URL query strings (`?token=...`) to prevent token leakage via server access logs, web proxies, browser history, and HTTP `Referer` headers (CWE-598).

- **Authenticated Blob Downloads:** The frontend triggers file downloads (Excel audits, financial reports) using authenticated `fetch()` with the `Authorization` header, converting the binary response to an in-memory `Blob` object and revoking the object URL post-download.
- **Short-Lived Download Tokens:** For workflows requiring direct download links, clients request a 60-second single-purpose download ticket via `POST /api/reports/download-token`. This short-lived token cannot be leveraged for account takeover.

---

## 2. Password Security & Re-Authentication Gates

### Asynchronous Bcrypt Hashing
- **Algorithm:** `bcrypt` with salt rounds set to `10`.
- **Non-Blocking Runtime:** All password comparisons and hashing operations are performed asynchronously (`await bcrypt.compare()` and `await bcrypt.hash()`) across all authentication, user management, and property management routes to prevent event-loop latency spikes under concurrent traffic.

### Destructive Action Password Confirmation Gates
To prevent unauthorized or accidental modifications (including session hijacking via unlocked devices), critical destructive operations require re-entering the caller's password:
- `DELETE /api/properties/:id` — Property listing deletion.
- `DELETE /api/properties/:propertyId/rooms/:roomId` — Room removal.
- `POST /api/rentals/:id/terminate` — Premature tenancy cancellation.
- `DELETE /api/users/:id` — Administrator user account deletion.

The backend verifies the plaintext password against the caller's database hash before starting the deletion transaction.

---

## 3. Concurrency Protection & Transactional Integrity

### Pessimistic Row-Level Locking
Financial transactions and room allocations must prevent race conditions and inventory double-booking. KOSMO uses transactional connections (`pool.getConnection()`) with row-level locks:

```sql
SELECT balance, totalRevenue, totalWithdrawn 
FROM users 
WHERE id = ? 
FOR UPDATE;
```

### Strict Lock Hierarchy
To prevent database deadlocks, multiple resources are locked in a deterministic hierarchy:
1. `users` (Account balance / credentials)
2. `properties` (Property inventory & occupancy)
3. `rentals` (Lease agreement status)
4. `rooms` (Individual room inventory)

### Atomic Refund Rollback Guarantee
When a landlord requests a payout, funds are deducted upfront to prevent double-spending. If an administrator rejects the withdrawal request, funds are refunded atomically to the landlord's balance within a transactional block:

```ts
await connection.beginTransaction();
await connection.query(
  'UPDATE withdrawals SET status = "rejected", rejectionReason = ? WHERE id = ?',
  [reason, id]
);
await connection.query(
  'UPDATE users SET balance = balance + ? WHERE id = ?',
  [amount, landlordId]
);
await connection.commit();
```

---

## 4. Payment Gateway Webhook Verification

Incoming Midtrans webhook callbacks are cryptographically verified against tampering using SHA-512 signature hashing:

$$\text{Signature} = \text{SHA-512}\left(\text{order\_id} + \text{status\_code} + \text{gross\_amount} + \text{MIDTRANS\_SERVER\_KEY}\right)$$

If the received `signature_key` does not match the calculated hash, the webhook request is rejected with `401 Unauthorized` without modifying any rental or financial state.

---

## 5. SQL Injection Prevention

100% of database interactions are executed using parameterized prepared statements via `mysql2/promise` (`pool.execute` or `connection.execute`). String interpolation and concatenation in raw SQL queries are strictly prohibited across the entire codebase.

---

## 6. Rate Limiting & Input Validation

### Rate Limiting Tiers:
- **Authentication Limiter (`authLimiter`):** 20 requests per 15 minutes per IP on `/api/auth/*`.
- **Upload Limiter (`uploadLimiter`):** 30 upload requests per 15 minutes per IP on `/api/upload`.
- **Tracking Limiter (`trackingLimiter`):** 60 requests per minute per IP on visitor tracking endpoints.

### Strict Zod Request Validation:
All incoming mutation bodies (`POST`, `PUT`) are validated through Zod schemas before reaching business logic:
- Phone numbers must adhere to valid international or Indonesian formats (`+62` or `08`).
- Prices, room counts, and durations are validated for positive non-zero boundaries.
- Identity numbers (`NIK` / `Passport`) enforce exact format and character constraints.

---

## 7. Frontend Declarative Route Guarding

To eliminate layout flashing (unauthorized component rendering prior to asynchronous redirect), the frontend implements `<ProtectedRoute>` in `frontend/src/components/ProtectedRoute.tsx`:

```tsx
<Route
  path="/admin"
  element={
    <ProtectedRoute allowedRoles={['admin']}>
      <AdminDashboard />
    </ProtectedRoute>
  }
/>
```

- Synchronously evaluates `localStorage` token and parsed user role before mounting the dashboard component tree.
- Automatically handles malformed or tampered storage JSON by purging tokens and redirecting to `/login`.
- Redirects unauthorized roles directly to their authorized portal without layout flash.
