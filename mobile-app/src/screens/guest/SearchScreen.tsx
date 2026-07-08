import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Spacing, BorderRadius, Typography, Shadow } from '@/constants';
import { SearchBar, FilterChips, PickerModal } from '@/components/common';
import { searchService } from '@/services';
import { City, Ward, SearchFilters } from '@/types';
import { GuestStackParamList } from '@/navigation/GuestStackNavigator';

type NavigationProp = NativeStackNavigationProp<GuestStackParamList, 'Search'>;
type RouteProps = RouteProp<GuestStackParamList, 'Search'>;

const AMENITIES_OPTIONS = [
  { id: 'Máy lạnh', label: 'Máy lạnh', icon: '❄️' },
  { id: 'Wifi', label: 'Wifi', icon: '📶' },
  { id: 'Máy giặt', label: 'Máy giặt', icon: '🧺' },
  { id: 'Giữ xe', label: 'Giữ xe', icon: '🅿️' },
  { id: 'Bảo vệ', label: 'Bảo vệ', icon: '🔒' },
  { id: 'Bếp riêng', label: 'Bếp riêng', icon: '🍳' },
  { id: 'Gác lửng', label: 'Gác lửng', icon: '🌙' },
  { id: 'Ban công', label: 'Ban công', icon: '🏗️' },
];

const AREA_OPTIONS = [
  { id: '<20', label: 'Dưới 20m²' },
  { id: '20-30', label: '20 - 30m²' },
  { id: '30-40', label: '30 - 40m²' },
  { id: '>40', label: 'Trên 40m²' },
];

