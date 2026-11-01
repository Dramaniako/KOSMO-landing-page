import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import UsersTab from '../../pages/AdminDashboard/components/UsersTab';
import { User } from '../../types/index';

describe('Admin UsersTab Component Suite', () => {
  const mockUsers: User[] = [
    {
      id: 'u-1',
      name: 'Admin Super',
      email: 'admin@kosmo.test',
      role: 'admin',
      phone: '0811111111'
    },
    {
      id: 'u-2',
      name: 'Wayan Landlord',
      email: 'wayan@kosmo.test',
      role: 'landlord',
      phone: '0822222222',
      balance: 10000000,
      totalRevenue: 25000000
    },
    {
      id: 'u-3',
      name: 'Siti Tenant',
      email: 'siti@kosmo.test',
      role: 'tenant',
      phone: '0833333333'
    }
  ];

  it('renders users list with counts and role badges', () => {
    render(
      <UsersTab
        users={mockUsers}
        loading={false}
        onAddUser={vi.fn()}
        onEditUser={vi.fn()}
        onDeleteUser={vi.fn()}
      />
    );

    expect(screen.getByText('Admin Super')).toBeInTheDocument();
    expect(screen.getByText('Wayan Landlord')).toBeInTheDocument();
    expect(screen.getByText('Siti Tenant')).toBeInTheDocument();
    expect(screen.getByText('Super Admin')).toBeInTheDocument();
  });

  it('filters users by role filter buttons', () => {
    render(
      <UsersTab
        users={mockUsers}
        loading={false}
        onAddUser={vi.fn()}
        onEditUser={vi.fn()}
        onDeleteUser={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('filter-role-landlord'));
    expect(screen.getByText('Wayan Landlord')).toBeInTheDocument();
    expect(screen.queryByText('Siti Tenant')).not.toBeInTheDocument();
    expect(screen.queryByText('Admin Super')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('filter-role-tenant'));
    expect(screen.getByText('Siti Tenant')).toBeInTheDocument();
    expect(screen.queryByText('Wayan Landlord')).not.toBeInTheDocument();
  });

  it('filters users by search input (name, email, phone)', () => {
    render(
      <UsersTab
        users={mockUsers}
        loading={false}
        onAddUser={vi.fn()}
        onEditUser={vi.fn()}
        onDeleteUser={vi.fn()}
      />
    );

    const input = screen.getByTestId('users-search-input');
    fireEvent.change(input, { target: { value: '0833333333' } });

    expect(screen.getByText('Siti Tenant')).toBeInTheDocument();
    expect(screen.queryByText('Wayan Landlord')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'None' } });
    expect(screen.getByTestId('users-empty-state')).toBeInTheDocument();
  });
});
