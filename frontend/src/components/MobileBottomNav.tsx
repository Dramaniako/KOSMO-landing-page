import React from 'react';
import { Home, Search, Heart, MessageSquare, User } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

export default function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const getAccountPath = (): string => {
    try {
      const rawUser = localStorage.getItem('user');
      if (rawUser) {
        const user = JSON.parse(rawUser) as { role?: string };
        if (user.role === 'admin') return '/admin';
        if (user.role === 'landlord') return '/landlord';
        return '/tenant';
      }
    } catch {
      // ignore
    }
    return '/login';
  };

  const navItems = [
    { id: 'beranda', label: 'Beranda', icon: Home, getPath: () => '/' },
    { id: 'cari', label: 'Cari', icon: Search, getPath: () => '/#properties' },
    { id: 'favorit', label: 'Favorit', icon: Heart, getPath: () => (localStorage.getItem('user') ? '/tenant' : '/login') },
    { id: 'chat', label: 'Chat', icon: MessageSquare, getPath: () => (localStorage.getItem('user') ? '/tenant' : '/login') },
    { id: 'akun', label: 'Akun', icon: User, getPath: getAccountPath },
  ];

  const handleItemClick = (item: typeof navItems[0]) => {
    const targetPath = item.getPath();
    if (targetPath.startsWith('/#')) {
      const el = document.getElementById('properties');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      } else {
        navigate('/');
      }
    } else {
      navigate(targetPath);
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 md:hidden py-1.5 px-4 shadow-lg transition-colors duration-200">
      <div className="flex items-center justify-around max-w-md mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const targetPath = item.getPath();
          const isActive =
            item.id === 'beranda'
              ? location.pathname === '/' && !location.hash
              : item.id === 'cari'
              ? location.pathname === '/' && location.hash === '#properties'
              : item.id === 'akun'
              ? ['/admin', '/landlord', '/tenant', '/login'].includes(location.pathname)
              : location.pathname === targetPath;
          return (
            <button
              key={item.label}
              onClick={() => handleItemClick(item)}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'text-emerald-700 dark:text-emerald-400 font-bold'
                  : 'text-slate-400 dark:text-slate-500 hover:text-slate-600'
              }`}
            >
              <Icon size={20} className={isActive ? 'stroke-[2.5]' : 'stroke-2'} />
              <span className="text-[10px] mt-1">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
