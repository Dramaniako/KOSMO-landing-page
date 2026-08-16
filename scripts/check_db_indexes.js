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
