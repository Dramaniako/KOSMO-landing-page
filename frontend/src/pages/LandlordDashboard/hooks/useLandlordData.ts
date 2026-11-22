import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { User, Property, Review, Rental, LandlordStats, MaintenanceTicket } from '../../../types/index';
import { handleSessionExpired } from '../../../utils/authSession';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

type LandlordTab = 'overview' | 'properties' | 'reviews' | 'tenants' | 'maintenance';

export function useLandlordData() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialTabFromState = (location.state as { initialTab?: LandlordTab } | null)?.initialTab;
  const [activeTab, setActiveTab] = useState<LandlordTab>(initialTabFromState || 'overview');

  const [landlordUser, setLandlordUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as User) : null;
  });

  const [stats, setStats] = useState<LandlordStats>({
    balance: 0,
    totalRevenue: 0,
    totalWithdrawn: 0,
    totalProperti: 0,
    totalRooms: 0,
    occupiedRooms: 0,
    occupancyRate: 0,
    activeTenants: 0,
    withdrawals: [],
    reviewsCount: 0
  });

  const [properties, setProperties] = useState<Property[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({ overview: true });
  const loadedTabs = useRef<Set<string>>(new Set());

  const fetchOverviewStats = useCallback(async (landlordId: string): Promise<void> => {
    setTabLoading(prev => ({ ...prev, overview: true }));
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      const statsRes = await fetch(`${API_BASE}/stats?landlordId=${encodeURIComponent(landlordId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if ((statsRes.status === 401 || statsRes.status === 403) && token && token.split('.').length === 3) {
        handleSessionExpired(navigate);
        return;
      }
      if (!statsRes.ok) return;
      const statsData = (await statsRes.json()) as LandlordStats;
      setStats(statsData);
      loadedTabs.current.add('overview');
    } catch (err) {
      console.error("Error loading landlord stats:", err);
    } finally {
      setTabLoading(prev => ({ ...prev, overview: false }));
    }
  }, [navigate]);

  const fetchLandlordProperties = useCallback(async (landlordId: string): Promise<void> => {
    setTabLoading(prev => ({ ...prev, properties: true }));
    try {
      const propRes = await fetch(`${API_BASE}/properties?ownerId=${encodeURIComponent(landlordId)}`);
      if (!propRes.ok) {
        setProperties([]);
        return;
      }
      const propData = (await propRes.json()) as Property[];
      const safeProps = Array.isArray(propData) ? propData : [];
      setProperties(safeProps);
      loadedTabs.current.add('properties');
    } catch (err) {
      console.error("Error loading landlord properties:", err);
      setProperties([]);
    } finally {
      setTabLoading(prev => ({ ...prev, properties: false }));
    }
  }, []);

  const fetchLandlordReviews = useCallback(async (landlordId: string): Promise<void> => {
    setTabLoading(prev => ({ ...prev, reviews: true }));
    try {
      const [propRes, revRes] = await Promise.all([
        fetch(`${API_BASE}/properties?ownerId=${encodeURIComponent(landlordId)}`),
        fetch(`${API_BASE}/reviews`)
      ]);
      const propData = propRes.ok ? ((await propRes.json()) as Property[]) : [];
      const revData = revRes.ok ? ((await revRes.json()) as Review[]) : [];
      const safeProps = Array.isArray(propData) ? propData : [];
      const safeReviews = Array.isArray(revData) ? revData : [];
      const propIds = safeProps.map((p) => p.id);
      const landlordReviews = safeReviews.filter((r) => propIds.includes(r.propertyId));
      setReviews(landlordReviews);
      loadedTabs.current.add('reviews');
    } catch (err) {
      console.error("Error loading landlord reviews:", err);
      setReviews([]);
    } finally {
      setTabLoading(prev => ({ ...prev, reviews: false }));
    }
  }, []);

  const fetchLandlordRentals = useCallback(async (landlordId: string): Promise<void> => {
    setTabLoading(prev => ({ ...prev, tenants: true }));
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      const res = await fetch(`${API_BASE}/landlord/rentals?landlordId=${encodeURIComponent(landlordId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if ((res.status === 401 || res.status === 403) && token && token.split('.').length === 3) {
        handleSessionExpired(navigate);
        return;
      }
      if (!res.ok) {
        setRentals([]);
        return;
      }
      const data = (await res.json()) as Rental[];
      setRentals(Array.isArray(data) ? data : []);
      loadedTabs.current.add('tenants');
    } catch (err) {
      console.error("Error loading landlord rentals:", err);
    } finally {
      setTabLoading(prev => ({ ...prev, tenants: false }));
    }
  }, [navigate]);

  const fetchLandlordTickets = useCallback(async (): Promise<void> => {
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      const res = await fetch(`${API_BASE}/tickets`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = (await res.json()) as MaintenanceTicket[];
        setTickets(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Error loading landlord tickets:", err);
      setTickets([]);
    }
  }, []);

  useEffect(() => {
    if (!landlordUser || landlordUser.role !== 'landlord') {
      navigate('/login');
      return;
    }

    if (activeTab === 'overview' && !loadedTabs.current.has('overview')) {
      void fetchOverviewStats(landlordUser.id);
      void fetchLandlordRentals(landlordUser.id);
      void fetchLandlordTickets();
    } else if (activeTab === 'properties' && !loadedTabs.current.has('properties')) {
      fetchLandlordProperties(landlordUser.id);
    } else if (activeTab === 'reviews' && !loadedTabs.current.has('reviews')) {
      fetchLandlordReviews(landlordUser.id);
    } else if (activeTab === 'tenants' && !loadedTabs.current.has('tenants')) {
      fetchLandlordRentals(landlordUser.id);
    } else if (activeTab === 'maintenance') {
      void fetchLandlordTickets();
    }
  }, [landlordUser, navigate, activeTab, fetchOverviewStats, fetchLandlordProperties, fetchLandlordReviews, fetchLandlordRentals, fetchLandlordTickets]);

  return {
    navigate,
    activeTab,
    setActiveTab,
    landlordUser,
    setLandlordUser,
    stats,
    setStats,
    properties,
    setProperties,
    reviews,
    setReviews,
    rentals,
    setRentals,
    tickets,
    setTickets,
    tabLoading,
    loadedTabs,
    fetchOverviewStats,
    fetchLandlordProperties,
    fetchLandlordReviews,
    fetchLandlordRentals,
    fetchLandlordTickets
  };
}
