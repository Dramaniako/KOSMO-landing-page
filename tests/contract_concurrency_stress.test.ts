(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
(process.env as Record<string, string | undefined>).NO_LISTEN = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import http from 'node:http';
import express from 'express';
import bodyParser from 'body-parser';
import router from '../backend/router';
import { pool, ensureDbReady } from '../backend/db';
import { generateJwtToken } from '../backend/middleware/auth';
import type { RowDataPacket } from 'mysql2/promise';

interface RentalRow extends RowDataPacket {
  id: string;
  tenantId: string;
  propertyId: string;
  propertyName: string;
  price: number;
  startDate: string;
  status: string;
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

test('DEEP ADVERSARIAL STRESS: High-Concurrency Storms, Race Conditions & Rollback Purity', async (t) => {
  await ensureDbReady();

  // Create isolated Express test instance on dynamic port 0
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

  t.after(() => {
    server.close();
  });

  const validSignatureBase64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAAyCAYAAACqNX6+AAAALElEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAeAMReAABl4wZFAAAAABJRU5ErkJggg==';

  // =========================================================================
  // TEST 1: 20x Concurrent Requests Racing for 3 Rooms Across 20 Tenants
  // =========================================================================
  await t.test('Adversarial Storm 1: 20 distinct tenants competing simultaneously for exactly 3 available rooms', async () => {
    const tag = crypto.randomBytes(4).toString('hex');
    const landlordId = `landlord-storm1-${tag}`;
    const propId = `prop-storm1-${tag}`;
    const monthlyPrice = 3000000;
    const initialOccupied = 7;
    const totalRooms = 10;
    const availableRooms = totalRooms - initialOccupied; // 3 rooms available

    // Seed Landlord and Property
    await pool.query(
      "INSERT INTO users (id, name, email, role, password, balance, totalRevenue) VALUES (?, 'Storm Landlord', ?, 'landlord', '$2a$10$abcdefghijklmnopqrstuu', 500000, 500000)",
      [landlordId, `landlord-storm-${tag}@kosmo.test`]
    );
    await pool.query(
      "INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId) VALUES (?, 'KOSMO Storm Haven', 'Canggu', 'Jl. Pantai Batu Bolong, Canggu', ?, ?, ?, ?)",
      [propId, monthlyPrice, totalRooms, initialOccupied, landlordId]
    );

    // Seed 20 distinct tenants
    const tenantIds: string[] = [];
    const tenantTokens: string[] = [];
    for (let i = 0; i < 20; i++) {
      const tId = `tenant-storm1-${tag}-${i}`;
      tenantIds.push(tId);
      await pool.query(
        "INSERT INTO users (id, name, email, role, password) VALUES (?, ?, ?, 'tenant', '$2a$10$abcdefghijklmnopqrstuu')",
        [tId, `Storm Tenant ${i}`, `tenant-storm-${tag}-${i}@kosmo.test`]
      );
      tenantTokens.push(
        generateJwtToken({ id: tId, email: `tenant-storm-${tag}-${i}@kosmo.test`, role: 'tenant' })
      );
    }

    try {
      // Fire 20 requests concurrently to sign contract for the same property
      const promises = tenantTokens.map((tok, index) => {
        return fetch(`${baseUrl}/rentals/contract/sign`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tok}`,
            'X-Forwarded-For': `192.168.10.${100 + index}`,
            'User-Agent': `StormClient/${index}`
          },
          body: JSON.stringify({
            propertyId: propId,
            durationMonths: 2,
            startDate: '2026-10-01',
            tenantNikPassport: `517101230898${(1000 + index).toString()}`,
            signatureBase64: validSignatureBase64,
            affirmativeConsent: true
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
      // Exactly 3 requests must succeed (201 Created) because availableRooms = 3.
      // Exactly 17 requests must fail (400 Bad Request: "Kamar kos sudah penuh.").
      // ZERO requests can fail with 500, deadlock, or unexpected errors.
      assert.equal(
        statusCounts[201],
        availableRooms,
        `Exactly ${availableRooms} requests must succeed with 201 Created. Got: ${JSON.stringify(statusCounts)}`
      );
      assert.equal(
        statusCounts[400],
        20 - availableRooms,
        `Exactly ${20 - availableRooms} requests must fail with 400 Bad Request. Got: ${JSON.stringify(statusCounts)}`
      );
      assert.equal(statusCounts[500] || 0, 0, 'Zero 500 server errors or deadlocks allowed under high concurrency');

      // Verify persistent property state: occupiedRooms MUST be exactly 10 (totalRooms)
      const [propRows] = await pool.query<PropertyRow[]>('SELECT totalRooms, occupiedRooms FROM properties WHERE id = ?', [propId]);
      assert.equal(propRows[0].occupiedRooms, totalRooms, `occupiedRooms must equal ${totalRooms}`);

      // Verify rentals table contains EXACTLY 3 active leases for this property
      const [rentals] = await pool.query<RentalRow[]>('SELECT * FROM rentals WHERE propertyId = ?', [propId]);
      assert.equal(rentals.length, availableRooms, `Database must contain exactly ${availableRooms} rentals for this property`);

      // Verify landlord financial balance & revenue:
      // 3 successful rentals * (2 months * 3,000,000) = 18,000,000 added
      const expectedBalance = 500000 + (availableRooms * monthlyPrice * 2);
      const [landlordRows] = await pool.query<UserRow[]>('SELECT balance, totalRevenue FROM users WHERE id = ?', [landlordId]);
      assert.equal(
        Number(landlordRows[0].balance),
        expectedBalance,
        `Landlord balance must match exact arithmetic sum: ${expectedBalance}`
      );
      assert.equal(
        Number(landlordRows[0].totalRevenue),
        expectedBalance,
        `Landlord totalRevenue must match exact arithmetic sum: ${expectedBalance}`
      );
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
  // TEST 2: Single Active Tenancy Collision with Cross-Property Simultaneous Signing
  // =========================================================================
  await t.test('Adversarial Storm 2: Same tenant firing 15 simultaneous requests across 5 different properties', async () => {
    const tag = crypto.randomBytes(4).toString('hex');
    const tenantId = `tenant-poly-${tag}`;
    const landlordId = `landlord-poly-${tag}`;
    const propIds: string[] = [];

    // Seed Tenant & Landlord
    await pool.query(
      "INSERT INTO users (id, name, email, role, password) VALUES (?, 'Poly Tenant', ?, 'tenant', '$2a$10$abcdefghijklmnopqrstuu')",
      [tenantId, `poly-tenant-${tag}@kosmo.test`]
    );
    await pool.query(
      "INSERT INTO users (id, name, email, role, password, balance, totalRevenue) VALUES (?, 'Poly Landlord', ?, 'landlord', '$2a$10$abcdefghijklmnopqrstuu', 0, 0)",
      [landlordId, `poly-landlord-${tag}@kosmo.test`]
    );

    // Seed 5 properties each with 10 rooms
    for (let p = 0; p < 5; p++) {
      const pId = `prop-poly-${tag}-${p}`;
      propIds.push(pId);
      await pool.query(
        "INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId) VALUES (?, ?, 'Sanur', 'Sanur, Bali', 3500000, 10, 0, ?)",
        [pId, `KOSMO Villa Poly ${p}`, landlordId]
      );
    }

    const token = generateJwtToken({ id: tenantId, email: `poly-tenant-${tag}@kosmo.test`, role: 'tenant' });

    try {
      // 15 requests spread across the 5 properties
      const promises = Array.from({ length: 15 }, (_, i) => {
        const targetProp = propIds[i % propIds.length];
        return fetch(`${baseUrl}/rentals/contract/sign`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            propertyId: targetProp,
            durationMonths: 1,
            startDate: '2026-11-01',
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

      const statusCounts: Record<number, number> = {};
      for (const r of results) {
        statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      }

      // EMPIRICAL ORACLE:
      // Exactly 1 request succeeds (201).
      // Exactly 14 requests fail with 409 Conflict.
      assert.equal(statusCounts[201], 1, `Exactly 1 request must succeed. Got: ${JSON.stringify(statusCounts)}`);
      assert.equal(statusCounts[409], 14, `Exactly 14 requests must be rejected with 409 Conflict. Got: ${JSON.stringify(statusCounts)}`);

      // Verify DB has strictly 1 active rental for this tenant
      const [rentals] = await pool.query<RentalRow[]>('SELECT * FROM rentals WHERE tenantId = ? AND status = "active"', [tenantId]);
      assert.equal(rentals.length, 1, 'Tenant must have exactly 1 active rental in database');

      // Verify total occupied rooms across all 5 properties equals exactly 1
      const [allProps] = await pool.query<PropertyRow[]>('SELECT occupiedRooms FROM properties WHERE id IN (?)', [propIds]);
      const totalOccupied = allProps.reduce((sum, p) => sum + Number(p.occupiedRooms), 0);
      assert.equal(totalOccupied, 1, 'Total occupied rooms across all 5 properties must equal exactly 1');
    } finally {
      await pool.query('DELETE FROM rentals WHERE tenantId = ?', [tenantId]);
      await pool.query('DELETE FROM properties WHERE id IN (?)', [propIds]);
      await pool.query('DELETE FROM users WHERE id IN (?, ?)', [tenantId, landlordId]);
    }
  });

  // =========================================================================
  // TEST 3: SQL Injection & Adversarial Payloads in Audit Fields
  // =========================================================================
  await t.test('Adversarial Payloads: SQL Injection and XSS strings in audit trail headers are sanitized and parameterized', async () => {
    const tag = crypto.randomBytes(4).toString('hex');
    const tenantId = `tenant-xss-${tag}`;
    const landlordId = `landlord-xss-${tag}`;
    const propId = `prop-xss-${tag}`;

    await pool.query(
      "INSERT INTO users (id, name, email, role, password) VALUES (?, 'Sec Tenant', ?, 'tenant', '$2a$10$abcdefghijklmnopqrstuu')",
      [tenantId, `sec-${tag}@kosmo.test`]
    );
    await pool.query(
      "INSERT INTO users (id, name, email, role, password, balance, totalRevenue) VALUES (?, 'Sec Landlord', ?, 'landlord', '$2a$10$abcdefghijklmnopqrstuu', 0, 0)",
      [landlordId, `sec-landlord-${tag}@kosmo.test`]
    );
    await pool.query(
      "INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId) VALUES (?, 'KOSMO Sec House', 'Kuta', 'Kuta, Bali', 2500000, 5, 0, ?)",
      [propId, landlordId]
    );

    const token = generateJwtToken({ id: tenantId, email: `sec-${tag}@kosmo.test`, role: 'tenant' });

    const sqlInjectionIp = "127.0.0.1'; DROP TABLE rentals; --";
    const xssUserAgent = "<script>alert('xss')</script> Mozilla/5.0";

    try {
      const res = await fetch(`${baseUrl}/rentals/contract/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Forwarded-For': sqlInjectionIp,
          'User-Agent': xssUserAgent
        },
        body: JSON.stringify({
          propertyId: propId,
          durationMonths: 1,
          startDate: '2026-10-15',
          tenantNikPassport: '5171012308980001',
          signatureBase64: validSignatureBase64,
          affirmativeConsent: true
        })
      });

      assert.equal(res.status, 201, 'Request with special characters in headers must succeed safely');
      const data = await res.json() as Record<string, any>;

      // Verify rentals table is intact and injection was parameterized safely
      const [rentals] = await pool.query<RentalRow[]>('SELECT * FROM rentals WHERE id = ?', [data.rentalId]);
      assert.equal(rentals.length, 1);
      assert.equal(rentals[0].signer_ip, sqlInjectionIp);
      assert.equal(rentals[0].signer_user_agent, xssUserAgent);
    } finally {
      await pool.query('DELETE FROM rentals WHERE tenantId = ?', [tenantId]);
      await pool.query('DELETE FROM properties WHERE id = ?', [propId]);
      await pool.query('DELETE FROM users WHERE id IN (?, ?)', [tenantId, landlordId]);
    }
  });
});
