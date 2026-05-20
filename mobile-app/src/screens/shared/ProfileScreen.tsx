import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { useAuth } from '../../hooks';

const ROLE_CONFIG = {
  manager: { label: 'Quản lý vận hành', color: Colors.primary,   bg: Colors.primaryBg   },
  tenant:  { label: 'Khách thuê',        color: Colors.success,   bg: Colors.successLight },
};

const MOCK_MANAGER_STATS = { properties: 2, tenants: 10, activeContracts: 3 };
const MOCK_TENANT_STATS  = { room: 'P101', building: 'Nhà Nguyễn Trãi', contractEnd: '15/03/2027' };

// ── Row item ──────────────────────────────────────────────
const MenuItem: React.FC<{
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  toggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (v: boolean) => void;
}> = ({ icon, label, value, onPress, danger, toggle, toggleValue, onToggle }) => (
  <TouchableOpacity
    style={styles.menuItem}
    onPress={onPress}
    activeOpacity={toggle ? 1 : 0.6}
    disabled={toggle}
  >
    <View style={[styles.menuIconWrap, { backgroundColor: danger ? Colors.errorLight : Colors.background }]}>
      <Text style={styles.menuIcon}>{icon}</Text>
    </View>
    <Text style={[styles.menuLabel, danger && { color: Colors.error }]}>{label}</Text>
    {toggle ? (
      <Switch
        value={toggleValue}
        onValueChange={onToggle}
        trackColor={{ false: Colors.divider, true: Colors.primary + '60' }}
        thumbColor={toggleValue ? Colors.primary : Colors.textMuted}
      />
    ) : value ? (
      <Text style={styles.menuValue}>{value}</Text>
    ) : (
      <Text style={styles.menuChevron}>›</Text>
    )}
  </TouchableOpacity>
);

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <Text style={styles.sectionHeader}>{title}</Text>
);

