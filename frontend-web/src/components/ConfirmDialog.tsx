import { useEffect, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, X } from 'lucide-react';

export type ConfirmTone = 'primary' | 'success' | 'warning' | 'danger';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const toneConfig: Record<ConfirmTone, { icon: typeof HelpCircle; iconWrap: string; btn: string }> = {
  primary: { icon: HelpCircle,    iconWrap: 'bg-indigo-100 text-indigo-600',   btn: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20' },
  success: { icon: CheckCircle2,  iconWrap: 'bg-emerald-100 text-emerald-600', btn: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20' },
  warning: { icon: AlertTriangle, iconWrap: 'bg-amber-100 text-amber-600',     btn: 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20' },
  danger:  { icon: AlertTriangle, iconWrap: 'bg-rose-100 text-rose-600',       btn: 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20' },
};

/**
 * Hộp thoại xác nhận lần 2 dùng chung cho các hành động quan trọng.
 * Bấm ra ngoài / ESC = huỷ (trừ khi đang loading).
 */
export const ConfirmDialog = ({
  open,
  title,
  message,
  confirmText = 'Xác nhận',
  cancelText = 'Huỷ',
  tone = 'primary',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  const cfg = toneConfig[tone];
  const Icon = cfg.icon;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={() => { if (!loading) onCancel(); }}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${cfg.iconWrap}`}>
              <Icon className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-black text-slate-900 leading-snug">{title}</h3>
              {message && <div className="mt-1.5 text-sm text-slate-500 leading-relaxed">{message}</div>}
            </div>
            <button
              onClick={() => { if (!loading) onCancel(); }}
              disabled={loading}
              className="p-1 -mt-1 -mr-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition disabled:opacity-40"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition disabled:opacity-40"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-lg transition disabled:opacity-60 disabled:cursor-not-allowed ${cfg.btn}`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Đang xử lý...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
