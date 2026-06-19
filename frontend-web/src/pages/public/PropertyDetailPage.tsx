import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, BadgeCheck, Check, DoorOpen, Headphones, MapPin, Maximize,
  ShieldCheck, Tag,
} from 'lucide-react';
import { PropertyGallery } from '../../components/public/PropertyGallery';
import { ContactSection } from '../../components/public/ContactSection';
import { PropertyCard } from '../../components/public/PropertyCard';
import { getPropertyById, getRelatedProperties } from '../../services/propertyService';
import type { PublicProperty } from '../../types/property';
import { AMENITY_LABEL, PROPERTY_TYPE_LABEL } from '../../utils/constants';
import { formatArea, formatMonthlyPrice } from '../../utils/helpers';
import { ROUTES } from '../../utils/routes';

/** 1 ô thông tin nhanh (chỉ render khi có dữ liệu) */
const Fact = ({ icon: Icon, label, value }: { icon: typeof Maximize; label: string; value: string }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
    <Icon className="h-5 w-5 text-primary-600" />
    <p className="mt-2 text-xs text-slate-500">{label}</p>
    <p className="font-bold text-slate-900">{value}</p>
  </div>
);

const TRUST_POINTS = [
  { icon: ShieldCheck, text: 'Được Hoàng Bình Land trực tiếp quản lý & vận hành' },
  { icon: BadgeCheck, text: 'Thông tin bất động sản đã được xác minh' },
  { icon: Headphones, text: 'Hỗ trợ xem nhà & tư vấn 24/7' },
];

export const PropertyDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const [property, setProperty] = useState<PublicProperty | null>(null);
  const [related, setRelated] = useState<PublicProperty[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    window.scrollTo({ top: 0 });
    Promise.all([getPropertyById(id), getRelatedProperties(id)]).then(([prop, rel]) => {
      setProperty(prop);
      setRelated(rel);
      setLoading(false);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 aspect-[16/10] animate-pulse rounded-2xl bg-slate-200" />
          <div className="h-80 animate-pulse rounded-2xl bg-slate-200" />
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <p className="text-2xl font-black text-slate-900">Không tìm thấy bất động sản</p>
        <p className="mt-2 text-slate-500">Bất động sản có thể đã được thuê hoặc gỡ khỏi danh sách.</p>
        <Link to={ROUTES.PROPERTIES} className="btn-primary mt-6 inline-flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" /> Về danh sách
        </Link>
      </div>
    );
  }

  const hasDescription = property.description.trim().length > 0;
  const hasAmenities = property.amenities.length > 0;
  const roomLabel = property.type === 'WHOLE_HOUSE' ? 'Số phòng' : 'Số phòng trong dãy';

  return (
    <div className="bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <Link to={ROUTES.PROPERTIES} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-primary-600">
          <ArrowLeft className="h-4 w-4" /> Về danh sách nhà cho thuê
        </Link>

        <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* ─── Main ─────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">
            <PropertyGallery images={property.images} title={property.title} />

            {/* Header + key facts */}
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700">
                  {PROPERTY_TYPE_LABEL[property.type]}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Còn trống
                </span>
              </div>

              <h1 className="mt-3 text-2xl font-black text-slate-900 sm:text-3xl">{property.title}</h1>
              <p className="mt-2 flex items-start gap-2 text-slate-500">
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" /> {property.address}
              </p>
              {property.district && (
                <p className="mt-1 text-sm text-slate-400">Khu vực: {property.district}</p>
              )}

              {/* Giá — nổi bật trên mobile, sidebar lo phần desktop */}
              <p className="mt-4 text-3xl font-black text-primary-600 lg:hidden">{formatMonthlyPrice(property.price)}</p>

              {/* Key facts */}
              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
                {property.area > 0 && <Fact icon={Maximize} label="Diện tích" value={formatArea(property.area)} />}
                <Fact icon={Tag} label="Loại hình" value={PROPERTY_TYPE_LABEL[property.type]} />
                {property.bedrooms ? <Fact icon={DoorOpen} label={roomLabel} value={String(property.bedrooms)} /> : null}
              </div>
            </div>

            {/* Mô tả */}
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black text-slate-900">Mô tả chi tiết</h2>
              {hasDescription ? (
                <p className="mt-3 whitespace-pre-line leading-7 text-slate-600">{property.description}</p>
              ) : (
                <p className="mt-3 leading-7 text-slate-400">
                  Chưa có mô tả chi tiết cho bất động sản này. Vui lòng liên hệ hotline để được tư vấn
                  cụ thể về diện tích, nội thất và điều kiện thuê.
                </p>
              )}
            </div>

            {/* Tiện ích — chỉ hiện khi có */}
            {hasAmenities && (
              <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-black text-slate-900">Tiện ích</h2>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {property.amenities.map((a) => (
                    <div key={a} className="flex items-center gap-2.5 text-sm text-slate-700">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      {AMENITY_LABEL[a]}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cam kết thương hiệu */}
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black text-slate-900">Cam kết từ Hoàng Bình Land</h2>
              <div className="mt-4 space-y-3">
                {TRUST_POINTS.map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3 text-sm text-slate-700">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600 shrink-0">
                      <Icon className="h-4 w-4" />
                    </span>
                    {text}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ─── Sidebar — sticky giá + liên hệ ─────────────────────── */}
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">Giá thuê</p>
              <p className="mt-1 text-3xl font-black text-primary-600">{formatMonthlyPrice(property.price)}</p>

              <div className="mt-5 space-y-2.5 border-t border-slate-100 pt-5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Loại hình</span>
                  <span className="font-bold text-slate-900">{PROPERTY_TYPE_LABEL[property.type]}</span>
                </div>
                {property.area > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Diện tích</span>
                    <span className="font-bold text-slate-900">{formatArea(property.area)}</span>
                  </div>
                )}
                {property.bedrooms ? (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">{roomLabel}</span>
                    <span className="font-bold text-slate-900">{property.bedrooms}</span>
                  </div>
                ) : null}
                {property.district && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Khu vực</span>
                    <span className="font-bold text-slate-900">{property.district}</span>
                  </div>
                )}
              </div>
            </div>

            <ContactSection compact propertyId={property.id} propertyTitle={property.title} />
          </aside>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <div className="mt-14">
            <h2 className="text-2xl font-black text-slate-900">Bất động sản tương tự</h2>
            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((p) => <PropertyCard key={p.id} property={p} />)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PropertyDetailPage;
