import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { formatDateTime } from '@/utils';
import type { MaintenanceTicket } from '@/store/maintenanceStore';
import { realMaintenanceService } from '@/services/shared/maintenanceService';
import { dtoToTicket } from '@/services/shared/maintenanceMappers';
import { useMaintenanceRealtime } from '@/hooks/useBillingRealtime';
import {
  MAINTENANCE_STATUS_META, MAINTENANCE_PRIORITY_META, MAINTENANCE_SLA_DAYS,
} from '@/constants/maintenance';
import { serverNow, todayIso } from '@/utils/serverTime';
import { readApiError } from '@/utils/apiError';

/**
 * BẢO TRÌ & SỬA CHỮA — màn tổng của manager (làm lại 24/09/2026).
 *
 * Bản cũ xếp 5 khối nối nhau (thống kê · lỗi khách · hàng đợi · hoạt động gần đây · theo
 * nhà) và CÙNG một phiếu hiện ở 2–3 khối — manager không biết khối nào là việc của mình.
 * Nay chia theo VIỆC PHẢI LÀM, mỗi phiếu nằm đúng một tab:
 *
 *   • Cần xem   — khách mới báo (OPEN), manager phải tới kiểm tra / phân loại
 *   • Đang sửa  — đã hẹn lịch hoặc đang sửa (REPAIR_SCHEDULED, IN_REPAIR)
 *   • Lỗi khách — chờ khách tự sửa / trả tiền / trừ cọc, hoặc chờ admin phân xử
 *   • Đã xong   — đóng / huỷ / lỗi khách đã được admin kết luận — trong THÁNG này
 *
 * Trong mỗi tab, phiếu GOM THEO NHÀ (tiêu đề nhóm bấm được → màn bảo trì của nhà đó).
 * "Theo bất động sản" cũ ở cuối trang không còn: lọc theo nhà nằm ngay trên đầu.
 */

// ── Phân nhóm ────────────────────────────────────────────────────────────────
type TabKey = 'todo' | 'fixing' | 'fault' | 'done';

const FIXING = ['repair_scheduled', 'in_repair'];
const FAULT = ['tenant_fault', 'pending_tenant_repair', 'outstanding_damage', 'waiting_payment'];
const TERMINAL = ['closed', 'cancelled'];

// 'tenant_fault' đã được admin duyệt/không duyệt trên web là ĐIỂM DỪNG — BE giữ nguyên
// status vĩnh viễn, nên coi là xong bằng adminReviewedAt, không thì nằm lì trong tab.
const isDone = (t: { status: string; adminReviewedAt?: string }) =>
  TERMINAL.includes(t.status) || (t.status === 'tenant_fault' && !!t.adminReviewedAt);

const tabOf = (t: MaintenanceTicket): TabKey => {
  if (isDone(t)) return 'done';
  if (t.status === 'open') return 'todo';
  if (FIXING.includes(t.status)) return 'fixing';
  if (FAULT.includes(t.status)) return 'fault';
  return 'todo';
};

const TABS: { key: TabKey; label: string; hint: string; color: string; bg: string }[] = [
  { key: 'todo',   label: 'Cần xem',   hint: 'Khách mới báo',        color: '#D97706', bg: '#FFFBEB' },
  { key: 'fixing', label: 'Đang sửa',  hint: 'Đã hẹn / đang sửa',    color: '#7C3AED', bg: '#F5F3FF' },
  { key: 'fault',  label: 'Lỗi khách', hint: 'Chờ khách / trừ cọc',  color: '#DC2626', bg: '#FEF2F2' },
  { key: 'done',   label: 'Đã xong',   hint: 'Trong tháng này',      color: '#059669', bg: '#ECFDF5' },
];

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

const TODAY = todayIso();
const daysSince = (iso: string) =>
  Math.max(0, Math.floor((new Date(TODAY).getTime() - new Date(iso).getTime()) / 86_400_000));

