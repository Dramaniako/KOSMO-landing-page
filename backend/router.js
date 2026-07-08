import express from 'express';
import { pool } from './db.js';
import XLSX from 'xlsx';
import multer from 'multer';
import path from 'path';
import bcrypt from 'bcryptjs';
import fs from 'fs';

const router = express.Router();

// Multer File Upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Generic Upload endpoint
router.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Tidak ada file yang diunggah.' });
  }
  const base64Image = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  res.json({ url: base64Image });
});

// ID Generator
const generateId = (prefix) => `${prefix}-${Math.random().toString(36).substring(2, 9)}`;

// ==========================================
// Authentication Endpoints
// ==========================================
router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email dan password wajib diisi." });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    const user = rows[0];

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ message: "Email atau password salah." });
    }

    // Exclude password from the returned object
    const { password: _, ...safeUser } = user;
    const token = `token-${user.id}-${Date.now()}`;

    res.json({
      message: "Login berhasil!",
      user: safeUser,
      token
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
});

router.post('/auth/register', async (req, res) => {
  const { email, password, name, phone } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ message: "Nama, email, dan password wajib diisi." });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length > 0) {
      return res.status(400).json({ message: "Email sudah terdaftar." });
    }

    const userId = generateId("user");
    const hashedPassword = bcrypt.hashSync(password, 10);
    await pool.query(
      `INSERT INTO users (id, email, password, name, role, phone, paymentMethod) 
       VALUES (?, ?, ?, ?, 'tenant', ?, 'Virtual Account')`,
      [userId, email, hashedPassword, name, phone || '']
    );

    const [[newUser]] = await pool.query('SELECT * FROM users WHERE id = ?', [userId]);
    const { password: _, ...safeUser } = newUser;
    const token = `token-${newUser.id}-${Date.now()}`;

    res.status(201).json({
      message: "Registrasi berhasil!",
      user: safeUser,
      token
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
});


// ==========================================
// User Profiles & Admin User Management (CRUD)
// ==========================================
router.get('/users/profile/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil profil user." });
  }
});

router.put('/users/profile/:id', async (req, res) => {
  const { id } = req.params;
  const { name, phone, paymentMethod, notifications, language } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }

    const notifVal = notifications !== undefined ? (notifications ? 1 : 0) : 1;

    await pool.query(
      `UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone), 
       paymentMethod = COALESCE(?, paymentMethod), notifications = ?, language = COALESCE(?, language) 
       WHERE id = ?`,
      [name, phone, paymentMethod, notifVal, language, id]
    );

    const [[updatedUser]] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    const { password: _, ...safeUser } = updatedUser;
    res.json({
      message: "Profil berhasil diperbarui!",
      user: safeUser
    });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ message: "Gagal memperbarui profil." });
  }
});

// Admin Route: Get all users
router.get('/users', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, email, name, role, phone, paymentMethod, balance, totalRevenue, totalWithdrawn FROM users');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil data user." });
  }
});

