import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GuestStackNavigator } from './GuestStackNavigator';
import { ChangePasswordScreen } from '@/screens/auth/ChangePasswordScreen';
import { TutorialScreen } from '@/screens/auth/TutorialScreen';
import { TenantTabNavigator } from './TenantTabNavigator';
import { ManagerTabNavigator } from './ManagerTabNavigator';
import { OnboardingSuccessScreen } from '@/screens/manager/OnboardingSuccessScreen';
import { UtilityBillingScreen } from '@/screens/manager/UtilityBillingScreen';
import { MeterReadingPendingScreen } from '@/screens/manager/MeterReadingPendingScreen';
import { RentInvoiceScreen } from '@/screens/manager/RentInvoiceScreen';
import { RoomManageScreen } from '@/screens/manager/RoomManageScreen';
import { BuildingDetailScreen } from '@/screens/manager/BuildingDetailScreen';
import { BuildingMaintenanceScreen } from '@/screens/manager/BuildingMaintenanceScreen';
import { BuildingContractScreen } from '@/screens/manager/BuildingContractScreen';
import { NotificationCenterScreen } from '@/screens/manager/NotificationCenterScreen';
import { TenantListScreen } from '@/screens/manager/TenantListScreen';
import { EquipmentScreen } from '@/screens/manager/EquipmentScreen';
import { ContractListScreen } from '@/screens/shared/ContractListScreen';
import { BuildingBillingScreen } from '@/screens/manager/BuildingBillingScreen';
import { BillingHistoryScreen } from '@/screens/manager/BillingHistoryScreen';
import { ManagerPaymentHistoryScreen } from '@/screens/manager/PaymentHistoryScreen';
import { TicketDetailScreen } from '@/screens/manager/TicketDetailScreen';
import { WholeHouseDetailScreen } from '@/screens/manager/WholeHouseDetailScreen';
import { TenantInvoicesScreen } from '@/screens/manager/TenantInvoicesScreen';
import { TenantContractDetailScreen } from '@/screens/manager/TenantContractDetailScreen';
import { TenantMaintenanceScreen } from '@/screens/manager/TenantMaintenanceScreen';
import { CheckoutInspectionScreen } from '@/screens/manager/CheckoutInspectionScreen';
import { CheckoutSettlementScreen } from '@/screens/manager/CheckoutSettlementScreen';
import { ResumeContractScreen } from '@/screens/manager/ResumeContractScreen';
import { CheckoutRequestsScreen } from '@/screens/manager/CheckoutRequestsScreen';

// Tenant-specific screens
import { ProfileScreen } from '@/screens/shared/ProfileScreen';
import { ContractDetailScreen } from '@/screens/tenant/ContractDetailScreen';
import { ContractConfirmScreen } from '@/screens/tenant/ContractConfirmScreen';
import { MaintenanceCreateScreen } from '@/screens/tenant/MaintenanceCreateScreen';
import { MaintenanceDetailScreen } from '@/screens/tenant/MaintenanceDetailScreen';
import { PaymentHistoryScreen } from '@/screens/tenant/PaymentHistoryScreen';
import { TenantNotificationScreen } from '@/screens/tenant/TenantNotificationScreen';
import { ScanScreen } from '@/screens/tenant/ScanScreen';
import { MaintenanceHistoryScreen } from '@/screens/tenant/MaintenanceHistoryScreen';
import { InvoiceDetailScreen } from '@/screens/tenant/InvoiceDetailScreen';
import { PaymentHistoryDetailScreen } from '@/screens/tenant/PaymentHistoryDetailScreen';
import { RoomEquipmentScreen } from '@/screens/tenant/RoomEquipmentScreen';
import { EquipmentDetailScreen } from '@/screens/tenant/EquipmentDetailScreen';
import { RequestCheckoutScreen } from '@/screens/tenant/RequestCheckoutScreen';
import { CheckoutDetailScreen } from '@/screens/tenant/CheckoutDetailScreen';

import { useAuth } from '@/hooks';
import { Colors } from '@/constants';
import {
  addNotificationResponseListener,
  handleInitialNotification,
} from '@/services/core/notifications';
import { navigationRef, navigateFromNotification, setNotificationRole } from './navigationRef';

const Stack = createNativeStackNavigator();

const baseStackOptions = {
  headerShown: false,
  gestureEnabled: true,
  fullScreenGestureEnabled: true,
  animation: 'slide_from_right' as const,
};

