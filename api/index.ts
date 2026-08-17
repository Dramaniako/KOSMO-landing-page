import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import { initDb } from '../backend/db.ts';
import router from '../backend/router.ts';

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }));
app.use(morgan('dev'));

// Ensure DB is fully initialized before routing any API requests
app.use(async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await initDb();
    next();
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Database initialization failed in middleware:", err);
    res.status(500).json({ message: "Database initialization failed: " + errorMsg });
  }
});

// Mount API router
app.use('/api', router);

// Export Express app for Vercel Serverless Function
export default app;
