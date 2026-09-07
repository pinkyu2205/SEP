import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Animated,
  TextInput, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';
import { Colors, Brand, Spacing, BorderRadius, Shadow } from '@/constants';
import { PropertyListing } from '@/types';
import { GuestStackParamList } from '@/navigation/GuestStackNavigator';
import { formatCurrency } from '@/utils/helpers';

/**
 * Lớp tìm kiếm phủ toàn màn của cổng khách vãng lai — ô nhập, gợi ý, bộ lọc và
 * danh sách kết quả.
 *
 * Tách khỏi `GuestHomeScreen` (07/09/2026) lúc thiết kế lại trang chủ: hai thứ này
 * không dùng chung một dòng state nào, mà gộp lại thì file trang chủ dài 1200 dòng
 * và phần bố cục — thứ hay phải sửa nhất — bị chôn ở giữa.
 */
type NavigationProp = NativeStackNavigationProp<GuestStackParamList>;

/**
 * Hai icon vẽ tay thay cho emoji. "←" mỗi máy Android render một kiểu, còn ⚙️ thì
 * SAI NGHĨA — bánh răng nói "cài đặt", không phải "lọc"; ba gạch thu dần mới là ký
 * hiệu lọc mà ai cũng đọc được ngay.
 */
const IconBack = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Path d="M15 5 L8 12 L15 19" stroke={Colors.textPrimary} strokeWidth={2.2}
      strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const IconFilter: React.FC<{ color: string }> = ({ color }) => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
    <Path d="M4 6h16M7 12h10M10 18h4" stroke={color} strokeWidth={2.3} strokeLinecap="round" />
  </Svg>
);

/**
 * BĐS chưa gắn giá thì BE trả 0, mà `formatCurrency(0)` ra "0 đ" — đọc như nhà cho
 * ở miễn phí. Cùng cách xử lý với trang chủ.
 */
const priceLabel = (from: number) =>
  from > 0 ? `${formatCurrency(from)}/tháng` : 'Giá thương lượng';

// ============================================================================
const SEARCH_SUGGESTIONS = [
  { icon: '🏢', label: 'Phòng trọ Thủ Đức',   filters: { propertyType: 'apartment',   wardIds: ['hcm-lc', 'hcm-lt'], cityId: 'hcm' } },
  { icon: '🏡', label: 'Nguyên căn Quận 7',   filters: { propertyType: 'whole_house', wardIds: ['hcm-tp', 'hcm-bt'], cityId: 'hcm' } },
  { icon: '📍', label: 'Bình Thạnh',          filters: { wardIds: ['hcm-p25', 'hcm-p13'],                            cityId: 'hcm' } },
  { icon: '💰', label: 'Dưới 3 triệu',        filters: { propertyType: 'apartment',   maxPrice: 3000000,             cityId: 'hcm' } },
  { icon: '🏡', label: 'Nguyên căn Tân Bình', filters: { propertyType: 'whole_house', wardIds: ['hcm-tb'],           cityId: 'hcm' } },
  { icon: '📍', label: 'Gò Vấp',              filters: { cityId: 'hcm' } },
];

const PRICE_FILTERS = [
  { label: 'Tất cả',   min: 0,        max: Infinity },
  { label: '< 3tr',    min: 0,        max: 3_000_000 },
  { label: '3 – 6tr',  min: 3_000_000, max: 6_000_000 },
  { label: '6 – 10tr', min: 6_000_000, max: 10_000_000 },
  { label: '> 10tr',   min: 10_000_000, max: Infinity },
];

const TYPE_FILTERS = [
  { label: 'Tất cả',       value: '' },
  { label: '🏢 Phòng trọ', value: 'apartment' },
  { label: '🏠 Nguyên căn',value: 'whole_house' },
];

const WARD_FILTERS = [
  { label: 'Tất cả',    wardIds: undefined },
  { label: 'Thủ Đức',  wardIds: ['hcm-lc', 'hcm-lt'] },
  { label: 'Bình Thạnh',wardIds: ['hcm-p25', 'hcm-p13'] },
  { label: 'Quận 7',   wardIds: ['hcm-tp', 'hcm-bt', 'hcm-pm'] },
  { label: 'Quận 1',   wardIds: ['hcm-bn', 'hcm-dk'] },
  { label: 'Tân Bình', wardIds: ['hcm-tb'] },
  { label: 'Gò Vấp',  wardIds: [] },
];

