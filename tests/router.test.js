import test from 'node:test';
import assert from 'node:assert/strict';
import router from '../backend/router.ts';

test('Express router endpoints registration', async (t) => {
  await t.test('router is defined and has registered route stack', () => {
    assert.ok(router, 'Router must be defined');
    assert.ok(Array.isArray(router.stack), 'Router must have a route stack array');
    assert.ok(router.stack.length > 0, 'Router must contain registered routes');
  });

  await t.test('contains all expected core API endpoints and methods', () => {
    const routePaths = router.stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods)
      }));

    const expectedEndpoints = [
      { path: '/upload', method: 'post' },
      { path: '/auth/login', method: 'post' },
      { path: '/auth/register', method: 'post' },
      { path: '/auth/verify-password', method: 'post' },
      { path: '/users/profile/:id', method: 'get' },
      { path: '/users/profile/:id', method: 'put' },
      { path: '/users', method: 'get' },
      { path: '/users', method: 'post' },
      { path: '/users/:id', method: 'put' },
      { path: '/users/:id', method: 'delete' },
      { path: '/properties', method: 'get' },
      { path: '/properties/:id', method: 'get' },
      { path: '/properties', method: 'post' },
      { path: '/properties/:id', method: 'put' },
      { path: '/properties/:id', method: 'delete' },
      { path: '/reviews', method: 'get' },
      { path: '/reviews', method: 'post' },
      { path: '/reviews/:id', method: 'put' },
      { path: '/reviews/:id', method: 'delete' },
      { path: '/stats', method: 'get' },
      { path: '/withdraw', method: 'post' },
      { path: '/admin/withdrawals/:id/process', method: 'post' },
      { path: '/admin/withdrawals/:id/reject', method: 'post' },
      { path: '/tracking/visit', method: 'post' },
      { path: '/admin/stats', method: 'get' },
      { path: '/admin/tracking-history', method: 'get' },
      { path: '/reports/tracking/excel', method: 'get' },
      { path: '/reports/landlord/excel', method: 'get' },
      { path: '/rentals', method: 'get' },
      { path: '/rentals', method: 'post' },
      { path: '/rentals/:id/terminate', method: 'post' },
      { path: '/payment/token', method: 'post' },
      { path: '/payment/webhook', method: 'post' }
    ];

    for (const expected of expectedEndpoints) {
      const match = routePaths.find(
        (r) => r.path === expected.path && r.methods.includes(expected.method)
      );
      assert.ok(
        match,
        `Expected endpoint [${expected.method.toUpperCase()}] ${expected.path} to be registered in router`
      );
    }
  });
});
