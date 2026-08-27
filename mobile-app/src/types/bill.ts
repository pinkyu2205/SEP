import type { PaymentBreakdown } from '@/services/tenant/tenantService';
import type { InvoiceDispute } from '@/types/invoiceDispute';


/**
 * Hoá đơn dùng chung cho màn khách thuê và màn quản lý.
 *
 * Trước 15/08/2026 file này là `store/billsStore.ts`: ngoài kiểu, nó còn chứa ~360 dòng
 * hoá đơn SEED (Nguyễn Văn A, "Nhà trọ Quận 5", Công ty An Phú...) nạp sẵn vào một
 * store in-memory, kèm hook `useBills`. Không màn nào còn đọc store đó — mọi màn hoá đơn
 * đã chuyển sang `services/tenant/billingService.ts` / `services/manager/invoiceService.ts`,
 * và nơi duy nhất còn ghi vào (BuildingUtilityScreen) là màn mock đã bị xoá.
 * Giữ lại đúng phần kiểu và chuyển sang `types/`.
 */

export type BillStatus = 'pending' | 'paid' | 'overdue' | 'partial' | 'cancelled';
export type BillPaymentMethod = 'qr' | 'bank_transfer' | 'cash' | 'ewallet' | 'other';

/**
 * `deposit` = khoản thu lúc nhận phòng (`HD-ONBOARD-*`) — GỘP tiền cọc + tiền nhà chu kỳ
 * đầu, khách quét QR trả một lần (BE 609de59/276b613, 12/08/2026).
 *
 * Vẫn tách khỏi `rent` vì đây không phải hoá đơn tiền phòng hằng tháng: nó phát sinh
 * đúng một lần lúc đón khách và luôn ở trạng thái PAID. Nhãn hiển thị nên nói rõ là
 * khoản gộp, đừng để mỗi chữ "Tiền cọc" — khách sẽ tưởng chưa trả tiền nhà.
 */
export type InvoiceType = 'rent' | 'electricity' | 'water' | 'maintenance' | 'deposit';

export interface BillItem {
  label: string;
  amount: number;
}

export interface SharedBill {
  id: string;
  code: string;
  invoiceType: InvoiceType;
  propertyType?: 'MULTI_ROOM' | 'WHOLE_HOUSE';
  roomId: string;
  roomName: string;
  propertyId: string;
  propertyName: string;
  tenantId: string;
  tenantName: string;
  tenantPhone: string;
  month: number;
  year: number;
  items: BillItem[];
  totalAmount: number;
  lateFee: number;
  grandTotal: number;
  status: BillStatus;
  dueDate: string;
  createdAt: string;
  /** FIRST | REGULAR | LAST do BE gắn — chỉ để đọc, FE không còn nhánh riêng cho FIRST. */
  cycleType?: string;
  /**
   * Cách tính do BE dựng sẵn (công thức + các dòng đã format). Chỉ hoá đơn mới có;
   * hoá đơn cũ để trống — nơi hiển thị phải chịu được `undefined`.
   */
  paymentBreakdown?: PaymentBreakdown;
  paidAt?: string;
  paidAmount?: number;
  paymentMethod?: BillPaymentMethod;
  transactionId?: string;
  daysOverdue?: number;
  // Riêng hoá đơn điện
  kwhUsed?: number;
  electricityRate?: number;
  // Riêng hoá đơn nước
  m3Used?: number;
  waterRate?: number;
  // Kỳ tính (hoá đơn điện/nước)
  billingPeriod?: string;
  // ── Bằng chứng chỉ số (điện/nước) ─────────────────────────────────────────
  // BE đã bắt buộc có ảnh công tơ mới cho phát hành hoá đơn (422 METER_PHOTO_REQUIRED),
  // nên dữ liệu này CHẮC CHẮN tồn tại — trước 24/08/2026 chỉ là chưa trả về cho khách.
  // Thiếu nó thì khách chỉ thấy con số cuối cùng và không có gì để đối chiếu.
  /** Chỉ số đầu kỳ. */
  prevReading?: number;
  /** Chỉ số cuối kỳ — `newReading - prevReading` phải bằng kwhUsed/m3Used. */
  newReading?: number;
  /**
   * Ảnh bằng chứng chính của hoá đơn này:
   *   • nhà chia phòng → ảnh MẶT ĐỒNG HỒ phòng đó do quản lý chụp;
   *   • nhà nguyên căn → ảnh HOÁ ĐƠN EVN/nước gốc admin tải lên
   *     (xem `meterImageUrl` trong frontend-web/src/services/utilityInvoice.service.ts).
   * Nhãn hiển thị phải đổi theo `propertyType`, đừng gọi chung là "ảnh đồng hồ".
   */
  meterImageUrl?: string;
  /** Thời điểm chụp thật — khách đối chiếu xem ảnh có đúng kỳ này không. */
  meterCapturedAt?: string;
  /**
   * Ảnh hoá đơn EVN/nước TỔNG của cả căn, chỉ có nghĩa với nhà CHIA PHÒNG: khách xem
   * để kiểm đơn giá (tổng tiền ÷ tổng kWh) mà tiền phòng mình được nhân với.
   * Nguyên căn không dùng field này — ảnh tổng chính là `meterImageUrl`.
   */
  utilityBillImageUrl?: string;
  /** Địa chỉ in trên hoá đơn gốc — chỗ khách soi "có phải nhà mình không". */
  billingAddress?: string;
  /** Mã khách hàng EVN/cấp nước in trên hoá đơn gốc. */
  customerCode?: string;

  /** Khiếu nại đang treo / đã kết luận của hoá đơn này. Xem @/types/invoiceDispute. */
  dispute?: InvoiceDispute;

  // PayOS (30/07/2026) — có sau khi gọi payInvoice(), dùng để hiện QR/mở trang thanh toán thật.
  payosOrderCode?: number;
  payosCheckoutUrl?: string;
  payosQrCode?: string;
}
