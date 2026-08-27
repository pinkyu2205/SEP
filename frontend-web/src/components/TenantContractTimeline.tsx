import { useMemo } from 'react';
import {
  Building2, CalendarRange, CreditCard, DoorOpen, FileText, Info, MapPin, Phone, Wallet, X,
} from 'lucide-react';
import type { HostContractDto } from '@/services/host.service';
import { Overlay } from '@/components/Overlay';
import { MaskedField } from '@/components/MaskedField';

/**
 * Dòng thời gian thuê của MỘT khách thuê — dùng chung cho cổng Host và cổng Admin.
 *
 * "Lịch sử của khách thuê" không cần bảng audit riêng: bản chất nó chính là danh sách
 * hợp đồng của người đó xếp theo thời gian. Component này gom hợp đồng trên TOÀN BỘ
 * bất động sản (không giới hạn căn đang xem) để thấy được khách từng ở đâu, chuyển đi đâu.
 *
 * ⚠️ Giới hạn dữ liệu: hợp đồng đã chấm dứt bị BE gỡ liên kết khách (`lesseeName` = null,
 * có thể mất luôn `tenantPhone`) nên KHÔNG ghép lại được vào đúng người. Những hợp đồng đó
 * sẽ không xuất hiện ở đây — component tự nói rõ điều này thay vì lặng lẽ bỏ sót.
 */

export interface TenantIdentity {
  /** Khoá ghép chính — ổn định hơn tên. */
  phone?: string | null;
  name?: string | null;
}

const STATUS: Record<string, { label: string; chip: string; dot: string }> = {
  ACTIVE:     { label: 'Đang thuê',   chip: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  PENDING:    { label: 'Chờ xử lý',   chip: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500' },
  DRAFT:      { label: 'Nháp',        chip: 'bg-slate-100 text-slate-500',     dot: 'bg-slate-300' },
  EXPIRED:    { label: 'Hết hạn',     chip: 'bg-slate-100 text-slate-500',     dot: 'bg-slate-400' },
  TERMINATED: { label: 'Đã chấm dứt', chip: 'bg-rose-100 text-rose-600',       dot: 'bg-rose-400' },
};

const parseDate = (iso?: string): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

const fmtDate = (iso?: string) => {
  const d = parseDate(iso);
  return d ? d.toLocaleDateString('vi-VN') : '—';
};

const fmtMoney = (v?: number) =>
  v == null ? '—' : new Intl.NumberFormat('vi-VN').format(v) + ' đ';

/** Khoảng thời gian ở, tính tới `endDate` hoặc tới hôm nay nếu hợp đồng còn chạy. */
const durationLabel = (c: HostContractDto): string => {
  const start = parseDate(c.startDate);
  if (!start) return '';
  const end = parseDate(c.endDate) ?? new Date();
  const months = Math.max(
    0,
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()),
  );
  if (months < 1) {
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
    return `${days} ngày`;
  }
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${months} tháng`;
  return rest === 0 ? `${years} năm` : `${years} năm ${rest} tháng`;
};

/** Lọc hợp đồng thuộc về một khách — ưu tiên SĐT, không có thì mới dùng tên. */
export const contractsOfTenant = (
  contracts: HostContractDto[],
  who: TenantIdentity,
): HostContractDto[] => {
  const phone = who.phone?.trim();
  const name = who.name?.trim().toLowerCase();

  const matched = contracts.filter((c) => {
    if (phone && c.tenantPhone) return c.tenantPhone.trim() === phone;
    if (name && c.lesseeName) return c.lesseeName.trim().toLowerCase() === name;
    return false;
  });

  // Mới nhất lên đầu; hợp đồng thiếu ngày bắt đầu xếp cuối.
  return matched.sort((a, b) => {
    const ta = parseDate(a.startDate)?.getTime() ?? 0;
    const tb = parseDate(b.startDate)?.getTime() ?? 0;
    return tb - ta;
  });
};

// ── Ô số liệu tóm tắt ────────────────────────────────────────────────────────
const StatTile = ({ value, label }: { value: number | string; label: string }) => (
  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center">
    <p className="text-lg font-black leading-none text-slate-900">{value}</p>
    <p className="mt-1 text-[11px] font-semibold leading-tight text-slate-500">{label}</p>
  </div>
);

// ── Một mốc trên dòng thời gian ──────────────────────────────────────────────
const TimelineItem = ({ contract, last }: { contract: HostContractDto; last: boolean }) => {
  const st = STATUS[contract.status] ?? STATUS.DRAFT;
  const running = contract.status === 'ACTIVE';

  return (
    <li className="relative pb-3 pl-7 last:pb-0">
      {/* Trục dọc nối các mốc — mốc cuối không cần vẽ tiếp */}
      {!last && <span className="absolute bottom-0 left-[7px] top-5 w-px bg-slate-200" aria-hidden />}
      <span
        className={`absolute left-0 top-[7px] h-[15px] w-[15px] rounded-full ring-[3px] ring-slate-50 ${st.dot}`}
        aria-hidden
      />

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Tên nhà + trạng thái */}
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-slate-900">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
            <span className="truncate">{contract.propertyName}</span>
          </p>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${st.chip}`}>
            {st.label}
          </span>
        </div>

        {/* Kỳ hạn */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3.5 py-2.5 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <CalendarRange className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-semibold">
              {fmtDate(contract.startDate)} → {contract.endDate ? fmtDate(contract.endDate) : running ? 'nay' : 'không thời hạn'}
            </span>
          </span>
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">
            {durationLabel(contract)}
          </span>
          <span className="flex items-center gap-1.5">
            <DoorOpen className="h-3.5 w-3.5 text-slate-400" />
            {contract.roomCode ? `Phòng ${contract.roomCode}` : 'Nguyên căn'}
          </span>
        </div>

        {/* Tiền + mã HĐ */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 bg-slate-50/60 px-3.5 py-2 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <Wallet className="h-3 w-3 text-slate-400" />
            Thuê <b className="text-slate-700">{fmtMoney(contract.rentAmount)}</b>/tháng
          </span>
          {contract.deposit != null && (
            <span>Cọc <b className="text-slate-700">{fmtMoney(contract.deposit)}</b></span>
          )}
          <span className="ml-auto font-mono text-slate-400">{contract.code || '—'}</span>
        </div>
      </div>
    </li>
  );
};

// ── Thân dòng thời gian (nhúng được vào modal/drawer bất kỳ) ─────────────────
export const TenantContractTimeline = ({ contracts }: { contracts: HostContractDto[] }) => {
  const stats = useMemo(() => {
    const properties = new Set(contracts.map((c) => c.propertyName));
    const active = contracts.filter((c) => c.status === 'ACTIVE').length;
    const earliest = contracts
      .map((c) => parseDate(c.startDate))
      .filter((d): d is Date => !!d)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    return { properties: properties.size, active, earliest };
  }, [contracts]);

  if (contracts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
        <FileText className="mx-auto mb-2 h-7 w-7 text-slate-300" />
        <p className="text-sm font-bold text-slate-600">Chưa ghép được hợp đồng nào</p>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-slate-400">
          Khách này chưa có hợp đồng, hoặc hợp đồng cũ đã bị gỡ liên kết khi chấm dứt.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tóm tắt — mỗi số một ô, đọc được ngay thay vì nhồi một hàng */}
      <div>
        <div className="grid grid-cols-3 gap-2">
          <StatTile value={contracts.length} label="hợp đồng" />
          <StatTile value={stats.properties} label="bất động sản đã ở" />
          <StatTile
            value={stats.active}
            label={stats.active > 0 ? 'đang hiệu lực' : 'không còn hiệu lực'}
          />
        </div>
        {stats.earliest && (
          <p className="mt-2 flex items-center gap-1.5 px-1 text-xs text-slate-500">
            <MapPin className="h-3 w-3 text-slate-400" />
            Là khách thuê từ{' '}
            <b className="text-slate-700">{stats.earliest.toLocaleDateString('vi-VN')}</b>
          </p>
        )}
      </div>

      <ul>
        {contracts.map((c, i) => (
          <TimelineItem key={c.id} contract={c} last={i === contracts.length - 1} />
        ))}
      </ul>
    </div>
  );
};

