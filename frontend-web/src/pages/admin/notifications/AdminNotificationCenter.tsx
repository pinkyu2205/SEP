import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, ClipboardList, RefreshCw } from 'lucide-react';
import {
  notificationService,
  type AppNotificationDto,
} from '@/services/notification.service';
import { hostService, type HostNotificationDto } from '@/services/host.service';
import { useUnreadNotifications } from '@/contexts/UnreadNotificationsContext';

/**
 * Trung tâm thông báo của Admin — gộp HAI nguồn để khớp với badge chuông.
 *
 *   • `notifications`      (`GET /api/v1/notifications`) — SỰ KIỆN đã xảy ra: khách
 *     thanh toán, hoá đơn phát hành, cần chụp công tơ… Bất biến, có realtime SSE.
 *   • `host_notifications` (`GET /api/v1/host/notifications`) — VIỆC ĐANG CHỜ: căn chờ
 *     duyệt giá, HĐ chờ duyệt, master lease sắp hết hạn. BE dựng lười từ trạng thái
 *     hiện tại mỗi lần gọi API, không phải ghi lúc sự việc xảy ra.
 *
 * Hai nguồn khác bản chất nên KHÔNG trộn lẫn vào một danh sách phẳng — chia hai khối
 * có nhãn riêng. Trộn theo thời gian sẽ vô nghĩa: `createdAt` của nguồn host là lúc ai
 * đó mở danh sách lần đầu, không phải lúc việc phát sinh.
 *
 * ⚠️ Nguồn host hiện KHÔNG được dọn khi việc đã xong (BE chưa có delete/resolve) — đo
 * ngày 13/08/2026: 50 thông báo "căn chờ duyệt giá" trong khi chỉ còn 45 căn thật sự
 * chờ. Vì vậy khối đó có ghi chú nhắc người đọc đối chiếu màn quản lý, đừng tin số.
 */

const PAGE_SIZE = 50;

const formatTime = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
};

/** Nhãn tiếng Việt cho `type` BE gửi. Type lạ thì hiện nguyên mã, đừng nuốt mất. */
const TYPE_LABEL: Record<string, string> = {
  PAYMENT_RECEIVED_MANAGER: 'Khách đã thanh toán',
  DEPOSIT_PAID_MANAGER: 'Đã thu tiền onboard',
  DEPOSIT_PAID_TENANT: 'Đã thu tiền onboard',
  METER_READING_DUE: 'Cần chụp công tơ',
  RENT_ISSUED: 'Phát hành tiền nhà',
  BILLING_REMINDER: 'Nhắc hạn thanh toán',
  BILLING_OVERDUE: 'Quá hạn thanh toán',
  RENT_OVERDUE_MANAGER: 'Tiền nhà quá hạn',
  RENT_OVERDUE_HOST: 'Tiền nhà quá hạn',
  // BE 24/09/2026: điện/nước/sửa chữa/dịch vụ quá hạn (phát hành + 5 ngày) → báo cả admin,
  // hợp đồng đã được đề nghị chấm dứt.
  INVOICE_OVERDUE_ADMIN: 'Hoá đơn quá hạn — đề nghị chấm dứt HĐ',
  INVOICE_OVERDUE_HOST: 'Hoá đơn quá hạn',
  INVOICE_OVERDUE_MANAGER: 'Hoá đơn quá hạn',
  MAINTENANCE_OVERDUE_HOST: 'Phí sửa chữa quá hạn',
  MAINTENANCE_OVERDUE_MANAGER: 'Phí sửa chữa quá hạn',
  // RENT_FIRST_CYCLE_* đã bỏ (13/08/2026): tiền kỳ đầu thu chung với tiền cọc ở mã QR
  // lúc đón khách nên không còn kỳ đầu nào để nhắc/quá hạn. Bản ghi cũ trong DB rơi vào
  // nhánh "type lạ" bên dưới và hiện nguyên mã — đúng ý, đừng dựng lại nhãn cho chúng.
  UTILITY_INVOICE_CREATED: 'Hoá đơn điện/nước mới',
  MAINTENANCE_CREATED: 'Yêu cầu bảo trì mới',
  MAINTENANCE_COMPLETED: 'Bảo trì chờ xác nhận',
  // BE ship 03/09/2026 (commit 3381711) — duy nhất loại admin thực sự nhận trong luồng
  // bảo trì mới (report-fault); MAINTENANCE_ADMIN_REVIEWED đi cho manager, không tới đây.
  MAINTENANCE_FAULT_REPORTED: 'Báo lỗi do khách — cần duyệt',
  MAINTENANCE_COST_RESOLVED: 'Chốt chi phí bảo trì',
  MAINTENANCE_AUTO_CONFIRMED: 'Bảo trì tự xác nhận',
  // host_notifications
  PROPERTY_REVIEW: 'Căn chờ duyệt giá',
  CONTRACT_PENDING: 'Hợp đồng chờ duyệt',
  MASTER_LEASE_EXPIRING: 'Master lease sắp hết hạn',
  MAINTENANCE_REOPEN_ESCALATION: 'Bảo trì bị từ chối nhiều lần',
};

