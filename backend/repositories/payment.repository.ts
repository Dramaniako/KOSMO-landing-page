import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool } from '../db';

export type PaymentTransactionType = 'initial' | 'renewal';
export type PaymentTransactionStatus = 'pending' | 'settled' | 'cancelled' | 'refund_required';

export interface PaymentTransactionRow extends RowDataPacket {
  order_id: string;
  rental_id: string;
  tx_type: PaymentTransactionType;
  gross_amount: number | string;
  months: number;
  status: PaymentTransactionStatus;
  settled_at: Date | string | null;
  created_at: Date | string;
}

export interface UpsertTransactionInput {
  orderId: string;
  rentalId: string;
  txType: PaymentTransactionType;
  grossAmount: number;
  months: number;
  status?: PaymentTransactionStatus;
}

export class PaymentRepository {
  private defaultPool: Pool;

  constructor(customPool: Pool = pool) {
    this.defaultPool = customPool;
  }

  async findByOrderIdForUpdate(
    orderId: string,
    conn: PoolConnection
  ): Promise<PaymentTransactionRow | undefined> {
    const [rows] = await conn.query<PaymentTransactionRow[]>(
      'SELECT * FROM payment_transactions WHERE order_id = ? FOR UPDATE',
      [orderId]
    );
    return rows[0];
  }

  async upsertPendingTransaction(
    input: UpsertTransactionInput,
    conn: PoolConnection | Pool = this.defaultPool
  ): Promise<void> {
    await conn.query(
      `INSERT INTO payment_transactions (order_id, rental_id, tx_type, gross_amount, months, status)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         gross_amount = VALUES(gross_amount),
         months = VALUES(months)`,
      [
        input.orderId,
        input.rentalId,
        input.txType,
        input.grossAmount,
        input.months,
        input.status || 'pending'
      ]
    );
  }

  async recordFinalTransactionStatus(
    input: UpsertTransactionInput & { status: 'settled' | 'refund_required' },
    conn: PoolConnection
  ): Promise<void> {
    if (input.status === 'settled') {
      await conn.query(
        `INSERT INTO payment_transactions (order_id, rental_id, tx_type, gross_amount, months, status, settled_at)
         VALUES (?, ?, ?, ?, ?, 'settled', NOW())
         ON DUPLICATE KEY UPDATE
           status = 'settled',
           gross_amount = VALUES(gross_amount),
           months = VALUES(months),
           settled_at = COALESCE(settled_at, NOW())`,
        [input.orderId, input.rentalId, input.txType, input.grossAmount, input.months]
      );
    } else {
      await conn.query(
        `INSERT INTO payment_transactions (order_id, rental_id, tx_type, gross_amount, months, status)
         VALUES (?, ?, ?, ?, ?, 'refund_required')
         ON DUPLICATE KEY UPDATE
           status = 'refund_required'`,
        [input.orderId, input.rentalId, input.txType, input.grossAmount, input.months]
      );
    }
  }

  async markPendingInitialTransactionsSettled(
    rentalId: string,
    conn: PoolConnection
  ): Promise<void> {
    await conn.query(
      `UPDATE payment_transactions
       SET status = 'settled', settled_at = COALESCE(settled_at, NOW())
       WHERE rental_id = ? AND tx_type = 'initial' AND status = 'pending'`,
      [rentalId]
    );
  }

  async markTransactionCancelled(
    orderId: string,
    conn: PoolConnection | Pool = this.defaultPool
  ): Promise<void> {
    await conn.query(
      `UPDATE payment_transactions
       SET status = 'cancelled'
       WHERE order_id = ? AND status = 'pending'`,
      [orderId]
    );
  }

  async clearRoomHoldByRentalId(
    rentalId: string,
    conn: PoolConnection | Pool = this.defaultPool
  ): Promise<void> {
    await conn.query(
      `UPDATE rooms
       SET reserved_until = NULL, reserved_by_rental_id = NULL
       WHERE reserved_by_rental_id = ?`,
      [rentalId]
    );
  }
}

export const paymentRepository = new PaymentRepository();
