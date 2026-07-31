import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AlertCircle, Building2, ChevronRight, Download,
  Info, Loader2, MapPin, Package, Printer, QrCode, Search, Wrench, X,
} from 'lucide-react';
import type {
  EquipmentSource, HandoverEquipmentResponse, HouseArea, PropertyResponse, RenovationSession,
} from '@/types/api.types';
import { propertyService } from '@/services/property.service';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Bộ lọc nguồn thiết bị: tất cả / nhà gốc / cải tạo */
type SourceFilter = 'all' | 'INITIAL_HANDOVER' | 'PURCHASED';

interface PropertyData {
  property: PropertyResponse;
  /** Thiết bị chủ nhà bàn giao — import lease-excel (nhà gốc) */
  handover: HandoverEquipmentResponse[];
  /** Các đợt cải tạo — import renovation-excel (cải tạo), kèm version v1/v2 */
  renovationSessions: RenovationSession[];
  expanded: boolean;
}

/** 1 đơn vị thiết bị riêng lẻ (tách từ số lượng) — mỗi cái 1 mã QR + vị trí + nguồn riêng */
interface EquipmentUnit {
  key: string;
  catalogName: string;
  status: string;
  /** Nguồn: INITIAL_HANDOVER = nhà gốc · PURCHASED = cải tạo */
  source: EquipmentSource;
  /** null = chưa gán, còn trong kho */
  location: string | null;
  /** Dòng phụ dưới tên: mô tả (nhà gốc) hoặc "Đợt v2" (cải tạo) */
  detail: string | null;
  /** "2/3" khi cùng loại có nhiều cái; '' khi chỉ 1 */
  unitLabel: string;
  /**
   * Mã QR THẬT lấy từ BE (dạng "EQ-{id}", khớp đúng thứ app tenant/manager quét được).
   * null với "Nhà gốc" — `HandoverEquipment` chỉ là 1 dòng gộp số lượng, không phải
   * từng `Equipment` row riêng nên không có QR thật để gắn (xem
   * docs/BE-BUG-admin-equipments-qr-fake-2026-07-30.md) — ẩn nút QR cho các dòng này
   * thay vì tự bịa chuỗi không quét được như trước.
   */
  qrData: string | null;
}

