process.env.NO_LISTEN = 'true';
import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../backend/server.ts';
import { generateJwtToken } from '../backend/middleware/auth.ts';

test('API Performance, Latency SLAs & Payload Benchmarks', async (t) => {
  const PORT = 5088;
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(PORT, () => resolve(s));
  });

  const tenantToken = generateJwtToken({ id: 'user-tenant', email: 'tenant@kosmo.local', role: 'tenant' });

  // Warmup request to ensure database & caches are ready
  await fetch(`http://localhost:${PORT}/api/properties`);

  await t.test('GET /api/properties responds within 400ms SLA and has Cache-Control', async () => {
    const start = performance.now();
    const res = await fetch(`http://localhost:${PORT}/api/properties`, {
      headers: { 'Accept-Encoding': 'gzip, deflate, br' }
    });
    const buffer = await res.arrayBuffer();
    const duration = performance.now() - start;

    assert.equal(res.status, 200);
    assert.ok(duration < 400, `Expected latency < 400ms, got ${duration.toFixed(2)}ms`);
    assert.ok(res.headers.get('cache-control')?.includes('max-age=60'), 'Cache-Control header missing');
    assert.ok(buffer.byteLength > 0, 'Payload should not be empty');
  });

  await t.test('GET /api/reviews responds within 350ms and has Cache-Control', async () => {
    const start = performance.now();
    const res = await fetch(`http://localhost:${PORT}/api/reviews`);
    const duration = performance.now() - start;

    assert.equal(res.status, 200);
    assert.ok(duration < 350, `Expected latency < 350ms, got ${duration.toFixed(2)}ms`);
    assert.ok(res.headers.get('cache-control')?.includes('max-age=60'), 'Cache-Control header missing');
  });

  await t.test('GET /api/rentals responds within 350ms with valid JWT', async () => {
    const start = performance.now();
    const res = await fetch(`http://localhost:${PORT}/api/rentals`, {
      headers: { Authorization: `Bearer ${tenantToken}` }
    });
    const duration = performance.now() - start;

    assert.equal(res.status, 200);
    assert.ok(duration < 350, `Expected latency < 350ms, got ${duration.toFixed(2)}ms`);
  });

  const landlordToken = generateJwtToken({ id: 'user-landlord', email: 'landlord@kosmo.local', role: 'landlord' });

  await t.test('GET /api/landlord/stats responds within 350ms with SQL aggregations', async () => {
    const start = performance.now();
    const res = await fetch(`http://localhost:${PORT}/api/landlord/stats?landlordId=user-landlord`, {
      headers: { Authorization: `Bearer ${landlordToken}` }
    });
    const duration = performance.now() - start;

    assert.equal(res.status, 200);
    assert.ok(duration < 350, `Expected latency < 350ms, got ${duration.toFixed(2)}ms`);
    const data = await res.json() as Record<string, unknown>;
    assert.ok(typeof data.totalProperti === 'number');
    assert.ok(typeof data.balance === 'number');
  });

  await t.test('GET /api/landlord/financials responds within 350ms with SQL aggregations', async () => {
    const start = performance.now();
    const res = await fetch(`http://localhost:${PORT}/api/landlord/financials?landlordId=user-landlord`, {
      headers: { Authorization: `Bearer ${landlordToken}` }
    });
    const duration = performance.now() - start;

    assert.equal(res.status, 200);
    assert.ok(duration < 350, `Expected latency < 350ms, got ${duration.toFixed(2)}ms`);
    const data = await res.json() as Record<string, unknown>;
    assert.ok(Array.isArray(data.monthlyRevenue));
    assert.ok(Array.isArray(data.withdrawals));
  });

  server.close();
});
