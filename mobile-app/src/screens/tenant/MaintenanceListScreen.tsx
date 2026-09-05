import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, RefreshControl, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { MaintenanceRequest, MaintenanceStatus } from '@/types';
import {
  getMaintenancePriorityLabel, getMaintenancePriorityColor, formatDate,
} from '@/utils';
import { realMaintenanceService } from '@/services/shared/maintenanceService';
import { dtoToTenantRequest } from '@/services/shared/maintenanceMappers';
import {
  MAINTENANCE_STATUS_META, MAINTENANCE_STATUS_FLOW, MAINTENANCE_CATEGORY_EMOJI, MAINTENANCE_CATEGORY_LABEL,
} from '@/constants/maintenance';
import { useMaintenanceRealtime } from '@/hooks/useBillingRealtime';

// ─── Filter tabs (redesign 01/09: open → in_repair → closed, nhánh lỗi khách) ───
type FilterKey = 'active' | 'completed' | MaintenanceStatus;
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'active',    label: 'Đang xử lý' },
  { key: 'open',      label: 'Chờ kiểm tra' },
  { key: 'in_repair', label: 'Đang sửa' },
  { key: 'completed', label: 'Hoàn tất' },
];

const COMPLETED: MaintenanceStatus[] = ['closed'];

// ─── Status config ─────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; bg: string; text: string; dot: string }> =
  Object.fromEntries(
    Object.entries(MAINTENANCE_STATUS_META).map(([k, m]) => [
      k, { label: m.label, bg: m.bg, text: m.color, dot: m.color },
    ]),
  );

const CATEGORY_EMOJI = MAINTENANCE_CATEGORY_EMOJI;

const ACTIVE: MaintenanceStatus[] =
  ['open', 'repair_scheduled', 'in_repair', 'tenant_fault', 'pending_tenant_repair', 'outstanding_damage'];
const STEP_ORDER = MAINTENANCE_STATUS_FLOW as MaintenanceStatus[];

