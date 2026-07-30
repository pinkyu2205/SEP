import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { useAuth, useTenantContract } from '@/hooks';
import { formatCurrency, formatDate, getDaysUntil } from '@/utils';
import { SharedBill, InvoiceType } from '@/store/billsStore';
import { realTenantSelfService, TenantDashboard } from '@/services/tenant/selfService';
import { realTenantBillingService, toSharedBill } from '@/services/tenant/billingService';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';

const TYPE_CFG: Record<InvoiceType, { label: string; icon: string; color: string; bg: string }> = {
  rent:        { label: 'Tiền phòng', icon: '🏠', color: '#7C3AED', bg: '#F5F3FF' },
  electricity: { label: 'Điện',       icon: '⚡', color: '#D97706', bg: '#FEF9C3' },
  water:       { label: 'Nước',       icon: '💧', color: '#2563EB', bg: '#DBEAFE' },
  maintenance: { label: 'Phí bảo trì', icon: '🔧', color: '#DC2626', bg: '#FEE2E2' },
};

const QUICK_ACTIONS = [
  { emoji: '📄', label: 'Hóa đơn',    route: 'InvoiceList',      badge: 1, color: Colors.primary,       primary: true  },
  { emoji: '🔧', label: 'Sửa chữa',   route: 'MaintenanceList',  badge: 1, color: Colors.warning,       primary: true  },
  { emoji: '📱', label: 'Thiết bị',   route: 'RoomEquipment',    badge: 0, color: '#0EA5E9',            primary: true  },
  { emoji: '📋', label: 'Hợp đồng',   route: 'TenantContracts',  badge: 0, color: Colors.info,          primary: false },
  { emoji: '💳', label: 'Lịch sử TT', route: 'PaymentHistory',   badge: 0, color: Colors.success,       primary: false },
  { emoji: '📷', label: 'Quét QR',    route: 'Scan',             badge: 0, color: Colors.accent,        primary: false },
  { emoji: '🏠', label: 'Bàn giao',   route: 'TenantOnboarding', badge: 0, color: Colors.textSecondary, primary: false },
  { emoji: '🚪', label: 'Trả phòng',  route: 'RequestCheckout',  badge: 0, color: '#DC2626',            primary: false },
  { emoji: '👤', label: 'Hồ sơ',      route: 'Profile',          badge: 0, color: Colors.primaryDark,   primary: false },
];