// ── Drawer đầy đủ (dùng ở màn Khách thuê của Host) ───────────────────────────
export const TenantTimelineDrawer = ({ who, contracts, onClose }: {
  who: TenantIdentity;
  /** Toàn bộ hợp đồng đang có — component tự lọc ra của khách này. */
  contracts: HostContractDto[];
  onClose: () => void;
}) => {
  const mine = useMemo(() => contractsOfTenant(contracts, who), [contracts, who]);
  const display = who.name?.trim() || 'Khách thuê';

  // Định danh khách lấy từ hợp đồng mới nhất có dữ liệu (HĐ cũ có thể thiếu).
  // Host/Admin xem được ĐẦY ĐỦ, nhưng hiển thị dạng che + nút mắt để không phơi sẵn
  // trên màn hình. Việc CẤM xem chỉ áp dụng cho ROLE_MANAGER (BE tự mask).
  const cccd = useMemo(() => mine.find((c) => c.tenantCccd)?.tenantCccd, [mine]);
  const phone = who.phone || mine.find((c) => c.tenantPhone)?.tenantPhone;

  return (
    <Overlay>
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Đóng" className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex h-full w-full max-w-[560px] flex-col bg-slate-50 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-lg font-black text-white">
              {display.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-black leading-tight text-slate-950">{display}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                <MaskedField value={phone} icon={Phone} emptyText="chưa có SĐT" head={3} tail={2} />
                <MaskedField value={cccd} icon={CreditCard} prefix="CCCD" emptyText="chưa có CCCD" head={3} tail={3} />
              </div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nội dung */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">
            Dòng thời gian thuê
          </p>
          <TenantContractTimeline contracts={mine} />
        </div>

        {/* Chân — ghi chú giới hạn dữ liệu tách hẳn khỏi nội dung, không chen giữa các mốc */}
        <div className="border-t border-slate-200 bg-white px-6 py-3.5">
          <p className="flex gap-2 text-[11px] leading-relaxed text-slate-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Hợp đồng đã chấm dứt từ lâu có thể không hiện ở đây — hệ thống gỡ liên kết khách
              khỏi hợp đồng khi chấm dứt nên không ghép lại được vào đúng người.
            </span>
          </p>
        </div>
      </div>
    </div>
    </Overlay>
  );
};
