import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
  TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { billMonthLabel } from '@/utils';
import { managerPropertyService } from '@/services/manager/propertyService';
import {
  realManagerInvoiceService, ManagerInvoice, ManagerInvoiceStatus,
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
      // CHỈ TIỀN PHÒNG (24/09/2026): điện/nước có màn lịch sử riêng ở Ghi điện nước — trộn
      // chung ở đây thì mỗi phòng một kỳ ra 3 hoá đơn, không nhìn ra phòng nào đã trả tiền nhà.
      setInvoices(list.filter(i => (i.type || '').toUpperCase() === 'RENT'));
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
  /** Bảng chọn tháng theo năm — thay hàng chip kỳ cuộn ngang (24 kỳ là không tìm nổi). */
  const [pickerOpen, setPickerOpen] = useState(false);

  /** Kỳ còn hoá đơn chưa thu / quá hạn — chấm đỏ trên bảng chọn tháng. */
  const unpaidPeriods = useMemo(() => {
    const set = new Set<string>();
    for (const i of invoices) {
      if (selectedId !== null && i.propertyId !== selectedId) continue;
      if (i.status === 'PENDING' || i.status === 'OVERDUE') set.add(monthKey(i));
    }
    return set;
  }, [invoices, selectedId]);

  /** Lùi / tiến MỘT kỳ trong các kỳ có thật (periods sắp mới → cũ). */
  const stepPeriod = (dir: -1 | 1) => {
    const idx = periods.indexOf(activePeriod);
    const next = periods[idx - dir]; // dir=+1 → kỳ mới hơn (index nhỏ hơn)
    if (next) { setPeriodFilter(next); setOpenUnit(null); }
  };

  /** Tìm không dấu theo khách / phòng / nhà / mã hoá đơn. */
  const [search, setSearch] = useState('');
  const kw = norm(search.trim());

  /** selectedId = null → xem TẤT CẢ nhà mình phụ trách. */
  const filtered = useMemo(() => invoices.filter(i =>
    (selectedId === null || i.propertyId === selectedId)
    && (periodFilter === 'all' || monthKey(i) === activePeriod)
    // "Chưa thu" = còn phải thu, GỒM cả quá hạn — khớp con số trên ô "Chưa thu".
    && (statusFilter === 'all' || i.status === statusFilter
      || (statusFilter === 'PENDING' && i.status === 'OVERDUE'))
    && (!kw || [i.tenantName, i.roomNumber, i.propertyName, i.code]
      .some(v => norm(v || '').includes(kw))),
  ), [invoices, selectedId, periodFilter, activePeriod, statusFilter, kw]);

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
    const overdueCount = g.invoices.filter(i => i.status === 'OVERDUE').length;
    /*
     * Tô màu CẢ THẺ theo tình trạng thu — nhìn lướt là biết phòng/nhà nào đã trả, nào chưa,
     * khỏi đọc dòng chữ nhỏ "đã thu 0 · còn 1 chưa thu" của từng thẻ.
     */
    const tone = overdueCount > 0
      ? { bar: Colors.error, bg: Colors.errorLight, text: Colors.error, label: `Quá hạn ${overdueCount}` }
      : unpaidCount > 0
        ? { bar: Colors.warning, bg: Colors.warningLight, text: '#B45309', label: unpaidCount > 1 ? `Chưa thu ${unpaidCount}` : 'Chưa thu' }
        : { bar: Colors.success, bg: Colors.successLight, text: Colors.success, label: '✓ Đã thu đủ' };

    return (
      <View key={g.key} style={[s.groupCard, { borderLeftWidth: 4, borderLeftColor: tone.bar }]}>
        <TouchableOpacity
          style={s.groupHeader}
          onPress={() => setOpenUnit(open ? null : g.key)}
          activeOpacity={0.75}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.groupTitle}>{g.title}</Text>
            <Text style={s.groupMeta}>
              {months.length > 1 ? `${months.length} kỳ · ` : ''}
              {g.invoices[0]?.tenantName ?? ''}
            </Text>
          </View>
          <View style={[s.groupStatus, { backgroundColor: tone.bg }]}>
            <Text style={[s.groupStatusText, { color: tone.text }]}>{tone.label}</Text>
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
            <Text style={s.groupActionText}>💵  Xem & thu hộ · còn {unpaidCount} hoá đơn  →</Text>
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
          <Text style={s.headerTitle}>Lịch sử tiền phòng</Text>
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
          {/* Ba ô số liệu KIÊM bộ lọc trạng thái — bấm để lọc, bấm lại để bỏ. Thay hàng chip
              trạng thái riêng (lặp đúng ba con số này). */}
          <View style={s.summaryCard}>
            <View style={s.summaryRow}>
              {([
                { key: 'PAID' as const, n: totals.paidCount, label: 'Đã thu', color: Colors.success },
                { key: 'PENDING' as const, n: totals.unpaidCount, label: 'Chưa thu', color: Colors.warning },
                { key: 'OVERDUE' as const, n: totals.overdueCount, label: 'Quá hạn', color: totals.overdueCount > 0 ? Colors.error : Colors.textMuted },
              ]).map((x, idx) => {
                const on = statusFilter === x.key;
                return (
                  <React.Fragment key={x.key}>
                    {idx > 0 && <View style={s.summarySep} />}
                    <TouchableOpacity
                      style={[s.summaryItem, on && s.summaryItemOn]}
                      onPress={() => setStatusFilter(on ? 'all' : x.key)}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.summaryNum, { color: x.color }]}>{x.n}</Text>
                      <Text style={[s.summaryLbl, on && { color: Colors.primary, fontWeight: '800' }]}>
                        {x.label}{on ? ' ✓' : ''}
                      </Text>
                    </TouchableOpacity>
                  </React.Fragment>
                );
              })}
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

          {/*
            CHỌN KỲ — "‹ Tháng 10/2026 ▾ ›" (24/09/2026).
            Bản cũ là một hàng chip mỗi kỳ một chip: nhà thuê 1–2 năm ra 12–24 chip cuộn ngang,
            tìm "tháng 3 năm ngoái" là vuốt mỏi tay. Nay: mũi tên lùi/tiến từng kỳ có hoá đơn,
            bấm tên tháng mở bảng theo NĂM (lưới 12 tháng) — nhảy thẳng tới tháng nào cũng 2 chạm.
          */}
          {periods.length > 0 && (
            <View style={s.periodBar}>
              <TouchableOpacity
                style={s.periodArrow}
                disabled={periodFilter === 'all' || periods.indexOf(activePeriod) >= periods.length - 1}
                onPress={() => stepPeriod(-1)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[s.periodArrowText,
                  (periodFilter === 'all' || periods.indexOf(activePeriod) >= periods.length - 1) && s.periodArrowOff]}>‹</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.periodCenter} onPress={() => setPickerOpen(true)} activeOpacity={0.7}>
                <Text style={s.periodLabel}>
                  {periodFilter === 'all' ? `Tất cả ${periods.length} kỳ` : `Tháng ${Number(activePeriod.slice(5))}/${activePeriod.slice(0, 4)}`}
                </Text>
                <Text style={s.periodCaret}>▾</Text>
                {periodFilter !== 'all' && unpaidPeriods.has(activePeriod) && <View style={s.periodDot} />}
              </TouchableOpacity>
              <TouchableOpacity
                style={s.periodArrow}
                disabled={periodFilter === 'all' || periods.indexOf(activePeriod) <= 0}
                onPress={() => stepPeriod(1)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[s.periodArrowText,
                  (periodFilter === 'all' || periods.indexOf(activePeriod) <= 0) && s.periodArrowOff]}>›</Text>
              </TouchableOpacity>
            </View>
          )}


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

      {/* Bảng chọn kỳ theo năm */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <TouchableOpacity style={s.pickerOverlay} activeOpacity={1} onPress={() => setPickerOpen(false)}>
          <View style={s.pickerSheet} onStartShouldSetResponder={() => true}>
            <Text style={s.pickerTitle}>Chọn kỳ hoá đơn</Text>
            <TouchableOpacity
              style={[s.pickerAll, periodFilter === 'all' && s.pickerAllOn]}
              onPress={() => { setPeriodFilter('all'); setOpenUnit(null); setPickerOpen(false); }}
            >
              <Text style={[s.pickerAllText, periodFilter === 'all' && { color: Colors.white }]}>
                Xem tất cả {periods.length} kỳ
              </Text>
            </TouchableOpacity>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {[...new Set(periods.map(p => p.slice(0, 4)))].map(year => (
                <View key={year} style={{ marginTop: Spacing.md }}>
                  <Text style={s.pickerYear}>Năm {year}</Text>
                  <View style={s.pickerGrid}>
                    {Array.from({ length: 12 }, (_, i) => {
                      const key = `${year}-${String(i + 1).padStart(2, '0')}`;
                      const has = periods.includes(key);
                      const on = periodFilter !== 'all' && activePeriod === key;
                      return (
                        <TouchableOpacity
                          key={key}
                          disabled={!has}
                          style={[s.pickerCell, !has && s.pickerCellOff, on && s.pickerCellOn]}
                          onPress={() => { setPeriodFilter(key); setOpenUnit(null); setPickerOpen(false); }}
                        >
                          <Text style={[s.pickerCellText, !has && { color: Colors.textMuted }, on && { color: Colors.white }]}>
                            T{i + 1}
                          </Text>
                          {has && unpaidPeriods.has(key) && <View style={[s.pickerDot, on && { backgroundColor: Colors.white }]} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              ))}
            </ScrollView>
            <Text style={s.pickerHint}>● chấm đỏ = kỳ còn hoá đơn chưa thu</Text>
          </View>
        </TouchableOpacity>
      </Modal>
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
  summaryItem: { flex: 1, alignItems: 'center', paddingVertical: 4, borderRadius: BorderRadius.md },
  summaryItemOn: { backgroundColor: Colors.primaryBg },
  summaryNum: { fontSize: 15, fontWeight: '800' },
  summaryLbl: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  summarySep: { width: 1, height: 28, backgroundColor: Colors.divider },
  summaryFoot: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.sm },

  filterBlock: { gap: Spacing.sm },
  periodBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  periodArrow: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  periodArrowText: { fontSize: 24, fontWeight: '700', color: Colors.primary },
  periodArrowOff: { color: Colors.border },
  periodCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: Spacing.md },
  periodLabel: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  periodCaret: { fontSize: 12, color: Colors.textMuted },
  periodDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.error },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: Spacing.lg },
  pickerSheet: { backgroundColor: Colors.white, borderRadius: BorderRadius.xl, padding: Spacing.lg },
  pickerTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  pickerAll: {
    marginTop: Spacing.md, paddingVertical: 10, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  pickerAllOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pickerAllText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  pickerYear: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary, marginBottom: 6 },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pickerCell: {
    width: '23%', paddingVertical: 10, borderRadius: BorderRadius.md, alignItems: 'center',
    backgroundColor: Colors.primaryBg,
  },
  pickerCellOff: { backgroundColor: Colors.background },
  pickerCellOn: { backgroundColor: Colors.primary },
  pickerCellText: { fontSize: 13, fontWeight: '800', color: Colors.primary },
  pickerDot: { position: 'absolute', top: 5, right: 7, width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.error },
  pickerHint: { marginTop: Spacing.md, fontSize: 11, color: Colors.textMuted, textAlign: 'center' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.primary },

  groupStatus: { borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 4 },
  groupStatusText: { fontSize: 11, fontWeight: '800' },
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
