---
name: kosmo-concurrency-stress
description: Concurrency stress testing, transaction isolation auditing, and race-condition prevention for room inventory allocations and landlord balance/withdrawal operations. Activates when editing rental bookings, room state machines, payment processing, or withdrawal balances.
version: 1.0.0
author: KOSMO Engineering Team
tags:
  - concurrency
  - transaction-isolation
  - race-conditions
  - locking
  - stress-testing
  - mysql
  - tidb
---

# KOSMO Concurrency Stress: Transaction Isolation & Race Condition Auditing

## 1. Overview & Triggers
`kosmo-concurrency-stress` provides testing methodologies, database row-locking standards, and automated stress verification for KOSMO's high-contention business logic. In a multi-tenant rental marketplace, concurrent operations can result in catastrophic double-bookings or negative landlord balances if proper ACID transaction boundaries and pessimistic locking are not enforced.

### Activation Triggers
- Modifying room reservation endpoints (`POST /api/rentals`, `backend/router.ts`).
- Modifying discrete room inventory status transitions (`backend/db.ts`, `rooms` table).
- Modifying landlord balance updates or withdrawal requests (`POST /api/withdrawals`).
- Modifying rental status lifecycle (activation, payment confirmation, lease termination).
- Before deploying database migration scripts altering transactional tables.

---

## 2. High-Contention Scenarios & Required DB Patterns

### 2.1 The Double-Booking Race Condition (Storm 1)
When two tenants click "Sewa Sekarang" (Book Now) at the exact same millisecond for the same discrete room:
- **Flawed Pattern**: Querying `SELECT status FROM rooms WHERE id = ?` followed by a separate `UPDATE rooms SET status = 'occupied'` leaves a race window where both requests see `'available'`.
- **Mandatory Solution**:
  ```typescript
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // 1. Acquire pessimistic lock on the room row
    const [rooms] = await connection.execute<RowDataPacket[]>(
      'SELECT id, status, property_id FROM rooms WHERE id = ? FOR UPDATE',
      [roomId]
    );
    if (!rooms.length || rooms[0].status !== 'available') {
      await connection.rollback();
      return res.status(409).json({ error: 'Room is no longer available' });
    }
    // 2. Mark room as occupied and record rental within the same transaction
    await connection.execute('UPDATE rooms SET status = "occupied" WHERE id = ?', [roomId]);
    await connection.execute(
      'INSERT INTO rentals (id, property_id, room_id, tenant_id, status, ...) VALUES (?, ?, ?, ?, "pending", ...)',
      [...]
    );
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
  ```

### 2.2 Landlord Balance & Withdrawal Deductions
- Balance deduction must use atomic row locking (`SELECT balance FROM users WHERE id = ? FOR UPDATE`) or atomic SQL decrement (`UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?`).
- Rejection of a withdrawal must atomically reverse deducted funds back into the landlord's available balance in a transactional rollback routine.

### 2.3 Rental Termination & Room Release (Storm 2)
- Terminating an active rental (`POST /api/rentals/:id/terminate`) must verify tenant/landlord ownership, update rental status to `'completed'`, and atomically transition the corresponding room status from `'occupied'` back to `'available'`.

---

## 3. Step-by-Step Concurrency Testing Playbook

### Step 1: Execute Concurrency Isolation Test Suite
Run the 4-storm concurrency test harness:
```powershell
# Windows PowerShell
node --import tsx --test --test-force-exit tests/room_concurrency.test.ts
```
```bash
# Linux Bash
node --import tsx --test --test-force-exit tests/room_concurrency.test.ts
```
The suite runs 4 simulated concurrent stress storms:
1. **Storm 1**: 10 simultaneous tenants dispatch concurrent booking requests for the exact same `roomId`. Exactly 1 must win (201 Created), and 9 must receive 409 Conflict.
2. **Storm 2**: Termination of the winning lease releases the room back to available, immediately allowing a subsequent tenant to successfully book.
3. **Storm 3**: A room placed in maintenance mode rejects booking attempts with 409 Conflict.
4. **Storm 4**: Booking with a `roomId` belonging to a different property is rejected with 400/404.

### Step 2: Validate Occupancy Consistency
Check and synchronize property occupancy counts against discrete room records:
```powershell
# Check for discrepancies
npm run db:check-occupancy

# Synchronize occupancy if out of sync
npm run db:sync-occupancy
```

### Step 3: Run High-Load Performance Benchmarks
Benchmark API endpoints under synthetic load:
```powershell
npm run perf:benchmark
npm run perf:functions
```

---

## 4. Failure Modes & Automated Triage Matrix

| Failure Mode | Root Cause | Exact Remediation Procedure |
|---|---|---|
| `ER_LOCK_DEADLOCK` (Deadlock found when trying to get lock) | Two transactions acquired locks in differing table/row order | Enforce consistent lock acquisition order across all endpoints (e.g., always lock `properties`, then `rooms`, then `rentals`). |
| `ER_LOCK_WAIT_TIMEOUT` | A long-running transaction held row locks beyond `innodb_lock_wait_timeout` | Remove network calls (e.g., Cloudinary uploads, external webhooks) from inside the DB transaction block. Only hold locks for pure SQL queries. |
| Test Storm 1 yields >1 successful booking | Missing `FOR UPDATE` clause in room availability check | Ensure `SELECT ... FOR UPDATE` is executed within an active transaction before status mutation. |
| Negative balance in `users` table | Race condition on concurrent withdrawal requests | Add check constraint `CHECK (balance >= 0)` and enforce row-locking before balance deduction. |

---

## 5. Security & Verification Guardrails
1. **Always Release Connections**: Every `pool.getConnection()` MUST have an enclosing `try ... finally { connection.release(); }` block to prevent pool starvation.
2. **Always Rollback on Error**: Catch blocks must invoke `await connection.rollback()` before propagating or handling errors.
3. **Never perform external HTTP calls inside a transaction**: Midtrans network calls and Cloudinary uploads must be completed *before* opening the transaction or *after* committing.
