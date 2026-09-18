import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  Colors, Spacing, BorderRadius, Shadow,
  HIDDEN_AMOUNT_TEXT, RENT_AMOUNT_HIDDEN_NOTE,
  maskTenantPhone, maskTenantCccd,
} from '@/constants';
import { ManagedProperty, WholeHouseRentalStatus } from '@/types/managedProperty';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';
import {
  realManagerInvoiceService, ManagerInvoice, ManagerInvoiceStatus,
  invoiceKind, invoiceAmountText,
} from '@/services/manager/invoiceService';
import { serverNow } from '@/utils/serverTime';
import { EquipmentSummaryCard } from '@/components/manager/EquipmentSummaryCard';

const STATUS_META: Record<WholeHouseRentalStatus, { label: string; color: string; bg: string }> = {
  rented: { label: 'Đang thuê', color: Colors.success, bg: Colors.successLight },
  vacant: { label: 'Trống', color: Colors.textSecondary, bg: Colors.divider },
  expiring: { label: 'Sắp hết hạn hợp đồng', color: Colors.warning, bg: Colors.warningLight },
  maintenance: { label: 'Đang bảo trì', color: Colors.error, bg: Colors.errorLight },
};

/** Ngưỡng "sắp hết hạn" — khớp `propertyService.mapToManaged` để hai màn không lệch nhau. */
const EXPIRING_SOON_DAYS = 30;

const fmtIsoDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('vi-VN');
};

// ─── Hoá đơn ────────────────────────────────────────────────────────────────
const INV_TYPE: Record<string, { icon: string; label: string }> = {
  RENT:        { icon: '🏠', label: 'Tiền nhà' },
  ELECTRICITY: { icon: '⚡', label: 'Tiền điện' },
  WATER:       { icon: '💧', label: 'Tiền nước' },
  SERVICE:     { icon: '🧾', label: 'Phí dịch vụ' },
  OTHER:       { icon: '🧾', label: 'Khoản khác' },
};

const INV_STATUS: Record<ManagerInvoiceStatus, { label: string; color: string }> = {
  PAID:      { label: 'Đã thu',    color: Colors.success },
  PENDING:   { label: 'Chưa thu',  color: Colors.warning },
  OVERDUE:   { label: 'Quá hạn',   color: Colors.error },
  PARTIAL:   { label: 'Thu một phần', color: Colors.warning },
  CANCELLED: { label: 'Đã huỷ',    color: Colors.textMuted },
};

/** "2026-10" — khoá gom nhóm theo kỳ, sắp xếp được bằng so sánh chuỗi. */
const periodKey = (inv: ManagerInvoice) => `${inv.year}-${String(inv.month).padStart(2, '0')}`;
const periodLabel = (key: string) => `Tháng ${Number(key.slice(5))}/${key.slice(0, 4)}`;

type InvFilter = 'unpaid' | 'all' | 'paid';

/** Số kỳ mở sẵn; các kỳ cũ hơn nằm sau nút "Xem thêm". */
const PERIODS_SHOWN = 2;

