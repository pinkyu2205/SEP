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
} from '@/types/managedProperty';
import { managerPropertyService } from '@/services/manager/propertyService';

/**
 * Bộ lọc tách làm HAI chiều độc lập.
 *
 * Bản cũ nhét cả 6 lựa chọn vào một `filter` duy nhất — chọn "Nhà nguyên căn" là mất luôn
 * khả năng lọc trạng thái, nên không hỏi được "nguyên căn nào đang trống", đúng câu mà
 * manager cần nhất. Tách ra thì loại × trạng thái kết hợp được với nhau.
 *
 * Sáu chip cũ nằm trong `ScrollView horizontal`: "Bảo trì" bị khuất ngoài mép phải và
 * không có dấu hiệu nào báo còn chip phía sau. Nay hai hàng ngắn, `flexWrap` tự xuống
 * dòng — thấy hết, không phải cuộn.
 */
const TYPE_FILTERS = [
  { id: 'all',         label: 'Tất cả'    },
  { id: 'multi_room',  label: 'Toà nhà'   },
  { id: 'whole_house', label: 'Nguyên căn' },
] as const;

const STATUS_FILTERS = [
  { id: 'all',         label: 'Tất cả'    },
  { id: 'rented',      label: 'Đang thuê' },
  { id: 'vacant',      label: 'Còn trống' },
  { id: 'maintenance', label: 'Bảo trì'   },
] as const;

type TypeFilterId = (typeof TYPE_FILTERS)[number]['id'];
type StatusFilterId = (typeof STATUS_FILTERS)[number]['id'];

const matchesType = (prop: ManagedProperty, id: TypeFilterId) =>
  id === 'all'
  || (id === 'multi_room' ? prop.propertyType === 'MULTI_ROOM' : prop.propertyType === 'WHOLE_HOUSE');

/** Toà nhà xét theo số phòng, nguyên căn xét theo trạng thái thuê của cả căn. */
const matchesStatus = (prop: ManagedProperty, id: StatusFilterId) => {
  const multi = prop.propertyType === 'MULTI_ROOM';
  switch (id) {
    case 'rented':
      return multi ? prop.occupied > 0 : prop.rentalStatus === 'rented' || prop.rentalStatus === 'expiring';
    case 'vacant':
      return multi ? prop.available > 0 : prop.rentalStatus === 'vacant';
    case 'maintenance':
      return multi
        ? prop.maintenance > 0 || prop.hasMaintenanceIssues
        : prop.rentalStatus === 'maintenance' || prop.maintenanceCount > 0;
    default:
      return true;
  }
};

const matchesSearch = (prop: ManagedProperty, query: string) => {
  if (!query) return true;
  const q = query.toLowerCase();
  return prop.name.toLowerCase().includes(q)
    || prop.district.toLowerCase().includes(q)
    || prop.address.toLowerCase().includes(q)
    || !!prop.tenantName?.toLowerCase().includes(q);
};

const HOUSE_STATUS: Record<WholeHouseRentalStatus, { label: string; color: string; bg: string }> = {
  rented: { label: 'Đang thuê', color: Colors.success, bg: Colors.successLight },
  vacant: { label: 'Trống', color: Colors.textSecondary, bg: Colors.divider },
  expiring: { label: 'Sắp hết hạn hợp đồng', color: Colors.warning, bg: Colors.warningLight },
  maintenance: { label: 'Đang bảo trì', color: Colors.error, bg: Colors.errorLight },
};

// `fmt` đã bỏ 13/08/2026 — màn này không còn hiện số tiền nào (giá thuê đã ẩn với manager).

