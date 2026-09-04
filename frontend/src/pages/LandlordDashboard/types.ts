import React from 'react';
import { FacilityFilterState } from '../../types/index';

export interface WithdrawFormState {
  amount: string;
  bankName: string;
  accountNumber: string;
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
  image: string;
  facilities: FacilityFilterState;
  document?: string;
}

export const shimmerStyle: React.CSSProperties = {
  background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)',
  backgroundSize: '200% 100%',
  animation: 'kosmoShimmer 1.5s infinite',
  borderRadius: '8px'
};
