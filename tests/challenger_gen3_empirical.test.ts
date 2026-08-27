(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
(process.env as Record<string, string | undefined>).NO_LISTEN = 'true';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import http from 'node:http';
import express from 'express';
import bodyParser from 'body-parser';
import router, { computePaymentSchedule } from '../backend/router';
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
  duration_months?: number;
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

test('EMPIRICAL CHALLENGE SUITE: Generation 3 Tenancy Lifecycle, Concurrency & Lease Schedule (R4, R5, R6)', async (t) => {
  await ensureDbReady();

  // Create isolated Express test instance
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
  const serverKey = process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-placeholder';

  t.after(() => {
    server.close();
  });

  const validSignatureBase64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAAAyCAYAAACqNX6+AAAALElEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAeAMReAABl4wZFAAAAABJRU5ErkJggg==';

  // Helper for generating Midtrans signature
  function createMidtransSignature(orderId: string, statusCode: string, grossAmount: string): string {
    const payload = `${orderId}${statusCode}${grossAmount}${serverKey}`;
    return crypto.createHash('sha512').update(payload).digest('hex');
  }

  // =========================================================================
  // REQUIREMENT 4 & 5: Decoupled Contract Signing -> Pending Lifecycle
  // =========================================================================
  await t.test('R4 & R5: Contract signing creates pending rental, leaving occupiedRooms and balance completely untouched', async () => {
    const tag = crypto.randomBytes(4).toString('hex');
    const tenantId = `t-sign-decouple-${tag}`;
    const landlordId = `l-sign-decouple-${tag}`;
    const propId = `p-sign-decouple-${tag}`;
    const monthlyPrice = 3500000;
    const initialOccupied = 2;
    const totalRooms = 8;
    const durationMonths = 3;

    // Seed test users & property
    await pool.query(
      `INSERT INTO users (
        id, name, email, role, password, phone, identity_type, identity_number, address, occupation, emergency_contact_name, emergency_contact_phone, balance, totalRevenue
      ) VALUES (?, 'Decoupled Tenant', ?, 'tenant', '$2a$10$hash', '+6281234567890', 'NIK', '5171012308980001', 'Jl. Canggu No. 1, Bali', 'Designer', 'Emergency Contact', '+6281234567899', 0, 0)`,
      [tenantId, `tenant-decouple-${tag}@kosmo.test`]
    );
    await pool.query(
      "INSERT INTO users (id, name, email, role, password, balance, totalRevenue) VALUES (?, 'Decoupled Landlord', ?, 'landlord', '$2a$10$hash', 1000000, 1000000)",
      [landlordId, `landlord-decouple-${tag}@kosmo.test`]
    );
    await pool.query(
      "INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId) VALUES (?, 'KOSMO Decoupled Retreat', 'Canggu', 'Canggu, Bali', ?, ?, ?, ?)",
      [propId, monthlyPrice, totalRooms, initialOccupied, landlordId]
    );

    const token = generateJwtToken({ id: tenantId, email: `tenant-decouple-${tag}@kosmo.test`, role: 'tenant' });

    try {
      // 1. Sign contract
      const signRes = await fetch(`${baseUrl}/rentals/contract/sign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Forwarded-For': '180.252.164.50',
          'User-Agent': 'KOSMO-Decoupled-Tester/1.0'
        },
        body: JSON.stringify({
          propertyId: propId,
          durationMonths,
          startDate: '2026-09-01',
          tenantNikPassport: '5171012308980001',
          signatureBase64: validSignatureBase64,
          affirmativeConsent: true
        })
      });

      assert.equal(signRes.status, 201, 'Contract signing must return HTTP 201 Created');
      const signData = await signRes.json() as Record<string, any>;
      assert.equal(signData.success, true);
      const rentalId = signData.rentalId;
      assert.ok(rentalId);
      assert.equal(signData.adminFee, 5000);
      assert.equal(signData.totalAmount, (monthlyPrice * durationMonths) + 5000);

      // EMPIRICAL VERIFICATION 1: Rental status is 'pending'
      const [rentalRows] = await pool.query<RentalRow[]>('SELECT * FROM rentals WHERE id = ?', [rentalId]);
      assert.equal(rentalRows.length, 1);
      const rental = rentalRows[0];
      assert.equal(rental.status, 'pending', "Rental status immediately after signing MUST be 'pending'");
      assert.equal(Number(rental.duration_months), durationMonths);
      assert.equal(rental.signer_ip, '180.252.164.50');
      assert.equal(rental.signer_user_agent, 'KOSMO-Decoupled-Tester/1.0');
      assert.equal(rental.tenant_nik_passport, '5171012308980001');
      assert.equal(Number(rental.admin_fee_amount), 5000);

      // EMPIRICAL VERIFICATION 2: Property occupiedRooms is COMPLETELY UNTOUCHED
      const [propRows] = await pool.query<PropertyRow[]>('SELECT occupiedRooms, totalRooms FROM properties WHERE id = ?', [propId]);
      assert.equal(
        propRows[0].occupiedRooms,
        initialOccupied,
        `Property occupiedRooms MUST remain ${initialOccupied} (NOT incremented before payment)`
      );

      // EMPIRICAL VERIFICATION 3: Landlord balance is COMPLETELY UNTOUCHED
      const [landlordRows] = await pool.query<UserRow[]>('SELECT balance, totalRevenue FROM users WHERE id = ?', [landlordId]);
      assert.equal(
        Number(landlordRows[0].balance),
        1000000,
        'Landlord balance MUST remain 1,000,000 (NOT credited before payment)'
      );
      assert.equal(
        Number(landlordRows[0].totalRevenue),
        1000000,
        'Landlord totalRevenue MUST remain 1,000,000 (NOT credited before payment)'
      );
    } finally {
      await pool.query('DELETE FROM rentals WHERE propertyId = ?', [propId]);
      await pool.query('DELETE FROM properties WHERE id = ?', [propId]);
      await pool.query('DELETE FROM users WHERE id IN (?, ?)', [tenantId, landlordId]);
    }
  });

  // =========================================================================
  // REQUIREMENT 4 & 5: Abandoned Checkouts / Cancellation Flow
  // =========================================================================
  await t.test('R4 & R5: Abandoned checkouts & cancellation webhooks prevent room count leakage', async () => {
    const tag = crypto.randomBytes(4).toString('hex');
    const tenantId = `t-abandon-${tag}`;
    const landlordId = `l-abandon-${tag}`;
    const propId = `p-abandon-${tag}`;
    const monthlyPrice = 4000000;
    const initialOccupied = 4;
    const totalRooms = 10;

    await pool.query(
      `INSERT INTO users (
        id, name, email, role, password, phone, identity_type, identity_number, address, occupation, emergency_contact_name, emergency_contact_phone, balance, totalRevenue
      ) VALUES (?, 'Abandon Tenant', ?, 'tenant', '$2a$10$hash', '+6281234567890', 'NIK', '5171012308980001', 'Jl. Seminyak No. 2, Bali', 'Analyst', 'Emergency Contact', '+6281234567899', 0, 0)`,
      [tenantId, `tenant-abandon-${tag}@kosmo.test`]
    );
    await pool.query(
      "INSERT INTO users (id, name, email, role, password, balance, totalRevenue) VALUES (?, 'Abandon Landlord', ?, 'landlord', '$2a$10$hash', 0, 0)",
      [landlordId, `landlord-abandon-${tag}@kosmo.test`]
    );
    await pool.query(
      "INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId) VALUES (?, 'KOSMO Abandon Haven', 'Seminyak', 'Seminyak, Bali', ?, ?, ?, ?)",
      [propId, monthlyPrice, totalRooms, initialOccupied, landlordId]
    );

    const token = generateJwtToken({ id: tenantId, email: `tenant-abandon-${tag}@kosmo.test`, role: 'tenant' });

    try {
      // 1. Tenant signs contract -> pending
      const signRes = await fetch(`${baseUrl}/rentals/contract/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          propertyId: propId,
          durationMonths: 1,
          startDate: '2026-09-01',
          tenantNikPassport: '5171012308980001',
          signatureBase64: validSignatureBase64,
          affirmativeConsent: true
        })
      });
      assert.equal(signRes.status, 201);
      const signData = await signRes.json() as Record<string, any>;
      const rentalId = signData.rentalId;

      // 2. Checkout is cancelled / expired -> webhook notification: transaction_status = 'expire'
      const cancelWebhookRes = await fetch(`${baseUrl}/payment/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: rentalId,
          status_code: '200',
          gross_amount: `${monthlyPrice + 5000}.00`,
          signature_key: createMidtransSignature(rentalId, '200', `${monthlyPrice + 5000}.00`),
          transaction_status: 'expire'
        })
      });
      assert.equal(cancelWebhookRes.status, 200);

      // EMPIRICAL VERIFICATION: Rental status is 'cancelled'
      const [rentalRows] = await pool.query<RentalRow[]>('SELECT * FROM rentals WHERE id = ?', [rentalId]);
      assert.equal(rentalRows[0].status, 'cancelled', "Rental status must be updated to 'cancelled'");

      // EMPIRICAL VERIFICATION: Occupancy has NO LEAKAGE
      const [propRows] = await pool.query<PropertyRow[]>('SELECT occupiedRooms FROM properties WHERE id = ?', [propId]);
      assert.equal(propRows[0].occupiedRooms, initialOccupied, 'occupiedRooms must remain untouched with no leakage');

      // EMPIRICAL VERIFICATION: Tenant is NOT blocked from signing a new rental (Single Active Tenancy only checks status = 'active')
      const secondSignRes = await fetch(`${baseUrl}/rentals/contract/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          propertyId: propId,
          durationMonths: 2,
          startDate: '2026-10-01',
          tenantNikPassport: '5171012308980001',
          signatureBase64: validSignatureBase64,
          affirmativeConsent: true
        })
      });
      assert.equal(secondSignRes.status, 201, 'Tenant can sign new contract after previous pending was cancelled');
    } finally {
      await pool.query('DELETE FROM rentals WHERE propertyId = ?', [propId]);
      await pool.query('DELETE FROM properties WHERE id = ?', [propId]);
      await pool.query('DELETE FROM users WHERE id IN (?, ?)', [tenantId, landlordId]);
    }
  });

  // =========================================================================
  // REQUIREMENT 4 & 5: Payment Settlement Webhook Activation & Strict Idempotency
  // =========================================================================
  await t.test('R4 & R5: Payment webhook activates tenancy, increments rooms, credits revenue, and is strictly IDEMPOTENT against duplicate calls', async () => {
    const tag = crypto.randomBytes(4).toString('hex');
    const tenantId = `t-idem-${tag}`;
    const landlordId = `l-idem-${tag}`;
    const propId = `p-idem-${tag}`;
    const monthlyPrice = 5000000;
    const durationMonths = 6;
    const initialOccupied = 1;
    const totalRooms = 5;

    await pool.query(
      `INSERT INTO users (
        id, name, email, role, password, phone, identity_type, identity_number, address, occupation, emergency_contact_name, emergency_contact_phone, balance, totalRevenue
      ) VALUES (?, 'Idempotency Tenant', ?, 'tenant', '$2a$10$hash', '+6281234567890', 'NIK', '5171012308980001', 'Jl. Ubud No. 3, Bali', 'Founder', 'Emergency Contact', '+6281234567899', 0, 0)`,
      [tenantId, `tenant-idem-${tag}@kosmo.test`]
    );
    await pool.query(
      "INSERT INTO users (id, name, email, role, password, balance, totalRevenue) VALUES (?, 'Idempotency Landlord', ?, 'landlord', '$2a$10$hash', 2000000, 2000000)",
      [landlordId, `landlord-idem-${tag}@kosmo.test`]
    );
    await pool.query(
      "INSERT INTO properties (id, name, district, address, price, totalRooms, occupiedRooms, ownerId) VALUES (?, 'KOSMO Sanctuary Ubud', 'Ubud', 'Ubud, Bali', ?, ?, ?, ?)",
      [propId, monthlyPrice, totalRooms, initialOccupied, landlordId]
    );

    const token = generateJwtToken({ id: tenantId, email: `tenant-idem-${tag}@kosmo.test`, role: 'tenant' });

    try {
      // 1. Sign contract
      const signRes = await fetch(`${baseUrl}/rentals/contract/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          propertyId: propId,
          durationMonths,
          startDate: '2026-09-01',
          tenantNikPassport: '5171012308980001',
          signatureBase64: validSignatureBase64,
          affirmativeConsent: true
        })
      });
      assert.equal(signRes.status, 201);
      const signData = await signRes.json() as Record<string, any>;
      const rentalId = signData.rentalId;

      const grossAmount = `${(monthlyPrice * durationMonths) + 5000}.00`;
      const signatureKey = createMidtransSignature(rentalId, '200', grossAmount);

      const webhookPayload = {
        order_id: rentalId,
        status_code: '200',
        gross_amount: grossAmount,
        signature_key: signatureKey,
        transaction_status: 'settlement'
      };

      // 2. FIRST Webhook Call -> Must process, transition to active, increment rooms, credit balance
      const firstWebhook = await fetch(`${baseUrl}/payment/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload)
      });
      assert.equal(firstWebhook.status, 200);

      // Verify active state
      const [rentalAfter1] = await pool.query<RentalRow[]>('SELECT * FROM rentals WHERE id = ?', [rentalId]);
      assert.equal(rentalAfter1[0].status, 'active');

      const [propAfter1] = await pool.query<PropertyRow[]>('SELECT occupiedRooms FROM properties WHERE id = ?', [propId]);
      assert.equal(propAfter1[0].occupiedRooms, initialOccupied + 1);

      const totalExpectedCredit = monthlyPrice * durationMonths; // 30,000,000
      const [landlordAfter1] = await pool.query<UserRow[]>('SELECT balance, totalRevenue FROM users WHERE id = ?', [landlordId]);
      assert.equal(Number(landlordAfter1[0].balance), 2000000 + totalExpectedCredit);
      assert.equal(Number(landlordAfter1[0].totalRevenue), 2000000 + totalExpectedCredit);

      // 3. IDEMPOTENCY ATTACK: Send 5 duplicate sequential webhook calls
      for (let i = 0; i < 5; i++) {
        const dupRes = await fetch(`${baseUrl}/payment/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(webhookPayload)
        });
        assert.equal(dupRes.status, 200, `Duplicate webhook call #${i + 1} must return 200 OK`);
      }

      // 4. CONCURRENT IDEMPOTENCY ATTACK: Send 10 duplicate concurrent webhook calls
      const dupPromises = Array.from({ length: 10 }).map(() =>
        fetch(`${baseUrl}/payment/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(webhookPayload)
        }).then(async (r) => ({ status: r.status, data: await r.json() }))
      );
      const concurrentResults = await Promise.all(dupPromises);
      for (const cr of concurrentResults) {
        assert.equal(cr.status, 200);
      }

      // EMPIRICAL ORACLE:
      // Property occupiedRooms must STILL be initialOccupied + 1 (2), NEVER 3, 4, 5, etc.
      const [propFinal] = await pool.query<PropertyRow[]>('SELECT occupiedRooms FROM properties WHERE id = ?', [propId]);
      assert.equal(
        propFinal[0].occupiedRooms,
        initialOccupied + 1,
        `occupiedRooms MUST remain ${initialOccupied + 1} despite 15 duplicate webhook deliveries`
      );

      // Landlord balance must STILL be 2,000,000 + 30,000,000 (32,000,000), NEVER double-credited
      const [landlordFinal] = await pool.query<UserRow[]>('SELECT balance, totalRevenue FROM users WHERE id = ?', [landlordId]);
      assert.equal(
        Number(landlordFinal[0].balance),
        2000000 + totalExpectedCredit,
        'Landlord balance MUST NOT be double credited on duplicate webhooks'
      );
      assert.equal(
        Number(landlordFinal[0].totalRevenue),
        2000000 + totalExpectedCredit,
        'Landlord totalRevenue MUST NOT be double credited on duplicate webhooks'
      );
    } finally {
      await pool.query('DELETE FROM rentals WHERE propertyId = ?', [propId]);
      await pool.query('DELETE FROM properties WHERE id = ?', [propId]);
      await pool.query('DELETE FROM users WHERE id IN (?, ?)', [tenantId, landlordId]);
    }
  });

  // =========================================================================
  // REQUIREMENT 6: Comprehensive Multi-Month Lease Schedule Arithmetic
  // =========================================================================
  await t.test('R6: computePaymentSchedule handles 1, 3, 6, 12 month leases, month-end clamping, leap years, active cycles & past completion', () => {
    // -----------------------------------------------------------------------
    // Test Case A: Standard Multi-Month Durations (1, 3, 6, 12 months)
    // -----------------------------------------------------------------------
    const refMid = new Date('2026-01-15T00:00:00Z');

    // 1 Month
    const sched1 = computePaymentSchedule('2026-01-01', 'active', 1, refMid);
    assert.equal(sched1.leaseStartDate, '1 Januari 2026');
    assert.equal(sched1.leaseEndDateISO, '2026-02-01');
    assert.equal(sched1.totalDurationMonths, 1);
    assert.equal(sched1.nextPaymentDateISO, '2026-02-01');
    assert.equal(sched1.daysRemaining, 17);
    assert.equal(sched1.paymentStatus, 'Lunas (Periode Berjalan)');

    // 3 Months
    const sched3 = computePaymentSchedule('2026-01-01', 'active', 3, refMid);
    assert.equal(sched3.leaseEndDateISO, '2026-04-01');
    assert.equal(sched3.totalDurationMonths, 3);
    assert.equal(sched3.nextPaymentDateISO, '2026-02-01');

    // 6 Months
    const sched6 = computePaymentSchedule('2026-01-01', 'active', 6, refMid);
    assert.equal(sched6.leaseEndDateISO, '2026-07-01');
    assert.equal(sched6.totalDurationMonths, 6);
    assert.equal(sched6.nextPaymentDateISO, '2026-02-01');

    // 12 Months
    const sched12 = computePaymentSchedule('2026-01-01', 'active', 12, refMid);
    assert.equal(sched12.leaseEndDateISO, '2027-01-01');
    assert.equal(sched12.totalDurationMonths, 12);
    assert.equal(sched12.nextPaymentDateISO, '2026-02-01');

    // -----------------------------------------------------------------------
    // Test Case B: Month-End Start Date Clamping (Jan 31 across all months)
    // -----------------------------------------------------------------------
    const startJan31 = '2026-01-31';

    // In February 2026 (28 days) -> Clamped to Feb 28
    const schedFeb = computePaymentSchedule(startJan31, 'active', 12, new Date('2026-02-10T00:00:00Z'));
    assert.equal(schedFeb.nextPaymentDateISO, '2026-02-28', 'Jan 31 start must clamp to Feb 28 in February');

    // In March 2026 (31 days) -> Restores back to Mar 31!
    const schedMar = computePaymentSchedule(startJan31, 'active', 12, new Date('2026-03-05T00:00:00Z'));
    assert.equal(schedMar.nextPaymentDateISO, '2026-03-31', 'Jan 31 start must restore to Mar 31 in March');

    // In April 2026 (30 days) -> Clamped to Apr 30
    const schedApr = computePaymentSchedule(startJan31, 'active', 12, new Date('2026-04-05T00:00:00Z'));
    assert.equal(schedApr.nextPaymentDateISO, '2026-04-30', 'Jan 31 start must clamp to Apr 30 in April');

    // Total 12-month lease end for Jan 31, 2026 start
    assert.equal(schedFeb.leaseEndDateISO, '2027-01-31', '12-month lease from 2026-01-31 ends on 2027-01-31');

    // -----------------------------------------------------------------------
    // Test Case C: Leap Years (Feb 29 Start and Feb 29 Clamping)
    // -----------------------------------------------------------------------
    // 2024 is a leap year (Feb 29 exists)
    const schedLeapStart = computePaymentSchedule('2024-02-29', 'active', 12, new Date('2024-03-01T00:00:00Z'));
    assert.equal(schedLeapStart.nextPaymentDateISO, '2024-03-29');
    // Month 12 (Feb 2025 is non-leap) -> leaseEndDate clamped to Feb 28, 2025
    assert.equal(schedLeapStart.leaseEndDateISO, '2025-02-28');

    // Jan 31, 2024 start -> Feb 2024 has 29 days
    const schedLeapJan31 = computePaymentSchedule('2024-01-31', 'active', 12, new Date('2024-02-10T00:00:00Z'));
    assert.equal(schedLeapJan31.nextPaymentDateISO, '2024-02-29', 'In leap year 2024, Jan 31 clamps to Feb 29');

    // -----------------------------------------------------------------------
    // Test Case D: Intermediate Billing Cycles & Payment Status Thresholds
    // -----------------------------------------------------------------------
    const startSept1 = '2026-09-01';

    // 15 days before due -> 'Lunas (Periode Berjalan)'
    const schedFar = computePaymentSchedule(startSept1, 'active', 6, new Date('2026-09-16T00:00:00Z'));
    assert.equal(schedFar.nextPaymentDateISO, '2026-10-01');
    assert.equal(schedFar.daysRemaining, 15);
    assert.equal(schedFar.paymentStatus, 'Lunas (Periode Berjalan)');

    // 3 days before due -> 'Menjelang Jatuh Tempo'
    const sched3Days = computePaymentSchedule(startSept1, 'active', 6, new Date('2026-09-28T00:00:00Z'));
    assert.equal(sched3Days.daysRemaining, 3);
    assert.equal(sched3Days.paymentStatus, 'Menjelang Jatuh Tempo');

    // 1 day before due -> 'Menjelang Jatuh Tempo'
    const sched1Day = computePaymentSchedule(startSept1, 'active', 6, new Date('2026-09-30T00:00:00Z'));
    assert.equal(sched1Day.daysRemaining, 1);
    assert.equal(sched1Day.paymentStatus, 'Menjelang Jatuh Tempo');

    // Due today -> 'Menunggu Pembayaran'
    const schedToday = computePaymentSchedule(startSept1, 'active', 6, new Date('2026-10-01T00:00:00Z'));
    assert.equal(schedToday.daysRemaining, 0);
    assert.equal(schedToday.paymentStatus, 'Menunggu Pembayaran');

    // Past month 1 due, into month 2 -> advances due date to 2026-11-01
    const schedMonth2 = computePaymentSchedule(startSept1, 'active', 6, new Date('2026-10-02T00:00:00Z'));
    assert.equal(schedMonth2.nextPaymentDateISO, '2026-11-01');
    assert.equal(schedMonth2.daysRemaining, 30);
    assert.equal(schedMonth2.paymentStatus, 'Lunas (Periode Berjalan)');

    // -----------------------------------------------------------------------
    // Test Case E: Past-Completion Dates (now > leaseEndDate)
    // -----------------------------------------------------------------------
    // Lease from 2026-01-01 for 6 months ends 2026-07-01
    const schedPastEnd = computePaymentSchedule('2026-01-01', 'active', 6, new Date('2026-07-02T00:00:00Z'));
    assert.equal(schedPastEnd.paymentStatus, 'Penyewaan Selesai');
    assert.equal(schedPastEnd.nextPaymentDate, '-');
    assert.equal(schedPastEnd.nextPaymentDateISO, '');
    assert.equal(schedPastEnd.daysRemaining, 0);
    assert.equal(schedPastEnd.leaseEndDateISO, '2026-07-01');

    // Long past completion
    const schedLongPast = computePaymentSchedule('2026-01-01', 'active', 12, new Date('2028-05-10T00:00:00Z'));
    assert.equal(schedLongPast.paymentStatus, 'Penyewaan Selesai');
    assert.equal(schedLongPast.nextPaymentDate, '-');

    // -----------------------------------------------------------------------
    // Test Case F: Call Signatures & Polymorphism
    // -----------------------------------------------------------------------
    // 2-argument signature
    const sig2 = computePaymentSchedule('2026-01-01', 'active');
    assert.ok(sig2.leaseStartDate);
    assert.equal(sig2.totalDurationMonths, 1);

    // 3-argument legacy signature: (startDate, status, referenceDate)
    const refCustom = new Date('2026-08-15T00:00:00Z');
    const sig3Legacy = computePaymentSchedule('2026-08-01', 'active', refCustom);
    assert.equal(sig3Legacy.nextPaymentDateISO, '2026-09-01');
    assert.equal(sig3Legacy.totalDurationMonths, 1);

    // 3-argument duration signature: (startDate, status, durationMonths)
    const sig3Duration = computePaymentSchedule('2026-01-01', 'active', 6);
    assert.equal(sig3Duration.totalDurationMonths, 6);
    assert.equal(sig3Duration.leaseEndDateISO, '2026-07-01');

    // 4-argument signature: (startDate, status, durationMonths, referenceDate)
    const sig4 = computePaymentSchedule('2026-01-01', 'active', 12, new Date('2026-05-01T00:00:00Z'));
    assert.equal(sig4.totalDurationMonths, 12);
    assert.equal(sig4.nextPaymentDateISO, '2026-05-01');
    assert.equal(sig4.leaseEndDateISO, '2027-01-01');

    // Non-active status ('terminated', 'cancelled', 'pending')
    const sigTerminated = computePaymentSchedule('2026-01-01', 'terminated', 6);
    assert.equal(sigTerminated.paymentStatus, 'Penyewaan Selesai');
    assert.equal(sigTerminated.nextPaymentDate, '-');

    const sigCancelled = computePaymentSchedule('2026-01-01', 'cancelled', 12);
    assert.equal(sigCancelled.paymentStatus, 'Penyewaan Selesai');
    assert.equal(sigCancelled.nextPaymentDate, '-');
  });
});
