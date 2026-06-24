import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import {
  useTickets, maintenanceStore, MaintenanceTicket,
  TicketStatus, PhotoEvidence, CostPaidBy, TimelineEntry,
} from '../../store/maintenanceStore';
import { realMaintenanceService } from '../../services/maintenanceService.real';
import { dtoToTicket } from '../../services/maintenanceMappers';

// ── Config ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; bg: string; icon: string; step: number }> = {
  pending:     { label: 'Chờ tiếp nhận', color: '#F59E0B', bg: '#FFFBEB', icon: '⏳', step: 0 },
  accepted:    { label: 'Đã tiếp nhận',  color: '#3B82F6', bg: '#EFF6FF', icon: '📋', step: 1 },
  in_progress: { label: 'Đang xử lý',    color: '#8B5CF6', bg: '#F5F3FF', icon: '🔧', step: 2 },
  resolved:    { label: 'Hoàn tất',      color: '#10B981', bg: '#F0FDF4', icon: '✅', step: 3 },
  cancelled:   { label: 'Đã hủy',        color: '#6B7280', bg: '#F3F4F6', icon: '✕',  step: -1 },
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

const STATUS_FLOW: TicketStatus[] = ['pending', 'accepted', 'in_progress', 'resolved'];

const NEXT_STATUS: Record<TicketStatus, TicketStatus | null> = {
  pending: 'accepted', accepted: 'in_progress', in_progress: 'resolved',
  resolved: null, cancelled: null,
};
const NEXT_ACTION_LABEL: Record<TicketStatus, string> = {
  pending:     '✓ Tiếp nhận yêu cầu',
  accepted:    '🔧 Bắt đầu xử lý',
  in_progress: '✅ Đánh dấu hoàn tất',
  resolved: '', cancelled: '',
};

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

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
              <View style={[phs.photoPlaceholder, { backgroundColor: color + '15' }]}>
                <Text style={phs.photoPlaceholderIcon}>{type === 'before' ? '📸' : '🖼️'}</Text>
              </View>
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
  const isReal = !!realTicket;
  const ticket = realTicket ?? storeTicket;

  // Lấy chi tiết thật từ BE; lỗi → giữ ticket mock từ store.
  useEffect(() => {
    if (!isRealId) return;
    let active = true;
    realMaintenanceService.getDetail(idNum)
      .then(dto => { if (active) setRealTicket(dtoToTicket(dto)); })
      .catch(() => { /* giữ store mock */ });
    return () => { active = false; };
  }, [idNum, isRealId]);

  const refreshReal = async () => {
    try {
      const dto = await realMaintenanceService.getDetail(idNum);
      setRealTicket(dtoToTicket(dto));
    } catch { /* bỏ qua */ }
  };

  const [assignInput,   setAssignInput]   = useState(ticket?.assignedTo || '');
  const [costInput,     setCostInput]     = useState(
    ticket?.repairCost !== undefined ? String(ticket.repairCost) : '',
  );
  const [costPaidBy,    setCostPaidBy]    = useState<CostPaidBy>(ticket?.costPaidBy || 'host');
  const [noteInput,     setNoteInput]     = useState('');
  const [showCostInput, setShowCostInput] = useState(false);
  const [photos,        setPhotos]        = useState<PhotoEvidence[]>(ticket?.photos || []);

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

  const cfg         = STATUS_CONFIG[ticket.status];
  const priorityCfg = PRIORITY_CONFIG[ticket.priority];
  const catCfg      = CATEGORY_CONFIG[ticket.category];
  const nextStatus  = NEXT_STATUS[ticket.status];
  const isEditMode  = ticket.status !== 'resolved' && ticket.status !== 'cancelled';

  const handleAddPhoto = (type: 'before' | 'after') => {
    setPhotos(prev => [...prev, {
      id: `ph-${Date.now()}`, type, uri: '',
      caption:    type === 'before' ? 'Ảnh hiện trạng' : 'Ảnh sau sửa chữa',
      capturedAt: new Date().toLocaleString('vi-VN'),
    }]);
    Alert.alert(
      type === 'before' ? '📸 Ảnh trước' : '🖼️ Ảnh sau',
      'Tính năng chụp ảnh sẽ mở camera. (Demo: đã thêm placeholder)',
    );
  };

  const handleAdvance = async () => {
    if (!nextStatus) return;
    if (nextStatus === 'resolved') { setShowCostInput(true); return; }
    const note = noteInput.trim() || `Cập nhật: ${STATUS_CONFIG[nextStatus].label}`;
    // Real API: spec chỉ có IN_PROGRESS giữa PENDING và RESOLVED.
    if (isReal) {
      try {
        await realMaintenanceService.updateStatus(idNum, 'IN_PROGRESS', note);
        await refreshReal();
        setNoteInput('');
      } catch {
        Alert.alert('Lỗi', 'Không thể cập nhật trạng thái. Vui lòng thử lại.');
      }
      return;
    }
    maintenanceStore.updateTicket(ticket.id, {
      status:     nextStatus,
      assignedTo: assignInput || ticket.assignedTo,
      timeline:   [...ticket.timeline, { status: nextStatus, note, updatedBy: 'Manager', updatedAt: new Date().toLocaleString('vi-VN') }],
      photos,
      updatedAt:  new Date().toISOString().split('T')[0],
    });
    setNoteInput('');
  };

  const handleResolve = async () => {
    const cost = parseInt(costInput.replace(/\D/g, ''), 10);
    if (isNaN(cost)) { Alert.alert('Lỗi', 'Nhập chi phí sửa chữa (0 nếu miễn phí).'); return; }
    const payerLabel = costPaidBy === 'host' ? 'chủ nhà trả' : 'khách thuê trả';
    const note = noteInput.trim() || `Hoàn tất. Chi phí: ${fmt(cost)} — ${payerLabel}`;
    // Real API: gửi repairCost + resolutionNote (BE tự tạo expense + update equipment).
    if (isReal) {
      try {
        await realMaintenanceService.resolve(idNum, { repairCost: cost, resolutionNote: note });
        await refreshReal();
        setShowCostInput(false);
        Alert.alert('✅ Hoàn tất!', `Ticket ${ticket.ticketCode} đã đóng.\nChi phí: ${fmt(cost)}`);
      } catch {
        Alert.alert('Lỗi', 'Không thể lưu kết quả. Vui lòng thử lại.');
      }
      return;
    }
    maintenanceStore.updateTicket(ticket.id, {
      status:     'resolved',
      repairCost: cost,
      costPaidBy,
      resolvedAt: new Date().toISOString().split('T')[0],
      timeline:   [...ticket.timeline, { status: 'resolved', note, updatedBy: 'Manager', updatedAt: new Date().toLocaleString('vi-VN') }],
      photos,
    });
    setShowCostInput(false);
    Alert.alert('✅ Hoàn tất!', `Ticket ${ticket.ticketCode} đã đóng.\nChi phí: ${fmt(cost)} (${payerLabel})`);
  };

  const handleCancel = () => {
    Alert.alert('Hủy yêu cầu?', 'Bạn có chắc muốn hủy ticket này?', [
      { text: 'Không', style: 'cancel' },
      { text: 'Hủy ticket', style: 'destructive', onPress: async () => {
        if (isReal) {
          try {
            await realMaintenanceService.updateStatus(idNum, 'CANCELLED', 'Đã hủy yêu cầu');
            await refreshReal();
          } catch {
            Alert.alert('Lỗi', 'Không thể hủy yêu cầu. Vui lòng thử lại.');
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

        {/* ── Photos ─────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardSectionTitle}>Hình ảnh / Bằng chứng</Text>
          <PhotoEvidenceRow
            type="before" photos={photos}
            onAdd={() => handleAddPhoto('before')}
            disabled={!isEditMode && photos.filter(p => p.type === 'before').length === 0}
          />
          {(ticket.status === 'in_progress' || ticket.status === 'resolved') && (
            <PhotoEvidenceRow
              type="after" photos={photos}
              onAdd={() => handleAddPhoto('after')}
              disabled={ticket.status === 'resolved'}
            />
          )}
        </View>

        {/* ── Assign (edit mode) ──────────────────────────────────── */}
        {isEditMode && (
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>Người xử lý / Kỹ thuật viên</Text>
            <TextInput
              style={s.textInput}
              value={assignInput}
              onChangeText={setAssignInput}
              placeholder="Tên thợ + số điện thoại..."
              placeholderTextColor={Colors.textMuted}
            />
          </View>
        )}
        {ticket.assignedTo && !isEditMode && (
          <View style={s.card}>
            <View style={[s.infoRow, { borderBottomWidth: 0 }]}>
              <Text style={s.infoLabel}>Người xử lý</Text>
              <Text style={s.infoVal}>{ticket.assignedTo}</Text>
            </View>
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

        {/* ── Cost display (resolved) ─────────────────────────────── */}
        {ticket.repairCost !== undefined && ticket.status === 'resolved' && (
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
        {nextStatus && !showCostInput && (
          <TouchableOpacity style={s.advanceBtn} onPress={handleAdvance}>
            <Text style={s.advanceBtnText}>{NEXT_ACTION_LABEL[ticket.status]}</Text>
          </TouchableOpacity>
        )}
        {showCostInput && (
          <>
            <TouchableOpacity style={s.resolveBtn} onPress={handleResolve}>
              <Text style={s.resolveBtnText}>✅ Xác nhận hoàn tất & lưu kết quả</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.secondaryBtn} onPress={() => setShowCostInput(false)}>
              <Text style={s.secondaryBtnText}>← Quay lại</Text>
            </TouchableOpacity>
          </>
        )}
        {isEditMode && !showCostInput && (
          <TouchableOpacity style={s.cancelBtn} onPress={handleCancel}>
            <Text style={s.cancelBtnText}>Hủy yêu cầu này</Text>
          </TouchableOpacity>
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
