/**
 * Ô CHỌN NHÀ CÓ TÌM KIẾM — cho form tạo hợp đồng nháp.
 *
 * ─── Vì sao không dùng `<select>` nữa (30/08/2026) ───────────────────────────
 * Trước đây đây là một `<select>` gốc với hơn 100 `<option>`, nhãn mỗi dòng dài kiểu
 * "MTX#100 NGUYEN_CAN full NT — 111 Nguyễn Huệ (nguyên căn) · còn trống". Ba vấn đề:
 *
 *   1. KHÔNG GÕ TÌM ĐƯỢC. `<select>` gốc chỉ nhảy theo ký tự ĐẦU của nhãn, mà mọi nhãn
 *      đều bắt đầu bằng "MTX#" — gõ gì cũng vô ích. Admin biết thừa mình cần căn ở
 *      "Lê Đức Thọ" nhưng vẫn phải cuộn tay qua cả trăm dòng để dò.
 *   2. Danh sách xổ ra che gần hết modal, không đọc được phần form đang điền dở.
 *   3. Mọi thông tin bị ép vào MỘT dòng chữ nên tên nhà, địa chỉ và tình trạng chỗ
 *      trống dính liền nhau, mắt không tách được đâu là đâu.
 *
 * Nay: một ô tìm kiếm + danh sách lọc theo thời gian thực, mỗi dòng tách tên / địa chỉ /
 * tình trạng thành ba phần riêng. Tìm không dấu (`normalizeVi`) vì admin hay gõ "le duc
 * tho" thay vì "Lê Đức Thọ".
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Home, Lock, Search, X } from 'lucide-react';
import type { PropertyResponse } from '@/types/api.types';
import { normalizeVi } from '@/utils/helpers';
import { occupancyChip, type PropertyOccupancy } from '@/services/propertyOccupancy.service';
import { capacityTone } from './CapacityBar';

interface Props {
  properties: PropertyResponse[];
  /** Bỏ trống khi màn không quan tâm sức chứa (vd in tem QR) — lúc đó không vẽ chip. */
  occupancy?: Map<number, PropertyOccupancy>;
  /**
   * Badge cảnh báo tuỳ màn (vd "3 hỏng" ở trang Danh mục thiết bị) — bỏ trống thì
   * không vẽ gì thêm, không ảnh hưởng các màn khác đang dùng chung component này.
   */
  badges?: Map<number, { count: number; label: string }>;
  /** id nhà đang chọn, dạng chuỗi để khớp state của form. */
  value: string;
  onChange: (propertyId: string) => void;
}

interface Row {
  p: PropertyResponse;
  chip: string;
  badge?: { count: number; label: string };
  /** Nhà chưa mở phòng nào — hiện được nhưng KHÔNG chọn được, kèm lý do. */
  blocked: boolean;
  haystack: string;
}

