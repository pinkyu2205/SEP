import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { PropertyResponse } from '@/types/api.types';
import { normalizeVi } from '@/utils/helpers';
import { showCode } from './billChecks';

type KindFilter = 'all' | 'whole' | 'rooms';

const KIND_TABS: { key: KindFilter; label: string }[] = [
  { key: 'all',   label: 'Tất cả' },
  { key: 'whole', label: 'Nguyên căn' },
  { key: 'rooms', label: 'Theo phòng' },
];

/**
 * Ô chọn nhà có tìm kiếm + lọc theo loại.
 *
 * Thay cho `<select>` thường: hàng trăm nhà, tên lại na ná nhau ("MTX#05 NGUYEN_CAN NONE")
 * nên cuộn tay là không tìm nổi. Gõ được tên / địa chỉ / khu vực / MÃ KHÁCH HÀNG (không dấu
 * cũng ra) — admin cầm tờ giấy trên tay thì gõ thẳng mã in trên đó là ra đúng nhà. Nhà nào
 * kỳ này đã phát hành thì gắn nhãn ngay trong danh sách, đỡ phải chọn rồi mới biết là trùng.
 */
export const PropertyCombobox = ({
  properties, value, onChange, publishedIds, codeOf, accentChip, disabled,
}: {
  properties: PropertyResponse[];
  value: number | null;
  onChange: (id: number | null) => void;
  /** Nhà đã có hoá đơn kỳ đang xem — chỉ để gắn nhãn, vẫn chọn được để xem lại. */
  publishedIds: Set<number>;
  /** Mã khách hàng của loại hoá đơn đang làm — hiện cạnh tên và tìm được theo nó. */
  codeOf?: (p: PropertyResponse) => string | undefined;
  /** Lớp màu cho chip lọc đang bật. */
  accentChip?: string;
  disabled?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const boxRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Bấm ra ngoài / Esc thì đóng — panel che mất phần bên dưới nếu cứ mở mãi.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => { if (open) searchRef.current?.focus(); }, [open]);

  const selected = properties.find((p) => p.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = normalizeVi(query.trim());
    const qCode = query.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
    return properties.filter((p) => {
      if (kind === 'whole' && p.wholeHouse !== true) return false;
      if (kind === 'rooms' && p.wholeHouse === true) return false;
      if (!q) return true;
      const code = (codeOf?.(p) ?? '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
      if (qCode.length >= 4 && code.includes(qCode)) return true;
      return normalizeVi(
        `${p.propertyName} ${p.shortAddress ?? ''} ${p.fullAddress ?? ''} ${p.zoneName ?? ''}`,
      ).includes(q);
    });
  }, [properties, query, kind, codeOf]);

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-3.5 py-3 text-left text-sm transition disabled:cursor-not-allowed disabled:bg-slate-50 ${
          open ? 'border-slate-400 ring-2 ring-slate-100' : 'border-slate-200 hover:border-slate-300'
        }`}
      >
        {selected ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate font-bold text-slate-900">{selected.propertyName}</span>
            <span className="block truncate text-xs text-slate-500">
              {selected.wholeHouse ? 'Nguyên căn' : `${selected.totalRooms ?? 0} phòng`}
              {selected.shortAddress ? ` · ${selected.shortAddress}` : ''}
            </span>
          </span>
        ) : (
          <span className="text-slate-400">Chọn nhà cần phát hành…</span>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 p-2">
            <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-2">
              <Search className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                ref={searchRef}
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                placeholder="Tên nhà, địa chỉ, khu vực hoặc mã khách hàng…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="shrink-0 text-xs font-semibold text-slate-400 hover:text-slate-600"
                >
                  Xoá
                </button>
              )}
            </div>

            <div className="mt-2 flex items-center gap-1">
              {KIND_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setKind(t.key)}
                  className={`rounded-full px-2.5 py-1 text-xs font-bold transition ${
                    kind === t.key
                      ? accentChip ?? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <span className="ml-auto text-xs text-slate-400">{filtered.length} nhà</span>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">
                Không có nhà nào khớp “{query}”.
              </p>
            ) : (
              filtered.map((p) => {
                const isSel = p.id === value;
                const published = publishedIds.has(p.id);
                const code = showCode(codeOf?.(p));
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { onChange(p.id); setOpen(false); }}
                    className={`flex w-full items-center gap-2 border-b border-slate-50 px-3 py-2.5 text-left transition last:border-b-0 ${
                      isSel ? 'bg-slate-100' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-slate-800">{p.propertyName}</span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            p.wholeHouse ? 'bg-cyan-100 text-cyan-700' : 'bg-violet-100 text-violet-700'
                          }`}
                        >
                          {p.wholeHouse ? 'Nguyên căn' : `${p.totalRooms ?? 0} phòng`}
                        </span>
                        {published && (
                          <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            Đã phát hành
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                        {code
                          ? <span className="shrink-0 font-mono font-semibold text-slate-600">{code}</span>
                          : codeOf && <span className="shrink-0 font-semibold text-amber-600">Chưa khai mã</span>}
                        <span className="truncate">{[p.shortAddress, p.zoneName].filter(Boolean).join(' · ')}</span>
                      </span>
                    </span>
                    {isSel && <Check className="h-4 w-4 shrink-0 text-slate-700" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
