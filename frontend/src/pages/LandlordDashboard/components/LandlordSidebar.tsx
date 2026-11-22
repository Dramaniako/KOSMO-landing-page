import React from 'react';
import { Building, LayoutDashboard, MessageSquare, Users, LogOut, Wrench, Compass } from 'lucide-react';
import KosmoLogo from '../../../components/KosmoLogo';
import { useTranslation } from '../../../context/LanguageContext';

export interface LandlordSidebarProps {
  activeTab: 'overview' | 'properties' | 'reviews' | 'tenants' | 'maintenance';
  setActiveTab: (tab: 'overview' | 'properties' | 'reviews' | 'tenants' | 'maintenance') => void;
  onOpenOnboarding?: () => void;
  onLogout: () => void;
}

export default function LandlordSidebar({
  activeTab,
  setActiveTab,
  onOpenOnboarding,
  onLogout
}: LandlordSidebarProps) {
  const { t } = useTranslation();

  return (
    <aside className="sidebar">
      <div>
        <div className="nav-brand" style={{ marginBottom: '40px', paddingLeft: '8px' }}>
          <KosmoLogo size={34} title="KOSMO" badgeText="Landlord" />
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
          <li>
            <button
              className={`sidebar-link ${activeTab === 'maintenance' ? 'active' : ''}`}
              onClick={() => setActiveTab('maintenance')}
            >
              <Wrench size={18} />
              Pemeliharaan Unit
            </button>
          </li>
          {onOpenOnboarding && (
            <li>
              <button
                type="button"
                data-testid="sidebar-onboarding-btn"
                className="sidebar-link"
                onClick={onOpenOnboarding}
              >
                <Compass size={18} />
                {t('onboarding.sidebarLink')}
              </button>
            </li>
          )}
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
