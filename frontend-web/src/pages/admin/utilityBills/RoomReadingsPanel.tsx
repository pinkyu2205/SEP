import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { KindConfig } from './kinds';
import type { RoomReading, RoomSummary } from './billChecks';
import { fmtDateTime, fmtNum } from './ui';

const STATE_CHIP: Record<RoomReading['state'], { label: string; cls: string }> = {
  pending: { label: 'Chờ phát hành', cls: 'bg-indigo-50 text-indigo-700' },
  issued:  { label: 'Đã gửi khách',  cls: 'bg-emerald-50 text-emerald-700' },
  missing: { label: 'Chưa chốt',     cls: 'bg-amber-50 text-amber-700' },
};

/**
 * CHỈ SỐ TỪNG PHÒNG QUẢN LÝ ĐÃ CHỐT — chỉ nhà chia phòng.
 *
 * Bấm phát hành là gửi tiền tới tay khách, tính từ những con số admin chưa từng thấy: sai
 * một chữ số là hoá đơn lệch hàng trăm nghìn, và chỉ vỡ ra khi khách khiếu nại. Ảnh mặt
 * đồng hồ có sẵn trong dữ liệu — bày nó ngay cạnh con số để soát trước khi bấm. Vẫn hiện
 * sau khi đã phát hành: lúc đó nó là hồ sơ để trả lời khách "sao tháng này cao thế".
 */
export const RoomReadingsPanel = ({
  cfg, rows, summary, onZoom,
}: {
  cfg: KindConfig;
  rows: RoomReading[];
  summary: RoomSummary;
  onZoom: (url: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-800">Phòng sẽ nhận hoá đơn</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {summary.pending > 0
              ? `Phát hành là tính tiền và gửi ngay cho ${summary.pending} phòng đã chốt.`
              : 'Chưa phòng nào chờ phát hành — hoá đơn sẽ tự đi ngay khi quản lý chốt số.'}
            {summary.missing > 0 && ` ${summary.missing} phòng chưa chốt sẽ tự phát hành lúc quản lý chốt.`}
          </p>
        </div>
        <span className="shrink-0 text-xs font-bold text-slate-500">
          {open ? 'Thu gọn' : 'Xem từng phòng'}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {rows.map((r) => {
            const chip = STATE_CHIP[r.state];
            return (
              <div key={`${r.roomId ?? r.contractId ?? r.roomNumber}`} className="flex items-start gap-3 px-4 py-2.5">
                {/* Ảnh là BẰNG CHỨNG của con số nên đứng ngay cạnh nó. Bấm để phóng to —
                    chữ số trên mặt đồng hồ không đọc nổi ở cỡ thumbnail. */}
                {r.meterImageUrl ? (
                  <button
                    type="button"
                    onClick={() => onZoom(r.meterImageUrl!)}
                    className="shrink-0 overflow-hidden rounded-md border border-slate-200"
                  >
                    <img
                      src={r.meterImageUrl}
                      alt={`Đồng hồ phòng ${r.roomNumber ?? ''}`}
                      className="h-12 w-12 object-cover transition hover:scale-105"
                    />
                  </button>
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-dashed border-slate-300 text-[10px] font-semibold text-slate-400">
                    {r.newReading != null ? 'Mã admin' : 'Chưa có'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-bold text-slate-800">
                    {r.roomNumber ? `Phòng ${r.roomNumber}` : `#${r.roomId}`}
                    {r.tenantName && <span className="text-xs font-medium text-slate-500">{r.tenantName}</span>}
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${chip.cls}`}>{chip.label}</span>
                  </p>
                  {r.newReading != null ? (
                    <p className="mt-0.5 text-xs tabular-nums text-slate-600">
                      {fmtNum(Number(r.prevReading))} → <b className="text-slate-900">{fmtNum(Number(r.newReading))}</b>
                      {r.consumption != null && ` · ${fmtNum(r.consumption)} ${cfg.unit}`}
                      <span className="text-slate-400"> · chốt {fmtDateTime(r.capturedAt)}</span>
                      {r.prevSource === 'HANDOVER' && <span className="text-slate-400"> · số cũ từ lúc đón khách</span>}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-amber-700">Quản lý chưa chốt chỉ số phòng này.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
