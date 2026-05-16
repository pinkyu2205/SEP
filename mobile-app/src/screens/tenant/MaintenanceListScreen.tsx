import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { MaintenanceRequest, MaintenanceStatus } from '../../types';
import { getMaintenanceStatusLabel, getMaintenanceCategoryLabel, formatDate, getMaintenancePriorityLabel, getMaintenancePriorityColor } from '../../utils';

export const MOCK_MAINTENANCE: MaintenanceRequest[] = [
  {
    id: '1', ticketCode: 'TK-T-001', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    title: 'Vòi nước bồn rửa bị rỉ', description: 'Vòi nước bồn rửa mặt trong toilet bị rỉ nước liên tục, gây lãng phí nước.',
    category: 'plumbing', priority: 'medium', status: 'pending', images: [],
    timeline: [{ status: 'pending', note: 'Yêu cầu đã được tạo', updatedBy: 'Nguyễn Văn A', updatedAt: '2026-04-28T09:00:00Z' }],
    createdAt: '2026-04-28', updatedAt: '2026-04-28',
  },
  {
    id: '2', ticketCode: 'TK-T-002', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    title: 'Ổ cắm điện bị cháy', description: 'Ổ cắm bên cạnh bàn học bị cháy, có mùi khét, không dùng được.',
    category: 'electrical', priority: 'urgent', status: 'in_progress', images: [],
    assignedTo: 'Thợ điện Nguyễn Quốc',
    timeline: [
      { status: 'pending', note: 'Yêu cầu đã được tạo', updatedBy: 'Nguyễn Văn A', updatedAt: '2026-04-25T08:00:00Z' },
      { status: 'accepted', note: 'Quản lý đã tiếp nhận và phân công thợ', updatedBy: 'Trần Văn Minh', updatedAt: '2026-04-25T10:00:00Z' },
      { status: 'in_progress', note: 'Thợ đang kiểm tra và sửa chữa', updatedBy: 'Thợ điện Nguyễn Quốc', updatedAt: '2026-04-27T14:00:00Z' },
    ],
    createdAt: '2026-04-25', updatedAt: '2026-04-27', estimatedCompletionDate: '2026-04-30',
  },
  {
    id: '3', ticketCode: 'TK-T-003', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    title: 'Tủ quần áo bị hỏng bản lề', description: 'Bản lề cánh tủ trái bị gãy, không đóng được.',
    category: 'furniture', priority: 'low', status: 'resolved', images: [], repairCost: 150000,
    timeline: [
      { status: 'pending', note: 'Yêu cầu đã được tạo', updatedBy: 'Nguyễn Văn A', updatedAt: '2026-04-20T09:00:00Z' },
      { status: 'accepted', note: 'Đã tiếp nhận', updatedBy: 'Trần Văn Minh', updatedAt: '2026-04-20T11:00:00Z' },
      { status: 'resolved', note: 'Đã thay bản lề mới, tủ đóng mở bình thường', updatedBy: 'Thợ mộc', updatedAt: '2026-04-22T16:00:00Z' },
    ],
    createdAt: '2026-04-20', updatedAt: '2026-04-22', resolvedAt: '2026-04-22',
  },
];

const STATUS_FILTERS: { key: 'all' | MaintenanceStatus; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pending', label: 'Chờ xử lý' },
  { key: 'accepted', label: 'Đã tiếp nhận' },
  { key: 'in_progress', label: 'Đang sửa' },
  { key: 'resolved', label: 'Hoàn tất' },
  { key: 'cancelled', label: 'Đã hủy' },
];

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: Colors.warningLight, text: Colors.warning },
  accepted: { bg: Colors.infoLight, text: Colors.info },
  in_progress: { bg: Colors.primaryBg, text: Colors.primary },
  resolved: { bg: Colors.successLight, text: Colors.success },
  cancelled: { bg: Colors.divider, text: Colors.textMuted },
};

const CATEGORY_EMOJI: Record<string, string> = {
  electrical: '⚡', plumbing: '🚰', furniture: '🪑', appliance: '📺', other: '🔧',
};

const LABELS_VN: Record<string, string> = {
  pending: 'Chờ xử lý',
  accepted: 'Đã tiếp nhận',
  in_progress: 'Đang xử lý',
  resolved: 'Hoàn tất',
  cancelled: 'Đã hủy',
};

