import React, { useMemo } from 'react';
import { DollarSign, ArrowUpRight, CreditCard, Percent, Landmark, Plus, AlertTriangle, Wrench, Compass } from 'lucide-react';
import { User, LandlordStats, Rental, MaintenanceTicket } from '../../../types/index';
import { formatRupiah } from '../../../utils/format';
import { useTranslation } from '../../../context/LanguageContext';
import { shimmerStyle } from '../types';

export interface OverviewTabProps {
  stats: LandlordStats;
  landlordUser: User | null;
  loading: boolean;
  rentals?: Rental[];
  tickets?: MaintenanceTicket[];
  onOpenWithdraw: () => void;
  onOpenAddProperty: () => void;
  onNavigateTab?: (tab: 'overview' | 'properties' | 'reviews' | 'tenants' | 'maintenance') => void;
  onStartOnboarding?: () => void;
}

export default function OverviewTab({
  stats,
  landlordUser,
  loading,
  rentals,
  tickets,
  onOpenWithdraw,
  onOpenAddProperty,
  onNavigateTab,
  onStartOnboarding
}: OverviewTabProps) {
  const { t } = useTranslation();
  const needsOnboarding =
    Boolean(onStartOnboarding) &&
    (stats.totalProperti === 0 || (!landlordUser?.bankAccountNumber && !stats.bankAccountNumber));
  const expiringLeases = useMemo(() => {
    if (!rentals) return [];
    return rentals.filter(
      (r) => r.status === 'active' && ((r.daysRemaining !== undefined && r.daysRemaining <= 7) || r.paymentStatus === 'Menjelang Jatuh Tempo')
    );
  }, [rentals]);

  const openTickets = useMemo(() => {
    if (!tickets) return [];
    return tickets.filter((t) => t.status === 'open' || t.status === 'in_progress');
  }, [tickets]);
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
      {needsOnboarding && onStartOnboarding && (
        <div
          data-testid="landlord-onboarding-banner"
          style={{
            padding: '18px 20px',
            marginBottom: '24px',
            borderRadius: '12px',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                backgroundColor: 'var(--primary-light)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Compass size={22} />
            </div>
            <div>
              <strong style={{ fontSize: '15px', color: 'var(--text-main)' }}>
                {t('onboarding.bannerTitle')}
              </strong>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {t('onboarding.bannerDesc')}
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="overview-start-onboarding-btn"
            className="btn btn-primary"
            onClick={onStartOnboarding}
            style={{ fontSize: '13px', padding: '10px 16px' }}
          >
            <Compass size={15} />
            {t('onboarding.bannerCta')}
          </button>
        </div>
      )}

      {/* Operational Alert Banners */}
      {(expiringLeases.length > 0 || openTickets.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
          {expiringLeases.length > 0 && (
            <div
              data-testid="alert-expiring-leases"
              style={{
                padding: '16px',
                backgroundColor: '#fffbeb',
                border: '1px solid #fef3c7',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ backgroundColor: '#fef3c7', padding: '8px', borderRadius: '8px', color: '#b45309' }}>
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <strong style={{ fontSize: '14px', color: '#92400e' }}>
                    Perhatian: {expiringLeases.length} Sewa Segera Jatuh Tempo / Berakhir (&le; 7 hari)
                  </strong>
                  <p style={{ fontSize: '12px', color: '#b45309', marginTop: '2px' }}>
                    {expiringLeases.map((r) => `${r.tenantName || 'Penyewa'} (${r.propertyName}${r.roomNumber ? ' - Kmr ' + r.roomNumber : ''})`).slice(0, 2).join(', ')}
                    {expiringLeases.length > 2 ? ` dan ${expiringLeases.length - 2} lainnya` : ''}
                  </p>
                </div>
              </div>
              {onNavigateTab && (
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: '#ffffff', borderColor: '#fde68a', color: '#92400e' }}
                  onClick={() => onNavigateTab('tenants')}
                >
                  Kelola di Tab Penyewa &rarr;
                </button>
              )}
            </div>
          )}

          {openTickets.length > 0 && (
            <div
              data-testid="alert-open-tickets"
              style={{
                padding: '16px',
                backgroundColor: '#eff6ff',
                border: '1px solid #dbeafe',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ backgroundColor: '#dbeafe', padding: '8px', borderRadius: '8px', color: '#1d4ed8' }}>
                  <Wrench size={20} />
                </div>
                <div>
                  <strong style={{ fontSize: '14px', color: '#1e40af' }}>
                    Perhatian: {openTickets.length} Tiket Pemeliharaan Menunggu Tanggapan
                  </strong>
                  <p style={{ fontSize: '12px', color: '#2563eb', marginTop: '2px' }}>
                    {openTickets.map((t) => `${t.title} (${t.propertyName || 'Unit'})`).slice(0, 2).join(', ')}
                    {openTickets.length > 2 ? ` dan ${openTickets.length - 2} lainnya` : ''}
                  </p>
                </div>
              </div>
              {onNavigateTab && (
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ fontSize: '12px', padding: '6px 12px', backgroundColor: '#ffffff', borderColor: '#bfdbfe', color: '#1e40af' }}
                  onClick={() => onNavigateTab('maintenance')}
                >
                  Tinjau Pemeliharaan &rarr;
                </button>
              )}
            </div>
          )}
        </div>
      )}

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
        <div className="card" style={{ padding: '24px' }}>
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

            <div style={{ marginTop: '16px', padding: '16px', backgroundColor: 'var(--bg-main)', borderRadius: '8px', border: '1px solid var(--border-color)' }} data-testid="saved-bank-details">
              <div className="flex-between" style={{ marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Landmark size={15} style={{ color: '#2563eb' }} /> Rekening Pencairan Terdaftar
                </span>
                {landlordUser?.bankAccountNumber || stats.bankAccountNumber ? (
                  <span className="badge badge-success" style={{ fontSize: '10px' }}>Terverifikasi</span>
                ) : (
                  <span className="badge badge-secondary" style={{ fontSize: '10px' }}>Belum Diatur</span>
                )}
              </div>
              {landlordUser?.bankAccountNumber || stats.bankAccountNumber ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <strong style={{ fontSize: '15px', color: 'var(--text-main)' }}>
                      {landlordUser?.bankName || stats.bankName || 'Bank Tujuan'}
                    </strong>
                    <span style={{ fontSize: '14px', fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 600 }}>
                      {landlordUser?.bankAccountNumber || stats.bankAccountNumber}
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Atas Nama: <strong style={{ color: 'var(--text-main)' }}>{landlordUser?.bankAccountHolder || stats.bankAccountHolder || landlordUser?.name || '-'}</strong>
                  </p>
                </>
              ) : (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '4px' }}>
                  Rekening pencairan akan tersimpan otomatis saat Anda mengajukan penarikan dana pertama kali.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '24px' }}>
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
                  <div key={w.id} className="flex-between" style={{ padding: '10px', background: 'var(--bg-main)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
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
