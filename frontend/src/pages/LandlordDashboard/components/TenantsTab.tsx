import React from 'react';
import { FileText } from 'lucide-react';
import { Rental } from '../../../types/index';
import { formatRupiah } from '../../../utils/format';
import { useTranslation } from '../../../context/LanguageContext';
import { shimmerStyle } from '../types';

export interface TenantsTabProps {
  rentals: Rental[];
  loading: boolean;
  contractDownloading: Record<string, boolean>;
  onDownloadContract: (rentalId: string) => void;
}

export default function TenantsTab({
  rentals,
  loading,
  contractDownloading,
  onDownloadContract
}: TenantsTabProps) {
  const { t } = useTranslation();

  return (
    <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
      <div className="flex-between" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '20px' }}>Sesi Kontrak Penyewa Aktif ({rentals.length})</h3>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ height: '68px', ...shimmerStyle }} />
          ))}
        </div>
      ) : rentals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
          <p style={{ fontStyle: 'italic', fontSize: '14px' }}>Belum ada sesi penyewaan aktif pada properti Anda.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px 16px' }}>Properti Kos</th>
                <th style={{ padding: '12px 16px' }}>ID Penyewa</th>
                <th style={{ padding: '12px 16px' }}>Mulai Sewa</th>
                <th style={{ padding: '12px 16px' }}>Biaya / Bln</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Dokumen Kontrak</th>
              </tr>
            </thead>
            <tbody>
              {rentals.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '16px' }}>
                    <strong style={{ fontSize: '15px', color: 'var(--dark)' }}>{r.propertyName}</strong>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ID Sewa: {r.id}</p>
                  </td>
                  <td style={{ padding: '16px' }}>
                    <span style={{ fontSize: '13px', fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                      {r.tenantId}
                    </span>
                  </td>
                  <td style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '13px' }}>
                    {r.startDate}
                  </td>
                  <td style={{ padding: '16px', fontWeight: 600, color: 'var(--primary)' }}>
                    {formatRupiah(r.price)}
                  </td>
                  <td style={{ padding: '16px' }}>
                    <span className={`badge ${r.status === 'active' ? 'badge-success' : 'badge-secondary'}`} style={{ fontSize: '10px' }}>
                      {r.status === 'active' ? 'Sewa Aktif' : r.status}
                    </span>
                  </td>
                  <td style={{ padding: '16px', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => onDownloadContract(r.id)}
                      disabled={contractDownloading[r.id]}
                      className="btn btn-outline"
                      style={{ padding: '4px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      title={r.contract_hash ? `SHA-256: ${r.contract_hash}` : undefined}
                    >
                      <FileText size={13} />
                      {contractDownloading[r.id] ? 'Mengunduh...' : t('landlord.viewContract')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
