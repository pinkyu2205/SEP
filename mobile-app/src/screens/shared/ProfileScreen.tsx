import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Switch,
  Modal, TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { useAuth } from '../../hooks';
import { realTenantSelfService, TenantDashboard } from '../../services/tenantSelfService.real';

const ROLE_CONFIG = {
  manager: { label: 'Quản lý vận hành', color: Colors.primary,   bg: Colors.primaryBg   },
  tenant:  { label: 'Khách thuê',        color: Colors.success,   bg: Colors.successLight },
};

const MOCK_MANAGER_STATS = { properties: 2, tenants: 10, activeContracts: 3 };

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
  const { user, logout, updateUser } = useAuth();
  const navigation = useNavigation<any>();
  const [notifEnabled, setNotifEnabled] = useState(true);
  const roleCfg = ROLE_CONFIG[user?.role ?? 'tenant'];

  // Thông tin phòng/hợp đồng thật cho tenant (GET /tenant/me/dashboard)
  const [dash, setDash] = useState<TenantDashboard | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (user?.role !== 'tenant') return;
      let active = true;
      realTenantSelfService.getDashboard()
        .then(d => { if (active) setDash(d); })
        .catch(() => { if (active) setDash(null); });
      return () => { active = false; };
    }, [user?.role]),
  );

  const tenantRoom = dash?.room?.roomNumber
    ? `Phòng ${dash.room.roomNumber}${dash.building?.name ? ` · ${dash.building.name}` : ''}`
    : (dash?.building?.name ?? '—');
  const tenantContractEnd = dash?.contract?.endDate ?? '—';

  // ── Đổi mật khẩu (POST /api/v1/auth/change-password) ──
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [changing, setChanging] = useState(false);

  const resetPwdForm = () => { setOldPwd(''); setNewPwd(''); setConfirmPwd(''); };

  const handleChangePassword = () => { resetPwdForm(); setShowPwdModal(true); };

  const submitChangePassword = async () => {
    if (!oldPwd || !newPwd) return Alert.alert('Thiếu thông tin', 'Vui lòng nhập đủ mật khẩu cũ và mới.');
    if (newPwd.length < 6) return Alert.alert('Mật khẩu yếu', 'Mật khẩu mới tối thiểu 6 ký tự.');
    if (newPwd !== confirmPwd) return Alert.alert('Không khớp', 'Xác nhận mật khẩu mới không khớp.');
    try {
      setChanging(true);
      await realTenantSelfService.changePassword({ oldPassword: oldPwd, newPassword: newPwd });
      setShowPwdModal(false);
      resetPwdForm();
      Alert.alert('Thành công', 'Đổi mật khẩu thành công.');
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || 'Đổi mật khẩu thất bại. Kiểm tra lại mật khẩu cũ.';
      Alert.alert('Lỗi', msg);
    } finally {
      setChanging(false);
    }
  };

  // ── Cập nhật hồ sơ (PUT /api/v1/users/me) ──
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const handleEditProfile = () => {
    setEditName(user?.fullName ?? '');
    setEditEmail(user?.email ?? '');
    setShowEditModal(true);
  };

  const submitEditProfile = async () => {
    if (!editName.trim()) return Alert.alert('Thiếu thông tin', 'Vui lòng nhập họ tên.');
    try {
      setSaving(true);
      const me = await realTenantSelfService.updateProfile({
        fullName: editName.trim(),
        email: editEmail.trim() || undefined,
      });
      // Đồng bộ lại user trong context để UI cập nhật ngay
      updateUser({ fullName: me.fullName, email: me.email ?? '' });
      setShowEditModal(false);
      Alert.alert('Thành công', 'Cập nhật hồ sơ thành công.');
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || 'Cập nhật hồ sơ thất bại.';
      Alert.alert('Lỗi', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleHelp = () =>
    Alert.alert('Hỗ trợ', 'Liên hệ hỗ trợ qua email: support@hoangbinhland.vn\nHotline: 1800 1234');

  const handleLogout = () =>
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đăng xuất', style: 'destructive', onPress: logout },
    ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
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
                <Text style={styles.tenantInfoValue}>{tenantRoom}</Text>
              </View>
            </View>
            <View style={styles.tenantInfoDivider} />
            <View style={styles.tenantInfoRow}>
              <Text style={styles.tenantInfoIcon}>📋</Text>
              <View>
                <Text style={styles.tenantInfoLabel}>Hợp đồng hết hạn</Text>
                <Text style={styles.tenantInfoValue}>{tenantContractEnd}</Text>
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
          <View style={styles.itemDivider} />
          <MenuItem icon="✏️" label="Chỉnh sửa hồ sơ" onPress={handleEditProfile} />
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

        {/* ── Hợp đồng & Trả phòng (tenant only) ── */}
        {user?.role === 'tenant' && (
          <>
            <SectionHeader title="Hợp đồng" />
            <View style={styles.card}>
              <MenuItem
                icon="🚪"
                label="Yêu cầu kết thúc hợp đồng"
                onPress={() => navigation.navigate('RequestCheckout')}
              />
              <View style={styles.itemDivider} />
              <MenuItem
                icon="📍"
                label="Tiến trình trả phòng"
                onPress={() => navigation.navigate('CheckoutDetail')}
              />
            </View>
          </>
        )}

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

      {/* ===== Modal Đổi mật khẩu ===== */}
      <Modal visible={showPwdModal} transparent animationType="slide" onRequestClose={() => setShowPwdModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🔒 Đổi mật khẩu</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Mật khẩu hiện tại"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              value={oldPwd}
              onChangeText={setOldPwd}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              value={newPwd}
              onChangeText={setNewPwd}
            />
            <TextInput
              style={styles.modalInput}
              placeholder="Xác nhận mật khẩu mới"
              placeholderTextColor={Colors.textMuted}
              secureTextEntry
              value={confirmPwd}
              onChangeText={setConfirmPwd}
            />
            <TouchableOpacity
              style={[styles.modalBtnPrimary, changing && { opacity: 0.6 }]}
              onPress={submitChangePassword}
              disabled={changing}
            >
              {changing ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.modalBtnPrimaryText}>Xác nhận</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowPwdModal(false)} disabled={changing}>
              <Text style={styles.modalBtnCancelText}>Hủy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ===== Modal Chỉnh sửa hồ sơ ===== */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>✏️ Chỉnh sửa hồ sơ</Text>

            <Text style={styles.inputLabel}>Họ và tên</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Họ và tên"
              placeholderTextColor={Colors.textMuted}
              value={editName}
              onChangeText={setEditName}
            />

            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Email (không bắt buộc)"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
              keyboardType="email-address"
              value={editEmail}
              onChangeText={setEditEmail}
            />

            <Text style={styles.modalHint}>Số điện thoại và tên đăng nhập không thể tự đổi tại đây.</Text>

            <TouchableOpacity
              style={[styles.modalBtnPrimary, saving && { opacity: 0.6 }]}
              onPress={submitEditProfile}
              disabled={saving}
            >
              {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.modalBtnPrimaryText}>Lưu thay đổi</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowEditModal(false)} disabled={saving}>
              <Text style={styles.modalBtnCancelText}>Hủy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

  // Modal đổi mật khẩu
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.lg, paddingBottom: 40,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.lg },
  inputLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
  modalHint: { fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.base, fontStyle: 'italic' },
  modalInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    padding: Spacing.md, fontSize: 16, marginBottom: Spacing.base, color: Colors.textPrimary,
  },
  modalBtnPrimary: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', marginTop: Spacing.xs,
  },
  modalBtnPrimaryText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  modalBtnCancel: { alignItems: 'center', paddingVertical: Spacing.md },
  modalBtnCancelText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
});
