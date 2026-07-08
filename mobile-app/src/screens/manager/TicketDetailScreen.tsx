import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, TextInput, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import {
  useTickets, maintenanceStore, MaintenanceTicket,
  TicketStatus, PhotoEvidence, CostPaidBy, TimelineEntry, DamageCause,
} from '@/store/maintenanceStore';
import { realMaintenanceService } from '@/services/shared/maintenanceService';
import { dtoToTicket } from '@/services/shared/maintenanceMappers';
import {
  MAINTENANCE_STATUS_META, MAINTENANCE_STATUS_FLOW, StatusMeta,
  MAINTENANCE_TECHNICIANS, MAINTENANCE_COST_APPROVAL_THRESHOLD,
  EQUIPMENT_REPLACE_SUGGEST_COUNT,
} from '@/constants/maintenance';

// ── Config ──────────────────────────────────────────────────────────────────

// Luồng cải thiện. 'accepted' (legacy) ánh xạ về 'acknowledged'.
const STATUS_CONFIG: Record<TicketStatus, StatusMeta> = {
  ...MAINTENANCE_STATUS_META,
  accepted: { ...MAINTENANCE_STATUS_META.acknowledged },
};

const PRIORITY_CONFIG = {
  urgent: { label: '🚨 Khẩn cấp',  color: '#EF4444', bg: '#FEF2F2' },
  high:   { label: '🔴 Cao',        color: '#F97316', bg: '#FFF7ED' },
  medium: { label: '🟡 Trung bình', color: '#F59E0B', bg: '#FFFBEB' },
  low:    { label: '🟢 Thấp',       color: '#10B981', bg: '#F0FDF4' },
} as const;

const CATEGORY_CONFIG = {
  electrical: { label: 'Điện',     icon: '⚡' },
  plumbing:   { label: 'Nước',     icon: '🚰' },
  furniture:  { label: 'Nội thất', icon: '🪑' },
  appliance:  { label: 'Thiết bị', icon: '📺' },
  other:      { label: 'Khác',     icon: '🔧' },
} as const;

const STATUS_FLOW = MAINTENANCE_STATUS_FLOW as TicketStatus[];

const now = () => new Date().toLocaleString('vi-VN');
const today = () => new Date().toISOString().split('T')[0];
const mkEntry = (status: TicketStatus, note: string): TimelineEntry =>
  ({ status, note, updatedBy: 'Manager', updatedAt: now() });

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

// Lịch hẹn sửa nhanh (không cần date-picker native).
const toISODate = (offsetDays: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
};
const SCHEDULE_OPTIONS: { label: string; days: number }[] = [
  { label: 'Hôm nay',      days: 0 },
  { label: 'Ngày mai',     days: 1 },
  { label: 'Trong 3 ngày', days: 3 },
  { label: 'Trong 1 tuần', days: 7 },
];
const fmtSchedule = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('vi-VN');
};

// ── Photo Evidence Row ───────────────────────────────────────────────────────

