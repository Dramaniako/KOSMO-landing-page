import React, { useState, useEffect, useCallback } from 'react';
import {
  Wrench,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Wifi,
  Zap,
  Droplet,
  Sparkles,
  Wind,
  HelpCircle,
  RefreshCw
} from 'lucide-react';
import { MaintenanceTicket, Rental, TicketCategory, TicketStatus } from '../../../types/index';
import { request } from '../../../services/apiClient';
import { MaintenanceTicketModal } from './MaintenanceTicketModal';

interface MaintenanceSectionProps {
  activeRentals: Rental[];
}

const CATEGORY_META: Record<TicketCategory, { label: string; icon: React.ReactNode }> = {
  ac: { label: 'AC & Pendingin', icon: <Wind size={14} /> },
  plumbing: { label: 'Plumbing & Saluran Air', icon: <Droplet size={14} /> },
  wifi: { label: 'WiFi & Internet', icon: <Wifi size={14} /> },
  electricity: { label: 'Kelistrikan', icon: <Zap size={14} /> },
  cleaning: { label: 'Kebersihan', icon: <Sparkles size={14} /> },
  other: { label: 'Lainnya', icon: <HelpCircle size={14} /> }
};

const STATUS_BADGE: Record<TicketStatus, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  open: {
    label: 'Menunggu Tanggapan',
    bg: '#fef3c7',
    text: '#b45309',
    icon: <Clock size={12} />
  },
  in_progress: {
    label: 'Sedang Dikerjakan',
    bg: '#e0f2fe',
    text: '#0369a1',
    icon: <Wrench size={12} />
  },
  resolved: {
    label: 'Selesai',
    bg: '#dcfce7',
    text: '#15803d',
    icon: <CheckCircle2 size={12} />
  },
  cancelled: {
    label: 'Dibatalkan',
    bg: '#fee2e2',
    text: '#b91c1c',
    icon: <XCircle size={12} />
  }
};

