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
    expect(regData.token).toBeDefined();
    expect(regData.user.id).toBeDefined();

    // 2. Set authenticated state in browser
    await page.addInitScript(({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
    }, { token: regData.token, user: regData.user });

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

    // 7. Sign digital e-contract
    await expect(modalContent).toContainText('Tanda Tangan Kontrak Digital');
    const signButton = modalContent.locator('button:has-text("Setujui & Tanda Tangan")');
    await expect(signButton).toBeVisible();
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
    }, { token: regData.token, user: regData.user });

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
});
