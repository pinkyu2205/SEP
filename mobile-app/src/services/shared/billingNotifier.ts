import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TenantInvoice } from '@/services/tenant/billingService';
import {
  RENT_CYCLE, RENT_TERMINATION_AFTER_DAYS,
  rentNoticeStageOf, rentNoticeMonth, rentBillingMonth, rentDueDate,
  monthLabel, dayLabel, daysOverdue, RentNoticeStage,
} from '@/constants/rentCycle';
import { formatCurrency } from '@/utils/helpers';
import { pushLocalNotification } from '@/services/core/localPush';
import { localAlertStore, LocalAlert } from '@/store/localAlertStore';

/**
 * THÔNG BÁO HOÁ ĐƠN — tiền phòng tự động + điện/nước manager vừa gửi.
 *
 * Khách thuê nhận:
 *   • Hoá đơn MỚI vừa được phát hành (tiền phòng tự động, hoặc điện/nước do quản lý
 *     chốt số rồi gửi) → báo ngay lên thanh thông báo điện thoại + trong app.
 *   • Nhắc đóng tiền phòng theo lịch: ngày 28 → 1 → 2,3,4 → 5 → 7
 *     (xem chính sách trong @/constants/rentCycle).
 * Quản lý nhận:
 *   • Hoá đơn tiền phòng quá hạn tới mức được quyền chấm dứt hợp đồng (từ ngày 8).
 *
 * Cách chạy: app định kỳ tải hoá đơn của tài khoản đang đăng nhập (useBillingWatcher),
 * so với danh sách đã báo trước đó rồi tự bắn thông báo. BE chưa làm cron nhắc nợ nên
 * đây là bản tạm của FE — xem docs/BE-NEED-rent-auto-cycle-2026-08-04.md.
 */

const SEEN_PREFIX = 'billing_seen_v1:';
const MAX_KEYS = 300;

/** Các "sự kiện đã báo" — mã hoá dạng chuỗi để không báo trùng. */
let firedKeys: string[] = [];
let firedSet = new Set<string>();
let seenKey: string | null = null;
/** Lần đầu chạy trên tài khoản này → không dội thông báo về hoá đơn cũ. */
let isFresh = true;

const persist = async () => {
  if (!seenKey) return;
  try {
    await AsyncStorage.setItem(seenKey, JSON.stringify(firedKeys.slice(0, MAX_KEYS)));
  } catch { /* lỗi storage không được làm hỏng luồng nghiệp vụ */ }
};

const remember = (key: string) => {
  if (firedSet.has(key)) return;
  firedSet.add(key);
  firedKeys = [key, ...firedKeys].slice(0, MAX_KEYS);
};

export const loadBillingSnapshot = async (userId: string): Promise<void> => {
  const key = SEEN_PREFIX + userId;
  if (seenKey === key) return;
  seenKey = key;
  try {
    const raw = await AsyncStorage.getItem(key);
    const stored = raw ? (JSON.parse(raw) as string[]) : [];
    firedKeys = [...firedKeys, ...stored].slice(0, MAX_KEYS);
    firedSet = new Set(firedKeys);
    isFresh = !raw;
  } catch {
    firedKeys = [];
    firedSet = new Set();
    isFresh = true;
  }
};

/** Đăng xuất: quên hết để tài khoản sau không bị báo nhầm. */
export const resetBillingSnapshot = (): void => {
  firedKeys = [];
  firedSet = new Set();
  seenKey = null;
  isFresh = true;
};

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKeyOf = (inv: TenantInvoice) => `${inv.year}-${pad(inv.month)}`;
const isUnpaid = (inv: TenantInvoice) =>
  !['PAID', 'CANCELLED'].includes((inv.status || '').toUpperCase());

// ===================== NỘI DUNG THÔNG BÁO =====================

interface Draft { title: string; body: string; screen: string; params?: Record<string, any> }

