import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowRight, ChevronDown, ChevronRight, Hammer, History, MapPin, Package, Wallet,
} from 'lucide-react';
import type { RenovationSession, SessionEquipmentResponse } from '@/types/api.types';

/**
 * LỊCH SỬ CẢI TẠO — TỔNG ĐẾN HIỆN TẠI (Admin).
 *
 * Xem theo từng đợt (v1, v2…) trả lời "đợt này làm gì". Nhưng câu hỏi hay gặp hơn lại là
 * "tới giờ căn này đã tốn bao nhiêu, cái gì đã làm mấy lần, trong nhà đang có những gì" — phải
 * mở từng đợt ra cộng tay mới biết. Màn này gộp mọi đợt lại:
 *
 *  1. Bốn con số tổng (bấm để xem tách theo đợt / theo loại).
 *  2. Dòng thời gian LŨY KẾ: mỗi đợt thêm bao nhiêu, cộng dồn tới đợt đó là bao nhiêu.
 *  3. Hạng mục cải tạo gộp theo danh mục: sơn sửa làm mấy lần, đợt nào, tổng bao nhiêu.
 *  4. Thiết bị theo vị trí: đang dùng cái gì, đã thay cái gì bằng cái gì.
 *
 * Lưu ý: thẻ cũ "Tổng chi phí tất cả đợt" cộng `session.totalCost` — BE chỉ tính HẠNG MỤC CẢI
 * TẠO vào đó, không có thiết bị mua. Ở đây cộng riêng hai phần cho khỏi hiểu nhầm.
 */

const formatVND = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;

export const AREA_LABEL: Record<string, string> = {
  LIVING_ROOM: 'Phòng khách', BEDROOM: 'Phòng ngủ', KITCHEN: 'Bếp', BATHROOM: 'Nhà tắm',
  BALCONY: 'Ban công', GARAGE: 'Nhà để xe', OTHER: 'Khu vực chung',
};

export const equipLoc = (e: { roomNumber?: string | null; houseArea?: string | null }): string =>
  e.roomNumber ? `Phòng ${e.roomNumber}` : e.houseArea ? (AREA_LABEL[e.houseArea] ?? e.houseArea) : 'Toàn nhà';

const versionOf = (s: RenovationSession) => s.versionLabel ?? `v${s.sessionNumber}`;

/** Thiết bị đã bị thay (không còn dùng). */
const isReplaced = (e: SessionEquipmentResponse) => e.operationalStatus === 'DISABLED' || e.currentEffective === false;

type Eq = SessionEquipmentResponse & { version: string; sessionNumber: number };

// ─── Mảnh giao diện ─────────────────────────────────────────────────────────

