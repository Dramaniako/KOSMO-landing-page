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

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app: Application = express();
const PORT: number = parseInt(process.env.PORT || '5000', 10);

// Performance & Compression Middleware (Mounted first)
app.use(compression());

// Security & Parsing Middleware
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
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
    res.status(500).json({ message: "Database initialization failed: " + errorMsg });
  }
});

// Mount API router
app.use('/api', router);

const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('server.ts') || 
  process.argv[1].endsWith('server.js')
);

if (isDirectRun && process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

export default app;
