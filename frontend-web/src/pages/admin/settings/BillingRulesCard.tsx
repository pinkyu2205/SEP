import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Loader2, RotateCcw, Save, TriangleAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  adminService,
  BILLING_CONFIG_LIMITS,
  type BillingConfig,
  type BillingConfigInput,
} from '@/services/admin.service';

/**
 * Mốc thu tiền toàn hệ thống — `GET/PUT /api/v1/admin/billing-config`.
 *
 * Đây KHÔNG phải cấu hình giao diện: ba số này quyết định ngày phát hành hoá đơn, hạn
 * thanh toán và deadline chụp ảnh công tơ của **mọi hợp đồng ACTIVE**. Vì vậy màn có
 * dòng thời gian xem trước và một bước xác nhận — admin phải thấy hệ quả trước khi lưu.
 *
 * Quan hệ giữa ba số (BE `ContractBillingCalendar`):
 *   phát hoá đơn = mốc − reminderLeadDays   ← cũng là hạn chụp công tơ
 *   nhắc chụp    = hạn chụp − meterReminderLeadDays
 *   hạn trả tiền = mốc + graceDays
 */

/** Mốc mẫu để vẽ dòng thời gian. Admin đổi được để thử hợp đồng ngày khác. */
const DEFAULT_SAMPLE_DAY = 15;

interface FieldSpec {
  key: keyof BillingConfigInput;
  label: string;
  hint: string;
}

const FIELDS: FieldSpec[] = [
  {
    key: 'reminderLeadDays',
    label: 'Phát hành & bắt đầu nhắc trước (ngày)',
    hint: 'Trước mốc hợp đồng bao nhiêu ngày thì phát hoá đơn và bắt đầu nhắc khách. Cũng là hạn chụp ảnh công tơ.',
  },
  {
    key: 'graceDays',
    label: 'Ân hạn sau mốc (ngày)',
    hint: 'Sau mốc bao nhiêu ngày thì hết hạn. Quá ngày này hoá đơn chuyển quá hạn.',
  },
  {
    key: 'meterReminderLeadDays',
    label: 'Nhắc chụp công tơ trước (ngày)',
    hint: 'Trước hạn chụp bao nhiêu ngày thì nhắc quản lý đi chụp ảnh công tơ.',
  },
];

/** Kẹp về cuối tháng cho hợp đồng ngày 29/30/31 — giống `ContractBillingCalendar.clampDay`. */
const clampDay = (day: number, daysInMonth: number) =>
  Math.min(Math.max(day, 1), daysInMonth);

const labelOfDay = (day: number, daysInMonth: number) => {
  const clamped = clampDay(day, daysInMonth);
  return clamped !== day ? `ngày ${clamped} (kẹp cuối tháng)` : `ngày ${clamped}`;
};

