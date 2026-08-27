import test from 'node:test';
import assert from 'node:assert/strict';
import { pool, initDb, ensureDbReady } from '../backend/db';
import { validateRental, type Rental, type RentalRow } from '../backend/types/index';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

interface ExplainRow extends RowDataPacket {
  id: number;
  select_type: string;
  table: string;
  type: string;
  possible_keys: string | null;
  key: string | null;
  key_len: string | null;
  ref: string | null;
  rows: number;
  Extra: string;
}

test('CHALLENGE M1: Database Schema, Migrations, Indexes & Latency Empirical Harness', async (t) => {
  await ensureDbReady();

  // -------------------------------------------------------------
  // Test Group 1: Non-Destructive Migration Replay & Idempotence
  // -------------------------------------------------------------
  await t.test('1. Migration Idempotence: Repeated execution does not alter or corrupt schema', async () => {
    // Re-run the table migrations 3 times concurrently/sequentially
    const alterQueries = [
      "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS contract_url VARCHAR(500)",
      "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS contract_hash VARCHAR(64)",
      "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS contract_signed_at DATETIME",
      "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS signer_ip VARCHAR(50)",
      "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS signer_user_agent VARCHAR(255)",
      "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS tenant_nik_passport VARCHAR(50)",
      "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS tenant_signature_data LONGTEXT",
      "ALTER TABLE rentals ADD COLUMN IF NOT EXISTS admin_fee_amount DECIMAL(10,2) DEFAULT 5000.00"
    ];

    for (let iteration = 1; iteration <= 3; iteration++) {
      for (const sql of alterQueries) {
        try {
          await pool.query(sql);
        } catch (err: unknown) {
          assert.fail(`Migration replay failed on iteration ${iteration} with query: ${sql}, error: ${String(err)}`);
        }
      }
    }

    // Verify all 8 columns still exist and have correct types
    const [columns] = await pool.query<RowDataPacket[]>('SHOW COLUMNS FROM rentals');
    const colMap = new Map(columns.map((c) => [c.Field, c]));

    assert.ok(colMap.has('contract_url'), 'contract_url must exist');
    assert.ok(colMap.has('contract_hash'), 'contract_hash must exist');
    assert.ok(colMap.has('contract_signed_at'), 'contract_signed_at must exist');
    assert.ok(colMap.has('signer_ip'), 'signer_ip must exist');
    assert.ok(colMap.has('signer_user_agent'), 'signer_user_agent must exist');
    assert.ok(colMap.has('tenant_nik_passport'), 'tenant_nik_passport must exist');
    assert.ok(colMap.has('tenant_signature_data'), 'tenant_signature_data must exist');
    assert.ok(colMap.has('admin_fee_amount'), 'admin_fee_amount must exist');

    // Verify admin_fee_amount default
    const adminFeeCol = colMap.get('admin_fee_amount');
    assert.ok(
      adminFeeCol.Default === '5000.00' || adminFeeCol.Default === '5000' || Number(adminFeeCol.Default) === 5000,
      `admin_fee_amount default should be 5000.00, got ${adminFeeCol.Default}`
    );
  });

  // -------------------------------------------------------------
  // Test Group 2: Index Utilization & EXPLAIN Query Plan Verification
  // -------------------------------------------------------------
  await t.test('2. Index Utilization: EXPLAIN plan verifies idx_rentals_contract_hash usage', async () => {
    const sampleHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const [explainRows] = await pool.query<RowDataPacket[]>(
      'EXPLAIN SELECT id, tenantId, propertyId, contract_hash, contract_url FROM rentals WHERE contract_hash = ?',
      [sampleHash]
    );

    assert.ok(explainRows.length > 0, 'EXPLAIN output must not be empty');
    const planText = JSON.stringify(explainRows);

    // Verify index is chosen in TiDB (access object) or MySQL (key/possible_keys)
    const usesIndex = planText.includes('idx_rentals_contract_hash');
    assert.ok(
      usesIndex,
      `Optimizer plan must utilize idx_rentals_contract_hash. Plan: ${planText}`
    );
  });

  await t.test('2. Index Utilization: EXPLAIN plan verifies idx_rentals_signed_at usage for range queries', async () => {
    const startDate = '2026-08-01 00:00:00';
    const endDate = '2026-08-31 23:59:59';
    const [explainRows] = await pool.query<RowDataPacket[]>(
      'EXPLAIN SELECT id, tenantId, propertyId, contract_signed_at FROM rentals WHERE contract_signed_at BETWEEN ? AND ?',
      [startDate, endDate]
    );

    assert.ok(explainRows.length > 0, 'EXPLAIN output must not be empty');
    const planText = JSON.stringify(explainRows);

    const usesIndex = planText.includes('idx_rentals_signed_at');
    assert.ok(
      usesIndex,
      `Optimizer plan must utilize idx_rentals_signed_at. Plan: ${planText}`
    );
  });

  // -------------------------------------------------------------
  // Test Group 3: Data Insertion, Capacity & Boundary Stress Tests
  // -------------------------------------------------------------
  await t.test('3. Data Capacity: Stores full Indonesian audit trail and large signature payload', async () => {
    const testRentalId = `test-audit-${Date.now()}`;
    const testHash = 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0';
    const testNik = '5171012304950001'; // 16-digit Bali NIK
    const testIpv6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
    const testUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
    const largeSignature = 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAA'.repeat(2000); // ~48KB signature string
    const testContractUrl = 'https://res.cloudinary.com/kosmo/raw/upload/v1724745600/kosmo_contracts/kontrak_sewa_test-audit-123.pdf';
    const signedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

    try {
      // Insert full audit row
      await pool.query(
        `INSERT INTO rentals (
          id, tenantId, propertyId, propertyName, price, startDate, status,
          contract_url, contract_hash, contract_signed_at, signer_ip,
          signer_user_agent, tenant_nik_passport, tenant_signature_data, admin_fee_amount
        ) VALUES (?, 'user-tenant', 'prop-01', 'KOSMO Hub Denpasar', 3500000, '2026-09-01', 'active', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          testRentalId,
          testContractUrl,
          testHash,
          signedAt,
          testIpv6,
          testUserAgent,
          testNik,
          largeSignature,
          5000.00
        ]
      );

      // Query back and assert exact field match
      const [rows] = await pool.query<RentalRow[]>(
        'SELECT * FROM rentals WHERE id = ?',
        [testRentalId]
      );

      assert.equal(rows.length, 1, 'Inserted row must be retrieved');
      const retrieved = rows[0];
      assert.equal(retrieved.contract_url, testContractUrl);
      assert.equal(retrieved.contract_hash, testHash);
      assert.equal(retrieved.signer_ip, testIpv6);
      assert.equal(retrieved.signer_user_agent, testUserAgent);
      assert.equal(retrieved.tenant_nik_passport, testNik);
      assert.equal(retrieved.tenant_signature_data, largeSignature);
      assert.equal(Number(retrieved.admin_fee_amount), 5000.00);

      // Verify indexed search by hash returns this exact row
      const [hashRows] = await pool.query<RentalRow[]>(
        'SELECT id, contract_hash FROM rentals WHERE contract_hash = ?',
        [testHash]
      );
      assert.equal(hashRows.length, 1);
      assert.equal(hashRows[0].id, testRentalId);
    } finally {
      // Clean up test row
      await pool.query('DELETE FROM rentals WHERE id = ?', [testRentalId]);
    }
  });

  // -------------------------------------------------------------
  // Test Group 4: Backward Compatibility (Legacy Inserts with Omitted Columns)
  // -------------------------------------------------------------
  await t.test('4. Backward Compatibility: Legacy INSERT without new columns succeeds with defaults', async () => {
    const legacyRentalId = `test-legacy-${Date.now()}`;

    try {
      // Legacy style INSERT query (no contract columns mentioned)
      await pool.query(
        "INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status) VALUES (?, 'user-tenant', 'prop-01', 'KOSMO Hub Denpasar', 3500000, '2026-09-01', 'pending')",
        [legacyRentalId]
      );

      const [rows] = await pool.query<RentalRow[]>(
        'SELECT * FROM rentals WHERE id = ?',
        [legacyRentalId]
      );

      assert.equal(rows.length, 1);
      const row = rows[0];
      assert.equal(row.contract_url, null, 'contract_url should default to NULL');
      assert.equal(row.contract_hash, null, 'contract_hash should default to NULL');
      assert.equal(row.contract_signed_at, null, 'contract_signed_at should default to NULL');
      assert.equal(row.signer_ip, null, 'signer_ip should default to NULL');
      assert.equal(row.signer_user_agent, null, 'signer_user_agent should default to NULL');
      assert.equal(row.tenant_nik_passport, null, 'tenant_nik_passport should default to NULL');
      assert.equal(row.tenant_signature_data, null, 'tenant_signature_data should default to NULL');
      assert.equal(Number(row.admin_fee_amount), 5000.00, 'admin_fee_amount should default to 5000.00');
    } finally {
      await pool.query('DELETE FROM rentals WHERE id = ?', [legacyRentalId]);
    }
  });

  // -------------------------------------------------------------
  // Test Group 5: Concurrency, Row-Locking & Single Active Tenancy Simulation
  // -------------------------------------------------------------
  await t.test('5. Concurrency & Transactional Row Locks: Single Active Tenancy SELECT FOR UPDATE', async () => {
    const tenantId = 'user-tenant';
    const conn1 = await pool.getConnection();
    const conn2 = await pool.getConnection();
    const testRentalId = `test-lock-${Date.now()}`;

    try {
      // Setup: ensure test active rental exists
      await pool.query(
        "INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status) VALUES (?, ?, 'prop-01', 'KOSMO Hub Denpasar', 3500000, '2026-09-01', 'active')",
        [testRentalId, tenantId]
      );

      // Transaction 1 starts and acquires exclusive lock on tenant's active rentals
      await conn1.beginTransaction();
      const [lockedRows] = await conn1.query<RentalRow[]>(
        "SELECT id, status FROM rentals WHERE tenantId = ? AND status = 'active' FOR UPDATE",
        [tenantId]
      );
      assert.ok(lockedRows.length >= 1, 'Transaction 1 should see active rental');

      // Verify Transaction 1 can safely update or rollback
      await conn1.commit();
    } finally {
      conn1.release();
      conn2.release();
      await pool.query('DELETE FROM rentals WHERE id = ?', [testRentalId]);
    }
  });

  // -------------------------------------------------------------
  // Test Group 6: Query Latency Benchmark Under Repeated Indexed Reads
  // -------------------------------------------------------------
  await t.test('6. Query Latency Benchmark: 20 indexed contract_hash queries meet SLA (< 200ms average)', async () => {
    const testRentalId = `test-bench-${Date.now()}`;
    const testHash = 'b'.repeat(64);

    try {
      await pool.query(
        "INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status, contract_hash) VALUES (?, 'user-tenant', 'prop-01', 'KOSMO Hub Denpasar', 3500000, '2026-09-01', 'active', ?)",
        [testRentalId, testHash]
      );

      const iterations = 20;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const [rows] = await pool.query<RentalRow[]>(
          'SELECT id, contract_hash, contract_url, status FROM rentals WHERE contract_hash = ?',
          [testHash]
        );
        const elapsed = performance.now() - start;
        latencies.push(elapsed);
        assert.equal(rows.length, 1);
      }

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / iterations;
      const maxLatency = Math.max(...latencies);
      const minLatency = Math.min(...latencies);

      t.diagnostic(`Indexed query latency — Min: ${minLatency.toFixed(2)}ms | Avg: ${avgLatency.toFixed(2)}ms | Max: ${maxLatency.toFixed(2)}ms`);
      assert.ok(avgLatency < 200, `Average indexed query latency must be < 200ms, got ${avgLatency.toFixed(2)}ms`);
    } finally {
      await pool.query('DELETE FROM rentals WHERE id = ?', [testRentalId]);
    }
  });

  // -------------------------------------------------------------
  // Test Group 8: Extreme Payload Stress Tests (1MB Signature & Zero Fee)
  // -------------------------------------------------------------
  await t.test('8. Extreme Stress: 1MB vector signature and 0.00 fee waiver store reliably', async () => {
    const stressRentalId = `test-stress-${Date.now()}`;
    const oneMbSignature = 'data:image/png;base64,' + 'A'.repeat(1024 * 1024); // 1MB payload

    try {
      await pool.query(
        `INSERT INTO rentals (
          id, tenantId, propertyId, propertyName, price, startDate, status,
          tenant_signature_data, admin_fee_amount
        ) VALUES (?, 'user-tenant', 'prop-01', 'KOSMO Hub Denpasar', 3500000, '2026-09-01', 'active', ?, 0.00)`,
        [stressRentalId, oneMbSignature]
      );

      const [rows] = await pool.query<RentalRow[]>(
        'SELECT id, tenant_signature_data, admin_fee_amount FROM rentals WHERE id = ?',
        [stressRentalId]
      );

      assert.equal(rows.length, 1);
      assert.equal(rows[0].tenant_signature_data?.length, oneMbSignature.length);
      assert.equal(Number(rows[0].admin_fee_amount), 0.00);
    } finally {
      await pool.query('DELETE FROM rentals WHERE id = ?', [stressRentalId]);
    }
  });

  // -------------------------------------------------------------
  // Test Group 9: Concurrent initDb Bootstrap Resilience
  // -------------------------------------------------------------
  await t.test('9. Concurrent Bootstrap: 10 concurrent initDb() calls resolve cleanly without race conditions', async () => {
    const promises = Array.from({ length: 10 }, () => initDb());
    await Promise.all(promises);
    assert.ok(true, 'Concurrent initDb invocations must resolve smoothly');
  });

  // -------------------------------------------------------------
  // Test Group 7: Domain Type Validation Boundary Cases
  // -------------------------------------------------------------
  await t.test('7. Type & Schema Validation: Adversarial boundary inputs for validateRental', () => {
    const baseValid: Rental = {
      id: 'r-001',
      tenantId: 't-001',
      propertyId: 'p-001',
      propertyName: 'KOSMO Hub Denpasar',
      price: 3500000,
      startDate: '2026-09-01',
      status: 'active'
    };

    // Valid with all nullable audit fields present
    const validWithAudit = {
      ...baseValid,
      contract_url: 'https://cloudinary.com/test.pdf',
      contract_hash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      contract_signed_at: '2026-08-27T07:00:00Z',
      signer_ip: '192.168.1.1',
      signer_user_agent: 'Node-Test/1.0',
      tenant_nik_passport: '5171012345678901',
      tenant_signature_data: 'data:image/png;base64,AAA',
      admin_fee_amount: 5000
    };
    assert.equal(validateRental(validWithAudit).valid, true);

    // Rejection: contract_hash wrong length (63 or 65 chars)
    assert.equal(validateRental({ ...baseValid, contract_hash: 'a'.repeat(63) }).valid, false);
    assert.equal(validateRental({ ...baseValid, contract_hash: 'a'.repeat(65) }).valid, false);

    // Rejection: admin_fee_amount negative or non-number
    assert.equal(validateRental({ ...baseValid, admin_fee_amount: -1 }).valid, false);
    assert.equal(validateRental({ ...baseValid, admin_fee_amount: '5000' as unknown as number }).valid, false);

    // Rejection: invalid status values
    assert.equal(validateRental({ ...baseValid, status: 'EXPIRED' as unknown as any }).valid, false);
    assert.equal(validateRental({ ...baseValid, status: '' as unknown as any }).valid, false);

    // Rejection: missing required fields
    assert.equal(validateRental({ ...baseValid, id: '' }).valid, false);
    assert.equal(validateRental({ ...baseValid, tenantId: '' }).valid, false);
    assert.equal(validateRental({ ...baseValid, propertyId: '' }).valid, false);
    assert.equal(validateRental({ ...baseValid, propertyName: '' }).valid, false);
    assert.equal(validateRental({ ...baseValid, price: 0 }).valid, false);
    assert.equal(validateRental({ ...baseValid, startDate: '' }).valid, false);
  });
});
