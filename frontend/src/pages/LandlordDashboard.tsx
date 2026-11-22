import React, { useState } from 'react';
import { Property } from '../types/index';
import { useLandlordData } from './LandlordDashboard/hooks/useLandlordData';
import { useLandlordWithdraw } from './LandlordDashboard/hooks/useLandlordWithdraw';
import { useLandlordPropertyForm } from './LandlordDashboard/hooks/useLandlordPropertyForm';
import { useDeleteProperty } from './LandlordDashboard/hooks/useDeleteProperty';
import { useContractDownload } from './LandlordDashboard/hooks/useContractDownload';
import LandlordSidebar from './LandlordDashboard/components/LandlordSidebar';
import LandlordHeader from './LandlordDashboard/components/LandlordHeader';
import OverviewTab from './LandlordDashboard/components/OverviewTab';
import PropertiesTab from './LandlordDashboard/components/PropertiesTab';
import ReviewsTab from './LandlordDashboard/components/ReviewsTab';
import TenantsTab from './LandlordDashboard/components/TenantsTab';
import WithdrawModal from './LandlordDashboard/components/WithdrawModal';
import PropertyFormModal from './LandlordDashboard/components/PropertyFormModal';
import DeletePropertyModal from './LandlordDashboard/components/DeletePropertyModal';
import RoomInventoryModal from './LandlordDashboard/components/RoomInventoryModal';
import PhotoGalleryManager from './LandlordDashboard/components/PhotoGalleryManager';
import MaintenanceTab from './LandlordDashboard/components/MaintenanceTab';
import { performLogout } from '../utils/authSession';

