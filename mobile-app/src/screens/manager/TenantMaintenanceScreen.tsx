import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Colors, Shadow } from '@/constants';
import { realMaintenanceService } from '@/services/shared/maintenanceService';
import type { MaintenanceRequestDto } from '@/types';

// ── Types ────────────────────────────────────────────────────────────────
type TicketStatus   = 'pending' | 'accepted' | 'in_progress' | 'resolved' | 'cancelled';
type TicketPriority = 'urgent' | 'high' | 'medium' | 'low';
type TicketCategory = 'electrical' | 'plumbing' | 'furniture' | 'appliance' | 'other';
type FilterKey      = 'all' | TicketStatus;

interface MaintenanceTicket {
  id: string;
  tenantId: string;
  code: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  createdDate: string;
  updatedDate: string;
  assignedTech?: string;
  etaDate?: string;
  cost?: number;
  resolution?: string;
  propertyName: string;
  roomName: string;
  relatedEquipment?: string;
}

// ── Map DTO thật (flow mới 17/07 + legacy) → view model 5 nhóm màn tóm tắt ──
// Chi tiết/thao tác đầy đủ nằm ở MaintenanceTicketDetail (đã nối real).
const STATUS_FROM_BE: Record<string, TicketStatus> = {
  PENDING: 'pending',
  APPROVED: 'in_progress', WAITING_TENANT_CONFIRM: 'in_progress', REJECTED: 'in_progress',
  CLOSED: 'resolved',
  CANCELLED: 'cancelled',
  // legacy trước migrate
  REOPENED: 'in_progress', ACKNOWLEDGED: 'accepted', ACCEPTED: 'accepted',
  SCHEDULED: 'in_progress', IN_PROGRESS: 'in_progress',
  ON_HOLD: 'in_progress', PENDING_APPROVAL: 'in_progress',
  DONE: 'in_progress', RESOLVED: 'resolved', CONFIRMED: 'resolved',
};
const CATEGORY_SET = new Set<TicketCategory>(['electrical', 'plumbing', 'furniture', 'appliance', 'other']);
const PRIORITY_SET = new Set<TicketPriority>(['urgent', 'high', 'medium', 'low']);
const fmtDate = (iso?: string): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('vi-VN');
};
const dtoToLocal = (dto: MaintenanceRequestDto): MaintenanceTicket => {
  const cat = (dto.category ?? '').toLowerCase() as TicketCategory;
  const pri = (dto.priority ?? '').toLowerCase() as TicketPriority;
  return {
    id: String(dto.id),
    tenantId: String(dto.tenantId),
    code: dto.requestCode,
    title: dto.equipmentName ?? dto.description?.split('—')[0]?.trim() ?? 'Yêu cầu sửa chữa',
    description: dto.description,
    category: CATEGORY_SET.has(cat) ? cat : 'other',
    priority: PRIORITY_SET.has(pri) ? pri : 'medium',
    status: STATUS_FROM_BE[(dto.status ?? '').toUpperCase()] ?? 'pending',
    createdDate: fmtDate(dto.createdAt),
    updatedDate: fmtDate(dto.updatedAt),
    assignedTech: dto.assignedManagerName,
    etaDate: dto.scheduledDate ? fmtDate(dto.scheduledDate) : undefined,
    cost: dto.repairCost,
    resolution: dto.resolutionNote,
    propertyName: dto.propertyName,
    roomName: dto.roomName,
    relatedEquipment: dto.equipmentName,
  };
};

// ── Config ───────────────────────────────────────────────────────────────
const STATUS_CFG: Record<TicketStatus, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Chờ xử lý',   color: '#D97706', bg: '#FFFBEB' },
  accepted:    { label: 'Đã tiếp nhận', color: '#0369A1', bg: '#E0F2FE' },
  in_progress: { label: 'Đang xử lý',  color: '#7C3AED', bg: '#F3E8FF' },
  resolved:    { label: 'Hoàn thành',  color: '#16A34A', bg: '#F0FDF4' },
  cancelled:   { label: 'Đã hủy',      color: '#6B7280', bg: '#F3F4F6' },
};

