(process.env as Record<string, string | undefined>).NO_LISTEN = 'true';
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
const { ensureDbInitialized, dbReadinessMiddleware } = await import('../backend/server');
import {
  ensureDbReady,
  initDb,
  createTables,
  applyMigrations,
  ensureIndexes,
  seedDatabase,
  seedUsers,
  seedPropertiesAndFacilities,
  seedReviews,
  validateDatabaseConfig
} from '../backend/db';
import {
  isCloudinaryConfigured,
  uploadImageStream,
  uploadContractStream
} from '../backend/services/cloudinary';
import { isMidtransConfigured } from '../backend/router';

const env = process.env as Record<string, string | undefined>;

test('Database Initialization & Serverless Middleware Test Suite (Issues #05, #08, #11, #12, #23)', async (t) => {

  // =========================================================================
  // 1. ensureDbInitialized() and DB Modularity Direct Exports & Lifecycle Tests
  // =========================================================================
  await t.test('1.1 exports all modular database lifecycle subroutines and contracts', () => {
    assert.equal(typeof ensureDbInitialized, 'function', 'ensureDbInitialized must be an exported function');
    assert.equal(typeof ensureDbReady, 'function', 'ensureDbReady must be an exported function');
    assert.equal(typeof initDb, 'function', 'initDb must be an exported function');
    assert.equal(typeof createTables, 'function', 'createTables must be an exported function');
    assert.equal(typeof applyMigrations, 'function', 'applyMigrations must be an exported function');
    assert.equal(typeof ensureIndexes, 'function', 'ensureIndexes must be an exported function');
    assert.equal(typeof seedDatabase, 'function', 'seedDatabase must be an exported function');
    assert.equal(typeof seedUsers, 'function', 'seedUsers must be an exported function');
    assert.equal(typeof seedPropertiesAndFacilities, 'function', 'seedPropertiesAndFacilities must be an exported function');
    assert.equal(typeof seedReviews, 'function', 'seedReviews must be an exported function');
    assert.equal(typeof validateDatabaseConfig, 'function', 'validateDatabaseConfig must be an exported function');

    const result = ensureDbInitialized();
    assert.ok(result instanceof Promise || typeof (result as Promise<void>)?.then === 'function', 'ensureDbInitialized must return a Promise');
  });

  await t.test('1.2 ensureDbInitialized is idempotent and resolves on consecutive calls', async () => {
    await assert.doesNotReject(async () => {
      await ensureDbInitialized();
      await ensureDbInitialized();
      await ensureDbInitialized();
    }, 'Consecutive ensureDbInitialized calls must resolve cleanly without error');
  });

  await t.test('1.3 ensureDbInitialized handles concurrent invocations via single-flight promise', async () => {
    const concurrentCalls = Array.from({ length: 5 }, () => ensureDbInitialized());
    const results = await Promise.allSettled(concurrentCalls);
    for (const res of results) {
      assert.equal(res.status, 'fulfilled', 'All concurrent ensureDbInitialized promises must resolve');
    }
  });

  // =========================================================================
  // 2. Serverless Database Readiness Middleware Tests
  // =========================================================================
  await t.test('2.1 Middleware: calls next() when database readiness succeeds on /api route', async () => {
    let nextCalled = false;
    let statusCalled = false;

    const mockReq = { path: '/api/properties' } as Request;
    const mockRes = {
      status: () => {
        statusCalled = true;
        return mockRes;
      },
      json: () => mockRes
    } as unknown as Response;
    const mockNext: NextFunction = () => {
      nextCalled = true;
    };

    const mockDbReady = async () => {
      // Mock successful DB connection/readiness
    };

    await dbReadinessMiddleware(mockReq, mockRes, mockNext, mockDbReady);

    assert.equal(nextCalled, true, 'next() must be called on successful DB readiness');
    assert.equal(statusCalled, false, 'res.status must NOT be called on success');
  });

  await t.test('2.2 Middleware: intercepts and returns HTTP 500 JSON error when DB readiness fails on /api route', async () => {
    let nextCalled = false;
    let recordedStatus = 0;
    let recordedJson: unknown = null;

    const mockReq = { path: '/api/users' } as Request;
    const mockRes = {
      status: (code: number) => {
        recordedStatus = code;
        return mockRes;
      },
      json: (body: unknown) => {
        recordedJson = body;
        return mockRes;
      }
    } as unknown as Response;
    const mockNext: NextFunction = () => {
      nextCalled = true;
    };

    const mockDbReadyFailure = async () => {
      throw new Error('Database cluster connection timeout (ETIMEDOUT)');
    };

    await dbReadinessMiddleware(mockReq, mockRes, mockNext, mockDbReadyFailure);

    assert.equal(nextCalled, false, 'next() must NOT be called when DB readiness check fails');
    assert.equal(recordedStatus, 500, 'res.status must be 500 on DB connection failure');
    assert.deepEqual(recordedJson, {
      error: 'Database connection failed',
      message: 'Unable to reach database cluster'
    }, 'res.json must return standard database error payload');
  });

  await t.test('2.3 Middleware: bypasses DB readiness check for /api/health', async () => {
    let nextCalled = false;
    let dbReadyInvoked = false;

    const mockReq = { path: '/api/health' } as Request;
    const mockRes = {} as Response;
    const mockNext: NextFunction = () => {
      nextCalled = true;
    };
    const mockDbReady = async () => {
      dbReadyInvoked = true;
    };

    await dbReadinessMiddleware(mockReq, mockRes, mockNext, mockDbReady);

    assert.equal(nextCalled, true, 'next() must be called immediately for /api/health');
    assert.equal(dbReadyInvoked, false, 'ensureDbReady must NOT be invoked for /api/health');
  });

  await t.test('2.4 Middleware: bypasses DB readiness check for non-/api routes (e.g. /uploads)', async () => {
    let nextCalled = false;
    let dbReadyInvoked = false;

    const mockReq = { path: '/uploads/prop-1.jpg' } as Request;
    const mockRes = {} as Response;
    const mockNext: NextFunction = () => {
      nextCalled = true;
    };
    const mockDbReady = async () => {
      dbReadyInvoked = true;
    };

    await dbReadinessMiddleware(mockReq, mockRes, mockNext, mockDbReady);

    assert.equal(nextCalled, true, 'next() must be called immediately for /uploads routes');
    assert.equal(dbReadyInvoked, false, 'ensureDbReady must NOT be invoked for /uploads routes');
  });

  // =========================================================================
  // 3. Issue #08: Strict Database Credentials Enforcement Tests
  // =========================================================================
  await t.test('3.1 validateDatabaseConfig allows empty password on localhost in development', () => {
    const origEnv = env.NODE_ENV;
    try {
      env.NODE_ENV = 'development';
      assert.doesNotThrow(() => {
        validateDatabaseConfig({ host: 'localhost', user: 'root', password: '' });
      });
      assert.doesNotThrow(() => {
        validateDatabaseConfig({ host: '127.0.0.1', user: 'root', password: '' });
      });
      assert.doesNotThrow(() => {
        validateDatabaseConfig({ host: '192.168.1.100', user: 'root', password: '' });
      });
    } finally {
      env.NODE_ENV = origEnv;
    }
  });

  await t.test('3.2 validateDatabaseConfig throws in production when password or user is empty/placeholder', () => {
    const origEnv = env.NODE_ENV;
    try {
      env.NODE_ENV = 'production';
      assert.throws(
        () => validateDatabaseConfig({ host: 'localhost', user: 'root', password: '' }),
        /Insecure database configuration: DB_PASSWORD is required/,
        'Should throw on empty password in production'
      );
      assert.throws(
        () => validateDatabaseConfig({ host: 'localhost', user: 'root', password: 'your_database_password' }),
        /Insecure database configuration: DB_PASSWORD is required/,
        'Should throw on placeholder password in production'
      );
      assert.throws(
        () => validateDatabaseConfig({ host: 'localhost', user: '', password: 'secretpassword123' }),
        /Insecure database configuration: DB_USER is required/,
        'Should throw on empty user in production'
      );
      assert.throws(
        () => validateDatabaseConfig({ host: 'localhost', user: 'your_db_user', password: 'secretpassword123' }),
        /Insecure database configuration: DB_USER is required/,
        'Should throw on placeholder user in production'
      );
    } finally {
      env.NODE_ENV = origEnv;
    }
  });

  await t.test('3.3 validateDatabaseConfig throws for remote hosts even in development', () => {
    const origEnv = env.NODE_ENV;
    try {
      env.NODE_ENV = 'development';
      assert.throws(
        () => validateDatabaseConfig({ host: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com', user: 'root', password: '' }),
        /Insecure database configuration: DB_PASSWORD is required/,
        'Should throw on empty password for TiDB cloud host in development'
      );
      assert.throws(
        () => validateDatabaseConfig({ host: '10.0.0.50', user: '', password: 'some_password' }),
        /Insecure database configuration: DB_USER is required/,
        'Should throw on empty user for remote host'
      );
    } finally {
      env.NODE_ENV = origEnv;
    }
  });

  // =========================================================================
  // 4. Issue #05: Strict Cloudinary & Midtrans Configuration Tests
  // =========================================================================
  await t.test('4.1 isCloudinaryConfigured detects missing and placeholder variables', () => {
    const origCloud = env.CLOUDINARY_CLOUD_NAME;
    const origKey = env.CLOUDINARY_API_KEY;
    const origSecret = env.CLOUDINARY_API_SECRET;

    try {
      env.CLOUDINARY_CLOUD_NAME = 'kosmo-bali';
      env.CLOUDINARY_API_KEY = '123456789012345';
      env.CLOUDINARY_API_SECRET = 'sample-secret-api-key-here';
      assert.equal(isCloudinaryConfigured(), false, 'Default sample/placeholder credentials must be unconfigured');

      env.CLOUDINARY_CLOUD_NAME = 'your_cloudinary_cloud_name';
      env.CLOUDINARY_API_KEY = 'valid_key_123';
      env.CLOUDINARY_API_SECRET = 'valid_secret_abc';
      assert.equal(isCloudinaryConfigured(), false, 'your_ placeholder must be unconfigured');

      env.CLOUDINARY_CLOUD_NAME = 'valid_cloud_production';
      env.CLOUDINARY_API_KEY = '987654321098765';
      env.CLOUDINARY_API_SECRET = 'real_super_secret_production_key_xyz';
      assert.equal(isCloudinaryConfigured(), true, 'Valid production keys must be recognized as configured');
    } finally {
      env.CLOUDINARY_CLOUD_NAME = origCloud;
      env.CLOUDINARY_API_KEY = origKey;
      env.CLOUDINARY_API_SECRET = origSecret;
    }
  });

  await t.test('4.2 uploadImageStream and uploadContractStream throw in production when unconfigured', async () => {
    const origEnv = env.NODE_ENV;
    const origCloud = env.CLOUDINARY_CLOUD_NAME;
    const origKey = env.CLOUDINARY_API_KEY;
    const origSecret = env.CLOUDINARY_API_SECRET;

    try {
      env.NODE_ENV = 'production';
      env.CLOUDINARY_CLOUD_NAME = 'kosmo-bali';
      env.CLOUDINARY_API_KEY = '123456789012345';
      env.CLOUDINARY_API_SECRET = 'sample';

      const sampleImg = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      await assert.rejects(
        () => uploadImageStream(sampleImg, 'kosmo_properties'),
        /Cloudinary credentials .* are missing or set to placeholder values in production/,
        'uploadImageStream must throw in production when unconfigured'
      );

      const samplePdf = Buffer.from('%PDF-1.4 test', 'utf8');
      await assert.rejects(
        () => uploadContractStream(samplePdf, 'test_rental', 'kosmo_contracts'),
        /Cloudinary credentials .* are missing or set to placeholder values in production/,
        'uploadContractStream must throw in production when unconfigured'
      );
    } finally {
      env.NODE_ENV = origEnv;
      env.CLOUDINARY_CLOUD_NAME = origCloud;
      env.CLOUDINARY_API_KEY = origKey;
      env.CLOUDINARY_API_SECRET = origSecret;
    }
  });

  await t.test('4.3 uploadImageStream and uploadContractStream return mock URLs in test mode', async () => {
    const sampleImg = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    const imgResult = await uploadImageStream(sampleImg, 'kosmo_properties');
    assert.ok(imgResult.secure_url.startsWith('https://res.cloudinary.com/kosmo-bali/image/upload/'));
    assert.ok(imgResult.public_id.startsWith('kosmo_properties/'));

    const samplePdf = Buffer.from('%PDF-1.4 test', 'utf8');
    const contractResult = await uploadContractStream(samplePdf, 'test_contract', 'kosmo_contracts');
    assert.ok(contractResult.secure_url.startsWith('https://res.cloudinary.com/kosmo-bali/raw/upload/'));
    assert.ok(contractResult.public_id.startsWith('kosmo_contracts/'));
  });

  await t.test('4.4 isMidtransConfigured detects placeholder keys correctly', () => {
    const origServer = env.MIDTRANS_SERVER_KEY;
    const origClient = env.MIDTRANS_CLIENT_KEY;

    try {
      env.MIDTRANS_SERVER_KEY = 'SB-Mid-server-placeholder';
      env.MIDTRANS_CLIENT_KEY = 'SB-Mid-client-placeholder';
      assert.equal(isMidtransConfigured(), false, 'Placeholders must return false');

      env.MIDTRANS_SERVER_KEY = 'your_server_key_here';
      env.MIDTRANS_CLIENT_KEY = 'your_client_key_here';
      assert.equal(isMidtransConfigured(), false, 'your_ placeholder must return false');

      env.MIDTRANS_SERVER_KEY = 'Mid-server-realprod1234567890';
      env.MIDTRANS_CLIENT_KEY = 'Mid-client-realprod1234567890';
      assert.equal(isMidtransConfigured(), true, 'Valid keys must return true');
    } finally {
      env.MIDTRANS_SERVER_KEY = origServer;
      env.MIDTRANS_CLIENT_KEY = origClient;
    }
  });
});
