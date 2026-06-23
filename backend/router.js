import express from 'express';
import { pool } from './db.js';

const router = express.Router();

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

    if (!user || user.password !== password) {
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
    await pool.query(
      `INSERT INTO users (id, email, password, name, role, phone, paymentMethod) 
       VALUES (?, ?, ?, ?, 'tenant', ?, 'Virtual Account')`,
      [userId, email, password, name, phone || '']
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
    await pool.query(
      `INSERT INTO users (id, email, password, name, role, phone, paymentMethod) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, email, password, name, role, phone || '', paymentMethod || 'Virtual Account']
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
      await pool.query(
        `UPDATE users SET name = ?, email = ?, role = ?, phone = ?, paymentMethod = ?, password = ? WHERE id = ?`,
        [name, email, role, phone || '', paymentMethod || '', password, id]
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
  try {
    const [rows] = await pool.query('SELECT * FROM properties WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Properti tidak ditemukan." });
    }

    await pool.query('DELETE FROM properties WHERE id = ?', [id]);
    res.json({ message: "Properti berhasil dihapus!" });
  } catch (err) {
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

export default router;
