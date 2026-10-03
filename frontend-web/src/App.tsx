import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ProtectedRoute, PublicOnlyRoute } from '@/auth/WebAuthContext';
import { AuthLayout } from '@/layouts/AuthLayout';
import { PublicLayout } from '@/layouts/PublicLayout';
import { HostLayout } from '@/layouts/HostLayout';
import { AdminLayout } from '@/layouts/AdminLayout';
import { WebLogin } from '@/pages/auth/LoginPage';
import { ContractList } from '@/pages/host/contracts/ContractList';
import ExtensionRequestsHost from '@/pages/host/contracts/ExtensionRequestsHost';
import { Dashboard } from '@/pages/host/HostDashboard';
import { EquipmentCatalogPage } from '@/pages/admin/EquipmentCatalogPage';
import { FinancialManagement } from '@/pages/host/finance/FinancialManagement';
import { MaintenanceList } from '@/pages/host/maintenance/MaintenanceList';
import { ManagerList } from '@/pages/host/managers/ManagerList';
import { NotificationCenter } from '@/pages/host/notifications/NotificationCenter';
import { PropertyDetail } from '@/pages/host/properties/PropertyDetail';
import { PropertyList } from '@/pages/host/properties/PropertyList';
import { ReportsAnalytics } from '@/pages/host/reports/ReportsAnalytics';
import { AdminNotificationCenter } from '@/pages/admin/notifications/AdminNotificationCenter';
import { BillingPaymentMonitoring } from '@/pages/admin/BillingPaymentMonitoring';
import { NhaThueLanding } from '@/pages/admin/onboarding/OnboardingLanding';
import { ContractMonitoring } from '@/pages/admin/ContractMonitoring';
import RefundDisputes from '@/pages/admin/RefundDisputes';
import ExtensionRequests from '@/pages/admin/ExtensionRequests';
import UtilityDisputes from '@/pages/admin/UtilityDisputes';
import { HandoverMonitoring } from '@/pages/admin/HandoverMonitoring';
import { MeterOverridePasscodes } from '@/pages/admin/MeterOverridePasscodes';
import { UtilityBillPublishPage } from '@/pages/admin/utilityBills/UtilityBillPublishPage';
import { MaintenanceEquipmentMonitoring } from '@/pages/admin/MaintenanceEquipmentMonitoring';
import { RefusedPayments } from '@/pages/admin/RefusedPayments';
import { SuperAdminOverview } from '@/pages/admin/AdminOverview';
import { UserRoleManagement } from '@/pages/admin/UserRoleManagement';
import { PropertyOnboardingWizard } from '@/pages/admin/properties/wizard/PropertyOnboardingWizard';
import { ZoneManagement } from '@/pages/admin/zones/ZoneManagement';
import { AdminZoneOverview, HostZoneOverview } from '@/pages/zones/ZoneOverview';
import { TaoDraftPage } from '@/pages/admin/onboarding/CreateDraftPage';
import { DraftOnboardingList } from '@/pages/onboarding/DraftOnboardingList';
import { CauHinhKhaiThacPage } from '@/pages/admin/onboarding/OperationConfigPage';
import { TenantList } from '@/pages/host/tenants/TenantList';
import { ReceivablesAging } from '@/pages/host/finance/ReceivablesAging';
import { DepositLedger } from '@/pages/host/finance/DepositLedger';
import { BillingPayments } from '@/pages/host/finance/BillingPayments';
import { HostPropertyReview } from '@/pages/host/PropertyReview';
import { PricingConfigPage } from '@/pages/host/pricing/PricingConfigPage';
import { ManagerSalaryPage } from '@/pages/host/managers/ManagerSalaryPage';

// Public pages: lazy-loaded để tách bundle khỏi phần Dashboard quản trị.
const HomePage = lazy(() => import('@/pages/public/HomePage'));
const PropertyListPage = lazy(() => import('@/pages/public/PropertyListPage'));
const PropertyDetailPage = lazy(() => import('@/pages/public/PropertyDetailPage'));
const ContactPage = lazy(() => import('@/pages/public/ContactPage'));
const PaymentSuccessPage = lazy(() =>
  import('@/pages/public/PaymentResultPage').then((m) => ({ default: m.PaymentSuccessPage }))
);
const PaymentCancelPage = lazy(() =>
  import('@/pages/public/PaymentResultPage').then((m) => ({ default: m.PaymentCancelPage }))
);

/** Fallback cho 2 trang PayOS — chúng đứng ngoài PublicLayout nên không dùng chung
 *  Suspense boundary của layout đó. */
const PaymentFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-slate-50">
    <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900" />
  </div>
);

