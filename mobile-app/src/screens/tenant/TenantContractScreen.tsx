import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { Contract, ContractStatus } from '@/types';
import { formatDate, getContractStatusLabel, getContractStatusColor, getDaysUntil } from '@/utils';
import {
  realTenantSelfService, MyContractListItem, mapBeContractStatus,
} from '@/services/tenant/selfService';

// Card mở rộng: thêm nhãn mô tả phạm vi thuê (toàn nhà / phòng)
type CardContract = Contract & { isWholeHouse: boolean; scopeLabel: string };

// Map item danh sách từ BE -> shape Contract dùng cho card
const toCardContract = (it: MyContractListItem): CardContract => {
  const daysUntilExpiry = getDaysUntil(it.endDate);
  const isWholeHouse = (it.type || '').toUpperCase() === 'WHOLE_HOUSE';
  const roomLabel = it.roomCode || it.roomNumber;
  const scopeLabel = isWholeHouse
    ? 'Thuê toàn nhà'
    : roomLabel ? `Phòng ${roomLabel}` : 'Thuê phòng';
  return {
    id: String(it.id),
    code: it.code,
    type: 'manager_tenant',
    lessorName: it.lessorName || 'Ban Quản Lý',
    lesseeName: '',
    lesseeCccd: '',
    lesseePhone: '',
    propertyName: it.propertyName,
    roomCode: roomLabel ?? undefined,
    startDate: it.startDate,
    endDate: it.endDate,
    depositAmount: it.depositAmount ?? it.deposit ?? 0,
    rentAmount: it.rentAmount ?? 0,
    status: mapBeContractStatus(it.status, daysUntilExpiry),
    equipmentList: [],
    daysUntilExpiry,
    isWholeHouse,
    scopeLabel,
  };
};

const statusFilterList: { key: 'all' | ContractStatus; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pending_host_approval', label: 'Đang xử lý' },
  { key: 'active', label: 'Hiệu lực' },
  { key: 'expiring_soon', label: 'Sắp hết hạn' },
  { key: 'expired', label: 'Hết hạn' },
  { key: 'terminated', label: 'Chấm dứt' },
];

const ContractStatusBadge: React.FC<{ status: ContractStatus }> = ({ status }) => {
  const color = getContractStatusColor(status);
  return (
    <View style={[styles.badge, { backgroundColor: color + '20' }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color }]}>{getContractStatusLabel(status)}</Text>
    </View>
  );
};

