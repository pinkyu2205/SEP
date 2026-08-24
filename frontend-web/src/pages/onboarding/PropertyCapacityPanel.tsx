import { Link } from 'react-router-dom';
import { useState } from 'react';
import { ArrowRight, ChevronDown, Loader2 } from 'lucide-react';
import type { PropertyOccupancy } from '@/services/propertyOccupancy.service';
import {
  CapacityStat, RoomSquares, CapacityBreakdown,
  RoomCountMismatchNote, RoomsNotOpenedNote, capacityTone, TONE_CARD,
} from './CapacityBar';

/**
 * CHỖ TRỐNG THEO NHÀ — khối trên trang Hồ sơ đón khách.
 *
 * ─── Vì sao KHÔNG đổ toàn bộ nhà vào đây ─────────────────────────────────────
 * Ý tưởng đầu là hiện mọi nhà đang khai thác. Bỏ, vì hai lý do — lý do thứ hai mới là
 * lý do thật:
 *
 *   1. Bố cục: 200 nhà là 200 thẻ. Khối phụ trợ đẩy bảng hồ sơ — nội dung chính của
 *      màn — xuống tận đáy trang.
 *   2. Số request: `loadPropertyOccupancy` phải gọi `GET /properties/{id}/rooms` cho
 *      TỪNG nhà (BE chưa có endpoint trả số phòng trống kèm danh sách nhà). 200 nhà là
 *      200 request mỗi lần mở trang. Cái này thì cuộn hay phân trang cũng không cứu.
 *
 * Nên khối này CÓ CHẶN TRÊN theo thiết kế, không phải chặn bằng mẹo giao diện:
 *
 *   • Mặc định — chỉ các nhà có mặt trong TRANG hồ sơ đang xem. Bảng cắt 20 dòng/trang
 *     nên nhiều nhất là 20 nhà, thực tế ít hơn nhiều vì mỗi nhà thường có vài hồ sơ.
 *     Số request luôn hữu hạn và nhỏ, không phụ thuộc hệ thống có bao nhiêu nhà.
 *
 * Việc DUYỆT cả danh sách ("còn nhà nào trống") thuộc về màn "Tình trạng nhà & phòng",
 * nơi mỗi dòng là một NHÀ. Trang này giữ đúng đơn vị của nó: mỗi dòng là một HỢP ĐỒNG.
 */

export interface CapacityRow {
  occ: PropertyOccupancy;
  /** Số hồ sơ đang chờ đón khách của căn này. */
  waiting: number;
}

const CapacityCard = ({ occ, waiting }: CapacityRow) => (
  <li className={`rounded-xl border p-3 ${TONE_CARD[capacityTone(occ)]}`}>
    {/* Số chỗ trống bên trái, cố định vị trí trên mọi thẻ — lướt dọc cột là các con số
        thẳng hàng nhau. Phần còn lại của thẻ là chi tiết, đọc khi cần. */}
    <div className="flex items-start gap-3">
      <CapacityStat occ={occ} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-800" title={occ.propertyName}>
          {occ.propertyName}
        </p>
        <RoomSquares occ={occ} />
        <CapacityBreakdown occ={occ} waiting={waiting} />
      </div>
    </div>

    <RoomCountMismatchNote occ={occ} />
    <RoomsNotOpenedNote occ={occ} />
  </li>
);

/** Nhiều hơn ngần này thì cắt bớt — xem đủ thì sang màn "Tình trạng nhà & phòng". */
const MAX_CARDS = 9;

/**
 * Nhà này có gì ĐÁNG XEM không.
 *
 * "Hết chỗ" KHÔNG tính là đáng xem: ngay sau khi import một loạt hồ sơ thì nhà nào cũng
 * kín — đó là chuyện bình thường, không phải việc phải làm. Chỉ hai thứ mới đáng lôi ra:
 * phòng chưa được kích hoạt (lỗi dữ liệu) và khai báo lệch thực tế.
 */
const needsAttention = (r: CapacityRow) =>
  r.occ.roomCountMismatch || (r.occ.propertyStatus === 'ACTIVE' && r.occ.notReady > 0);

