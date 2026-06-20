import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AlertCircle, Building2, ChevronRight, Download,
  Info, Loader2, MapPin, Package, Plus, Printer, QrCode, Search, X,
} from 'lucide-react';
import type {
  EquipmentAssignmentResponse, HouseArea, ManifestItemResponse, PropertyResponse,
} from '../../types/api.types';
import { catalogService } from '../../services/catalog.service';
import { propertyService } from '../../services/property.service';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'available' | 'purchased';

interface PropertyData {
  property: PropertyResponse;
  manifests: ManifestItemResponse[];
  /** Tất cả lượt gán thiết bị của tòa (mọi nguồn) — dùng để biết từng cái nằm ở phòng nào */
  assignments: EquipmentAssignmentResponse[];
  expanded: boolean;
}

/** 1 đơn vị thiết bị riêng lẻ (tách từ số lượng) — mỗi cái 1 mã QR + vị trí riêng */
interface EquipmentUnit {
  key: string;
  catalogName: string;
  status: string;
  /** null = chưa gán, còn trong kho */
  location: string | null;
  /** "2/3" khi cùng loại có nhiều cái; '' khi chỉ 1 */
  unitLabel: string;
  qrData: string;
}

/** Thiết bị mới mua — chờ gán vào toà nhà/phòng ở Cấu hình khai thác */
interface PurchasedPoolItem {
  localId: string;
  catalogId?: number; // từ BE khi createEquipmentCatalogItem được implement
  name: string;
  quantity: number;
  price?: number;
  createdAt: string;
}

