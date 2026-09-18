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

  let user: User | null = null;
  try {
    user = JSON.parse(rawUser) as User;
  } catch {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!user || !user.role) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    if (redirectTo) {
      return <Navigate to={redirectTo} replace />;
    }

    // Smart role-based fallback navigation to prevent unauthorized layout mount
    if (user.role === 'admin') {
      return <Navigate to="/admin" replace />;
    } else if (user.role === 'landlord') {
      return <Navigate to="/landlord" replace />;
    } else {
      return <Navigate to="/tenant" replace />;
    }
  }

  return <>{children}</>;
}
