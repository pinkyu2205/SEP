import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, BedDouble, Bath, Check, Maximize, MapPin, Tag,
} from 'lucide-react';
import { PropertyGallery } from '../../components/public/PropertyGallery';
import { ContactSection } from '../../components/public/ContactSection';
import { PropertyCard } from '../../components/public/PropertyCard';
import { getPropertyById, getRelatedProperties } from '../../services/propertyService';
import type { PublicProperty } from '../../types/property';
import { AMENITY_LABEL, PROPERTY_TYPE_LABEL } from '../../utils/constants';
import { formatArea, formatMonthlyPrice } from '../../utils/helpers';
import { ROUTES } from '../../utils/routes';

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

  return (
    <div className="bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <Link to={ROUTES.PROPERTIES} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-primary-600">
          <ArrowLeft className="h-4 w-4" /> Về danh sách nhà cho thuê
        </Link>

        <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Main */}
          <div className="lg:col-span-2 space-y-6">
            <PropertyGallery images={property.images} title={property.title} />

            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-primary-700">
                  {PROPERTY_TYPE_LABEL[property.type]}
                </span>
              </div>

              <h1 className="mt-3 text-2xl font-black text-slate-900 sm:text-3xl">{property.title}</h1>
              <p className="mt-2 flex items-center gap-2 text-slate-500">
                <MapPin className="h-4 w-4 flex-shrink-0" /> {property.address}
              </p>

              <p className="mt-4 text-3xl font-black text-primary-600">{formatMonthlyPrice(property.price)}</p>

              {/* Key facts */}
              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-xl bg-slate-50 p-4">
                  <Maximize className="h-5 w-5 text-primary-600" />
                  <p className="mt-2 text-xs text-slate-500">Diện tích</p>
                  <p className="font-bold text-slate-900">{formatArea(property.area)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <Tag className="h-5 w-5 text-primary-600" />
                  <p className="mt-2 text-xs text-slate-500">Loại hình</p>
                  <p className="font-bold text-slate-900">{PROPERTY_TYPE_LABEL[property.type]}</p>
                </div>
                {property.bedrooms ? (
                  <div className="rounded-xl bg-slate-50 p-4">
                    <BedDouble className="h-5 w-5 text-primary-600" />
                    <p className="mt-2 text-xs text-slate-500">Phòng ngủ</p>
                    <p className="font-bold text-slate-900">{property.bedrooms}</p>
                  </div>
                ) : null}
                {property.bathrooms ? (
                  <div className="rounded-xl bg-slate-50 p-4">
                    <Bath className="h-5 w-5 text-primary-600" />
                    <p className="mt-2 text-xs text-slate-500">Nhà vệ sinh</p>
                    <p className="font-bold text-slate-900">{property.bathrooms}</p>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Description */}
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-black text-slate-900">Mô tả chi tiết</h2>
              <p className="mt-3 whitespace-pre-line leading-7 text-slate-600">{property.description}</p>
            </div>

            {/* Amenities */}
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
          </div>

          {/* Sidebar - sticky contact */}
          <aside className="lg:sticky lg:top-20 lg:self-start">
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
