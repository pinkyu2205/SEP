import { useState, useEffect } from 'react';
import {
  Home, LayoutGrid, Hammer, DoorOpen, Package,
  Check, AlertCircle, Settings2, ChevronDown, ChevronRight, Layers, X,
  CalendarDays, Plus, Trash2
} from 'lucide-react';
import type {
  PropertyResponse, RenovationCategory, RenovationLineResponse,
  RoomResponse, ManifestItemResponse, EquipmentAssignmentResponse
} from '../../../../types/api.types';
import { propertyService } from '../../../../services/property.service';
import { catalogService } from '../../../../services/catalog.service';
import type { EquipmentSource, EquipmentCatalogItem } from '../../../../types/api.types';

const formatVND = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
const fmtDate = (d: string) => (d ? d.split('-').reverse().join('/') : '');

interface StepOnboardingOptionsProps {
  property: PropertyResponse;
  onNext: () => void;
  onBack: () => void;
  onPropertyUpdated: (p: PropertyResponse) => void;
  nextLabel?: string;
}

export const StepOnboardingOptions = ({ property, onNext, onBack, onPropertyUpdated, nextLabel = 'Tiếp tục Xem giá →' }: StepOnboardingOptionsProps) => {
  const [loading, setLoading] = useState(false);

  // Sub-step nội bộ: 1 = Chọn cấu trúc, 2 = Cải tạo (chỉ khi có cải tạo), 3 = Gán thiết bị
  const [subStep, setSubStep] = useState<1 | 2 | 3>(1);

  // 2A: Options State
  const [wholeHouse, setWholeHouse] = useState<boolean>(true);
  const [hasRenovation, setHasRenovation] = useState<boolean>(false);
  const [optionsSaved, setOptionsSaved] = useState<boolean>(property.wholeHouse !== null);

  // 2B: Renovation State
  const [categories, setCategories] = useState<RenovationCategory[]>([]);
  const [catalogs, setCatalogs] = useState<EquipmentCatalogItem[]>([]);
  const [renoLines, setRenoLines] = useState<RenovationLineResponse[]>([]);
  const [newRenoLine, setNewRenoLine] = useState({ categoryId: 0, cost: 0, note: '' });
  const [renoCostDisplay, setRenoCostDisplay] = useState('');
  const [schedule, setSchedule] = useState({ startDate: '', endDate: '' });
  const [scheduleSaved, setScheduleSaved] = useState(false);
  
  // 2B.1: Structure Update
  const [showStructureUpdate, setShowStructureUpdate] = useState(false);
  const [structure, setStructure] = useState({ floorCount: property.floorCount || 1, roomsPerFloor: property.roomsPerFloor || 1 });
  
  // 2B.2: Purchase New Equipment (unitPrice = đơn giá, thành tiền = quantity × unitPrice)
  type PurchaseRow = { catalogId: number; quantity: number; unitPrice: number; unitPriceDisplay: string };
  const [purchaseRows, setPurchaseRows] = useState<PurchaseRow[]>([{ catalogId: 0, quantity: 1, unitPrice: 0, unitPriceDisplay: '' }]);
  const [isSavingPurchase, setIsSavingPurchase] = useState(false);

  // 2C: Rooms State
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [newRoom, setNewRoom] = useState({ roomNumber: '', area: 0, maxOccupants: 2, propertyType: 'INDIVIDUAL_ROOM' as const });

  // 2D: Equipment State
  const [manifest, setManifest] = useState<ManifestItemResponse[]>([]);
  const [assignments, setAssignments] = useState<EquipmentAssignmentResponse[]>([]);

  // Floor navigation & per-room equipment
  const [selectedFloor, setSelectedFloor] = useState(1);
  const [expandedRoomId, setExpandedRoomId] = useState<number | null>(null);
  const [roomAssignForm, setRoomAssignForm] = useState({ manifestId: 0, quantity: 1, source: 'INITIAL_HANDOVER' as EquipmentSource });

  // Data Loading
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        if (property.wholeHouse !== null) {
          setWholeHouse(property.wholeHouse);
          setHasRenovation(property.hasRenovation || false);
        }

        const [cats, eqCats, lines, rms, mft, asg] = await Promise.all([
          catalogService.getRenovationCategories(),
          catalogService.getEquipmentCatalog(),
          property.hasRenovation ? propertyService.getRenovationLines(property.id) : Promise.resolve([]),
          property.wholeHouse === false ? propertyService.getRooms(property.id) : Promise.resolve([]),
          propertyService.getManifest(property.id),
          propertyService.getAssignedEquipments(property.id),
        ]);

        setCategories(cats);
        setCatalogs(eqCats);
        setRenoLines(lines);
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
      // Có cải tạo → sang bước 2, không cải tạo → nhảy thẳng bước 3
      setSubStep(p.hasRenovation ? 2 : 3);
    } catch (err) {
      alert('Lỗi lưu tùy chọn');
    }
  };

  const addRenoLine = async () => {
    if (newRenoLine.categoryId === 0 || newRenoLine.cost <= 0) return;
    try {
      const res = await propertyService.addRenovationLine(property.id, newRenoLine);
      setRenoLines([...renoLines, res]);
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

  const purchaseAllEquipment = async () => {
    const validRows = purchaseRows.filter(r => r.catalogId > 0 && r.quantity > 0 && r.unitPrice > 0);
    if (validRows.length === 0) return alert('Vui lòng điền đầy đủ thông tin ít nhất 1 thiết bị');

    // BE chỉ cho ghi chi phí (renovation line) khi tòa nhà có cải tạo
    const canRecordCost = !!property.hasRenovation;
    let renoCatId: number | undefined;
    if (canRecordCost) {
      const eqCat = categories.find(c => c.code === 'EQUIPMENT' || c.name.toLowerCase().includes('thiết bị'));
      renoCatId = eqCat ? eqCat.id : categories[0]?.id;
      if (!renoCatId) return alert('Chưa có danh mục thiết bị trong hệ thống');
    }

    setIsSavingPurchase(true);
    try {
      const updatedManifestItems = manifest.map(m => ({ catalogId: m.catalogId, quantity: m.quantity, status: m.status }));
      const newRenoResults: RenovationLineResponse[] = [];

      for (const row of validRows) {
        if (canRecordCost && renoCatId) {
          const catalogName = catalogs.find(c => c.id === row.catalogId)?.name || 'Thiết bị';
          const renoRes = await propertyService.addRenovationLine(property.id, {
            categoryId: renoCatId,
            cost: row.unitPrice * row.quantity,
            note: `Mua thêm ${row.quantity} ${catalogName} (đơn giá ${row.unitPrice.toLocaleString('vi-VN')}đ)`
          });
          newRenoResults.push(renoRes);
        }

        const existingIdx = updatedManifestItems.findIndex(m => m.catalogId === row.catalogId && m.status === 'NEW');
        if (existingIdx >= 0) updatedManifestItems[existingIdx].quantity += row.quantity;
        else updatedManifestItems.push({ catalogId: row.catalogId, quantity: row.quantity, status: 'NEW' });
      }

      await propertyService.putManifest(property.id, { items: updatedManifestItems });
      const mft = await propertyService.getManifest(property.id);
      setManifest(mft);
      setRenoLines(prev => [...prev, ...newRenoResults]);
      setPurchaseRows([{ catalogId: 0, quantity: 1, unitPrice: 0, unitPriceDisplay: '' }]);
    } catch (err) {
      alert('Lỗi lưu thiết bị mua mới');
    } finally {
      setIsSavingPurchase(false);
    }
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
    } catch (err: any) { alert(err.response?.data?.message || 'Lỗi gán thiết bị'); }
  };

  const removeAssignment = async (equipmentId: number) => {
    try {
      await propertyService.unassignEquipment(property.id, equipmentId);
      await refreshEquipmentData();
    } catch (err: any) { alert(err.response?.data?.message || 'Lỗi xoá thiết bị đã gán'); }
  };

  // Validation to enable Next button
  const isManifestFullyAssigned = manifest.length > 0 && manifest.every(m => m.assignedCount === m.quantity);
  // Nhà nguyên căn: BE không cho gán thiết bị vào phòng — chỉ nhà chia phòng mới cần gán đủ
  const isEquipmentComplete = property.wholeHouse === true || isManifestFullyAssigned;
  const isRoomsComplete = property.wholeHouse === true || rooms.length === property.totalRooms;
  const isRenoComplete = !property.hasRenovation || renoLines.length > 0;

  const canProceed = optionsSaved && isRoomsComplete && isRenoComplete && isEquipmentComplete;

  if (loading) return <div className="py-20 text-center">Đang tải cấu hình...</div>;

  // Các bước hiển thị trên thanh chỉ báo (ẩn bước Cải tạo nếu không chọn cải tạo)
  const renoEnabled = optionsSaved ? !!property.hasRenovation : hasRenovation;
  const stepDefs: { id: 1 | 2 | 3; label: string }[] = [
    { id: 1, label: 'Chọn cấu trúc' },
    ...(renoEnabled ? [{ id: 2 as const, label: 'Cải tạo' }] : []),
    { id: 3, label: 'Gán thiết bị' },
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

      {/* ═══ BƯỚC 2: Cải tạo (chỉ khi chọn có cải tạo) ═══ */}
      {subStep === 2 && optionsSaved && property.hasRenovation && (
        <div className="space-y-5">
          {/* Tổng quan cải tạo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-5">
              <p className="text-xs font-bold text-amber-700/70 uppercase tracking-wide mb-1.5">Tổng chi phí cải tạo</p>
              <p className="text-2xl font-black text-amber-600 leading-tight">
                {formatVND(renoLines.reduce((s, l) => s + l.cost, 0))}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">Hạng mục cải tạo</p>
              <p className="text-2xl font-black text-slate-800 leading-tight">
                {renoLines.length} <span className="text-sm font-semibold text-slate-400">hạng mục</span>
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

          {/* Card 1: Hạng mục cải tạo */}
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

              {/* Form thêm hạng mục */}
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
            </div>
          </section>

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
                <input type="date" value={schedule.startDate} onChange={e => { setSchedule({...schedule, startDate: e.target.value}); setScheduleSaved(false); }} className="input-field text-sm" />
              </label>
              <label className="block flex-1">
                <span className="mb-1 block text-xs font-bold text-slate-700">Ngày kết thúc dự kiến</span>
                <input type="date" value={schedule.endDate} onChange={e => { setSchedule({...schedule, endDate: e.target.value}); setScheduleSaved(false); }} className="input-field text-sm" />
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
      )}

      {/* ═══ BƯỚC 3: Mua thêm thiết bị mới (nhập kho trước khi gán) ═══ */}
      {subStep === 3 && optionsSaved && (
        <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
              <Package className="h-5 w-5 text-indigo-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-slate-800">Mua thêm thiết bị mới</h3>
              <p className="text-xs text-slate-400">
                Nhập vào kho để gán bên dưới · thành tiền = SL × đơn giá, tính chung vào tổng chi phí
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 shrink-0">Tùy chọn</span>
          </div>
          <div className="p-5 space-y-2">
            {/* Rows */}
            {purchaseRows.map((row, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={row.catalogId}
                  onChange={e => setPurchaseRows(prev => prev.map((r, i) => i === idx ? { ...r, catalogId: Number(e.target.value) } : r))}
                  className="w-72 bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  <option value={0}>-- Chọn thiết bị --</option>
                  {catalogs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input
                  type="number" min={1} value={row.quantity}
                  title="Số lượng"
                  onChange={e => setPurchaseRows(prev => prev.map((r, i) => i === idx ? { ...r, quantity: Number(e.target.value) } : r))}
                  className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <div className="relative w-36">
                  <input
                    type="text"
                    value={row.unitPriceDisplay}
                    onChange={e => {
                      const raw = e.target.value.replace(/\./g, '').replace(/,/g, '');
                      if (!/^\d*$/.test(raw)) return;
                      setPurchaseRows(prev => prev.map((r, i) => i === idx ? { ...r, unitPrice: Number(raw) || 0, unitPriceDisplay: raw ? Number(raw).toLocaleString('vi-VN') : '' } : r));
                    }}
                    placeholder="Đơn giá"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 pr-6 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">đ</span>
                </div>
                <span className="w-32 text-right text-sm font-bold text-indigo-600 shrink-0">
                  {row.unitPrice > 0 ? `= ${(row.unitPrice * row.quantity).toLocaleString('vi-VN')}đ` : ''}
                </span>
                <button
                  onClick={() => setPurchaseRows(prev => prev.length === 1 ? [{ catalogId: 0, quantity: 1, unitPrice: 0, unitPriceDisplay: '' }] : prev.filter((_, i) => i !== idx))}
                  className="flex items-center justify-center w-8 h-8 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {/* Add row + Save */}
            <div className="flex items-center justify-between pt-1.5">
              <button
                onClick={() => setPurchaseRows(prev => [...prev, { catalogId: 0, quantity: 1, unitPrice: 0, unitPriceDisplay: '' }])}
                className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition"
              >
                <Plus className="w-4 h-4" /> Thêm dòng
              </button>
              <button
                onClick={purchaseAllEquipment}
                disabled={isSavingPurchase || !purchaseRows.some(r => r.catalogId > 0)}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-bold"
              >
                {isSavingPurchase ? 'Đang lưu...' : 'Lưu thiết bị'}
              </button>
            </div>
          </div>
        </section>
      )}

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
                <h3 className="font-bold text-slate-800">Chia Phòng & Gán Thiết bị</h3>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isRoomsComplete ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                  {rooms.length}/{property.totalRooms} phòng
                </span>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isManifestFullyAssigned ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                Thiết bị: {manifest.filter(m => m.assignedCount === m.quantity).length}/{manifest.length} loại xong
              </span>
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
                      } catch (err: any) { alert(err.response?.data?.message || 'Lỗi thêm phòng'); }
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
                    const isExpanded = expandedRoomId === room.id;
                    return (
                      <div key={room.id} className={`rounded-xl border-2 transition-all ${isExpanded ? 'border-indigo-300 shadow-sm' : 'border-slate-200 hover:border-indigo-200'}`}>
                        {/* Room header */}
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

                        {/* Expanded: equipment */}
                        {isExpanded && (
                          <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-4 space-y-3">
                            {/* Assigned list */}
                            {roomAssigns.length > 0 && (
                              <div className="space-y-1.5">
                                {roomAssigns.map(a => (
                                  <div key={a.id} className="flex items-center justify-between px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm">
                                    <span className="font-semibold text-slate-700">{a.catalogName}</span>
                                    <button
                                      onClick={() => removeAssignment(a.id)}
                                      title="Xoá thiết bị đã gán"
                                      className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-colors"
                                    >
                                      <X className="w-4 h-4" />
                                    </button>
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
            onClick={() => setSubStep(subStep === 3 && property.hasRenovation ? 2 : 1)}
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
                onClick={() => setSubStep(property.hasRenovation ? 2 : 3)}
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
                onClick={() => setSubStep(3)}
                disabled={!isRenoComplete}
                className="btn-primary rounded-xl px-8 py-3 text-sm font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Tiếp tục: Gán thiết bị →
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
    </div>
  );
};
