import React from 'react';
import { Users, Building, MessageSquare, Landmark, BarChart3, Wrench, LogOut } from 'lucide-react';
import KosmoLogo from '../../../components/KosmoLogo';

export interface AdminSidebarProps {
  activeTab: 'users' | 'properties' | 'reviews' | 'tracking' | 'withdrawals' | 'maintenance';
  setActiveTab: (tab: 'users' | 'properties' | 'reviews' | 'tracking' | 'withdrawals' | 'maintenance') => void;
  pendingWithdrawalsCount: number;
  openTicketsCount?: number;
  onLogout: () => void;
}

export default function AdminSidebar({
  activeTab,
  setActiveTab,
  pendingWithdrawalsCount,
  openTicketsCount,
  onLogout
}: AdminSidebarProps) {
  return (
    <aside className="sidebar">
      <div>
        <div className="nav-brand" style={{ marginBottom: '40px', paddingLeft: '8px' }}>
          <KosmoLogo size={34} variant="danger" title="KOSMO" badgeText="Admin" />
        </div>

        <ul className="sidebar-links">
          <li>
            <button
              className={`sidebar-link ${activeTab === 'tracking' ? 'active' : ''}`}
              onClick={() => setActiveTab('tracking')}
            >
              <BarChart3 size={18} />
              Statistik & Tracking
            </button>
          </li>
          <li>
            <button
              className={`sidebar-link ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              <Users size={18} />
              Manajemen User
            </button>
          </li>
          <li>
            <button
              className={`sidebar-link ${activeTab === 'properties' ? 'active' : ''}`}
              onClick={() => setActiveTab('properties')}
            >
              <Building size={18} />
              Manajemen Properti
            </button>
          </li>
          <li>
            <button
              className={`sidebar-link ${activeTab === 'reviews' ? 'active' : ''}`}
              onClick={() => setActiveTab('reviews')}
            >
              <MessageSquare size={18} />
              Manajemen Review
            </button>
          </li>
          <li>
            <button
              className={`sidebar-link ${activeTab === 'withdrawals' ? 'active' : ''}`}
              onClick={() => setActiveTab('withdrawals')}
            >
              <Landmark size={18} />
              Pencairan Dana ({pendingWithdrawalsCount})
            </button>
          </li>
          <li>
            <button
              className={`sidebar-link ${activeTab === 'maintenance' ? 'active' : ''}`}
              onClick={() => setActiveTab('maintenance')}
            >
              <Wrench size={18} />
              Tiket & Komplain
            </button>
          </li>
        </ul>
      </div>

      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
        <button
          className="sidebar-link"
          style={{ width: '100%', border: 'none', background: 'none', color: 'var(--danger)' }}
          onClick={onLogout}
        >
          <LogOut size={18} />
          Keluar Panel
        </button>
      </div>
    </aside>
  );
}
