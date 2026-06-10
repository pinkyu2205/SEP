import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Linking, Alert, Dimensions, Animated,
  RefreshControl, TextInput, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { SkeletonCard } from '../../components/common';
import { searchService } from '../../services';
import { PropertyListing } from '../../types';
import { GuestStackParamList } from '../../navigation/GuestStackNavigator';
import { formatCurrency } from '../../utils/helpers';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
type NavigationProp = NativeStackNavigationProp<GuestStackParamList>;

const HOTLINE         = '19008386';
const HOTLINE_DISPLAY = '1900 8386';
const HERO_IMAGE      = 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800';

const QUICK_CHIPS = [
  { label: 'Thủ Đức',    wardIds: ['hcm-lc', 'hcm-lt'] },
  { label: 'Bình Thạnh', wardIds: ['hcm-p25', 'hcm-p13'] },
  { label: 'Quận 7',     wardIds: ['hcm-tp', 'hcm-bt', 'hcm-pm'] },
  { label: 'Gò Vấp',     wardIds: [] },
];

const AREA_CHIPS = [
  { label: 'TP.HCM',     cityId: 'hcm', wardIds: undefined },
  { label: 'Thủ Đức',    cityId: 'hcm', wardIds: ['hcm-lc', 'hcm-lt'] },
  { label: 'Bình Thạnh', cityId: 'hcm', wardIds: ['hcm-p25', 'hcm-p13'] },
  { label: 'Quận 7',     cityId: 'hcm', wardIds: ['hcm-tp', 'hcm-bt', 'hcm-pm'] },
  { label: 'Gò Vấp',     cityId: 'hcm', wardIds: [] },
  { label: 'Quận 1',     cityId: 'hcm', wardIds: ['hcm-bn', 'hcm-dk'] },
  { label: 'Tân Bình',   cityId: 'hcm', wardIds: ['hcm-tb'] },
];

const PROPERTY_TYPES = [
  {
    id: 'apartment',
    icon: '🏢',
    label: 'Thuê Theo Phòng',
    sub: 'Phòng trọ, sinh viên',
    bg: '#FFF7ED',
    accent: '#EA580C',
    propertyType: 'apartment' as const,
  },
  {
    id: 'whole_house',
    icon: '🏠',
    label: 'Thuê Nguyên Căn',
    sub: 'Gia đình, nhóm bạn',
    bg: '#EEF2FF',
    accent: Colors.primary,
    propertyType: 'whole_house' as const,
  },
];

// ── Availability badge helper ──────────────────────────────────────────────
function availBadge(available: number) {
  if (available > 0) return { emoji: '🟢', label: 'Còn trống', color: Colors.success, bg: Colors.successLight };
  return null;
}

