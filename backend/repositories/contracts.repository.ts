import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool } from '../db';
import type { PropertyRow } from '../services/transformers';
import type { RentalContractJoinedRow, RoomRow } from '../types/index';
import type { UserRow } from '../routes/auth.routes';
import type { RentalRow } from '../routes/rentals.routes';

export interface InsertContractRentalData {
  rentalId: string;
  tenantId: string;
  propertyId: string;
  roomId?: string | null;
  propertyName: string;
  rentalPrice: number;
  startDateStr: string;
  contractUrl?: string | null;
  contractHash: string;
  signedAtDate: Date;
  signerIp: string;
  signerUserAgent: string;
  tenantNikPassport: string;
  signatureBase64: string;
  adminFee: number;
  duration: number;
}

export class ContractsRepository {
  private defaultPool: Pool;

  constructor(customPool: Pool = pool) {
    this.defaultPool = customPool;
  }

  async findPropertyById(
    propertyId: string,
    conn: PoolConnection | Pool = this.defaultPool,
    forUpdate = false
  ): Promise<PropertyRow | undefined> {
    const sql = `SELECT id, name, address, price, totalRooms, occupiedRooms, ownerId FROM properties WHERE id = ?${
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
    const sql = `SELECT id, propertyId, roomNumber, floor, type, price, status FROM rooms WHERE id = ? AND propertyId = ?${
      forUpdate ? ' FOR UPDATE' : ''
    }`;
    const [rows] = await conn.query<RoomRow[]>(sql, [roomId, propertyId]);
    return rows[0];
  }

  async findAvailableRoom(
    propertyId: string,
    conn: PoolConnection,
    forUpdate = true
  ): Promise<RoomRow | undefined> {
    const sql = `SELECT id, propertyId, roomNumber, floor, type, price, status FROM rooms WHERE propertyId = ? AND status = 'available' ORDER BY roomNumber ASC, id ASC LIMIT 1${
      forUpdate ? ' FOR UPDATE' : ''
    }`;
    const [rows] = await conn.query<RoomRow[]>(sql, [propertyId]);
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

  async findUserById(
    userId: string,
    conn: PoolConnection | Pool = this.defaultPool,
    forUpdate = false
  ): Promise<UserRow | undefined> {
    const sql = `SELECT * FROM users WHERE id = ?${forUpdate ? ' FOR UPDATE' : ''}`;
    const [rows] = await conn.query<UserRow[]>(sql, [userId]);
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

  async insertContractRental(
    data: InsertContractRentalData,
    conn: PoolConnection
  ): Promise<void> {
    const sql = `INSERT INTO rentals (
      id,
      tenantId,
      propertyId,
      roomId,
      propertyName,
      price,
      startDate,
      status,
      document,
      contract_url,
      contract_hash,
      contract_signed_at,
      signer_ip,
      signer_user_agent,
      tenant_nik_passport,
      tenant_signature_data,
      admin_fee_amount,
      duration_months
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    await conn.query(sql, [
      data.rentalId,
      data.tenantId,
      data.propertyId,
      data.roomId || null,
      data.propertyName,
      data.rentalPrice,
      data.startDateStr,
      data.contractUrl || null,
      data.contractUrl || null,
      data.contractHash,
      data.signedAtDate,
      data.signerIp,
      data.signerUserAgent,
      data.tenantNikPassport,
      data.signatureBase64,
      data.adminFee,
      data.duration
    ]);
  }

  async updateRoomOccupied(roomId: string, conn: PoolConnection): Promise<void> {
    await conn.query("UPDATE rooms SET status = 'occupied' WHERE id = ?", [roomId]);
  }

  async incrementPropertyOccupied(propertyId: string, conn: PoolConnection): Promise<void> {
    await conn.query('UPDATE properties SET occupiedRooms = occupiedRooms + 1 WHERE id = ?', [
      propertyId
    ]);
  }

  async findRentalContractJoinedById(
    rentalId: string
  ): Promise<RentalContractJoinedRow | undefined> {
    const sql = `SELECT 
      r.id AS rental_id,
      r.tenantId AS rental_tenant_id,
      r.propertyId AS rental_property_id,
      r.roomId AS rental_room_id,
      rm.roomNumber AS room_number,
      r.propertyName AS rental_property_name,
      r.price AS rental_price,
      r.startDate AS rental_start_date,
      r.status AS rental_status,
      r.document AS rental_document,
      r.contract_url,
      r.contract_hash,
      r.contract_signed_at,
      r.signer_ip,
      r.signer_user_agent,
      r.tenant_nik_passport,
      r.tenant_signature_data,
      r.admin_fee_amount,
      r.duration_months,
      p.name AS property_name,
      p.address AS property_address,
      p.price AS property_price,
      p.ownerId AS property_owner_id,
      u.name AS tenant_name,
      u.email AS tenant_email,
      u.phone AS tenant_phone,
      u.address AS tenant_address,
      u.occupation AS tenant_occupation,
      u.emergency_contact_name AS tenant_emergency_contact_name,
      u.emergency_contact_phone AS tenant_emergency_contact_phone,
      u.emergency_contact_relation AS tenant_emergency_contact_relation,
      l.name AS landlord_name,
      l.email AS landlord_email,
      l.phone AS landlord_phone
    FROM rentals r
    LEFT JOIN properties p ON r.propertyId = p.id
    LEFT JOIN rooms rm ON r.roomId = rm.id
    LEFT JOIN users u ON r.tenantId = u.id
    LEFT JOIN users l ON p.ownerId = l.id
    WHERE r.id = ?`;

    const [rows] = await this.defaultPool.query<RentalContractJoinedRow[]>(sql, [rentalId]);
    return rows[0];
  }
}

export const contractsRepository = new ContractsRepository();
