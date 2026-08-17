import express from 'express';
import type { Request, Response, NextFunction, Application } from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import { initDb } from './db.ts';
import router from './router.ts';

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure uploads directory exists (graceful for serverless read-only environments)
const uploadsDir = path.join(__dirname, 'uploads');
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
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false
}));
app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }));
app.use(morgan('dev'));
app.use('/uploads', express.static(uploadsDir));

// Memoized database initialization
let dbInitPromise: Promise<void> | null = null;
export function ensureDbInitialized(): Promise<void> {
  if (!dbInitPromise) {
    dbInitPromise = initDb().catch((err) => {
      dbInitPromise = null;
      throw err;
    });
  }
  return dbInitPromise;
}

// Ensure DB is initialized before handling any requests
app.use(async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await ensureDbInitialized();
    next();
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Database initialization failed in middleware:", err);
    res.status(500).json({ message: "Database initialization failed: " + errorMsg, error: errorMsg });
  }
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
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
