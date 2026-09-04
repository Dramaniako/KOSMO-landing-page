export interface ReviewFormState {
  propertyId: string;
  rating: number;
  comment: string;
}

export interface ProfileFormState {
  name: string;
  phone: string;
  paymentMethod: string;
  notifications: boolean;
  language: string;
  identity_type: 'NIK' | 'PASSPORT';
  identity_number: string;
  address: string;
  occupation: string;
  emergency_contact_name: string;
  emergency_contact_relation: string;
  emergency_contact_phone: string;
  date_of_birth: string;
  gender: string;
}
