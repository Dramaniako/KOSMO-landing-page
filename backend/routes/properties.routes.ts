import type { Request, Response, Router } from 'express';
import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db';
import { apiCache } from '../services/cache';
import { normalizeProperty, normalizePropertySummary } from '../services/transformers';
import type { PropertyRow } from '../services/transformers';
import { authenticateToken, requireRole } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import { propertySchema, validateBody } from '../middleware/validation';
import { generateId } from '../utils/id';
import type { UserRow } from './auth.routes';

interface FacilityRow extends RowDataPacket {
  facility: string;
}

interface CreatePropertyBody {
  name?: string;
  district?: string;
  address?: string;
  price?: number | string;
  description?: string;
  facilities?: string[];
  latitude?: string;
  longitude?: string;
  totalRooms?: number | string;
  occupiedRooms?: number | string;
  image?: string;
  ownerId?: string;
}

interface DeletePropertyBody {
  password?: string;
  landlordId?: string;
}

export function registerPropertyRoutes(router: Router): void {
  router.get('/properties', async (req: Request, res: Response) => {
    const { district, priceMin, priceMax, minPrice, maxPrice, facility, ownerId, owner } = req.query;
    const targetOwner = ownerId || owner;
    const effectiveMin = priceMin !== undefined ? priceMin : minPrice;
    const effectiveMax = priceMax !== undefined ? priceMax : maxPrice;
    const cacheKey = `properties:${district || 'all'}:${effectiveMin || 0}:${effectiveMax || 0}:${facility || 'all'}:${targetOwner || 'all'}`;

    const cachedData = apiCache.get<PropertyRow[]>(cacheKey);
    if (cachedData) {
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
      return res.json(cachedData);
    }

    try {
      let sql = `
        SELECT p.*, GROUP_CONCAT(pf.facility SEPARATOR ',') as facilitiesString
        FROM properties p
        LEFT JOIN property_facilities pf ON p.id = pf.propertyId
        WHERE 1=1
      `;
      const params: (string | number)[] = [];

      if (targetOwner) {
        sql += ' AND p.ownerId = ?';
        params.push(String(targetOwner));
      }
      if (district && district !== 'Semua') {
        sql += ' AND p.district = ?';
        params.push(String(district));
      }
      if (effectiveMin !== undefined && effectiveMin !== '') {
        sql += ' AND p.price >= ?';
        params.push(parseInt(String(effectiveMin), 10));
      }
      if (effectiveMax !== undefined && effectiveMax !== '') {
        sql += ' AND p.price <= ?';
        params.push(parseInt(String(effectiveMax), 10));
      }

      sql += ' GROUP BY p.id';

      const [properties] = await pool.query<(PropertyRow & { facilitiesString?: string })[]>(sql, params);

      for (const prop of properties) {
        prop.facilities = prop.facilitiesString ? prop.facilitiesString.split(',').filter(Boolean) : [];
        delete prop.facilitiesString;
      }

      // Filter by facility in JS if requested
      let filteredProperties = properties;
      if (facility) {
        const facilitiesList = (Array.isArray(facility) ? facility.map(String) : [String(facility)]).map(f => f.toLowerCase());
        filteredProperties = properties.filter(p => {
          const propFacSet = new Set((p.facilities || []).map(item => item.toLowerCase()));
          return facilitiesList.every(f => propFacSet.has(f));
        });
      }

      const normalized = filteredProperties.map(normalizePropertySummary);
      apiCache.set(cacheKey, normalized, 60);

      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
      res.json(normalized);
    } catch (err: unknown) {
      console.error("Error in GET /api/properties:", err);
      res.status(500).json({ error: 'Internal Server Error', message: "Gagal mengambil properti." });
    }
  });

  router.get('/properties/:id', async (req: Request<{ id: string }>, res: Response) => {
    const cacheKey = `properties:detail:${req.params.id}`;
    const cached = apiCache.get<PropertyRow>(cacheKey);
    if (cached) {
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
      return res.json(cached);
    }

    try {
      const [rows] = await pool.query<PropertyRow[]>('SELECT * FROM properties WHERE id = ?', [req.params.id]);
      if (rows.length === 0) {
        return res.status(404).json({ message: "Properti tidak ditemukan." });
      }
      const prop = rows[0];
      const [facRows] = await pool.query<FacilityRow[]>('SELECT facility FROM property_facilities WHERE propertyId = ?', [prop.id]);
      prop.facilities = facRows.map(r => r.facility);

      const normalized = normalizeProperty(prop);
      apiCache.set(cacheKey, normalized, 60);

      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
      res.json(normalized);
    } catch (err) {
      res.status(500).json({ message: "Gagal mengambil detail properti." });
    }
  });

  router.post(
    '/properties',
    authenticateToken,
    requireRole(['admin', 'landlord', 'owner']),
    validateBody(propertySchema),
    async (req: AuthenticatedRequest & Request<Record<string, never>, unknown, CreatePropertyBody>, res: Response) => {
      const { name, district, address, price, description, facilities, latitude, longitude, totalRooms, image, ownerId } = req.body;
      const authUser = req.user;

      if (!name || !district || !address || !price) {
        return res.status(400).json({ message: "Nama, wilayah, alamat, dan harga wajib diisi." });
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const propId = generateId("prop");
        const landlordId = (authUser?.role === 'admin' && ownerId) ? ownerId : (authUser?.id || ownerId || 'user-landlord');

        await connection.query(
          `INSERT INTO properties (id, name, district, address, price, rating, image, description, latitude, longitude, totalRooms, occupiedRooms, ownerId, document) 
           VALUES (?, ?, ?, ?, ?, 0.0, ?, ?, ?, ?, ?, 0, ?, 'sertifikat_kepemilikan.pdf')`,
          [
            propId, name, district, address, parseInt(String(price), 10), 
            image || "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80",
            description || "", latitude || "-8.6500", longitude || "115.2166", 
            parseInt(String(totalRooms || '5'), 10), landlordId
          ]
        );

        if (facilities && facilities.length > 0) {
          const facilityValues = facilities.map(fac => [propId, fac]);
          await connection.query(
            'INSERT INTO property_facilities (propertyId, facility) VALUES ?', 
            [facilityValues]
          );
        }

        await connection.commit();
        apiCache.invalidatePattern('properties');
        res.status(201).json({ message: "Properti berhasil ditambahkan!" });
      } catch (err) {
        await connection.rollback();
        console.error("Create property error:", err);
        res.status(500).json({ message: "Gagal menyimpan properti." });
      } finally {
        connection.release();
      }
    }
  );

  router.put('/properties/:id', authenticateToken, requireRole(['admin', 'landlord', 'owner']), async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { name, district, address, price, description, facilities, latitude, longitude, totalRooms, occupiedRooms, image } = req.body;
    const authUser = req.user;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [rows] = await connection.query<PropertyRow[]>('SELECT * FROM properties WHERE id = ? FOR UPDATE', [id]);
      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Properti tidak ditemukan." });
      }

      const existing = rows[0];
      if (authUser?.role !== 'admin' && existing.ownerId !== authUser?.id) {
        await connection.rollback();
        return res.status(403).json({ message: "Akses ditolak. Anda bukan pemilik properti ini." });
      }

      const updatedName = name !== undefined ? name : existing.name;
      const updatedDistrict = district !== undefined ? district : existing.district;
      const updatedAddress = address !== undefined ? address : existing.address;
      const updatedPrice = price !== undefined ? parseInt(String(price), 10) : existing.price;
      const updatedDesc = description !== undefined ? description : existing.description;
      const updatedLat = latitude !== undefined ? latitude : existing.latitude;
      const updatedLng = longitude !== undefined ? longitude : existing.longitude;
      const updatedRooms = totalRooms !== undefined ? parseInt(String(totalRooms), 10) : existing.totalRooms;
      const updatedOccupied = occupiedRooms !== undefined ? parseInt(String(occupiedRooms), 10) : existing.occupiedRooms;
      const updatedImage = image !== undefined ? image : existing.image;

      await connection.query(
        `UPDATE properties SET name = ?, district = ?, address = ?, price = ?, description = ?, 
         latitude = ?, longitude = ?, totalRooms = ?, occupiedRooms = ?, image = ? 
         WHERE id = ?`,
        [
          updatedName, updatedDistrict, updatedAddress, updatedPrice, updatedDesc, 
          updatedLat, updatedLng, updatedRooms, updatedOccupied, updatedImage, id
        ]
      );

      if (facilities !== undefined) {
        await connection.query('DELETE FROM property_facilities WHERE propertyId = ?', [id]);
        if (facilities.length > 0) {
          const facilityValues = facilities.map(fac => [id, fac]);
          await connection.query(
            'INSERT INTO property_facilities (propertyId, facility) VALUES ?', 
            [facilityValues]
          );
        }
      }

      await connection.commit();
      apiCache.invalidatePattern('properties');
      res.json({ message: "Properti berhasil diperbarui!" });
    } catch (err) {
      await connection.rollback();
      console.error("Update property error:", err);
      res.status(500).json({ message: "Gagal memperbarui properti." });
    } finally {
      connection.release();
    }
  });

  router.delete('/properties/:id', authenticateToken, requireRole(['admin', 'landlord', 'owner']), async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { password } = req.body as DeletePropertyBody;
    const authUser = req.user;
    const callerId = authUser?.id;
    const callerRole = authUser?.role;

    if (!password) {
      return res.status(400).json({ message: "Password konfirmasi diperlukan." });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [propRows] = await connection.query<PropertyRow[]>('SELECT * FROM properties WHERE id = ? FOR UPDATE', [id]);
      const property = propRows[0];
      if (!property) {
        await connection.rollback();
        return res.status(404).json({ message: "Properti tidak ditemukan." });
      }

      if (callerRole !== 'admin' && property.ownerId !== callerId) {
        await connection.rollback();
        return res.status(403).json({ message: "Anda bukan pemilik properti ini." });
      }

      // Guard: Prevent deletion of properties with active or pending leases
      const [activeRentals] = await connection.query<RowDataPacket[]>(
        "SELECT COUNT(*) as activeCount FROM rentals WHERE propertyId = ? AND status IN ('active', 'pending')",
        [id]
      );
      if (Number(activeRentals[0]?.activeCount || 0) > 0) {
        await connection.rollback();
        return res.status(409).json({ 
          message: "Properti tidak dapat dihapus karena masih memiliki sewa aktif berjalan atau menunggu pembayaran." 
        });
      }

      // Verify caller's own password
      const [userRows] = await connection.query<UserRow[]>('SELECT password FROM users WHERE id = ?', [callerId]);
      const caller = userRows[0];
      if (!caller || !caller.password || !bcrypt.compareSync(password, caller.password)) {
        await connection.rollback();
        return res.status(401).json({ message: "Password salah." });
      }

      await connection.query('DELETE FROM properties WHERE id = ?', [id]);
      await connection.commit();
      apiCache.invalidatePattern('properties');
      res.json({ message: "Properti berhasil dihapus!" });
    } catch (err) {
      await connection.rollback();
      console.error("Delete property error:", err);
      res.status(500).json({ message: "Gagal menghapus properti." });
    } finally {
      connection.release();
    }
  });
}