const PRIORITY_CFG: Record<TicketPriority, { label: string; color: string }> = {
  urgent: { label: '🔴 Khẩn cấp', color: '#DC2626' },
  high:   { label: '🟠 Cao',       color: '#EA580C' },
  medium: { label: '🟡 Trung bình', color: '#CA8A04' },
  low:    { label: '🟢 Thấp',      color: '#16A34A' },
};

const CATEGORY_CFG: Record<TicketCategory, { label: string; icon: string }> = {
  electrical: { label: 'Điện',       icon: '⚡' },
  plumbing:   { label: 'Cấp thoát nước', icon: '🚰' },
  furniture:  { label: 'Đồ dùng/nội thất', icon: '🪑' },
  appliance:  { label: 'Thiết bị điện tử', icon: '📺' },
  other:      { label: 'Khác',       icon: '🔧' },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',         label: 'Tất cả' },
  { key: 'pending',     label: 'Chờ xử lý' },
  { key: 'in_progress', label: 'Đang xử lý' },
  { key: 'resolved',    label: 'Hoàn thành' },
  { key: 'cancelled',   label: 'Đã hủy' },
];

const isOpen = (t: MaintenanceTicket) =>
  t.status === 'pending' || t.status === 'accepted' || t.status === 'in_progress';

const fmt = (n: number | null | undefined) => (n || 0).toLocaleString('vi-VN') + 'đ';

