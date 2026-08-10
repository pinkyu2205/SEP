import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, ClipboardList, Clock, Copy, KeyRound, RefreshCw, ShieldAlert,
} from 'lucide-react';
import {
  meterOverrideService,
  type MeterOverrideLog,
  type MeterOverridePasscode,
} from '@/services/meterOverride.service';
import { SectionShell, StatusPill, KpiCard, EmptyState } from './shared';

/**
 * CẤP MÃ NHẬP TAY CHỈ SỐ ĐỒNG HỒ (Admin).
 *
 * Mentor 07/08/2026 (ý 5): manager đón khách mà không chụp được ảnh đồng hồ thì trước
 * đây tắc hẳn luồng. Đường lùi là cho gõ tay — nhưng nếu ai cũng gõ tay được thì toàn
 * bộ cơ chế bắt chụp ảnh (chống khai khống chỉ số) thành vô nghĩa.
 *
 * Nên đường lùi phải qua admin: manager gọi xin → admin bấm tạo mã → đọc mã cho manager
 * → mã dùng một lần rồi chết. Mọi lần gõ tay đều nằm trong nhật ký ở cuối trang.
 *
 * Trang này thay cho cách làm cũ (một mã cố định trong biến môi trường, cả team dùng
 * chung, không đổi, không biết ai đã dùng).
 */

/** Đọc mã qua điện thoại dễ nhầm — tách 3-3 cho dễ đọc từng cụm. */
const groupCode = (code: string) =>
  code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;

