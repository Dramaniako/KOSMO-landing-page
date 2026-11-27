import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool } from '../db';
import type { PropertyRow } from '../services/transformers';
import type { RoomRow } from '../types/index';
import type { UserRow } from '../routes/auth.routes';

export interface RentalRow extends RowDataPacket {
  id: string;
  tenantId: string;
  propertyId: string;
  roomId?: string | null;
  roomNumber?: string | null;
  roomFloor?: number | null;
  roomType?: string | null;
  propertyName?: string;
  price?: number;
  startDate?: string;
  status: 'active' | 'terminated' | 'pending' | 'cancelled';
  duration_months?: number;
  contract_url?: string;
  contract_hash?: string;
  contract_signed_at?: Date | string;
  signer_ip?: string;
  signer_user_agent?: string;
  tenant_nik_passport?: string;
  tenant_signature_data?: string;
  admin_fee_amount?: number;
  document?: string;
}

export interface InsertRentalBookingData {
  id: string;
  tenantId: string;
  propertyId: string;
  roomId?: string | null;
  propertyName: string;
  price: number;
  startDate: string;
  status: 'active' | 'pending';
  document: string;
  durationMonths: number;
}

export class RentalsRepository {
  private defaultPool: Pool;

  constructor(customPool: Pool = pool) {
    this.defaultPool = customPool;
  }

  async findRentalsByFilter(
    role: string,
    userId: string,
    tenantIdFilter?: string,
    limit?: number,
    offset = 0
  ): Promise<RentalRow[]> {
    let sql = `
      SELECT 
        r.*,
        rm.roomNumber,
        rm.floor AS roomFloor,
        rm.type AS roomType
      FROM rentals r
      LEFT JOIN rooms rm ON r.roomId = rm.id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (role === 'tenant') {
      sql += ' AND r.tenantId = ?';
      params.push(userId);
    } else if (role === 'landlord') {
      sql += ' AND r.propertyId IN (SELECT id FROM properties WHERE ownerId = ?)';
      params.push(userId);
    } else if (role === 'admin' && tenantIdFilter) {
      sql += ' AND r.tenantId = ?';
      params.push(tenantIdFilter);
    }
    sql += ' ORDER BY r.id DESC';

    if (limit && limit > 0) {
      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, Math.max(0, offset));
    }

    const [rows] = await this.defaultPool.query<RentalRow[]>(sql, params);
    return rows;
  }

  async findTenantRentals(tenantId: string): Promise<RentalRow[]> {
    const sql = `
      SELECT 
        r.*,
        rm.roomNumber,
        rm.floor AS roomFloor,
        rm.type AS roomType
      FROM rentals r
      LEFT JOIN rooms rm ON r.roomId = rm.id
      WHERE r.tenantId = ? 
      ORDER BY r.id DESC
    `;
    const [rows] = await this.defaultPool.query<RentalRow[]>(sql, [tenantId]);
    return rows;
  }

  async findRentalById(
    rentalId: string,
    conn: PoolConnection | Pool = this.defaultPool,
    forUpdate = false
  ): Promise<RentalRow | undefined> {
    const sql = `
      SELECT 
        r.*,
        p.name AS propertyName,
        p.address AS propertyAddress,
        p.ownerId AS propertyOwnerId,
        rm.roomNumber,
        rm.floor AS roomFloor,
        rm.type AS roomType
      FROM rentals r
      LEFT JOIN properties p ON r.propertyId = p.id
      LEFT JOIN rooms rm ON r.roomId = rm.id
      WHERE r.id = ?${forUpdate ? ' FOR UPDATE' : ''}
    `;
    const [rows] = await conn.query<RentalRow[]>(sql, [rentalId]);
    return rows[0];
  }

  async findExistingRentalForUpdate(
    rentalId: string,
    conn: PoolConnection
  ): Promise<RentalRow | undefined> {
    const [rows] = await conn.query<RentalRow[]>(
      'SELECT id, status, document, roomId, propertyId, price, duration_months FROM rentals WHERE id = ? FOR UPDATE',
      [rentalId]
    );
    return rows[0];
  }

  async findActiveRentalsByTenantId(
    tenantId: string,
    conn: PoolConnection,
    forUpdate = true
  ): Promise<RentalRow[]> {
    const sql = `SELECT id, propertyName FROM rentals WHERE tenantId = ? AND status = 'active'${
      forUpdate ? ' FOR UPDATE' : ''
    }`;
    const [rows] = await conn.query<RentalRow[]>(sql, [tenantId]);
    return rows;
  }

  async insertRentalBooking(
    data: InsertRentalBookingData,
    conn: PoolConnection
  ): Promise<void> {
    const startDateIso = /^\d{4}-\d{2}-\d{2}$/.test(data.startDate.trim())
      ? data.startDate.trim()
      : null;
    const sql = `
      INSERT INTO rentals (id, tenantId, propertyId, roomId, propertyName, price, startDate, start_date_iso, status, document, duration_months)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    await conn.query(sql, [
      data.id,
      data.tenantId,
      data.propertyId,
      data.roomId || null,
      data.propertyName,
      data.price,
      data.startDate,
      startDateIso,
      data.status,
      data.document,
      data.durationMonths
    ]);
  }

