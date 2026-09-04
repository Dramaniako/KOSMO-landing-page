import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Property, Review, Rental } from '../../../types/index';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export function useTenantData() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'profile' | 'rentals' | 'bills' | 'reviews'>('profile');

  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as User) : null;
  });

  const [properties, setProperties] = useState<Property[]>([]);
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [myRentals, setMyRentals] = useState<Rental[]>([]);
  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({});
  const loadedTabs = useRef<Set<string>>(new Set(['profile']));

  const handleLogout = useCallback((): void => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/');
  }, [navigate]);

  const fetchMyRentals = useCallback(async (userId: string): Promise<void> => {
    setTabLoading(prev => ({ ...prev, rentals: true, bills: true }));
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
      const rentRes = await fetch(`${API_BASE}/rentals?tenantId=${encodeURIComponent(userId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!rentRes.ok) {
        setMyRentals([]);
        return;
      }
      const rentData = (await rentRes.json()) as Rental[];
      setMyRentals(Array.isArray(rentData) ? rentData : []);
      loadedTabs.current.add('rentals');
      loadedTabs.current.add('bills');
    } catch (err) {
      console.error("Error loading rentals:", err);
      setMyRentals([]);
    } finally {
      setTabLoading(prev => ({ ...prev, rentals: false, bills: false }));
    }
  }, []);

  const fetchProperties = useCallback(async (): Promise<Property[]> => {
    try {
      const propRes = await fetch(`${API_BASE}/properties`);
      if (!propRes.ok) {
        setProperties([]);
        return [];
      }
      const propData = (await propRes.json()) as Property[];
      const safeProps = Array.isArray(propData) ? propData : [];
      setProperties(safeProps);
      return safeProps;
    } catch (err) {
      console.error("Error loading properties:", err);
      setProperties([]);
      return [];
    }
  }, []);

  const fetchMyReviews = useCallback(async (userId: string): Promise<void> => {
    setTabLoading(prev => ({ ...prev, reviews: true }));
    try {
      const [revRes] = await Promise.all([
        fetch(`${API_BASE}/reviews?userId=${encodeURIComponent(userId)}`),
        fetchProperties()
      ]);
      if (!revRes.ok) {
        setMyReviews([]);
        return;
      }
      const revData = (await revRes.json()) as Review[];
      setMyReviews(Array.isArray(revData) ? revData : []);
      loadedTabs.current.add('reviews');
    } catch (err) {
      console.error("Error loading reviews:", err);
      setMyReviews([]);
    } finally {
      setTabLoading(prev => ({ ...prev, reviews: false }));
    }
  }, [fetchProperties]);

  useEffect(() => {
    if (!currentUser || (currentUser.role !== 'tenant' && currentUser.role !== 'landlord')) {
      navigate('/login');
      return;
    }

    if ((activeTab === 'rentals' || activeTab === 'bills') && !loadedTabs.current.has('rentals')) {
      fetchMyRentals(currentUser.id);
    } else if (activeTab === 'reviews' && !loadedTabs.current.has('reviews')) {
      fetchMyReviews(currentUser.id);
    }
  }, [currentUser, navigate, activeTab, fetchMyRentals, fetchMyReviews]);

  return {
    currentUser,
    setCurrentUser,
    activeTab,
    setActiveTab,
    properties,
    setProperties,
    myReviews,
    setMyReviews,
    myRentals,
    setMyRentals,
    tabLoading,
    loadedTabs,
    handleLogout,
    fetchMyRentals,
    fetchProperties,
    fetchMyReviews
  };
}
