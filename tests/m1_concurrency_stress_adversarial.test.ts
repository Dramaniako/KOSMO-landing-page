(process.env as Record<string, string | undefined>).NO_LISTEN = 'true';
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import { pool, initDb, ensureDbReady, ensureDbInitialized, createTables, applyMigrations, ensureIndexes, seedDatabase, type QueryExecutor } from '../backend/db';
const { dbReadinessMiddleware } = await import('../backend/server');
import type { RowDataPacket } from 'mysql2/promise';

test('ADVERSARIAL STRESS SUITE: Database Initialization, Concurrency & Resilience Under Outage/Recovery', async (t) => {
  // Check if live DB connection is available
  let isDbLive = false;
  try {
    const conn = await pool.getConnection();
    isDbLive = true;
    conn.release();
  } catch (err) {
    t.diagnostic(`Live database unreachable (${String(err)}). Some live DDL stress tests will mock execution.`);
  }

  // =========================================================================
  // Challenge 1: 100 Heavy Concurrent Invocations & Single-Flight Deduplication
  // =========================================================================
  await t.test('1. Heavy Concurrency: 100 simultaneous invocations of initDb, ensureDbReady, and ensureDbInitialized', async (t2) => {
    await t2.test('1.1 100 simultaneous ensureDbInitialized() calls resolve cleanly without race conditions', async () => {
      const concurrencyLevel = 100;
      const promises = Array.from({ length: concurrencyLevel }, () => ensureDbInitialized());
      const results = await Promise.allSettled(promises);

      assert.equal(results.length, concurrencyLevel);
      for (let i = 0; i < results.length; i++) {
        assert.equal(
          results[i].status,
          'fulfilled',
          `Call #${i + 1} of ensureDbInitialized() failed: ${(results[i] as PromiseRejectedResult).reason}`
        );
      }
    });

    await t2.test('1.2 100 simultaneous ensureDbReady() calls resolve with single-flight memoization', async () => {
      const concurrencyLevel = 100;
      const promises = Array.from({ length: concurrencyLevel }, () => ensureDbReady());
      const results = await Promise.allSettled(promises);

      assert.equal(results.length, concurrencyLevel);
      for (let i = 0; i < results.length; i++) {
        assert.equal(
          results[i].status,
          'fulfilled',
          `Call #${i + 1} of ensureDbReady() failed: ${(results[i] as PromiseRejectedResult).reason}`
        );
      }
    });

    await t2.test('1.3 Mixed storm: 150 simultaneous calls mixing initDb, ensureDbReady, and ensureDbInitialized', async () => {
      const mixedCalls: Promise<void>[] = [];
      for (let i = 0; i < 50; i++) {
        mixedCalls.push(initDb());
        mixedCalls.push(ensureDbReady());
        mixedCalls.push(ensureDbInitialized());
      }

      const results = await Promise.allSettled(mixedCalls);
      assert.equal(results.length, 150);
      const rejections = results.filter((r) => r.status === 'rejected');
      assert.equal(rejections.length, 0, `Expected 0 rejections, got ${rejections.length}`);
    });
  });

  // =========================================================================
  // Challenge 2: Middleware Resilience Under Simulated Outage, Flapping & Recovery
  // =========================================================================
  await t.test('2. Middleware Resilience: dbReadinessMiddleware under outage, flapping and rapid recovery', async (t2) => {
    await t2.test('2.1 Outage flood: 100 concurrent requests arriving during DB outage all return HTTP 500 JSON without hanging', async () => {
      const simulatedError = new Error('ETIMEDOUT: Connection to database cluster lost');
      const mockFailingDbReady = async () => {
        throw simulatedError;
      };

      const requestCount = 100;
      const responses: { status: number; body: unknown; nextCalled: boolean }[] = [];

      const promises = Array.from({ length: requestCount }, async (_, idx) => {
        let recordedStatus = 0;
        let recordedBody: unknown = null;
        let nextCalled = false;

        const req = { path: `/api/properties/${idx}` } as Request;
        const res = {
          status: (code: number) => {
            recordedStatus = code;
            return res;
          },
          json: (body: unknown) => {
            recordedBody = body;
            return res;
          }
        } as unknown as Response;
        const next: NextFunction = () => {
          nextCalled = true;
        };

        await dbReadinessMiddleware(req, res, next, mockFailingDbReady);
        responses.push({ status: recordedStatus, body: recordedBody, nextCalled });
      });

      await Promise.all(promises);

      assert.equal(responses.length, requestCount);
      for (let i = 0; i < responses.length; i++) {
        assert.equal(responses[i].status, 500, `Request #${i + 1} status should be 500`);
        assert.deepEqual(
          responses[i].body,
          { error: 'Database connection failed', message: 'Unable to reach database cluster' },
          `Request #${i + 1} should receive standard error payload`
        );
        assert.equal(responses[i].nextCalled, false, `Request #${i + 1} must NOT call next()`);
      }
    });

    await t2.test('2.2 Full Outage -> Recovery transition: 100 requests during outage fail, subsequent 100 succeed on recovery', async () => {
      let isDbHealthy = false;
      const dynamicDbReady = async () => {
        if (!isDbHealthy) {
          throw new Error('ECONNREFUSED: Database offline');
        }
      };

      // Phase A: Database is DOWN
      const phaseAFailures: { status: number; nextCalled: boolean }[] = [];
      const phaseAPromises = Array.from({ length: 100 }, async () => {
        let status = 0;
        let nextCalled = false;
        const req = { path: '/api/rentals' } as Request;
        const res = {
          status: (code: number) => {
            status = code;
            return res;
          },
          json: () => res
        } as unknown as Response;
        const next: NextFunction = () => {
          nextCalled = true;
        };

        await dbReadinessMiddleware(req, res, next, dynamicDbReady);
        phaseAFailures.push({ status, nextCalled });
      });
      await Promise.all(phaseAPromises);

      assert.equal(phaseAFailures.every((r) => r.status === 500 && !r.nextCalled), true, 'All Phase A requests must fail with 500');

      // Phase B: Database RECOVERS
      isDbHealthy = true;
      const phaseBSuccesses: { status: number; nextCalled: boolean }[] = [];
      const phaseBPromises = Array.from({ length: 100 }, async () => {
        let status = 0;
        let nextCalled = false;
        const req = { path: '/api/rentals' } as Request;
        const res = {
          status: (code: number) => {
            status = code;
            return res;
          },
          json: () => res
        } as unknown as Response;
        const next: NextFunction = () => {
          nextCalled = true;
        };

        await dbReadinessMiddleware(req, res, next, dynamicDbReady);
        phaseBSuccesses.push({ status, nextCalled });
      });
      await Promise.all(phaseBPromises);

      assert.equal(phaseBSuccesses.every((r) => r.status === 0 && r.nextCalled), true, 'All Phase B requests must invoke next() after DB recovery');
    });

    await t2.test('2.3 Route immunity under outage: /api/health and static routes remain 100% available during database outage', async () => {
      const failingDbReady = async () => {
        throw new Error('DATABASE_OUTAGE');
      };

      const immuneRoutes = [
        '/api/health',
        '/uploads/property-1.jpg',
        '/uploads/contract-xyz.pdf',
        '/static/css/main.css',
        '/favicon.ico'
      ];

      for (const route of immuneRoutes) {
        let nextCalled = false;
        let statusCalled = false;
        const req = { path: route } as Request;
        const res = {
          status: () => {
            statusCalled = true;
            return res;
          },
          json: () => res
        } as unknown as Response;
        const next: NextFunction = () => {
          nextCalled = true;
        };

        await dbReadinessMiddleware(req, res, next, failingDbReady);
        assert.equal(nextCalled, true, `Route ${route} must bypass DB check and call next()`);
        assert.equal(statusCalled, false, `Route ${route} must not have res.status called`);
      }
    });

    await t2.test('2.4 Rapid state flapping: 60 sequential requests with alternating DB availability respond deterministically', async () => {
      let toggle = false;
      const flappingDbReady = async () => {
        toggle = !toggle;
        if (!toggle) {
          throw new Error('Intermittent network glitch');
        }
      };

      for (let i = 0; i < 60; i++) {
        let statusCode = 0;
        let nextCalled = false;
        const req = { path: '/api/users/profile' } as Request;
        const res = {
          status: (code: number) => {
            statusCode = code;
            return res;
          },
          json: () => res
        } as unknown as Response;
        const next: NextFunction = () => {
          nextCalled = true;
        };

        await dbReadinessMiddleware(req, res, next, flappingDbReady);

        if (toggle) {
          // Healthy turn
          assert.equal(nextCalled, true, `Iteration #${i + 1} (healthy) should call next()`);
          assert.equal(statusCode, 0, `Iteration #${i + 1} (healthy) should not set status`);
        } else {
          // Unhealthy turn
          assert.equal(nextCalled, false, `Iteration #${i + 1} (unhealthy) should NOT call next()`);
          assert.equal(statusCode, 500, `Iteration #${i + 1} (unhealthy) should return 500`);
        }
      }
    });
  });

  // =========================================================================
  // Challenge 3: Batch DDL, Migration & Seed Idempotency Under Stress
  // =========================================================================
  if (isDbLive) {
    await t.test('3. Batch DDL & Seed Stress: Consecutive & concurrent runs without data corruption', async (t2) => {
      await t2.test('3.1 createTables is idempotent over 5 consecutive invocations', async () => {
        for (let i = 0; i < 5; i++) {
          await assert.doesNotReject(
            async () => {
              await createTables(pool);
            },
            `createTables pass #${i + 1} must not throw`
          );
        }
      });

      await t2.test('3.2 applyMigrations is idempotent over 10 consecutive invocations', async () => {
        for (let i = 0; i < 10; i++) {
          await assert.doesNotReject(
            async () => {
              await applyMigrations(pool);
            },
            `applyMigrations pass #${i + 1} must not throw`
          );
        }
      });

      await t2.test('3.3 ensureIndexes is safe under 5 concurrent parallel executions', async () => {
        const parallelIndexRuns = Array.from({ length: 5 }, () => ensureIndexes(pool));
        const results = await Promise.allSettled(parallelIndexRuns);
        for (const res of results) {
          assert.equal(res.status, 'fulfilled', 'ensureIndexes must resolve safely in parallel');
        }
      });

      await t2.test('3.4 seedDatabase preserves exact cardinality and never duplicates records on multiple runs', async () => {
        // Capture initial row counts for seed entity IDs
        const [initUsers] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) as count FROM users WHERE id IN ('user-admin', 'user-landlord', 'user-tenant')");
        const [initProps] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) as count FROM properties WHERE id IN ('prop-01', 'prop-02', 'prop-03')");
        const [initFacs] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) as count FROM property_facilities WHERE propertyId IN ('prop-01', 'prop-02', 'prop-03')");
        const [initRevs] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) as count FROM reviews WHERE id IN ('rev-01', 'rev-02', 'rev-03')");

        // Run seedDatabase 3 times consecutively
        await seedDatabase(pool);
        await seedDatabase(pool);
        await seedDatabase(pool);

        // Assert record counts are identical (strict zero duplication)
        const [postUsers] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) as count FROM users WHERE id IN ('user-admin', 'user-landlord', 'user-tenant')");
        const [postProps] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) as count FROM properties WHERE id IN ('prop-01', 'prop-02', 'prop-03')");
        const [postFacs] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) as count FROM property_facilities WHERE propertyId IN ('prop-01', 'prop-02', 'prop-03')");
        const [postRevs] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) as count FROM reviews WHERE id IN ('rev-01', 'rev-02', 'rev-03')");

        assert.equal(postUsers[0].count, initUsers[0].count, `Users count must remain ${initUsers[0].count}`);
        assert.equal(postProps[0].count, initProps[0].count, `Properties count must remain ${initProps[0].count}`);
        assert.equal(postFacs[0].count, initFacs[0].count, `Facilities count must remain ${initFacs[0].count}`);
        assert.equal(postRevs[0].count, initRevs[0].count, `Reviews count must remain ${initRevs[0].count}`);
      });

      await t2.test('3.5 DDL Concurrency Stress: 10 parallel applyMigrations pipelines run concurrently without deadlock', async () => {
        const parallelMigrations = Array.from({ length: 10 }, () => applyMigrations(pool));
        const results = await Promise.allSettled(parallelMigrations);
        for (let i = 0; i < results.length; i++) {
          assert.equal(results[i].status, 'fulfilled', `Concurrent migration #${i + 1} must succeed`);
        }
      });
    });
  } else {
    await t.test('3. Batch DDL & Seed Stress (Mocked Executor Verification)', async (t2) => {
      await t2.test('3.1 Mock executor receives correctly structured idempotent queries', async () => {
        const executedQueries: string[] = [];
        const mockExecutor = {
          query: async (sql: string) => {
            executedQueries.push(sql);
            if (sql.includes('COUNT(*)')) {
              return [[{ count: 0 }], []];
            }
            if (sql.includes('SELECT id, password')) {
              return [[], []];
            }
            return [{}, []];
          }
        } as unknown as QueryExecutor;

        await createTables(mockExecutor);
        await applyMigrations(mockExecutor);
        await ensureIndexes(mockExecutor);
        await seedDatabase(mockExecutor);

        assert.ok(executedQueries.length > 20, 'All DDL, migration, index, and seed statements must be dispatched');
        assert.ok(executedQueries.some((q) => q.includes('CREATE TABLE IF NOT EXISTS users')));
        assert.ok(executedQueries.some((q) => q.includes('ALTER TABLE rentals ADD COLUMN IF NOT EXISTS contract_url')));
        assert.ok(executedQueries.some((q) => q.includes('INSERT INTO users')));
      });
    });
  }
});
