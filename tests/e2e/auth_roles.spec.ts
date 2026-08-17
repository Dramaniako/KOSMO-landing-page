import { test, expect } from '@playwright/test';

test.describe('Role-Based Authentication & Dashboard Redirection', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication endpoint
    await page.route('**/api/auth/login', async (route) => {
      const body = JSON.parse(route.request().postData() || '{}');
      const { email, password } = body;

      if (email === 'admin@kosmo.id' && password === 'admin123') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Login berhasil!',
            token: 'mock-jwt-admin-token',
            user: {
              id: 'user-admin',
              name: 'Super Admin',
              email: 'admin@kosmo.id',
              role: 'admin'
            }
          })
        });
      } else if (email === 'landlord@kosmo.id' && password === 'landlord123') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Login berhasil!',
            token: 'mock-jwt-landlord-token',
            user: {
              id: 'user-landlord',
              name: 'I Wayan Landlord',
              email: 'landlord@kosmo.id',
              role: 'landlord'
            }
          })
        });
      } else if (email === 'tenant@kosmo.id' && password === 'tenant123') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Login berhasil!',
            token: 'mock-jwt-tenant-token',
            user: {
              id: 'user-tenant',
              name: 'Made Tenant',
              email: 'tenant@kosmo.id',
              role: 'tenant'
            }
          })
        });
      } else {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Email atau password salah.' })
        });
      }
    });

    // Mock dashboard API endpoints to avoid unhandled errors
    await page.route('**/api/admin/stats', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ totalVisitors: 120, totalUsers: 45, totalLandlords: 12, totalProperties: 25, totalRooms: 150 })
      });
    });

    await page.route('**/api/stats*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ balance: 15000000, totalRevenue: 30000000, totalWithdrawn: 15000000, totalProperti: 3, totalRooms: 20, occupiedRooms: 16, occupancyRate: 80, activeTenants: 16, withdrawals: [] })
      });
    });

    await page.route('**/api/rentals*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });
  });

  test('tenant login successfully redirects to tenant dashboard', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="email"]', 'tenant@kosmo.id');
    await page.fill('input[type="password"]', 'tenant123');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/tenant', { timeout: 10000 });
    expect(page.url()).toContain('/tenant');
    await expect(page.locator('body')).toContainText('Tenant');
  });

  test('landlord login successfully redirects to landlord dashboard', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="email"]', 'landlord@kosmo.id');
    await page.fill('input[type="password"]', 'landlord123');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/landlord', { timeout: 10000 });
    expect(page.url()).toContain('/landlord');
    await expect(page.locator('body')).toContainText('Landlord');
  });

  test('admin login successfully redirects to admin dashboard', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="email"]', 'admin@kosmo.id');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/admin', { timeout: 10000 });
    expect(page.url()).toContain('/admin');
    await expect(page.locator('body')).toContainText('Admin');
  });

  test('displays error alert on invalid login credentials', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="email"]', 'wrong@kosmo.id');
    await page.fill('input[type="password"]', 'invalidpassword');
    await page.click('button[type="submit"]');

    await expect(page.locator('body')).toContainText('Email atau password salah.');
  });
});
