import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import type { MaintenanceTicket } from '@/store/maintenanceStore';
import { realMaintenanceService } from '@/services/shared/maintenanceService';
import { dtoToTicket } from '@/services/shared/maintenanceMappers';
import {
  MAINTENANCE_STATUS_META, MAINTENANCE_PRIORITY_META, MAINTENANCE_SLA_DAYS,
  type MaintenanceStatusKey,
} from '@/constants/maintenance';
import { serverNow, todayIso } from '@/utils/serverTime';
import { readApiError } from '@/utils/apiError';

// ── Config ──────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> =
  Object.fromEntries(
    Object.entries(MAINTENANCE_PRIORITY_META).map(([k, m]) => [k, { label: m.label, color: m.color, bg: m.bg }]),
  );

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> =
  MAINTENANCE_STATUS_META;

const TODAY = todayIso();

const daysBetween = (from: string) => {
  const ms = new Date(TODAY).getTime() - new Date(from).getTime();
  return Math.floor(ms / 86400000);
};

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

const TERMINAL = ['closed', 'cancelled'];
const WORKING = ['in_repair', 'tenant_fault', 'pending_tenant_repair', 'outstanding_damage'];
// Trạng thái có thể xuất hiện trong "Hàng đợi xử lý" (mọi thứ trừ closed/cancelled),
// theo đúng thứ tự luồng — dùng để dựng chip lọc theo trạng thái.
const QUEUE_STATUSES: MaintenanceStatusKey[] = ['open', ...WORKING] as MaintenanceStatusKey[];
const QUEUE_PAGE_SIZE = 8;
// Quá hạn SLA: ticket còn mở và đã vượt số ngày mục tiêu theo mức ưu tiên.
// Ticket chưa duyệt (priority null) tính theo ngưỡng mặc định 7 ngày.
const isOverdue = (t: { status: string; priority?: string; createdAt: string }) =>
  !TERMINAL.includes(t.status)
  && daysBetween(t.createdAt) > (MAINTENANCE_SLA_DAYS[t.priority as keyof typeof MAINTENANCE_SLA_DAYS] ?? 7);

