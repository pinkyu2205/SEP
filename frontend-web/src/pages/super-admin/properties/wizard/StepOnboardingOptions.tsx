import { useState, useEffect } from 'react';
import {
  Home, LayoutGrid, Hammer, DoorOpen, Package,
  Check, AlertCircle, Settings2, ChevronDown, ChevronRight, Layers
} from 'lucide-react';
import type { 
  PropertyResponse, RenovationCategory, RenovationLineResponse, 
  RoomResponse, ManifestItemResponse, EquipmentAssignmentResponse, HouseArea 
} from '../../../../types/api.types';
import { propertyService } from '../../../../services/property.service';
import { catalogService } from '../../../../services/catalog.service';
import type { EquipmentSource, EquipmentCatalogItem } from '../../../../types/api.types';

const formatVND = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);

interface StepOnboardingOptionsProps {
  property: PropertyResponse;
  onNext: () => void;
  onBack: () => void;
  onPropertyUpdated: (p: PropertyResponse) => void;
  nextLabel?: string;
}

export const StepOnboardingOptions = ({ property, onNext, onBack, onPropertyUpdated, nextLabel = 'Tiếp tục Xem giá →' }: StepOnboardingOptionsProps) => {
  const [loading, setLoading] = useState(false);
  
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
  
  // 2B.1: Structure Update
  const [showStructureUpdate, setShowStructureUpdate] = useState(false);
  const [structure, setStructure] = useState({ floorCount: property.floorCount || 1, roomsPerFloor: property.roomsPerFloor || 1 });
  
  // 2B.2: Purchase New Equipment
  type PurchaseRow = { catalogId: number; quantity: number; cost: number; costDisplay: string };
  const [purchaseRows, setPurchaseRows] = useState<PurchaseRow[]>([{ catalogId: 0, quantity: 1, cost: 0, costDisplay: '' }]);
  const [isSavingPurchase, setIsSavingPurchase] = useState(false);

  // 2C: Rooms State
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [newRoom, setNewRoom] = useState({ roomNumber: '', area: 0, maxOccupants: 2, propertyType: 'INDIVIDUAL_ROOM' as const });

  // 2D: Equipment State
  const [manifest, setManifest] = useState<ManifestItemResponse[]>([]);
  const [assignments, setAssignments] = useState<EquipmentAssignmentResponse[]>([]);
  const [newAssign, setNewAssign] = useState({ catalogId: 0, quantity: 1, status: 'NEW' as any, source: 'INITIAL_HANDOVER' as EquipmentSource, houseArea: 'LIVING_ROOM' as HouseArea, roomId: 0 });

  // Floor navigation & per-room equipment
  const [selectedFloor, setSelectedFloor] = useState(1);
  const [expandedRoomId, setExpandedRoomId] = useState<number | null>(null);
  const [roomAssignForm, setRoomAssignForm] = useState({ catalogId: 0, quantity: 1, source: 'INITIAL_HANDOVER' as EquipmentSource });

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
      alert('Lưu lịch thành công');
    } catch (err) { alert('Lỗi lưu lịch'); }
  };

  const updateStructure = async () => {
    try {
      await propertyService.updateStructure(property.id, structure);
      alert('Cập nhật cấu trúc số phòng thành công!');
      property.floorCount = structure.floorCount;
      property.roomsPerFloor = structure.roomsPerFloor;
      property.totalRooms = structure.floorCount * structure.roomsPerFloor;
    } catch (err) { alert('Lỗi cập nhật cấu trúc'); }
  };

  const purchaseAllEquipment = async () => {
    const validRows = purchaseRows.filter(r => r.catalogId > 0 && r.quantity > 0 && r.cost > 0);
    if (validRows.length === 0) return alert('Vui lòng điền đầy đủ thông tin ít nhất 1 thiết bị');

    const eqCat = categories.find(c => c.code === 'EQUIPMENT' || c.name.toLowerCase().includes('thiết bị'));
    const catId = eqCat ? eqCat.id : categories[0]?.id;
    if (!catId) return alert('Chưa có danh mục thiết bị trong hệ thống');

    setIsSavingPurchase(true);
    try {
      const updatedManifestItems = manifest.map(m => ({ catalogId: m.catalogId, quantity: m.quantity, status: m.status }));
      const newRenoResults: RenovationLineResponse[] = [];

      for (const row of validRows) {
        const catalogName = catalogs.find(c => c.id === row.catalogId)?.name || 'Thiết bị';
        const renoRes = await propertyService.addRenovationLine(property.id, {
          categoryId: catId,
          cost: row.cost,
          note: `Mua thêm ${row.quantity} ${catalogName}`
        });
        newRenoResults.push(renoRes);

        const existingIdx = updatedManifestItems.findIndex(m => m.catalogId === row.catalogId && m.status === 'NEW');
        if (existingIdx >= 0) updatedManifestItems[existingIdx].quantity += row.quantity;
        else updatedManifestItems.push({ catalogId: row.catalogId, quantity: row.quantity, status: 'NEW' });
      }

      await propertyService.putManifest(property.id, { items: updatedManifestItems });
      const mft = await propertyService.getManifest(property.id);
      setManifest(mft);
      setRenoLines(prev => [...prev, ...newRenoResults]);
      setPurchaseRows([{ catalogId: 0, quantity: 1, cost: 0, costDisplay: '' }]);
    } catch (err) {
      alert('Lỗi lưu thiết bị mua mới');
    } finally {
      setIsSavingPurchase(false);
    }
  };

  const addAssignment = async () => {
    if (newAssign.catalogId === 0 || newAssign.quantity <= 0) return;
    try {
      const req: any = {
        catalogId: newAssign.catalogId,
        quantity: newAssign.quantity,
        status: newAssign.status,
        source: newAssign.source
      };
      if (property.wholeHouse) req.houseArea = newAssign.houseArea;
      else req.roomId = newAssign.roomId;
      const res = await propertyService.assignEquipment(property.id, req);
      setAssignments(prev => [...prev, res]);
      const mft = await propertyService.getManifest(property.id);
      setManifest(mft);
    } catch (err: any) { alert(err.response?.data?.message || 'Lỗi gán thiết bị'); }
  };

  const addAssignmentToRoom = async (roomId: number) => {
    if (roomAssignForm.catalogId === 0) return;
    try {
      const res = await propertyService.assignEquipment(property.id, {
        catalogId: roomAssignForm.catalogId,
        quantity: roomAssignForm.quantity,
        status: 'NEW',
        source: roomAssignForm.source,
        roomId,
      });
      setAssignments(prev => [...prev, res]);
      const mft = await propertyService.getManifest(property.id);
      setManifest(mft);
      setRoomAssignForm({ catalogId: 0, quantity: 1, source: 'INITIAL_HANDOVER' });
    } catch (err: any) { alert(err.response?.data?.message || 'Lỗi gán thiết bị'); }
  };

  // Validation to enable Next button
  const isManifestFullyAssigned = manifest.length > 0 && manifest.every(m => m.assignedCount === m.quantity);
  const isRoomsComplete = property.wholeHouse === true || rooms.length === property.totalRooms;
  const isRenoComplete = !property.hasRenovation || renoLines.length > 0;
  
  const canProceed = optionsSaved && isRoomsComplete && isRenoComplete && isManifestFullyAssigned;

  if (loading) return <div className="py-20 text-center">Đang tải cấu hình...</div>;

  return (
    <div className="space-y-6 pb-12">
      {/* 2A: Tùy chọn Onboarding */}
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

      {/* 2B: Renovation (Chỉ hiện nếu có cấu hình cải tạo) */}
      {optionsSaved && property.hasRenovation && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/30 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Hammer className="h-5 w-5 text-amber-500" />
              <h3 className="font-bold text-slate-800">Chi phí Cải tạo</h3>
              {isRenoComplete && <Check className="h-4 w-4 text-emerald-500" />}
            </div>
          </div>
          
          {/* Thay đổi cấu trúc phòng */}
          <div className="mb-5 p-4 bg-white rounded-xl border border-amber-100">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={showStructureUpdate} onChange={e => setShowStructureUpdate(e.target.checked)} className="rounded text-amber-500" />
              <span className="font-semibold text-slate-700 text-sm">Cải tạo có làm thay đổi số tầng / số phòng không?</span>
            </label>
            {showStructureUpdate && (
              <div className="flex gap-4 items-end mt-3 pl-6">
                <label className="block w-32">
                  <span className="mb-1 block text-xs text-slate-600">Số tầng mới</span>
                  <input type="number" min={1} value={structure.floorCount} onChange={e => setStructure({...structure, floorCount: Number(e.target.value)})} className="input-field text-sm" />
                </label>
                <label className="block w-32">
                  <span className="mb-1 block text-xs text-slate-600">Phòng/Tầng mới</span>
                  <input type="number" min={1} value={structure.roomsPerFloor} onChange={e => setStructure({...structure, roomsPerFloor: Number(e.target.value)})} className="input-field text-sm" />
                </label>
                <button onClick={updateStructure} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-bold h-[42px]">Cập nhật</button>
              </div>
            )}
          </div>

          {/* ① Hạng mục cải tạo */}
          <div className="mb-5">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">① Hạng mục cải tạo</p>

            {/* Form thêm hạng mục */}
            <div className="flex gap-3 items-end bg-amber-50/60 border border-amber-100 rounded-xl p-3 mb-3">
              <div className="flex-1">
                <span className="mb-1 block text-xs font-bold text-slate-600">Loại hạng mục</span>
                <select value={newRenoLine.categoryId} onChange={e => setNewRenoLine({...newRenoLine, categoryId: Number(e.target.value)})} className="input-field text-sm bg-white">
                  <option value={0}>-- Chọn hạng mục --</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="w-44">
                <span className="mb-1 block text-xs font-bold text-slate-600">Chi phí</span>
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
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-medium pointer-events-none">đ</span>
                </div>
              </div>
              <button
                onClick={() => { addRenoLine(); setRenoCostDisplay(''); }}
                className="bg-amber-500 hover:bg-amber-600 text-white px-5 py-2 rounded-xl text-sm font-bold h-[42px] whitespace-nowrap"
              >
                + Thêm
              </button>
            </div>

          </div>

          {/* ② Mua thêm thiết bị */}
          <div className="mb-5">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">② Mua thêm thiết bị mới <span className="normal-case font-normal text-slate-400">(tùy chọn — chi phí tự động cộng vào cải tạo)</span></p>
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
              {/* Header */}
              <div className="grid grid-cols-[1fr_72px_140px_36px] gap-2 px-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                <span>Thiết bị</span>
                <span className="text-center">SL</span>
                <span>Thành tiền</span>
                <span />
              </div>

              {/* Rows */}
              {purchaseRows.map((row, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_72px_140px_36px] gap-2 items-center bg-slate-50 rounded-xl px-2 py-1.5 border border-slate-100">
                  <select
                    value={row.catalogId}
                    onChange={e => setPurchaseRows(prev => prev.map((r, i) => i === idx ? { ...r, catalogId: Number(e.target.value) } : r))}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  >
                    <option value={0}>-- Chọn --</option>
                    {catalogs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input
                    type="number" min={1} value={row.quantity}
                    onChange={e => setPurchaseRows(prev => prev.map((r, i) => i === idx ? { ...r, quantity: Number(e.target.value) } : r))}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <div className="relative">
                    <input
                      type="text"
                      value={row.costDisplay}
                      onChange={e => {
                        const raw = e.target.value.replace(/\./g, '').replace(/,/g, '');
                        if (!/^\d*$/.test(raw)) return;
                        setPurchaseRows(prev => prev.map((r, i) => i === idx ? { ...r, cost: Number(raw) || 0, costDisplay: raw ? Number(raw).toLocaleString('vi-VN') : '' } : r));
                      }}
                      placeholder="0"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 pr-6 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">đ</span>
                  </div>
                  <button
                    onClick={() => setPurchaseRows(prev => prev.length === 1 ? [{ catalogId: 0, quantity: 1, cost: 0, costDisplay: '' }] : prev.filter((_, i) => i !== idx))}
                    className="flex items-center justify-center w-8 h-8 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              ))}

              {/* Add row + Save */}
              <button
                onClick={() => setPurchaseRows(prev => [...prev, { catalogId: 0, quantity: 1, cost: 0, costDisplay: '' }])}
                className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-indigo-600 border-2 border-dashed border-indigo-200 rounded-xl py-2 hover:bg-indigo-50 hover:border-indigo-400 transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Thêm thiết bị
              </button>

              <div className="flex justify-end pt-1">
                <button
                  onClick={purchaseAllEquipment}
                  disabled={isSavingPurchase}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-bold"
                >
                  {isSavingPurchase ? 'Đang lưu...' : 'Lưu tất cả thiết bị'}
                </button>
              </div>
            </div>
          </div>


          {/* Danh sách hạng mục + Tổng */}
          {renoLines.length > 0 && (
            <div className="space-y-1.5 mb-5">
              {renoLines.map((line, i) => (
                <div key={line.id} className="flex justify-between items-center bg-white px-4 py-2.5 rounded-xl border border-amber-100 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                    <span className="font-semibold text-slate-700">{line.categoryName}</span>
                    {line.note && <span className="text-slate-400 text-xs">({line.note})</span>}
                  </div>
                  <span className="font-bold text-amber-600">{formatVND(line.cost)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center bg-amber-50 px-4 py-2.5 rounded-xl border border-amber-200 text-sm font-bold">
                <span className="text-slate-700">Tổng chi phí cải tạo</span>
                <span className="text-amber-600 text-base">{formatVND(renoLines.reduce((s, l) => s + l.cost, 0))}</span>
              </div>
            </div>
          )}

          {/* ③ Lịch cải tạo */}
          <div className="border-t border-amber-200 pt-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">③ Lịch thi công</p>
            <div className="flex gap-4 items-end">
              <label className="block flex-1">
                <span className="mb-1 block text-xs font-bold text-slate-700">Ngày bắt đầu</span>
                <input type="date" value={schedule.startDate} onChange={e => setSchedule({...schedule, startDate: e.target.value})} className="input-field text-sm" />
              </label>
              <label className="block flex-1">
                <span className="mb-1 block text-xs font-bold text-slate-700">Ngày kết thúc dự kiến</span>
                <input type="date" value={schedule.endDate} onChange={e => setSchedule({...schedule, endDate: e.target.value})} className="input-field text-sm" />
              </label>
              <button onClick={saveSchedule} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold h-[42px]">Lưu lịch</button>
            </div>
          </div>
        </section>
      )}

      {/* 2C+2D: Chia phòng theo tầng & Gán thiết bị */}
      {optionsSaved && property.wholeHouse === false && (() => {
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
                                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">×{a.quantity}</span>
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
                                    value={roomAssignForm.catalogId}
                                    onChange={e => setRoomAssignForm(f => ({ ...f, catalogId: Number(e.target.value) }))}
                                    className="input-field text-sm"
                                  >
                                    <option value={0}>-- Chọn --</option>
                                    {unassigned.map(m => (
                                      <option key={m.catalogId} value={m.catalogId}>{m.catalogName} (còn {m.quantity - m.assignedCount})</option>
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

      {/* 2D: Phân bổ thiết bị (chỉ dùng cho nhà nguyên căn) */}
      {optionsSaved && property.wholeHouse === true && (
        <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-indigo-500" />
              <h3 className="font-bold text-slate-800">Phân bổ Thiết bị</h3>
            </div>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isManifestFullyAssigned ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {manifest.filter(m => m.assignedCount === m.quantity).length}/{manifest.length} loại đã gán xong
            </span>
          </div>
          <div className="p-6 space-y-4">
            {manifest.length > 0 && (
              <div className="space-y-2">
                {manifest.map(m => {
                  const done = m.assignedCount === m.quantity;
                  const pct = m.quantity > 0 ? Math.round((m.assignedCount / m.quantity) * 100) : 0;
                  return (
                    <div key={m.id} className={`flex items-center gap-4 px-4 py-3 rounded-xl border text-sm ${done ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${done ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                        {done ? <Check className="w-4 h-4 text-white" /> : <span className="text-xs font-bold text-slate-500">{m.assignedCount}</span>}
                      </div>
                      <span className={`font-semibold flex-1 ${done ? 'text-emerald-800' : 'text-slate-700'}`}>{m.catalogName}</span>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${done ? 'bg-emerald-500' : 'bg-indigo-400'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={`text-xs font-bold w-10 text-right ${done ? 'text-emerald-700' : 'text-slate-500'}`}>{m.assignedCount}/{m.quantity}</span>
                        {!done && (
                          <button onClick={() => setNewAssign(prev => ({ ...prev, catalogId: m.catalogId }))}
                            className="text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg">Gán →</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {!isManifestFullyAssigned && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Thêm lượt gán</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="mb-1 block text-xs font-bold text-slate-600">Thiết bị cần gán</span>
                    <select value={newAssign.catalogId} onChange={e => setNewAssign({ ...newAssign, catalogId: Number(e.target.value) })} className="input-field text-sm">
                      <option value={0}>-- Chọn thiết bị --</option>
                      {manifest.filter(m => m.assignedCount < m.quantity).map(m => (
                        <option key={m.catalogId} value={m.catalogId}>{m.catalogName} (còn {m.quantity - m.assignedCount})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className="mb-1 block text-xs font-bold text-slate-600">Khu vực</span>
                    <select value={newAssign.houseArea} onChange={e => setNewAssign({ ...newAssign, houseArea: e.target.value as any })} className="input-field text-sm">
                      <option value="LIVING_ROOM">Phòng khách</option>
                      <option value="BEDROOM">Phòng ngủ</option>
                      <option value="KITCHEN">Bếp</option>
                      <option value="BATHROOM">Phòng tắm</option>
                      <option value="BALCONY">Ban công</option>
                      <option value="GARAGE">Nhà xe</option>
                      <option value="OTHER">Khác</option>
                    </select>
                  </div>
                  <div>
                    <span className="mb-1 block text-xs font-bold text-slate-600">Nguồn gốc</span>
                    <select value={newAssign.source} onChange={e => setNewAssign({ ...newAssign, source: e.target.value as EquipmentSource })} className="input-field text-sm">
                      <option value="INITIAL_HANDOVER">Có sẵn (từ manifest)</option>
                      <option value="PURCHASED">Mua mới</option>
                    </select>
                  </div>
                  <div>
                    <span className="mb-1 block text-xs font-bold text-slate-600">Số lượng</span>
                    <div className="flex gap-2">
                      <input type="number" min={1} value={newAssign.quantity} onChange={e => setNewAssign({ ...newAssign, quantity: Number(e.target.value) })} className="input-field text-sm flex-1" />
                      <button onClick={addAssignment} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 rounded-xl text-sm font-bold">Gán</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Navigation */}
      <div className="mt-8 flex justify-between pt-4 border-t border-slate-200">
        <button onClick={onBack} className="rounded-xl px-6 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100">
          ← Quay lại
        </button>
        <div className="flex items-center">
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
        </div>
      </div>
    </div>
  );
};
