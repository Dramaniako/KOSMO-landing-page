import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { CurrencyProvider } from './context/CurrencyContext';
import { ErrorProvider } from './context/ErrorContext';
import ErrorBoundary from './components/ErrorBoundary';
import SeoHead from './components/SeoHead';

import ProtectedRoute from './components/ProtectedRoute';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const Login = lazy(() => import('./pages/Login'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const LandlordDashboard = lazy(() => import('./pages/LandlordDashboard'));
const LandlordOnboarding = lazy(() => import('./pages/LandlordOnboarding'));
const TenantDashboard = lazy(() => import('./pages/TenantDashboard'));

function RouteLoadingFallback() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-6 transition-colors duration-200">
      <div className="flex flex-col items-center gap-4 max-w-sm w-full">
        <div className="w-12 h-12 rounded-2xl bg-blue-600/10 dark:bg-blue-500/20 flex items-center justify-center animate-pulse">
          <div className="w-6 h-6 rounded-full border-2 border-blue-600 dark:border-blue-400 border-t-transparent animate-spin" />
        </div>
        <div className="w-full space-y-2 text-center">
          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-md w-3/4 mx-auto animate-pulse" />
          <div className="h-3 bg-slate-200/70 dark:bg-slate-800/70 rounded-md w-1/2 mx-auto animate-pulse" />
        </div>
      </div>
    </div>
  );
}

function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();
  return <ErrorBoundary locale={language}>{children}</ErrorBoundary>;
}

function NoIndexWrapper({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <SeoHead title={title} noindex={true} />
      {children}
    </>
  );
}

function RootRoute() {
  const token = localStorage.getItem('token') || localStorage.getItem('kosmo_token');
  const rawUser = localStorage.getItem('user');

  if (token && rawUser) {
    try {
      const user = JSON.parse(rawUser);
      if (user?.role === 'admin') {
        return <Navigate to="/admin" replace />;
      }
      if (user?.role === 'landlord') {
        return <Navigate to="/landlord" replace />;
      }
    } catch {
      // Non-JSON user string; allow LandingPage to mount
    }
  }

  return <LandingPage />;
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <CurrencyProvider>
          <ErrorProvider>
            <AppErrorBoundary>
              <BrowserRouter>
              <Suspense fallback={<RouteLoadingFallback />}>
                <Routes>
                  <Route path="/" element={<RootRoute />} />
                  <Route path="/kos/:propertyId" element={<LandingPage />} />
                  <Route path="/kos/:propertyId/:slug" element={<LandingPage />} />
                  <Route path="/area/:districtSlug" element={<LandingPage />} />
                  <Route
                    path="/login"
                    element={
                      <NoIndexWrapper title="Masuk Akun | KOSMO Bali">
                        <Login />
                      </NoIndexWrapper>
                    }
                  />
                  <Route
                    path="/admin"
                    element={
                      <NoIndexWrapper title="Admin Dashboard | KOSMO Bali">
                        <ProtectedRoute allowedRoles={['admin']}>
                          <AdminDashboard />
                        </ProtectedRoute>
                      </NoIndexWrapper>
                    }
                  />
                  <Route
                    path="/landlord"
                    element={
                      <NoIndexWrapper title="Landlord Dashboard | KOSMO Bali">
                        <ProtectedRoute allowedRoles={['landlord']}>
                          <LandlordDashboard />
                        </ProtectedRoute>
                      </NoIndexWrapper>
                    }
                  />
                  <Route
                    path="/landlord/onboarding"
                    element={
                      <NoIndexWrapper title="Landlord Onboarding | KOSMO Bali">
                        <ProtectedRoute allowedRoles={['landlord']}>
                          <LandlordOnboarding />
                        </ProtectedRoute>
                      </NoIndexWrapper>
                    }
                  />
                  <Route
                    path="/tenant"
                    element={
                      <NoIndexWrapper title="Tenant Dashboard | KOSMO Bali">
                        <ProtectedRoute allowedRoles={['tenant']}>
                          <TenantDashboard />
                        </ProtectedRoute>
                      </NoIndexWrapper>
                    }
                  />
                  {/* Fallback to landing page */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </AppErrorBoundary>
        </ErrorProvider>
        </CurrencyProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
