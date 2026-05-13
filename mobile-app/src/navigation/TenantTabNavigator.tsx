import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet, Platform } from 'react-native';
import { TenantHomeScreen } from '../screens/tenant/TenantHomeScreen';
import { InvoiceListScreen } from '../screens/tenant/InvoiceListScreen';
import { ContractListScreen } from '../screens/shared/ContractListScreen';
import { ProfileScreen } from '../screens/shared/ProfileScreen';
import { ScanScreen } from '../screens/tenant/ScanScreen';
import { Colors } from '../constants';

const Tab = createBottomTabNavigator();

const TabIcon = ({ emoji, focused }: { emoji: string; focused: boolean }) => (
  <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
);

const ScanButton = () => (
  <View style={styles.fabContainer}>
    <View style={styles.fab}>
      <Text style={{ fontSize: 24 }}>📸</Text>
    </View>
  </View>
);

// Wrapper to filter only Manager↔Tenant contracts for tenant view
const TenantContractScreen = (props: any) => (
  <ContractListScreen {...props} filterType="manager_tenant" />
);

export const TenantTabNavigator: React.FC = () => {
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
          fontSize: 11,
          fontWeight: '600',
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
        name="TenantContracts"
        component={TenantContractScreen}
        options={{
          tabBarLabel: 'Hợp đồng',
          tabBarIcon: ({ focused }) => <TabIcon emoji="📋" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Tài khoản',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  fabContainer: {
    top: -20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
    borderWidth: 4,
    borderColor: Colors.white,
  },
});
