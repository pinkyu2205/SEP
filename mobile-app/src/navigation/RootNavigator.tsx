import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { TenantTabNavigator } from './TenantTabNavigator';
import { ManagerTabNavigator } from './ManagerTabNavigator';
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
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : user?.role === 'manager' || user?.role === 'admin' ? (
          <Stack.Screen name="ManagerTabs" component={ManagerTabNavigator} />
        ) : (
          <Stack.Screen name="TenantTabs" component={TenantTabNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
