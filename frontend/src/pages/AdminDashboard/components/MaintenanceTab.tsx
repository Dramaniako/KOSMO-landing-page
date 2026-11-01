import React, { useState, useMemo } from 'react';
import {
  Wrench,
  Clock,
  CheckCircle2,
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
  XCircle,
  Search
} from 'lucide-react';
import { MaintenanceTicket, TicketCategory, TicketStatus } from '../../../types/index';

const CATEGORY_META: Record<TicketCategory, { label: string; icon: React.ReactNode }> = {
  ac: { label: 'AC & Pendingin', icon: <Wind size={14} /> },
  plumbing: { label: 'Plumbing & Saluran Air', icon: <Droplet size={14} /> },
  wifi: { label: 'WiFi & Internet', icon: <Wifi size={14} /> },
  electricity: { label: 'Kelistrikan', icon: <Zap size={14} /> },
  cleaning: { label: 'Kebersihan', icon: <Sparkles size={14} /> },
  other: { label: 'Lainnya', icon: <HelpCircle size={14} /> }
};

const STATUS_BADGE: Record<TicketStatus, { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  open: { label: 'Menunggu Tanggapan', bg: 'rgba(245, 158, 11, 0.15)', text: '#d97706', icon: <Clock size={12} /> },
  in_progress: { label: 'Sedang Dikerjakan', bg: 'rgba(14, 165, 233, 0.15)', text: '#0284c7', icon: <Wrench size={12} /> },
  resolved: { label: 'Selesai', bg: 'rgba(16, 185, 129, 0.15)', text: '#16a34a', icon: <CheckCircle2 size={12} /> },
  cancelled: { label: 'Dibatalkan', bg: 'rgba(239, 68, 68, 0.15)', text: '#dc2626', icon: <XCircle size={12} /> }
};

export interface MaintenanceTabProps {
  tickets: MaintenanceTicket[];
  loading: boolean;
  onRefresh: () => void;
  onUpdateStatus: (ticketId: string, status: TicketStatus) => Promise<void>;
}

