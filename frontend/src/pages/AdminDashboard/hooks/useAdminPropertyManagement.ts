import { useState } from 'react';
import { User, Property, FacilityFilterState } from '../../../types/index';
import { PropertyFormState } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export function useAdminPropertyManagement(
  getAuthHeaders: () => Record<string, string>,
  users: User[],
  fetchProperties: () => Promise<void>
) {
  const [showPropModal, setShowPropModal] = useState<boolean>(false);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [propertyForm, setPropertyForm] = useState<PropertyFormState>({
    name: '',
    district: 'Denpasar',
    address: '',
    description: '',
    price: '',
    latitude: '-8.6700',
    longitude: '115.2166',
    totalRooms: '5',
    occupiedRooms: '0',
    image: '',
    ownerId: '',
    facilities: {
      Listrik: true,
      Air: true,
      Wifi: true,
      Kebersihan: true,
      Keamanan: false,
      Parkir: false
    }
  });

  const resetPropertyForm = (): void => {
    setEditingProperty(null);
    setPropertyForm({
      name: '',
      district: 'Denpasar',
      address: '',
      description: '',
      price: '',
      latitude: '-8.6700',
      longitude: '115.2166',
      totalRooms: '5',
      occupiedRooms: '0',
      image: '',
      ownerId: users.find((u) => u.role === 'landlord')?.id || '',
      facilities: {
        Listrik: true,
        Air: true,
        Wifi: true,
        Kebersihan: true,
        Keamanan: false,
        Parkir: false
      }
    });
  };

  const handlePropertySubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const facilityList = Object.keys(propertyForm.facilities).filter(
      (fac) => propertyForm.facilities[fac as keyof FacilityFilterState]
    );

    const payload = {
      name: propertyForm.name,
      district: propertyForm.district,
      address: propertyForm.address,
      description: propertyForm.description,
      price: parseInt(propertyForm.price, 10),
      latitude: propertyForm.latitude,
      longitude: propertyForm.longitude,
      totalRooms: parseInt(propertyForm.totalRooms, 10),
      occupiedRooms: parseInt(propertyForm.occupiedRooms, 10),
      image: propertyForm.image || undefined,
      ownerId: propertyForm.ownerId || undefined,
      facilities: facilityList
    };

    const url = editingProperty
      ? `${API_BASE}/properties/${editingProperty.id}`
      : `${API_BASE}/properties`;
    const method = editingProperty ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      setShowPropModal(false);
      resetPropertyForm();
      await fetchProperties();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    }
  };

  const handleEditProperty = (prop: Property): void => {
    setEditingProperty(prop);

    const facilitiesMap: FacilityFilterState = {
      Listrik: false,
      Air: false,
      Wifi: false,
      Kebersihan: false,
      Keamanan: false,
      Parkir: false
    };
    prop.facilities.forEach((fac) => {
      if (facilitiesMap[fac as keyof FacilityFilterState] !== undefined) {
        facilitiesMap[fac as keyof FacilityFilterState] = true;
      }
    });

    setPropertyForm({
      name: prop.name,
      district: prop.district,
      address: prop.address,
      description: prop.description,
      price: prop.price.toString(),
      latitude: prop.latitude,
      longitude: prop.longitude,
      totalRooms: prop.totalRooms.toString(),
      occupiedRooms: prop.occupiedRooms.toString(),
      image: prop.image || '',
      ownerId: prop.ownerId || '',
      facilities: facilitiesMap
    });
    setShowPropModal(true);
  };

  const handleDeleteProperty = async (id: string): Promise<void> => {
    const password = window.prompt("Harap masukkan password administrator Anda untuk konfirmasi penghapusan properti:");
    if (!password) return;

    try {
      const res = await fetch(`${API_BASE}/properties/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({ password })
      });
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      await fetchProperties();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    }
  };

  return {
    showPropModal,
    setShowPropModal,
    editingProperty,
    setEditingProperty,
    propertyForm,
    setPropertyForm,
    resetPropertyForm,
    handlePropertySubmit,
    handleEditProperty,
    handleDeleteProperty
  };
}
