import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Building2, FileText, Settings, Users, PenTool, UserCog } from 'lucide-react';
import clsx from 'clsx';

const navItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Bất động sản', path: '/properties', icon: Building2 },
  { name: 'Khách thuê', path: '/tenants', icon: Users },
  { name: 'Nhân sự', path: '/managers', icon: UserCog },
  { name: 'Hợp đồng', path: '/contracts', icon: FileText },
  { name: 'Trang thiết bị', path: '/equipments', icon: PenTool },
  { name: 'Cài đặt', path: '/settings', icon: Settings },
];

export const Sidebar = () => {
  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen sticky top-0">
      <div className="h-16 flex items-center px-6 border-b border-slate-800">
        <span className="text-xl font-bold text-white flex items-center gap-2">
          <span>🏠</span> RoomRent
        </span>
      </div>
      
      <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => clsx(
              "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-200",
              isActive 
                ? "bg-primary-600 text-white font-medium shadow-sm" 
                : "hover:bg-slate-800 hover:text-white"
            )}
          >
            <item.icon className="w-5 h-5" />
            {item.name}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-bold">
            AD
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">Admin System</p>
            <p className="text-xs text-slate-400 truncate">admin@roomrent.com</p>
          </div>
        </div>
      </div>
    </aside>
  );
};
