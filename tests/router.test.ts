(process.env as Record<string, string | undefined>).NO_LISTEN = 'true';
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';

const { default: router } = await import('../backend/router');
const { isOriginAllowed, corsOptions } = await import('../backend/server');

interface RouterLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
  };
}

test('Express router endpoints registration', async (t) => {
  await t.test('router is defined and has registered route stack', () => {
    assert.ok(router, 'Router must be defined');
    assert.ok(Array.isArray(router.stack), 'Router must have a route stack array');
    assert.ok(router.stack.length > 0, 'Router must contain registered routes');
  });

  await t.test('contains all expected core API endpoints and methods', () => {
    const routePaths = (router.stack as unknown as RouterLayer[])
      .filter((layer): layer is RouterLayer & { route: { path: string; methods: Record<string, boolean> } } => Boolean(layer.route))
      .map((layer) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods)
      }));

    const expectedEndpoints = [
      { path: '/health', method: 'get' },
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
      { path: '/admin/withdrawals', method: 'get' },
      { path: '/admin/withdrawals/:id/process', method: 'post' },
      { path: '/admin/withdrawals/:id/reject', method: 'post' },
      { path: '/tracking/visit', method: 'post' },
      { path: '/admin/stats', method: 'get' },
      { path: '/admin/tracking-history', method: 'get' },
      { path: '/reports/tracking/excel', method: 'get' },
      { path: '/reports/landlord/excel', method: 'get' },
      { path: '/rentals/contract/preview', method: 'post' },
      { path: '/rentals/contract/sign', method: 'post' },
      { path: '/rentals', method: 'get' },
      { path: '/rentals', method: 'post' },
      { path: '/rentals/:id/terminate', method: 'post' },
      { path: '/rentals/:id/contract', method: 'get' },
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

  await t.test('CORS policy allows trusted origins, localhost, production domains, and non-browser requests', () => {
    // Non-browser / server-to-server (origin undefined)
    assert.equal(isOriginAllowed(undefined), true);
    assert.equal(isOriginAllowed(''), true);

    // Default localhost development origins
    assert.equal(isOriginAllowed('http://localhost:5173'), true);
    assert.equal(isOriginAllowed('http://localhost:3000'), true);
    assert.equal(isOriginAllowed('http://127.0.0.1:5173'), true);
    assert.equal(isOriginAllowed('http://localhost:5173/'), true);

    // Default production domain and subdomains
    assert.equal(isOriginAllowed('https://kosmobali.my.id'), true);
    assert.equal(isOriginAllowed('https://www.kosmobali.my.id'), true);
    assert.equal(isOriginAllowed('http://kosmobali.my.id'), true);
    assert.equal(isOriginAllowed('https://preview-123.vercel.app'), true);

    // Untrusted / malicious origins
    assert.equal(isOriginAllowed('http://attacker.com'), false);
    assert.equal(isOriginAllowed('https://evil-phishing-site.org'), false);
    assert.equal(isOriginAllowed('http://localhost.evil.com'), false);
  });

  await t.test('CORS policy respects ALLOWED_ORIGINS environment variable', () => {
    const envObj = process.env as Record<string, string | undefined>;
    const originalEnv = envObj.ALLOWED_ORIGINS;
    try {
      envObj.ALLOWED_ORIGINS = 'https://custom-partner.com, https://kosmo.id';
      assert.equal(isOriginAllowed('https://custom-partner.com'), true);
      assert.equal(isOriginAllowed('https://kosmo.id'), true);
      assert.equal(isOriginAllowed('https://unauthorized-domain.com'), false);
    } finally {
      envObj.ALLOWED_ORIGINS = originalEnv;
    }
  });

  await t.test('corsOptions gracefully permits allowed origins and blocks disallowed origins without throwing error', () => {
    assert.ok(corsOptions);
    assert.equal(corsOptions.credentials, true);
    assert.ok(Array.isArray(corsOptions.methods));
    assert.ok(corsOptions.methods.includes('GET'));
    assert.ok(corsOptions.methods.includes('POST'));
    assert.ok(corsOptions.methods.includes('PUT'));
    assert.ok(corsOptions.methods.includes('DELETE'));

    if (typeof corsOptions.origin === 'function') {
      let allowedResult: boolean | undefined = undefined;
      let blockedResult: boolean | undefined = undefined;

      corsOptions.origin('https://www.kosmobali.my.id', (err, allow) => {
        assert.equal(err, null);
        allowedResult = allow;
      });
      assert.equal(allowedResult, true);

      corsOptions.origin('https://evil-hacker.com', (err, allow) => {
        assert.equal(err, null);
        blockedResult = allow;
      });
      assert.equal(blockedResult, false);
    }
  });

  await t.test('verifies contract preview, sign, and download routes are mounted on router stack', () => {
    const routePaths = (router.stack as unknown as RouterLayer[])
      .filter((layer): layer is RouterLayer & { route: { path: string; methods: Record<string, boolean> } } => Boolean(layer.route))
      .map((layer) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods)
      }));

    const previewRoute = routePaths.find((r) => r.path === '/rentals/contract/preview' && r.methods.includes('post'));
    const signRoute = routePaths.find((r) => r.path === '/rentals/contract/sign' && r.methods.includes('post'));
    const getContractRoute = routePaths.find((r) => r.path === '/rentals/:id/contract' && r.methods.includes('get'));

    assert.ok(previewRoute, 'POST /rentals/contract/preview must be registered');
    assert.ok(signRoute, 'POST /rentals/contract/sign must be registered');
    assert.ok(getContractRoute, 'GET /rentals/:id/contract must be registered');
  });
});
