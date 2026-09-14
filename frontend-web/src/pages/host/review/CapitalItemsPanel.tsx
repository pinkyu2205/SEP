import { Fragment } from 'react';
import { HandCoins, Layers } from 'lucide-react';
import type { PricingCalculationResponse, PricingCapitalItem } from '@/types/api.types';
import { formatDate } from '@/utils/helpers';
import { BigStat, Divider, Line, Note, Panel, formatVND, shortVND } from './pricingBreakdown';
import {
  KIND_LABEL, capitalParts, depreciatedOf, elapsedOf, groupByStart, remainingOf,
} from './capitalItems';

/**
 * BẢNG KHOẢN VỐN của màn Duyệt giá — trả lời "giá mới ở đâu ra" sau mỗi đợt cải tạo bổ sung.
 *
 * Mỗi khoản (tiền thuê chủ nhà, từng hạng mục cải tạo, từng thiết bị) có lịch khấu hao riêng.
 * Khoản của đợt trước giữ nguyên "mỗi tháng"; đợt bổ sung chỉ cộng thêm khoản mới. Nên bảng
 * nhóm theo NGÀY BẮT ĐẦU khấu hao: nhóm đầu là lúc tiếp nhận nhà, các nhóm sau là từng đợt bổ sung.
 *
 * Kèm hai khối Host cần biết trước khi duyệt:
 *   • Dự phòng sửa chữa sau bảo hành — đã nằm trong giá.
 *   • Phần công ty tự chịu — KHÔNG nằm trong giá (thay đồ tương đương, khách đang ở giữ giá cũ).
 *
 * Chỉ hiện khi BE trả `capitalItems` (hiện chỉ `POST /pricing/calculate` trả).
 */
