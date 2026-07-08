import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, RotateCcw, Search, SearchX, SlidersHorizontal } from 'lucide-react';
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
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3 pl-11 pr-24 text-sm outline-none transition-colors focus:border-primary-300 focus:bg-white"
              />
              <button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700">
                Tìm
              </button>
            </form>

            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className={`inline-flex items-center justify-center gap-2 rounded-xl border px-5 py-3 text-sm font-bold transition-colors ${
                expanded || activeCount > 0
                  ? 'border-primary-200 bg-primary-50 text-primary-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-primary-200 hover:text-primary-700'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Bộ lọc
              {activeCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1.5 text-[11px] font-extrabold text-white">
                  {activeCount}
                </span>
              )}
              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
          </div>

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

            <select value={filter.type} onChange={(e) => handleTypeChange(e.target.value)} className="input-field cursor-pointer font-semibold text-primary-700" aria-label="Loại hình">
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
                        ? 'border-primary-600 bg-primary-600 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-primary-200 hover:text-primary-600'
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
            <select value={filter.sort} onChange={(e) => setParam('sort', e.target.value)} className="rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-semibold text-slate-700 outline-none focus:border-primary-300 cursor-pointer" aria-label="Sắp xếp">
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

        {/* Empty state */}
        {!loading && data && data.items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-center">
            <SearchX className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-4 font-bold text-slate-700">Không tìm thấy bất động sản phù hợp</p>
            <p className="mt-1 text-sm text-slate-500">Hãy thử điều chỉnh hoặc xóa bớt bộ lọc.</p>
            {hasActiveFilter && (
              <button onClick={clearFilters} className="btn-primary mt-5">Xóa bộ lọc</button>
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
            {Array.from({ length: data.totalPages }).map((_, i) => {
              const page = i + 1;
              return (
                <button
                  key={page}
                  onClick={() => goToPage(page)}
                  className={`h-10 w-10 rounded-lg text-sm font-bold transition-colors ${
                    page === data.page ? 'bg-primary-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {page}
                </button>
              );
            })}
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
