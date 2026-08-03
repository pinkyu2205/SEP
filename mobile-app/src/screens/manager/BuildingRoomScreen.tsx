import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { showAlert } from '@/utils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { getPropertyById, getBuildingOps, BuildingRoom, RoomStatus } from '@/data/managedProperties';
import {
  getInspectionsByRoom,
  getInspectionStatusLabel,
  getInspectionTypeLabel,
  RoomInspection,
} from '@/data/roomInspections';

// Extend status to include 'disabled' locally (BuildingRoomScreen-only extension)
type ExtendedStatus = RoomStatus | 'disabled';

const STATUS_META: Record<ExtendedStatus, { label: string; color: string; bg: string; dot: string }> = {
  occupied:    { label: 'Đang thuê',        color: '#2563EB', bg: '#EFF6FF', dot: '#3B82F6' },
  available:   { label: 'Trống',            color: '#16A34A', bg: '#F0FDF4', dot: '#16A34A' },
  maintenance: { label: 'Đang bảo trì',    color: '#D97706', bg: '#FFFBEB', dot: '#F59E0B' },
  disabled:    { label: 'Ngưng khai thác', color: '#6B7280', bg: '#F3F4F6', dot: '#9CA3AF' },
};

const VALID_TRANSITIONS: Record<ExtendedStatus, { status: ExtendedStatus; desc: string }[]> = {
  available:   [
    { status: 'maintenance', desc: 'Đưa phòng vào bảo trì / sửa chữa' },
    { status: 'disabled',    desc: 'Tắt khai thác, không nhận khách và không tạo hóa đơn' },
  ],
  occupied:    [
    { status: 'maintenance', desc: 'Đưa phòng vào bảo trì (sau khi khách đồng ý)' },
    { status: 'disabled',    desc: 'Tắt khai thác hoàn toàn' },
  ],
  maintenance: [
    { status: 'available', desc: 'Bảo trì hoàn tất — phòng sẵn sàng cho thuê' },
    { status: 'disabled',  desc: 'Tắt khai thác hoàn toàn' },
  ],
  disabled:    [
    { status: 'available', desc: 'Kích hoạt lại — phòng sẵn sàng cho thuê' },
  ],
};

// Rooms may have an extended status not in the original type — override status locally.
// Dùng Omit thay vì `extends` vì ExtendedStatus rộng hơn RoomStatus (không hợp lệ khi extends).
type RoomWithExt = Omit<BuildingRoom, 'status'> & { status: ExtendedStatus };

const FILTERS: { id: 'all' | ExtendedStatus; label: string }[] = [
  { id: 'all',         label: 'Tất cả' },
  { id: 'occupied',    label: 'Đang thuê' },
  { id: 'available',   label: 'Trống' },
  { id: 'maintenance', label: 'Bảo trì' },
  { id: 'disabled',    label: 'Ngưng khai thác' },
];

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