export const CapitalItemsPanel = ({ calc, today, roomLabel, rentLabel }: {
  calc: PricingCalculationResponse;
  today: Date;
  /** roomId → "Phòng 101"; không tra được thì trả null. */
  roomLabel: (roomId: number) => string | null;
  /** Tên dòng tiền thuê, vd mã HĐ chủ nhà. */
  rentLabel?: string;
}) => {
  const items = calc.capitalItems ?? [];
  if (items.length === 0) return null;

  const parts = capitalParts(items, today);
  const groups = groupByStart(items);
  const reserve = calc.repairReservePerMonth ?? 0;
  const absorbed = calc.companyAbsorbed;
  const tenants = absorbed?.tenantsOnOldPrice ?? [];
  const tenantsTotal = tenants.reduce((s, t) => s + (t.absorbedAmount || 0), 0);
  const equivalent = absorbed?.equivalentReplacement ?? 0;
  const prevFloor = calc.previousFloor ?? 0;
  const newFloor = calc.newFloor ?? 0;

  const scopeOf = (it: PricingCapitalItem): string => {
    if (it.roomId != null) return roomLabel(it.roomId) ?? `Phòng #${it.roomId}`;
    if (it.houseArea) return 'Khu vực chung';
    return calc.pricingScope === 'ROOM' ? 'Chia đều các phòng' : 'Cả nhà';
  };

  /** Tiền thuê luôn kèm mã HĐ chủ nhà; khoản khác lấy tên BE trả, nâng cấp thì ghi rõ là phần chênh. */
  const nameOf = (it: PricingCapitalItem): string => {
    if (it.kind === 'RENT') return rentLabel ? `${KIND_LABEL.RENT} · ${rentLabel}` : KIND_LABEL.RENT;
    const name = it.itemName?.trim();
    if (it.kind === 'EQUIPMENT_UPGRADE') return name ? `Nâng cấp ${name} (phần đắt hơn máy cũ)` : KIND_LABEL.EQUIPMENT_UPGRADE;
    if (!name) return KIND_LABEL[it.kind];
    return it.kind === 'RENOVATION' ? `Cải tạo · ${name}` : name;
  };

  return (
    <Panel
      title="Từng khoản vốn và lịch khấu hao"
      icon={Layers}
      subtitle="Mỗi khoản được lấy lại đều theo tháng từ ngày bắt đầu của nó. Khoản của đợt trước giữ nguyên số tiền mỗi tháng — đợt cải tạo bổ sung chỉ cộng thêm khoản mới, không tính lại từ đầu."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <BigStat label="Tổng các khoản" value={formatVND(parts.total)} />
        <BigStat label="Đã lấy lại tới hôm nay" value={formatVND(parts.depreciated)} tone="emerald" />
        <BigStat label="Còn phải lấy lại" value={formatVND(parts.remaining)} tone="indigo" />
        <BigStat label="Mỗi tháng" value={formatVND(parts.monthly)} tone="amber"
          sub={`Cộng ${items.length} khoản`} />
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5 font-bold">Khoản</th>
              <th className="px-3 py-2.5 font-bold">Áp cho</th>
              <th className="px-3 py-2.5 text-right font-bold">Số tiền</th>
              <th className="px-3 py-2.5 text-right font-bold">Số tháng</th>
              <th className="px-3 py-2.5 text-right font-bold">Đã lấy lại</th>
              <th className="px-3 py-2.5 text-right font-bold">Còn lại</th>
              <th className="px-3 py-2.5 text-right font-bold">Mỗi tháng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groups.map((g, gi) => {
              const gMonthly = g.items.reduce((s, it) => s + it.monthlyAmount, 0);
              return (
                <Fragment key={g.startDate}>
                  <tr className="bg-slate-100/70">
                    <td colSpan={7} className="px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-black uppercase tracking-wide text-slate-600">
                          {gi === 0 ? 'Lúc tiếp nhận nhà' : `Cải tạo bổ sung · đợt ${gi + 1}`}
                          <span className="ml-2 font-semibold normal-case tracking-normal text-slate-400">
                            bắt đầu lấy lại từ {formatDate(g.startDate)}
                          </span>
                        </span>
                        <span className="text-xs font-bold tabular-nums text-slate-600">
                          {formatVND(gMonthly)}/tháng
                        </span>
                      </div>
                    </td>
                  </tr>
                  {g.items.map((it) => {
                    const elapsed = elapsedOf(it, today);
                    return (
                      <tr key={`${it.id}-${it.kind}-${it.startDate}`} className="hover:bg-slate-50/60">
                        <td className="px-3 py-2 font-semibold text-slate-700">{nameOf(it)}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{scopeOf(it)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatVND(it.amount)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                          {it.months}
                          {elapsed > 0 && <span className="block text-[11px] text-slate-400">đã qua {elapsed}</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{formatVND(depreciatedOf(it, today))}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">{formatVND(remainingOf(it, today))}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold text-indigo-700">{formatVND(it.monthlyAmount)}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-slate-200 bg-slate-50">
            <tr>
              <td colSpan={2} className="px-3 py-3 font-black text-slate-700">Tổng {items.length} khoản</td>
              <td className="px-3 py-3 text-right font-bold tabular-nums text-slate-700">{formatVND(parts.total)}</td>
              <td className="px-3 py-3" />
              <td className="px-3 py-3 text-right font-bold tabular-nums text-emerald-700">{formatVND(parts.depreciated)}</td>
              <td className="px-3 py-3 text-right font-black tabular-nums text-slate-900">{formatVND(parts.remaining)}</td>
              <td className="px-3 py-3 text-right font-black tabular-nums text-indigo-700">{formatVND(parts.monthly)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {Math.abs(parts.monthly - calc.monthlyRecovery) > items.length && (
        <div className="mt-3">
          <Note tone="amber">
            Cộng các khoản ra {formatVND(parts.monthly)}/tháng nhưng máy chủ tính {formatVND(calc.monthlyRecovery)}/tháng.
            Giá bên dưới vẫn theo số của máy chủ.
          </Note>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Dự phòng sửa chữa — ĐÃ nằm trong giá */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <p className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">Dự phòng sửa chữa sau bảo hành</p>
          <Line
            label="Cộng vào giá mỗi tháng"
            hint="Tính sẵn cho những tháng thiết bị đã hết bảo hành, để giá không phải tăng lúc hết bảo hành. Tỷ lệ chỉnh ở cấu hình giá."
            value={formatVND(reserve)}
            tone={reserve > 0 ? 'accent' : 'muted'}
          />
        </div>

        {/* Giá sàn so với đợt trước — BE hiện trả previousFloor = 0 nên thường ẩn */}
        {prevFloor > 0 && newFloor > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">So với đợt trước</p>
            {/* Giá sàn đợt trước tính theo cấu hình LÚC ĐÓ (chi phí vận hành, lương quản lý, chưa có dự phòng
                bảo hành), nên chênh lệch ở đây gồm cả thay đổi cấu hình — không chỉ do cải tạo. */}
            <p className="mb-1 text-[11px] leading-snug text-slate-400">
              {calc.pricingScope === 'ROOM' ? 'Cộng giá sàn mọi phòng. ' : ''}Chênh lệch gồm cả thay đổi chi phí vận hành, lương quản
              lý và dự phòng bảo hành kể từ lần duyệt trước, không chỉ riêng phần cải tạo.
            </p>
            <Line label="Giá sàn đợt trước" value={formatVND(prevFloor)} />
            <Line label="Giá sàn đợt này" value={formatVND(newFloor)} tone="accent" />
            <Divider />
            <Line
              label="Chênh lệch"
              formula={`${shortVND(newFloor)} − ${shortVND(prevFloor)}`}
              value={`${newFloor >= prevFloor ? '+' : '−'} ${formatVND(Math.abs(newFloor - prevFloor))} (${newFloor >= prevFloor ? '+' : '−'}${Math.abs(Math.round(((newFloor - prevFloor) / prevFloor) * 1000) / 10)}%)`}
              tone={newFloor > prevFloor ? 'bad' : 'good'}
            />
          </div>
        )}
      </div>

      {/* Phần công ty tự chịu — KHÔNG nằm trong giá */}
      {(equivalent > 0 || tenants.length > 0) && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-amber-800">
            <HandCoins className="h-4 w-4" /> Phần công ty tự chịu — không tính vào giá
          </p>
          {equivalent > 0 && (
            <Line
              label="Thay thiết bị hỏng bằng loại tương đương"
              hint="Chỉ giữ đúng chất lượng đã hứa với khách nên không tăng giá. Máy mới thế chỗ máy cũ, phần đắt hơn máy cũ (nếu có) đã tính thành khoản nâng cấp ở bảng trên."
              value={formatVND(equivalent)}
            />
          )}
          {tenants.length > 0 && (
            <>
              <p className="mt-2 text-xs leading-relaxed text-amber-900">
                Khách đang ở <b>giữ nguyên giá trong hợp đồng</b> tới hết hạn. Giá mới áp cho phòng trống, khách mới
                và khi gia hạn. Số dưới đây là ước tính theo giá sàn mới.
              </p>
              <div className="mt-2 overflow-x-auto rounded-lg border border-amber-200 bg-white">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-amber-50 text-[11px] uppercase tracking-wide text-amber-700">
                    <tr>
                      <th className="px-3 py-2 font-bold">{calc.pricingScope === 'ROOM' ? 'Phòng' : 'Căn'}</th>
                      <th className="px-3 py-2 text-right font-bold">Giá hợp đồng</th>
                      <th className="px-3 py-2 text-right font-bold">Giá sàn mới</th>
                      <th className="px-3 py-2 text-right font-bold">Còn</th>
                      <th className="px-3 py-2 text-right font-bold">Công ty chịu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {tenants.map((t, i) => (
                      <tr key={`${t.roomId ?? 'house'}-${i}`}>
                        <td className="px-3 py-2 font-semibold text-slate-700">
                          {t.roomId != null
                            ? (t.roomName ? `Phòng ${t.roomName}` : roomLabel(t.roomId) ?? `Phòng #${t.roomId}`)
                            : 'Cả căn'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatVND(t.contractPrice)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatVND(t.newFloorPrice)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{t.remainingMonths} tháng</td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums text-amber-800">{formatVND(t.absorbedAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {tenants.length > 1 && (
                    <tfoot className="border-t border-amber-200 bg-amber-50/60">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 font-black text-amber-900">Tổng</td>
                        <td className="px-3 py-2 text-right font-black tabular-nums text-amber-900">{formatVND(tenantsTotal)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </Panel>
  );
};
