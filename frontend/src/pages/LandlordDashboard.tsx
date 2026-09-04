import React from 'react';
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
    tabLoading,
    loadedTabs,
    fetchOverviewStats,
    fetchLandlordProperties
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

  const handleLogout = (): void => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/');
  };

  return (
    <div className="dashboard-layout">
      {/* Sidebar Navigation */}
      <LandlordSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
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
          onNavigateHome={() => navigate('/')}
        />

        {/* Tab 1: Overview & Finance */}
        {activeTab === 'overview' && (
          <OverviewTab
            stats={stats}
            landlordUser={landlordUser}
            loading={tabLoading.overview && !loadedTabs.current.has('overview')}
            onOpenWithdraw={() => setShowWithdrawModal(true)}
            onOpenAddProperty={() => {
              resetPropertyForm();
              setShowPropModal(true);
            }}
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
    </div>
  );
}
