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

interface CountRow extends RowDataPacket {
  count: number;
}

test('Milestone 4 Adversarial Verification: Landlord Room Locks & Tenant Workflows', async (t) => {
  await ensureDbReady();

  // Boot test express server
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

  // Fixture IDs
  const testRunId = crypto.randomBytes(4).toString('hex');
  const landlordId = `usr-m4c2-landlord-${testRunId}`;
  const otherLandlordId = `usr-m4c2-other-${testRunId}`;
  const tenantId = `usr-m4c2-tenant-${testRunId}`;
  const propertyId = `prop-m4c2-${testRunId}`;
  const roomAvailableId = `room-m4c2-avail-${testRunId}`;
  const roomOccupiedId = `room-m4c2-occ-${testRunId}`;
  const roomMaintId = `room-m4c2-maint-${testRunId}`;
  const rentalId = `rent-m4c2-${testRunId}`;
  const rawPassword = 'StrongPassword123!';
  const hashedPassword = bcrypt.hashSync(rawPassword, 10);

  // Tokens
  let landlordToken = '';
  let otherLandlordToken = '';
  let tenantToken = '';

  // Setup Database Test Fixtures
  try {
    // 1. Create Users
    await pool.query(
      `INSERT INTO users (id, name, email, password, role, phone, balance)
       VALUES (?, ?, ?, ?, 'landlord', '0812999901', 0),
              (?, ?, ?, ?, 'landlord', '0812999902', 0),
              (?, ?, ?, ?, 'tenant', '0812999903', 0)`,
      [
        landlordId, 'Landlord M4C2', `landlord-${testRunId}@kosmo.id`, hashedPassword,
        otherLandlordId, 'Other Landlord M4C2', `other-${testRunId}@kosmo.id`, hashedPassword,
        tenantId, 'Tenant M4C2', `tenant-${testRunId}@kosmo.id`, hashedPassword
      ]
    );

    landlordToken = generateJwtToken({ id: landlordId, email: `landlord-${testRunId}@kosmo.id`, role: 'landlord' });
    otherLandlordToken = generateJwtToken({ id: otherLandlordId, email: `other-${testRunId}@kosmo.id`, role: 'landlord' });
    tenantToken = generateJwtToken({ id: tenantId, email: `tenant-${testRunId}@kosmo.id`, role: 'tenant' });

    // 2. Create Property
    await pool.query(
      `INSERT INTO properties (id, name, district, address, price, rating, image, description, totalRooms, occupiedRooms, ownerId)
       VALUES (?, 'KOSMO M4C2 Test Villa', 'Badung', 'Jl. Test No. 42', 4000000, 4.8, 'https://example.com/img.jpg', 'Desc', 3, 1, ?)`,
      [propertyId, landlordId]
    );

    // 3. Create Discrete Rooms
    await pool.query(
      `INSERT INTO rooms (id, propertyId, roomNumber, floor, type, price, status)
       VALUES (?, ?, '101', 1, 'Deluxe', 4000000, 'available'),
              (?, ?, '102', 1, 'Executive', 4500000, 'occupied'),
              (?, ?, '201', 2, 'Suite', 5000000, 'maintenance')`,
      [roomAvailableId, propertyId, roomOccupiedId, propertyId, roomMaintId, propertyId]
    );

    // 4. Create Active Rental linked to occupied room 102
    await pool.query(
      `INSERT INTO rentals (id, propertyId, roomId, tenantId, startDate, duration_months, price, status, paymentStatus, contract_hash, contract_signed_at)
       VALUES (?, ?, ?, ?, '2026-09-01', 1, 4500000, 'active', 'Lunas', 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890', NOW())`,
      [rentalId, propertyId, roomOccupiedId, tenantId]
    );
  } catch (setupErr) {
    console.error('Fixture setup failed:', setupErr);
    throw setupErr;
  }

  t.after(async () => {
    try {
      await pool.query('DELETE FROM rentals WHERE id = ?', [rentalId]);
      await pool.query('DELETE FROM rooms WHERE propertyId = ?', [propertyId]);
      await pool.query('DELETE FROM properties WHERE id = ?', [propertyId]);
      await pool.query('DELETE FROM users WHERE id IN (?, ?, ?)', [landlordId, otherLandlordId, tenantId]);
    } catch (cleanErr) {
      console.error('Cleanup error:', cleanErr);
    }
    server.close();
  });

  // =========================================================================
  // Section 1: Landlord Occupied Room Locks (DELETE & STATUS TOGGLE)
  // =========================================================================
  await t.test('1. Occupied Room Lock: DELETE operations', async (t1) => {
    await t1.test('1.1 strictly rejects deleting occupied room with active tenancy (returns 400)', async () => {
      const res = await fetch(`${baseUrl}/properties/${propertyId}/rooms/${roomOccupiedId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({ password: rawPassword })
      });

      assert.equal(res.status, 400, 'Deleting occupied room must return 400 Bad Request');
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('occupied') || body.message.includes('terisi'), 'Error message must cite occupancy');
    });

    await t1.test('1.2 strictly rejects deleting occupied room via direct route /api/rooms/:roomId (returns 400)', async () => {
      const res = await fetch(`${baseUrl}/rooms/${roomOccupiedId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({ password: rawPassword })
      });

      assert.equal(res.status, 400, 'Direct DELETE on occupied room must return 400');
    });

    await t1.test('1.3 rejects deleting occupied room even if wrong password provided (security gate precedence)', async () => {
      const res = await fetch(`${baseUrl}/properties/${propertyId}/rooms/${roomOccupiedId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({ password: 'IncorrectPassword999' })
      });

      assert.equal(res.status, 401, 'Wrong password must return 401 Unauthorized');
    });
  });

  await t.test('2. Occupied Room Lock: Status Modification (PATCH & PUT)', async (t2) => {
    await t2.test('2.1 rejects PATCH toggling occupied room to maintenance (returns 409 Conflict)', async () => {
      const res = await fetch(`${baseUrl}/properties/${propertyId}/rooms/${roomOccupiedId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({ status: 'maintenance' })
      });

      assert.equal(res.status, 409, 'Toggling occupied room with active rental must return 409 Conflict');
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('sewa aktif'), 'Message must indicate active tenancy prevents status toggle');
    });

    await t2.test('2.2 rejects PUT modifying status of occupied room to available or maintenance (returns 409 Conflict)', async () => {
      const res = await fetch(`${baseUrl}/properties/${propertyId}/rooms/${roomOccupiedId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({ status: 'available' })
      });

      assert.equal(res.status, 409, 'PUT status update on occupied room must return 409 Conflict');
    });

    await t2.test('2.3 rejects PATCH with invalid status value outside available|maintenance (returns 400)', async () => {
      const res = await fetch(`${baseUrl}/properties/${propertyId}/rooms/${roomAvailableId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({ status: 'occupied' }) // 'occupied' is not allowed via manual PATCH
      });

      assert.equal(res.status, 400, 'Manual PATCH with status occupied must be rejected by validation schema');
    });
  });

  // =========================================================================
  // Section 2: Valid Status Toggles (available <-> maintenance)
  // =========================================================================
  await t.test('3. Room Status Toggle: available <-> maintenance', async (t3) => {
    await t3.test('3.1 toggles available room to maintenance (returns 200 and updates status)', async () => {
      const res = await fetch(`${baseUrl}/properties/${propertyId}/rooms/${roomAvailableId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({ status: 'maintenance' })
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as { room: { status: string } };
      assert.equal(data.room.status, 'maintenance');

      // Verify in DB
      const [rows] = await pool.query<RowDataPacket[]>('SELECT status FROM rooms WHERE id = ?', [roomAvailableId]);
      assert.equal(rows[0].status, 'maintenance');
    });

    await t3.test('3.2 toggles maintenance room back to available (returns 200 and updates status)', async () => {
      const res = await fetch(`${baseUrl}/properties/${propertyId}/rooms/${roomAvailableId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({ status: 'available' })
      });

      assert.equal(res.status, 200);
      const data = (await res.json()) as { room: { status: string } };
      assert.equal(data.room.status, 'available');

      // Verify in DB
      const [rows] = await pool.query<RowDataPacket[]>('SELECT status FROM rooms WHERE id = ?', [roomAvailableId]);
      assert.equal(rows[0].status, 'available');
    });
  });

  // =========================================================================
  // Section 3: Available Room Deletion & RBAC Permissions
  // =========================================================================
  await t.test('4. Room Deletion & RBAC Security Gates', async (t4) => {
    await t4.test('4.1 rejects deletion by tenant or unauthorized landlord (returns 403)', async () => {
      // Tenant attempt
      const tenantRes = await fetch(`${baseUrl}/properties/${propertyId}/rooms/${roomMaintId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantToken}`
        },
        body: JSON.stringify({ password: rawPassword })
      });
      assert.equal(tenantRes.status, 403, 'Tenant cannot delete property rooms');

      // Other landlord attempt
      const otherRes = await fetch(`${baseUrl}/properties/${propertyId}/rooms/${roomMaintId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${otherLandlordToken}`
        },
        body: JSON.stringify({ password: rawPassword })
      });
      assert.equal(otherRes.status, 403, 'Non-owner landlord cannot delete rooms');
    });

    await t4.test('4.2 allows property owner landlord to delete non-occupied room with password (returns 200)', async () => {
      const res = await fetch(`${baseUrl}/properties/${propertyId}/rooms/${roomMaintId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({ password: rawPassword })
      });

      assert.equal(res.status, 200, 'Deleting non-occupied room must succeed');

      // Verify room was deleted
      const [check] = await pool.query<CountRow[]>(
        'SELECT COUNT(*) as count FROM rooms WHERE id = ?',
        [roomMaintId]
      );
      assert.equal(Number(check[0]?.count || 0), 0, 'Room must no longer exist in database');
    });
  });

  // =========================================================================
  // Section 4: Tenant Rentals Discrete Room Data & Backward Compatibility
  // =========================================================================
  await t.test('5. Tenant Rentals Enrichment & Legacy Backward Compatibility', async (t5) => {
    await t5.test('5.1 GET /api/tenant/rentals returns roomNumber, floor, roomType for discrete room rental', async () => {
      const res = await fetch(`${baseUrl}/tenant/rentals`, {
        headers: {
          Authorization: `Bearer ${tenantToken}`
        }
      });

      assert.equal(res.status, 200);
      const rentals = (await res.json()) as Array<{
        id: string;
        roomId?: string;
        roomNumber?: string;
        floor?: number;
        roomType?: string;
        effectiveMonthlyPrice?: number;
      }>;

      const matched = rentals.find((r) => r.id === rentalId);
      assert.ok(matched, 'Rental record must be present');
      assert.equal(matched.roomId, roomOccupiedId);
      assert.equal(matched.roomNumber, '102');
      assert.equal(matched.roomType, 'Executive');
      assert.equal(matched.floor, 1);
    });
  });
});