// ── Featured property card ─────────────────────────────────────────────────
const HomeCard: React.FC<{ property: PropertyListing; onPress: () => void; index: number }> = ({
  property, onPress, index,
}) => {
  const fade  = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(24)).current;
  const isWH  = property.propertyType === 'whole_house';
  const badge = availBadge(property.availableRooms);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 320, delay: index * 55, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 320, delay: index * 55, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>
      <TouchableOpacity style={card.wrap} onPress={onPress} activeOpacity={0.88}>
        {/* Image */}
        <View style={card.imgWrap}>
          {property.photos?.[0] ? (
            <Image source={{ uri: property.photos[0] }} style={card.img} resizeMode="cover" />
          ) : (
            <View style={card.imgFallback}><Text style={{ fontSize: 44 }}>🏠</Text></View>
          )}
          <View style={card.scrim} />
          <View style={[card.typePill, isWH ? card.typePillGreen : card.typePillIndigo]}>
            <Text style={card.typePillTxt}>{isWH ? '🏡 Nguyên căn' : '🏢 Theo phòng'}</Text>
          </View>
          <Text style={card.priceOverlay}>{formatCurrency(property.priceFrom)}/tháng</Text>
        </View>
        {/* Info */}
        <View style={card.body}>
          <Text style={card.name} numberOfLines={1}>{property.name}</Text>
          <Text style={card.addr} numberOfLines={1}>📍 {property.ward}, {property.city}</Text>
          <View style={card.row}>
            {badge && (
              <View style={[card.availPill, { backgroundColor: badge.bg }]}>
                <Text style={[card.availTxt, { color: badge.color }]}>{badge.emoji} {badge.label}</Text>
              </View>
            )}
            <Text style={card.area}>📐 {property.area}m²</Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const card = StyleSheet.create({
  wrap: { backgroundColor: Colors.white, borderRadius: 20, marginBottom: Spacing.md, overflow: 'hidden', ...Shadow.md },
  imgWrap: { width: '100%', height: 210, backgroundColor: Colors.primaryBg },
  img: { width: '100%', height: '100%' },
  imgFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryBg },
  scrim: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 96, backgroundColor: 'rgba(0,0,0,0.40)' },
  typePill: { position: 'absolute', top: Spacing.sm, left: Spacing.sm, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99 },
  typePillIndigo: { backgroundColor: 'rgba(79,70,229,0.90)' },
  typePillGreen:  { backgroundColor: 'rgba(16,185,129,0.90)' },
  typePillTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  priceOverlay: {
    position: 'absolute', bottom: Spacing.sm, left: Spacing.sm,
    color: '#fff', fontSize: 17, fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.65)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  body: { padding: Spacing.md, paddingTop: Spacing.sm + 2 },
  name: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 3 },
  addr: { fontSize: 12, color: Colors.textSecondary, marginBottom: Spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  availPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99 },
  availTxt: { fontSize: 11, fontWeight: '700' },
  area: { fontSize: 12, color: Colors.textMuted, fontWeight: '500' },
});