export const BuildingListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilterId>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilterId>('all');

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

  const query = search.trim();

  /** Danh sách đã qua tìm kiếm — dùng chung cho cả kết quả lẫn số đếm trên từng chip. */
  const searched = useMemo(
    () => [...properties]
      .sort((a, b) => getPropPriority(a) - getPropPriority(b))
      .filter(prop => matchesSearch(prop, query)),
    [properties, query],
  );

  const filtered = useMemo(
    () => searched.filter(prop => matchesType(prop, typeFilter) && matchesStatus(prop, statusFilter)),
    [searched, typeFilter, statusFilter],
  );

  /**
   * Số trên mỗi chip = kết quả nếu bấm chính chip đó, tức là đã tính cả chiều lọc kia.
   * Nhờ vậy manager biết trước chip nào bấm vào sẽ ra rỗng, không phải bấm thử từng cái.
   */
  const typeCounts = useMemo(() => Object.fromEntries(
    TYPE_FILTERS.map(f => [
      f.id,
      searched.filter(p => matchesType(p, f.id) && matchesStatus(p, statusFilter)).length,
    ]),
  ) as Record<TypeFilterId, number>, [searched, statusFilter]);

  const statusCounts = useMemo(() => Object.fromEntries(
    STATUS_FILTERS.map(f => [
      f.id,
      searched.filter(p => matchesType(p, typeFilter) && matchesStatus(p, f.id)).length,
    ]),
  ) as Record<StatusFilterId, number>, [searched, typeFilter]);

  const filtersActive = typeFilter !== 'all' || statusFilter !== 'all' || query.length > 0;
  const clearFilters = () => { setTypeFilter('all'); setStatusFilter('all'); setSearch(''); };

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

        {/* Hai chiều lọc độc lập — `flexWrap` tự xuống dòng, không cuộn ngang nên
            không chip nào bị khuất. */}
        <View style={s.filterGroup}>
          <Text style={s.filterGroupLabel}>Loại</Text>
          <View style={s.filterRow}>
            {TYPE_FILTERS.map(item => {
              const active = typeFilter === item.id;
              const count = typeCounts[item.id];
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[s.filterChip, active && s.filterChipActive, !active && count === 0 && s.filterChipEmpty]}
                  onPress={() => setTypeFilter(item.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.filterChipText, active && s.filterChipTextActive]}>
                    {item.label} <Text style={[s.filterChipCount, active && s.filterChipCountActive]}>{count}</Text>
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={s.filterGroup}>
          <Text style={s.filterGroupLabel}>Trạng thái</Text>
          <View style={s.filterRow}>
            {STATUS_FILTERS.map(item => {
              const active = statusFilter === item.id;
              const count = statusCounts[item.id];
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[s.filterChip, active && s.filterChipActive, !active && count === 0 && s.filterChipEmpty]}
                  onPress={() => setStatusFilter(item.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[s.filterChipText, active && s.filterChipTextActive]}>
                    {item.label} <Text style={[s.filterChipCount, active && s.filterChipCountActive]}>{count}</Text>
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={s.resultRow}>
          <Text style={s.resultCount}>
            {filtered.length}/{properties.length} bất động sản
          </Text>
          {filtersActive && (
            <TouchableOpacity onPress={clearFilters} activeOpacity={0.7}>
              <Text style={s.clearFilterText}>Xoá lọc</Text>
            </TouchableOpacity>
          )}
        </View>

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
      {/*
        Trạng thái thuê đưa lên thẳng hàng tiêu đề. Bản cũ để nó trong một hộp riêng
        (`houseStatusBox`) — nhà đang trống thì `tenantName` và `contractEndDate` đều rỗng,
        hộp đó chỉ còn mỗi cái chip "Trống" nằm giữa một mảng xám lớn.
      */}
      <View style={s.cardHeader}>
        <View style={{ flex: 1 }}>
          <View style={s.nameRow}>
            <Text style={s.cardName} numberOfLines={1}>{prop.name}</Text>
            <View style={[s.houseStatusPill, { backgroundColor: status.bg }]}>
              <Text style={[s.houseStatusText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>
          <Text style={s.cardAddress} numberOfLines={1}>{prop.address}</Text>
        </View>
      </View>

      {/* Chỉ dựng hộp khi thật sự có gì để ghi vào. */}
      {(prop.tenantName || prop.contractEndDate) && (
        <View style={s.houseStatusBox}>
          {prop.tenantName && (
            <Text style={s.houseLine} numberOfLines={1}>Khách thuê: <Text style={s.houseStrong}>{prop.tenantName}</Text></Text>
          )}
          {/* Dòng "Giá thuê" đã BỎ 13/08/2026 — xem @/constants/managerVisibility. */}
          {prop.contractEndDate && (
            <Text style={s.houseLine}>Hợp đồng: <Text style={s.houseStrong}>đến {prop.contractEndDate}</Text></Text>
          )}
        </View>
      )}

      {/*
        Chân card chỉ hiện khi có việc. Bản cũ luôn hiện "{totalFloors} tầng · {district}":
        nhà nguyên căn không nhập số tầng nên ra "0 tầng", còn quận thì đã nằm sẵn trong
        dòng địa chỉ ngay trên. Hai thông tin, không cái nào nói thêm được gì.
        Chip "Ổn định" cũng bỏ với nhà trống — nhà chưa có khách thì không có gì để ổn định.
      */}
      {(issueCount > 0 || prop.rentalStatus === 'rented') && (
        <View style={s.cardFooterRight}>
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
      )}
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

  filterGroup: { marginBottom: Spacing.sm },
  filterGroupLabel: {
    fontSize: 10, fontWeight: '800', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6,
  },
  // Chip rộng theo nội dung + `flexWrap`: không có phép tính tỉ lệ nào để sai, thừa chỗ
  // thì tự xuống dòng.
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  filterChip: {
    height: 30, justifyContent: 'center',
    paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  /** Bấm vào sẽ ra rỗng — làm nhạt để đỡ mất công thử. */
  filterChipEmpty: { opacity: 0.45 },
  filterChipText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  filterChipTextActive: { color: Colors.white },
  filterChipCount: { fontSize: 11, fontWeight: '800', color: Colors.textMuted },
  filterChipCountActive: { color: Colors.white, opacity: 0.85 },

  resultRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  resultCount: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  clearFilterText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
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
  /** Chân card nhà nguyên căn giờ chỉ còn một chip → đẩy về phải, không cần hàng 2 cột. */
  cardFooterRight: { flexDirection: 'row', justifyContent: 'flex-end' },

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
