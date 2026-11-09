import { FacilityFilterState, TrackingHistoryItem } from '../../types/index';

export interface UserFormState {
  name: string;
  email: string;
  password: string;
  role: 'tenant' | 'landlord' | 'admin';
  phone: string;
  paymentMethod: string;
}

export interface PropertyFormState {
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
  verified_water_tank?: boolean;
  verified_wifi_speedtest?: boolean;
}

export interface ReviewFormState {
  rating: number;
  comment: string;
}

export interface ChartPoint {
  x: number;
  y: number;
  label: string;
  count: number;
  index: number;
}

export interface VisitorChartProps {
  data: TrackingHistoryItem[];
  timeRange: '24h' | '7d' | '30d';
}
