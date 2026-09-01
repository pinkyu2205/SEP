import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { ManagedProperty, getPropPriority, getIssueCount } from '@/types/managedProperty';
import { managerPropertyService } from '@/services/manager/propertyService';
import { formatDate, normalizeVi } from '@/utils/helpers';
import { serverNow } from '@/utils/serverTime';

/**
 * Danh sách bất động sản của quản lý vận hành.
 *
 * ─── Ý tưởng dựng lại (30/08/2026) ────────────────────────────────────────
 * Bản cũ dựng HAI loại thẻ khác hẳn nhau: thẻ toà nhà có thanh lấp đầy + số
 * phòng, thẻ nguyên căn thì gần như trống trơn — nhà chưa có khách là cả cái
 * thẻ chỉ còn tên + địa chỉ nằm giữa một mảng trắng cao gần gấp đôi nội dung.
 * Danh sách 11 căn mà 8 căn như vậy thì cuộn mãi không thấy căn nào đáng chú ý.
 *
 * Nay quy về MỘT "đơn vị cho thuê": nguyên căn = 1 đơn vị, toà nhà = N phòng.
 * Nhờ vậy mọi con số (chip trạng thái, tỉ lệ lấp đầy, bộ đếm trên chip lọc) đều
 * tính bằng cùng một công thức, và hai loại thẻ có chung bộ khung — chỉ khác
 * đúng phần thân giữa. Loại nhà đọc bằng icon + viền trái, không phải đọc chữ.
 */

// ─── Đơn vị cho thuê — quy hai loại nhà về cùng một thước đo ────────────────
interface UnitStat { total: number; rented: number; vacant: number; maintenance: number }

const unitsOf = (p: ManagedProperty): UnitStat => {
  if (p.propertyType === 'MULTI_ROOM') {
    return {
      total: p.totalRooms,
      rented: p.occupied,
      vacant: p.available,
      maintenance: p.maintenance,
    };
  }
  const st = p.rentalStatus ?? 'vacant';
  return {
    total: 1,
    rented: st === 'rented' || st === 'expiring' ? 1 : 0,
    vacant: st === 'vacant' ? 1 : 0,
    maintenance: st === 'maintenance' ? 1 : 0,
  };
};

// ─── Trạng thái hiển thị — một hàm duy nhất cho cả hai loại nhà ─────────────
type StateKey = 'rented' | 'partial' | 'vacant' | 'expiring' | 'maintenance' | 'unknown';

const STATE_META: Record<StateKey, { label: string; color: string; bg: string }> = {
  rented:      { label: 'Đang thuê',    color: Colors.success,       bg: Colors.successLight },
  partial:     { label: 'Còn phòng',    color: Colors.primary,       bg: Colors.primaryBg },
  vacant:      { label: 'Trống',        color: Colors.textSecondary, bg: Colors.divider },
  expiring:    { label: 'Sắp hết hạn',  color: Colors.warning,       bg: Colors.warningLight },
  maintenance: { label: 'Bảo trì',      color: Colors.error,         bg: Colors.errorLight },
  unknown:     { label: 'Chưa mở',      color: Colors.textMuted,     bg: Colors.divider },
};

const stateOf = (p: ManagedProperty): StateKey => {
  if (p.propertyType === 'WHOLE_HOUSE') return (p.rentalStatus ?? 'vacant') as StateKey;
  const u = unitsOf(p);
  if (u.total === 0) return 'unknown';
  if (u.maintenance > 0 && u.rented === 0) return 'maintenance';
  if (u.vacant === 0 && u.rented > 0) return 'rented';
  if (u.rented > 0) return 'partial';
  return 'vacant';
};

// ─── Bộ lọc: ba chiều độc lập, kết hợp được với nhau ────────────────────────
const TYPE_FILTERS = [
  { id: 'all',         label: 'Tất cả'     },
  { id: 'multi_room',  label: 'Toà nhà'    },
  { id: 'whole_house', label: 'Nguyên căn' },
] as const;

/**
 * "Sắp hết hạn" là chip MỚI. Trước đây hợp đồng sắp hết hạn bị gộp chung vào
 * "Đang thuê" nên không có cách nào lọc ra — đúng nhóm mà quản lý phải đi
 * thương lượng gia hạn trước tiên.
 */
