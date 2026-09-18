import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle, ArrowLeft, Calculator, CheckCircle2, Cloud, DollarSign,
  HardDrive, Loader2, Pencil, Percent, Save, ShieldCheck, Target, TrendingUp,
  UserCog, Wallet,
} from 'lucide-react';
import {
  DEFAULT_PRICING_CONFIG, blendedManagerCost, contractEscalationSchedule, costPerPropertyOf,
  managerPayroll, priceYearOf, pricingConfigService, propertyCountByManager, quotedPriceOn,
  totalOpex,
  type ManagerPayroll, type PricingConfig, type PricingConfigSource, type ZoneManagerLink,
} from '@/services/pricingConfig.service';
import { propertyService } from '@/services/property.service';
import { zoneAssignmentService } from '@/services/zoneAssignment.service';
import { todayIso } from '@/utils/serverTime';
import { ExplainFormula, Explainer } from '@/pages/host/review/pricingBreakdown';

/**
 * CẤU HÌNH DUYỆT GIÁ — một lần, dùng cho MỌI căn nhà.
 *
 * Vì sao tách khỏi màn duyệt giá: bốn con số mục tiêu (lãi, chi phí, biên trống phòng) là
 * **chính sách kinh doanh của cả công ty**, không phải thuộc tính của từng căn. Để chúng
 * nằm trong màn duyệt giá thì Host phải gõ lại ở từng căn, và chỉ cần lệch một lần là hai
 * căn giống hệt nhau ra hai mức giá khác nhau mà không ai giải thích được.
 *
 * Chốt ở đây, màn duyệt giá chỉ ĐỌC XUỐNG và hiện lại — Host bấm duyệt chứ không gõ số nữa.
 *
 * Trang này cố tình hiện luôn con số suy ra (lương phân bổ mỗi nhà, tổng chi phí vận hành
 * thực gửi lên máy chủ) ngay cạnh ô nhập: người nhập phải thấy hệ quả của thứ mình gõ
 * TRƯỚC khi bấm lưu, chứ không phải đi mò lại ở màn duyệt giá của từng căn.
 */

const formatVND = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

const MoneyInput = ({ value, onChange, placeholder }: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
}) => (
  <div className="relative">
    <input
      type="text"
      inputMode="numeric"
      value={value === 0 ? '' : value.toLocaleString('vi-VN')}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value.replace(/\./g, '').replace(/[^0-9]/g, '');
        onChange(raw === '' ? 0 : Number(raw));
      }}
      className="input-field pr-8 text-right font-bold tabular-nums"
    />
    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">đ</span>
  </div>
);

