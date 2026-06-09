import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute, PublicOnlyRoute } from './auth/WebAuthContext';
import { AuthLayout } from './layouts/AuthLayout';
import { PublicLayout } from './layouts/PublicLayout';
import { HostLayout } from './layouts/HostLayout';
import { SuperAdminLayout } from './layouts/SuperAdminLayout';
import { WebLogin } from './pages/auth/WebLogin';
import { ContractList } from './pages/contracts/ContractList';
import { Dashboard } from './pages/dashboard/Dashboard';
import { EquipmentList } from './pages/equipments/EquipmentList';
import { FinancialManagement } from './pages/financial/FinancialManagement';
import { MaintenanceList } from './pages/maintenance/MaintenanceList';
import { ManagerList } from './pages/managers/ManagerList';
import { NotificationCenter } from './pages/notifications/NotificationCenter';
import { PropertyDetail } from './pages/properties/PropertyDetail';
import { PropertyList } from './pages/properties/PropertyList';
import { ReportsAnalytics } from './pages/reports/ReportsAnalytics';
import { ActivityLogsSecurity } from './pages/super-admin/ActivityLogsSecurity';
import { BillingPaymentMonitoring } from './pages/super-admin/BillingPaymentMonitoring';
import { BuildingRoomMonitoring } from './pages/super-admin/BuildingRoomMonitoring';
import { ContractMonitoring } from './pages/super-admin/ContractMonitoring';
import { HostManagement } from './pages/super-admin/HostManagement';
import { MaintenanceEquipmentMonitoring } from './pages/super-admin/MaintenanceEquipmentMonitoring';
import { SuperAdminOverview } from './pages/super-admin/SuperAdminOverview';
import { SystemConfiguration } from './pages/super-admin/SystemConfiguration';
import { UserRoleManagement } from './pages/super-admin/UserRoleManagement';
import { PropertyOnboardingWizard } from './pages/super-admin/properties/wizard/PropertyOnboardingWizard';
import { ZoneManagement } from './pages/super-admin/zones/ZoneManagement';
import { TenantList } from './pages/tenants/TenantList';

// Public pages: lazy-loaded để tách bundle khỏi phần Dashboard quản trị.
const HomePage = lazy(() => import('./pages/public/HomePage'));
const PropertyListPage = lazy(() => import('./pages/public/PropertyListPage'));
const PropertyDetailPage = lazy(() => import('./pages/public/PropertyDetailPage'));
const ContactPage = lazy(() => import('./pages/public/ContactPage'));

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ─── Public Website (khách thuê / người tìm phòng) ─── */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/properties" element={<PropertyListPage />} />
          <Route path="/properties/:id" element={<PropertyDetailPage />} />
          <Route path="/contact" element={<ContactPage />} />
        </Route>

        {/* ─── Đăng nhập quản trị ─── */}
        <Route element={<PublicOnlyRoute />}>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<WebLogin />} />
          </Route>
        </Route>

        {/* ─── Dashboard Super Admin ─── */}
        <Route element={<ProtectedRoute allowedRoles={['super_admin']} />}>
          <Route element={<SuperAdminLayout />}>
            <Route path="/super-admin" element={<SuperAdminOverview />} />
            <Route path="/super-admin/users" element={<UserRoleManagement />} />
            <Route path="/super-admin/hosts" element={<HostManagement />} />
            <Route path="/super-admin/buildings" element={<BuildingRoomMonitoring />} />
            <Route path="/super-admin/properties/onboarding/:id" element={<PropertyOnboardingWizard />} />
            <Route path="/super-admin/billing" element={<BillingPaymentMonitoring />} />
            <Route path="/super-admin/contracts" element={<ContractMonitoring />} />
            <Route path="/super-admin/zones" element={<ZoneManagement />} />
            <Route path="/super-admin/maintenance" element={<MaintenanceEquipmentMonitoring />} />
            <Route path="/super-admin/settings" element={<SystemConfiguration />} />
            <Route path="/super-admin/security" element={<ActivityLogsSecurity />} />
          </Route>
        </Route>

        {/* ─── Dashboard Host (Admin System) — prefix /host ─── */}
        <Route element={<ProtectedRoute allowedRoles={['host', 'super_admin']} />}>
          <Route element={<HostLayout />}>
            <Route path="/host" element={<Dashboard />} />
            <Route path="/host/properties" element={<PropertyList />} />
            <Route path="/host/properties/:id" element={<PropertyDetail />} />
            <Route path="/host/operations-managers" element={<ManagerList />} />
            <Route path="/host/managers" element={<ManagerList />} />
            <Route path="/host/tenants" element={<TenantList />} />
            <Route path="/host/contracts" element={<ContractList />} />
            <Route path="/host/maintenance" element={<MaintenanceList />} />
            <Route path="/host/financial" element={<FinancialManagement />} />
            <Route path="/host/equipments" element={<EquipmentList />} />
            <Route path="/host/reports" element={<ReportsAnalytics />} />
            <Route path="/host/notifications" element={<NotificationCenter />} />
            <Route
              path="/host/settings"
              element={
                <div className="p-6">
                  <h1 className="text-2xl font-bold text-slate-900">Cài đặt</h1>
                  <p className="text-slate-500 mt-2">Cấu hình hệ thống - tính năng đang phát triển.</p>
                </div>
              }
            />
          </Route>
        </Route>

        {/* Route không khớp -> về Landing Page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
