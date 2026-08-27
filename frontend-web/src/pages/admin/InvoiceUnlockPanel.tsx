import { useEffect, useState } from 'react';
import { Loader2, KeyRound, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  adminService,
  type InvoiceUnlockPasscode, type InvoiceUnlockLog, type InvoiceUnlockPurpose,
} from '@/services/admin.service';
import { serverNow } from '@/utils/serverTime';

/**
 * PHÁT MÃ MỞ KHOÁ THU HỘ — panel nằm trong dòng hoá đơn đang mở của admin.
 *
 * Vì sao gắn theo từng hoá đơn thay vì làm một trang riêng: mã BE cấp **gắn cứng 1 hoá đơn
 * + 1 mục đích**. Nếu admin phát mã ở một trang tách biệt thì phải tự tay chọn lại đúng
 * hoá đơn từ một danh sách dài — đó chính là chỗ dễ phát nhầm sang hoá đơn khác, mà nhầm
 * thì quản lý nộp tiền vào hoá đơn của người khác.
 *
 * Luồng thật: quản lý gọi điện → admin mở đúng dòng hoá đơn đang nói tới, bấm phát mã theo
 * hình thức khách chọn → đọc 6 số cho quản lý. Mã dùng một lần, hết hạn thì phát lại.
 */

const PURPOSE_META: Record<InvoiceUnlockPurpose, {
  label: string; short: string; hint: string; cls: string;
}> = {
  CASH_COLLECT: {
    label: 'Khách trả tiền mặt',
    short: 'Tiền mặt',
    hint: 'Quản lý nhận tiền mặt rồi tự chuyển đúng số đó vào QR của hoá đơn.',
    cls: 'bg-amber-100 text-amber-700',
  },
  PROXY_PAY: {
    label: 'Có người trả hộ',
    short: 'Trả hộ',
    hint: 'Người trả hộ tự quét QR. Quản lý phải ghi tên người đó trước khi mở QR.',
    cls: 'bg-indigo-100 text-indigo-700',
  },
};

const fmtTime = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

/** Còn bao nhiêu phút:giây tới `iso`, '' nếu đã qua. Dùng giờ server. */
const useCountdown = (iso?: string | null): string => {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!iso) { setText(''); return; }
    const tick = () => {
      const left = Math.floor((new Date(iso).getTime() - serverNow().getTime()) / 1000);
      if (left <= 0) { setText(''); return; }
      setText(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [iso]);
  return text;
};

const CodeBox = ({ code, purpose, expiresAt }: {
  code: string; purpose: InvoiceUnlockPurpose; expiresAt: string;
}) => {
  const left = useCountdown(expiresAt);
  const [copied, setCopied] = useState(false);
  const expired = !left;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Không copy được — đọc trực tiếp 6 số cho quản lý.');
    }
  };

  return (
    <div className={`rounded-xl border p-3 ${expired ? 'border-slate-200 bg-slate-50' : 'border-emerald-300 bg-emerald-50'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${PURPOSE_META[purpose].cls}`}>
          {PURPOSE_META[purpose].short}
        </span>
        {expired
          ? <span className="text-[11px] font-bold text-slate-400">Đã hết hạn</span>
          : <span className="text-[11px] font-bold text-emerald-700">Còn {left}</span>}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <span className={`font-mono text-3xl font-black tracking-[0.3em] ${expired ? 'text-slate-300 line-through' : 'text-slate-900'}`}>
          {code}
        </span>
        {!expired && (
          <button
            onClick={copy}
            className="rounded-lg border border-emerald-300 bg-white p-1.5 text-emerald-700 hover:bg-emerald-100"
            title="Copy mã"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </button>
        )}
      </div>

      {!expired && (
        <p className="mt-2 text-[11px] leading-relaxed text-emerald-800">
          Đọc 6 số này cho quản lý qua điện thoại. Mã dùng <b>một lần</b>, chỉ mở được đúng
          hoá đơn này. Quản lý nhập sai 3 lần thì hoá đơn bị khoá 15 phút.
        </p>
      )}
    </div>
  );
};

