import { useEffect, useState } from 'react';
import { Loader2, PackageCheck } from 'lucide-react';
import { propertyService } from '../../../services/property.service';
import type { HandoverEquipmentResponse } from '../../../types/api.types';

const AREA_LABEL: Record<string, string> = {
  LIVING_ROOM: 'Phòng khách',
  KITCHEN: 'Bếp',
  BATHROOM: 'Nhà tắm',
  BALCONY: 'Ban công',
  GARAGE: 'Nhà để xe',
  OTHER: 'Khu vực chung',
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  NEW: { label: 'Mới', cls: 'bg-emerald-100 text-emerald-700' },
  GOOD: { label: 'Tốt', cls: 'bg-sky-100 text-sky-700' },
  DAMAGED: { label: 'Hư hỏng nhẹ', cls: 'bg-amber-100 text-amber-700' },
  BROKEN: { label: 'Hỏng', cls: 'bg-rose-100 text-rose-700' },
};

// Vị trí TB bàn giao: BE mới để roomNumber/houseArea = null, ghi vị trí trong `note`.
// Ưu tiên note; fallback roomNumber/houseArea cho dữ liệu cũ.
const location = (e: HandoverEquipmentResponse): string =>
  e.note?.trim()
    ? e.note
    : e.roomNumber ? `Phòng ${e.roomNumber}` : e.houseArea ? (AREA_LABEL[e.houseArea] ?? e.houseArea) : '—';

/**
 * Section "Thiết bị chủ nhà bàn giao" ở màn chi tiết toà nhà.
 * Dữ liệu từ import đợt 1 (GET /properties/{id}/handover-equipments) — CHỈ hiển thị,
 * không gán phòng vận hành, không tính khấu hao. Tự ẩn khi không có dữ liệu.
 */
export const HandoverEquipmentSection = ({ propertyId }: { propertyId: number }) => {
  const [items, setItems] = useState<HandoverEquipmentResponse[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    propertyService.getHandoverEquipments(propertyId)
      .then(d => { if (!cancelled) setItems(d); })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [propertyId]);

  if (loading) {
    return (
      <div className="mb-6 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải thiết bị bàn giao...
      </div>
    );
  }

  // Ẩn hẳn section khi căn không có thiết bị bàn giao.
  if (!items || items.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-500">
        <PackageCheck className="h-4 w-4 text-emerald-500" /> Thiết bị chủ nhà bàn giao
      </h3>
      <p className="mb-4 text-xs text-slate-400">
        Nội thất/thiết bị chủ nhà gốc bàn giao theo hợp đồng thuê — chỉ để tham khảo, không tính khấu hao.
      </p>
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-2.5">Thiết bị</th>
              <th className="px-4 py-2.5">Vị trí / Ghi chú</th>
              <th className="px-4 py-2.5">Trạng thái</th>
              <th className="px-4 py-2.5 text-right">Số lượng</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => {
              const badge = STATUS_BADGE[e.status] ?? { label: e.status, cls: 'bg-slate-100 text-slate-600' };
              return (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{e.catalogName}</p>
                    {e.description && <p className="text-xs text-slate-400">{e.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{location(e)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge.cls}`}>{badge.label}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-700">{e.quantity}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
