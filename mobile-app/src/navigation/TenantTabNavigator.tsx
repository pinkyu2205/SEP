import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet, Platform } from 'react-native';
import { TenantHomeScreen } from '../screens/tenant/TenantHomeScreen';
import { InvoiceListScreen } from '../screens/tenant/InvoiceListScreen';
import { ScanScreen } from '../screens/tenant/ScanScreen';
import { TenantContractScreen } from '../screens/tenant/TenantContractScreen';
import { MaintenanceListScreen } from '../screens/tenant/MaintenanceListScreen';
import { Colors } from '../constants';

const Tab = createBottomTabNavigator();

const TabIcon = ({ emoji, focused }: { emoji: string; focused: boolean }) => (
  <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.45 }}>{emoji}</Text>
);

const ScanButton = () => (
  <View style={styles.fabContainer}>
    <View style={styles.fab}>
      <Text style={{ fontSize: 26 }}>📷</Text>
    </View>
  </View>
);

export const TenantTabNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopColor: Colors.divider,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 2,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={TenantHomeScreen}
        options={{
          tabBarLabel: 'Trang chủ',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="InvoiceList"
        component={InvoiceListScreen}
        options={{
          tabBarLabel: 'Hóa đơn',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📄" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Scan"
        component={ScanScreen}
        options={{
          tabBarLabel: '',
          tabBarIcon: () => <ScanButton />,
        }}
      />
      <Tab.Screen
        name="MaintenanceList"
        component={MaintenanceListScreen}
        options={{
          tabBarLabel: 'Sửa chữa',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🔧" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="TenantContracts"
        component={TenantContractScreen}
        options={{
          tabBarLabel: 'Hợp đồng',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  fabContainer: {
    top: -22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 10,
    borderWidth: 4,
    borderColor: Colors.white,
  },
});
