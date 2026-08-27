import type { SharedBill } from '@/types/bill';

/**
 * CÁC KHOẢN THẬT SỰ THU trong hoá đơn lúc nhận phòng (`HD-ONBOARD-*`).
 *
 * Khi đón khách, khách chỉ trả ĐÚNG HAI khoản: tiền cọc và tiền nhà chu kỳ đầu (chia
 * theo số ngày ở từ ngày nhận phòng đến hết tháng). Hàm này là nguồn duy nhất dựng ra
 * hai dòng đó, để Trang chủ và màn chi tiết hoá đơn không nói hai kiểu.
 *
 * ─── Vì sao không lấy thẳng dữ liệu BE ───────────────────────────────────────
 * • `invoice.items`: BE đang trả dòng tiền nhà là NGUYÊN THÁNG (5.000.000) trong khi
 *   thực thu là phần chia theo ngày (3.064.516) — cộng lại không ra tổng.
 * • `paymentBreakdown.lines`: đúng số nhưng là các dòng GIẢI THÍCH CÔNG THỨC, trộn lẫn
 *   đầu vào với thành phần thu. Trong đó có "Giá thuê / tháng" và "Tổng đã thu" — bày
 *   hết lên thẻ thì khách cộng nhẩm ra 13 triệu trong khi chỉ chuyển 8 triệu.
 *
 * ─── Cách làm ────────────────────────────────────────────────────────────────
 * Dựng từ hai con số CHẮC CHẮN thay vì lọc theo tên khoá (tên khoá do BE đặt, đổi lúc
 * nào không báo):
 *     tiền cọc          = paymentBreakdown.depositAmount
 *     tiền nhà kỳ đầu   = tổng hoá đơn − tiền cọc
 * Nhờ vậy hai dòng LUÔN cộng đúng bằng con số lớn hiển thị bên cạnh, kể cả khi BE đổi
 * cách chia hay làm tròn.
 *
 * Trả `null` khi không đủ dữ liệu tin cậy — chỗ gọi phải có đường lui (câu mô tả chung),
 * đừng bịa ra con số.
 */
export interface OnboardChargeLine {
  label: string;
  amount: number;
}

/**
 * Hoá đơn này có phải khoản thu lúc nhận phòng không — nhận diện theo MÃ.
 *
 * Không đi theo `type`: BE đổi nó từ `RENT` sang `OTHER` ngày 10/08/2026 nên hoá đơn cũ
 * và mới rơi vào hai nhánh khác nhau, mà `OTHER` còn dùng cho khoản khác. Mã
 * `HD-ONBOARD-{contractId}` thì cả hai đời đều giống nhau.
 */
export const isOnboardBillCode = (code?: string): boolean =>
  !!code && code.startsWith('HD-ONBOARD-');

// Trước 13/08/2026 ở đây có `withoutRentReferenceLine()` để lọc dòng "Giá thuê / tháng"
// khỏi khối "Cách tính" của hoá đơn onboard — dòng đó không phải khoản thu mà lại đứng
// cạnh "Tiền cọc" cùng số 5.000.000, khách tưởng bị tính hai lần.
// BE đã bỏ dòng đó khỏi `paymentBreakdown.lines` của onboard (commit 898f96c,
// PaymentBreakdownBuilder.fromOnboardInvoice), nên FE không phải lọc nữa.
// Hoá đơn tiền phòng thường / FIRST VẪN có dòng này và VẪN cần nó để hiểu công thức
// chia theo ngày — đừng dựng lại bộ lọc rồi áp nhầm sang đó.

export const onboardChargeLines = (
  bill: Pick<SharedBill, 'grandTotal' | 'paymentBreakdown'> | null | undefined,
): OnboardChargeLine[] | null => {
  if (!bill) return null;

  const deposit = Number(bill.paymentBreakdown?.depositAmount);
  // Dùng chính con số đang hiển thị làm tổng, để các dòng luôn cộng khớp với nó.
  const total = Number(bill.grandTotal);
  if (!Number.isFinite(deposit) || deposit <= 0) return null;
  if (!Number.isFinite(total) || total <= deposit) return null;

  const months = Number(bill.paymentBreakdown?.depositMonths);
  const depositLabel = Number.isFinite(months) && months > 0
    ? `Tiền cọc (${months} tháng)`
    : 'Tiền cọc';

  return [
    { label: depositLabel, amount: deposit },
    { label: 'Tiền nhà chu kỳ đầu', amount: total - deposit },
  ];
};
