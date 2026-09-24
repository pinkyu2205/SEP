import { useBillingRealtime } from '@/hooks/useBillingRealtime';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity, ActivityIndicator, ScrollView,
  RefreshControl, TextInput, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow, canTerminateForUnpaidInvoice, daysOverdue } from '@/constants';
import { checkoutService } from '@/services/manager/checkoutService';
import { activeRentingKeys, belongsToActiveTenant } from '@/utils';
import { formatCurrency, showAlert } from '@/utils';
import {
  realManagerInvoiceService, ManagerPayment, ManagerInvoice, ManagerPaymentHistoryEntry,
} from '@/services/manager/invoiceService';
import { managerDepositService, ManagerDeposit } from '@/services/manager/depositService';
import { managerPropertyService } from '@/services/manager/propertyService';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';
import { serverNow, todayIso } from '@/utils/serverTime';

/**
 * THU & ĐỐI SOÁT — toàn bộ giao dịch của khách thuê trong phạm vi manager quản lý.
 *
 * Tách khỏi màn "Hoá đơn tiền nhà": màn kia chỉ lo KỲ THU HIỆN TẠI của tiền nhà
 * (hệ thống tự phát hành hằng tháng, ai đã/chưa đóng). Màn này là dòng thời gian đầy
 * đủ, gộp 2 nguồn mà BE để ở 2 chỗ khác nhau:
 *   • Đã thu thật — `/api/v1/manager/payments/history` (bảng `tenant_payments`):
 *     mọi lần thu đã vào sổ, kể cả khách trả PayOS (không sinh claim).
 *   • Chờ đối soát — `/api/v1/manager/payments` (bảng `tenant_payment_claims`):
 *     khách tự khai đã chuyển, manager cần xác nhận / từ chối.
 *   • Tiền cọc — nằm trên hợp đồng, không có trong bảng thanh toán (xem depositService).
 *
 * SỐ TIỀN (xem @/constants/managerVisibility):
 *   • Tiền nhà VÀ tiền cọc — ẩn, chỉ hiện trạng thái đã thu / chờ xác nhận / từ chối.
 *     (cọc: ẩn 07/08 → mở lại 10/08 → ẩn lại 13/08/2026)
 *   • Điện, nước, dịch vụ — HIỆN số tiền.
 */

type Filter = 'DEBT' | 'all' | 'PENDING_VERIFY' | 'DEPOSIT';


const METHOD_CONFIG: Record<string, { label: string; icon: string }> = {
  QR:            { label: 'QR VietQR',    icon: '📱' },
  PAYOS:         { label: 'PayOS',        icon: '📱' },
  BANK_TRANSFER: { label: 'Chuyển khoản', icon: '🏦' },
  CASH:          { label: 'Tiền mặt',     icon: '💵' },
  EWALLET:       { label: 'Ví điện tử',   icon: '👛' },
  OTHER:         { label: 'Khác',         icon: '💳' },
};
const methodOf = (m?: string) => METHOD_CONFIG[(m || '').toUpperCase()] ?? METHOD_CONFIG.OTHER;

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  VERIFIED:       { label: '✓ Đã xác nhận', color: Colors.success,   bg: Colors.successLight },
  PENDING_VERIFY: { label: 'Chờ xác nhận',  color: Colors.warning,   bg: Colors.warningLight },
  REJECTED:       { label: 'Bị từ chối',    color: Colors.error,     bg: Colors.errorLight },
  PAID:           { label: '✓ Đã thu cọc',  color: Colors.success,   bg: Colors.successLight },
  PENDING:        { label: 'Chưa thu cọc',  color: Colors.warning,   bg: Colors.warningLight },
  FAILED:         { label: 'Thu thất bại',  color: Colors.error,     bg: Colors.errorLight },
  CANCELLED:      { label: 'Đã huỷ',        color: Colors.textMuted, bg: Colors.background },
};
const statusOf = (s?: string) =>
  STATUS_CONFIG[(s || '').toUpperCase()] ?? STATUS_CONFIG.PENDING_VERIFY;

const CONTRACT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Đang hiệu lực', PENDING: 'Chờ ký', EXPIRED: 'Hết hạn',
  TERMINATED: 'Đã chấm dứt', DRAFT: 'Nháp',
};

/**
 * Loại hoá đơn suy từ mã — dùng cho DÒNG CLAIM: `ManagerPaymentResponse` không trả
 * `invoiceType`, mà quy tắc ẩn/hiện số tiền lại phụ thuộc loại. (Dòng đã thu thì đọc
 * `invoiceType` của BE — xem `invoiceKindOfType`.) Hai bộ mã đang tồn tại trong DB:
 *   • `HD-RENT-23-2026-08`, `HD-SVC-1-2026-08`
 *   • `INV00022-202608-R` / `-E` / `-W` / `-S`
 * Không khớp mẫu nào thì coi như tiền nhà (ẩn tiền) cho an toàn.
 */
type InvoiceKind = 'ONBOARD' | 'RENT' | 'ELECTRICITY' | 'WATER' | 'SERVICE' | 'MAINTENANCE' | 'UNKNOWN';
const invoiceKindOf = (code?: string): InvoiceKind => {
  const c = (code || '').toUpperCase();
  // Khoản thu lúc đón khách: BE để `invoiceType = OTHER` nên phải nhận theo mã, không
  // thì rơi vào UNKNOWN và hiện trơ là "Hoá đơn" — đúng dòng khách chuyển tiền đầu tiên
  // mà đọc vào không biết là khoản gì.
  if (c.startsWith('HD-ONBOARD')) return 'ONBOARD';
  // Phí sửa chữa do khách làm hư (BE gom khoản đền bù thành hoá đơn MAINTENANCE).
  if (c.startsWith('HD-MAINT')) return 'MAINTENANCE';
  if (c.includes('-RENT-') || /-R$/.test(c)) return 'RENT';
  if (c.includes('-ELEC') || /-E$/.test(c)) return 'ELECTRICITY';
  if (c.includes('-WATER') || /-W$/.test(c)) return 'WATER';
  if (c.includes('-SVC') || /-S$/.test(c)) return 'SERVICE';
  return 'UNKNOWN';
};
/**
 * Ưu tiên `invoiceType` do BE trả (endpoint lịch sử thu có sẵn field này), chỉ suy
 * theo mã khi thiếu. Suy theo mã là phương án chống cháy: hai bộ mã cùng tồn tại và
 * mã mới nào không khớp mẫu sẽ rơi vào UNKNOWN → ẩn số tiền dù có thể là điện/nước.
 */
const invoiceKindOfType = (type?: string | null, code?: string): InvoiceKind => {
  switch ((type || '').toUpperCase()) {
    case 'RENT':        return 'RENT';
    case 'ELECTRICITY': return 'ELECTRICITY';
    case 'WATER':       return 'WATER';
    case 'SERVICE':     return 'SERVICE';
    case 'MAINTENANCE': return 'MAINTENANCE';
    default:            return invoiceKindOf(code);
  }
};

const KIND_LABEL: Record<InvoiceKind, string> = {
  ONBOARD: 'Thu lúc đón khách (cọc + kỳ đầu)',
  RENT: 'Hoá đơn tiền nhà', ELECTRICITY: 'Hoá đơn tiền điện', WATER: 'Hoá đơn tiền nước',
  SERVICE: 'Hoá đơn dịch vụ', MAINTENANCE: 'Phí sửa chữa (khách làm hư)', UNKNOWN: 'Hoá đơn',
};
/**
 * Chỉ tiền nhà mới bị ẩn; loại chưa nhận ra thì ẩn cho chắc.
 * ONBOARD cũng ẩn — khoản đó gộp tiền nhà kỳ đầu + tiền cọc, cả hai đều ngoài tầm
 * manager (@/constants/managerVisibility). BE cũng đã mask về null.
 */
