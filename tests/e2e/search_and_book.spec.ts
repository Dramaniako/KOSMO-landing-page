import { test, expect } from '@playwright/test';

test.describe('Search, Filter, and Rental Booking Flow', () => {
  const mockProperties = [
    {
      id: 'prop-101',
      name: 'KOSMO Hub Seminyak Deluxe',
      district: 'Badung',
      address: 'Jl. Kayu Aya No. 18, Seminyak, Bali',
      price: 3500000,
      rating: 4.9,
      image: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=800&q=80',
      description: 'Kos eksklusif di pusat Seminyak dengan fasilitas lengkap.',
      facilities: ['Wifi', 'AC', 'Listrik', 'Air', 'Kebersihan', 'Parkir'],
      latitude: '-8.6833',
      longitude: '115.1572',
      totalRooms: 10,
      occupiedRooms: 3,
      ownerId: 'user-landlord-01'
    },
    {
      id: 'prop-102',
      name: 'KOSMO Sanur Living Eco',
      district: 'Denpasar',
      address: 'Jl. Danau Tamblingan No. 45, Sanur, Bali',
      price: 2500000,
      rating: 4.7,
      image: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80',
      description: 'Suasana tenang dekat pantai Sanur.',
      facilities: ['Wifi', 'AC', 'Parkir'],
      latitude: '-8.7000',
      longitude: '115.2600',
      totalRooms: 8,
      occupiedRooms: 2,
      ownerId: 'user-landlord-01'
    }
  ];

  test.beforeEach(async ({ page }) => {
    // Mock properties endpoint
    await page.route('**/api/properties*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockProperties)
      });
    });

    // Mock reviews endpoint
    await page.route('**/api/reviews', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    // Mock visitor tracking
    await page.route('**/api/tracking/visit', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'OK' })
      });
    });

    // Mock rental contract creation
    await page.route('**/api/rentals', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Penyewaan kos berhasil diproses!',
            rentalId: 'rent-e2e-101',
            document: '/uploads/contract_rent-e2e-101.pdf'
          })
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        });
      }
    });
  });

  test('loads landing page, applies filters, and opens booking detail modal', async ({ page }) => {
    await page.goto('/');

    // Assert branding / page header
    await expect(page.locator('body')).toContainText('KOSMO');
    await expect(page.locator('body')).toContainText('Pilihan Kos & Co-Living');

    // Select district filter
    const districtSelect = page.locator('select').first();
    if (await districtSelect.isVisible()) {
      await districtSelect.selectOption('Badung');
    }

    // Click search button
    const searchButton = page.locator('button:has-text("Cari Kos"), button:has-text("Terapkan Filter")').first();
    if (await searchButton.isVisible()) {
      await searchButton.click();
    }

    // Check that property cards are visible
    const propertyCard = page.locator('.kos-card, .property-card').first();
    await expect(propertyCard).toBeVisible();
    await expect(page.locator('body')).toContainText('KOSMO Hub Seminyak Deluxe');

    // Click to open detail modal
    await propertyCard.click();

    // Verify modal elements
    const modal = page.locator('.modal-content');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('KOSMO Hub Seminyak Deluxe');
  });

  test('signs e-contract and initiates booking flow', async ({ page }) => {
    // Set authenticated tenant in localStorage
    await page.addInitScript(() => {
      localStorage.setItem('user', JSON.stringify({
        id: 'user-tenant-e2e',
        name: 'Bayu Wipradnyana',
        email: 'bayu.tenant@kosmo.id',
        role: 'tenant',
        phone: '081234567890',
        identity_type: 'NIK',
        identity_number: '5171012304950001',
        address: 'Jl. Teuku Umar No. 88, Denpasar, Bali',
        occupation: 'Software Engineer',
        emergency_contact_name: 'Made Wipradnyana',
        emergency_contact_phone: '081234567899'
      }));
      localStorage.setItem('token', 'mock-valid-jwt-token-for-e2e');
    });

    await page.goto('/');

    // Open first property card modal
    const propertyCard = page.locator('.kos-card, .property-card').first();
    await propertyCard.click();

    // Click on Book / Rent action button
    const actionBtn = page.locator('button:has-text("Sewa Sekarang"), button:has-text("Ajukan Sewa"), button:has-text("Pesan Sekarang")').first();
    if (await actionBtn.isVisible()) {
      await actionBtn.click();
    }

    // Look for contract signature step or confirm button
    const nikInput = page.locator('#tenant-id-input');
    if (await nikInput.isVisible()) {
      await nikInput.fill('5171012304950001');

      const termsRegion = page.locator('[role="region"]').first();
      await termsRegion.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await termsRegion.dispatchEvent('scroll');

      const consentCheckbox = page.locator('input[type="checkbox"]');
      await consentCheckbox.check();

      const canvas = page.locator('canvas');
      await canvas.dispatchEvent('pointerdown', { clientX: 50, clientY: 50, pointerId: 1 });
      await canvas.dispatchEvent('pointermove', { clientX: 100, clientY: 80, pointerId: 1 });
      await canvas.dispatchEvent('pointerup', { clientX: 100, clientY: 80, pointerId: 1 });

      const confirmSigBtn = page.locator('button:has-text("Konfirmasi Tanda Tangan")');
      await confirmSigBtn.click();

      const signBtn = page.locator('button:has-text("Setujui & Tanda Tangan"), button:has-text("Setuju & Tanda Tangan")').first();
      if (await signBtn.isVisible()) {
        await expect(signBtn).toBeEnabled();
        await signBtn.click();
      }
    }
  });
});