export const RootNavigator: React.FC = () => {
  const { isAuthenticated, isLoading, user, pendingConfirmContractId } = useAuth();

  // Vai hiện tại quyết định thông báo mở màn nào (manager và khách xem màn khác nhau).
  useEffect(() => { setNotificationRole(user?.role); }, [user?.role]);

  // Điều hướng khi người dùng bấm vào thông báo đẩy của BE (payload `data`).
  useEffect(() => {
    const unsub = addNotificationResponseListener(navigateFromNotification);
    handleInitialNotification(navigateFromNotification); // app mở từ trạng thái tắt hẳn
    return unsub;
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={baseStackOptions}>
        {!isAuthenticated ? (
          <Stack.Screen name="GuestStack" component={GuestStackNavigator} />
        ) : user?.isFirstLogin ? (
          <Stack.Group>
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
            <Stack.Screen name="Tutorial" component={TutorialScreen} />
          </Stack.Group>
        ) : user?.role === 'manager' ? (
          <Stack.Group screenOptions={baseStackOptions}>
            <Stack.Screen name="ManagerTabs" component={ManagerTabNavigator} options={{ animation: 'fade' }} />
            {/* "OnboardingV2" đã gỡ khỏi navigator (13/08/2026): luồng đón khách gom hết
                về ResumeContract. File màn cũ còn trong repo nhưng KHÔNG đăng ký route —
                thêm lại là có hai luồng đón khách song song, đúng thứ đã gây lệch dữ liệu. */}
            <Stack.Screen name="OnboardingSuccess" component={OnboardingSuccessScreen} options={{ gestureEnabled: false }} />
            <Stack.Screen name="UtilityBilling" component={UtilityBillingScreen} />
            <Stack.Screen name="MeterReadingPending" component={MeterReadingPendingScreen} />
            <Stack.Screen name="RentInvoice" component={RentInvoiceScreen} />
            <Stack.Screen name="RoomManage" component={RoomManageScreen} />
            <Stack.Screen
              name="BuildingDetail"
              component={BuildingDetailScreen}
            />
            <Stack.Screen name="WholeHouseDetail" component={WholeHouseDetailScreen} />
            <Stack.Screen name="BuildingMaintenance" component={BuildingMaintenanceScreen} />
            <Stack.Screen name="BuildingContract" component={BuildingContractScreen} />
            <Stack.Screen name="NotificationCenter" component={NotificationCenterScreen} />
            <Stack.Screen name="TenantList" component={TenantListScreen} />
            <Stack.Screen name="Equipment" component={EquipmentScreen} />
            <Stack.Screen name="ManagerContracts" component={ContractListScreen} />
            <Stack.Screen name="BuildingBilling" component={BuildingBillingScreen} />
            <Stack.Screen name="BillingHistory" component={BillingHistoryScreen} />
            <Stack.Screen name="ManagerPaymentHistory" component={ManagerPaymentHistoryScreen} />
            <Stack.Screen name="MaintenanceTicketDetail" component={TicketDetailScreen} />
            {/* Tenant-scoped screens — opened from Tenant Detail modal */}
            <Stack.Screen name="TenantInvoices" component={TenantInvoicesScreen} />
            <Stack.Screen name="TenantContractDetail" component={TenantContractDetailScreen} />
            <Stack.Screen name="TenantMaintenance" component={TenantMaintenanceScreen} />
            <Stack.Screen name="ResumeContract" component={ResumeContractScreen} />
            <Stack.Screen name="CheckoutRequests" component={CheckoutRequestsScreen} />
            <Stack.Screen name="CheckoutInspection" component={CheckoutInspectionScreen} />
            <Stack.Screen name="CheckoutSettlement" component={CheckoutSettlementScreen} />
          </Stack.Group>
        ) : pendingConfirmContractId != null ? (
          /*
            CỔNG CHẶN (27/08/2026): khách đã trả tiền, tài khoản đã được tạo, nhưng hợp
            đồng chưa được xác nhận bằng OTP thì chưa vào app được. Nhánh này render
            ĐÚNG MỘT màn — không đăng ký TenantTabs — nên không có đường vòng nào lách
            qua, kể cả deep link.

            Không nhốt được người dùng: `pendingConfirmContractId` chỉ bật khi hợp đồng
            còn PENDING; xác nhận xong hoặc lỗi mạng đều cho ra (xem
            `refreshPendingConfirm` trong useAuth — lỗi thì trả null). Vẫn đăng xuất
            được từ trong màn nếu cần gọi hỗ trợ.
          */
          <Stack.Screen
            name="ContractConfirm"
            component={ContractConfirmScreen}
            initialParams={{ contractId: pendingConfirmContractId }}
            options={{ gestureEnabled: false }}
          />
        ) : (
          // Tenant stack — tabs + all detail screens
          <Stack.Group>
            <Stack.Screen name="TenantTabs" component={TenantTabNavigator} />
            <Stack.Screen
              name="ContractDetail"
              component={ContractDetailScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="MaintenanceCreate"
              component={MaintenanceCreateScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="MaintenanceDetail"
              component={MaintenanceDetailScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="PaymentHistory"
              component={PaymentHistoryScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="TenantNotifications"
              component={TenantNotificationScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="Scan"
              component={ScanScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="Profile"
              component={ProfileScreen}
              options={{ animation: 'slide_from_right' }}
            />
            {/* Route "InvoiceHistory" ĐÃ BỎ 13/08/2026 — nó mở một màn lịch sử riêng
                trùng nội dung với "PaymentHistory" (màn kia là tập cha: có đủ mọi loại
                khoản, gom theo tháng, lọc được cả tiền cọc). Nay nút "Lịch sử" trong màn
                Hoá đơn và ô "Lịch sử TT" ngoài Thao tác nhanh cùng trỏ về PaymentHistory. */}
            <Stack.Screen
              name="MaintenanceHistory"
              component={MaintenanceHistoryScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="InvoiceDetail"
              component={InvoiceDetailScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="PaymentHistoryDetail"
              component={PaymentHistoryDetailScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="RoomEquipment"
              component={RoomEquipmentScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="EquipmentDetail"
              component={EquipmentDetailScreen}
              options={{ animation: 'slide_from_right' }}
            />
            <Stack.Screen
              name="RequestCheckout"
              component={RequestCheckoutScreen}
              options={{ animation: 'slide_from_bottom' }}
            />
            <Stack.Screen
              name="CheckoutDetail"
              component={CheckoutDetailScreen}
              options={{ animation: 'slide_from_right' }}
            />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