export const BillingRulesCard = () => {
  const [saved, setSaved] = useState<BillingConfig | null>(null);
  const [form, setForm] = useState<BillingConfigInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sampleDay, setSampleDay] = useState(DEFAULT_SAMPLE_DAY);

  useEffect(() => {
    let active = true;
    adminService.getBillingConfig()
      .then(cfg => {
        if (!active) return;
        setSaved(cfg);
        setForm({
          reminderLeadDays: cfg.reminderLeadDays,
          graceDays: cfg.graceDays,
          meterReminderLeadDays: cfg.meterReminderLeadDays,
        });
      })
      .catch(() => { /* toast do interceptor lo */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  /** Lỗi theo từng ô, khớp đúng @Min/@Max của BE để không gửi request chắc chắn hỏng. */
  const errors = useMemo(() => {
    const out: Partial<Record<keyof BillingConfigInput, string>> = {};
    if (!form) return out;
    for (const f of FIELDS) {
      const limit = BILLING_CONFIG_LIMITS[f.key];
      const value = form[f.key];
      if (!Number.isInteger(value)) out[f.key] = 'Phải là số nguyên';
      else if (value < limit.min || value > limit.max) {
        out[f.key] = `Chỉ nhận ${limit.min}–${limit.max}`;
      }
    }
    return out;
  }, [form]);

  const hasError = Object.keys(errors).length > 0;

  const changes = useMemo(() => {
    if (!form || !saved) return [];
    return FIELDS
      .filter(f => form[f.key] !== saved[f.key])
      .map(f => ({ label: f.label, from: saved[f.key], to: form[f.key] }));
  }, [form, saved]);

  const dirty = changes.length > 0;

  /**
   * Dòng thời gian cho một tháng 30 ngày — chỉ để minh hoạ thứ tự các mốc, nên không
   * cần đúng tháng thật. Phần "kẹp cuối tháng" vẫn hiện để admin biết hợp đồng ngày
   * 29/30/31 sẽ bị dồn.
   */
  const timeline = useMemo(() => {
    if (!form) return [];
    const daysInMonth = 30;
    const anchor = clampDay(sampleDay, daysInMonth);
    const issue = anchor - form.reminderLeadDays;
    const remindMeter = issue - form.meterReminderLeadDays;
    const due = anchor + form.graceDays;
    return [
      { day: remindMeter, icon: '📸', text: 'Nhắc quản lý đi chụp ảnh công tơ' },
      { day: issue, icon: '📄', text: 'Hạn chụp công tơ · phát hành hoá đơn · bắt đầu nhắc khách' },
      { day: anchor, icon: '●', text: 'Mốc hợp đồng (ngày hiệu lực)' },
      { day: due, icon: '⏰', text: 'Hạn chót — sau ngày này là quá hạn' },
    ].map(item => ({ ...item, label: labelOfDay(item.day, daysInMonth) }));
  }, [form, sampleDay]);

  const submit = async () => {
    if (!form || hasError) return;
    try {
      setSaving(true);
      const next = await adminService.updateBillingConfig(form);
      setSaved(next);
      setForm({
        reminderLeadDays: next.reminderLeadDays,
        graceDays: next.graceDays,
        meterReminderLeadDays: next.meterReminderLeadDays,
      });
      setConfirming(false);
      toast.success('Đã lưu mốc thu tiền');
    } catch {
      // 422 (validate) và 403 (thiếu quyền) đều đã có toast từ interceptor.
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    if (!saved) return;
    setForm({
      reminderLeadDays: saved.reminderLeadDays,
      graceDays: saved.graceDays,
      meterReminderLeadDays: saved.meterReminderLeadDays,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải mốc thu tiền…
      </div>
    );
  }

  if (!form || !saved) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        Không tải được mốc thu tiền. Tải lại trang để thử lại.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-cyan-50 p-2">
            <CalendarClock className="h-5 w-5 text-cyan-600" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-950">Mốc thu tiền</h3>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
              Áp dụng cho <strong>mọi hợp đồng đang hoạt động</strong>. Mốc tính theo ngày
              hiệu lực của từng hợp đồng, không phải ngày cố định trong tháng.
            </p>
          </div>
        </div>
        {!!saved.updatedAt && (
          <span className="text-xs text-slate-400">
            Cập nhật {new Date(saved.updatedAt).toLocaleString('vi-VN')}
          </span>
        )}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {FIELDS.map(f => {
          const limit = BILLING_CONFIG_LIMITS[f.key];
          const err = errors[f.key];
          return (
            <div key={f.key}>
              {/* `htmlFor` + `id`: bấm nhãn là focus vào ô, và trình đọc màn hình đọc
                  được nhãn thay vì "spin button" trống trơn. */}
              <label htmlFor={f.key} className="block text-sm font-semibold text-slate-800">
                {f.label}
              </label>
              <input
                id={f.key}
                name={f.key}
                type="number"
                min={limit.min}
                max={limit.max}
                value={Number.isFinite(form[f.key]) ? form[f.key] : ''}
                onChange={e => setForm({ ...form, [f.key]: Number(e.target.value) })}
                className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 ${
                  err
                    ? 'border-rose-300 bg-rose-50 focus:border-rose-500 focus:ring-rose-100'
                    : 'border-slate-200 bg-slate-50 focus:border-cyan-500 focus:bg-white focus:ring-cyan-100'
                }`}
              />
              <p className={`mt-1 text-xs ${err ? 'font-medium text-rose-600' : 'text-slate-500'}`}>
                {err ?? f.hint}
              </p>
            </div>
          );
        })}
      </div>

      {/* Dòng thời gian: phần quan trọng nhất của màn. Không có nó thì admin gõ số mà
          không biết mình vừa dời deadline chụp công tơ của toàn bộ quản lý. */}
      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-bold text-slate-800">Xem trước một chu kỳ</h4>
          <label htmlFor="sampleDay" className="flex items-center gap-2 text-xs text-slate-600">
            Hợp đồng hiệu lực
            <input
              id="sampleDay"
              type="number"
              min={1}
              max={31}
              value={sampleDay}
              onChange={e => setSampleDay(Number(e.target.value) || 1)}
              className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-cyan-500"
            />
            hằng tháng
          </label>
        </div>

        <ul className="mt-3 space-y-2">
          {timeline.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className="w-6 text-center">{item.icon}</span>
              <span className="w-40 shrink-0 font-semibold text-slate-900">{item.label}</span>
              <span className="text-slate-600">{item.text}</span>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-xs text-slate-500">
          Ngày phát hoá đơn <strong>cũng là</strong> hạn chụp ảnh công tơ — chưa có ảnh thì
          hoá đơn điện/nước kỳ đó bị chặn. Hợp đồng hiệu lực ngày 29/30/31 sẽ kẹp về ngày
          cuối tháng ở tháng thiếu ngày.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setConfirming(true)}
          disabled={!dirty || hasError || saving}
          className="flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Save className="h-4 w-4" />
          Lưu thay đổi
        </button>
        {dirty && (
          <button
            onClick={reset}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4" />
            Hoàn tác
          </button>
        )}
        {!dirty && <span className="text-xs text-slate-400">Chưa có thay đổi nào</span>}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-amber-50 p-2">
                <TriangleAlert className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h4 className="font-bold text-slate-950">Xác nhận đổi mốc thu tiền</h4>
                <p className="mt-1 text-sm text-slate-600">
                  Áp dụng cho mọi hợp đồng đang hoạt động, bắt đầu từ kỳ phát hành tiếp theo.
                </p>
              </div>
            </div>

            <ul className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
              {changes.map(c => (
                <li key={c.label} className="flex items-start justify-between gap-3">
                  <span className="text-slate-600">{c.label}</span>
                  <span className="shrink-0 font-bold text-slate-900">
                    {c.from} → {c.to}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={saving}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Huỷ
              </button>
              <button
                onClick={() => void submit()}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Xác nhận lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
