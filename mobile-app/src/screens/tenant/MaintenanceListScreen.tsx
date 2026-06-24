import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { MaintenanceRequest, MaintenanceStatus } from '../../types';
import {
  getMaintenancePriorityLabel, getMaintenancePriorityColor, formatDate,
} from '../../utils';
import { useTenantRequests } from '../../store/maintenanceStore';
import { realMaintenanceService } from '../../services/maintenanceService.real';
import { dtoToTenantRequest } from '../../services/maintenanceMappers';

// ─── Filter tabs ───────────────────────────────────────────
const FILTERS: { key: 'all' | MaintenanceStatus; label: string }[] = [
  { key: 'all',         label: 'Tất cả'       },
  { key: 'pending',     label: 'Chờ xử lý'    },
  { key: 'accepted',    label: 'Đã tiếp nhận' },
  { key: 'in_progress', label: 'Đang sửa'     },
];

// ─── Status config ─────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  pending:     { label: 'Chờ xử lý',    bg: Colors.warningLight, text: Colors.warning, dot: Colors.warning  },
  accepted:    { label: 'Đã tiếp nhận', bg: Colors.infoLight,    text: Colors.info,    dot: Colors.info     },
  in_progress: { label: 'Đang sửa',     bg: Colors.primaryBg,    text: Colors.primary, dot: Colors.primary  },
  resolved:    { label: 'Hoàn tất',     bg: Colors.successLight,  text: Colors.success, dot: Colors.success  },
  cancelled:   { label: 'Đã hủy',       bg: Colors.divider,      text: Colors.textMuted, dot: Colors.textMuted },
};

const CATEGORY_EMOJI: Record<string, string> = {
  electrical: '⚡', plumbing: '🚰', furniture: '🪑', appliance: '📺', other: '🔧',
};

const ACTIVE: MaintenanceStatus[] = ['pending', 'accepted', 'in_progress'];
const STEP_ORDER: MaintenanceStatus[] = ['pending', 'accepted', 'in_progress', 'resolved'];

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
          <Text style={{ fontSize: 20 }}>{CATEGORY_EMOJI[item.category] ?? '🔧'}</Text>
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

      {/* ── Meta chips ── */}
      <View style={styles.chipRow}>
        <View style={[styles.priorityChip, { backgroundColor: priorityColor + '18' }]}>
          <Text style={[styles.priorityText, { color: priorityColor }]}>
            {getMaintenancePriorityLabel(item.priority)}
          </Text>
        </View>
        {item.assignedTo && (
          <Text style={styles.techText}>👷 {item.assignedTo}</Text>
        )}
        {item.estimatedCompletionDate && item.status === 'in_progress' && (
          <Text style={styles.etaText}>⏱ {formatDate(item.estimatedCompletionDate)}</Text>
        )}
      </View>

      {/* ── Progress dots ── */}
      <View style={styles.progressRow}>
        {STEP_ORDER.map((s, i) => {
          const reached = i <= stepIdx;
          return (
            <React.Fragment key={s}>
              <View style={[styles.progDot, reached && { backgroundColor: Colors.primary }]} />
              {i < 3 && (
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

      {/* ── Cost banner for resolved ── */}
      {item.status === 'resolved' && item.repairCost ? (
        <View style={styles.resolvedBanner}>
          <Text style={styles.resolvedText}>
            ✅ Hoàn tất · Chi phí: {item.repairCost.toLocaleString('vi-VN')} đ
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
};

// ─── Main screen ───────────────────────────────────────────
export const MaintenanceListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [filter, setFilter] = useState<'all' | MaintenanceStatus>('all');
  const mockAll = useTenantRequests();
  const [remote, setRemote] = useState<MaintenanceRequest[] | null>(null);

  // Lấy danh sách thật từ BE; nếu lỗi (BE chưa sẵn sàng) → dùng store mock.
  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      realMaintenanceService.getMyRequests()
        .then(page => { if (active) setRemote(page.content.map(dtoToTenantRequest)); })
        .catch(() => { if (active) setRemote(null); });
      return () => { active = false; };
    }, []),
  );

  const all = remote ?? mockAll;

  const active   = all.filter(r => ACTIVE.includes(r.status as MaintenanceStatus));
  const filtered = filter === 'all' ? active : all.filter(r => r.status === filter);

  const pendingCount     = all.filter(r => r.status === 'pending').length;
  const inProgressCount  = all.filter(r => r.status === 'in_progress').length;
  const resolvedThisMonth = all.filter(r => r.status === 'resolved').length;

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

      {/* ── Helper card ── */}
      <TouchableOpacity
        style={styles.helperCard}
        onPress={() => navigation.navigate('RoomEquipment')}
        activeOpacity={0.8}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.helperTitle}>Muốn báo hỏng thiết bị?</Text>
          <Text style={styles.helperDesc}>Vào mục Thiết bị phòng để quét QR hoặc báo hỏng thiết bị.</Text>
        </View>
        <Text style={styles.helperArrow}>Đi đến Thiết bị phòng →</Text>
      </TouchableOpacity>

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
        ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🔧</Text>
            <Text style={styles.emptyTitle}>Không có yêu cầu nào đang hoạt động</Text>
            <Text style={styles.emptyDesc}>
              Báo hỏng thiết bị trực tiếp từ màn hình{' '}
              <Text style={{ color: Colors.primary, fontWeight: '700' }}>Thiết bị</Text>
              {' '}hoặc quét{' '}
              <Text style={{ color: Colors.primary, fontWeight: '700' }}>mã QR</Text>
              {' '}dán trên thiết bị.
            </Text>
            <TouchableOpacity
              style={styles.emptyScanBtn}
              onPress={() => navigation.navigate('Scan')}
            >
              <Text style={styles.emptyScanText}>📷 Quét QR thiết bị</Text>
            </TouchableOpacity>
          </View>
        }
      />

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

  // ── Helper card ──
  helperCard: {
    marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.primary + '30',
    padding: Spacing.base, gap: Spacing.sm,
  },
  helperTitle: { fontSize: 13, fontWeight: '700', color: Colors.primary, marginBottom: 2 },
  helperDesc:  { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  helperArrow: { fontSize: 12, fontWeight: '700', color: Colors.primary, alignSelf: 'flex-end' },

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
