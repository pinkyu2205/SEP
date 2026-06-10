import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute, PublicOnlyRoute } from './auth/WebAuthContext';
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
import { HostPropertyReview } from './pages/host/HostPropertyReview';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<WebLogin />} />
        </Route>

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
            <Route path="/host/review/:id" element={<HostPropertyReview />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute allowedRoles={['host', 'super_admin']} />}>
          <Route element={<HostLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/properties" element={<PropertyList />} />
            <Route path="/properties/:id" element={<PropertyDetail />} />
            <Route path="/operations-managers" element={<ManagerList />} />
            <Route path="/managers" element={<ManagerList />} />
            <Route path="/tenants" element={<TenantList />} />
            <Route path="/contracts" element={<ContractList />} />
            <Route path="/maintenance" element={<MaintenanceList />} />
            <Route path="/financial" element={<FinancialManagement />} />
            <Route path="/equipments" element={<EquipmentList />} />
            <Route path="/reports" element={<ReportsAnalytics />} />
            <Route path="/notifications" element={<NotificationCenter />} />
            <Route
              path="/settings"
              element={
                <div className="p-6">
                  <h1 className="text-2xl font-bold text-slate-900">Cài đặt</h1>
                  <p className="text-slate-500 mt-2">Cấu hình hệ thống - tính năng đang phát triển.</p>
                </div>
              }
            />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