// Admin Route: Create user
router.post('/users', async (req, res) => {
  const { email, password, name, role, phone, paymentMethod } = req.body;
  if (!email || !password || !name || !role) {
    return res.status(400).json({ message: "Nama, email, password, dan role wajib diisi." });
  }

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length > 0) {
      return res.status(400).json({ message: "Email sudah terdaftar." });
    }

    const userId = generateId("user");
    const hashedPassword = bcrypt.hashSync(password, 10);
    await pool.query(
      `INSERT INTO users (id, email, password, name, role, phone, paymentMethod) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, email, hashedPassword, name, role, phone || '', paymentMethod || 'Virtual Account']
    );

    res.status(201).json({ message: "User berhasil dibuat!" });
  } catch (err) {
    res.status(500).json({ message: "Gagal membuat user." });
  }
});

// Admin Route: Update user role / details
router.put('/users/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, role, phone, paymentMethod, password } = req.body;

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }

    if (password) {
      const hashedPassword = bcrypt.hashSync(password, 10);
      await pool.query(
        `UPDATE users SET name = ?, email = ?, role = ?, phone = ?, paymentMethod = ?, password = ? WHERE id = ?`,
        [name, email, role, phone || '', paymentMethod || '', hashedPassword, id]
      );
    } else {
      await pool.query(
        `UPDATE users SET name = ?, email = ?, role = ?, phone = ?, paymentMethod = ? WHERE id = ?`,
        [name, email, role, phone || '', paymentMethod || '', id]
      );
    }

    res.json({ message: "User berhasil diperbarui!" });
  } catch (err) {
    res.status(500).json({ message: "Gagal memperbarui user." });
  }
});

// Admin Route: Delete user
router.delete('/users/:id', async (req, res) => {
  const { id } = req.params;
  if (id === 'user-admin') {
    return res.status(400).json({ message: "Admin utama tidak dapat dihapus." });
  }

  try {
    await pool.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: "User berhasil dihapus!" });
  } catch (err) {
    res.status(500).json({ message: "Gagal menghapus user." });
  }
});


// ==========================================
// Properties API (CRUD)
// ==========================================
router.get('/properties', async (req, res) => {
  const { district, priceMin, priceMax, facility } = req.query;

  try {
    let sql = 'SELECT * FROM properties WHERE 1=1';
    const params = [];

    if (district && district !== 'Semua') {
      sql += ' AND district = ?';
      params.push(district);
    }
    if (priceMin) {
      sql += ' AND price >= ?';
      params.push(parseInt(priceMin));
    }
    if (priceMax) {
      sql += ' AND price <= ?';
      params.push(parseInt(priceMax));
    }

    const [properties] = await pool.query(sql, params);

    // Fetch facilities for each property
    for (let prop of properties) {
      const [facRows] = await pool.query('SELECT facility FROM property_facilities WHERE propertyId = ?', [prop.id]);
      prop.facilities = facRows.map(r => r.facility);
    }

    // Filter by facility in JS if requested
    let filteredProperties = properties;
    if (facility) {
      const facilitiesList = Array.isArray(facility) ? facility : [facility];
      filteredProperties = properties.filter(p =>
        facilitiesList.every(f => p.facilities.map(item => item.toLowerCase()).includes(f.toLowerCase()))
      );
    }

    res.json(filteredProperties);
  } catch (err) {
    console.error("Get properties error:", err);
    try {
      fs.appendFileSync('db_error.log', `[${new Date().toISOString()}] GET /properties error: ${err.stack || err}\n`);
    } catch (e) {}
    res.status(500).json({ message: "Gagal mengambil properti." });
  }
});

router.get('/properties/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM properties WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }
    const prop = rows[0];
    const [facRows] = await pool.query('SELECT facility FROM property_facilities WHERE propertyId = ?', [prop.id]);
    prop.facilities = facRows.map(r => r.facility);

    res.json(prop);
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil detail properti." });
  }
});

router.post('/properties', async (req, res) => {
  const { name, district, address, price, description, facilities, latitude, longitude, totalRooms, image, ownerId } = req.body;

  if (!name || !district || !address || !price) {
    return res.status(400).json({ message: "Nama, wilayah, alamat, dan harga wajib diisi." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const propId = generateId("prop");
    const landlordId = ownerId || 'user-landlord';

    await connection.query(
      `INSERT INTO properties (id, name, district, address, price, rating, image, description, latitude, longitude, totalRooms, occupiedRooms, ownerId, document) 
       VALUES (?, ?, ?, ?, ?, 0.0, ?, ?, ?, ?, ?, 0, ?, 'sertifikat_kepemilikan.pdf')`,
      [
        propId, name, district, address, parseInt(price), 
        image || "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80",
        description || "", latitude || "-8.6500", longitude || "115.2166", 
        parseInt(totalRooms) || 5, landlordId
      ]
    );

    if (facilities && facilities.length > 0) {
      for (let fac of facilities) {
        await connection.query(
          'INSERT INTO property_facilities (propertyId, facility) VALUES (?, ?)', 
          [propId, fac]
        );
      }
    }

    // Auto-create rooms for mobile app support (Issue #1)
    const [[insertedProp]] = await connection.query('SELECT id_int FROM properties WHERE id = ?', [propId]);
    const propIntId = insertedProp ? insertedProp.id_int : null;
    if (propIntId) {
      const roomCount = parseInt(totalRooms) || 5;
      for (let i = 1; i <= roomCount; i++) {
        const roomNumber = `Kamar ${100 + i}`;
        await connection.query(
          `INSERT INTO rooms (property_id, room_number, tenant_id, price, is_all_inclusive, all_inclusive_bills) 
           VALUES (?, ?, NULL, ?, 1, 'Listrik, Air, Wifi')`,
          [propIntId, roomNumber, parseInt(price)]
        );
      }
    }

    await connection.commit();
    res.status(201).json({ message: "Properti berhasil ditambahkan!" });
  } catch (err) {
    await connection.rollback();
    console.error("Create property error:", err);
    res.status(500).json({ message: "Gagal menyimpan properti." });
  } finally {
    connection.release();
  }
});

router.put('/properties/:id', async (req, res) => {
  const { id } = req.params;
  const { name, district, address, price, description, facilities, latitude, longitude, totalRooms, occupiedRooms, image } = req.body;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query('SELECT * FROM properties WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }

    await connection.query(
      `UPDATE properties SET name = ?, district = ?, address = ?, price = ?, description = ?, 
       latitude = ?, longitude = ?, totalRooms = ?, occupiedRooms = ?, image = ? 
       WHERE id = ?`,
      [
        name, district, address, parseInt(price), description, 
        latitude, longitude, parseInt(totalRooms), parseInt(occupiedRooms || 0), image, id
      ]
    );

    if (facilities !== undefined) {
      await connection.query('DELETE FROM property_facilities WHERE propertyId = ?', [id]);
      if (facilities.length > 0) {
        for (let fac of facilities) {
          await connection.query('INSERT INTO property_facilities (propertyId, facility) VALUES (?, ?)', [id, fac]);
        }
      }
    }

    await connection.commit();
    res.json({ message: "Properti berhasil diperbarui!" });
  } catch (err) {
    await connection.rollback();
    console.error("Update property error:", err);
    res.status(500).json({ message: "Gagal memperbarui properti." });
  } finally {
    connection.release();
  }
});

router.delete('/properties/:id', async (req, res) => {
  const { id } = req.params;
  const { password, landlordId } = req.body;

  if (!password || !landlordId) {
    return res.status(400).json({ message: "Password dan landlordId diperlukan." });
  }

  try {
    const [propRows] = await pool.query('SELECT * FROM properties WHERE id = ?', [id]);
    const property = propRows[0];
    if (!property) {
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }

    if (property.ownerId !== landlordId) {
      return res.status(403).json({ message: "Anda bukan pemilik properti ini." });
    }

    // Verify landlord password
    const [userRows] = await pool.query('SELECT password FROM users WHERE id = ?', [landlordId]);
    const user = userRows[0];
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ message: "Password salah." });
    }

    await pool.query('DELETE FROM properties WHERE id = ?', [id]);
    res.json({ message: "Properti berhasil dihapus!" });
  } catch (err) {
    console.error("Delete property error:", err);
    res.status(500).json({ message: "Gagal menghapus properti." });
  }
});


// ==========================================
// Reviews API (CRUD)
// ==========================================
router.get('/reviews', async (req, res) => {
  const { propertyId, userId } = req.query;

  try {
    let sql = 'SELECT * FROM reviews WHERE 1=1';
    const params = [];

    if (propertyId) {
      sql += ' AND propertyId = ?';
      params.push(propertyId);
    }
    if (userId) {
      sql += ' AND userId = ?';
      params.push(userId);
    }

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil data review." });
  }
});

router.post('/reviews', async (req, res) => {
  const { propertyId, userId, userName, rating, comment } = req.body;

  if (!propertyId || !userId || !rating || !comment) {
    return res.status(400).json({ message: "Property ID, User ID, rating, dan komentar wajib diisi." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [propRows] = await connection.query('SELECT * FROM properties WHERE id = ?', [propertyId]);
    const property = propRows[0];
    if (!property) {
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }

    const revId = generateId("rev");
    const dateStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

    await connection.query(
      `INSERT INTO reviews (id, propertyId, propertyName, userId, userName, rating, comment, date) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [revId, propertyId, property.name, userId, userName || "Anonim", parseInt(rating), comment, dateStr]
    );

    // Recalculate average rating
    const [revRows] = await connection.query('SELECT rating FROM reviews WHERE propertyId = ?', [propertyId]);
    const avgRating = revRows.reduce((sum, r) => sum + r.rating, 0) / revRows.length;

    await connection.query('UPDATE properties SET rating = ? WHERE id = ?', [parseFloat(avgRating.toFixed(1)), propertyId]);

    await connection.commit();
    res.status(201).json({ message: "Review berhasil ditambahkan!" });
  } catch (err) {
    await connection.rollback();
    console.error("Create review error:", err);
    res.status(500).json({ message: "Gagal menyimpan review." });
  } finally {
    connection.release();
  }
});

