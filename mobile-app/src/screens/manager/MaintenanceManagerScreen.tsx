import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, Alert, ScrollView, TextInput, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// ===================== TYPES =====================
type TicketStatus = 'pending' | 'accepted' | 'in_progress' | 'resolved' | 'cancelled';
type TicketCategory = 'electrical' | 'plumbing' | 'furniture' | 'appliance' | 'other';
type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

interface TimelineEntry {
  status: TicketStatus;
  note: string;
  updatedBy: string;
  updatedAt: string;
}

interface MaintenanceTicket {
  id: string;
  ticketCode: string;
  roomName: string;
  propertyName: string;
  tenantName: string;
  tenantPhone: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  images: string[];
  assignedTo?: string;
  repairCost?: number;
  estimatedDate?: string;
  resolvedAt?: string;
  timeline: TimelineEntry[];
  equipmentName?: string;
  equipmentQr?: string;
  createdAt: string;
  updatedAt: string;
}

// ===================== MOCK DATA =====================
const MOCK_TICKETS: MaintenanceTicket[] = [
  {
    id: 't1', ticketCode: 'TK-2026-001',
    roomName: 'P102', propertyName: 'Nhà Nguyễn Trãi',
    tenantName: 'Lê Thị B', tenantPhone: '0901111002',
    title: 'Điều hòa không lạnh', description: 'Bật điều hòa nhưng không ra hơi lạnh, máy vẫn chạy bình thường.',
    category: 'appliance', priority: 'high', status: 'in_progress',
    assignedTo: 'Thợ Minh (0909123456)',
    estimatedDate: '18/05/2026',
    images: [],
    equipmentName: 'Điều hòa Panasonic 9000BTU', equipmentQr: 'QR-NT-102-AC',
    timeline: [
      { status: 'pending', note: 'Khách tạo yêu cầu', updatedBy: 'Lê Thị B', updatedAt: '2026-05-10 08:30' },
      { status: 'accepted', note: 'Manager tiếp nhận và sẽ liên hệ thợ', updatedBy: 'Manager', updatedAt: '2026-05-10 09:00' },
      { status: 'in_progress', note: 'Đã giao thợ Minh xử lý, đang chờ phụ kiện board mạch', updatedBy: 'Manager', updatedAt: '2026-05-11 14:00' },
    ],
    createdAt: '2026-05-10', updatedAt: '2026-05-11',
  },
  {
    id: 't2', ticketCode: 'TK-2026-002',
    roomName: 'P201', propertyName: 'Nhà Nguyễn Trãi',
    tenantName: 'Phạm Văn C', tenantPhone: '0901111003',
    title: 'Vòi nước bị rỉ', description: 'Vòi nước bồn rửa nhà bếp bị rỉ liên tục, chảy cả ngày.',
    category: 'plumbing', priority: 'medium', status: 'pending',
    images: [],
    timeline: [
      { status: 'pending', note: 'Khách tạo yêu cầu', updatedBy: 'Phạm Văn C', updatedAt: '2026-05-13 16:00' },
    ],
    createdAt: '2026-05-13', updatedAt: '2026-05-13',
  },
  {
    id: 't3', ticketCode: 'TK-2026-003',
    roomName: 'P201', propertyName: 'Nhà Nguyễn Trãi',
    tenantName: 'Phạm Văn C', tenantPhone: '0901111003',
    title: 'Ổ cắm điện bị cháy', description: 'Ổ cắm điện bên cạnh bàn học bị cháy đen, có mùi khét.',
    category: 'electrical', priority: 'urgent', status: 'accepted',
    assignedTo: 'Thợ điện Hùng (0908765432)',
    estimatedDate: '17/05/2026',
    images: [],
    timeline: [
      { status: 'pending', note: 'Khách tạo yêu cầu', updatedBy: 'Phạm Văn C', updatedAt: '2026-05-14 07:00' },
      { status: 'accepted', note: 'Khẩn cấp - đã giao thợ điện Hùng đến ngay buổi chiều', updatedBy: 'Manager', updatedAt: '2026-05-14 08:00' },
    ],
    createdAt: '2026-05-14', updatedAt: '2026-05-14',
  },
  {
    id: 't4', ticketCode: 'TK-2026-004',
    roomName: 'P101', propertyName: 'Nhà CMT8',
    tenantName: 'Bùi Văn H', tenantPhone: '0901111008',
    title: 'Cửa phòng tắm bị kẹt', description: 'Chốt cửa phòng tắm bị hỏng, không khóa được từ bên trong.',
    category: 'furniture', priority: 'medium', status: 'resolved',
    repairCost: 250000,
    resolvedAt: '2026-05-08',
    timeline: [
      { status: 'pending', note: 'Khách tạo yêu cầu', updatedBy: 'Bùi Văn H', updatedAt: '2026-05-07 14:00' },
      { status: 'accepted', note: 'Đã liên hệ thợ mộc', updatedBy: 'Manager', updatedAt: '2026-05-07 15:00' },
      { status: 'in_progress', note: 'Thợ mộc đang thi công thay chốt', updatedBy: 'Manager', updatedAt: '2026-05-08 09:00' },
      { status: 'resolved', note: 'Hoàn tất, đã thay chốt mới loại tốt. Chi phí 250,000đ', updatedBy: 'Manager', updatedAt: '2026-05-08 11:00' },
    ],
    images: [],
    createdAt: '2026-05-07', updatedAt: '2026-05-08',
  },
  {
    id: 't5', ticketCode: 'TK-2026-005',
    roomName: 'P301', propertyName: 'Nhà Nguyễn Trãi',
    tenantName: 'Ngô Thị D', tenantPhone: '0901111004',
    title: 'Đèn phòng ngủ bị hỏng', description: 'Đèn LED âm trần phòng ngủ tắt đột ngột, không bật được.',
    category: 'electrical', priority: 'low', status: 'pending',
    images: [],
    timeline: [
      { status: 'pending', note: 'Khách tạo yêu cầu', updatedBy: 'Ngô Thị D', updatedAt: '2026-05-15 20:00' },
    ],
    createdAt: '2026-05-15', updatedAt: '2026-05-15',
  },
];

