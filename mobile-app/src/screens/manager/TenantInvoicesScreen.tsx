import { useBillingRealtime } from '@/hooks/useBillingRealtime';
import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import {
  realManagerInvoiceService, ManagerInvoice, ManagerInvoiceType, ManagerInvoiceStatus,
} from '@/services/manager/invoiceService';
import { CollectPaymentSheet } from '@/components/manager/CollectPaymentSheet';

const SH = Dimensions.get('window').height;

/**
 * HOÁ ĐƠN CỦA MỘT KHÁCH THUÊ (màn của quản lý vận hành).
 *
 * Viết lại 15/08/2026 — bản cũ chạy 100% trên `MOCK_INVOICES` viết cứng trong file:
 * không gọi API nào, và `tenantId` thật là id hợp đồng từ BE (số) trong khi mock dùng
 * 't1'/'t2' nên KHÔNG BAO GIỜ khớp → màn luôn rỗng với dữ liệu thật.
 *
 * Mỗi hoá đơn là MỘT DÒNG, không gom theo tháng. Lý do: hệ thống phát hành tách bạch
 * theo loại — tiền phòng do cron tự phát ngày 1, điện/nước phát tay sau khi ghi chỉ số,
 * khác ngày, khác hạn nộp, khác mã QR. Gom lại thành "thẻ tháng" thì phải bịa ra quy ước
 * trạng thái cho trường hợp tiền phòng đã trả mà tiền điện chưa. App của khách thuê cũng
 * đang liệt kê từng hoá đơn riêng — để hai bên nhìn cùng một hình dạng.
 */

type FilterKey = 'all' | 'unpaid' | 'overdue' | 'paid';

const TYPE_CFG: Record<ManagerInvoiceType, { label: string; icon: string; color: string; bg: string }> = {
  RENT:        { label: 'Tiền phòng', icon: '🏠', color: '#7C3AED', bg: '#F5F3FF' },
  ELECTRICITY: { label: 'Tiền điện',  icon: '⚡', color: '#D97706', bg: '#FEF9C3' },
  WATER:       { label: 'Tiền nước',  icon: '💧', color: '#2563EB', bg: '#DBEAFE' },
  SERVICE:     { label: 'Phí dịch vụ', icon: '🧾', color: '#0891B2', bg: '#CFFAFE' },
  OTHER:       { label: 'Khoản khác', icon: '📄', color: '#059669', bg: '#ECFDF5' },
};

const STATUS_CFG: Record<ManagerInvoiceStatus, { label: string; color: string; bg: string }> = {
  OVERDUE:   { label: 'Quá hạn',          color: '#DC2626', bg: '#FEE2E2' },
  PENDING:   { label: 'Chưa thanh toán',  color: '#D97706', bg: '#FEF3C7' },
  PARTIAL:   { label: 'Trả một phần',     color: '#2563EB', bg: '#DBEAFE' },
  PAID:      { label: 'Đã thanh toán',    color: '#16A34A', bg: '#F0FDF4' },
  CANCELLED: { label: 'Đã huỷ',           color: '#64748B', bg: '#F1F5F9' },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',     label: 'Tất cả' },
  { key: 'overdue', label: 'Quá hạn' },
  { key: 'unpaid',  label: 'Chưa thu' },
  { key: 'paid',    label: 'Đã thu' },
];

const matchFilter = (inv: ManagerInvoice, f: FilterKey) =>
  f === 'all' ? true
    : f === 'overdue' ? inv.status === 'OVERDUE'
      : f === 'unpaid' ? inv.status === 'PENDING' || inv.status === 'OVERDUE' || inv.status === 'PARTIAL'
        : inv.status === 'PAID';

const fmt = (n: number | null | undefined) => (n || 0).toLocaleString('vi-VN') + 'đ';
const fmtDay = (iso?: string) => (iso ? iso.split('T')[0].split('-').reverse().join('/') : '—');

/** "Phòng 101" / "Nhà nguyên căn" → "101" / null, để so với `roomNumber` của hoá đơn. */
const roomNumberOf = (roomName?: string): string | null => {
  const m = (roomName || '').match(/\d+\w*/);
  return m ? m[0] : null;
};

