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
const PORT: number = parseInt(process.env.PORT || '5000', 10);

// Performance & Compression Middleware (Mounted first)
app.use(compression());

// Security: Whitelist-based CORS Origin Validation
export function isOriginAllowed(origin: string | undefined): boolean {
  // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
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
    'http://www.kosmobali.my.id'
  ];

  const allowedOrigins = [...defaultAllowed, ...envAllowed];
  const normalizedOrigin = origin.toLowerCase().replace(/\/$/, '');

  const isExactMatch = allowedOrigins.some((allowed: string) => {
    const normalizedAllowed = allowed.toLowerCase().replace(/\/$/, '');
    if (normalizedAllowed === '*' && process.env.NODE_ENV !== 'production') return true;
    return normalizedAllowed === normalizedOrigin;
  });

  if (isExactMatch) return true;

  // Support Vercel deployments and custom domain subdomains
  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'kosmobali.my.id' ||
      hostname.endsWith('.kosmobali.my.id') ||
      hostname.endsWith('.vercel.app')
    ) {
      return true;
    }
  } catch {
    // Invalid URL format
  }

  return false;
}

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  credentials: true,
  maxAge: 86400
};

// Security & Parsing Middleware
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);
app.use(cors(corsOptions));
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }));
app.use(morgan('dev'));
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
  if (req.path.startsWith('/api') && req.path !== '/api/health') {
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

// Mount API router
app.use('/api', router);

// Global Error Handler to guarantee JSON responses and prevent plain text 500 crashes
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled API Error:", err);
  res.status(500).json({ message: "Internal Server Error", error: "Internal Server Error" });
});

if (!process.env.VERCEL && process.env.NODE_ENV !== 'test' && process.env.NO_LISTEN !== 'true') {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

export default app;