router.put('/reviews/:id', async (req, res) => {
  const { id } = req.params;
  const { rating, comment } = req.body;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query('SELECT * FROM reviews WHERE id = ?', [id]);
    const review = rows[0];
    if (!review) {
      return res.status(404).json({ message: "Review tidak ditemukan." });
    }

    await connection.query(
      'UPDATE reviews SET rating = ?, comment = ? WHERE id = ?',
      [parseInt(rating), comment, id]
    );

    // Recalculate average rating for property
    const [revRows] = await connection.query('SELECT rating FROM reviews WHERE propertyId = ?', [review.propertyId]);
    const avgRating = revRows.reduce((sum, r) => sum + r.rating, 0) / revRows.length;

    await connection.query('UPDATE properties SET rating = ? WHERE id = ?', [parseFloat(avgRating.toFixed(1)), review.propertyId]);

    await connection.commit();
    res.json({ message: "Review berhasil diperbarui!" });
  } catch (err) {
    await connection.rollback();
    console.error("Update review error:", err);
    res.status(500).json({ message: "Gagal memperbarui review." });
  } finally {
    connection.release();
  }
});

router.delete('/reviews/:id', async (req, res) => {
  const { id } = req.params;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query('SELECT * FROM reviews WHERE id = ?', [id]);
    const review = rows[0];
    if (!review) {
      return res.status(404).json({ message: "Review tidak ditemukan." });
    }

    await connection.query('DELETE FROM reviews WHERE id = ?', [id]);

    // Recalculate average rating for property
    const [revRows] = await connection.query('SELECT rating FROM reviews WHERE propertyId = ?', [review.propertyId]);
    let avgRating = 0.0;
    if (revRows.length > 0) {
      avgRating = revRows.reduce((sum, r) => sum + r.rating, 0) / revRows.length;
    }

    await connection.query('UPDATE properties SET rating = ? WHERE id = ?', [parseFloat(avgRating.toFixed(1)), review.propertyId]);

    await connection.commit();
    res.json({ message: "Review berhasil dihapus!" });
  } catch (err) {
    await connection.rollback();
    res.status(500).json({ message: "Gagal menghapus review." });
  } finally {
    connection.release();
  }
});


