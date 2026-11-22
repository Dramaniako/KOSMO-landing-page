import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import LandlordOnboarding from '../LandlordOnboarding';
import { ThemeProvider } from '../../context/ThemeContext';
import { LanguageProvider } from '../../context/LanguageContext';
import { User, Property } from '../../types/index';

const defaultLandlordUser: User = {
  id: 'landlord-onb-1',
  name: 'I Made Surya',
  email: 'surya@kosmo.id',
  role: 'landlord',
  phone: '081234567890'
};

interface MockFetchOptions {
  meUser?: User;
  existingProperties?: Property[];
}

function createFetchMock(options: MockFetchOptions = {}) {
  const meUser = options.meUser || defaultLandlordUser;
  const existingProperties = options.existingProperties || [];

  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method || 'GET').toUpperCase();

    if (url.includes('/auth/me')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(meUser)
      } as Response);
    }

    if (url.includes('/properties') && method === 'GET') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(existingProperties)
      } as Response);
    }

    if (url.includes('/auth/profile') && method === 'PUT') {
      const parsedBody = init?.body ? (JSON.parse(String(init.body)) as Partial<User>) : {};
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            message: 'Profil berhasil diperbarui!',
            user: { ...meUser, ...parsedBody }
          })
      } as Response);
    }

    if (url.includes('/properties') && method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            message: 'Properti berhasil ditambahkan!',
            id: 'prop-new-101',
            propertyId: 'prop-new-101'
          })
      } as Response);
    }

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({})
    } as Response);
  });
}

