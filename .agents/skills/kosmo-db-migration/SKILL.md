---
name: kosmo-db-migration
description: Guide for database schema evolution, TiDB Cloud / MySQL migrations, composite index maintenance, seed integrity, and connection pooling. Activates when adding or altering SQL tables, columns, indexes, foreign keys, or debugging database performance.
version: 1.0.0
author: KOSMO Engineering Team
tags:
  - database
  - migrations
  - tidb
  - mysql
  - indexing
  - performance
---

# KOSMO DB Migration: Schema Evolution, Indexes & TiDB Maintenance

## 1. Overview & Triggers
`kosmo-db-migration` dictates the safe evolution of KOSMO's relational schema on TiDB Cloud Serverless (MySQL 8.0 compatible). It ensures all DDL migrations are idempotent, zero-downtime, and backward-compatible with existing serverless endpoints.

### Activation Triggers
- Adding or altering tables or columns in `backend/db.ts` (`createTables()`, `applyMigrations()`).
- Adding or tuning database indexes (`ensureIndexes()`, `scripts/check_db_indexes.ts`).
- Modifying connection pool options (`createPool`, SSL configurations, connection limits).
- Diagnosing database connection timeouts, cold start latency, or query bottlenecks.
- Reseeding development or test databases (`npm run db:seed`).

---

## 2. Architectural Blueprint & Domain Tables

The KOSMO schema consists of 8 core domain tables:
1. `users`: Authentication, roles (`admin`, `landlord`, `tenant`), balances, KYC identity (NIK/passport, phone).
2. `properties`: Boarding house properties, pricing, address, coordinates, room totals, landlord relation.
3. `property_facilities`: Normalized facilities linked to properties.
4. `rooms`: Discrete room inventory per property, status (`available`, `occupied`, `maintenance`), room numbers.
5. `rentals`: Active and historical leases, payment status, duration, digital contract hash, signature URL.
6. `reviews`: Tenant ratings and comments per property.
7. `withdrawals`: Landlord fund disbursement requests, bank account details, processing status.
8. `visitor_tracking`: Analytics on property view counts and traffic.

---

## 3. Modular Database Lifecycle Standards (`backend/db.ts`)

The database module exposes modular subroutines to manage startup and schema lifecycle cleanly:
- `validateDatabaseConfig()`: Asserts that required environment variables (`DB_HOST`, `DB_USER`, etc.) are present and properly formatted.
- `initDb()`: Creates database if not present.
- `createTables()`: Executes `CREATE TABLE IF NOT EXISTS` for all 8 core tables with strict foreign key constraints.
- `applyMigrations()`: Executes forward-compatible, non-destructive schema migrations.
- `ensureIndexes()`: Idempotently creates composite indexes for search, filtering, and foreign key joins.
- `seedDatabase()`: Populates default roles, sample properties, facilities, and reviews.
- `ensureDbReady()`: Master orchestration function wrapped with single-flight memoization to prevent cold-start race conditions.

### 3.1 Rules for Safe Schema Evolution
1. **Always Use `IF NOT EXISTS`**: Never run raw `CREATE TABLE` without `IF NOT EXISTS`.
2. **Safe Column Additions**: In MySQL/TiDB, check `information_schema.COLUMNS` before adding a column, or handle duplicate column errors gracefully:
   ```typescript
   try {
     await connection.execute(`ALTER TABLE users ADD COLUMN kyc_status VARCHAR(20) DEFAULT 'unverified'`);
   } catch (err: any) {
     if (err.code !== 'ER_DUP_FIELDNAME') throw err;
   }
   ```
3. **No Destructive Drops**: Never drop columns or tables in automated migrations. Mark columns as deprecated first.
4. **Zero Downtime Index Creation**: Use non-blocking index additions.

---

## 4. Step-by-Step DB Operation Runbook

### Step 1: Diagnose Connection & Health
Verify pool connectivity and latency to TiDB Cloud:
```powershell
npm run db:diagnose
```

### Step 2: Verify & Audit Database Indexes
Inspect index coverage across all tables to avoid full table scans:
```powershell
npm run db:check-indexes
```
Expected composite indexes:
- `idx_properties_status_price` on `properties(status, price)`
- `idx_rentals_tenant_status` on `rentals(tenant_id, status)`
- `idx_rooms_property_status` on `rooms(property_id, status)`
- `idx_reviews_property` on `reviews(property_id)`
- `idx_withdrawals_landlord` on `withdrawals(landlord_id, status)`

### Step 3: Reseed Database to Pristine State
Reset and populate demo data:
```powershell
npm run db:seed
```

### Step 4: Run Database Integration & Lifecycle Tests
```powershell
node --import tsx --test --test-force-exit tests/db_init.test.ts
node --import tsx --test --test-force-exit tests/db_integration.test.ts
```

---

## 5. Failure Modes & Automated Triage Matrix

| Failure Mode | Root Cause | Exact Remediation Procedure |
|---|---|---|
| `getaddrinfo ENOTFOUND gateway01...` | DNS resolution failure or network disconnect from TiDB Cloud | Check host internet connectivity. Verify `DB_HOST` in `.env`. |
| `ER_ACCESS_DENIED_ERROR` | Incorrect database username or password | Verify `DB_USER` and `DB_PASSWORD` against TiDB Cloud Console. In TiDB Cloud, username must include cluster prefix (e.g., `<prefix>.root`). |
| `PROTOCOL_CONNECTION_LOST` | Idle connection terminated by TiDB serverless sleep timeout | Ensure pool is configured with `enableKeepAlive: true`, `keepAliveInitialDelay: 10000`, and handles reconnection. |
| `SSL connection error` or self-signed cert rejection | TiDB requires TLS, but client is attempting unencrypted connection | Set `DB_SSL=true` in environment. `backend/db.ts` will configure `ssl: { rejectUnauthorized: false }`. |
| `ER_DUP_KEYNAME` when adding index | Index already exists from previous migration run | Query `information_schema.STATISTICS` before running `CREATE INDEX`, or catch `ER_DUP_KEYNAME`. |

---

## 6. Security & Operational Guardrails
1. **Strict TLS/SSL Enforcement**: All connections to TiDB Cloud in production must use encrypted SSL (`DB_SSL=true`).
2. **Zero Plaintext Credentials**: Never store DB passwords in repositories or logs.
3. **Transaction Safety**: All multi-statement mutations must use `pool.getConnection()` with explicit `beginTransaction()`, `commit()`, and `rollback()`.
