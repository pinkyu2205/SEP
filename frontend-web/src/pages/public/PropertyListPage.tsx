import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, RotateCcw, Search, SearchX, SlidersHorizontal, X } from 'lucide-react';
import { PropertyCard } from '@/components/public/PropertyCard';
import { getProperties } from '@/services/public-property.service';
import type { Paginated } from '@/types/common';
import type { Amenity, PropertyFilter, PropertySort, PropertyType, PublicProperty } from '@/types/property';
import {
  AMENITY_LABEL,
  DISTRICTS,
  PROPERTIES_PER_PAGE,
  PROPERTY_TYPE_LABEL,
  SORT_OPTIONS,
  getTypeFilterOptions,
} from '@/utils/constants';

const CardSkeleton = () => (
  <div className="animate-pulse overflow-hidden rounded-2xl border border-slate-100 bg-white">
    <div className="aspect-[4/3] bg-slate-200" />
    <div className="space-y-3 p-4">
      <div className="h-4 w-3/4 rounded bg-slate-200" />
      <div className="h-3 w-1/2 rounded bg-slate-200" />
      <div className="h-5 w-1/3 rounded bg-slate-200" />
    </div>
  </div>
);

export const PropertyListPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Bộ lọc khởi tạo từ URL (đến từ ô tìm kiếm ở trang chủ)
  const filter: PropertyFilter = useMemo(
    () => ({
      keyword: searchParams.get('keyword') ?? '',
      district: searchParams.get('district') ?? '',
      type: (searchParams.get('type') as PropertyType) ?? '',
      minPrice: searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : undefined,
      maxPrice: searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined,
      minArea: searchParams.get('minArea') ? Number(searchParams.get('minArea')) : undefined,
      bedrooms: searchParams.get('bedrooms') ? Number(searchParams.get('bedrooms')) : undefined,
      amenities: (searchParams.get('amenities')?.split(',').filter(Boolean) as Amenity[]) ?? [],
      sort: (searchParams.get('sort') as PropertySort) ?? 'newest',
      page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
      pageSize: PROPERTIES_PER_PAGE,
    }),
    [searchParams],
  );

  // Ô tìm kiếm từ khoá (debounce nhẹ qua submit form)
  const [keywordInput, setKeywordInput] = useState(filter.keyword ?? '');
  useEffect(() => { setKeywordInput(filter.keyword ?? ''); }, [filter.keyword]);

  const [data, setData] = useState<Paginated<PublicProperty> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getProperties(filter).then((res) => {
      setData(res);
      setLoading(false);
    });
  }, [filter]);

  // Cập nhật 1 tham số filter và reset về trang 1
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setSearchParams(next);
  };

  // Tuỳ chọn Giá / Diện tích / Phòng ngủ phụ thuộc loại hình đang chọn
  const typeOptions = getTypeFilterOptions((filter.type as PropertyType) || '');

  // Đổi loại hình -> reset các filter phụ thuộc để không giữ giá trị không hợp lệ
  const handleTypeChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('type', value);
    else next.delete('type');
    ['minPrice', 'maxPrice', 'minArea', 'bedrooms', 'page'].forEach((k) => next.delete(k));
    setSearchParams(next);
  };

  // Bật/tắt một tiện ích trong bộ lọc
  const toggleAmenity = (a: Amenity) => {
    const current = new Set(filter.amenities ?? []);
    if (current.has(a)) current.delete(a);
    else current.add(a);
    setParam('amenities', Array.from(current).join(','));
  };

  const submitKeyword = (e: React.FormEvent) => {
    e.preventDefault();
    setParam('keyword', keywordInput.trim());
  };

  const goToPage = (page: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(page));
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearFilters = () => setSearchParams(new URLSearchParams());

  const FILTER_KEYS = ['keyword', 'district', 'type', 'minPrice', 'maxPrice', 'minArea', 'bedrooms', 'amenities'];
  const hasActiveFilter = FILTER_KEYS.some((k) => searchParams.get(k));
  const activeAmenities = new Set(filter.amenities ?? []);

  // Số bộ lọc nâng cao đang áp dụng (không tính ô tìm từ khoá)
  const ADVANCED_KEYS = ['district', 'type', 'minPrice', 'maxPrice', 'minArea', 'bedrooms'];
  const activeCount = ADVANCED_KEYS.filter((k) => searchParams.get(k)).length + (filter.amenities?.length ?? 0);

  // Thu gọn mặc định; tự mở nếu vào trang đã sẵn có bộ lọc (vd từ ô tìm ở trang chủ)
  const [expanded, setExpanded] = useState(activeCount > 0);

  /**
   * DẢI BỘ LỌC ĐANG ÁP DỤNG — mỗi điều kiện một thẻ, bấm chữ ✕ là gỡ riêng nó.
   *
   * Trước đây bảng lọc thu gọn mặc định, nên vào trang từ ô tìm ở trang chủ là thấy một
   * danh sách đã bị lọc mà không có dấu hiệu nào nói đang lọc theo gì — chỉ có con số nhỏ
   * trên nút "Bộ lọc". Muốn biết phải mở bảng ra đọc từng ô; muốn bỏ một điều kiện thì
   * cũng phải mở bảng, tìm đúng ô, chọn lại "Tất cả".
   *
   * Nhãn lấy từ CHÍNH danh sách tuỳ chọn đang đổ vào các ô select, nên thẻ luôn đọc đúng
   * chữ người dùng đã chọn ("Dưới 5 triệu"), không phải con số thô trong URL.
   */
  const optionLabel = (list: { label: string; value: number }[], raw: string) =>
    list.find((o) => String(o.value) === raw)?.label;

  const activeChips: { key: string; label: string; onRemove: () => void }[] = [];
  const pushChip = (key: string, label?: string) => {
    const raw = searchParams.get(key);
    if (raw) activeChips.push({ key, label: label ?? raw, onRemove: () => setParam(key, '') });
  };

  if (filter.keyword) {
    activeChips.push({
      key: 'keyword',
      label: `“${filter.keyword}”`,
      onRemove: () => setParam('keyword', ''),
    });
  }
  pushChip('district');
  pushChip('type', filter.type ? PROPERTY_TYPE_LABEL[filter.type as PropertyType] : undefined);
  pushChip('bedrooms', optionLabel(typeOptions.bedroomOptions, searchParams.get('bedrooms') ?? ''));
  pushChip('minPrice', (() => {
    const l = optionLabel(typeOptions.priceRanges, searchParams.get('minPrice') ?? '');
    return l ? `Từ ${l.replace(/^(Dưới|Trên)\s+/, '')}` : undefined;
  })());
  pushChip('maxPrice', optionLabel(typeOptions.priceRanges, searchParams.get('maxPrice') ?? ''));
  pushChip('minArea', optionLabel(typeOptions.areaRanges, searchParams.get('minArea') ?? ''));
  for (const a of filter.amenities ?? []) {
    activeChips.push({ key: `am-${a}`, label: AMENITY_LABEL[a], onRemove: () => toggleAmenity(a) });
  }

  /**
   * Các số trang được vẽ ra: luôn có trang đầu, trang cuối, trang hiện tại và hai bên nó.
   * `null` = dấu ba chấm.
   *
   * Bản trước vẽ `Array.from({ length: totalPages })` — tức MỌI trang. Sáu bất động sản một
   * trang, nên chỉ cần vài trăm bản ghi là hàng nút số tràn ngang hết màn hình và đẩy vỡ
   * bố cục. Danh sách bất động sản thì chỉ có tăng lên.
   */
  const pageItems = (current: number, total: number): (number | null)[] => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const around = [current - 1, current, current + 1].filter((p) => p > 1 && p < total);
    const pages = [1, ...around, total];
    const out: (number | null)[] = [];
    let prev = 0;
    for (const p of pages) {
      if (p - prev > 1) out.push(null);
      out.push(p);
      prev = p;
    }
    return out;
  };

  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Page heading */}
      <div className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-mesh opacity-80" />
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]" />
        <div className="pub-container relative py-14">
          <span className="pub-chip">Danh sách</span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Nhà & phòng <span className="text-gradient-light">cho thuê</span>
          </h1>
          <p className="mt-3 max-w-xl text-slate-300">Khám phá danh sách bất động sản đang cho thuê tại Hoàng Bình Land.</p>
        </div>
      </div>

      <div className="pub-container py-8">
        {/* Filter panel - thu gọn / mở rộng */}
        <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-card sm:p-5">
          {/* Hàng luôn hiển thị: ô tìm + nút Bộ lọc */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <form onSubmit={submitKeyword} className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                placeholder="Tìm theo tên hoặc địa chỉ bất động sản..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3 pl-11 pr-24 text-sm outline-none transition-colors focus:border-green-300 focus:bg-white"
              />
              <button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700">
                Tìm
              </button>
            </form>

            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className={`inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-bold transition-colors ${
                expanded || activeCount > 0
                  ? 'border-green-200 bg-green-50 text-green-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-green-200 hover:text-green-700'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Bộ lọc
              {activeCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-green-600 px-1.5 text-[11px] font-extrabold text-white">
                  {activeCount}
                </span>
              )}
              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Bộ lọc đang áp dụng — hiện kể cả khi bảng nâng cao đang thu gọn. */}
          {activeChips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {activeChips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={c.onRemove}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 py-1.5 pl-3 pr-2 text-xs font-semibold text-green-700 transition-colors hover:border-green-300 hover:bg-green-100"
                >
                  {c.label}
                  <X className="h-3.5 w-3.5 text-green-500 transition-colors group-hover:text-green-700" />
                </button>
              ))}
              <button
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold text-slate-400 transition-colors hover:text-rose-500"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Xoá hết
              </button>
            </div>
          )}

          {/* Phần nâng cao - chỉ hiện khi mở rộng */}
          {expanded && (
          <div className="mt-4 border-t border-slate-100 pt-4 animate-fade-in">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Lọc nâng cao</span>
            {hasActiveFilter && (
              <button onClick={clearFilters} className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-500 hover:text-rose-600">
                <RotateCcw className="h-3.5 w-3.5" /> Xoá bộ lọc
              </button>
            )}
          </div>
          {/* Selects */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <select value={filter.district} onChange={(e) => setParam('district', e.target.value)} className="input-field cursor-pointer" aria-label="Quận/Huyện">
              <option value="">Tất cả quận/huyện</option>
              {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>

            <select value={filter.type} onChange={(e) => handleTypeChange(e.target.value)} className="input-field cursor-pointer font-semibold text-green-700" aria-label="Loại hình">
              <option value="">Mọi loại hình</option>
              {(Object.keys(PROPERTY_TYPE_LABEL) as PropertyType[]).map((t) => <option key={t} value={t}>{PROPERTY_TYPE_LABEL[t]}</option>)}
            </select>

            <select value={filter.bedrooms ?? ''} onChange={(e) => setParam('bedrooms', e.target.value)} className="input-field cursor-pointer" aria-label="Số phòng ngủ">
              <option value="">Số phòng ngủ</option>
              {typeOptions.bedroomOptions.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>

            <select value={filter.minPrice ?? ''} onChange={(e) => setParam('minPrice', e.target.value)} className="input-field cursor-pointer" aria-label="Giá tối thiểu">
              <option value="">Giá tối thiểu</option>
              {typeOptions.priceRanges.map((r) => <option key={r.value} value={r.value}>Từ {r.label.replace('Dưới ', '').replace('Trên ', '')}</option>)}
            </select>

            <select value={filter.maxPrice ?? ''} onChange={(e) => setParam('maxPrice', e.target.value)} className="input-field cursor-pointer" aria-label="Giá tối đa">
              <option value="">Giá tối đa</option>
              {typeOptions.priceRanges.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>

            <select value={filter.minArea ?? ''} onChange={(e) => setParam('minArea', e.target.value)} className="input-field cursor-pointer" aria-label="Diện tích">
              <option value="">Diện tích</option>
              {typeOptions.areaRanges.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>

          {/* Amenities */}
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-400">Tiện ích</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(AMENITY_LABEL) as Amenity[]).map((a) => {
                const active = activeAmenities.has(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleAmenity(a)}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all ${
                      active
                        ? 'border-green-600 bg-green-600 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-green-200 hover:text-green-600'
                    }`}
                  >
                    {AMENITY_LABEL[a]}
                  </button>
                );
              })}
            </div>
          </div>
          </div>
          )}
        </div>

        {/* Results count + sort */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {!loading && data ? (
            <p className="text-sm text-slate-500">
              Tìm thấy <span className="font-bold text-slate-900">{data.total}</span> bất động sản phù hợp.
            </p>
          ) : <span />}
          <label className="flex items-center gap-2 text-sm text-slate-500">
            Sắp xếp:
            <select value={filter.sort} onChange={(e) => setParam('sort', e.target.value)} className="rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-semibold text-slate-700 outline-none focus:border-green-300 cursor-pointer" aria-label="Sắp xếp">
              {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        </div>

        {/* Grid */}
        <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {loading
            ? Array.from({ length: PROPERTIES_PER_PAGE }).map((_, i) => <CardSkeleton key={i} />)
            : data?.items.map((p) => <PropertyCard key={p.id} property={p} />)}
        </div>

        {/*
          Empty state — HAI câu cho hai tình huống khác nhau.

          Trang này chỉ liệt kê nhà CÒN CHỖ, nên danh sách rỗng khi không có bộ lọc nào
          nghĩa là hiện chưa có chỗ trống, không phải "bộ lọc quá chặt". Mời người ta đi
          xoá bộ lọc mà họ chưa từng đặt là chỉ dẫn sai và làm họ tưởng trang hỏng.
        */}
        {!loading && data && data.items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-center">
            <SearchX className="mx-auto h-12 w-12 text-slate-300" />
            {hasActiveFilter ? (
              <>
                <p className="mt-4 font-bold text-slate-700">Không tìm thấy bất động sản phù hợp</p>
                <p className="mt-1 text-sm text-slate-500">Hãy thử điều chỉnh hoặc xóa bớt bộ lọc.</p>
                <button onClick={clearFilters} className="btn-primary mt-5">Xóa bộ lọc</button>
              </>
            ) : (
              <>
                <p className="mt-4 font-bold text-slate-700">Hiện chưa có chỗ trống</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                  Tất cả nhà và phòng đang có khách thuê. Gọi hotline để được báo ngay khi có chỗ trống.
                </p>
              </>
            )}
          </div>
        )}

        {/* Pagination */}
        {!loading && data && data.totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-2">
            <button
              onClick={() => goToPage(data.page - 1)}
              disabled={data.page <= 1}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Trang trước"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {pageItems(data.page, data.totalPages).map((page, i) =>
              page === null ? (
                <span key={`gap-${i}`} className="px-1 text-sm font-bold text-slate-300" aria-hidden>
                  …
                </span>
              ) : (
                <button
                  key={page}
                  onClick={() => goToPage(page)}
                  aria-current={page === data.page ? 'page' : undefined}
                  className={`h-10 w-10 rounded-lg text-sm font-bold transition-colors ${
                    page === data.page ? 'bg-green-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {page}
                </button>
              ),
            )}
            <button
              onClick={() => goToPage(data.page + 1)}
              disabled={data.page >= data.totalPages}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Trang sau"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PropertyListPage;