export default function LandlordDashboard() {
  const {
    navigate,
    activeTab,
    setActiveTab,
    landlordUser,
    setLandlordUser,
    stats,
    properties,
    reviews,
    rentals,
    tickets,
    tabLoading,
    loadedTabs,
    fetchOverviewStats,
    fetchLandlordProperties,
    fetchLandlordReviews,
    fetchLandlordRentals
  } = useLandlordData();

  const {
    showWithdrawModal,
    setShowWithdrawModal,
    withdrawForm,
    setWithdrawForm,
    handleWithdrawSubmit
  } = useLandlordWithdraw(landlordUser, setLandlordUser, fetchOverviewStats);

  const {
    showPropModal,
    setShowPropModal,
    editingProperty,
    propertyForm,
    setPropertyForm,
    uploadingImage,
    handleImageUpload,
    resetPropertyForm,
    handlePropertySubmit,
    handleEditProperty
  } = useLandlordPropertyForm(landlordUser, loadedTabs, fetchLandlordProperties);

  const {
    showDeleteModal,
    setShowDeleteModal,
    deletePassword,
    setDeletePassword,
    deleteProcessing,
    handleDeleteProperty,
    handleDeleteSubmit
  } = useDeleteProperty(landlordUser, loadedTabs, fetchLandlordProperties);

  const { contractDownloading, handleLandlordContractDownload } = useContractDownload();

  const [roomModalProperty, setRoomModalProperty] = useState<Property | null>(null);
  const [photoModalProperty, setPhotoModalProperty] = useState<Property | null>(null);

  const handleLogout = (): void => {
    void performLogout(navigate);
  };

  const handleRefresh = (): void => {
    if (!landlordUser) return;
    loadedTabs.current.clear();
    if (activeTab === 'overview') void fetchOverviewStats(landlordUser.id);
    else if (activeTab === 'properties') void fetchLandlordProperties(landlordUser.id);
    else if (activeTab === 'reviews') void fetchLandlordReviews(landlordUser.id);
    else if (activeTab === 'tenants') void fetchLandlordRentals(landlordUser.id);
  };

  return (
    <div className="dashboard-layout">
      {/* Sidebar Navigation */}
      <LandlordSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenOnboarding={() => navigate('/landlord/onboarding')}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="dashboard-content">
        <style>{`
          @keyframes kosmoShimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
        `}</style>

        {/* Dashboard Header */}
        <LandlordHeader
          landlordUser={landlordUser}
          onRefresh={handleRefresh}
          refreshing={Boolean(tabLoading[activeTab])}
          onNavigateHome={() => navigate('/')}
        />

        {/* Tab 1: Overview & Finance */}
        {activeTab === 'overview' && (
          <OverviewTab
            stats={stats}
            landlordUser={landlordUser}
            loading={tabLoading.overview && !loadedTabs.current.has('overview')}
            rentals={rentals}
            tickets={tickets}
            onOpenWithdraw={() => setShowWithdrawModal(true)}
            onOpenAddProperty={() => {
              resetPropertyForm();
              setShowPropModal(true);
            }}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onStartOnboarding={() => navigate('/landlord/onboarding')}
          />
        )}

        {/* Tab 2: Properties Management */}
        {activeTab === 'properties' && (
          <PropertiesTab
            properties={properties}
            loading={tabLoading.properties && !loadedTabs.current.has('properties')}
            onAddProperty={() => {
              resetPropertyForm();
              setShowPropModal(true);
            }}
            onEditProperty={handleEditProperty}
            onDeleteProperty={handleDeleteProperty}
            onManageRooms={(p) => setRoomModalProperty(p)}
            onManagePhotos={(p) => setPhotoModalProperty(p)}
          />
        )}

        {/* Tab 3: Reviews Management */}
        {activeTab === 'reviews' && (
          <ReviewsTab
            reviews={reviews}
            loading={tabLoading.reviews && !loadedTabs.current.has('reviews')}
          />
        )}

        {/* Tab 4: Active Rentals / Tenants */}
        {activeTab === 'tenants' && (
          <TenantsTab
            rentals={rentals}
            loading={tabLoading.tenants && !loadedTabs.current.has('tenants')}
            contractDownloading={contractDownloading}
            onDownloadContract={handleLandlordContractDownload}
          />
        )}

        {/* Tab 5: Maintenance & Facility Reports */}
        {activeTab === 'maintenance' && (
          <MaintenanceTab />
        )}
      </main>

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <WithdrawModal
          balance={stats.balance}
          withdrawForm={withdrawForm}
          setWithdrawForm={setWithdrawForm}
          onClose={() => setShowWithdrawModal(false)}
          onSubmit={handleWithdrawSubmit}
        />
      )}

      {/* Property Form Modal (Add / Edit) */}
      {showPropModal && (
        <PropertyFormModal
          editingProperty={editingProperty}
          propertyForm={propertyForm}
          setPropertyForm={setPropertyForm}
          uploadingImage={uploadingImage}
          onImageUpload={handleImageUpload}
          onClose={() => {
            setShowPropModal(false);
            resetPropertyForm();
          }}
          onSubmit={handlePropertySubmit}
        />
      )}

      {/* Delete Property Security Password Modal */}
      {showDeleteModal && (
        <DeletePropertyModal
          deletePassword={deletePassword}
          setDeletePassword={setDeletePassword}
          deleteProcessing={deleteProcessing}
          onClose={() => {
            setShowDeleteModal(false);
            setDeletePassword('');
          }}
          onSubmit={handleDeleteSubmit}
        />
      )}

      {/* Room Inventory Modal */}
      {roomModalProperty && (
        <RoomInventoryModal
          property={roomModalProperty}
          onClose={() => setRoomModalProperty(null)}
          onRoomUpdated={() => {
            if (landlordUser) {
              fetchLandlordProperties(landlordUser.id);
              fetchOverviewStats(landlordUser.id);
            }
          }}
        />
      )}

      {/* Photo Gallery Manager Modal */}
      {photoModalProperty && (
        <PhotoGalleryManager
          property={photoModalProperty}
          onClose={() => setPhotoModalProperty(null)}
          onPhotosUpdated={() => {
            if (landlordUser) {
              fetchLandlordProperties(landlordUser.id);
            }
          }}
        />
      )}
    </div>
  );
}
