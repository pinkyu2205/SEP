import type { ReactNode } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import type { PricingCalculationResponse } from '@/types/api.types';

/**
 * Khối "bóc tách con số" của màn Duyệt giá — tách riêng vì đây mới là phần Host thật sự
 * đọc, và nó dài hơn cả phần còn lại của trang.
 *
 * Nguyên tắc: **mọi con số hiện ra đều phải nói được nó từ đâu mà có.** Host đang ký một
 * quyết định giá trị vài trăm triệu; đưa ra một con số "giá đề xuất" trần trụi rồi bắt bấm
 * Xác nhận là bắt người ta tin vào hộp đen. Nên mỗi dòng kết quả đều kèm phép tính bằng
 * đúng những số đã hiện ở trên.
 *
 * ⚠️ Công thức ở đây là FE **kiểm chứng lại** kết quả BE, không phải FE tự tính rồi hiển
 * thị. `verify()` so số mình suy ra với số BE trả: khớp thì hiện phép tính, lệch thì im
 * lặng bỏ phép tính đi (vẫn hiện số của BE). Làm vậy để nếu BE đổi công thức mà FE chưa
 * biết thì trang không đi bịa một lời giải thích sai — thà không giải thích còn hơn.
 */

export const formatVND = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

/** Rút gọn cho nhãn phép tính: 111.833.333 đ → 111,8tr */
export const shortVND = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(abs % 1_000_000_000 === 0 ? 0 : 1)} tỷ`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs % 1_000_000 === 0 ? 0 : 1)}tr`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(Math.round(n));
};

/** Số FE suy ra có khớp số BE trả không (cho phép lệch 1đ do làm tròn). */
export const verify = (mine: number, theirs?: number | null): boolean =>
  theirs != null && Math.abs(mine - theirs) <= 1;

// ─── Nguyên liệu hiển thị ────────────────────────────────────────────────────

/** Một dòng số liệu: nhãn · (giải thích) · phép tính · giá trị. */
export const Line = ({
  label, hint, formula, value, tone = 'plain', size = 'md', indent,
}: {
  label: string;
  hint?: string;
  /** Phép tính bằng chính các số đã hiện ở trên — chỉ truyền khi đã verify() đúng. */
  formula?: ReactNode;
  value: ReactNode;
  tone?: 'plain' | 'total' | 'accent' | 'good' | 'bad' | 'muted';
  size?: 'sm' | 'md' | 'lg';
  indent?: boolean;
}) => {
  const valueCls = {
    plain: 'text-slate-800',
    total: 'text-slate-900',
    accent: 'text-indigo-700',
    good: 'text-emerald-700',
    bad: 'text-rose-600',
    muted: 'text-slate-400',
  }[tone];
  const sizeCls = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' }[size];
  return (
    <div className={`flex items-start justify-between gap-4 py-1.5 ${indent ? 'pl-4' : ''}`}>
      <div className="min-w-0">
        <p className={`${sizeCls} ${tone === 'total' ? 'font-bold text-slate-700' : 'font-medium text-slate-600'}`}>
          {label}
        </p>
        {hint && <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{hint}</p>}
        {formula && (
          <p className="mt-0.5 font-mono text-[11px] leading-snug text-slate-400">{formula}</p>
        )}
      </div>
      <p className={`shrink-0 tabular-nums ${sizeCls} ${tone === 'total' ? 'font-black' : 'font-bold'} ${valueCls}`}>
        {value}
      </p>
    </div>
  );
};

export const Divider = () => <div className="my-1.5 border-t border-slate-200" />;

export const Panel = ({ title, icon: Icon, subtitle, children, tone = 'plain' }: {
  title: string;
  icon: typeof Check;
  subtitle?: string;
  children: ReactNode;
  tone?: 'plain' | 'accent';
}) => (
  <section className={`rounded-2xl border p-5 ${
    tone === 'accent' ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200 bg-white'
  }`}>
    <div className="mb-3">
      <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-slate-700">
        <Icon className={`h-4 w-4 ${tone === 'accent' ? 'text-indigo-600' : 'text-slate-400'}`} />
        {title}
      </h3>
      {subtitle && <p className="mt-1 text-xs leading-relaxed text-slate-500">{subtitle}</p>}
    </div>
    {children}
  </section>
);

/** Thẻ số lớn — ba con số Host phải nhớ khi rời trang. */
export const BigStat = ({ label, value, sub, tone = 'slate' }: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'slate' | 'indigo' | 'emerald' | 'rose' | 'amber';
}) => {
  const map = {
    slate: 'border-slate-200 bg-white text-slate-900',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
  }[tone];
  return (
    <div className={`rounded-xl border px-3.5 py-3 ${map}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-60">{label}</p>
      <p className="mt-1 text-lg font-black leading-none tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-[11px] font-medium opacity-70">{sub}</p>}
    </div>
  );
};

/** Cảnh báo nhẹ — dùng khi số liệu thiếu hoặc lệch so với công thức FE biết. */
export const Note = ({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'amber' | 'rose' }) => {
  const map = {
    slate: 'border-slate-200 bg-slate-50 text-slate-500',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
  }[tone];
  return (
    <p className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-relaxed ${map}`}>
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
};

// ─── Suy ra các mốc tính toán, kèm cờ "có khớp BE không" ─────────────────────

export interface Derived {
  /** capex = tiền thuê trả chủ + cải tạo + thiết bị */
  capexParts: { rent: number; renovation: number; equipment: number };
  capexMatches: boolean;
  /** Hoàn vốn/tháng = capex ÷ số tháng hợp đồng */
  recoveryMatches: boolean;
  /** Chi phí nền/tháng = vận hành + hoàn vốn */
  opexMatches: boolean;
  /** Doanh thu mục tiêu = (chi phí nền + lãi mong muốn) ÷ (1 − biên trống phòng) */
  targetMatches: boolean;
  /** Lãi mong muốn/tháng: FORWARD lấy thẳng, REVERSE quy từ ROI năm. */
  profitPerMonth: number;
  vRatePct: number;
}

export const derive = (calc: PricingCalculationResponse): Derived => {
  const rent = calc.cRent ?? 0;
  const renovation = calc.cRenovation ?? 0;
  const equipment = calc.cEquipment ?? 0;
  const vRate = calc.vRate ?? 0;

  const profitPerMonth = calc.pDesired != null && calc.pDesired > 0
    ? calc.pDesired
    : calc.roiExpected != null && calc.roiExpected > 0
      ? (calc.capex * calc.roiExpected) / 100 / 12
      : 0;

  const recovery = calc.contractMonths > 0 ? calc.capex / calc.contractMonths : 0;
  const opex = (calc.oOperation ?? 0) + calc.monthlyRecovery;
  const target = vRate < 1 ? (calc.fixedOpex + profitPerMonth) / (1 - vRate) : 0;

  return {
    capexParts: { rent, renovation, equipment },
    capexMatches: verify(rent + renovation + equipment, calc.capex) && rent + renovation + equipment > 0,
    recoveryMatches: verify(recovery, calc.monthlyRecovery),
    opexMatches: verify(opex, calc.fixedOpex),
    targetMatches: verify(target, calc.revenueTarget),
    profitPerMonth,
    vRatePct: Math.round(vRate * 100),
  };
};
