import test from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../backend/db.ts';
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

  await pool.end();
});
