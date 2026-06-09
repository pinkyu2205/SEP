import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Building, FileText, Home, MapPin, PackageCheck, Upload } from 'lucide-react';
import type {
  AddEquipmentRequest,
  CreateInboundContractRequest,
  EquipmentResponse,
  PropertyCreateRequest,
  PropertyResponse,
  ZoneResponse,
} from '../../../../types/api.types';
import { adminOnboardingDraftService } from '../../../../services/admin-onboarding-draft.service';
import { equipmentService } from '../../../../services/equipment.service';
import { inboundContractService } from '../../../../services/inbound-contract.service';
import { propertyService } from '../../../../services/property.service';
import { zoneService } from '../../../../services/zone.service';

interface StepPropertyInfoProps {
  property: PropertyResponse | null;
  onSaved: (property: PropertyResponse) => void;
}

const DEFAULT_ZONE: ZoneResponse = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'TP Hồ Chí Minh',
  level: 1,
  fullName: 'TP Hồ Chí Minh',
};

const EQUIPMENT_TEMPLATES = [
  'Máy lạnh',
  'Máy nước nóng',
  'Tủ lạnh',
  'Máy giặt',
  'Giường',
  'Nệm',
  'Tủ quần áo',
  'Bàn ghế',
  'Bếp điện',
  'Camera',
  'Bình chữa cháy',
  'Router wifi',
];

const INTERIOR_TEMPLATES = [
  'Rèm cửa',
  'Kệ bếp',
  'Tủ giày',
  'Sofa',
  'Đèn trang trí',
  'Gương phòng tắm',
];

const hashId = (value: string) =>
  Math.abs(value.split('').reduce((acc, char) => ((acc << 5) - acc) + char.charCodeAt(0), 0)) || 1;

