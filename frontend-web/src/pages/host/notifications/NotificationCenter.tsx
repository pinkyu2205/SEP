import { useEffect, useState } from 'react';
import {
  Bell, CheckCheck, X, FileText, DollarSign, Wrench, Home, ClipboardCheck,
} from 'lucide-react';
import type { PortalNotification, NotificationType } from '@/types';
import { MOCK_NOTIFICATIONS } from '@/utils/mockData';
import { hostService, type HostNotificationDto } from '@/services/host.service';
import { useUnreadNotifications } from '@/contexts/UnreadNotificationsContext';

// Map type BE (UPPER) → type FE (lowercase). Loại lạ → 'approval_needed'.
const NOTI_TYPE_FROM_API: Record<string, NotificationType> = {
  APPROVAL_NEEDED: 'approval_needed',
  CONTRACT_EXPIRY: 'contract_expiry',
  MASTER_LEASE_EXPIRY: 'contract_expiry',
  UNPAID_INVOICE: 'unpaid_invoice',
  MAINTENANCE_DELAY: 'maintenance_delay',
  OCCUPANCY_ALERT: 'occupancy_alert',
  LOSS_ALERT: 'occupancy_alert',
};
const dtoToNotification = (d: HostNotificationDto): PortalNotification => ({
  id: d.id,
  type: NOTI_TYPE_FROM_API[d.type] ?? 'approval_needed',
  title: d.title,
  message: d.message,
  isRead: d.isRead,
  priority: (d.priority?.toLowerCase() as PortalNotification['priority']) ?? 'medium',
  createdAt: d.createdAt,
});

// ── Cấu hình loại thông báo ───────────────────────────────────────────────────
const typeConfig: Record<NotificationType, {
  label: string; icon: React.ElementType;
  bg: string; text: string; iconBg: string;
}> = {
  approval_needed:   { label: 'Chờ phê duyệt',  icon: ClipboardCheck, bg: 'bg-indigo-50',  text: 'text-indigo-700',  iconBg: 'bg-indigo-100' },
  contract_expiry:   { label: 'Hợp đồng hết hạn', icon: FileText,      bg: 'bg-amber-50',   text: 'text-amber-700',   iconBg: 'bg-amber-100' },
  unpaid_invoice:    { label: 'Hóa đơn chưa thu', icon: DollarSign,    bg: 'bg-rose-50',    text: 'text-rose-700',    iconBg: 'bg-rose-100' },
  maintenance_delay: { label: 'Bảo trì trễ hạn',  icon: Wrench,        bg: 'bg-orange-50',  text: 'text-orange-700',  iconBg: 'bg-orange-100' },
  occupancy_alert:   { label: 'Cảnh báo phòng trống', icon: Home,       bg: 'bg-blue-50',    text: 'text-blue-700',    iconBg: 'bg-blue-100' },
};

const priorityBadge: Record<string, string> = {
  high:   'bg-rose-100 text-rose-700',
  medium: 'bg-amber-100 text-amber-700',
  low:    'bg-slate-100 text-slate-600',
};

const priorityLabel: Record<string, string> = {
  high: 'Cao', medium: 'Trung bình', low: 'Thấp',
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ── Component ─────────────────────────────────────────────────────────────────
export const NotificationCenter = () => {
  const [notifications, setNotifications] = useState<PortalNotification[]>(MOCK_NOTIFICATIONS);
  const [filterType, setFilterType] = useState<'all' | NotificationType>('all');
  const [filterRead, setFilterRead] = useState<'all' | 'unread' | 'read'>('all');
  const { refresh: refreshUnreadBadge } = useUnreadNotifications();

  // Nạp thông báo thật từ BE; lỗi/offline → giữ mock.
  useEffect(() => {
    let active = true;
    hostService.listNotifications({ page: 0, size: 50 })
      .then(page => {
        const list = (page?.content ?? []).map(dtoToNotification);
        if (active && list.length > 0) setNotifications(list);
      })
      .catch(() => { /* offline: dùng mock */ });
    return () => { active = false; };
  }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const filtered = notifications.filter(n => {
    const matchType = filterType === 'all' || n.type === filterType;
    const matchRead =
      filterRead === 'all' ? true :
      filterRead === 'unread' ? !n.isRead :
      n.isRead;
    return matchType && matchRead;
  });

  const markRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    hostService.markNotificationRead(id)
      .then(refreshUnreadBadge)
      .catch(() => { /* offline */ });
  };

  const dismiss = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    hostService.markAllNotificationsRead()
      .then(refreshUnreadBadge)
      .catch(() => { /* offline */ });
  };

  return (
    <div className="space-y-6">
      {/* Tiêu đề */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bell className="w-6 h-6 text-slate-700" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 text-[10px] font-bold bg-rose-500 text-white rounded-full flex items-center justify-center leading-none px-1">
                {unreadCount}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Trung tâm Thông báo</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {unreadCount > 0
                ? <><span className="font-semibold text-rose-600">{unreadCount}</span> thông báo chưa đọc</>
                : 'Tất cả thông báo đã được đọc'}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            Đánh dấu tất cả đã đọc
          </button>
        )}
      </div>

      {/* Bộ lọc */}
      <div className="card p-4 flex flex-col sm:flex-row gap-4">
        {/* Lọc theo loại */}
        <div className="flex-1">
          <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Loại thông báo</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                filterType === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Tất cả ({notifications.length})
            </button>
            {(Object.keys(typeConfig) as NotificationType[]).map(type => {
              const cfg = typeConfig[type];
              const count = notifications.filter(n => n.type === type).length;
              if (count === 0) return null;
              return (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    filterType === type ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cfg.label} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Lọc theo trạng thái đọc */}
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Trạng thái</p>
          <div className="flex gap-2">
            {([
              { key: 'all', label: 'Tất cả' },
              { key: 'unread', label: 'Chưa đọc' },
              { key: 'read', label: 'Đã đọc' },
            ] as const).map(f => (
              <button
                key={f.key}
                onClick={() => setFilterRead(f.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  filterRead === f.key ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Danh sách thông báo */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="card py-16 text-center">
            <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">Không có thông báo nào phù hợp bộ lọc đã chọn.</p>
          </div>
        )}

        {filtered.map(notif => {
          const cfg = typeConfig[notif.type];
          const Icon = cfg.icon;
          return (
            <div
              key={notif.id}
              className={`rounded-xl border transition-all duration-200 ${
                notif.isRead
                  ? 'bg-white border-slate-100 shadow-sm'
                  : `${cfg.bg} border-l-4 border-l-current shadow-sm`
              }`}
            >
              <div className="p-4 flex items-start gap-4">
                {/* Icon */}
                <div className={`${cfg.iconBg} p-2.5 rounded-xl flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${cfg.text}`} />
                </div>

                {/* Nội dung */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className={`font-semibold ${notif.isRead ? 'text-slate-700' : 'text-slate-900'}`}>
                        {notif.title}
                      </p>
                      {!notif.isRead && (
                        <span className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                      )}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${priorityBadge[notif.priority]}`}>
                        {priorityLabel[notif.priority]}
                      </span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                    </div>

                    {/* Nút hành động */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!notif.isRead && (
                        <button
                          onClick={() => markRead(notif.id)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Đánh dấu đã đọc"
                        >
                          <CheckCheck className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => dismiss(notif.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Xóa thông báo"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <p className={`text-sm mt-1 ${notif.isRead ? 'text-slate-500' : 'text-slate-700'}`}>
                    {notif.message}
                  </p>

                  <p className="text-xs text-slate-400 mt-2">{formatTime(notif.createdAt)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
