import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { formatCurrency } from '@/utils';
import { normalizeVi } from '@/utils/helpers';

/**
 * DANH SÁCH LỊCH SỬ — dùng chung cho các tab "Lịch sử đã xử lý" của trang khiếu nại.
 *
 * ─── Vì sao cần ────────────────────────────────────────────────────────────────
 * Tab "đang chờ" và tab "lịch sử" trông giống nhau nhưng phục vụ hai việc trái ngược:
 *
 *   • ĐANG CHỜ  — vài vụ, mỗi vụ là một việc phải làm. Bày hết chi tiết ra là đúng:
 *     ảnh đồng hồ, lời khách, số liệu hoá đơn — admin cần chúng để phân xử.
 *   • LỊCH SỬ   — chỉ tăng, không bao giờ giảm. Nó là kho tra cứu: admin vào đây để
 *     tìm MỘT vụ cụ thể ("hồi tháng 8 phòng 103 khiếu nại gì?"), chứ không đọc lần
 *     lượt từ đầu.
 *
 * Bản trước dùng CHUNG một thẻ chi tiết cho cả hai. Một thẻ cao ~500px, nên 300 vụ là
 * một trang dài 150.000px không có ô tìm kiếm — muốn xem vụ thứ 200 thì phải cuộn qua
 * 199 vụ, và trình duyệt phải dựng cả 300 thẻ kèm toàn bộ ảnh.
 *
 * ─── Cách làm ──────────────────────────────────────────────────────────────────
 * Mỗi vụ là MỘT DÒNG (~52px). Bấm vào mới mở ra đúng thẻ chi tiết cũ. Thêm ô tìm và
 * nút xem thêm theo lô — ba thứ đó cùng giải quyết bài toán quy mô:
 *
 *   tìm     → nhảy thẳng tới vụ cần, không cuộn
 *   1 dòng  → 300 vụ nằm gọn trong ~15.000px thay vì 150.000px
 *   theo lô → chỉ dựng 50 dòng đầu, phần chi tiết chỉ dựng khi thật sự mở ra
 */

export interface HistoryRow {
  key: string | number;
  /** Biểu tượng đầu dòng — thường là loại điện/nước. */
  icon?: ReactNode;
  /** Dòng chính: tên khách. */
  title: string;
  /** Dòng phụ: nhà · phòng · mã hoá đơn · kỳ. */
  subtitle: string;
  /** Nhãn kết luận, kèm class màu. */
  status: { label: string; cls: string };
  amount?: number;
  /** Ngày kết luận, đã định dạng sẵn. */
  date?: string;
  /**
   * Chuỗi để đối chiếu khi tìm. Gộp sẵn mọi thứ admin có thể gõ vào (tên, sđt, mã hoá
   * đơn, tên nhà) — để component không phải biết gì về hình dạng dữ liệu của từng trang.
   */
  search: string;
  /**
   * Nội dung khi mở dòng ra. Truyền dạng HÀM, không phải phần tử dựng sẵn: dựng sẵn thì
   * mọi dòng đều phải tạo cây React chi tiết ngay cả khi đang đóng — đúng cái giá mà
   * việc gộp dòng sinh ra để tránh.
   */
  detail: () => ReactNode;
}

/** Số dòng dựng mỗi lô. 50 vừa đủ kín màn hình cuộn vài lần mà vẫn nhẹ. */
const BATCH = 50;

export const HistoryList = ({ rows, searchPlaceholder, emptyText }: {
  rows: HistoryRow[];
  searchPlaceholder: string;
  /** Câu hiện khi tìm không ra — khác với "chưa có vụ nào", nên trang cha tự lo ca đó. */
  emptyText: string;
}) => {
  const [query, setQuery] = useState('');
  const [openKey, setOpenKey] = useState<string | number | null>(null);
  const [limit, setLimit] = useState(BATCH);

  const filtered = useMemo(() => {
    const q = normalizeVi(query.trim());
    if (!q) return rows;
    return rows.filter(r => normalizeVi(r.search).includes(q));
  }, [rows, query]);

  const shown = filtered.slice(0, limit);

  return (
    <div className="mt-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setLimit(BATCH); }}
          placeholder={searchPlaceholder}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-400">
          {emptyText}
        </p>
      ) : (
        <>
          <p className="mt-3 text-xs font-semibold text-slate-400">
            {query.trim()
              ? <>Tìm thấy <b className="text-slate-600">{filtered.length}</b>/{rows.length} vụ</>
              : <><b className="text-slate-600">{rows.length}</b> vụ đã xử lý</>}
          </p>

          <div className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {shown.map(r => {
              const open = openKey === r.key;
              return (
                <div key={r.key}>
                  <button
                    onClick={() => setOpenKey(open ? null : r.key)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${
                      open ? 'bg-slate-50' : ''}`}
                  >
                    {r.icon && <span className="shrink-0">{r.icon}</span>}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-800">{r.title}</p>
                      <p className="truncate text-xs text-slate-400">{r.subtitle}</p>
                    </div>
                    <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold sm:inline ${r.status.cls}`}>
                      {r.status.label}
                    </span>
                    {r.amount != null && (
                      <span className="shrink-0 text-sm font-black tabular-nums text-slate-800">
                        {formatCurrency(r.amount)}
                      </span>
                    )}
                    {r.date && (
                      <span className="hidden shrink-0 text-xs tabular-nums text-slate-400 md:inline">{r.date}</span>
                    )}
                    <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {/* Chi tiết chỉ dựng khi mở — xem `detail` là hàm chứ không phải node. */}
                  {open && <div className="border-t border-slate-100 bg-slate-50/60">{r.detail()}</div>}
                </div>
              );
            })}
          </div>

          {filtered.length > shown.length && (
            <button
              onClick={() => setLimit(n => n + BATCH)}
              className="mt-3 w-full rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
            >
              Xem thêm {Math.min(BATCH, filtered.length - shown.length)} vụ
              <span className="ml-1 font-semibold text-slate-400">
                (còn {filtered.length - shown.length})
              </span>
            </button>
          )}
        </>
      )}
    </div>
  );
};
