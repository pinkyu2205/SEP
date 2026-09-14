import { Fragment, useState, type ReactNode } from 'react';
import { AlertCircle, ChevronDown, ChevronRight, RotateCcw, Wand2 } from 'lucide-react';
import type { PricingCalculationResponse, RoomPricingResult } from '@/types/api.types';
import { serverNow } from '@/utils/serverTime';
import { formatVND, shortVND } from './pricingBreakdown';
import { capitalParts, roomCapital, type RoomCapital } from './capitalItems';

/**
 * Bảng giá từng phòng cho màn Duyệt giá.
 *
 * Bản trước là các thẻ xếp chồng trong cột phải rộng 1/3 màn, lại nhét trong một khung
 * `overflow-y-auto` cao 34rem. Hai vấn đề chí mạng:
 *
 *   1. **Cuộn lồng nhau** — con lăn chuột đặt trong khung thì cuộn danh sách phòng, ra
 *      ngoài một chút thì cuộn cả trang. Đang so giá phòng 3 với phòng 5 mà trang nhảy
 *      đi chỗ khác thì mất dấu hoàn toàn.
 *   2. **Không so sánh được** — mỗi thẻ cao ~400px trong cột hẹp, màn hình chỉ thấy được
 *      một phòng tại một thời điểm, trong khi việc của Host chính là so các phòng với nhau.
 *
 * Nên đổi sang BẢNG full-width: mỗi phòng đúng một dòng, các con số cùng loại thẳng cột
 * để liếc dọc là so được. Trang chỉ có MỘT thanh cuộn dọc duy nhất (của trình duyệt);
 * bảng chỉ cuộn NGANG trong khung của nó khi màn hẹp. Chi tiết phân bổ vốn của từng phòng
 * đẩy vào dòng xổ ra khi bấm — cần thì xem, không cần thì không chiếm chỗ.
 */

/**
 * Ô nhập giá của từng phòng.
 *
 * Ký hiệu "đ" đặt NGOÀI ô nhập, không phải chồng lên bằng `position:absolute` như trước —
 * số tiền 7-8 chữ số căn phải sẽ chạy tuột xuống dưới chữ "đ" và bị che mất chữ số cuối,
 * đúng thứ tuyệt đối không được phép sai ở màn chốt giá.
 */
