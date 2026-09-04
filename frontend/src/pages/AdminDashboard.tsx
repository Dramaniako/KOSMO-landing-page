import React from 'react';
import { useAdminData } from './AdminDashboard/hooks/useAdminData';
import { useAdminUserManagement } from './AdminDashboard/hooks/useAdminUserManagement';
import { useAdminPropertyManagement } from './AdminDashboard/hooks/useAdminPropertyManagement';
import { useAdminReviewManagement } from './AdminDashboard/hooks/useAdminReviewManagement';
import { useAdminWithdrawalManagement } from './AdminDashboard/hooks/useAdminWithdrawalManagement';
import AdminSidebar from './AdminDashboard/components/AdminSidebar';
import AdminHeader from './AdminDashboard/components/AdminHeader';
import UsersTab from './AdminDashboard/components/UsersTab';
import PropertiesTab from './AdminDashboard/components/PropertiesTab';
import ReviewsTab from './AdminDashboard/components/ReviewsTab';
import WithdrawalsTab from './AdminDashboard/components/WithdrawalsTab';
import TrackingTab from './AdminDashboard/components/TrackingTab';
import UserModal from './AdminDashboard/components/UserModal';
import PropertyModerationModal from './AdminDashboard/components/PropertyModerationModal';
import ReviewModal from './AdminDashboard/components/ReviewModal';

export default function AdminDashboard() {
  const {
    navigate,
    activeTab,
    setActiveTab,
    users,
    properties,
    reviews,
    withdrawals,
    tabLoading,
    stats,
    trackingHistory,
    timeRange,
    setTimeRange,
    loadedTabs,
    getAuthToken,
    getAuthHeaders,
    getAuthOnlyHeaders,
    fetchUsers,
    fetchProperties,
    fetchReviews,
    fetchWithdrawals
  } = useAdminData();

  const {
    showUserModal,
    setShowUserModal,
    editingUser,
    userForm,
    setUserForm,
    resetUserForm,
    handleUserSubmit,
    handleEditUser,
    handleDeleteUser
  } = useAdminUserManagement(getAuthHeaders, fetchUsers);

  const {
    showPropModal,
    setShowPropModal,
    propertyForm,
    setPropertyForm,
    resetPropertyForm,
    handlePropertySubmit,
    handleEditProperty,
    handleDeleteProperty
  } = useAdminPropertyManagement(getAuthHeaders, users, fetchProperties);

  const {
    showRevModal,
    setShowRevModal,
    reviewForm,
    setReviewForm,
    handleEditReview,
    handleReviewSubmit,
    handleDeleteReview
  } = useAdminReviewManagement(getAuthHeaders, getAuthOnlyHeaders, fetchReviews);

  const { handleProcessWithdrawal, handleRejectWithdrawal } = useAdminWithdrawalManagement(
    getAuthHeaders,
    fetchWithdrawals
  );

  const handleLogout = (): void => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/');
  };

  const pendingWithdrawalsCount = withdrawals.filter(
    (w) => w.status === 'pending' || w.status === 'processing'
  ).length;

  const landlordUsers = users.filter((u) => u.role === 'landlord');

  return (
    <div className="dashboard-layout">
      {/* Sidebar Navigation */}
      <AdminSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingWithdrawalsCount={pendingWithdrawalsCount}
        onLogout={handleLogout}
      />

      {/* Main Content */}
      <main className="dashboard-content">
        <AdminHeader onNavigateHome={() => navigate('/')} />

        {/* Tab 1: Users Management */}
        {activeTab === 'users' && (
          <UsersTab
            users={users}
            loading={tabLoading.users && !loadedTabs.current.has('users')}
            onAddUser={() => {
              resetUserForm();
              setShowUserModal(true);
            }}
            onEditUser={handleEditUser}
            onDeleteUser={handleDeleteUser}
          />
        )}

        {/* Tab 2: Properties Moderation */}
        {activeTab === 'properties' && (
          <PropertiesTab
            properties={properties}
            loading={tabLoading.properties && !loadedTabs.current.has('properties')}
            onEditProperty={handleEditProperty}
            onDeleteProperty={handleDeleteProperty}
          />
        )}

        {/* Tab 3: Reviews Moderation */}
        {activeTab === 'reviews' && (
          <ReviewsTab
            reviews={reviews}
            loading={tabLoading.reviews && !loadedTabs.current.has('reviews')}
            onEditReview={handleEditReview}
            onDeleteReview={handleDeleteReview}
          />
        )}

        {/* Tab 4: Tracking Statistics */}
        {activeTab === 'tracking' && (
          <TrackingTab
            stats={stats}
            trackingHistory={trackingHistory}
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            loading={tabLoading.tracking && !loadedTabs.current.has('tracking')}
            authToken={getAuthToken()}
          />
        )}

        {/* Tab 5: Withdrawals Moderation */}
        {activeTab === 'withdrawals' && (
          <WithdrawalsTab
            withdrawals={withdrawals}
            loading={tabLoading.withdrawals && !loadedTabs.current.has('withdrawals')}
            onProcessWithdrawal={handleProcessWithdrawal}
            onRejectWithdrawal={handleRejectWithdrawal}
          />
        )}
      </main>

      {/* User Create/Edit Modal */}
      {showUserModal && (
        <UserModal
          editingUser={editingUser}
          userForm={userForm}
          setUserForm={setUserForm}
          onClose={() => {
            setShowUserModal(false);
            resetUserForm();
          }}
          onSubmit={handleUserSubmit}
        />
      )}

      {/* Property Moderation Modal */}
      {showPropModal && (
        <PropertyModerationModal
          propertyForm={propertyForm}
          setPropertyForm={setPropertyForm}
          landlordUsers={landlordUsers}
          onClose={() => {
            setShowPropModal(false);
            resetPropertyForm();
          }}
          onSubmit={handlePropertySubmit}
        />
      )}

      {/* Review Edit Modal */}
      {showRevModal && (
        <ReviewModal
          reviewForm={reviewForm}
          setReviewForm={setReviewForm}
          onClose={() => {
            setShowRevModal(false);
          }}
          onSubmit={handleReviewSubmit}
        />
      )}
    </div>
  );
}
