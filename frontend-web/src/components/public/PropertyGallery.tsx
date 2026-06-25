import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

interface PropertyGalleryProps {
  images: string[];
  title: string;
  /** Thời gian tự động chuyển ảnh (ms). Đặt 0 để tắt autoplay. Mặc định 4000ms. */
  autoPlayMs?: number;
}

/** Gallery ảnh cho trang chi tiết: ảnh lớn (mũi tên + tự chạy) + thumbnails */
export const PropertyGallery = ({ images, title, autoPlayMs = 4000 }: PropertyGalleryProps) => {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = images.length;

  const go = useCallback(
    (next: number) => setActive((_) => (next + count) % count),
    [count],
  );

  // Tự động chuyển ảnh sau mỗi autoPlayMs; tạm dừng khi rê chuột vào ảnh.
  // active nằm trong deps → mỗi lần đổi ảnh (kể cả bấm tay) timer reset lại từ đầu.
  useEffect(() => {
    if (count <= 1 || autoPlayMs <= 0 || paused) return;
    const t = setInterval(() => setActive((p) => (p + 1) % count), autoPlayMs);
    return () => clearInterval(t);
  }, [count, autoPlayMs, paused, active]);

  if (!images.length) {
    return <div className="aspect-[16/10] w-full rounded-2xl bg-slate-100" />;
  }

  return (
    <div className="space-y-3">
      <div
        className="group relative overflow-hidden rounded-2xl bg-slate-100"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <img
          src={images[active]}
          alt={`${title} - ảnh ${active + 1}`}
          className="aspect-[16/10] w-full object-cover transition-opacity duration-300"
        />

        {count > 1 && (
          <>
            {/* Mũi tên trái / phải */}
            <button
              type="button"
              aria-label="Ảnh trước"
              onClick={() => go(active - 1)}
              className="absolute left-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-slate-700 shadow-md backdrop-blur transition hover:bg-white hover:scale-105"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Ảnh tiếp theo"
              onClick={() => go(active + 1)}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-slate-700 shadow-md backdrop-blur transition hover:bg-white hover:scale-105"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            {/* Số thứ tự ảnh */}
            <div className="absolute bottom-3 right-3 rounded-full bg-black/50 px-2.5 py-1 text-xs font-semibold text-white">
              {active + 1}/{count}
            </div>

            {/* Chấm chỉ vị trí */}
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {images.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  aria-label={`Tới ảnh ${idx + 1}`}
                  onClick={() => setActive(idx)}
                  className={clsx(
                    'h-1.5 rounded-full transition-all',
                    idx === active ? 'w-5 bg-white' : 'w-1.5 bg-white/60 hover:bg-white/90',
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
          {images.map((src, idx) => (
            <button
              key={src}
              type="button"
              onClick={() => setActive(idx)}
              className={clsx(
                'overflow-hidden rounded-xl border-2 transition-all',
                idx === active ? 'border-primary-600 ring-2 ring-primary-100' : 'border-transparent opacity-80 hover:opacity-100',
              )}
            >
              <img src={src} alt={`thumbnail ${idx + 1}`} className="aspect-square w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
