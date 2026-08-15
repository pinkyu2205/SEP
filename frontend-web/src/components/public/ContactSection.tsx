import { MapPin, Phone } from 'lucide-react';
import { CONTACT } from '@/utils/constants';
import { telHref } from '@/utils/helpers';

/**
 * Khối liên hệ ở trang public — chỉ còn hotline và địa chỉ.
 *
 * Form "Yêu cầu tư vấn / Đặt lịch xem nhà" đã bị gỡ (15/08/2026). Nó vốn đã bị ẩn sau
 * cờ `SHOW_CONSULT_FORM = false`, và `services/contact.service.ts` đứng sau nó không
 * gọi API nào cả: chờ 600ms rồi trả `success: true` kèm "Hoàng Bình Land sẽ liên hệ lại
 * trong thời gian sớm nhất" — khách gửi xong yên tâm chờ một cuộc gọi không bao giờ đến.
 * Backend cũng chưa có endpoint nhận liên hệ (PublicPropertyController chỉ có phần
 * xem nhà). Làm lại khi BE mở POST /api/v1/public/contact.
 */
interface ContactSectionProps {
  /** compact = card gọn ở sidebar trang chi tiết; mặc định = block đầy đủ */
  compact?: boolean;
}

export const ContactSection = ({ compact = false }: ContactSectionProps) => {
  const ContactButtons = (
    <a href={telHref(CONTACT.hotline)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-bold text-white hover:bg-green-700 transition-colors">
      <Phone className="h-4 w-4" /> Gọi ngay {CONTACT.hotline}
    </a>
  );


  // Phiên bản gọn cho sidebar trang chi tiết
  if (compact) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-black text-slate-900">Liên hệ tư vấn</h3>
        <div className="mt-4 space-y-2 text-sm">
          <a href={telHref(CONTACT.hotline)} className="flex items-center gap-2.5 text-slate-600 hover:text-green-600">
            <Phone className="h-4 w-4 text-green-500" /> Hotline: <span className="font-bold">{CONTACT.hotline}</span>
          </a>
        </div>
        <div className="mt-4">{ContactButtons}</div>
      </div>
    );
  }

  // Phiên bản đầy đủ cho trang Liên hệ
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid max-w-2xl grid-cols-1 gap-10">
          {/* Info */}
          <div>
            <h2 className="text-3xl font-black text-slate-900">Liên hệ với chúng tôi</h2>
            <p className="mt-3 text-slate-500">
              Để lại thông tin hoặc liên hệ trực tiếp, Hoàng Bình Land sẽ hỗ trợ bạn nhanh nhất.
            </p>

            <div className="mt-8 space-y-4">
              <div className="flex items-start gap-4 rounded-2xl border border-slate-100 p-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-50 text-green-600"><Phone className="h-5 w-5" /></span>
                <div>
                  <p className="text-sm text-slate-500">Hotline</p>
                  <a href={telHref(CONTACT.hotline)} className="font-bold text-slate-900">{CONTACT.hotline}</a>
                </div>
              </div>
              <div className="flex items-start gap-4 rounded-2xl border border-slate-100 p-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-50 text-green-600"><MapPin className="h-5 w-5" /></span>
                <div>
                  <p className="text-sm text-slate-500">Địa chỉ</p>
                  <p className="font-bold text-slate-900">{CONTACT.address}</p>
                </div>
              </div>
            </div>

            <div className="mt-6">{ContactButtons}</div>
          </div>

        </div>
      </div>
    </section>
  );
};