export const WholeHouseDetailScreen: React.FC<any> = ({ navigation, route }) => {
  const propertyId: string = route?.params?.propertyId;
  const prop = route?.params?.property as ManagedProperty | undefined;
  const pid = Number(propertyId ?? prop?.id);

  const [contracts, setContracts] = useState<TenantContractResponse[]>([]);
  const [invoices, setInvoices] = useState<ManagerInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [invFilter, setInvFilter] = useState<InvFilter>('all');
  const [expandAll, setExpandAll] = useState(false);

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

  // Giờ SERVER, không phải giờ máy — máy lệch ngày là số ngày còn lại sai theo.
  const daysLeft = activeContract?.endDate
    ? Math.ceil((new Date(activeContract.endDate).getTime() - serverNow().getTime()) / 86400000)
    : null;
  const rentalStatus: WholeHouseRentalStatus = activeContract
    ? (daysLeft != null && daysLeft >= 0 && daysLeft <= EXPIRING_SOON_DAYS ? 'expiring' : 'rented')
    : 'vacant';
  const status = STATUS_META[rentalStatus];
  const depositPaid = (activeContract?.paymentStatus || '').toUpperCase() === 'PAID';

  const invStats = useMemo(() => {
    const by = (st: ManagerInvoiceStatus) => invoices.filter(i => i.status === st).length;
    const pending = by('PENDING') + by('PARTIAL');
    const overdue = by('OVERDUE');
    return { paid: by('PAID'), pending, overdue, unpaid: pending + overdue };
  }, [invoices]);

  /** Kỳ hiện tại theo giờ server — dùng để nhắc quản lý còn thiếu hoá đơn nào. */
  const thisPeriod = useMemo(() => {
    const now = serverNow();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const inPeriod = invoices.filter(i => periodKey(i) === key && i.status !== 'CANCELLED');
    const kinds = new Set(inPeriod.map(i => i.type));
    return {
      key,
      issued: (['RENT', 'ELECTRICITY', 'WATER'] as const).filter(t => kinds.has(t)).length,
      missing: (['ELECTRICITY', 'WATER'] as const).filter(t => !kinds.has(t)),
    };
  }, [invoices]);

  /** Lọc → gom theo kỳ, kỳ mới nhất lên đầu. */
  const periods = useMemo(() => {
    const visible = invoices.filter(i => {
      if (invFilter === 'paid') return i.status === 'PAID';
      if (invFilter === 'unpaid') return i.status !== 'PAID' && i.status !== 'CANCELLED';
      return true;
    });
    const map = new Map<string, ManagerInvoice[]>();
    for (const i of visible) {
      const k = periodKey(i);
      const bucket = map.get(k);
      if (bucket) bucket.push(i);
      else map.set(k, [i]);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      // Trong một kỳ: chưa thu lên trước, rồi theo loại cho thứ tự luôn giống nhau.
      .map(([key, list]) => [key, list.sort((a, b) => {
        const rank = (i: ManagerInvoice) => (i.status === 'PAID' ? 1 : 0);
        return rank(a) - rank(b) || a.type.localeCompare(b.type);
      })] as const);
  }, [invoices, invFilter]);

  const shownPeriods = expandAll ? periods : periods.slice(0, PERIODS_SHOWN);
  const hiddenPeriods = periods.length - shownPeriods.length;

  const callTenant = () => {
    const phone = activeContract?.tenantPhone;
    if (phone) Linking.openURL(`tel:${phone}`).catch(() => {});
  };

  const openInvoices = () => {
    if (!activeContract) return;
    navigation.navigate('TenantInvoices', {
      tenantId: activeContract.tenantUserId,
      tenantName: activeContract.tenantFullName,
      propertyId: activeContract.propertyId,
      propertyName: prop?.name,
      // Ghép hoá đơn theo HỢP ĐỒNG: sổ bên kia không phải suy từ số phòng nữa,
      // và không kéo nhầm hoá đơn của đời khách trước ở cùng căn này.
      contractId: activeContract.id,
    });
  };

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
        {/* Hero: trạng thái + ba chỉ số quyết định việc phải làm hôm nay */}
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
              {/*
                Ô "Giá thuê/tháng" cũ hiện `•••` — chiếm một phần ba hàng chỉ số quan
                trọng nhất màn hình để nói "không cho bạn xem". Thay bằng tình trạng
                hoá đơn KỲ NÀY: đó mới là việc quản lý phải làm, và nối thẳng với nút
                "Ghi chỉ số & gửi hoá đơn" ở cuối trang.
              */}
              <HeroStat
                value={`${thisPeriod.issued}/3`}
                label={`Hoá đơn T${Number(thisPeriod.key.slice(5))}`}
                color={thisPeriod.issued < 3 ? Colors.warning : Colors.success}
              />
              <View style={s.heroStatDivider} />
              <HeroStat
                value={daysLeft != null ? String(daysLeft) : '—'}
                label="Ngày còn lại HĐ"
                color={daysLeft != null && daysLeft <= EXPIRING_SOON_DAYS ? Colors.warning : Colors.textPrimary}
              />
              <View style={s.heroStatDivider} />
              <HeroStat
                value={String(invStats.unpaid)}
                label="Hoá đơn chưa thu"
                color={invStats.unpaid > 0 ? Colors.error : Colors.success}
              />
            </View>
          )}
        </View>

        {loading ? (
          <View style={s.loadingWrap}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : !activeContract ? (
          <View style={s.vacantCard}>
            <Text style={s.vacantEmoji}>🔑</Text>
            <Text style={s.vacantTitle}>Nhà đang trống</Text>
            <Text style={s.vacantText}>Chưa có khách thuê. Hồ sơ khách do admin soạn sẵn, mở danh sách để nhận và đón khách.</Text>
            <TouchableOpacity style={s.vacantBtn} onPress={() => navigation.navigate('ResumeContract')}>
              <Text style={s.vacantBtnText}>🤝  Khách chờ đón</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Khách thuê */}
            <View style={s.sectionHead}>
              <Text style={s.sectionTitleInline}>Khách thuê</Text>
              {!!activeContract.tenantPhone && (
                <TouchableOpacity style={s.linkBtn} onPress={callTenant} activeOpacity={0.7}>
                  <Text style={s.linkBtnText}>📞 Gọi khách</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={s.card}>
              <InfoRow label="Họ tên" value={activeContract.tenantFullName} />
              {/*
                SĐT/CCCD của khách CHE với quản lý (xem `constants/managerVisibility`) —
                bản cũ in trọn số ra màn hình. Giữ 3 số cuối là đủ để đối chiếu ai vừa
                gọi cho mình, còn muốn liên lạc thì bấm "Gọi khách" — nút đó mở app điện
                thoại bằng số lấy từ dữ liệu, không hiện số ra.
              */}
              <InfoRow label="Điện thoại" value={maskTenantPhone(activeContract.tenantPhone)} />
              <InfoRow label="CCCD / MST" value={maskTenantCccd(activeContract.tenantCccd)} last />
            </View>

            {/* Hợp đồng */}
            <Text style={s.sectionTitle}>Hợp đồng thuê</Text>
            <View style={s.card}>
              <InfoRow label="Mã hợp đồng" value={activeContract.contractCode || '—'} />
              <InfoRow label="Ngày vào ở" value={fmtIsoDate(activeContract.moveInDate || activeContract.startDate) || '—'} />
              <InfoRow
                label="Ngày hết hạn"
                value={activeContract.endDate
                  ? `${fmtIsoDate(activeContract.endDate)}${daysLeft != null ? ` · còn ${daysLeft} ngày` : ''}`
                  : 'Chưa có'}
                highlight={daysLeft != null && daysLeft <= EXPIRING_SOON_DAYS}
              />
              {/*
                Bản cũ có HAI dòng "Giá thuê" và "Tiền cọc", cả hai cùng ghi đúng một
                chữ "Hệ thống thu". Hai dòng, không dòng nào mang thêm thông tin. Gộp
                lại một dòng và nói rõ lý do ở ghi chú bên dưới.
              */}
              <InfoRow
                label={`Giá thuê & cọc${activeContract.depositMonths ? ` (${activeContract.depositMonths} tháng)` : ''}`}
                value={HIDDEN_AMOUNT_TEXT}
                muted
              />
              <InfoRow
                label="Trạng thái cọc"
                value={depositPaid ? '✓ Đã đóng cọc' : 'Chưa đóng cọc'}
                valueColor={depositPaid ? Colors.success : Colors.warning}
                last
              />
            </View>
            <Text style={s.note}>{RENT_AMOUNT_HIDDEN_NOTE}</Text>

            {/* ── Hoá đơn ── */}
            <View style={s.sectionHead}>
              <Text style={s.sectionTitleInline}>Hoá đơn</Text>
              <TouchableOpacity style={s.linkBtn} onPress={openInvoices} activeOpacity={0.7}>
                <Text style={s.linkBtnText}>Mở sổ hoá đơn ›</Text>
              </TouchableOpacity>
            </View>

            {/*
              Ba ô đếm cũ chỉ để nhìn. Nay chính chúng là bộ lọc — thấy "1 chưa thu"
              rồi bấm vào là ra ngay hoá đơn đó, không phải dò trong danh sách dài.
            */}
            <View style={s.invStatsRow}>
              <CountTab
                n={invStats.unpaid} label="Chưa thu" tone={Colors.warning} bg={Colors.warningLight}
                active={invFilter === 'unpaid'} onPress={() => setInvFilter(invFilter === 'unpaid' ? 'all' : 'unpaid')}
              />
              <CountTab
                n={invStats.paid} label="Đã thu" tone={Colors.success} bg={Colors.successLight}
                active={invFilter === 'paid'} onPress={() => setInvFilter(invFilter === 'paid' ? 'all' : 'paid')}
              />
              <CountTab
                n={invStats.overdue} label="Quá hạn" tone={Colors.error} bg={Colors.errorLight}
                active={false} onPress={() => setInvFilter('unpaid')}
              />
            </View>

            {periods.length === 0 ? (
              <View style={s.card}>
                <Text style={s.emptyLine}>
                  {invFilter === 'all' ? 'Chưa có hoá đơn nào' : 'Không có hoá đơn nào ở nhóm này'}
                </Text>
              </View>
            ) : (
              <>
                {/*
                  Gom theo KỲ thay vì đổ phẳng theo ngày tạo. Mỗi tháng có 3 hoá đơn
                  (nhà · điện · nước) nên sau một năm danh sách phẳng là 36 dòng giống
                  hệt nhau, không mốc nào để bám. Gom lại thì đọc đúng theo cách quản lý
                  nghĩ: "tháng 10 xong chưa?".
                */}
                {shownPeriods.map(([key, list]) => {
                  const unpaid = list.filter(i => i.status !== 'PAID' && i.status !== 'CANCELLED').length;
                  return (
                    <View key={key} style={s.periodBlock}>
                      <View style={s.periodHead}>
                        <Text style={s.periodTitle}>{periodLabel(key)}</Text>
                        <Text style={[s.periodMeta, unpaid > 0 && { color: Colors.warning }]}>
                          {unpaid > 0 ? `${unpaid} chưa thu` : 'Đã thu đủ'}
                        </Text>
                      </View>
                      <View style={s.card}>
                        {list.map((inv, idx) => (
                          <InvoiceRow key={inv.id} inv={inv} first={idx === 0} />
                        ))}
                      </View>
                    </View>
                  );
                })}

                {hiddenPeriods > 0 && (
                  <TouchableOpacity style={s.moreBtn} onPress={() => setExpandAll(true)} activeOpacity={0.7}>
                    <Text style={s.moreBtnText}>Xem thêm {hiddenPeriods} kỳ trước ▾</Text>
                  </TouchableOpacity>
                )}
                {expandAll && periods.length > PERIODS_SHOWN && (
                  <TouchableOpacity style={s.moreBtn} onPress={() => setExpandAll(false)} activeOpacity={0.7}>
                    <Text style={s.moreBtnText}>Thu gọn ▴</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/*
              Nút nằm TRONG nhánh có hợp đồng — trước đây nó nằm ngoài nên nhà đang
              trống cũng hiện, mà bấm vào là ngõ cụt: BE ném `NO_ACTIVE_CONTRACT`
              (`UtilityInvoiceServiceImpl.createFromWholeHouseBill`).
            */}
            <TouchableOpacity style={s.editBtn} activeOpacity={0.85} onPress={() => navigation.navigate('UtilityBilling')}>
              <Text style={s.editBtnText}>⚡ Ghi chỉ số & gửi hoá đơn</Text>
            </TouchableOpacity>
            {thisPeriod.missing.length > 0 && (
              <Text style={s.editHint}>
                Kỳ này chưa có hoá đơn {thisPeriod.missing.map(t => INV_TYPE[t].label.toLowerCase()).join(' và ')}
              </Text>
            )}
          </>
        )}

        {/*
          Nằm NGOÀI nhánh có hợp đồng: đồ đạc được kiểm kê từ lúc tiếp nhận nhà, nhà đang
          trống vẫn phải xem và cập nhật được (vd. trước khi đón khách mới).
        */}
        {!loading && Number.isFinite(pid) && (
          <View style={{ marginTop: Spacing.lg }}>
            <EquipmentSummaryCard
              propertyId={pid}
              onOpen={() => navigation.navigate('Equipment', { propertyId: pid })}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// ─── Thành phần nhỏ ─────────────────────────────────────────────────────────
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

const HeroStat = ({ value, label, color }: { value: string; label: string; color: string }) => (
  <View style={s.heroStat}>
    <Text style={[s.heroStatVal, { color }]}>{value}</Text>
    <Text style={s.heroStatLbl}>{label}</Text>
  </View>
);

const CountTab = ({ n, label, tone, bg, active, onPress }: {
  n: number; label: string; tone: string; bg: string; active: boolean; onPress: () => void;
}) => (
  <TouchableOpacity
    style={[s.invStat, { backgroundColor: bg }, active && { borderColor: tone, borderWidth: 2 }]}
    onPress={onPress}
    activeOpacity={0.75}
    disabled={n === 0}
  >
    <Text style={[s.invStatNum, { color: tone, opacity: n === 0 ? 0.4 : 1 }]}>{n}</Text>
    <Text style={[s.invStatLbl, { opacity: n === 0 ? 0.5 : 1 }]}>{label}</Text>
  </TouchableOpacity>
);

const InvoiceRow = ({ inv, first }: { inv: ManagerInvoice; first: boolean }) => {
  const meta = invoiceKind(inv);
  const st = INV_STATUS[inv.status] ?? INV_STATUS.PENDING;
  const amount = invoiceAmountText(inv);
  const unpaid = inv.status !== 'PAID' && inv.status !== 'CANCELLED';

  return (
    <View style={[s.invRow, !first && s.rowDivider]}>
      <View style={s.invLeft}>
        {/* Loại hoá đơn là tiêu đề, MÃ hoá đơn xuống dòng phụ. Bản cũ làm ngược:
            "HD-WAT-5" to đậm ở trên — một chuỗi quản lý không dùng vào việc gì. */}
        <Text style={s.invTitle} numberOfLines={1}>{meta.icon}  {meta.label}</Text>
        <Text style={s.invCode} numberOfLines={1}>
          {inv.code}
          {unpaid && !!inv.dueDate && ` · hạn ${fmtIsoDate(inv.dueDate)}`}
        </Text>
      </View>
      <View style={s.invRight}>
        {amount
          ? <Text style={s.invAmount}>{amount}</Text>
          : <Text style={s.invAmountHidden}>{HIDDEN_AMOUNT_TEXT}</Text>}
        <Text style={[s.invStatus, { color: st.color }]}>{st.label}</Text>
      </View>
    </View>
  );
};

const InfoRow = ({ label, value, highlight, valueColor, muted, last }: {
  label: string; value: string; highlight?: boolean; valueColor?: string; muted?: boolean; last?: boolean;
}) => (
  <View style={[s.infoRow, last && { borderBottomWidth: 0 }]}>
    <Text style={s.infoLabel}>{label}</Text>
    <Text style={[
      s.infoValue,
      highlight && { color: Colors.primary },
      muted && { color: Colors.textMuted, fontWeight: '700' },
      !!valueColor && { color: valueColor },
    ]}>{value}</Text>
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

  sectionHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: Spacing.lg, marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 14, fontWeight: '900', color: Colors.textPrimary,
    marginTop: Spacing.lg, marginBottom: Spacing.sm,
  },
  /** Trong `sectionHead` thì khoảng cách do chính hàng đó lo — tiêu đề phải bỏ
      margin, không thì lệch trục dọc với nút bên phải và cách hai lần. */
  sectionTitleInline: { fontSize: 14, fontWeight: '900', color: Colors.textPrimary },
  linkBtn: { paddingVertical: 4, paddingHorizontal: 2 },
  linkBtnText: { fontSize: 12, fontWeight: '800', color: Colors.primary },
  note: {
    fontSize: 11, color: Colors.textMuted, lineHeight: 16,
    marginTop: Spacing.sm, paddingHorizontal: 2,
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

  // Hoá đơn
  invStatsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  invStat: {
    flex: 1, borderRadius: BorderRadius.lg, paddingVertical: Spacing.md,
    alignItems: 'center', borderWidth: 2, borderColor: 'transparent',
  },
  invStatNum: { fontSize: 20, fontWeight: '900' },
  invStatLbl: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, fontWeight: '600' },

  periodBlock: { marginBottom: Spacing.md },
  periodHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 6, paddingHorizontal: 2,
  },
  periodTitle: { fontSize: 12, fontWeight: '900', color: Colors.textSecondary },
  periodMeta: { fontSize: 11, fontWeight: '800', color: Colors.success },

  invRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, gap: Spacing.sm,
  },
  invLeft: { flex: 1, minWidth: 0 },
  invRight: { alignItems: 'flex-end' },
  invTitle: { fontSize: 13, color: Colors.textPrimary, fontWeight: '800' },
  invCode: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  invAmount: { fontSize: 13, color: Colors.textPrimary, fontWeight: '900' },
  /** Tiền nhà bị BE mask — hiện chữ, KHÔNG hiện "0đ" (đọc thành thu 0 đồng). */
  invAmountHidden: { fontSize: 12, color: Colors.textMuted, fontWeight: '700' },
  invStatus: { fontSize: 11, fontWeight: '800', marginTop: 2 },
  emptyLine: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.lg },

  moreBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  moreBtnText: { fontSize: 12, fontWeight: '800', color: Colors.primary },

  editBtn: {
    marginTop: Spacing.lg, backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg, paddingVertical: Spacing.md, alignItems: 'center', ...Shadow.sm,
  },
  editBtnText: { color: Colors.white, fontSize: 14, fontWeight: '900' },
  editHint: { fontSize: 11, color: Colors.warning, fontWeight: '700', textAlign: 'center', marginTop: 6 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  emptyIcon: { fontSize: 42 },
  emptyText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '700' },
});