export const SearchScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();

  const [keyword, setKeyword] = useState('');

  // City state
  const [cities, setCities] = useState<City[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<string>('');
  const [cityModalVisible, setCityModalVisible] = useState(false);

  // Ward state
  const [wards, setWards] = useState<Ward[]>([]);
  const [selectedWardIds, setSelectedWardIds] = useState<string[]>([]);
  const [wardModalVisible, setWardModalVisible] = useState(false);

  // Other filters
  const [priceMin, setPriceMin] = useState(route.params?.priceMin ? route.params.priceMin.toString() : '');
  const [priceMax, setPriceMax] = useState(route.params?.priceMax ? route.params.priceMax.toString() : '');
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnims = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(20))
  ).current;

  useEffect(() => {
    loadCities();
    if (route.params?.cityId) {
      handleSelectCity(route.params.cityId);
    }

    // Entrance animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    const stagger = slideAnims.map((anim, i) =>
      Animated.timing(anim, {
        toValue: 0,
        duration: 350,
        delay: i * 60,
        useNativeDriver: true,
      })
    );
    Animated.stagger(60, stagger).start();
  }, []);

  const loadCities = async () => {
    const data = await searchService.getCities();
    setCities(data);
  };

  const loadWards = async (cityId: string) => {
    const data = await searchService.getWards(cityId);
    setWards(data);
  };

  const handleSelectCity = (id: string) => {
    setSelectedCityId(id);
    setSelectedWardIds([]); // Reset wards when city changes
    loadWards(id);
  };

  const handleToggleWard = (id: string) => {
    setSelectedWardIds(prev =>
      prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]
    );
  };

  const handleToggleAmenity = (id: string) => {
    setSelectedAmenities(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  const handleSearch = () => {
    const filters: SearchFilters = {};
    if (keyword.trim()) filters.keyword = keyword.trim();
    if (selectedCityId) filters.cityId = selectedCityId;
    if (selectedWardIds.length > 0) filters.wardIds = selectedWardIds;
    if (priceMin) filters.priceMin = parseInt(priceMin);
    if (priceMax) filters.priceMax = parseInt(priceMax);
    if (selectedAmenities.length > 0) filters.amenities = selectedAmenities;

    if (selectedAreaId) {
      if (selectedAreaId === '<20') filters.areaMax = 20;
      else if (selectedAreaId === '20-30') { filters.areaMin = 20; filters.areaMax = 30; }
      else if (selectedAreaId === '30-40') { filters.areaMin = 30; filters.areaMax = 40; }
      else if (selectedAreaId === '>40') filters.areaMin = 40;
    }

    navigation.navigate('SearchResult', { filters });
  };

  const resetFilters = () => {
    setKeyword('');
    setSelectedCityId('');
    setSelectedWardIds([]);
    setWards([]);
    setPriceMin('');
    setPriceMax('');
    setSelectedAreaId('');
    setSelectedAmenities([]);
  };

  const activeFilterCount = [
    keyword.trim(),
    selectedCityId,
    selectedWardIds.length > 0,
    priceMin,
    priceMax,
    selectedAreaId,
    selectedAmenities.length > 0,
  ].filter(Boolean).length;

  const selectedCityName = cities.find(c => c.id === selectedCityId)?.name;

  const renderAnimatedSection = (index: number, children: React.ReactNode) => (
    <Animated.View
      style={[
        styles.section,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnims[index] }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Tìm kiếm</Text>
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* Keyword Search */}
        {renderAnimatedSection(0,
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>🔎</Text>
              <Text style={styles.sectionTitle}>Từ khoá</Text>
            </View>
            <SearchBar
              mode="active"
              placeholder="Tên nhà trọ, địa chỉ..."
              value={keyword}
              onChangeText={setKeyword}
              autoFocus={!route.params?.cityId && !route.params?.priceMax}
            />
          </View>
        )}

        {/* Location Picker */}
        {renderAnimatedSection(1,
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>📍</Text>
              <Text style={styles.sectionTitle}>Vị trí</Text>
            </View>

            <Text style={styles.label}>Thành phố</Text>
            <TouchableOpacity
              style={styles.pickerBtn}
              onPress={() => setCityModalVisible(true)}
            >
              <Text style={selectedCityId ? styles.pickerText : styles.pickerPlaceholder}>
                {selectedCityName || 'Chọn Thành phố'}
              </Text>
              <Text style={styles.pickerIcon}>▼</Text>
            </TouchableOpacity>

            <Text style={[styles.label, { marginTop: Spacing.md }]}>Phường / Xã</Text>
            <TouchableOpacity
              style={[styles.pickerBtn, !selectedCityId && styles.pickerDisabled]}
              disabled={!selectedCityId}
              onPress={() => setWardModalVisible(true)}
            >
              <Text style={selectedWardIds.length > 0 ? styles.pickerText : styles.pickerPlaceholder}>
                {selectedWardIds.length > 0
                  ? `Đã chọn ${selectedWardIds.length} phường`
                  : 'Chọn Phường / Xã'}
              </Text>
              <Text style={styles.pickerIcon}>▼</Text>
            </TouchableOpacity>

            {wards.length > 0 && (
              <View style={styles.quickWards}>
                <FilterChips
                  options={wards.map(w => ({ id: w.id, label: w.name }))}
                  selected={selectedWardIds}
                  onToggle={handleToggleWard}
                  multiSelect={true}
                  scrollable={true}
                />
              </View>
            )}
          </View>
        )}

        {/* Price Range */}
        {renderAnimatedSection(2,
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>💰</Text>
              <Text style={styles.sectionTitle}>Khoảng giá</Text>
            </View>
            <Text style={styles.label}>Khoảng giá (VNĐ)</Text>
            <View style={styles.row}>
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  placeholder="Từ (VD: 2000000)"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                  value={priceMin}
                  onChangeText={setPriceMin}
                />
              </View>
              <Text style={styles.dash}>—</Text>
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  placeholder="Đến (VD: 5000000)"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                  value={priceMax}
                  onChangeText={setPriceMax}
                />
              </View>
            </View>
          </View>
        )}

        {/* Area */}
        {renderAnimatedSection(3,
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>📐</Text>
              <Text style={styles.sectionTitle}>Diện tích</Text>
            </View>
            <FilterChips
              options={AREA_OPTIONS}
              selected={selectedAreaId ? [selectedAreaId] : []}
              onToggle={(id) => setSelectedAreaId(id === selectedAreaId ? '' : id)}
              multiSelect={false}
            />
          </View>
        )}

        {/* Amenities */}
        {renderAnimatedSection(4,
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>✨</Text>
              <Text style={styles.sectionTitle}>Tiện ích</Text>
            </View>
            <FilterChips
              options={AMENITIES_OPTIONS}
              selected={selectedAmenities}
              onToggle={handleToggleAmenity}
              multiSelect={true}
            />
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Action Buttons */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.resetBtn} onPress={resetFilters}>
          <Text style={styles.resetText}>↺ Xóa bộ lọc</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          <Text style={styles.searchText}>🔍 Tìm kiếm</Text>
        </TouchableOpacity>
      </View>

      {/* Modals */}
      <PickerModal
        visible={cityModalVisible}
        title="Chọn Thành phố"
        options={cities.map(c => ({ id: c.id, label: c.name, subtitle: `${c.availableRooms} căn hộ trống` }))}
        selected={selectedCityId ? [selectedCityId] : []}
        onSelect={handleSelectCity}
        onClose={() => setCityModalVisible(false)}
      />

      <PickerModal
        visible={wardModalVisible}
        title="Chọn Phường / Xã"
        options={wards.map(w => ({ id: w.id, label: w.name, subtitle: `${w.availableRooms} căn hộ trống` }))}
        selected={selectedWardIds}
        onSelect={handleToggleWard}
        onClose={() => setWardModalVisible(false)}
        multiSelect={true}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.base,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    ...Shadow.sm,
  },
  backBtn: {
    padding: Spacing.xs,
    width: 40,
  },
  backIcon: {
    fontSize: 24,
    color: Colors.textPrimary,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    ...Typography.h3,
  },
  filterBadge: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    minWidth: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
  },
  filterBadgeText: {
    ...Typography.caption,
    color: Colors.white,
    fontWeight: '700',
    fontSize: 12,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.base,
    gap: Spacing.md,
  },
  section: {},
  sectionCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    ...Shadow.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  sectionIcon: {
    fontSize: 18,
  },
  sectionTitle: {
    ...Typography.h4,
  },
  label: {
    ...Typography.label,
    marginBottom: Spacing.sm,
  },
  pickerBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  pickerDisabled: {
    backgroundColor: Colors.divider,
    opacity: 0.6,
  },
  pickerText: {
    fontSize: 15,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  pickerPlaceholder: {
    fontSize: 15,
    color: Colors.textMuted,
  },
  pickerIcon: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  quickWards: {
    marginTop: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputWrap: {
    flex: 1,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    height: 46,
    paddingHorizontal: Spacing.sm,
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  dash: {
    marginHorizontal: Spacing.md,
    color: Colors.textSecondary,
    fontSize: 16,
  },
  footer: {
    flexDirection: 'row',
    padding: Spacing.base,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    gap: Spacing.md,
    ...Shadow.md,
  },
  resetBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resetText: {
    ...Typography.button,
    color: Colors.textSecondary,
  },
  searchBtn: {
    flex: 2,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  searchText: {
    ...Typography.button,
    color: Colors.white,
  },
});
