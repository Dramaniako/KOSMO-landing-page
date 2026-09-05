import React from 'react';
import { History, AlertCircle, FileText, CreditCard } from 'lucide-react';
import { Rental } from '../../../types/index';
import { useTranslation } from '../../../context/LanguageContext';

interface RentalHistorySectionProps {
  otherRentals: Rental[];
  contractDownloading: Record<string, boolean>;
  onOpenContract: (rentalId: string) => Promise<void>;
  onViewContractDetails?: (rental: Rental) => void;
  onOpenPendingPayment: (rental: Rental) => void;
}

export const RentalHistorySection: React.FC<RentalHistorySectionProps> = ({
  otherRentals,
  contractDownloading,
  onOpenContract,
  onViewContractDetails,
  onOpenPendingPayment
}) => {
  const { t } = useTranslation();

  if (otherRentals.length === 0) return null;

  return (
    <div className="card" style={{ padding: '28px', backgroundColor: 'white' }}>
      <div className="flex-between" style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <History size={20} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{t('tenant.pastSection')}</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('tenant.pastDesc', { count: otherRentals.length })}</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {otherRentals.map((rent) => {
          const isPending = rent.status === 'pending';

          return (
            <div
              key={rent.id}
              className="flex-between flex-wrap gap-3"
              style={{
                padding: '16px 20px',
                border: isPending ? '1px solid #fde68a' : '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                background: isPending ? '#fffbeb' : '#f8fafc'
              }}
            >
              <div>
                {isPending ? (
                  <span
                    className="badge"
                    style={{
                      marginBottom: '6px',
                      fontSize: '10px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      backgroundColor: '#fef3c7',
                      color: '#92400e',
                      border: '1px solid #fde68a',
                      fontWeight: 700
                    }}
                  >
                    <AlertCircle size={11} />
                    {t('tenant.pendingBadge')}
                  </span>
                ) : (
                  <span
                    className="badge badge-secondary"
                    style={{
                      marginBottom: '6px',
                      fontSize: '10px',
                      display: 'inline-block',
                      backgroundColor: '#e2e8f0',
                      color: '#475569'
                    }}
                  >
                    {rent.status === 'terminated' ? t('tenant.completed') : rent.status === 'cancelled' ? 'Dibatalkan' : t('tenant.completed')}
                  </span>
                )}
                <h4 style={{ fontSize: '15px', fontWeight: 600, color: isPending ? '#92400e' : '#334155' }}>
                  {rent.propertyName}
                  {rent.roomNumber && (
                    <span
                      className="badge"
                      style={{
                        marginLeft: '6px',
                        fontSize: '10px',
                        backgroundColor: '#e0e7ff',
                        color: '#3730a3',
                        border: '1px solid #c7d2fe'
                      }}
                    >
                      Kamar {rent.roomNumber}
                    </span>
                  )}
                </h4>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {t('tenant.startDate')}: {rent.startDate}
                </p>
                {rent.contract_hash && (
                  <p style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace', marginTop: '2px' }}>
                    SHA-256: {rent.contract_hash.slice(0, 16)}...
                  </p>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong style={{ fontSize: '16px', color: isPending ? '#b45309' : '#64748b', display: 'block' }}>
                  Rp {rent.price ? rent.price.toLocaleString('id-ID') : '0'}/bln
                </strong>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px', flexWrap: 'wrap' }}>
                  {onViewContractDetails && (
                    <button
                      type="button"
                      onClick={() => onViewContractDetails(rent)}
                      className="btn btn-outline"
                      style={{ padding: '4px 12px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      data-testid={`view-contract-details-${rent.id}`}
                    >
                      <FileText size={12} />
                      Detail Perjanjian
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenContract(rent.id)}
                    disabled={contractDownloading[rent.id]}
                    className="btn btn-outline"
                    style={{ padding: '4px 12px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <FileText size={12} />
                    {contractDownloading[rent.id] ? 'Memuat...' : t('tenant.viewContract')}
                  </button>
                  {isPending && (
                    <button
                      type="button"
                      onClick={() => onOpenPendingPayment(rent)}
                      className="btn btn-primary"
                      style={{
                        padding: '4px 12px',
                        fontSize: '11px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontWeight: 600
                      }}
                    >
                      <CreditCard size={12} />
                      {t('tenant.payNow')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
