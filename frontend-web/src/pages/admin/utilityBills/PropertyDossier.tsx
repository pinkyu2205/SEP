import { Loader2 } from 'lucide-react';
import type { PropertyResponse } from '@/types/api.types';
import type { LastBill, UtilityCycle } from '@/services/utilityCycle';
import type { KindConfig } from './kinds';
import { showCode, type RoomSummary } from './billChecks';
import { fmtBillPeriod, fmtDate, fmtNum, fmtPeriodTag, fmtVnd } from './ui';

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{children}</p>
);

const Pending = ({ text }: { text: string }) => (
  <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-400">
    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {text}
  </p>
);

/**
 * HỒ SƠ CĂN NHÀ — thứ hệ thống đang lưu, hiện ra NGAY khi chọn nhà, trước cả khi có ảnh.
 *
 * Admin cầm tờ giấy trên tay và cần đúng ba thứ để soát: mã khách hàng của nhà, chỉ số đầu
 * kỳ mà tờ giấy phải bắt đầu từ đó, và kỳ trước đã tính bao nhiêu. Trước đây cả ba đều
 * không hiện ở đâu — mã chỉ lộ ra khi máy chủ báo lệch, chỉ số cũ nằm khoá trong ô nhập —
 * nên muốn soát phải phát hành thử rồi đọc lỗi.
 */
export const PropertyDossier = ({
  cfg, property, cycle, cycleLoading, lastBill, lastBillLoading, rooms, roomsLoading,
}: {
  cfg: KindConfig;
  property: PropertyResponse;
  cycle: UtilityCycle | null;
  cycleLoading: boolean;
  lastBill: LastBill | null;
  lastBillLoading: boolean;
  rooms: RoomSummary | null;
  roomsLoading: boolean;
}) => {
  const whole = property.wholeHouse === true;
  const code = showCode(cfg.storedCode(property));
  const otherCode = showCode(cfg.otherCode(property));
  const unit = cfg.unit;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* ── Mã khách hàng ── */}
      <div className="px-4 py-3.5">
        <Label>{cfg.codeLabel}</Label>
        {code ? (
          <p className="mt-1 font-mono text-xl font-black tracking-wider text-slate-900">{code}</p>
        ) : (
          <>
            <p className="mt-1 text-sm font-bold text-amber-700">Chưa khai mã</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              Hoá đơn của nhà này sẽ không được đối chiếu mã. Bổ sung bằng cách nhập lại file Khởi tạo nhà.
            </p>
          </>
        )}
        <p className="mt-1.5 text-xs text-slate-400">
          {cfg.otherCodeLabel}:{' '}
          {otherCode
            ? <span className="font-mono font-semibold text-slate-500">{otherCode}</span>
            : <span className="text-slate-400">chưa khai</span>}
        </p>
      </div>

      {/* ── Chỉ số đầu kỳ (nguyên căn) / tiến độ chốt phòng (chia phòng) ── */}
      <div className="border-t border-slate-100 px-4 py-3.5">
        {whole ? (
          <>
            <Label>Chỉ số {cfg.meterWord} đầu kỳ theo hệ thống</Label>
            {cycleLoading ? (
              <Pending text="Đang tra chỉ số kỳ trước…" />
            ) : cycle?.prevClose ? (
              <>
                <p className="mt-1 text-xl font-black tabular-nums text-slate-900">
                  {fmtNum(cycle.prevClose.reading)} <span className="text-sm font-bold text-slate-400">{unit}</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {cycle.prevClose.source === 'reading'
                    ? `Bản ghi chỉ số${cycle.prevClose.at ? ` kỳ ${fmtPeriodTag(cycle.prevClose.at)}` : ''}`
                    : 'Chỉ số mới của hoá đơn đã tính kỳ trước'}
                  {' — giấy kỳ này phải bắt đầu đúng từ số này.'}
                </p>
              </>
            ) : cycle?.firstPeriod ? (
              cycle.handover ? (
                <>
                  <p className="mt-1 text-xl font-black tabular-nums text-slate-900">
                    {fmtNum(Math.round(cycle.handover.reading))} <span className="text-sm font-bold text-slate-400">{unit}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Ghi lúc đón khách{cycle.handover.at ? ` ${fmtDate(cycle.handover.at)}` : ''} · kỳ đầu của khách này
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-slate-500">
                  Kỳ đầu của khách — hợp đồng không ghi chỉ số lúc đón khách, đối chiếu theo giấy.
                </p>
              )
            ) : (
              <p className="mt-1 text-sm text-slate-500">
                Không tra được chỉ số kỳ trước{cycle?.unknown ? ' — nhà chưa có hợp đồng nguyên căn đang hiệu lực' : ''}.
              </p>
            )}
          </>
        ) : (
          <>
            <Label>Chỉ số từng phòng</Label>
            {roomsLoading ? (
              <Pending text="Đang xem phòng nào đã chốt…" />
            ) : rooms && rooms.total > 0 ? (
              <>
                <p className="mt-1 text-xl font-black tabular-nums text-slate-900">
                  {rooms.pending + rooms.issued}/{rooms.total}{' '}
                  <span className="text-sm font-bold text-slate-400">phòng đã chốt</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {[
                    rooms.pending > 0 && `${rooms.pending} chờ phát hành (${fmtNum(rooms.pendingQty)} ${unit})`,
                    rooms.issued > 0 && `${rooms.issued} đã gửi khách`,
                    rooms.missing > 0 && `${rooms.missing} chưa chốt`,
                  ].filter(Boolean).join(' · ')}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-slate-500">
                {property.totalRooms ?? 0} phòng · quản lý chốt chỉ số từng phòng trên app.
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Kỳ trước đã tính ── */}
      <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3.5">
        <Label>Kỳ trước đã tính</Label>
        {lastBillLoading ? (
          <Pending text="Đang tải…" />
        ) : lastBill ? (
          <>
            <p className="mt-1 text-sm font-bold text-slate-800">{fmtBillPeriod(lastBill.billingPeriod)}</p>
            <p className="mt-0.5 text-xs tabular-nums text-slate-500">
              {fmtNum(lastBill.totalQuantity)} {unit} · {fmtVnd(lastBill.totalAmount)}
              {lastBill.totalQuantity > 0 && (
                <> · {fmtVnd(lastBill.unitPrice ?? cfg.unitPrice(lastBill.totalAmount, lastBill.totalQuantity))}/{unit}</>
              )}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-500">Chưa có hoá đơn kỳ nào trước kỳ này.</p>
        )}
      </div>
    </div>
  );
};
