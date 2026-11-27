import { z } from 'zod';

/**
 * Zod schema validating runtime backend environment configuration.
 */
export const serverEnvSchema = z.object({
  NODE_ENV: z.string().optional().default('development'),
  PORT: z.string().regex(/^\d+$/, 'PORT must be numeric').optional().default('5000'),
  DB_HOST: z.string().optional().default('localhost'),
  DB_PORT: z.string().regex(/^\d+$/, 'DB_PORT must be numeric').optional(),
  DB_USER: z.string().optional().default('root'),
  DB_NAME: z.string().optional().default('kosmo_db'),
  JWT_SECRET: z.string().optional(),
  MIDTRANS_SERVER_KEY: z.string().optional(),
  MIDTRANS_CLIENT_KEY: z.string().optional(),
  MIDTRANS_IS_PRODUCTION: z.string().optional()
});

export interface EnvValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Validates server environment variables on boot.
 * Throws only when strict production requirements are violated outside test mode.
 */
export function validateServerEnv(
  env: Record<string, string | undefined> = process.env,
  options?: { throwOnError?: boolean }
): EnvValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const parsed = serverEnvSchema.safeParse(env);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join('.')}: ${issue.message}`);
    }
  }

  const isProduction =
    (env.NODE_ENV === 'production' || Boolean(env.VERCEL)) && env.NODE_ENV !== 'test';

  if (isProduction) {
    const jwtSecret = (env.JWT_SECRET || '').trim();
    if (!jwtSecret || jwtSecret.length < 16) {
      errors.push('JWT_SECRET must be set (>= 16 characters) in production.');
    }
    const dbHost = (env.DB_HOST || '').trim();
    if (!dbHost || dbHost === 'localhost' || dbHost === '127.0.0.1') {
      warnings.push('DB_HOST points to localhost in production mode.');
    }
  }

  if (env.MIDTRANS_IS_PRODUCTION === 'true' && (env.MIDTRANS_SERVER_KEY || '').startsWith('SB-Mid-')) {
    warnings.push('MIDTRANS_IS_PRODUCTION=true while using sandbox SB-Mid- server key.');
  }

  if (options?.throwOnError && errors.length > 0) {
    throw new Error(`[Env Validation] ${errors.join(' | ')}`);
  }

  if (warnings.length > 0) {
    for (const w of warnings) {
      console.warn(`[Env Warning] ${w}`);
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors
  };
}
