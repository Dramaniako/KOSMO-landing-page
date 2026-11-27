import {
  isUserProfileComplete,
  type CanonicalUserRole,
  type IdentityType,
  type ProfileCompletenessResult,
  type RentalStatus,
  type DiscreteRoomStatus,
  type WithdrawalStatus,
  type PhotoCategory,
  type TicketCategory,
  type TicketStatus,
  type UtilityQuotas,
  type RentalContractData,
  type ContractPreviewRequest,
  type ContractPreviewResponse,
  type ContractSignRequest,
  type ContractSignResponse
} from '../../../shared/types/index';

export {
  isUserProfileComplete,
  type CanonicalUserRole,
  type IdentityType,
  type ProfileCompletenessResult,
  type RentalStatus,
  type DiscreteRoomStatus,
  type WithdrawalStatus,
  type PhotoCategory,
  type TicketCategory,
  type TicketStatus,
  type UtilityQuotas,
  type RentalContractData,
  type ContractPreviewRequest,
  type ContractPreviewResponse,
  type ContractSignRequest,
  type ContractSignResponse
};

export type UserRole = CanonicalUserRole;

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
  identity_type?: IdentityType;
  identity_number?: string;
  address?: string;
  occupation?: string;
  emergency_contact_name?: string;
  emergency_contact_relation?: string;
  emergency_contact_phone?: string;
  date_of_birth?: string;
  gender?: string;
  isProfileComplete?: boolean;
  missingProfileFields?: string[];
}

// Profile completeness helpers re-exported from ../../../shared/types/index

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
  rooms?: Room[];
  photos?: PropertyPhoto[];
  is_featured?: boolean;
  isFeatured?: boolean;
  featured_until?: string | Date | null;
  featuredUntil?: string | Date | null;
  verified_water_tank?: boolean;
  verified_wifi_speedtest?: boolean;
  suitabilityScore?: number;
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
  roomId?: string | null;
  roomNumber?: string | null;
  roomFloor?: number | null;
  roomType?: string | null;
  room?: Room | null;
  propertyName: string;
  price: number;
  startDate: string;
  status: RentalStatus;
  document?: string;
  contract_url?: string | null;
  contract_hash?: string | null;
  contract_signed_at?: string | Date | null;
  signer_ip?: string | null;
  signer_user_agent?: string | null;
  tenant_nik_passport?: string | null;
  tenant_signature_data?: string | null;
  admin_fee_amount?: number;
  duration_months?: number;
  nextPaymentDate?: string;
  nextPaymentDateISO?: string;
  daysRemaining?: number;
  paymentStatus?: string;
  leaseStartDate?: string;
  leaseEndDate?: string;
  leaseEndDateISO?: string;
  totalDurationMonths?: number;
  tenantName?: string;
  tenantPhone?: string;
  tenantEmail?: string;
}

export interface BookingRequest {
  propertyId: string;
  propertyName: string;
  price: number;
  tenantId: string;
  tenantName: string;
  tenantEmail: string;
  durationMonths?: number;
  rentalId?: string;
  contractSigned?: boolean;
  tenantNikPassport?: string;
  adminFee?: number;
}

export interface SignedContractData {
  rentalId: string;
  contractUrl: string;
  contractHash: string;
  adminFee: number;
  totalAmount: number;
  signedAt: string;
  durationMonths?: number;
  roomId?: string;
  startDate?: string;
  monthlyPrice?: number;
}

export interface ContractSignPayload {
  propertyId: string;
  roomId?: string;
  durationMonths: number;
  startDate: string;
  tenantNikPassport: string;
  signatureBase64: string;
  affirmativeConsent: boolean;
}

export interface RentalAgreement extends Rental {
  propertyAddress?: string;
  landlordName?: string;
  landlordEmail?: string;
  landlordPhone?: string;
  tenantName?: string;
  tenantEmail?: string;
  tenantPhone?: string;
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
  visitors?: number;
  users?: number;
  landlords?: number;
  properties?: number;
  rooms?: number;
  activeRentals?: number;
  pendingWithdrawals?: number;
  openTickets?: number;
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
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
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

export interface PropertyPhoto {
  id: string;
  propertyId: string;
  roomId?: string | null;
  url: string;
  publicId?: string | null;
  category: PhotoCategory;
  caption?: string | null;
  orderIndex: number;
}

export interface Room {
  id: string;
  propertyId: string;
  roomNumber: string;
  floor: number;
  type: string;
  price?: number | null;
  effectivePrice?: number;
  status: DiscreteRoomStatus;
  reserved_until?: string | Date | null;
  reserved_by_rental_id?: string | null;
  photos?: PropertyPhoto[];
}

export interface MaintenanceTicket {
  id: string;
  rentalId: string;
  tenantId: string;
  propertyId: string;
  roomId?: string | null;
  category: TicketCategory;
  title: string;
  description: string;
  photoUrl?: string | null;
  status: TicketStatus;
  createdAt?: string;
  updatedAt?: string;
  resolvedAt?: string | null;
  propertyName?: string;
  tenantName?: string;
  roomNumber?: string;
}

export { BALI_DISTRICTS, type BaliDistrict } from '../constants/districts';


