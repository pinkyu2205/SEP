import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, Animated, Dimensions, Image, StatusBar, PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Spacing, BorderRadius, Typography, Shadow } from '../../constants';
import { PropertyCard, StickyContactBar } from '../../components/common';
import { searchService } from '../../services';
import { PropertyListing, PropertyRoom } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import { GuestStackParamList } from '../../navigation/GuestStackNavigator';

type NavigationProp = NativeStackNavigationProp<GuestStackParamList, 'PropertyDetail'>;
type RouteProps = RouteProp<GuestStackParamList, 'PropertyDetail'>;

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window');

// =====================================================================
// Zoomable single photo (pinch + double-tap)
// =====================================================================
interface ZoomableImageProps {
  uri: string;
  onZoomChange: (zoomed: boolean) => void;
}

const ZoomableImage: React.FC<ZoomableImageProps> = ({ uri, onZoomChange }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;

  const lastScale = useRef(1);
  const lastTx = useRef(0);
  const lastTy = useRef(0);
  const pinchDist0 = useRef<number | null>(null);
  const pinchScale0 = useRef(1);
  const lastTapTime = useRef(0);

  const getDist = (touches: any[]) => {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const springReset = () => {
    lastScale.current = 1; lastTx.current = 0; lastTy.current = 0;
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
      Animated.spring(tx, { toValue: 0, useNativeDriver: true, tension: 80, friction: 8 }),
      Animated.spring(ty, { toValue: 0, useNativeDriver: true, tension: 80, friction: 8 }),
    ]).start(() => onZoomChange(false));
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) =>
        lastScale.current > 1 || Math.abs(gs.dy) > 3,

      onPanResponderGrant: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2) {
          pinchDist0.current = getDist(touches);
          pinchScale0.current = lastScale.current;
        } else {
          const now = Date.now();
          if (now - lastTapTime.current < 280) {
            if (lastScale.current > 1) {
              springReset();
            } else {
              lastScale.current = 2.8;
              onZoomChange(true);
              Animated.spring(scale, { toValue: 2.8, useNativeDriver: true, tension: 80, friction: 8 }).start();
            }
          }
          lastTapTime.current = now;
        }
      },

      onPanResponderMove: (evt, gs) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length >= 2 && pinchDist0.current) {
          const newScale = Math.max(1, Math.min(5, pinchScale0.current * (getDist(touches) / pinchDist0.current)));
          lastScale.current = newScale;
          scale.setValue(newScale);
          onZoomChange(newScale > 1.05);
        } else if (touches.length === 1 && lastScale.current > 1) {
          const maxPanX = (SCREEN_WIDTH * (lastScale.current - 1)) / 2;
          const maxPanY = (SCREEN_HEIGHT * (lastScale.current - 1)) / 2;
          tx.setValue(Math.max(-maxPanX, Math.min(maxPanX, lastTx.current + gs.dx)));
          ty.setValue(Math.max(-maxPanY, Math.min(maxPanY, lastTy.current + gs.dy)));
        }
      },

      onPanResponderRelease: (_, gs) => {
        pinchDist0.current = null;
        if (lastScale.current < 1.05) {
          springReset();
        } else {
          const maxPanX = (SCREEN_WIDTH * (lastScale.current - 1)) / 2;
          const maxPanY = (SCREEN_HEIGHT * (lastScale.current - 1)) / 2;
          lastTx.current = Math.max(-maxPanX, Math.min(maxPanX, lastTx.current + gs.dx));
          lastTy.current = Math.max(-maxPanY, Math.min(maxPanY, lastTy.current + gs.dy));
        }
      },
    })
  ).current;

  return (
    <View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.Image
        source={{ uri }}
        style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT, transform: [{ scale }, { translateX: tx }, { translateY: ty }] }}
        resizeMode="contain"
        {...panResponder.panHandlers}
      />
    </View>
  );
};

// =====================================================================
// Full-Screen Photo Viewer Modal
// =====================================================================
interface PhotoViewerProps {
  visible: boolean;
  photos: string[];
  initialIndex: number;
  onClose: () => void;
}

