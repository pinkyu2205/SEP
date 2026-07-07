import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, Modal, Dimensions, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Spacing, Shadow } from '@/constants';

const SH = Dimensions.get('window').height;

// ── Types ────────────────────────────────────────────────────────────────
type TicketStatus   = 'pending' | 'accepted' | 'in_progress' | 'resolved' | 'cancelled';
type TicketPriority = 'urgent' | 'high' | 'medium' | 'low';
type TicketCategory = 'electrical' | 'plumbing' | 'furniture' | 'appliance' | 'other';
type FilterKey      = 'all' | TicketStatus;

interface MaintenanceTicket {
  id: string;
  tenantId: string;
  code: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  createdDate: string;
  updatedDate: string;
  assignedTech?: string;
  etaDate?: string;
  cost?: number;
  resolution?: string;
  propertyName: string;
  roomName: string;
  relatedEquipment?: string;
}

// ── Mock data ────────────────────────────────────────────────────────────
const MOCK_TICKETS: MaintenanceTicket[] = [
  // Lê Thị B — 1 open ticket
  {
    id: 'tk-t2-001', tenantId: 't2', code: 'TK-NT-P102-001',
    title: 'Vòi nước phòng tắm bị rỉ',
    description: 'Vòi nước phòng tắm bị rỉ nước liên tục, gây lãng phí nước và tiếng ồn ban đêm.',
    category: 'plumbing', priority: 'medium', status: 'in_progress',
    createdDate: '10/05/2026', updatedDate: '14/05/2026',
    assignedTech: 'Nguyễn Văn Kỹ', etaDate: '23/05/2026',
    propertyName: 'Nhà Nguyễn Trãi', roomName: 'P102',
  },
  // Phạm Văn C — 2 open tickets
  {
    id: 'tk-t3-001', tenantId: 't3', code: 'TK-NT-P201-001',
    title: 'Điều hòa không lạnh',
    description: 'Điều hòa phòng ngủ hoạt động nhưng không ra gió lạnh. Đã thử reset nhưng vẫn không được.',
    category: 'appliance', priority: 'high', status: 'pending',
    createdDate: '18/05/2026', updatedDate: '18/05/2026',
    propertyName: 'Nhà Nguyễn Trãi', roomName: 'P201',
    relatedEquipment: 'Điều hòa Daikin 1.5HP',
  },
  {
    id: 'tk-t3-002', tenantId: 't3', code: 'TK-NT-P201-002',
    title: 'Bóng đèn hành lang bị hỏng',
    description: 'Bóng đèn hành lang trước phòng không sáng. Đã kiểm tra công tắc vẫn không được.',
    category: 'electrical', priority: 'low', status: 'in_progress',
    createdDate: '15/05/2026', updatedDate: '17/05/2026',
    assignedTech: 'Trần Văn Điện',
    propertyName: 'Nhà Nguyễn Trãi', roomName: 'P201',
  },
  {
    id: 'tk-t3-003', tenantId: 't3', code: 'TK-NT-P201-003',
    title: 'Khóa cửa phòng bị kẹt',
    description: 'Khóa cửa chính của phòng thỉnh thoảng bị kẹt, khó mở từ bên ngoài.',
    category: 'furniture', priority: 'medium', status: 'resolved',
    createdDate: '01/04/2026', updatedDate: '05/04/2026',
    assignedTech: 'Lê Văn Sửa', resolution: 'Đã tra dầu và điều chỉnh lại cơ cấu khóa.',
    cost: 150000, propertyName: 'Nhà Nguyễn Trãi', roomName: 'P201',
  },
  // Bùi Văn H — 1 open ticket
  {
    id: 'tk-t8-001', tenantId: 't8', code: 'TK-CMT8-P101-001',
    title: 'Tủ lạnh không đông đá',
    description: 'Ngăn đông tủ lạnh bị chảy nước và không đông đá được. Tủ lạnh đã dùng được 2 năm.',
    category: 'appliance', priority: 'high', status: 'in_progress',
    createdDate: '16/05/2026', updatedDate: '19/05/2026',
    assignedTech: 'Phạm Điện Lạnh', etaDate: '24/05/2026',
    propertyName: 'Nhà CMT8', roomName: 'P101',
    relatedEquipment: 'Tủ lạnh Samsung 250L',
  },
  {
    id: 'tk-t8-002', tenantId: 't8', code: 'TK-CMT8-P101-002',
    title: 'Cửa sổ phòng ngủ bị kẹt',
    description: 'Cửa sổ phòng ngủ không đóng kín được, gây tiếng ồn và mưa tạt vào.',
    category: 'furniture', priority: 'medium', status: 'resolved',
    createdDate: '10/04/2026', updatedDate: '12/04/2026',
    assignedTech: 'Nguyễn Thợ Mộc', resolution: 'Đã điều chỉnh lại bản lề và thay ron cao su.',
    cost: 250000, propertyName: 'Nhà CMT8', roomName: 'P101',
  },
  // Gia đình anh Minh — 1 open ticket
  {
    id: 'tk-wh1-001', tenantId: 'wh-1', code: 'TK-NVC-001',
    title: 'Máy nước nóng trung tâm bị hỏng',
    description: 'Hệ thống nước nóng trung tâm không hoạt động. Toàn bộ nhà không có nước nóng.',
    category: 'plumbing', priority: 'urgent', status: 'in_progress',
    createdDate: '19/05/2026', updatedDate: '20/05/2026',
    assignedTech: 'Kỹ thuật Phúc',
    propertyName: 'Nhà Nguyễn Văn Cừ', roomName: 'Nhà nguyên căn',
    relatedEquipment: 'Máy nước nóng Ariston 50L',
  },
  {
    id: 'tk-wh1-002', tenantId: 'wh-1', code: 'TK-NVC-002',
    title: 'Bơm nước tầng 2 yếu áp lực',
    description: 'Áp lực nước tầng 2 rất yếu vào giờ cao điểm sáng sớm.',
    category: 'plumbing', priority: 'medium', status: 'resolved',
    createdDate: '05/03/2026', updatedDate: '08/03/2026',
    assignedTech: 'Kỹ thuật Phúc', resolution: 'Đã thay bơm áp lực và kiểm tra đường ống.',
    cost: 1800000, propertyName: 'Nhà Nguyễn Văn Cừ', roomName: 'Nhà nguyên căn',
  },
  // Trần Văn A — no open tickets (history)
  {
    id: 'tk-t1-001', tenantId: 't1', code: 'TK-NT-P101-001',
    title: 'Điện ổ cắm phòng ngủ bị hỏng',
    description: 'Ổ cắm điện cạnh giường ngủ không có điện.',
    category: 'electrical', priority: 'medium', status: 'resolved',
    createdDate: '05/02/2026', updatedDate: '07/02/2026',
    assignedTech: 'Trần Văn Điện', resolution: 'Đã thay ổ cắm mới và kiểm tra dây điện.',
    cost: 120000, propertyName: 'Nhà Nguyễn Trãi', roomName: 'P101',
  },
  // Cao Thị I — no tickets
];

