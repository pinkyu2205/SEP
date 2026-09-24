import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useBillingRealtime } from '@/hooks/useBillingRealtime';
import { ArrowRight, CreditCard, Lock, PiggyBank } from 'lucide-react';
import {
  adminService, type AdminInvoiceRow, type AdminInvoiceStatus, type AdminPaymentRow,
} from '@/services/admin.service';
import { hostService } from '@/services/host.service';
import { canUseFullInvoices } from '@/services/invoiceAccess';
import { InvoiceBoard, type InvoiceBoardRow } from '@/components/billing/InvoiceBoard';
import { currentMonth, monthLabel, shiftMonth, useServerPeriod } from '../shared';

// ══════════════════════════════════════════════════════════════════════════════
// Hoá đơn & Thanh toán (Host). Giao diện dùng chung với admin: `components/billing/InvoiceBoard`
// (làm lại 24/09/2026 — trước là hai file chép tay đã lệch nhau).
//
// Nguồn dữ liệu phụ thuộc quyền BE; trang tự dò (`canUseFullInvoices`):
//  A. ĐẦY ĐỦ  — `GET /api/v1/manager/invoices` + `/api/v1/manager/payments` (hoá đơn thật).
//  B. RÚT GỌN — `GET /api/v1/host/invoices?month=` (fallback khi A trả 403): hoá đơn tiền
//     phòng suy từ hợp đồng của đúng 1 kỳ, không có mã thật / điện nước / giao dịch.
// Kiểm tra 03/10/2026: host ĐỌC ĐƯỢC nguồn A; giữ B làm phương án lùi.
// ══════════════════════════════════════════════════════════════════════════════

const fromAdminRow = (r: AdminInvoiceRow): InvoiceBoardRow => ({ ...r, key: String(r.id) });

/** 12 kỳ gần nhất — hàm chứ không phải hằng, vì `currentMonth()` cần giờ server. */
const periodOptions = () => Array.from({ length: 12 }, (_, i) => shiftMonth(currentMonth(), -i));

export const BillingPayments = () => {
  const [fullAccess, setFullAccess] = useState<boolean | null>(null);
  const [rows, setRows] = useState<InvoiceBoardRow[]>([]);
  const [payments, setPayments] = useState<AdminPaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Mặc định kỳ hiện tại (giờ server) — số liệu đầu trang trả lời "tháng này thu được bao nhiêu".
  const [period, setPeriod] = useServerPeriod();

  const load = useCallback(async () => {
    setLoading(true);
    const canUseReal = await canUseFullInvoices();
    setFullAccess(canUseReal);

    if (canUseReal) {
      const [real, claims] = await Promise.all([
        adminService.listInvoicesForCollection(period || undefined).catch(() => [] as AdminInvoiceRow[]),
        adminService.listPayments().catch(() => [] as AdminPaymentRow[]),
      ]);
      setRows(real.map(fromAdminRow));
      setPayments(claims);
      setLoading(false);
      return;
    }
    setPayments([]);
    const ym = period || currentMonth();
    const page0 = await hostService.getInvoices({ month: ym, size: 500 }).catch(() => null);
    const [y, m] = ym.split('-').map(Number);
    setRows((page0?.content ?? []).map(i => ({
      key: i.id,
      code: i.id,
      type: 'RENT' as const,
      propertyName: i.propertyName,
      roomNumber: i.roomCode,
      tenantName: i.tenantName?.trim() || '(chưa có tên khách)',
      month: m,
      year: y,
      periodLabel: `Tiền nhà ${monthLabel(ym).toLowerCase()}`,
      amount: i.amount,
      // BE host trả UNPAID; quy về PENDING cho khớp enum hoá đơn thật.
      status: (i.status === 'UNPAID' ? 'PENDING' : i.status) as AdminInvoiceStatus,
      dueDate: i.dueDate,
    })));
    setLoading(false);
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const { connected: liveOn } = useBillingRealtime({
    onRefresh: load,
    onEvent: (event) => {
      if (event.event !== 'INVOICE_PAID') return;
      const who = [event.tenantName, event.roomNumber].filter(Boolean).join(' · ');
      toast.success(who ? `Vừa thanh toán: ${who}` : 'Có hoá đơn vừa được thanh toán');
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 rounded-xl bg-indigo-50 p-2.5"><CreditCard className="h-5 w-5 text-indigo-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hoá đơn & Thanh toán</h1>
          <p className="mt-1 text-sm text-slate-500">
            Mọi khoản thu của khách thuê: tiền nhà, điện, nước, dịch vụ, phí sửa chữa. Bấm một dòng để xem chi tiết.
          </p>
        </div>
      </div>

      <InvoiceBoard
        rows={rows}
        payments={payments}
        loading={loading}
        liveOn={liveOn}
        onReload={load}
        period={period}
        onPeriodChange={setPeriod}
        periods={periodOptions()}
        // Chế độ rút gọn: BE host bắt buộc đúng 1 kỳ nên không có "tất cả".
        allowAllPeriods={fullAccess !== false}
        canOpenDetail={fullAccess !== false}
        maintenancePath="/host/maintenance"
        exportName="HoaDonThanhToan_HoangBinhLand"
        notice={fullAccess === false && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 rounded-lg bg-amber-100 p-2"><Lock className="h-5 w-5 text-amber-600" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-amber-800">Đang xem bản rút gọn — chỉ có hoá đơn tiền nhà của một kỳ</p>
                <p className="mt-0.5 text-xs text-amber-700">
                  Máy chủ chưa cho tài khoản chủ nhà đọc bảng hoá đơn đầy đủ, nên màn này tạm dựng tiền nhà từ hợp đồng
                  đang hiệu lực: chưa có điện / nước / dịch vụ / phí sửa chữa và chưa có lịch sử giao dịch.
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <Link to="/host/receivables"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100">
                    Công nợ phải thu <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                  <Link to="/host/deposits"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100">
                    <PiggyBank className="h-3.5 w-3.5" /> Sổ cọc
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      />
    </div>
  );
};
