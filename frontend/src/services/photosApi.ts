import { request } from './apiClient';
import { PropertyPhoto, PhotoCategory } from '../types/index';

export const photosApi = {
  getPhotos: (propertyId: string, category?: PhotoCategory, roomId?: string) => {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (roomId) params.append('roomId', roomId);
    const qs = params.toString();
    return request<PropertyPhoto[]>(`/properties/${propertyId}/photos${qs ? `?${qs}` : ''}`);
  },

  uploadPhotos: (propertyId: string, formData: FormData) =>
    request<PropertyPhoto[]>(`/properties/${propertyId}/photos`, {
      method: 'POST',
      body: formData
    }),

  reorderPhotos: (propertyId: string, photoIds: string[]) =>
    request<{ success: boolean }>(`/properties/${propertyId}/photos/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ photoIds })
    }),

  deletePhoto: (propertyId: string, photoId: string) =>
    request<{ success: boolean }>(`/properties/${propertyId}/photos/${photoId}`, {
      method: 'DELETE'
    })
};
