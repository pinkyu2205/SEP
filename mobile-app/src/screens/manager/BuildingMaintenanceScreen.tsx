import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ScrollView, TextInput, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import type { MaintenanceTicket, TicketStatus, TicketCategory } from '@/store/maintenanceStore';
import { realMaintenanceService } from '@/services/shared/maintenanceService';
import { dtoToTicket } from '@/services/shared/maintenanceMappers';
import { MAINTENANCE_STATUS_META } from '@/constants/maintenance';

// ── Config ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; bg: string; icon: string }> =
  MAINTENANCE_STATUS_META;

const PRIORITY_CONFIG = {
  urgent: { label: '🚨 Khẩn cấp',  color: '#EF4444', bg: '#FEF2F2' },
  high:   { label: '🔴 Cao',        color: '#F97316', bg: '#FFF7ED' },
  medium: { label: '🟡 Trung bình', color: '#F59E0B', bg: '#FFFBEB' },
  low:    { label: '🟢 Thấp',       color: '#10B981', bg: '#F0FDF4' },
} as const;

const CATEGORY_CONFIG: Record<TicketCategory, { label: string; icon: string }> = {
  appliance:  { label: 'Trang thiết bị', icon: '📺' },
  furniture:  { label: 'Nội thất',       icon: '🪑' },
  plumbing:   { label: 'Nước',           icon: '🚰' },
  electrical: { label: 'Điện',           icon: '⚡' },
};

// Quick action trên card: OPEN → mở màn chi tiết để duyệt (duyệt BẮT BUỘC chọn
// category, hoặc báo lỗi khách — không xử lý nhanh ngay trên card được).
const QUICK_ACTION_LABEL: Partial<Record<TicketStatus, string>> = {
  open: '✅ Xử lý yêu cầu',
  repair_scheduled: '🔧 Bắt đầu sửa',
};

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

// Gom status về 4 nhóm cho filter chips/stats (khớp dashboard BE:
// inProgress = APPROVED + WAITING_TENANT_CONFIRM + REJECTED).
type StatusBucket = 'pending' | 'in_progress' | 'resolved' | 'cancelled';
const bucketOf = (st: TicketStatus): StatusBucket =>
  st === 'open' ? 'pending'
    : st === 'closed' ? 'resolved'
    : st === 'cancelled' ? 'cancelled'
    : 'in_progress';

type StatusFilter   = 'all' | StatusBucket;
type CategoryFilter = 'all' | TicketCategory;

// ── Ticket Card ──────────────────────────────────────────────────────────────