export const BuildingRoomScreen: React.FC<any> = ({ navigation, route }) => {
  const propertyId: string = route?.params?.propertyId;
  const prop = getPropertyById(propertyId);
  const [rooms, setRooms] = useState<RoomWithExt[]>(
    () => getBuildingOps(propertyId).rooms as RoomWithExt[],
  );
  const [filter, setFilter] = useState<'all' | ExtendedStatus>('all');
  const [tab, setTab]       = useState<'rooms' | 'inspections'>('rooms');
  const [actionRoom, setActionRoom]   = useState<RoomWithExt | null>(null);
  const [actionView, setActionView]   = useState<'menu' | 'status'>('menu');

  const counts = useMemo(() => ({
    occupied:    rooms.filter(r => r.status === 'occupied').length,
    available:   rooms.filter(r => r.status === 'available').length,
    maintenance: rooms.filter(r => r.status === 'maintenance').length,
    disabled:    rooms.filter(r => r.status === 'disabled').length,
  }), [rooms]);

  const filtered = filter === 'all' ? rooms : rooms.filter(r => r.status === filter);
  const floors   = useMemo(
    () => Array.from(new Set(filtered.map(r => r.floor))).sort((a, b) => a - b),
    [filtered],
  );
  const inspectionHistory = useMemo(
    () => getInspectionsByRoom(propertyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [propertyId],
  );

  const openAction = (room: RoomWithExt) => { setActionRoom(room); setActionView('menu'); };
  const closeAction = () => { setActionRoom(null); setActionView('menu'); };

  const applyStatus = (roomId: string, newStatus: ExtendedStatus) => {
    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, status: newStatus } : r));
    closeAction();
  };

  const handleCheckOut = (r: RoomWithExt) => {
    closeAction();
    const latestInspection = getInspectionsByRoom(propertyId, r.code)[0];
    showAlert('Trả phòng', `Lập biên bản check-out phòng ${r.code} (${r.tenantName})?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Chụp hiện trạng',
        onPress: () => navigation.navigate('InspectionDetail', {
          mode: 'create_check_out',
          contractId: latestInspection?.contractId,
          tenantId: latestInspection?.tenantId,
          tenantName: r.tenantName,
          propertyId,
          propertyName: prop?.name,
          roomId: r.id,
          roomCode: r.code,
        }),
      },
    ]);
  };

  const handleCheckIn = (r: RoomWithExt) => {
    closeAction();
    showAlert('Đón khách', `Tạo check-in cho phòng ${r.code}?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Đón khách', onPress: () => navigation.navigate('OnboardingV2') },
    ]);
  };

  const handleFinishMaintenance = (r: RoomWithExt) => {
    showAlert('Hoàn tất bảo trì', `Đưa phòng ${r.code} về trạng thái Trống?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xác nhận', onPress: () => applyStatus(r.id, 'available') },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>Phòng</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{prop?.name || ''}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {(['rooms', 'inspections'] as const).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'rooms' ? 'Phòng' : 'Lịch sử hiện trạng'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'rooms' && (
        <>
          {/* Summary */}
          <View style={styles.summaryRow}>
            <View style={[styles.summaryBox, { backgroundColor: '#EFF6FF' }]}>
              <Text style={[styles.summaryNum, { color: '#2563EB' }]}>{counts.occupied}</Text>
              <Text style={styles.summaryLabel}>Đang thuê</Text>
            </View>
            <View style={[styles.summaryBox, { backgroundColor: '#F0FDF4' }]}>
              <Text style={[styles.summaryNum, { color: '#16A34A' }]}>{counts.available}</Text>
              <Text style={styles.summaryLabel}>Trống</Text>
            </View>
            <View style={[styles.summaryBox, { backgroundColor: '#FFFBEB' }]}>
              <Text style={[styles.summaryNum, { color: '#D97706' }]}>{counts.maintenance}</Text>
              <Text style={styles.summaryLabel}>Bảo trì</Text>
            </View>
            {counts.disabled > 0 && (
              <View style={[styles.summaryBox, { backgroundColor: '#F3F4F6' }]}>
                <Text style={[styles.summaryNum, { color: '#6B7280' }]}>{counts.disabled}</Text>
                <Text style={styles.summaryLabel}>Ngưng</Text>
              </View>
            )}
          </View>

          {/* Filters */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filterRow}
            contentContainerStyle={styles.filterContent}
          >
            {FILTERS.map(f => (
              <TouchableOpacity
                key={f.id}
                style={[styles.chip, filter === f.id && styles.chipActive]}
                onPress={() => setFilter(f.id)}
              >
                <Text style={[styles.chipText, filter === f.id && styles.chipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {tab === 'inspections' ? (
          inspectionHistory.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Chưa có biên bản hiện trạng.</Text>
              <Text style={styles.emptyText}>Lịch sử ở đây chỉ là quick-view; dữ liệu gốc vẫn thuộc về hợp đồng.</Text>
            </View>
          ) : (
            inspectionHistory.map(inspection => (
              <RoomInspectionHistoryCard
                key={inspection.id}
                inspection={inspection}
                onPress={() => navigation.navigate('InspectionDetail', { inspectionId: inspection.id })}
              />
            ))
          )
        ) : floors.length === 0 ? (
          <Text style={styles.empty}>Không có phòng nào</Text>
        ) : (
          floors.map(floor => (
            <View key={floor} style={styles.floorGroup}>
              <Text style={styles.floorTitle}>Tầng {floor}</Text>
              {filtered.filter(r => r.floor === floor).map(r => {
                const st = STATUS_META[r.status];
                const isDisabled = r.status === 'disabled';
                return (
                  <View key={r.id} style={[styles.roomCard, isDisabled && styles.roomCardDisabled]}>
                    <View style={[styles.statusDot, { backgroundColor: st.dot }]} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.roomTitleRow}>
                        <Text style={[styles.roomCode, isDisabled && { color: Colors.textMuted }]}>
                          {r.code}
                        </Text>
                        <View style={[styles.badge, { backgroundColor: st.bg }]}>
                          <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
                        </View>
                      </View>
                      <Text style={[styles.roomMeta, isDisabled && { opacity: 0.6 }]}>
                        {r.area}m² · {fmt(r.rentPrice)}/th
                        {r.tenantName ? ` · ${r.tenantName}` : ''}
                      </Text>
                      {isDisabled && (
                        <Text style={styles.disabledNote}>⛔ Ngưng khai thác</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.menuBtn}
                      onPress={() => openAction(r)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.menuDots}>•••</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ))
        )}
        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ── BOTTOM SHEET ── */}
      <Modal visible={actionRoom !== null} transparent animationType="slide">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={closeAction}>
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <View style={styles.sheetHandle} />

            {/* MENU */}
            {actionRoom && actionView === 'menu' && (
              <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                <View style={styles.sheetHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetCode}>{actionRoom.code}</Text>
                    <Text style={styles.sheetMeta}>{actionRoom.area}m² · {fmt(actionRoom.rentPrice)}/tháng</Text>
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

                <SheetAction icon="🔄" label="Cập nhật trạng thái"       onPress={() => setActionView('status')} />
                <SheetAction icon="📋" label="Xem chi tiết / hợp đồng"    onPress={() => { closeAction(); navigation.navigate('BuildingContract', { propertyId, roomCode: actionRoom.code }); }} />
                <SheetAction icon="📦" label="Xem thiết bị trong phòng"   onPress={() => { closeAction(); navigation.navigate('Equipment'); }} />
                <SheetAction icon="📜" label="Xem lịch sử hiện trạng"     onPress={() => { closeAction(); setTab('inspections'); }} />

                {actionRoom.status === 'available' && (
                  <SheetAction icon="🟢" label="Đón khách mới / Gán khách thuê" primary onPress={() => handleCheckIn(actionRoom)} />
                )}
                {actionRoom.status === 'occupied' && (
                  <SheetAction icon="🚪" label="Trả phòng (Check-out)" sublabel="Lập biên bản hiện trạng" onPress={() => handleCheckOut(actionRoom)} />
                )}
                {actionRoom.status === 'maintenance' && (
                  <SheetAction icon="✅" label="Hoàn tất bảo trì → Về Trống" primary onPress={() => handleFinishMaintenance(actionRoom)} />
                )}
                {actionRoom.status === 'disabled' && (
                  <SheetAction icon="🟢" label="Kích hoạt lại phòng" primary onPress={() => applyStatus(actionRoom.id, 'available')} />
                )}

                <TouchableOpacity style={styles.sheetCancel} onPress={closeAction}>
                  <Text style={styles.sheetCancelText}>Đóng</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            {/* STATUS */}
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
                      ⚠️ Để phòng về Trống, cần thực hiện Trả phòng (Check-out) qua quy trình biên bản hiện trạng.
                    </Text>
                  </View>
                )}

                {VALID_TRANSITIONS[actionRoom.status].map(t => {
                  const meta = STATUS_META[t.status];
                  return (
                    <TouchableOpacity
                      key={t.status}
                      style={styles.statusOption}
                      onPress={() => applyStatus(actionRoom.id, t.status)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.statusDotLg, { backgroundColor: meta.dot }]} />
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
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

// ======================== SUB-COMPONENTS ========================
const SheetAction: React.FC<{
  icon: string; label: string; sublabel?: string;
  onPress: () => void; primary?: boolean;
}> = ({ icon, label, sublabel, onPress, primary }) => (
  <TouchableOpacity
    style={[shSt.item, primary && shSt.itemPrimary]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <Text style={shSt.icon}>{icon}</Text>
    <View style={{ flex: 1 }}>
      <Text style={[shSt.label, primary && shSt.labelPrimary]}>{label}</Text>
      {sublabel ? <Text style={shSt.sublabel}>{sublabel}</Text> : null}
    </View>
    <Text style={shSt.chevron}>›</Text>
  </TouchableOpacity>
);
const shSt = StyleSheet.create({
  item:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  itemPrimary: { backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md, borderBottomWidth: 0, marginBottom: 2, paddingHorizontal: Spacing.sm },
  icon:        { fontSize: 20, width: 34 },
  label:       { fontSize: 15, color: Colors.textPrimary, fontWeight: '500' },
  labelPrimary:{ color: Colors.primary, fontWeight: '700' },
  sublabel:    { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  chevron:     { fontSize: 18, color: Colors.textMuted },
});

const RoomInspectionHistoryCard = ({
  inspection, onPress,
}: { inspection: RoomInspection; onPress: () => void }) => (
  <TouchableOpacity style={styles.historyCard} onPress={onPress} activeOpacity={0.82}>
    <View style={styles.historyRail}>
      <View style={styles.historyDot} />
      <View style={styles.historyLine} />
    </View>
    <View style={styles.historyBody}>
      <View style={styles.historyTop}>
        <Text style={styles.historyTitle}>
          {getInspectionTypeLabel(inspection.inspectionType)} · {inspection.roomCode || 'Nhà nguyên căn'}
        </Text>
        <Text style={styles.historyBadge}>{getInspectionStatusLabel(inspection.status)}</Text>
      </View>
      <Text style={styles.historyMeta}>{inspection.tenantName} · HĐ {inspection.contractId}</Text>
      <Text style={styles.historyMeta}>{inspection.createdAt} · {inspection.images.length} ảnh · {inspection.createdBy}</Text>
      <Text style={styles.historyNote} numberOfLines={2}>{inspection.notes || 'Chưa có ghi chú hiện trạng.'}</Text>
    </View>
  </TouchableOpacity>
);

// ======================== STYLES ========================
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, ...Shadow.sm,
  },
  backText:     { color: Colors.primary, fontWeight: '600', fontSize: 15, width: 60 },
  headerCenter: { flex: 1, alignItems: 'center' },
  title:        { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  subtitle:     { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },

  tabRow: {
    flexDirection: 'row', marginHorizontal: Spacing.lg, marginTop: Spacing.md,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: 4,
    borderWidth: 1, borderColor: Colors.border,
  },
  tabBtn:       { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: BorderRadius.md },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabText:      { fontSize: 12, fontWeight: '800', color: Colors.textSecondary },
  tabTextActive:{ color: Colors.white },

  summaryRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  summaryBox:  { flex: 1, borderRadius: BorderRadius.lg, padding: Spacing.sm, alignItems: 'center' },
  summaryNum:  { fontSize: 18, fontWeight: '800' },
  summaryLabel:{ fontSize: 10, color: Colors.textSecondary, marginTop: 2 },

  filterRow:    { flexGrow: 0, marginTop: Spacing.sm },
  filterContent:{ paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  chip:         { height: 30, justifyContent: 'center', paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  chipActive:   { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText:     { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive:{ color: Colors.white },

  scroll:     { padding: Spacing.lg },
  empty:      { textAlign: 'center', color: Colors.textMuted, paddingVertical: Spacing.xl },
  emptyCard:  { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  emptyTitle: { fontSize: 15, color: Colors.textPrimary, fontWeight: '900' },
  emptyText:  { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 19 },

  floorGroup: { marginBottom: Spacing.md },
  floorTitle: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: Spacing.sm },

  roomCard:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm, borderWidth: 1, borderColor: Colors.border },
  roomCardDisabled: { backgroundColor: '#F9FAFB', borderColor: '#D1D5DB' },
  statusDot:        { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  roomTitleRow:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  roomCode:         { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  badge:            { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.full },
  badgeText:        { fontSize: 10, fontWeight: '700' },
  roomMeta:         { fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
  disabledNote:     { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  menuBtn:          { padding: 6 },
  menuDots:         { fontSize: 15, color: Colors.textMuted, letterSpacing: 1, fontWeight: '800' },

  // History tab
  historyCard:  { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  historyRail:  { alignItems: 'center', marginRight: Spacing.md },
  historyDot:   { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.primary, marginTop: 4 },
  historyLine:  { flex: 1, width: 2, backgroundColor: '#E0E7FF', marginTop: 4 },
  historyBody:  { flex: 1 },
  historyTop:   { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  historyTitle: { flex: 1, fontSize: 14, fontWeight: '900', color: Colors.textPrimary },
  historyBadge: { fontSize: 10, fontWeight: '900', color: Colors.primary, backgroundColor: Colors.primaryBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  historyMeta:  { fontSize: 12, color: Colors.textSecondary, marginTop: 3, fontWeight: '600' },
  historyNote:  { fontSize: 12, color: Colors.textMuted, marginTop: 5, lineHeight: 17 },

  // Bottom sheet
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: 36, maxHeight: '80%' },
  sheetHandle:    { width: 40, height: 4, backgroundColor: Colors.divider, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  sheetHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  sheetCode:      { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  sheetMeta:      { fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
  sheetTenant:    { fontSize: 13, fontWeight: '600', color: Colors.primary, marginTop: 4 },
  sheetBadge:     { paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full },
  sheetBadgeText: { fontSize: 11, fontWeight: '700' },
  sheetDivider:   { height: 1, backgroundColor: Colors.divider, marginBottom: Spacing.sm },
  sheetBackRow:   { marginBottom: Spacing.md },
  sheetBackText:  { fontSize: 14, fontWeight: '600', color: Colors.primary },
  sheetCancel:    { paddingVertical: 14, alignItems: 'center', marginTop: Spacing.sm },
  sheetCancelText:{ fontSize: 15, fontWeight: '600', color: Colors.textSecondary },

  // Status sub-view
  statusTitle:       { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  statusSub:         { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.md },
  statusWarning:     { backgroundColor: '#FEF9C3', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: '#FDE68A' },
  statusWarningText: { fontSize: 13, color: '#92400E', lineHeight: 20 },
  statusOption:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  statusDotLg:       { width: 12, height: 12, borderRadius: 6 },
  statusOptionLabel: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  statusOptionDesc:  { fontSize: 12, color: Colors.textMuted, marginTop: 2, lineHeight: 17 },
});
