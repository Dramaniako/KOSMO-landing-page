import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AdminSidebar from '../../pages/AdminDashboard/components/AdminSidebar';

describe('AdminSidebar Component', () => {
  it('positions "Statistik & Tracking" at index 0 and highlights it when active', () => {
    const setActiveTab = vi.fn();
    const onLogout = vi.fn();

    render(
      <AdminSidebar
        activeTab="tracking"
        setActiveTab={setActiveTab}
        pendingWithdrawalsCount={5}
        onLogout={onLogout}
      />
    );

    const buttons = screen.getAllByRole('button');
    // buttons: [Statistik & Tracking, Manajemen User, Manajemen Properti, Manajemen Review, Pencairan Dana (5), Tiket & Komplain, Keluar Panel]
    expect(buttons[0]).toHaveTextContent('Statistik & Tracking');
    expect(buttons[0].className).toContain('active');

    // Click index 0
    fireEvent.click(buttons[0]);
    expect(setActiveTab).toHaveBeenCalledWith('tracking');

    // Verify ordering of subsequent tabs
    expect(buttons[1]).toHaveTextContent('Manajemen User');
    expect(buttons[2]).toHaveTextContent('Manajemen Properti');
    expect(buttons[3]).toHaveTextContent('Manajemen Review');
    expect(buttons[4]).toHaveTextContent('Pencairan Dana (5)');
    expect(buttons[5]).toHaveTextContent('Tiket & Komplain');

    // Click index 5
    fireEvent.click(buttons[5]);
    expect(setActiveTab).toHaveBeenCalledWith('maintenance');
  });

  it('triggers onLogout when clicking "Keluar Panel"', () => {
    const setActiveTab = vi.fn();
    const onLogout = vi.fn();

    render(
      <AdminSidebar
        activeTab="users"
        setActiveTab={setActiveTab}
        pendingWithdrawalsCount={0}
        onLogout={onLogout}
      />
    );

    const logoutButton = screen.getByRole('button', { name: /Keluar Panel/i });
    fireEvent.click(logoutButton);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
