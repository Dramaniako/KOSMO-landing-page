(process.env as Record<string, string | undefined>).NO_LISTEN = 'true';
(process.env as Record<string, string | undefined>).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import type { AddressInfo } from 'net';
import crypto from 'crypto';
const { default: app } = await import('../backend/server');
import { validateDatabaseConfig, initDb, seedDatabase } from '../backend/db';
import {
  isCloudinaryConfigured,
  uploadImageStream,
  uploadContractStream
} from '../backend/services/cloudinary';
import { isMidtransConfigured, verifyMidtransSignature, generateJwtToken } from '../backend/router';

const env = process.env as Record<string, string | undefined>;

function setEnv(key: string, val: string | undefined): void {
  if (val === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = val;
  }
}

test('Adversarial Security Boundary & Penetration Suite (Issues #05, #08)', async (t) => {

  let server: http.Server;
  let baseUrl: string;

  // Initialize DB tables and seed records for endpoint testing
  await initDb();
  await seedDatabase();

  // Spin up ephemeral test server
  await new Promise<void>((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  t.after(() => {
    setEnv('NO_LISTEN', 'true');
    setEnv('NODE_ENV', 'test');
    if (server) {
      server.close();
    }
  });

  const tenantToken = generateJwtToken({
    id: 'user-tenant',
    email: 'tenant@kosmo.com',
    role: 'tenant'
  });

  // =========================================================================
  // SECTION 1: Adversarial Stress Testing on Cloudinary Credentials (Issue #05)
  // =========================================================================
  await t.test('1. Cloudinary Credential Boundary & Exploit Matrix', async (tCloud) => {

    await tCloud.test('1.1 isCloudinaryConfigured returns false for all placeholder / empty permutations', () => {
      const origCloud = env.CLOUDINARY_CLOUD_NAME;
      const origKey = env.CLOUDINARY_API_KEY;
      const origSecret = env.CLOUDINARY_API_SECRET;

      const placeholderCases = [
        { name: '', key: 'valid_key', secret: 'valid_secret' },
        { name: '   ', key: 'valid_key', secret: 'valid_secret' },
        { name: undefined, key: 'valid_key', secret: 'valid_secret' },
        { name: 'valid_name', key: '', secret: 'valid_secret' },
        { name: 'valid_name', key: undefined, secret: 'valid_secret' },
        { name: 'valid_name', key: 'valid_key', secret: '' },
        { name: 'valid_name', key: 'valid_key', secret: undefined },
        { name: 'sample', key: 'valid_key', secret: 'valid_secret' },
        { name: 'SAMPLE_CLOUD', key: 'valid_key', secret: 'valid_secret' },
        { name: 'my_placeholder_cloud', key: 'valid_key', secret: 'valid_secret' },
        { name: 'your_cloud_id', key: 'valid_key', secret: 'valid_secret' },
        { name: 'your-cloud-id', key: 'valid_key', secret: 'valid_secret' },
        { name: 'test-cloud', key: 'valid_key', secret: 'valid_secret' },
        { name: 'valid_name', key: '123456789012345', secret: 'valid_secret' },
        { name: 'kosmo-bali', key: '987654321098765', secret: 'valid_secret' },
        { name: 'valid_name', key: 'valid_key', secret: 'sample_secret_key' },
        { name: 'valid_name', key: 'valid_key', secret: 'placeholder-secret' },
        { name: 'valid_name', key: 'valid_key', secret: 'your_api_secret' },
        { name: 'valid_name', key: 'valid_key', secret: 'your-api-secret' }
      ];

      try {
        for (const c of placeholderCases) {
          setEnv('CLOUDINARY_CLOUD_NAME', c.name);
          setEnv('CLOUDINARY_API_KEY', c.key);
          setEnv('CLOUDINARY_API_SECRET', c.secret);
          assert.equal(
            isCloudinaryConfigured(),
            false,
            `Expected unconfigured for { name: ${c.name}, key: ${c.key}, secret: ${c.secret} }`
          );
        }

        // Test valid production keys
        setEnv('CLOUDINARY_CLOUD_NAME', 'kosmo_prod_cloud_zone');
        setEnv('CLOUDINARY_API_KEY', '849201948271049');
        setEnv('CLOUDINARY_API_SECRET', 'aB3dE5gH7jK9mN1pQ3sU5wY7zA9cE1');
        assert.equal(isCloudinaryConfigured(), true, 'Valid production keys must return true');
      } finally {
        setEnv('CLOUDINARY_CLOUD_NAME', origCloud);
        setEnv('CLOUDINARY_API_KEY', origKey);
        setEnv('CLOUDINARY_API_SECRET', origSecret);
      }
    });

    await tCloud.test('1.2 uploadImageStream and uploadContractStream reject with Error in production / Vercel when unconfigured', async () => {
      const origEnv = env.NODE_ENV;
      const origVercel = env.VERCEL;
      const origCloud = env.CLOUDINARY_CLOUD_NAME;
      const origKey = env.CLOUDINARY_API_KEY;
      const origSecret = env.CLOUDINARY_API_SECRET;

      const dummyImage = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;', 'binary');
      const dummyPdf = Buffer.from('%PDF-1.4 test binary stream', 'utf8');

      try {
        // Test production mode with NODE_ENV=production
        setEnv('NODE_ENV', 'production');
        setEnv('NO_LISTEN', 'true');
        setEnv('VERCEL', undefined);
        setEnv('CLOUDINARY_CLOUD_NAME', 'sample');
        setEnv('CLOUDINARY_API_KEY', '123456789012345');
        setEnv('CLOUDINARY_API_SECRET', 'sample-secret');

        await assert.rejects(
          () => uploadImageStream(dummyImage, 'kosmo_properties'),
          /Cloudinary credentials .* are missing or set to placeholder values in production/,
          'uploadImageStream must throw in NODE_ENV=production when unconfigured'
        );

        await assert.rejects(
          () => uploadContractStream(dummyPdf, 'contract_123', 'kosmo_contracts'),
          /Cloudinary credentials .* are missing or set to placeholder values in production/,
          'uploadContractStream must throw in NODE_ENV=production when unconfigured'
        );

        // Test Vercel serverless mode with VERCEL=1
        setEnv('NODE_ENV', 'development');
        setEnv('NO_LISTEN', 'true');
        setEnv('VERCEL', '1');

        await assert.rejects(
          () => uploadImageStream(dummyImage, 'kosmo_properties'),
          /Cloudinary credentials .* are missing or set to placeholder values in production/,
          'uploadImageStream must throw in VERCEL=1 when unconfigured'
        );

        await assert.rejects(
          () => uploadContractStream(dummyPdf, 'contract_123', 'kosmo_contracts'),
          /Cloudinary credentials .* are missing or set to placeholder values in production/,
          'uploadContractStream must throw in VERCEL=1 when unconfigured'
        );
      } finally {
        setEnv('NODE_ENV', origEnv);
        setEnv('NO_LISTEN', 'true');
        setEnv('VERCEL', origVercel);
        setEnv('CLOUDINARY_CLOUD_NAME', origCloud);
        setEnv('CLOUDINARY_API_KEY', origKey);
        setEnv('CLOUDINARY_API_SECRET', origSecret);
      }
    });

    await tCloud.test('1.3 uploadImageStream and uploadContractStream reject on empty or corrupted buffers', async () => {
      await assert.rejects(
        () => uploadImageStream(Buffer.alloc(0)),
        /Image buffer cannot be empty/,
        'uploadImageStream must reject empty buffer'
      );
      await assert.rejects(
        () => uploadImageStream(null as unknown as Buffer),
        /Image buffer cannot be empty/,
        'uploadImageStream must reject null buffer'
      );
      await assert.rejects(
        () => uploadContractStream(Buffer.alloc(0), 'test_contract'),
        /Contract buffer cannot be empty/,
        'uploadContractStream must reject empty contract buffer'
      );
      await assert.rejects(
        () => uploadContractStream(null as unknown as Buffer, 'test_contract'),
        /Contract buffer cannot be empty/,
        'uploadContractStream must reject null contract buffer'
      );
    });

    await tCloud.test('1.4 uploadImageStream and uploadContractStream provide deterministic mocks in test mode', async () => {
      const dummyImage = Buffer.from('test-image-content');
      const dummyPdf = Buffer.from('%PDF-1.4 test-pdf-content');

      const imgRes = await uploadImageStream(dummyImage, 'kosmo_properties');
      assert.ok(imgRes.secure_url.startsWith('https://res.cloudinary.com/kosmo-bali/image/upload/v1/kosmo_properties/prop_'));
      assert.ok(imgRes.public_id.startsWith('kosmo_properties/prop_'));

      const pdfRes = await uploadContractStream(dummyPdf, 'my_test_contract_abc', 'kosmo_contracts');
      assert.equal(pdfRes.secure_url, 'https://res.cloudinary.com/kosmo-bali/raw/upload/v1/kosmo_contracts/my_test_contract_abc.pdf');
      assert.equal(pdfRes.public_id, 'kosmo_contracts/my_test_contract_abc');
    });
  });

  // =========================================================================
  // SECTION 2: Adversarial Stress Testing on Midtrans Gateway (Issue #05)
  // =========================================================================
  await t.test('2. Midtrans Gateway Security Boundary & Webhook Verification', async (tMid) => {

    await tMid.test('2.1 isMidtransConfigured detects placeholder / dummy / template keys', () => {
      const origServer = env.MIDTRANS_SERVER_KEY;
      const origClient = env.MIDTRANS_CLIENT_KEY;

      const midtransCases = [
        { server: '', client: 'valid_client' },
        { server: '   ', client: 'valid_client' },
        { server: undefined, client: 'valid_client' },
        { server: 'valid_server', client: '' },
        { server: 'valid_server', client: '   ' },
        { server: 'valid_server', client: undefined },
        { server: 'SB-Mid-server-placeholder', client: 'valid_client' },
        { server: 'valid_server', client: 'SB-Mid-client-placeholder' },
        { server: 'dummy_server', client: 'valid_client' },
        { server: 'valid_server', client: 'sample_client' },
        { server: 'your-server-key', client: 'valid_client' },
        { server: 'YOUR_SERVER_KEY_HERE', client: 'valid_client' },
        { server: 'valid_server', client: 'your-client-key' },
        { server: 'valid_server', client: 'your_client_key' },
        { server: 'placeholder_server', client: 'valid_client' }
      ];

      try {
        for (const c of midtransCases) {
          setEnv('MIDTRANS_SERVER_KEY', c.server);
          setEnv('MIDTRANS_CLIENT_KEY', c.client);
          assert.equal(
            isMidtransConfigured(),
            false,
            `Expected isMidtransConfigured() to be false for { server: ${c.server}, client: ${c.client} }`
          );
        }

        // Test valid keys
        setEnv('MIDTRANS_SERVER_KEY', 'Mid-server-LIVE-8201948201482');
        setEnv('MIDTRANS_CLIENT_KEY', 'Mid-client-LIVE-8201948201482');
        assert.equal(isMidtransConfigured(), true, 'Valid Midtrans keys must return true');
      } finally {
        setEnv('MIDTRANS_SERVER_KEY', origServer);
        setEnv('MIDTRANS_CLIENT_KEY', origClient);
      }
    });

    await tMid.test('2.2 POST /api/payment/token returns HTTP 500 when unconfigured in production / Vercel', async () => {
      const origEnv = env.NODE_ENV;
      const origVercel = env.VERCEL;
      const origServer = env.MIDTRANS_SERVER_KEY;
      const origClient = env.MIDTRANS_CLIENT_KEY;

      try {
        setEnv('NODE_ENV', 'production');
        setEnv('NO_LISTEN', 'true');
        setEnv('VERCEL', undefined);
        setEnv('MIDTRANS_SERVER_KEY', 'SB-Mid-server-placeholder');
        setEnv('MIDTRANS_CLIENT_KEY', 'SB-Mid-client-placeholder');

        const res = await fetch(`${baseUrl}/api/payment/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tenantToken}`
          },
          body: JSON.stringify({
            propertyId: 'prop-01',
            tenantId: 'user-tenant',
            durationMonths: 1,
            rentalId: 'rent-prod-boundary-fail-1'
          })
        });

        const body = await res.json() as { message?: string };
        assert.equal(res.status, 500, 'Must return HTTP 500 when unconfigured in production');
        assert.match(body.message || '', /Konfigurasi payment gateway Midtrans .* belum diatur di server produksi/);

        // Test with VERCEL=1
        setEnv('NODE_ENV', 'production');
        setEnv('NO_LISTEN', 'true');
        setEnv('VERCEL', '1');

        const resVercel = await fetch(`${baseUrl}/api/payment/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tenantToken}`
          },
          body: JSON.stringify({
            propertyId: 'prop-01',
            tenantId: 'user-tenant',
            durationMonths: 1,
            rentalId: 'rent-prod-boundary-fail-2'
          })
        });

        assert.equal(resVercel.status, 500, 'Must return HTTP 500 on Vercel production');
      } finally {
        setEnv('NODE_ENV', origEnv);
        setEnv('NO_LISTEN', 'true');
        setEnv('VERCEL', origVercel);
        setEnv('MIDTRANS_SERVER_KEY', origServer);
        setEnv('MIDTRANS_CLIENT_KEY', origClient);
      }
    });

    await tMid.test('2.3 POST /api/payment/webhook returns HTTP 500 when unconfigured in production / Vercel', async () => {
      const origEnv = env.NODE_ENV;
      const origVercel = env.VERCEL;
      const origServer = env.MIDTRANS_SERVER_KEY;
      const origClient = env.MIDTRANS_CLIENT_KEY;

      try {
        setEnv('NODE_ENV', 'production');
        setEnv('NO_LISTEN', 'true');
        setEnv('VERCEL', undefined);
        setEnv('MIDTRANS_SERVER_KEY', 'SB-Mid-server-placeholder');
        setEnv('MIDTRANS_CLIENT_KEY', 'SB-Mid-client-placeholder');

        const res = await fetch(`${baseUrl}/api/payment/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            order_id: 'order-prod-test',
            status_code: '200',
            gross_amount: '2500000.00',
            signature_key: 'fakesig',
            transaction_status: 'settlement',
            fraud_status: 'accept'
          })
        });

        const body = await res.json() as { message?: string };
        assert.equal(res.status, 500, 'Must return HTTP 500 on unconfigured webhook in production');
        assert.match(body.message || '', /Midtrans server key belum dikonfigurasi pada server produksi/);
      } finally {
        setEnv('NODE_ENV', origEnv);
        setEnv('NO_LISTEN', 'true');
        setEnv('VERCEL', origVercel);
        setEnv('MIDTRANS_SERVER_KEY', origServer);
        setEnv('MIDTRANS_CLIENT_KEY', origClient);
      }
    });

    await tMid.test('2.4 POST /api/payment/token returns mock token in test mode when unconfigured', async () => {
      const origEnv = env.NODE_ENV;
      const origServer = env.MIDTRANS_SERVER_KEY;
      const origClient = env.MIDTRANS_CLIENT_KEY;

      try {
        setEnv('NODE_ENV', 'test');
        setEnv('NO_LISTEN', 'true');
        setEnv('MIDTRANS_SERVER_KEY', 'SB-Mid-server-placeholder');
        setEnv('MIDTRANS_CLIENT_KEY', 'SB-Mid-client-placeholder');

        const testRentalId = 'rent-unit-mock-999';

        const res = await fetch(`${baseUrl}/api/payment/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tenantToken}`
          },
          body: JSON.stringify({
            propertyId: 'prop-01',
            tenantId: 'user-tenant',
            durationMonths: 1,
            rentalId: testRentalId
          })
        });

        assert.equal(res.status, 200, 'Must return HTTP 200 in test mode');
        const body = await res.json() as { token?: string; redirect_url?: string; rentalId?: string };
        assert.equal(body.token, `snap-token-${testRentalId}`);
        assert.ok(body.redirect_url?.includes(testRentalId));
        assert.equal(body.rentalId, testRentalId);
      } finally {
        setEnv('NODE_ENV', origEnv);
        setEnv('NO_LISTEN', 'true');
        setEnv('MIDTRANS_SERVER_KEY', origServer);
        setEnv('MIDTRANS_CLIENT_KEY', origClient);
      }
    });

    await tMid.test('2.5 verifyMidtransSignature strictly validates SHA-512 cryptographic signature', () => {
      const orderId = 'RENTAL-ORDER-12345';
      const statusCode = '200';
      const grossAmount = '3500000.00';
      const serverKey = 'Mid-server-SECRET-KEY-ABC';

      const payload = `${orderId}${statusCode}${grossAmount}${serverKey}`;
      const validSig = crypto.createHash('sha512').update(payload).digest('hex').toLowerCase();

      assert.equal(
        verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, validSig),
        true,
        'Valid signature must verify successfully'
      );

      assert.equal(
        verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, validSig.toUpperCase()),
        true,
        'Case-insensitive signature comparison must match'
      );

      assert.equal(
        verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, 'invalid_signature_hash'),
        false,
        'Forged signature must be rejected'
      );

      assert.equal(
        verifyMidtransSignature('', statusCode, grossAmount, serverKey, validSig),
        false,
        'Empty orderId must return false'
      );
      assert.equal(
        verifyMidtransSignature(orderId, '', grossAmount, serverKey, validSig),
        false,
        'Empty statusCode must return false'
      );
      assert.equal(
        verifyMidtransSignature(orderId, statusCode, '', serverKey, validSig),
        false,
        'Empty grossAmount must return false'
      );
      assert.equal(
        verifyMidtransSignature(orderId, statusCode, grossAmount, '', validSig),
        false,
        'Empty serverKey must return false'
      );
    });
  });

  // =========================================================================
  // SECTION 3: Adversarial Stress Testing on Database Credentials (Issue #08)
  // =========================================================================
  await t.test('3. Database Security Boundary & Remote Endpoint Protection (Issue #08)', async (tDb) => {

    await tDb.test('3.1 Localhost development permits empty password without error', () => {
      const origEnv = env.NODE_ENV;
      const origVercel = env.VERCEL;

      try {
        setEnv('NODE_ENV', 'development');
        setEnv('NO_LISTEN', 'true');
        setEnv('VERCEL', undefined);

        const allowedLocalConfigs = [
          { host: 'localhost', user: 'root', password: '' },
          { host: '127.0.0.1', user: 'root', password: '' },
          { host: '192.168.1.1', user: 'kosmo_dev', password: '' },
          { host: '192.168.0.254', user: 'root', password: '' },
          { host: 'LOCALHOST', user: 'root', password: '' },
          { host: undefined, user: 'root', password: '' }
        ];

        for (const config of allowedLocalConfigs) {
          assert.doesNotThrow(
            () => validateDatabaseConfig(config),
            `Localhost dev config should be allowed: ${JSON.stringify(config)}`
          );
        }
      } finally {
        setEnv('NODE_ENV', origEnv);
        setEnv('NO_LISTEN', 'true');
        setEnv('VERCEL', origVercel);
      }
    });

    await tDb.test('3.2 Production mode strictly blocks empty/placeholder password or username', () => {
      const origEnv = env.NODE_ENV;
      const origVercel = env.VERCEL;

      const productionRejections = [
        { host: 'localhost', user: 'root', password: '', expectedErr: /DB_PASSWORD is required/ },
        { host: 'localhost', user: 'root', password: '   ', expectedErr: /DB_PASSWORD is required/ },
        { host: 'localhost', user: 'root', password: 'your_database_password', expectedErr: /DB_PASSWORD is required/ },
        { host: 'localhost', user: 'root', password: 'my_your_password_here', expectedErr: /DB_PASSWORD is required/ },
        { host: 'localhost', user: 'root', password: 'placeholder', expectedErr: /DB_PASSWORD is required/ },
        { host: 'localhost', user: '', password: 'valid_prod_password', expectedErr: /DB_USER is required/ },
        { host: 'localhost', user: '   ', password: 'valid_prod_password', expectedErr: /DB_USER is required/ },
        { host: 'localhost', user: 'your_db_user', password: 'valid_prod_password', expectedErr: /DB_USER is required/ },
        { host: 'localhost', user: 'placeholder', password: 'valid_prod_password', expectedErr: /DB_USER is required/ }
      ];

      try {
        setEnv('NODE_ENV', 'production');
        setEnv('NO_LISTEN', 'true');
        setEnv('VERCEL', undefined);

        for (const c of productionRejections) {
          assert.throws(
            () => validateDatabaseConfig({ host: c.host, user: c.user, password: c.password }),
            c.expectedErr,
            `Expected throw in NODE_ENV=production for config: ${JSON.stringify(c)}`
          );
        }

        // Test with VERCEL=1
        setEnv('NODE_ENV', 'development');
        setEnv('NO_LISTEN', 'true');
        setEnv('VERCEL', '1');

        for (const c of productionRejections) {
          assert.throws(
            () => validateDatabaseConfig({ host: c.host, user: c.user, password: c.password }),
            c.expectedErr,
            `Expected throw in VERCEL=1 for config: ${JSON.stringify(c)}`
          );
        }

        // Verify that valid credentials in production succeed
        assert.doesNotThrow(() => {
          validateDatabaseConfig({ host: 'localhost', user: 'kosmo_prod_user', password: 'StrongProductionPassword#2026' });
        });
      } finally {
        setEnv('NODE_ENV', origEnv);
        setEnv('NO_LISTEN', 'true');
        setEnv('VERCEL', origVercel);
      }
    });

    await tDb.test('3.3 Remote host targets (TiDB Cloud, AWS RDS, public IPs) strictly throw even in development mode', () => {
      const origEnv = env.NODE_ENV;
      const origVercel = env.VERCEL;

      const remoteConfigs = [
        { host: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com', user: '2ABC.root', password: '', expectedErr: /DB_PASSWORD is required/ },
        { host: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com', user: 'your_db_user', password: 'secure_password', expectedErr: /DB_USER is required/ },
        { host: 'db.kosmo-bali.com', user: 'root', password: '', expectedErr: /DB_PASSWORD is required/ },
        { host: '10.0.0.15', user: 'root', password: '', expectedErr: /DB_PASSWORD is required/ },
        { host: '172.16.0.5', user: 'root', password: 'placeholder', expectedErr: /DB_PASSWORD is required/ },
        { host: '34.101.50.20', user: '', password: 'valid_password', expectedErr: /DB_USER is required/ }
      ];

      try {
        setEnv('NODE_ENV', 'development');
        setEnv('NO_LISTEN', 'true');
        setEnv('VERCEL', undefined);

        for (const c of remoteConfigs) {
          assert.throws(
            () => validateDatabaseConfig({ host: c.host, user: c.user, password: c.password }),
            c.expectedErr,
            `Remote host must require credentials even in dev: ${JSON.stringify(c)}`
          );
        }

        // Verify that valid remote credentials succeed
        assert.doesNotThrow(() => {
          validateDatabaseConfig({
            host: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
            user: '3xK92LpQ.root',
            password: 'SuperSecretTiDBPassword#2026'
          });
        });
      } finally {
        setEnv('NODE_ENV', origEnv);
        setEnv('NO_LISTEN', 'true');
        setEnv('VERCEL', origVercel);
      }
    });
  });

});
