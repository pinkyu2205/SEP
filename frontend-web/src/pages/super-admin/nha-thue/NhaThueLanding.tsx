import { useNavigate } from 'react-router-dom';
import { BadgeDollarSign, ChevronRight, FilePlus, Settings2 } from 'lucide-react';

const modules = [
  {
    step: '01',
    path: '/admin/buildings/draft',
    icon: FilePlus,
    title: 'Khởi tạo tòa nhà',
    description: 'Khởi tạo tòa nhà mới, nhập thông tin cơ bản, hợp đồng đầu vào và khai báo thiết bị có sẵn.',
    color: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    btn: 'bg-indigo-600 hover:bg-indigo-700',
  },
  {
    step: '02',
    path: '/admin/buildings/configuration',
    icon: Settings2,
    title: 'Cấu hình khai thác',
    description: 'Chọn loại hình kinh doanh, lên kế hoạch cải tạo, cấu hình phòng và phân bổ thiết bị.',
    color: 'bg-amber-50 text-amber-600 border-amber-100',
    btn: 'bg-amber-500 hover:bg-amber-600',
  },
  {
    step: '03',
    path: '/admin/buildings/pricing-approval',
    icon: BadgeDollarSign,
    title: 'Định giá & Phê duyệt',
    description: 'Tính toán giá thuê theo khấu hao, nhập tỷ lệ dự phòng và gửi Host phê duyệt.',
    color: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    btn: 'bg-emerald-600 hover:bg-emerald-700',
  },
];

export const NhaThueLanding = () => {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-10">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Nhà thuê Admin</h1>
        <p className="mt-2 text-slate-500 font-medium">
          Quy trình onboarding tòa nhà được chia thành 3 module độc lập — thực hiện lần lượt từng bước.
        </p>
      </div>

      <div className="space-y-4">
        {modules.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.path}
              onClick={() => navigate(m.path)}
              className="group w-full rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm hover:border-slate-300 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-5">
                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border-2 ${m.color}`}>
                  <Icon className="h-6 w-6" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-black tracking-widest text-slate-400">BƯỚC {m.step}</span>
                  </div>
                  <p className="text-lg font-black text-slate-900">{m.title}</p>
                  <p className="mt-1 text-sm text-slate-500 leading-relaxed">{m.description}</p>
                </div>

                <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 group-hover:text-slate-500 transition" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