// ── Chi tiết một hoá đơn ────────────────────────────────────────────────
const InvoiceDetailModal: React.FC<{
  invoice: ManagerInvoice;
  tenantName: string;
  onClose: () => void;
  /** Mở luồng thu hộ với hình thức đã chọn. */
  onCollect: (purpose: 'CASH_COLLECT' | 'PROXY_PAY') => void;
}> = ({ invoice, tenantName, onClose, onCollect }) => {
  const tc = TYPE_CFG[invoice.type] ?? TYPE_CFG.OTHER;
  const sc = STATUS_CFG[invoice.status] ?? STATUS_CFG.PENDING;
  // Hoá đơn đã thu / đã huỷ thì không còn gì để nộp thay khách.
  const collectable = invoice.status === 'PENDING'
    || invoice.status === 'OVERDUE'
    || invoice.status === 'PARTIAL';

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={ds.overlay}>
        <View style={ds.sheet}>
          <View style={[ds.head, { backgroundColor: tc.bg }]}>
            <View style={ds.headTop}>
              <Text style={ds.headIcon}>{tc.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[ds.headTitle, { color: tc.color }]}>{tc.label}</Text>
                <Text style={ds.headCode}>{invoice.code}</Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={10}>
                <Text style={ds.close}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={[ds.headAmount, { color: tc.color }]}>{fmt(invoice.amount)}</Text>
            <View style={[ds.statusPill, { backgroundColor: sc.bg }]}>
              <Text style={[ds.statusText, { color: sc.color }]}>{sc.label}</Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={ds.body}>
            <Row label="Khách thuê" value={tenantName} />
            <Row label="Bất động sản" value={invoice.propertyName} />
            <Row label="Phòng" value={invoice.roomNumber || 'Nhà nguyên căn'} />
            <Row label="Kỳ" value={`Tháng ${String(invoice.month).padStart(2, '0')}/${invoice.year}`} />
            <Row label="Hạn nộp" value={fmtDay(invoice.dueDate)} />
            <Row label="Ngày phát hành" value={fmtDay(invoice.createdAt)} last />

            {/*
              KHÔNG có nút "Xác nhận đã thu" tự do ở đây. Bản cũ có, nhưng nó chỉ hiện một
              hộp thoại rồi đóng modal — không gọi API nào, không ghi nhận gì.

              Thay bằng "Thu tiền hộ khách": nộp thay khách bằng QR thật, và phải có mã
              admin cấp cho đúng hoá đơn này (xem CollectPaymentSheet). Việc duyệt khoản
              khách TỰ BÁO đã chuyển vẫn nằm ở màn Thu & Đối soát.
            */}
            {/* HAI nút cho HAI ca, không bắt chọn lại trong sheet. */}
            {collectable && (
              <>
                <TouchableOpacity style={ds.collectBtn} onPress={() => onCollect('CASH_COLLECT')}>
                  <Text style={ds.collectBtnText}>💵  Khách trả tiền mặt</Text>
                  <Text style={ds.collectBtnSub}>Bạn nhận tiền mặt rồi tự chuyển vào QR</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[ds.collectBtn, ds.collectBtnAlt]} onPress={() => onCollect('PROXY_PAY')}>
                  <Text style={ds.collectBtnText}>👥  Có người trả hộ</Text>
                  <Text style={ds.collectBtnSub}>Người trả hộ tự quét QR · phải ghi tên họ</Text>
                </TouchableOpacity>
              </>
            )}

            <Text style={ds.note}>
              Khách tự trả xong thì trạng thái ở đây tự đổi. Xác nhận khoản khách báo đã
              chuyển thì làm ở màn Thu & Đối soát.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const Row: React.FC<{ label: string; value: string; last?: boolean }> = ({ label, value, last }) => (
  <>
    <View style={ds.row}>
      <Text style={ds.rowLabel}>{label}</Text>
      <Text style={ds.rowValue}>{value}</Text>
    </View>
    {!last && <View style={ds.rowDivider} />}
  </>
);

