import React, { useState, useEffect, useCallback } from 'react';
import {
  Wrench,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Wifi,
  Zap,
  Droplet,
  Sparkles,
  Wind,
  HelpCircle,
  RefreshCw,
  User,
  Building,
  Loader2,
  XCircle
} from 'lucide-react';
import { MaintenanceTicket, TicketCategory, TicketStatus } from '../../../types/index';
import { request } from '../../../services/apiClient';

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

export default function MaintenanceTab() {
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      const data = await request<MaintenanceTicket[]>('/api/tickets');
      setTickets(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load tickets for landlord:', err);
      setFeedbackMsg({ type: 'error', text: 'Gagal memuat tiket pemeliharaan.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const handleUpdateStatus = async (ticketId: string, newStatus: TicketStatus) => {
    try {
      setUpdatingId(ticketId);
      setFeedbackMsg(null);

      const updated = await request<MaintenanceTicket>(`/api/tickets/${ticketId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });

      setTickets(prev =>
        prev.map(t => (t.id === ticketId ? { ...t, ...updated } : t))
      );

      setFeedbackMsg({
        type: 'success',
        text: `Status tiket berhasil diubah menjadi "${STATUS_BADGE[newStatus]?.label || newStatus}".`
      });

      setTimeout(() => {
        setFeedbackMsg(null);
      }, 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui status tiket.';
      setFeedbackMsg({ type: 'error', text: msg });
    } finally {
      setUpdatingId(null);
    }
  };

  const openCount = tickets.filter(t => t.status === 'open').length;
  const inProgressCount = tickets.filter(t => t.status === 'in_progress').length;
  const resolvedCount = tickets.filter(t => t.status === 'resolved').length;

  const filteredTickets = tickets.filter(t => {
    if (filterStatus === 'all') return true;
    return t.status === filterStatus;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header & Stats Banner */}
      <div className="card" style={{ padding: '24px', borderRadius: '16px', backgroundColor: 'var(--bg-card, #ffffff)' }}>
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
              <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Kelola Pemeliharaan & Tiket Unit</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted, #64748b)', margin: '4px 0 0 0' }}>
                Pantau laporan kendala fasilitas dari penyewa Anda dan perbarui status pengerjaan secara real-time.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchTickets}
            disabled={loading}
            style={{ padding: '8px 14px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>Perbarui</span>
          </button>
        </div>

        {/* Quick KPI stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginTop: '20px' }}>
          <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '12px', color: '#64748b' }}>Total Laporan</span>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>{tickets.length}</div>
          </div>

          <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: '#fffbeb', border: '1px solid #fef3c7' }}>
            <span style={{ fontSize: '12px', color: '#b45309' }}>Menunggu Tanggapan</span>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#d97706', marginTop: '4px' }}>{openCount}</div>
          </div>

          <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: '#f0f9ff', border: '1px solid #e0f2fe' }}>
            <span style={{ fontSize: '12px', color: '#0369a1' }}>Sedang Dikerjakan</span>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#0284c7', marginTop: '4px' }}>{inProgressCount}</div>
          </div>

          <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: '#f0fdf4', border: '1px solid #dcfce7' }}>
            <span style={{ fontSize: '12px', color: '#15803d' }}>Telah Diselesaikan</span>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#16a34a', marginTop: '4px' }}>{resolvedCount}</div>
          </div>
        </div>
      </div>

      {feedbackMsg && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: feedbackMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${feedbackMsg.type === 'success' ? '#dcfce7' : '#fee2e2'}`,
            color: feedbackMsg.type === 'success' ? '#15803d' : '#dc2626',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          {feedbackMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

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

      {/* Ticket List */}
      {loading ? (
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
          <h3 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 6px 0' }}>Tidak ada tiket kendala</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted, #64748b)', maxWidth: '400px', margin: '0 auto' }}>
            Semua fasilitas unit properti berjalan dengan baik. Laporan kendala baru dari penyewa akan muncul di sini.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filteredTickets.map(ticket => {
            const statusConfig = STATUS_BADGE[ticket.status] || STATUS_BADGE.open;
            const categoryConfig = CATEGORY_META[ticket.category] || CATEGORY_META.other;
            const isUpdating = updatingId === ticket.id;
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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

                <p style={{ fontSize: '14px', color: 'var(--text-color, #334155)', margin: '0 0 14px 0', lineHeight: 1.5 }}>
                  {ticket.description}
                </p>

                {/* Property, Room, and Tenant Metadata */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', padding: '10px 14px', borderRadius: '8px', backgroundColor: '#f8fafc', fontSize: '12px', color: '#475569', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Building size={14} className="text-blue-600" />
                    <span>
                      <strong>Properti:</strong> {ticket.propertyName || 'Properti Kos'}
                    </span>
                  </div>

                  {ticket.roomNumber && (
                    <div>
                      <span>
                        <strong>Kamar:</strong> {ticket.roomNumber}
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <User size={14} className="text-blue-600" />
                    <span>
                      <strong>Penyewa:</strong> {ticket.tenantName || 'Penyewa'}
                    </span>
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
                      Foto Bukti
                    </button>
                  )}
                </div>

                {/* Landlord Action Controls */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Ubah Status:</span>
                    <button
                      type="button"
                      data-testid={`btn-in-progress-${ticket.id}`}
                      aria-label="Tandai sedang dikerjakan"
                      disabled={isUpdating || ticket.status === 'in_progress'}
                      onClick={() => handleUpdateStatus(ticket.id, 'in_progress')}
                      className="btn"
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        borderRadius: '6px',
                        backgroundColor: ticket.status === 'in_progress' ? '#e0f2fe' : '#f1f5f9',
                        color: ticket.status === 'in_progress' ? '#0369a1' : '#334155',
                        border: '1px solid #cbd5e1',
                        cursor: ticket.status === 'in_progress' || isUpdating ? 'default' : 'pointer'
                      }}
                    >
                      {isUpdating ? <Loader2 size={12} className="animate-spin" /> : <Wrench size={12} />}
                      <span style={{ marginLeft: '4px' }}>Sedang Dikerjakan</span>
                    </button>

                    <button
                      type="button"
                      data-testid={`btn-resolved-${ticket.id}`}
                      aria-label="Tandai selesai"
                      disabled={isUpdating || ticket.status === 'resolved'}
                      onClick={() => handleUpdateStatus(ticket.id, 'resolved')}
                      className="btn"
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        borderRadius: '6px',
                        backgroundColor: ticket.status === 'resolved' ? '#dcfce7' : '#f1f5f9',
                        color: ticket.status === 'resolved' ? '#15803d' : '#334155',
                        border: '1px solid #cbd5e1',
                        cursor: ticket.status === 'resolved' || isUpdating ? 'default' : 'pointer'
                      }}
                    >
                      {isUpdating ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                      <span style={{ marginLeft: '4px' }}>Tandai Selesai</span>
                    </button>
                  </div>

                  {ticket.status === 'resolved' && ticket.resolvedAt && (
                    <span style={{ fontSize: '12px', color: '#15803d', fontWeight: 500 }}>
                      Terselesaikan pada{' '}
                      {new Date(ticket.resolvedAt).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Photo Viewer Modal */}
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
}