const TicketCard: React.FC<{
  ticket:   MaintenanceTicket;
  onPress:  () => void;
  onAction: (ticket: MaintenanceTicket) => void;
}> = ({ ticket, onPress, onAction }) => {
  const cfg        = STATUS_CONFIG[ticket.status];
  // priority/category null khi ticket chưa duyệt → ẩn badge tương ứng.
  const priCfg     = ticket.priority ? PRIORITY_CONFIG[ticket.priority] : undefined;
  const catCfg     = ticket.category ? CATEGORY_CONFIG[ticket.category] : undefined;
  const isUrgentOpen = ticket.priority === 'urgent'
    && bucketOf(ticket.status) !== 'resolved'
    && bucketOf(ticket.status) !== 'cancelled';
  const nextAct    = QUICK_ACTION_LABEL[ticket.status] ?? null;

  return (
    <TouchableOpacity
      style={[s.card, isUrgentOpen && s.cardUrgent]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Row 1: Code · Priority · Status */}
      <View style={s.cardRow1}>
        <Text style={s.cardCode}>{ticket.ticketCode}</Text>
        {priCfg && (
          <View style={[s.priBadge, { backgroundColor: priCfg.bg }]}>
            <Text style={[s.priBadgeText, { color: priCfg.color }]}>{priCfg.label}</Text>
          </View>
        )}
        <View style={s.row1Spacer} />
        <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
          <Text style={s.statusIcon}>{cfg.icon}</Text>
          <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      {/* Row 2: Title */}
      <Text style={[s.cardTitle, isUrgentOpen && { color: Colors.error }]} numberOfLines={1}>
        {ticket.title}
      </Text>

      {/* Row 3: Meta */}
      <View style={s.cardMeta}>
        <Text style={s.metaItem}>🚪 {ticket.propertyType === 'WHOLE_HOUSE' ? 'Toàn bộ nhà' : ticket.roomName}</Text>
        <Text style={s.metaDot}>·</Text>
        <Text style={s.metaItem}>👤 {ticket.tenantName}</Text>
        <Text style={s.metaDot}>·</Text>
        <Text style={s.metaItem}>{catCfg ? `${catCfg.icon} ${catCfg.label}` : '🏷 Chưa phân loại'}</Text>
      </View>

      {/* Row 4: Date + assigned */}
      <View style={s.cardFooter}>
        <Text style={s.cardDate}>📅 {ticket.createdAt}</Text>
        {ticket.assignedTo && (
          <Text style={s.cardAssigned} numberOfLines={1}>🔧 {ticket.assignedTo.split(' ')[0]}</Text>
        )}
        {/* `!== undefined` KHÔNG chắn được null — BE trả null cho phiếu chưa nhập chi phí,
            và null lọt qua điều kiện này rồi nổ ở toLocaleString. Dùng `!= null` chắn cả hai. */}
        {ticket.invoiceAmount != null && ticket.status === 'closed' && (
          <Text style={s.cardCost}>{Number(ticket.invoiceAmount).toLocaleString('vi-VN')}đ</Text>
        )}
      </View>

      {/* Quick action button */}
      {nextAct && (
        <TouchableOpacity
          style={[s.actionBtn, isUrgentOpen && s.actionBtnUrgent]}
          onPress={() => onAction(ticket)}
          activeOpacity={0.75}
        >
          <Text style={[s.actionBtnText, isUrgentOpen && { color: Colors.error }]}>
            {nextAct} →
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};

// ── Main Screen ──────────────────────────────────────────────────────────────

export const BuildingMaintenanceScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route      = useRoute<any>();
  const { propertyId } = route.params as {
    propertyId: string; propertyName?: string; propertyType?: string;
    property?: { propertyType?: string };
  };
  // Loại nhà lấy từ params (mọi màn gọi tới đây đều biết) — trước đây tra bảng mock
  // MANAGED_PROPERTIES bằng id thật nên luôn trượt, mặc định thành "theo phòng".
  const isWholeHouse =
    (route.params?.propertyType ?? route.params?.property?.propertyType) === 'WHOLE_HOUSE';

  const propertyName = route.params?.propertyName || '';

  // Ticket THẬT của nhà này — trước đây màn đọc store mock (useTickets) nên drill từ
  // dashboard thật vào lại thấy dữ liệu giả. Filter propertyId server-side; id không
  // phải số (dữ liệu mock cũ) thì lấy hết rồi lọc client theo tên nhà.
  const [allTickets, setAllTickets] = useState<MaintenanceTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const numericId = Number(propertyId);
      const page = await realMaintenanceService.listForManager({
        size: 200,
        ...(Number.isFinite(numericId) ? { propertyId: numericId } : {}),
      });
      let rows = page.content ?? [];
      if (!Number.isFinite(numericId) && propertyName) {
        rows = rows.filter((d) => d.propertyName === propertyName);
      }
      setAllTickets(rows.map(dtoToTicket));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [propertyId, propertyName]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const [search,         setSearch]         = useState('');
  const [statusFilter,   setStatusFilter]   = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const filteredTickets = useMemo(() => {
    let list = allTickets;
    if (statusFilter !== 'all')   list = list.filter(t => bucketOf(t.status) === statusFilter);
    if (categoryFilter !== 'all') list = list.filter(t => t.category === categoryFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.tenantName.toLowerCase().includes(q) ||
        t.roomName.toLowerCase().includes(q) ||
        t.ticketCode.toLowerCase().includes(q),
      );
    }
    // Ticket chưa duyệt (priority null) xếp cuối nhóm ưu tiên (9).
    return [...list].sort((a, b) =>
      (a.priority ? PRIORITY_ORDER[a.priority] : 9) - (b.priority ? PRIORITY_ORDER[b.priority] : 9));
  }, [allTickets, statusFilter, categoryFilter, search]);

  const stats = useMemo(() => {
    const open = allTickets.filter(t => bucketOf(t.status) === 'pending' || bucketOf(t.status) === 'in_progress');
    return {
      total:    allTickets.length,
      open:     open.length,
      urgent:   open.filter(t => t.priority === 'urgent').length,
      pending:  allTickets.filter(t => bucketOf(t.status) === 'pending').length,
      inProg:   allTickets.filter(t => bucketOf(t.status) === 'in_progress').length,
      resolved: allTickets.filter(t => bucketOf(t.status) === 'resolved').length,
    };
  }, [allTickets]);

  const doneRate = stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 100;
  const barColor = stats.urgent > 0 ? Colors.error : doneRate >= 70 ? Colors.success : Colors.warning;

  // Duyệt BẮT BUỘC chọn category (flow 17/07 chiều) → quick action mở màn chi tiết
  // (có picker phân loại) thay vì gọi approve trực tiếp.
  const handleQuickAction = (ticket: MaintenanceTicket) => {
    navigation.navigate('MaintenanceTicketDetail', { ticketId: ticket.id });
  };

  const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
    { id: 'all',         label: 'Tất cả' },
    { id: 'pending',     label: '⏳ Chờ' },
    { id: 'in_progress', label: '🔧 Đang xử lý' },
    { id: 'resolved',    label: '✅ Hoàn tất' },
    { id: 'cancelled',   label: '✕ Đã hủy' },
  ];

  const CAT_FILTERS: { id: CategoryFilter; label: string }[] = [
    { id: 'all',        label: 'Tất cả' },
    { id: 'appliance',  label: '📺 Thiết bị' },
    { id: 'furniture',  label: '🪑 Nội thất' },
    { id: 'plumbing',   label: '🚰 Nước' },
    { id: 'electrical', label: '⚡ Điện' },
  ];

  return (
    <SafeAreaView style={s.safe}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{propertyName}</Text>
          <Text style={s.headerSub}>{isWholeHouse ? 'Bảo trì nhà nguyên căn' : 'Bảo trì theo phòng'} · {allTickets.length} ticket tháng này</Text>
        </View>
      </View>

      {/* ── Summary card ─────────────────────────────────────────── */}
      <View style={s.summaryCard}>
        <View style={s.summaryRow}>
          {[
            { num: stats.open,     label: 'Đang mở',  color: stats.open > 0 ? Colors.warning : Colors.textMuted },
            { num: stats.urgent,   label: 'Khẩn cấp', color: stats.urgent > 0 ? Colors.error : Colors.textMuted },
            { num: stats.inProg,   label: 'Xử lý',    color: stats.inProg > 0 ? '#8B5CF6' : Colors.textMuted },
            { num: stats.resolved, label: 'Hoàn tất', color: Colors.success },
          ].map((item, i, arr) => (
            <React.Fragment key={item.label}>
              <View style={s.summaryStat}>
                <Text style={[s.summaryNum, { color: item.color }]}>{item.num}</Text>
                <Text style={s.summaryLbl}>{item.label}</Text>
              </View>
              {i < arr.length - 1 && <View style={s.summarySep} />}
            </React.Fragment>
          ))}
        </View>
        <View style={s.progRow}>
          <View style={s.progBg}>
            <View style={[s.progFill, { width: `${doneRate}%` as any, backgroundColor: barColor }]} />
          </View>
          <Text style={[s.progPct, { color: barColor }]}>{doneRate}% hoàn tất</Text>
        </View>
      </View>

      {/* ── Search ───────────────────────────────────────────────── */}
      <View style={s.searchBar}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput}
          placeholder={isWholeHouse ? 'Tìm ticket, người đại diện, thiết bị...' : 'Tìm ticket, phòng, khách thuê...'}
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={s.searchClear}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Status filter chips ──────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.filterRow} contentContainerStyle={s.filterContent}>
        {STATUS_FILTERS.map(f => (
          <TouchableOpacity
            key={f.id}
            style={[s.chip, statusFilter === f.id && s.chipActive]}
            onPress={() => setStatusFilter(f.id)}
          >
            <Text style={[s.chipText, statusFilter === f.id && s.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Category filter chips ────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.filterRow2} contentContainerStyle={s.filterContent}>
        {CAT_FILTERS.map(f => (
          <TouchableOpacity
            key={f.id}
            style={[s.chipSm, categoryFilter === f.id && s.chipSmActive]}
            onPress={() => setCategoryFilter(f.id)}
          >
            <Text style={[s.chipSmText, categoryFilter === f.id && s.chipSmTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Ticket list ──────────────────────────────────────────── */}
      <FlatList
        data={filteredTickets}
        keyExtractor={i => i.id}
        renderItem={({ item }) => (
          <TicketCard
            ticket={item}
            onPress={() => navigation.navigate('MaintenanceTicketDetail', { ticketId: item.id })}
            onAction={handleQuickAction}
          />
        )}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          loading ? (
            <View style={s.emptyState}>
              <ActivityIndicator color={Colors.primary} size="large" />
            </View>
          ) : loadError ? (
            <View style={s.emptyState}>
              <Text style={{ fontSize: 40 }}>⚠️</Text>
              <Text style={s.emptyText}>Không tải được danh sách ticket</Text>
              <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); load(); }}>
                <Text style={s.retryBtnText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.emptyState}>
              <Text style={{ fontSize: 40 }}>🔧</Text>
              <Text style={s.emptyText}>Không có ticket phù hợp</Text>
              <Text style={s.emptySubText}>Thử thay đổi bộ lọc hoặc tìm kiếm</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
};

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.white,
  },
  backBtn:    { padding: 4 },
  backIcon:   { fontSize: 30, color: Colors.primary, fontWeight: '300', lineHeight: 34 },
  headerTitle:{ fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  headerSub:  { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },

  // Summary card (compact)
  summaryCard: {
    backgroundColor: Colors.white, marginHorizontal: Spacing.base, marginTop: 10,
    borderRadius: BorderRadius.xl, paddingVertical: 10, paddingHorizontal: Spacing.base,
    ...Shadow.sm, borderWidth: 1, borderColor: Colors.border, marginBottom: 10,
  },
  summaryRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  summaryStat: { flex: 1, alignItems: 'center' },
  summaryNum:  { fontSize: 17, fontWeight: '800' },
  summaryLbl:  { fontSize: 9, color: Colors.textMuted, marginTop: 1, textAlign: 'center' },
  summarySep:  { width: 1, height: 26, backgroundColor: Colors.divider },
  progRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  progBg:      { flex: 1, height: 5, backgroundColor: Colors.divider, borderRadius: 2.5 },
  progFill:    { height: 5, borderRadius: 2.5 },
  progPct:     { fontSize: 10, fontWeight: '700', minWidth: 72 },

  // Search bar (compact)
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: 7,
    ...Shadow.sm, marginHorizontal: Spacing.base, marginBottom: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchIcon:  { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  searchClear: { fontSize: 13, color: Colors.textMuted, fontWeight: '600', padding: 4 },

  // Filter chips
  filterRow:    { flexGrow: 0, marginBottom: 4 },
  filterRow2:   { flexGrow: 0, marginBottom: 8 },
  filterContent:{ paddingHorizontal: Spacing.base, paddingVertical: 2, gap: 6 },

  chip:         { height: 30, justifyContent: 'center', paddingHorizontal: 12, borderRadius: BorderRadius.full, backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.border },
  chipActive:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText:     { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive:{ color: Colors.white },

  chipSm:        { height: 26, justifyContent: 'center', paddingHorizontal: 10, borderRadius: BorderRadius.full, backgroundColor: Colors.divider },
  chipSmActive:  { backgroundColor: Colors.primaryBg },
  chipSmText:    { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },
  chipSmTextActive:{ color: Colors.primary, fontWeight: '700' },

  // List
  listContent: { paddingHorizontal: Spacing.base, paddingTop: 2, paddingBottom: 100 },

  // Ticket card (compact)
  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: 10, ...Shadow.sm, borderWidth: 1, borderColor: Colors.border,
  },
  cardUrgent: { borderLeftWidth: 3, borderLeftColor: Colors.error, borderColor: Colors.error + '40' },

  cardRow1:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  row1Spacer: { flex: 1 },
  cardCode:   { fontSize: 10, fontWeight: '700', color: Colors.primary, letterSpacing: 0.4 },
  priBadge:   { paddingHorizontal: 5, paddingVertical: 2, borderRadius: BorderRadius.full },
  priBadgeText:{ fontSize: 9, fontWeight: '700' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 7, paddingVertical: 2, borderRadius: BorderRadius.full },
  statusIcon:  { fontSize: 9 },
  statusText:  { fontSize: 9, fontWeight: '700' },

  cardTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },

  cardMeta:  { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 4, gap: 2 },
  metaItem:  { fontSize: 10, color: Colors.textSecondary },
  metaDot:   { fontSize: 10, color: Colors.textMuted, marginHorizontal: 2 },

  cardFooter:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  cardDate:     { fontSize: 10, color: Colors.textMuted },
  cardAssigned: { fontSize: 10, color: Colors.textSecondary, flex: 1 },
  cardCost:     { fontSize: 11, fontWeight: '700', color: Colors.warning },

  actionBtn:      { marginTop: 7, backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md, paddingVertical: 6, paddingHorizontal: Spacing.md },
  actionBtnUrgent:{ backgroundColor: Colors.errorLight },
  actionBtnText:  { fontSize: 11, fontWeight: '700', color: Colors.primary, textAlign: 'center' },

  // Empty state
  emptyState:   { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText:    { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  emptySubText: { fontSize: 12, color: Colors.textMuted },
  retryBtn: {
    marginTop: 4, backgroundColor: Colors.primary,
    paddingHorizontal: 24, paddingVertical: 9, borderRadius: BorderRadius.lg,
  },
  retryBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
});
