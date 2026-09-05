import React from 'react';
import { useNavigate } from 'react-router-dom';
import { isUserProfileComplete, Rental } from '../types/index';
import { useTenantData } from './TenantDashboard/hooks/useTenantData';
import { useTenantProfile } from './TenantDashboard/hooks/useTenantProfile';
import { useRentalContractDownload } from './TenantDashboard/hooks/useRentalContractDownload';
import { usePendingPayment } from './TenantDashboard/hooks/usePendingPayment';
import { useTerminateRental } from './TenantDashboard/hooks/useTerminateRental';
import { useTenantReviews } from './TenantDashboard/hooks/useTenantReviews';

import { TenantSidebar } from './TenantDashboard/components/TenantSidebar';
import { TenantHeader } from './TenantDashboard/components/TenantHeader';
import { LegalKycBanner } from './TenantDashboard/components/LegalKycBanner';
import { IdentityProfileCard } from './TenantDashboard/components/IdentityProfileCard';
import { AccountSettingsCard } from './TenantDashboard/components/AccountSettingsCard';
import { LegalComplianceCard } from './TenantDashboard/components/LegalComplianceCard';
import { ActiveRentalSection } from './TenantDashboard/components/ActiveRentalSection';
import { RentalHistorySection } from './TenantDashboard/components/RentalHistorySection';
import { BillingHistoryList } from './TenantDashboard/components/BillingHistoryList';
import { TenantReviewsList } from './TenantDashboard/components/TenantReviewsList';
import { ReviewModal } from './TenantDashboard/components/ReviewModal';
import { TerminateRentalModal } from './TenantDashboard/components/TerminateRentalModal';
import { PendingPaymentModal } from './TenantDashboard/components/PendingPaymentModal';
import { ContractViewerModal } from './TenantDashboard/components/ContractViewerModal';