// ===================== CONFIG =====================
const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; bg: string; icon: string; step: number }> = {
  pending: { label: 'Chờ tiếp nhận', color: '#F59E0B', bg: '#FFFBEB', icon: '⏳', step: 0 },
  accepted: { label: 'Đã tiếp nhận', color: '#3B82F6', bg: '#EFF6FF', icon: '📋', step: 1 },
  in_progress: { label: 'Đang xử lý', color: '#8B5CF6', bg: '#F5F3FF', icon: '🔧', step: 2 },
  resolved: { label: 'Hoàn tất', color: '#10B981', bg: '#F0FDF4', icon: '✅', step: 3 },
  cancelled: { label: 'Đã hủy', color: '#6B7280', bg: '#F3F4F6', icon: '✕', step: -1 },
};

const STATUS_CHIP_LABEL: Record<TicketStatus | 'all', string> = {
  all: 'Tất cả',
  pending: 'Chờ tiếp nhận',
  accepted: 'Đã tiếp nhận',
  in_progress: 'Đang xử lý',
  resolved: 'Hoàn tất',
  cancelled: 'Đã hủy',
};

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; color: string; bg: string }> = {
  urgent: { label: '🚨 Khẩn cấp', color: '#EF4444', bg: '#FEF2F2' },
  high: { label: '🔴 Cao', color: '#F97316', bg: '#FFF7ED' },
  medium: { label: '🟡 Trung bình', color: '#F59E0B', bg: '#FFFBEB' },
  low: { label: '🟢 Thấp', color: '#10B981', bg: '#F0FDF4' },
};

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  electrical: '⚡ Điện', plumbing: '🚰 Nước', furniture: '🪑 Nội thất',
  appliance: '📺 Thiết bị', other: '🔧 Khác',
};

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

const STATUS_FLOW: TicketStatus[] = ['pending', 'accepted', 'in_progress', 'resolved'];
const NEXT_STATUS: Record<TicketStatus, TicketStatus | null> = {
  pending: 'accepted',
  accepted: 'in_progress',
  in_progress: 'resolved',
  resolved: null,
  cancelled: null,
};

const NEXT_ACTION_LABEL: Record<TicketStatus, string> = {
  pending: '✓ Tiếp nhận yêu cầu',
  accepted: '🔧 Bắt đầu xử lý',
  in_progress: '✅ Đánh dấu hoàn tất',
  resolved: '',
  cancelled: '',
};

