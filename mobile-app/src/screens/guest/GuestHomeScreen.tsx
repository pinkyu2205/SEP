import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { Colors, Spacing, BorderRadius, Typography, Shadow } from '../../constants';
import { SearchBar, PropertyCard, DistrictCard, FilterChips, Card } from '../../components/common';
import { searchService } from '../../services';
import { District, PropertyListing } from '../../types';
import { GuestStackParamList } from '../../navigation/GuestStackNavigator';

type NavigationProp = NativeStackNavigationProp<GuestStackParamList>;

export const GuestHomeScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  
  const [districts, setDistricts] = useState<District[]>([]);
  const [nearbyProperties, setNearbyProperties] = useState<PropertyListing[]>([]);
  const [selectedRadius, setSelectedRadius] = useState('5');
  const [locationEnabled, setLocationEnabled] = useState(false);

  useEffect(() => {
    loadData();
  }, [selectedRadius]);

  const loadData = async () => {
    try {
      const dists = await searchService.getDistricts();
      setDistricts(dists);

      // Thử lấy location
      let hasLocation = false;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const location = await Location.getCurrentPositionAsync({});
          hasLocation = true;
          setLocationEnabled(true);
          const nearby = await searchService.getNearbyProperties({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            radiusKm: parseInt(selectedRadius),
            limit: 5
          });
          setNearbyProperties(nearby.length > 0 ? nearby : await searchService.getFeaturedProperties());
        }
      } catch (err) {
        console.log("Location error", err);
      }

      if (!hasLocation) {
        setLocationEnabled(false);
        const featured = await searchService.getFeaturedProperties();
        setNearbyProperties(featured);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const priceRanges = [
    { id: '2tr', label: 'Dưới 2 triệu', max: 2000000 },
    { id: '2-3tr', label: '2 - 3 triệu', min: 2000000, max: 3000000 },
    { id: '3-5tr', label: '3 - 5 triệu', min: 3000000, max: 5000000 },
    { id: '5tr', label: 'Trên 5 triệu', min: 5000000 },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        
        {/* Header Gradient Area */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.logoText}>🏠 RoomRent</Text>
            <TouchableOpacity 
              style={styles.loginBtn}
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={styles.loginBtnText}>Đăng nhập</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.headerSubtitle}>Tìm kiếm phòng trọ dễ dàng, minh bạch.</Text>
        </View>

        {/* Search Bar - Overlapping */}
        <View style={styles.searchWrapper}>
          <SearchBar 
            mode="compact" 
            placeholder="Tìm phòng trọ theo khu vực..." 
            onPress={() => navigation.navigate('Search')}
          />
        </View>

        {/* Nearby / Featured Properties */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {locationEnabled ? '📍 Phòng gần bạn' : '✨ Phòng nổi bật'}
            </Text>
          </View>
          
          {locationEnabled && (
            <View style={styles.radiusSelector}>
              <FilterChips
                options={[
                  { id: '3', label: 'Bán kính 3km' },
                  { id: '5', label: 'Bán kính 5km' },
                  { id: '10', label: 'Bán kính 10km' }
                ]}
                selected={[selectedRadius]}
                onToggle={(id) => setSelectedRadius(id)}
                multiSelect={false}
                scrollable
              />
            </View>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
            {nearbyProperties.map(prop => (
              <PropertyCard 
                key={prop.id} 
                property={prop} 
                variant="vertical" 
                onPress={() => navigation.navigate('PropertyDetail', { propertyId: prop.id })}
              />
            ))}
          </ScrollView>
        </View>

        {/* Popular Districts */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🗺️ Khu vực phổ biến</Text>
          <View style={styles.grid}>
            {districts.slice(0, 6).map(district => (
              <View key={district.id} style={styles.gridItem}>
                <DistrictCard 
                  district={district} 
                  onPress={() => navigation.navigate('Search', { districtId: district.id })}
                />
              </View>
            ))}
          </View>
        </View>

        {/* Price Ranges */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💰 Khoảng giá</Text>
          <FilterChips
            options={priceRanges.map(r => ({ id: r.id, label: r.label }))}
            selected={[]}
            onToggle={(id) => {
              const range = priceRanges.find(r => r.id === id);
              navigation.navigate('Search', { priceMin: range?.min, priceMax: range?.max });
            }}
            multiSelect={false}
            scrollable
          />
        </View>

        {/* Why Choose Us */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🌟 Tại sao chọn RoomRent?</Text>
          <View style={styles.featuresList}>
            <Card style={styles.featureCard}>
              <Text style={styles.featureIcon}>✅</Text>
              <Text style={styles.featureTitle}>Hợp đồng minh bạch</Text>
              <Text style={styles.featureDesc}>Ký điện tử an toàn, rõ ràng các điều khoản.</Text>
            </Card>
            <Card style={styles.featureCard}>
              <Text style={styles.featureIcon}>✅</Text>
              <Text style={styles.featureTitle}>Theo dõi hóa đơn</Text>
              <Text style={styles.featureDesc}>Tiền điện nước cập nhật real-time hàng tháng.</Text>
            </Card>
            <Card style={styles.featureCard}>
              <Text style={styles.featureIcon}>✅</Text>
              <Text style={styles.featureTitle}>Bảo trì 1 chạm</Text>
              <Text style={styles.featureDesc}>Gửi yêu cầu sửa chữa tức thì đến chủ nhà.</Text>
            </Card>
          </View>
        </View>

        {/* Bottom CTA */}
        <TouchableOpacity 
          style={styles.ctaButton}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.9}
        >
          <Text style={styles.ctaText}>🔐 Đăng nhập để quản lý phòng</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: Spacing['4xl'],
  },
  header: {
    backgroundColor: Colors.primary,
    padding: Spacing.lg,
    paddingBottom: Spacing['3xl'],
    borderBottomLeftRadius: BorderRadius.xl,
    borderBottomRightRadius: BorderRadius.xl,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  logoText: {
    ...Typography.h2,
    color: Colors.white,
  },
  loginBtn: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.white,
  },
  loginBtnText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
  },
  searchWrapper: {
    marginTop: -24,
    marginHorizontal: Spacing.lg,
    zIndex: 10,
  },
  section: {
    marginTop: Spacing['2xl'],
    paddingHorizontal: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h3,
    marginBottom: Spacing.sm,
  },
  radiusSelector: {
    marginBottom: Spacing.sm,
  },
  hScroll: {
    paddingRight: Spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -Spacing.xs,
  },
  gridItem: {
    width: '50%',
  },
  featuresList: {
    gap: Spacing.sm,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
  featureIcon: {
    fontSize: 24,
    marginRight: Spacing.md,
  },
  featureTitle: {
    ...Typography.h4,
    fontSize: 16,
    marginBottom: 2,
  },
  featureDesc: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  ctaButton: {
    backgroundColor: Colors.primary,
    margin: Spacing.lg,
    marginTop: Spacing['3xl'],
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    ...Shadow.lg,
  },
  ctaText: {
    color: Colors.white,
    ...Typography.button,
  }
});