// ── Thẻ hoá đơn trong danh sách ─────────────────────────────────────────
const InvoiceCard: React.FC<{ invoice: ManagerInvoice; onPress: () => void }> = ({ invoice, onPress }) => {
  const tc = TYPE_CFG[invoice.type] ?? TYPE_CFG.OTHER;
  const sc = STATUS_CFG[invoice.status] ?? STATUS_CFG.PENDING;
  return (
    <TouchableOpacity style={cs.card} onPress={onPress} activeOpacity={0.7}>
      <View style={[cs.iconWrap, { backgroundColor: tc.bg }]}>
        <Text style={cs.icon}>{tc.icon}</Text>
      </View>
      <View style={cs.mid}>
        <Text style={cs.type} numberOfLines={1}>{tc.label}</Text>
        <Text style={cs.meta} numberOfLines={1}>
          Tháng {String(invoice.month).padStart(2, '0')}/{invoice.year} · hạn {fmtDay(invoice.dueDate)}
        </Text>
        <Text style={cs.code} numberOfLines={1}>{invoice.code}</Text>
      </View>
      <View style={cs.right}>
        <Text style={cs.amount}>{fmt(invoice.amount)}</Text>
        <View style={[cs.badge, { backgroundColor: sc.bg }]}>
          <Text style={[cs.badgeText, { color: sc.color }]}>{sc.label}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ── Màn chính ───────────────────────────────────────────────────────────
export const TenantInvoicesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { tenantName, roomName, propertyId, propertyName, autoOpenFirst } =
    route.params as {
      tenantId: string; tenantName: string; roomId: string; roomName: string;
      propertyId: string; propertyName: string; autoOpenFirst?: boolean;
    };

  const [invoices, setInvoices] = useState<ManagerInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [selected, setSelected] = useState<ManagerInvoice | null>(null);
  /** Hoá đơn + hình thức đang mở luồng thu hộ — null là đang đóng. */
  const [collecting, setCollecting] = useState<
    { inv: ManagerInvoice; purpose: 'CASH_COLLECT' | 'PROXY_PAY' } | null
  >(null);
  const [autoOpened, setAutoOpened] = useState(false);

  const wantRoom = roomNumberOf(roomName);
  const propId = Number(propertyId);

  /**
   * BE chưa có tham số lọc theo hợp đồng/khách trên `/manager/invoices` (chỉ có
   * period/status/type) nên lấy danh sách của quản lý rồi lọc tại máy theo
   * bất động sản + số phòng. Khi BE thêm `contractId` thì bỏ phần lọc này đi.
   */
  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      const all = await realManagerInvoiceService.listInvoices();
      const mine = all.filter(inv => {
        if (inv.propertyId !== propId) return false;
        // Nhà nguyên căn: hoá đơn không có số phòng.
        if (!wantRoom) return !inv.roomNumber;
        return String(inv.roomNumber ?? '') === wantRoom;
      });
      setInvoices(mine);
    } catch (e: any) {
      setInvoices([]);
      setError(e?.response?.data?.message || e?.message || 'Không tải được hoá đơn');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [propId, wantRoom]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Khách trả xong → BE bắn INVOICE_PAID → nạp lại ngay, quản lý không phải thoát ra vào lại.
  useBillingRealtime({
    filter: (e) => e.event === 'INVOICE_PAID'
      && (e.propertyId == null || Number(e.propertyId) === propId),
    onRefresh: () => load(true),
  });

  const sorted = useMemo(() => {
    const order: Record<string, number> = { OVERDUE: 0, PENDING: 1, PARTIAL: 2, PAID: 3, CANCELLED: 4 };
    return [...invoices].sort((a, b) =>
      (order[a.status] ?? 9) - (order[b.status] ?? 9)
      || (b.year - a.year) || (b.month - a.month),
    );
  }, [invoices]);

  const filtered = useMemo(
    () => sorted.filter(i => matchFilter(i, activeFilter)),
    [sorted, activeFilter],
  );

  const counts = useMemo(() => ({
    all: invoices.length,
    overdue: invoices.filter(i => matchFilter(i, 'overdue')).length,
    unpaid: invoices.filter(i => matchFilter(i, 'unpaid')).length,
    paid: invoices.filter(i => matchFilter(i, 'paid')).length,
  }), [invoices]);

  const totalUnpaid = useMemo(
    () => invoices.filter(i => matchFilter(i, 'unpaid')).reduce((s, i) => s + (i.amount || 0), 0),
    [invoices],
  );

  // Mở sẵn hoá đơn chưa thu đầu tiên khi vào từ cảnh báo nợ — chỉ làm MỘT lần.
  React.useEffect(() => {
    if (!autoOpenFirst || autoOpened || loading) return;
    const first = sorted.find(i => matchFilter(i, 'unpaid'));
    if (first) { setSelected(first); setAutoOpened(true); }
  }, [autoOpenFirst, autoOpened, loading, sorted]);

  return (
    <SafeAreaView style={ss.safe} edges={['top', 'left', 'right']}>
      <View style={ss.header}>
        <TouchableOpacity style={ss.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={ss.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={ss.headerTitle} numberOfLines={1}>{tenantName}</Text>
          <Text style={ss.headerSub} numberOfLines={1}>{roomName} · {propertyName}</Text>
        </View>
      </View>

      {/* Tổng còn phải thu — con số quản lý cần thấy đầu tiên */}
      <View style={ss.summary}>
        <Text style={ss.summaryLabel}>Còn phải thu</Text>
        <Text style={[ss.summaryValue, totalUnpaid > 0 && { color: Colors.error }]}>
          {fmt(totalUnpaid)}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={ss.filterRow}
      >
        {FILTERS.map(f => {
          const on = activeFilter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[ss.chip, on && ss.chipOn]}
              onPress={() => setActiveFilter(f.key)}
            >
              <Text style={[ss.chipText, on && ss.chipTextOn]}>
                {f.label} {counts[f.key]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={ss.state}><ActivityIndicator color={Colors.primary} /><Text style={ss.stateText}>Đang tải hoá đơn...</Text></View>
      ) : error ? (
        <View style={ss.state}>
          <Text style={ss.stateEmoji}>⚠️</Text>
          <Text style={ss.stateText}>{error}</Text>
          <TouchableOpacity style={ss.retry} onPress={() => load()}>
            <Text style={ss.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={ss.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              colors={[Colors.primary]}
              tintColor={Colors.primary}
            />
          }
        >
          {filtered.length === 0 ? (
            <View style={ss.state}>
              <Text style={ss.stateEmoji}>🧾</Text>
              <Text style={ss.stateText}>
                {invoices.length === 0
                  ? 'Khách này chưa có hoá đơn nào.'
                  : 'Không có hoá đơn nào khớp bộ lọc.'}
              </Text>
            </View>
          ) : (
            filtered.map(inv => (
              <InvoiceCard key={inv.id} invoice={inv} onPress={() => setSelected(inv)} />
            ))
          )}
        </ScrollView>
      )}

      {selected && (
        <InvoiceDetailModal
          invoice={selected}
          tenantName={tenantName}
          onClose={() => setSelected(null)}
          // Đóng modal chi tiết trước rồi mới mở sheet thu tiền: hai Modal lồng nhau
          // trên Android chỉ hiện cái dưới, sheet sẽ không bấm được.
          onCollect={(purpose) => { setCollecting({ inv: selected, purpose }); setSelected(null); }}
        />
      )}

      {collecting && (
        <CollectPaymentSheet
          invoiceId={collecting.inv.id}
          invoiceCode={collecting.inv.code}
          tenantName={tenantName}
          roomLabel={collecting.inv.roomNumber || 'Nhà nguyên căn'}
          initialPurpose={collecting.purpose}
          onClose={() => setCollecting(null)}
          // QR đã tạo → nạp lại để bắt trạng thái PAID khi webhook về.
          onQrCreated={load}
        />
      )}
    </SafeAreaView>
  );
};

// ── Styles ──────────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 28, color: Colors.textPrimary, marginTop: -4 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  headerSub: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },

  summary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.white, marginHorizontal: Spacing.md, marginTop: Spacing.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border,
  },
  summaryLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  summaryValue: { fontSize: 18, fontWeight: '900', color: Colors.textPrimary },

  filterRow: { gap: 8, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: BorderRadius.full,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  chipTextOn: { color: Colors.white },

  list: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl },
  state: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.sm },
  stateEmoji: { fontSize: 34 },
  stateText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.lg },
  retry: {
    marginTop: Spacing.xs, backgroundColor: Colors.primary, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  retryText: { color: Colors.white, fontWeight: '800', fontSize: 13 },
});

const cs = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.white, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  iconWrap: { width: 40, height: 40, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 18 },
  mid: { flex: 1 },
  type: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  meta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  code: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  right: { alignItems: 'flex-end', gap: 5 },
  amount: { fontSize: 14, fontWeight: '900', color: Colors.textPrimary },
  badge: { borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '800' },
});

