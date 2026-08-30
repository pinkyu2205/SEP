import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle, Building2, DoorClosed, Home, KeyRound, RefreshCw, Wallet,
} from 'lucide-react';
import { propertyService } from '@/services/property.service';
import type { PropertyResponse } from '@/types/api.types';
import { monthLabel } from '@/utils/period';
import { MonthPicker, useServerPeriod } from '../shared';
import {
  usePropertyListFilters, isHostApproved, formatVnd, type RoomPriceRange,
} from './propertyListState';
import { useHostPropertyStatus } from './propertyOperationStatus';
import {
  StatTile, PendingApprovalPanel, FilterToolbar, ResultBar, BillSourceNote,
  PropertyCard, PropertyTable, ListPagination,
} from './PropertyListParts';

export const PropertyList = () => {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  /** id nhà → khoảng giá suy từ phòng; xem effect bên dưới. */
  const [roomPrices, setRoomPrices] = useState<Record<number, RoomPriceRange | null>>({});

  const fetchProperties = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [res, mgrs] = await Promise.all([
        propertyService.getAllProperties(),
        propertyService.getManagers().catch(() => [] as { id: string; fullName: string; username: string }[]),
      ]);
      // Patch operationManagerName nếu BE chưa trả (mục 6 NOTE-CHO-TEAM-BE.md)
      const mgrsMap = new Map(mgrs.map(m => [m.id, m.fullName || m.username]));
      const content = res.map(p =>
        p.operationManagerId && !p.operationManagerName
          ? { ...p, operationManagerName: mgrsMap.get(p.operationManagerId) }
          : p
      );
      setProperties(content);
    } catch (e) {
      console.error(e);
      setLoadError(true);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchProperties(); }, []);

  // Hồ sơ chờ duyệt: mới nhận được lên đầu. BE không trả createdAt nên dùng id
  // (auto-increment) — id lớn hơn = admin gửi sang sau.
  const pending = useMemo(
    () => properties.filter(p => p.status === 'PENDING_HOST_REVIEW').sort((a, b) => b.id - a.id),
    [properties],
  );
  // Chỉ hiện nhà Host đã duyệt thành công — xem isHostApproved().
  const active = useMemo(() => properties.filter(isHostApproved), [properties]);

  /** Kỳ đang xem cho phần thu tiền. Khai thác không phụ thuộc kỳ (luôn là hiện tại). */
  const [period, setPeriod] = useServerPeriod();
  const { status: opStatus, billSource, loading: opLoading, reload: reloadStatus } =
    useHostPropertyStatus(active, period);

  const f = usePropertyListFilters(active, opStatus);

  // Số liệu tổng quan
  const kpi = useMemo(() => {
    const acc = {
      total: 0, noMgr: 0, rooms: 0,
      /** Tổng giá NIÊM YẾT của cả danh mục — giá chào, không phải tiền về. */
      revenue: 0,
      /** Tổng tiền THẬT đang thu mỗi tháng từ các hợp đồng đang chạy. */
      earning: 0,
      /** Đang ra tiền: đã kín khách hoặc mới có vài phòng. */
      occupied: 0,
      vacant: 0,
      /** Phòng thật đang có khách / tổng phòng thật — khác `totalRooms` khai báo. */
      rentedRooms: 0, realRooms: 0,
      /** Căn còn hoá đơn chưa thu trong kỳ, và tổng tiền còn thiếu. */
      unpaidProperties: 0, outstanding: 0,
    };
    for (const p of active) {
      acc.total += 1;
      acc.noMgr += p.operationManagerId ? 0 : 1;
      acc.rooms += p.totalRooms || 0;
      // Nhà chia phòng không đặt giá ở cấp toà nhà thì lấy giá phòng đã suy ra. Dùng
      // `max` chứ không phải `min`: card và bảng đều hiện giá phòng CAO NHẤT
      // (`formatRoomPriceTop`), cộng bằng `min` là tổng ở tiêu đề không khớp với chính
      // những con số đang hiện bên dưới.
      acc.revenue += p.price ?? roomPrices[p.id]?.max ?? 0;

      const op = opStatus.get(p.id);
      if (!op) continue;
      // Tiền THẬT đang về mỗi tháng — tổng hợp đồng đang chạy, không phải giá niêm yết.
      acc.earning += op.activeRent;
      if (op.rental === 'RENTED' || op.rental === 'PARTIAL') acc.occupied += 1;
      if (op.rental === 'VACANT') acc.vacant += 1;
      acc.rentedRooms += op.occ.rented;
      acc.realRooms += op.occ.wholeHouse ? 1 : op.occ.roomCount;
      if (op.bills.pending + op.bills.overdue > 0) acc.unpaidProperties += 1;
      acc.outstanding += op.bills.outstanding;
    }
    return acc;
  }, [active, roomPrices, opStatus]);

  /*
    BE list không trả imageUrls → lấy thêm ảnh cho các căn đang hiển thị.

    Chỉ lấy cho khối "chờ duyệt" và cho chế độ BẢNG. Card ở chế độ lưới đã bỏ hẳn ảnh
    (30/08/2026), nên nếu vẫn nạp thì mỗi lần lật trang lưới là bắn thêm 9 request
    `GET /properties/{id}` chỉ để lấy thứ không ai nhìn.
  */
  const fetchedImagesRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const all = [...pending, ...(f.view === 'table' ? f.paged : [])];
    const needImages = all.filter(p => !p.imageUrls?.length && !fetchedImagesRef.current.has(p.id));
    if (!needImages.length) return;
    needImages.forEach(p => fetchedImagesRef.current.add(p.id));
    Promise.allSettled(
      needImages.map(p =>
        propertyService.getPropertyById(p.id)
          .then(detail => {
            if (detail.imageUrls?.length)
              setProperties(prev => prev.map(prop => prop.id === p.id ? { ...prop, imageUrls: detail.imageUrls } : prop));
          }).catch(() => {})
      )
    );
  }, [f.paged, f.view, pending]);

  /**
   * Nhà CHIA PHÒNG không có giá ở cấp toà nhà — giá nằm trên từng phòng (`rooms[].price`),
   * `Property.price` để null. Card cũ đọc thẳng `p.price` nên ghi "Chưa định giá" trong
   * khi mở chi tiết ra thì phòng nào cũng có giá. Lấy thêm phòng của đúng những căn
   * thiếu giá để hiện khoảng giá thật (rất ít căn rơi vào trường hợp này).
   */
  const fetchedRoomsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    const need = properties.filter(p =>
      p.wholeHouse === false && p.price == null && !fetchedRoomsRef.current.has(p.id));
    if (!need.length) return;
    need.forEach(p => fetchedRoomsRef.current.add(p.id));
    need.forEach(p => {
      propertyService.getRooms(p.id)
        .then(rooms => {
          const prices = rooms.map(r => r.price).filter((v): v is number => v != null && v > 0);
          setRoomPrices(prev => ({
            ...prev,
            [p.id]: prices.length
              ? { min: Math.min(...prices), max: Math.max(...prices), rooms: prices.length }
              : null,
          }));
        })
        .catch(() => setRoomPrices(prev => ({ ...prev, [p.id]: null })));
    });
  }, [properties]);

  return (
    <div className="space-y-5 pb-6">
      {/* ── Tiêu đề ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.15em] text-indigo-500">Vận hành</p>
            <h1 className="mt-0.5 text-2xl font-black leading-tight text-slate-900">Bất động sản</h1>
            {/*
              Tiền ĐANG THU đứng trước, giá niêm yết lùi về sau và ghi rõ là "cả danh
              mục nếu cho thuê hết".

              Bản cũ chỉ có một số duy nhất — "tổng giá niêm yết 594.719.716 đ/tháng".
              Với 2/51 căn có khách thì tiền thật về chỉ khoảng 29tr, nhưng câu chữ đó
              đọc lướt qua rất giống doanh thu. Một con số đứng cạnh chữ "/tháng" ở
              ngay dưới tiêu đề thì mặc định được hiểu là tiền vào túi.
            */}
            <p className="mt-1 text-sm font-medium text-slate-500">
              {kpi.total} tòa nhà đang quản lý · {kpi.rooms} phòng
              {kpi.earning > 0 && (
                <> · đang thu <b className="text-emerald-600">{formatVnd(kpi.earning)}</b>/tháng</>
              )}
              {kpi.revenue > 0 && (
                <span className="text-slate-400">
                  {' '}· niêm yết cả danh mục {formatVnd(kpi.revenue)}/tháng
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/*
            Hợp đồng + hoá đơn về SAU danh sách nhà, nên nói rõ đang tính: khoảng lặng
            giữa lúc card hiện ra và lúc có badge khai thác dễ bị đọc thành "hệ thống
            không có dữ liệu đó".
          */}
          {opLoading && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-500">
              <RefreshCw className="h-3 w-3 animate-spin" /> Đang tính tình trạng…
            </span>
          )}
          {/* Kỳ CHỈ đổi phần thu tiền — tình trạng khai thác luôn là "ngay lúc này". */}
          <MonthPicker value={period} onChange={setPeriod} />
          <button onClick={() => { fetchProperties(); reloadStatus(); }} disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
          </button>
        </div>
      </div>

      {/* ── Hồ sơ chờ phê duyệt ── */}
      <PendingApprovalPanel items={pending} onOpen={p => navigate(`/host/review/${p.id}`)} />

      {/*
        ── Số liệu: bấm để lọc nhanh ──
        Trước 30/08/2026 hai ô giữa là "Nhà nguyên căn / Nhà chia phòng" — thông tin
        TĨNH, host xem một lần lúc nhận nhà rồi thôi, mà lại chiếm đúng chỗ dễ nhìn
        nhất. Nay thay bằng hai câu hỏi host hỏi mỗi ngày: căn nào đang ra tiền, căn
        nào chưa. Lọc theo loại hình chuyển vào "Bộ lọc" (vẫn còn nguyên).
      */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={Building2} label="Tổng tòa nhà" value={kpi.total} tone="indigo"
          helper="đã được bạn duyệt giá"
          onClick={() => { f.reset(); }} active={f.activeCount === 0} />
        <StatTile icon={KeyRound} label="Đang có khách" value={kpi.occupied} tone="emerald"
          helper={kpi.realRooms > 0 ? `${kpi.rentedRooms}/${kpi.realRooms} chỗ đã có người` : 'trên tổng số nhà'}
          progress={kpi.total ? kpi.occupied / kpi.total : 0}
          onClick={() => f.setRental(f.rental === 'rented' ? 'all' : 'rented')} active={f.rental === 'rented'} />
        <StatTile icon={DoorClosed} label="Đang để trống" value={kpi.vacant} tone="rose"
          helper="chưa có khách nào" progress={kpi.total ? kpi.vacant / kpi.total : 0}
          onClick={() => f.setRental(f.rental === 'vacant' ? 'all' : 'vacant')} active={f.rental === 'vacant'} />
        <StatTile icon={Wallet} label={`Chưa thu đủ ${monthLabel(period).toLowerCase()}`}
          value={billSource === 'none' ? '—' : kpi.unpaidProperties} tone="amber"
          helper={kpi.outstanding > 0 ? `còn ${formatVnd(kpi.outstanding)} chưa vào` : 'không còn khoản nào'}
          progress={kpi.total ? kpi.unpaidProperties / kpi.total : 0}
          onClick={() => f.setBill(f.bill === 'debt' ? 'all' : 'debt')} active={f.bill === 'debt'} />
      </div>

      {/*
        "Chưa có quản lý" từng là một ô số liệu riêng, nhưng hầu như luôn bằng 0 —
        chiếm một ô cố định để hiện số 0 là lãng phí chỗ. Nay chỉ hiện khi thật sự có
        vấn đề; bộ lọc theo quản lý vẫn nằm trong "Bộ lọc".
      */}
      {kpi.noMgr > 0 && (
        <button onClick={() => f.setManager(f.manager === 'unassigned' ? 'all' : 'unassigned')}
          className="flex w-full items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-left text-xs font-bold text-rose-700 transition hover:bg-rose-100">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {kpi.noMgr} tòa nhà nằm ở khu vực chưa được gán quản lý vận hành — bấm để xem.
        </button>
      )}

      <BillSourceNote source={billSource} loading={opLoading} />

      {/* ── Tìm kiếm & bộ lọc ── */}
      <FilterToolbar f={f} />

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
          <p className="text-sm font-medium text-slate-400">Đang tải dữ liệu...</p>
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-rose-200 bg-white py-20 text-center">
          <div className="mb-4 rounded-2xl bg-rose-50 p-5">
            <AlertCircle className="h-10 w-10 text-rose-300" />
          </div>
          <p className="font-semibold text-rose-500">Không tải được danh sách tòa nhà. Máy chủ có thể đang khởi động lại.</p>
          <button onClick={fetchProperties}
            className="mt-4 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700">
            Thử lại
          </button>
        </div>
      ) : f.filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center">
          <div className="mb-4 rounded-2xl bg-slate-50 p-5">
            {f.activeCount > 0
              ? <Wallet className="h-10 w-10 text-slate-200" />
              : <Home className="h-10 w-10 text-slate-200" />}
          </div>
          <p className="font-semibold text-slate-500">
            {f.activeCount > 0 ? 'Không có tòa nhà nào khớp bộ lọc.' : 'Chưa có tòa nhà nào đang quản lý.'}
          </p>
          {f.activeCount > 0 && (
            <button onClick={f.reset}
              className="mt-4 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50">
              Xóa bộ lọc
            </button>
          )}
        </div>
      ) : (
        <>
          <ResultBar f={f} />

          {f.view === 'table' ? (
            <PropertyTable rows={f.paged} roomPrices={roomPrices}
              opStatus={opStatus} billSource={billSource}
              onRowClick={p => navigate(`/host/properties/${p.id}`)} />
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {f.paged.map(p => (
                <PropertyCard key={p.id} p={p} roomPrice={roomPrices[p.id]}
                  op={opStatus.get(p.id)} billSource={billSource}
                  onClick={() => navigate(`/host/properties/${p.id}`)} />
              ))}
            </div>
          )}

          <ListPagination page={f.page} totalPages={f.totalPages} onChange={f.setPage} />
        </>
      )}
    </div>
  );
};