export const TenantContractScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [filter, setFilter] = useState<'all' | ContractStatus>('all');
  const [contracts, setContracts] = useState<CardContract[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      realTenantSelfService.getMyContracts()
        .then(list => { if (active) setContracts(list.map(toCardContract)); })
        .catch(() => { if (active) setContracts([]); })
        .finally(() => { if (active) setLoading(false); });
      return () => { active = false; };
    }, []),
  );

  /**
   * Thứ tự ưu tiên khi xếp hợp đồng: hợp đồng còn hiệu lực phải nằm trên cùng.
   * BE trả theo id/ngày tạo nên hợp đồng đã chấm dứt hay lọt lên đầu, khách phải
   * cuộn qua mấy cái cũ mới thấy hợp đồng đang ở.
   */
  const STATUS_RANK: Record<ContractStatus, number> = {
    active: 0,
    expiring_soon: 1,
    pending_host_approval: 2,
    draft: 3,
    expired: 4,
    terminated: 5,
  };

  const sorted = useMemo(
    () => [...contracts].sort((a, b) => {
      const rank = (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9);
      // Cùng nhóm trạng thái thì hợp đồng mới ký nằm trên.
      return rank !== 0 ? rank : (b.startDate ?? '').localeCompare(a.startDate ?? '');
    }),
    [contracts],
  );

  const filtered = filter === 'all'
    ? sorted
    : sorted.filter(c => c.status === filter);

  const activeContract = sorted.find(c => c.status === 'active' || c.status === 'expiring_soon');

  const renderContract = ({ item }: { item: CardContract }) => {
    const isActive = item.status === 'active';

    return (
      <TouchableOpacity
        style={[styles.card, isActive && styles.cardActive]}
        onPress={() => navigation.navigate('ContractDetail', { contractId: item.id })}
        activeOpacity={0.7}
      >
        {isActive && <View style={styles.activeIndicator} />}

        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.contractCode}>{item.code}</Text>
            <Text style={styles.propertyName}>{item.propertyName} · {item.scopeLabel}</Text>
          </View>
          <ContractStatusBadge status={item.status} />
        </View>

        <View style={styles.divider} />

        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Bên cho thuê</Text>
            <Text style={styles.infoValue}>{item.lessorName}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Tiền thuê</Text>
            <Text style={[styles.infoValue, { color: Colors.primary, fontWeight: '700' }]}>
              {(item.rentAmount ?? 0).toLocaleString('vi-VN')} đ/tháng
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Thời hạn</Text>
            <Text style={styles.infoValue}>{formatDate(item.startDate)} — {formatDate(item.endDate)}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Đặt cọc</Text>
            <Text style={styles.infoValue}>{(item.depositAmount ?? 0).toLocaleString('vi-VN')} đ</Text>
          </View>
        </View>

        {isActive && item.daysUntilExpiry !== undefined && item.daysUntilExpiry <= 60 && (
          <View style={styles.expiryWarning}>
            <Text style={styles.expiryWarningText}>
              ⚠️ Còn {item.daysUntilExpiry} ngày hết hạn hợp đồng
            </Text>
          </View>
        )}

        {isActive && item.daysUntilExpiry !== undefined && item.daysUntilExpiry > 60 && (
          <View style={styles.expiryInfo}>
            <Text style={styles.expiryInfoText}>
              📅 Còn {item.daysUntilExpiry} ngày đến khi hết hạn
            </Text>
          </View>
        )}

        {/* Tenant chỉ xem — action thật (Yêu cầu trả phòng) nằm trong màn chi tiết,
            không đặt "Gia hạn/Chấm dứt" ở đây vì trước đó chỉ điều hướng trùng lặp
            sang chi tiết mà không làm gì khác (không có action thật kèm theo). */}
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.actionBtnOutline}
            onPress={() => navigation.navigate('ContractDetail', { contractId: item.id })}
          >
            <Text style={styles.actionBtnOutlineText}>Xem chi tiết</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const EmptyState = () => (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>📋</Text>
      <Text style={styles.emptyTitle}>Không có hợp đồng</Text>
      <Text style={styles.emptyDesc}>Bạn chưa có hợp đồng nào với trạng thái này.</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>Hợp đồng thuê</Text>
        <Text style={styles.subtitle}>Hợp đồng thuê phòng của tôi</Text>
      </View>

      {/* Tổng quan hợp đồng đang hiệu lực */}
      {activeContract && (
        <View style={styles.summaryBanner}>
          <View style={styles.summaryLeft}>
            <Text style={styles.summaryEmoji}>✅</Text>
            <View>
              <Text style={styles.summaryTitle}>Đang thuê · {activeContract.scopeLabel}</Text>
              <Text style={styles.summaryDesc}>{activeContract.propertyName}</Text>
            </View>
          </View>
          <View style={styles.summaryRight}>
            <Text style={styles.summaryDays}>{activeContract.daysUntilExpiry}</Text>
            <Text style={styles.summaryDaysLabel}>ngày còn lại</Text>
          </View>
        </View>
      )}

      {/* Bộ lọc trạng thái */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {statusFilterList.map(f => (
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

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderContract}
          keyExtractor={c => c.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.base }} />}
          ListEmptyComponent={<EmptyState />}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },

  summaryBanner: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.primaryBg,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  summaryEmoji: { fontSize: 28 },
  summaryTitle: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  summaryDesc: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  summaryRight: { alignItems: 'center' },
  summaryDays: { fontSize: 28, fontWeight: '800', color: Colors.primary },
  summaryDaysLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  filterRow: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, alignItems: 'center' },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border, marginRight: Spacing.sm,
    alignSelf: 'flex-start',
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, ...Shadow.md, borderWidth: 1, borderColor: 'transparent',
  },
  cardActive: { borderColor: Colors.primary + '40' },
  activeIndicator: {
    position: 'absolute', top: 0, left: 0, width: 4,
    height: '100%', backgroundColor: Colors.primary, borderTopLeftRadius: BorderRadius.lg,
    borderBottomLeftRadius: BorderRadius.lg,
  },

  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginBottom: Spacing.md },
  contractCode: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  propertyName: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.full },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  divider: { height: 1, backgroundColor: Colors.divider, marginBottom: Spacing.md },

  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.md },
  infoItem: { width: '47%' },
  infoLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  infoValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

  expiryWarning: {
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.md,
    padding: Spacing.sm, marginBottom: Spacing.md,
  },
  expiryWarningText: { fontSize: 13, fontWeight: '600', color: Colors.error },
  expiryInfo: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md,
    padding: Spacing.sm, marginBottom: Spacing.md,
  },
  expiryInfoText: { fontSize: 13, fontWeight: '500', color: Colors.primary },

  cardActions: { flexDirection: 'row', gap: Spacing.sm },
  actionBtnOutline: {
    flex: 1, paddingVertical: Spacing.sm + 2, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  actionBtnOutlineText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  actionBtnPrimary: {
    flex: 1, paddingVertical: Spacing.sm + 2, borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary, alignItems: 'center',
  },
  actionBtnPrimaryText: { fontSize: 13, fontWeight: '700', color: Colors.white },

  empty: { paddingTop: 60, alignItems: 'center' },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.base },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', paddingHorizontal: Spacing.xl },
});
