import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import {
  Package, Printer, QrCode, Search, Loader2, MapPin, ShieldCheck, Wrench,
  X, Download, CheckSquare, Square, AlertTriangle, ScanLine, Rows3, Table2,
  ChevronUp, ChevronDown, ArrowUpDown,
} from 'lucide-react';
import { propertyService } from '@/services/property.service';
import { equipmentService } from '@/services/equipment.service';
import { serverNow } from '@/utils/serverTime';
import { PropertyPicker } from '@/pages/onboarding/PropertyPicker';
import type { PropertyResponse, MaintenanceEquipmentResponse } from '@/types/api.types';

/**
 * Danh mục thiết bị & in tem QR (trang admin).
 *
 * Nguồn dữ liệu: `GET /api/v1/properties/{id}/equipments` — bảng `equipment` thật,
 * mỗi dòng là 1 đơn vị thiết bị riêng. Bản trước của trang này đọc 2 endpoint import
 * (`handover-equipments` + `renovation/sessions`) nên chỉ thấy nhà nhập bằng Excel,
 * bỏ sót toàn bộ thiết bị tạo bằng đường khác.
 *
 * Mã QR: `equipCode()` ưu tiên `qrCode` BE cấp, thiếu thì tự dựng `EQ-{id}`. Fallback
 * này an toàn vì BE khi tra không thấy trong cột `qr_code` sẽ bóc số sau "EQ-" rồi tìm
 * theo id (EquipmentServiceImpl.resolveEquipmentByQrFallback) — đã test sống với thiết
 * bị có qr_code NULL, quét vẫn ra đúng. Nhờ vậy in được tem ngay, không phải chờ BE vá
 * chuyện thiết bị import không được cấp mã (xem docs/BE-BUG-equipment-qrcode-null-import-2026-08-06.md).
 */

// ── Helpers ─────────────────────────────────────────────────────────────────
const equipName = (e: MaintenanceEquipmentResponse): string =>
  e.equipmentName || e.catalogName || 'Thiết bị';

// Nhãn vị trí trong nhà nguyên căn (BE trả houseArea dạng enum).
const HOUSE_AREA_LABEL: Record<string, string> = {
  LIVING_ROOM: 'Phòng khách', BEDROOM: 'Phòng ngủ', KITCHEN: 'Bếp',
  BATHROOM: 'Nhà tắm', BALCONY: 'Ban công', GARAGE: 'Gara', OTHER: 'Khác',
};
const areaLabel = (a?: string): string => (a ? HOUSE_AREA_LABEL[a] ?? a : '');

/**
 * Mã thiết bị CHUẨN: ưu tiên `qrCode` BE cấp (vd "EQ-88"); fallback "EQ-{id}".
 * `id` là primary key nên mã luôn DUY NHẤT — cùng loại thiết bị lắp nhiều phòng
 * (kể cả nhà chia phòng) cũng không bao giờ trùng.
 */
const equipCode = (e: MaintenanceEquipmentResponse): string => e.qrCode || `EQ-${e.id}`;

/** Payload QR: deep link mở thẳng màn tạo yêu cầu trên mobile; định danh theo id + mã BE. */
const qrPayload = (e: MaintenanceEquipmentResponse): string =>
  `slms://maintenance/new?equipmentId=${e.id}`
  + `&qr=${encodeURIComponent(equipCode(e))}`
  + `&roomId=${e.roomId ?? ''}`
  + `&name=${encodeURIComponent(equipName(e))}`
  + `&cat=${encodeURIComponent(e.catalogName ?? '')}`;

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  NEW:         { label: 'Mới',          color: 'bg-sky-100 text-sky-700' },
  GOOD:        { label: 'Hoạt động tốt', color: 'bg-emerald-100 text-emerald-700' },
  MAINTENANCE: { label: 'Đang bảo trì',  color: 'bg-amber-100 text-amber-700' },
  BROKEN:      { label: 'Đang hỏng',     color: 'bg-rose-100 text-rose-700' },
  DISPOSED:    { label: 'Đã thanh lý',   color: 'bg-slate-100 text-slate-500' },
};
const STATUS_ORDER = ['NEW', 'GOOD', 'MAINTENANCE', 'BROKEN', 'DISPOSED'];
// Khoá lọc riêng cho trục vận hành "đã gỡ" (operationalStatus=DISABLED).
const FILTER_DISABLED = 'OP_DISABLED';

// Thiết bị đã bị gỡ khỏi phòng (theo yêu cầu khách). Độc lập với status vật lý.
const isDisabled = (e: MaintenanceEquipmentResponse): boolean => e.operationalStatus === 'DISABLED';

