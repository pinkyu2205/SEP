import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Alert,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import {
  roomOperationService, OpStatus, OpRoom, OpProperty,
} from '../../services/roomOperationService';

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

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

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
const RoomCard: React.FC<{ room: Room; onAction: () => void }> = ({ room, onAction }) => {
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
        <Text style={cardSt.tenant}>👤 {room.tenantName}</Text>
      ) : room.status === 'available' ? (
        <Text style={cardSt.vacantHint}>Chưa có khách thuê</Text>
      ) : null}

      {room.status === 'maintenance' && (
        <Text style={cardSt.maintNote}>🔧 Đang tiến hành bảo trì</Text>
      )}
      {isDisabled && (
        <Text style={cardSt.disabledNote}>⛔ Phòng ngưng khai thác — không nhận khách / hóa đơn</Text>
      )}

      <View style={[cardSt.priceRow, isDisabled && { opacity: 0.45 }]}>
        <Text style={cardSt.priceChip}>💰 {(room.rentPrice / 1000000).toFixed(1)}tr/th</Text>
        <Text style={cardSt.priceChip}>🔒 {(room.deposit / 1000000).toFixed(1)}tr cọc</Text>
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

// ======================== MAIN SCREEN ========================
export const RoomManageScreen: React.FC<any> = ({ navigation }) => {
  // Danh sách nhà (màn chọn nhà)
  const [properties, setProperties] = useState<Property[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [errorProps, setErrorProps] = useState<string | null>(null);
  const [refreshingProps, setRefreshingProps] = useState(false);

  // Phòng của nhà đang chọn
  const [selectedPropId, setSelectedPropId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [errorRooms, setErrorRooms] = useState<string | null>(null);
  const [refreshingRooms, setRefreshingRooms] = useState(false);
  const [updating, setUpdating] = useState(false);

  const [filter, setFilter] = useState<'all' | OpStatus>('all');
  const [actionRoom, setActionRoom] = useState<Room | null>(null);
  const [actionView, setActionView] = useState<ActionView>('menu');

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
      setRefreshingProps(false);
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

  const filtered = filter === 'all' ? rooms : rooms.filter(r => r.status === filter);
  const floors = useMemo(
    () => [...new Set(filtered.map(r => r.floor))].sort((a, b) => a - b),
    [filtered],
  );

  const selectProperty = (p: Property) => {
    setSelectedPropId(p.id);
    setFilter('all');
    setRooms([]);
    setLoadingRooms(true);
    loadRooms(p.id);
  };

  // Quay về màn chọn nhà: cập nhật lại số liệu phòng của nhà vừa xem cho khớp.
  const backToProperties = () => {
    // Chỉ đồng bộ lại số liệu khi phòng đã tải xong (tránh ghi đè bằng 0 lúc đang tải/lỗi).
    if (selectedPropId && !loadingRooms && !errorRooms) {
      setProperties(prev => prev.map(p => p.id === selectedPropId ? { ...p, counts } : p));
    }
    setSelectedPropId(null);
    setRooms([]);
    setErrorRooms(null);
  };

  const openAction = (room: Room) => { setActionRoom(room); setActionView('menu'); };
  const closeAction = () => { setActionRoom(null); setActionView('menu'); };

  const applyStatus = async (room: Room, newStatus: OpStatus) => {
    if (!selectedPropId || updating) return;
    setUpdating(true);
    try {
      await roomOperationService.updateRoomStatus(Number(selectedPropId), room.roomId, newStatus);
      setRooms(prev => prev.map(r => (r.id === room.id ? { ...r, status: newStatus } : r)));
      closeAction();
    } catch (e: any) {
      Alert.alert('Lỗi', msgOf(e, 'Không cập nhật được trạng thái phòng'));
    } finally {
      setUpdating(false);
    }
  };

  const handleCheckOut = (room: Room) => {
    closeAction();
    Alert.alert(
      'Trả phòng',
      `Tạo biên bản trả phòng cho ${room.tenantName ?? 'khách'} — phòng ${room.code}?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Tiến hành check-out',
          onPress: () => navigation.navigate('InspectionDetail', {
            mode: 'create_check_out', tenantName: room.tenantName, roomCode: room.code,
          }),
        },
      ],
    );
  };

  const handleCheckIn = (room: Room) => {
    closeAction();
    Alert.alert(
      'Đón khách mới',
      `Tạo hợp đồng và đón khách mới cho phòng ${room.code}?`,
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Tiến hành', onPress: () => navigation.navigate('Onboarding') },
      ],
    );
  };

  const handleFinishMaintenance = (room: Room) => {
    Alert.alert(
      'Hoàn tất bảo trì',
      `Xác nhận phòng ${room.code} đã sửa xong và chuyển về trạng thái Trống?`,
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Xác nhận', onPress: () => applyStatus(room, 'available') },
      ],
    );
  };

  const handleReportMaintenance = (room: Room) => {
    closeAction();
    Alert.alert(
      'Báo bảo trì',
      `Tạo yêu cầu bảo trì và chuyển phòng ${room.code} sang trạng thái Đang bảo trì?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Tạo yêu cầu',
          onPress: () => {
            applyStatus(room, 'maintenance');
          },
        },
      ],
    );
  };

  // ──────────────────────────────────────────────────────────
  // PROPERTY SELECTION VIEW
  // ──────────────────────────────────────────────────────────
  if (!selectedPropId) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerSide}>
            <Text style={styles.headerBackText}>← Quay lại</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Quản lý phòng</Text>
          <View style={styles.headerSide} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshingProps}
              onRefresh={() => { setRefreshingProps(true); loadProperties(); }}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
        >
          <Text style={styles.pageTitle}>Chọn tòa nhà</Text>
          <Text style={styles.pageSubtitle}>Xem và vận hành các phòng trong tòa nhà được giao</Text>

          {loadingProps && !refreshingProps ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={[styles.emptyText, { marginTop: Spacing.md }]}>Đang tải dữ liệu...</Text>
            </View>
          ) : errorProps ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>⚠️</Text>
              <Text style={styles.emptyText}>{errorProps}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoadingProps(true); loadProperties(); }}>
                <Text style={styles.retryBtnText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          ) : properties.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🏢</Text>
              <Text style={styles.emptyText}>Chưa có tòa nhà nào được giao</Text>
            </View>
          ) : properties.map(p => {
            const pc = p.counts;
            return (
              <TouchableOpacity
                key={p.id}
                style={styles.propCard}
                onPress={() => selectProperty(p)}
                activeOpacity={0.85}
              >
                <View style={styles.propIcon}>
                  <Text style={{ fontSize: 26 }}>🏢</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.propName}>{p.name}</Text>
                  <Text style={styles.propAddress} numberOfLines={1}>📍 {p.address}</Text>
                  <View style={styles.propStats}>
                    <Text style={styles.propStat}>🚪 {pc.total} phòng</Text>
                    <Text style={[styles.propStat, { color: '#2563EB' }]}>🔵 {pc.occupied}</Text>
                    <Text style={[styles.propStat, { color: '#16A34A' }]}>🟢 {pc.available}</Text>
                    {pc.maintenance > 0 && (
                      <Text style={[styles.propStat, { color: '#D97706' }]}>🟡 {pc.maintenance}</Text>
                    )}
                    {pc.disabled > 0 && (
                      <Text style={[styles.propStat, { color: '#6B7280' }]}>⚫ {pc.disabled}</Text>
                    )}
                  </View>
                </View>
                <Text style={styles.propChevron}>›</Text>
              </TouchableOpacity>
            );
          })}

          <View style={styles.adminNote}>
            <Text style={styles.adminNoteIcon}>ℹ️</Text>
            <Text style={styles.adminNoteText}>
              Cấu trúc phòng và giá thuê được quản lý bởi Admin Web. Manager chỉ thực hiện vận hành.
            </Text>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ──────────────────────────────────────────────────────────
  // ROOM LIST VIEW
  // ──────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={backToProperties} style={styles.headerSide}>
          <Text style={styles.headerBackText}>← Quay lại</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{property?.name}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{property?.address}</Text>
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
                <RoomCard key={room.id} room={room} onAction={() => openAction(room)} />
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

                {/* Always-available ops */}
                <ActionItem icon="📋" label="Xem chi tiết phòng"       onPress={() => setActionView('detail')} />
                <ActionItem icon="🔄" label="Cập nhật trạng thái"      onPress={() => setActionView('status')} />
                <ActionItem icon="📦" label="Xem thiết bị trong phòng" onPress={() => { closeAction(); navigation.navigate('Equipment'); }} />
                <ActionItem icon="📜" label="Xem lịch sử thuê"         onPress={() => { closeAction(); navigation.navigate('BuildingContract', { propertyId: selectedPropId, roomCode: actionRoom.code }); }} />

                {/* Status-conditional ops */}
                {actionRoom.status === 'available' && (
                  <ActionItem
                    icon="🟢"
                    label="Đón khách mới / Gán khách thuê"
                    primary
                    onPress={() => handleCheckIn(actionRoom)}
                  />
                )}
                {actionRoom.status === 'occupied' && (
                  <ActionItem
                    icon="🚪"
                    label="Trả phòng (Check-out)"
                    sublabel="Lập biên bản hiện trạng và kết thúc hợp đồng"
                    onPress={() => handleCheckOut(actionRoom)}
                  />
                )}
                {actionRoom.status === 'maintenance' && (
                  <ActionItem
                    icon="✅"
                    label="Hoàn tất bảo trì → Chuyển về Trống"
                    primary
                    onPress={() => handleFinishMaintenance(actionRoom)}
                  />
                )}
                {actionRoom.status !== 'disabled' && actionRoom.status !== 'maintenance' && (
                  <ActionItem
                    icon="🔧"
                    label="Báo bảo trì"
                    sublabel="Tạo yêu cầu và chuyển phòng sang Đang bảo trì"
                    onPress={() => handleReportMaintenance(actionRoom)}
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

                <TouchableOpacity style={styles.sheetCancel} onPress={closeAction}>
                  <Text style={styles.sheetCancelText}>Đóng</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            {/* ── STATUS VIEW ── */}
            {actionRoom && actionView === 'status' && (
              <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                <TouchableOpacity style={styles.sheetBackRow} onPress={() => setActionView('menu')}>
                  <Text style={styles.sheetBackText}>‹ Quay lại</Text>
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
                  <Text style={styles.sheetBackText}>‹ Quay lại</Text>
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
                      <Text style={styles.detailTenantPhone}>{actionRoom.tenantPhone}</Text>
                    )}
                  </View>
                )}

                <Text style={styles.detailSectionLabel}>Thông tin phòng (chỉ đọc)</Text>
                <View style={styles.detailTable}>
                  {[
                    { label: 'Giá thuê',   value: fmt(actionRoom.rentPrice) + '/tháng' },
                    { label: 'Tiền cọc',   value: fmt(actionRoom.deposit) },
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
  pageTitle:    { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  pageSubtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.lg },

  propCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  propIcon:    { width: 52, height: 52, borderRadius: BorderRadius.lg, backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  propName:    { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  propAddress: { fontSize: 12, color: Colors.textSecondary, marginBottom: Spacing.sm },
  propStats:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  propStat:    { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  propChevron: { fontSize: 22, color: Colors.textMuted, paddingLeft: 4 },

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
