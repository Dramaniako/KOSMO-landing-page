import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

/**
 * Evaluates whether rate limiting should be safely bypassed.
 * 1. Bypasses during test runner execution (NODE_ENV === 'test' or NO_LISTEN === 'true').
 * 2. In production (NODE_ENV === 'production'), external headers must NEVER bypass rate limits.
 * 3. In non-production environments (development, staging), test bypass headers are accepted.
 */
export function shouldSkipRateLimit(req: Request): boolean {
  // 1. Internal test runners bypass rate limits
  if (process.env.NODE_ENV === 'test' || process.env.NO_LISTEN === 'true') {
    return true;
  }

  // 2. Production gate: external headers must NEVER bypass rate limits in production
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  // 3. Non-production environments only: inspect bypass headers
  const rawHeader = req.headers['x-test-bypass'] ?? req.headers['x-bypass-rate-limit'];
  const bypassHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

  if (bypassHeader) {
    if (bypassHeader === 'true') {
      return true;
    }
    const bypassSecret = process.env.RATE_LIMIT_BYPASS_SECRET;
    if (bypassSecret && bypassHeader === bypassSecret) {
      return true;
    }
  }

  return false;
}

/**
 * 1. Authentication Limiter
 * Protects login, registration, and password verification against credential stuffing & brute-force.
 * Production: 10 requests per 15 minutes per IP
 * Test Environment: Generous headroom (10,000) + shouldSkipRateLimit bypass
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 10000 : 10,
  skip: shouldSkipRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'fail',
    statusCode: 429,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Terlalu banyak percobaan masuk/daftar. Silakan coba lagi dalam 15 menit.'
  }
});

/**
 * 2. Visitor Tracking Limiter
 * Mitigates unauthenticated Layer-7 telemetry flooding on /api/tracking and /api/tracking/visit.
 * Production: 30 requests per minute per IP
 * Test Environment: Skipped via shouldSkipRateLimit
 */
export const trackingLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'test' ? 10000 : 30,
  skip: shouldSkipRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'fail',
    statusCode: 429,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Terlalu banyak permintaan pelacakan.'
  }
});

/**
 * 3. File & Media Upload Limiter
 * Protects memory buffers and Cloudinary bandwidth against upload flooding.
 * Production: 30 requests per 15 minutes per IP
 * Test Environment: Skipped via shouldSkipRateLimit
 */
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 10000 : 30,
  skip: shouldSkipRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'fail',
    statusCode: 429,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Terlalu banyak unggahan berkas. Silakan coba lagi nanti.'
  }
});

/**
 * 4. Mutation & Payment Limiter
 * Protects sensitive financial and rental state mutation endpoints:
 * (/api/payment/token, /api/rentals/contract/sign, /api/rentals, /api/rentals/:id/renew-token)
 * Production: 30 requests per 15 minutes per IP
 * Test Environment: Skipped via shouldSkipRateLimit
 */
export const mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'test' ? 10000 : 30,
  skip: shouldSkipRateLimit,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'fail',
    statusCode: 429,
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Terlalu banyak permintaan transaksi atau perubahan data. Silakan coba lagi nanti.'
  }
});
