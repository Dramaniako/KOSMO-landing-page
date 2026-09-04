(process.env as Record<string, string | undefined>).NO_LISTEN = 'true';
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

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
  previewContractSchema,
  signContractSchema,
  updateProfileSchema,
  adminCreateUserSchema,
  adminUpdateUserSchema
} from '../backend/middleware/validation';
import { isUserProfileComplete } from '../backend/types/index';
import { pool, initDb } from '../backend/db';

export interface PerfMetric {
  category: string;
  functionName: string;
  samples: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  opsPerSec: number;
  slaTargetMs: number;
  status: 'PASS' | 'FAIL';
}

function calculatePercentiles(latencies: number[]): { p50: number; p95: number; p99: number } {
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.50)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
  return {
    p50: parseFloat(p50.toFixed(3)),
    p95: parseFloat(p95.toFixed(3)),
    p99: parseFloat(p99.toFixed(3))
  };
}

export async function profileFunction(
  category: string,
  functionName: string,
  fn: () => void | Promise<unknown>,
  options: { iterations?: number; warmup?: number; slaTargetMs: number }
): Promise<PerfMetric> {
  const iterations = options.iterations ?? 100;
  const warmup = options.warmup ?? 5;
  const slaTargetMs = options.slaTargetMs;

  // Warmup phase
  for (let i = 0; i < warmup; i++) {
    const res = fn();
    if (res instanceof Promise) await res;
  }

  const latencies: number[] = [];
  const startTotal = performance.now();

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const res = fn();
    if (res instanceof Promise) await res;
    const duration = performance.now() - start;
    latencies.push(duration);
  }

  const totalDuration = performance.now() - startTotal;
  const avgMs = parseFloat((latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(3));
  const minMs = parseFloat(Math.min(...latencies).toFixed(3));
  const maxMs = parseFloat(Math.max(...latencies).toFixed(3));
  const { p50, p95, p99 } = calculatePercentiles(latencies);
  const opsPerSec = Math.round((iterations / (totalDuration / 1000)));

  const status = p95 <= slaTargetMs ? 'PASS' : 'FAIL';

  return {
    category,
    functionName,
    samples: iterations,
    avgMs,
    minMs,
    maxMs,
    p50Ms: p50,
    p95Ms: p95,
    p99Ms: p99,
    opsPerSec,
    slaTargetMs,
    status
  };
}

