import React from 'react';
import { Eye, Users, Key, Building, LayoutDashboard, Download } from 'lucide-react';
import { AdminStats, TrackingHistory } from '../../../types/index';
import VisitorChart from './VisitorChart';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export interface TrackingTabProps {
  stats: AdminStats | null;
  trackingHistory: TrackingHistory | null;
  timeRange: '24h' | '7d' | '30d';
  setTimeRange: (range: '24h' | '7d' | '30d') => void;
  loading: boolean;
  authToken: string;
}

export default function TrackingTab({
  stats,
  trackingHistory,
  timeRange,
  setTimeRange,
  loading,
  authToken
}: TrackingTabProps) {
  return (
    <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
      <div className="flex-between" style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '20px' }}>Tracking Pengunjung Website</h3>
        <a
          href={`${API_BASE}/reports/tracking/excel?token=${encodeURIComponent(authToken)}`}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}
        >
          <Download size={16} /> Unduh Laporan Excel
        </a>
      </div>

      {loading ? (
        <div className="flex-center" style={{ height: '200px', flexDirection: 'column', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Memuat statistik pengunjung...</p>
        </div>
      ) : stats ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px' }}>
            <div className="card" style={{ padding: '24px', background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', color: 'white', borderRadius: '16px' }}>
              <Eye size={28} style={{ marginBottom: '8px', opacity: 0.8 }} />
              <p style={{ fontSize: '32px', fontWeight: 700 }}>{stats.totalVisitors}</p>
              <p style={{ fontSize: '13px', opacity: 0.85 }}>Total Pengunjung Website</p>
            </div>
            <div className="card" style={{ padding: '24px', background: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)', color: 'white', borderRadius: '16px' }}>
              <Users size={28} style={{ marginBottom: '8px', opacity: 0.8 }} />
              <p style={{ fontSize: '32px', fontWeight: 700 }}>{stats.totalUsers}</p>
              <p style={{ fontSize: '13px', opacity: 0.85 }}>Total Pengguna Terdaftar</p>
            </div>
            <div className="card" style={{ padding: '24px', background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)', color: 'white', borderRadius: '16px' }}>
              <Key size={28} style={{ marginBottom: '8px', opacity: 0.8 }} />
              <p style={{ fontSize: '32px', fontWeight: 700 }}>{stats.totalLandlords}</p>
              <p style={{ fontSize: '13px', opacity: 0.85 }}>Total Landlord</p>
            </div>
            <div className="card" style={{ padding: '24px', background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)', color: 'white', borderRadius: '16px' }}>
              <Building size={28} style={{ marginBottom: '8px', opacity: 0.8 }} />
              <p style={{ fontSize: '32px', fontWeight: 700 }}>{stats.totalProperties}</p>
              <p style={{ fontSize: '13px', opacity: 0.85 }}>Total Properti</p>
            </div>
            <div className="card" style={{ padding: '24px', background: 'linear-gradient(135deg, #ec4899 0%, #f472b6 100%)', color: 'white', borderRadius: '16px' }}>
              <LayoutDashboard size={28} style={{ marginBottom: '8px', opacity: 0.8 }} />
              <p style={{ fontSize: '32px', fontWeight: 700 }}>{stats.totalRooms}</p>
              <p style={{ fontSize: '13px', opacity: 0.85 }}>Total Kamar</p>
            </div>
          </div>

          {/* Time Range Selector */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '32px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)' }}>Analisis Tren Aktivitas Pengunjung</h4>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className={`btn ${timeRange === '24h' ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '6px 16px', fontSize: '13px' }}
                onClick={() => setTimeRange('24h')}
              >
                24 Jam
              </button>
              <button
                type="button"
                className={`btn ${timeRange === '7d' ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '6px 16px', fontSize: '13px' }}
                onClick={() => setTimeRange('7d')}
              >
                1 Minggu
              </button>
              <button
                type="button"
                className={`btn ${timeRange === '30d' ? 'btn-primary' : 'btn-outline'}`}
                style={{ padding: '6px 16px', fontSize: '13px' }}
                onClick={() => setTimeRange('30d')}
              >
                1 Bulan
              </button>
            </div>
          </div>

          {/* Visitor Chart */}
          {trackingHistory ? (
            <VisitorChart
              data={
                timeRange === '24h'
                  ? trackingHistory.history24h
                  : timeRange === '7d'
                  ? trackingHistory.history7d
                  : trackingHistory.history30d
              }
              timeRange={timeRange}
            />
          ) : (
            <div style={{ height: '280px', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'center', alignItems: 'center', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <div style={{ width: '24px', height: '24px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite', marginRight: '8px' }}></div>
              <p style={{ color: 'var(--text-muted)' }}>Memuat data grafik...</p>
            </div>
          )}
        </>
      ) : (
        <p style={{ color: 'var(--text-muted)' }}>Memuat statistik...</p>
      )}
    </div>
  );
}
