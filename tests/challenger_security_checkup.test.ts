(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import bodyParser from 'body-parser';
import bcrypt from 'bcryptjs';
import router from '../backend/router';
import { pool, ensureDbReady } from '../backend/db';
import { generateJwtToken } from '../backend/middleware/auth';
import type { RowDataPacket } from 'mysql2/promise';

interface UserRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  role: string;
  balance: number;
}

interface PropertyRow extends RowDataPacket {
  id: string;
  name: string;
  price: number;
  rating: number;
  ownerId: string;
}

interface RentalRow extends RowDataPacket {
  id: string;
  tenantId: string;
  propertyId: string;
  startDate: string;
  status: string;
}

test('Security, Data Integrity & Performance Checkup Suite', async (t) => {
  try {
    await ensureDbReady();
  } catch (err) {
    console.warn('Database initialization warning in test setup:', err);
  }

  const app = express();
  app.use(bodyParser.json({ limit: '5mb' }));
  app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }));
  app.use('/api', router);

  const server = http.createServer(app);
  let serverPort = 0;

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        serverPort = addr.port;
      }
      resolve();
    });
  });

  const baseUrl = `http://127.0.0.1:${serverPort}/api`;

  // Identities
  const timestamp = Date.now();
  const adminPassword = 'adminSecretPassword123!';
  const adminHash = bcrypt.hashSync(adminPassword, 10);

  const testAdmin = { id: `chk-adm-${timestamp}`, email: `chk-adm-${timestamp}@kosmo.test`, role: 'admin' as const, name: 'Check Admin' };
  const testTenantA = { id: `chk-ta-${timestamp}`, email: `chk-ta-${timestamp}@kosmo.test`, role: 'tenant' as const, name: 'Tenant Alpha' };
  const testTenantB = { id: `chk-tb-${timestamp}`, email: `chk-tb-${timestamp}@kosmo.test`, role: 'tenant' as const, name: 'Tenant Beta' };
  const testLandlordA = { id: `chk-la-${timestamp}`, email: `chk-la-${timestamp}@kosmo.test`, role: 'landlord' as const, name: 'Landlord Alpha' };
  const testLandlordB = { id: `chk-lb-${timestamp}`, email: `chk-lb-${timestamp}@kosmo.test`, role: 'landlord' as const, name: 'Landlord Beta' };

  const tokenAdmin = generateJwtToken(testAdmin);
  const tokenTenantA = generateJwtToken(testTenantA);
  const tokenTenantB = generateJwtToken(testTenantB);
  const tokenLandlordA = generateJwtToken(testLandlordA);
  const tokenLandlordB = generateJwtToken(testLandlordB);

  const propAId = `chk-prop-a-${timestamp}`;
  const propBId = `chk-prop-b-${timestamp}`;
  const rentalAId = `chk-rent-a-${timestamp}`;
  const rentalPendingId = `chk-rent-p-${timestamp}`;

  // Seed test records in database
  try {
    await pool.query(
      `INSERT INTO users (id, name, email, role, password, phone, identity_type, identity_number, address, occupation, emergency_contact_name, emergency_contact_phone, balance, totalRevenue, totalWithdrawn)
       VALUES
       (?, ?, ?, 'admin', ?, '+628111111111', 'NIK', '5171012308980010', 'Denpasar', 'Admin', 'Emergency', '+628111111112', 0, 0, 0),
       (?, ?, ?, 'tenant', '$2a$10$dummyhash', '+628222222221', 'NIK', '5171012308980011', 'Denpasar', 'Worker', 'Emergency', '+628222222222', 0, 0, 0),
       (?, ?, ?, 'tenant', '$2a$10$dummyhash', '+628222222223', 'NIK', '5171012308980012', 'Badung', 'Worker', 'Emergency', '+628222222224', 0, 0, 0),
       (?, ?, ?, 'landlord', '$2a$10$dummyhash', '+628333333331', 'NIK', '5171012308980013', 'Seminyak', 'Host', 'Emergency', '+628333333332', 5000000, 15000000, 10000000),
       (?, ?, ?, 'landlord', '$2a$10$dummyhash', '+628333333333', 'NIK', '5171012308980014', 'Canggu', 'Host', 'Emergency', '+628333333334', 8000000, 24000000, 16000000)`,
      [
        testAdmin.id, testAdmin.name, testAdmin.email, adminHash,
        testTenantA.id, testTenantA.name, testTenantA.email,
        testTenantB.id, testTenantB.name, testTenantB.email,
        testLandlordA.id, testLandlordA.name, testLandlordA.email,
        testLandlordB.id, testLandlordB.name, testLandlordB.email
      ]
    );

    await pool.query(
      `INSERT INTO properties (id, name, district, address, price, rating, totalRooms, occupiedRooms, ownerId)
       VALUES
       (?, 'Villa Alpha Canggu', 'Badung', 'Jl. Batu Bolong No. 1', 5000000, 5.0, 5, 1, ?),
       (?, 'Villa Beta Seminyak', 'Badung', 'Jl. Sunset No. 2', 6000000, 4.8, 5, 0, ?)`,
      [propAId, testLandlordA.id, propBId, testLandlordB.id]
    );

    await pool.query(
      `INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status, duration_months, tenant_nik_passport)
       VALUES
       (?, ?, ?, 'Villa Alpha Canggu', 5000000, '2026-09-01', 'active', 1, '5171012308980011'),
       (?, ?, ?, 'Villa Beta Seminyak', 6000000, '2026-09-01', 'pending', 1, '5171012308980012')`,
      [rentalAId, testTenantA.id, propAId, rentalPendingId, testTenantB.id, propBId]
    );
  } catch (setupErr) {
    console.warn('Test setup seed warning:', setupErr);
  }

  t.after(async () => {
    try {
      await pool.query('DELETE FROM reviews WHERE propertyId IN (?, ?)', [propAId, propBId]);
      await pool.query('DELETE FROM rentals WHERE id IN (?, ?)', [rentalAId, rentalPendingId]);
      await pool.query('DELETE FROM properties WHERE id IN (?, ?)', [propAId, propBId]);
      await pool.query('DELETE FROM users WHERE id IN (?, ?, ?, ?, ?)', [
        testAdmin.id, testTenantA.id, testTenantB.id, testLandlordA.id, testLandlordB.id
      ]);
    } catch {
      // Safe cleanup ignore
    }
    server.close();
  });

  // -------------------------------------------------------------
  // Test 1: IDOR Remediation on GET /api/tenant/rentals
  // -------------------------------------------------------------
  await t.test('GET /api/tenant/rentals strictly scopes non-admin caller to own tenancy records', async () => {
    // Tenant A queries Tenant B's ID via query param
    const res = await fetch(`${baseUrl}/tenant/rentals?tenantId=${testTenantB.id}`, {
      headers: { Authorization: `Bearer ${tokenTenantA}` }
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as Array<{ tenantId: string; id: string }>;
    
    // Must NOT return Tenant B's rentals
    for (const item of data) {
      assert.equal(item.tenantId, testTenantA.id, 'Non-admin tenant must only see their own rentals');
    }

    // Admin can inspect Tenant B's rentals
    const adminRes = await fetch(`${baseUrl}/tenant/rentals?tenantId=${testTenantB.id}`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` }
    });
    assert.equal(adminRes.status, 200);
    const adminData = (await adminRes.json()) as Array<{ tenantId: string; id: string }>;
    assert.ok(adminData.some((r) => r.tenantId === testTenantB.id), 'Admin must be able to view requested tenant rentals');
  });

  // -------------------------------------------------------------
  // Test 2: IDOR Remediation on GET /api/landlord/financials & /api/landlord/rentals
  // -------------------------------------------------------------
  await t.test('GET /api/landlord/financials and /api/landlord/rentals strictly scope non-admin to own account', async () => {
    // Landlord A queries Landlord B's financials
    const finRes = await fetch(`${baseUrl}/landlord/financials?landlordId=${testLandlordB.id}`, {
      headers: { Authorization: `Bearer ${tokenLandlordA}` }
    });
    assert.equal(finRes.status, 200);
    const finData = (await finRes.json()) as { balance: number; totalRevenue: number };
    assert.equal(finData.balance, 5000000, 'Landlord A must only see their own balance (5M, not 8M)');

    // Landlord A queries Landlord B's rentals
    const rentRes = await fetch(`${baseUrl}/landlord/rentals?landlordId=${testLandlordB.id}`, {
      headers: { Authorization: `Bearer ${tokenLandlordA}` }
    });
    assert.equal(rentRes.status, 200);
    const rentData = (await rentRes.json()) as Array<{ propertyName: string }>;
    assert.ok(rentData.every((r) => r.propertyName === 'Villa Alpha Canggu'), 'Landlord A must only see rentals for their properties');
  });

  // -------------------------------------------------------------
  // Test 3: Password Confirmation Gate & Cascade Guard on DELETE /api/users/:id
  // -------------------------------------------------------------
  await t.test('DELETE /api/users/:id enforces password confirmation, blocks self-deletion, and guards active tenancies', async () => {
    // 1. Missing password
    const noPassRes = await fetch(`${baseUrl}/users/${testTenantA.id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAdmin}`
      }
    });
    assert.equal(noPassRes.status, 400);
    const noPassData = (await noPassRes.json()) as { message: string };
    assert.match(noPassData.message, /Password konfirmasi.*diperlukan/i);

    // 2. Wrong password
    const wrongPassRes = await fetch(`${baseUrl}/users/${testTenantA.id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAdmin}`
      },
      body: JSON.stringify({ password: 'wrongPassword123' })
    });
    assert.equal(wrongPassRes.status, 401);

    // 3. Block admin self-deletion
    const selfDelRes = await fetch(`${baseUrl}/users/${testAdmin.id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAdmin}`
      },
      body: JSON.stringify({ password: adminPassword })
    });
    assert.equal(selfDelRes.status, 400);

    // 4. Block deleting tenant with active rental (prevents cascade inventory leak)
    const activeTenantDelRes = await fetch(`${baseUrl}/users/${testTenantA.id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAdmin}`
      },
      body: JSON.stringify({ password: adminPassword })
    });
    assert.equal(activeTenantDelRes.status, 409, 'Must reject deleting tenant with active lease');
  });

  // -------------------------------------------------------------
  // Test 4: Pending Rental Guard on DELETE /api/properties/:id
  // -------------------------------------------------------------
  await t.test('DELETE /api/properties/:id prevents deleting properties with pending rental bookings', async () => {
    const delPropRes = await fetch(`${baseUrl}/properties/${propBId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenAdmin}`
      },
      body: JSON.stringify({ password: adminPassword })
    });
    assert.equal(delPropRes.status, 409, 'Must reject deletion when pending booking exists');
  });

  // -------------------------------------------------------------
  // Test 5: Ownership Assignment on POST /api/properties
  // -------------------------------------------------------------
  await t.test('POST /api/properties assigns property owner to authenticated landlord, ignoring forged ownerId', async () => {
    const uniquePropName = `Villa Forge Test ${Date.now()}`;
    const createRes = await fetch(`${baseUrl}/properties`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenLandlordA}`
      },
      body: JSON.stringify({
        name: uniquePropName,
        district: 'Badung',
        address: 'Jl. Test Bypass No. 99',
        price: 4500000,
        totalRooms: 4,
        ownerId: testLandlordB.id // Attempt to forge ownerId to Landlord B
      })
    });
    assert.equal(createRes.status, 201);

    const [rows] = await pool.query<PropertyRow[]>('SELECT * FROM properties WHERE name = ?', [uniquePropName]);
    assert.ok(rows.length > 0);
    assert.equal(rows[0].ownerId, testLandlordA.id, 'Owner must be Landlord A (the authenticated caller), not forged Landlord B');

    // Clean up created property
    await pool.query('DELETE FROM properties WHERE id = ?', [rows[0].id]);
  });
});
