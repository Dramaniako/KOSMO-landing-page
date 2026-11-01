import React from 'react';
import { RotateCcw } from 'lucide-react';
import ThemeLanguageToggle from '../../../components/ThemeLanguageToggle';
import { useTranslation } from '../../../context/LanguageContext';

export interface AdminHeaderProps {
  onRefresh?: () => void;
  refreshing?: boolean;
  onNavigateHome?: () => void;
}

export default function AdminHeader({ onRefresh, refreshing, onNavigateHome }: AdminHeaderProps) {
  const { t } = useTranslation();

  return (
    <header style={{ marginBottom: '32px' }} className="flex-between flex-wrap gap-4">
      <div>
        <h1 style={{ fontSize: '28px' }}>{t('admin.title')}</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '2px' }}>
          Manajemen user, pengaturan role, moderasi properti, dan review secara global.
        </p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <ThemeLanguageToggle />
        <button
          type="button"
          className="btn btn-outline"
          onClick={onRefresh || onNavigateHome}
          disabled={refreshing}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <RotateCcw size={16} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Memuat...' : 'Segarkan Data'}
        </button>
      </div>
    </header>
  );
}
