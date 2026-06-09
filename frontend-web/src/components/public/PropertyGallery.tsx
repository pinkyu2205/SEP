import { useState } from 'react';
import clsx from 'clsx';

interface PropertyGalleryProps {
  images: string[];
  title: string;
}

/** Gallery ảnh cho trang chi tiết: ảnh lớn + thumbnails */
export const PropertyGallery = ({ images, title }: PropertyGalleryProps) => {
  const [active, setActive] = useState(0);

  if (!images.length) {
    return <div className="aspect-[16/10] w-full rounded-2xl bg-slate-100" />;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl bg-slate-100">
        <img
          src={images[active]}
          alt={`${title} - ảnh ${active + 1}`}
          className="aspect-[16/10] w-full object-cover"
        />
      </div>

      {images.length > 1 && (
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
