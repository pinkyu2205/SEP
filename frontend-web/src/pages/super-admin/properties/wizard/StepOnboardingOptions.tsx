import { useState, useEffect } from 'react';
import {
  Home, LayoutGrid, Hammer, DoorOpen, Package,
  Check, AlertCircle, Settings2, ChevronDown, ChevronRight, Layers, X,
  CalendarDays, Plus, Trash2, Pencil
} from 'lucide-react';
import type {
  PropertyResponse, RenovationCategory, RenovationLineResponse,
  RoomResponse, ManifestItemResponse, EquipmentAssignmentResponse
} from '../../../../types/api.types';
import { propertyService } from '../../../../services/property.service';
import { catalogService } from '../../../../services/catalog.service';
import { ConfirmDialog } from '../../../../components/ConfirmDialog';
import type { EquipmentSource, ManifestEquipmentStatus, PropertyType } from '../../../../types/api.types';

const formatVND = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
const fmtDate = (d: string) => (d ? d.split('-').reverse().join('/') : '');

// ─── Giới hạn lịch thi công ───────────────────────────────────────────────
// Ngày bắt đầu: không trước hôm nay. Ngày kết thúc: tối đa 50 năm kể từ ngày
// bắt đầu. Dùng cho min/max → khoá luôn date picker.
const fmtDateInput = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const TODAY_STR = fmtDateInput(new Date());
const addYearsStr = (base: string, years: number) => {
  const d = base ? new Date(base) : new Date();
  d.setFullYear(d.getFullYear() + years);
  return fmtDateInput(d);
};

interface StepOnboardingOptionsProps {
  property: PropertyResponse;
  onNext: () => void;
  onBack: () => void;
  onPropertyUpdated: (p: PropertyResponse) => void;
  nextLabel?: string;
  /** Chế độ cải tạo lại: chỉ hiện bước 1 (Chọn cấu trúc) và bước 2 (Cải tạo), bỏ bước Gán thiết bị */
  renovationOnly?: boolean;
}

