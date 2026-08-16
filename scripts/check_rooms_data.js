import mysql from 'mysql2/promise';

const dbConfig = {
  host: 'bsbw2iv6fgwbjlitkihs-mysql.services.clever-cloud.com',
  port: 3306,
  user: 'ueibw0ee4mk0kzpy',
  password: '4fD3zYPoP178R3XgpH5Q',
  database: 'bsbw2iv6fgwbjlitkihs'
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
