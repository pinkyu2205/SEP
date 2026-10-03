import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, StyleSheet, Platform } from 'react-native';
import { TenantHomeScreen } from '@/screens/tenant/TenantHomeScreen';
import { InvoiceListScreen } from '@/screens/tenant/InvoiceListScreen';
import { MaintenanceListScreen } from '@/screens/tenant/MaintenanceListScreen';
import { TenantContractScreen } from '@/screens/tenant/TenantContractScreen';
import { ProfileScreen } from '@/screens/shared/ProfileScreen';
import { Colors } from '@/constants';
import { Icon, IconName } from '@/components/common/Icon';
import { useTenantTabBadges } from '@/hooks/useTenantTabBadges';

const Tab = createBottomTabNavigator();

const TabIcon = ({ name, focused, badge }: { name: IconName; focused: boolean; badge?: number }) => (
  <View style={tabStyles.iconWrap}>
    <Icon
      name={name}
      size={22}
      color={focused ? Colors.primary : Colors.textMuted}
      strokeWidth={focused ? 2.1 : 1.8}
    />
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

export const TenantTabNavigator: React.FC = () => {
  // Số THẬT, không phải số cứng — xem `useTenantTabBadges` để biết đếm cái gì.
  const badges = useTenantTabBadges();

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
        name="Home"
        component={TenantHomeScreen}
        options={{
          tabBarLabel: 'Trang chủ',
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="InvoiceList"
        component={InvoiceListScreen}
        options={{
          tabBarLabel: 'Hóa đơn',
          tabBarIcon: ({ focused }) => <TabIcon name="receipt" focused={focused} badge={badges.invoices} />,
        }}
      />
      <Tab.Screen
        name="MaintenanceList"
        component={MaintenanceListScreen}
        options={{
          tabBarLabel: 'Sửa chữa',
          tabBarIcon: ({ focused }) => <TabIcon name="wrench" focused={focused} badge={badges.maintenance} />,
        }}
      />
      <Tab.Screen
        name="TenantContracts"
        component={TenantContractScreen}
        options={{
          tabBarLabel: 'Hợp đồng',
          tabBarIcon: ({ focused }) => <TabIcon name="contract" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Tài khoản',
          tabBarIcon: ({ focused }) => <TabIcon name="user" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
};