const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const fmtClock = (seconds: number) => {
  const s = Math.max(0, seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Ba cái chốt dưới đây chỉ chặn được ADMIN THẬT LỠ TAY — ai có token vẫn gọi thẳng
 * endpoint được. Trần thật phải nằm ở BE (đã ghi trong `BE-NEED-remaining-before-demo`).
 *
 * Và lý do giới hạn không phải sợ BE quá tải: mỗi lần tạo chỉ là một INSERT. Lý do là
 * **mỗi mã đang sống là một chiếc chìa khoá đang trôi nổi** — nó mở được cửa "bỏ qua
 * ảnh đồng hồ" trong suốt thời gian còn hạn. Càng ít chìa lang thang càng tốt.
 */
const COOLDOWN_SECONDS = 10;
const MAX_LIVE_UNUSED = 5;

const METER_KIND: Record<string, { label: string; color: string }> = {
  ELEC: { label: 'Điện', color: 'bg-amber-100 text-amber-800' },
  WATER: { label: 'Nước', color: 'bg-sky-100 text-sky-700' },
};

/**
 * Thẻ hiển thị mã vừa tạo — thứ admin thật sự đọc cho manager nghe.
 *
 * Đồng hồ đếm ngược tính theo `expiresAt - createdAt` của CHÍNH response, chứ không lấy
 * `expiresAt` trừ giờ máy admin. Hai mốc đó đều do server sinh ra nên hiệu của chúng
 * không phụ thuộc múi giờ; còn so với giờ trình duyệt thì lệch múi giờ server sẽ ra
 * những con số vô lý kiểu "còn 7 tiếng" hoặc "hết hạn rồi".
 */
const FreshCode = ({ passcode }: { passcode: MeterOverridePasscode }) => {
  const ttlSeconds = useMemo(() => {
    const born = new Date(passcode.createdAt).getTime();
    const dies = new Date(passcode.expiresAt).getTime();
    const diff = Math.round((dies - born) / 1000);
    return Number.isFinite(diff) && diff > 0 ? diff : 600; // hỏng dữ liệu → coi như 10'
  }, [passcode.createdAt, passcode.expiresAt]);

  const [left, setLeft] = useState(ttlSeconds);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLeft(ttlSeconds);
    const startedAt = Date.now();
    const t = setInterval(() => {
      setLeft(ttlSeconds - Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [ttlSeconds, passcode.id]);

  // `usedAt` do trang cha bơm vào sau mỗi lượt hỏi lại — mã bị dùng thì thẻ đổi mặt
  // ngay, không đợi hết giờ. Đây là tín hiệu admin cần: "quản lý nhận được mã chưa".
  const used = !!passcode.usedAt;
  const dead = used || left <= 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(passcode.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API cần HTTPS (hoặc localhost). Không copy được thì thôi —
      // mã vẫn hiện cỡ lớn ngay trên màn hình để đọc.
    }
  };

  return (
    <div
      className={`rounded-2xl border-2 p-6 text-center transition ${
        dead ? 'border-slate-200 bg-slate-50' : 'border-emerald-300 bg-emerald-50/60'
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {used ? 'Quản lý đã dùng mã này' : dead ? 'Mã đã hết hạn' : 'Đọc mã này cho quản lý'}
      </p>

      <p
        className={`mt-3 font-mono text-5xl font-black tracking-[0.2em] tabular-nums ${
          dead ? 'text-slate-400 line-through' : 'text-emerald-700'
        }`}
      >
        {groupCode(passcode.code)}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold tabular-nums ${
            used
              ? 'bg-slate-900 text-white'
              : dead
                ? 'bg-slate-200 text-slate-600'
                : left <= 60
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-white text-emerald-700'
          }`}
        >
          {used ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
          {used ? `Đã dùng ${fmtDateTime(passcode.usedAt)}` : dead ? 'Hết hạn' : `Còn ${fmtClock(left)}`}
        </span>

        {!dead && (
          <button
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Đã chép' : 'Chép mã'}
          </button>
        )}
      </div>

      {passcode.note && (
        <p className="mt-3 text-sm text-slate-600">Ghi chú: {passcode.note}</p>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Mã dùng được <strong>một lần</strong> và chỉ cho <strong>một đồng hồ</strong>.
        Quản lý không chụp được cả điện lẫn nước thì cần hai mã.
      </p>
    </div>
  );
};

export const MeterOverridePasscodes = () => {
  const [fresh, setFresh] = useState<MeterOverridePasscode | null>(null);
  const [note, setNote] = useState('');
  const [ttl, setTtl] = useState('10');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [confirming, setConfirming] = useState(false);
  /** Mốc hết hạn của mã vừa tạo, theo đồng hồ máy admin. 0 = chưa tạo mã nào. */
  const freshDeadAtRef = useRef(0);
  /**
   * Hai chốt thật sự chặn spam — cố tình là `ref` chứ không phải state.
   *
   * Giữ Enter thì bàn phím tự lặp ~30 lần/giây; toàn bộ số sự kiện đó chạy xong TRƯỚC
   * khi React render lại một lần nào, nên mọi closure đều đọc được `generating=false`,
   * `cooldown=0` và cùng nhau gọi API. Đo thật: 25 phím Enter → 25 mã.
   * Ref thì ghi xuống là thấy ngay trong cùng vòng lặp sự kiện, nên chặn được.
   * State bên dưới chỉ còn nhiệm vụ hiển thị.
   */
  const busyRef = useRef(false);
  const cooldownUntilRef = useRef(0);

  const [codes, setCodes] = useState<MeterOverridePasscode[]>([]);
  const [activeOnly, setActiveOnly] = useState(false);
  const [logs, setLogs] = useState<MeterOverrideLog[]>([]);
  const [loading, setLoading] = useState(true);
  const noteRef = useRef<HTMLInputElement>(null);

  /**
   * `silent` = lượt hỏi lại tự động: không bật spinner, để bảng không nhấp nháy sau lưng
   * admin đang đọc mã qua điện thoại.
   *
   * Luôn lấy TOÀN BỘ danh sách rồi lọc ở client. Nếu gọi `activeOnly=true` thì đúng lúc
   * quản lý dùng mã, mã sẽ biến mất khỏi kết quả — không còn gì để đối chiếu và thẻ mã
   * vừa tạo sẽ đứng hình ở trạng thái "còn hiệu lực".
   */
  const reload = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [c, l] = await Promise.all([
        meterOverrideService.listPasscodes(false),
        meterOverrideService.listLogs(),
      ]);
      setCodes(c);
      setLogs(l);
      // Bơm trạng thái mới nhất vào thẻ mã vừa tạo (dạng hàm để không dính state cũ).
      setFresh((prev) => (prev ? c.find((x) => x.id === prev.id) ?? prev : prev));
      setError('');
    } catch {
      setError('Không tải được dữ liệu. Kiểm tra kết nối hoặc quyền truy cập (cần vai trò Admin).');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  /**
   * Trong lúc mã còn sống thì hỏi lại server mỗi 10 giây, để admin thấy "Đã dùng" ngay
   * khi quản lý nhập xong — thay vì phải bấm Tải lại rồi đoán xem đã tới nơi chưa.
   *
   * Dừng hẳn khi mã đã dùng hoặc hết hạn, nên trang mở cả buổi cũng không gọi API liên
   * tục. Không dùng cho toàn trang: chỉ đáng hỏi khi đang có một mã chờ người nhập.
   */
  const freshId = fresh?.id;
  const freshUsed = !!fresh?.usedAt;
  const freshTtlMs = fresh
    ? new Date(fresh.expiresAt).getTime() - new Date(fresh.createdAt).getTime()
    : 0;

  useEffect(() => {
    if (!freshId || freshUsed) return;
    const tick = setInterval(() => { void reload(true); }, 10_000);
    const stop = setTimeout(() => clearInterval(tick), Math.max(0, freshTtlMs));
    return () => { clearInterval(tick); clearTimeout(stop); };
  }, [freshId, freshUsed, freshTtlMs, reload]);

  // Đếm ngược thời gian nghỉ giữa hai lần tạo — chặn double-click và bấm sốt ruột.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const doGenerate = async () => {
    setGenerating(true);
    setError('');
    setConfirming(false);
    try {
      const minutes = Number(ttl);
      const created = await meterOverrideService.generate({
        // Để trống / gõ bậy → không gửi, BE tự dùng mặc định 10 phút.
        ttlMinutes: Number.isFinite(minutes) && minutes > 0 ? Math.min(minutes, 60) : undefined,
        note: note.trim() || undefined,
      });
      setFresh(created);
      // Hạn của mã tính theo đồng hồ MÁY NÀY, suy từ hiệu hai mốc của server (xem
      // FreshCode) — dùng để biết mã trước còn sống không mà không phải hỏi lại server.
      const ttlMs = new Date(created.expiresAt).getTime() - new Date(created.createdAt).getTime();
      freshDeadAtRef.current = Date.now() + (ttlMs > 0 ? ttlMs : 600_000);
      setNote('');
      noteRef.current?.focus();
      void reload(true);
    } catch {
      setError('Không tạo được mã. Thử lại, hoặc kiểm tra tài khoản có vai trò Admin không.');
    } finally {
      // Nghỉ cả khi lỗi — hỏng thì bấm dồn lại càng làm mọi thứ tệ hơn.
      cooldownUntilRef.current = Date.now() + COOLDOWN_SECONDS * 1000;
      busyRef.current = false;
      setCooldown(COOLDOWN_SECONDS);
      setGenerating(false);
    }
  };

  /**
   * Cửa vào của nút "Tạo mã". Ba lớp, xếp theo mức phiền tăng dần.
   *
   * Lớp hỏi-lại mới là lớp đáng giá nhất: lỗi hay gặp không phải spam, mà là manager
   * bảo "em chưa nghe rõ" → admin bấm tạo mã mới thay vì đọc lại mã đang hiện trên màn
   * hình. Mỗi lần như vậy đẻ thêm một chìa khoá vô chủ, đúng thứ cần tránh.
   */
  const requestGenerate = () => {
    // Đọc ref, không đọc state — xem chú thích ở `busyRef`.
    if (busyRef.current || Date.now() < cooldownUntilRef.current) return;
    setError('');

    const liveUnused = codes.filter((c) => c.usable).length;
    if (liveUnused >= MAX_LIVE_UNUSED) {
      setError(
        `Đang có ${liveUnused} mã chưa ai dùng. Đọc lại một mã sẵn có, hoặc chờ chúng hết hạn `
        + 'rồi hãy tạo thêm — mỗi mã còn hạn là một lần bỏ qua được ảnh đồng hồ.',
      );
      return;
    }

    const prevStillUsable = !!fresh && !fresh.usedAt && Date.now() < freshDeadAtRef.current;
    if (prevStillUsable && !confirming) {
      setConfirming(true);
      return;
    }

    // Khoá NGAY tại đây, trước mọi thao tác bất đồng bộ — đây là dòng chặn được spam.
    busyRef.current = true;
    void doGenerate();
  };

  const stats = useMemo(() => ({
    active: codes.filter((c) => c.usable).length,
    used: codes.filter((c) => c.usedAt).length,
    manual: logs.length,
  }), [codes, logs]);

  const visibleCodes = useMemo(
    () => (activeOnly ? codes.filter((c) => c.usable) : codes),
    [codes, activeOnly],
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          title="Mã còn hiệu lực" value={String(stats.active)} icon={KeyRound}
          color="bg-emerald-100 text-emerald-700"
          helper="Chưa dùng và chưa hết hạn"
        />
        <KpiCard
          title="Mã đã được dùng" value={String(stats.used)} icon={Check}
          color="bg-slate-100 text-slate-700"
          helper="Mỗi mã chỉ dùng được một lần"
        />
        <KpiCard
          title="Lần gõ tay chỉ số" value={String(stats.manual)} icon={ShieldAlert}
          color="bg-amber-100 text-amber-700"
          helper="Số lần bỏ qua ảnh đồng hồ"
        />
      </div>

      <SectionShell
        title="Tạo mã nhập tay đồng hồ"
        subtitle="Quản lý gọi xin mã khi không chụp được ảnh đồng hồ. Tạo mã, đọc cho họ, mã tự chết sau khi dùng."
        icon={KeyRound}
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-slate-700">
                Ghi chú <span className="font-normal text-slate-400">(không bắt buộc)</span>
              </label>
              <input
                ref={noteRef}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') requestGenerate(); }}
                placeholder="VD: Quản lý An — đón khách P.302, đồng hồ trong hộp khoá"
                className="input-field mt-1.5 w-full"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Ghi ai xin và vì sao. Lúc soi lại nhật ký, đây là thứ phân biệt trường hợp
                chính đáng với thói quen ngại chụp ảnh.
              </p>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700">Hạn dùng (phút)</label>
              <input
                type="number" min={1} max={60}
                value={ttl}
                onChange={(e) => setTtl(e.target.value)}
                className="input-field mt-1.5 w-32"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Đủ để gọi điện đọc mã là được. Càng ngắn càng ít rủi ro mã bị chuyển tay.
              </p>
            </div>

            {confirming ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-900">
                  Mã vừa tạo vẫn còn dùng được và chưa ai nhập.
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  Quản lý nghe chưa rõ thì đọc lại mã đang hiện bên cạnh — tạo mã mới sẽ
                  để lại thêm một mã trôi nổi cho tới khi nó hết hạn.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={requestGenerate}
                    className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-bold text-white hover:bg-amber-700"
                  >
                    Vẫn tạo mã mới
                  </button>
                  <button
                    onClick={() => setConfirming(false)}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                  >
                    Thôi, đọc lại mã cũ
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={requestGenerate}
                disabled={generating || cooldown > 0}
                className="btn-primary inline-flex w-full items-center justify-center gap-2 py-3 text-base font-bold disabled:opacity-60"
              >
                <KeyRound className="h-5 w-5" />
                {generating ? 'Đang tạo...' : cooldown > 0 ? `Chờ ${cooldown}s` : 'Tạo mã'}
              </button>
            )}

            {stats.active > 0 && (
              <p className="text-xs text-slate-500">
                Đang có <strong>{stats.active}</strong> mã còn hạn chưa ai dùng
                {stats.active >= MAX_LIVE_UNUSED ? ' — đã chạm mức tối đa.' : `/${MAX_LIVE_UNUSED}.`}
              </p>
            )}

            {!!error && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>
            )}
          </div>

          <div>
            {fresh ? (
              <FreshCode passcode={fresh} />
            ) : (
              <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center">
                <KeyRound className="h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-500">Chưa tạo mã nào</p>
                <p className="mt-1 text-xs text-slate-400">
                  Mã sẽ hiện ở đây cỡ lớn để đọc qua điện thoại.
                </p>
              </div>
            )}
          </div>
        </div>
      </SectionShell>

      <SectionShell
        title="Mã đã cấp"
        subtitle="Mã hết hạn không cần thu hồi — tới giờ là tự hỏng."
        icon={ClipboardList}
        action={
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Chỉ mã còn dùng được
            </label>
            <button
              onClick={() => void reload()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Tải lại
            </button>
          </div>
        }
      >
        {loading ? (
          <p className="py-6 text-center text-sm text-slate-500">Đang tải...</p>
        ) : visibleCodes.length === 0 ? (
          <EmptyState text={activeOnly ? 'Không còn mã nào dùng được.' : 'Chưa cấp mã nào.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-4">Mã</th>
                  <th className="pb-2 pr-4">Trạng thái</th>
                  <th className="pb-2 pr-4">Ghi chú</th>
                  <th className="pb-2 pr-4">Tạo lúc</th>
                  <th className="pb-2">Hết hạn</th>
                </tr>
              </thead>
              <tbody>
                {visibleCodes.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-4">
                      <span className={`font-mono text-base font-bold tabular-nums ${
                        c.usable ? 'text-slate-900' : 'text-slate-400 line-through'
                      }`}>
                        {groupCode(c.code)}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {/* Dùng thẳng verdict của BE: nó tính theo giờ server, không lệch múi giờ. */}
                      <StatusPill
                        label={c.message || (c.usable ? 'Còn hiệu lực' : 'Không dùng được')}
                        color={
                          c.usable ? 'bg-emerald-100 text-emerald-700'
                            : c.usedAt ? 'bg-slate-200 text-slate-700'
                              : 'bg-amber-100 text-amber-800'
                        }
                      />
                    </td>
                    <td className="max-w-xs truncate py-3 pr-4 text-slate-600">{c.note || '—'}</td>
                    <td className="py-3 pr-4 text-slate-500">{fmtDateTime(c.createdAt)}</td>
                    <td className="py-3 text-slate-500">{fmtDateTime(c.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionShell>

      <SectionShell
        title="Nhật ký gõ tay chỉ số"
        subtitle="Mỗi dòng là một lần chỉ số được nhập mà KHÔNG có ảnh đồng hồ làm bằng chứng."
        icon={ShieldAlert}
      >
        {loading ? (
          <p className="py-6 text-center text-sm text-slate-500">Đang tải...</p>
        ) : logs.length === 0 ? (
          <EmptyState text="Chưa có lần nào gõ tay chỉ số." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-4">Thời điểm</th>
                  <th className="pb-2 pr-4">Quản lý</th>
                  <th className="pb-2 pr-4">Hợp đồng</th>
                  <th className="pb-2 pr-4">Đồng hồ</th>
                  <th className="pb-2 pr-4">Chỉ số</th>
                  <th className="pb-2">Lý do</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => {
                  const kind = METER_KIND[l.meterKind?.toUpperCase()] ?? {
                    label: l.meterKind, color: 'bg-slate-100 text-slate-600',
                  };
                  return (
                    <tr key={l.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-3 pr-4 text-slate-500">{fmtDateTime(l.createdAt)}</td>
                      <td className="py-3 pr-4 font-semibold text-slate-800">{l.managerName || '—'}</td>
                      <td className="py-3 pr-4 text-slate-600">
                        {/* null = xin mã lúc hợp đồng chưa kịp tạo, giữa luồng đón khách. */}
                        {l.contractId ? `#${l.contractId}` : 'Đang đón khách'}
                      </td>
                      <td className="py-3 pr-4">
                        <StatusPill label={kind.label} color={kind.color} />
                      </td>
                      <td className="py-3 pr-4 font-mono tabular-nums text-slate-800">
                        {l.enteredValue ?? '—'}
                      </td>
                      <td className="max-w-md py-3 text-slate-600">{l.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionShell>
    </div>
  );
};
