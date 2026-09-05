(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
(process.env as Record<string, string | undefined>).NO_LISTEN = 'true';
(process.env as Record<string, string | undefined>).DB_CONNECTION_LIMIT = '20';
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

interface PropertyRow extends RowDataPacket {
  id: string;
  name: string;
  totalRooms: number;
  occupiedRooms: number;
  price: number;
  ownerId: string;
}

test('ADVERSARIAL SECURITY, RBAC & BOUNDARY INTEGRITY SUITE (M2)', async (t) => {
  await ensureDbReady();

  // 1. Boot test express server
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

  // Unique isolation identifiers
  const tag = crypto.randomBytes(4).toString('hex');
  const landlordA_Id = `landlord-A-${tag}`;
  const landlordB_Id = `landlord-B-${tag}`;
  const adminId = `admin-${tag}`;
  const tenantId = `tenant-${tag}`;

  const landlordA_Password = 'LandlordAPassword123!';
  const landlordB_Password = 'LandlordBPassword123!';
  const adminPassword = 'AdminPassword123!';
  const tenantPassword = 'TenantPassword123!';

  const propA_Id = `prop-A-${tag}`;
  const propB_Id = `prop-B-${tag}`;

  const roomA101_Id = `room-A101-${tag}`;
  const roomA102_Id = `room-A102-${tag}`;
  const roomB101_Id = `room-B101-${tag}`;

  const landlordA_Token = generateJwtToken({ id: landlordA_Id, email: `landlordA-${tag}@kosmo.test`, role: 'landlord' });
  const landlordB_Token = generateJwtToken({ id: landlordB_Id, email: `landlordB-${tag}@kosmo.test`, role: 'landlord' });
  const adminToken = generateJwtToken({ id: adminId, email: `admin-${tag}@kosmo.test`, role: 'admin' });
  const tenantToken = generateJwtToken({ id: tenantId, email: `tenant-${tag}@kosmo.test`, role: 'tenant' });

  // Cleanup helper
  const cleanupTestData = async () => {
    try {
      await pool.query('DELETE FROM rentals WHERE propertyId IN (?, ?) OR id LIKE ?', [propA_Id, propB_Id, `%${tag}%`]);
      await pool.query('DELETE FROM property_photos WHERE propertyId IN (?, ?)', [propA_Id, propB_Id]);
      await pool.query('DELETE FROM rooms WHERE propertyId IN (?, ?)', [propA_Id, propB_Id]);
      await pool.query('DELETE FROM properties WHERE id IN (?, ?)', [propA_Id, propB_Id]);
      await pool.query('DELETE FROM users WHERE id IN (?, ?, ?, ?)', [landlordA_Id, landlordB_Id, adminId, tenantId]);
    } catch (err) {
      console.warn('Cleanup warning:', err);
    }
  };

  t.after(async () => {
    await cleanupTestData();
  });

  await cleanupTestData();

  // 2. Seed Users
  await pool.query(
    `INSERT INTO users (id, name, email, role, password, balance, totalRevenue) VALUES
     (?, 'Landlord A', ?, 'landlord', ?, 0, 0),
     (?, 'Landlord B', ?, 'landlord', ?, 0, 0),
     (?, 'Admin User', ?, 'admin', ?, 0, 0),
     (?, 'Tenant User', ?, 'tenant', ?, 0, 0)`,
    [
      landlordA_Id, `landlordA-${tag}@kosmo.test`, bcrypt.hashSync(landlordA_Password, 10),
      landlordB_Id, `landlordB-${tag}@kosmo.test`, bcrypt.hashSync(landlordB_Password, 10),
      adminId, `admin-${tag}@kosmo.test`, bcrypt.hashSync(adminPassword, 10),
      tenantId, `tenant-${tag}@kosmo.test`, bcrypt.hashSync(tenantPassword, 10)
    ]
  );

  // 3. Seed Properties
  await pool.query(
    `INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId) VALUES
     (?, 'Property Landlord A', 'Canggu', 'Jl. Pantai Batu Bolong 1', 3000000, 2, 0, ?),
     (?, 'Property Landlord B', 'Ubud', 'Jl. Monkey Forest 1', 4000000, 1, 0, ?)`,
    [propA_Id, landlordA_Id, propB_Id, landlordB_Id]
  );

  // 4. Seed Initial Rooms
  await pool.query(
    `INSERT INTO rooms (id, propertyId, roomNumber, floor, type, price, status) VALUES
     (?, ?, '101', 1, 'Deluxe', 3500000, 'available'),
     (?, ?, '102', 1, 'Standard', 3000000, 'available'),
     (?, ?, '101', 1, 'Suite', 4500000, 'available')`,
    [roomA101_Id, propA_Id, roomA102_Id, propA_Id, roomB101_Id, propB_Id]
  );

  await syncPropertyRoomCounts(pool, propA_Id);
  await syncPropertyRoomCounts(pool, propB_Id);

  // =========================================================================
  // Test Suite 1: RBAC Enforcement
  // =========================================================================
  await t.test('1.1 RBAC: Unauthenticated caller is rejected with 401 Unauthorized', async () => {
    const endpoints = [
      { method: 'POST', url: `${baseUrl}/properties/${propA_Id}/rooms`, body: { roomNumber: '103', floor: 1 } },
      { method: 'PUT', url: `${baseUrl}/properties/${propA_Id}/rooms/${roomA101_Id}`, body: { type: 'Premium' } },
      { method: 'PATCH', url: `${baseUrl}/properties/${propA_Id}/rooms/${roomA101_Id}/status`, body: { status: 'maintenance' } },
      { method: 'DELETE', url: `${baseUrl}/properties/${propA_Id}/rooms/${roomA101_Id}`, body: { password: 'any' } }
    ];

    for (const ep of endpoints) {
      const res = await fetch(ep.url, {
        method: ep.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ep.body)
      });
      assert.equal(res.status, 401, `Unauthenticated ${ep.method} ${ep.url} must return 401`);
    }
  });

  await t.test('1.2 RBAC: Tenant role is rejected with 403 Forbidden for room management', async () => {
    const endpoints = [
      { method: 'POST', url: `${baseUrl}/properties/${propA_Id}/rooms`, body: { roomNumber: '103', floor: 1, type: 'Standard' } },
      { method: 'PUT', url: `${baseUrl}/properties/${propA_Id}/rooms/${roomA101_Id}`, body: { type: 'Hacked' } },
      { method: 'PATCH', url: `${baseUrl}/properties/${propA_Id}/rooms/${roomA101_Id}/status`, body: { status: 'maintenance' } },
      { method: 'DELETE', url: `${baseUrl}/properties/${propA_Id}/rooms/${roomA101_Id}`, body: { password: tenantPassword } }
    ];

    for (const ep of endpoints) {
      const res = await fetch(ep.url, {
        method: ep.method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantToken}`
        },
        body: JSON.stringify(ep.body)
      });
      assert.equal(res.status, 403, `Tenant attempting ${ep.method} ${ep.url} must return 403 Forbidden`);
    }
  });

  await t.test('1.3 RBAC: Cross-landlord tampering is rejected with 403 Forbidden', async () => {
    // Landlord B attempts to modify Landlord A's property rooms
    const postRes = await fetch(`${baseUrl}/properties/${propA_Id}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordB_Token}` },
      body: JSON.stringify({ roomNumber: '103', floor: 1, type: 'Standard' })
    });
    assert.equal(postRes.status, 403, 'Landlord B cannot add rooms to Landlord A property');

    const putRes = await fetch(`${baseUrl}/properties/${propA_Id}/rooms/${roomA101_Id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordB_Token}` },
      body: JSON.stringify({ type: 'Hijacked' })
    });
    assert.equal(putRes.status, 403, 'Landlord B cannot edit rooms on Landlord A property');

    const patchRes = await fetch(`${baseUrl}/properties/${propA_Id}/rooms/${roomA101_Id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordB_Token}` },
      body: JSON.stringify({ status: 'maintenance' })
    });
    assert.equal(patchRes.status, 403, 'Landlord B cannot toggle status of Landlord A room');

    const delRes = await fetch(`${baseUrl}/properties/${propA_Id}/rooms/${roomA101_Id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordB_Token}` },
      body: JSON.stringify({ password: landlordB_Password })
    });
    assert.equal(delRes.status, 403, 'Landlord B cannot delete Landlord A room');
  });

  await t.test('1.4 RBAC: Admin role can manage rooms across any property', async () => {
    // Admin creates room on Landlord A's property
    const postRes = await fetch(`${baseUrl}/properties/${propA_Id}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ roomNumber: '999', floor: 9, type: 'Admin Suite', price: 9000000 })
    });
    assert.equal(postRes.status, 201, 'Admin can create room on any property');
    const postBody = (await postRes.json()) as { room: { id: string } };
    const adminRoomId = postBody.room.id;

    // Admin updates the room
    const putRes = await fetch(`${baseUrl}/properties/${propA_Id}/rooms/${adminRoomId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ type: 'Admin Presidential Suite' })
    });
    assert.equal(putRes.status, 200, 'Admin can update room on any property');

    // Admin toggles status
    const patchRes = await fetch(`${baseUrl}/properties/${propA_Id}/rooms/${adminRoomId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'maintenance' })
    });
    assert.equal(patchRes.status, 200, 'Admin can toggle status on any property');

    // Admin deletes the room using admin password
    const delRes = await fetch(`${baseUrl}/properties/${propA_Id}/rooms/${adminRoomId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ password: adminPassword })
    });
    assert.equal(delRes.status, 200, 'Admin can delete room on any property');
  });

  // =========================================================================
  // Test Suite 2: Password-Gated Deletion & Occupancy Protection
  // =========================================================================
  await t.test('2.1 Deletion: Rejects wrong password with 401', async () => {
    const res = await fetch(`${baseUrl}/properties/${propA_Id}/rooms/${roomA102_Id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordA_Token}` },
      body: JSON.stringify({ password: 'WrongPassword999!' })
    });
    assert.equal(res.status, 401, 'Wrong password must return 401 Unauthorized');
  });

  await t.test('2.2 Deletion: Rejects missing or empty password with 400', async () => {
    const res1 = await fetch(`${baseUrl}/properties/${propA_Id}/rooms/${roomA102_Id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordA_Token}` },
      body: JSON.stringify({})
    });
    assert.equal(res1.status, 400, 'Missing password must return 400 Bad Request');

    const res2 = await fetch(`${baseUrl}/properties/${propA_Id}/rooms/${roomA102_Id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordA_Token}` },
      body: JSON.stringify({ password: '' })
    });
    assert.equal(res2.status, 400, 'Empty password must return 400 Bad Request');
  });

  await t.test('2.3 Deletion: Rejects deleting occupied room with 400 Bad Request', async () => {
    // Set room to occupied directly
    await pool.query("UPDATE rooms SET status = 'occupied' WHERE id = ?", [roomA102_Id]);

    const res = await fetch(`${baseUrl}/properties/${propA_Id}/rooms/${roomA102_Id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordA_Token}` },
      body: JSON.stringify({ password: landlordA_Password })
    });
    assert.equal(res.status, 400, 'Deleting occupied room must return 400 Bad Request');
    const body = (await res.json()) as { message: string };
    assert.ok(body.message.includes('occupied') || body.message.includes('terisi'));

    // Revert status to available
    await pool.query("UPDATE rooms SET status = 'available' WHERE id = ?", [roomA102_Id]);
  });

  await t.test('2.4 Deletion: Rejects deleting room with active rental with 400 Bad Request', async () => {
    const rentalId = `rent-active-${tag}`;
    await pool.query(
      `INSERT INTO rentals (id, tenantId, propertyId, propertyName, roomId, status, price, startDate, duration_months)
       VALUES (?, ?, ?, 'Property Landlord A', ?, 'active', 3000000, '2026-09-01', 1)`,
      [rentalId, tenantId, propA_Id, roomA102_Id]
    );

    const res = await fetch(`${baseUrl}/properties/${propA_Id}/rooms/${roomA102_Id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordA_Token}` },
      body: JSON.stringify({ password: landlordA_Password })
    });
    assert.equal(res.status, 400, 'Deleting room with active rental must return 400 Bad Request');

    await pool.query('DELETE FROM rentals WHERE id = ?', [rentalId]);
  });

  // =========================================================================
  // Test Suite 3: Maintenance Status Toggles & Active Lease Guard
  // =========================================================================
  await t.test('3.1 Maintenance Toggle: Available room toggles to maintenance and back to available', async () => {
    // 1. Toggle available -> maintenance
    const res1 = await fetch(`${baseUrl}/properties/${propA_Id}/rooms/${roomA101_Id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordA_Token}` },
      body: JSON.stringify({ status: 'maintenance' })
    });
    assert.equal(res1.status, 200, 'Available room can be toggled to maintenance');
    const body1 = (await res1.json()) as { room: { status: string } };
    assert.equal(body1.room.status, 'maintenance');

    // 2. Toggle maintenance -> available
    const res2 = await fetch(`${baseUrl}/properties/${propA_Id}/rooms/${roomA101_Id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordA_Token}` },
      body: JSON.stringify({ status: 'available' })
    });
    assert.equal(res2.status, 200, 'Maintenance room can be toggled to available');
    const body2 = (await res2.json()) as { room: { status: string } };
    assert.equal(body2.room.status, 'available');
  });

  await t.test('3.2 Maintenance Toggle: Rejects invalid target status strings with 400', async () => {
    const invalidStatuses = ['occupied', 'broken', 'reserved', '', 123];
    for (const st of invalidStatuses) {
      const res = await fetch(`${baseUrl}/properties/${propA_Id}/rooms/${roomA101_Id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordA_Token}` },
        body: JSON.stringify({ status: st })
      });
      assert.equal(res.status, 400, `PATCH status with "${st}" must return 400 Bad Request`);
    }
  });

  await t.test('3.3 Maintenance Toggle: Rejects setting occupied room to maintenance while active tenancy exists with 409', async () => {
    const rentalId = `rent-maint-test-${tag}`;
    // Simulate room is occupied with active rental
    await pool.query("UPDATE rooms SET status = 'occupied' WHERE id = ?", [roomA101_Id]);
    await pool.query(
      `INSERT INTO rentals (id, tenantId, propertyId, propertyName, roomId, status, price, startDate, duration_months)
       VALUES (?, ?, ?, 'Property Landlord A', ?, 'active', 3500000, '2026-09-01', 1)`,
      [rentalId, tenantId, propA_Id, roomA101_Id]
    );

    const res = await fetch(`${baseUrl}/properties/${propA_Id}/rooms/${roomA101_Id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordA_Token}` },
      body: JSON.stringify({ status: 'maintenance' })
    });
    assert.equal(res.status, 409, 'Toggling occupied room with active tenancy to maintenance must return 409 Conflict');

    // Clean up
    await pool.query('DELETE FROM rentals WHERE id = ?', [rentalId]);
    await pool.query("UPDATE rooms SET status = 'available' WHERE id = ?", [roomA101_Id]);
  });

  // =========================================================================
  // Test Suite 4: Boundary Conditions & Input Validation
  // =========================================================================
  await t.test('4.1 Boundary: Negative and non-positive pricing is rejected with 400', async () => {
    const badPrices = [-1000, -1, 0, 'invalid'];
    for (const badPrice of badPrices) {
      const res = await fetch(`${baseUrl}/properties/${propA_Id}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordA_Token}` },
        body: JSON.stringify({ roomNumber: `badprice-${tag}`, floor: 1, type: 'Standard', price: badPrice })
      });
      assert.equal(res.status, 400, `Price ${badPrice} must be rejected with 400`);
    }
  });

  await t.test('4.2 Boundary: Negative floor is rejected with 400', async () => {
    const res = await fetch(`${baseUrl}/properties/${propA_Id}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordA_Token}` },
      body: JSON.stringify({ roomNumber: `badfloor-${tag}`, floor: -1, type: 'Standard' })
    });
    assert.equal(res.status, 400, 'Negative floor must be rejected with 400');
  });

  await t.test('4.3 Boundary: Empty or whitespace room number is rejected with 400', async () => {
    const badRoomNumbers = ['', '   ', null];
    for (const br of badRoomNumbers) {
      const res = await fetch(`${baseUrl}/properties/${propA_Id}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordA_Token}` },
        body: JSON.stringify({ roomNumber: br, floor: 1, type: 'Standard' })
      });
      assert.equal(res.status, 400, `Room number "${br}" must be rejected with 400`);
    }
  });

  await t.test('4.4 Boundary: Duplicate room number in same property is rejected with 409', async () => {
    // Room '101' already exists in propA
    const res = await fetch(`${baseUrl}/properties/${propA_Id}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordA_Token}` },
      body: JSON.stringify({ roomNumber: '101', floor: 1, type: 'Standard' })
    });
    assert.equal(res.status, 409, 'Duplicate roomNumber in same property must return 409 Conflict');
  });

  await t.test('4.5 Boundary: Same room number in DIFFERENT property is permitted', async () => {
    // Landlord B adding room '102' (which also exists in propA) to propB
    const res = await fetch(`${baseUrl}/properties/${propB_Id}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordB_Token}` },
      body: JSON.stringify({ roomNumber: '102', floor: 1, type: 'Standard' })
    });
    assert.equal(res.status, 201, 'Same roomNumber in different property must succeed with 201');
    const body = (await res.json()) as { room: { id: string } };
    await pool.query('DELETE FROM rooms WHERE id = ?', [body.room.id]);
  });

  await t.test('4.6 Boundary: Updating room to an existing room number in same property returns 409', async () => {
    // Attempt to rename room 102 to 101 in propA
    const res = await fetch(`${baseUrl}/properties/${propA_Id}/rooms/${roomA102_Id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordA_Token}` },
      body: JSON.stringify({ roomNumber: '101' })
    });
    assert.equal(res.status, 409, 'Renaming room to existing roomNumber in same property must return 409 Conflict');
  });

  // =========================================================================
  // Test Suite 5: Direct vs Nested Routes Evaluation
  // =========================================================================
  await t.test('5.1 Direct Routes: GET /api/rooms/:roomId returns room details', async () => {
    const res = await fetch(`${baseUrl}/rooms/${roomA101_Id}`);
    assert.equal(res.status, 200, 'Direct GET /api/rooms/:roomId must return 200 OK');
    const body = (await res.json()) as { id: string; roomNumber: string };
    assert.equal(body.id, roomA101_Id);
    assert.equal(body.roomNumber, '101');
  });

  await t.test('5.2 Direct Routes: PUT /api/rooms/:roomId behavior evaluation', async () => {
    const res = await fetch(`${baseUrl}/rooms/${roomA101_Id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordA_Token}` },
      body: JSON.stringify({ type: 'Direct Updated Type' })
    });
    console.log(`[EMPIRICAL FINDING] Direct PUT /rooms/:roomId HTTP status: ${res.status}`);
    const body = (await res.json()) as { message: string };
    console.log(`[EMPIRICAL FINDING] Direct PUT /rooms/:roomId response:`, body);
  });

  await t.test('5.3 Direct Routes: PATCH /api/rooms/:roomId/status behavior evaluation', async () => {
    const res = await fetch(`${baseUrl}/rooms/${roomA101_Id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordA_Token}` },
      body: JSON.stringify({ status: 'maintenance' })
    });
    console.log(`[EMPIRICAL FINDING] Direct PATCH /rooms/:roomId/status HTTP status: ${res.status}`);
    const body = (await res.json()) as { message: string };
    console.log(`[EMPIRICAL FINDING] Direct PATCH /rooms/:roomId/status response:`, body);
    if (res.status === 200) {
      await fetch(`${baseUrl}/rooms/${roomA101_Id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordA_Token}` },
        body: JSON.stringify({ status: 'available' })
      });
    }
  });

  await t.test('5.4 Direct Routes: DELETE /api/rooms/:roomId behavior evaluation', async () => {
    const res = await fetch(`${baseUrl}/rooms/${roomA102_Id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordA_Token}` },
      body: JSON.stringify({ password: landlordA_Password })
    });
    console.log(`[EMPIRICAL FINDING] Direct DELETE /rooms/:roomId HTTP status: ${res.status}`);
    const body = (await res.json()) as { message: string };
    console.log(`[EMPIRICAL FINDING] Direct DELETE /rooms/:roomId response:`, body);
  });

  await t.test('5.5 Cross-property URL mismatch: /properties/:propB/rooms/:roomA returns 404', async () => {
    const res = await fetch(`${baseUrl}/properties/${propB_Id}/rooms/${roomA101_Id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${landlordB_Token}` },
      body: JSON.stringify({ type: 'Mismatch Attempt' })
    });
    assert.equal(res.status, 404, 'Accessing room with mismatched propertyId in URL must return 404 Not Found');
  });
});