export default function TenantDashboard() {
  const navigate = useNavigate();

  const {
    currentUser,
    setCurrentUser,
    activeTab,
    setActiveTab,
    properties,
    myReviews,
    myRentals,
    tabLoading,
    loadedTabs,
    handleLogout,
    fetchMyRentals,
    fetchProperties,
    fetchMyReviews
  } = useTenantData();

  const {
    profileForm,
    setProfileForm,
    isEditingProfile,
    setIsEditingProfile,
    isSubmittingProfile,
    handleStartEditProfile,
    handleProfileSubmit
  } = useTenantProfile({
    currentUser,
    setCurrentUser,
    onLogout: handleLogout
  });

  const {
    contractDownloading,
    handleOpenContract
  } = useRentalContractDownload();

  const [viewingContractRental, setViewingContractRental] = React.useState<Rental | null>(null);

  const {
    showPendingPaymentModal,
    setShowPendingPaymentModal,
    selectedPendingRental,
    setSelectedPendingRental,
    pendingPaymentProcessing,
    pendingPaymentError,
    handleOpenPendingPayment,
    handleProcessPendingPayment
  } = usePendingPayment({
    currentUser,
    onRefreshRentals: fetchMyRentals
  });

  const {
    showTerminateModal,
    terminateRental,
    terminatePassword,
    setTerminatePassword,
    terminateProcessing,
    openTerminateModal,
    closeTerminateModal,
    handleTerminateSubmit
  } = useTerminateRental({
    currentUser,
    onSuccess: async () => {
      if (currentUser) {
        await fetchMyRentals(currentUser.id);
      }
    },
    onLogout: handleLogout
  });

  const {
    showRevModal,
    setShowRevModal,
    editingReview,
    setEditingReview,
    reviewForm,
    setReviewForm,
    resetReviewForm,
    handleReviewSubmit,
    handleEditReview,
    handleDeleteReview
  } = useTenantReviews({
    currentUser,
    properties,
    fetchProperties,
    fetchMyReviews,
    onLogout: handleLogout
  });

  if (!currentUser) return null;

  const profileStatus = isUserProfileComplete(currentUser);
  const activeRental = myRentals.find(r => r.status === 'active');
  const otherRentals = myRentals.filter(r => r.status !== 'active');

  return (
    <div className="dashboard-layout">
      <TenantSidebar
        currentUser={currentUser}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onLogout={handleLogout}
        onNavigateLandlord={() => navigate('/landlord')}
      />

      <main className="dashboard-content">
        <TenantHeader
          userName={currentUser.name}
          onExplore={() => navigate('/')}
        />

        {activeTab === 'profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <LegalKycBanner
              profileStatus={profileStatus}
              isEditingProfile={isEditingProfile}
              onStartEditProfile={() => setIsEditingProfile(true)}
            />

            <div className="grid-2">
              <IdentityProfileCard
                currentUser={currentUser}
                profileForm={profileForm}
                setProfileForm={setProfileForm}
                isEditingProfile={isEditingProfile}
                setIsEditingProfile={setIsEditingProfile}
                isSubmittingProfile={isSubmittingProfile}
                onStartEditProfile={handleStartEditProfile}
                onProfileSubmit={handleProfileSubmit}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <AccountSettingsCard
                  userId={currentUser.id}
                  profileForm={profileForm}
                  setProfileForm={setProfileForm}
                />

                <LegalComplianceCard />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'rentals' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <ActiveRentalSection
              activeRental={activeRental}
              isLoading={tabLoading.rentals}
              isLoaded={loadedTabs.current.has('rentals')}
              contractDownloading={contractDownloading}
              onOpenContract={handleOpenContract}
              onViewContractDetails={setViewingContractRental}
              onOpenTerminate={openTerminateModal}
              onExplore={() => navigate('/')}
            />

            <RentalHistorySection
              otherRentals={otherRentals}
              contractDownloading={contractDownloading}
              onOpenContract={handleOpenContract}
              onViewContractDetails={setViewingContractRental}
              onOpenPendingPayment={handleOpenPendingPayment}
            />
          </div>
        )}

        {activeTab === 'bills' && (
          <BillingHistoryList
            isLoading={tabLoading.bills}
            isLoaded={loadedTabs.current.has('bills')}
          />
        )}

        {activeTab === 'reviews' && (
          <TenantReviewsList
            reviews={myReviews}
            propertiesCount={properties.length}
            isLoading={tabLoading.reviews}
            isLoaded={loadedTabs.current.has('reviews')}
            onOpenNewReview={async () => {
              await resetReviewForm();
              setShowRevModal(true);
            }}
            onEditReview={handleEditReview}
            onDeleteReview={handleDeleteReview}
          />
        )}
      </main>

      <ReviewModal
        isOpen={showRevModal}
        editingReview={editingReview}
        reviewForm={reviewForm}
        properties={properties}
        setReviewForm={setReviewForm}
        onClose={() => {
          setShowRevModal(false);
          setEditingReview(null);
        }}
        onSubmit={handleReviewSubmit}
      />

      <TerminateRentalModal
        isOpen={showTerminateModal}
        terminateRental={terminateRental}
        terminatePassword={terminatePassword}
        setTerminatePassword={setTerminatePassword}
        terminateProcessing={terminateProcessing}
        onClose={closeTerminateModal}
        onSubmit={handleTerminateSubmit}
      />

      <PendingPaymentModal
        isOpen={showPendingPaymentModal}
        selectedPendingRental={selectedPendingRental}
        pendingPaymentProcessing={pendingPaymentProcessing}
        pendingPaymentError={pendingPaymentError}
        onClose={() => {
          if (!pendingPaymentProcessing) {
            setShowPendingPaymentModal(false);
            setSelectedPendingRental(null);
          }
        }}
        onProcessPayment={handleProcessPendingPayment}
      />

      {viewingContractRental && (
        <ContractViewerModal
          rental={viewingContractRental}
          onClose={() => setViewingContractRental(null)}
          onDownloadPdf={handleOpenContract}
          isDownloading={!!contractDownloading[viewingContractRental.id]}
        />
      )}
    </div>
  );
}
