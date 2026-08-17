import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

// Load .env locally if present
try {
  const possibleEnvPaths = [
    path.resolve('.env'),
    path.resolve('backend', '.env')
  ];
  for (const envPath of possibleEnvPaths) {
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      envContent.split(/\r?\n/).forEach((line: string) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const [key, ...valParts] = trimmed.split('=');
        if (key && valParts.length > 0 && !process.env[key.trim()]) {
          process.env[key.trim()] = valParts.join('=').trim();
        }
      });
    }
  }
} catch (e) {
  console.warn('Failed to load .env file:', e);
}

async function diagnose() {
  console.log('==============================================');
  console.log(' 🔍 TiDB Cloud / MySQL Connection Diagnostics');
  console.log('==============================================');

  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '4000', 10);
  const user = process.env.DB_USER || 'root';
  const database = process.env.DB_NAME || 'kosmo_db';
  const dbSsl = process.env.DB_SSL;
  const isSSLFalse = dbSsl === 'false';

  console.log(`Host:     ${host}`);
  console.log(`Port:     ${port}`);
  console.log(`User:     ${user}`);
  console.log(`Database: ${database}`);
  console.log(`SSL Mode: ${isSSLFalse ? 'Disabled (ssl=false)' : 'Enabled (TLSv1.2, rejectUnauthorized=false)'}`);
  console.log('----------------------------------------------');

  const sslOption = isSSLFalse
    ? undefined
    : {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: false
      };

  const startTime = Date.now();

  try {
    console.log('Attempting connection to database cluster...');
    const connection = await mysql.createConnection({
      host,
      port,
      user,
      password: process.env.DB_PASSWORD || '',
      database,
      ...(sslOption ? { ssl: sslOption } : {}),
      connectTimeout: 10000
    });

    const connectLatency = Date.now() - startTime;
    console.log(`✅ Connection established successfully in ${connectLatency}ms`);

    const queryStart = Date.now();
    const [rows] = await connection.query('SELECT 1 AS health, NOW() AS db_time, VERSION() AS version');
    const queryLatency = Date.now() - queryStart;

    console.log(`✅ Health query executed in ${queryLatency}ms`);
    console.log('Result payload:', JSON.stringify(rows, null, 2));

    const [tableRows] = await connection.query('SHOW TABLES');
    console.log('Existing tables in database:');
    console.log(tableRows);

    await connection.end();
    console.log('==============================================');
    console.log('🎉 Diagnostics complete: Database is 100% HEALTHY');
    console.log('==============================================');
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error(`❌ Connection failed after ${elapsed}ms:`);
    console.error('Error Code:   ', error.code);
    console.error('Error Number: ', error.errno);
    console.error('SQL State:    ', error.sqlState);
    console.error('Message:      ', error.message);
    console.error('Stack Trace:  ', error.stack);
    console.log('==============================================');
  }
}

diagnose();
