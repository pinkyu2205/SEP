import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants';
import { SearchBar, FilterChips, PickerModal } from '../../components/common';
import { searchService } from '../../services';
import { District, Ward, SearchFilters } from '../../types';
import { GuestStackParamList } from '../../navigation/GuestStackNavigator';

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
  
  // District state
  const [districts, setDistricts] = useState<District[]>([]);
  const [selectedDistrictId, setSelectedDistrictId] = useState<string>('');
  const [districtModalVisible, setDistrictModalVisible] = useState(false);

  // Ward state
  const [wards, setWards] = useState<Ward[]>([]);
  const [selectedWardIds, setSelectedWardIds] = useState<string[]>([]);
  const [wardModalVisible, setWardModalVisible] = useState(false);

  // Other filters
  const [priceMin, setPriceMin] = useState(route.params?.priceMin ? route.params.priceMin.toString() : '');
  const [priceMax, setPriceMax] = useState(route.params?.priceMax ? route.params.priceMax.toString() : '');
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);

  useEffect(() => {
    loadDistricts();
    if (route.params?.districtId) {
      handleSelectDistrict(route.params.districtId);
    }
  }, []);

  const loadDistricts = async () => {
    const data = await searchService.getDistricts();
    setDistricts(data);
  };

  const loadWards = async (districtId: string) => {
    const data = await searchService.getWards(districtId);
    setWards(data);
  };

  const handleSelectDistrict = (id: string) => {
    setSelectedDistrictId(id);
    setSelectedWardIds([]); // Reset wards when district changes
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
    if (selectedDistrictId) filters.districtId = selectedDistrictId;
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
    setSelectedDistrictId('');
    setSelectedWardIds([]);
    setPriceMin('');
    setPriceMax('');
    setSelectedAreaId('');
    setSelectedAmenities([]);
  };

  const selectedDistrictName = districts.find(d => d.id === selectedDistrictId)?.name;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tìm kiếm</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        
        {/* Keyword Search */}
        <View style={styles.section}>
          <SearchBar 
            mode="active" 
            placeholder="Tên nhà trọ, địa chỉ..." 
            value={keyword}
            onChangeText={setKeyword}
            autoFocus={!route.params?.districtId && !route.params?.priceMax}
          />
        </View>

        {/* Location Picker */}
        <View style={styles.section}>
          <Text style={styles.label}>Quận / Huyện</Text>
          <TouchableOpacity 
            style={styles.pickerBtn}
            onPress={() => setDistrictModalVisible(true)}
          >
            <Text style={selectedDistrictId ? styles.pickerText : styles.pickerPlaceholder}>
              {selectedDistrictName || 'Chọn Quận / Huyện'}
            </Text>
            <Text style={styles.pickerIcon}>▼</Text>
          </TouchableOpacity>

          <Text style={[styles.label, { marginTop: Spacing.md }]}>Phường / Xã</Text>
          <TouchableOpacity 
            style={[styles.pickerBtn, !selectedDistrictId && styles.pickerDisabled]}
            disabled={!selectedDistrictId}
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

        {/* Price Range */}
        <View style={styles.section}>
          <Text style={styles.label}>Khoảng giá (VNĐ)</Text>
          <View style={styles.row}>
            <View style={styles.inputWrap}>
              <TextInput 
                style={styles.input}
                placeholder="Từ (VD: 2000000)"
                keyboardType="numeric"
                value={priceMin}
                onChangeText={setPriceMin}
              />
            </View>
            <Text style={styles.dash}>-</Text>
            <View style={styles.inputWrap}>
              <TextInput 
                style={styles.input}
                placeholder="Đến (VD: 5000000)"
                keyboardType="numeric"
                value={priceMax}
                onChangeText={setPriceMax}
              />
            </View>
          </View>
        </View>

        {/* Area */}
        <View style={styles.section}>
          <Text style={styles.label}>Diện tích</Text>
          <FilterChips
            options={AREA_OPTIONS}
            selected={selectedAreaId ? [selectedAreaId] : []}
            onToggle={(id) => setSelectedAreaId(id === selectedAreaId ? '' : id)}
            multiSelect={false}
          />
        </View>

        {/* Amenities */}
        <View style={styles.section}>
          <Text style={styles.label}>Tiện ích</Text>
          <FilterChips
            options={AMENITIES_OPTIONS}
            selected={selectedAmenities}
            onToggle={handleToggleAmenity}
            multiSelect={true}
          />
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Action Buttons */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.resetBtn} onPress={resetFilters}>
          <Text style={styles.resetText}>↺ Xóa</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          <Text style={styles.searchText}>🔍 Tìm kiếm</Text>
        </TouchableOpacity>
      </View>

      {/* Modals */}
      <PickerModal
        visible={districtModalVisible}
        title="Chọn Quận / Huyện"
        options={districts.map(d => ({ id: d.id, label: d.name, subtitle: `${d.availableRooms} phòng trống` }))}
        selected={selectedDistrictId ? [selectedDistrictId] : []}
        onSelect={handleSelectDistrict}
        onClose={() => setDistrictModalVisible(false)}
      />
      
      <PickerModal
        visible={wardModalVisible}
        title="Chọn Phường / Xã"
        options={wards.map(w => ({ id: w.id, label: w.name, subtitle: `${w.availableRooms} phòng trống` }))}
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
  },
  backBtn: {
    padding: Spacing.xs,
    width: 40,
  },
  backIcon: {
    fontSize: 24,
    color: Colors.textPrimary,
  },
  headerTitle: {
    ...Typography.h3,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  label: {
    ...Typography.label,
    marginBottom: Spacing.sm,
  },
  pickerBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  pickerDisabled: {
    backgroundColor: Colors.background,
    opacity: 0.7,
  },
  pickerText: {
    fontSize: 15,
    color: Colors.textPrimary,
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
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    height: 44,
    paddingHorizontal: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  dash: {
    marginHorizontal: Spacing.md,
    color: Colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    padding: Spacing.base,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    gap: Spacing.md,
  },
  resetBtn: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.background,
    alignItems: 'center',
  },
  resetText: {
    ...Typography.button,
    color: Colors.textSecondary,
  },
  searchBtn: {
    flex: 2,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  searchText: {
    ...Typography.button,
    color: Colors.white,
  }
});