// ── Ticket Card ──────────────────────────────────────────────────────────
const TicketCard: React.FC<{ ticket: MaintenanceTicket; onPress: () => void }> = ({ ticket, onPress }) => {
  const statusCfg   = STATUS_CFG[ticket.status];
  const priorityCfg = PRIORITY_CFG[ticket.priority];
  const catCfg      = CATEGORY_CFG[ticket.category];
  const open        = isOpen(ticket);

  return (
    <TouchableOpacity
      style={[tc.card, open && ticket.priority === 'urgent' && tc.cardUrgent]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Left accent stripe for urgent */}
      {ticket.priority === 'urgent' && open && <View style={tc.urgentStripe} />}

      {/* Top row */}
      <View style={tc.topRow}>
        <View style={tc.catBadge}>
          <Text style={tc.catIcon}>{catCfg.icon}</Text>
        </View>
        <View style={tc.topCenter}>
          <Text style={tc.title} numberOfLines={2}>{ticket.title}</Text>
          <Text style={tc.code}>{ticket.code} · {ticket.roomName}</Text>
        </View>
        <View style={[tc.statusPill, { backgroundColor: statusCfg.bg }]}>
          <Text style={[tc.statusPillText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
        </View>
      </View>

      <View style={tc.divider} />

      {/* Footer */}
      <View style={tc.footer}>
        <Text style={[tc.priority, { color: priorityCfg.color }]}>{priorityCfg.label}</Text>
        <Text style={tc.date}>
          {open && ticket.etaDate ? `ETA: ${ticket.etaDate}` : `Cập nhật: ${ticket.updatedDate}`}
        </Text>
        {ticket.assignedTech && (
          <Text style={tc.tech}>👷 {ticket.assignedTech}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const tc = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 10,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, overflow: 'hidden',
  },
  cardUrgent: { borderWidth: 1, borderColor: '#FCA5A5' },
  urgentStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: '#DC2626' },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  catBadge: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  catIcon: { fontSize: 18 },
  topCenter: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700', color: '#0F172A', lineHeight: 20, marginBottom: 2 },
  code: { fontSize: 11, color: '#64748B' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, flexShrink: 0 },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 8 },
  footer: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  priority: { fontSize: 12, fontWeight: '600' },
  date: { fontSize: 11, color: '#94A3B8' },
  tech: { fontSize: 11, color: '#64748B' },
});

// ── Main Screen ──────────────────────────────────────────────────────────
export const TenantMaintenanceScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { tenantName, roomId, roomName, propertyId, propertyName } =
    route.params as {
      tenantId: string; tenantName: string; roomId?: string; roomName: string;
      propertyId?: string; propertyName: string;
    };

  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [allTickets, setAllTickets] = useState<MaintenanceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Ticket THẬT của khách này (trước đây màn dùng MOCK_TICKETS lọc theo tenantId
  // 't1'/'t2'... nên với khách thật luôn rỗng/giả). Lưu ý: param `tenantId` từ
  // TenantListScreen thực chất là id HỢP ĐỒNG → lọc theo phòng (server-side) hoặc
  // property + tên khách (nguyên căn) thay vì tenantId.
  const load = useCallback(async () => {
    try {
      const page = await realMaintenanceService.listForManager({
        size: 200,
        ...(roomId != null && roomId !== '' ? { roomId: Number(roomId) } : {}),
        ...(roomId == null || roomId === ''
          ? propertyId != null && propertyId !== '' ? { propertyId: Number(propertyId) } : {}
          : {}),
      });
      let rows = page.content ?? [];
      // Nguyên căn (không roomId): lọc thêm theo tên khách để không lẫn ticket phòng khác.
      if ((roomId == null || roomId === '') && tenantName) {
        const name = tenantName.trim().toLowerCase();
        rows = rows.filter((d) => (d.tenantName ?? '').trim().toLowerCase() === name);
      }
      setAllTickets(rows.map(dtoToLocal));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [roomId, propertyId, tenantName]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Sort: open (urgent → high → medium → low) first, then resolved/cancelled
  const PRIORITY_ORDER: Record<TicketPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const STATUS_ORDER: Record<TicketStatus, number> = { pending: 0, accepted: 1, in_progress: 2, resolved: 3, cancelled: 4 };

  const sortedTickets = useMemo(() => [...allTickets].sort((a, b) => {
    const aOpen = isOpen(a);
    const bOpen = isOpen(b);
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    if (aOpen && bOpen) return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  }), [allTickets]);

  const filtered = useMemo(
    () => activeFilter === 'all' ? sortedTickets : sortedTickets.filter(t => t.status === activeFilter),
    [sortedTickets, activeFilter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allTickets.length };
    FILTERS.slice(1).forEach(f => { c[f.key] = allTickets.filter(t => t.status === f.key).length; });
    return c;
  }, [allTickets]);

  const stats = useMemo(() => ({
    open:        allTickets.filter(t => t.status === 'pending').length,
    inProgress:  allTickets.filter(t => t.status === 'accepted' || t.status === 'in_progress').length,
    resolved:    allTickets.filter(t => t.status === 'resolved').length,
  }), [allTickets]);

  const hasUrgent = allTickets.some(t => t.priority === 'urgent' && isOpen(t));

  return (
    <SafeAreaView style={ms.safe}>
      {/* Header */}
      <View style={ms.header}>
        <TouchableOpacity style={ms.backBtn} onPress={() => navigation.goBack()}>
          <Text style={ms.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={ms.headerCenter}>
          <Text style={ms.title} numberOfLines={1}>Bảo trì của {tenantName}</Text>
          <Text style={ms.subtitle}>{allTickets.length} yêu cầu</Text>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={t => t.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={ms.listContent}
        ListHeaderComponent={
          <>
            {/* Tenant pill */}
            <View style={ms.tenantPill}>
              <View style={ms.tenantAvatar}>
                <Text style={ms.tenantAvatarText}>{tenantName.charAt(0)}</Text>
              </View>
              <View style={ms.tenantInfo}>
                <Text style={ms.tenantName}>{tenantName}</Text>
                <Text style={ms.tenantSub}>{propertyName} · {roomName}</Text>
              </View>
            </View>

            {/* Urgent banner */}
            {hasUrgent && (
              <View style={ms.urgentBanner}>
                <Text style={ms.urgentBannerText}>🚨 Có yêu cầu khẩn cấp cần xử lý ngay!</Text>
              </View>
            )}

            {/* Stats row */}
            <View style={ms.statsRow}>
              <StatTile label="Chờ xử lý" value={stats.open} color="#D97706" bg="#FFFBEB" />
              <StatTile label="Đang xử lý" value={stats.inProgress} color="#7C3AED" bg="#F3E8FF" />
              <StatTile label="Hoàn thành" value={stats.resolved} color="#16A34A" bg="#F0FDF4" />
            </View>

            {/* Filters */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={ms.filterScroll}
              contentContainerStyle={ms.filterContent}
            >
              {FILTERS.map(f => {
                const active = activeFilter === f.key;
                const count  = counts[f.key];
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[ms.filterChip, active && ms.filterChipActive]}
                    onPress={() => setActiveFilter(f.key)}
                    activeOpacity={0.75}
                  >
                    <Text style={[ms.filterText, active && ms.filterTextActive]}>{f.label}</Text>
                    <View style={[ms.filterBadge, active && ms.filterBadgeActive]}>
                      <Text style={[ms.filterBadgeText, active && ms.filterBadgeTextActive]}>{count}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        }
        renderItem={({ item }) => (
          <TicketCard
            ticket={item}
            // Mở màn chi tiết THẬT (đủ thao tác duyệt/báo xong/review-reject) thay vì modal tóm tắt.
            onPress={() => navigation.navigate('MaintenanceTicketDetail', { ticketId: item.id })}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={ms.empty}>
              <ActivityIndicator color={Colors.primary} size="large" />
            </View>
          ) : loadError ? (
            <View style={ms.empty}>
              <Text style={ms.emptyIcon}>⚠️</Text>
              <Text style={ms.emptyTitle}>Không tải được dữ liệu</Text>
              <TouchableOpacity style={ms.retryBtn} onPress={() => { setLoading(true); load(); }}>
                <Text style={ms.retryBtnText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={ms.empty}>
              <Text style={ms.emptyIcon}>🔧</Text>
              <Text style={ms.emptyTitle}>Không có yêu cầu nào</Text>
              <Text style={ms.emptyDesc}>
                {activeFilter === 'all'
                  ? 'Khách thuê này chưa có yêu cầu bảo trì nào.'
                  : `Không có yêu cầu "${FILTERS.find(f => f.key === activeFilter)?.label}".`}
              </Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
};

const StatTile: React.FC<{ label: string; value: number; color: string; bg: string }> = ({
  label, value, color, bg,
}) => (
  <View style={[ms.statTile, { backgroundColor: bg }]}>
    <Text style={[ms.statValue, { color }]}>{value}</Text>
    <Text style={ms.statLabel}>{label}</Text>
  </View>
);

const ms = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', ...Shadow.sm },
  backBtnText: { fontSize: 28, color: '#0F172A', lineHeight: 32 },
  headerCenter: { flex: 1 },
  title: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 1 },

  listContent: { paddingHorizontal: 20, paddingBottom: 100, paddingTop: 8 },

  tenantPill: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EEF2FF', borderRadius: 12, padding: 12, marginBottom: 12 },
  tenantAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#C7D2FE', alignItems: 'center', justifyContent: 'center' },
  tenantAvatarText: { fontSize: 16, fontWeight: '800', color: '#4F46E5' },
  tenantInfo: { flex: 1 },
  tenantName: { fontSize: 14, fontWeight: '700', color: '#1E1B4B' },
  tenantSub: { fontSize: 12, color: '#4F46E5', marginTop: 1 },

  urgentBanner: { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#EF4444' },
  urgentBannerText: { fontSize: 13, fontWeight: '700', color: '#DC2626' },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statTile: { flex: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 10, color: '#64748B', marginTop: 2, textAlign: 'center', fontWeight: '500' },

  filterScroll: { flexGrow: 0, marginBottom: 12 },
  filterContent: { flexDirection: 'row', paddingTop: 4, paddingBottom: 4 },
  filterChip: {
    flexShrink: 0, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 999, backgroundColor: '#FFFFFF',
    borderWidth: 1.5, borderColor: '#E2E8F0', marginRight: 8,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  filterTextActive: { color: '#FFFFFF' },
  filterBadge: {
    backgroundColor: '#EEF2FF', borderRadius: 999,
    minWidth: 22, paddingHorizontal: 5, paddingVertical: 2,
    alignItems: 'center', justifyContent: 'center', marginLeft: 6,
  },
  filterBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  filterBadgeText: { fontSize: 11, fontWeight: '700', color: '#4F46E5', includeFontPadding: false },
  filterBadgeTextActive: { color: '#FFFFFF' },

  empty: { alignItems: 'center', paddingTop: 64, gap: 8 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#334155' },
  emptyDesc: { fontSize: 13, color: '#94A3B8', textAlign: 'center' },
  retryBtn: {
    marginTop: 8, backgroundColor: Colors.primary,
    paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12,
  },
  retryBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
