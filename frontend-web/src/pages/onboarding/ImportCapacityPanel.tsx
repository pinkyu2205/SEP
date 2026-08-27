import { AlertTriangle, CheckCircle2, Loader2, Users } from 'lucide-react';
import {
  CapacityStat, RoomSquares, CapacityBreakdown,
  RoomCountMismatchNote, RoomsNotOpenedNote,
} from './CapacityBar';
import type { PreflightGroup, PreflightReport } from './importPreflight';

/**
 * BẢNG SỨC CHỨA CỦA FILE IMPORT — hiện ngay khi vừa chọn file, trước cả khi bấm kiểm tra.
 *
 * Trả lời một câu hỏi mà dry-run của BE không trả lời được:
 * **"Mấy căn nhà trong file này có chứa nổi ngần này khách không?"**
 *
 * Dry-run soi từng dòng và trả "dòng 7 sai". Bảng này soi từng CĂN NHÀ và nói "nhà MTX#07
 * còn 2 phòng trống nhưng file đang xếp 6 khách vào" — đó mới là thứ cho biết phải quay
 * lại hỏi host chứ không phải ngồi sửa file.
 *
 * Chạy 100% trên trình duyệt (SheetJS), không gửi file đi đâu, nên hiện được ngay và
 * không tốn một lượt gọi BE nào.
 *
 * Dùng chung `CapacityBar` với khối "Chỗ trống theo nhà" bên trang Hồ sơ đón khách: cùng
 * một câu hỏi thì phải cùng một cách vẽ, không thì người dùng phải học lại từ đầu ở màn
 * thứ hai.
 */

const GroupCard = ({ g }: { g: PreflightGroup }) => {
  const occ = g.occupancy;
  const bad = g.overCapacity > 0 || g.issueCount > 0;

  return (
    <li className={`rounded-xl border p-3.5 ${bad ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-start gap-3">
        {/* Cùng bố cục với thẻ bên trang Hồ sơ đón khách: số chỗ trống dẫn đầu. */}
        {occ?.loaded ? (
          <CapacityStat occ={occ} />
        ) : (
          <div className="flex w-[52px] shrink-0 flex-col items-center justify-center rounded-lg bg-slate-50 py-1.5 text-slate-400 ring-1 ring-slate-200">
            <span className="text-2xl font-black leading-none">?</span>
            <span className="mt-0.5 text-[9px] font-bold uppercase leading-tight">chưa rõ</span>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate font-bold text-slate-900" title={g.label}>{g.label}</p>

          {/* Số khách file đang xếp vào căn này — vế còn lại của phép so sức chứa. */}
          <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <Users className="h-3.5 w-3.5 shrink-0" /> file xếp {g.rows.length} khách
          </p>

          {occ?.loaded ? (
            <>
              <RoomSquares occ={occ} />
              <CapacityBreakdown occ={occ} />
            </>
          ) : g.property ? (
            <p className="mt-1.5 text-xs text-slate-400">Chưa lấy được danh sách phòng của nhà này.</p>
          ) : (
            <p className="mt-1.5 text-xs font-semibold text-rose-600">
              Không khớp được với nhà nào trong hệ thống.
            </p>
          )}
        </div>
      </div>

      {/* Vượt sức chứa: nói bằng SỐ NGƯỜI thừa, vì đó là thứ phải đi thương lượng lại. */}
      {g.overCapacity > 0 && (
        <p className="mt-2 rounded-lg bg-rose-100 px-3 py-2 text-xs font-bold leading-relaxed text-rose-800">
          Thừa {g.overCapacity} khách so với số chỗ còn nhận được. Sửa file cũng không đủ
          phòng — cần hỏi lại chủ nhà về số phòng thực tế.
        </p>
      )}

      {!!occ && <RoomCountMismatchNote occ={occ} />}
      {/* Nhà đã hoạt động mà phòng còn khoá là lý do rất hay gặp khiến cả loạt dòng
          Excel báo "phòng không nhận khách được" — nói ra ngay đây, đừng để admin ngồi
          đoán vì sao nhà trống trơn mà vẫn không import được. */}
      {!!occ && <RoomsNotOpenedNote occ={occ} />}

      {g.issueCount > 0 && (
        <ul className="mt-2 space-y-1.5 border-t border-black/5 pt-2">
          {g.rows.filter((r) => r.code).map((r) => (
            <li key={r.excelRow} className="text-xs leading-relaxed">
              <span className="font-semibold text-slate-700">
                Dòng {r.excelRow}
                {r.roomNumber ? ` · Phòng ${r.roomNumber}` : r.wholeHouseRow ? ' · Nguyên căn' : ''}
                {' · '}{r.tenantName}
              </span>
              <span className="text-rose-700"> — {r.message}</span>
            </li>
          ))}
        </ul>
      )}

      {g.issueCount === 0 && g.overCapacity === 0 && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> Đủ chỗ cho toàn bộ {g.rows.length} khách.
        </p>
      )}
    </li>
  );
};

export const ImportCapacityPanel = ({ loading, report }: {
  loading: boolean;
  report: PreflightReport | null;
}) => {
  if (loading) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang đối chiếu file với số phòng thực tế…
      </div>
    );
  }

  if (!report) return null;

  /*
   * Đọc file hỏng thì IM LẶNG (chỉ một dòng xám nhạt), không dựng bảng lỗi đỏ.
   * Bản soát này là lớp phụ trợ; BE dry-run mới là nơi phán quyết. Báo động vì FE không
   * đọc nổi file sẽ làm admin tưởng file hỏng trong khi nó có thể hoàn toàn hợp lệ.
   */
  if (report.parseError) {
    return (
      <p className="mt-3 text-xs text-slate-400">
        Không soát trước được sức chứa ({report.parseError.toLowerCase()}) — bấm “Kiểm tra file”
        để hệ thống soát đầy đủ.
      </p>
    );
  }

  if (report.groups.length === 0) return null;

  const problemGroups = report.groups.filter((g) => g.issueCount > 0 || g.overCapacity > 0);
  const allGood = problemGroups.length === 0;

  return (
    <div className={`mt-4 overflow-hidden rounded-xl border ${allGood ? 'border-emerald-200' : 'border-rose-200'}`}>
      <div className={`px-4 py-2.5 ${allGood ? 'bg-emerald-50' : 'bg-rose-50'}`}>
        <p className={`flex items-center gap-2 text-sm font-bold ${allGood ? 'text-emerald-800' : 'text-rose-800'}`}>
          {allGood
            ? <><CheckCircle2 className="h-4 w-4" /> Sức chứa ổn — {report.groups.length} nhà, {report.totalRows} khách</>
            : <><AlertTriangle className="h-4 w-4" /> {problemGroups.length}/{report.groups.length} nhà có vấn đề về chỗ ở</>}
        </p>
        <p className={`mt-1 text-xs leading-relaxed ${allGood ? 'text-emerald-700' : 'text-rose-700'}`}>
          Đối chiếu ngay trên máy bạn với số phòng thực tế của từng nhà — file chưa gửi đi đâu.
          {!allGood && ' Đây là cảnh báo sớm; bấm “Kiểm tra file” để hệ thống soát nốt ngày tháng, CCCD, giá thuê.'}
        </p>
      </div>

      <ul className="max-h-80 space-y-2.5 overflow-auto bg-slate-50 p-3">
        {report.groups.map((g) => <GroupCard key={g.label} g={g} />)}
      </ul>
    </div>
  );
};
