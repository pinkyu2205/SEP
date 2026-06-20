import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { getPropertyById, ManagedProperty, WholeHouseRentalStatus } from '../../data/managedProperties';
import { useBills } from '../../store/billsStore';
import { useTickets } from '../../store/maintenanceStore';

const STATUS_META: Record<WholeHouseRentalStatus, { label: string; color: string; bg: string }> = {
  rented: { label: 'Đang thuê', color: Colors.success, bg: Colors.successLight },
  vacant: { label: 'Trống', color: Colors.textSecondary, bg: Colors.divider },
  expiring: { label: 'Sắp hết hạn hợp đồng', color: Colors.warning, bg: Colors.warningLight },
  maintenance: { label: 'Đang bảo trì', color: Colors.error, bg: Colors.errorLight },
};

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

export const WholeHouseDetailScreen: React.FC<any> = ({ navigation, route }) => {
  const propertyId: string = route?.params?.propertyId;
  // Ưu tiên property truyền từ danh sách (dữ liệu API thật); fallback mock theo id.
  const prop = (route?.params?.property as ManagedProperty | undefined) ?? getPropertyById(propertyId);
  const allBills = useBills();
  const allTickets = useTickets(prop?.id);

  if (!prop) {
    return (
      <SafeAreaView style={s.safe}>
        <Header title="Nhà nguyên căn" onBack={() => navigation.goBack()} />
        <View style={s.emptyState}>
          <Text style={s.emptyIcon}>🏠</Text>
          <Text style={s.emptyText}>Không tìm thấy nhà nguyên căn</Text>
        </View>
      </SafeAreaView>
    );
  }

  const status = STATUS_META[prop.rentalStatus ?? 'vacant'];
  const payments = allBills.filter(bill => bill.propertyId === prop.id);
  const maintenance = allTickets;

  return (
    <SafeAreaView style={s.safe}>
      <Header title={prop.name} subtitle="Nhà nguyên căn" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.hero}>
          <View style={{ flex: 1 }}>
            <Text style={s.heroLabel}>Trạng thái thuê</Text>
            <Text style={s.heroTitle}>{status.label}</Text>
            <Text style={s.heroSub} numberOfLines={2}>{prop.address}</Text>
          </View>
          <View style={[s.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[s.statusBadgeText, { color: status.color }]}>Nhà nguyên căn</Text>
          </View>
        </View>

        <Section title="Thông tin nhà">
          <InfoRow label="Tên nhà" value={prop.name} />
          <InfoRow label="Địa chỉ" value={prop.address} />
          <InfoRow label="Khu vực" value={prop.district} />
          <InfoRow label="Số tầng" value={`${prop.totalFloors} tầng`} />
          <InfoRow label="Chủ nhà" value={prop.hostName} />
        </Section>

        <Section title="Khách thuê & hợp đồng">
          <InfoRow label="Trạng thái" value={status.label} highlight />
          <InfoRow label="Khách thuê" value={prop.tenantName || 'Chưa có khách thuê'} />
          <InfoRow label="Giá thuê" value={prop.monthlyRent ? `${fmt(prop.monthlyRent)}/tháng` : 'Chưa cấu hình'} highlight />
          <InfoRow label="Ngày hết hạn" value={prop.contractEndDate || 'Chưa có hợp đồng'} />
          <InfoRow label="Số HĐ sắp hết hạn" value={`${prop.expiringContractCount} hợp đồng`} />
        </Section>

        <Text style={s.sectionTitle}>Lịch sử thanh toán</Text>
        <View style={s.card}>
          {payments.length === 0 ? (
            <Text style={s.emptyLine}>Chưa có lịch sử thanh toán</Text>
          ) : payments.map((payment, index) => (
            <View key={payment.id} style={[s.paymentRow, index > 0 && s.rowDivider]}>
              <View>
                <Text style={s.paymentPeriod}>T{String(payment.month).padStart(2, '0')}/{payment.year}</Text>
                <Text style={s.paymentDate}>{payment.paidAt || payment.dueDate}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.paymentAmount}>{fmt(payment.grandTotal)}</Text>
                <Text style={s.paymentStatus}>{payment.status === 'paid' ? 'Đã thanh toán' : payment.status === 'overdue' ? 'Quá hạn' : 'Chưa thanh toán'}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>Chỉ số điện nước</Text>
        <View style={s.card}>
          <InfoRow label="Kỳ gần nhất" value="05/2026" />
          <InfoRow label="Điện" value="1.850 kWh → 2.110 kWh" />
          <InfoRow label="Nước" value="126 m³ → 148 m³" />
          <InfoRow label="Tạo hóa đơn" value="Tự động sau khi chốt số" highlight />
        </View>

        <Text style={s.sectionTitle}>Yêu cầu bảo trì</Text>
        <View style={s.card}>
          {maintenance.length === 0 ? (
            <Text style={s.emptyLine}>Không có yêu cầu bảo trì đang mở</Text>
          ) : maintenance.map((item, index) => (
            <View key={item.id} style={[s.maintenanceRow, index > 0 && s.rowDivider]}>
              <View style={{ flex: 1 }}>
                <Text style={s.maintenanceTitle}>{item.title}</Text>
                <Text style={s.maintenanceMeta}>{item.status} · {item.equipmentName || 'Toàn bộ nhà'}</Text>
              </View>
              <View style={s.warningDot} />
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>Thiết bị trong nhà</Text>
        <View style={s.card}>
          {(prop.wholeHouseEquipment ?? []).map((item, index) => (
            <View key={item.id} style={[s.maintenanceRow, index > 0 && s.rowDivider]}>
              <View style={{ flex: 1 }}>
                <Text style={s.maintenanceTitle}>{item.name}</Text>
                <Text style={s.maintenanceMeta}>{item.status} · QR {item.qrCode}</Text>
              </View>
              <Text style={[s.paymentStatus, { color: item.handoverTracked ? Colors.success : Colors.warning }]}>
                {item.handoverTracked ? 'Đã bàn giao' : 'Cần bàn giao'}
              </Text>
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>Checklist bàn giao</Text>
        <View style={s.card}>
          {(prop.handoverChecklist ?? []).map((item, index) => (
            <View key={item.label} style={[s.checkRow, index > 0 && s.rowDivider]}>
              <Text style={[s.checkIcon, { color: item.done ? Colors.success : Colors.warning }]}>
                {item.done ? '✓' : '○'}
              </Text>
              <Text style={s.checkLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={s.editBtn} activeOpacity={0.8}>
          <Text style={s.editBtnText}>Chỉnh sửa thông tin nhà</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const Header = ({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) => (
  <View style={s.header}>
    <TouchableOpacity style={s.backBtn} onPress={onBack}>
      <Text style={s.backBtnText}>‹</Text>
    </TouchableOpacity>
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={s.headerTitle} numberOfLines={1}>{title}</Text>
      {subtitle && <Text style={s.headerSubtitle}>{subtitle}</Text>}
    </View>
    <View style={{ width: 36 }} />
  </View>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <>
    <Text style={s.sectionTitle}>{title}</Text>
    <View style={s.card}>{children}</View>
  </>
);

const InfoRow = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
  <View style={s.infoRow}>
    <Text style={s.infoLabel}>{label}</Text>
    <Text style={[s.infoValue, highlight && { color: Colors.primary }]}>{value}</Text>
  </View>
);

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center',
  },
  backBtnText: { fontSize: 26, lineHeight: 28, color: Colors.primary, fontWeight: '900' },
  headerTitle: { fontSize: 16, color: Colors.textPrimary, fontWeight: '900' },
  headerSubtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  scroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },

  hero: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border,
    ...Shadow.sm,
  },
  heroLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '800', textTransform: 'uppercase' },
  heroTitle: { fontSize: 24, color: Colors.textPrimary, fontWeight: '900', marginTop: 2 },
  heroSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 4, lineHeight: 18 },
  statusBadge: { borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 5 },
  statusBadgeText: { fontSize: 11, fontWeight: '900' },

  sectionTitle: {
    fontSize: 14, fontWeight: '900', color: Colors.textPrimary,
    marginTop: Spacing.lg, marginBottom: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
    ...Shadow.sm,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  infoLabel: { fontSize: 12, color: Colors.textSecondary, flex: 0.9 },
  infoValue: { fontSize: 13, color: Colors.textPrimary, fontWeight: '800', flex: 1.2, textAlign: 'right' },
  rowDivider: { borderTopWidth: 1, borderTopColor: Colors.divider },
  paymentRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
  },
  paymentPeriod: { fontSize: 13, color: Colors.textPrimary, fontWeight: '900' },
  paymentDate: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  paymentAmount: { fontSize: 13, color: Colors.primary, fontWeight: '900' },
  paymentStatus: { fontSize: 11, color: Colors.success, fontWeight: '800', marginTop: 2 },
  maintenanceRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
  },
  maintenanceTitle: { fontSize: 13, color: Colors.textPrimary, fontWeight: '900' },
  maintenanceMeta: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  warningDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.warning },
  checkRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: 11,
  },
  checkIcon: { fontSize: 15, fontWeight: '900', width: 18, textAlign: 'center' },
  checkLabel: { fontSize: 13, color: Colors.textPrimary, fontWeight: '700' },
  emptyLine: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.lg },
  editBtn: {
    marginTop: Spacing.lg, backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg, paddingVertical: Spacing.md,
    alignItems: 'center', ...Shadow.sm,
  },
  editBtnText: { color: Colors.white, fontSize: 14, fontWeight: '900' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  emptyIcon: { fontSize: 42 },
  emptyText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '700' },
});
