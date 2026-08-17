import React from 'react';
import { describe, it, expect } from 'vitest';
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
});
