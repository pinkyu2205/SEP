import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Search, Tag, Wallet } from 'lucide-react';
import { DISTRICTS, PRICE_RANGES, PROPERTY_TYPE_LABEL } from '@/utils/constants';
import { ROUTES } from '@/utils/routes';
import type { PropertyType } from '@/types/property';

interface SearchValues {
  district: string;
  maxPrice: string; // giữ dạng string để bind <select>
  type: PropertyType | '';
}

interface PropertySearchBarProps {
  /** Giá trị khởi tạo (vd khi đồng bộ với URL ở trang danh sách) */
  initial?: Partial<SearchValues>;
  /** Nếu truyền, gọi callback thay vì điều hướng (dùng trong trang danh sách) */
  onSearch?: (values: SearchValues) => void;
  className?: string;
}

/**
 * Ô tìm kiếm nhanh: Khu vực · Mức giá · Loại hình.
 * Mặc định điều hướng tới /properties kèm query params.
 */
export const PropertySearchBar = ({ initial, onSearch, className = '' }: PropertySearchBarProps) => {
  const navigate = useNavigate();
  const [values, setValues] = useState<SearchValues>({
    district: initial?.district ?? '',
    maxPrice: initial?.maxPrice ?? '',
    type: initial?.type ?? '',
  });

  const update = (patch: Partial<SearchValues>) => setValues((prev) => ({ ...prev, ...patch }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(values);
      return;
    }
    const params = new URLSearchParams();
    if (values.district) params.set('district', values.district);
    if (values.maxPrice) params.set('maxPrice', values.maxPrice);
    if (values.type) params.set('type', values.type);
    navigate(`${ROUTES.PROPERTIES}?${params.toString()}`);
  };

  const fieldWrap =
    'relative rounded-xl bg-slate-50/80 ring-1 ring-slate-100 transition-colors focus-within:bg-white focus-within:ring-green-200';
  const selectCls =
    'w-full appearance-none cursor-pointer rounded-xl bg-transparent py-3 pl-10 pr-3 text-sm font-medium text-slate-700 outline-none';

  return (
    <form
      onSubmit={handleSubmit}
      className={`grid grid-cols-1 gap-2.5 rounded-[1.4rem] border border-white/70 bg-white/95 p-2.5 shadow-2xl shadow-slate-900/20 backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] ${className}`}
    >
      {/* Khu vực */}
      <label className={fieldWrap}>
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-500" />
        <select value={values.district} onChange={(e) => update({ district: e.target.value })} className={selectCls} aria-label="Khu vực">
          <option value="">Tất cả khu vực</option>
          {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>

      {/* Mức giá */}
      <label className={fieldWrap}>
        <Wallet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-500" />
        <select value={values.maxPrice} onChange={(e) => update({ maxPrice: e.target.value })} className={selectCls} aria-label="Mức giá">
          <option value="">Mọi mức giá</option>
          {PRICE_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </label>

      {/* Loại hình */}
      <label className={fieldWrap}>
        <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-500" />
        <select value={values.type} onChange={(e) => update({ type: e.target.value as PropertyType | '' })} className={selectCls} aria-label="Loại hình thuê">
          <option value="">Mọi loại hình</option>
          {(Object.keys(PROPERTY_TYPE_LABEL) as PropertyType[]).map((t) => <option key={t} value={t}>{PROPERTY_TYPE_LABEL[t]}</option>)}
        </select>
      </label>

      <button
        type="submit"
        className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 px-7 py-3 text-sm font-bold text-white shadow-glow transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
      >
        <Search className="h-4 w-4" />
        Tìm kiếm
      </button>
    </form>
  );
};
