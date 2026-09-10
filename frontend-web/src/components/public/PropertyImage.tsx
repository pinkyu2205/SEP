import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';

/**
 * ẢNH BẤT ĐỘNG SẢN CÓ ĐƯỜNG LÙI.
 *
 * Vì sao cần: thẻ bất động sản trước đây render thẳng `<img src={property.images[0]}>`.
 * Nhà chưa có ảnh thì `images[0]` là `undefined` — React bỏ luôn thuộc tính `src` và trình
 * duyệt vẽ biểu tượng ảnh hỏng; URL chết cũng ra đúng cảnh đó. Tệ hơn là chữ `alt` khi đó
 * trải dài tràn ra ngoài khung ("MTX #125 THEO_PHONG không NT"), đè lên nhãn giá và nhãn
 * loại hình. Cả lưới danh sách trông như trang lỗi.
 *
 * Thay bằng một ô giữ chỗ mang màu thương hiệu: nhà chưa có ảnh là chuyện bình thường của
 * dữ liệu, không phải sự cố, nên nó phải trông như một trạng thái được thiết kế.
 *
 * `key` đổi theo `src` (xem `useEffect`): danh sách dùng lại component khi đổi trang, không
 * reset thì một ảnh hỏng ở trang 1 làm ô đó "hỏng vĩnh viễn" ở mọi trang sau.
 */

interface PropertyImageProps {
  src?: string;
  alt: string;
  className?: string;
}

export const PropertyImage = ({ src, alt, className = '' }: PropertyImageProps) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => { setFailed(false); }, [src]);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 via-emerald-50 to-slate-100 ${className}`}
        role="img"
        aria-label={alt}
      >
        <Building2 className="h-8 w-8 text-emerald-600/40" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Chưa có ảnh
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
};
