(process.env as Record<string, string | undefined>).NO_LISTEN = 'true';
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import { pool, initDb, seedDatabase, parseEnvValue } from '../backend/db';
import { validateServerEnv } from '../backend/config/env';
import app, { isOriginAllowed } from '../backend/server';
import { generateJwtToken, getJwtSecret, resetJwtSecretCache } from '../backend/middleware/auth';
import { sanitizeSpreadsheetCell } from '../backend/routes/tracking.routes';
import { settleRentalPayment } from '../backend/routes/payment.routes';

const env = process.env as Record<string, string | undefined>;

function setEnv(key: string, val: string | undefined): void {
  if (val === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = val;
  }
}

test('Audit Hardening Suite (SEC-01..07, DB-01..04, API-01..03, FE-01)', async (t) => {
  await initDb();
  await seedDatabase();

  let server: http.Server;
  let baseUrl: string;

  await new Promise<void>((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  const testSuffix = Date.now().toString();
  const landlordId = `user-audit-ll-${testSuffix}`;
  const tenantIdA = `user-audit-t1-${testSuffix}`;
  const tenantIdB = `user-audit-t2-${testSuffix}`;
  const propId = `prop-audit-${testSuffix}`;
  const room1Id = `room-audit-1-${testSuffix}`;
  const room2Id = `room-audit-2-${testSuffix}`;
  const renewRentalId = `rent-renew-${testSuffix}`;
  const holdRentalId = `rent-hold-${testSuffix}`;
  const priceInjectRentalId = `rent-pinj-${testSuffix}`;

  const hash = await bcrypt.hash('Password123!', 10);
  await pool.query(
    `INSERT INTO users (id, email, password, name, role, phone, balance, totalRevenue, identity_type, identity_number, address, occupation, emergency_contact_name, emergency_contact_phone)
     VALUES
       (?, ?, ?, 'Audit Landlord', 'landlord', '081200001111', 0, 0, 'NIK', '5171011111111111', 'Jl. Sunset No. 1, Bali', 'Owner', 'Keluarga', '081200001112'),
       (?, ?, ?, 'Audit Tenant A', 'tenant', '081200002222', 0, 0, 'NIK', '5171012222222222', 'Jl. Kuta No. 2, Bali', 'Engineer', 'Ibu', '081200002223'),
       (?, ?, ?, 'Audit Tenant B', 'tenant', '081200003333', 0, 0, 'NIK', '5171013333333333', 'Jl. Ubud No. 3, Bali', 'Designer', 'Ayah', '081200003334')`,
    [
      landlordId,
      `audit-ll-${testSuffix}@kosmo.test`,
      hash,
      tenantIdA,
      `audit-t1-${testSuffix}@kosmo.test`,
      hash,
      tenantIdB,
      `audit-t2-${testSuffix}@kosmo.test`,
      hash
    ]
  );

  await pool.query(
    `INSERT INTO properties (id, name, district, address, price, rating, totalRooms, occupiedRooms, ownerId)
     VALUES (?, 'Kos Audit Suite', 'Badung', 'Jl. Audit Raya No. 99', 2000000, 5.0, 2, 0, ?)`,
    [propId, landlordId]
  );

  await pool.query(
    `INSERT INTO property_facilities (propertyId, facility) VALUES (?, 'Wifi'), (?, 'Listrik')`,
    [propId, propId]
  );

  await pool.query(
    `INSERT INTO rooms (id, propertyId, roomNumber, floor, type, price, status)
     VALUES (?, ?, '101', 1, 'Deluxe', 2500000, 'available'),
            (?, ?, '102', 1, 'Standard', NULL, 'available')`,
    [room1Id, propId, room2Id, propId]
  );

  const adminToken = generateJwtToken({ id: 'user-admin', email: 'admin@kosmo.com', role: 'admin' });
  const tenantAToken = generateJwtToken({ id: tenantIdA, email: `audit-t1-${testSuffix}@kosmo.test`, role: 'tenant' });
  const tenantBToken = generateJwtToken({ id: tenantIdB, email: `audit-t2-${testSuffix}@kosmo.test`, role: 'tenant' });

  t.after(async () => {
    server.close();
    await pool.query('DELETE FROM payment_transactions WHERE rental_id IN (?, ?, ?)', [
      renewRentalId,
      holdRentalId,
      priceInjectRentalId
    ]);
    await pool.query('DELETE FROM reviews WHERE propertyId = ?', [propId]);
    await pool.query('DELETE FROM rentals WHERE propertyId = ?', [propId]);
    await pool.query('DELETE FROM rooms WHERE propertyId = ?', [propId]);
    await pool.query('DELETE FROM property_facilities WHERE propertyId = ?', [propId]);
    await pool.query('DELETE FROM properties WHERE id = ?', [propId]);
    await pool.query('DELETE FROM users WHERE id IN (?, ?, ?)', [landlordId, tenantIdA, tenantIdB]);
  });

  await t.test('SEC-01: Renewal webhook replay is strictly idempotent via payment_transactions ledger', async () => {
    await pool.query(
      `INSERT INTO rentals (id, tenantId, propertyId, roomId, propertyName, price, startDate, start_date_iso, status, admin_fee_amount, duration_months)
       VALUES (?, ?, ?, ?, 'Kos Audit Suite', 2000000, '2026-10-01', '2026-10-01', 'active', 5000, 1)`,
      [renewRentalId, tenantIdA, propId, room2Id]
    );
    await pool.query("UPDATE rooms SET status = 'occupied' WHERE id = ?", [room2Id]);

    const renewOrderId = `RENEW-${renewRentalId}-1126-${Date.now()}`;
    const grossAmount = 2005000;

    // 1st settlement
    const first = await settleRentalPayment(renewOrderId, grossAmount);
    assert.equal(first.success, true);
    assert.equal(first.statusCode, 200);

    // 2nd identical replay (must NOT increment duration_months or balance twice)
    const second = await settleRentalPayment(renewOrderId, grossAmount);
    assert.equal(second.success, true);
    assert.equal(second.statusCode, 200);
    assert.match(second.message, /sudah diproses sebelumnya/i);

    const [[rentalRow]] = await pool.query<Array<{ duration_months: number } & import('mysql2/promise').RowDataPacket>>(
      'SELECT duration_months FROM rentals WHERE id = ?',
      [renewRentalId]
    );
    assert.equal(Number(rentalRow.duration_months), 2);

    const [[llRow]] = await pool.query<Array<{ balance: string } & import('mysql2/promise').RowDataPacket>>(
      'SELECT balance FROM users WHERE id = ?',
      [landlordId]
    );
    // 97% of 2,000,000 = 1,940,000 credited ONCE
    assert.equal(Number(llRow.balance), 1940000);

    // Cleanup active lease so tenantA can test room holds / bookings cleanly
    await pool.query("UPDATE rentals SET status = 'terminated' WHERE id = ?", [renewRentalId]);
    await pool.query("UPDATE rooms SET status = 'available' WHERE id = ?", [room2Id]);
  });

  await t.test('DB-03: Payment token places 15-min soft hold on room blocking competing tenant checkout', async () => {
    const res1 = await fetch(`${baseUrl}/api/payment/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantAToken}`
      },
      body: JSON.stringify({
        propertyId: propId,
        roomId: room1Id,
        durationMonths: 1,
        customRentalId: holdRentalId
      })
    });
    assert.equal(res1.status, 200);

    const [[heldRoom]] = await pool.query<Array<{ reserved_by_rental_id: string; ttlSeconds: number } & import('mysql2/promise').RowDataPacket>>(
      'SELECT reserved_by_rental_id, TIMESTAMPDIFF(SECOND, NOW(), reserved_until) AS ttlSeconds FROM rooms WHERE id = ?',
      [room1Id]
    );
    assert.equal(heldRoom.reserved_by_rental_id, holdRentalId);
    assert.ok(Number(heldRoom.ttlSeconds) > 60 && Number(heldRoom.ttlSeconds) <= 905);

    // Competing tenant B tries to grab the held room -> must receive 409 Conflict
    const res2 = await fetch(`${baseUrl}/api/payment/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantBToken}`
      },
      body: JSON.stringify({
        propertyId: propId,
        roomId: room1Id,
        durationMonths: 1
      })
    });
    assert.equal(res2.status, 409);

    // Cancel pending rental -> hold must be released
    const cancelRes = await fetch(`${baseUrl}/api/rentals/${holdRentalId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tenantAToken}` }
    });
    assert.equal(cancelRes.status, 200);

    const [[releasedRoom]] = await pool.query<Array<{ reserved_by_rental_id: string | null } & import('mysql2/promise').RowDataPacket>>(
      'SELECT reserved_by_rental_id FROM rooms WHERE id = ?',
      [room1Id]
    );
    assert.equal(releasedRoom.reserved_by_rental_id, null);
  });

  await t.test('SEC-02: POST /api/rentals ignores client price tampering and enforces authoritative DB price', async () => {
    const res = await fetch(`${baseUrl}/api/rentals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantBToken}`
      },
      body: JSON.stringify({
        propertyId: propId,
        roomId: room1Id,
        tenantId: tenantIdB,
        price: 1,
        durationMonths: 1,
        rentalId: priceInjectRentalId
      })
    });
    assert.equal(res.status, 201);

    const [[inserted]] = await pool.query<Array<{ price: number } & import('mysql2/promise').RowDataPacket>>(
      'SELECT price FROM rentals WHERE id = ?',
      [priceInjectRentalId]
    );
    assert.equal(Number(inserted.price), 2500000);
  });

  await t.test('SEC-06 & FE-01: Reviews enforce verified tenancy & ownerId filter, properties accept facilities & facility', async () => {
    // Tenant A has a terminated rental on propId -> permitted once
    const okReviewRes = await fetch(`${baseUrl}/api/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantAToken}`
      },
      body: JSON.stringify({
        propertyId: propId,
        rating: 5,
        comment: 'Sangat nyaman dan tenang untuk WFH!'
      })
    });
    assert.equal(okReviewRes.status, 201);

    // Duplicate review by Tenant A -> 409 Conflict
    const dupReviewRes = await fetch(`${baseUrl}/api/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantAToken}`
      },
      body: JSON.stringify({
        propertyId: propId,
        rating: 4,
        comment: 'Review ganda seharusnya ditolak.'
      })
    });
    assert.equal(dupReviewRes.status, 409);

    // Unverified non-tenant review on prop-02 -> 403 Forbidden
    const unverifiedRes = await fetch(`${baseUrl}/api/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantAToken}`
      },
      body: JSON.stringify({
        propertyId: 'prop-02',
        rating: 5,
        comment: 'Belum pernah menyewa properti ini.'
      })
    });
    assert.equal(unverifiedRes.status, 403);

    // GET /api/reviews?ownerId= returns only properties owned by landlordId
    const ownerRevRes = await fetch(`${baseUrl}/api/reviews?ownerId=${encodeURIComponent(landlordId)}`);
    assert.equal(ownerRevRes.status, 200);
    const ownerReviews = (await ownerRevRes.json()) as Array<{ propertyId: string }>;
    assert.equal(ownerReviews.length, 1);
    assert.equal(ownerReviews[0].propertyId, propId);

    // GET /api/properties?facilities=Wifi works symmetrically with ?facility=Wifi
    const facRes = await fetch(`${baseUrl}/api/properties?facilities=Wifi,Listrik`);
    assert.equal(facRes.status, 200);
    const facProps = (await facRes.json()) as Array<{ id: string }>;
    assert.ok(facProps.some((p) => p.id === propId));
  });

  await t.test('SEC-03, SEC-04, SEC-07, API-02, OPS-01: Scoped download tokens, CORS, XLSX formula neutralizer, users pagination & env quotes', async () => {
    // 1. Download token scope enforcement
    const dlRes = await fetch(`${baseUrl}/api/reports/download-token`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(dlRes.status, 200);
    const { downloadToken } = (await dlRes.json()) as { downloadToken: string };
    assert.ok(downloadToken);

    // Scoped download token rejected on non-report endpoints
    const misuseRes = await fetch(`${baseUrl}/api/auth/me?downloadToken=${encodeURIComponent(downloadToken)}`);
    assert.equal(misuseRes.status, 403);

    // Scoped download token accepted on Excel report endpoint
    const reportRes = await fetch(`${baseUrl}/api/reports/tracking/excel?downloadToken=${encodeURIComponent(downloadToken)}`);
    assert.equal(reportRes.status, 200);

    // 2. XLSX Formula Sanitization
    assert.equal(sanitizeSpreadsheetCell('=CMD|"/c calc"!A0'), `'=CMD|"/c calc"!A0`);
    assert.equal(sanitizeSpreadsheetCell('+SUM(A1:A2)'), `'+SUM(A1:A2)`);
    assert.equal(sanitizeSpreadsheetCell('-1+1'), `'-1+1`);
    assert.equal(sanitizeSpreadsheetCell('@IMPORTXML("https://evil.com")'), `'@IMPORTXML("https://evil.com")`);
    assert.equal(sanitizeSpreadsheetCell('Normal Tenant Name'), 'Normal Tenant Name');
    assert.equal(sanitizeSpreadsheetCell(3500000), 3500000);

    // 3. Project-scoped CORS validation
    assert.equal(isOriginAllowed('https://kosmo-bali-git-main.vercel.app'), true);
    assert.equal(isOriginAllowed('https://evil-app.vercel.app'), false);

    // 4. Users pagination + X-Total-Count
    const usersRes = await fetch(`${baseUrl}/api/users?limit=2&page=1`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(usersRes.status, 200);
    const totalHeader = usersRes.headers.get('x-total-count');
    assert.ok(totalHeader && Number(totalHeader) >= 3);
    const usersList = (await usersRes.json()) as unknown[];
    assert.equal(usersList.length, 2);

    // 5. .env quote stripping & production JWT fail-fast
    assert.equal(parseEnvValue('"super_secret_value"'), 'super_secret_value');
    assert.equal(parseEnvValue(" 'hello' "), 'hello');

    const origEnv = env.NODE_ENV;
    const origSecret = env.JWT_SECRET;
    try {
      setEnv('NODE_ENV', 'production');
      setEnv('JWT_SECRET', '');
      resetJwtSecretCache();
      assert.throws(() => getJwtSecret(), /JWT_SECRET environment variable is required in production/);
      const envCheck = validateServerEnv({ NODE_ENV: 'production', JWT_SECRET: '' });
      assert.equal(envCheck.valid, false);
    } finally {
      setEnv('NODE_ENV', origEnv);
      setEnv('JWT_SECRET', origSecret);
      resetJwtSecretCache();
    }
  });
});
