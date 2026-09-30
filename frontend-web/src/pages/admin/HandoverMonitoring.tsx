import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, CheckCircle2, ChevronDown, ChevronRight, DoorOpen, PackageCheck, Search,
} from 'lucide-react';
import { handoverService, type HandoverStatus, type RoomHandover } from '@/services/handover.service';
import { propertyService } from '@/services/property.service';
import { tenantService } from '@/services/tenant.service';
import { buildOccupancyMap, type PropertyOccupancy } from '@/services/propertyOccupancy.service';
import {
  CapacityStat, RoomSquares, CapacityBreakdown, capacityTone,
} from '@/pages/onboarding/CapacityBar';
import { SectionShell, StatusPill, KpiCard, Pagination } from './shared';
import { normalizeRoomNumber, SLOT_LABEL } from '@/services/propertyOccupancy.service';
import { RoomsNotOpenedNote } from '@/pages/onboarding/CapacityBar';
import type { TenantContractResponse } from '@/types/api.types';
import { isNotYetActive } from '@/components/contract/contractLabels';

/** 20 dòng/trang — cùng ngưỡng với bảng Hồ sơ đón khách cho nhất quán. */
const ROWS_PER_PAGE = 20;

/**
 * TIẾN ĐỘ NHẬN NHÀ / GIAO PHÒNG (Admin).
 *
 * Mentor 07/08/2026 (ý 16): "trên web không xem được manager đã tới lấy phòng và giao
 * phòng cho tenant chưa". Trang này trả lời đúng hai câu đó, theo hai cột riêng:
 *
 *   1. NHẬN NHÀ   — manager đã tiếp quản toà nhà từ chủ nhà chưa (`Property.status`)
 *   2. GIAO PHÒNG — đã bàn giao được bao nhiêu / tổng bao nhiêu phòng cho khách thuê
 *
 * Bấm vào một dòng để xổ chi tiết từng phòng: khách nào, ngày vào ở, và quan trọng nhất
 * là **hồ sơ bàn giao có đủ không** (ảnh hiện trạng + chỉ số điện/nước). Thiếu hai thứ
 * đó thì lúc khách trả phòng không có căn cứ trừ cọc — nên trang bôi đỏ để admin đòi
 * manager bổ sung sớm, thay vì phát hiện lúc đã muộn.
 *
 * ⚠️ KHÔNG đụng `BillingPaymentMonitoring.tsx` — trang đó do thành viên khác phụ trách.
 */

/** Toà nhà đã được manager tiếp quản hay chưa — suy từ PropertyStatus của BE. */
const ACCEPTED_STATUSES = new Set(['ACTIVE', 'RENTED', 'MAINTENANCE']);

