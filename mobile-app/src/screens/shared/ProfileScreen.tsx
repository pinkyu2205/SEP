import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch,
  Modal, TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
// Alert.alert của react-native-web là no-op → dùng showAlert, không thì nút
// Đăng xuất / Hỗ trợ bấm trên web không ra gì cả.
import { showAlert } from '@/utils';
import { ConfirmDialog } from '@/components/common';
import { useAuth } from '@/hooks';
import { isClosedContract } from '@/utils';
import { realTenantSelfService, TenantDashboard } from '@/services/tenant/selfService';
import { managerPropertyService } from '@/services/manager/propertyService';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';
import { registerPushToken, unregisterPushToken } from '@/services/core/pushToken';

const ROLE_CONFIG = {
  manager: { label: 'Quản lý vận hành', color: Colors.primary,   bg: Colors.primaryBg   },
  tenant:  { label: 'Khách thuê',        color: Colors.success,   bg: Colors.successLight },
};

/**
 * Số liệu của quản lý vận hành — TÍNH THẬT, không mock.
 *
 * Trước đây chỗ này là `MOCK_MANAGER_STATS = { properties: 2, tenants: 10, activeContracts: 3 }`
 * viết cứng trong code: manager nào đăng nhập cũng thấy 2/10/3, trong khi màn Khách thuê
 * (đọc API thật) hiện 0 — hai màn cãi nhau và người dùng không biết tin cái nào.
 *
 * Dùng ĐÚNG nguồn và ĐÚNG bộ lọc của `TenantListScreen` (nhà mình phụ trách → hợp đồng
 * chưa kết thúc) để hai màn không thể lệch nhau lần nữa.
 */
interface ManagerStats { properties: number; tenants: number; activeContracts: number }
const EMPTY_MANAGER_STATS: ManagerStats = { properties: 0, tenants: 0, activeContracts: 0 };

