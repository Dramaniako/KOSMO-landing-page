import React from 'react';
import { Home, Calendar, FileText, Compass } from 'lucide-react';
import { Rental } from '../../../types/index';
import { useTranslation } from '../../../context/LanguageContext';

interface ActiveRentalSectionProps {
  activeRental?: Rental;
  isLoading: boolean;
  isLoaded: boolean;
  contractDownloading: Record<string, boolean>;
  onOpenContract: (rentalId: string) => Promise<void>;
  onOpenTerminate: (rental: Rental) => void;
  onExplore: () => void;
}

export const ActiveRentalSection: React.FC<ActiveRentalSectionProps> = ({
  activeRental,
  isLoading,
  isLoaded,
  contractDownloading,
  onOpenContract,
  onOpenTerminate,
  onExplore
}) => {
  const { t, language } = useTranslation();

  return (
    <div className="card" style={{ padding: '28px', backgroundColor: 'white' }}>
      <div className="flex-between" style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Home size={20} style={{ color: 'var(--primary)' }} />
          </div>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{t('tenant.activeSection')}</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('tenant.activeDesc')}</p>
          </div>
        </div>
      </div>

      {isLoading && !isLoaded ? (
        <div className="flex-center" style={{ height: '160px', flexDirection: 'column', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Memuat data sewa kos...</p>
        </div>
      ) : activeRental ? (
        <div className="flex-between flex-wrap gap-4" style={{ padding: '20px', border: '1px solid #bbf7d0', borderRadius: 'var(--radius-md)', background: '#f0fdf4' }}>
          <div style={{ flex: 1, minWidth: '280px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
              <span className="badge badge-success" style={{ fontSize: '11px', display: 'inline-block' }}>
                {t('tenant.active')}
              </span>
              {activeRental.paymentStatus && (
                <span
                  className="badge"
                  style={{
                    fontSize: '11px',
                    backgroundColor: activeRental.daysRemaining === 0 ? '#fee2e2' : activeRental.daysRemaining !== undefined && activeRental.daysRemaining <= 3 ? '#fef3c7' : '#dcfce7',
                    color: activeRental.daysRemaining === 0 ? '#b91c1c' : activeRental.daysRemaining !== undefined && activeRental.daysRemaining <= 3 ? '#92400e' : '#166534',
                    border: activeRental.daysRemaining === 0 ? '1px solid #fca5a5' : activeRental.daysRemaining !== undefined && activeRental.daysRemaining <= 3 ? '1px solid #fde68a' : '1px solid #bbf7d0'
                  }}
                >
                  {activeRental.paymentStatus}
                </span>
              )}
            </div>
            <h4 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--dark)' }}>{activeRental.propertyName}</h4>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {t('tenant.startDate')}: <strong>{activeRental.startDate}</strong> &bull; All-Inclusive
            </p>

            {/* Next Payment Due Date & Countdown */}
            {activeRental.nextPaymentDate && (
              <div className="mt-3 p-2.5 px-3.5 bg-white/90 dark:bg-slate-800/90 border border-emerald-300 dark:border-emerald-700/50 rounded-lg inline-flex items-center gap-3 flex-wrap">
                <div className="text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Calendar size={14} className="text-blue-600 dark:text-blue-400" />
                  <span className="text-slate-500 dark:text-slate-400 font-medium">{t('tenant.nextDue')}:</span>{' '}
                  <strong className="text-slate-900 dark:text-slate-100">{activeRental.nextPaymentDate}</strong>
                </div>
                {activeRental.daysRemaining !== undefined && (
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    activeRental.daysRemaining === 0 
                      ? 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800' 
                      : activeRental.daysRemaining <= 3 
                        ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800' 
                        : 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                  }`}>
                    {t('tenant.daysLeft', { days: activeRental.daysRemaining })}
                  </span>
                )}
              </div>
            )}
            {/* Cryptographic Contract Verification Badge */}
            {activeRental.contract_hash && (
              <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5 flex-wrap">
                <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                  {t('tenant.contractHash')} {activeRental.contract_hash.slice(0, 16)}...
                </span>
                {activeRental.contract_signed_at && (
                  <span className="text-slate-400 dark:text-slate-500">
                    &bull; {t('tenant.signedAt')} {new Date(activeRental.contract_signed_at).toLocaleDateString(language === 'en' ? 'en-US' : 'id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <strong style={{ fontSize: '20px', color: 'var(--primary)', display: 'block' }}>
              Rp {activeRental.price ? activeRental.price.toLocaleString('id-ID') : '0'}/bln
            </strong>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => onOpenContract(activeRental.id)}
                disabled={contractDownloading[activeRental.id]}
                className="btn btn-outline"
                style={{ padding: '6px 14px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                title={activeRental.contract_hash ? `SHA-256: ${activeRental.contract_hash}` : undefined}
              >
                <FileText size={14} />
                {contractDownloading[activeRental.id] ? 'Memuat PDF...' : t('tenant.viewContract')}
              </button>
              <button 
                className="btn btn-outline btn-danger" 
                style={{ padding: '6px 14px', fontSize: '12px' }}
                onClick={() => onOpenTerminate(activeRental)}
              >
                {t('tenant.terminateBtn')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '36px 20px', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-color)' }}>
          <div style={{ width: '48px', height: '48px', margin: '0 auto 12px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Home size={24} style={{ color: '#94a3b8' }} />
          </div>
          <p style={{ fontWeight: 600, fontSize: '15px', color: 'var(--dark)' }}>{t('tenant.noActive')}</p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: '18px' }}>
            {t('tenant.noActiveDesc')}
          </p>
          <button className="btn btn-primary" onClick={onExplore} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Compass size={16} />
            {t('tenant.exploreKos')}
          </button>
        </div>
      )}
    </div>
  );
};
