import { useState, useEffect } from 'react';
import { 
  Home, LayoutGrid, Hammer, DoorOpen, Package, 
  Check, AlertCircle, Settings2
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
}

export const StepOnboardingOptions = ({ property, onNext, onBack, onPropertyUpdated }: StepOnboardingOptionsProps) => {
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
  const [schedule, setSchedule] = useState({ startDate: '', endDate: '' });
  
  // 2B.1: Structure Update
  const [showStructureUpdate, setShowStructureUpdate] = useState(false);
  const [structure, setStructure] = useState({ floorCount: property.floorCount || 1, roomsPerFloor: property.roomsPerFloor || 1 });
  
  // 2B.2: Purchase New Equipment
  const [newPurchase, setNewPurchase] = useState({ catalogId: 0, quantity: 1, cost: 0 });

  // 2C: Rooms State
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [newRoom, setNewRoom] = useState({ roomNumber: '', area: 0, maxOccupants: 2, propertyType: 'INDIVIDUAL_ROOM' as const });

  // 2D: Equipment State
  const [manifest, setManifest] = useState<ManifestItemResponse[]>([]);
  const [assignments, setAssignments] = useState<EquipmentAssignmentResponse[]>([]);
  const [newAssign, setNewAssign] = useState({ catalogId: 0, quantity: 1, status: 'NEW' as any, source: 'INITIAL_HANDOVER' as EquipmentSource, houseArea: 'LIVING_ROOM' as HouseArea, roomId: 0 });

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

  const purchaseEquipment = async () => {
    if (newPurchase.catalogId === 0 || newPurchase.quantity <= 0 || newPurchase.cost <= 0) return;
    try {
      // 1. Find equipment category for renovation
      const eqCat = categories.find(c => c.code === 'EQUIPMENT' || c.name.toLowerCase().includes('thiết bị'));
      const catId = eqCat ? eqCat.id : categories[0]?.id; // Fallback
      if (!catId) return alert('Chưa có danh mục thiết bị trong hệ thống');

      const catalogName = catalogs.find(c => c.id === newPurchase.catalogId)?.name || 'Thiết bị';

      // 2. Add as renovation cost
      const renoRes = await propertyService.addRenovationLine(property.id, {
        categoryId: catId,
        cost: newPurchase.cost,
        note: `Mua thêm ${newPurchase.quantity} ${catalogName}`
      });
      setRenoLines([...renoLines, renoRes]);

      // 3. Silently update manifest to allow assigning
      const updatedManifestItems = manifest.map(m => ({
        catalogId: m.catalogId,
        quantity: m.quantity,
        status: m.status
      }));
      
      const existingIdx = updatedManifestItems.findIndex(m => m.catalogId === newPurchase.catalogId && m.status === 'NEW');
      if (existingIdx >= 0) {
        updatedManifestItems[existingIdx].quantity += newPurchase.quantity;
      } else {
        updatedManifestItems.push({ catalogId: newPurchase.catalogId, quantity: newPurchase.quantity, status: 'NEW' });
      }
      
      await propertyService.putManifest(property.id, { items: updatedManifestItems });
      
      // Reload manifest
      const mft = await propertyService.getManifest(property.id);
      setManifest(mft);
      setNewPurchase({ catalogId: 0, quantity: 1, cost: 0 });
      alert('Đã thêm thiết bị mua mới thành công!');
    } catch (err) { alert('Lỗi mua thiết bị'); }
  };

  const addRoom = async () => {
    if (!newRoom.roomNumber || newRoom.area <= 0) return;
    try {
      const res = await propertyService.addRoom(property.id, newRoom);
      setRooms([...rooms, res]);
      setNewRoom({ roomNumber: '', area: 0, maxOccupants: 2, propertyType: 'INDIVIDUAL_ROOM' });
    } catch (err: any) { alert(err.response?.data?.message || 'Lỗi thêm phòng'); }
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
      setAssignments([...assignments, res]);

      // Refresh manifest to get updated assignedCount
      const mft = await propertyService.getManifest(property.id);
      setManifest(mft);
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
          <div className="mb-6 p-4 bg-white rounded-xl border border-amber-100 shadow-sm">
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input type="checkbox" checked={showStructureUpdate} onChange={e => setShowStructureUpdate(e.target.checked)} className="rounded text-amber-500" />
              <span className="font-bold text-slate-700 text-sm">Cải tạo có làm thay đổi số tầng / số phòng không?</span>
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
                <button onClick={updateStructure} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-bold h-[42px] mb-1">Cập nhật Cấu trúc</button>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-3 gap-4 mb-4 items-end">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-700">Hạng mục</span>
              <select value={newRenoLine.categoryId} onChange={e => setNewRenoLine({...newRenoLine, categoryId: Number(e.target.value)})} className="input-field text-sm">
                <option value={0}>-- Chọn --</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-700">Chi phí (VND)</span>
              <input type="number" min={0} value={newRenoLine.cost} onChange={e => setNewRenoLine({...newRenoLine, cost: Number(e.target.value)})} className="input-field text-sm" />
            </label>
            <button onClick={addRenoLine} className="bg-amber-100 hover:bg-amber-200 text-amber-800 px-4 py-2 rounded-xl text-sm font-bold h-[42px] mb-1">Thêm dòng</button>
          </div>

          {renoLines.length > 0 && (
            <div className="space-y-2 mb-6">
              {renoLines.map(line => (
                <div key={line.id} className="flex justify-between items-center bg-white p-3 rounded-lg border border-amber-100 shadow-sm text-sm">
                  <span className="font-semibold text-slate-700">{line.categoryName} {line.note && <span className="text-slate-400 font-normal">({line.note})</span>}</span>
                  <span className="font-bold text-amber-600">{formatVND(line.cost)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Mua trang thiết bị mới */}
          <div className="mb-6 p-4 bg-white rounded-xl border border-indigo-100 shadow-sm border-l-4 border-l-indigo-500">
            <h4 className="font-bold text-slate-800 text-sm mb-3">Mua thêm trang thiết bị mới (Sẽ cộng vào tổng cải tạo)</h4>
            <div className="grid grid-cols-4 gap-4 items-end">
              <label className="block col-span-2">
                <span className="mb-1 block text-xs font-bold text-slate-700">Thiết bị</span>
                <select value={newPurchase.catalogId} onChange={e => setNewPurchase({...newPurchase, catalogId: Number(e.target.value)})} className="input-field text-sm">
                  <option value={0}>-- Chọn danh mục --</option>
                  {catalogs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-700">Số lượng mua</span>
                <input type="number" min={1} value={newPurchase.quantity} onChange={e => setNewPurchase({...newPurchase, quantity: Number(e.target.value)})} className="input-field text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-700">Tổng tiền (VND)</span>
                <input type="number" min={0} value={newPurchase.cost} onChange={e => setNewPurchase({...newPurchase, cost: Number(e.target.value)})} className="input-field text-sm" />
              </label>
            </div>
            <div className="mt-3 flex justify-end">
              <button onClick={purchaseEquipment} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold">Lưu thiết bị mua mới</button>
            </div>
          </div>

          <div className="flex gap-4 items-end border-t border-amber-200 pt-4 mt-4">
            <label className="block flex-1">
              <span className="mb-1 block text-xs font-bold text-slate-700">Ngày bắt đầu CT</span>
              <input type="date" value={schedule.startDate} onChange={e => setSchedule({...schedule, startDate: e.target.value})} className="input-field text-sm" />
            </label>
            <label className="block flex-1">
              <span className="mb-1 block text-xs font-bold text-slate-700">Ngày kết thúc CT dự kiến</span>
              <input type="date" value={schedule.endDate} onChange={e => setSchedule({...schedule, endDate: e.target.value})} className="input-field text-sm" />
            </label>
            <button onClick={saveSchedule} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold h-[42px] mb-1">Lưu lịch</button>
          </div>
        </section>
      )}

      {/* 2C: Tạo Phòng (Chỉ hiện nếu chia phòng) */}
      {optionsSaved && property.wholeHouse === false && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DoorOpen className="h-5 w-5 text-indigo-500" />
              <h3 className="font-bold text-slate-800">Chia Phòng ({rooms.length}/{property.totalRooms})</h3>
              {isRoomsComplete && <Check className="h-4 w-4 text-emerald-500" />}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
            <input placeholder="Mã phòng (P.101)" value={newRoom.roomNumber} onChange={e => setNewRoom({...newRoom, roomNumber: e.target.value})} className="input-field text-sm" />
            <input type="number" placeholder="Diện tích (m²)" value={newRoom.area || ''} onChange={e => setNewRoom({...newRoom, area: Number(e.target.value)})} className="input-field text-sm" />
            <input type="number" placeholder="Số người tối đa" value={newRoom.maxOccupants} onChange={e => setNewRoom({...newRoom, maxOccupants: Number(e.target.value)})} className="input-field text-sm" />
            <button onClick={addRoom} disabled={isRoomsComplete} className="bg-indigo-50 text-indigo-600 hover:bg-indigo-100 px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50">Thêm phòng</button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {rooms.map(r => (
              <div key={r.id} className="p-3 border border-slate-200 rounded-xl text-sm flex justify-between items-center bg-white shadow-sm">
                <span className="font-bold text-slate-800">{r.roomNumber}</span>
                <span className="text-slate-500 text-xs">{r.area}m²</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 2D: Phân bổ thiết bị */}
      {optionsSaved && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-indigo-500" />
              <h3 className="font-bold text-slate-800">Phân bổ Thiết bị</h3>
              {isManifestFullyAssigned && <Check className="h-4 w-4 text-emerald-500" />}
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 md:grid-cols-3 gap-3">
            {manifest.map(m => (
              <div key={m.id} className={`p-3 rounded-xl border ${m.assignedCount === m.quantity ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                <p className="text-xs font-semibold text-slate-500 mb-1 line-clamp-1">{m.catalogName}</p>
                <div className="flex items-end justify-between">
                  <span className={`text-lg font-black ${m.assignedCount === m.quantity ? 'text-emerald-700' : 'text-slate-900'}`}>{m.assignedCount} / {m.quantity}</span>
                  {m.assignedCount < m.quantity && <span className="text-[10px] text-amber-600 font-bold bg-amber-100 px-1.5 py-0.5 rounded">Cần gán thêm</span>}
                </div>
              </div>
            ))}
          </div>

          {!isManifestFullyAssigned && (
            <div className="flex gap-3 mb-6 items-end bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div className="flex-1">
                <span className="mb-1 block text-xs font-bold text-slate-700">Thiết bị</span>
                <select value={newAssign.catalogId} onChange={e => setNewAssign({...newAssign, catalogId: Number(e.target.value)})} className="input-field text-sm">
                  <option value={0}>-- Chọn từ Manifest --</option>
                  {manifest.filter(m => m.assignedCount < m.quantity).map(m => (
                    <option key={m.catalogId} value={m.catalogId}>{m.catalogName} (Còn {m.quantity - m.assignedCount})</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <span className="mb-1 block text-xs font-bold text-slate-700">Nguồn gốc</span>
                <select value={newAssign.source} onChange={e => setNewAssign({...newAssign, source: e.target.value as EquipmentSource})} className="input-field text-sm">
                  <option value="INITIAL_HANDOVER">Có sẵn</option>
                  <option value="PURCHASED">Mua mới</option>
                </select>
              </div>
              <div className="w-20">
                <span className="mb-1 block text-xs font-bold text-slate-700">SL</span>
                <input type="number" min={1} value={newAssign.quantity} onChange={e => setNewAssign({...newAssign, quantity: Number(e.target.value)})} className="input-field text-sm" />
              </div>
              <div className="flex-1">
                <span className="mb-1 block text-xs font-bold text-slate-700">Vị trí ({property.wholeHouse ? 'Khu vực' : 'Phòng'})</span>
                {property.wholeHouse ? (
                  <select value={newAssign.houseArea} onChange={e => setNewAssign({...newAssign, houseArea: e.target.value as any})} className="input-field text-sm">
                    <option value="LIVING_ROOM">Phòng khách</option>
                    <option value="BEDROOM">Phòng ngủ</option>
                    <option value="KITCHEN">Bếp</option>
                    <option value="BATHROOM">Phòng tắm (WC)</option>
                    <option value="BALCONY">Ban công</option>
                    <option value="GARAGE">Nhà xe</option>
                    <option value="OTHER">Khu vực khác</option>
                  </select>
                ) : (
                  <select value={newAssign.roomId} onChange={e => setNewAssign({...newAssign, roomId: Number(e.target.value)})} className="input-field text-sm">
                    <option value={0}>-- Chọn phòng --</option>
                    {rooms.map(r => <option key={r.id} value={r.id}>{r.roomNumber}</option>)}
                  </select>
                )}
              </div>
              <button onClick={addAssignment} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-bold h-[42px] mb-1">Gán</button>
            </div>
          )}

          {assignments.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {assignments.map(a => (
                <div key={a.id} className="p-3 bg-white border border-slate-100 rounded-xl shadow-sm text-sm">
                  <p className="font-bold text-slate-800 line-clamp-1">{a.catalogName}</p>
                  <p className="text-xs text-slate-500 mt-1 flex justify-between">
                    <span>Số lượng: {a.quantity}</span>
                    <span className="font-semibold text-indigo-600 bg-indigo-50 px-1.5 rounded">{a.roomNumber || a.houseArea}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
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
            Tiếp tục Xem giá →
          </button>
        </div>
      </div>
    </div>
  );
};
