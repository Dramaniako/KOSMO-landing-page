import type { Response, Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import {
  previewContractSchema,
  signContractSchema,
  validateBody
} from '../middleware/validation';
import { contractService, ContractServiceError } from '../services/contract.service';

export function registerContractRoutes(router: Router): void {
  // Digital Rental Contract Preview Generator
  router.post(
    '/rentals/contract/preview',
    authenticateToken,
    validateBody(previewContractSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      const authUser = req.user;
      if (!authUser) {
        return res.status(401).json({ message: 'Akses ditolak. Token otentikasi diperlukan.' });
      }

      const signerIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
        req.ip ||
        req.socket.remoteAddress ||
        '127.0.0.1';
      const signerUserAgent = (req.headers['user-agent'] as string) || 'Mozilla/5.0 (KOSMO Secure Client)';

      try {
        const preview = await contractService.generatePreview({
          authUser,
          propertyId: req.body.propertyId,
          durationMonths: req.body.durationMonths,
          startDate: req.body.startDate,
          roomId: req.body.roomId,
          tenantNikPassport: req.body.tenantNikPassport,
          signatureBase64: req.body.signatureBase64,
          rentalId: req.body.rentalId,
          signerIp,
          signerUserAgent
        });

        return res.status(200).json(preview);
      } catch (err: unknown) {
        if (err instanceof ContractServiceError) {
          return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            ...err.details
          });
        }
        console.error('Contract preview error:', err);
        return res.status(500).json({ success: false, message: 'Gagal membuat pratinjau kontrak digital.' });
      }
    }
  );

  // Digital Rental Contract Transactional Signing
  router.post(
    '/rentals/contract/sign',
    authenticateToken,
    validateBody(signContractSchema),
    async (req: AuthenticatedRequest, res: Response) => {
      const authUser = req.user;
      if (!authUser) {
        return res.status(401).json({ message: 'Akses ditolak. Token otentikasi diperlukan.' });
      }

      const signerIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
        req.ip ||
        req.socket.remoteAddress ||
        '127.0.0.1';
      const signerUserAgent = (req.headers['user-agent'] as string) || 'Mozilla/5.0 (KOSMO Secure Client)';

      try {
        const result = await contractService.signContract({
          authUser,
          propertyId: req.body.propertyId,
          durationMonths: req.body.durationMonths,
          startDate: req.body.startDate,
          roomId: req.body.roomId,
          tenantNikPassport: req.body.tenantNikPassport,
          signatureBase64: req.body.signatureBase64,
          rentalId: req.body.rentalId,
          signerIp,
          signerUserAgent
        });

        return res.status(201).json(result);
      } catch (err: unknown) {
        if (err instanceof ContractServiceError) {
          return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            ...err.details
          });
        }
        console.error('Contract sign error:', err);
        return res.status(500).json({ success: false, message: 'Gagal memproses penandatanganan kontrak digital.' });
      }
    }
  );

  router.get(
    '/rentals/:id/contract',
    authenticateToken,
    async (req: AuthenticatedRequest, res: Response) => {
      const { id } = req.params;
      const authUser = req.user;

      if (!authUser) {
        return res.status(401).json({ message: 'Akses ditolak. Token otentikasi diperlukan.' });
      }

      try {
        const { pdfBuffer, contractHash, safeId } = await contractService.getContractPdf(String(id), authUser);

        const isDownload = req.query.download === 'true' || req.query.download === '1';
        const dispositionType = isDownload ? 'attachment' : 'inline';

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `${dispositionType}; filename="kontrak_sewa_${safeId}.pdf"`);
        res.setHeader('X-Contract-Hash', contractHash);
        res.setHeader('Content-Length', pdfBuffer.length.toString());
        res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');

        res.end(pdfBuffer);
      } catch (err: unknown) {
        if (err instanceof ContractServiceError) {
          return res.status(err.statusCode).json({ message: err.message });
        }
        console.error('Get contract PDF error:', err);
        res.status(500).json({ message: 'Gagal membuat dokumen kontrak PDF.' });
      }
    }
  );
}
