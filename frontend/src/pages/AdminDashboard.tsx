import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, Building, Star, Trash2, Edit, Plus, LogOut, 
  Key, LayoutDashboard, MessageSquare,
  BarChart3, Eye, Download, ShieldAlert, X,
  Landmark, CheckCircle, XCircle
} from 'lucide-react';
import { 
  User, Property, Review, AdminStats, TrackingHistory, 
  TrackingHistoryItem, FacilityFilterState, Withdrawal 
} from '../types/index.ts';
import ThemeLanguageToggle from '../components/ThemeLanguageToggle.tsx';
import { useTranslation } from '../context/LanguageContext.tsx';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

interface UserFormState {
  name: string;
  email: string;
  password: string;
  role: 'tenant' | 'landlord' | 'admin';
  phone: string;
  paymentMethod: string;
}

interface PropertyFormState {
  name: string;
  district: string;
  address: string;
  description: string;
  price: string;
  latitude: string;
  longitude: string;
  totalRooms: string;
  occupiedRooms: string;
  image: string;
  ownerId: string;
  facilities: FacilityFilterState;
}

interface ReviewFormState {
  rating: number;
  comment: string;
}

interface ChartPoint {
  x: number;
  y: number;
  label: string;
  count: number;
  index: number;
}

interface VisitorChartProps {
  data: TrackingHistoryItem[];
  timeRange: '24h' | '7d' | '30d';
}