export const InvoiceUnlockPanel = ({ invoiceId, invoiceCode, canCollect }: {
  invoiceId: number;
  invoiceCode: string;
  /** Hoá đơn đã thu / đã huỷ thì không có gì để mở khoá. */
  canCollect: boolean;
}) => {
  const [issuing, setIssuing] = useState<InvoiceUnlockPurpose | null>(null);
  const [issued, setIssued] = useState<InvoiceUnlockPasscode | null>(null);
  const [logs, setLogs] = useState<InvoiceUnlockLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const loadLogs = async () => {
    // BE chưa cho lọc log theo hoá đơn → lấy hết rồi lọc tại đây. Danh sách này ngắn
    // (mỗi lần thu hộ mới sinh 1 dòng) nên chấp nhận được; có param thì đổi sang server.
    const all = await adminService.listUnlockLogs().catch(() => [] as InvoiceUnlockLog[]);
    setLogs(all.filter(l => l.invoiceId === invoiceId));
    setLoadingLogs(false);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const [active] = await Promise.all([
        adminService.listUnlockPasscodes(true).catch(() => [] as InvoiceUnlockPasscode[]),
        loadLogs(),
      ]);
      if (!alive) return;
      // Mã còn hiệu lực của chính hoá đơn này — mở lại dòng là thấy ngay, khỏi phát thêm
      // mã mới trong khi mã cũ vẫn dùng được (mỗi mã phát thêm đều ăn vào hạn 20 mã/giờ).
      setIssued(active.find(p => p.invoiceId === invoiceId) ?? null);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  const issue = async (purpose: InvoiceUnlockPurpose) => {
    if (issuing) return;
    setIssuing(purpose);
    try {
      const res = await adminService.generateUnlockPasscode({ invoiceId, purpose });
      setIssued(res);
      toast.success(`Đã phát mã ${PURPOSE_META[purpose].short} cho ${invoiceCode}`);
      loadLogs();
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Không phát được mã — thử lại.');
    } finally {
      setIssuing(null);
    }
  };

  if (!canCollect) return null;

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-slate-400" />
        <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
          Mở khoá cho quản lý thu hộ
        </p>
      </div>

      {issued ? (
        <div className="mt-3 space-y-3">
          <CodeBox code={issued.passcode} purpose={issued.purpose} expiresAt={issued.expiresAt} />
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PURPOSE_META) as InvoiceUnlockPurpose[]).map(p => (
              <button
                key={p}
                onClick={() => issue(p)}
                disabled={!!issuing}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {issuing === p ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `Phát mã mới · ${PURPOSE_META[p].short}`}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-xs leading-relaxed text-slate-500">
            Quản lý gọi xin mã thì chọn đúng hình thức khách đang dùng:
          </p>
          {(Object.keys(PURPOSE_META) as InvoiceUnlockPurpose[]).map(p => (
            <button
              key={p}
              onClick={() => issue(p)}
              disabled={!!issuing}
              className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
            >
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${PURPOSE_META[p].cls}`}>
                {PURPOSE_META[p].short}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-bold text-slate-800">{PURPOSE_META[p].label}</span>
                <span className="block text-[11px] leading-relaxed text-slate-500">{PURPOSE_META[p].hint}</span>
              </span>
              {issuing === p && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            </button>
          ))}
        </div>
      )}

      {/* Nhật ký — gồm cả lần nhập SAI mã, đó là thứ đáng để ý nhất ở đây. */}
      <div className="mt-4 border-t border-slate-100 pt-3">
        <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
          Nhật ký mở khoá ({logs.length})
        </p>
        {loadingLogs ? (
          <Loader2 className="mt-2 h-4 w-4 animate-spin text-slate-300" />
        ) : logs.length === 0 ? (
          <p className="mt-2 text-xs text-slate-400">Chưa có ai mở khoá hoá đơn này.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {logs.map(l => (
              <li key={l.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-600">
                  <b className={l.success ? 'text-slate-800' : 'text-rose-600'}>
                    {l.managerName ?? 'Quản lý'}
                  </b>
                  {' · '}{PURPOSE_META[l.purpose]?.short ?? l.purpose}
                  {l.success
                    ? (l.paymentResult === 'QR_CREATED' ? ' · đã tạo QR' : ' · mở khoá')
                    : ' · nhập sai mã'}
                </span>
                <span className="shrink-0 text-slate-400">{fmtTime(l.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
