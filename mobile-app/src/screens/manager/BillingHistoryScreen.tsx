import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { billMonthLabel } from '@/utils';
import { managerPropertyService } from '@/services/manager/propertyService';
import {
  realManagerInvoiceService, ManagerInvoice, ManagerInvoiceType, ManagerInvoiceStatus,
} from '@/services/manager/invoiceService';

/**
 * LỊCH SỬ HOÁ ĐƠN THEO TỪNG NHÀ.
 *
 * Màn "Hoá đơn & Thanh toán" chỉ cho thấy kỳ hiện tại; chỗ này để tra ngược mọi kỳ đã
 * qua của MỘT nhà: nhà nhiều phòng gom theo từng phòng, nhà nguyên căn gom thành một
 * mục. Vào từ nút "Lịch sử" ở màn Hoá đơn & Thanh toán, hoặc mở thẳng kèm
 * `route.params.propertyId`.
 *
 * Dữ liệu thật: GET /api/v1/manager/invoices — KHÔNG truyền `period` để lấy mọi kỳ.
 */

const fmt = (n: number) => (n || 0).toLocaleString('vi-VN') + 'đ';

/** Bỏ dấu + thường hoá — gõ "trang" ra "Đỗ Minh Trang". */
const norm = (s: string) =>
  (s || '').normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').replace(/[đĐ]/g, 'd').toLowerCase();

const periodText = (key: string) => {
  const [y, m] = key.split('-');
  return m ? `T${m}/${y}` : key;
};
const monthKey = (i: ManagerInvoice) => `${i.year}-${String(i.month).padStart(2, '0')}`;
/** Hoá đơn không thuộc kỳ nào (thu lúc nhận phòng) thì để gạch, đừng ra "Tnull/undefined". */
const monthText = (i: ManagerInvoice) => billMonthLabel(i) ?? '—';

const TYPE_CFG: Record<string, { icon: string; label: string; color: string; bg: string }> = {
  RENT:        { icon: '🏠', label: 'Tiền phòng', color: '#7C3AED', bg: '#F5F3FF' },
  ELECTRICITY: { icon: '⚡', label: 'Điện',        color: '#D97706', bg: '#FEF9C3' },
  WATER:       { icon: '💧', label: 'Nước',        color: '#2563EB', bg: '#DBEAFE' },
  SERVICE:     { icon: '🧹', label: 'Dịch vụ',     color: '#0891B2', bg: '#ECFEFF' },
  OTHER:       { icon: '🧾', label: 'Khác',        color: '#64748B', bg: '#F1F5F9' },
};
const typeCfg = (t?: string) => TYPE_CFG[(t || 'OTHER').toUpperCase()] ?? TYPE_CFG.OTHER;

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  PAID:      { label: 'Đã thu',       color: Colors.success,   bg: Colors.successLight },
  PENDING:   { label: 'Chưa thu',     color: Colors.warning,   bg: Colors.warningLight },
  OVERDUE:   { label: 'Quá hạn',      color: Colors.error,     bg: Colors.errorLight },
  PARTIAL:   { label: 'Thu một phần', color: Colors.info,      bg: Colors.infoLight },
  CANCELLED: { label: 'Đã huỷ',       color: Colors.textMuted, bg: Colors.background },
};
const statusCfg = (s?: string) => STATUS_CFG[(s || '').toUpperCase()] ?? STATUS_CFG.PENDING;

const TYPE_FILTERS: { key: 'all' | ManagerInvoiceType; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'RENT', label: '🏠 Tiền phòng' },
  { key: 'ELECTRICITY', label: '⚡ Điện' },
  { key: 'WATER', label: '💧 Nước' },
];
const STATUS_FILTERS: { key: 'all' | ManagerInvoiceStatus; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'PAID', label: 'Đã thu' },
  { key: 'PENDING', label: 'Chưa thu' },
  { key: 'OVERDUE', label: 'Quá hạn' },
];

interface PropItem { id: number; name: string; wholeHouse: boolean }
/** Một đơn vị thu tiền: 1 phòng, hoặc cả căn với nhà nguyên căn. */
interface UnitGroup { key: string; title: string; invoices: ManagerInvoice[] }