export const MaintenanceListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [filter, setFilter] = useState<'all' | MaintenanceStatus>('all');

  const filtered = filter === 'all' ? MOCK_MAINTENANCE : MOCK_MAINTENANCE.filter(r => r.status === filter);

  const pendingCount = MOCK_MAINTENANCE.filter(r => r.status === 'pending').length;
  const inProgressCount = MOCK_MAINTENANCE.filter(r => r.status === 'in_progress').length;

  const getStatusStyle = (status: string) => STATUS_COLORS[status] || STATUS_COLORS.pending;

  const renderItem = ({ item }: { item: MaintenanceRequest }) => {
    const s = getStatusStyle(item.status);
    const priorityColor = getMaintenancePriorityColor(item.priority);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('MaintenanceDetail', { request: item })}
        activeOpacity={0.7}
      >
        <View style={styles.cardTop}>
          <View style={[styles.categoryBadge, { backgroundColor: Colors.primaryBg }]}>
            <Text style={{ fontSize: 20 }}>{CATEGORY_EMOJI[item.category] || '🔧'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.ticketCode}>{item.ticketCode} · {formatDate(item.createdAt)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
            <Text style={[styles.statusText, { color: s.text }]}>{LABELS_VN[item.status]}</Text>
          </View>
        </View>

        <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>

        <View style={styles.cardMeta}>
          <View style={[styles.priorityChip, { backgroundColor: priorityColor + '20' }]}>
            <Text style={[styles.priorityText, { color: priorityColor }]}>
              {getMaintenancePriorityLabel(item.priority)}
            </Text>
          </View>
          <Text style={styles.categoryLabel}>{getMaintenanceCategoryLabel(item.category)}</Text>
          {item.assignedTo && (
            <Text style={styles.assignedText}>👷 {item.assignedTo}</Text>
          )}
        </View>

        {item.status === 'in_progress' && item.estimatedCompletionDate && (
          <View style={styles.etaBanner}>
            <Text style={styles.etaText}>
              ⏱ Dự kiến hoàn thành: {formatDate(item.estimatedCompletionDate)}
            </Text>
          </View>
        )}

        {item.status === 'resolved' && item.repairCost && (
          <View style={styles.costBanner}>
            <Text style={styles.costText}>
              ✅ Đã hoàn tất · Chi phí sửa: {item.repairCost.toLocaleString('vi-VN')} đ
            </Text>
          </View>
        )}

        {/* Mini timeline */}
        {item.timeline.length > 0 && (
          <View style={styles.miniTimeline}>
            <View style={styles.timelineBar}>
              {(['pending', 'accepted', 'in_progress', 'resolved'] as MaintenanceStatus[]).map((s, i) => {
                const statusIndex = ['pending', 'accepted', 'in_progress', 'resolved'].indexOf(item.status);
                const isReached = i <= statusIndex;
                return (
                  <React.Fragment key={s}>
                    <View style={[styles.timelineDot, { backgroundColor: isReached ? Colors.primary : Colors.border }]} />
                    {i < 3 && <View style={[styles.timelineLine, { backgroundColor: isReached && i < statusIndex ? Colors.primary : Colors.border }]} />}
                  </React.Fragment>
                );
              })}
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Yêu cầu sửa chữa</Text>
          <Text style={styles.subtitle}>Theo dõi tiến độ bảo trì phòng</Text>
        </View>
      </View>

      {/* Tổng quan */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: Colors.warningLight }]}>
          <Text style={[styles.summaryNumber, { color: Colors.warning }]}>{pendingCount}</Text>
          <Text style={[styles.summaryLabel, { color: Colors.warning }]}>Chờ xử lý</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: Colors.primaryBg }]}>
          <Text style={[styles.summaryNumber, { color: Colors.primary }]}>{inProgressCount}</Text>
          <Text style={[styles.summaryLabel, { color: Colors.primary }]}>Đang xử lý</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: Colors.successLight }]}>
          <Text style={[styles.summaryNumber, { color: Colors.success }]}>
            {MOCK_MAINTENANCE.filter(r => r.status === 'resolved').length}
          </Text>
          <Text style={[styles.summaryLabel, { color: Colors.success }]}>Hoàn tất</Text>
        </View>
      </View>

      {/* Bộ lọc */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {STATUS_FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🔧</Text>
            <Text style={styles.emptyTitle}>Không có yêu cầu nào</Text>
            <Text style={styles.emptyDesc}>Nhấn nút + để tạo yêu cầu sửa chữa mới</Text>
          </View>
        }
      />

      {/* FAB tạo mới */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('MaintenanceCreate')}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>＋</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md,
  },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },

  summaryRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.md, marginBottom: Spacing.md },
  summaryCard: { flex: 1, borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: 'center' },
  summaryNumber: { fontSize: 24, fontWeight: '800' },
  summaryLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },

  filterRow: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.sm },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },

  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.md },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  categoryBadge: { width: 44, height: 44, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  ticketCode: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: Spacing.sm },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  priorityChip: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  priorityText: { fontSize: 11, fontWeight: '700' },
  categoryLabel: { fontSize: 12, color: Colors.textMuted },
  assignedText: { fontSize: 12, color: Colors.textSecondary },

  etaBanner: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md,
    padding: Spacing.sm, marginTop: Spacing.sm,
  },
  etaText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  costBanner: {
    backgroundColor: Colors.successLight, borderRadius: BorderRadius.md,
    padding: Spacing.sm, marginTop: Spacing.sm,
  },
  costText: { fontSize: 12, fontWeight: '600', color: Colors.success },

  miniTimeline: { marginTop: Spacing.sm },
  timelineBar: { flexDirection: 'row', alignItems: 'center' },
  timelineDot: { width: 8, height: 8, borderRadius: 4 },
  timelineLine: { flex: 1, height: 2 },

  empty: { paddingTop: 60, alignItems: 'center' },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.base },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },

  fab: {
    position: 'absolute', bottom: 30, right: 24, width: 60, height: 60,
    borderRadius: 30, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    ...Shadow.lg,
  },
  fabIcon: { fontSize: 30, color: Colors.white, fontWeight: '300', marginTop: -2 },
});
