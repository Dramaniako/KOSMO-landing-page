import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Property, Review, Rental, LandlordStats } from '../../../types/index';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export function useLandlordData() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'properties' | 'reviews' | 'tenants'>('overview');

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
  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({ overview: true });
  const loadedTabs = useRef<Set<string>>(new Set());

  const fetchOverviewStats = useCallback(async (landlordId: string): Promise<void> => {
    setTabLoading(prev => ({ ...prev, overview: true }));
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      const statsRes = await fetch(`${API_BASE}/stats?landlordId=${encodeURIComponent(landlordId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!statsRes.ok) return;
      const statsData = (await statsRes.json()) as LandlordStats;
      setStats(statsData);
      loadedTabs.current.add('overview');
    } catch (err) {
      console.error("Error loading landlord stats:", err);
    } finally {
      setTabLoading(prev => ({ ...prev, overview: false }));
    }
  }, []);

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
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/landlord/rentals?landlordId=${encodeURIComponent(landlordId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = (await res.json()) as Rental[];
      setRentals(Array.isArray(data) ? data : []);
      loadedTabs.current.add('tenants');
    } catch (err) {
      console.error("Error loading landlord rentals:", err);
    } finally {
      setTabLoading(prev => ({ ...prev, tenants: false }));
    }
  }, []);

  useEffect(() => {
    if (!landlordUser || landlordUser.role !== 'landlord') {
      navigate('/login');
      return;
    }

    if (activeTab === 'overview' && !loadedTabs.current.has('overview')) {
      fetchOverviewStats(landlordUser.id);
    } else if (activeTab === 'properties' && !loadedTabs.current.has('properties')) {
      fetchLandlordProperties(landlordUser.id);
    } else if (activeTab === 'reviews' && !loadedTabs.current.has('reviews')) {
      fetchLandlordReviews(landlordUser.id);
    } else if (activeTab === 'tenants' && !loadedTabs.current.has('tenants')) {
      fetchLandlordRentals(landlordUser.id);
    }
  }, [landlordUser, navigate, activeTab, fetchOverviewStats, fetchLandlordProperties, fetchLandlordReviews, fetchLandlordRentals]);

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
    tabLoading,
    loadedTabs,
    fetchOverviewStats,
    fetchLandlordProperties,
    fetchLandlordReviews,
    fetchLandlordRentals
  };
}