/** Đỏ = việc đang hỏng/quá hạn, hổ phách = việc cần làm, xanh = tin tốt. */
const toneOf = (type?: string): string => {
  if (!type) return 'bg-slate-100 text-slate-600';
  if (type.includes('OVERDUE') || type.includes('ESCALATION')) return 'bg-rose-100 text-rose-700';
  if (type.includes('DUE') || type.includes('REMINDER') || type.includes('PENDING')
    || type.includes('REVIEW') || type.includes('EXPIRING') || type.includes('FAULT_REPORTED')) return 'bg-amber-100 text-amber-700';
  if (type.includes('PAID') || type.includes('PAYMENT_RECEIVED')) return 'bg-emerald-100 text-emerald-700';
  return 'bg-slate-100 text-slate-600';
};

/** Hai nguồn quy về một shape để render chung, giữ `source` để mark-read đúng endpoint. */
interface Row {
  key: string;
  id: string;
  source: 'app' | 'host';
  title: string;
  content: string;
  type?: string;
  read: boolean;
  createdAt?: string;
}

const fromApp = (n: AppNotificationDto): Row => ({
  key: `app-${n.id}`,
  id: String(n.id),
  source: 'app',
  title: n.title,
  content: n.content,
  type: n.type,
  read: n.read,
  createdAt: n.createdAt,
});

const fromHost = (n: HostNotificationDto): Row => ({
  key: `host-${n.id}`,
  id: n.id,
  source: 'host',
  title: n.title,
  content: n.message,
  type: n.type,
  read: n.isRead,
  createdAt: n.createdAt,
});

const byNewest = (a: Row, b: Row) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '');