const Field = ({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) => (
  <label className="block">
    <span className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</span>
    {children}
    {hint && <p className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</p>}
  </label>
);

/**
 * Diễn giải biên trống phòng — số liệu lấy từ chính cấu hình đang gõ, không phải ví dụ chế.
 *
 * Chỗ dễ hiểu sai nhất: máy chủ CHIA cho (1 − v) chứ không CỘNG v% (PricingCalculator
 * .applyVacancyBuffer bên BE). Để 10% thì giá thật tăng 11,1%. Bản cũ ghi "cộng thêm 10%
 * vào giá" nên Host đọc số nào cũng thấy lệch.
 */
const VacancyMath = ({ cfg, opex }: { cfg: PricingConfig; opex: number }) => {
  const v = cfg.vRatePct / 100;
  const profit = cfg.mode === 'FORWARD' ? cfg.pDesired : 0;
  const known = opex + profit;
  const grossed = v < 1 ? known / (1 - v) : 0;
  const uplift = grossed - known;
  const upliftPct = known > 0 ? (uplift / known) * 100 : 0;

  return (
    <>
      <ExplainFormula>
        Giá đề xuất = (Chi phí cố định mỗi tháng + Lãi mục tiêu) ÷ (100% − {cfg.vRatePct}%)
      </ExplainFormula>

      <p>
        Chi phí cố định của một căn gồm <b>khấu hao vốn</b> (tiền thuê chủ nhà, cải tạo, thiết bị
        chia đều số tháng còn khai thác), <b>dự phòng sửa chữa</b> và <b>chi phí vận hành</b>. Hai
        khoản đầu khác nhau ở từng căn nên chỉ hiện lúc duyệt giá; phần chốt chung ở trang này là
        chi phí vận hành {formatVND(opex)}
        {cfg.mode === 'FORWARD' && <> và lãi mục tiêu {formatVND(cfg.pDesired)}</>}.
      </p>

      {cfg.vRatePct > 0 ? (
        <>
          <p className="font-semibold text-slate-700">Tính thử trên phần đã biết:</p>
          <ExplainFormula>
            {formatVND(known)} ÷ {(1 - v).toFixed(2).replace('.', ',')} = {formatVND(Math.round(grossed))}
            <br />
            phần bù trống phòng: {formatVND(Math.round(uplift))} (+{upliftPct.toFixed(1).replace('.', ',')}%)
          </ExplainFormula>
          <p>
            <b>Chia chứ không cộng.</b> Để trống {cfg.vRatePct}% số tháng nghĩa là cả kỳ chỉ thu được{' '}
            {100 - cfg.vRatePct}% số tháng, nên phải chia cho {(1 - v).toFixed(2).replace('.', ',')} thì
            tiền thu thực tế mới đủ. Cộng thẳng {cfg.vRatePct}% vào giá sẽ thiếu — giá đúng phải cao hơn{' '}
            {upliftPct.toFixed(1).replace('.', ',')}%.
          </p>
        </>
      ) : (
        <p>Đang để <b>0%</b> — giá không cộng đồng nào cho tháng trống, cứ một tháng không có khách
          là lỗ đúng phần chi phí tháng đó.</p>
      )}

      <p className="text-slate-500">
        Biên này áp cho <b>mọi căn</b>, cả giá sàn lẫn giá đề xuất. Máy chủ chặn từ 100% trở lên
        (chia cho 0). Sửa xong nhớ bấm Lưu, và giá của các căn đã duyệt chỉ đổi khi bấm tính lại.
      </p>
    </>
  );
};

const Card = ({ title, icon: Icon, children, tone = 'plain' }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  tone?: 'plain' | 'accent';
}) => (
  <section className={`rounded-2xl border bg-white p-5 shadow-sm ${
    tone === 'accent' ? 'border-indigo-200' : 'border-slate-200'
  }`}>
    <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
      <Icon className={`h-4 w-4 ${tone === 'accent' ? 'text-indigo-600' : 'text-slate-400'}`} />
      {title}
    </h2>
    {children}
  </section>
);

const ModeBtn = ({ active, onClick, icon: Icon, label, sub }: {
  active: boolean; onClick: () => void; icon: React.ElementType; label: string; sub: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-xl border-2 px-3 py-2.5 text-left transition ${
      active ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'
    }`}
  >
    <Icon className={`mb-1 h-4 w-4 ${active ? 'text-indigo-600' : 'text-slate-400'}`} />
    <p className={`text-sm font-bold ${active ? 'text-indigo-700' : 'text-slate-700'}`}>{label}</p>
    <p className="text-[11px] text-slate-500">{sub}</p>
  </button>
);

/** Cấu hình đang nằm ở đâu — nói thẳng, vì "chỉ lưu ở máy này" là một hạn chế thật. */
const SourceBadge = ({ source }: { source: PricingConfigSource }) => {
  const meta = {
    server: { icon: Cloud, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', text: 'Đã đồng bộ máy chủ' },
    local: { icon: HardDrive, cls: 'bg-amber-50 text-amber-700 border-amber-200', text: 'Chỉ lưu trên máy này' },
    default: { icon: AlertTriangle, cls: 'bg-slate-50 text-slate-600 border-slate-200', text: 'Chưa cấu hình' },
  }[source];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${meta.cls}`}>
      <Icon className="h-3.5 w-3.5" />{meta.text}
    </span>
  );
};

