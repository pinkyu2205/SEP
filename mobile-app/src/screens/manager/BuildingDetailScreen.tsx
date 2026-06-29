import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { ManagedProperty } from '../../data/managedProperties';
import { realPropertyService, ApiRoom } from '../../services/propertyService.real';
import { realTenantService, TenantContractResponse } from '../../services/tenantService.real';
import { realManagerInvoiceService, ManagerInvoice } from '../../services/managerInvoiceService.real';

const fmt = (n: number) => (n ?? 0).toLocaleString('vi-VN') + 'đ';

type UIRoomStatus = 'occupied' | 'available' | 'maintenance';
const ROOM_DOT: Record<UIRoomStatus, string> = {
  occupied: '#3B82F6', available: '#16A34A', maintenance: '#F59E0B',
};
const ROOM_STATUS_LABEL: Record<UIRoomStatus, string> = {
  occupied: 'Đang thuê', available: 'Trống', maintenance: 'Bảo trì',
};
const mapRoomStatus = (s: string): UIRoomStatus => {
  const u = (s || '').toUpperCase();
  if (u === 'RENTED') return 'occupied';
  if (u === 'MAINTENANCE') return 'maintenance';
  return 'available';
};
// Suy tầng từ số phòng (vd "201" -> tầng 2); không xác định được -> tầng 1.
const floorOf = (roomNumber: string): number => {
  const n = parseInt(roomNumber, 10);
  return !isNaN(n) && n >= 100 ? Math.floor(n / 100) : 1;
};

const QUICK_ACTIONS = [
  { emoji: '🧾', label: 'Thu tiền', desc: 'Hoá đơn', route: 'BuildingInvoice', color: '#F59E0B' },
  { emoji: '⚡', label: 'Chốt số', desc: 'Điện nước', route: 'UtilityBilling', color: Colors.accent },
  { emoji: '🔧', label: 'Bảo trì', desc: 'Sửa chữa', route: 'BuildingMaintenance', color: '#EF4444' },
  { emoji: '🏠', label: 'Phòng', desc: 'Quản lý', route: 'RoomManage', color: Colors.success },
  { emoji: '📋', label: 'Hợp đồng', desc: 'HĐ thuê', route: 'BuildingContract', color: Colors.info },
  { emoji: '👥', label: 'Khách thuê', desc: 'Cư dân', route: 'TenantList', color: Colors.primary },
];

interface IssueItem {
  key: string; icon: string; title: string; meta: string; color: string; route: string;
}

