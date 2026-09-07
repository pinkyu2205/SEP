import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import {
  Colors, Spacing, BorderRadius, Shadow,
} from '@/constants';
import { useAuth, useTenantContract } from '@/hooks';
import {
  billMonthLabel, formatCurrency, formatDate, getDaysSince, getDaysUntil, isToday, onboardChargeLines,
} from '@/utils';
import { serverNow } from '@/utils/serverTime';
import { SharedBill, InvoiceType } from '@/types/bill';
import { realTenantSelfService, TenantDashboard } from '@/services/tenant/selfService';
import type { CheckoutRequestDto } from '@/services/tenant/selfService';
import { checkoutMeta } from '@/constants';
import { realTenantBillingService, toSharedBill } from '@/services/tenant/billingService';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';

const TYPE_CFG: Record<InvoiceType, { label: string; icon: string; color: string; bg: string }> = {
  rent:        { label: 'Tiền phòng', icon: '🏠', color: '#7C3AED', bg: '#F5F3FF' },
  electricity: { label: 'Điện',       icon: '⚡', color: '#D97706', bg: '#FEF9C3' },
  water:       { label: 'Nước',       icon: '💧', color: '#2563EB', bg: '#DBEAFE' },
  maintenance: { label: 'Phí bảo trì', icon: '🔧', color: '#DC2626', bg: '#FEE2E2' },
  deposit:     { label: 'Tiền cọc',   icon: '🔐', color: '#059669', bg: '#ECFDF5' },
};

/**
 * Lối tắt tới những màn KHÔNG có trong thanh tab dưới đáy.
 *
 * Bản cũ có 9 ô, trong đó 4 ô (Hóa đơn, Sửa chữa, Hợp đồng, Hồ sơ) trỏ đúng 4 tab đang hiện
 * thường trực ngay bên dưới — cùng route, cùng badge. Chín ô không vừa một hàng nên phải
 * thêm nút "Xem thêm ▼", tức là giấu bớt lối tắt để nhường chỗ cho những lối tắt thừa.
 *
 * Bỏ 4 ô trùng thì còn đúng 4 lối tắt thật, vừa một hàng, không cần đóng/mở gì nữa.
 */
/*
 * Ô "Bàn giao" đã BỎ 01/09/2026 cùng với màn `TenantOnboardingScreen`.
 *
 * Biên bản bàn giao nay nằm ngay trong màn nhập OTP lúc đón khách — khách xem chỉ số
 * điện nước và ảnh hiện trạng RỒI mới tick, một lần ký thay vì hai. Trước đây phải xác
 * nhận lần hai ở màn riêng, sau khi đã dọn vào ở, nên lần đó thành thủ tục cho có.
 *
 * Tra cứu lại về sau (đối chiếu chỉ số gốc trước lúc trả phòng) vẫn còn nguyên đường:
 * màn CHI TIẾT HỢP ĐỒNG ở tab Hợp đồng cũng nạp và hiển thị đúng khối `handover` này.
 */
const QUICK_ACTIONS = [
  { emoji: '📱', label: 'Thiết bị',   route: 'RoomEquipment',  color: '#0EA5E9'      },
  { emoji: '📷', label: 'Quét QR',    route: 'Scan',           color: Colors.accent  },
  { emoji: '💳', label: 'Lịch sử TT', route: 'PaymentHistory', color: Colors.success },
];

// ── Component ──────────────────────────────────────────────
/** Trạng thái hồ sơ trả phòng coi như đã đóng — không cần hiện trên màn chính nữa. */
const CLOSED_CHECKOUT = ['COMPLETED', 'CANCELLED', 'CANCELED', 'REJECTED'];

/**
 * Hồ sơ trả phòng có đang CHỜ KHÁCH LÀM GÌ không.
 *
 * Phân biệt hai thứ rất khác nhau về mức độ khẩn: "đang chạy, chờ bên kia xử lý" (chỉ cần
 * biết) và "đang chờ CHÍNH BẠN" (phải làm ngay, không làm thì hồ sơ đứng). Chỉ cái thứ hai
 * mới đáng tô màu nổi trên màn chính.
 */
