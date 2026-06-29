import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { ManagedProperty, WholeHouseRentalStatus } from '../../data/managedProperties';
import { realTenantService, TenantContractResponse } from '../../services/tenantService.real';
import { realManagerInvoiceService, ManagerInvoice } from '../../services/managerInvoiceService.real';

const STATUS_META: Record<WholeHouseRentalStatus, { label: string; color: string; bg: string }> = {
  rented: { label: 'Đang thuê', color: Colors.success, bg: Colors.successLight },
  vacant: { label: 'Trống', color: Colors.textSecondary, bg: Colors.divider },
  expiring: { label: 'Sắp hết hạn hợp đồng', color: Colors.warning, bg: Colors.warningLight },
  maintenance: { label: 'Đang bảo trì', color: Colors.error, bg: Colors.errorLight },
};

const fmt = (n: number) => (n ?? 0).toLocaleString('vi-VN') + 'đ';
const fmtShort = (n: number) => {
  if (!n) return '0đ';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}tr`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return `${n}đ`;
};
const fmtIsoDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('vi-VN');
};

export const WholeHouseDetailScreen: React.FC<any> = ({ navigation, route }) => {
  const propertyId: string = route?.params?.propertyId;
  const prop = route?.params?.property as ManagedProperty | undefined;
  const pid = Number(propertyId ?? prop?.id);

  const [contracts, setContracts] = useState<TenantContractResponse[]>([]);
  const [invoices, setInvoices] = useState<ManagerInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!pid) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      realTenantService.listByProperty(pid).catch(() => [] as TenantContractResponse[]),
      realManagerInvoiceService.listInvoices().catch(() => [] as ManagerInvoice[]),
    ])
      .then(([c, inv]) => {
        setContracts(c);
        setInvoices(inv.filter(i => i.propertyId === pid));
      })
      .finally(() => setLoading(false));
  }, [pid]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // HĐ đang hiệu lực = nguồn xác định "đang thuê" cho nhà nguyên căn.
  const activeContract = useMemo(
    () => contracts.find(c => (c.status || '').toUpperCase() === 'ACTIVE'),
    [contracts],
  );

  const daysLeft = activeContract?.endDate
    ? Math.ceil((new Date(activeContract.endDate).getTime() - Date.now()) / 86400000)
    : null;
  const rentalStatus: WholeHouseRentalStatus = activeContract
    ? (daysLeft != null && daysLeft >= 0 && daysLeft <= 30 ? 'expiring' : 'rented')
    : 'vacant';
  const status = STATUS_META[rentalStatus];

  const monthlyRent = activeContract?.rentAmount ?? prop?.monthlyRent ?? 0;
  const depositPaid = (activeContract?.paymentStatus || '').toUpperCase() === 'PAID';

  const payments = useMemo(
    () => [...invoices].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [invoices],
  );
  const invStats = useMemo(() => {
    const paid = invoices.filter(i => i.status === 'PAID');
    const overdue = invoices.filter(i => i.status === 'OVERDUE');
    const pending = invoices.filter(i => i.status === 'PENDING');
    return {
      paidCount: paid.length,
      pendingCount: pending.length,
      overdueCount: overdue.length,
      unpaidCount: pending.length + overdue.length,
    };
  }, [invoices]);

  if (!pid) {
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

  return (
    <SafeAreaView style={s.safe}>
      <Header title={prop?.name ?? 'Nhà nguyên căn'} subtitle="Nhà nguyên căn" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero: trạng thái + chỉ số nhanh */}
        <View style={s.hero}>
          <View style={s.heroTop}>
            <View style={{ flex: 1 }}>
              <Text style={s.heroLabel}>TRẠNG THÁI THUÊ</Text>
              <Text style={[s.heroTitle, { color: status.color === Colors.textSecondary ? Colors.textPrimary : status.color }]}>
                {status.label}
              </Text>
              {!!prop?.address && <Text style={s.heroSub} numberOfLines={2}>📍 {prop.address}</Text>}
            </View>
            <View style={[s.statusBadge, { backgroundColor: status.bg }]}>
              <Text style={[s.statusBadgeText, { color: status.color }]}>Nhà nguyên căn</Text>
            </View>
          </View>

          {activeContract && (
            <View style={s.heroStats}>
              <View style={s.heroStat}>
                <Text style={s.heroStatVal}>{fmtShort(monthlyRent)}</Text>
                <Text style={s.heroStatLbl}>Giá thuê/tháng</Text>
              </View>
              <View style={s.heroStatDivider} />
              <View style={s.heroStat}>
                <Text style={[s.heroStatVal, { color: daysLeft != null && daysLeft <= 30 ? '#B45309' : Colors.textPrimary }]}>
                  {daysLeft != null ? `${daysLeft}` : '—'}
                </Text>
                <Text style={s.heroStatLbl}>Ngày còn lại HĐ</Text>
              </View>
              <View style={s.heroStatDivider} />
              <View style={s.heroStat}>
                <Text style={[s.heroStatVal, { color: invStats.unpaidCount > 0 ? '#DC2626' : '#16A34A' }]}>
                  {invStats.unpaidCount}
                </Text>
                <Text style={s.heroStatLbl}>HĐ chưa thu</Text>
              </View>
            </View>
          )}
        </View>

        {/* Thông tin nhà */}
        <Section title="Thông tin nhà">
          <InfoRow label="Tên nhà" value={prop?.name ?? '—'} />
          <InfoRow label="Địa chỉ" value={prop?.address ?? '—'} last={!prop?.district} />
          {!!prop?.district && <InfoRow label="Khu vực" value={prop.district} last />}
        </Section>

        {loading ? (
          <View style={s.loadingWrap}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : !activeContract ? (
          <View style={s.vacantCard}>
            <Text style={s.vacantEmoji}>🔑</Text>
            <Text style={s.vacantTitle}>Nhà đang trống</Text>
            <Text style={s.vacantText}>Chưa có khách thuê. Đón khách để bắt đầu hợp đồng cho nhà này.</Text>
            <TouchableOpacity style={s.vacantBtn} onPress={() => navigation.navigate('Onboarding')}>
              <Text style={s.vacantBtnText}>+ Đón khách</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Khách thuê */}
            <Section title="Khách thuê">
              <InfoRow label="Họ tên" value={activeContract.tenantFullName} />
              <InfoRow label="Điện thoại" value={activeContract.tenantPhone || '—'} />
              <InfoRow label="CCCD / MST" value={activeContract.tenantCccd || '—'} last />
            </Section>

            {/* Hợp đồng */}
            <Section title="Hợp đồng thuê">
              <InfoRow label="Mã hợp đồng" value={activeContract.contractCode || '—'} />
              <InfoRow label="Ngày vào ở" value={fmtIsoDate(activeContract.moveInDate || activeContract.startDate) || '—'} />
              <InfoRow
                label="Ngày hết hạn"
                value={activeContract.endDate
                  ? `${fmtIsoDate(activeContract.endDate)}${daysLeft != null ? ` · còn ${daysLeft} ngày` : ''}`
                  : 'Chưa có'}
                highlight={daysLeft != null && daysLeft <= 30}
              />
              <InfoRow label="Giá thuê" value={monthlyRent ? `${fmt(monthlyRent)}/tháng` : 'Chưa cấu hình'} highlight />
              <InfoRow label="Tiền cọc" value={fmt(activeContract.deposit ?? 0)} />
              <InfoRow
                label="Trạng thái cọc"
                value={depositPaid ? '✓ Đã đóng cọc' : 'Chưa đóng cọc'}
                valueColor={depositPaid ? Colors.success : Colors.warning}
                last
              />
            </Section>

            {/* Hóa đơn */}
            <Text style={s.sectionTitle}>Hóa đơn</Text>
            <View style={s.invStatsRow}>
              <View style={[s.invStat, { backgroundColor: Colors.successLight }]}>
                <Text style={[s.invStatNum, { color: Colors.success }]}>{invStats.paidCount}</Text>
                <Text style={s.invStatLbl}>Đã thu</Text>
              </View>
              <View style={[s.invStat, { backgroundColor: Colors.warningLight }]}>
                <Text style={[s.invStatNum, { color: Colors.warning }]}>{invStats.pendingCount}</Text>
                <Text style={s.invStatLbl}>Chưa thu</Text>
              </View>
              <View style={[s.invStat, { backgroundColor: Colors.errorLight }]}>
                <Text style={[s.invStatNum, { color: Colors.error }]}>{invStats.overdueCount}</Text>
                <Text style={s.invStatLbl}>Quá hạn</Text>
              </View>
            </View>
            <View style={s.card}>
              {payments.length === 0 ? (
                <Text style={s.emptyLine}>Chưa có hóa đơn</Text>
              ) : payments.map((p, index) => (
                <View key={p.id} style={[s.paymentRow, index > 0 && s.rowDivider]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.paymentPeriod}>{p.code}</Text>
                    <Text style={s.paymentDate}>
                      {p.type === 'ELECTRICITY' ? '⚡ Điện' : p.type === 'WATER' ? '💧 Nước' : '🏠 Tiền nhà'} · T{String(p.month).padStart(2, '0')}/{p.year}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={s.paymentAmount}>{fmt(p.amount)}</Text>
                    <Text style={[s.paymentStatus, {
                      color: p.status === 'PAID' ? Colors.success : p.status === 'OVERDUE' ? Colors.error : Colors.warning,
                    }]}>
                      {p.status === 'PAID' ? 'Đã thu' : p.status === 'OVERDUE' ? 'Quá hạn' : 'Chưa thu'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        <TouchableOpacity style={s.editBtn} activeOpacity={0.85} onPress={() => navigation.navigate('UtilityBilling')}>
          <Text style={s.editBtnText}>⚡ Ghi chỉ số & gửi hóa đơn</Text>
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

const InfoRow = ({ label, value, highlight, valueColor, last }: {
  label: string; value: string; highlight?: boolean; valueColor?: string; last?: boolean;
}) => (
  <View style={[s.infoRow, last && { borderBottomWidth: 0 }]}>
    <Text style={s.infoLabel}>{label}</Text>
    <Text style={[s.infoValue, highlight && { color: Colors.primary }, !!valueColor && { color: valueColor }]}>{value}</Text>
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
  loadingWrap: { paddingVertical: Spacing.xl, alignItems: 'center' },

  hero: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    padding: Spacing.lg, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  heroLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '800', textTransform: 'uppercase' },
  heroTitle: { fontSize: 24, color: Colors.textPrimary, fontWeight: '900', marginTop: 2 },
  heroSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 4, lineHeight: 18 },
  statusBadge: { borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 5 },
  statusBadgeText: { fontSize: 11, fontWeight: '900' },

  heroStats: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: Spacing.md, paddingTop: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatVal: { fontSize: 18, fontWeight: '900', color: Colors.textPrimary },
  heroStatLbl: { fontSize: 10, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },
  heroStatDivider: { width: 1, height: 30, backgroundColor: Colors.divider },

  sectionTitle: {
    fontSize: 14, fontWeight: '900', color: Colors.textPrimary,
    marginTop: Spacing.lg, marginBottom: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  infoLabel: { fontSize: 12, color: Colors.textSecondary, flex: 0.9 },
  infoValue: { fontSize: 13, color: Colors.textPrimary, fontWeight: '800', flex: 1.4, textAlign: 'right' },
  rowDivider: { borderTopWidth: 1, borderTopColor: Colors.divider },

  // Vacant
  vacantCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, marginTop: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, alignItems: 'center', ...Shadow.sm,
  },
  vacantEmoji: { fontSize: 34, marginBottom: Spacing.sm },
  vacantTitle: { fontSize: 15, fontWeight: '900', color: Colors.textPrimary, marginBottom: 4 },
  vacantText: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: Spacing.md },
  vacantBtn: { backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm },
  vacantBtnText: { color: Colors.white, fontSize: 13, fontWeight: '800' },

  // Invoice stats
  invStatsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  invStat: { flex: 1, borderRadius: BorderRadius.lg, paddingVertical: Spacing.md, alignItems: 'center' },
  invStatNum: { fontSize: 20, fontWeight: '900' },
  invStatLbl: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, fontWeight: '600' },

  paymentRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
  },
  paymentPeriod: { fontSize: 13, color: Colors.textPrimary, fontWeight: '900' },
  paymentDate: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  paymentAmount: { fontSize: 13, color: Colors.primary, fontWeight: '900' },
  paymentStatus: { fontSize: 11, fontWeight: '800', marginTop: 2 },
  emptyLine: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.lg },

  editBtn: {
    marginTop: Spacing.lg, backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg, paddingVertical: Spacing.md, alignItems: 'center', ...Shadow.sm,
  },
  editBtnText: { color: Colors.white, fontSize: 14, fontWeight: '900' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  emptyIcon: { fontSize: 42 },
  emptyText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '700' },
});
