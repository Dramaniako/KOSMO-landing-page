(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import express from 'express';
import bodyParser from 'body-parser';
import router from '../backend/router';
import { pool, ensureDbReady } from '../backend/db';
import { generateJwtToken } from '../backend/middleware/auth';
import { computeContractHash } from '../backend/services/contract';
import type { RowDataPacket } from 'mysql2/promise';

interface CountRow extends RowDataPacket {
  cnt: number;
}

interface PropertyRow extends RowDataPacket {
  id: string;
  name: string;
  price: number;
  totalRooms: number;
  occupiedRooms: number;
  ownerId: string;
}

interface UserRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  role: string;
  balance: number;
  totalRevenue: number;
}

interface RentalRow extends RowDataPacket {
  id: string;
  tenantId: string;
  propertyId: string;
  status: string;
  contract_url: string;
  contract_hash: string;
  contract_signed_at: Date | string;
  signer_ip: string;
  signer_user_agent: string;
  tenant_nik_passport: string;
  tenant_signature_data: string;
  admin_fee_amount: number;
}

test('Empirical Challenge: Milestone 3 RBAC Authorization Matrix & Preview Side-Effects', async (t) => {
  // Ensure database schema and migrations are ready
  try {
    await ensureDbReady();
  } catch (err) {
    console.warn('Database initialization warning in test setup:', err);
  }

  // Create isolated Express test instance with router mounted at /api
  const app = express();
  app.use(bodyParser.json({ limit: '5mb' }));
  app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }));
  app.use('/api', router);

  // Bind to an ephemeral port (port 0)
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

  // Test identities
  const tenant1 = { id: `test-t1-${Date.now()}`, email: `t1-${Date.now()}@kosmo.test`, role: 'tenant' as const, name: 'Tenant One' };
  const tenant2 = { id: `test-t2-${Date.now()}`, email: `t2-${Date.now()}@kosmo.test`, role: 'tenant' as const, name: 'Tenant Two (Third-Party)' };
  const landlord1 = { id: `test-l1-${Date.now()}`, email: `l1-${Date.now()}@kosmo.test`, role: 'landlord' as const, name: 'Landlord One (Owner)' };
  const landlord2 = { id: `test-l2-${Date.now()}`, email: `l2-${Date.now()}@kosmo.test`, role: 'landlord' as const, name: 'Landlord Two (Third-Party)' };
  const admin = { id: `test-adm-${Date.now()}`, email: `adm-${Date.now()}@kosmo.test`, role: 'admin' as const, name: 'Super Admin' };

  // Tokens
  const tokenTenant1 = generateJwtToken(tenant1);
  const tokenTenant2 = generateJwtToken(tenant2);
  const tokenLandlord1 = generateJwtToken(landlord1);
  const tokenLandlord2 = generateJwtToken(landlord2);
  const tokenAdmin = generateJwtToken(admin);
  const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalidpayload.invalidsignature';

  const testProp1Id = `test-prop1-${Date.now()}`;
  const testPropFullId = `test-prop-full-${Date.now()}`;
  const testRental1Id = `test-rent1-${Date.now()}`;
  const testDocHash = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

  // Seed test users, property, and rental in live DB for end-to-end endpoint verification
  try {
    await pool.query(
      `INSERT INTO users (
        id, name, email, role, password, phone, identity_type, identity_number, address, occupation, emergency_contact_name, emergency_contact_phone, balance, totalRevenue
      ) VALUES
       (?, ?, ?, ?, '$2a$10$hash', '+6281234567890', 'NIK', '5171012308980001', 'Jl. Test No. 1, Denpasar, Bali', 'Engineer', 'Emergency Contact', '+6281234567899', 0, 0),
       (?, ?, ?, ?, '$2a$10$hash', '+6281234567890', 'NIK', '5171012308980002', 'Jl. Test No. 2, Denpasar, Bali', 'Engineer', 'Emergency Contact', '+6281234567899', 0, 0),
       (?, ?, ?, ?, '$2a$10$hash', '+6281234567890', 'NIK', '5171012308980003', 'Jl. Test No. 3, Denpasar, Bali', 'Landlord', 'Emergency Contact', '+6281234567899', 0, 0),
       (?, ?, ?, ?, '$2a$10$hash', '+6281234567890', 'NIK', '5171012308980004', 'Jl. Test No. 4, Denpasar, Bali', 'Landlord', 'Emergency Contact', '+6281234567899', 0, 0),
       (?, ?, ?, ?, '$2a$10$hash', '+6281234567890', 'NIK', '5171012308980005', 'Jl. Test No. 5, Denpasar, Bali', 'Admin', 'Emergency Contact', '+6281234567899', 0, 0)`,
      [
        tenant1.id, tenant1.name, tenant1.email, tenant1.role,
        tenant2.id, tenant2.name, tenant2.email, tenant2.role,
        landlord1.id, landlord1.name, landlord1.email, landlord1.role,
        landlord2.id, landlord2.name, landlord2.email, landlord2.role,
        admin.id, admin.name, admin.email, admin.role
      ]
    );

    await pool.query(
      `INSERT INTO properties (id, name, district, address, price, rating, image, description, latitude, longitude, totalRooms, occupiedRooms, ownerId, document)
       VALUES 
       (?, 'KOSMO Test Villa Denpasar', 'Denpasar', 'Jl. Test No. 1, Denpasar', 4000000, 4.9, 'test.jpg', 'Test Desc', '-8.67', '115.21', 5, 1, ?, 'doc.pdf'),
       (?, 'KOSMO Full Capacity Villa', 'Badung', 'Jl. Full No. 2, Badung', 5000000, 4.8, 'test2.jpg', 'Full Desc', '-8.68', '115.22', 3, 3, ?, 'doc2.pdf')`,
      [testProp1Id, landlord1.id, testPropFullId, landlord1.id]
    );

    await pool.query(
      `INSERT INTO rentals (
        id, tenantId, propertyId, propertyName, price, startDate, status,
        contract_url, contract_hash, contract_signed_at, signer_ip,
        signer_user_agent, tenant_nik_passport, tenant_signature_data, admin_fee_amount
      ) VALUES (?, ?, ?, 'KOSMO Test Villa Denpasar', 4000000, '2026-09-01', 'active',
        'https://res.cloudinary.com/kosmo/raw/upload/kosmo_contracts/test.pdf',
        ?, NOW(), '127.0.0.1', 'Node Test Runner', '5171012308980001',
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        5000.00)`,
      [testRental1Id, tenant1.id, testProp1Id, testDocHash]
    );
  } catch (seedErr) {
    console.error('Failed to seed RBAC test fixtures:', seedErr);
  }

  // Cleanup helper on exit
  t.after(async () => {
    try {
      await pool.query('DELETE FROM rentals WHERE id LIKE "test-rent%" OR id LIKE "rent-%"');
      await pool.query('DELETE FROM properties WHERE id LIKE "test-prop%"');
      await pool.query('DELETE FROM users WHERE id LIKE "test-%"');
    } catch (cleanupErr) {
      console.warn('Cleanup error:', cleanupErr);
    }
    server.close();
  });

  // =========================================================================
  // SUITE 1: RBAC Authorization Matrix for GET /api/rentals/:id/contract
  // =========================================================================
  await t.test('RBAC Matrix: 1. Permitted Tenant (Rental Owner) -> 200 OK with PDF Stream', async () => {
    const res = await fetch(`${baseUrl}/rentals/${testRental1Id}/contract`, {
      headers: { Authorization: `Bearer ${tokenTenant1}` }
    });

    assert.equal(res.status, 200, 'Tenant who signed the rental must receive HTTP 200');
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.ok(res.headers.get('content-disposition')?.includes('inline; filename="kontrak_sewa_'));
    assert.equal(res.headers.get('x-contract-hash'), testDocHash);
    assert.ok(res.headers.get('cache-control')?.includes('private, no-cache'));

    const pdfBuffer = Buffer.from(await res.arrayBuffer());
    assert.ok(pdfBuffer.length > 0, 'PDF buffer must not be empty');
    assert.equal(pdfBuffer.subarray(0, 4).toString('ascii'), '%PDF', 'Must be a valid PDF binary');
    assert.ok(pdfBuffer.toString('latin1').includes('%%EOF'), 'Must contain %%EOF PDF trailer');
  });

  await t.test('RBAC Matrix: 2. Permitted Landlord (Property Owner) -> 200 OK with PDF Stream', async () => {
    const res = await fetch(`${baseUrl}/rentals/${testRental1Id}/contract`, {
      headers: { Authorization: `Bearer ${tokenLandlord1}` }
    });

    assert.equal(res.status, 200, 'Property landlord/owner must receive HTTP 200');
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.equal(res.headers.get('x-contract-hash'), testDocHash);

    const pdfBuffer = Buffer.from(await res.arrayBuffer());
    assert.ok(pdfBuffer.length > 0);
    assert.equal(pdfBuffer.subarray(0, 4).toString('ascii'), '%PDF');
  });

  await t.test('RBAC Matrix: 3. Permitted Platform Admin -> 200 OK with PDF Stream', async () => {
    const res = await fetch(`${baseUrl}/rentals/${testRental1Id}/contract`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` }
    });

    assert.equal(res.status, 200, 'Admin must receive HTTP 200');
    assert.equal(res.headers.get('content-type'), 'application/pdf');
    assert.equal(res.headers.get('x-contract-hash'), testDocHash);

    const pdfBuffer = Buffer.from(await res.arrayBuffer());
    assert.ok(pdfBuffer.length > 0);
    assert.equal(pdfBuffer.subarray(0, 4).toString('ascii'), '%PDF');
  });

  await t.test('RBAC Matrix: 4. Download Mode with ?download=true -> Content-Disposition: attachment', async () => {
    const res = await fetch(`${baseUrl}/rentals/${testRental1Id}/contract?download=true`, {
      headers: { Authorization: `Bearer ${tokenTenant1}` }
    });

    assert.equal(res.status, 200);
    assert.ok(
      res.headers.get('content-disposition')?.includes('attachment; filename="kontrak_sewa_'),
      'Content-Disposition header must be attachment when download=true'
    );
  });

  await t.test('RBAC Matrix: 5. Unauthenticated Request (No Token) -> 401 Unauthorized', async () => {
    const res = await fetch(`${baseUrl}/rentals/${testRental1Id}/contract`);
    assert.equal(res.status, 401, 'Unauthenticated request must be rejected with 401');
    const data = await res.json() as Record<string, unknown>;
    assert.ok(typeof data.message === 'string');
    assert.ok((data.message as string).includes('Token'));
  });

  await t.test('RBAC Matrix: 6. Invalid / Malformed JWT Token -> 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/rentals/${testRental1Id}/contract`, {
      headers: { Authorization: `Bearer ${invalidToken}` }
    });
    assert.equal(res.status, 403, 'Invalid token must be rejected with 403');
    const data = await res.json() as Record<string, unknown>;
    assert.ok(typeof data.message === 'string');
    assert.ok((data.message as string).includes('Token tidak valid'));
  });

  await t.test('RBAC Matrix: 7. Third-Party Tenant (Non-party) -> 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/rentals/${testRental1Id}/contract`, {
      headers: { Authorization: `Bearer ${tokenTenant2}` }
    });
    assert.equal(res.status, 403, 'Third-party tenant must receive HTTP 403');
    const data = await res.json() as Record<string, unknown>;
    assert.equal(data.message, 'Akses ditolak ke dokumen kontrak ini.');
  });

  await t.test('RBAC Matrix: 8. Third-Party Landlord (Non-owner) -> 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/rentals/${testRental1Id}/contract`, {
      headers: { Authorization: `Bearer ${tokenLandlord2}` }
    });
    assert.equal(res.status, 403, 'Landlord who does not own the property must receive HTTP 403');
    const data = await res.json() as Record<string, unknown>;
    assert.equal(data.message, 'Akses ditolak ke dokumen kontrak ini.');
  });

  await t.test('RBAC Matrix: 9. Non-Existent Rental ID -> 404 Not Found', async () => {
    const res = await fetch(`${baseUrl}/rentals/non-existent-rental-999/contract`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` }
    });
    assert.equal(res.status, 404, 'Non-existent rental ID must receive 404');
    const data = await res.json() as Record<string, unknown>;
    assert.equal(data.message, 'Data sewa tidak ditemukan.');
  });

  await t.test('RBAC Matrix: 10. Adversarial SQL Injection in Rental ID param is safely parameterized', async () => {
    const sqliId = encodeURIComponent("' OR '1'='1");
    const res = await fetch(`${baseUrl}/rentals/${sqliId}/contract`, {
      headers: { Authorization: `Bearer ${tokenAdmin}` }
    });
    assert.equal(res.status, 404, 'SQL injection attempt in ID parameter must yield safe 404 Not Found');
  });

  // =========================================================================
  // SUITE 2: Preview Endpoint Side-Effects & Idempotence (POST /api/rentals/contract/preview)
  // =========================================================================
  await t.test('Preview Endpoint: 1. Rejects unauthenticated request with 401', async () => {
    const res = await fetch(`${baseUrl}/rentals/contract/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propertyId: testProp1Id, durationMonths: 1 })
    });
    assert.equal(res.status, 401);
  });

  await t.test('Preview Endpoint: 2. Rejects invalid payloads with 400 Bad Request', async () => {
    // Missing propertyId
    const res1 = await fetch(`${baseUrl}/rentals/contract/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenTenant1}`
      },
      body: JSON.stringify({ durationMonths: 1 })
    });
    assert.equal(res1.status, 400);

    // Empty propertyId string
    const res2 = await fetch(`${baseUrl}/rentals/contract/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenTenant1}`
      },
      body: JSON.stringify({ propertyId: '', durationMonths: 1 })
    });
    assert.equal(res2.status, 400);
    const data2 = await res2.json() as Record<string, unknown>;
    assert.ok((data2.message as string).includes('ID properti wajib diisi'));

    // Zero or negative duration
    const res3 = await fetch(`${baseUrl}/rentals/contract/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenTenant1}`
      },
      body: JSON.stringify({ propertyId: testProp1Id, durationMonths: 0 })
    });
    assert.equal(res3.status, 400);
  });

  await t.test('Preview Endpoint: 3. Returns 404 for non-existent property', async () => {
    const res = await fetch(`${baseUrl}/rentals/contract/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenTenant1}`
      },
      body: JSON.stringify({ propertyId: 'prop-non-existent-999', durationMonths: 3 })
    });
    assert.equal(res.status, 404);
    const data = await res.json() as Record<string, unknown>;
    assert.equal(data.message, 'Properti tidak ditemukan.');
  });

  await t.test('Preview Endpoint: 4. Generates valid draft contract preview without side-effects', async () => {
    // Snapshot tenant, property, and landlord state before preview
    const [tenantRentalsBefore] = await pool.query<CountRow[]>('SELECT COUNT(*) as cnt FROM rentals WHERE tenantId = ?', [tenant1.id]);
    const [propsBefore] = await pool.query<PropertyRow[]>('SELECT * FROM properties WHERE id = ?', [testProp1Id]);
    const [landlordBefore] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [landlord1.id]);

    const res = await fetch(`${baseUrl}/rentals/contract/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenTenant1}`
      },
      body: JSON.stringify({
        propertyId: testProp1Id,
        durationMonths: 6,
        startDate: '2026-10-01',
        tenantNikPassport: '5171012308980001',
        signatureBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      })
    });

    assert.equal(res.status, 200, 'Preview endpoint must return HTTP 200');
    const data = await res.json() as Record<string, any>;

    assert.equal(data.success, true);
    assert.ok(data.contractData, 'Must contain contractData');
    assert.equal(data.contractData.propertyName, 'KOSMO Test Villa Denpasar');
    assert.equal(data.contractData.tenantName, tenant1.name);
    assert.equal(data.contractData.landlordName, landlord1.name);
    assert.equal(data.contractData.durationMonths, 6);
    assert.equal(data.contractData.monthlyPrice, 4000000);
    assert.equal(data.contractData.adminFee, 5000);
    assert.equal(data.contractData.totalPrice, (4000000 * 6) + 5000);
    assert.equal(data.totalPrice, (4000000 * 6) + 5000);
    assert.equal(data.adminFee, 5000);
    assert.ok(typeof data.contractHash === 'string');
    assert.equal(data.contractHash.length, 64, 'Contract hash must be 64 hex characters (SHA-256)');

    // Snapshot state after preview
    const [tenantRentalsAfter] = await pool.query<CountRow[]>('SELECT COUNT(*) as cnt FROM rentals WHERE tenantId = ?', [tenant1.id]);
    const [propsAfter] = await pool.query<PropertyRow[]>('SELECT * FROM properties WHERE id = ?', [testProp1Id]);
    const [landlordAfter] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [landlord1.id]);

    // STRICT ZERO SIDE-EFFECT VERIFICATIONS:
    assert.equal(tenantRentalsBefore[0].cnt, tenantRentalsAfter[0].cnt, 'Tenant rentals count must NOT change on preview');
    assert.equal(propsBefore[0].occupiedRooms, propsAfter[0].occupiedRooms, 'Property occupiedRooms must NOT change on preview');
    assert.equal(landlordBefore[0].balance, landlordAfter[0].balance, 'Landlord balance must NOT change on preview');
    assert.equal(landlordBefore[0].totalRevenue, landlordAfter[0].totalRevenue, 'Landlord totalRevenue must NOT change on preview');
  });

  await t.test('Preview Endpoint: 5. Multiple consecutive preview requests are 100% idempotent and leave zero DB footprint', async () => {
    const [tenantRentalsInitial] = await pool.query<CountRow[]>('SELECT COUNT(*) as cnt FROM rentals WHERE tenantId = ?', [tenant2.id]);
    assert.equal(tenantRentalsInitial[0].cnt, 0);

    // Run 10 rapid preview requests
    const previewPromises = Array.from({ length: 10 }).map((_, i) =>
      fetch(`${baseUrl}/rentals/contract/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenTenant2}`
        },
        body: JSON.stringify({
          propertyId: testProp1Id,
          durationMonths: (i % 5) + 1,
          tenantNikPassport: '5171012308980002'
        })
      })
    );

    const responses = await Promise.all(previewPromises);
    for (const r of responses) {
      assert.equal(r.status, 200);
      const json = await r.json() as Record<string, any>;
      assert.equal(json.success, true);
      assert.equal(json.adminFee, 5000);
    }

    const [tenantRentalsFinal] = await pool.query<CountRow[]>('SELECT COUNT(*) as cnt FROM rentals WHERE tenantId = ?', [tenant2.id]);
    assert.equal(tenantRentalsFinal[0].cnt, 0, 'Consecutive previews for tenant2 must have zero side-effects');
  });

  // =========================================================================
  // SUITE 3: Sign Endpoint Single Active Tenancy & Concurrency Safeguards
  // =========================================================================
  await t.test('Sign Endpoint: 1. Enforces Single Active Tenancy covenant -> 409 Conflict', async () => {
    // tenant1 already has an active rental (testRental1Id)
    const res = await fetch(`${baseUrl}/rentals/contract/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenTenant1}`
      },
      body: JSON.stringify({
        propertyId: testProp1Id,
        durationMonths: 2,
        startDate: '2026-11-01',
        tenantNikPassport: '5171012308980001',
        signatureBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        affirmativeConsent: true
      })
    });

    assert.equal(res.status, 409, 'Tenant with existing active rental must receive HTTP 409 Conflict');
    const data = await res.json() as Record<string, any>;
    assert.equal(data.success, false);
    assert.ok(data.message.includes('Single Active Tenancy Violation'));
  });

  await t.test('Sign Endpoint: 2. Rejects booking when property is fully occupied -> 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/rentals/contract/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenTenant2}`
      },
      body: JSON.stringify({
        propertyId: testPropFullId,
        durationMonths: 1,
        startDate: '2026-10-01',
        tenantNikPassport: '5171012308980002',
        signatureBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        affirmativeConsent: true
      })
    });

    assert.equal(res.status, 400, 'Fully occupied property must reject booking with 400 Bad Request');
    const data = await res.json() as Record<string, any>;
    assert.equal(data.message, 'Kamar kos sudah penuh.');
  });

  await t.test('Sign Endpoint: 3. Rejects signing without affirmativeConsent -> 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/rentals/contract/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenTenant2}`
      },
      body: JSON.stringify({
        propertyId: testProp1Id,
        durationMonths: 1,
        startDate: '2026-10-01',
        tenantNikPassport: '5171012308980002',
        signatureBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        affirmativeConsent: false // Must be literal true!
      })
    });

    assert.equal(res.status, 400, 'Must reject when affirmativeConsent is false');
  });

  await t.test('Sign Endpoint: 4. Rejects invalid NIK/Passport formats -> 400 Bad Request', async () => {
    const invalidFormats = [
      '12345', // Too short (5 digits)
      '123456789012345', // 15 digits (Indonesian NIK requires 16)
      '12345678901234567', // 17 digits
      'ABC!@#', // Special characters
      '123456789012345678901' // Too long
    ];

    for (const inv of invalidFormats) {
      const res = await fetch(`${baseUrl}/rentals/contract/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokenTenant2}`
        },
        body: JSON.stringify({
          propertyId: testProp1Id,
          durationMonths: 1,
          startDate: '2026-10-01',
          tenantNikPassport: inv,
          signatureBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          affirmativeConsent: true
        })
      });

      assert.equal(res.status, 400, `Expected 400 for invalid NIK/Passport format: ${inv}`);
    }
  });

  await t.test('Sign Endpoint: 5. Successful signing persists 8 audit columns, increments occupancy and balance', async () => {
    // Record initial uploads folder state to verify zero disk pollution
    const uploadsDir = path.join(process.cwd(), 'backend', 'uploads');
    const filesBefore = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];

    const [propBefore] = await pool.query<PropertyRow[]>('SELECT * FROM properties WHERE id = ?', [testProp1Id]);
    const [landlordBefore] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [landlord1.id]);

    const res = await fetch(`${baseUrl}/rentals/contract/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'KOSMO-Challenger-Bot/1.0',
        'X-Forwarded-For': '203.0.113.195',
        Authorization: `Bearer ${tokenTenant2}`
      },
      body: JSON.stringify({
        propertyId: testProp1Id,
        durationMonths: 3,
        startDate: '2026-10-01',
        tenantNikPassport: '5171012308980002',
        signatureBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        affirmativeConsent: true
      })
    });

    assert.equal(res.status, 201, 'Successful contract signing must return HTTP 201');
    const data = await res.json() as Record<string, any>;
    assert.equal(data.success, true);
    assert.ok(data.rentalId);
    assert.ok(data.contractUrl);
    assert.ok(data.contractHash);
    assert.equal(data.adminFee, 5000);
    assert.equal(data.totalAmount, (4000000 * 3) + 5000);

    // Verify DB state immediately after signing (status must be pending, rooms and balance unchanged)
    const [rentalRows] = await pool.query<RentalRow[]>('SELECT * FROM rentals WHERE id = ?', [data.rentalId]);
    assert.equal(rentalRows.length, 1);
    const r = rentalRows[0];
    assert.equal(r.tenantId, tenant2.id);
    assert.equal(r.propertyId, testProp1Id);
    assert.equal(r.status, 'pending');
    assert.equal(r.contract_hash, data.contractHash);
    assert.equal(r.signer_ip, '203.0.113.195');
    assert.equal(r.signer_user_agent, 'KOSMO-Challenger-Bot/1.0');
    assert.equal(r.tenant_nik_passport, '5171012308980002');
    assert.ok(r.tenant_signature_data);
    assert.equal(Number(r.admin_fee_amount), 5000);

    // Verify property occupiedRooms NOT yet incremented before payment
    const [propBeforePayment] = await pool.query<PropertyRow[]>('SELECT * FROM properties WHERE id = ?', [testProp1Id]);
    assert.equal(propBeforePayment[0].occupiedRooms, propBefore[0].occupiedRooms);

    // Verify landlord revenue and balance NOT yet credited before payment
    const [landlordBeforePayment] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [landlord1.id]);
    assert.equal(Number(landlordBeforePayment[0].balance), Number(landlordBefore[0].balance));

    // Simulate payment settlement webhook
    const serverKey = process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-placeholder';
    const grossAmount = `${(4000000 * 3) + 5000}.00`;
    const payloadStr = `${data.rentalId}200${grossAmount}${serverKey}`;
    const signatureKey = crypto.createHash('sha512').update(payloadStr).digest('hex');

    const webhookRes = await fetch(`${baseUrl}/payment/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: data.rentalId,
        status_code: '200',
        gross_amount: grossAmount,
        signature_key: signatureKey,
        transaction_status: 'settlement'
      })
    });
    assert.equal(webhookRes.status, 200);

    // Verify rental status transitioned to active
    const [activeRentalRows] = await pool.query<RentalRow[]>('SELECT * FROM rentals WHERE id = ?', [data.rentalId]);
    assert.equal(activeRentalRows[0].status, 'active');

    // Verify property occupiedRooms incremented by 1 after payment
    const [propAfter] = await pool.query<PropertyRow[]>('SELECT * FROM properties WHERE id = ?', [testProp1Id]);
    assert.equal(propAfter[0].occupiedRooms, propBefore[0].occupiedRooms + 1);

    // Verify landlord revenue and balance credited by 4000000 * 3 = 12000000 after payment
    const [landlordAfter] = await pool.query<UserRow[]>('SELECT * FROM users WHERE id = ?', [landlord1.id]);
    assert.equal(Number(landlordAfter[0].balance), Number(landlordBefore[0].balance) + 12000000);
    assert.equal(Number(landlordAfter[0].totalRevenue), Number(landlordBefore[0].totalRevenue) + 12000000);

    // Verify now that tenant2 has an active rental, tenant2 can access their contract via GET /rentals/:id/contract
    const contractRes = await fetch(`${baseUrl}/rentals/${data.rentalId}/contract`, {
      headers: { Authorization: `Bearer ${tokenTenant2}` }
    });
    assert.equal(contractRes.status, 200);
    assert.equal(contractRes.headers.get('content-type'), 'application/pdf');
    assert.equal(contractRes.headers.get('x-contract-hash'), data.contractHash);

    // Verify zero local disk file pollution
    const filesAfter = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
    assert.equal(
      filesBefore.length,
      filesAfter.length,
      'PDF generation and streaming must NOT write temporary files into backend/uploads/'
    );
  });
});
