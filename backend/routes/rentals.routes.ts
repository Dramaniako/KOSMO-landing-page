import type { Request, Response, Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import { apiCache } from '../services/cache';
import {
  validateBody,
  terminateRentalSchema,
  createRentalSchema,
  renewRentalTokenSchema
} from '../middleware/validation';
import {
  rentalService,
  RentalServiceError,
  type PaymentSchedule
} from '../services/rental.service';
import type { RentalRow } from '../repositories/rentals.repository';

export type { RentalRow };
export type { PaymentSchedule };
export const computePaymentSchedule = rentalService.computePaymentSchedule.bind(rentalService);

export function registerRentalRoutes(router: Router): void {
  router.get('/rentals', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: 'Otentikasi diperlukan.' });
    }

    const { tenantId } = req.query;
    const limitParam = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const pageParam = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const offsetParam = req.query.offset
      ? parseInt(String(req.query.offset), 10)
      : limitParam
      ? (pageParam - 1) * limitParam
      : 0;

    res.setHeader('Cache-Control', 'private, max-age=15');

    const cacheKey = `rentals:${authUser.id}:${tenantId ? String(tenantId) : 'all'}:${limitParam || 'all'}:${offsetParam}`;
    const cached = apiCache.get<RentalRow[]>(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    try {
      const rentals = await rentalService.getRentals(
        authUser,
        tenantId ? String(tenantId) : undefined,
        limitParam,
        offsetParam
      );
      apiCache.set(cacheKey, rentals, 15);
      res.json(rentals);
    } catch (err: unknown) {
      if (err instanceof RentalServiceError) {
        return res.status(err.statusCode).json({ message: err.message, ...err.details });
      }
      console.error('Get rentals error:', err);
      res.status(500).json({ message: 'Gagal mengambil data sewa.' });
    }
  });

  router.get('/tenant/rentals', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: 'Otentikasi diperlukan.' });
    }

    const tenantId =
      authUser.role === 'admin' && req.query.tenantId
        ? String(req.query.tenantId)
        : authUser.id;
    if (!tenantId) {
      return res.status(400).json({ message: 'tenantId diperlukan.' });
    }

    try {
      const rentals = await rentalService.getTenantRentals(tenantId);
      res.json(rentals);
    } catch (err: unknown) {
      if (err instanceof RentalServiceError) {
        return res.status(err.statusCode).json({ message: err.message, ...err.details });
      }
      console.error('Get tenant rentals error:', err);
      res.status(500).json({ message: 'Gagal mengambil data sewa tenant.' });
    }
  });

  router.get('/rentals/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: 'Otentikasi diperlukan.' });
    }

    try {
      const rental = await rentalService.getRentalById(String(id), authUser);
      res.json(rental);
    } catch (err: unknown) {
      if (err instanceof RentalServiceError) {
        return res.status(err.statusCode).json({ message: err.message, ...err.details });
      }
      console.error('Get rental detail error:', err);
      res.status(500).json({ message: 'Gagal mengambil detail sewa.' });
    }
  });

  router.post('/rentals', authenticateToken, validateBody(createRentalSchema), async (req: AuthenticatedRequest, res: Response) => {
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: 'Otentikasi diperlukan.' });
    }

    const { tenantId, propertyId, propertyName, price, durationMonths, signature, roomId } = req.body;

    try {
      const result = await rentalService.createBooking({
        authUser,
        tenantId,
        propertyId,
        propertyName,
        price,
        durationMonths,
        signature,
        roomId,
        rentalId: req.body.rentalId
      });

      apiCache.invalidatePattern('rentals');
      const statusCode = result.message.includes('sudah aktif') ? 200 : 201;
      res.status(statusCode).json(result);
    } catch (err: unknown) {
      if (err instanceof RentalServiceError) {
        return res.status(err.statusCode).json({ message: err.message, ...err.details });
      }
      console.error('Create rental error:', err);
      res.status(500).json({ message: 'Gagal membuat penyewaan kos.' });
    }
  });

  router.post('/rentals/:id/terminate', authenticateToken, validateBody(terminateRentalSchema), async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const authUser = req.user;
    if (!authUser) {
      return res.status(401).json({ message: 'Otentikasi diperlukan.' });
    }

    const { password } = req.body;

    try {
      const result = await rentalService.terminateRental(String(id), authUser, password);
      apiCache.invalidatePattern('rentals');
      res.json(result);
    } catch (err: unknown) {
      if (err instanceof RentalServiceError) {
        return res.status(err.statusCode).json({ message: err.message, ...err.details });
      }
      console.error('Terminate rental error:', err);
      res.status(500).json({ message: 'Gagal memberhentikan sewa kos.' });
    }
  });

  router.post(
    '/rentals/:id/renew-token',
    authenticateToken,
    validateBody(renewRentalTokenSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      const { id } = req.params;
      const authUser = req.user;
      if (!authUser) {
        return res.status(401).json({ message: 'Otentikasi diperlukan.' });
      }

      const months = req.body?.months ? Number(req.body.months) : 1;

      try {
        const result = await rentalService.createRenewalToken(String(id), authUser, months);
        return res.status(200).json(result);
      } catch (err: unknown) {
        if (err instanceof RentalServiceError) {
          return res.status(err.statusCode).json({ message: err.message, ...err.details });
        }
        console.error('Renew rental token error:', err);
        return res.status(500).json({ message: 'Gagal membuat token perpanjangan sewa.' });
      }
    }
  );
}
