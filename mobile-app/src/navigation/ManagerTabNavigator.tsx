import React, { memo, useEffect, useRef } from 'react';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import {
  Animated, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ManagerHomeScreen } from '@/screens/manager/ManagerHomeScreen';
import { BuildingListScreen } from '@/screens/manager/BuildingListScreen';
import { BillingManagementScreen } from '@/screens/manager/BillingManagementScreen';
import { MaintenanceManagerScreen } from '@/screens/manager/MaintenanceManagerScreen';
import { ProfileScreen } from '@/screens/shared/ProfileScreen';
import { Colors, BorderRadius, Shadow, Spacing } from '@/constants';

const Tab = createBottomTabNavigator();

const HOME_ROUTE = 'ManagerHome';

/**
 * ─── Badge đã BỎ 01/09/2026 ──────────────────────────────────────────────────
 * Ba tab từng mang số CỨNG (`badge: 6 / 7 / 4`) — không đếm gì, mọi quản lý đều thấy
 * đúng ba con số đó mãi mãi. Và chúng chỉ hiện khi `focused`, tức chỉ thấy sau khi đã
 * bấm vào tab: badge sinh ra để bảo người ta đi đâu, hiện lúc đã tới nơi thì vô nghĩa.
 *
 * Bỏ hẳn thay vì nối số thật: hai tab "Hoá đơn"/"Bảo trì" của quản lý gom việc của
 * NHIỀU nhà, "cần xử lý" là bao nhiêu thì phải chốt nghiệp vụ trước — số bịa còn tệ
 * hơn không có số. Cần thì dựng lại theo kiểu `useTenantTabBadges`.
 */
const TAB_META: Record<string, { label: string; icon: string; badge?: number }> = {
  ManagerHome: { label: 'Tổng quan', icon: '📊' },
  BuildingList: { label: 'Tòa nhà', icon: '🏢' },
  ManagerBilling: { label: 'Hóa đơn', icon: '🧾' },
  ManagerMaintenance: { label: 'Bảo trì', icon: '🔧' },
  ManagerProfile: { label: 'Tài khoản', icon: '👤' },
};

// New Architecture (newArchEnabled: true) đã bật LayoutAnimation sẵn — không cần
// gọi UIManager.setLayoutAnimationEnabledExperimental (nó là no-op và gây warning).

/**
 * Thanh tab LUÔN hiện đủ 5 mục (24/09/2026).
 *
 * Bản trước ẩn cả thanh khi đứng ở Tòa nhà / Hóa đơn / Bảo trì (và thu còn 3 mục khi
 * quay về) — người dùng bấm một tab là mất luôn đường sang tab khác, phải bấm "‹" về
 * Tổng quan rồi mới đi tiếp. Thanh tab là lối đi chính của app, không được biến mất.
 */
const ManagerTabBar = memo(({ state, descriptors, navigation }: BottomTabBarProps) => {
  const insets = useSafeAreaInsets();
  const visibleRoutes = state.routes;

  return (
    <View style={[styles.barSafeArea, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.bar}>
        {visibleRoutes.map(route => {
          const routeIndex = state.routes.findIndex(item => item.key === route.key);
          const focused = state.index === routeIndex;
          const meta = TAB_META[route.name];
          const { options } = descriptors[route.key];

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <AnimatedTabItem
              key={route.key}
              label={meta.label}
              icon={meta.icon}
              focused={focused}
              badge={focused ? meta.badge : undefined}
              onPress={onPress}
              onLongPress={onLongPress}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarButtonTestID}
            />
          );
        })}
      </View>
    </View>
  );
});

const AnimatedTabItem = memo(({
  label,
  icon,
  focused,
  badge,
  onPress,
  onLongPress,
  accessibilityLabel,
  testID,
}: {
  label: string;
  icon: string;
  focused: boolean;
  badge?: number;
  onPress: () => void;
  onLongPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) => {
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(progress, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 120,
    }).start();
  }, [focused, progress]);

  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.04],
  });

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, -1],
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.itemPressable}
    >
      <Animated.View
        style={[
          styles.item,
          focused && styles.itemActive,
          { transform: [{ scale }, { translateY }] },
        ]}
      >
        <View style={styles.iconWrap}>
          <Text style={[styles.icon, focused ? styles.iconActive : styles.iconInactive]}>{icon}</Text>
          {badge && badge > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

export const ManagerTabNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      initialRouteName={HOME_ROUTE}
      backBehavior="history"
      detachInactiveScreens={false}
      tabBar={props => <ManagerTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        lazy: true,
      }}
    >
      <Tab.Screen name="ManagerHome" component={ManagerHomeScreen} />
      <Tab.Screen name="BuildingList" component={BuildingListScreen} />
      <Tab.Screen name="ManagerBilling" component={BillingManagementScreen} />
      <Tab.Screen name="ManagerMaintenance" component={MaintenanceManagerScreen} />
      <Tab.Screen name="ManagerProfile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  barSafeArea: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
  },
  bar: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: Colors.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 4,
    paddingVertical: Spacing.sm,
    ...Shadow.md,
  },
  itemPressable: {
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  item: {
    minHeight: 46,
    marginHorizontal: 1,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    // 5 mục trên màn hẹp: đệm ngang lớn làm "Tổng quan" bị cắt thành "Tổng qu…".
    paddingHorizontal: 2,
    paddingVertical: 5,
  },
  itemActive: {
    backgroundColor: Colors.primaryBg,
  },
  iconWrap: {
    position: 'relative',
    minWidth: 26,
    alignItems: 'center',
  },
  icon: {
    fontSize: 20,
  },
  iconActive: {
    opacity: 1,
  },
  iconInactive: {
    opacity: 0.48,
  },
  label: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    color: Colors.textMuted,
    textAlign: 'center',
  },
  labelActive: {
    color: Colors.primary,
  },
  badge: {
    position: 'absolute',
    top: -7,
    right: -11,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: Colors.white,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: Colors.white,
  },
});
