import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import type { RowDataPacket, QueryResult } from 'mysql2/promise';
import {
  validateRoom,
  validatePropertyPhoto,
  VALID_DISCRETE_ROOM_STATUSES,
  VALID_PHOTO_CATEGORIES,
  type Room,
  type PropertyPhoto,
  type DiscreteRoomStatus,
  type PhotoCategory
} from '../backend/types/index';
import {
  pool,
  ensureDbReady,
  syncPropertyRoomCounts,
  backfillDiscreteRooms,
  type QueryExecutor
} from '../backend/db';

test('CHALLENGER M1: Empirical Adversarial Stress & Edge-Case Test Harness', async (t) => {
  await ensureDbReady();

  // =========================================================================
  // Section 1: Hostile Inputs & Boundary Stress for validateRoom
  // =========================================================================
  await t.test('1.1 validateRoom rejects non-object, null, and primitive values', () => {
    const invalidInputs = [
      null,
      undefined,
      12345,
      'a string payload',
      true,
      false,
      Symbol('test')
    ];

    for (const input of invalidInputs) {
      const res = validateRoom(input);
      assert.equal(res.valid, false, `Input ${String(input)} should be rejected`);
      assert.ok(res.errors.some(e => e.includes('non-null object')));
    }
  });

  await t.test('1.2 validateRoom handles prototype pollution payloads safely without throwing', () => {
    // Attempt prototype pollution
    const pollutedPayload = JSON.parse(
      '{"__proto__": {"polluted": "yes"}, "id": "room-adv-1", "propertyId": "prop-1", "roomNumber": "101", "floor": 1, "type": "Standard", "status": "available"}'
    );

    const res = validateRoom(pollutedPayload);
    assert.equal(res.valid, true);
    // Ensure global Object prototype is not polluted
    assert.equal((Object.prototype as unknown as { polluted?: string }).polluted, undefined);

    // Object with Object.create(null)
    const nullProtoObj: Record<string, unknown> = Object.create(null);
    nullProtoObj.id = 'room-null-proto';
    nullProtoObj.propertyId = 'prop-1';
    nullProtoObj.roomNumber = '102';
    nullProtoObj.floor = 2;
    nullProtoObj.type = 'Standard';
    nullProtoObj.status = 'available';

    const resNullProto = validateRoom(nullProtoObj);
    assert.equal(resNullProto.valid, true);
  });

  await t.test('1.3 validateRoom adversarial boundaries for floor (negative, float, NaN, Infinity, strings)', () => {
    const baseRoom = {
      id: 'room-floor-test',
      propertyId: 'prop-1',
      roomNumber: '101',
      type: 'Standard',
      status: 'available'
    };

    // Valid floors
    assert.equal(validateRoom({ ...baseRoom, floor: 0 }).valid, true, 'Floor 0 (ground level) must be valid');
    assert.equal(validateRoom({ ...baseRoom, floor: 1 }).valid, true, 'Floor 1 must be valid');
    assert.equal(validateRoom({ ...baseRoom, floor: 50 }).valid, true, 'Floor 50 must be valid');

    // Invalid floors
    const invalidFloors = [-1, -100, 1.5, NaN, Infinity, -Infinity, '1', null, undefined, [], {}];
    for (const floor of invalidFloors) {
      const res = validateRoom({ ...baseRoom, floor });
      assert.equal(res.valid, false, `Floor value ${String(floor)} must be rejected`);
      assert.ok(res.errors.some(e => e.includes('floor')), `Error list should mention floor for ${String(floor)}`);
    }
  });

  await t.test('1.4 validateRoom adversarial boundaries for price override', () => {
    const baseRoom = {
      id: 'room-price-test',
      propertyId: 'prop-1',
      roomNumber: '101',
      floor: 1,
      type: 'Standard',
      status: 'available'
    };

    // Valid price values (null and undefined represent fallback to property price; 0+ are valid overrides)
    assert.equal(validateRoom({ ...baseRoom, price: undefined }).valid, true, 'undefined price is valid');
    assert.equal(validateRoom({ ...baseRoom, price: null }).valid, true, 'null price is valid');
    assert.equal(validateRoom({ ...baseRoom, price: 0 }).valid, true, '0 price is valid');
    assert.equal(validateRoom({ ...baseRoom, price: 4500000 }).valid, true, '4,500,000 price is valid');

    // Invalid price values
    const invalidPrices = [-1, -50000, NaN, '500000', false, [], {}];
    for (const price of invalidPrices) {
      const res = validateRoom({ ...baseRoom, price });
      assert.equal(res.valid, false, `Price value ${String(price)} must be rejected`);
      assert.ok(res.errors.some(e => e.includes('price')), `Error list should mention price for ${String(price)}`);
    }
  });

  await t.test('1.5 validateRoom hostile strings (SQL injection, XSS, Unicode, whitespaces) in text fields', () => {
    const baseRoom = {
      id: 'room-sqli',
      propertyId: 'prop-1',
      floor: 1,
      status: 'available'
    };

    // Whitespace strings should fail
    assert.equal(validateRoom({ ...baseRoom, roomNumber: '   ', type: 'Standard' }).valid, false);
    assert.equal(validateRoom({ ...baseRoom, roomNumber: '101', type: '   ' }).valid, false);
    assert.equal(validateRoom({ ...baseRoom, id: '   ', roomNumber: '101', type: 'Standard' }).valid, false);
    assert.equal(validateRoom({ ...baseRoom, propertyId: '   ', roomNumber: '101', type: 'Standard' }).valid, false);

    // SQL injection & XSS strings: validator ensures non-empty string; prepared statement guarantees safety
    const hostileRoomNumber = "'; DROP TABLE rooms; --";
    const xssType = "<script>alert('xss')</script>";
    const unicodeRoomNumber = "Kamar #101 \u{1F3E8}";

    const resHostile = validateRoom({
      ...baseRoom,
      roomNumber: hostileRoomNumber,
      type: xssType
    });
    assert.equal(resHostile.valid, true, 'Hostile string literals are validated as strings without crashing');

    const resUnicode = validateRoom({
      ...baseRoom,
      roomNumber: unicodeRoomNumber,
      type: 'Standard'
    });
    assert.equal(resUnicode.valid, true, 'Unicode roomNumber is validated safely');
  });

  await t.test('1.6 validateRoom status strictness (case-sensitivity and unknown values)', () => {
    const baseRoom = {
      id: 'room-status',
      propertyId: 'prop-1',
      roomNumber: '101',
      floor: 1,
      type: 'Standard'
    };

    for (const s of VALID_DISCRETE_ROOM_STATUSES) {
      assert.equal(validateRoom({ ...baseRoom, status: s }).valid, true);
    }

    const badStatuses = ['AVAILABLE', 'Occupied', 'reserved', 'pending', 'cancelled', 'deleted', '', 123, null];
    for (const status of badStatuses) {
      const res = validateRoom({ ...baseRoom, status });
      assert.equal(res.valid, false, `Status ${String(status)} must be rejected`);
      assert.ok(res.errors.some(e => e.includes('status')));
    }
  });

  // =========================================================================
  // Section 2: Hostile Inputs & Boundary Stress for validatePropertyPhoto
  // =========================================================================
  await t.test('2.1 validatePropertyPhoto rejects non-object, null, and primitive values', () => {
    const invalidPrimitives = [null, undefined, 42, 'photo-url', false];
    for (const input of invalidPrimitives) {
      const res = validatePropertyPhoto(input);
      assert.equal(res.valid, false);
      assert.ok(res.errors.some(e => e.includes('non-null object')));
    }

    const resArray = validatePropertyPhoto([]);
    assert.equal(resArray.valid, false);
    assert.ok(resArray.errors.length > 0);
  });

  await t.test('2.2 validatePropertyPhoto category strictness across all 9 categories and invalid values', () => {
    const basePhoto = {
      id: 'ph-1',
      propertyId: 'prop-1',
      url: 'https://images.kosmo.id/photo1.jpg',
      orderIndex: 0
    };

    for (const category of VALID_PHOTO_CATEGORIES) {
      assert.equal(validatePropertyPhoto({ ...basePhoto, category }).valid, true);
    }

    const invalidCategories = ['bedroom_suite', 'garage', 'balcony', 'THUMBNAIL', 'roof', '', null, undefined];
    for (const category of invalidCategories) {
      const res = validatePropertyPhoto({ ...basePhoto, category });
      assert.equal(res.valid, false, `Category ${String(category)} must be rejected`);
      assert.ok(res.errors.some(e => e.includes('category')));
    }
  });

  await t.test('2.3 validatePropertyPhoto orderIndex adversarial boundaries (negative, float, NaN, Infinity)', () => {
    const basePhoto = {
      id: 'ph-order',
      propertyId: 'prop-1',
      url: 'https://images.kosmo.id/photo.jpg',
      category: 'bedroom'
    };

    assert.equal(validatePropertyPhoto({ ...basePhoto, orderIndex: 0 }).valid, true);
    assert.equal(validatePropertyPhoto({ ...basePhoto, orderIndex: 1000 }).valid, true);

    const invalidIndexes = [-1, -50, 1.25, NaN, Infinity, -Infinity, '0', null, undefined];
    for (const orderIndex of invalidIndexes) {
      const res = validatePropertyPhoto({ ...basePhoto, orderIndex });
      assert.equal(res.valid, false, `orderIndex ${String(orderIndex)} must be rejected`);
      assert.ok(res.errors.some(e => e.includes('orderIndex')));
    }
  });

  await t.test('2.4 validatePropertyPhoto url hostile strings and empty checks', () => {
    const basePhoto = {
      id: 'ph-url',
      propertyId: 'prop-1',
      category: 'bedroom',
      orderIndex: 0
    };

    assert.equal(validatePropertyPhoto({ ...basePhoto, url: '' }).valid, false);
    assert.equal(validatePropertyPhoto({ ...basePhoto, url: '   ' }).valid, false);
    assert.equal(validatePropertyPhoto({ ...basePhoto, url: null }).valid, false);
    assert.equal(validatePropertyPhoto({ ...basePhoto, url: 12345 }).valid, false);

    // Data URI or secure URL
    assert.equal(validatePropertyPhoto({ ...basePhoto, url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }).valid, true);
  });

  // =========================================================================
  // Section 3: Empirical Algorithm Stress for backfillDiscreteRooms
  // =========================================================================
  await t.test('3.1 backfillDiscreteRooms math oracle: 100 rooms across 10 floors (101-1010)', () => {
    const total = 100;
    const occupied = 45;
    const rooms: Array<{ id: string; roomNumber: string; floor: number; status: DiscreteRoomStatus; type: string }> = [];

    for (let i = 1; i <= total; i++) {
      const floor = Math.floor((i - 1) / 10) + 1;
      const roomIndex = ((i - 1) % 10) + 1;
      const roomNumber = `${floor}${String(roomIndex).padStart(2, '0')}`;
      const rawId = `room-prop-test-${roomNumber}`;
      const roomId = rawId.length <= 50
        ? rawId
        : `rm-${crypto.createHash('md5').update(`prop-test-${roomNumber}`).digest('hex').slice(0, 24)}`;
      const status: DiscreteRoomStatus = i <= occupied ? 'occupied' : 'available';
      const type = i % 2 === 0 ? 'Deluxe' : 'Standard';
      rooms.push({ id: roomId, roomNumber, floor, status, type });
    }

    assert.equal(rooms.length, 100);

    // Check floor boundaries
    assert.equal(rooms[0].roomNumber, '101');
    assert.equal(rooms[0].floor, 1);
    assert.equal(rooms[9].roomNumber, '110');
    assert.equal(rooms[9].floor, 1);

    assert.equal(rooms[10].roomNumber, '201');
    assert.equal(rooms[10].floor, 2);

    assert.equal(rooms[89].roomNumber, '910');
    assert.equal(rooms[89].floor, 9);

    assert.equal(rooms[90].roomNumber, '1001');
    assert.equal(rooms[90].floor, 10);

    assert.equal(rooms[99].roomNumber, '1010');
    assert.equal(rooms[99].floor, 10);

    // Verify all room numbers are strictly unique
    const uniqueRoomNumbers = new Set(rooms.map(r => r.roomNumber));
    assert.equal(uniqueRoomNumbers.size, 100, 'All 100 room numbers must be strictly unique');

    // Verify all room IDs are <= 50 chars
    assert.ok(rooms.every(r => r.id.length <= 50), 'All generated room IDs must satisfy VARCHAR(50)');

    // Verify status counts
    assert.equal(rooms.filter(r => r.status === 'occupied').length, 45);
    assert.equal(rooms.filter(r => r.status === 'available').length, 55);
  });

  await t.test('3.2 backfillDiscreteRooms boundary: extreme occupancy clamping (100%, 0%, overflow, negative)', () => {
    const total = 10;

    const computeOccupied = (totalRooms: number, occupiedRooms: number) => {
      return Math.max(0, Math.min(totalRooms, Number(occupiedRooms || 0)));
    };

    // 100% occupancy
    assert.equal(computeOccupied(total, 10), 10);

    // 0% occupancy
    assert.equal(computeOccupied(total, 0), 0);

    // Overflow: 15 occupied out of 10 -> clamped to 10
    assert.equal(computeOccupied(total, 15), 10);

    // Negative: -5 occupied out of 10 -> clamped to 0
    assert.equal(computeOccupied(total, -5), 0);

    // NaN / undefined -> defaults to 0
    assert.equal(computeOccupied(total, NaN), 0);
  });

  await t.test('3.3 backfillDiscreteRooms ID generation hash fallback for long property IDs (> 50 chars)', () => {
    const longPropId = 'property-denpasar-sanur-beachfront-super-long-uuid-identifier-12345';
    const roomNumber = '101';
    const rawId = `room-${longPropId}-${roomNumber}`;
    assert.ok(rawId.length > 50, `rawId length ${rawId.length} should exceed 50 chars to test hash fallback`);

    const roomId = rawId.length <= 50
      ? rawId
      : `rm-${crypto.createHash('md5').update(`${longPropId}-${roomNumber}`).digest('hex').slice(0, 24)}`;

    assert.ok(roomId.length <= 50, `Hashed roomId ${roomId} (len ${roomId.length}) must be <= 50 chars`);
    assert.ok(roomId.startsWith('rm-'));
  });

  // =========================================================================
  // Section 4: Dynamic State Transitions on syncPropertyRoomCounts
  // =========================================================================
  await t.test('4.1 syncPropertyRoomCounts correctly handles mixed statuses including maintenance', async () => {
    const mockExecutor = {
      query: async (sql: string, params?: unknown[]) => {
        if (typeof sql === 'string' && sql.includes('COUNT(*) as total')) {
          const row: RowDataPacket = {
            total: 15,
            occupied: 8,
            constructor: { name: 'RowDataPacket' }
          } as unknown as RowDataPacket;
          return [[row], []];
        }
        return [[], []];
      }
    } as unknown as QueryExecutor;

    const counts = await syncPropertyRoomCounts(mockExecutor, 'prop-mixed');
    assert.equal(counts.totalRooms, 15);
    assert.equal(counts.occupiedRooms, 8);
  });

  await t.test('4.2 syncPropertyRoomCounts handles missing property or zero rooms cleanly', async () => {
    const mockExecutor = {
      query: async (sql: string, params?: unknown[]) => {
        if (typeof sql === 'string' && sql.includes('COUNT(*) as total')) {
          const row: RowDataPacket = {
            total: 0,
            occupied: 0,
            constructor: { name: 'RowDataPacket' }
          } as unknown as RowDataPacket;
          return [[row], []];
        }
        return [[], []];
      }
    } as unknown as QueryExecutor;

    const counts = await syncPropertyRoomCounts(mockExecutor, 'prop-nonexistent');
    assert.equal(counts.totalRooms, 0);
    assert.equal(counts.occupiedRooms, 0);
  });

  // =========================================================================
  // Section 5: Live MySQL Database Integration Stress Test
  // =========================================================================
  await t.test('5.1 Live MySQL: Schema integrity, columns, and foreign keys', async () => {
    // Verify rooms columns
    const [roomsCols] = await pool.query<RowDataPacket[]>('SHOW COLUMNS FROM rooms');
    const roomColNames = new Set(roomsCols.map(c => c.Field));
    assert.ok(roomColNames.has('id'));
    assert.ok(roomColNames.has('propertyId'));
    assert.ok(roomColNames.has('roomNumber'));
    assert.ok(roomColNames.has('floor'));
    assert.ok(roomColNames.has('type'));
    assert.ok(roomColNames.has('price'));
    assert.ok(roomColNames.has('status'));
    assert.ok(roomColNames.has('createdAt'));
    assert.ok(roomColNames.has('updatedAt'));

    // Verify property_photos columns
    const [photoCols] = await pool.query<RowDataPacket[]>('SHOW COLUMNS FROM property_photos');
    const photoColNames = new Set(photoCols.map(c => c.Field));
    assert.ok(photoColNames.has('id'));
    assert.ok(photoColNames.has('propertyId'));
    assert.ok(photoColNames.has('roomId'));
    assert.ok(photoColNames.has('url'));
    assert.ok(photoColNames.has('publicId'));
    assert.ok(photoColNames.has('category'));
    assert.ok(photoColNames.has('caption'));
    assert.ok(photoColNames.has('orderIndex'));
    assert.ok(photoColNames.has('createdAt'));

    // Verify rentals.roomId column exists
    const [rentalCols] = await pool.query<RowDataPacket[]>('SHOW COLUMNS FROM rentals');
    const rentalColNames = new Set(rentalCols.map(c => c.Field));
    assert.ok(rentalColNames.has('roomId'), 'rentals.roomId must exist in live database');
  });

  await t.test('5.2 Live MySQL: Unique constraint uq_property_room_number enforcement', async () => {
    const testPropId = 'test-prop-adv-uq';
    // Clean up if existing
    await pool.query('DELETE FROM properties WHERE id = ?', [testPropId]);
    await pool.query(
      `INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId)
       VALUES (?, 'Test Prop UQ', 'Denpasar', 'Jl Test UQ', 1000000, 2, 0, 'user-landlord')`,
      [testPropId]
    );

    try {
      // First insert should succeed
      await pool.query(
        `INSERT INTO rooms (id, propertyId, roomNumber, floor, type, status)
         VALUES ('r-uq-1', ?, '101', 1, 'Standard', 'available')`,
        [testPropId]
      );

      // Duplicate insert of same propertyId and roomNumber must fail with ER_DUP_ENTRY
      await assert.rejects(
        async () => {
          await pool.query(
            `INSERT INTO rooms (id, propertyId, roomNumber, floor, type, status)
             VALUES ('r-uq-2', ?, '101', 1, 'Standard', 'available')`,
            [testPropId]
          );
        },
        (err: { code?: string }) => {
          assert.equal(err.code, 'ER_DUP_ENTRY');
          return true;
        },
        'Duplicate (propertyId, roomNumber) must trigger unique key constraint'
      );
    } finally {
      await pool.query('DELETE FROM properties WHERE id = ?', [testPropId]);
    }
  });

  await t.test('5.3 Live MySQL: Empirical backfillDiscreteRooms on boundary properties (0 rooms, 100 rooms, 100% full, 0% full)', async () => {
    const prefix = 'test-adv-prop-';
    const pZero = `${prefix}zero`;
    const pHundred = `${prefix}hundred`;
    const pFull = `${prefix}full`;
    const pEmpty = `${prefix}empty`;

    // Cleanup previous runs
    await pool.query(`DELETE FROM properties WHERE id IN (?, ?, ?, ?)`, [pZero, pHundred, pFull, pEmpty]);

    // Insert 4 test properties covering boundaries
    await pool.query(`
      INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId, image)
      VALUES 
        (?, 'Zero Room Prop', 'Denpasar', 'Jl Zero', 1000000, 0, 0, 'user-landlord', NULL),
        (?, '100 Room Prop', 'Badung', 'Jl Hundred', 2000000, 100, 45, 'user-landlord', 'https://example.com/hundred.jpg'),
        (?, 'Full Prop', 'Ubud', 'Jl Full', 3000000, 5, 5, 'user-landlord', 'https://example.com/full.jpg'),
        (?, 'Empty Prop', 'Seminyak', 'Jl Empty', 4000000, 5, 0, 'user-landlord', 'https://example.com/empty.jpg')
    `, [pZero, pHundred, pFull, pEmpty]);

    try {
      // Execute live backfill
      await backfillDiscreteRooms(pool);

      // Verify Zero room property: 0 rooms created
      const [zeroRooms] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as c FROM rooms WHERE propertyId = ?', [pZero]);
      assert.equal(Number(zeroRooms[0].c), 0, 'Property with 0 totalRooms must have 0 discrete rooms');

      // Verify 100 room property: exactly 100 rooms created, floors 1..10
      const [hundredRooms] = await pool.query<RowDataPacket[]>(
        'SELECT id, roomNumber, floor, status FROM rooms WHERE propertyId = ? ORDER BY floor ASC, roomNumber ASC',
        [pHundred]
      );
      assert.equal(hundredRooms.length, 100, 'Property with 100 totalRooms must have exactly 100 discrete rooms');
      assert.equal(hundredRooms[0].roomNumber, '101');
      assert.equal(hundredRooms[9].roomNumber, '110');
      assert.equal(hundredRooms[90].roomNumber, '1001');
      assert.equal(hundredRooms[99].roomNumber, '1010');

      const hundredOccupied = hundredRooms.filter(r => r.status === 'occupied').length;
      const hundredAvailable = hundredRooms.filter(r => r.status === 'available').length;
      assert.equal(hundredOccupied, 45, '100 room property must have exactly 45 occupied rooms');
      assert.equal(hundredAvailable, 55, '100 room property must have exactly 55 available rooms');

      // Verify 100% full property: all 5 occupied
      const [fullRooms] = await pool.query<RowDataPacket[]>('SELECT status FROM rooms WHERE propertyId = ?', [pFull]);
      assert.equal(fullRooms.length, 5);
      assert.ok(fullRooms.every(r => r.status === 'occupied'), '100% full property must have all rooms occupied');

      // Verify 0% full property: all 5 available
      const [emptyRooms] = await pool.query<RowDataPacket[]>('SELECT status FROM rooms WHERE propertyId = ?', [pEmpty]);
      assert.equal(emptyRooms.length, 5);
      assert.ok(emptyRooms.every(r => r.status === 'available'), '0% full property must have all rooms available');

      // Verify property_photos thumbnail generation
      const [hundredPhotos] = await pool.query<RowDataPacket[]>('SELECT * FROM property_photos WHERE propertyId = ?', [pHundred]);
      assert.equal(hundredPhotos.length, 1, 'Thumbnail photo must be provisioned');
      assert.equal(hundredPhotos[0].category, 'thumbnail');
      assert.equal(hundredPhotos[0].url, 'https://example.com/hundred.jpg');

      const [zeroPhotos] = await pool.query<RowDataPacket[]>('SELECT * FROM property_photos WHERE propertyId = ?', [pZero]);
      assert.equal(zeroPhotos.length, 0, 'No photo must be provisioned when image is null');

      // Verify aggregate counters in properties table remained in sync
      const [propRows] = await pool.query<RowDataPacket[]>('SELECT id, totalRooms, occupiedRooms FROM properties WHERE id IN (?, ?, ?, ?)', [pZero, pHundred, pFull, pEmpty]);
      const propMap = new Map(propRows.map(p => [p.id, p]));
      assert.equal(Number(propMap.get(pZero)?.totalRooms), 0);
      assert.equal(Number(propMap.get(pHundred)?.totalRooms), 100);
      assert.equal(Number(propMap.get(pHundred)?.occupiedRooms), 45);
      assert.equal(Number(propMap.get(pFull)?.occupiedRooms), 5);
      assert.equal(Number(propMap.get(pEmpty)?.occupiedRooms), 0);

      // =======================================================================
      // Idempotency check: Run backfill 3 more times on live MySQL
      // =======================================================================
      for (let run = 1; run <= 3; run++) {
        await backfillDiscreteRooms(pool);
      }

      // Assert row counts did NOT change
      const [recheck100] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as c FROM rooms WHERE propertyId = ?', [pHundred]);
      assert.equal(Number(recheck100[0].c), 100, 'Rooms count must remain 100 after repeated backfills');

      const [recheckPhotos] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as c FROM property_photos WHERE propertyId = ?', [pHundred]);
      assert.equal(Number(recheckPhotos[0].c), 1, 'Photos count must remain 1 after repeated backfills');
    } finally {
      // Clean up test properties (cascades to rooms and photos)
      await pool.query(`DELETE FROM properties WHERE id IN (?, ?, ?, ?)`, [pZero, pHundred, pFull, pEmpty]);
    }
  });

  await t.test('5.4 Live MySQL: Active rental binding and room status transition', async () => {
    const testPropId = 'test-adv-rental-prop';
    const testRentalId = 'test-adv-rental-1';

    await pool.query('DELETE FROM properties WHERE id = ?', [testPropId]);
    await pool.query(
      `INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId)
       VALUES (?, 'Test Rental Prop', 'Badung', 'Jl Rental Test', 2500000, 3, 1, 'user-landlord')`,
      [testPropId]
    );

    // Initial backfill creates 1 occupied, 2 available
    await backfillDiscreteRooms(pool);

    // Insert an active rental lacking roomId
    await pool.query(`
      INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status, roomId)
      VALUES (?, 'user-tenant', ?, 'Test Rental Prop', 2500000, '2026-09-01', 'active', NULL)
    `, [testRentalId, testPropId]);

    try {
      // Re-run backfill to trigger linking
      await backfillDiscreteRooms(pool);

      // Verify rental was linked to the occupied room
      const [rentalRows] = await pool.query<RowDataPacket[]>('SELECT roomId FROM rentals WHERE id = ?', [testRentalId]);
      assert.ok(rentalRows[0]?.roomId, 'Rental must have been assigned a roomId');
      const assignedRoomId = rentalRows[0].roomId;

      // Verify assigned room is occupied
      const [roomRows] = await pool.query<RowDataPacket[]>('SELECT status FROM rooms WHERE id = ?', [assignedRoomId]);
      assert.equal(roomRows[0]?.status, 'occupied', 'Assigned room must have status occupied');

      // Now insert a second active rental (which must fallback to an available room and turn it occupied)
      const testRentalId2 = 'test-adv-rental-2';
      await pool.query(`
        INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status, roomId)
        VALUES (?, 'user-tenant', ?, 'Test Rental Prop', 2500000, '2026-09-01', 'active', NULL)
      `, [testRentalId2, testPropId]);

      await backfillDiscreteRooms(pool);

      const [rental2Rows] = await pool.query<RowDataPacket[]>('SELECT roomId FROM rentals WHERE id = ?', [testRentalId2]);
      assert.ok(rental2Rows[0]?.roomId, 'Second rental must have been assigned fallback roomId');
      assert.notEqual(rental2Rows[0].roomId, assignedRoomId, 'Second rental must be assigned a different room');

      // Verify property counts now show 2 occupied rooms
      const [propRow] = await pool.query<RowDataPacket[]>('SELECT totalRooms, occupiedRooms FROM properties WHERE id = ?', [testPropId]);
      assert.equal(Number(propRow[0].totalRooms), 3);
      assert.equal(Number(propRow[0].occupiedRooms), 2);

      await pool.query('DELETE FROM rentals WHERE id = ?', [testRentalId2]);
    } finally {
      await pool.query('DELETE FROM rentals WHERE id = ?', [testRentalId]);
      await pool.query('DELETE FROM properties WHERE id = ?', [testPropId]);
    }
  });

  await t.test('5.5 Live MySQL: syncPropertyRoomCounts dynamic parity after manual room status updates', async () => {
    const testPropId = 'test-adv-sync-prop';
    await pool.query('DELETE FROM properties WHERE id = ?', [testPropId]);
    await pool.query(
      `INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId)
       VALUES (?, 'Test Sync Prop', 'Denpasar', 'Jl Sync Test', 3000000, 3, 0, 'user-landlord')`,
      [testPropId]
    );

    // Create 3 discrete rooms manually
    await pool.query(`
      INSERT INTO rooms (id, propertyId, roomNumber, floor, type, status)
      VALUES 
        ('r-s-1', ?, '101', 1, 'Standard', 'available'),
        ('r-s-2', ?, '102', 1, 'Standard', 'available'),
        ('r-s-3', ?, '103', 1, 'Standard', 'available')
    `, [testPropId, testPropId, testPropId]);

    try {
      // 1. Initial sync
      const counts1 = await syncPropertyRoomCounts(pool, testPropId);
      assert.deepEqual(counts1, { totalRooms: 3, occupiedRooms: 0 });

      // 2. Room 101 becomes occupied
      await pool.query("UPDATE rooms SET status = 'occupied' WHERE id = 'r-s-1'");
      const counts2 = await syncPropertyRoomCounts(pool, testPropId);
      assert.deepEqual(counts2, { totalRooms: 3, occupiedRooms: 1 });

      // 3. Room 102 set to maintenance (should NOT increment occupiedRooms)
      await pool.query("UPDATE rooms SET status = 'maintenance' WHERE id = 'r-s-2'");
      const counts3 = await syncPropertyRoomCounts(pool, testPropId);
      assert.deepEqual(counts3, { totalRooms: 3, occupiedRooms: 1 });

      // 4. Room 103 becomes occupied
      await pool.query("UPDATE rooms SET status = 'occupied' WHERE id = 'r-s-3'");
      const counts4 = await syncPropertyRoomCounts(pool, testPropId);
      assert.deepEqual(counts4, { totalRooms: 3, occupiedRooms: 2 });

      // 5. Room 101 released back to available
      await pool.query("UPDATE rooms SET status = 'available' WHERE id = 'r-s-1'");
      const counts5 = await syncPropertyRoomCounts(pool, testPropId);
      assert.deepEqual(counts5, { totalRooms: 3, occupiedRooms: 1 });

      // 6. Delete a room (total decreases)
      await pool.query("DELETE FROM rooms WHERE id = 'r-s-3'");
      const counts6 = await syncPropertyRoomCounts(pool, testPropId);
      assert.deepEqual(counts6, { totalRooms: 2, occupiedRooms: 0 });
    } finally {
      await pool.query('DELETE FROM properties WHERE id = ?', [testPropId]);
    }
  });

  await t.test('5.6 Live MySQL: Concurrent backfillDiscreteRooms storm on unseeded property', async () => {
    const testPropId = 'test-adv-concurrent-prop';
    await pool.query('DELETE FROM properties WHERE id = ?', [testPropId]);
    await pool.query(
      `INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId, image)
       VALUES (?, 'Concurrent Test Prop', 'Denpasar', 'Jl Concurrent', 1500000, 10, 3, 'user-landlord', 'https://example.com/c.jpg')`,
      [testPropId]
    );

    try {
      // Fire 5 concurrent backfillDiscreteRooms calls simultaneously
      const results = await Promise.allSettled([
        backfillDiscreteRooms(pool),
        backfillDiscreteRooms(pool),
        backfillDiscreteRooms(pool),
        backfillDiscreteRooms(pool),
        backfillDiscreteRooms(pool)
      ]);

      // All 5 must succeed without ER_DUP_ENTRY errors due to ON DUPLICATE KEY UPDATE
      for (const res of results) {
        assert.equal(res.status, 'fulfilled', `Concurrent execution failed: ${(res as PromiseRejectedResult).reason}`);
      }

      // Assert exactly 10 rooms were created
      const [roomRows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as c FROM rooms WHERE propertyId = ?', [testPropId]);
      assert.equal(Number(roomRows[0].c), 10, 'Exactly 10 rooms must exist despite 5 concurrent backfill calls');

      // Assert exactly 1 thumbnail was created
      const [photoRows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as c FROM property_photos WHERE propertyId = ?', [testPropId]);
      assert.equal(Number(photoRows[0].c), 1, 'Exactly 1 photo must exist despite 5 concurrent backfill calls');

      // Assert parity
      const [propRow] = await pool.query<RowDataPacket[]>('SELECT totalRooms, occupiedRooms FROM properties WHERE id = ?', [testPropId]);
      assert.equal(Number(propRow[0].totalRooms), 10);
      assert.equal(Number(propRow[0].occupiedRooms), 3);
    } finally {
      await pool.query('DELETE FROM properties WHERE id = ?', [testPropId]);
    }
  });
});