const PhotoEvidenceRow: React.FC<{
  type: 'before' | 'after';
  photos: PhotoEvidence[];
  onAdd: () => void;
  disabled?: boolean;
}> = ({ type, photos, onAdd, disabled }) => {
  const filtered = photos.filter(p => p.type === type);
  const color    = type === 'before' ? Colors.warning : Colors.success;
  return (
    <View style={phs.container}>
      <View style={phs.header}>
        <Text style={phs.label}>
          {type === 'before' ? '📸 Ảnh trước sửa chữa' : '🖼️ Ảnh sau sửa chữa'}
        </Text>
        {!disabled && (
          <TouchableOpacity style={[phs.addBtn, { borderColor: color }]} onPress={onAdd}>
            <Text style={[phs.addBtnText, { color }]}>+ Thêm ảnh</Text>
          </TouchableOpacity>
        )}
      </View>
      {filtered.length === 0 ? (
        <View style={[phs.emptyBox, { borderColor: color + '40' }]}>
          <Text style={phs.emptyIcon}>{type === 'before' ? '📷' : '🖼️'}</Text>
          <Text style={phs.emptyText}>Chưa có ảnh {type === 'before' ? 'trước' : 'sau'}</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={phs.scrollRow}>
          {filtered.map(photo => (
            <View key={photo.id} style={[phs.photoCard, { borderColor: color + '50' }]}>
              {photo.uri ? (
                <Image source={{ uri: photo.uri }} style={[phs.photoPlaceholder, { width: '100%' }]} />
              ) : (
                <View style={[phs.photoPlaceholder, { backgroundColor: color + '15' }]}>
                  <Text style={phs.photoPlaceholderIcon}>{type === 'before' ? '📸' : '🖼️'}</Text>
                </View>
              )}
              {photo.caption && <Text style={phs.photoCaption} numberOfLines={1}>{photo.caption}</Text>}
              <Text style={phs.photoDate}>{photo.capturedAt.split(' ')[0]}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const phs = StyleSheet.create({
  container:            { marginBottom: Spacing.md },
  header:               { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  label:                { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  addBtn:               { borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 3 },
  addBtnText:           { fontSize: 11, fontWeight: '700' },
  emptyBox:             { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderStyle: 'dashed', borderRadius: BorderRadius.md, padding: Spacing.md },
  emptyIcon:            { fontSize: 20 },
  emptyText:            { fontSize: 13, color: Colors.textMuted },
  scrollRow:            { flexGrow: 0 },
  photoCard:            { width: 100, marginRight: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1, overflow: 'hidden' },
  photoPlaceholder:     { height: 72, alignItems: 'center', justifyContent: 'center' },
  photoPlaceholderIcon: { fontSize: 28 },
  photoCaption:         { fontSize: 10, color: Colors.textSecondary, padding: 4, lineHeight: 13 },
  photoDate:            { fontSize: 9, color: Colors.textMuted, paddingHorizontal: 4, paddingBottom: 4 },
});

// ── Ticket Timeline ──────────────────────────────────────────────────────────

const TicketTimeline: React.FC<{ timeline: TimelineEntry[]; currentStatus: TicketStatus }> = ({ timeline, currentStatus }) => (
  <View style={tls.container}>
    {STATUS_FLOW.map((status, i) => {
      const currentStep = STATUS_CONFIG[currentStatus].step;
      const isCompleted = STATUS_CONFIG[status].step < currentStep;
      const isActive    = status === currentStatus;
      const entry       = timeline.find(t => t.status === status);
      return (
        <View key={status} style={tls.step}>
          <View style={tls.stepLeft}>
            <View style={[tls.dot, isCompleted && tls.dotCompleted, isActive && tls.dotActive]}>
              {isCompleted && <Text style={tls.dotCheck}>✓</Text>}
              {isActive    && <Text style={tls.dotActiveText}>{STATUS_CONFIG[status].icon}</Text>}
              {!isCompleted && !isActive && <Text style={tls.dotNum}>{i + 1}</Text>}
            </View>
            {i < STATUS_FLOW.length - 1 && (
              <View style={[tls.line, isCompleted && tls.lineCompleted]} />
            )}
          </View>
          <View style={tls.stepBody}>
            <Text style={[tls.stepLabel, isActive && tls.stepLabelActive, isCompleted && tls.stepLabelDone]}>
              {STATUS_CONFIG[status].label}
            </Text>
            {entry && (
              <>
                <Text style={tls.stepNote}>{entry.note}</Text>
                <Text style={tls.stepMeta}>{entry.updatedBy} · {entry.updatedAt}</Text>
              </>
            )}
          </View>
        </View>
      );
    })}
  </View>
);

const tls = StyleSheet.create({
  container:       { paddingVertical: Spacing.sm },
  step:            { flexDirection: 'row', gap: Spacing.md, minHeight: 60 },
  stepLeft:        { alignItems: 'center', width: 32 },
  dot:             { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  dotCompleted:    { backgroundColor: Colors.success, borderColor: Colors.success },
  dotActive:       { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dotCheck:        { fontSize: 14, color: Colors.white, fontWeight: '700' },
  dotActiveText:   { fontSize: 14 },
  dotNum:          { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  line:            { width: 2, flex: 1, backgroundColor: Colors.border, marginVertical: 2 },
  lineCompleted:   { backgroundColor: Colors.success },
  stepBody:        { flex: 1, paddingBottom: Spacing.lg },
  stepLabel:       { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  stepLabelActive: { color: Colors.primary, fontWeight: '700' },
  stepLabelDone:   { color: Colors.success },
  stepNote:        { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  stepMeta:        { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
});

// ── Screen ──────────────────────────────────────────────────────────────────

export const TicketDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route      = useRoute<any>();
  const { ticketId } = route.params as { ticketId: string };
  const idNum = Number(ticketId);
  const isRealId = Number.isFinite(idNum) && idNum > 0;

  const allTickets = useTickets();
  const storeTicket = allTickets.find(t => t.id === ticketId);
  const [realTicket, setRealTicket] = useState<MaintenanceTicket | undefined>(undefined);
  const [realEquipmentId, setRealEquipmentId] = useState<number | undefined>(undefined);
  const isReal = !!realTicket;
  const ticket = realTicket ?? storeTicket;

  // Lấy chi tiết thật từ BE; lỗi → giữ ticket mock từ store.
  useEffect(() => {
    if (!isRealId) return;
    let active = true;
    realMaintenanceService.getDetail(idNum)
      .then(dto => { if (active) { setRealTicket(dtoToTicket(dto)); setRealEquipmentId(dto.equipmentId); } })
      .catch(() => { /* giữ store mock */ });
    return () => { active = false; };
  }, [idNum, isRealId]);

  const refreshReal = async () => {
    try {
      const dto = await realMaintenanceService.getDetail(idNum);
      setRealTicket(dtoToTicket(dto));
      setRealEquipmentId(dto.equipmentId);
    } catch { /* bỏ qua */ }
  };

  const [assignInput,   setAssignInput]   = useState(ticket?.assignedTo || '');
  const [costInput,     setCostInput]     = useState(
    ticket?.repairCost !== undefined ? String(ticket.repairCost) : '',
  );
  const [costPaidBy,    setCostPaidBy]    = useState<CostPaidBy>(ticket?.costPaidBy || 'host');
  const [cause,         setCause]         = useState<DamageCause>(ticket?.cause || 'wear');
  const [noteInput,     setNoteInput]     = useState('');
  const [showCostInput, setShowCostInput] = useState(false);
  const [photos,        setPhotos]        = useState<PhotoEvidence[]>(ticket?.photos || []);
  const [scheduleSlots, setScheduleSlots] = useState<string[]>(ticket?.scheduledSlots || []);
  const [holdReason,    setHoldReason]    = useState('');
  const [technicianId,  setTechnicianId]  = useState<string>(ticket?.technicianId || '');

  if (!ticket) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Text style={s.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Không tìm thấy ticket</Text>
        </View>
      </SafeAreaView>
    );
  }

  const richMode    = !isReal;   // rich state machine chỉ chạy trên store/mock
  const cfg         = STATUS_CONFIG[ticket.status];
  const priorityCfg = PRIORITY_CONFIG[ticket.priority];
  const catCfg      = CATEGORY_CONFIG[ticket.category];
  const isTerminal  = ['confirmed', 'resolved', 'cancelled'].includes(ticket.status);
  const isEditMode  = !isTerminal;
  const hasPhoto    = (type: 'before' | 'after') => photos.some(p => p.type === type);

  // Cập nhật store + append timeline (đường mock/rich).
  const patchStore = (updates: Partial<MaintenanceTicket>, entry: TimelineEntry) =>
    maintenanceStore.updateTicket(ticket.id, {
      ...updates,
      photos,
      timeline: [...ticket.timeline, entry],
      updatedAt: today(),
    });

  const selectedTech = MAINTENANCE_TECHNICIANS.find(t => t.id === technicianId);

  const handleAddPhoto = async (type: 'before' | 'after') => {
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.6 });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setPhotos(prev => [...prev, {
      id: `ph-${Date.now()}`, type, uri,
      caption:    type === 'before' ? 'Ảnh hiện trạng' : 'Ảnh sau sửa chữa',
      capturedAt: now(),
    }]);
    // Ticket thật → upload ảnh lên BE (POST /{id}/photos). Mock → chỉ lưu cục bộ.
    if (isReal) {
      try {
        await realMaintenanceService.uploadPhotos(idNum, [uri], type === 'before' ? 'BEFORE' : 'AFTER');
        await refreshReal();
      } catch {
        Alert.alert('Lỗi tải ảnh', 'Không tải được ảnh lên máy chủ. Ảnh vẫn được lưu tạm trên máy.');
      }
    }
  };

  // ── Đường real-API (BE 3 trạng thái) ──────────────────────────────
  const handleRealStart = async () => {
    const note = noteInput.trim() || 'Đã tiếp nhận & bắt đầu xử lý';
    try {
      await realMaintenanceService.updateStatus(idNum, 'IN_PROGRESS', note, scheduleSlots[0] || undefined);
      await refreshReal();
      setNoteInput('');
    } catch { Alert.alert('Lỗi', 'Không thể cập nhật trạng thái. Vui lòng thử lại.'); }
  };
  const handleRealResolve = async (cost: number, note: string) => {
    try {
      await realMaintenanceService.resolve(idNum, {
        repairCost: cost, resolutionNote: note,
        costPaidBy: costPaidBy === 'host' ? 'HOST' : 'TENANT',
        cause: cause === 'misuse' ? 'MISUSE' : 'WEAR',  // MISUSE → BE trừ cọc lúc checkout
        equipmentId: realEquipmentId,   // BE bật cờ thay mới nếu chi phí > 1tr
      });
      await refreshReal();
      setShowCostInput(false);
      Alert.alert('✅ Hoàn tất!', `Ticket ${ticket.ticketCode} đã đóng.\nChi phí: ${fmt(cost)}`);
    } catch { Alert.alert('Lỗi', 'Không thể lưu kết quả. Vui lòng thử lại.'); }
  };

  // ── Đường rich (mock/store) ───────────────────────────────────────
  const handleAcknowledge = () => {
    const techNote = selectedTech ? ` · giao ${selectedTech.name}` : '';
    patchStore(
      { status: 'acknowledged', acknowledgedAt: today(),
        assignedTo: selectedTech ? `${selectedTech.name} (${selectedTech.phone})` : assignInput || ticket.assignedTo,
        technicianId: technicianId || undefined },
      mkEntry('acknowledged', `Đã tiếp nhận yêu cầu${techNote}`),
    );
  };
  const handleProposeSchedule = () => {
    if (scheduleSlots.length === 0) { Alert.alert('Chọn lịch', 'Hãy chọn ít nhất 1 khung thời gian đề xuất.'); return; }
    patchStore(
      { status: 'scheduled', scheduledSlots: scheduleSlots, estimatedDate: fmtSchedule(scheduleSlots[0]) },
      mkEntry('scheduled', `Đề xuất lịch: ${scheduleSlots.map(fmtSchedule).join(', ')} — chờ khách xác nhận`),
    );
  };
  const handleStart = () => {
    if (!hasPhoto('before')) { Alert.alert('Thiếu ảnh', 'Cần chụp ít nhất 1 ảnh hiện trạng (trước sửa) để bắt đầu.'); return; }
    const note = noteInput.trim() || 'Bắt đầu thi công sửa chữa';
    patchStore({ status: 'in_progress' }, mkEntry('in_progress', note));
    setNoteInput('');
  };
  const handleHold = () => {
    if (!holdReason.trim()) { Alert.alert('Lý do', 'Nhập lý do tạm dừng (vd: chờ phụ tùng).'); return; }
    patchStore({ status: 'on_hold', onHoldReason: holdReason.trim() }, mkEntry('on_hold', `Tạm dừng: ${holdReason.trim()}`));
    setHoldReason('');
  };
  const handleResume = () =>
    patchStore({ status: 'in_progress', onHoldReason: undefined }, mkEntry('in_progress', 'Tiếp tục xử lý'));

  const handleSubmitDone = () => {
    if (!hasPhoto('after')) { Alert.alert('Thiếu ảnh', 'Cần chụp ảnh sau sửa chữa để hoàn tất.'); return; }
    const cost = parseInt(costInput.replace(/\D/g, ''), 10);
    if (isNaN(cost)) { Alert.alert('Lỗi', 'Nhập chi phí sửa chữa (0 nếu miễn phí).'); return; }
    const payerLabel = costPaidBy === 'host' ? 'chủ nhà trả' : 'khách thuê trả';
    const note = noteInput.trim() || `Đã sửa xong. Chi phí: ${fmt(cost)} — ${payerLabel}`;

    // Cổng duyệt chi phí: vượt ngưỡng → chờ Admin duyệt.
    if (cost > MAINTENANCE_COST_APPROVAL_THRESHOLD) {
      patchStore(
        { status: 'pending_approval', approvalStatus: 'pending', repairCost: cost, costPaidBy, cause },
        mkEntry('pending_approval', `Chi phí ${fmt(cost)} vượt ngưỡng — chờ Admin duyệt`),
      );
      setShowCostInput(false);
      Alert.alert('🧾 Chờ duyệt', `Chi phí ${fmt(cost)} vượt ngưỡng ${fmt(MAINTENANCE_COST_APPROVAL_THRESHOLD)}, cần Admin duyệt trước khi đóng.`);
      return;
    }
    patchStore(
      { status: 'done', doneAt: today(), repairCost: cost, costPaidBy, cause },
      mkEntry('done', note),
    );
    setShowCostInput(false);
    Alert.alert('🛠 Đã sửa xong', 'Đã gửi cho khách nghiệm thu. Ticket sẽ đóng khi khách xác nhận.');
  };

  const handleApprove = () =>
    patchStore({ status: 'done', approvalStatus: 'approved', doneAt: today() },
      mkEntry('done', 'Admin đã duyệt chi phí — chờ khách nghiệm thu'));
  const handleReject = () =>
    patchStore({ status: 'in_progress', approvalStatus: 'rejected' },
      mkEntry('in_progress', 'Admin từ chối chi phí — xử lý lại'));

  const handleCancel = () => {
    Alert.alert('Hủy yêu cầu?', 'Bạn có chắc muốn hủy ticket này?', [
      { text: 'Không', style: 'cancel' },
      { text: 'Hủy ticket', style: 'destructive', onPress: async () => {
        if (isReal) {
          try {
            await realMaintenanceService.updateStatus(idNum, 'CANCELLED', 'Đã hủy yêu cầu');
            await refreshReal();
          } catch (e: any) {
            // BE trả 403 nếu không đủ quyền (tenant / manager không quản lý property).
            const msg = e?.response?.data?.message
              || (e?.response?.status === 403 ? 'Bạn không có quyền hủy yêu cầu này.' : 'Không thể hủy yêu cầu. Vui lòng thử lại.');
            Alert.alert('Không thể hủy', msg);
          }
          return;
        }
        maintenanceStore.updateTicket(ticket.id, {
          status:    'cancelled',
          updatedAt: new Date().toISOString().split('T')[0],
        });
      }},
    ]);
  };

  return (
    <SafeAreaView style={s.safe}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerCode}>{ticket.ticketCode}</Text>
          <Text style={s.headerTitle} numberOfLines={1}>{ticket.title}</Text>
        </View>
        <View style={[s.statusPill, { backgroundColor: cfg.bg }]}>
          <Text style={s.statusPillIcon}>{cfg.icon}</Text>
          <Text style={[s.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Badges ──────────────────────────────────────────────── */}
        <View style={s.badgesRow}>
          <View style={[s.badge, { backgroundColor: priorityCfg.bg }]}>
            <Text style={[s.badgeText, { color: priorityCfg.color }]}>{priorityCfg.label}</Text>
          </View>
          <View style={s.catBadge}>
            <Text style={s.catBadgeText}>{catCfg.icon} {catCfg.label}</Text>
          </View>
          <View style={[s.badge, { backgroundColor: Colors.background }]}>
            <Text style={[s.badgeText, { color: Colors.textSecondary }]}>🏢 {ticket.propertyName}</Text>
          </View>
        </View>

        {/* ── Info card ──────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardSectionTitle}>Thông tin yêu cầu</Text>
          {([
            { label: 'Tòa nhà',    val: ticket.propertyName },
            { label: 'Phòng',      val: ticket.roomName },
            { label: 'Khách thuê', val: ticket.tenantName },
            { label: 'SĐT',        val: ticket.tenantPhone, primary: true },
            { label: 'Ngày tạo',   val: ticket.createdAt },
          ] as const).map((row, i) => (
            <View key={i} style={[s.infoRow, i === 4 && { borderBottomWidth: 0 }]}>
              <Text style={s.infoLabel}>{row.label}</Text>
              <Text style={[s.infoVal, (row as any).primary && { color: Colors.primary }]}>{row.val}</Text>
            </View>
          ))}
          {ticket.equipmentName && (
            <View style={[s.infoRow, { borderBottomWidth: 0 }]}>
              <Text style={s.infoLabel}>Thiết bị</Text>
              <View style={{ alignItems: 'flex-end', flex: 1, marginLeft: Spacing.md }}>
                <Text style={s.infoVal}>{ticket.equipmentName}</Text>
                {!!ticket.maintenanceCount && ticket.maintenanceCount > 0 && (
                  <Text style={s.equipHistory}>
                    Đã sửa {ticket.maintenanceCount} lần · Cuối: {ticket.lastRepairDate}
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>

        {/* ── Description ────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardSectionTitle}>Mô tả vấn đề</Text>
          <Text style={s.descText}>{ticket.description}</Text>
        </View>

        {/* ── Cảnh báo vòng đời thiết bị ───────────────────────────── */}
        {!!ticket.maintenanceCount && ticket.maintenanceCount >= EQUIPMENT_REPLACE_SUGGEST_COUNT && (
          <View style={s.replaceAlert}>
            <Text style={s.replaceAlertText}>
              ⚠️ Thiết bị này đã sửa {ticket.maintenanceCount} lần — cân nhắc <Text style={{ fontWeight: '800' }}>thay mới</Text> thay vì sửa tiếp.
            </Text>
          </View>
        )}

        {/* ── Photos ─────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardSectionTitle}>Hình ảnh / Bằng chứng</Text>
          <PhotoEvidenceRow
            type="before" photos={photos}
            onAdd={() => handleAddPhoto('before')}
            disabled={!isEditMode && !hasPhoto('before')}
          />
          {['in_progress', 'on_hold', 'pending_approval', 'done', 'confirmed', 'resolved'].includes(ticket.status) && (
            <PhotoEvidenceRow
              type="after" photos={photos}
              onAdd={() => handleAddPhoto('after')}
              disabled={isTerminal}
            />
          )}
        </View>

        {/* ── Chọn kỹ thuật viên (rich, trước khi tiếp nhận) ───────── */}
        {richMode && (ticket.status === 'pending' || ticket.status === 'acknowledged') && (
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>Kỹ thuật viên phụ trách</Text>
            <View style={s.scheduleRow}>
              {MAINTENANCE_TECHNICIANS
                .filter(t => t.skills.includes(ticket.category))
                .map(t => {
                  const active = technicianId === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[s.scheduleChip, active && s.scheduleChipActive]}
                      onPress={() => setTechnicianId(active ? '' : t.id)}
                    >
                      <Text style={[s.scheduleChipText, active && s.scheduleChipTextActive]}>{t.name}</Text>
                    </TouchableOpacity>
                  );
                })}
            </View>
            {selectedTech && <Text style={s.scheduleCurrent}>👷 {selectedTech.name} · {selectedTech.phone}</Text>}
          </View>
        )}
        {ticket.assignedTo && (ticket.status !== 'pending') && (
          <View style={s.card}>
            <View style={[s.infoRow, { borderBottomWidth: 0 }]}>
              <Text style={s.infoLabel}>Người xử lý</Text>
              <Text style={s.infoVal}>{ticket.assignedTo}</Text>
            </View>
          </View>
        )}

        {/* ── Đề xuất lịch hẹn (rich, status acknowledged) ─────────── */}
        {richMode && ticket.status === 'acknowledged' && (
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>Đề xuất khung giờ (khách sẽ chọn)</Text>
            <View style={s.scheduleRow}>
              {SCHEDULE_OPTIONS.map(opt => {
                const iso = toISODate(opt.days);
                const active = scheduleSlots.includes(iso);
                return (
                  <TouchableOpacity
                    key={opt.label}
                    style={[s.scheduleChip, active && s.scheduleChipActive]}
                    onPress={() => setScheduleSlots(prev => active ? prev.filter(x => x !== iso) : [...prev, iso])}
                  >
                    <Text style={[s.scheduleChipText, active && s.scheduleChipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={s.scheduleCurrent}>
              {scheduleSlots.length > 0 ? `📅 Đề xuất: ${scheduleSlots.map(fmtSchedule).join(', ')}` : 'Chọn 1–3 khung giờ'}
            </Text>
          </View>
        )}
        {/* Trạng thái lịch hẹn (đã đề xuất / khách đã chọn) */}
        {richMode && (ticket.status === 'scheduled' || ticket.confirmedSlot) && (
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>Lịch hẹn</Text>
            {ticket.confirmedSlot ? (
              <Text style={[s.scheduleCurrent, { color: Colors.success }]}>✅ Khách đã chọn: {ticket.confirmedSlot}</Text>
            ) : (
              <Text style={s.scheduleCurrent}>⏳ Đã đề xuất, chờ khách xác nhận: {(ticket.scheduledSlots || []).map(fmtSchedule).join(', ')}</Text>
            )}
          </View>
        )}

        {/* ── Tạm dừng / Tiếp tục (rich) ───────────────────────────── */}
        {richMode && ticket.status === 'in_progress' && (
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>Tạm dừng (chờ phụ tùng...)</Text>
            <TextInput
              style={s.textInput}
              value={holdReason}
              onChangeText={setHoldReason}
              placeholder="Lý do tạm dừng..."
              placeholderTextColor={Colors.textMuted}
            />
            <TouchableOpacity style={[s.secondaryBtn, { marginTop: Spacing.sm }]} onPress={handleHold}>
              <Text style={s.secondaryBtnText}>⏸ Tạm dừng xử lý</Text>
            </TouchableOpacity>
          </View>
        )}
        {richMode && ticket.status === 'on_hold' && ticket.onHoldReason && (
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>Đang tạm dừng</Text>
            <Text style={s.descText}>{ticket.onHoldReason}</Text>
          </View>
        )}

        {/* ── Cổng duyệt chi phí (rich, pending_approval) ──────────── */}
        {richMode && ticket.status === 'pending_approval' && (
          <View style={[s.card, { borderColor: '#EA580C', borderWidth: 1.5 }]}>
            <Text style={s.cardSectionTitle}>Chờ Admin duyệt chi phí</Text>
            <Text style={s.descText}>Chi phí {ticket.repairCost != null ? fmt(ticket.repairCost) : ''} vượt ngưỡng {fmt(MAINTENANCE_COST_APPROVAL_THRESHOLD)}.</Text>
            <View style={[s.costPaidByRow, { marginTop: Spacing.sm }]}>
              <TouchableOpacity style={[s.costPaidByBtn, { backgroundColor: Colors.success, borderColor: Colors.success }]} onPress={handleApprove}>
                <Text style={[s.costPaidByText, { color: Colors.white }]}>✓ Duyệt (demo Admin)</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.costPaidByBtn, { borderColor: Colors.error }]} onPress={handleReject}>
                <Text style={[s.costPaidByText, { color: Colors.error }]}>✕ Từ chối</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Chờ khách nghiệm thu (rich, done) ────────────────────── */}
        {richMode && ticket.status === 'done' && (
          <View style={[s.card, { backgroundColor: Colors.infoLight }]}>
            <Text style={[s.descText, { color: Colors.info }]}>⏳ Đã sửa xong — đang chờ khách nghiệm thu. Ticket sẽ tự đóng khi khách xác nhận.</Text>
          </View>
        )}

        {/* ── Cost input (resolving) ──────────────────────────────── */}
        {showCostInput && (
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>Chi phí sửa chữa</Text>
            <TextInput
              style={[s.textInput, s.costInput]}
              value={costInput}
              onChangeText={setCostInput}
              placeholder="0 nếu bảo hành / miễn phí..."
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
            />
            <Text style={[s.cardSectionTitle, { marginTop: Spacing.md }]}>Ai thanh toán chi phí?</Text>
            <View style={s.costPaidByRow}>
              <TouchableOpacity
                style={[s.costPaidByBtn, costPaidBy === 'host' && s.costPaidByBtnHost]}
                onPress={() => setCostPaidBy('host')}
              >
                <Text style={s.costPaidByIcon}>🏠</Text>
                <Text style={[s.costPaidByText, costPaidBy === 'host' && { color: Colors.white }]}>Chủ nhà</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.costPaidByBtn, costPaidBy === 'tenant' && s.costPaidByBtnTenant]}
                onPress={() => setCostPaidBy('tenant')}
              >
                <Text style={s.costPaidByIcon}>👤</Text>
                <Text style={[s.costPaidByText, costPaidBy === 'tenant' && { color: Colors.white }]}>Khách thuê</Text>
              </TouchableOpacity>
            </View>

            <Text style={[s.cardSectionTitle, { marginTop: Spacing.md }]}>Nguyên nhân hư hỏng</Text>
            <View style={s.costPaidByRow}>
              <TouchableOpacity
                style={[s.costPaidByBtn, cause === 'wear' && s.costPaidByBtnHost]}
                onPress={() => setCause('wear')}
              >
                <Text style={s.costPaidByIcon}>🕗</Text>
                <Text style={[s.costPaidByText, cause === 'wear' && { color: Colors.white }]}>Hao mòn</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.costPaidByBtn, cause === 'misuse' && s.costPaidByBtnTenant]}
                onPress={() => setCause('misuse')}
              >
                <Text style={s.costPaidByIcon}>⚠️</Text>
                <Text style={[s.costPaidByText, cause === 'misuse' && { color: Colors.white }]}>Dùng sai</Text>
              </TouchableOpacity>
            </View>
            {costPaidBy === 'tenant' && cause === 'misuse' && (
              <Text style={s.causeHint}>
                ⓘ Khách thuê làm hư — chi phí sẽ trừ vào tiền cọc khi trả phòng.
              </Text>
            )}
          </View>
        )}

        {/* ── Note input (edit mode) ──────────────────────────────── */}
        {isEditMode && (
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>Ghi chú cập nhật</Text>
            <TextInput
              style={[s.textInput, s.noteInput]}
              value={noteInput}
              onChangeText={setNoteInput}
              placeholder="Mô tả tình trạng xử lý..."
              placeholderTextColor={Colors.textMuted}
              multiline
            />
          </View>
        )}

        {/* ── Cost display ────────────────────────────────────────── */}
        {ticket.repairCost !== undefined && ['done', 'confirmed', 'resolved', 'pending_approval'].includes(ticket.status) && (
          <View style={s.costDisplayRow}>
            <View style={s.costDisplayCard}>
              <Text style={s.costDisplayLabel}>Chi phí sửa chữa</Text>
              <Text style={s.costDisplayVal}>{fmt(ticket.repairCost)}</Text>
            </View>
            {ticket.costPaidBy && (
              <View style={[s.costDisplayCard, {
                backgroundColor: ticket.costPaidBy === 'host' ? Colors.primaryBg : Colors.successLight,
              }]}>
                <Text style={s.costDisplayLabel}>Thanh toán bởi</Text>
                <Text style={[s.costDisplayVal, {
                  color: ticket.costPaidBy === 'host' ? Colors.primary : Colors.success,
                }]}>
                  {ticket.costPaidBy === 'host' ? '🏠 Chủ nhà' : '👤 Khách thuê'}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── Timeline ────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardSectionTitle}>Tiến trình xử lý</Text>
          <TicketTimeline timeline={ticket.timeline} currentStatus={ticket.status} />
        </View>

        {/* ── Actions ─────────────────────────────────────────────── */}
        {showCostInput ? (
          <>
            <TouchableOpacity
              style={s.resolveBtn}
              onPress={() => {
                if (isReal) {
                  const c = parseInt(costInput.replace(/\D/g, ''), 10);
                  if (isNaN(c)) { Alert.alert('Lỗi', 'Nhập chi phí (0 nếu miễn phí).'); return; }
                  handleRealResolve(c, noteInput.trim() || `Hoàn tất. Chi phí ${fmt(c)}`);
                } else {
                  handleSubmitDone();
                }
              }}
            >
              <Text style={s.resolveBtnText}>✅ Xác nhận đã sửa xong & lưu</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.secondaryBtn} onPress={() => setShowCostInput(false)}>
              <Text style={s.secondaryBtnText}>← Quay lại</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Đường real-API (BE 3 trạng thái) */}
            {isReal && ticket.status === 'pending' && (
              <TouchableOpacity style={s.advanceBtn} onPress={handleRealStart}>
                <Text style={s.advanceBtnText}>🔧 Tiếp nhận & bắt đầu xử lý</Text>
              </TouchableOpacity>
            )}
            {isReal && ticket.status === 'in_progress' && (
              <TouchableOpacity style={s.advanceBtn} onPress={() => setShowCostInput(true)}>
                <Text style={s.advanceBtnText}>✅ Đánh dấu đã sửa xong</Text>
              </TouchableOpacity>
            )}

            {/* Đường rich (mock/store) */}
            {richMode && ticket.status === 'pending' && (
              <TouchableOpacity style={s.advanceBtn} onPress={handleAcknowledge}>
                <Text style={s.advanceBtnText}>📋 Tiếp nhận yêu cầu</Text>
              </TouchableOpacity>
            )}
            {richMode && ticket.status === 'acknowledged' && (
              <TouchableOpacity style={s.advanceBtn} onPress={handleProposeSchedule}>
                <Text style={s.advanceBtnText}>📅 Đề xuất lịch hẹn</Text>
              </TouchableOpacity>
            )}
            {richMode && ticket.status === 'scheduled' && (
              <TouchableOpacity style={s.advanceBtn} onPress={handleStart}>
                <Text style={s.advanceBtnText}>🔧 Bắt đầu xử lý</Text>
              </TouchableOpacity>
            )}
            {richMode && ticket.status === 'in_progress' && (
              <TouchableOpacity style={s.advanceBtn} onPress={() => setShowCostInput(true)}>
                <Text style={s.advanceBtnText}>🛠 Đánh dấu đã sửa xong</Text>
              </TouchableOpacity>
            )}
            {richMode && ticket.status === 'on_hold' && (
              <TouchableOpacity style={s.advanceBtn} onPress={handleResume}>
                <Text style={s.advanceBtnText}>▶ Tiếp tục xử lý</Text>
              </TouchableOpacity>
            )}

            {isEditMode && (
              <TouchableOpacity style={s.cancelBtn} onPress={handleCancel}>
                <Text style={s.cancelBtnText}>Hủy yêu cầu này</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content:{ paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: 40 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: Spacing.sm,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderColor: Colors.divider,
  },
  backBtn:        { padding: 4 },
  backIcon:       { fontSize: 30, color: Colors.primary, fontWeight: '300', lineHeight: 34 },
  headerCode:     { fontSize: 11, fontWeight: '700', color: Colors.primary, letterSpacing: 0.5 },
  headerTitle:    { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  statusPill:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  statusPillIcon: { fontSize: 11 },
  statusPillText: { fontSize: 10, fontWeight: '700' },

  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  badge:     { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  badgeText: { fontSize: 11, fontWeight: '700' },
  catBadge:  { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  catBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },

  card:            { backgroundColor: Colors.white, borderRadius: BorderRadius.xl, padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm, borderWidth: 1, borderColor: Colors.border },
  cardSectionTitle:{ fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm },

  infoRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderColor: Colors.divider },
  infoLabel:   { fontSize: 13, color: Colors.textSecondary },
  infoVal:     { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, textAlign: 'right', flex: 1, marginLeft: Spacing.md },
  equipHistory:{ fontSize: 10, color: Colors.textMuted, marginTop: 2, fontStyle: 'italic' },

  descText: { fontSize: 14, color: Colors.textPrimary, lineHeight: 22 },

  textInput: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.md,
    padding: Spacing.md, fontSize: 14, color: Colors.textPrimary,
  },
  costInput:  { borderColor: Colors.primary, fontSize: 18, fontWeight: '700', marginBottom: Spacing.md },
  noteInput:  { minHeight: 80, textAlignVertical: 'top' },

  costPaidByRow:      { flexDirection: 'row', gap: Spacing.sm },
  costPaidByBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white },
  costPaidByBtnHost:  { backgroundColor: Colors.primary, borderColor: Colors.primary },
  costPaidByBtnTenant:{ backgroundColor: Colors.success, borderColor: Colors.success },
  costPaidByIcon: { fontSize: 16 },
  costPaidByText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  causeHint:      { fontSize: 12, color: Colors.warning, marginTop: Spacing.sm, lineHeight: 17 },

  scheduleRow:            { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  scheduleChip:           { paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white },
  scheduleChipActive:     { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  scheduleChipText:       { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  scheduleChipTextActive: { color: Colors.primary },
  scheduleCurrent:        { fontSize: 12, color: Colors.textMuted, marginTop: Spacing.sm },

  replaceAlert:     { backgroundColor: '#FEF2F2', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: '#FECACA' },
  replaceAlertText: { fontSize: 13, color: '#B91C1C', lineHeight: 19 },

  costDisplayRow:  { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  costDisplayCard: { flex: 1, backgroundColor: Colors.warningLight, borderRadius: BorderRadius.lg, padding: Spacing.md },
  costDisplayLabel:{ fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
  costDisplayVal:  { fontSize: 16, fontWeight: '800', color: Colors.warning },

  advanceBtn:    { backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, paddingVertical: 14, alignItems: 'center', marginBottom: Spacing.md, ...Shadow.md },
  advanceBtnText:{ fontSize: 15, fontWeight: '700', color: Colors.white },
  resolveBtn:    { backgroundColor: Colors.success, borderRadius: BorderRadius.lg, paddingVertical: 14, alignItems: 'center', marginBottom: Spacing.md, ...Shadow.md },
  resolveBtnText:{ fontSize: 15, fontWeight: '700', color: Colors.white },
  secondaryBtn:  { alignItems: 'center', paddingVertical: Spacing.sm, marginBottom: Spacing.sm },
  secondaryBtnText:{ fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  cancelBtn:     { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelBtnText: { fontSize: 13, fontWeight: '600', color: Colors.error },
});