export default function MaintenanceTab({
  tickets,
  loading,
  onRefresh,
  onUpdateStatus
}: MaintenanceTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const openCount = tickets.filter((t) => t.status === 'open').length;
  const inProgressCount = tickets.filter((t) => t.status === 'in_progress').length;
  const resolvedCount = tickets.filter((t) => t.status === 'resolved').length;

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase().trim();
      const titleMatch = t.title?.toLowerCase().includes(q) ?? false;
      const propMatch = t.propertyName?.toLowerCase().includes(q) ?? false;
      const tenantMatch = t.tenantName?.toLowerCase().includes(q) ?? false;
      const roomMatch = t.roomNumber?.toLowerCase().includes(q) ?? false;
      return titleMatch || propMatch || tenantMatch || roomMatch;
    });
  }, [tickets, filterStatus, searchTerm]);

  const handleStatusChange = async (ticketId: string, newStatus: TicketStatus) => {
    setUpdatingId(ticketId);
    try {
      await onUpdateStatus(ticketId, newStatus);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header & KPI Summary */}
      <div className="card" style={{ padding: '24px' }}>
        <div className="flex-between flex-wrap gap-4" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Wrench size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                Tiket & Komplain Pemeliharaan Unit
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                Pantau seluruh keluhan fasilitas dari penyewa di seluruh properti dan koordinasikan status penanganan.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onRefresh}
            disabled={loading}
            style={{ padding: '8px 14px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>Perbarui Data</span>
          </button>
        </div>

        {/* Quick KPI stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
          <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Total Tiket</span>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-main)', marginTop: '4px' }}>{tickets.length}</div>
          </div>
          <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
            <span style={{ fontSize: '12px', color: '#d97706' }}>Menunggu Tanggapan</span>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#d97706', marginTop: '4px' }}>{openCount}</div>
          </div>
          <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: 'rgba(14, 165, 233, 0.1)', border: '1px solid rgba(14, 165, 233, 0.25)' }}>
            <span style={{ fontSize: '12px', color: '#0284c7' }}>Sedang Dikerjakan</span>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#0284c7', marginTop: '4px' }}>{inProgressCount}</div>
          </div>
          <div style={{ padding: '14px', borderRadius: '10px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
            <span style={{ fontSize: '12px', color: '#16a34a' }}>Selesai</span>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#16a34a', marginTop: '4px' }}>{resolvedCount}</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Semua Tiket' },
            { key: 'open', label: 'Menunggu' },
            { key: 'in_progress', label: 'Dikerjakan' },
            { key: 'resolved', label: 'Selesai' }
          ].map((tab) => {
            const count = tab.key === 'all' ? tickets.length : tickets.filter((t) => t.status === tab.key).length;
            const isActive = filterStatus === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilterStatus(tab.key)}
                data-testid={`filter-ticket-${tab.key}`}
                className={`btn ${isActive ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <span>{tab.label}</span>
                <span
                  style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    backgroundColor: isActive ? 'rgba(255, 255, 255, 0.25)' : 'var(--border-color)',
                    color: isActive ? '#ffffff' : 'var(--text-muted)'
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Cari tiket, properti, penyewa..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="tickets-search-input"
            style={{ paddingLeft: '32px', width: '100%', fontSize: '13px' }}
          />
        </div>
      </div>

      {/* Ticket List Cards */}
      {loading ? (
        <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
          <p>Memuat daftar tiket pemeliharaan...</p>
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="card" style={{ padding: '48px 24px', textAlign: 'center' }} data-testid="tickets-empty-state">
          <CheckCircle2 size={32} style={{ color: 'var(--success)', margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)', margin: '0 0 6px 0' }}>Tidak ada tiket pemeliharaan</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto' }}>
            {searchTerm || filterStatus !== 'all'
              ? 'Tidak ada tiket yang cocok dengan filter atau kata kunci pencarian.'
              : 'Semua fasilitas unit properti berjalan dengan baik tanpa ada laporan kendala yang tertunda.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filteredTickets.map((ticket) => {
            const statusConfig = STATUS_BADGE[ticket.status] || STATUS_BADGE.open;
            const categoryConfig = CATEGORY_META[ticket.category] || CATEGORY_META.other;
            const isUpdating = updatingId === ticket.id;

            return (
              <div key={ticket.id} className="card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 9px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-main)',
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

                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>

                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-main)' }}>{ticket.title}</h3>
                <p style={{ fontSize: '14px', color: 'var(--text-main)', margin: '0 0 14px 0', lineHeight: 1.5 }}>{ticket.description}</p>

                {/* Metadata */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Building size={14} style={{ color: 'var(--primary)' }} />
                    <span><strong>Properti:</strong> {ticket.propertyName || 'Properti Kos'}</span>
                  </div>
                  {ticket.roomNumber && (
                    <div><span><strong>Kamar:</strong> {ticket.roomNumber}</span></div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <User size={14} style={{ color: 'var(--primary)' }} />
                    <span><strong>Penyewa:</strong> {ticket.tenantName || 'Penyewa'}</span>
                  </div>
                  {ticket.photoUrl && (
                    <button
                      type="button"
                      onClick={() => setSelectedPhoto(ticket.photoUrl || null)}
                      style={{ border: 'none', background: 'none', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', cursor: 'pointer', padding: 0 }}
                    >
                      <ExternalLink size={13} />
                      Lihat Foto
                    </button>
                  )}
                </div>

                {/* Status Update Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Ubah Status:</span>
                    <button
                      type="button"
                      disabled={isUpdating || ticket.status === 'in_progress'}
                      onClick={() => handleStatusChange(ticket.id, 'in_progress')}
                      data-testid={`ticket-in-progress-${ticket.id}`}
                      className="btn"
                      style={{
                        padding: '5px 10px',
                        fontSize: '11px',
                        borderRadius: '6px',
                        backgroundColor: ticket.status === 'in_progress' ? 'rgba(14, 165, 233, 0.2)' : 'var(--bg-main)',
                        color: ticket.status === 'in_progress' ? '#0284c7' : 'var(--text-main)',
                        border: '1px solid var(--border-color)'
                      }}
                    >
                      {isUpdating ? <Loader2 size={11} className="animate-spin" /> : <Wrench size={11} />}
                      <span style={{ marginLeft: '4px' }}>Sedang Dikerjakan</span>
                    </button>
                    <button
                      type="button"
                      disabled={isUpdating || ticket.status === 'resolved'}
                      onClick={() => handleStatusChange(ticket.id, 'resolved')}
                      data-testid={`ticket-resolved-${ticket.id}`}
                      className="btn"
                      style={{
                        padding: '5px 10px',
                        fontSize: '11px',
                        borderRadius: '6px',
                        backgroundColor: ticket.status === 'resolved' ? 'rgba(16, 185, 129, 0.2)' : 'var(--bg-main)',
                        color: ticket.status === 'resolved' ? '#16a34a' : 'var(--text-main)',
                        border: '1px solid var(--border-color)'
                      }}
                    >
                      {isUpdating ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                      <span style={{ marginLeft: '4px' }}>Tandai Selesai</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Photo Modal */}
      {selectedPhoto && (
        <div className="modal-overlay" onClick={() => setSelectedPhoto(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%', padding: '20px', textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
              <button className="modal-close" onClick={() => setSelectedPhoto(null)}>
                <XCircle size={20} />
              </button>
            </div>
            <img src={selectedPhoto} alt="Bukti kendala" style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: '8px' }} />
          </div>
        </div>
      )}
    </div>
  );
}
