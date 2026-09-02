import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import clsx from 'clsx';
import { BrandMark } from '@/components/common/BrandLogo';

/**
 * Sidebar dùng chung cho cả Cổng Host và Admin Portal.
 *
 * Trước đây mỗi cổng tự dựng một sidebar riêng (layouts/Sidebar.tsx và phần
 * SidebarContent trong AdminLayout.tsx) nên lệch nhau về khoảng cách, bo góc,
 * cách đánh dấu mục đang mở và cách hiện badge. Gom về một component, khác nhau
 * chỉ ở màu nhấn (`accent`) và nội dung menu.
 *
 * Điểm thiết kế:
 *  - Nền slate-950 + vệt sáng gradient màu nhấn ở đầu, đồng bộ với hero của Admin.
 *  - Mục đang mở dùng "thanh ray" bên trái + nền màu nhấn nhạt thay vì tô đặc cả
 *    dòng — với menu 15+ mục thì tô đặc gây chói và khó dò mắt.
 *  - Thu gọn còn thanh icon 76px, trạng thái nhớ trong localStorage theo từng cổng.
 *  - Khi thu gọn, tên mục hiện bằng tooltip nổi bên phải (không dùng title="" để
 *    không phải chờ độ trễ mặc định của trình duyệt).
 */

/**
 * Màu nhấn hai cổng, lấy đúng hai nửa của logo (20/08/2026 — trước là indigo/cyan, không
 * liên quan gì tới nhận diện).
 *
 *   green → Cổng Host   · xanh chữ B, cổng vận hành hằng ngày
 *   red   → Admin Portal · đỏ chữ H, cổng quản trị
 */
export type SidebarAccent = 'green' | 'red';

export interface SidebarNavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  end?: boolean;
  /** Số hiển thị trong pill; 0/undefined = không hiện. */
  badge?: number;
  /** Badge cảnh báo (đỏ) thay vì badge màu nhấn. */
  badgeAlert?: boolean;
}

export interface SidebarSection {
  /**
   * Bỏ trống = nhóm KHÔNG có tiêu đề.
   *
   * Dành cho nhóm mở đầu chỉ chứa mục trang chủ: một tiêu đề "Tổng quan" đặt trên
   * đúng một dòng "Bảng điều hành" không phân loại thêm được gì, mà vẫn tốn nguyên
   * một khoảng cao bằng một mục menu.
   */
  label?: string;
  items: SidebarNavItem[];
}

export interface SidebarUser {
  name: string;
  subtitle?: string;
  initials: string;
}

const ACCENT: Record<SidebarAccent, {
  glow: string; eyebrow: string;
  rail: string; activeBg: string; activeText: string; iconChip: string;
  badge: string; hoverIcon: string; avatar: string;
}> = {
  green: {
    glow: 'from-brand-green-500/25',
    eyebrow: 'text-brand-green-200/80',
    rail: 'bg-brand-green-400',
    activeBg: 'bg-brand-green-500/15',
    activeText: 'text-white',
    iconChip: 'bg-brand-green-500 text-white shadow-md shadow-brand-green-950/40',
    badge: 'bg-brand-green-500 text-white',
    hoverIcon: 'group-hover:text-brand-green-300',
    avatar: 'from-brand-green-500 to-brand-green-700',
  },
  red: {
    glow: 'from-brand-red-500/25',
    eyebrow: 'text-brand-red-200/80',
    rail: 'bg-brand-red-400',
    activeBg: 'bg-brand-red-500/15',
    activeText: 'text-white',
    iconChip: 'bg-brand-red-500 text-white shadow-md shadow-brand-red-950/40',
    badge: 'bg-brand-red-500 text-white',
    hoverIcon: 'group-hover:text-brand-red-300',
    avatar: 'from-brand-red-500 to-brand-red-700',
  },
};

interface AppSidebarProps {
  accent: SidebarAccent;
  /** `icon` đã bỏ 20/08/2026 — chỗ đó nay là logo Hoàng Bình Land, không đổi theo cổng. */
  brand: { title: string; subtitle: string };
  sections: SidebarSection[];
  user?: SidebarUser;
  onLogout?: () => void;
  /** Đóng menu sau khi điều hướng — dùng cho drawer mobile. */
  onNavigate?: () => void;
  /** Drawer mobile luôn mở rộng, không cho thu gọn. */
  collapsible?: boolean;
  /** Khoá nhớ trạng thái thu gọn, tách riêng cho từng cổng. */
  storageKey?: string;
}

