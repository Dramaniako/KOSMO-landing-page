import React from 'react';
import { Withdrawal } from '../../../types/index';
import { formatRupiah } from '../../../utils/format';

export interface WithdrawalsTabProps {
  withdrawals: Withdrawal[];
  loading: boolean;
  onProcessWithdrawal: (id: string) => void;
  onRejectWithdrawal: (id: string) => void;
}

export default function WithdrawalsTab({
  withdrawals,
  loading,
  onProcessWithdrawal,
  onRejectWithdrawal
}: WithdrawalsTabProps) {
  return (
    <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
      <div className="flex-between" style={{ marginBottom: '24px' }}>
        <div>
          <h3 style={{ fontSize: '20px' }}>Moderasi Pencairan Dana Landlord ({withdrawals.length})</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
            Kelola dan verifikasi transfer penarikan saldo pendapatan mitra kos.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex-center" style={{ height: '200px', flexDirection: 'column', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Memuat data penarikan saldo...</p>
        </div>
      ) : withdrawals.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
          Belum ada riwayat permohonan pencairan dana.
        </p>
      ) : (
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Tanggal & ID</th>
                <th>Landlord</th>
                <th>Bank & Rekening</th>
                <th>Nominal</th>
                <th>Status</th>
                <th>Ref ID</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w) => (
                <tr key={w.id}>
                  <td>
                    <strong style={{ fontSize: '13px', display: 'block' }}>{w.id}</strong>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{w.date}</span>
                  </td>
                  <td>
                    <p style={{ fontWeight: 600, fontSize: '13px' }}>{w.userName || w.userId}</p>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{w.userEmail || '-'}</span>
                  </td>
                  <td>
                    <span className="badge" style={{ backgroundColor: '#e0f2fe', color: '#0369a1', fontSize: '11px', fontWeight: 600 }}>
                      {w.bankName}
                    </span>
                    <p style={{ fontSize: '13px', marginTop: '4px', fontWeight: 500 }}>{w.accountNumber}</p>
                    {w.accountHolder && <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>a.n. {w.accountHolder}</p>}
                  </td>
                  <td>
                    <strong style={{ color: 'var(--primary)', fontSize: '14px' }}>{formatRupiah(w.amount)}</strong>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        w.status === 'completed'
                          ? 'badge-success'
                          : w.status === 'rejected'
                          ? 'badge-danger'
                          : w.status === 'processing'
                          ? 'badge-warning'
                          : 'badge-secondary'
                      }`}
                      title={w.rejectionReason ? `Alasan: ${w.rejectionReason}` : undefined}
                    >
                      {w.status === 'completed' ? 'Selesai' : w.status === 'rejected' ? 'Ditolak' : w.status === 'processing' ? 'Diproses' : 'Menunggu'}
                    </span>
                    {w.rejectionReason && (
                      <p style={{ fontSize: '10px', color: 'var(--danger)', marginTop: '2px' }}>{w.rejectionReason}</p>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {w.referenceId || '-'}
                    </span>
                  </td>
                  <td>
                    {w.status === 'pending' || w.status === 'processing' ? (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="btn btn-sm btn-primary"
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                          onClick={() => onProcessWithdrawal(w.id)}
                        >
                          Selesaikan
                        </button>
                        <button
                          className="btn btn-sm btn-danger btn-outline"
                          style={{ padding: '4px 8px', fontSize: '11px' }}
                          onClick={() => onRejectWithdrawal(w.id)}
                        >
                          Tolak
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Telah Diproses</span>
                    )}
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
