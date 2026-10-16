import React from 'react';
import { FileText, Calendar, MessageSquare, DoorOpen, AlertTriangle } from 'lucide-react';
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

  const getWhatsAppReminderUrl = (rental: Rental): string | null => {
    const rawPhone = rental.tenantPhone || '';
    const cleanPhone = rawPhone.replace(/\D/g, '');
    if (!cleanPhone) return null;

    const formattedPhone = cleanPhone.startsWith('0')
      ? '62' + cleanPhone.slice(1)
      : cleanPhone.startsWith('62')
      ? cleanPhone
      : '62' + cleanPhone;

    const tenantName = rental.tenantName || 'Penyewa';
    const propertyName = rental.propertyName || 'Unit KOSMO';
    const roomInfo = rental.roomNumber ? ` (Kamar ${rental.roomNumber})` : '';
    const dueDate = rental.nextPaymentDate || rental.leaseEndDate || 'waktu dekat';
    const amount = formatRupiah(rental.price);

    const message = `Halo ${tenantName}, ini pengingat sewa hunian KOSMO untuk ${propertyName}${roomInfo}.\nSewa bulan berikutnya sebesar ${amount} jatuh tempo pada ${dueDate}.\nMohon segera lakukan pembayaran melalui dasbor KOSMO Anda untuk memperpanjang sewa. Terima kasih! 🙏`;

    return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
  };

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
                <th style={{ padding: '12px 16px' }}>Properti & Kamar</th>
                <th style={{ padding: '12px 16px' }}>Penyewa</th>
                <th style={{ padding: '12px 16px' }}>Jatuh Tempo</th>
                <th style={{ padding: '12px 16px' }}>Biaya / Bln</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {rentals.map((r) => {
                const daysRemaining = r.daysRemaining;
                const isNearDue = r.status === 'active' && daysRemaining !== undefined && daysRemaining <= 3;
                const waUrl = getWhatsAppReminderUrl(r);

                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '16px' }}>
                      <strong style={{ fontSize: '15px', color: 'var(--dark)' }}>{r.propertyName}</strong>
                      {r.roomNumber && (
                        <div style={{ marginTop: '4px' }}>
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200"
                            data-testid={`room-badge-${r.id}`}
                          >
                            <DoorOpen size={12} />
                            Kamar {r.roomNumber} {r.roomFloor ? `• Lt ${r.roomFloor}` : ''}
                          </span>
                        </div>
                      )}
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>ID Sewa: {r.id}</p>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <strong style={{ fontSize: '14px', color: 'var(--dark)', display: 'block' }}>
                        {r.tenantName || 'Penyewa'}
                      </strong>
                      {r.tenantPhone ? (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{r.tenantPhone}</span>
                      ) : (
                        <span style={{ fontSize: '12px', fontFamily: 'monospace', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                          {r.tenantId}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Calendar size={14} className="text-blue-600" />
                        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--dark)' }}>
                          {r.nextPaymentDate || r.leaseEndDate || r.startDate}
                        </span>
                      </div>
                      {daysRemaining !== undefined && r.status === 'active' && (
                        <div style={{ marginTop: '4px' }}>
                          <span
                            data-testid={`due-badge-${r.id}`}
                            className={`badge ${
                              daysRemaining === 0
                                ? 'badge-danger'
                                : daysRemaining <= 3
                                ? 'badge-warning'
                                : 'badge-info'
                            }`}
                            style={{
                              fontSize: '10px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            {isNearDue && <AlertTriangle size={10} />}
                            {daysRemaining === 0
                              ? 'Jatuh Tempo Hari Ini'
                              : daysRemaining <= 3
                              ? `Jatuh Tempo: ${daysRemaining} hari`
                              : `Sisa ${daysRemaining} hari`}
                          </span>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '16px', fontWeight: 600, color: 'var(--primary)' }}>
                      {formatRupiah(r.price)}
                    </td>
                    <td style={{ padding: '16px' }}>
                      <span
                        className={`badge ${
                          r.status === 'active'
                            ? isNearDue
                              ? 'badge-warning'
                              : 'badge-success'
                            : 'badge-secondary'
                        }`}
                        style={{ fontSize: '10px' }}
                      >
                        {r.status === 'active'
                          ? isNearDue
                            ? 'Menjelang Jatuh Tempo'
                            : 'Sewa Aktif'
                          : r.status}
                      </span>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {r.status === 'active' && waUrl && (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid={`wa-reminder-btn-${r.id}`}
                            className="btn btn-outline"
                            style={{
                              padding: '4px 10px',
                              fontSize: '12px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              color: '#059669',
                              borderColor: '#a7f3d0',
                              backgroundColor: '#ecfdf5',
                              textDecoration: 'none'
                            }}
                            title="Kirim pengingat WhatsApp ke penyewa"
                          >
                            <MessageSquare size={13} />
                            Ingatkan Sewa
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => onDownloadContract(r.id)}
                          disabled={contractDownloading[r.id]}
                          className="btn btn-outline"
                          style={{ padding: '4px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          title={r.contract_hash ? `SHA-256: ${r.contract_hash}` : undefined}
                        >
                          <FileText size={13} />
                          {contractDownloading[r.id] ? 'Mengunduh...' : t('landlord.viewContract')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
