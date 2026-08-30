/**
 * Khối "Tình trạng nhà" ở màn CHI TIẾT bất động sản của Host.
 *
 * Cùng câu hỏi với hai cột mới ngoài danh sách ("căn này có khách chưa", "kỳ này thu
 * đủ chưa") nhưng ở đây trả lời sâu hơn một bậc: danh sách chỉ nói được "còn 2 hoá
 * đơn chưa thu", vào đây phải biết PHÒNG NÀO chưa thu thì host mới đi đòi được.
 *
 * Dữ liệu khai thác lấy từ chính danh sách phòng màn này đã tải (`rooms`), KHÔNG gọi
 * lại `occupancyFromProperty`: ở đây có sẵn phòng thật nên đếm thẳng vẫn đúng hơn con
 * số tổng hợp BE gửi kèm danh sách nhà.
 */
import { AlertCircle, KeyRound, Receipt } from 'lucide-react';
import { normalizeRoomNumber } from '@/services/propertyOccupancy.service';
import { formatCurrency } from '@/utils';
import { monthLabel } from '@/utils/period';
import { MonthPicker } from '../shared';
import {
  BILL_META, billStateOf,
  type BillSource, type BillSummary, type PropertyBillBreakdown,
} from './propertyOperationStatus';

/** Số phòng theo trạng thái, đếm từ danh sách phòng thật của màn chi tiết. */
export interface RoomCounts {
  total: number;
  rented: number;
  available: number;
  maintenance: number;
  notReady: number;
}

const SEGMENTS: { key: keyof Omit<RoomCounts, 'total'>; cls: string; label: string }[] = [
  { key: 'rented',      cls: 'bg-emerald-500', label: 'có khách' },
  { key: 'available',   cls: 'bg-slate-300',   label: 'trống' },
  { key: 'maintenance', cls: 'bg-amber-500',   label: 'bảo trì' },
  { key: 'notReady',    cls: 'bg-slate-200',   label: 'chưa mở' },
];

