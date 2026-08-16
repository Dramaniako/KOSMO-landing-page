export type UserRole = 'tenant' | 'landlord' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  paymentMethod?: string;
  avatar?: string | null;
  notifications?: boolean;
  language?: string;
  balance?: number;
  totalRevenue?: number;
  totalWithdrawn?: number;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
}

export interface Property {
  id: string;
  name: string;
  district: string;
  address: string;
  price: number;
  rating: number;
  image: string;
  description: string;
  facilities: string[];
  latitude: string;
  longitude: string;
  totalRooms: number;
  occupiedRooms: number;
  ownerId: string | null;
  document?: string;
}

export interface Review {
  id: string;
  propertyId: string;
  propertyName: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  date: string;
}

export interface Rental {
  id: string;
  tenantId: string;
  propertyId: string;
  propertyName: string;
  price: number;
  startDate: string;
  status: 'active' | 'terminated';
}

export interface Withdrawal {
  id: string;
  userId: string;
  bankName: string;
  accountNumber: string;
  accountHolder?: string;
  amount: number;
  date: string;
  status: 'pending' | 'processing' | 'completed' | 'rejected' | string;
  referenceId?: string;
  rejectionReason?: string;
  processedAt?: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
}

export interface AdminStats {
  totalVisitors: number;
  totalUsers: number;
  totalLandlords: number;
  totalProperties: number;
  totalRooms: number;
}

export interface TrackingHistoryItem {
  label: string;
  count: number;
}

export interface TrackingHistory {
  history24h: TrackingHistoryItem[];
  history7d: TrackingHistoryItem[];
  history30d: TrackingHistoryItem[];
}

export interface LandlordStats {
  balance: number;
  totalRevenue: number;
  totalWithdrawn: number;
  totalProperti: number;
  totalRooms: number;
  occupiedRooms: number;
  occupancyRate: number;
  activeTenants: number;
  withdrawals: Withdrawal[];
  reviewsCount: number;
}

export interface FacilityFilterState {
  Listrik: boolean;
  Air: boolean;
  Wifi: boolean;
  Kebersihan: boolean;
  Keamanan: boolean;
  Parkir: boolean;
  [key: string]: boolean;
}
