import React from 'react';
import { Receipt, CreditCard, FileText, XCircle } from 'lucide-react';
import { Rental } from '../../../types/index';
import { formatRupiah } from '../../../utils/format';

interface BillingHistoryListProps {
  rentals?: Rental[];
  isLoading: boolean;
  isLoaded: boolean;
  contractDownloading?: Record<string, boolean>;
  onOpenContract?: (rentalId: string) => Promise<void>;
  onOpenPendingPayment?: (rental: Rental) => void;
  onCancelPendingRental?: (rental: Rental) => Promise<void> | void;
  cancellingRentalId?: string | null;
}

export const BillingHistoryList: React.FC<BillingHistoryListProps> = ({
  rentals = [],
  isLoading,
  isLoaded,
  contractDownloading = {},
  onOpenContract,
  onOpenPendingPayment,
  onCancelPendingRental,
  cancellingRentalId = null
}) => {
  return (
    <div className="card" style={{ padding: '24px', backgroundColor: 'var(--bg-card)' }}>
      <h3 style={{ fontSize: '20px', marginBottom: '24px' }}>Riwayat Transaksi & Tagihan</h3>

      {isLoading && !isLoaded ? (
        <div className="flex-center" style={{ height: '160px', flexDirection: 'column', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Memuat riwayat tagihan...</p>
        </div>
      ) : rentals.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
          <Receipt size={36} style={{ margin: '0 auto 12px', opacity: 0.45 }} />
          <p style={{ fontSize: '14px', fontWeight: 600 }}>Belum Ada Riwayat Transaksi atau Tagihan</p>
          <p style={{ fontSize: '12px', marginTop: '4px' }}>
            Tagihan sewa kos dan bukti pembayaran Anda akan muncul secara otomatis di sini.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {rentals.map((rent) => {
            const duration = Math.max(1, rent.duration_months || 1);
            const adminFee = rent.admin_fee_amount ?? 5000;
            const totalInvoice = rent.price * duration + adminFee;
            const invoiceCode = `INV-KSM-${rent.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}`;
            const isPending = rent.status === 'pending';
            const isCancelled = rent.status === 'cancelled';

            return (
              <div
                key={rent.id}
                className="flex-between flex-wrap gap-3"
                style={{
                  padding: '20px',
                  border: isPending ? '1px solid #fde68a' : '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  background: isPending ? 'rgba(254, 243, 199, 0.35)' : 'var(--bg-surface, var(--light))'
                }}
              >
                <div>
                  {isPending ? (
                    <span
                      className="badge"
                      style={{
                        marginBottom: '6px',
                        fontSize: '10px',
                        backgroundColor: '#fef3c7',
                        color: '#92400e',
                        border: '1px solid #fde68a',
                        fontWeight: 700
                      }}
                    >
                      Menunggu Pembayaran
                    </span>
                  ) : isCancelled ? (
                    <span
                      className="badge badge-secondary"
                      style={{
                        marginBottom: '6px',
                        fontSize: '10px',
                        backgroundColor: '#fee2e2',
                        color: '#991b1b'
                      }}
                    >
                      Dibatalkan
                    </span>
                  ) : (
                    <span className="badge badge-success" style={{ marginBottom: '6px', fontSize: '10px' }}>
                      {rent.paymentStatus || 'Lunas'}
                    </span>
                  )}

                  <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--dark)' }}>
                    {rent.propertyName}
                    {rent.roomNumber ? ` (Kamar ${rent.roomNumber})` : ''}
                  </h4>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Invoice: {invoiceCode} &bull; Mulai Sewa: {rent.startDate} &bull; Durasi: {duration} Bulan
                  </p>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Tagihan: All-Inclusive ({formatRupiah(rent.price)}/bln + Biaya Layanan {formatRupiah(adminFee)})
                  </p>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <strong style={{ fontSize: '18px', color: isPending ? '#b45309' : 'var(--dark)', display: 'block' }}>
                    {formatRupiah(totalInvoice)}
                  </strong>
                  <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>
                    {isPending ? 'Midtrans Snap Payment' : 'Terverifikasi Digital (E-Kontrak)'}
                  </span>

                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px', flexWrap: 'wrap' }}>
                    {onOpenContract && (
                      <button
                        type="button"
                        onClick={() => onOpenContract(rent.id)}
                        disabled={contractDownloading[rent.id]}
                        className="btn btn-outline"
                        style={{ padding: '4px 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <FileText size={12} />
                        {contractDownloading[rent.id] ? 'Memuat...' : 'Unduh E-Kontrak'}
                      </button>
                    )}
                    {isPending && onCancelPendingRental && (
                      <button
                        type="button"
                        onClick={() => onCancelPendingRental(rent)}
                        disabled={cancellingRentalId === rent.id}
                        className="btn btn-outline"
                        style={{
                          padding: '4px 10px',
                          fontSize: '11px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          color: '#dc2626',
                          borderColor: '#fecaca'
                        }}
                      >
                        <XCircle size={12} />
                        {cancellingRentalId === rent.id ? 'Membatalkan...' : 'Batalkan'}
                      </button>
                    )}
                    {isPending && onOpenPendingPayment && (
                      <button
                        type="button"
                        onClick={() => onOpenPendingPayment(rent)}
                        className="btn btn-primary"
                        style={{ padding: '4px 12px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <CreditCard size={12} />
                        Bayar Sekarang
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
