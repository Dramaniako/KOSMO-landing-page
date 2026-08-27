import { test, expect } from '@playwright/test';

test.describe('End-to-End Real Rental & Tenancy Flow', () => {
  const uniqueTimestamp = Date.now();
  const testTenant = {
    name: `Tenant Real E2E ${uniqueTimestamp}`,
    email: `tenant_${uniqueTimestamp}@kosmo-e2e.test`,
    password: 'Password123!',
    phone: '081299887766',
    role: 'tenant'
  };

  test.beforeAll(async ({ request }) => {
    // Reset occupiedRooms on test properties to ensure rooms are available
    try {
      const loginRes = await request.post('/api/auth/login', {
        data: { email: 'admin@kosmo.com', password: 'admin' }
      });
      if (loginRes.ok()) {
        const loginData = (await loginRes.json()) as { token: string };
        const token = loginData.token;
        await request.put('/api/properties/prop-01', {
          headers: { Authorization: `Bearer ${token}` },
          data: { occupiedRooms: 0, totalRooms: 50 }
        });
        await request.put('/api/properties/prop-02', {
          headers: { Authorization: `Bearer ${token}` },
          data: { occupiedRooms: 0, totalRooms: 50 }
        });
      }
    } catch (e) {
      console.warn('Property occupancy reset fallback:', e);
    }
  });

  test('registers tenant, searches kos with price filter, completes booking, and confirms tenancy in dashboard', async ({ page, request }) => {
    // Automatically accept all browser dialog alerts and log them
    page.on('dialog', async (dialog) => {
      console.log('--- TEST DIALOG DETECTED:', dialog.message());
      await dialog.accept();
    });

    // 1. Register a real tenant user against the backend API
    const regRes = await request.post('/api/auth/register', {
      data: testTenant
    });
    expect(regRes.ok()).toBeTruthy();
    const regData = (await regRes.json()) as { token: string; user: { id: string; name: string; email: string; role: string } };

    // 1b. Complete statutory KYC profile fields before booking
    const kycProfile = {
      identity_type: 'NIK',
      identity_number: '5171012304950001',
      address: 'Jl. Sunset Road No. 88, Badung, Bali',
      occupation: 'Software Engineer',
      emergency_contact_name: 'Made Wipradnyana',
      emergency_contact_relation: 'Orang Tua',
      emergency_contact_phone: '+6281234567899'
    };
    const profRes = await request.put('/api/auth/profile', {
      headers: { Authorization: `Bearer ${regData.token}` },
      data: kycProfile
    });
    expect(profRes.ok()).toBeTruthy();
    const updatedUser = { ...regData.user, ...kycProfile, phone: testTenant.phone };

    // Intercept Midtrans Snap SDK network requests
    await page.route('**/snap/snap.js', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: 'window.snap = { pay: function(_token, callbacks) { if (callbacks && callbacks.onSuccess) { callbacks.onSuccess({ status_code: "200", transaction_status: "settlement" }); } } };'
      });
    });

    // 2. Set authenticated state and mock Midtrans Snap in browser
    await page.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      try {
        Object.defineProperty(window, 'snap', {
          configurable: false,
          writable: false,
          value: {
            pay: (_snapToken: string, callbacks?: { onSuccess?: (res: unknown) => void }) => {
              if (callbacks && typeof callbacks.onSuccess === 'function') {
                callbacks.onSuccess({ status_code: '200', transaction_status: 'settlement' });
              }
            }
          }
        });
      } catch {
        (window as any).snap = {
          pay: (_snapToken: string, callbacks?: { onSuccess?: (res: unknown) => void }) => {
            if (callbacks && typeof callbacks.onSuccess === 'function') {
              callbacks.onSuccess({ status_code: '200', transaction_status: 'settlement' });
            }
          }
        };
      }
    }, { token: regData.token, user: updatedUser });

    // 3. Navigate to landing page
    await page.goto('/');
    await expect(page.locator('body')).toContainText('KOSMO');
    await expect(page.locator('body')).toContainText(`Dasbor (${regData.user.name})`);

    // 4. Test SearchFilterBar dual price inputs
    const minInput = page.locator('#min-price-input');
    const maxInput = page.locator('#max-price-input');
    await expect(minInput).toBeVisible();
    await expect(maxInput).toBeVisible();

    await minInput.fill('1000000');
    await maxInput.fill('8000000');

    const searchButton = page.locator('button:has-text("Cari Kos")');
    await searchButton.click();

    // 5. Open property detail modal
    const propertyCard = page.locator('.kos-card, .property-card').first();
    await expect(propertyCard).toBeVisible();
    const propertyTitle = await propertyCard.locator('h3').first().innerText();
    await propertyCard.click();

    // Verify modal opened
    const modalContent = page.locator('.modal-content');
    await expect(modalContent).toBeVisible();
    await expect(modalContent).toContainText(propertyTitle);

    // 6. Click 'Sewa Sekarang (All-Inclusive)'
    const bookButton = modalContent.locator('button:has-text("Sewa Sekarang")');
    await expect(bookButton).toBeVisible();
    await bookButton.click();

    // 7. Sign digital e-contract with evidentiary verification
    await expect(modalContent).toContainText('Tanda Tangan Kontrak Digital');
    
    // Fill 16-digit NIK
    const nikInput = modalContent.locator('#tenant-id-input');
    await expect(nikInput).toBeVisible();
    await nikInput.fill('5171012304950001');

    // Scroll terms region to enable consent
    const termsRegion = modalContent.locator('[role="region"]').first();
    await termsRegion.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await termsRegion.dispatchEvent('scroll');

    // Affirm consent
    const consentCheckbox = modalContent.locator('input[type="checkbox"]');
    await consentCheckbox.check();

    // Draw and confirm signature
    const canvas = modalContent.locator('canvas');
    await canvas.dispatchEvent('pointerdown', { clientX: 50, clientY: 50, pointerId: 1 });
    await canvas.dispatchEvent('pointermove', { clientX: 100, clientY: 80, pointerId: 1 });
    await canvas.dispatchEvent('pointerup', { clientX: 100, clientY: 80, pointerId: 1 });
    
    const confirmSigBtn = modalContent.locator('button:has-text("Konfirmasi Tanda Tangan")');
    await confirmSigBtn.click();

    // Submit contract signing
    const signButton = modalContent.locator('button:has-text("Setujui & Tanda Tangan")');
    await expect(signButton).toBeEnabled();
    await signButton.click();

    // 8. Payment step & complete booking
    await expect(modalContent).toContainText('Konfirmasi Pembayaran Sewa');
    const payButton = modalContent.locator('button:has-text("Bayar")');
    await expect(payButton).toBeVisible();
    await payButton.click();

    // 9. Verify redirection to Tenant Dashboard
    await expect(page).toHaveURL(/.*tenant/, { timeout: 15000 });
    await expect(page.locator('body')).toContainText('Halo,');
    await expect(page.locator('body')).toContainText(regData.user.name);

    // 10. Switch to 'Kos Saya (Sewa)' tab and verify that the rented property appears
    const rentalsTabButton = page.locator('button:has-text("Kos Saya (Sewa)")');
    await rentalsTabButton.click();
    await expect(page.locator('body')).toContainText(propertyTitle);
  });

  test('enforces single active tenancy rule by preventing duplicate active bookings', async ({ page, request }) => {
    // 1. Register a tenant user
    const uniqueId = Date.now();
    const tenantUser = {
      name: `Active Tenant ${uniqueId}`,
      email: `active_${uniqueId}@kosmo-e2e.test`,
      password: 'Password123!',
      phone: '081211223344',
      role: 'tenant'
    };

    const regRes = await request.post('/api/auth/register', { data: tenantUser });
    expect(regRes.ok()).toBeTruthy();
    const regData = (await regRes.json()) as { token: string; user: { id: string; name: string; email: string; role: string } };

    // 1b. Complete KYC profile before creating active rental
    const kycData = {
      identity_type: 'NIK',
      identity_number: '5171012304950002',
      address: 'Jl. Teuku Umar No. 88, Denpasar, Bali',
      occupation: 'Software Engineer',
      emergency_contact_name: 'Made Wipradnyana',
      emergency_contact_relation: 'Orang Tua',
      emergency_contact_phone: '+6281234567899'
    };
    await request.put('/api/auth/profile', {
      headers: { Authorization: `Bearer ${regData.token}` },
      data: kycData
    });
    const updatedTenantUser = { ...regData.user, ...kycData, phone: tenantUser.phone };

    // 2. Create the first active rental via API
    const rentRes = await request.post('/api/rentals', {
      headers: { Authorization: `Bearer ${regData.token}` },
      data: {
        tenantId: regData.user.id,
        propertyId: 'prop-01',
        propertyName: 'KOSMO Hub Denpasar Executive',
        price: 3500000
      }
    });
    expect(rentRes.status()).toBe(201);

    // 3. Attempting duplicate active booking via API receives 409 Conflict
    const dupRes = await request.post('/api/rentals', {
      headers: { Authorization: `Bearer ${regData.token}` },
      data: {
        tenantId: regData.user.id,
        propertyId: 'prop-02',
        propertyName: 'KOSMO Seminyak Tropical Villa Living',
        price: 5500000
      }
    });
    expect(dupRes.status()).toBe(409);
    const dupData = (await dupRes.json()) as { message: string };
    expect(dupData.message).toContain('Anda masih memiliki sewa kos yang aktif');

    // 4. Set auth state in browser and visit landing page
    await page.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, { token: regData.token, user: updatedTenantUser });

    await page.goto('/');

    // 5. Open property detail modal
    const secondCard = page.locator('.kos-card, .property-card').nth(1);
    await expect(secondCard).toBeVisible();
    await secondCard.click();

    // 6. Assert active rental warning banner and disabled button
    const modalContent = page.locator('.modal-content');
    await expect(modalContent).toBeVisible();
    await expect(modalContent).toContainText('Anda sudah memiliki hunian aktif');

    const disabledButton = modalContent.locator('button:has-text("Hunian Aktif Ditemukan")');
    await expect(disabledButton).toBeVisible();
    await expect(disabledButton).toBeDisabled();
  });

  test('allows tenant to terminate active rental with password confirmation and Authorization header', async ({ page, request }) => {
    // 1. Register a tenant user
    const uniqueId = Date.now();
    const password = 'Password123!';
    const tenantUser = {
      name: `Terminate Tenant ${uniqueId}`,
      email: `terminate_${uniqueId}@kosmo-e2e.test`,
      password,
      phone: '081299881122',
      role: 'tenant'
    };

    const regRes = await request.post('/api/auth/register', { data: tenantUser });
    expect(regRes.ok()).toBeTruthy();
    const regData = (await regRes.json()) as { token: string; user: { id: string; name: string; email: string; role: string } };

    // 1b. Complete KYC profile before creating active rental
    await request.put('/api/auth/profile', {
      headers: { Authorization: `Bearer ${regData.token}` },
      data: {
        identity_type: 'NIK',
        identity_number: '5171012304950003',
        address: 'Jl. Sunset Road No. 88, Badung, Bali',
        occupation: 'Software Engineer',
        emergency_contact_name: 'Made Wipradnyana',
        emergency_contact_relation: 'Orang Tua',
        emergency_contact_phone: '+6281234567899'
      }
    });

    // 2. Create active rental via API
    const rentRes = await request.post('/api/rentals', {
      headers: { Authorization: `Bearer ${regData.token}` },
      data: {
        tenantId: regData.user.id,
        propertyId: 'prop-03',
        propertyName: 'KOSMO Canggu Nomad Sanctuary',
        price: 6500000
      }
    });
    expect(rentRes.status()).toBe(201);

    // 3. Set auth state in browser and visit tenant dashboard
    await page.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, { token: regData.token, user: regData.user });

    await page.goto('/tenant');
    await expect(page.locator('body')).toContainText('Halo,');
    await expect(page.locator('body')).toContainText(regData.user.name);

    // 4. Switch to 'Kos Saya (Sewa)' tab
    const rentalsTab = page.locator('button:has-text("Kos Saya (Sewa)")');
    await rentalsTab.click();
    await expect(page.locator('body')).toContainText('KOSMO Canggu Nomad Sanctuary');

    // 5. Click 'Berhenti Menyewa' to open password confirmation modal
    const terminateBtn = page.locator('button:has-text("Berhenti Menyewa")').first();
    await expect(terminateBtn).toBeVisible();
    await terminateBtn.click();

    // 6. Fill password and confirm termination
    const modalContainer = page.locator('.modal-container');
    await expect(modalContainer).toContainText('Konfirmasi Penghentian Sewa');
    const pwdInput = modalContainer.locator('input[type="password"]');
    await pwdInput.fill(password);

    const confirmBtn = modalContainer.locator('button:has-text("Konfirmasi Berhenti")');
    await confirmBtn.click();

    // 7. Verify modal closes and status updates / terminates cleanly
    await expect(modalContainer).not.toBeVisible({ timeout: 10000 });
  });
});