export async function runFullPerformanceBenchmark(): Promise<PerfMetric[]> {
  await initDb();
  const metrics: PerfMetric[] = [];

  console.log('\n========================================================================================');
  console.log('             KOSMO COMPREHENSIVE PERFORMANCE BENCHMARK: EVERY FUNCTION                  ');
  console.log('========================================================================================\n');

  // ==========================================
  // 1. Cryptography & Authentication Utilities
  // ==========================================
  console.log('1. Profiling Cryptographic & Authentication Utilities...');

  const plainPassword = 'KosmoSecurePassword2026!';
  const hashedPassword = bcrypt.hashSync(plainPassword, 10);
  const userPayload = { id: 'usr-perf-bench', email: 'benchmark@kosmo.local', role: 'tenant' as const };

  metrics.push(await profileFunction(
    'Crypto / Auth',
    'bcrypt.hashSync (cost: 10)',
    () => { bcrypt.hashSync(plainPassword, 10); },
    { iterations: 10, warmup: 2, slaTargetMs: 150 }
  ));

  metrics.push(await profileFunction(
    'Crypto / Auth',
    'bcrypt.compareSync (matching password)',
    () => { bcrypt.compareSync(plainPassword, hashedPassword); },
    { iterations: 10, warmup: 2, slaTargetMs: 150 }
  ));

  metrics.push(await profileFunction(
    'Crypto / Auth',
    'bcrypt.compareSync (mismatched password)',
    () => { bcrypt.compareSync('WrongPassword123!', hashedPassword); },
    { iterations: 10, warmup: 2, slaTargetMs: 150 }
  ));

  metrics.push(await profileFunction(
    'Crypto / Auth',
    'generateJwtToken (HS256 sign)',
    () => { generateJwtToken(userPayload); },
    { iterations: 500, warmup: 20, slaTargetMs: 2 }
  ));

  const validJwt = generateJwtToken(userPayload);
  metrics.push(await profileFunction(
    'Crypto / Auth',
    'verifyJwtToken (decode & HMAC verify)',
    () => { verifyJwtToken(validJwt); },
    { iterations: 500, warmup: 20, slaTargetMs: 2 }
  ));

  metrics.push(await profileFunction(
    'Crypto / Auth',
    'getJwtSecret',
    () => { getJwtSecret(); },
    { iterations: 1000, warmup: 50, slaTargetMs: 0.1 }
  ));

  metrics.push(await profileFunction(
    'Utility',
    'generateId (UUID with prefix)',
    () => { generateId('usr'); },
    { iterations: 1000, warmup: 50, slaTargetMs: 0.1 }
  ));

  // ==========================================
  // 2. In-Memory Caching Service
  // ==========================================
  console.log('2. Profiling In-Memory Caching Service...');
  const cache = new InMemoryCache(5000);

  metrics.push(await profileFunction(
    'Cache Service',
    'InMemoryCache.set',
    () => { cache.set(`key-${Math.random()}`, { data: 'test-value' }, 60000); },
    { iterations: 1000, warmup: 50, slaTargetMs: 0.1 }
  ));

  cache.set('benchmark-hit-key', { sample: 123 }, 60000);
  metrics.push(await profileFunction(
    'Cache Service',
    'InMemoryCache.get (hit)',
    () => { cache.get('benchmark-hit-key'); },
    { iterations: 1000, warmup: 50, slaTargetMs: 0.05 }
  ));

  metrics.push(await profileFunction(
    'Cache Service',
    'InMemoryCache.get (miss)',
    () => { cache.get('non-existent-key'); },
    { iterations: 1000, warmup: 50, slaTargetMs: 0.05 }
  ));

  metrics.push(await profileFunction(
    'Cache Service',
    'InMemoryCache.del',
    () => {
      const k = `del-${Math.random()}`;
      cache.set(k, true, 10000);
      cache.del(k);
    },
    { iterations: 500, warmup: 20, slaTargetMs: 0.1 }
  ));

  // Seed 1,000 keys for pattern invalidation test
  for (let i = 0; i < 1000; i++) {
    cache.set(`prop:pattern:${i}`, { id: i }, 60000);
  }
  metrics.push(await profileFunction(
    'Cache Service',
    'InMemoryCache.invalidatePattern (1,000 keys)',
    () => { cache.invalidatePattern('prop:pattern'); },
    { iterations: 100, warmup: 5, slaTargetMs: 2.0 }
  ));

  // ==========================================
  // 3. PDF Contract Generation & Cryptography
  // ==========================================
  console.log('3. Profiling PDF Engine & Evidentiary Audit Functions...');

  const sampleContractData = {
    rentalId: 'rent-perf-12345',
    tenantName: 'I Made Performance Test',
    tenantNikOrPassport: '5171012345678901',
    propertyName: 'KOSMO Sanur Beachfront Luxury Suite',
    propertyAddress: 'Jl. Danau Tamblingan No. 45, Sanur, Denpasar, Bali',
    monthlyPrice: 3500000,
    durationMonths: 6,
    adminFee: 5000,
    startDate: '2026-10-01',
    signatureBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    signedAt: '2026-09-04T08:00:00.000Z',
    signerIp: '127.0.0.1',
    signerUserAgent: 'Kosmo-Benchmark-Runner/1.0',
    tenantEmail: 'tenant@kosmo.local',
    landlordName: 'Wayan Landlord Test',
    landlordPhone: '081234567890'
  };

  let generatedPdfBuffer: Buffer | null = null;
  metrics.push(await profileFunction(
    'PDF Engine',
    'generateRentalContractBuffer (6-page legal document in-memory)',
    async () => {
      generatedPdfBuffer = await generateRentalContractBuffer(sampleContractData);
    },
    { iterations: 20, warmup: 3, slaTargetMs: 80 }
  ));

  const pdfBufferToHash = generatedPdfBuffer || Buffer.from('Fallback PDF buffer content');
  metrics.push(await profileFunction(
    'PDF Engine',
    'computeContractHash (SHA-256 over PDF buffer)',
    () => { computeContractHash(pdfBufferToHash); },
    { iterations: 500, warmup: 20, slaTargetMs: 1.0 }
  ));

  metrics.push(await profileFunction(
    'PDF Engine',
    'computeBufferSha256',
    () => { computeBufferSha256(pdfBufferToHash); },
    { iterations: 500, warmup: 20, slaTargetMs: 1.0 }
  ));

  metrics.push(await profileFunction(
    'PDF Engine',
    'sanitizeRentalId',
    () => { sanitizeRentalId('../../../rent-attack-id#$123'); },
    { iterations: 1000, warmup: 50, slaTargetMs: 0.05 }
  ));

  metrics.push(await profileFunction(
    'Financial / Calc',
    'computePaymentSchedule (Monthly anniversary & daysRemaining)',
    () => { computePaymentSchedule('2026-08-01', 'active', 6, new Date('2026-09-04')); },
    { iterations: 1000, warmup: 50, slaTargetMs: 1.0 }
  ));

  const mockServerKey = 'SB-Mid-server-placeholder';
  const mockSigKey = crypto.createHash('sha512').update(`order-1232001500000.00${mockServerKey}`).digest('hex');
  metrics.push(await profileFunction(
    'Financial / Calc',
    'verifyMidtransSignature (Timing-safe SHA-512 verification)',
    () => { verifyMidtransSignature('order-123', '200', '1500000', mockServerKey, mockSigKey); },
    { iterations: 1000, warmup: 50, slaTargetMs: 0.1 }
  ));

  // ==========================================
  // 4. Data Transformers & Sanitizers
  // ==========================================
  console.log('4. Profiling Data Transformers & Sanitizers...');

  const rawPropertyRow = {
    id: 'prop-transformer-test',
    name: 'KOSMO Seminyak Suite',
    district: 'Badung',
    address: 'Jl. Kayu Aya No. 12',
    price: '4500000',
    rating: '4.8',
    image: 'https://example.com/prop.jpg',
    description: 'Boutique Room',
    totalRooms: '10',
    occupiedRooms: '7',
    ownerId: 'landlord-123',
    ownerName: 'Gede Host',
    ownerEmail: 'gede@host.bali',
    ownerPhone: '081122334455',
    latitude: '-8.6800',
    longitude: '115.1500',
    facilitiesString: 'Wifi,AC,Listrik,Air,Parkir'
  };

  metrics.push(await profileFunction(
    'Transformers',
    'normalizeProperty (numeric parsing & facilities array split)',
    () => { normalizeProperty(rawPropertyRow); },
    { iterations: 1000, warmup: 50, slaTargetMs: 0.05 }
  ));

  metrics.push(await profileFunction(
    'Transformers',
    'normalizePropertySummary',
    () => { normalizePropertySummary(rawPropertyRow); },
    { iterations: 1000, warmup: 50, slaTargetMs: 0.05 }
  ));

  const validUserProfile = {
    id: 'usr-complete-1',
    name: 'Ketut Complete Profile',
    email: 'ketut@bali.com',
    phone: '081234567890',
    identityType: 'nik' as const,
    identityNumber: '5171012345678901',
    emergencyContactName: 'Made Emergency',
    emergencyContactPhone: '081987654321',
    address: 'Jl. Sunset Road No. 88, Kuta, Bali'
  };

  metrics.push(await profileFunction(
    'Transformers',
    'isUserProfileComplete (KYC compliance evaluation)',
    () => { isUserProfileComplete(validUserProfile); },
    { iterations: 1000, warmup: 50, slaTargetMs: 0.05 }
  ));

  // ==========================================
  // 5. Zod Request Body Validation Schemas
  // ==========================================
  console.log('5. Profiling Zod Request Body Validation Schemas...');

  metrics.push(await profileFunction(
    'Zod Validation',
    'loginSchema.safeParse',
    () => { loginSchema.safeParse({ email: 'user@kosmo.local', password: 'ValidPassword123!' }); },
    { iterations: 1000, warmup: 50, slaTargetMs: 0.2 }
  ));

  metrics.push(await profileFunction(
    'Zod Validation',
    'registerSchema.safeParse',
    () => { registerSchema.safeParse({ name: 'Komang New User', email: 'new@kosmo.local', password: 'ValidPassword123!', role: 'tenant', phone: '081234567890' }); },
    { iterations: 1000, warmup: 50, slaTargetMs: 0.2 }
  ));

  metrics.push(await profileFunction(
    'Zod Validation',
    'propertySchema.safeParse',
    () => {
      propertySchema.safeParse({
        name: 'KOSMO Sunset Villa',
        district: 'Kuta',
        address: 'Jl. Sunset No. 1',
        price: 3200000,
        description: 'Cozy living room',
        facilities: ['Wifi', 'AC'],
        latitude: '-8.7000',
        longitude: '115.1700',
        totalRooms: 6
      });
    },
    { iterations: 1000, warmup: 50, slaTargetMs: 0.3 }
  ));

  metrics.push(await profileFunction(
    'Zod Validation',
    'withdrawalSchema.safeParse',
    () => { withdrawalSchema.safeParse({ amount: 1500000, bankName: 'BCA', accountNumber: '1234567890', accountHolderName: 'Wayan Landlord' }); },
    { iterations: 1000, warmup: 50, slaTargetMs: 0.2 }
  ));

  metrics.push(await profileFunction(
    'Zod Validation',
    'reviewSchema.safeParse',
    () => { reviewSchema.safeParse({ propertyId: 'prop-1', rating: 5, comment: 'Sangat bersih dan nyaman!' }); },
    { iterations: 1000, warmup: 50, slaTargetMs: 0.2 }
  ));

  metrics.push(await profileFunction(
    'Zod Validation',
    'signContractSchema.safeParse (with NIK & signature payload)',
    () => {
      signContractSchema.safeParse({
        propertyId: 'prop-1',
        durationMonths: 3,
        identityType: 'nik',
        identityNumber: '5171012345678901',
        signatureBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        affirmativeConsent: true
      });
    },
    { iterations: 500, warmup: 20, slaTargetMs: 0.5 }
  ));

  // ==========================================
  // 6. Database Queries & Transactions
  // ==========================================
  console.log('6. Profiling Database Queries & Transactions...');

  metrics.push(await profileFunction(
    'Database / SQL',
    'pool.query("SELECT 1") (Pool checkout & ping)',
    async () => { await pool.query('SELECT 1'); },
    { iterations: 50, warmup: 5, slaTargetMs: 70.0 }
  ));

  metrics.push(await profileFunction(
    'Database / SQL',
    'Properties multi-table JOIN with GROUP_CONCAT',
    async () => {
      await pool.query(`
        SELECT p.id, p.name, p.district, p.price, p.rating, p.totalRooms, p.occupiedRooms,
               GROUP_CONCAT(pf.facility SEPARATOR ',') as facilitiesString
        FROM properties p
        LEFT JOIN property_facilities pf ON p.id = pf.propertyId
        GROUP BY p.id
        LIMIT 20
      `);
    },
    { iterations: 30, warmup: 3, slaTargetMs: 100.0 }
  ));

  metrics.push(await profileFunction(
    'Database / SQL',
    'Indexed property search (district + price range)',
    async () => {
      await pool.query('SELECT * FROM properties WHERE district = ? AND price <= ? LIMIT 10', ['Denpasar', 5000000]);
    },
    { iterations: 30, warmup: 3, slaTargetMs: 85.0 }
  ));

  metrics.push(await profileFunction(
    'Database / SQL',
    'User lookup by email',
    async () => {
      await pool.query('SELECT * FROM users WHERE email = ? LIMIT 1', ['admin@kosmo.local']);
    },
    { iterations: 30, warmup: 3, slaTargetMs: 95.0 }
  ));

  metrics.push(await profileFunction(
    'Database / SQL',
    'Rental active lease conflict check (indexed tenantId, status)',
    async () => {
      await pool.query('SELECT id FROM rentals WHERE tenantId = ? AND status = ? LIMIT 1', ['user-tenant', 'active']);
    },
    { iterations: 30, warmup: 3, slaTargetMs: 80.0 }
  ));

  metrics.push(await profileFunction(
    'Database / SQL',
    'Landlord financials monthly aggregation (GROUP BY month)',
    async () => {
      await pool.query(`
        SELECT 
          COALESCE(DATE_FORMAT(STR_TO_DATE(r.startDate, '%Y-%m-%d'), '%Y-%m'), DATE_FORMAT(r.contract_signed_at, '%Y-%m')) as month,
          COALESCE(SUM(r.price), 0) as revenue,
          COUNT(r.id) as transactions
        FROM rentals r
        JOIN properties p ON r.propertyId = p.id
        WHERE p.ownerId = ? AND r.status IN ('active', 'completed')
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12
      `, ['user-landlord']);
    },
    { iterations: 30, warmup: 3, slaTargetMs: 80.0 }
  ));

  metrics.push(await profileFunction(
    'Database / SQL',
    'Transactional row-locking simulation (SELECT FOR UPDATE + ROLLBACK)',
    async () => {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query('SELECT balance FROM users WHERE id = ? FOR UPDATE', ['user-landlord']);
        await conn.rollback();
      } finally {
        conn.release();
      }
    },
    { iterations: 20, warmup: 3, slaTargetMs: 180.0 }
  ));

  // ==========================================
  // 7. HTTP API Endpoint Controllers
  // ==========================================
  console.log('7. Profiling HTTP API Endpoints...');

  const { default: app } = await import('../backend/server');
  const PORT = 5092;
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(PORT, () => resolve(s));
  });

  const adminToken = generateJwtToken({ id: 'user-admin', email: 'admin@kosmo.local', role: 'admin' });
  const tenantToken = generateJwtToken({ id: 'user-tenant', email: 'tenant@kosmo.local', role: 'tenant' });
  const landlordToken = generateJwtToken({ id: 'user-landlord', email: 'landlord@kosmo.local', role: 'landlord' });

  // Warmup HTTP server
  await fetch(`http://localhost:${PORT}/api/health`);
  await fetch(`http://localhost:${PORT}/api/properties`);

  metrics.push(await profileFunction(
    'HTTP Endpoints',
    'GET /api/health (Readiness ping)',
    async () => {
      const res = await fetch(`http://localhost:${PORT}/api/health`);
      await res.json();
    },
    { iterations: 30, warmup: 5, slaTargetMs: 70.0 }
  ));

  metrics.push(await profileFunction(
    'HTTP Endpoints',
    'GET /api/properties (Cached public catalog)',
    async () => {
      const res = await fetch(`http://localhost:${PORT}/api/properties`);
      await res.json();
    },
    { iterations: 50, warmup: 5, slaTargetMs: 25.0 }
  ));

  metrics.push(await profileFunction(
    'HTTP Endpoints',
    'GET /api/reviews (Cached reviews catalog)',
    async () => {
      const res = await fetch(`http://localhost:${PORT}/api/reviews`);
      await res.json();
    },
    { iterations: 50, warmup: 5, slaTargetMs: 25.0 }
  ));

  metrics.push(await profileFunction(
    'HTTP Endpoints',
    'GET /api/rentals (Tenant Dashboard authenticated rentals)',
    async () => {
      const res = await fetch(`http://localhost:${PORT}/api/rentals`, {
        headers: { Authorization: `Bearer ${tenantToken}` }
      });
      await res.json();
    },
    { iterations: 30, warmup: 3, slaTargetMs: 120.0 }
  ));

  metrics.push(await profileFunction(
    'HTTP Endpoints',
    'GET /api/landlord/stats (Landlord dashboard metrics)',
    async () => {
      const res = await fetch(`http://localhost:${PORT}/api/landlord/stats?landlordId=user-landlord`, {
        headers: { Authorization: `Bearer ${landlordToken}` }
      });
      await res.json();
    },
    { iterations: 30, warmup: 3, slaTargetMs: 65.0 }
  ));

  metrics.push(await profileFunction(
    'HTTP Endpoints',
    'GET /api/landlord/financials (Landlord revenue & transactions)',
    async () => {
      const res = await fetch(`http://localhost:${PORT}/api/landlord/financials?landlordId=user-landlord`, {
        headers: { Authorization: `Bearer ${landlordToken}` }
      });
      await res.json();
    },
    { iterations: 30, warmup: 3, slaTargetMs: 65.0 }
  ));

  metrics.push(await profileFunction(
    'HTTP Endpoints',
    'GET /api/admin/stats (Admin overview statistics)',
    async () => {
      const res = await fetch(`http://localhost:${PORT}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      await res.json();
    },
    { iterations: 30, warmup: 3, slaTargetMs: 30.0 }
  ));

  metrics.push(await profileFunction(
    'HTTP Endpoints',
    'POST /api/auth/verify-password (Admin password confirmation gate)',
    async () => {
      const res = await fetch(`http://localhost:${PORT}/api/auth/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ password: 'AdminPassword123!' })
      });
      await res.json();
    },
    { iterations: 10, warmup: 2, slaTargetMs: 160.0 }
  ));

  await new Promise<void>((resolve) => server.close(() => resolve()));

  // ==========================================
  // Display Formatted Benchmark Summary Table
  // ==========================================
  console.log('\n============================================================================================================================================');
  console.log('                                            FULL-STACK FUNCTION PERFORMANCE AUDIT SUMMARY                                                   ');
  console.log('============================================================================================================================================');
  console.table(metrics.map(m => ({
    Category: m.category,
    Function: m.functionName,
    'p50 (ms)': m.p50Ms,
    'p95 (ms)': m.p95Ms,
    'Avg (ms)': m.avgMs,
    'Ops / sec': m.opsPerSec,
    'SLA (ms)': m.slaTargetMs,
    Status: m.status
  })));
  console.log('============================================================================================================================================\n');

  const failedMetrics = metrics.filter(m => m.status === 'FAIL');
  if (failedMetrics.length > 0) {
    console.warn(`⚠️ Warning: ${failedMetrics.length} function(s) exceeded their p95 SLA targets!`);
    for (const f of failedMetrics) {
      console.warn(`  - [${f.category}] ${f.functionName}: p95=${f.p95Ms}ms (SLA: <= ${f.slaTargetMs}ms)`);
    }
  } else {
    console.log(`✅ EXCELLENT: All ${metrics.length} functions across all 7 functional tiers met their strict SLA performance targets!\n`);
  }

  return metrics;
}

// Auto-run if executed directly via tsx
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('benchmark_all_functions.ts')) {
  runFullPerformanceBenchmark()
    .then((metrics) => {
      const allPassed = metrics.every(m => m.status === 'PASS');
      process.exit(allPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal benchmark error:', err);
      process.exit(1);
    });
}
