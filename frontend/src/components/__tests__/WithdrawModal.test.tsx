import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import WithdrawModal, { INDONESIAN_BANKS } from '../../pages/LandlordDashboard/components/WithdrawModal';
import { WithdrawFormState } from '../../pages/LandlordDashboard/types';

describe('WithdrawModal Component Suite', () => {
  it('renders all 10 Indonesian banks in dropdown', () => {
    const form: WithdrawFormState = {
      amount: '',
      bankName: 'BCA',
      accountNumber: '12345678',
      accountHolder: 'Budi Santoso'
    };

    render(
      <WithdrawModal
        balance={5000000}
        withdrawForm={form}
        setWithdrawForm={vi.fn()}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    expect(INDONESIAN_BANKS).toHaveLength(10);
    expect(screen.getByRole('option', { name: /BCA/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Bank Mandiri/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /BNI/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /BRI/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /BSI/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Bank Permata/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /CIMB Niaga/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Bank Danamon/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /SeaBank/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Bank Jago/ })).toBeInTheDocument();
  });

  it('populates amount with balance when "Tarik Semua (Max)" is clicked', () => {
    const form: WithdrawFormState = {
      amount: '',
      bankName: 'BCA',
      accountNumber: '12345678',
      accountHolder: 'Budi Santoso'
    };
    const setWithdrawForm = vi.fn();

    render(
      <WithdrawModal
        balance={7500000}
        withdrawForm={form}
        setWithdrawForm={setWithdrawForm}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    const maxBtn = screen.getByTestId('withdraw-max-btn');
    fireEvent.click(maxBtn);

    expect(setWithdrawForm).toHaveBeenCalledWith(expect.objectContaining({ amount: '7500000' }));
  });

  it('renders account holder input and updates state on change', () => {
    const form: WithdrawFormState = {
      amount: '',
      bankName: 'BCA',
      accountNumber: '12345678',
      accountHolder: 'Budi Santoso'
    };
    const setWithdrawForm = vi.fn();

    render(
      <WithdrawModal
        balance={5000000}
        withdrawForm={form}
        setWithdrawForm={setWithdrawForm}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    const holderInput = screen.getByPlaceholderText(/Contoh: Budi Santoso/i);
    expect(holderInput).toBeInTheDocument();
    expect(holderInput).toHaveValue('Budi Santoso');

    fireEvent.change(holderInput, { target: { value: 'Siti Rahma' } });
    expect(setWithdrawForm).toHaveBeenCalledWith(expect.objectContaining({ accountHolder: 'Siti Rahma' }));
  });
});
