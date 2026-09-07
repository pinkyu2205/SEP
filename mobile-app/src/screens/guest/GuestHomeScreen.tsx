import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Linking,
  Dimensions, Animated, RefreshControl, ImageBackground,
} from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { showAlert } from '@/utils';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Brand, Spacing, BorderRadius, Shadow } from '@/constants';
import { searchService } from '@/services';
import { PropertyListing } from '@/types';
import { GuestStackParamList } from '@/navigation/GuestStackNavigator';
import { formatCurrency } from '@/utils/helpers';
import { SearchOverlay } from './GuestSearchOverlay';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRANG CHỦ KHÁCH VÃNG LAI — mặt tiền của app.
 *
 * Đây là màn duy nhất người chưa có tài khoản nhìn thấy, nên nó phải làm được hai
 * việc cùng lúc: khoe được nhà đang có, và cho khách thuê cũ đăng nhập ngay.
 * Thiết kế lại 07/09/2026 quanh ba quyết định:
 *
 *  1. NÚT ĐĂNG NHẬP LÊN ĐẦU. Bản cũ giấu nó tận đáy, sau 6 khối nội dung — khách
 *     thuê đang ở phải cuộn hết trang giới thiệu mới vào được nhà mình. Nay nó
 *     nằm góc trên phải, luôn thấy.
 *
 *  2. MỘT KHỐI ĐẦU DUY NHẤT. Trước đây tiêu đề, ảnh bìa và ô tìm kiếm là ba mảnh
 *     rời chồng lên nhau bằng `marginTop: -20`. Nay ảnh + chữ + ô tìm + chip khu vực
 *     nằm chung một khối tối, đọc thành một câu liền mạch.
 *
 *  3. VỀ ĐÚNG MÀU THƯƠNG HIỆU. Bản cũ có cam, chàm, xanh lá, hổ phách cạnh nhau,
 *     mỗi khối một tông, và không tông nào là màu của công ty. Nay lấy thẳng hai màu
 *     trong logo (`assets/logo.png`): chữ H đỏ và chữ B xanh lá. Xanh lá làm màu
 *     chính (liên kết, còn trống, gọi hotline), đỏ chỉ dùng cho một điểm nhấn mỗi
 *     khối — nút "Tìm" và thẻ "Theo phòng" — vì đỏ với xanh lá đứng sát nhau và
 *     nhiều là thành màu Giáng sinh. Nền tối cũng đổi từ navy sang đen ngả xanh lá.
 *     Bảng màu ở `constants/colors.ts` → `Brand`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { width: SCREEN_WIDTH } = Dimensions.get('window');
type NavigationProp = NativeStackNavigationProp<GuestStackParamList>;

const HOTLINE         = '19008386';
const HOTLINE_DISPLAY = '1900 8386';
const HERO_IMAGE      = 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800';
/** Dấu thương hiệu (chữ H đỏ + B xanh ghép thành toà nhà) — bản không kèm chữ. */
const LOGO_MARK       = require('../../../assets/adaptive-icon.png');

/** Bề rộng một thẻ trong băng chuyền nổi bật — chừa mép phải để lộ thẻ kế tiếp. */
const CARD_W = Math.round(SCREEN_WIDTH * 0.74);
const CARD_GAP = Spacing.md;

const PROPERTY_TYPES = [
  {
    id: 'apartment',
    icon: '🏢',
    label: 'Theo phòng',
    sub: 'Phòng trọ, sinh viên',
    tint: Brand.redTint,
    accent: Brand.redDark,
    propertyType: 'apartment' as const,
  },
  {
    id: 'whole_house',
    icon: '🏡',
    label: 'Nguyên căn',
    sub: 'Gia đình, nhóm bạn',
    tint: Brand.greenTint,
    accent: Brand.greenDark,
    propertyType: 'whole_house' as const,
  },
];

