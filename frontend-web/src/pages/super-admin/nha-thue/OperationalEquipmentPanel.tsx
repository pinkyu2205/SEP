import { useEffect, useMemo, useState } from 'react';
import { Loader2, Package, ShieldCheck } from 'lucide-react';
import { propertyService } from '../../../services/property.service';
import type { OperationalEquipmentResponse } from '../../../types/api.types';

const AREA_LABEL: Record<string, string> = {
  LIVING_ROOM: 'Phòng khách', KITCHEN: 'Bếp', BATHROOM: 'Nhà tắm',
  BALCONY: 'Ban công', GARAGE: 'Nhà để xe', OTHER: 'Khu vực chung',
};

const STATUS_LABEL: Record<string, string> = {
  NEW: 'Mới', GOOD: 'Tốt', DAMAGED: 'Hư hỏng nhẹ', BROKEN: 'Hỏng', MAINTENANCE: 'Bảo trì', DISPOSED: 'Đã thanh lý',
};

const formatVND = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
const formatDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const loc = (e: OperationalEquipmentResponse): string =>
  e.roomId != null ? `Phòng #${e.roomId}` : e.houseArea ? (AREA_LABEL[e.houseArea] ?? e.houseArea) : 'Toàn nhà';

/**
 * Tab "Thiết bị đang dùng" — GET /properties/{id}/equipments.
 * Hiện cả TB còn hiệu lực và đã thay thế (lọc được); badge nguồn + version cải tạo + bảo hành.
 */
export const OperationalEquipmentPanel = ({ propertyId }: { propertyId: number }) => {
  const [items, setItems] = useState<OperationalEquipmentResponse[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlyActive, setOnlyActive] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    propertyService.getEquipments(propertyId)
      .then(d => { if (!cancelled) setItems(d); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [propertyId]);

  const activeCount = useMemo(() => (items ?? []).filter(e => e.currentEffective).length, [items]);
  const filtered = useMemo(
    () => (items ?? []).filter(e => (onlyActive ? e.currentEffective : true)),
    [items, onlyActive],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-12 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải thiết bị...
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
        <Package className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        <p className="font-semibold text-slate-500">Chưa có thiết bị vận hành nào</p>
        <p className="mt-1 text-sm text-slate-400">Thiết bị mua mới được thêm khi nhập cải tạo (đợt 2 / bổ sung).</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-bold text-emerald-700">{activeCount} đang dùng</span>
          {items.length - activeCount > 0 && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-500">{items.length - activeCount} đã thay thế</span>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-600">
          <input type="checkbox" checked={onlyActive} onChange={e => setOnlyActive(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
          Chỉ hiện đang dùng
        </label>
      </div>

      <div className="space-y-2.5">
        {filtered.map((eq) => {
          const off = eq.operationalStatus === 'DISABLED' || !eq.currentEffective;
          return (
            <div key={eq.id} className={`rounded-2xl border p-4 ${off ? 'border-slate-200 bg-slate-50/60' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`font-bold ${off ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{eq.catalogName}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      eq.source === 'PURCHASED' ? 'bg-indigo-100 text-indigo-700' : 'bg-sky-100 text-sky-700'
                    }`}>
                      {eq.source === 'PURCHASED' ? 'Mua mới' : 'Bàn giao'}
                    </span>
                    {eq.renovationVersionLabel && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">{eq.renovationVersionLabel}</span>
                    )}
                    {off
                      ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">Đã thay thế</span>
                      : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Đang dùng</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {loc(eq)} · {STATUS_LABEL[eq.status] ?? eq.status}
                    {eq.note ? ` · ${eq.note}` : ''}
                  </p>
                  {(() => {
                    const start = eq.warrantyStartDate ? formatDate(eq.warrantyStartDate) : null;
                    const end = eq.warrantyEndDate ? formatDate(eq.warrantyEndDate) : null;
                    const hasInfo = !!end || eq.warrantyMonths != null;
                    let text: string;
                    if (end) {
                      text = start ? `Hạn sử dụng: ${start} → ${end}` : `Hạn sử dụng đến ${end}`;
                      if (eq.warrantyMonths != null) text += ` · bảo hành ${eq.warrantyMonths} tháng`;
                    } else if (eq.warrantyMonths != null) {
                      text = `Bảo hành ${eq.warrantyMonths} tháng`;
                    } else {
                      text = 'Hạn sử dụng: chưa cập nhật';
                    }
                    return (
                      <p className={`mt-1 flex items-center gap-1 text-xs ${hasInfo ? 'text-slate-500' : 'text-slate-400 italic'}`}>
                        <ShieldCheck className={`h-3.5 w-3.5 ${hasInfo ? 'text-emerald-500' : 'text-slate-300'}`} />
                        {text}
                      </p>
                    );
                  })()}
                </div>
                <span className="shrink-0 text-sm font-bold text-slate-700">{formatVND(eq.price)}</span>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white py-8 text-center text-sm text-slate-400">
            Không có thiết bị đang dùng.
          </p>
        )}
      </div>
    </div>
  );
};
