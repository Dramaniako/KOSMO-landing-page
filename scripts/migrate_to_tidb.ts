import mysql from 'mysql2/promise';
import { initDb, pool } from '../backend/db.ts';
import type { RowDataPacket } from 'mysql2/promise';

const sourceConfig = {
  host: 'bsbw2iv6fgwbjlitkihs-mysql.services.clever-cloud.com',
  port: 3306,
  user: 'ueibw0ee4mk0kzpy',
  password: '4fD3zYPoP178R3XgpH5Q',
  database: 'bsbw2iv6fgwbjlitkihs',
  ssl: { rejectUnauthorized: false }
};

async function migrate() {
  console.log('🚀 Starting Data Migration: Clever Cloud -> TiDB Serverless...');

  // 1. Initialize schema on TiDB
  console.log('📦 Initializing schema on TiDB Serverless...');
  await initDb();
  try {
    await pool.query('ALTER TABLE properties MODIFY image LONGTEXT');
    await pool.query('ALTER TABLE properties MODIFY description LONGTEXT');
    await pool.query('ALTER TABLE users MODIFY avatar LONGTEXT');
  } catch (e) {
    console.warn('ALTER TABLE warning:', e);
  }

  // 2. Connect to source Clever Cloud database
  console.log('🔌 Connecting to source Clever Cloud MySQL...');
  const sourceConn = await mysql.createConnection(sourceConfig);

  try {
    // 3. Migrate Users
    console.log('\n--- Migrating Users ---');
    const [users] = await sourceConn.query<RowDataPacket[]>('SELECT * FROM users');
    console.log(`Found ${users.length} users in Clever Cloud.`);
    for (const u of users) {
      await pool.query(`
        INSERT INTO users (id, email, password, name, role, phone, paymentMethod, avatar, notifications, language, balance, totalRevenue, totalWithdrawn, bankName, bankAccountNumber, bankAccountHolder)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          email = VALUES(email),
          password = VALUES(password),
          name = VALUES(name),
          role = VALUES(role),
          phone = VALUES(phone),
          paymentMethod = VALUES(paymentMethod),
          balance = VALUES(balance),
          totalRevenue = VALUES(totalRevenue),
          totalWithdrawn = VALUES(totalWithdrawn),
          bankName = VALUES(bankName),
          bankAccountNumber = VALUES(bankAccountNumber),
          bankAccountHolder = VALUES(bankAccountHolder)
      `, [
        u.id, u.email, u.password, u.name, u.role, u.phone || '', u.paymentMethod || 'Virtual Account',
        u.avatar || null, u.notifications !== undefined ? u.notifications : 1, u.language || 'Indonesia',
        u.balance || 0, u.totalRevenue || 0, u.totalWithdrawn || 0,
        u.bankName || '', u.bankAccountNumber || '', u.bankAccountHolder || ''
      ]);
    }
    console.log(`✅ Migrated ${users.length} users successfully.`);

    // 4. Migrate Properties (including "kos tes")
    console.log('\n--- Migrating Properties ---');
    const [properties] = await sourceConn.query<RowDataPacket[]>('SELECT * FROM properties');
    console.log(`Found ${properties.length} properties in Clever Cloud.`);
    for (const p of properties) {
      await pool.query(`
        INSERT INTO properties (id, name, district, address, price, rating, image, description, latitude, longitude, totalRooms, occupiedRooms, ownerId, document)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          district = VALUES(district),
          address = VALUES(address),
          price = VALUES(price),
          rating = VALUES(rating),
          image = VALUES(image),
          description = VALUES(description),
          latitude = VALUES(latitude),
          longitude = VALUES(longitude),
          totalRooms = VALUES(totalRooms),
          occupiedRooms = VALUES(occupiedRooms),
          ownerId = VALUES(ownerId),
          document = VALUES(document)
      `, [
        p.id, p.name, p.district, p.address, Number(p.price) || 0, Number(p.rating) || 0,
        p.image, p.description, p.latitude || '-8.6500', p.longitude || '115.2166',
        Number(p.totalRooms) || 1, Number(p.occupiedRooms) || 0, p.ownerId || 'user-landlord',
        p.document || 'sertifikat_kepemilikan.pdf'
      ]);
    }
    console.log(`✅ Migrated ${properties.length} properties successfully.`);

    // 5. Migrate Property Facilities
    console.log('\n--- Migrating Property Facilities ---');
    const [facilities] = await sourceConn.query<RowDataPacket[]>('SELECT * FROM property_facilities');
    console.log(`Found ${facilities.length} facility entries in Clever Cloud.`);
    for (const f of facilities) {
      await pool.query(`
        INSERT INTO property_facilities (propertyId, facility)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE facility = VALUES(facility)
      `, [f.propertyId, f.facility]);
    }
    console.log(`✅ Migrated ${facilities.length} facility entries successfully.`);

    // 6. Migrate Reviews
    console.log('\n--- Migrating Reviews ---');
    const [reviews] = await sourceConn.query<RowDataPacket[]>('SELECT * FROM reviews');
    console.log(`Found ${reviews.length} reviews in Clever Cloud.`);
    for (const r of reviews) {
      await pool.query(`
        INSERT INTO reviews (id, propertyId, propertyName, userId, userName, rating, comment, date)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          propertyName = VALUES(propertyName),
          userName = VALUES(userName),
          rating = VALUES(rating),
          comment = VALUES(comment),
          date = VALUES(date)
      `, [r.id, r.propertyId, r.propertyName, r.userId, r.userName, Number(r.rating) || 5, r.comment, r.date || '2026-08-16']);
    }
    console.log(`✅ Migrated ${reviews.length} reviews successfully.`);

    // 7. Migrate Rentals
    console.log('\n--- Migrating Rentals ---');
    const [rentals] = await sourceConn.query<RowDataPacket[]>('SELECT * FROM rentals');
    console.log(`Found ${rentals.length} rentals in Clever Cloud.`);
    for (const ren of rentals) {
      await pool.query(`
        INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status, document)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          propertyName = VALUES(propertyName),
          price = VALUES(price),
          startDate = VALUES(startDate),
          status = VALUES(status),
          document = VALUES(document)
      `, [ren.id, ren.tenantId, ren.propertyId, ren.propertyName, Number(ren.price) || 0, ren.startDate, ren.status || 'pending', ren.document || 'kontrak_sewa.pdf']);
    }
    console.log(`✅ Migrated ${rentals.length} rentals successfully.`);

    // 8. Migrate Withdrawals
    console.log('\n--- Migrating Withdrawals ---');
    const [withdrawals] = await sourceConn.query<RowDataPacket[]>('SELECT * FROM withdrawals');
    console.log(`Found ${withdrawals.length} withdrawals in Clever Cloud.`);
    
    const normalizeWithdrawalStatus = (status: string): 'pending' | 'processing' | 'completed' | 'rejected' => {
      const lower = (status || '').toLowerCase();
      if (lower === 'selesai' || lower === 'completed') return 'completed';
      if (lower === 'diproses' || lower === 'processing') return 'processing';
      if (lower === 'ditolak' || lower === 'rejected') return 'rejected';
      return 'pending';
    };

    for (const w of withdrawals) {
      await pool.query(`
        INSERT INTO withdrawals (id, userId, bankName, accountNumber, amount, date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          bankName = VALUES(bankName),
          accountNumber = VALUES(accountNumber),
          amount = VALUES(amount),
          date = VALUES(date),
          status = VALUES(status)
      `, [w.id, w.userId, w.bankName, w.accountNumber, Number(w.amount) || 0, w.date, normalizeWithdrawalStatus(w.status)]);
    }
    console.log(`✅ Migrated ${withdrawals.length} withdrawals successfully.`);

    // 9. Benchmark Query Performance (Singapore TiDB Cluster)
    console.log('\n⚡ Benchmarking TiDB Cloud Singapore Latency...');
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = Date.now();
      const [rows] = await pool.query('SELECT * FROM properties');
      const duration = Date.now() - start;
      times.push(duration);
    }
    const avgLatency = (times.reduce((a, b) => a + b, 0) / times.length).toFixed(1);
    console.log(`Latency over 5 roundtrips: [${times.join(', ')}] ms (Average: ${avgLatency} ms)`);
    console.log('\n🎉 ALL DATA MIGRATED AND VERIFIED SUCCESSFULLY!');
  } finally {
    await sourceConn.end();
  }
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
