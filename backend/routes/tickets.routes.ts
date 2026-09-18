import type { Response, Router } from 'express';
import { pool } from '../db';
import { authenticateToken } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import { validateBody, createTicketSchema, updateTicketStatusSchema } from '../middleware/validation';
import { generateId } from '../utils/id';
import type { MaintenanceTicketRow } from '../types/index';
import type { RowDataPacket } from 'mysql2/promise';

interface RentalLookupRow extends RowDataPacket {
  id: string;
  tenantId: string;
  propertyId: string;
  roomId: string | null;
  status: string;
  ownerId: string;
}

interface TicketLookupRow extends RowDataPacket {
  id: string;
  rentalId: string;
  tenantId: string;
  propertyId: string;
  roomId: string | null;
  ownerId: string | null;
  status: string;
  resolvedAt: Date | string | null;
}

export function registerTicketRoutes(router: Router): void {
  /**
   * POST /tickets
   * Authenticated tenant submits a maintenance ticket for their active rental.
   */
  router.post(
    '/tickets',
    authenticateToken,
    validateBody(createTicketSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      const authUser = req.user;
      if (!authUser) {
        return res.status(401).json({ message: 'Otentikasi diperlukan.' });
      }

      if (authUser.role !== 'tenant' && authUser.role !== 'admin') {
        return res.status(403).json({
          message: 'Hanya penyewa yang dapat mengajukan tiket pemeliharaan.'
        });
      }

      const { rentalId, roomId: explicitRoomId, category, title, description, photoUrl } = req.body;

      try {
        const [rentalRows] = await pool.query<RentalLookupRow[]>(
          `SELECT r.id, r.tenantId, r.propertyId, r.roomId, r.status, p.ownerId
           FROM rentals r
           INNER JOIN properties p ON r.propertyId = p.id
           WHERE r.id = ?`,
          [rentalId]
        );

        if (rentalRows.length === 0) {
          return res.status(404).json({ message: 'Data sewa tidak ditemukan.' });
        }

        const rental = rentalRows[0];

        // Ensure tenant only submits tickets for their own rental (unless admin)
        if (authUser.role === 'tenant' && rental.tenantId !== authUser.id) {
          return res.status(403).json({
            message: 'Akses ditolak. Anda hanya dapat mengajukan tiket untuk sewa milik Anda sendiri.'
          });
        }

        if (rental.status !== 'active') {
          return res.status(400).json({
            message: 'Tiket hanya dapat diajukan untuk sewa yang berstatus aktif.'
          });
        }

        const ticketId = generateId('ticket');
        const tenantId = authUser.role === 'admin' ? rental.tenantId : authUser.id;
        const propertyId = rental.propertyId;
        const roomId =
          typeof explicitRoomId === 'string' && explicitRoomId.trim().length > 0
            ? explicitRoomId.trim()
            : rental.roomId || null;
        const cleanPhotoUrl =
          photoUrl && typeof photoUrl === 'string' && photoUrl.trim().length > 0
            ? photoUrl.trim()
            : null;

        await pool.execute(
          `INSERT INTO maintenance_tickets 
            (id, rentalId, tenantId, propertyId, roomId, category, title, description, photoUrl, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
          [ticketId, rental.id, tenantId, propertyId, roomId, category, title.trim(), description.trim(), cleanPhotoUrl]
        );

        const [createdRows] = await pool.query<MaintenanceTicketRow[]>(
          `SELECT 
            t.id, t.rentalId, t.tenantId, t.propertyId, t.roomId,
            t.category, t.title, t.description, t.photoUrl, t.status,
            t.createdAt, t.updatedAt, t.resolvedAt,
            p.name AS propertyName,
            u.name AS tenantName,
            rm.roomNumber
           FROM maintenance_tickets t
           LEFT JOIN properties p ON t.propertyId = p.id
           LEFT JOIN users u ON t.tenantId = u.id
           LEFT JOIN rooms rm ON t.roomId = rm.id
           WHERE t.id = ?`,
          [ticketId]
        );

        return res.status(201).json(createdRows[0]);
      } catch (err) {
        console.error('Submit maintenance ticket error:', err);
        return res.status(500).json({ message: 'Gagal mengajukan tiket pemeliharaan.' });
      }
    }
  );

  /**
   * GET /tickets
   * Role-scoped ticket retrieval:
   * - Tenant: sees their own tickets
   * - Landlord: sees tickets for properties they own
   * - Admin: sees all tickets across the platform
   */
  router.get('/tickets', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: 'Otentikasi diperlukan.' });
    }

    const { status, propertyId } = req.query;

    try {
      let query = `
        SELECT 
          t.id, t.rentalId, t.tenantId, t.propertyId, t.roomId,
          t.category, t.title, t.description, t.photoUrl, t.status,
          t.createdAt, t.updatedAt, t.resolvedAt,
          p.name AS propertyName,
          u.name AS tenantName,
          rm.roomNumber
        FROM maintenance_tickets t
        LEFT JOIN properties p ON t.propertyId = p.id
        LEFT JOIN users u ON t.tenantId = u.id
        LEFT JOIN rooms rm ON t.roomId = rm.id
      `;
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (authUser.role === 'tenant') {
        conditions.push('t.tenantId = ?');
        params.push(authUser.id);
      } else if (authUser.role === 'landlord') {
        conditions.push('p.ownerId = ?');
        params.push(authUser.id);
      } else if (authUser.role === 'admin') {
        // Admin sees all; no base condition required
      } else {
        return res.status(403).json({ message: 'Peran pengguna tidak memiliki akses ke tiket.' });
      }

      if (status && typeof status === 'string') {
        conditions.push('t.status = ?');
        params.push(status);
      }

      if (propertyId && typeof propertyId === 'string') {
        conditions.push('t.propertyId = ?');
        params.push(propertyId);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY t.createdAt DESC';

      const [rows] = await pool.query<MaintenanceTicketRow[]>(query, params);
      return res.json(rows);
    } catch (err) {
      console.error('Get maintenance tickets error:', err);
      return res.status(500).json({ message: 'Gagal memuat daftar tiket pemeliharaan.' });
    }
  });

  /**
   * PATCH /tickets/:id/status
   * Landlord or admin updates the status of a maintenance ticket ('in_progress', 'resolved', 'cancelled').
   */
  router.patch(
    '/tickets/:id/status',
    authenticateToken,
    validateBody(updateTicketStatusSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      const authUser = req.user;
      if (!authUser) {
        return res.status(401).json({ message: 'Otentikasi diperlukan.' });
      }

      if (authUser.role !== 'landlord' && authUser.role !== 'admin') {
        return res.status(403).json({
          message: 'Hanya pemilik properti atau admin yang dapat memperbarui status tiket.'
        });
      }

      const ticketId = req.params.id;
      const { status } = req.body;

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [ticketRows] = await connection.query<TicketLookupRow[]>(
          `SELECT t.id, t.rentalId, t.tenantId, t.propertyId, t.roomId, t.status, t.resolvedAt, p.ownerId
           FROM maintenance_tickets t
           LEFT JOIN properties p ON t.propertyId = p.id
           WHERE t.id = ? FOR UPDATE`,
          [ticketId]
        );

        if (ticketRows.length === 0) {
          await connection.rollback();
          return res.status(404).json({ message: 'Tiket pemeliharaan tidak ditemukan.' });
        }

        const ticket = ticketRows[0];

        if (authUser.role === 'landlord' && ticket.ownerId !== authUser.id) {
          await connection.rollback();
          return res.status(403).json({
            message: 'Akses ditolak. Tiket ini bukan milik properti yang Anda kelola.'
          });
        }

        const resolvedAt =
          status === 'resolved'
            ? ticket.status === 'resolved' && ticket.resolvedAt
              ? new Date(ticket.resolvedAt)
              : new Date()
            : null;

        await connection.execute(
          `UPDATE maintenance_tickets 
           SET status = ?, resolvedAt = ?, updatedAt = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [status, resolvedAt, ticketId]
        );

        await connection.commit();

        const [updatedRows] = await pool.query<MaintenanceTicketRow[]>(
          `SELECT 
            t.id, t.rentalId, t.tenantId, t.propertyId, t.roomId,
            t.category, t.title, t.description, t.photoUrl, t.status,
            t.createdAt, t.updatedAt, t.resolvedAt,
            p.name AS propertyName,
            u.name AS tenantName,
            rm.roomNumber
           FROM maintenance_tickets t
           LEFT JOIN properties p ON t.propertyId = p.id
           LEFT JOIN users u ON t.tenantId = u.id
           LEFT JOIN rooms rm ON t.roomId = rm.id
           WHERE t.id = ?`,
          [ticketId]
        );

        return res.json(updatedRows[0]);
      } catch (err) {
        await connection.rollback();
        console.error('Update maintenance ticket status error:', err);
        return res.status(500).json({ message: 'Gagal memperbarui status tiket pemeliharaan.' });
      } finally {
        connection.release();
      }
    }
  );
}
