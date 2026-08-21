import mysql from 'mysql2/promise';

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'kosmo_db',
  ssl: process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false }
};

try {
  const conn = await mysql.createConnection(dbConfig);
  console.log("Connected!");
  
  const [rows] = await conn.query("SELECT * FROM rooms LIMIT 5");
  console.log("Rooms rows:");
  console.log(rows);

  await conn.end();
} catch (e) {
  console.error(e);
}
