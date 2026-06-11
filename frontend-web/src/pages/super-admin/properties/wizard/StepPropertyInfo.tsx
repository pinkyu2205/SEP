import { useState, useEffect } from 'react';
import { Building, Package, FileText, Plus, Trash2, Check, Upload, Save, AlertCircle } from 'lucide-react';
import type { 
  PropertyResponse, 
  ManifestItem, 
  InboundContractRequest, 
  InboundContractResponse, 
  EquipmentCatalogItem 
} from '../../../../types/api.types';
import { propertyService } from '../../../../services/property.service';
import { catalogService } from '../../../../services/catalog.service';
import { uploadToCloudinary } from '../../../../services/upload.service';

interface StepPropertyInfoProps {
  property: PropertyResponse;
  onNext: () => void;
  nextLabel?: string;
}

export const StepPropertyInfo = ({ property, onNext, nextLabel = 'Tiếp tục cấu hình →' }: StepPropertyInfoProps) => {
  const [loading, setLoading] = useState(false);
  
  // Manifest State
  const [catalog, setCatalog] = useState<EquipmentCatalogItem[]>([]);
  const [manifestItems, setManifestItems] = useState<ManifestItem[]>([]);
  const [manifestSaved, setManifestSaved] = useState(false);
  const [isSavingManifest, setIsSavingManifest] = useState(false);

  // Contract State
  const [contract, setContract] = useState<InboundContractResponse | null>(null);
  const [contractForm, setContractForm] = useState<InboundContractRequest>({
    contractCode: '', ownerName: '', totalRentAmount: 0, startDate: '', endDate: '', contractScanUrl: ''
  });
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingContract, setIsSavingContract] = useState(false);
  const [rentAmountDisplay, setRentAmountDisplay] = useState('');

  const formatVND = (value: number) =>
    value > 0 ? value.toLocaleString('vi-VN') : '';

  const parseVND = (str: string) =>
    Number(str.replace(/\./g, '').replace(/,/g, '')) || 0;

  // Load Data
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        const [catalogData, manifestData, contractData] = await Promise.allSettled([
          catalogService.getEquipmentCatalog(),
          propertyService.getManifest(property.id),
          propertyService.getInboundContract(property.id)
        ]);

        if (catalogData.status === 'fulfilled') setCatalog(catalogData.value);
        
        if (manifestData.status === 'fulfilled' && manifestData.value.length > 0) {
          setManifestItems(manifestData.value.map(m => ({
            catalogId: m.catalogId, quantity: m.quantity, status: m.status
          })));
          setManifestSaved(true);
        } else {
          // Initialize empty if no manifest
          setManifestItems([{ catalogId: 0, quantity: 1, status: 'NEW' }]);
        }

        if (contractData.status === 'fulfilled' && contractData.value) {
          setContract(contractData.value);
          setContractForm({
            contractCode: contractData.value.contractCode,
            ownerName: contractData.value.ownerName,
            totalRentAmount: contractData.value.totalRentAmount,
            startDate: contractData.value.startDate,
            endDate: contractData.value.endDate,
            contractScanUrl: contractData.value.contractScanUrl || ''
          });
          setRentAmountDisplay(formatVND(contractData.value.totalRentAmount));
        }
      } catch (error) {
        console.error('Failed to init step 1', error);
      } finally {
        setLoading(false);
      }
    };
    initData();
  }, [property.id]);

  // Manifest Handlers
  const handleAddManifestRow = () => {
    setManifestItems(prev => [...prev, { catalogId: 0, quantity: 1, status: 'NEW' }]);
    setManifestSaved(false);
  };

  const handleRemoveManifestRow = (index: number) => {
    setManifestItems(prev => prev.filter((_, i) => i !== index));
    setManifestSaved(false);
  };

  const updateManifestRow = (index: number, field: keyof ManifestItem, value: any) => {
    const updated = [...manifestItems];
    updated[index] = { ...updated[index], [field]: value };
    setManifestItems(updated);
    setManifestSaved(false);
  };

  const saveManifest = async () => {
    // Validate
    const validItems = manifestItems.filter(i => i.catalogId > 0 && i.quantity > 0);
    if (manifestItems.length > 0 && validItems.length !== manifestItems.length) {
      alert('Vui lòng điền đầy đủ thông tin thiết bị (chọn thiết bị và số lượng > 0)');
      return;
    }

    setIsSavingManifest(true);
    try {
      await propertyService.putManifest(property.id, { items: validItems });
      setManifestSaved(true);
      setManifestItems(validItems.length > 0 ? validItems : [{ catalogId: 0, quantity: 1, status: 'NEW' }]);
    } catch (err) {
      alert('Lỗi lưu manifest');
    } finally {
      setIsSavingManifest(false);
    }
  };

  // Contract Handlers
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    try {
      const url = await uploadToCloudinary(file);
      setContractForm(prev => ({ ...prev, contractScanUrl: url }));
    } catch (err) {
      alert('Lỗi tải file lên');
    } finally {
      setIsUploading(false);
    }
  };

  const saveContract = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingContract(true);
    try {
      const res = await propertyService.createInboundContract(property.id, contractForm);
      setContract(res);
    } catch (err) {
      alert('Lỗi lưu hợp đồng');
    } finally {
      setIsSavingContract(false);
    }
  };

  const isFormComplete = manifestSaved && contract !== null;

  if (loading) return <div className="py-20 text-center text-slate-500">Đang tải dữ liệu...</div>;

  return (
    <div className="space-y-8 pb-12">
      {/* 1A: Tóm tắt thông tin */}
      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 flex items-center gap-2">
          <Building className="h-5 w-5 text-indigo-500" />
          <h3 className="font-bold text-slate-800">Thông tin cơ bản</h3>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="col-span-2">
            <p className="text-slate-500 mb-1">Tên Tòa nhà</p>
            <p className="font-bold text-slate-900">{property.propertyName}</p>
          </div>
          <div className="col-span-2">
            <p className="text-slate-500 mb-1">Địa chỉ</p>
            <p className="font-bold text-slate-900 line-clamp-1">{property.fullAddress || property.shortAddress}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Khu vực</p>
            <p className="font-bold text-slate-900">{property.zoneName}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Diện tích</p>
            <p className="font-bold text-slate-900">{property.areaSize || 0} m²</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Số tầng</p>
            <p className="font-bold text-slate-900">{property.totalFloor ?? property.floorCount ?? 0}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Tổng phòng</p>
            <p className="font-bold text-slate-900">{property.totalRooms}</p>
          </div>
        </div>
      </section>

      {/* 1B: Hợp đồng */}
      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-500" />
            <h3 className="font-bold text-slate-800">Hợp đồng với chủ nhà</h3>
            {contract && <Check className="h-4 w-4 text-emerald-500 ml-2" />}
          </div>
        </div>
        <form onSubmit={saveContract} className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
            <label className="block">
              <span className="mb-1 text-sm font-bold text-slate-700">Mã hợp đồng *</span>
              <input required value={contractForm.contractCode} onChange={e => setContractForm({...contractForm, contractCode: e.target.value})} className="input-field" placeholder="VD: HD-001" />
            </label>
            <label className="block">
              <span className="mb-1 text-sm font-bold text-slate-700">Tên Chủ nhà *</span>
              <input required value={contractForm.ownerName} onChange={e => setContractForm({...contractForm, ownerName: e.target.value})} className="input-field" placeholder="Nguyễn Văn A" />
            </label>
            <label className="block">
              <span className="mb-1 text-sm font-bold text-slate-700">Tổng tiền thuê *</span>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={rentAmountDisplay}
                  onChange={e => {
                    const raw = e.target.value.replace(/\./g, '').replace(/,/g, '');
                    if (!/^\d*$/.test(raw)) return;
                    setRentAmountDisplay(raw ? Number(raw).toLocaleString('vi-VN') : '');
                    setContractForm(prev => ({ ...prev, totalRentAmount: parseVND(raw) }));
                  }}
                  className="input-field pr-8"
                  placeholder="VD: 15.000.000"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium pointer-events-none">đ</span>
              </div>
            </label>
            <label className="block">
              <span className="mb-1 text-sm font-bold text-slate-700 block">Ngày bắt đầu *</span>
              <input type="date" required value={contractForm.startDate} onChange={e => setContractForm({...contractForm, startDate: e.target.value})} className="input-field" />
            </label>
            <div className="block">
              <span className="mb-1 text-sm font-bold text-slate-700 block">Ngày kết thúc *</span>
              <input
                type="date"
                required
                value={contractForm.endDate}
                onChange={e => setContractForm({ ...contractForm, endDate: e.target.value })}
                className="input-field mb-2"
              />
              <div className="flex rounded-xl border border-slate-200 overflow-hidden divide-x divide-slate-200">
                {[1, 2, 3, 4, 5].map(y => {
                  const base = contractForm.startDate || new Date().toISOString().slice(0, 10);
                  const d = new Date(base);
                  d.setFullYear(d.getFullYear() + y);
                  const val = d.toISOString().slice(0, 10);
                  const active = contractForm.endDate === val;
                  return (
                    <button
                      key={y}
                      type="button"
                      onClick={() => setContractForm(prev => ({ ...prev, endDate: val }))}
                      className={`flex-1 py-2 text-xs font-semibold transition-all ${
                        active
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white text-slate-500 hover:bg-indigo-50 hover:text-indigo-600'
                      }`}
                    >
                      {y} năm
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="block col-span-2 md:col-span-1">
              <span className="mb-1 text-sm font-bold text-slate-700">File Hợp đồng (Scan/PDF)</span>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition flex-1 justify-center border border-slate-300">
                  <Upload className="w-4 h-4" /> {isUploading ? 'Đang tải lên...' : 'Chọn File'}
                  <input type="file" accept=".pdf,image/*,.doc,.docx" className="hidden" onChange={handleUpload} disabled={isUploading} />
                </label>
              </div>
              {contractForm.contractScanUrl && (
                <a href={contractForm.contractScanUrl} target="_blank" rel="noreferrer" className="mt-2 text-xs text-indigo-600 hover:underline block truncate">
                  Đã tải file: Xem hợp đồng
                </a>
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={isSavingContract} className="btn-primary py-2 px-6 rounded-xl flex items-center gap-2">
              {isSavingContract ? 'Đang lưu...' : <><Save className="w-4 h-4" /> {contract ? 'Cập nhật Hợp đồng' : 'Lưu Hợp đồng'}</>}
            </button>
          </div>
        </form>
      </section>

      {/* 1C: Manifest */}
      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-indigo-500" />
            <h3 className="font-bold text-slate-800">Khai báo trang thiết bị có sẵn</h3>
            {manifestSaved && <Check className="h-4 w-4 text-emerald-500 ml-2" />}
          </div>
          <button onClick={saveManifest} disabled={isSavingManifest} className="btn-primary py-1.5 px-4 text-sm rounded-lg flex items-center gap-2">
            {isSavingManifest ? 'Đang lưu...' : <><Save className="w-4 h-4" /> Lưu Thiết bị</>}
          </button>
        </div>
        <div className="p-5">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="pb-2 font-semibold">Tên Thiết bị</th>
                <th className="pb-2 font-semibold w-24">Số lượng</th>
                <th className="pb-2 font-semibold w-32">Tình trạng</th>
                <th className="pb-2 font-semibold w-12 text-center">Xóa</th>
              </tr>
            </thead>
            <tbody>
              {manifestItems.map((item, idx) => (
                <tr key={idx} className="border-b border-slate-100">
                  <td className="py-2 pr-2">
                    <select value={item.catalogId} onChange={e => updateManifestRow(idx, 'catalogId', Number(e.target.value))} className="input-field py-1.5 text-sm">
                      <option value={0}>-- Chọn thiết bị --</option>
                      {catalog.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <input type="number" min={1} value={item.quantity} onChange={e => updateManifestRow(idx, 'quantity', Number(e.target.value))} className="input-field py-1.5 text-sm" />
                  </td>
                  <td className="py-2 pr-2">
                    <select value={item.status} onChange={e => updateManifestRow(idx, 'status', e.target.value)} className="input-field py-1.5 text-sm">
                      <option value="NEW">Mới 100%</option>
                      <option value="GOOD">Đang dùng tốt</option>
                    </select>
                  </td>
                  <td className="py-2 text-center">
                    <button onClick={() => handleRemoveManifestRow(idx)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-md">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={handleAddManifestRow} className="mt-3 flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
            <Plus className="w-4 h-4" /> Thêm thiết bị
          </button>
        </div>
      </section>

      {/* Navigation */}
      <div className="mt-8 flex justify-end pt-4 border-t border-slate-200">
        {!isFormComplete && (
          <p className="text-sm font-semibold text-amber-600 flex items-center gap-1 mr-4">
            <AlertCircle className="w-4 h-4" /> Vui lòng Lưu Thiết bị và Lưu Hợp đồng trước khi tiếp tục
          </p>
        )}
        <button 
          onClick={onNext} 
          disabled={!isFormComplete}
          className="btn-primary rounded-xl px-8 py-3 text-sm font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  );
};