export const PropertyPicker = ({ properties, occupancy, badges, value, onChange }: Props) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  /** Dòng đang được đánh dấu bằng bàn phím (↑ ↓ + Enter). */
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const rows: Row[] = useMemo(() => properties.map((p) => {
    const occ = occupancy?.get(p.id);
    return {
      p,
      chip: occupancyChip(occ),
      badge: badges?.get(p.id),
      blocked: !!occ?.loaded && capacityTone(occ) === 'setup',
      haystack: normalizeVi([p.propertyName, p.shortAddress, p.fullAddress, p.zoneName]
        .filter(Boolean).join(' ')),
    };
  }), [properties, occupancy, badges]);

  const filtered = useMemo(() => {
    const kw = normalizeVi(q.trim());
    if (!kw) return rows;
    // Tách từ khoá theo khoảng trắng và yêu cầu khớp TẤT CẢ: gõ "le duc tho nguyen can"
    // vẫn ra đúng căn, dù các từ nằm rải rác ở tên và địa chỉ.
    const parts = kw.split(/\s+/);
    return rows.filter((r) => parts.every((t) => r.haystack.includes(t)));
  }, [rows, q]);

  const selected = rows.find((r) => String(r.p.id) === value);

  // Mở ra thì con trỏ về đầu và focus thẳng ô tìm — mở xong phải gõ được ngay.
  useEffect(() => {
    if (!open) return;
    setCursor(0);
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // Bấm ra ngoài thì đóng. Dùng `mousedown` chứ không phải `click`: bấm vào một dòng
  // trong danh sách sẽ nhả chuột ở chỗ khác nếu danh sách vừa cuộn, `click` khi đó
  // không bắn ra và ô chọn kẹt mở.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = (r: Row) => {
    if (r.blocked) return;
    onChange(String(r.p.id));
    setOpen(false);
    setQ('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => {
        const next = e.key === 'ArrowDown' ? c + 1 : c - 1;
        return Math.max(0, Math.min(filtered.length - 1, next));
      });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault(); // đừng để Enter submit cả form khi đang chọn nhà
      const r = filtered[cursor];
      if (r) pick(r);
    }
  };

  return (
    <div ref={boxRef} className="relative">
      {/* Ô hiển thị lựa chọn hiện tại */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-2 rounded-xl border bg-white px-3.5 py-2.5 text-left text-sm transition ${
          open ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
        {selected ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-slate-800">{selected.p.propertyName}</span>
            <span className="block truncate text-xs text-slate-500">
              {selected.p.shortAddress || selected.p.fullAddress}
              {selected.chip && <> · {selected.chip}</>}
              {selected.badge && <span className="ml-1 font-semibold text-rose-600">· {selected.badge.label}</span>}
            </span>
          </span>
        ) : (
          <span className="flex-1 text-slate-400">Chọn nhà còn chỗ…</span>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          {/* Ô tìm */}
          <div className="relative border-b border-slate-100 p-2">
            <Search className="pointer-events-none absolute left-4.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => { setQ(e.target.value); setCursor(0); }}
              onKeyDown={onKeyDown}
              placeholder="Gõ tên nhà, đường, quận… (không cần dấu)"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-8 text-sm outline-none transition focus:border-indigo-400 focus:bg-white"
            />
            {q && (
              <button
                type="button"
                onClick={() => { setQ(''); searchRef.current?.focus(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 transition hover:bg-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Danh sách */}
          <div className="max-h-[280px] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">
                Không có nhà nào khớp “{q.trim()}”.
              </p>
            ) : filtered.map((r, i) => {
              const isSelected = String(r.p.id) === value;
              const isCursor = i === cursor;
              return (
                <button
                  key={r.p.id}
                  type="button"
                  disabled={r.blocked}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => pick(r)}
                  className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition ${
                    r.blocked ? 'cursor-not-allowed opacity-50' : isCursor ? 'bg-indigo-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <span className="mt-0.5 shrink-0">
                    {r.blocked
                      ? <Lock className="h-4 w-4 text-slate-400" />
                      : r.p.wholeHouse
                        ? <Home className="h-4 w-4 text-emerald-500" />
                        : <Building2 className="h-4 w-4 text-blue-500" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">
                      {r.p.propertyName}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {r.p.shortAddress || r.p.fullAddress}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className={`rounded-full px-1.5 py-0.5 font-bold ${
                        r.p.wholeHouse ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                      }`}>
                        {r.p.wholeHouse ? 'Nguyên căn' : 'Chia phòng'}
                      </span>
                      {r.chip && <span className="font-semibold text-slate-500">{r.chip}</span>}
                      {r.badge && (
                        <span className="rounded-full bg-rose-50 px-1.5 py-0.5 font-bold text-rose-600">
                          {r.badge.label}
                        </span>
                      )}
                      {r.blocked && (
                        <span className="font-semibold text-amber-600">— chưa mở phòng, chưa xếp khách được</span>
                      )}
                    </span>
                  </span>
                  {isSelected && <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />}
                </button>
              );
            })}
          </div>

          {/* Đếm kết quả — cho biết bộ lọc đang giấu bớt bao nhiêu. */}
          {rows.length > 0 && (
            <p className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-500">
              {q.trim() ? `${filtered.length}/${rows.length} nhà khớp` : `${rows.length} nhà còn chỗ`}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
