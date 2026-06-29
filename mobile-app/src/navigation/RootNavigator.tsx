import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GuestStackNavigator } from './GuestStackNavigator';
import { ChangePasswordScreen } from '../screens/auth/ChangePasswordScreen';
import { TutorialScreen } from '../screens/auth/TutorialScreen';
import { TenantTabNavigator } from './TenantTabNavigator';
import { ManagerTabNavigator } from './ManagerTabNavigator';
import { OnboardingScreen } from '../screens/manager/OnboardingScreen';
import { OnboardingSuccessScreen } from '../screens/manager/OnboardingSuccessScreen';
import { MeterReadingScreen } from '../screens/manager/MeterReadingScreen';
import { UtilityBillingScreen } from '../screens/manager/UtilityBillingScreen';
import { RentInvoiceScreen } from '../screens/manager/RentInvoiceScreen';
import { RoomManageScreen } from '../screens/manager/RoomManageScreen';
import { BuildingDetailScreen } from '../screens/manager/BuildingDetailScreen';
import { BuildingInvoiceScreen } from '../screens/manager/BuildingInvoiceScreen';
import { BuildingUtilityScreen } from '../screens/manager/BuildingUtilityScreen';
import { BuildingMaintenanceScreen } from '../screens/manager/BuildingMaintenanceScreen';
import { BuildingRoomScreen } from '../screens/manager/BuildingRoomScreen';
import { BuildingContractScreen } from '../screens/manager/BuildingContractScreen';
import { BuildingTenantScreen } from '../screens/manager/BuildingTenantScreen';
import { NotificationCenterScreen } from '../screens/manager/NotificationCenterScreen';
import { TenantListScreen } from '../screens/manager/TenantListScreen';
import { EquipmentScreen } from '../screens/manager/EquipmentScreen';
import { ContractListScreen } from '../screens/shared/ContractListScreen';
import { BuildingBillingScreen } from '../screens/manager/BuildingBillingScreen';
import { BillingHistoryScreen } from '../screens/manager/BillingHistoryScreen';
import { TicketDetailScreen } from '../screens/manager/TicketDetailScreen';
import { WholeHouseDetailScreen } from '../screens/manager/WholeHouseDetailScreen';
import { TenantInvoicesScreen } from '../screens/manager/TenantInvoicesScreen';
import { TenantContractDetailScreen } from '../screens/manager/TenantContractDetailScreen';
import { TenantMaintenanceScreen } from '../screens/manager/TenantMaintenanceScreen';
import { InspectionDetailScreen } from '../screens/manager/InspectionDetailScreen';
import { ResumeContractScreen } from '../screens/manager/ResumeContractScreen';

// Tenant-specific screens
import { ProfileScreen } from '../screens/shared/ProfileScreen';
import { ContractDetailScreen } from '../screens/tenant/ContractDetailScreen';
import { MaintenanceCreateScreen } from '../screens/tenant/MaintenanceCreateScreen';
import { MaintenanceDetailScreen } from '../screens/tenant/MaintenanceDetailScreen';
import { PaymentHistoryScreen } from '../screens/tenant/PaymentHistoryScreen';
import { TenantOnboardingScreen } from '../screens/tenant/TenantOnboardingScreen';
import { TenantNotificationScreen } from '../screens/tenant/TenantNotificationScreen';
import { ScanScreen } from '../screens/tenant/ScanScreen';
import { InvoiceHistoryScreen } from '../screens/tenant/InvoiceHistoryScreen';
import { MaintenanceHistoryScreen } from '../screens/tenant/MaintenanceHistoryScreen';
import { InvoiceDetailScreen } from '../screens/tenant/InvoiceDetailScreen';
import { PaymentHistoryDetailScreen } from '../screens/tenant/PaymentHistoryDetailScreen';
import { RoomEquipmentScreen } from '../screens/tenant/RoomEquipmentScreen';
import { EquipmentDetailScreen } from '../screens/tenant/EquipmentDetailScreen';
import { RequestCheckoutScreen } from '../screens/tenant/RequestCheckoutScreen';
import { CheckoutDetailScreen } from '../screens/tenant/CheckoutDetailScreen';

