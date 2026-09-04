import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Property, Review, AdminStats, TrackingHistory, Withdrawal } from '../../../types/index';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export function useAdminData() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'users' | 'properties' | 'reviews' | 'tracking' | 'withdrawals'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({ users: true });
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

  const fetchUsers = useCallback(async (): Promise<void> => {
    setTabLoading(prev => ({ ...prev, users: true }));
    try {
      const res = await fetch(`${API_BASE}/users`, {
        headers: getAuthOnlyHeaders()
      });
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
  }, [getAuthOnlyHeaders]);

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
  }, [getAuthOnlyHeaders]);

  const fetchStats = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`${API_BASE}/admin/stats`, {
        headers: getAuthOnlyHeaders()
      });
      if (!res.ok) return;
      const data = (await res.json()) as AdminStats;
      setStats(data);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  }, [getAuthOnlyHeaders]);

  const fetchTrackingHistory = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`${API_BASE}/admin/tracking-history`, {
        headers: getAuthOnlyHeaders()
      });
      if (!res.ok) return;
      const data = (await res.json()) as TrackingHistory;
      setTrackingHistory(data);
    } catch (err) {
      console.error('Error loading tracking history:', err);
    }
  }, [getAuthOnlyHeaders]);

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
    fetchTrackingTab
  };
}