const STATUS_FILTERS = [
  { id: 'all',         label: 'Tất cả'      },
  { id: 'rented',      label: 'Đang thuê'   },
  { id: 'vacant',      label: 'Còn trống'   },
  { id: 'expiring',    label: 'Sắp hết hạn' },
  { id: 'maintenance', label: 'Bảo trì'     },
] as const;

const SORTS = [
  { id: 'urgent', label: 'Cần xử lý trước' },
  { id: 'vacant', label: 'Trống nhiều nhất' },
  { id: 'name',   label: 'Tên A → Z' },
] as const;

type TypeFilterId = (typeof TYPE_FILTERS)[number]['id'];
type StatusFilterId = (typeof STATUS_FILTERS)[number]['id'];
type SortId = (typeof SORTS)[number]['id'];

const matchesType = (p: ManagedProperty, id: TypeFilterId) =>
  id === 'all'
  || (id === 'multi_room' ? p.propertyType === 'MULTI_ROOM' : p.propertyType === 'WHOLE_HOUSE');

/** Lọc trạng thái tính trên ĐƠN VỊ cho thuê nên hai loại nhà dùng chung một luật. */
const matchesStatus = (p: ManagedProperty, id: StatusFilterId) => {
  const u = unitsOf(p);
  switch (id) {
    case 'rented':      return u.rented > 0;
    case 'vacant':      return u.vacant > 0;
    case 'expiring':    return p.rentalStatus === 'expiring' || p.hasExpiringContracts;
    case 'maintenance': return u.maintenance > 0 || p.hasMaintenanceIssues;
    default:            return true;
  }
};

/**
 * Tìm kiếm bỏ dấu, quét cả nhãn loại nhà và nhãn trạng thái.
 *
 * Bản cũ so khớp chuỗi thô: gõ "quan 1" không ra "Quận 1", mà bàn phím điện
 * thoại thì gõ có dấu chậm hơn nhiều. Thêm nhãn vào nguồn khớp để gõ thẳng
 * "trong" / "nguyen can" / "bao tri" cũng ra đúng nhóm, khỏi phải nhớ chip nào
 * nằm ở đâu.
 */
const searchHaystack = (p: ManagedProperty): string => normalizeVi([
  p.name,
  p.address,
  p.district,
  p.tenantName ?? '',
  p.propertyType === 'MULTI_ROOM' ? 'toà nhà phòng trọ' : 'nguyên căn',
  STATE_META[stateOf(p)].label,
].join(' '));

const matchesSearch = (p: ManagedProperty, normalizedQuery: string) =>
  !normalizedQuery || searchHaystack(p).includes(normalizedQuery);

/**
 * Ngưỡng "sắp hết hạn" — phải khớp đúng luật trong `propertyService.mapToManaged`
 * (`daysLeft <= 30` mới gán `rentalStatus: 'expiring'`). Lệch hai con số này là
 * thẻ tô vàng cảnh báo trong khi chip "Sắp hết hạn" lại không đếm nó.
 */
const EXPIRING_SOON_DAYS = 30;

/** Số ngày còn lại tới ngày kết thúc HĐ; âm = đã quá hạn; null = không có ngày. */
const daysLeft = (iso?: string): number | null => {
  if (!iso) return null;
  const end = new Date(`${iso.split('T')[0]}T00:00:00`);
  if (Number.isNaN(end.getTime())) return null;
  const today = serverNow();
  today.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
};

/** 400 → "còn 13 tháng"; 25 → "còn 25 ngày"; -3 → "quá hạn 3 ngày". */
const humanLeft = (d: number): string => {
  if (d < 0) return `quá hạn ${Math.abs(d)} ngày`;
  if (d === 0) return 'hết hạn hôm nay';
  if (d < 60) return `còn ${d} ngày`;
  const months = Math.round(d / 30.44);
  if (months < 24) return `còn ${months} tháng`;
  return `còn ${Math.floor(months / 12)} năm`;
};