const PhotoViewerModal: React.FC<PhotoViewerProps> = ({ visible, photos, initialIndex, onClose }) => {
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      setScrollEnabled(true);
      Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      setTimeout(() => {
        scrollRef.current?.scrollTo({ x: initialIndex * SCREEN_WIDTH, animated: false });
      }, 50);
    } else {
      fadeAnim.setValue(0);
    }
  }, [visible, initialIndex]);

  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <StatusBar hidden />
      <Animated.View style={[viewerStyles.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity style={viewerStyles.closeBtn} onPress={onClose} activeOpacity={0.8}>
          <Text style={viewerStyles.closeTxt}>✕</Text>
        </TouchableOpacity>
        <View style={viewerStyles.countBadge}>
          <Text style={viewerStyles.countTxt}>{currentIndex + 1} / {photos.length}</Text>
        </View>
        <ScrollView
          ref={scrollRef}
          horizontal pagingEnabled
          scrollEnabled={scrollEnabled}
          showsHorizontalScrollIndicator={false}
          onScroll={(e) => setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
        >
          {photos.map((uri, i) => (
            <ZoomableImage key={i} uri={uri} onZoomChange={(zoomed) => setScrollEnabled(!zoomed)} />
          ))}
        </ScrollView>
        {photos.length > 1 && scrollEnabled && (
          <View style={viewerStyles.dotRow}>
            {photos.map((_, i) => (
              <View key={i} style={[viewerStyles.dot, i === currentIndex && viewerStyles.dotActive]} />
            ))}
          </View>
        )}
      </Animated.View>
    </Modal>
  );
};

const viewerStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#000' },
  closeBtn: {
    position: 'absolute', top: 52, right: 20, zIndex: 10,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { color: '#fff', fontSize: 18, fontWeight: '700' },
  countBadge: {
    position: 'absolute', top: 56, left: 20, zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99,
  },
  countTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
  dotRow: {
    position: 'absolute', bottom: 40, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { backgroundColor: '#fff', width: 18, borderRadius: 3 },
});

// =====================================================================
// Room Detail Bottom Sheet  (by-room only)
// =====================================================================
interface RoomDetailSheetProps {
  visible: boolean;
  room: PropertyRoom | null;
  propertyName: string;
  onClose: () => void;
}

const RoomDetailSheet: React.FC<RoomDetailSheetProps> = ({ visible, room, propertyName, onClose }) => {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const [viewerInitIdx, setViewerInitIdx] = useState(0);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    } else {
      Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible]);

  if (!room) return null;

  const roomPhotos = room.photos && room.photos.length > 0 ? room.photos : [];

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <TouchableOpacity style={sheetStyles.overlay} activeOpacity={1} onPress={onClose}>
          <Animated.View style={[sheetStyles.container, { transform: [{ translateY: slideAnim }] }]}>
            <TouchableOpacity activeOpacity={1}>
              <View style={sheetStyles.handleBar} />
              <View style={sheetStyles.header}>
                <Text style={sheetStyles.roomName}>{room.name}</Text>
                <Text style={sheetStyles.propertyName}>🏠 {propertyName}</Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={sheetStyles.photoScroll}>
                {roomPhotos.length > 0 ? roomPhotos.map((photo, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={sheetStyles.photoCard}
                    activeOpacity={0.88}
                    onPress={() => { setViewerInitIdx(idx); setShowPhotoViewer(true); }}
                  >
                    <Image source={{ uri: photo }} style={sheetStyles.photoImg} resizeMode="cover" />
                    <View style={sheetStyles.photoZoomHint}>
                      <Text style={{ color: '#fff', fontSize: 10 }}>🔍</Text>
                    </View>
                  </TouchableOpacity>
                )) : (
                  <View style={sheetStyles.photoCard}>
                    <Text style={sheetStyles.photoIcon}>📷</Text>
                  </View>
                )}
              </ScrollView>

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
                <View style={[sheetStyles.infoPill, { backgroundColor: '#FEF2F2' }]}>
                  <Text style={sheetStyles.infoPillIcon}>💰</Text>
                  <Text style={[sheetStyles.infoPillText, { color: Colors.error }]}>{formatCurrency(room.price)}</Text>
                </View>
              )}
            </View>

            {room.description && (
              <View style={sheetStyles.section}>
                <Text style={sheetStyles.sectionTitle}>📝 Mô tả</Text>
                <Text style={sheetStyles.descText}>{room.description}</Text>
              </View>
            )}

            {room.equipments && room.equipments.length > 0 && (
              <View style={sheetStyles.section}>
                <Text style={sheetStyles.sectionTitle}>🪑 Nội thất trong phòng</Text>
                <View style={sheetStyles.equipmentGrid}>
                  {room.equipments.map((eq, idx) => (
                    <View key={idx} style={sheetStyles.equipmentChip}>
                      <Text style={sheetStyles.equipmentText}>✅ {eq}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      {roomPhotos.length > 0 && (
        <PhotoViewerModal
          visible={showPhotoViewer}
          photos={roomPhotos}
          initialIndex={viewerInitIdx}
          onClose={() => setShowPhotoViewer(false)}
        />
      )}
    </>
  );
};

const sheetStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  container: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.85,
    paddingBottom: 40,
  },
  handleBar: {
    width: 40, height: 4, backgroundColor: Colors.divider,
    borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 8,
  },
  header: {
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  roomName: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  propertyName: { fontSize: 14, color: Colors.textSecondary },
  photoScroll: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  photoCard: {
    width: 160, height: 110, backgroundColor: Colors.primaryBg,
    borderRadius: 12, marginRight: Spacing.sm, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  photoImg: { width: '100%', height: '100%' },
  photoIcon: { fontSize: 36 },
  photoZoomHint: {
    position: 'absolute', bottom: 4, right: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10, paddingHorizontal: 5, paddingVertical: 2,
  },
  infoRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: Spacing.sm, marginBottom: Spacing.md },
  infoPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.background, paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs, borderRadius: BorderRadius.full, gap: 4,
  },
  infoPillIcon: { fontSize: 14 },
  infoPillText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  section: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  descText: { fontSize: 14, lineHeight: 22, color: Colors.textSecondary },
  equipmentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  equipmentChip: {
    backgroundColor: '#F0FDF4', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  equipmentText: { fontSize: 12, color: Colors.textPrimary, fontWeight: '500' },
});

// =====================================================================
// Expandable Room Accordion  (by-room only)
// =====================================================================
interface ExpandableRoomProps {
  room: PropertyRoom;
  onPress: () => void;
}

const ExpandableRoom: React.FC<ExpandableRoomProps> = ({ room, onPress }) => {
  const [expanded, setExpanded] = useState(false);
  const animHeight = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    const next = !expanded;
    Animated.timing(animHeight, { toValue: next ? 1 : 0, duration: 280, useNativeDriver: false }).start();
    setExpanded(next);
  };

  const maxH = animHeight.interpolate({ inputRange: [0, 1], outputRange: [0, 200] });

  return (
    <View style={accordionStyles.container}>
      <TouchableOpacity style={accordionStyles.header} onPress={toggle} activeOpacity={0.75}>
        <View style={accordionStyles.headerLeft}>
          <View style={[accordionStyles.dot, room.status === 'available' ? accordionStyles.dotGreen : accordionStyles.dotGray]} />
          <View>
            <Text style={accordionStyles.name}>{room.name}</Text>
            <Text style={accordionStyles.meta}>{room.floor > 0 ? `Tầng ${room.floor} · ` : ''}{room.area}m² · {room.status === 'available' ? '🟢 Còn trống' : '🔴 Đã thuê'}</Text>
          </View>
        </View>
        <View style={accordionStyles.headerRight}>
          {room.price > 0 && <Text style={accordionStyles.price}>{formatCurrency(room.price)}</Text>}
          <Text style={accordionStyles.chevron}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </TouchableOpacity>

      <Animated.View style={[accordionStyles.body, { maxHeight: maxH, opacity: animHeight }]}>
        {room.description && <Text style={accordionStyles.desc}>{room.description}</Text>}
        {room.equipments && room.equipments.length > 0 ? (
          <View style={accordionStyles.eqWrap}>
            {room.equipments.map((eq, i) => (
              <View key={i} style={accordionStyles.eqChip}>
                <Text style={accordionStyles.eqTxt}>✅ {eq}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={accordionStyles.empty}>Liên hệ chủ nhà để biết chi tiết nội thất phòng.</Text>
        )}
        <TouchableOpacity style={accordionStyles.moreBtn} onPress={onPress}>
          <Text style={accordionStyles.moreTxt}>📸 Xem ảnh & chi tiết đầy đủ →</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const accordionStyles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white, borderRadius: 14,
    marginBottom: Spacing.sm, borderWidth: 1,
    borderColor: Colors.divider, overflow: 'hidden',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: Spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotGreen: { backgroundColor: Colors.success },
  dotGray: { backgroundColor: Colors.textMuted },
  name: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  meta: { fontSize: 12, color: Colors.textSecondary },
  headerRight: { alignItems: 'flex-end', gap: 4 },
  price: { fontSize: 15, fontWeight: '700', color: Colors.error },
  chevron: { fontSize: 14, color: Colors.textMuted },
  body: {
    paddingHorizontal: Spacing.md, paddingBottom: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.divider, overflow: 'hidden',
  },
  desc: { fontSize: 13, lineHeight: 20, color: Colors.textSecondary, marginTop: Spacing.sm, marginBottom: Spacing.sm },
  eqWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  eqChip: { backgroundColor: '#F0FDF4', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  eqTxt: { fontSize: 11, color: Colors.textPrimary, fontWeight: '500' },
  empty: { fontSize: 13, color: Colors.textMuted, fontStyle: 'italic', marginTop: Spacing.sm },
  moreBtn: { marginTop: Spacing.sm },
  moreTxt: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
});


// =====================================================================
// Availability Badge  (apartment only)
// =====================================================================
const AvailabilityBadge: React.FC<{ available: boolean }> = ({ available }) => {
  if (!available) return null;
  return (
    <View style={[availStyles.badge, availStyles.badgeGreen]}>
      <View style={availStyles.dotGreen} />
      <Text style={[availStyles.text, availStyles.textGreen]}>Còn trống</Text>
    </View>
  );
};

const availStyles = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99,
    marginBottom: Spacing.lg, gap: 6,
  },
  badgeGreen: { backgroundColor: Colors.successLight },
  badgeRed: { backgroundColor: Colors.errorLight },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  dotGreen: { backgroundColor: Colors.success },
  dotRed: { backgroundColor: Colors.error },
  text: { fontSize: 12, fontWeight: '700' },
  textGreen: { color: Colors.success },
  textRed: { color: Colors.error },
});

// =====================================================================
// Main Screen
// =====================================================================
export const PropertyDetailScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { propertyId } = route.params;

  const [property, setProperty] = useState<PropertyListing | null>(null);
  const [similar, setSimilar] = useState<PropertyListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<PropertyRoom | null>(null);
  const [showRoomDetail, setShowRoomDetail] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const [viewerInitIndex, setViewerInitIndex] = useState(0);

  useEffect(() => { loadData(); }, [propertyId]);

  const loadData = async () => {
    try {
      const [data, sim] = await Promise.all([
        searchService.getPropertyDetail(propertyId),
        searchService.getSimilarProperties(propertyId, 3),
      ]);
      setProperty(data);
      setSimilar(sim);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!property) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>Không tìm thấy thông tin bất động sản.</Text>
      </View>
    );
  }

  const isWholeHouse = property.propertyType === 'whole_house';
  const typeLabel = isWholeHouse ? 'Nguyên căn' : 'Phòng trọ';
  // Nhà chia phòng: BE public chỉ trả phòng AVAILABLE → đây là danh sách phòng thuê được.
  const availableRooms = property.rooms.filter((r) => r.status === 'available');
  // Nguyên căn: còn trống tính theo cả căn (rentalAvailable). Chia phòng: còn ≥1 phòng trống.
  const isAvailable = isWholeHouse ? property.availableRooms > 0 : availableRooms.length > 0;
  const hasPriceRange = !isWholeHouse && property.priceTo > property.priceFrom;
  const DESC_LIMIT = 160;
  const longDesc = property.description && property.description.length > DESC_LIMIT;

  return (
    <View style={styles.root}>
      {/* ── Floating back button ──────────────────────────────────────── */}
      <View style={styles.floatBar}>
        <TouchableOpacity style={styles.floatBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
          <Text style={styles.floatBtnTxt}>←</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Photo Carousel ───────────────────────────────────────────── */}
        <View style={styles.photoWrap}>
          {property.photos.length > 0 ? (
            <ScrollView
              horizontal pagingEnabled showsHorizontalScrollIndicator={false}
              onScroll={(e) => setPhotoIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))}
              scrollEventThrottle={16}
            >
              {property.photos.map((uri, i) => (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.92}
                  onPress={() => { setViewerInitIndex(i); setShowPhotoViewer(true); }}
                >
                  <Image source={{ uri }} style={styles.photo} resizeMode="cover" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.photoFallback}>
              <Text style={{ fontSize: 56 }}>🏠</Text>
            </View>
          )}

          {property.photos.length > 1 && (
            <View style={styles.dotRow}>
              {property.photos.map((_, i) => (
                <View key={i} style={[styles.dot, i === photoIndex && styles.dotActive]} />
              ))}
            </View>
          )}
          {property.photos.length > 1 && (
            <View style={styles.countBadge}>
              <Text style={styles.countTxt}>{photoIndex + 1} / {property.photos.length}</Text>
            </View>
          )}
          <View style={[styles.typeBadge, isWholeHouse && styles.typeBadgeGreen]}>
            <Text style={styles.typeBadgeTxt}>{isWholeHouse ? '🏡 ' : '🏢 '}{typeLabel}</Text>
          </View>
        </View>

        {/* ── Content card ─────────────────────────────────────────────── */}
        <View style={styles.card}>

          {/* Title + address */}
          <Text style={styles.title}>{property.name}</Text>
          <Text style={styles.addr}>📍 {property.address}, {property.ward}, {property.city}</Text>

          {/* Availability badge — cả hai loại hình */}
          <AvailabilityBadge available={isAvailable} />

          {/* ── Price card ─────────────────────────────────────────────── */}
          <View style={styles.priceCard}>
            <View style={styles.priceMain}>
              <Text style={styles.priceLabel}>{isWholeHouse ? 'Giá thuê nguyên căn' : 'Giá thuê phòng từ'}</Text>
              <Text style={styles.priceValue}>{formatCurrency(property.priceFrom)}</Text>
              {hasPriceRange && (
                <Text style={styles.priceRangeTo}> – {formatCurrency(property.priceTo)}</Text>
              )}
              <Text style={styles.priceUnit}>/tháng</Text>
            </View>
            <View style={styles.priceDivider} />
            <View style={styles.priceExtras}>
              <View style={styles.priceRow}>
                <Text style={styles.priceExtraLabel}>⚡ Tiền điện</Text>
                <Text style={styles.priceExtraValue}>
                  {property.electricityRate > 0 ? `${formatCurrency(property.electricityRate)}/kWh` : 'Liên hệ'}
                </Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceExtraLabel}>💧 Tiền nước</Text>
                <Text style={styles.priceExtraValue}>
                  {property.waterRate > 0 ? `${formatCurrency(property.waterRate)}/khối` : 'Liên hệ'}
                </Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceExtraLabel}>🔒 Đặt cọc</Text>
                <Text style={styles.priceExtraValue}>
                  {property.depositMonths > 0 ? `${property.depositMonths} tháng` : 'Thỏa thuận'}
                </Text>
              </View>
              {property.serviceFee > 0 && (
                <View style={styles.priceRow}>
                  <Text style={styles.priceExtraLabel}>🏢 Phí dịch vụ</Text>
                  <Text style={styles.priceExtraValue}>{formatCurrency(property.serviceFee)}/tháng</Text>
                </View>
              )}
            </View>
          </View>

          {/* ── Quick Info 2×2 grid — khác nhau theo loại hình ────────── */}
          <View style={styles.factsGrid}>
            {/* Cell 1: Diện tích */}
            <View style={styles.factCell}>
              <Text style={styles.factIcon}>📐</Text>
              <Text style={styles.factValue}>{property.area}m²</Text>
              <Text style={styles.factLabel}>{isWholeHouse ? 'Diện tích căn' : 'Diện tích phòng'}</Text>
            </View>

            {/* Cell 2: Loại hình */}
            <View style={styles.factCell}>
              <Text style={styles.factIcon}>{isWholeHouse ? '🏠' : '🛏'}</Text>
              <Text style={[styles.factValue, { fontSize: 14 }]}>{typeLabel}</Text>
              <Text style={styles.factLabel}>Loại hình</Text>
            </View>

            {isWholeHouse ? (
              // Nguyên căn: tổng phòng ngủ + trạng thái cả căn
              <>
                <View style={styles.factCell}>
                  <Text style={styles.factIcon}>🛏</Text>
                  <Text style={styles.factValue}>{property.totalRooms}</Text>
                  <Text style={styles.factLabel}>Số phòng ngủ</Text>
                </View>
                <View style={styles.factCell}>
                  <Text style={styles.factIcon}>{isAvailable ? '✅' : '🔒'}</Text>
                  <Text style={[styles.factValue, { fontSize: 14, color: isAvailable ? Colors.success : Colors.error }]}>
                    {isAvailable ? 'Còn trống' : 'Đã thuê'}
                  </Text>
                  <Text style={styles.factLabel}>Trạng thái</Text>
                </View>
              </>
            ) : (
              // Chia phòng: số phòng trống + tổng số phòng
              <>
                <View style={styles.factCell}>
                  <Text style={styles.factIcon}>🚪</Text>
                  <Text style={[styles.factValue, { color: availableRooms.length > 0 ? Colors.success : Colors.error }]}>
                    {availableRooms.length}
                  </Text>
                  <Text style={styles.factLabel}>Phòng còn trống</Text>
                </View>
                <View style={styles.factCell}>
                  <Text style={styles.factIcon}>🏢</Text>
                  <Text style={styles.factValue}>{property.totalRooms}</Text>
                  <Text style={styles.factLabel}>Tổng số phòng</Text>
                </View>
              </>
            )}
          </View>

          {/* ── Amenity chips ──────────────────────────────────────────── */}
          {property.amenities.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>✨ Tiện ích</Text>
              <View style={styles.amenWrap}>
                {property.amenities.map((am, i) => (
                  <View key={i} style={styles.amenChip}>
                    <Text style={styles.amenTxt}>{am}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── Collapsible description ────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📝 Mô tả</Text>
            <Text style={styles.descTxt} numberOfLines={descExpanded ? undefined : 4}>
              {property.description}
            </Text>
            {longDesc && (
              <TouchableOpacity onPress={() => setDescExpanded((v) => !v)} style={styles.descToggle}>
                <Text style={styles.descToggleTxt}>
                  {descExpanded ? 'Thu gọn ▲' : 'Xem thêm ▼'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Nguyên căn: bạn nhận được trọn căn ────────────────────── */}
          {isWholeHouse ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🏡 Thuê trọn nguyên căn</Text>
              <View style={styles.includeCard}>
                <View style={styles.includeRow}>
                  <Text style={styles.includeIcon}>🛏</Text>
                  <Text style={styles.includeTxt}>Toàn bộ {property.totalRooms} phòng ngủ, sử dụng riêng cho gia đình bạn</Text>
                </View>
                <View style={styles.includeRow}>
                  <Text style={styles.includeIcon}>📐</Text>
                  <Text style={styles.includeTxt}>{property.area}m² diện tích sử dụng cho cả căn</Text>
                </View>
                <View style={styles.includeRow}>
                  <Text style={styles.includeIcon}>🔑</Text>
                  <Text style={styles.includeTxt}>Toàn quyền sử dụng, tự do bố trí không gian</Text>
                </View>
              </View>
            </View>
          ) : (
            /* ── Chia phòng: danh sách phòng còn trống (clickable) ────── */
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🚪 Phòng còn trống ({availableRooms.length})</Text>
              {availableRooms.length > 0 ? (
                <>
                  <View style={styles.hintBox}>
                    <Text style={styles.hintTxt}>💡 Nhấn vào phòng để xem ảnh & nội thất chi tiết</Text>
                  </View>
                  {availableRooms.map((room) => (
                    <ExpandableRoom
                      key={room.id}
                      room={room}
                      onPress={() => { setSelectedRoom(room); setShowRoomDetail(true); }}
                    />
                  ))}
                </>
              ) : (
                <View style={styles.emptyRooms}>
                  <Text style={styles.emptyRoomsTxt}>
                    Hiện chưa có phòng trống. Liên hệ chủ nhà để được tư vấn các phòng sắp ra.
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── Similar Properties ────────────────────────────────────── */}
          {similar.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🔍 Bất động sản tương tự</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 0 }}>
                {similar.map((sp) => (
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

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      {/* ── Sticky Contact Bar ───────────────────────────────────────── */}
      <View style={styles.stickyWrap}>
        <StickyContactBar propertyName={property.name} />
      </View>

      {/* ── Room Detail Sheet (chia phòng) ───────────────────────────── */}
      {!isWholeHouse && (
        <RoomDetailSheet
          visible={showRoomDetail}
          room={selectedRoom}
          propertyName={property.name}
          onClose={() => setShowRoomDetail(false)}
        />
      )}

      {/* ── Full-screen Photo Viewer ─────────────────────────────────── */}
      {property.photos.length > 0 && (
        <PhotoViewerModal
          visible={showPhotoViewer}
          photos={property.photos}
          initialIndex={viewerInitIndex}
          onClose={() => setShowPhotoViewer(false)}
        />
      )}
    </View>
  );
};

// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  notFound: { fontSize: 15, color: Colors.textSecondary },

  floatBar: {
    position: 'absolute', top: 50, left: Spacing.base, right: Spacing.base,
    flexDirection: 'row', justifyContent: 'space-between', zIndex: 20,
  },
  floatBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center', justifyContent: 'center',
    ...Shadow.md,
  },
  floatBtnTxt: { fontSize: 20, color: Colors.textPrimary },

  scroll: { flex: 1 },
  scrollContent: {},

  photoWrap: { height: 290, backgroundColor: Colors.primaryBg, overflow: 'hidden' },
  photo: { width: SCREEN_WIDTH, height: 290 },
  photoFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dotRow: {
    position: 'absolute', bottom: 14, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  dotActive: { backgroundColor: Colors.white, width: 18 },
  countBadge: {
    position: 'absolute', bottom: 14, right: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 99,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
  },
  countTxt: { color: Colors.white, fontSize: 11, fontWeight: '600' },
  typeBadge: {
    position: 'absolute', top: 14, right: Spacing.md,
    backgroundColor: 'rgba(79,70,229,0.9)',
    paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: 99,
  },
  typeBadgeGreen: { backgroundColor: 'rgba(16,185,129,0.9)' },
  typeBadgeTxt: { color: Colors.white, fontSize: 12, fontWeight: '700' },

  card: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    marginTop: -20, padding: Spacing.base, paddingTop: Spacing.xl,
  },
  title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.4, marginBottom: Spacing.xs },
  addr: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.md, lineHeight: 18 },

  priceCard: {
    backgroundColor: Colors.white, borderRadius: 20,
    padding: Spacing.base, marginBottom: Spacing.xl, ...Shadow.md,
  },
  priceMain: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: Spacing.md },
  priceLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' },
  priceValue: { fontSize: 28, fontWeight: '800', color: Colors.primary, letterSpacing: -0.5 },
  priceRangeTo: { fontSize: 19, fontWeight: '800', color: Colors.primary, letterSpacing: -0.3 },
  priceUnit: { fontSize: 14, color: Colors.textSecondary },
  priceDivider: { height: 1, backgroundColor: Colors.divider, marginBottom: Spacing.md },
  priceExtras: { gap: Spacing.xs },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceExtraLabel: { fontSize: 13, color: Colors.textSecondary },
  priceExtraValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

  factsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.xl },
  factCell: {
    width: (SCREEN_WIDTH - Spacing.base * 2 - Spacing.sm) / 2,
    backgroundColor: Colors.white, borderRadius: 14,
    padding: Spacing.md, alignItems: 'center', ...Shadow.sm,
  },
  factIcon: { fontSize: 24, marginBottom: 4 },
  factValue: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  factLabel: { fontSize: 11, color: Colors.textSecondary },

  section: { marginBottom: Spacing.xl },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },

  amenWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  amenChip: {
    backgroundColor: Colors.primaryBg, borderWidth: 1, borderColor: Colors.primaryLight,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99,
  },
  amenTxt: { fontSize: 12, color: Colors.primary, fontWeight: '500' },

  descTxt: { fontSize: 14, lineHeight: 22, color: Colors.textPrimary },
  descToggle: { marginTop: Spacing.sm },
  descToggleTxt: { fontSize: 14, color: Colors.primary, fontWeight: '600' },

  hintBox: { backgroundColor: '#FFFBEB', borderRadius: 10, padding: Spacing.sm, marginBottom: Spacing.md },
  hintTxt: { fontSize: 13, color: '#92400E', fontWeight: '500' },

  // Nguyên căn — khối "bạn nhận được gì"
  includeCard: {
    backgroundColor: Colors.white, borderRadius: 14, padding: Spacing.base,
    gap: Spacing.md, ...Shadow.sm,
  },
  includeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  includeIcon: { fontSize: 20, width: 26, textAlign: 'center' },
  includeTxt: { flex: 1, fontSize: 14, lineHeight: 20, color: Colors.textPrimary },

  // Chia phòng — trạng thái rỗng
  emptyRooms: {
    backgroundColor: Colors.white, borderRadius: 14, padding: Spacing.base,
    borderWidth: 1, borderColor: Colors.divider,
  },
  emptyRoomsTxt: { fontSize: 14, lineHeight: 21, color: Colors.textSecondary, textAlign: 'center' },

  stickyWrap: { position: 'absolute', bottom: 0, left: 0, right: 0 },
});