export const MaintenanceSection: React.FC<MaintenanceSectionProps> = ({ activeRentals }) => {
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await request<MaintenanceTicket[]>('/api/tickets');
      setTickets(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load maintenance tickets:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const filteredTickets = tickets.filter(t => {
    if (filterStatus === 'all') return true;
    return t.status === filterStatus;
  });

  const hasActiveRental = activeRentals.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Banner Card */}
      <div className="card" style={{ padding: '24px', borderRadius: '16px', background: 'var(--bg-card, #ffffff)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                backgroundColor: 'var(--primary-light, #eff6ff)',
                color: 'var(--primary, #2563eb)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Wrench size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Tiket Pemeliharaan & Perbaikan</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted, #64748b)', margin: '4px 0 0 0' }}>
                Laporkan kendala fasilitas di kos Anda langsung kepada pemilik properti.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={fetchTickets}
              disabled={isLoading}
              title="Perbarui daftar tiket"
              style={{ padding: '8px 12px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              type="button"
              className="btn btn-primary"
              disabled={!hasActiveRental}
              onClick={() => setIsModalOpen(true)}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: !hasActiveRental ? 0.6 : 1,
                cursor: !hasActiveRental ? 'not-allowed' : 'pointer'
              }}
            >
              <Plus size={16} />
              <span>Ajukan Tiket Baru</span>
            </button>
          </div>
        </div>

        {!hasActiveRental && (
          <div
            style={{
              marginTop: '16px',
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: '#fffbeb',
              border: '1px solid #fef3c7',
              color: '#92400e',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>
              Anda belum memiliki hunian sewa kos yang berstatus aktif. Tiket perbaikan hanya dapat diajukan oleh penyewa dengan sewa aktif.
            </span>
          </div>
        )}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: 'Semua Tiket' },
          { key: 'open', label: 'Menunggu Tanggapan' },
          { key: 'in_progress', label: 'Sedang Dikerjakan' },
          { key: 'resolved', label: 'Selesai' }
        ].map(tab => {
          const count = tab.key === 'all' ? tickets.length : tickets.filter(t => t.status === tab.key).length;
          const isActive = filterStatus === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilterStatus(tab.key)}
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: isActive ? 'var(--primary, #2563eb)' : 'var(--border-color, #e2e8f0)',
                backgroundColor: isActive ? 'var(--primary, #2563eb)' : 'var(--bg-card, #ffffff)',
                color: isActive ? '#ffffff' : 'var(--text-color, #334155)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  fontSize: '11px',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  backgroundColor: isActive ? 'rgba(255, 255, 255, 0.25)' : '#f1f5f9',
                  color: isActive ? '#ffffff' : '#64748b'
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Tickets List */}
      {isLoading ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted, #64748b)' }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
          <p>Memuat daftar tiket pemeliharaan...</p>
        </div>
      ) : filteredTickets.length === 0 ? (
        <div
          className="card"
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            borderRadius: '16px',
            backgroundColor: 'var(--bg-card, #ffffff)'
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#94a3b8'
            }}
          >
            <CheckCircle2 size={28} />
          </div>
          <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 6px 0' }}>Tidak ada tiket pemeliharaan</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted, #64748b)', maxWidth: '400px', margin: '0 auto' }}>
            {filterStatus === 'all'
              ? 'Fasilitas kos Anda berjalan lancar! Klik tombol di atas jika ada kendala yang perlu diperbaiki.'
              : `Tidak ada tiket dengan status "${filterStatus}".`}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filteredTickets.map(ticket => {
            const statusConfig = STATUS_BADGE[ticket.status] || STATUS_BADGE.open;
            const categoryConfig = CATEGORY_META[ticket.category] || CATEGORY_META.other;
            const formattedDate = ticket.createdAt
              ? new Date(ticket.createdAt).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })
              : '';

            return (
              <div
                key={ticket.id}
                className="card"
                style={{
                  padding: '20px',
                  borderRadius: '14px',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  backgroundColor: 'var(--bg-card, #ffffff)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Category badge */}
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 9px',
                        borderRadius: '6px',
                        backgroundColor: '#f1f5f9',
                        color: '#334155',
                        fontSize: '12px',
                        fontWeight: 600
                      }}
                    >
                      {categoryConfig.icon}
                      {categoryConfig.label}
                    </span>

                    {/* Status badge */}
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 10px',
                        borderRadius: '20px',
                        backgroundColor: statusConfig.bg,
                        color: statusConfig.text,
                        fontSize: '12px',
                        fontWeight: 700
                      }}
                    >
                      {statusConfig.icon}
                      {statusConfig.label}
                    </span>
                  </div>

                  <span style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>{formattedDate}</span>
                </div>

                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0' }}>{ticket.title}</h3>

                <p style={{ fontSize: '14px', color: 'var(--text-color, #334155)', margin: '0 0 12px 0', lineHeight: 1.5 }}>
                  {ticket.description}
                </p>

                {/* Property & Room context footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', paddingTop: '12px', borderTop: '1px solid #f1f5f9', fontSize: '12px', color: 'var(--text-muted, #64748b)' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <span>
                      <strong>Properti:</strong> {ticket.propertyName || 'Properti Kos'}
                    </span>
                    {ticket.roomNumber && (
                      <span>
                        <strong>Kamar:</strong> {ticket.roomNumber}
                      </span>
                    )}
                  </div>

                  {ticket.photoUrl && (
                    <button
                      type="button"
                      onClick={() => setSelectedPhoto(ticket.photoUrl || null)}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: 'var(--primary, #2563eb)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        padding: 0
                      }}
                    >
                      <ExternalLink size={13} />
                      Lihat Foto Kendala
                    </button>
                  )}
                </div>

                {ticket.status === 'resolved' && ticket.resolvedAt && (
                  <div
                    style={{
                      marginTop: '12px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      backgroundColor: '#f0fdf4',
                      color: '#166534',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <CheckCircle2 size={14} />
                    <span>
                      Selesai ditangani pada{' '}
                      {new Date(ticket.resolvedAt).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Ticket Submission Modal */}
      <MaintenanceTicketModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        activeRentals={activeRentals}
        onTicketSubmitted={fetchTickets}
      />

      {/* Image Preview Modal */}
      {selectedPhoto && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedPhoto(null)}
          style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            className="modal-container"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '600px', width: '90%', padding: '20px', textAlign: 'center' }}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
              <button className="modal-close" onClick={() => setSelectedPhoto(null)}>
                <XCircle size={20} />
              </button>
            </div>
            <img
              src={selectedPhoto}
              alt="Bukti foto kendala"
              style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: '8px' }}
              onError={(e) => {
                const target = e.currentTarget;
                target.src = 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80';
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
