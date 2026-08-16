import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage.tsx';
import Login from './pages/Login.tsx';
import AdminDashboard from './pages/AdminDashboard.tsx';
import LandlordDashboard from './pages/LandlordDashboard.tsx';
import TenantDashboard from './pages/TenantDashboard.tsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/landlord" element={<LandlordDashboard />} />
        <Route path="/tenant" element={<TenantDashboard />} />
        {/* Fallback to landing page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
