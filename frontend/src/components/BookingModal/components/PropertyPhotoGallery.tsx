import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, Maximize2, Wifi, Sparkles } from 'lucide-react';
import { Property, PropertyPhoto, PhotoCategory } from '../../../types/index';

export interface PropertyPhotoGalleryProps {
  property: Property;
  photos: PropertyPhoto[];
  loading?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  all: 'Semua',
  bedroom: 'Kamar Tidur',
  bathroom: 'Kamar Mandi',
  pool: 'Kolam',
  wifi_speedtest: 'WiFi Speedtest',
  thumbnail: 'Fasad / Utama',
  kitchen: 'Dapur',
  living_room: 'Ruang Bersama',
  exterior: 'Eksterior',
  other: 'Lainnya'
};

export const PropertyPhotoGallery: React.FC<PropertyPhotoGalleryProps> = ({
  property,
  photos,
  loading = false
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activePhotoIndex, setActivePhotoIndex] = useState<number>(0);
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false);

  // Fallback to property thumbnail if no photos provided
  const effectivePhotos: PropertyPhoto[] = useMemo(() => {
    if (photos && photos.length > 0) {
      return photos;
    }
    return [
      {
        id: 'fallback-cover',
        propertyId: property.id,
        url: property.image,
        category: 'thumbnail',
        caption: property.name,
        orderIndex: 0
      }
    ];
  }, [photos, property.id, property.image, property.name]);

  // Filter photos by selected category
  const filteredPhotos: PropertyPhoto[] = useMemo(() => {
    if (selectedCategory === 'all') {
      return effectivePhotos;
    }
    return effectivePhotos.filter((p) => p.category === selectedCategory);
  }, [effectivePhotos, selectedCategory]);

  // Ensure current active photo index is within bounds of filtered list
  const currentPhoto: PropertyPhoto =
    filteredPhotos[activePhotoIndex] || filteredPhotos[0] || effectivePhotos[0];

  const handleSelectCategory = (category: string) => {
    setSelectedCategory(category);
    setActivePhotoIndex(0);
  };

  const handlePrev = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (filteredPhotos.length <= 1) return;
    setActivePhotoIndex((prev) => (prev > 0 ? prev - 1 : filteredPhotos.length - 1));
  }, [filteredPhotos.length]);

  const handleNext = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (filteredPhotos.length <= 1) return;
    setActivePhotoIndex((prev) => (prev < filteredPhotos.length - 1 ? prev + 1 : 0));
  }, [filteredPhotos.length]);

  // Fullscreen lightbox keyboard navigation: ArrowLeft (prev), ArrowRight (next), Escape (close)
  useEffect(() => {
    if (!lightboxOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        setLightboxOpen(false);
      } else if (e.key === 'ArrowLeft' || e.key === 'Left') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight' || e.key === 'Right') {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [lightboxOpen, handlePrev, handleNext]);

  const getCategoryDisplay = (cat: PhotoCategory | string) => {
    return CATEGORY_LABELS[cat] || cat;
  };

  if (loading) {
    return (
      <div className="w-full h-72 bg-slate-100 dark:bg-slate-800 animate-pulse rounded-2xl flex items-center justify-center text-slate-400">
        <Sparkles size={24} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3 mb-6">
      {/* Category Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        <button
          type="button"
          data-testid="category-filter-all"
          className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors whitespace-nowrap ${
            selectedCategory === 'all'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
          onClick={() => handleSelectCategory('all')}
        >
          Semua ({effectivePhotos.length})
        </button>

        <button
          type="button"
          data-testid="category-filter-bedroom"
          className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors whitespace-nowrap ${
            selectedCategory === 'bedroom'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
          onClick={() => handleSelectCategory('bedroom')}
        >
          Kamar Tidur
        </button>

        <button
          type="button"
          data-testid="category-filter-bathroom"
          className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors whitespace-nowrap ${
            selectedCategory === 'bathroom'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
          onClick={() => handleSelectCategory('bathroom')}
        >
          Kamar Mandi
        </button>

        <button
          type="button"
          data-testid="category-filter-pool"
          className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors whitespace-nowrap ${
            selectedCategory === 'pool'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
          onClick={() => handleSelectCategory('pool')}
        >
          Kolam
        </button>

        <button
          type="button"
          data-testid="category-filter-wifi_speedtest"
          className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors whitespace-nowrap flex items-center gap-1 ${
            selectedCategory === 'wifi_speedtest'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
          }`}
          onClick={() => handleSelectCategory('wifi_speedtest')}
        >
          <Wifi size={12} />
          WiFi Speedtest
        </button>
      </div>

      {/* Hero Media Viewer */}
      <div className="relative w-full h-72 sm:h-80 bg-slate-900 rounded-2xl overflow-hidden group shadow-md gallery-hero">
        <img
          data-testid="gallery-hero-image"
          src={currentPhoto.url}
          alt={currentPhoto.caption || currentPhoto.category}
          className="w-full h-full object-cover cursor-pointer transition-transform duration-300 group-hover:scale-105 gallery-hero-img"
          onClick={() => setLightboxOpen(true)}
        />

        {/* Category & Verified Badges */}
        <div className="absolute top-3 left-3 flex items-center gap-2 z-10 pointer-events-none">
          <span
            data-testid="photo-category-badge"
            className="photo-category-badge px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-900/80 text-white backdrop-blur-md border border-white/20 shadow-sm"
          >
            {getCategoryDisplay(currentPhoto.category)}
          </span>
          {currentPhoto.category === 'wifi_speedtest' && (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-600/90 text-white backdrop-blur-md flex items-center gap-1 shadow-sm">
              <Wifi size={12} /> Verified Speedtest
            </span>
          )}
        </div>

        {/* Caption Overlay */}
        {currentPhoto.caption && (
          <div className="absolute bottom-3 left-3 right-16 px-3 py-1.5 rounded-lg bg-slate-900/70 text-white text-xs backdrop-blur-sm truncate">
            {currentPhoto.caption}
          </div>
        )}

        {/* Expand Lightbox Button */}
        <button
          type="button"
          aria-label="Buka Ukuran Penuh"
          onClick={() => setLightboxOpen(true)}
          className="absolute top-3 right-3 p-2 rounded-full bg-slate-900/60 hover:bg-slate-900/90 text-white backdrop-blur-md border border-white/20 transition-colors shadow-sm"
        >
          <Maximize2 size={15} />
        </button>

        {/* Carousel Navigation Arrows */}
        {filteredPhotos.length > 1 && (
          <>
            <button
              type="button"
              data-testid="gallery-prev-btn"
              aria-label="Foto Sebelumnya"
              onClick={handlePrev}
              className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-900/60 hover:bg-slate-900/90 text-white backdrop-blur-md border border-white/20 transition-all opacity-80 hover:opacity-100 shadow-md"
            >
              <ChevronLeft size={20} className="lucide-chevron-left" />
            </button>
            <button
              type="button"
              data-testid="gallery-next-btn"
              aria-label="Foto Berikutnya"
              onClick={handleNext}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-900/60 hover:bg-slate-900/90 text-white backdrop-blur-md border border-white/20 transition-all opacity-80 hover:opacity-100 shadow-md"
            >
              <ChevronRight size={20} className="lucide-chevron-right" />
            </button>
          </>
        )}
      </div>

      {/* Thumbnail Filmstrip */}
      {filteredPhotos.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {filteredPhotos.map((photo, idx) => {
            const isActive = idx === activePhotoIndex;
            return (
              <button
                key={photo.id || idx}
                type="button"
                data-testid={`gallery-thumb-${idx}`}
                className={`gallery-thumbnail relative flex-shrink-0 w-16 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                  isActive
                    ? 'border-blue-600 ring-2 ring-blue-500/30 scale-105'
                    : 'border-transparent opacity-70 hover:opacity-100 hover:border-slate-300'
                }`}
                onClick={() => setActivePhotoIndex(idx)}
              >
                <img
                  src={photo.url}
                  alt={photo.caption || `Thumbnail ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            );
          })}
        </div>
      )}

      {/* Fullscreen Lightbox Modal */}
      {lightboxOpen && (
        <div
          role="dialog"
          aria-label="Galeri Foto Lightbox"
          data-testid="gallery-lightbox"
          className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-sm"
          onClick={() => setLightboxOpen(false)}
        >
          {/* Lightbox Close Button */}
          <button
            type="button"
            aria-label="Tutup Lightbox"
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X size={24} className="lucide-x" />
          </button>

          {/* Lightbox Photo Info */}
          <div className="absolute top-4 left-4 text-white text-xs flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-white/10 font-semibold uppercase">
              {getCategoryDisplay(currentPhoto.category)}
            </span>
            <span>
              {activePhotoIndex + 1} / {filteredPhotos.length}
            </span>
          </div>

          {/* Lightbox Main Image */}
          <div
            className="relative max-w-5xl max-h-[80vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={currentPhoto.url}
              alt={currentPhoto.caption || 'Foto Galeri'}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />

            {/* Lightbox Prev / Next */}
            {filteredPhotos.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Foto Sebelumnya"
                  onClick={handlePrev}
                  className="absolute -left-12 sm:left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 hover:bg-black/90 text-white transition-colors"
                >
                  <ChevronLeft size={28} className="lucide-chevron-left" />
                </button>
                <button
                  type="button"
                  aria-label="Foto Berikutnya"
                  onClick={handleNext}
                  className="absolute -right-12 sm:right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/60 hover:bg-black/90 text-white transition-colors"
                >
                  <ChevronRight size={28} className="lucide-chevron-right" />
                </button>
              </>
            )}
          </div>

          {/* Lightbox Caption */}
          {currentPhoto.caption && (
            <p className="text-white/80 text-sm mt-4 text-center max-w-xl">
              {currentPhoto.caption}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default PropertyPhotoGallery;