import { useAuth } from '../hooks';
import { Colors } from '../constants';
import {
  addNotificationResponseListener,
  handleInitialNotification,
  NotificationData,
} from '../services/notifications';

// Các route nằm trong tab Tenant (cần điều hướng lồng qua 'TenantTabs')
const TENANT_TAB_ROUTES = ['Home', 'InvoiceList', 'MaintenanceList', 'TenantContracts', 'Profile'];

const Stack = createNativeStackNavigator();

const baseStackOptions = {
  headerShown: false,
  gestureEnabled: true,
  fullScreenGestureEnabled: true,
  animation: 'slide_from_right' as const,
};

export const RootNavigator: React.FC = () => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const navRef = useNavigationContainerRef();

  // Điều hướng khi người dùng bấm vào thông báo đẩy (dựa trên payload `data` từ BE)
  useEffect(() => {
    const routeFromData = (data: NotificationData) => {
      if (!data?.screen || !navRef.isReady()) return;
      const nav = navRef as any;
      if (TENANT_TAB_ROUTES.includes(data.screen)) {
        nav.navigate('TenantTabs', { screen: data.screen, params: data.params });
      } else {
        nav.navigate(data.screen, data.params);
      }
    };
    const unsub = addNotificationResponseListener(routeFromData);
    handleInitialNotification(routeFromData); // app mở từ trạng thái tắt hẳn
    return unsub;
  }, [navRef]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navRef}>
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
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="OnboardingSuccess" component={OnboardingSuccessScreen} options={{ gestureEnabled: false }} />
            <Stack.Screen name="MeterReading" component={MeterReadingScreen} />
            <Stack.Screen name="UtilityBilling" component={UtilityBillingScreen} />
            <Stack.Screen name="RentInvoice" component={RentInvoiceScreen} />
            <Stack.Screen name="RoomManage" component={RoomManageScreen} />
            <Stack.Screen
              name="BuildingDetail"
              component={BuildingDetailScreen}
            />
            <Stack.Screen name="WholeHouseDetail" component={WholeHouseDetailScreen} />
            <Stack.Screen name="BuildingInvoice" component={BuildingInvoiceScreen} />
            <Stack.Screen name="BuildingUtility" component={BuildingUtilityScreen} />
            <Stack.Screen name="BuildingMaintenance" component={BuildingMaintenanceScreen} />
            <Stack.Screen name="BuildingRoom" component={BuildingRoomScreen} />
            <Stack.Screen name="BuildingContract" component={BuildingContractScreen} />
            <Stack.Screen name="BuildingTenant" component={BuildingTenantScreen} />
            <Stack.Screen name="NotificationCenter" component={NotificationCenterScreen} />
            <Stack.Screen name="TenantList" component={TenantListScreen} />
            <Stack.Screen name="Equipment" component={EquipmentScreen} />
            <Stack.Screen name="ManagerContracts" component={ContractListScreen} />
            <Stack.Screen name="BuildingBilling" component={BuildingBillingScreen} />
            <Stack.Screen name="BillingHistory" component={BillingHistoryScreen} />
            <Stack.Screen name="MaintenanceTicketDetail" component={TicketDetailScreen} />
            {/* Tenant-scoped screens — opened from Tenant Detail modal */}
            <Stack.Screen name="TenantInvoices" component={TenantInvoicesScreen} />
            <Stack.Screen name="TenantContractDetail" component={TenantContractDetailScreen} />
            <Stack.Screen name="TenantMaintenance" component={TenantMaintenanceScreen} />
            <Stack.Screen name="InspectionDetail" component={InspectionDetailScreen} />
            <Stack.Screen name="ResumeContract" component={ResumeContractScreen} />
          </Stack.Group>
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
              name="TenantOnboarding"
              component={TenantOnboardingScreen}
              options={{ animation: 'slide_from_bottom' }}
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
            <Stack.Screen
              name="InvoiceHistory"
              component={InvoiceHistoryScreen}
              options={{ animation: 'slide_from_right' }}
            />
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
