import React from 'react';
import { Download } from 'lucide-react';
import { User } from '../../../types/index';
import ThemeLanguageToggle from '../../../components/ThemeLanguageToggle';
import { useTranslation } from '../../../context/LanguageContext';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export interface LandlordHeaderProps {
  landlordUser: User | null;
  onNavigateHome: () => void;
}

export default function LandlordHeader({
  landlordUser,
  onNavigateHome
}: LandlordHeaderProps) {
  const { t } = useTranslation();
  const [downloading, setDownloading] = React.useState(false);

  const handleDownloadExcel = async () => {
    try {
      setDownloading(true);
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token') || '';
      if (!token) {
        throw new Error('Token otentikasi tidak ditemukan.');
      }
      const landlordId = landlordUser?.id || '';
      const url = `${API_BASE}/reports/landlord/excel?landlordId=${encodeURIComponent(landlordId)}`;

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        throw new Error(`Gagal mengunduh laporan (${res.status})`);
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition');
      let filename = `laporan_keuangan_${(landlordUser?.name || 'landlord').replace(/\s+/g, '_')}.xlsx`;
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match && match[1]) {
          filename = match[1].replace(/['"]/g, '');
        }
      }

      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Download error:', err);
      alert('Gagal mengunduh laporan Excel. Silakan coba lagi.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <header style={{ marginBottom: '32px' }} className="flex-between flex-wrap gap-4">
      <div>
        <h1 style={{ fontSize: '28px' }}>
          {t('landlord.title')} &bull; {landlordUser?.name || 'Landlord'}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '2px' }}>
          Pantau laporan transaksi dan properti aktif Anda di sini.
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <ThemeLanguageToggle showCurrencyToggle={true} />
        <button
          type="button"
          onClick={handleDownloadExcel}
          disabled={downloading}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <Download size={16} /> {downloading ? 'Mengunduh...' : 'Unduh Laporan Excel'}
        </button>
        <button className="btn btn-outline" onClick={onNavigateHome}>
          Lihat Landing Page
        </button>
      </div>
    </header>
  );
}
