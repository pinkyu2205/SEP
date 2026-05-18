import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, Alert, ScrollView, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// ===================== TYPES =====================
type TenantStatus = 'active' | 'pending_activation' | 'moved_out' | 'suspended';

interface Tenant {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  cccd: string;
  propertyName: string;
  propertyId: string;
  roomId: string;
  roomName: string;
  status: TenantStatus;
  moveInDate: string;
  moveOutDate?: string;
  depositAmount: number;
  contractId?: string;
  unpaidAmount?: number;
  unpaidBills?: number;
  openTickets?: number;
  contractEndDate?: string;
  notes?: string;
}

// ===================== MOCK DATA =====================
const MOCK_TENANTS: Tenant[] = [
  {
    id: 't1', fullName: 'Trần Văn A', phone: '0901111001', email: 'tranvana@gmail.com',
    cccd: '079201001001', propertyName: 'Nhà Nguyễn Trãi', propertyId: 'p1',
    roomId: 'r1', roomName: 'P101', status: 'active', moveInDate: '20/01/2026',
    depositAmount: 3500000, unpaidAmount: 4352500, unpaidBills: 1,
    openTickets: 0, contractId: 'c-mt-1', contractEndDate: '20/01/2027',
  },
  {
    id: 't2', fullName: 'Lê Thị B', phone: '0901111002', email: 'lethib@gmail.com',
    cccd: '079201001002', propertyName: 'Nhà Nguyễn Trãi', propertyId: 'p1',
    roomId: 'r2', roomName: 'P102', status: 'active', moveInDate: '01/02/2026',
    depositAmount: 3200000, unpaidAmount: 0, unpaidBills: 0,
    openTickets: 1, contractId: 'c-mt-2', contractEndDate: '15/05/2026',
  },
  {
    id: 't3', fullName: 'Phạm Văn C', phone: '0901111003', email: 'phamvanc@gmail.com',
    cccd: '079201001003', propertyName: 'Nhà Nguyễn Trãi', propertyId: 'p1',
    roomId: 'r3', roomName: 'P201', status: 'active', moveInDate: '15/02/2026',
    depositAmount: 3800000, unpaidAmount: 9420775, unpaidBills: 2,
    openTickets: 2, contractId: 'c-mt-3', contractEndDate: '15/02/2027',
  },
  {
    id: 't4', fullName: 'Ngô Thị D', phone: '0901111004',
    cccd: '079201001004', propertyName: 'Nhà Nguyễn Trãi', propertyId: 'p1',
    roomId: 'r4', roomName: 'P301', status: 'active', moveInDate: '01/03/2026',
    depositAmount: 3500000, unpaidAmount: 4105000, unpaidBills: 1,
    openTickets: 0, contractId: 'c-mt-4', contractEndDate: '01/03/2027',
  },
  {
    id: 't5', fullName: 'Hoàng Thị E', phone: '0901111005',
    cccd: '079201001005', propertyName: 'Nhà Nguyễn Trãi', propertyId: 'p1',
    roomId: 'r5', roomName: 'P302', status: 'pending_activation', moveInDate: '16/05/2026',
    depositAmount: 3500000, unpaidAmount: 0, unpaidBills: 0, openTickets: 0,
  },
  {
    id: 't8', fullName: 'Bùi Văn H', phone: '0901111008',
    cccd: '079201001008', propertyName: 'Nhà CMT8', propertyId: 'p2',
    roomId: 'r8', roomName: 'P101', status: 'active', moveInDate: '15/03/2026',
    depositAmount: 4000000, unpaidAmount: 4845000, unpaidBills: 1,
    openTickets: 1, contractId: 'c-mt-8', contractEndDate: '15/03/2027',
  },
  {
    id: 't9', fullName: 'Cao Thị I', phone: '0901111009',
    cccd: '079201001009', propertyName: 'Nhà CMT8', propertyId: 'p2',
    roomId: 'r9', roomName: 'P102', status: 'active', moveInDate: '20/03/2026',
    depositAmount: 3800000, unpaidAmount: 0, unpaidBills: 0, openTickets: 0,
    contractId: 'c-mt-9', contractEndDate: '20/03/2027',
  },
  {
    id: 't10', fullName: 'Lý Văn K', phone: '0901111010',
    cccd: '079201001010', propertyName: 'Nhà CMT8', propertyId: 'p2',
    roomId: 'r10', roomName: 'P202', status: 'moved_out', moveInDate: '01/01/2026',
    moveOutDate: '30/04/2026', depositAmount: 3500000, unpaidAmount: 0, unpaidBills: 0,
    openTickets: 0, notes: 'Đã trả phòng bình thường',
  },
];