const AREA_CHIPS = [
  { label: 'Thủ Đức',    cityId: 'hcm', wardIds: ['hcm-lc', 'hcm-lt'] },
  { label: 'Bình Thạnh', cityId: 'hcm', wardIds: ['hcm-p25', 'hcm-p13'] },
  { label: 'Quận 7',     cityId: 'hcm', wardIds: ['hcm-tp', 'hcm-bt', 'hcm-pm'] },
  { label: 'Quận 1',     cityId: 'hcm', wardIds: ['hcm-bn', 'hcm-dk'] },
  { label: 'Tân Bình',   cityId: 'hcm', wardIds: ['hcm-tb'] },
  { label: 'Gò Vấp',     cityId: 'hcm', wardIds: [] },
];

/**
 * Dải mờ dần cho ảnh — `react-native-svg` đã có sẵn trong app nên không cần thêm
 * `expo-linear-gradient` (thư viện đó có mã native, thêm vào là phải build lại
 * dev client). Bản cũ dùng một khối đen phẳng 40%, viền trên của nó cắt ngang ảnh
 * thành một đường thẳng nhìn rất rõ.
 */
const Scrim: React.FC<{ height: number; opacity?: number }> = ({ height, opacity = 0.85 }) => (
  <Svg width="100%" height={height} style={StyleSheet.absoluteFill as any}>
    <Defs>
      <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0"    stopColor="#020617" stopOpacity="0" />
        <Stop offset="0.55" stopColor="#020617" stopOpacity={String(opacity * 0.45)} />
        <Stop offset="1"    stopColor="#020617" stopOpacity={String(opacity)} />
      </LinearGradient>
    </Defs>
    <Rect x="0" y="0" width="100%" height="100%" fill="url(#scrim)" />
  </Svg>
);

/**
 * Giá hiển thị. BĐS chưa gắn giá thì BE trả 0, mà `formatCurrency(0)` ra "0 đ" —
 * đọc như nhà cho ở miễn phí. Những căn đó phải nói là chưa có giá.
 */
const priceLabel = (from: number) =>
  from > 0 ? `${formatCurrency(from)}/tháng` : 'Giá thương lượng';

