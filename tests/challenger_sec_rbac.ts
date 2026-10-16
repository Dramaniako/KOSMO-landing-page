(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
(process.env as Record<string, string | undefined>).NO_LISTEN = 'true';
(process.env as Record<string, string | undefined>).DB_CONNECTION_LIMIT = '20';
(process.env as Record<string, string | undefined>).MIDTRANS_SERVER_KEY = 'placeholder_key';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import express from 'express';
import bodyParser from 'body-parser';
import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2/promise';

import router from '../backend/router';
import { pool, ensureDbReady } from '../backend/db';
import { generateJwtToken } from '../backend/middleware/auth';
import {
  validateImageMagicBytes,
  validateImageMimeType
} from '../backend/middleware/upload';
import {
  sanitizeText,
  validateBody,
  rejectWithdrawalSchema,
  createPaymentTokenSchema,
  reviewSchema,
  updateProfileSchema
} from '../backend/middleware/validation';

interface UserRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  role: string;
  balance: number;
}

interface WithdrawalRow extends RowDataPacket {
  id: string;
  userId: string;
  amount: number;
  status: string;
  rejectionReason: string | null;
}

test('EMPIRICAL CHALLENGER: Security, RBAC & Adversarial Stress Suite (R2, R3, R4)', async (t) => {
  // Ensure database tables and schema migrations are ready
  await ensureDbReady();

  // Create isolated Express instance
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

  // Unique isolation tag
  const tag = crypto.randomBytes(4).toString('hex');
  const adminId = `test-sec-adm-${tag}`;
  const landlordId = `test-sec-ll-${tag}`;
  const tenantId = `test-sec-ten-${tag}`;
  const otherTenantId = `test-sec-other-${tag}`;
  const propertyId = `test-sec-prop-${tag}`;

  const adminPassword = 'AdminSecretPassword123!';
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);
  const landlordPasswordHash = await bcrypt.hash('LandlordPass123!', 10);
  const tenantPasswordHash = await bcrypt.hash('TenantPass123!', 10);

  const tokenAdmin = generateJwtToken({ id: adminId, email: `adm-${tag}@kosmo.test`, role: 'admin' });
  const tokenLandlord = generateJwtToken({ id: landlordId, email: `ll-${tag}@kosmo.test`, role: 'landlord' });
  const tokenTenant = generateJwtToken({ id: tenantId, email: `ten-${tag}@kosmo.test`, role: 'tenant' });
  const tokenOtherTenant = generateJwtToken({ id: otherTenantId, email: `other-${tag}@kosmo.test`, role: 'tenant' });

  const initialLandlordBalance = 5000000;
  const withdrawalPendingId = `test-sec-wd-pend-${tag}`;
  const withdrawalPendingAmount = 2000000;
  const withdrawalCompletedId = `test-sec-wd-comp-${tag}`;
  const withdrawalCompletedAmount = 1000000;

  // Seed test users, property, and withdrawals
  try {
    await pool.query(
      `INSERT INTO users (id, name, email, role, password, balance, totalRevenue)
       VALUES 
       (?, 'Security Admin', ?, 'admin', ?, 0, 0),
       (?, 'Security Landlord', ?, 'landlord', ?, ?, ?),
       (?, 'Security Tenant', ?, 'tenant', ?, 0, 0),
       (?, 'Other Tenant', ?, 'tenant', ?, 0, 0)`,
      [
        adminId, `adm-${tag}@kosmo.test`, adminPasswordHash,
        landlordId, `ll-${tag}@kosmo.test`, landlordPasswordHash, initialLandlordBalance, initialLandlordBalance,
        tenantId, `ten-${tag}@kosmo.test`, tenantPasswordHash,
        otherTenantId, `other-${tag}@kosmo.test`, tenantPasswordHash
      ]
    );

    await pool.query(
      `INSERT INTO properties (id, name, district, address, price, rating, image, description, latitude, longitude, totalRooms, occupiedRooms, ownerId)
       VALUES (?, 'KOSMO Sec Test Villa', 'Badung', 'Jl. Sunset Road No. 88, Kuta', 3000000, 5.0, 'test.jpg', 'Desc', '-8.71', '115.17', 5, 0, ?)`,
      [propertyId, landlordId]
    );

    await pool.query(
      `INSERT INTO withdrawals (id, userId, bankName, accountNumber, accountHolder, amount, date, status, rejectionReason)
       VALUES 
       (?, ?, 'BCA', '1234567890', 'Security Landlord', ?, NOW(), 'pending', NULL),
       (?, ?, 'Mandiri', '9876543210', 'Security Landlord', ?, NOW(), 'completed', NULL)`,
      [
        withdrawalPendingId, landlordId, withdrawalPendingAmount,
        withdrawalCompletedId, landlordId, withdrawalCompletedAmount
      ]
    );
  } catch (seedErr) {
    console.error('Failed to seed challenger test fixtures:', seedErr);
    throw seedErr;
  }

  // Cleanup handler
  t.after(async () => {
    try {
      await pool.query('DELETE FROM rentals WHERE propertyId = ? OR id LIKE ?', [propertyId, `%${tag}%`]);
      await pool.query('DELETE FROM property_photos WHERE propertyId = ?', [propertyId]);
      await pool.query('DELETE FROM rooms WHERE propertyId = ?', [propertyId]);
      await pool.query('DELETE FROM properties WHERE id = ?', [propertyId]);
      await pool.query('DELETE FROM withdrawals WHERE userId IN (?, ?)', [landlordId, adminId]);
      await pool.query('DELETE FROM users WHERE id IN (?, ?, ?, ?)', [adminId, landlordId, tenantId, otherTenantId]);
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr);
    }
    server.close();
  });

  // =========================================================================
  // SUITE 1: Admin Withdrawal Rejection Password Gate & Atomic Rollbacks (R2)
  // =========================================================================
  await t.test('SUITE 1: Admin Withdrawal Rejection Password Gate & Rollbacks', async (st) => {
    await st.test('1.1: Unauthenticated request is rejected with 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/admin/withdrawals/${withdrawalPendingId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword })
      });
      assert.equal(res.status, 401, 'Unauthenticated request must be 401');
    });

    await st.test('1.2: Non-admin caller (tenant or landlord) is rejected with 403 Forbidden', async () => {
      const resTenant = await fetch(`${baseUrl}/admin/withdrawals/${withdrawalPendingId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenTenant}`
        },
        body: JSON.stringify({ password: adminPassword })
      });
      assert.equal(resTenant.status, 403, 'Tenant calling admin reject must be 403');

      const resLandlord = await fetch(`${baseUrl}/admin/withdrawals/${withdrawalPendingId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenLandlord}`
        },
        body: JSON.stringify({ password: adminPassword })
      });
      assert.equal(resLandlord.status, 403, 'Landlord calling admin reject must be 403');
    });

    await st.test('1.3: Admin request with missing password is rejected with 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/admin/withdrawals/${withdrawalPendingId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenAdmin}`
        },
        body: JSON.stringify({ reason: 'Informasi rekening tidak valid' })
      });
      assert.equal(res.status, 400, 'Missing password must yield 400');
      const data = (await res.json()) as { message?: string; error?: string };
      assert.match(String(data.message || data.error || ''), /password.*diperlukan/i);

      // Verify balance in DB remains untouched
      const [userRows] = await pool.query<UserRow[]>('SELECT balance FROM users WHERE id = ?', [landlordId]);
      assert.equal(Number(userRows[0].balance), initialLandlordBalance);
    });

    await st.test('1.4: Admin request with empty or whitespace password is rejected with 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/admin/withdrawals/${withdrawalPendingId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenAdmin}`
        },
        body: JSON.stringify({ password: '', reason: 'Nomor rekening tidak valid' })
      });
      assert.equal(res.status, 400, 'Empty string password must yield 400');
    });

    await st.test('1.5: Admin request with incorrect password is rejected with 401 Unauthorized', async () => {
      const res = await fetch(`${baseUrl}/admin/withdrawals/${withdrawalPendingId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenAdmin}`
        },
        body: JSON.stringify({ password: 'WrongPassword999!', reason: 'Nomor rekening tidak sesuai' })
      });
      assert.equal(res.status, 401, 'Bad password must yield 401');
      const data = (await res.json()) as { message?: string };
      assert.match(String(data.message || ''), /Password administrator salah/i);

      // Verify DB invariants: balance unchanged and withdrawal remains pending
      const [userRows] = await pool.query<UserRow[]>('SELECT balance FROM users WHERE id = ?', [landlordId]);
      assert.equal(Number(userRows[0].balance), initialLandlordBalance, 'Balance must remain unchanged');

      const [wRows] = await pool.query<WithdrawalRow[]>('SELECT status FROM withdrawals WHERE id = ?', [withdrawalPendingId]);
      assert.equal(wRows[0].status, 'pending', 'Withdrawal must remain pending');
    });

    await st.test('1.6: Admin request with non-existent withdrawal ID returns 404 Not Found', async () => {
      const res = await fetch(`${baseUrl}/admin/withdrawals/non-existent-id-9999/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenAdmin}`
        },
        body: JSON.stringify({ password: adminPassword, reason: 'Alasan penolakan' })
      });
      assert.equal(res.status, 404, 'Non-existent withdrawal must return 404');
    });

    await st.test('1.7: Admin request with correct password succeeds (200 OK) & performs atomic balance rollback', async () => {
      const rejectionReason = 'Nomor rekening bank tidak terdaftar di sistem';
      const res = await fetch(`${baseUrl}/admin/withdrawals/${withdrawalPendingId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenAdmin}`
        },
        body: JSON.stringify({
          password: adminPassword,
          reason: rejectionReason
        })
      });

      assert.equal(res.status, 200, 'Valid rejection must yield 200 OK');
      const data = (await res.json()) as { status: string; withdrawalId: string; reason: string };
      assert.equal(data.status, 'rejected');
      assert.equal(data.withdrawalId, withdrawalPendingId);
      assert.equal(data.reason, rejectionReason);

      // Verify DB: withdrawal status updated to 'rejected'
      const [wRows] = await pool.query<WithdrawalRow[]>(
        'SELECT status, rejectionReason FROM withdrawals WHERE id = ?',
        [withdrawalPendingId]
      );
      assert.equal(wRows[0].status, 'rejected');
      assert.equal(wRows[0].rejectionReason, rejectionReason);

      // Verify DB: landlord balance atomically refunded (initial + withdrawalPendingAmount)
      const expectedNewBalance = initialLandlordBalance + withdrawalPendingAmount;
      const [userRows] = await pool.query<UserRow[]>('SELECT balance FROM users WHERE id = ?', [landlordId]);
      assert.equal(Number(userRows[0].balance), expectedNewBalance, 'Landlord balance must be refunded atomically');
    });

    await st.test('1.8: Double-rejection attack prevented: rejecting an already rejected withdrawal returns 400', async () => {
      const balanceBefore = (
        await pool.query<UserRow[]>('SELECT balance FROM users WHERE id = ?', [landlordId])
      )[0][0].balance;

      const res = await fetch(`${baseUrl}/admin/withdrawals/${withdrawalPendingId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenAdmin}`
        },
        body: JSON.stringify({
          password: adminPassword,
          reason: 'Attempt double refund'
        })
      });

      assert.equal(res.status, 400, 'Double rejection must be rejected with 400');
      const data = (await res.json()) as { message?: string };
      assert.match(String(data.message || ''), /Penarikan sudah pernah ditolak/i);

      // Invariant: Balance must NOT be refunded twice
      const balanceAfter = (
        await pool.query<UserRow[]>('SELECT balance FROM users WHERE id = ?', [landlordId])
      )[0][0].balance;
      assert.equal(Number(balanceAfter), Number(balanceBefore), 'Balance must not increment again');
    });

    await st.test('1.9: Rejecting an already completed withdrawal returns 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/admin/withdrawals/${withdrawalCompletedId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenAdmin}`
        },
        body: JSON.stringify({
          password: adminPassword,
          reason: 'Attempt reject completed'
        })
      });

      assert.equal(res.status, 400, 'Rejecting completed withdrawal must be 400');
      const data = (await res.json()) as { message?: string };
      assert.match(String(data.message || ''), /Penarikan yang sudah selesai tidak dapat ditolak/i);
    });
  });

  // =========================================================================
  // SUITE 2: File Upload Magic Bytes & MIME Spoofing Stress Testing (R3)
  // =========================================================================
  await t.test('SUITE 2: File Upload Magic Bytes & Buffer Tampering Resistance', async (st) => {
    await st.test('2.1: Magic bytes unit checks on executable headers and corrupt buffers', () => {
      // Windows PE / EXE
      const peBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
      assert.equal(validateImageMagicBytes(peBuffer), false, 'PE buffer must fail magic bytes');

      // Linux ELF binary
      const elfBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]);
      assert.equal(validateImageMagicBytes(elfBuffer), false, 'ELF buffer must fail magic bytes');

      // Shell script
      const shBuffer = Buffer.from('#!/bin/bash\nrm -rf /');
      assert.equal(validateImageMagicBytes(shBuffer), false, 'Shell script must fail magic bytes');

      // PHP script
      const phpBuffer = Buffer.from('<?php echo "evil"; ?>\n');
      assert.equal(validateImageMagicBytes(phpBuffer), false, 'PHP script must fail magic bytes');

      // Truncated buffers
      assert.equal(validateImageMagicBytes(Buffer.alloc(0)), false, '0-byte buffer must fail');
      assert.equal(validateImageMagicBytes(Buffer.from([0xff, 0xd8])), false, '2-byte buffer must fail');
      assert.equal(validateImageMagicBytes(Buffer.from([0xff, 0xd8, 0xff])), false, '3-byte buffer must fail');
      assert.equal(validateImageMagicBytes(Buffer.alloc(11, 0xff)), false, '11-byte buffer must fail');

      // Spoofed RIFF non-WebP (e.g. WAVE audio file)
      const waveBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
      assert.equal(validateImageMagicBytes(waveBuffer), false, 'WAVE audio disguised as WebP must fail');

      // Valid headers (>= 12 bytes)
      const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
      assert.equal(validateImageMagicBytes(validJpeg), true, 'Valid JPEG must pass');

      const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
      assert.equal(validateImageMagicBytes(validPng), true, 'Valid PNG must pass');

      const validWebp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
      assert.equal(validateImageMagicBytes(validWebp), true, 'Valid WebP must pass');

      const validGif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00]);
      assert.equal(validateImageMagicBytes(validGif), true, 'Valid GIF must pass');
    });

    await st.test('2.2: MIME-spoofed PE executable uploaded to POST /upload is rejected with 400', async () => {
      // Create PE executable buffer disguised with .jpg extension and image/jpeg MIME
      const fakeJpegWithPeHeader = Buffer.from([
        0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00,
        0xff, 0xd8, 0xff // embedded deceptive bytes further inside
      ]);

      const form = new FormData();
      const blob = new Blob([fakeJpegWithPeHeader], { type: 'image/jpeg' });
      form.append('image', blob, 'avatar.jpg');

      const res = await fetch(`${baseUrl}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenAdmin}` },
        body: form
      });

      assert.equal(res.status, 400, 'Tampered executable file must be rejected with 400');
      const data = (await res.json()) as { message?: string };
      assert.match(String(data.message || ''), /header berkas tidak valid|tidak didukung/i);
    });

    await st.test('2.3: Truncated 4-byte buffer uploaded to POST /upload is rejected with 400', async () => {
      const truncatedBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

      const form = new FormData();
      const blob = new Blob([truncatedBuffer], { type: 'image/jpeg' });
      form.append('image', blob, 'truncated.jpg');

      const res = await fetch(`${baseUrl}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenAdmin}` },
        body: form
      });

      assert.equal(res.status, 400, 'Truncated buffer (< 12 bytes) must be rejected with 400');
    });

    await st.test('2.4: Audio RIFF/WAVE disguised as WebP uploaded to POST /upload is rejected with 400', async () => {
      const waveDisguisedBuffer = Buffer.from([
        0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
        0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20
      ]);

      const form = new FormData();
      const blob = new Blob([waveDisguisedBuffer], { type: 'image/webp' });
      form.append('image', blob, 'song.webp');

      const res = await fetch(`${baseUrl}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenAdmin}` },
        body: form
      });

      assert.equal(res.status, 400, 'Audio RIFF file disguised as WebP must be rejected with 400');
    });

    await st.test('2.5: Unsupported MIME type (application/pdf) uploaded to POST /upload is rejected with 400', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');

      const form = new FormData();
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      form.append('image', blob, 'document.pdf');

      const res = await fetch(`${baseUrl}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenAdmin}` },
        body: form
      });

      assert.equal(res.status, 400, 'PDF MIME type must be rejected with 400');
    });

    await st.test('2.6: POST /upload without file returns 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenAdmin}`
        },
        body: JSON.stringify({})
      });
      assert.equal(res.status, 400, 'Upload without file must yield 400');
    });
  });

  // =========================================================================
  // SUITE 3: XSS Sanitization & Polyglot Injection Prevention (R4)
  // =========================================================================
  await t.test('SUITE 3: XSS Sanitization & validateBody Transformation Integrity', async (st) => {
    await st.test('3.1: sanitizeText neutralizes comprehensive polyglots & evasive vectors', () => {
      // 1. Basic script tag
      assert.equal(sanitizeText('<script>alert("xss")</script>'), '');

      // 2. Case variations and script with attributes
      assert.equal(sanitizeText('<sCrIpt type="text/javascript">alert(1)</sCrIpT>'), '');

      // 3. Nested script tags
      assert.equal(sanitizeText('<script><script>alert(1)</script></script>'), '');

      // 4. HTML tags with onerror event handler
      assert.equal(sanitizeText('<img src="x" onerror="alert(1)">'), '');

      // 5. SVG with onload
      assert.equal(sanitizeText('<svg/onload=alert("xss")>'), '');

      // 6. Body tag with onload
      assert.equal(sanitizeText('<body onload=alert(1)>'), '');

      // 7. Iframe with javascript URI
      assert.equal(sanitizeText('<iframe src="javascript:alert(1)"></iframe>'), '');

      // 8. Javascript pseudo-protocol
      assert.equal(sanitizeText('javascript:alert(document.cookie)'), 'alert(document.cookie)');
      assert.equal(sanitizeText('jaVasCript:void(0)'), 'void(0)');

      // 9. Style tag with inner expressions
      assert.equal(sanitizeText('<style>body{background:red;}</style>Clean Text'), 'Clean Text');

      // 10. Null-byte injection
      assert.equal(sanitizeText('Hello\0World<script>alert(1)</script>'), 'HelloWorld');

      // 11. Preserves legitimate punctuation and Indonesian text
      const cleanIndonesian = 'Kost nyaman di Denpasar, AC dingin & WiFi 100 Mbps (Harga Rp 2.500.000).';
      assert.equal(sanitizeText(cleanIndonesian), cleanIndonesian);
    });

    await st.test('3.2: validateBody mutates req.body to strip XSS tags from review payload', () => {
      let passedReqBody: unknown = null;
      const middleware = validateBody(reviewSchema);

      const mockReq = {
        body: {
          propertyId: 'prop-123',
          rating: 5,
          comment: 'Kamar sangat bagus! <script>alert("hacked")</script> Sangat direkomendasikan <img src=x onerror=alert(1)>.'
        }
      } as unknown as express.Request;

      const mockRes = {
        status: () => mockRes,
        json: () => mockRes
      } as unknown as express.Response;

      middleware(mockReq, mockRes, () => {
        passedReqBody = mockReq.body;
      });

      assert.ok(passedReqBody, 'Middleware must invoke next() and pass body');
      const sanitized = passedReqBody as { comment: string };
      assert.equal(sanitized.comment, 'Kamar sangat bagus!  Sangat direkomendasikan .');
      assert.ok(!sanitized.comment.includes('<script>'), 'Script tag must be stripped');
      assert.ok(!sanitized.comment.includes('onerror'), 'Event handler must be stripped');
    });

    await st.test('3.3: Pure XSS payload in review comment collapses to empty and triggers 400 validation error', () => {
      let errorStatusCode = 0;
      let errorResponse: unknown = null;

      const middleware = validateBody(reviewSchema);
      const mockReq = {
        body: {
          propertyId: 'prop-123',
          rating: 5,
          comment: '<script>alert(1)</script><style>evil</style>'
        }
      } as unknown as express.Request;

      const mockRes = {
        status: (code: number) => {
          errorStatusCode = code;
          return mockRes;
        },
        json: (data: unknown) => {
          errorResponse = data;
          return mockRes;
        }
      } as unknown as express.Response;

      middleware(mockReq, mockRes, () => {
        assert.fail('next() must not be called when comment sanitizes to empty string');
      });

      assert.equal(errorStatusCode, 400, 'Pure XSS comment must fail validation with 400');
      assert.match(JSON.stringify(errorResponse), /Komentar ulasan wajib diisi/i);
    });

    await st.test('3.4: validateBody sanitizes all KYC profile fields and strips XSS payloads', () => {
      let passedReqBody: unknown = null;
      const middleware = validateBody(updateProfileSchema);

      const mockReq = {
        body: {
          name: 'Jane <script>alert(1)</script>Doe',
          address: 'Jl. Sunset Road <img src=x onerror=alert(1)> No. 12',
          occupation: '<svg onload=alert(1)>Software <script>eval("xss")</script>Engineer',
          emergency_contact_name: 'Bob <b onmouseover=alert(1)>Smith</b>'
        }
      } as unknown as express.Request;

      const mockRes = {
        status: () => mockRes,
        json: () => mockRes
      } as unknown as express.Response;

      middleware(mockReq, mockRes, () => {
        passedReqBody = mockReq.body;
      });

      assert.ok(passedReqBody, 'Middleware must invoke next() on valid profile data');
      const sanitized = passedReqBody as {
        name: string;
        address: string;
        occupation: string;
        emergency_contact_name: string;
      };

      assert.equal(sanitized.name, 'Jane Doe');
      assert.equal(sanitized.address, 'Jl. Sunset Road  No. 12');
      assert.equal(sanitized.occupation, 'Software Engineer');
      assert.equal(sanitized.emergency_contact_name, 'Bob Smith');
    });
  });

  // =========================================================================
  // SUITE 4: Zod Validation on POST /payment/token with Malformed Inputs (R4)
  // =========================================================================
  await t.test('SUITE 4: Zod Validation Hardening on POST /payment/token', async (st) => {
    await st.test('4.1: Missing propertyId yields 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/payment/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenTenant}`
        },
        body: JSON.stringify({
          durationMonths: 1
        })
      });

      assert.equal(res.status, 400, 'Missing propertyId must yield 400');
      const data = (await res.json()) as { message?: string; error?: string };
      assert.match(String(data.message || data.error || ''), /expected string|propertyId wajib diisi/i);
    });

    await st.test('4.2: Empty string propertyId yields 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/payment/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenTenant}`
        },
        body: JSON.stringify({
          propertyId: '',
          durationMonths: 1
        })
      });

      assert.equal(res.status, 400, 'Empty propertyId must yield 400');
    });

    await st.test('4.3: Non-string propertyId (number or array) yields 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/payment/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenTenant}`
        },
        body: JSON.stringify({
          propertyId: 12345,
          durationMonths: 1
        })
      });

      assert.equal(res.status, 400, 'Numeric propertyId must yield 400');
    });

    await st.test('4.4: Negative durationMonths (-1) yields 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/payment/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenTenant}`
        },
        body: JSON.stringify({
          propertyId,
          durationMonths: -1
        })
      });

      assert.equal(res.status, 400, 'Negative durationMonths must yield 400');
      const data = (await res.json()) as { message?: string; error?: string };
      assert.match(String(data.message || data.error || ''), /Durasi sewa minimal 1 bulan/i);
    });

    await st.test('4.5: Zero durationMonths (0) yields 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/payment/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenTenant}`
        },
        body: JSON.stringify({
          propertyId,
          durationMonths: 0
        })
      });

      assert.equal(res.status, 400, 'Zero durationMonths must yield 400');
    });

    await st.test('4.6: Excessive durationMonths (> 120) yields 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/payment/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenTenant}`
        },
        body: JSON.stringify({
          propertyId,
          durationMonths: 121
        })
      });

      assert.equal(res.status, 400, 'durationMonths > 120 must yield 400');
    });

    await st.test('4.7: Fractional durationMonths (2.5) yields 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/payment/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenTenant}`
        },
        body: JSON.stringify({
          propertyId,
          durationMonths: 2.5
        })
      });

      assert.equal(res.status, 400, 'Non-integer durationMonths must yield 400');
    });

    await st.test('4.8: Negative price (-500000) yields 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/payment/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenTenant}`
        },
        body: JSON.stringify({
          propertyId,
          price: -500000
        })
      });

      assert.equal(res.status, 400, 'Negative price must yield 400');
      const data = (await res.json()) as { message?: string; error?: string };
      assert.match(String(data.message || data.error || ''), /Harga sewa harus lebih besar dari 0/i);
    });

    await st.test('4.9: Zero price (0) yields 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/payment/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenTenant}`
        },
        body: JSON.stringify({
          propertyId,
          price: 0
        })
      });

      assert.equal(res.status, 400, 'Zero price must yield 400');
    });

    await st.test('4.10: String non-numeric price ("free_cost") yields 400 Bad Request', async () => {
      const res = await fetch(`${baseUrl}/payment/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenTenant}`
        },
        body: JSON.stringify({
          propertyId,
          price: 'free_cost'
        })
      });

      assert.equal(res.status, 400, 'Non-numeric string price must yield 400');
    });

    await st.test('4.11: Non-admin tenant cannot generate payment token for another tenant (IDOR guard)', async () => {
      const res = await fetch(`${baseUrl}/payment/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenTenant}`
        },
        body: JSON.stringify({
          propertyId,
          tenantId: otherTenantId,
          durationMonths: 1
        })
      });

      assert.equal(res.status, 403, 'Cross-tenant token generation must yield 403 Forbidden');
      const data = (await res.json()) as { message?: string };
      assert.match(String(data.message || ''), /Akses ditolak.*akun lain/i);
    });
  });

  // =========================================================================
  // SUITE 5: Concurrency & Race-Condition Challenge on Withdrawal Rejection
  // =========================================================================
  await t.test('SUITE 5: Concurrency Race Condition Challenge on Rejection', async (st) => {
    // Create a new pending withdrawal for concurrent rejection storm
    const concurrentWdId = `test-sec-wd-race-${tag}`;
    const concurrentAmount = 1500000;

    await pool.query(
      `INSERT INTO withdrawals (id, userId, bankName, accountNumber, accountHolder, amount, date, status, rejectionReason)
       VALUES (?, ?, 'BRI', '555666777', 'Security Landlord', ?, NOW(), 'pending', NULL)`,
      [concurrentWdId, landlordId, concurrentAmount]
    );

    const balanceBeforeRace = (
      await pool.query<UserRow[]>('SELECT balance FROM users WHERE id = ?', [landlordId])
    )[0][0].balance;

    // Dispatch 2 concurrent reject requests at the exact same millisecond
    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/admin/withdrawals/${concurrentWdId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenAdmin}`
        },
        body: JSON.stringify({ password: adminPassword, reason: 'Concurrent storm reject 1' })
      }),
      fetch(`${baseUrl}/admin/withdrawals/${concurrentWdId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenAdmin}`
        },
        body: JSON.stringify({ password: adminPassword, reason: 'Concurrent storm reject 2' })
      })
    ]);

    const statuses = [res1.status, res2.status];
    // Exactly one must be 200, and one must be 400 (already rejected)
    assert.ok(statuses.includes(200), 'At least one request must succeed with 200 OK');
    assert.ok(statuses.includes(400), 'The concurrent request must receive 400 (already rejected)');

    // Invariant: Balance in DB must be incremented by EXACTLY concurrentAmount once, NOT twice!
    const balanceAfterRace = (
      await pool.query<UserRow[]>('SELECT balance FROM users WHERE id = ?', [landlordId])
    )[0][0].balance;

    const netRefund = Number(balanceAfterRace) - Number(balanceBeforeRace);
    assert.equal(
      netRefund,
      concurrentAmount,
      `Net refund (${netRefund}) must exactly match single withdrawal amount (${concurrentAmount}), preventing double-spending!`
    );
  });
});