/** Thẻ số tổng — bấm để bung phần tách chi tiết ngay bên dưới. */
const SumCard = ({ label, value, sub, tone, icon: Icon, detail }: {
  label: string;
  value: string;
  sub: string;
  tone: 'amber' | 'indigo' | 'emerald' | 'slate';
  icon: typeof Wallet;
  detail: ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const cls = {
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    slate: 'border-slate-200 bg-white text-slate-700',
  }[tone];
  return (
    <div className={`rounded-2xl border ${cls}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        title={open ? 'Thu gọn' : 'Xem chi tiết'} className="group w-full p-4 text-left">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide opacity-70">
          <Icon className="h-3.5 w-3.5" /> {label}
          <ChevronDown className={`ml-auto h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} />
        </p>
        <p className="mt-1.5 text-xl font-black tabular-nums">{value}</p>
        <p className="mt-0.5 text-xs font-medium opacity-70">{sub}</p>
      </button>
      {open && (
        <div className="space-y-1 border-t border-current/10 bg-white/70 px-4 py-3 text-xs text-slate-600">
          {detail}
        </div>
      )}
    </div>
  );
};

/** Một dòng nhãn — số trong phần chi tiết. */
const Row = ({ label, value, strong, muted }: { label: ReactNode; value: ReactNode; strong?: boolean; muted?: boolean }) => (
  <div className={`flex items-baseline justify-between gap-3 ${strong ? 'border-t border-slate-200 pt-1.5 font-bold text-slate-800' : ''}`}>
    <span className={muted ? 'text-slate-400' : ''}>{label}</span>
    <span className={`shrink-0 tabular-nums ${muted ? 'text-slate-400' : ''}`}>{value}</span>
  </div>
);

const SectionTitle = ({ icon: Icon, children, hint }: { icon: typeof Wallet; children: ReactNode; hint?: string }) => (
  <div className="mb-2.5 px-1">
    <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800">
      <Icon className="h-4 w-4 text-amber-600" /> {children}
    </h4>
    {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
  </div>
);

// ─── Màn chính ──────────────────────────────────────────────────────────────

export const RenovationCumulativeView = ({ sessions }: { sessions: RenovationSession[] }) => {
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [openLocation, setOpenLocation] = useState<string | null>(null);

  const ordered = useMemo(() => [...sessions].sort((a, b) => a.sessionNumber - b.sessionNumber), [sessions]);

  const data = useMemo(() => {
    const allEq: Eq[] = ordered.flatMap((s) => (s.equipments ?? [])
      .filter((e) => e.source === 'PURCHASED')
      .map((e) => ({ ...e, version: versionOf(s), sessionNumber: s.sessionNumber })));

    // Dòng thời gian lũy kế
    let running = 0;
    const timeline = ordered.map((s) => {
      const reno = s.lines.reduce((sum, l) => sum + (l.cost || 0), 0);
      const eqs = (s.equipments ?? []).filter((e) => e.source === 'PURCHASED');
      const equip = eqs.reduce((sum, e) => sum + (e.price || 0), 0);
      running += reno + equip;
      return {
        session: s,
        reno, equip, added: reno + equip, cumulative: running,
        lineCount: s.lines.length, eqCount: eqs.length,
        date: fmtDate(s.endDate) ?? fmtDate(s.startDate),
        inProgress: !s.endDate && s.status !== 'DISABLED',
      };
    });

    // Hạng mục cải tạo gộp theo danh mục
    const catMap = new Map<string, {
      name: string; total: number;
      items: { version: string; cost: number; note?: string; date: string | null }[];
    }>();
    ordered.forEach((s) => s.lines.forEach((l) => {
      const key = l.categoryCode || l.categoryName;
      const entry = catMap.get(key) ?? { name: l.categoryName, total: 0, items: [] };
      entry.total += l.cost || 0;
      entry.items.push({ version: versionOf(s), cost: l.cost || 0, note: l.note, date: fmtDate(s.endDate) ?? fmtDate(s.startDate) });
      catMap.set(key, entry);
    }));
    const categories = [...catMap.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.total - a.total);

    // Thiết bị theo vị trí → theo loại thiết bị, giữ thứ tự đợt để thấy chuỗi thay thế
    const locMap = new Map<string, Eq[]>();
    allEq.forEach((e) => {
      const k = equipLoc(e);
      locMap.set(k, [...(locMap.get(k) ?? []), e]);
    });
    const locations = [...locMap.entries()]
      .map(([name, items]) => {
        const active = items.filter((e) => !isReplaced(e));
        const replaced = items.filter(isReplaced);
        const byCatalog = new Map<string, Eq[]>();
        items.forEach((e) => byCatalog.set(e.catalogName, [...(byCatalog.get(e.catalogName) ?? []), e]));
        return {
          name, items, active, replaced,
          activeValue: active.reduce((s, e) => s + (e.price || 0), 0),
          chains: [...byCatalog.entries()].map(([catalog, list]) => ({
            catalog,
            list: [...list].sort((a, b) => a.sessionNumber - b.sessionNumber),
          })),
        };
      })
      // Phòng trước (theo số), khu vực chung sau
      .sort((a, b) => {
        const ra = a.name.startsWith('Phòng '), rb = b.name.startsWith('Phòng ');
        if (ra !== rb) return ra ? -1 : 1;
        return a.name.localeCompare(b.name, 'vi', { numeric: true });
      });

    const renoTotal = timeline.reduce((s, t) => s + t.reno, 0);
    const equipTotal = timeline.reduce((s, t) => s + t.equip, 0);
    const activeEq = allEq.filter((e) => !isReplaced(e));
    const replacedEq = allEq.filter(isReplaced);

    return {
      timeline, categories, locations,
      renoTotal, equipTotal, grand: renoTotal + equipTotal,
      lineCount: ordered.reduce((s, x) => s + x.lines.length, 0),
      activeEq, replacedEq,
      activeValue: activeEq.reduce((s, e) => s + (e.price || 0), 0),
      replacedValue: replacedEq.reduce((s, e) => s + (e.price || 0), 0),
    };
  }, [ordered]);

  const last = data.timeline[data.timeline.length - 1];

  return (
    <div className="space-y-6">
      {/* ── 1. Bốn con số tổng ─────────────────────────────────────────────── */}
      <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SumCard label="Tổng vốn đến nay" icon={Wallet} tone="amber"
          value={formatVND(data.grand)}
          sub="cải tạo + thiết bị mua, mọi đợt"
          detail={(
            <>
              {data.timeline.map((t) => (
                <Row key={t.session.sessionNumber}
                  label={`Đợt ${versionOf(t.session)}: ${formatVND(t.reno)} cải tạo + ${formatVND(t.equip)} thiết bị`}
                  value={formatVND(t.added)} />
              ))}
              <Row strong label="Cộng" value={formatVND(data.grand)} />
            </>
          )} />
        <SumCard label="Cải tạo" icon={Hammer} tone="slate"
          value={formatVND(data.renoTotal)}
          sub={`${data.lineCount} hạng mục · ${data.categories.length} loại`}
          detail={data.categories.length === 0 ? <p>Chưa có hạng mục nào.</p> : (
            <>
              {data.categories.map((c) => (
                <Row key={c.key} label={`${c.name} × ${c.items.length} lần`} value={formatVND(c.total)} />
              ))}
              <Row strong label="Cộng" value={formatVND(data.renoTotal)} />
            </>
          )} />
        <SumCard label="Thiết bị mua" icon={Package} tone="indigo"
          value={formatVND(data.equipTotal)}
          sub={`${data.activeEq.length} đang dùng · ${data.replacedEq.length} đã thay`}
          detail={(
            <>
              <Row label={`Đang dùng (${data.activeEq.length} món)`} value={formatVND(data.activeValue)} />
              <Row label={`Đã thay thế (${data.replacedEq.length} món)`} value={formatVND(data.replacedValue)} muted />
              <Row strong label="Cộng đã mua" value={formatVND(data.equipTotal)} />
              <p className="pt-1 text-[11px] text-slate-400">
                Thiết bị đã thay vẫn tính vào tiền đã bỏ ra — tiền đó đã chi thật, chỉ là món đó không còn trong nhà.
              </p>
            </>
          )} />
        <SumCard label="Số đợt cải tạo" icon={History} tone="emerald"
          value={`${data.timeline.length} đợt`}
          sub={last?.date ? `gần nhất ${last.date}${last.inProgress ? ' · đang thi công' : ''}` : '—'}
          detail={(
            <>
              {data.timeline.map((t) => (
                <Row key={t.session.sessionNumber}
                  label={`Đợt ${versionOf(t.session)}${t.session.sessionNumber === 1 ? ' (tiếp nhận)' : ' (bổ sung)'}`}
                  value={t.inProgress ? 'đang thi công' : t.date ?? '—'} />
              ))}
            </>
          )} />
      </div>

      {/* ── 2. Dòng thời gian lũy kế ───────────────────────────────────────── */}
      <section>
        <SectionTitle icon={History} hint="Mỗi đợt thêm bao nhiêu, và cộng dồn tới đợt đó là bao nhiêu.">
          Dòng thời gian — lũy kế
        </SectionTitle>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Đợt</th>
                <th className="px-4 py-2.5">Ngày</th>
                <th className="px-4 py-2.5 text-right">Cải tạo</th>
                <th className="px-4 py-2.5 text-right">Thiết bị</th>
                <th className="px-4 py-2.5 text-right">Thêm đợt này</th>
                <th className="bg-amber-50/70 px-4 py-2.5 text-right text-amber-700">Lũy kế</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.timeline.map((t) => (
                <tr key={t.session.sessionNumber}>
                  <td className="px-4 py-2.5">
                    <span className="font-bold text-slate-800">{versionOf(t.session)}</span>
                    <span className="ml-1.5 text-xs text-slate-400">
                      {t.session.sessionNumber === 1 ? 'tiếp nhận' : 'bổ sung'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {t.inProgress ? <span className="font-bold text-amber-600">Đang thi công</span> : t.date ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                    {formatVND(t.reno)} <span className="text-[11px] text-slate-400">({t.lineCount})</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                    {formatVND(t.equip)} <span className="text-[11px] text-slate-400">({t.eqCount})</span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-800">+{formatVND(t.added)}</td>
                  <td className="bg-amber-50/40 px-4 py-2.5 text-right font-black tabular-nums text-amber-700">{formatVND(t.cumulative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 3. Hạng mục cải tạo gộp theo danh mục ──────────────────────────── */}
      <section>
        <SectionTitle icon={Hammer} hint="Gộp mọi đợt theo loại hạng mục. Bấm một dòng để xem từng lần làm.">
          Hạng mục cải tạo — gộp theo loại
        </SectionTitle>
        {data.categories.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">Chưa có hạng mục cải tạo nào</p>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {data.categories.map((c) => {
              const open = openCategory === c.key;
              return (
                <div key={c.key}>
                  <button type="button" onClick={() => setOpenCategory(open ? null : c.key)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50">
                    {open ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />}
                    <span className="font-semibold text-slate-800">{c.name}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                      {c.items.length} lần · {[...new Set(c.items.map((i) => i.version))].join(', ')}
                    </span>
                    <span className="ml-auto font-bold tabular-nums text-amber-700">{formatVND(c.total)}</span>
                  </button>
                  {open && (
                    <div className="space-y-1.5 bg-slate-50/70 px-4 pb-3 pl-11 pt-1">
                      {c.items.map((i, idx) => (
                        <div key={idx} className="flex items-baseline justify-between gap-3 text-xs">
                          <span className="min-w-0 text-slate-600">
                            <b className="text-slate-700">{i.version}</b>
                            {i.date && <span className="text-slate-400"> · {i.date}</span>}
                            {i.note && <span className="text-slate-500"> — {i.note}</span>}
                          </span>
                          <span className="shrink-0 tabular-nums font-semibold text-slate-700">{formatVND(i.cost)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── 4. Thiết bị theo vị trí ────────────────────────────────────────── */}
      <section>
        <SectionTitle icon={MapPin} hint="Hiện trạng thiết bị mua ở từng vị trí, gộp mọi đợt. Bấm một vị trí để xem đã thay cái gì bằng cái gì.">
          Thiết bị theo vị trí — hiện trạng
        </SectionTitle>
        {data.locations.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-400">Chưa mua thiết bị nào</p>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {data.locations.map((loc) => {
              const open = openLocation === loc.name;
              return (
                <div key={loc.name}>
                  <button type="button" onClick={() => setOpenLocation(open ? null : loc.name)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50">
                    {open ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />}
                    <span className="w-28 shrink-0 font-semibold text-slate-800">{loc.name}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
                      {(() => {
                        // Gộp trùng tên: "Máy giặt · Máy giặt" → "Máy giặt ×2"
                        const count = new Map<string, number>();
                        loc.active.forEach((e) => count.set(e.catalogName, (count.get(e.catalogName) ?? 0) + 1));
                        return [...count.entries()].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(' · ');
                      })() || 'Không còn thiết bị đang dùng'}
                    </span>
                    {loc.replaced.length > 0 && (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                        {loc.replaced.length} đã thay
                      </span>
                    )}
                    <span className="shrink-0 font-bold tabular-nums text-slate-700">{formatVND(loc.activeValue)}</span>
                  </button>
                  {open && (
                    <div className="space-y-2 bg-slate-50/70 px-4 pb-3 pl-11 pt-1">
                      {loc.chains.map((ch) => (
                        <div key={ch.catalog} className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="w-24 shrink-0 font-semibold text-slate-700">{ch.catalog}</span>
                          {ch.list.map((e, i) => (
                            <span key={e.id} className="flex items-center gap-1.5">
                              {i > 0 && <ArrowRight className="h-3 w-3 text-slate-300" />}
                              <span className={`rounded-lg border px-2 py-1 ${isReplaced(e)
                                ? 'border-slate-200 bg-white text-slate-400 line-through'
                                : 'border-emerald-200 bg-emerald-50 font-semibold text-emerald-700'}`}>
                                {e.version} · {formatVND(e.price)}
                                {e.warrantyEndDate && !isReplaced(e) && (
                                  <span className="ml-1 font-normal no-underline text-emerald-600/80">· BH đến {fmtDate(e.warrantyEndDate)}</span>
                                )}
                              </span>
                            </span>
                          ))}
                        </div>
                      ))}
                      <p className="pt-1 text-[11px] text-slate-400">
                        Gạch ngang = đã thay thế · xanh = đang dùng. Cùng loại mua nhiều cái ở cùng vị trí thì hiện theo thứ tự đợt.
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
