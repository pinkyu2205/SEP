import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, canTerminateForUnpaidRent } from '@/constants';
import { activeRentingKeys, belongsToActiveTenant } from '@/utils';
import { useAuth } from '@/hooks';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import {
  ManagedProperty, getPropPriority, getPriorityMeta, getIssueCount,
} from '@/types/managedProperty';
import { managerPropertyService } from '@/services/manager/propertyService';
import {
  realManagerInvoiceService, ManagerInvoice, ManagerPayment,
} from '@/services/manager/invoiceService';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';
import { checkoutService } from '@/services/manager/checkoutService';
import { meterReadingService } from '@/services/manager/meterReadingService';
import type { CheckoutRequestDto } from '@/services/tenant/selfService';
import { serverNow, todayIso } from '@/utils/serverTime';

/**
 * Lối tắt tới những màn KHÔNG nằm trong thanh tab dưới đáy, xếp thành lưới 4×2.
 *
 * Bản cũ có 11 ô trong một `ScrollView horizontal`. Hai vấn đề:
 *
 * 1. **Ba ô trùng tab** — `ManagerBilling`, `ManagerMaintenance`, `BuildingList` chính là
 *    3 trong 5 tab đang hiện thường trực ngay bên dưới, cùng badge.
 * 2. **Sáu ô cuối không ai thấy.** Cuộn ngang không có dấu hiệu nào báo còn nội dung phía
 *    sau. Nặng nhất là "Trả phòng" — nó có badge `checkoutTodo` mà lại nằm thứ 11, tức là
 *    badge đó chưa từng lọt vào mắt ai.
 *
 * Bỏ 3 ô trùng còn 8, vừa đúng lưới 4×2 — thấy hết trong một cái nhìn, không phải cuộn.
 */
const QUICK_ACTIONS = [
  // — Hàng 1: việc thao tác hằng ngày —
  // Từ 13/08/2026 "Đón khách" và "Khách chờ đón" là MỘT luồng — cả hai vào
  // ResumeContract. Màn wizard cũ (OnboardingV2) đã gỡ khỏi navigator.
  { emoji: '🤝', label: 'Đón khách',      route: 'ResumeContract',        color: Colors.primary },
  // Đối xứng với 'Đón khách' — hai đầu vòng đời khách thuê, cùng nhìn từ phía manager.
  // Không đặt 'Trả phòng': đó là hành động của KHÁCH, manager chỉ tiếp nhận và xử lý hồ sơ.
  { emoji: '🚪', label: 'Tiễn khách',     route: 'CheckoutRequests',      color: Colors.error   },
  // Mọi khoản thu ngoài tiền nhà (cọc, bảo trì, điện nước) — tách khỏi tab Hoá đơn để
  // hai việc không lẫn vào nhau.
  { emoji: '💳', label: 'Thu & Đối soát', route: 'ManagerPaymentHistory', color: Colors.info    },
  // "Cần chụp số" từng ở đây, nay chuyển xuống "Cần xử lý": nó là một VIỆC có hạn và có
  // số lượng, không phải một nơi để đi tới. Ở lưới này nó chiếm chỗ cố định dù hầu hết
  // thời gian đếm bằng 0; ở dưới kia nó chỉ hiện khi thật sự còn phòng chưa chụp, và hiện
  // kèm số — nên khó lỡ hơn hẳn.

  // — Hàng 2: định kỳ và tra cứu —
  { emoji: '⚡', label: 'Chốt số',        route: 'UtilityBilling',        color: Colors.accent  },
  { emoji: '👥', label: 'Khách thuê',     route: 'TenantList',            color: Colors.primary },
  { emoji: '📋', label: 'Hợp đồng',       route: 'ManagerContracts',      color: Colors.info    },
  { emoji: '📦', label: 'Thiết bị',       route: 'Equipment',             color: Colors.textSecondary },
] as const;

const ACTIONS_PER_ROW = 4;

/**
 * Cắt sẵn thành từng hàng 4 ô.
 *
 * Không dùng `flexWrap` + `width: '23.5%'`: bốn ô 23.5% cộng ba khoảng `gap` là vượt 100%,
 * React Native đẩy ô thứ tư xuống hàng dưới và lưới vỡ thành 3 ô/hàng. Chia hàng sẵn rồi
 * cho mỗi ô `flex: 1` thì phần còn lại sau `gap` tự chia đều — không còn số nào để tính sai.
 */