// ===================== TIMELINE =====================
const TicketTimeline: React.FC<{ timeline: TimelineEntry[]; currentStatus: TicketStatus }> = ({ timeline, currentStatus }) => (
  <View style={timelineStyles.container}>
    {STATUS_FLOW.map((status, i) => {
      const currentStep = STATUS_CONFIG[currentStatus].step;
      const isCompleted = STATUS_CONFIG[status].step < currentStep;
      const isActive = status === currentStatus;
      const entry = timeline.find(t => t.status === status);
      return (
        <View key={status} style={timelineStyles.step}>
          <View style={timelineStyles.stepLeft}>
            <View style={[
              timelineStyles.dot,
              isCompleted && timelineStyles.dotCompleted,
              isActive && timelineStyles.dotActive,
            ]}>
              {isCompleted && <Text style={timelineStyles.dotCheck}>✓</Text>}
              {isActive && <Text style={timelineStyles.dotActiveText}>{STATUS_CONFIG[status].icon}</Text>}
              {!isCompleted && !isActive && <Text style={timelineStyles.dotNum}>{i + 1}</Text>}
            </View>
            {i < STATUS_FLOW.length - 1 && (
              <View style={[timelineStyles.line, isCompleted && timelineStyles.lineCompleted]} />
            )}
          </View>
          <View style={timelineStyles.stepBody}>
            <Text style={[
              timelineStyles.stepLabel,
              isActive && timelineStyles.stepLabelActive,
              isCompleted && timelineStyles.stepLabelCompleted,
            ]}>
              {STATUS_CONFIG[status].label}
            </Text>
            {entry && (
              <>
                <Text style={timelineStyles.stepNote}>{entry.note}</Text>
                <Text style={timelineStyles.stepMeta}>
                  {entry.updatedBy} · {entry.updatedAt}
                </Text>
              </>
            )}
          </View>
        </View>
      );
    })}
  </View>
);

const timelineStyles = StyleSheet.create({
  container: { paddingVertical: Spacing.sm },
  step: { flexDirection: 'row', gap: Spacing.md, minHeight: 60 },
  stepLeft: { alignItems: 'center', width: 32 },
  dot: {
    width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: Colors.border,
    backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center',
  },
  dotCompleted: { backgroundColor: Colors.success, borderColor: Colors.success },
  dotActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dotCheck: { fontSize: 14, color: Colors.white, fontWeight: '700' },
  dotActiveText: { fontSize: 14 },
  dotNum: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  line: { width: 2, flex: 1, backgroundColor: Colors.border, marginVertical: 2 },
  lineCompleted: { backgroundColor: Colors.success },
  stepBody: { flex: 1, paddingBottom: Spacing.lg },
  stepLabel: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  stepLabelActive: { color: Colors.primary, fontWeight: '700' },
  stepLabelCompleted: { color: Colors.success },
  stepNote: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  stepMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
});

