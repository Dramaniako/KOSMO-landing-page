import React from 'react';
import ThemeLanguageToggle from '../../../components/ThemeLanguageToggle';
import { useTranslation } from '../../../context/LanguageContext';

interface TenantHeaderProps {
  userName: string;
  onExplore: () => void;
}

export const TenantHeader: React.FC<TenantHeaderProps> = ({
  userName,
  onExplore
}) => {
  const { t } = useTranslation();

  return (
    <header style={{ marginBottom: '32px' }} className="flex-between flex-wrap gap-4">
      <div>
        <h1 style={{ fontSize: '28px' }}>{t('tenant.welcome', { name: userName })}</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '2px' }}>
          {t('tenant.title')} &bull; KOSMO Bali Co-Living
        </p>
      </div>
      <div className="flex items-center gap-3">
        <ThemeLanguageToggle />
        <button className="btn btn-outline" onClick={onExplore}>
          {t('tenant.exploreKos')}
        </button>
      </div>
    </header>
  );
};
