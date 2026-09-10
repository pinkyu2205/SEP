import { Link } from 'react-router-dom';
import { ArrowUpRight, BedDouble, Maximize, MapPin } from 'lucide-react';
import type { PublicProperty } from '@/types/property';
import { PROPERTY_TYPE_LABEL, PROPERTY_STATUS_META } from '@/utils/constants';
import { formatArea, formatMonthlyPrice } from '@/utils/helpers';
import { propertyDetailPath } from '@/utils/routes';
import { PropertyImage } from './PropertyImage';

interface PropertyCardProps {
  property: PublicProperty;
}

export const PropertyCard = ({ property }: PropertyCardProps) => {
  return (
    <Link
      to={propertyDetailPath(property.id)}
      className="group relative flex flex-col overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-slate-100 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-card-hover hover:ring-green-100"
    >
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden">
        <PropertyImage
          src={property.images[0]}
          alt={property.title}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/55 via-transparent to-transparent" />

        {/* badges */}
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-green-700 shadow-sm backdrop-blur">
          {PROPERTY_TYPE_LABEL[property.type]}
        </span>

        {/*
          Góc phải: CÒN MẤY CHỖ, thay cho nhãn "Đã thuê" trước đây.

          Trang công khai từ 10/09/2026 chỉ liệt kê nhà còn chỗ, nên nhãn "Đã thuê" ở đây
          gần như không bao giờ đúng nữa — và khi nó xuất hiện thì cũng chỉ nói được điều
          người đọc không cần. Thứ họ cần là còn mấy phòng: "còn 1/4" và "còn 4/4" dẫn tới
          hai quyết định khác hẳn nhau.

          Không có số phòng (nhà nguyên căn, hoặc không tra được danh sách phòng) thì hiện
          nhãn trung tính, đừng bịa ra con số.
        */}
        {property.status === 'RENTED' ? (
          <span className={`absolute right-3 top-3 rounded-full px-3 py-1 text-xs font-bold shadow-sm backdrop-blur ${PROPERTY_STATUS_META.RENTED.className}`}>
            {PROPERTY_STATUS_META.RENTED.label}
          </span>
        ) : (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/95 px-3 py-1 text-xs font-bold text-white shadow-sm backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            {property.availableRooms != null && (property.totalRooms ?? 0) > 1
              ? `Còn ${property.availableRooms}/${property.totalRooms} phòng`
              : 'Còn trống'}
          </span>
        )}

        {/* price on image */}
        <div className="absolute bottom-3 left-3">
          <p className="text-lg font-extrabold text-white drop-shadow">{formatMonthlyPrice(property.price)}</p>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-2 font-bold text-slate-900 transition-colors group-hover:text-green-600">
          {property.title}
        </h3>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500 line-clamp-1">
          <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
          {property.address}
        </p>

        {/* facts */}
        <div className="mt-4 flex items-center gap-4 border-t border-slate-100 pt-4 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <Maximize className="h-4 w-4 text-green-500" />
            {formatArea(property.area)}
          </span>
          {property.bedrooms ? (
            <span className="inline-flex items-center gap-1.5">
              <BedDouble className="h-4 w-4 text-green-500" />
              {property.bedrooms} PN
            </span>
          ) : null}
          <span className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-50 text-slate-400 transition-all duration-300 group-hover:bg-green-600 group-hover:text-white">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
};
