import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, ActivityIndicator, RefreshControl,
} from 'react-native';
import { showAlert } from '@/utils';
import { maskTenantPhone } from '@/constants/managerVisibility';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow, HIDDEN_AMOUNT_TEXT } from '@/constants';
import {
  roomOperationService, OpStatus, OpRoom, OpProperty,
} from '@/services/manager/roomService';
// Sheet chi tiết khách thuê dùng CHUNG với màn Khách thuê — mở ngay tại đây thay vì
// điều hướng sang một màn khác có bố cục khác.
import {
  TenantDetailSheet, mapContractToTenant, type Tenant as TenantDetail,
} from '@/components/manager/TenantDetailSheet';

// ======================== TYPES ========================
type ActionView = 'menu' | 'status' | 'detail';
type Room = OpRoom;
type Property = OpProperty;

// ======================== CONFIG ========================
const STATUS_META: Record<OpStatus, { label: string; color: string; bg: string; dot: string }> = {
  available:   { label: 'Trống',            color: '#16A34A', bg: '#F0FDF4', dot: '#16A34A' },
  occupied:    { label: 'Đang thuê',        color: '#2563EB', bg: '#EFF6FF', dot: '#3B82F6' },
  maintenance: { label: 'Đang bảo trì',    color: '#D97706', bg: '#FFFBEB', dot: '#F59E0B' },
  disabled:    { label: 'Ngưng khai thác', color: '#6B7280', bg: '#F3F4F6', dot: '#9CA3AF' },
};

// Valid status transitions per current status.
// occupied cannot go directly to 'available' — must do formal check-out first.
const VALID_TRANSITIONS: Record<OpStatus, { status: OpStatus; desc: string }[]> = {
  available:   [
    { status: 'maintenance', desc: 'Đưa phòng vào bảo trì / sửa chữa' },
    { status: 'disabled',    desc: 'Tắt khai thác, không nhận khách và không tạo hóa đơn' },
  ],
  occupied:    [
    { status: 'maintenance', desc: 'Đưa phòng vào bảo trì (sau khi khách đồng ý)' },
    { status: 'disabled',    desc: 'Tắt khai thác, không nhận khách và không tạo hóa đơn' },
  ],
  maintenance: [
    { status: 'available',   desc: 'Bảo trì hoàn tất — phòng sẵn sàng cho thuê' },
    { status: 'disabled',    desc: 'Tắt khai thác hoàn toàn' },
  ],
  disabled:    [
    { status: 'available',   desc: 'Kích hoạt lại — phòng sẵn sàng cho thuê' },
  ],
};

/** Trạng thái của NHÀ NGUYÊN CĂN — cả căn là 1 đơn vị cho thuê, không có phòng. */
const WHOLE_META: Record<'rented' | 'vacant' | 'maintenance', {
  label: string; color: string; bg: string; dot: string;
}> = {
  rented:      { label: 'Đang cho thuê', color: '#2563EB', bg: '#EFF6FF', dot: '🔵' },
  vacant:      { label: 'Còn trống',     color: '#16A34A', bg: '#F0FDF4', dot: '🟢' },
  maintenance: { label: 'Đang bảo trì',  color: '#D97706', bg: '#FFFBEB', dot: '🟡' },
};

const fmt = (n: number | null | undefined) => (n || 0).toLocaleString('vi-VN') + 'đ';
const fmtDate = (iso?: string) => (iso ? iso.split('-').reverse().join('/') : '—');

// ======================== SUMMARY BOX ========================
const SummaryBox: React.FC<{ count: number; label: string; color: string; bg: string }> = ({ count, label, color, bg }) => (
  <View style={[sumSt.box, { backgroundColor: bg }]}>
    <Text style={[sumSt.num, { color }]}>{count}</Text>
    <Text style={sumSt.label}>{label}</Text>
  </View>
);
const sumSt = StyleSheet.create({
  box:   { flex: 1, borderRadius: BorderRadius.lg, paddingVertical: 10, alignItems: 'center' },
  num:   { fontSize: 20, fontWeight: '800' },
  label: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, fontWeight: '500' },
});