  async updateRentalStatus(
    rentalId: string,
    status: 'active' | 'terminated' | 'cancelled',
    conn: PoolConnection
  ): Promise<void> {
    if (status === 'terminated') {
      await conn.query('UPDATE rentals SET status = ?, terminated_at = NOW() WHERE id = ?', [status, rentalId]);
    } else {
      await conn.query('UPDATE rentals SET status = ? WHERE id = ?', [status, rentalId]);
    }
  }

  async decrementPropertyOccupied(propertyId: string, conn: PoolConnection): Promise<void> {
    await conn.query(
      'UPDATE properties SET occupiedRooms = GREATEST(0, occupiedRooms - 1) WHERE id = ?',
      [propertyId]
    );
  }

  async setRoomStatus(
    roomId: string,
    status: 'available' | 'occupied' | 'maintenance',
    conn: PoolConnection
  ): Promise<void> {
    await conn.query(
      'UPDATE rooms SET status = ?, reserved_until = NULL, reserved_by_rental_id = NULL WHERE id = ?',
      [status, roomId]
    );
  }

  async clearRoomHoldByRentalId(rentalId: string, conn: PoolConnection): Promise<void> {
    await conn.query(
      'UPDATE rooms SET reserved_until = NULL, reserved_by_rental_id = NULL WHERE reserved_by_rental_id = ?',
      [rentalId]
    );
  }

  async creditLandlordBalance(
    ownerId: string,
    revenue: number,
    conn: PoolConnection
  ): Promise<void> {
    await conn.query(
      'UPDATE users SET balance = balance + ?, totalRevenue = totalRevenue + ? WHERE id = ?',
      [revenue, revenue, ownerId]
    );
  }

  async advanceRentalDuration(
    rentalId: string,
    addedMonths: number,
    conn: PoolConnection
  ): Promise<void> {
    await conn.query(
      "UPDATE rentals SET status = 'active', duration_months = COALESCE(duration_months, 1) + ? WHERE id = ?",
      [addedMonths, rentalId]
    );
  }

  async creditLandlordNetBalance(
    ownerId: string,
    netRevenue: number,
    grossRevenue: number,
    conn: PoolConnection
  ): Promise<void> {
    await conn.query(
      'UPDATE users SET balance = balance + ?, totalRevenue = totalRevenue + ? WHERE id = ?',
      [netRevenue, grossRevenue, ownerId]
    );
  }

  async findUserById(
    userId: string,
    conn: PoolConnection | Pool = this.defaultPool,
    forUpdate = false
  ): Promise<UserRow | undefined> {
    const sql = `SELECT * FROM users WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`;
    const [rows] = await conn.query<UserRow[]>(sql, [userId]);
    return rows[0];
  }

  async findUserPasswordById(
    userId: string,
    conn: PoolConnection | Pool = this.defaultPool
  ): Promise<Pick<UserRow, 'password'> | undefined> {
    const [rows] = await conn.query<UserRow[]>('SELECT password FROM users WHERE id = ?', [userId]);
    return rows[0];
  }

