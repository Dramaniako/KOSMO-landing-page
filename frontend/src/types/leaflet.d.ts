export interface LeafletPopup {
  openPopup(): void;
}

export interface LeafletMarker {
  bindPopup(content: string): LeafletPopup;
  addTo(map: LeafletMap): LeafletMarker;
  on(event: string, fn: () => void): void;
  setLatLng(latlng: [number, number]): void;
  getLatLng?(): { lat: number; lng: number };
}

export interface LeafletMap {
  setView(center: [number, number], zoom: number): LeafletMap;
  remove(): void;
  invalidateSize(): void;
  on(event: string, fn: (e: { latlng: { lat: number; lng: number } }) => void): void;
}

export interface LeafletTileLayer {
  addTo(map: LeafletMap): LeafletTileLayer;
}

export interface LeafletStatic {
  map(element: string | HTMLElement, options?: Record<string, unknown>): LeafletMap;
  tileLayer(urlTemplate: string, options?: Record<string, unknown>): LeafletTileLayer;
  marker(latlng: [number, number], options?: Record<string, unknown>): LeafletMarker;
}

declare global {
  interface Window {
    L?: LeafletStatic;
  }
}
