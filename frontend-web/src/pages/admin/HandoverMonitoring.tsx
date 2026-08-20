import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Building2, CheckCircle2, ChevronDown, ChevronRight, Clock, PackageCheck, Search, X,
} from 'lucide-react';
import { handoverService, type HandoverStatus, type RoomHandover } from '@/services/handover.service';
import { SectionShell, StatusPill, KpiCard } from './shared';

/**
 * TIẾN ĐỘ NHẬN NHÀ / GIAO PHÒNG (Admin).
 *
 * Mentor 07/08/2026 (ý 16): "trên web không xem được manager đã tới lấy phòng và giao
 * phòng cho tenant chưa". Trang này trả lời đúng hai câu đó, theo hai cột riêng:
 *
 *   1. NHẬN NHÀ   — manager đã tiếp quản toà nhà từ chủ nhà chưa (`Property.status`)
 *   2. GIAO PHÒNG — đã bàn giao được bao nhiêu / tổng bao nhiêu phòng cho khách thuê
 *
 * Bấm vào một dòng để xổ chi tiết từng phòng: khách nào, ngày vào ở, và quan trọng nhất
 * là **hồ sơ bàn giao có đủ không** (ảnh hiện trạng + chỉ số điện/nước). Thiếu hai thứ
 * đó thì lúc khách trả phòng không có căn cứ trừ cọc — nên trang bôi đỏ để admin đòi
 * manager bổ sung sớm, thay vì phát hiện lúc đã muộn.
 *
 * ⚠️ KHÔNG đụng `BillingPaymentMonitoring.tsx` — trang đó do thành viên khác phụ trách.
 */

/** Toà nhà đã được manager tiếp quản hay chưa — suy từ PropertyStatus của BE. */
const ACCEPTED_STATUSES = new Set(['ACTIVE', 'RENTED', 'MAINTENANCE']);

