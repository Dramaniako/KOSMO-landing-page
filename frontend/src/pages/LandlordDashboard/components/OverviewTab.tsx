import React from 'react';
import { DollarSign, ArrowUpRight, CreditCard, Percent, Landmark, Plus } from 'lucide-react';
import { User, LandlordStats } from '../../../types/index';
import { formatRupiah } from '../../../utils/format';
import { shimmerStyle } from '../types';

export interface OverviewTabProps {
  stats: LandlordStats;
  landlordUser: User | null;
  loading: boolean;
  onOpenWithdraw: () => void;
  onOpenAddProperty: () => void;
}

export default function OverviewTab({
  stats,
  landlordUser,
  loading,
  onOpenWithdraw,
  onOpenAddProperty
}: OverviewTabProps) {
  if (loading) {
    return (
      <div>
        <div className="stats-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ height: '110px', ...shimmerStyle }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: '16px', marginBottom: '40px' }}>
          <div style={{ width: '180px', height: '42px', ...shimmerStyle }} />
          <div style={{ width: '180px', height: '42px', ...shimmerStyle }} />
        </div>
        <div className="grid-2">
          <div className="card" style={{ height: '240px', ...shimmerStyle }} />
          <div className="card" style={{ height: '240px', ...shimmerStyle }} />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Stats Cards Row */}
      <div className="stats-grid">
        <div className="stats-card">
          <div className="stats-icon" style={{ backgroundColor: '#eff6ff', color: '#2563eb' }}>
            <DollarSign size={24} />
          </div>
          <div className="stats-info">
            <h4>Saldo Bisa Ditarik</h4>
            <p>{formatRupiah(stats.balance)}</p>
          </div>
        </div>

        <div className="stats-card">
          <div className="stats-icon" style={{ backgroundColor: '#ecfdf5', color: '#10b981' }}>
            <ArrowUpRight size={24} />
          </div>
          <div className="stats-info">
            <h4>Total Pendapatan</h4>
            <p>{formatRupiah(stats.totalRevenue)}</p>
          </div>
        </div>

        <div className="stats-card">
          <div className="stats-icon" style={{ backgroundColor: '#fffbeb', color: '#f59e0b' }}>
            <CreditCard size={24} />
          </div>
          <div className="stats-info">
            <h4>Total Ditarik</h4>
            <p>{formatRupiah(stats.totalWithdrawn)}</p>
          </div>
        </div>

        <div className="stats-card">
          <div className="stats-icon" style={{ backgroundColor: '#fdf2f8', color: '#db2777' }}>
            <Percent size={24} />
          </div>
          <div className="stats-info">
            <h4>Rasio Okupansi</h4>
            <p>{stats.occupancyRate}%</p>
          </div>
        </div>
      </div>

      {/* Main Action Buttons */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '40px' }}>
        <button className="btn btn-primary" onClick={onOpenWithdraw}>
          <Landmark size={16} />
          Tarik Dana (Withdraw)
        </button>
        <button className="btn btn-secondary" onClick={onOpenAddProperty}>
          <Plus size={16} />
          Tambah Properti Baru
        </button>
      </div>

      {/* Financial Summary & Withdrawal History */}
      <div className="grid-2">
        <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
          <h3 style={{ fontSize: '18px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
            Rincian Operasional
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="flex-between">
              <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Properti Anda</span>
              <strong style={{ fontSize: '16px' }}>{stats.totalProperti} Unit</strong>
            </div>
            <div className="flex-between">
              <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Kamar Terisi (Penghuni)</span>
              <strong style={{ fontSize: '16px' }}>{stats.occupiedRooms} / {stats.totalRooms} Kamar</strong>
            </div>
            <div className="flex-between">
              <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Jumlah Review Masuk</span>
              <strong style={{ fontSize: '16px' }}>{stats.reviewsCount} Ulasan</strong>
            </div>
            <div className="flex-between">
              <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Metode Pencairan Utama</span>
              <strong style={{ fontSize: '16px' }}>{landlordUser?.bankName} - {landlordUser?.bankAccountNumber}</strong>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
          <h3 style={{ fontSize: '18px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
            Riwayat Penarikan Dana
          </h3>
          {stats.withdrawals.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>Belum ada riwayat penarikan dana.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '180px', overflowY: 'auto' }}>
              {stats.withdrawals.map((w) => {
                const isRejected = w.status === 'rejected';
                const isCompleted = w.status === 'completed';
                const isProcessing = w.status === 'processing';
                return (
                  <div key={w.id} className="flex-between" style={{ padding: '10px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '13px' }}>Transfer ke {w.bankName}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{w.date} &bull; Rek: {w.accountNumber}</p>
                      {isRejected && w.rejectionReason && (
                        <p style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '2px' }}>
                          Alasan: {w.rejectionReason} (Saldo telah dikembalikan)
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontWeight: 700, fontSize: '14px', color: isRejected ? 'var(--text-muted)' : 'var(--danger)', textDecoration: isRejected ? 'line-through' : 'none' }}>
                        -{formatRupiah(w.amount)}
                      </p>
                      <span
                        className={`badge ${isCompleted ? 'badge-success' : isRejected ? 'badge-danger' : isProcessing ? 'badge-warning' : 'badge-secondary'}`}
                        style={{ fontSize: '10px', padding: '2px 6px', display: 'inline-block', marginTop: '2px' }}
                        title={w.rejectionReason ? `Alasan penolakan: ${w.rejectionReason}` : undefined}
                      >
                        {isCompleted ? 'Selesai' : isRejected ? 'Ditolak' : isProcessing ? 'Diproses' : 'Menunggu'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