/** `/host/properties?x=1` → `/owner/properties?x=1`. `replace` để nút Quay lại không kẹt vòng. */
const LegacyHostRedirect = () => {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={`${pathname.replace(/^\/host/, '/owner')}${search}${hash}`} replace />;
};

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

        {/* ─── PayOS redirect (không dùng layout: user tới từ cổng thanh toán) ───
            Path phải khớp returnUrl/cancelUrl của BE và PAY_SUCCESS_URL/PAY_CANCEL_URL
            trong mobile-app/src/constants/api.ts — đổi ở đây là đứt luồng thanh toán. */}
        <Route
          path="/payment-success"
          element={
            <Suspense fallback={<PaymentFallback />}>
              <PaymentSuccessPage />
            </Suspense>
          }
        />
        <Route
          path="/payment-cancel"
          element={
            <Suspense fallback={<PaymentFallback />}>
              <PaymentCancelPage />
            </Suspense>
          }
        />

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
            <Route path="/admin/buildings" element={<NhaThueLanding />} />
            <Route path="/admin/properties/onboarding/:id" element={<PropertyOnboardingWizard />} />
            <Route path="/admin/buildings/draft" element={<TaoDraftPage />} />
            <Route path="/admin/buildings/configuration" element={<CauHinhKhaiThacPage />} />
            <Route path="/admin/buildings/configuration/:id" element={<CauHinhKhaiThacPage />} />
            {/* Đã gộp: "Nhập nhà hàng loạt" → Khởi tạo nhà; bỏ "Định giá & Phê duyệt" (auto gửi Owner ở Cấu hình khai thác) */}
            <Route path="/admin/buildings/import" element={<Navigate to="/admin/buildings/draft" replace />} />
            <Route path="/admin/buildings/pricing-approval" element={<Navigate to="/admin/buildings/configuration" replace />} />
            <Route path="/admin/buildings/pricing-approval/:id" element={<Navigate to="/admin/buildings/configuration" replace />} />
            <Route path="/admin/onboarding" element={<DraftOnboardingList />} />
            <Route path="/admin/billing" element={<BillingPaymentMonitoring />} />
            <Route path="/admin/contracts" element={<ContractMonitoring />} />
            <Route path="/admin/extension-requests" element={<ExtensionRequests />} />
            <Route path="/admin/refund-disputes" element={<RefundDisputes />} />
            <Route path="/admin/utility-disputes" element={<UtilityDisputes />} />
            <Route path="/admin/handover" element={<HandoverMonitoring />} />
            <Route path="/admin/meter-override" element={<MeterOverridePasscodes />} />
            {/* `key` riêng: hai route dùng chung một component, không có key thì chuyển từ
                điện sang nước React giữ nguyên state (nhà đang chọn, ảnh, số đã gõ) của trang kia. */}
            <Route path="/admin/evn-bills" element={<UtilityBillPublishPage key="ELECTRIC" kind="ELECTRIC" />} />
            <Route path="/admin/water-bills" element={<UtilityBillPublishPage key="WATER" kind="WATER" />} />
            <Route path="/admin/zones" element={<ZoneManagement />} />
            <Route path="/admin/zones/assignment" element={<AdminZoneOverview />} />
            <Route path="/admin/maintenance" element={<MaintenanceEquipmentMonitoring />} />
            {/* Cờ đỏ khách từ chối trả chi phí bảo trì (25/09/2026). */}
            <Route path="/admin/maintenance/refused" element={<RefusedPayments />} />
            {/* Gộp về trang Bảo trì (24/09/2026) — giữ đường cũ cho link/bookmark cũ. */}
            <Route path="/admin/maintenance/fault-review" element={<Navigate to="/admin/maintenance?bucket=tenant" replace />} />
            <Route path="/admin/equipments" element={<EquipmentCatalogPage />} />
            <Route path="/admin/notifications" element={<AdminNotificationCenter />} />
          </Route>
        </Route>

        {/* ─── Dashboard Owner (Admin System) — prefix /host ─── */}
        <Route element={<ProtectedRoute allowedRoles={['host', 'admin']} />}>
          <Route element={<HostLayout />}>
            <Route path="/owner/review/:id" element={<HostPropertyReview />} />
            <Route path="/owner" element={<Dashboard />} />
            <Route path="/owner/pricing-config" element={<PricingConfigPage />} />
            <Route path="/owner/manager-salaries" element={<ManagerSalaryPage />} />
            <Route path="/owner/properties" element={<PropertyList />} />
            <Route path="/owner/properties/:id" element={<PropertyDetail />} />
            <Route path="/owner/operations-managers" element={<ManagerList />} />
            <Route path="/owner/managers" element={<ManagerList />} />
            <Route path="/owner/zones" element={<HostZoneOverview />} />
            <Route path="/owner/tenants" element={<TenantList />} />
            <Route path="/owner/contracts" element={<ContractList />} />
            <Route path="/owner/extension-requests" element={<ExtensionRequestsHost />} />
            <Route path="/owner/maintenance" element={<MaintenanceList />} />
            <Route path="/owner/financial" element={<FinancialManagement />} />
            {/* Chỉ host (ROLE_OWNER) — admin sẽ bị điều hướng về /admin. Config lại sau nếu cần. */}
            <Route element={<ProtectedRoute allowedRoles={['host']} />}>
              <Route path="/owner/billing" element={<BillingPayments />} />
              <Route path="/owner/receivables" element={<ReceivablesAging />} />
              <Route path="/owner/deposits" element={<DepositLedger />} />
            </Route>
            <Route path="/owner/reports" element={<ReportsAnalytics />} />
            <Route path="/owner/notifications" element={<NotificationCenter />} />
            <Route
              path="/owner/settings"
              element={
                <div className="p-6">
                  <h1 className="text-2xl font-bold text-slate-900">Cài đặt</h1>
                  <p className="text-slate-500 mt-2">Cấu hình hệ thống - tính năng đang phát triển.</p>
                </div>
              }
            />
          </Route>
        </Route>

        {/*
          Link cũ `/host/...` → `/owner/...` (03/10/2026, đổi cách gọi vai trò).
          Giữ nguyên phần đuôi, query và hash: bookmark, link dán trong Zalo hay thông báo
          cũ vẫn mở đúng trang thay vì rơi về Landing Page.
        */}
        <Route path="/host/*" element={<LegacyHostRedirect />} />

        {/* Route không khớp -> về Landing Page */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