const MoneyCell = ({ value, onChange, invalid }: {
  value: number;
  onChange: (v: number) => void;
  invalid?: boolean;
}) => (
  <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition
    ${invalid
      ? 'border-rose-300 bg-rose-50 focus-within:border-rose-400'
      : 'border-slate-300 bg-white focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100'}`}
  >
    <input
      type="text"
      inputMode="numeric"
      value={value ? value.toLocaleString('vi-VN') : ''}
      onChange={(e) => {
        const raw = e.target.value.replace(/\./g, '').replace(/[^0-9]/g, '');
        onChange(raw === '' ? 0 : Number(raw));
      }}
      placeholder="0"
      className={`w-full min-w-0 bg-transparent text-right text-sm font-bold tabular-nums outline-none
        ${invalid ? 'text-rose-700' : 'text-slate-900'}`}
    />
    <span className="shrink-0 text-xs font-medium text-slate-400">đ</span>
  </div>
);

/**
 * Một thẻ trong dòng chi tiết phòng.
 *
 * Bản trước là bốn cụm `<dl>` trôi nổi trên nền xám phẳng, không viền không nền — nhìn ra
 * một mảng chữ chứ không ra bốn nhóm thông tin. Giờ mỗi nhóm là một thẻ trắng có viền, đánh
 * số theo đúng thứ tự suy luận, và dòng chốt của mỗi thẻ được tách bằng đường kẻ để mắt
 * biết đâu là kết quả, đâu là thành phần.
 */
const DetailCard = ({ step, title, footer, tone = 'plain', children }: {
  step: string;
  title: string;
  footer?: string;
  tone?: 'plain' | 'good' | 'bad';
  children: ReactNode;
}) => {
  const shell = {
    plain: 'border-slate-200 bg-white',
    good: 'border-emerald-200 bg-emerald-50/60',
    bad: 'border-rose-200 bg-rose-50/60',
  }[tone];
  const badge = {
    plain: 'bg-slate-900 text-white',
    good: 'bg-emerald-600 text-white',
    bad: 'bg-rose-600 text-white',
  }[tone];
  return (
    <div className={`flex flex-col rounded-xl border p-3.5 ${shell}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${badge}`}>
          {step}
        </span>
        <p className="text-[11px] font-black uppercase leading-tight tracking-wide text-slate-500">{title}</p>
      </div>
      <div className="space-y-0.5">{children}</div>
      {footer && (
        <p className="mt-auto pt-2 text-[11px] leading-snug text-slate-400">{footer}</p>
      )}
    </div>
  );
};

/** Một dòng nhãn — giá trị trong thẻ chi tiết. `total` = dòng chốt, có kẻ ngăn phía trên. */
const DRow = ({ label, value, total, accent, tone }: {
  label: string;
  value: string;
  total?: boolean;
  accent?: boolean;
  tone?: 'good' | 'bad';
}) => {
  const valueCls = tone === 'good' ? 'text-emerald-700'
    : tone === 'bad' ? 'text-rose-600'
    : accent ? 'text-indigo-700'
    : total ? 'text-slate-900' : 'text-slate-700';
  return (
    <div className={`flex items-baseline justify-between gap-3 ${total ? 'mt-1 border-t border-slate-200/80 pt-1.5' : ''}`}>
      <span className={`text-xs leading-snug ${total ? 'font-bold text-slate-600' : 'text-slate-500'}`}>{label}</span>
      <span className={`shrink-0 whitespace-nowrap text-xs tabular-nums ${total ? 'font-black' : 'font-semibold'} ${valueCls}`}>
        {value}
      </span>
    </div>
  );
};

export const RoomPriceTable = ({ calc, rooms, prices, onChange, readOnly, revenueMonths }: {
  calc: PricingCalculationResponse;
  rooms: RoomPricingResult[];
  prices: Record<number, number>;
  onChange: (next: Record<number, number>) => void;
  readOnly?: boolean;
  /** Số tháng THẬT của hợp đồng — dùng cho doanh thu. BE cắt phần lẻ nên 
   *  chỉ đúng cho phần hoàn vốn; lấy nó tính doanh thu là báo thiếu một tháng tiền thuê. */
  revenueMonths?: number;
}) => {
  const [openRoom, setOpenRoom] = useState<number | null>(null);

  const months = calc.contractMonths;
  const revMonths = revenueMonths && revenueMonths > 0 ? revenueMonths : months;
  const totalSet = rooms.reduce((s, r) => s + (prices[r.roomId] || 0), 0);
  const totalSuggested = rooms.reduce((s, r) => s + Math.round(r.suggestedPriceWithProfit), 0);

  /**
   * Có bảng khoản vốn (BE 14/09/2026) thì vốn từng phòng cộng từ đó: khoản chung chia đều + khoản
   * riêng của phòng. BE lúc này trả `rentShare/renovationShare/equipmentShare` = 0 nên không đọc
   * được nữa, và "vốn" dùng để tính lãi là phần CÒN LẠI chứ không phải tổng gốc.
   */
  const items = calc.capitalItems?.length ? calc.capitalItems : null;
  const today = serverNow();
  const capitalOf = (r: RoomPricingResult): RoomCapital | null =>
    items ? roomCapital(items, r.roomId, rooms.length, today) : null;
  const reserve = calc.repairReservePerMonth ?? 0;
  const totalInvest = items
    ? capitalParts(items, today).remaining
    : rooms.reduce((s, r) => s + (r.totalInvestment || 0), 0) || calc.capex;

  const setAll = (fn: (r: RoomPricingResult) => number) => {
    const next: Record<number, number> = {};
    rooms.forEach((r) => { next[r.roomId] = fn(r); });
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {/* Thao tác hàng loạt — đỡ phải sửa tay từng phòng */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAll((r) => Math.round(r.suggestedPriceWithProfit))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Lấy giá đề xuất cho tất cả
          </button>
          <button
            type="button"
            onClick={() => setAll((r) => Math.ceil((prices[r.roomId] || r.suggestedPriceWithProfit) / 100_000) * 100_000)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
          >
            <Wand2 className="h-3.5 w-3.5" /> Làm tròn lên 100k tất cả
          </button>
        </div>
      )}

      {/* Bảng: MỘT dòng một phòng, chỉ cuộn ngang khi màn hẹp — không cuộn dọc lồng nhau */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5 font-bold">Phòng</th>
              <th className="px-3 py-2.5 text-right font-bold">{items ? 'Vốn còn phải lấy lại' : 'Vốn phân bổ'}</th>
              <th className="px-3 py-2.5 text-right font-bold">Hoàn vốn / tháng</th>
              <th className="px-3 py-2.5 text-right font-bold">Giá đề xuất</th>
              {/* Cột DUY NHẤT sửa được — nền tô + ô nhập đã đủ nói lên điều đó, không cần chú thích */}
              <th className="w-[13.5rem] border-x border-indigo-100 bg-indigo-50/70 px-3 py-2.5 text-right font-black text-indigo-700">
                Giá áp dụng
              </th>
              <th className="px-3 py-2.5 text-right font-bold" title="Thu cả kỳ trừ vốn phòng — CHƯA trừ chi phí vận hành. Lãi ròng xem ở bảng dưới bảng này.">Lãi trước vận hành</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rooms.map((r) => {
              const price = prices[r.roomId] || 0;
              const below = price > 0 && price < r.roomFloor;
              const rMonths = revMonths;
              const cap = capitalOf(r);
              const invest = cap ? Math.round(cap.remaining) : r.totalInvestment ?? 0;
              const profit = price > 0 && invest > 0 ? price * rMonths - invest : null;
              const diff = price - Math.round(r.suggestedPriceWithProfit);
              const open = openRoom === r.roomId;

              return (
                <Fragment key={r.roomId}>
                  <tr className={below ? 'bg-rose-50/40' : 'hover:bg-slate-50/60'}>
                    <td className="px-3 py-2.5 align-middle">
                      <button
                        type="button"
                        onClick={() => setOpenRoom(open ? null : r.roomId)}
                        className="flex items-center gap-1.5 text-left"
                        title="Xem chi tiết phân bổ vốn của phòng này"
                      >
                        {open ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
                        <span>
                          <span className="font-bold text-slate-800">Phòng {r.roomNumber}</span>
                          <span className="ml-1.5 whitespace-nowrap text-[11px] text-slate-400">{r.area} m²</span>
                        </span>
                      </button>
                    </td>

                    <td className="px-3 py-2.5 text-right align-middle tabular-nums text-slate-600">
                      {invest > 0 ? formatVND(invest) : '—'}
                    </td>

                    <td className="px-3 py-2.5 text-right align-middle tabular-nums font-semibold text-slate-700">
                      {r.monthlyBreakEven != null ? formatVND(r.monthlyBreakEven) : '—'}
                    </td>

                    <td className="px-3 py-2.5 text-right align-middle tabular-nums font-bold text-indigo-600">
                      {formatVND(r.suggestedPriceWithProfit)}
                    </td>

                    <td className="border-x border-indigo-100 bg-indigo-50/40 px-3 py-2 align-middle">
                      {readOnly ? (
                        <p className="text-right font-bold tabular-nums text-slate-900">{formatVND(price)}</p>
                      ) : (
                        <>
                          <MoneyCell
                            value={price}
                            onChange={(v) => onChange({ ...prices, [r.roomId]: v })}
                            invalid={below}
                          />
                          {/* Lệch so với đề xuất — thấy ngay hậu quả của việc sửa tay */}
                          <p className={`mt-1 h-3.5 text-right text-[10px] font-bold leading-none tabular-nums ${
                            price > 0 && diff !== 0 ? (diff > 0 ? 'text-emerald-600' : 'text-amber-600') : 'text-transparent'
                          }`}>
                            {price > 0 && diff !== 0
                              ? `${diff > 0 ? '+' : '−'}${shortVND(Math.abs(diff))} so với đề xuất`
                              : 'đúng giá đề xuất'}
                          </p>
                        </>
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-right align-middle">
                      {profit != null ? (
                        <span className={`font-bold tabular-nums ${profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                          {profit < 0 ? '− ' : ''}{formatVND(Math.abs(profit))}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>

                  {below && (
                    <tr className="bg-rose-50/40">
                      <td colSpan={6} className="px-3 pb-2">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-rose-600">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                          Phòng {r.roomNumber} đang đặt dưới mức hoà vốn — cho thuê ở mức này sẽ không hoàn đủ vốn.
                        </p>
                      </td>
                    </tr>
                  )}

                  {/* Dòng xổ: bóc tách vốn của riêng phòng — chỉ hiện khi Host chủ động mở.
                      Bốn thẻ đọc từ trái sang phải chính là bốn bước suy luận: phòng này gánh
                      bao nhiêu vốn → vì sao gánh chừng đó → nên giá không được thấp hơn đâu →
                      chốt mức đang nhập thì lãi bao nhiêu. */}
                  {open && (
                    <tr className="bg-slate-100/60">
                      <td colSpan={7} className="px-3 py-4">
                        <div className="mb-3 flex items-center gap-2">
                          <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-black text-white">
                            Phòng {r.roomNumber}
                          </span>
                          <span className="text-xs font-medium text-slate-500">
                            {r.area} m² · vốn gánh {invest > 0 ? formatVND(invest) : '—'} · hoàn vốn trong {rMonths} tháng
                          </span>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          {cap ? (
                            <DetailCard step="1" title="Phòng gánh bao nhiêu vốn">
                              <DRow label="Tiền thuê nhà" value={formatVND(cap.rent)} />
                              <DRow label="Cải tạo" value={formatVND(cap.renovation)} />
                              <DRow label="Thiết bị" value={formatVND(cap.equipment)} />
                              <DRow label="Tổng vốn phòng" value={formatVND(cap.total)} total />
                              {cap.depreciated > 0 && (
                                <>
                                  <DRow label="Đã lấy lại qua tiền thuê" value={`− ${formatVND(cap.depreciated)}`} tone="good" />
                                  <DRow label="Còn phải lấy lại" value={formatVND(cap.remaining)} total accent />
                                </>
                              )}
                            </DetailCard>
                          ) : (
                            <DetailCard step="1" title="Phòng gánh bao nhiêu vốn">
                              <DRow label="Tiền thuê nhà" value={r.rentShare != null ? formatVND(r.rentShare) : '—'} />
                              <DRow label="Cải tạo" value={r.renovationShare != null ? formatVND(r.renovationShare) : '—'} />
                              <DRow label="Thiết bị" value={r.equipmentShare != null ? formatVND(r.equipmentShare) : '—'} />
                              <DRow label="Tổng vốn phòng" value={invest > 0 ? formatVND(invest) : '—'} total />
                            </DetailCard>
                          )}

                          {cap ? (
                            <DetailCard step="2" title="Vì sao chia chừng đó"
                              footer="Tiền thuê nhà, cải tạo và thiết bị khu vực chung chia đều cho mọi phòng. Thiết bị lắp trong phòng nào thì chỉ phòng đó gánh.">
                              <DRow label={`Phần chung ÷ ${rooms.length} phòng`} value={formatVND(cap.common.total)} />
                              <DRow label="Thiết bị riêng của phòng" value={formatVND(cap.own.total)} />
                              <DRow label="Mỗi tháng phải lấy lại" value={formatVND(cap.monthly)} total />
                            </DetailCard>
                          ) : (
                            <DetailCard step="2" title="Vì sao chia chừng đó"
                              footer="Phòng rộng gánh nhiều vốn hơn, nên giá thuê cũng cao hơn tương ứng.">
                              <DRow label="Diện tích thực" value={`${r.area} m²`} />
                              <DRow label="Quy đổi (gồm KV chung)" value={`${r.effectiveM2} m²`} />
                              <DRow label="Trọng số phân bổ" value={String(r.weight)} total />
                            </DetailCard>
                          )}

                          {/*
                            Đã BỎ mọi thứ liên quan GIÁ SÀN khỏi màn này (20/08/2026) — cột
                            "Giá tối thiểu", dòng tổng ở chân bảng, và hai dòng trong thẻ này.

                            Thẻ giờ trả lời đúng một câu: giá đề xuất được ghép từ những gì.
                            Cảnh báo khi đặt dưới mức hoà vốn thì GIỮ NGUYÊN — vẫn dựa vào
                            `roomFloor`, chỉ là không nêu con số ra nữa.
                          */}
                          <DetailCard step="3" title="Giá đề xuất tính thế nào">
                            <DRow label="Hoàn vốn / tháng" value={r.monthlyBreakEven != null ? formatVND(r.monthlyBreakEven) : '—'} />
                            {r.suggestedPriceWithProfit != null && r.monthlyBreakEven != null && (
                              <DRow label={reserve > 0 ? '+ Dự phòng sửa chữa, vận hành, bù trống & lãi' : '+ Vận hành, bù trống & lãi'}
                                value={formatVND(Math.max(0, r.suggestedPriceWithProfit - r.monthlyBreakEven))} />
                            )}
                            <DRow label="Đề xuất (đã có lãi)" value={formatVND(r.suggestedPriceWithProfit)} total accent />
                          </DetailCard>

                          <DetailCard step="4" title="Chốt giá này thu về bao nhiêu"
                            tone={profit == null ? 'plain' : profit >= 0 ? 'good' : 'bad'}>
                            <DRow label={`Thu cả kỳ (${rMonths} tháng)`} value={price > 0 ? formatVND(price * rMonths) : '—'} />
                            <DRow label="Trừ vốn phòng" value={invest > 0 ? `− ${formatVND(invest)}` : '—'} />
                            <DRow
                              label="Còn lại trước CP vận hành"
                              value={profit != null ? `${profit < 0 ? '− ' : ''}${formatVND(Math.abs(profit))}` : '—'}
                              total
                              tone={profit == null ? undefined : profit >= 0 ? 'good' : 'bad'}
                            />
                          </DetailCard>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>

          {/* Dòng tổng — luôn nằm cuối bảng, không phải cộng nhẩm */}
          <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-sm">
            <tr>
              <td className="px-3 py-3 font-black text-slate-700">Tổng {rooms.length} phòng</td>
              <td className="px-3 py-3 text-right font-bold tabular-nums text-slate-700">{formatVND(totalInvest)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-400">—</td>
              <td className="px-3 py-3 text-right font-bold tabular-nums text-indigo-600">{formatVND(totalSuggested)}</td>
              <td className="border-x border-indigo-100 bg-indigo-50/70 px-3 py-3 text-right font-black tabular-nums text-indigo-800">
                {formatVND(totalSet)}
              </td>
              <td className="px-3 py-3 text-right font-black tabular-nums text-emerald-700">
                {totalSet > 0 ? formatVND(totalSet * revMonths - totalInvest) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
