import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { Colors, Spacing, BorderRadius, Typography, Shadow } from '../../constants';
import { SearchBar, PropertyCard, DistrictCard, FilterChips, Card } from '../../components/common';
import { searchService } from '../../services';
import { City, PropertyListing, SearchFilters } from '../../types';
import { GuestStackParamList } from '../../navigation/GuestStackNavigator';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
type NavigationProp = NativeStackNavigationProp<GuestStackParamList>;

// ---------------------------------------------------------------------------
// AI Prompt Parser — extracts keywords and maps them to SearchFilters
// ---------------------------------------------------------------------------
const parseAIPrompt = (prompt: string): SearchFilters => {
  const lower = prompt.toLowerCase();
  const filters: SearchFilters = {};

  // Price extraction
  const priceMatch = lower.match(/(\d+)\s*triệu/);
  if (priceMatch) {
    const amount = parseInt(priceMatch[1], 10) * 1_000_000;
    if (lower.includes('dưới') || lower.includes('tối đa') || lower.includes('không quá')) {
      filters.priceMax = amount;
    } else if (lower.includes('trên') || lower.includes('từ')) {
      filters.priceMin = amount;
    } else {
      filters.priceMax = amount;
    }
  }

  // Area extraction
  const areaMatch = lower.match(/(\d+)\s*m2/);
  if (areaMatch) {
    const area = parseInt(areaMatch[1], 10);
    if (lower.includes('rộng') || lower.includes('từ')) {
      filters.areaMin = area;
    } else {
      filters.areaMin = area;
    }
  }

  // Keyword extraction for search
  const keywords: string[] = [];
  const keywordMap: Record<string, string> = {
    'gác lửng': 'gác lửng',
    'ban công': 'ban công',
    'máy lạnh': 'máy lạnh',
    'điều hòa': 'máy lạnh',
    'wifi': 'wifi',
    'nội thất': 'nội thất',
    'giường': 'giường',
    'tủ lạnh': 'tủ lạnh',
    'máy giặt': 'máy giặt',
    'bếp': 'bếp',
    'nguyên căn': 'nguyên căn',
    'chung cư': 'chung cư',
    'sinh viên': 'sinh viên',
    'gia đình': 'gia đình',
  };

  Object.entries(keywordMap).forEach(([trigger, kw]) => {
    if (lower.includes(trigger) && !keywords.includes(kw)) {
      keywords.push(kw);
    }
  });

  if (keywords.length > 0) {
    filters.keyword = keywords.join(' ');
  }

  // If nothing was parsed, use the raw prompt as keyword
  if (!filters.keyword && !filters.priceMax && !filters.priceMin && !filters.areaMin) {
    filters.keyword = prompt.trim();
  }

  return filters;
};

