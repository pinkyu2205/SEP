import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { goongService, type GoongLocation, type GoongPrediction } from '../services/goong.service';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Gọi khi người dùng chọn 1 gợi ý — kèm toạ độ nếu lấy được. */
  onSelect?: (sel: { address: string; location?: GoongLocation }) => void;
  placeholder?: string;
  required?: boolean;
  name?: string;
  disabled?: boolean;
}

/**
 * Ô nhập địa chỉ có gợi ý tự động từ Goong (Place AutoComplete).
 * - Debounce 300ms, huỷ request cũ khi gõ tiếp.
 * - Chọn 1 gợi ý → điền địa chỉ + lấy toạ độ qua Place Detail.
 * - Chưa cấu hình VITE_GOONG_API_KEY → hoạt động như input thường.
 */
export const AddressAutocomplete = ({
  value, onChange, onSelect, placeholder, required, name, disabled,
}: Props) => {
  const [preds, setPreds] = useState<GoongPrediction[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);

  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noKey = !goongService.hasApiKey();

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const query = (text: string) => {
    abortRef.current?.abort();
    if (noKey || text.trim().length < 2) {
      setPreds([]); setOpen(false); setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    goongService.autocomplete(text, ctrl.signal)
      .then((p) => { setPreds(p); setOpen(p.length > 0); setActive(-1); })
      .catch(() => { /* abort / network — bỏ qua */ })
      .finally(() => setLoading(false));
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    onChange(text);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => query(text), 300);
  };

  const choose = async (p: GoongPrediction) => {
    onChange(p.description);
    setOpen(false);
    setPreds([]);
    if (!onSelect) return;
    try {
      const detail = await goongService.placeDetail(p.place_id);
      onSelect({ address: p.description, location: detail?.location });
    } catch {
      onSelect({ address: p.description });
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (!open || preds.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(preds.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(preds[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          name={name}
          required={required}
          disabled={disabled}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKey}
          onFocus={() => { if (preds.length) setOpen(true); }}
          autoComplete="off"
          className="input-field pl-9 pr-9"
          placeholder={placeholder}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-indigo-400" />
        )}
      </div>

      {open && preds.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          {preds.map((p, i) => (
            <li
              key={p.place_id}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(p); }}
              className={`flex cursor-pointer items-start gap-2.5 px-3 py-2 text-sm ${
                i === active ? 'bg-indigo-50' : 'hover:bg-slate-50'
              }`}
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0">
                <span className="block font-semibold text-slate-800">
                  {p.structured_formatting?.main_text ?? p.description}
                </span>
                {p.structured_formatting?.secondary_text && (
                  <span className="block truncate text-xs text-slate-500">
                    {p.structured_formatting.secondary_text}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {noKey && (
        <p className="mt-1 text-xs text-amber-600">
          Chưa cấu hình <code>VITE_GOONG_API_KEY</code> — đang dùng nhập tay (không có gợi ý).
        </p>
      )}
    </div>
  );
};
