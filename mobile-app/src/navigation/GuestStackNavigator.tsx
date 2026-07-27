import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GuestHomeScreen } from '@/screens/guest/GuestHomeScreen';
import { SearchScreen } from '@/screens/guest/SearchScreen';
import { SearchResultScreen } from '@/screens/guest/SearchResultScreen';
import { PropertyDetailScreen } from '@/screens/guest/PropertyDetailScreen';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { ForgotPasswordScreen } from '@/screens/auth/ForgotPasswordScreen';
import { TenantActivateScreen } from '@/screens/auth/TenantActivateScreen';
import { SearchFilters } from '@/types';

export type GuestStackParamList = {
  GuestHome: undefined;
  Search: { cityId?: string; wardId?: string; priceMin?: number; priceMax?: number } | undefined;
  SearchResult: { filters: SearchFilters };
  PropertyDetail: { propertyId: string };
  Login: { phone?: string } | undefined;
  ForgotPassword: undefined;
  TenantActivate: { phone?: string } | undefined;
};

const Stack = createNativeStackNavigator<GuestStackParamList>();

export const GuestStackNavigator: React.FC = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="GuestHome" component={GuestHomeScreen} />
    <Stack.Screen name="Search" component={SearchScreen} options={{ animation: 'slide_from_right' }} />
    <Stack.Screen name="SearchResult" component={SearchResultScreen} options={{ animation: 'slide_from_right' }} />
    <Stack.Screen name="PropertyDetail" component={PropertyDetailScreen} options={{ animation: 'slide_from_right' }} />
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    <Stack.Screen name="TenantActivate" component={TenantActivateScreen} />
  </Stack.Navigator>
);
