import { useCallback, useEffect, useState } from 'react';
import { History, Loader2, Lock, Pencil, TrendingDown, TrendingUp, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { propertyService } from '@/services/property.service';
import type { PriceHistoryItem, PropertyResponse, RoomResponse } from '@/types/api.types';
import { Overlay } from '@/components/Overlay';

/**
 * Quản lý GIÁ THUÊ của một nhà / phòng — dùng ở màn chi tiết bất động sản của Host.
 *
 * Mô hình (chốt với PO 15/08/2026, BE đã làm xong):
 *   • `listedPrice`  — giá Host duyệt, là GIÁ BÁN. Chỉ Host đổi, và chỉ khi đơn vị TRỐNG.
 *   • `appliedPrice` — giá hợp đồng đang chạy. Hoá đơn/doanh thu chạy theo số này.
 *   • Khách trả phòng xong → applied tự quay về listed.
 *   • `priceLocked = true` ⇒ đang có khách ⇒ KHÔNG sửa được gì cho tới khi khách rời đi.
 *
 * Vì sao khoá cứng: hợp đồng đã ký là cam kết hai chiều. Sửa được giá giữa chừng thì
 * hoá đơn tháng sau nhảy số trong khi khách vẫn đang trả đúng hợp đồng. Tăng giá theo
 * năm phải nằm trong ĐIỀU KHOẢN hợp đồng, không phải một nút bấm ở đây.
 */

const fmtVnd = (v?: number | null) =>
  v == null ? '—' : new Intl.NumberFormat('vi-VN').format(v) + ' đ';

const fmtAt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** Màu theo loại thay đổi — chỉ HOST_DOI là do người bấm, ba loại kia hệ thống tự sinh. */
const TYPE_CLS: Record<string, string> = {
  HOST_DOI:      'bg-indigo-100 text-indigo-700',
  HOP_DONG:      'bg-amber-100 text-amber-700',
  DIEU_KHOAN_HD: 'bg-violet-100 text-violet-700',
  TU_DONG:       'bg-slate-100 text-slate-600',
};

// ── Hộp đổi giá ─────────────────────────────────────────────────────────────
const EditPriceModal = ({ title, current, onClose, onSave }: {
  title: string;
  current?: number;
  onClose: () => void;
  onSave: (price: number, reason: string) => Promise<void>;
}) => {
  const [price, setPrice] = useState(current != null ? String(current) : '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const value = price === '' ? null : Number(price);
  const diff = value != null && current != null ? value - current : 0;
  const diffPct = value != null && current ? Math.round((diff / current) * 1000) / 10 : 0;
  const canSave = value != null && value > 0 && reason.trim().length > 0 && value !== current;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(value!, reason.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Overlay>
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button aria-label="Đóng" className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-base font-black text-slate-950">Đổi giá niêm yết</h3>
            <p className="mt-0.5 text-sm text-slate-500">{title}</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold text-slate-500">Giá niêm yết hiện tại</p>
            <p className="mt-0.5 text-lg font-black text-slate-900">{fmtVnd(current)}</p>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">
              Giá mới <span className="text-rose-500">*</span>
            </span>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                value={value == null ? '' : value.toLocaleString('vi-VN')}
                onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ''))}
                className="input-field pr-12 text-right"
                placeholder="0"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">đ</span>
            </div>
            {value != null && current != null && value !== current && (
              <p className={`mt-1.5 flex items-center gap-1 text-xs font-semibold ${diff > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {diff > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {diff > 0 ? '+' : ''}{fmtVnd(diff)} ({diff > 0 ? '+' : ''}{diffPct}%)
              </p>
            )}
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">
              Lý do <span className="text-rose-500">*</span>
            </span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-field"
              placeholder="VD: phòng trống 2 tháng, hạ giá theo thị trường"
            />
            {/* Bắt buộc nhập: lịch sử giá không có lý do thì 3 tháng sau không ai
                nhớ vì sao giá đổi — đúng cái làm lịch sử mất giá trị. */}
            <span className="mt-1 block text-xs text-slate-400">
              Lý do được lưu vào lịch sử giá, không sửa lại được.
            </span>
          </label>

          <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
            Giá mới chỉ áp cho <b>hợp đồng ký sau</b>. Hợp đồng đang chạy giữ nguyên giá đã ký.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button onClick={onClose} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
            Hủy
          </button>
          <button
            onClick={submit}
            disabled={!canSave || saving}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Lưu giá mới
          </button>
        </div>
      </div>
    </div>
    </Overlay>
  );
};

// ── Lịch sử giá ─────────────────────────────────────────────────────────────
const PriceHistoryModal = ({ propertyId, roomId, title, onClose }: {
  propertyId: number;
  /**
   * BE trả lịch sử của CẢ nhà (gồm mọi phòng) trong một danh sách, nên phải tự lọc:
   *   • số   → chỉ dòng của đúng phòng đó
   *   • null → chỉ dòng cấp NHÀ (nhà nguyên căn — bỏ dòng của phòng bên trong)
   *   • bỏ trống → lấy tất
   */
  roomId?: number | null;
  title: string;
  onClose: () => void;
}) => {
  const [rows, setRows] = useState<PriceHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    propertyService.getPriceHistory(propertyId)
      .then((all) => {
        if (!active) return;
        if (roomId === undefined) setRows(all);
        else if (roomId === null) setRows(all.filter(r => r.roomId == null));
        else setRows(all.filter(r => r.roomId === roomId));
      })
      .catch(() => active && setRows([]))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [propertyId, roomId]);

  return (
    <Overlay>
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button aria-label="Đóng" className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="flex items-center gap-2 text-base font-black text-slate-950">
              <History className="h-4 w-4 text-indigo-500" /> Lịch sử giá
            </h3>
            <p className="mt-0.5 text-sm text-slate-500">{title}</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center">
              <p className="text-sm font-bold text-slate-700">Chưa có thay đổi giá</p>
              <p className="mt-1 text-xs text-slate-500">Giá vẫn giữ nguyên từ lúc Host duyệt.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => {
                const up = r.newPrice > r.oldPrice;
                return (
                  <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${TYPE_CLS[r.changeType] ?? 'bg-slate-100 text-slate-600'}`}>
                        {r.changeTypeLabel}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-400">{fmtAt(r.changedAt)}</span>
                    </div>

                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
                      <span className="text-slate-400 line-through">{fmtVnd(r.oldPrice)}</span>
                      <span className={up ? 'text-emerald-600' : 'text-rose-600'}>→</span>
                      <b className="text-slate-900">{fmtVnd(r.newPrice)}</b>
                      {r.roomNumber && <span className="text-xs text-slate-400">· phòng {r.roomNumber}</span>}
                    </p>

                    {r.reason && <p className="mt-1 text-xs italic text-slate-500">“{r.reason}”</p>}
                    <p className="mt-1 text-[11px] text-slate-400">
                      {r.changedByName ? `bởi ${r.changedByName}` : ''}
                      {r.contractId ? ` · HĐ #${r.contractId}` : ''}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
    </Overlay>
  );
};

/**
 * Cặp nút Đổi giá / Lịch sử cho nhà NGUYÊN CĂN — nhúng vào khối "Thông tin cho thuê"
 * ở tab Đơn vị cho thuê. Nhà chia phòng dùng nút ngay trên từng thẻ phòng.
 *
 * Cố ý KHÔNG làm một thẻ giá riêng ở tab Tổng quan: làm vậy thì giá hiện hai chỗ, mà với
 * nhà chia phòng thẻ đó chỉ còn mỗi câu "qua tab Phòng mà xem" — tốn nguyên một thẻ để
 * chỉ đường.
 */
export const WholeHousePriceActions = ({ property, onChanged }: {
  property: PropertyResponse;
  onChanged: () => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const listed = property.listedPrice ?? property.price;
  const locked = property.priceLocked === true;

  const save = useCallback(async (price: number, reason: string) => {
    try {
      await propertyService.updatePropertyPrice(property.id, price, reason);
      toast.success('Đã cập nhật giá niêm yết.');
      onChanged();
    } catch (e: any) {
      const d = e?.response?.data;
      toast.error(d?.message || d?.error || 'Không đổi được giá.');
      throw e;
    }
  }, [property.id, onChanged]);

  return (
    <>
      <div className="flex items-center gap-1.5">
        {locked ? (
          <span
            title={property.currentTenant ? `Đang cho ${property.currentTenant} thuê` : 'Đang có khách thuê'}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-100 py-1.5 text-[11px] font-bold text-slate-500"
          >
            <Lock className="h-3 w-3" /> Khoá giá
          </span>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-50 py-1.5 text-[11px] font-bold text-indigo-700 transition hover:bg-indigo-100"
          >
            <Pencil className="h-3 w-3" /> Đổi giá
          </button>
        )}
        <button
          title="Lịch sử giá cả căn"
          onClick={() => setShowHistory(true)}
          className="flex h-[26px] w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-indigo-300 hover:text-indigo-600"
        >
          <History className="h-3 w-3" />
        </button>
      </div>

      {editing && (
        <EditPriceModal
          title={property.propertyName}
          current={listed}
          onClose={() => setEditing(false)}
          onSave={save}
        />
      )}

      {showHistory && (
        <PriceHistoryModal
          propertyId={property.id}
          // Chỉ dòng CẤP NHÀ: nhà nguyên căn vẫn có phòng bên trong, để nguyên sẽ lẫn
          // cả lịch sử của từng phòng vào lịch sử "cả căn".
          roomId={null}
          title={`${property.propertyName} · cả căn`}
          onClose={() => setShowHistory(false)}
        />
      )}
    </>
  );
};

/** Nút xem lịch sử giá TOÀN NHÀ (mọi phòng) — đặt ở thanh công cụ tab Phòng. */
export const AllRoomsPriceHistoryButton = ({ property }: { property: PropertyResponse }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Lịch sử giá của mọi phòng trong nhà"
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700"
      >
        <History className="h-3.5 w-3.5" /> Lịch sử giá
      </button>
      {open && (
        <PriceHistoryModal
          propertyId={property.id}
          title={`${property.propertyName} · tất cả phòng`}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};

/**
 * Lịch sử giá của RIÊNG một phòng.
 *
 * BE trả lịch sử theo cả nhà (`GET /properties/{id}/price-history`) nên nhà 5 phòng sẽ ra
 * một danh sách trộn lẫn, phải tự dò `roomNumber` từng dòng. Lọc sẵn theo `roomId` để mỗi
 * phòng chỉ thấy đường giá của chính nó.
 */
export const RoomPriceHistoryModal = ({ propertyId, room, onClose }: {
  propertyId: number;
  room: RoomResponse;
  onClose: () => void;
}) => (
  <PriceHistoryModal
    propertyId={propertyId}
    roomId={room.id}
    title={`Phòng ${room.roomNumber}`}
    onClose={onClose}
  />
);

/** Hộp đổi giá cho MỘT phòng — dùng ở tab Phòng của màn chi tiết nhà. */
export const RoomPriceModal = ({ propertyId, room, onClose, onChanged }: {
  propertyId: number;
  room: RoomResponse;
  onClose: () => void;
  onChanged: () => void;
}) => (
  <EditPriceModal
    title={`Phòng ${room.roomNumber}`}
    current={room.listedPrice ?? room.price}
    onClose={onClose}
    onSave={async (price, reason) => {
      try {
        await propertyService.updateRoomPrice(propertyId, room.id, price, reason);
        toast.success(`Đã cập nhật giá phòng ${room.roomNumber}.`);
        onChanged();
      } catch (e: any) {
        const d = e?.response?.data;
        toast.error(d?.message || d?.error || 'Không đổi được giá.');
        throw e;
      }
    }}
  />
);