export const AppSidebar = ({
  accent, brand, sections, user, onLogout, onNavigate,
  collapsible = true, storageKey = 'hbl_sidebar_collapsed',
}: AppSidebarProps) => {
  const a = ACCENT[accent];
  const [collapsed, setCollapsed] = useState(() => {
    if (!collapsible) return false;
    try { return localStorage.getItem(storageKey) === '1'; } catch { return false; }
  });

  useEffect(() => {
    if (!collapsible) return;
    try { localStorage.setItem(storageKey, collapsed ? '1' : '0'); } catch { /* private mode */ }
  }, [collapsed, collapsible, storageKey]);


  return (
    <div
      className={clsx(
        'relative flex h-full flex-col overflow-hidden bg-slate-950 text-slate-300 transition-[width] duration-200 ease-out',
        collapsed ? 'w-[76px]' : 'w-64',
      )}
    >
      {/* Vệt sáng màu nhấn ở đỉnh */}
      <span aria-hidden className={clsx('pointer-events-none absolute -top-24 left-1/2 h-56 w-72 -translate-x-1/2 rounded-full bg-gradient-to-b to-transparent blur-3xl', a.glow)} />

      {/* Thương hiệu */}
      <div className={clsx('relative flex h-16 flex-shrink-0 items-center gap-3 border-b border-white/5', collapsed ? 'justify-center px-2' : 'px-5')}>
        {/*
          Logo thật thay cho ô màu + icon lucide chung chung (Building2 — cái ai cũng dùng).
          Nền TRẮNG chứ không phải nền màu nhấn: logo hai màu đỏ/xanh đặt trên nền chàm hay
          cyan sẽ chọi màu và tối lại; nền trắng vừa tách khỏi sidebar tối vừa giữ đúng màu
          nhận diện.
        */}
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white shadow-lg shadow-black/20">
          <BrandMark size={24} />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold leading-tight tracking-tight text-white">{brand.title}</p>
            <p className={clsx('truncate text-[10px] font-semibold leading-tight', a.eyebrow)}>{brand.subtitle}</p>
          </div>
        )}
      </div>

      {/* Menu */}
      <nav className="scrollbar-thin relative flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3">
        {sections.map((section, sIdx) => (
          <div key={section.label ?? `s${sIdx}`} className={sIdx > 0 ? 'mt-3' : ''}>
            {collapsed ? (
              sIdx > 0 && <div className="mx-2 mb-2 border-t border-white/5" />
            ) : section.label ? (
              <p className="mb-1 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">
                {section.label}
              </p>
            ) : null}

            <div className="space-y-0.5">
              {section.items.map(item => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) => clsx(
                      // py-2 (không phải py-2.5): với 15 mục thì mỗi 4px dư trên một
                      // dòng cộng lại thành đúng chỗ chênh giữa "thấy hết menu" và
                      // "phải cuộn" trên màn 1080p.
                      'group relative flex items-center rounded-xl text-sm font-medium transition-colors duration-150',
                      collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2',
                      isActive ? clsx(a.activeBg, a.activeText, 'font-semibold') : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        {/* Ray đánh dấu mục đang mở */}
                        {isActive && (
                          <span className={clsx('absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full', a.rail)} />
                        )}

                        <span className={clsx(
                          'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-colors',
                          isActive ? a.iconChip : clsx('text-slate-500', a.hoverIcon),
                        )}>
                          <Icon className="h-4 w-4" />
                        </span>

                        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}

                        {!!item.badge && (
                          <span className={clsx(
                            'flex flex-shrink-0 items-center justify-center rounded-full text-[10px] font-black tabular-nums',
                            collapsed
                              ? 'absolute right-2 top-1.5 h-4 min-w-4 px-1'
                              : 'h-5 min-w-5 px-1.5',
                            item.badgeAlert ? 'bg-amber-400 text-slate-900' : a.badge,
                          )}>
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}

                        {/* Tooltip khi thu gọn */}
                        {collapsed && (
                          <span className="pointer-events-none absolute left-full z-50 ml-3 hidden whitespace-nowrap rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white shadow-xl group-hover:block">
                            {item.label}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Chân: người dùng + thu gọn */}
      <div className="relative flex-shrink-0 border-t border-white/5 p-3">
        {user && (
          <div className={clsx(
            'flex items-center gap-2.5 rounded-xl border border-white/5 bg-white/5 p-2',
            collapsed && 'justify-center',
          )}>
            <div className={clsx(
              'relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-[11px] font-black text-white shadow-md',
              a.avatar,
            )}>
              {user.initials}
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950" title="Đang hoạt động" />
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold leading-tight text-white">{user.name}</p>
                  {user.subtitle && <p className="truncate text-[10px] leading-tight text-slate-400">{user.subtitle}</p>}
                </div>
                {onLogout && (
                  <button
                    onClick={onLogout}
                    title="Đăng xuất"
                    className="flex-shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-rose-500/15 hover:text-rose-400"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {collapsible && (
          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
            className={clsx(
              'mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200',
              collapsed && 'justify-center px-0',
            )}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4" /> Thu gọn menu</>}
          </button>
        )}
      </div>
    </div>
  );
};