const PROPERTY_STATUS: Record<string, { label: string; color: string; dot: string }> = {
  DRAFT: { label: 'Nháp', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  PENDING: { label: 'Chờ xử lý', color: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  UNDER_RENOVATION: { label: 'Đang sửa chữa', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  PENDING_EQUIPMENT_INSTALLATION: { label: 'Chờ lắp thiết bị', color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  RENOVATION_COMPLETED: { label: 'Sửa xong', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  PENDING_HOST_REVIEW: { label: 'Chờ Host duyệt', color: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  PENDING_OPERATION_MANAGER: { label: 'Chờ QL nhận nhà', color: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
  ACTIVE: { label: 'Đang khai thác', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  RENTED: { label: 'Đã cho thuê', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  DISABLED: { label: 'Ngưng khai thác', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  MAINTENANCE: { label: 'Đang bảo trì', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
};

const CONTRACT_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Chờ đón khách', color: 'bg-sky-100 text-sky-700' },
  PENDING: { label: 'Chờ thu tiền', color: 'bg-amber-100 text-amber-800' },
  ACTIVE: { label: 'Đã giao phòng', color: 'bg-emerald-100 text-emerald-700' },
  TERMINATED: { label: 'Đã chấm dứt', color: 'bg-zinc-200 text-zinc-700' },
  EXPIRED: { label: 'Hết hạn', color: 'bg-slate-100 text-slate-600' },
};

const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—';

const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-');
  return day && m && y ? `${day}/${m}/${y}` : d;
};

/** Hồ sơ bàn giao của 1 phòng đã đủ chưa — thiếu là mất căn cứ trừ cọc lúc trả phòng. */
const evidenceGaps = (r: RoomHandover): string[] => {
  const gaps: string[] = [];
  if (!r.conditionPhotoCount) gaps.push('chưa có ảnh hiện trạng');
  if (!r.hasMeterReadings) gaps.push('chưa chốt chỉ số điện/nước');
  return gaps;
};

type Filter = 'all' | 'not_accepted' | 'incomplete' | 'has_gap';

export const HandoverMonitoring = () => {
  const [rows, setRows] = useState<HandoverStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  // Chi tiết phòng tải LƯỜI theo từng toà (endpoint list không trả `rooms`).
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Record<number, HandoverStatus>>({});
  const [detailLoading, setDetailLoading] = useState<number | null>(null);

  useEffect(() => {
    handoverService.list()
      .then(setRows)
      .catch(() => setError('Không tải được tiến độ bàn giao. Kiểm tra kết nối hoặc quyền truy cập.'))
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (propertyId: number) => {
    if (openId === propertyId) { setOpenId(null); return; }
    setOpenId(propertyId);
    if (detail[propertyId]) return;
    setDetailLoading(propertyId);
    try {
      const d = await handoverService.detail(propertyId);
      setDetail((prev) => ({ ...prev, [propertyId]: d }));
    } catch {
      // Không chặn cả trang vì một toà lỗi — dòng đó hiện thông báo riêng bên dưới.
    } finally {
      setDetailLoading(null);
    }
  };

  const stats = useMemo(() => {
    const accepted = rows.filter((r) => ACCEPTED_STATUSES.has(r.propertyStatus)).length;
    const totalRooms = rows.reduce((s, r) => s + (r.totalRooms ?? 0), 0);
    const handed = rows.reduce((s, r) => s + (r.roomsHandedOver ?? 0), 0);
    return { total: rows.length, accepted, notAccepted: rows.length - accepted, totalRooms, handed };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !(`${r.propertyName} ${r.operationManagerName ?? ''}`.toLowerCase().includes(q))) return false;
      if (filter === 'not_accepted') return !ACCEPTED_STATUSES.has(r.propertyStatus);
      if (filter === 'incomplete') return (r.roomsHandedOver ?? 0) < (r.totalRooms ?? 0);
      if (filter === 'has_gap') {
        // Chỉ biết được sau khi đã mở chi tiết — chưa mở thì không lọc ra, tránh
        // gọi API cho toàn bộ danh sách chỉ để đếm.
        const d = detail[r.propertyId];
        return !!d?.rooms?.some((room) => evidenceGaps(room).length > 0);
      }
      return true;
    });
  }, [rows, search, filter, detail]);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Toà nhà theo dõi" value={String(stats.total)} icon={Building2}
          color="bg-slate-100 text-slate-700"
          onClick={() => setFilter('all')} active={filter === 'all'}
        />
        <KpiCard
          title="Quản lý đã nhận nhà" value={`${stats.accepted}/${stats.total}`} icon={PackageCheck}
          color="bg-emerald-100 text-emerald-700"
          helper={stats.notAccepted > 0 ? `${stats.notAccepted} toà chưa tiếp quản` : 'Đã tiếp quản hết'}
          onClick={() => setFilter('not_accepted')} active={filter === 'not_accepted'}
        />
        <KpiCard
          title="Phòng đã giao khách" value={`${stats.handed}/${stats.totalRooms}`} icon={CheckCircle2}
          color="bg-cyan-100 text-cyan-700"
          onClick={() => setFilter('incomplete')} active={filter === 'incomplete'}
        />
        <KpiCard
          title="Hồ sơ bàn giao thiếu" value={filter === 'has_gap' ? String(filtered.length) : '—'} icon={Clock}
          color="bg-rose-100 text-rose-700"
          helper="Mở từng toà để soi ảnh & chỉ số"
          onClick={() => setFilter('has_gap')} active={filter === 'has_gap'}
        />
      </div>

      <SectionShell
        title="Tiến độ nhận nhà & giao phòng"
        subtitle="Quản lý đã tiếp quản toà nhà từ chủ nhà chưa, và đã bàn giao phòng cho khách thuê tới đâu."
        icon={PackageCheck}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm toà nhà / quản lý..."
                className="input-field w-64 pl-9"
              />
            </div>
            {filter !== 'all' && (
              <button
                onClick={() => setFilter('all')}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <X className="h-3.5 w-3.5" /> Bỏ lọc
              </button>
            )}
          </div>
        }
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
            <p className="text-sm text-slate-400">Đang tải...</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-8 text-center text-sm text-rose-700">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
            {filter === 'has_gap'
              ? 'Mở chi tiết vài toà trước — bộ lọc này chỉ soi được những toà đã tải chi tiết.'
              : 'Không có toà nhà nào khớp bộ lọc.'}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="table-header">
                <tr>
                  <th className="w-10 px-4 py-3" />
                  <th className="px-4 py-3">Toà nhà</th>
                  <th className="px-4 py-3">Quản lý vận hành</th>
                  <th className="px-4 py-3">Nhận nhà từ chủ</th>
                  <th className="px-4 py-3">Giao phòng cho khách</th>
                  <th className="px-4 py-3">Trạng thái nhà</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => {
                  const accepted = ACCEPTED_STATUSES.has(r.propertyStatus);
                  const cfg = PROPERTY_STATUS[r.propertyStatus]
                    ?? { label: r.propertyStatus, color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };
                  const total = r.totalRooms ?? 0;
                  const handed = r.roomsHandedOver ?? 0;
                  const pct = total > 0 ? Math.round((handed / total) * 100) : 0;
                  const open = openId === r.propertyId;
                  const d = detail[r.propertyId];

                  return (
                    // Fragment phải mang `key` — key trên các <tr> bên trong không đủ,
                    // React vẫn cảnh báo và mất tối ưu khi danh sách đổi thứ tự.
                    <Fragment key={r.propertyId}>
                      <tr
                        onClick={() => toggle(r.propertyId)}
                        className="cursor-pointer hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 text-slate-400">
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800">{r.propertyName}</p>
                          <p className="text-xs text-slate-400">#{r.propertyId}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {r.operationManagerName || <span className="text-rose-600">Chưa giao quản lý</span>}
                        </td>
                        <td className="px-4 py-3">
                          {accepted ? (
                            <>
                              <StatusPill label="Đã nhận" color="bg-emerald-100 text-emerald-700" dot="bg-emerald-500" />
                              <p className="mt-1 text-xs text-slate-500">{fmtDateTime(r.managerAcceptedAt)}</p>
                            </>
                          ) : (
                            <StatusPill label="Chưa nhận" color="bg-rose-100 text-rose-700" dot="bg-rose-500" />
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-cyan-500'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-slate-700">
                              {handed}/{total || '—'} phòng
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill label={cfg.label} color={cfg.color} dot={cfg.dot} />
                        </td>
                      </tr>

                      {open && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={6} className="px-4 py-4">
                            {detailLoading === r.propertyId ? (
                              <p className="text-sm text-slate-400">Đang tải chi tiết phòng...</p>
                            ) : !d ? (
                              <p className="text-sm text-rose-600">Không tải được chi tiết toà này.</p>
                            ) : !d.rooms?.length ? (
                              <p className="text-sm text-slate-500">
                                Toà này chưa có phòng nào được bàn giao cho khách thuê.
                              </p>
                            ) : (
                              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                <table className="w-full min-w-[760px] text-left text-xs">
                                  <thead className="bg-slate-50 text-slate-500">
                                    <tr>
                                      <th className="px-3 py-2 font-semibold">Phòng</th>
                                      <th className="px-3 py-2 font-semibold">Khách thuê</th>
                                      <th className="px-3 py-2 font-semibold">Ngày vào ở</th>
                                      <th className="px-3 py-2 font-semibold">Kích hoạt HĐ</th>
                                      <th className="px-3 py-2 font-semibold">Hồ sơ bàn giao</th>
                                      <th className="px-3 py-2 font-semibold">Trạng thái HĐ</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {d.rooms.map((room, i) => {
                                      const gaps = evidenceGaps(room);
                                      const cs = CONTRACT_STATUS[room.contractStatus ?? '']
                                        ?? { label: room.contractStatus || '—', color: 'bg-slate-100 text-slate-600' };
                                      return (
                                        <tr key={`${room.roomNumber}-${i}`} className="hover:bg-slate-50">
                                          <td className="px-3 py-2 font-semibold text-slate-800">
                                            {room.roomNumber || 'Nguyên căn'}
                                          </td>
                                          <td className="px-3 py-2 text-slate-700">{room.tenantName || '—'}</td>
                                          <td className="px-3 py-2 text-slate-600">{fmtDate(room.moveInDate)}</td>
                                          <td className="px-3 py-2 text-slate-600">{fmtDateTime(room.activatedAt)}</td>
                                          <td className="px-3 py-2">
                                            {gaps.length === 0 ? (
                                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                Đủ ({room.conditionPhotoCount} ảnh + chỉ số)
                                              </span>
                                            ) : (
                                              <span className="font-semibold text-rose-600">⚠ {gaps.join(' · ')}</span>
                                            )}
                                          </td>
                                          <td className="px-3 py-2">
                                            <StatusPill label={cs.label} color={cs.color} />
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                                <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400">
                                  Thiếu ảnh hiện trạng hoặc chỉ số điện/nước thì lúc khách trả phòng sẽ không có
                                  căn cứ để trừ cọc — nhắc quản lý bổ sung sớm.
                                </p>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionShell>
    </div>
  );
};

export default HandoverMonitoring;
