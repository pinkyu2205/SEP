import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import {
  ManagedProperty, WholeHouseRentalStatus,
  getPropPriority, getPriorityMeta, getIssueCount,
} from '@/data/managedProperties';
import { managerPropertyService } from '@/services/manager/propertyService';

const FILTERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'multi_room', label: 'Toà nhà' },
  { id: 'whole_house', label: 'Nhà nguyên căn' },
  { id: 'rented', label: 'Đang thuê' },
  { id: 'vacant', label: 'Trống' },
  { id: 'maintenance', label: 'Bảo trì' },
] as const;

const HOUSE_STATUS: Record<WholeHouseRentalStatus, { label: string; color: string; bg: string }> = {
  rented: { label: 'Đang thuê', color: Colors.success, bg: Colors.successLight },
  vacant: { label: 'Trống', color: Colors.textSecondary, bg: Colors.divider },
  expiring: { label: 'Sắp hết hạn hợp đồng', color: Colors.warning, bg: Colors.warningLight },
  maintenance: { label: 'Đang bảo trì', color: Colors.error, bg: Colors.errorLight },
};

const fmt = (n: number | null | undefined) => (n || 0).toLocaleString('vi-VN') + 'đ';

export const BuildingListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>('all');

  const [properties, setProperties] = useState<ManagedProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await managerPropertyService.getManagedProperties();
      setProperties(data);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Không tải được danh sách bất động sản');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Tải lại mỗi khi màn được focus (vd quay lại sau khi onboard khách).
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const multiRoomProps = properties.filter(p => p.propertyType === 'MULTI_ROOM');
  const wholeHouseProps = properties.filter(p => p.propertyType === 'WHOLE_HOUSE');
  const totalRooms = multiRoomProps.reduce((sum, prop) => sum + prop.totalRooms, 0);
  const totalOccupied = multiRoomProps.reduce((sum, prop) => sum + prop.occupied, 0);
  const avgOcc = totalRooms > 0 ? Math.round((totalOccupied / totalRooms) * 100) : 0;

  const handleBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('ManagerHome');
  };

  const filtered = useMemo(() => {
    let list = [...properties].sort((a, b) => getPropPriority(a) - getPropPriority(b));

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(prop =>
        prop.name.toLowerCase().includes(q) ||
        prop.district.toLowerCase().includes(q) ||
        prop.address.toLowerCase().includes(q) ||
        prop.tenantName?.toLowerCase().includes(q),
      );
    }

    switch (filter) {
      case 'multi_room':
        return list.filter(prop => prop.propertyType === 'MULTI_ROOM');
      case 'whole_house':
        return list.filter(prop => prop.propertyType === 'WHOLE_HOUSE');
      case 'rented':
        return list.filter(prop =>
          prop.propertyType === 'MULTI_ROOM'
            ? prop.occupied > 0
            : prop.rentalStatus === 'rented' || prop.rentalStatus === 'expiring',
        );
      case 'vacant':
        return list.filter(prop =>
          prop.propertyType === 'MULTI_ROOM'
            ? prop.available > 0
            : prop.rentalStatus === 'vacant',
        );
      case 'maintenance':
        return list.filter(prop =>
          prop.propertyType === 'MULTI_ROOM'
            ? prop.maintenance > 0 || prop.hasMaintenanceIssues
            : prop.rentalStatus === 'maintenance' || prop.maintenanceCount > 0,
        );
      default:
        return list;
    }
  }, [filter, search, properties]);

  const openProperty = (prop: ManagedProperty) => {
    navigation.navigate(prop.propertyType === 'WHOLE_HOUSE' ? 'WholeHouseDetail' : 'BuildingDetail', {
      propertyId: prop.id,
      property: prop,
    });
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} tintColor={Colors.primary} />
        }
      >
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={handleBack}>
            <Text style={s.backBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={s.title}>Bất động sản</Text>
          <View style={s.statRow}>
            <View style={s.statPill}>
              <Text style={s.statPillText}>{multiRoomProps.length} toà nhà</Text>
            </View>
            <View style={s.statPill}>
              <Text style={s.statPillText}>{wholeHouseProps.length} nguyên căn</Text>
            </View>
            <View style={[s.statPill, { backgroundColor: avgOcc >= 80 ? Colors.successLight : Colors.warningLight }]}>
              <Text style={[s.statPillText, { color: avgOcc >= 80 ? Colors.success : Colors.warning }]}>
                {avgOcc}% lấp đầy
              </Text>
            </View>
          </View>
        </View>

        <View style={s.searchBar}>
          <Text style={s.searchIcon}>⌕</Text>
          <TextInput
            style={s.searchInput}
            placeholder="Tìm tên, địa chỉ, quận, khách thuê..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={s.searchClear}>×</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.filterScroll}
          contentContainerStyle={s.filterContent}
        >
          {FILTERS.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[s.filterChip, filter === item.id && s.filterChipActive]}
              onPress={() => setFilter(item.id)}
            >
              <Text style={[s.filterChipText, filter === item.id && s.filterChipTextActive]} numberOfLines={1}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={s.resultCount}>
          {filtered.length}/{properties.length} bất động sản
        </Text>

        {loading && !refreshing ? (
          <View style={s.emptyState}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={[s.emptyText, { marginTop: Spacing.md }]}>Đang tải dữ liệu...</Text>
          </View>
        ) : error ? (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>⚠️</Text>
            <Text style={s.emptyText}>{error}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); load(); }}>
              <Text style={s.retryBtnText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyIcon}>🏢</Text>
            <Text style={s.emptyText}>
              {properties.length === 0 ? 'Chưa có bất động sản nào' : 'Không tìm thấy bất động sản phù hợp'}
            </Text>
          </View>
        ) : filtered.map(prop => (
          prop.propertyType === 'WHOLE_HOUSE'
            ? <WholeHouseCard key={prop.id} prop={prop} onPress={() => openProperty(prop)} />
            : <MultiRoomCard key={prop.id} prop={prop} onPress={() => openProperty(prop)} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const MultiRoomCard = ({ prop, onPress }: { prop: ManagedProperty; onPress: () => void }) => {
  const occ = prop.totalRooms > 0 ? Math.round((prop.occupied / prop.totalRooms) * 100) : 0;
  const { severity, color: borderColor } = getPriorityMeta(prop);
  const issues = getIssueCount(prop);
  const occColor = occ >= 80 ? Colors.success : occ >= 60 ? Colors.primary : occ >= 40 ? Colors.warning : Colors.error;

  return (
    <TouchableOpacity
      style={[s.card, { borderLeftColor: borderColor ?? Colors.border }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={s.cardHeader}>
        <View style={{ flex: 1 }}>
          <View style={s.nameRow}>
            <Text style={s.cardName} numberOfLines={1}>{prop.name}</Text>
            <View style={s.typeBadge}>
              <Text style={s.typeBadgeText}>Toà nhà</Text>
            </View>
          </View>
          <Text style={s.cardAddress} numberOfLines={1}>{prop.address}</Text>
        </View>
        <View style={s.cardFloorBadge}>
          <Text style={s.cardFloorText}>{prop.totalFloors}T</Text>
        </View>
      </View>

      <View style={s.cardOccRow}>
        <View style={s.cardProgBg}>
          <View style={[s.cardProgFill, { width: `${occ}%` as any, backgroundColor: occColor }]} />
        </View>
        <Text style={[s.cardOccPct, { color: occColor }]}>{occ}%</Text>
      </View>

      <View style={s.cardFooter}>
        <View style={s.cardRoomRow}>
          <Text style={[s.cardRoomNum, { color: Colors.success }]}>{prop.occupied}</Text>
          <Text style={s.cardRoomLbl}> thuê</Text>
          <Text style={s.cardRoomSep}> · </Text>
          <Text style={[s.cardRoomNum, { color: Colors.textSecondary }]}>{prop.available}</Text>
          <Text style={s.cardRoomLbl}> trống</Text>
          {prop.maintenance > 0 && (
            <>
              <Text style={s.cardRoomSep}> · </Text>
              <Text style={[s.cardRoomNum, { color: Colors.warning }]}>{prop.maintenance}</Text>
              <Text style={s.cardRoomLbl}> bảo trì</Text>
            </>
          )}
        </View>

        {issues > 0 ? (
          <View style={[
            s.issuePill,
            { backgroundColor: severity === 'critical' ? Colors.errorLight : Colors.warningLight },
          ]}>
            <Text style={[
              s.issuePillText,
              { color: severity === 'critical' ? Colors.error : Colors.warning },
            ]}>
              {issues} vấn đề
            </Text>
          </View>
        ) : (
          <View style={s.okPill}>
            <Text style={s.okPillText}>Ổn định</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const WholeHouseCard = ({ prop, onPress }: { prop: ManagedProperty; onPress: () => void }) => {
  const status = HOUSE_STATUS[prop.rentalStatus ?? 'vacant'];
  const issueCount = prop.maintenanceCount || 0;

  return (
    <TouchableOpacity
      style={[s.card, { borderLeftColor: status.color }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={s.cardHeader}>
        <View style={{ flex: 1 }}>
          <View style={s.nameRow}>
            <Text style={s.cardName} numberOfLines={1}>{prop.name}</Text>
            <View style={[s.typeBadge, s.houseBadge]}>
              <Text style={[s.typeBadgeText, s.houseBadgeText]}>Nhà nguyên căn</Text>
            </View>
          </View>
          <Text style={s.cardAddress} numberOfLines={1}>{prop.address}</Text>
        </View>
      </View>

      <View style={s.houseStatusBox}>
        <View style={[s.houseStatusPill, { backgroundColor: status.bg }]}>
          <Text style={[s.houseStatusText, { color: status.color }]}>{status.label}</Text>
        </View>
        {prop.tenantName && (
          <Text style={s.houseLine} numberOfLines={1}>Khách thuê: <Text style={s.houseStrong}>{prop.tenantName}</Text></Text>
        )}
        {prop.monthlyRent && (
          <Text style={s.houseLine}>Giá thuê: <Text style={s.houseStrong}>{fmt(prop.monthlyRent)}/tháng</Text></Text>
        )}
        {prop.contractEndDate && (
          <Text style={s.houseLine}>Hợp đồng: <Text style={s.houseStrong}>đến {prop.contractEndDate}</Text></Text>
        )}
      </View>

      <View style={s.cardFooter}>
        <Text style={s.houseFooterText}>
          {prop.totalFloors} tầng · {prop.district}
        </Text>
        {issueCount > 0 ? (
          <View style={[s.issuePill, { backgroundColor: Colors.warningLight }]}>
            <Text style={[s.issuePillText, { color: Colors.warning }]}>{issueCount} bảo trì</Text>
          </View>
        ) : (
          <View style={s.okPill}>
            <Text style={s.okPillText}>Ổn định</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.base, paddingBottom: Spacing['3xl'] },

  header: { paddingTop: Spacing.md, paddingBottom: Spacing.base },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  backBtnText: { fontSize: 26, lineHeight: 28, color: Colors.primary, fontWeight: '900' },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.sm },
  statRow: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  statPill: {
    backgroundColor: Colors.divider, borderRadius: BorderRadius.full,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  statPillText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    ...Shadow.sm, marginBottom: Spacing.sm,
    gap: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  searchIcon: { fontSize: 17, color: Colors.textMuted },
  searchInput: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  searchClear: { fontSize: 18, color: Colors.textMuted, fontWeight: '600', padding: 2 },

  filterScroll: { flexGrow: 0, marginBottom: Spacing.md },
  filterContent: { paddingBottom: 4, gap: Spacing.sm },
  filterChip: {
    height: 32, justifyContent: 'center',
    paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
    minWidth: 58,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  filterChipTextActive: { color: Colors.white },

  resultCount: { fontSize: 12, color: Colors.textMuted, fontWeight: '600', marginBottom: Spacing.sm },
  emptyState: { alignItems: 'center', paddingVertical: Spacing['3xl'] },
  emptyIcon: { fontSize: 40, marginBottom: Spacing.sm },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.lg },
  retryBtn: {
    marginTop: Spacing.md, backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  retryBtnText: { color: Colors.white, fontWeight: '800', fontSize: 13 },

  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    padding: Spacing.base, marginBottom: Spacing.md,
    ...Shadow.sm, borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardName: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, flexShrink: 1 },
  cardAddress: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  typeBadge: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  typeBadgeText: { fontSize: 10, fontWeight: '800', color: Colors.primary },
  houseBadge: { backgroundColor: Colors.warningLight },
  houseBadgeText: { color: Colors.warning },
  cardFloorBadge: {
    backgroundColor: Colors.divider, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 3, marginLeft: Spacing.sm,
  },
  cardFloorText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },

  cardOccRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: Spacing.sm, marginBottom: Spacing.sm,
  },
  cardProgBg: { flex: 1, height: 5, backgroundColor: Colors.divider, borderRadius: 2.5 },
  cardProgFill: { height: 5, borderRadius: 2.5 },
  cardOccPct: { fontSize: 12, fontWeight: '800', minWidth: 34, textAlign: 'right' },

  houseStatusBox: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    padding: Spacing.md, gap: 5, marginBottom: Spacing.sm,
  },
  houseStatusPill: {
    alignSelf: 'flex-start', borderRadius: BorderRadius.full,
    paddingHorizontal: 9, paddingVertical: 4, marginBottom: 2,
  },
  houseStatusText: { fontSize: 11, fontWeight: '900' },
  houseLine: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  houseStrong: { color: Colors.textPrimary, fontWeight: '800' },
  houseFooterText: { fontSize: 12, color: Colors.textMuted, fontWeight: '700' },

  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  cardRoomRow: { flexDirection: 'row', alignItems: 'baseline', flexShrink: 1 },
  cardRoomNum: { fontSize: 12, fontWeight: '800' },
  cardRoomLbl: { fontSize: 12, color: Colors.textMuted },
  cardRoomSep: { fontSize: 12, color: Colors.textMuted },

  issuePill: { borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 3 },
  issuePillText: { fontSize: 10, fontWeight: '800' },
  okPill: {
    backgroundColor: Colors.successLight, borderRadius: BorderRadius.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  okPillText: { fontSize: 10, fontWeight: '800', color: Colors.success },
});
