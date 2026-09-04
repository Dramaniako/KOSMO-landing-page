import express from 'express';
import type { Router } from 'express';

// Middleware & Auth Re-exports
export {
  generateJwtToken,
  verifyJwtToken,
  authenticateToken,
  requireRole
} from './middleware/auth';
export type { JWTPayload, AuthenticatedRequest } from './middleware/auth';

// Domain Route Registrations & Re-exports
import {
  registerSystemRoutes,
  uploadLimiter,
  ALLOWED_IMAGE_MIMETYPES,
  validateImageMimeType
} from './routes/system.routes';

import {
  registerAuthRoutes,
  authLimiter,
  formatSafeUser
} from './routes/auth.routes';

import { registerUserRoutes } from './routes/users.routes';
import { registerPropertyRoutes } from './routes/properties.routes';
import { registerReviewRoutes } from './routes/reviews.routes';
import { registerLandlordRoutes } from './routes/landlord.routes';

import {
  registerTrackingRoutes,
  trackingLimiter
} from './routes/tracking.routes';

import { registerContractRoutes } from './routes/contracts.routes';

import {
  registerRentalRoutes,
  computePaymentSchedule,
  type PaymentSchedule
} from './routes/rentals.routes';

import {
  registerPaymentRoutes,
  isMidtransConfigured,
  snap,
  verifyMidtransSignature,
  settleRentalPayment
} from './routes/payment.routes';

export {
  authLimiter,
  uploadLimiter,
  trackingLimiter,
  ALLOWED_IMAGE_MIMETYPES,
  validateImageMimeType,
  formatSafeUser,
  PaymentSchedule,
  computePaymentSchedule,
  isMidtransConfigured,
  snap,
  verifyMidtransSignature,
  settleRentalPayment
};

const router: Router = express.Router();

registerSystemRoutes(router);
registerAuthRoutes(router);
registerUserRoutes(router);
registerPropertyRoutes(router);
registerReviewRoutes(router);
registerLandlordRoutes(router);
registerTrackingRoutes(router);
registerContractRoutes(router);
registerRentalRoutes(router);
registerPaymentRoutes(router);

export default router;