// ==========================================
// Statistics & Withdrawal API (Landlord Panel)
// ==========================================
router.get('/stats', async (req, res) => {
  const landlordId = req.query.landlordId || 'user-landlord';

  try {
    const [userRows] = await pool.query('SELECT * FROM users WHERE id = ?', [landlordId]);
    const landlord = userRows[0];
    if (!landlord) {
      return res.status(404).json({ message: "Landlord tidak ditemukan." });
    }

    const [properties] = await pool.query('SELECT * FROM properties WHERE ownerId = ?', [landlordId]);
    const [reviews] = await pool.query(
      `SELECT r.* FROM reviews r 
       JOIN properties p ON r.propertyId = p.id 
       WHERE p.ownerId = ?`, 
      [landlordId]
    );

    const [withdrawals] = await pool.query(
      'SELECT * FROM withdrawals WHERE userId = ? ORDER BY date DESC', 
      [landlordId]
    );

    let totalRooms = 0;
    let occupiedRooms = 0;

    properties.forEach(p => {
      totalRooms += p.totalRooms || 0;
      occupiedRooms += p.occupiedRooms || 0;
    });

    const occupancyRate = totalRooms > 0 ? parseFloat(((occupiedRooms / totalRooms) * 100).toFixed(1)) : 0;

    res.json({
      balance: parseFloat(landlord.balance),
      totalRevenue: parseFloat(landlord.totalRevenue),
      totalWithdrawn: parseFloat(landlord.totalWithdrawn),
      totalProperti: properties.length,
      totalRooms,
      occupiedRooms,
      occupancyRate,
      activeTenants: occupiedRooms,
      withdrawals,
      reviewsCount: reviews.length
    });
  } catch (err) {
    console.error("Get stats error:", err);
    res.status(500).json({ message: "Gagal memuat statistik dasbor." });
  }
});