export const StepOnboardingOptions = ({ property, onNext, onBack, onPropertyUpdated, nextLabel = 'Tiếp tục Xem giá →', renovationOnly = false }: StepOnboardingOptionsProps) => {
  const [loading, setLoading] = useState(false);

  // Sub-step nội bộ: 1 = Chọn cấu trúc, 2 = Cải tạo (chỉ khi có cải tạo), 3 = Gán thiết bị
  const [subStep, setSubStep] = useState<1 | 2 | 3>(1);

  // 2A: Options State
  const [wholeHouse, setWholeHouse] = useState<boolean>(true);
  const [hasRenovation, setHasRenovation] = useState<boolean>(false);
  const [optionsSaved, setOptionsSaved] = useState<boolean>(property.wholeHouse !== null);

  // 2B: Renovation State
  const [categories, setCategories] = useState<RenovationCategory[]>([]);
  const [renoLines, setRenoLines] = useState<RenovationLineResponse[]>([]);
  /** Snapshot lúc load = hạng mục từ đợt cải tạo trước (chỉ dùng khi renovationOnly) */
  const [baseLines, setBaseLines] = useState<RenovationLineResponse[]>([]);
  /** Hạng mục thêm MỚI trong đợt cải tạo lần này (chỉ dùng khi renovationOnly) */
  const [currentSessionLines, setCurrentSessionLines] = useState<RenovationLineResponse[]>([]);
  const [showPrevSession, setShowPrevSession] = useState(false);
  const [newRenoLine, setNewRenoLine] = useState({ categoryId: 0, cost: 0, note: '' });
  const [renoCostDisplay, setRenoCostDisplay] = useState('');
  const [schedule, setSchedule] = useState({ startDate: '', endDate: '' });
  const [scheduleSaved, setScheduleSaved] = useState(false);
  
  // 2B.1: Structure Update
  const [showStructureUpdate, setShowStructureUpdate] = useState(false);
  const [structure, setStructure] = useState(() => {
    const floors = property.totalFloor ?? property.floorCount ?? 1;
    const rooms  = property.totalRooms ?? 0;
    return { floorCount: floors, roomsPerFloor: floors > 0 && rooms > 0 ? Math.ceil(rooms / floors) : 1 };
  });
  
  // 2C: Rooms State
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [newRoom, setNewRoom] = useState({ roomNumber: '', area: 0, maxOccupants: 2, propertyType: 'INDIVIDUAL_ROOM' as const });
  const [editingRoomId, setEditingRoomId] = useState<number | null>(null);
  const [editRoom, setEditRoom] = useState({ roomNumber: '', area: 0, maxOccupants: 2, propertyType: 'INDIVIDUAL_ROOM' as PropertyType });
  const [roomToDelete, setRoomToDelete] = useState<RoomResponse | null>(null);
  const [deletingRoom, setDeletingRoom] = useState(false);

  // 2D: Equipment State
  const [manifest, setManifest] = useState<ManifestItemResponse[]>([]);
  const [assignments, setAssignments] = useState<EquipmentAssignmentResponse[]>([]);

  // Floor navigation & per-room equipment
  const [selectedFloor, setSelectedFloor] = useState(1);
  const [expandedRoomId, setExpandedRoomId] = useState<number | null>(null);
  const [roomAssignForm, setRoomAssignForm] = useState({ manifestId: 0, quantity: 1, source: 'INITIAL_HANDOVER' as EquipmentSource });
  const [editingEquipId, setEditingEquipId] = useState<number | null>(null);
  const [editEquipForm, setEditEquipForm] = useState({ quantity: 1, source: 'INITIAL_HANDOVER' as EquipmentSource });

  // Data Loading
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        if (property.wholeHouse !== null) {
          setWholeHouse(property.wholeHouse);
          setHasRenovation(property.hasRenovation || false);
        }

        const [cats, lines, rms, mft, asg] = await Promise.all([
          catalogService.getRenovationCategories().catch(() => [] as RenovationCategory[]),
          property.hasRenovation ? propertyService.getRenovationLines(property.id).catch(() => [] as RenovationLineResponse[]) : Promise.resolve([] as RenovationLineResponse[]),
          property.wholeHouse === false ? propertyService.getRooms(property.id).catch(() => [] as RoomResponse[]) : Promise.resolve([] as RoomResponse[]),
          propertyService.getManifest(property.id).catch(() => [] as ManifestItemResponse[]),
          propertyService.getAssignedEquipments(property.id).catch(() => [] as EquipmentAssignmentResponse[]),
        ]);

        setCategories(cats);
        setRenoLines(lines);
        if (renovationOnly) setBaseLines(lines); // snapshot đợt cũ
        setRooms(rms);
        setManifest(mft);
        setAssignments(asg);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [property]);

  // Handlers
  const saveOptions = async () => {
    try {
      const p = await propertyService.setOnboardingOptions(property.id, { wholeHouse, hasRenovation });
      setOptionsSaved(true);
      onPropertyUpdated(p);
      // renovationOnly: luôn sang bước 2. Thường: có cải tạo → 2, không → 3
      setSubStep(renovationOnly ? 2 : (p.hasRenovation ? 2 : 3));
    } catch (err) {
      alert('Lỗi lưu tùy chọn');
    }
  };

  const addRenoLine = async () => {
    if (newRenoLine.categoryId === 0 || newRenoLine.cost <= 0) return;
    try {
      const res = await propertyService.addRenovationLine(property.id, newRenoLine);
      setRenoLines(prev => [...prev, res]);
      if (renovationOnly) setCurrentSessionLines(prev => [...prev, res]);
      setNewRenoLine({ categoryId: 0, cost: 0, note: '' });
    } catch (err) { alert('Lỗi thêm cải tạo'); }
  };

  const saveSchedule = async () => {
    if (!schedule.startDate || !schedule.endDate) return;
    try {
      await propertyService.setRenovationSchedule(property.id, schedule);
      setScheduleSaved(true);
    } catch (err: any) { alert(err.response?.data?.message || 'Lỗi lưu lịch'); }
  };

  const updateStructure = async () => {
    try {
      const p = await propertyService.updateStructure(property.id, {
        totalFloor: structure.floorCount,
        totalRooms: structure.floorCount * structure.roomsPerFloor,
      });
      alert('Cập nhật cấu trúc số phòng thành công!');
      onPropertyUpdated(p);
    } catch (err: any) { alert(err.response?.data?.message || 'Lỗi cập nhật cấu trúc'); }
  };

  const refreshEquipmentData = async () => {
    const [mft, asg] = await Promise.all([
      propertyService.getManifest(property.id),
      propertyService.getAssignedEquipments(property.id),
    ]);
    setManifest(mft);
    setAssignments(asg);
  };

  const addAssignmentToRoom = async (roomId: number) => {
    const manifestItem = manifest.find(m => m.id === roomAssignForm.manifestId);
    if (!manifestItem) return;
    try {
      await propertyService.assignEquipment(property.id, {
        catalogId: manifestItem.catalogId,
        quantity: roomAssignForm.quantity,
        status: manifestItem.status,
        source: roomAssignForm.source,
        roomId,
      });
      await refreshEquipmentData();
      setRoomAssignForm({ manifestId: 0, quantity: 1, source: 'INITIAL_HANDOVER' });
    } catch (err: any) { alert(err.response?.data?.error || err.response?.data?.message || 'Lỗi gán thiết bị'); }
  };

  const removeAssignment = async (equipmentId: number) => {
    try {
      await propertyService.unassignEquipment(property.id, equipmentId);
      await refreshEquipmentData();
    } catch (err: any) { alert(err.response?.data?.error || err.response?.data?.message || 'Lỗi xoá thiết bị đã gán'); }
  };

  const startEditEquip = (a: EquipmentAssignmentResponse) => {
    setEditingEquipId(a.id);
    setEditEquipForm({ quantity: a.quantity, source: (a as any).source ?? 'INITIAL_HANDOVER' });
  };

  const saveEditEquipment = async (a: EquipmentAssignmentResponse, roomId: number) => {
    if (editEquipForm.quantity <= 0) return;
    try {
      await propertyService.unassignEquipment(property.id, a.id);
      await propertyService.assignEquipment(property.id, {
        catalogId: a.catalogId,
        quantity: editEquipForm.quantity,
        status: a.status as ManifestEquipmentStatus,
        source: editEquipForm.source,
        roomId,
      });
      await refreshEquipmentData();
      setEditingEquipId(null);
    } catch (err: any) {
      alert(err.response?.data?.error || err.response?.data?.message || 'Không sửa được thiết bị');
    }
  };

  const startEditRoom = (room: RoomResponse) => {
    setEditingRoomId(room.id);
    setEditRoom({
      roomNumber: room.roomNumber,
      area: room.area,
      maxOccupants: room.maxOccupants ?? 2,
      propertyType: room.propertyType,
    });
  };

  const saveEditRoom = async (roomId: number) => {
    if (!editRoom.roomNumber.trim() || editRoom.area <= 0) return;
    try {
      const updated = await propertyService.updateRoom(property.id, roomId, editRoom);
      setRooms(prev => prev.map(r => (r.id === roomId ? updated : r)));
      setEditingRoomId(null);
    } catch (err: any) {
      const d = err.response?.data;
      const msg = d?.fieldErrors
        ? Object.entries(d.fieldErrors).map(([f, m]) => `${f}: ${m}`).join('\n')
        : (d?.error || d?.message || 'Không sửa được phòng — vui lòng thử lại');
      alert(msg);
    }
  };

  const handleDeleteRoom = async () => {
    if (!roomToDelete) return;
    setDeletingRoom(true);
    try {
      await propertyService.deleteRoom(property.id, roomToDelete.id);
      setRooms(prev => prev.filter(r => r.id !== roomToDelete.id));
      setRoomToDelete(null);
    } catch (err: any) {
      setRoomToDelete(null);
      alert(err.response?.data?.error || err.response?.data?.message || 'Không xoá được phòng — vui lòng thử lại');
    } finally {
      setDeletingRoom(false);
    }
  };

  // Validation to enable Next button
  const isManifestFullyAssigned = manifest.length > 0 && manifest.every(m => m.assignedCount === m.quantity);
  // Nhà nguyên căn: BE không cho gán thiết bị vào phòng — chỉ nhà chia phòng mới cần gán đủ
  // Cải tạo lại (renovationOnly): không cần gán thiết bị, chỉ cần tạo đủ phòng
  const isEquipmentComplete = renovationOnly || property.wholeHouse === true || isManifestFullyAssigned;
  const isRoomsComplete = property.wholeHouse === true || rooms.length >= property.totalRooms;
  const isRenoComplete = !property.hasRenovation || renoLines.length > 0;

  const canProceed = optionsSaved && isRoomsComplete && isRenoComplete && isEquipmentComplete;

  if (loading) return <div className="py-20 text-center">Đang tải cấu hình...</div>;

  // Các bước hiển thị trên thanh chỉ báo
  const renoEnabled = optionsSaved ? !!property.hasRenovation : hasRenovation;
  // Cải tạo lại nhà chia phòng vẫn cần bước tạo/đặt tên phòng (khi đổi số tầng/phòng)
  const renoNeedsRooms = renovationOnly && property.wholeHouse === false;
  const stepDefs: { id: 1 | 2 | 3; label: string }[] = [
    { id: 1, label: 'Chọn cấu trúc' },
    ...(renoEnabled || renovationOnly ? [{ id: 2 as const, label: 'Cải tạo' }] : []),
    ...(renovationOnly
      ? (renoNeedsRooms ? [{ id: 3 as const, label: 'Chia phòng' }] : [])
      : [{ id: 3 as const, label: 'Gán thiết bị' }]),
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {stepDefs.map((s, idx) => {
          const done = subStep > s.id;
          const active = subStep === s.id;
          return (
            <div key={s.id} className="flex items-center gap-2">
              {idx > 0 && <div className={`w-8 h-0.5 rounded ${subStep >= s.id ? 'bg-indigo-400' : 'bg-slate-200'}`} />}
              <button
                onClick={() => { if (done) setSubStep(s.id); }}
                disabled={!done && !active}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                    : done
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer'
                      : 'bg-slate-100 text-slate-400 cursor-default'
                }`}
              >
                <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-black ${
                  active ? 'bg-white/25' : done ? 'bg-emerald-200' : 'bg-slate-200'
                }`}>
                  {done ? <Check className="w-3 h-3" /> : idx + 1}
                </span>
                {s.label}
              </button>
            </div>
          );
        })}
      </div>

      {/* ═══ BƯỚC 1: Chọn cấu trúc ═══ */}
      {subStep === 1 && (
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-indigo-500" />
          <h3 className="font-bold text-slate-800">Quyết định cấu trúc</h3>
          {optionsSaved && <Check className="h-4 w-4 text-emerald-500" />}
        </div>
        
        {optionsSaved ? (
          <div className="flex items-center gap-4 text-sm font-semibold">
            <span className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg">{property.wholeHouse ? 'Nhà nguyên căn' : 'Chia phòng cho thuê'}</span>
            <span className="px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg">{property.hasRenovation ? 'Có cải tạo' : 'Không cải tạo'}</span>
            <button onClick={() => setOptionsSaved(false)} className="text-indigo-600 underline text-xs ml-auto">Thay đổi cấu hình</button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setWholeHouse(true)} className={`p-4 rounded-xl border-2 text-left transition ${wholeHouse ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-200'}`}>
                <Home className={`w-6 h-6 mb-2 ${wholeHouse ? 'text-indigo-600' : 'text-slate-400'}`} />
                <p className="font-bold text-slate-900">Cho thuê Nguyên Căn</p>
                <p className="text-xs text-slate-500 mt-1">Khách thuê nguyên 1 nhà, chỉ có 1 giá</p>
              </button>
              <button onClick={() => setWholeHouse(false)} className={`p-4 rounded-xl border-2 text-left transition ${!wholeHouse ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-200'}`}>
                <LayoutGrid className={`w-6 h-6 mb-2 ${!wholeHouse ? 'text-indigo-600' : 'text-slate-400'}`} />
                <p className="font-bold text-slate-900">Chia Phòng cho thuê</p>
                <p className="text-xs text-slate-500 mt-1">Cần tạo {property.totalRooms} phòng nhỏ trong nhà</p>
              </button>
            </div>
            
            <label className="flex items-center gap-3 p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50">
              <input type="checkbox" checked={hasRenovation} onChange={e => setHasRenovation(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-indigo-600" />
              <div>
                <p className="font-bold text-slate-900">Tòa nhà này có cần Cải tạo trước khi cho thuê không?</p>
                <p className="text-xs text-slate-500">Chi phí cải tạo sẽ được cộng vào tính khấu hao cho giá thuê.</p>
              </div>
            </label>

            <button onClick={saveOptions} className="btn-primary w-full rounded-xl py-3 shadow-lg shadow-indigo-500/20">Chốt cấu trúc này</button>
          </div>
        )}
      </section>
      )}

      {/* ═══ BƯỚC 2: Cải tạo ═══ */}
      {subStep === 2 && optionsSaved && (property.hasRenovation || renovationOnly) && (() => {
        const baseCost = baseLines.reduce((s, l) => s + l.cost, 0);
        const newCost  = currentSessionLines.reduce((s, l) => s + l.cost, 0);
        const totalCost = renovationOnly ? (baseCost + newCost) : renoLines.reduce((s, l) => s + l.cost, 0);

        /** Form thêm hạng mục — dùng lại ở cả hai mode */
        const addForm = (
          <div className="flex gap-3 items-end bg-amber-50/60 border border-dashed border-amber-300 rounded-xl p-4">
            <div className="flex-1">
              <span className="mb-1 block text-xs font-bold text-slate-600">Loại hạng mục</span>
              <select value={newRenoLine.categoryId} onChange={e => setNewRenoLine({...newRenoLine, categoryId: Number(e.target.value)})} className="input-field text-sm bg-white">
                <option value={0}>-- Chọn hạng mục --</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="w-48">
              <span className="mb-1 block text-xs font-bold text-slate-600">Chi phí dự kiến</span>
              <div className="relative">
                <input
                  type="text"
                  value={renoCostDisplay}
                  onChange={e => {
                    const raw = e.target.value.replace(/\./g, '').replace(/,/g, '');
                    if (!/^\d*$/.test(raw)) return;
                    setRenoCostDisplay(raw ? Number(raw).toLocaleString('vi-VN') : '');
                    setNewRenoLine(prev => ({ ...prev, cost: Number(raw) || 0 }));
                  }}
                  className="input-field text-sm bg-white pr-8"
                  placeholder="VD: 5.000.000"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium pointer-events-none">đ</span>
              </div>
            </div>
            <button
              onClick={() => { addRenoLine(); setRenoCostDisplay(''); }}
              disabled={newRenoLine.categoryId === 0 || newRenoLine.cost <= 0}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-xl text-sm font-bold h-[42px] whitespace-nowrap transition"
            >
              <Plus className="w-4 h-4" /> Thêm hạng mục
            </button>
          </div>
        );

        return (
        <div className="space-y-5">
          {/* Tổng quan cải tạo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5">
              <p className="text-xs font-bold text-amber-700/70 uppercase tracking-wide mb-1.5">
                {renovationOnly ? 'Tổng tích lũy (tất cả đợt)' : 'Tổng chi phí cải tạo'}
              </p>
              <p className="text-2xl font-black text-amber-600 leading-tight">{formatVND(totalCost)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                {renovationOnly ? 'Hạng mục lần này' : 'Hạng mục cải tạo'}
              </p>
              <p className="text-2xl font-black text-slate-800 leading-tight">
                {renovationOnly ? currentSessionLines.length : renoLines.length}{' '}
                <span className="text-sm font-semibold text-slate-400">hạng mục</span>
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Lịch thi công</p>
              {scheduleSaved && schedule.startDate ? (
                <p className="text-sm font-black text-emerald-600 leading-tight mt-1.5 flex items-center gap-1.5">
                  <Check className="w-4 h-4" /> {fmtDate(schedule.startDate)} → {fmtDate(schedule.endDate)}
                </p>
              ) : (
                <p className="text-sm font-semibold text-slate-400 mt-1.5">Chưa đặt lịch</p>
              )}
            </div>
          </div>

          {renovationOnly ? (
            <>
              {/* ── Lịch sử đợt trước (read-only, thu gọn) ── */}
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <button
                  onClick={() => setShowPrevSession(o => !o)}
                  className="w-full flex items-center gap-3 px-6 py-4 bg-slate-50 border-b border-slate-100 text-left hover:bg-slate-100 transition"
                >
                  {showPrevSession
                    ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                  <Hammer className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="font-bold text-slate-600">Lần cải tạo trước</span>
                  <span className="text-xs text-slate-400 ml-1">({baseLines.length} hạng mục)</span>
                  <span className="ml-auto font-bold text-slate-500">{formatVND(baseCost)}</span>
                </button>
                {showPrevSession && (
                  <div className="p-5">
                    {baseLines.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-4">Chưa có hạng mục nào từ đợt trước</p>
                    ) : (
                      <div className="space-y-1.5">
                        {baseLines.map((line, i) => (
                          <div key={line.id} className="flex justify-between items-center px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                              <span className="font-semibold text-slate-500">{line.categoryName}</span>
                              {line.note && <span className="text-slate-400 text-xs truncate">({line.note})</span>}
                            </div>
                            <span className="font-bold text-slate-400 shrink-0">{formatVND(line.cost)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Hạng mục lần cải tạo này (editable) ── */}
              <section className="rounded-2xl border-2 border-amber-300 bg-white overflow-hidden">
                <div className="border-b border-amber-100 bg-amber-50 px-6 py-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <Hammer className="h-5 w-5 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-slate-800">Hạng mục lần cải tạo này</h3>
                    <p className="text-xs text-slate-400">Thêm các đầu việc cho đợt cải tạo mới này</p>
                  </div>
                  <span className="font-black text-amber-700 shrink-0">{formatVND(newCost)}</span>
                </div>
                <div className="p-6 space-y-4">
                  {currentSessionLines.length === 0 ? (
                    <div className="text-center py-4 text-slate-400">
                      <Hammer className="w-8 h-8 mx-auto mb-2 opacity-25" />
                      <p className="text-sm">Chưa có hạng mục mới — thêm bên dưới</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {currentSessionLines.map((line, i) => (
                        <div key={line.id} className="flex justify-between items-center px-4 py-2.5 rounded-xl border border-amber-200 bg-amber-50/40 text-sm">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                            <span className="font-semibold text-slate-700">{line.categoryName}</span>
                            {line.note && <span className="text-slate-400 text-xs truncate">({line.note})</span>}
                          </div>
                          <span className="font-bold text-amber-600 shrink-0">{formatVND(line.cost)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-sm">
                        <span className="font-bold text-amber-800">Tổng lần này</span>
                        <span className="font-black text-amber-700">{formatVND(newCost)}</span>
                      </div>
                    </div>
                  )}
                  {addForm}
                </div>
              </section>
            </>
          ) : (
          /* ── Flat list (chế độ cài lần đầu) ── */
          <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <Hammer className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-800">Hạng mục cải tạo</h3>
                <p className="text-xs text-slate-400">Liệt kê các đầu việc cải tạo và chi phí dự kiến của từng việc</p>
              </div>
              {isRenoComplete && <Check className="h-5 w-5 text-emerald-500 shrink-0" />}
            </div>
            <div className="p-6 space-y-4">
              {renoLines.length === 0 ? (
                <div className="text-center py-6 text-slate-400">
                  <Hammer className="w-8 h-8 mx-auto mb-2 opacity-25" />
                  <p className="text-sm">Chưa có hạng mục nào — thêm hạng mục đầu tiên bên dưới</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {renoLines.map((line, i) => (
                    <div key={line.id} className="flex justify-between items-center px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                        <span className="font-semibold text-slate-700">{line.categoryName}</span>
                        {line.note && <span className="text-slate-400 text-xs truncate">({line.note})</span>}
                      </div>
                      <span className="font-bold text-amber-600 shrink-0">{formatVND(line.cost)}</span>
                    </div>
                  ))}
                </div>
              )}
              {addForm}
            </div>
          </section>
          )}

          {/* Card 2: Lịch thi công */}
          <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                <CalendarDays className="h-5 w-5 text-emerald-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-slate-800">Lịch thi công</h3>
                <p className="text-xs text-slate-400">Bắt buộc phải có lịch trước khi gửi Host phê duyệt</p>
              </div>
              {scheduleSaved && <Check className="h-5 w-5 text-emerald-500 shrink-0" />}
            </div>
            <div className="p-6 flex gap-4 items-end">
              <label className="block flex-1">
                <span className="mb-1 block text-xs font-bold text-slate-700">Ngày bắt đầu</span>
                <input
                  type="date"
                  min={TODAY_STR}
                  value={schedule.startDate}
                  onChange={e => {
                    const startDate = e.target.value;
                    setSchedule(prev => ({
                      ...prev,
                      startDate,
                      // Ngày kết thúc vượt 50 năm theo ngày bắt đầu mới → cắt lại
                      endDate: prev.endDate && startDate && prev.endDate > addYearsStr(startDate, 50)
                        ? addYearsStr(startDate, 50) : prev.endDate,
                    }));
                    setScheduleSaved(false);
                  }}
                  className="input-field text-sm"
                />
              </label>
              <label className="block flex-1">
                <span className="mb-1 block text-xs font-bold text-slate-700">Ngày kết thúc dự kiến</span>
                <input
                  type="date"
                  min={schedule.startDate || TODAY_STR}
                  max={addYearsStr(schedule.startDate || TODAY_STR, 50)}
                  disabled={!schedule.startDate}
                  value={schedule.endDate}
                  onChange={e => { setSchedule({...schedule, endDate: e.target.value}); setScheduleSaved(false); }}
                  className="input-field text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </label>
              <button
                onClick={saveSchedule}
                disabled={!schedule.startDate || !schedule.endDate}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-xl text-sm font-bold h-[42px]"
              >
                {scheduleSaved ? 'Đã lưu ✓' : 'Lưu lịch'}
              </button>
            </div>
          </section>

          {/* Card 3: Thay đổi cấu trúc sau cải tạo */}
          <section className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={showStructureUpdate} onChange={e => setShowStructureUpdate(e.target.checked)} className="mt-0.5 w-4 h-4 rounded border-slate-300 text-amber-500" />
              <div>
                <p className="font-bold text-slate-800 text-sm">Cải tạo có làm thay đổi số tầng / số phòng không?</p>
                <p className="text-xs text-slate-500 mt-0.5">Nếu sau cải tạo số tầng hoặc số phòng thay đổi, cập nhật tại đây để bước Gán thiết bị chia phòng đúng.</p>
              </div>
            </label>
            {showStructureUpdate && (
              <div className="flex gap-4 items-end mt-4 pl-7">
                <label className="block w-36">
                  <span className="mb-1 block text-xs font-bold text-slate-600">Số tầng mới</span>
                  <input type="number" min={1} value={structure.floorCount} onChange={e => setStructure({...structure, floorCount: Number(e.target.value)})} className="input-field text-sm bg-white" />
                </label>
                <label className="block w-36">
                  <span className="mb-1 block text-xs font-bold text-slate-600">Phòng / Tầng mới</span>
                  <input type="number" min={1} value={structure.roomsPerFloor} onChange={e => setStructure({...structure, roomsPerFloor: Number(e.target.value)})} className="input-field text-sm bg-white" />
                </label>
                <div className="text-xs text-slate-500 font-semibold pb-3">
                  = {structure.floorCount * structure.roomsPerFloor} phòng
                </div>
                <button onClick={updateStructure} className="bg-amber-500 hover:bg-amber-600 text-white px-5 py-2 rounded-xl text-sm font-bold h-[42px] ml-auto">Cập nhật cấu trúc</button>
              </div>
            )}
          </section>
        </div>
      );
      })()}

      {/* ═══ BƯỚC 3: Chia phòng theo tầng & Gán thiết bị ═══ */}
      {subStep === 3 && optionsSaved && property.wholeHouse === false && (() => {
        const totalFloors = property.totalFloor ?? property.floorCount ?? 1;
        const expectedPerFloor = Math.max(1, Math.ceil(property.totalRooms / totalFloors));
        const getRoomsOnFloor = (f: number) => rooms.slice((f - 1) * expectedPerFloor, f * expectedPerFloor);
        const floorRooms = getRoomsOnFloor(selectedFloor);
        const isFloorFull = floorRooms.length >= expectedPerFloor;
        const suggestNumber = () => `P.${selectedFloor}${String(floorRooms.length + 1).padStart(2, '0')}`;

        return (
          <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            {/* Header */}
            <div className="border-b border-slate-100 bg-slate-50 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DoorOpen className="h-5 w-5 text-indigo-500" />
                <h3 className="font-bold text-slate-800">{renovationOnly ? 'Chia phòng & đặt tên phòng' : 'Chia Phòng & Gán Thiết bị'}</h3>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isRoomsComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                  {rooms.length}/{property.totalRooms} phòng
                </span>
              </div>
              {!renovationOnly && (
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isManifestFullyAssigned ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  Thiết bị: {manifest.filter(m => m.assignedCount === m.quantity).length}/{manifest.length} loại xong
                </span>
              )}
            </div>

            {/* Floor tabs */}
            <div className="flex gap-2 px-6 pt-4 overflow-x-auto pb-1">
              {Array.from({ length: totalFloors }, (_, i) => i + 1).map(floor => {
                const flr = getRoomsOnFloor(floor);
                const done = flr.length >= expectedPerFloor;
                return (
                  <button
                    key={floor}
                    onClick={() => setSelectedFloor(floor)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all border ${
                      selectedFloor === floor
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-200'
                        : done
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Tầng {floor}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${selectedFloor === floor ? 'bg-white/20 text-white' : done ? 'bg-emerald-200 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                      {flr.length}/{expectedPerFloor}
                    </span>
                    {done && selectedFloor !== floor && <Check className="w-3 h-3" />}
                  </button>
                );
              })}
            </div>

            {/* Floor content */}
            <div className="p-6 space-y-4">
              {/* Add room form */}
              {!isFloorFull && (
                <div className="flex flex-wrap gap-3 items-end bg-indigo-50/50 border border-indigo-100 rounded-xl p-4">
                  <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                    <span className="text-xs font-semibold text-slate-600">Mã phòng</span>
                    <input
                      placeholder={suggestNumber()}
                      value={newRoom.roomNumber}
                      onChange={e => setNewRoom({ ...newRoom, roomNumber: e.target.value })}
                      className="input-field text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1 w-32">
                    <span className="text-xs font-semibold text-slate-600">Diện tích (m²)</span>
                    <input type="number" placeholder="25" value={newRoom.area || ''} onChange={e => setNewRoom({ ...newRoom, area: Number(e.target.value) })} className="input-field text-sm" />
                  </div>
                  <div className="flex flex-col gap-1 w-32">
                    <span className="text-xs font-semibold text-slate-600">Sức chứa</span>
                    <input type="number" min={1} value={newRoom.maxOccupants} onChange={e => setNewRoom({ ...newRoom, maxOccupants: Number(e.target.value) })} className="input-field text-sm" />
                  </div>
                  <button
                    onClick={async () => {
                      const roomNum = newRoom.roomNumber || suggestNumber();
                      if (!roomNum || newRoom.area <= 0) return;
                      try {
                        const res = await propertyService.addRoom(property.id, { ...newRoom, roomNumber: roomNum });
                        setRooms(prev => [...prev, res]);
                        setNewRoom(prev => ({ ...prev, roomNumber: '', area: 0 }));
                        setExpandedRoomId(res.id);
                      } catch (err: any) {
                        const d = err.response?.data;
                        const extractErrors = (arr: any[]) => arr.map((v: any) => v.defaultMessage ?? v.message ?? v).join('; ');
                        const msg = (typeof d === 'string' ? d.slice(0, 300) : null)
                          ?? d?.message
                          ?? (Array.isArray(d?.errors) ? extractErrors(d.errors) : null)
                          ?? (Array.isArray(d?.violations) ? extractErrors(d.violations) : null)
                          ?? d?.detail ?? d?.error
                          ?? `Lỗi thêm phòng (HTTP ${err.response?.status ?? 'unknown'})`;
                        console.error('[addRoom] response body:', JSON.stringify(d));
                        alert(msg);
                      }
                    }}
                    className="h-[42px] px-5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-sm font-bold transition-all self-end"
                  >
                    + Thêm phòng
                  </button>
                </div>
              )}
              {isFloorFull && !isRoomsComplete && (
                <p className="text-xs text-slate-400 text-center py-1">
                  Tầng {selectedFloor} đã đủ {expectedPerFloor} phòng — chuyển sang tầng tiếp theo
                </p>
              )}

              {/* Room cards */}
              {floorRooms.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <DoorOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Chưa có phòng nào trên tầng {selectedFloor}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {floorRooms.map(room => {
                    const roomAssigns = assignments.filter(a => a.roomId === room.id);
                    const unassigned = manifest.filter(m => m.assignedCount < m.quantity);
                    const isExpanded = !renovationOnly && expandedRoomId === room.id;
                    return (
                      <div key={room.id} className={`rounded-xl border-2 transition-all ${isExpanded ? 'border-indigo-300 shadow-sm' : 'border-slate-200 hover:border-indigo-200'}`}>
                        {/* Room header */}
                        {renovationOnly ? (
                          editingRoomId === room.id ? (
                            /* Inline edit form (chờ BE endpoint PUT — xem note mục 11) */
                            <div className="flex flex-wrap gap-2 items-end px-4 py-3 bg-indigo-50/40 rounded-xl">
                              <div className="flex flex-col gap-1 flex-1 min-w-[110px]">
                                <span className="text-xs font-semibold text-slate-600">Mã phòng</span>
                                <input value={editRoom.roomNumber} onChange={e => setEditRoom({ ...editRoom, roomNumber: e.target.value })} className="input-field text-sm" />
                              </div>
                              <div className="flex flex-col gap-1 w-24">
                                <span className="text-xs font-semibold text-slate-600">DT (m²)</span>
                                <input type="number" value={editRoom.area || ''} onChange={e => setEditRoom({ ...editRoom, area: Number(e.target.value) })} className="input-field text-sm" />
                              </div>
                              <div className="flex flex-col gap-1 w-24">
                                <span className="text-xs font-semibold text-slate-600">Sức chứa</span>
                                <input type="number" min={1} value={editRoom.maxOccupants} onChange={e => setEditRoom({ ...editRoom, maxOccupants: Number(e.target.value) })} className="input-field text-sm" />
                              </div>
                              <button onClick={() => saveEditRoom(room.id)} className="h-[42px] px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold flex items-center gap-1.5">
                                <Check className="w-4 h-4" /> Lưu
                              </button>
                              <button onClick={() => setEditingRoomId(null)} className="h-[42px] px-3 text-slate-500 hover:bg-slate-100 rounded-xl text-sm font-bold">
                                Huỷ
                              </button>
                            </div>
                          ) : (
                            <div className="w-full flex items-center gap-3 px-4 py-3">
                              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                                <DoorOpen className="w-4 h-4 text-indigo-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-900 text-sm">{room.roomNumber}</p>
                                <p className="text-xs text-slate-400">{room.area} m² · {room.maxOccupants} người</p>
                              </div>
                              <button onClick={() => startEditRoom(room)} title="Sửa phòng"
                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => setRoomToDelete(room)} title="Xoá phòng"
                                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )
                        ) : (
                          <button
                            className="w-full flex items-center gap-3 px-4 py-3 text-left"
                            onClick={() => setExpandedRoomId(isExpanded ? null : room.id)}
                          >
                            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                              <DoorOpen className="w-4 h-4 text-indigo-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-slate-900 text-sm">{room.roomNumber}</p>
                              <p className="text-xs text-slate-400">{room.area} m² · {room.maxOccupants} người</p>
                            </div>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${roomAssigns.length > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400'}`}>
                              {roomAssigns.length} thiết bị
                            </span>
                            {isExpanded
                              ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                              : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                          </button>
                        )}

                        {/* Expanded: equipment */}
                        {isExpanded && (
                          <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-4 space-y-3">
                            {/* Assigned list */}
                            {roomAssigns.length > 0 && (
                              <div className="space-y-1.5">
                                {roomAssigns.map(a => (
                                  <div key={a.id} className="bg-white border border-slate-200 rounded-lg text-sm overflow-hidden">
                                    {editingEquipId === a.id ? (
                                      /* ── Inline edit form ── */
                                      <div className="flex flex-wrap gap-2 items-center px-3 py-2">
                                        <span className="font-semibold text-slate-700 shrink-0">{a.catalogName}</span>
                                        <input
                                          type="number" min={1} value={editEquipForm.quantity}
                                          onChange={e => setEditEquipForm(f => ({ ...f, quantity: Number(e.target.value) }))}
                                          className="input-field text-sm w-20"
                                        />
                                        <select
                                          value={editEquipForm.source}
                                          onChange={e => setEditEquipForm(f => ({ ...f, source: e.target.value as EquipmentSource }))}
                                          className="input-field text-sm w-36"
                                        >
                                          <option value="INITIAL_HANDOVER">Có sẵn</option>
                                          <option value="PURCHASED">Mua mới</option>
                                        </select>
                                        <button
                                          onClick={() => saveEditEquipment(a, room.id)}
                                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors"
                                        >Lưu</button>
                                        <button
                                          onClick={() => setEditingEquipId(null)}
                                          className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-colors"
                                        >Huỷ</button>
                                      </div>
                                    ) : (
                                      /* ── Normal row ── */
                                      <div className="flex items-center justify-between px-3 py-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="font-semibold text-slate-700 truncate">{a.catalogName}</span>
                                          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 shrink-0">x{a.quantity}</span>
                                          <span className="text-xs text-slate-400 shrink-0">{a.status === 'NEW' ? 'Mới' : 'Tốt'}</span>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                          <button
                                            onClick={() => startEditEquip(a)}
                                            title="Sửa số lượng / nguồn"
                                            className="p-1 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-md transition-colors"
                                          ><Pencil className="w-3.5 h-3.5" /></button>
                                          <button
                                            onClick={() => removeAssignment(a.id)}
                                            title="Xoá thiết bị đã gán"
                                            className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-colors"
                                          ><X className="w-4 h-4" /></button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Quick assign form */}
                            {unassigned.length > 0 ? (
                              <div className="flex flex-wrap gap-2 items-end pt-1">
                                <div className="flex-1 min-w-[160px]">
                                  <span className="mb-1 block text-xs font-semibold text-slate-500">Thiết bị</span>
                                  <select
                                    value={roomAssignForm.manifestId}
                                    onChange={e => setRoomAssignForm(f => ({ ...f, manifestId: Number(e.target.value) }))}
                                    className="input-field text-sm"
                                  >
                                    <option value={0}>-- Chọn --</option>
                                    {unassigned.map(m => (
                                      <option key={m.id} value={m.id}>{m.catalogName} · {m.status === 'NEW' ? 'Mới' : 'Đang dùng tốt'} (còn {m.quantity - m.assignedCount})</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="w-20">
                                  <span className="mb-1 block text-xs font-semibold text-slate-500">Số lượng</span>
                                  <input
                                    type="number" min={1} value={roomAssignForm.quantity}
                                    onChange={e => setRoomAssignForm(f => ({ ...f, quantity: Number(e.target.value) }))}
                                    className="input-field text-sm"
                                  />
                                </div>
                                <div className="w-40">
                                  <span className="mb-1 block text-xs font-semibold text-slate-500">Nguồn</span>
                                  <select
                                    value={roomAssignForm.source}
                                    onChange={e => setRoomAssignForm(f => ({ ...f, source: e.target.value as EquipmentSource }))}
                                    className="input-field text-sm"
                                  >
                                    <option value="INITIAL_HANDOVER">Có sẵn</option>
                                    <option value="PURCHASED">Mua mới</option>
                                  </select>
                                </div>
                                <button
                                  onClick={() => addAssignmentToRoom(room.id)}
                                  className="h-[42px] px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-colors self-end"
                                >
                                  Gán
                                </button>
                              </div>
                            ) : (
                              <p className="text-xs text-emerald-600 font-semibold text-center py-1">
                                ✓ Tất cả thiết bị đã được gán xong
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        );
      })()}

      {/* ═══ BƯỚC 3 (nhà nguyên căn): Thiết bị bàn giao — không cần phân bổ vào phòng ═══ */}
      {subStep === 3 && optionsSaved && property.wholeHouse === true && (
        <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-indigo-500" />
              <h3 className="font-bold text-slate-800">Thiết bị bàn giao</h3>
              <Check className="h-4 w-4 text-emerald-500" />
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
              Nhà nguyên căn — không cần phân bổ vào phòng
            </span>
          </div>
          <div className="p-6">
            {manifest.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">Chưa khai báo thiết bị nào ở bước trước</p>
            ) : (
              <div className="space-y-2">
                {manifest.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-3 rounded-xl border bg-slate-50 border-slate-200 text-sm">
                    <span className="font-semibold text-slate-700">{m.catalogName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">{m.status === 'NEW' ? 'Mới 100%' : 'Đang dùng tốt'}</span>
                      <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">×{m.quantity}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Navigation theo từng bước */}
      <div className="mt-8 flex justify-between pt-4 border-t border-slate-200">
        {subStep === 1 ? (
          <button onClick={onBack} className="rounded-xl px-6 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100">
            ← Quay lại
          </button>
        ) : (
          <button
            onClick={() => setSubStep(subStep === 3 && (property.hasRenovation || renovationOnly) ? 2 : 1)}
            className="rounded-xl px-6 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100"
          >
            ← Quay lại
          </button>
        )}

        <div className="flex items-center">
          {subStep === 1 && (
            <>
              {!optionsSaved && (
                <span className="text-sm font-semibold text-amber-600 mr-4 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> Vui lòng chốt cấu trúc trước
                </span>
              )}
              <button
                onClick={() => setSubStep(renovationOnly ? 2 : (property.hasRenovation ? 2 : 3))}
                disabled={!optionsSaved}
                className="btn-primary rounded-xl px-8 py-3 text-sm font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Tiếp tục →
              </button>
            </>
          )}

          {subStep === 2 && (
            <>
              {!isRenoComplete && (
                <span className="text-sm font-semibold text-amber-600 mr-4 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> Thêm ít nhất 1 hạng mục cải tạo
                </span>
              )}
              <button
                onClick={renovationOnly ? (renoNeedsRooms ? () => setSubStep(3) : onNext) : () => setSubStep(3)}
                disabled={!isRenoComplete}
                className="btn-primary rounded-xl px-8 py-3 text-sm font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {renovationOnly ? (renoNeedsRooms ? 'Tiếp tục: Chia phòng →' : nextLabel) : 'Tiếp tục: Gán thiết bị →'}
              </button>
            </>
          )}

          {subStep === 3 && (
            <>
              {!canProceed && (
                <span className="text-sm font-semibold text-amber-600 mr-4 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> Vui lòng hoàn thành tất cả cấu hình
                </span>
              )}
              <button
                onClick={onNext}
                disabled={!canProceed}
                className="btn-primary rounded-xl px-8 py-3 text-sm font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {nextLabel}
              </button>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!roomToDelete}
        tone="danger"
        title="Xoá phòng này?"
        message={roomToDelete && (
          <>
            Xoá phòng <b className="text-slate-700">{roomToDelete.roomNumber}</b> khỏi tòa nhà?
            Hành động này không thể hoàn tác.
          </>
        )}
        confirmText="Xoá phòng"
        loading={deletingRoom}
        onConfirm={handleDeleteRoom}
        onCancel={() => setRoomToDelete(null)}
      />
    </div>
  );
};
