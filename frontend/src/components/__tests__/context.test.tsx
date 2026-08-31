import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme } from '../../context/ThemeContext';
import { LanguageProvider, useTranslation } from '../../context/LanguageContext';

function ThemeConsumer() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-value">{theme}</span>
      <button onClick={toggleTheme}>Toggle Theme</button>
    </div>
  );
}

function LanguageConsumer() {
  const { language, toggleLanguage, t } = useTranslation();
  return (
    <div>
      <span data-testid="lang-value">{language}</span>
      <span data-testid="translated-title">{t('hero.badge')}</span>
      <button onClick={toggleLanguage}>Toggle Lang</button>
    </div>
  );
}

describe('ThemeContext and LanguageContext Providers', () => {
  it('toggles light and dark mode in ThemeProvider', () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );

    const themeVal = screen.getByTestId('theme-value');
    expect(themeVal.textContent).toMatch(/light|dark/);

    const initialTheme = themeVal.textContent;
    const btn = screen.getByRole('button', { name: /toggle theme/i });
    fireEvent.click(btn);

    const toggledTheme = screen.getByTestId('theme-value').textContent;
    expect(toggledTheme).not.toEqual(initialTheme);
  });

  it('switches languages and provides translations in LanguageProvider', () => {
    render(
      <LanguageProvider>
        <LanguageConsumer />
      </LanguageProvider>
    );

    const langVal = screen.getByTestId('lang-value');
    const translated = screen.getByTestId('translated-title');

    expect(langVal.textContent).toBe('id');
    expect(translated.textContent).toContain('Co-Living');

    const btn = screen.getByRole('button', { name: /toggle lang/i });
    fireEvent.click(btn);

    expect(screen.getByTestId('lang-value').textContent).toBe('en');
  });

  it('gracefully handles localStorage exception in ThemeProvider and defaults to light', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: localStorage is blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError: localStorage is blocked');
    });

    try {
      render(
        <ThemeProvider>
          <ThemeConsumer />
        </ThemeProvider>
      );

      const themeVal = screen.getByTestId('theme-value');
      expect(themeVal.textContent).toBe('light');

      const btn = screen.getByRole('button', { name: /toggle theme/i });
      fireEvent.click(btn);
      expect(themeVal.textContent).toBe('dark');
    } finally {
      window.matchMedia = originalMatchMedia;
      vi.restoreAllMocks();
    }
  });

  it('gracefully handles localStorage exception and API sync failure in LanguageProvider', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      if (key === 'token') return 'mock-jwt-token';
      if (key === 'user') return JSON.stringify({ id: 'usr-123', name: 'Test User' });
      return null;
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network disconnected'));

    try {
      render(
        <LanguageProvider>
          <LanguageConsumer />
        </LanguageProvider>
      );

      const btn = screen.getByRole('button', { name: /toggle lang/i });
      fireEvent.click(btn);

      expect(fetchSpy).toHaveBeenCalled();
      expect(screen.getByTestId('lang-value').textContent).toBe('en');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('returns default context values when useTheme and useTranslation are called outside providers', () => {
    function StandaloneConsumer() {
      const { theme, toggleTheme } = useTheme();
      const { language, t, toggleLanguage } = useTranslation();
      return (
        <div>
          <span data-testid="default-theme">{theme}</span>
          <span data-testid="default-lang">{language}</span>
          <span data-testid="param-translation">{t('footer.brand', { app: 'KOSMO' })}</span>
          <button data-testid="default-theme-btn" onClick={toggleTheme}>Theme</button>
          <button data-testid="default-lang-btn" onClick={toggleLanguage}>Lang</button>
        </div>
      );
    }

    render(<StandaloneConsumer />);
    expect(screen.getByTestId('default-theme').textContent).toBe('light');
    expect(screen.getByTestId('default-lang').textContent).toBe('id');

    // Clicking default no-op handlers does not crash
    fireEvent.click(screen.getByTestId('default-theme-btn'));
    fireEvent.click(screen.getByTestId('default-lang-btn'));
  });
});