export const AdminNotificationCenter = () => {
  const [appRows, setAppRows] = useState<Row[]>([]);
  const [hostRows, setHostRows] = useState<Row[]>([]);
  const [appTotal, setAppTotal] = useState(0);
  const [hostTotal, setHostTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterRead, setFilterRead] = useState<'all' | 'unread'>('all');
  const { refresh: refreshBadge } = useUnreadNotifications();

  /**
   * `allSettled`: một nguồn hỏng thì vẫn hiện nguồn kia. Nguồn host từng 500 vì NPE
   * phía BE (đã sửa 13/08/2026) — không có lý do gì để nó kéo sập cả trang lần nữa.
   */
  const load = useCallback(async () => {
    setLoading(true);
    const [app, host] = await Promise.allSettled([
      notificationService.list({ page: 0, size: PAGE_SIZE }),
      hostService.listNotifications({ page: 0, size: PAGE_SIZE }),
    ]);
    setAppRows(app.status === 'fulfilled' ? (app.value?.content ?? []).map(fromApp) : []);
    setHostRows(host.status === 'fulfilled' ? (host.value?.content ?? []).map(fromHost) : []);
    // Tổng phía server để nói thật khi danh sách bị cắt: badge đếm TẤT CẢ chưa đọc,
    // còn trang chỉ lấy trang đầu. Không đối chiếu thì người dùng thấy chuông 51 mà
    // đếm tay được 50 và tưởng mất dữ liệu.
    setAppTotal(app.status === 'fulfilled' ? (app.value?.totalElements ?? 0) : 0);
    setHostTotal(host.status === 'fulfilled' ? (host.value?.totalElements ?? 0) : 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Cập nhật lạc quan; lỗi thì `load()` kéo lại trạng thái thật. */
  const markRead = async (row: Row) => {
    const setter = row.source === 'app' ? setAppRows : setHostRows;
    setter(prev => prev.map(n => (n.key === row.key ? { ...n, read: true } : n)));
    try {
      if (row.source === 'app') await notificationService.markRead(Number(row.id));
      else await hostService.markNotificationRead(row.id);
      refreshBadge();
    } catch {
      void load();
    }
  };

  const markAllRead = async () => {
    setAppRows(prev => prev.map(n => ({ ...n, read: true })));
    setHostRows(prev => prev.map(n => ({ ...n, read: true })));
    // Hai bảng, hai endpoint riêng — `allSettled` để một bên lỗi không chặn bên kia.
    await Promise.allSettled([
      notificationService.markAllRead(),
      hostService.markAllNotificationsRead(),
    ]);
    refreshBadge();
    void load();
  };

  const visible = (rows: Row[]) =>
    (filterRead === 'unread' ? rows.filter(n => !n.read) : rows).slice().sort(byNewest);

  const unreadCount = [...appRows, ...hostRows].filter(n => !n.read).length;
  const shownApp = visible(appRows);
  const shownHost = visible(hostRows);

  const renderRow = (n: Row) => (
    <li key={n.key} className={`flex gap-3 p-4 ${n.read ? '' : 'bg-cyan-50/40'}`}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {!n.read && <span className="h-2 w-2 rounded-full bg-cyan-500" />}
          <span className="font-semibold text-slate-900">{n.title}</span>
          {!!n.type && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${toneOf(n.type)}`}>
              {TYPE_LABEL[n.type] ?? n.type}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-600">{n.content}</p>
        <p className="mt-1 text-xs text-slate-400">{formatTime(n.createdAt)}</p>
      </div>
      {!n.read && (
        <button
          onClick={() => void markRead(n)}
          className="self-start rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Đã đọc
        </button>
      )}
    </li>
  );

  const emptyBox = (text: string) => (
    <div className="p-8 text-center text-sm text-slate-500">{text}</div>
  );

  /** Chỉ hiện khi server còn nhiều hơn số đang hiển thị — im lặng thì tưởng mất dữ liệu. */
  const truncatedNote = (shown: number, total: number) =>
    total > shown ? (
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
        Đang hiện {shown} mục mới nhất trong tổng số {total}.
      </p>
    ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-cyan-50 p-2">
            <Bell className="h-5 w-5 text-cyan-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Trung tâm thông báo</h1>
            <p className="text-sm text-slate-500">
              {unreadCount > 0 ? `${unreadCount} mục chưa đọc` : 'Đã đọc hết'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 p-0.5">
            {(['all', 'unread'] as const).map(key => (
              <button
                key={key}
                onClick={() => setFilterRead(key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  filterRead === key ? 'bg-cyan-500 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {key === 'all' ? 'Tất cả' : 'Chưa đọc'}
              </button>
            ))}
          </div>
          <button
            onClick={() => void load()}
            className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            title="Tải lại"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => void markAllRead()}
            disabled={unreadCount === 0}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <CheckCheck className="h-4 w-4" />
            Đọc hết
          </button>
        </div>
      </div>

      {/* Khối 1: sự kiện đã xảy ra */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Bell className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-bold text-slate-800">Hoạt động hệ thống</h2>
          <span className="text-xs text-slate-400">
            Sự kiện đã xảy ra · {appRows.filter(n => !n.read).length} chưa đọc
          </span>
        </header>
        {loading && appRows.length === 0
          ? emptyBox('Đang tải…')
          : shownApp.length === 0
            ? emptyBox(filterRead === 'unread' ? 'Không có mục chưa đọc.' : 'Chưa có hoạt động nào.')
            : (
              <>
                <ul className="divide-y divide-slate-100">{shownApp.map(renderRow)}</ul>
                {truncatedNote(appRows.length, appTotal)}
              </>
            )}
      </section>

      {/* Khối 2: việc đang chờ. Tách riêng vì đây là ảnh chụp trạng thái, không phải
          sự kiện — và hiện chưa được BE dọn khi việc đã xong. */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <ClipboardList className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-bold text-slate-800">Việc đang chờ xử lý</h2>
          <span className="text-xs text-slate-400">
            Căn chờ duyệt giá · HĐ chờ duyệt · master lease sắp hết hạn ·{' '}
            {hostRows.filter(n => !n.read).length} chưa đọc
          </span>
        </header>
        {loading && hostRows.length === 0
          ? emptyBox('Đang tải…')
          : shownHost.length === 0
            ? emptyBox(filterRead === 'unread' ? 'Không có mục chưa đọc.' : 'Không có việc nào đang chờ.')
            : (
              <>
                <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                  Danh sách này chưa tự xoá mục đã xử lý xong — đối chiếu lại ở màn Cấu
                  hình khai thác / Hợp đồng trước khi hành động.
                </p>
                <ul className="divide-y divide-slate-100">{shownHost.map(renderRow)}</ul>
                {truncatedNote(hostRows.length, hostTotal)}
              </>
            )}
      </section>
    </div>
  );
};