export const StepPropertyInfo = ({ property, onSaved }: StepPropertyInfoProps) => {
  const isUpdate = !!property;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [zones, setZones] = useState<ZoneResponse[]>([DEFAULT_ZONE]);
  const [pdfFileName, setPdfFileName] = useState('');
  const [savedEquipments, setSavedEquipments] = useState<EquipmentResponse[]>([]);
  const [selectedEquipments, setSelectedEquipments] = useState<string[]>([]);
  const [selectedInteriors, setSelectedInteriors] = useState<string[]>([]);
  const [customEquipment, setCustomEquipment] = useState('');

  const [formData, setFormData] = useState<PropertyCreateRequest>({
    propertyName: property?.propertyName || '',
    address: property?.shortAddress || property?.fullAddress || '',
    descriptions: property?.descriptions || '',
    zoneId: property?.zoneId || DEFAULT_ZONE.id,
    wholeHouse: property?.wholeHouse ?? true,
    areaSize: property?.areaSize || 0,
    totalRooms: property?.totalRooms || 1,
    managedBy: 1,
  });

  const [contractData, setContractData] = useState<CreateInboundContractRequest>({
    contractCode: '',
    ownerName: '',
    baseRentPrice: 0,
    depositAmount: 0,
    startDate: '',
    endDate: '',
    contractScanUrl: '',
  });

  useEffect(() => {
    const fetchZones = async () => {
      try {
        const data = await zoneService.getRootZones();
        setZones(data.length > 0 ? data : [DEFAULT_ZONE]);
        if (!property?.zoneId && data[0]?.id) {
          setFormData(prev => ({ ...prev, zoneId: data[0].id }));
        }
      } catch {
        setZones([DEFAULT_ZONE]);
      }
    };

    fetchZones();
  }, [property?.zoneId]);

  useEffect(() => {
    if (!property) return;

    setFormData({
      propertyName: property.propertyName || '',
      address: property.shortAddress || property.fullAddress || '',
      descriptions: property.descriptions || '',
      zoneId: property.zoneId || DEFAULT_ZONE.id,
      wholeHouse: property.wholeHouse,
      areaSize: property.areaSize || 0,
      totalRooms: property.totalRooms || 1,
      managedBy: 1,
    });

    const fetchLinkedData = async () => {
      const draftContract = adminOnboardingDraftService.getContractDraft(property.id);
      if (draftContract.contract) {
        setContractData({
          contractCode: draftContract.contract.contractCode,
          ownerName: draftContract.contract.ownerName,
          baseRentPrice: draftContract.contract.baseRentPrice,
          depositAmount: draftContract.contract.depositAmount,
          startDate: draftContract.contract.startDate,
          endDate: draftContract.contract.endDate,
          contractScanUrl: draftContract.contract.contractScanUrl,
        });
      }
      setPdfFileName(draftContract.pdfFileName || '');

      try {
        const contract = await inboundContractService.getContractByProperty(property.id);
        setContractData({
          contractCode: contract.contractCode,
          ownerName: contract.ownerName,
          baseRentPrice: contract.baseRentPrice,
          depositAmount: contract.depositAmount,
          startDate: contract.startDate,
          endDate: contract.endDate,
          contractScanUrl: contract.contractScanUrl,
        });
      } catch {
        // Chưa có hợp đồng thật, dùng draft local nếu có.
      }

      try {
        const apiEquipments = await equipmentService.getEquipmentsByProperty(property.id);
        const draftEquipments = adminOnboardingDraftService.getEquipmentDraft(property.id);
        const merged = [...apiEquipments, ...draftEquipments].filter(
          (item, index, arr) => arr.findIndex(other => other.name === item.name) === index
        );
        setSavedEquipments(merged);
        setSelectedEquipments(merged.filter(item => EQUIPMENT_TEMPLATES.includes(item.name)).map(item => item.name));
        setSelectedInteriors(merged.filter(item => INTERIOR_TEMPLATES.includes(item.name)).map(item => item.name));
      } catch {
        const draftEquipments = adminOnboardingDraftService.getEquipmentDraft(property.id);
        setSavedEquipments(draftEquipments);
        setSelectedEquipments(draftEquipments.filter(item => EQUIPMENT_TEMPLATES.includes(item.name)).map(item => item.name));
        setSelectedInteriors(draftEquipments.filter(item => INTERIOR_TEMPLATES.includes(item.name)).map(item => item.name));
      }
    };

    fetchLinkedData();
  }, [property]);

  const selectedNames = useMemo(
    () => [...selectedEquipments, ...selectedInteriors, ...customEquipment.split(',').map(item => item.trim()).filter(Boolean)],
    [customEquipment, selectedEquipments, selectedInteriors]
  );

  const toggleSelection = (name: string, group: 'equipment' | 'interior') => {
    const setValue = group === 'equipment' ? setSelectedEquipments : setSelectedInteriors;
    setValue(prev => prev.includes(name) ? prev.filter(item => item !== name) : [...prev, name]);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = event.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (event.target as HTMLInputElement).checked : type === 'number' ? Number(value) : value,
    }));
  };

  const saveEquipments = async (propertyId: number) => {
    const existingNames = new Set(savedEquipments.map(item => item.name));
    const newNames = selectedNames.filter(name => !existingNames.has(name));
    const localCreated: EquipmentResponse[] = [];

    for (const name of newNames) {
      const payload: AddEquipmentRequest = {
        name,
        source: 'INITIAL_HANDOVER',
        status: 'GOOD',
        note: INTERIOR_TEMPLATES.includes(name) ? 'Nội thất kèm theo nếu có trong hợp đồng' : 'Thiết bị bàn giao ban đầu',
      };

      try {
        await equipmentService.addEquipment(propertyId, payload);
      } catch {
        localCreated.push({
          id: -hashId(`${propertyId}-${name}`),
          propertyId,
          name,
          source: payload.source,
          status: payload.status,
          note: payload.note,
        });
      }
    }

    if (localCreated.length > 0) {
      adminOnboardingDraftService.saveEquipmentDraft(propertyId, [
        ...adminOnboardingDraftService.getEquipmentDraft(propertyId),
        ...localCreated,
      ]);
    }
  };

  const saveContract = async (propertyId: number) => {
    const payload: CreateInboundContractRequest = {
      ...contractData,
      contractScanUrl: pdfFileName ? `local://${pdfFileName}` : contractData.contractScanUrl,
    };

    if (!payload.contractCode || !payload.ownerName || !payload.startDate || !payload.endDate) {
      return;
    }

    try {
      const contract = await inboundContractService.signContract(propertyId, payload);
      adminOnboardingDraftService.saveContractDraft(propertyId, { contract, pdfFileName });
    } catch {
      adminOnboardingDraftService.saveContractDraft(propertyId, {
        pdfFileName,
        contract: {
          id: -hashId(`${propertyId}-${payload.contractCode}`),
          propertyId,
          ...payload,
          contractScanUrl: payload.contractScanUrl,
          status: 'ACTIVE',
        },
      });
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload: PropertyCreateRequest = {
        ...formData,
        totalRooms: formData.wholeHouse ? Number(formData.totalRooms || 1) : Number(formData.totalRooms || 0),
        managedBy: formData.managedBy || 1,
      };

      const savedProperty = isUpdate && property
        ? await propertyService.updateProperty(property.id, payload)
        : await propertyService.createProperty(payload);

      await saveContract(savedProperty.id);
      await saveEquipments(savedProperty.id);
      onSaved(savedProperty);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Có lỗi xảy ra khi lưu thông tin căn nhà.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-black text-slate-900">1. Nhập thông tin nhà thuê từ chủ sở hữu</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Admin nhập lại dữ liệu cơ bản theo hợp đồng Hoàng Bình Land đã ký: cấu trúc nhà, số phòng, thiết bị bàn giao và file hợp đồng PDF.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-5">
            <h3 className="flex items-center gap-2 border-b border-slate-100 pb-2 text-base font-bold text-slate-800">
              <Building className="h-5 w-5 text-indigo-500" /> Thông tin căn nhà
            </h3>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Tên tòa nhà / căn nhà *</span>
              <input required name="propertyName" value={formData.propertyName} onChange={handleChange} className="input-field" placeholder="Ví dụ: Nhà Nguyễn Duy Trinh" />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Địa chỉ *</span>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input required name="address" value={formData.address} onChange={handleChange} className="input-field pl-9" placeholder="Số nhà, đường, phường/xã..." />
              </div>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Khu vực *</span>
                <select required name="zoneId" value={formData.zoneId} onChange={handleChange} className="input-field">
                  {zones.map(zone => (
                    <option key={zone.id} value={zone.id}>{zone.fullName || zone.name}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Diện tích sử dụng (m2)</span>
                <input type="number" name="areaSize" value={formData.areaSize || ''} onChange={handleChange} className="input-field" placeholder="65" />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
                <input type="checkbox" name="wholeHouse" checked={formData.wholeHouse} onChange={handleChange} className="mt-1 h-5 w-5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-600" />
                <span>
                  <span className="block font-bold text-indigo-950">Nhà nguyên căn</span>
                  <span className="mt-1 block text-xs text-indigo-700">Admin có thể đổi sang cho thuê theo phòng ở bước 3.</span>
                </span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Số phòng theo hợp đồng *</span>
                <input required min={1} type="number" name="totalRooms" value={formData.totalRooms || ''} onChange={handleChange} className="input-field" placeholder="Ví dụ: 8" />
              </label>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Ghi chú cấu trúc</span>
              <textarea name="descriptions" value={formData.descriptions} onChange={handleChange} className="input-field min-h-[104px]" placeholder="Số tầng, khu bếp, sân thượng, tình trạng bàn giao..." />
            </label>
          </section>

          <section className="space-y-5">
            <h3 className="flex items-center gap-2 border-b border-slate-100 pb-2 text-base font-bold text-slate-800">
              <FileText className="h-5 w-5 text-indigo-500" /> Hợp đồng gốc
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Mã hợp đồng *</span>
                <input required value={contractData.contractCode} onChange={event => setContractData(prev => ({ ...prev, contractCode: event.target.value }))} className="input-field" placeholder="HDG-001" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Chủ sở hữu gốc *</span>
                <input required value={contractData.ownerName} onChange={event => setContractData(prev => ({ ...prev, ownerName: event.target.value }))} className="input-field" placeholder="Nguyễn Văn A" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Giá thuê gốc/tháng *</span>
                <input required type="number" value={contractData.baseRentPrice || ''} onChange={event => setContractData(prev => ({ ...prev, baseRentPrice: Number(event.target.value) }))} className="input-field" placeholder="15000000" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Tiền cọc gốc *</span>
                <input required type="number" value={contractData.depositAmount || ''} onChange={event => setContractData(prev => ({ ...prev, depositAmount: Number(event.target.value) }))} className="input-field" placeholder="30000000" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Ngày bắt đầu *</span>
                <input required type="date" value={contractData.startDate} onChange={event => setContractData(prev => ({ ...prev, startDate: event.target.value }))} className="input-field" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Ngày kết thúc *</span>
                <input required type="date" value={contractData.endDate} onChange={event => setContractData(prev => ({ ...prev, endDate: event.target.value }))} className="input-field" />
              </label>
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-600 hover:border-indigo-300 hover:bg-indigo-50">
              <Upload className="h-5 w-5 text-indigo-500" />
              <span className="flex-1 truncate">{pdfFileName || 'Thêm hợp đồng PDF để lưu trữ'}</span>
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={event => setPdfFileName(event.target.files?.[0]?.name || '')}
              />
            </label>
          </section>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-base font-bold text-slate-800">
                <PackageCheck className="h-5 w-5 text-indigo-500" /> Trang thiết bị bàn giao
              </h3>
              <p className="mt-1 text-sm text-slate-500">Chọn nhiều mục có sẵn theo hợp đồng. Nội thất là phần nếu có, không bắt buộc.</p>
            </div>
            <div className="hidden rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-500 sm:block">
              Đã chọn {selectedNames.length} mục
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Thiết bị chính</p>
              <div className="flex flex-wrap gap-2">
                {EQUIPMENT_TEMPLATES.map(name => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleSelection(name, 'equipment')}
                    className={`rounded-full border px-3 py-1.5 text-sm font-bold transition ${selectedEquipments.includes(name) ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'}`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Nội thất nếu có</p>
              <div className="flex flex-wrap gap-2">
                {INTERIOR_TEMPLATES.map(name => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleSelection(name, 'interior')}
                    className={`rounded-full border px-3 py-1.5 text-sm font-bold transition ${selectedInteriors.includes(name) ? 'border-emerald-500 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'}`}
                  >
                    {name}
                  </button>
                ))}
              </div>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Thiết bị khác</span>
                <input value={customEquipment} onChange={event => setCustomEquipment(event.target.value)} className="input-field" placeholder="Nhập nhiều mục, cách nhau bằng dấu phẩy" />
              </label>
            </div>
          </div>
        </section>

        <div className="flex justify-end border-t border-slate-100 pt-6">
          <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2 rounded-xl px-8 py-3 shadow-lg shadow-indigo-500/20">
            <Home className="h-5 w-5" />
            {loading ? 'Đang lưu...' : 'Lưu thông tin và qua cải tạo'}
            {!loading && <ArrowRight className="h-5 w-5" />}
          </button>
        </div>
      </form>
    </div>
  );
};
