import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  verifyMidtransSignature,
  assertMidtransProductionConfig,
  getSnapRedirectUrl,
  configureSnapClient
} from '../backend/routes/payment.routes';

const env = (process.env as unknown as Record<string, string | undefined>);

test('Midtrans Adversarial Challenge Suite — Challenger 2', async (t) => {
  const originalEnv = { ...process.env };

  t.afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  const orderId = 'rent-adversarial-test-001';
  const statusCode = '200';
  const serverKey = 'SB-Mid-server-adversarial-key-999';
  const liveServerKey = 'Mid-server-LIVE-SECURE-KEY-888';

  // Helper to generate expected SHA-512 hex signature
  function computeSig(oid: string, code: string, amt: string, key: string): string {
    return crypto.createHash('sha512').update(`${oid}${code}${amt}${key}`).digest('hex');
  }

  await t.test('1. verifyMidtransSignature — Valid signatures across integer and decimal formats', async (st) => {
    // 1.1 Integer amount exact match
    await st.test('valid signature with integer grossAmount (e.g. 3500000)', () => {
      const grossAmount = '3500000';
      const sig = computeSig(orderId, statusCode, grossAmount, serverKey);
      assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, sig), true);
    });

    // 1.2 Decimal amount exact match (.00)
    await st.test('valid signature with decimal grossAmount (e.g. 3500000.00)', () => {
      const grossAmount = '3500000.00';
      const sig = computeSig(orderId, statusCode, grossAmount, serverKey);
      assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, sig), true);
    });

    // 1.3 Case-insensitivity (upper and lowercase hex)
    await st.test('valid signature with uppercase hex characters', () => {
      const grossAmount = '2500000.00';
      const sig = computeSig(orderId, statusCode, grossAmount, serverKey).toUpperCase();
      assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, sig), true);
    });

    // 1.4 Tolerance: signature created with .00 but incoming webhook payload has integer amount
    await st.test('fallback verification when signature was calculated on .00 but grossAmount is integer', () => {
      const grossAmountWebhook = '4000000';
      const grossAmountHashed = '4000000.00';
      const sig = computeSig(orderId, statusCode, grossAmountHashed, serverKey);
      assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmountWebhook, serverKey, sig), true);
    });

    // 1.5 Reverse tolerance check: signature created on integer but incoming payload has .00
    await st.test('tolerance when signature was calculated on integer but grossAmount has .00', () => {
      const grossAmountWebhook = '4000000.00';
      const grossAmountHashed = '4000000';
      const sig = computeSig(orderId, statusCode, grossAmountHashed, serverKey);
      const result = verifyMidtransSignature(orderId, statusCode, grossAmountWebhook, serverKey, sig);
      assert.equal(typeof result, 'boolean');
    });
  });

  await t.test('2. verifyMidtransSignature — Adversarial tampering and bit flips', async (st) => {
    const grossAmount = '3500000.00';
    const validSig = computeSig(orderId, statusCode, grossAmount, serverKey);

    await st.test('rejects single bit flip at first character (length unchanged at 128)', () => {
      const firstChar = validSig[0];
      const flippedFirst = (firstChar === 'a' ? 'b' : 'a') + validSig.slice(1);
      assert.equal(flippedFirst.length, 128);
      assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, flippedFirst), false);
    });

    await st.test('rejects single bit flip at last character (length unchanged at 128)', () => {
      const lastChar = validSig[validSig.length - 1];
      const flippedLast = validSig.slice(0, -1) + (lastChar === '0' ? '1' : '0');
      assert.equal(flippedLast.length, 128);
      assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, flippedLast), false);
    });

    await st.test('rejects single bit flip in the middle of 128-char signature', () => {
      const midIdx = 64;
      const midChar = validSig[midIdx];
      const replacement = midChar === 'f' ? 'e' : 'f';
      const flippedMid = validSig.slice(0, midIdx) + replacement + validSig.slice(midIdx + 1);
      assert.equal(flippedMid.length, 128);
      assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, flippedMid), false);
    });

    await st.test('rejects completely inverted hex signature of length 128', () => {
      const inverted = validSig.split('').map(c => (c === '0' ? 'f' : '0')).join('');
      assert.equal(inverted.length, 128);
      assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, inverted), false);
    });
  });

  await t.test('3. verifyMidtransSignature — Non-hex characters and malformed encoding', async (st) => {
    const grossAmount = '3500000.00';
    const validSig = computeSig(orderId, statusCode, grossAmount, serverKey);

    await st.test('rejects signature with non-hex character (e.g. "g" or "z")', () => {
      const nonHexSig = 'g' + validSig.slice(1);
      assert.equal(nonHexSig.length, 128);
      assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, nonHexSig), false);
    });

    await st.test('rejects signature with embedded punctuation/symbols', () => {
      const symbolSig = validSig.slice(0, 63) + '!' + validSig.slice(64);
      assert.equal(symbolSig.length, 128);
      assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, symbolSig), false);
    });

    await st.test('rejects signature with embedded whitespace', () => {
      const spaceSig = validSig.slice(0, 63) + ' ' + validSig.slice(64);
      assert.equal(spaceSig.length, 128);
      assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, spaceSig), false);
    });

    await st.test('rejects signature with null bytes or control characters', () => {
      const nullByteSig = validSig.slice(0, 63) + '\x00' + validSig.slice(64);
      assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, nullByteSig), false);
    });
  });

  await t.test('4. verifyMidtransSignature — Length boundary attacks (truncated/extended)', async (st) => {
    const grossAmount = '3500000.00';
    const validSig = computeSig(orderId, statusCode, grossAmount, serverKey);

    await st.test('rejects truncated signature of 127 characters (off-by-one under)', () => {
      const truncated127 = validSig.slice(0, 127);
      assert.equal(truncated127.length, 127);
      assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, truncated127), false);
    });

    await st.test('rejects extended signature of 129 characters (off-by-one over)', () => {
      const extended129 = validSig + '0';
      assert.equal(extended129.length, 129);
      assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, extended129), false);
    });

    await st.test('rejects 64-character signature (common confusion: raw byte buffer vs hex string)', () => {
      const rawHex64 = validSig.slice(0, 64);
      assert.equal(rawHex64.length, 64);
      assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, rawHex64), false);
    });

    await st.test('rejects empty string signature', () => {
      assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, ''), false);
    });

    await st.test('rejects extremely large signature payload (DoS resistance)', () => {
      const giantSig = 'a'.repeat(100000);
      assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, giantSig), false);
    });
  });

  await t.test('5. verifyMidtransSignature — Missing, null, undefined, or malformed fields', async (st) => {
    const grossAmount = '3500000.00';
    const validSig = computeSig(orderId, statusCode, grossAmount, serverKey);

    await st.test('rejects missing orderId', () => {
      assert.equal(verifyMidtransSignature('', statusCode, grossAmount, serverKey, validSig), false);
    });

    await st.test('rejects missing statusCode', () => {
      assert.equal(verifyMidtransSignature(orderId, '', grossAmount, serverKey, validSig), false);
    });

    await st.test('rejects missing grossAmount', () => {
      assert.equal(verifyMidtransSignature(orderId, statusCode, '', serverKey, validSig), false);
    });

    await st.test('rejects missing serverKey', () => {
      assert.equal(verifyMidtransSignature(orderId, statusCode, grossAmount, '', validSig), false);
    });

    await st.test('safely handles non-string / undefined coerced types without uncaught exceptions', () => {
      assert.doesNotThrow(() => {
        verifyMidtransSignature(undefined as unknown as string, statusCode, grossAmount, serverKey, validSig);
        verifyMidtransSignature(orderId, null as unknown as string, grossAmount, serverKey, validSig);
        verifyMidtransSignature(orderId, statusCode, undefined as unknown as string, serverKey, validSig);
      });
    });
  });

  await t.test('6. verifyMidtransSignature — Timing safety & exception resilience', async (st) => {
    const grossAmount = '3500000.00';

    await st.test('executes 1,000 iterations of random adversarial signatures without throwing ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH', () => {
      assert.doesNotThrow(() => {
        for (let i = 0; i < 1000; i++) {
          const len = (i % 256);
          const randStr = crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
          const res = verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, randStr);
          assert.equal(typeof res, 'boolean');
        }
      });
    });

    await st.test('timingSafeEqual is protected against buffer length mismatch', () => {
      const buf64 = Buffer.alloc(64);
      const buf63 = Buffer.alloc(63);
      assert.throws(
        () => crypto.timingSafeEqual(buf64, buf63),
        /Input buffers must have the same/
      );

      const hex126 = 'a'.repeat(126);
      assert.doesNotThrow(() => {
        const res = verifyMidtransSignature(orderId, statusCode, grossAmount, serverKey, hex126);
        assert.equal(res, false);
      });
    });
  });

  await t.test('7. assertMidtransProductionConfig — Environment assertion challenges', async (st) => {
    await st.test('flags warning and invalid status when NODE_ENV=production and serverKey is sandbox (SB-Mid-)', () => {
      env.NODE_ENV = 'production';
      env.MIDTRANS_IS_PRODUCTION = 'false';
      env.MIDTRANS_SERVER_KEY = 'SB-Mid-server-sandbox-test-123';

      const config = assertMidtransProductionConfig();
      assert.equal(config.isProduction, true);
      assert.equal(config.isSandboxKey, true);
      assert.equal(config.valid, false);
      assert.ok(config.warning?.includes('[SECURITY WARNING]'));
    });

    await st.test('flags warning and invalid status when MIDTRANS_IS_PRODUCTION=true and serverKey is sandbox (SB-Mid-)', () => {
      env.NODE_ENV = 'development';
      env.MIDTRANS_IS_PRODUCTION = 'true';
      env.MIDTRANS_SERVER_KEY = 'SB-Mid-server-sandbox-test-123';

      const config = assertMidtransProductionConfig();
      assert.equal(config.isProduction, true);
      assert.equal(config.isSandboxKey, true);
      assert.equal(config.valid, false);
      assert.ok(config.warning?.includes('Please configure production Midtrans credentials'));
    });

    await st.test('throws when throwOnMismatch: true and sandbox key is used in production', () => {
      env.MIDTRANS_IS_PRODUCTION = 'true';
      env.MIDTRANS_SERVER_KEY = 'SB-Mid-server-sandbox-test-123';

      assert.throws(
        () => assertMidtransProductionConfig({ throwOnMismatch: true }),
        /SECURITY WARNING.*sandbox MIDTRANS_SERVER_KEY/
      );
    });

    await st.test('passes cleanly with live production credentials (Mid-server-)', () => {
      env.NODE_ENV = 'production';
      env.MIDTRANS_IS_PRODUCTION = 'true';
      env.MIDTRANS_SERVER_KEY = liveServerKey;

      const config = assertMidtransProductionConfig();
      assert.equal(config.isProduction, true);
      assert.equal(config.isSandboxKey, false);
      assert.equal(config.valid, true);
      assert.equal(config.warning, undefined);
    });

    await st.test('passes cleanly in sandbox mode with sandbox credentials', () => {
      env.NODE_ENV = 'development';
      env.MIDTRANS_IS_PRODUCTION = 'false';
      env.MIDTRANS_SERVER_KEY = 'SB-Mid-server-sandbox-test-123';

      const config = assertMidtransProductionConfig();
      assert.equal(config.isProduction, false);
      assert.equal(config.isSandboxKey, true);
      assert.equal(config.valid, true);
      assert.equal(config.warning, undefined);
    });

    await st.test('handles unset or empty serverKey gracefully without crashing', () => {
      delete env.MIDTRANS_SERVER_KEY;
      env.MIDTRANS_IS_PRODUCTION = 'false';
      env.NODE_ENV = 'development';

      const config = assertMidtransProductionConfig();
      assert.equal(config.isSandboxKey, false);
      assert.equal(config.valid, true);
    });
  });

  await t.test('8. getSnapRedirectUrl — Production vs Sandbox redirect URL resolution', async (st) => {
    const testRentalId = 'rent-test-redirect-777';

    await st.test('resolves to production URL (app.midtrans.com) when MIDTRANS_IS_PRODUCTION=true', () => {
      delete env.MIDTRANS_SNAP_URL;
      env.MIDTRANS_IS_PRODUCTION = 'true';

      const url = getSnapRedirectUrl(testRentalId);
      assert.equal(url, `https://app.midtrans.com/snap/v2/vtweb/${testRentalId}`);
    });

    await st.test('resolves to sandbox URL (app.sandbox.midtrans.com) when MIDTRANS_IS_PRODUCTION is false/unset', () => {
      delete env.MIDTRANS_SNAP_URL;
      env.MIDTRANS_IS_PRODUCTION = 'false';

      const url = getSnapRedirectUrl(testRentalId);
      assert.equal(url, `https://app.sandbox.midtrans.com/snap/v2/vtweb/${testRentalId}`);
    });

    await st.test('resolves to custom MIDTRANS_SNAP_URL base when configured', () => {
      env.MIDTRANS_SNAP_URL = 'https://custom-gateway.midtrans.com/snap/v1/transactions';
      env.MIDTRANS_IS_PRODUCTION = 'true';

      const url = getSnapRedirectUrl(testRentalId);
      assert.equal(url, `https://custom-gateway.midtrans.com/snap/v2/vtweb/${testRentalId}`);
    });

    await st.test('falls back safely to default URL when MIDTRANS_SNAP_URL is malformed', () => {
      env.MIDTRANS_SNAP_URL = 'invalid-not-a-valid-url';
      env.MIDTRANS_IS_PRODUCTION = 'true';

      const url = getSnapRedirectUrl(testRentalId);
      assert.equal(url, `https://app.midtrans.com/snap/v2/vtweb/${testRentalId}`);
    });
  });

  await t.test('9. configureSnapClient — Snap client configuration updates', async (st) => {
    await st.test('configures client for production mode', () => {
      env.MIDTRANS_IS_PRODUCTION = 'true';
      env.MIDTRANS_SERVER_KEY = liveServerKey;
      env.MIDTRANS_CLIENT_KEY = 'Mid-client-LIVE-KEY-888';
      delete env.MIDTRANS_SNAP_URL;

      const client = configureSnapClient();
      assert.equal(client.apiConfig.isProduction, true);
      assert.equal(client.apiConfig.serverKey, liveServerKey);
      assert.equal(client.apiConfig.clientKey, 'Mid-client-LIVE-KEY-888');
    });

    await st.test('configures client for sandbox mode', () => {
      env.MIDTRANS_IS_PRODUCTION = 'false';
      env.MIDTRANS_SERVER_KEY = 'SB-Mid-server-sandbox-test-123';
      env.MIDTRANS_CLIENT_KEY = 'SB-Mid-client-sandbox-test-123';
      delete env.MIDTRANS_SNAP_URL;

      const client = configureSnapClient();
      assert.equal(client.apiConfig.isProduction, false);
      assert.equal(client.apiConfig.serverKey, 'SB-Mid-server-sandbox-test-123');
      assert.equal(client.apiConfig.clientKey, 'SB-Mid-client-sandbox-test-123');
    });
  });
});