/** Mô tả 1 mã QR cần hiển thị */
interface QrTarget {
  title: string;
  subtitle: string;
  qrData: string;
  downloadName: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const HOUSE_AREA_LABEL: Record<HouseArea, string> = {
  LIVING_ROOM: 'Phòng khách', BEDROOM: 'Phòng ngủ', KITCHEN: 'Bếp',
  BATHROOM: 'Nhà tắm', BALCONY: 'Ban công', GARAGE: 'Gara', OTHER: 'Khác',
};

/** Cấu hình hiển thị theo nguồn thiết bị (nhà gốc vs cải tạo) */
const SOURCE_CFG: Record<EquipmentSource, { label: string; short: string; icon: typeof Building2; cls: string; iconCls: string; chipBg: string }> = {
  INITIAL_HANDOVER: {
    label: 'Nhà gốc', short: 'NHAGOC', icon: Building2,
    cls: 'bg-violet-50 text-violet-700 border-violet-200', iconCls: 'text-violet-500', chipBg: 'bg-violet-50',
  },
  PURCHASED: {
    label: 'Cải tạo', short: 'CAITAO', icon: Wrench,
    cls: 'bg-amber-50 text-amber-700 border-amber-200', iconCls: 'text-amber-500', chipBg: 'bg-amber-50',
  },
};

const areaLabel = (a: string | null): string | null =>
  a ? (HOUSE_AREA_LABEL[a as HouseArea] ?? a) : null;

// Vị trí TB bàn giao: BE để roomNumber/houseArea = null, ghi vị trí trong `note`.
// Ưu tiên note; fallback roomNumber/houseArea cho dữ liệu cũ.
const handoverLocation = (h: HandoverEquipmentResponse): string | null =>
  h.note?.trim()
    ? h.note.trim()
    : h.roomNumber ? `Phòng ${h.roomNumber}` : areaLabel(h.houseArea);

/**
 * Tách 1 tòa thành danh sách thiết bị riêng lẻ, gắn nguồn:
 *  - handover (getHandoverEquipments)  → "Nhà gốc"  — chủ nhà bàn giao, import lease-excel.
 *  - renovationSessions (getRenovationSessions) → "Cải tạo" — import renovation-excel, gom theo đợt.
 *
 * QR: chỉ "Cải tạo" có QR thật (mỗi dòng là 1 `Equipment` row thật, BE trả sẵn `qrCode`
 * dạng "EQ-{id}" — 30/07/2026). "Nhà gốc" KHÔNG có QR — `HandoverEquipment` chỉ là 1 dòng
 * gộp số lượng, không phải từng đơn vị riêng trong DB nên không có gì thật để gắn QR
 * (trước đây tự bịa chuỗi ở FE, quét không ra — xem
 * docs/BE-BUG-admin-equipments-qr-fake-2026-07-30.md). Nếu BE sau này materialize từng
 * unit nhà gốc thành Equipment row thật thì bỏ `qrData: null` ở nhánh 1 dưới đây.
 */
const buildUnits = (data: PropertyData): EquipmentUnit[] => {
  const units: EquipmentUnit[] = [];

  // 1) Nhà gốc — thiết bị chủ nhà bàn giao (không có QR thật, xem comment trên)
  for (const h of data.handover) {
    const loc = handoverLocation(h);
    const qty = h.quantity || 1;
    for (let i = 1; i <= qty; i++) {
      units.push({
        key: `h${h.id}-u${i}`,
        catalogName: h.catalogName,
        status: h.status,
        source: 'INITIAL_HANDOVER',
        location: loc,
        detail: h.description?.trim() || null,
        unitLabel: qty > 1 ? `${i}/${qty}` : '',
        qrData: null,
      });
    }
  }

  // 2) Cải tạo — thiết bị bổ sung/thay thế, gom theo đợt cải tạo (chỉ cái đang hiệu lực)
  for (const s of data.renovationSessions) {
    const version = s.versionLabel || `v${s.sessionNumber ?? 1}`;
    for (const e of s.equipments ?? []) {
      if (e.currentEffective === false || e.operationalStatus === 'DISABLED') continue;
      const loc = e.roomNumber ? `Phòng ${e.roomNumber}` : areaLabel(e.houseArea);
      units.push({
        key: `s${s.sessionNumber ?? 0}-e${e.id}`,
        catalogName: e.catalogName,
        status: e.status,
        source: 'PURCHASED',
        location: loc,
        detail: `Đợt cải tạo ${version}`,
        unitLabel: '',
        qrData: e.qrCode ?? null,
      });
    }
  }

  return units.sort((x, y) =>
    x.source.localeCompare(y.source) ||
    x.catalogName.localeCompare(y.catalogName) ||
    (x.location ?? 'zzz').localeCompare(y.location ?? 'zzz')
  );
};

const getQrUrl = (data: string, size = 180) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; dot: string; cls: string }> = {
  NEW:     { label: 'Mới',      dot: 'bg-emerald-500', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  GOOD:    { label: 'Tốt',      dot: 'bg-lime-500',    cls: 'bg-lime-50 text-lime-700 border-lime-200' },
  DAMAGED: { label: 'Hư hỏng',  dot: 'bg-orange-500',  cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  BROKEN:  { label: 'Báo hỏng', dot: 'bg-rose-500',    cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

// Nhà gốc: NEW/GOOD = tình trạng lúc bàn giao (không phải "mới mua")
const HANDOVER_STATUS_CFG: Record<string, { label: string; dot: string; cls: string }> = {
  NEW:  { label: 'Bàn giao - Mới', dot: 'bg-violet-500', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  GOOD: { label: 'Bàn giao - Cũ',  dot: 'bg-slate-400',  cls: 'bg-slate-50 text-slate-600 border-slate-200' },
};

const StatusBadge = ({ status, source }: { status: string; source: EquipmentSource }) => {
  const cfg = source === 'INITIAL_HANDOVER'
    ? (HANDOVER_STATUS_CFG[status] ?? STATUS_CFG[status])
    : STATUS_CFG[status];
  if (!cfg) return <span className="text-xs text-slate-400">{status}</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

/** Badge nguồn: Nhà gốc / Cải tạo */
const SourceBadge = ({ source }: { source: EquipmentSource }) => {
  const cfg = SOURCE_CFG[source];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
};

// ─── QR Modal ────────────────────────────────────────────────────────────────

const QrModal = ({ title, subtitle, qrData, downloadName, onClose }: QrTarget & { onClose: () => void }) => {
  const qrUrl = getQrUrl(qrData, 220);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl mx-4 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <QrCode className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Mã QR thiết bị</span>
            </div>
            <h3 className="font-bold text-slate-900 text-sm">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 flex flex-col items-center gap-4">
          <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 shadow-inner">
            <img src={qrUrl} alt="QR code" className="w-[220px] h-[220px]" />
          </div>
          <p className="font-mono text-[10px] text-slate-400 text-center break-all leading-relaxed px-2">
            {qrData}
          </p>
          <div className="grid grid-cols-2 gap-2 w-full">
            <a
              href={qrUrl}
              download={downloadName}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Tải QR
            </a>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              In tem
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Property Accordion — quản lý thiết bị theo toà nhà ───────────────────────

const PropertyAccordion = ({
  data,
  search,
  sourceFilter,
  onToggle,
  onShowQr,
}: {
  data: PropertyData;
  search: string;
  sourceFilter: SourceFilter;
  onToggle: () => void;
  onShowQr: (target: QrTarget) => void;
}) => {
  const q = search.toLowerCase();
  const allUnits = useMemo(() => buildUnits(data), [data]);

  const handoverCount = allUnits.filter(u => u.source === 'INITIAL_HANDOVER').length;
  const renoCount = allUnits.filter(u => u.source === 'PURCHASED').length;

  const units = allUnits.filter(u =>
    (sourceFilter === 'all' || u.source === sourceFilter) &&
    (!q || u.catalogName.toLowerCase().includes(q))
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center gap-3 hover:bg-slate-50/50 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-4 h-4 text-slate-500" />
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="font-semibold text-slate-900 text-sm truncate">{data.property.propertyName}</p>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{data.property.shortAddress}</p>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200">
            <Building2 className="w-3 h-3" />{handoverCount} nhà gốc
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
            <Wrench className="w-3 h-3" />{renoCount} cải tạo
          </span>
        </div>
        <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${data.expanded ? 'rotate-90' : ''}`} />
      </button>

      {data.expanded && (
        <div className="border-t border-slate-100">
          {units.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-xs text-slate-400">
                {allUnits.length === 0
                  ? 'Chưa có thiết bị nào được import cho toà nhà này.'
                  : 'Không có thiết bị khớp bộ lọc hiện tại.'}
              </p>
            </div>
          ) : (
            <div>
              <div className="px-5 py-2 bg-slate-50/60 border-b border-slate-100 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {units.length} thiết bị riêng lẻ
                </p>
                <p className="text-[10px] font-bold text-slate-400">
                  <span className="text-violet-600">{handoverCount} nhà gốc</span>
                  {' · '}
                  <span className="text-amber-600">{renoCount} cải tạo</span>
                </p>
              </div>
              <div className="px-5 py-2 bg-slate-50/30 border-b border-slate-100 grid grid-cols-[1fr_96px_140px_120px_64px] gap-3">
                {['Thiết bị', 'Nguồn', 'Vị trí', 'Trạng thái', 'Mã QR'].map(h => (
                  <p key={h} className="text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</p>
                ))}
              </div>
              <div className="divide-y divide-slate-100">
                {units.map(u => {
                const qrData = u.qrData;
                return (
                  <div key={u.key} className="px-5 py-3 grid grid-cols-[1fr_96px_140px_120px_64px] gap-3 items-center hover:bg-slate-50/40 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${SOURCE_CFG[u.source].chipBg}`}>
                        <Package className={`w-3 h-3 ${SOURCE_CFG[u.source].iconCls}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {u.catalogName}
                          {u.unitLabel && <span className="ml-1.5 text-[10px] font-mono text-slate-400">#{u.unitLabel}</span>}
                        </p>
                        {u.detail && <p className="text-[11px] text-slate-400 truncate">{u.detail}</p>}
                      </div>
                    </div>
                    <SourceBadge source={u.source} />
                    <div className="min-w-0">
                      {u.location ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 max-w-full truncate">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{u.location}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-slate-50 text-slate-500 border-slate-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                          Chưa rõ vị trí
                        </span>
                      )}
                    </div>
                    <StatusBadge status={u.status} source={u.source} />
                    {qrData ? (
                      <button
                        onClick={() => onShowQr({
                          title: u.catalogName + (u.unitLabel ? ` #${u.unitLabel}` : ''),
                          subtitle: `${data.property.propertyName} · ${SOURCE_CFG[u.source].label} · ${u.location ?? 'Chưa rõ vị trí'}`,
                          qrData,
                          downloadName: `QR-${qrData}.png`,
                        })}
                        className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-bold rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-colors"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        QR
                      </button>
                    ) : (
                      // Nhà gốc chưa có QR thật (xem comment buildUnits) — không hiện nút
                      // bấm vào để tránh in ra mã không quét được như trước.
                      <span
                        className="text-[10px] text-slate-300 text-center"
                        title="Thiết bị nhà gốc chưa có mã QR riêng từng cái"
                      >
                        —
                      </span>
                    )}
                  </div>
                );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

export const EquipmentCatalogPage = () => {
  const [propertyData,  setPropertyData]  = useState<PropertyData[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [loadingData,   setLoadingData]   = useState(false);
  const [fetchError,    setFetchError]    = useState<string | null>(null);
  const [search,        setSearch]        = useState('');
  const [sourceFilter,  setSourceFilter]  = useState<SourceFilter>('all');
  const [qrModal,       setQrModal]       = useState<QrTarget | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const propPage = await propertyService.getProperties(0, 100);
      const props = propPage.content;
      setPropertyData(props.map(p => ({ property: p, handover: [], renovationSessions: [], expanded: false })));

      if (props.length > 0) {
        setLoadingData(true);
        const results = await Promise.allSettled(
          props.map(async p => {
            const [handover, renovationSessions] = await Promise.all([
              propertyService.getHandoverEquipments(p.id).catch(() => [] as HandoverEquipmentResponse[]),
              propertyService.getRenovationSessions(p.id).catch(() => [] as RenovationSession[]),
            ]);
            return { id: p.id, handover, renovationSessions };
          })
        );
        setPropertyData(prev =>
          prev.map(d => {
            const hit = results.find(r => r.status === 'fulfilled' && r.value.id === d.property.id);
            if (!hit || hit.status !== 'fulfilled') return d;
            return { ...d, handover: hit.value.handover, renovationSessions: hit.value.renovationSessions };
          })
        );
        setLoadingData(false);
      }
    } catch {
      setFetchError('Không thể tải dữ liệu. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleProperty = (propertyId: number) => {
    setPropertyData(prev =>
      prev.map(d => d.property.id === propertyId ? { ...d, expanded: !d.expanded } : d)
    );
  };

  // Stats — đếm theo từng thiết bị riêng lẻ (đã tách số lượng), phân theo nguồn
  const stats = useMemo(() => {
    let total = 0, handover = 0, reno = 0;
    for (const d of propertyData) {
      for (const u of buildUnits(d)) {
        total += 1;
        if (u.source === 'PURCHASED') reno += 1; else handover += 1;
      }
    }
    return { total, handover, reno, buildings: propertyData.length };
  }, [propertyData]);

  // Lọc toà nhà: theo tên/địa chỉ hoặc có thiết bị khớp từ khoá + đúng nguồn đang lọc
  const filteredProperties = useMemo(() => {
    const q = search.toLowerCase();
    return propertyData.filter(d => {
      const units = buildUnits(d);
      const matchSource = sourceFilter === 'all' || units.some(u => u.source === sourceFilter);
      if (!matchSource) return false;
      if (!q) return true;
      return (
        d.property.propertyName.toLowerCase().includes(q) ||
        d.property.shortAddress?.toLowerCase().includes(q) ||
        units.some(u => u.catalogName.toLowerCase().includes(q))
      );
    });
  }, [propertyData, search, sourceFilter]);

  const SOURCE_TABS: { key: SourceFilter; label: string }[] = [
    { key: 'all',              label: 'Tất cả' },
    { key: 'INITIAL_HANDOVER', label: 'Nhà gốc' },
    { key: 'PURCHASED',        label: 'Cải tạo' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-32 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Đang tải dữ liệu...</span>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-32">
        <AlertCircle className="w-8 h-8 text-rose-400" />
        <p className="text-sm text-rose-600">{fetchError}</p>
        <button onClick={load}
          className="px-4 py-2 text-sm font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-1 h-6 bg-cyan-500 rounded-full" />
          <h1 className="text-xl font-bold text-slate-900">Danh mục thiết bị</h1>
        </div>
        <p className="text-sm text-slate-500 ml-3.5">
          Quản lý thiết bị theo từng toà nhà — phân biệt thiết bị <strong>nhà gốc</strong> (chủ nhà bàn giao, nhập nhà hàng loạt)
          và thiết bị <strong>cải tạo</strong> (bổ sung/thay thế qua đợt cải tạo).
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Tổng thiết bị</p>
              <p className="text-2xl font-bold text-slate-800 mt-2">
                {loadingData ? <Loader2 className="w-5 h-5 animate-spin inline text-slate-400" /> : stats.total}
              </p>
              <p className="text-xs text-slate-500 mt-1">đã tách riêng lẻ (QR: chỉ nhóm cải tạo)</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center">
              <Package className="w-4 h-4 text-slate-500" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Từ nhà gốc</p>
              <p className="text-2xl font-bold text-violet-700 mt-2">
                {loadingData ? <Loader2 className="w-5 h-5 animate-spin inline text-violet-400" /> : stats.handover}
              </p>
              <p className="text-xs text-slate-500 mt-1">chủ nhà bàn giao (bàn giao)</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-violet-500" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Từ cải tạo</p>
              <p className="text-2xl font-bold text-amber-700 mt-2">
                {loadingData ? <Loader2 className="w-5 h-5 animate-spin inline text-amber-400" /> : stats.reno}
              </p>
              <p className="text-xs text-slate-500 mt-1">bổ sung/thay thế khi cải tạo</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center">
              <Wrench className="w-4 h-4 text-amber-500" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Số toà nhà</p>
              <p className="text-2xl font-bold text-cyan-700 mt-2">{stats.buildings}</p>
              <p className="text-xs text-slate-500 mt-1">đang quản lý thiết bị</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-cyan-50 border border-cyan-100 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-cyan-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar: search + lọc nguồn */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 transition"
            placeholder="Tìm tòa nhà hoặc thiết bị..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          {SOURCE_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setSourceFilter(t.key)}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                sourceFilter === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loadingData && (
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Đang tải thiết bị từ {propertyData.length} tòa nhà...
        </div>
      )}

      {/* Danh sách toà nhà */}
      <div className="space-y-3">
        {filteredProperties.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
            <Building2 className="w-8 h-8" />
            <p className="text-sm">Không tìm thấy tòa nhà nào.</p>
          </div>
        ) : (
          filteredProperties.map(data => (
            <PropertyAccordion
              key={data.property.id}
              data={data}
              search={search}
              sourceFilter={sourceFilter}
              onToggle={() => toggleProperty(data.property.id)}
              onShowQr={setQrModal}
            />
          ))
        )}

        <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 mt-1">
          <Info className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500 leading-relaxed">
            Thiết bị ở đây được import từ 2 nguồn Excel: <strong>Nhập nhà hàng loạt</strong> tạo ra thiết bị{' '}
            <strong className="text-violet-600">Nhà gốc</strong> (chủ nhà bàn giao), còn <strong>Nhập cải tạo</strong> tạo ra thiết bị{' '}
            <strong className="text-amber-600">Cải tạo</strong> (bổ sung/thay thế). Chỉ thiết bị <strong>Cải tạo</strong> có{' '}
            <strong>mã QR</strong> thật (quét bằng app tenant/manager ra đúng thiết bị) — thiết bị{' '}
            <strong className="text-violet-600">Nhà gốc</strong> hiện chỉ ghi nhận theo số lượng, chưa tách được từng cái nên chưa có QR riêng.
          </p>
        </div>
      </div>

      {/* QR Modal */}
      {qrModal && <QrModal {...qrModal} onClose={() => setQrModal(null)} />}
    </div>
  );
};