const monthLabel = () => {
  const d = serverNow();
  return `Tháng ${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

// ── Screen ──────────────────────────────────────────────────────────────────

export const MaintenanceManagerScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [remote, setRemote] = useState<MaintenanceTicket[] | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MaintenanceStatusKey>('all');
  const [queueExpanded, setQueueExpanded] = useState(false);
  // Lỗi API → báo rõ thay vì âm thầm rơi về store mock (dữ liệu giả "TK-2026-001"
  // làm manager tưởng còn ticket phải xử lý / mất ticket thật).
  /**
   * Câu lỗi THẬT từ server, không phải "kiểm tra mạng" đoán bừa.
   *
   * Bản cũ chỉ giữ một cờ boolean rồi luôn hiện "kiểm tra mạng rồi mở lại màn này".
   * Nhưng 500 của server cũng rơi vào đúng nhánh đó — người dùng đi kiểm tra wifi trong
   * khi lỗi nằm ở backend. `readApiError` phân biệt được mất mạng / 500 / 403 / 404.
   */
  const [loadError, setLoadError] = useState<string | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      realMaintenanceService.listForManager()
        .then(page => {
          if (!active) return;
          setRemote(page.content.map(dtoToTicket));
          setLoadError(null);
        })
        .catch((err) => {
          if (!active) return;
          const msg = readApiError(err, 'Không tải được danh sách ticket.');
          setRemote(prev => {
            if (prev == null) setLoadError(msg);
            return prev;
          });
        });
      return () => { active = false; };
    }, []),
  );

  const tickets = remote ?? [];

  const handleBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('ManagerHome');
  };

  const stats = useMemo(() => {
    const open = tickets.filter(t => !TERMINAL.includes(t.status));
    const now = serverNow();
    const isThisMonth = (iso: string) => {
      const d = new Date(iso);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    };
    return {
      urgentOpen:   open.filter(t => t.priority === 'urgent').length,
      pendingNew:   tickets.filter(t => t.status === 'open').length,
      inProgress:   tickets.filter(t => WORKING.includes(t.status)).length,
      resolvedMonth:tickets.filter(t => t.status === 'closed' && isThisMonth(t.updatedAt)).length,
      slaAtRisk:    tickets.filter(isOverdue).length,
      totalOpen:    open.length,
    };
  }, [tickets]);

  // Ticket đang mở (chưa closed/cancelled) — nền cho cả chip lọc lẫn hàng đợi.
  const openTickets = useMemo(() => tickets.filter(t => !TERMINAL.includes(t.status)), [tickets]);

  // Số lượng theo từng trạng thái trong tập đang mở — hiện trên chip lọc, tính TRƯỚC
  // khi áp search để chip vẫn phản ánh đúng toàn bộ hàng đợi chứ không phải phần đã lọc.
  const queueStatusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    openTickets.forEach(t => { c[t.status] = (c[t.status] ?? 0) + 1; });
    return c;
  }, [openTickets]);

  // Hàng đợi xử lý: ticket đang mở, lọc theo trạng thái + tìm kiếm, sắp theo ưu tiên
  // rồi theo thời gian.
  const openQueue = useMemo(() => {
    const q = search.trim().toLowerCase();
    return openTickets
      .filter(t => statusFilter === 'all' || t.status === statusFilter)
      .filter(t => !q
        || t.title.toLowerCase().includes(q)
        || t.ticketCode.toLowerCase().includes(q)
        || t.propertyName.toLowerCase().includes(q)
        || t.roomName.toLowerCase().includes(q)
        || (t.tenantName ?? '').toLowerCase().includes(q))
      .sort((a, b) => {
        const p = (a.priority ? PRIORITY_ORDER[a.priority] ?? 9 : 9)
          - (b.priority ? PRIORITY_ORDER[b.priority] ?? 9 : 9);
        return p !== 0 ? p : b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [openTickets, search, statusFilter]);

  // Đổi bộ lọc/tìm kiếm thì thu gọn lại danh sách — tránh cuộn dài dằng dặc mỗi lần
  // gõ tìm kiếm mới sau khi đã "Xem thêm" ở lượt lọc trước.
  React.useEffect(() => { setQueueExpanded(false); }, [search, statusFilter]);

  // Recent activity: last 4 tickets sorted by updatedAt desc
  const recentActivity = useMemo(() =>
    [...tickets]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 4),
    [tickets],
  );

  // Group by building, sorted by urgentOpen desc
  const buildingGroups = useMemo(() => {
    const map = new Map<string, { propertyId: string; propertyName: string; propertyType?: string; tickets: typeof tickets }>();
    tickets.forEach(t => {
      if (!map.has(t.propertyId)) {
        map.set(t.propertyId, {
          propertyId: t.propertyId,
          propertyName: t.propertyName,
          // Loại nhà lấy thẳng từ ticket. Trước đây còn tra thêm bảng mock
          // MANAGED_PROPERTIES bằng id thật → luôn trượt, chỉ tốn một lượt tìm.
          propertyType: t.propertyType,
          tickets: [],
        });
      }
      map.get(t.propertyId)!.tickets.push(t);
    });
    return Array.from(map.values()).sort((a, b) => {
      const aU = a.tickets.filter(t => t.priority === 'urgent' && !TERMINAL.includes(t.status)).length;
      const bU = b.tickets.filter(t => t.priority === 'urgent' && !TERMINAL.includes(t.status)).length;
      return bU - aU;
    });
  }, [tickets]);

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Header ───────────────────────────────────────────────── */}
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={handleBack}>
            <Text style={s.backBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={s.title}>Bảo trì & Sửa chữa</Text>
          <Text style={s.subtitle}>{monthLabel()}</Text>
        </View>

        {/* ── Stats row ────────────────────────────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={s.statsScroll} contentContainerStyle={s.statsContent}>
          <View style={[s.statCard, { borderTopColor: Colors.error }]}>
            <Text style={[s.statNum, { color: Colors.error }]}>{stats.urgentOpen}</Text>
            <Text style={s.statLabel}>Khẩn cấp</Text>
          </View>
          <View style={[s.statCard, { borderTopColor: Colors.warning }]}>
            <Text style={[s.statNum, { color: Colors.warning }]}>{stats.pendingNew}</Text>
            <Text style={s.statLabel}>Chờ duyệt</Text>
          </View>
          <View style={[s.statCard, { borderTopColor: '#8B5CF6' }]}>
            <Text style={[s.statNum, { color: '#8B5CF6' }]}>{stats.inProgress}</Text>
            <Text style={s.statLabel}>Đang xử lý</Text>
          </View>
          <View style={[s.statCard, { borderTopColor: Colors.success }]}>
            <Text style={[s.statNum, { color: Colors.success }]}>{stats.resolvedMonth}</Text>
            <Text style={s.statLabel}>Hoàn tất T{serverNow().getMonth() + 1}</Text>
          </View>
          {stats.slaAtRisk > 0 && (
            <View style={[s.statCard, { borderTopColor: Colors.error, backgroundColor: Colors.errorLight }]}>
              <Text style={[s.statNum, { color: Colors.error }]}>{stats.slaAtRisk}</Text>
              <Text style={[s.statLabel, { color: Colors.error }]}>SLA vi phạm</Text>
            </View>
          )}
        </ScrollView>

        {/* ── SLA warning banner ───────────────────────────────────── */}
        {stats.slaAtRisk > 0 && (
          <View style={s.slaBanner}>
            <Text style={s.slaBannerIcon}>⚠️</Text>
            <Text style={s.slaBannerText}>
              {stats.slaAtRisk} ticket vượt SLA theo mức ưu tiên — cần xử lý ngay
            </Text>
          </View>
        )}

        {/* ── Ticket lỗi khách đang chờ xử lý (tenant_fault / tự sửa / chờ trừ cọc) ── */}
        {tickets.filter(t => WORKING.includes(t.status) && t.status !== 'in_repair').length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitle}>⚠️ Lỗi khách đang xử lý</Text>
              <Text style={s.sectionCount}>
                {tickets.filter(t => WORKING.includes(t.status) && t.status !== 'in_repair').length} ticket
              </Text>
            </View>
            <View style={s.activityCard}>
              {tickets.filter(t => WORKING.includes(t.status) && t.status !== 'in_repair').map((t, i, arr) => (
                <TouchableOpacity
                  key={t.id}
                  style={[s.activityRow, i !== arr.length - 1 && s.activityRowBorder]}
                  onPress={() => navigation.navigate('MaintenanceTicketDetail', { ticketId: t.id })}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.activityTitle} numberOfLines={1}>{t.title}</Text>
                    <Text style={s.activityMeta}>
                      {t.ticketCode} · {t.propertyName}{t.roomName ? ` · ${t.roomName}` : ''}
                      {t.estimatedDamageAmount != null ? ` · ${t.estimatedDamageAmount.toLocaleString('vi-VN')}đ` : ''}
                    </Text>
                  </View>
                  <View style={[s.activityStatus, { backgroundColor: STATUS_CONFIG[t.status].bg }]}>
                    <Text style={[s.activityStatusText, { color: STATUS_CONFIG[t.status].color }]}>
                      {STATUS_CONFIG[t.status].label}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Hàng đợi xử lý (theo ưu tiên) ────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.sectionTitle}>Hàng đợi xử lý</Text>
            <Text style={s.sectionCount}>{openQueue.length} đang mở</Text>
          </View>
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Tìm mã ticket, tiêu đề, nhà, phòng, khách..."
            placeholderTextColor={Colors.textMuted}
          />

          {/* Chip lọc theo trạng thái — tính trên TOÀN BỘ hàng đợi (openTickets), không
              phải phần đã lọc bởi tìm kiếm, để số trên chip luôn ổn định khi gõ tìm. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={s.chipScroll} contentContainerStyle={s.chipContent}>
            <TouchableOpacity
              style={[s.filterChip, statusFilter === 'all' && s.filterChipActive]}
              onPress={() => setStatusFilter('all')}
            >
              <Text style={[s.filterChipText, statusFilter === 'all' && s.filterChipTextActive]}>
                Tất cả {openTickets.length}
              </Text>
            </TouchableOpacity>
            {QUEUE_STATUSES.filter(st => (queueStatusCounts[st] ?? 0) > 0).map(st => {
              const cfg = STATUS_CONFIG[st];
              const active = statusFilter === st;
              return (
                <TouchableOpacity
                  key={st}
                  style={[s.filterChip, active && { backgroundColor: cfg.color, borderColor: cfg.color }]}
                  onPress={() => setStatusFilter(st)}
                >
                  <Text style={[s.filterChipText, active && s.filterChipTextActive]}>
                    {cfg.icon} {cfg.label} {queueStatusCounts[st]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={[s.activityCard, { marginTop: Spacing.sm }]}>
            {loadError ? (
              <View style={s.queueEmpty}>
                <Text style={s.queueEmptyText}>⚠️ {loadError}</Text>
              </View>
            ) : openQueue.length === 0 ? (
              <View style={s.queueEmpty}>
                <Text style={s.queueEmptyText}>
                  {search.trim() || statusFilter !== 'all' ? 'Không tìm thấy ticket phù hợp.' : '🎉 Không có ticket nào đang mở.'}
                </Text>
              </View>
            ) : (queueExpanded ? openQueue : openQueue.slice(0, QUEUE_PAGE_SIZE)).map((t, i, arr) => {
              const cfg    = STATUS_CONFIG[t.status];
              // priority null khi chưa duyệt → badge "Chờ phân loại" trung tính.
              const priCfg = t.priority
                ? PRIORITY_CONFIG[t.priority]
                : { label: 'Chưa phân loại', color: Colors.textMuted, bg: Colors.divider };
              const isLast = i === arr.length - 1;
              const overdue = isOverdue(t);
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[s.activityRow, !isLast && s.activityRowBorder]}
                  onPress={() => navigation.navigate('MaintenanceTicketDetail', { ticketId: t.id })}
                  activeOpacity={0.7}
                >
                  <View style={[s.activityPriBadge, { backgroundColor: priCfg.bg, marginRight: 2 }]}>
                    <Text style={[s.activityPriText, { color: priCfg.color }]}>{priCfg.label}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.activityTitle} numberOfLines={1}>{t.title}</Text>
                    <Text style={s.activityMeta}>
                      {t.ticketCode} · {t.propertyName} · {t.propertyType === 'WHOLE_HOUSE' ? 'Toàn nhà' : t.roomName}
                      {overdue ? '  ⚠️ quá hạn' : ''}
                    </Text>
                  </View>
                  <View style={[s.activityStatus, { backgroundColor: cfg.bg }]}>
                    <Text style={[s.activityStatusText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {openQueue.length > QUEUE_PAGE_SIZE && (
            <TouchableOpacity style={s.expandBtn} onPress={() => setQueueExpanded(v => !v)}>
              <Text style={s.expandBtnText}>
                {queueExpanded ? 'Thu gọn' : `Xem thêm ${openQueue.length - QUEUE_PAGE_SIZE} ticket`}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Recent Activity ──────────────────────────────────────── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Hoạt động gần đây</Text>
          <View style={s.activityCard}>
            {recentActivity.map((t, i) => {
              const cfg       = STATUS_CONFIG[t.status];
              const priCfg    = t.priority
                ? PRIORITY_CONFIG[t.priority]
                : { label: 'Chưa phân loại', color: Colors.textMuted, bg: Colors.divider };
              const isLast    = i === recentActivity.length - 1;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[s.activityRow, !isLast && s.activityRowBorder]}
                  onPress={() => navigation.navigate('MaintenanceTicketDetail', { ticketId: t.id })}
                  activeOpacity={0.7}
                >
                  <View style={[s.activityDot, { backgroundColor: cfg.bg }]}>
                    <Text style={s.activityDotIcon}>{cfg.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.activityTopRow}>
                      <Text style={s.activityCode}>{t.ticketCode}</Text>
                      <View style={[s.activityPriBadge, { backgroundColor: priCfg.bg }]}>
                        <Text style={[s.activityPriText, { color: priCfg.color }]}>{priCfg.label}</Text>
                      </View>
                    </View>
                    <Text style={s.activityTitle} numberOfLines={1}>{t.title}</Text>
                    <Text style={s.activityMeta}>{t.propertyName} · {t.propertyType === 'WHOLE_HOUSE' ? 'Toàn bộ nhà' : t.roomName} · {t.updatedAt}</Text>
                  </View>
                  <View style={[s.activityStatus, { backgroundColor: cfg.bg }]}>
                    <Text style={[s.activityStatusText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Buildings section ────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeaderRow}>
            <Text style={s.sectionTitle}>Theo bất động sản</Text>
            <Text style={s.sectionCount}>{buildingGroups.length} tài sản</Text>
          </View>

          {buildingGroups.map(group => {
            const open      = group.tickets.filter(t => !TERMINAL.includes(t.status));
            const urgent    = open.filter(t => t.priority === 'urgent');
            const inProg    = group.tickets.filter(t => WORKING.includes(t.status));
            const resolved  = group.tickets.filter(t => t.status === 'closed');
            const pending   = group.tickets.filter(t => t.status === 'open');
            const slaRisk   = open.filter(isOverdue);
            const total     = group.tickets.length;
            const doneRate  = total > 0 ? Math.round((resolved.length / total) * 100) : 100;

            const healthColor = urgent.length > 0 ? Colors.error
              : slaRisk.length > 0 ? Colors.warning
              : pending.length > 0 ? Colors.warning
              : Colors.success;
            const healthLabel = urgent.length > 0 ? '🔴 Khẩn cấp'
              : slaRisk.length > 0 ? '🟠 SLA vi phạm'
              : pending.length > 0 ? '🟡 Có ticket mới'
              : '🟢 Ổn định';

            return (
              <TouchableOpacity
                key={group.propertyId}
                style={[s.buildingCard, urgent.length > 0 && s.buildingCardUrgent]}
                onPress={() => navigation.navigate('BuildingMaintenance', {
                  propertyId: group.propertyId,
                  propertyName: group.propertyName,
                  propertyType: group.propertyType,
                })}
                activeOpacity={0.75}
              >
                {/* Name row */}
                <View style={s.buildingCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.buildingName}>{group.propertyName}</Text>
                    <Text style={s.propertyTypeText}>
                      {group.propertyType === 'WHOLE_HOUSE' ? 'Nhà nguyên căn · bảo trì toàn nhà/thiết bị' : 'Toà nhà nhiều phòng · theo phòng'}
                    </Text>
                    <View style={[s.healthPill, { backgroundColor: healthColor + '18' }]}>
                      <Text style={[s.healthText, { color: healthColor }]}>{healthLabel}</Text>
                    </View>
                  </View>
                  {urgent.length > 0 && (
                    <View style={s.urgentBadge}>
                      <Text style={s.urgentBadgeText}>🚨 {urgent.length}</Text>
                    </View>
                  )}
                  <Text style={s.buildingArrow}>›</Text>
                </View>

                {/* Stats */}
                <View style={s.buildingStats}>
                  <View style={s.buildingStat}>
                    <Text style={[s.buildingStatNum, { color: open.length > 0 ? Colors.warning : Colors.textMuted }]}>
                      {open.length}
                    </Text>
                    <Text style={s.buildingStatLbl}>Đang mở</Text>
                  </View>
                  <View style={s.statSep} />
                  <View style={s.buildingStat}>
                    <Text style={[s.buildingStatNum, { color: pending.length > 0 ? Colors.warning : Colors.textMuted }]}>
                      {pending.length}
                    </Text>
                    <Text style={s.buildingStatLbl}>Chờ duyệt</Text>
                  </View>
                  <View style={s.statSep} />
                  <View style={s.buildingStat}>
                    <Text style={[s.buildingStatNum, { color: inProg.length > 0 ? '#8B5CF6' : Colors.textMuted }]}>
                      {inProg.length}
                    </Text>
                    <Text style={s.buildingStatLbl}>Xử lý</Text>
                  </View>
                  <View style={s.statSep} />
                  <View style={s.buildingStat}>
                    <Text style={[s.buildingStatNum, { color: Colors.success }]}>{resolved.length}</Text>
                    <Text style={s.buildingStatLbl}>Hoàn tất</Text>
                  </View>
                </View>

                {/* Progress */}
                <View style={s.progRow}>
                  <View style={s.progBg}>
                    <View style={[s.progFill, {
                      width: `${doneRate}%` as any,
                      backgroundColor: doneRate === 100 ? Colors.success : doneRate >= 50 ? Colors.warning : Colors.error,
                    }]} />
                  </View>
                  <Text style={s.progPct}>{doneRate}% hoàn tất</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.base },

  header:   { paddingTop: Spacing.md, paddingBottom: Spacing.base },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  backBtnText: { fontSize: 26, lineHeight: 28, color: Colors.primary, fontWeight: '900' },
  title:    { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },

  statsScroll:  { flexGrow: 0, marginBottom: Spacing.md },
  statsContent: { paddingVertical: 4, gap: Spacing.sm },
  statCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
    borderTopWidth: 3, ...Shadow.sm, minWidth: 82, alignItems: 'center',
  },
  statNum:   { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },

  slaBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    marginBottom: Spacing.lg, borderWidth: 1, borderColor: Colors.error + '30',
  },
  slaBannerIcon: { fontSize: 18 },
  slaBannerText: { fontSize: 13, fontWeight: '600', color: Colors.error, flex: 1 },

  section:          { marginBottom: Spacing.lg },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  sectionTitle:     { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  sectionCount:     { fontSize: 12, color: Colors.textMuted, fontWeight: '500' },

  searchInput: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md, paddingVertical: 10,
    fontSize: 14, color: Colors.textPrimary,
  },
  queueEmpty:     { padding: Spacing.lg, alignItems: 'center' },
  queueEmptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },

  chipScroll:  { flexGrow: 0, marginTop: Spacing.sm },
  chipContent: { gap: 6, paddingVertical: 2 },
  filterChip: {
    paddingHorizontal: Spacing.sm, paddingVertical: 6, borderRadius: BorderRadius.full,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText:       { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  filterChipTextActive: { color: Colors.white },

  expandBtn:     { alignItems: 'center', paddingVertical: Spacing.sm, marginTop: 2 },
  expandBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  activityCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    ...Shadow.sm, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  activityRow:       { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.base, paddingVertical: 12 },
  activityRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  activityDot:       { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  activityDotIcon:   { fontSize: 16 },
  activityTopRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 },
  activityCode:      { fontSize: 11, fontWeight: '700', color: Colors.primary, letterSpacing: 0.3 },
  activityPriBadge:  { paddingHorizontal: 6, paddingVertical: 2, borderRadius: BorderRadius.full },
  activityPriText:   { fontSize: 9, fontWeight: '700' },
  activityTitle:     { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginBottom: 2 },
  activityMeta:      { fontSize: 11, color: Colors.textMuted },
  activityStatus:    { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  activityStatusText:{ fontSize: 10, fontWeight: '700' },

  buildingCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    padding: Spacing.base, marginBottom: Spacing.md,
    ...Shadow.sm, borderWidth: 1, borderColor: Colors.border,
  },
  buildingCardUrgent: { borderColor: Colors.error + '60', borderLeftWidth: 3, borderLeftColor: Colors.error },

  buildingCardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.md },
  buildingName:       { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  propertyTypeText:   { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginBottom: 6 },
  healthPill:         { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  healthText:         { fontSize: 10, fontWeight: '700' },
  urgentBadge:        {
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 4, marginRight: Spacing.sm,
  },
  urgentBadgeText: { fontSize: 12, fontWeight: '800', color: Colors.error },
  buildingArrow:   { fontSize: 22, color: Colors.textMuted, fontWeight: '300', marginTop: 2 },

  buildingStats:    { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  buildingStat:     { flex: 1, alignItems: 'center' },
  buildingStatNum:  { fontSize: 17, fontWeight: '800' },
  buildingStatLbl:  { fontSize: 10, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },
  statSep:          { width: 1, height: 28, backgroundColor: Colors.divider },

  progRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  progBg:   { flex: 1, height: 5, backgroundColor: Colors.divider, borderRadius: 2.5 },
  progFill: { height: 5, borderRadius: 2.5 },
  progPct:  { fontSize: 10, fontWeight: '700', color: Colors.textSecondary, minWidth: 72 },
});
