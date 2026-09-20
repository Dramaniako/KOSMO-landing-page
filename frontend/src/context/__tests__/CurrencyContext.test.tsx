import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CurrencyProvider, useCurrency, CurrencyPreference } from '../CurrencyContext';

function TestConsumer() {
  const { currency, setCurrency, toggleCurrency, formatPrice } = useCurrency();

  return (
    <div>
      <span data-testid="current-currency">{currency}</span>
      <span data-testid="formatted-price">{formatPrice(3200000)}</span>
      <button onClick={toggleCurrency}>Toggle Currency</button>
      <button onClick={() => setCurrency('usd')}>Set USD</button>
      <button onClick={() => setCurrency('idr')}>Set IDR</button>
      <button onClick={() => setCurrency('both')}>Set Both</button>
    </div>
  );
}

describe('CurrencyContext & CurrencyProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('provides safe fallback when used outside CurrencyProvider', () => {
    render(<TestConsumer />);
    expect(screen.getByTestId('current-currency').textContent).toBe('both');
    expect(screen.getByTestId('formatted-price').textContent).toContain('3.200.000');
    expect(screen.getByTestId('formatted-price').textContent).toContain('$200 USD');
  });

  it('initializes with "both" by default when localStorage is empty', () => {
    render(
      <CurrencyProvider>
        <TestConsumer />
      </CurrencyProvider>
    );

    expect(screen.getByTestId('current-currency').textContent).toBe('both');
    expect(localStorage.getItem('kosmo_currency')).toBe('both');
  });

  it('initializes with saved preference from localStorage', () => {
    localStorage.setItem('kosmo_currency', 'usd');

    render(
      <CurrencyProvider>
        <TestConsumer />
      </CurrencyProvider>
    );

    expect(screen.getByTestId('current-currency').textContent).toBe('usd');
    expect(screen.getByTestId('formatted-price').textContent).toBe('$200');
  });

  it('cycles through preferences correctly: both -> idr -> usd -> both', () => {
    render(
      <CurrencyProvider>
        <TestConsumer />
      </CurrencyProvider>
    );

    const toggleBtn = screen.getByText('Toggle Currency');

    // Initial state: both
    expect(screen.getByTestId('current-currency').textContent).toBe('both');

    // 1st click: both -> idr
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('current-currency').textContent).toBe('idr');
    expect(localStorage.getItem('kosmo_currency')).toBe('idr');
    expect(screen.getByTestId('formatted-price').textContent).toBe('Rp 3.200.000');

    // 2nd click: idr -> usd
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('current-currency').textContent).toBe('usd');
    expect(localStorage.getItem('kosmo_currency')).toBe('usd');
    expect(screen.getByTestId('formatted-price').textContent).toBe('$200');

    // 3rd click: usd -> both
    fireEvent.click(toggleBtn);
    expect(screen.getByTestId('current-currency').textContent).toBe('both');
    expect(localStorage.getItem('kosmo_currency')).toBe('both');
    expect(screen.getByTestId('formatted-price').textContent).toContain('3.200.000');
    expect(screen.getByTestId('formatted-price').textContent).toContain('$200 USD');
  });

  it('allows setting explicit currency via setCurrency', () => {
    render(
      <CurrencyProvider>
        <TestConsumer />
      </CurrencyProvider>
    );

    fireEvent.click(screen.getByText('Set USD'));
    expect(screen.getByTestId('current-currency').textContent).toBe('usd');
    expect(localStorage.getItem('kosmo_currency')).toBe('usd');

    fireEvent.click(screen.getByText('Set IDR'));
    expect(screen.getByTestId('current-currency').textContent).toBe('idr');
    expect(localStorage.getItem('kosmo_currency')).toBe('idr');
  });

  it('synchronizes currency across windows via StorageEvent', () => {
    render(
      <CurrencyProvider>
        <TestConsumer />
      </CurrencyProvider>
    );

    expect(screen.getByTestId('current-currency').textContent).toBe('both');

    act(() => {
      const storageEvent = new StorageEvent('storage', {
        key: 'kosmo_currency',
        newValue: 'usd'
      });
      window.dispatchEvent(storageEvent);
    });

    expect(screen.getByTestId('current-currency').textContent).toBe('usd');
  });
});
