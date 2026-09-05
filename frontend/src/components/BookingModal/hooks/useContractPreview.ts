import { useState } from 'react';
import { ContractPreviewResponse } from '../../../types/index';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export function useContractPreview() {
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<ContractPreviewResponse | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const handleFetchPreview = async (
    propertyId: string,
    durationMonths: number,
    startDate: string,
    tenantNikPassport: string,
    signatureBase64?: string,
    roomId?: string
  ) => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      const res = await fetch(`${API_BASE}/rentals/contract/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          propertyId,
          durationMonths,
          startDate,
          tenantNikPassport,
          signatureBase64: signatureBase64 || undefined,
          roomId: roomId || undefined
        })
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(errData.message || 'Gagal memuat draf kontrak digital.');
      }

      const data = (await res.json()) as ContractPreviewResponse;
      setPreviewData(data);
      setShowPreviewModal(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPreviewError(msg);
    } finally {
      setPreviewLoading(false);
    }
  };

  return {
    previewLoading,
    previewData,
    showPreviewModal,
    setShowPreviewModal,
    previewError,
    handleFetchPreview
  };
}
