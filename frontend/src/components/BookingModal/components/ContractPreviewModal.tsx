import React from 'react';
import { X } from 'lucide-react';
import { ContractPreviewResponse } from '../../../types/index';
import { useTranslation } from '../../../context/LanguageContext';
import { formatRupiah } from '../../../utils/format';

export interface ContractPreviewModalProps {
  previewData: ContractPreviewResponse;
  durationMonths: number;
  idNumber: string;
  onClose: () => void;
}

export default function ContractPreviewModal({
  previewData,
  durationMonths,
  idNumber,
  onClose
}: ContractPreviewModalProps) {
  const { t } = useTranslation();

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 1100, backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={onClose}
    >
      <div
        className="modal-content glass-panel dark:bg-slate-900 dark:border-slate-800"
        style={{ maxWidth: '580px', maxHeight: '85vh', overflowY: 'auto', padding: '24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--dark)' }}>
              {t('contract.previewTitle')}
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {t('contract.previewSubtitle')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '4px 8px', fontSize: '12px' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* SHA-256 Checksum Badge */}
        <div
          style={{
            backgroundColor: '#f1f5f9',
            border: '1px solid #cbd5e1',
            borderRadius: 'var(--radius-sm)',
            padding: '10px 12px',
            marginBottom: '16px',
            fontSize: '11px',
            fontFamily: 'monospace',
            wordBreak: 'break-all'
          }}
        >
          <div style={{ fontWeight: 700, color: '#334155', marginBottom: '2px' }}>
            {t('contract.previewHash')}
          </div>
          <div style={{ color: '#0f172a' }}>
            {previewData.contractHash}
          </div>
        </div>

        {/* Preview Details */}
        <div
          style={{
            backgroundColor: 'white',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)',
            padding: '16px',
            fontSize: '12px',
            lineHeight: 1.6,
            marginBottom: '16px'
          }}
        >
          <p><strong>Properti:</strong> {previewData.contractData.propertyName} ({previewData.contractData.propertyAddress})</p>
          <p><strong>Penyewa:</strong> {previewData.contractData.tenantName} ({previewData.contractData.tenantEmail}) &bull; NIK/Paspor: {previewData.contractData.tenantNikPassport || idNumber || '-'}</p>
          <p><strong>Mulai Sewa:</strong> {previewData.contractData.startDate} &bull; <strong>Durasi:</strong> {previewData.contractData.durationMonths || durationMonths} Bulan</p>
          <hr style={{ margin: '10px 0', borderColor: 'var(--border-color)' }} />
          <p><strong>Biaya Sewa Kamar:</strong> {formatRupiah(previewData.totalPrice || (previewData.monthlyPrice * (previewData.contractData.durationMonths || 1)))}</p>
          <p><strong>Biaya Admin & Meterai:</strong> {formatRupiah(previewData.adminFee || 5000)}</p>
          <p><strong>Total Transaksi:</strong> <strong>{formatRupiah(previewData.totalAmount)}</strong></p>
          <hr style={{ margin: '10px 0', borderColor: 'var(--border-color)' }} />
          <p><strong>Kuota Utilitas Bulanan:</strong></p>
          <ul style={{ paddingLeft: '16px', margin: '4px 0' }}>
            <li>Listrik: {previewData.contractData.utilityQuotas?.electricityKwh || '200 kWh/bulan'}</li>
            <li>Air Bersih: {previewData.contractData.utilityQuotas?.water || 'PDAM & Sumur Bor Terfilter'}</li>
            <li>WiFi Fiber: {previewData.contractData.utilityQuotas?.wifiMbps || '100 Mbps'}</li>
            <li>Keamanan: {previewData.contractData.utilityQuotas?.security || 'CCTV 24 Jam & Gerbang'}</li>
            <li>Kebersihan: {previewData.contractData.utilityQuotas?.waste || 'Pengangkutan Sampah Harian'}</li>
          </ul>
        </div>

        <div style={{ textAlign: 'right' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
          >
            {t('contract.previewClose')}
          </button>
        </div>
      </div>
    </div>
  );
}
