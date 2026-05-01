import { Users, Home, TrendingUp, AlertCircle } from 'lucide-react';

const StatCard = ({ title, value, icon: Icon, trend, trendUp }: any) => (
  <div className="card p-6">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="text-2xl font-bold text-slate-900 mt-2">{value}</p>
      </div>
      <div className={`p-3 rounded-xl ${trendUp ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
        <Icon className="w-6 h-6" />
      </div>
    </div>
    <div className="mt-4 flex items-center text-sm">
      <span className={`font-medium ${trendUp ? 'text-emerald-600' : 'text-rose-600'}`}>
        {trend}
      </span>
      <span className="text-slate-500 ml-2">so với tháng trước</span>
    </div>
  </div>
);

export const Dashboard = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Tổng quan</h1>
        <button className="btn-primary">
          Tải báo cáo
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Tổng doanh thu" 
          value="125.000.000 ₫" 
          icon={TrendingUp} 
          trend="+12.5%" 
          trendUp={true} 
        />
        <StatCard 
          title="Tỉ lệ lấp đầy" 
          value="92%" 
          icon={Home} 
          trend="+2.1%" 
          trendUp={true} 
        />
        <StatCard 
          title="Tổng khách thuê" 
          value="148" 
          icon={Users} 
          trend="+4" 
          trendUp={true} 
        />
        <StatCard 
          title="Sự cố cần xử lý" 
          value="5" 
          icon={AlertCircle} 
          trend="-2" 
          trendUp={false} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card p-6 lg:col-span-2">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Dòng tiền (Biểu đồ)</h2>
          <div className="h-64 flex items-center justify-center bg-slate-50 border border-dashed border-slate-200 rounded-lg text-slate-400">
            [Chart Area Placeholder - Will integrate Recharts here]
          </div>
        </div>
        <div className="card p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Hành động nhanh</h2>
          <div className="space-y-3">
            <button className="w-full text-left px-4 py-3 bg-slate-50 hover:bg-primary-50 rounded-lg text-sm font-medium text-slate-700 hover:text-primary-700 transition-colors border border-slate-100 hover:border-primary-100">
              + Thêm khách thuê mới
            </button>
            <button className="w-full text-left px-4 py-3 bg-slate-50 hover:bg-primary-50 rounded-lg text-sm font-medium text-slate-700 hover:text-primary-700 transition-colors border border-slate-100 hover:border-primary-100">
              + Tạo hợp đồng
            </button>
            <button className="w-full text-left px-4 py-3 bg-slate-50 hover:bg-primary-50 rounded-lg text-sm font-medium text-slate-700 hover:text-primary-700 transition-colors border border-slate-100 hover:border-primary-100">
              + Ghi chỉ số điện nước
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
