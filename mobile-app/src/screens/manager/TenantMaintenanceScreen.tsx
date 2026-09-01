import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Colors, Shadow } from '@/constants';
import { realMaintenanceService } from '@/services/shared/maintenanceService';
import { dtoToTicket } from '@/services/shared/maintenanceMappers';
import { MAINTENANCE_STATUS_META, MAINTENANCE_CATEGORY_EMOJI } from '@/constants/maintenance';
import type { MaintenanceTicket, TicketStatus, TicketCategory, TicketPriority } from '@/store/maintenanceStore';

// ── Config — khớp BuildingMaintenanceScreen.tsx để 2 màn quản lý cùng bộ nhãn ──
const STATUS_CFG = MAINTENANCE_STATUS_META;
const CATEGORY_ICON = MAINTENANCE_CATEGORY_EMOJI;

const PRIORITY_CFG: Record<TicketPriority, { label: string; color: string }> = {
  urgent: { label: '🚨 Khẩn cấp', color: '#EF4444' },
  high:   { label: '🔴 Cao',       color: '#F97316' },
  medium: { label: '🟡 Trung bình', color: '#F59E0B' },
  low:    { label: '🟢 Thấp',      color: '#10B981' },
};

// Gom 6 status thật về 4 nhóm cho filter/stats (khớp BuildingMaintenanceScreen:
// in_progress = APPROVED + WAITING_TENANT_CONFIRM + REJECTED).
type StatusBucket = 'pending' | 'in_progress' | 'resolved' | 'cancelled';
const bucketOf = (st: TicketStatus): StatusBucket =>
  st === 'open' ? 'pending'
    : st === 'closed' ? 'resolved'
    : st === 'cancelled' ? 'cancelled'
    : 'in_progress';

type FilterKey = 'all' | StatusBucket;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',         label: 'Tất cả' },
  { key: 'pending',     label: '⏳ Chờ' },
  { key: 'in_progress', label: '🔧 Đang xử lý' },
  { key: 'resolved',    label: '✅ Hoàn tất' },
  { key: 'cancelled',   label: '✕ Đã hủy' },
];

const isOpen = (t: MaintenanceTicket) => bucketOf(t.status) === 'pending' || bucketOf(t.status) === 'in_progress';

const fmtDate = (iso?: string): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('vi-VN');
};

// ── Ticket Card ──────────────────────────────────────────────────────────
const TicketCard: React.FC<{ ticket: MaintenanceTicket; onPress: () => void }> = ({ ticket, onPress }) => {
  const statusCfg = STATUS_CFG[ticket.status];
  const priCfg    = ticket.priority ? PRIORITY_CFG[ticket.priority] : undefined;
  const catIcon   = ticket.category ? CATEGORY_ICON[ticket.category] : '🏷';
  const open      = isOpen(ticket);
  const urgentOpen = open && ticket.priority === 'urgent';

  return (
    <TouchableOpacity
      style={[tc.card, urgentOpen && tc.cardUrgent]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {urgentOpen && <View style={tc.urgentStripe} />}

      <View style={tc.topRow}>
        <View style={tc.catBadge}>
          <Text style={tc.catIcon}>{catIcon}</Text>
        </View>
        <View style={tc.topCenter}>
          <Text style={tc.title} numberOfLines={2}>{ticket.title}</Text>
          <Text style={tc.code}>{ticket.ticketCode} · {ticket.roomName}</Text>
        </View>
        <View style={[tc.statusPill, { backgroundColor: statusCfg.bg }]}>
          <Text style={[tc.statusPillText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
        </View>
      </View>

      <View style={tc.divider} />

      <View style={tc.footer}>
        {priCfg && <Text style={[tc.priority, { color: priCfg.color }]}>{priCfg.label}</Text>}
        <Text style={tc.date}>Cập nhật: {fmtDate(ticket.updatedAt)}</Text>
        {ticket.assignedTo && (
          <Text style={tc.tech}>👷 {ticket.assignedTo}</Text>
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

  // Param `tenantId` từ TenantListScreen thực chất là id HỢP ĐỒNG → lọc theo phòng
  // (server-side) hoặc property + tên khách (nguyên căn) thay vì tenantId.
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
      setAllTickets(rows.map(dtoToTicket));
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
  const BUCKET_ORDER: Record<StatusBucket, number> = { pending: 0, in_progress: 1, resolved: 2, cancelled: 3 };

  const sortedTickets = useMemo(() => [...allTickets].sort((a, b) => {
    const aOpen = isOpen(a);
    const bOpen = isOpen(b);
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    if (aOpen && bOpen) {
      const ap = a.priority ? PRIORITY_ORDER[a.priority] : 99;
      const bp = b.priority ? PRIORITY_ORDER[b.priority] : 99;
      return ap - bp;
    }
    return BUCKET_ORDER[bucketOf(a.status)] - BUCKET_ORDER[bucketOf(b.status)];
  }), [allTickets]);

  const filtered = useMemo(
    () => activeFilter === 'all' ? sortedTickets : sortedTickets.filter(t => bucketOf(t.status) === activeFilter),
    [sortedTickets, activeFilter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allTickets.length };
    FILTERS.slice(1).forEach(f => { c[f.key] = allTickets.filter(t => bucketOf(t.status) === f.key).length; });
    return c;
  }, [allTickets]);

  const stats = useMemo(() => ({
    open:       counts.pending ?? 0,
    inProgress: counts.in_progress ?? 0,
    resolved:   counts.resolved ?? 0,
  }), [counts]);

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