/** Bật/tắt thông báo là lựa chọn của MÁY này, không phải của tài khoản — lưu tại máy. */
const NOTIF_PREF_KEY = 'notifEnabled';

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
  /**
   * Công tắc thông báo — CÓ TÁC DỤNG THẬT: bật thì đăng ký Expo push token với BE,
   * tắt thì gỡ. Trước đây nó chỉ là state trong màn, gạt xong thoát ra là mất, mà thông
   * báo thì vẫn về như thường — người dùng tưởng đã tắt.
   */
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [notifBusy, setNotifBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      AsyncStorage.getItem(NOTIF_PREF_KEY)
        .then(v => { if (active && v !== null) setNotifEnabled(v === '1'); })
        .catch(() => {});
      return () => { active = false; };
    }, []),
  );

  const toggleNotif = async (next: boolean) => {
    setNotifBusy(true);
    setNotifEnabled(next); // phản hồi ngay, hoàn lại nếu hỏng
    try {
      if (next) await registerPushToken();
      else await unregisterPushToken();
      await AsyncStorage.setItem(NOTIF_PREF_KEY, next ? '1' : '0');
    } catch {
      setNotifEnabled(!next);
      showAlert('Không đổi được cài đặt', 'Vui lòng kiểm tra mạng và thử lại.');
    } finally {
      setNotifBusy(false);
    }
  };
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

  // Số liệu thật của quản lý vận hành (xem chú thích ở EMPTY_MANAGER_STATS).
  const [mgrStats, setMgrStats] = useState<ManagerStats>(EMPTY_MANAGER_STATS);
  useFocusEffect(
    useCallback(() => {
      if (user?.role !== 'manager') return;
      let active = true;
      (async () => {
        try {
          const scoped = await managerPropertyService.getScopedProperties();
          const lists = await Promise.all(
            scoped.map(p =>
              realTenantService.listByProperty(p.id).catch(() => [] as TenantContractResponse[]),
            ),
          );
          const contracts = lists.flat().filter(c => !isClosedContract(c.status));
          if (!active) return;
          setMgrStats({
            properties: scoped.length,
            // Mỗi hợp đồng chưa kết thúc = một khách đang ở — khớp cách đếm của TenantListScreen.
            tenants: contracts.length,
            activeContracts: contracts.filter(c => (c.status || '').toUpperCase() === 'ACTIVE').length,
          });
        } catch {
          if (active) setMgrStats(EMPTY_MANAGER_STATS);
        }
      })();
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
    if (!oldPwd || !newPwd) return showAlert('Thiếu thông tin', 'Vui lòng nhập đủ mật khẩu cũ và mới.');
    if (newPwd.length < 6) return showAlert('Mật khẩu yếu', 'Mật khẩu mới tối thiểu 6 ký tự.');
    if (newPwd !== confirmPwd) return showAlert('Không khớp', 'Xác nhận mật khẩu mới không khớp.');
    try {
      setChanging(true);
      await realTenantSelfService.changePassword({ oldPassword: oldPwd, newPassword: newPwd, confirmPassword: confirmPwd });
      setShowPwdModal(false);
      resetPwdForm();
      showAlert('Thành công', 'Đổi mật khẩu thành công.');
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || 'Đổi mật khẩu thất bại. Kiểm tra lại mật khẩu cũ.';
      showAlert('Lỗi', msg);
    } finally {
      setChanging(false);
    }
  };

  // ── Cập nhật hồ sơ (PUT /api/v1/users/me) ──
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);

  // ── Xác nhận đăng xuất (dialog trong app, không dùng window.confirm của trình duyệt) ──
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleEditProfile = () => {
    setEditName(user?.fullName ?? '');
    setEditEmail(user?.email ?? '');
    setShowEditModal(true);
  };

  const submitEditProfile = async () => {
    if (!editName.trim()) return showAlert('Thiếu thông tin', 'Vui lòng nhập họ tên.');
    try {
      setSaving(true);
      const me = await realTenantSelfService.updateProfile({
        fullName: editName.trim(),
        email: editEmail.trim() || undefined,
      });
      // Đồng bộ lại user trong context để UI cập nhật ngay
      updateUser({ fullName: me.fullName, email: me.email ?? '' });
      setShowEditModal(false);
      showAlert('Thành công', 'Cập nhật hồ sơ thành công.');
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || 'Cập nhật hồ sơ thất bại.';
      showAlert('Lỗi', msg);
    } finally {
      setSaving(false);
    }
  };

  const handleHelp = () =>
    showAlert('Hỗ trợ', 'Liên hệ hỗ trợ qua email: support@hoangbinhland.vn\nHotline: 1800 1234');

  // logout() gọi mạng (gỡ push token + báo BE). Lỗi mà nuốt im thì người dùng bấm
  // mãi không thấy gì — báo lỗi rõ ràng thay vì đứng yên.
  const doLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      setLogoutOpen(false);
    } catch (e: any) {
      setLogoutOpen(false);
      showAlert('Không đăng xuất được', e?.message || 'Vui lòng kiểm tra mạng và thử lại.');
    } finally {
      setLoggingOut(false);
    }
  };

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
              <Text style={styles.statNum}>{mgrStats.properties}</Text>
              <Text style={styles.statLabel}>Bất động sản</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{mgrStats.tenants}</Text>
              <Text style={styles.statLabel}>Khách thuê</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{mgrStats.activeContracts}</Text>
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
          {/* Đã bỏ dòng "Tham gia": `user.createdAt` được gán bằng nowIso() lúc đăng nhập
              (xem useAuth.applyRealAuthResponse) nên nó là GIỜ ĐĂNG NHẬP chứ không phải
              ngày tạo tài khoản — hiện lên là nói dối. `/auth/me` không trả ngày tạo;
              BE có `createAt` ở /api/v1/user, cần expose thêm thì mới hiện lại được. */}
          <MenuItem icon="✏️" label="Chỉnh sửa hồ sơ" onPress={handleEditProfile} />
        </View>

        {/* ── Cài đặt ── */}
        <SectionHeader title="Cài đặt" />
        <View style={styles.card}>
          <MenuItem
            icon="🔔" label="Thông báo"
            toggle toggleValue={notifEnabled} onToggle={notifBusy ? () => {} : toggleNotif}
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
          <MenuItem icon="🚪" label="Đăng xuất" onPress={() => setLogoutOpen(true)} danger />
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

      {/* Xác nhận đăng xuất */}
      <ConfirmDialog
        visible={logoutOpen}
        icon="🚪"
        title="Đăng xuất"
        message={`Bạn sẽ cần đăng nhập lại để tiếp tục sử dụng${user?.fullName ? ` tài khoản ${user.fullName}` : ''}.`}
        confirmText="Đăng xuất"
        cancelText="Ở lại"
        danger
        loading={loggingOut}
        onConfirm={doLogout}
        onCancel={() => setLogoutOpen(false)}
      />
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
