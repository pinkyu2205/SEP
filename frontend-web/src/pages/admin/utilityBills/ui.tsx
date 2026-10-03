/** Mảnh giao diện nhỏ dùng chung cho trang phát hành hoá đơn điện/nước và màn nhập lô. */
import { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, Minus, X, XCircle } from 'lucide-react';
import { groupThousands } from '@/utils';
import { onlyDigits } from '@/utils/evnInvoiceParser';
import type { Check, Tone } from './billChecks';

export const TONE_TEXT: Record<Tone, string> = {
  ok: 'text-emerald-700',
  info: 'text-sky-700',
  warn: 'text-amber-700',
  block: 'text-rose-700',
  idle: 'text-slate-400',
};

export const TONE_BOX: Record<Tone, string> = {
  ok: 'border-emerald-100 bg-emerald-50 text-emerald-800',
  info: 'border-sky-100 bg-sky-50 text-sky-800',
  warn: 'border-amber-200 bg-amber-50 text-amber-800',
  block: 'border-rose-200 bg-rose-50 text-rose-800',
  idle: 'border-slate-100 bg-slate-50 text-slate-500',
};

/** Viền ô nhập theo kết quả đối chiếu — ô đang sai phải nhìn ra ngay giữa cả cột. */
export const TONE_INPUT: Record<Tone, string> = {
  ok: 'border-emerald-300 bg-emerald-50/40',
  info: 'border-sky-200',
  warn: 'border-amber-300',
  block: 'border-rose-300 bg-rose-50/40',
  idle: 'border-slate-200',
};

export const ToneIcon = ({ tone, className = 'h-4 w-4' }: { tone: Tone; className?: string }) => {
  if (tone === 'ok') return <CheckCircle2 className={`${className} shrink-0 text-emerald-500`} />;
  if (tone === 'info') return <Info className={`${className} shrink-0 text-sky-500`} />;
  if (tone === 'warn') return <AlertTriangle className={`${className} shrink-0 text-amber-500`} />;
  if (tone === 'block') return <XCircle className={`${className} shrink-0 text-rose-500`} />;
  return <Minus className={`${className} shrink-0 text-slate-300`} />;
};

/**
 * Nhãn kết quả ngắn: icon + chữ.
 *
 * Mục "ổn" mà không có gì để nói thì KHÔNG vẽ gì — một dấu tích đứng trơ dưới mỗi ô chỉ
 * là nhiễu, và làm nhạt đi dấu tích của những mục thật sự vừa được đối chiếu.
 */
export const CheckBadge = ({ check, className = '', wrap }: { check: Check; className?: string; wrap?: boolean }) => {
  if (check.tone === 'ok' && !check.label) return null;
  if (check.tone === 'idle' && !check.label) return null;
  return (
    <span className={`inline-flex min-w-0 items-start gap-1 text-xs font-semibold leading-tight ${TONE_TEXT[check.tone]} ${className}`}>
      <ToneIcon tone={check.tone} className="h-3.5 w-3.5" />
      <span className={wrap ? '' : 'truncate'}>{check.label}</span>
    </span>
  );
};

/** Ô nhập số có phân cách nghìn khi gõ; state gốc vẫn là chuỗi chữ số. */
export const NumInput = ({
  value, onChange, placeholder = '—', tone = 'idle', disabled, className = '', title, ariaLabel,
}: {
  value: string;
  onChange: (digits: string) => void;
  placeholder?: string;
  tone?: Tone;
  disabled?: boolean;
  className?: string;
  title?: string;
  ariaLabel?: string;
}) => (
  <input
    inputMode="numeric"
    aria-label={ariaLabel}
    title={title}
    disabled={disabled}
    value={value === '' ? '' : groupThousands(value)}
    placeholder={placeholder}
    onChange={(e) => onChange(onlyDigits(e.target.value))}
    className={`w-full rounded-lg border px-3 py-2 text-right text-sm font-semibold tabular-nums text-slate-900 outline-none transition placeholder:font-normal placeholder:text-slate-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-50 disabled:text-slate-400 ${TONE_INPUT[tone]} ${className}`}
  />
);

/** Ảnh phóng to — bấm nền hoặc Esc để đóng. */
export const ImageLightbox = ({ src, alt, onClose }: { src: string | null; alt?: string; onClose: () => void }) => {
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [src, onClose]);

  if (!src) return null;
  return (
    <div
      className="fixed inset-0 z-[70] flex cursor-zoom-out items-center justify-center bg-slate-950/80 p-4"
      onClick={onClose}
    >
      <img
        src={src}
        alt={alt ?? 'Ảnh hoá đơn'}
        className="max-h-[92vh] max-w-[92vw] cursor-default rounded-lg bg-white object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={onClose}
        className="absolute right-5 top-5 inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-sm font-bold text-slate-700 hover:bg-white"
      >
        <X className="h-4 w-4" /> Đóng
      </button>
    </div>
  );
};

/** Tiêu đề một bước: số thứ tự trong vòng tròn + tên + phần phụ bên phải. */
export const StepTitle = ({
  n, title, done, aside,
}: { n: number; title: string; done?: boolean; aside?: React.ReactNode }) => (
  <div className="mb-3 flex items-center gap-2.5">
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${
        done ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white'}`}
    >
      {n}
    </span>
    <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
    {aside && <div className="ml-auto min-w-0">{aside}</div>}
  </div>
);

export const fmtNum = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString('vi-VN');

export const fmtVnd = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n)) ? '—' : `${Math.round(Number(n)).toLocaleString('vi-VN')} ₫`;

export const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/** `yyyy-MM` hoặc ISO → "08/2026". */
export const fmtPeriodTag = (at?: string) => {
  if (!at) return '';
  const m = at.match(/^(\d{4})-(\d{2})/);
  return m ? `${m[2]}/${m[1]}` : at;
};

/** Kỳ của hoá đơn tổng: `2026-09` (dạng máy chủ lưu) → "Tháng 09/2026"; dải ngày cũ giữ nguyên. */
export const fmtBillPeriod = (raw?: string | null) => {
  const s = (raw ?? '').trim();
  const m = s.match(/^(\d{4})-(\d{1,2})$/);
  return m ? `Tháng ${m[2].padStart(2, '0')}/${m[1]}` : s;
};
