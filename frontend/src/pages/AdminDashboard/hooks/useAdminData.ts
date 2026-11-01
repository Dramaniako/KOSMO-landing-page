import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Property, Review, AdminStats, TrackingHistory, Withdrawal, MaintenanceTicket, TicketStatus } from '../../../types/index';
import { handleSessionExpired } from '../../../utils/authSession';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export function useAdminData() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'users' | 'properties' | 'reviews' | 'tracking' | 'withdrawals' | 'maintenance'>('tracking');
  const [users, setUsers] = useState<User[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({ tracking: true });
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [trackingHistory, setTrackingHistory] = useState<TrackingHistory | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');
  const loadedTabs = useRef<Set<string>>(new Set());

  const getAuthToken = useCallback((): string => {
    return localStorage.getItem('token') || localStorage.getItem('kosmo_token') || '';
  }, []);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const token = getAuthToken();
    return token
      ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
      : { 'Content-Type': 'application/json' };
  }, [getAuthToken]);

  const getAuthOnlyHeaders = useCallback((): Record<string, string> => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getAuthToken]);

  const checkSessionStatus = useCallback((status: number): boolean => {
    const token = getAuthToken();
    const isRealJwt = Boolean(token && token.split('.').length === 3);
    if ((status === 401 || status === 403) && isRealJwt) {
      handleSessionExpired(navigate);
      return true;
    }
    return false;
  }, [getAuthToken, navigate]);

  const fetchUsers = useCallback(async (): Promise<void> => {
    setTabLoading(prev => ({ ...prev, users: true }));
    try {
      const res = await fetch(`${API_BASE}/users`, {
        headers: getAuthOnlyHeaders()
      });
      if (checkSessionStatus(res.status)) return;
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
  }, [getAuthOnlyHeaders, checkSessionStatus]);

  const fetchProperties = useCallback(async (): Promise<void> => {
    setTabLoading(prev => ({ ...prev, properties: true }));
    try {
      const res = await fetch(`${API_BASE}/properties`, {
        headers: getAuthOnlyHeaders()
      });
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
  }, [getAuthOnlyHeaders]);

  const fetchReviews = useCallback(async (): Promise<void> => {
    setTabLoading(prev => ({ ...prev, reviews: true }));
    try {
      const res = await fetch(`${API_BASE}/reviews`, {
        headers: getAuthOnlyHeaders()
      });
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
  }, [getAuthOnlyHeaders]);

  const fetchWithdrawals = useCallback(async (): Promise<void> => {
    setTabLoading(prev => ({ ...prev, withdrawals: true }));
    try {
      const res = await fetch(`${API_BASE}/admin/withdrawals`, {
        headers: getAuthOnlyHeaders()
      });
      if (checkSessionStatus(res.status)) return;
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
  }, [getAuthOnlyHeaders, checkSessionStatus]);

  const fetchStats = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`${API_BASE}/admin/stats`, {
        headers: getAuthOnlyHeaders()
      });
      if (checkSessionStatus(res.status)) return;
      if (!res.ok) return;
      const data = (await res.json()) as AdminStats;
      setStats(data);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  }, [getAuthOnlyHeaders, checkSessionStatus]);

  const fetchTrackingHistory = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`${API_BASE}/admin/tracking-history`, {
        headers: getAuthOnlyHeaders()
      });
      if (checkSessionStatus(res.status)) return;
      if (!res.ok) return;
      const data = (await res.json()) as TrackingHistory;
      setTrackingHistory(data);
    } catch (err) {
      console.error('Error loading tracking history:', err);
    }
  }, [getAuthOnlyHeaders, checkSessionStatus]);

  const fetchTrackingTab = useCallback(async (): Promise<void> => {
    setTabLoading(prev => ({ ...prev, tracking: true }));
    try {
      const results = await Promise.allSettled([fetchStats(), fetchTrackingHistory()]);
      const anyRejected = results.some(r => r.status === 'rejected');
      if (!anyRejected) {
        loadedTabs.current.add('tracking');
      }
    } catch (err) {
      console.error('Error loading tracking tab data:', err);
    } finally {
      setTabLoading(prev => ({ ...prev, tracking: false }));
    }
  }, [fetchStats, fetchTrackingHistory]);

  const fetchTickets = useCallback(async (): Promise<void> => {
    setTabLoading(prev => ({ ...prev, maintenance: true }));
    try {
      const res = await fetch(`${API_BASE}/tickets`, {
        headers: getAuthOnlyHeaders()
      });
      if (!res.ok) {
        setTickets([]);
        return;
      }
      const data = (await res.json()) as MaintenanceTicket[];
      setTickets(Array.isArray(data) ? data : []);
      loadedTabs.current.add('maintenance');
    } catch (err) {
      console.error('Error loading tickets:', err);
      setTickets([]);
    } finally {
      setTabLoading(prev => ({ ...prev, maintenance: false }));
    }
  }, [getAuthOnlyHeaders]);

  const handleUpdateTicketStatus = async (ticketId: string, newStatus: TicketStatus): Promise<void> => {
    try {
      const res = await fetch(`${API_BASE}/tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        throw new Error(data.message || 'Gagal mengubah status tiket.');
      }
      setTickets((prev) =>
        prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
      throw err;
    }
  };

  useEffect(() => {
    const raw = localStorage.getItem('user');
    const curUser = raw ? (JSON.parse(raw) as User) : null;
    if (!curUser || curUser.role !== 'admin') {
      navigate('/login');
      return;
    }

    if (activeTab === 'users' && !loadedTabs.current.has('users')) {
      fetchUsers();
    } else if (activeTab === 'properties') {
      if (!loadedTabs.current.has('properties')) {
        fetchProperties();
      }
      if (!loadedTabs.current.has('users')) {
        fetchUsers();
      }
    } else if (activeTab === 'reviews' && !loadedTabs.current.has('reviews')) {
      fetchReviews();
    } else if (activeTab === 'withdrawals' && !loadedTabs.current.has('withdrawals')) {
      fetchWithdrawals();
    } else if (activeTab === 'tracking' && !loadedTabs.current.has('tracking')) {
      fetchTrackingTab();
    } else if (activeTab === 'maintenance' && !loadedTabs.current.has('maintenance')) {
      fetchTickets();
    }
  }, [navigate, activeTab, fetchUsers, fetchProperties, fetchReviews, fetchWithdrawals, fetchTrackingTab, fetchTickets]);

  return {
    navigate,
    activeTab,
    setActiveTab,
    users,
    setUsers,
    properties,
    setProperties,
    reviews,
    setReviews,
    withdrawals,
    setWithdrawals,
    tickets,
    setTickets,
    tabLoading,
    stats,
    trackingHistory,
    timeRange,
    setTimeRange,
    loadedTabs,
    getAuthToken,
    getAuthHeaders,
    getAuthOnlyHeaders,
    fetchUsers,
    fetchProperties,
    fetchReviews,
    fetchWithdrawals,
    fetchStats,
    fetchTrackingHistory,
    fetchTrackingTab,
    fetchTickets,
    handleUpdateTicketStatus
  };
}
