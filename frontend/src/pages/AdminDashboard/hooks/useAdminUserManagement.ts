import { useState } from 'react';
import { User } from '../../../types/index';
import { UserFormState } from '../types';

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api';

export function useAdminUserManagement(
  getAuthHeaders: () => Record<string, string>,
  fetchUsers: () => Promise<void>
) {
  const [showUserModal, setShowUserModal] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState<UserFormState>({
    name: '',
    email: '',
    password: '',
    role: 'tenant',
    phone: '',
    paymentMethod: 'Virtual Account'
  });

  const resetUserForm = (): void => {
    setEditingUser(null);
    setUserForm({
      name: '',
      email: '',
      password: '',
      role: 'tenant',
      phone: '',
      paymentMethod: 'Virtual Account'
    });
  };

  const handleUserSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!userForm.name || !userForm.email || (!editingUser && !userForm.password)) {
      alert("Harap lengkapi semua kolom wajib.");
      return;
    }

    const url = editingUser
      ? `${API_BASE}/users/${editingUser.id}`
      : `${API_BASE}/users`;
    const method = editingUser ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(userForm)
      });
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      setShowUserModal(false);
      resetUserForm();
      await fetchUsers();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    }
  };

  const handleEditUser = (user: User): void => {
    setEditingUser(user);
    setUserForm({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      phone: user.phone || '',
      paymentMethod: user.paymentMethod || 'Virtual Account'
    });
    setShowUserModal(true);
  };

  const handleDeleteUser = async (id: string): Promise<void> => {
    if (id === 'user-admin') {
      alert("Admin utama tidak dapat dihapus.");
      return;
    }
    const password = window.prompt("Harap masukkan password administrator Anda untuk konfirmasi penghapusan user:");
    if (!password) return;

    try {
      const res = await fetch(`${API_BASE}/users/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({ password })
      });
      const data = (await res.json()) as { message: string };
      if (!res.ok) throw new Error(data.message);

      alert(data.message);
      await fetchUsers();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      alert(errorMsg);
    }
  };

  return {
    showUserModal,
    setShowUserModal,
    editingUser,
    setEditingUser,
    userForm,
    setUserForm,
    resetUserForm,
    handleUserSubmit,
    handleEditUser,
    handleDeleteUser
  };
}