const PROPERTY_STATUS: Record<string, { label: string; color: string; dot: string }> = {
  DRAFT: { label: 'Nháp', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  PENDING: { label: 'Chờ xử lý', color: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  UNDER_RENOVATION: { label: 'Đang sửa chữa', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  PENDING_EQUIPMENT_INSTALLATION: { label: 'Chờ lắp thiết bị', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  RENOVATION_COMPLETED: { label: 'Sửa xong', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  PENDING_HOST_REVIEW: { label: 'Chờ Host duyệt', color: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  PENDING_OPERATION_MANAGER: { label: 'Chờ QL nhận nhà', color: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
  ACTIVE: { label: 'Đang khai thác', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  RENTED: { label: 'Đã cho thuê', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  DISABLED: { label: 'Ngưng khai thác', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  MAINTENANCE: { label: 'Đang bảo trì', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
};

const CONTRACT_STATUS: Record<string, { label: string; color: string }> = {
  // BE 24/09/2026: pipeline đón khách — nhãn khớp ContractStatus.displayLabelVi().
  DRAFT: { label: 'Chờ đến ngày đón', color: 'bg-slate-100 text-slate-700' },
  AWAITING_ONBOARD: { label: 'Chờ onboard', color: 'bg-blue-100 text-blue-700' },
  AWAITING_PAYMENT: { label: 'Chờ thanh toán', color: 'bg-orange-100 text-orange-700' },
  AWAITING_CONFIRM: { label: 'Chờ xác nhận hợp đồng', color: 'bg-violet-100 text-violet-700' },
  PENDING: { label: 'Chờ thu tiền', color: 'bg-amber-100 text-amber-800' },
  ACTIVE: { label: 'Đã giao phòng', color: 'bg-emerald-100 text-emerald-700' },
  TERMINATED: { label: 'Đã chấm dứt', color: 'bg-zinc-200 text-zinc-700' },
  EXPIRED: { label: 'Hết hạn', color: 'bg-slate-100 text-slate-600' },
};

const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-');
  return day && m && y ? `${day}/${m}/${y}` : d;
};

/** Hồ sơ bàn giao của 1 phòng đã đủ chưa — thiếu là mất căn cứ trừ cọc lúc trả phòng. */
const evidenceGaps = (r: RoomHandover): string[] => {
  const gaps: string[] = [];
  if (!r.conditionPhotoCount) gaps.push('chưa có ảnh hiện trạng');
  if (!r.hasMeterReadings) gaps.push('chưa chốt chỉ số điện/nước');
  return gaps;
};

/**
 * Ba bộ lọc cuối là phần thêm 24/08/2026, khi trang này gánh thêm câu hỏi **"còn nhà nào
 * trống để xếp khách?"**.
 *
 * Trước đó câu đó không có chỗ nào trả lời được: trang Hồ sơ đón khách chỉ liệt kê hợp
 * đồng (1 dòng = 1 khách), muốn biết sức chứa thì phải mở form soạn hợp đồng, chọn từng
 * nhà, đợi phòng tải xong. Trang này mới là nơi đúng — nó vốn đã là "1 dòng = 1 nhà" và
 * đã lấy toàn bộ nhà trong một request.
 *
 * KHÔNG gộp ngược lại vào Hồ sơ đón khách: hai trang khác đơn vị dòng (1 hợp đồng vs
 * 1 nhà), nhét chung một bảng là hỏng cả hai.
 */
type Filter = 'all' | 'not_accepted' | 'has_gap' | 'has_vacancy' | 'not_opened' | 'full';

/**
 * MỘT hàng lọc duy nhất cho cả trang.
 *
 * Bản trước có HAI cơ chế lọc song song: bấm thẻ KPI phía trên cũng lọc, mà hàng chip
 * bên dưới cũng lọc — hai chỗ rời nhau, không nhìn ra là cùng một thứ, và bấm cái này
 * thì cái kia lặng lẽ đổi theo. Nay thẻ KPI chỉ còn là SỐ LIỆU, mọi thao tác lọc gom hết
 * về đây.
 *
 * Mỗi chip kèm số đếm để thấy chỗ nào có việc mà không phải bấm thử từng cái.
 */
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'not_accepted', label: 'Chưa nhận nhà' },
  { key: 'has_vacancy', label: 'Còn phòng trống' },
  { key: 'not_opened', label: 'Chưa mở phòng' },
  { key: 'full', label: 'Hết chỗ' },
  { key: 'has_gap', label: 'Thiếu hồ sơ bàn giao' },
];

export const HandoverMonitoring = () => {
  const [rows, setRows] = useState<HandoverStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  // Chi tiết phòng tải LƯỜI theo từng toà (endpoint list không trả `rooms`).
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Record<number, HandoverStatus>>({});
  const [detailLoading, setDetailLoading] = useState<number | null>(null);

  /**
   * SỨC CHỨA TỪNG NHÀ — nạp dần, vẽ dần.
   *
   * `handover-status` cho `totalRooms` / `roomsHandedOver` nhưng KHÔNG cho số phòng còn
   * nhận được khách: nó không trừ phòng bảo trì, phòng chưa mở cho thuê, và phòng đã có
   * hồ sơ nháp giữ chỗ. Lấy số đó vẫn phải hỏi `/properties/{id}/rooms` từng nhà một
   * (xem doc-be/BE-NEED-suc-chua-nha-2026-08-24.md — nếu BE trả kèm thì bỏ được cả khối
   * này).
   *
   * Nên nạp theo lô và vẽ dần: bảng hiện ngay từ dữ liệu `handover-status`, cột Phòng
   * điền vào sau. Không ai phải ngồi nhìn màn trắng chờ 25 request.
   */
  const [occupancy, setOccupancy] = useState<Map<number, PropertyOccupancy>>(new Map());
  /**
   * Hợp đồng nháp — khách ĐÃ ký hồ sơ nhưng CHƯA được đón vào phòng.
   *
   * `handover-status` không trả nhóm này (nó chỉ biết phòng đã bàn giao), nên nếu chỉ
   * dựa vào nó thì một phòng đã có người chờ dọn vào vẫn hiện trống trơn dấu gạch ngang
   * — nhìn vào tưởng phòng chưa ai đặt. Ghép thêm danh sách nháp để mỗi phòng nói đúng
   * tình trạng của nó.
   */
  const [drafts, setDrafts] = useState<TenantContractResponse[]>([]);

  useEffect(() => {
    handoverService.list()
      .then(setRows)
      .catch(() => setError('Không tải được tiến độ bàn giao. Kiểm tra kết nối hoặc quyền truy cập.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (rows.length === 0) return;
    let cancelled = false;

    (async () => {
      try {
        // `handover-status` không trả `wholeHouse` nên phải ghép với hồ sơ nhà. Hai lời
        // gọi này là danh sách, mỗi cái đúng 1 request — phần tốn kém là vòng phòng dưới.
        const [propPage, draftList] = await Promise.all([
          propertyService.getAllProperties(),
          tenantService.listDrafts().catch(() => []),
        ]);
        if (cancelled) return;
        setDrafts(draftList);

        const byId = new Map((propPage ?? []).map((p) => [p.id, p]));
        const involved = rows
          .map((r) => byId.get(r.propertyId))
          .filter((p): p is NonNullable<typeof p> => !!p);
        if (involved.length === 0) return;

        // Căn nguyên căn đã bàn giao khách thật — `handover-status` là nguồn duy nhất
        // biết được điều này (xem `occupiedIds`).
        const occupiedIds = new Set(
          rows.filter((x) => (x.roomsHandedOver ?? 0) > 0).map((x) => x.propertyId),
        );
        // Đồng bộ, không request nào: BE đã trả sẵn số phòng trong `PropertyResponse`.
        setOccupancy(buildOccupancyMap(involved, draftList, occupiedIds));
      } catch {
        // Không có số phòng trống thì bảng vẫn dùng được cho phần bàn giao — cột Phòng
        // tự hiện "—" chứ không làm hỏng cả trang.
      }
    })();

    return () => { cancelled = true; };
  }, [rows]);

  const toggle = async (propertyId: number) => {
    if (openId === propertyId) { setOpenId(null); return; }
    setOpenId(propertyId);
    if (detail[propertyId]) return;
    setDetailLoading(propertyId);
    try {
      const d = await handoverService.detail(propertyId);
      setDetail((prev) => ({ ...prev, [propertyId]: d }));
    } catch {
      // Không chặn cả trang vì một toà lỗi — dòng đó hiện thông báo riêng bên dưới.
    } finally {
      setDetailLoading(null);
    }
  };

  const stats = useMemo(() => {
    const accepted = rows.filter((r) => ACCEPTED_STATUSES.has(r.propertyStatus)).length;
    const totalRooms = rows.reduce((s, r) => s + (r.totalRooms ?? 0), 0);
    const handed = rows.reduce((s, r) => s + (r.roomsHandedOver ?? 0), 0);
    // Chỗ trống cộng từ sức chứa đã nạp được — trong lúc còn nạp thì con số này tăng dần,
    // nên KpiCard đi kèm một dòng nói rõ đang đếm tới đâu.
    const loadedOcc = [...occupancy.values()].filter((o) => o.loaded);
    const vacancies = loadedOcc.reduce((s, o) => s + o.available, 0);
    const housesWithVacancy = loadedOcc.filter((o) => o.available > 0).length;
    return {
      total: rows.length, accepted, notAccepted: rows.length - accepted,
      totalRooms, handed, vacancies, housesWithVacancy,
    };
  }, [rows, occupancy]);

  /**
   * Hồ sơ nháp tra theo `{propertyId}#{số phòng}`.
   *
   * Chuẩn hoá số phòng vì hai nguồn ghi khác nhau — `handover-status` trả "101" còn hợp
   * đồng có thể lưu "P.101" (xem `normalizeRoomNumber`).
   */
  const draftByRoom = useMemo(() => {
    const m = new Map<string, TenantContractResponse>();
    for (const d of drafts) {
      m.set(`${d.propertyId}#${normalizeRoomNumber(d.roomNumber ?? '')}`, d);
    }
    return m;
  }, [drafts]);

  /**
   * Một dòng có khớp bộ lọc không — tách riêng để dùng cho CẢ hai việc: lọc bảng, và
   * đếm số bên cạnh mỗi chip. Viết hai lần thì kiểu gì cũng có ngày chip nói một đằng
   * bảng ra một nẻo.
   */
  const matchesFilter = useCallback((r: HandoverStatus, f: Filter): boolean => {
    if (f === 'all') return true;
    if (f === 'not_accepted') return !ACCEPTED_STATUSES.has(r.propertyStatus);
    if (f === 'has_gap') {
      // Chỉ biết được sau khi đã mở chi tiết — chưa mở thì không lọc ra, tránh gọi API
      // cho toàn bộ danh sách chỉ để đếm.
      const d = detail[r.propertyId];
      return !!d?.rooms?.some((room) => evidenceGaps(room).length > 0);
    }

    // Ba bộ lọc theo chỗ trống: nhà chưa nạp xong sức chứa thì KHÔNG lọc ra, thà thiếu
    // còn hơn khẳng định sai. Dòng nhắc tiến độ nạp ở dưới cho biết đang còn thiếu.
    const o = occupancy.get(r.propertyId);
    if (!o?.loaded) return false;
    if (f === 'has_vacancy') return o.available > 0;
    if (f === 'not_opened') return o.propertyStatus === 'ACTIVE' && o.notReady > 0;
    return capacityTone(o) === 'full';
  }, [detail, occupancy]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !(`${r.propertyName} ${r.operationManagerName ?? ''}`.toLowerCase().includes(q))) return false;
      return matchesFilter(r, filter);
    });
  }, [rows, search, filter, matchesFilter]);

  /** Số bên cạnh mỗi chip — đếm trên TOÀN BỘ nhà, không theo ô tìm đang gõ. */
  const filterCounts = useMemo(() => {
    const out = {} as Record<Filter, number>;
    for (const f of FILTERS) out[f.key] = rows.filter((r) => matchesFilter(r, f.key)).length;
    return out;
  }, [rows, matchesFilter]);

  /**
   * PHÂN TRANG — chỉ cắt phần HIỂN THỊ, sức chứa vẫn nạp nền cho toàn bộ nhà.
   *
   * Phải tách hai thứ đó ra: chip lọc "Còn phòng trống" cần số liệu của MỌI nhà mới lọc
   * đúng, nên không thể chỉ nạp phòng của trang đang xem. Ngược lại, đổ 200 dòng ra DOM
   * cùng lúc thì bảng dài vô tận. Nạp hết + vẽ từng trang giải quyết được cả hai.
   */
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  // Đổi lọc/tìm mà đang đứng ở trang 5 thì rơi vào khoảng trắng — kéo về trang 1.
  useEffect(() => { setPage(1); }, [search, filter]);
  const pageStart = (page - 1) * ROWS_PER_PAGE;
  const pageRows = filtered.slice(pageStart, pageStart + ROWS_PER_PAGE);

  return (
    <div className="space-y-5">
      {/*
        Bốn thẻ, và CHỈ LÀ SỐ LIỆU — bỏ hết `onClick` lọc.

        Bản trước năm thẻ đều bấm được để lọc, trong khi bên dưới lại có thêm một hàng
        chip cũng lọc. Hai cơ chế cho cùng một việc, đặt ở hai chỗ trông chẳng liên quan
        gì nhau, bấm cái này thì cái kia lặng lẽ đổi theo. Nay mọi thao tác lọc gom về
        đúng một hàng chip ngay trên bảng.

        Thẻ thứ năm cũ ("Hồ sơ bàn giao thiếu") hiện "—" cho tới khi bấm vào nó — một
        con số không có thì không phải KPI. Đưa xuống thành một chip lọc.
      */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Toà nhà theo dõi" value={String(stats.total)} icon={Building2}
          color="bg-slate-100 text-slate-700"
        />
        <KpiCard
          title="Quản lý đã nhận nhà" value={`${stats.accepted}/${stats.total}`} icon={PackageCheck}
          color="bg-emerald-100 text-emerald-700"
          helper={stats.notAccepted > 0 ? `${stats.notAccepted} toà chưa tiếp quản` : 'Đã tiếp quản hết'}
        />
        {/* Chỗ còn nhận được khách — câu hỏi mà trước 24/08/2026 không màn nào trả lời được. */}
        <KpiCard
          title="Chỗ còn trống" value={String(stats.vacancies)} icon={DoorOpen}
          color="bg-emerald-100 text-emerald-700"
          helper={` nhà còn nhận khách`}
        />
        <KpiCard
          title="Phòng đã giao khách" value={`${stats.handed}/${stats.totalRooms}`} icon={CheckCircle2}
          color="bg-cyan-100 text-cyan-700"
          helper="Đã bàn giao cho khách thuê"
        />
      </div>

      <SectionShell
        title="Tình trạng từng nhà"
        subtitle="Quản lý đã tiếp quản nhà chưa, mỗi nhà còn mấy phòng nhận được khách, và hồ sơ bàn giao đã đủ chưa."
        icon={PackageCheck}
        action={
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm toà nhà / quản lý..."
              className="input-field w-64 pl-9"
            />
          </div>
        }
      >
        {/*
          Hàng lọc DUY NHẤT, nằm ngay trên bảng — thứ nó lọc.
          Bản trước chip lọc bị nhét chung hàng với ô tìm ở góc phải header, đủ chỗ cho ba
          cái là tràn xuống dòng, và chẳng có gì nói cho biết nó lọc cái bảng bên dưới.

          Số bên cạnh mỗi chip đếm trên TOÀN BỘ nhà: nhìn phát biết chỗ nào có việc, khỏi
          bấm thử từng cái. Chip nào đếm ra 0 thì làm mờ chứ không ẩn — ẩn đi thì hàng lọc
          nhảy chỗ mỗi lần dữ liệu đổi.
        */}
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => {
            const n = filterCounts[f.key] ?? 0;
            const active = filter === f.key;
            // `has_gap` chỉ đếm được sau khi mở chi tiết từng toà nên số của nó không
            // đáng tin — không hiện số, tránh nói dối là "không có toà nào thiếu".
            const showCount = f.key !== 'has_gap';
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : n === 0 && showCount
                      ? 'border-slate-200 text-slate-300'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                {f.label}
                {showCount && (
                  <span className={`ml-1.5 ${active ? 'text-white/70' : 'text-slate-400'}`}>{n}</span>
                )}
              </button>
            );
          })}

          <span className="ml-auto text-xs text-slate-400">
            {` nhà`}
          </span>
        </div>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
            <p className="text-sm text-slate-400">Đang tải...</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-8 text-center text-sm text-rose-700">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
            {filter === 'has_gap'
              ? 'Mở chi tiết vài toà trước — bộ lọc này chỉ soi được những toà đã tải chi tiết.'
              : "Không có toà nhà nào khớp bộ lọc."}
          </div>
        ) : (
          <div className="space-y-2">
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="table-header">
                <tr>
                  {/*
                    Bỏ cột "Trạng thái nhà" — nó chiếm nguyên một cột để lặp lại "Đang
                    khai thác" ở hầu hết dòng. Chuyển thành nhãn nhỏ ngay dưới tên nhà,
                    vừa gọn vừa đọc liền mạch với tên.
                  */}
                  <th className="w-10 px-4 py-3" />
                  <th className="px-4 py-3">Toà nhà</th>
                  <th className="px-4 py-3">Quản lý vận hành</th>
                  <th className="px-4 py-3">Nhận nhà từ chủ</th>
                  <th className="px-4 py-3">Phòng · chỗ trống</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((r) => {
                  const accepted = ACCEPTED_STATUSES.has(r.propertyStatus);
                  const cfg = PROPERTY_STATUS[r.propertyStatus]
                    ?? { label: r.propertyStatus, color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };
                  const total = r.totalRooms ?? 0;
                  const handed = r.roomsHandedOver ?? 0;
                  const pct = total > 0 ? Math.round((handed / total) * 100) : 0;
                  const open = openId === r.propertyId;
                  const d = detail[r.propertyId];
                  const occ = occupancy.get(r.propertyId);

                  return (
                    // Fragment phải mang `key` — key trên các <tr> bên trong không đủ,
                    // React vẫn cảnh báo và mất tối ưu khi danh sách đổi thứ tự.
                    <Fragment key={r.propertyId}>
                      <tr
                        onClick={() => toggle(r.propertyId)}
                        className="cursor-pointer hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 text-slate-400">
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </td>
                        {/*
                          Tên nhà 1 dòng + nhãn trạng thái ngay dưới (thay cho cột riêng
                          đã bỏ). `max-w` + `truncate` để tên dài không đẩy dòng cao gấp
                          đôi — bản trước "MTX#06 NGUYEN_CAN đủ" xuống 2 dòng, cộng thêm
                          "Quản Lý Vận / Hành 01" cũng 2 dòng, nên một màn chỉ xem được
                          3 nhà.
                        */}
                        <td className="max-w-[260px] px-4 py-2.5">
                          <p className="truncate font-semibold text-slate-800" title={r.propertyName}>
                            {r.propertyName}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="text-xs text-slate-400">#{r.propertyId}</span>
                            <StatusPill label={cfg.label} color={cfg.color} dot={cfg.dot} />
                          </div>
                        </td>
                        <td className="max-w-[210px] px-4 py-2.5 text-slate-700">
                          {r.operationManagerName
                            ? <span className="block truncate" title={r.operationManagerName}>{r.operationManagerName}</span>
                            : <span className="text-rose-600">Chưa giao quản lý</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          {accepted ? (
                            <>
                              <StatusPill label="Đã nhận" color="bg-emerald-100 text-emerald-700" dot="bg-emerald-500" />
                              <p className="mt-1 text-xs text-slate-500">{fmtDateTime(r.managerAcceptedAt)}</p>
                            </>
                          ) : (
                            <StatusPill label="Chưa nhận" color="bg-rose-100 text-rose-700" dot="bg-rose-500" />
                          )}
                        </td>
                        {/*
                          Cột này THAY cho thanh "đã giao X/Y phòng" cũ.
                          Thanh đó chỉ nói được một chiều (đã giao bao nhiêu), trong khi
                          thứ admin cần khi xếp khách là chiều ngược lại: CÒN nhận được
                          mấy chỗ. Số phòng đang thuê vẫn thấy nguyên trong phần chú
                          thích bên dưới ô màu, nên không mất thông tin nào.
                        */}
                        <td className="px-4 py-2.5">
                          {occ?.loaded ? (
                            // `compact`: trong bảng chỉ cần con số, cột đã có tiêu đề
                            // "Phòng · chỗ trống" rồi — xem chú thích ở `CapacityStat`.
                            <div className="flex items-baseline gap-3">
                              <CapacityStat occ={occ} compact />
                              <div className="min-w-0">
                                <RoomSquares occ={occ} />
                                <CapacityBreakdown occ={occ} />
                                <RoomsNotOpenedNote occ={occ} />
                              </div>
                            </div>
                          ) : (
                            // Chưa nạp xong: đỡ tạm bằng số của `handover-status` để dòng
                            // không trống trơn, và nói rõ đây là "đã giao", không phải
                            // "còn trống" — hai con số khác nhau.
                            <div className="flex items-center gap-3">
                              <span className="w-7 shrink-0 text-right text-xl font-black text-slate-300">–</span>
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                                <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-cyan-500'}`}
                                  style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs text-slate-400">
                                {handed}/{total || '—'} đã giao
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>

                      {open && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={5} className="px-4 py-4">
                            {detailLoading === r.propertyId ? (
                              <p className="text-sm text-slate-400">Đang tải chi tiết phòng...</p>
                            ) : !d ? (
                              <p className="text-sm text-rose-600">Không tải được chi tiết toà này.</p>
                            ) : !d.rooms?.length ? (
                              <p className="text-sm text-slate-500">
                                Toà này chưa có phòng nào được bàn giao cho khách thuê.
                              </p>
                            ) : (
                              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                <table className="w-full min-w-[760px] text-left text-xs">
                                  <thead className="bg-slate-50 text-slate-500">
                                    <tr>
                                      <th className="px-3 py-2 font-semibold">Phòng</th>
                                      <th className="px-3 py-2 font-semibold">Khách thuê</th>
                                      <th className="px-3 py-2 font-semibold">Ngày vào ở</th>
                                      <th className="px-3 py-2 font-semibold">Kích hoạt HĐ</th>
                                      <th className="px-3 py-2 font-semibold">Hồ sơ bàn giao</th>
                                      <th className="px-3 py-2 font-semibold">Trạng thái HĐ</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {d.rooms.map((room, i) => {
                                      /*
                                        Ghép ba nguồn để mỗi phòng nói đúng tình trạng của nó:
                                          1. `room` từ handover-status — chỉ biết phòng ĐÃ bàn giao
                                          2. hồ sơ nháp — khách đã ký nhưng CHƯA được đón vào
                                          3. sức chứa   — phòng chưa có ai thì đang trống hay chưa mở

                                        Thiếu (2) là lỗi thấy rõ trên màn: phòng đã có người chờ dọn
                                        vào vẫn hiện dấu gạch ngang ở cột Khách thuê, nhìn vào tưởng
                                        chưa ai đặt.
                                      */
                                      const key = normalizeRoomNumber(room.roomNumber ?? '');
                                      // Nguyên căn: `handover-status` trả roomNumber "Toàn nhà" còn hợp đồng lưu
                                      // null, nên khoá chính xác không khớp — lùi về khoá cả căn (`{id}#`).
                                      // Khoá rỗng đó chỉ tồn tại với hợp đồng nguyên căn nên không đụng nhà chia phòng.
                                      const dr = draftByRoom.get(`${r.propertyId}#${key}`)
                                        ?? draftByRoom.get(`${r.propertyId}#`);
                                      const slot = occ?.byRoomNumber.get(key);

                                      const tenantName = room.tenantName || dr?.tenantFullName || null;
                                      const status = room.contractStatus || dr?.status || (dr ? 'DRAFT' : null);
                                      // Hồ sơ nháp thì mốc đáng quan tâm là NGÀY DỰ KIẾN ĐÓN, không
                                      // phải ngày vào ở — chưa vào thì chưa có ngày vào thật.
                                      const dateLabel = room.moveInDate || dr?.expectedReceptionDate || dr?.moveInDate;

                                      const gaps = evidenceGaps(room);
                                      const cs = status
                                        ? CONTRACT_STATUS[status] ?? { label: status, color: 'bg-slate-100 text-slate-600' }
                                        : null;

                                      return (
                                        <tr key={`${room.roomNumber}-${i}`} className="hover:bg-slate-50">
                                          <td className="px-3 py-2 font-semibold text-slate-800">
                                            {room.roomNumber || 'Nguyên căn'}
                                          </td>
                                          <td className="px-3 py-2 text-slate-700">{tenantName ?? '—'}</td>
                                          <td className="px-3 py-2 text-slate-600">{fmtDate(dateLabel)}</td>
                                          <td className="px-3 py-2 text-slate-600">{fmtDateTime(room.activatedAt)}</td>

                                          <td className="px-3 py-2">
                                            {!status ? (
                                              // Phòng chưa có ai thì không thể có hồ sơ bàn giao, nên
                                              // bôi đỏ "thiếu ảnh" ở đây là báo động giả. Bản trước làm
                                              // vậy nên nhà nào trống nhiều là đỏ rực cả bảng.
                                              <span className="text-slate-400">—</span>
                                            ) : isNotYetActive(status) ? (
                                              <span className="text-slate-400">Chưa đón khách</span>
                                            ) : gaps.length === 0 ? (
                                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                Đủ ({room.conditionPhotoCount} ảnh + chỉ số)
                                              </span>
                                            ) : (
                                              <span className="font-semibold text-rose-600">⚠ {gaps.join(' · ')}</span>
                                            )}
                                          </td>

                                          <td className="px-3 py-2">
                                            {cs ? (
                                              <StatusPill label={cs.label} color={cs.color} />
                                            ) : slot ? (
                                              // Chưa có hợp đồng thì nói trạng thái PHÒNG (trống / chưa
                                              // mở cho thuê / bảo trì) — hữu ích hơn hẳn một dấu gạch.
                                              <StatusPill
                                                label={SLOT_LABEL[slot.state]}
                                                color={slot.state === 'AVAILABLE'
                                                  ? 'bg-emerald-100 text-emerald-700'
                                                  : 'bg-slate-100 text-slate-600'}
                                              />
                                            ) : (
                                              <span className="text-slate-400">—</span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                                <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400">
                                  Thiếu ảnh hiện trạng hoặc chỉ số điện/nước thì lúc khách trả phòng sẽ không có
                                  căn cứ để trừ cọc — nhắc quản lý bổ sung sớm.
                                </p>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <p className="text-xs text-slate-400">
              Hiện {pageRows.length}/{filtered.length} nhà
              {filtered.length !== rows.length ? ` (lọc từ ${rows.length})` : ''}
            </p>
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </div>
          </div>
        )}
      </SectionShell>
    </div>
  );
};

export default HandoverMonitoring;
