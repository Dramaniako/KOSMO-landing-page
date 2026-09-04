import React from 'react';
import { User as UserIcon, Building, FileText, MessageSquare, LogOut } from 'lucide-react';
import { User } from '../../../types/index';
import { useTranslation } from '../../../context/LanguageContext';

interface TenantSidebarProps {
  currentUser: User;
  activeTab: 'profile' | 'rentals' | 'bills' | 'reviews';
  onSelectTab: (tab: 'profile' | 'rentals' | 'bills' | 'reviews') => void;
  onLogout: () => void;
  onNavigateLandlord: () => void;
}

export const TenantSidebar: React.FC<TenantSidebarProps> = ({
  currentUser,
  activeTab,
  onSelectTab,
  onLogout,
  onNavigateLandlord
}) => {
  const { t } = useTranslation();

  return (
    <aside className="sidebar">
      <div>
        {/* Tenant short profile summary */}
        <div style={{ textAlign: 'center', marginBottom: '32px', padding: '0 8px' }}>
          <div style={{ position: 'relative', width: '72px', height: '72px', margin: '0 auto 12px', borderRadius: '50%', backgroundColor: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserIcon size={36} style={{ color: 'var(--primary)' }} />
            <div style={{ position: 'absolute', bottom: '0', right: '0', background: 'var(--success)', border: '2px solid white', width: '18px', height: '18px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '6px', height: '6px', backgroundColor: 'white', borderRadius: '50%' }}></div>
            </div>
          </div>
          <h3 style={{ fontSize: '18px' }}>{currentUser.name}</h3>
          <span className="badge badge-success" style={{ fontSize: '10px', marginTop: '6px' }}>
            Akun Terverifikasi
          </span>
        </div>

        <ul className="sidebar-links">
          <li>
            <button 
              className={`sidebar-link ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => onSelectTab('profile')}
            >
              <UserIcon size={18} />
              {t('tenant.tab.profile')}
            </button>
          </li>
          <li>
            <button 
              className={`sidebar-link ${activeTab === 'rentals' ? 'active' : ''}`}
              onClick={() => onSelectTab('rentals')}
            >
              <Building size={18} />
              {t('tenant.tab.rentals')}
            </button>
          </li>
          <li>
            <button 
              className={`sidebar-link ${activeTab === 'bills' ? 'active' : ''}`}
              onClick={() => onSelectTab('bills')}
            >
              <FileText size={18} />
              {t('tenant.tab.bills')}
            </button>
          </li>
          <li>
            <button 
              className={`sidebar-link ${activeTab === 'reviews' ? 'active' : ''}`}
              onClick={() => onSelectTab('reviews')}
            >
              <MessageSquare size={18} />
              {t('tenant.tab.reviews')}
            </button>
          </li>
          {currentUser.role === 'landlord' && (
            <li>
              <button 
                className="sidebar-link"
                style={{ color: 'var(--primary)' }}
                onClick={onNavigateLandlord}
              >
                <Building size={18} />
                Sesi Landlord
              </button>
            </li>
          )}
        </ul>
      </div>

      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
        <button className="sidebar-link" style={{ width: '100%', border: 'none', background: 'none', color: 'var(--danger)' }} onClick={onLogout}>
          <LogOut size={18} />
          {t('nav.logout')}
        </button>
      </div>
    </aside>
  );
};
