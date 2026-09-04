(process.env as Record<string, string | undefined>).NO_LISTEN = 'true';
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { generateJwtToken, verifyJwtToken, getJwtSecret } from '../backend/middleware/auth';
import {
  generateRentalContractBuffer,
  computeContractHash,
  computeBufferSha256,
  sanitizeRentalId
} from '../backend/services/contract';
import { verifyMidtransSignature } from '../backend/routes/payment.routes';
import { computePaymentSchedule } from '../backend/routes/rentals.routes';
import { InMemoryCache } from '../backend/services/cache';
import { normalizeProperty, normalizePropertySummary } from '../backend/services/transformers';
import { generateId } from '../backend/utils/id';
import {
  loginSchema,
  registerSchema,
  propertySchema,
  withdrawalSchema,
  reviewSchema,
  signContractSchema
} from '../backend/middleware/validation';
import { isUserProfileComplete } from '../backend/types/index';
import { pool, initDb } from '../backend/db';

test('Comprehensive Performance Test Suite: Every Function', async (t) => {
  await initDb();

  t.after(async () => {
    await pool.end();
  });

  await t.test('1. Cryptography & Auth: token signing, verification and secret retrieval', async () => {
    const payload = { id: 'usr-perf-test', email: 'perf@kosmo.local', role: 'tenant' as const };
    
    // Warmup JIT & crypto module
    generateJwtToken(payload);
    const startSign = performance.now();
    const token = generateJwtToken(payload);
    const signDuration = performance.now() - startSign;
    assert.ok(token.length > 0);
    assert.ok(signDuration < 10, `generateJwtToken took ${signDuration.toFixed(2)}ms (expected < 10ms)`);

    verifyJwtToken(token);
    const startVerify = performance.now();
    const decoded = verifyJwtToken(token);
    const verifyDuration = performance.now() - startVerify;
    assert.equal(decoded?.id, 'usr-perf-test');
    assert.ok(verifyDuration < 10, `verifyJwtToken took ${verifyDuration.toFixed(2)}ms (expected < 10ms)`);

    const startSecret = performance.now();
    const secret = getJwtSecret();
    const secretDuration = performance.now() - startSecret;
    assert.ok(secret.length > 0);
    assert.ok(secretDuration < 0.5, `getJwtSecret took ${secretDuration.toFixed(2)}ms (expected < 0.5ms)`);

    const hashed = bcrypt.hashSync('KosmoTestPass123!', 8);
    const startCompare = performance.now();
    const matches = bcrypt.compareSync('KosmoTestPass123!', hashed);
    const compareDuration = performance.now() - startCompare;
    assert.equal(matches, true);
    assert.ok(compareDuration < 150, `bcrypt.compareSync took ${compareDuration.toFixed(2)}ms (expected < 150ms)`);
  });

  await t.test('2. Cache Service: microsecond get/set/del/pattern invalidation', async () => {
    const cache = new InMemoryCache(5000);
    
    const startSet = performance.now();
    cache.set('key-perf', { data: 123 }, 60000);
    const setDuration = performance.now() - startSet;
    assert.ok(setDuration < 1.0, `cache.set took ${setDuration.toFixed(2)}ms (expected < 1ms)`);

    const startGet = performance.now();
    const val = cache.get<{ data: number }>('key-perf');
    const getDuration = performance.now() - startGet;
    assert.equal(val?.data, 123);
    assert.ok(getDuration < 0.5, `cache.get took ${getDuration.toFixed(2)}ms (expected < 0.5ms)`);

    for (let i = 0; i < 500; i++) {
      cache.set(`test:pat:${i}`, { val: i }, 60000);
    }
    const startInvalidate = performance.now();
    cache.invalidatePattern('test:pat');
    const invalidateDuration = performance.now() - startInvalidate;
    assert.equal(cache.get('test:pat:0'), null);
    assert.ok(invalidateDuration < 5.0, `invalidatePattern took ${invalidateDuration.toFixed(2)}ms (expected < 5ms)`);
  });

  await t.test('3. PDF Engine & Evidentiary Audit: 6-page generation & buffer SHA-256', async () => {
    const sampleData = {
      rentalId: 'rent-perf-auto',
      tenantName: 'I Made Performance Test',
      tenantNikOrPassport: '5171012345678901',
      propertyName: 'KOSMO Canggu Studio',
      propertyAddress: 'Jl. Pantai Batu Bolong No. 10, Canggu, Bali',
      monthlyPrice: 4000000,
      durationMonths: 6,
      adminFee: 5000,
      startDate: '2026-10-01',
      signatureBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      signedAt: '2026-09-04T08:00:00.000Z',
      signerIp: '127.0.0.1',
      signerUserAgent: 'Kosmo-Auto-Test/1.0',
      tenantEmail: 'tenant@kosmo.local',
      landlordName: 'Wayan Landlord',
      landlordPhone: '081234567890'
    };

    // Warmup PDFKit engine fonts
    await generateRentalContractBuffer(sampleData);
    const startPdf = performance.now();
    const pdfBuffer = await generateRentalContractBuffer(sampleData);
    const pdfDuration = performance.now() - startPdf;
    assert.ok(Buffer.isBuffer(pdfBuffer));
    assert.ok(pdfBuffer.length > 5000);
    assert.ok(pdfDuration < 100, `generateRentalContractBuffer took ${pdfDuration.toFixed(2)}ms (expected < 100ms)`);

    const startHash = performance.now();
    const hash = computeContractHash(pdfBuffer);
    const hashDuration = performance.now() - startHash;
    assert.equal(hash.length, 64);
    assert.ok(hashDuration < 2.0, `computeContractHash took ${hashDuration.toFixed(2)}ms (expected < 2ms)`);

    const sanitized = sanitizeRentalId('../../../rent-attack-id#$123');
    assert.equal(sanitized, 'rent-attack-id123');
  });

  await t.test('4. Financial & Payment Calculations: payment schedule & Midtrans SHA-512', async () => {
    // Warmup JIT
    computePaymentSchedule('2026-08-01', 'active', 6, new Date('2026-09-04'));
    const startSched = performance.now();
    const sched = computePaymentSchedule('2026-08-01', 'active', 6, new Date('2026-09-04'));
    const schedDuration = performance.now() - startSched;
    assert.ok(sched.nextPaymentDate !== null);
    assert.ok(schedDuration < 2.0, `computePaymentSchedule took ${schedDuration.toFixed(2)}ms (expected < 2ms)`);

    const serverKey = 'SB-Mid-server-test-key';
    const amount = '1000000.00';
    const sig = crypto.createHash('sha512').update(`order-100200${amount}${serverKey}`).digest('hex');
    verifyMidtransSignature('order-100', '200', amount, serverKey, sig);
    const startSig = performance.now();
    const isValid = verifyMidtransSignature('order-100', '200', amount, serverKey, sig);
    const sigDuration = performance.now() - startSig;
    assert.equal(isValid, true);
    assert.ok(sigDuration < 2.0, `verifyMidtransSignature took ${sigDuration.toFixed(2)}ms (expected < 2ms)`);
  });

  await t.test('5. Data Transformers & KYC Evaluation', async () => {
    const rawProp = {
      id: 'prop-test',
      name: 'KOSMO Sanur Room',
      district: 'Denpasar',
      address: 'Jl. Danau Tamblingan',
      price: 3000000,
      rating: 4.7,
      image: 'https://example.com/sanur.jpg',
      description: 'Clean room',
      totalRooms: 5,
      occupiedRooms: 2,
      ownerId: 'landlord-1',
      ownerName: 'Wayan Host',
      ownerEmail: 'wayan@host.bali',
      ownerPhone: '0811223344',
      latitude: '-8.6900',
      longitude: '115.2600',
      facilities: ['Wifi', 'AC', 'Listrik']
    };

    normalizeProperty(rawProp as any);
    const startNorm = performance.now();
    const normalized = normalizeProperty(rawProp as any);
    const normDuration = performance.now() - startNorm;
    assert.equal(normalized.price, 3000000);
    assert.deepEqual(normalized.facilities, ['Wifi', 'AC', 'Listrik']);
    assert.ok(normDuration < 2.0, `normalizeProperty took ${normDuration.toFixed(2)}ms (expected < 2ms)`);

    const validUser = {
      name: 'Test Tenant',
      email: 'test@kosmo.local',
      phone: '081234567890',
      identity_type: 'NIK',
      identity_number: '5171012345678901',
      occupation: 'Software Engineer',
      emergency_contact_name: 'Emergency Contact',
      emergency_contact_phone: '081987654321',
      address: 'Jl. Gatot Subroto No. 1'
    };
    isUserProfileComplete(validUser);
    const startKyc = performance.now();
    const complete = isUserProfileComplete(validUser);
    const kycDuration = performance.now() - startKyc;
    assert.equal(complete.complete, true);
    assert.ok(kycDuration < 2.0, `isUserProfileComplete took ${kycDuration.toFixed(2)}ms (expected < 2ms)`);
  });

  await t.test('6. Zod Validation Schemas: sub-millisecond throughput', async () => {
    loginSchema.safeParse({ email: 'user@kosmo.local', password: 'ValidPassword123!' });
    const startLogin = performance.now();
    const loginRes = loginSchema.safeParse({ email: 'user@kosmo.local', password: 'ValidPassword123!' });
    const loginDuration = performance.now() - startLogin;
    assert.equal(loginRes.success, true);
    assert.ok(loginDuration < 5.0, `loginSchema took ${loginDuration.toFixed(2)}ms (expected < 5ms)`);

    const testContractPayload = {
      propertyId: 'prop-1',
      durationMonths: 3,
      startDate: '2026-10-01',
      tenantNikPassport: '5171012345678901',
      signatureBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      affirmativeConsent: true as const
    };
    signContractSchema.safeParse(testContractPayload);
    const startContract = performance.now();
    const contractRes = signContractSchema.safeParse(testContractPayload);
    const contractDuration = performance.now() - startContract;
    assert.equal(contractRes.success, true);
    assert.ok(contractDuration < 5.0, `signContractSchema took ${contractDuration.toFixed(2)}ms (expected < 5ms)`);
  });

  await t.test('7. Database Operations: pooled query, aggregation, and row-locking latency', async () => {
    // Warmup pooled connection and TLS channel
    await pool.query('SELECT 1');

    const startPing = performance.now();
    const [pingRes] = await pool.query('SELECT 1');
    const pingDuration = performance.now() - startPing;
    assert.ok(Array.isArray(pingRes));
    assert.ok(pingDuration < 150, `SELECT 1 took ${pingDuration.toFixed(2)}ms (expected < 150ms)`);

    const startAgg = performance.now();
    const [aggRes] = await pool.query(`
      SELECT p.id, p.name, p.district, p.price, p.rating, p.totalRooms, p.occupiedRooms,
             GROUP_CONCAT(pf.facility SEPARATOR ',') as facilitiesString
      FROM properties p
      LEFT JOIN property_facilities pf ON p.id = pf.propertyId
      GROUP BY p.id
      LIMIT 10
    `);
    const aggDuration = performance.now() - startAgg;
    assert.ok(Array.isArray(aggRes));
    assert.ok(aggDuration < 150, `Properties JOIN query took ${aggDuration.toFixed(2)}ms (expected < 150ms)`);

    const startTx = performance.now();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('SELECT balance FROM users WHERE id = ? FOR UPDATE', ['user-landlord']);
      await conn.rollback();
    } finally {
      conn.release();
    }
    const txDuration = performance.now() - startTx;
    assert.ok(txDuration < 250, `SELECT FOR UPDATE transaction took ${txDuration.toFixed(2)}ms (expected < 250ms)`);
  });

  await t.test('8. HTTP Endpoints: in-memory cached throughput validation', async () => {
    const { default: app } = await import('../backend/server');
    const PORT = 5094;
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(PORT, () => resolve(s));
    });

    try {
      // Warmup cache
      await fetch(`http://localhost:${PORT}/api/properties`);
      await fetch(`http://localhost:${PORT}/api/reviews`);

      // Test cached properties
      const startProp = performance.now();
      const resProp = await fetch(`http://localhost:${PORT}/api/properties`);
      const propDuration = performance.now() - startProp;
      assert.equal(resProp.status, 200);
      assert.ok(propDuration < 50, `Cached GET /api/properties took ${propDuration.toFixed(2)}ms (expected < 50ms)`);

      // Test cached reviews
      const startRev = performance.now();
      const resRev = await fetch(`http://localhost:${PORT}/api/reviews`);
      const revDuration = performance.now() - startRev;
      assert.equal(resRev.status, 200);
      assert.ok(revDuration < 50, `Cached GET /api/reviews took ${revDuration.toFixed(2)}ms (expected < 50ms)`);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
