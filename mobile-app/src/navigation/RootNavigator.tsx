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
          </Stack.Group>
        ) : (
          <Stack.Screen name="TenantTabs" component={TenantTabNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
