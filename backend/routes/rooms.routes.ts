import type { Request, Response, Router } from 'express';
import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2/promise';
import { pool, syncPropertyRoomCounts } from '../db';
import { apiCache } from '../services/cache';
import { authenticateToken, requireRole } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import {
  createRoomSchema,
  updateRoomSchema,
  updateRoomStatusSchema,
  deleteRoomSchema,
  validateBody
} from '../middleware/validation';
import { generateId } from '../utils/id';
import type {
  Room,
  RoomRow,
  PropertyPhoto,
  PropertyPhotoRow,
  DiscreteRoomStatus
} from '../types/index';
import type { UserRow } from './auth.routes';
import type { PropertyRow } from '../services/transformers';

interface RoomWithPropertyRow extends RowDataPacket {
  id: string;
  propertyId: string;
  roomNumber: string;
  floor: number;
  type: string;
  price: number | null;
  status: DiscreteRoomStatus;
  createdAt: Date | string;
  updatedAt: Date | string;
  ownerId: string;
  propertyPrice: number;
}

interface ActiveCountRow extends RowDataPacket {
  activeCount: number;
}

interface CountRow extends RowDataPacket {
  count: number;
}

function formatRoomResponse(
  room: {
    id: string;
    propertyId: string;
    roomNumber: string;
    floor: number;
    type: string;
    price: number | null;
    status: DiscreteRoomStatus;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  },
  basePropertyPrice: number,
  photos: PropertyPhoto[] = []
): Room {
  const numPrice = room.price !== null && room.price !== undefined ? Number(room.price) : null;
  const effectivePrice = numPrice !== null && numPrice > 0 ? numPrice : Number(basePropertyPrice || 0);

  return {
    id: String(room.id),
    propertyId: String(room.propertyId),
    roomNumber: String(room.roomNumber),
    floor: Number(room.floor),
    type: String(room.type),
    price: numPrice,
    effectivePrice,
    status: room.status,
    photos,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt
  };
}

