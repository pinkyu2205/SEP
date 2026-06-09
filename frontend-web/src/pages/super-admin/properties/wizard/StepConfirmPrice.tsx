import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BadgeCheck, Building2, FileCheck2, Send, TriangleAlert } from 'lucide-react';
import type { DepreciationCalculationResponse, PropertyResponse } from '../../../../types/api.types';
import { activationService } from '../../../../services/activation.service';
import { adminOnboardingDraftService } from '../../../../services/admin-onboarding-draft.service';
import { depreciationService } from '../../../../services/depreciation.service';
import { propertyService } from '../../../../services/property.service';

interface StepConfirmPriceProps {
  property: PropertyResponse;
  onNext: () => void;
  onBack: () => void;
  onSuccess: () => void;
}

const money = (value?: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value || 0);

export const StepConfirmPrice = ({ property, onNext, onBack, onSuccess }: StepConfirmPriceProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [depreciation, setDepreciation] = useState<DepreciationCalculationResponse | null>(null);
  const [availability, setAvailability] = useState(() => adminOnboardingDraftService.getAvailability(property));
  const [propertyPrice, setPropertyPrice] = useState(property.price || 0);
  const [propertyDeposit, setPropertyDeposit] = useState(property.deposit || 0);

  const contractDraft = adminOnboardingDraftService.getContractDraft(property.id);
  const renovationBatches = adminOnboardingDraftService.getRenovationBatches(property.id);
  const equipments = adminOnboardingDraftService.getEquipmentDraft(property.id);
  const activeRenovationTotal = renovationBatches
    .filter(batch => batch.active)
    .flatMap(batch => batch.items)
    .reduce((sum, item) => sum + Number(item.cost || 0), 0);

  useEffect(() => {
    const fetchDepreciation = async () => {
      try {
        const data = await depreciationService.getByProperty(property.id);
        setDepreciation(data);
        const suggested = data.wholeHouseResult?.suggestedMinPrice || data.roomResults?.[0]?.suggestedMinPrice || 0;
        setPropertyPrice(prev => prev || suggested);
        setPropertyDeposit(prev => prev || suggested);
      } catch {
        setDepreciation(null);
      }
    };

    fetchDepreciation();
  }, [property.id]);

  const suggestedMinPrice = useMemo(
    () => depreciation?.wholeHouseResult?.suggestedMinPrice || depreciation?.roomResults?.[0]?.suggestedMinPrice || property.price || 0,
    [depreciation, property.price]
  );

  const handleActivate = async () => {
    setLoading(true);
    setError('');

    try {
      if (availability.rentalMode === 'whole_house' && propertyPrice > 0) {
        await activationService.confirmActivation(property.id, {
          propertyPrice,
          propertyDeposit: propertyDeposit || propertyPrice,
          hasOngoingRenovation: renovationBatches.some(batch => batch.active && batch.items.some(item => !item.completed)),
        });
      } else {
        await propertyService.updateProperty(property.id, {
          propertyName: property.propertyName,
          address: property.shortAddress || property.fullAddress,
          descriptions: property.descriptions,
          zoneId: property.zoneId,
          areaSize: property.areaSize,
          totalRooms: property.totalRooms,
          wholeHouse: availability.rentalMode === 'whole_house',
          managedBy: 1,
        });
      }

      adminOnboardingDraftService.saveAvailability(property.id, {
        ...availability,
        available: true,
        assignedToHost: true,
        activatedAt: new Date().toISOString(),
      });
      onSuccess();
      onNext();
    } catch (err: any) {
      adminOnboardingDraftService.saveAvailability(property.id, {
        ...availability,
        available: true,
        assignedToHost: true,
        activatedAt: new Date().toISOString(),
      });
      setError(err.response?.data?.message || 'BE chưa kích hoạt được, FE đã lưu trạng thái available giả lập để Host nhìn thấy khi có API.');
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-black text-slate-900">3. Duyệt căn nhà và chuyển cho Host</h2>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Admin kiểm tra dữ liệu đã nhập, quyết định cho thuê nguyên căn hoặc theo phòng, rồi đặt căn nhà ở trạng thái available.
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <section className="mb-6 grid gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Căn nhà</p>
          <p className="mt-2 truncate text-lg font-black text-slate-950">{property.propertyName}</p>
          <p className="mt-1 text-xs text-slate-500">{property.zoneName || 'Chưa có zone'}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Số phòng</p>
          <p className="mt-2 text-lg font-black text-indigo-700">{property.totalRooms || 1}</p>
          <p className="mt-1 text-xs text-slate-500">{property.areaSize || 0} m2 sử dụng</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Cải tạo hiện hành</p>
          <p className="mt-2 text-lg font-black text-amber-700">{money(activeRenovationTotal)}</p>
          <p className="mt-1 text-xs text-slate-500">{renovationBatches.filter(batch => batch.active).length} đợt đang áp dụng</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Giá sàn đề xuất</p>
          <p className="mt-2 text-lg font-black text-emerald-700">{money(suggestedMinPrice)}</p>
          <p className="mt-1 text-xs text-slate-500">Từ API hoặc tạm tính FE</p>
        </div>
      </section>

      <section className="mb-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 flex items-center gap-2 text-base font-black text-slate-900">
            <Building2 className="h-5 w-5 text-indigo-500" /> Hình thức cho thuê
          </h3>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className={`cursor-pointer rounded-xl border p-4 ${availability.rentalMode === 'whole_house' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-start gap-3">
                <input type="radio" checked={availability.rentalMode === 'whole_house'} onChange={() => setAvailability(prev => ({ ...prev, rentalMode: 'whole_house' }))} className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-600" />
                <div>
                  <p className="font-black text-slate-900">Cho thuê nguyên căn</p>
                  <p className="mt-1 text-xs text-slate-500">Host sẽ khai thác một giá thuê cho toàn bộ căn nhà.</p>
                </div>
              </div>
            </label>
            <label className={`cursor-pointer rounded-xl border p-4 ${availability.rentalMode === 'by_room' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
              <div className="flex items-start gap-3">
                <input type="radio" checked={availability.rentalMode === 'by_room'} onChange={() => setAvailability(prev => ({ ...prev, rentalMode: 'by_room' }))} className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-600" />
                <div>
                  <p className="font-black text-slate-900">Cho thuê theo phòng</p>
                  <p className="mt-1 text-xs text-slate-500">Host sẽ tiếp tục cấu hình phòng và gán Manager quản lý.</p>
                </div>
              </div>
            </label>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Giá thuê dự kiến</span>
              <input type="number" value={propertyPrice || ''} onChange={event => setPropertyPrice(Number(event.target.value))} className="input-field font-bold text-emerald-700" placeholder="Theo giá sàn hoặc Admin nhập" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Tiền cọc dự kiến</span>
              <input type="number" value={propertyDeposit || ''} onChange={event => setPropertyDeposit(Number(event.target.value))} className="input-field" placeholder="Cọc dự kiến" />
            </label>
          </div>

          <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
            <input type="checkbox" checked={availability.available} onChange={event => setAvailability(prev => ({ ...prev, available: event.target.checked }))} className="h-5 w-5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-600" />
            Đánh dấu căn nhà available sau khi duyệt
          </label>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 flex items-center gap-2 text-base font-black text-slate-900">
            <FileCheck2 className="h-5 w-5 text-indigo-500" /> Checklist trước khi chuyển
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
              <span className="font-semibold text-slate-700">Thông tin căn nhà</span>
              <BadgeCheck className="h-5 w-5 text-emerald-500" />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
              <span className="font-semibold text-slate-700">Hợp đồng gốc PDF</span>
              <span className={contractDraft.pdfFileName ? 'font-black text-emerald-600' : 'font-black text-amber-600'}>
                {contractDraft.pdfFileName ? 'Đã có' : 'Chưa có file'}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
              <span className="font-semibold text-slate-700">Thiết bị bàn giao</span>
              <span className="font-black text-slate-900">{equipments.length} mục local</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
              <span className="font-semibold text-slate-700">Host nhận nhà</span>
              <span className="font-black text-indigo-700">{availability.hostName}</span>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            Sau khi available, căn nhà sẽ được đưa sang web Host. Host tiếp tục thêm Manager để quản lý vận hành tòa nhà.
          </div>
        </div>
      </section>

      <div className="flex justify-between border-t border-slate-100 pt-6">
        <button type="button" onClick={onBack} className="flex items-center gap-2 rounded-xl px-6 py-3 font-bold text-slate-500 hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" /> Quay lại
        </button>
        <button type="button" onClick={handleActivate} disabled={loading || !availability.available} className="btn-primary flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 shadow-lg shadow-emerald-500/20 hover:bg-emerald-700">
          <Send className="h-5 w-5" />
          {loading ? 'Đang chuyển...' : 'Duyệt available và chuyển Host'}
        </button>
      </div>
    </div>
  );
};