const TYPE_LABEL: Record<string, { icon: string; name: string }> = {
  RENT: { icon: '🏠', name: 'tiền phòng' },
  ELECTRICITY: { icon: '⚡', name: 'tiền điện' },
  WATER: { icon: '💧', name: 'tiền nước' },
  SERVICE: { icon: '🧹', name: 'phí dịch vụ' },
  MAINTENANCE: { icon: '🔧', name: 'phí bảo trì' },
  OTHER: { icon: '🧾', name: 'hoá đơn' },
};

const placeOf = (inv: TenantInvoice) =>
  inv.roomNumber ? `Phòng ${inv.roomNumber}` : (inv.propertyName || 'Nhà bạn đang thuê');

/** Hoá đơn vừa được phát hành (tiền phòng tự động hoặc điện/nước quản lý gửi). */
const draftNewInvoice = (inv: TenantInvoice): Draft => {
  const t = TYPE_LABEL[(inv.type || 'OTHER').toUpperCase()] ?? TYPE_LABEL.OTHER;
  const period = inv.billingPeriod || `tháng ${pad(inv.month)}/${inv.year}`;
  const amount = formatCurrency(inv.grandTotal ?? inv.totalAmount ?? 0);
  const isRent = (inv.type || '').toUpperCase() === 'RENT';

  return {
    title: `${t.icon} Hoá đơn ${t.name} ${period}`,
    body: isRent
      ? `${placeOf(inv)} — ${amount}. Hệ thống vừa phát hành, hạn thanh toán ${dayLabel(inv.dueDate)}. Mở app để thanh toán.`
      : `${placeOf(inv)} — ${amount}. Quản lý vừa gửi hoá đơn, hạn thanh toán ${dayLabel(inv.dueDate)}. Mở app để xem chi tiết và thanh toán.`,
    screen: 'InvoiceList',
  };
};

/** Nhắc đóng tiền phòng theo lịch 28 · 1 · 2–4 · 5 · 7. */
const draftRentNotice = (
  stage: RentNoticeStage,
  ctx: { month: string; amount?: number; rent?: TenantInvoice; now: Date },
): Draft => {
  const period = monthLabel(ctx.month).toLowerCase();            // "tháng 08/2026"
  const due = dayLabel(ctx.rent?.dueDate || rentDueDate(ctx.month));
  const amount = ctx.amount != null ? formatCurrency(ctx.amount) : null;
  const amountPart = amount ? ` ${amount}` : '';
  const daysLeft = RENT_CYCLE.dueDay - ctx.now.getDate();
  const over = daysOverdue(ctx.rent?.dueDate || rentDueDate(ctx.month), ctx.now);

  switch (stage) {
    case 'PRE_NOTICE':
      return {
        title: '🔔 Nhắc trước: ngày 1 tới hạn đóng tiền phòng',
        body: `Tiền phòng ${period}${amountPart} sẽ được phát hành vào ngày ${RENT_CYCLE.issueDay}, `
          + `hạn thanh toán chậm nhất ngày ${RENT_CYCLE.dueDay}. Bạn chuẩn bị trước giúp nhé.`,
        screen: 'InvoiceList',
      };
    case 'ISSUED':
      return {
        title: '🧾 Hoá đơn tiền phòng đã có — cần thanh toán',
        body: `Tiền phòng ${period}${amountPart} vừa được phát hành. Hạn thanh toán ${due}. `
          + 'Mở app để thanh toán ngay, tránh để quá hạn.',
        screen: 'InvoiceList',
      };
    case 'DUE_SOON':
      return {
        title: `⏰ Còn ${daysLeft} ngày tới hạn đóng tiền phòng`,
        body: `Tiền phòng ${period}${amountPart} chưa được thanh toán. Hạn cuối là ${due}. `
          + 'Thanh toán sớm để không bị ghi nhận quá hạn.',
        screen: 'InvoiceList',
      };
    case 'DUE_TODAY':
      return {
        title: '⚠️ Hôm nay là hạn cuối đóng tiền phòng',
        body: `Tiền phòng ${period}${amountPart} đến hạn hôm nay (${due}). `
          + 'Vui lòng thanh toán trong hôm nay; sau hôm nay hoá đơn sẽ bị ghi nhận quá hạn.',
        screen: 'InvoiceList',
      };
    case 'FINAL_WARNING':
      return {
        title: '🚨 Nhắc lần cuối: tiền phòng chưa thanh toán',
        body: `Tiền phòng ${period}${amountPart} đã quá hạn ${over} ngày. Vui lòng thanh toán ngay hôm nay. `
          + `Sau hôm nay, quản lý có quyền chấm dứt hợp đồng thuê do không thanh toán đúng hạn.`,
        screen: 'InvoiceList',
      };
  }
};