function VisitorChart({ data, timeRange }: VisitorChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<ChartPoint | null>(null);
  if (!data || data.length === 0) return null;

  const maxVal = Math.max(...data.map((d) => d.count), 5);
  const width = 800;
  const height = 280;
  
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;
  
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const points: ChartPoint[] = data.map((item, i) => {
    const x = paddingLeft + (i / (data.length - 1 || 1)) * chartWidth;
    const y = height - paddingBottom - (item.count / maxVal) * chartHeight;
    return { x, y, label: item.label, count: item.count, index: i };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = points.length > 0 
    ? `${linePath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`
    : '';

  const gridLevels: { y: number; val: number }[] = [];
  for (let i = 0; i <= 4; i++) {
    const val = Math.round((maxVal / 4) * i);
    const y = height - paddingBottom - (val / maxVal) * chartHeight;
    gridLevels.push({ y, val });
  }

  const xLabelsCount = timeRange === '24h' ? 6 : timeRange === '7d' ? 7 : 6;
  const step = Math.max(Math.floor(data.length / xLabelsCount), 1);
  const xLabels = points.filter((_, idx) => idx % step === 0 || idx === data.length - 1);

  return (
    <div style={{ position: 'relative', width: '100%', overflowX: 'auto', backgroundColor: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', marginTop: '24px' }}>
      <h4 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '16px' }}>
        Grafik Aktivitas Pengunjung ({timeRange === '24h' ? '24 Jam Terakhir' : timeRange === '7d' ? '1 Minggu Terakhir' : '1 Bulan Terakhir'})
      </h4>
      <div style={{ position: 'relative', width: '100%', minWidth: '700px' }}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25"/>
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0"/>
            </linearGradient>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#6366f1"/>
              <stop offset="100%" stopColor="#8b5cf6"/>
            </linearGradient>
          </defs>

          {/* Grid lines & Y labels */}
          {gridLevels.map((lvl, idx) => (
            <g key={idx} opacity={0.6}>
              <line 
                x1={paddingLeft} 
                y1={lvl.y} 
                x2={width - paddingRight} 
                y2={lvl.y} 
                stroke="#e2e8f0" 
                strokeWidth={1}
                strokeDasharray={idx === 0 ? "0" : "4 4"}
              />
              <text 
                x={paddingLeft - 8} 
                y={lvl.y + 4} 
                fill="#64748b" 
                fontSize="11px" 
                textAnchor="end"
              >
                {lvl.val}
              </text>
            </g>
          ))}

          {/* Fills & Paths */}
          {points.length > 1 && (
            <>
              <path d={areaPath} fill="url(#chartGradient)" />
              <path 
                d={linePath} 
                fill="none" 
                stroke="url(#lineGrad)" 
                strokeWidth={3} 
                strokeLinecap="round" 
                strokeLinejoin="round" 
              />
            </>
          )}

          {/* Points circles & interactive hover areas */}
          {points.map((p, idx) => (
            <g key={idx}>
              <circle 
                cx={p.x} 
                cy={p.y} 
                r={hoveredPoint?.index === idx ? 6 : 4} 
                fill={hoveredPoint?.index === idx ? "#4f46e5" : "white"} 
                stroke={hoveredPoint?.index === idx ? "white" : "#6366f1"} 
                strokeWidth={2}
                style={{ transition: 'all 0.15s ease' }}
              />
              <circle 
                cx={p.x} 
                cy={p.y} 
                r={14} 
                fill="transparent" 
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredPoint(p)}
                onMouseLeave={() => setHoveredPoint(null)}
              />
            </g>
          ))}

          {/* X axis labels */}
          {xLabels.map((p, idx) => (
            <text 
              key={idx} 
              x={p.x} 
              y={height - 12} 
              fill="#64748b" 
              fontSize="11px" 
              textAnchor="middle"
            >
              {p.label.split(' ')[0]}
            </text>
          ))}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredPoint && (
          <div style={{
            position: 'absolute',
            left: `${(hoveredPoint.x / width) * 100}%`,
            top: `${(hoveredPoint.y / height) * 100 - 15}%`,
            transform: 'translate(-50%, -100%)',
            backgroundColor: '#1e293b',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
            pointerEvents: 'none',
            zIndex: 10,
            whiteSpace: 'nowrap',
            transition: 'left 0.1s ease, top 0.1s ease'
          }}>
            <div style={{ fontWeight: 600 }}>{hoveredPoint.count} Kunjungan</div>
            <div style={{ fontSize: '10px', color: '#cbd5e1', marginTop: '2px' }}>{hoveredPoint.label}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'users' | 'properties' | 'reviews' | 'tracking' | 'withdrawals'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({ users: true });
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [trackingHistory, setTrackingHistory] = useState<TrackingHistory | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');

  // Modals
  const [showUserModal, setShowUserModal] = useState<boolean>(false);
  const [showPropModal, setShowPropModal] = useState<boolean>(false);
  const [showRevModal, setShowRevModal] = useState<boolean>(false);

  // User Form
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState<UserFormState>({
    name: '',
    email: '',
    password: '',
    role: 'tenant',
    phone: '',
    paymentMethod: 'Virtual Account'
  });

  // Property Form
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [propertyForm, setPropertyForm] = useState<PropertyFormState>({
    name: '',
    district: 'Denpasar',
    address: '',
    description: '',
    price: '',
    latitude: '-8.6700',
    longitude: '115.2166',
    totalRooms: '5',
    occupiedRooms: '0',
    image: '',
    ownerId: '',
    facilities: {
      Listrik: true,
      Air: true,
      Wifi: true,
      Kebersihan: true,
      Keamanan: false,
      Parkir: false
    }
  });

  // Review Edit Form
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [reviewForm, setReviewForm] = useState<ReviewFormState>({
    rating: 5,
    comment: ''
  });

  const loadedTabs = useRef<Set<string>>(new Set());

  const fetchUsers = useCallback(async (): Promise<void> => {
    setTabLoading(prev => ({ ...prev, users: true }));
    try {
      const res = await fetch(`${API_BASE}/users`);
      if (!res.ok) {
        setUsers([]);
        return;
      }
      const data = (await res.json()) as User[];
      setUsers(Array.isArray(data) ? data : []);
      loadedTabs.current.add('users');
    } catch (err) {
      console.error('Error loading users:', err);
      setUsers([]);
    } finally {
      setTabLoading(prev => ({ ...prev, users: false }));
    }
  }, []);

  const fetchProperties = useCallback(async (): Promise<void> => {
    setTabLoading(prev => ({ ...prev, properties: true }));
    try {
      const res = await fetch(`${API_BASE}/properties`);
      if (!res.ok) {
        setProperties([]);
        return;
      }
      const data = (await res.json()) as Property[];
      setProperties(Array.isArray(data) ? data : []);
      loadedTabs.current.add('properties');
    } catch (err) {
      console.error('Error loading properties:', err);
      setProperties([]);
    } finally {
      setTabLoading(prev => ({ ...prev, properties: false }));
    }
  }, []);

  const fetchReviews = useCallback(async (): Promise<void> => {
    setTabLoading(prev => ({ ...prev, reviews: true }));
    try {
      const res = await fetch(`${API_BASE}/reviews`);
      if (!res.ok) {
        setReviews([]);
        return;
      }
      const data = (await res.json()) as Review[];
      setReviews(Array.isArray(data) ? data : []);
      loadedTabs.current.add('reviews');
    } catch (err) {
      console.error('Error loading reviews:', err);
      setReviews([]);
    } finally {
      setTabLoading(prev => ({ ...prev, reviews: false }));
    }
  }, []);

  const fetchWithdrawals = useCallback(async (): Promise<void> => {
    setTabLoading(prev => ({ ...prev, withdrawals: true }));
    try {
      const res = await fetch(`${API_BASE}/admin/withdrawals`);
      if (!res.ok) {
        setWithdrawals([]);
        return;
      }
      const data = (await res.json()) as Withdrawal[];
      setWithdrawals(Array.isArray(data) ? data : []);
      loadedTabs.current.add('withdrawals');
    } catch (err) {
      console.error('Error loading withdrawals:', err);
      setWithdrawals([]);
    } finally {
      setTabLoading(prev => ({ ...prev, withdrawals: false }));
    }
  }, []);

  const fetchStats = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`${API_BASE}/admin/stats`);
      if (!res.ok) return;
      const data = (await res.json()) as AdminStats;
      setStats(data);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  }, []);

  const fetchTrackingHistory = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`${API_BASE}/admin/tracking-history`);
      if (!res.ok) return;
      const data = (await res.json()) as TrackingHistory;
      setTrackingHistory(data);
    } catch (err) {
      console.error('Error loading tracking history:', err);
    }
  }, []);

  const fetchTrackingTab = useCallback(async (): Promise<void> => {
    setTabLoading(prev => ({ ...prev, tracking: true }));
    try {
      await Promise.all([fetchStats(), fetchTrackingHistory()]);
      loadedTabs.current.add('tracking');
    } catch (err) {
      console.error('Error loading tracking tab data:', err);
    } finally {
      setTabLoading(prev => ({ ...prev, tracking: false }));
    }
  }, [fetchStats, fetchTrackingHistory]);

  // Auth check & on-demand tab loader
  useEffect(() => {
    const raw = localStorage.getItem('user');
    const curUser = raw ? (JSON.parse(raw) as User) : null;
    if (!curUser || curUser.role !== 'admin') {
      navigate('/login');
      return;
    }

    if (activeTab === 'users' && !loadedTabs.current.has('users')) {
      fetchUsers();
    } else if (activeTab === 'properties' && !loadedTabs.current.has('properties')) {
      fetchProperties();
    } else if (activeTab === 'reviews' && !loadedTabs.current.has('reviews')) {
      fetchReviews();
    } else if (activeTab === 'withdrawals' && !loadedTabs.current.has('withdrawals')) {
      fetchWithdrawals();
    } else if (activeTab === 'tracking' && !loadedTabs.current.has('tracking')) {
      fetchTrackingTab();
    }
  }, [navigate, activeTab, fetchUsers, fetchProperties, fetchReviews, fetchWithdrawals, fetchTrackingTab]);

  const handleLogout = (): void => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/');
  };

  const resetUserForm = (): void => {
    setEditingUser(null);
    setUserForm({
      name: '',
      email: '',
      password: '',
      role: 'tenant',
      phone: '',
      paymentMethod: 'Virtual Account'
    });
  };

  // User CRUD handlers
  const handleUserSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!userForm.name || !userForm.email || (!editingUser && !userForm.password)) {
      alert("Harap lengkapi semua kolom wajib.");
      return;
    }

    const url = editingUser 
      ? `${API_BASE}/users/${editingUser.id}`
      : `${API_BASE}/users`;
    const method = editingUser ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userForm)
      });
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      setShowUserModal(false);
      resetUserForm();
      await fetchUsers();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    }
  };

  const handleEditUser = (user: User): void => {
    setEditingUser(user);
    setUserForm({
      name: user.name,
      email: user.email,
      password: '', // Leave blank if not updating password
      role: user.role,
      phone: user.phone || '',
      paymentMethod: user.paymentMethod || 'Virtual Account'
    });
    setShowUserModal(true);
  };

  const handleDeleteUser = async (id: string): Promise<void> => {
    if (id === 'user-admin') {
      alert("Admin utama tidak dapat dihapus.");
      return;
    }
    if (!window.confirm("Apakah Anda yakin ingin menghapus user ini?")) return;

    try {
      const res = await fetch(`${API_BASE}/users/${id}`, { method: 'DELETE' });
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      await fetchUsers();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    }
  };

  const resetPropertyForm = (): void => {
    setEditingProperty(null);
    setPropertyForm({
      name: '',
      district: 'Denpasar',
      address: '',
      description: '',
      price: '',
      latitude: '-8.6700',
      longitude: '115.2166',
      totalRooms: '5',
      occupiedRooms: '0',
      image: '',
      ownerId: users.find((u) => u.role === 'landlord')?.id || '',
      facilities: {
        Listrik: true,
        Air: true,
        Wifi: true,
        Kebersihan: true,
        Keamanan: false,
        Parkir: false
      }
    });
  };

  // Property CRUD handlers (moderation)
  const handlePropertySubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const facilityList = Object.keys(propertyForm.facilities).filter(
      (fac) => propertyForm.facilities[fac]
    );

    const payload = {
      name: propertyForm.name,
      district: propertyForm.district,
      address: propertyForm.address,
      description: propertyForm.description,
      price: parseInt(propertyForm.price, 10),
      latitude: propertyForm.latitude,
      longitude: propertyForm.longitude,
      totalRooms: parseInt(propertyForm.totalRooms, 10),
      occupiedRooms: parseInt(propertyForm.occupiedRooms, 10),
      image: propertyForm.image || undefined,
      ownerId: propertyForm.ownerId || undefined,
      facilities: facilityList
    };

    const url = editingProperty 
      ? `${API_BASE}/properties/${editingProperty.id}`
      : `${API_BASE}/properties`;
    const method = editingProperty ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      setShowPropModal(false);
      resetPropertyForm();
      await fetchProperties();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    }
  };

  const handleEditProperty = (prop: Property): void => {
    setEditingProperty(prop);

    // Map facilities array back to checkbox states
    const facilitiesMap: FacilityFilterState = {
      Listrik: false,
      Air: false,
      Wifi: false,
      Kebersihan: false,
      Keamanan: false,
      Parkir: false
    };
    prop.facilities.forEach((fac) => {
      if (facilitiesMap[fac] !== undefined) {
        facilitiesMap[fac] = true;
      }
    });

    setPropertyForm({
      name: prop.name,
      district: prop.district,
      address: prop.address,
      description: prop.description,
      price: prop.price.toString(),
      latitude: prop.latitude,
      longitude: prop.longitude,
      totalRooms: prop.totalRooms.toString(),
      occupiedRooms: prop.occupiedRooms.toString(),
      image: prop.image || '',
      ownerId: prop.ownerId || '',
      facilities: facilitiesMap
    });
    setShowPropModal(true);
  };

  const handleDeleteProperty = async (id: string): Promise<void> => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus properti ini?")) return;

    try {
      const res = await fetch(`${API_BASE}/properties/${id}`, { method: 'DELETE' });
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      await fetchProperties();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    }
  };

  // Review Edit/Delete handlers
  const handleEditReview = (rev: Review): void => {
    setEditingReview(rev);
    setReviewForm({
      rating: rev.rating,
      comment: rev.comment
    });
    setShowRevModal(true);
  };

  const handleReviewSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!editingReview) return;
    try {
      const res = await fetch(`${API_BASE}/reviews/${editingReview.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewForm)
      });
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      setShowRevModal(false);
      setEditingReview(null);
      await fetchReviews();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    }
  };

  const handleDeleteReview = async (id: string): Promise<void> => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus review ini?")) return;

    try {
      const res = await fetch(`${API_BASE}/reviews/${id}`, { method: 'DELETE' });
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      await fetchReviews();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    }
  };

  const handleProcessWithdrawal = async (id: string): Promise<void> => {
    if (!window.confirm("Konfirmasi proses pencairan dana ke landlord?")) return;
    try {
      const res = await fetch(`${API_BASE}/admin/withdrawals/${id}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' })
      });
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);
      alert(data.message);
      await fetchWithdrawals();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    }
  };

  const handleRejectWithdrawal = async (id: string): Promise<void> => {
    const reason = window.prompt("Masukkan alasan penolakan pencairan dana:");
    if (reason === null) return;
    try {
      const res = await fetch(`${API_BASE}/admin/withdrawals/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);
      alert(data.message);
      await fetchWithdrawals();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    }
  };

  const formatRupiah = (num: number | string | undefined): string => {
    if (num === undefined || num === null) return 'Rp 0';
    return 'Rp ' + parseFloat(String(num)).toLocaleString('id-ID');
  };

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div>
          <div className="nav-brand" style={{ marginBottom: '40px', paddingLeft: '16px' }}>
            <ShieldAlert size={26} style={{ color: 'var(--danger)' }} />
            <span>KOSMO Admin</span>
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
                Manajemen Review
              </button>
            </li>
            <li>
              <button 
                className={`sidebar-link ${activeTab === 'withdrawals' ? 'active' : ''}`}
                onClick={() => setActiveTab('withdrawals')}
              >
                <Landmark size={18} />
                Pencairan Dana ({withdrawals.filter(w => w.status === 'pending' || w.status === 'processing').length})
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

        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
          <button className="sidebar-link" style={{ width: '100%', border: 'none', background: 'none', color: 'var(--danger)' }} onClick={handleLogout}>
            <LogOut size={18} />
            Keluar Panel
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="dashboard-content">
        <header style={{ marginBottom: '32px' }} className="flex-between flex-wrap gap-4">
          <div>
            <h1 style={{ fontSize: '28px' }}>{t('admin.title')}</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '2px' }}>
              Manajemen user, pengaturan role, moderasi properti, dan review secara global.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ThemeLanguageToggle />
            <button className="btn btn-outline" onClick={() => navigate('/')}>
              Kembali ke Web
            </button>
          </div>
        </header>

        {/* USERS MANAGEMENT TAB */}
        {activeTab === 'users' && (
          <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
            <div className="flex-between" style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '20px' }}>Daftar Pengguna Website ({users.length})</h3>
              <button className="btn btn-primary" onClick={() => { resetUserForm(); setShowUserModal(true); }}>
                <Plus size={16} />
                Tambah User Baru
              </button>
            </div>

            {tabLoading.users && !loadedTabs.current.has('users') ? (
              <div className="flex-center" style={{ height: '200px', flexDirection: 'column', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Memuat data pengguna...</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '12px 16px' }}>Nama</th>
                      <th style={{ padding: '12px 16px' }}>Email</th>
                      <th style={{ padding: '12px 16px' }}>Role</th>
                      <th style={{ padding: '12px 16px' }}>Nomor Telepon</th>
                      <th style={{ padding: '12px 16px' }}>Keuangan (Landlord)</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '16px' }}>
                          <strong>{u.name}</strong>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>ID: {u.id}</span>
                        </td>
                        <td style={{ padding: '16px' }}>{u.email}</td>
                        <td style={{ padding: '16px' }}>
                          <span className={`badge ${
                            u.role === 'admin' ? 'badge-danger' : 
                            u.role === 'landlord' ? 'badge-primary' : 'badge-success'
                          }`}>
                            {u.role === 'admin' ? 'Super Admin' : 
                             u.role === 'landlord' ? 'Landlord' : 'Tenant'}
                          </span>
                        </td>
                        <td style={{ padding: '16px' }}>{u.phone || '-'}</td>
                        <td style={{ padding: '16px' }}>
                          {u.role === 'landlord' ? (
                            <div style={{ fontSize: '12px' }}>
                              <p>Saldo: {formatRupiah(u.balance)}</p>
                              <p style={{ color: 'var(--text-muted)' }}>Revenue: {formatRupiah(u.totalRevenue)}</p>
                            </div>
                          ) : '-'}
                        </td>
                        <td style={{ padding: '16px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '8px' }}>
                            <button className="btn btn-outline" style={{ padding: '6px 12px' }} onClick={() => handleEditUser(u)}>
                              <Edit size={14} />
                            </button>
                            <button className="btn btn-danger" style={{ padding: '6px 12px' }} onClick={() => handleDeleteUser(u.id)} disabled={u.id === 'user-admin'}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* PROPERTIES MODERATION TAB */}
        {activeTab === 'properties' && (
          <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
            <div className="flex-between" style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '20px' }}>Daftar Semua Unit Properti ({properties.length})</h3>
            </div>

            {tabLoading.properties && !loadedTabs.current.has('properties') ? (
              <div className="flex-center" style={{ height: '200px', flexDirection: 'column', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Memuat data properti...</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border-color)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '12px 16px' }}>Properti</th>
                      <th style={{ padding: '12px 16px' }}>Wilayah</th>
                      <th style={{ padding: '12px 16px' }}>Harga / Bln</th>
                      <th style={{ padding: '12px 16px' }}>Kamar Terisi</th>
                      <th style={{ padding: '12px 16px' }}>Rating</th>
                      <th style={{ padding: '12px 16px' }}>ID Pemilik (Landlord)</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {properties.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <img src={p.image} alt={p.name} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />
                            <div>
                              <strong>{p.name}</strong>
                              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.address}</p>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '16px' }}>{p.district}</td>
                        <td style={{ padding: '16px', fontWeight: 600, color: 'var(--primary)' }}>{formatRupiah(p.price)}</td>
                        <td style={{ padding: '16px' }}>
                          <strong>{p.occupiedRooms}</strong> / {p.totalRooms} Kamar
                        </td>
                        <td style={{ padding: '16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Star size={14} style={{ fill: '#f59e0b', color: '#f59e0b' }} />
                            <span>{p.rating > 0 ? p.rating : 'Baru'}</span>
                          </div>
                        </td>
                        <td style={{ padding: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>{p.ownerId}</td>
                        <td style={{ padding: '16px', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '8px' }}>
                            <button className="btn btn-outline" style={{ padding: '6px 12px' }} onClick={() => handleEditProperty(p)}>
                              <Edit size={14} />
                            </button>
                            <button className="btn btn-danger" style={{ padding: '6px 12px' }} onClick={() => handleDeleteProperty(p.id)}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* REVIEWS MODERATION TAB */}
        {activeTab === 'reviews' && (
          <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
            <h3 style={{ fontSize: '20px', marginBottom: '24px' }}>Ulasan Pelanggan Secara Global ({reviews.length})</h3>

            {tabLoading.reviews && !loadedTabs.current.has('reviews') ? (
              <div className="flex-center" style={{ height: '200px', flexDirection: 'column', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Memuat ulasan pelanggan...</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {reviews.map((r) => (
                  <div key={r.id} className="card" style={{ padding: '20px', backgroundColor: '#f8fafc', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, marginRight: '24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <strong style={{ fontSize: '15px' }}>{r.userName}</strong>
                        <span className="badge badge-primary" style={{ fontSize: '10px' }}>
                          {r.propertyName}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.date}</span>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '2px', marginBottom: '8px' }}>
                        {[...Array(5)].map((_, i) => (
                          <Star 
                            key={i} 
                            size={12} 
                            style={{ 
                              fill: i < r.rating ? '#f59e0b' : 'transparent', 
                              color: i < r.rating ? '#f59e0b' : '#cbd5e1' 
                            }} 
                          />
                        ))}
                      </div>

                      <p style={{ fontSize: '14px', color: 'var(--text-main)', fontStyle: 'italic' }}>
                        "{r.comment}"
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn btn-outline" style={{ padding: '6px 12px' }} onClick={() => handleEditReview(r)}>
                        Edit
                      </button>
                      <button className="btn btn-danger" style={{ padding: '6px 12px' }} onClick={() => handleDeleteReview(r.id)}>
                        Hapus
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TRACKING TAB */}
        {activeTab === 'tracking' && (
          <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
            <div className="flex-between" style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '20px' }}>Tracking Pengunjung Website</h3>
              <a 
                href={`${API_BASE}/reports/tracking/excel`}
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}
              >
                <Download size={16} /> Unduh Laporan Excel
              </a>
            </div>

            {tabLoading.tracking && !loadedTabs.current.has('tracking') ? (
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
                      timeRange === '24h' ? trackingHistory.history24h : 
                      timeRange === '7d' ? trackingHistory.history7d : 
                      trackingHistory.history30d
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
        )}

        {/* WITHDRAWALS MANAGEMENT TAB */}
        {activeTab === 'withdrawals' && (
          <div className="card" style={{ padding: '24px', backgroundColor: 'white' }}>
            <div className="flex-between" style={{ marginBottom: '24px' }}>
              <div>
                <h3 style={{ fontSize: '20px' }}>Moderasi Pencairan Dana Landlord ({withdrawals.length})</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
                  Kelola dan verifikasi transfer penarikan saldo pendapatan mitra kos.
                </p>
              </div>
            </div>

            {tabLoading.withdrawals && !loadedTabs.current.has('withdrawals') ? (
              <div className="flex-center" style={{ height: '200px', flexDirection: 'column', gap: '12px' }}>
                <div style={{ width: '32px', height: '32px', border: '3px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Memuat data penarikan saldo...</p>
              </div>
            ) : withdrawals.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
                Belum ada riwayat permohonan pencairan dana.
              </p>
            ) : (
              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Tanggal & ID</th>
                      <th>Landlord</th>
                      <th>Bank & Rekening</th>
                      <th>Nominal</th>
                      <th>Status</th>
                      <th>Ref ID</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawals.map((w) => (
                      <tr key={w.id}>
                        <td>
                          <strong style={{ fontSize: '13px', display: 'block' }}>{w.id}</strong>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{w.date}</span>
                        </td>
                        <td>
                          <p style={{ fontWeight: 600, fontSize: '13px' }}>{w.userName || w.userId}</p>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{w.userEmail || '-'}</span>
                        </td>
                        <td>
                          <span className="badge" style={{ backgroundColor: '#e0f2fe', color: '#0369a1', fontSize: '11px', fontWeight: 600 }}>{w.bankName}</span>
                          <p style={{ fontSize: '13px', marginTop: '4px', fontWeight: 500 }}>{w.accountNumber}</p>
                          {w.accountHolder && <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>a.n. {w.accountHolder}</p>}
                        </td>
                        <td>
                          <strong style={{ color: 'var(--primary)', fontSize: '14px' }}>{formatRupiah(w.amount)}</strong>
                        </td>
                        <td>
                          <span 
                            className={`badge ${w.status === 'completed' ? 'badge-success' : w.status === 'rejected' ? 'badge-danger' : w.status === 'processing' ? 'badge-warning' : 'badge-secondary'}`}
                            title={w.rejectionReason ? `Alasan: ${w.rejectionReason}` : undefined}
                          >
                            {w.status === 'completed' ? 'Selesai' : w.status === 'rejected' ? 'Ditolak' : w.status === 'processing' ? 'Diproses' : 'Menunggu'}
                          </span>
                          {w.rejectionReason && (
                            <p style={{ fontSize: '10px', color: 'var(--danger)', marginTop: '2px' }}>{w.rejectionReason}</p>
                          )}
                        </td>
                        <td>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                            {w.referenceId || '-'}
                          </span>
                        </td>
                        <td>
                          {w.status === 'pending' || w.status === 'processing' ? (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button 
                                className="btn btn-sm btn-primary"
                                style={{ padding: '4px 8px', fontSize: '11px' }}
                                onClick={() => handleProcessWithdrawal(w.id)}
                              >
                                Selesaikan
                              </button>
                              <button 
                                className="btn btn-sm btn-danger btn-outline"
                                style={{ padding: '4px 8px', fontSize: '11px' }}
                                onClick={() => handleRejectWithdrawal(w.id)}
                              >
                                Tolak
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Telah Diproses</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* User Modal (Create/Edit) */}
      {showUserModal && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '480px' }}>
            <button className="modal-close" onClick={() => { setShowUserModal(false); resetUserForm(); }}>
              <X size={18} />
            </button>
            <div style={{ padding: '32px' }}>
              <h3 style={{ fontSize: '20px', marginBottom: '20px' }}>
                {editingUser ? 'Edit Detail User' : 'Buat User Baru'}
              </h3>

              <form onSubmit={handleUserSubmit}>
                <div className="form-group">
                  <label className="form-label">Nama Lengkap</label>
                  <input 
                    type="text" 
                    className="form-input"
                    value={userForm.name}
                    onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Alamat Email</label>
                  <input 
                    type="email" 
                    className="form-input"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Password {editingUser && '(Kosongkan jika tidak diganti)'}</label>
                  <input 
                    type="password" 
                    className="form-input"
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    required={!editingUser}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Pilih Role User</label>
                  <select 
                    className="form-select"
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value as 'tenant' | 'landlord' | 'admin' })}
                  >
                    <option value="tenant">Tenant (Penyewa)</option>
                    <option value="landlord">Landlord (Pemilik Kos)</option>
                    <option value="admin">Administrator Website</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Nomor Telepon</label>
                  <input 
                    type="text" 
                    className="form-input"
                    value={userForm.phone}
                    onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '24px' }}>
                  <label className="form-label">Metode Pembayaran Pilihan</label>
                  <input 
                    type="text" 
                    className="form-input"
                    value={userForm.paymentMethod}
                    onChange={(e) => setUserForm({ ...userForm, paymentMethod: e.target.value })}
                  />
                </div>

                <div className="flex-between">
                  <button type="button" className="btn btn-outline" onClick={() => { setShowUserModal(false); resetUserForm(); }}>
                    Batal
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {editingUser ? 'Simpan Perubahan' : 'Buat User'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Property Edit Modal (Super Admin Moderation) */}
      {showPropModal && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '650px' }}>
            <button className="modal-close" onClick={() => { setShowPropModal(false); resetPropertyForm(); }}>
              <X size={18} />
            </button>
            <div style={{ padding: '32px' }}>
              <h3 style={{ fontSize: '22px', marginBottom: '20px' }}>
                Moderasi Properti KOSMO
              </h3>

              <form onSubmit={handlePropertySubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Nama Properti</label>
                  <input 
                    type="text" 
                    className="form-input"
                    value={propertyForm.name}
                    onChange={(e) => setPropertyForm({ ...propertyForm, name: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Kabupaten / Kota</label>
                  <select 
                    className="form-select"
                    value={propertyForm.district}
                    onChange={(e) => setPropertyForm({ ...propertyForm, district: e.target.value })}
                  >
                    <option value="Denpasar">Denpasar</option>
                    <option value="Badung">Badung</option>
                    <option value="Gianyar">Gianyar</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Harga Sewa / Bln (Rp)</label>
                  <input 
                    type="number" 
                    className="form-input"
                    value={propertyForm.price}
                    onChange={(e) => setPropertyForm({ ...propertyForm, price: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Alamat Lengkap</label>
                  <input 
                    type="text" 
                    className="form-input"
                    value={propertyForm.address}
                    onChange={(e) => setPropertyForm({ ...propertyForm, address: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Deskripsi Properti</label>
                  <textarea 
                    className="form-textarea" 
                    rows={3}
                    value={propertyForm.description}
                    onChange={(e) => setPropertyForm({ ...propertyForm, description: e.target.value })}
                  ></textarea>
                </div>

                <div className="form-group">
                  <label className="form-label">Latitude</label>
                  <input 
                    type="text" 
                    className="form-input"
                    value={propertyForm.latitude}
                    onChange={(e) => setPropertyForm({ ...propertyForm, latitude: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Longitude</label>
                  <input 
                    type="text" 
                    className="form-input"
                    value={propertyForm.longitude}
                    onChange={(e) => setPropertyForm({ ...propertyForm, longitude: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Total Kamar</label>
                  <input 
                    type="number" 
                    className="form-input"
                    value={propertyForm.totalRooms}
                    onChange={(e) => setPropertyForm({ ...propertyForm, totalRooms: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Kamar Terisi</label>
                  <input 
                    type="number" 
                    className="form-input"
                    value={propertyForm.occupiedRooms}
                    onChange={(e) => setPropertyForm({ ...propertyForm, occupiedRooms: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Cover Image URL</label>
                  <input 
                    type="text" 
                    className="form-input"
                    value={propertyForm.image}
                    onChange={(e) => setPropertyForm({ ...propertyForm, image: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Pilih Landlord Pemilik</label>
                  <select 
                    className="form-select"
                    value={propertyForm.ownerId}
                    onChange={(e) => setPropertyForm({ ...propertyForm, ownerId: e.target.value })}
                  >
                    {users.filter((u) => u.role === 'landlord').map((u) => (
                      <option key={u.id} value={u.id}>{u.name} (ID: {u.id})</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Fasilitas All-Inclusive</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '6px' }}>
                    {(Object.keys(propertyForm.facilities) as (keyof FacilityFilterState)[]).map((fac) => (
                      <label key={String(fac)} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          style={{ width: '16px', height: '16px' }}
                          checked={propertyForm.facilities[fac]}
                          onChange={() => setPropertyForm({
                            ...propertyForm,
                            facilities: {
                              ...propertyForm.facilities,
                              [fac]: !propertyForm.facilities[fac]
                            }
                          })}
                        />
                        {String(fac)}
                      </label>
                    ))}
                  </div>
                </div>

                <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
                  <button type="button" className="btn btn-outline" onClick={() => { setShowPropModal(false); resetPropertyForm(); }}>
                    Batal
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Simpan Moderasi
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Review Edit Modal */}
      {showRevModal && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '450px' }}>
            <button className="modal-close" onClick={() => { setShowRevModal(false); setEditingReview(null); }}>
              <X size={18} />
            </button>
            <div style={{ padding: '32px' }}>
              <h3 style={{ fontSize: '20px', marginBottom: '20px' }}>Edit Review Pengguna</h3>

              <form onSubmit={handleReviewSubmit}>
                <div className="form-group">
                  <label className="form-label">Rating Bintang</label>
                  <select 
                    className="form-select"
                    value={reviewForm.rating}
                    onChange={(e) => setReviewForm({ ...reviewForm, rating: parseInt(e.target.value, 10) })}
                  >
                    <option value={5}>5 Bintang (Sangat Puas)</option>
                    <option value={4}>4 Bintang (Puas)</option>
                    <option value={3}>3 Bintang (Cukup)</option>
                    <option value={2}>2 Bintang (Buruk)</option>
                    <option value={1}>1 Bintang (Sangat Buruk)</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '24px' }}>
                  <label className="form-label">Komentar Ulasan</label>
                  <textarea 
                    className="form-textarea" 
                    rows={4}
                    value={reviewForm.comment}
                    onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                    required
                  ></textarea>
                </div>

                <div className="flex-between">
                  <button type="button" className="btn btn-outline" onClick={() => { setShowRevModal(false); setEditingReview(null); }}>
                    Batal
                  </button>
                  <button type="submit" className="btn btn-primary">
                    Simpan Ulasan
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
