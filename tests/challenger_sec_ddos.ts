/**
/**
 * Empirical Adversarial Stress & Security Test Suite
 * Archetype: Empirical Challenger
 * Focus: R1 Layer-7 DDoS, Tiered Rate Limiting, Visitor Tracking Flood & TiDB Pool Caching
 */

// Configure environment to simulate PRODUCTION mode for rate limiter initialization
(process.env as Record<string, string | undefined>).NODE_ENV = 'production';
delete (process.env as Record<string, string | undefined>).NO_LISTEN;
delete (process.env as Record<string, string | undefined>).RATE_LIMIT_BYPASS_SECRET;

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RowDataPacket } from 'mysql2/promise';

interface CountRow extends RowDataPacket {
  count: number | string;
}

interface PongRow extends RowDataPacket {
  pong: number | string;
}

// Import modules under simulated production environment
const { default: app } = await import('../backend/server');
const { pool, getPool } = await import('../backend/db');
const { shouldSkipRateLimit, authLimiter, trackingLimiter } = await import('../backend/middleware/rateLimiter');
const { apiCache } = await import('../backend/services/cache');

test('Adversarial Stress Test: R1 Layer-7 DDoS, Rate Limiting & TiDB Pool', async (t) => {
  let server: http.Server;
  let baseUrl: string;

  t.before(async () => {
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    // Clean up any stale test-sec-* records in visitor_tracking
    await pool.query("DELETE FROM visitor_tracking WHERE user_agent LIKE 'test-sec-%' OR ip_address LIKE '198.51.100.%'");
  });

  t.after(async () => {
    // Atomic cleanup of test data
    await pool.query("DELETE FROM visitor_tracking WHERE user_agent LIKE 'test-sec-%' OR ip_address LIKE '198.51.100.%'");
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  // =========================================================================
  // SECTION 1: Production Rate Limit Enforcement
  // =========================================================================
  await t.test('1. Production Rate Limit Enforcement: Auth Limiter enforces 10 req/15min', async () => {
    const testIp = '198.51.100.1';
    const endpoint = `${baseUrl}/api/auth/login`;

    // Send 10 consecutive requests (within threshold)
    const responses: Response[] = [];
    for (let i = 1; i <= 10; i++) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': testIp,
          'User-Agent': 'test-sec-auth-agent'
        },
        body: JSON.stringify({ email: 'bad@kosmo.id', password: 'wrong' })
      });
      responses.push(res);
    }

    // All first 10 requests should reach application layer (HTTP 400 for validation or 401 for bad creds)
    for (let i = 0; i < 10; i++) {
      assert.notEqual(
        responses[i].status,
        429,
        `Request ${i + 1} within threshold should NOT be rate limited (got ${responses[i].status})`
      );
    }

    // 11th request from same IP must strictly receive HTTP 429
    const throttledRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': testIp,
        'User-Agent': 'test-sec-auth-agent'
      },
      body: JSON.stringify({ email: 'bad@kosmo.id', password: 'wrong' })
    });

    assert.equal(throttledRes.status, 429, '11th request exceeding threshold MUST receive HTTP 429');
    const body = await throttledRes.json() as Record<string, unknown>;
    assert.equal(body.code, 'RATE_LIMIT_EXCEEDED');
    assert.equal(body.status, 'fail');

    // Verify rate limit headers
    const remaining = throttledRes.headers.get('ratelimit-remaining');
    if (remaining !== null) {
      assert.equal(remaining, '0', 'ratelimit-remaining must be 0 when throttled');
    }

    // Different IP must NOT be throttled (IP isolation check)
    const freshIpRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '198.51.100.2',
        'User-Agent': 'test-sec-auth-agent'
      },
      body: JSON.stringify({ email: 'bad@kosmo.id', password: 'wrong' })
    });
    assert.notEqual(freshIpRes.status, 429, 'Different IP should NOT be blocked by previous IP quota exhaustion');
  });

  // =========================================================================
  // SECTION 2: Bypass Header Security in Production
  // =========================================================================
  await t.test('2. Bypass Header Security: x-test-bypass strictly ignored in production', async () => {
    const testIp = '198.51.100.3';
    const endpoint = `${baseUrl}/api/auth/login`;

    // Send 10 requests with bypass header
    for (let i = 1; i <= 10; i++) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': testIp,
          'User-Agent': 'test-sec-bypass-agent',
          'x-test-bypass': 'true'
        },
        body: JSON.stringify({ email: 'test@kosmo.id', password: 'wrong' })
      });
      assert.notEqual(res.status, 429, `Request ${i} should be accepted`);
    }

    // 11th request sending x-test-bypass: true MUST STILL BE 429
    const bypassRes1 = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': testIp,
        'User-Agent': 'test-sec-bypass-agent',
        'x-test-bypass': 'true'
      },
      body: JSON.stringify({ email: 'test@kosmo.id', password: 'wrong' })
    });
    assert.equal(bypassRes1.status, 429, 'x-test-bypass: true must be ignored in production mode');

    // 12th request sending x-bypass-rate-limit: true MUST STILL BE 429
    const bypassRes2 = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': testIp,
        'User-Agent': 'test-sec-bypass-agent',
        'x-bypass-rate-limit': 'true'
      },
      body: JSON.stringify({ email: 'test@kosmo.id', password: 'wrong' })
    });
    assert.equal(bypassRes2.status, 429, 'x-bypass-rate-limit: true must be ignored in production mode');

    // 13th request sending forged secret header MUST STILL BE 429
    const bypassRes3 = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': testIp,
        'User-Agent': 'test-sec-bypass-agent',
        'x-test-bypass': 'super-secret-bypass-key'
      },
      body: JSON.stringify({ email: 'test@kosmo.id', password: 'wrong' })
    });
    assert.equal(bypassRes3.status, 429, 'Arbitrary secret header must be ignored in production mode');
  });

  // =========================================================================
  // SECTION 3: Visitor Tracking Flood & Deduplication
  // =========================================================================
  await t.test('3. Visitor Tracking Flood & Deduplication: Sequential & Fast-Path', async () => {
    const testIp = '198.51.100.10';
    const endpoint = `${baseUrl}/api/tracking`;

    // Request 1: Initial visit -> Status 201 Created
    const res1 = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': testIp,
        'User-Agent': 'test-sec-track-seq-agent-1'
      },
      body: JSON.stringify({ pageUrl: 'https://kosmobali.my.id/home' })
    });
    assert.equal(res1.status, 201, 'First visit must return 201 Created');
    const body1 = await res1.json() as Record<string, unknown>;
    assert.equal(body1.success, true);

    // Request 2 to 10 in rapid succession: Deduplicated -> Status 200 { deduplicated: true }
    for (let i = 2; i <= 10; i++) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': testIp,
          'User-Agent': `test-sec-track-seq-agent-${i}`
        },
        body: JSON.stringify({ pageUrl: `https://kosmobali.my.id/home?step=${i}` })
      });
      assert.equal(res.status, 200, `Repeat visit ${i} must return 200 Deduplicated`);
      const body = await res.json() as Record<string, unknown>;
      assert.equal(body.deduplicated, true, `Repeat visit ${i} must have deduplicated: true`);
    }

    // Verify exactly ONE database record was inserted for this IP
    const [rows] = await pool.query<CountRow[]>(
      'SELECT COUNT(*) as count FROM visitor_tracking WHERE ip_address = ?',
      [testIp]
    );
    assert.equal(Number(rows[0].count), 1, 'Visitor tracking MUST have exactly 1 record in database after 10 sequential requests');
  });

  await t.test('3b. Visitor Tracking Concurrent Flood: High-Concurrency Burst Race Condition Audit', async () => {
    const testIp = '198.51.100.20';
    const endpoint = `${baseUrl}/api/tracking`;

    // Fire 15 concurrent flood requests simultaneously
    const CONCURRENCY = 15;
    const promises = Array.from({ length: CONCURRENCY }, (_, i) =>
      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': testIp,
          'User-Agent': `test-sec-burst-agent-${i}`
        },
        body: JSON.stringify({ pageUrl: 'https://kosmobali.my.id/explore', sessionId: `sess-${i}` })
      })
    );

    const results = await Promise.all(promises);

    let count201 = 0;
    let count200 = 0;
    let count429 = 0;

    for (const res of results) {
      if (res.status === 201) count201++;
      else if (res.status === 200) count200++;
      else if (res.status === 429) count429++;
    }

    // Check database row count
    const [rows] = await pool.query<CountRow[]>(
      'SELECT COUNT(*) as count FROM visitor_tracking WHERE ip_address = ?',
      [testIp]
    );
    const dbCount = Number(rows[0].count);

    // Record empirical telemetry
    console.log(`[Empirical Telemetry] Concurrent Flood of ${CONCURRENCY} reqs: 201 Created: ${count201}, 200 Deduplicated: ${count200}, 429 Throttled: ${count429}, DB Rows Inserted: ${dbCount}`);

    // Audit concurrency deduplication:
    // If deduplication works under concurrency, dbCount should be 1.
    // If TOCTOU race condition exists, dbCount will equal CONCURRENCY (15).
    assert.equal(
      dbCount,
      1,
      `VULNERABILITY DETECTED: Concurrency race condition allowed ${dbCount} duplicate DB insertions for the same IP under concurrent flood of ${CONCURRENCY} requests!`
    );
  });

  await t.test('3c. Visitor Tracking Rate Limiting: 30 req/min limit in production', async () => {
    const testIp = '198.51.100.30';
    const endpoint = `${baseUrl}/api/tracking`;

    // Send 30 requests (threshold limit)
    for (let i = 1; i <= 30; i++) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': testIp
        },
        body: JSON.stringify({})
      });
      assert.notEqual(res.status, 429, `Tracking request ${i} should be within 30 req/min quota`);
    }

    // 31st request must be throttled with 429
    const throttled = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': testIp
      },
      body: JSON.stringify({})
    });

    assert.equal(throttled.status, 429, '31st tracking request MUST receive HTTP 429');
    const body = await throttled.json() as Record<string, unknown>;
    assert.equal(body.code, 'RATE_LIMIT_EXCEEDED');
  });

  // =========================================================================
  // SECTION 4: TiDB Pool Caching & Resilience
  // =========================================================================
  await t.test('4. TiDB Pool Caching: globalThis.__kosmo_tidb_pool singleton and error recovery', async () => {
    // Assertion 1: globalThis.__kosmo_tidb_pool is set
    assert.ok(globalThis.__kosmo_tidb_pool, 'globalThis.__kosmo_tidb_pool must be defined');

    // Assertion 2: getPool() returns the exact cached instance
    const poolRef1 = getPool();
    const poolRef2 = getPool();
    assert.strictEqual(poolRef1, globalThis.__kosmo_tidb_pool, 'getPool() must return globalThis.__kosmo_tidb_pool');
    assert.strictEqual(poolRef1, poolRef2, 'Multiple getPool() calls must return identical pool instance');
    assert.strictEqual(pool, globalThis.__kosmo_tidb_pool, 'Exported pool must match globalThis.__kosmo_tidb_pool');

    // Assertion 3: Active query execution via cached pool
    const [ping] = await pool.query<PongRow[]>('SELECT 1 as pong');
    assert.equal(ping[0].pong, 1, 'Cached pool must successfully execute SQL queries');

    // Assertion 4: Resilience test - recreate pool when cache is cleared
    const savedPool = globalThis.__kosmo_tidb_pool;
    try {
      // Simulate connection reset clearing the global pool reference
      globalThis.__kosmo_tidb_pool = undefined;
      const newPool = getPool();
      assert.ok(newPool, 'getPool() must lazily recreate pool if cache is cleared');
      assert.strictEqual(globalThis.__kosmo_tidb_pool, newPool, 'Newly created pool must be cached on globalThis');
      
      const [newPing] = await newPool.query<PongRow[]>('SELECT 2 as pong');
      assert.equal(newPing[0].pong, 2, 'Recreated pool must execute SQL queries');
    } finally {
      // Restore original pool
      globalThis.__kosmo_tidb_pool = savedPool;
    }
  });

  // =========================================================================
  // SECTION 5: Latency Benchmarks
  // =========================================================================
  await t.test('5. Latency Benchmarks: Rate Limiter Overhead & Fast-Path Deduplication', async () => {
    const testIp = 'test-sec-perf-01';

    // Benchmark 1: First visit (DB check + DB insert + cache write)
    const t0 = performance.now();
    const res1 = await fetch(`${baseUrl}/api/tracking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': testIp
      },
      body: JSON.stringify({ pageUrl: 'https://kosmobali.my.id/benchmark' })
    });
    const d1 = performance.now() - t0;
    assert.equal(res1.status, 201);

    // Benchmark 2: Second visit (in-memory cache fast-path hit)
    const t1 = performance.now();
    const res2 = await fetch(`${baseUrl}/api/tracking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': testIp
      },
      body: JSON.stringify({ pageUrl: 'https://kosmobali.my.id/benchmark' })
    });
    const d2 = performance.now() - t1;
    assert.equal(res2.status, 200);

    // Benchmark 3: Throttled request latency (should return 429 instantly without touching DB)
    // First exhaust quota on testIp
    for (let i = 3; i <= 30; i++) {
      await fetch(`${baseUrl}/api/tracking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': testIp },
        body: JSON.stringify({})
      });
    }

    const t2 = performance.now();
    const throttledRes = await fetch(`${baseUrl}/api/tracking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': testIp },
      body: JSON.stringify({})
    });
    const dThrottled = performance.now() - t2;
    assert.equal(throttledRes.status, 429);

    console.log(`[Latency Benchmarks]:
  - First Visit (DB Cold-path): ${d1.toFixed(2)} ms
  - Deduplicated Visit (In-Memory Fast-path): ${d2.toFixed(2)} ms
  - 429 Throttled Rejection: ${dThrottled.toFixed(2)} ms`);

    // In-Memory Fast-path and 429 rejection should both be fast (< 100ms)
    assert.ok(dThrottled < 200, `429 rejection must be fast (<200ms), got ${dThrottled.toFixed(2)}ms`);
  });
});
