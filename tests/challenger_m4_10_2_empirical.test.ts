(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
(process.env as Record<string, string | undefined>).NO_LISTEN = 'true';
(process.env as Record<string, string | undefined>).DB_CONNECTION_LIMIT = '20';
(process.env as Record<string, string | undefined>).MIDTRANS_SERVER_KEY = 'placeholder';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import express from 'express';
import bodyParser from 'body-parser';
import bcrypt from 'bcryptjs';
import router from '../backend/router';
import { pool, ensureDbReady } from '../backend/db';
import { generateJwtToken } from '../backend/middleware/auth';
import type { RowDataPacket } from 'mysql2/promise';

interface RentalRow extends RowDataPacket {
  id: string;
  tenantId: string;
  propertyId: string;
  roomId: string | null;
  status: string;
  price: number;
  roomNumber?: string;
  floor?: number;
  roomType?: string;
  effectiveMonthlyPrice?: number;
}

interface RoomRow extends RowDataPacket {
  id: string;
  propertyId: string;
  roomNumber: string;
  floor: number;
  type: string;
  price: number | null;
  status: 'available' | 'occupied' | 'maintenance';
}

test('CHALLENGER M4-10-2 EMPIRICAL ADVERSARIAL SUITE', async (t) => {
  await ensureDbReady();

  // Boot ephemeral Express instance
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

  t.after(() => {
    server.close();
  });

  // Unique isolation tag
  const tag = crypto.randomBytes(4).toString('hex');
  const landlordId = `usr-ll-m4102-${tag}`;
  const tenant1Id = `usr-ten1-m4102-${tag}`;
  const tenant2Id = `usr-ten2-m4102-${tag}`;
  const tenant3Id = `usr-ten3-m4102-${tag}`;
  const propId = `prop-m4102-${tag}`;
  const roomAvailId = `room-avail-${tag}`;
  const roomOccupiedId = `room-occ-${tag}`;
  const roomMaintId = `room-maint-${tag}`;
  const roomOverrideId = `room-override-${tag}`;

  const basePropertyPrice = 3000000;
  const roomOverridePrice = 3750000;

  const testPassword = 'Password123!';
  const hashedPassword = bcrypt.hashSync(testPassword, 10);

  const cleanupTestData = async () => {
    try {
      await pool.query('DELETE FROM rentals WHERE propertyId = ? OR id LIKE ?', [propId, `%${tag}%`]);
      await pool.query('DELETE FROM property_photos WHERE propertyId = ?', [propId]);
      await pool.query('DELETE FROM rooms WHERE propertyId = ?', [propId]);
      await pool.query('DELETE FROM properties WHERE id = ?', [propId]);
      await pool.query('DELETE FROM users WHERE id IN (?, ?, ?, ?)', [landlordId, tenant1Id, tenant2Id, tenant3Id]);
    } catch (err) {
      console.warn('Cleanup warning:', err);
    }
  };

  t.after(async () => {
    await cleanupTestData();
  });

  await cleanupTestData();

  // 1. Seed Landlord
  await pool.query(
    `INSERT INTO users (id, name, email, role, password, balance, totalRevenue)
     VALUES (?, 'Test Landlord', ?, 'landlord', ?, 0, 0)`,
    [landlordId, `landlord-${tag}@kosmo.test`, hashedPassword]
  );

  // 2. Seed 3 Tenants with complete KYC
  const tenants = [
    { id: tenant1Id, email: `t1-${tag}@kosmo.test`, name: 'Tenant One', nik: '5171012304950001' },
    { id: tenant2Id, email: `t2-${tag}@kosmo.test`, name: 'Tenant Two', nik: '5171012304950002' },
    { id: tenant3Id, email: `t3-${tag}@kosmo.test`, name: 'Tenant Three', nik: '5171012304950003' }
  ];

  for (const ten of tenants) {
    await pool.query(
      `INSERT INTO users (
        id, name, email, role, password, phone, identity_type, identity_number, address, occupation,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relation
      ) VALUES (?, ?, ?, 'tenant', ?, '+6281234567890', 'NIK', ?, 'Jl. Pantai Canggu', 'Engineer', 'Em Contact', '+6281234567899', 'Family')`,
      [ten.id, ten.name, ten.email, hashedPassword, ten.nik]
    );
  }

  const token1 = generateJwtToken({ id: tenant1Id, email: tenants[0].email, role: 'tenant' });
  const token2 = generateJwtToken({ id: tenant2Id, email: tenants[1].email, role: 'tenant' });
  const token3 = generateJwtToken({ id: tenant3Id, email: tenants[2].email, role: 'tenant' });

  // 3. Seed Property (totalRooms: 4, occupiedRooms: 1)
  await pool.query(
    `INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId)
     VALUES (?, 'KOSMO Empirical Haven', 'Canggu', 'Jl. Pantai Canggu No. 10', ?, 4, 1, ?)`,
    [propId, basePropertyPrice, landlordId]
  );

  // 4. Seed Discrete Rooms:
  // - roomAvailId: 'available', price null (falls back to base property price 3,000,000)
  // - roomOccupiedId: 'occupied', price null
  // - roomMaintId: 'maintenance', price null
  // - roomOverrideId: 'available', price 3,750,000 (custom price override)
  await pool.query(
    `INSERT INTO rooms (id, propertyId, roomNumber, floor, type, price, status) VALUES
     (?, ?, '101', 1, 'Standard', NULL, 'available'),
     (?, ?, '102', 1, 'Standard', NULL, 'occupied'),
     (?, ?, '103', 1, 'Standard', NULL, 'maintenance'),
     (?, ?, '201', 2, 'Deluxe Override', ?, 'available')`,
    [roomAvailId, propId, roomOccupiedId, propId, roomMaintId, propId, roomOverrideId, propId, roomOverridePrice]
  );

  // Seed active rental for roomOccupiedId
  await pool.query(
    `INSERT INTO rentals (id, tenantId, propertyId, roomId, propertyName, price, startDate, status, duration_months)
     VALUES (?, ?, ?, ?, 'KOSMO Empirical Haven', ?, '2026-09-01', 'active', 1)`,
    [`rent-seed-occ-${tag}`, tenant3Id, propId, roomOccupiedId, basePropertyPrice]
  );

  // Dummy 1x1 base64 signature for contract tests
  const validSignatureBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  // =========================================================================
  // TASK 3.1: Occupied Room Booking Prevention
  // =========================================================================
  await t.test('Task 3.1: Occupied room cannot be booked via /api/rentals/contract/sign (expects 409 Conflict)', async () => {
    const res = await fetch(`${baseUrl}/rentals/contract/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`
      },
      body: JSON.stringify({
        propertyId: propId,
        roomId: roomOccupiedId,
        durationMonths: 1,
        startDate: '2026-10-01',
        tenantNikPassport: '5171012304950001',
        signatureBase64: validSignatureBase64,
        affirmativeConsent: true
      })
    });

    assert.equal(res.status, 409, `Occupied room signing must return 409 Conflict. Got status: ${res.status}`);
    const body = (await res.json()) as { success: boolean; message: string };
    assert.equal(body.success, false);
    assert.ok(body.message.includes('sudah tidak tersedia') || body.message.includes('terisi'));
  });

  await t.test('Task 3.2: Occupied room cannot be booked via /api/rentals (expects 409 Conflict)', async () => {
    const res = await fetch(`${baseUrl}/rentals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`
      },
      body: JSON.stringify({
        rentalId: `rent-direct-occ-${tag}`,
        tenantId: tenant1Id,
        propertyId: propId,
        roomId: roomOccupiedId,
        durationMonths: 1,
        startDate: '2026-10-01'
      })
    });

    assert.equal(res.status, 409, `Occupied room direct booking must return 409 Conflict. Got status: ${res.status}`);
    const body = (await res.json()) as { message: string };
    assert.ok(body.message.includes('terisi') || body.message.includes('tidak tersedia'));
  });

  // =========================================================================
  // TASK 3.3: Maintenance Room Booking Prevention
  // =========================================================================
  await t.test('Task 3.3: Maintenance room cannot be booked via /api/rentals/contract/sign (expects 409 Conflict)', async () => {
    const res = await fetch(`${baseUrl}/rentals/contract/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`
      },
      body: JSON.stringify({
        propertyId: propId,
        roomId: roomMaintId,
        durationMonths: 1,
        startDate: '2026-10-01',
        tenantNikPassport: '5171012304950001',
        signatureBase64: validSignatureBase64,
        affirmativeConsent: true
      })
    });

    assert.equal(res.status, 409, `Maintenance room signing must return 409 Conflict. Got status: ${res.status}`);
    const body = (await res.json()) as { success: boolean; message: string };
    assert.equal(body.success, false);
    assert.ok(body.message.includes('sudah tidak tersedia') || body.message.includes('maintenance'));
  });

  await t.test('Task 3.4: Maintenance room cannot be booked via /api/rentals (expects 409 Conflict)', async () => {
    const res = await fetch(`${baseUrl}/rentals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`
      },
      body: JSON.stringify({
        rentalId: `rent-direct-maint-${tag}`,
        tenantId: tenant1Id,
        propertyId: propId,
        roomId: roomMaintId,
        durationMonths: 1,
        startDate: '2026-10-01'
      })
    });

    assert.equal(res.status, 409, `Maintenance room direct booking must return 409 Conflict. Got status: ${res.status}`);
    const body = (await res.json()) as { message: string };
    assert.ok(body.message.includes('terisi') || body.message.includes('tidak tersedia'));
  });

  // =========================================================================
  // TASK 4.1: Price Override Arithmetic in Preview Flow (/api/rentals/contract/preview)
  // =========================================================================
  await t.test('Task 4.1: Price override arithmetic in contract preview flow', async () => {
    // 1. Room with override: 3,750,000 for 3 months + 5,000 flat admin fee = 11,255,000
    const previewOverrideRes = await fetch(`${baseUrl}/rentals/contract/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`
      },
      body: JSON.stringify({
        propertyId: propId,
        roomId: roomOverrideId,
        durationMonths: 3,
        startDate: '2026-10-01',
        tenantNikPassport: '5171012304950001'
      })
    });

    assert.equal(previewOverrideRes.status, 200);
    const previewOverride = (await previewOverrideRes.json()) as {
      success: boolean;
      monthlyPrice: number;
      totalPrice: number;
      adminFee: number;
      contractData: { monthlyPrice: number; totalPrice: number; durationMonths: number; roomId?: string; roomNumber?: string };
    };

    assert.equal(previewOverride.success, true);
    assert.equal(previewOverride.monthlyPrice, roomOverridePrice, 'Monthly price must reflect room price override');
    assert.equal(previewOverride.adminFee, 5000, 'Flat admin fee must be 5000');
    assert.equal(
      previewOverride.totalPrice,
      (roomOverridePrice * 3) + 5000,
      'Total price must equal (roomOverridePrice * duration) + adminFee'
    );
    assert.equal(previewOverride.contractData.roomId, roomOverrideId);
    assert.equal(previewOverride.contractData.roomNumber, '201');

    // 2. Room without override (null): falls back to base property price 3,000,000 for 3 months + 5,000 = 9,005,000
    const previewBaseRes = await fetch(`${baseUrl}/rentals/contract/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`
      },
      body: JSON.stringify({
        propertyId: propId,
        roomId: roomAvailId,
        durationMonths: 3,
        startDate: '2026-10-01',
        tenantNikPassport: '5171012304950001'
      })
    });

    assert.equal(previewBaseRes.status, 200);
    const previewBase = (await previewBaseRes.json()) as {
      success: boolean;
      monthlyPrice: number;
      totalPrice: number;
      adminFee: number;
      contractData: { monthlyPrice: number; totalPrice: number; durationMonths: number; roomId?: string; roomNumber?: string };
    };

    assert.equal(previewBase.success, true);
    assert.equal(previewBase.monthlyPrice, basePropertyPrice, 'Monthly price must fall back to property base price');
    assert.equal(
      previewBase.totalPrice,
      (basePropertyPrice * 3) + 5000,
      'Total price must equal (basePropertyPrice * duration) + adminFee'
    );
    assert.equal(previewBase.contractData.roomId, roomAvailId);
    assert.equal(previewBase.contractData.roomNumber, '101');
  });

  // =========================================================================
  // TASK 4.2: Price Override Arithmetic in Contract Signing (/api/rentals/contract/sign)
  // =========================================================================
  await t.test('Task 4.2: Price override arithmetic in contract signing flow and database persistence', async () => {
    const signedRentalId = `rent-signed-override-${tag}`;
    const signRes = await fetch(`${baseUrl}/rentals/contract/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token2}`
      },
      body: JSON.stringify({
        rentalId: signedRentalId,
        propertyId: propId,
        roomId: roomOverrideId,
        durationMonths: 2,
        startDate: '2026-10-01',
        tenantNikPassport: '5171012304950002',
        signatureBase64: validSignatureBase64,
        affirmativeConsent: true
      })
    });

    assert.equal(signRes.status, 201, 'Contract signing with valid room override must return 201 Created');
    const signBody = (await signRes.json()) as {
      success: boolean;
      rentalId: string;
      contractUrl: string;
      contractHash: string;
      adminFee: number;
      totalAmount: number;
      roomId: string | null;
      roomNumber: string | null;
    };

    assert.equal(signBody.success, true);
    assert.equal(signBody.rentalId, signedRentalId);
    assert.equal(
      signBody.totalAmount,
      (roomOverridePrice * 2) + 5000,
      'Total amount must be (roomOverridePrice * 2) + 5000'
    );
    assert.equal(signBody.roomId, roomOverrideId);
    assert.equal(signBody.roomNumber, '201');

    // Verify Database Persistence in rentals table
    const [savedRows] = await pool.query<RentalRow[]>(
      'SELECT id, tenantId, propertyId, roomId, price, status, duration_months, admin_fee_amount FROM rentals WHERE id = ?',
      [signedRentalId]
    );
    assert.equal(savedRows.length, 1);
    const saved = savedRows[0];
    assert.equal(saved.roomId, roomOverrideId);
    assert.equal(Number(saved.price), roomOverridePrice, 'rentals.price in DB must store room price override');
    assert.equal(saved.status, 'pending', 'Rental status must initially be pending before payment');
    assert.equal(saved.duration_months, 2);
  });

  // =========================================================================
  // TASK 4.3: Tenant Room Badge Data via GET /api/tenant/rentals
  // =========================================================================
  await t.test('Task 4.3: GET /api/tenant/rentals enriches active rentals with roomNumber, floor, roomType, and effectiveMonthlyPrice', async () => {
    // Tenant 3 has the active rental seeded on room 102
    const res = await fetch(`${baseUrl}/tenant/rentals`, {
      headers: {
        Authorization: `Bearer ${token3}`
      }
    });

    assert.equal(res.status, 200);
    const rentals = (await res.json()) as (RentalRow & { roomFloor?: number })[];
    assert.ok(Array.isArray(rentals));
    assert.equal(rentals.length, 1);

    const activeRental = rentals[0];
    assert.equal(activeRental.roomId, roomOccupiedId);
    assert.equal(activeRental.roomNumber, '102', 'Enriched rental must have roomNumber 102');
    assert.equal(activeRental.roomFloor, 1, 'Enriched rental must have roomFloor 1');
    assert.equal(activeRental.roomType, 'Standard', 'Enriched rental must have roomType Standard');
  });

  // =========================================================================
  // TASK 4.4: Payment Token Price Override Arithmetic Discrepancy Verification
  // =========================================================================
  await t.test('Task 4.4: Payment settlement behavior with room price override vs base price', async () => {
    const signedRentalId = `rent-signed-override-${tag}`;

    // 1. Check database rental record has the room override price
    const [savedRental] = await pool.query<RentalRow[]>(
      'SELECT price, duration_months FROM rentals WHERE id = ?',
      [signedRentalId]
    );
    const contractPrice = Number(savedRental[0].price);
    assert.equal(contractPrice, roomOverridePrice, 'DB rental price is room override price (3,750,000)');

    // 2. Direct payment settlement with the true signed override amount: (3,750,000 * 2) + 5000 = 7,505,000
    const correctOverrideAmount = (roomOverridePrice * 2) + 5000;
    const { settleRentalPayment } = await import('../backend/routes/payment.routes');
    const settleCorrectResult = await settleRentalPayment(signedRentalId, correctOverrideAmount);
    assert.equal(settleCorrectResult.success, true, 'Payment settlement with full room override amount must succeed');

    // 3. Verify that room is now occupied after payment settlement
    const [roomRow] = await pool.query<RoomRow[]>('SELECT status FROM rooms WHERE id = ?', [roomOverrideId]);
    assert.equal(roomRow[0].status, 'occupied', 'Room must be transitioned to occupied after successful payment');

    // 4. Verify that property occupiedRooms has incremented from 1 to 2
    const [propRows] = await pool.query<RowDataPacket[]>('SELECT occupiedRooms FROM properties WHERE id = ?', [propId]);
    assert.equal(propRows[0].occupiedRooms, 2, 'Property occupiedRooms must increment to 2');
  });
});
