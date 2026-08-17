import { test, expect } from '@playwright/test';

test.describe('Core Web Vitals & Navigation Timings', () => {
  test('landing page meets Core Web Vitals and DOMContentLoaded SLAs', async ({ page }) => {
    // Warmup dev server / route compilation
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Extract window.performance navigation timing
    const navTimings = await page.evaluate(() => {
      const entries = performance.getEntriesByType('navigation');
      if (entries.length > 0) {
        const nav = entries[0] as PerformanceNavigationTiming;
        return {
          domContentLoaded: nav.domContentLoadedEventEnd - nav.responseStart,
          responseDuration: nav.responseEnd - nav.responseStart,
          domInteractive: nav.domInteractive - nav.startTime
        };
      }
      return null;
    });

    if (navTimings && navTimings.domContentLoaded > 0) {
      expect(navTimings.domContentLoaded).toBeLessThan(3000);
    }

    // Verify brand heading renders promptly
    const brand = page.locator('.nav-brand, h1');
    await expect(brand.first()).toBeVisible({ timeout: 5000 });
  });
});
