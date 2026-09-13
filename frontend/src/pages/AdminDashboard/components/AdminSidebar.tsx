import React from 'react';
import { Users, Building, MessageSquare, Landmark, BarChart3, LogOut } from 'lucide-react';
import JuraganKostLogo from '../../../components/JuraganKostLogo';

export interface AdminSidebarProps {
  activeTab: 'users' | 'properties' | 'reviews' | 'tracking' | 'withdrawals';
  setActiveTab: (tab: 'users' | 'properties' | 'reviews' | 'tracking' | 'withdrawals') => void;
  pendingWithdrawalsCount: number;
  onLogout: () => void;
}

export default function AdminSidebar({
  activeTab,
  setActiveTab,
  pendingWithdrawalsCount,
  onLogout
}: AdminSidebarProps) {
  return (
    <aside className="sidebar sidebar-dark-theme">
      <div>
        <div className="nav-brand" style={{ marginBottom: '36px', paddingLeft: '12px' }}>
          <JuraganKostLogo variant="white" size="md" subtitle="Admin" />
        </div>

        <ul className="sidebar-links">
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
              Kelola Review
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
              className={`sidebar-link ${activeTab === 'tracking' ? 'active' : ''}`}
              onClick={() => setActiveTab('tracking')}
            >
              <BarChart3 size={18} />
              Tracking Pengunjung
            </button>
          </li>
        </ul>
      </div>

      <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '20px' }}>
        <button
          className="sidebar-link"
          style={{ width: '100%', border: 'none', background: 'none', color: '#fca5a5' }}
          onClick={onLogout}
        >
          <LogOut size={18} />
          Keluar Panel
        </button>
      </div>
    </aside>
  );
}