const checkoutNeedsTenant = (c: CheckoutRequestDto | null): string | null => {
  if (!c) return null;
  const st = (c.status || '').toUpperCase();
  if (st === 'WAITING_TENANT') return 'Xem và xác nhận bảng quyết toán';
  const s = c.settlement;
  if (!s) return null;
  if (s.chargesSettled === false) return 'Thanh toán khoản phí cuối kỳ';
  // Host đã chuyển cọc mà khách chưa xác nhận — bước dễ bị bỏ quên nhất cả luồng.
  if (s.refundedAt && !s.refundConfirmedAt && !s.refundDisputedAt) {
    return 'Xác nhận bạn đã nhận đủ tiền cọc';
  }
  return null;
};
export const TenantHomeScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const realUnread = useUnreadNotifications();   // badge chuông từ BE
  // 1 account có thể có nhiều HĐ ACTIVE (nhà/phòng khác nhau) — xem
  // docs/FE-multi-contract-per-phone.md (repo BE). selectedContractId dùng chung
  // cho mọi màn (dashboard, bàn giao, thiết bị, tạo bảo trì...).
  const { selectedContractId, setSelectedContractId, restoring } = useTenantContract();
  const [pickerOpen, setPickerOpen] = useState(false);

  // ── Dashboard + hoá đơn thật của tenant ──
  const [dash, setDash] = useState<TenantDashboard | null>(null);
  const [allBills, setAllBills] = useState<SharedBill[]>([]);
  const [loading, setLoading] = useState(true);
  // Phân biệt "BE trả hợp lệ, tenant thật sự chưa có HĐ active" (dash=null, không lỗi)
  // với "gọi API lỗi" (mất mạng/401/500...) — trước đây gộp chung 1 kiểu `null` nên
  // lúc lỗi mạng lại hiện lầm màn "Bạn chưa có phòng đang thuê" dù tài khoản có HĐ.
  const [dashError, setDashError] = useState(false);
  /**
   * Hồ sơ trả phòng ĐANG CHẠY (nếu có).
   *
   * Trước đây màn này không gọi API checkout lần nào: chỉ có một dòng "Trả phòng" luôn dẫn
   * tới màn TẠO YÊU CẦU MỚI. Khách đã có yêu cầu đang chờ thì bấm vào bị BE chặn, mà cũng
   * không có đường nào tới màn xác nhận nhận cọc — tức cả cơ chế đối chứng nằm ngoài tầm với.
   */
  const [checkout, setCheckout] = useState<CheckoutRequestDto | null>(null);

  const loadDashboard = useCallback(() => {
    if (restoring) return () => {}; // chờ đọc xong lựa chọn cũ từ AsyncStorage trước khi gọi API
    let active = true;
    setLoading(true);
    setDashError(false);

    // Hỏi dashboard theo HĐ đang chọn; nếu HĐ đó không còn thuộc về tài khoản này
    // (403/404 — máy từng đăng nhập tài khoản tenant khác) thì bỏ contractId gọi lại
    // để BE tự chọn HĐ mới nhất, thay vì báo "Không tải được dữ liệu".
    const fetchDashboard = async () => {
      try {
        return await realTenantSelfService.getDashboard(selectedContractId ?? undefined);
      } catch (err: any) {
        const status = err?.response?.status;
        if (selectedContractId == null || (status !== 403 && status !== 404)) throw err;
        setSelectedContractId(null);
        return await realTenantSelfService.getDashboard();
      }
    };

    Promise.all([
      fetchDashboard()
        .then(d => ({ ok: true as const, d }))
        .catch(() => ({ ok: false as const, d: null })),
      realTenantBillingService.listInvoices().then(r => r.map(toSharedBill)).catch(() => [] as SharedBill[]),
    ])
      .then(([dashResult, bills]) => {
        if (!active) return;
        setDash(dashResult.d);
        setDashError(!dashResult.ok);
        setAllBills(bills);
        // Lần đầu (chưa từng chọn) → chốt primary BE trả về làm mặc định, để các
        // màn khác (handover/thiết bị/bảo trì) dùng chung ngay từ lần vào đầu tiên.
        if (selectedContractId == null && dashResult.d?.contract?.id != null) {
          setSelectedContractId(dashResult.d.contract.id);
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedContractId, restoring]);

  useFocusEffect(useCallback(() => loadDashboard(), [loadDashboard]));

  // Tải riêng, KHÔNG gộp vào loadDashboard: lỗi ở đây không được làm hỏng cả màn chính.
  useFocusEffect(useCallback(() => {
    let active = true;
    realTenantSelfService.listMyCheckoutRequests()
      .then((list) => {
        if (!active) return;
        const open = list
          .filter((r) => !CLOSED_CHECKOUT.includes((r.status || '').toUpperCase()))
          .sort((a, b) => b.id - a.id)[0];
        setCheckout(open ?? null);
      })
      .catch(() => { if (active) setCheckout(null); });
    return () => { active = false; };
  }, []));

  const needsTenant = checkoutNeedsTenant(checkout);

  const contractOptions = dash?.contracts ?? [];
  const hasMultipleContracts = contractOptions.length > 1;

  // Có hợp đồng/phòng đang hiệu lực hay không (BE trả null khi chưa có)
  const hasRoom = !!dash?.contract;

  // "Bạn đã đồng hành cùng chúng tôi bao nhiêu ngày" — ưu tiên ngày dọn vào ở thật
  // (moveInDate), lùi về ngày hợp đồng có hiệu lực (startDate) nếu BE chưa trả
  // moveInDate ở endpoint dashboard (xem ghi chú BE-YEUCAU 07/09/2026).
  const daysWithUs = getDaysSince(dash?.contract?.moveInDate || dash?.contract?.startDate);

  // Phân biệt 2 dạng thuê: toàn nhà (WHOLE_HOUSE) hay theo phòng (ROOM)
  // Ưu tiên type từ hợp đồng; fallback: không có roomNumber → coi như thuê toàn nhà
  const isWholeHouse =
    (dash?.contract?.type || '').toUpperCase() === 'WHOLE_HOUSE'
    || (!!dash?.contract && !dash?.room?.roomNumber);

  // Map dữ liệu API -> shape UI (fallback mock khi chưa tải xong / chưa có data)
  const b = dash?.building;
  const buildingInfo = {
    name: b?.name ?? '',
    address: b?.address ?? '',
    totalFloors: b?.totalFloors ?? 0,
    electricityRate: b?.electricityRate ?? 0,
    waterRate: b?.waterRate ?? 0,
    serviceCharge: b?.serviceCharge ?? 0,
    // "Chủ nhà" hiển thị cho tenant = người quản lý (manager) trực tiếp; fallback host nếu BE chưa có manager.
    hostName: b?.managerName ?? b?.hostName ?? '—',
    hostPhone: b?.managerPhone ?? b?.hostPhone ?? '',
  };
  const data = {
    room: {
      // Toàn nhà: hiển thị tên tòa nhà; Theo phòng: hiển thị "Phòng {số}"
      name: isWholeHouse
        ? (b?.name ?? 'Nhà của bạn')
        : (dash?.room?.roomNumber ? `Phòng ${dash.room.roomNumber}` : 'Phòng của bạn'),
      property: b?.name ?? '',
      floor: dash?.room?.floor ?? 0,
      area: dash?.room?.area ?? 0,
    },
    contract: {
      code: dash?.contract?.code ?? '',
      daysLeft: dash?.contract?.daysLeft ?? 0,
    },
    depositAmount: dash?.room?.depositAmount ?? 0,
    maintenance: {
      pending: dash?.summary?.maintenancePending ?? 0,
      inProgress: dash?.summary?.maintenanceInProgress ?? 0,
    },
    unreadNotifications: dash?.summary?.unreadNotifications ?? 0,
  };

  /**
   * Khoản thu lúc NHẬN PHÒNG — từ BE `609de59`/`276b613` (12/08/2026) là khoản GỘP:
   * tiền cọc + tiền nhà chu kỳ đầu (chia theo số ngày ở từ ngày nhận phòng đến hết
   * tháng), khách quét QR trả MỘT lần. Không còn hoá đơn tiền nhà kỳ đầu trả sau.
   * (Giai đoạn 10–12/08/2026 BE có tách riêng hai khoản, nay đã gộp lại.)
   *
   * Mentor 07/08/2026: "tenant chưa xem được đã chuyển và đặt cọc hay chưa" và "tổng
   * 10tr mà hoá đơn hiện 5tr, chưa có tiền tháng". Nguyên nhân là BE không sinh hoá
   * đơn cho khoản này nên trong app không có gì để nhìn; BE đã sửa 08/08/2026 — sinh
   * hoá đơn `HD-ONBOARD-{contractId}` trạng thái PAID.
   *
   * Nhận diện theo mã trước (chắc chắn nhất), rồi tới `billingPeriod` để còn chạy được
   * với hoá đơn seed/cũ mà BE đặt mã khác. Chuỗi dò phải khớp CẢ HAI đời nhãn: cũ là
   * "Thu lúc nhận phòng", mới là "Tiền cọc lúc nhận phòng" — nên chỉ dò phần đuôi.
   */
  const onboardingBillAnyDay = allBills.find(
    b => b.code?.startsWith('HD-ONBOARD-')
      || /lúc nhận phòng/i.test(b.billingPeriod ?? ''),
  );

  /**
   * Thẻ "Đã thanh toán khi nhận phòng" chỉ hiện ĐÚNG NGÀY thu tiền, hết ngày là tự mất.
   *
   * Nó là một BIÊN NHẬN: hôm nhận phòng khách vừa chuyển một khoản lớn nên cần thấy ngay
   * để đối chiếu với app ngân hàng. Sau hôm đó nó thành thông tin cũ mà vẫn chiếm chỗ
   * đầu màn hình chính, đẩy những việc đang cần làm (hoá đơn phải trả, bảo trì) xuống
   * dưới. Khách vẫn tra lại được ở tab Hoá đơn và màn Lịch sử thanh toán bất cứ lúc nào.
   *
   * Mốc so là `paidAt`, lùi về `createdAt` cho hoá đơn cũ BE chưa ghi `paidAt`. Không có
   * mốc nào thì ẩn — không chứng minh được là hôm nay thì đừng hiện.
   */
  const onboardingBill = isToday(onboardingBillAnyDay?.paidAt ?? onboardingBillAnyDay?.createdAt)
    ? onboardingBillAnyDay
    : undefined;

  /**
   * Hai khoản thật sự thu lúc nhận phòng: tiền cọc + tiền nhà chu kỳ đầu.
   * Cách dựng và lý do không lấy thẳng `items`/`breakdown.lines`: xem @/utils/onboardBill.
   */
  const onboardLines = onboardChargeLines(onboardingBill);

  const unpaidBills = allBills.filter(b => b.status === 'pending' || b.status === 'overdue');
  const overdueInvoices = allBills.filter(b => b.status === 'overdue');
  const overdueTotal = overdueInvoices.reduce((s, b) => s + b.grandTotal, 0);
  const hasOverdue = overdueInvoices.length > 0;

  // Show at most the 3 most urgent unpaid bills (one per type, prioritise overdue)
  const displayBills = (['rent', 'electricity', 'water'] as InvoiceType[])
    .map(type => unpaidBills.find(b => b.invoiceType === type && b.status === 'overdue')
      ?? unpaidBills.find(b => b.invoiceType === type))
    .filter(Boolean) as SharedBill[];

  // Tránh lặp: khi tên phòng đã chứa tên toà nhà ("Phòng MTX#01" ⊃ "MTX#01") thì
  // không hiện lại dòng tên toà nhà nữa.
  const showBuildingName = !isWholeHouse && !!buildingInfo.name
    && !data.room.name.toLowerCase().includes(buildingInfo.name.toLowerCase());

  const hasMaintenance      = data.maintenance.pending > 0 || data.maintenance.inProgress > 0;
  // Chỉ tính "sắp hết hạn" khi CÓ dữ liệu HĐ thật — tránh hiện nhầm "còn 0 ngày"
  // khi dash chưa tải được (daysLeft mặc định 0 lúc đó không phải giá trị thật).
  const contractExpiringSoon = hasRoom && data.contract.daysLeft <= 60;

  const alerts = [
    hasOverdue       && { id: 'overdue',  icon: '🚨', text: `${overdueInvoices.length} hóa đơn quá hạn — ${formatCurrency(overdueTotal)}`, route: 'InvoiceList', color: Colors.error   },
    hasMaintenance    && { id: 'maint',    icon: '🔧', text: `${data.maintenance.pending} chờ xử lý · ${data.maintenance.inProgress} đang sửa`, route: 'MaintenanceList', color: Colors.warning },
    contractExpiringSoon && { id: 'contract', icon: '📋', text: `Hợp đồng còn ${data.contract.daysLeft} ngày`,                               route: 'TenantContracts', color: Colors.info    },
  ].filter(Boolean) as { id: string; icon: string; text: string; route: string; color: string }[];

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  /** "Th 4, 13/8" — giống hệt chuỗi ngày ở Trang chủ quản lý. */
  const todayStr = serverNow().toLocaleDateString('vi-VN', {
    weekday: 'short', day: 'numeric', month: 'numeric',
  });
  // Chỉ lấy tên gọi (từ cuối) như bên manager — tên đầy đủ đứng cùng hàng với ngày và
  // chuông thì dài quá, bị cắt mất chữ.
  const firstName = user?.fullName?.trim().split(/\s+/).pop() || 'bạn';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header — bố cục y hệt Trang chủ của quản lý (ManagerHomeScreen):
            lời chào một dòng bên trái, ngày đứng sát cái chuông bên phải.
            Trước đây tenant xếp chồng 3 dòng (ngày / "Xin chào" / tên) với ngày cỡ 11px
            nằm trên cùng — vừa chìm vừa cao gấp đôi header của manager.
            Ngày lấy theo GIỜ SERVER, không phải đồng hồ máy. */}
        <View style={styles.header}>
          <Text style={styles.headerName} numberOfLines={1}>Xin chào, {firstName} 👋</Text>

          <View style={styles.headerRight}>
            <Text style={styles.headerDate}>{todayStr}</Text>
            <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate('TenantNotifications')}>
              <Text style={styles.notifIcon}>🔔</Text>
              {(realUnread ?? data.unreadNotifications) > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>
                    {(realUnread ?? data.unreadNotifications) > 9 ? '9+' : (realUnread ?? data.unreadNotifications)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Picker "Nhà đang thuê" — chỉ hiện khi account có ≥2 HĐ ACTIVE */}
        {hasMultipleContracts && (
          <TouchableOpacity style={styles.contractPickerBtn} onPress={() => setPickerOpen(true)} activeOpacity={0.8}>
            <Text style={styles.contractPickerLabel}>🏠 Nhà đang xem</Text>
            <Text style={styles.contractPickerValue} numberOfLines={1}>
              {dash?.contract?.propertyName ?? data.room.name}
              {dash?.contract?.roomNumber ? ` · ${dash.contract.roomNumber}` : ''}
            </Text>
            <Text style={styles.contractPickerChevron}>▾</Text>
          </TouchableOpacity>
        )}

        {!hasRoom ? (
          dashError ? (
            <View style={styles.emptyRoomCard}>
              <Text style={styles.emptyRoomIcon}>⚠️</Text>
              <Text style={styles.emptyRoomTitle}>Không tải được dữ liệu</Text>
              <Text style={styles.emptyRoomText}>
                Có lỗi khi tải thông tin phòng/hợp đồng. Vui lòng kiểm tra mạng và thử lại.
              </Text>
              <TouchableOpacity style={styles.retryBtn} onPress={loadDashboard}>
                <Text style={styles.retryBtnText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyRoomCard}>
              <Text style={styles.emptyRoomIcon}>🏠</Text>
              <Text style={styles.emptyRoomTitle}>Bạn chưa có phòng đang thuê</Text>
              <Text style={styles.emptyRoomText}>
                Khi hợp đồng của bạn có hiệu lực, thông tin phòng và tòa nhà sẽ hiển thị tại đây.
              </Text>
            </View>
          )
        ) : (
        <>
        {/* ── "Bạn đã đồng hành cùng chúng tôi X ngày" — đặt ngay trên cùng, trước cả
            hero card, vì đây là điều đầu tiên khách nên thấy mỗi lần mở app. */}
        <View style={styles.anniversaryCard}>
          <View style={styles.anniversaryIconWrap}>
            <Text style={styles.anniversaryEmoji}>🎉</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.anniversaryValue}>{daysWithUs} ngày</Text>
            <Text style={styles.anniversaryLabel}>Bạn đã đồng hành cùng chúng tôi</Text>
          </View>
        </View>

        {/* ── Hero: gộp phòng + toà nhà làm MỘT card ──
            Trước đây tách 2 card nên tên phòng và địa chỉ bị lặp y hệt nhau. */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <Text style={styles.heroLabel}>{isWholeHouse ? 'NHÀ CỦA BẠN' : 'PHÒNG CỦA BẠN'}</Text>
            <View style={[styles.heroDaysPill, contractExpiringSoon && styles.heroDaysPillWarn]}>
              <Text style={styles.heroDaysText}>
                {contractExpiringSoon ? '⚠️ ' : ''}Còn {data.contract.daysLeft} ngày
              </Text>
            </View>
          </View>

          <Text style={styles.heroName} numberOfLines={2}>{data.room.name}</Text>
          {showBuildingName && (
            <Text style={styles.heroBuilding} numberOfLines={1}>{buildingInfo.name}</Text>
          )}
          <Text style={styles.heroAddress} numberOfLines={2}>📍 {buildingInfo.address}</Text>

          {/* Số liệu phòng — nằm luôn trong hero, không tách card riêng nữa */}
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue} numberOfLines={1}>{data.room.area} m²</Text>
              <Text style={styles.heroStatLabel}>Diện tích</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue} numberOfLines={1}>
                {isWholeHouse ? `${buildingInfo.totalFloors} tầng` : `Tầng ${data.room.floor}`}
              </Text>
              <Text style={styles.heroStatLabel}>{isWholeHouse ? 'Quy mô' : 'Vị trí'}</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue} numberOfLines={1}>
                {formatCurrency(data.depositAmount).replace(' đ', 'đ')}
              </Text>
              <Text style={styles.heroStatLabel}>Tiền cọc</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.heroContract}
            onPress={() => navigation.navigate('TenantContracts')}
            activeOpacity={0.7}
          >
            <Text style={styles.heroContractText} numberOfLines={1}>Hợp đồng {data.contract.code}</Text>
            <Text style={styles.heroContractArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Khoản thu lúc nhận phòng — tách rõ tiền cọc / tiền nhà chu kỳ đầu để khách
            đối chiếu được với số tiền app ngân hàng đã trừ (mentor 07/08/2026, ý 10+11).
            Nguồn các dòng: xem `onboardLines` ở trên, KHÔNG lấy thẳng `items`. */}
        {!!onboardingBill && (
          <TouchableOpacity
            style={styles.onboardPaidCard}
            activeOpacity={0.8}
            // Route nhận cả object hoá đơn (xem InvoiceListScreen), KHÔNG phải id.
            onPress={() => navigation.navigate('InvoiceDetail', { invoice: onboardingBill })}
          >
            <View style={styles.onboardPaidHead}>
              <Text style={styles.onboardPaidTitle}>✅ Đã thanh toán khi nhận phòng</Text>
              <Text style={styles.onboardPaidTotal}>
                {formatCurrency(onboardingBill.grandTotal)}
              </Text>
            </View>
            {onboardLines ? (
              onboardLines.map((it, i) => (
                <View key={`${it.label}-${i}`} style={styles.onboardPaidRow}>
                  <Text style={styles.onboardPaidLabel}>• {it.label}</Text>
                  <Text style={styles.onboardPaidValue}>{formatCurrency(it.amount)}</Text>
                </View>
              ))
            ) : (
              // Không có nguồn nào đáng tin -> vẫn phải nói được đây là khoản gì, đừng
              // để khách nhìn một con số trống không.
              <Text style={styles.onboardPaidLabel}>
                Gồm tiền cọc và tiền nhà chu kỳ đầu. Xem chi tiết trong hoá đơn.
              </Text>
            )}
            {!!onboardingBill.paidAt && (
              <Text style={styles.onboardPaidAt}>
                🕒 Ghi nhận {new Date(onboardingBill.paidAt).toLocaleString('vi-VN')}
              </Text>
            )}
          </TouchableOpacity>
        )}

        {/* ── Liên hệ quản lý + lưu ý điện/nước ── */}
        <View style={styles.contactCard}>
          <View style={styles.contactRow}>
            <View style={styles.contactAvatar}>
              <Text style={styles.contactAvatarText}>
                {(buildingInfo.hostName || '?').trim().charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.contactName} numberOfLines={1}>{buildingInfo.hostName}</Text>
              <Text style={styles.contactRole}>
                Quản lý{buildingInfo.hostPhone ? ` · ${buildingInfo.hostPhone}` : ''}
              </Text>
            </View>
            {!!buildingInfo.hostPhone && (
              <TouchableOpacity
                style={styles.contactCallBtn}
                onPress={() => Linking.openURL(`tel:${buildingInfo.hostPhone}`)}
                activeOpacity={0.8}
              >
                <Text style={styles.contactCallText}>Gọi</Text>
              </TouchableOpacity>
            )}
          </View>
          {/* Điện/nước tính theo hóa đơn nhà nước (EVN) mỗi kỳ — không có đơn giá cố định. */}
          <Text style={styles.contactNote}>
            Điện, nước thu theo hóa đơn nhà nước thực tế hằng tháng.
          </Text>
        </View>
        </>
        )}

        {/* Alert pills */}
        {alerts.length > 0 && (
          <View style={styles.alertsCol}>
            {alerts.map(a => (
              <TouchableOpacity
                key={a.id}
                style={[styles.alertPill, { borderColor: a.color + '40', backgroundColor: a.color + '0D' }]}
                onPress={() => navigation.navigate(a.route)}
              >
                <Text style={styles.alertPillIcon}>{a.icon}</Text>
                <Text style={[styles.alertPillText, { color: a.color }]}>{a.text}</Text>
                <Text style={[styles.alertPillArrow, { color: a.color }]}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Invoice Cards ── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Hóa đơn</Text>
          <TouchableOpacity onPress={() => navigation.navigate('InvoiceList')}>
            <Text style={styles.sectionLink}>Tất cả →</Text>
          </TouchableOpacity>
        </View>

        {displayBills.length === 0 ? (
          <View style={styles.allPaidCard}>
            <Text style={styles.allPaidEmoji}>✅</Text>
            <Text style={styles.allPaidText}>Tất cả hóa đơn đã được thanh toán</Text>
          </View>
        ) : (
          displayBills.map(bill => {
            const tc = TYPE_CFG[bill.invoiceType];
            const isPaid = bill.status === 'paid';
            const isOver = bill.status === 'overdue';
            const isPending = !isOver && !isPaid;
            const dueDate = bill.dueDate;
            return (
              <TouchableOpacity
                key={bill.id}
                style={[styles.invCard, isOver && styles.invCardOverdue]}
                activeOpacity={0.75}
                onPress={() => navigation.navigate('InvoiceList')}
              >
                {isOver && <View style={styles.invOverdueStripe} />}
                <View style={styles.invCardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[styles.invTypeBadge, { backgroundColor: tc.bg }]}>
                      <Text style={[styles.invTypeBadgeText, { color: tc.color }]}>
                        {tc.icon} {tc.label}
                      </Text>
                    </View>
                    {/* Hoá đơn onboard không thuộc kỳ nào → billMonthLabel trả null. */}
                    {!!billMonthLabel(bill) && (
                      <Text style={styles.invMonth}>{billMonthLabel(bill)}</Text>
                    )}
                  </View>
                  <View style={[styles.invStatusBadge, {
                    backgroundColor: isOver ? Colors.errorLight : Colors.warningLight,
                  }]}>
                    <Text style={[styles.invStatusText, { color: isOver ? Colors.error : Colors.warning }]}>
                      {isOver ? 'Quá hạn' : 'Chờ thanh toán'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.invRoom}>{bill.roomName} · {bill.propertyName}</Text>

                {bill.invoiceType === 'electricity' && bill.kwhUsed !== undefined && (
                  <Text style={styles.invDetail}>⚡ {bill.kwhUsed} kWh · {bill.billingPeriod}</Text>
                )}
                {bill.invoiceType === 'water' && bill.m3Used !== undefined && (
                  <Text style={styles.invDetail}>💧 {bill.m3Used} m³ · {bill.billingPeriod}</Text>
                )}

                <View style={styles.invAmountRow}>
                  <Text style={[styles.invAmount, isOver && { color: Colors.error }]}>
                    {formatCurrency(bill.grandTotal)}
                  </Text>
                  <Text style={[styles.invDue, isOver && { color: Colors.error }]}>
                    {isOver ? `Quá hạn ${Math.abs(getDaysUntil(dueDate))} ngày` : `Hạn: ${formatDate(dueDate)}`}
                  </Text>
                </View>

                {(isOver || isPending) && (
                  <TouchableOpacity
                    style={[styles.invPayBtn, { backgroundColor: isOver ? Colors.error : Colors.primary }]}
                    onPress={() => navigation.navigate('InvoiceList')}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.invPayBtnText}>
                      {isOver ? '🚨 Thanh toán ngay' : '💳 Xem & Thanh toán'}
                    </Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })
        )}

        {/* Quick Actions */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Thao tác nhanh</Text>
        </View>
        <View style={styles.actionsGrid}>
          {QUICK_ACTIONS.map((a) => (
            <TouchableOpacity
              key={a.route}
              style={styles.actionBtn}
              onPress={() => navigation.navigate(a.route)}
              activeOpacity={0.75}
            >
              <View style={[styles.actionIconWrap, { backgroundColor: a.color + '1A' }]}>
                <Text style={styles.actionEmoji}>{a.emoji}</Text>
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/*
          Trả phòng tách hẳn ra khỏi lưới.
          Bản cũ để nó làm ô thứ 8, cùng kích cỡ và cùng khoảng cách với "Quét QR" — một
          cú chạm lệch là mở luồng chấm dứt hợp đồng. Việc này khác hẳn về hệ quả nên phải
          khác hẳn về hình: hàng riêng, viền nhạt, có câu mô tả nó sẽ làm gì.
        */}
        {/*
          Đang có hồ sơ trả phòng → thẻ TIẾN TRÌNH, không phải nút tạo mới.
          Bản cũ luôn dẫn tới màn tạo yêu cầu, mà BE chặn nếu đã có hồ sơ đang chờ — nên
          khách vừa bị báo lỗi vừa không có đường nào tới màn xác nhận nhận cọc.
        */}
        {checkout ? (
          <TouchableOpacity
            style={[styles.checkoutRow, needsTenant && styles.checkoutRowAlert]}
            onPress={() => navigation.navigate('CheckoutDetail', { requestId: checkout.id })}
            activeOpacity={0.75}
          >
            <View style={[styles.checkoutIconWrap, needsTenant && styles.checkoutIconWrapAlert]}>
              <Text style={styles.checkoutEmoji}>{needsTenant ? '🔔' : '🚪'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.checkoutLabel}>Tiến trình trả phòng</Text>
              {/*
                Việc CỦA KHÁCH thì hiện nguyên câu việc phải làm; còn lại chỉ hiện trạng thái.
                Đây là chỗ duy nhất trên màn chính khách biết mình đang bị chờ.
              */}
              {needsTenant ? (
                <Text style={styles.checkoutAlertText} numberOfLines={2}>
                  Cần bạn: {needsTenant}
                </Text>
              ) : (
                <Text style={styles.checkoutHint} numberOfLines={1}>
                  {checkoutMeta(checkout.status).label}
                </Text>
              )}
            </View>
            <Text style={[styles.checkoutChevron, needsTenant && styles.checkoutChevronAlert]}>›</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.checkoutRow}
            onPress={() => navigation.navigate('RequestCheckout')}
            activeOpacity={0.75}
          >
            <View style={styles.checkoutIconWrap}>
              <Text style={styles.checkoutEmoji}>🚪</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.checkoutLabel}>Trả phòng</Text>
              <Text style={styles.checkoutHint} numberOfLines={1}>
                Gửi yêu cầu để hẹn ngày kiểm phòng và hoàn cọc
              </Text>
            </View>
            <Text style={styles.checkoutChevron}>›</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Picker chọn nhà đang thuê */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <TouchableOpacity style={styles.pickerBackdrop} activeOpacity={1} onPress={() => setPickerOpen(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Chọn nhà đang thuê</Text>
            {contractOptions.map((c) => {
              const active = c.id === selectedContractId;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.pickerRow, active && styles.pickerRowActive]}
                  onPress={() => { setSelectedContractId(c.id); setPickerOpen(false); }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerRowTitle}>
                      {c.propertyName ?? c.code}{c.roomNumber ? ` · ${c.roomNumber}` : ''}
                    </Text>
                    <Text style={styles.pickerRowSub}>HĐ {c.code} · còn {c.daysLeft} ngày</Text>
                  </View>
                  {active && <Text style={styles.pickerCheck}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

// ── Styles ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },

  // Picker "Nhà đang thuê" (multi-contract)
  contractPickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  contractPickerLabel: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  contractPickerValue: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  contractPickerChevron: { fontSize: 14, color: Colors.textMuted },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg, paddingBottom: Spacing['2xl'],
  },
  pickerTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  pickerRowActive: { backgroundColor: Colors.primaryBg, marginHorizontal: -Spacing.lg, paddingHorizontal: Spacing.lg, borderRadius: BorderRadius.md },
  pickerRowTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  pickerRowSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  pickerCheck: { fontSize: 16, fontWeight: '800', color: Colors.primary },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Empty state (chưa có phòng/hợp đồng)
  emptyRoomCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl, padding: Spacing.xl,
    alignItems: 'center', marginTop: Spacing.md, marginBottom: Spacing.md, ...Shadow.sm,
  },
  emptyRoomIcon: { fontSize: 40, marginBottom: Spacing.sm },
  emptyRoomTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.xs },
  emptyRoomText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  retryBtn: { marginTop: Spacing.md, backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  retryBtnText: { color: Colors.white, fontSize: 13, fontWeight: '700' },

  // ── Header ── Copy nguyên bộ số đo từ ManagerHomeScreen để 2 vai nhìn giống hệt nhau.
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: Spacing.base, paddingBottom: Spacing.md,
  },
  // Cụm bên phải: ngày + chuông, cách nhau vừa đủ để đọc ra một cụm chứ không dính nhau.
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerDate: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, letterSpacing: 0.1 },
  // flexShrink để tên dài thì lời chào tự cắt, không đẩy ngày & chuông ra khỏi màn.
  headerName: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.3, flexShrink: 1 },
  notifBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  notifIcon: { fontSize: 16 },
  notifBadge: {
    position: 'absolute', top: 4, right: 4, minWidth: 14, height: 14,
    borderRadius: 7, backgroundColor: Colors.error,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  notifBadgeText: { fontSize: 8, fontWeight: '800', color: Colors.white },

  // ── "Bạn đã đồng hành cùng chúng tôi X ngày" ──
  anniversaryCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.accentLight + '33', borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.accentLight,
    paddingVertical: Spacing.sm + 2, paddingHorizontal: Spacing.base,
    marginTop: Spacing.md, marginBottom: Spacing.md,
  },
  anniversaryIconWrap: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  anniversaryEmoji: { fontSize: 18 },
  anniversaryValue: { fontSize: 16, fontWeight: '800', color: Colors.accentDark },
  anniversaryLabel: { fontSize: 12, fontWeight: '600', color: Colors.accentDark, marginTop: 1 },

  // ── Hero card: phòng + toà nhà + số liệu gộp làm một ──
  // Thang chữ cố định: nhãn 10.5 · phụ 12 · thân 13 · tiêu đề 22.
  heroCard: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.xl,
    padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.md,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  heroLabel: { fontSize: 10.5, fontWeight: '800', color: 'rgba(255,255,255,0.65)', letterSpacing: 1.2 },
  heroDaysPill: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  heroDaysPillWarn: { backgroundColor: 'rgba(252,211,77,0.25)' },
  heroDaysText: { fontSize: 11, fontWeight: '700', color: Colors.white },
  heroName: { fontSize: 22, fontWeight: '800', color: Colors.white, lineHeight: 28, marginTop: 6 },
  heroBuilding: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  heroAddress: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.7)', lineHeight: 17, marginTop: 4 },

  heroStats: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm, marginTop: Spacing.base,
  },
  heroStat: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  heroStatValue: { fontSize: 14, fontWeight: '800', color: Colors.white },
  heroStatLabel: { fontSize: 10.5, fontWeight: '600', color: 'rgba(255,255,255,0.65)', marginTop: 3 },
  heroStatDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.2)' },

  heroContract: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing.sm },
  heroContractText: { flex: 1, fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  heroContractArrow: { fontSize: 18, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },

  // ── Khoản thu lúc nhận phòng (tiền nhà tháng đầu + cọc) ──
  onboardPaidCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: Spacing.base,
    marginTop: Spacing.base,
    gap: 6,
  },
  onboardPaidHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  onboardPaidTitle: { flex: 1, fontSize: 13, fontWeight: '800', color: '#047857' },
  onboardPaidTotal: { fontSize: 15, fontWeight: '800', color: '#047857' },
  onboardPaidRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  onboardPaidLabel: { flex: 1, fontSize: 12, color: Colors.textSecondary },
  onboardPaidValue: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  onboardPaidAt: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

  // ── Card liên hệ quản lý + lưu ý điện/nước ──
  contactCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    padding: Spacing.base, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  contactAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  contactAvatarText: { fontSize: 16, fontWeight: '800', color: Colors.primary },
  contactName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  contactRole: { fontSize: 12, fontWeight: '500', color: Colors.textMuted, marginTop: 1 },
  contactCallBtn: { backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.base, paddingVertical: 7 },
  contactCallText: { fontSize: 12, fontWeight: '800', color: Colors.primary },
  contactNote: {
    fontSize: 12, fontWeight: '500', color: Colors.textSecondary, lineHeight: 17,
    marginTop: Spacing.sm, paddingTop: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },

  // Alerts
  alertsCol: { gap: Spacing.xs, marginBottom: Spacing.md },
  alertPill: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.sm, paddingVertical: 9, borderRadius: BorderRadius.lg, borderWidth: 1 },
  alertPillIcon: { fontSize: 14 },
  alertPillText: { flex: 1, fontSize: 12, fontWeight: '600' },
  alertPillArrow: { fontSize: 20, fontWeight: '400' },

  // ── Separate Invoice Cards ──
  sectionLink: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  allPaidCard: {
    backgroundColor: Colors.successLight, borderRadius: BorderRadius.xl,
    padding: Spacing.base, marginBottom: Spacing.md,
    alignItems: 'center', flexDirection: 'row', gap: Spacing.sm,
  },
  allPaidEmoji: { fontSize: 22 },
  allPaidText: { fontSize: 14, fontWeight: '600', color: Colors.success },
  invCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    padding: Spacing.base, marginBottom: Spacing.sm,
    borderWidth: 1.5, borderColor: Colors.border, ...Shadow.sm, overflow: 'hidden',
  },
  invCardOverdue: { borderColor: Colors.error + '60' },
  invOverdueStripe: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, backgroundColor: Colors.error },
  invCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  invTypeBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  invTypeBadgeText: { fontSize: 11, fontWeight: '700' },
  invMonth: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  invStatusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  invStatusText: { fontSize: 11, fontWeight: '700' },
  invRoom: { fontSize: 12, color: Colors.textMuted, marginBottom: 3 },
  invDetail: { fontSize: 11, color: Colors.textSecondary, marginBottom: 4 },
  invAmountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  invAmount: { fontSize: 20, fontWeight: '800', color: Colors.primary },
  invDue: { fontSize: 11, color: Colors.textSecondary },
  invPayBtn: {
    marginTop: Spacing.sm, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm + 2, alignItems: 'center',
  },
  invPayBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white },

  // Section title
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // ── Quick Actions ──
  // 4 ô chia đều một hàng — `flex: 1` thay cho width % cố định để không phụ thuộc bề ngang máy.
  actionsGrid: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  actionBtn: {
    flex: 1, alignItems: 'center',
    backgroundColor: Colors.white,
    paddingVertical: 12, paddingHorizontal: 4,
    borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border + '80',
    ...Shadow.sm,
  },
  actionIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  actionEmoji: { fontSize: 20 },
  // Bản cũ để 9.5px vì 9 ô phải nhét vừa; còn 4 ô thì chữ đủ chỗ để đọc bình thường.
  actionLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textAlign: 'center' },

  // ── Trả phòng: hàng riêng, sắc thái trầm hơn lưới trên ──
  checkoutRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.white,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  checkoutIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.errorLight,
  },
  checkoutEmoji: { fontSize: 17 },
  checkoutLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  checkoutHint: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  checkoutChevron: { fontSize: 22, color: Colors.textMuted, marginTop: -2 },

  // ── Biến thể khi hồ sơ trả phòng ĐANG CHỜ KHÁCH ──
  // Dùng nền hổ phách chứ không phải đỏ: đây là việc cần làm, không phải cảnh báo hỏng hóc.
  // Đỏ ở màn chính sẽ chọi với badge lỗi thật (hoá đơn quá hạn, yêu cầu sửa chữa).
  checkoutRowAlert: { backgroundColor: '#FFFBEB', borderColor: '#FCD34D' },
  checkoutIconWrapAlert: { backgroundColor: '#FEF3C7' },
  checkoutAlertText: { marginTop: 2, fontSize: 12, lineHeight: 17, fontWeight: '700', color: '#B45309' },
  checkoutChevronAlert: { color: '#B45309' },
});
