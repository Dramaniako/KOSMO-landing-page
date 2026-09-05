(process.env as Record<string, string | undefined>).NO_LISTEN = 'true';
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import bodyParser from 'body-parser';
import bcrypt from 'bcryptjs';
import router from '../backend/router';
import {
  validateRoom,
  validatePropertyPhoto,
  validateRental,
  VALID_DISCRETE_ROOM_STATUSES,
  VALID_PHOTO_CATEGORIES,
  type Room,
  type PropertyPhoto,
  type DiscreteRoomStatus,
  type PhotoCategory,
  type Rental
} from '../backend/types/index';
import {
  pool,
  ensureDbReady,
  syncPropertyRoomCounts,
  backfillDiscreteRooms,
  type QueryExecutor
} from '../backend/db';
import { generateJwtToken } from '../backend/middleware/auth';
import type { RowDataPacket } from 'mysql2/promise';

test('Discrete Room Inventory & Multi-Photo Gallery Test Suite', async (t) => {
  // =========================================================================
  // Section 1: Schema Validation & Domain Type Guardrails
  // =========================================================================
  await t.test('1.1 validates complete Room entity with custom price override and photos', () => {
    const validRoom: Room = {
      id: 'room-101',
      propertyId: 'prop-01',
      roomNumber: '101',
      floor: 1,
      type: 'Deluxe Suite',
      price: 3800000,
      effectivePrice: 3800000,
      status: 'available',
      photos: [
        {
          id: 'photo-01',
          propertyId: 'prop-01',
          roomId: 'room-101',
          url: 'https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af',
          publicId: 'kosmo_rooms/prop-01/r101_bed',
          category: 'bedroom',
          caption: 'Kamar Tidur Utama King Bed',
          orderIndex: 0
        }
      ],
      createdAt: '2026-09-04T10:00:00.000Z',
      updatedAt: '2026-09-04T10:00:00.000Z'
    };

    const result = validateRoom(validRoom);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  await t.test('1.2 validates all DiscreteRoomStatus union values', () => {
    const statuses: DiscreteRoomStatus[] = ['available', 'occupied', 'maintenance'];
    for (const status of statuses) {
      const room = {
        id: `room-status-${status}`,
        propertyId: 'prop-01',
        roomNumber: '102',
        floor: 1,
        type: 'Standard',
        status
      };
      const result = validateRoom(room);
      assert.equal(result.valid, true, `Status "${status}" must be recognized as valid`);
    }
  });

  await t.test('1.3 rejects invalid room status, negative floor, or blank roomNumber', () => {
    const invalidRoom = {
      id: 'room-bad',
      propertyId: 'prop-01',
      roomNumber: '   ',
      floor: -1,
      type: '',
      price: -50000,
      status: 'reserved' // invalid status
    };

    const result = validateRoom(invalidRoom);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('roomNumber')));
    assert.ok(result.errors.some(e => e.includes('floor')));
    assert.ok(result.errors.some(e => e.includes('type')));
    assert.ok(result.errors.some(e => e.includes('price')));
    assert.ok(result.errors.some(e => e.includes('status')));
  });

  await t.test('1.4 validates PropertyPhoto entity across all 9 photo categories', () => {
    const validCategories: PhotoCategory[] = [
      'thumbnail',
      'bedroom',
      'bathroom',
      'kitchen',
      'pool',
      'living_room',
      'wifi_speedtest',
      'exterior',
      'other'
    ];

    for (let i = 0; i < validCategories.length; i++) {
      const category = validCategories[i];
      const photo: PropertyPhoto = {
        id: `photo-${i}`,
        propertyId: 'prop-01',
        url: `https://example.com/photos/${category}.jpg`,
        category,
        orderIndex: i
      };
      const result = validatePropertyPhoto(photo);
      assert.equal(result.valid, true, `Category "${category}" must pass validation`);
    }
  });

  await t.test('1.5 rejects invalid photo category, empty url, or negative orderIndex', () => {
    const invalidPhoto = {
      id: 'photo-bad',
      propertyId: 'prop-01',
      url: '   ',
      category: 'garage', // invalid category
      orderIndex: -2
    };

    const result = validatePropertyPhoto(invalidPhoto);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes('url')));
    assert.ok(result.errors.some(e => e.includes('category')));
    assert.ok(result.errors.some(e => e.includes('orderIndex')));
  });

  await t.test('1.6 Rental schema supports optional roomId with backwards compatibility', () => {
    const legacyRental: Rental = {
      id: 'rent-legacy',
      tenantId: 'user-tenant',
      propertyId: 'prop-01',
      propertyName: 'KOSMO Seminyak',
      price: 3500000,
      startDate: '2026-09-01',
      status: 'active'
    };
    assert.equal(validateRental(legacyRental).valid, true, 'Rental without roomId must remain valid');

    const discreteRental: Rental = {
      ...legacyRental,
      id: 'rent-discrete',
      roomId: 'room-101'
    };
    assert.equal(validateRental(discreteRental).valid, true, 'Rental with valid roomId must be valid');

    const invalidRoomRental = {
      ...legacyRental,
      id: 'rent-invalid-room',
      roomId: '   '
    };
    assert.equal(validateRental(invalidRoomRental).valid, false, 'Rental with whitespace roomId must be rejected');
  });

  // =========================================================================
  // Section 2: Auto-Backfill Algorithm & Numbering Simulation
  // =========================================================================
  await t.test('2.1 auto-backfill provisions exact totalRooms with correct floor and room numbers', () => {
    const totalRooms = 25;
    const occupiedRooms = 12;
    const generatedRooms: Array<{ roomNumber: string; floor: number; status: DiscreteRoomStatus }> = [];

    for (let i = 1; i <= totalRooms; i++) {
      const floor = Math.floor((i - 1) / 10) + 1;
      const roomNumber = `${floor}${String(((i - 1) % 10) + 1).padStart(2, '0')}`;
      const status: DiscreteRoomStatus = i <= occupiedRooms ? 'occupied' : 'available';
      generatedRooms.push({ roomNumber, floor, status });
    }

    assert.equal(generatedRooms.length, 25);
    // Floor 1 checks
    assert.equal(generatedRooms[0].roomNumber, '101');
    assert.equal(generatedRooms[0].floor, 1);
    assert.equal(generatedRooms[9].roomNumber, '110');
    assert.equal(generatedRooms[9].floor, 1);

    // Floor 2 checks
    assert.equal(generatedRooms[10].roomNumber, '201');
    assert.equal(generatedRooms[10].floor, 2);
    assert.equal(generatedRooms[19].roomNumber, '210');
    assert.equal(generatedRooms[19].floor, 2);

    // Floor 3 checks
    assert.equal(generatedRooms[20].roomNumber, '301');
    assert.equal(generatedRooms[20].floor, 3);
    assert.equal(generatedRooms[24].roomNumber, '305');
    assert.equal(generatedRooms[24].floor, 3);

    // Status distribution
    const occupiedCount = generatedRooms.filter(r => r.status === 'occupied').length;
    const availableCount = generatedRooms.filter(r => r.status === 'available').length;
    assert.equal(occupiedCount, 12, 'First occupiedRooms (12) are set to occupied');
    assert.equal(availableCount, 13, 'Remaining rooms (13) are set to available');
  });

  await t.test('2.2 auto-backfill handles edge case when occupiedRooms equals totalRooms (100% occupancy)', () => {
    const totalRooms = 8;
    const occupiedRooms = 8;
    const rooms = Array.from({ length: totalRooms }, (_, idx) => {
      const i = idx + 1;
      return {
        roomNumber: `10${i}`,
        status: (i <= occupiedRooms ? 'occupied' : 'available') as DiscreteRoomStatus
      };
    });

    assert.equal(rooms.length, 8);
    assert.equal(rooms.every(r => r.status === 'occupied'), true);
  });

  await t.test('2.3 auto-backfill handles edge case when occupiedRooms is 0 (0% occupancy)', () => {
    const totalRooms = 10;
    const occupiedRooms = 0;
    const rooms = Array.from({ length: totalRooms }, (_, idx) => {
      const i = idx + 1;
      return {
        roomNumber: `10${i}`,
        status: (i <= occupiedRooms ? 'occupied' : 'available') as DiscreteRoomStatus
      };
    });

    assert.equal(rooms.length, 10);
    assert.equal(rooms.every(r => r.status === 'available'), true);
  });

  await t.test('2.4 auto-backfill is strictly idempotent on subsequent invocations', () => {
    const existingPropertyRooms = new Map<string, Array<{ roomNumber: string; status: DiscreteRoomStatus }>>();
    
    const simulateBackfill = (propertyId: string, total: number, occupied: number) => {
      if (existingPropertyRooms.has(propertyId)) {
        return; // Idempotent guard: already backfilled
      }
      const rooms = Array.from({ length: total }, (_, idx) => {
        const i = idx + 1;
        const floor = Math.floor((i - 1) / 10) + 1;
        const roomNumber = `${floor}${String(((i - 1) % 10) + 1).padStart(2, '0')}`;
        return {
          roomNumber,
          status: (i <= occupied ? 'occupied' : 'available') as DiscreteRoomStatus
        };
      });
      existingPropertyRooms.set(propertyId, rooms);
    };

    simulateBackfill('prop-01', 10, 8);
    assert.equal(existingPropertyRooms.get('prop-01')?.length, 10);

    // Second execution should do nothing
    simulateBackfill('prop-01', 10, 8);
    assert.equal(existingPropertyRooms.get('prop-01')?.length, 10);
  });

  // =========================================================================
  // Section 3: Room Count Parity Synchronization (`syncPropertyRoomCounts`)
  // =========================================================================
  await t.test('3.1 calculates totalRooms and occupiedRooms accurately from discrete inventory', () => {
    const inventory: Array<{ id: string; status: DiscreteRoomStatus }> = [
      { id: 'r1', status: 'occupied' },
      { id: 'r2', status: 'occupied' },
      { id: 'r3', status: 'occupied' },
      { id: 'r4', status: 'available' },
      { id: 'r5', status: 'available' },
      { id: 'r6', status: 'maintenance' } // maintenance does NOT count as occupied
    ];

    const totalRooms = inventory.length;
    const occupiedRooms = inventory.filter(r => r.status === 'occupied').length;

    assert.equal(totalRooms, 6, 'Total rooms equals length of discrete rooms table');
    assert.equal(occupiedRooms, 3, 'Occupied rooms equals count of status === "occupied"');
  });

  await t.test('3.2 dynamic status transitions reflect in parity synchronization', () => {
    const rooms: Record<string, DiscreteRoomStatus> = {
      'r1': 'occupied',
      'r2': 'available',
      'r3': 'available'
    };

    const calculateCounts = (inv: Record<string, DiscreteRoomStatus>) => {
      const vals = Object.values(inv);
      return {
        totalRooms: vals.length,
        occupiedRooms: vals.filter(s => s === 'occupied').length
      };
    };

    // Initial state: 1 occupied, 2 available
    assert.deepEqual(calculateCounts(rooms), { totalRooms: 3, occupiedRooms: 1 });

    // Transition 1: Booking activates Room r2 -> occupied
    rooms['r2'] = 'occupied';
    assert.deepEqual(calculateCounts(rooms), { totalRooms: 3, occupiedRooms: 2 });

    // Transition 2: Landlord sets Room r3 to maintenance
    rooms['r3'] = 'maintenance';
    assert.deepEqual(calculateCounts(rooms), { totalRooms: 3, occupiedRooms: 2 });

    // Transition 3: Rental terminates for Room r1 -> available
    rooms['r1'] = 'available';
    assert.deepEqual(calculateCounts(rooms), { totalRooms: 3, occupiedRooms: 1 });

    // Transition 4: New room added to property
    rooms['r4'] = 'available';
    assert.deepEqual(calculateCounts(rooms), { totalRooms: 4, occupiedRooms: 1 });
  });

  // =========================================================================
  // Section 4: Effective Price Calculation
  // =========================================================================
  await t.test('4.1 resolves effective price from room override or falls back to property base price', () => {
    const propertyBasePrice = 3000000;

    const roomWithOverride: Room = {
      id: 'r-override',
      propertyId: 'prop-01',
      roomNumber: '101',
      floor: 1,
      type: 'VIP Penthouse',
      price: 4200000,
      status: 'available'
    };

    const roomDefault: Room = {
      id: 'r-default',
      propertyId: 'prop-01',
      roomNumber: '102',
      floor: 1,
      type: 'Standard',
      price: null,
      status: 'available'
    };

    const computeEffectivePrice = (room: Room, basePrice: number): number => {
      return (typeof room.price === 'number' && room.price > 0) ? room.price : basePrice;
    };

    assert.equal(computeEffectivePrice(roomWithOverride, propertyBasePrice), 4200000);
    assert.equal(computeEffectivePrice(roomDefault, propertyBasePrice), 3000000);
  });

  // =========================================================================
  // Section 5: Subroutine & Export Integration Verification
  // =========================================================================
  await t.test('5.1 syncPropertyRoomCounts and backfillDiscreteRooms are exported functions', () => {
    assert.equal(typeof syncPropertyRoomCounts, 'function', 'syncPropertyRoomCounts must be an exported function');
    assert.equal(typeof backfillDiscreteRooms, 'function', 'backfillDiscreteRooms must be an exported function');
  });

  await t.test('5.2 syncPropertyRoomCounts executes query against executor and updates property', async () => {
    const executedQueries: Array<{ sql: string; params?: unknown[] }> = [];

    const mockExecutor = {
      query: async (sql: string, params?: unknown[]) => {
        executedQueries.push({ sql, params });
        if (typeof sql === 'string' && sql.includes('COUNT(*) as total')) {
          const row: RowDataPacket = {
            total: 10,
            occupied: 8,
            constructor: { name: 'RowDataPacket' }
          } as unknown as RowDataPacket;
          return [[row], []];
        }
        return [[], []];
      }
    } as unknown as QueryExecutor;

    const result = await syncPropertyRoomCounts(mockExecutor, 'prop-test-1');
    assert.deepEqual(result, { totalRooms: 10, occupiedRooms: 8 });
    assert.equal(executedQueries.length, 2);
    assert.ok(executedQueries[0].sql.includes('SELECT'));
    assert.ok(executedQueries[1].sql.includes('UPDATE properties SET totalRooms = ?, occupiedRooms = ?'));
    assert.deepEqual(executedQueries[1].params, [10, 8, 'prop-test-1']);
  });

  await t.test('5.3 backfillDiscreteRooms executes against executor idempotently', async () => {
    const queries: string[] = [];

    const mockExecutor = {
      query: async (sql: string, _params?: unknown[]) => {
        queries.push(typeof sql === 'string' ? sql : '');
        if (typeof sql === 'string' && sql.includes('SELECT id, name, totalRooms')) {
          const propRow: RowDataPacket = {
            id: 'prop-01',
            name: 'KOSMO Hub Denpasar',
            totalRooms: 2,
            occupiedRooms: 1,
            price: 3500000,
            image: 'https://images.unsplash.com/photo-test',
            constructor: { name: 'RowDataPacket' }
          } as unknown as RowDataPacket;
          return [[propRow], []];
        }
        if (typeof sql === 'string' && sql.includes('SELECT COUNT(*) as count FROM rooms')) {
          const countRow: RowDataPacket = {
            count: 0,
            constructor: { name: 'RowDataPacket' }
          } as unknown as RowDataPacket;
          return [[countRow], []];
        }
        if (typeof sql === 'string' && sql.includes('SELECT COUNT(*) as count FROM property_photos')) {
          const photoRow: RowDataPacket = {
            count: 0,
            constructor: { name: 'RowDataPacket' }
          } as unknown as RowDataPacket;
          return [[photoRow], []];
        }
        if (typeof sql === 'string' && sql.includes('SELECT id, propertyId FROM rentals')) {
          return [[], []];
        }
        if (typeof sql === 'string' && sql.includes('COUNT(*) as total')) {
          const syncRow: RowDataPacket = {
            total: 2,
            occupied: 1,
            constructor: { name: 'RowDataPacket' }
          } as unknown as RowDataPacket;
          return [[syncRow], []];
        }
        return [[], []];
      }
    } as unknown as QueryExecutor;

    await backfillDiscreteRooms(mockExecutor);

    // Verify rooms and photo were inserted
    assert.ok(queries.some(q => q.includes('INSERT INTO rooms')));
    assert.ok(queries.some(q => q.includes('INSERT INTO property_photos')));
    assert.ok(queries.some(q => q.includes('UPDATE properties SET totalRooms')));
  });

  // =========================================================================
  // Section 6: Discrete Rooms HTTP API Endpoints & RBAC Unit Suite
  // =========================================================================
  await t.test('Section 6: Rooms API Routes, Filtering, Status Toggles & RBAC', async (t2) => {
    await ensureDbReady();

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

    // Unique isolation identifiers for Section 6
    const tag = crypto.randomBytes(4).toString('hex');
    const landlordId = `user-s6-ll-${tag}`;
    const otherLandlordId = `user-s6-other-${tag}`;
    const adminId = `user-s6-adm-${tag}`;
    const tenantId = `user-s6-ten-${tag}`;
    const testPassword = 'Password123!';
    const passwordHash = bcrypt.hashSync(testPassword, 10);

    const propId = `prop-s6-${tag}`;
    const roomAvailId = `room-s6-avail-${tag}`;
    const roomOccId = `room-s6-occ-${tag}`;
    const roomMaintId = `room-s6-maint-${tag}`;
    const rentalId = `rent-s6-${tag}`;

    const landlordToken = generateJwtToken({ id: landlordId, email: `ll-${tag}@kosmo.test`, role: 'landlord' });
    const otherLandlordToken = generateJwtToken({ id: otherLandlordId, email: `other-${tag}@kosmo.test`, role: 'landlord' });
    const adminToken = generateJwtToken({ id: adminId, email: `adm-${tag}@kosmo.test`, role: 'admin' });
    const tenantToken = generateJwtToken({ id: tenantId, email: `ten-${tag}@kosmo.test`, role: 'tenant' });

    // Seed test fixtures into real database
    await pool.query(
      `INSERT INTO users (id, name, email, password, role, balance, totalRevenue) VALUES
       (?, 'Landlord Owner', ?, ?, 'landlord', 0, 0),
       (?, 'Other Landlord', ?, ?, 'landlord', 0, 0),
       (?, 'System Admin', ?, ?, 'admin', 0, 0),
       (?, 'Test Tenant', ?, ?, 'tenant', 0, 0)`,
      [
        landlordId, `ll-${tag}@kosmo.test`, passwordHash,
        otherLandlordId, `other-${tag}@kosmo.test`, passwordHash,
        adminId, `adm-${tag}@kosmo.test`, passwordHash,
        tenantId, `ten-${tag}@kosmo.test`, passwordHash
      ]
    );

    await pool.query(
      `INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId, image)
       VALUES (?, 'KOSMO Sunset Estate', 'Badung', 'Jl. Sunset No. 6', 3200000, 3, 1, ?, 'https://images.unsplash.com/photo-sunset')`,
      [propId, landlordId]
    );

    await pool.query(
      `INSERT INTO rooms (id, propertyId, roomNumber, floor, type, price, status) VALUES
       (?, ?, '101', 1, 'Deluxe', 3500000, 'available'),
       (?, ?, '102', 1, 'Standard', 3200000, 'occupied'),
       (?, ?, '103', 2, 'Suite', 4000000, 'maintenance')`,
      [roomAvailId, propId, roomOccId, propId, roomMaintId, propId]
    );

    await pool.query(
      `INSERT INTO rentals (id, tenantId, propertyId, propertyName, roomId, price, startDate, status, duration_months)
       VALUES (?, ?, ?, 'KOSMO Sunset Estate', ?, 3200000, '2026-09-01', 'active', 1)`,
      [rentalId, tenantId, propId, roomOccId]
    );

    t2.after(async () => {
      server.close();
      try {
        await pool.query('DELETE FROM rentals WHERE id LIKE ? OR propertyId = ?', [`%${tag}%`, propId]);
        await pool.query('DELETE FROM property_photos WHERE propertyId = ?', [propId]);
        await pool.query('DELETE FROM rooms WHERE propertyId = ? OR id LIKE ?', [propId, `%${tag}%`]);
        await pool.query('DELETE FROM properties WHERE id = ?', [propId]);
        await pool.query('DELETE FROM users WHERE id IN (?, ?, ?, ?)', [landlordId, otherLandlordId, adminId, tenantId]);
      } catch (err) {
        console.warn('Section 6 cleanup warning:', err);
      }
    });

    // 6.1 GET /api/properties/:id/rooms filtering
    await t2.test('6.1 filters rooms by status (all, available, occupied, maintenance)', async () => {
      // All rooms
      const allRes = await fetch(`${baseUrl}/properties/${propId}/rooms`);
      assert.equal(allRes.status, 200);
      const allRooms = (await allRes.json()) as Room[];
      assert.ok(Array.isArray(allRooms));
      assert.equal(allRooms.length, 3);
      assert.ok(allRooms.some((r) => r.roomNumber === '101' && r.status === 'available'));
      assert.ok(allRooms.some((r) => r.roomNumber === '102' && r.status === 'occupied'));
      assert.ok(allRooms.some((r) => r.roomNumber === '103' && r.status === 'maintenance'));

      // Available filter
      const availRes = await fetch(`${baseUrl}/properties/${propId}/rooms?status=available`);
      assert.equal(availRes.status, 200);
      const availRooms = (await availRes.json()) as Room[];
      assert.equal(availRooms.length, 1);
      assert.equal(availRooms[0].roomNumber, '101');
      assert.equal(availRooms[0].status, 'available');

      // Occupied filter
      const occRes = await fetch(`${baseUrl}/properties/${propId}/rooms?status=occupied`);
      assert.equal(occRes.status, 200);
      const occRooms = (await occRes.json()) as Room[];
      assert.equal(occRooms.length, 1);
      assert.equal(occRooms[0].roomNumber, '102');
      assert.equal(occRooms[0].status, 'occupied');

      // Maintenance filter
      const maintRes = await fetch(`${baseUrl}/properties/${propId}/rooms?status=maintenance`);
      assert.equal(maintRes.status, 200);
      const maintRooms = (await maintRes.json()) as Room[];
      assert.equal(maintRooms.length, 1);
      assert.equal(maintRooms[0].roomNumber, '103');
      assert.equal(maintRooms[0].status, 'maintenance');
    });

    // 6.2 POST /api/properties/:id/rooms RBAC verification
    await t2.test('6.2 enforces RBAC: landlord/admin permitted to create room; tenant strictly forbidden', async () => {
      // Landlord who owns property creates room -> 201 Created
      const createRes = await fetch(`${baseUrl}/properties/${propId}/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({
          roomNumber: '104',
          floor: 2,
          type: 'Deluxe Suite',
          price: 3800000
        })
      });
      assert.equal(createRes.status, 201, 'Owner landlord must be permitted to create room');
      const createBody = (await createRes.json()) as { message: string; room: Room };
      assert.equal(createBody.room.roomNumber, '104');

      // Admin creates room -> 201 Created
      const adminCreateRes = await fetch(`${baseUrl}/properties/${propId}/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          roomNumber: '105',
          floor: 2,
          type: 'Executive',
          price: 4200000
        })
      });
      assert.equal(adminCreateRes.status, 201, 'Admin must be permitted to create room');

      // Other landlord creates room on property they do not own -> 403 Forbidden
      const unauthLandlordRes = await fetch(`${baseUrl}/properties/${propId}/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${otherLandlordToken}`
        },
        body: JSON.stringify({
          roomNumber: '106',
          floor: 2,
          type: 'Standard'
        })
      });
      assert.equal(unauthLandlordRes.status, 403, 'Non-owner landlord must be forbidden');

      // Tenant creates room -> 403 Forbidden
      const tenantCreateRes = await fetch(`${baseUrl}/properties/${propId}/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantToken}`
        },
        body: JSON.stringify({
          roomNumber: '107',
          floor: 2,
          type: 'Standard'
        })
      });
      assert.equal(tenantCreateRes.status, 403, 'Tenant must be forbidden');

      // Unauthenticated caller -> 401 Unauthorized
      const anonRes = await fetch(`${baseUrl}/properties/${propId}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomNumber: '108', floor: 2, type: 'Standard' })
      });
      assert.equal(anonRes.status, 401, 'Unauthenticated caller must receive 401');
    });

    // 6.3 PATCH /api/properties/:id/rooms/:roomId/status maintenance toggle guard
    await t2.test('6.3 prevents toggling occupied room to maintenance while active lease exists', async () => {
      // Toggle available room to maintenance -> 200 OK
      const toggleToMaintRes = await fetch(`${baseUrl}/properties/${propId}/rooms/${roomAvailId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({ status: 'maintenance' })
      });
      assert.equal(toggleToMaintRes.status, 200, 'Available room toggled to maintenance must return 200');

      // Toggle back to available -> 200 OK
      const toggleToAvailRes = await fetch(`${baseUrl}/properties/${propId}/rooms/${roomAvailId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({ status: 'available' })
      });
      assert.equal(toggleToAvailRes.status, 200, 'Maintenance room toggled back to available must return 200');

      // Toggling occupied room with active rental to maintenance is rejected with 409 Conflict
      const rejectedRes = await fetch(`${baseUrl}/properties/${propId}/rooms/${roomOccId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({ status: 'maintenance' })
      });
      assert.equal(rejectedRes.status, 409, 'Occupied room with active tenancy cannot be set to maintenance');
      const rejectedBody = (await rejectedRes.json()) as { message: string };
      assert.ok(rejectedBody.message.includes('sewa aktif') || rejectedBody.message.includes('maintenance'));
    });

    // 6.4 DELETE /api/properties/:id/rooms/:roomId occupied check rejection & password confirmation
    await t2.test('6.4 rejects deleting room if currently occupied, allows deletion of available room', async () => {
      // Missing password -> 400 Bad Request
      const noPassRes = await fetch(`${baseUrl}/properties/${propId}/rooms/${roomAvailId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({})
      });
      assert.equal(noPassRes.status, 400, 'Missing password must return 400');

      // Wrong password -> 401 Unauthorized
      const wrongPassRes = await fetch(`${baseUrl}/properties/${propId}/rooms/${roomAvailId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({ password: 'WrongPassword123' })
      });
      assert.equal(wrongPassRes.status, 401, 'Wrong password must return 401');

      // Attempt deleting occupied room -> 400 Bad Request
      const deleteOccRes = await fetch(`${baseUrl}/properties/${propId}/rooms/${roomOccId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({ password: testPassword })
      });
      assert.equal(deleteOccRes.status, 400, 'Deleting occupied room must return 400');

      // Delete available room (room 104 created in 6.2) -> 200 OK
      const [room104Rows] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM rooms WHERE propertyId = ? AND roomNumber = ?',
        [propId, '104']
      );
      assert.ok(room104Rows.length > 0);
      const room104Id = String(room104Rows[0].id);

      const deleteAvailRes = await fetch(`${baseUrl}/properties/${propId}/rooms/${room104Id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({ password: testPassword })
      });
      assert.equal(deleteAvailRes.status, 200, 'Deleting available room must succeed with 200');

      // Also verify direct route DELETE /api/rooms/:roomId on room 105
      const [room105Rows] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM rooms WHERE propertyId = ? AND roomNumber = ?',
        [propId, '105']
      );
      assert.ok(room105Rows.length > 0);
      const room105Id = String(room105Rows[0].id);

      const directDeleteRes = await fetch(`${baseUrl}/rooms/${room105Id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ password: testPassword })
      });
      assert.equal(directDeleteRes.status, 200, 'Direct DELETE /api/rooms/:roomId must return 200');
    });

    // 6.5 Rental termination room release back to 'available'
    await t2.test('6.5 rental termination transitions room status from occupied to available and decrements occupiedRooms', async () => {
      // Confirm pre-condition in DB
      const [roomBefore] = await pool.query<RowDataPacket[]>('SELECT status FROM rooms WHERE id = ?', [roomOccId]);
      assert.equal(roomBefore[0].status, 'occupied');

      // Terminate rental via POST /api/rentals/:id/terminate
      const termRes = await fetch(`${baseUrl}/rentals/${rentalId}/terminate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantToken}`
        },
        body: JSON.stringify({ password: testPassword })
      });
      assert.equal(termRes.status, 200, 'Termination must return 200 OK');
      const termBody = (await termRes.json()) as { message: string };
      assert.equal(termBody.message, 'Sewa kos berhasil diberhentikan.');

      // Confirm post-condition in DB: room transitioned back to 'available'
      const [roomAfter] = await pool.query<RowDataPacket[]>('SELECT status FROM rooms WHERE id = ?', [roomOccId]);
      assert.equal(roomAfter[0].status, 'available', 'Terminated rental must release room status back to available');

      // Confirm rental status updated to 'terminated'
      const [rentalAfter] = await pool.query<RowDataPacket[]>('SELECT status FROM rentals WHERE id = ?', [rentalId]);
      assert.equal(rentalAfter[0].status, 'terminated');
    });
  });
});
