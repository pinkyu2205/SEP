import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { StatusBadge } from '../../components/common';
import { MaintenanceRequest, MaintenanceStatus } from '../../types';
import { getMaintenanceStatusLabel, getMaintenanceCategoryLabel, formatDate } from '../../utils';

const MOCK_REQUESTS: MaintenanceRequest[] = [
  {
    id: '1', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    title: 'Vòi nước bồn rửa bị rỉ', description: 'Vòi nước bồn rửa mặt trong toilet bị rỉ nước liên tục.',
    category: 'plumbing', status: 'pending', images: [], createdAt: '2026-04-28', updatedAt: '2026-04-28',
  },
  {
    id: '2', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    title: 'Ổ cắm điện bị cháy', description: 'Ổ cắm bên cạnh bàn học bị cháy, có mùi khét.',
    category: 'electrical', status: 'in_progress', images: [], createdAt: '2026-04-25', updatedAt: '2026-04-27',
  },
  {
    id: '3', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    title: 'Tủ quần áo bị hỏng bản lề', description: 'Bản lề cánh tủ trái bị gãy.',
    category: 'furniture', status: 'resolved', images: [], repairCost: 150000,
    createdAt: '2026-04-20', updatedAt: '2026-04-22', resolvedAt: '2026-04-22',
  },
];

const getVariant = (s: MaintenanceStatus) =>
  s === 'resolved' ? 'success' as const : s === 'in_progress' ? 'info' as const : 'warning' as const;

const categoryEmoji: Record<string, string> = {
  electrical: '⚡', plumbing: '🚰', furniture: '🪑', appliance: '📺', other: '🔧',
};

export const MaintenanceListScreen: React.FC = () => {
  const [filter, setFilter] = useState<'all' | MaintenanceStatus>('all');
  const filtered = filter === 'all' ? MOCK_REQUESTS : MOCK_REQUESTS.filter(r => r.status === filter);

  const filters: { key: 'all' | MaintenanceStatus; label: string }[] = [
    { key: 'all', label: 'Tất cả' },
    { key: 'pending', label: 'Chờ xử lý' },
    { key: 'in_progress', label: 'Đang xử lý' },
    { key: 'resolved', label: 'Hoàn tất' },
  ];

  const renderItem = ({ item }: { item: MaintenanceRequest }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <View style={styles.categoryIcon}>
          <Text style={{ fontSize: 20 }}>{categoryEmoji[item.category] || '🔧'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardCategory}>{getMaintenanceCategoryLabel(item.category)} · {formatDate(item.createdAt)}</Text>
        </View>
        <StatusBadge label={getMaintenanceStatusLabel(item.status)} variant={getVariant(item.status)} />
      </View>
      <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Sửa chữa</Text>
        <Text style={styles.subtitle}>Theo dõi yêu cầu bảo trì</Text>
      </View>
      <View style={styles.filterRow}>
        {filters.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
        ListEmptyComponent={<Text style={styles.empty}>Không có yêu cầu nào</Text>}
      />
      <TouchableOpacity style={styles.fab}>
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
  filterRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm },
  filterChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  categoryIcon: { width: 40, height: 40, borderRadius: BorderRadius.md, backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  cardCategory: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  cardDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  empty: { textAlign: 'center', color: Colors.textMuted, marginTop: Spacing['3xl'], fontSize: 14 },
  fab: { position: 'absolute', bottom: 30, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', ...Shadow.lg },
  fabText: { fontSize: 28, color: Colors.white, fontWeight: '300', marginTop: -2 },
});
