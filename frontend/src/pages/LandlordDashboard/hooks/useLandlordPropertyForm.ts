import { useState, useEffect } from 'react';
import { User, Property, FacilityFilterState } from '../../../types/index';
import { PropertyFormState } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export function useLandlordPropertyForm(
  landlordUser: User | null,
  loadedTabs: React.MutableRefObject<Set<string>>,
  fetchLandlordProperties: (landlordId: string) => Promise<void>
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
    image: '',
    facilities: {
      Listrik: true,
      Air: true,
      Wifi: true,
      Kebersihan: true,
      Keamanan: false,
      Parkir: false
    }
  });

  const [uploadingImage, setUploadingImage] = useState<boolean>(false);

  useEffect(() => {
    if (!showPropModal) return;

    let mapInstance: unknown = null;
    const timer = setTimeout(() => {
      if (!showPropModal) return;

      const initialLat = parseFloat(propertyForm.latitude) || -8.6500;
      const initialLng = parseFloat(propertyForm.longitude) || 115.2166;

      if (typeof window.L === 'undefined') return;

      const mapContainer = document.getElementById('map-picker') as (HTMLElement & { _leaflet_id?: number }) | null;
      if (!mapContainer) return;

      if (mapContainer._leaflet_id) {
        return;
      }

      const map = window.L.map('map-picker').setView([initialLat, initialLng], 12);
      mapInstance = map;

      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      const marker = window.L.marker([initialLat, initialLng], { draggable: true }).addTo(map);

      const updateCoords = (lat: number, lng: number) => {
        setPropertyForm((prev) => ({
          ...prev,
          latitude: lat.toFixed(6),
          longitude: lng.toFixed(6)
        }));
      };

      marker.on('dragend', () => {
        const markerWithLatLng = marker as unknown as { getLatLng: () => { lat: number; lng: number } };
        if (markerWithLatLng.getLatLng) {
          const position = markerWithLatLng.getLatLng();
          updateCoords(position.lat, position.lng);
        }
      });

      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        marker.setLatLng([lat, lng] as unknown as [number, number]);
        updateCoords(lat, lng);
      });

      setTimeout(() => map.invalidateSize(), 300);
    }, 100);

    return () => {
      clearTimeout(timer);
      if (mapInstance && typeof (mapInstance as { remove: () => void }).remove === 'function') {
        (mapInstance as { remove: () => void }).remove();
        mapInstance = null;
      }
    };
  }, [showPropModal, propertyForm.latitude, propertyForm.longitude]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPropertyForm((prev) => ({ ...prev, image: reader.result as string }));
      setUploadingImage(false);
    };
    reader.onerror = () => {
      alert("Gagal membaca berkas gambar.");
      setUploadingImage(false);
    };
    reader.readAsDataURL(file);
  };

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
      image: '',
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
    if (!landlordUser) return;
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
      image: propertyForm.image || undefined,
      ownerId: landlordUser.id,
      facilities: facilityList
    };

    const url = editingProperty
      ? `${API_BASE}/properties/${editingProperty.id}`
      : `${API_BASE}/properties`;

    const method = editingProperty ? 'PUT' : 'POST';

    const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token') || '';
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      const data = (await res.json()) as { message: string };

      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      setShowPropModal(false);
      resetPropertyForm();
      loadedTabs.current.delete('overview');
      loadedTabs.current.delete('reviews');
      await fetchLandlordProperties(landlordUser.id);
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
      image: prop.image || '',
      facilities: facilitiesMap
    });
    setShowPropModal(true);
  };

  return {
    showPropModal,
    setShowPropModal,
    editingProperty,
    setEditingProperty,
    propertyForm,
    setPropertyForm,
    uploadingImage,
    handleImageUpload,
    resetPropertyForm,
    handlePropertySubmit,
    handleEditProperty
  };
}