router.post('/withdraw', async (req, res) => {
  const { amount, bankName, accountNumber, userId } = req.body;
  if (!amount || !bankName || !accountNumber) {
    return res.status(400).json({ message: "Jumlah, nama bank, dan nomor rekening wajib diisi." });
  }

  const targetUserId = userId || 'user-landlord';
  const withdrawAmount = parseFloat(amount);

  if (withdrawAmount <= 0) {
    return res.status(400).json({ message: "Jumlah penarikan harus lebih besar dari 0." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query('SELECT * FROM users WHERE id = ? FOR UPDATE', [targetUserId]);
    const user = rows[0];
    if (!user) {
      return connection.rollback(), res.status(404).json({ message: "User tidak ditemukan." });
    }

    if (parseFloat(user.balance) < withdrawAmount) {
      return connection.rollback(), res.status(400).json({ message: "Saldo tidak mencukupi." });
    }

    // Deduct balance and update withdrawn statistics
    const newBalance = parseFloat(user.balance) - withdrawAmount;
    const newWithdrawn = parseFloat(user.totalWithdrawn) + withdrawAmount;

    await connection.query(
      'UPDATE users SET balance = ?, totalWithdrawn = ? WHERE id = ?',
      [newBalance, newWithdrawn, targetUserId]
    );

    const withdrawalId = generateId("w");
    const dateStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

    await connection.query(
      `INSERT INTO withdrawals (id, userId, bankName, accountNumber, amount, date, status) 
       VALUES (?, ?, ?, ?, ?, ?, 'Selesai')`,
      [withdrawalId, targetUserId, bankName, accountNumber, withdrawAmount, dateStr]
    );

    await connection.commit();
    res.json({
      message: "Penarikan dana berhasil diproses!",
      balance: newBalance,
      totalWithdrawn: newWithdrawn
    });
  } catch (err) {
    await connection.rollback();
    console.error("Withdrawal error:", err);
    res.status(500).json({ message: "Gagal memproses penarikan dana." });
  } finally {
    connection.release();
  }
});

// ==========================================
// Tracking & Admin Stats API
// ==========================================
router.post('/tracking/visit', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const userAgent = req.headers['user-agent'] || '';
  try {
    await pool.query(
      'INSERT INTO visitor_tracking (ip_address, user_agent) VALUES (?, ?)',
      [ip, userAgent]
    );
    res.status(201).json({ message: "Kunjungan berhasil dilacak." });
  } catch (err) {
    console.error("Tracking error:", err);
    res.status(500).json({ message: "Gagal melacak kunjungan." });
  }
});

router.get('/admin/stats', async (req, res) => {
  try {
    const [[visitorRow]] = await pool.query('SELECT COUNT(*) as count FROM visitor_tracking');
    const totalVisitors = visitorRow.count;

    const [[userRow]] = await pool.query('SELECT COUNT(*) as count FROM users');
    const totalUsers = userRow.count;

    const [[landlordRow]] = await pool.query("SELECT COUNT(*) as count FROM users WHERE role = 'landlord'");
    const totalLandlords = landlordRow.count;

    const [[propertyRow]] = await pool.query('SELECT COUNT(*) as count FROM properties');
    const totalProperties = propertyRow.count;

    const [[roomsRow]] = await pool.query('SELECT COALESCE(SUM(totalRooms), 0) as sum FROM properties');
    const totalRooms = roomsRow.sum || 0;

    res.json({
      totalVisitors,
      totalUsers,
      totalLandlords,
      totalProperties,
      totalRooms
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    res.status(500).json({ message: "Gagal mengambil statistik admin." });
  }
});

router.get('/admin/tracking-history', async (req, res) => {
  try {
    // 1. Last 24 Hours (grouped by hour)
    const [rows24h] = await pool.query(`
      SELECT 
        DATE_FORMAT(visited_at, '%Y-%m-%d %H:00:00') as label_time,
        COUNT(*) as count
      FROM visitor_tracking
      WHERE visited_at >= NOW() - INTERVAL 24 HOUR
      GROUP BY label_time
      ORDER BY label_time ASC
    `);

    // 2. Last 7 Days (grouped by day)
    const [rows7d] = await pool.query(`
      SELECT 
        DATE_FORMAT(visited_at, '%Y-%m-%d') as label_date,
        COUNT(*) as count
      FROM visitor_tracking
      WHERE visited_at >= DATE(NOW() - INTERVAL 6 DAY)
      GROUP BY label_date
      ORDER BY label_date ASC
    `);

    // 3. Last 30 Days (grouped by day)
    const [rows30d] = await pool.query(`
      SELECT 
        DATE_FORMAT(visited_at, '%Y-%m-%d') as label_date,
        COUNT(*) as count
      FROM visitor_tracking
      WHERE visited_at >= DATE(NOW() - INTERVAL 29 DAY)
      GROUP BY label_date
      ORDER BY label_date ASC
    `);

    // Post-process to fill gaps
    const now = new Date();
    
    // 24h helper
    const data24h = [];
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      const hour = String(d.getHours()).padStart(2, '0');
      const labelKey = `${year}-${month}-${date} ${hour}:00:00`;
      const hourLabel = `${hour}:00`;
      
      const match = rows24h.find(r => r.label_time === labelKey);
      data24h.push({
        label: hourLabel,
        count: match ? match.count : 0
      });
    }

    // 7d helper
    const data7d = [];
    const daysName = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      const labelKey = `${year}-${month}-${date}`;
      const dayLabel = daysName[d.getDay()] + ` (${date}/${month})`;

      const match = rows7d.find(r => r.label_date === labelKey);
      data7d.push({
        label: dayLabel,
        count: match ? match.count : 0
      });
    }

    // 30d helper
    const data30d = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      const labelKey = `${year}-${month}-${date}`;
      const dayLabel = `${date}/${month}`;

      const match = rows30d.find(r => r.label_date === labelKey);
      data30d.push({
        label: dayLabel,
        count: match ? match.count : 0
      });
    }

    res.json({
      history24h: data24h,
      history7d: data7d,
      history30d: data30d
    });
  } catch (err) {
    console.error("Error fetching tracking history:", err);
    res.status(500).json({ message: "Gagal mengambil riwayat tracking." });
  }
});