// ── Main ──────────────────────────────────────────────────
export const ProfileScreen: React.FC = () => {
  const { user, logout } = useAuth();
  const [notifEnabled, setNotifEnabled] = useState(true);
  const roleCfg = ROLE_CONFIG[user?.role ?? 'tenant'];

  const handleChangePassword = () =>
    Alert.alert('Đổi mật khẩu', 'Chức năng đổi mật khẩu sẽ gửi OTP về số điện thoại đăng ký.');

  const handleHelp = () =>
    Alert.alert('Hỗ trợ', 'Liên hệ hỗ trợ qua email: support@urbannest.vn\nHotline: 1800 1234');

  const handleLogout = () =>
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: logout },
    ]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero card ── */}
        <View style={styles.heroCard}>
          <View style={styles.avatarWrap}>
            <Text style={styles.avatarText}>
              {user?.fullName?.charAt(0)?.toUpperCase() ?? '?'}
            </Text>
          </View>
          <Text style={styles.heroName}>{user?.fullName ?? 'Người dùng'}</Text>
          <View style={[styles.roleBadge, { backgroundColor: roleCfg.bg }]}>
            <Text style={[styles.roleBadgeText, { color: roleCfg.color }]}>{roleCfg.label}</Text>
          </View>
          <View style={styles.activeRow}>
            <View style={styles.activeDot} />
            <Text style={styles.activeText}>Đang hoạt động</Text>
          </View>
        </View>

        {/* ── Role-specific stats ── */}
        {user?.role === 'manager' && (
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{MOCK_MANAGER_STATS.properties}</Text>
              <Text style={styles.statLabel}>Bất động sản</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{MOCK_MANAGER_STATS.tenants}</Text>
              <Text style={styles.statLabel}>Khách thuê</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{MOCK_MANAGER_STATS.activeContracts}</Text>
              <Text style={styles.statLabel}>Hợp đồng</Text>
            </View>
          </View>
        )}

        {user?.role === 'tenant' && (
          <View style={styles.tenantInfoCard}>
            <View style={styles.tenantInfoRow}>
              <Text style={styles.tenantInfoIcon}>🏠</Text>
              <View>
                <Text style={styles.tenantInfoLabel}>Phòng đang thuê</Text>
                <Text style={styles.tenantInfoValue}>
                  {MOCK_TENANT_STATS.room} · {MOCK_TENANT_STATS.building}
                </Text>
              </View>
            </View>
            <View style={styles.tenantInfoDivider} />
            <View style={styles.tenantInfoRow}>
              <Text style={styles.tenantInfoIcon}>📋</Text>
              <View>
                <Text style={styles.tenantInfoLabel}>Hợp đồng hết hạn</Text>
                <Text style={styles.tenantInfoValue}>{MOCK_TENANT_STATS.contractEnd}</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Thông tin cá nhân ── */}
        <SectionHeader title="Thông tin cá nhân" />
        <View style={styles.card}>
          <MenuItem icon="📧" label="Email"      value={user?.email ?? '—'} />
          <View style={styles.itemDivider} />
          <MenuItem icon="📞" label="Điện thoại" value={user?.phone ?? '—'} />
          <View style={styles.itemDivider} />
          <MenuItem icon="🗓️" label="Tham gia"   value={user?.createdAt ?? '—'} />
        </View>

        {/* ── Cài đặt ── */}
        <SectionHeader title="Cài đặt" />
        <View style={styles.card}>
          <MenuItem
            icon="🔔" label="Thông báo"
            toggle toggleValue={notifEnabled} onToggle={setNotifEnabled}
          />
          <View style={styles.itemDivider} />
          <MenuItem icon="🔒" label="Đổi mật khẩu" onPress={handleChangePassword} />
        </View>

        {/* ── Hỗ trợ ── */}
        <SectionHeader title="Hỗ trợ" />
        <View style={styles.card}>
          <MenuItem icon="💬" label="Liên hệ hỗ trợ"   onPress={handleHelp} />
          <View style={styles.itemDivider} />
          <MenuItem icon="ℹ️" label="Về ứng dụng"       value="v1.0.0" />
        </View>

        {/* ── Đăng xuất ── */}
        <View style={styles.card}>
          <MenuItem icon="🚪" label="Đăng xuất" onPress={handleLogout} danger />
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },

  // Hero
  heroCard: {
    alignItems: 'center', backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl, padding: Spacing.xl,
    marginTop: Spacing.lg, marginBottom: Spacing.md, ...Shadow.sm,
  },
  avatarWrap: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
    ...Shadow.md,
  },
  avatarText: { fontSize: 36, fontWeight: '800', color: Colors.white },
  heroName: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.xs },
  roleBadge: {
    paddingHorizontal: Spacing.md, paddingVertical: 4,
    borderRadius: BorderRadius.full, marginBottom: Spacing.sm,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '700' },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  activeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  activeText: { fontSize: 12, color: Colors.textSecondary },

  // Manager stats
  statsRow: {
    flexDirection: 'row', backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.lg, marginBottom: Spacing.md, ...Shadow.sm,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '800', color: Colors.primary },
  statLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  statDivider: { width: 1, backgroundColor: Colors.divider },

  // Tenant info
  tenantInfoCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg, marginBottom: Spacing.md, ...Shadow.sm,
  },
  tenantInfoRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  tenantInfoIcon: { fontSize: 20 },
  tenantInfoLabel: { fontSize: 11, color: Colors.textSecondary },
  tenantInfoValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginTop: 2 },
  tenantInfoDivider: { height: 1, backgroundColor: Colors.divider },

  // Section header
  sectionHeader: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginBottom: Spacing.sm, marginTop: Spacing.md, marginLeft: 4,
  },

  // Card
  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    marginBottom: Spacing.sm, overflow: 'hidden', ...Shadow.sm,
  },
  itemDivider: { height: 1, backgroundColor: Colors.divider, marginLeft: 56 },

  // Menu item
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: 14, gap: Spacing.md,
  },
  menuIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  menuIcon: { fontSize: 18 },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  menuValue: { fontSize: 13, color: Colors.textSecondary },
  menuChevron: { fontSize: 20, color: Colors.textMuted, fontWeight: '400' },
});
