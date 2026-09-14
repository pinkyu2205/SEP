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
import { Fragment, useState } from 'react';
import { AlertCircle, ChevronDown, KeyRound, Receipt } from 'lucide-react';
import { normalizeRoomNumber } from '@/services/propertyOccupancy.service';
import { formatCurrency } from '@/utils';
import { fmtDate, monthLabel } from '@/utils/period';
import { MonthPicker } from '../shared';
import {
  BILL_META, INVOICE_TYPE_META, INVOICE_TYPE_ORDER, billStateOf, groupOnboardPayments,
  type BillLine, type BillSource, type BillSummary, type PropertyBillBreakdown,
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

const OccupancySide = ({ isWholeHouse, counts, tenantName, contractEnd, pastPeriod, period }: {
  isWholeHouse: boolean;
  counts: RoomCounts;
  tenantName?: string;
  contractEnd?: string;
  /** Đang xem một tháng đã qua — số liệu suy từ hợp đồng nằm trong tháng đó, câu chữ đổi sang quá khứ. */
  pastPeriod?: boolean;
  period: string;
}) => {
  const occupied = isWholeHouse ? !!tenantName : counts.rented > 0;
  const segs = SEGMENTS.map(s => ({ ...s, n: counts[s.key] })).filter(s => s.n > 0);

  return (
    <div className="flex-1">
      <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-400">
        <KeyRound className="h-3.5 w-3.5" /> Khai thác{pastPeriod ? ` ${monthLabel(period).toLowerCase()}` : ''}
      </p>

      {isWholeHouse ? (
        <>
          <p className={`mt-1.5 text-lg font-black leading-tight ${occupied ? 'text-emerald-600' : 'text-rose-500'}`}>
            {occupied ? (pastPeriod ? 'Có khách thuê' : 'Đang cho thuê') : (pastPeriod ? 'Chưa có khách' : 'Đang để trống')}
          </p>
          <p className="mt-1 text-[13px] font-semibold text-slate-600">
            {occupied ? (
              <>
                Khách: <b className="text-slate-700">{tenantName}</b>
                {contractEnd && <span className="text-slate-400"> · HĐ đến {contractEnd}</span>}
              </>
            ) : pastPeriod ? 'Tháng này không có hợp đồng thuê nào' : 'Cả căn chưa có khách nào'}
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

          {/*
            Tách theo LOẠI khoản thu. "2/3 đã thu" không nói được đang thiếu tiền nhà
            hay tiền nước — hai khoản chênh nhau cả chục lần về số tiền lẫn mức độ
            phải đi đòi, mà gộp chung vào một phân số thì trông y hệt nhau.
          */}
          <TypeBreakdown bills={bills} />
        </>
      )}
    </div>
  );
};

const TypeBreakdown = ({ bills }: { bills: PropertyBillBreakdown | null }) => {
  const rows = INVOICE_TYPE_ORDER
    .map(type => ({ type, b: bills?.byType.get(type) }))
    .filter((r): r is { type: typeof r.type; b: BillSummary } => !!r.b && r.b.total > 0);

  // Một loại duy nhất thì bảng tách này chỉ chép lại đúng dòng tổng ở trên.
  if (rows.length <= 1) return null;

  return (
    <div className="mt-3 space-y-1 border-t border-slate-100 pt-2.5">
      {rows.map(({ type, b }) => {
        const meta = INVOICE_TYPE_META[type];
        const done = b.paid === b.total;
        return (
          <div key={type} className="flex items-center gap-2 text-[13px]">
            <span className="w-4 shrink-0 text-center leading-none">{meta.icon}</span>
            <span className="font-semibold text-slate-600">{meta.label}</span>
            <span className={`ml-auto shrink-0 font-black tabular-nums ${done ? 'text-emerald-600' : 'text-slate-800'}`}>
              {b.paid}/{b.total}
            </span>
            <span className={`w-28 shrink-0 text-right text-xs font-bold tabular-nums ${
              b.overdue > 0 ? 'text-rose-600' : done ? 'text-emerald-600' : 'text-amber-600'
            }`}>
              {done ? 'đã thu' : `nợ ${formatCurrency(b.outstanding)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const LINE_STATUS: Record<string, { label: string; cls: string }> = {
  PAID:      { label: 'Đã thu',       cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  PENDING:   { label: 'Chờ thu',      cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  PARTIAL:   { label: 'Thu một phần', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  OVERDUE:   { label: 'Quá hạn',      cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  CANCELLED: { label: 'Đã huỷ',       cls: 'bg-slate-100 text-slate-500 border-slate-200' },
};

/**
 * Bảng từng hoá đơn — mở ra khi host muốn biết đích xác đang chờ khoản nào của ai.
 * Dùng cả ở thẻ "Khách thuê hiện tại" của nhà nguyên căn (`PropertyDetail`).
 */
export const BillLines = ({ lines, showWhere = true }: {
  lines: BillLine[];
  /** false = bỏ cột "Phòng / khách" (nhà nguyên căn: luôn là cả căn, tên khách đã hiện ở trên). */
  showWhere?: boolean;
}) => (
  <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
    {/*
      BỐN cột, không phải sáu. Hai cột bị gộp vì chúng không đứng riêng nổi:

      • MÃ HOÁ ĐƠN — chuỗi dài nhất bảng (`HD-RENT-50-2026-09`) nhưng host chỉ dùng khi
        cần đối chiếu một dòng cụ thể. Xuống dòng phụ dưới tên khoản thu: vẫn sao chép
        được, mà không còn ngốn một cột rộng ở mọi dòng.

      • HẠN — chỉ có nghĩa khi CHƯA thu. Dòng "Đã thu" mà vẫn in hạn thì đó là một ngày
        không dùng để làm gì, và ở bảng này đa số dòng đều đã thu. Gộp vào ô trạng thái,
        chỉ hiện khi còn nợ.

      Bỏ hai cột đó là bảng vừa bề ngang, hết cuộn ngang.
    */}
    <table className="w-full text-sm">
      <thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
        <tr>
          <th className="px-3 py-2">Khoản thu</th>
          {showWhere && <th className="px-3 py-2">Phòng / khách</th>}
          <th className="px-3 py-2 text-right">Số tiền</th>
          <th className="px-3 py-2">Trạng thái</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {groupOnboardPayments(lines, l => !!l.envelope, l => l.collectedInInvoiceCode).map(e => {
          const where = (l: BillLine) => (!showWhere ? null : (
            <td className="px-3 py-1.5 text-xs text-slate-600">
              {l.roomNumber && l.roomNumber !== 'NGUYEN_CAN' ? <b className="text-slate-800">P.{l.roomNumber}</b> : 'Cả căn'}
              {l.tenantName && <span className="text-slate-400"> · {l.tenantName}</span>}
            </td>
          ));
          const statusCell = (l: BillLine) => {
            const st = LINE_STATUS[l.status] ?? LINE_STATUS.PENDING;
            const settled = l.status === 'PAID' || l.status === 'CANCELLED';
            return (
              <td className="px-3 py-1.5">
                <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-black ${st.cls}`}>
                  {st.label}
                </span>
                {!settled && l.dueDate && (
                  <span className="ml-1.5 whitespace-nowrap text-[11px] tabular-nums text-slate-400">
                    hạn {fmtDate(l.dueDate)}
                  </span>
                )}
              </td>
            );
          };

          if (e.kind === 'onboard') {
            // MỘT lần khách trả lúc nhận phòng: một dòng tổng, bên dưới tách cọc + tiền nhà kỳ đầu.
            const { envelope, rents, deposit } = e.payment;
            return (
              <Fragment key={envelope.id}>
                <tr>
                  <td className="px-3 py-1.5">
                    <p className="whitespace-nowrap font-bold text-slate-800">🧾 Thanh toán lúc nhận phòng</p>
                    <p className="font-mono text-[11px] text-slate-400">{envelope.code} · khách trả một lần</p>
                  </td>
                  {where(envelope)}
                  <td className="whitespace-nowrap px-3 py-1.5 text-right font-black tabular-nums text-slate-900">
                    {formatCurrency(envelope.amount)}
                  </td>
                  {statusCell(envelope)}
                </tr>
                {deposit != null ? (
                  <tr className="bg-slate-50/50">
                    <td className="py-1 pl-8 pr-3 text-xs text-slate-600" colSpan={showWhere ? 2 : 1}>
                      💰 Tiền cọc <span className="text-slate-400">· hoàn lại khi trả phòng</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-1 text-right text-xs font-bold tabular-nums text-slate-600">
                      {formatCurrency(deposit)}
                    </td>
                    <td />
                  </tr>
                ) : (
                  <tr className="bg-slate-50/50">
                    <td className="py-1 pl-8 pr-3 text-xs text-slate-500" colSpan={showWhere ? 4 : 3}>Gồm tiền cọc + tiền nhà kỳ đầu</td>
                  </tr>
                )}
                {rents.map(r => (
                  <tr key={r.id} className="bg-slate-50/50">
                    <td className="py-1 pl-8 pr-3 text-xs text-slate-600" colSpan={showWhere ? 2 : 1}>
                      🏠 Tiền nhà kỳ đầu <span className="font-mono text-slate-400">· {r.code}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-1 text-right text-xs font-bold tabular-nums text-slate-600">
                      {formatCurrency(r.amount)}
                    </td>
                    <td />
                  </tr>
                ))}
              </Fragment>
            );
          }

          const l = e.item;
          const meta = INVOICE_TYPE_META[l.type];
          return (
            <tr key={l.id}>
              <td className="px-3 py-1.5">
                <p className="whitespace-nowrap font-bold text-slate-800">
                  {meta.icon} {l.envelope ? 'Cọc + tiền nhà kỳ đầu' : meta.label}
                </p>
                <p className="font-mono text-[11px] text-slate-400">{l.code}</p>
                {l.collectedAtOnboard && (
                  <p className="text-[11px] font-semibold text-emerald-700">Đã thu cùng cọc lúc nhận phòng, không thu thêm</p>
                )}
              </td>
              {where(l)}
              <td className="whitespace-nowrap px-3 py-1.5 text-right font-black tabular-nums text-slate-900">
                {formatCurrency(l.amount)}
              </td>
              {statusCell(l)}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export const PropertyStatusPanel = ({
  isWholeHouse, counts, tenantName, contractEnd, pastPeriod, bills, period, onPeriodChange, loading,
}: {
  isWholeHouse: boolean;
  counts: RoomCounts;
  tenantName?: string;
  contractEnd?: string;
  /** Kỳ đang xem đã qua — khai thác lấy theo hợp đồng trong kỳ, không phải hiện tại. */
  pastPeriod?: boolean;
  bills: PropertyBillBreakdown | null;
  period: string;
  onPeriodChange: (ym: string) => void;
  loading: boolean;
}) => {
  const [openLines, setOpenLines] = useState(false);
  const lines = bills?.lines ?? [];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900">Tình trạng nhà</h2>
        {/* Kỳ đổi CẢ hoá đơn lẫn khai thác: tháng đã qua thì khai thác theo hợp đồng nằm trong tháng đó. */}
        <MonthPicker value={period} onChange={onPeriodChange} />
      </div>

      <div className="flex flex-col gap-5 sm:flex-row sm:gap-8">
        <OccupancySide isWholeHouse={isWholeHouse} counts={counts}
          tenantName={tenantName} contractEnd={contractEnd} pastPeriod={pastPeriod} period={period} />
        <div className="hidden w-px shrink-0 bg-slate-100 sm:block" />
        <BillSide bills={bills} period={period} loading={loading} />
      </div>

      {/* Bảng từng hoá đơn đặt DƯỚI cả hai cột để dùng trọn chiều ngang — nhét vào
          nửa cột bên phải thì 6 cột dữ liệu phải cuộn ngang mới đọc được. */}
      {lines.length > 0 && (
        <>
          <button
            onClick={() => setOpenLines(o => !o)}
            className="mt-4 flex items-center gap-1.5 text-sm font-bold text-indigo-600 transition hover:text-indigo-700"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${openLines ? 'rotate-180' : ''}`} />
            {openLines ? 'Thu gọn danh sách' : `Xem chi tiết ${lines.length} hoá đơn`}
          </button>
          {openLines && <BillLines lines={lines} />}
        </>
      )}

      {bills?.source === 'rent-only' && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          Chỉ tính tiền phòng — máy chủ chưa mở quyền xem hoá đơn điện, nước, dịch vụ cho
          chủ nhà, nên &quot;đã trả đủ&quot; ở đây không bao gồm các khoản đó.
        </p>
      )}
    </section>
  );
};

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