// ── Component ──────────────────────────────────────────────
export const TenantHomeScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [actionsExpanded, setActionsExpanded] = useState(false);
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

  const loadDashboard = useCallback(() => {
    if (restoring) return () => {}; // chờ đọc xong lựa chọn cũ từ AsyncStorage trước khi gọi API
    let active = true;
    setLoading(true);
    setDashError(false);
    Promise.all([
      realTenantSelfService.getDashboard(selectedContractId ?? undefined)
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

  const contractOptions = dash?.contracts ?? [];
  const hasMultipleContracts = contractOptions.length > 1;

  // Có hợp đồng/phòng đang hiệu lực hay không (BE trả null khi chưa có)
  const hasRoom = !!dash?.contract;

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

  const unpaidBills = allBills.filter(b => b.status === 'pending' || b.status === 'overdue');
  const overdueInvoices = allBills.filter(b => b.status === 'overdue');
  const overdueTotal = overdueInvoices.reduce((s, b) => s + b.grandTotal, 0);
  const hasOverdue = overdueInvoices.length > 0;

  // Show at most the 3 most urgent unpaid bills (one per type, prioritise overdue)
  const displayBills = (['rent', 'electricity', 'water'] as InvoiceType[])
    .map(type => unpaidBills.find(b => b.invoiceType === type && b.status === 'overdue')
      ?? unpaidBills.find(b => b.invoiceType === type))
    .filter(Boolean) as SharedBill[];

  const hasMaintenance      = data.maintenance.pending > 0 || data.maintenance.inProgress > 0;
  // Chỉ tính "sắp hết hạn" khi CÓ dữ liệu HĐ thật — tránh hiện nhầm "còn 0 ngày"
  // khi dash chưa tải được (daysLeft mặc định 0 lúc đó không phải giá trị thật).
  const contractExpiringSoon = hasRoom && data.contract.daysLeft <= 60;

  const alerts = [
    hasOverdue        && { id: 'overdue',  icon: '🚨', text: `${overdueInvoices.length} hóa đơn quá hạn — ${formatCurrency(overdueTotal)}`, route: 'InvoiceList', color: Colors.error   },
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

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Xin chào 👋</Text>
            <Text style={styles.userName}>{user?.fullName ?? 'Khách thuê'}</Text>
          </View>
          <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate('TenantNotifications')}>
            <Text style={{ fontSize: 22 }}>🔔</Text>
            {(realUnread ?? data.unreadNotifications) > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{realUnread ?? data.unreadNotifications}</Text>
              </View>
            )}
          </TouchableOpacity>
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
        {/* Room Banner — chỉ giữ vài số liệu quan trọng nhất để dễ nhìn lướt qua;
            chi tiết (diện tích/tầng/cọc) chuyển xuống card "Thông tin tòa nhà" bên dưới. */}
        <View style={styles.roomCard}>
          <Text style={styles.roomLabel}>{isWholeHouse ? 'NHÀ CỦA BẠN' : 'PHÒNG CỦA BẠN'}</Text>
          <Text style={styles.roomName}>{data.room.name}</Text>
          <View style={styles.addressRow}>
            <Text style={styles.addressIcon}>📍</Text>
            <Text style={styles.addressText} numberOfLines={2}>{buildingInfo.address}</Text>
          </View>
          <View style={styles.contractBar}>
            <Text style={styles.contractBarText}>📋 HĐ {data.contract.code}</Text>
            <Text style={[styles.contractBarDays, contractExpiringSoon && { color: '#FCD34D' }]}>
              {contractExpiringSoon ? '⚠️ ' : ''}{data.contract.daysLeft} ngày
            </Text>
          </View>
        </View>

        {/* Building info card — thông tin do host/admin cài đặt + chi tiết phòng/nhà */}
        <View style={styles.buildingCard}>
          <View style={styles.buildingCardHeader}>
            <Text style={styles.buildingCardTitle} numberOfLines={1}>
              🏢 {buildingInfo.name || 'Thông tin tòa nhà'}
            </Text>
            <Text style={styles.buildingCardSub}>Cài đặt bởi Host</Text>
          </View>
          <View style={styles.buildingAddressRow}>
            <Text style={styles.buildingAddressIcon}>📍</Text>
            <Text style={styles.buildingAddress}>{buildingInfo.address}</Text>
          </View>
          <View style={styles.buildingRatesRow}>
            <View style={styles.buildingRate}>
              <Text style={styles.buildingRateValue}>{data.room.area}m²</Text>
              <Text style={styles.buildingRateLabel}>Diện tích</Text>
            </View>
            <View style={styles.buildingRateDivider} />
            <View style={styles.buildingRate}>
              <Text style={styles.buildingRateValue}>
                {isWholeHouse ? `${buildingInfo.totalFloors} tầng` : `Tầng ${data.room.floor}`}
              </Text>
              <Text style={styles.buildingRateLabel}>{isWholeHouse ? 'Quy mô' : 'Vị trí'}</Text>
            </View>
            <View style={styles.buildingRateDivider} />
            <View style={styles.buildingRate}>
              <Text style={styles.buildingRateValue}>{formatCurrency(data.depositAmount).replace(' đ', 'đ')}</Text>
              <Text style={styles.buildingRateLabel}>Tiền cọc</Text>
            </View>
          </View>
          {/* Điện/nước tính theo hóa đơn nhà nước (EVN) mỗi kỳ — không hiển thị đơn giá cố định. */}
          <View style={styles.buildingNoteRow}>
            <Text style={styles.buildingNoteIcon}>ℹ️</Text>
            <Text style={styles.buildingNoteText}>
              Tiền điện/nước tính theo hóa đơn nhà nước thực tế hằng tháng.
            </Text>
          </View>
          <View style={styles.buildingHostRow}>
            <Text style={styles.buildingHostLabel}>Chủ nhà: </Text>
            <Text style={styles.buildingHostName}>{buildingInfo.hostName}</Text>
            <Text style={styles.buildingHostPhone}>  {buildingInfo.hostPhone}</Text>
          </View>
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
            const isOver = bill.status === 'overdue';
            const isPending = bill.status === 'pending';
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
                    <Text style={styles.invMonth}>T{String(bill.month).padStart(2, '0')}/{bill.year}</Text>
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
                    {isOver ? `Quá hạn ${Math.abs(getDaysUntil(bill.dueDate))} ngày` : `Hạn: ${formatDate(bill.dueDate)}`}
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
          {(actionsExpanded ? QUICK_ACTIONS : QUICK_ACTIONS.slice(0, 4)).map((a, i) => {
            // Badge số thật: hóa đơn chưa thanh toán / bảo trì đang xử lý.
            const badge =
              a.route === 'InvoiceList' ? unpaidBills.length
              : a.route === 'MaintenanceList' ? (data.maintenance.pending + data.maintenance.inProgress)
              : 0;
            return (
              <TouchableOpacity
                key={i}
                style={styles.actionBtn}
                onPress={() => navigation.navigate(a.route)}
                activeOpacity={0.75}
              >
                <View style={[
                  styles.actionIconWrap,
                  { backgroundColor: a.color + (a.primary ? '1A' : '0F') },
                ]}>
                  <Text style={styles.actionEmoji}>{a.emoji}</Text>
                  {badge > 0 && (
                    <View style={styles.actionBadge}>
                      <Text style={styles.actionBadgeText}>{badge > 9 ? '9+' : badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.actionLabel, !a.primary && styles.actionLabelSecondary]}>
                  {a.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity
          style={styles.actionsToggle}
          onPress={() => setActionsExpanded(e => !e)}
          activeOpacity={0.7}
        >
          <Text style={styles.actionsToggleText}>
            {actionsExpanded ? 'Thu gọn ▲' : `Xem thêm ▼`}
          </Text>
        </TouchableOpacity>

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

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.lg },
  greeting: { fontSize: 13, color: Colors.textSecondary },
  userName: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },
  notifBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', ...Shadow.sm },
  notifBadge: { position: 'absolute', top: 6, right: 6, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: Colors.error, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  notifBadgeText: { fontSize: 10, fontWeight: '800', color: Colors.white },

  // Room card — gọn lại chỉ còn tên phòng/nhà + địa chỉ + đếm ngày HĐ; chi tiết
  // (diện tích/tầng/cọc) chuyển xuống "Thông tin tòa nhà" (buildingRatesRow bên dưới).
  roomCard: { borderRadius: BorderRadius.xl, overflow: 'hidden', marginBottom: Spacing.md, backgroundColor: 'rgba(79,70,229,0.95)', padding: Spacing.lg, ...Shadow.md },
  roomLabel: { fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  roomName: { fontSize: 26, fontWeight: '800', color: Colors.white, marginTop: 2 },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 5, gap: 3, marginBottom: Spacing.md },
  addressIcon: { fontSize: 11, marginTop: 1 },
  addressText: { fontSize: 11, color: 'rgba(255,255,255,0.7)', flex: 1, lineHeight: 16 },
  contractBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 6 },
  contractBarText: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },
  contractBarDays: { fontSize: 11, fontWeight: '700', color: Colors.white },

  // Building info card
  buildingCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.xl, padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm, borderWidth: 1, borderColor: Colors.border },
  buildingCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  buildingCardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  buildingCardSub: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic' },
  buildingAddressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginBottom: Spacing.sm, paddingBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  buildingAddressIcon: { fontSize: 13, marginTop: 1 },
  buildingAddress: { fontSize: 13, color: Colors.textPrimary, fontWeight: '500', flex: 1, lineHeight: 18 },
  buildingRatesRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm, marginBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  buildingRate: { flex: 1, alignItems: 'center', gap: 2 },
  buildingRateIcon: { fontSize: 16 },
  buildingRateValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  buildingRateLabel: { fontSize: 10, color: Colors.textMuted },
  buildingRateDivider: { width: 1, height: 36, backgroundColor: Colors.divider },
  buildingNoteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: Spacing.sm, marginBottom: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  buildingNoteIcon: { fontSize: 13 },
  buildingNoteText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  buildingHostRow: { flexDirection: 'row', alignItems: 'center' },
  buildingHostLabel: { fontSize: 12, color: Colors.textSecondary },
  buildingHostName: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  buildingHostPhone: { fontSize: 12, color: Colors.primary, fontWeight: '600' },

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
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  actionBtn: {
    width: '22%', alignItems: 'center',
    backgroundColor: Colors.white,
    paddingVertical: 10, paddingHorizontal: 2,
    borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border + '80',
    ...Shadow.sm,
  },
  actionIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  actionEmoji: { fontSize: 18 },
  actionBadge: {
    position: 'absolute', top: -3, right: -3,
    minWidth: 14, height: 14, borderRadius: 7,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2,
  },
  actionBadgeText: { fontSize: 8, fontWeight: '800', color: Colors.white },
  actionLabel: { fontSize: 9.5, fontWeight: '700', color: Colors.textSecondary, textAlign: 'center' },
  actionLabelSecondary: { fontWeight: '500', color: Colors.textMuted },
  actionsToggle: {
    alignSelf: 'center', paddingVertical: 6, paddingHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
  },
  actionsToggleText: { fontSize: 12, fontWeight: '600', color: Colors.primary },
});
