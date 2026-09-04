import { useState, useCallback } from 'react';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export function useRentalContractDownload() {
  const [contractDownloading, setContractDownloading] = useState<Record<string, boolean>>({});

  const handleOpenContract = useCallback(async (rentalId: string): Promise<void> => {
    setContractDownloading(prev => ({ ...prev, [rentalId]: true }));
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      const res = await fetch(`${API_BASE}/rentals/${rentalId}/contract?download=true`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) {
        throw new Error('Gagal memuat dokumen kontrak PDF.');
      }
      const arrayBuffer = await res.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `kontrak_sewa_${rentalId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal membuka kontrak.';
      alert(msg);
    } finally {
      setContractDownloading(prev => ({ ...prev, [rentalId]: false }));
    }
  }, []);

  return {
    contractDownloading,
    handleOpenContract
  };
}