// ==========================================
// Excel Report Endpoints
// ==========================================
router.get('/reports/tracking/excel', async (req, res) => {
  try {
    const [[visitorRow]] = await pool.query('SELECT COUNT(*) as count FROM visitor_tracking');
    const [[userRow]] = await pool.query('SELECT COUNT(*) as count FROM users');
    const [[landlordRow]] = await pool.query("SELECT COUNT(*) as count FROM users WHERE role = 'landlord'");
    const [[propertyRow]] = await pool.query('SELECT COUNT(*) as count FROM properties');
    const [[roomsRow]] = await pool.query('SELECT COALESCE(SUM(totalRooms), 0) as sum FROM properties');

    const [visitors] = await pool.query('SELECT ip_address, user_agent, visited_at FROM visitor_tracking ORDER BY visited_at DESC LIMIT 1000');
    const [users] = await pool.query('SELECT id, email, name, role, phone FROM users ORDER BY id DESC');

    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      ['Metrik', 'Jumlah'],
      ['Total Pengunjung Website', visitorRow.count],
      ['Total Pengguna Terdaftar', userRow.count],
      ['Total Landlord', landlordRow.count],
      ['Total Properti', propertyRow.count],
      ['Total Kamar', roomsRow.sum || 0]
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Ringkasan');

    // Visitor details sheet
    const visitorData = [['IP Address', 'User Agent', 'Waktu Kunjungan']];
    visitors.forEach(v => visitorData.push([v.ip_address, v.user_agent, v.visited_at ? new Date(v.visited_at).toLocaleString('id-ID') : '']));
    const visitorSheet = XLSX.utils.aoa_to_sheet(visitorData);
    XLSX.utils.book_append_sheet(wb, visitorSheet, 'Pengunjung');

    // Users sheet
    const userData = [['ID', 'Email', 'Nama', 'Role', 'Telepon']];
    users.forEach(u => userData.push([u.id, u.email, u.name, u.role, u.phone]));
    const userSheet = XLSX.utils.aoa_to_sheet(userData);
    XLSX.utils.book_append_sheet(wb, userSheet, 'Pengguna');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=laporan_tracking_kosmo.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error('Excel tracking report error:', err);
    res.status(500).json({ message: 'Gagal menghasilkan laporan Excel.' });
  }
});

