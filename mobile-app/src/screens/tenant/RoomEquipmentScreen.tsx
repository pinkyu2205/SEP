import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, StatusBar,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { EquipmentDto } from '@/types';
import { useTenantContract } from '@/hooks';
import { realTenantEquipmentService } from '@/services/tenant/equipmentService';
import {
  formatDate, getEquipmentLifecycleLabel, getEquipmentLifecycleColor,
  equipmentNeedsAttention, guessEquipmentCategory,
} from '@/utils';

const CATEGORY_ICON: Record<string, string> = {
  electrical: '⚡',
  plumbing: '🚰',
  furniture: '🛋️',
  appliance: '❄️',
  other: '🔧',
};

const equipName = (e: EquipmentDto) => e.equipmentName || e.catalogName || 'Thiết bị';
const getIcon = (e: EquipmentDto) => CATEGORY_ICON[guessEquipmentCategory(equipName(e))] ?? '🔧';

export const RoomEquipmentScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { selectedContractId } = useTenantContract();
  const [equipment, setEquipment] = useState<EquipmentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const list = await realTenantEquipmentService.getMyEquipments(selectedContractId ?? undefined);
      setEquipment(list);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedContractId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const stats = {
    total: equipment.length,
    active: equipment.filter(e => !equipmentNeedsAttention(e.status)).length,
    needsMaint: equipment.filter(e => equipmentNeedsAttention(e.status)).length,
  };

  const renderItem = ({ item }: { item: EquipmentDto }) => {
    const statusStyle = getEquipmentLifecycleColor(item.status);
    const icon = getIcon(item);

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
            <Text style={styles.equipName} numberOfLines={1}>{equipName(item)}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusText, { color: statusStyle.text }]}>
                {getEquipmentLifecycleLabel(item.status)}
              </Text>
            </View>
          </View>

          <Text style={styles.equipCode}>{item.qrCode}</Text>

          <View style={styles.cardMeta}>
            <Text style={styles.metaText}>
              {item.lastMaintenanceDate
                ? `Bảo trì: ${formatDate(item.lastMaintenanceDate)}`
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
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={equipment}
          keyExtractor={item => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>{loadError ? '⚠️' : '🔧'}</Text>
              <Text style={styles.emptyText}>
                {loadError
                  ? 'Không tải được danh sách thiết bị. Kéo xuống để thử lại.'
                  : 'Phòng chưa có thiết bị nào được ghi nhận'}
              </Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        />
      )}
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

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: Spacing.lg, paddingTop: Spacing.md, flexGrow: 1 },

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
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.xl },
});