// ======================== ROOM CARD ========================
const RoomCard: React.FC<{
  room: Room;
  onAction: () => void;
  /** Bấm thẳng vào tên khách để xem chi tiết — khỏi phải qua menu •••. */
  onTenantPress: () => void;
}> = ({ room, onAction, onTenantPress }) => {
  const st = STATUS_META[room.status];
  const isDisabled = room.status === 'disabled';
  return (
    <View style={[cardSt.card, isDisabled && cardSt.cardDisabled]}>
      <View style={cardSt.topRow}>
        <View style={[cardSt.dot, { backgroundColor: st.dot }]} />
        <Text style={[cardSt.code, isDisabled && cardSt.dim]}>{room.code}</Text>
        <View style={[cardSt.badge, { backgroundColor: st.bg }]}>
          <Text style={[cardSt.badgeText, { color: st.color }]}>{st.label}</Text>
        </View>
        <TouchableOpacity
          style={cardSt.menuBtn}
          onPress={onAction}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={cardSt.menuDots}>•••</Text>
        </TouchableOpacity>
      </View>

      <Text style={[cardSt.meta, isDisabled && cardSt.dim]}>
        Tầng {room.floor} · {room.area}m² · tối đa {room.maxOccupants} người
      </Text>

      {room.tenantName ? (
        <TouchableOpacity
          onPress={onTenantPress}
          disabled={!room.contract}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          <Text style={cardSt.tenant}>
            👤 {room.tenantName}{!!room.contract && <Text style={cardSt.tenantLink}>  Xem ›</Text>}
          </Text>
        </TouchableOpacity>
      ) : room.status === 'available' ? (
        <Text style={cardSt.vacantHint}>Chưa có khách thuê</Text>
      ) : null}

      {room.status === 'maintenance' && (
        <Text style={cardSt.maintNote}>🔧 Phòng đang khoá để sửa chữa</Text>
      )}
      {room.fixing && (
        <Text style={cardSt.maintNote}>🔧 Có thiết bị đang sửa — khách vẫn ở bình thường</Text>
      )}
      {isDisabled && (
        <Text style={cardSt.disabledNote}>⛔ Phòng ngưng khai thác — không nhận khách / hóa đơn</Text>
      )}

      <View style={[cardSt.priceRow, isDisabled && { opacity: 0.45 }]}>
        {/* Chip giá thuê + cọc đã BỎ 13/08/2026 — manager không được thấy hai khoản này
            (xem @/constants/managerVisibility). Chip điện/nước giữ lại vì manager tự
            chốt chỉ số và phát hành hoá đơn, không thấy đơn giá thì không làm được. */}
        {room.electricityRate ? (
          <Text style={cardSt.priceChip}>⚡ {room.electricityRate.toLocaleString('vi-VN')}đ/kWh</Text>
        ) : null}
        {room.waterRate ? (
          <Text style={cardSt.priceChip}>💧 {room.waterRate.toLocaleString('vi-VN')}đ/m³</Text>
        ) : null}
      </View>
    </View>
  );
};
const cardSt = StyleSheet.create({
  card:         { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm, borderWidth: 1, borderColor: Colors.border },
  cardDisabled: { borderColor: '#D1D5DB', backgroundColor: '#F9FAFB' },
  topRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  dot:          { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  code:         { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, flex: 1 },
  dim:          { color: Colors.textMuted },
  badge:        { paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.full, marginRight: 8 },
  badgeText:    { fontSize: 10, fontWeight: '700' },
  menuBtn:      { padding: 4 },
  menuDots:     { fontSize: 15, color: Colors.textMuted, letterSpacing: 1, fontWeight: '800' },
  meta:         { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
  tenant:       { fontSize: 13, fontWeight: '600', color: Colors.primary, marginBottom: 4 },
  tenantLink:   { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  vacantHint:   { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic', marginBottom: 4 },
  maintNote:    { fontSize: 12, color: '#D97706', fontWeight: '600', marginBottom: 4 },
  disabledNote: { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  priceRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 5, paddingTop: 7, marginTop: 2, borderTopWidth: 1, borderTopColor: Colors.divider },
  priceChip:    { fontSize: 11, color: Colors.textMuted, backgroundColor: Colors.background, paddingHorizontal: 6, paddingVertical: 2, borderRadius: BorderRadius.full },
});

// ======================== ACTION ITEM ========================
const ActionItem: React.FC<{
  icon: string; label: string; sublabel?: string;
  onPress: () => void; primary?: boolean; danger?: boolean; disabled?: boolean;
}> = ({ icon, label, sublabel, onPress, primary, danger, disabled }) => (
  <TouchableOpacity
    style={[actSt.item, primary && actSt.itemPrimary, disabled && actSt.itemDisabled]}
    onPress={disabled ? undefined : onPress}
    activeOpacity={disabled ? 1 : 0.7}
  >
    <Text style={[actSt.icon, disabled && { opacity: 0.4 }]}>{icon}</Text>
    <View style={{ flex: 1 }}>
      <Text style={[actSt.label, primary && actSt.labelPrimary, danger && actSt.labelDanger, disabled && actSt.labelDisabled]}>
        {label}
      </Text>
      {sublabel ? <Text style={actSt.sublabel}>{sublabel}</Text> : null}
    </View>
    <Text style={[actSt.chevron, disabled && { opacity: 0.3 }]}>›</Text>
  </TouchableOpacity>
);
const actSt = StyleSheet.create({
  item:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  itemPrimary:  { backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md, borderBottomWidth: 0, marginBottom: 2, paddingHorizontal: Spacing.sm },
  itemDisabled: { opacity: 0.5 },
  icon:         { fontSize: 20, width: 34 },
  label:        { fontSize: 15, color: Colors.textPrimary, fontWeight: '500' },
  labelPrimary: { color: Colors.primary, fontWeight: '700' },
  labelDanger:  { color: Colors.error },
  labelDisabled:{ color: Colors.textMuted },
  sublabel:     { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  chevron:      { fontSize: 18, color: Colors.textMuted },
});

// ======================== INFO LINE (nhà nguyên căn) ========================
const InfoLine: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <View style={infoSt.row}>
    <Text style={infoSt.label}>{label}</Text>
    <Text style={[infoSt.value, strong && infoSt.valueStrong]} numberOfLines={1}>{value}</Text>
  </View>
);
const infoSt = StyleSheet.create({
  row:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm, paddingVertical: 6 },
  label:       { fontSize: 13, color: Colors.textSecondary },
  value:       { fontSize: 13, color: Colors.textPrimary, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  valueStrong: { fontSize: 14, fontWeight: '800' },
});

// ======================== MAIN SCREEN ========================
export const RoomManageScreen: React.FC<any> = ({ navigation, route }) => {
  /**
   * Vào màn này từ một chỗ đã biết nhà/phòng (vd bấm một phòng ở "Tổng quan phòng" của
   * màn chi tiết nhà) thì mở thẳng nhà đó — và mở luôn phòng đó nếu có `roomCode`.
   *
   * Trước 17/08/2026 màn này KHÔNG đọc route params: chỗ gọi vẫn truyền `propertyId`
   * đầy đủ nhưng bị bỏ qua, nên bấm phòng nào — có khách hay đang trống — cũng rơi về
   * bước "Chọn bất động sản", phải chọn lại nhà rồi tự tìm lại phòng vừa bấm.
   */
  const paramPropertyId: string | undefined =
    route?.params?.propertyId != null ? String(route.params.propertyId) : undefined;
  const paramRoomCode: string | undefined =
    route?.params?.roomCode != null ? String(route.params.roomCode) : undefined;
  /** Tên nhà từ route — hiện ngay ở header khi còn đang tải danh sách nhà. */
  const paramPropertyName: string = route?.params?.propertyName ?? '';

  /**
   * Nhà đang vận hành LẤY TỪ ROUTE — màn này không còn bước chọn nhà.
   *
   * Bước "Chọn bất động sản" đã bỏ (17/08/2026): nó lặp lại đúng việc của luồng Bất động
   * sản → chi tiết nhà, mà lối vào duy nhất tới màn này là từ chi tiết nhà (4 chỗ, đều
   * truyền `propertyId`) nên bước đó vừa dư vừa gây lạc — bấm "Quay lại" ở danh sách
   * phòng thì rơi về bước chọn nhà chứ không về được nhà vừa xem.
   */
  const selectedPropId = paramPropertyId ?? null;

  const [properties, setProperties] = useState<Property[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [errorProps, setErrorProps] = useState<string | null>(null);

  // Phòng của nhà đang chọn
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [errorRooms, setErrorRooms] = useState<string | null>(null);
  const [refreshingRooms, setRefreshingRooms] = useState(false);
  const [updating, setUpdating] = useState(false);

  const [filter, setFilter] = useState<'all' | OpStatus>('all');
  const [actionRoom, setActionRoom] = useState<Room | null>(null);
  const [actionView, setActionView] = useState<ActionView>('menu');
  /** Khách thuê đang xem chi tiết (sheet dùng chung) — null là đang đóng. */
  const [tenantDetail, setTenantDetail] = useState<TenantDetail | null>(null);

  const property = properties.find(p => p.id === selectedPropId);

  const msgOf = (e: any, fallback: string) =>
    e?.response?.data?.message || e?.message || fallback;

  const loadProperties = useCallback(async () => {
    try {
      setErrorProps(null);
      const data = await roomOperationService.getProperties();
      setProperties(data);
    } catch (e: any) {
      setErrorProps(msgOf(e, 'Không tải được danh sách tòa nhà'));
    } finally {
      setLoadingProps(false);
    }
  }, []);

  const loadRooms = useCallback(async (propId: string) => {
    try {
      setErrorRooms(null);
      const data = await roomOperationService.getRooms(Number(propId));
      setRooms(data);
    } catch (e: any) {
      setRooms([]);
      setErrorRooms(msgOf(e, 'Không tải được danh sách phòng'));
    } finally {
      setLoadingRooms(false);
      setRefreshingRooms(false);
    }
  }, []);

  // Tải danh sách nhà mỗi khi màn được focus (vd quay lại sau khi onboard khách).
  useFocusEffect(useCallback(() => { loadProperties(); }, [loadProperties]));

  const counts = useMemo(() => ({
    total:       rooms.length,
    available:   rooms.filter(r => r.status === 'available').length,
    occupied:    rooms.filter(r => r.status === 'occupied').length,
    maintenance: rooms.filter(r => r.status === 'maintenance').length,
    disabled:    rooms.filter(r => r.status === 'disabled').length,
  }), [rooms]);

  /**
   * Phòng sau khi lọc, XẾP THEO SỐ PHÒNG.
   *
   * BE trả theo thứ tự của bảng (phòng nào vừa đổi trạng thái thì nhảy xuống cuối), nên
   * danh sách ra kiểu 102 · 103 · 104 · 101 — đúng cái phòng có khách lại nằm cuối. Xếp
   * bằng `localeCompare(numeric: true)` để "101" trước "102" và "9" trước "10"
   * (so sánh chuỗi thường thì "10" đứng trước "9").
   */
  const filtered = useMemo(() => {
    const base = filter === 'all' ? rooms : rooms.filter(r => r.status === filter);
    return [...base].sort((a, b) =>
      a.floor - b.floor || a.code.localeCompare(b.code, 'vi', { numeric: true }),
    );
  }, [rooms, filter]);

  const floors = useMemo(
    () => [...new Set(filtered.map(r => r.floor))].sort((a, b) => a - b),
    [filtered],
  );

  const openAction = useCallback((room: Room) => { setActionRoom(room); setActionView('menu'); }, []);
  const closeAction = () => { setActionRoom(null); setActionView('menu'); };

  /**
   * Mở sheet chi tiết khách thuê của phòng — CÙNG sheet với màn Khách thuê.
   * `room.contract` là HĐ thô mà `getRooms` đã tải sẵn, nên không gọi thêm API.
   */
  const openTenantSheet = (room: Room) => {
    if (!room.contract || !property) return;
    closeAction();
    setTenantDetail(mapContractToTenant(room.contract, property.name, !!property.wholeHouse));
  };

  /** Thao tác từ trong sheet. Cùng bộ tên hành động với màn Khách thuê. */
  const handleTenantSheetAction = (action: string, t: TenantDetail) => {
    const navParams = {
      tenantId: t.id, tenantName: t.fullName,
      roomId: t.roomId, roomName: t.roomName,
      propertyId: t.propertyId, propertyName: t.propertyName,
    };
    setTenantDetail(null);
    switch (action) {
      case 'billing':     navigation.navigate('TenantInvoices', navParams); break;
      case 'contract':    navigation.navigate('TenantContractDetail', navParams); break;
      case 'maintenance': navigation.navigate('TenantMaintenance', navParams); break;
      // Trả phòng ở màn này đi qua danh sách yêu cầu trả phòng (giống nút của thẻ
      // phòng), KHÔNG thanh lý thẳng như màn Khách thuê.
      case 'checkout':    navigation.navigate('CheckoutRequests'); break;
      case 'reception':   navigation.navigate('ResumeContract', { contractId: Number(t.id) }); break;
    }
  };

  // Nạp phòng của nhà trong route. Chạy lại mỗi lần màn được focus để số liệu khớp sau
  // khi đi làm việc khác rồi quay về (đổi trạng thái phòng, đón khách...).
  useFocusEffect(useCallback(() => {
    if (!selectedPropId) return;
    setLoadingRooms(true);
    loadRooms(selectedPropId);
  }, [selectedPropId, loadRooms]));

  /** Mở sẵn bảng thao tác của đúng phòng vừa bấm, sau khi phòng của nhà đó tải xong. */
  const appliedRoomParam = useRef<string | null>(null);
  useEffect(() => {
    if (!paramRoomCode || !selectedPropId || rooms.length === 0) return;
    const key = `${selectedPropId}|${paramRoomCode}`;
    if (appliedRoomParam.current === key) return;
    const target = rooms.find(r => r.code === paramRoomCode);
    if (!target) return;
    appliedRoomParam.current = key;
    openAction(target);
  }, [paramRoomCode, selectedPropId, rooms, openAction]);

  const applyStatus = async (room: Room, newStatus: OpStatus) => {
    if (!selectedPropId || updating) return;
    setUpdating(true);
    try {
      await roomOperationService.updateRoomStatus(Number(selectedPropId), room.roomId, newStatus);
      setRooms(prev => prev.map(r => (r.id === room.id ? { ...r, status: newStatus } : r)));
      closeAction();
    } catch (e: any) {
      showAlert('Lỗi', msgOf(e, 'Không cập nhật được trạng thái phòng'));
    } finally {
      setUpdating(false);
    }
  };

  /**
   * Trả phòng đi theo yêu cầu checkout của khách (PENDING → APPROVED → INSPECTING → ...),
   * xử lý ở màn "Trả phòng". Trước 15/08/2026 nút này mở thẳng InspectionDetail —
   * màn biên bản MOCK, bấm "Lưu" chỉ hiện alert "Mock: ..." và không ghi gì xuống BE.
   */
  const handleCheckOut = (room: Room) => {
    closeAction();
    showAlert(
      'Trả phòng',
      `Mở danh sách yêu cầu trả phòng để xử lý cho ${room.tenantName ?? 'khách'} — phòng ${room.code}?`,
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Mở danh sách', onPress: () => navigation.navigate('CheckoutRequests') },
      ],
    );
  };

  const handleCheckIn = (room: Room) => {
    closeAction();
    showAlert(
      'Đón khách',
      `Mở danh sách khách chờ đón để xử lý phòng ${room.code}?`,
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Tiến hành', onPress: () => navigation.navigate('ResumeContract') },
      ],
    );
  };

  const handleFinishMaintenance = (room: Room) => {
    showAlert(
      'Mở lại cho thuê',
      `Phòng ${room.code} đã sửa xong, mở lại để nhận khách?`,
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Xác nhận', onPress: () => applyStatus(room, 'available') },
      ],
    );
  };

  /**
   * KHOÁ PHÒNG ĐỂ SỬA — chỉ cho phòng TRỐNG.
   *
   * Bản cũ tên "Báo bảo trì · Tạo yêu cầu" nhưng KHÔNG tạo phiếu nào (BE chỉ cho khách thuê
   * tạo phiếu — MaintenanceController POST hasRole TENANT), chỉ đổi status phòng — kể cả
   * phòng đang có khách ở. Nay gọi đúng tên việc nó làm: không nhận khách vào phòng này cho
   * tới khi mở lại. Sửa đồ trong phòng CÓ khách thì khách báo qua app, BE tự quản trạng thái.
   */
  const handleReportMaintenance = (room: Room) => {
    closeAction();
    showAlert(
      'Khoá phòng để sửa chữa',
      `Phòng ${room.code} sẽ không nhận khách cho tới khi bạn mở lại. Tiếp tục?`,
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Khoá phòng', onPress: () => applyStatus(room, 'maintenance') },
      ],
    );
  };

  // ──────────────────────────────────────────────────────────
  // GUARD — nhà lấy từ route, nên chỉ còn 3 ca: đang tải · không mở được · mở được
  // ──────────────────────────────────────────────────────────
  /** Khung có header + nút quay lại, dùng cho ca chờ và ca lỗi. */
  const shell = (body: React.ReactNode) => (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerSide}>
          <Text style={[styles.headerBackText, { fontSize: 24, lineHeight: 28 }]} accessibilityLabel="Quay lại">←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {paramPropertyName || 'Quản lý phòng'}
          </Text>
        </View>
        <View style={styles.headerSide} />
      </View>
      <View style={styles.emptyState}>{body}</View>
    </SafeAreaView>
  );

  if (loadingProps && !property) {
    return shell(<ActivityIndicator size="large" color={Colors.primary} />);
  }

  if (errorProps) {
    return shell(
      <>
        <Text style={styles.emptyIcon}>⚠️</Text>
        <Text style={styles.emptyText}>{errorProps}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoadingProps(true); loadProperties(); }}>
          <Text style={styles.retryBtnText}>Thử lại</Text>
        </TouchableOpacity>
      </>,
    );
  }

  // Vào bằng id nhà không thuộc phạm vi phụ trách (hoặc thiếu hẳn id) — nói rõ thay vì
  // đưa ra một danh sách nhà khác để chọn.
  if (!property) {
    return shell(
      <>
        <Text style={styles.emptyIcon}>🏢</Text>
        <Text style={styles.emptyText}>
          Không mở được nhà này. Hãy chọn nhà từ mục Bất động sản.
        </Text>
      </>,
    );
  }

  // ──────────────────────────────────────────────────────────
  // WHOLE HOUSE VIEW — nhà nguyên căn không có phòng, cả căn là 1 đơn vị cho thuê.
  // Không dùng lưới phòng / bộ lọc trạng thái phòng ở đây (trước đây hiện
  // "0 phòng · Không có phòng nào", vô nghĩa với loại hình này).
  // ──────────────────────────────────────────────────────────
  if (property.wholeHouse) {
    const w = property.whole ?? { status: 'vacant' as const };
    const meta = WHOLE_META[w.status];
    const rented = w.status === 'rented';

    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerSide}>
            <Text style={[styles.headerBackText, { fontSize: 24, lineHeight: 28 }]} accessibilityLabel="Quay lại">←</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>{property.name}</Text>
            <Text style={styles.headerSub} numberOfLines={1}>{property.address}</Text>
          </View>
          <View style={styles.headerSide} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loadingProps}
              onRefresh={() => { setLoadingProps(true); loadProperties(); }}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
        >
          <View style={styles.houseCard}>
            <View style={styles.houseTop}>
              <Text style={styles.houseIcon}>🏠</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.houseTitle}>Toàn bộ căn nhà</Text>
                <Text style={styles.houseSub}>Cho thuê nguyên căn — không chia phòng</Text>
              </View>
              <View style={[styles.houseBadge, { backgroundColor: meta.bg }]}>
                <Text style={[styles.houseBadgeText, { color: meta.color }]}>{meta.label}</Text>
              </View>
            </View>

            {rented ? (
              <View style={styles.houseInfo}>
                <InfoLine label="Khách thuê" value={w.tenantName ?? '—'} strong />
                {!!w.tenantPhone && <InfoLine label="Điện thoại" value={maskTenantPhone(w.tenantPhone)} />}
                {!!w.contractCode && <InfoLine label="Hợp đồng" value={w.contractCode} />}
                <InfoLine label="Đến ngày" value={fmtDate(w.contractEndDate)} />
                <InfoLine label="Tiền thuê" value={HIDDEN_AMOUNT_TEXT} />
                <InfoLine label="Tiền cọc" value={HIDDEN_AMOUNT_TEXT} />
              </View>
            ) : (
              <View style={styles.houseInfo}>
                <Text style={styles.houseVacant}>
                  {w.status === 'maintenance'
                    ? '🔧 Căn nhà đang bảo trì — chưa nhận khách.'
                    : 'Chưa có khách thuê.'}
                </Text>
                <InfoLine label="Giá chào thuê" value={HIDDEN_AMOUNT_TEXT} />
              </View>
            )}
          </View>

          <Text style={styles.sectionLabel}>Thao tác</Text>
          <View style={styles.actionCard}>
            {rented ? (
              <>
                <ActionItem
                  icon="📋" label="Hợp đồng khách thuê"
                  sublabel="Xem chi tiết, gia hạn, thanh lý"
                  onPress={() => navigation.navigate('ManagerContracts')}
                />
                <ActionItem
                  icon="🚪" label="Xử lý trả nhà"
                  sublabel="Duyệt yêu cầu, lập biên bản, quyết toán cọc"
                  onPress={() => navigation.navigate('CheckoutRequests')}
                />
              </>
            ) : (
              <ActionItem
                icon="🤝" label="Khách chờ đón" primary
                sublabel="Mở danh sách khách chờ đón để bàn giao nhà"
                onPress={() => navigation.navigate('ResumeContract')}
              />
            )}
            <ActionItem
              icon="🔧" label="Bảo trì"
              sublabel="Xem và xử lý yêu cầu sửa chữa của căn nhà"
              onPress={() => navigation.navigate('BuildingMaintenance', {
                propertyId: property.propertyId, propertyName: property.name,
                propertyType: property.wholeHouse ? 'WHOLE_HOUSE' : 'MULTI_ROOM',
              })}
            />
            <ActionItem
              icon="⚡" label="Ghi chỉ số & hóa đơn"
              sublabel="Chốt điện/nước cho căn nhà"
              onPress={() => navigation.navigate('UtilityBilling')}
            />
          </View>

          <View style={styles.adminNote}>
            <Text style={styles.adminNoteIcon}>ℹ️</Text>
            <Text style={styles.adminNoteText}>
              Nhà nguyên căn do Admin Web Portal cấu hình. Manager vận hành theo hợp đồng của cả căn.
            </Text>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ──────────────────────────────────────────────────────────
  // ROOM LIST VIEW — nhà nhiều phòng
  // ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerSide}>
          <Text style={[styles.headerBackText, { fontSize: 24, lineHeight: 28 }]} accessibilityLabel="Quay lại">←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{property.name}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{property.address}</Text>
        </View>
        <View style={styles.headerSide} />
      </View>

      {/* Summary */}
      <View style={styles.summaryRow}>
        <SummaryBox count={counts.total}       label="Tổng"       color={Colors.textPrimary} bg="#F8FAFC" />
        <SummaryBox count={counts.occupied}    label="Đang thuê"  color="#2563EB"            bg="#EFF6FF" />
        <SummaryBox count={counts.available}   label="Trống"      color="#16A34A"            bg="#F0FDF4" />
        <SummaryBox count={counts.maintenance} label="Bảo trì"    color="#D97706"            bg="#FFFBEB" />
        {counts.disabled > 0 && (
          <SummaryBox count={counts.disabled} label="Ngưng" color="#6B7280" bg="#F3F4F6" />
        )}
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        {([
          { id: 'all',         label: 'Tất cả' },
          { id: 'available',   label: 'Trống' },
          { id: 'occupied',    label: 'Đang thuê' },
          { id: 'maintenance', label: 'Bảo trì' },
          { id: 'disabled',    label: 'Ngưng khai thác' },
        ] as { id: 'all' | OpStatus; label: string }[]).map(f => (
          <TouchableOpacity
            key={f.id}
            style={[styles.chip, filter === f.id && styles.chipActive]}
            onPress={() => setFilter(f.id)}
          >
            <Text style={[styles.chipText, filter === f.id && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Room list */}
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshingRooms}
            onRefresh={() => { if (selectedPropId) { setRefreshingRooms(true); loadRooms(selectedPropId); } }}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
      >
        {loadingRooms && !refreshingRooms ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={[styles.emptyText, { marginTop: Spacing.md }]}>Đang tải phòng...</Text>
          </View>
        ) : errorRooms ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>⚠️</Text>
            <Text style={styles.emptyText}>{errorRooms}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={() => { if (selectedPropId) { setLoadingRooms(true); loadRooms(selectedPropId); } }}
            >
              <Text style={styles.retryBtnText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🚪</Text>
            <Text style={styles.emptyText}>Không có phòng nào</Text>
          </View>
        ) : (
          floors.map(floor => (
            <View key={floor} style={styles.floorGroup}>
              <Text style={styles.floorLabel}>Tầng {floor}</Text>
              {filtered.filter(r => r.floor === floor).map(room => (
                <RoomCard
                  key={room.id}
                  room={room}
                  onAction={() => openAction(room)}
                  onTenantPress={() => openTenantSheet(room)}
                />
              ))}
            </View>
          ))
        )}

        <View style={styles.adminNote}>
          <Text style={styles.adminNoteIcon}>ℹ️</Text>
          <Text style={styles.adminNoteText}>
            Phòng được cấu hình bởi Admin Web Portal. Manager chỉ cập nhật trạng thái vận hành.
          </Text>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── BOTTOM SHEET (single modal, internal view switching) ── */}
      <Modal visible={actionRoom !== null} transparent animationType="slide">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={closeAction}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />

            {/* ── MENU VIEW ── */}
            {actionRoom && actionView === 'menu' && (
              <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                {/* Room header */}
                <View style={styles.sheetRoomHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetRoomCode}>{actionRoom.code}</Text>
                    <Text style={styles.sheetRoomMeta}>
                      Tầng {actionRoom.floor} · {actionRoom.area}m² · {actionRoom.maxOccupants} người
                    </Text>
                    {actionRoom.tenantName && (
                      <Text style={styles.sheetTenant}>👤 {actionRoom.tenantName}</Text>
                    )}
                  </View>
                  <View style={[styles.sheetBadge, { backgroundColor: STATUS_META[actionRoom.status].bg }]}>
                    <Text style={[styles.sheetBadgeText, { color: STATUS_META[actionRoom.status].color }]}>
                      {STATUS_META[actionRoom.status].label}
                    </Text>
                  </View>
                </View>
                <View style={styles.sheetDivider} />

                {/*
                  MENU THEO TÌNH TRẠNG PHÒNG (24/09/2026). Bỏ "Cập nhật trạng thái" (một menu
                  con lặp lại đúng các nút bên dưới) — mỗi nút giờ nói thẳng việc nó làm.
                  Thứ tự: việc chính của phòng lên đầu, xem thông tin xuống dưới.
                */}

                {/* ── Phòng CÓ khách ── */}
                {actionRoom.status === 'occupied' && !!actionRoom.contract && (
                  <ActionItem
                    icon="👤"
                    label="Khách thuê"
                    sublabel={`${actionRoom.tenantName ?? ''} · hợp đồng, hoá đơn, báo hỏng`}
                    primary
                    onPress={() => openTenantSheet(actionRoom)}
                  />
                )}
                {actionRoom.fixing && (
                  <View style={styles.sheetInfo}>
                    <Text style={styles.sheetInfoText}>
                      🔧 Phòng có thiết bị đang sửa theo phiếu khách báo. Khách vẫn ở bình thường —
                      trạng thái tự về như cũ khi đóng phiếu.
                    </Text>
                  </View>
                )}

                {/* ── Phòng TRỐNG ── */}
                {actionRoom.status === 'available' && (
                  <ActionItem
                    icon="🤝"
                    label="Khách chờ đón"
                    sublabel="Hồ sơ khách admin đã soạn, chờ bạn đi bàn giao"
                    primary
                    onPress={() => handleCheckIn(actionRoom)}
                  />
                )}
                {actionRoom.status === 'maintenance' && (
                  <ActionItem
                    icon="✅"
                    label="Mở lại cho thuê"
                    sublabel="Đã sửa xong — phòng nhận khách trở lại"
                    primary
                    onPress={() => handleFinishMaintenance(actionRoom)}
                  />
                )}
                {actionRoom.status === 'disabled' && (
                  <ActionItem
                    icon="🟢"
                    label="Kích hoạt lại phòng"
                    primary
                    onPress={() => applyStatus(actionRoom, 'available')}
                  />
                )}

                {/* ── Xem thông tin (mọi phòng) ── */}
                <ActionItem icon="📦" label="Thiết bị trong phòng" sublabel="Tình trạng, lịch sử sửa, mã QR"
                  onPress={() => { closeAction(); navigation.navigate('Equipment', { propertyId: selectedPropId, roomCode: actionRoom.code }); }} />
                <ActionItem icon="📜" label="Lịch sử thuê" sublabel="Các đời khách đã ở phòng này"
                  onPress={() => { closeAction(); navigation.navigate('BuildingContract', { propertyId: selectedPropId, roomCode: actionRoom.code }); }} />
                <ActionItem icon="📋" label="Thông tin phòng" sublabel="Diện tích, sức chứa, mô tả"
                  onPress={() => setActionView('detail')} />

                {/* ── Thao tác đổi trạng thái (ít dùng, để cuối) ── */}
                {actionRoom.status === 'occupied' && (
                  <ActionItem
                    icon="🚪"
                    label="Trả phòng (Check-out)"
                    sublabel="Lập biên bản hiện trạng và kết thúc hợp đồng"
                    onPress={() => handleCheckOut(actionRoom)}
                  />
                )}
                {actionRoom.status === 'available' && (
                  <>
                    <ActionItem
                      icon="🔧"
                      label="Khoá phòng để sửa chữa"
                      sublabel="Tạm không nhận khách cho tới khi mở lại"
                      onPress={() => handleReportMaintenance(actionRoom)}
                    />
                    <ActionItem
                      icon="⛔"
                      label="Ngưng khai thác"
                      sublabel="Không nhận khách, không tạo hoá đơn"
                      onPress={() => applyStatus(actionRoom, 'disabled')}
                    />
                  </>
                )}

                <TouchableOpacity style={styles.sheetCancel} onPress={closeAction}>
                  <Text style={styles.sheetCancelText}>Đóng</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            {/* ── STATUS VIEW ── */}
            {actionRoom && actionView === 'status' && (
              <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                <TouchableOpacity style={styles.sheetBackRow} onPress={() => setActionView('menu')}>
                  <Text style={[styles.sheetBackText, { fontSize: 24, lineHeight: 28 }]} accessibilityLabel="Quay lại">‹</Text>
                </TouchableOpacity>
                <Text style={styles.statusTitle}>Cập nhật trạng thái</Text>
                <Text style={styles.statusSub}>
                  Phòng {actionRoom.code} · hiện tại:{' '}
                  <Text style={{ color: STATUS_META[actionRoom.status].color, fontWeight: '700' }}>
                    {STATUS_META[actionRoom.status].label}
                  </Text>
                </Text>

                {actionRoom.status === 'occupied' && (
                  <View style={styles.statusWarning}>
                    <Text style={styles.statusWarningText}>
                      ⚠️ Để phòng về Trống, cần thực hiện Trả phòng (Check-out) qua quy trình biên bản hiện trạng, không thể chuyển thẳng.
                    </Text>
                  </View>
                )}

                {VALID_TRANSITIONS[actionRoom.status].map(t => {
                  const meta = STATUS_META[t.status];
                  return (
                    <TouchableOpacity
                      key={t.status}
                      style={styles.statusOption}
                      onPress={() => applyStatus(actionRoom, t.status)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.statusOptionDot, { backgroundColor: meta.dot }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.statusOptionLabel}>{meta.label}</Text>
                        <Text style={styles.statusOptionDesc}>{t.desc}</Text>
                      </View>
                      <Text style={{ fontSize: 18, color: Colors.textMuted }}>›</Text>
                    </TouchableOpacity>
                  );
                })}

                <TouchableOpacity style={styles.sheetCancel} onPress={() => setActionView('menu')}>
                  <Text style={styles.sheetCancelText}>Hủy</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            {/* ── DETAIL VIEW ── */}
            {actionRoom && actionView === 'detail' && (
              <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                <TouchableOpacity style={styles.sheetBackRow} onPress={() => setActionView('menu')}>
                  <Text style={[styles.sheetBackText, { fontSize: 24, lineHeight: 28 }]} accessibilityLabel="Quay lại">‹</Text>
                </TouchableOpacity>

                <View style={styles.detailTop}>
                  <View>
                    <Text style={styles.detailCode}>{actionRoom.code}</Text>
                    <Text style={styles.detailMeta}>
                      Tầng {actionRoom.floor} · {actionRoom.area}m² · tối đa {actionRoom.maxOccupants} người
                    </Text>
                  </View>
                  <View style={[styles.sheetBadge, { backgroundColor: STATUS_META[actionRoom.status].bg }]}>
                    <Text style={[styles.sheetBadgeText, { color: STATUS_META[actionRoom.status].color }]}>
                      {STATUS_META[actionRoom.status].label}
                    </Text>
                  </View>
                </View>

                {actionRoom.tenantName && (
                  <View style={styles.detailTenantCard}>
                    <Text style={styles.detailTenantHeading}>👤 Khách thuê hiện tại</Text>
                    <Text style={styles.detailTenantName}>{actionRoom.tenantName}</Text>
                    {actionRoom.tenantPhone && (
                      <Text style={styles.detailTenantPhone}>{maskTenantPhone(actionRoom.tenantPhone)}</Text>
                    )}
                  </View>
                )}

                <Text style={styles.detailSectionLabel}>Thông tin phòng (chỉ đọc)</Text>
                <View style={styles.detailTable}>
                  {[
                    { label: 'Giá thuê',   value: HIDDEN_AMOUNT_TEXT },
                    { label: 'Tiền cọc',   value: HIDDEN_AMOUNT_TEXT },
                    ...(actionRoom.electricityRate ? [{ label: 'Điện', value: fmt(actionRoom.electricityRate) + '/kWh' }] : []),
                    ...(actionRoom.waterRate ? [{ label: 'Nước', value: fmt(actionRoom.waterRate) + '/m³' }] : []),
                    { label: 'Diện tích',  value: `${actionRoom.area} m²` },
                    { label: 'Sức chứa',   value: `${actionRoom.maxOccupants} người` },
                    { label: 'Tầng',       value: `Tầng ${actionRoom.floor}` },
                  ].map((row, i, arr) => (
                    <View key={row.label} style={[styles.detailRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                      <Text style={styles.detailRowLabel}>{row.label}</Text>
                      <Text style={styles.detailRowValue}>{row.value}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.readonlyNote}>
                  <Text style={styles.readonlyNoteText}>
                    🔒 Thông tin cấu hình phòng chỉ có thể thay đổi qua Admin Web Portal.
                  </Text>
                </View>

                <TouchableOpacity style={styles.sheetCancel} onPress={closeAction}>
                  <Text style={styles.sheetCancelText}>Đóng</Text>
                </TouchableOpacity>
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Chi tiết khách thuê — dùng chung với màn Khách thuê */}
      {tenantDetail && (
        <TenantDetailSheet
          tenant={tenantDetail}
          onClose={() => setTenantDetail(null)}
          onAction={handleTenantSheetAction}
        />
      )}
    </SafeAreaView>
  );
};

// ======================== STYLES ========================
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.lg },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
    ...Shadow.sm,
  },
  headerSide:     { width: 80 },
  headerBackText: { color: Colors.primary, fontWeight: '600', fontSize: 14 },
  headerCenter:   { flex: 1, alignItems: 'center' },
  headerTitle:    { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  headerSub:      { fontSize: 11, color: Colors.textSecondary, marginTop: 1 },

  // Property selection
  // Ô tìm + hàng chip lọc loại nhà ở màn chọn bất động sản (13/08/2026).


  // Summary row
  summaryRow: { flexDirection: 'row', gap: Spacing.xs, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },

  // Filter chips
  filterScroll:  { flexGrow: 0 },
  filterContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm, paddingTop: 2, gap: Spacing.sm },
  chip:          { height: 30, justifyContent: 'center', paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  chipActive:    { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText:      { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive:{ color: Colors.white },

  // Floor groups
  floorGroup: { marginBottom: Spacing.md },
  floorLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.sm },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon:  { fontSize: 44, marginBottom: Spacing.md },
  emptyText:  { fontSize: 14, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.lg },
  retryBtn:     { marginTop: Spacing.md, backgroundColor: Colors.primary, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  retryBtnText: { color: Colors.white, fontWeight: '800', fontSize: 13 },

  // Admin note (footer)
  // ── Nhà nguyên căn ──
  houseCard:     { backgroundColor: Colors.white, borderRadius: BorderRadius.xl, padding: Spacing.base, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  houseTop:      { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  houseIcon:     { fontSize: 30 },
  houseTitle:    { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  houseSub:      { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  houseBadge:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full },
  houseBadgeText:{ fontSize: 11, fontWeight: '800' },
  houseInfo:     { marginTop: Spacing.md, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.divider },
  houseVacant:   { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.xs },
  sectionLabel:  { fontSize: 13, fontWeight: '800', color: Colors.textSecondary, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  actionCard:    { backgroundColor: Colors.white, borderRadius: BorderRadius.xl, paddingHorizontal: Spacing.base, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },

  adminNote:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg, padding: Spacing.md, marginTop: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '25' },
  adminNoteIcon: { fontSize: 15 },
  adminNoteText: { flex: 1, fontSize: 12, color: Colors.primary, lineHeight: 18 },

  // Bottom sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: 36,
    maxHeight: '82%',
  },
  sheetHandle:    { width: 40, height: 4, backgroundColor: Colors.divider, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  sheetRoomHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  sheetRoomCode:  { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  sheetRoomMeta:  { fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
  sheetTenant:    { fontSize: 13, fontWeight: '600', color: Colors.primary, marginTop: 4 },
  sheetBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full },
  sheetBadgeText: { fontSize: 11, fontWeight: '700' },
  sheetDivider:   { height: 1, backgroundColor: Colors.divider, marginBottom: Spacing.sm },
  sheetInfo:      { backgroundColor: '#EFF6FF', borderRadius: 12, padding: Spacing.md, marginVertical: Spacing.xs },
  sheetInfoText:  { fontSize: 12, color: '#1D4ED8', lineHeight: 18 },
  sheetBackRow:   { marginBottom: Spacing.md },
  sheetBackText:  { fontSize: 14, fontWeight: '600', color: Colors.primary },
  sheetCancel:    { paddingVertical: 14, alignItems: 'center', marginTop: Spacing.sm },
  sheetCancelText:{ fontSize: 15, fontWeight: '600', color: Colors.textSecondary },

  // Status sub-view
  statusTitle:      { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  statusSub:        { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.md },
  statusWarning:    { backgroundColor: '#FEF9C3', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: '#FDE68A' },
  statusWarningText:{ fontSize: 13, color: '#92400E', lineHeight: 20 },
  statusOption:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  statusOptionDot:  { width: 12, height: 12, borderRadius: 6 },
  statusOptionLabel:{ fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  statusOptionDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2, lineHeight: 17 },

  // Detail sub-view
  detailTop:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  detailCode:        { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  detailMeta:        { fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
  detailTenantCard:  { backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '30' },
  detailTenantHeading:{ fontSize: 12, fontWeight: '700', color: Colors.primary, marginBottom: 4 },
  detailTenantName:  { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  detailTenantPhone: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  detailSectionLabel:{ fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm },
  detailTable:       { backgroundColor: Colors.white, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: Spacing.md },
  detailRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  detailRowLabel:    { fontSize: 13, color: Colors.textSecondary },
  detailRowValue:    { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  readonlyNote:      { backgroundColor: '#F8FAFC', borderRadius: BorderRadius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.sm },
  readonlyNoteText:  { fontSize: 12, color: Colors.textMuted, lineHeight: 18 },
});