export const PricingConfigPage = () => {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState<PricingConfig>(DEFAULT_PRICING_CONFIG);
  const [source, setSource] = useState<PricingConfigSource>('default');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** Quản lý THẬT của hệ thống + số nhà mỗi người đang phụ trách. */
  const [managers, setManagers] = useState<{ id: string; fullName: string }[]>([]);
  const [propsByManager, setPropsByManager] = useState<Record<string, number>>({});
  /** Khu vực từng người đang phụ trách — hiện dưới tên để Host biết ai coi vùng nào. */
  const [zonesByManager, setZonesByManager] = useState<Map<string, string[]>>(new Map());
  /** Ô thử lịch tăng giá — mặc định lấy hôm nay theo giờ máy chủ, giá tròn 10tr cho dễ đọc. */
  const [tryStart, setTryStart] = useState(() => todayIso());
  const [tryPrice, setTryPrice] = useState(10_000_000);

  useEffect(() => {
    let alive = true;
    Promise.all([
      pricingConfigService.load(),
      // Danh sách quản lý lấy từ hệ thống, KHÔNG cho Host tự gõ tên: gõ tay thì tên lệch
      // với tài khoản thật và không cách nào biết căn nào do ai phụ trách.
      propertyService.getManagers().catch(() => [] as { id: string; fullName: string; username: string }[]),
      propertyService.getAllProperties().catch(() => null),
      // Số nhà mỗi người phụ trách đếm THEO KHU VỰC, không theo `operationManagerId`:
      // nhà chỉ nhận id quản lý sau khi Host duyệt giá, nên đếm kiểu kia sẽ bỏ sót toàn bộ
      // nhà đang chờ duyệt — mẫu số thiếu thì lương chia ra cao hơn thực tế.
      zoneAssignmentService.list().catch(() => [] as ZoneManagerLink[]),
    ]).then(([{ config, source: s }, mgrs, page, links]) => {
      if (!alive) return;
      setCfg(config);
      setSource(s);
      setManagers(mgrs.map((m) => ({ id: m.id, fullName: m.fullName })));
      setPropsByManager(propertyCountByManager(links, page ?? []));
      const zones = new Map<string, string[]>();
      links.forEach((l) => {
        zones.set(l.managerId, [...(zones.get(l.managerId) ?? []), l.zoneName || l.zoneId]);
      });
      setZonesByManager(zones);
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const set = <K extends keyof PricingConfig>(key: K, value: PricingConfig[K]) =>
    setCfg((c) => ({ ...c, [key]: value }));

  const handleSave = async () => {
    if (cfg.mode === 'FORWARD' && cfg.pDesired <= 0) {
      toast.error('Nhập tiền lãi muốn thu mỗi tháng (lớn hơn 0).');
      return;
    }
    if (cfg.mode === 'REVERSE' && cfg.roiExpected <= 0) {
      toast.error('Nhập tỷ lệ sinh lời mong muốn mỗi năm (lớn hơn 0%).');
      return;
    }
    setSaving(true);
    const where = await pricingConfigService.save(cfg);
    setSource(where);
    setSaving(false);
    toast.success(where === 'server'
      ? 'Đã lưu cấu hình lên máy chủ — mọi màn duyệt giá dùng số này.'
      : 'Đã lưu trên máy này. Máy chủ chưa nhận được — xem cảnh báo bên dưới.');
  };

  const payroll: ManagerPayroll[] = managerPayroll(cfg, managers, (id) => propsByManager[id] ?? 0);
  /** Bình quân toàn hệ thống — dùng cho căn mà khu vực chưa có quản lý. */
  const blended = blendedManagerCost(payroll);
  const opex = totalOpex(cfg, blended);
  const totalSalary = payroll.reduce((s, m) => s + m.salary, 0);
  /** Có lương nhưng chưa phụ trách nhà nào — lương đó chưa vào giá của căn nào cả. */
  const idlePaid = payroll.filter((m) => m.salary > 0 && m.propertyCount === 0);

  const trySchedule = contractEscalationSchedule(
    new Date(`${tryStart}T00:00:00`),
    tryPrice,
    cfg.annualIncreasePct,
    cfg.escalationGraceMonths,
    3,
  );
  /** Giá quản lý phải báo cho khách ký vào ngày đang thử. */
  const tryQuoted = quotedPriceOn(
    tryPrice, cfg.annualIncreasePct, new Date(`${tryStart}T00:00:00`).getFullYear(),
    new Date(`${tryStart}T00:00:00`), cfg.newYearPriceLeadMonths,
  );
  const tryPriceYear = priceYearOf(new Date(`${tryStart}T00:00:00`), cfg.newYearPriceLeadMonths);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Đang tải cấu hình…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl pb-16">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900">Cấu hình duyệt giá</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Áp dụng cho <b>tất cả</b> căn nhà. Màn duyệt giá của từng căn sẽ dùng đúng những
            số này — không phải nhập lại ở đó nữa.
          </p>
        </div>
        <SourceBadge source={source} />
      </div>

      {source === 'local' && (
        <div className="mb-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-800">
            <p className="font-bold">Cấu hình chỉ đang nằm trên trình duyệt này.</p>
            <p className="mt-0.5 leading-relaxed">
              Máy chủ chưa có nơi lưu cấu hình duyệt giá (endpoint đang chờ Backend làm). Đổi máy,
              đổi trình duyệt hoặc xoá dữ liệu duyệt web là mất. Khi Backend hoàn thành, trang này
              tự chuyển sang dùng máy chủ, không cần làm gì thêm.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,320px)]">
        <div className="space-y-5">
          {/* ── 1. Mục tiêu lợi nhuận ─────────────────────────────────────── */}
          <Card title="Mục tiêu lợi nhuận" icon={Target} tone="accent">
            <p className="mb-2 text-sm font-bold text-slate-700">Định giá theo cách nào?</p>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <ModeBtn active={cfg.mode === 'FORWARD'} onClick={() => set('mode', 'FORWARD')}
                icon={DollarSign} label="Theo tiền lãi" sub="Biết muốn lãi/tháng" />
              <ModeBtn active={cfg.mode === 'REVERSE'} onClick={() => set('mode', 'REVERSE')}
                icon={Percent} label="Theo % sinh lời" sub="Biết % lời/năm" />
            </div>

            {cfg.mode === 'FORWARD' ? (
              <Field
                label="Tiền lãi muốn thu mỗi tháng"
                hint={<>Tiền lời <b>thực nhận</b> mỗi tháng của <b>mỗi căn</b>, sau khi đã trừ chi phí
                  vận hành và phần thu hồi vốn.</>}
              >
                <MoneyInput value={cfg.pDesired} onChange={(v) => set('pDesired', v)} placeholder="VD: 10.000.000" />
              </Field>
            ) : (
              <Field
                label="Tỷ lệ sinh lời mong muốn mỗi năm"
                hint="Phần trăm lời trên tổng vốn đầu tư của từng căn, tính theo năm."
              >
                <div className="relative">
                  <input type="number" min={0} value={cfg.roiExpected || ''} placeholder="VD: 15"
                    onChange={(e) => set('roiExpected', e.target.value === '' ? 0 : Number(e.target.value))}
                    className="input-field pr-10 text-right font-bold tabular-nums" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">%</span>
                </div>
              </Field>
            )}
          </Card>

          {/* ── 2. Chi phí vận hành ───────────────────────────────────────── */}
          <Card title="Chi phí vận hành mỗi tháng" icon={Wallet}>
            <div className="space-y-4">
              <Field
                label="Chi phí vận hành khác (không gồm lương quản lý)"
                hint="Internet, vệ sinh, bảo trì định kỳ… — tiền mặt chi ra hằng tháng cho mỗi căn."
              >
                <MoneyInput value={cfg.oOperation} onChange={(v) => set('oOperation', v)} placeholder="0" />
              </Field>

              {/* ── Lương từng quản lý — CHỈ ĐỌC ──────────────────────────
                  Sửa lương ở /host/manager-salaries. Tách ra vì hai thứ có nhịp sống khác
                  hẳn: mục tiêu lợi nhuận vài tháng mới đụng, còn lương đổi theo nhân sự.
                  Để chung thì mỗi lần chỉnh lương lại phải mở đúng trang đang giữ những con
                  số quyết định giá của cả hệ thống — rất dễ sửa nhầm. */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                    <UserCog className="h-4 w-4 text-slate-400" /> Lương quản lý vận hành
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/host/manager-salaries')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-bold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50"
                  >
                    <Pencil className="h-3 w-3" /> Sửa bảng lương
                  </button>
                </div>
                <p className="mb-3 text-xs leading-relaxed text-slate-500">
                  Chỉ hiển thị để đối chiếu. Mỗi căn gánh <b>lương ÷ số nhà</b> người đó đang phụ trách.
                </p>

                {payroll.filter((m) => m.salary > 0).length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-xs text-slate-400">
                    Chưa nhập lương cho quản lý nào — mở <b>Sửa bảng lương</b> để nhập.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[380px] text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                          <th className="pb-2 text-left font-bold">Quản lý</th>
                          <th className="pb-2 text-right font-bold">Lương / tháng</th>
                          <th className="pb-2 text-right font-bold">Đang coi</th>
                          <th className="pb-2 text-right font-bold">Mỗi nhà gánh</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {payroll.filter((m) => m.salary > 0).map((m) => (
                          <tr key={m.managerId}>
                            <td className="py-2 pr-3">
                              <p className="font-bold text-slate-800">{m.fullName}</p>
                              <p className="text-[11px] text-slate-400">
                                {zonesByManager.get(m.managerId)?.join(', ') || 'chưa phụ trách khu vực'}
                              </p>
                            </td>
                            <td className="py-2 pl-3 text-right font-bold tabular-nums text-slate-700">
                              {formatVND(m.salary)}
                            </td>
                            <td className="py-2 pl-3 text-right font-bold tabular-nums text-slate-700">
                              {m.propertyCount}
                            </td>
                            <td className="py-2 pl-3 text-right font-black tabular-nums text-indigo-700">
                              {m.propertyCount > 0 ? formatVND(costPerPropertyOf(m)) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-slate-200 text-sm">
                          <td className="pt-2 font-bold text-slate-700">Bình quân mỗi nhà</td>
                          <td className="pt-2 text-right font-bold tabular-nums text-slate-700">
                            {formatVND(totalSalary)}
                          </td>
                          <td className="pt-2 text-right font-bold tabular-nums text-slate-700">
                            {payroll.reduce((s, m) => s + m.propertyCount, 0)}
                          </td>
                          <td className="pt-2 text-right font-black tabular-nums text-indigo-700">
                            {formatVND(blended)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {idlePaid.length > 0 && (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                    <b>{idlePaid.map((m) => m.fullName).join(', ')}</b> có lương nhưng chưa phụ trách nhà
                    nào — công ty đang tự chịu{' '}
                    <b>{formatVND(idlePaid.reduce((s, m) => s + m.salary, 0))}/tháng</b>.
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* ── 3. Tăng giá theo năm ──────────────────────────────────────── */}
          <Card title="Tăng giá thuê hằng năm" icon={TrendingUp}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Tăng mỗi năm dương lịch"
                hint={<>Áp vào <b>01/01</b>, cộng dồn. Để 0 nếu không tăng.</>}
              >
                <div className="relative">
                  <input type="number" min={0} max={100} step={0.5} value={cfg.annualIncreasePct}
                    onChange={(e) => set('annualIncreasePct', Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                    className="input-field pr-10 text-right font-bold tabular-nums" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">%</span>
                </div>
              </Field>
              <Field
                label="Ân hạn cho khách mới"
                hint={<>Tính tới 01/01 mà thuê chưa đủ bấy nhiêu tháng thì <b>hoãn</b> kỳ đó sang năm sau.</>}
              >
                <div className="relative">
                  <input type="number" min={0} max={24} value={cfg.escalationGraceMonths}
                    onChange={(e) => set('escalationGraceMonths', Math.min(24, Math.max(0, Number(e.target.value) || 0)))}
                    className="input-field pr-16 text-right font-bold tabular-nums" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">tháng</span>
                </div>
              </Field>
              <Field
                label="Báo giá năm sau trước"
                hint={<>Từ mốc này quản lý chốt giá với khách theo mức <b>năm sau</b>.</>}
              >
                <div className="relative">
                  <input type="number" min={0} max={11} value={cfg.newYearPriceLeadMonths}
                    onChange={(e) => set('newYearPriceLeadMonths', Math.min(11, Math.max(0, Number(e.target.value) || 0)))}
                    className="input-field pr-16 text-right font-bold tabular-nums" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">tháng</span>
                </div>
              </Field>
            </div>

            {/* Hai ô trên trông giống nhau (đều là "mấy tháng") nhưng làm hai việc khác hẳn.
                Không nói rõ thì kiểu gì cũng có người sửa nhầm ô. */}
            <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
              <b>Ân hạn</b> quyết định <u>ai được miễn</u> kỳ tăng 01/01 — để {cfg.escalationGraceMonths} thì
              ai ký từ <b>02/{`0${12 - cfg.escalationGraceMonths}`.slice(-2)}</b> trở đi được hoãn sang năm
              sau. <b>Báo giá năm sau</b> quyết định <u>quản lý báo con số nào</u> khi đi chốt giá cuối
              năm — không liên quan tới việc tăng.
            </p>

            {/* Điều kiện pháp lý — KHÔNG được để lẫn vào chú thích nhỏ. Tăng giá khách đang
                thuê chỉ hợp lệ khi hợp đồng đã ghi sẵn điều khoản đó. */}
            <div className="mt-3 flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
              <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600" />
              <div className="text-xs leading-relaxed text-amber-900">
                <p className="font-bold">Điều khoản này phải có trong hợp đồng khách ký.</p>
                <p className="mt-0.5">
                  Hợp đồng chỉ ghi mỗi &quot;10.000.000 đ/tháng&quot; rồi sau đó báo tăng là <b>sửa hợp
                  đồng đơn phương</b> — khách có quyền từ chối. Mẫu hợp đồng phải in rõ mức tăng
                  ({cfg.annualIncreasePct}%/năm) và mốc tăng (01/01) để khách đọc trước khi ký.
                </p>
              </div>
            </div>

            {/* Ô thử: gõ ngày bắt đầu thuê bất kỳ, xem ngay kỳ nào tăng kỳ nào hoãn.
                Quy tắc ân hạn tính theo NGÀY nên "thuê tháng 7" chưa đủ để kết luận —
                01/07 thì tròn 6 tháng nên tăng, 15/07 thì chưa đủ nên hoãn. Bắt Host tự
                nhẩm chỗ này là kiểu gì cũng có người hiểu nhầm. */}
            {cfg.annualIncreasePct > 0 && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex flex-wrap items-end gap-3">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      Thử: khách bắt đầu thuê
                    </span>
                    <input
                      type="date"
                      value={tryStart}
                      onChange={(e) => setTryStart(e.target.value)}
                      className="input-field py-1.5 text-sm font-bold"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      Giá lúc ký
                    </span>
                    <div className="w-40">
                      <MoneyInput value={tryPrice} onChange={setTryPrice} />
                    </div>
                  </label>
                </div>

                <div className="space-y-1">
                  <div className="flex items-baseline justify-between rounded-lg bg-indigo-50 px-2 py-1.5 text-xs">
                    <span className="font-bold text-indigo-800">
                      Quản lý báo khách giá này
                      <span className="ml-1 font-medium text-indigo-500">(giá năm {tryPriceYear})</span>
                    </span>
                    <span className="font-black tabular-nums text-indigo-800">{formatVND(tryQuoted)}</span>
                  </div>
                  {trySchedule.map((s) => (
                    <div key={s.year} className="flex items-baseline justify-between text-xs">
                      <span className={s.applied ? 'text-slate-600' : 'text-slate-400'}>
                        01/01/{s.year}
                        {s.applied
                          ? <span className="ml-1 text-emerald-600">· tăng</span>
                          : <span className="ml-1">· không tăng ({s.skipReason})</span>}
                      </span>
                      <span className={`font-bold tabular-nums ${s.applied ? 'text-slate-800' : 'text-slate-400'}`}>
                        {formatVND(s.price)}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  Kỳ bị hoãn là <b>bỏ hẳn</b>, không nợ rồi trả bù vào năm sau. Lãi kép chỉ nhân trên
                  những kỳ thật sự tăng.
                </p>
              </div>
            )}

            {/* BE đã chạy thật từ 26/08/2026: cron 01/01 áp tăng (có ân hạn + chống áp trùng
                theo `lastEscalationYear`), điều khoản in vào file hợp đồng, và báo khách
                trước 15 ngày. Nói rõ là ĐANG CHẠY, vì đây là thứ đụng vào tiền của khách. */}
            <div className="mt-3 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
              <p className="text-xs leading-relaxed text-emerald-900">
                <b>Đang chạy thật.</b> Hệ thống tự tăng giá vào 01/01 hằng năm, bỏ qua khách còn
                trong ân hạn, và <b>báo cho khách trước 15 ngày</b>. Điều khoản được in sẵn vào file
                hợp đồng. Sửa ở đây là đổi chính sách cho các hợp đồng ký sau khi lưu.
              </p>
            </div>
          </Card>

          {/* ── 4. Dự phòng ───────────────────────────────────────────────── */}
          <Card title="Dự phòng rủi ro" icon={Calculator}>
            <div className="space-y-4">
              <div>
                <Field
                  label="Biên dự phòng trống phòng"
                  hint={<>Bù những tháng phòng bỏ trống. Thường để 10%.</>}
                >
                  <div className="relative">
                    <input type="number" min={0} max={99} value={cfg.vRatePct}
                      onChange={(e) => set('vRatePct', Math.min(99, Math.max(0, Number(e.target.value) || 0)))}
                      className="input-field pr-10 text-right font-bold tabular-nums" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">%</span>
                  </div>
                </Field>
                <Explainer className="mt-2" title={`Cách ${cfg.vRatePct}% này vào giá`}>
                  <VacancyMath cfg={cfg} opex={opex} />
                </Explainer>
              </div>

              <Field
                label="Trừ cửa sổ bàn giao cuối kỳ"
                hint={<>Số tháng cuối hợp đồng chủ nhà <b>không tính doanh thu</b>: khách dọn đi, tháo
                  nội thất, sơn sửa hoàn trả hiện trạng — nhà trống, không thu được tiền. Để 0 nếu
                  không cần chừa tháng nào.</>}
              >
                <div className="relative">
                  <input type="number" min={0} max={12} value={cfg.handoverBufferMonths}
                    onChange={(e) => set('handoverBufferMonths', Math.min(12, Math.max(0, Number(e.target.value) || 0)))}
                    className="input-field pr-16 text-right font-bold tabular-nums" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">tháng</span>
                </div>
              </Field>

              {/* BE nhận `handoverBufferMonths` từ 26/08/2026. Nhưng chốt chặn hợp đồng ngắn
                  vẫn còn, và đó là chỗ Host dễ tưởng hệ thống bỏ qua số mình chọn. */}
              <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <ShieldCheck className="h-4 w-4 shrink-0 text-slate-400" />
                <p className="text-xs leading-relaxed text-slate-600">
                  Máy chủ đã nhận số này khi tính giá. Riêng hợp đồng còn <b>dưới 6 tháng</b> khai
                  thác thì vẫn không trừ tháng nào — trừ 1 tháng trên 3 tháng là mất 1/3 thời gian
                  thu tiền, nên chốt chặn đó giữ nguyên dù bạn chọn bao nhiêu.
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* ── Cột phải: hệ quả + nút lưu ───────────────────────────────────── */}
        <div className="lg:sticky lg:top-5 lg:self-start">
          <Card title="Máy chủ sẽ nhận" icon={CheckCircle2} tone="accent">
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-600">Cách định giá</dt>
                <dd className="font-bold text-slate-900">
                  {cfg.mode === 'FORWARD' ? 'Theo tiền lãi' : 'Theo % sinh lời'}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-600">{cfg.mode === 'FORWARD' ? 'Lãi mục tiêu / tháng' : 'ROI mục tiêu / năm'}</dt>
                <dd className="font-bold tabular-nums text-slate-900">
                  {cfg.mode === 'FORWARD' ? formatVND(cfg.pDesired) : `${cfg.roiExpected}%`}
                </dd>
              </div>
              <div className="border-t border-slate-100 pt-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-slate-600">Chi phí vận hành khác</dt>
                  <dd className="tabular-nums text-slate-700">{formatVND(cfg.oOperation)}</dd>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-3">
                  <dt className="text-slate-600">+ Lương QL (bình quân)</dt>
                  <dd className="tabular-nums text-slate-700">{formatVND(blended)}</dd>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-dashed border-slate-200 pt-1.5">
                  <dt className="font-semibold text-slate-700">Tổng chi phí / tháng</dt>
                  <dd className="font-black tabular-nums text-indigo-700">{formatVND(opex)}</dd>
                </div>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-slate-100 pt-2.5">
                <dt className="text-slate-600">Biên trống phòng</dt>
                <dd className="font-bold tabular-nums text-slate-900">{cfg.vRatePct}%</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-600">Cửa sổ bàn giao</dt>
                <dd className="font-bold tabular-nums text-slate-400">−{cfg.handoverBufferMonths} tháng</dd>
              </div>
            </dl>

            <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              Máy chủ chỉ có một ô chi phí vận hành, nên lương quản lý được cộng gộp vào trước khi
              gửi. Tách hai dòng ở đây là để bạn nhìn thấy tiền đi đâu.
            </p>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Đang lưu…' : 'Lưu cấu hình'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/host/properties')}
              className="mt-2 flex w-full items-center justify-center gap-1.5 text-xs font-bold text-slate-500 transition hover:text-indigo-600"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Về danh sách bất động sản
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
};
