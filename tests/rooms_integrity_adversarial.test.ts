import test from 'node:test';
import assert from 'node:assert/strict';
import { pool, ensureDbReady, backfillDiscreteRooms, syncPropertyRoomCounts } from '../backend/db';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

interface RoomRow extends RowDataPacket {
  id: string;
  propertyId: string;
  roomNumber: string;
  floor: number;
  type: string;
  price: number | null;
  status: 'available' | 'occupied' | 'maintenance';
}

interface PhotoRow extends RowDataPacket {
  id: string;
  propertyId: string;
  roomId: string | null;
  url: string;
  category: string;
}

interface RentalRow extends RowDataPacket {
  id: string;
  tenantId: string;
  propertyId: string;
  roomId: string | null;
  status: string;
}

interface PropertyRow extends RowDataPacket {
  id: string;
  name: string;
  totalRooms: number;
  occupiedRooms: number;
}

interface CountRow extends RowDataPacket {
  count: number;
}

test('ADVERSARIAL CHALLENGE: Data Integrity, FK Cascades, Unique Constraints & Room Linkage', async (t) => {
  await ensureDbReady();

  // Shared test identifiers to guarantee deterministic teardown
  const TEST_PREFIX = `adv-${Date.now()}`;
  const propId1 = `prop-${TEST_PREFIX}-1`;
  const propId2 = `prop-${TEST_PREFIX}-2`;
  const propIdCascade = `prop-${TEST_PREFIX}-casc`;
  const propIdRoomCascade = `prop-${TEST_PREFIX}-rcasc`;
  const propIdLink = `prop-${TEST_PREFIX}-link`;

  // Cleanup helper
  const cleanupAll = async () => {
    try {
      await pool.query("DELETE FROM rentals WHERE id LIKE ?", [`%${TEST_PREFIX}%`]);
      await pool.query("DELETE FROM property_photos WHERE id LIKE ? OR propertyId LIKE ?", [`%${TEST_PREFIX}%`, `%${TEST_PREFIX}%`]);
      await pool.query("DELETE FROM rooms WHERE id LIKE ? OR propertyId LIKE ?", [`%${TEST_PREFIX}%`, `%${TEST_PREFIX}%`]);
      await pool.query("DELETE FROM properties WHERE id LIKE ?", [`%${TEST_PREFIX}%`]);
    } catch (e) {
      console.warn("Cleanup warning:", e);
    }
  };

  t.after(async () => {
    await cleanupAll();
  });

  // Pre-cleanup in case of prior aborted runs
  await cleanupAll();

  // Helper to insert a test property
  const insertProperty = async (id: string, name: string, totalRooms: number = 3, occupiedRooms: number = 0) => {
    await pool.query(
      `INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId, image)
       VALUES (?, ?, 'Denpasar', 'Jl. Adversarial No. 1', 3000000, ?, ?, 'user-landlord', 'https://example.com/thumb.jpg')`,
      [id, name, totalRooms, occupiedRooms]
    );
  };

  // =========================================================================
  // Test Group 1: Foreign Key Constraints & Cascade Integrity
  // =========================================================================

  await t.test('1.1 Foreign Key Constraint: Inserting room with non-existent propertyId fails with ER_NO_REFERENCED_ROW_2', async () => {
    const invalidPropId = `non-existent-prop-${Date.now()}`;
    const roomId = `room-${TEST_PREFIX}-invalid`;

    await assert.rejects(
      async () => {
        await pool.query(
          `INSERT INTO rooms (id, propertyId, roomNumber, floor, status)
           VALUES (?, ?, '101', 1, 'available')`,
          [roomId, invalidPropId]
        );
      },
      (err: any) => {
        assert.ok(
          err.code === 'ER_NO_REFERENCED_ROW_2' || err.errno === 1452,
          `Expected foreign key constraint violation (ER_NO_REFERENCED_ROW_2 / 1452), got ${err.code} / ${err.errno}`
        );
        return true;
      }
    );
  });

  await t.test('1.2 Foreign Key Constraint: Inserting photo with non-existent propertyId fails with ER_NO_REFERENCED_ROW_2', async () => {
    const invalidPropId = `non-existent-prop-${Date.now()}`;
    const photoId = `photo-${TEST_PREFIX}-invalid`;

    await assert.rejects(
      async () => {
        await pool.query(
          `INSERT INTO property_photos (id, propertyId, url, category)
           VALUES (?, ?, 'https://example.com/invalid.jpg', 'bedroom')`,
          [photoId, invalidPropId]
        );
      },
      (err: any) => {
        assert.ok(
          err.code === 'ER_NO_REFERENCED_ROW_2' || err.errno === 1452,
          `Expected foreign key constraint violation (ER_NO_REFERENCED_ROW_2 / 1452), got ${err.code}`
        );
        return true;
      }
    );
  });

  await t.test('1.3 Foreign Key Constraint: Inserting photo with valid propertyId but non-existent roomId fails with ER_NO_REFERENCED_ROW_2', async () => {
    await insertProperty(propId1, 'Property FK Check 1');
    const photoId = `photo-${TEST_PREFIX}-badroom`;
    const nonExistentRoomId = `non-existent-room-${Date.now()}`;

    await assert.rejects(
      async () => {
        await pool.query(
          `INSERT INTO property_photos (id, propertyId, roomId, url, category)
           VALUES (?, ?, ?, 'https://example.com/badroom.jpg', 'bedroom')`,
          [photoId, propId1, nonExistentRoomId]
        );
      },
      (err: any) => {
        assert.ok(
          err.code === 'ER_NO_REFERENCED_ROW_2' || err.errno === 1452,
          `Expected foreign key constraint violation (ER_NO_REFERENCED_ROW_2 / 1452), got ${err.code}`
        );
        return true;
      }
    );
  });

  await t.test('1.4 Foreign Key Cascading: Deleting property cascades to all associated rooms and property photos', async () => {
    await insertProperty(propIdCascade, 'Property For Cascade Deletion');

    // Insert 3 rooms
    const r1 = `room-${TEST_PREFIX}-c1`;
    const r2 = `room-${TEST_PREFIX}-c2`;
    const r3 = `room-${TEST_PREFIX}-c3`;
    await pool.query(
      `INSERT INTO rooms (id, propertyId, roomNumber, floor, status) VALUES
       (?, ?, '101', 1, 'available'),
       (?, ?, '102', 1, 'available'),
       (?, ?, '103', 1, 'occupied')`,
      [r1, propIdCascade, r2, propIdCascade, r3, propIdCascade]
    );

    // Insert 2 property-level photos and 2 room-level photos
    const p1 = `photo-${TEST_PREFIX}-p1`;
    const p2 = `photo-${TEST_PREFIX}-p2`;
    const p3 = `photo-${TEST_PREFIX}-r1`;
    const p4 = `photo-${TEST_PREFIX}-r2`;
    await pool.query(
      `INSERT INTO property_photos (id, propertyId, roomId, url, category) VALUES
       (?, ?, NULL, 'https://example.com/p1.jpg', 'thumbnail'),
       (?, ?, NULL, 'https://example.com/p2.jpg', 'exterior'),
       (?, ?, ?, 'https://example.com/r1.jpg', 'bedroom'),
       (?, ?, ?, 'https://example.com/r2.jpg', 'bathroom')`,
      [p1, propIdCascade, p2, propIdCascade, p3, propIdCascade, r1, p4, propIdCascade, r2]
    );

    // Verify entities exist prior to deletion
    const [roomsBefore] = await pool.query<CountRow[]>("SELECT COUNT(*) as count FROM rooms WHERE propertyId = ?", [propIdCascade]);
    const [photosBefore] = await pool.query<CountRow[]>("SELECT COUNT(*) as count FROM property_photos WHERE propertyId = ?", [propIdCascade]);
    assert.equal(roomsBefore[0].count, 3, "Must have 3 rooms before cascade delete");
    assert.equal(photosBefore[0].count, 4, "Must have 4 photos before cascade delete");

    // Execute Property Deletion
    const [delResult] = await pool.query<ResultSetHeader>("DELETE FROM properties WHERE id = ?", [propIdCascade]);
    assert.equal(delResult.affectedRows, 1, "Property must be deleted");

    // Assert cascading deletion of rooms and photos
    const [roomsAfter] = await pool.query<CountRow[]>("SELECT COUNT(*) as count FROM rooms WHERE propertyId = ?", [propIdCascade]);
    const [photosAfter] = await pool.query<CountRow[]>("SELECT COUNT(*) as count FROM property_photos WHERE propertyId = ?", [propIdCascade]);
    assert.equal(roomsAfter[0].count, 0, "All rooms associated with deleted property must be cascade deleted");
    assert.equal(photosAfter[0].count, 0, "All photos associated with deleted property must be cascade deleted");
  });

  await t.test('1.5 Foreign Key Cascading: Deleting room cascades to room photos without deleting property photos', async () => {
    await insertProperty(propIdRoomCascade, 'Property For Room Cascade');

    const rA = `room-${TEST_PREFIX}-ra`;
    const rB = `room-${TEST_PREFIX}-rb`;
    await pool.query(
      `INSERT INTO rooms (id, propertyId, roomNumber, floor, status) VALUES
       (?, ?, '101', 1, 'available'),
       (?, ?, '102', 1, 'available')`,
      [rA, propIdRoomCascade, rB, propIdRoomCascade]
    );

    const phProp = `photo-${TEST_PREFIX}-phprop`;
    const phRa = `photo-${TEST_PREFIX}-phra`;
    const phRb = `photo-${TEST_PREFIX}-phrb`;
    await pool.query(
      `INSERT INTO property_photos (id, propertyId, roomId, url, category) VALUES
       (?, ?, NULL, 'https://example.com/prop.jpg', 'thumbnail'),
       (?, ?, ?, 'https://example.com/ra.jpg', 'bedroom'),
       (?, ?, ?, 'https://example.com/rb.jpg', 'bedroom')`,
      [phProp, propIdRoomCascade, phRa, propIdRoomCascade, rA, phRb, propIdRoomCascade, rB]
    );

    // Delete room A
    await pool.query("DELETE FROM rooms WHERE id = ?", [rA]);

    // Room A's photo must be deleted via CASCADE
    const [phRaRows] = await pool.query<PhotoRow[]>("SELECT * FROM property_photos WHERE id = ?", [phRa]);
    assert.equal(phRaRows.length, 0, "Photo linked to deleted room must be cascade deleted");

    // Room B's photo and property photo must survive
    const [survivingPhotos] = await pool.query<PhotoRow[]>("SELECT id FROM property_photos WHERE propertyId = ? ORDER BY id ASC", [propIdRoomCascade]);
    assert.equal(survivingPhotos.length, 2, "Property photo and Room B photo must survive");
    const photoIds = survivingPhotos.map(p => p.id);
    assert.ok(photoIds.includes(phProp), "Property photo must survive");
    assert.ok(photoIds.includes(phRb), "Room B photo must survive");
  });

  // =========================================================================
  // Test Group 2: Unique Constraints on (propertyId, roomNumber)
  // =========================================================================

  await t.test('2.1 Unique Constraint: Duplicate roomNumber on the same property is strictly rejected with ER_DUP_ENTRY', async () => {
    const r1 = `room-${TEST_PREFIX}-u1`;
    const r2 = `room-${TEST_PREFIX}-u2`;

    // Insert first room '101' on propId1
    await pool.query(
      `INSERT INTO rooms (id, propertyId, roomNumber, floor, status) VALUES (?, ?, '101', 1, 'available')`,
      [r1, propId1]
    );

    // Attempt to insert duplicate '101' on propId1
    await assert.rejects(
      async () => {
        await pool.query(
          `INSERT INTO rooms (id, propertyId, roomNumber, floor, status) VALUES (?, ?, '101', 1, 'available')`,
          [r2, propId1]
        );
      },
      (err: any) => {
        assert.ok(
          err.code === 'ER_DUP_ENTRY' || err.errno === 1062,
          `Expected duplicate entry error (ER_DUP_ENTRY / 1062), got ${err.code}`
        );
        return true;
      }
    );
  });

  await t.test('2.2 Composite Unique Key: Identical roomNumber on two DIFFERENT properties succeeds cleanly', async () => {
    await insertProperty(propId2, 'Property FK Check 2');
    const rProp2 = `room-${TEST_PREFIX}-p2-101`;

    // Insert '101' on propId2 — should succeed even though propId1 already has '101'
    await pool.query(
      `INSERT INTO rooms (id, propertyId, roomNumber, floor, status) VALUES (?, ?, '101', 1, 'available')`,
      [rProp2, propId2]
    );

    const [rows1] = await pool.query<RoomRow[]>("SELECT id, propertyId, roomNumber FROM rooms WHERE propertyId = ? AND roomNumber = '101'", [propId1]);
    const [rows2] = await pool.query<RoomRow[]>("SELECT id, propertyId, roomNumber FROM rooms WHERE propertyId = ? AND roomNumber = '101'", [propId2]);

    assert.equal(rows1.length, 1, "propId1 has room 101");
    assert.equal(rows2.length, 1, "propId2 has room 101");
    assert.notEqual(rows1[0].id, rows2[0].id, "Room IDs must be distinct");
  });

  await t.test('2.3 Unique Constraint: UPDATE roomNumber to existing roomNumber on same property fails with ER_DUP_ENTRY', async () => {
    const r102 = `room-${TEST_PREFIX}-u102`;
    await pool.query(
      `INSERT INTO rooms (id, propertyId, roomNumber, floor, status) VALUES (?, ?, '102', 1, 'available')`,
      [r102, propId1]
    );

    // Try to update room 102 to 101 on propId1 (101 already exists)
    await assert.rejects(
      async () => {
        await pool.query("UPDATE rooms SET roomNumber = '101' WHERE id = ?", [r102]);
      },
      (err: any) => {
        assert.ok(
          err.code === 'ER_DUP_ENTRY' || err.errno === 1062,
          `Expected duplicate entry error (ER_DUP_ENTRY / 1062) on update, got ${err.code}`
        );
        return true;
      }
    );
  });

  // =========================================================================
  // Test Group 3: `rentals.roomId` Linkage & Backward Compatibility
  // =========================================================================

  await t.test('3.1 rentals.roomId linkage: Unlinked active rentals are properly associated with occupied rooms on startup/backfill', async () => {
    // Setup test property for backfill linking: 3 total rooms, 2 occupied
    await insertProperty(propIdLink, 'Property for Room Linkage', 3, 2);

    // Call backfill to generate the 3 discrete rooms (101 occupied, 102 occupied, 103 available)
    await backfillDiscreteRooms(pool);

    const [rooms] = await pool.query<RoomRow[]>("SELECT id, roomNumber, status FROM rooms WHERE propertyId = ? ORDER BY roomNumber ASC", [propIdLink]);
    assert.equal(rooms.length, 3, "Backfill must provision 3 rooms");
    assert.equal(rooms[0].status, 'occupied', "Room 101 must be occupied");
    assert.equal(rooms[1].status, 'occupied', "Room 102 must be occupied");
    assert.equal(rooms[2].status, 'available', "Room 103 must be available");

    // Insert an active rental without roomId
    const unlinkedRentalId = `rent-${TEST_PREFIX}-active1`;
    await pool.query(
      `INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status, roomId)
       VALUES (?, 'user-tenant', ?, 'Property for Room Linkage', 3000000, '2026-09-01', 'active', NULL)`,
      [unlinkedRentalId, propIdLink]
    );

    // Re-run backfill to trigger linking subroutine
    await backfillDiscreteRooms(pool);

    // Verify unlinked active rental was assigned to an occupied room on this property
    const [rentalRows] = await pool.query<RentalRow[]>("SELECT id, roomId, status FROM rentals WHERE id = ?", [unlinkedRentalId]);
    assert.equal(rentalRows.length, 1);
    assert.ok(rentalRows[0].roomId, "Active rental must now have a populated roomId");
    assert.equal(rentalRows[0].status, 'active');

    // Verify the assigned room is indeed on this property and is marked occupied
    const assignedRoomId = rentalRows[0].roomId;
    const [assignedRoom] = await pool.query<RoomRow[]>("SELECT id, propertyId, status FROM rooms WHERE id = ?", [assignedRoomId]);
    assert.equal(assignedRoom.length, 1);
    assert.equal(assignedRoom[0].propertyId, propIdLink);
    assert.equal(assignedRoom[0].status, 'occupied', "Assigned room must be occupied");
  });

  await t.test('3.2 rentals.roomId link safety: Legacy rentals with null/empty roomId (pending, completed, terminated, cancelled) remain intact', async () => {
    const rentPending = `rent-${TEST_PREFIX}-pending`;
    const rentCompleted = `rent-${TEST_PREFIX}-completed`;
    const rentTerminated = `rent-${TEST_PREFIX}-terminated`;
    const rentCancelled = `rent-${TEST_PREFIX}-cancelled`;

    await pool.query(
      `INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status, roomId) VALUES
       (?, 'user-tenant', ?, 'Property for Room Linkage', 3000000, '2026-09-01', 'pending', NULL),
       (?, 'user-tenant', ?, 'Property for Room Linkage', 3000000, '2026-08-01', 'completed', NULL),
       (?, 'user-tenant', ?, 'Property for Room Linkage', 3000000, '2026-07-01', 'terminated', ''),
       (?, 'user-tenant', ?, 'Property for Room Linkage', 3000000, '2026-06-01', 'cancelled', NULL)`,
      [rentPending, propIdLink, rentCompleted, propIdLink, rentTerminated, propIdLink, rentCancelled, propIdLink]
    );

    // Run backfill again
    await backfillDiscreteRooms(pool);

    // Query non-active rentals and verify their roomId remained null/empty
    const [legacyRows] = await pool.query<RentalRow[]>(
      "SELECT id, roomId, status FROM rentals WHERE id IN (?, ?, ?, ?) ORDER BY id ASC",
      [rentPending, rentCompleted, rentTerminated, rentCancelled]
    );

    assert.equal(legacyRows.length, 4);
    for (const r of legacyRows) {
      assert.ok(
        r.roomId === null || r.roomId === '',
        `Non-active rental ${r.id} (${r.status}) must NOT be linked to a room; got roomId="${r.roomId}"`
      );
    }
  });

  await t.test('3.3 rentals.roomId link safety: Pre-linked active rental is not overwritten during subsequent backfill runs', async () => {
    const prelinkedRentalId = `rent-${TEST_PREFIX}-prelinked`;
    const targetRoomId = `room-${propIdLink}-102`; // Pre-link to room 102

    await pool.query(
      `INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status, roomId)
       VALUES (?, 'user-tenant', ?, 'Property for Room Linkage', 3000000, '2026-09-01', 'active', ?)`,
      [prelinkedRentalId, propIdLink, targetRoomId]
    );

    // Run backfill
    await backfillDiscreteRooms(pool);

    // Query back
    const [prelinkedRows] = await pool.query<RentalRow[]>("SELECT id, roomId FROM rentals WHERE id = ?", [prelinkedRentalId]);
    assert.equal(prelinkedRows.length, 1);
    assert.equal(prelinkedRows[0].roomId, targetRoomId, "Pre-existing roomId must be preserved without alteration");
  });

  await t.test('3.4 Fallback room allocation: Active rental consumes available room if all occupied rooms already allocated', async () => {
    // Both room 101 and 102 are now allocated.
    // Insert a second unlinked active rental
    const secondUnlinkedRentalId = `rent-${TEST_PREFIX}-active2`;
    await pool.query(
      `INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status, roomId)
       VALUES (?, 'user-tenant', ?, 'Property for Room Linkage', 3000000, '2026-09-01', 'active', NULL)`,
      [secondUnlinkedRentalId, propIdLink]
    );

    // Run backfill
    await backfillDiscreteRooms(pool);

    const [rentalRows] = await pool.query<RentalRow[]>("SELECT id, roomId FROM rentals WHERE id = ?", [secondUnlinkedRentalId]);
    assert.equal(rentalRows.length, 1);
    assert.ok(rentalRows[0].roomId, "Second active rental must be allocated a room via fallback");

    // The allocated room must now be marked occupied
    const [roomRow] = await pool.query<RoomRow[]>("SELECT id, status FROM rooms WHERE id = ?", [rentalRows[0].roomId]);
    assert.equal(roomRow[0].status, 'occupied', "Allocated fallback room must transition to occupied");

    // Verify property counters synchronized to 3 occupied rooms
    const [propRows] = await pool.query<PropertyRow[]>("SELECT totalRooms, occupiedRooms FROM properties WHERE id = ?", [propIdLink]);
    assert.equal(propRows[0].totalRooms, 3);
    assert.equal(propRows[0].occupiedRooms, 3, "occupiedRooms must synchronize to 3");
  });

  // =========================================================================
  // Test Group 4: Room Count Parity Synchronization (`syncPropertyRoomCounts`)
  // =========================================================================

  await t.test('4.1 syncPropertyRoomCounts: Correctly handles mixed room status distribution', async () => {
    const propSync = `prop-${TEST_PREFIX}-sync`;
    await insertProperty(propSync, 'Property Sync Test', 0, 0);

    // Insert 5 rooms: 2 available, 2 occupied, 1 maintenance
    await pool.query(
      `INSERT INTO rooms (id, propertyId, roomNumber, floor, status) VALUES
       (?, ?, '101', 1, 'available'),
       (?, ?, '102', 1, 'available'),
       (?, ?, '201', 2, 'occupied'),
       (?, ?, '202', 2, 'occupied'),
       (?, ?, '203', 2, 'maintenance')`,
      [
        `room-${TEST_PREFIX}-s1`, propSync,
        `room-${TEST_PREFIX}-s2`, propSync,
        `room-${TEST_PREFIX}-s3`, propSync,
        `room-${TEST_PREFIX}-s4`, propSync,
        `room-${TEST_PREFIX}-s5`, propSync
      ]
    );

    const syncResult = await syncPropertyRoomCounts(pool, propSync);
    assert.equal(syncResult.totalRooms, 5, "totalRooms must count all 5 rooms");
    assert.equal(syncResult.occupiedRooms, 2, "occupiedRooms must count only status === 'occupied' (maintenance excluded)");

    const [propRows] = await pool.query<PropertyRow[]>("SELECT totalRooms, occupiedRooms FROM properties WHERE id = ?", [propSync]);
    assert.equal(propRows[0].totalRooms, 5);
    assert.equal(propRows[0].occupiedRooms, 2);
  });

  await t.test('4.2 syncPropertyRoomCounts: Reflects room deletion immediately upon resync', async () => {
    const propSync = `prop-${TEST_PREFIX}-sync`;
    // Delete 1 occupied room
    await pool.query("DELETE FROM rooms WHERE id = ?", [`room-${TEST_PREFIX}-s3`]);

    const syncResult = await syncPropertyRoomCounts(pool, propSync);
    assert.equal(syncResult.totalRooms, 4, "totalRooms must drop to 4");
    assert.equal(syncResult.occupiedRooms, 1, "occupiedRooms must drop to 1");
  });

  // =========================================================================
  // Test Group 5: Transactional Row Locking Isolation (`SELECT ... FOR UPDATE`)
  // =========================================================================

  await t.test('5.1 Row-level locking: SELECT ... FOR UPDATE on rooms table provides transactional isolation', async () => {
    const conn1 = await pool.getConnection();
    const testRoomId = `room-${TEST_PREFIX}-s1`;

    try {
      await conn1.beginTransaction();

      // Acquire exclusive row lock on room
      const [lockedRooms] = await conn1.query<RoomRow[]>(
        "SELECT id, status, propertyId FROM rooms WHERE id = ? FOR UPDATE",
        [testRoomId]
      );
      assert.equal(lockedRooms.length, 1);
      assert.equal(lockedRooms[0].id, testRoomId);

      // Safe update within lock
      await conn1.query("UPDATE rooms SET status = 'maintenance' WHERE id = ?", [testRoomId]);

      await conn1.commit();

      // Verify committed state
      const [updatedRooms] = await pool.query<RoomRow[]>("SELECT status FROM rooms WHERE id = ?", [testRoomId]);
      assert.equal(updatedRooms[0].status, 'maintenance');
    } finally {
      conn1.release();
    }
  });
});