// Tình trạng bảo hành tính từ ngày hết hạn.
const warrantyInfo = (d?: string): { label: string; cls: string } | null => {
  if (!d) return null;
  const exp = new Date(d).getTime();
  if (isNaN(exp)) return null;
  // Giờ SERVER, không phải giờ máy — máy lệch ngày là thiết bị còn bảo hành bị ghi
  // "Hết bảo hành", mà đó là con số quyết định gọi bảo hành hay tự bỏ tiền sửa.
  const days = Math.ceil((exp - serverNow().getTime()) / 86_400_000);
  if (days < 0) return { label: 'Hết bảo hành', cls: 'bg-slate-100 text-slate-500' };
  if (days <= 30) return { label: `BH còn ${days} ngày`, cls: 'bg-amber-100 text-amber-700' };
  return { label: 'Còn bảo hành', cls: 'bg-emerald-100 text-emerald-700' };
};

/**
 * Nhãn vị trí thiết bị để nhóm hiển thị:
 *  - Nhà CHIA PHÒNG: BE trả `roomNumber` (vd "P101") -> "Phòng P101".
 *  - Nhà NGUYÊN CĂN: `roomNumber` = "Toàn nhà" -> nhóm theo `houseArea` (Phòng khách, Bếp…).
 *  - Fallback: roomName hoặc "Khu vực chung / Toàn nhà".
 */
const roomLabel = (e: MaintenanceEquipmentResponse): string => {
  const rn = e.roomNumber?.trim();
  if (rn && rn !== 'Toàn nhà') return `Phòng ${rn}`;
  if (e.roomName?.trim()) return e.roomName;
  if (e.houseArea) return areaLabel(e.houseArea);
  return rn || 'Khu vực chung / Toàn nhà';
};

// Cỡ tem khi in — literal class names (không ghép chuỗi) để Tailwind quét thấy được lúc build.
const PRINT_LAYOUT: Record<'sm' | 'md' | 'lg', { cols: string; qrSize: number; label: string }> = {
  sm: { cols: 'grid-cols-4', qrSize: 110, label: 'Nhỏ' },
  md: { cols: 'grid-cols-3', qrSize: 150, label: 'Vừa' },
  lg: { cols: 'grid-cols-2', qrSize: 200, label: 'Lớn' },
};

type SortKey = 'name' | 'room' | 'status' | 'warranty' | 'maintenance';

