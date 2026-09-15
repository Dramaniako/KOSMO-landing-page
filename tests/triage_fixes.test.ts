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
  type PropertyPhoto,
  type Room
} from '../backend/types/index';
import {
  pool,
  ensureDbReady,
  ensureIndexes
} from '../backend/db';
import { generateJwtToken } from '../backend/middleware/auth';
import type { RowDataPacket } from 'mysql2/promise';

test('Milestone 2 Backend & Database Defect Resolutions (Issues #78, #79, #80, #81, #82, #87, #88, #90)', async (t) => {
  await ensureDbReady();
  await ensureIndexes();

  // Server Setup (Dynamic Ephemeral Port)
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

  // Fixtures & Unique Identifiers
  const tag = crypto.randomBytes(4).toString('hex');
  const landlordId = `user-ll-m2-${tag}`;
  const tenantId = `user-ten-m2-${tag}`;
  const adminId = `user-adm-m2-${tag}`;
  const passwordHash = bcrypt.hashSync('Password123!', 10);

  const propId = `prop-m2-${tag}`;
  const room1Id = `room-m2-1-${tag}`;
  const room2Id = `room-m2-2-${tag}`;

  const photo1Id = `photo-m2-1-${tag}`;
  const photo2Id = `photo-m2-2-${tag}`;
  const photo3Id = `photo-m2-3-${tag}`;
  const photo4Id = `photo-m2-4-${tag}`;

  const landlordToken = generateJwtToken({ id: landlordId, email: `ll-${tag}@kosmo.test`, role: 'landlord' });
  const adminToken = generateJwtToken({ id: adminId, email: `adm-${tag}@kosmo.test`, role: 'admin' });

  // 1x1 transparent PNG buffer for multi-upload testing
  const samplePngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

  // Seed Users
  await pool.query(
    `INSERT INTO users (id, name, email, password, role, balance, totalRevenue) VALUES
     (?, 'Landlord M2', ?, ?, 'landlord', 0, 0),
     (?, 'Tenant M2', ?, ?, 'tenant', 0, 0),
     (?, 'Admin M2', ?, ?, 'admin', 0, 0)`,
    [
      landlordId, `ll-${tag}@kosmo.test`, passwordHash,
      tenantId, `ten-${tag}@kosmo.test`, passwordHash,
      adminId, `adm-${tag}@kosmo.test`, passwordHash
    ]
  );

  // Seed Property
  await pool.query(
    `INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId, image) VALUES
     (?, 'KOSMO M2 Haven', 'Badung', 'Jl. Sunset Road No. 88', 5000000, 2, 0, ?, 'https://res.cloudinary.com/prop-m2.jpg')`,
    [propId, landlordId]
  );

  // Seed Rooms
  await pool.query(
    `INSERT INTO rooms (id, propertyId, roomNumber, floor, type, price, status) VALUES
     (?, ?, '101', 1, 'Deluxe Suite', 5000000, 'available'),
     (?, ?, '102', 1, 'Standard Room', 4500000, 'available')`,
    [room1Id, propId, room2Id, propId]
  );

  // Seed Initial Photos (2 property-level, 2 room-level)
  await pool.query(
    `INSERT INTO property_photos (id, propertyId, roomId, url, publicId, category, caption, orderIndex) VALUES
     (?, ?, NULL, 'https://res.cloudinary.com/p1.webp', 'kosmo_properties/p1', 'thumbnail', 'Main Facade', 0),
     (?, ?, NULL, 'https://res.cloudinary.com/p2.webp', 'kosmo_properties/p2', 'pool', 'Infinity Pool', 1),
     (?, ?, ?, 'https://res.cloudinary.com/p3.webp', 'kosmo_properties/p3', 'bedroom', 'Suite Master Bed', 2),
     (?, ?, ?, 'https://res.cloudinary.com/p4.webp', 'kosmo_properties/p4', 'bathroom', 'Suite Marble Bath', 3)`,
    [
      photo1Id, propId,
      photo2Id, propId,
      photo3Id, propId, room1Id,
      photo4Id, propId, room1Id
    ]
  );

  t.after(async () => {
    server.close();
    try {
      await pool.query('DELETE FROM property_photos WHERE propertyId = ?', [propId]);
      await pool.query('DELETE FROM rooms WHERE propertyId = ?', [propId]);
      await pool.query('DELETE FROM properties WHERE id = ?', [propId]);
      await pool.query('DELETE FROM users WHERE id IN (?, ?, ?)', [landlordId, tenantId, adminId]);
    } catch (err) {
      console.warn('Triage fixes test teardown warning:', err);
    }
  });

  // =========================================================================
  // Test Suite 1: Issues #78 & #79 - Concurrent Queries & Explicit Columns
  // =========================================================================
  await t.test('1. Issue #78 & #79: GET /properties/:id/rooms concurrent query & explicit photo projections', async () => {
    const res = await fetch(`${baseUrl}/properties/${propId}/rooms`);
    assert.equal(res.status, 200);
    const rooms = (await res.json()) as Room[];
    assert.ok(Array.isArray(rooms));
    assert.equal(rooms.length, 2);

    const room1 = rooms.find((r) => r.id === room1Id);
    assert.ok(room1);
    assert.equal(room1?.photos?.length, 2);

    // Verify explicit photo columns include updatedAt
    const p1 = room1?.photos?.[0];
    assert.ok(p1);
    assert.equal(p1.id, photo3Id);
    assert.equal(p1.category, 'bedroom');
    assert.ok(p1.createdAt);
    assert.ok(p1.updatedAt !== undefined);
  });

  // =========================================================================
  // Test Suite 2: Issue #80 - In-Memory Room Detail Caching & Invalidation
  // =========================================================================
  await t.test('2. Issue #80: GET /rooms/:roomId caching & mutation cache invalidation', async (t2) => {
    await t2.test('2.1 sets Cache-Control header and returns formatted room with photo details', async () => {
      const res = await fetch(`${baseUrl}/rooms/${room1Id}`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('cache-control'), 'public, max-age=30, stale-while-revalidate=60');
      const room = (await res.json()) as Room;
      assert.equal(room.id, room1Id);
      assert.equal(room.roomNumber, '101');
      assert.equal(room.photos?.length, 2);
      assert.ok(room.photos?.[0].updatedAt !== undefined);
    });

    await t2.test('2.2 room mutation (PATCH /rooms/:roomId/status) invalidates room cache', async () => {
      const patchRes = await fetch(`${baseUrl}/rooms/${room1Id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({ status: 'maintenance' })
      });
      assert.equal(patchRes.status, 200);

      // Verify immediate fresh read returns updated status
      const getRes = await fetch(`${baseUrl}/rooms/${room1Id}`);
      assert.equal(getRes.status, 200);
      const room = (await getRes.json()) as Room;
      assert.equal(room.status, 'maintenance');

      // Revert status
      await fetch(`${baseUrl}/rooms/${room1Id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({ status: 'available' })
      });
    });

    await t2.test('2.3 PUT /rooms/:roomId updates details, returns explicit photo columns, and invalidates cache', async () => {
      const putRes = await fetch(`${baseUrl}/rooms/${room1Id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordToken}`
        },
        body: JSON.stringify({
          roomNumber: '101-A',
          floor: 1,
          type: 'Presidential Suite',
          price: 6000000,
          status: 'available'
        })
      });
      assert.equal(putRes.status, 200);
      const putBody = (await putRes.json()) as { room: Room };
      assert.equal(putBody.room.roomNumber, '101-A');
      assert.equal(putBody.room.photos?.length, 2);
      assert.ok(putBody.room.photos?.[0].updatedAt !== undefined);

      // Verify GET reflects changes
      const getRes = await fetch(`${baseUrl}/rooms/${room1Id}`);
      const freshRoom = (await getRes.json()) as Room;
      assert.equal(freshRoom.roomNumber, '101-A');
      assert.equal(freshRoom.type, 'Presidential Suite');
    });
  });

  // =========================================================================
  // Test Suite 3: Issue #81 - Bulk CASE UPDATE for Photo Reordering
  // =========================================================================
  await t.test('3. Issue #81: PUT /properties/:id/photos/reorder executes bulk CASE UPDATE', async () => {
    // Reorder: photo4 first, then photo2, photo1, photo3
    const res = await fetch(`${baseUrl}/properties/${propId}/photos/reorder`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${landlordToken}`
      },
      body: JSON.stringify({
        photoIds: [photo4Id, photo2Id]
      })
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { photos: PropertyPhoto[] };
    assert.ok(Array.isArray(body.photos));
    assert.equal(body.photos.length, 4);

    // photo4 must be orderIndex 0, photo2 must be orderIndex 1
    assert.equal(body.photos[0].id, photo4Id);
    assert.equal(body.photos[0].orderIndex, 0);
    assert.equal(body.photos[1].id, photo2Id);
    assert.equal(body.photos[1].orderIndex, 1);

    // Remaining photos offset to 2 and 3
    assert.equal(body.photos[2].id, photo1Id);
    assert.equal(body.photos[2].orderIndex, 2);
    assert.equal(body.photos[3].id, photo3Id);
    assert.equal(body.photos[3].orderIndex, 3);

    // Verify database directly
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, orderIndex FROM property_photos WHERE propertyId = ? ORDER BY orderIndex ASC',
      [propId]
    );
    assert.equal(rows[0].id, photo4Id);
    assert.equal(rows[0].orderIndex, 0);
    assert.equal(rows[1].id, photo2Id);
    assert.equal(rows[1].orderIndex, 1);
  });

  // =========================================================================
  // Test Suite 4: Issue #82 - Server-Side Photo Pagination & Headers
  // =========================================================================
  await t.test('4. Issue #82: GET /properties/:id/photos supports limit/offset pagination & headers', async (t4) => {
    await t4.test('4.1 returns paginated subset with X-Total-Count, X-Page-Limit, X-Page-Offset headers', async () => {
      const res = await fetch(`${baseUrl}/properties/${propId}/photos?limit=2&offset=0`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-total-count'), '4');
      assert.equal(res.headers.get('x-page-limit'), '2');
      assert.equal(res.headers.get('x-page-offset'), '0');

      const photos = (await res.json()) as PropertyPhoto[];
      assert.ok(Array.isArray(photos));
      assert.equal(photos.length, 2);
    });

    await t4.test('4.2 returns second page correctly', async () => {
      const res = await fetch(`${baseUrl}/properties/${propId}/photos?limit=2&offset=2`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-total-count'), '4');
      assert.equal(res.headers.get('x-page-limit'), '2');
      assert.equal(res.headers.get('x-page-offset'), '2');

      const photos = (await res.json()) as PropertyPhoto[];
      assert.ok(Array.isArray(photos));
      assert.equal(photos.length, 2);
    });

    await t4.test('4.3 clamps limit to 100 when excessive limit is passed', async () => {
      const res = await fetch(`${baseUrl}/properties/${propId}/photos?limit=250`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-page-limit'), '100');
    });

    await t4.test('4.4 rejects invalid non-positive limit with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/properties/${propId}/photos?limit=-5`);
      assert.equal(res.status, 400);
    });

    await t4.test('4.5 rejects negative offset with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/properties/${propId}/photos?offset=-1`);
      assert.equal(res.status, 400);
    });

    await t4.test('4.6 unpaginated fetch returns array directly without breaking existing clients', async () => {
      const res = await fetch(`${baseUrl}/properties/${propId}/photos`);
      assert.equal(res.status, 200);
      const photos = (await res.json()) as PropertyPhoto[];
      assert.ok(Array.isArray(photos));
      assert.equal(photos.length, 4);
      assert.equal(res.headers.get('x-total-count'), '4');
    });
  });

  // =========================================================================
  // Test Suite 5: Issue #87 - updatedAt Column & HTTP 304 Conditional Caching
  // =========================================================================
  await t.test('5. Issue #87: updatedAt column in DDL and HTTP 304 conditional caching', async (t5) => {
    await t5.test('5.1 property_photos table has updatedAt column in MySQL schema', async () => {
      const [colRows] = await pool.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME, DATA_TYPE 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_NAME = 'property_photos' AND COLUMN_NAME = 'updatedAt'`
      );
      assert.ok(colRows.length > 0, 'updatedAt column must exist in property_photos');
    });

    await t5.test('5.2 returns HTTP 304 Not Modified when If-Modified-Since is current', async () => {
      // First request: obtain Last-Modified header
      const firstRes = await fetch(`${baseUrl}/properties/${propId}/photos`);
      assert.equal(firstRes.status, 200);
      const lastModified = firstRes.headers.get('last-modified');
      assert.ok(lastModified, 'Last-Modified header must be present');

      // Second request: send If-Modified-Since with the received timestamp
      const conditionalRes = await fetch(`${baseUrl}/properties/${propId}/photos`, {
        headers: {
          'If-Modified-Since': lastModified
        }
      });
      assert.equal(conditionalRes.status, 304);
      assert.equal(conditionalRes.headers.get('last-modified'), lastModified);
    });
  });

  // =========================================================================
  // Test Suite 6: Issue #88 - Multi-Photo Batch INSERT Statement
  // =========================================================================
  await t.test('6. Issue #88: POST /properties/:id/photos batches multi-photo uploads', async () => {
    const boundary = '----WebKitFormBoundary' + crypto.randomBytes(8).toString('hex');
    const formParts: Buffer[] = [];

    const addFile = (fieldName: string, filename: string, mime: string, content: Buffer) => {
      formParts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`
      ));
      formParts.push(content);
      formParts.push(Buffer.from('\r\n'));
    };

    addFile('images', 'img1.png', 'image/png', samplePngBuffer);
    addFile('images', 'img2.png', 'image/png', samplePngBuffer);
    formParts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="category"\r\n\r\nkitchen\r\n`
    ));
    formParts.push(Buffer.from(`--${boundary}--\r\n`));

    const payloadBuffer = Buffer.concat(formParts);

    const uploadRes = await fetch(`${baseUrl}/properties/${propId}/photos`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        Authorization: `Bearer ${landlordToken}`
      },
      body: payloadBuffer
    });

    assert.equal(uploadRes.status, 201);
    const body = (await uploadRes.json()) as { message: string; photos: PropertyPhoto[] };
    assert.equal(body.photos.length, 2);
    assert.equal(body.photos[0].category, 'kitchen');
    assert.equal(body.photos[1].category, 'kitchen');
    assert.ok(body.photos[0].orderIndex < body.photos[1].orderIndex);
    assert.ok(body.photos[0].updatedAt !== undefined);
  });

  // =========================================================================
  // Test Suite 7: Issue #90 - Clean roomId IS NULL & Composite Indexes
  // =========================================================================
  await t.test('7. Issue #90: Clean roomId IS NULL query & composite indexes', async (t7) => {
    await t7.test('7.1 GET with roomId=null returns only property-level photos without room binding', async () => {
      const res = await fetch(`${baseUrl}/properties/${propId}/photos?roomId=null`);
      assert.equal(res.status, 200);
      const photos = (await res.json()) as PropertyPhoto[];
      assert.ok(Array.isArray(photos));
      // None of the returned photos should have a non-null roomId
      for (const p of photos) {
        assert.equal(p.roomId, null);
      }
    });

    await t7.test('7.2 GET with roomId=property behaves identically to roomId=null', async () => {
      const res = await fetch(`${baseUrl}/properties/${propId}/photos?roomId=property`);
      assert.equal(res.status, 200);
      const photos = (await res.json()) as PropertyPhoto[];
      assert.ok(Array.isArray(photos));
      for (const p of photos) {
        assert.equal(p.roomId, null);
      }
    });

    await t7.test('7.3 composite indexes idx_photos_prop_cat and idx_photos_prop_room exist', async () => {
      const [indexRows] = await pool.query<RowDataPacket[]>(
        'SHOW INDEX FROM property_photos WHERE Key_name IN (?, ?)',
        ['idx_photos_prop_cat', 'idx_photos_prop_room']
      );
      const indexNames = new Set(indexRows.map((r) => r.Key_name));
      assert.ok(indexNames.has('idx_photos_prop_cat'), 'idx_photos_prop_cat must exist');
      assert.ok(indexNames.has('idx_photos_prop_room'), 'idx_photos_prop_room must exist');
    });
  });
});