export const BuildingDetailScreen: React.FC<any> = ({ navigation, route }) => {
  const propertyId: string = route?.params?.propertyId;
  const prop = route?.params?.property as ManagedProperty | undefined;
  const pid = Number(propertyId ?? prop?.id);

  const [rooms, setRooms] = useState<ApiRoom[]>([]);
  const [contracts, setContracts] = useState<TenantContractResponse[]>([]);
  const [invoices, setInvoices] = useState<ManagerInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!pid) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      realPropertyService.getRooms(pid).catch(() => [] as ApiRoom[]),
      realTenantService.listByProperty(pid).catch(() => [] as TenantContractResponse[]),
      realManagerInvoiceService.listInvoices().catch(() => [] as ManagerInvoice[]),
    ])
      .then(([r, c, inv]) => {
        setRooms(r);
        setContracts(c);
        setInvoices(inv.filter(i => i.propertyId === pid));
      })
      .finally(() => setLoading(false));
  }, [pid]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const nav = (r: string) => navigation.navigate(r, { propertyId: String(pid), property: prop });

  // Số liệu phòng thật
  const occupied    = rooms.filter(r => r.status === 'RENTED').length;
  const available   = rooms.filter(r => r.status === 'AVAILABLE').length;
  const maintenance = rooms.filter(r => r.status === 'MAINTENANCE').length;
  const totalRooms  = rooms.length;
  const occ = totalRooms > 0 ? Math.round((occupied / totalRooms) * 100) : 0;
  const occColor = occ >= 80 ? Colors.success : occ >= 60 ? Colors.primary : occ >= 40 ? '#F59E0B' : '#EF4444';

  // Tên khách theo số phòng (HĐ đang hiệu lực)
  const activeContracts = useMemo(
    () => contracts.filter(c => (c.status || '').toUpperCase() === 'ACTIVE'),
    [contracts],
  );
  const tenantByRoom = useMemo(() => {
    const m = new Map<string, string>();
    activeContracts.forEach(c => { if (c.roomNumber) m.set(c.roomNumber, c.tenantFullName); });
    return m;
  }, [activeContracts]);

  const { urgent, upcoming } = useMemo(() => {
    const urgent: IssueItem[] = invoices
      .filter(i => i.status === 'OVERDUE')
      .map(i => ({
        key: `inv-${i.id}`, icon: '💸', color: '#EF4444',
        title: `Hoá đơn quá hạn · ${i.roomNumber ? `Phòng ${i.roomNumber}` : 'Nguyên căn'}`,
        meta: `${i.tenantName ?? ''}${i.tenantName ? ' · ' : ''}${fmt(i.amount)}`,
        route: 'BuildingInvoice',
      }));
    const upcoming: IssueItem[] = rooms
      .filter(r => r.status === 'MAINTENANCE')
      .map(r => ({
        key: `mt-${r.id}`, icon: '🔧', color: '#F59E0B',
        title: `Phòng ${r.roomNumber} đang bảo trì`, meta: 'Cần xử lý',
        route: 'RoomManage',
      }));
    return { urgent, upcoming };
  }, [invoices, rooms]);

  const totalIssues = urgent.length + upcoming.length;
  const health = urgent.length > 0
    ? { label: '🔴 Cần xử lý ngay', color: '#EF4444' }
    : upcoming.length > 0
      ? { label: '🟡 Có việc sắp tới', color: '#F59E0B' }
      : { label: '✅ Hoạt động ổn định', color: '#16A34A' };

  const floors = useMemo(
    () => [...new Set(rooms.map(r => floorOf(r.roomNumber)))].sort((a, b) => a - b),
    [rooms],
  );

  const renderIssue = (it: IssueItem) => (
    <TouchableOpacity key={it.key} style={[styles.issueRow, { borderLeftColor: it.color }]} onPress={() => nav(it.route)}>
      <Text style={styles.issueIcon}>{it.icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.issueTitle}>{it.title}</Text>
        <Text style={styles.issueMeta}>{it.meta}</Text>
      </View>
      <Text style={styles.issueChevron}>›</Text>
    </TouchableOpacity>
  );

  if (!pid) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.backText}>← Quay lại</Text></TouchableOpacity>
          <Text style={styles.title}>Toà nhà</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.emptyState}>
          <Text style={{ fontSize: 40 }}>🏢</Text>
          <Text style={styles.emptyText}>Không tìm thấy toà nhà</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{prop?.name ?? 'Toà nhà'}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* 1. Hero Overview */}
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroLabel}>TỈ LỆ LẤP ĐẦY</Text>
              <Text style={styles.heroValue}>{occ}%</Text>
              <Text style={styles.heroSub}>{occupied}/{totalRooms} phòng đang thuê</Text>
            </View>
            <View style={styles.heroAddrBox}>
              {!!prop?.address && <Text style={styles.heroAddr} numberOfLines={3}>📍 {prop.address}</Text>}
              <Text style={styles.heroFloors}>🏢 {floors.length} tầng · {totalRooms} phòng</Text>
            </View>
          </View>
          <View style={styles.heroBarBg}>
            <View style={[styles.heroBarFill, { width: `${occ}%`, backgroundColor: occColor }]} />
          </View>
          <View style={styles.heroRoomRow}>
            <View style={styles.heroRoomStat}>
              <Text style={[styles.heroRoomNum, { color: '#A7F3D0' }]}>{occupied}</Text>
              <Text style={styles.heroRoomLabel}>Đang thuê</Text>
            </View>
            <View style={styles.heroRoomStat}>
              <Text style={styles.heroRoomNum}>{available}</Text>
              <Text style={styles.heroRoomLabel}>Trống</Text>
            </View>
            <View style={styles.heroRoomStat}>
              <Text style={[styles.heroRoomNum, { color: '#FCD34D' }]}>{maintenance}</Text>
              <Text style={styles.heroRoomLabel}>Bảo trì</Text>
            </View>
            <View style={styles.heroRoomStat}>
              <Text style={styles.heroRoomNum}>{totalRooms}</Text>
              <Text style={styles.heroRoomLabel}>Tổng</Text>
            </View>
          </View>
          <View style={styles.healthChip}>
            <Text style={styles.healthChipText}>{health.label}</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : (
        <>
        {/* 2. Cần xử lý */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Cần xử lý</Text>
          {totalIssues > 0 && (
            <View style={[styles.countBadge, { backgroundColor: health.color + '20' }]}>
              <Text style={[styles.countBadgeText, { color: health.color }]}>{totalIssues}</Text>
            </View>
          )}
        </View>

        {totalIssues === 0 ? (
          <View style={styles.okCard}>
            <Text style={styles.okText}>✅ Toà nhà đang hoạt động ổn định</Text>
          </View>
        ) : (
          <>
            {urgent.length > 0 && (
              <>
                <Text style={styles.groupLabel}>🔴 KHẨN CẤP</Text>
                <View style={styles.issueGroup}>{urgent.map(renderIssue)}</View>
              </>
            )}
            {upcoming.length > 0 && (
              <>
                <Text style={[styles.groupLabel, { marginTop: Spacing.md }]}>🟡 SẮP TỚI</Text>
                <View style={styles.issueGroup}>{upcoming.map(renderIssue)}</View>
              </>
            )}
          </>
        )}

        {/* 3. Room Overview */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Tổng quan phòng</Text>
          <TouchableOpacity onPress={() => nav('RoomManage')}>
            <Text style={styles.sectionLink}>Quản lý ›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          {rooms.length === 0 ? (
            <Text style={styles.cardEmptyText}>Chưa có phòng</Text>
          ) : floors.map((floor, fi) => (
            <View key={floor} style={fi > 0 ? styles.floorBlockDivider : undefined}>
              <Text style={styles.floorTitle}>Tầng {floor}</Text>
              {rooms.filter(r => floorOf(r.roomNumber) === floor).map(r => {
                const st = mapRoomStatus(r.status);
                const tenantName = tenantByRoom.get(r.roomNumber);
                return (
                  <TouchableOpacity key={r.id} style={styles.roomRow} onPress={() => nav('RoomManage')}>
                    <View style={[styles.roomDot, { backgroundColor: ROOM_DOT[st] }]} />
                    <Text style={styles.roomCode}>{r.roomNumber}</Text>
                    <Text style={styles.roomStatus}>{ROOM_STATUS_LABEL[st]}</Text>
                    {!!tenantName && <Text style={styles.roomTenant} numberOfLines={1}>{tenantName}</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {/* 4. Quick Operational Actions */}
        <Text style={styles.sectionTitle}>Thao tác vận hành</Text>
        <View style={styles.actionsGrid}>
          {QUICK_ACTIONS.map((a, i) => (
            <TouchableOpacity key={i} style={styles.actionBtn} onPress={() => nav(a.route)}>
              <View style={[styles.actionIconWrap, { backgroundColor: a.color + '18' }]}>
                <Text style={styles.actionEmoji}>{a.emoji}</Text>
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
              <Text style={styles.actionDesc}>{a.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 5. Tenant Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Khách thuê</Text>
          <TouchableOpacity onPress={() => nav('TenantList')}>
            <Text style={styles.sectionLink}>Tất cả ›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card}>
          {activeContracts.length === 0 ? (
            <Text style={styles.cardEmptyText}>Chưa có khách thuê</Text>
          ) : activeContracts.slice(0, 4).map((t, i) => (
            <TouchableOpacity key={t.id} style={[styles.tenantRow, i > 0 && styles.rowDivider]} onPress={() => nav('TenantList')}>
              <View style={styles.tenantAvatar}><Text style={styles.tenantAvatarText}>{t.tenantFullName.charAt(0)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tenantName}>{t.tenantFullName}</Text>
                <Text style={styles.tenantMeta}>
                  {t.roomNumber ? `Phòng ${t.roomNumber}` : 'Nguyên căn'} · {t.tenantPhone}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
        </>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, ...Shadow.sm,
  },
  backText: { color: Colors.primary, fontWeight: '600', fontSize: 15, width: 60 },
  title: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  scroll: { padding: Spacing.lg },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  emptyText: { fontSize: 15, color: Colors.textSecondary },
  loadingWrap: { paddingVertical: Spacing['3xl'], alignItems: 'center' },

  // Hero
  hero: { backgroundColor: Colors.primary, borderRadius: BorderRadius.xl, padding: Spacing.lg, marginBottom: Spacing.xl },
  heroTopRow: { flexDirection: 'row', marginBottom: Spacing.md },
  heroLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '700', letterSpacing: 1 },
  heroValue: { fontSize: 48, fontWeight: '900', color: Colors.white, lineHeight: 54, marginTop: 2 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  heroAddrBox: { flex: 1, paddingLeft: Spacing.md, justifyContent: 'center' },
  heroAddr: { fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 17 },
  heroFloors: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 6 },
  heroBarBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 3, marginBottom: Spacing.md },
  heroBarFill: { height: 6, borderRadius: 3 },
  heroRoomRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md },
  heroRoomStat: { alignItems: 'center', flex: 1 },
  heroRoomNum: { fontSize: 20, fontWeight: '800', color: Colors.white },
  heroRoomLabel: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  healthChip: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: BorderRadius.full, paddingVertical: 8, alignItems: 'center' },
  healthChipText: { fontSize: 13, fontWeight: '700', color: Colors.white },

  // Sections
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.lg, marginBottom: Spacing.sm },
  sectionLink: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  countBadge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countBadgeText: { fontSize: 12, fontWeight: '800' },
  groupLabel: { fontSize: 11, fontWeight: '800', color: Colors.textSecondary, letterSpacing: 0.5, marginBottom: Spacing.sm },

  // Issues
  okCard: { backgroundColor: '#F0FDF4', borderRadius: BorderRadius.lg, padding: Spacing.md, alignItems: 'center' },
  okText: { fontSize: 13, fontWeight: '600', color: '#16A34A' },
  issueGroup: { gap: Spacing.sm },
  issueRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderLeftWidth: 3, ...Shadow.sm,
  },
  issueIcon: { fontSize: 18 },
  issueTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  issueMeta: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  issueChevron: { fontSize: 20, color: Colors.textMuted, fontWeight: '600' },

  // Generic card
  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md, ...Shadow.sm },
  cardEmptyText: { fontSize: 13, color: Colors.textMuted, paddingVertical: Spacing.md, textAlign: 'center' },
  rowDivider: { borderTopWidth: 1, borderTopColor: Colors.divider },

  // Room overview
  floorBlockDivider: { borderTopWidth: 1, borderTopColor: Colors.divider },
  floorTitle: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary, marginTop: Spacing.md, marginBottom: 4 },
  roomRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  roomDot: { width: 9, height: 9, borderRadius: 4.5 },
  roomCode: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, width: 52 },
  roomStatus: { fontSize: 12, color: Colors.textSecondary, width: 70 },
  roomTenant: { fontSize: 12, color: Colors.textMuted, flex: 1, textAlign: 'right' },

  // Quick actions
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  actionBtn: { width: '30.7%', alignItems: 'center', backgroundColor: Colors.white, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, ...Shadow.sm },
  actionIconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  actionEmoji: { fontSize: 18 },
  actionLabel: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  actionDesc: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },

  // Tenant
  tenantRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm },
  tenantAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  tenantAvatarText: { fontSize: 15, fontWeight: '800', color: Colors.primary },
  tenantName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  tenantMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
});