router.get('/reports/landlord/excel', async (req, res) => {
  const { landlordId } = req.query;
  if (!landlordId) return res.status(400).json({ message: 'landlordId diperlukan.' });
  try {
    const [[landlord]] = await pool.query('SELECT * FROM users WHERE id = ?', [landlordId]);
    if (!landlord) return res.status(404).json({ message: 'Landlord tidak ditemukan.' });

    const [properties] = await pool.query('SELECT * FROM properties WHERE ownerId = ?', [landlord.id]);
    const [transactions] = await pool.query(
      `SELECT r.*, p.name as propertyName FROM rentals r 
       JOIN properties p ON r.propertyId = p.id 
       WHERE p.ownerId = ? ORDER BY r.id DESC`, [landlord.id]
    );

    const wb = XLSX.utils.book_new();

    // Financial Summary sheet
    const summaryData = [
      ['Laporan Keuangan Landlord'],
      ['Nama', landlord.name],
      ['Email', landlord.email],
      ['Total Pendapatan', landlord.totalRevenue || 0],
      ['Total Penarikan', landlord.totalWithdrawn || 0],
      ['Saldo', landlord.balance || 0],
      [''],
      ['Ringkasan Properti'],
      ['Nama Properti', 'Lokasi', 'Harga', 'Total Kamar', 'Kamar Tersedia']
    ];
    properties.forEach(p => summaryData.push([p.name, p.district, p.price, p.totalRooms, p.totalRooms - p.occupiedRooms]));
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Ringkasan Keuangan');

    // Transactions sheet
    const txData = [['ID Transaksi', 'Properti', 'Tanggal', 'Jumlah', 'Status']];
    transactions.forEach(t => txData.push([t.id, t.propertyName, t.startDate, t.price, t.status === 'active' ? 'Aktif' : 'Selesai']));
    const txSheet = XLSX.utils.aoa_to_sheet(txData);
    XLSX.utils.book_append_sheet(wb, txSheet, 'Transaksi');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename=laporan_keuangan_${landlord.name.replace(/\s+/g, '_')}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error('Excel landlord report error:', err);
    res.status(500).json({ message: 'Gagal menghasilkan laporan Excel.' });
  }
});

