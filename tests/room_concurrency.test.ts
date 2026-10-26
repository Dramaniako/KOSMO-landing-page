(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
(process.env as Record<string, string | undefined>).NO_LISTEN = 'true';
(process.env as Record<string, string | undefined>).DB_CONNECTION_LIMIT = '25';
(process.env as Record<string, string | undefined>).MIDTRANS_SERVER_KEY = 'placeholder';
(process.env as Record<string, string | undefined>).MIDTRANS_CLIENT_KEY = 'placeholder';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import http from 'node:http';
import express from 'express';
import bodyParser from 'body-parser';
import bcrypt from 'bcryptjs';
import router from '../backend/router';
import { pool, ensureDbReady, syncPropertyRoomCounts } from '../backend/db';
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

test('ROOM CONCURRENCY & TRANSACTION ISOLATION SUITE', async (t) => {
  // ⚡ Dynamically resize pool capacity for concurrent test storms
  const rawPool = (pool as unknown as { pool?: { config?: { connectionLimit?: number } } })?.pool;
  if (rawPool && rawPool.config) {
    rawPool.config.connectionLimit = 25;
  }

  // Fast schema check: only run full DDL migrations if core tables do not exist
  try {
    await pool.query('SELECT 1 FROM rooms, properties, users, rentals LIMIT 1');
  } catch {
    await ensureDbReady();
  }

  // 1. Boot isolated Express instance on dynamic port 0
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

  // Track in-flight requests and ensure per-request timeout & closed connections
  const inFlightRequests = new Set<Promise<unknown>>();

  async function fetchWithTimeout(
    url: string,
    init: RequestInit = {},
    timeoutMs = 10000
  ): Promise<{ status: number; body: any }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const reqPromise = (async () => {
      try {
        const res = await fetch(url, {
          ...init,
          signal: controller.signal,
          headers: {
            ...init.headers,
            Connection: 'close'
          }
        });
        let body: any = null;
        const text = await res.text();
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          body = { raw: text };
        }
        return { status: res.status, body };
      } finally {
        clearTimeout(timer);
      }
    })();

    inFlightRequests.add(reqPromise);
    reqPromise.finally(() => inFlightRequests.delete(reqPromise));
    return reqPromise;
  }

  // Unique isolation tag for test entities
  const tag = crypto.randomBytes(4).toString('hex');
  const landlordId = `landlord-cstorm-${tag}`;
  const propId = `prop-cstorm-${tag}`;
  const targetRoomId = `room-${tag}-101`;
  const room102Id = `room-${tag}-102`;
  const room103Id = `room-${tag}-103`;
  const testPassword = 'SecurePassword123!';
  const hashedPassword = bcrypt.hashSync(testPassword, 10);

  // Helper for cleanup
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

  // Unified 3-phase teardown: settle requests -> cleanup DB records -> sever keep-alive sockets & close server
  t.after(async () => {
    // Phase 1: Wait for all in-flight requests to completely settle
    if (inFlightRequests.size > 0) {
      await Promise.allSettled(Array.from(inFlightRequests));
    }

    // Phase 2: Atomically clean up test DB rows (no active queries can conflict)
    await cleanupTestData();

    // Phase 3: Gracefully close Express server and forcefully sever keep-alive sockets
    await new Promise<void>((resolve) => {
      const rawServer = server as unknown as {
        closeAllConnections?: () => void;
        closeIdleConnections?: () => void;
      };
      if (typeof rawServer.closeAllConnections === 'function') {
        rawServer.closeAllConnections();
      } else if (typeof rawServer.closeIdleConnections === 'function') {
        rawServer.closeIdleConnections();
      }
      server.close(() => resolve());
    });
  });

  // 2. Seed Landlord and Property
  await pool.query(
    `INSERT INTO users (id, name, email, role, password, balance, totalRevenue) 
     VALUES (?, 'Concurrency Landlord', ?, 'landlord', ?, 0, 0)`,
    [landlordId, `landlord-${tag}@kosmo.test`, hashedPassword]
  );

  const propertyBasePrice = 3500000;
  await pool.query(
    `INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId) 
     VALUES (?, 'KOSMO Concurrency Haven', 'Canggu', 'Jl. Pantai Batu Mejan, Canggu', ?, 5, 0, ?)`,
    [propId, propertyBasePrice, landlordId]
  );

  // 3. Seed 5 Discrete Rooms (101 target, 102, 103, 104, 105)
  await pool.query(
    `INSERT INTO rooms (id, propertyId, roomNumber, floor, type, price, status) VALUES
     (?, ?, '101', 1, 'Deluxe', NULL, 'available'),
     (?, ?, '102', 1, 'Standard', NULL, 'available'),
     (?, ?, '103', 1, 'Standard', NULL, 'available'),
     (?, ?, '104', 2, 'Deluxe', NULL, 'available'),
     (?, ?, '105', 2, 'Deluxe', NULL, 'available')`,
    [targetRoomId, propId, room102Id, propId, room103Id, propId, `room-${tag}-104`, propId, `room-${tag}-105`, propId]
  );

  await syncPropertyRoomCounts(pool, propId);

  // 4. Seed 10 Distinct Tenants with complete KYC identity profiles (batched query)
  const tenantIds: string[] = [];
  const tenantTokens: string[] = [];
  const userPlaceholders: string[] = [];
  const userParams: (string | number)[] = [];

  for (let i = 0; i < 10; i++) {
    const tId = `tenant-cstorm-${tag}-${i}`;
    const tEmail = `tenant-cstorm-${tag}-${i}@kosmo.test`;
    tenantIds.push(tId);
    userPlaceholders.push("(?, ?, ?, 'tenant', ?, '+6281234567890', 'NIK', ?, 'Jl. Sunset Road No. 88, Badung', 'Software Engineer', 'Emergency Contact', '+6281234567899', 'Family')");
    userParams.push(tId, `Storm Tenant ${i}`, tEmail, hashedPassword, `517101230898${(2000 + i).toString()}`);
    tenantTokens.push(generateJwtToken({ id: tId, email: tEmail, role: 'tenant' }));
  }

  await pool.query(
    `INSERT INTO users (
      id, name, email, role, password, phone, identity_type, identity_number, address, occupation,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relation
    ) VALUES ${userPlaceholders.join(', ')}`,
    userParams
  );

  // =========================================================================
  // STORM 1: 10-Tenant Concurrency Storm for the EXACT SAME roomId
  // =========================================================================
  await t.test('Storm 1: 10 concurrent tenants dispatch booking requests for the exact same roomId', async () => {
    // Assert baseline pre-conditions
    const [preRoom] = await pool.query<RoomRow[]>('SELECT status FROM rooms WHERE id = ?', [targetRoomId]);
    assert.equal(preRoom[0].status, 'available', 'Target room must initially be available');

    const [preProp] = await pool.query<PropertyRow[]>('SELECT occupiedRooms, totalRooms FROM properties WHERE id = ?', [propId]);
    assert.equal(preProp[0].occupiedRooms, 0, 'Property occupiedRooms must initially be 0');

    // Fire 10 concurrent requests simultaneously targeting targetRoomId
    const stormPromises = tenantTokens.map(async (tok, idx) => {
      const rentalId = `rent-cstorm-${tag}-${idx}`;
      const res = await fetchWithTimeout(`${baseUrl}/rentals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tok}`,
          'X-Forwarded-For': `192.168.1.${100 + idx}`,
          'User-Agent': `ConcurrencyStormClient/${idx}`
        },
        body: JSON.stringify({
          rentalId,
          tenantId: tenantIds[idx],
          propertyId: propId,
          roomId: targetRoomId,
          durationMonths: 1,
          startDate: '2026-10-01'
        })
      });

      return { status: res.status, body: res.body, tenantIndex: idx, rentalId };
    });

    const results = await Promise.all(stormPromises);

    // Analyze status code distribution
    const statusCounts: Record<number, number> = {};
    for (const r of results) {
      statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    }

    // ORACLE ASSERTIONS:
    // 1. Exactly 1 request succeeds with HTTP 201 Created (or 200 OK)
    const successCount = (statusCounts[201] || 0) + (statusCounts[200] || 0);
    assert.equal(
      successCount,
      1,
      `Exactly 1 request must succeed. Got status distribution: ${JSON.stringify(statusCounts)}`
    );

    // 2. Exactly 9 requests are rejected with HTTP 409 Conflict
    assert.equal(
      statusCounts[409] || 0,
      9,
      `Exactly 9 requests must be rejected with 409 Conflict. Got: ${JSON.stringify(statusCounts)}`
    );

    // 3. ZERO unhandled internal server errors or deadlock crashes (Error 1213)
    assert.equal(
      statusCounts[500] || 0,
      0,
      'Zero 500 internal server errors or deadlock crashes permitted under concurrency'
    );

    // 4. Verify post-storm database state: Room status MUST be 'occupied'
    const [postRoom] = await pool.query<RoomRow[]>('SELECT status FROM rooms WHERE id = ?', [targetRoomId]);
    assert.equal(postRoom[0].status, 'occupied', 'Target room status must be occupied in database');

    // 5. Verify exactly 1 active rental exists for this room
    const [activeRentals] = await pool.query<RentalRow[]>(
      "SELECT id, tenantId, roomId, status FROM rentals WHERE propertyId = ? AND roomId = ? AND status = 'active'",
      [propId, targetRoomId]
    );
    assert.equal(activeRentals.length, 1, 'Exactly 1 active rental record must be associated with target roomId');

    // 6. Verify property occupiedRooms is synchronized to exactly 1
    const [postProp] = await pool.query<PropertyRow[]>('SELECT occupiedRooms, totalRooms FROM properties WHERE id = ?', [propId]);
    assert.equal(postProp[0].occupiedRooms, 1, 'Property occupiedRooms must equal 1');

    // 7. Verify remaining 4 rooms remain completely unaffected and available
    const [otherRooms] = await pool.query<RoomRow[]>(
      'SELECT id, roomNumber, status FROM rooms WHERE propertyId = ? AND id != ? ORDER BY roomNumber ASC',
      [propId, targetRoomId]
    );
    assert.equal(otherRooms.length, 4);
    assert.ok(otherRooms.every((r) => r.status === 'available'), 'All non-targeted rooms must remain available');
  });

  // =========================================================================
  // STORM 2: Tenancy Termination & Room Re-Availability Lifecycle
  // =========================================================================
  await t.test('Storm 2: Winning rental termination releases room back to available, allowing subsequent booking', async () => {
    // Find the winning rental from Storm 1
    const [activeRentals] = await pool.query<RentalRow[]>(
      "SELECT id, tenantId FROM rentals WHERE propertyId = ? AND roomId = ? AND status = 'active'",
      [propId, targetRoomId]
    );
    assert.equal(activeRentals.length, 1);
    const winningRentalId = activeRentals[0].id;
    const winningTenantId = activeRentals[0].tenantId;
    const winningTenantIdx = tenantIds.indexOf(winningTenantId);
    const winningToken = tenantTokens[winningTenantIdx];

    // Terminate rental via POST /api/rentals/:id/terminate
    const termRes = await fetchWithTimeout(`${baseUrl}/rentals/${winningRentalId}/terminate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${winningToken}`
      },
      body: JSON.stringify({
        password: testPassword
      })
    });

    assert.equal(termRes.status, 200, 'Rental termination must return 200 OK');

    // Assert room status is released back to 'available'
    const [roomAfterTerm] = await pool.query<RoomRow[]>('SELECT status FROM rooms WHERE id = ?', [targetRoomId]);
    assert.equal(roomAfterTerm[0].status, 'available', 'Terminated rental must release room status back to available');

    // Assert property occupiedRooms decrements back to 0
    const [propAfterTerm] = await pool.query<PropertyRow[]>('SELECT occupiedRooms FROM properties WHERE id = ?', [propId]);
    assert.equal(propAfterTerm[0].occupiedRooms, 0, 'Property occupiedRooms must decrement to 0');

    // Now, a previously rejected tenant (e.g., Tenant index 1) re-attempts booking for targetRoomId
    const retryIdx = (winningTenantIdx + 1) % 10;
    const retryToken = tenantTokens[retryIdx];
    const retryRentalId = `rent-cstorm-retry-${tag}`;

    const retryRes = await fetchWithTimeout(`${baseUrl}/rentals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${retryToken}`
      },
      body: JSON.stringify({
        rentalId: retryRentalId,
        tenantId: tenantIds[retryIdx],
        propertyId: propId,
        roomId: targetRoomId,
        durationMonths: 1,
        startDate: '2026-11-01'
      })
    });

    assert.equal(retryRes.status, 201, 'Previously rejected tenant must now succeed with 201 Created');

    // Room status transitions back to occupied
    const [finalRoom] = await pool.query<RoomRow[]>('SELECT status FROM rooms WHERE id = ?', [targetRoomId]);
    assert.equal(finalRoom[0].status, 'occupied', 'Re-booked room must return to occupied status');
  });

  // =========================================================================
  // STORM 3: Maintenance Status Lockout Protection
  // =========================================================================
  await t.test('Storm 3: Room in maintenance mode rejects booking attempts with 409 Conflict', async () => {
    // Set room 103 to maintenance directly or via status endpoint
    await pool.query("UPDATE rooms SET status = 'maintenance' WHERE id = ?", [room103Id]);

    const tenantIdx = 5;
    const res = await fetchWithTimeout(`${baseUrl}/rentals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantTokens[tenantIdx]}`
      },
      body: JSON.stringify({
        rentalId: `rent-cstorm-maint-${tag}`,
        tenantId: tenantIds[tenantIdx],
        propertyId: propId,
        roomId: room103Id,
        durationMonths: 1,
        startDate: '2026-12-01'
      })
    });

    assert.equal(res.status, 409, 'Booking a room in maintenance must be rejected with 409 Conflict');
    const [roomRow] = await pool.query<RoomRow[]>('SELECT status FROM rooms WHERE id = ?', [room103Id]);
    assert.equal(roomRow[0].status, 'maintenance', 'Room status must remain maintenance');
  });

  // =========================================================================
  // STORM 4: Cross-Property Room Mismatch Guard
  // =========================================================================
  await t.test('Storm 4: Booking with roomId belonging to another property is rejected with 400/404', async () => {
    const foreignPropId = `prop-foreign-${tag}`;
    await pool.query(
      `INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId) 
       VALUES (?, 'Foreign Property', 'Denpasar', 'Jl. Teuku Umar No. 1', 3000000, 2, 0, ?)`,
      [foreignPropId, landlordId]
    );

    const tenantIdx = 6;
    const res = await fetchWithTimeout(`${baseUrl}/rentals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantTokens[tenantIdx]}`
      },
      body: JSON.stringify({
        rentalId: `rent-cstorm-mismatch-${tag}`,
        tenantId: tenantIds[tenantIdx],
        propertyId: foreignPropId,
        roomId: targetRoomId, // targetRoomId belongs to propId, NOT foreignPropId
        durationMonths: 1,
        startDate: '2026-12-01'
      })
    });

    assert.ok(
      res.status === 400 || res.status === 404 || res.status === 409,
      `Cross-property room allocation must be rejected. Got status: ${res.status}`
    );

    await pool.query('DELETE FROM properties WHERE id = ?', [foreignPropId]);
  });

  // =========================================================================
  // STORM 5: POST /api/payment/token Concurrency, Locking & Tenancy Guard
  // =========================================================================
  await t.test('Storm 5: POST /api/payment/token enforces row-level locking and single active tenancy', async (t5) => {
    // 5.1 Single Active Tenancy Guard returns HTTP 409 when tenant already has active lease
    await t5.test('5.1 Rejects token request with 409 Conflict if tenant already has an active lease', async () => {
      // Seed an active rental for Tenant 0
      const activeRentId = `rent-active-guard-${tag}`;
      await pool.query(
        "INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status) VALUES (?, ?, ?, 'KOSMO Haven', 3500000, '2026-10-01', 'active')",
        [activeRentId, tenantIds[0], propId]
      );

      const res = await fetchWithTimeout(`${baseUrl}/payment/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantTokens[0]}`
        },
        body: JSON.stringify({
          propertyId: propId,
          tenantId: tenantIds[0],
          durationMonths: 1,
          roomId: room102Id
        })
      });

      assert.equal(res.status, 409, 'Must return HTTP 409 Conflict when tenant has active lease');
      const body = res.body as { message?: string };
      assert.match(body.message || '', /Single Active Tenancy Violation/);

      // Clean up active rental
      await pool.query('DELETE FROM rentals WHERE id = ?', [activeRentId]);
    });

    // 5.2 Room Availability Guard returns HTTP 409 when roomId is occupied or in maintenance
    await t5.test('5.2 Rejects token request with 409 Conflict if target roomId is in maintenance or occupied', async () => {
      await pool.query("UPDATE rooms SET status = 'maintenance' WHERE id = ?", [room102Id]);

      const res = await fetchWithTimeout(`${baseUrl}/payment/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantTokens[1]}`
        },
        body: JSON.stringify({
          propertyId: propId,
          tenantId: tenantIds[1],
          durationMonths: 1,
          roomId: room102Id
        })
      });

      assert.equal(res.status, 409, 'Must return HTTP 409 when room is in maintenance');
      await pool.query("UPDATE rooms SET status = 'available' WHERE id = ?", [room102Id]);
    });

    // 5.3 Cross-Property Room Mismatch Guard returns HTTP 404
    await t5.test('5.3 Rejects token request with 404 when roomId does not belong to propertyId', async () => {
      const foreignPropId = `prop-tok-foreign-${tag}`;
      await pool.query(
        "INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId) VALUES (?, 'Foreign', 'Ubud', 'Jl. Raya Ubud', 4000000, 2, 0, ?)",
        [foreignPropId, landlordId]
      );

      const res = await fetchWithTimeout(`${baseUrl}/payment/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantTokens[1]}`
        },
        body: JSON.stringify({
          propertyId: foreignPropId,
          tenantId: tenantIds[1],
          durationMonths: 1,
          roomId: room102Id // belongs to propId, not foreignPropId
        })
      });

      assert.equal(res.status, 404, 'Must return HTTP 404 when room does not belong to property');
      await pool.query('DELETE FROM properties WHERE id = ?', [foreignPropId]);
    });

    // 5.4 High-Concurrency Token Generation: concurrent requests without 500 error or deadlock
    await t5.test('5.4 Concurrent token generation requests execute cleanly without deadlock (zero Error 1213)', async () => {
      const tokenPromises = tenantTokens.slice(2, 7).map((tok, idx) => {
        const actualIdx = idx + 2;
        return fetchWithTimeout(`${baseUrl}/payment/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tok}`
          },
          body: JSON.stringify({
            propertyId: propId,
            tenantId: tenantIds[actualIdx],
            durationMonths: 1
          })
        }, 10000);
      });

      const settled = await Promise.allSettled(tokenPromises);
      for (const s of settled) {
        assert.equal(s.status, 'fulfilled', `Request must not reject/hang: ${s.status === 'rejected' ? s.reason : ''}`);
      }
      const results = settled.map((s) => (s as PromiseFulfilledResult<{ status: number; body: unknown }>).value);

      assert.ok(
        results.every((r) => r.status === 200 || r.status === 409),
        `All token requests must return 200 or 409, no 500 permitted. Got statuses: ${results.map((r) => r.status).join(',')}`
      );
    });
  });
});