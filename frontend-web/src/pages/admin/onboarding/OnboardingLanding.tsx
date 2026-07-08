import { useNavigate } from 'react-router-dom';
import { ChevronRight, FilePlus, Settings2 } from 'lucide-react';

const modules = [
  {
    step: '01',
    path: '/admin/buildings/draft',
    icon: FilePlus,
    title: 'Khởi tạo nhà',
    description: 'Nhập hàng loạt toà nhà từ Excel (hợp đồng thuê + thiết bị bàn giao + ảnh), hoặc khởi tạo thủ công từng căn.',
    color: 'bg-indigo-50 text-indigo-600 border-indigo-100',
  },
  {
    step: '02',
    path: '/admin/buildings/configuration',
    icon: Settings2,
    title: 'Cấu hình khai thác',
    description: 'Nhập hợp đồng cải tạo từ Excel (tự động gửi Host duyệt), hoặc cấu hình cải tạo / phòng cho từng tòa nhà.',
    color: 'bg-amber-50 text-amber-600 border-amber-100',
  },
];

export const NhaThueLanding = () => {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Nhà thuê Admin</h1>
        <p className="mt-2 text-slate-500 font-medium">
          Quy trình tiếp nhận nhà gồm <b className="text-slate-700">2 bước</b>: khởi tạo nhà rồi cấu hình khai thác.
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
