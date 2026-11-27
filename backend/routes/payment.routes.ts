import type { Request, Response, Router } from 'express';
import { pool } from '../db';
import { authenticateToken } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { RentalRow } from './rentals.routes';
import {
  validateBody,
  createPaymentTokenSchema,
  paymentNotificationSchema
} from '../middleware/validation';
import { mutationLimiter } from '../middleware/rateLimiter';
import {
  snap,
  isLockContentionError,
  isMidtransConfigured,
  fetchMidtransTransactionStatus,
  configureSnapClient,
  getSnapRedirectUrl,
  assertMidtransProductionConfig,
  verifyMidtransSignature,
  extractOrderRentalId,
  createPaymentToken,
  settleRentalPayment,
  handleMidtransWebhookCancellation,
  type MySQLErrorLike,
  type MidtransStatusResponse
} from '../services/payment.service';

export {
  snap,
  isLockContentionError,
  isMidtransConfigured,
  fetchMidtransTransactionStatus,
  configureSnapClient,
  getSnapRedirectUrl,
  assertMidtransProductionConfig,
  verifyMidtransSignature,
  extractOrderRentalId,
  settleRentalPayment,
  type MySQLErrorLike,
  type MidtransStatusResponse
};

interface MidtransWebhookBody {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
  transaction_status?: string;
  fraud_status?: string;
  payment_type?: string;
}

const handlePaymentNotification = async (
  req: Request<Record<string, never>, unknown, MidtransWebhookBody>,
  res: Response
) => {
  const isProduction =
    (process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)) &&
    process.env.NODE_ENV !== 'test';
  const hasMidtransConfig = isMidtransConfigured();

  if (!hasMidtransConfig && isProduction) {
    return res.status(500).json({
      message: 'Midtrans server key belum dikonfigurasi pada server produksi.'
    });
  }

  const {
    order_id,
    status_code,
    gross_amount,
    signature_key,
    transaction_status,
    fraud_status
  } = req.body;

  if (!order_id || !status_code || !gross_amount || !signature_key) {
    return res.status(400).json({ message: 'Data notifikasi tidak lengkap.' });
  }

  const serverKey = process.env.MIDTRANS_SERVER_KEY || 'SB-Mid-server-placeholder';
  const isValidSignature = verifyMidtransSignature(
    order_id,
    status_code,
    gross_amount,
    serverKey,
    signature_key
  );

  if (!isValidSignature) {
    return res.status(403).json({ message: 'Signature Midtrans tidak valid.' });
  }

  const isSettlement = transaction_status === 'settlement';
  const isCaptureSuccess = transaction_status === 'capture' && fraud_status === 'accept';

  if (isSettlement || isCaptureSuccess) {
    const paidAmount = parseFloat(gross_amount);
    const result = await settleRentalPayment(
      order_id,
      isNaN(paidAmount) ? undefined : paidAmount,
      { isWebhook: true }
    );
    return res
      .status(result.statusCode || (result.success ? 200 : 400))
      .json({ message: result.message });
  }

  if (
    transaction_status === 'cancel' ||
    transaction_status === 'deny' ||
    transaction_status === 'expire'
  ) {
    try {
      const msg = await handleMidtransWebhookCancellation(order_id, transaction_status);
      return res.json({ message: msg });
    } catch (err: unknown) {
      console.error('Cancel rental error:', err);
      return res.status(500).json({ message: 'Gagal memperbarui status transaksi.' });
    }
  }

  res.json({ message: 'Status notifikasi diterima.' });
};

export function registerPaymentRoutes(router: Router): void {
  router.post(
    '/payment/token',
    authenticateToken,
    mutationLimiter,
    validateBody(createPaymentTokenSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      const { propertyId, durationMonths, roomId, tenantId, customRentalId, rentalId, startDate } =
        req.body as {
          propertyId?: string;
          durationMonths?: number;
          roomId?: string | null;
          tenantId?: string;
          customRentalId?: string;
          rentalId?: string;
          startDate?: string;
        };

      const result = await createPaymentToken({
        authUser: req.user,
        propertyId,
        durationMonths,
        roomId,
        tenantId,
        customRentalId,
        rentalId,
        startDate
      });
      return res.status(result.statusCode).json(result.body);
    }
  );

  router.post('/payment/webhook', validateBody(paymentNotificationSchema), handlePaymentNotification);
  router.post('/payment/notification', validateBody(paymentNotificationSchema), handlePaymentNotification);

  router.post('/payment/finish', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const { rentalId, orderId } = req.body as { rentalId?: string; orderId?: string };
    const authUser = req.user;

    const rawIdentifier =
      typeof orderId === 'string' && orderId.trim() !== ''
        ? orderId.trim()
        : typeof rentalId === 'string' && rentalId.trim() !== ''
          ? rentalId.trim()
          : '';

    if (!rawIdentifier) {
      return res.status(400).json({ success: false, message: 'rentalId wajib diisi.' });
    }

    const { rentalId: resolvedRentalId } = extractOrderRentalId(
      typeof rentalId === 'string' && rentalId.trim() !== '' ? rentalId.trim() : rawIdentifier
    );

    try {
      const [rows] = await pool.query<RentalRow[]>('SELECT * FROM rentals WHERE id = ?', [
        resolvedRentalId
      ]);
      const rental = rows[0];
      if (!rental) {
        return res.status(404).json({ success: false, message: 'Data sewa tidak ditemukan.' });
      }

      if (authUser?.role !== 'admin' && authUser?.id !== rental.tenantId) {
        return res.status(403).json({ success: false, message: 'Akses ditolak ke data sewa ini.' });
      }

      const result = await settleRentalPayment(rawIdentifier);
      if (!result.success) {
        return res.status(result.statusCode || 400).json({ success: false, message: result.message });
      }

      return res.status(200).json({
        success: true,
        message: result.message,
        rentalId: resolvedRentalId
      });
    } catch (err: unknown) {
      console.error('Payment finish route error:', err);
      return res
        .status(500)
        .json({ success: false, message: 'Gagal menyelesaikan transaksi pembayaran.' });
    }
  });
}
