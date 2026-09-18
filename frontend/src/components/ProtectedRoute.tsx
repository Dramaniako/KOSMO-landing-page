import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { User, UserRole } from '../types/index';

export interface ProtectedRouteProps {
  children?: React.ReactNode;
  allowedRoles?: UserRole[];
  redirectTo?: string;
}

export default function ProtectedRoute({
  children,
  allowedRoles,
  redirectTo
}: ProtectedRouteProps) {
  const location = useLocation();

  const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
  const rawUser = localStorage.getItem('user');

  if (!token || !rawUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const clearAuthStorage = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('kosmo_token');
  };

  let user: User | null = null;
  try {
    const parsed = JSON.parse(rawUser);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      user = parsed as User;
    }
  } catch {
    clearAuthStorage();
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const validRoles: UserRole[] = ['admin', 'landlord', 'tenant'];
  if (!user || !user.role || !validRoles.includes(user.role)) {
    clearAuthStorage();
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    if (redirectTo) {
      return <Navigate to={redirectTo} replace />;
    }

    // Smart role-based fallback navigation to prevent unauthorized layout mount
    const fallbackTarget = user.role === 'admin' ? '/admin' : user.role === 'landlord' ? '/landlord' : '/tenant';
    if (location.pathname === fallbackTarget) {
      return <Navigate to="/" replace />;
    }
    return <Navigate to={fallbackTarget} replace />;
  }

  return <>{children}</>;
}
