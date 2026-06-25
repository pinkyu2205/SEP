import { lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute, PublicOnlyRoute } from './auth/WebAuthContext';
import { AuthLayout } from './layouts/AuthLayout';
import { PublicLayout } from './layouts/PublicLayout';
import { HostLayout } from './layouts/HostLayout';
import { AdminLayout } from './layouts/SuperAdminLayout';
import { WebLogin } from './pages/auth/WebLogin';
import { ContractList } from './pages/contracts/ContractList';
import { Dashboard } from './pages/dashboard/Dashboard';
import { EquipmentCatalogPage } from './pages/super-admin/EquipmentCatalogPage';
import { FinancialManagement } from './pages/financial/FinancialManagement';
import { MaintenanceList } from './pages/maintenance/MaintenanceList';
import { EquipmentQrManager } from './pages/equipments/EquipmentQrManager';
import { ManagerList } from './pages/managers/ManagerList';
import { NotificationCenter } from './pages/notifications/NotificationCenter';
import { PropertyDetail } from './pages/properties/PropertyDetail';
import { PropertyList } from './pages/properties/PropertyList';
import { ReportsAnalytics } from './pages/reports/ReportsAnalytics';
import { ActivityLogsSecurity } from './pages/super-admin/ActivityLogsSecurity';
import { BillingPaymentMonitoring } from './pages/super-admin/BillingPaymentMonitoring';
import { NhaThueLanding } from './pages/super-admin/nha-thue/NhaThueLanding';
import { ContractMonitoring } from './pages/super-admin/ContractMonitoring';
import { HostManagement } from './pages/super-admin/HostManagement';
import { MaintenanceEquipmentMonitoring } from './pages/super-admin/MaintenanceEquipmentMonitoring';
import { SuperAdminOverview } from './pages/super-admin/SuperAdminOverview';
import { SystemConfiguration } from './pages/super-admin/SystemConfiguration';
import { UserRoleManagement } from './pages/super-admin/UserRoleManagement';
import { PropertyOnboardingWizard } from './pages/super-admin/properties/wizard/PropertyOnboardingWizard';
import { ZoneManagement } from './pages/super-admin/zones/ZoneManagement';
import { TaoDraftPage } from './pages/super-admin/nha-thue/TaoDraftPage';
import { CauHinhKhaiThacPage } from './pages/super-admin/nha-thue/CauHinhKhaiThacPage';
import { TenantList } from './pages/tenants/TenantList';
import { ExpenseManagement } from './pages/finance/ExpenseManagement';
import { ReceivablesAging } from './pages/finance/ReceivablesAging';
import { DepositLedger } from './pages/finance/DepositLedger';
import { HostPropertyReview } from './pages/host/HostPropertyReview';

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
        <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<SuperAdminOverview />} />
            <Route path="/admin/users" element={<UserRoleManagement />} />
            <Route path="/admin/hosts" element={<HostManagement />} />
            <Route path="/admin/buildings" element={<NhaThueLanding />} />
            <Route path="/admin/properties/onboarding/:id" element={<PropertyOnboardingWizard />} />
            <Route path="/admin/buildings/draft" element={<TaoDraftPage />} />
            <Route path="/admin/buildings/configuration" element={<CauHinhKhaiThacPage />} />
            <Route path="/admin/buildings/configuration/:id" element={<CauHinhKhaiThacPage />} />
            {/* Đã gộp: "Nhập nhà hàng loạt" → Khởi tạo nhà; bỏ "Định giá & Phê duyệt" (auto gửi Host ở Cấu hình khai thác) */}
            <Route path="/admin/buildings/import" element={<Navigate to="/admin/buildings/draft" replace />} />
            <Route path="/admin/buildings/pricing-approval" element={<Navigate to="/admin/buildings/configuration" replace />} />
            <Route path="/admin/buildings/pricing-approval/:id" element={<Navigate to="/admin/buildings/configuration" replace />} />
            <Route path="/admin/billing" element={<BillingPaymentMonitoring />} />
            <Route path="/admin/contracts" element={<ContractMonitoring />} />
            <Route path="/admin/zones" element={<ZoneManagement />} />
            <Route path="/admin/maintenance" element={<MaintenanceEquipmentMonitoring />} />
            <Route path="/admin/equipments" element={<EquipmentCatalogPage />} />
            <Route path="/admin/settings" element={<SystemConfiguration />} />
            <Route path="/admin/security" element={<ActivityLogsSecurity />} />
          </Route>
        </Route>

        {/* ─── Dashboard Host (Admin System) — prefix /host ─── */}
        <Route element={<ProtectedRoute allowedRoles={['host', 'admin']} />}>
          <Route element={<HostLayout />}>
            <Route path="/host/review/:id" element={<HostPropertyReview />} />
            <Route path="/host" element={<Dashboard />} />
            <Route path="/host/properties" element={<PropertyList />} />
            <Route path="/host/properties/:id" element={<PropertyDetail />} />
            <Route path="/host/operations-managers" element={<ManagerList />} />
            <Route path="/host/managers" element={<ManagerList />} />
            <Route path="/host/tenants" element={<TenantList />} />
            <Route path="/host/contracts" element={<ContractList />} />
            <Route path="/host/maintenance" element={<MaintenanceList />} />
            <Route path="/host/equipments" element={<EquipmentQrManager />} />
            <Route path="/host/financial" element={<FinancialManagement />} />
            <Route path="/host/expenses" element={<ExpenseManagement />} />
            {/* Chỉ host (ROLE_OWNER) — admin sẽ bị điều hướng về /admin. Config lại sau nếu cần. */}
            <Route element={<ProtectedRoute allowedRoles={['host']} />}>
              <Route path="/host/receivables" element={<ReceivablesAging />} />
              <Route path="/host/deposits" element={<DepositLedger />} />
            </Route>
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