const ds = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: SH * 0.85, overflow: 'hidden',
  },
  head: { padding: Spacing.lg },
  headTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  headIcon: { fontSize: 26 },
  headTitle: { fontSize: 16, fontWeight: '900' },
  headCode: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  close: { fontSize: 18, color: Colors.textMuted, fontWeight: '700' },
  headAmount: { fontSize: 28, fontWeight: '900', marginTop: Spacing.md },
  statusPill: { alignSelf: 'flex-start', marginTop: Spacing.sm, borderRadius: BorderRadius.full, paddingHorizontal: 12, paddingVertical: 5 },
  statusText: { fontSize: 12, fontWeight: '800' },

  body: { padding: Spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 11, gap: Spacing.md },
  rowLabel: { fontSize: 13, color: Colors.textMuted, flex: 1 },
  rowValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, flex: 2, textAlign: 'right' },
  rowDivider: { height: 1, backgroundColor: Colors.divider },
  collectBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: 13, paddingHorizontal: Spacing.md, alignItems: 'center',
    marginTop: Spacing.md, ...Shadow.md,
  },
  collectBtnAlt: { backgroundColor: '#4F46E5', marginTop: Spacing.sm },
  collectBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  collectBtnSub: { fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 2 },

  note: {
    marginTop: Spacing.lg, fontSize: 12, lineHeight: 18, color: Colors.textMuted,
    backgroundColor: Colors.background, padding: Spacing.md, borderRadius: BorderRadius.md,
  },
});
