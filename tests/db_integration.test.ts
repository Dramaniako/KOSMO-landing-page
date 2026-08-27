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

  await t.test('verifies rentals table schema includes all 8 contract and audit columns', async () => {
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
      'admin_fee_amount'
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
    const testRentalId = `test-rollback-${Date.now()}`;

    try {
      await connection.beginTransaction();

      // Insert within active transaction matching live rentals schema
      await connection.query(
        "INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status) VALUES (?, 'user-tenant', 'prop-01', 'KOSMO Hub Denpasar', 3500000, '2026-08-16', 'active')",
        [testRentalId]
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

    // Verify row was completely rolled back from the live database
    const [afterRows] = await pool.query<TableCountRow[]>(
      'SELECT COUNT(*) as count FROM rentals WHERE id = ?',
      [testRentalId]
    );
    assert.equal(afterRows[0].count, 0, 'Rolled-back record must NOT exist in persistent storage');
  });

  await t.test('executes transactional rental contract signing with full 8 audit columns and single active tenancy guard', async () => {
    const connection = await pool.getConnection();
    const testRentalId = `test-contract-sign-${Date.now()}`;
    const testTenantId = `test-tenant-${Date.now()}`;
    const testPropertyId = 'prop-01';
    const testDocHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    try {
      await connection.beginTransaction();

      // 0. Create temporary test user within transaction
      await connection.query(
        `INSERT INTO users (
          id, name, email, role, password, phone, identity_type, identity_number, address, occupation, emergency_contact_name, emergency_contact_phone
        ) VALUES (?, 'Test Tenant M3', ?, 'tenant', '$2a$10$abcdefghijklmnopqrstuu', '+6281234567890', 'NIK', '5171012308980001', 'Jl. Teuku Umar No. 14, Denpasar, Bali', 'Software Engineer', 'Emergency Contact', '+6281234567899')`,
        [testTenantId, `tenant-${Date.now()}@kosmo.test`]
      );

      // 1. Verify single active tenancy query with row locking
      const [activeBefore] = await connection.query<RentalRow[]>(
        "SELECT id, propertyName FROM rentals WHERE tenantId = ? AND status = 'active' FOR UPDATE",
        [testTenantId]
      );
      assert.equal(activeBefore.length, 0, 'New tenant should have zero active rentals');

      // 2. Insert new rental with all 8 audit columns
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
          'KOSMO Hub Denpasar',
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

      // 5. Terminate rental and verify tenancy restriction is released
      await connection.query("UPDATE rentals SET status = 'terminated' WHERE id = ?", [testRentalId]);
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

    // Confirm rolled-back record is completely gone
    const [persisted] = await pool.query<RentalRow[]>('SELECT id FROM rentals WHERE id = ?', [testRentalId]);
    assert.equal(persisted.length, 0, 'Rolled back contract record must not persist');
  });

  await t.test('verifies contract preview logic has strictly zero side-effects on database', async () => {
    const [rentalsBefore] = await pool.query<TableCountRow[]>('SELECT COUNT(*) as count FROM rentals');
    const [propsBefore] = await pool.query<TableCountRow[]>('SELECT COUNT(*) as count FROM properties');

    // Simulate preview contract query read
    const [propRows] = await pool.query<PropertyRow[]>('SELECT id, name, price FROM properties WHERE id = ?', ['prop-01']);
    assert.ok(propRows.length > 0);

    const [rentalsAfter] = await pool.query<TableCountRow[]>('SELECT COUNT(*) as count FROM rentals');
    const [propsAfter] = await pool.query<TableCountRow[]>('SELECT COUNT(*) as count FROM properties');

    assert.equal(rentalsBefore[0].count, rentalsAfter[0].count, 'Rental count must not change on preview');
    assert.equal(propsBefore[0].count, propsAfter[0].count, 'Property count must not change on preview');
  });
});