/** Mô tả 1 mã QR cần hiển thị — dùng chung cho cả thiết bị có sẵn (manifest) lẫn mới mua */
interface QrTarget {
  title: string;
  subtitle: string;
  qrData: string;
  downloadName: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getPoolQrData = (item: PurchasedPoolItem) => {
  const id = item.catalogId ?? item.localId;
  return `URBANNEST-EQ-${id}-${item.name.replace(/\s+/g, '_').toUpperCase()}`;
};

const HOUSE_AREA_LABEL: Record<HouseArea, string> = {
  LIVING_ROOM: 'Phòng khách', BEDROOM: 'Phòng ngủ', KITCHEN: 'Bếp',
  BATHROOM: 'Nhà tắm', BALCONY: 'Ban công', GARAGE: 'Gara', OTHER: 'Khác',
};

const slug = (s: string) => s.replace(/\s+/g, '_').toUpperCase();

/**
 * Tách 1 tòa thành danh sách thiết bị riêng lẻ (mỗi cái 1 QR):
 *  - Từ assignments (INITIAL_HANDOVER): mỗi cái biết phòng/khu vực đang nằm.
 *  - Phần còn lại của manifest chưa gán: liệt kê là "trong kho".
 * QR nhúng sẵn mã vị trí để quét ra là biết nằm ở đâu.
 */
const buildUnits = (data: PropertyData): EquipmentUnit[] => {
  const propertyId = data.property.id;
  const handover = data.assignments.filter(a => a.source === 'INITIAL_HANDOVER');
  const units: EquipmentUnit[] = [];

  // 1) Đã gán vào phòng / khu vực
  for (const a of handover) {
    const loc = a.roomNumber
      ? `Phòng ${a.roomNumber}`
      : a.houseArea ? HOUSE_AREA_LABEL[a.houseArea] : 'Đã gán';
    const locCode = a.roomNumber ? `R${slug(a.roomNumber)}` : a.houseArea ?? 'GAN';
    for (let i = 1; i <= a.quantity; i++) {
      units.push({
        key: `a${a.id}-u${i}`,
        catalogName: a.catalogName,
        status: a.status,
        location: loc,
        unitLabel: a.quantity > 1 ? `${i}/${a.quantity}` : '',
        qrData: `URBANNEST-EQ-P${propertyId}-${locCode}-${slug(a.catalogName)}-A${a.id}U${i}`,
      });
    }
  }

  // 2) Chưa gán — còn trong kho (số lượng manifest trừ đi phần đã gán)
  for (const m of data.manifests) {
    const assignedQty = handover
      .filter(a => a.catalogId === m.catalogId)
      .reduce((s, a) => s + a.quantity, 0);
    const remain = Math.max(0, m.quantity - assignedQty);
    for (let i = 1; i <= remain; i++) {
      units.push({
        key: `m${m.id}-u${i}`,
        catalogName: m.catalogName,
        status: m.status,
        location: null,
        unitLabel: remain > 1 ? `${i}/${remain}` : '',
        qrData: `URBANNEST-EQ-P${propertyId}-KHO-${slug(m.catalogName)}-M${m.id}U${assignedQty + i}`,
      });
    }
  }

  return units.sort((x, y) =>
    x.catalogName.localeCompare(y.catalogName) ||
    (x.location ?? 'zzz').localeCompare(y.location ?? 'zzz')
  );
};

const getQrUrl = (data: string, size = 180) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;

const formatPrice = (price?: number) =>
  price != null ? price.toLocaleString('vi-VN') + ' ₫' : '—';

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; dot: string; cls: string }> = {
  NEW:     { label: 'Mới',      dot: 'bg-emerald-500', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  GOOD:    { label: 'Tốt',      dot: 'bg-lime-500',    cls: 'bg-lime-50 text-lime-700 border-lime-200' },
  DAMAGED: { label: 'Hư hỏng',  dot: 'bg-orange-500',  cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  BROKEN:  { label: 'Báo hỏng', dot: 'bg-rose-500',    cls: 'bg-rose-50 text-rose-700 border-rose-200' },
};

// NEW/GOOD trong manifest = tình trạng lúc bàn giao, không phải "mới mua"
const MANIFEST_STATUS_CFG: Record<string, { label: string; dot: string; cls: string }> = {
  NEW:  { label: 'Bàn giao - Mới', dot: 'bg-violet-500', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
  GOOD: { label: 'Bàn giao - Cũ',  dot: 'bg-slate-400',  cls: 'bg-slate-50 text-slate-600 border-slate-200' },
};

const ManifestStatusBadge = ({ status }: { status: string }) => {
  const cfg = MANIFEST_STATUS_CFG[status] ?? STATUS_CFG[status];
  if (!cfg) return <span className="text-xs text-slate-400">{status}</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

const AssignBadge = ({ info }: { info: { propertyName: string; roomNumber?: string } | null }) => {
  if (!info) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-slate-50 text-slate-500 border-slate-200">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
        Chưa gán
      </span>
    );
  }
  return (
    <div>
      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Đang gán
      </span>
      <p className="text-[10px] text-slate-500 mt-0.5 max-w-[140px] truncate">
        {info.propertyName}{info.roomNumber ? ` / Phòng ${info.roomNumber}` : ''}
      </p>
    </div>
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

// ─── Add Purchased Modal ──────────────────────────────────────────────────────

const AddPurchasedModal = ({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (item: PurchasedPoolItem) => void;
}) => {
  const [name,     setName]     = useState('');
  const [quantity, setQuantity] = useState(1);
  const [price,    setPrice]    = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const previewQrData = name.trim()
    ? `URBANNEST-EQ-NEW-${name.trim().replace(/\s+/g, '_').toUpperCase()}`
    : 'URBANNEST-EQ-PREVIEW';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Vui lòng nhập tên thiết bị.'); return; }
    setSaving(true);
    setError(null);

    let catalogId: number | undefined;
    try {
      const created = await catalogService.createEquipmentCatalogItem({ name: name.trim() });
      catalogId = created.id;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number; data?: { error?: string; message?: string } } })?.response?.status;
      if (status === 409) {
        const data = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
        setError(data?.error ?? data?.message ?? 'Tên thiết bị đã tồn tại trong danh mục.');
        setSaving(false);
        return;
      }
      // 404/500 — BE chưa implement endpoint, lưu local (Mục 12)
    }

    const raw = price.replace(/\./g, '').replace(/,/g, '').replace(/[^\d]/g, '');
    const item: PurchasedPoolItem = {
      localId: `local-${Date.now()}`,
      catalogId,
      name: name.trim(),
      quantity,
      price: raw ? Number(raw) : undefined,
      createdAt: new Date().toISOString(),
    };
    onSaved(item);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl mx-4">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-cyan-50 border border-cyan-100 text-[10px] font-bold text-cyan-700 mb-2">
              <Package className="w-3 h-3" />
              Mua mới
            </div>
            <h2 className="text-base font-bold text-slate-900">Thêm thiết bị mới mua</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Thiết bị vào kho chờ — gán toà nhà / phòng ở bước Cấu hình khai thác.
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-6">
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                  Tên thiết bị <span className="text-rose-500">*</span>
                </span>
                <input
                  type="text"
                  className="input-field mt-1.5 text-sm"
                  placeholder='VD: Điều hoà Daikin, Tivi Samsung 55"...'
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoFocus
                />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Số lượng</span>
                  <input
                    type="number" min={1}
                    className="input-field mt-1.5 text-sm"
                    value={quantity}
                    onChange={e => setQuantity(Math.max(1, Number(e.target.value)))}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Giá (₫)</span>
                  <input
                    type="text"
                    className="input-field mt-1.5 text-sm"
                    placeholder="VD: 8.500.000"
                    value={price}
                    onChange={e => {
                      const digits = e.target.value.replace(/\D/g, '');
                      setPrice(digits ? Number(digits).toLocaleString('vi-VN') : '');
                    }}
                  />
                </label>
              </div>

            </div>

            {/* QR Preview */}
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">QR Preview</p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <img
                  src={getQrUrl(previewQrData, 140)}
                  alt="QR preview"
                  className="w-[140px] h-[140px]"
                />
                <p className="font-mono text-[9px] text-slate-400 mt-2 break-all leading-relaxed">
                  {previewQrData}
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 mt-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
              Huỷ
            </button>
            <button type="submit" disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Lưu & tạo QR
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Property Accordion — Tab "Có sẵn" ───────────────────────────────────────

const PropertyAccordion = ({
  data,
  search,
  onToggle,
  onShowQr,
}: {
  data: PropertyData;
  search: string;
  onToggle: () => void;
  onShowQr: (target: QrTarget) => void;
}) => {
  const q = search.toLowerCase();
  const allUnits = useMemo(() => buildUnits(data), [data]);
  const units = q ? allUnits.filter(u => u.catalogName.toLowerCase().includes(q)) : allUnits;
  const assignedCount = allUnits.filter(u => u.location).length;

  return (
    <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center gap-3 hover:bg-slate-50/50 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-4 h-4 text-violet-500" />
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="font-semibold text-slate-900 text-sm truncate">{data.property.propertyName}</p>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{data.property.shortAddress}</p>
        </div>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 flex-shrink-0">
          {allUnits.length} thiết bị
        </span>
        <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${data.expanded ? 'rotate-90' : ''}`} />
      </button>

      {data.expanded && (
        <div className="border-t border-slate-100">
          {units.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-xs text-slate-400">
                {search ? 'Không tìm thấy thiết bị phù hợp.' : 'Không có thiết bị nào được khai báo khi nhận nhà.'}
              </p>
            </div>
          ) : (
            <div>
              <div className="px-5 py-2 bg-slate-50/60 border-b border-slate-100 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {allUnits.length} thiết bị riêng lẻ
                </p>
                <p className="text-[10px] font-bold text-slate-400">
                  <span className="text-emerald-600">{assignedCount} đã gán</span>
                  {' · '}
                  <span>{allUnits.length - assignedCount} trong kho</span>
                </p>
              </div>
              <div className="px-5 py-2 bg-slate-50/30 border-b border-slate-100 grid grid-cols-[1fr_150px_104px_72px] gap-3">
                {['Thiết bị', 'Vị trí', 'Trạng thái', 'Mã QR'].map(h => (
                  <p key={h} className="text-[10px] font-black uppercase tracking-widest text-slate-400">{h}</p>
                ))}
              </div>
              <div className="divide-y divide-slate-100">
                {units.map(u => (
                  <div key={u.key} className="px-5 py-3 grid grid-cols-[1fr_150px_104px_72px] gap-3 items-center hover:bg-slate-50/40 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-6 h-6 rounded bg-violet-50 flex items-center justify-center flex-shrink-0">
                        <Package className="w-3 h-3 text-violet-500" />
                      </div>
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {u.catalogName}
                        {u.unitLabel && <span className="ml-1.5 text-[10px] font-mono text-slate-400">#{u.unitLabel}</span>}
                      </p>
                    </div>
                    <div className="min-w-0">
                      {u.location ? (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 max-w-full truncate">
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{u.location}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-slate-50 text-slate-500 border-slate-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                          Trong kho
                        </span>
                      )}
                    </div>
                    <ManifestStatusBadge status={u.status} />
                    <button
                      onClick={() => onShowQr({
                        title: u.catalogName + (u.unitLabel ? ` #${u.unitLabel}` : ''),
                        subtitle: `${data.property.propertyName} · ${u.location ?? 'Chưa gán — trong kho'}`,
                        qrData: u.qrData,
                        downloadName: `QR-${u.qrData}.png`,
                      })}
                      className="inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-bold rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-700 transition-colors"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      QR
                    </button>
                  </div>
                ))}
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
  const [tab,           setTab]           = useState<Tab>('available');
  const [propertyData,  setPropertyData]  = useState<PropertyData[]>([]);
  const [purchasedPool, setPurchasedPool] = useState<PurchasedPoolItem[]>(() => {
    try {
      const saved = localStorage.getItem('urbannest_purchased_pool');
      return saved ? (JSON.parse(saved) as PurchasedPoolItem[]) : [];
    } catch {
      return [];
    }
  });
  const [loading,       setLoading]       = useState(true);
  const [loadingData,   setLoadingData]   = useState(false);
  const [fetchError,    setFetchError]    = useState<string | null>(null);
  const [searchAvail,   setSearchAvail]   = useState('');
  const [searchBuy,     setSearchBuy]     = useState('');
  const [qrModal,       setQrModal]       = useState<QrTarget | null>(null);
  const [showAdd,       setShowAdd]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const propPage = await propertyService.getProperties(0, 100);
      const props = propPage.content;
      setPropertyData(props.map(p => ({ property: p, manifests: [], assignments: [], expanded: false })));

      if (props.length > 0) {
        setLoadingData(true);
        const results = await Promise.allSettled(
          props.map(async p => {
            const [manifests, assignments] = await Promise.all([
              propertyService.getManifest(p.id).catch(() => [] as ManifestItemResponse[]),
              propertyService.getAssignedEquipments(p.id).catch(() => [] as EquipmentAssignmentResponse[]),
            ]);
            return { id: p.id, manifests, assignments };
          })
        );
        setPropertyData(prev =>
          prev.map(d => {
            const hit = results.find(r => r.status === 'fulfilled' && r.value.id === d.property.id);
            if (!hit || hit.status !== 'fulfilled') return d;
            return { ...d, manifests: hit.value.manifests, assignments: hit.value.assignments };
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

  // Sync pool vào localStorage mỗi khi thay đổi
  useEffect(() => {
    localStorage.setItem('urbannest_purchased_pool', JSON.stringify(purchasedPool));
  }, [purchasedPool]);

  const toggleProperty = (propertyId: number) => {
    setPropertyData(prev =>
      prev.map(d => d.property.id === propertyId ? { ...d, expanded: !d.expanded } : d)
    );
  };

  const handleSaved = (item: PurchasedPoolItem) => {
    setPurchasedPool(prev => [item, ...prev]);
    setShowAdd(false);
  };

  /** Cross-reference: tìm xem catalogId (mới mua) này đang được gán ở đâu */
  const getAssignment = useCallback((catalogId?: number) => {
    if (!catalogId) return null;
    for (const d of propertyData) {
      const a = d.assignments.find(p => p.source === 'PURCHASED' && p.catalogId === catalogId);
      if (a) return { propertyName: d.property.propertyName, roomNumber: a.roomNumber ?? undefined };
    }
    return null;
  }, [propertyData]);

  // Stats — đếm theo từng thiết bị riêng lẻ (đã tách số lượng)
  const totalAvailable = useMemo(
    () => propertyData.reduce((sum, d) => sum + buildUnits(d).length, 0),
    [propertyData]
  );
  const totalPurchased = purchasedPool.length;

  const filteredPool = useMemo(() => {
    const q = searchBuy.toLowerCase();
    if (!q) return purchasedPool;
    return purchasedPool.filter(item => item.name.toLowerCase().includes(q));
  }, [purchasedPool, searchBuy]);

  const filteredProperties = useMemo(() => {
    const q = searchAvail.toLowerCase();
    if (!q) return propertyData;
    return propertyData.filter(d =>
      d.property.propertyName.toLowerCase().includes(q) ||
      d.manifests.some(m => m.catalogName.toLowerCase().includes(q))
    );
  }, [propertyData, searchAvail]);

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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-1 h-6 bg-cyan-500 rounded-full" />
            <h1 className="text-xl font-bold text-slate-900">Danh mục thiết bị</h1>
          </div>
          <p className="text-sm text-slate-500 ml-3.5">
            Thiết bị có sẵn từ nhà gốc (khai báo manifest) và thiết bị mua mới kèm QR.
          </p>
        </div>
        {tab === 'purchased' && (
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-bold rounded-lg hover:bg-primary-700 transition-colors shadow-sm flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
            Thêm thiết bị mới mua
          </button>
        )}
      </div>

      {/* Stats — clickable to switch tab */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => setTab('available')}
          className={`bg-white rounded-xl border shadow-sm p-5 text-left transition-all ${
            tab === 'available' ? 'border-violet-300 ring-2 ring-violet-100' : 'border-slate-200/70 hover:border-violet-200'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Thiết bị có sẵn</p>
              <p className="text-2xl font-bold text-violet-700 mt-2">
                {loadingData ? <Loader2 className="w-5 h-5 animate-spin inline text-violet-400" /> : totalAvailable}
              </p>
              <p className="text-xs text-slate-500 mt-1">khai báo khi nhận nhà (manifest)</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-violet-500" />
            </div>
          </div>
        </button>
        <button
          onClick={() => setTab('purchased')}
          className={`bg-white rounded-xl border shadow-sm p-5 text-left transition-all ${
            tab === 'purchased' ? 'border-cyan-300 ring-2 ring-cyan-100' : 'border-slate-200/70 hover:border-cyan-200'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Thiết bị mới mua</p>
              <p className="text-2xl font-bold text-cyan-700 mt-2">{totalPurchased}</p>
              <p className="text-xs text-slate-500 mt-1">trong kho, chờ gán vào toà nhà</p>
            </div>
            <div className="w-9 h-9 rounded-lg bg-cyan-50 border border-cyan-100 flex items-center justify-center">
              <QrCode className="w-4 h-4 text-cyan-500" />
            </div>
          </div>
        </button>
      </div>

      {/* Main panel */}
      <div className="bg-white rounded-xl border border-slate-200/70 shadow-sm overflow-hidden">
        {/* Tab switcher */}
        <div className="flex border-b border-slate-100">
          <button
            onClick={() => setTab('available')}
            className={`flex-1 px-6 py-4 text-left transition-colors border-b-2 ${
              tab === 'available' ? 'border-violet-500 bg-violet-50/40' : 'border-transparent hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <Building2 className={`w-4 h-4 ${tab === 'available' ? 'text-violet-600' : 'text-slate-400'}`} />
              <p className={`text-sm font-bold ${tab === 'available' ? 'text-violet-700' : 'text-slate-600'}`}>
                Thiết bị có sẵn
              </p>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === 'available' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
                {totalAvailable}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 ml-6">Khai báo lúc nhận nhà (manifest)</p>
          </button>
          <button
            onClick={() => setTab('purchased')}
            className={`flex-1 px-6 py-4 text-left transition-colors border-b-2 ${
              tab === 'purchased' ? 'border-cyan-500 bg-cyan-50/40' : 'border-transparent hover:bg-slate-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <QrCode className={`w-4 h-4 ${tab === 'purchased' ? 'text-cyan-600' : 'text-slate-400'}`} />
              <p className={`text-sm font-bold ${tab === 'purchased' ? 'text-cyan-700' : 'text-slate-600'}`}>
                Thiết bị mới mua
              </p>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === 'purchased' ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-500'}`}>
                {totalPurchased}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 ml-6">Kho chờ gán — kèm QR tự động</p>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-400 transition"
              placeholder={tab === 'available' ? 'Tìm tòa nhà hoặc thiết bị...' : 'Tìm tên thiết bị...'}
              value={tab === 'available' ? searchAvail : searchBuy}
              onChange={e => tab === 'available' ? setSearchAvail(e.target.value) : setSearchBuy(e.target.value)}
            />
          </div>

          {loadingData && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Đang tải thiết bị từ {propertyData.length} tòa nhà...
            </div>
          )}

          {/* ── Tab: Có sẵn ── */}
          {tab === 'available' && (
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
                    search={searchAvail}
                    onToggle={() => toggleProperty(data.property.id)}
                    onShowQr={setQrModal}
                  />
                ))
              )}
              <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 mt-1">
                <Info className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-slate-500 leading-relaxed">
                  Đây là thiết bị khai báo khi nhận nhà từ chủ sở hữu (bao gồm thiết bị nhập từ <strong>Nhập nhà hàng loạt</strong>),
                  đã được <strong>tách thành từng cái riêng lẻ</strong>. Mỗi cái có <strong>mã QR riêng</strong> nhúng sẵn vị trí —
                  quét vào là biết thiết bị đang ở <strong>phòng/khu vực</strong> nào, hoặc còn <strong>trong kho</strong> (chưa gán).
                  Phòng được gán ở bước <strong>Cấu hình khai thác</strong>; bấm <strong>QR</strong> để tải / in tem dán lên thiết bị.
                </p>
              </div>
            </div>
          )}

          {/* ── Tab: Mới mua ── */}
          {tab === 'purchased' && (
            <div className="space-y-4">
              {filteredPool.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
                  <QrCode className="w-8 h-8" />
                  <p className="text-sm">
                    {searchBuy ? 'Không tìm thấy thiết bị phù hợp.' : 'Kho chưa có thiết bị mới mua nào.'}
                  </p>
                  {!searchBuy && (
                    <button
                      onClick={() => setShowAdd(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Thêm thiết bị đầu tiên
                    </button>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50/60 border-b border-slate-100">
                        <th className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 px-4 py-3 w-10">#</th>
                        <th className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 px-4 py-3">Thiết bị</th>
                        <th className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 px-4 py-3">Giá</th>
                        <th className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 px-4 py-3">Trạng thái gán</th>
                        <th className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 px-4 py-3">Mã QR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPool.map((item, idx) => {
                        const assignInfo = getAssignment(item.catalogId);
                        return (
                          <tr key={item.localId} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3 text-xs font-bold text-slate-400">{idx + 1}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-cyan-50 flex items-center justify-center flex-shrink-0">
                                  <Package className="w-3.5 h-3.5 text-cyan-600" />
                                </div>
                                <div>
                                  <p className="font-semibold text-slate-900 text-sm leading-tight">{item.name}</p>
                                  <p className="text-[10px] font-mono text-slate-400">x{item.quantity}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm font-semibold text-slate-700">{formatPrice(item.price)}</p>
                            </td>
                            <td className="px-4 py-3">
                              <AssignBadge info={assignInfo} />
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={() => setQrModal({
                                  title: item.name,
                                  subtitle: assignInfo
                                    ? `${assignInfo.propertyName}${assignInfo.roomNumber ? ` / Phòng ${assignInfo.roomNumber}` : ''} · x${item.quantity}`
                                    : `Chưa gán · x${item.quantity}`,
                                  qrData: getPoolQrData(item),
                                  downloadName: `QR-EQ-${item.localId}.png`,
                                })}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-cyan-50 hover:border-cyan-200 hover:text-cyan-700 transition-colors"
                              >
                                <QrCode className="w-3.5 h-3.5" />
                                Xem QR
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {filteredPool.length > 0 && (
                <p className="text-xs text-slate-400 text-right">
                  {filteredPool.length} thiết bị{searchBuy && ` / ${purchasedPool.length} tổng`}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {qrModal && <QrModal {...qrModal} onClose={() => setQrModal(null)} />}
      {showAdd && (
        <AddPurchasedModal
          onClose={() => setShowAdd(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};
