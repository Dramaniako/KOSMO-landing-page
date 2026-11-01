import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bodyParser from 'body-parser';
import type { AddressInfo } from 'node:net';
import router from '../backend/router';
import { generateJwtToken } from '../backend/middleware/auth';
import { safeCount, safeRoomCount } from '../backend/routes/tracking.routes';

test('Tracking and Admin Stats Suite', async (t) => {
  const app = express();
  app.use(bodyParser.json());
  app.use(router);

  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const adminUser = {
    id: 'test-stats-admin-01',
    email: 'admin-stats@kosmo.test',
    role: 'admin' as const,
    name: 'Stats Test Admin'
  };

  const tenantUser = {
    id: 'test-stats-tenant-01',
    email: 'tenant-stats@kosmo.test',
    role: 'tenant' as const,
    name: 'Stats Test Tenant'
  };

  const adminToken = generateJwtToken(adminUser);
  const tenantToken = generateJwtToken(tenantUser);

  t.after(() => {
    server.close();
  });

  await t.test('safeCount and safeRoomCount error recovery', async () => {
    // Malformed query should not throw; must gracefully recover and return 0
    const count = await safeCount('SELECT INVALID_SYNTAX FROM non_existent_table_9999');
    assert.equal(typeof count, 'number');
    assert.equal(count, 0);

    const roomCount = await safeRoomCount();
    assert.equal(typeof roomCount, 'number');
    assert.ok(roomCount >= 0);
  });

  await t.test('GET /admin/stats access control', async () => {
    // Unauthenticated
    const unauthRes = await fetch(`${baseUrl}/admin/stats`);
    assert.equal(unauthRes.status, 401);

    // Non-admin role (tenant)
    const forbiddenRes = await fetch(`${baseUrl}/admin/stats`, {
      headers: { Authorization: `Bearer ${tenantToken}` }
    });
    assert.equal(forbiddenRes.status, 403);
  });

  await t.test('GET /admin/stats returns 8 canonical numeric KPIs and backwards-compatible aliases', async () => {
    const res = await fetch(`${baseUrl}/admin/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;

    // 8 Canonical KPIs
    const canonicalKpis = [
      'visitors',
      'users',
      'landlords',
      'properties',
      'rooms',
      'activeRentals',
      'pendingWithdrawals',
      'openTickets'
    ];

    for (const key of canonicalKpis) {
      assert.ok(key in body, `Expected KPI "${key}" to be present in response`);
      assert.equal(typeof body[key], 'number', `KPI "${key}" must be a number`);
      assert.ok((body[key] as number) >= 0, `KPI "${key}" must be non-negative`);
    }

    // Backwards compatibility aliases
    const legacyAliases = [
      'totalVisitors',
      'totalUsers',
      'totalLandlords',
      'totalProperties',
      'totalRooms'
    ];

    for (const alias of legacyAliases) {
      assert.ok(alias in body, `Expected legacy alias "${alias}" in response`);
      assert.equal(typeof body[alias], 'number', `Legacy alias "${alias}" must be a number`);
      assert.ok((body[alias] as number) >= 0, `Legacy alias "${alias}" must be non-negative`);
    }

    // Verify alias consistency
    assert.equal(body.totalVisitors, body.visitors);
    assert.equal(body.totalUsers, body.users);
    assert.equal(body.totalLandlords, body.landlords);
    assert.equal(body.totalProperties, body.properties);
    assert.equal(body.totalRooms, body.rooms);
  });

  await t.test('GET /admin/tracking-history returns 24h, 7d, 30d timezone-independent interval arrays', async () => {
    const res = await fetch(`${baseUrl}/admin/tracking-history`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      history24h: Array<{ label: string; count: number }>;
      history7d: Array<{ label: string; count: number }>;
      history30d: Array<{ label: string; count: number }>;
    };

    assert.ok(Array.isArray(body.history24h), 'history24h must be an array');
    assert.equal(body.history24h.length, 24, 'history24h must contain exactly 24 hour buckets');
    body.history24h.forEach((item, idx) => {
      assert.equal(typeof item.label, 'string', `history24h[${idx}].label must be string`);
      assert.equal(typeof item.count, 'number', `history24h[${idx}].count must be number`);
      assert.ok(item.count >= 0, `history24h[${idx}].count must be >= 0`);
    });

    assert.ok(Array.isArray(body.history7d), 'history7d must be an array');
    assert.equal(body.history7d.length, 7, 'history7d must contain exactly 7 day buckets');
    body.history7d.forEach((item, idx) => {
      assert.equal(typeof item.label, 'string', `history7d[${idx}].label must be string`);
      assert.equal(typeof item.count, 'number', `history7d[${idx}].count must be number`);
      assert.ok(item.count >= 0, `history7d[${idx}].count must be >= 0`);
    });

    assert.ok(Array.isArray(body.history30d), 'history30d must be an array');
    assert.equal(body.history30d.length, 30, 'history30d must contain exactly 30 day buckets');
    body.history30d.forEach((item, idx) => {
      assert.equal(typeof item.label, 'string', `history30d[${idx}].label must be string`);
      assert.equal(typeof item.count, 'number', `history30d[${idx}].count must be number`);
      assert.ok(item.count >= 0, `history30d[${idx}].count must be >= 0`);
    });
  });
});
