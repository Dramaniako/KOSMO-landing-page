const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export function useAdminWithdrawalManagement(
  getAuthHeaders: () => Record<string, string>,
  fetchWithdrawals: () => Promise<void>
) {
  const handleProcessWithdrawal = async (id: string): Promise<void> => {
    if (!window.confirm("Konfirmasi proses pencairan dana ke landlord?")) return;
    try {
      const res = await fetch(`${API_BASE}/admin/withdrawals/${id}/process`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: 'completed' })
      });
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);
      alert(data.message);
      await fetchWithdrawals();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    }
  };

  const handleRejectWithdrawal = async (id: string): Promise<void> => {
    const reason = window.prompt("Masukkan alasan penolakan pencairan dana (opsional):");
    if (reason === null) return;
    const password = window.prompt("Harap masukkan password administrator Anda untuk konfirmasi penolakan penarikan:");
    if (!password) return;

    try {
      const payload: { password: string; reason?: string } = { password };
      if (reason.trim()) {
        payload.reason = reason.trim();
      }

      const res = await fetch(`${API_BASE}/admin/withdrawals/${id}/reject`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);
      alert(data.message);
      await fetchWithdrawals();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    }
  };

  return {
    handleProcessWithdrawal,
    handleRejectWithdrawal
  };
}
