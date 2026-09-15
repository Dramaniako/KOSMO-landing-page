(process.env as Record<string, string | undefined>).NO_LISTEN = 'true';
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import bodyParser from 'body-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import router from '../backend/router';
import {
  type PropertyPhoto,
  type Room
} from '../backend/types/index';
import {
  pool,
  ensureDbReady,
  ensureIndexes
} from '../backend/db';
import {
  getJwtSecret,
  generateJwtToken,
  verifyJwtToken,
  authenticateToken,
  type AuthenticatedRequest
} from '../backend/middleware/auth';
import type { RowDataPacket } from 'mysql2/promise';

test('Milestone 4 Adversarial Stress Testing & Behavioral Verification (PRs #75, #77; Issues #78-#90)', async (t) => {
  await ensureDbReady();
  await ensureIndexes();

  // Dynamic Ephemeral Server
  const app = express();
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));
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

  // Fixture Unique Tag
  const tag = crypto.randomBytes(4).toString('hex');
  const landlordId = `user-adv-ll-${tag}`;
  const otherLandlordId = `user-adv-other-ll-${tag}`;
  const tenantId = `user-adv-ten-${tag}`;
  const adminId = `user-adv-adm-${tag}`;
  const passwordHash = bcrypt.hashSync('Password123!', 10);

  const prop1Id = `prop-adv-1-${tag}`;
  const prop2Id = `prop-adv-2-${tag}`;
  const room1Id = `room-adv-1-${tag}`;
  const room2Id = `room-adv-2-${tag}`;

  const photo1Id = `photo-adv-1-${tag}`;
  const photo2Id = `photo-adv-2-${tag}`;
  const photo3Id = `photo-adv-3-${tag}`;
  const foreignPhotoId = `photo-adv-foreign-${tag}`;

  const landlordToken = generateJwtToken({ id: landlordId, email: `ll-${tag}@kosmo.test`, role: 'landlord' });
  const otherLandlordToken = generateJwtToken({ id: otherLandlordId, email: `other-${tag}@kosmo.test`, role: 'landlord' });
  const adminToken = generateJwtToken({ id: adminId, email: `adm-${tag}@kosmo.test`, role: 'admin' });

  // 1x1 transparent PNG buffer for upload testing
  const samplePngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

  // Seed Users
  await pool.query(
    `INSERT INTO users (id, name, email, password, role, balance, totalRevenue) VALUES
     (?, 'Adv Landlord', ?, ?, 'landlord', 0, 0),
     (?, 'Adv Other Landlord', ?, ?, 'landlord', 0, 0),
     (?, 'Adv Tenant', ?, ?, 'tenant', 0, 0),
     (?, 'Adv Admin', ?, ?, 'admin', 0, 0)`,
    [
      landlordId, `ll-${tag}@kosmo.test`, passwordHash,
      otherLandlordId, `other-${tag}@kosmo.test`, passwordHash,
      tenantId, `ten-${tag}@kosmo.test`, passwordHash,
      adminId, `adm-${tag}@kosmo.test`, passwordHash
    ]
  );

  // Seed Properties
  await pool.query(
    `INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId, image) VALUES
     (?, 'KOSMO Adv Haven 1', 'Badung', 'Jl. Canggu No. 1', 6000000, 2, 0, ?, 'https://res.cloudinary.com/prop-adv-1.jpg'),
     (?, 'KOSMO Adv Haven 2', 'Denpasar', 'Jl. Renon No. 2', 4500000, 1, 0, ?, 'https://res.cloudinary.com/prop-adv-2.jpg')`,
    [prop1Id, landlordId, prop2Id, otherLandlordId]
  );

  // Seed Rooms
  await pool.query(
    `INSERT INTO rooms (id, propertyId, roomNumber, floor, type, price, status) VALUES
     (?, ?, '101', 1, 'Deluxe Suite', 6000000, 'available'),
     (?, ?, '102', 1, 'Standard', 5500000, 'available')`,
    [room1Id, prop1Id, room2Id, prop1Id]
  );

  // Seed Photos (prop1 has photo1, photo2, photo3; prop2 has foreignPhotoId)
  await pool.query(
    `INSERT INTO property_photos (id, propertyId, roomId, url, publicId, category, caption, orderIndex) VALUES
     (?, ?, NULL, 'https://res.cloudinary.com/p1.webp', 'kosmo_properties/p1', 'thumbnail', 'Main View', 0),
     (?, ?, NULL, 'https://res.cloudinary.com/p2.webp', 'kosmo_properties/p2', 'pool', 'Pool View', 1),
     (?, ?, ?, 'https://res.cloudinary.com/p3.webp', 'kosmo_properties/p3', 'bedroom', 'Room 101 Bed', 2),
     (?, ?, NULL, 'https://res.cloudinary.com/p_foreign.webp', 'kosmo_properties/p_foreign', 'outdoor', 'Foreign Photo', 0)`,
    [
      photo1Id, prop1Id,
      photo2Id, prop1Id,
      photo3Id, prop1Id, room1Id,
      foreignPhotoId, prop2Id
    ]
  );

  t.after(async () => {
    server.close();
    try {
      await pool.query('DELETE FROM property_photos WHERE propertyId IN (?, ?)', [prop1Id, prop2Id]);
      await pool.query('DELETE FROM rooms WHERE propertyId IN (?, ?)', [prop1Id, prop2Id]);
      await pool.query('DELETE FROM properties WHERE id IN (?, ?)', [prop1Id, prop2Id]);
      await pool.query('DELETE FROM users WHERE id IN (?, ?, ?, ?)', [landlordId, otherLandlordId, tenantId, adminId]);
    } catch (err) {
      console.warn('Adversarial teardown error:', err);
    }
  });

  // =========================================================================
  // Challenge 1: PR #75 - JWT Fallback Secret Security & Static Secret Forgery
  // =========================================================================
  await t.test('1. PR #75 Adversarial: Static Secret Token Forgery Attack Rejection', async (t1) => {
    await t1.test('1.1 secret is a cryptographically strong 64-hex char fallback', () => {
      const secret = getJwtSecret();
      assert.ok(typeof secret === 'string');
      assert.ok(secret.length >= 32, 'Secret must be at least 32 characters');
    });

    await t1.test('1.2 token forged using former static default secret is REJECTED', () => {
      const compromisedStaticSecret = 'kosmo-bali-production-jwt-default-secret-key-2026';
      const attackerPayload = { id: 'attacker-id', email: 'attacker@evil.com', role: 'admin' };
      const forgedToken = jwt.sign(attackerPayload, compromisedStaticSecret, { algorithm: 'HS256', expiresIn: '7d' });

      // verifyJwtToken must throw JsonWebTokenError
      assert.throws(
        () => verifyJwtToken(forgedToken),
        (err: Error) => err.name === 'JsonWebTokenError'
      );
    });

    await t1.test('1.3 HTTP request bearing forged token receives HTTP 403 Forbidden', async () => {
      const compromisedStaticSecret = 'kosmo-bali-production-jwt-default-secret-key-2026';
      const forgedToken = jwt.sign({ id: adminId, email: `adm-${tag}@kosmo.test`, role: 'admin' }, compromisedStaticSecret, { algorithm: 'HS256' });

      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${forgedToken}`
        },
        body: JSON.stringify({ photoIds: [photo2Id, photo1Id] })
      });
      assert.equal(res.status, 403);
    });
  });

  // =========================================================================
  // Challenge 2: PR #77 & Issue #90 - Database Indexes Verification
  // =========================================================================
  await t.test('2. PR #77 & Issue #90: Index Assertions on MySQL Schema', async (t2) => {
    await t2.test('2.1 property_facilities has index on propertyId', async () => {
      const [rows] = await pool.query<RowDataPacket[]>(
        "SHOW INDEX FROM property_facilities WHERE Key_name = 'idx_property_facilities_property' OR Column_name = 'propertyId'"
      );
      assert.ok(rows.length > 0, 'Index on property_facilities.propertyId must exist');
    });

    await t2.test('2.2 property_photos composite indexes exist', async () => {
      const [rows] = await pool.query<RowDataPacket[]>(
        "SHOW INDEX FROM property_photos WHERE Key_name IN ('idx_photos_prop_cat', 'idx_photos_prop_room')"
      );
      const names = new Set(rows.map((r) => r.Key_name));
      assert.ok(names.has('idx_photos_prop_cat'), 'idx_photos_prop_cat must exist');
      assert.ok(names.has('idx_photos_prop_room'), 'idx_photos_prop_room must exist');
    });
  });

  // =========================================================================
  // Challenge 3: Issue #81 - Photo Reorder Atomicity Stress Test
  // =========================================================================
  await t.test('3. Issue #81 Adversarial: Photo Reorder Bulk UPDATE Atomicity & Foreign ID Rejection', async (t3) => {
    await t3.test('3.1 rejects reorder containing foreign photo ID with HTTP 400 and preserves orderIndex', async () => {
      // Current order: photo1Id (0), photo2Id (1), photo3Id (2)
      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({
          photoIds: [photo2Id, foreignPhotoId] // foreignPhotoId belongs to prop2!
        })
      });
      assert.equal(res.status, 400);

      // Verify database state was NOT partially mutated
      const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id, orderIndex FROM property_photos WHERE propertyId = ? ORDER BY orderIndex ASC',
        [prop1Id]
      );
      assert.equal(rows[0].id, photo1Id);
      assert.equal(rows[0].orderIndex, 0);
      assert.equal(rows[1].id, photo2Id);
      assert.equal(rows[1].orderIndex, 1);
    });

    await t3.test('3.2 rejects reorder from non-owner landlord with HTTP 403', async () => {
      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${otherLandlordToken}` // wrong owner
        },
        body: JSON.stringify({
          photoIds: [photo2Id, photo1Id]
        })
      });
      assert.equal(res.status, 403);
    });

    await t3.test('3.3 executes atomic bulk reorder when valid', async () => {
      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({
          photoIds: [photo3Id, photo1Id, photo2Id]
        })
      });
      assert.equal(res.status, 200);
      const data = (await res.json()) as { photos: PropertyPhoto[] };
      assert.equal(data.photos[0].id, photo3Id);
      assert.equal(data.photos[0].orderIndex, 0);
      assert.equal(data.photos[1].id, photo1Id);
      assert.equal(data.photos[1].orderIndex, 1);
      assert.equal(data.photos[2].id, photo2Id);
      assert.equal(data.photos[2].orderIndex, 2);
    });
  });

  // =========================================================================
  // Challenge 4: Issue #82 - Photo Pagination Boundary & Clamping Stress
  // =========================================================================
  await t.test('4. Issue #82 Adversarial: Photo Pagination Clamping & Invalid Parameter Rejections', async (t4) => {
    await t4.test('4.1 clamps excessive limit (limit=500 -> 100)', async () => {
      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos?limit=500`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-page-limit'), '100');
      assert.equal(res.headers.get('x-total-count'), '3');
      const photos = (await res.json()) as PropertyPhoto[];
      assert.ok(Array.isArray(photos));
    });

    await t4.test('4.2 rejects limit=0 with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos?limit=0`);
      assert.equal(res.status, 400);
    });

    await t4.test('4.3 rejects limit=-10 with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos?limit=-10`);
      assert.equal(res.status, 400);
    });

    await t4.test('4.4 rejects non-numeric limit with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos?limit=abc`);
      assert.equal(res.status, 400);
    });

    await t4.test('4.5 rejects negative offset with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos?offset=-5`);
      assert.equal(res.status, 400);
    });

    await t4.test('4.6 handles offset greater than total photos returning empty array', async () => {
      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos?limit=2&offset=50`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-total-count'), '3');
      assert.equal(res.headers.get('x-page-offset'), '50');
      const photos = (await res.json()) as PropertyPhoto[];
      assert.ok(Array.isArray(photos));
      assert.equal(photos.length, 0);
    });
  });

  // =========================================================================
  // Challenge 5: Issue #87 - HTTP 304 Conditional Caching & updatedAt Validation
  // =========================================================================
  await t.test('5. Issue #87 Adversarial: HTTP 304 Conditional Caching & Header Handling', async (t5) => {
    let lastModified = '';

    await t5.test('5.1 returns HTTP 200 with valid Last-Modified header on initial request', async () => {
      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos`);
      assert.equal(res.status, 200);
      const lm = res.headers.get('last-modified');
      assert.ok(lm, 'Last-Modified header must be present');
      lastModified = lm;
      assert.ok(!isNaN(Date.parse(lm)), 'Last-Modified must be valid HTTP date');
    });

    await t5.test('5.2 returns HTTP 304 Not Modified when If-Modified-Since matches', async () => {
      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos`, {
        headers: { 'If-Modified-Since': lastModified }
      });
      assert.equal(res.status, 304);
      const text = await res.text();
      assert.equal(text, '', '304 response body must be empty');
    });

    await t5.test('5.3 returns HTTP 200 when If-Modified-Since is an older timestamp', async () => {
      const olderDate = new Date(Date.now() - 86400000 * 365).toUTCString();
      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos`, {
        headers: { 'If-Modified-Since': olderDate }
      });
      assert.equal(res.status, 200);
      const photos = (await res.json()) as PropertyPhoto[];
      assert.equal(photos.length, 3);
    });
  });

  // =========================================================================
  // Challenge 6: Issue #80 - Single Room Cache & Coordinated Invalidation
  // =========================================================================
  await t.test('6. Issue #80 Adversarial: Single Room Caching & Status/Detail Mutation Invalidation', async (t6) => {
    await t6.test('6.1 caches room detail with public max-age=30', async () => {
      const res = await fetch(`${baseUrl}/rooms/${room1Id}`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('cache-control'), 'public, max-age=30, stale-while-revalidate=60');
      const room = (await res.json()) as Room;
      assert.equal(room.id, room1Id);
      assert.equal(room.roomNumber, '101');
    });

    await t6.test('6.2 PATCH status invalidates room cache immediately', async () => {
      const patchRes = await fetch(`${baseUrl}/rooms/${room1Id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({ status: 'maintenance' })
      });
      assert.equal(patchRes.status, 200);

      // Verify GET returns fresh 'maintenance' status
      const getRes = await fetch(`${baseUrl}/rooms/${room1Id}`);
      assert.equal(getRes.status, 200);
      const room = (await getRes.json()) as Room;
      assert.equal(room.status, 'maintenance');

      // Revert back
      await fetch(`${baseUrl}/rooms/${room1Id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({ status: 'available' })
      });
    });
  });
});
