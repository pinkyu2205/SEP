import { ContactSection } from '@/components/public/ContactSection';

export const ContactPage = () => {
  return (
    <>
      {/* Page heading */}
      <div className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-mesh opacity-80" />
        <div className="absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_center,black,transparent_80%)]" />
        <div className="pub-container relative py-16">
          <span className="pub-chip">Liên hệ</span>
          <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Liên hệ <span className="text-gradient-light">tư vấn</span>
          </h1>
          <p className="mt-3 max-w-2xl text-slate-300">
            Để lại thông tin hoặc liên hệ trực tiếp, đội ngũ Hoàng Bình Land sẽ hỗ trợ bạn nhanh nhất.
          </p>
        </div>
      </div>

      <ContactSection />
    </>
  );
};

export default ContactPage;
