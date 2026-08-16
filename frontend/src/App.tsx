import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

const LandingPage = lazy(() => import('./pages/LandingPage.tsx'));
const Login = lazy(() => import('./pages/Login.tsx'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard.tsx'));
const LandlordDashboard = lazy(() => import('./pages/LandlordDashboard.tsx'));
const TenantDashboard = lazy(() => import('./pages/TenantDashboard.tsx'));

function RouteLoadingFallback() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4 max-w-sm w-full">
        <div className="w-12 h-12 rounded-2xl bg-blue-600/10 flex items-center justify-center animate-pulse">
          <div className="w-6 h-6 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
        <div className="w-full space-y-2 text-center">
          <div className="h-4 bg-slate-200 rounded-md w-3/4 mx-auto animate-pulse" />
          <div className="h-3 bg-slate-200/70 rounded-md w-1/2 mx-auto animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/landlord" element={<LandlordDashboard />} />
          <Route path="/tenant" element={<TenantDashboard />} />
          {/* Fallback to landing page */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
