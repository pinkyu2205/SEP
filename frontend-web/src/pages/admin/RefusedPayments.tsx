import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Flag, RefreshCw, Search, Wallet, Users, CalendarClock, Gavel, X, Loader2,
  DoorOpen, Eye, HandCoins, ShieldOff, ExternalLink,
} from 'lucide-react';
import { Overlay } from '@/components/Overlay';
import { formatCurrency } from '@/utils';
import { normalizeVi } from '@/utils/helpers';
import { fmtDate } from '@/utils/period';
import { maintenanceService } from '@/services/maintenance.service';
import { tenantService } from '@/services/tenant.service';
import type { MaintenanceRequestResponse, TenantContractResponse } from '@/types/api.types';
import { EmptyState, PageHero, StatCard } from './shared';

// ══════════════════════════════════════════════════════════════════════════════
// CỜ ĐỎ — KHÁCH TỪ CHỐI TRẢ CHI PHÍ BẢO TRÌ (admin xem xét).
//
// Quy tắc nghiệp vụ (25/09/2026): khách làm hư thiết bị mà TỪ CHỐI trả (manager chọn "Khách từ chối
// trả" lúc chẩn đoán → công ty trả hộ, `companyAbsorbedFault = true`) thì hệ thống gắn CỜ ĐỎ ngay,
// KHÔNG chia mức. Admin xem danh sách (thường cuối tháng) để cân nhắc kết thúc hợp đồng.
//
// Hành động của mỗi dòng:
//   • Chấm dứt HĐ   — dùng API có sẵn `POST /tenant-contracts/{id}/terminate` (làm được ngay).
//   • Bỏ cờ         — cần BE (ghi nhận "đã xem xét, không xử lý" + lý do).
//   • Trừ cọc       — cần BE (tạo khoản trừ cọc lúc trả phòng bằng số công ty đã chịu).
// Hai nút cần BE bị khoá bằng `REFUSAL_REVIEW_BE_READY` tới khi BE ship — đặc tả ở
// docs/BE-YEUCAU-co-do-khach-tu-choi-tra-2026-09-25.md. Bật cờ này = true khi BE xong.
// ══════════════════════════════════════════════════════════════════════════════
const REFUSAL_REVIEW_BE_READY = false;

const PAGE_SIZE = 100;
const isPending = (t: MaintenanceRequestResponse) =>
  !t.refusalReviewStatus || t.refusalReviewStatus === 'PENDING';
/** Chi phí công ty đã chịu: số hoá đơn thợ (nếu đã báo sửa xong), thiếu thì số ước tính. */
const costOf = (t: MaintenanceRequestResponse) => t.invoiceAmount ?? t.estimatedDamageAmount ?? 0;
const monthOf = (iso?: string) => (iso ?? '').slice(0, 7);
const monthLabel = (ym: string) => { const [y, m] = ym.split('-'); return `Tháng ${m}/${y}`; };
const maskPhone = (p?: string) => (p && p.length > 5 ? `${p.slice(0, 3)}•••${p.slice(-2)}` : p || '—');

interface RefusalFlag {
  key: string;
  tenantId: string;
  tenantName: string;
  tenantPhone?: string;
  propertyId: number;
  propertyName: string;
  roomName: string;
  managerName?: string;
  tickets: MaintenanceRequestResponse[];
  total: number;
  latest: string;
  /** Hợp đồng ĐANG hiệu lực khớp khách + nhà; null = đã chấm dứt hoặc không tìm thấy. */
  contract: TenantContractResponse | null;
  /** Còn ít nhất 1 phiếu chưa xem xét. */
  pending: boolean;
}

