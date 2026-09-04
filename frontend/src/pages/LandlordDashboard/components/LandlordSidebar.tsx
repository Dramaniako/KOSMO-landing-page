import React from 'react';
import { Building, LayoutDashboard, MessageSquare, Users, LogOut } from 'lucide-react';

export interface LandlordSidebarProps {
  activeTab: 'overview' | 'properties' | 'reviews' | 'tenants';
  setActiveTab: (tab: 'overview' | 'properties' | 'reviews' | 'tenants') => void;
  onLogout: () => void;
}

export default function LandlordSidebar({
  activeTab,
  setActiveTab,
  onLogout
}: LandlordSidebarProps) {
  return (
    <aside className="sidebar">
      <div>
        <div className="nav-brand" style={{ marginBottom: '40px', paddingLeft: '16px' }}>
          <Building size={26} />
          <span>KOSMO Landlord</span>
        </div>

        <ul className="sidebar-links">
          <li>
            <button
              className={`sidebar-link ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <LayoutDashboard size={18} />
              Dasbor Keuangan
            </button>
          </li>
          <li>
            <button
              className={`sidebar-link ${activeTab === 'properties' ? 'active' : ''}`}
              onClick={() => setActiveTab('properties')}
            >
              <Building size={18} />
              Kelola Properti
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
              className={`sidebar-link ${activeTab === 'tenants' ? 'active' : ''}`}
              onClick={() => setActiveTab('tenants')}
            >
              <Users size={18} />
              Sesi Penyewa
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
          Keluar Dashboard
        </button>
      </div>
    </aside>
  );
}
