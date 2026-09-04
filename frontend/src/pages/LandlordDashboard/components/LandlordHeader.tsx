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
        <ThemeLanguageToggle />
        <a
          href={`${API_BASE}/reports/landlord/excel?landlordId=${landlordUser?.id || ''}&token=${encodeURIComponent(
            localStorage.getItem('token') || localStorage.getItem('kosmo_token') || ''
          )}`}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}
        >
          <Download size={16} /> Unduh Laporan Excel
        </a>
        <button className="btn btn-outline" onClick={onNavigateHome}>
          Lihat Landing Page
        </button>
      </div>
    </header>
  );
}