export const RefusedPayments = () => {
  const [tickets, setTickets] = useState<MaintenanceRequestResponse[]>([]);
  const [contracts, setContracts] = useState<TenantContractResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'todo' | 'done'>('todo');
  const [month, setMonth] = useState('all');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<RefusalFlag | null>(null);
  const [terminating, setTerminating] = useState<RefusalFlag | null>(null);
  const [reviewing, setReviewing] = useState<{ flag: RefusalFlag; decision: 'DISMISSED' | 'DEDUCT_AT_CHECKOUT' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Phân trang: gom hết phiếu khách-từ-chối (số lượng nhỏ) rồi nhóm theo khách ở phía FE.
      const all: MaintenanceRequestResponse[] = [];
      for (let page = 0; page < 20; page += 1) {
        const res = await maintenanceService.getRequests({ companyAbsorbedFault: true }, page, PAGE_SIZE);
        const rows = res?.content ?? [];
        all.push(...rows);
        if (res?.last ?? rows.length < PAGE_SIZE) break;
      }
      setTickets(all.filter((t) => t.companyAbsorbedFault !== false));
      // BE chưa trả `tenantContractId` trên phiếu → ghép theo khách + nhà từ danh sách HĐ đang hiệu lực.
      setContracts(await tenantService.listByStatus('ACTIVE').catch(() => [] as TenantContractResponse[]));
    } catch {
      /* interceptor toast */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const flags = useMemo<RefusalFlag[]>(() => {
    const map = new Map<string, MaintenanceRequestResponse[]>();
    tickets
      .filter((t) => month === 'all' || monthOf(t.resolvedAt ?? t.createdAt) === month)
      .forEach((t) => {
        const k = `${t.tenantId}|${t.propertyId}`;
        map.set(k, [...(map.get(k) ?? []), t]);
      });
    return [...map.entries()].map(([key, list]) => {
      const sorted = [...list].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      const f = sorted[0];
      const cands = contracts.filter((c) => c.tenantUserId === f.tenantId && c.propertyId === f.propertyId);
      const contract = cands.find((c) => c.roomNumber && c.roomNumber === f.roomName) ?? cands[0] ?? null;
      return {
        key, tenantId: f.tenantId, tenantName: f.tenantName, tenantPhone: f.tenantPhone,
        propertyId: f.propertyId, propertyName: f.propertyName, roomName: f.roomName,
        managerName: f.assignedManagerName,
        tickets: sorted, total: sorted.reduce((s, t) => s + costOf(t), 0), latest: f.createdAt,
        contract, pending: sorted.some(isPending),
      };
    });
  }, [tickets, contracts, month]);

  // "Cần xem xét" = còn phiếu chưa duyệt VÀ hợp đồng còn hiệu lực. HĐ đã chấm dứt (làm ở đây hay ở app)
  // hoặc mọi phiếu đã có quyết định thì chuyển sang "Đã xử lý".
  const todo = flags.filter((f) => f.pending && f.contract);
  const done = flags.filter((f) => !(f.pending && f.contract));
  const shown = (tab === 'todo' ? todo : done)
    .filter((f) => !search.trim() || normalizeVi(`${f.tenantName} ${f.tenantPhone ?? ''} ${f.propertyName} ${f.roomName}`)
      .includes(normalizeVi(search.trim())))
    .sort((a, b) => b.total - a.total);

  const months = useMemo(
    () => [...new Set(tickets.map((t) => monthOf(t.resolvedAt ?? t.createdAt)).filter(Boolean))].sort().reverse(),
    [tickets],
  );
  const totalLoss = flags.reduce((s, f) => s + f.total, 0);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const newThisMonth = tickets.filter((t) => monthOf(t.createdAt) === thisMonth).length;

  return (
    <div className="space-y-5">
      <PageHero
        eyebrow="Vận hành"
        title="Khách từ chối trả — cờ đỏ"
        subtitle="Khách làm hư thiết bị mà từ chối trả, công ty đã trả hộ. Xem xét từng khách để chấm dứt hợp đồng, trừ vào cọc lúc trả phòng hoặc bỏ cờ."
        icon={Flag}
        action={(
          <button onClick={() => void load()} disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
          </button>
        )}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Khách bị gắn cờ" value={flags.length} icon={Users} tone="rose"
          helper={`${todo.length} cần xem xét`} onClick={() => setTab('todo')} active={tab === 'todo'} />
        <StatCard title="Phiếu từ chối trả" value={tickets.length} icon={Flag} tone="amber" helper="mọi thời điểm" />
        <StatCard title="Công ty đã chịu" value={formatCurrency(totalLoss)} icon={Wallet} tone="violet"
          helper="tổng chi phí trả hộ (theo bộ lọc tháng)" />
        <StatCard title="Phát sinh tháng này" value={newThisMonth} icon={CalendarClock} tone="blue" helper="phiếu mới" />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center">
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          {([['todo', `Cần xem xét (${todo.length})`], ['done', `Đã xử lý (${done.length})`]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-bold transition ${tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên khách, SĐT, nhà, phòng… (không cần dấu)"
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm focus:border-indigo-400 focus:outline-none" />
        </div>
        <select value={month} onChange={(e) => setMonth(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700">
          <option value="all">Mọi tháng</option>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : shown.length === 0 ? (
        <EmptyState text={tab === 'todo'
          ? 'Không có khách nào cần xem xét. Khách từ chối trả chi phí bảo trì sẽ hiện ở đây.'
          : 'Chưa có hồ sơ đã xử lý. Khách đã chấm dứt HĐ hoặc đã có quyết định sẽ hiện ở đây.'} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-2.5 font-bold">Khách thuê</th>
                <th className="px-4 py-2.5 font-bold">Nhà · phòng</th>
                <th className="px-4 py-2.5 font-bold">Quản lý ghi nhận</th>
                <th className="px-4 py-2.5 text-center font-bold">Số phiếu</th>
                <th className="px-4 py-2.5 text-right font-bold">Công ty đã chịu</th>
                <th className="px-4 py-2.5 font-bold">Gần nhất</th>
                <th className="px-4 py-2.5 text-right font-bold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((f) => (
                <tr key={f.key} className="border-l-[3px] border-l-rose-500 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <p className="flex items-center gap-1.5 font-bold text-slate-900">
                      <Flag className="h-3.5 w-3.5 text-rose-500" /> {f.tenantName}
                    </p>
                    <p className="text-[11px] text-slate-400">{maskPhone(f.tenantPhone)}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{f.propertyName}<span className="text-slate-400"> · {f.roomName}</span></td>
                  <td className="px-4 py-3 text-slate-600">{f.managerName ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-black text-rose-600">{f.tickets.length}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">{formatCurrency(f.total)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDate(f.latest)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <button onClick={() => setDetail(f)} className={btn('slate')}><Eye className="h-3.5 w-3.5" /> Chi tiết</button>
                      {tab === 'todo' && (
                        <>
                          <button onClick={() => setTerminating(f)} className={btn('rose')}><Gavel className="h-3.5 w-3.5" /> Chấm dứt HĐ</button>
                          <button onClick={() => setReviewing({ flag: f, decision: 'DEDUCT_AT_CHECKOUT' })}
                            disabled={!REFUSAL_REVIEW_BE_READY} title={REFUSAL_REVIEW_BE_READY ? undefined : 'Chờ BE hỗ trợ (xem docs/BE-YEUCAU-co-do-khach-tu-choi-tra-2026-09-25.md)'}
                            className={btn('amber')}><HandCoins className="h-3.5 w-3.5" /> Trừ cọc</button>
                          <button onClick={() => setReviewing({ flag: f, decision: 'DISMISSED' })}
                            disabled={!REFUSAL_REVIEW_BE_READY} title={REFUSAL_REVIEW_BE_READY ? undefined : 'Chờ BE hỗ trợ (xem docs/BE-YEUCAU-co-do-khach-tu-choi-tra-2026-09-25.md)'}
                            className={btn('slate')}><ShieldOff className="h-3.5 w-3.5" /> Bỏ cờ</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!REFUSAL_REVIEW_BE_READY && tab === 'todo' && shown.length > 0 && (
        <p className="text-xs text-slate-500">
          ℹ️ <b>Trừ cọc</b> và <b>Bỏ cờ</b> đang khoá chờ BE (cần lưu quyết định xem xét). <b>Chấm dứt HĐ</b> dùng được ngay.
        </p>
      )}

      {detail && <DetailModal flag={detail} onClose={() => setDetail(null)} />}
      {terminating && (
        <TerminateModal flag={terminating} onClose={() => setTerminating(null)}
          onDone={() => { setTerminating(null); void load(); }} />
      )}
      {reviewing && (
        <ReviewModal flag={reviewing.flag} decision={reviewing.decision} onClose={() => setReviewing(null)}
          onDone={() => { setReviewing(null); void load(); }} />
      )}
    </div>
  );
};

const TONES = {
  slate: 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
  rose: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
  amber: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
};
const btn = (tone: keyof typeof TONES) =>
  `inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${TONES[tone]}`;

// ─── Chi tiết: từng phiếu, ảnh, lý do, thoả thuận ────────────────────────────
const DetailModal = ({ flag, onClose }: { flag: RefusalFlag; onClose: () => void }) => (
  <Overlay>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="flex items-center gap-2 text-lg font-black text-slate-900"><Flag className="h-5 w-5 text-rose-500" /> {flag.tenantName}</p>
            <p className="text-xs text-slate-500">
              {flag.propertyName} · {flag.roomName} · {flag.tickets.length} phiếu · công ty đã chịu {formatCurrency(flag.total)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 overflow-y-auto p-5">
          {flag.tickets.map((t) => (
            <div key={t.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-slate-900">{t.requestCode} · {t.title || t.equipmentName || 'Sự cố'}</p>
                <span className="text-sm font-black tabular-nums text-rose-600">{formatCurrency(costOf(t))}</span>
              </div>
              <p className="text-xs text-slate-500">
                {t.equipmentName ? `${t.equipmentName} · ` : ''}{fmtDate(t.createdAt)} · trạng thái {t.status}
                {t.assignedManagerName ? ` · QL ${t.assignedManagerName}` : ''}
              </p>
              {t.faultReason && <p className="mt-2 text-sm text-slate-700"><b>Lý do lỗi do khách:</b> {t.faultReason}</p>}
              {t.companyAbsorbedNote && <p className="mt-1 text-sm text-slate-700"><b>Thoả thuận ghi nhận:</b> {t.companyAbsorbedNote}</p>}
              {t.repairDescription && <p className="mt-1 text-sm text-slate-600"><b>Việc đã làm:</b> {t.repairDescription}</p>}
              {[...(t.faultEvidenceImages ?? []), ...(t.beforeImages ?? t.images ?? [])].length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {[...(t.faultEvidenceImages ?? []), ...(t.beforeImages ?? t.images ?? [])].slice(0, 8).map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer">
                      <img src={u} alt="" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
                    </a>
                  ))}
                </div>
              )}
              {t.refusalReviewStatus && t.refusalReviewStatus !== 'PENDING' && (
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                  Đã xem xét: <b>{t.refusalReviewStatus}</b>{t.refusalReviewedByName ? ` bởi ${t.refusalReviewedByName}` : ''}
                  {t.refusalReviewNote ? ` — ${t.refusalReviewNote}` : ''}
                </p>
              )}
              <Link to="/admin/maintenance?bucket=tenant"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline">
                <ExternalLink className="h-3 w-3" /> Mở trong Bảo trì & thiết bị
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  </Overlay>
);

// ─── Chấm dứt hợp đồng (API có sẵn) ─────────────────────────────────────────
const TerminateModal = ({ flag, onClose, onDone }: { flag: RefusalFlag; onClose: () => void; onDone: () => void }) => {
  const [reason, setReason] = useState(
    `Khách từ chối trả chi phí bảo trì (${flag.tickets.length} phiếu, công ty đã chịu ${formatCurrency(flag.total)}): `
    + flag.tickets.map((t) => t.requestCode).join(', ') + '.',
  );
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!flag.contract) return;
    if (!reason.trim()) { toast.error('Vui lòng nhập lý do chấm dứt.'); return; }
    setBusy(true);
    try {
      // KHÔNG dùng VIOLATION: BE (`terminateActiveContract`) chỉ cho VIOLATION khi hợp đồng có hoá đơn quá
      // hạn — ca khách từ chối trả không có hoá đơn nào nên sẽ bị từ chối. Dùng OTHER (không bị chặn) và ghi
      // rõ lý do; BE nên thêm loại/luật riêng (xem BE-YEUCAU-co-do-khach-tu-choi-tra-2026-09-25.md, mục 5).
      await tenantService.terminate(flag.contract.id, {
        type: 'OTHER', reason: reason.trim(), note: 'Cờ đỏ: khách từ chối trả chi phí bảo trì',
      });
      toast.success('Đã chấm dứt hợp đồng. Sang mục Trả phòng để kiểm kê và tất toán cọc.');
      onDone();
    } catch {
      /* interceptor toast */
    } finally {
      setBusy(false);
    }
  };
  return (
    <Overlay>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => !busy && onClose()}>
        <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <p className="flex items-center gap-2 text-lg font-black text-rose-700"><DoorOpen className="h-5 w-5" /> Chấm dứt hợp đồng?</p>
          <p className="mt-1 text-sm text-slate-600">
            <b>{flag.tenantName}</b> — {flag.propertyName} · {flag.roomName}
            {flag.contract ? ` (HĐ ${flag.contract.contractCode})` : ''}. Thanh lý hợp đồng: khách mất quyền vào phòng trong app, phòng về trạng thái trống.
            Hành động không đảo ngược được.
          </p>
          <label className="mt-3 block text-xs font-bold uppercase tracking-wider text-slate-400">Lý do (ghi vào hồ sơ hợp đồng)</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4}
            className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-rose-400 focus:outline-none" />
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} disabled={busy} className={btn('slate')}>Huỷ</button>
            <button onClick={() => void submit()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Chấm dứt hợp đồng
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
};

// ─── Bỏ cờ / Trừ cọc (cần BE — khoá bằng REFUSAL_REVIEW_BE_READY) ────────────
const ReviewModal = ({ flag, decision, onClose, onDone }: {
  flag: RefusalFlag; decision: 'DISMISSED' | 'DEDUCT_AT_CHECKOUT'; onClose: () => void; onDone: () => void;
}) => {
  const dismiss = decision === 'DISMISSED';
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!note.trim()) { toast.error('Vui lòng nhập lý do / ghi chú.'); return; }
    setBusy(true);
    try {
      // Mỗi phiếu của khách được ghi nhận cùng quyết định (cờ tính theo khách nhưng lưu ở từng phiếu).
      for (const t of flag.tickets.filter(isPending)) {
        await maintenanceService.reviewRefusal(t.id, { decision, note: note.trim() });
      }
      toast.success(dismiss ? 'Đã bỏ cờ.' : 'Đã ghi nhận trừ vào cọc khi trả phòng.');
      onDone();
    } catch {
      /* interceptor toast */
    } finally {
      setBusy(false);
    }
  };
  return (
    <Overlay>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={() => !busy && onClose()}>
        <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <p className="text-lg font-black text-slate-900">{dismiss ? 'Bỏ cờ đỏ?' : 'Trừ vào cọc lúc trả phòng?'}</p>
          <p className="mt-1 text-sm text-slate-600">
            <b>{flag.tenantName}</b> — {flag.tickets.length} phiếu, {formatCurrency(flag.total)}.{' '}
            {dismiss ? 'Cờ được gỡ, khách chuyển sang "Đã xử lý". Lý do bỏ cờ là bắt buộc để còn đối soát.'
              : 'Số tiền công ty đã chịu sẽ hiện ở quyết toán trả phòng để trừ vào cọc.'}
          </p>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
            placeholder={dismiss ? 'Vì sao bỏ cờ (vd: khách đã hoàn tiền mặt cho công ty)…' : 'Ghi chú cho bước quyết toán…'}
            className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-indigo-400 focus:outline-none" />
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} disabled={busy} className={btn('slate')}>Huỷ</button>
            <button onClick={() => void submit()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Xác nhận
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
};
