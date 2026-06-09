import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Calculator, History, Hammer, Plus, ShieldCheck, X } from 'lucide-react';
import type { AddRenovationRequest, DepreciationCalculationResponse, PropertyResponse, RenovationResponse } from '../../../../types/api.types';
import { adminOnboardingDraftService, type AdminRenovationBatch } from '../../../../services/admin-onboarding-draft.service';
import { depreciationService } from '../../../../services/depreciation.service';
import { renovationService } from '../../../../services/renovation.service';

interface StepRenovationsProps {
  property: PropertyResponse;
  onNext: () => void;
  onBack: () => void;
}

type DraftItem = AddRenovationRequest & { localId: string };

const money = (value?: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value || 0);

const today = () => new Date().toISOString().slice(0, 10);

const addMonths = (date: string, months: number) => {
  const next = new Date(date || today());
  next.setMonth(next.getMonth() + months);
  return next.toISOString().slice(0, 10);
};

const monthsBetween = (startDate?: string, endDate?: string) => {
  if (!startDate || !endDate) return 1;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const months = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
  return Math.max(1, months);
};

export const StepRenovations = ({ property, onNext, onBack }: StepRenovationsProps) => {
  const [batches, setBatches] = useState<AdminRenovationBatch[]>([]);
  const [apiRenovations, setApiRenovations] = useState<RenovationResponse[]>([]);
  const [depreciation, setDepreciation] = useState<DepreciationCalculationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState('');
  const [skipRenovation, setSkipRenovation] = useState(false);

  const [title, setTitle] = useState('Cải tạo ban đầu');
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(addMonths(today(), 1));
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const [reservePercent, setReservePercent] = useState(8);
  const [monthlyOperatingCost, setMonthlyOperatingCost] = useState(0);
  const [items, setItems] = useState<DraftItem[]>([
    { localId: 'first', description: '', cost: 0, completed: true },
  ]);

  const refresh = async () => {
    setLoading(true);
    try {
      setBatches(adminOnboardingDraftService.getRenovationBatches(property.id));
      const apiItems = await renovationService.getRenovationsByProperty(property.id);
      setApiRenovations(apiItems);
    } catch {
      setApiRenovations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [property.id]);

  const activeItems = useMemo(() => {
    const batchItems = batches.filter(batch => batch.active).flatMap(batch => batch.items);
    return [...batchItems, ...apiRenovations];
  }, [apiRenovations, batches]);

  const renovationTotal = useMemo(
    () => activeItems.reduce((sum, item) => sum + Number(item.cost || 0), 0),
    [activeItems]
  );
  const reserveAmount = renovationTotal * (reservePercent / 100);
  const monthlyReserve = reserveAmount / monthsBetween(startDate, endDate);

  const updateItem = (localId: string, patch: Partial<DraftItem>) => {
    setItems(prev => prev.map(item => item.localId === localId ? { ...item, ...patch } : item));
  };

  const addItem = () => {
    setItems(prev => [...prev, { localId: `${Date.now()}`, description: '', cost: 0, completed: true }]);
  };

  const removeItem = (localId: string) => {
    setItems(prev => prev.length === 1 ? prev : prev.filter(item => item.localId !== localId));
  };

  const saveRenovationBatch = async () => {
    const validItems = items.filter(item => item.description.trim());
    if (validItems.length === 0) {
      setError('Nhập ít nhất một hạng mục cải tạo hoặc chọn bỏ qua cải tạo.');
      return false;
    }

    setError('');
    const localCreated: RenovationResponse[] = [];

    for (const item of validItems) {
      const payload: AddRenovationRequest = {
        description: item.description.trim(),
        cost: Number(item.cost || 0),
        completed: item.completed,
      };

      try {
        const saved = await renovationService.addRenovation(property.id, payload);
        localCreated.push(saved);
      } catch {
        localCreated.push({
          id: -Math.abs(Number(item.localId.replace(/\D/g, '')) || Date.now()),
          propertyId: property.id,
          description: payload.description,
          cost: payload.cost,
          completed: payload.completed ?? true,
        });
      }
    }

    adminOnboardingDraftService.saveRenovationBatch(property.id, {
      title,
      startDate,
      endDate,
      mode,
      reservePercent,
      items: localCreated,
    });

    await refresh();
    setItems([{ localId: `${Date.now()}`, description: '', cost: 0, completed: true }]);
    return true;
  };

  const handleCalculate = async () => {
    setCalculating(true);
    setError('');
    try {
      const data = await depreciationService.calculate(property.id, {
        monthlyOperatingCost: monthlyOperatingCost + monthlyReserve,
      });
      setDepreciation(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'BE chưa tính được khấu hao. Màn hình vẫn hiển thị tạm tính FE để tiếp tục luồng.');
      setDepreciation(null);
    } finally {
      setCalculating(false);
    }
  };

  const handleNext = async () => {
    if (!skipRenovation && items.some(item => item.description.trim())) {
      const ok = await saveRenovationBatch();
      if (!ok) return;
    }
    onNext();
  };

  const estimatedMonthly = renovationTotal / monthsBetween(startDate, endDate);
  const suggestedFloor = (property.price || 0) + estimatedMonthly + monthlyOperatingCost + monthlyReserve;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">2. Cải tạo và khấu hao</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Admin có thể bỏ qua cải tạo, hoặc nhập các đợt cải tạo để hệ thống phân bổ chi phí theo tháng và lưu lịch sử.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">
          <input type="checkbox" checked={skipRenovation} onChange={event => setSkipRenovation(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600" />
          Không cải tạo
        </label>
      </div>

      {error && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          {error}
        </div>
      )}

      {!skipRenovation && (
        <section className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="mb-5 grid gap-4 lg:grid-cols-4">
            <label className="block lg:col-span-2">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Tên đợt cải tạo</span>
              <input value={title} onChange={event => setTitle(event.target.value)} className="input-field" placeholder="Cải tạo ban đầu, cải tạo sau gia hạn..." />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Áp dụng từ ngày</span>
              <input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} className="input-field" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Đến ngày</span>
              <input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} className="input-field" />
            </label>
          </div>

          <div className="mb-5 grid gap-4 lg:grid-cols-3">
            <label className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-600" />
                <div>
                  <p className="font-bold text-slate-900">Cải tạo mới thay thế</p>
                  <p className="mt-1 text-xs text-slate-500">Đợt cũ sẽ bị disable, chỉ dùng đợt mới để tính hiện hành.</p>
                </div>
              </div>
            </label>
            <label className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <input type="radio" checked={mode === 'append'} onChange={() => setMode('append')} className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-600" />
                <div>
                  <p className="font-bold text-slate-900">Cộng dồn cải tạo cũ</p>
                  <p className="mt-1 text-xs text-slate-500">Đợt mới cộng thêm vào chi phí cải tạo đang hiệu lực.</p>
                </div>
              </div>
            </label>
            <label className="block rounded-xl border border-slate-200 bg-white p-4">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Chi phí dự phòng (%)</span>
              <input type="number" min={0} max={100} value={reservePercent} onChange={event => setReservePercent(Number(event.target.value))} className="input-field" />
            </label>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={item.localId} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-[1fr_180px_140px_36px]">
                <label className="block">
                  <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Hạng mục {index + 1}</span>
                  <input value={item.description} onChange={event => updateItem(item.localId, { description: event.target.value })} className="input-field" placeholder="Sơn lại tầng 1, thay hệ thống điện..." />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Chi phí</span>
                  <input type="number" value={item.cost || ''} onChange={event => updateItem(item.localId, { cost: Number(event.target.value) })} className="input-field" placeholder="5000000" />
                </label>
                <label className="flex items-end gap-2 pb-2 text-sm font-bold text-slate-700">
                  <input type="checkbox" checked={item.completed ?? true} onChange={event => updateItem(item.localId, { completed: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600" />
                  Đã xong
                </label>
                <button type="button" onClick={() => removeItem(item.localId)} className="mt-5 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Xóa hạng mục">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-between">
            <button type="button" onClick={addItem} className="btn-secondary flex items-center gap-2 rounded-xl">
              <Plus className="h-4 w-4" /> Thêm hạng mục
            </button>
            <button type="button" onClick={saveRenovationBatch} className="btn-primary flex items-center gap-2 rounded-xl">
              <Hammer className="h-4 w-4" /> Lưu đợt cải tạo
            </button>
          </div>
        </section>
      )}

      <section className="mb-6 grid gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Tổng cải tạo hiện hành</p>
          <p className="mt-2 text-xl font-black text-slate-950">{money(renovationTotal)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Dự phòng cải tạo</p>
          <p className="mt-2 text-xl font-black text-amber-700">{money(reserveAmount)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Phân bổ/tháng</p>
          <p className="mt-2 text-xl font-black text-indigo-700">{money(estimatedMonthly + monthlyReserve)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Giá sàn FE tạm tính</p>
          <p className="mt-2 text-xl font-black text-emerald-700">{money(suggestedFloor)}</p>
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <label className="block max-w-sm flex-1">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">Chi phí vận hành/tháng</span>
            <input type="number" value={monthlyOperatingCost || ''} onChange={event => setMonthlyOperatingCost(Number(event.target.value))} className="input-field" placeholder="Vệ sinh, điện chung, bảo trì..." />
          </label>
          <button type="button" onClick={handleCalculate} disabled={calculating} className="btn-primary flex items-center gap-2 rounded-xl px-5 py-2.5">
            <Calculator className="h-4 w-4" />
            {calculating ? 'Đang tính...' : 'Tính khấu hao bằng API'}
          </button>
        </div>

        {depreciation ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="flex items-center gap-2 font-black">
              <ShieldCheck className="h-5 w-5" /> API khấu hao đã trả kết quả
            </div>
            <p className="mt-2">
              Giá sàn đề xuất:{' '}
              <strong>
                {money(depreciation.wholeHouseResult?.suggestedMinPrice || depreciation.roomResults?.[0]?.suggestedMinPrice || 0)}
              </strong>
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Nếu API khấu hao chưa đủ dữ liệu hợp đồng/cải tạo, FE vẫn giữ tạm tính để Admin xem trước.</p>
        )}
      </section>

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-4 flex items-center gap-2 text-base font-black text-slate-900">
          <History className="h-5 w-5 text-indigo-500" /> Lịch sử cải tạo
        </h3>
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-400">Đang tải lịch sử...</div>
        ) : batches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm font-semibold text-slate-500">
            Chưa có đợt cải tạo nào được lưu.
          </div>
        ) : (
          <div className="space-y-3">
            {batches.map(batch => (
              <div key={batch.id} className={`rounded-xl border p-4 ${batch.active ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-black text-slate-900">{batch.title}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {batch.startDate} đến {batch.endDate} · {batch.mode === 'replace' ? 'Thay thế đợt cũ' : 'Cộng dồn'} · Dự phòng {batch.reservePercent}%
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-black ${batch.active ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                    {batch.active ? 'Đang áp dụng' : 'Đã disable'}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {batch.items.map(item => (
                    <div key={item.id} className="rounded-lg bg-white px-3 py-2 text-sm">
                      <span className="font-bold text-slate-800">{item.description}</span>
                      <span className="ml-2 text-slate-500">{money(item.cost)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex justify-between border-t border-slate-100 pt-6">
        <button type="button" onClick={onBack} className="flex items-center gap-2 rounded-xl px-6 py-3 font-bold text-slate-500 hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" /> Quay lại
        </button>
        <button type="button" onClick={handleNext} className="btn-primary flex items-center gap-2 rounded-xl px-8 py-3 shadow-lg shadow-indigo-500/20">
          Qua bước duyệt cho thuê <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
};