// ===================== TENANT =====================

/**
 * Xử lý hoá đơn của khách thuê: báo hoá đơn mới + nhắc tiền phòng theo lịch.
 * Trả về các thông báo mới sinh.
 */
export const processTenantBilling = async (
  userId: string,
  invoices: TenantInvoice[],
  now: Date = new Date(),
): Promise<LocalAlert[]> => {
  await loadBillingSnapshot(userId);
  const drafts: LocalAlert[] = [];
  const nowIso = now.toISOString();
  const firstRun = isFresh;

  // ── 1. Hoá đơn mới phát hành (mọi loại: tiền phòng, điện, nước, dịch vụ...) ──
  /** Kỳ tiền phòng vừa báo "hoá đơn mới" — để ngày 1 không báo 2 lần cùng nội dung. */
  const justAnnouncedRent = new Set<string>();
  for (const inv of invoices) {
    const key = `inv:${inv.id}`;
    if (firedSet.has(key)) continue;
    remember(key);
    // Lần đầu cài/đăng nhập: chỉ ghi nhận, không dội thông báo về hoá đơn cũ.
    if (firstRun || !isUnpaid(inv)) continue;
    if ((inv.type || '').toUpperCase() === 'RENT') justAnnouncedRent.add(monthKeyOf(inv));
    const d = draftNewInvoice(inv);
    drafts.push({
      id: `billing:new:${inv.id}`,
      kind: 'billing',
      refId: inv.id,
      title: d.title, body: d.body, screen: d.screen, params: d.params,
      createdAt: nowIso, read: false,
    });
  }

  // ── 2. Nhắc tiền phòng theo lịch (mỗi mốc tối đa 1 lần/ngày) ──
  const stage = rentNoticeStageOf(now);
  if (stage && invoices.length > 0) {
    const noticeKey = `rent:${dateKey(now)}:${stage}`;
    if (!firedSet.has(noticeKey)) {
      const month = rentNoticeMonth(now);
      const rents = invoices.filter(i => (i.type || '').toUpperCase() === 'RENT');
      // Hoá đơn tiền phòng của kỳ đang nhắc (ngày 28 nhắc trước cho kỳ sau nên chưa có).
      const rentOfMonth = rents.find(i => monthKeyOf(i) === month);
      // Số tiền hiển thị: hoá đơn kỳ này, không có thì lấy kỳ gần nhất làm ước lượng.
      const lastRent = rents.sort((a, b) => monthKeyOf(b).localeCompare(monthKeyOf(a)))[0];
      const amount = rentOfMonth?.grandTotal ?? lastRent?.grandTotal;

      // Ngày 1: vừa báo "hoá đơn mới" ở trên rồi thì thôi, không nhắc lại y hệt.
      // Vẫn ghi nhận mốc đã dùng để vòng kiểm tra sau trong ngày không bắn bù.
      const alreadyAnnounced = stage === 'ISSUED' && justAnnouncedRent.has(month);
      if (alreadyAnnounced) remember(noticeKey);

      const shouldNotify = !alreadyAnnounced && (stage === 'PRE_NOTICE'
        ? rents.length > 0                                  // có thuê nhà thì mới nhắc
        : !!rentOfMonth && isUnpaid(rentOfMonth));          // đã trả rồi thì thôi

      if (shouldNotify) {
        remember(noticeKey);
        const d = draftRentNotice(stage, { month, amount, rent: rentOfMonth, now });
        drafts.push({
          id: `billing:${noticeKey}`,
          kind: 'billing',
          refId: rentOfMonth?.id,
          title: d.title, body: d.body, screen: d.screen, params: d.params,
          createdAt: nowIso, read: false,
        });
      }
    }
  }

  isFresh = false;
  await persist();
  return dispatch(drafts);
};