  async findPropertyById(
    propertyId: string,
    conn: PoolConnection | Pool = this.defaultPool,
    forUpdate = false
  ): Promise<PropertyRow | undefined> {
    const sql = `SELECT totalRooms, occupiedRooms, price, name, address, ownerId FROM properties WHERE id = ?${
      forUpdate ? ' FOR UPDATE' : ''
    }`;
    const [rows] = await conn.query<PropertyRow[]>(sql, [propertyId]);
    return rows[0];
  }

  async findRoomById(
    roomId: string,
    propertyId: string,
    conn: PoolConnection | Pool = this.defaultPool,
    forUpdate = false
  ): Promise<RoomRow | undefined> {
    const sql = `SELECT id, propertyId, roomNumber, floor, type, price, status, reserved_until, reserved_by_rental_id,
      GREATEST(0, COALESCE(TIMESTAMPDIFF(SECOND, NOW(), reserved_until), 0)) AS holdRemainingSeconds
      FROM rooms WHERE id = ? AND propertyId = ?${forUpdate ? ' FOR UPDATE' : ''}`;
    const [rows] = await conn.query<RoomRow[]>(sql, [roomId, propertyId]);
    return rows[0];
  }

  async findAvailableRoom(
    propertyId: string,
    conn: PoolConnection,
    forUpdate = true,
    rentalId?: string
  ): Promise<RoomRow | undefined> {
    const holdFilter = rentalId
      ? '(reserved_until IS NULL OR reserved_until <= NOW() OR reserved_by_rental_id IS NULL OR reserved_by_rental_id = ?)'
      : '(reserved_until IS NULL OR reserved_until <= NOW() OR reserved_by_rental_id IS NULL)';
    const params = rentalId ? [propertyId, rentalId] : [propertyId];
    const sql = `SELECT id, propertyId, roomNumber, floor, type, price, status, reserved_until, reserved_by_rental_id,
      GREATEST(0, COALESCE(TIMESTAMPDIFF(SECOND, NOW(), reserved_until), 0)) AS holdRemainingSeconds
      FROM rooms WHERE propertyId = ? AND status = 'available' AND ${holdFilter} ORDER BY roomNumber ASC, id ASC LIMIT 1${
      forUpdate ? ' FOR UPDATE' : ''
    }`;
    const [rows] = await conn.query<RoomRow[]>(sql, params);
    return rows[0];
  }

  async countRoomsByPropertyId(
    propertyId: string,
    conn: PoolConnection | Pool = this.defaultPool
  ): Promise<number> {
    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM rooms WHERE propertyId = ?',
      [propertyId]
    );
    return Number(rows[0]?.count || 0);
  }

  async incrementPropertyOccupied(propertyId: string, conn: PoolConnection): Promise<void> {
    await conn.query('UPDATE properties SET occupiedRooms = occupiedRooms + 1 WHERE id = ?', [
      propertyId
    ]);
  }

  async activateExistingRental(
    rentalId: string,
    effectivePrice: number,
    documentUrl: string,
    duration: number,
    conn: PoolConnection
  ): Promise<void> {
    await conn.query(
      "UPDATE rentals SET status = 'active', price = ?, document = ?, duration_months = ? WHERE id = ?",
      [effectivePrice, documentUrl, duration, rentalId]
    );
  }

  async findRentalSummaryById(
    rentalId: string,
    conn: PoolConnection | Pool = this.defaultPool
  ): Promise<RentalRow | undefined> {
    const [rows] = await conn.query<RentalRow[]>(
      'SELECT id, tenantId, propertyId, roomId, status FROM rentals WHERE id = ?',
      [rentalId]
    );
    return rows[0];
  }

  async findRentalForUpdate(
    rentalId: string,
    conn: PoolConnection
  ): Promise<RentalRow | undefined> {
    const [rows] = await conn.query<RentalRow[]>(
      'SELECT id, tenantId, propertyId, roomId, status FROM rentals WHERE id = ? FOR UPDATE',
      [rentalId]
    );
    return rows[0];
  }

  async lockRoomById(
    roomId: string,
    conn: PoolConnection
  ): Promise<RoomRow | undefined> {
    const [rows] = await conn.query<RoomRow[]>(
      'SELECT id, status FROM rooms WHERE id = ? FOR UPDATE',
      [roomId]
    );
    return rows[0];
  }
}

export const rentalsRepository = new RentalsRepository();
