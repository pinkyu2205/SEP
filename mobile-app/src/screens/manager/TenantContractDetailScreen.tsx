import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, Linking,
} from 'react-native';
import { showAlert } from '@/utils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Spacing, Shadow, HIDDEN_AMOUNT_TEXT } from '@/constants';

const SH = Dimensions.get('window').height;
const TODAY = new Date(2026, 4, 21);

// ── Types ────────────────────────────────────────────────────────────────
type ContractStatus = 'draft' | 'pending' | 'active' | 'expiring_soon' | 'expired' | 'terminated';

interface TenantContract {
  id: string;
  tenantId: string;
  code: string;
  tenantName: string;
  phone: string;
  propertyName: string;
  roomName: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  depositAmount: number;
  serviceCharge: number;
  electricityRate: number;
  waterRate: number;
  termMonths: number;
  status: ContractStatus;
  signingDate?: string;
  notes?: string;
}

// ── Mock data ────────────────────────────────────────────────────────────
const MOCK_CONTRACTS: TenantContract[] = [
  {
    id: 'c-mt-1', tenantId: 't1', code: 'HĐ-NT-P101-2026',
    tenantName: 'Trần Văn A', phone: '0901111001',
    propertyName: 'Nhà Nguyễn Trãi', roomName: 'P101',
    startDate: '20/01/2026', endDate: '20/01/2027',
    monthlyRent: 3500000, depositAmount: 3500000, serviceCharge: 300000,
    electricityRate: 3500, waterRate: 15000, termMonths: 12,
    status: 'active', signingDate: '15/01/2026',
  },
  {
    id: 'c-mt-2', tenantId: 't2', code: 'HĐ-NT-P102-2026',
    tenantName: 'Lê Thị B', phone: '0901111002',
    propertyName: 'Nhà Nguyễn Trãi', roomName: 'P102',
    startDate: '01/02/2026', endDate: '15/05/2026',
    monthlyRent: 3200000, depositAmount: 3200000, serviceCharge: 300000,
    electricityRate: 3500, waterRate: 15000, termMonths: 3,
    status: 'expired', signingDate: '28/01/2026',
    notes: 'Hợp đồng đã hết hạn. Cần gia hạn hoặc làm hợp đồng mới.',
  },
  {
    id: 'c-mt-3', tenantId: 't3', code: 'HĐ-NT-P201-2026',
    tenantName: 'Phạm Văn C', phone: '0901111003',
    propertyName: 'Nhà Nguyễn Trãi', roomName: 'P201',
    startDate: '15/02/2026', endDate: '15/02/2027',
    monthlyRent: 3800000, depositAmount: 3800000, serviceCharge: 300000,
    electricityRate: 3500, waterRate: 15000, termMonths: 12,
    status: 'active', signingDate: '10/02/2026',
  },
  {
    id: 'c-mt-4', tenantId: 't4', code: 'HĐ-NT-P301-2026',
    tenantName: 'Ngô Thị D', phone: '0901111004',
    propertyName: 'Nhà Nguyễn Trãi', roomName: 'P301',
    startDate: '01/03/2026', endDate: '01/03/2027',
    monthlyRent: 3500000, depositAmount: 3500000, serviceCharge: 100000,
    electricityRate: 3500, waterRate: 15000, termMonths: 12,
    status: 'active', signingDate: '25/02/2026',
  },
  {
    id: 'c-mt-5', tenantId: 't5', code: 'HĐ-NT-P302-2026',
    tenantName: 'Hoàng Thị E', phone: '0901111005',
    propertyName: 'Nhà Nguyễn Trãi', roomName: 'P302',
    startDate: '16/05/2026', endDate: '16/05/2027',
    monthlyRent: 3500000, depositAmount: 3500000, serviceCharge: 300000,
    electricityRate: 3500, waterRate: 15000, termMonths: 12,
    status: 'pending',
  },
  {
    id: 'c-mt-8', tenantId: 't8', code: 'HĐ-CMT8-P101-2026',
    tenantName: 'Bùi Văn H', phone: '0901111008',
    propertyName: 'Nhà CMT8', roomName: 'P101',
    startDate: '15/03/2026', endDate: '15/03/2027',
    monthlyRent: 4000000, depositAmount: 4000000, serviceCharge: 200000,
    electricityRate: 3500, waterRate: 15000, termMonths: 12,
    status: 'active', signingDate: '10/03/2026',
  },
  {
    id: 'c-mt-9', tenantId: 't9', code: 'HĐ-CMT8-P102-2026',
    tenantName: 'Cao Thị I', phone: '0901111009',
    propertyName: 'Nhà CMT8', roomName: 'P102',
    startDate: '20/03/2026', endDate: '20/03/2027',
    monthlyRent: 3800000, depositAmount: 3800000, serviceCharge: 200000,
    electricityRate: 3500, waterRate: 15000, termMonths: 12,
    status: 'active', signingDate: '15/03/2026',
  },
  {
    id: 'HD-NVC-2026', tenantId: 'wh-1', code: 'HĐ-NVC-2026',
    tenantName: 'Gia đình anh Minh', phone: '0909111222',
    propertyName: 'Nhà Nguyễn Văn Cừ', roomName: 'Nhà nguyên căn',
    startDate: '01/01/2026', endDate: '30/12/2026',
    monthlyRent: 12000000, depositAmount: 24000000, serviceCharge: 150000,
    electricityRate: 3500, waterRate: 15000, termMonths: 12,
    status: 'active', signingDate: '25/12/2025',
  },
  {
    id: 'HD-THD-2025', tenantId: 'wh-3', code: 'HĐ-THD-2025',
    tenantName: 'Công ty An Phú', phone: '0909333444',
    propertyName: 'Nhà Trần Hưng Đạo', roomName: 'Nhà nguyên căn',
    startDate: '15/06/2025', endDate: '15/06/2026',
    monthlyRent: 18000000, depositAmount: 36000000, serviceCharge: 500000,
    electricityRate: 3500, waterRate: 15000, termMonths: 12,
    status: 'expiring_soon', signingDate: '10/06/2025',
    notes: 'Công ty đã xác nhận muốn gia hạn thêm 12 tháng.',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────
const parseViDate = (str: string): Date => {
  const [d, m, y] = str.split('/').map(Number);
  return new Date(y, m - 1, d);
};

const getDaysRemaining = (dateStr: string): number =>
  Math.ceil((parseViDate(dateStr).getTime() - TODAY.getTime()) / 86400000);

const fmt = (n: number | null | undefined) => (n || 0).toLocaleString('vi-VN') + 'đ';

const STATUS_CFG: Record<ContractStatus, { label: string; color: string; bg: string }> = {
  draft:          { label: 'Nháp',            color: '#64748B', bg: '#F1F5F9' },
  pending:        { label: 'Chờ ký',          color: '#D97706', bg: '#FFFBEB' },
  active:         { label: 'Đang hiệu lực',   color: '#16A34A', bg: '#F0FDF4' },
  expiring_soon:  { label: 'Sắp hết hạn',     color: '#B45309', bg: '#FEF3C7' },
  expired:        { label: 'Đã hết hạn',      color: '#DC2626', bg: '#FEE2E2' },
  terminated:     { label: 'Đã chấm dứt',     color: '#6B7280', bg: '#F3F4F6' },
};

// ── Info Row ─────────────────────────────────────────────────────────────
const InfoRow: React.FC<{
  label: string; value: string; accent?: boolean; warning?: boolean;
}> = ({ label, value, accent, warning }) => (
  <View style={s.infoRow}>
    <Text style={s.infoLabel}>{label}</Text>
    <Text style={[
      s.infoVal,
      accent  && { color: Colors.primary, fontWeight: '700' },
      warning && { color: '#B45309', fontWeight: '700' },
    ]}>
      {value}
    </Text>
  </View>
);

// ── Contract Status Timeline ──────────────────────────────────────────────
const ContractTimeline: React.FC<{ status: ContractStatus; signingDate?: string; startDate: string; endDate: string }> = ({
  status, signingDate, startDate, endDate,
}) => {
  const steps: { key: string; label: string; done: boolean }[] = [
    { key: 'signed',    label: 'Đã ký',        done: !!signingDate || ['active','expiring_soon','expired','terminated'].includes(status) },
    { key: 'active',   label: 'Hiệu lực',      done: ['active','expiring_soon','expired','terminated'].includes(status) },
    { key: 'expiring', label: 'Sắp hết hạn',   done: ['expiring_soon','expired','terminated'].includes(status) },
    { key: 'ended',    label: 'Kết thúc',      done: ['expired','terminated'].includes(status) },
  ];
  return (
    <View style={s.timeline}>
      {steps.map((step, idx) => (
        <React.Fragment key={step.key}>
          <View style={s.timelineStep}>
            <View style={[s.timelineDot, step.done && s.timelineDotDone]} />
            <Text style={[s.timelineLabel, step.done && s.timelineLabelDone]}>{step.label}</Text>
          </View>
          {idx < steps.length - 1 && (
            <View style={[s.timelineLine, step.done && s.timelineLineDone]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
};

// ── Main Screen ──────────────────────────────────────────────────────────
export const TenantContractDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { tenantId, tenantName, roomId, roomName, propertyId, propertyName } =
    route.params as {
      tenantId: string; tenantName: string; roomId: string; roomName: string;
      propertyId: string; propertyName: string;
    };

  const contract = useMemo(
    () => MOCK_CONTRACTS.find(c => c.tenantId === tenantId) ?? null,
    [tenantId],
  );

  const daysRemaining = contract ? getDaysRemaining(contract.endDate) : null;
  const cfg = contract ? STATUS_CFG[contract.status] : null;

  const handleRenew = () => {
    showAlert(
      'Gia hạn hợp đồng',
      `Bạn muốn gia hạn hợp đồng cho ${tenantName}?\n\nHợp đồng mới sẽ bắt đầu ngay sau ngày ${contract?.endDate}.`,
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Xác nhận gia hạn', onPress: () => showAlert('Đã ghi nhận', 'Yêu cầu gia hạn đã được ghi nhận.') },
      ],
    );
  };

  const handleCall = () => {
    if (contract) Linking.openURL(`tel:${contract.phone}`);
  };

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.title} numberOfLines={1}>Hợp đồng của {tenantName}</Text>
          <Text style={s.subtitle}>{propertyName} · {roomName}</Text>
        </View>
      </View>

      {contract === null ? (
        // Empty state
        <View style={s.empty}>
          <Text style={s.emptyIcon}>📋</Text>
          <Text style={s.emptyTitle}>Chưa có hợp đồng</Text>
          <Text style={s.emptyDesc}>Khách thuê này chưa có hợp đồng nào.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>

          {/* Tenant summary pill */}
          <View style={s.tenantPill}>
            <View style={s.tenantAvatar}>
              <Text style={s.tenantAvatarText}>{tenantName.charAt(0)}</Text>
            </View>
            <View style={s.tenantInfo}>
              <Text style={s.tenantName}>{tenantName}</Text>
              <Text style={s.tenantSub}>{propertyName} · {roomName}</Text>
            </View>
            <TouchableOpacity style={s.callBtn} onPress={handleCall}>
              <Text style={s.callBtnText}>📞</Text>
            </TouchableOpacity>
          </View>

          {/* Contract header card */}
          <View style={s.contractCard}>
            <View style={s.contractCardTop}>
              <View>
                <Text style={s.contractCode}>{contract.code}</Text>
                <Text style={s.contractTerm}>{contract.termMonths} tháng · Ký {contract.signingDate ?? '—'}</Text>
              </View>
              <View style={[s.statusBadge, { backgroundColor: cfg!.bg }]}>
                <Text style={[s.statusText, { color: cfg!.color }]}>{cfg!.label}</Text>
              </View>
            </View>

            {/* Expiry alert */}
            {(contract.status === 'expiring_soon' || contract.status === 'expired') && (
              <View style={[s.expiryAlert, contract.status === 'expired' && { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}>
                <Text style={[s.expiryAlertText, contract.status === 'expired' && { color: '#DC2626' }]}>
                  {contract.status === 'expired'
                    ? `❌ Hết hạn ${Math.abs(daysRemaining!)} ngày trước (${contract.endDate})`
                    : `⏰ Còn ${daysRemaining} ngày đến ${contract.endDate}`}
                </Text>
              </View>
            )}

            {/* Timeline */}
            <ContractTimeline
              status={contract.status}
              signingDate={contract.signingDate}
              startDate={contract.startDate}
              endDate={contract.endDate}
            />
          </View>

          {/* Contract dates */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Thời hạn hợp đồng</Text>
            <InfoRow label="Ngày bắt đầu" value={contract.startDate} />
            <InfoRow
              label="Ngày kết thúc"
              value={contract.endDate}
              warning={contract.status === 'expiring_soon' || contract.status === 'expired'}
            />
            {daysRemaining !== null && daysRemaining > 0 && (
              <InfoRow label="Thời gian còn lại" value={`${daysRemaining} ngày`} />
            )}
          </View>

          {/* Financial terms */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Điều khoản tài chính</Text>
            {/* Tiền thuê + cọc ẩn với manager (13/08/2026). Phí dịch vụ và đơn giá
                điện/nước bên dưới VẪN hiện — manager phát hành hoá đơn cho hai khoản
                đó nên phải thấy. Xem @/constants/managerVisibility. */}
            <InfoRow label="Tiền thuê hàng tháng" value={HIDDEN_AMOUNT_TEXT} />
            <InfoRow label="Tiền đặt cọc" value={HIDDEN_AMOUNT_TEXT} />
            <InfoRow label="Phí dịch vụ / tháng" value={fmt(contract.serviceCharge)} />
            <InfoRow label="Đơn giá điện" value={`${contract.electricityRate.toLocaleString('vi-VN')}đ/kWh`} />
            <InfoRow label="Đơn giá nước" value={`${contract.waterRate.toLocaleString('vi-VN')}đ/m³`} />
          </View>

          {/* Tenant contact */}
          <View style={s.section}>
            <Text style={s.sectionTitle}>Bên thuê</Text>
            <InfoRow label="Họ và tên" value={contract.tenantName} />
            <InfoRow label="Điện thoại" value={contract.phone} />
            <InfoRow label="Tài sản" value={contract.propertyName} />
            <InfoRow label="Phòng / Nhà" value={contract.roomName} />
          </View>

          {/* Notes */}
          {contract.notes && (
            <View style={s.notesBox}>
              <Text style={s.notesLabel}>GHI CHÚ</Text>
              <Text style={s.notesText}>{contract.notes}</Text>
            </View>
          )}

          {/* Actions */}
          {(contract.status === 'active' || contract.status === 'expiring_soon' || contract.status === 'expired') && (
            <View style={s.actionsRow}>
              <TouchableOpacity style={s.renewBtn} onPress={handleRenew}>
                <Text style={s.renewBtnText}>
                  {contract.status === 'expired' ? '📋 Tạo hợp đồng mới' : '📋 Gia hạn hợp đồng'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {contract.status === 'pending' && (
            <View style={s.pendingBox}>
              <Text style={s.pendingText}>
                📝 Hợp đồng đang chờ được ký. Khi khách thuê ký xong, trạng thái sẽ cập nhật sang "Đang hiệu lực".
              </Text>
            </View>
          )}

        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', ...Shadow.sm },
  backBtnText: { fontSize: 28, color: '#0F172A', lineHeight: 32 },
  headerCenter: { flex: 1 },
  title: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 1 },

  scrollContent: { paddingHorizontal: 20, paddingBottom: 100, paddingTop: 8 },

  tenantPill: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EEF2FF', borderRadius: 12, padding: 12, marginBottom: 16 },
  tenantAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#C7D2FE', alignItems: 'center', justifyContent: 'center' },
  tenantAvatarText: { fontSize: 16, fontWeight: '800', color: '#4F46E5' },
  tenantInfo: { flex: 1 },
  tenantName: { fontSize: 14, fontWeight: '700', color: '#1E1B4B' },
  tenantSub: { fontSize: 12, color: '#4F46E5', marginTop: 1 },
  callBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#C7D2FE', alignItems: 'center', justifyContent: 'center' },
  callBtnText: { fontSize: 18 },

  contractCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 16, ...Shadow.sm },
  contractCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  contractCode: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  contractTerm: { fontSize: 12, color: '#64748B', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 12, fontWeight: '700' },

  expiryAlert: {
    backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10, marginBottom: 12,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  expiryAlertText: { fontSize: 13, fontWeight: '600', color: '#B45309' },

  timeline: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  timelineStep: { alignItems: 'center', gap: 4 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E2E8F0', borderWidth: 2, borderColor: '#CBD5E1' },
  timelineDotDone: { backgroundColor: '#4F46E5', borderColor: '#4F46E5' },
  timelineLabel: { fontSize: 9, color: '#94A3B8', fontWeight: '600', textAlign: 'center', maxWidth: 48 },
  timelineLabelDone: { color: '#4F46E5' },
  timelineLine: { flex: 1, height: 2, backgroundColor: '#E2E8F0', marginBottom: 14 },
  timelineLineDone: { backgroundColor: '#4F46E5' },

  section: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 12, ...Shadow.sm },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  infoLabel: { fontSize: 14, color: '#64748B' },
  infoVal: { fontSize: 14, fontWeight: '600', color: '#0F172A', textAlign: 'right', flex: 1, marginLeft: 12 },

  notesBox: { backgroundColor: '#FFFBEB', borderRadius: 10, padding: 14, borderLeftWidth: 3, borderLeftColor: '#F59E0B', marginBottom: 16 },
  notesLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.8, marginBottom: 4 },
  notesText: { fontSize: 13, color: '#64748B', lineHeight: 20 },

  actionsRow: { marginBottom: 12 },
  renewBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', ...Shadow.md },
  renewBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  pendingBox: { backgroundColor: '#FFFBEB', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#FDE68A', marginBottom: 12 },
  pendingText: { fontSize: 13, color: '#92400E', lineHeight: 20 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyIcon: { fontSize: 52 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#334155' },
  emptyDesc: { fontSize: 13, color: '#94A3B8', textAlign: 'center' },
});
