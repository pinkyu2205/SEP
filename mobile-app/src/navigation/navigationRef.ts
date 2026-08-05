import { createNavigationContainerRef } from '@react-navigation/native';
import type { NotificationData } from '@/services/core/notifications';

/**
 * Ref điều hướng dùng CHUNG cho cả app.
 *
 * Cần ref global vì thông báo được xử lý ở ngoài cây màn hình: bấm push (RootNavigator),
 * bấm băng thông báo trong app (NotificationToast) — cả hai đều không có `useNavigation()`.
 */
export const navigationRef = createNavigationContainerRef<any>();

/** Route nằm trong tab của tenant → phải điều hướng lồng qua 'TenantTabs'. */
const TENANT_TAB_ROUTES = ['Home', 'InvoiceList', 'MaintenanceList', 'TenantContracts', 'Profile'];
/** Tương tự cho manager với 'ManagerTabs'. */
const MANAGER_TAB_ROUTES = [
  'ManagerHome', 'BuildingList', 'ManagerBilling', 'ManagerMaintenance', 'ManagerProfile',
];

/**
 * Vai của người đang đăng nhập — RootNavigator cập nhật mỗi lần đổi tài khoản.
 * Cần vì cùng một loại thông báo lại mở màn khác nhau cho manager và khách thuê.
 */
let currentRole: 'manager' | 'tenant' | null = null;
export function setNotificationRole(role?: string | null): void {
  currentRole = role === 'manager' ? 'manager' : role === 'tenant' ? 'tenant' : null;
}

/** Màn mặc định theo loại thông báo, cho từng vai. */
const fallbackScreen = (type?: string): string | undefined => {
  const t = (type || '').toUpperCase();
  const isManager = currentRole === 'manager';
  if (t.includes('CHECKOUT')) return isManager ? 'CheckoutRequests' : 'CheckoutDetail';
  if (['BILL', 'RENT', 'INVOICE', 'UTILITY', 'PAYMENT'].some(k => t.includes(k))) {
    return isManager ? 'RentInvoice' : 'InvoiceList';
  }
  if (t.includes('MAINTENANCE')) return isManager ? 'ManagerMaintenance' : 'MaintenanceList';
  if (t.includes('CONTRACT') || t.includes('ASSIGN') || t.includes('ONBOARD')) {
    return isManager ? 'ResumeContract' : 'TenantContracts';
  }
  return undefined;
};

/**
 * Route BE gửi có thể không hợp với vai đang đăng nhập (vd nhắc nợ cho manager lại
 * kèm screen 'InvoiceList' — route của khách thuê). Đổi về màn tương đương thay vì
 * điều hướng lung tung rồi báo lỗi route không tồn tại.
 */
const fixForRole = (screen: string): string => {
  if (currentRole === 'manager') {
    if (screen === 'InvoiceList') return 'RentInvoice';
    if (screen === 'CheckoutDetail') return 'CheckoutRequests';
    if (screen === 'MaintenanceList') return 'ManagerMaintenance';
  }
  if (currentRole === 'tenant') {
    if (screen === 'RentInvoice' || screen === 'ManagerBilling') return 'InvoiceList';
    if (screen === 'CheckoutRequests' || screen === 'CheckoutSettlement') return 'CheckoutDetail';
    if (screen === 'ManagerMaintenance') return 'MaintenanceList';
  }
  return screen;
};

/**
 * Mở màn theo payload `data` của thông báo (push của BE hoặc băng thông báo trong app).
 * Thiếu `screen` thì tự suy từ `type`. Route lạ / navigator chưa sẵn sàng thì bỏ qua
 * im lặng — không được làm crash app chỉ vì một thông báo.
 */
export function navigateFromNotification(data: NotificationData): void {
  if (!navigationRef.isReady()) return;
  const target = data?.screen ?? fallbackScreen(data?.type);
  if (!target) return;
  const screen = fixForRole(target);
  // Params của route khác vai thì bỏ đi cho an toàn (vd requestId ≠ checkoutId).
  const params = screen === data?.screen ? data?.params : undefined;

  const nav = navigationRef as any;
  try {
    if (TENANT_TAB_ROUTES.includes(screen)) {
      nav.navigate('TenantTabs', { screen, params });
    } else if (MANAGER_TAB_ROUTES.includes(screen)) {
      nav.navigate('ManagerTabs', { screen, params });
    } else {
      nav.navigate(screen, params);
    }
  } catch {
    // Route không tồn tại với vai hiện tại (vd thông báo cũ của tài khoản khác).
  }
}