// ==========================================
// Password Verification Endpoint
// ==========================================
router.post('/auth/verify-password', async (req, res) => {
  const { userId, password } = req.body;
  if (!userId || !password) {
    return res.status(400).json({ message: "userId dan password wajib diisi." });
  }
  try {
    const [rows] = await pool.query('SELECT password FROM users WHERE id = ?', [userId]);
    const user = rows[0];
    if (!user) {
      return res.status(404).json({ message: "User tidak ditemukan." });
    }
    const valid = bcrypt.compareSync(password, user.password);
    res.json({ valid });
  } catch (err) {
    console.error("Password verification error:", err);
    res.status(500).json({ message: "Gagal memverifikasi password." });
  }
});

// ==========================================
// Rentals / Booking Endpoints
// ==========================================
router.get('/rentals', async (req, res) => {
  const { tenantId } = req.query;
  try {
    let sql = 'SELECT * FROM rentals WHERE 1=1';
    const params = [];
    if (tenantId) {
      sql += ' AND tenantId = ?';
      params.push(tenantId);
    }
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("Get rentals error:", err);
    res.status(500).json({ message: "Gagal mengambil data sewa." });
  }
});

router.post('/rentals', async (req, res) => {
  const { tenantId, propertyId, propertyName, price } = req.body;
  if (!tenantId || !propertyId) {
    return res.status(400).json({ message: "tenantId dan propertyId wajib diisi." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [[property]] = await connection.query('SELECT totalRooms, occupiedRooms, price, name, ownerId FROM properties WHERE id = ?', [propertyId]);
    if (!property) {
      connection.release();
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }
    if (property.occupiedRooms >= property.totalRooms) {
      connection.release();
      return res.status(400).json({ message: "Kamar kos sudah penuh." });
    }

    const rentalId = generateId("rent");
    const startDate = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    const rentalPrice = price || property.price;
    const rentalName = propertyName || property.name;

    await connection.query(
      `INSERT INTO rentals (id, tenantId, propertyId, propertyName, price, startDate, status) 
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [rentalId, tenantId, propertyId, rentalName, rentalPrice, startDate]
    );

    await connection.query(
      'UPDATE properties SET occupiedRooms = occupiedRooms + 1 WHERE id = ?',
      [propertyId]
    );

    if (property.ownerId) {
      await connection.query(
        'UPDATE users SET balance = balance + ?, totalRevenue = totalRevenue + ? WHERE id = ?',
        [rentalPrice, rentalPrice, property.ownerId]
      );
    }

    await connection.commit();
    res.status(201).json({ message: "Penyewaan kos berhasil diproses!", rentalId });
  } catch (err) {
    await connection.rollback();
    console.error("Create rental error:", err);
    res.status(500).json({ message: "Gagal memproses penyewaan kos." });
  } finally {
    connection.release();
  }
});

router.post('/rentals/:id/terminate', async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ message: "Password wajib dimasukkan." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [[rental]] = await connection.query('SELECT * FROM rentals WHERE id = ?', [id]);
    if (!rental) {
      connection.release();
      return res.status(404).json({ message: "Data sewa tidak ditemukan." });
    }
    if (rental.status === 'terminated') {
      connection.release();
      return res.status(400).json({ message: "Sewa sudah pernah diberhentikan." });
    }

    const [[user]] = await connection.query('SELECT password FROM users WHERE id = ?', [rental.tenantId]);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      connection.release();
      return res.status(401).json({ message: "Password salah." });
    }

    await connection.query(
      "UPDATE rentals SET status = 'terminated' WHERE id = ?",
      [id]
    );

    await connection.query(
      'UPDATE properties SET occupiedRooms = GREATEST(0, occupiedRooms - 1) WHERE id = ?',
      [rental.propertyId]
    );

    await connection.commit();
    res.json({ message: "Sewa kos berhasil diberhentikan." });
  } catch (err) {
    await connection.rollback();
    console.error("Terminate rental error:", err);
    res.status(500).json({ message: "Gagal memberhentikan sewa kos." });
  } finally {
    connection.release();
  }
});

export default router;
