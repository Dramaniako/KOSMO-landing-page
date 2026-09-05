import assert from 'node:assert/strict';
import type { RowDataPacket } from 'mysql2/promise';
import { pool, ensureDbReady, syncPropertyRoomCounts } from '../backend/db';
import { seedDatabase } from '../scripts/seed';

async function runAdversarialChallenge() {
  console.log('🚀 Starting Empirical Adversarial Challenge: DB Reseeding, Room Isolation, and Parity Sync...');
  await ensureDbReady();

  // -------------------------------------------------------------
  // Test 1: Fresh Database Seeding & Cleanliness Audit
  // -------------------------------------------------------------
  console.log('\n--- 1. Testing db:seed execution and post-seed state ---');
  await seedDatabase();

  // 1.1 Orphaned Rooms
  const [orphanRooms] = await pool.query<RowDataPacket[]>(`
    SELECT r.id, r.propertyId 
    FROM rooms r 
    LEFT JOIN properties p ON r.propertyId = p.id 
    WHERE p.id IS NULL
  `);
  console.log(`✓ Orphaned rooms count: ${orphanRooms.length}`);
  assert.strictEqual(orphanRooms.length, 0, `Found orphaned rooms: ${JSON.stringify(orphanRooms)}`);

  // 1.2 Orphaned Photos
  const [orphanPhotosProp] = await pool.query<RowDataPacket[]>(`
    SELECT ph.id, ph.propertyId 
    FROM property_photos ph 
    LEFT JOIN properties p ON ph.propertyId = p.id 
    WHERE p.id IS NULL
  `);
  console.log(`✓ Orphaned property photos (missing property): ${orphanPhotosProp.length}`);
  assert.strictEqual(orphanPhotosProp.length, 0, `Found orphaned photos: ${JSON.stringify(orphanPhotosProp)}`);

  const [orphanPhotosRoom] = await pool.query<RowDataPacket[]>(`
    SELECT ph.id, ph.roomId 
    FROM property_photos ph 
    LEFT JOIN rooms r ON ph.roomId = r.id 
    WHERE ph.roomId IS NOT NULL AND r.id IS NULL
  `);
  console.log(`✓ Orphaned property photos (missing room): ${orphanPhotosRoom.length}`);
  assert.strictEqual(orphanPhotosRoom.length, 0, `Found orphaned room photos: ${JSON.stringify(orphanPhotosRoom)}`);

  // 1.3 Curated properties discrete rooms & status 'available'
  const curatedIds = ['prop-01', 'prop-02', 'prop-03', 'prop-04', 'prop-05', 'prop-06', 'prop-07'];
  const expectedTotals: Record<string, number> = {
    'prop-01': 10,
    'prop-02': 8,
    'prop-03': 12,
    'prop-04': 8,
    'prop-05': 6,
    'prop-06': 10,
    'prop-07': 10
  };

  for (const propId of curatedIds) {
    const [propRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, totalRooms, occupiedRooms FROM properties WHERE id = ?',
      [propId]
    );
    assert.strictEqual(propRows.length, 1, `Property ${propId} must exist`);
    const prop = propRows[0];
    const expected = expectedTotals[propId];

    assert.strictEqual(prop.totalRooms, expected, `${propId} totalRooms mismatch`);
    assert.strictEqual(prop.occupiedRooms, 0, `${propId} occupiedRooms must be 0 after seeding`);

    const [rooms] = await pool.query<RowDataPacket[]>(
      'SELECT id, roomNumber, floor, type, status FROM rooms WHERE propertyId = ? ORDER BY roomNumber ASC',
      [propId]
    );
    assert.strictEqual(rooms.length, expected, `${propId} discrete room row count mismatch`);

    for (const rm of rooms) {
      assert.strictEqual(rm.status, 'available', `Room ${rm.id} on ${propId} must have status 'available'`);
      assert.ok(rm.floor >= 1, `Room ${rm.id} floor must be >= 1`);
      assert.ok(rm.roomNumber, `Room ${rm.id} must have a roomNumber`);
    }
  }
  console.log('✓ All 7 curated properties have discrete rooms provisioned with status available and 0 occupiedRooms');

  // 1.4 Non-canonical user purge
  const [nonCanonicalUsers] = await pool.query<RowDataPacket[]>(
    "SELECT id, email, role FROM users WHERE id NOT IN ('user-admin', 'user-landlord', 'user-tenant')"
  );
  console.log(`✓ Non-canonical users count: ${nonCanonicalUsers.length}`);
  assert.strictEqual(nonCanonicalUsers.length, 0, `Non-canonical users were not purged: ${JSON.stringify(nonCanonicalUsers)}`);

  // 1.5 Rentals and transactions purge
  const [rentalsCount] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as c FROM rentals');
  assert.strictEqual(rentalsCount[0].c, 0, 'Rentals must be 0 after seeding');
  const [withdrawalsCount] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as c FROM withdrawals');
  assert.strictEqual(withdrawalsCount[0].c, 0, 'Withdrawals must be 0 after seeding');
  console.log('✓ Transactional tables (rentals, withdrawals) are empty');

  // -------------------------------------------------------------
  // Test 2: Idempotency & Dirty-State Recovery Test
  // -------------------------------------------------------------
  console.log('\n--- 2. Testing Seed Idempotency & Dirty State Recovery ---');
  // Run seed a second time consecutively
  await seedDatabase();
  const [p1RoomsAfterSecondSeed] = await pool.query<RowDataPacket[]>(
    'SELECT COUNT(*) as c FROM rooms WHERE propertyId = "prop-01"'
  );
  assert.strictEqual(p1RoomsAfterSecondSeed[0].c, 10, 'Consecutive seed must not duplicate rooms');
  const [p1PhotosAfterSecondSeed] = await pool.query<RowDataPacket[]>(
    'SELECT COUNT(*) as c FROM property_photos WHERE propertyId = "prop-01"'
  );
  assert.strictEqual(p1PhotosAfterSecondSeed[0].c, 1, 'Consecutive seed must not duplicate photos');
  console.log('✓ Seed idempotency verified: repeated execution produces identical pristine state');

  // Deliberately dirty the database
  console.log('Injecting adversarial dirty state: rogue property, orphaned room/photo, non-canonical user, rogue rental, occupied rooms...');
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  await pool.query(`
    INSERT INTO properties (id, name, district, address, price, rating, image, description, latitude, longitude, totalRooms, occupiedRooms, ownerId, document)
    VALUES ('prop-dirty-adversarial', 'Dirty Kos', 'Denpasar', 'Jl. Rogue', 1000000, 3.0, 'http://example.com/d.jpg', 'Desc', '0', '0', 5, 5, 'user-landlord', 'doc.pdf')
  `);
  await pool.query(`
    INSERT INTO rooms (id, propertyId, roomNumber, floor, type, status)
    VALUES 
      ('room-orphan-adv-1', 'prop-ghost-99', '999', 9, 'Standard', 'occupied'),
      ('room-dirty-adv-1', 'prop-dirty-adversarial', '101', 1, 'Standard', 'occupied')
  `);
  await pool.query(`
    INSERT INTO property_photos (id, propertyId, roomId, url, category, caption, orderIndex)
    VALUES ('photo-orphan-adv-1', 'prop-ghost-99', 'room-orphan-adv-1', 'http://orphan.com/img.jpg', 'gallery', 'Orphan', 1)
  `);
  await pool.query(`
    INSERT INTO users (id, email, password, name, role)
    VALUES ('user-dirty-adv-1', 'adv_dirty@attacker.test', 'hash', 'Dirty Attacker', 'tenant')
  `);
  await pool.query(`
    INSERT INTO rentals (id, propertyId, tenantId, roomId, price, status, startDate)
    VALUES ('rent-dirty-adv-1', 'prop-01', 'user-tenant', 'room-prop-01-101', 3500000, 'active', '2026-09-01')
  `);
  await pool.query("UPDATE rooms SET status = 'occupied' WHERE id = 'room-prop-01-101'");
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');

  // Run seed to recover
  await seedDatabase();

  const [ghostProps] = await pool.query<RowDataPacket[]>('SELECT id FROM properties WHERE id = "prop-dirty-adversarial"');
  assert.strictEqual(ghostProps.length, 0, 'Rogue property must be wiped');
  const [ghostRooms] = await pool.query<RowDataPacket[]>('SELECT id FROM rooms WHERE id IN ("room-orphan-adv-1", "room-dirty-adv-1")');
  assert.strictEqual(ghostRooms.length, 0, 'Rogue & orphan rooms must be wiped');
  const [ghostPhotos] = await pool.query<RowDataPacket[]>('SELECT id FROM property_photos WHERE id = "photo-orphan-adv-1"');
  assert.strictEqual(ghostPhotos.length, 0, 'Rogue & orphan photos must be wiped');
  const [ghostUsers] = await pool.query<RowDataPacket[]>('SELECT id FROM users WHERE id = "user-dirty-adv-1"');
  assert.strictEqual(ghostUsers.length, 0, 'Non-canonical users must be wiped');
  const [p1r101] = await pool.query<RowDataPacket[]>('SELECT status FROM rooms WHERE id = "room-prop-01-101"');
  assert.strictEqual(p1r101[0].status, 'available', 'prop-01 room 101 must be reset to available');
  console.log('✓ Dirty state recovery verified: all rogue records completely purged and pristine state restored');

  // -------------------------------------------------------------
  // Test 3: syncPropertyRoomCounts Parity & Edge Case Stress
  // -------------------------------------------------------------
  console.log('\n--- 3. Testing syncPropertyRoomCounts parity synchronization ---');
  const testPropId = `prop-adv-parity-${Date.now()}`;
  await pool.query(`
    INSERT INTO properties (id, name, district, address, price, rating, image, description, latitude, longitude, totalRooms, occupiedRooms, ownerId, document)
    VALUES (?, 'Parity Stress Kos', 'Denpasar', 'Jl. Parity', 2500000, 4.5, 'http://img.test', 'Desc', '0', '0', 99, 99, 'user-landlord', 'doc.pdf')
  `, [testPropId]);

  try {
    // 3.1 Zero rooms
    let counts = await syncPropertyRoomCounts(pool, testPropId);
    assert.strictEqual(counts.totalRooms, 0);
    assert.strictEqual(counts.occupiedRooms, 0);
    let [propRow] = await pool.query<RowDataPacket[]>('SELECT totalRooms, occupiedRooms FROM properties WHERE id = ?', [testPropId]);
    assert.strictEqual(propRow[0].totalRooms, 0);
    assert.strictEqual(propRow[0].occupiedRooms, 0);
    console.log('✓ Zero rooms: total=0, occupied=0');

    // 3.2 Add 5 rooms (all available)
    const roomIds = [1, 2, 3, 4, 5].map(i => `rm-${testPropId}-${i}`);
    for (let i = 0; i < roomIds.length; i++) {
      await pool.query(`
        INSERT INTO rooms (id, propertyId, roomNumber, floor, type, status)
        VALUES (?, ?, ?, 1, 'Standard', 'available')
      `, [roomIds[i], testPropId, `10${i + 1}`]);
    }
    counts = await syncPropertyRoomCounts(pool, testPropId);
    assert.strictEqual(counts.totalRooms, 5);
    assert.strictEqual(counts.occupiedRooms, 0);
    console.log('✓ 5 available rooms: total=5, occupied=0');

    // 3.3 Multiple rentals sequential booking:
    // Rental 1: Room 1 -> occupied
    await pool.query("UPDATE rooms SET status = 'occupied' WHERE id = ?", [roomIds[0]]);
    counts = await syncPropertyRoomCounts(pool, testPropId);
    assert.strictEqual(counts.totalRooms, 5);
    assert.strictEqual(counts.occupiedRooms, 1);

    // Rental 2: Room 2 -> occupied
    await pool.query("UPDATE rooms SET status = 'occupied' WHERE id = ?", [roomIds[1]]);
    counts = await syncPropertyRoomCounts(pool, testPropId);
    assert.strictEqual(counts.totalRooms, 5);
    assert.strictEqual(counts.occupiedRooms, 2);

    // Room 3 -> maintenance (NOT occupied)
    await pool.query("UPDATE rooms SET status = 'maintenance' WHERE id = ?", [roomIds[2]]);
    counts = await syncPropertyRoomCounts(pool, testPropId);
    assert.strictEqual(counts.totalRooms, 5);
    assert.strictEqual(counts.occupiedRooms, 2);

    // Rental 3: Room 4 -> occupied
    await pool.query("UPDATE rooms SET status = 'occupied' WHERE id = ?", [roomIds[3]]);
    counts = await syncPropertyRoomCounts(pool, testPropId);
    assert.strictEqual(counts.totalRooms, 5);
    assert.strictEqual(counts.occupiedRooms, 3);

    // Rental 4: Room 5 -> occupied
    await pool.query("UPDATE rooms SET status = 'occupied' WHERE id = ?", [roomIds[4]]);
    counts = await syncPropertyRoomCounts(pool, testPropId);
    assert.strictEqual(counts.totalRooms, 5);
    assert.strictEqual(counts.occupiedRooms, 4);
    console.log('✓ 4 occupied + 1 maintenance: total=5, occupied=4 (maintenance correctly excluded from occupied)');

    // 3.4 Termination of Rental 1 and 2:
    await pool.query("UPDATE rooms SET status = 'available' WHERE id = ?", [roomIds[0]]);
    counts = await syncPropertyRoomCounts(pool, testPropId);
    assert.strictEqual(counts.totalRooms, 5);
    assert.strictEqual(counts.occupiedRooms, 3);

    await pool.query("UPDATE rooms SET status = 'available' WHERE id = ?", [roomIds[1]]);
    counts = await syncPropertyRoomCounts(pool, testPropId);
    assert.strictEqual(counts.totalRooms, 5);
    assert.strictEqual(counts.occupiedRooms, 2);
    console.log('✓ Terminations release rooms: total=5, occupied=2');

    // 3.5 High concurrency sync
    const concurSyncs = Array.from({ length: 20 }, () => syncPropertyRoomCounts(pool, testPropId));
    const concurResults = await Promise.all(concurSyncs);
    for (const r of concurResults) {
      assert.strictEqual(r.totalRooms, 5);
      assert.strictEqual(r.occupiedRooms, 2);
    }
    console.log('✓ 20 concurrent syncs maintain exact count parity without deviation');

  } finally {
    await pool.query('DELETE FROM rooms WHERE propertyId = ?', [testPropId]);
    await pool.query('DELETE FROM properties WHERE id = ?', [testPropId]);
  }

  // Restore pristine seed
  await seedDatabase();
  console.log('\n🎉 ALL EMPIRICAL ADVERSARIAL CHALLENGES (DB RESEED & ROOM PARITY) PASSED CLEANLY!\n');
}

runAdversarialChallenge()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ ADVERSARIAL CHALLENGE FAILED:', err);
    process.exit(1);
  });
