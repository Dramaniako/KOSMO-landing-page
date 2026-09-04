import React from 'react';
import { X, CreditCard, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Rental } from '../../../types/index';
import { useTranslation } from '../../../context/LanguageContext';

interface PendingPaymentModalProps {
  isOpen: boolean;
  selectedPendingRental: Rental | null;
  pendingPaymentProcessing: boolean;
  pendingPaymentError: string | null;
  onClose: () => void;
  onProcessPayment: () => Promise<void>;
}

export const PendingPaymentModal: React.FC<PendingPaymentModalProps> = ({
  isOpen,
  selectedPendingRental,
  pendingPaymentProcessing,
  pendingPaymentError,
  onClose,
  onProcessPayment
}) => {
  const { t } = useTranslation();

  if (!isOpen || !selectedPendingRental) return null;

  const duration = Number(selectedPendingRental.duration_months || 1);
  const monthlyPrice = Number(selectedPendingRental.price || 0);
  const totalRent = monthlyPrice * duration;
  const adminFee = Number(
    selectedPendingRental.admin_fee_amount !== undefined && selectedPendingRental.admin_fee_amount !== null
      ? selectedPendingRental.admin_fee_amount
      : 5000
  );
  const grandTotal = totalRent + adminFee;

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 1100, backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={() => {
        if (!pendingPaymentProcessing) {
          onClose();
        }
      }}
    >
      <div
        className="modal-container"
        style={{ maxWidth: '480px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="modal-close"
          onClick={() => {
            if (!pendingPaymentProcessing) {
              onClose();
            }
          }}
        >
          <X size={18} />
        </button>

        <div style={{ padding: '28px' }}>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <div
              className="flex-center"
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: '#eff6ff',
                color: 'var(--primary)',
                margin: '0 auto 12px auto'
              }}
            >
              <CreditCard size={24} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700 }}>{t('tenant.pendingPaymentTitle')}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
              {t('tenant.pendingPaymentDesc')}
            </p>
          </div>

          {pendingPaymentError && (
            <div
              style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 14px',
                marginBottom: '16px',
                color: '#dc2626',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span>{pendingPaymentError}</span>
            </div>
          )}

          {/* Cryptographic Verified Contract Hash */}
          {selectedPendingRental.contract_hash && (
            <div
              style={{
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                marginBottom: '16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                <ShieldCheck size={14} style={{ color: '#16a34a' }} />
                <strong style={{ fontSize: '12px', color: '#166534' }}>
                  {t('contract.verifiedBadge')}
                </strong>
              </div>
              <div style={{ fontSize: '10px', color: '#15803d', fontFamily: 'monospace' }}>
                SHA-256: {selectedPendingRental.contract_hash.slice(0, 24)}...
              </div>
            </div>
          )}

          {/* Cost Summary Breakdown */}
          <div
            style={{
              backgroundColor: 'var(--bg-main)',
              padding: '16px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              marginBottom: '20px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Properti Kos</span>
              <span style={{ fontWeight: 600 }}>{selectedPendingRental.propertyName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Sewa Kamar ({duration} bln)</span>
              <span style={{ fontWeight: 600 }}>Rp {totalRent.toLocaleString('id-ID')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Biaya Administrasi & Meterai</span>
              <span style={{ fontWeight: 600, color: 'var(--primary)' }}>Rp {adminFee.toLocaleString('id-ID')}</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '10px',
                borderTop: '1px solid var(--border-color)',
                fontSize: '15px',
                fontWeight: 800
              }}
            >
              <span>Total Pembayaran</span>
              <span style={{ color: 'var(--primary)' }}>Rp {grandTotal.toLocaleString('id-ID')}</span>
            </div>
          </div>

          <div className="flex-between" style={{ gap: '12px' }}>
            <button
              type="button"
              className="btn btn-outline"
              style={{ flex: 1 }}
              disabled={pendingPaymentProcessing}
              onClick={onClose}
            >
              {t('tenant.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              disabled={pendingPaymentProcessing}
              onClick={onProcessPayment}
            >
              <CreditCard size={14} />
              {pendingPaymentProcessing ? 'Memproses...' : t('tenant.payNow')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
