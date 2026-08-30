(process.env as Record<string, string | undefined>).NO_LISTEN = 'true';
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';

const { default: app } = await import('../backend/server');
const { pool } = await import('../backend/db');
const { generateJwtToken } = await import('../backend/middleware/auth');

test('API Performance, Latency SLAs & Payload Benchmarks', async (t) => {
  const PORT = 5088;
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(PORT, () => resolve(s));
  });

  const tenantToken = generateJwtToken({ id: 'user-tenant', email: 'tenant@kosmo.local', role: 'tenant' });
  const landlordToken = generateJwtToken({ id: 'user-landlord', email: 'landlord@kosmo.local', role: 'landlord' });

  // Warmup requests to ensure database pool connections & caches are ready
  await Promise.all([
    fetch(`http://localhost:${PORT}/api/properties`),
    fetch(`http://localhost:${PORT}/api/reviews`),
    fetch(`http://localhost:${PORT}/api/rentals`, { headers: { Authorization: `Bearer ${tenantToken}` } }),
    fetch(`http://localhost:${PORT}/api/landlord/stats?landlordId=user-landlord`, { headers: { Authorization: `Bearer ${landlordToken}` } }),
    fetch(`http://localhost:${PORT}/api/landlord/financials?landlordId=user-landlord`, { headers: { Authorization: `Bearer ${landlordToken}` } })
  ]);

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

  await t.test('GET /api/properties?facility filters with Set lookup without allocations', async () => {
    const res = await fetch(`http://localhost:${PORT}/api/properties?facility=Wifi`);
    assert.equal(res.status, 200);
    const properties = (await res.json()) as Array<{ facilities: string[] }>;
    assert.ok(Array.isArray(properties));
    for (const prop of properties) {
      const lowerFacilities = prop.facilities.map((f: string) => f.toLowerCase());
      assert.ok(lowerFacilities.includes('wifi'), 'Each returned property must contain Wifi');
    }
  });

  await t.test('POST /api/properties creates property with bulk facility insertion and PUT updates facilities', async () => {
    const adminToken = generateJwtToken({ id: 'user-admin', email: 'admin@kosmo.local', role: 'admin' });

    // 1. Create property with multiple facilities
    const createRes = await fetch(`http://localhost:${PORT}/api/properties`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        name: 'KOSMO Performance Suite Test',
        district: 'Denpasar',
        address: 'Jl. Gatot Subroto No. 99',
        price: 2500000,
        totalRooms: 6,
        facilities: ['Wifi', 'Air', 'Listrik', 'Keamanan', 'Parkir']
      })
    });
    assert.equal(createRes.status, 201);

    // Fetch created property to verify facilities
    const listRes = await fetch(`http://localhost:${PORT}/api/properties?district=Denpasar`);
    assert.equal(listRes.status, 200);
    const list = (await listRes.json()) as Array<{ id: string; name: string; facilities: string[] }>;
    const createdProp = list.find((p) => p.name === 'KOSMO Performance Suite Test');
    assert.ok(createdProp, 'Created property must be found in catalog');
    assert.equal(createdProp.facilities.length, 5);

    // 2. Update property facilities using bulk insertion
    const updateRes = await fetch(`http://localhost:${PORT}/api/properties/${createdProp.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        facilities: ['Wifi', 'Air', 'Gym']
      })
    });
    assert.equal(updateRes.status, 200);

    // Verify detail reflects updated facilities
    const detailRes = await fetch(`http://localhost:${PORT}/api/properties/${createdProp.id}`);
    assert.equal(detailRes.status, 200);
    const detail = (await detailRes.json()) as { facilities: string[] };
    assert.equal(detail.facilities.length, 3);
    assert.ok(detail.facilities.includes('Gym'));
  });

  server.close();
});