// ===================== TICKET DETAIL MODAL =====================
const TicketDetailModal: React.FC<{
  ticket: MaintenanceTicket;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<MaintenanceTicket>) => void;
}> = ({ ticket, onClose, onUpdate }) => {
  const [assignInput, setAssignInput] = useState(ticket.assignedTo || '');
  const [costInput, setCostInput] = useState(ticket.repairCost ? String(ticket.repairCost) : '');
  const [noteInput, setNoteInput] = useState('');
  const [showCostInput, setShowCostInput] = useState(false);

  const cfg = STATUS_CONFIG[ticket.status];
  const priorityCfg = PRIORITY_CONFIG[ticket.priority];
  const nextStatus = NEXT_STATUS[ticket.status];

  const handleAdvance = () => {
    if (!nextStatus) return;

    if (nextStatus === 'resolved') {
      setShowCostInput(true);
      return;
    }

    const note = noteInput.trim() || `Cập nhật trạng thái: ${STATUS_CONFIG[nextStatus].label}`;
    const newTimeline: TimelineEntry = {
      status: nextStatus,
      note,
      updatedBy: 'Manager',
      updatedAt: new Date().toLocaleString('vi-VN'),
    };

    onUpdate(ticket.id, {
      status: nextStatus,
      assignedTo: assignInput || ticket.assignedTo,
      timeline: [...ticket.timeline, newTimeline],
      updatedAt: new Date().toISOString().split('T')[0],
    });
    setNoteInput('');
    onClose();
  };

  const handleResolve = () => {
    const cost = parseInt(costInput.replace(/\D/g, ''), 10);
    if (isNaN(cost)) {
      Alert.alert('Lỗi', 'Nhập chi phí sửa chữa (0 nếu không tốn phí).');
      return;
    }
    const note = noteInput.trim() || `Hoàn tất sửa chữa. Chi phí: ${fmt(cost)}`;
    const newTimeline: TimelineEntry = {
      status: 'resolved',
      note,
      updatedBy: 'Manager',
      updatedAt: new Date().toLocaleString('vi-VN'),
    };
    onUpdate(ticket.id, {
      status: 'resolved',
      repairCost: cost,
      resolvedAt: new Date().toISOString().split('T')[0],
      timeline: [...ticket.timeline, newTimeline],
    });
    setShowCostInput(false);
    onClose();
    Alert.alert('✅ Hoàn tất!', `Ticket ${ticket.ticketCode} đã được đóng. Chi phí: ${fmt(cost)}`);
  };

  return (
    <Modal transparent animationType="slide">
      <View style={detailStyles.overlay}>
        <View style={detailStyles.sheet}>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}
            contentContainerStyle={detailStyles.content}>
            {/* Header */}
            <View style={detailStyles.header}>
              <View style={detailStyles.headerLeft}>
                <Text style={detailStyles.ticketCode}>{ticket.ticketCode}</Text>
                <Text style={detailStyles.ticketTitle}>{ticket.title}</Text>
              </View>
              <TouchableOpacity onPress={onClose}>
                <Text style={detailStyles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Status + Priority */}
            <View style={detailStyles.badgesRow}>
              <View style={[detailStyles.badge, { backgroundColor: cfg.bg }]}>
                <Text style={detailStyles.badgeIcon}>{cfg.icon}</Text>
                <Text style={[detailStyles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
              <View style={[detailStyles.badge, { backgroundColor: priorityCfg.bg }]}>
                <Text style={[detailStyles.badgeText, { color: priorityCfg.color }]}>{priorityCfg.label}</Text>
              </View>
              <Text style={detailStyles.categoryBadge}>{CATEGORY_LABELS[ticket.category]}</Text>
            </View>

            {/* Info */}
            <View style={detailStyles.section}>
              <View style={detailStyles.infoRow}><Text style={detailStyles.infoLabel}>Phòng</Text><Text style={detailStyles.infoVal}>{ticket.propertyName} · {ticket.roomName}</Text></View>
              <View style={detailStyles.infoRow}><Text style={detailStyles.infoLabel}>Khách thuê</Text><Text style={detailStyles.infoVal}>{ticket.tenantName}</Text></View>
              <View style={detailStyles.infoRow}><Text style={detailStyles.infoLabel}>SĐT</Text><Text style={[detailStyles.infoVal, { color: Colors.primary }]}>{ticket.tenantPhone}</Text></View>
              <View style={detailStyles.infoRow}><Text style={detailStyles.infoLabel}>Tạo lúc</Text><Text style={detailStyles.infoVal}>{ticket.createdAt}</Text></View>
              {ticket.equipmentName && (
                <View style={detailStyles.infoRow}>
                  <Text style={detailStyles.infoLabel}>Thiết bị</Text>
                  <Text style={detailStyles.infoVal}>{ticket.equipmentName}</Text>
                </View>
              )}
            </View>

            {/* Description */}
            <View style={detailStyles.descBox}>
              <Text style={detailStyles.descLabel}>Mô tả vấn đề</Text>
              <Text style={detailStyles.descText}>{ticket.description}</Text>
            </View>

            {/* Assign */}
            {ticket.status !== 'resolved' && ticket.status !== 'cancelled' && (
              <View style={detailStyles.section}>
                <Text style={detailStyles.sectionTitle}>Người xử lý</Text>
                <TextInput
                  style={detailStyles.assignInput}
                  value={assignInput}
                  onChangeText={setAssignInput}
                  placeholder="Tên thợ + số điện thoại..."
                />
              </View>
            )}
            {ticket.assignedTo && ticket.status === 'resolved' && (
              <View style={detailStyles.infoRow}>
                <Text style={detailStyles.infoLabel}>Người xử lý</Text>
                <Text style={detailStyles.infoVal}>{ticket.assignedTo}</Text>
              </View>
            )}

            {/* Cost input for resolve */}
            {showCostInput && (
              <View style={detailStyles.costSection}>
                <Text style={detailStyles.sectionTitle}>Chi phí sửa chữa</Text>
                <TextInput
                  style={detailStyles.costInput}
                  value={costInput}
                  onChangeText={setCostInput}
                  placeholder="0 nếu bảo hành / miễn phí..."
                  keyboardType="numeric"
                />
                <Text style={detailStyles.costHint}>Chi phí sẽ được ghi nhận vào module tài chính</Text>
              </View>
            )}

            {/* Note input */}
            {ticket.status !== 'resolved' && ticket.status !== 'cancelled' && (
              <View style={detailStyles.section}>
                <Text style={detailStyles.sectionTitle}>Ghi chú cập nhật</Text>
                <TextInput
                  style={detailStyles.noteInput}
                  value={noteInput}
                  onChangeText={setNoteInput}
                  placeholder="Mô tả tình trạng xử lý..."
                  multiline
                />
              </View>
            )}

            {/* Repair cost display */}
            {ticket.repairCost !== undefined && ticket.repairCost >= 0 && (
              <View style={detailStyles.costDisplay}>
                <Text style={detailStyles.costDisplayLabel}>Chi phí sửa chữa</Text>
                <Text style={detailStyles.costDisplayVal}>{fmt(ticket.repairCost)}</Text>
              </View>
            )}

            {/* Timeline */}
            <View style={detailStyles.section}>
              <Text style={detailStyles.sectionTitle}>Tiến trình xử lý</Text>
              <TicketTimeline timeline={ticket.timeline} currentStatus={ticket.status} />
            </View>

            {/* Action buttons */}
            {nextStatus && !showCostInput && (
              <TouchableOpacity style={detailStyles.advanceBtn} onPress={handleAdvance}>
                <Text style={detailStyles.advanceBtnText}>{NEXT_ACTION_LABEL[ticket.status]}</Text>
              </TouchableOpacity>
            )}
            {showCostInput && (
              <TouchableOpacity style={detailStyles.resolveBtn} onPress={handleResolve}>
                <Text style={detailStyles.resolveBtnText}>✅ Xác nhận hoàn tất & lưu chi phí</Text>
              </TouchableOpacity>
            )}
            {ticket.status !== 'resolved' && ticket.status !== 'cancelled' && (
              <TouchableOpacity
                style={detailStyles.cancelBtn}
                onPress={() => {
                  Alert.alert('Hủy yêu cầu?', 'Bạn có chắc muốn hủy ticket này?', [
                    { text: 'Không', style: 'cancel' },
                    { text: 'Hủy ticket', style: 'destructive', onPress: () => {
                      onUpdate(ticket.id, { status: 'cancelled' });
                      onClose();
                    }},
                  ]);
                }}
              >
                <Text style={detailStyles.cancelBtnText}>Hủy yêu cầu này</Text>
              </TouchableOpacity>
            )}

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const detailStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, maxHeight: SCREEN_HEIGHT * 0.92 },
  content: { padding: Spacing.xl, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  headerLeft: { flex: 1, marginRight: Spacing.md },
  ticketCode: { fontSize: 12, fontWeight: '700', color: Colors.primary, letterSpacing: 1 },
  ticketTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginTop: 4 },
  closeBtn: { fontSize: 20, color: Colors.textMuted, padding: 4 },
  badgesRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: BorderRadius.full },
  badgeIcon: { fontSize: 12 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  categoryBadge: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: BorderRadius.full, backgroundColor: Colors.background, fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  section: { marginBottom: Spacing.md },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderColor: Colors.divider },
  infoLabel: { fontSize: 14, color: Colors.textSecondary },
  infoVal: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, textAlign: 'right', flex: 1, marginLeft: Spacing.md },
  descBox: { backgroundColor: Colors.background, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.md },
  descLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: Spacing.xs },
  descText: { fontSize: 14, color: Colors.textPrimary, lineHeight: 22 },
  assignInput: { borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: 14, color: Colors.textPrimary },
  costSection: { marginBottom: Spacing.md },
  costInput: { borderWidth: 1.5, borderColor: Colors.primary, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  costHint: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic' },
  noteInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: 14, color: Colors.textPrimary, minHeight: 80 },
  costDisplay: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: Colors.warningLight, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.md },
  costDisplayLabel: { fontSize: 14, color: Colors.warning, fontWeight: '600' },
  costDisplayVal: { fontSize: 16, fontWeight: '800', color: Colors.warning },
  advanceBtn: { backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, paddingVertical: Spacing.base, alignItems: 'center', marginBottom: Spacing.md, ...Shadow.md },
  advanceBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  resolveBtn: { backgroundColor: Colors.success, borderRadius: BorderRadius.lg, paddingVertical: Spacing.base, alignItems: 'center', marginBottom: Spacing.md, ...Shadow.md },
  resolveBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  cancelBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelBtnText: { fontSize: 13, fontWeight: '600', color: Colors.error },
});