const AREA_FILTERS = [
  { label: 'Tất cả',    min: 0,  max: Infinity },
  { label: '< 20m²',   min: 0,  max: 20 },
  { label: '20 – 30m²', min: 20, max: 30 },
  { label: '30 – 50m²', min: 30, max: 50 },
  { label: '> 50m²',   min: 50, max: Infinity },
];

const AMENITY_OPTIONS = [
  { label: 'Máy lạnh',   icon: '❄️' },
  { label: 'Wifi',       icon: '📶' },
  { label: 'Máy giặt',  icon: '🫧' },
  { label: 'Giữ xe',    icon: '🅿️' },
  { label: 'Bảo vệ',    icon: '🔒' },
  { label: 'Ban công',  icon: '🌿' },
  { label: 'Bếp riêng', icon: '🍳' },
  { label: 'Nội thất',  icon: '🛋️' },
];

const SearchPropertyRow: React.FC<{ property: PropertyListing; onPress: () => void }> = ({ property, onPress }) => {
  const isWH = property.propertyType === 'whole_house';
  const free = property.availableRooms;
  return (
    <TouchableOpacity style={ov.row} onPress={onPress} activeOpacity={0.75}>
      <View style={ov.rowImgWrap}>
        {property.photos?.[0]
          ? <Image source={{ uri: property.photos[0] }} style={ov.rowImg} resizeMode="cover" />
          : <Text style={ov.rowImgFallback}>{isWH ? '🏡' : '🏢'}</Text>
        }
      </View>
      <View style={ov.rowInfo}>
        <Text style={ov.rowName} numberOfLines={1}>{property.name}</Text>
        <Text style={ov.rowAddr} numberOfLines={1}>{property.ward}, {property.city}</Text>
        <View style={ov.rowMeta}>
          <Text style={[ov.rowPrice, property.priceFrom <= 0 && ov.rowPriceSoft]} numberOfLines={1}>
            {priceLabel(property.priceFrom)}
          </Text>
          {free > 0 && (
            <>
              <View style={ov.rowMetaSep} />
              <Text style={ov.rowFree}>Còn {free}</Text>
            </>
          )}
        </View>
      </View>
      <Text style={ov.rowArrow}>›</Text>
    </TouchableOpacity>
  );
};

interface SearchOverlayProps {
  visible: boolean;
  onClose: () => void;
  properties: PropertyListing[];
  navigation: NavigationProp;
}

// ── Filter Bottom Sheet ────────────────────────────────────────────────────
interface FilterSheetProps {
  visible: boolean;
  typeFilter: string;
  priceIdx: number;
  wardLabel: string;
  areaIdx: number;
  amenities: string[];
  onApply: (type: string, price: number, ward: string, wardIds: string[] | undefined, area: number, amenities: string[]) => void;
  onClose: () => void;
}