const isAmountHidden = (k: InvoiceKind) =>
  k === 'RENT' || k === 'ONBOARD' || k === 'UNKNOWN';

/** Bỏ dấu để gõ không dấu vẫn tìm ra ("trang" → "Đỗ Minh Trang"). */
const norm = (s: string) =>
  (s || '').normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').replace(/[đĐ]/g, 'd').toLowerCase();

const pad = (n: number) => String(n).padStart(2, '0');
/** "2026-08-07T14:58" → "07/08/2026" (khoá nhóm theo ngày). */
const dayKey = (iso?: string) => (iso ? iso.slice(0, 10) : '');
const dayLabel = (key: string) => {
  // Mọi mục vào được màn này đều đã có thời điểm (xem `entries`) — nhánh này chỉ để
  // phòng dữ liệu BE thiếu `createdAt`, không phải trạng thái bình thường.
  if (!key) return 'Không rõ ngày';
  const [y, m, d] = key.split('-').map(Number);
  const that = new Date(y, m - 1, d);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(serverNow()) - startOf(that)) / 86_400_000);
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Hôm qua';
  return `${pad(d)}/${pad(m)}/${y}`;
};
const timeOf = (iso?: string) => (iso && iso.includes('T') ? iso.slice(11, 16) : '');
/** Nhãn đầy đủ cho sheet chi tiết: "07/08/2026 · 14:58". */
const fullTime = (iso?: string) => {
  const k = dayKey(iso);
  if (!k) return '—';
  const [y, m, d] = k.split('-');
  const t = timeOf(iso);
  return `${d}/${m}/${y}${t ? ` · ${t}` : ''}`;
};
const dateOnly = (iso?: string) => {
  const k = dayKey(iso);
  if (!k) return '—';
  const [y, m, d] = k.split('-');
  return `${d}/${m}/${y}`;
};

/** 1 dòng trong dòng thời gian — gộp từ giao dịch hoá đơn và tiền cọc. */
interface Entry {
  key: string;
  kind: 'INVOICE' | 'DEPOSIT';
  /** Id giao dịch (INVOICE) — dùng để xác nhận / từ chối. */
  paymentId?: number;
  /** Id hợp đồng (DEPOSIT) — dùng để lấy số tiền cọc. */
  contractId?: number;
  tenantName: string;
  tenantPhone?: string;
  roomNumber?: string;
  propertyName: string;
  /** Mã hoá đơn hoặc mã hợp đồng. */
  ref: string;
  /** Loại hoá đơn (chỉ có nghĩa với kind === 'INVOICE'). */
  invoiceKind: InvoiceKind;
  /** Số tiền BE trả trong giao dịch hoá đơn. */
  amount?: number;
  method?: string;
  status: string;
  /** Thời điểm dùng để xếp + gom nhóm kỳ. */
  at?: string;
  note?: string;
  depositMonths?: number;
  moveInDate?: string;
  contractStatus?: string;
  /** Tab "Đã thu": một dòng = một KHÁCH, các khoản đã thu nằm trong đây. */
  children?: Entry[];
}

const fromPayment = (p: ManagerPayment): Entry => ({
  key: `inv-${p.id}`,
  kind: 'INVOICE',
  paymentId: p.id,
  tenantName: p.tenantName || '—',
  roomNumber: p.roomNumber ?? undefined,
  propertyName: p.propertyName || '—',
  ref: p.invoiceCode || '',
  invoiceKind: invoiceKindOf(p.invoiceCode),
  amount: p.amount,
  method: p.method,
  status: p.status,
  // Đã xác nhận thì mốc đúng là lúc xác nhận; chưa thì lúc khách báo.
  at: p.verifiedAt || p.createdAt,
  note: p.transferContent,
});

/**
 * Một lần THU THẬT (bảng `tenant_payments`) → một dòng trong dòng thời gian.
 *
 * Trước 17/08/2026 màn này phải dựng dòng "đã thu" từ chính hoá đơn `PAID` vì manager
 * không có endpoint nào đọc được bảng thu. Cách đó chỉ ra ĐƯỢC MỘT dòng cho mỗi hoá đơn
 * (hoá đơn trả nhiều lần thì mất các lần trước) và lấy `paidAt` của hoá đơn thay cho mốc
 * thu. Nay đọc thẳng sổ thu nên đủ và đúng mốc.
 */
const fromHistory = (h: ManagerPaymentHistoryEntry): Entry => ({
  key: `pay-${h.id}`,
  kind: 'INVOICE',
  // KHÔNG set paymentId: đây là khoản ĐÃ vào sổ, không phải claim để xác nhận/từ chối.
  contractId: h.contractId ?? undefined,
  tenantName: h.tenantName || '—',
  roomNumber: h.roomNumber ?? undefined,
  propertyName: h.propertyName || '—',
  ref: h.invoiceCode || '',
  // BE trả sẵn `invoiceType` → khỏi suy theo mã hoá đơn như trước.
  invoiceKind: invoiceKindOfType(h.invoiceType, h.invoiceCode),
  amount: h.amount ?? undefined,
  method: h.method ?? undefined,
  status: 'VERIFIED',
  at: h.paidAt ?? undefined,
  note: h.transactionId ?? undefined,
});

/**
 * Hoá đơn ĐÃ THU nhưng KHÔNG có bản ghi nào trong sổ thu → vẫn phải hiện.
 *
 * Lưới an toàn cho hai ca thật:
 *  • Dữ liệu cũ: hoá đơn được đánh `PAID` trước khi BE bắt đầu ghi `tenant_payments`,
 *    nên sổ thu không có dòng nào — bỏ qua là mất hẳn khoản khách đã trả.
 *  • `/manager/payments/history` lỗi hoặc chưa có (BE chưa restart): request hỏng bị
 *    `.catch(() => [])` nuốt, màn sẽ trống trơn mà không báo gì.
 *
 * Kém chính xác hơn sổ thu: mỗi hoá đơn chỉ ra ĐƯỢC MỘT dòng (hoá đơn trả nhiều lần
 * thì mất các lần trước) và mốc là `paidAt` của hoá đơn. Vì vậy chỉ dùng cho hoá đơn
 * mà sổ thu không có.
 */
const fromPaidInvoice = (i: ManagerInvoice): Entry => ({
  key: `pinv-${i.id}`,
  kind: 'INVOICE',
  // KHÔNG set paymentId: không phải claim nên không có gì để xác nhận/từ chối.
  contractId: i.contractId ?? undefined,
  tenantName: i.tenantName || '—',
  roomNumber: i.roomNumber ?? undefined,
  propertyName: i.propertyName || '—',
  ref: i.code || '',
  invoiceKind: invoiceKindOfType(i.type, i.code),
  // `amount` hoá đơn tiền nhà bị BE mask (null) — giữ null, đừng bù 0.
  amount: i.amount ?? undefined,
  method: i.paymentMethod ?? undefined,
  status: 'VERIFIED',
  at: i.paidAt ?? undefined,
  note: i.transactionId ?? undefined,
});

const fromDeposit = (d: ManagerDeposit): Entry => ({
  key: `dep-${d.contractId}`,
  kind: 'DEPOSIT',
  contractId: d.contractId,
  tenantName: d.tenantName,
  tenantPhone: d.tenantPhone,
  roomNumber: d.roomNumber,
  propertyName: d.propertyName,
  ref: d.contractCode,
  invoiceKind: 'UNKNOWN',
  method: d.method,
  status: d.status,
  at: d.paidAt,
  depositMonths: d.depositMonths,
  moveInDate: d.moveInDate,
  contractStatus: d.contractStatus,
});

