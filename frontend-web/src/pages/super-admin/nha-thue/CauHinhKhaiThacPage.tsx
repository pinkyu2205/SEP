import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, CheckCircle2, Clock, Hammer,
  MapPin, Search, Settings2, Wrench, History, RefreshCw,
  AlertTriangle, DoorOpen, Users, ChevronDown, ChevronRight,
} from 'lucide-react';
import { propertyService } from '../../../services/property.service';
import type { PropertyResponse, RenovationLineResponse, RenovationSession, RoomResponse } from '../../../types/api.types';
import { StepOnboardingOptions } from '../properties/wizard/StepOnboardingOptions';
import { KpiCard } from '../shared';
import { ConfirmDialog } from '../../../components/ConfirmDialog';

const formatVND = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);

/** Convert flat lines to a single fallback session when BE doesn't have sessions API */
const flatToSessions = (lines: RenovationLineResponse[]): RenovationSession[] => [
  { sessionNumber: 1, startDate: undefined, endDate: undefined, totalCost: lines.reduce((s, l) => s + l.cost, 0), lines },
];

const SessionAccordion = ({ session, defaultOpen = true }: { session: RenovationSession; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  const dateLabel = session.startDate
    ? new Date(session.startDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-6 py-4 bg-slate-50 border-b border-slate-100 text-left hover:bg-slate-100 transition"
      >
        {open ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
        <Hammer className="h-4 w-4 text-amber-600 shrink-0" />
        <span className="font-bold text-slate-800">Cải tạo lần {session.sessionNumber}</span>
        {dateLabel && <span className="text-xs text-slate-400 font-medium">— {dateLabel}</span>}
        {!session.endDate && (
          <span className="ml-1 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Đang thi công</span>
        )}
        <span className="ml-auto text-xs font-semibold text-slate-400">{session.lines.length} hạng mục</span>
        <span className="font-black text-amber-700 text-sm ml-3">{formatVND(session.totalCost)}</span>
      </button>
      {open && (
        <div className="p-5">
          {session.lines.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Chưa có hạng mục nào</p>
          ) : (
            <div className="space-y-2">
              {session.lines.map((line, i) => (
                <div key={line.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    <span className="font-semibold text-slate-700">{line.categoryName}</span>
                    {line.note && <span className="text-slate-400 text-xs truncate">({line.note})</span>}
                  </div>
                  <span className="font-bold text-amber-600 shrink-0">{formatVND(line.cost)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm">
                <span className="font-bold text-amber-800">Tổng đợt này</span>
                <span className="font-black text-amber-700">{formatVND(session.totalCost)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const RenovationHistoryPanel = ({ property }: { property: PropertyResponse }) => {
  const [sessions, setSessions] = useState<RenovationSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!property.hasRenovation && !property.renovationCompleted) { setLoading(false); return; }
    const load = async () => {
      try {
        const data = await propertyService.getRenovationSessions(property.id).catch(async () => {
          const lines = await propertyService.getRenovationLines(property.id);
          return flatToSessions(lines);
        });
        setSessions(data);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, [property.id]);

  if (!property.hasRenovation && !property.renovationCompleted) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
        <Hammer className="w-10 h-10 mx-auto mb-3 text-slate-300" />
        <p className="font-semibold text-slate-500">Tòa nhà này không có cải tạo</p>
      </div>
    );
  }

  if (loading) return <div className="py-16 text-center text-slate-400">Đang tải...</div>;

  const grandTotal = sessions.reduce((s, sess) => s + sess.totalCost, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-bold text-amber-700/70 uppercase tracking-wide mb-1.5">Tổng chi phí tất cả đợt</p>
          <p className="text-2xl font-black text-amber-600">{formatVND(grandTotal)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Số đợt cải tạo</p>
          <p className={`text-2xl font-black ${property.renovationCompleted ? 'text-emerald-600' : 'text-amber-600'}`}>
            {sessions.length} đợt {property.renovationCompleted ? '(hoàn thành)' : '(đang thi công)'}
          </p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <Hammer className="w-10 h-10 mx-auto mb-3 text-slate-300" />
          <p className="text-sm text-slate-400">Chưa có hạng mục cải tạo nào được ghi nhận</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((sess, idx) => (
            <SessionAccordion key={sess.sessionNumber} session={sess} defaultOpen={idx === sessions.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
};

const RenovateRestartPanel = ({ property, onDone }: { property: PropertyResponse; onDone: () => void }) => {
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [prevSessions, setPrevSessions] = useState<RenovationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [wholeHouseConfirmed, setWholeHouseConfirmed] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [sessions, roomList] = await Promise.all([
          propertyService.getRenovationSessions(property.id).catch(async () => {
            const lines = await propertyService.getRenovationLines(property.id);
            return flatToSessions(lines);
          }),
          property.wholeHouse === false ? propertyService.getRooms(property.id) : Promise.resolve([]),
        ]);
        setPrevSessions(sessions);
        setRooms(roomList);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    load();
  }, [property.id]);

  const rentedRooms = rooms.filter(r => r.status === 'RENTED');
  const isOccupied = property.wholeHouse === false
    ? rentedRooms.length > 0
    : !wholeHouseConfirmed;

  const canStart = !isOccupied;

  const handleStart = async () => {
    setStarting(true);
    try {
      await propertyService.startRenovation(property.id);
      alert('Đã chuyển sang trạng thái Đang cải tạo!');
      onDone();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Lỗi — BE chưa có endpoint này, xem doc/NOTE-CHO-TEAM-BE.md mục 5');
    } finally {
      setStarting(false);
    }
  };

  if (loading) return <div className="py-16 text-center text-slate-400">Đang tải dữ liệu cải tạo...</div>;

  const prevGrandTotal = prevSessions.reduce((s, sess) => s + sess.totalCost, 0);

  return (
    <div className="space-y-5">

      {/* Lịch sử cải tạo trước đó */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 px-1">
          <History className="h-5 w-5 text-amber-600" />
          <h3 className="font-bold text-slate-800">Lịch sử cải tạo trước đó</h3>
          {prevSessions.length > 0 && (
            <span className="ml-auto text-sm font-bold text-amber-700">{formatVND(prevGrandTotal)}</span>
          )}
        </div>
        {prevSessions.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-sm text-slate-400">Chưa có hạng mục cải tạo nào được ghi nhận từ trước</p>
          </div>
        ) : (
          prevSessions.map(sess => (
            <SessionAccordion key={sess.sessionNumber} session={sess} defaultOpen={false} />
          ))
        )}
        {prevSessions.length > 0 && (
          <p className="text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
            Sau khi bắt đầu cải tạo lại, các hạng mục trên sẽ được giữ nguyên. Bạn có thể thêm hạng mục mới vào đợt cải tạo này.
          </p>
        )}
      </div>

      {/* Kiểm tra tình trạng phòng */}
      {property.wholeHouse === false ? (
        <section className="rounded-2xl border bg-white overflow-hidden
          border-slate-200">
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-4 flex items-center gap-3">
            <DoorOpen className="h-5 w-5 text-indigo-500" />
            <h3 className="font-bold text-slate-800">Tình trạng phòng</h3>
            <span className={`ml-auto text-xs font-bold px-2.5 py-1 rounded-full ${
              rentedRooms.length > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
            }`}>
              {rentedRooms.length > 0
                ? `${rentedRooms.length} phòng có khách`
                : 'Tất cả phòng trống'}
            </span>
          </div>
          <div className="p-5">
            {rentedRooms.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-50 border border-rose-200">
                  <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-rose-800 text-sm">Không thể bắt đầu cải tạo</p>
                    <p className="text-xs text-rose-600 mt-0.5">Còn {rentedRooms.length} phòng đang có khách thuê. Phải chờ hết hợp đồng hoặc chuyển khách đi trước.</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {rentedRooms.map(r => (
                    <div key={r.id} className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-rose-100 bg-rose-50/50 text-sm">
                      <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-rose-400" />
                        <span className="font-semibold text-slate-700">{r.roomNumber}</span>
                        <span className="text-slate-400">{r.area} m²</span>
                      </div>
                      <span className="text-xs font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full">Có khách</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-emerald-800 text-sm">Tất cả {rooms.length} phòng đang trống</p>
                  <p className="text-xs text-emerald-600 mt-0.5">Có thể bắt đầu cải tạo ngay.</p>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-slate-800 text-sm">Nhà nguyên căn — xác nhận thủ công</p>
              <p className="text-xs text-slate-500 mt-1">Hệ thống không tự động kiểm tra được hợp đồng thuê nguyên căn. Admin tự xác nhận nhà đã trống trước khi tiến hành.</p>
            </div>
          </div>
          <label className="flex items-center gap-3 mt-4 cursor-pointer">
            <input
              type="checkbox"
              checked={wholeHouseConfirmed}
              onChange={e => setWholeHouseConfirmed(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600"
            />
            <span className="text-sm font-semibold text-slate-700">Tôi xác nhận nhà hiện không có khách thuê</span>
          </label>
        </section>
      )}

      {/* Nút bắt đầu */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleStart}
          disabled={!canStart || starting}
          className="flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm transition shadow-sm shadow-amber-200"
        >
          <RefreshCw className={`w-4 h-4 ${starting ? 'animate-spin' : ''}`} />
          {starting ? 'Đang xử lý...' : 'Bắt đầu cải tạo lại'}
        </button>
      </div>
    </div>
  );
};

const getStatusBadge = (b: PropertyResponse): { label: string; cls: string } | null => {
  if (b.status === 'DRAFT') {
    return b.hasRenovation
      ? { label: 'Đang cải tạo', cls: 'bg-amber-100 text-amber-800' }
      : null;
  }
  if (b.status === 'UNDER_RENOVATION') return { label: 'Đang cải tạo', cls: 'bg-amber-100 text-amber-800' };
  if (b.status === 'RENOVATION_COMPLETED') return { label: 'Đã hoàn tất cải tạo', cls: 'bg-teal-100 text-teal-800' };
  if (b.status === 'PENDING_HOST_REVIEW') return { label: 'Đã cải tạo xong', cls: 'bg-teal-100 text-teal-800' };
  if (b.status === 'ACTIVE') return { label: 'Đang kinh doanh', cls: 'bg-emerald-100 text-emerald-800' };
  if (b.status === 'DISABLED') return { label: 'Đã vô hiệu', cls: 'bg-rose-100 text-rose-800' };
  return null;
};

export const CauHinhKhaiThacPage = () => {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [selected, setSelected] = useState<PropertyResponse | null>(null);
  const [viewMode, setViewMode] = useState<'config' | 'history' | 'renovate'>('config');
  const [buildings, setBuildings] = useState<PropertyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [renoTarget, setRenoTarget] = useState<PropertyResponse | null>(null);
  const [completingReno, setCompletingReno] = useState(false);

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await propertyService.getProperties(0, 100);
      setBuildings(res.content);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchList(); }, []);

  useEffect(() => {
    if (id && buildings.length > 0) {
      const found = buildings.find(p => p.id === Number(id));
      if (found) setSelected(found);
      else propertyService.getPropertyById(Number(id)).then(setSelected).catch(console.error);
    }
  }, [id, buildings]);

  const kpi = useMemo(() => buildings.reduce(
    (acc, b) => ({
      total: acc.total + 1,
      pending: acc.pending + (b.status === 'DRAFT' && b.wholeHouse === null ? 1 : 0),
      configured: acc.configured + (b.wholeHouse !== null ? 1 : 0),
      renovation: acc.renovation + (b.status === 'UNDER_RENOVATION' ? 1 : 0),
    }),
    { total: 0, pending: 0, configured: 0, renovation: 0 }
  ), [buildings]);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return buildings.filter(b => {
      const matchStatus = statusFilter === 'all' || b.status === statusFilter;
      const matchSearch = !kw || [b.propertyName, b.shortAddress, b.fullAddress, b.zoneName]
        .some(v => v?.toLowerCase().includes(kw));
      return matchStatus && matchSearch;
    });
  }, [buildings, statusFilter, search]);

  const openConfig = (b: PropertyResponse) => { setSelected(b); setViewMode('config'); };
  const openHistory = (b: PropertyResponse) => { setSelected(b); setViewMode('history'); };
  const openRenovate = (b: PropertyResponse) => { setSelected(b); setViewMode('renovate'); };

  const backToList = () => {
    setSelected(null);
    setViewMode('config');
    if (id) navigate('/admin/buildings/configuration', { replace: true });
    fetchList();
  };

  const handleRenovationComplete = async () => {
    if (!renoTarget) return;
    setCompletingReno(true);
    try {
      await propertyService.completeRenovation(renoTarget.id);
      setRenoTarget(null);
      fetchList();
    } catch (err: any) {
      setRenoTarget(null);
      alert(err.response?.data?.message || 'Lỗi hoàn thành cải tạo — xem doc/NOTE-CHO-TEAM-BE.md mục 9');
    } finally {
      setCompletingReno(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // VIEW: Chi tiết cấu hình
  // ═══════════════════════════════════════════════════════════════════
  if (selected) {
    const canShowHistory = !!(selected.hasRenovation || selected.renovationCompleted);
    const canShowRenovate = selected.status === 'ACTIVE';
    const tabs = [
      { key: 'config' as const, label: 'Cấu hình', icon: Settings2 },
      ...(canShowHistory ? [{ key: 'history' as const, label: 'Lịch sử cải tạo', icon: History }] : []),
      ...(canShowRenovate ? [{ key: 'renovate' as const, label: 'Cải tạo lại', icon: RefreshCw }] : []),
    ];

    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <button onClick={backToList}
          className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition">
          <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
        </button>
        <div className="mb-5">
          <h1 className="text-2xl font-black text-slate-900">{selected.propertyName}</h1>
          <p className="text-slate-500 mt-1 font-medium text-sm">
            {selected.fullAddress || selected.shortAddress}
          </p>
        </div>

        {tabs.length > 1 && (
          <div className="flex gap-2 mb-6 border-b border-slate-200">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const active = viewMode === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setViewMode(tab.key)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition -mb-px ${
                    active
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}

        {viewMode === 'config' && (
          <StepOnboardingOptions
            property={selected}
            onNext={backToList}
            onBack={backToList}
            onPropertyUpdated={setSelected}
            nextLabel={selected.status === 'UNDER_RENOVATION' ? 'Lưu cấu hình cải tạo & Quay về' : 'Xác nhận cấu hình & Quay về'}
            renovationOnly={selected.status === 'UNDER_RENOVATION'}
          />
        )}
        {viewMode === 'history' && (
          <RenovationHistoryPanel property={selected} />
        )}
        {viewMode === 'renovate' && (
          <RenovateRestartPanel property={selected} onDone={backToList} />
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // VIEW: Danh sách tòa nhà
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Cấu hình khai thác</h1>
        <p className="text-slate-500 mt-1 text-sm font-medium">
          Cấu hình loại hình kinh doanh, cải tạo, phòng và phân bổ thiết bị cho từng tòa nhà
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Tổng tòa nhà" value={String(kpi.total)} icon={Building2} color="bg-blue-50 text-blue-700" />
        <KpiCard title="Chờ cấu hình" value={String(kpi.pending)} icon={Settings2} color="bg-slate-50 text-slate-700" />
        <KpiCard title="Đã cấu hình" value={String(kpi.configured)} icon={CheckCircle2} color="bg-emerald-50 text-emerald-700" />
        <KpiCard title="Đang cải tạo" value={String(kpi.renovation)} icon={Hammer} color="bg-amber-50 text-amber-700" />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="input-field pl-9" placeholder="Tìm theo tên, địa chỉ..." />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field w-52">
          <option value="all">Tất cả trạng thái</option>
          <option value="UNDER_RENOVATION">Đang cải tạo</option>
          <option value="RENOVATION_COMPLETED">Đã hoàn tất cải tạo</option>
          <option value="PENDING_HOST_REVIEW">Đã cải tạo xong</option>
          <option value="ACTIVE">Đang kinh doanh</option>
          <option value="DISABLED">Đã vô hiệu</option>
        </select>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400">Đang tải dữ liệu...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <Building2 className="mx-auto h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm font-semibold">Không tìm thấy tòa nhà phù hợp.</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {filtered.map(b => {
            const badge = getStatusBadge(b);
            return (
              <div key={b.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-cyan-300 hover:shadow-md transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-slate-950 leading-tight">{b.propertyName}</p>
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="line-clamp-1">{b.fullAddress || b.shortAddress}</span>
                    </div>
                  </div>
                  {badge && (
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${badge.cls}`}>
                      {badge.label}
                    </span>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {b.zoneName && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{b.zoneName}</span>
                  )}
                  <span className="font-bold text-indigo-600">
                    {b.wholeHouse === null ? 'Chưa chọn loại hình' : b.wholeHouse ? 'Nhà nguyên căn' : 'Phòng trọ'}
                  </span>
                  {b.areaSize ? <span className="text-slate-500">{b.areaSize} m²</span> : null}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-blue-50 py-2 text-blue-700">
                    <p className="font-black text-base leading-tight">{b.totalRooms || 0}</p>
                    <p className="mt-0.5">Tổng phòng</p>
                  </div>
                  <div className="rounded-lg bg-indigo-50 py-2 text-indigo-700">
                    <p className="font-black text-base leading-tight">{b.totalFloor ?? b.floorCount ?? '—'}</p>
                    <p className="mt-0.5">Số tầng</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 py-2 text-amber-700">
                    <p className="font-black text-base leading-tight">
                      {b.renovationCompleted ? 'Xong' : b.hasRenovation ? 'Chưa xong' : '—'}
                    </p>
                    <p className="mt-0.5">Cải tạo</p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100">
                  {b.status === 'DRAFT' && (
                    <button onClick={() => openConfig(b)}
                      className="w-full py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white transition rounded-xl font-bold text-sm flex justify-center items-center gap-2">
                      <Settings2 className="w-4 h-4" /> Cấu hình tòa nhà →
                    </button>
                  )}
                  {b.status === 'UNDER_RENOVATION' && (
                    <div className="flex flex-col gap-2">
                      <button onClick={() => openConfig(b)}
                        className="w-full py-2.5 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white transition rounded-xl font-bold text-sm flex justify-center items-center gap-2">
                        <Wrench className="w-4 h-4" /> Xem / cập nhật cấu hình
                      </button>
                      <button onClick={() => setRenoTarget(b)}
                        className="w-full py-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white transition rounded-xl font-bold text-sm flex justify-center items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" /> Xác nhận hoàn thành cải tạo
                      </button>
                    </div>
                  )}
                  {b.status === 'RENOVATION_COMPLETED' && (
                    <div className="flex flex-col gap-2">
                      <button onClick={() => openConfig(b)}
                        className="w-full py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white transition rounded-xl font-bold text-sm flex justify-center items-center gap-2">
                        <Settings2 className="w-4 h-4" /> Xem / cập nhật cấu hình
                      </button>
                      {(b.hasRenovation || b.renovationCompleted) && (
                        <button onClick={() => openHistory(b)}
                          className="w-full py-2 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white transition rounded-xl font-bold text-xs flex justify-center items-center gap-1.5">
                          <History className="w-3.5 h-3.5" /> Xem lịch sử cải tạo
                        </button>
                      )}
                    </div>
                  )}
                  {b.status === 'PENDING_HOST_REVIEW' && (
                    <div className="flex flex-col gap-2">
                      <div className="w-full py-2 text-center text-xs font-semibold text-blue-600 bg-blue-50 rounded-xl flex items-center justify-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> Đang chờ Host phê duyệt
                      </div>
                      {(b.hasRenovation || b.renovationCompleted) && (
                        <button onClick={() => openHistory(b)}
                          className="w-full py-2 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white transition rounded-xl font-bold text-xs flex justify-center items-center gap-1.5">
                          <History className="w-3.5 h-3.5" /> Xem lịch sử cải tạo
                        </button>
                      )}
                    </div>
                  )}
                  {b.status === 'ACTIVE' && (
                    <div className="flex flex-col gap-2">
                      <div className="w-full py-2 text-center text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-xl flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Đang kinh doanh
                      </div>
                      {(b.hasRenovation || b.renovationCompleted) && (
                        <button onClick={() => openHistory(b)}
                          className="w-full py-2 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white transition rounded-xl font-bold text-xs flex justify-center items-center gap-1.5">
                          <History className="w-3.5 h-3.5" /> Xem lịch sử cải tạo
                        </button>
                      )}
                      <button onClick={() => openRenovate(b)}
                        className="w-full py-2 bg-orange-50 text-orange-700 hover:bg-orange-500 hover:text-white transition rounded-xl font-bold text-xs flex justify-center items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5" /> Cải tạo lại
                      </button>
                    </div>
                  )}
                  {b.status === 'DISABLED' && (
                    <div className="flex flex-col gap-2">
                      <div className="w-full py-2 text-center text-xs font-semibold text-slate-500 bg-slate-100 rounded-xl">
                        Đã vô hiệu hóa
                      </div>
                      {(b.hasRenovation || b.renovationCompleted) && (
                        <button onClick={() => openHistory(b)}
                          className="w-full py-2 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white transition rounded-xl font-bold text-xs flex justify-center items-center gap-1.5">
                          <History className="w-3.5 h-3.5" /> Xem lịch sử cải tạo
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!renoTarget}
        tone="success"
        title="Xác nhận hoàn thành cải tạo?"
        message={renoTarget && (
          <>
            Bạn chắc chắn tòa nhà <b className="text-slate-700">{renoTarget.propertyName}</b> đã cải tạo xong?
            Hệ thống sẽ chuyển tòa nhà sang trạng thái <b className="text-slate-700">Đang kinh doanh</b> và không thể hoàn tác.
          </>
        )}
        confirmText="Xác nhận hoàn thành"
        loading={completingReno}
        onConfirm={handleRenovationComplete}
        onCancel={() => setRenoTarget(null)}
      />
    </div>
  );
};