export const BillingHistoryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const paramPropertyId: number | undefined = route.params?.propertyId != null
    ? Number(route.params.propertyId) : undefined;

  const [props, setProps] = useState<PropItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(paramPropertyId ?? null);
  const [invoices, setInvoices] = useState<ManagerInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | ManagerInvoiceType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ManagerInvoiceStatus>('all');
  /** Phòng đang mở rộng — mặc định đóng để nhìn được toàn cảnh trước. */
  const [openUnit, setOpenUnit] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [scoped, list] = await Promise.all([
        managerPropertyService.getScopedProperties(),
        realManagerInvoiceService.listInvoices().catch(() => [] as ManagerInvoice[]),
      ]);
      const items = scoped.map(p => ({
        id: p.id, name: p.propertyName, wholeHouse: p.wholeHouse === true,
      }));
      setProps(items);
      setInvoices(list);
      // Chỉ khoá vào 1 nhà khi được mở kèm propertyId (bấm từ thẻ nhà cụ thể).
      // Vào từ "Lịch sử các kỳ" thì KHÔNG tự chọn nhà đầu tiên — trước đây
      // `?? items[0]?.id` làm màn luôn chỉ hiện đúng một nhà và không có cách xem hết.
      setSelectedId(prev => prev ?? paramPropertyId ?? null);
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [paramPropertyId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const selectedProp = props.find(p => p.id === selectedId) ?? null;

  /**
   * Các kỳ CÓ THẬT trong dữ liệu của nhà đang chọn, mới nhất trước.
   * Nhà thuê 1–2 năm là ra 12–24 kỳ; đổ hết ra một trang thì không đọc nổi, nên
   * mặc định chỉ xem kỳ mới nhất và cho chuyển kỳ bằng hàng chip bên dưới.
   */
  const periods = useMemo(() => {
    const scoped = invoices.filter(i => selectedId === null || i.propertyId === selectedId);
    return [...new Set(scoped.map(monthKey))].sort((a, b) => b.localeCompare(a));
  }, [invoices, selectedId]);

  /** '' = kỳ mới nhất (mặc định), 'all' = mọi kỳ, còn lại là 'YYYY-MM'. */
  const [periodFilter, setPeriodFilter] = useState<string>('');
  const activePeriod = periodFilter || periods[0] || '';

  /** Tìm không dấu theo khách / phòng / nhà / mã hoá đơn. */
  const [search, setSearch] = useState('');
  const kw = norm(search.trim());

  /** selectedId = null → xem TẤT CẢ nhà mình phụ trách. */
  const filtered = useMemo(() => invoices.filter(i =>
    (selectedId === null || i.propertyId === selectedId)
    && (periodFilter === 'all' || monthKey(i) === activePeriod)
    && (typeFilter === 'all' || i.type === typeFilter)
    && (statusFilter === 'all' || i.status === statusFilter)
    && (!kw || [i.tenantName, i.roomNumber, i.propertyName, i.code]
      .some(v => norm(v || '').includes(kw))),
  ), [invoices, selectedId, periodFilter, activePeriod, typeFilter, statusFilter, kw]);

  /** Gom theo phòng (nhà nhiều phòng) hoặc gộp 1 mục (nhà nguyên căn). */
  const groups: UnitGroup[] = useMemo(() => {
    // Xem tất cả nhà → gom theo NHÀ (gom theo phòng sẽ trộn phòng 101 của nhiều nhà
    // vào chung một mục). Chọn 1 nhà → gom theo phòng như trước.
    if (selectedId === null) {
      const byProp = new Map<number, { name: string; list: ManagerInvoice[] }>();
      for (const inv of filtered) {
        const cur = byProp.get(inv.propertyId) ?? { name: inv.propertyName, list: [] };
        cur.list.push(inv);
        byProp.set(inv.propertyId, cur);
      }
      return [...byProp.entries()]
        // Nhà còn nợ nhiều nhất lên đầu — đó là nhà cần nhìn trước.
        .sort((a, b) =>
          b[1].list.filter(x => x.status === 'OVERDUE').length
          - a[1].list.filter(x => x.status === 'OVERDUE').length)
        .map(([id, v]) => ({ key: `p-${id}`, title: v.name, invoices: v.list }));
    }
    if (!selectedProp) return [];
    if (selectedProp.wholeHouse) {
      return filtered.length ? [{ key: 'whole', title: 'Nhà nguyên căn', invoices: filtered }] : [];
    }
    const byRoom = new Map<string, ManagerInvoice[]>();
    for (const inv of filtered) {
      const key = inv.roomNumber || '—';
      byRoom.set(key, [...(byRoom.get(key) ?? []), inv]);
    }
    return [...byRoom.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'vi', { numeric: true }))
      .map(([room, list]) => ({ key: room, title: `Phòng ${room}`, invoices: list }));
  }, [filtered, selectedProp, selectedId]);

  // Đếm theo SỐ HOÁ ĐƠN, không cộng tiền: danh sách trộn cả tiền phòng lẫn điện/nước,
  // mà tiền phòng thì manager không được thấy (@/constants/managerVisibility) — cộng
  // gộp lại là lộ gián tiếp.
  const totals = useMemo(() => {
    const paid = filtered.filter(i => i.status === 'PAID');
    const unpaid = filtered.filter(i => i.status === 'PENDING' || i.status === 'OVERDUE');
    return {
      count: filtered.length,
      paidCount: paid.length,
      unpaidCount: unpaid.length,
      overdueCount: filtered.filter(i => i.status === 'OVERDUE').length,
      /** Số kỳ đã phát hành — cho biết lịch sử dài tới đâu. */
      periods: new Set(filtered.map(monthKey)).size,
    };
  }, [filtered]);

  const renderInvoice = (inv: ManagerInvoice) => {
    const tc = typeCfg(inv.type);
    const sc = statusCfg(inv.status);
    return (
      <View key={inv.id} style={s.invRow}>
        <View style={[s.typeChip, { backgroundColor: tc.bg }]}>
          <Text style={s.typeChipText}>{tc.icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.invTitle}>{tc.label} · {monthText(inv)}</Text>
          <Text style={s.invMeta}>
            {inv.code}{inv.tenantName ? ` · ${inv.tenantName}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {/* Tiền phòng: ẩn số tiền. Điện/nước: vẫn hiện vì manager tự chốt số. */}
          <Text style={s.invAmount}>
            {(inv.type || '').toUpperCase() === 'RENT' ? '' : fmt(inv.amount)}
          </Text>
          <View style={[s.statusChip, { backgroundColor: sc.bg }]}>
            <Text style={[s.statusChipText, { color: sc.color }]}>{sc.label}</Text>
          </View>
        </View>
      </View>
    );
  };

  /** Trong một phòng: chia tiếp theo kỳ, mới nhất trước. */
  const renderGroup = (g: UnitGroup) => {
    const open = openUnit === g.key;
    const paidCount = g.invoices.filter(i => i.status === 'PAID').length;
    const unpaidCount = g.invoices.filter(i => i.status !== 'PAID' && i.status !== 'CANCELLED').length;
    const byMonth = new Map<string, ManagerInvoice[]>();
    for (const inv of g.invoices) byMonth.set(monthKey(inv), [...(byMonth.get(monthKey(inv)) ?? []), inv]);
    const months = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));

    return (
      <View key={g.key} style={s.groupCard}>
        <TouchableOpacity
          style={s.groupHeader}
          onPress={() => setOpenUnit(open ? null : g.key)}
          activeOpacity={0.75}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.groupTitle}>{g.title}</Text>
            <Text style={s.groupMeta}>
              {g.invoices.length} hoá đơn · {months.length} kỳ · đã thu {paidCount}
              {unpaidCount > 0 ? ` · còn ${unpaidCount} chưa thu` : ''}
            </Text>
          </View>
          <Text style={s.groupChevron}>{open ? '⌄' : '›'}</Text>
        </TouchableOpacity>

        {/* Màn lịch sử chỉ để TRA CỨU — muốn ghi nhận thanh toán / thao tác thì sang
            màn thu tiền của nhà đó (BuildingBilling), giống hệt khi bấm thẻ nhà ở
            màn Hoá đơn tiền nhà. Trước đây vào đây là cụt đường, không làm gì được. */}
        {open && unpaidCount > 0 && (
          <TouchableOpacity
            style={s.groupAction}
            activeOpacity={0.75}
            onPress={() => {
              const inv = g.invoices[0];
              navigation.navigate('BuildingBilling', {
                propertyId: String(inv.propertyId), propertyName: inv.propertyName,
              });
            }}
          >
            <Text style={s.groupActionText}>💵  Ghi nhận thanh toán · còn {unpaidCount} hoá đơn  →</Text>
          </TouchableOpacity>
        )}

        {/* Mỗi KỲ là một khối riêng có thanh tiêu đề + tình trạng thu của chính kỳ đó.
            Trước đây chỉ có một dòng chữ nhỏ "KỲ 08/2026" rồi đổ thẳng hoá đơn ra,
            xem nhiều kỳ liền nhau là không biết hoá đơn nào thuộc kỳ nào. */}
        {open && months.map(m => {
          const list = byMonth.get(m)!;
          const [y, mm] = m.split('-');
          const mPaid = list.filter(i => i.status === 'PAID').length;
          const mOverdue = list.filter(i => i.status === 'OVERDUE').length;
          const allPaid = mPaid === list.length;
          return (
            <View key={m} style={s.monthBlock}>
              <View style={s.monthBar}>
                <Text style={s.monthTitle}>Kỳ {mm}/{y}</Text>
                <View style={s.monthBadges}>
                  {mOverdue > 0 && (
                    <View style={[s.monthPill, { backgroundColor: Colors.errorLight }]}>
                      <Text style={[s.monthPillText, { color: Colors.error }]}>{mOverdue} quá hạn</Text>
                    </View>
                  )}
                  <View style={[s.monthPill, {
                    backgroundColor: allPaid ? Colors.successLight : Colors.background,
                  }]}>
                    <Text style={[s.monthPillText, {
                      color: allPaid ? Colors.success : Colors.textSecondary,
                    }]}>
                      {allPaid ? `✓ đã thu đủ ${list.length}` : `đã thu ${mPaid}/${list.length}`}
                    </Text>
                  </View>
                </View>
              </View>
              {list
                .slice()
                .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
                .map(renderInvoice)}
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Lịch sử hoá đơn</Text>
          <Text style={s.headerSub}>{selectedProp ? selectedProp.name : `Tất cả ${props.length} nhà`}</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.body}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
          }
        >
          {/* Chọn nhà — mặc định "Tất cả nhà" để lịch sử mở ra là thấy hết,
              rồi mới thu hẹp dần. Chỉ 1 nhà thì không cần hàng chọn này. */}
          {props.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
              <View style={s.chipRow}>
                <TouchableOpacity
                  style={[s.propChip, selectedId === null && s.propChipActive]}
                  onPress={() => { setSelectedId(null); setOpenUnit(null); }}
                >
                  <Text style={[s.propChipText, selectedId === null && s.propChipTextActive]}>
                    🗂 Tất cả nhà ({props.length})
                  </Text>
                </TouchableOpacity>
                {props.map(p => (
                  <TouchableOpacity
                    key={p.id}
                    style={[s.propChip, selectedId === p.id && s.propChipActive]}
                    onPress={() => { setSelectedId(p.id); setOpenUnit(null); }}
                  >
                    <Text style={[s.propChipText, selectedId === p.id && s.propChipTextActive]}>
                      {p.wholeHouse ? '🏠' : '🏢'} {p.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}

          {/* Tổng quan nhà đang chọn */}
          <View style={s.summaryCard}>
            <View style={s.summaryRow}>
              <View style={s.summaryItem}>
                <Text style={[s.summaryNum, { color: Colors.success }]}>{totals.paidCount}</Text>
                <Text style={s.summaryLbl}>Đã thu</Text>
              </View>
              <View style={s.summarySep} />
              <View style={s.summaryItem}>
                <Text style={[s.summaryNum, { color: Colors.warning }]}>{totals.unpaidCount}</Text>
                <Text style={s.summaryLbl}>Chưa thu</Text>
              </View>
              <View style={s.summarySep} />
              <View style={s.summaryItem}>
                <Text style={[s.summaryNum, { color: totals.overdueCount > 0 ? Colors.error : Colors.textMuted }]}>
                  {totals.overdueCount}
                </Text>
                <Text style={s.summaryLbl}>Quá hạn</Text>
              </View>
            </View>
            {/* Nói rõ đang xem kỳ nào, và tổng cộng có bao nhiêu kỳ để tra tiếp —
                không thì lọc về 1 kỳ xong lại tưởng cả lịch sử chỉ có bấy nhiêu. */}
            <Text style={s.summaryFoot}>
              {totals.count} hoá đơn ·{' '}
              {periodFilter === 'all'
                ? `tất cả ${periods.length} kỳ`
                : `kỳ ${periodText(activePeriod)} · còn ${Math.max(0, periods.length - 1)} kỳ khác`}
            </Text>
          </View>

          {/* Tìm kiếm */}
          <View style={s.searchBox}>
            <Text style={s.searchIcon}>🔍</Text>
            <TextInput
              style={s.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Tìm khách thuê, phòng, nhà, mã hoá đơn..."
              placeholderTextColor={Colors.textMuted}
              autoCorrect={false}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.searchClear}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Chọn kỳ — nhà thuê 1–2 năm là 12–24 kỳ, mặc định chỉ xem kỳ mới nhất. */}
          {periods.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
              <View style={s.chipRow}>
                <TouchableOpacity
                  style={[s.filterChip, periodFilter === 'all' && s.filterChipActive]}
                  onPress={() => { setPeriodFilter('all'); setOpenUnit(null); }}
                >
                  <Text style={[s.filterText, periodFilter === 'all' && s.filterTextActive]}>
                    Tất cả {periods.length} kỳ
                  </Text>
                </TouchableOpacity>
                {periods.map(p => (
                  <TouchableOpacity
                    key={p}
                    style={[s.filterChip, periodFilter !== 'all' && activePeriod === p && s.filterChipActive]}
                    onPress={() => { setPeriodFilter(p); setOpenUnit(null); }}
                  >
                    <Text style={[s.filterText, periodFilter !== 'all' && activePeriod === p && s.filterTextActive]}>
                      {periodText(p)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}

          {/* Bộ lọc */}
          <View style={s.filterBlock}>
            <View style={s.filterRow}>
              {TYPE_FILTERS.map(f => (
                <TouchableOpacity
                  key={f.key}
                  style={[s.filterChip, typeFilter === f.key && s.filterChipActive]}
                  onPress={() => setTypeFilter(f.key)}
                >
                  <Text style={[s.filterText, typeFilter === f.key && s.filterTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.filterRow}>
              {STATUS_FILTERS.map(f => (
                <TouchableOpacity
                  key={f.key}
                  style={[s.filterChip, statusFilter === f.key && s.filterChipActive]}
                  onPress={() => setStatusFilter(f.key)}
                >
                  <Text style={[s.filterText, statusFilter === f.key && s.filterTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {groups.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={{ fontSize: 40, marginBottom: Spacing.sm }}>🧾</Text>
              <Text style={s.emptyText}>
                {invoices.length === 0
                  ? 'Chưa có hoá đơn nào được phát hành.'
                  : 'Không có hoá đơn nào khớp bộ lọc của nhà này.'}
              </Text>
            </View>
          ) : (
            groups.map(renderGroup)
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: { padding: Spacing.sm },
  backArrow: { fontSize: 18, fontWeight: '600', color: Colors.primary },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  headerSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  body: { padding: Spacing.lg, gap: Spacing.md },

  chipRow: { flexDirection: 'row', gap: Spacing.sm, paddingBottom: Spacing.xs },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.base, ...Shadow.sm,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary, paddingVertical: 4 },
  searchClear: { fontSize: 15, fontWeight: '800', color: Colors.textMuted, paddingHorizontal: 4 },
  propChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: BorderRadius.full,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  propChipActive: { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  propChipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  propChipTextActive: { color: Colors.primary },

  summaryCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryNum: { fontSize: 15, fontWeight: '800' },
  summaryLbl: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  summarySep: { width: 1, height: 28, backgroundColor: Colors.divider },
  summaryFoot: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.sm },

  filterBlock: { gap: Spacing.sm },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.primary },

  groupCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  groupHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.base, gap: Spacing.sm },
  groupTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  groupMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  groupChevron: { fontSize: 18, color: Colors.textMuted, fontWeight: '700' },

  monthBlock: {
    borderTopWidth: 1, borderTopColor: Colors.divider,
    paddingHorizontal: Spacing.base, paddingBottom: Spacing.md, gap: Spacing.sm,
  },
  // Thanh tiêu đề kỳ: nền xám nhạt kéo hết bề ngang để tách hẳn các kỳ với nhau.
  monthBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: -Spacing.base, paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm, backgroundColor: Colors.background,
    marginBottom: Spacing.xs,
  },
  monthTitle: { fontSize: 11.5, fontWeight: '900', color: Colors.textSecondary, textTransform: 'uppercase' },
  monthBadges: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  monthPill: { borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 2 },
  monthPillText: { fontSize: 10, fontWeight: '800' },

  invRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  typeChip: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  typeChipText: { fontSize: 14 },
  invTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  invMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  invAmount: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  statusChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.full },
  statusChipText: { fontSize: 10, fontWeight: '700' },

  emptyBox: { alignItems: 'center', paddingVertical: Spacing.xl * 2 },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
  groupAction: {
    marginHorizontal: Spacing.base, marginBottom: Spacing.md,
    paddingVertical: Spacing.md, borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primaryBg, alignItems: 'center',
  },
  groupActionText: { fontSize: 12.5, fontWeight: '800', color: Colors.primary },
});
