import { fmtDate } from './ui';

/** Chỗ giao nhau giữa các kiểu hoá đơn tổng mà thanh tiến độ cần. */
export type ProgressBill = {
  roomsTotal?: number;
  roomsDone?: number;
  readingDeadline?: string | null;
  overdue?: boolean;
};

/**
 * TIẾN ĐỘ GỬI HOÁ ĐƠN của một tờ hoá đơn tổng đã phát hành.
 *
 * Phát hành hoá đơn tổng mới chỉ là ĐẦU VÀO: với nhà chia phòng, tiền chỉ tới khách khi
 * quản lý đã chốt đủ đồng hồ từng phòng — và đó là bước hay tắc. Cột này là chỗ duy nhất
 * trong bảng thật sự KHÁC NHAU giữa các dòng, nên nó trả lời được câu admin cần: nhà nào
 * đang kẹt. Nhà nguyên căn (`roomsTotal = 0`) không có gì phải chờ.
 */
export const ReadingProgress = ({ bill }: { bill: ProgressBill }) => {
  const total = bill.roomsTotal ?? 0;
  const done = bill.roomsDone ?? 0;

  // BE cũ chưa trả hai field này → đừng bịa ra "0/0 phòng", nói thẳng là không biết.
  if (bill.roomsTotal == null) return <span className="text-xs text-slate-300">—</span>;

  if (total === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-700">
        Nguyên căn · đã tới khách
      </span>
    );
  }

  const full = done >= total;
  const pct = Math.min(100, Math.round((done / total) * 100));
  return (
    <div className="min-w-[132px]">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-xs font-black tabular-nums ${
          full ? 'text-emerald-600' : bill.overdue ? 'text-rose-600' : 'text-amber-600'}`}>
          {done}/{total} phòng
        </span>
        {full
          ? <span className="text-[11px] font-bold text-emerald-600">xong</span>
          : bill.overdue
            ? <span className="text-[11px] font-bold text-rose-600">quá hạn</span>
            : bill.readingDeadline
              ? <span className="text-[11px] text-slate-400">hạn {fmtDate(bill.readingDeadline).slice(0, 5)}</span>
              : null}
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${
            full ? 'bg-emerald-500' : bill.overdue ? 'bg-rose-500' : 'bg-amber-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};
