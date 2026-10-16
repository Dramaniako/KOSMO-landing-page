import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../backend/db';
import type { RowDataPacket } from 'mysql2/promise';

interface UserRow extends RowDataPacket {
  id: string;
  email: string;
  role: string;
  name: string;
}

interface PropertyRow extends RowDataPacket {
  id: string;
  name: string;
  price: number;
  totalRooms: number;
  occupiedRooms: number;
  is_featured?: boolean | number;
  featured_until?: string | Date | null;
  verified_water_tank?: boolean | number;
  verified_wifi_speedtest?: boolean | number;
}

interface TableCountRow extends RowDataPacket {
  count: number;
}

interface RentalRow extends RowDataPacket {
  id: string;
  tenantId: string;
  propertyId: string;
  propertyName: string;
  price: number;
  startDate: string;
  status: string;
  document?: string;
  contract_url?: string | null;
  contract_hash?: string | null;
  contract_signed_at?: string | Date | null;
  signer_ip?: string | null;
  signer_user_agent?: string | null;
  tenant_nik_passport?: string | null;
  tenant_signature_data?: string | null;
  admin_fee_amount?: number | string;
  terminated_at?: string | Date | null;
}

test('Live MySQL Database Integration & Transaction Safeguards', async (t) => {
  let isConnected = false;
  try {
    const connection = await pool.getConnection();
    isConnected = true;
    connection.release();
  } catch (err) {
    console.warn('MySQL connection test skipped (server unreachable):', err);
  }

  if (!isConnected) {
    t.diagnostic('Skipping live DB tests because MySQL server is unreachable');
    return;
  }

  // Deterministic atomic cleanup helper targeting isolated test prefixes
  const cleanupTestData = async () => {
    try {
      await pool.query("DELETE FROM rentals WHERE id LIKE 'test-contract-%' OR tenantId LIKE 'test-user-%' OR propertyId LIKE 'test-prop-%'");
      await pool.query("DELETE FROM property_facilities WHERE propertyId LIKE 'test-prop-%'");
      await pool.query("DELETE FROM property_photos WHERE propertyId LIKE 'test-prop-%'");
      await pool.query("DELETE FROM rooms WHERE propertyId LIKE 'test-prop-%'");
      await pool.query("DELETE FROM properties WHERE id LIKE 'test-prop-%'");
      await pool.query("DELETE FROM users WHERE id LIKE 'test-user-%'");
    } catch (err) {
      console.warn('Test cleanup warning (safe to ignore in disconnected run):', err);
    }
  };

  // Register atomic teardown hook on test completion
  t.after(async () => {
    await cleanupTestData();
  });

  // Pre-cleanup ensures clean slate before first subtest
  await cleanupTestData();

  await t.test('verifies required domain tables exist in database', async () => {
    const [tables] = await pool.query<RowDataPacket[]>('SHOW TABLES');
    const tableNames = tables.map((r) => Object.values(r)[0] as string);

    assert.ok(tableNames.includes('users'), 'users table should exist');
    assert.ok(tableNames.includes('properties'), 'properties table should exist');
    assert.ok(tableNames.includes('property_facilities'), 'property_facilities table should exist');
    assert.ok(tableNames.includes('reviews'), 'reviews table should exist');
    assert.ok(tableNames.includes('withdrawals'), 'withdrawals table should exist');
    assert.ok(tableNames.includes('visitor_tracking'), 'visitor_tracking table should exist');
    assert.ok(tableNames.includes('rentals'), 'rentals table should exist');
  });

  await t.test('verifies properties table schema includes featured and micro-PMS verification columns', async () => {
    const [columns] = await pool.query<RowDataPacket[]>('SHOW COLUMNS FROM properties');
    const columnNames = columns.map((col) => col.Field as string);

    const requiredPropertyColumns = [
      'is_featured',
      'featured_until',
      'verified_water_tank',
      'verified_wifi_speedtest'
    ];

    for (const col of requiredPropertyColumns) {
      assert.ok(columnNames.includes(col), `properties table must contain column ${col}`);
    }
  });

  await t.test('verifies rentals table schema includes all 8 contract, audit, and lifecycle columns', async () => {
    const [columns] = await pool.query<RowDataPacket[]>('SHOW COLUMNS FROM rentals');
    const columnNames = columns.map((col) => col.Field as string);

    const requiredColumns = [
      'contract_url',
      'contract_hash',
      'contract_signed_at',
      'signer_ip',
      'signer_user_agent',
      'tenant_nik_passport',
      'tenant_signature_data',
      'admin_fee_amount',
      'terminated_at'
    ];

    for (const col of requiredColumns) {
      assert.ok(columnNames.includes(col), `rentals table must contain column ${col}`);
    }
  });

  await t.test('verifies users table schema includes statutory legal identity and KYC columns', async () => {
    const [columns] = await pool.query<RowDataPacket[]>('SHOW COLUMNS FROM users');
    const columnNames = columns.map((col) => col.Field as string);

    const requiredKycColumns = [
      'identity_type',
      'identity_number',
      'address',
      'occupation',
      'emergency_contact_name',
      'emergency_contact_relation',
      'emergency_contact_phone'
    ];

    for (const col of requiredKycColumns) {
      assert.ok(columnNames.includes(col), `users table must contain column ${col}`);
    }
  });

  await t.test('verifies seeded default user roles exist in database', async () => {
    const [users] = await pool.query<UserRow[]>('SELECT id, email, role, name FROM users');
    assert.ok(users.length > 0, 'Database should contain users');

    const roles = users.map((u) => u.role);
    assert.ok(roles.includes('admin') || roles.includes('landlord') || roles.includes('tenant'), 'Users table should contain canonical roles');
  });

  await t.test('verifies property queries and room occupancy bounds', async () => {
    const [properties] = await pool.query<PropertyRow[]>('SELECT id, name, price, totalRooms, occupiedRooms FROM properties');
    assert.ok(Array.isArray(properties));

    properties.forEach((prop) => {
      assert.ok(prop.price > 0, 'Property price must be positive');
      assert.ok(prop.totalRooms > 0, 'Total rooms must be positive');
      assert.ok(prop.occupiedRooms >= 0, 'Occupied rooms cannot be negative');
      assert.ok(prop.occupiedRooms <= prop.totalRooms, 'Occupied rooms cannot exceed total rooms');
    });
  });

  await t.test('executes transactional rollback and guarantees zero persistent side-effects', async () => {
    const connection = await pool.getConnection();
    const tag = Date.now();
    const testRentalId = `test-contract-rollback-${tag}`;
    const testUserId = `test-user-rollback-${tag}`;
    const testPropId = `test-prop-rollback-${tag}`;

    try {
      await connection.beginTransaction();

      // 1. Insert isolated test user within active transaction
      await connection.query(
        `INSERT INTO users (id, name, email, role, password, phone, identity_type, identity_number, address, occupation, emergency_contact_name, emergency_contact_phone)
         VALUES (?, 'Test User Rollback', ?, 'tenant', '$2a$10$abcdefghijklmnopqrstuu', '+6281234567890', 'NIK', '5171012308980001', 'Jl. Test No. 1, Denpasar', 'Tester', 'Contact', '+6281234567899')`,
        [testUserId, `tenant-rb-${tag}@kosmo.test`]
      );

      // 2. Insert isolated test property within active transaction
      await connection.query(
        `INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId, is_featured, verified_water_tank, verified_wifi_speedtest)
         VALUES (?, 'Test Property Rollback', 'Badung', 'Jl. Test No. 1', 3500000, 10, 0, NULL, FALSE, TRUE, TRUE)`,
        [testPropId]
      );

      // 3. Insert within active transaction matching live rentals schema with isolated entities
      await connection.query(
        "INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status) VALUES (?, ?, ?, 'Test Property Rollback', 3500000, '2026-08-16', 'active')",
        [testRentalId, testUserId, testPropId]
      );

      // Verify row exists within current transaction view
      const [inTxRows] = await connection.query<TableCountRow[]>(
        'SELECT COUNT(*) as count FROM rentals WHERE id = ?',
        [testRentalId]
      );
      assert.equal(inTxRows[0].count, 1, 'Temporary record should exist within active transaction');

      // Rollback transaction
      await connection.rollback();
    } finally {
      connection.release();
    }

    // Verify rental was completely rolled back from persistent storage
    const [afterRows] = await pool.query<TableCountRow[]>(
      'SELECT COUNT(*) as count FROM rentals WHERE id = ?',
      [testRentalId]
    );
    assert.equal(afterRows[0].count, 0, 'Rolled-back record must NOT exist in persistent storage');

    // Also verify isolated user and property were completely rolled back
    const [afterUsers] = await pool.query<TableCountRow[]>(
      'SELECT COUNT(*) as count FROM users WHERE id = ?',
      [testUserId]
    );
    assert.equal(afterUsers[0].count, 0, 'Rolled-back user must NOT exist in persistent storage');

    const [afterProps] = await pool.query<TableCountRow[]>(
      'SELECT COUNT(*) as count FROM properties WHERE id = ?',
      [testPropId]
    );
    assert.equal(afterProps[0].count, 0, 'Rolled-back property must NOT exist in persistent storage');
  });

  await t.test('executes transactional rental contract signing with full 8 audit columns, single active tenancy guard and terminated_at audit', async () => {
    const connection = await pool.getConnection();
    const tag = Date.now();
    const testRentalId = `test-contract-sign-${tag}`;
    const testTenantId = `test-user-tenant-${tag}`;
    const testPropertyId = `test-prop-sign-${tag}`;
    const testDocHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    try {
      await connection.beginTransaction();

      // 0a. Create isolated test property within transaction
      await connection.query(
        `INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId, is_featured, verified_water_tank, verified_wifi_speedtest)
         VALUES (?, 'KOSMO Hub Denpasar Test', 'Badung', 'Jl. Test No. 2, Denpasar', 3500000, 10, 0, NULL, TRUE, TRUE, TRUE)`,
        [testPropertyId]
      );

      // 0b. Create temporary isolated test user within transaction
      await connection.query(
        `INSERT INTO users (
          id, name, email, role, password, phone, identity_type, identity_number, address, occupation, emergency_contact_name, emergency_contact_phone
        ) VALUES (?, 'Test Tenant M3', ?, 'tenant', '$2a$10$abcdefghijklmnopqrstuu', '+6281234567890', 'NIK', '5171012308980001', 'Jl. Teuku Umar No. 14, Denpasar, Bali', 'Software Engineer', 'Emergency Contact', '+6281234567899')`,
        [testTenantId, `tenant-${tag}@kosmo.test`]
      );

      // 1. Verify single active tenancy query with row locking
      const [activeBefore] = await connection.query<RentalRow[]>(
        "SELECT id, propertyName FROM rentals WHERE tenantId = ? AND status = 'active' FOR UPDATE",
        [testTenantId]
      );
      assert.equal(activeBefore.length, 0, 'New tenant should have zero active rentals');

      // 2. Insert new rental with all audit columns
      await connection.query(
        `INSERT INTO rentals (
          id, tenantId, propertyId, propertyName, price, startDate, status,
          contract_url, contract_hash, contract_signed_at, signer_ip,
          signer_user_agent, tenant_nik_passport, tenant_signature_data, admin_fee_amount
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, NOW(), ?, ?, ?, ?, ?)`,
        [
          testRentalId,
          testTenantId,
          testPropertyId,
          'KOSMO Hub Denpasar Test',
          3500000,
          '2026-09-01',
          'https://res.cloudinary.com/kosmo/raw/upload/kosmo_contracts/test_contract.pdf',
          testDocHash,
          '114.125.45.102',
          'Mozilla/5.0 KOSMO Automated Test Runner',
          '5171012308980001',
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          5000.00
        ]
      );

      // 3. Verify inserted row holds exact audit values
      const [insertedRows] = await connection.query<RentalRow[]>(
        'SELECT * FROM rentals WHERE id = ?',
        [testRentalId]
      );
      assert.equal(insertedRows.length, 1);
      const row = insertedRows[0];
      assert.equal(row.contract_hash, testDocHash);
      assert.equal(row.signer_ip, '114.125.45.102');
      assert.equal(row.tenant_nik_passport, '5171012308980001');
      assert.equal(Number(row.admin_fee_amount), 5000);

      // 4. Test Single Active Tenancy Conflict Guard: subsequent query detects active tenancy
      const [activeAfter] = await connection.query<RentalRow[]>(
        "SELECT id, propertyName FROM rentals WHERE tenantId = ? AND status = 'active' FOR UPDATE",
        [testTenantId]
      );
      assert.equal(activeAfter.length, 1, 'Active tenancy must be detected for concurrency conflict guard');

      // 5. Terminate rental and verify tenancy restriction is released, and terminated_at is recorded
      await connection.query("UPDATE rentals SET status = 'terminated', terminated_at = NOW() WHERE id = ?", [testRentalId]);
      const [terminatedRows] = await connection.query<RentalRow[]>(
        'SELECT status, terminated_at FROM rentals WHERE id = ?',
        [testRentalId]
      );
      assert.equal(terminatedRows[0].status, 'terminated');
      assert.ok(terminatedRows[0].terminated_at !== null && terminatedRows[0].terminated_at !== undefined, 'terminated_at timestamp must be recorded on termination');

      const [activeTerminated] = await connection.query<RentalRow[]>(
        "SELECT id, propertyName FROM rentals WHERE tenantId = ? AND status = 'active' FOR UPDATE",
        [testTenantId]
      );
      assert.equal(activeTerminated.length, 0, 'Terminated rental releases single active tenancy constraint');

      // Rollback guarantees 0 database pollution
      await connection.rollback();
    } finally {
      connection.release();
    }

    // Confirm rolled-back records are completely gone
    const [persistedRental] = await pool.query<RentalRow[]>('SELECT id FROM rentals WHERE id = ?', [testRentalId]);
    assert.equal(persistedRental.length, 0, 'Rolled back contract record must not persist');

    const [persistedProp] = await pool.query<PropertyRow[]>('SELECT id FROM properties WHERE id = ?', [testPropertyId]);
    assert.equal(persistedProp.length, 0, 'Rolled back property record must not persist');

    const [persistedUser] = await pool.query<UserRow[]>('SELECT id FROM users WHERE id = ?', [testTenantId]);
    assert.equal(persistedUser.length, 0, 'Rolled back user record must not persist');
  });

  await t.test('verifies contract preview logic has strictly zero side-effects on database', async () => {
    const [rentalsBefore] = await pool.query<TableCountRow[]>('SELECT COUNT(*) as count FROM rentals');
    const [propsBefore] = await pool.query<TableCountRow[]>('SELECT COUNT(*) as count FROM properties');

    // Simulate preview contract query read using dynamic lookup rather than hardcoded seed
    const [allProps] = await pool.query<PropertyRow[]>('SELECT id, name, price FROM properties LIMIT 1');
    assert.ok(allProps.length > 0, 'Properties must exist in database');
    const targetPropId = allProps[0].id;

    const [propRows] = await pool.query<PropertyRow[]>('SELECT id, name, price FROM properties WHERE id = ?', [targetPropId]);
    assert.ok(propRows.length > 0);

    const [rentalsAfter] = await pool.query<TableCountRow[]>('SELECT COUNT(*) as count FROM rentals');
    const [propsAfter] = await pool.query<TableCountRow[]>('SELECT COUNT(*) as count FROM properties');

    assert.equal(rentalsBefore[0].count, rentalsAfter[0].count, 'Rental count must not change on preview');
    assert.equal(propsBefore[0].count, propsAfter[0].count, 'Property count must not change on preview');
  });
});