// Quá hạn SLA: còn mở và đã vượt số ngày mục tiêu theo mức ưu tiên (chưa phân loại → 7 ngày).
const isOverdue = (t: MaintenanceTicket) =>
  !isDone(t)
  && daysSince(t.createdAt) > (MAINTENANCE_SLA_DAYS[t.priority as keyof typeof MAINTENANCE_SLA_DAYS] ?? 7);

const monthLabel = () => {
  const d = serverNow();
  return `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
};

const isThisMonth = (iso?: string) => {
  if (!iso) return false;
  const d = new Date(iso);
  const now = serverNow();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

const fmtMoney = (n: number) => `${n.toLocaleString('vi-VN')}đ`;

// ── Màn ──────────────────────────────────────────────────────────────────────
export const MaintenanceManagerScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [remote, setRemote] = useState<MaintenanceTicket[] | null>(null);
  /** Câu lỗi THẬT từ server (readApiError phân biệt mất mạng / 500 / 403 / 404). */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey | null>(null);
  const [search, setSearch] = useState('');
  const [propertyFilter, setPropertyFilter] = useState<string>('all');

  const load = React.useCallback(() => {
    let active = true;
    realMaintenanceService.listForManager({ size: 500 } as never)
      .then(page => {
        if (!active) return;
        setRemote(page.content.map(dtoToTicket));
        setLoadError(null);
      })
      .catch((err) => {
        if (!active) return;
        const msg = readApiError(err, 'Không tải được danh sách phiếu bảo trì.');
        setRemote(prev => {
          if (prev == null) setLoadError(msg);
          return prev;
        });
      });
    return () => { active = false; };
  }, []);

  useFocusEffect(React.useCallback(() => load(), [load]));
  // Tự cập nhật khi có phiếu mới / đổi trạng thái (socket, BE 03/09/2026).
  useMaintenanceRealtime({ onRefresh: load });

  const tickets = remote ?? [];

  const handleBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('ManagerHome');
  };

  // Tab "Đã xong" chỉ giữ phiếu của THÁNG NÀY — kho lịch sử dài xem ở màn từng nhà.
  const inScope = useMemo(
    () => tickets.filter(t => tabOf(t) !== 'done' || isThisMonth(t.resolvedAt ?? t.updatedAt)),
    [tickets],
  );

  const tabCounts = useMemo(() => {
    const c: Record<TabKey, { n: number; urgent: number; late: number }> = {
      todo: { n: 0, urgent: 0, late: 0 }, fixing: { n: 0, urgent: 0, late: 0 },
      fault: { n: 0, urgent: 0, late: 0 }, done: { n: 0, urgent: 0, late: 0 },
    };
    for (const t of inScope) {
      const k = tabOf(t);
      c[k].n += 1;
      if (t.priority === 'urgent' && k !== 'done') c[k].urgent += 1;
      if (isOverdue(t)) c[k].late += 1;
    }
    return c;
  }, [inScope]);

  // Mặc định mở tab ĐẦU TIÊN có việc — vào màn là thấy ngay việc cần làm nhất.
  const activeTab: TabKey = tab
    ?? (['todo', 'fixing', 'fault', 'done'] as TabKey[]).find(k => tabCounts[k].n > 0)
    ?? 'todo';

  // Danh sách nhà có phiếu — chỉ vẽ bộ lọc nhà khi quản lý từ 2 nhà trở lên.
  const properties = useMemo(() => {
    const m = new Map<string, { id: string; name: string; open: number }>();
    for (const t of inScope) {
      const cur = m.get(t.propertyId) ?? { id: t.propertyId, name: t.propertyName, open: 0 };
      if (!isDone(t)) cur.open += 1;
      m.set(t.propertyId, cur);
    }
    return [...m.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name, 'vi'));
  }, [inScope]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inScope
      .filter(t => tabOf(t) === activeTab)
      .filter(t => propertyFilter === 'all' || t.propertyId === propertyFilter)
      // roomName CÓ THỂ undefined với nhà nguyên căn dù type khai báo string — luôn `?? ''`.
      .filter(t => !q
        || (t.title ?? '').toLowerCase().includes(q)
        || (t.ticketCode ?? '').toLowerCase().includes(q)
        || (t.propertyName ?? '').toLowerCase().includes(q)
        || (t.roomName ?? '').toLowerCase().includes(q)
        || (t.tenantName ?? '').toLowerCase().includes(q)
        || (t.equipmentName ?? '').toLowerCase().includes(q))
      .sort((a, b) => {
        if (activeTab === 'done') return (b.resolvedAt ?? b.updatedAt).localeCompare(a.resolvedAt ?? a.updatedAt);
        const late = Number(isOverdue(b)) - Number(isOverdue(a));
        if (late !== 0) return late;
        const p = (a.priority ? PRIORITY_ORDER[a.priority] ?? 9 : 9) - (b.priority ? PRIORITY_ORDER[b.priority] ?? 9 : 9);
        return p !== 0 ? p : a.createdAt.localeCompare(b.createdAt);
      });
  }, [inScope, activeTab, propertyFilter, search]);

  // Gom theo nhà, giữ thứ tự ưu tiên đã sắp.
  const groups = useMemo(() => {
    const m = new Map<string, { id: string; name: string; type?: string; items: MaintenanceTicket[] }>();
    for (const t of visible) {
      const g = m.get(t.propertyId) ?? { id: t.propertyId, name: t.propertyName, type: t.propertyType, items: [] };
      g.items.push(t);
      m.set(t.propertyId, g);
    }
    return [...m.values()];
  }, [visible]);

  const totalOpen = tabCounts.todo.n + tabCounts.fixing.n + tabCounts.fault.n;
  const totalLate = tabCounts.todo.late + tabCounts.fixing.late + tabCounts.fault.late;
  const tabMeta = TABS.find(x => x.key === activeTab)!;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">

        {/* ── Đầu màn ── */}
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={handleBack}>
            <Text style={s.backBtnText}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Bảo trì & Sửa chữa</Text>
            <Text style={s.subtitle}>
              {monthLabel()} · {totalOpen > 0 ? `${totalOpen} phiếu đang mở` : 'không có phiếu nào đang mở'}
            </Text>
          </View>
        </View>

        {totalLate > 0 && (
          <View style={s.lateBanner}>
            <Text style={s.lateBannerText}>
              ⏰ {totalLate} phiếu đã quá hạn xử lý theo mức ưu tiên — xếp đầu mỗi tab
            </Text>
          </View>
        )}

        {/* ── 4 tab theo việc phải làm ── */}
        <View style={s.tabGrid}>
          {TABS.map(x => {
            const c = tabCounts[x.key];
            const on = activeTab === x.key;
            return (
              <TouchableOpacity
                key={x.key}
                style={[s.tab, on && { borderColor: x.color, backgroundColor: x.bg }]}
                onPress={() => setTab(x.key)}
                activeOpacity={0.8}
              >
                <View style={s.tabTop}>
                  <Text style={[s.tabNum, { color: c.n > 0 ? x.color : Colors.textMuted }]}>{c.n}</Text>
                  {(c.urgent > 0 || c.late > 0) && (
                    <View style={s.tabAlert}>
                      <Text style={s.tabAlertText}>{c.urgent > 0 ? `🚨 ${c.urgent}` : `⏰ ${c.late}`}</Text>
                    </View>
                  )}
                </View>
                <Text style={[s.tabLabel, on && { color: x.color }]}>{x.label}</Text>
                <Text style={s.tabHint}>{x.hint}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Tìm + lọc nhà ── */}
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="🔍  Tìm mã phiếu, thiết bị, phòng, khách..."
          placeholderTextColor={Colors.textMuted}
        />
        {properties.length > 1 && (
          <View style={s.chipWrap}>
            <TouchableOpacity
              style={[s.chip, propertyFilter === 'all' && s.chipOn]}
              onPress={() => setPropertyFilter('all')}
            >
              <Text style={[s.chipText, propertyFilter === 'all' && s.chipTextOn]}>Tất cả nhà</Text>
            </TouchableOpacity>
            {properties.map(p => {
              const on = propertyFilter === p.id;
              return (
                <TouchableOpacity key={p.id} style={[s.chip, on && s.chipOn]}
                  onPress={() => setPropertyFilter(on ? 'all' : p.id)}>
                  <Text style={[s.chipText, on && s.chipTextOn]} numberOfLines={1}>
                    {p.name}{p.open > 0 ? ` · ${p.open}` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Danh sách: gom theo nhà ── */}
        {loadError ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>⚠️</Text>
            <Text style={s.emptyText}>{loadError}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={load}>
              <Text style={s.retryBtnText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        ) : remote == null ? (
          <View style={s.empty}><Text style={s.emptyText}>Đang tải…</Text></View>
        ) : groups.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>{search.trim() || propertyFilter !== 'all' ? '🔍' : '🎉'}</Text>
            <Text style={s.emptyText}>
              {search.trim() || propertyFilter !== 'all'
                ? 'Không có phiếu khớp bộ lọc.'
                : `Không có phiếu nào ở mục "${tabMeta.label}".`}
            </Text>
          </View>
        ) : (
          groups.map(g => (
            <View key={g.id} style={s.group}>
              <TouchableOpacity
                style={s.groupHead}
                onPress={() => navigation.navigate('BuildingMaintenance', {
                  propertyId: g.id, propertyName: g.name, propertyType: g.type,
                })}
                activeOpacity={0.7}
              >
                <Text style={s.groupName} numberOfLines={1}>
                  {g.type === 'WHOLE_HOUSE' ? '🏡' : '🏢'} {g.name}
                </Text>
                <Text style={s.groupLink}>{g.items.length} phiếu · Xem theo nhà ›</Text>
              </TouchableOpacity>

              <View style={s.card}>
                {g.items.map((t, i) => (
                  <TicketRow
                    key={t.id}
                    t={t}
                    last={i === g.items.length - 1}
                    onPress={() => navigation.navigate('MaintenanceTicketDetail', { ticketId: t.id })}
                  />
                ))}
              </View>
            </View>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

// ── Một phiếu ────────────────────────────────────────────────────────────────
/**
 * Dải màu trái = mức ưu tiên. Dòng 2 = ở đâu, của ai. Dòng 3 = điều cần biết để làm tiếp
 * (hẹn khi nào, treo bao lâu, tiền bao nhiêu) — mỗi trạng thái nói đúng thứ của nó.
 */
const TicketRow: React.FC<{ t: MaintenanceTicket; last: boolean; onPress: () => void }> = ({ t, last, onPress }) => {
  const st = MAINTENANCE_STATUS_META[t.status as keyof typeof MAINTENANCE_STATUS_META]
    ?? MAINTENANCE_STATUS_META.open;
  const pri = t.priority ? MAINTENANCE_PRIORITY_META[t.priority] : null;
  const late = isOverdue(t);
  const where = t.propertyType === 'WHOLE_HOUSE' ? 'Toàn nhà' : (t.roomName ? `P.${t.roomName}` : '—');
  const age = daysSince(t.createdAt);
  const cost = Number(t.invoiceAmount ?? t.estimatedDamageAmount ?? 0);

  const facts: string[] = [];
  if (t.status === 'open' && t.visitAppointmentAt) facts.push(`🗓 Hẹn xem ${formatDateTime(t.visitAppointmentAt)}`);
  if (t.status === 'repair_scheduled' && t.repairAppointmentAt) facts.push(`🗓 Hẹn sửa ${formatDateTime(t.repairAppointmentAt)}`);
  if (t.status === 'pending_tenant_repair' && t.selfRepairDeadline) facts.push(`⏳ Hạn khách sửa ${t.selfRepairDeadline.slice(0, 10).split('-').reverse().join('/')}`);
  if (!isDone(t)) facts.push(age === 0 ? 'Báo hôm nay' : `Treo ${age} ngày`);
  if (isDone(t) && t.resolvedAt) facts.push(`Xong ${formatDateTime(t.resolvedAt)}`);
  if (cost > 0) facts.push(fmtMoney(cost));
  if (t.companyAbsorbedFault) facts.push('🏢 Công ty trả hộ');

  return (
    <TouchableOpacity style={[s.row, !last && s.rowBorder]} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.rowStripe, { backgroundColor: pri?.color ?? Colors.border }]} />
      <View style={{ flex: 1 }}>
        <View style={s.rowTop}>
          <Text style={s.rowCode}>{t.ticketCode}</Text>
          <Text style={s.rowTitle} numberOfLines={1}>{t.title || t.equipmentName || 'Phiếu bảo trì'}</Text>
        </View>
        <Text style={s.rowWhere} numberOfLines={1}>
          {where}{t.tenantName ? ` · ${t.tenantName}` : ''}{t.equipmentName ? ` · ${t.equipmentName}` : ''}
        </Text>
        <Text style={[s.rowFacts, late && { color: Colors.error, fontWeight: '700' }]} numberOfLines={1}>
          {late ? '⏰ Quá hạn · ' : ''}{facts.join(' · ')}
        </Text>
      </View>
      <View style={s.rowRight}>
        <View style={[s.statusPill, { backgroundColor: st.bg }]}>
          <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
        </View>
        <Text style={[s.priText, { color: pri?.color ?? Colors.textMuted }]}>
          {pri?.label ?? 'Chưa phân loại'}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

// ── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.base },

  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.md },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center',
  },
  backBtnText: { fontSize: 26, lineHeight: 28, color: Colors.primary, fontWeight: '900' },
  title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  lateBanner: {
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: 9, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.error + '30',
  },
  lateBannerText: { fontSize: 12, fontWeight: '600', color: Colors.error },

  // 4 tab — lưới 2×2, không cuộn ngang (cuộn ngang thì tab thứ 4 bị giấu mất)
  tabGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  tab: {
    width: '48.5%', backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1.5, borderColor: Colors.border, padding: Spacing.md, ...Shadow.sm,
  },
  tabTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tabNum: { fontSize: 24, fontWeight: '800' },
  tabAlert: { backgroundColor: Colors.errorLight, borderRadius: BorderRadius.full, paddingHorizontal: 7, paddingVertical: 2 },
  tabAlertText: { fontSize: 10, fontWeight: '800', color: Colors.error },
  tabLabel: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },
  tabHint: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },

  searchInput: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: 13,
    borderWidth: 1, borderColor: Colors.border, color: Colors.textPrimary, marginBottom: Spacing.sm,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: Spacing.sm },
  chip: {
    maxWidth: '100%', paddingHorizontal: 12, paddingVertical: 6, borderRadius: BorderRadius.full,
    backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.border,
  },
  chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextOn: { color: Colors.white },

  group: { marginTop: Spacing.md },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: 6 },
  groupName: { flex: 1, fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  groupLink: { fontSize: 11, fontWeight: '700', color: Colors.primary },

  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 10, paddingRight: Spacing.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  rowStripe: { width: 4, alignSelf: 'stretch', borderTopRightRadius: 3, borderBottomRightRadius: 3, marginRight: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowCode: { fontSize: 11, fontWeight: '800', color: Colors.primary },
  rowTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  rowWhere: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  rowFacts: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 4, maxWidth: 120 },
  statusPill: { borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: '800' },
  priText: { fontSize: 10, fontWeight: '700' },

  empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyIcon: { fontSize: 36 },
  emptyText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted, textAlign: 'center' },
  retryBtn: { marginTop: 4, backgroundColor: Colors.primary, paddingHorizontal: 22, paddingVertical: 9, borderRadius: BorderRadius.lg },
  retryBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
});
