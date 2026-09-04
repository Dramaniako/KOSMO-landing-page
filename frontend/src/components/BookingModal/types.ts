import React from 'react';
import { Property, User, ContractSignPayload, SignedContractData, ContractPreviewResponse } from '../../types/index';

export interface Props {
  property: Property | null;
  showContract: boolean;
  setShowContract: (show: boolean) => void;
  contractSigned: boolean;
  handleSignContract?: () => void;
  onSignContract?: (payload: ContractSignPayload) => Promise<boolean>;
  signedContractData?: SignedContractData | null;
  isSigning?: boolean;
  showPayment: boolean;
  setShowPayment: (show: boolean) => void;
  paymentProcessing: boolean;
  handleProcessPayment: () => void;
  showMap: boolean;
  setShowMap: (show: boolean) => void;
  onClose: () => void;
  currentUser: User | null;
  onNavigateToLogin: () => void;
  renderFacilityIcon: (fac: string) => React.ReactNode;
  hasActiveRental?: boolean;
  activeRentalError?: string | null;
}

export type { ContractPreviewResponse };