const FilterSheet: React.FC<FilterSheetProps> = ({
  visible, typeFilter, priceIdx, wardLabel, areaIdx, amenities, onApply, onClose,
}) => {
  const insets    = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(600)).current;

  const [localType,      setLocalType]      = useState(typeFilter);
  const [localPrice,     setLocalPrice]     = useState(priceIdx);
  const [localWard,      setLocalWard]      = useState(wardLabel);
  const [localWardIds,   setLocalWardIds]   = useState<string[] | undefined>(undefined);
  const [localArea,      setLocalArea]      = useState(areaIdx);
  const [localAmenities, setLocalAmenities] = useState<string[]>(amenities);

  useEffect(() => {
    if (visible) {
      setLocalType(typeFilter); setLocalPrice(priceIdx);
      setLocalWard(wardLabel);  setLocalArea(areaIdx);
      setLocalAmenities(amenities);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 68, friction: 12 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: 600, duration: 220, useNativeDriver: true }).start();
    }
  }, [visible]);

  const toggleAmenity = (label: string) =>
    setLocalAmenities(prev =>
      prev.includes(label) ? prev.filter(a => a !== label) : [...prev, label]
    );

  const activeCount =
    (localType !== '' ? 1 : 0) +
    (localPrice !== 0 ? 1 : 0) +
    (localWard !== 'Tất cả' ? 1 : 0) +
    (localArea !== 0 ? 1 : 0) +
    (localAmenities.length > 0 ? 1 : 0);

  const reset = () => {
    setLocalType(''); setLocalPrice(0); setLocalWard('Tất cả');
    setLocalWardIds(undefined); setLocalArea(0); setLocalAmenities([]);
  };

  const apply = () => onApply(localType, localPrice, localWard, localWardIds, localArea, localAmenities);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      {/* Backdrop */}
      <TouchableOpacity style={fs.backdrop} activeOpacity={1} onPress={onClose} />

      <Animated.View style={[fs.sheet, { transform: [{ translateY: slideAnim }], paddingBottom: insets.bottom + 16 }]}>
        {/* Handle */}
        <View style={fs.handle} />

        {/* Header row */}
        <View style={fs.sheetHeader}>
          <Text style={fs.sheetTitle}>Bộ lọc</Text>
          {activeCount > 0 && (
            <TouchableOpacity onPress={reset}>
              <Text style={fs.resetTxt}>Xóa tất cả ({activeCount})</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* ── Loại hình ── */}
          <Text style={fs.sectionTitle}>Loại hình</Text>
          <View style={fs.typeGrid}>
            {[
              { value: '',            icon: '🏘️', label: 'Tất cả',        sub: 'Mọi loại hình' },
              { value: 'apartment',   icon: '🏢', label: 'Phòng trọ',     sub: 'Thuê theo phòng' },
              { value: 'whole_house', icon: '🏠', label: 'Nguyên căn',    sub: 'Thuê nguyên căn' },
            ].map(f => {
              const active = localType === f.value;
              return (
                <TouchableOpacity
                  key={f.value}
                  style={[fs.typeCard, active && fs.typeCardActive]}
                  onPress={() => setLocalType(f.value)}
                  activeOpacity={0.8}
                >
                  <Text style={fs.typeIcon}>{f.icon}</Text>
                  <Text style={[fs.typeLabel, active && fs.typeLabelActive]}>{f.label}</Text>
                  <Text style={[fs.typeSub, active && fs.typeSubActive]}>{f.sub}</Text>
                  {active && <View style={fs.typeCheckDot} />}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Mức giá ── */}
          <Text style={fs.sectionTitle}>Mức giá / tháng</Text>
          <View style={fs.priceGrid}>
            {PRICE_FILTERS.map((f, i) => {
              const active = localPrice === i;
              return (
                <TouchableOpacity
                  key={i}
                  style={[fs.priceChip, active && fs.priceChipActive]}
                  onPress={() => setLocalPrice(i)}
                  activeOpacity={0.8}
                >
                  <Text style={[fs.priceChipTxt, active && fs.priceChipTxtActive]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Khu vực ── */}
          <Text style={fs.sectionTitle}>Khu vực</Text>
          <View style={fs.wardGrid}>
            {WARD_FILTERS.map((f, i) => {
              const active = localWard === f.label;
              return (
                <TouchableOpacity
                  key={i}
                  style={[fs.wardChip, active && fs.wardChipActive]}
                  onPress={() => {
                    setLocalWard(f.label);
                    setLocalWardIds(i === 0 ? undefined : f.wardIds);
                  }}
                  activeOpacity={0.8}
                >
                  {active && <Text style={fs.wardCheck}>✓ </Text>}
                  <Text style={[fs.wardChipTxt, active && fs.wardChipTxtActive]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Diện tích ── */}
          <Text style={fs.sectionTitle}>Diện tích phòng</Text>
          <View style={fs.priceGrid}>
            {AREA_FILTERS.map((f, i) => {
              const active = localArea === i;
              return (
                <TouchableOpacity
                  key={i}
                  style={[fs.priceChip, active && fs.priceChipActive]}
                  onPress={() => setLocalArea(i)}
                  activeOpacity={0.8}
                >
                  <Text style={[fs.priceChipTxt, active && fs.priceChipTxtActive]}>{f.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Tiện ích ── */}
          <Text style={fs.sectionTitle}>Tiện ích</Text>
          <View style={fs.amenityGrid}>
            {AMENITY_OPTIONS.map(a => {
              const active = localAmenities.includes(a.label);
              return (
                <TouchableOpacity
                  key={a.label}
                  style={[fs.amenityChip, active && fs.amenityChipActive]}
                  onPress={() => toggleAmenity(a.label)}
                  activeOpacity={0.8}
                >
                  <Text style={fs.amenityIcon}>{a.icon}</Text>
                  <Text style={[fs.amenityTxt, active && fs.amenityTxtActive]}>{a.label}</Text>
                  {active && <Text style={fs.amenityCheck}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* Apply button */}
        <TouchableOpacity style={fs.applyBtn} onPress={apply} activeOpacity={0.88}>
          <Text style={fs.applyTxt}>
            {activeCount > 0 ? `Áp dụng bộ lọc (${activeCount})` : 'Áp dụng'}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
};

const fs = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '88%', paddingHorizontal: Spacing.base,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.divider,
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.divider,
    marginBottom: Spacing.sm,
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
  resetTxt:   { fontSize: 13, color: Colors.error, fontWeight: '600' },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginTop: Spacing.lg, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.4 },

  // Type cards
  typeGrid: { flexDirection: 'row', gap: Spacing.sm },
  typeCard: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.md, borderRadius: 16,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white,
    position: 'relative',
  },
  typeCardActive: { borderColor: Brand.green, backgroundColor: Brand.greenTint },
  typeIcon:       { fontSize: 24, marginBottom: 4 },
  typeLabel:      { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  typeLabelActive:{ color: Brand.greenDark },
  typeSub:        { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },
  typeSubActive:  { color: Brand.greenDark + '99' },
  typeCheckDot: {
    position: 'absolute', top: 6, right: 6,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: Brand.green,
  },

  // Price chips — 3-col wrap
  priceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  priceChip: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, borderWidth: 1.5,
    borderColor: Colors.border, backgroundColor: Colors.white,
  },
  priceChipActive:    { backgroundColor: Brand.green, borderColor: Brand.green },
  priceChipTxt:       { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  priceChipTxtActive: { color: Colors.white },

  // Ward grid — wrap 2-3 col
  wardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  wardChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: 10, borderWidth: 1.5,
    borderColor: Colors.border, backgroundColor: Colors.white,
  },
  wardChipActive:    { backgroundColor: Brand.greenTint, borderColor: Brand.green },
  wardCheck:         { fontSize: 11, color: Brand.greenDark, fontWeight: '800' },
  wardChipTxt:       { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  wardChipTxtActive: { color: Brand.greenDark },

  // Amenity chips — 2-col wrap
  amenityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  amenityChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: 10, borderWidth: 1.5,
    borderColor: Colors.border, backgroundColor: Colors.white,
    minWidth: '45%', flex: 0,
  },
  amenityChipActive: { backgroundColor: Brand.greenTint, borderColor: Brand.green },
  amenityIcon:       { fontSize: 14 },
  amenityTxt:        { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  amenityTxtActive:  { color: '#059669' },
  amenityCheck:      { fontSize: 11, color: Brand.greenDark, fontWeight: '800' },

  // Apply
  applyBtn: {
    marginTop: Spacing.md, backgroundColor: Brand.green,
    paddingVertical: Spacing.md + 2, borderRadius: 14, alignItems: 'center',
  },
  applyTxt: { color: Colors.white, fontSize: 15, fontWeight: '800' },
});

// ── Search Overlay ─────────────────────────────────────────────────────────
export const SearchOverlay: React.FC<SearchOverlayProps> = ({ visible, onClose, properties, navigation }) => {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<any>(null);
  const [query,             setQuery]             = useState('');
  const [typeFilter,        setTypeFilter]        = useState('');
  const [priceIdx,          setPriceIdx]          = useState(0);
  const [wardFilter,        setWardFilter]        = useState<string[] | undefined>(undefined);
  const [wardLabel,         setWardLabel]         = useState('Tất cả');
  const [areaIdx,           setAreaIdx]           = useState(0);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [showFilterSheet,   setShowFilterSheet]   = useState(false);

  useEffect(() => {
    if (visible) {
      setQuery(''); setTypeFilter(''); setPriceIdx(0);
      setWardFilter(undefined); setWardLabel('Tất cả');
      setAreaIdx(0); setSelectedAmenities([]);
      setShowFilterSheet(false);
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [visible]);

  const priceRange = PRICE_FILTERS[priceIdx];
  const areaRange  = AREA_FILTERS[areaIdx];
  const activeFilterCount =
    (typeFilter !== '' ? 1 : 0) +
    (priceIdx !== 0 ? 1 : 0) +
    (wardLabel !== 'Tất cả' ? 1 : 0) +
    (areaIdx !== 0 ? 1 : 0) +
    (selectedAmenities.length > 0 ? 1 : 0);

  const passesFilters = (p: PropertyListing) => {
    if (typeFilter && p.propertyType !== typeFilter) return false;
    if (p.priceFrom > priceRange.max || p.priceFrom < priceRange.min) return false;
    if (wardFilter !== undefined && wardFilter.length > 0) {
      if (!wardFilter.some(w => p.ward?.toLowerCase().includes(w) || p.wardId === w)) return false;
    }
    if (areaIdx !== 0 && (p.area < areaRange.min || p.area > areaRange.max)) return false;
    if (selectedAmenities.length > 0) {
      if (!selectedAmenities.every(a => p.amenities.includes(a))) return false;
    }
    return true;
  };

  const filtered = (() => {
    const q = query.trim().toLowerCase();
    let pool = properties.filter(passesFilters);
    if (q.length >= 1) {
      pool = pool.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.address?.toLowerCase().includes(q) ||
        p.ward?.toLowerCase().includes(q)
      );
    }
    return pool.slice(0, 10);
  })();

  const hasFilter = activeFilterCount > 0;

  const goDetail = (id: string) => { onClose(); navigation.navigate('PropertyDetail', { propertyId: id }); };
  const goSearch = (filters: any) => { onClose(); navigation.navigate('SearchResult', { filters }); };

  const goSearchWithCurrentFilters = () => {
    const filters: any = { cityId: 'hcm' };
    if (query.trim())              filters.keyword      = query.trim();
    if (typeFilter)                filters.propertyType = typeFilter;
    if (priceIdx > 0 && priceRange.max !== Infinity) filters.maxPrice = priceRange.max;
    if (wardFilter)                filters.wardIds      = wardFilter;
    if (areaIdx !== 0)             filters.areaMin      = areaRange.min;
    if (areaIdx !== 0 && areaRange.max !== Infinity) filters.areaMax = areaRange.max;
    if (selectedAmenities.length > 0) filters.amenities = selectedAmenities;
    goSearch(filters);
  };

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: Colors.white }}>
        <View style={[ov.safeTop, { paddingTop: insets.top + 6 }]}>

          {/* ── Search input row ── */}
          <View style={ov.header}>
            <TouchableOpacity onPress={onClose} style={ov.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <IconBack />
            </TouchableOpacity>
            <View style={ov.inputWrap}>
              <Text style={ov.inputIcon}>🔍</Text>
              <TextInput
                ref={inputRef}
                style={ov.input}
                placeholder="Tìm khu vực, tên nhà, địa chỉ..."
                placeholderTextColor={Colors.textMuted}
                value={query}
                onChangeText={setQuery}
                returnKeyType="search"
                onSubmitEditing={goSearchWithCurrentFilters}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={ov.clearTxt}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            {/* Filter button with badge */}
            <TouchableOpacity
              style={[ov.filterToggle, hasFilter && ov.filterToggleActive]}
              onPress={() => setShowFilterSheet(true)}
              activeOpacity={0.8}
            >
              <IconFilter color={hasFilter ? Brand.greenDark : Colors.textSecondary} />
              {activeFilterCount > 0 && (
                <View style={ov.filterBadge}>
                  <Text style={ov.filterBadgeTxt}>{activeFilterCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Active filter pills summary */}
          {hasFilter && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={ov.activePillsRow}>
              {typeFilter !== '' && (
                <View style={ov.activePill}>
                  <Text style={ov.activePillTxt}>{typeFilter === 'apartment' ? '🏢 Phòng trọ' : '🏠 Nguyên căn'}</Text>
                  <TouchableOpacity onPress={() => setTypeFilter('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text style={ov.activePillX}> ✕</Text>
                  </TouchableOpacity>
                </View>
              )}
              {priceIdx !== 0 && (
                <View style={ov.activePill}>
                  <Text style={ov.activePillTxt}>💰 {PRICE_FILTERS[priceIdx].label}</Text>
                  <TouchableOpacity onPress={() => setPriceIdx(0)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text style={ov.activePillX}> ✕</Text>
                  </TouchableOpacity>
                </View>
              )}
              {wardLabel !== 'Tất cả' && (
                <View style={ov.activePill}>
                  <Text style={ov.activePillTxt}>📍 {wardLabel}</Text>
                  <TouchableOpacity onPress={() => { setWardLabel('Tất cả'); setWardFilter(undefined); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text style={ov.activePillX}> ✕</Text>
                  </TouchableOpacity>
                </View>
              )}
              {areaIdx !== 0 && (
                <View style={ov.activePill}>
                  <Text style={ov.activePillTxt}>📐 {AREA_FILTERS[areaIdx].label}</Text>
                  <TouchableOpacity onPress={() => setAreaIdx(0)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text style={ov.activePillX}> ✕</Text>
                  </TouchableOpacity>
                </View>
              )}
              {selectedAmenities.map(a => (
                <View key={a} style={ov.activePill}>
                  <Text style={ov.activePillTxt}>✅ {a}</Text>
                  <TouchableOpacity onPress={() => setSelectedAmenities(prev => prev.filter(x => x !== a))} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text style={ov.activePillX}> ✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {query.trim().length === 0 && !hasFilter ? (
            <>
              <Text style={ov.sectionLabel}>Gợi ý tìm kiếm</Text>
              <View style={ov.chipsWrap}>
                {SEARCH_SUGGESTIONS.map((sg, i) => (
                  <TouchableOpacity key={i} style={ov.suggChip} onPress={() => goSearch(sg.filters)} activeOpacity={0.7}>
                    <Text style={ov.suggChipIcon}>{sg.icon}</Text>
                    <Text style={ov.suggChipTxt}>{sg.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={ov.sectionLabel}>Đề xuất cho bạn</Text>
              {properties.slice(0, 5).map(p => (
                <SearchPropertyRow key={p.id} property={p} onPress={() => goDetail(p.id)} />
              ))}
            </>
          ) : filtered.length > 0 ? (
            <>
              <Text style={ov.sectionLabel}>Kết quả ({filtered.length})</Text>
              {filtered.map(p => (
                <SearchPropertyRow key={p.id} property={p} onPress={() => goDetail(p.id)} />
              ))}
              <TouchableOpacity style={ov.seeAllBtn} onPress={goSearchWithCurrentFilters}>
                <Text style={ov.seeAllTxt}>Xem tất cả kết quả →</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={ov.emptyWrap}>
              <Text style={ov.emptyEmoji}>🔍</Text>
              <Text style={ov.emptyTxt}>Không tìm thấy kết quả</Text>
              <Text style={ov.emptyHint}>Thử thay đổi từ khoá hoặc bộ lọc</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <FilterSheet
        visible={showFilterSheet}
        typeFilter={typeFilter}
        priceIdx={priceIdx}
        wardLabel={wardLabel}
        areaIdx={areaIdx}
        amenities={selectedAmenities}
        onApply={(type, price, ward, wardIds, area, amenities) => {
          setTypeFilter(type);
          setPriceIdx(price);
          setWardLabel(ward);
          setWardFilter(wardIds);
          setAreaIdx(area);
          setSelectedAmenities(amenities);
          setShowFilterSheet(false);
        }}
        onClose={() => setShowFilterSheet(false)}
      />
    </Modal>
  );
};

const ov = StyleSheet.create({
  safeTop: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  header:  {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingBottom: Spacing.md,
  },
  backBtn: { padding: 4 },

  // Ô nhập bo tròn hết cỡ cho khớp ô tìm kiếm ở khối đầu trang chủ — bấm vào đó là
  // mở ra đây, hai hình dạng phải nối tiếp nhau chứ không đổi kiểu giữa chừng.
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: Colors.background, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  inputIcon: { fontSize: 13 },
  input:     { flex: 1, fontSize: 14, color: Colors.textPrimary, padding: 0 },
  clearTxt:  { fontSize: 13, color: Colors.textMuted },

  filterToggle: {
    width: 40, height: 40, borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  filterToggleActive: { backgroundColor: Brand.greenTint, borderColor: Brand.green },
  filterBadge: {
    position: 'absolute', top: -3, right: -3,
    minWidth: 17, height: 17, borderRadius: 9,
    backgroundColor: Brand.red, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, borderWidth: 1.5, borderColor: Colors.white,
  },
  filterBadgeTxt: { color: Colors.white, fontSize: 9, fontWeight: '800' },

  activePillsRow: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.md, gap: Spacing.xs },
  activePill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Brand.greenTint, borderWidth: 1, borderColor: '#D6EDD7',
    paddingHorizontal: Spacing.md - 2, paddingVertical: 5, borderRadius: BorderRadius.full,
  },
  activePillTxt: { fontSize: 12, color: Brand.greenDark, fontWeight: '700' },
  activePillX:   { fontSize: 11, color: Brand.greenDark, fontWeight: '800' },

  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: Colors.textMuted,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.lg, paddingBottom: Spacing.sm,
    textTransform: 'uppercase', letterSpacing: 1,
  },

  // ── Chip gợi ý ──
  // Bản cũ tô đặc màu chàm cả sáu chip: sáu khối màu bằng nhau, không cái nào dẫn mắt
  // và chúng át luôn danh sách nhà bên dưới. Nay chip trắng viền mảnh, chỉ icon có màu.
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.base, gap: Spacing.sm },
  suggChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
    borderRadius: BorderRadius.full, borderWidth: 1,
    borderColor: Colors.border, backgroundColor: Colors.white,
  },
  suggChipIcon: { fontSize: 12 },
  suggChipTxt:  { fontSize: 13, color: Colors.textPrimary, fontWeight: '600' },

  // ── Dòng kết quả ──
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md - 1,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  rowImgWrap: {
    width: 64, height: 64, borderRadius: 14, overflow: 'hidden',
    backgroundColor: '#EDF1F5', alignItems: 'center', justifyContent: 'center',
  },
  rowImg:         { width: '100%', height: '100%' },
  rowImgFallback: { fontSize: 24, opacity: 0.45 },
  rowInfo:        { flex: 1 },
  rowName:        { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.2 },
  rowAddr:        { fontSize: 11.5, color: Colors.textSecondary, marginTop: 2 },
  rowMeta:        { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 5 },
  rowPrice:       { fontSize: 13, fontWeight: '800', color: Brand.greenDark },
  // Chưa có giá thì không tô đậm màu thương hiệu — đó không phải một con số để khoe.
  rowPriceSoft:   { color: Colors.textMuted, fontWeight: '600' },
  rowMetaSep:     { width: 3, height: 3, borderRadius: 2, backgroundColor: Colors.border },
  rowFree:        { fontSize: 11.5, color: Colors.textSecondary, fontWeight: '600' },
  rowArrow:       { fontSize: 20, color: Colors.textMuted },

  seeAllBtn: {
    marginHorizontal: Spacing.base, marginTop: Spacing.lg,
    paddingVertical: Spacing.md + 1, borderRadius: 14,
    backgroundColor: Brand.green, alignItems: 'center',
  },
  seeAllTxt: { fontSize: 14.5, color: Colors.white, fontWeight: '800' },

  emptyWrap:  { alignItems: 'center', paddingTop: 72, paddingHorizontal: Spacing.xl },
  emptyEmoji: { fontSize: 36, marginBottom: Spacing.md },
  emptyTxt:   { fontSize: 15.5, fontWeight: '800', color: Colors.textPrimary, marginBottom: 5 },
  emptyHint:  { fontSize: 12.5, color: Colors.textMuted, textAlign: 'center' },
});

