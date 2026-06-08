import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Modal, Animated, Dimensions,
  FlatList
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Spacing, BorderRadius, Typography, Shadow } from '../../constants';
import { FilterChips, Card, PropertyCard } from '../../components/common';
import { searchService } from '../../services';
import { PropertyListing, PropertyRoom } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import { GuestStackParamList } from '../../navigation/GuestStackNavigator';

type NavigationProp = NativeStackNavigationProp<GuestStackParamList, 'PropertyDetail'>;
type RouteProps = RouteProp<GuestStackParamList, 'PropertyDetail'>;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ==================== Room Detail Bottom Sheet ====================
interface RoomDetailSheetProps {
  visible: boolean;
  room: PropertyRoom | null;
  propertyName: string;
  onClose: () => void;
}

const RoomDetailSheet: React.FC<RoomDetailSheetProps> = ({ visible, room, propertyName, onClose }) => {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible]);

  if (!room) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={sheetStyles.overlay} activeOpacity={1} onPress={onClose}>
        <Animated.View
          style={[sheetStyles.container, { transform: [{ translateY: slideAnim }] }]}
        >
          <TouchableOpacity activeOpacity={1}>
            {/* Handle Bar */}
            <View style={sheetStyles.handleBar} />

            {/* Room Title */}
            <View style={sheetStyles.header}>
              <Text style={sheetStyles.roomName}>{room.name}</Text>
              <Text style={sheetStyles.propertyName}>🏠 {propertyName}</Text>
            </View>

            {/* Room Photos (simulated) */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={sheetStyles.photoScroll}>
              {(room.photos && room.photos.length > 0 ? room.photos : [null]).map((photo, idx) => (
                <View key={idx} style={sheetStyles.photoCard}>
                  <Text style={sheetStyles.photoIcon}>{photo ? '🖼️' : '📷'}</Text>
                  <Text style={sheetStyles.photoLabel}>Ảnh {idx + 1}</Text>
                </View>
              ))}
            </ScrollView>

            {/* Room Info */}
            <View style={sheetStyles.infoRow}>
              <View style={sheetStyles.infoPill}>
                <Text style={sheetStyles.infoPillIcon}>📐</Text>
                <Text style={sheetStyles.infoPillText}>{room.area}m²</Text>
              </View>
              <View style={sheetStyles.infoPill}>
                <Text style={sheetStyles.infoPillIcon}>🏢</Text>
                <Text style={sheetStyles.infoPillText}>Tầng {room.floor}</Text>
              </View>
              {room.price > 0 && (
                <View style={[sheetStyles.infoPill, { backgroundColor: Colors.errorLight }]}>
                  <Text style={sheetStyles.infoPillIcon}>💰</Text>
                  <Text style={[sheetStyles.infoPillText, { color: Colors.error }]}>{formatCurrency(room.price)}</Text>
                </View>
              )}
            </View>

            {/* Room Description */}
            {room.description && (
              <View style={sheetStyles.section}>
                <Text style={sheetStyles.sectionTitle}>📝 Mô tả</Text>
                <Text style={sheetStyles.descText}>{room.description}</Text>
              </View>
            )}

            {/* Room Equipments */}
            {room.equipments && room.equipments.length > 0 && (
              <View style={sheetStyles.section}>
                <Text style={sheetStyles.sectionTitle}>🪑 Nội thất trong phòng</Text>
                <View style={sheetStyles.equipmentGrid}>
                  {room.equipments.map((eq, idx) => (
                    <View key={idx} style={sheetStyles.equipmentChip}>
                      <Text style={sheetStyles.equipmentIcon}>✅</Text>
                      <Text style={sheetStyles.equipmentText}>{eq}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {(room.equipments === undefined || room.equipments.length === 0) && (
              <View style={sheetStyles.section}>
                <Text style={sheetStyles.sectionTitle}>🪑 Nội thất trong phòng</Text>
                <Text style={sheetStyles.emptyText}>Phòng trống, không có nội thất sẵn.</Text>
              </View>
            )}

          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
};

const sheetStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.85,
    paddingBottom: 40,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  roomName: {
    ...Typography.h2,
    fontSize: 20,
    marginBottom: 4,
  },
  propertyName: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  photoScroll: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  photoCard: {
    width: 140,
    height: 100,
    backgroundColor: Colors.primaryBg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.primaryLight,
  },
  photoIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  photoLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  infoRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  infoPillIcon: {
    fontSize: 14,
  },
  infoPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.h4,
    marginBottom: Spacing.sm,
  },
  descText: {
    fontSize: 14,
    lineHeight: 22,
    color: Colors.textSecondary,
  },
  equipmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  equipmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.successLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    gap: 4,
  },
  equipmentIcon: {
    fontSize: 12,
  },
  equipmentText: {
    fontSize: 12,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
});

// ==================== Expandable Room Accordion ====================
interface ExpandableRoomProps {
  room: PropertyRoom;
  onPress: () => void;
  isWholeHouse: boolean;
}

const ExpandableRoom: React.FC<ExpandableRoomProps> = ({ room, onPress, isWholeHouse }) => {
  const [expanded, setExpanded] = useState(false);
  const animHeight = useRef(new Animated.Value(0)).current;

  const toggleExpand = () => {
    if (isWholeHouse) {
      // For whole house, use accordion expand
      const toValue = expanded ? 0 : 1;
      Animated.timing(animHeight, { toValue, duration: 300, useNativeDriver: false }).start();
      setExpanded(!expanded);
    } else {
      // For apartments, open the bottom sheet
      onPress();
    }
  };

  const maxExpandHeight = animHeight.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 200],
  });

  return (
    <View style={accordionStyles.container}>
      <TouchableOpacity style={accordionStyles.header} onPress={toggleExpand} activeOpacity={0.7}>
        <View style={accordionStyles.headerLeft}>
          <View style={[accordionStyles.statusDot, room.status === 'available' ? accordionStyles.dotAvailable : accordionStyles.dotOccupied]} />
          <View>
            <Text style={accordionStyles.roomName}>{room.name}</Text>
            <Text style={accordionStyles.roomMeta}>
              Tầng {room.floor} • {room.area}m²
              {room.status === 'available' ? ' • 🟢 Sẵn sàng' : ' • 🔴 Đã thuê'}
            </Text>
          </View>
        </View>
        <View style={accordionStyles.headerRight}>
          {room.price > 0 && <Text style={accordionStyles.roomPrice}>{formatCurrency(room.price)}</Text>}
          <Text style={accordionStyles.chevron}>{isWholeHouse ? (expanded ? '▲' : '▼') : '→'}</Text>
        </View>
      </TouchableOpacity>

      {isWholeHouse && (
        <Animated.View style={[accordionStyles.expandBody, { maxHeight: maxExpandHeight, opacity: animHeight }]}>
          {room.description && (
            <Text style={accordionStyles.expandDesc}>{room.description}</Text>
          )}
          {room.equipments && room.equipments.length > 0 ? (
            <View style={accordionStyles.expandEquipments}>
              {room.equipments.map((eq, i) => (
                <View key={i} style={accordionStyles.eqChip}>
                  <Text style={accordionStyles.eqChipText}>✅ {eq}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={accordionStyles.expandEmpty}>Phòng trống, không có nội thất.</Text>
          )}
          {/* Tap to see full detail */}
          <TouchableOpacity style={accordionStyles.seeMoreBtn} onPress={onPress}>
            <Text style={accordionStyles.seeMoreText}>📸 Xem ảnh & chi tiết đầy đủ →</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
};

const accordionStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: Spacing.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotAvailable: {
    backgroundColor: Colors.success,
  },
  dotOccupied: {
    backgroundColor: Colors.textMuted,
  },
  roomName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  roomMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  roomPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.error,
  },
  chevron: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  expandBody: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    overflow: 'hidden',
  },
  expandDesc: {
    fontSize: 13,
    lineHeight: 20,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  expandEquipments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  eqChip: {
    backgroundColor: Colors.successLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  eqChipText: {
    fontSize: 11,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  expandEmpty: {
    fontSize: 13,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: Spacing.sm,
  },
  seeMoreBtn: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  seeMoreText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },
});

// ==================== Main Property Detail Screen ====================
export const PropertyDetailScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { propertyId } = route.params;

  const [property, setProperty] = useState<PropertyListing | null>(null);
  const [similarProperties, setSimilarProperties] = useState<PropertyListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<PropertyRoom | null>(null);
  const [showRoomDetail, setShowRoomDetail] = useState(false);
  const [showStickyAddress, setShowStickyAddress] = useState(false);

  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadData();
  }, [propertyId]);

  const loadData = async () => {
    try {
      const [data, similar] = await Promise.all([
        searchService.getPropertyDetail(propertyId),
        searchService.getSimilarProperties(propertyId, 3),
      ]);
      setProperty(data);
      setSimilarProperties(similar);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenRoomDetail = (room: PropertyRoom) => {
    setSelectedRoom(room);
    setShowRoomDetail(true);
  };

  const handleContact = () => {
    Alert.alert(
      'Yêu cầu đăng nhập',
      'Vui lòng đăng nhập để có thể liên hệ và đặt căn hộ với chủ nhà.',
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Đăng nhập', onPress: () => navigation.navigate('Login') }
      ]
    );
  };

  const handleScroll = (event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    setShowStickyAddress(offsetY > 300);
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
        <Text>Không tìm thấy thông tin căn hộ.</Text>
      </View>
    );
  }

  const isWholeHouse = property.propertyType === 'whole_house';
  const availableRooms = property.rooms.filter(r => r.status === 'available');

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Fixed Header with Back + Favorite */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Text style={styles.iconBtnText}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={handleContact}>
          <Text style={styles.iconBtnText}>♡</Text>
        </TouchableOpacity>
      </View>

      {/* Sticky Address Bar (shows on scroll) */}
      {showStickyAddress && (
        <View style={styles.stickyAddress}>
          <Text style={styles.stickyAddressText} numberOfLines={1}>
            📍 {property.address}, {property.ward}
          </Text>
        </View>
      )}

      <ScrollView style={styles.container} onScroll={handleScroll} scrollEventThrottle={16}>
        {/* Photo Carousel (Simulated) */}
        <View style={styles.photoContainer}>
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoIcon}>🏠</Text>
            <Text style={styles.photoCount}>1/{property.photos.length || 1}</Text>
          </View>
          {/* Property type badge */}
          <View style={[styles.typeBadge, isWholeHouse && styles.typeBadgeHouse]}>
            <Text style={styles.typeBadgeText}>
              {isWholeHouse ? '🏡 Nhà nguyên căn' : '🏢 Căn hộ dịch vụ'}
            </Text>
          </View>
        </View>

        <View style={styles.content}>
          {/* Title & Address */}
          <Text style={styles.title}>{property.name}</Text>
          <Text style={styles.address}>📍 {property.address}, {property.ward}, {property.city}</Text>

          {/* Cost Breakdown */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>💰 Chi phí</Text>
            
            <View style={styles.costRow}>
              <Text style={styles.costLabel}>{isWholeHouse ? 'Thuê nhà' : 'Thuê căn hộ'}</Text>
              <Text style={styles.costValue}>
                {property.priceFrom === property.priceTo 
                  ? formatCurrency(property.priceFrom)
                  : `${formatCurrency(property.priceFrom)} - ${formatCurrency(property.priceTo)}`
                }
              </Text>
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

            {property.serviceFee > 0 && (
              <>
                <View style={styles.costRow}>
                  <Text style={styles.costLabel}>Phí dịch vụ</Text>
                  <Text style={styles.costValue}>{formatCurrency(property.serviceFee)} / tháng</Text>
                </View>
                <View style={styles.costDivider} />
              </>
            )}
            
            <View style={styles.costRow}>
              <Text style={styles.costLabel}>Hình thức thanh toán</Text>
              <Text style={[styles.costValue, { color: Colors.primary }]}>{property.paymentNote || 'Trả đầu tháng'}</Text>
            </View>
          </Card>

          {/* Amenities */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏠 Tiện ích {isWholeHouse ? 'nhà' : 'tòa nhà'}</Text>
            <View pointerEvents="none">
              <FilterChips
                options={property.amenities.map(a => ({ id: a, label: a }))}
                selected={property.amenities}
                onToggle={() => {}}
                multiSelect={true}
              />
            </View>
          </View>

          {/* House Equipment (for whole house only) */}
          {isWholeHouse && property.houseEquipments && property.houseEquipments.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🪑 Nội thất chung toàn nhà</Text>
              <View style={styles.houseEquipGrid}>
                {property.houseEquipments.map((eq, idx) => (
                  <View key={idx} style={styles.houseEquipChip}>
                    <Text style={styles.houseEquipIcon}>✅</Text>
                    <Text style={styles.houseEquipText}>{eq}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Rooms Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {isWholeHouse 
                ? `🏡 Cấu trúc phòng trong nhà (${property.rooms.length} phòng)` 
                : `🚪 Căn hộ trống (${availableRooms.length}/${property.totalRooms})`}
            </Text>
            
            {isWholeHouse && (
              <View style={styles.wholeHouseNote}>
                <Text style={styles.wholeHouseNoteText}>
                  💡 Bấm vào từng phòng để xem nội thất chi tiết bên trong
                </Text>
              </View>
            )}

            {(isWholeHouse ? property.rooms : availableRooms).map(room => (
              <ExpandableRoom
                key={room.id}
                room={room}
                isWholeHouse={isWholeHouse}
                onPress={() => handleOpenRoomDetail(room)}
              />
            ))}
          </View>

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📝 Mô tả chi tiết</Text>
            <Text style={styles.descriptionText}>{property.description}</Text>
          </View>

          {/* Similar Properties */}
          {similarProperties.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🔍 Căn hộ tương tự</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {similarProperties.map(sp => (
                  <PropertyCard
                    key={sp.id}
                    property={sp}
                    variant="vertical"
                    onPress={() => navigation.push('PropertyDetail', { propertyId: sp.id })}
                  />
                ))}
              </ScrollView>
            </View>
          )}
          
          <View style={{ height: Spacing['4xl'] }} />
        </View>
      </ScrollView>

      {/* Footer CTA */}
      <View style={styles.footer}>
        <Text style={styles.footerNote}>💡 Đăng nhập để liên hệ và đặt {isWholeHouse ? 'nhà' : 'căn hộ'}</Text>
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleContact}>
            <Text style={styles.secondaryBtnText}>💬 Nhắn tin</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleContact}>
            <Text style={styles.primaryBtnText}>📞 Liên hệ ngay</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Room Detail Bottom Sheet */}
      <RoomDetailSheet
        visible={showRoomDetail}
        room={selectedRoom}
        propertyName={property.name}
        onClose={() => setShowRoomDetail(false)}
      />
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
  stickyAddress: {
    position: 'absolute',
    top: 90,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingVertical: 8,
    paddingHorizontal: Spacing.lg,
    zIndex: 9,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    ...Shadow.sm,
  },
  stickyAddressText: {
    fontSize: 13,
    color: Colors.primaryDark,
    fontWeight: '600',
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
  typeBadge: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    backgroundColor: 'rgba(79, 70, 229, 0.9)',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
  },
  typeBadgeHouse: {
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
  },
  typeBadgeText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700',
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
  houseEquipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  houseEquipChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.infoLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
    gap: 4,
  },
  houseEquipIcon: {
    fontSize: 12,
  },
  houseEquipText: {
    fontSize: 12,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  wholeHouseNote: {
    backgroundColor: Colors.warningLight,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
  },
  wholeHouseNoteText: {
    fontSize: 13,
    color: Colors.warning,
    fontWeight: '500',
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
