import express from 'express';
import type { Request, Response, NextFunction, Application } from 'express';
import compression from 'compression';
import cors from 'cors';
type CorsOptions = NonNullable<Parameters<typeof cors>[0]>;
import helmet from 'helmet';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import { initDb, ensureDbReady } from './db';
import router from './router';
import { requestIdMiddleware } from './middleware/requestId';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { setupProcessSafety } from './utils/processSafety';
import { assertMidtransProductionConfig } from './routes/payment.routes';
import { validateServerEnv } from './config/env';
import { isOriginAllowed } from './utils/cors';
import { handleRobotsTxt, handleSitemapXml } from './routes/seo.routes';

export { isOriginAllowed };

// Initialize defensive process-level safety net
setupProcessSafety();

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists (graceful for serverless read-only environments)
const uploadsDir = process.env.VERCEL
  ? path.join(os.tmpdir(), 'kosmo_uploads')
  : path.join(__dirname, 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
} catch {
  // Read-only filesystem in Vercel serverless functions
}

const app: Application = express();
app.set('trust proxy', 1);
const PORT: number = parseInt(process.env.PORT || '5000', 10);

// Performance & Compression Middleware (Mounted first)
app.use(compression());

// Security: Whitelist-based CORS Origin Validation (implemented in ./utils/cors.ts)
export const corsOptions: CorsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS Blocked] Origin '${origin}' is not allowed.`);
      callback(null, false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-Request-Id'],
  exposedHeaders: ['Content-Disposition', 'X-Request-Id', 'X-Contract-Hash', 'X-Total-Count'],
  credentials: true,
  maxAge: 86400
};

// Security & Parsing Middleware
app.use(requestIdMiddleware);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://app.midtrans.com',
          'https://app.sandbox.midtrans.com',
          'https://api.midtrans.com'
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com'
        ],
        fontSrc: [
          "'self'",
          'https://fonts.gstatic.com',
          'data:'
        ],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://res.cloudinary.com',
          'https://*.tile.openstreetmap.org',
          'https://unpkg.com'
        ],
        connectSrc: [
          "'self'",
          'https://res.cloudinary.com',
          'https://api.midtrans.com',
          'https://app.midtrans.com',
          'https://app.sandbox.midtrans.com',
          'https://*.tile.openstreetmap.org'
        ],
        frameSrc: [
          "'self'",
          'https://app.midtrans.com',
          'https://app.sandbox.midtrans.com'
        ],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    noSniff: true,
    frameguard: { action: 'sameorigin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  })
);
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
if (process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const startNs = process.hrtime.bigint();
    res.on('finish', () => {
      const latencyMs = Number(process.hrtime.bigint() - startNs) / 1e6;
      console.log(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: res.statusCode >= 500 ? 'error' : 'info',
          requestId: req.requestId || req.id || null,
          method: req.method,
          path: req.originalUrl || req.url,
          status: res.statusCode,
          latencyMs: Number(latencyMs.toFixed(2)),
          contentLength: res.getHeader('content-length') || null
        })
      );
    });
    next();
  });
} else {
  app.use(morgan('dev'));
}
app.use('/uploads', express.static(uploadsDir));

// Memoized database initialization for standalone/direct runs
export function ensureDbInitialized(): Promise<void> {
  return ensureDbReady();
}

// Serverless DB Middleware intercepting /api/*
export async function dbReadinessMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
  dbReadyFn: () => Promise<void> = ensureDbReady
): Promise<Response | void> {
  if (
    req.path.startsWith('/api') &&
    req.path !== '/api/health' &&
    req.path !== '/api/robots.txt' &&
    req.path !== '/api/sitemap.xml' &&
    !req.path.startsWith('/api/seo/')
  ) {
    try {
      await dbReadyFn();
    } catch (error: unknown) {
      console.error("Database readiness check failed in middleware:", error);
      return res.status(500).json({
        error: 'Database connection failed',
        message: 'Unable to reach database cluster'
      });
    }
  }
  next();
}

app.use((req: Request, res: Response, next: NextFunction) => dbReadinessMiddleware(req, res, next));

// Root-level SEO endpoints (mirrored by vercel.json rewrites in production)
app.get('/robots.txt', handleRobotsTxt);
app.get('/sitemap.xml', handleSitemapXml);

// Mount API router
app.use('/api', router);

// 404 Handler for unmatched API routes
app.use('/api', notFoundHandler);

// Global Centralized Error Handler to guarantee JSON responses, operational mapping, and prevent plain text crashes
app.use(errorHandler);

const isDirectRun = Boolean(process.argv[1] && /server(\.ts|\.js)?$/i.test(process.argv[1]));

if (!process.env.VERCEL && process.env.NO_LISTEN !== 'true' && (isDirectRun || process.env.NODE_ENV !== 'test')) {
  validateServerEnv();
  assertMidtransProductionConfig();
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

export {
  errorHandler,
  notFoundHandler,
  requestIdMiddleware
};

export default app;
