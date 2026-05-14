import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, Platform } from 'react-native';
import { ManagerHomeScreen } from '../screens/manager/ManagerHomeScreen';
import { MeterReadingScreen } from '../screens/manager/MeterReadingScreen';
import { TenantListScreen } from '../screens/manager/TenantListScreen';
import { EquipmentScreen } from '../screens/manager/EquipmentScreen';
import { ContractListScreen } from '../screens/shared/ContractListScreen';
import { ProfileScreen } from '../screens/shared/ProfileScreen';
import { Colors } from '../constants';

const Tab = createBottomTabNavigator();

const TabIcon = ({ emoji, focused }: { emoji: string; focused: boolean }) => (
  <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
);

// Manager sees BOTH admin_manager (their own lease) and manager_tenant (their tenants)
const ManagerContractScreen = (props: any) => (
  <ContractListScreen {...props} filterRole="manager" />
);

export const ManagerTabNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopColor: Colors.divider,
          height: Platform.OS === 'ios' ? 80 : 60,
          paddingBottom: Platform.OS === 'ios' ? 20 : 8,
          paddingTop: 4,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="ManagerHome"
        component={ManagerHomeScreen}
        options={{
          tabBarLabel: 'Tổng quan',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="MeterReading"
        component={MeterReadingScreen}
        options={{
          tabBarLabel: 'Chốt số',
          tabBarIcon: ({ focused }) => <TabIcon emoji="⚡" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="TenantList"
        component={TenantListScreen}
        options={{
          tabBarLabel: 'Khách thuê',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👥" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Equipment"
        component={EquipmentScreen}
        options={{
          tabBarLabel: 'Thiết bị',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📦" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="ManagerContracts"
        component={ManagerContractScreen}
        options={{
          tabBarLabel: 'Hợp đồng',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="ManagerProfile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Tài khoản',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
};