export function registerRoomRoutes(router: Router): void {
  // -------------------------------------------------------------------------
  // 1. GET /api/properties/:id/rooms
  // -------------------------------------------------------------------------
  router.get('/properties/:id/rooms', async (req: Request<{ id: string }>, res: Response) => {
    const { id } = req.params;
    const statusQuery = typeof req.query.status === 'string' ? req.query.status.toLowerCase().trim() : 'all';

    if (statusQuery !== 'all' && !['available', 'occupied', 'maintenance'].includes(statusQuery)) {
      return res.status(400).json({
        message: "Parameter status tidak valid. Gunakan 'all', 'available', 'occupied', atau 'maintenance'."
      });
    }

    const cacheKey = `properties:${id}:rooms:${statusQuery}`;
    const cached = apiCache.get<Room[]>(cacheKey);
    if (cached) {
      res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
      return res.json(cached);
    }

    try {
      const [propRows] = await pool.query<PropertyRow[]>(
        'SELECT id, price FROM properties WHERE id = ?',
        [id]
      );
      if (propRows.length === 0) {
        return res.status(404).json({ message: 'Properti tidak ditemukan.' });
      }
      const basePropertyPrice = Number(propRows[0].price || 0);

      let sql = `
        SELECT id, propertyId, roomNumber, floor, type, price, status, createdAt, updatedAt
        FROM rooms
        WHERE propertyId = ?
      `;
      const params: (string | number)[] = [id];

      if (statusQuery !== 'all') {
        sql += ' AND status = ?';
        params.push(statusQuery);
      }
      sql += ' ORDER BY floor ASC, CAST(roomNumber AS UNSIGNED) ASC, roomNumber ASC';

      const [roomRows] = await pool.query<RoomRow[]>(sql, params);

      // Fetch room photos
      const [photoRows] = await pool.query<PropertyPhotoRow[]>(
        `SELECT id, propertyId, roomId, url, publicId, category, caption, orderIndex, createdAt
         FROM property_photos
         WHERE propertyId = ? AND roomId IS NOT NULL
         ORDER BY orderIndex ASC`,
        [id]
      );

      const photosByRoomId = new Map<string, PropertyPhoto[]>();
      for (const p of photoRows) {
        if (p.roomId) {
          const list = photosByRoomId.get(p.roomId) || [];
          list.push({
            id: p.id,
            propertyId: p.propertyId,
            roomId: p.roomId,
            url: p.url,
            publicId: p.publicId,
            category: p.category,
            caption: p.caption,
            orderIndex: Number(p.orderIndex),
            createdAt: p.createdAt,
            updatedAt: p.updatedAt || p.createdAt
          });
          photosByRoomId.set(p.roomId, list);
        }
      }

      const formattedRooms = roomRows.map((r) =>
        formatRoomResponse(r, basePropertyPrice, photosByRoomId.get(r.id) || [])
      );

      apiCache.set(cacheKey, formattedRooms, 30);
      res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
      return res.json(formattedRooms);
    } catch (err: unknown) {
      console.error('GET /api/properties/:id/rooms error:', err);
      return res.status(500).json({ message: 'Gagal mengambil daftar kamar properti.' });
    }
  });

  // -------------------------------------------------------------------------
  // Direct GET /api/rooms/:roomId
  // -------------------------------------------------------------------------
  router.get('/rooms/:roomId', async (req: Request<{ roomId: string }>, res: Response) => {
    const { roomId } = req.params;
    try {
      const [rows] = await pool.query<RoomWithPropertyRow[]>(
        `SELECT r.*, p.ownerId, p.price as propertyPrice
         FROM rooms r
         JOIN properties p ON r.propertyId = p.id
         WHERE r.id = ?`,
        [roomId]
      );
      if (rows.length === 0) {
        return res.status(404).json({ message: 'Kamar tidak ditemukan.' });
      }
      const room = rows[0];

      const [photos] = await pool.query<PropertyPhotoRow[]>(
        'SELECT * FROM property_photos WHERE roomId = ? ORDER BY orderIndex ASC',
        [roomId]
      );

      return res.json(
        formatRoomResponse(
          room,
          room.propertyPrice,
          photos.map((p) => ({
            id: p.id,
            propertyId: p.propertyId,
            roomId: p.roomId,
            url: p.url,
            publicId: p.publicId,
            category: p.category,
            caption: p.caption,
            orderIndex: Number(p.orderIndex),
            createdAt: p.createdAt,
            updatedAt: p.updatedAt
          }))
        )
      );
    } catch (err: unknown) {
      console.error('GET /api/rooms/:roomId error:', err);
      return res.status(500).json({ message: 'Gagal mengambil detail kamar.' });
    }
  });

  // -------------------------------------------------------------------------
  // 2. POST /api/properties/:id/rooms
  // -------------------------------------------------------------------------
  router.post(
    '/properties/:id/rooms',
    authenticateToken,
    requireRole(['admin', 'landlord', 'owner']),
    validateBody(createRoomSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      const propertyId = String(req.params.id);
      const { roomNumber, floor, type, price, status } = req.body;
      const authUser = req.user;

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [propRows] = await connection.query<PropertyRow[]>(
          'SELECT id, ownerId, price FROM properties WHERE id = ? FOR UPDATE',
          [propertyId]
        );
        if (propRows.length === 0) {
          await connection.rollback();
          return res.status(404).json({ message: 'Properti tidak ditemukan.' });
        }
        const property = propRows[0];

        if (authUser?.role !== 'admin' && property.ownerId !== authUser?.id) {
          await connection.rollback();
          return res.status(403).json({ message: 'Akses ditolak. Anda bukan pemilik properti ini.' });
        }

        const [existing] = await connection.query<CountRow[]>(
          'SELECT COUNT(*) as count FROM rooms WHERE propertyId = ? AND roomNumber = ? FOR UPDATE',
          [propertyId, roomNumber]
        );
        if (Number(existing[0]?.count || 0) > 0) {
          await connection.rollback();
          return res.status(409).json({ message: 'Nomor kamar sudah terdaftar pada properti ini.' });
        }

        const roomId = generateId('room');
        const numPrice = price !== undefined && price !== null ? Number(price) : null;
        const roomStatus: DiscreteRoomStatus = status || 'available';

        await connection.query(
          `INSERT INTO rooms (id, propertyId, roomNumber, floor, type, price, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [roomId, propertyId, roomNumber, Number(floor), type || 'Standard', numPrice, roomStatus]
        );

        const counts = await syncPropertyRoomCounts(connection, propertyId);

        await connection.commit();
        apiCache.invalidatePattern('properties');

        const createdRoom = formatRoomResponse(
          {
            id: roomId,
            propertyId,
            roomNumber,
            floor: Number(floor),
            type: type || 'Standard',
            price: numPrice,
            status: roomStatus
          },
          property.price,
          []
        );

        return res.status(201).json({
          message: 'Kamar berhasil ditambahkan!',
          room: createdRoom,
          counts
        });
      } catch (err: unknown) {
        await connection.rollback();
        console.error('POST /api/properties/:id/rooms error:', err);
        return res.status(500).json({ message: 'Gagal menambahkan kamar baru.' });
      } finally {
        connection.release();
      }
    }
  );

  // -------------------------------------------------------------------------
  // 3. PUT /api/properties/:id/rooms/:roomId & PUT /api/rooms/:roomId
  // -------------------------------------------------------------------------
  const handleUpdateRoom = async (req: AuthenticatedRequest, res: Response) => {
    const targetRoomId = String(req.params.roomId || req.params.id);
    const targetPropertyId = req.params.id ? String(req.params.id) : null;
    const { roomNumber, floor, type, price, status } = req.body;
    const authUser = req.user;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      let querySql = `
        SELECT r.*, p.ownerId, p.price as propertyPrice
        FROM rooms r
        JOIN properties p ON r.propertyId = p.id
        WHERE r.id = ?
      `;
      const queryParams: string[] = [targetRoomId];
      if (targetPropertyId) {
        querySql += ' AND r.propertyId = ?';
        queryParams.push(targetPropertyId);
      }
      querySql += ' FOR UPDATE';

      const [rows] = await connection.query<RoomWithPropertyRow[]>(querySql, queryParams);
      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Kamar tidak ditemukan.' });
      }
      const existing = rows[0];

      if (authUser?.role !== 'admin' && existing.ownerId !== authUser?.id) {
        await connection.rollback();
        return res.status(403).json({ message: 'Akses ditolak. Anda bukan pemilik properti ini.' });
      }

      if (roomNumber && roomNumber !== existing.roomNumber) {
        const [conflictRows] = await connection.query<CountRow[]>(
          'SELECT COUNT(*) as count FROM rooms WHERE propertyId = ? AND roomNumber = ? AND id != ? FOR UPDATE',
          [existing.propertyId, roomNumber, targetRoomId]
        );
        if (Number(conflictRows[0]?.count || 0) > 0) {
          await connection.rollback();
          return res.status(409).json({ message: 'Nomor kamar sudah digunakan oleh kamar lain.' });
        }
      }

      if (status && status !== existing.status && existing.status === 'occupied') {
        const [activeRentals] = await connection.query<ActiveCountRow[]>(
          "SELECT COUNT(*) as activeCount FROM rentals WHERE roomId = ? AND status IN ('active', 'pending') FOR UPDATE",
          [targetRoomId]
        );
        if (Number(activeRentals[0]?.activeCount || 0) > 0) {
          await connection.rollback();
          return res.status(409).json({
            message: 'Status kamar tidak dapat diubah karena masih memiliki sewa aktif berjalan.'
          });
        }
      }

      const updatedRoomNumber = roomNumber !== undefined ? roomNumber : existing.roomNumber;
      const updatedFloor = floor !== undefined ? Number(floor) : existing.floor;
      const updatedType = type !== undefined ? type : existing.type;
      const updatedPrice = price !== undefined ? (price !== null ? Number(price) : null) : existing.price;
      const updatedStatus = status !== undefined ? status : existing.status;

      await connection.query(
        `UPDATE rooms SET
           roomNumber = ?,
           floor = ?,
           type = ?,
           price = ?,
           status = ?
         WHERE id = ?`,
        [updatedRoomNumber, updatedFloor, updatedType, updatedPrice, updatedStatus, targetRoomId]
      );

      const counts = await syncPropertyRoomCounts(connection, existing.propertyId);

      await connection.commit();
      apiCache.invalidatePattern('properties');

      const [photos] = await pool.query<PropertyPhotoRow[]>(
        'SELECT * FROM property_photos WHERE roomId = ? ORDER BY orderIndex ASC',
        [targetRoomId]
      );

      return res.json({
        message: 'Kamar berhasil diperbarui!',
        room: formatRoomResponse(
          {
            id: targetRoomId,
            propertyId: existing.propertyId,
            roomNumber: updatedRoomNumber,
            floor: updatedFloor,
            type: updatedType,
            price: updatedPrice,
            status: updatedStatus
          },
          existing.propertyPrice,
          photos.map((p) => ({
            id: p.id,
            propertyId: p.propertyId,
            roomId: p.roomId,
            url: p.url,
            publicId: p.publicId,
            category: p.category,
            caption: p.caption,
            orderIndex: Number(p.orderIndex),
            createdAt: p.createdAt,
            updatedAt: p.updatedAt
          }))
        ),
        counts
      });
    } catch (err: unknown) {
      await connection.rollback();
      console.error('PUT room error:', err);
      return res.status(500).json({ message: 'Gagal memperbarui data kamar.' });
    } finally {
      connection.release();
    }
  };

  router.put(
    '/properties/:id/rooms/:roomId',
    authenticateToken,
    requireRole(['admin', 'landlord', 'owner']),
    validateBody(updateRoomSchema),
    handleUpdateRoom
  );
  router.put(
    '/rooms/:roomId',
    authenticateToken,
    requireRole(['admin', 'landlord', 'owner']),
    validateBody(updateRoomSchema),
    handleUpdateRoom
  );

  // -------------------------------------------------------------------------
  // 4. PATCH /api/properties/:id/rooms/:roomId/status & PATCH /api/rooms/:roomId/status
  // -------------------------------------------------------------------------
  const handleToggleRoomStatus = async (req: AuthenticatedRequest, res: Response) => {
    const targetRoomId = String(req.params.roomId || req.params.id);
    const targetPropertyId = req.params.id ? String(req.params.id) : null;
    const { status } = req.body as { status: DiscreteRoomStatus };
    const authUser = req.user;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      let querySql = `
        SELECT r.id, r.propertyId, r.roomNumber, r.floor, r.type, r.price, r.status, p.ownerId, p.price as propertyPrice
        FROM rooms r
        JOIN properties p ON r.propertyId = p.id
        WHERE r.id = ?
      `;
      const queryParams: string[] = [targetRoomId];
      if (targetPropertyId) {
        querySql += ' AND r.propertyId = ?';
        queryParams.push(targetPropertyId);
      }
      querySql += ' FOR UPDATE';

      const [rows] = await connection.query<RoomWithPropertyRow[]>(querySql, queryParams);
      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Kamar tidak ditemukan.' });
      }
      const existing = rows[0];

      if (authUser?.role !== 'admin' && existing.ownerId !== authUser?.id) {
        await connection.rollback();
        return res.status(403).json({ message: 'Akses ditolak. Anda bukan pemilik properti ini.' });
      }

      if (existing.status === 'occupied') {
        const [activeRentals] = await connection.query<ActiveCountRow[]>(
          "SELECT COUNT(*) as activeCount FROM rentals WHERE roomId = ? AND status IN ('active', 'pending') FOR UPDATE",
          [targetRoomId]
        );
        if (Number(activeRentals[0]?.activeCount || 0) > 0) {
          await connection.rollback();
          return res.status(409).json({
            message: 'Kamar sedang memiliki sewa aktif berjalan dan tidak dapat diubah statusnya.'
          });
        }
      }

      await connection.query('UPDATE rooms SET status = ? WHERE id = ?', [status, targetRoomId]);

      const counts = await syncPropertyRoomCounts(connection, existing.propertyId);

      await connection.commit();
      apiCache.invalidatePattern('properties');

      return res.json({
        message: 'Status kamar berhasil diperbarui',
        room: formatRoomResponse(
          {
            id: targetRoomId,
            propertyId: existing.propertyId,
            roomNumber: existing.roomNumber,
            floor: existing.floor,
            type: existing.type,
            price: existing.price,
            status
          },
          existing.propertyPrice,
          []
        ),
        counts
      });
    } catch (err: unknown) {
      await connection.rollback();
      console.error('PATCH room status error:', err);
      return res.status(500).json({ message: 'Gagal memperbarui status kamar.' });
    } finally {
      connection.release();
    }
  };

  router.patch(
    '/properties/:id/rooms/:roomId/status',
    authenticateToken,
    requireRole(['admin', 'landlord', 'owner']),
    validateBody(updateRoomStatusSchema),
    handleToggleRoomStatus
  );
  router.patch(
    '/rooms/:roomId/status',
    authenticateToken,
    requireRole(['admin', 'landlord', 'owner']),
    validateBody(updateRoomStatusSchema),
    handleToggleRoomStatus
  );

  // -------------------------------------------------------------------------
  // 5. DELETE /api/properties/:id/rooms/:roomId & DELETE /api/rooms/:roomId
  // -------------------------------------------------------------------------
  const handleDeleteRoom = async (req: AuthenticatedRequest, res: Response) => {
    const targetRoomId = String(req.params.roomId || req.params.id);
    const targetPropertyId = req.params.id ? String(req.params.id) : null;
    const { password } = req.body;
    const authUser = req.user;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      let querySql = `
        SELECT r.id, r.propertyId, r.roomNumber, r.status, p.ownerId
        FROM rooms r
        JOIN properties p ON r.propertyId = p.id
        WHERE r.id = ?
      `;
      const queryParams: string[] = [targetRoomId];
      if (targetPropertyId) {
        querySql += ' AND r.propertyId = ?';
        queryParams.push(targetPropertyId);
      }
      querySql += ' FOR UPDATE';

      const [rows] = await connection.query<RoomWithPropertyRow[]>(querySql, queryParams);
      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Kamar tidak ditemukan.' });
      }
      const room = rows[0];

      if (authUser?.role !== 'admin' && room.ownerId !== authUser?.id) {
        await connection.rollback();
        return res.status(403).json({ message: 'Akses ditolak. Anda bukan pemilik properti ini.' });
      }

      // Password Confirmation Gate
      const [userRows] = await connection.query<UserRow[]>('SELECT password FROM users WHERE id = ?', [authUser?.id]);
      const caller = userRows[0];
      if (!caller || !caller.password || !bcrypt.compareSync(password, caller.password)) {
        await connection.rollback();
        return res.status(401).json({ message: 'Password salah.' });
      }

      // Occupancy Guard
      if (room.status === 'occupied') {
        await connection.rollback();
        return res.status(400).json({
          message: 'Kamar tidak dapat dihapus karena saat ini sedang terisi (occupied).'
        });
      }

      const [activeRentals] = await connection.query<ActiveCountRow[]>(
        "SELECT COUNT(*) as activeCount FROM rentals WHERE roomId = ? AND status IN ('active', 'pending') FOR UPDATE",
        [targetRoomId]
      );
      if (Number(activeRentals[0]?.activeCount || 0) > 0) {
        await connection.rollback();
        return res.status(400).json({
          message: 'Kamar tidak dapat dihapus karena masih memiliki sewa aktif berjalan.'
        });
      }

      // Delete room (cascades to property_photos with roomId)
      await connection.query('DELETE FROM rooms WHERE id = ?', [targetRoomId]);

      const counts = await syncPropertyRoomCounts(connection, room.propertyId);

      await connection.commit();
      apiCache.invalidatePattern('properties');

      return res.json({
        message: 'Kamar berhasil dihapus!',
        counts
      });
    } catch (err: unknown) {
      await connection.rollback();
      console.error('DELETE room error:', err);
      return res.status(500).json({ message: 'Gagal menghapus kamar.' });
    } finally {
      connection.release();
    }
  };

  router.delete(
    '/properties/:id/rooms/:roomId',
    authenticateToken,
    requireRole(['admin', 'landlord', 'owner']),
    validateBody(deleteRoomSchema),
    handleDeleteRoom
  );
  router.delete(
    '/rooms/:roomId',
    authenticateToken,
    requireRole(['admin', 'landlord', 'owner']),
    validateBody(deleteRoomSchema),
    handleDeleteRoom
  );
}

