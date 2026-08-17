import express from 'express';
import type { Request, Response, NextFunction, Application } from 'express';
import compression from 'compression';
import cors from 'cors';
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

// Security & Parsing Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://app.sandbox.midtrans.com",
          "https://snap-assets.sandbox.midtrans.com",
          "https://*.midtrans.com",
          "https://pay.google.com",
          "https://gwk.gopayapi.com",
          "https://unpkg.com"
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://res.cloudinary.com",
          "https://*.cloudinary.com",
          "https://*.tile.openstreetmap.org",
          "https://unpkg.com",
          "https://images.unsplash.com"
        ],
        frameSrc: ["'self'", "https://app.sandbox.midtrans.com", "https://*.midtrans.com"],
        connectSrc: [
          "'self'",
          "https://app.sandbox.midtrans.com",
          "https://api.sandbox.midtrans.com",
          "https://*.midtrans.com",
          "https://api.cloudinary.com",
          "https://*.tile.openstreetmap.org"
        ]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  })
);
app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }));
app.use(morgan('dev'));
app.use('/uploads', express.static(uploadsDir));

// Memoized database initialization for standalone/direct runs
export function ensureDbInitialized(): Promise<void> {
  return ensureDbReady();
}

// Serverless DB Middleware intercepting /api/*
app.use(async (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api') && req.path !== '/api/health') {
    try {
      await ensureDbReady();
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Unable to reach database cluster';
      console.error("Database readiness check failed in middleware:", error);
      return res.status(500).json({
        error: 'Database connection failed',
        message: errorMsg
      });
    }
  }
  next();
});

// Mount API router
app.use('/api', router);

// Global Error Handler to guarantee JSON responses and prevent plain text 500 crashes
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled API Error:", err);
  const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
  res.status(500).json({ message: errorMsg, error: errorMsg });
});

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

export default app;
