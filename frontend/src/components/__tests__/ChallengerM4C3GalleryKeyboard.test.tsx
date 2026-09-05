import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Property, PropertyPhoto } from '../../types/index';
import { LanguageProvider } from '../../context/LanguageContext';
import { PropertyPhotoGallery } from '../BookingModal/components/PropertyPhotoGallery';

describe('Adversarial Challenge: Gallery Keyboard Navigation & Event Listener Teardown', () => {
  const mockProperty: Property = {
    id: 'prop-challenger-c3',
    name: 'Challenger Villa Canggu',
    district: 'Badung',
    address: 'Jl. Pantai Batu Bolong, Canggu',
    price: 4500000,
    rating: 4.8,
    image: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6',
    description: 'Challenger luxury villa in Canggu',
    facilities: ['Wifi', 'AC', 'Pool'],
    latitude: '-8.6500',
    longitude: '115.1300',
    totalRooms: 5,
    occupiedRooms: 2,
    ownerId: 'owner-challenger'
  };

  const samplePhotos: PropertyPhoto[] = [
    { id: 'p1', propertyId: 'prop-challenger-c3', url: 'https://example.com/p1.jpg', category: 'bedroom', caption: 'Photo 1 Bedroom', orderIndex: 0 },
    { id: 'p2', propertyId: 'prop-challenger-c3', url: 'https://example.com/p2.jpg', category: 'bathroom', caption: 'Photo 2 Bathroom', orderIndex: 1 },
    { id: 'p3', propertyId: 'prop-challenger-c3', url: 'https://example.com/p3.jpg', category: 'pool', caption: 'Photo 3 Pool', orderIndex: 2 },
    { id: 'p4', propertyId: 'prop-challenger-c3', url: 'https://example.com/p4.jpg', category: 'wifi_speedtest', caption: 'Photo 4 Speedtest', orderIndex: 3 }
  ];

  let addEventListenerSpy: any;
  let removeEventListenerSpy: any;

  beforeEach(() => {
    addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('verifies ArrowLeft, ArrowRight, and Escape navigate and close when lightbox is open', () => {
    render(
      <LanguageProvider>
        <PropertyPhotoGallery property={mockProperty} photos={samplePhotos} />
      </LanguageProvider>
    );

    // Lightbox starts closed
    expect(screen.queryByTestId('gallery-lightbox')).not.toBeInTheDocument();

    // Click hero image to open lightbox
    const hero = screen.getByTestId('gallery-hero-image');
    fireEvent.click(hero);

    const lightbox = screen.getByTestId('gallery-lightbox');
    expect(lightbox).toBeInTheDocument();
    expect(screen.getByText('1 / 4')).toBeInTheDocument();

    // Test ArrowRight: 1/4 -> 2/4 -> 3/4 -> 4/4
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('2 / 4')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('3 / 4')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('4 / 4')).toBeInTheDocument();

    // Test boundary wrap-around forward: 4/4 -> 1/4
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('1 / 4')).toBeInTheDocument();

    // Test boundary wrap-around backward: 1/4 -> 4/4
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('4 / 4')).toBeInTheDocument();

    // Test ArrowLeft backward: 4/4 -> 3/4
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('3 / 4')).toBeInTheDocument();

    // Test legacy key names: 'Left' and 'Right' (IE/Edge legacy values)
    fireEvent.keyDown(window, { key: 'Left' });
    expect(screen.getByText('2 / 4')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Right' });
    expect(screen.getByText('3 / 4')).toBeInTheDocument();

    // Test Escape closes lightbox
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('gallery-lightbox')).not.toBeInTheDocument();

    // After close, Arrow keys do not cause errors or re-open lightbox
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.queryByTestId('gallery-lightbox')).not.toBeInTheDocument();
  });

  it('verifies that the event listener is cleanly removed when lightbox closes', () => {
    render(
      <LanguageProvider>
        <PropertyPhotoGallery property={mockProperty} photos={samplePhotos} />
      </LanguageProvider>
    );

    // Initially, no keydown listener should be attached
    const initialKeydownListeners = addEventListenerSpy.mock.calls.filter((c: any[]) => c[0] === 'keydown');
    expect(initialKeydownListeners.length).toBe(0);

    // Open lightbox
    const hero = screen.getByTestId('gallery-hero-image');
    fireEvent.click(hero);

    // Now keydown listener is attached
    const afterOpenAddListeners = addEventListenerSpy.mock.calls.filter((c: any[]) => c[0] === 'keydown');
    expect(afterOpenAddListeners.length).toBe(1);
    const addedHandler = afterOpenAddListeners[0][1];

    // Close lightbox via Escape
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('gallery-lightbox')).not.toBeInTheDocument();

    // removeEventListener must have been called with the exact same handler function
    const removeListeners = removeEventListenerSpy.mock.calls.filter((c: any[]) => c[0] === 'keydown');
    expect(removeListeners.length).toBe(1);
    expect(removeListeners[0][1]).toBe(addedHandler);
  });

  it('verifies that the event listener is cleanly removed when component unmounts while lightbox is open', () => {
    const { unmount } = render(
      <LanguageProvider>
        <PropertyPhotoGallery property={mockProperty} photos={samplePhotos} />
      </LanguageProvider>
    );

    // Open lightbox
    const hero = screen.getByTestId('gallery-hero-image');
    fireEvent.click(hero);

    const afterOpenAddListeners = addEventListenerSpy.mock.calls.filter((c: any[]) => c[0] === 'keydown');
    expect(afterOpenAddListeners.length).toBe(1);
    const addedHandler = afterOpenAddListeners[0][1];

    // Unmount the component while lightbox is still open
    unmount();

    // removeEventListener must have been called during teardown with the exact handler
    const removeListeners = removeEventListenerSpy.mock.calls.filter((c: any[]) => c[0] === 'keydown');
    expect(removeListeners.length).toBe(1);
    expect(removeListeners[0][1]).toBe(addedHandler);
  });

  it('verifies no listener leaks during repeated open-close cycles (10 cycles)', () => {
    const { unmount } = render(
      <LanguageProvider>
        <PropertyPhotoGallery property={mockProperty} photos={samplePhotos} />
      </LanguageProvider>
    );

    for (let cycle = 1; cycle <= 10; cycle++) {
      // Open
      const hero = screen.getByTestId('gallery-hero-image');
      fireEvent.click(hero);
      expect(screen.getByTestId('gallery-lightbox')).toBeInTheDocument();

      // Close via Escape
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByTestId('gallery-lightbox')).not.toBeInTheDocument();

      // At each cycle end, number of addEventListener calls must equal number of removeEventListener calls
      const totalAdds = addEventListenerSpy.mock.calls.filter((c: any[]) => c[0] === 'keydown').length;
      const totalRemoves = removeEventListenerSpy.mock.calls.filter((c: any[]) => c[0] === 'keydown').length;
      expect(totalAdds).toBe(cycle);
      expect(totalRemoves).toBe(cycle);
    }

    unmount();
  });

  it('handles adversarial stress: 100 rapid keypresses without out-of-bounds index errors', () => {
    render(
      <LanguageProvider>
        <PropertyPhotoGallery property={mockProperty} photos={samplePhotos} />
      </LanguageProvider>
    );

    // Open lightbox
    fireEvent.click(screen.getByTestId('gallery-hero-image'));
    expect(screen.getByTestId('gallery-lightbox')).toBeInTheDocument();

    // Fire 100 rapid ArrowRight presses
    for (let i = 0; i < 100; i++) {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    }
    // Should be at index 100 % 4 = 0 -> 1/4
    expect(screen.getByText('1 / 4')).toBeInTheDocument();

    // Fire 100 rapid ArrowLeft presses
    for (let i = 0; i < 100; i++) {
      fireEvent.keyDown(window, { key: 'ArrowLeft' });
    }
    expect(screen.getByText('1 / 4')).toBeInTheDocument();

    // Close via Esc (legacy key)
    fireEvent.keyDown(window, { key: 'Esc' });
    expect(screen.queryByTestId('gallery-lightbox')).not.toBeInTheDocument();
  });

  it('verifies single-photo gallery boundary: keyboard arrows do not crash or change index', () => {
    const singlePhoto: PropertyPhoto[] = [
      { id: 'single-1', propertyId: 'prop-challenger-c3', url: 'https://example.com/s.jpg', category: 'thumbnail', caption: 'Only One', orderIndex: 0 }
    ];

    render(
      <LanguageProvider>
        <PropertyPhotoGallery property={mockProperty} photos={singlePhoto} />
      </LanguageProvider>
    );

    // Open lightbox
    fireEvent.click(screen.getByTestId('gallery-hero-image'));
    expect(screen.getByTestId('gallery-lightbox')).toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();

    // Arrow keys when only 1 photo exists
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('1 / 1')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('1 / 1')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('gallery-lightbox')).not.toBeInTheDocument();
  });

  it('verifies empty photos array with fallback cover: keyboard navigation is safe and stable', () => {
    render(
      <LanguageProvider>
        <PropertyPhotoGallery property={mockProperty} photos={[]} />
      </LanguageProvider>
    );

    // Open lightbox on fallback photo
    fireEvent.click(screen.getByTestId('gallery-hero-image'));
    expect(screen.getByTestId('gallery-lightbox')).toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();

    // Arrow keys
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('1 / 1')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('1 / 1')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('gallery-lightbox')).not.toBeInTheDocument();
  });
});
