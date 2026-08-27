(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
(process.env as Record<string, string | undefined>).NO_LISTEN = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import type { RowDataPacket } from 'mysql2/promise';

const { default: app } = await import('../backend/server');
const { pool } = await import('../backend/db');
const { generateJwtToken } = await import('../backend/middleware/auth');

interface RentalRow extends RowDataPacket {
  id: string;
  tenantId: string;
  propertyId: string;
  propertyName: string;
  price: number;
  startDate: string;
  status: string;
  document?: string;
  contract_url?: string | null;
  contract_hash?: string | null;
  contract_signed_at?: string | Date | null;
  signer_ip?: string | null;
  signer_user_agent?: string | null;
  tenant_nik_passport?: string | null;
  tenant_signature_data?: string | null;
  admin_fee_amount?: number | string;
}

interface PropertyRow extends RowDataPacket {
  id: string;
  name: string;
  price: number;
  totalRooms: number;
  occupiedRooms: number;
  ownerId?: string;
}

interface UserRow extends RowDataPacket {
  id: string;
  email: string;
  role: string;
  name: string;
  balance?: number | string;
  totalRevenue?: number | string;
}

interface CountRow extends RowDataPacket {
  count: number;
}

test('CHALLENGER SUITE: Milestone 3 Endpoints, Audit Trail, RBAC & Concurrency Guards', { timeout: 120_000 }, async (t) => {
  let isConnected = false;
  try {
    const conn = await pool.getConnection();
    isConnected = true;
    conn.release();
  } catch (err) {
    console.warn('MySQL connection test skipped (server unreachable):', err);
  }

  if (!isConnected) {
    t.diagnostic('Skipping live M3 challenger tests because MySQL server is unreachable');
    return;
  }

  let serverPort = 0;
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, () => {
      const addr = s.address();
      if (addr && typeof addr === 'object') {
        serverPort = addr.port;
      }
      resolve(s);
    });
  });

  const baseUrl = `http://127.0.0.1:${serverPort}/api`;

  t.after(() => {
    server.close();
  });

  // Valid 1x1 PNG Base64 signature string (>20 chars)
  const validSignatureBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAAyCAYAAACqNX6+AAAALElEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAeAMReAABl4wZFAAAAABJRU5ErkJggg==';

  // =========================================================================
  // 1. Concurrent Storm: Single Active Tenancy Lock (HTTP 409 Conflict Guard)
  // =========================================================================
  await t.test('Concurrency Guard 1: 10x simultaneous signing requests for the same tenant enforces Single Active Tenancy without deadlock', async () => {
    const uniqueTag = crypto.randomBytes(4).toString('hex');
    const tenantId = `tenant-concur-${uniqueTag}`;
    const landlordId = `landlord-concur-${uniqueTag}`;
    const prop1Id = `prop-c1-${uniqueTag}`;
    const prop2Id = `prop-c2-${uniqueTag}`;

    // Setup test users & properties
    await pool.query(
      `INSERT INTO users (
        id, name, email, role, password, phone, identity_type, identity_number, address, occupation, emergency_contact_name, emergency_contact_phone
      ) VALUES (?, 'Concurrent Tenant', ?, 'tenant', '$2a$10$abcdefghijklmnopqrstuu', '+6281234567890', 'NIK', '5171012308980001', 'Jl. Pantai Batu Bolong No. 1, Canggu, Bali', 'Engineer', 'Emergency Contact', '+6281234567899')`,
      [tenantId, `tenant-${uniqueTag}@kosmo.test`]
    );
    await pool.query(
      "INSERT INTO users (id, name, email, role, password, balance, totalRevenue) VALUES (?, 'Concurrent Landlord', ?, 'landlord', '$2a$10$abcdefghijklmnopqrstuu', 0, 0)",
      [landlordId, `landlord-${uniqueTag}@kosmo.test`]
    );
    await pool.query(
      "INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId) VALUES (?, 'KOSMO Villa Concur 1', 'Canggu', 'Canggu, Bali', 4000000, 10, 0, ?)",
      [prop1Id, landlordId]
    );
    await pool.query(
      "INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId) VALUES (?, 'KOSMO Villa Concur 2', 'Seminyak', 'Seminyak, Bali', 4500000, 10, 0, ?)",
      [prop2Id, landlordId]
    );

    const token = generateJwtToken({ id: tenantId, email: `tenant-${uniqueTag}@kosmo.test`, role: 'tenant' });

    try {
      // 1. Tenant signs contract on Property 1 -> HTTP 201 with status: pending
      const signRes = await fetch(`${baseUrl}/rentals/contract/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          propertyId: prop1Id,
          durationMonths: 1,
          startDate: '2026-09-01',
          tenantNikPassport: '5171012308980001',
          signatureBase64: validSignatureBase64,
          affirmativeConsent: true
        })
      });
      assert.equal(signRes.status, 201);
      const signData = await signRes.json();
      const rentalId = signData.rentalId;

      // 2. Settle payment via webhook -> transitions status to 'active', increments occupiedRooms, credits balance
      const serverKey = process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-placeholder';
      const grossAmount = `${4000000 + 5000}.00`;
      const payloadStr = `${rentalId}200${grossAmount}${serverKey}`;
      const signatureKey = crypto.createHash('sha512').update(payloadStr).digest('hex');

      const webhookRes = await fetch(`${baseUrl}/payment/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: rentalId,
          status_code: '200',
          gross_amount: grossAmount,
          signature_key: signatureKey,
          transaction_status: 'settlement'
        })
      });
      assert.equal(webhookRes.status, 200);

      // 3. Now that tenant has an ACTIVE tenancy, fire 9 simultaneous signing requests targeting both properties
      const promises = Array.from({ length: 9 }, (_, i) => {
        const targetPropId = i % 2 === 0 ? prop1Id : prop2Id;
        return fetch(`${baseUrl}/rentals/contract/sign`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            propertyId: targetPropId,
            durationMonths: 1,
            startDate: '2026-09-01',
            tenantNikPassport: '5171012308980001',
            signatureBase64: validSignatureBase64,
            affirmativeConsent: true
          })
        }).then(async (res) => {
          const body = await res.json();
          return { status: res.status, body };
        });
      });

      const results = await Promise.all(promises);

      // EMPIRICAL ORACLE:
      // All 9 concurrent requests must fail with HTTP 409 Conflict.
      for (const r of results) {
        assert.equal(r.status, 409, `All subsequent requests must fail with 409 Conflict. Got ${r.status}`);
        assert.ok(
          r.body.message?.includes('Single Active Tenancy Violation') || r.body.message?.includes('masih memiliki sewa kos yang aktif'),
          '409 response must explain single active tenancy violation'
        );
      }

      // Verify persistent database state
      const [rentals] = await pool.query<RentalRow[]>(
        "SELECT * FROM rentals WHERE tenantId = ? AND status = 'active'",
        [tenantId]
      );
      assert.equal(rentals.length, 1, 'Database must contain EXACTLY 1 active rental for this tenant');

      // Verify property occupancy was incremented by exactly 1 in total
      const [prop1] = await pool.query<PropertyRow[]>('SELECT occupiedRooms FROM properties WHERE id = ?', [prop1Id]);
      const [prop2] = await pool.query<PropertyRow[]>('SELECT occupiedRooms FROM properties WHERE id = ?', [prop2Id]);
      const totalOccupied = Number(prop1[0].occupiedRooms) + Number(prop2[0].occupiedRooms);
      assert.equal(totalOccupied, 1, 'Combined occupiedRooms across both properties must equal exactly 1');

      // Verify landlord financial credit occurred exactly once
      const [landlord] = await pool.query<UserRow[]>('SELECT balance, totalRevenue FROM users WHERE id = ?', [landlordId]);
      assert.equal(Number(landlord[0].balance), 4000000, 'Landlord balance must be credited exactly once');
      assert.equal(Number(landlord[0].totalRevenue), 4000000, 'Landlord totalRevenue must be credited exactly once');
    } finally {
      // Cleanup
      await pool.query('DELETE FROM rentals WHERE tenantId = ?', [tenantId]);
      await pool.query('DELETE FROM properties WHERE id IN (?, ?)', [prop1Id, prop2Id]);
      await pool.query('DELETE FROM users WHERE id IN (?, ?)', [tenantId, landlordId]);
    }
  });

  // =========================================================================
  // 2. Concurrent Storm: Room Capacity Starvation Race (HTTP 409 Overbooking Guard in Webhook)
  // =========================================================================
  await t.test('Concurrency Guard 2: 10x simultaneous settlement requests for the last room prevents overbooking', async () => {
    const uniqueTag = crypto.randomBytes(4).toString('hex');
    const landlordId = `landlord-cap-${uniqueTag}`;
    const propId = `prop-cap-${uniqueTag}`;

    // Setup property with 10 total rooms and 9 already occupied (1 single vacancy left)
    await pool.query(
      "INSERT INTO users (id, name, email, role, password, balance, totalRevenue) VALUES (?, 'Capacity Landlord', ?, 'landlord', '$2a$10$abcdefghijklmnopqrstuu', 0, 0)",
      [landlordId, `landlord-cap-${uniqueTag}@kosmo.test`]
    );
    await pool.query(
      "INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId) VALUES (?, 'KOSMO Tight Villa', 'Uluwatu', 'Uluwatu, Bali', 5000000, 10, 9, ?)",
      [propId, landlordId]
    );

    // Setup 10 distinct tenants and sign 10 pending contracts
    const tenantIds: string[] = [];
    const rentalIds: string[] = [];
    const serverKey = process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-placeholder';
    const grossAmount = `${5000000 + 5000}.00`;

    for (let i = 0; i < 10; i++) {
      const tId = `tenant-cap-${uniqueTag}-${i}`;
      tenantIds.push(tId);
      await pool.query(
        `INSERT INTO users (
          id, name, email, role, password, phone, identity_type, identity_number, address, occupation, emergency_contact_name, emergency_contact_phone
        ) VALUES (?, ?, ?, 'tenant', '$2a$10$abcdefghijklmnopqrstuu', '+6281234567890', 'NIK', ?, 'Jl. Pantai Uluwatu No. 1, Badung, Bali', 'Engineer', 'Emergency Contact', '+6281234567899')`,
        [tId, `Cap Tenant ${i}`, `tenant-${uniqueTag}-${i}@kosmo.test`, `517101230898${(1000 + i).toString()}`]
      );
      const token = generateJwtToken({ id: tId, email: `tenant-${uniqueTag}-${i}@kosmo.test`, role: 'tenant' });
      const signRes = await fetch(`${baseUrl}/rentals/contract/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          propertyId: propId,
          durationMonths: 1,
          startDate: '2026-09-01',
          tenantNikPassport: `517101230898${(1000 + i).toString()}`,
          signatureBase64: validSignatureBase64,
          affirmativeConsent: true
        })
      });
      assert.equal(signRes.status, 201);
      const signData = await signRes.json();
      rentalIds.push(signData.rentalId);
    }

    try {
      // Fire 10 simultaneous settlement webhook requests for the 10 pending rentals
      const promises = rentalIds.map((rId) => {
        const payloadStr = `${rId}200${grossAmount}${serverKey}`;
        const signatureKey = crypto.createHash('sha512').update(payloadStr).digest('hex');

        return fetch(`${baseUrl}/payment/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: rId,
            status_code: '200',
            gross_amount: grossAmount,
            signature_key: signatureKey,
            transaction_status: 'settlement'
          })
        }).then(async (res) => {
          const body = await res.json();
          return { status: res.status, body };
        });
      });

      const results = await Promise.all(promises);

      const statusCounts: Record<number, number> = {};
      for (const r of results) {
        statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      }

      // EMPIRICAL ORACLE:
      // Exactly 1 request succeeds (200 OK) winning the last room.
      // Exactly 9 requests fail with 409 Conflict ("Kamar sudah penuh...").
      // No overbooking allowed!
      assert.equal(statusCounts[200], 1, `Exactly 1 settlement request must win the last room (200). Got: ${JSON.stringify(statusCounts)}`);
      assert.equal(statusCounts[409], 9, `Exactly 9 settlement requests must be rejected with 409 Conflict. Got: ${JSON.stringify(statusCounts)}`);

      // Verify property occupiedRooms is strictly capped at totalRooms (10)
      const [propRows] = await pool.query<PropertyRow[]>('SELECT totalRooms, occupiedRooms FROM properties WHERE id = ?', [propId]);
      assert.equal(propRows[0].occupiedRooms, 10, 'occupiedRooms must be exactly 10 and never exceed totalRooms');

      // Verify exactly 1 active rental record created for this property
      const [activeRentals] = await pool.query<RentalRow[]>("SELECT * FROM rentals WHERE propertyId = ? AND status = 'active'", [propId]);
      assert.equal(activeRentals.length, 1, 'Exactly 1 active rental should be recorded in database');
    } finally {
      // Cleanup
      await pool.query('DELETE FROM rentals WHERE propertyId = ?', [propId]);
      await pool.query('DELETE FROM properties WHERE id = ?', [propId]);
      for (const tId of tenantIds) {
        await pool.query('DELETE FROM users WHERE id = ?', [tId]);
      }
      await pool.query('DELETE FROM users WHERE id = ?', [landlordId]);
    }
  });

  // =========================================================================
  // 3. RBAC & Security Matrix on GET /api/rentals/:id/contract
  // =========================================================================
  await t.test('RBAC Access Control: Multi-Persona Authorization Matrix on GET /rentals/:id/contract', async () => {
    const uniqueTag = crypto.randomBytes(4).toString('hex');
    const tenantAId = `tenant-a-${uniqueTag}`;
    const tenantBId = `tenant-b-${uniqueTag}`;
    const landlordAId = `landlord-a-${uniqueTag}`;
    const landlordBId = `landlord-b-${uniqueTag}`;
    const adminId = `admin-${uniqueTag}`;
    const propAId = `prop-a-${uniqueTag}`;
    const rentalAId = `rent-a-${uniqueTag}`;

    // Create personas
    await pool.query(
      "INSERT INTO users (id, name, email, role, password) VALUES (?, 'Tenant A (Owner)', ?, 'tenant', '$2a$10$abcdefghijklmnopqrstuu')",
      [tenantAId, `tenantA-${uniqueTag}@kosmo.test`]
    );
    await pool.query(
      "INSERT INTO users (id, name, email, role, password) VALUES (?, 'Tenant B (Intruder)', ?, 'tenant', '$2a$10$abcdefghijklmnopqrstuu')",
      [tenantBId, `tenantB-${uniqueTag}@kosmo.test`]
    );
    await pool.query(
      "INSERT INTO users (id, name, email, role, password) VALUES (?, 'Landlord A (Owner)', ?, 'landlord', '$2a$10$abcdefghijklmnopqrstuu')",
      [landlordAId, `landlordA-${uniqueTag}@kosmo.test`]
    );
    await pool.query(
      "INSERT INTO users (id, name, email, role, password) VALUES (?, 'Landlord B (Intruder)', ?, 'landlord', '$2a$10$abcdefghijklmnopqrstuu')",
      [landlordBId, `landlordB-${uniqueTag}@kosmo.test`]
    );
    await pool.query(
      "INSERT INTO users (id, name, email, role, password) VALUES (?, 'Super Admin', ?, 'admin', '$2a$10$abcdefghijklmnopqrstuu')",
      [adminId, `admin-${uniqueTag}@kosmo.test`]
    );

    // Create property owned by Landlord A
    await pool.query(
      "INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId) VALUES (?, 'KOSMO Sanctum', 'Ubud', 'Ubud, Gianyar, Bali', 6000000, 5, 1, ?)",
      [propAId, landlordAId]
    );

    // Create rental signed by Tenant A
    const sampleHash = 'a'.repeat(64);
    await pool.query(
      `INSERT INTO rentals (
        id, tenantId, propertyId, propertyName, price, startDate, status,
        contract_url, contract_hash, contract_signed_at, signer_ip,
        signer_user_agent, tenant_nik_passport, tenant_signature_data, admin_fee_amount
      ) VALUES (?, ?, ?, 'KOSMO Sanctum', 6000000, '2026-09-01', 'active', ?, ?, NOW(), ?, ?, ?, ?, ?)`,
      [
        rentalAId,
        tenantAId,
        propAId,
        'https://res.cloudinary.com/kosmo/raw/upload/kosmo_contracts/contract_test.pdf',
        sampleHash,
        '180.252.164.88',
        'Mozilla/5.0 Challenger Agent',
        '5171012308980001',
        validSignatureBase64,
        5000.00
      ]
    );

    const tokenTenantA = generateJwtToken({ id: tenantAId, email: `tenantA-${uniqueTag}@kosmo.test`, role: 'tenant' });
    const tokenTenantB = generateJwtToken({ id: tenantBId, email: `tenantB-${uniqueTag}@kosmo.test`, role: 'tenant' });
    const tokenLandlordA = generateJwtToken({ id: landlordAId, email: `landlordA-${uniqueTag}@kosmo.test`, role: 'landlord' });
    const tokenLandlordB = generateJwtToken({ id: landlordBId, email: `landlordB-${uniqueTag}@kosmo.test`, role: 'landlord' });
    const tokenAdmin = generateJwtToken({ id: adminId, email: `admin-${uniqueTag}@kosmo.test`, role: 'admin' });

    try {
      // 3.1 Legitimate Tenant A access -> HTTP 200 + valid PDF stream + inline disposition
      const resTenantA = await fetch(`${baseUrl}/rentals/${rentalAId}/contract`, {
        headers: { Authorization: `Bearer ${tokenTenantA}` }
      });
      assert.equal(resTenantA.status, 200, 'Tenant A (lease owner) must receive HTTP 200');
      assert.equal(resTenantA.headers.get('content-type'), 'application/pdf');
      assert.ok(resTenantA.headers.get('content-disposition')?.includes('inline'), 'Default disposition must be inline');
      assert.ok(resTenantA.headers.get('x-contract-hash'), 'X-Contract-Hash header must be present');
      const pdfBufA = Buffer.from(await resTenantA.arrayBuffer());
      assert.equal(pdfBufA.subarray(0, 4).toString('ascii'), '%PDF', 'Body must be valid binary PDF buffer');

      // 3.2 Property Landlord A access -> HTTP 200
      const resLandlordA = await fetch(`${baseUrl}/rentals/${rentalAId}/contract`, {
        headers: { Authorization: `Bearer ${tokenLandlordA}` }
      });
      assert.equal(resLandlordA.status, 200, 'Landlord A (property owner) must receive HTTP 200');

      // 3.3 Platform Admin access -> HTTP 200
      const resAdmin = await fetch(`${baseUrl}/rentals/${rentalAId}/contract`, {
        headers: { Authorization: `Bearer ${tokenAdmin}` }
      });
      assert.equal(resAdmin.status, 200, 'Admin must receive HTTP 200');

      // 3.4 Unrelated Tenant B access -> HTTP 403 Forbidden
      const resTenantB = await fetch(`${baseUrl}/rentals/${rentalAId}/contract`, {
        headers: { Authorization: `Bearer ${tokenTenantB}` }
      });
      assert.equal(resTenantB.status, 403, 'Unrelated Tenant B must receive HTTP 403 Forbidden');
      const bodyTenantB = await resTenantB.json();
      assert.ok(bodyTenantB.message?.includes('Akses ditolak'), 'Error message must state access denied');

      // 3.5 Unrelated Landlord B access -> HTTP 403 Forbidden
      const resLandlordB = await fetch(`${baseUrl}/rentals/${rentalAId}/contract`, {
        headers: { Authorization: `Bearer ${tokenLandlordB}` }
      });
      assert.equal(resLandlordB.status, 403, 'Unrelated Landlord B must receive HTTP 403 Forbidden');

      // 3.6 Unauthenticated access -> HTTP 401 Unauthorized
      const resAnon = await fetch(`${baseUrl}/rentals/${rentalAId}/contract`);
      assert.equal(resAnon.status, 401, 'Unauthenticated request must receive HTTP 401 Unauthorized');

      // 3.7 Download mode ?download=true -> Content-Disposition: attachment
      const resDownload = await fetch(`${baseUrl}/rentals/${rentalAId}/contract?download=true`, {
        headers: { Authorization: `Bearer ${tokenTenantA}` }
      });
      assert.equal(resDownload.status, 200);
      assert.ok(resDownload.headers.get('content-disposition')?.includes('attachment'), 'Disposition must be attachment on ?download=true');

      // 3.8 Non-existent rental ID -> HTTP 404 Not Found
      const resNotFound = await fetch(`${baseUrl}/rentals/non-existent-rental-99999/contract`, {
        headers: { Authorization: `Bearer ${tokenAdmin}` }
      });
      assert.equal(resNotFound.status, 404, 'Non-existent rental must return HTTP 404');
    } finally {
      // Cleanup
      await pool.query('DELETE FROM rentals WHERE id = ?', [rentalAId]);
      await pool.query('DELETE FROM properties WHERE id = ?', [propAId]);
      await pool.query('DELETE FROM users WHERE id IN (?, ?, ?, ?, ?)', [
        tenantAId,
        tenantBId,
        landlordAId,
        landlordBId,
        adminId
      ]);
    }
  });

  // =========================================================================
  // 4. Audit Trail Fidelity & Forensic Data Capture
  // =========================================================================
  await t.test('Audit Trail Capture: Signer IP extraction, User-Agent, UTC timestamps, NIK, Signature, and Rp 5,000 fee', async () => {
    const uniqueTag = crypto.randomBytes(4).toString('hex');
    const tenantId = `tenant-audit-${uniqueTag}`;
    const landlordId = `landlord-audit-${uniqueTag}`;
    const propId = `prop-audit-${uniqueTag}`;
    const testNik = '5171012308980001';
    const testCustomIp = '114.125.45.102';
    const testUserAgent = 'KOSMO-Forensic-Audit-Runner/3.0';

    await pool.query(
      `INSERT INTO users (
        id, name, email, role, password, phone, identity_type, identity_number, address, occupation, emergency_contact_name, emergency_contact_phone
      ) VALUES (?, 'Audit Tenant', ?, 'tenant', '$2a$10$abcdefghijklmnopqrstuu', '+6281234567890', 'NIK', '5171012308980001', 'Jl. Bypass Ngurah Rai No. 10, Denpasar Selatan, Bali', 'Auditor', 'Emergency Contact', '+6281234567899')`,
      [tenantId, `tenant-audit-${uniqueTag}@kosmo.test`]
    );
    await pool.query(
      "INSERT INTO users (id, name, email, role, password, balance, totalRevenue) VALUES (?, 'Audit Landlord', ?, 'landlord', '$2a$10$abcdefghijklmnopqrstuu', 0, 0)",
      [landlordId, `landlord-audit-${uniqueTag}@kosmo.test`]
    );
    await pool.query(
      "INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId) VALUES (?, 'KOSMO Audit Pavilion', 'Denpasar Selatan', 'Denpasar Selatan, Bali', 3500000, 5, 0, ?)",
      [propId, landlordId]
    );

    const token = generateJwtToken({ id: tenantId, email: `tenant-audit-${uniqueTag}@kosmo.test`, role: 'tenant' });

    try {
      const res = await fetch(`${baseUrl}/rentals/contract/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Forwarded-For': `${testCustomIp}, 10.0.0.1, 192.168.1.1`,
          'User-Agent': testUserAgent
        },
        body: JSON.stringify({
          propertyId: propId,
          durationMonths: 2,
          startDate: '2026-09-15',
          tenantNikPassport: testNik,
          signatureBase64: validSignatureBase64,
          affirmativeConsent: true
        })
      });

      assert.equal(res.status, 201, 'Contract signing must succeed with HTTP 201');
      const data = await res.json();

      assert.equal(data.success, true);
      assert.ok(data.rentalId, 'Rental ID must be returned');
      assert.ok(data.contractHash && data.contractHash.length === 64, 'SHA-256 hash must be returned');
      assert.equal(data.adminFee, 5000, 'Admin fee must be exactly Rp 5,000');
      assert.equal(data.totalAmount, (3500000 * 2) + 5000, 'Total amount must equal (monthlyPrice * duration) + 5000');

      // Verify all 8 columns in persistent storage
      const [rows] = await pool.query<RentalRow[]>('SELECT * FROM rentals WHERE id = ?', [data.rentalId]);
      assert.equal(rows.length, 1);
      const rental = rows[0];

      assert.equal(rental.signer_ip, testCustomIp, 'First IP from X-Forwarded-For must be extracted and saved');
      assert.equal(rental.signer_user_agent, testUserAgent, 'User-Agent header must be recorded');
      assert.equal(rental.tenant_nik_passport, testNik, 'Tenant NIK must be accurately preserved');
      assert.equal(rental.tenant_signature_data, validSignatureBase64, 'Signature Base64 data must be saved');
      assert.equal(Number(rental.admin_fee_amount), 5000, 'admin_fee_amount in database must be 5000.00');
      assert.equal(rental.contract_hash, data.contractHash, 'Database contract_hash must match API response');
      assert.ok(rental.contract_signed_at, 'contract_signed_at must be populated');
      assert.ok(rental.contract_url, 'contract_url must be populated');
    } finally {
      await pool.query('DELETE FROM rentals WHERE tenantId = ?', [tenantId]);
      await pool.query('DELETE FROM properties WHERE id = ?', [propId]);
      await pool.query('DELETE FROM users WHERE id IN (?, ?)', [tenantId, landlordId]);
    }
  });

  // =========================================================================
  // 5. Contract Preview Purity & Zero Persistent Side-Effects
  // =========================================================================
  await t.test('Contract Preview Purity: 10x concurrent preview requests generate correct pricing with zero database mutations', async () => {
    const uniqueTag = crypto.randomBytes(4).toString('hex');
    const tenantId = `tenant-prev-${uniqueTag}`;
    const propId = `prop-prev-${uniqueTag}`;

    await pool.query(
      "INSERT INTO users (id, name, email, role, password) VALUES (?, 'Preview Tenant', ?, 'tenant', '$2a$10$abcdefghijklmnopqrstuu')",
      [tenantId, `tenant-prev-${uniqueTag}@kosmo.test`]
    );
    await pool.query(
      "INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms) VALUES (?, 'KOSMO Preview Oasis', 'Jimbaran', 'Jimbaran, Bali', 4200000, 8, 2)",
      [propId]
    );

    const token = generateJwtToken({ id: tenantId, email: `tenant-prev-${uniqueTag}@kosmo.test`, role: 'tenant' });

    // Snapshot counts before for this tenant and property
    const [rentalsBefore] = await pool.query<CountRow[]>('SELECT COUNT(*) as count FROM rentals WHERE tenantId = ? OR propertyId = ?', [tenantId, propId]);
    const [propsBefore] = await pool.query<PropertyRow[]>('SELECT * FROM properties WHERE id = ?', [propId]);

    try {
      const promises = Array.from({ length: 10 }, (_, i) => {
        return fetch(`${baseUrl}/rentals/contract/preview`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            propertyId: propId,
            durationMonths: i + 1,
            tenantNikPassport: '5171012308980001'
          })
        }).then(async (res) => {
          const body = await res.json();
          return { status: res.status, body };
        });
      });

      const results = await Promise.all(promises);

      for (let i = 0; i < 10; i++) {
        const r = results[i];
        assert.equal(r.status, 200, `Preview request #${i + 1} must return HTTP 200`);
        assert.equal(r.body.success, true);
        assert.ok(r.body.contractData);
        assert.ok(r.body.contractHash && r.body.contractHash.length === 64);
        assert.equal(r.body.adminFee, 5000);
        assert.equal(r.body.totalAmount, (4200000 * (i + 1)) + 5000);
      }

      // Snapshot counts after
      const [rentalsAfter] = await pool.query<CountRow[]>('SELECT COUNT(*) as count FROM rentals WHERE tenantId = ? OR propertyId = ?', [tenantId, propId]);
      const [propsAfter] = await pool.query<PropertyRow[]>('SELECT * FROM properties WHERE id = ?', [propId]);

      assert.equal(rentalsBefore[0].count, 0, 'No rentals should exist before preview');
      assert.equal(rentalsAfter[0].count, 0, 'Preview endpoint must NEVER insert records into rentals table');
      assert.equal(propsBefore[0].occupiedRooms, propsAfter[0].occupiedRooms, 'Preview endpoint must NEVER alter property occupancy');
    } finally {
      await pool.query('DELETE FROM properties WHERE id = ?', [propId]);
      await pool.query('DELETE FROM users WHERE id = ?', [tenantId]);
    }
  });

  // =========================================================================
  // 6. Transaction Rollback & Database Invariant Defense
  // =========================================================================
  await t.test('Transaction Rollback Integrity: Database state perfectly reverted on transaction failure', async () => {
    const uniqueTag = crypto.randomBytes(4).toString('hex');
    const tenantId = `tenant-rb-${uniqueTag}`;
    const landlordId = `landlord-rb-${uniqueTag}`;
    const propId = `prop-rb-${uniqueTag}`;
    const rentalId = `rent-rb-${uniqueTag}`;

    await pool.query(
      "INSERT INTO users (id, name, email, role, password) VALUES (?, 'Rollback Tenant', ?, 'tenant', '$2a$10$abcdefghijklmnopqrstuu')",
      [tenantId, `tenant-rb-${uniqueTag}@kosmo.test`]
    );
    await pool.query(
      "INSERT INTO users (id, name, email, role, password, balance, totalRevenue) VALUES (?, 'Rollback Landlord', ?, 'landlord', '$2a$10$abcdefghijklmnopqrstuu', 1000000, 1000000)",
      [landlordId, `landlord-rb-${uniqueTag}@kosmo.test`]
    );
    await pool.query(
      "INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId) VALUES (?, 'KOSMO Rollback Villa', 'Denpasar Barat', 'Denpasar Barat, Bali', 3000000, 5, 1, ?)",
      [propId, landlordId]
    );

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Simulate partial execution inside transaction
      await conn.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [tenantId]);
      await conn.query(
        `INSERT INTO rentals (
          id, tenantId, propertyId, propertyName, price, startDate, status,
          contract_url, contract_hash, contract_signed_at, signer_ip,
          signer_user_agent, tenant_nik_passport, tenant_signature_data, admin_fee_amount
        ) VALUES (?, ?, ?, 'KOSMO Rollback Villa', 3000000, '2026-09-01', 'active', ?, ?, NOW(), ?, ?, ?, ?, ?)`,
        [
          rentalId,
          tenantId,
          propId,
          'https://res.cloudinary.com/test.pdf',
          'b'.repeat(64),
          '127.0.0.1',
          'Rollback Test',
          '5171012308980001',
          validSignatureBase64,
          5000.00
        ]
      );

      await conn.query('UPDATE properties SET occupiedRooms = occupiedRooms + 1 WHERE id = ?', [propId]);
      await conn.query('UPDATE users SET balance = balance + 3000000, totalRevenue = totalRevenue + 3000000 WHERE id = ?', [landlordId]);

      // Intentionally abort/rollback
      await conn.rollback();
    } finally {
      conn.release();
    }

    // Verify zero side-effects persisted
    const [persistedRentals] = await pool.query<RentalRow[]>('SELECT * FROM rentals WHERE id = ?', [rentalId]);
    assert.equal(persistedRentals.length, 0, 'Rolled-back rental must not exist in rentals table');

    const [persistedProps] = await pool.query<PropertyRow[]>('SELECT occupiedRooms FROM properties WHERE id = ?', [propId]);
    assert.equal(persistedProps[0].occupiedRooms, 1, 'occupiedRooms must remain 1');

    const [persistedLandlord] = await pool.query<UserRow[]>('SELECT balance, totalRevenue FROM users WHERE id = ?', [landlordId]);
    assert.equal(Number(persistedLandlord[0].balance), 1000000, 'Landlord balance must remain unchanged');
    assert.equal(Number(persistedLandlord[0].totalRevenue), 1000000, 'Landlord totalRevenue must remain unchanged');

    // Cleanup
    await pool.query('DELETE FROM properties WHERE id = ?', [propId]);
    await pool.query('DELETE FROM users WHERE id IN (?, ?)', [tenantId, landlordId]);
  });

  // =========================================================================
  // 6. Validation Boundary & Adversarial Payload Defenses
  // =========================================================================
  await t.test('Validation Defenses: Rejects invalid NIK, missing consent, short signatures, and bad durations', async () => {
    const tenantId = `tenant-val-${crypto.randomBytes(4).toString('hex')}`;
    await pool.query(
      `INSERT INTO users (
        id, name, email, role, password, phone, identity_type, identity_number, address, occupation, emergency_contact_name, emergency_contact_phone
      ) VALUES (?, 'Valid KYC Tenant', ?, 'tenant', '$2a$10$abcdefghijklmnopqrstuu', '+6281234567890', 'NIK', '5171012308980001', 'Jl. Pantai Kuta No. 1, Badung, Bali', 'Engineer', 'Emergency Contact', '+6281234567899')`,
      [tenantId, `${tenantId}@kosmo.test`]
    );
    const token = generateJwtToken({ id: tenantId, email: `${tenantId}@kosmo.test`, role: 'tenant' });

    try {
      // 6.1 Missing affirmativeConsent
      const resNoConsent = await fetch(`${baseUrl}/rentals/contract/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          propertyId: 'prop-01',
          durationMonths: 1,
          startDate: '2026-09-01',
          tenantNikPassport: '5171012308980001',
          signatureBase64: validSignatureBase64
          // affirmativeConsent omitted
        })
      });
      assert.equal(resNoConsent.status, 400, 'Missing affirmativeConsent must be rejected with 400');

      // 6.2 affirmativeConsent: false
      const resFalseConsent = await fetch(`${baseUrl}/rentals/contract/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          propertyId: 'prop-01',
          durationMonths: 1,
          startDate: '2026-09-01',
          tenantNikPassport: '5171012308980001',
          signatureBase64: validSignatureBase64,
          affirmativeConsent: false
        })
      });
      assert.equal(resFalseConsent.status, 400, 'affirmativeConsent: false must be rejected with 400');

      // 6.3 Invalid NIK (15 digits)
      const resShortNik = await fetch(`${baseUrl}/rentals/contract/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          propertyId: 'prop-01',
          durationMonths: 1,
          startDate: '2026-09-01',
          tenantNikPassport: '123456789012345', // 15 digits
          signatureBase64: validSignatureBase64,
          affirmativeConsent: true
        })
      });
      assert.equal(resShortNik.status, 400, '15-digit NIK must be rejected with 400');

      // 6.4 Invalid NIK (17 digits)
      const resLongNik = await fetch(`${baseUrl}/rentals/contract/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          propertyId: 'prop-01',
          durationMonths: 1,
          startDate: '2026-09-01',
          tenantNikPassport: '12345678901234567', // 17 digits
          signatureBase64: validSignatureBase64,
          affirmativeConsent: true
        })
      });
      assert.equal(resLongNik.status, 400, '17-digit NIK must be rejected with 400');

      // 6.5 Short signature (< 20 chars)
      const resShortSig = await fetch(`${baseUrl}/rentals/contract/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          propertyId: 'prop-01',
          durationMonths: 1,
          startDate: '2026-09-01',
          tenantNikPassport: '5171012308980001',
          signatureBase64: 'data:image/png;1234',
          affirmativeConsent: true
        })
      });
      assert.equal(resShortSig.status, 400, 'Short signature must be rejected with 400');

      // 6.6 Non-existent propertyId -> HTTP 404
      const resNonExistentProp = await fetch(`${baseUrl}/rentals/contract/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          propertyId: 'prop-does-not-exist-at-all-9999',
          durationMonths: 1,
          startDate: '2026-09-01',
          tenantNikPassport: '5171012308980001',
          signatureBase64: validSignatureBase64,
          affirmativeConsent: true
        })
      });
      assert.equal(resNonExistentProp.status, 404, 'Non-existent propertyId must return 404');
    } finally {
      await pool.query('DELETE FROM users WHERE id = ?', [tenantId]);
    }
  });
});