// ═══════════════════════════════════════════════════════════════════════════
// Thẻ bất động sản trong băng chuyền "Nổi bật"
// ═══════════════════════════════════════════════════════════════════════════
const HomeCard: React.FC<{ property: PropertyListing; onPress: () => void; index: number }> = ({
  property, onPress, index,
}) => {
  const fade  = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(20)).current;
  const isWH  = property.propertyType === 'whole_house';
  const free  = property.availableRooms;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade,  { toValue: 1, duration: 300, delay: index * 70, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 300, delay: index * 70, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }], width: CARD_W }}>
      <TouchableOpacity style={card.wrap} onPress={onPress} activeOpacity={0.9}>
        <View style={card.imgWrap}>
          {property.photos?.[0] ? (
            <Image source={{ uri: property.photos[0] }} style={card.img} resizeMode="cover" />
          ) : (
            <View style={card.imgFallback}>
              <Text style={card.imgFallbackIcon}>{isWH ? '🏡' : '🏢'}</Text>
              <Text style={card.imgFallbackTxt}>Chưa có ảnh</Text>
            </View>
          )}
          <Scrim height={card.imgWrap.height} />

          <View style={card.badgeRow}>
            <View style={card.glassPill}>
              <Text style={card.glassPillTxt}>{isWH ? 'Nguyên căn' : 'Theo phòng'}</Text>
            </View>
            {free > 0 && (
              <View style={card.freePill}>
                <View style={card.dot} />
                <Text style={card.freePillTxt}>Còn {free}</Text>
              </View>
            )}
          </View>

          <Text style={card.price} numberOfLines={1}>{priceLabel(property.priceFrom)}</Text>
        </View>

        <View style={card.body}>
          <Text style={card.name} numberOfLines={1}>{property.name}</Text>
          <Text style={card.addr} numberOfLines={1}>{property.ward}, {property.city}</Text>
          <View style={card.metaRow}>
            <Text style={card.meta}>{property.area > 0 ? `${property.area} m²` : 'Chưa rõ DT'}</Text>
            {property.totalRooms > 0 && (
              <>
                <View style={card.metaSep} />
                <Text style={card.meta}>{property.totalRooms} phòng</Text>
              </>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const card = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.white, borderRadius: 22, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.divider, ...Shadow.md,
  },
  imgWrap:     { width: '100%', height: 168, backgroundColor: '#E8EBF2' },
  img:         { width: '100%', height: '100%' },
  imgFallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 4 },
  imgFallbackIcon: { fontSize: 34, opacity: 0.5 },
  imgFallbackTxt:  { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },

  badgeRow: {
    position: 'absolute', top: Spacing.sm + 2, left: Spacing.sm + 2, right: Spacing.sm + 2,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  glassPill: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full,
  },
  glassPillTxt: { fontSize: 10.5, fontWeight: '800', color: Colors.textPrimary, letterSpacing: 0.2 },
  freePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(67,182,73,0.95)',
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: BorderRadius.full,
  },
  dot:         { width: 5, height: 5, borderRadius: 3, backgroundColor: '#A7F3D0' },
  freePillTxt: { fontSize: 10.5, fontWeight: '800', color: Colors.white },

  price: {
    position: 'absolute', bottom: 11, left: Spacing.md, right: Spacing.md,
    color: Colors.white, fontSize: 18, fontWeight: '800', letterSpacing: -0.3,
  },

  body:    { paddingHorizontal: Spacing.md, paddingTop: 11, paddingBottom: Spacing.md },
  name:    { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.2 },
  addr:    { fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  meta:    { fontSize: 11.5, color: Colors.textMuted, fontWeight: '600' },
  metaSep: { width: 3, height: 3, borderRadius: 2, backgroundColor: Colors.border },
});