const STATUS_CONFIG: Record<TenantStatus, { label: string; color: string; bg: string; icon: string }> = {
  active: { label: 'Đang ở', color: '#16A34A', bg: '#F0FDF4', icon: '🟢' },
  pending_activation: { label: 'Chờ kích hoạt', color: '#F59E0B', bg: '#FFFBEB', icon: '🟡' },
  moved_out: { label: 'Đã rời', color: '#6B7280', bg: '#F3F4F6', icon: '⚪' },
  suspended: { label: 'Tạm ngưng', color: '#EF4444', bg: '#FEF2F2', icon: '🔴' },
};

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

// ===================== TENANT DETAIL MODAL =====================
const TenantDetailModal: React.FC<{
  tenant: Tenant;
  onClose: () => void;
  onAction: (action: string, tenant: Tenant) => void;
}> = ({ tenant, onClose, onAction }) => {
  const cfg = STATUS_CONFIG[tenant.status];

  return (
    <Modal transparent animationType="slide">
      <View style={modalStyles.overlay}>
        <View style={modalStyles.sheet}>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}
            contentContainerStyle={modalStyles.content}>
            {/* Header */}
            <View style={modalStyles.header}>
              <View style={modalStyles.avatarLarge}>
                <Text style={modalStyles.avatarText}>{tenant.fullName.charAt(0)}</Text>
              </View>
              <View style={modalStyles.headerInfo}>
                <Text style={modalStyles.tenantName}>{tenant.fullName}</Text>
                <Text style={modalStyles.tenantRoom}>{tenant.propertyName} · {tenant.roomName}</Text>
                <View style={[modalStyles.statusBadge, { backgroundColor: cfg.bg }]}>
                  <Text style={modalStyles.statusIcon}>{cfg.icon}</Text>
                  <Text style={[modalStyles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={onClose}>
                <Text style={modalStyles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Alerts */}
            {(tenant.unpaidBills && tenant.unpaidBills > 0) ? (
              <TouchableOpacity
                style={modalStyles.alertBanner}
                onPress={() => onAction('billing', tenant)}
              >
                <Text style={modalStyles.alertText}>
                  ⚠️ {tenant.unpaidBills} hóa đơn chưa thanh toán · {fmt(tenant.unpaidAmount || 0)}
                </Text>
                <Text style={modalStyles.alertArrow}>›</Text>
              </TouchableOpacity>
            ) : null}

            {(tenant.openTickets && tenant.openTickets > 0) ? (
              <TouchableOpacity
                style={[modalStyles.alertBanner, { backgroundColor: Colors.infoLight, borderColor: Colors.info + '40' }]}
                onPress={() => onAction('maintenance', tenant)}
              >
                <Text style={[modalStyles.alertText, { color: Colors.info }]}>
                  🔧 {tenant.openTickets} yêu cầu bảo trì đang xử lý
                </Text>
                <Text style={[modalStyles.alertArrow, { color: Colors.info }]}>›</Text>
              </TouchableOpacity>
            ) : null}

            {/* Info */}
            <View style={modalStyles.section}>
              <Text style={modalStyles.sectionTitle}>Thông tin cá nhân</Text>
              <View style={modalStyles.infoRow}><Text style={modalStyles.infoLabel}>📱 Điện thoại</Text><Text style={modalStyles.infoVal}>{tenant.phone}</Text></View>
              {tenant.email && <View style={modalStyles.infoRow}><Text style={modalStyles.infoLabel}>✉️ Email</Text><Text style={modalStyles.infoVal}>{tenant.email}</Text></View>}
              <View style={modalStyles.infoRow}><Text style={modalStyles.infoLabel}>🪪 CCCD</Text><Text style={modalStyles.infoVal}>{tenant.cccd}</Text></View>
            </View>

            <View style={modalStyles.section}>
              <Text style={modalStyles.sectionTitle}>Thuê phòng</Text>
              <View style={modalStyles.infoRow}><Text style={modalStyles.infoLabel}>📅 Ngày vào</Text><Text style={modalStyles.infoVal}>{tenant.moveInDate}</Text></View>
              {tenant.moveOutDate && <View style={modalStyles.infoRow}><Text style={modalStyles.infoLabel}>📅 Ngày ra</Text><Text style={modalStyles.infoVal}>{tenant.moveOutDate}</Text></View>}
              {tenant.contractEndDate && <View style={modalStyles.infoRow}><Text style={modalStyles.infoLabel}>📋 Hạn HĐ</Text><Text style={modalStyles.infoVal}>{tenant.contractEndDate}</Text></View>}
              <View style={modalStyles.infoRow}><Text style={modalStyles.infoLabel}>💰 Tiền cọc</Text><Text style={[modalStyles.infoVal, { color: Colors.primary, fontWeight: '700' }]}>{fmt(tenant.depositAmount)}</Text></View>
            </View>

            <View style={modalStyles.section}>
              <Text style={modalStyles.sectionTitle}>Công nợ & Dịch vụ</Text>
              <View style={modalStyles.statsRow}>
                <View style={[modalStyles.statItem, { borderColor: tenant.unpaidAmount ? Colors.error : Colors.success }]}>
                  <Text style={[modalStyles.statNum, { color: tenant.unpaidAmount ? Colors.error : Colors.success }]}>
                    {tenant.unpaidBills || 0}
                  </Text>
                  <Text style={modalStyles.statLabel}>HĐ chưa TT</Text>
                  {tenant.unpaidAmount ? (
                    <Text style={[modalStyles.statSub, { color: Colors.error }]}>{fmt(tenant.unpaidAmount)}</Text>
                  ) : null}
                </View>
                <View style={modalStyles.statItem}>
                  <Text style={modalStyles.statNum}>{tenant.openTickets || 0}</Text>
                  <Text style={modalStyles.statLabel}>Ticket mở</Text>
                </View>
              </View>
            </View>

            {/* Actions */}
            {tenant.status === 'active' && (
              <View style={modalStyles.actionsSection}>
                <Text style={modalStyles.sectionTitle}>Thao tác</Text>
                <View style={modalStyles.actionsGrid}>
                  {[
                    { key: 'billing',     icon: '🧾', label: 'Hóa đơn',  color: Colors.warning },
                    { key: 'contract',    icon: '📋', label: 'Hợp đồng', color: Colors.info },
                    { key: 'maintenance', icon: '🔧', label: 'Bảo trì',  color: Colors.primary },
                    { key: 'checkout',    icon: '🚪', label: 'Trả phòng', color: Colors.error },
                  ].map(({ key, icon, label, color }) => (
                    <TouchableOpacity
                      key={key}
                      style={[modalStyles.actionBtn, { borderColor: color + '40', backgroundColor: color + '10' }]}
                      onPress={() => onAction(key, tenant)}
                    >
                      <Text style={modalStyles.actionIcon}>{icon}</Text>
                      <Text style={[modalStyles.actionLabel, { color }]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {tenant.status === 'pending_activation' && (
              <TouchableOpacity
                style={modalStyles.activateBtn}
                onPress={() => onAction('activate', tenant)}
              >
                <Text style={modalStyles.activateBtnText}>✅ Kích hoạt phòng</Text>
              </TouchableOpacity>
            )}

            {tenant.notes && (
              <View style={modalStyles.notesBox}>
                <Text style={modalStyles.notesLabel}>Ghi chú</Text>
                <Text style={modalStyles.notesText}>{tenant.notes}</Text>
              </View>
            )}

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl, maxHeight: SCREEN_HEIGHT * 0.92,
  },
  content: { padding: Spacing.xl, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.md, gap: Spacing.md },
  avatarLarge: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 24, fontWeight: '800', color: Colors.primary },
  headerInfo: { flex: 1 },
  tenantName: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  tenantRoom: { fontSize: 13, color: Colors.textSecondary, marginTop: 2, marginBottom: Spacing.sm },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  statusIcon: { fontSize: 12 },
  statusText: { fontSize: 12, fontWeight: '700' },
  closeBtn: { fontSize: 20, color: Colors.textMuted, padding: 4 },
  alertBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.warningLight,
    borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.warning + '40', gap: Spacing.sm,
  },
  alertText: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.warning },
  alertArrow: { fontSize: 20, color: Colors.warning },
  section: { marginBottom: Spacing.md },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderColor: Colors.divider },
  infoLabel: { fontSize: 14, color: Colors.textSecondary },
  infoVal: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, textAlign: 'right', flex: 1, marginLeft: Spacing.md },
  statsRow: { flexDirection: 'row', gap: Spacing.md },
  statItem: {
    flex: 1, backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    padding: Spacing.md, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.border,
  },
  statNum: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  statSub: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  actionsSection: { marginBottom: Spacing.md },
  actionsGrid: { flexDirection: 'row', gap: Spacing.md },
  actionBtn: {
    flex: 1, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md, alignItems: 'center', borderWidth: 1.5,
  },
  actionIcon: { fontSize: 22, marginBottom: 4 },
  actionLabel: { fontSize: 11, fontWeight: '700' },
  activateBtn: {
    backgroundColor: Colors.success, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', marginBottom: Spacing.md, ...Shadow.md,
  },
  activateBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  notesBox: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.md, borderLeftWidth: 3, borderLeftColor: Colors.textMuted },
  notesLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 4 },
  notesText: { fontSize: 13, color: Colors.textSecondary },
});

