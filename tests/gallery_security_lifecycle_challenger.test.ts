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
import { deleteCloudinaryImage } from '../backend/services/cloudinary';
import type { RowDataPacket } from 'mysql2/promise';

interface PropertyRow extends RowDataPacket {
  id: string;
  image: string;
  ownerId: string;
}

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

test('Milestone 3 Empirical Security & Lifecycle Challenger Suite', async (t) => {
  await ensureDbReady();

  // 1. Ephemeral HTTP server
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

  // 2. Setup Fixtures
  const tag = crypto.randomBytes(4).toString('hex');
  const landlordAId = `user-sec-lla-${tag}`;
  const landlordBId = `user-sec-llb-${tag}`;
  const adminId = `user-sec-adm-${tag}`;
  const tenantId = `user-sec-ten-${tag}`;
  const testPassword = 'Password123!';
  const passwordHash = bcrypt.hashSync(testPassword, 10);

  const propAId = `prop-sec-a-${tag}`;
  const propBId = `prop-sec-b-${tag}`;

  const landlordAToken = generateJwtToken({ id: landlordAId, email: `sec-lla-${tag}@kosmo.test`, role: 'landlord' });
  const landlordBToken = generateJwtToken({ id: landlordBId, email: `sec-llb-${tag}@kosmo.test`, role: 'landlord' });
  const adminToken = generateJwtToken({ id: adminId, email: `sec-adm-${tag}@kosmo.test`, role: 'admin' });
  const tenantToken = generateJwtToken({ id: tenantId, email: `sec-ten-${tag}@kosmo.test`, role: 'tenant' });
  const malformedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload.invalidsignature';

  const sampleGifBuffer = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

  // Seed Users
  await pool.query(
    `INSERT INTO users (id, name, email, password, role, balance, totalRevenue) VALUES
     (?, 'Landlord A Owner', ?, ?, 'landlord', 0, 0),
     (?, 'Landlord B Other', ?, ?, 'landlord', 0, 0),
     (?, 'Admin User', ?, ?, 'admin', 0, 0),
     (?, 'Tenant User', ?, ?, 'tenant', 0, 0)`,
    [
      landlordAId, `sec-lla-${tag}@kosmo.test`, passwordHash,
      landlordBId, `sec-llb-${tag}@kosmo.test`, passwordHash,
      adminId, `sec-adm-${tag}@kosmo.test`, passwordHash,
      tenantId, `sec-ten-${tag}@kosmo.test`, passwordHash
    ]
  );

  // Seed Properties
  const initialCoverA = `https://res.cloudinary.com/kosmo/cover-initial-a-${tag}.jpg`;
  const initialCoverB = `https://res.cloudinary.com/kosmo/cover-initial-b-${tag}.jpg`;
  await pool.query(
    `INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId, image) VALUES
     (?, 'Villa Security Test A', 'Badung', 'Jl. Sunset No. 1', 5000000, 2, 0, ?, ?),
     (?, 'Villa Security Test B', 'Badung', 'Jl. Legian No. 2', 4500000, 1, 0, ?, ?)`,
    [propAId, landlordAId, initialCoverA, propBId, landlordBId, initialCoverB]
  );

  // Seed initial photos for Property A
  const photoA1Id = `p-a1-${tag}`;
  const photoA2Id = `p-a2-${tag}`;
  const photoA3Id = `p-a3-${tag}`;
  const photoA1Url = `https://res.cloudinary.com/kosmo/p-a1-${tag}.webp`;
  const photoA2Url = `https://res.cloudinary.com/kosmo/p-a2-${tag}.webp`;
  const photoA3Url = `https://res.cloudinary.com/kosmo/p-a3-${tag}.webp`;

  await pool.query(
    `INSERT INTO property_photos (id, propertyId, roomId, url, publicId, category, caption, orderIndex) VALUES
     (?, ?, NULL, ?, ?, 'thumbnail', 'Cover A1', 0),
     (?, ?, NULL, ?, ?, 'bedroom', 'Bedroom A2', 1),
     (?, ?, NULL, ?, ?, 'pool', 'Pool A3', 2)`,
    [
      photoA1Id, propAId, photoA1Url, `kosmo/p-a1-${tag}`,
      photoA2Id, propAId, photoA2Url, `kosmo/p-a2-${tag}`,
      photoA3Id, propAId, photoA3Url, `kosmo/p-a3-${tag}`
    ]
  );

  // Synchronize Property A image with photoA1Url
  await pool.query('UPDATE properties SET image = ? WHERE id = ?', [photoA1Url, propAId]);

  // Teardown
  t.after(async () => {
    server.close();
    try {
      await pool.query('DELETE FROM property_photos WHERE propertyId IN (?, ?)', [propAId, propBId]);
      await pool.query('DELETE FROM properties WHERE id IN (?, ?)', [propAId, propBId]);
      await pool.query('DELETE FROM users WHERE id IN (?, ?, ?, ?)', [landlordAId, landlordBId, adminId, tenantId]);
    } catch (err) {
      console.warn('Challenger test teardown warning:', err);
    }
  });

  // Track 1: Adversarial RBAC Matrix
  await t.test('Track 1: Adversarial RBAC Security Matrix', async (t1) => {
    // 1.1 POST /properties/:id/photos
    await t1.test('1.1 POST /photos RBAC enforcement', async () => {
      const makeUploadFormData = () => {
        const fd = new FormData();
        fd.append('images', new Blob([sampleGifBuffer], { type: 'image/gif' }), 'test.gif');
        fd.append('category', 'living_room');
        return fd;
      };

      const resUnauth = await fetch(`${baseUrl}/properties/${propAId}/photos`, {
        method: 'POST',
        body: makeUploadFormData()
      });
      assert.equal(resUnauth.status, 401, 'Unauthenticated upload must return 401');

      const resMalformed = await fetch(`${baseUrl}/properties/${propAId}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${malformedToken}` },
        body: makeUploadFormData()
      });
      assert.equal(resMalformed.status, 403, 'Malformed token must return 403');

      const resTenant = await fetch(`${baseUrl}/properties/${propAId}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tenantToken}` },
        body: makeUploadFormData()
      });
      assert.equal(resTenant.status, 403, 'Tenant attempting upload must return 403');

      const resLandlordB = await fetch(`${baseUrl}/properties/${propAId}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${landlordBToken}` },
        body: makeUploadFormData()
      });
      assert.equal(resLandlordB.status, 403, 'Non-owner landlord attempting upload must return 403');

      const resLandlordA = await fetch(`${baseUrl}/properties/${propAId}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${landlordAToken}` },
        body: makeUploadFormData()
      });
      assert.equal(resLandlordA.status, 201, 'Owner landlord upload must return 201');

      const resAdmin = await fetch(`${baseUrl}/properties/${propAId}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: makeUploadFormData()
      });
      assert.equal(resAdmin.status, 201, 'Admin upload across any property must return 201');
    });

    // 1.2 PUT /properties/:id/photos/reorder
    await t1.test('1.2 PUT /photos/reorder RBAC enforcement', async () => {
      const payload = { photoIds: [photoA2Id, photoA1Id] };

      const resUnauth = await fetch(`${baseUrl}/properties/${propAId}/photos/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.equal(resUnauth.status, 401, 'Unauthenticated reorder must return 401');

      const resMalformed = await fetch(`${baseUrl}/properties/${propAId}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${malformedToken}`
        },
        body: JSON.stringify(payload)
      });
      assert.equal(resMalformed.status, 403, 'Malformed token reorder must return 403');

      const resTenant = await fetch(`${baseUrl}/properties/${propAId}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantToken}`
        },
        body: JSON.stringify(payload)
      });
      assert.equal(resTenant.status, 403, 'Tenant attempting reorder must return 403');

      const resLandlordB = await fetch(`${baseUrl}/properties/${propAId}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordBToken}`
        },
        body: JSON.stringify(payload)
      });
      assert.equal(resLandlordB.status, 403, 'Non-owner landlord reorder must return 403');

      const resLandlordA = await fetch(`${baseUrl}/properties/${propAId}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${landlordAToken}`
        },
        body: JSON.stringify(payload)
      });
      assert.equal(resLandlordA.status, 200, 'Owner landlord reorder must return 200');

      const resAdmin = await fetch(`${baseUrl}/properties/${propAId}/photos/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ photoIds: [photoA1Id, photoA2Id] })
      });
      assert.equal(resAdmin.status, 200, 'Admin reorder across any property must return 200');
    });

    // 1.3 DELETE /properties/:id/photos/:photoId (Nested endpoint)
    await t1.test('1.3 DELETE /properties/:id/photos/:photoId RBAC enforcement', async () => {
      const tempPhotoId = `p-temp-${tag}`;
      await pool.query(
        `INSERT INTO property_photos (id, propertyId, roomId, url, publicId, category, caption, orderIndex)
         VALUES (?, ?, NULL, 'https://res.cloudinary.com/temp.webp', 'kosmo/temp', 'other', 'Temp', 50)`,
        [tempPhotoId, propAId]
      );

      const resUnauth = await fetch(`${baseUrl}/properties/${propAId}/photos/${tempPhotoId}`, {
        method: 'DELETE'
      });
      assert.equal(resUnauth.status, 401, 'Unauthenticated delete must return 401');

      const resMalformed = await fetch(`${baseUrl}/properties/${propAId}/photos/${tempPhotoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${malformedToken}` }
      });
      assert.equal(resMalformed.status, 403, 'Malformed token delete must return 403');

      const resTenant = await fetch(`${baseUrl}/properties/${propAId}/photos/${tempPhotoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tenantToken}` }
      });
      assert.equal(resTenant.status, 403, 'Tenant attempting delete must return 403');

      const resLandlordB = await fetch(`${baseUrl}/properties/${propAId}/photos/${tempPhotoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${landlordBToken}` }
      });
      assert.equal(resLandlordB.status, 403, 'Non-owner landlord delete must return 403');

      const resLandlordA = await fetch(`${baseUrl}/properties/${propAId}/photos/${tempPhotoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${landlordAToken}` }
      });
      assert.equal(resLandlordA.status, 200, 'Owner landlord delete must return 200');

      const tempPhotoAdminId = `p-temp-adm-${tag}`;
      await pool.query(
        `INSERT INTO property_photos (id, propertyId, roomId, url, publicId, category, caption, orderIndex)
         VALUES (?, ?, NULL, 'https://res.cloudinary.com/temp-adm.webp', 'kosmo/temp-adm', 'other', 'Temp Adm', 51)`,
        [tempPhotoAdminId, propAId]
      );

      const resAdmin = await fetch(`${baseUrl}/properties/${propAId}/photos/${tempPhotoAdminId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(resAdmin.status, 200, 'Admin delete across any property must return 200');
    });

    // 1.4 DELETE /photos/:photoId (Direct alias endpoint)
    await t1.test('1.4 DELETE /photos/:photoId (Direct alias) RBAC enforcement', async () => {
      const aliasPhotoId = `p-alias-${tag}`;
      await pool.query(
        `INSERT INTO property_photos (id, propertyId, roomId, url, publicId, category, caption, orderIndex)
         VALUES (?, ?, NULL, 'https://res.cloudinary.com/alias.webp', 'kosmo/alias', 'other', 'Alias', 52)`,
        [aliasPhotoId, propAId]
      );

      const resUnauth = await fetch(`${baseUrl}/photos/${aliasPhotoId}`, {
        method: 'DELETE'
      });
      assert.equal(resUnauth.status, 401, 'Unauthenticated alias delete must return 401');

      const resTenant = await fetch(`${baseUrl}/photos/${aliasPhotoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tenantToken}` }
      });
      assert.equal(resTenant.status, 403, 'Tenant alias delete must return 403');

      const resLandlordB = await fetch(`${baseUrl}/photos/${aliasPhotoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${landlordBToken}` }
      });
      assert.equal(resLandlordB.status, 403, 'Non-owner landlord alias delete must return 403');

      const resLandlordA = await fetch(`${baseUrl}/photos/${aliasPhotoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${landlordAToken}` }
      });
      assert.equal(resLandlordA.status, 200, 'Owner landlord alias delete must return 200');

      const aliasAdminPhotoId = `p-alias-adm-${tag}`;
      await pool.query(
        `INSERT INTO property_photos (id, propertyId, roomId, url, publicId, category, caption, orderIndex)
         VALUES (?, ?, NULL, 'https://res.cloudinary.com/alias-adm.webp', 'kosmo/alias-adm', 'other', 'Alias Adm', 53)`,
        [aliasAdminPhotoId, propAId]
      );

      const resAdmin = await fetch(`${baseUrl}/photos/${aliasAdminPhotoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      assert.equal(resAdmin.status, 200, 'Admin alias delete must return 200');
    });
  });

  // Track 2: Cover Photo Lifecycle & Automatic Promotion
  await t.test('Track 2: Cover Photo Lifecycle & Automatic Promotion', async (t2) => {
    const propLifeId = `prop-life-${tag}`;
    const photoL1Id = `p-l1-${tag}`;
    const photoL2Id = `p-l2-${tag}`;
    const photoL3Id = `p-l3-${tag}`;
    const photoL1Url = `https://res.cloudinary.com/kosmo/life-1-${tag}.webp`;
    const photoL2Url = `https://res.cloudinary.com/kosmo/life-2-${tag}.webp`;
    const photoL3Url = `https://res.cloudinary.com/kosmo/life-3-${tag}.webp`;

    await pool.query(
      `INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId, image) VALUES
       (?, 'Villa Lifecycle Test', 'Badung', 'Jl. Petitenget 99', 6000000, 1, 0, ?, ?)`,
      [propLifeId, landlordAId, photoL1Url]
    );

    await pool.query(
      `INSERT INTO property_photos (id, propertyId, roomId, url, publicId, category, caption, orderIndex) VALUES
       (?, ?, NULL, ?, 'kosmo/life-1', 'thumbnail', 'Cover Photo L1', 0),
       (?, ?, NULL, ?, 'kosmo/life-2', 'bedroom', 'Bedroom L2', 1),
       (?, ?, NULL, ?, 'kosmo/life-3', 'pool', 'Pool L3', 2)`,
      [
        photoL1Id, propLifeId, photoL1Url,
        photoL2Id, propLifeId, photoL2Url,
        photoL3Id, propLifeId, photoL3Url
      ]
    );

    t2.after(async () => {
      await pool.query('DELETE FROM property_photos WHERE propertyId = ?', [propLifeId]);
      await pool.query('DELETE FROM properties WHERE id = ?', [propLifeId]);
    });

    // 2.1 Deleting non-cover photo leaves properties.image unchanged
    await t2.test('2.1 Deleting non-cover photo leaves properties.image unchanged', async () => {
      const res = await fetch(`${baseUrl}/properties/${propLifeId}/photos/${photoL3Id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${landlordAToken}` }
      });
      assert.equal(res.status, 200);

      const [propRows] = await pool.query<PropertyRow[]>(
        'SELECT image FROM properties WHERE id = ?',
        [propLifeId]
      );
      assert.equal(propRows[0].image, photoL1Url, 'Cover image must remain L1 after deleting L3');
    });

    // 2.2 Deleting cover photo automatically promotes lowest orderIndex photo (L2)
    await t2.test('2.2 Deleting cover photo automatically promotes lowest orderIndex photo (L2)', async () => {
      const res = await fetch(`${baseUrl}/properties/${propLifeId}/photos/${photoL1Id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${landlordAToken}` }
      });
      assert.equal(res.status, 200);

      const [photoRows] = await pool.query<PropertyPhotoRow[]>(
        'SELECT id FROM property_photos WHERE id = ?',
        [photoL1Id]
      );
      assert.equal(photoRows.length, 0, 'Photo L1 must be deleted');

      const [propRows] = await pool.query<PropertyRow[]>(
        'SELECT image FROM properties WHERE id = ?',
        [propLifeId]
      );
      assert.equal(propRows[0].image, photoL2Url, 'Cover image must be promoted to photo L2 URL');
    });

    // 2.3 Uploading category=thumbnail automatically promotes new photo to properties.image
    await t2.test('2.3 Uploading category=thumbnail automatically promotes new photo to properties.image', async () => {
      const fd = new FormData();
      fd.append('images', new Blob([sampleGifBuffer], { type: 'image/gif' }), 'new_thumb.gif');
      fd.append('category', 'thumbnail');
      fd.append('caption', 'Promoted Cover Thumbnail');

      const res = await fetch(`${baseUrl}/properties/${propLifeId}/photos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${landlordAToken}` },
        body: fd
      });
      assert.equal(res.status, 201);
      const data = (await res.json()) as { photos: PropertyPhoto[] };
      assert.equal(data.photos.length, 1);
      const newThumbUrl = data.photos[0].url;

      const [propRows] = await pool.query<PropertyRow[]>(
        'SELECT image FROM properties WHERE id = ?',
        [propLifeId]
      );
      assert.equal(propRows[0].image, newThumbUrl, 'Category thumbnail upload must become new cover image');
    });

    // 2.4 Deleting all remaining photos retains last known cover image gracefully
    await t2.test('2.4 Deleting all remaining photos retains last known cover image gracefully', async () => {
      const [remainingPhotos] = await pool.query<PropertyPhotoRow[]>(
        'SELECT id FROM property_photos WHERE propertyId = ?',
        [propLifeId]
      );

      for (const p of remainingPhotos) {
        const res = await fetch(`${baseUrl}/properties/${propLifeId}/photos/${p.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${landlordAToken}` }
        });
        assert.equal(res.status, 200);
      }

      const [emptyPhotos] = await pool.query<PropertyPhotoRow[]>(
        'SELECT id FROM property_photos WHERE propertyId = ?',
        [propLifeId]
      );
      assert.equal(emptyPhotos.length, 0);

      const [propRows] = await pool.query<PropertyRow[]>(
        'SELECT image FROM properties WHERE id = ?',
        [propLifeId]
      );
      assert.ok(propRows[0].image, 'Cover image must retain last known URL');
      assert.ok(propRows[0].image.length > 0);
    });
  });

  // Track 3: Cloudinary Mock & Deletion Safety
  await t.test('Track 3: Cloudinary Mock & Deletion Safety', async (t3) => {
    await t3.test('3.1 deleteCloudinaryImage safely resolves in test environment without network calls', async () => {
      const resOk = await deleteCloudinaryImage('kosmo/valid_mock_public_id');
      assert.deepEqual(resOk, { result: 'ok' });

      const resNotFoundEmpty = await deleteCloudinaryImage('');
      assert.deepEqual(resNotFoundEmpty, { result: 'not_found' });

      const resNotFoundWhitespace = await deleteCloudinaryImage('   ');
      assert.deepEqual(resNotFoundWhitespace, { result: 'not_found' });
    });

    await t3.test('3.2 photo deletion succeeds even when publicId is null in DB', async () => {
      const nullPublicIdPhoto = `p-null-pub-${tag}`;
      await pool.query(
        `INSERT INTO property_photos (id, propertyId, roomId, url, publicId, category, caption, orderIndex)
         VALUES (?, ?, NULL, 'https://example.com/external.webp', NULL, 'other', 'No PublicId', 99)`,
        [nullPublicIdPhoto, propAId]
      );

      const res = await fetch(`${baseUrl}/properties/${propAId}/photos/${nullPublicIdPhoto}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${landlordAToken}` }
      });
      assert.equal(res.status, 200);

      const [rows] = await pool.query<PropertyPhotoRow[]>(
        'SELECT id FROM property_photos WHERE id = ?',
        [nullPublicIdPhoto]
      );
      assert.equal(rows.length, 0);
    });
  });

  // Track 4: Hostile Cross-Resource Injection & Boundary Stress
  await t.test('Track 4: Hostile Cross-Resource Injection & Boundary Stress', async (t4) => {
    // Seed photo on Property B
    const photoBHostileId = `p-b-hostile-${tag}`;
    await pool.query(
      `INSERT INTO property_photos (id, propertyId, roomId, url, publicId, category, caption, orderIndex)
       VALUES (?, ?, NULL, 'https://res.cloudinary.com/hostile-b.webp', 'kosmo/hostile-b', 'other', 'Hostile Target', 10)`,
      [photoBHostileId, propBId]
    );

    // 4.1 Cross-property ID mismatch on nested DELETE returns 404
    await t4.test('4.1 Cross-property ID mismatch on nested DELETE (/properties/A/photos/B) returns 404', async () => {
      const res = await fetch(`${baseUrl}/properties/${propAId}/photos/${photoBHostileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${landlordAToken}` }
      });
      assert.equal(res.status, 404, 'Mismatched propertyId in path must return 404 not found');
    });

    // 4.2 Cross-property deletion on direct alias returns 403 Forbidden
    await t4.test('4.2 Cross-property direct alias DELETE (/photos/B) by Landlord A returns 403', async () => {
      const res = await fetch(`${baseUrl}/photos/${photoBHostileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${landlordAToken}` }
      });
      assert.equal(res.status, 403, 'Landlord A deleting Landlord B photo via alias must be rejected with 403');
    });

    // 4.3 Preserves external custom cover image when deleted photo was not the cover
    await t4.test('4.3 Deleting photo when properties.image is custom external URL does not overwrite cover', async () => {
      const propExtId = `prop-ext-${tag}`;
      const extCoverUrl = 'https://external-cdn.com/custom-facade.jpg';
      const extPhotoId = `p-ext-${tag}`;
      const extPhotoUrl = `https://res.cloudinary.com/ext-${tag}.webp`;

      await pool.query(
        `INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId, image)
         VALUES (?, 'Villa External Image', 'Badung', 'Jl. Oberoi', 7000000, 1, 0, ?, ?)`,
        [propExtId, landlordAId, extCoverUrl]
      );
      await pool.query(
        `INSERT INTO property_photos (id, propertyId, roomId, url, publicId, category, caption, orderIndex)
         VALUES (?, ?, NULL, ?, 'kosmo/ext', 'bedroom', 'Bedroom', 0)`,
        [extPhotoId, propExtId, extPhotoUrl]
      );

      const res = await fetch(`${baseUrl}/properties/${propExtId}/photos/${extPhotoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${landlordAToken}` }
      });
      assert.equal(res.status, 200);

      const [rows] = await pool.query<PropertyRow[]>(
        'SELECT image FROM properties WHERE id = ?',
        [propExtId]
      );
      assert.equal(rows[0].image, extCoverUrl, 'Custom external cover image must remain untouched');

      // Cleanup
      await pool.query('DELETE FROM properties WHERE id = ?', [propExtId]);
    });
  });
});

