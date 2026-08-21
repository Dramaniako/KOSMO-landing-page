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
  
  const [roomsIndexes] = await conn.query("SHOW INDEX FROM rooms");
  console.log("Rooms Indexes:");
  console.log(roomsIndexes.map(idx => ({ Table: idx.Table, Key_name: idx.Key_name, Column_name: idx.Column_name })));

  const [propertiesIndexes] = await conn.query("SHOW INDEX FROM properties");
  console.log("\nProperties Indexes:");
  console.log(propertiesIndexes.map(idx => ({ Table: idx.Table, Key_name: idx.Key_name, Column_name: idx.Column_name })));

  await conn.end();
} catch (e) {
  console.error(e);
}
