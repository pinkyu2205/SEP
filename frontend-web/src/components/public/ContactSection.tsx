import { useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarCheck, MapPin, Phone, Send } from 'lucide-react';
import { CONTACT } from '@/utils/constants';
import { telHref } from '@/utils/helpers';
import { submitContact } from '@/services/contact.service';

interface ContactSectionProps {
  /** Bối cảnh bất động sản (khi nhúng ở trang chi tiết) */
  propertyId?: string;
  propertyTitle?: string;
  /** compact = card gọn ở sidebar trang chi tiết; mặc định = block đầy đủ */
  compact?: boolean;
}

const initialForm = { fullName: '', phone: '', email: '', preferredDate: '', message: '' };

// ⚙️ Tạm ẩn form "Yêu cầu tư vấn / Đặt lịch xem nhà".
//    Khi cần dùng lại, đổi thành `true` (hoặc báo mình bật lên).
const SHOW_CONSULT_FORM = false;

export const ContactSection = ({ propertyId, propertyTitle, compact = false }: ContactSectionProps) => {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);

  const update = (key: keyof typeof initialForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const res = await submitContact({ ...form, propertyId, propertyTitle });
    setSubmitting(false);
    if (res.success) {
      toast.success(res.message);
      setForm(initialForm);
    } else {
      toast.error(res.message);
    }
  };

  const ContactButtons = (
    <a href={telHref(CONTACT.hotline)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-bold text-white hover:bg-green-700 transition-colors">
      <Phone className="h-4 w-4" /> Gọi ngay {CONTACT.hotline}
    </a>
  );

  const Form = (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          required
          value={form.fullName}
          onChange={(e) => update('fullName', e.target.value)}
          placeholder="Họ và tên *"
          className="input-field"
        />
        <input
          required
          value={form.phone}
          onChange={(e) => update('phone', e.target.value)}
          placeholder="Số điện thoại *"
          className="input-field"
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input
          type="email"
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
          placeholder="Email"
          className="input-field"
        />
        <input
          type="date"
          value={form.preferredDate}
          onChange={(e) => update('preferredDate', e.target.value)}
          className="input-field"
          aria-label="Ngày muốn xem nhà"
        />
      </div>
      <textarea
        value={form.message}
        onChange={(e) => update('message', e.target.value)}
        placeholder={propertyTitle ? `Tôi quan tâm đến "${propertyTitle}"...` : 'Nội dung cần tư vấn...'}
        rows={compact ? 2 : 3}
        className="input-field resize-none"
      />
      <button type="submit" disabled={submitting} className="btn-primary flex w-full items-center justify-center gap-2 py-2.5">
        {submitting ? 'Đang gửi...' : (<><Send className="h-4 w-4" /> Gửi yêu cầu</>)}
      </button>
    </form>
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
        {SHOW_CONSULT_FORM && (
          <div className="mt-5 border-t border-slate-100 pt-5">
            <p className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-900">
              <CalendarCheck className="h-4 w-4 text-green-600" /> Đặt lịch xem nhà
            </p>
            {Form}
          </div>
        )}
      </div>
    );
  }

  // Phiên bản đầy đủ cho trang Liên hệ
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className={`grid grid-cols-1 gap-10 ${SHOW_CONSULT_FORM ? 'lg:grid-cols-2' : 'max-w-2xl'}`}>
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

          {/* Form */}
          {SHOW_CONSULT_FORM && (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-6 sm:p-8">
              <h3 className="text-xl font-black text-slate-900">Gửi yêu cầu tư vấn</h3>
              <p className="mt-1.5 text-sm text-slate-500">Điền thông tin bên dưới, chúng tôi sẽ liên hệ lại.</p>
              <div className="mt-5">{Form}</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