/** Icon + nhãn ngắn theo loại khoản — thứ manager quét mắt tìm trước tiên. */
const KIND_SHORT: Record<InvoiceKind, { icon: string; label: string }> = {
  ONBOARD: { icon: '🤝', label: 'Thu lúc đón khách' },
  RENT: { icon: '🏠', label: 'Tiền nhà' },
  ELECTRICITY: { icon: '⚡', label: 'Tiền điện' },
  WATER: { icon: '💧', label: 'Tiền nước' },
  SERVICE: { icon: '🧾', label: 'Dịch vụ' },
  MAINTENANCE: { icon: '🔧', label: 'Phí sửa chữa' },
  UNKNOWN: { icon: '📄', label: 'Khoản khác' },
};

/**
 * Một dòng giao dịch (làm lại 24/09/2026): dòng 1 = LOẠI KHOẢN + phòng, dòng 2 = khách +
 * thời gian + hình thức. Bên phải: số tiền (nếu được xem), hoặc chữ "Đã thu". Badge
 * trạng thái CHỈ hiện khi khác bình thường (chờ xác nhận / từ chối / chưa thu cọc) —
 * trước đây dòng nào cũng mang "✓ Đã xác nhận" + "•••", nhìn như lỗi.
 */
const TxnRow: React.FC<{
  entry: Entry;
  onPress: (e: Entry) => void;
}> = React.memo(({ entry, onPress }) => {
  const mc = methodOf(entry.method);
  const up = (entry.status || '').toUpperCase();
  const isDeposit = entry.kind === 'DEPOSIT';
  const hidden = isDeposit || isAmountHidden(entry.invoiceKind);
  const kind = isDeposit ? { icon: '🔐', label: 'Tiền cọc' } : KIND_SHORT[entry.invoiceKind];
  const normal = up === 'VERIFIED' || up === 'PAID';
  const st = statusOf(entry.status);
  const when = entry.at
    ? `${dayLabel(dayKey(entry.at))}${timeOf(entry.at) ? ` ${timeOf(entry.at)}` : ''}`
    : 'Chưa thu';

  return (
    <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={() => onPress(entry)}>
      <View style={s.rowIcon}>
        <Text style={{ fontSize: 17 }}>{kind.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowName} numberOfLines={1}>
          {kind.label}{entry.roomNumber ? ` · P.${entry.roomNumber}` : ''}
        </Text>
        <Text style={s.rowMeta} numberOfLines={1}>
          {entry.tenantName} · {when}{entry.method ? ` · ${mc.label}` : ''}
        </Text>
      </View>
      <View style={s.rowRight}>
        {!hidden && <Text style={s.rowAmount} numberOfLines={1}>{formatCurrency(entry.amount ?? 0)}</Text>}
        {normal
          ? null
          : (
            <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
              <Text style={[s.statusBadgeText, { color: st.color }]}>{st.label}</Text>
            </View>
          )}
      </View>
    </TouchableOpacity>
  );
});

/** "18/09 14:20" — ngắn, đủ để đối chiếu; ngày đầy đủ xem trong chi tiết. */
const shortWhen = (iso?: string) => {
  const k = dayKey(iso);
  if (!k) return '';
  const [, m, d] = k.split('-');
  const t = timeOf(iso);
  return `${d}/${m}${t ? ` ${t}` : ''}`;
};

/**
 * TAB "ĐÃ THU" — mỗi KHÁCH một khối (làm lại 24/09/2026).
 *
 * Bản trước là danh sách phẳng từng giao dịch, dòng nào cũng "✓ Đã thu" (thừa — đang ở
 * tab Đã thu) và tên khách bị đẩy xuống dòng phụ rồi cắt mất. Manager đối soát theo
 * NGƯỜI: "tháng này An đã trả những gì". Nên gom theo khách, mỗi khoản một dòng nhỏ:
 * loại · ngày giờ · hình thức, bên phải là số tiền (nếu được xem).
 */