// ── Config ───────────────────────────────────────────────────────────────
const STATUS_CFG: Record<TicketStatus, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Chờ xử lý',   color: '#D97706', bg: '#FFFBEB' },
  accepted:    { label: 'Đã tiếp nhận', color: '#0369A1', bg: '#E0F2FE' },
  in_progress: { label: 'Đang xử lý',  color: '#7C3AED', bg: '#F3E8FF' },
  resolved:    { label: 'Hoàn thành',  color: '#16A34A', bg: '#F0FDF4' },
  cancelled:   { label: 'Đã hủy',      color: '#6B7280', bg: '#F3F4F6' },
};

const PRIORITY_CFG: Record<TicketPriority, { label: string; color: string }> = {
  urgent: { label: '🔴 Khẩn cấp', color: '#DC2626' },
  high:   { label: '🟠 Cao',       color: '#EA580C' },
  medium: { label: '🟡 Trung bình', color: '#CA8A04' },
  low:    { label: '🟢 Thấp',      color: '#16A34A' },
};

const CATEGORY_CFG: Record<TicketCategory, { label: string; icon: string }> = {
  electrical: { label: 'Điện',       icon: '⚡' },
  plumbing:   { label: 'Cấp thoát nước', icon: '🚰' },
  furniture:  { label: 'Đồ dùng/nội thất', icon: '🪑' },
  appliance:  { label: 'Thiết bị điện tử', icon: '📺' },
  other:      { label: 'Khác',       icon: '🔧' },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',         label: 'Tất cả' },
  { key: 'pending',     label: 'Chờ xử lý' },
  { key: 'in_progress', label: 'Đang xử lý' },
  { key: 'resolved',    label: 'Hoàn thành' },
  { key: 'cancelled',   label: 'Đã hủy' },
];

