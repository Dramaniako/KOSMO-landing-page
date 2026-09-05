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
  type PhotoCategory
} from '../backend/types/index';
import {
  pool,
  ensureDbReady
} from '../backend/db';
import { generateJwtToken } from '../backend/middleware/auth';
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

test('Milestone 3 Empirical Adversarial Stress & Failure Mode Suite', async (t) => {
  await ensureDbReady();

  // Express server setup on ephemeral port
  const app = express();
  app.use(bodyParser.json({ limit: '15mb' }));
  app.use(bodyParser.urlencoded({ limit: '15mb', extended: true }));
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

  // Identifiers for isolation
  const tag = crypto.randomBytes(4).toString('hex');
  const landlordOwnerId = `adv-ll-owner-${tag}`;
  const landlordOtherId = `adv-ll-other-${tag}`;
  const tenantId = `adv-tenant-${tag}`;
  const adminId = `adv-admin-${tag}`;

  const testPassword = 'Password123!';
  const passwordHash = bcrypt.hashSync(testPassword, 10);

  const prop1Id = `adv-prop-1-${tag}`;
  const prop2Id = `adv-prop-2-${tag}`;

  const photo1Id = `adv-p1-${tag}`;
  const photo2Id = `adv-p2-${tag}`;
  const photo3Id = `adv-p3-${tag}`;
  const photoForeignId = `adv-pForeign-${tag}`;

  const ownerToken = generateJwtToken({ id: landlordOwnerId, email: `owner-${tag}@kosmo.test`, role: 'landlord' });
  const otherToken = generateJwtToken({ id: landlordOtherId, email: `other-${tag}@kosmo.test`, role: 'landlord' });
  const tenantToken = generateJwtToken({ id: tenantId, email: `tenant-${tag}@kosmo.test`, role: 'tenant' });
  const adminToken = generateJwtToken({ id: adminId, email: `admin-${tag}@kosmo.test`, role: 'admin' });

  // Binary test buffers
  const sample1x1Png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const sample1x1Gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

  // Seed test users
  await pool.query(
    `INSERT INTO users (id, name, email, password, role, balance, totalRevenue) VALUES
     (?, 'Adv Landlord Owner', ?, ?, 'landlord', 0, 0),
     (?, 'Adv Landlord Other', ?, ?, 'landlord', 0, 0),
     (?, 'Adv Tenant User', ?, ?, 'tenant', 0, 0),
     (?, 'Adv Admin User', ?, ?, 'admin', 0, 0)`,
    [
      landlordOwnerId, `owner-${tag}@kosmo.test`, passwordHash,
      landlordOtherId, `other-${tag}@kosmo.test`, passwordHash,
      tenantId, `tenant-${tag}@kosmo.test`, passwordHash,
      adminId, `admin-${tag}@kosmo.test`, passwordHash
    ]
  );

  // Seed test properties
  await pool.query(
    `INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId, image) VALUES
     (?, 'Adv Test Villa 1', 'Badung', 'Jl. Sunset Road 1', 5000000, 2, 0, ?, 'https://res.cloudinary.com/adv1.webp'),
     (?, 'Adv Test Villa 2', 'Denpasar', 'Jl. Hayam Wuruk 2', 4000000, 1, 0, ?, 'https://res.cloudinary.com/adv2.webp')`,
    [prop1Id, landlordOwnerId, prop2Id, landlordOtherId]
  );

  // Seed initial photos
  await pool.query(
    `INSERT INTO property_photos (id, propertyId, roomId, url, publicId, category, caption, orderIndex) VALUES
     (?, ?, NULL, 'https://res.cloudinary.com/adv-p1.webp', 'kosmo_properties/adv-p1', 'thumbnail', 'P1', 0),
     (?, ?, NULL, 'https://res.cloudinary.com/adv-p2.webp', 'kosmo_properties/adv-p2', 'bedroom', 'P2', 1),
     (?, ?, NULL, 'https://res.cloudinary.com/adv-p3.webp', 'kosmo_properties/adv-p3', 'pool', 'P3', 2),
     (?, ?, NULL, 'https://res.cloudinary.com/adv-foreign.webp', 'kosmo_properties/adv-foreign', 'thumbnail', 'Foreign', 0)`,
    [
      photo1Id, prop1Id,
      photo2Id, prop1Id,
      photo3Id, prop1Id,
      photoForeignId, prop2Id
    ]
  );

  t.after(async () => {
    server.close();
    try {
      await pool.query('DELETE FROM property_photos WHERE propertyId IN (?, ?)', [prop1Id, prop2Id]);
      await pool.query('DELETE FROM properties WHERE id IN (?, ?)', [prop1Id, prop2Id]);
      await pool.query('DELETE FROM users WHERE id IN (?, ?, ?, ?)', [landlordOwnerId, landlordOtherId, tenantId, adminId]);
    } catch (err) {
      console.warn('Adversarial teardown error:', err);
    }
  });

  // =========================================================================
  // Challenge 1: Upload Limits (>5MB file size, >10 file count)
  // =========================================================================
  await t.test('Adversarial Challenge 1: Upload Limits Stress & Rejection', async (t1) => {
    await t1.test('1.1 Rejects oversized file (> 5MB, e.g. 5.5MB) with HTTP 400 and explicit size message', async () => {
      const oversizedBuffer = Buffer.alloc(5.5 * 1024 * 1024, 0x61); // 5.5MB of 'a'
      const fd = new FormData();
      fd.append('images', new Blob([oversizedBuffer], { type: 'image/jpeg' }), 'oversized.jpg');
      fd.append('category', 'bedroom');

      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: fd
      });

      assert.equal(res.status, 400, 'Oversized file upload must be rejected with HTTP 400 Bad Request');
      const body = (await res.json()) as { message: string };
      assert.ok(
        body.message.includes('5MB') || body.message.includes('Ukuran file melebihi batas'),
        `Expected size limit message, got: ${body.message}`
      );
    });

    await t1.test('1.2 Boundary test: 5MB + 100 bytes is rejected with HTTP 400', async () => {
      const boundaryOverBuffer = Buffer.alloc(5 * 1024 * 1024 + 100, 0x61);
      const fd = new FormData();
      fd.append('images', new Blob([boundaryOverBuffer], { type: 'image/jpeg' }), 'boundary_over.jpg');
      fd.append('category', 'bedroom');

      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: fd
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('5MB') || body.message.includes('Ukuran file melebihi batas'));
    });

    await t1.test('1.3 Rejects upload exceeding 10 files in images field (e.g. 11 files) with HTTP 400', async () => {
      const fd = new FormData();
      for (let i = 0; i < 11; i++) {
        fd.append('images', new Blob([sample1x1Png], { type: 'image/png' }), `img_${i}.png`);
      }
      fd.append('category', 'exterior');

      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: fd
      });

      assert.equal(res.status, 400, 'Exceeding 10 files must be rejected with HTTP 400');
      const body = (await res.json()) as { message: string };
      assert.ok(
        body.message.includes('10') || body.message.includes('melebihi batas maksimum'),
        `Expected file count limit message, got: ${body.message}`
      );
    });

    await t1.test('1.4 Rejects multi-field count overflow: 6 files in images + 6 files in image (total 12) with HTTP 400', async () => {
      const fd = new FormData();
      for (let i = 0; i < 6; i++) {
        fd.append('images', new Blob([sample1x1Png], { type: 'image/png' }), `img_a_${i}.png`);
      }
      for (let j = 0; j < 6; j++) {
        fd.append('image', new Blob([sample1x1Gif], { type: 'image/gif' }), `img_b_${j}.gif`);
      }
      fd.append('category', 'kitchen');

      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: fd
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('melebihi batas') || body.message.includes('10'));
    });

    await t1.test('1.5 Rejects unexpected multipart field name (e.g. "documents") with HTTP 400 without 500 crash', async () => {
      const fd = new FormData();
      fd.append('documents', new Blob([sample1x1Png], { type: 'image/png' }), 'doc.png');
      fd.append('category', 'kitchen');

      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: fd
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('field tidak valid') || body.message.includes('file'));
    });
  });

  // =========================================================================
  // Challenge 2: MIME Type Validation & Dangerous File Ingestion
  // =========================================================================
  await t.test('Adversarial Challenge 2: MIME Validation & Dangerous File Types', async (t2) => {
    await t2.test('2.1 Rejects Windows executable (.exe) with application/x-msdownload', async () => {
      const exeBuffer = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00');
      const fd = new FormData();
      fd.append('images', new Blob([exeBuffer], { type: 'application/x-msdownload' }), 'malware.exe');
      fd.append('category', 'exterior');

      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: fd
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('Format file tidak didukung') || body.message.includes('gambar'));
    });

    await t2.test('2.2 Rejects Shell script (.sh) with application/x-sh or text/x-shellscript', async () => {
      const shBuffer = Buffer.from('#!/bin/bash\nrm -rf /\n');
      const fd = new FormData();
      fd.append('images', new Blob([shBuffer], { type: 'application/x-sh' }), 'attack.sh');
      fd.append('category', 'exterior');

      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: fd
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('Format file tidak didukung') || body.message.includes('gambar'));
    });

    await t2.test('2.3 Rejects SVG image/svg+xml (XSS/SSRF vector)', async () => {
      const svgBuffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert("xss")</script></svg>');
      const fd = new FormData();
      fd.append('images', new Blob([svgBuffer], { type: 'image/svg+xml' }), 'vector.svg');
      fd.append('category', 'exterior');

      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: fd
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('Format file tidak didukung') || body.message.includes('gambar'));
    });

    await t2.test('2.4 Rejects plain text file (.txt) with text/plain', async () => {
      const txtBuffer = Buffer.from('This is a text file, not a property photo.');
      const fd = new FormData();
      fd.append('images', new Blob([txtBuffer], { type: 'text/plain' }), 'notes.txt');
      fd.append('category', 'exterior');

      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: fd
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('Format file tidak didukung') || body.message.includes('gambar'));
    });

    await t2.test('2.5 Rejects HTML file (.html) with text/html', async () => {
      const htmlBuffer = Buffer.from('<html><body><h1>Phishing Page</h1></body></html>');
      const fd = new FormData();
      fd.append('images', new Blob([htmlBuffer], { type: 'text/html' }), 'page.html');
      fd.append('category', 'exterior');

      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: fd
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('Format file tidak didukung') || body.message.includes('gambar'));
    });

    await t2.test('2.6 Rejects generic octet stream binary with application/octet-stream', async () => {
      const binBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff]);
      const fd = new FormData();
      fd.append('images', new Blob([binBuffer], { type: 'application/octet-stream' }), 'raw.bin');
      fd.append('category', 'exterior');

      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: fd
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('Format file tidak didukung') || body.message.includes('gambar'));
    });

    await t2.test('2.7 Rejects batch containing one valid PNG and one invalid .exe file (atomic rejection)', async () => {
      const fd = new FormData();
      fd.append('images', new Blob([sample1x1Png], { type: 'image/png' }), 'valid.png');
      fd.append('images', new Blob([Buffer.from('echo 1')], { type: 'application/x-sh' }), 'malicious.sh');
      fd.append('category', 'exterior');

      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: fd
      });

      assert.equal(res.status, 400);
      // Ensure nothing was partially uploaded or inserted into DB
      const [rows] = await pool.query<PropertyPhotoRow[]>(
        'SELECT * FROM property_photos WHERE propertyId = ? AND category = "exterior"',
        [prop1Id]
      );
      assert.equal(rows.length, 0, 'No photos should be inserted when any file in batch fails validation');
    });

    await t2.test('2.8 Rejects zero-byte empty file with image MIME type', async () => {
      const zeroBuffer = Buffer.alloc(0);
      const fd = new FormData();
      fd.append('images', new Blob([zeroBuffer], { type: 'image/jpeg' }), 'empty.jpg');
      fd.append('category', 'exterior');

      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
        body: fd
      });

      // The upload stream rejects empty buffers
      assert.ok(res.status === 400 || res.status === 500);
    });
  });

  // =========================================================================
  // Challenge 3: Atomic Reordering Malicious & Edge Case Payloads
  // =========================================================================
  await t.test('Adversarial Challenge 3: Atomic Reordering ACID Isolation & Malicious Payloads', async (t3) => {
    await t3.test('3.1 Rejects alien photo ID from another property and preserves DB orderIndex integrity', async () => {
      // Current order of prop1: photo1Id (0), photo2Id (1), photo3Id (2)
      // Inject photoForeignId belonging to prop2Id
      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`
        },
        body: JSON.stringify({
          photoIds: [photo2Id, photoForeignId, photo1Id]
        })
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as { message: string };
      assert.ok(
        body.message.includes('tidak ditemukan pada properti ini') || body.message.includes(photoForeignId),
        `Expected alien ID error, got: ${body.message}`
      );

      // Verify prop1 photos were NOT reordered partially
      const [rows1] = await pool.query<PropertyPhotoRow[]>(
        'SELECT id, orderIndex FROM property_photos WHERE propertyId = ? ORDER BY orderIndex ASC',
        [prop1Id]
      );
      assert.equal(rows1[0].id, photo1Id);
      assert.equal(rows1[0].orderIndex, 0);
      assert.equal(rows1[1].id, photo2Id);
      assert.equal(rows1[1].orderIndex, 1);
      assert.equal(rows1[2].id, photo3Id);
      assert.equal(rows1[2].orderIndex, 2);

      // Verify foreign photo orderIndex remained untouched
      const [foreignRows] = await pool.query<PropertyPhotoRow[]>(
        'SELECT id, orderIndex FROM property_photos WHERE id = ?',
        [photoForeignId]
      );
      assert.equal(foreignRows[0].orderIndex, 0);
    });

    await t3.test('3.2 Rejects nonexistent / fabricated photo ID', async () => {
      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`
        },
        body: JSON.stringify({
          photoIds: [photo1Id, 'completely-fake-id-000']
        })
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('tidak ditemukan pada properti ini'));
    });

    await t3.test('3.3 Rejects duplicate photo IDs (e.g. [photo1, photo1])', async () => {
      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`
        },
        body: JSON.stringify({
          photoIds: [photo1Id, photo1Id, photo2Id]
        })
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('duplikasi') || body.message.includes('duplicate'));
    });

    await t3.test('3.4 Rejects empty array photoIds: []', async () => {
      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`
        },
        body: JSON.stringify({
          photoIds: []
        })
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('minimal 1 item') || body.message.includes('photoIds'));
    });

    await t3.test('3.5 Rejects array with whitespace-only or empty strings', async () => {
      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`
        },
        body: JSON.stringify({
          photoIds: [photo1Id, '   ', photo2Id]
        })
      });

      assert.equal(res.status, 400);
    });

    await t3.test('3.6 Rejects non-array photoIds (e.g. number, object, null, string)', async () => {
      const invalidPayloads = [
        { photoIds: 12345 },
        { photoIds: { '0': photo1Id } },
        { photoIds: null },
        { photoIds: photo1Id }
      ];

      for (const payload of invalidPayloads) {
        const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos/reorder`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ownerToken}`
          },
          body: JSON.stringify(payload)
        });

        assert.equal(res.status, 400, `Payload ${JSON.stringify(payload)} must be rejected with 400`);
      }
    });

    await t3.test('3.7 Partial reorder properly offsets unspecified photos deterministically', async () => {
      // Suppose we only submit [photo3Id].
      // photo3Id becomes orderIndex 0.
      // photo1Id and photo2Id must become orderIndex 1 and 2 respectively.
      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ownerToken}`
        },
        body: JSON.stringify({
          photoIds: [photo3Id]
        })
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as { message: string; photos: PropertyPhoto[] };
      assert.equal(body.photos.length, 3);
      assert.equal(body.photos[0].id, photo3Id);
      assert.equal(body.photos[0].orderIndex, 0);
      assert.equal(body.photos[1].id, photo1Id);
      assert.equal(body.photos[1].orderIndex, 1);
      assert.equal(body.photos[2].id, photo2Id);
      assert.equal(body.photos[2].orderIndex, 2);
    });
  });

  // =========================================================================
  // Challenge 4: Cross-Property & Cross-Tenant Deletion Isolation
  // =========================================================================
  await t.test('Adversarial Challenge 4: Deletion Boundaries & Cross-Property Attacks', async (t4) => {
    await t4.test('4.1 Rejects attempt to delete photo using mismatched property in URL /properties/:otherProp/photos/:photo', async () => {
      // photo1Id belongs to prop1Id. Attempt to delete it via /properties/prop2Id/photos/photo1Id
      const res = await fetch(`${baseUrl}/properties/${prop2Id}/photos/${photo1Id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${otherToken}` } // landlord of prop2
      });

      // Should return 404 (photo not found on property 2)
      assert.equal(res.status, 404);
      const body = (await res.json()) as { message: string };
      assert.ok(body.message.includes('tidak ditemukan'));

      // Confirm photo1Id is still in DB
      const [rows] = await pool.query<PropertyPhotoRow[]>(
        'SELECT * FROM property_photos WHERE id = ?',
        [photo1Id]
      );
      assert.equal(rows.length, 1, 'Photo must not be deleted under mismatched property route');
    });

    await t4.test('4.2 Rejects tenant attempt to delete photo with HTTP 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos/${photo1Id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tenantToken}` }
      });
      assert.equal(res.status, 403);
    });

    await t4.test('4.3 Rejects non-owner landlord attempt to delete photo with HTTP 403 Forbidden', async () => {
      const res = await fetch(`${baseUrl}/properties/${prop1Id}/photos/${photo1Id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${otherToken}` }
      });
      assert.equal(res.status, 403);
    });
  });

  // =========================================================================
  // Challenge 5: Concurrent Reorder Race Stress
  // =========================================================================
  await t.test('Adversarial Challenge 5: High Concurrency Reorder Stress', async (t5) => {
    await t5.test('5.1 Concurrent reordering requests do not deadlock and maintain consistent orderIndex', async () => {
      const orders = [
        [photo1Id, photo2Id, photo3Id],
        [photo3Id, photo2Id, photo1Id],
        [photo2Id, photo1Id, photo3Id],
        [photo1Id, photo3Id, photo2Id]
      ];

      const promises = orders.map((order) =>
        fetch(`${baseUrl}/properties/${prop1Id}/photos/reorder`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ownerToken}`
          },
          body: JSON.stringify({ photoIds: order })
        })
      );

      const results = await Promise.all(promises);
      for (const res of results) {
        assert.equal(res.status, 200, `Concurrent reorder returned status ${res.status}`);
      }

      // Verify that after all concurrent requests complete, orderIndex has NO duplicates and is strictly 0, 1, 2
      const [finalRows] = await pool.query<PropertyPhotoRow[]>(
        'SELECT id, orderIndex FROM property_photos WHERE propertyId = ? ORDER BY orderIndex ASC',
        [prop1Id]
      );
      assert.equal(finalRows.length, 3);
      const indices = finalRows.map((r) => Number(r.orderIndex));
      assert.deepEqual(indices, [0, 1, 2], 'Indices must be strictly contiguous 0, 1, 2 without duplicates or race corruption');
    });
  });
});
