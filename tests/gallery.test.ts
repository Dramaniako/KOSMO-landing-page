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
  VALID_PHOTO_CATEGORIES,
  type PropertyPhoto,
  type PhotoCategory
} from '../backend/types/index';
import {
  pool,
  ensureDbReady
} from '../backend/db';
import { generateJwtToken } from '../backend/middleware/auth';
import { uploadImageStream, deleteCloudinaryImage } from '../backend/services/cloudinary';
import type { RowDataPacket } from 'mysql2/promise';

interface PropertyPhotoRow extends RowDataPacket {
  id: string;
  propertyId: string;
  roomId: string | null;
  url: string;
  publicId: string | null;
  category: PhotoCategory;
  caption: string | null;
  orderIndex: number;
  createdAt: Date | string;
}

test('Multi-Photo Gallery & Categorized Media Test Suite', async (t) => {
  await ensureDbReady();

  // -------------------------------------------------------------------------
  // Server Setup (Dynamic Ephemeral Port)
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Test Fixtures & Isolation Identifiers
  // -------------------------------------------------------------------------
  const tag = crypto.randomBytes(4).toString('hex');
  const landlordAId = `user-ll-a-${tag}`;
  const landlordBId = `user-ll-b-${tag}`;
  const adminId = `user-adm-${tag}`;
  const tenantId = `user-ten-${tag}`;
  const testPassword = 'Password123!';
  const passwordHash = bcrypt.hashSync(testPassword, 10);

  const propAId = `prop-a-${tag}`;
  const propBId = `prop-b-${tag}`;
  const roomA1Id = `room-a1-${tag}`;
  const roomA2Id = `room-a2-${tag}`;

  const photoA1Id = `photo-a1-${tag}`;
  const photoA2Id = `photo-a2-${tag}`;
  const photoA3Id = `photo-a3-${tag}`;
  const photoB1Id = `photo-b1-${tag}`;

  const landlordAToken = generateJwtToken({ id: landlordAId, email: `lla-${tag}@kosmo.test`, role: 'landlord' });
  const landlordBToken = generateJwtToken({ id: landlordBId, email: `llb-${tag}@kosmo.test`, role: 'landlord' });
  const adminToken = generateJwtToken({ id: adminId, email: `adm-${tag}@kosmo.test`, role: 'admin' });
  const tenantToken = generateJwtToken({ id: tenantId, email: `ten-${tag}@kosmo.test`, role: 'tenant' });

  // 1x1 transparent GIF binary buffer for image upload simulation
  const sampleGifBuffer = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  const samplePngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

  // Seed Users
  await pool.query(
    `INSERT INTO users (id, name, email, password, role, balance, totalRevenue) VALUES
     (?, 'Landlord Owner A', ?, ?, 'landlord', 0, 0),
     (?, 'Landlord Other B', ?, ?, 'landlord', 0, 0),
     (?, 'Admin System', ?, ?, 'admin', 0, 0),
     (?, 'Tenant User', ?, ?, 'tenant', 0, 0)`,
    [
      landlordAId, `lla-${tag}@kosmo.test`, passwordHash,
      landlordBId, `llb-${tag}@kosmo.test`, passwordHash,
      adminId, `adm-${tag}@kosmo.test`, passwordHash,
      tenantId, `ten-${tag}@kosmo.test`, passwordHash
    ]
  );

  // Seed Properties
  await pool.query(
    `INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId, image) VALUES
     (?, 'Villa Seminyak Prime', 'Badung', 'Jl. Petitenget No. 10', 4000000, 2, 0, ?, 'https://res.cloudinary.com/thumb-a.jpg'),
     (?, 'Canggu Living Studio', 'Badung', 'Jl. Batu Bolong No. 20', 3500000, 1, 0, ?, 'https://res.cloudinary.com/thumb-b.jpg')`,
    [propAId, landlordAId, propBId, landlordBId]
  );

  // Seed Rooms for Property A
  await pool.query(
    `INSERT INTO rooms (id, propertyId, roomNumber, floor, type, price, status) VALUES
     (?, ?, '101', 1, 'Deluxe', 4000000, 'available'),
     (?, ?, '102', 1, 'Standard', 3800000, 'available')`,
    [roomA1Id, propAId, roomA2Id, propAId]
  );

  // Seed Initial Photos
  await pool.query(
    `INSERT INTO property_photos (id, propertyId, roomId, url, publicId, category, caption, orderIndex) VALUES
     (?, ?, NULL, 'https://res.cloudinary.com/photo-a1.webp', 'kosmo_properties/photo-a1', 'thumbnail', 'Cover Fasad', 0),
     (?, ?, ?, 'https://res.cloudinary.com/photo-a2.webp', 'kosmo_properties/photo-a2', 'bedroom', 'Kamar 101 King Bed', 1),
     (?, ?, NULL, 'https://res.cloudinary.com/photo-a3.webp', 'kosmo_properties/photo-a3', 'pool', 'Kolam Renang Tropis', 2),
     (?, ?, NULL, 'https://res.cloudinary.com/photo-b1.webp', 'kosmo_properties/photo-b1', 'thumbnail', 'Villa B Fasad', 0)`,
    [
      photoA1Id, propAId,
      photoA2Id, propAId, roomA1Id,
      photoA3Id, propAId,
      photoB1Id, propBId
    ]
  );

  // Global Teardown
  t.after(async () => {
    server.close();
    try {
      await pool.query('DELETE FROM property_photos WHERE propertyId IN (?, ?)', [propAId, propBId]);
      await pool.query('DELETE FROM rooms WHERE propertyId IN (?, ?)', [propAId, propBId]);
      await pool.query('DELETE FROM properties WHERE id IN (?, ?)', [propAId, propBId]);
      await pool.query('DELETE FROM users WHERE id IN (?, ?, ?, ?)', [landlordAId, landlordBId, adminId, tenantId]);
    } catch (err) {
      console.warn('Gallery test teardown warning:', err);
    }
  });

  // =========================================================================
  // Section 1: Photo Listing & Query Filtering
  // =========================================================================
  await t.test('Section 1: GET /api/properties/:id/photos & Query Filtering', async (t1) => {
    await t1.test('1.1 returns all photos for property ordered by orderIndex ASC', async () => {
      const res = await fetch(`${baseUrl}/properties/${propAId}/photos`);
      assert.equal(res.status, 200);
      const photos = (await res.json()) as PropertyPhoto[];
      assert.ok(Array.isArray(photos));
      assert.equal(photos.length, 3);
      assert.equal(photos[0].id, photoA1Id);
      assert.equal(photos[0].orderIndex, 0);
      assert.equal(photos[1].id, photoA2Id);
      assert.equal(photos[1].orderIndex, 1);
      assert.equal(photos[2].id, photoA3Id);
      assert.equal(photos[2].orderIndex, 2);
    });

    await t1.test('1.2 filters photos by valid category tag', async () => {
      const res = await fetch(`${baseUrl}/properties/${propAId}/photos?category=bedroom`);
      assert.equal(res.status, 200);
      const photos = (await res.json()) as PropertyPhoto[];
      assert.equal(photos.length, 1);
      assert.equal(photos[0].id, photoA2Id);
      assert.equal(photos[0].category, 'bedroom');
    });

    await t1.test('1.3 returns empty array when category has no matching photos', async () => {
      const res = await fetch(`${baseUrl}/properties/${propAId}/photos?category=wifi_speedtest`);
      assert.equal(res.status, 200);
      const photos = (await res.json()) as PropertyPhoto[];
      assert.ok(Array.isArray(photos));
      assert.equal(photos.length, 0);
    });

    await t1.test('1.4 rejects invalid category filter with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/properties/${propAId}/photos?category=invalid_category`);
      assert.equal(res.status, 400);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('kategori') || body.message.includes('category'));
    });

    await t1.test('1.5 filters photos by roomId', async () => {
      const res = await fetch(`${baseUrl}/properties/${propAId}/photos?roomId=${roomA1Id}`);
      assert.equal(res.status, 200);
      const photos = (await res.json()) as PropertyPhoto[];
      assert.equal(photos.length, 1);
      assert.equal(photos[0].id, photoA2Id);
      assert.equal(photos[0].roomId, roomA1Id);
    });

    await t1.test('1.6 filters photos by combined category and roomId', async () => {
      const res = await fetch(`${baseUrl}/properties/${propAId}/photos?category=bedroom&roomId=${roomA1Id}`);
      assert.equal(res.status, 200);
      const photos = (await res.json()) as PropertyPhoto[];
      assert.equal(photos.length, 1);
      assert.equal(photos[0].id, photoA2Id);

      const resMismatch = await fetch(`${baseUrl}/properties/${propAId}/photos?category=pool&roomId=${roomA1Id}`);
      assert.equal(resMismatch.status, 200);
      const mismatchPhotos = (await resMismatch.json()) as PropertyPhoto[];
      assert.equal(mismatchPhotos.length, 0);
    });

    await t1.test('1.7 returns 404 when property does not exist', async () => {
      const res = await fetch(`${baseUrl}/properties/nonexistent-prop-${tag}/photos`);
      assert.equal(res.status, 404);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('tidak ditemukan'));
    });
  });

  // =========================================================================
  // Section 2: Categorized Photo Upload & Multi-File Ingestion
  // =========================================================================
  await t.test('Section 2: POST /api/properties/:id/photos & Multi-File Upload', async (t2) => {
    await t2.test('2.1 landlord owner successfully uploads a single categorized photo', async () => {
      const fd = new FormData();
      fd.append('images', new Blob([sampleGifBuffer], { type: 'image/gif' }), 'bathroom.gif');
      fd.append('category', 'bathroom');
      fd.append('caption', 'Kamar Mandi Marmer');
      fd.append('roomId', roomA1Id);

      const res = await fetch(`${baseUrl}/properties/${propAId}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${landlordAToken}` },
        body: fd
      });

      assert.equal(res.status, 201, 'Owner must receive 201 Created');
      const body = (await res.json()) as { message: string; photos: PropertyPhoto[] };
      assert.ok(Array.isArray(body.photos));
      assert.equal(body.photos.length, 1);
      assert.equal(body.photos[0].category, 'bathroom');
      assert.equal(body.photos[0].caption, 'Kamar Mandi Marmer');
      assert.equal(body.photos[0].roomId, roomA1Id);
      assert.ok(body.photos[0].url.startsWith('https://res.cloudinary.com/'));
      assert.equal(body.photos[0].orderIndex, 3, 'orderIndex must append sequentially after existing 3 photos');

      // Verify DB persistence
      const [rows] = await pool.query<PropertyPhotoRow[]>(
        'SELECT * FROM property_photos WHERE id = ?',
        [body.photos[0].id]
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].category, 'bathroom');
    });

    await t2.test('2.2 landlord owner uploads batch of 3 photos with auto-incrementing orderIndex', async () => {
      const fd = new FormData();
      fd.append('images', new Blob([samplePngBuffer], { type: 'image/png' }), 'kitchen1.png');
      fd.append('images', new Blob([samplePngBuffer], { type: 'image/png' }), 'kitchen2.png');
      fd.append('images', new Blob([samplePngBuffer], { type: 'image/png' }), 'kitchen3.png');
      fd.append('category', 'kitchen');

      const res = await fetch(`${baseUrl}/properties/${propAId}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${landlordAToken}` },
        body: fd
      });

      assert.equal(res.status, 201);
      const body = (await res.json()) as { message: string; photos: PropertyPhoto[] };
      assert.equal(body.photos.length, 3);
      assert.equal(body.photos[0].orderIndex, 4);
      assert.equal(body.photos[1].orderIndex, 5);
      assert.equal(body.photos[2].orderIndex, 6);
      assert.ok(body.photos.every((p) => p.category === 'kitchen'));
    });

    await t2.test('2.3 rejects request when zero files are uploaded', async () => {
      const fd = new FormData();
      fd.append('category', 'living_room');

      const res = await fetch(`${baseUrl}/properties/${propAId}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${landlordAToken}` },
        body: fd
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('file') || body.message.includes('gambar'));
    });

    await t2.test('2.4 rejects unsupported file MIME types (e.g. PDF)', async () => {
      const fd = new FormData();
      const pdfBuffer = Buffer.from('%PDF-1.4 sample fake pdf content', 'utf-8');
      fd.append('images', new Blob([pdfBuffer], { type: 'application/pdf' }), 'document.pdf');
      fd.append('category', 'exterior');

      const res = await fetch(`${baseUrl}/properties/${propAId}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${landlordAToken}` },
        body: fd
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('Format file tidak didukung') || body.message.includes('gambar'));
    });

    await t2.test('2.5 rejects upload when roomId belongs to another property', async () => {
      const fd = new FormData();
      fd.append('images', new Blob([sampleGifBuffer], { type: 'image/gif' }), 'room_mismatch.gif');
      fd.append('category', 'bedroom');
      fd.append('roomId', 'foreign-room-id-999');

      const res = await fetch(`${baseUrl}/properties/${propAId}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${landlordAToken}` },
        body: fd
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('Kamar tidak ditemukan') || body.message.includes('properti ini'));
    });

    await t2.test('2.6 enforces upper limit of 10 files per upload', async () => {
      const fd = new FormData();
      for (let i = 0; i < 11; i++) {
        fd.append('images', new Blob([sampleGifBuffer], { type: 'image/gif' }), `overflow_${i}.gif`);
      }
      fd.append('category', 'other');

      const res = await fetch(`${baseUrl}/properties/${propAId}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${landlordAToken}` },
        body: fd
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('10') || body.message.includes('maksimal') || body.message.includes('limit'));
    });
  });

  // =========================================================================
  // Section 3: PhotoCategory Enum Validation
  // =========================================================================
  await t.test('Section 3: PhotoCategory Enum Guardrails', async (t3) => {
    await t3.test('3.1 accepts all 9 canonical PhotoCategory enum values', async () => {
      for (const cat of VALID_PHOTO_CATEGORIES) {
        const fd = new FormData();
        fd.append('images', new Blob([sampleGifBuffer], { type: 'image/gif' }), `${cat}.gif`);
        fd.append('category', cat);

        const res = await fetch(`${baseUrl}/properties/${propAId}/photos`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${landlordAToken}` },
          body: fd
        });

        assert.equal(res.status, 201, `Category "${cat}" must be accepted`);
      }
    });

    await t3.test('3.2 rejects invalid category strings (e.g. "garage", "rooftop")', async () => {
      const invalidCats = ['garage', 'rooftop', 'RANDOM', ''];
      for (const badCat of invalidCats) {
        const fd = new FormData();
        fd.append('images', new Blob([sampleGifBuffer], { type: 'image/gif' }), 'bad.gif');
        fd.append('category', badCat);

        const res = await fetch(`${baseUrl}/properties/${propAId}/photos`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${landlordAToken}` },
          body: fd
        });

        assert.equal(res.status, 400, `Category "${badCat}" must be rejected with 400`);
      }
    });
  });

  // =========================================================================
  // Section 4: Atomic Reordering Lifecycle
  // =========================================================================
  await t.test('Section 4: PUT /api/properties/:id/photos/reorder & ACID Atomicity', async (t4) => {
    await t4.test('4.1 atomically reorders existing photos with verified orderIndex sequence', async () => {
      // Reorder [photoA3Id, photoA1Id, photoA2Id]
      const res = await fetch(`${baseUrl}/properties/${propAId}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordAToken}`
        },
        body: JSON.stringify({
          photoIds: [photoA3Id, photoA1Id, photoA2Id]
        })
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as { message: string; photos: PropertyPhoto[] };
      assert.ok(body.message.includes('berhasil') || body.message.includes('diperbarui'));

      // Verify DB order
      const [rows] = await pool.query<PropertyPhotoRow[]>(
        'SELECT id, orderIndex FROM property_photos WHERE propertyId = ? ORDER BY orderIndex ASC',
        [propAId]
      );
      assert.equal(rows[0].id, photoA3Id);
      assert.equal(rows[0].orderIndex, 0);
      assert.equal(rows[1].id, photoA1Id);
      assert.equal(rows[1].orderIndex, 1);
      assert.equal(rows[2].id, photoA2Id);
      assert.equal(rows[2].orderIndex, 2);
    });

    await t4.test('4.2 rolls back entire reorder when cross-property photo ID is injected', async () => {
      // Attempt to include photoB1Id (belongs to propBId) into propAId reorder
      const res = await fetch(`${baseUrl}/properties/${propAId}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordAToken}`
        },
        body: JSON.stringify({
          photoIds: [photoA1Id, photoB1Id, photoA3Id]
        })
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('tidak ditemukan pada properti ini'));

      // Verify DB atomicity: Property B photo remains untouched with orderIndex 0
      const [rowsB] = await pool.query<PropertyPhotoRow[]>(
        'SELECT id, orderIndex FROM property_photos WHERE id = ?',
        [photoB1Id]
      );
      assert.equal(rowsB[0].orderIndex, 0);
    });

    await t4.test('4.3 rolls back when nonexistent photo ID is passed', async () => {
      const res = await fetch(`${baseUrl}/properties/${propAId}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordAToken}`
        },
        body: JSON.stringify({
          photoIds: [photoA1Id, 'fabricated-photo-id-999']
        })
      });

      assert.equal(res.status, 400);
    });

    await t4.test('4.4 rejects payload with duplicate photo IDs', async () => {
      const res = await fetch(`${baseUrl}/properties/${propAId}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordAToken}`
        },
        body: JSON.stringify({
          photoIds: [photoA1Id, photoA1Id, photoA2Id]
        })
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('duplikasi') || body.message.includes('duplicate'));
    });

    await t4.test('4.5 rejects empty or non-array photoIds payload', async () => {
      const resEmpty = await fetch(`${baseUrl}/properties/${propAId}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordAToken}`
        },
        body: JSON.stringify({ photoIds: [] })
      });
      assert.equal(resEmpty.status, 400);

      const resInvalid = await fetch(`${baseUrl}/properties/${propAId}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordAToken}`
        },
        body: JSON.stringify({ photoIds: 'not-an-array' })
      });
      assert.equal(resInvalid.status, 400);
    });
  });

  // =========================================================================
  // Section 5: Deletion & Authorization RBAC Matrix
  // =========================================================================
  await t.test('Section 5: DELETE /api/properties/:id/photos/:photoId & RBAC', async (t5) => {
    // Insert fresh disposable photo for deletion tests
    const disposablePhotoId = `photo-disp-${tag}`;
    await pool.query(
      `INSERT INTO property_photos (id, propertyId, roomId, url, publicId, category, caption, orderIndex)
       VALUES (?, ?, NULL, 'https://res.cloudinary.com/disp.webp', 'kosmo_properties/disp', 'exterior', 'Temporary Photo', 99)`,
      [disposablePhotoId, propAId]
    );

    await t5.test('5.1 rejects unauthenticated deletion with HTTP 401', async () => {
      const res = await fetch(`${baseUrl}/properties/${propAId}/photos/${disposablePhotoId}`, {
        method: 'DELETE'
      });
      assert.equal(res.status, 401);
    });

    await t5.test('5.2 rejects tenant deletion attempt with HTTP 403', async () => {
      const res = await fetch(`${baseUrl}/properties/${propAId}/photos/${disposablePhotoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tenantToken}` }
      });
      assert.equal(res.status, 403);
    });

    await t5.test('5.3 rejects non-owner landlord deletion attempt with HTTP 403', async () => {
      const res = await fetch(`${baseUrl}/properties/${propAId}/photos/${disposablePhotoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${landlordBToken}` }
      });
      assert.equal(res.status, 403);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('bukan pemilik properti') || body.message.includes('Akses ditolak'));
    });

    await t5.test('5.4 permits owner landlord to delete property photo', async () => {
      const res = await fetch(`${baseUrl}/properties/${propAId}/photos/${disposablePhotoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${landlordAToken}` }
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('berhasil dihapus') || body.message.includes('Foto berhasil dihapus'));

      // Verify DB deletion
      const [rows] = await pool.query<PropertyPhotoRow[]>(
        'SELECT * FROM property_photos WHERE id = ?',
        [disposablePhotoId]
      );
      assert.equal(rows.length, 0);
    });

    await t5.test('5.5 permits system admin to delete photo on any property', async () => {
      const adminDeletePhotoId = `photo-adm-del-${tag}`;
      await pool.query(
        `INSERT INTO property_photos (id, propertyId, roomId, url, publicId, category, caption, orderIndex)
         VALUES (?, ?, NULL, 'https://res.cloudinary.com/adm-del.webp', 'kosmo_properties/adm-del', 'other', 'Admin Delete Target', 98)`,
        [adminDeletePhotoId, propAId]
      );

      const res = await fetch(`${baseUrl}/properties/${propAId}/photos/${adminDeletePhotoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(res.status, 200);

      const [rows] = await pool.query<PropertyPhotoRow[]>(
        'SELECT * FROM property_photos WHERE id = ?',
        [adminDeletePhotoId]
      );
      assert.equal(rows.length, 0);
    });

    await t5.test('5.6 returns 404 when deleting nonexistent photo', async () => {
      const res = await fetch(`${baseUrl}/properties/${propAId}/photos/nonexistent-photo-id`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${landlordAToken}` }
      });
      assert.equal(res.status, 404);
    });

    await t5.test('5.7 permits deletion via direct alias /api/photos/:photoId', async () => {
      const aliasDeletePhotoId = `photo-alias-del-${tag}`;
      await pool.query(
        `INSERT INTO property_photos (id, propertyId, roomId, url, publicId, category, caption, orderIndex)
         VALUES (?, ?, NULL, 'https://res.cloudinary.com/alias-del.webp', 'kosmo_properties/alias-del', 'other', 'Alias Delete Target', 97)`,
        [aliasDeletePhotoId, propAId]
      );

      const res = await fetch(`${baseUrl}/photos/${aliasDeletePhotoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${landlordAToken}` }
      });
      assert.equal(res.status, 200);

      const [rows] = await pool.query<PropertyPhotoRow[]>(
        'SELECT * FROM property_photos WHERE id = ?',
        [aliasDeletePhotoId]
      );
      assert.equal(rows.length, 0);
    });
  });

  // =========================================================================
  // Section 6: Mock Cloudinary Stream & Network Isolation Guard
  // =========================================================================
  await t.test('Section 6: Mock Cloudinary Stream & Zero Network Outbound Calls', async (t6) => {
    await t6.test('6.1 uploadImageStream provides deterministic mock in test environment', async () => {
      const res = await uploadImageStream(sampleGifBuffer, 'kosmo_properties');
      assert.ok(res, 'Upload result must be returned');
      assert.ok(res.secure_url.startsWith('https://res.cloudinary.com/kosmo-bali/image/upload/v1/kosmo_properties/prop_'));
      assert.ok(res.public_id.startsWith('kosmo_properties/prop_'));
    });

    await t6.test('6.2 rejects empty or zero-byte binary buffer', async () => {
      const emptyBuf = Buffer.alloc(0);
      await assert.rejects(
        async () => {
          await uploadImageStream(emptyBuf, 'kosmo_properties');
        },
        /cannot be empty/i
      );
    });

    await t6.test('6.3 deleteCloudinaryImage safely resolves in test environment without network calls', async () => {
      const res = await deleteCloudinaryImage('kosmo_properties/sample_mock');
      assert.equal(res.result, 'ok');

      const resEmpty = await deleteCloudinaryImage('');
      assert.equal(resEmpty.result, 'not_found');
    });
  });

  // =========================================================================
  // Section 7: Express Router Registration Verification
  // =========================================================================
  await t.test('Section 7: Express Router Endpoint Registration', () => {
    interface RouterLayer {
      route?: {
        path: string;
        methods: Record<string, boolean>;
      };
    }

    const routePaths = (router.stack as unknown as RouterLayer[])
      .filter((layer): layer is RouterLayer & { route: { path: string; methods: Record<string, boolean> } } => Boolean(layer.route))
      .map((layer) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods)
      }));

    const expectedEndpoints = [
      { path: '/properties/:id/photos', method: 'get' },
      { path: '/properties/:id/photos', method: 'post' },
      { path: '/properties/:id/photos/reorder', method: 'put' },
      { path: '/properties/:id/photos/:photoId', method: 'delete' },
      { path: '/photos/:photoId', method: 'delete' }
    ];

    for (const exp of expectedEndpoints) {
      const match = routePaths.find(
        (r) => r.path === exp.path && r.methods.includes(exp.method)
      );
      assert.ok(
        match,
        `Expected endpoint [${exp.method.toUpperCase()}] ${exp.path} to be registered in backend router`
      );
    }
  });
});
