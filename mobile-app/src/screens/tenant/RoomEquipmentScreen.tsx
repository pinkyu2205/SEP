import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { Equipment } from '../../types';
import { useRoomEquipment } from '../../store/equipmentStore';
import { formatDate } from '../../utils';

// Tenant's room — in a real app this comes from auth context
const TENANT_ROOM_ID = 'r1';

const STATUS_LABEL: Record<string, string> = {
  active: 'Hoạt động tốt',
  repairing: 'Đang sửa chữa',
  damaged: 'Hỏng hóc',
  needs_check: 'Cần kiểm tra',
  replaced: 'Đã thay thế',
  retired: 'Đã thanh lý',
};

const STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  active:      { bg: Colors.successLight, text: Colors.success },
  repairing:   { bg: Colors.warningLight, text: Colors.warning },
  damaged:     { bg: Colors.errorLight,   text: Colors.error   },
  needs_check: { bg: '#FEF3C7',           text: '#D97706'      },
  replaced:    { bg: Colors.divider,      text: Colors.textMuted },
  retired:     { bg: Colors.divider,      text: Colors.textMuted },
};

const CATEGORY_ICON: Record<string, string> = {
  'Điện lạnh': '❄️',
  'Điện':      '⚡',
  'Điện tử':   '📺',
  'Nội thất':  '🛋️',
  'Vệ sinh':   '🚿',
  'Cơ học':    '⚙️',
};

const getCategoryIcon = (category: string) => CATEGORY_ICON[category] ?? '🔧';

const needsMaintenance = (eq: Equipment) =>
  eq.status === 'damaged' || eq.status === 'repairing' || eq.status === 'needs_check';

export const RoomEquipmentScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const equipment = useRoomEquipment(TENANT_ROOM_ID);

  const stats = useMemo(() => ({
    total: equipment.length,
    active: equipment.filter(e => e.status === 'active').length,
    needsMaint: equipment.filter(needsMaintenance).length,
  }), [equipment]);

  const renderItem = ({ item }: { item: Equipment }) => {
    const statusStyle = STATUS_COLOR[item.status] ?? STATUS_COLOR.active;
    const icon = getCategoryIcon(item.category);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('EquipmentDetail', { equipment: item })}
        activeOpacity={0.75}
      >
        <View style={styles.cardLeft}>
          <View style={[styles.iconWrap, { backgroundColor: Colors.primaryBg }]}>
            <Text style={styles.iconText}>{icon}</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <Text style={styles.equipName} numberOfLines={1}>{item.name}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusText, { color: statusStyle.text }]}>
                {STATUS_LABEL[item.status] ?? item.status}
              </Text>
            </View>
          </View>

          <Text style={styles.equipCode}>{item.assetId}</Text>

          <View style={styles.cardMeta}>
            <Text style={styles.metaText}>
              {item.lastMaintenanceAt
                ? `Bảo trì: ${formatDate(item.lastMaintenanceAt)}`
                : 'Chưa bảo trì lần nào'}
            </Text>
            <View style={styles.qrChip}>
              <Text style={styles.qrChipText}>📷 QR</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Thiết bị phòng</Text>
          <Text style={styles.headerSub}>Danh sách thiết bị trong phòng của bạn</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{stats.total}</Text>
          <Text style={styles.summaryLabel}>Tổng thiết bị</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: Colors.success }]}>{stats.active}</Text>
          <Text style={styles.summaryLabel}>Hoạt động tốt</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: stats.needsMaint > 0 ? Colors.warning : Colors.textMuted }]}>
            {stats.needsMaint}
          </Text>
          <Text style={styles.summaryLabel}>Cần kiểm tra</Text>
        </View>
      </View>

      {/* Equipment List */}
      <FlatList
        data={equipment}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🔧</Text>
            <Text style={styles.emptyText}>Phòng chưa có thiết bị nào được ghi nhận</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md, backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 28, color: Colors.textPrimary, lineHeight: 32 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  headerSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },

  summaryCard: {
    flexDirection: 'row', backgroundColor: Colors.white, marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg, borderRadius: BorderRadius.xl, padding: Spacing.lg,
    ...Shadow.sm, borderWidth: 1, borderColor: Colors.border,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  summaryLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },
  summaryDivider: { width: 1, backgroundColor: Colors.divider, marginVertical: 4 },

  listContent: { padding: Spacing.lg, paddingTop: Spacing.md },

  card: {
    flexDirection: 'row', backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.md, ...Shadow.sm, borderWidth: 1, borderColor: Colors.border,
    gap: Spacing.md,
  },
  cardLeft: { justifyContent: 'flex-start', paddingTop: 2 },
  iconWrap: {
    width: 48, height: 48, borderRadius: BorderRadius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  iconText: { fontSize: 24 },

  cardBody: { flex: 1 },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.xs },
  equipName: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full, flexShrink: 0 },
  statusText: { fontSize: 10, fontWeight: '700' },

  equipCode: { fontSize: 12, color: Colors.textMuted, marginTop: 2, fontFamily: 'monospace' },

  cardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  metaText: { fontSize: 12, color: Colors.textSecondary },
  qrChip: {
    backgroundColor: Colors.primaryBg, paddingHorizontal: Spacing.sm,
    paddingVertical: 2, borderRadius: BorderRadius.full,
  },
  qrChipText: { fontSize: 10, fontWeight: '700', color: Colors.primary },

  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
});