// ===================== TICKET CARD =====================
const TicketCard: React.FC<{ ticket: MaintenanceTicket; onPress: () => void }> = ({ ticket, onPress }) => {
  const cfg = STATUS_CONFIG[ticket.status];
  const priorityCfg = PRIORITY_CONFIG[ticket.priority];
  return (
    <TouchableOpacity style={[styles.card, ticket.priority === 'urgent' && styles.cardUrgent]} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.ticketCode}>{ticket.ticketCode}</Text>
          <View style={[styles.priorityBadge, { backgroundColor: priorityCfg.bg }]}>
            <Text style={[styles.priorityText, { color: priorityCfg.color }]}>{priorityCfg.label}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
          <Text style={styles.statusIcon}>{cfg.icon}</Text>
          <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>
      <Text style={styles.ticketTitle}>{ticket.title}</Text>
      <Text style={styles.ticketDesc} numberOfLines={2}>{ticket.description}</Text>
      <View style={styles.cardFooter}>
        <Text style={styles.cardMeta}>🏠 {ticket.propertyName} · {ticket.roomName}</Text>
        <Text style={styles.cardMeta}>👤 {ticket.tenantName}</Text>
      </View>
      <View style={styles.cardFooter2}>
        <Text style={styles.cardCategory}>{CATEGORY_LABELS[ticket.category]}</Text>
        <Text style={styles.cardDate}>{ticket.createdAt}</Text>
        {ticket.repairCost !== undefined && ticket.status === 'resolved' && (
          <Text style={styles.cardCost}>{fmt(ticket.repairCost)}</Text>
        )}
      </View>
      {ticket.status !== 'resolved' && ticket.status !== 'cancelled' && NEXT_STATUS[ticket.status] && (
        <View style={styles.actionHint}>
          <Text style={styles.actionHintText}>{NEXT_ACTION_LABEL[ticket.status]} →</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

// ===================== MAIN =====================
export const MaintenanceManagerScreen: React.FC = () => {
  const [tickets, setTickets] = useState(MOCK_TICKETS);
  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');
  const [selectedTicket, setSelectedTicket] = useState<MaintenanceTicket | null>(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let result = statusFilter === 'all' ? tickets : tickets.filter(t => t.status === statusFilter);
    if (search) {
      result = result.filter(t =>
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.tenantName.toLowerCase().includes(search.toLowerCase()) ||
        t.roomName.toLowerCase().includes(search.toLowerCase()) ||
        t.ticketCode.toLowerCase().includes(search.toLowerCase())
      );
    }
    return result.sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }, [tickets, statusFilter, search]);

  const stats = useMemo(() => ({
    all: tickets.length,
    pending: tickets.filter(t => t.status === 'pending').length,
    accepted: tickets.filter(t => t.status === 'accepted').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
    urgent: tickets.filter(t => t.priority === 'urgent' && t.status !== 'resolved').length,
    totalCost: tickets.filter(t => t.status === 'resolved').reduce((s, t) => s + (t.repairCost || 0), 0),
  }), [tickets]);

  const handleUpdate = (id: string, updates: Partial<MaintenanceTicket>) => {
    setTickets(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    setSelectedTicket(null);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Bảo trì & Sửa chữa</Text>
        <Text style={styles.subtitle}>Quản lý yêu cầu sửa chữa</Text>
      </View>

      {/* Stats */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.statsRow} contentContainerStyle={styles.statsContent}>
        <View style={[styles.statCard, { borderTopColor: Colors.error }]}>
          <Text style={[styles.statNum, { color: Colors.error }]}>{stats.urgent}</Text>
          <Text style={styles.statLabel}>Khẩn cấp</Text>
        </View>
        <View style={[styles.statCard, { borderTopColor: Colors.warning }]}>
          <Text style={[styles.statNum, { color: Colors.warning }]}>{stats.pending}</Text>
          <Text style={styles.statLabel}>Chờ tiếp nhận</Text>
        </View>
        <View style={[styles.statCard, { borderTopColor: Colors.info }]}>
          <Text style={[styles.statNum, { color: Colors.info }]}>{stats.accepted + stats.in_progress}</Text>
          <Text style={styles.statLabel}>Đang xử lý</Text>
        </View>
        <View style={[styles.statCard, { borderTopColor: Colors.success }]}>
          <Text style={[styles.statNum, { color: Colors.success }]}>{stats.resolved}</Text>
          <Text style={styles.statLabel}>Hoàn tất</Text>
        </View>
        <View style={[styles.statCard, { borderTopColor: Colors.primary, minWidth: 110 }]}>
          <Text style={[styles.statNum, { color: Colors.primary, fontSize: 16 }]}>
            {(stats.totalCost / 1000).toFixed(0)}k
          </Text>
          <Text style={styles.statLabel}>Chi phí T5</Text>
        </View>
      </ScrollView>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍  Tìm ticket, phòng, khách thuê..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Status filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.filterRow} contentContainerStyle={styles.filterContent}>
        {(['all', 'pending', 'accepted', 'in_progress', 'resolved', 'cancelled'] as const).map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.filterChip, statusFilter === s && styles.filterChipActive,
              s === 'pending' && stats.pending > 0 && statusFilter !== s && { borderColor: Colors.warning },
            ]}
            onPress={() => setStatusFilter(s)}
          >
            <Text style={[styles.filterText, statusFilter === s && styles.filterTextActive]}>
              {s === 'all' ? `Tất cả (${stats.all})` : STATUS_CHIP_LABEL[s]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        renderItem={({ item }) => (
          <TicketCard ticket={item} onPress={() => setSelectedTicket(item)} />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 40 }}>🔧</Text>
            <Text style={styles.emptyText}>Không có yêu cầu bảo trì</Text>
          </View>
        }
      />

      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onUpdate={handleUpdate}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing.sm },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  statsRow: { height: 90 },
  statsContent: { paddingHorizontal: Spacing.lg, paddingVertical: 8, alignItems: 'flex-start' },
  statCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md, borderTopWidth: 3, ...Shadow.sm, minWidth: 80, alignItems: 'center', marginRight: Spacing.md },
  statNum: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  searchContainer: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  searchInput: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md, fontSize: 14, color: Colors.textPrimary, ...Shadow.sm },
  filterRow: { height: 50 },
  filterContent: { paddingHorizontal: Spacing.lg, paddingVertical: 8, alignItems: 'flex-start' },
  filterChip: { height: 34, justifyContent: 'center', paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, marginRight: Spacing.sm },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },
  listContent: { paddingHorizontal: Spacing.lg, paddingBottom: 100, paddingTop: Spacing.sm },
  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm },
  cardUrgent: { borderWidth: 1.5, borderColor: Colors.error },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  cardHeaderLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap', marginRight: Spacing.sm },
  ticketCode: { fontSize: 12, fontWeight: '700', color: Colors.primary, letterSpacing: 0.5 },
  priorityBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: BorderRadius.full },
  priorityText: { fontSize: 10, fontWeight: '700' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  statusIcon: { fontSize: 11 },
  statusText: { fontSize: 11, fontWeight: '700' },
  ticketTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  ticketDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18, marginBottom: Spacing.sm },
  cardFooter: { flexDirection: 'row', gap: Spacing.md, marginBottom: 4 },
  cardFooter2: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  cardMeta: { fontSize: 12, color: Colors.textMuted },
  cardCategory: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  cardDate: { fontSize: 11, color: Colors.textMuted, flex: 1 },
  cardCost: { fontSize: 12, fontWeight: '700', color: Colors.error },
  actionHint: { marginTop: Spacing.sm, backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md, paddingVertical: 6, paddingHorizontal: Spacing.md },
  actionHintText: { fontSize: 12, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: Spacing.md },
  emptyText: { fontSize: 14, color: Colors.textMuted },
});
