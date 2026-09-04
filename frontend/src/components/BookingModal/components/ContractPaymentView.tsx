import React from 'react';
import { CreditCard, ShieldCheck, Hash, FileText, AlertCircle } from 'lucide-react';
import { Property, User, SignedContractData } from '../../../types/index';
import { useTranslation } from '../../../context/LanguageContext';
import { formatRupiah } from '../../../utils/format';

export interface ContractPaymentViewProps {
  property: Property;
  currentUser: User | null;
  durationMonths: number;
  calculatedTotalRent: number;
  flatAdminFee: number;
  calculatedTotalAmount: number;
  signedContractData: SignedContractData | null;
  downloadingSignedContract: boolean;
  handleDownloadSignedContract: (rentalId: string) => Promise<void>;
  paymentProcessing: boolean;
  handleProcessPayment: () => void;
  hasActiveRental: boolean;
  activeRentalError: string | null;
  onCancel: () => void;
}

export default function ContractPaymentView({
  property,
  currentUser,
  durationMonths,
  calculatedTotalRent,
  flatAdminFee,
  calculatedTotalAmount,
  signedContractData,
  downloadingSignedContract,
  handleDownloadSignedContract,
  paymentProcessing,
  handleProcessPayment,
  hasActiveRental,
  activeRentalError,
  onCancel
}: ContractPaymentViewProps) {
  const { t } = useTranslation();

  return (
    <div style={{ padding: '32px' }}>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div
          className="flex-center"
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: '#ecfdf5',
            color: '#10b981',
            margin: '0 auto 12px auto'
          }}
        >
          <CreditCard size={24} />
        </div>
        <h3 style={{ fontSize: '20px', fontWeight: 800 }}>{t('modal.paymentTitle')}</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
          All-Inclusive Bali Co-Living Tenancy
        </p>
      </div>

      {/* Verified Digital Contract Evidentiary Card */}
      <div
        style={{
          backgroundColor: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: 'var(--radius-md)',
          padding: '14px 16px',
          marginBottom: '20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <ShieldCheck size={18} style={{ color: '#16a34a', flexShrink: 0 }} />
          <strong style={{ fontSize: '13px', color: '#166534' }}>
            {t('contract.verifiedBadge')}
          </strong>
        </div>
        {signedContractData?.contractHash && (
          <div style={{ fontSize: '11px', color: '#15803d', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            <Hash size={12} style={{ display: 'inline', marginRight: '4px' }} />
            {t('contract.hashLabel')} {signedContractData.contractHash.slice(0, 24)}...
          </div>
        )}
        {signedContractData?.rentalId && (
          <div style={{ marginTop: '8px' }}>
            <button
              type="button"
              onClick={() => handleDownloadSignedContract(signedContractData.rentalId)}
              disabled={downloadingSignedContract}
              className="btn btn-outline"
              style={{ fontSize: '11px', color: '#15803d', borderColor: '#86efac', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600, padding: '4px 10px', backgroundColor: '#f0fdf4' }}
            >
              <FileText size={12} />
              {downloadingSignedContract ? 'Mengunduh Dokumen PDF...' : 'Lihat Dokumen Kontrak Sewa (PDF)'}
            </button>
          </div>
        )}
      </div>

      {/* Itemized Price Summary Card */}
      <div
        style={{
          backgroundColor: 'var(--bg-main)',
          padding: '20px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-color)',
          marginBottom: '24px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-muted)' }}>Properti</span>
          <span style={{ fontWeight: 600 }}>{property.name}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-muted)' }}>Penyewa</span>
          <span style={{ fontWeight: 600 }}>{currentUser ? currentUser.name : '-'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-muted)' }}>Sewa Kamar ({durationMonths} bln)</span>
          <span style={{ fontWeight: 600 }}>{formatRupiah(calculatedTotalRent)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-muted)' }}>{t('contract.adminFee')}</span>
          <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
            {formatRupiah(signedContractData?.adminFee || flatAdminFee)}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            paddingTop: '12px',
            borderTop: '1px solid var(--border-color)',
            fontSize: '16px',
            fontWeight: 800
          }}
        >
          <span>{t('modal.totalPay')}</span>
          <span style={{ color: 'var(--primary)' }}>
            {formatRupiah(signedContractData?.totalAmount || calculatedTotalAmount)}
          </span>
        </div>
      </div>

      {/* Payment Method Selector */}
      <div style={{ marginBottom: '24px' }}>
        <label className="form-label">{t('modal.choosePayment')}</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div
            style={{
              border: '2px solid var(--primary)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px',
              textAlign: 'center',
              backgroundColor: 'var(--primary-light)',
              cursor: 'pointer'
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--primary)' }}>Virtual Account</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>BCA / Mandiri / BNI / BRI</div>
          </div>
          <div
            style={{
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px',
              textAlign: 'center',
              cursor: 'pointer'
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '13px' }}>Kartu Kredit / Debit</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Visa / Mastercard / JCB</div>
          </div>
        </div>
      </div>

      {/* Active Rental Warning Banner on Payment Step */}
      {(activeRentalError || hasActiveRental) && (
        <div
          style={{
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#92400e',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
            marginBottom: '16px',
            fontSize: '12px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <AlertCircle size={16} style={{ color: '#d97706', flexShrink: 0 }} />
          <span>{activeRentalError || t('modal.activeRentalAlert')}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ flex: 1 }}
          onClick={onCancel}
        >
          {t('tenant.cancel')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 2 }}
          onClick={handleProcessPayment}
          disabled={paymentProcessing || hasActiveRental || Boolean(activeRentalError)}
        >
          {paymentProcessing
            ? t('modal.processing')
            : (hasActiveRental || activeRentalError)
            ? t('modal.activeRentalFound')
            : `Bayar ${formatRupiah(signedContractData?.totalAmount || calculatedTotalAmount)}`}
        </button>
      </div>
    </div>
  );
}
