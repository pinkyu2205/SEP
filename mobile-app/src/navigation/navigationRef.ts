import { createNavigationContainerRef } from '@react-navigation/native';
import type { NotificationData } from '@/services/core/notifications';

/**
 * Ref điều hướng dùng CHUNG cho cả app.
 *
 * Cần ref global vì thông báo được xử lý ở ngoài cây màn hình: bấm push (RootNavigator),
 * bấm toast trong app (NotificationToast) — cả hai đều không có `useNavigation()`.
 */
export const navigationRef = createNavigationContainerRef<any>();

/** Route nằm trong tab của tenant → phải điều hướng lồng qua 'TenantTabs'. */
const TENANT_TAB_ROUTES = ['Home', 'InvoiceList', 'MaintenanceList', 'TenantContracts', 'Profile'];
/** Tương tự cho manager với 'ManagerTabs'. */
const MANAGER_TAB_ROUTES = [
  'ManagerHome', 'BuildingList', 'ManagerBilling', 'ManagerMaintenance', 'ManagerProfile',
];

/**
 * Mở màn theo payload `data` của thông báo (push của BE hoặc thông báo app tự sinh).
 * Route lạ / navigator chưa sẵn sàng thì bỏ qua im lặng — không được làm crash app
 * chỉ vì một thông báo.
 */
export function navigateFromNotification(data: NotificationData): void {
  if (!data?.screen || !navigationRef.isReady()) return;
  const nav = navigationRef as any;
  try {
    if (TENANT_TAB_ROUTES.includes(data.screen)) {
      nav.navigate('TenantTabs', { screen: data.screen, params: data.params });
    } else if (MANAGER_TAB_ROUTES.includes(data.screen)) {
      nav.navigate('ManagerTabs', { screen: data.screen, params: data.params });
    } else {
      nav.navigate(data.screen, data.params);
    }
  } catch {
    // Route không tồn tại với role hiện tại (vd thông báo cũ của tài khoản khác).
  }
}
