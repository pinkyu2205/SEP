import { useEffect, useMemo, useState } from 'react';
import { Package, Printer, QrCode, Search, Loader2, MapPin, ShieldCheck, Wrench } from 'lucide-react';
import { propertyService } from '../../services/property.service';
import { equipmentService } from '../../services/equipment.service';
import type { PropertyResponse, MaintenanceEquipmentResponse } from '../../types/api.types';

// ── Helpers ─────────────────────────────────────────────────────────────────
const equipName = (e: MaintenanceEquipmentResponse): string =>
  e.equipmentName || e.catalogName || 'Thiết bị';

/** Payload QR: deep link mở thẳng màn tạo yêu cầu trên mobile, kèm roomId + equipmentId. */
const qrPayload = (e: MaintenanceEquipmentResponse): string =>
  `slms://maintenance/new?equipmentId=${e.id}`
  + `&roomId=${e.roomId ?? ''}`
  + `&name=${encodeURIComponent(equipName(e))}`
  + `&cat=${encodeURIComponent(e.catalogName ?? '')}`;

const qrImg = (data: string, size: number): string =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${encodeURIComponent(data)}`;

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  NEW:         { label: 'Mới',          color: 'bg-sky-100 text-sky-700' },
  GOOD:        { label: 'Hoạt động tốt', color: 'bg-emerald-100 text-emerald-700' },
  MAINTENANCE: { label: 'Đang bảo trì',  color: 'bg-amber-100 text-amber-700' },
  BROKEN:      { label: 'Đang hỏng',     color: 'bg-rose-100 text-rose-700' },
  DISPOSED:    { label: 'Đã thanh lý',   color: 'bg-slate-100 text-slate-500' },
};

const roomLabel = (name?: string): string => name || 'Khu vực chung / Toàn nhà';

export const EquipmentQrManager = () => {
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const [equipments, setEquipments] = useState<MaintenanceEquipmentResponse[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [loadingEq, setLoadingEq] = useState(false);
  const [search, setSearch] = useState('');

  // Tải danh sách bất động sản
  useEffect(() => {
    let active = true;
    propertyService.getProperties(0, 200)
      .then(page => {
        if (!active) return;
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
    equipmentService.getPropertyEquipment(propertyId)
      .then(list => { if (active) setEquipments(list ?? []); })
      .catch(() => { if (active) setEquipments([]); })
      .finally(() => active && setLoadingEq(false));
    return () => { active = false; };
  }, [propertyId]);

  const selectedProperty = properties.find(p => p.id === propertyId);

  const filtered = useMemo(() => {
    const kw = search.toLowerCase();
    return equipments.filter(e =>
      !kw ||
      equipName(e).toLowerCase().includes(kw) ||
      (e.catalogName ?? '').toLowerCase().includes(kw) ||
      roomLabel(e.roomName).toLowerCase().includes(kw),
    );
  }, [equipments, search]);

  // Nhóm theo phòng
  const grouped = useMemo(() => {
    const map = new Map<string, MaintenanceEquipmentResponse[]>();
    filtered.forEach(e => {
      const key = roomLabel(e.roomName);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return Array.from(map.entries());
  }, [filtered]);

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
          <button
            onClick={handlePrint}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-primary-600 rounded-xl hover:bg-primary-700 disabled:opacity-40 transition-colors flex-shrink-0"
          >
            <Printer className="w-4 h-4" /> In tất cả tem QR ({filtered.length})
          </button>
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
              placeholder="Tìm theo tên thiết bị, phòng…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field pl-9 text-sm w-full"
            />
          </div>
        </div>

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
        ) : grouped.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm py-16 text-center">
            <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Package className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-500">Nhà này chưa có thiết bị nào</p>
          </div>
        ) : (
          grouped.map(([room, items]) => (
            <div key={room} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-400" /> {room}
                </h3>
                <span className="text-xs text-slate-400">{items.length} thiết bị</span>
              </div>
              <div className="divide-y divide-slate-100">
                {items.map(e => {
                  const st = STATUS_MAP[e.status] ?? STATUS_MAP.GOOD;
                  return (
                    <div key={e.id} className="flex items-center gap-4 px-5 py-4">
                      <img src={qrImg(qrPayload(e), 64)} alt="QR" className="w-16 h-16 rounded-lg border border-slate-200 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900">{equipName(e)}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {e.catalogName}{e.houseArea ? ` · ${e.houseArea}` : ''} · Mã thiết bị #{e.id}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                            <Wrench className="w-3 h-3" /> {e.maintenanceCount} lần bảo trì
                          </span>
                          {e.warrantyExpiredDate && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                              <ShieldCheck className="w-3 h-3" /> BH {e.warrantyExpiredDate}
                            </span>
                          )}
                        </div>
                      </div>
                      <a
                        href={qrImg(qrPayload(e), 400)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary-600 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors flex-shrink-0"
                      >
                        <QrCode className="w-3.5 h-3.5" /> QR lớn
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* ============ TEM IN (chỉ hiện khi in) ============ */}
      <div className="hidden print:block">
        <h2 className="text-lg font-bold mb-1">Tem QR thiết bị — {selectedProperty?.propertyName}</h2>
        <p className="text-xs text-slate-500 mb-4">{selectedProperty?.shortAddress}</p>
        <div className="grid grid-cols-3 gap-4">
          {filtered.map(e => (
            <div key={e.id} className="border border-slate-300 rounded-lg p-3 flex flex-col items-center text-center break-inside-avoid">
              <img src={qrImg(qrPayload(e), 200)} alt="QR" className="w-[150px] h-[150px]" />
              <p className="font-bold text-sm mt-2 leading-tight">{equipName(e)}</p>
              <p className="text-[11px] text-slate-500">{roomLabel(e.roomName)} · #{e.id}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{selectedProperty?.propertyName}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
