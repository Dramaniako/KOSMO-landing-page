import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import morgan from 'morgan';
import { initDb } from '../backend/db.js';
import router from '../backend/router.js';

// Initialize Aiven MySQL database tables
initDb();

const app = express();

app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }));
app.use(morgan('dev'));

// Mount API router
app.use('/api', router);

// Export Express app for Vercel Serverless Function
export default app;