// ===================== MANAGER =====================

export interface OverdueRentRow {
  contractId: number;
  tenantName: string;
  roomNumber?: string | null;
  propertyName?: string;
  month: string;            // "YYYY-MM"
  amount: number;
  dueDate: string;
}

/**
 * Báo quản lý các hợp đồng quá hạn tiền phòng tới mức ĐƯỢC QUYỀN chấm dứt (từ ngày 8).
 * Mỗi hợp đồng × kỳ chỉ báo 1 lần.
 */
export const processManagerOverdueRent = async (
  userId: string,
  rows: OverdueRentRow[],
  now: Date = new Date(),
): Promise<LocalAlert[]> => {
  await loadBillingSnapshot(userId);
  const drafts: LocalAlert[] = [];
  const nowIso = now.toISOString();

  for (const r of rows) {
    const over = daysOverdue(r.dueDate, now);
    if (over < RENT_TERMINATION_AFTER_DAYS) continue;
    const key = `rent-term:${r.contractId}:${r.month}`;
    if (firedSet.has(key)) continue;
    remember(key);
    const place = r.roomNumber ? `Phòng ${r.roomNumber}` : (r.propertyName || 'Nhà nguyên căn');
    drafts.push({
      id: `billing:${key}`,
      kind: 'billing',
      refId: r.contractId,
      title: '⛔ Quá hạn tiền phòng — được quyền chấm dứt hợp đồng',
      body: `${r.tenantName} · ${place} chưa thanh toán tiền phòng ${monthLabel(r.month).toLowerCase()} `
        + `(${formatCurrency(r.amount)}), đã quá hạn ${over} ngày và đã được nhắc lần cuối ngày ${RENT_CYCLE.finalReminderDay}. `
        + 'Mở màn Tiền phòng tự động để xử lý.',
      screen: 'RentInvoice',
      createdAt: nowIso, read: false,
    });
  }

  await persist();
  return dispatch(drafts);
};

/** Báo quản lý kết quả đợt tự phát hành (chạy bởi services/manager/rentAutoBilling). */
export const notifyAutoIssued = async (
  userId: string,
  month: string,
  count: number,
  now: Date = new Date(),
): Promise<LocalAlert[]> => {
  if (count <= 0) return [];
  await loadBillingSnapshot(userId);
  const key = `auto-issue:${month}:${dateKey(now)}`;
  if (firedSet.has(key)) return [];
  remember(key);
  await persist();
  return dispatch([{
    id: `billing:${key}`,
    kind: 'billing',
    title: '🤖 Đã tự phát hành hoá đơn tiền phòng',
    body: `${count} hoá đơn tiền phòng ${monthLabel(month).toLowerCase()} vừa được hệ thống phát hành `
      + `và gửi tới khách thuê. Hạn thanh toán ngày ${RENT_CYCLE.dueDay}.`,
    screen: 'RentInvoice',
    createdAt: now.toISOString(),
    read: false,
  }]);
};

// ===================== GỬI ĐI =====================

/** Lưu vào trung tâm thông báo + bắn lên thanh thông báo máy. */
const dispatch = async (drafts: LocalAlert[]): Promise<LocalAlert[]> => {
  if (drafts.length === 0) return [];
  const fresh = localAlertStore.add(drafts);
  for (const a of fresh) {
    await pushLocalNotification({
      title: a.title,
      body: a.body,
      data: { screen: a.screen, params: a.params, type: 'new_bill' },
    });
  }
  return fresh;
};
