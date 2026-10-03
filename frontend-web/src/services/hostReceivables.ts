/**
 * CÔNG NỢ KHÁCH THUÊ CHO CỔNG HOST — một nguồn cho mọi màn đang đếm "khách nợ bao nhiêu".
 *
 * ⚠️ `GET /host/invoices?month=` KHÔNG phải hoá đơn thật: BE
 * (`HostPortalServiceImpl.buildInvoices`) dựng mỗi hợp đồng ACTIVE một dòng tiền nhà, mã
 * `{hợp đồng}-{tháng}`, hạn = CUỐI THÁNG + 5 ngày, trạng thái suy từ `paymentStatus` của hợp
 * đồng. Tiền nhà thật phát hành ngày 1, hạn ngày 5 CÙNG tháng; còn điện, nước, sửa chữa
 * thì nguồn đó không có. 03/10/2026 màn Công nợ ghi "Còn 33 ngày tới hạn" (hạn 05/11) cho
 * hoá đơn tháng 10 hạn thật 05/10, và tổng 69,7tr / 9 dòng lệch biểu đồ tuổi nợ ngay bên
 * trên (46tr / 6 hoá đơn thật).
 *
 * Nên: đọc hoá đơn thật (`/manager/invoices` — owner đã được mở quyền đọc) khi dò được
 * quyền, chỉ lùi về nguồn dựng sẵn khi không có cách nào khác.
 */
import { adminService, type AdminInvoiceRow, type AdminInvoiceType } from './admin.service';
import { hostService, type InvoiceDto } from './host.service';
import { canUseFullInvoices } from './invoiceAccess';

/** Dòng công nợ — `kind` ("Tiền nước T09/2026") chỉ có khi lấy từ hoá đơn thật. */
export type ReceivableRow = InvoiceDto & { kind?: string };

const KIND_LABEL: Partial<Record<AdminInvoiceType, string>> = {
  RENT: 'Tiền nhà', ELECTRICITY: 'Tiền điện', WATER: 'Tiền nước',
  SERVICE: 'Phí dịch vụ', MAINTENANCE: 'Phí sửa chữa', OTHER: 'Khoản khác',
};

/**
 * Hoá đơn thật → dòng công nợ.
 *
 * Bỏ `HD-ONBOARD-*`: vỏ bọc gộp cọc + tiền nhà kỳ đầu, phần tiền nhà đã nằm ở `HD-RENT-*`
 * — cộng cả hai là tính trùng (xem `AdminInvoiceRow.isOnboardEnvelope`). Bỏ hoá đơn đã huỷ.
 * Hoá đơn đã thu chỉ giữ những khoản THU TRONG THÁNG `month`, để ô "Đã thu trong kỳ" không
 * cộng dồn cả năm. Hoá đơn CHƯA thu thì giữ mọi kỳ — nợ tháng trước vẫn là nợ.
 */
const fromRealInvoice = (r: AdminInvoiceRow, month: string): ReceivableRow | null => {
  if (r.isOnboardEnvelope || r.status === 'CANCELLED' || !r.dueDate) return null;
  if (r.status === 'PAID' && (r.paidAt ?? '').slice(0, 7) !== month) return null;
  const room = r.roomNumber && r.roomNumber !== 'NGUYEN_CAN' && r.roomNumber !== r.propertyName
    ? r.roomNumber : 'NGUYEN_CAN';
  const type = r.code.toUpperCase().startsWith('HD-MAINT') ? 'MAINTENANCE' : r.type;
  const period = r.month && r.year ? ` T${String(r.month).padStart(2, '0')}/${r.year}` : '';
  return {
    id: r.code,
    tenantName: r.tenantName,
    roomCode: room,
    propertyName: r.propertyName,
    amount: r.amount,
    dueDate: r.dueDate,
    status: r.status === 'PAID' ? 'PAID' : r.status === 'OVERDUE' ? 'OVERDUE' : 'UNPAID',
    kind: `${KIND_LABEL[type] ?? 'Hoá đơn'}${period}`,
  };
};

export interface HostReceivables {
  rows: ReceivableRow[];
  /** `true` = hoá đơn thật mọi kỳ; `false` = nguồn dựng sẵn của đúng một kỳ. */
  full: boolean;
}

/** `month` dạng `yyyy-MM` — kỳ để tính "đã thu trong kỳ" (và kỳ của nguồn lùi). */
export const loadHostReceivables = async (month: string): Promise<HostReceivables> => {
  if (await canUseFullInvoices()) {
    const list = await adminService.listInvoices({});
    return {
      rows: list.map((r) => fromRealInvoice(r, month)).filter((r): r is ReceivableRow => !!r),
      full: true,
    };
  }
  const page = await hostService.getInvoices({ month, size: 500 });
  return { rows: page?.content ?? [], full: false };
};
