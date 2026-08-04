import AsyncStorage from '@react-native-async-storage/async-storage';
import { managerPropertyService } from '@/services/manager/propertyService';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';
import { realManagerInvoiceService, RentInvoiceLite } from '@/services/manager/invoiceService';
import { RENT_CYCLE, rentBillingMonth, rentDueDate, daysOverdue, RENT_TERMINATION_AFTER_DAYS } from '@/constants/rentCycle';
import { notifyAutoIssued, processManagerOverdueRent, OverdueRentRow } from '@/services/shared/billingNotifier';

/**
 * PHÁT HÀNH TIỀN PHÒNG TỰ ĐỘNG — manager KHÔNG bấm gửi tay nữa.
 *
 * Đúng ra job này phải chạy ở BE lúc 00:00 ngày 1 (đã ghi rõ trong
 * docs/BE-NEED-rent-auto-cycle-2026-08-04.md). BE chưa có nên app của manager tự chạy:
 * mỗi lần mở app / mở màn Tiền phòng, nếu kỳ này còn hợp đồng ACTIVE chưa có hoá đơn
 * thì tự gọi API phát hành — người quản lý không phải làm gì.
 *
 * An toàn:
 *   • Chỉ tạo cho hợp đồng ACTIVE còn THIẾU hoá đơn của kỳ → chạy lại không tạo trùng.
 *   • Có giãn cách tối thiểu giữa 2 lần chạy để không dội API.
 *   • BE vẫn phải idempotent theo (contractId, billingMonth) — nếu BE tự phát hành
 *     rồi thì FE thấy đã có hoá đơn và bỏ qua.
 */

const LAST_RUN_PREFIX = 'rent_autobill_last_v1:';
/** Giãn cách tối thiểu giữa 2 đợt tự phát hành (trừ khi ép chạy). */
const MIN_GAP_MS = 30 * 60 * 1000;

export interface RentAutoBillingResult {
  month: string;
  /** Số hoá đơn vừa phát hành trong đợt này. */
  issued: number;
  /** Số hợp đồng phát hành lỗi (thường do BE chưa có endpoint rent-invoices). */
  failed: number;
  /** Bỏ qua vì vừa chạy xong. */
  skipped: boolean;
  /** Số hợp đồng đủ điều kiện chấm dứt vì quá hạn. */
  terminable: number;
  error?: string;
}

const EMPTY = (month: string, skipped = false): RentAutoBillingResult =>
  ({ month, issued: 0, failed: 0, skipped, terminable: 0 });

const matchInvoice = (invoices: RentInvoiceLite[], c: TenantContractResponse) =>
  invoices.find(inv =>
    (inv.contractId != null && inv.contractId === c.id) ||
    (inv.roomNumber != null && c.roomNumber != null && inv.roomNumber === c.roomNumber),
  );

/**
 * Chạy một đợt phát hành tự động cho toàn bộ nhà mà manager đang quản lý.
 * `force` = bỏ qua giãn cách (dùng cho nút "Chạy lại ngay" trong màn Tiền phòng).
 */
export async function runRentAutoBilling(
  userId: string,
  opts: { force?: boolean; now?: Date } = {},
): Promise<RentAutoBillingResult> {
  const now = opts.now ?? new Date();
  const month = rentBillingMonth(now);
  const dueDate = rentDueDate(month);
  const lastRunKey = LAST_RUN_PREFIX + userId;

  if (!opts.force) {
    try {
      const raw = await AsyncStorage.getItem(lastRunKey);
      const last = raw ? Number(raw) : 0;
      if (last && now.getTime() - last < MIN_GAP_MS) return EMPTY(month, true);
    } catch { /* đọc lỗi thì cứ chạy */ }
  }

  let issued = 0;
  let failed = 0;
  let error: string | undefined;
  const overdueRows: OverdueRentRow[] = [];

  try {
    const properties = await managerPropertyService.getScopedProperties();

    for (const p of properties) {
      let contracts: TenantContractResponse[] = [];
      let existing: RentInvoiceLite[] = [];
      try {
        [contracts, existing] = await Promise.all([
          realTenantService.listByProperty(p.id),
          realManagerInvoiceService.listRentInvoices(p.id, month).catch(() => [] as RentInvoiceLite[]),
        ]);
      } catch (e: any) {
        error = error ?? (e?.response?.data?.message || e?.message);
        continue;
      }

      const active = contracts.filter(c => (c.status || '').toUpperCase() === 'ACTIVE');

      for (const c of active) {
        const inv = matchInvoice(existing, c);

        // Đã có hoá đơn kỳ này → chỉ kiểm tra quá hạn để báo quản lý.
        if (inv) {
          const st = (inv.status || '').toUpperCase();
          if (st !== 'PAID' && st !== 'CANCELLED'
            && daysOverdue(inv.dueDate || dueDate, now) >= RENT_TERMINATION_AFTER_DAYS) {
            overdueRows.push({
              contractId: c.id,
              tenantName: c.tenantFullName || 'Khách thuê',
              roomNumber: c.roomNumber,
              propertyName: p.propertyName,
              month,
              amount: inv.amount ?? c.rentAmount ?? 0,
              dueDate: inv.dueDate || dueDate,
            });
          }
          continue;
        }

        const amount = c.rentAmount ?? 0;
        if (amount <= 0) continue;                       // chưa chốt giá thì không phát hành

        const body = {
          contractId: c.id,
          billingMonth: month,
          amount,
          dueDate,
          note: `Tự động phát hành theo chu kỳ ngày ${RENT_CYCLE.issueDay}`,
        };
        try {
          if (c.roomId) {
            await realManagerInvoiceService.createRoomRentInvoice(p.id, c.roomId, body);
          } else {
            await realManagerInvoiceService.createPropertyRentInvoice(p.id, body);
          }
          issued += 1;
        } catch (e: any) {
          // 409 = BE báo đã có hoá đơn kỳ này → coi như xong, không tính lỗi.
          if (e?.response?.status === 409) continue;
          failed += 1;
          error = error ?? (e?.response?.data?.message || e?.message || 'Không phát hành được hoá đơn tiền phòng.');
        }
      }
    }
  } catch (e: any) {
    error = error ?? (e?.response?.data?.message || e?.message);
  }

  try {
    await AsyncStorage.setItem(lastRunKey, String(now.getTime()));
  } catch { /* không quan trọng */ }

  // Báo cho manager biết hệ thống vừa làm gì thay mình.
  await notifyAutoIssued(userId, month, issued, now);
  await processManagerOverdueRent(userId, overdueRows, now);

  return { month, issued, failed, skipped: false, terminable: overdueRows.length, error };
}
