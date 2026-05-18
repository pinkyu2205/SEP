import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { ChangePasswordScreen } from '../screens/auth/ChangePasswordScreen';
import { ForgotPasswordScreen } from '../screens/auth/ForgotPasswordScreen';
import { TutorialScreen } from '../screens/auth/TutorialScreen';
import { TenantTabNavigator } from './TenantTabNavigator';
import { ManagerTabNavigator } from './ManagerTabNavigator';
import { AdminTabNavigator } from './AdminTabNavigator';
import { OnboardingScreen } from '../screens/manager/OnboardingScreen';
import { AdminOnboardingScreen } from '../screens/admin/AdminOnboardingScreen';
import { RoomManageScreen } from '../screens/manager/RoomManageScreen';
import { NotificationCenterScreen } from '../screens/manager/NotificationCenterScreen';
import { TenantListScreen } from '../screens/manager/TenantListScreen';
import { EquipmentScreen } from '../screens/manager/EquipmentScreen';
import { ContractListScreen } from '../screens/shared/ContractListScreen';

// Tenant-specific screens
import { ProfileScreen } from '../screens/shared/ProfileScreen';
import { ContractDetailScreen } from '../screens/tenant/ContractDetailScreen';
import { MaintenanceCreateScreen } from '../screens/tenant/MaintenanceCreateScreen';
import { MaintenanceDetailScreen } from '../screens/tenant/MaintenanceDetailScreen';
import { PaymentHistoryScreen } from '../screens/tenant/PaymentHistoryScreen';
import { TenantOnboardingScreen } from '../screens/tenant/TenantOnboardingScreen';
import { TenantNotificationScreen } from '../screens/tenant/TenantNotificationScreen';
import { ScanScreen } from '../screens/tenant/ScanScreen';

import { useAuth } from '../hooks';
import { Colors } from '../constants';

const Stack = createNativeStackNavigator();

export const RootNavigator: React.FC = () => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Group>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          </Stack.Group>
        ) : user?.isFirstLogin ? (
          <Stack.Group>
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
            <Stack.Screen name="Tutorial" component={TutorialScreen} />
          </Stack.Group>
        ) : user?.role === 'admin' ? (
          <Stack.Group>
            <Stack.Screen name="AdminTabs" component={AdminTabNavigator} />
            <Stack.Screen name="AdminOnboarding" component={AdminOnboardingScreen} />
          </Stack.Group>
        ) : user?.role === 'manager' ? (
          <Stack.Group>
            <Stack.Screen name="ManagerTabs" component={ManagerTabNavigator} />
            <Stack.Screen name="Onboarding" component={OnboardingScreen} />
            <Stack.Screen name="RoomManage" component={RoomManageScreen} />
            <Stack.Screen name="NotificationCenter" component={NotificationCenterScreen} />
            <Stack.Screen name="TenantList" component={TenantListScreen} />
            <Stack.Screen name="Equipment" component={EquipmentScreen} />
            <Stack.Screen name="ManagerContracts" component={ContractListScreen} />
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
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