const ACTION_ROWS = Array.from(
  { length: Math.ceil(QUICK_ACTIONS.length / ACTIONS_PER_ROW) },
  (_, i) => QUICK_ACTIONS.slice(i * ACTIONS_PER_ROW, (i + 1) * ACTIONS_PER_ROW),
);

// ── Component ──────────────────────────────────────────────────────────────

export const ManagerHomeScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation<any>();

  const [properties, setProperties] = useState<ManagedProperty[]>([]);
  const [invoices, setInvoices] = useState<ManagerInvoice[]>([]);
  const [payments, setPayments] = useState<ManagerPayment[]>([]);
  const [draftContracts, setDraftContracts] = useState<TenantContractResponse[]>([]);
  const [activeContracts, setActiveContracts] = useState<TenantContractResponse[]>([]);
  const [checkouts, setCheckouts] = useState<CheckoutRequestDto[]>([]);
  /** Số dòng phòng còn thiếu ảnh công tơ kỳ này (mỗi HĐ thiếu cả điện lẫn nước tính 2 dòng). */
  const [pendingMeterCount, setPendingMeterCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const realUnread = useUnreadNotifications();   // badge chuông: BE + thông báo trả phòng

  const load = useCallback(async () => {
    try {
      const [props, inv, pay, drafts, checkoutList, pendingMeters] = await Promise.all([
        managerPropertyService.getManagedProperties(),
        realManagerInvoiceService.listInvoices().catch(() => [] as ManagerInvoice[]),
        realManagerInvoiceService.listPayments().catch(() => [] as ManagerPayment[]),
        realTenantService.listManagedContracts('DRAFT').catch(() => [] as TenantContractResponse[]),
        checkoutService.list().catch(() => [] as CheckoutRequestDto[]),
        // Phòng còn thiếu ảnh công tơ kỳ này — việc có hạn, đưa vào "Cần xử lý" bên dưới.
        meterReadingService.listPending().catch(() => []),
      ]);
      setProperties(props);
      setInvoices(inv);
      setPayments(pay);
      setDraftContracts(drafts);
      setCheckouts(checkoutList);
      setPendingMeterCount(pendingMeters.length);

      // HĐ đang hiệu lực — để loại hoá đơn của khách ĐÃ chấm dứt khỏi "My Task".
      // Hỏi theo từng nhà (xem listActiveByProperties) nên phải đợi có `props` trước.
      const activeCts = await realTenantService
        .listActiveByProperties(props.map(p => Number(p.id)))
        .catch(() => [] as TenantContractResponse[]);
      setActiveContracts(activeCts);
    } catch {
      // Lỗi đã được xử lý/log ở service; giữ dữ liệu cũ.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = () => { setRefreshing(true); load(); };

  // Số liệu tổng hợp từ nhà của manager (API thật, đã lọc theo quyền).
  const m = useMemo(() => {
    const multi = properties.filter(p => p.propertyType === 'MULTI_ROOM');
    const whole = properties.filter(p => p.propertyType === 'WHOLE_HOUSE');
    const roomsTotal = multi.reduce((s, p) => s + p.totalRooms, 0);
    const roomsOccupied = multi.reduce((s, p) => s + p.occupied, 0);
    const roomsAvailable = multi.reduce((s, p) => s + p.available, 0);
    const maintenance = properties.reduce((s, p) => s + p.maintenance, 0);
    const wholeOccupied = whole.filter(p => p.rentalStatus === 'rented' || p.rentalStatus === 'expiring').length;
    return {
      totalBuildings: properties.length,
      multiCount: multi.length,
      wholeCount: whole.length,
      roomsTotal, roomsOccupied, roomsAvailable, maintenance, wholeOccupied,
      tenants: roomsOccupied + wholeOccupied,
      multiRate: roomsTotal > 0 ? Math.round((roomsOccupied / roomsTotal) * 100) : 0,
      wholeRate: whole.length > 0 ? Math.round((wholeOccupied / whole.length) * 100) : 0,
    };
  }, [properties]);

  const attentionBuildings = useMemo(
    () => [...properties].sort((a, b) => getPropPriority(a) - getPropPriority(b)).slice(0, 3),
    [properties],
  );

  /**
   * "My Task" chỉ đếm việc manager CÒN LÀM ĐƯỢC.
   *
   * Khách đã chấm dứt hợp đồng thì hoá đơn còn nợ của họ không thuộc về đây — họ đã
   * rời đi, phần nợ xử lý ở luồng tất toán Trả phòng. BE vẫn giữ trạng thái OVERDUE
   * nên phải tự lọc (xem belongsToActiveTenant trong @/utils).
   */
  const rentingKeys = useMemo(() => activeRentingKeys(activeContracts), [activeContracts]);
  const actionableInvoices = useMemo(
    () => invoices.filter(i => belongsToActiveTenant(i, rentingKeys)),
    [invoices, rentingKeys],
  );

  /**
   * ─── ĐẾM TÁCH THEO LOẠI HOÁ ĐƠN ──────────────────────────────────────────────
   *
   * Mỗi ô ở đây bấm vào là sang một màn khác nhau, mà mỗi màn chỉ hiện đúng LOẠI hoá
   * đơn của nó: "Hoá đơn tiền nhà" chỉ có RENT, "Ghi chỉ số & Hoá đơn" chỉ có
   * điện/nước. Nên ô nào cũng phải đếm đúng phần màn đích hiện được.
   *
   * Trước 18/08/2026 ô "Hóa đơn quá hạn" đếm MỌI loại rồi dẫn sang màn tiền nhà:
   * trang chủ báo 9, bấm vào đếm được 1 — 8 cái còn lại là điện/nước, nằm ở màn khác
   * mà không ô nào chỉ đường tới. Người dùng chỉ thấy hai con số đá nhau.
   */
  const isUtility = (i: ManagerInvoice) => i.type === 'ELECTRICITY' || i.type === 'WATER';
  const overdueRent = actionableInvoices.filter(i =>
    i.status === 'OVERDUE' && i.type === 'RENT').length;
  const overdueUtility = actionableInvoices.filter(i =>
    i.status === 'OVERDUE' && isUtility(i)).length;
  // Loại còn lại (SERVICE / OTHER) chưa có màn riêng — gộp vào ô tiền nhà để không
  // mất hẳn khỏi danh sách việc, thà lệch một ít còn hơn giấu.
  const overdueOther = actionableInvoices.filter(i =>
    i.status === 'OVERDUE' && i.type !== 'RENT' && !isUtility(i)).length;
  // Tiền phòng quá hạn tới mức được quyền chấm dứt HĐ (từ ngày 8 — xem @/constants/rentCycle).
  const rentTerminable = actionableInvoices.filter(i =>
    i.type === 'RENT' && canTerminateForUnpaidRent(i.dueDate, i.status)).length;
  const pendingVerify = payments.filter(p => p.status === 'PENDING_VERIFY').length;

  /**
   * Lịch đón khách — hợp đồng nháp đã gán cho manager này, đến hạn đón hôm nay
   * (hoặc đã quá hạn mà chưa đón). Dữ liệu thật từ /tenant-contracts/managed?status=DRAFT.
   *
   * Ngày đối chiếu lấy theo thứ tự `moveInDate → expectedReceptionDate → startDate`,
   * GIỐNG ResumeContractScreen. Trước 15/08/2026 chỗ này chỉ so `expectedReceptionDate`
   * — mà trường đó chỉ có giá trị khi manager tự đặt lịch hẹn; hợp đồng import từ Excel
   * luôn để null (BE trả `expectedReceptionDate: null`, ngày trong file rơi vào
   * `moveInDate`/`startDate`). Kết quả: đúng ngày đón khách mà My Task vẫn báo
   * "Mọi thứ ổn định hôm nay" dù thông báo "Được gán tiếp nhận khách mới" đã tới.
   *
   * Đếm cả ngày đã qua: hợp đồng nháp quá hạn đón còn gấp hơn, mà nếu chỉ so bằng
   * đúng hôm nay thì sang ngày hôm sau nó biến mất khỏi danh sách việc.
   */
  const today = todayIso();
  const receptionDateOf = (c: TenantContractResponse): string | null => {
    const raw = c.moveInDate || c.expectedReceptionDate || c.startDate;
    return raw ? String(raw).slice(0, 10) : null;
  };
  const receptionToday = draftContracts.filter(c => {
    const d = receptionDateOf(c);
    return !!d && d <= today;
  });

  // Trả phòng: hồ sơ đang chờ CHÍNH MANAGER làm gì đó. Khách gửi yêu cầu / đồng ý
  // quyết toán / phản đối đều rơi vào đây, nên việc mới hiện ngay ở màn đầu chứ không
  // chỉ nằm trong thông báo.
  const checkoutPending = checkouts.filter(c => (c.status || '').toUpperCase() === 'PENDING').length;
  const checkoutTodo = checkouts.filter(c =>
    ['PENDING', 'APPROVED', 'INSPECTING', 'DISPUTED', 'SETTLING'].includes((c.status || '').toUpperCase()),
  ).length;

  const priorityItems = [
    { id: 'p0', icon: '🤝', label: 'Khách đến hạn đón',          count: receptionToday.length, urgency: 'critical', color: Colors.primary, route: 'ResumeContract' },
    { id: 'p1', icon: '🧾', label: 'Tiền nhà quá hạn',          count: overdueRent + overdueOther, urgency: 'critical', color: Colors.error, route: 'ManagerBilling' },
    // `tab: 'history'` để vào thẳng danh sách hoá đơn điện/nước, không rơi vào bước
    // ghi chỉ số — việc cần làm ở đây là đi đòi, không phải chụp đồng hồ.
    { id: 'p1b', icon: '⚡', label: 'Điện/nước quá hạn',        count: overdueUtility, urgency: 'critical', color: Colors.error, route: 'UtilityBilling', params: { tab: 'history' } },
    { id: 'p2', icon: '🔧', label: 'Bảo trì cần xử lý',        count: m.maintenance, urgency: m.maintenance > 0 ? 'critical' : 'info', color: Colors.error, route: 'ManagerMaintenance' },
    { id: 'p4', icon: '🚪', label: checkoutPending > 0 ? 'Yêu cầu trả phòng chờ duyệt' : 'Hồ sơ trả phòng đang xử lý',
      count: checkoutPending > 0 ? checkoutPending : checkoutTodo,
      urgency: checkoutPending > 0 ? 'critical' : 'warning', color: '#DC2626', route: 'CheckoutRequests' },
    // Vào màn Hoá đơn tiền nhà, KHÔNG phải màn Tiền phòng tự động: màn kia chỉ để cấu
    // hình lịch phát hành, còn thao tác chấm dứt HĐ nằm ở mục "Cần xử lý" của màn này.
    { id: 'p5', icon: '⛔', label: 'Tiền phòng quá hạn — được chấm dứt HĐ', count: rentTerminable, urgency: 'critical', color: Colors.error, route: 'ManagerBilling' },
    { id: 'p3', icon: '💳', label: 'Chờ xác nhận thanh toán',  count: pendingVerify, urgency: 'warning',  color: Colors.warning, route: 'ManagerBilling' },
    // Không chụp được ảnh công tơ thì không phát hành được hoá đơn điện/nước — việc này
    // chặn cả kỳ thu tiền, nên xếp cùng nhóm gấp với tiền quá hạn.
    { id: 'p6', icon: '📸', label: 'Phòng chưa chụp công tơ', count: pendingMeterCount, urgency: 'critical', color: Colors.warning, route: 'MeterReadingPending' },
  ];

  const activeItems    = priorityItems.filter(p => p.count > 0);
  const criticalItems  = activeItems.filter(p => p.urgency === 'critical');
  const secondaryItems = activeItems.filter(p => p.urgency !== 'critical');
  const urgentTotal    = criticalItems.reduce((sum, p) => sum + p.count, 0);

  // Status sentence shown inside the hero card
  const heroStatusText  = urgentTotal > 0
    ? `${urgentTotal} việc cần xử lý ngay`
    : 'Hoạt động ổn định hôm nay';
  const heroStatusColor = urgentTotal > 0 ? '#FCD34D' : '#6EE7B7';

  const firstName = user?.fullName?.split(' ').pop() ?? 'Quản lý';
  const todayStr  = serverNow().toLocaleDateString('vi-VN', {
    weekday: 'short', day: 'numeric', month: 'numeric',
  });

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[Colors.primary]} tintColor={Colors.primary} />
        }
      >

        {/* ── Header ─────────────────────────────────────────────────── */}
        {/*
          Ngày đứng CÙNG HÀNG với lời chào, nằm sát cái chuông — trước đây nó xếp chồng
          phía trên lời chào ở cỡ 11px nên vừa lọt thỏm vừa đẩy khối chữ cao lên.
          Không thêm đồng hồ giờ:phút ở đây: thanh trạng thái của điện thoại đã có sẵn,
          bày thêm một cái nữa trong app là thừa.
        */}
        <View style={s.header}>
          <Text style={s.headerName} numberOfLines={1}>Chào, {firstName} 👋</Text>

          <View style={s.headerRight}>
            <Text style={s.headerDate}>{todayStr}</Text>
            <TouchableOpacity style={s.notifBtn} onPress={() => navigation.navigate('NotificationCenter')}>
              <Text style={s.notifIcon}>🔔</Text>
              {(realUnread ?? 0) > 0 && (
                <View style={s.notifBadge}>
                  <Text style={s.notifBadgeText}>
                    {(realUnread ?? 0) > 9 ? '9+' : (realUnread ?? 0)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── My Task hôm nay — luôn hiện đầu trang, không cần bấm vào ── */}
        <View style={s.sectionRow}>
          <Text style={s.sectionTitle}>My Task — hôm nay</Text>
          {urgentTotal > 0 && (
            <View style={s.urgentPill}>
              <Text style={s.urgentPillText}>{urgentTotal} khẩn</Text>
            </View>
          )}
        </View>

        {activeItems.length === 0 ? (
          /* ── All clear state ── */
          <View style={s.clearCard}>
            <Text style={s.clearText}>✅  Mọi thứ ổn định hôm nay</Text>
          </View>
        ) : (
          <>
            {/* ── Featured critical cards (2-column grid) ──────────── */}
            {criticalItems.length > 0 && (
              <View style={s.featuredGrid}>
                {criticalItems.slice(0, 2).map(item => (
                  <TouchableOpacity
                    key={item.id}
                    style={[s.featuredCard, {
                      backgroundColor : item.color + '0C',
                      borderColor     : item.color + '2E',
                    }]}
                    onPress={() => navigation.navigate(item.route, (item as any).params)}
                    activeOpacity={0.72}
                  >
                    {/* Icon + count badge */}
                    <View style={s.featuredTop}>
                      <View style={[s.featuredIconWrap, { backgroundColor: item.color + '1A' }]}>
                        <Text style={s.featuredEmoji}>{item.icon}</Text>
                      </View>
                      <View style={[s.featuredCountBadge, { backgroundColor: item.color }]}>
                        <Text style={s.featuredCountText}>{item.count}</Text>
                      </View>
                    </View>

                    {/* Label */}
                    <Text style={s.featuredLabel} numberOfLines={2}>{item.label}</Text>

                    {/* CTA */}
                    <Text style={[s.featuredCta, { color: item.color }]}>Xử lý →</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* ── Secondary items — compact grouped list ────────────── */}
            {secondaryItems.length > 0 && (
              <View style={s.secondaryCard}>
                {secondaryItems.map((item, i) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[
                      s.secondaryRow,
                      i < secondaryItems.length - 1 && s.secondaryRowBorder,
                    ]}
                    onPress={() => navigation.navigate(item.route, (item as any).params)}
                    activeOpacity={0.75}
                  >
                    <View style={[s.secondaryIconWrap, { backgroundColor: item.color + '14' }]}>
                      <Text style={s.secondaryEmoji}>{item.icon}</Text>
                    </View>
                    <Text style={s.secondaryLabel}>{item.label}</Text>
                    <View style={[s.secondaryBadge, { backgroundColor: item.color + '15' }]}>
                      <Text style={[s.secondaryBadgeText, { color: item.color }]}>{item.count}</Text>
                    </View>
                    <Text style={s.chevron}>›</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        {/* ── Overview Card ─────────────────────────────────────────── */}
        <View style={s.ovCard}>

          {/* Header row */}
          <View style={s.ovCardHdr}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={s.ovCardTitle}>Tổng quan của bạn</Text>
              <Text style={s.ovCardSub} numberOfLines={1}>
                {m.totalBuildings} tòa nhà • {m.roomsTotal} phòng lẻ • {m.wholeCount} nhà nguyên căn
              </Text>
            </View>
            {urgentTotal > 0 && (
              <View style={s.ovCardBadge}>
                <Text style={s.ovCardBadgeText}>⚠ {urgentTotal} việc</Text>
              </View>
            )}
          </View>

          {/* 3 KPI phòng — số liệu thật từ nhà của manager */}
          <View style={s.ovKpiRow}>
            {/* Khách thuê đang ở */}
            <View style={s.ovKpiItem}>
              <View style={[s.ovKpiIcon, { backgroundColor: Colors.primaryBg }]}>
                <MaterialIcons name="perm-identity" size={22} color={Colors.primary} />
              </View>
              <View style={s.ovKpiTexts}>
                <Text style={[s.ovKpiVal, { color: Colors.primary }]}>{m.tenants}</Text>
                <Text style={s.ovKpiLbl}>Khách thuê</Text>
                <Text style={s.ovKpiNote}>Đang ở</Text>
              </View>
            </View>

            <View style={s.ovKpiSep} />

            {/* Phòng trống */}
            <View style={s.ovKpiItem}>
              <View style={[s.ovKpiIcon, { backgroundColor: Colors.successLight }]}>
                <MaterialIcons name="meeting-room" size={22} color={Colors.success} />
              </View>
              <View style={s.ovKpiTexts}>
                <Text style={[s.ovKpiVal, { color: Colors.success }]}>{m.roomsAvailable}</Text>
                <Text style={s.ovKpiLbl}>Phòng trống</Text>
                <Text style={s.ovKpiNote}>Sẵn cho thuê</Text>
              </View>
            </View>

            <View style={s.ovKpiSep} />

            {/* Bảo trì */}
            <View style={s.ovKpiItem}>
              <View style={[s.ovKpiIcon, { backgroundColor: Colors.warningLight }]}>
                <MaterialIcons name="build" size={20} color={Colors.warning} />
              </View>
              <View style={s.ovKpiTexts}>
                <Text style={[s.ovKpiVal, { color: Colors.warning }]}>{m.maintenance}</Text>
                <Text style={s.ovKpiLbl}>Bảo trì</Text>
                <Text style={s.ovKpiNote}>Phòng cần xử lý</Text>
              </View>
            </View>
          </View>

          {/* Rental summary pills — icon circle + text + highlighted % */}
          <View style={s.ovRentalRow}>
            {/* Phòng lẻ */}
            <View style={[s.ovRentalPill, { backgroundColor: Colors.primaryBg }]}>
              <View style={[s.ovRentalIconWrap, { backgroundColor: Colors.primary + '20' }]}>
                <MaterialIcons name="apartment" size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.ovRentalLabel, { color: Colors.primary }]}>Phòng lẻ</Text>
                <Text style={s.ovRentalValue}>
                  {m.roomsOccupied}/{m.roomsTotal} đang thuê
                  {'  '}
                  <Text style={{ color: Colors.primary, fontWeight: '700' }}>{m.multiRate}%</Text>
                </Text>
              </View>
            </View>

            {/* Nhà nguyên căn */}
            <View style={[s.ovRentalPill, { backgroundColor: Colors.successLight }]}>
              <View style={[s.ovRentalIconWrap, { backgroundColor: Colors.success + '25' }]}>
                <MaterialIcons name="home" size={18} color={Colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.ovRentalLabel, { color: Colors.success }]}>Nhà nguyên căn</Text>
                <Text style={s.ovRentalValue}>
                  {m.wholeOccupied}/{m.wholeCount} đang thuê
                  {'  '}
                  <Text style={{ color: Colors.success, fontWeight: '700' }}>{m.wholeRate}%</Text>
                </Text>
              </View>
            </View>
          </View>


        </View>

        {/* ── Thao tác nhanh ────────────────────────────────────────── */}
        <View style={[s.sectionRow, { marginTop: Spacing.lg }]}>
          <Text style={s.sectionTitle}>Thao tác nhanh</Text>
        </View>
        {/*
          Không gắn badge ở đây nữa. Mọi con số cần gấp đã nằm ở khối "Cần xử lý" phía trên
          (`priorityItems` — có nhãn và số lượng, chỉ hiện khi > 0) hoặc trên chính thanh tab.
          Lặp lại lần thứ ba chỉ làm loãng, và badge đứng một mình không nói được nó là việc gì.
        */}
        {ACTION_ROWS.map((row, rowIndex) => (
          <View key={rowIndex} style={s.actionsRow}>
            {row.map((a) => (
              <TouchableOpacity
                key={a.route}
                style={s.actionChip}
                onPress={() => navigation.navigate(a.route)}
                activeOpacity={0.7}
              >
                <View style={[s.actionIconWrap, { backgroundColor: a.color + '15' }]}>
                  <Text style={s.actionEmoji}>{a.emoji}</Text>
                </View>
                <Text style={s.actionLabel} numberOfLines={2}>{a.label}</Text>
              </TouchableOpacity>
            ))}
            {/* Ô trống giữ chỗ: hàng cuối thiếu ô thì `flex: 1` sẽ kéo giãn mấy ô còn lại
                cho đầy hàng, làm chúng to hơn hàng trên. */}
            {Array.from({ length: ACTIONS_PER_ROW - row.length }).map((_, i) => (
              <View key={`spacer-${i}`} style={s.actionSpacer} />
            ))}
          </View>
        ))}

        {/* ── Toà nhà cần chú ý ─────────────────────────────────────── */}
        <View style={[s.sectionRow, { marginTop: Spacing.lg }]}>
          <Text style={s.sectionTitle}>Cần chú ý</Text>
          <TouchableOpacity onPress={() => navigation.navigate('BuildingList')}>
            <Text style={s.sectionLink}>Xem tất cả →</Text>
          </TouchableOpacity>
        </View>

        {loading && properties.length === 0 ? (
          <View style={s.homeLoading}><ActivityIndicator color={Colors.primary} /></View>
        ) : attentionBuildings.length === 0 ? (
          <View style={s.clearCard}><Text style={s.clearText}>Chưa có toà nhà nào được phân quyền cho bạn</Text></View>
        ) : attentionBuildings.map(prop => {
          const isWholeHouse = prop.propertyType === 'WHOLE_HOUSE';
          const occ = isWholeHouse || prop.totalRooms === 0 ? 0 : Math.round((prop.occupied / prop.totalRooms) * 100);
          const { severity, color: borderColor } = getPriorityMeta(prop);
          const issues = getIssueCount(prop);
          const occColor = occ >= 80 ? Colors.success
            : occ >= 60 ? Colors.primary
            : occ >= 40 ? Colors.warning
            : Colors.error;

          return (
            <TouchableOpacity
              key={prop.id}
              style={[s.buildingCard, { borderLeftColor: borderColor ?? Colors.border }]}
              onPress={() => navigation.navigate(isWholeHouse ? 'WholeHouseDetail' : 'BuildingDetail', { propertyId: prop.id, property: prop })}
              activeOpacity={0.7}
            >
              <View style={s.buildingInfo}>
                <Text style={s.buildingName} numberOfLines={1}>{prop.name}</Text>
                <Text style={s.buildingDistrict}>{isWholeHouse ? 'Nhà nguyên căn' : prop.district}</Text>
              </View>
              <View style={s.buildingStats}>
                <Text style={[s.buildingOcc, { color: isWholeHouse ? Colors.warning : occColor }]}>
                  {isWholeHouse ? (prop.rentalStatus === 'vacant' ? 'Trống' : 'Thuê') : `${occ}%`}
                </Text>
                {issues > 0 && (
                  <View style={[
                    s.buildingIssuePill,
                    { backgroundColor: severity === 'critical' ? Colors.errorLight : Colors.warningLight },
                  ]}>
                    <Text style={[
                      s.buildingIssueText,
                      { color: severity === 'critical' ? Colors.error : Colors.warning },
                    ]}>
                      {issues} vấn đề
                    </Text>
                  </View>
                )}
                <Text style={s.chevron}>›</Text>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* ── View All Buildings CTA ─────────────────────────────────── */}
        <TouchableOpacity
          style={s.viewAllBtn}
          onPress={() => navigation.navigate('BuildingList')}
          activeOpacity={0.8}
        >
          <Text style={s.viewAllText}>🏢  Quản lý tất cả toà nhà ({m.totalBuildings})</Text>
          <Text style={s.viewAllArrow}>→</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.base, paddingBottom: Spacing['3xl'] },

  // ── Header ────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: Spacing.base, paddingBottom: Spacing.md,
  },
  // Cụm bên phải: ngày + chuông, cách nhau vừa đủ để đọc ra một cụm chứ không dính nhau.
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  // 11 → 14px, đậm hơn: cùng hàng với lời chào 20px nên nhỏ quá sẽ chìm hẳn.
  headerDate: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, letterSpacing: 0.1 },
  // flexShrink để tên dài thì lời chào tự cắt, không đẩy ngày & chuông ra khỏi màn.
  headerName: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.3, flexShrink: 1 },
  notifBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  notifIcon:      { fontSize: 16 },
  notifBadge:     {
    position: 'absolute', top: 4, right: 4, minWidth: 14, height: 14,
    borderRadius: 7, backgroundColor: Colors.error,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  notifBadgeText: { fontSize: 8, fontWeight: '800', color: Colors.white },

  // ── Overview Card ─────────────────────────────────────────────────
  ovCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.base,
    paddingTop: 14,
    paddingBottom: 0,
    marginBottom: Spacing.lg,
    shadowColor: '#1E2347',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 3,
  },
  ovCardHdr: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  ovCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  ovCardSub: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '400',
  },
  ovCardBadge: {
    backgroundColor: Colors.errorLight,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 1,
    flexShrink: 0,
  },
  ovCardBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.error,
  },

  // KPI row — horizontal: icon circle left, text stack right
  ovKpiRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    marginBottom: 10,
  },
  ovKpiItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  ovKpiIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ovKpiTexts: {
    flex: 1,
  },
  ovKpiSep: {
    width: 1,
    backgroundColor: Colors.divider,
    marginVertical: 2,
  },
  ovKpiVal: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 22,
  },
  ovKpiLbl: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: 1,
  },
  ovKpiNote: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 1,
  },

  // Rental summary row
  ovRentalRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  ovRentalPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 8,
  },
  ovRentalIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ovRentalLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  ovRentalValue: {
    fontSize: 10,
    fontWeight: '400',
    color: Colors.textSecondary,
    lineHeight: 13,
  },

  // Footer link

  // ── Section headers ───────────────────────────────────────────────
  sectionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: Spacing.xs + 2,
  },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  sectionLink:  { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  urgentPill: {
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.full,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  urgentPillText: { fontSize: 10, fontWeight: '700', color: Colors.error },

  // ── Priority center: all-clear state ─────────────────────────────
  clearCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: Spacing.md, alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  clearText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
  homeLoading: { paddingVertical: Spacing.xl, alignItems: 'center' },

  // ── Priority center: featured (critical) cards ────────────────────
  // Two-column grid; each card gets flex:1 so a single card fills full width.
  featuredGrid: {
    flexDirection: 'row', gap: 8, marginBottom: 8,
  },
  featuredCard: {
    flex: 1, borderRadius: BorderRadius.lg,
    borderWidth: 1,
    paddingVertical: 11, paddingHorizontal: 11,
  },
  featuredTop: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 7,
  },
  featuredIconWrap: {
    width: 28, height: 28, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  featuredEmoji:      { fontSize: 14 },
  featuredCountBadge: {
    minWidth: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  featuredCountText: { fontSize: 12, fontWeight: '800', color: Colors.white },
  featuredLabel: {
    fontSize: 12, fontWeight: '600', color: Colors.textPrimary,
    lineHeight: 16, marginBottom: 5,
  },
  featuredCta: { fontSize: 11, fontWeight: '600' },

  // ── Priority center: secondary items list ─────────────────────────
  secondaryCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden', marginBottom: Spacing.xs,
  },
  secondaryRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: 9,
    gap: Spacing.md,
  },
  secondaryRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  secondaryIconWrap:  {
    width: 26, height: 26, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center',
  },
  secondaryEmoji:     { fontSize: 13 },
  secondaryLabel:     { flex: 1, fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  secondaryBadge:     {
    minWidth: 22, height: 17, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  secondaryBadgeText: { fontSize: 10, fontWeight: '700' },

  chevron: { fontSize: 15, color: Colors.textMuted },

  // ── Quick actions ─────────────────────────────────────────────────
  actionsRow: {
    flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm,
  },
  actionSpacer: { flex: 1 },
  actionChip: {
    flex: 1, alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    paddingVertical: 10, paddingHorizontal: 3,
    borderWidth: 1, borderColor: Colors.border,
  },
  actionIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginBottom: 5,
  },
  actionEmoji:     { fontSize: 17 },
  /**
   * Nhãn chừa sẵn chỗ cho ĐÚNG 2 dòng (`minHeight = 2 × lineHeight`).
   *
   * Ép 1 dòng thì "Thu & Đối soát" bị cắt thành "Thu & Đối so…" — ô rộng khoảng 78px, ở
   * cỡ 11px chỉ chứa nổi ~11 ký tự. Còn để 2 dòng mà không khoá chiều cao thì ô nào nhãn
   * dài sẽ cao hơn hẳn các ô cùng hàng, lưới xô lệch.
   */
  actionLabel: {
    fontSize: 11, fontWeight: '600', color: Colors.textSecondary,
    textAlign: 'center', lineHeight: 14, minHeight: 28,
  },

  // ── Building attention cards ──────────────────────────────────────
  buildingCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingVertical: 13, paddingHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 3,
  },
  buildingInfo:      { flex: 1 },
  buildingName:      { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  buildingDistrict:  { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  buildingStats:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  buildingOcc:       { fontSize: 13, fontWeight: '700' },
  buildingIssuePill: { borderRadius: BorderRadius.full, paddingHorizontal: 7, paddingVertical: 3 },
  buildingIssueText: { fontSize: 10, fontWeight: '600' },

  // ── View all CTA ──────────────────────────────────────────────────
  viewAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
    borderWidth: 1, borderColor: Colors.primary + '28',
    marginTop: Spacing.xs,
  },
  viewAllText:  { fontSize: 13, fontWeight: '600', color: Colors.primary },
  viewAllArrow: { fontSize: 15, color: Colors.primary, fontWeight: '600' },
});
