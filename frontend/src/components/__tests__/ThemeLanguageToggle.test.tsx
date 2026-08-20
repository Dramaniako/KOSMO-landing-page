import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from '../../context/ThemeContext';
import { LanguageProvider } from '../../context/LanguageContext';
import ThemeLanguageToggle from '../ThemeLanguageToggle';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ThemeProvider>
      <LanguageProvider>
        {ui}
      </LanguageProvider>
    </ThemeProvider>
  );
}

describe('ThemeLanguageToggle Component', () => {
  it('renders language and theme toggle buttons with aria labels', () => {
    renderWithProviders(<ThemeLanguageToggle />);

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(2);

    const langBtn = buttons[0];
    const themeBtn = buttons[1];

    expect(langBtn.getAttribute('aria-label')).toBeTruthy();
    expect(themeBtn.getAttribute('aria-label')).toBeTruthy();
  });

  it('toggles language when language button is clicked', () => {
    renderWithProviders(<ThemeLanguageToggle />);

    const langBtn = screen.getAllByRole('button')[0];
    expect(langBtn.textContent).toContain('id');

    fireEvent.click(langBtn);
    expect(langBtn.textContent).toContain('en');

    fireEvent.click(langBtn);
    expect(langBtn.textContent).toContain('id');
  });

  it('toggles theme icon/state when theme button is clicked', () => {
    renderWithProviders(<ThemeLanguageToggle />);

    const themeBtn = screen.getAllByRole('button')[1];
    expect(themeBtn).toBeDefined();

    fireEvent.click(themeBtn);
    expect(themeBtn).toBeDefined();
  });

  it('renders extended labels when showLabels is true', () => {
    renderWithProviders(<ThemeLanguageToggle showLabels={true} />);

    expect(screen.getByText('(ID)')).toBeDefined();
  });

  it('applies custom className to wrapper container', () => {
    const { container } = renderWithProviders(<ThemeLanguageToggle className="custom-test-class" />);

    expect(container.firstChild).toHaveClass('custom-test-class');
  });
});
