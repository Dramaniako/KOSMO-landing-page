(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
(process.env as Record<string, string | undefined>).NO_LISTEN = 'true';
(process.env as Record<string, string | undefined>).DB_CONNECTION_LIMIT = '35';
(process.env as Record<string, string | undefined>).MIDTRANS_SERVER_KEY = 'placeholder';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import http from 'node:http';
import express from 'express';
import bodyParser from 'body-parser';
import bcrypt from 'bcryptjs';
import router from '../backend/router';
import { pool, ensureDbReady, syncPropertyRoomCounts } from '../backend/db';
import { settleRentalPayment } from '../backend/routes/payment.routes';
import { generateJwtToken } from '../backend/middleware/auth';
import type { RowDataPacket } from 'mysql2/promise';

interface RoomRow extends RowDataPacket {
  id: string;
  propertyId: string;
  roomNumber: string;
  floor: number;
  type: string;
  price: number | null;
  status: 'available' | 'occupied' | 'maintenance';
}

interface RentalRow extends RowDataPacket {
  id: string;
  tenantId: string;
  propertyId: string;
  roomId: string | null;
  status: string;
  price: number;
}

interface PropertyRow extends RowDataPacket {
  id: string;
  name: string;
  totalRooms: number;
  occupiedRooms: number;
  price: number;
  ownerId: string;
}

interface UserRow extends RowDataPacket {
  id: string;
  balance: number;
  totalRevenue: number;
}

test('ADVERSARIAL CONCURRENCY STORM & ISOLATION STRESS SUITE', async (t) => {
  await ensureDbReady();

  // Boot test Express server on dynamic port 0
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

  const tag = crypto.randomBytes(4).toString('hex');
  const landlordId = `landlord-adv-${tag}`;
  const propId = `prop-adv-${tag}`;
  const roomAId = `room-adv-${tag}-101`;
  const roomBId = `room-adv-${tag}-102`;
  const roomCId = `room-adv-${tag}-103`;
  const testPassword = 'AdversarialPassword123!';
  const hashedPassword = bcrypt.hashSync(testPassword, 10);

  const cleanupTestData = async () => {
    try {
      await pool.query('DELETE FROM rentals WHERE propertyId = ? OR id LIKE ?', [propId, `%${tag}%`]);
      await pool.query('DELETE FROM property_photos WHERE propertyId = ?', [propId]);
      await pool.query('DELETE FROM rooms WHERE propertyId = ?', [propId]);
      await pool.query('DELETE FROM properties WHERE id = ?', [propId]);
      await pool.query('DELETE FROM users WHERE id = ? OR id LIKE ?', [landlordId, `%${tag}%`]);
    } catch (err) {
      console.warn('Cleanup warning:', err);
    }
  };

  t.after(async () => {
    await cleanupTestData();
  });

  await cleanupTestData();

  // 1. Seed Landlord and Property
  await pool.query(
    `INSERT INTO users (id, name, email, role, password, balance, totalRevenue) 
     VALUES (?, 'Adversarial Landlord', ?, 'landlord', ?, 0, 0)`,
    [landlordId, `landlord-adv-${tag}@kosmo.test`, hashedPassword]
  );

  const roomMonthlyPrice = 3000000;
  await pool.query(
    `INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId) 
     VALUES (?, 'KOSMO Adversarial Citadel', 'Canggu', 'Jl. Kayu Aya No. 99, Seminyak', ?, 6, 0, ?)`,
    [propId, roomMonthlyPrice, landlordId]
  );

  // 2. Seed 6 Discrete Rooms
  await pool.query(
    `INSERT INTO rooms (id, propertyId, roomNumber, floor, type, price, status) VALUES
     (?, ?, '101', 1, 'Deluxe', ?, 'available'),
     (?, ?, '102', 1, 'Deluxe', ?, 'available'),
     (?, ?, '103', 1, 'Standard', ?, 'available'),
     (?, ?, '104', 2, 'Standard', ?, 'available'),
     (?, ?, '105', 2, 'Suite', ?, 'available'),
     (?, ?, '106', 2, 'Suite', ?, 'available')`,
    [
      roomAId, propId, roomMonthlyPrice,
      roomBId, propId, roomMonthlyPrice,
      roomCId, propId, roomMonthlyPrice,
      `room-adv-${tag}-104`, propId, roomMonthlyPrice,
      `room-adv-${tag}-105`, propId, roomMonthlyPrice,
      `room-adv-${tag}-106`, propId, roomMonthlyPrice
    ]
  );

  await syncPropertyRoomCounts(pool, propId);

  // 3. Seed 20 Tenants with complete legal profiles
  const tenantCount = 20;
  const tenantIds: string[] = [];
  const tenantTokens: string[] = [];

  for (let i = 0; i < tenantCount; i++) {
    const tId = `tenant-adv-${tag}-${i}`;
    const tEmail = `tenant-adv-${tag}-${i}@kosmo.test`;
    tenantIds.push(tId);

    await pool.query(
      `INSERT INTO users (
        id, name, email, role, password, phone, identity_type, identity_number, address, occupation,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relation, balance, totalRevenue
      ) VALUES (?, ?, ?, 'tenant', ?, '+628129999000', 'NIK', ?, 'Jl. Sunset Road Bali', 'Engineer', 'Emergency Contact', '+628129999001', 'Family', 0, 0)`,
      [tId, `Adv Tenant ${i}`, tEmail, hashedPassword, `517109990000${(1000 + i).toString()}`]
    );

    tenantTokens.push(generateJwtToken({ id: tId, email: tEmail, role: 'tenant' }));
  }

  // =========================================================================
  // STORM 1: 16 Concurrent Competing Payment Settlements for Room A (101)
  // =========================================================================
  await t.test('Storm 1: 16 concurrent payment settlements for the same room yield exactly 1 winner and 15 conflicts', async () => {
    // Assert pre-conditions
    const [preRoom] = await pool.query<RoomRow[]>('SELECT status FROM rooms WHERE id = ?', [roomAId]);
    assert.equal(preRoom[0].status, 'available');

    // Create 16 pending rental records all bound to roomAId
    const concurrencyWidth = 16;
    const pendingRentalIds: string[] = [];
    for (let i = 0; i < concurrencyWidth; i++) {
      const rId = `rent-adv-settle-${tag}-${i}`;
      pendingRentalIds.push(rId);
      await pool.query(
        `INSERT INTO rentals (id, tenantId, propertyId, roomId, propertyName, price, startDate, status, admin_fee_amount, duration_months)
         VALUES (?, ?, ?, ?, 'KOSMO Adversarial Citadel', ?, '2026-10-01', 'pending', 5000, 1)`,
        [rId, tenantIds[i], propId, roomAId, roomMonthlyPrice]
      );
    }

    // Fire 16 simultaneous settleRentalPayment transactions competing for roomAId
    const totalExpectedAmount = roomMonthlyPrice + 5000;
    const settlementPromises = pendingRentalIds.map((rId) =>
      settleRentalPayment(rId, totalExpectedAmount)
    );

    const settlementResults = await Promise.all(settlementPromises);

    // Analyze results
    let successCount = 0;
    let conflictCount = 0;
    let otherCount = 0;

    for (const res of settlementResults) {
      if (res.success && res.statusCode === 200) {
        successCount++;
      } else if (!res.success && res.statusCode === 409) {
        conflictCount++;
      } else {
        otherCount++;
        console.error('Unexpected settlement outcome:', res);
      }
    }

    // ORACLE ASSERTIONS:
    // 1. Exactly 1 winner
    assert.equal(successCount, 1, `Exactly 1 settlement transaction must succeed. Got: ${successCount}`);

    // 2. Exactly 15 conflicts
    assert.equal(conflictCount, concurrencyWidth - 1, `Exactly 15 settlement transactions must return 409 Conflict. Got: ${conflictCount}`);

    // 3. Zero unexpected / 500 / deadlock errors
    assert.equal(otherCount, 0, `Zero unexpected errors or deadlocks allowed. Got: ${otherCount}`);

    // 4. Room status must be 'occupied'
    const [postRoom] = await pool.query<RoomRow[]>('SELECT status FROM rooms WHERE id = ?', [roomAId]);
    assert.equal(postRoom[0].status, 'occupied');

    // 5. Exactly 1 active rental for roomAId, 15 pending
    const [activeRentals] = await pool.query<RentalRow[]>(
      "SELECT id FROM rentals WHERE propertyId = ? AND roomId = ? AND status = 'active'",
      [propId, roomAId]
    );
    assert.equal(activeRentals.length, 1);

    const [pendingRentals] = await pool.query<RentalRow[]>(
      "SELECT id FROM rentals WHERE propertyId = ? AND roomId = ? AND status = 'pending'",
      [propId, roomAId]
    );
    assert.equal(pendingRentals.length, concurrencyWidth - 1);

    // 6. Property occupiedRooms must be 1
    const [propRow] = await pool.query<PropertyRow[]>('SELECT occupiedRooms, totalRooms FROM properties WHERE id = ?', [propId]);
    assert.equal(propRow[0].occupiedRooms, 1);

    // 7. Landlord balance must be credited exactly once
    const [landlordRow] = await pool.query<UserRow[]>('SELECT balance, totalRevenue FROM users WHERE id = ?', [landlordId]);
    assert.equal(Number(landlordRow[0].balance), roomMonthlyPrice);
    assert.equal(Number(landlordRow[0].totalRevenue), roomMonthlyPrice);
  });

  // =========================================================================
  // STORM 2: 16 Concurrent HTTP POST /api/rentals Requests for Room B (102)
  // =========================================================================
  await t.test('Storm 2: 16 concurrent HTTP booking requests for the same room yield exactly 1 winner and 15 conflicts', async () => {
    const concurrencyWidth = 16;
    const requests = Array.from({ length: concurrencyWidth }, async (_, idx) => {
      const res = await fetch(`${baseUrl}/rentals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantTokens[idx]}`,
          'X-Forwarded-For': `192.168.2.${100 + idx}`,
          'User-Agent': `AdvConcurrencyClient/${idx}`
        },
        body: JSON.stringify({
          rentalId: `rent-adv-http-${tag}-${idx}`,
          tenantId: tenantIds[idx],
          propertyId: propId,
          roomId: roomBId,
          durationMonths: 1,
          startDate: '2026-10-01'
        })
      });

      const data = (await res.json()) as { message?: string; rentalId?: string };
      return { status: res.status, data, index: idx };
    });

    const results = await Promise.all(requests);

    const statusMap: Record<number, number> = {};
    for (const r of results) {
      statusMap[r.status] = (statusMap[r.status] || 0) + 1;
    }

    // ORACLE ASSERTIONS:
    // 1. Exactly 1 winner (201 Created)
    assert.equal(statusMap[201] || 0, 1, `Exactly 1 winner expected for room 102. Distribution: ${JSON.stringify(statusMap)}`);

    // 2. Exactly 15 conflicts (409 Conflict)
    assert.equal(statusMap[409] || 0, concurrencyWidth - 1, `Exactly 15 conflicts expected. Distribution: ${JSON.stringify(statusMap)}`);

    // 3. Zero 500 errors / zero deadlocks
    assert.equal(statusMap[500] || 0, 0, 'Zero 500 internal server errors allowed');

    // 4. Room B status must be 'occupied'
    const [roomB] = await pool.query<RoomRow[]>('SELECT status FROM rooms WHERE id = ?', [roomBId]);
    assert.equal(roomB[0].status, 'occupied');

    // 5. Property occupiedRooms must now be 2 (room 101 + room 102)
    const [propRow] = await pool.query<PropertyRow[]>('SELECT occupiedRooms FROM properties WHERE id = ?', [propId]);
    assert.equal(propRow[0].occupiedRooms, 2);
  });

  // =========================================================================
  // STORM 3: Concurrent Lease Termination vs Immediate Re-Booking Race
  // =========================================================================
  await t.test('Storm 3: Concurrent lease termination vs competing re-bookings maintains atomic lifecycle with zero orphan states', async () => {
    // Locate the active lease on room 102 from Storm 2
    const [activeLeases] = await pool.query<RentalRow[]>(
      "SELECT id, tenantId FROM rentals WHERE propertyId = ? AND roomId = ? AND status = 'active'",
      [propId, roomBId]
    );
    assert.equal(activeLeases.length, 1);
    const existingRentalId = activeLeases[0].id;
    const existingTenantId = activeLeases[0].tenantId;
    const existingTenantIdx = tenantIds.indexOf(existingTenantId);
    const existingTenantToken = tenantTokens[existingTenantIdx];

    // Pick 5 other tenants (e.g. indices 15, 16, 17, 18, 19) who will concurrently race to book room 102
    // while tenant A fires lease termination!
    const competingIndices = [15, 16, 17, 18, 19];

    // Prepare termination promise
    const terminationPromise = fetch(`${baseUrl}/rentals/${existingRentalId}/terminate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${existingTenantToken}`
      },
      body: JSON.stringify({ password: testPassword })
    }).then(async (r) => ({
      type: 'terminate' as const,
      status: r.status,
      body: (await r.json()) as { message?: string }
    }));

    // Prepare competing booking promises
    const bookingPromises = competingIndices.map(async (cIdx) => {
      const res = await fetch(`${baseUrl}/rentals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantTokens[cIdx]}`
        },
        body: JSON.stringify({
          rentalId: `rent-adv-race-${tag}-${cIdx}`,
          tenantId: tenantIds[cIdx],
          propertyId: propId,
          roomId: roomBId,
          durationMonths: 1,
          startDate: '2026-11-01'
        })
      });

      const body = (await res.json()) as { message?: string; rentalId?: string };
      return {
        type: 'book' as const,
        status: res.status,
        body,
        tenantIndex: cIdx
      };
    });

    // Fire all 6 operations simultaneously!
    const [termResult, ...bookingResults] = await Promise.all([
      terminationPromise,
      ...bookingPromises
    ]);

    // Assert termination succeeded
    assert.equal(termResult.status, 200, 'Lease termination must succeed with 200 OK');

    // Analyze booking results:
    // Because of atomic row locking:
    // - Either a booking acquired lock after termination released the room: exactly 1 booking succeeded (201), remainder 409.
    // - Or all bookings attempted before termination released the room: 0 bookings succeeded (all 409).
    const bookingSuccesses = bookingResults.filter((b) => b.status === 201);
    const bookingConflicts = bookingResults.filter((b) => b.status === 409);
    const bookingErrors = bookingResults.filter((b) => b.status !== 201 && b.status !== 409);

    assert.equal(bookingErrors.length, 0, `Zero errors allowed during termination race. Found: ${JSON.stringify(bookingErrors)}`);
    assert.ok(
      bookingSuccesses.length === 0 || bookingSuccesses.length === 1,
      `At most 1 booking may succeed. Got: ${bookingSuccesses.length}`
    );
    assert.equal(
      bookingConflicts.length + bookingSuccesses.length,
      competingIndices.length,
      'All competing booking attempts must resolve to either 201 or 409'
    );

    // DATABASE STATE INTEGRITY & ZERO ORPHAN CHECK:
    const [currentActive] = await pool.query<RentalRow[]>(
      "SELECT id, tenantId, status FROM rentals WHERE propertyId = ? AND roomId = ? AND status = 'active'",
      [propId, roomBId]
    );

    const [currentRoom] = await pool.query<RoomRow[]>('SELECT status FROM rooms WHERE id = ?', [roomBId]);

    if (bookingSuccesses.length === 1) {
      // Exactly 1 new tenant won the newly released room
      assert.equal(currentActive.length, 1, 'Exactly 1 active lease must exist for room 102');
      assert.equal(currentRoom[0].status, 'occupied', 'Room status must be occupied');
    } else {
      // No booking succeeded after termination; room is freed
      assert.equal(currentActive.length, 0, 'Zero active leases for room 102');
      assert.equal(currentRoom[0].status, 'available', 'Room status must be available');
    }

    // Validate parity sync with properties table
    const [occupiedCountRow] = await pool.query<RowDataPacket[]>(
      "SELECT COUNT(*) as count FROM rooms WHERE propertyId = ? AND status = 'occupied'",
      [propId]
    );
    const [propRow] = await pool.query<PropertyRow[]>('SELECT occupiedRooms FROM properties WHERE id = ?', [propId]);
    assert.equal(
      propRow[0].occupiedRooms,
      Number(occupiedCountRow[0].count),
      'Property occupiedRooms must strictly match the count of occupied rooms in rooms table'
    );
  });
});