// ═══════════════════════════════════════════════════════════════════════════
export const GuestHomeScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const insets     = useSafeAreaInsets();

  const [featured,      setFeatured]      = useState<PropertyListing[]>([]);
  const [newListings,   setNewListings]   = useState<PropertyListing[]>([]);
  const [allProperties, setAllProperties] = useState<PropertyListing[]>([]);
  const [counts,        setCounts]        = useState({ apartment: 0, whole_house: 0, vacant: 0 });
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
        vacant:      all.filter(p => p.availableRooms > 0).length,
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
      showAlert('Hotline', `Vui lòng gọi: ${HOTLINE_DISPLAY}`)
    );

  const displayCards = activeTab === 'featured' ? featured : newListings;
  const total = counts.apartment + counts.whole_house;

  return (
    <View style={s.root}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing['3xl'] }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Brand.green} progressViewOffset={insets.top + 40} />
        }
      >
        {/* ══════════════════════════════════════════════════════════════════
            KHỐI ĐẦU — thương hiệu · đăng nhập · tiêu đề · tìm kiếm · khu vực
        ══════════════════════════════════════════════════════════════════ */}
        <ImageBackground source={{ uri: HERO_IMAGE }} style={s.hero} resizeMode="cover">
          {/* Nền tối phủ ảnh: ảnh bìa chỉ là kết cấu, chữ mới là thứ phải đọc được. */}
          <View style={s.heroTint} />
          <SafeAreaView edges={['top']}>
            <View style={s.heroInner}>

              <View style={s.topBar}>
                <View style={s.brandRow}>
                  <View style={s.logoBox}><Image source={LOGO_MARK} style={s.logoImg} resizeMode="contain" /></View>
                  <View>
                    <Text style={s.brandName}>Hoàng Bình Land</Text>
                    <Text style={s.brandSub}>Cho thuê nhà · TP.HCM</Text>
                  </View>
                </View>

                <View style={s.topActions}>
                  {/* Gọi điện thu về nút tròn: nó là hành động phụ ở đây, và số hotline
                      vẫn hiện đầy đủ ở khối liên hệ cuối trang. */}
                  <TouchableOpacity style={s.callBtn} onPress={callHotline} activeOpacity={0.8}>
                    <Text style={s.callIcon}>📞</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.loginBtn}
                    onPress={() => navigation.navigate('Login')}
                    activeOpacity={0.85}
                  >
                    <Text style={s.loginTxt}>Đăng nhập</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={s.heroCopy}>
                <Text style={s.heroTitle}>Tìm nhà lý tưởng{'\n'}tại TP. Hồ Chí Minh</Text>
                <Text style={s.heroSub}>
                  {total > 0
                    ? `${total} bất động sản đang cho thuê${counts.vacant > 0 ? ` · ${counts.vacant} nơi còn trống` : ''}`
                    : 'Phòng trọ và nhà nguyên căn, cập nhật mỗi ngày.'}
                </Text>
              </View>

              <TouchableOpacity style={s.search} onPress={() => setShowSearch(true)} activeOpacity={0.9}>
                <Text style={s.searchIcon}>🔍</Text>
                <Text style={s.searchPlaceholder}>Tìm khu vực, tên nhà, địa chỉ…</Text>
                <View style={s.searchBtn}><Text style={s.searchBtnTxt}>Tìm</Text></View>
              </TouchableOpacity>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.heroChips}
              >
                {AREA_CHIPS.map(chip => (
                  <TouchableOpacity
                    key={chip.label}
                    style={s.heroChip}
                    activeOpacity={0.75}
                    onPress={() => navigation.navigate('SearchResult', {
                      filters: { cityId: chip.cityId, wardIds: chip.wardIds.length ? chip.wardIds : undefined },
                    })}
                  >
                    <Text style={s.heroChipTxt}>{chip.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

            </View>
          </SafeAreaView>
        </ImageBackground>

        <Animated.View style={{ opacity: contentFade }}>

          {/* ══════════════════════════════════════════════════════════════
              HAI LOẠI HÌNH — hai thẻ ngang hàng thay cho hai thanh màu
          ══════════════════════════════════════════════════════════════ */}
          <View style={s.typeRow}>
            {PROPERTY_TYPES.map(t => (
              <TouchableOpacity
                key={t.id}
                style={s.typeCard}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('SearchResult', { filters: { propertyType: t.propertyType } })}
              >
                <View style={[s.typeIconBox, { backgroundColor: t.tint }]}>
                  <Text style={s.typeIcon}>{t.icon}</Text>
                </View>
                <Text style={s.typeLabel}>{t.label}</Text>
                <Text style={s.typeSub} numberOfLines={1}>{t.sub}</Text>
                <Text style={[s.typeCount, { color: t.accent }]}>
                  {counts[t.propertyType]} bất động sản
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ══════════════════════════════════════════════════════════════
              NỔI BẬT — băng chuyền ngang, hết một thẻ dừng một nhịp
          ══════════════════════════════════════════════════════════════ */}
          <View style={s.sectionHead}>
            <View>
              <Text style={s.sectionTitle}>Khám phá</Text>
              <Text style={s.sectionSub}>Những nơi đáng xem nhất lúc này</Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('Search')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.seeAll}>Tất cả →</Text>
            </TouchableOpacity>
          </View>

          <View style={s.tabRow}>
            {(['featured', 'new'] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[s.tab, activeTab === tab && s.tabActive]}
                onPress={() => setActiveTab(tab)}
                activeOpacity={0.8}
              >
                <Text style={[s.tabTxt, activeTab === tab && s.tabTxtActive]}>
                  {tab === 'featured' ? 'Nổi bật' : 'Mới nhất'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loading ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.carousel}>
              {[0, 1].map(i => <View key={i} style={s.skeleton} />)}
            </ScrollView>
          ) : displayCards.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyEmoji}>🔍</Text>
              <Text style={s.emptyTitle}>Chưa có bất động sản nào</Text>
              <Text style={s.emptyHint}>Kéo xuống để tải lại, hoặc gọi hotline để được tư vấn.</Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.carousel}
              snapToInterval={CARD_W + CARD_GAP}
              decelerationRate="fast"
              snapToAlignment="start"
            >
              {displayCards.map((p, i) => (
                <HomeCard
                  key={p.id}
                  property={p}
                  index={i}
                  onPress={() => navigation.navigate('PropertyDetail', { propertyId: p.id })}
                />
              ))}
            </ScrollView>
          )}

          {/* ══════════════════════════════════════════════════════════════
              LIÊN HỆ — khối cuối, gộp luôn lời mời đăng nhập
          ══════════════════════════════════════════════════════════════ */}
          <View style={s.section}>
            <View style={s.cta}>
              <Text style={s.ctaTitle}>Chưa tìm được căn ưng ý?</Text>
              <Text style={s.ctaDesc}>
                Nói chúng tôi nghe bạn cần gì — khu vực, ngân sách, ngày dọn vào. Đội ngũ
                Hoàng Bình Land sẽ tìm giúp bạn.
              </Text>
              <TouchableOpacity style={s.ctaBtn} onPress={callHotline} activeOpacity={0.85}>
                <Text style={s.ctaBtnIcon}>📞</Text>
                <Text style={s.ctaBtnTxt}>Gọi {HOTLINE_DISPLAY}</Text>
              </TouchableOpacity>
            </View>

            {/* Nhắc lại đăng nhập ở chân trang cho người đã cuộn hết mà chưa để ý
                nút trên đầu — cùng đích đến, không phải một lối vào khác. */}
            <TouchableOpacity
              style={s.footerLogin}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.7}
            >
              <Text style={s.footerLoginTxt}>
                Đã là khách thuê? <Text style={s.footerLoginLink}>Đăng nhập</Text>
              </Text>
            </TouchableOpacity>
          </View>

        </Animated.View>
      </ScrollView>

      <SearchOverlay
        visible={showSearch}
        onClose={() => setShowSearch(false)}
        properties={allProperties.length > 0 ? allProperties : featured}
        navigation={navigation}
      />
    </View>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },

  // ── Khối đầu ──────────────────────────────────────────────────────────────
  hero: {
    backgroundColor: Brand.ink,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  heroTint:  { ...StyleSheet.absoluteFillObject, backgroundColor: Brand.inkTint },
  heroInner: { paddingBottom: Spacing.lg },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: Spacing.lg,
  },
  brandRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logoBox: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  logoImg: { width: 30, height: 30 },
  brandName: { fontSize: 15, fontWeight: '800', color: Colors.white, letterSpacing: -0.3 },
  brandSub:  { fontSize: 10.5, color: 'rgba(255,255,255,0.58)', marginTop: 1 },

  topActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  callBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center', justifyContent: 'center',
  },
  callIcon: { fontSize: 16 },
  loginBtn: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.base, paddingVertical: 9,
    borderRadius: BorderRadius.full, ...Shadow.sm,
  },
  loginTxt: { fontSize: 13, fontWeight: '800', color: Brand.ink, letterSpacing: -0.1 },

  heroCopy:  { paddingHorizontal: Spacing.base, marginBottom: Spacing.lg },
  heroTitle: { fontSize: 26, fontWeight: '800', color: Colors.white, lineHeight: 33, letterSpacing: -0.7 },
  heroSub:   { fontSize: 12.5, color: 'rgba(255,255,255,0.66)', marginTop: Spacing.sm },

  search: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.base,
    backgroundColor: Colors.white, borderRadius: BorderRadius.full,
    paddingLeft: Spacing.base, paddingRight: 5, paddingVertical: 5,
    ...Shadow.lg,
  },
  searchIcon:        { fontSize: 14 },
  searchPlaceholder: { flex: 1, fontSize: 13.5, color: Colors.textMuted },
  searchBtn: {
    backgroundColor: Brand.red,
    paddingHorizontal: Spacing.base, paddingVertical: 9,
    borderRadius: BorderRadius.full,
  },
  searchBtnTxt: { color: Colors.white, fontSize: 13, fontWeight: '800' },

  heroChips: { gap: Spacing.sm, paddingHorizontal: Spacing.base, paddingTop: Spacing.md },
  heroChip: {
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.26)',
    backgroundColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: 13, paddingVertical: 6, borderRadius: BorderRadius.full,
  },
  heroChipTxt: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.90)' },

  // ── Loại hình ─────────────────────────────────────────────────────────────
  typeRow: {
    flexDirection: 'row', gap: Spacing.md,
    paddingHorizontal: Spacing.base, marginTop: Spacing.lg,
  },
  typeCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 20,
    padding: Spacing.base, borderWidth: 1, borderColor: Colors.divider, ...Shadow.sm,
  },
  typeIconBox: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
  },
  typeIcon:  { fontSize: 22 },
  typeLabel: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.2 },
  typeSub:   { fontSize: 11.5, color: Colors.textSecondary, marginTop: 2 },
  typeCount: { fontSize: 11.5, fontWeight: '800', marginTop: Spacing.sm },

  // ── Tiêu đề mục ───────────────────────────────────────────────────────────
  sectionHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    paddingHorizontal: Spacing.base, marginTop: Spacing.xl,
  },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5 },
  sectionSub:   { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  seeAll:       { fontSize: 13, color: Brand.greenDark, fontWeight: '700' },

  tabRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.base, marginTop: Spacing.md },
  tab: {
    paddingHorizontal: Spacing.base, paddingVertical: 7,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border,
  },
  tabActive:    { backgroundColor: Brand.ink, borderColor: Brand.ink },
  tabTxt:       { fontSize: 12.5, color: Colors.textSecondary, fontWeight: '700' },
  tabTxtActive: { color: Colors.white },

  carousel: { gap: CARD_GAP, paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.xs },
  skeleton: { width: CARD_W, height: 272, borderRadius: 22, backgroundColor: '#E8EBF2' },

  empty:      { alignItems: 'center', paddingVertical: Spacing['3xl'], paddingHorizontal: Spacing.xl },
  emptyEmoji: { fontSize: 34, marginBottom: Spacing.sm },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  emptyHint:  { fontSize: 12.5, color: Colors.textMuted, marginTop: 4, textAlign: 'center', lineHeight: 18 },

  // ── Liên hệ ───────────────────────────────────────────────────────────────
  section: { paddingHorizontal: Spacing.base, marginTop: Spacing.xl },
  cta: {
    backgroundColor: Brand.ink, borderRadius: 22,
    padding: Spacing.lg, ...Shadow.lg,
  },
  ctaTitle: { fontSize: 17, fontWeight: '800', color: Colors.white, letterSpacing: -0.3 },
  ctaDesc:  { fontSize: 12.5, color: 'rgba(255,255,255,0.62)', lineHeight: 19, marginTop: 6 },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Brand.green, borderRadius: 14,
    paddingVertical: Spacing.md + 1, marginTop: Spacing.lg,
  },
  ctaBtnIcon: { fontSize: 16 },
  ctaBtnTxt:  { color: Colors.white, fontSize: 15.5, fontWeight: '800', letterSpacing: 0.1 },

  footerLogin:     { alignItems: 'center', paddingVertical: Spacing.lg },
  footerLoginTxt:  { fontSize: 13, color: Colors.textSecondary },
  footerLoginLink: { color: Brand.greenDark, fontWeight: '800' },
});
