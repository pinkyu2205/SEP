import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import {
  Package, Printer, QrCode, Search, Loader2, MapPin, ShieldCheck, Wrench,
  X, Download, CheckSquare, Square, AlertTriangle,
} from 'lucide-react';
import { propertyService } from '@/services/property.service';
import { equipmentService } from '@/services/equipment.service';
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
  const days = Math.ceil((exp - Date.now()) / 86_400_000);
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

  // Tải danh sách bất động sản
  useEffect(() => {
    let active = true;
    propertyService.getProperties(0, 200)
      .then(page => {
        if (!active) return;
        // Admin quản trị toàn hệ thống nên KHÔNG lọc theo trạng thái duyệt của Host.
        // Bản dùng cho Host trước đây lọc `isHostApproved`, áp vào đây sẽ giấu mất các
        // căn đang PENDING_HOST_REVIEW / nháp — đúng thứ admin cần thao tác nhất.
        const list = page.content ?? [];
        setProperties(list);
        if (list.length > 0) setPropertyId(list[0].id);
      })
      .catch(() => setProperties([]))
      .finally(() => active && setLoadingProps(false));
    return () => { active = false; };
  }, []);

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

  const selectedProperty = properties.find(p => p.id === propertyId);

  // Đếm theo tình trạng (trên toàn bộ thiết bị của nhà, không phụ thuộc search).
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    equipments.forEach(e => { c[e.status] = (c[e.status] ?? 0) + 1; });
    return c;
  }, [equipments]);

  const disabledCount = useMemo(() => equipments.filter(isDisabled).length, [equipments]);

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

  // Nhóm theo phòng
  const grouped = useMemo(() => {
    const map = new Map<string, MaintenanceEquipmentResponse[]>();
    filtered.forEach(e => {
      const key = roomLabel(e);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return Array.from(map.entries());
  }, [filtered]);

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

  // Tem cần in: nếu có chọn -> in mục đã chọn; nếu không -> in toàn bộ đang lọc.
  // Luôn loại thiết bị đã gỡ (DISABLED) khỏi tem in.
  const toPrint = (selected.size > 0
    ? equipments.filter(e => selected.has(e.id))
    : filtered
  ).filter(e => !isDisabled(e));

  const handlePrint = () => window.print();

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
          <div className="flex items-center gap-2 flex-shrink-0">
            {selected.size > 0 && (
              <button
                onClick={clearSelection}
                className="px-3 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700"
              >
                Bỏ chọn
              </button>
            )}
            <button
              onClick={handlePrint}
              disabled={toPrint.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-primary-600 rounded-xl hover:bg-primary-700 disabled:opacity-40 transition-colors"
            >
              <Printer className="w-4 h-4" />
              {selected.size > 0 ? `In tem đã chọn (${selected.size})` : `In tất cả tem QR (${filtered.length})`}
            </button>
          </div>
        </div>

        {/* Bộ chọn nhà + tìm kiếm */}
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 flex flex-col md:flex-row gap-3">
          <select
            value={propertyId ?? ''}
            onChange={e => setPropertyId(Number(e.target.value))}
            className="input-field text-sm md:min-w-[280px]"
            disabled={loadingProps}
          >
            {loadingProps && <option>Đang tải danh sách nhà…</option>}
            {properties.map(p => (
              <option key={p.id} value={p.id}>{p.propertyName} — {p.shortAddress}</option>
            ))}
          </select>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo tên, mã thiết bị, phòng…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field pl-9 text-sm w-full"
            />
          </div>
        </div>

        {/* Bộ lọc tình trạng */}
        {equipments.length > 0 && (
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

        {/* Tổng quan nhanh */}
        {selectedProperty && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <Package className="w-4 h-4 text-slate-400" />
            <span><strong className="text-slate-800">{filtered.length}</strong> thiết bị</span>
            <span className="text-slate-300">·</span>
            <span>{grouped.length} phòng/khu vực</span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{selectedProperty.propertyName}</span>
          </div>
        )}

        {/* Danh sách theo phòng */}
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
                        <button onClick={() => setQrModal(e)} className={`flex-shrink-0 ${removed ? 'opacity-40' : ''}`} title="Xem QR lớn">
                          <QRCodeSVG value={qrPayload(e)} size={56} level="M" className="rounded-lg border border-slate-200" />
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
      </div>

      {/* ============ TEM IN (chỉ hiện khi in) ============ */}
      <div className="hidden print:block">
        <h2 className="text-lg font-bold mb-1">Tem QR thiết bị — {selectedProperty?.propertyName}</h2>
        <p className="text-xs text-slate-500 mb-4">{selectedProperty?.shortAddress}</p>
        <div className="grid grid-cols-3 gap-4">
          {toPrint.map(e => (
            <div key={e.id} className="border border-slate-300 rounded-lg p-3 flex flex-col items-center text-center break-inside-avoid">
              <QRCodeSVG value={qrPayload(e)} size={150} level="M" />
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
