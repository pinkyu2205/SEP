import { CameraIcon, FileSignature, ShieldCheck, Wrench } from 'lucide-react';
import { Reveal } from './Reveal';
import { COMPANY } from '@/utils/constants';

/**
 * VÌ SAO CHỌN — khối giá trị giữa danh sách nổi bật và dải hotline.
 *
 * Vì sao thêm: trang chủ trước đây đi thẳng từ khối đầu trang sang lưới bất động sản rồi
 * hết. Người đọc biết "có nhà cho thuê" nhưng không có câu nào trả lời "thuê ở đây khác gì
 * thuê chỗ khác" — mà đó mới là việc của trang chủ; xem nhà thì đã có trang danh sách.
 *
 * Bốn điểm dưới đây là NĂNG LỰC CÓ THẬT của hệ thống, không phải khẩu hiệu: hợp đồng điện
 * tử, hoá đơn điện nước kèm ảnh công tơ, báo hỏng có theo dõi, và quản lý vận hành theo khu
 * vực. Viết những thứ sản phẩm không làm được thì khách phát hiện ngay ở tháng đầu tiên.
 */

const REASONS = [
  {
    icon: FileSignature,
    title: 'Hợp đồng điện tử',
    body: 'Ký và lưu hợp đồng ngay trong ứng dụng. Mọi điều khoản, kỳ hạn và tiền cọc đều tra lại được bất cứ lúc nào.',
  },
  {
    icon: CameraIcon,
    title: 'Điện nước có bằng chứng',
    body: 'Mỗi hoá đơn điện nước đều kèm chỉ số đầu kỳ, cuối kỳ và ảnh mặt công tơ. Không có khoản nào phải tin suông.',
  },
  {
    icon: Wrench,
    title: 'Báo hỏng theo dõi được',
    body: 'Gửi yêu cầu sửa chữa kèm ảnh, xem tiến độ và bên nào chịu chi phí — thay vì gọi điện rồi chờ.',
  },
  {
    icon: ShieldCheck,
    title: 'Quản lý theo khu vực',
    body: 'Mỗi quận có một quản lý vận hành phụ trách. Bạn luôn biết cần liên hệ ai khi có việc.',
  },
] as const;

export const WhyUsSection = () => (
  <section className="bg-white">
    <div className="pub-container py-20">
      <Reveal className="max-w-2xl">
        <span className="pub-eyebrow">Vì sao chọn</span>
        <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
          Thuê nhà mà <span className="text-gradient">không phải phỏng đoán</span>
        </h2>
        <p className="mt-3 text-slate-500">
          {COMPANY.name} đưa toàn bộ giấy tờ, hoá đơn và yêu cầu sửa chữa lên một chỗ, để bạn
          luôn biết mình đang trả tiền cho cái gì.
        </p>
      </Reveal>

      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {REASONS.map(({ icon: Icon, title, body }, i) => (
          <Reveal key={title} delay={i * 80}>
            <div className="group h-full rounded-3xl border border-slate-100 bg-slate-50/60 p-6 transition-all duration-300 hover:-translate-y-1.5 hover:border-green-100 hover:bg-white hover:shadow-card">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-green-600/10 text-green-600 transition-colors group-hover:bg-green-600 group-hover:text-white">
                <Icon className="h-6 w-6" />
              </span>
              <h3 className="mt-5 font-bold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">{body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
);