/** Chạy tối đa `limit` promise cùng lúc — tránh bắn hàng trăm request song song khi hệ thống nhiều nhà. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

export const EquipmentCatalogPage = () => {
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const [equipments, setEquipments] = useState<MaintenanceEquipmentResponse[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [loadingEq, setLoadingEq] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [qrModal, setQrModal] = useState<MaintenanceEquipmentResponse | null>(null);
  const [viewMode, setViewMode] = useState<'grouped' | 'table'>('grouped');
  const [sortKey, setSortKey] = useState<SortKey>('room');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [labelSize, setLabelSize] = useState<'sm' | 'md' | 'lg'>('md');
  const [printMode, setPrintMode] = useState<'view' | 'all'>('view');
  const [printTick, setPrintTick] = useState(0);

  // Đếm thiết bị đang hỏng theo TỪNG nhà — tô badge lên PropertyPicker để thấy ngay
  // nhà nào cần chú ý mà không phải mở từng nhà một. Chạy nền, không chặn màn chính;
  // nhà nào lỗi tải thì bỏ qua badge (không có badge còn hơn hiện số sai).
  const [brokenCounts, setBrokenCounts] = useState<Map<number, number>>(new Map());

  // Tra cứu thiết bị theo mã QR xuyên toàn hệ thống — dùng khi tìm trong nhà đang
  // chọn ra 0 kết quả (vd nhặt được tem QR rời, chưa biết thuộc nhà nào).
  const [crossLoading, setCrossLoading] = useState(false);
  const [crossError, setCrossError] = useState<string | null>(null);
  const [pendingFocusId, setPendingFocusId] = useState<number | null>(null);

  // Tải danh sách bất động sản
  useEffect(() => {
    let active = true;
    propertyService.getAllProperties()
      .then(page => {
        if (!active) return;
        // Admin quản trị toàn hệ thống nên KHÔNG lọc theo trạng thái duyệt của Host.
        // Bản dùng cho Host trước đây lọc `isHostApproved`, áp vào đây sẽ giấu mất các
        // căn đang PENDING_HOST_REVIEW / nháp — đúng thứ admin cần thao tác nhất.
        const list = page ?? [];
        setProperties(list);
        if (list.length > 0) setPropertyId(list[0].id);
      })
      .catch(() => setProperties([]))
      .finally(() => active && setLoadingProps(false));
    return () => { active = false; };
  }, []);

  // Prefetch song song (giới hạn 5 cùng lúc) số thiết bị BROKEN của mỗi nhà — chỉ chạy
  // 1 lần khi danh sách nhà vừa tải xong. Đây là N request GET rời rạc (chưa có API tổng
  // hợp phía BE); ở quy mô vài chục nhà của hệ thống thì chấp nhận được, nhà nào lỗi
  // mạng thì lặng lẽ bỏ qua badge của riêng nhà đó.
  useEffect(() => {
    if (properties.length === 0) return;
    let active = true;
    mapWithConcurrency(properties, 5, async (p) => {
      try {
        const list = await equipmentService.getPropertyEquipment(p.id);
        const broken = (list ?? []).filter(e => e.status === 'BROKEN' && !isDisabled(e)).length;
        return [p.id, broken] as const;
      } catch {
        return null;
      }
    }).then(entries => {
      if (!active) return;
      const m = new Map<number, number>();
      entries.forEach(e => { if (e && e[1] > 0) m.set(e[0], e[1]); });
      setBrokenCounts(m);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties]);

  // Tải thiết bị theo nhà
  useEffect(() => {
    if (propertyId == null) return;
    let active = true;
    setLoadingEq(true);
    setLoadError(false);
    setSelected(new Set());
    setStatusFilter('all');
    equipmentService.getPropertyEquipment(propertyId)
      .then(list => { if (active) setEquipments(list ?? []); })
      .catch(() => { if (active) { setEquipments([]); setLoadError(true); } })
      .finally(() => active && setLoadingEq(false));
    return () => { active = false; };
  }, [propertyId]);

  // Sau khi nhảy nhà nhờ tra cứu QR xuyên hệ thống: chờ thiết bị của nhà đó tải xong
  // rồi tự mở modal QR lớn của đúng món vừa tìm — người dùng thấy ngay kết quả.
  useEffect(() => {
    if (pendingFocusId == null) return;
    const found = equipments.find(e => e.id === pendingFocusId);
    if (found) {
      setQrModal(found);
      setPendingFocusId(null);
    }
  }, [equipments, pendingFocusId]);

  // Đổi nhà hoặc gõ lại từ khoá thì lỗi tra cứu cũ (nếu có) không còn ý nghĩa.
  useEffect(() => { setCrossError(null); }, [search, propertyId]);

  // Reset kiểu in về mặc định sau khi hộp thoại in đóng lại (in xong hoặc bấm Huỷ) —
  // để lần bấm "In tem đã chọn" kế tiếp không bị dính chế độ "in cả nhà" trước đó.
  useEffect(() => {
    const reset = () => setPrintMode('view');
    window.addEventListener('afterprint', reset);
    return () => window.removeEventListener('afterprint', reset);
  }, []);

  // `printTick` chỉ tăng lên để ép effect dưới chạy SAU khi React đã commit `printMode`
  // mới vào DOM — gọi window.print() ngay trong onClick có thể in nhầm state cũ vì
  // setState không đồng bộ.
  useEffect(() => {
    if (printTick === 0) return;
    window.print();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printTick]);

  const selectedProperty = properties.find(p => p.id === propertyId);

  // Đếm theo tình trạng (trên toàn bộ thiết bị của nhà, không phụ thuộc search).
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    equipments.forEach(e => { c[e.status] = (c[e.status] ?? 0) + 1; });
    return c;
  }, [equipments]);

  const disabledCount = useMemo(() => equipments.filter(isDisabled).length, [equipments]);

  /** Số chip tình trạng THẬT SỰ dựng ra (không tính chip "Tất cả"). */
  const statusChipCount =
    STATUS_ORDER.filter(s => (statusCounts[s] ?? 0) > 0).length + (disabledCount > 0 ? 1 : 0);

  const filtered = useMemo(() => {
    const kw = search.toLowerCase();
    return equipments.filter(e => {
      const matchStatus =
        statusFilter === 'all' ? true
        : statusFilter === FILTER_DISABLED ? isDisabled(e)
        : e.status === statusFilter;
      const matchKw = !kw ||
        equipName(e).toLowerCase().includes(kw) ||
        (e.catalogName ?? '').toLowerCase().includes(kw) ||
        equipCode(e).toLowerCase().includes(kw) ||
        roomLabel(e).toLowerCase().includes(kw);
      return matchStatus && matchKw;
    });
  }, [equipments, search, statusFilter]);

  // Nhóm theo phòng (chế độ xem "Theo phòng")
  const grouped = useMemo(() => {
    const map = new Map<string, MaintenanceEquipmentResponse[]>();
    filtered.forEach(e => {
      const key = roomLabel(e);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return Array.from(map.entries());
  }, [filtered]);

  // Sắp xếp theo cột (chế độ xem "Bảng")
  const sortedFiltered = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const arr = [...filtered];
    arr.sort((a, b) => {
      switch (sortKey) {
        case 'name': return dir * equipName(a).localeCompare(equipName(b), 'vi');
        case 'room': return dir * roomLabel(a).localeCompare(roomLabel(b), 'vi');
        case 'status': return dir * (STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
        case 'warranty': {
          // Không có ngày hết hạn thì luôn xếp cuối, bất kể chiều sắp xếp.
          const av = a.warrantyExpiredDate ? new Date(a.warrantyExpiredDate).getTime() : Infinity;
          const bv = b.warrantyExpiredDate ? new Date(b.warrantyExpiredDate).getTime() : Infinity;
          return dir * (av - bv);
        }
        case 'maintenance': return dir * (a.maintenanceCount - b.maintenanceCount);
        default: return 0;
      }
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  // ── Chọn để in ──────────────────────────────────────────────────────────
  const toggleOne = (id: number) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleRoom = (items: MaintenanceEquipmentResponse[]) =>
    setSelected(prev => {
      const next = new Set(prev);
      // Bỏ qua thiết bị đã gỡ — không in tem cho món không còn trong phòng.
      const printable = items.filter(e => !isDisabled(e));
      const allOn = printable.every(e => next.has(e.id));
      printable.forEach(e => (allOn ? next.delete(e.id) : next.add(e.id)));
      return next;
    });
  const clearSelection = () => setSelected(new Set());

  /** Toàn bộ thiết bị in được TRONG BỘ LỌC hiện tại — thiết bị đã gỡ không in tem. */
  const printableAll = useMemo(() => filtered.filter(e => !isDisabled(e)), [filtered]);
  const allPrintableSelected =
    printableAll.length > 0 && printableAll.every(e => selected.has(e.id));
  const toggleAll = () =>
    setSelected(prev => {
      if (allPrintableSelected) {
        const next = new Set(prev);
        printableAll.forEach(e => next.delete(e.id));
        return next;
      }
      return new Set([...prev, ...printableAll.map(e => e.id)]);
    });

  /** Toàn bộ thiết bị của CẢ NHÀ, bỏ qua tìm kiếm/bộ lọc/lựa chọn — cho nút "In toàn bộ nhà". */
  const printableWholeProperty = useMemo(() => equipments.filter(e => !isDisabled(e)), [equipments]);

  // Tem cần in:
  //  - printMode === 'all'  -> toàn bộ nhà, bỏ qua mọi bộ lọc/lựa chọn (nút "In toàn bộ nhà").
  //  - có chọn thủ công     -> đúng các món đã tick.
  //  - còn lại              -> đang lọc/tìm kiếm thế nào thì in đúng thế đó.
  // Luôn loại thiết bị đã gỡ (DISABLED) khỏi tem in.
  const toPrint = (
    printMode === 'all' ? printableWholeProperty
    : selected.size > 0 ? equipments.filter(e => selected.has(e.id))
    : filtered
  ).filter(e => !isDisabled(e));

  const handlePrint = () => { setPrintMode('view'); setPrintTick(t => t + 1); };
  const handlePrintWholeProperty = () => { setPrintMode('all'); setPrintTick(t => t + 1); };

  // Đang có bộ lọc/tìm kiếm thu hẹp danh sách so với cả nhà -> nút in chính không còn
  // đồng nghĩa với "in cả nhà" nữa, cần nói rõ trong nhãn nút.
  const isNarrowedByFilter = printableAll.length !== printableWholeProperty.length;

  const lookupAcrossSystem = async () => {
    const code = search.trim();
    if (!code || crossLoading) return;
    setCrossLoading(true);
    setCrossError(null);
    try {
      const found = await equipmentService.getByQrCode(code);
      setPendingFocusId(found.id);
      // Đổi nhà nếu khác nhà đang xem -> effect tải-thiết-bị-theo-nhà sẽ chạy lại rồi
      // effect theo dõi `pendingFocusId` tự mở modal QR khi tìm thấy đúng món trong
      // danh sách vừa tải. Nếu đã đúng nhà rồi thì `equipments` không đổi, effect đó
      // vẫn chạy vì `pendingFocusId` vừa đổi và tìm thấy ngay.
      if (found.propertyId !== propertyId) setPropertyId(found.propertyId);
    } catch {
      setCrossError(`Không tìm thấy thiết bị với mã "${code}" trong toàn hệ thống.`);
    } finally {
      setCrossLoading(false);
    }
  };

  const propertyBadges = useMemo(() => {
    const m = new Map<number, { count: number; label: string }>();
    brokenCounts.forEach((count, id) => m.set(id, { count, label: `${count} hỏng` }));
    return m;
  }, [brokenCounts]);

  return (
    <div className="space-y-6">
      {/* ============ MÀN HÌNH (ẩn khi in) ============ */}
      <div className="print:hidden space-y-6">
        {/* Tiêu đề */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-1 h-6 bg-primary-600 rounded-full" />
              <h1 className="text-xl font-bold text-slate-900">Trang thiết bị & Mã QR</h1>
            </div>
            <p className="text-sm text-slate-500 ml-3.5">
              Xem toàn bộ thiết bị trong tòa nhà và in tem QR để dán — khách thuê quét QR để báo bảo trì.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 flex-shrink-0">
            {selected.size > 0 && (
              <button
                onClick={clearSelection}
                className="px-3 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700"
              >
                Bỏ chọn
              </button>
            )}
            {/* Cỡ tem — chỉ ảnh hưởng bản IN, không đổi gì trên màn hình. */}
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-0.5">
              {(Object.keys(PRINT_LAYOUT) as Array<'sm' | 'md' | 'lg'>).map(k => (
                <button
                  key={k}
                  onClick={() => setLabelSize(k)}
                  title={`Cỡ tem: ${PRINT_LAYOUT[k].label}`}
                  className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                    labelSize === k ? 'bg-primary-600 text-white' : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {PRINT_LAYOUT[k].label}
                </button>
              ))}
            </div>
            {/* Nút in CHÍNH: theo lựa chọn hiện tại (đã tick, hoặc đang lọc/tìm kiếm gì thì in đúng thứ đó). */}
            <button
              onClick={handlePrint}
              disabled={toPrint.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-primary-600 rounded-xl hover:bg-primary-700 disabled:opacity-40 transition-colors"
            >
              <Printer className="w-4 h-4" />
              {selected.size > 0
                ? `In tem đã chọn (${toPrint.length})`
                : isNarrowedByFilter
                  ? `In theo bộ lọc (${toPrint.length})`
                  : `In tất cả tem QR (${toPrint.length})`}
            </button>
            {/* Nút in PHỤ, tách riêng: luôn in TOÀN BỘ nhà đang chọn, bất kể đang lọc/tìm/tick gì. */}
            {printableWholeProperty.length > 0 && (
              <button
                onClick={handlePrintWholeProperty}
                title="In tem cho toàn bộ thiết bị của nhà này, bỏ qua bộ lọc và lựa chọn hiện tại"
                className="inline-flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold text-primary-700 bg-primary-50 border border-primary-200 rounded-xl hover:bg-primary-100 transition-colors"
              >
                <Printer className="w-4 h-4" />
                In toàn bộ nhà ({printableWholeProperty.length})
              </button>
            )}
          </div>
        </div>

        {/* Bộ chọn nhà + tìm kiếm */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-col md:flex-row gap-3">
          {/* Ô chọn nhà có TÌM KIẾM. Bản cũ là `<select>` trần: hệ thống vài chục
              tới hàng trăm căn thì phải kéo danh sách xổ tìm bằng mắt, gõ chữ trong
              select chỉ nhảy theo ký tự đầu. Dùng lại `PropertyPicker` của màn tạo
              hợp đồng — bỏ dấu, lọc theo cả tên/địa chỉ/khu vực, đi bằng phím được.
              Badge "N hỏng" (nếu có) giúp thấy ngay nhà nào cần chú ý mà không phải
              mở từng nhà một. */}
          <div className="md:min-w-[320px]">
            {loadingProps ? (
              <div className="input-field flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Đang tải danh sách nhà…
              </div>
            ) : (
              <PropertyPicker
                properties={properties}
                badges={propertyBadges}
                value={propertyId != null ? String(propertyId) : ''}
                onChange={(id) => setPropertyId(id ? Number(id) : null)}
              />
            )}
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo tên, mã thiết bị, phòng…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && filtered.length === 0) lookupAcrossSystem(); }}
              className="input-field pl-9 text-sm w-full"
            />
          </div>
        </div>

        {/* Bộ lọc tình trạng.
            Cả nhà cùng một tình trạng thì hàng này chỉ còn "Tất cả 10" và "Mới 10" —
            hai chip cùng một tập, cùng một số, bấm cái nào cũng ra y hệt. Ẩn đi,
            không mất chức năng nào. */}
        {equipments.length > 0 && statusChipCount > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip
              label="Tất cả" count={equipments.length}
              active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}
            />
            {STATUS_ORDER.filter(s => statusCounts[s] > 0).map(s => (
              <FilterChip
                key={s}
                label={STATUS_MAP[s]?.label ?? s}
                count={statusCounts[s]}
                active={statusFilter === s}
                danger={s === 'BROKEN'}
                warning={s === 'MAINTENANCE'}
                onClick={() => setStatusFilter(s)}
              />
            ))}
            {disabledCount > 0 && (
              <FilterChip
                label="Đã gỡ"
                count={disabledCount}
                active={statusFilter === FILTER_DISABLED}
                onClick={() => setStatusFilter(FILTER_DISABLED)}
              />
            )}
          </div>
        )}

        {/* Tổng quan nhanh + chọn tất cả + chuyển chế độ xem. */}
        {selectedProperty && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <Package className="w-4 h-4 text-slate-400" />
            <span><strong className="text-slate-800">{filtered.length}</strong> thiết bị</span>
            <span className="text-slate-300">·</span>
            <span>{grouped.length} phòng/khu vực</span>
            {printableAll.length > 0 && (
              <button
                onClick={toggleAll}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-primary-600"
              >
                {allPrintableSelected ? <CheckSquare className="w-3.5 h-3.5 text-primary-600" /> : <Square className="w-3.5 h-3.5" />}
                {allPrintableSelected ? 'Bỏ chọn tất cả' : `Chọn tất cả ${printableAll.length} tem`}
              </button>
            )}
            {/* Theo phòng / Bảng — bảng dễ quét mắt và sắp xếp khi nhà có nhiều thiết bị. */}
            <div className="ml-auto inline-flex items-center rounded-xl border border-slate-200 bg-white p-0.5">
              <button
                onClick={() => setViewMode('grouped')}
                title="Xem theo phòng"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  viewMode === 'grouped' ? 'bg-primary-600 text-white' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Rows3 className="w-3.5 h-3.5" /> Theo phòng
              </button>
              <button
                onClick={() => setViewMode('table')}
                title="Xem dạng bảng"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                  viewMode === 'table' ? 'bg-primary-600 text-white' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Table2 className="w-3.5 h-3.5" /> Bảng
              </button>
            </div>
          </div>
        )}

        {/* Danh sách */}
        {loadingEq ? (
          <div className="py-16 text-center"><Loader2 className="w-6 h-6 text-slate-300 animate-spin mx-auto" /></div>
        ) : loadError ? (
          <div className="bg-white rounded-xl border border-rose-100 shadow-sm py-16 text-center">
            <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-7 h-7 text-rose-400" />
            </div>
            <p className="text-sm font-medium text-slate-600">Không tải được danh sách thiết bị</p>
            <button onClick={() => setPropertyId(propertyId)} className="mt-3 text-sm font-semibold text-primary-600 hover:underline">
              Thử lại
            </button>
          </div>
        ) : grouped.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm py-16 text-center">
            <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Package className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-500">
              {equipments.length === 0 ? 'Nhà này chưa có thiết bị nào' : 'Không có thiết bị khớp bộ lọc'}
            </p>
            {/* Tìm không ra trong nhà đang chọn -> có thể thiết bị thuộc nhà khác.
                Tra theo mã QR chính xác (vd tem rời chưa rõ của nhà nào) xuyên toàn hệ thống. */}
            {search.trim() && (
              <div className="mt-4 flex flex-col items-center gap-2">
                <button
                  onClick={lookupAcrossSystem}
                  disabled={crossLoading}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-primary-600 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 disabled:opacity-50 transition-colors"
                >
                  {crossLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
                  Tìm mã "{search.trim()}" ở nhà khác
                </button>
                {crossError && <p className="text-xs text-rose-500">{crossError}</p>}
              </div>
            )}
          </div>
        ) : viewMode === 'table' ? (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="w-9 px-3 py-3" />
                  <th className="w-14 px-2 py-3" />
                  <SortableTh label="Thiết bị" sortKey="name" active={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Phòng" sortKey="room" active={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Tình trạng" sortKey="status" active={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Bảo hành" sortKey="warranty" active={sortKey} dir={sortDir} onSort={toggleSort} />
                  <SortableTh label="Bảo trì" sortKey="maintenance" active={sortKey} dir={sortDir} onSort={toggleSort} />
                  <th className="w-24 px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedFiltered.map(e => {
                  const st = STATUS_MAP[e.status] ?? STATUS_MAP.GOOD;
                  const wInfo = warrantyInfo(e.warrantyExpiredDate);
                  const isSel = selected.has(e.id);
                  const broken = e.status === 'BROKEN';
                  const removed = isDisabled(e);
                  return (
                    <tr key={e.id} className={`${removed ? 'bg-slate-50/80' : broken ? 'bg-rose-50/40' : ''} ${isSel ? 'bg-primary-50/40' : ''}`}>
                      <td className="px-3 py-3">
                        {removed ? (
                          <span className="text-slate-300" title="Đã gỡ — không in tem"><Square className="w-4.5 h-4.5" /></span>
                        ) : (
                          <button onClick={() => toggleOne(e.id)} className="text-slate-400 hover:text-primary-600">
                            {isSel ? <CheckSquare className="w-4.5 h-4.5 text-primary-600" /> : <Square className="w-4.5 h-4.5" />}
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <button onClick={() => setQrModal(e)} className={removed ? 'opacity-40' : ''} title="Xem QR lớn">
                          <QRCodeSVG value={qrPayload(e)} size={32} level="M" className="rounded border border-slate-200" />
                        </button>
                      </td>
                      <td className={`px-3 py-3 max-w-[220px] ${removed ? 'opacity-70' : ''}`}>
                        <p className="font-semibold text-slate-900 truncate">{equipName(e)}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {e.catalogName} · <span className="font-mono font-semibold text-slate-600">{equipCode(e)}</span>
                        </p>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">{roomLabel(e)}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {removed && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">⛔ Đã gỡ</span>}
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {wInfo ? (
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${wInfo.cls}`}>
                            <ShieldCheck className="w-3 h-3" /> {wInfo.label}
                          </span>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-500 whitespace-nowrap">
                        <Wrench className="inline w-3 h-3 mr-1 -mt-0.5" />{e.maintenanceCount} lần
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={() => setQrModal(e)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-primary-600 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors"
                        >
                          <QrCode className="w-3.5 h-3.5" /> QR
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          grouped.map(([room, items]) => {
            const brokenCount = items.filter(e => e.status === 'BROKEN').length;
            const removedCount = items.filter(isDisabled).length;
            const printable = items.filter(e => !isDisabled(e));
            const allSelected = printable.length > 0 && printable.every(e => selected.has(e.id));
            return (
              <div key={room} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-3">
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 min-w-0">
                    <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" /> <span className="truncate">{room}</span>
                  </h3>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs text-slate-400">{items.length} thiết bị</span>
                    {brokenCount > 0 && (
                      <span className="text-xs font-semibold text-rose-600">{brokenCount} hỏng</span>
                    )}
                    {removedCount > 0 && (
                      <span className="text-xs font-semibold text-slate-500">{removedCount} đã gỡ</span>
                    )}
                    {printable.length > 0 && (
                      <button
                        onClick={() => toggleRoom(items)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-primary-600"
                      >
                        {allSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                        Chọn phòng
                      </button>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {items.map(e => {
                    const st = STATUS_MAP[e.status] ?? STATUS_MAP.GOOD;
                    const wInfo = warrantyInfo(e.warrantyExpiredDate);
                    const isSel = selected.has(e.id);
                    const broken = e.status === 'BROKEN';
                    const removed = isDisabled(e);
                    return (
                      <div
                        key={e.id}
                        className={`flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 ${removed ? 'bg-slate-50/80' : broken ? 'bg-rose-50/60' : ''} ${isSel ? 'ring-1 ring-inset ring-primary-200 bg-primary-50/40' : ''}`}
                      >
                        {removed ? (
                          <span className="flex-shrink-0 text-slate-300" title="Đã gỡ — không in tem">
                            <Square className="w-5 h-5" />
                          </span>
                        ) : (
                          <button onClick={() => toggleOne(e.id)} className="flex-shrink-0 text-slate-400 hover:text-primary-600">
                            {isSel ? <CheckSquare className="w-5 h-5 text-primary-600" /> : <Square className="w-5 h-5" />}
                          </button>
                        )}
                        {/* QR thu nhỏ còn 40px. Nó là thứ để IN và DÁN, không phải thứ
                            quét trên màn hình — để 56px đứng trước tên thì mỗi hàng cao
                            hơn hẳn và mắt đập vào một ô đen vô nghĩa trước khi đọc được
                            tên thiết bị. Cần xem to thì có nút "QR lớn" ở cuối hàng. */}
                        <button onClick={() => setQrModal(e)} className={`flex-shrink-0 ${removed ? 'opacity-40' : ''}`} title="Xem QR lớn">
                          <QRCodeSVG value={qrPayload(e)} size={40} level="M" className="rounded border border-slate-200" />
                        </button>
                        <div className={`flex-1 min-w-0 ${removed ? 'opacity-70' : ''}`}>
                          <p className="font-semibold text-slate-900 truncate">{equipName(e)}</p>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            {e.catalogName}{e.houseArea ? ` · ${areaLabel(e.houseArea)}` : ''} · Mã <span className="font-mono font-semibold text-slate-600">{equipCode(e)}</span>
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            {removed && (
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600"
                                title={e.disabledReason || 'Đã gỡ khỏi phòng theo yêu cầu khách'}
                              >
                                ⛔ Đã gỡ
                              </span>
                            )}
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                              <Wrench className="w-3 h-3" /> {e.maintenanceCount} lần bảo trì
                            </span>
                            {wInfo && (
                              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${wInfo.cls}`}>
                                <ShieldCheck className="w-3 h-3" /> {wInfo.label}
                              </span>
                            )}
                          </div>
                          {removed && e.disabledReason && (
                            <p className="text-[11px] text-slate-400 mt-1 truncate">Lý do: {e.disabledReason}</p>
                          )}
                        </div>
                        <button
                          onClick={() => setQrModal(e)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary-600 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors flex-shrink-0"
                        >
                          <QrCode className="w-3.5 h-3.5" /> QR lớn
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        {/* Thanh chọn nổi ở đáy.
            Chọn tem là việc làm DỌC cả trang: tick vài món ở phòng 101, cuộn xuống
            phòng 305 tick tiếp — rồi phải cuộn ngược lên tận đầu trang mới bấm In
            được, mà trên đường về dễ bấm nhầm làm mất hết lựa chọn. */}
        {selected.size > 0 && (
          <>
            {/* Chừa chỗ: thanh dưới là `fixed` nên sẽ đè lên đáy danh sách. */}
            <div aria-hidden className="h-20" />
            <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
              <div className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-white shadow-2xl">
                <span className="flex items-center gap-2 text-sm font-bold">
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-white px-1.5 text-xs font-black text-slate-900">
                    {toPrint.length}
                  </span>
                  tem đã chọn
                </span>
                <span className="h-5 w-px bg-slate-700" />
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-2 rounded-xl bg-primary-600 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-primary-700"
                >
                  <Printer className="h-4 w-4" /> In tem đã chọn
                </button>
                <button
                  onClick={clearSelection}
                  className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                  title="Bỏ chọn tất cả"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ============ TEM IN (chỉ hiện khi in) ============ */}
      <div className="hidden print:block">
        <h2 className="text-lg font-bold mb-1">Tem QR thiết bị — {selectedProperty?.propertyName}</h2>
        <p className="text-xs text-slate-500 mb-4">{selectedProperty?.shortAddress}</p>
        <div className={`grid ${PRINT_LAYOUT[labelSize].cols} gap-4`}>
          {toPrint.map(e => (
            <div key={e.id} className="border border-slate-300 rounded-lg p-3 flex flex-col items-center text-center break-inside-avoid">
              <QRCodeSVG value={qrPayload(e)} size={PRINT_LAYOUT[labelSize].qrSize} level="M" />
              <p className="font-bold text-sm mt-2 leading-tight">{equipName(e)}</p>
              <p className="text-[11px] text-slate-500">{roomLabel(e)}</p>
              <p className="text-[11px] font-mono font-semibold text-slate-600">{equipCode(e)}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{selectedProperty?.propertyName}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ============ MODAL QR ĐƠN LẺ ============ */}
      {qrModal && (
        <QrModal equipment={qrModal} propertyName={selectedProperty?.propertyName} onClose={() => setQrModal(null)} />
      )}
    </div>
  );
};

// ── Sub-components ───────────────────────────────────────────────────────────

const FilterChip = ({
  label, count, active, danger, warning, onClick,
}: {
  label: string; count: number; active: boolean; danger?: boolean; warning?: boolean; onClick: () => void;
}) => {
  const base = active
    ? 'bg-primary-600 text-white border-primary-600'
    : danger
      ? 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'
      : warning
        ? 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'
        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50';
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${base}`}>
      {label}
      <span className={`text-[10px] font-bold px-1.5 rounded-full ${active ? 'bg-white/25' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
    </button>
  );
};

const SortableTh = ({
  label, sortKey: key, active, dir, onSort,
}: {
  label: string; sortKey: SortKey; active: SortKey; dir: 'asc' | 'desc'; onSort: (k: SortKey) => void;
}) => {
  const isActive = active === key;
  return (
    <th className="px-3 py-3 text-left">
      <button
        onClick={() => onSort(key)}
        className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide transition-colors ${
          isActive ? 'text-primary-700' : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        {label}
        {isActive ? (dir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)
          : <ArrowUpDown className="w-3 h-3 opacity-40" />}
      </button>
    </th>
  );
};

const QrModal = ({
  equipment, propertyName, onClose,
}: {
  equipment: MaintenanceEquipmentResponse; propertyName?: string; onClose: () => void;
}) => {
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const code = equipCode(equipment);

  const downloadPng = () => {
    const canvas = canvasWrapRef.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `QR-${code}.png`;
    a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 truncate">{equipName(equipment)}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {roomLabel(equipment)} · <span className="font-mono font-semibold">{code}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex justify-center bg-slate-50 rounded-xl py-6">
          <QRCodeSVG value={qrPayload(equipment)} size={220} level="M" />
        </div>
        {/* Canvas ẩn để xuất PNG */}
        <div ref={canvasWrapRef} className="hidden">
          <QRCodeCanvas value={qrPayload(equipment)} size={512} level="M" />
        </div>

        <p className="text-[11px] text-slate-400 text-center mt-3">
          {propertyName} · Khách quét mã này bằng app để báo bảo trì.
        </p>

        <button
          onClick={downloadPng}
          className="mt-5 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-primary-600 rounded-xl hover:bg-primary-700 transition-colors"
        >
          <Download className="w-4 h-4" /> Tải tem PNG
        </button>
      </div>
    </div>
  );
};
