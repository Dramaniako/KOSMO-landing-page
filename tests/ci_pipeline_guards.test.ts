(process.env as Record<string, string | undefined>).NO_LISTEN = 'true';
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { dbConfig, getPool } from '../backend/db';

test('CI/CD Pipeline Guardrails & Deterministic Test Execution Suite', async (t) => {
  await t.test('1.1 package.json test scripts enforce strict sequential execution (--test-concurrency=1)', () => {
    const pkgPath = path.resolve('package.json');
    assert.ok(fs.existsSync(pkgPath), 'package.json must exist');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    assert.ok(
      pkg.scripts.test.includes('--test-concurrency=1'),
      'npm test must include --test-concurrency=1 to prevent race conditions and connection exhaustion against remote database'
    );
    assert.ok(
      pkg.scripts.test.includes('--test-force-exit'),
      'npm test must include --test-force-exit to cleanly terminate sockets and pools'
    );
    assert.ok(
      pkg.scripts['test:integration'].includes('--test-concurrency=1'),
      'npm run test:integration must include --test-concurrency=1'
    );
  });

  await t.test('1.2 database configuration provides adequate timeout and connection headroom for CI cross-region latency', () => {
    assert.ok(
      (dbConfig.connectTimeout ?? 0) >= 30000,
      'connectTimeout must be at least 30,000ms (30s) to withstand cross-region TLS handshakes'
    );
    assert.equal(dbConfig.waitForConnections, true, 'waitForConnections must be true');
    assert.ok(
      Number(dbConfig.connectionLimit ?? 0) >= 10,
      'connectionLimit must provide at least 10 connections for concurrent transaction storms'
    );
  });

  await t.test('1.3 backend server source verifies direct-run execution for E2E webServer while honoring NO_LISTEN guard', () => {
    const serverPath = path.resolve('backend/server.ts');
    assert.ok(fs.existsSync(serverPath), 'backend/server.ts must exist');
    const content = fs.readFileSync(serverPath, 'utf8');

    assert.ok(
      content.includes('isDirectRun') || content.includes('/server(\\.\\w+)?$/'),
      'server.ts must determine whether execution is a direct run'
    );
    assert.ok(
      content.includes("process.env.NO_LISTEN !== 'true'"),
      'server.ts must strictly honor NO_LISTEN guard to prevent unclosed ports in unit tests'
    );
  });
});
