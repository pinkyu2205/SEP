import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, Platform, View, StyleSheet } from 'react-native';
import { ManagerHomeScreen } from '../screens/manager/ManagerHomeScreen';
import { MeterReadingScreen } from '../screens/manager/MeterReadingScreen';
import { TenantListScreen } from '../screens/manager/TenantListScreen';
import { EquipmentScreen } from '../screens/manager/EquipmentScreen';
import { ContractListScreen } from '../screens/shared/ContractListScreen';
import { ProfileScreen } from '../screens/shared/ProfileScreen';
import { BillingManagementScreen } from '../screens/manager/BillingManagementScreen';
import { MaintenanceManagerScreen } from '../screens/manager/MaintenanceManagerScreen';
import { Colors } from '../constants';

const Tab = createBottomTabNavigator();

const TabIcon = ({ emoji, focused, badge }: { emoji: string; focused: boolean; badge?: number }) => (
  <View style={tabStyles.iconWrap}>
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
    {badge && badge > 0 ? (
      <View style={tabStyles.badge}>
        <Text style={tabStyles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
      </View>
    ) : null}
  </View>
);

const tabStyles = StyleSheet.create({
  iconWrap: { position: 'relative' },
  badge: {
    position: 'absolute', top: -6, right: -10, minWidth: 16, height: 16,
    borderRadius: 8, backgroundColor: Colors.error,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  badgeText: { fontSize: 9, fontWeight: '800', color: Colors.white },
});

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
          height: Platform.OS === 'ios' ? 80 : 62,
          paddingBottom: Platform.OS === 'ios' ? 20 : 8,
          paddingTop: 4,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="ManagerHome"
        component={ManagerHomeScreen}
        options={{
          tabBarLabel: 'Tổng quan',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📊" focused={focused} badge={6} />,
        }}
      />
      <Tab.Screen
        name="ManagerBilling"
        component={BillingManagementScreen}
        options={{
          tabBarLabel: 'Hóa đơn',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🧾" focused={focused} badge={7} />,
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
        name="ManagerMaintenance"
        component={MaintenanceManagerScreen}
        options={{
          tabBarLabel: 'Bảo trì',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🔧" focused={focused} badge={4} />,
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