// ─── Card ──────────────────────────────────────────────────
const RepairCard: React.FC<{ item: MaintenanceRequest; onPress: () => void }> = ({ item, onPress }) => {
  const cfg          = STATUS_CFG[item.status] ?? STATUS_CFG.pending;
  const priorityColor = getMaintenancePriorityColor(item.priority);
  const latestEntry  = item.timeline[item.timeline.length - 1];
  const stepIdx      = STEP_ORDER.indexOf(item.status as MaintenanceStatus);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.72}>

      {/* ── Top row: icon · title · status badge ── */}
      <View style={styles.cardTop}>
        <View style={[styles.catIcon, { backgroundColor: cfg.bg }]}>
          <Text style={{ fontSize: 20 }}>{(item.category && CATEGORY_EMOJI[item.category]) ?? '🔧'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.cardMeta}>{item.ticketCode} · {formatDate(item.createdAt)}</Text>
          {/* Equipment name if linked */}
          {item.equipmentName ? (
            <View style={styles.equipRow}>
              <Text style={styles.equipLabel}>Thiết bị: </Text>
              <Text style={styles.equipValue} numberOfLines={1}>{item.equipmentName}</Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
          <View style={[styles.statusDot, { backgroundColor: cfg.dot }]} />
          <Text style={[styles.statusText, { color: cfg.text }]}>{cfg.label}</Text>
        </View>
      </View>

      {/* ── Description ── */}
      <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>

      {/* ── Meta chips (priority ẩn khi manager chưa gán) ── */}
      <View style={styles.chipRow}>
        {/* Category chỉ hiện khi KHÔNG gắn thiết bị — có thiết bị thì tên thiết bị ở trên đã đủ rõ. */}
        {!item.equipmentName && !!item.category && (
          <View style={styles.categoryChip}>
            <Text style={styles.categoryChipText}>
              {CATEGORY_EMOJI[item.category] ?? '🔧'} {MAINTENANCE_CATEGORY_LABEL[item.category] ?? item.category}
            </Text>
          </View>
        )}
        {!!item.priority && (
          <View style={[styles.priorityChip, { backgroundColor: priorityColor + '18' }]}>
            <Text style={[styles.priorityText, { color: priorityColor }]}>
              {getMaintenancePriorityLabel(item.priority)}
            </Text>
          </View>
        )}
        {item.assignedTo && (
          <Text style={styles.techText}>👷 {item.assignedTo}</Text>
        )}
      </View>

      {/* ── Progress dots ── */}
      <View style={styles.progressRow}>
        {STEP_ORDER.map((s, i) => {
          const reached = i <= stepIdx;
          return (
            <React.Fragment key={s}>
              <View style={[styles.progDot, reached && { backgroundColor: Colors.primary }]} />
              {i < STEP_ORDER.length - 1 && (
                <View style={[styles.progLine, reached && i < stepIdx && { backgroundColor: Colors.primary }]} />
              )}
            </React.Fragment>
          );
        })}
      </View>

      {/* ── Latest update ── */}
      {latestEntry && (
        <View style={styles.updateBubble}>
          <Text style={styles.updateIcon}>💬</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.updateNote} numberOfLines={2}>"{latestEntry.note}"</Text>
            <Text style={styles.updateBy}>{latestEntry.updatedBy} · {formatDate(latestEntry.updatedAt)}</Text>
          </View>
        </View>
      )}

      {/* ── Cost banner for completed ── */}
      {item.status === 'closed' && item.invoiceAmount ? (
        <View style={styles.resolvedBanner}>
          <Text style={styles.resolvedText}>
            ✅ Hoàn tất · Chi phí: {item.invoiceAmount.toLocaleString('vi-VN')} đ
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

// ─── Main screen ───────────────────────────────────────────
export const MaintenanceListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [filter, setFilter] = useState<FilterKey>('active');
  const [remote, setRemote] = useState<MaintenanceRequest[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  // Lỗi API → báo rõ ràng thay vì âm thầm hiện dữ liệu seed (mock) làm user tưởng
  // ticket của mình biến mất / thấy ticket "Nguyễn Văn A" lạ hoắc.
  const [loadError, setLoadError] = useState(false);

  const silentLoad = React.useCallback(() => {
    let active = true;
    realMaintenanceService.getMyRequests()
      .then(page => {
        if (!active) return;
        setRemote(page.content.map(dtoToTenantRequest));
        setLoadError(false);
      })
      .catch(() => {
        if (!active) return;
        // Chỉ báo lỗi khi chưa từng tải được gì — đã có dữ liệu thì giữ nguyên.
        setRemote(prev => {
          if (prev == null) setLoadError(true);
          return prev;
        });
      });
    return () => { active = false; };
  }, []);

  useFocusEffect(React.useCallback(() => silentLoad(), [silentLoad]));

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    realMaintenanceService.getMyRequests()
      .then(page => { setRemote(page.content.map(dtoToTenantRequest)); setLoadError(false); })
      .catch(() => { /* giữ dữ liệu hiện tại */ })
      .finally(() => setRefreshing(false));
  }, []);

  // Danh sách tự cập nhật khi có ticket đổi trạng thái (manager duyệt/báo sửa xong...)
  // — không kéo-làm-mới lộ liễu như onRefresh, chỉ nạp ngầm.
  useMaintenanceRealtime({ onRefresh: silentLoad });

  const all = remote ?? [];

  const active   = all.filter(r => ACTIVE.includes(r.status as MaintenanceStatus));
  const filtered =
    filter === 'active'    ? active
    : filter === 'completed' ? all.filter(r => COMPLETED.includes(r.status as MaintenanceStatus))
    : all.filter(r => r.status === filter);

  const pendingCount     = all.filter(r => r.status === 'open').length;
  const inProgressCount  = active.filter(r => r.status !== 'open').length;
  const resolvedThisMonth = all.filter(r => COMPLETED.includes(r.status as MaintenanceStatus)).length;

  return (
    <SafeAreaView style={styles.safe}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Theo dõi sửa chữa</Text>
          <Text style={styles.subtitle}>Theo dõi tiến độ bảo trì và sửa chữa phòng</Text>
        </View>
        <TouchableOpacity style={styles.historyBtn} onPress={() => navigation.navigate('MaintenanceHistory')}>
          <Text style={styles.historyBtnText}>Lịch sử</Text>
        </TouchableOpacity>
      </View>

      {/* ── Summary bar ── */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: Colors.warningLight }]}>
          <Text style={[styles.summaryNum, { color: Colors.warning }]}>{pendingCount}</Text>
          <Text style={[styles.summaryLbl, { color: Colors.warning }]}>Chờ xử lý</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: Colors.primaryBg }]}>
          <Text style={[styles.summaryNum, { color: Colors.primary }]}>{inProgressCount}</Text>
          <Text style={[styles.summaryLbl, { color: Colors.primary }]}>Đang sửa</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: Colors.successLight }]}>
          <Text style={[styles.summaryNum, { color: Colors.success }]}>{resolvedThisMonth}</Text>
          <Text style={[styles.summaryLbl, { color: Colors.success }]}>Hoàn tất</Text>
        </View>
      </View>

      {/*
        ── Thẻ "Đi đến Thiết bị phòng" đã BỎ 01/09/2026 ──────────────────────
        Nó dẫn tới đúng `RoomEquipment` mà nút "Chọn thiết bị từ danh sách" trong FAB
        đã dẫn tới. Cộng với nút QR ở trạng thái rỗng, màn này có BA lối vào cho cùng
        một việc "báo hỏng" — và khi mở FAB trên danh sách rỗng thì nút QR của trạng
        thái rỗng với mục QR trong FAB nằm ĐÈ LÊN NHAU trên màn hình.

        Nay chỉ còn MỘT đường: menu của FAB. Nó là đường duy nhất phân loại đúng cả ba
        tình huống (quét được QR · không quét được thì chọn từ danh sách · sự cố không
        gắn thiết bị nào), nên giữ nó và bỏ hai lối tắt kia.
      */}

      {/* ── Filter chips ── */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── List ── */}
      <FlatList
        data={filtered}
        keyExtractor={r => r.id}
        renderItem={({ item }) => (
          <RepairCard
            item={item}
            onPress={() => navigation.navigate('MaintenanceDetail', { request: item })}
          />
        )}
        contentContainerStyle={styles.list}
        style={styles.requestList}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
        ListEmptyComponent={
          loadError ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>⚠️</Text>
              <Text style={styles.emptyTitle}>Không tải được danh sách</Text>
              <Text style={styles.emptyDesc}>Kiểm tra kết nối mạng rồi kéo xuống để thử lại.</Text>
              <TouchableOpacity style={styles.emptyScanBtn} onPress={onRefresh}>
                <Text style={styles.emptyScanText}>🔄 Thử lại</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🔧</Text>
              <Text style={styles.emptyTitle}>Không có yêu cầu nào đang hoạt động</Text>
              <Text style={styles.emptyDesc}>
                Có gì hỏng thì báo ở đây — quét mã QR dán trên thiết bị, chọn từ danh sách
                thiết bị trong phòng, hoặc mô tả sự cố khác.
              </Text>
              {/*
                Mở ĐÚNG menu của FAB thay vì đi thẳng vào màn quét.
                Nút cũ ghi "📷 Quét QR thiết bị" nên đẩy mọi người vào một lối duy nhất —
                trong khi hỏng sàn, tường, cửa thì không có QR nào để quét, và thiết bị
                mất tem cũng vậy. Một nút, ba lựa chọn, khách tự chọn đúng việc của mình.
              */}
              <TouchableOpacity
                style={styles.emptyScanBtn}
                onPress={() => setFabOpen(true)}
              >
                <Text style={styles.emptyScanText}>＋ Báo hỏng</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />

      {/* ── FAB: Tạo mới ── */}
      {fabOpen && (
        <Pressable style={styles.fabBackdrop} onPress={() => setFabOpen(false)} />
      )}
      <View style={styles.fabWrap} pointerEvents="box-none">
        {fabOpen && (
          <>
            <TouchableOpacity
              style={styles.fabOption}
              activeOpacity={0.8}
              onPress={() => { setFabOpen(false); navigation.navigate('Scan'); }}
            >
              <Text style={styles.fabOptionLabel}>Quét mã QR thiết bị</Text>
              <View style={styles.fabOptionIcon}><Text style={{ fontSize: 15 }}>📷</Text></View>
            </TouchableOpacity>
            {/* Sự cố liên quan thiết bị nhưng không có/không quét được QR — chọn đúng
                thiết bị từ danh sách thay vì gõ tay tên thiết bị (feedback demo). */}
            <TouchableOpacity
              style={styles.fabOption}
              activeOpacity={0.8}
              onPress={() => { setFabOpen(false); navigation.navigate('RoomEquipment'); }}
            >
              <Text style={styles.fabOptionLabel}>Chọn thiết bị từ danh sách</Text>
              <View style={styles.fabOptionIcon}><Text style={{ fontSize: 15 }}>📦</Text></View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.fabOption}
              activeOpacity={0.8}
              onPress={() => { setFabOpen(false); navigation.navigate('MaintenanceCreate'); }}
            >
              <Text style={styles.fabOptionLabel}>Sự cố khác (sàn, tường, cửa...)</Text>
              <View style={styles.fabOptionIcon}><Text style={{ fontSize: 15 }}>📝</Text></View>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity
          style={styles.fab}
          activeOpacity={0.85}
          onPress={() => setFabOpen(o => !o)}
        >
          <Text style={styles.fabIcon}>{fabOpen ? '×' : '+'}</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
};

// ─── Styles ────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.sm,
  },
  title:    { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  historyBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: Colors.white, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  historyBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  // ── FAB (Tạo mới) ──
  fabBackdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
  },
  fabWrap: {
    position: 'absolute', right: Spacing.lg, bottom: Spacing.xl,
    alignItems: 'flex-end',
  },
  fabOption: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.white, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm, ...Shadow.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  fabOptionLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  fabOptionIcon: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  fab: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', ...Shadow.md,
  },
  fabIcon: { fontSize: 26, fontWeight: '700', color: Colors.white, marginTop: -2 },

  summaryRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.sm },
  summaryCard: { flex: 1, borderRadius: BorderRadius.lg, padding: Spacing.sm, alignItems: 'center' },
  summaryNum:  { fontSize: 22, fontWeight: '800' },
  summaryLbl:  { fontSize: 10, fontWeight: '600', marginTop: 1 },

  filterScroll: { flexGrow: 0, flexShrink: 0, maxHeight: 48 },
  filterRow: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 7,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border,
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText:       { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },

  requestList: { flex: 1 },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },

  // ── Card ──
  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    padding: Spacing.base, ...Shadow.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
  catIcon: { width: 44, height: 44, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  cardMeta:  { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  equipRow:  { flexDirection: 'row', marginTop: 3 },
  equipLabel:{ fontSize: 11, color: Colors.textMuted },
  equipValue:{ fontSize: 11, fontWeight: '600', color: Colors.textSecondary, flex: 1 },

  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 4,
    borderRadius: BorderRadius.full, flexShrink: 0,
  },
  statusDot:  { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, fontWeight: '700' },

  cardDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: Spacing.sm },

  chipRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  priorityChip: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  priorityText: { fontSize: 11, fontWeight: '700' },
  categoryChip: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full, backgroundColor: Colors.divider },
  categoryChipText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  techText:     { fontSize: 12, color: Colors.textSecondary },
  etaText:      { fontSize: 12, color: Colors.primary, fontWeight: '600' },

  // Progress dots
  progressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  progDot:  { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.border },
  progLine: { flex: 1, height: 2, backgroundColor: Colors.border },

  // Latest update bubble
  updateBubble: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    padding: Spacing.sm, marginTop: 2,
  },
  updateIcon: { fontSize: 14, marginTop: 1 },
  updateNote: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, fontStyle: 'italic' },
  updateBy:   { fontSize: 10, color: Colors.textMuted, marginTop: 2 },

  // Resolved banner
  resolvedBanner: {
    backgroundColor: Colors.successLight, borderRadius: BorderRadius.md,
    padding: Spacing.sm, marginTop: Spacing.sm,
  },
  resolvedText: { fontSize: 12, fontWeight: '600', color: Colors.success },

  // Empty
  empty: { paddingTop: 64, alignItems: 'center', paddingHorizontal: Spacing.xl },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.base },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm, textAlign: 'center' },
  emptyDesc:  { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.lg },
  emptyScanBtn: {
    backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, ...Shadow.sm,
  },
  emptyScanText: { fontSize: 14, fontWeight: '700', color: Colors.white },

});
