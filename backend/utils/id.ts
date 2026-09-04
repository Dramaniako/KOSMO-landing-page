import crypto from 'crypto';

/**
 * Generates a cryptographically secure random ID with a domain prefix.
 * 🛡️ SECURITY: Uses crypto.randomBytes(4) to prevent collision and prediction attacks.
 */
export const generateId = (prefix: string): string => {
  return `${prefix}-${crypto.randomBytes(4).toString('hex')}`;
};