const isOpen = (t: MaintenanceTicket) =>
  t.status === 'pending' || t.status === 'accepted' || t.status === 'in_progress';

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

// ── Ticket Detail Modal ──────────────────────────────────────────────────
const TicketDetailModal: React.FC<{
  ticket: MaintenanceTicket;
  onClose: () => void;
}> = ({ ticket, onClose }) => {
  const statusCfg   = STATUS_CFG[ticket.status];
  const priorityCfg = PRIORITY_CFG[ticket.priority];
  const catCfg      = CATEGORY_CFG[ticket.category];

  const STEPS: TicketStatus[] = ['pending', 'in_progress', 'resolved'];
  const currentIdx = STEPS.indexOf(ticket.status);

  return (
    <Modal transparent animationType="slide">
      <View style={dm.overlay}>
        <View style={dm.sheet}>
          <View style={dm.handle} />
          <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={dm.content}>

            {/* Header */}
            <View style={dm.header}>
              <View style={dm.headerLeft}>
                <Text style={dm.ticketCode}>{ticket.code}</Text>
                <Text style={dm.ticketTitle}>{ticket.title}</Text>
              </View>
              <View style={dm.headerRight}>
                <View style={[dm.statusBadge, { backgroundColor: statusCfg.bg }]}>
                  <Text style={[dm.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                </View>
                <TouchableOpacity onPress={onClose} style={dm.closeBtn}>
                  <Text style={dm.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Progress steps */}
            {ticket.status !== 'cancelled' && (
              <View style={dm.stepsRow}>
                {STEPS.map((step, idx) => {
                  const done = idx <= currentIdx;
                  const label = STATUS_CFG[step].label;
                  return (
                    <React.Fragment key={step}>
                      <View style={dm.step}>
                        <View style={[dm.stepDot, done && dm.stepDotDone]} />
                        <Text style={[dm.stepLabel, done && dm.stepLabelDone]}>{label}</Text>
                      </View>
                      {idx < STEPS.length - 1 && (
                        <View style={[dm.stepLine, done && idx < currentIdx && dm.stepLineDone]} />
                      )}
                    </React.Fragment>
                  );
                })}
              </View>
            )}

            {/* Details */}
            <View style={dm.section}>
              <Text style={dm.sectionTitle}>Chi tiết sự cố</Text>
              <Text style={dm.description}>{ticket.description}</Text>
            </View>

            <View style={dm.section}>
              <Text style={dm.sectionTitle}>Thông tin</Text>
              <InfoItem label="📍 Vị trí" value={`${ticket.roomName} · ${ticket.propertyName}`} />
              <InfoItem label={`${catCfg.icon} Phân loại`} value={catCfg.label} />
              <InfoItem label="🚨 Mức độ ưu tiên" value={priorityCfg.label} valueColor={priorityCfg.color} />
              <InfoItem label="📅 Ngày tạo" value={ticket.createdDate} />
              <InfoItem label="🔄 Cập nhật lần cuối" value={ticket.updatedDate} />
              {ticket.relatedEquipment && (
                <InfoItem label="⚙️ Thiết bị liên quan" value={ticket.relatedEquipment} />
              )}
            </View>

            {(ticket.assignedTech || ticket.etaDate) && (
              <View style={dm.section}>
                <Text style={dm.sectionTitle}>Kỹ thuật viên</Text>
                {ticket.assignedTech && <InfoItem label="👷 Phụ trách" value={ticket.assignedTech} />}
                {ticket.etaDate && <InfoItem label="📅 Dự kiến hoàn thành" value={ticket.etaDate} />}
              </View>
            )}

            {ticket.status === 'resolved' && (
              <View style={dm.section}>
                <Text style={dm.sectionTitle}>Kết quả xử lý</Text>
                {ticket.resolution && (
                  <View style={dm.resolutionBox}>
                    <Text style={dm.resolutionText}>{ticket.resolution}</Text>
                  </View>
                )}
                {ticket.cost && <InfoItem label="💰 Chi phí" value={fmt(ticket.cost)} accent />}
              </View>
            )}

          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const InfoItem: React.FC<{ label: string; value: string; accent?: boolean; valueColor?: string }> = ({
  label, value, accent, valueColor,
}) => (
  <View style={dm.infoRow}>
    <Text style={dm.infoLabel}>{label}</Text>
    <Text style={[dm.infoVal, accent && { color: Colors.primary, fontWeight: '700' }, valueColor ? { color: valueColor } : {}]}>
      {value}
    </Text>
  </View>
);

const dm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: SH * 0.9 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  content: { paddingHorizontal: 24, paddingBottom: 44, paddingTop: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  headerLeft: { flex: 1 },
  headerRight: { alignItems: 'flex-end', gap: 8, flexShrink: 0 },
  ticketCode: { fontSize: 12, color: '#64748B', fontWeight: '600', marginBottom: 4 },
  ticketTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A', lineHeight: 22 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 12, fontWeight: '700' },
  closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 12, color: '#64748B', fontWeight: '700' },

  stepsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingHorizontal: 4 },
  step: { alignItems: 'center', gap: 4 },
  stepDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E2E8F0', borderWidth: 2, borderColor: '#CBD5E1' },
  stepDotDone: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  stepLabel: { fontSize: 9, color: '#94A3B8', fontWeight: '600', textAlign: 'center', maxWidth: 52 },
  stepLabelDone: { color: '#7C3AED' },
  stepLine: { flex: 1, height: 2, backgroundColor: '#E2E8F0', marginBottom: 14 },
  stepLineDone: { backgroundColor: '#7C3AED' },

  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  description: { fontSize: 14, color: '#334155', lineHeight: 22, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  infoLabel: { fontSize: 13, color: '#64748B' },
  infoVal: { fontSize: 13, fontWeight: '600', color: '#0F172A', textAlign: 'right', flex: 1, marginLeft: 12 },
  resolutionBox: { backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#16A34A' },
  resolutionText: { fontSize: 13, color: '#166534', lineHeight: 20 },
});

// ── Ticket Card ──────────────────────────────────────────────────────────
const TicketCard: React.FC<{ ticket: MaintenanceTicket; onPress: () => void }> = ({ ticket, onPress }) => {
  const statusCfg   = STATUS_CFG[ticket.status];
  const priorityCfg = PRIORITY_CFG[ticket.priority];
  const catCfg      = CATEGORY_CFG[ticket.category];
  const open        = isOpen(ticket);

  return (
    <TouchableOpacity
      style={[tc.card, open && ticket.priority === 'urgent' && tc.cardUrgent]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Left accent stripe for urgent */}
      {ticket.priority === 'urgent' && open && <View style={tc.urgentStripe} />}

      {/* Top row */}
      <View style={tc.topRow}>
        <View style={tc.catBadge}>
          <Text style={tc.catIcon}>{catCfg.icon}</Text>
        </View>
        <View style={tc.topCenter}>
          <Text style={tc.title} numberOfLines={2}>{ticket.title}</Text>
          <Text style={tc.code}>{ticket.code} · {ticket.roomName}</Text>
        </View>
        <View style={[tc.statusPill, { backgroundColor: statusCfg.bg }]}>
          <Text style={[tc.statusPillText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
        </View>
      </View>

      <View style={tc.divider} />

      {/* Footer */}
      <View style={tc.footer}>
        <Text style={[tc.priority, { color: priorityCfg.color }]}>{priorityCfg.label}</Text>
        <Text style={tc.date}>
          {open && ticket.etaDate ? `ETA: ${ticket.etaDate}` : `Cập nhật: ${ticket.updatedDate}`}
        </Text>
        {ticket.assignedTech && (
          <Text style={tc.tech}>👷 {ticket.assignedTech}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const tc = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 10,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, overflow: 'hidden',
  },
  cardUrgent: { borderWidth: 1, borderColor: '#FCA5A5' },
  urgentStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: '#DC2626' },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  catBadge: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  catIcon: { fontSize: 18 },
  topCenter: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700', color: '#0F172A', lineHeight: 20, marginBottom: 2 },
  code: { fontSize: 11, color: '#64748B' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, flexShrink: 0 },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 8 },
  footer: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  priority: { fontSize: 12, fontWeight: '600' },
  date: { fontSize: 11, color: '#94A3B8' },
  tech: { fontSize: 11, color: '#64748B' },
});

// ── Main Screen ──────────────────────────────────────────────────────────
export const TenantMaintenanceScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { tenantId, tenantName, roomId, roomName, propertyId, propertyName } =
    route.params as {
      tenantId: string; tenantName: string; roomId: string; roomName: string;
      propertyId: string; propertyName: string;
    };

  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [selectedTicket, setSelectedTicket] = useState<MaintenanceTicket | null>(null);

  const allTickets = useMemo(
    () => MOCK_TICKETS.filter(t => t.tenantId === tenantId),
    [tenantId],
  );

  // Sort: open (urgent → high → medium → low) first, then resolved/cancelled
  const PRIORITY_ORDER: Record<TicketPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const STATUS_ORDER: Record<TicketStatus, number> = { pending: 0, accepted: 1, in_progress: 2, resolved: 3, cancelled: 4 };

  const sortedTickets = useMemo(() => [...allTickets].sort((a, b) => {
    const aOpen = isOpen(a);
    const bOpen = isOpen(b);
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    if (aOpen && bOpen) return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  }), [allTickets]);

  const filtered = useMemo(
    () => activeFilter === 'all' ? sortedTickets : sortedTickets.filter(t => t.status === activeFilter),
    [sortedTickets, activeFilter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allTickets.length };
    FILTERS.slice(1).forEach(f => { c[f.key] = allTickets.filter(t => t.status === f.key).length; });
    return c;
  }, [allTickets]);

  const stats = useMemo(() => ({
    open:        allTickets.filter(t => t.status === 'pending').length,
    inProgress:  allTickets.filter(t => t.status === 'accepted' || t.status === 'in_progress').length,
    resolved:    allTickets.filter(t => t.status === 'resolved').length,
  }), [allTickets]);

  const hasUrgent = allTickets.some(t => t.priority === 'urgent' && isOpen(t));

  return (
    <SafeAreaView style={ms.safe}>
      {/* Header */}
      <View style={ms.header}>
        <TouchableOpacity style={ms.backBtn} onPress={() => navigation.goBack()}>
          <Text style={ms.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={ms.headerCenter}>
          <Text style={ms.title} numberOfLines={1}>Bảo trì của {tenantName}</Text>
          <Text style={ms.subtitle}>{allTickets.length} yêu cầu</Text>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={t => t.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={ms.listContent}
        ListHeaderComponent={
          <>
            {/* Tenant pill */}
            <View style={ms.tenantPill}>
              <View style={ms.tenantAvatar}>
                <Text style={ms.tenantAvatarText}>{tenantName.charAt(0)}</Text>
              </View>
              <View style={ms.tenantInfo}>
                <Text style={ms.tenantName}>{tenantName}</Text>
                <Text style={ms.tenantSub}>{propertyName} · {roomName}</Text>
              </View>
            </View>

            {/* Urgent banner */}
            {hasUrgent && (
              <View style={ms.urgentBanner}>
                <Text style={ms.urgentBannerText}>🚨 Có yêu cầu khẩn cấp cần xử lý ngay!</Text>
              </View>
            )}

            {/* Stats row */}
            <View style={ms.statsRow}>
              <StatTile label="Chờ xử lý" value={stats.open} color="#D97706" bg="#FFFBEB" />
              <StatTile label="Đang xử lý" value={stats.inProgress} color="#7C3AED" bg="#F3E8FF" />
              <StatTile label="Hoàn thành" value={stats.resolved} color="#16A34A" bg="#F0FDF4" />
            </View>

            {/* Filters */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={ms.filterScroll}
              contentContainerStyle={ms.filterContent}
            >
              {FILTERS.map(f => {
                const active = activeFilter === f.key;
                const count  = counts[f.key];
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[ms.filterChip, active && ms.filterChipActive]}
                    onPress={() => setActiveFilter(f.key)}
                    activeOpacity={0.75}
                  >
                    <Text style={[ms.filterText, active && ms.filterTextActive]}>{f.label}</Text>
                    <View style={[ms.filterBadge, active && ms.filterBadgeActive]}>
                      <Text style={[ms.filterBadgeText, active && ms.filterBadgeTextActive]}>{count}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        }
        renderItem={({ item }) => (
          <TicketCard ticket={item} onPress={() => setSelectedTicket(item)} />
        )}
        ListEmptyComponent={
          <View style={ms.empty}>
            <Text style={ms.emptyIcon}>🔧</Text>
            <Text style={ms.emptyTitle}>Không có yêu cầu nào</Text>
            <Text style={ms.emptyDesc}>
              {activeFilter === 'all'
                ? 'Khách thuê này chưa có yêu cầu bảo trì nào.'
                : `Không có yêu cầu "${FILTERS.find(f => f.key === activeFilter)?.label}".`}
            </Text>
          </View>
        }
      />

      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
        />
      )}
    </SafeAreaView>
  );
};

const StatTile: React.FC<{ label: string; value: number; color: string; bg: string }> = ({
  label, value, color, bg,
}) => (
  <View style={[ms.statTile, { backgroundColor: bg }]}>
    <Text style={[ms.statValue, { color }]}>{value}</Text>
    <Text style={ms.statLabel}>{label}</Text>
  </View>
);

const ms = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', ...Shadow.sm },
  backBtnText: { fontSize: 28, color: '#0F172A', lineHeight: 32 },
  headerCenter: { flex: 1 },
  title: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 1 },

  listContent: { paddingHorizontal: 20, paddingBottom: 100, paddingTop: 8 },

  tenantPill: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EEF2FF', borderRadius: 12, padding: 12, marginBottom: 12 },
  tenantAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#C7D2FE', alignItems: 'center', justifyContent: 'center' },
  tenantAvatarText: { fontSize: 16, fontWeight: '800', color: '#4F46E5' },
  tenantInfo: { flex: 1 },
  tenantName: { fontSize: 14, fontWeight: '700', color: '#1E1B4B' },
  tenantSub: { fontSize: 12, color: '#4F46E5', marginTop: 1 },

  urgentBanner: { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#EF4444' },
  urgentBannerText: { fontSize: 13, fontWeight: '700', color: '#DC2626' },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statTile: { flex: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 10, color: '#64748B', marginTop: 2, textAlign: 'center', fontWeight: '500' },

  filterScroll: { flexGrow: 0, marginBottom: 12 },
  filterContent: { flexDirection: 'row', paddingTop: 4, paddingBottom: 4 },
  filterChip: {
    flexShrink: 0, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 999, backgroundColor: '#FFFFFF',
    borderWidth: 1.5, borderColor: '#E2E8F0', marginRight: 8,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  filterTextActive: { color: '#FFFFFF' },
  filterBadge: {
    backgroundColor: '#EEF2FF', borderRadius: 999,
    minWidth: 22, paddingHorizontal: 5, paddingVertical: 2,
    alignItems: 'center', justifyContent: 'center', marginLeft: 6,
  },
  filterBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  filterBadgeText: { fontSize: 11, fontWeight: '700', color: '#4F46E5', includeFontPadding: false },
  filterBadgeTextActive: { color: '#FFFFFF' },

  empty: { alignItems: 'center', paddingTop: 64, gap: 8 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#334155' },
  emptyDesc: { fontSize: 13, color: '#94A3B8', textAlign: 'center' },
});