// ---------------------------------------------------------------------------
// Quick suggestion chips data
// ---------------------------------------------------------------------------
const AI_SUGGESTIONS = [
  { label: '🎓 Sinh viên tìm phòng', prompt: 'Tôi là sinh viên, cần phòng giá dưới 3 triệu' },
  { label: '💰 Căn hộ dưới 3 triệu', prompt: 'Căn hộ giá dưới 3 triệu' },
  { label: '🏠 Có gác lửng', prompt: 'Căn hộ có gác lửng' },
  { label: '👨‍👩‍👧‍👦 Nhà cho gia đình', prompt: 'Nhà nguyên căn cho gia đình' },
];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export const GuestHomeScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();

  // Data state
  const [cities, setCities] = useState<City[]>([]);
  const [nearbyProperties, setNearbyProperties] = useState<PropertyListing[]>([]);
  const [selectedRadius, setSelectedRadius] = useState('5');
  const [locationEnabled, setLocationEnabled] = useState(false);

  // AI prompt state
  const [showAIPrompt, setShowAIPrompt] = useState(false);
  const [promptText, setPromptText] = useState('');
  const promptAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  // Glow pulse loop for the AI trigger button
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1800,
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glowAnim]);

  // Data loading
  useEffect(() => {
    loadData();
  }, [selectedRadius]);

  const loadData = async () => {
    try {
      const cityData = await searchService.getCities();
      setCities(cityData);

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
            radiusKm: parseInt(selectedRadius, 10),
            limit: 5,
          });
          setNearbyProperties(
            nearby.length > 0 ? nearby : await searchService.getFeaturedProperties(),
          );
        }
      } catch (err) {
        console.log('Location error', err);
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

  // Toggle AI prompt panel with animation
  const toggleAIPrompt = () => {
    const willShow = !showAIPrompt;
    setShowAIPrompt(willShow);
    Animated.spring(promptAnim, {
      toValue: willShow ? 1 : 0,
      tension: 65,
      friction: 11,
      useNativeDriver: false,
    }).start();
  };

  // Handle AI search submission
  const handleAISearch = (text?: string) => {
    const query = text ?? promptText;
    if (!query.trim()) return;
    const filters = parseAIPrompt(query);
    setShowAIPrompt(false);
    Animated.timing(promptAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
    setPromptText('');
    navigation.navigate('SearchResult', { filters });
  };

  // Price ranges
  const priceRanges = [
    { id: '2tr', label: 'Dưới 2 triệu', max: 2_000_000 },
    { id: '2-3tr', label: '2 - 3 triệu', min: 2_000_000, max: 3_000_000 },
    { id: '3-5tr', label: '3 - 5 triệu', min: 3_000_000, max: 5_000_000 },
    { id: '5tr', label: 'Trên 5 triệu', min: 5_000_000 },
  ];

  // Interpolations for the expandable panel
  const panelHeight = promptAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 280],
  });
  const panelOpacity = promptAnim.interpolate({
    inputRange: [0, 0.3, 1],
    outputRange: [0, 0.5, 1],
  });

  // Glow interpolation
  const glowScale = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.04],
  });
  const glowShadowRadius = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [4, 18],
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ============================================================= */}
        {/* GRADIENT HEADER                                                */}
        {/* ============================================================= */}
        <View style={styles.header}>
          {/* Two-layer gradient effect using overlapping views */}
          <View style={styles.headerGradientOverlay} />

          <View style={styles.headerTop}>
            <Text style={styles.logoText}>🏠 SLMS</Text>
            <TouchableOpacity
              style={styles.loginBtn}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.8}
            >
              <Text style={styles.loginBtnText}>Đăng nhập</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.headerSubtitle}>
            Tìm kiếm căn hộ thông minh với AI
          </Text>

          {/* ---- AI Prompt Trigger ---- */}
          <Animated.View
            style={[
              styles.aiTrigger,
              {
                transform: [{ scale: glowScale }],
                shadowRadius: glowShadowRadius,
              },
            ]}
          >
            <TouchableOpacity
              style={styles.aiTriggerInner}
              activeOpacity={0.85}
              onPress={toggleAIPrompt}
            >
              <Text style={styles.aiTriggerText}>
                ✨ Bạn đang tìm căn hộ nào?
              </Text>
              <Text style={styles.aiTriggerArrow}>
                {showAIPrompt ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* ---- Expandable AI Prompt Panel ---- */}
          <Animated.View
            style={[
              styles.aiPanel,
              { maxHeight: panelHeight, opacity: panelOpacity },
            ]}
          >
            <View style={styles.aiPanelContent}>
              {/* Chat-style input */}
              <View style={styles.promptInputRow}>
                <TextInput
                  style={styles.promptInput}
                  placeholder="Ví dụ: Tôi là sinh viên, cần căn hộ có gác lửng gần Bách Khoa, giá dưới 4 triệu..."
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  value={promptText}
                  onChangeText={setPromptText}
                  multiline
                  returnKeyType="search"
                  onSubmitEditing={() => handleAISearch()}
                />
                <TouchableOpacity
                  style={[
                    styles.sendBtn,
                    !promptText.trim() && styles.sendBtnDisabled,
                  ]}
                  onPress={() => handleAISearch()}
                  disabled={!promptText.trim()}
                  activeOpacity={0.8}
                >
                  <Text style={styles.sendBtnText}>🔍</Text>
                </TouchableOpacity>
              </View>

              {/* Quick suggestion chips */}
              <Text style={styles.suggestLabel}>Gợi ý nhanh:</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.suggestScroll}
              >
                {AI_SUGGESTIONS.map((s, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.suggestChip}
                    activeOpacity={0.8}
                    onPress={() => {
                      setPromptText(s.prompt);
                      handleAISearch(s.prompt);
                    }}
                  >
                    <Text style={styles.suggestChipText}>{s.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </Animated.View>
        </View>

        {/* ============================================================= */}
        {/* SEARCH BAR — overlapping header                               */}
        {/* ============================================================= */}
        <View style={styles.searchWrapper}>
          <SearchBar
            mode="compact"
            placeholder="Tìm căn hộ theo khu vực..."
            onPress={() => navigation.navigate('Search')}
          />
        </View>

        {/* ============================================================= */}
        {/* NEARBY / FEATURED PROPERTIES                                  */}
        {/* ============================================================= */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {locationEnabled ? '📍 Căn hộ gần bạn' : '✨ Căn hộ nổi bật'}
            </Text>
          </View>

          {locationEnabled && (
            <View style={styles.radiusSelector}>
              <FilterChips
                options={[
                  { id: '3', label: 'Bán kính 3km' },
                  { id: '5', label: 'Bán kính 5km' },
                  { id: '10', label: 'Bán kính 10km' },
                ]}
                selected={[selectedRadius]}
                onToggle={(id) => setSelectedRadius(id)}
                multiSelect={false}
                scrollable
              />
            </View>
          )}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hScroll}
          >
            {nearbyProperties.map((prop) => (
              <PropertyCard
                key={prop.id}
                property={prop}
                variant="vertical"
                onPress={() =>
                  navigation.navigate('PropertyDetail', { propertyId: prop.id })
                }
              />
            ))}
          </ScrollView>
        </View>

        {/* ============================================================= */}
        {/* POPULAR CITIES                                                */}
        {/* ============================================================= */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏙️ Thành phố nổi bật</Text>
          <View style={styles.grid}>
            {cities.slice(0, 6).map((city) => (
              <View key={city.id} style={styles.gridItem}>
                <DistrictCard
                  district={city}
                  onPress={() =>
                    navigation.navigate('Search', { cityId: city.id })
                  }
                />
              </View>
            ))}
          </View>
        </View>

        {/* ============================================================= */}
        {/* PRICE RANGES                                                  */}
        {/* ============================================================= */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💰 Khoảng giá</Text>
          <FilterChips
            options={priceRanges.map((r) => ({ id: r.id, label: r.label }))}
            selected={[]}
            onToggle={(id) => {
              const range = priceRanges.find((r) => r.id === id);
              if (range) {
                navigation.navigate('Search', {
                  priceMin: range.min,
                  priceMax: range.max,
                });
              }
            }}
            multiSelect={false}
            scrollable
          />
        </View>

        {/* ============================================================= */}
        {/* WHY CHOOSE US                                                 */}
        {/* ============================================================= */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🌟 Tại sao chọn SLMS?</Text>
          <View style={styles.featuresList}>
            <Card style={styles.featureCard}>
              <Text style={styles.featureIcon}>✅</Text>
              <View style={styles.featureBody}>
                <Text style={styles.featureTitle}>Hợp đồng minh bạch</Text>
                <Text style={styles.featureDesc}>
                  Ký điện tử an toàn, rõ ràng các điều khoản.
                </Text>
              </View>
            </Card>
            <Card style={styles.featureCard}>
              <Text style={styles.featureIcon}>✅</Text>
              <View style={styles.featureBody}>
                <Text style={styles.featureTitle}>Theo dõi hóa đơn</Text>
                <Text style={styles.featureDesc}>
                  Tiền điện nước cập nhật real-time hàng tháng.
                </Text>
              </View>
            </Card>
            <Card style={styles.featureCard}>
              <Text style={styles.featureIcon}>✅</Text>
              <View style={styles.featureBody}>
                <Text style={styles.featureTitle}>Bảo trì 1 chạm</Text>
                <Text style={styles.featureDesc}>
                  Gửi yêu cầu sửa chữa tức thì đến chủ nhà.
                </Text>
              </View>
            </Card>
          </View>
        </View>

        {/* ============================================================= */}
        {/* BOTTOM CTA                                                    */}
        {/* ============================================================= */}
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => navigation.navigate('Login')}
          activeOpacity={0.9}
        >
          <Text style={styles.ctaText}>🔐 Đăng nhập để quản lý căn hộ</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
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

  // ---- Header ----
  header: {
    backgroundColor: Colors.primary,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing['3xl'],
    borderBottomLeftRadius: BorderRadius.xl,
    borderBottomRightRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  headerGradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.primaryDark,
    opacity: 0.45,
    borderBottomLeftRadius: BorderRadius.xl,
    borderBottomRightRadius: BorderRadius.xl,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    zIndex: 1,
  },
  logoText: {
    ...Typography.h2,
    color: Colors.white,
    letterSpacing: 1,
  },
  loginBtn: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  loginBtnText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    zIndex: 1,
  },

  // ---- AI Trigger Button (glassy) ----
  aiTrigger: {
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    shadowColor: Colors.accentLight,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    elevation: 4,
    zIndex: 1,
  },
  aiTriggerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  aiTriggerText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  aiTriggerArrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginLeft: Spacing.sm,
  },

  // ---- AI Expandable Panel ----
  aiPanel: {
    overflow: 'hidden',
    zIndex: 1,
  },
  aiPanelContent: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    padding: Spacing.md,
  },
  promptInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  promptInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? Spacing.md : Spacing.sm,
    color: Colors.white,
    fontSize: 14,
    lineHeight: 20,
    maxHeight: 80,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
  sendBtnDisabled: {
    opacity: 0.45,
  },
  sendBtnText: {
    fontSize: 20,
  },
  suggestLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  suggestScroll: {
    gap: Spacing.sm,
  },
  suggestChip: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  suggestChipText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '500',
  },

  // ---- Search bar wrapper (overlapping header) ----
  searchWrapper: {
    marginTop: -24,
    marginHorizontal: Spacing.lg,
    zIndex: 10,
  },

  // ---- Sections ----
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

  // ---- Features (Why choose us) ----
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
  featureBody: {
    flex: 1,
  },
  featureTitle: {
    ...Typography.h4,
    fontSize: 16,
    marginBottom: 2,
  },
  featureDesc: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },

  // ---- Bottom CTA ----
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
  },
});
