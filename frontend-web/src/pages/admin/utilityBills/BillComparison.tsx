import type { ReactNode } from 'react';
import { ScanText } from 'lucide-react';
import type { PropertyResponse } from '@/types/api.types';
import type { LastBill, UtilityCycle } from '@/services/utilityCycle';
import type { BillMatchResult } from '@/utils/billPropertyMatch';
import type { KindConfig } from './kinds';
import { showCode, type BillDraft, type BillEvaluation, type Check, type RoomSummary } from './billChecks';
import { CheckBadge, NumInput, TONE_BOX, TONE_INPUT, fmtDate, fmtNum, fmtPeriodTag, fmtVnd } from './ui';

/** Một hàng đối chiếu: nhãn · số của hồ sơ · ô số trên giấy (kèm kết quả) · lời giải thích. */
const Row = ({
  label, hint, system, paper, check, active, fromImage,
}: {
  label: string;
  hint?: string;
  system: ReactNode;
  paper: ReactNode;
  check?: Check | null;
  /** Chưa có ảnh, chưa gõ gì thì chưa phán xét — cả bảng đỏ rực lúc mới mở là nhiễu. */
  active: boolean;
  /** Ô này vừa được điền từ ảnh — gắn dấu để admin biết số nào là máy đọc. */
  fromImage?: boolean;
}) => {
  const showDetail = active && check?.detail && check.tone !== 'ok' && check.tone !== 'idle';
  return (
    <div className="px-4 py-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,13.5rem)] sm:items-start sm:gap-4">
        <div className="pt-0.5 sm:pt-2">
          <p className="text-sm font-bold text-slate-700">{label}</p>
          {hint && <p className="text-[11px] leading-snug text-slate-400">{hint}</p>}
        </div>
        <div className="min-w-0 text-sm sm:pt-2">{system}</div>
        <div className="min-w-0">
          {paper}
          {(active || fromImage) && (
            <div className="mt-1 flex items-start gap-2">
              {active && check && <CheckBadge check={check} wrap />}
              {active && check?.tone === 'ok' && check.detail && (
                <span className="truncate text-xs tabular-nums text-slate-400">{check.detail}</span>
              )}
              {fromImage && (
                <span
                  className="ml-auto inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-slate-400"
                  title="Máy đọc từ ảnh — soát lại với tờ giấy"
                >
                  <ScanText className="h-3 w-3" /> từ ảnh
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      {showDetail && (
        <p className={`mt-2 rounded-lg border px-3 py-2 text-xs leading-relaxed ${TONE_BOX[check!.tone]}`}>
          {check!.detail}
        </p>
      )}
    </div>
  );
};

const SystemValue = ({ value, caption, muted }: { value: ReactNode; caption?: ReactNode; muted?: boolean }) => (
  <div className="min-w-0">
    <p className={`truncate tabular-nums ${muted ? 'text-slate-400' : 'font-bold text-slate-800'}`}>{value}</p>
    {caption && <p className="truncate text-[11px] text-slate-400">{caption}</p>}
  </div>
);

/**
 * BẢNG ĐỐI CHIẾU: hồ sơ hệ thống ↔ số in trên hoá đơn.
 *
 * Bố cục cũ là một cột ô nhập rời rạc, mỗi ô một khối cảnh báo màu riêng chồng lên nhau —
 * muốn biết tờ giấy có khớp nhà không phải đọc hết năm, sáu khối chữ. Nay mỗi mục một hàng:
 * hệ thống đang lưu gì, giấy ghi gì, khớp hay không. Sai ở đâu thấy ngay ở đúng hàng đó,
 * kèm một câu nói rõ cách gỡ.
 */
export const BillComparison = ({
  cfg, property, draft, onChange, ev, cycle, lastBill, rooms, active, fromImage,
  month, year, monthPeriodText, prevMonthPeriodText, billMatch,
}: {
  cfg: KindConfig;
  property: PropertyResponse;
  draft: BillDraft;
  onChange: (patch: Partial<BillDraft>) => void;
  ev: BillEvaluation;
  cycle: UtilityCycle | null;
  lastBill: LastBill | null;
  rooms: RoomSummary | null;
  active: boolean;
  fromImage: Partial<Record<keyof BillDraft, boolean>>;
  month: number;
  year: number;
  monthPeriodText: string;
  prevMonthPeriodText: string;
  billMatch: BillMatchResult;
}) => {
  const whole = property.wholeHouse === true;
  const unit = cfg.unit;
  const storedCode = showCode(cfg.storedCode(property));

  const addressCheck: Check | null = billMatch.verdict === 'match'
    ? { tone: 'ok', label: 'Khớp địa chỉ' }
    : billMatch.verdict === 'weak'
      ? { tone: 'warn', label: 'Chưa chắc chắn', detail: billMatch.message ?? undefined }
      : billMatch.verdict === 'mismatch'
        ? { tone: 'warn', label: 'Không thấy địa chỉ', detail: billMatch.message ?? undefined }
        : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="hidden grid-cols-[8rem_minmax(0,1fr)_minmax(0,13.5rem)] gap-4 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] font-black uppercase tracking-wider text-slate-400 sm:grid">
        <span />
        <span>Hồ sơ hệ thống</span>
        <span>Trên hoá đơn</span>
      </div>

      <div className="divide-y divide-slate-100">
        <Row
          label={cfg.codeLabel}
          active={active}
          check={ev.code}
          fromImage={fromImage.customerCode}
          system={storedCode
            ? <SystemValue value={<span className="font-mono tracking-wide">{storedCode}</span>} />
            : <SystemValue value="Chưa khai mã" muted />}
          paper={(
            <input
              value={draft.customerCode}
              onChange={(e) => onChange({ customerCode: e.target.value })}
              placeholder={`VD: ${cfg.codePlaceholder}`}
              aria-label={`${cfg.codeLabel} trên hoá đơn`}
              className={`w-full rounded-lg border px-3 py-2 font-mono text-sm font-bold uppercase tracking-wide text-slate-900 outline-none transition placeholder:font-normal placeholder:normal-case placeholder:text-slate-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 ${TONE_INPUT[active ? ev.code.tone : 'idle']}`}
            />
          )}
        />

        {whole ? (
          <>
            <Row
              label="Chỉ số cũ"
              hint={`đầu kỳ, ${unit}`}
              active={active}
              check={ev.prev}
              fromImage={fromImage.paperPrev}
              system={cycle?.prevClose ? (
                <SystemValue
                  value={fmtNum(cycle.prevClose.reading)}
                  caption={cycle.prevClose.source === 'reading' && cycle.prevClose.at
                    ? `chốt kỳ ${fmtPeriodTag(cycle.prevClose.at)}`
                    : 'chỉ số mới kỳ trước'}
                />
              ) : cycle?.firstPeriod && cycle.handover ? (
                <SystemValue
                  value={fmtNum(Math.round(cycle.handover.reading))}
                  caption={`lúc đón khách${cycle.handover.at ? ` ${fmtDate(cycle.handover.at)}` : ''}`}
                />
              ) : (
                <SystemValue value="—" caption={cycle?.firstPeriod ? 'kỳ đầu, HĐ không ghi' : 'không tra được'} muted />
              )}
              paper={(
                <NumInput
                  value={draft.paperPrev}
                  onChange={(v) => onChange({ paperPrev: v })}
                  tone={active && ev.prev ? ev.prev.tone : 'idle'}
                  ariaLabel="Chỉ số cũ trên hoá đơn"
                />
              )}
            />
            <Row
              label="Chỉ số mới"
              hint={`cuối kỳ, ${unit}`}
              active={active}
              check={ev.next}
              fromImage={fromImage.paperNew}
              system={ev.computedNew != null
                ? <SystemValue value={fmtNum(ev.computedNew)} caption="= cũ + tiêu thụ" />
                : <SystemValue value="—" caption="= cũ + tiêu thụ" muted />}
              paper={(
                <NumInput
                  value={draft.paperNew}
                  onChange={(v) => onChange({ paperNew: v })}
                  placeholder={ev.computedNew != null ? `${fmtNum(ev.computedNew)} (tự tính)` : '—'}
                  tone={active && ev.next ? ev.next.tone : 'idle'}
                  ariaLabel="Chỉ số mới trên hoá đơn"
                />
              )}
            />
          </>
        ) : (
          <Row
            label="Chỉ số"
            hint="từng phòng"
            active={active}
            check={rooms && rooms.total > 0
              ? {
                  tone: rooms.pending > 0 ? 'info' : 'warn',
                  label: rooms.pending > 0 ? `${rooms.pending} phòng sẽ nhận hoá đơn` : 'Chưa phòng nào chờ phát hành',
                }
              : null}
            system={rooms && rooms.total > 0
              ? <SystemValue value={`${rooms.pending + rooms.issued}/${rooms.total} phòng đã chốt`} caption="quản lý chốt trên app" />
              : <SystemValue value={`${property.totalRooms ?? 0} phòng`} caption="quản lý chốt trên app" muted />}
            paper={<p className="py-2 text-xs text-slate-400">Giấy chỉ có tổng của cả nhà</p>}
          />
        )}

        <Row
          label={cfg.qtyLabel}
          hint={unit}
          active={active}
          check={ev.qty}
          fromImage={fromImage.qty}
          system={lastBill
            ? <SystemValue value={fmtNum(lastBill.totalQuantity)} caption="kỳ trước" />
            : <SystemValue value="—" caption="chưa có kỳ trước" muted />}
          paper={(
            <NumInput
              value={draft.qty}
              onChange={(v) => onChange({ qty: v })}
              tone={active ? ev.qty.tone : 'idle'}
              ariaLabel={`Tổng ${unit} trên hoá đơn`}
            />
          )}
        />

        <Row
          label="Tổng tiền"
          hint="đã gồm thuế, phí"
          active={active}
          check={ev.amount}
          fromImage={fromImage.amount}
          system={lastBill
            ? <SystemValue value={fmtVnd(lastBill.totalAmount)} caption="kỳ trước" />
            : <SystemValue value="—" caption="chưa có kỳ trước" muted />}
          paper={(
            <NumInput
              value={draft.amount}
              onChange={(v) => onChange({ amount: v })}
              tone={active ? ev.amount.tone : 'idle'}
              ariaLabel="Tổng tiền trên hoá đơn"
            />
          )}
        />

        <Row
          label="Kỳ hoá đơn"
          active={active}
          check={ev.period}
          fromImage={fromImage.period}
          system={<SystemValue value={`Tháng ${month}/${year}`} caption="kỳ tiêu thụ đang phát hành" />}
          paper={(
            <>
              <input
                value={draft.period}
                onChange={(e) => onChange({ period: e.target.value })}
                placeholder="01/09 – 30/09/2026"
                aria-label="Kỳ in trên hoá đơn"
                className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold tabular-nums text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 ${TONE_INPUT[active ? ev.period.tone : 'idle']}`}
              />
              {/* Điền nhanh kỳ trọn tháng — giấy mẫu cũ hay mang kỳ khác, sửa tay từng số thì lâu. */}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onChange({ period: monthPeriodText })}
                  className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Kỳ {month}/{year}
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ period: prevMonthPeriodText })}
                  className="rounded-md border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Tháng trước
                </button>
              </div>
            </>
          )}
        />

        {/* Địa chỉ chỉ so được khi đã có chữ đọc từ ảnh. Cảnh báo, không chặn: OCR tiếng Việt
            trên ảnh chụp sai nhiều, chặn cứng sẽ có ngày cầm đúng giấy mà không phát hành được. */}
        {addressCheck && (
          <Row
            label="Địa chỉ"
            hint="trên ảnh"
            active={active}
            check={addressCheck}
            system={<SystemValue value={property.shortAddress || property.fullAddress || '—'} />}
            paper={<p className="py-2 text-xs text-slate-500">So chữ đọc được trên ảnh</p>}
          />
        )}
      </div>
    </div>
  );
};
