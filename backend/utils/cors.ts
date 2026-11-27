/**
 * Origin whitelist check shared between Express CORS middleware and canonical URL resolver.
 */
export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;

  const envAllowed = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean)
    : [];

  const defaultAllowed = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000',
    'https://kosmobali.my.id',
    'https://www.kosmobali.my.id',
    'http://kosmobali.my.id',
    'http://www.kosmobali.my.id',
    'https://juragankost.net',
    'https://www.juragankost.net',
    'http://juragankost.net',
    'http://www.juragankost.net'
  ];

  const allowedOrigins = [...defaultAllowed, ...envAllowed];
  const normalizedOrigin = origin.toLowerCase().replace(/\/$/, '');

  const isExactMatch = allowedOrigins.some((allowed: string) => {
    const normalizedAllowed = allowed.toLowerCase().replace(/\/$/, '');
    return normalizedAllowed === normalizedOrigin;
  });

  if (isExactMatch) return true;

  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.toLowerCase();
    const isProjectVercelDomain =
      /^kosmo(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(hostname) ||
      /^juragankost(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(hostname);
    if (
      hostname === 'kosmobali.my.id' ||
      hostname.endsWith('.kosmobali.my.id') ||
      hostname === 'juragankost.net' ||
      hostname.endsWith('.juragankost.net') ||
      isProjectVercelDomain
    ) {
      return true;
    }
  } catch {
    // Invalid URL format
  }

  return false;
}
