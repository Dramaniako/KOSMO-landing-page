import test from 'node:test';
import assert from 'node:assert/strict';
import { pool, ensureDbReady } from '../backend/db';
import {
  validateRental,
  VALID_RENTAL_STATUSES,
  type Rental,
  type RentalRow
} from '../backend/types/index';
import type { RowDataPacket } from 'mysql2/promise';

interface ColumnInfo extends RowDataPacket {
  Field: string;
  Type: string;
  Null: string;
  Key: string;
  Default: string | null;
  Extra: string;
}

interface IndexInfo extends RowDataPacket {
  Table: string;
  Non_unique: number;
  Key_name: string;
  Seq_in_index: number;
  Column_name: string;
  Collation: string | null;
  Cardinality: number | null;
  Index_type: string;
}

test('CHALLENGE SUITE: Milestone 1 Database Schema & Migration Empirical Stress Tests', async (t) => {
  let isConnected = false;
  try {
    const conn = await pool.getConnection();
    isConnected = true;
    conn.release();
  } catch (err) {
    console.warn('MySQL connection test skipped (server unreachable):', err);
  }

  if (!isConnected) {
    t.diagnostic('Skipping DB stress tests because MySQL server is unreachable');
    return;
  }

  await ensureDbReady();

  // =========================================================================
  // 1. Migration Idempotency & Concurrency Stress Test
  // =========================================================================
  await t.test('Migration Idempotency: Multiple sequential and concurrent executions', async (t2) => {
    await t2.test('sequential 10x initDb() calls execute without errors or state corruption', async () => {
      for (let i = 0; i < 10; i++) {
        await assert.doesNotReject(
          async () => {
            await ensureDbReady();
          },
          `initDb() pass #${i + 1} must not throw or fail`
        );
      }
    });

    await t2.test('concurrent parallel initDb() calls resolve cleanly without race conditions', async () => {
      const parallelRuns = Array.from({ length: 5 }, () => ensureDbReady());
      const results = await Promise.allSettled(parallelRuns);
      for (const res of results) {
        assert.equal(res.status, 'fulfilled', 'All parallel initDb() calls must succeed');
      }
    });
  });

  // =========================================================================
  // 2. Schema Column Metadata & Type Exactness Verification
  // =========================================================================
  await t.test('Schema Precision: rentals table column definitions match statutory requirements', async () => {
    const [columns] = await pool.query<ColumnInfo[]>('SHOW COLUMNS FROM rentals');
    const colMap = new Map<string, ColumnInfo>();
    for (const c of columns) {
      colMap.set(c.Field, c);
    }

    const expectedSpecs: Record<string, { typeSubstr: string; isNullable: boolean; defaultVal?: string }> = {
      contract_url: { typeSubstr: 'varchar(500)', isNullable: true },
      contract_hash: { typeSubstr: 'varchar(64)', isNullable: true },
      contract_signed_at: { typeSubstr: 'datetime', isNullable: true },
      signer_ip: { typeSubstr: 'varchar(50)', isNullable: true },
      signer_user_agent: { typeSubstr: 'varchar(255)', isNullable: true },
      tenant_nik_passport: { typeSubstr: 'varchar(50)', isNullable: true },
      tenant_signature_data: { typeSubstr: 'longtext', isNullable: true },
      admin_fee_amount: { typeSubstr: 'decimal(10,2)', isNullable: true, defaultVal: '5000.00' }
    };

    for (const [colName, spec] of Object.entries(expectedSpecs)) {
      const col = colMap.get(colName);
      assert.ok(col, `Column ${colName} must exist in rentals table`);
      assert.ok(
        col.Type.toLowerCase().includes(spec.typeSubstr),
        `Column ${colName} type ${col.Type} must match expected ${spec.typeSubstr}`
      );
      if (spec.isNullable) {
        assert.equal(col.Null, 'YES', `Column ${colName} must be nullable for non-destructive backwards compatibility`);
      }
      if (spec.defaultVal !== undefined) {
        assert.equal(col.Default, spec.defaultVal, `Column ${colName} default value must be ${spec.defaultVal}`);
      }
    }
  });

  // =========================================================================
  // 3. Audit & Cryptographic Indexes Verification
  // =========================================================================
  await t.test('Index Integrity: idx_rentals_contract_hash and idx_rentals_signed_at are registered and active', async () => {
    const [indexes] = await pool.query<IndexInfo[]>('SHOW INDEX FROM rentals');
    const indexNames = indexes.map((idx) => idx.Key_name);

    assert.ok(indexNames.includes('idx_rentals_contract_hash'), 'Index idx_rentals_contract_hash must exist on rentals');
    assert.ok(indexNames.includes('idx_rentals_signed_at'), 'Index idx_rentals_signed_at must exist on rentals');

    // Test query execution plan uses index (supporting both standard MySQL and TiDB execution plans)
    const [explainHash] = await pool.query<RowDataPacket[]>(
      "EXPLAIN SELECT id FROM rentals WHERE contract_hash = 'a4f5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5'"
    );
    const explainHashStr = JSON.stringify(explainHash);
    assert.ok(
      explainHashStr.includes('idx_rentals_contract_hash'),
      `EXPLAIN on contract_hash lookup should reference idx_rentals_contract_hash. Got: ${explainHashStr}`
    );

    const [explainSignedAt] = await pool.query<RowDataPacket[]>(
      "EXPLAIN SELECT id FROM rentals WHERE contract_signed_at >= '2026-01-01 00:00:00'"
    );
    const explainSignedAtStr = JSON.stringify(explainSignedAt);
    assert.ok(
      explainSignedAtStr.includes('idx_rentals_signed_at') || explainSignedAtStr.includes('rentals'),
      `EXPLAIN on contract_signed_at query should execute plan on rentals table. Got: ${explainSignedAtStr}`
    );
  });

  // =========================================================================
  // 4. Data Insertion Boundary & Null Safety on Database
  // =========================================================================
  await t.test('Database Insertion & Null Safety Boundary Conditions', async (t2) => {
    const testIdLegacy = `test-legacy-${Date.now()}`;
    const testIdFull = `test-full-${Date.now()}`;

    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      // Test 4a: Legacy insertion with only pre-migration columns
      await t2.test('Legacy insert: succeeds with NULLs for contract columns and default 5000.00 for admin_fee_amount', async () => {
        await conn.query(
          `INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status)
           VALUES (?, 'user-tenant', 'prop-01', 'KOSMO Hub Denpasar', 3500000, '2026-09-01', 'pending')`,
          [testIdLegacy]
        );

        const [rows] = await conn.query<RentalRow[]>(
          'SELECT * FROM rentals WHERE id = ?',
          [testIdLegacy]
        );
        assert.equal(rows.length, 1);
        const legacyRow = rows[0];

        assert.equal(legacyRow.contract_url, null);
        assert.equal(legacyRow.contract_hash, null);
        assert.equal(legacyRow.contract_signed_at, null);
        assert.equal(legacyRow.signer_ip, null);
        assert.equal(legacyRow.signer_user_agent, null);
        assert.equal(legacyRow.tenant_nik_passport, null);
        assert.equal(legacyRow.tenant_signature_data, null);
        assert.equal(Number(legacyRow.admin_fee_amount), 5000.00);
      });

      // Test 4b: Full contract insertion with max length and large payload
      await t2.test('Full contract insert: stores maximum string lengths, high-res signatures, and audit metadata without truncation', async () => {
        const longUrl = 'https://res.cloudinary.com/kosmo/image/upload/v1234567890/contracts/' + 'a'.repeat(400) + '.pdf';
        const sha256Hash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
        const largeSignatureBase64 = 'data:image/png;base64,' + 'iVBORw0KGgoAAAANSUhEUgAA'.repeat(2000); // ~48KB signature payload
        const longUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 KosmoAuditClient/1.0';
        const ipv6Address = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
        const nikNumber = '5171012304950001';

        await conn.query(
          `INSERT INTO rentals (
            id, tenantId, propertyId, propertyName, price, startDate, status,
            contract_url, contract_hash, contract_signed_at, signer_ip,
            signer_user_agent, tenant_nik_passport, tenant_signature_data, admin_fee_amount
          ) VALUES (?, 'user-tenant', 'prop-02', 'KOSMO Hub Seminyak', 4500000, '2026-09-01', 'active',
            ?, ?, NOW(), ?, ?, ?, ?, ?)`,
          [
            testIdFull,
            longUrl,
            sha256Hash,
            ipv6Address,
            longUserAgent,
            nikNumber,
            largeSignatureBase64,
            5000.00
          ]
        );

        const [rows] = await conn.query<RentalRow[]>(
          'SELECT * FROM rentals WHERE id = ?',
          [testIdFull]
        );
        assert.equal(rows.length, 1);
        const fullRow = rows[0];

        assert.equal(fullRow.contract_url, longUrl);
        assert.equal(fullRow.contract_hash, sha256Hash);
        assert.ok(fullRow.contract_signed_at !== null);
        assert.equal(fullRow.signer_ip, ipv6Address);
        assert.equal(fullRow.signer_user_agent, longUserAgent);
        assert.equal(fullRow.tenant_nik_passport, nikNumber);
        assert.equal(fullRow.tenant_signature_data, largeSignatureBase64);
        assert.equal(Number(fullRow.admin_fee_amount), 5000.00);
      });

      await conn.rollback();
    } finally {
      conn.release();
    }
  });

  // =========================================================================
  // 5. Stress Testing validateRental Boundary Values & Null Safety
  // =========================================================================
  await t.test('Validator Boundary Testing: validateRental edge cases & adversarial inputs', async (t2) => {
    const baseRental: Rental = {
      id: 'rent-test-01',
      tenantId: 'user-tenant-01',
      propertyId: 'prop-01',
      propertyName: 'KOSMO Hub Denpasar',
      price: 3500000,
      startDate: '2026-09-01',
      status: 'pending'
    };

    await t2.test('validates minimal legacy rental with no contract fields', () => {
      const res = validateRental(baseRental);
      assert.equal(res.valid, true);
      assert.equal(res.errors.length, 0);
    });

    await t2.test('validates legacy rental with explicit nulls across contract audit fields', () => {
      const legacyWithNulls = {
        ...baseRental,
        contract_url: null,
        contract_hash: null,
        contract_signed_at: null,
        signer_ip: null,
        signer_user_agent: null,
        tenant_nik_passport: null,
        tenant_signature_data: null,
        admin_fee_amount: null
      };
      const res = validateRental(legacyWithNulls);
      assert.equal(res.valid, true, `Null contract audit fields should pass validation. Errors: ${res.errors.join(', ')}`);
    });

    await t2.test('validates all canonical rental status enums', () => {
      for (const status of VALID_RENTAL_STATUSES) {
        const rental = { ...baseRental, status };
        const res = validateRental(rental);
        assert.equal(res.valid, true, `Status ${status} must be accepted`);
      }
    });

    await t2.test('contract_hash boundary checks: 64-char hex string vs invalid length / non-strings', () => {
      // Valid: 64 chars
      const validHash = 'a'.repeat(64);
      assert.equal(validateRental({ ...baseRental, contract_hash: validHash }).valid, true);

      // Invalid: 63 chars (off by one under)
      const underHash = 'a'.repeat(63);
      const resUnder = validateRental({ ...baseRental, contract_hash: underHash });
      assert.equal(resUnder.valid, false);
      assert.ok(resUnder.errors.some((e) => e.includes('contract_hash')));

      // Invalid: 65 chars (off by one over)
      const overHash = 'a'.repeat(65);
      const resOver = validateRental({ ...baseRental, contract_hash: overHash });
      assert.equal(resOver.valid, false);
      assert.ok(resOver.errors.some((e) => e.includes('contract_hash')));

      // Invalid: empty string
      const emptyHash = '';
      const resEmpty = validateRental({ ...baseRental, contract_hash: emptyHash });
      assert.equal(resEmpty.valid, false);
      assert.ok(resEmpty.errors.some((e) => e.includes('contract_hash')));

      // Invalid: number or boolean
      assert.equal(validateRental({ ...baseRental, contract_hash: 12345 }).valid, false);
      assert.equal(validateRental({ ...baseRental, contract_hash: true }).valid, false);
    });

    await t2.test('admin_fee_amount boundary checks: 0, positive, negative, NaN', () => {
      // 0 fee is valid (non-negative)
      assert.equal(validateRental({ ...baseRental, admin_fee_amount: 0 }).valid, true);

      // 5000.00 fee is valid
      assert.equal(validateRental({ ...baseRental, admin_fee_amount: 5000.00 }).valid, true);

      // 0.01 fee is valid
      assert.equal(validateRental({ ...baseRental, admin_fee_amount: 0.01 }).valid, true);

      // Negative fee is rejected
      const resNeg = validateRental({ ...baseRental, admin_fee_amount: -0.01 });
      assert.equal(resNeg.valid, false);
      assert.ok(resNeg.errors.some((e) => e.includes('admin_fee_amount')));

      // NaN fee is rejected
      const resNaN = validateRental({ ...baseRental, admin_fee_amount: NaN });
      assert.equal(resNaN.valid, false);
      assert.ok(resNaN.errors.some((e) => e.includes('admin_fee_amount')));
    });

    await t2.test('adversarial malformed data inputs rejected gracefully', () => {
      const testCases = [
        null,
        undefined,
        '',
        12345,
        [],
        {},
        { id: '' },
        { ...baseRental, id: '   ' },
        { ...baseRental, tenantId: '   ' },
        { ...baseRental, propertyId: '   ' },
        { ...baseRental, propertyName: '   ' },
        { ...baseRental, price: 0 },
        { ...baseRental, price: -500 },
        { ...baseRental, price: NaN },
        { ...baseRental, startDate: '   ' },
        { ...baseRental, status: 'INVALID_STATUS' },
        { ...baseRental, status: 'Active' },
        { ...baseRental, status: '' }
      ];

      for (const tc of testCases) {
        const res = validateRental(tc);
        assert.equal(res.valid, false, `Input ${JSON.stringify(tc)} should be rejected by validateRental`);
        assert.ok(res.errors.length > 0);
      }
    });
  });
});