// ===================== MAIN COMPONENT =====================
export const TenantListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TenantStatus>('all');
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [tenants, setTenants] = useState(MOCK_TENANTS);

  const properties = useMemo(() => {
    const names = [...new Set(MOCK_TENANTS.map(t => t.propertyName))];
    return names;
  }, []);

  const filtered = useMemo(() => {
    return tenants.filter(t => {
      const matchSearch = !search || (
        t.fullName.toLowerCase().includes(search.toLowerCase()) ||
        t.phone.includes(search) ||
        t.roomName.toLowerCase().includes(search.toLowerCase()) ||
        t.cccd.includes(search)
      );
      const matchStatus = statusFilter === 'all' || t.status === statusFilter;
      const matchProperty = propertyFilter === 'all' || t.propertyName === propertyFilter;
      return matchSearch && matchStatus && matchProperty;
    });
  }, [tenants, search, statusFilter, propertyFilter]);

  const stats = useMemo(() => ({
    active: tenants.filter(t => t.status === 'active').length,
    pending: tenants.filter(t => t.status === 'pending_activation').length,
    total: tenants.filter(t => t.status !== 'moved_out').length,
  }), [tenants]);

  const handleAction = (action: string, tenant: Tenant) => {
    switch (action) {
      case 'billing':
        setSelectedTenant(null);
        navigation.navigate('ManagerTabs', { screen: 'ManagerBilling' });
        break;
      case 'contract':
        setSelectedTenant(null);
        navigation.navigate('ManagerContracts');
        break;
      case 'maintenance':
        setSelectedTenant(null);
        navigation.navigate('ManagerTabs', { screen: 'ManagerMaintenance' });
        break;
      case 'checkout':
        Alert.alert(
          'Xác nhận trả phòng',
          `${tenant.fullName} - ${tenant.roomName}\n\nThao tác này sẽ cập nhật trạng thái phòng về "Trống". Đảm bảo hóa đơn và tiền cọc đã được xử lý.`,
          [
            { text: 'Hủy', style: 'cancel' },
            {
              text: 'Xác nhận trả phòng',
              style: 'destructive',
              onPress: () => {
                setTenants(prev => prev.map(t =>
                  t.id === tenant.id
                    ? { ...t, status: 'moved_out', moveOutDate: new Date().toLocaleDateString('vi-VN') }
                    : t
                ));
                setSelectedTenant(null);
                Alert.alert('✅ Đã cập nhật', `${tenant.fullName} đã trả phòng ${tenant.roomName}.`);
              },
            },
          ]
        );
        break;
      case 'activate':
        setTenants(prev => prev.map(t =>
          t.id === tenant.id ? { ...t, status: 'active' } : t
        ));
        setSelectedTenant(null);
        Alert.alert('✅ Kích hoạt thành công!', `Phòng ${tenant.roomName} đã được kích hoạt cho ${tenant.fullName}.`);
        break;
    }
  };

  const renderTenantCard = ({ item }: { item: Tenant }) => {
    const cfg = STATUS_CONFIG[item.status];
    const hasIssues = (item.unpaidBills && item.unpaidBills > 0) || (item.openTickets && item.openTickets > 0);
    return (
      <TouchableOpacity
        style={[styles.card, !!hasIssues && styles.cardWithIssues]}
        onPress={() => setSelectedTenant(item)}
        activeOpacity={0.8}
      >
        <View style={styles.cardAvatar}>
          <Text style={styles.avatarText}>{item.fullName.charAt(0)}</Text>
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.tenantName}>{item.fullName}</Text>
            <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
              <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>
          <Text style={styles.tenantInfo}>📱 {item.phone}</Text>
          <Text style={styles.tenantInfo}>🏠 {item.propertyName} · {item.roomName}</Text>
          <Text style={styles.tenantInfo}>📅 Vào: {item.moveInDate}</Text>
          {item.status !== 'moved_out' && (
            <View style={styles.badgesRow}>
              {item.unpaidBills && item.unpaidBills > 0 ? (
                <View style={styles.issueBadge}>
                  <Text style={styles.issueBadgeText}>⚠️ {item.unpaidBills} HĐ chưa TT</Text>
                </View>
              ) : null}
              {item.openTickets && item.openTickets > 0 ? (
                <View style={[styles.issueBadge, { backgroundColor: Colors.infoLight }]}>
                  <Text style={[styles.issueBadgeText, { color: Colors.info }]}>🔧 {item.openTickets} ticket</Text>
                </View>
              ) : null}
            </View>
          )}
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {navigation.canGoBack() && (
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.backBtnText}>‹</Text>
            </TouchableOpacity>
          )}
          <View>
            <Text style={styles.title}>Khách thuê</Text>
            <Text style={styles.subtitle}>
              {stats.active} đang ở · {stats.pending} chờ kích hoạt
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('Onboarding')}
        >
          <Text style={styles.addBtnText}>+ Đón khách</Text>
        </TouchableOpacity>
      </View>

      {/* Stats row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.statsScroll} contentContainerStyle={styles.statsContent}>
        {(['all', 'active', 'pending_activation', 'moved_out'] as const).map(s => {
          const count = s === 'all'
            ? tenants.length
            : tenants.filter(t => t.status === s).length;
          const cfg = s === 'all' ? null : STATUS_CONFIG[s];
          return (
            <TouchableOpacity
              key={s}
              style={[styles.statChip, statusFilter === s && styles.statChipActive]}
              onPress={() => setStatusFilter(s)}
            >
              {cfg && <Text style={styles.statChipIcon}>{cfg.icon}</Text>}
              <Text style={[styles.statChipText, statusFilter === s && styles.statChipTextActive]}>
                {s === 'all' ? 'Tất cả' : cfg!.label} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍  Tìm theo tên, SĐT, phòng, CCCD..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Property filter */}
      {properties.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={styles.propertyFilterRow} contentContainerStyle={styles.propertyFilterContent}>
          <TouchableOpacity
            style={[styles.propertyChip, propertyFilter === 'all' && styles.propertyChipActive]}
            onPress={() => setPropertyFilter('all')}
          >
            <Text style={[styles.propertyChipText, propertyFilter === 'all' && styles.propertyChipTextActive]}>
              Tất cả
            </Text>
          </TouchableOpacity>
          {properties.map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.propertyChip, propertyFilter === p && styles.propertyChipActive]}
              onPress={() => setPropertyFilter(p)}
            >
              <Text style={[styles.propertyChipText, propertyFilter === p && styles.propertyChipTextActive]}>
                {p}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <FlatList
        data={filtered}
        renderItem={renderTenantCard}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 48 }}>🔍</Text>
            <Text style={styles.emptyText}>Không tìm thấy khách thuê</Text>
          </View>
        }
      />

      {selectedTenant && (
        <TenantDetailModal
          tenant={selectedTenant}
          onClose={() => setSelectedTenant(null)}
          onAction={handleAction}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, paddingTop: Spacing.xl },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 28, color: Colors.textPrimary, lineHeight: 32 },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  addBtn: {
    backgroundColor: Colors.primary, paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm, borderRadius: BorderRadius.lg,
  },
  addBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },

  statsScroll: { height: 50 },
  statsContent: { paddingHorizontal: Spacing.lg, paddingVertical: 8, alignItems: 'flex-start' },
  statChip: {
    height: 34, flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1.5, borderColor: Colors.border, marginRight: Spacing.sm,
  },
  statChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  statChipIcon: { fontSize: 12 },
  statChipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  statChipTextActive: { color: Colors.white },

  searchContainer: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  searchInput: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.md, fontSize: 14, color: Colors.textPrimary, ...Shadow.sm,
  },

  propertyFilterRow: { height: 50 },
  propertyFilterContent: { paddingHorizontal: Spacing.lg, paddingVertical: 8, alignItems: 'flex-start' },
  propertyChip: {
    height: 34, justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border, marginRight: Spacing.sm,
  },
  propertyChipActive: { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  propertyChipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  propertyChipTextActive: { color: Colors.primary },

  listContent: { paddingHorizontal: Spacing.lg, paddingBottom: 100, paddingTop: Spacing.sm },

  card: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm,
  },
  cardWithIssues: { borderWidth: 1.5, borderColor: Colors.warning + '60' },
  cardAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: Colors.primaryBg, justifyContent: 'center', alignItems: 'center',
    marginRight: Spacing.md, flexShrink: 0,
  },
  avatarText: { fontSize: 20, fontWeight: '700', color: Colors.primary },
  cardBody: { flex: 1 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  tenantName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full, marginLeft: 8 },
  statusText: { fontSize: 10, fontWeight: '700' },
  tenantInfo: { fontSize: 12, color: Colors.textSecondary, marginBottom: 2 },
  badgesRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs, flexWrap: 'wrap' },
  issueBadge: {
    backgroundColor: Colors.warningLight, paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  issueBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.warning },
  chevron: { fontSize: 22, color: Colors.textMuted, alignSelf: 'center', marginLeft: Spacing.sm },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: Spacing.md },
  emptyText: { fontSize: 14, color: Colors.textSecondary },
});