// ============================================================================
// Search Overlay
// ============================================================================
const SEARCH_SUGGESTIONS = [
  { label: '🏢 Phòng trọ Thủ Đức',      filters: { propertyType: 'apartment',   wardIds: ['hcm-lc', 'hcm-lt'],    cityId: 'hcm' } },
  { label: '🏠 Nhà nguyên căn Quận 7',  filters: { propertyType: 'whole_house', wardIds: ['hcm-tp', 'hcm-bt'],   cityId: 'hcm' } },
  { label: '📍 Bình Thạnh',             filters: { wardIds: ['hcm-p25', 'hcm-p13'],                              cityId: 'hcm' } },
  { label: '💰 Phòng dưới 3 triệu',     filters: { propertyType: 'apartment',   maxPrice: 3000000,               cityId: 'hcm' } },
  { label: '🏡 Nhà nguyên căn Tân Bình',filters: { propertyType: 'whole_house', wardIds: ['hcm-tb'],             cityId: 'hcm' } },
  { label: '📍 Gò Vấp',                 filters: { cityId: 'hcm' } },
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

const SearchPropertyRow: React.FC<{ property: PropertyListing; onPress: () => void }> = ({ property, onPress }) => (
  <TouchableOpacity style={ov.row} onPress={onPress} activeOpacity={0.78}>
    <View style={ov.rowImgWrap}>
      {property.photos?.[0]
        ? <Image source={{ uri: property.photos[0] }} style={ov.rowImg} resizeMode="cover" />
        : <Text style={{ fontSize: 26 }}>🏠</Text>
      }
    </View>
    <View style={ov.rowInfo}>
      <Text style={ov.rowName} numberOfLines={1}>{property.name}</Text>
      <Text style={ov.rowAddr} numberOfLines={1}>📍 {property.ward}, {property.city}</Text>
      <Text style={ov.rowPrice}>{formatCurrency(property.priceFrom)}/tháng</Text>
    </View>
    <Text style={ov.rowArrow}>›</Text>
  </TouchableOpacity>
);

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
  typeCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  typeIcon:       { fontSize: 24, marginBottom: 4 },
  typeLabel:      { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  typeLabelActive:{ color: Colors.primary },
  typeSub:        { fontSize: 10, color: Colors.textMuted, textAlign: 'center' },
  typeSubActive:  { color: Colors.primary + '99' },
  typeCheckDot: {
    position: 'absolute', top: 6, right: 6,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.primary,
  },

  // Price chips — 3-col wrap
  priceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  priceChip: {
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, borderWidth: 1.5,
    borderColor: Colors.border, backgroundColor: Colors.white,
  },
  priceChipActive:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
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
  wardChipActive:    { backgroundColor: '#EEF2FF', borderColor: Colors.primary },
  wardCheck:         { fontSize: 11, color: Colors.primary, fontWeight: '800' },
  wardChipTxt:       { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  wardChipTxtActive: { color: Colors.primary },

  // Amenity chips — 2-col wrap
  amenityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  amenityChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: 10, borderWidth: 1.5,
    borderColor: Colors.border, backgroundColor: Colors.white,
    minWidth: '45%', flex: 0,
  },
  amenityChipActive: { backgroundColor: '#F0FDF4', borderColor: '#059669' },
  amenityIcon:       { fontSize: 14 },
  amenityTxt:        { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  amenityTxtActive:  { color: '#059669' },
  amenityCheck:      { fontSize: 11, color: '#059669', fontWeight: '800' },

  // Apply
  applyBtn: {
    marginTop: Spacing.md, backgroundColor: Colors.primary,
    paddingVertical: Spacing.md + 2, borderRadius: 14, alignItems: 'center',
  },
  applyTxt: { color: Colors.white, fontSize: 15, fontWeight: '800' },
});

// ── Search Overlay ─────────────────────────────────────────────────────────
const SearchOverlay: React.FC<SearchOverlayProps> = ({ visible, onClose, properties, navigation }) => {
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
              <Text style={ov.backTxt}>←</Text>
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
              <Text style={[ov.filterToggleTxt, hasFilter && ov.filterToggleTxtActive]}>⚙️</Text>
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
                  <TouchableOpacity key={i} style={ov.suggChip} onPress={() => goSearch(sg.filters)}>
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
  safeTop:        { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  header:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm },
  backBtn:        { padding: 4 },
  backTxt:        { fontSize: 22, color: Colors.textPrimary, fontWeight: '600' },
  inputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.background, borderRadius: 12,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 1,
    borderWidth: 1, borderColor: Colors.border,
  },
  inputIcon:  { fontSize: 13, color: Colors.textMuted },
  input:      { flex: 1, fontSize: 14, color: Colors.textPrimary, paddingVertical: 3 },
  clearTxt:   { fontSize: 13, color: Colors.textMuted },
  filterToggle: {
    width: 38, height: 38, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  filterToggleActive:    { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  filterToggleTxt:       { fontSize: 16 },
  filterToggleTxtActive: { color: Colors.primary },
  filterBadge: {
    position: 'absolute', top: -5, right: -5,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },

  activePillsRow: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm, gap: Spacing.xs },
  activePill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.primaryBg, borderWidth: 1, borderColor: Colors.primaryLight,
    paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full,
  },
  activePillTxt: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  activePillX:   { fontSize: 11, color: Colors.primary, fontWeight: '700' },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, paddingHorizontal: Spacing.base, paddingTop: Spacing.lg, paddingBottom: Spacing.xs, textTransform: 'uppercase', letterSpacing: 0.3 },

  chipsWrap:    { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.base, gap: Spacing.xs },
  suggChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 7,
    borderRadius: BorderRadius.full, borderWidth: 1,
    borderColor: Colors.primaryLight, backgroundColor: Colors.primaryBg,
  },
  suggChipTxt: { fontSize: 13, color: Colors.primary, fontWeight: '600' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  rowImgWrap: { width: 60, height: 60, borderRadius: 12, overflow: 'hidden', backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  rowImg:     { width: '100%', height: '100%' },
  rowInfo:    { flex: 1 },
  rowName:    { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  rowAddr:    { fontSize: 11, color: Colors.textSecondary, marginBottom: 3 },
  rowPrice:   { fontSize: 13, fontWeight: '700', color: Colors.primary },
  rowArrow:   { fontSize: 20, color: Colors.textMuted },

  seeAllBtn: {
    marginHorizontal: Spacing.base, marginTop: Spacing.lg,
    paddingVertical: Spacing.md, borderRadius: 12,
    backgroundColor: Colors.primaryBg, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.primaryLight,
  },
  seeAllTxt: { fontSize: 14, color: Colors.primary, fontWeight: '700' },

  emptyWrap:  { alignItems: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 40, marginBottom: Spacing.md },
  emptyTxt:   { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 6 },
  emptyHint:  { fontSize: 13, color: Colors.textMuted },
});

// ============================================================================
export const GuestHomeScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets     = useSafeAreaInsets();

  const [featured,      setFeatured]      = useState<PropertyListing[]>([]);
  const [newListings,   setNewListings]   = useState<PropertyListing[]>([]);
  const [allProperties, setAllProperties] = useState<PropertyListing[]>([]);
  const [counts,        setCounts]        = useState({ apartment: 0, whole_house: 0 });
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [activeTab,     setActiveTab]     = useState<'featured' | 'new'>('featured');
  const [showSearch,    setShowSearch]    = useState(false);

  const contentFade = useRef(new Animated.Value(0)).current;

  useEffect(() => { loadData(); }, []);

  const loadData = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const [featuredData, allResult] = await Promise.all([
        searchService.getFeaturedProperties(),
        searchService.searchProperties({ cityId: 'hcm', limit: 50 }),
      ]);
      setFeatured(featuredData);
      setNewListings([...featuredData].reverse());
      const all = allResult.properties;
      setAllProperties(all);
      setCounts({
        apartment:   all.filter(p => p.propertyType === 'apartment').length,
        whole_house: all.filter(p => p.propertyType === 'whole_house').length,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
      Animated.timing(contentFade, { toValue: 1, duration: 380, useNativeDriver: true }).start();
    }
  };

  const onRefresh = useCallback(() => { setRefreshing(true); loadData(true); }, []);

  const callHotline = () =>
    Linking.openURL(`tel:${HOTLINE}`).catch(() =>
      Alert.alert('Hotline', `Vui lòng gọi: ${HOTLINE_DISPLAY}`)
    );

  const displayCards = activeTab === 'featured' ? featured : newListings;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe} edges={['top']}>

      {/* ══════════════════════════════════════════════════════════════════
          HEADER — Logo + Hotline only
      ══════════════════════════════════════════════════════════════════ */}
      <View style={s.header}>
        <View style={s.logoRow}>
          <View style={s.logoIconBox}>
            <Text style={s.logoEmoji}>🏠</Text>
          </View>
          <View>
            <Text style={s.brandName}>Hoàng Bình Land</Text>
            <Text style={s.brandSub}>Tìm nhà ưng ý tại TP.HCM</Text>
          </View>
        </View>
        <TouchableOpacity style={s.hotlineHeaderBtn} onPress={callHotline} activeOpacity={0.85}>
          <Text style={s.hotlineHeaderIcon}>📞</Text>
          <Text style={s.hotlineHeaderTxt}>{HOTLINE_DISPLAY}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* ══════════════════════════════════════════════════════════════
            SECTION 1 — COMPACT HERO
        ══════════════════════════════════════════════════════════════ */}
        <View style={s.hero}>
          <Image source={{ uri: HERO_IMAGE }} style={StyleSheet.absoluteFillObject as any} resizeMode="cover" />
          <View style={s.heroOverlay} />
          <View style={s.heroContent}>
            <Text style={s.heroTitle}>Tìm nhà lý tưởng{'\n'}tại TP. Hồ Chí Minh</Text>
            <Text style={s.heroSub}>Hàng trăm bất động sản đang chờ bạn.</Text>
          </View>
        </View>

        <Animated.View style={{ opacity: contentFade }}>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 2 — SMART SEARCH (fake bar → opens overlay)
          ══════════════════════════════════════════════════════════════ */}
          <TouchableOpacity style={s.searchCard} onPress={() => setShowSearch(true)} activeOpacity={0.85}>
            <View style={s.searchRow}>
              <Text style={s.searchIcon}>🔍</Text>
              <Text style={s.searchPlaceholder}>Tìm khu vực, tên nhà, địa chỉ...</Text>
              <View style={s.searchBtn}>
                <Text style={s.searchBtnTxt}>Tìm</Text>
              </View>
            </View>
          </TouchableOpacity>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 3 — PROPERTY TYPES
          ══════════════════════════════════════════════════════════════ */}
          <View style={s.section}>
            {PROPERTY_TYPES.map((t) => (
              <TouchableOpacity
                key={t.id}
                style={[s.typeCard, { backgroundColor: t.bg }]}
                onPress={() => navigation.navigate('SearchResult', { filters: { propertyType: t.propertyType } })}
                activeOpacity={0.82}
              >
                <Text style={s.typeIcon}>{t.icon}</Text>
                <View style={s.typeInfo}>
                  <Text style={[s.typeLabel, { color: t.accent }]}>{t.label}</Text>
                  <Text style={[s.typeSub, { color: t.accent + '99' }]}>{t.sub}</Text>
                </View>
                <View style={s.typeRight}>
                  {counts[t.propertyType] > 0 && (
                    <View style={[s.typeCountBadge, { backgroundColor: t.accent }]}>
                      <Text style={s.typeCountTxt}>{counts[t.propertyType]} BĐS</Text>
                    </View>
                  )}
                  <Text style={[s.typeArrow, { color: t.accent }]}>›</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 4 — FEATURED DISCOVERY (TABBED)
          ══════════════════════════════════════════════════════════════ */}
          <View style={s.section}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitle}>⭐ Khám Phá Nổi Bật</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Search')}>
                <Text style={s.seeAll}>Xem tất cả →</Text>
              </TouchableOpacity>
            </View>

            {/* Tabs */}
            <View style={s.tabRow}>
              {(['featured', 'new'] as const).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={[s.tab, activeTab === tab && s.tabActive]}
                  onPress={() => setActiveTab(tab)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.tabTxt, activeTab === tab && s.tabTxtActive]}>
                    {tab === 'featured' ? 'Nổi Bật' : 'Mới Nhất'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Cards */}
            {loading ? (
              [0, 1, 2].map(i => <SkeletonCard key={i} variant="horizontal" />)
            ) : displayCards.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyTxt}>Chưa có bất động sản nào.</Text>
              </View>
            ) : (
              displayCards.map((p, i) => (
                <HomeCard
                  key={p.id}
                  property={p}
                  index={i}
                  onPress={() => navigation.navigate('PropertyDetail', { propertyId: p.id })}
                />
              ))
            )}
          </View>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 5 — POPULAR AREAS
          ══════════════════════════════════════════════════════════════ */}
          <View style={s.areaSection}>
            <Text style={s.areaSectionTitle}>🗺️ Khu vực phổ biến</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.areaChipsScroll}>
              {AREA_CHIPS.map((chip) => (
                <TouchableOpacity
                  key={chip.label}
                  style={s.areaChip}
                  onPress={() => navigation.navigate('SearchResult', {
                    filters: { cityId: chip.cityId, wardIds: chip.wardIds?.length ? chip.wardIds : undefined },
                  })}
                  activeOpacity={0.75}
                >
                  <Text style={s.areaChipTxt}>{chip.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 6 — HOTLINE CTA
          ══════════════════════════════════════════════════════════════ */}
          <View style={s.section}>
            <View style={s.ctaCard}>
              <View style={s.ctaTop}>
                <Text style={s.ctaEmoji}>💬</Text>
                <View style={s.ctaTextBlock}>
                  <Text style={s.ctaTitle}>Chưa tìm được căn phù hợp?</Text>
                  <Text style={s.ctaDesc}>Đội ngũ Hoàng Bình Land luôn sẵn sàng hỗ trợ bạn.</Text>
                </View>
              </View>
              <TouchableOpacity style={s.ctaBtn} onPress={callHotline} activeOpacity={0.85}>
                <Text style={s.ctaBtnIcon}>📞</Text>
                <Text style={s.ctaBtnLabel}>Gọi Ngay  {HOTLINE_DISPLAY}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ══════════════════════════════════════════════════════════════
              TENANT LOGIN — secondary, below all discovery content
          ══════════════════════════════════════════════════════════════ */}
          <View style={s.section}>
            <View style={s.tenantCard}>
              <View style={s.tenantRow}>
                <View style={s.tenantIconBox}>
                  <Text style={s.tenantIcon}>🔑</Text>
                </View>
                <View style={s.tenantText}>
                  <Text style={s.tenantTitle}>Đã là khách thuê?</Text>
                  <Text style={s.tenantDesc}>Đăng nhập để quản lý hợp đồng, hóa đơn và các dịch vụ thuê nhà.</Text>
                </View>
              </View>
              <TouchableOpacity
                style={s.tenantLoginBtn}
                onPress={() => navigation.navigate('Login')}
                activeOpacity={0.85}
              >
                <Text style={s.tenantLoginTxt}>Đăng Nhập Tenant Portal</Text>
              </TouchableOpacity>
            </View>
          </View>

        </Animated.View>
      </ScrollView>

      <SearchOverlay
        visible={showSearch}
        onClose={() => setShowSearch(false)}
        properties={allProperties.length > 0 ? allProperties : featured}
        navigation={navigation}
      />
    </SafeAreaView>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
    ...Shadow.sm,
  },
  logoRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logoIconBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center',
  },
  logoEmoji:  { fontSize: 18 },
  brandName:  { fontSize: 15, fontWeight: '800', color: Colors.primary, letterSpacing: -0.3 },
  brandSub:   { fontSize: 10, color: Colors.textSecondary },
  hotlineHeaderBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#059669', paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2, borderRadius: BorderRadius.full,
  },
  hotlineHeaderIcon: { fontSize: 14 },
  hotlineHeaderTxt:  { fontSize: 13, fontWeight: '800', color: '#fff' },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero:        { height: 158, overflow: 'hidden', backgroundColor: Colors.primaryDark },
  heroOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12,18,40,0.62)' },
  heroContent: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.lg, gap: Spacing.xs },
  heroTitle: {
    color: Colors.white, fontSize: 19, fontWeight: '800',
    lineHeight: 26, letterSpacing: -0.3,
  },
  heroSub: { color: 'rgba(255,255,255,0.72)', fontSize: 12 },
  // ── Search card ───────────────────────────────────────────────────────────
  searchCard: {
    backgroundColor: Colors.white, marginHorizontal: Spacing.base,
    marginTop: -20, borderRadius: 18, padding: Spacing.md,
    ...Shadow.lg,
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    backgroundColor: Colors.background, borderRadius: 12,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm,
  },
  searchIcon:  { fontSize: 14, color: Colors.textMuted },
  searchInput:       { flex: 1, fontSize: 13, color: Colors.textPrimary, paddingVertical: Spacing.xs + 1 },
  searchPlaceholder: { flex: 1, fontSize: 13, color: Colors.textMuted, paddingVertical: Spacing.xs + 1 },
  searchClear: { fontSize: 13, color: Colors.textMuted, paddingHorizontal: 2 },
  searchBtn: {
    backgroundColor: Colors.primary, paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2, borderRadius: BorderRadius.full,
  },
  searchBtnTxt: { color: Colors.white, fontSize: 12, fontWeight: '700' },
  chipsScroll:  { gap: Spacing.xs, paddingRight: 4 },
  quickChip: {
    backgroundColor: Colors.primaryBg, borderWidth: 1, borderColor: Colors.primaryLight,
    paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: BorderRadius.full,
  },
  quickChipTxt: { fontSize: 12, color: Colors.primary, fontWeight: '600' },

  // ── Section ───────────────────────────────────────────────────────────────
  section:          { paddingHorizontal: Spacing.base, marginTop: Spacing.xl },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  sectionTitle:     { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.2 },
  seeAll:           { fontSize: 13, color: Colors.primary, fontWeight: '600' },

  // ── Property types ────────────────────────────────────────────────────────
  typeCard: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 16,
    padding: Spacing.base, marginBottom: Spacing.sm, gap: Spacing.md,
  },
  typeIcon:  { fontSize: 32 },
  typeInfo:  { flex: 1 },
  typeLabel: { fontSize: 15, fontWeight: '800' },
  typeSub:   { fontSize: 11, fontWeight: '500', marginTop: 2 },
  typeRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  typeCountBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  typeCountTxt:   { fontSize: 10, fontWeight: '700', color: Colors.white },
  typeArrow:      { fontSize: 24, fontWeight: '300' },

  // ── Tabs ──────────────────────────────────────────────────────────────────
  tabRow: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.md },
  tab: {
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full, backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
  },
  tabActive:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabTxt:       { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  tabTxtActive: { color: Colors.white },

  // ── Empty ─────────────────────────────────────────────────────────────────
  emptyBox: { alignItems: 'center', paddingVertical: Spacing['3xl'] },
  emptyTxt: { fontSize: 14, color: Colors.textMuted },

  // ── Area chips ────────────────────────────────────────────────────────────
  areaSection:      { marginTop: Spacing.xl, paddingHorizontal: Spacing.base },
  areaSectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  areaChipsScroll:  { gap: Spacing.xs, paddingRight: Spacing.base },
  areaChip: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 1,
    borderRadius: BorderRadius.full, ...Shadow.sm,
  },
  areaChipTxt: { fontSize: 12, color: Colors.textPrimary, fontWeight: '600' },

  // ── Hotline CTA ───────────────────────────────────────────────────────────
  ctaCard: { backgroundColor: Colors.primaryDark, borderRadius: 20, padding: Spacing.lg, ...Shadow.lg },
  ctaTop:  { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg, alignItems: 'flex-start' },
  ctaEmoji: { fontSize: 34, marginTop: 2 },
  ctaTextBlock: { flex: 1 },
  ctaTitle: { fontSize: 16, fontWeight: '800', color: Colors.white, marginBottom: 5, lineHeight: 22 },
  ctaDesc:  { fontSize: 12, color: 'rgba(255,255,255,0.70)', lineHeight: 17 },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#059669', borderRadius: 14, paddingVertical: Spacing.md, gap: Spacing.sm,
  },
  ctaBtnIcon:  { fontSize: 18 },
  ctaBtnLabel: { color: Colors.white, fontSize: 16, fontWeight: '800', letterSpacing: 0.2 },

  // ── Tenant login (secondary) ──────────────────────────────────────────────
  tenantCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: Spacing.base,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  tenantRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md, alignItems: 'flex-start' },
  tenantIconBox: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  tenantIcon:  { fontSize: 20 },
  tenantText:  { flex: 1 },
  tenantTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: 3 },
  tenantDesc:  { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  tenantLoginBtn: {
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: 12,
    paddingVertical: Spacing.sm + 1, alignItems: 'center',
  },
  tenantLoginTxt: { fontSize: 13, fontWeight: '700', color: Colors.primary },
});