const TenantGroupRow: React.FC<{ group: Entry; onPress: (e: Entry) => void }> = React.memo(({ group, onPress }) => {
  const items = group.children ?? [];
  return (
    <View style={s.tg}>
      <View style={s.tgHead}>
        <Text style={s.tgName} numberOfLines={1}>
          {group.tenantName}{group.roomNumber ? ` · P.${group.roomNumber}` : ''}
        </Text>
        <Text style={s.tgCount}>{items.length} khoản</Text>
      </View>
      {items.map(c => {
        const kind = KIND_SHORT[c.invoiceKind];
        const hidden = isAmountHidden(c.invoiceKind);
        const up = (c.status || '').toUpperCase();
        const st = statusOf(c.status);
        return (
          <TouchableOpacity key={c.key} style={s.tgLine} activeOpacity={0.7} onPress={() => onPress(c)}>
            <Text style={s.tgIcon}>{kind.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.tgLabel} numberOfLines={1}>{kind.label}</Text>
              <Text style={s.tgMeta} numberOfLines={1}>
                {shortWhen(c.at)}{c.method ? ` · ${methodOf(c.method).label}` : ''}
              </Text>
            </View>
            {up !== 'VERIFIED' ? (
              <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                <Text style={[s.statusBadgeText, { color: st.color }]}>{st.label}</Text>
              </View>
            ) : !hidden ? (
              <Text style={s.tgAmount}>{formatCurrency(c.amount ?? 0)}</Text>
            ) : null}
            <Text style={s.tgChevron}>›</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

export const ManagerPaymentHistoryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  // Vào từ link "Tất cả tiền cọc" thì mở thẳng tab Tiền cọc, khỏi bắt bấm thêm.
  // Mặc định mở tab "Đang nợ" — việc manager cần làm nhất ở màn này là đi đòi tiền.
  const initialFilter: Filter = (['DEBT', 'all', 'PENDING_VERIFY', 'DEPOSIT'] as string[]).includes(route.params?.filter)
    ? route.params.filter : 'DEBT';
  const [payments, setPayments] = useState<ManagerPayment[]>([]);
  /** Sổ thu thật — nguồn chính của dòng thời gian (xem fromHistory). */
  const [history, setHistory] = useState<ManagerPaymentHistoryEntry[]>([]);
  /** Hoá đơn PAID — lưới an toàn cho hoá đơn không có dòng nào trong sổ thu. */
  const [paidInvoices, setPaidInvoices] = useState<ManagerInvoice[]>([]);
  /** Hoá đơn CHƯA thu (chờ trả + quá hạn) — nguồn của tab "Đang nợ". */
  const [unpaidInvoices, setUnpaidInvoices] = useState<ManagerInvoice[]>([]);
  /** Phòng còn HĐ hiệu lực — để bỏ nợ của khách đã đi (xử lý ở luồng trả phòng). */
  const [rentingKeys, setRentingKeys] = useState<Set<string>>(new Set());
  const [deposits, setDeposits] = useState<ManagerDeposit[]>([]);
  /** id các HĐ còn hiệu lực — lọc cọc của khách đã rời đi. */
  const [activeContractIds, setActiveContractIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Entry | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      realManagerInvoiceService.listPayments().catch(() => [] as ManagerPayment[]),
      managerDepositService.list().catch(() => [] as ManagerDeposit[]),
      managerPropertyService.getScopedProperties().catch(() => [] as { id: number }[]),
      realManagerInvoiceService.listPaymentHistory()
        .catch(() => [] as ManagerPaymentHistoryEntry[]),
      realManagerInvoiceService.listInvoices().catch(() => [] as ManagerInvoice[]),
    ])
      .then(async ([pay, dep, props, paid, invs]) => {
        setPayments(pay);
        setDeposits(dep);
        setHistory(paid);
        setPaidInvoices(invs.filter(i => (i.status || '').toUpperCase() === 'PAID'));
        setUnpaidInvoices(invs.filter(i => ['PENDING', 'OVERDUE', 'PARTIAL'].includes((i.status || '').toUpperCase())));
        /**
         * Cọc của khách ĐÃ trả phòng / chấm dứt HĐ thì không hiện ở đây nữa: khoản đó
         * đã được tất toán (hoàn lại hoặc trừ vào hư hỏng) ở luồng Trả phòng, để lại
         * chỉ làm manager tưởng đang giữ tiền của người đã đi.
         *
         * Lọc theo `contractId` chứ không theo số phòng — cùng một phòng có thể đã qua
         * nhiều đời khách, ghép theo phòng là giữ nhầm cọc của người cũ.
         */
        const cts = await realTenantService
          .listActiveByProperties(props.map(p => Number(p.id)))
          .catch(() => [] as TenantContractResponse[]);
        setActiveContractIds(new Set(cts.map(c => Number(c.id))));
        setRentingKeys(activeRentingKeys(cts));
      })
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Hoá đơn vừa PAID sinh giao dịch mới, và claim chờ duyệt có thể hết hiệu lực → nạp lại.
  useBillingRealtime({
    filter: (e) => e.event === 'INVOICE_PAID',
    onRefresh: load,
  });

  // Trước 13/08/2026 chỗ này có `ensureDepositAmount` — gọi
  // GET /api/v1/tenant-contracts/{id} cho từng dòng cọc chỉ để lấy field `deposit`
  // (endpoint /manager/deposits không trả số tiền). Nay cọc ẩn số nên bỏ hẳn,
  // đỡ một loạt request mỗi lần cuộn danh sách.

  /**
   * KHÁCH ĐANG NỢ (24/09/2026) — gom MỌI hoá đơn chưa thu theo từng KHÁCH (hợp đồng).
   *
   * Trước đây nợ nằm rải: tiền nhà ở tab Hoá đơn (và chỉ theo từng kỳ — nợ tháng trước
   * phải chọn đúng tháng mới thấy), điện nước ở màn Ghi điện nước → Lịch sử. Một khách
   * nợ cả hai thì manager phải tự ghép. Ở đây mỗi khách một thẻ, nợ lâu nhất lên đầu.
   * Tiền nhà vẫn KHÔNG hiện số tiền (BE mask) — chỉ nêu các tháng còn nợ.
   */
  const debtors = useMemo(() => {
    const groups = new Map<string, ManagerInvoice[]>();
    for (const i of unpaidInvoices) {
      if (!belongsToActiveTenant(i, rentingKeys)) continue;
      const k = i.contractId != null ? `c${i.contractId}` : `${i.propertyId}|${i.roomNumber ?? ''}|${i.tenantName ?? ''}`;
      groups.set(k, [...(groups.get(k) ?? []), i]);
    }
    return [...groups.entries()].map(([key, items]) => {
      const first = items[0];
      const overdueDays = Math.max(0, ...items
        .filter(i => (i.status || '').toUpperCase() === 'OVERDUE')
        .map(i => daysOverdue(i.dueDate || '')));
      const nextDue = items.map(i => i.dueDate).filter(Boolean).sort()[0];
      const byKind = new Map<InvoiceKind, ManagerInvoice[]>();
      for (const i of items) {
        const kind = invoiceKindOfType(i.type, i.code);
        byKind.set(kind, [...(byKind.get(kind) ?? []), i]);
      }
      return {
        key,
        tenantName: first.tenantName || '—',
        roomNumber: first.roomNumber ?? undefined,
        propertyName: first.propertyName,
        propertyId: first.propertyId,
        contractId: items.find(i => i.contractId != null)?.contractId ?? undefined,
        overdue: overdueDays > 0 || items.some(i => (i.status || '').toUpperCase() === 'OVERDUE'),
        overdueDays,
        nextDue,
        // Mọi loại hoá đơn (24/09/2026): tiền nhà từ ngày 8; loại khác quá 5 ngày kể từ ngày phát hành.
        canTerminate: items.some(i => canTerminateForUnpaidInvoice(i)),
        terminateReasons: items.filter(i => canTerminateForUnpaidInvoice(i))
          .map(i => `${KIND_SHORT[invoiceKindOfType(i.type, i.code)].label.toLowerCase()} T${i.month}/${i.year}`),
        lines: [...byKind.entries()].map(([kind, list]) => ({
          kind,
          periods: list.sort((a, b) => (a.year * 100 + a.month) - (b.year * 100 + b.month))
            .map(i => `T${i.month}`).join(', '),
          amount: isAmountHidden(kind) ? null : list.reduce((sum, i) => sum + (i.amount ?? 0), 0),
          // Hoá đơn cũ nhất của loại này — bấm dòng là mở đúng nó (đòi từ khoản lâu nhất).
          firstId: list[0].id,
        })),
      };
    }).sort((a, b) => (b.overdueDays - a.overdueDays) || (a.nextDue || '').localeCompare(b.nextDue || ''));
  }, [unpaidInvoices, rentingKeys]);

  /** Sổ hoá đơn của MỘT khách — nơi xem chi tiết và ghi nhận thu tiền mặt / trả hộ. */
  /**
   * CHẤM DỨT HĐ VÌ NỢ QUÁ HẠN — ngay trên thẻ khách (24/09/2026). Trước đây chỉ làm được
   * với tiền nhà ở tab Hoá đơn; luật mới mở quyền cho MỌI hoá đơn quá 5 ngày kể từ ngày phát
   * hành nên cần một chỗ chung. Giống luồng bên tab Hoá đơn: chấm dứt xong mở luôn yêu cầu
   * trả phòng để kiểm kê + tất toán cọc.
   */
  const [terminatingKey, setTerminatingKey] = useState<string | null>(null);
  const terminateDebtor = (d: (typeof debtors)[number]) => {
    if (d.contractId == null) {
      showAlert('Thiếu dữ liệu', 'Khoản nợ này không gắn với hợp đồng nào nên không chấm dứt được từ đây.');
      return;
    }
    const what = d.terminateReasons.join(', ');
    showAlert(
      'Chấm dứt hợp đồng?',
      `${d.tenantName}${d.roomNumber ? ` · phòng ${d.roomNumber}` : ''} nợ quá hạn: ${what}. `
      + 'Sau khi chấm dứt, hệ thống mở luôn yêu cầu trả phòng để kiểm kê và tất toán cọc.',
      [
        { text: 'Để sau', style: 'cancel' },
        {
          text: 'Chấm dứt', style: 'destructive',
          onPress: async () => {
            setTerminatingKey(d.key);
            try {
              await realTenantService.terminateContract(d.contractId!, {
                type: 'VIOLATION',
                reason: `Không thanh toán ${what} — quá hạn, đã nhắc theo chính sách.`,
              });
              let checkoutId: number | null = null;
              try {
                const req = await checkoutService.createForTenant({
                  contractId: d.contractId!,
                  expectedMoveOutDate: todayIso(),
                  reason: `Chấm dứt hợp đồng do nợ quá hạn: ${what}.`,
                });
                checkoutId = req?.id ?? null;
              } catch { /* vẫn báo để manager tự mở trả phòng */ }
              load();
              showAlert(
                'Đã chấm dứt hợp đồng',
                checkoutId
                  ? 'Đã mở yêu cầu trả phòng. Sang đó để kiểm kê thiết bị, chốt điện nước và tất toán tiền cọc.'
                  : 'Hợp đồng đã thanh lý nhưng CHƯA mở được yêu cầu trả phòng — vào mục Trả phòng tạo thủ công.',
                [
                  { text: 'Để sau', style: 'cancel' },
                  { text: 'Xử lý trả phòng', onPress: () => navigation.navigate('CheckoutRequests') },
                ],
              );
            } catch (e: any) {
              showAlert('Không chấm dứt được', e?.response?.data?.message || e?.message || 'Thử lại sau.');
            } finally {
              setTerminatingKey(null);
            }
          },
        },
      ],
    );
  };

  const openTenantInvoices = (d: (typeof debtors)[number], invoiceId?: number) =>
    navigation.navigate('TenantInvoices', {
      tenantId: String(d.contractId ?? ''),
      tenantName: d.tenantName,
      roomId: '',
      roomName: d.roomNumber ? `Phòng ${d.roomNumber}` : '',
      propertyId: String(d.propertyId),
      propertyName: d.propertyName,
      contractId: d.contractId,
      initialFilter: 'unpaid',
      openInvoiceId: invoiceId,
    });

  const handleBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('ManagerTabs', { screen: 'ManagerBilling' });
  };

  /**
   * Dòng thời gian mặc định = các lần thanh toán THẬT (có thời điểm).
   * Cọc CHƯA thu không phải một lần thanh toán nên không nằm ở đây — nếu để lẫn, nó
   * không có ngày và bị dồn thành một nhóm "không ngày" vô nghĩa ở cuối danh sách.
   */
  /**
   * Cọc của khách CÒN Ở. Khách đã trả phòng / chấm dứt HĐ thì cọc đã tất toán ở luồng
   * Trả phòng (hoàn lại hoặc trừ hư hỏng) — để lại đây làm manager tưởng còn đang giữ
   * tiền của người đã đi.
   *
   * Khi CHƯA nạp được hợp đồng nào thì giữ nguyên danh sách: thà hiện thừa còn hơn
   * giấu mất khoản thật chỉ vì một request hỏng.
   */
  const liveDeposits = useMemo(
    () => (activeContractIds.size === 0
      ? deposits
      : deposits.filter(d => activeContractIds.has(Number(d.contractId)))),
    [deposits, activeContractIds],
  );

  const timeline = useMemo(() => {
    const paidDeposits = liveDeposits.filter(d => !!d.paidAt);
    /**
     * Bỏ hoá đơn đã có claim tương ứng: claim được manager duyệt sẽ đánh dấu hoá đơn
     * PAID, nên cùng một lần thu sẽ ra hai dòng nếu không lọc. Giữ dòng CLAIM vì nó
     * mang thêm ai duyệt / lúc nào.
     */
    const claimedCodes = new Set(payments.map(p => p.invoiceCode).filter(Boolean));
    const historyRows = history
      .filter(h => !!h.paidAt && !claimedCodes.has(h.invoiceCode))
      .map(fromHistory);

    /**
     * Hoá đơn PAID mà sổ thu KHÔNG có dòng nào → thêm vào (xem fromPaidInvoice).
     * Dedupe theo MÃ HOÁ ĐƠN, không theo từng dòng thu: một hoá đơn trả nhiều lần thì
     * sổ thu ra nhiều dòng và phải giữ đủ, chỉ cần không chồng thêm dòng suy từ hoá đơn.
     */
    const ledgerCodes = new Set(history.map(h => h.invoiceCode).filter(Boolean));
    const invoiceRows = paidInvoices
      .filter(i => !!i.paidAt && !claimedCodes.has(i.code) && !ledgerCodes.has(i.code))
      .map(fromPaidInvoice);

    return [
      ...payments.map(fromPayment),
      ...historyRows,
      ...invoiceRows,
      ...paidDeposits.map(fromDeposit),
    ].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  }, [payments, history, paidInvoices, liveDeposits]);

  /**
   * Riêng tab "Tiền cọc" thì hiện ĐỦ cả chưa thu — vào đây từ link "Tất cả tiền cọc"
   * bên màn Hoá đơn nên phải thấy đúng những dòng đang chưa thu ở màn kia.
   */
  const depositEntries = useMemo(
    () => liveDeposits.map(fromDeposit).sort((a, b) => (b.at || '').localeCompare(a.at || '')),
    [liveDeposits],
  );

  /**
   * 3 TAB (24/09/2026) thay cho 3 ô đếm + 5 chip nói lại cùng một chuyện:
   *   • Giao dịch   — mọi lần thu theo kỳ (không gồm cọc), gom theo tháng.
   *   • Chờ xác nhận — việc manager PHẢI làm; có số đỏ.
   *   • Tiền cọc    — tách riêng vì sẽ hoàn lại khi trả phòng; chưa thu lên đầu.
   * "Từ chối" không còn tab riêng: vẫn nằm trong Giao dịch với badge đỏ.
   */
  const filtered = useMemo(() => {
    const kw = norm(search.trim());
    const source = filter === 'DEPOSIT'
      ? depositEntries
      : timeline.filter(e => e.kind === 'INVOICE'
        && (filter !== 'PENDING_VERIFY' || e.status.toUpperCase() === 'PENDING_VERIFY'));
    if (!kw) return source;
    return source.filter(e => [e.tenantName, e.roomNumber, e.propertyName, e.ref]
      .some(v => norm(v || '').includes(kw)));
  }, [timeline, depositEntries, filter, search]);

  const sections = useMemo(() => {
    if (filter === 'DEPOSIT') {
      const unpaid = filtered.filter(e => (e.status || '').toUpperCase() !== 'PAID');
      const paid = filtered.filter(e => (e.status || '').toUpperCase() === 'PAID');
      return [
        { key: 'dep-unpaid', title: 'Chưa thu cọc', sub: `${unpaid.length} khách`, data: unpaid },
        { key: 'dep-paid', title: 'Đã thu cọc', sub: 'Hoàn lại khi khách trả phòng', data: paid },
      ].filter(x => x.data.length > 0);
    }
    const map = new Map<string, Entry[]>();
    for (const e of filtered) {
      const k = (e.at || '').slice(0, 7);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()]
      .sort((a, b) => (b[0] || '').localeCompare(a[0] || ''))
      .map(([key, data]) => {
        const [y, m] = key.split('-');
        // Chỉ cộng khoản manager ĐƯỢC xem (điện, nước, dịch vụ) — tiền nhà bị ẩn.
        const visible = data
          .filter(e => !isAmountHidden(e.invoiceKind) && e.status.toUpperCase() === 'VERIFIED')
          .reduce((sum, e) => sum + (e.amount ?? 0), 0);
        const sorted = data.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
        // Tab Đã thu: gom theo KHÁCH (hợp đồng) — khách trả gần nhất lên đầu.
        let rows: Entry[] = sorted;
        let tenants = 0;
        if (filter === 'all') {
          const byTenant = new Map<string, Entry[]>();
          for (const e of sorted) {
            const tk = e.contractId != null ? `c${e.contractId}` : `${e.propertyName}|${e.roomNumber ?? ''}|${e.tenantName}`;
            byTenant.set(tk, [...(byTenant.get(tk) ?? []), e]);
          }
          tenants = byTenant.size;
          rows = [...byTenant.entries()].map(([tk, list]) => ({
            ...list[0],
            key: `g-${key}-${tk}`,
            children: list,
          }));
        }
        // Tóm tắt theo loại: "🏠 4 · 🤝 3 · 🔧 2" — nhìn tiêu đề là biết tháng đó thu những gì.
        const byKind = new Map<InvoiceKind, number>();
        for (const e of sorted) byKind.set(e.invoiceKind, (byKind.get(e.invoiceKind) ?? 0) + 1);
        const kinds = [...byKind.entries()].map(([k, n]) => `${KIND_SHORT[k].icon} ${n}`).join('  ');
        return {
          key,
          title: m ? `Tháng ${Number(m)}/${y}` : 'Không rõ thời gian',
          sub: filter === 'all'
            ? `${tenants} khách · ${data.length} khoản  ·  ${kinds}`
            : `${data.length} giao dịch`,
          extra: visible > 0 ? `Điện nước & DV: ${formatCurrency(visible)}` : '',
          data: rows,
        };
      });
  }, [filtered, filter]);

  /**
   * THÁNG GẬP LẠI (24/09/2026): mặc định mọi tháng đều gập — chỉ thấy "Tháng 9/2026 ·
   * 10 giao dịch · tổng", bấm mới mở danh sách bên trong. Đang tìm kiếm, tab Chờ duyệt
   * (danh sách việc phải làm) và tab Tiền cọc thì luôn mở — gập ở đó là giấu việc/kết quả.
   */
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const collapsible = filter === 'all' && !search.trim();
  const isOpen = (key: string) => !collapsible || openKeys.has(key);
  const toggle = (key: string) => setOpenKeys(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  // Tháng đang gập thì data rỗng — không dựng dòng nào của tháng đó.
  const visibleSections = sections.map(sec => (isOpen(sec.key) ? sec : { ...sec, data: [] as Entry[] }));

  const counts = useMemo(() => ({
    debtors: debtors.length,
    debtorsOverdue: debtors.filter(d => d.overdue).length,
    txns: timeline.filter(e => e.kind === 'INVOICE').length,
    pending: timeline.filter(e => e.kind === 'INVOICE' && e.status.toUpperCase() === 'PENDING_VERIFY').length,
    deposits: liveDeposits.length,
    depositUnpaid: liveDeposits.filter(d => (d.status || '').toUpperCase() !== 'PAID').length,
  }), [timeline, liveDeposits, debtors]);


  /** Xác nhận / từ chối giao dịch khách báo đã chuyển — làm ngay trong sheet chi tiết. */
  const handleVerify = (e: Entry, approved: boolean) => {
    if (e.paymentId == null) return;
    const doIt = async () => {
      setActing(true);
      try {
        if (approved) await realManagerInvoiceService.verifyPayment(e.paymentId!);
        else await realManagerInvoiceService.rejectPayment(e.paymentId!);
        setSelected(null);
        load();
      } catch (err: any) {
        showAlert('Lỗi', err?.response?.data?.message || err?.message || 'Không xử lý được giao dịch.');
      } finally {
        setActing(false);
      }
    };
    showAlert(
      approved ? 'Xác nhận đã nhận tiền?' : 'Từ chối giao dịch?',
      approved
        ? `Xác nhận đã nhận đủ tiền hoá đơn ${e.ref} từ ${e.tenantName}?`
        : `Từ chối giao dịch ${e.ref} của ${e.tenantName}?`,
      [
        { text: 'Huỷ', style: 'cancel' },
        { text: approved ? 'Xác nhận' : 'Từ chối', style: approved ? 'default' : 'destructive', onPress: doIt },
      ],
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={handleBack}>
          <Text style={s.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Tiền khách thuê</Text>
          {/* Không rao "không hiển thị tiền thuê & tiền cọc" nữa (13/08/2026): nói ra
              chính là chỉ cho manager biết có thứ đang bị giấu, mà chẳng giúp họ làm
              việc gì. Chỗ nào thật sự cần giải thích thì đã có câu trong ô chi tiết. */}
          <Text style={s.subtitle}>Đang nợ · đã thu · tiền cọc</Text>
        </View>
      </View>

      {/* ── Tab ── */}
      <View style={s.segment}>
        {([
          { key: 'DEBT' as const, label: 'Đang nợ', count: counts.debtors, alert: counts.debtorsOverdue > 0 },
          { key: 'all' as const, label: 'Đã thu', count: counts.txns, alert: false },
          { key: 'PENDING_VERIFY' as const, label: 'Chờ duyệt', count: counts.pending, alert: counts.pending > 0 },
          { key: 'DEPOSIT' as const, label: 'Cọc', count: counts.deposits, alert: counts.depositUnpaid > 0 },
        ]).map(t => {
          const on = filter === t.key;
          return (
            <TouchableOpacity key={t.key} style={[s.segBtn, on && s.segBtnOn]} onPress={() => setFilter(t.key)} activeOpacity={0.8}>
              <Text style={[s.segText, on && s.segTextOn]} numberOfLines={1}>{t.label}</Text>
              <View style={[s.segCount, t.alert && s.segCountAlert, on && !t.alert && s.segCountOn]}>
                <Text style={[s.segCountText, (t.alert || on) && { color: Colors.white }]}>{t.count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Tìm kiếm ── */}
      <View style={s.searchBox}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Tìm tên khách, phòng, mã hoá đơn…"
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

      {filter === 'PENDING_VERIFY' && counts.pending > 0 && (
        <Text style={s.hint}>Khách báo đã chuyển khoản — bấm vào từng dòng để kiểm tra và xác nhận.</Text>
      )}

      {filter === 'DEBT' ? (
        loading ? (
          <View style={s.loading}><ActivityIndicator size="large" color={Colors.primary} /></View>
        ) : (
          <ScrollView
            style={s.list}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          >
            {debtors.length > 0 && (
              <Text style={s.hint}>
                {counts.debtors} khách đang nợ{counts.debtorsOverdue > 0 ? ` · ${counts.debtorsOverdue} khách quá hạn` : ''}
                {debtors.some(d => d.canTerminate) ? ` · ${debtors.filter(d => d.canTerminate).length} được chấm dứt HĐ` : ''}
              </Text>
            )}
            {debtors
              .filter(d => !search.trim() || [d.tenantName, d.roomNumber, d.propertyName]
                .some(v => norm(v || '').includes(norm(search.trim()))))
              .map(d => (
                <View key={d.key} style={[s.debtCard, d.overdue && s.debtCardOverdue]}>
                  <TouchableOpacity style={s.debtHead} activeOpacity={0.7} onPress={() => openTenantInvoices(d)}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.debtName} numberOfLines={1}>
                        {d.tenantName}{d.roomNumber ? ` · P.${d.roomNumber}` : ''}
                      </Text>
                      <Text style={s.debtProp} numberOfLines={1}>{d.propertyName}</Text>
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: d.overdue ? Colors.errorLight : Colors.warningLight }]}>
                      <Text style={[s.statusBadgeText, { color: d.overdue ? Colors.error : Colors.warning }]}>
                        {d.overdue
                          ? (d.overdueDays > 0 ? `Quá hạn ${d.overdueDays} ngày` : 'Quá hạn')
                          : d.nextDue ? `Hạn ${dateOnly(d.nextDue)}` : 'Chưa tới hạn'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  {d.lines.map(line => (
                    <TouchableOpacity
                      key={line.kind}
                      style={s.debtLine}
                      activeOpacity={0.7}
                      onPress={() => openTenantInvoices(d, line.firstId)}
                    >
                      <Text style={s.debtLineText} numberOfLines={1}>
                        {KIND_SHORT[line.kind].icon} {KIND_SHORT[line.kind].label} {line.periods}
                      </Text>
                      {line.amount != null && <Text style={s.debtLineAmount}>{formatCurrency(line.amount)}</Text>}
                      <Text style={s.debtChevron}>›</Text>
                    </TouchableOpacity>
                  ))}
                  {d.canTerminate && (
                    <View style={s.debtTerminateBox}>
                      <Text style={s.debtTerminate}>⛔ Nợ quá hạn — được quyền chấm dứt hợp đồng</Text>
                      <TouchableOpacity
                        style={[s.debtTerminateBtn, terminatingKey === d.key && { opacity: 0.5 }]}
                        disabled={terminatingKey === d.key}
                        activeOpacity={0.8}
                        onPress={() => terminateDebtor(d)}
                      >
                        <Text style={s.debtTerminateBtnText}>{terminatingKey === d.key ? 'Đang xử lý…' : 'Chấm dứt HĐ'}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
            {debtors.length === 0 && (
              <View style={s.emptyBox}>
                <Text style={s.emptyEmoji}>✅</Text>
                <Text style={s.emptyText}>Không có khách nào đang nợ.</Text>
              </View>
            )}
          </ScrollView>
        )
      ) : loading ? (
        <View style={s.loading}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <SectionList
          sections={visibleSections}
          keyExtractor={item => item.key}
          stickySectionHeadersEnabled={false}
          style={s.list}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
          }
          renderSectionHeader={({ section }) => {
            const open = isOpen(section.key);
            return (
              <TouchableOpacity
                activeOpacity={collapsible ? 0.7 : 1}
                disabled={!collapsible}
                onPress={() => toggle(section.key)}
                style={[s.groupHead, !open && s.groupHeadClosed]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.groupTitle}>{section.title}</Text>
                  <Text style={s.groupSub} numberOfLines={1}>{section.sub}</Text>
                  {!!(section as { extra?: string }).extra && (
                    <Text style={s.groupExtra}>{(section as { extra?: string }).extra}</Text>
                  )}
                </View>
                {collapsible && <Text style={s.groupChevron}>{open ? '⌃' : '⌄'}</Text>}
              </TouchableOpacity>
            );
          }}
          renderItem={({ item, index }) => (
            <View style={[s.groupBody, index === 0 && s.groupBodyFirst]}>
              {index > 0 && <View style={s.rowDivider} />}
              {item.children
                ? <TenantGroupRow group={item} onPress={setSelected} />
                : <TxnRow entry={item} onPress={setSelected} />}
            </View>
          )}
          renderSectionFooter={({ section }) => (isOpen(section.key) ? <View style={s.groupFoot} /> : null)}
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Text style={s.emptyEmoji}>{search ? '🔍' : filter === 'PENDING_VERIFY' ? '✅' : '💳'}</Text>
              <Text style={s.emptyText}>
                {search
                  ? `Không tìm thấy giao dịch nào khớp "${search.trim()}".`
                  : filter === 'PENDING_VERIFY'
                    ? 'Không có khoản nào chờ xác nhận.'
                    : filter === 'DEPOSIT' ? 'Chưa có tiền cọc nào.' : 'Chưa có giao dịch thanh toán nào.'}
              </Text>
            </View>
          }
        />
      )}

      {/* ── Chi tiết giao dịch ─────────────────────────────────────── */}
      {selected && (() => {
        const e = selected;
        const st = statusOf(e.status);
        const mc = methodOf(e.method);
        const isDeposit = e.kind === 'DEPOSIT';
        const hidden = isDeposit || isAmountHidden(e.invoiceKind);
        const canVerify = !isDeposit && e.status.toUpperCase() === 'PENDING_VERIFY';

        return (
          <Modal transparent animationType="slide" onRequestClose={() => setSelected(null)}>
            <View style={s.modalOverlay}>
              <View style={s.sheet}>
                <ScrollView contentContainerStyle={s.sheetContent} showsVerticalScrollIndicator={false}>
                  <View style={s.modalHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.modalTitle}>
                        {e.tenantName}{e.roomNumber ? ` · ${e.roomNumber}` : ''}
                      </Text>
                      <Text style={s.modalSub}>
                        {isDeposit ? 'Tiền cọc hợp đồng' : KIND_LABEL[e.invoiceKind]}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setSelected(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Text style={s.modalClose}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[s.statusBanner, { backgroundColor: st.bg }]}>
                    <Text style={{ fontSize: 20 }}>{isDeposit ? '🔐' : mc.icon}</Text>
                    <Text style={[s.statusBannerText, { color: st.color }]}>{st.label}</Text>
                  </View>

                  {/* Số tiền chỉ hiện khi manager được xem (điện, nước, dịch vụ). Tiền nhà & cọc
                      thì BỎ HẲN khối này — ghi "Ẩn với quản lý" chỉ nhắc manager là có thứ bị giấu. */}
                  {!hidden && (
                    <View style={s.amountBox}>
                      <Text style={s.amountLabel}>Số tiền giao dịch</Text>
                      <Text style={s.amountValue}>{formatCurrency(e.amount ?? 0)}</Text>
                    </View>
                  )}

                  <View style={s.detailBlock}>
                    <DetailRow label={isDeposit ? 'Mã hợp đồng' : 'Mã hoá đơn'} value={e.ref || '—'} />
                    <DetailRow label="Toà nhà" value={e.propertyName} />
                    {!!e.roomNumber && <DetailRow label="Phòng" value={e.roomNumber} />}
                    <DetailRow label="Khách thuê" value={e.tenantName} />
                    {/* SĐT ẩn với manager (13/08/2026). */}
                    <DetailRow label="Hình thức" value={e.method ? mc.label : 'Chưa thu'} />
                    <DetailRow
                      label={isDeposit ? 'Thời điểm thu cọc' : e.status.toUpperCase() === 'VERIFIED' ? 'Thời điểm xác nhận' : 'Thời điểm khách báo'}
                      value={fullTime(e.at)}
                    />
                    {isDeposit && !!e.moveInDate && <DetailRow label="Ngày nhận nhà" value={dateOnly(e.moveInDate)} />}
                    {isDeposit && !!e.contractStatus && (
                      <DetailRow
                        label="Trạng thái hợp đồng"
                        value={CONTRACT_STATUS_LABEL[e.contractStatus] ?? e.contractStatus}
                      />
                    )}
                    {!!e.note && <DetailRow label="Nội dung chuyển khoản" value={e.note} wrap />}
                  </View>

                  {canVerify && (
                    <View style={s.actionRow}>
                      <TouchableOpacity
                        style={[s.actionBtn, s.rejectBtn]}
                        disabled={acting}
                        onPress={() => handleVerify(e, false)}
                      >
                        <Text style={s.rejectBtnText}>Từ chối</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.actionBtn, s.verifyBtn]}
                        disabled={acting}
                        onPress={() => handleVerify(e, true)}
                      >
                        <Text style={s.verifyBtnText}>{acting ? 'Đang xử lý...' : '✓ Đã nhận tiền'}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>
        );
      })()}
    </SafeAreaView>
  );
};

const DetailRow: React.FC<{ label: string; value: string; wrap?: boolean }> = ({ label, value, wrap }) => (
  <View style={[s.detailRow, wrap && s.detailRowWrap]}>
    <Text style={s.detailLabel}>{label}</Text>
    <Text style={[s.detailVal, wrap && s.detailValWrap]} selectable>{value}</Text>
  </View>
);

const s = StyleSheet.create({
  // ── Làm lại 24/09/2026 ──
  segment: {
    flexDirection: 'row', marginHorizontal: Spacing.base, marginBottom: Spacing.sm,
    backgroundColor: Colors.divider, borderRadius: BorderRadius.full, padding: 3,
  },
  segBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 8, borderRadius: BorderRadius.full,
  },
  segBtnOn: { backgroundColor: Colors.white, ...Shadow.sm },
  segText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  segTextOn: { color: Colors.textPrimary },
  segCount: {
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5,
    backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center',
  },
  segCountOn: { backgroundColor: Colors.primary },
  segCountAlert: { backgroundColor: Colors.error },
  segCountText: { fontSize: 11, fontWeight: '800', color: Colors.textMuted },
  debtCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md,
    marginTop: Spacing.sm, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  debtCardOverdue: { borderLeftWidth: 4, borderLeftColor: Colors.error },
  debtHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 4 },
  debtName: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  debtProp: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  debtLine: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  debtLineText: { flex: 1, fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  debtLineAmount: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  debtChevron: { fontSize: 18, color: Colors.textMuted },
  debtTerminateBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 4,
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.md, padding: 6, paddingLeft: Spacing.sm,
  },
  debtTerminateBtn: { backgroundColor: Colors.error, borderRadius: BorderRadius.md, paddingHorizontal: 10, paddingVertical: 6 },
  debtTerminateBtnText: { color: Colors.white, fontSize: 12, fontWeight: '800' },
  debtTerminate: { flex: 1, fontSize: 12, color: '#991B1B', fontWeight: '600' },
  hint: { fontSize: 12, color: Colors.textSecondary, marginHorizontal: Spacing.base, marginBottom: Spacing.sm },
  groupHead: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginTop: Spacing.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderWidth: 1, borderBottomWidth: 0, borderColor: Colors.border,
    borderTopLeftRadius: BorderRadius.lg, borderTopRightRadius: BorderRadius.lg,
  },
  groupTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  groupSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  groupHeadClosed: { borderBottomWidth: 1, borderRadius: BorderRadius.lg },
  groupChevron: { fontSize: 18, color: Colors.textMuted, width: 20, textAlign: 'center' },
  groupBody: { backgroundColor: Colors.white, borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.border },
  groupBodyFirst: { borderTopWidth: 1, borderTopColor: Colors.divider },
  groupFoot: {
    height: 4, backgroundColor: Colors.white, borderWidth: 1, borderTopWidth: 0, borderColor: Colors.border,
    borderBottomLeftRadius: BorderRadius.lg, borderBottomRightRadius: BorderRadius.lg,
  },
  rowDivider: { height: 1, backgroundColor: Colors.divider, marginLeft: 60 },
  rowDone: { fontSize: 12, fontWeight: '700', color: Colors.success },
  groupExtra: { fontSize: 12, fontWeight: '700', color: Colors.success, marginTop: 2 },
  tg: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.xs },
  tgHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 },
  tgName: { flex: 1, fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  tgCount: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  tgLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 7 },
  tgIcon: { fontSize: 15, width: 24, textAlign: 'center' },
  tgLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  tgMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  tgAmount: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  tgChevron: { fontSize: 16, color: Colors.textMuted },

  safe: { flex: 1, backgroundColor: Colors.background },
  loading: { paddingVertical: Spacing.xl * 2, alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.base,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  backBtnText: { fontSize: 26, lineHeight: 28, color: Colors.primary, fontWeight: '900' },
  title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.base,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary, paddingVertical: 4 },
  searchClear: { fontSize: 15, fontWeight: '800', color: Colors.textMuted, paddingHorizontal: 4 },

  statsRow: {
    flexDirection: 'row', alignItems: 'stretch', gap: Spacing.sm,
    marginHorizontal: Spacing.base, marginTop: Spacing.base,
  },
  stat: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  statDot: { width: 6, height: 6, borderRadius: 3, marginBottom: 4 },
  statNum: { fontSize: 18, fontWeight: '800' },
  statLbl: { fontSize: 10.5, color: Colors.textMuted, marginTop: 2 },

  // ScrollView ngang nằm trong container dọc: phải khoá chiều cao, không thì RN vừa
  // kéo giãn vừa cho SectionList bóp lại làm chip bị cắt mất nửa dưới.
  filterScroll: { flexGrow: 0, flexShrink: 0, height: 34, marginTop: Spacing.base },
  filterRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
  },
  filterChip: {
    height: 32, justifyContent: 'center',
    paddingHorizontal: 14, borderRadius: BorderRadius.full,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  filterChipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  filterChipTextOn: { color: Colors.white },

  list: { flex: 1 },
  listContent: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: 100 },
  monthBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: Spacing.md, marginBottom: Spacing.sm,
  },
  sectionHeader: {
    fontSize: 12, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase',
  },
  monthMeta: { fontSize: 11, color: Colors.textMuted },

  // Mục "Tiền cọc" ghim đầu — nền riêng để không bị đọc nhầm thành một kỳ nữa.
  depositBar: {
    backgroundColor: '#ECFEFF', borderWidth: 1, borderColor: '#A5F3FC',
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
  },
  depositBarTitle: { color: '#0E7490', textTransform: 'none', fontSize: 13 },
  depositBarMeta:  { color: '#0891B2' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.white, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
  },
  rowIcon: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.background,
    alignItems: 'center', justifyContent: 'center',
  },
  rowName: { fontSize: 13.5, fontWeight: '700', color: Colors.textPrimary },
  rowRef: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 3 },
  rowMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  rowRight: { alignItems: 'flex-end', gap: 6, maxWidth: 108 },
  rowAmount: { fontSize: 12.5, fontWeight: '800', color: Colors.textPrimary },
  rowAmountHidden: { color: Colors.textMuted, letterSpacing: 1 },
  statusBadge: { borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4 },
  statusBadgeText: { fontSize: 10.5, fontWeight: '800' },

  emptyBox: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, alignItems: 'center', marginTop: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border,
  },
  emptyEmoji: { fontSize: 36, marginBottom: Spacing.sm },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 19 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    maxHeight: '88%',
  },
  sheetContent: { padding: Spacing.xl, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginBottom: Spacing.base },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  modalSub: { fontSize: 12.5, color: Colors.textSecondary, marginTop: 2 },
  modalClose: { fontSize: 18, color: Colors.textMuted, fontWeight: '700', padding: 2 },

  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md, borderRadius: BorderRadius.lg, marginBottom: Spacing.base,
  },
  statusBannerText: { fontSize: 15, fontWeight: '800' },

  amountBox: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.base,
    borderWidth: 1, borderColor: Colors.border,
  },
  amountLabel: { fontSize: 11.5, color: Colors.textMuted, fontWeight: '700', textTransform: 'uppercase' },
  amountValue: { fontSize: 24, fontWeight: '900', color: Colors.textPrimary, marginTop: 4 },
  amountHidden: { fontSize: 16, fontWeight: '800', color: Colors.textMuted, marginTop: 4 },
  amountNote: { fontSize: 11.5, color: Colors.textSecondary, marginTop: 6, lineHeight: 17 },

  detailBlock: { borderTopWidth: 1, borderColor: Colors.divider },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    gap: Spacing.md, paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderColor: Colors.divider,
  },
  detailRowWrap: { flexDirection: 'column', gap: 4 },
  detailLabel: { fontSize: 13, color: Colors.textSecondary },
  detailVal: { flex: 1, fontSize: 13, fontWeight: '700', color: Colors.textPrimary, textAlign: 'right' },
  detailValWrap: { textAlign: 'left', lineHeight: 19 },

  actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  actionBtn: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center' },
  rejectBtn: { backgroundColor: Colors.errorLight },
  rejectBtnText: { fontSize: 14, fontWeight: '800', color: Colors.error },
  verifyBtn: { backgroundColor: Colors.success },
  verifyBtnText: { fontSize: 14, fontWeight: '800', color: Colors.white },
});