function renderOnboarding(user: User = defaultLandlordUser) {
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('token', 'mock-landlord-jwt');

  return render(
    <MemoryRouter initialEntries={['/landlord/onboarding']}>
      <ThemeProvider>
        <LanguageProvider>
          <Routes>
            <Route path="/landlord/onboarding" element={<LandlordOnboarding />} />
            <Route path="/landlord" element={<div data-testid="landlord-dashboard-route">Landlord Dashboard</div>} />
            <Route path="/login" element={<div data-testid="login-route">Login Page</div>} />
          </Routes>
        </LanguageProvider>
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe('LandlordOnboarding Page', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders Step 1 live net-earnings calculator and requires consent checkboxes to advance', async () => {
    const fetchMock = createFetchMock();
    global.fetch = fetchMock;

    renderOnboarding();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/properties?ownerId='));
    });

    expect(screen.getByTestId('onboarding-step-1')).toBeInTheDocument();
    expect(screen.getByTestId('calc-net-monthly')).toHaveTextContent('Rp 29.100.000');

    // Update room count to 5 -> 5 * 3,000,000 * 0.97 = 14,550,000
    fireEvent.change(screen.getByLabelText(/Jumlah Kamar Terisi/i), {
      target: { value: '5' }
    });
    expect(screen.getByTestId('calc-net-monthly')).toHaveTextContent('Rp 14.550.000');

    const nextBtn = screen.getByTestId('step1-next-btn');
    expect(nextBtn).toBeDisabled();

    fireEvent.click(screen.getByTestId('agree-all-inclusive'));
    expect(nextBtn).toBeDisabled();

    fireEvent.click(screen.getByTestId('agree-commission'));
    expect(nextBtn).not.toBeDisabled();

    fireEvent.click(nextBtn);
    expect(screen.getByTestId('onboarding-step-2')).toBeInTheDocument();
  });

  it('submits Step 2 KYC & Payout Bank form to PUT /api/auth/profile and advances to Step 3', async () => {
    const fetchMock = createFetchMock();
    global.fetch = fetchMock;

    renderOnboarding();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/auth/me'), expect.anything());
    });

    // Advance Step 1 -> Step 2
    fireEvent.click(screen.getByTestId('agree-all-inclusive'));
    fireEvent.click(screen.getByTestId('agree-commission'));
    fireEvent.click(screen.getByTestId('step1-next-btn'));

    // Fill KYC & bank details in Step 2
    fireEvent.change(screen.getByTestId('onboarding-identity-number'), {
      target: { value: '5171012345678901' }
    });
    fireEvent.change(screen.getByTestId('onboarding-bank-name'), {
      target: { value: 'Mandiri' }
    });
    fireEvent.change(screen.getByTestId('onboarding-bank-account'), {
      target: { value: '14500998877' }
    });
    fireEvent.change(screen.getByTestId('onboarding-bank-holder'), {
      target: { value: 'I Made Surya' }
    });

    fireEvent.click(screen.getByTestId('step2-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('onboarding-step-3')).toBeInTheDocument();
    });

    const profilePutCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).includes('/auth/profile') && (init?.method || '').toUpperCase() === 'PUT'
    );
    expect(profilePutCall).toBeDefined();
    const sentBody = JSON.parse(String(profilePutCall?.[1]?.body)) as Record<string, unknown>;
    expect(sentBody).toEqual(
      expect.objectContaining({
        name: 'I Made Surya',
        phone: '081234567890',
        identity_type: 'NIK',
        identity_number: '5171012345678901',
        bankName: 'Mandiri',
        bankAccountNumber: '14500998877',
        bankAccountHolder: 'I Made Surya'
      })
    );

    const savedUser = JSON.parse(localStorage.getItem('user') || '{}') as User;
    expect(savedUser.bankName).toBe('Mandiri');
    expect(savedUser.bankAccountNumber).toBe('14500998877');
  });

  it('submits Step 3 First Kos Registration to POST /api/properties and displays Step 4 summary', async () => {
    const fetchMock = createFetchMock();
    global.fetch = fetchMock;

    renderOnboarding();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/auth/me'), expect.anything());
    });

    // Step 1 -> Step 2
    fireEvent.click(screen.getByTestId('agree-all-inclusive'));
    fireEvent.click(screen.getByTestId('agree-commission'));
    fireEvent.click(screen.getByTestId('step1-next-btn'));

    // Step 2 -> Step 3
    fireEvent.change(screen.getByTestId('onboarding-bank-account'), {
      target: { value: '7720112233' }
    });
    fireEvent.click(screen.getByTestId('step2-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('onboarding-step-3')).toBeInTheDocument();
    });

    // Fill Step 3 property details
    fireEvent.change(screen.getByTestId('onboarding-prop-name'), {
      target: { value: 'KOSMO Lotus Canggu' }
    });
    fireEvent.change(screen.getByTestId('onboarding-prop-district'), {
      target: { value: 'Canggu' }
    });
    fireEvent.change(screen.getByTestId('onboarding-prop-price'), {
      target: { value: '3500000' }
    });
    fireEvent.change(screen.getByTestId('onboarding-prop-rooms'), {
      target: { value: '12' }
    });
    fireEvent.change(screen.getByTestId('onboarding-prop-address'), {
      target: { value: 'Jl. Batu Bolong No. 77, Canggu' }
    });

    fireEvent.click(screen.getByTestId('step3-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('onboarding-step-4')).toBeInTheDocument();
    });

    const postPropCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).includes('/properties') && (init?.method || '').toUpperCase() === 'POST'
    );
    expect(postPropCall).toBeDefined();
    const propPayload = JSON.parse(String(postPropCall?.[1]?.body)) as Record<string, unknown>;
    expect(propPayload).toEqual(
      expect.objectContaining({
        name: 'KOSMO Lotus Canggu',
        district: 'Canggu',
        address: 'Jl. Batu Bolong No. 77, Canggu',
        price: 3500000,
        totalRooms: 12,
        ownerId: 'landlord-onb-1',
        facilities: ['Listrik', 'Air', 'Wifi', 'Kebersihan']
      })
    );

    expect(screen.getByText(/KOSMO Lotus Canggu/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('finish-onboarding-btn'));
    expect(screen.getByTestId('landlord-dashboard-route')).toBeInTheDocument();
  });

  it('allows skipping Step 3 when landlord already owns existing properties', async () => {
    const existingProps: Property[] = [
      {
        id: 'prop-existing-1',
        name: 'KOSMO Villa Existing',
        district: 'Ubud',
        address: 'Jl. Raya Ubud No. 12',
        price: 3200000,
        rating: 4.9,
        image: 'https://example.com/ubud.jpg',
        facilities: ['Listrik', 'Air', 'Wifi'],
        description: 'Existing villa',
        latitude: '-8.5069',
        longitude: '115.2625',
        totalRooms: 6,
        occupiedRooms: 2,
        ownerId: 'landlord-onb-1'
      }
    ];
    const fetchMock = createFetchMock({ existingProperties: existingProps });
    global.fetch = fetchMock;

    renderOnboarding();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/properties?ownerId='));
    });

    // Step 1 -> Step 2
    fireEvent.click(screen.getByTestId('agree-all-inclusive'));
    fireEvent.click(screen.getByTestId('agree-commission'));
    fireEvent.click(screen.getByTestId('step1-next-btn'));

    // Step 2 -> Step 3
    fireEvent.change(screen.getByTestId('onboarding-bank-account'), {
      target: { value: '7720112233' }
    });
    fireEvent.click(screen.getByTestId('step2-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('onboarding-step-3')).toBeInTheDocument();
    });

    const notice = screen.getByTestId('existing-properties-notice');
    expect(notice).toHaveTextContent('1 properti');

    fireEvent.click(screen.getByTestId('skip-property-step-btn'));
    expect(screen.getByTestId('onboarding-step-4')).toBeInTheDocument();
    expect(screen.getByText(/1 Properti Aktif di Portofolio/i)).toBeInTheDocument();
  });
});