export const PropertyCapacityPanel = ({
  rows, loading,
}: {
  rows: CapacityRow[];
  loading: boolean;
}) => {
  /**
   * Mặc định GẬP LẠI, chỉ mở khi có việc phải làm.
   *
   * Bản trước đổ hết thẻ ra: 11 nhà là 11 thẻ chiếm nửa màn, mà cả 11 đều ghi y hệt
   * "0 chỗ trống · chờ đón khách" — không thẻ nào đáng đọc, chỉ tổ đẩy bảng hồ sơ (nội
   * dung chính của trang) xuống dưới. Trang cắt 20 dòng nên xấu nhất là 20 thẻ.
   *
   * Nay dòng tóm tắt luôn hiện; lưới thẻ chỉ bung khi có nhà cần chú ý, hoặc khi admin
   * chủ động bấm xem.
   */
  const attention = rows.filter(needsAttention);
  const [expanded, setExpanded] = useState(false);
  const open = expanded || attention.length > 0;

  if (!loading && rows.length === 0) return null;

  // Ba con số, ba việc khác nhau: hết chỗ thì đi tìm nhà khác, còn "chưa mở phòng" là
  // LỖI dữ liệu phải báo BE xử lý — gộp chung là mất đúng cái tín hiệu cần.
  const full = rows.filter((r) => capacityTone(r.occ) === 'full').length;
  const notOpened = rows.filter((r) => r.occ.propertyStatus === 'ACTIVE' && r.occ.notReady > 0).length;
  const mismatched = rows.filter((r) => r.occ.roomCountMismatch).length;

  // Nhà cần chú ý lên trước, rồi mới tới phần còn lại — cắt sau khi đã xếp.
  const ordered = [...attention, ...rows.filter((r) => !needsAttention(r))];
  const shown = ordered.slice(0, MAX_CARDS);
  const hidden = ordered.length - shown.length;

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-800">Chỗ trống của các nhà ở trang này</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            {rows.length} nhà đang có hồ sơ ở trang hiện tại
            {full > 0 && <span className="font-semibold text-rose-600"> · {full} hết chỗ</span>}
            {notOpened > 0 && <span className="font-semibold text-amber-600"> · {notOpened} chưa mở phòng</span>}
            {mismatched > 0 && <span className="font-semibold text-amber-600"> · {mismatched} lệch khai báo</span>}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Có nhà cần chú ý thì lưới tự bung và KHÔNG cho gập — đó là thứ phải đọc. */}
          {!loading && rows.length > 0 && attention.length === 0 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              {expanded ? 'Thu gọn' : 'Xem chi tiết'}
              <ChevronDown className={`h-3.5 w-3.5 transition ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}

          {/*
            Trước 24/08/2026 chỗ này là một ô TÌM KIẾM để xem nhà ngoài trang hiện tại.
            Bỏ: tìm kiếm chỉ dùng được khi đã nhớ tên nhà, mà câu hỏi thật lại là "còn
            nhà nào trống" — câu đó phải DUYỆT cả danh sách mới trả lời được.
            Việc duyệt thuộc về màn "Tình trạng nhà & phòng" (1 dòng = 1 nhà, có sẵn bộ
            lọc "Còn phòng trống"). Trang này giữ đúng đơn vị của nó: 1 dòng = 1 hợp đồng.
          */}
          <Link
            to="/admin/handover"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Xem tất cả nhà <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang đếm phòng trống…
        </div>
      ) : open && (
        <>
          {/* `items-stretch` cho thẻ cao bằng nhau trong cùng hàng — bản trước nguyên căn
              ngắn hơn chia phòng nên đáy lưới răng cưa. */}
          <ul className="mt-3 grid items-stretch gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map(({ occ, waiting }) => (
              <CapacityCard key={occ.propertyId} occ={occ} waiting={waiting} />
            ))}
          </ul>
          {hidden > 0 && (
            <p className="mt-2.5 text-xs text-slate-400">
              Còn {hidden} nhà nữa ở trang này — xem đủ ở{' '}
              <Link to="/admin/handover" className="font-semibold text-indigo-600 hover:underline">
                Tình trạng nhà &amp; phòng
              </Link>.
            </p>
          )}
        </>
      )}
    </div>
  );
};
