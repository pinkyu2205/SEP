import { useNavigate } from 'react-router-dom';
import { BadgeDollarSign, ChevronRight, FilePlus, FileSpreadsheet, Settings2, Sparkles } from 'lucide-react';

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
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Nhà thuê Admin</h1>
        <p className="mt-2 text-slate-500 font-medium">
          Tiếp nhận nhà nhanh nhất bằng <b className="text-slate-700">Nhập nhà hàng loạt</b>, hoặc khởi tạo thủ công theo từng bước.
        </p>
      </div>

      {/* ── Phương án nhanh: Import hàng loạt ───────────────────────────────── */}
      <button
        onClick={() => navigate('/admin/buildings/import')}
        className="group mb-8 w-full overflow-hidden rounded-2xl border border-cyan-300 bg-gradient-to-br from-cyan-600 to-indigo-600 p-6 text-left shadow-lg shadow-cyan-500/20 transition-all hover:shadow-xl"
      >
        <div className="flex items-center gap-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-white backdrop-blur">
            <FileSpreadsheet className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5">
              <Sparkles className="h-3 w-3 text-white" />
              <span className="text-[10px] font-black uppercase tracking-widest text-white">Khuyên dùng</span>
            </div>
            <p className="text-lg font-black text-white">Nhập nhà hàng loạt từ Excel</p>
            <p className="mt-1 text-sm leading-relaxed text-cyan-50">
              Tải 1 file theo mẫu để tạo nhiều căn nhà cùng lúc — kèm hợp đồng, cải tạo và thiết bị. Không cần nhập tay từng bước.
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-white/70 transition group-hover:translate-x-0.5 group-hover:text-white" />
        </div>
      </button>

      <div className="mb-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-black uppercase tracking-widest text-slate-400">Hoặc khởi tạo thủ công</span>
        <div className="h-px flex-1 bg-slate-200" />
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