export const BuildingListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilterId>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilterId>('all');
  const [district, setDistrict] = useState('all');
  const [sort, setSort] = useState<SortId>('urgent');

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

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };

  const handleBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('ManagerHome');
  };

  /**
   * Tổng quan đếm theo ĐƠN VỊ cho thuê, không phải theo căn.
   *
   * Bản cũ lấy `phòng đã thuê / tổng phòng` mà tổng phòng chỉ cộng của toà nhà —
   * 9 nhà nguyên căn không có "phòng" nên rơi hết khỏi mẫu số lẫn tử số. Kết quả
   * là màn hình ghi "0% lấp đầy" trong khi thực tế đang có một căn nguyên căn cho
   * thuê. Con số sai theo hướng làm quản lý tưởng mình chưa làm được gì.
   */
  const overview = useMemo(() => properties.reduce(
    (acc, p) => {
      const u = unitsOf(p);
      return {
        buildings: acc.buildings + (p.propertyType === 'MULTI_ROOM' ? 1 : 0),
        houses: acc.houses + (p.propertyType === 'WHOLE_HOUSE' ? 1 : 0),
        units: acc.units + u.total,
        rented: acc.rented + u.rented,
      };
    },
    { buildings: 0, houses: 0, units: 0, rented: 0 },
  ), [properties]);

  const occPct = overview.units > 0 ? Math.round((overview.rented / overview.units) * 100) : 0;

  const districts = useMemo(
    () => [...new Set(properties.map(p => p.district).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'vi')),
    [properties],
  );

  const query = normalizeVi(search.trim());

  /** Đã qua tìm kiếm — dùng chung cho cả kết quả lẫn bộ đếm trên từng chip. */
  const searched = useMemo(
    () => properties.filter(p => matchesSearch(p, query) && (district === 'all' || p.district === district)),
    [properties, query, district],
  );

  const filtered = useMemo(() => {
    const list = searched.filter(p => matchesType(p, typeFilter) && matchesStatus(p, statusFilter));
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'vi');
      if (sort === 'vacant') return unitsOf(b).vacant - unitsOf(a).vacant;
      return getPropPriority(a) - getPropPriority(b);
    });
  }, [searched, typeFilter, statusFilter, sort]);

  /** Số trên mỗi chip = kết quả nếu bấm đúng chip đó, đã tính cả chiều lọc kia. */
  const typeCounts = useMemo(() => Object.fromEntries(
    TYPE_FILTERS.map(f => [f.id, searched.filter(p => matchesType(p, f.id) && matchesStatus(p, statusFilter)).length]),
  ) as Record<TypeFilterId, number>, [searched, statusFilter]);

  const statusCounts = useMemo(() => Object.fromEntries(
    STATUS_FILTERS.map(f => [f.id, searched.filter(p => matchesType(p, typeFilter) && matchesStatus(p, f.id)).length]),
  ) as Record<StatusFilterId, number>, [searched, typeFilter]);

  const filtersActive =
    typeFilter !== 'all' || statusFilter !== 'all' || district !== 'all' || search.trim().length > 0;

  const clearFilters = () => {
    setTypeFilter('all'); setStatusFilter('all'); setDistrict('all'); setSearch('');
  };

  const cycleSort = () => {
    const i = SORTS.findIndex(o => o.id === sort);
    setSort(SORTS[(i + 1) % SORTS.length].id);
  };

  const openProperty = (p: ManagedProperty) => {
    navigation.navigate(p.propertyType === 'WHOLE_HOUSE' ? 'WholeHouseDetail' : 'BuildingDetail', {
      propertyId: p.id,
      property: p,
    });
  };

  const chipRow = <T extends string>(
    items: readonly { id: T; label: string }[],
    active: T,
    onPick: (id: T) => void,
    counts?: Record<string, number>,
  ) => (
    <View style={s.filterRow}>
      {items.map(item => {
        const on = active === item.id;
        const count = counts?.[item.id];
        return (
          <TouchableOpacity
            key={item.id}
            style={[s.chip, on && s.chipOn, !on && count === 0 && s.chipEmpty]}
            onPress={() => onPick(item.id)}
            activeOpacity={0.7}
          >
            <Text style={[s.chipText, on && s.chipTextOn]}>
              {item.label}
              {count != null && <Text style={[s.chipCount, on && s.chipCountOn]}>{'  '}{count}</Text>}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} tintColor={Colors.primary} />
        }
      >
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={handleBack}>
            <Text style={s.backBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={s.title}>Bất động sản</Text>

          {/* Một dòng tóm tắt thay cho ba viên rời rạc: đọc trái sang phải ra
              luôn "có bao nhiêu căn, trong đó bao nhiêu chỗ đang có khách". */}
          <View style={s.summary}>
            <View style={s.summaryLeft}>
              <Text style={s.summaryBig}>{overview.rented}<Text style={s.summarySlash}>/{overview.units}</Text></Text>
              <Text style={s.summaryLbl}>chỗ đang có khách</Text>
            </View>
            <View style={s.summaryBarWrap}>
              <View style={s.summaryBarBg}>
                <View style={[s.summaryBarFill, { width: `${occPct}%` as any, backgroundColor: occPct >= 80 ? Colors.success : occPct >= 40 ? Colors.primary : Colors.warning }]} />
              </View>
              <Text style={s.summaryMeta}>
                {occPct}% lấp đầy · {overview.buildings} toà nhà · {overview.houses} nguyên căn
              </Text>
            </View>
          </View>
        </View>

        <View style={s.searchBar}>
          <Text style={s.searchIcon}>⌕</Text>
          <TextInput
            style={s.searchInput}
            placeholder="Tên, địa chỉ, quận, khách thuê, trạng thái..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.searchClear}>×</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={s.filterGroup}>
          <Text style={s.filterLbl}>Loại</Text>
          {chipRow(TYPE_FILTERS, typeFilter, setTypeFilter, typeCounts)}
        </View>

        <View style={s.filterGroup}>
          <Text style={s.filterLbl}>Trạng thái</Text>
          {chipRow(STATUS_FILTERS, statusFilter, setStatusFilter, statusCounts)}
        </View>

        {/* Khu vực chỉ dựng khi thật sự có nhiều quận — cả danh sách cùng một quận
            thì hàng chip này chỉ tổ đẩy thẻ nhà đầu tiên xuống dưới màn hình. */}
        {districts.length > 1 && (
          <View style={s.filterGroup}>
            <Text style={s.filterLbl}>Khu vực</Text>
            {chipRow(
              [{ id: 'all', label: 'Tất cả' }, ...districts.map(d => ({ id: d, label: d }))],
              district,
              setDistrict,
            )}
          </View>
        )}

        <View style={s.resultRow}>
          <Text style={s.resultCount}>
            <Text style={s.resultStrong}>{filtered.length}</Text>
            {filtered.length !== properties.length && `/${properties.length}`} bất động sản
          </Text>
          <View style={s.resultActions}>
            {filtersActive && (
              <TouchableOpacity onPress={clearFilters} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.clearText}>Xoá lọc</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.sortBtn} onPress={cycleSort} activeOpacity={0.7}>
              <Text style={s.sortText}>⇅ {SORTS.find(o => o.id === sort)!.label}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading && !refreshing ? (
          <View style={s.empty}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={[s.emptyText, { marginTop: Spacing.md }]}>Đang tải dữ liệu...</Text>
          </View>
        ) : error ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>⚠️</Text>
            <Text style={s.emptyText}>{error}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); load(); }}>
              <Text style={s.retryBtnText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        ) : filtered.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>🏢</Text>
            <Text style={s.emptyText}>
              {properties.length === 0 ? 'Chưa có bất động sản nào' : 'Không có căn nào khớp bộ lọc'}
            </Text>
            {filtersActive && properties.length > 0 && (
              <TouchableOpacity style={s.retryBtn} onPress={clearFilters}>
                <Text style={s.retryBtnText}>Xoá bộ lọc</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : filtered.map(p => (
          <PropertyCard key={p.id} prop={p} onPress={() => openProperty(p)} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

/**
 * Một khung thẻ duy nhất cho cả hai loại nhà.
 *
 * Chỉ khác đúng phần thân giữa: toà nhà là thanh lấp đầy + phân bổ phòng,
 * nguyên căn là khách thuê + hạn hợp đồng. Nhà trống thì thân giữa BIẾN MẤT
 * hẳn — thẻ co lại còn hai dòng, không còn khoảng trắng vô nghĩa.
 */
const PropertyCard = ({ prop, onPress }: { prop: ManagedProperty; onPress: () => void }) => {
  const isWhole = prop.propertyType === 'WHOLE_HOUSE';
  const u = unitsOf(prop);
  const state = STATE_META[stateOf(prop)];
  const issues = getIssueCount(prop);
  const left = daysLeft(prop.contractEndDate);
  const occPct = u.total > 0 ? Math.round((u.rented / u.total) * 100) : 0;

  return (
    <TouchableOpacity
      style={[s.card, { borderLeftColor: state.color }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={s.cardTop}>
        {/* Icon là dấu hiệu nhanh nhất để phân biệt loại nhà — nhanh hơn đọc chữ
            "Toà nhà" nằm lẫn giữa tên, và không ăn mất chỗ của tên. */}
        <View style={[s.icon, isWhole ? s.iconHouse : s.iconBuilding]}>
          <Text style={s.iconText}>{isWhole ? '🏠' : '🏢'}</Text>
        </View>

        <View style={s.cardMain}>
          <Text style={s.cardName} numberOfLines={2}>{prop.name}</Text>
          <Text style={s.cardAddr} numberOfLines={1}>
            {prop.address}
          </Text>
          <Text style={s.cardKind}>
            {isWhole ? 'Nguyên căn' : `Toà nhà · ${u.total} phòng`}
          </Text>
        </View>

        <View style={[s.statePill, { backgroundColor: state.bg }]}>
          <Text style={[s.stateText, { color: state.color }]}>{state.label}</Text>
        </View>
      </View>

      {/* Toà nhà: phân bổ phòng. Chỉ dựng khi đã khai báo phòng. */}
      {!isWhole && u.total > 0 && (
        <View style={s.body}>
          <View style={s.progRow}>
            <View style={s.progBg}>
              <View style={[s.progFill, {
                width: `${occPct}%` as any,
                backgroundColor: occPct >= 80 ? Colors.success : occPct >= 40 ? Colors.primary : Colors.warning,
              }]} />
            </View>
            <Text style={s.progPct}>{u.rented}/{u.total}</Text>
          </View>
          <View style={s.tagRow}>
            <Tag n={u.rented} label="đang thuê" color={Colors.success} />
            <Tag n={u.vacant} label="trống" color={Colors.textSecondary} />
            <Tag n={u.maintenance} label="bảo trì" color={Colors.error} />
          </View>
        </View>
      )}

      {/* Nguyên căn đang có khách: người thuê + hạn hợp đồng. Trống thì bỏ hẳn. */}
      {isWhole && !!prop.tenantName && (
        <View style={s.body}>
          <Text style={s.tenantLine} numberOfLines={1}>
            <Text style={s.tenantLbl}>Khách thuê  </Text>
            <Text style={s.tenantName}>{prop.tenantName}</Text>
          </Text>
          {!!prop.contractEndDate && (
            <Text style={s.tenantLine} numberOfLines={1}>
              <Text style={s.tenantLbl}>Hợp đồng  </Text>
              <Text style={s.tenantName}>đến {formatDate(prop.contractEndDate)}</Text>
              {left != null && (
                <Text style={[
                  s.leftText,
                  { color: left < 0 ? Colors.error : left <= EXPIRING_SOON_DAYS ? Colors.warning : Colors.textMuted },
                ]}>
                  {'  · '}{humanLeft(left)}
                </Text>
              )}
            </Text>
          )}
        </View>
      )}

      {issues > 0 && (
        <View style={s.issueRow}>
          <Text style={s.issueText}>⚠︎ {issues} việc cần xử lý</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

/** Ô đếm nhỏ ở chân thẻ toà nhà — số 0 thì làm nhạt chứ không ẩn, để ba ô luôn
    thẳng hàng giữa các thẻ và mắt không phải dò lại vị trí ở từng thẻ. */
const Tag = ({ n, label, color }: { n: number; label: string; color: string }) => (
  <View style={s.tag}>
    <Text style={[s.tagNum, { color: n > 0 ? color : Colors.textMuted, opacity: n > 0 ? 1 : 0.5 }]}>{n}</Text>
    <Text style={[s.tagLbl, { opacity: n > 0 ? 1 : 0.5 }]}>{label}</Text>
  </View>
);

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.base, paddingBottom: Spacing['3xl'] },

  header: { paddingTop: Spacing.md, paddingBottom: Spacing.md },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  backBtnText: { fontSize: 26, lineHeight: 28, color: Colors.primary, fontWeight: '900' },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },

  summary: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, ...Shadow.sm,
  },
  summaryLeft: { alignItems: 'flex-start' },
  summaryBig: { fontSize: 24, fontWeight: '900', color: Colors.textPrimary, lineHeight: 27 },
  summarySlash: { fontSize: 15, fontWeight: '800', color: Colors.textMuted },
  summaryLbl: { fontSize: 10, fontWeight: '700', color: Colors.textMuted, marginTop: 1 },
  summaryBarWrap: { flex: 1, gap: 6 },
  summaryBarBg: { height: 6, backgroundColor: Colors.divider, borderRadius: 3, overflow: 'hidden' },
  summaryBarFill: { height: 6, borderRadius: 3 },
  summaryMeta: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    ...Shadow.sm, marginBottom: Spacing.md,
    gap: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  searchIcon: { fontSize: 17, color: Colors.textMuted },
  searchInput: { flex: 1, fontSize: 13, color: Colors.textPrimary, padding: 0 },
  searchClear: { fontSize: 18, color: Colors.textMuted, fontWeight: '600', padding: 2 },

  filterGroup: { marginBottom: Spacing.sm },
  filterLbl: {
    fontSize: 10, fontWeight: '800', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip: {
    height: 30, justifyContent: 'center',
    paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  /** Bấm vào sẽ ra rỗng — làm nhạt để đỡ mất công thử. */
  chipEmpty: { opacity: 0.45 },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  chipTextOn: { color: Colors.white },
  chipCount: { fontSize: 11, fontWeight: '800', color: Colors.textMuted },
  chipCountOn: { color: Colors.white, opacity: 0.85 },

  resultRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: Spacing.xs, marginBottom: Spacing.sm, gap: Spacing.sm,
  },
  resultCount: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  resultStrong: { color: Colors.textPrimary, fontWeight: '800' },
  resultActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  clearText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  sortBtn: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: 5,
  },
  sortText: { fontSize: 11, fontWeight: '800', color: Colors.textSecondary },

  empty: { alignItems: 'center', paddingVertical: Spacing['3xl'] },
  emptyIcon: { fontSize: 40, marginBottom: Spacing.sm },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.lg },
  retryBtn: {
    marginTop: Spacing.md, backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  retryBtnText: { color: Colors.white, fontWeight: '800', fontSize: 13 },

  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm, ...Shadow.sm,
    borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  icon: {
    width: 34, height: 34, borderRadius: BorderRadius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  iconBuilding: { backgroundColor: Colors.primaryBg },
  iconHouse: { backgroundColor: Colors.divider },
  iconText: { fontSize: 16 },
  cardMain: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, lineHeight: 18 },
  cardAddr: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  cardKind: { fontSize: 10, fontWeight: '700', color: Colors.textSecondary, marginTop: 3 },
  statePill: {
    borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4,
  },
  stateText: { fontSize: 10, fontWeight: '900' },

  body: {
    marginTop: Spacing.sm, paddingTop: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.divider, gap: 6,
  },
  progRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  progBg: { flex: 1, height: 5, backgroundColor: Colors.divider, borderRadius: 2.5, overflow: 'hidden' },
  progFill: { height: 5, borderRadius: 2.5 },
  progPct: { fontSize: 11, fontWeight: '800', color: Colors.textSecondary, minWidth: 30, textAlign: 'right' },

  tagRow: { flexDirection: 'row', gap: Spacing.base },
  tag: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  tagNum: { fontSize: 13, fontWeight: '900' },
  tagLbl: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },

  tenantLine: { fontSize: 12, color: Colors.textSecondary },
  tenantLbl: { fontSize: 11, color: Colors.textMuted, fontWeight: '700' },
  tenantName: { color: Colors.textPrimary, fontWeight: '800' },
  leftText: { fontSize: 11, fontWeight: '800' },

  issueRow: { marginTop: Spacing.sm },
  issueText: { fontSize: 11, fontWeight: '800', color: Colors.warning },
});