const OccupancySide = ({ isWholeHouse, counts, tenantName, contractEnd }: {
  isWholeHouse: boolean;
  counts: RoomCounts;
  tenantName?: string;
  contractEnd?: string;
}) => {
  const occupied = isWholeHouse ? !!tenantName : counts.rented > 0;
  const segs = SEGMENTS.map(s => ({ ...s, n: counts[s.key] })).filter(s => s.n > 0);

  return (
    <div className="flex-1">
      <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400">
        <KeyRound className="h-3.5 w-3.5" /> Khai thác
      </p>

      {isWholeHouse ? (
        <>
          <p className={`mt-1.5 text-lg font-black leading-tight ${occupied ? 'text-emerald-600' : 'text-rose-500'}`}>
            {occupied ? 'Đang cho thuê' : 'Đang để trống'}
          </p>
          <p className="mt-1 text-[13px] font-semibold text-slate-600">
            {occupied ? (
              <>
                Khách: <b className="text-slate-700">{tenantName}</b>
                {contractEnd && <span className="text-slate-400"> · HĐ đến {contractEnd}</span>}
              </>
            ) : 'Cả căn chưa có khách nào'}
          </p>
        </>
      ) : (
        <>
          <p className="mt-1.5 text-lg font-black leading-tight text-slate-900 tabular-nums">
            {counts.rented}/{counts.total}
            <span className="ml-1.5 text-xs font-bold text-slate-500">phòng có khách</span>
          </p>
          {counts.total > 0 && (
            <>
              <div className="mt-2 flex h-2 w-full gap-px overflow-hidden rounded-full bg-slate-100">
                {segs.map(s => (
                  <div key={s.key} className={s.cls} style={{ width: `${(s.n / counts.total) * 100}%` }} />
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs font-semibold text-slate-500">
                {segs.map(s => (
                  <span key={s.key} className="inline-flex items-center gap-1">
                    <span className={`h-1.5 w-1.5 rounded-full ${s.cls}`} />{s.n} {s.label}
                  </span>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

const BillSide = ({ bills, period, loading }: {
  bills: PropertyBillBreakdown | null;
  period: string;
  loading: boolean;
}) => {
  const t: BillSummary = bills?.total ?? { total: 0, paid: 0, pending: 0, overdue: 0, outstanding: 0 };
  const state = billStateOf(t);
  const m = BILL_META[state];
  const unpaid = t.pending + t.overdue;
  const rentOnly = bills?.source === 'rent-only';

  return (
    <div className="flex-1">
      <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400">
        <Receipt className="h-3.5 w-3.5" />
        {rentOnly ? `Tiền phòng ${monthLabel(period).toLowerCase()}` : `Hoá đơn ${monthLabel(period).toLowerCase()}`}
      </p>

      {loading ? (
        <p className="mt-1.5 text-sm font-semibold text-slate-400">Đang tải…</p>
      ) : bills?.source === 'none' ? (
        <p className="mt-1.5 text-sm font-semibold text-slate-400">Chưa lấy được dữ liệu hoá đơn</p>
      ) : t.total === 0 ? (
        <p className="mt-1.5 text-sm font-semibold text-slate-400">Kỳ này chưa phát sinh hoá đơn nào</p>
      ) : (
        <>
          <p className={`mt-1.5 flex items-center gap-2 text-lg font-black leading-tight tabular-nums ${m.text}`}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${m.dot}`} />
            {t.paid}/{t.total} <span className="text-xs font-bold">hoá đơn đã thu</span>
          </p>
          <p className="mt-1 text-[13px] font-semibold text-slate-600">
            {unpaid === 0 ? (
              <span className="text-emerald-600">Khách đã trả đủ{rentOnly && ' tiền phòng'}</span>
            ) : (
              <>
                Còn <b className="text-slate-800">{formatCurrency(t.outstanding)}</b> chưa vào
                {t.overdue > 0 && <span className="font-bold text-rose-600"> · {t.overdue} hoá đơn quá hạn</span>}
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
};

export const PropertyStatusPanel = ({
  isWholeHouse, counts, tenantName, contractEnd, bills, period, onPeriodChange, loading,
}: {
  isWholeHouse: boolean;
  counts: RoomCounts;
  tenantName?: string;
  contractEnd?: string;
  bills: PropertyBillBreakdown | null;
  period: string;
  onPeriodChange: (ym: string) => void;
  loading: boolean;
}) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-bold text-slate-900">Tình trạng nhà</h2>
      {/* Kỳ CHỈ đổi phần hoá đơn — khai thác luôn là "ngay lúc này". */}
      <MonthPicker value={period} onChange={onPeriodChange} />
    </div>

    <div className="flex flex-col gap-5 sm:flex-row sm:gap-8">
      <OccupancySide isWholeHouse={isWholeHouse} counts={counts}
        tenantName={tenantName} contractEnd={contractEnd} />
      <div className="hidden w-px shrink-0 bg-slate-100 sm:block" />
      <BillSide bills={bills} period={period} loading={loading} />
    </div>

    {bills?.source === 'rent-only' && (
      <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
        <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
        Chỉ tính tiền phòng — máy chủ chưa mở quyền xem hoá đơn điện, nước, dịch vụ cho
        chủ nhà, nên &quot;đã trả đủ&quot; ở đây không bao gồm các khoản đó.
      </p>
    )}
  </section>
);

/**
 * Chip một dòng cho MỘT bảng tổng hoá đơn — dùng cho cả thẻ phòng lẫn nhà nguyên căn.
 * Nội bộ file: nơi khác gọi qua `RoomBillChip` / `WholeHouseBillLine` để câu chữ và
 * điều kiện "khi nào thì im lặng" chỉ nằm ở một chỗ.
 */
const BillSummaryChip = ({ b }: { b: BillSummary }) => {
  const m = BILL_META[billStateOf(b)];
  const unpaid = b.pending + b.overdue;
  return (
    <div className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold ${m.cls}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.dot}`} />
      {unpaid === 0
        ? <span>Đã trả đủ {b.paid}/{b.total}</span>
        : (
          <span className="truncate">
            {b.paid}/{b.total} đã thu · nợ {formatCurrency(b.outstanding)}
            {b.overdue > 0 && ' (quá hạn)'}
          </span>
        )}
    </div>
  );
};

/**
 * Chip hoá đơn gắn trên THẺ PHÒNG — trả lời "phòng này kỳ này trả chưa".
 *
 * Không vẽ gì khi phòng không có hoá đơn nào trong kỳ: một chip xám "0/0" trên mỗi
 * phòng trống chỉ làm lưới phòng rối thêm mà không nói được điều gì.
 */
export const RoomBillChip = ({ bills, roomNumber }: {
  bills: PropertyBillBreakdown | null;
  roomNumber: string;
}) => {
  const b = bills?.byRoom.get(normalizeRoomNumber(roomNumber));
  if (!b || b.total === 0) return null;
  return <BillSummaryChip b={b} />;
};

/**
 * Hoá đơn của nhà NGUYÊN CĂN.
 *
 * Gộp cả `house` (hoá đơn không gắn phòng) lẫn `byRoom`: nguyên căn về nguyên tắc
 * không có phòng, nhưng dữ liệu cũ có thể vẫn gắn hoá đơn vào một mã phòng. Đọc
 * thẳng `total` là chắc chắn không bỏ sót khoản nào.
 */
export const WholeHouseBillLine = ({ bills }: { bills: PropertyBillBreakdown }) => (
  <BillSummaryChip b={bills.total} />
);

/** Nhãn nguồn dữ liệu dùng cho tiêu đề cột/khối — giữ câu chữ thống nhất một chỗ. */
export const billHeading = (source: BillSource | undefined, period: string) =>
  source === 'rent-only'
    ? `Tiền phòng ${monthLabel(period).toLowerCase()}`
    : `Hoá đơn ${monthLabel(period).toLowerCase()}`;
