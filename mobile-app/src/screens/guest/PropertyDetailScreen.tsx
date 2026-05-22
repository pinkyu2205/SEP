import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Spacing, BorderRadius, Typography, Shadow } from '../../constants';
import { FilterChips, Card } from '../../components/common';
import { searchService } from '../../services';
import { PropertyListing } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import { GuestStackParamList } from '../../navigation/GuestStackNavigator';

type NavigationProp = NativeStackNavigationProp<GuestStackParamList, 'PropertyDetail'>;
type RouteProps = RouteProp<GuestStackParamList, 'PropertyDetail'>;

export const PropertyDetailScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { propertyId } = route.params;

  const [property, setProperty] = useState<PropertyListing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [propertyId]);

  const loadData = async () => {
    try {
      const data = await searchService.getPropertyDetail(propertyId);
      setProperty(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleContact = () => {
    Alert.alert(
      'Yêu cầu đăng nhập',
      'Vui lòng đăng nhập để có thể liên hệ và đặt phòng với chủ nhà.',
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Đăng nhập', onPress: () => navigation.navigate('Login') }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!property) {
    return (
      <View style={styles.centerContainer}>
        <Text>Không tìm thấy thông tin nhà trọ.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Header (Absolute over scroll view) */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Text style={styles.iconBtnText}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={handleContact}>
          <Text style={styles.iconBtnText}>♡</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.container}>
        {/* Photo Carousel (Simulated) */}
        <View style={styles.photoContainer}>
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoIcon}>🏠</Text>
            <Text style={styles.photoCount}>1/4</Text>
          </View>
        </View>

        <View style={styles.content}>
          {/* Title & Address */}
          <Text style={styles.title}>{property.name}</Text>
          <Text style={styles.address}>📍 {property.address}, {property.ward}, {property.district}</Text>

          {/* Cost Breakdown */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>💰 Chi phí</Text>
            
            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Thuê phòng</Text>
              <Text style={styles.costValue}>{formatCurrency(property.priceFrom)} - {formatCurrency(property.priceTo)}</Text>
            </View>
            <View style={styles.costDivider} />
            
            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Tiền điện</Text>
              <Text style={styles.costValue}>{formatCurrency(property.electricityRate)} / kWh</Text>
            </View>
            <View style={styles.costDivider} />
            
            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Tiền nước</Text>
              <Text style={styles.costValue}>{formatCurrency(property.waterRate)} / khối</Text>
            </View>
            <View style={styles.costDivider} />
            
            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Tiền cọc</Text>
              <Text style={styles.costValue}>{property.depositMonths} tháng</Text>
            </View>
            <View style={styles.costDivider} />
            
            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Phí dịch vụ</Text>
              <Text style={styles.costValue}>{formatCurrency(property.serviceFee)} / tháng</Text>
            </View>
          </Card>

          {/* Amenities */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏠 Tiện ích</Text>
            <View pointerEvents="none">
              <FilterChips
                options={property.amenities.map(a => ({ id: a, label: a }))}
                selected={property.amenities}
                onToggle={() => {}}
                multiSelect={true}
              />
            </View>
          </View>

          {/* Available Rooms */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🚪 Phòng trống ({property.availableRooms}/{property.totalRooms})</Text>
            {property.rooms.filter(r => r.status === 'available').map(room => (
              <View key={room.id} style={styles.roomCard}>
                <View style={styles.roomInfo}>
                  <Text style={styles.roomName}>{room.name}</Text>
                  <Text style={styles.roomMeta}>Tầng {room.floor} • {room.area}m²</Text>
                  <Text style={styles.roomStatus}>🟢 Sẵn sàng cho thuê</Text>
                </View>
                <Text style={styles.roomPrice}>{formatCurrency(room.price)}</Text>
              </View>
            ))}
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📝 Mô tả</Text>
            <Text style={styles.descriptionText}>{property.description}</Text>
          </View>
          
          <View style={{ height: Spacing['4xl'] }} />
        </View>
      </ScrollView>

      {/* Footer CTA */}
      <View style={styles.footer}>
        <Text style={styles.footerNote}>💡 Đăng nhập để liên hệ và đặt phòng</Text>
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleContact}>
            <Text style={styles.secondaryBtnText}>💬 Nhắn tin</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleContact}>
            <Text style={styles.primaryBtnText}>📞 Liên hệ ngay</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    position: 'absolute',
    top: 40,
    left: Spacing.base,
    right: Spacing.base,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  iconBtnText: {
    fontSize: 20,
    color: Colors.textPrimary,
  },
  container: {
    flex: 1,
  },
  photoContainer: {
    height: 280,
  },
  photoPlaceholder: {
    flex: 1,
    backgroundColor: Colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoIcon: {
    fontSize: 64,
  },
  photoCount: {
    position: 'absolute',
    bottom: Spacing.md,
    right: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: Colors.white,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    padding: Spacing.lg,
    paddingTop: Spacing.xl,
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    marginTop: -20,
  },
  title: {
    ...Typography.h2,
    marginBottom: Spacing.xs,
  },
  address: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionCard: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.h4,
    marginBottom: Spacing.md,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  costLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  costValue: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  costDivider: {
    height: 1,
    backgroundColor: Colors.divider,
  },
  roomCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  roomInfo: {
    flex: 1,
  },
  roomName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  roomMeta: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  roomStatus: {
    fontSize: 12,
    color: Colors.success,
    fontWeight: '500',
  },
  roomPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.error,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 22,
    color: Colors.textPrimary,
  },
  footer: {
    backgroundColor: Colors.white,
    padding: Spacing.base,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    ...Shadow.lg,
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 12,
    color: Colors.warning,
    fontWeight: '500',
    marginBottom: Spacing.sm,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: Colors.white,
    ...Typography.button,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: Colors.primaryBg,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: Colors.primaryDark,
    ...Typography.button,
  }
});
