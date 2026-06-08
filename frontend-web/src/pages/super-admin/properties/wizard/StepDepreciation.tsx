import { useState, useEffect } from 'react';
import { Calculator, ArrowRight, ArrowLeft, Info } from 'lucide-react';
import type { PropertyResponse, DepreciationCalculationResponse, DepreciationResultResponse } from '../../../../types/api.types';
import { depreciationService } from '../../../../services/depreciation.service';

interface StepDepreciationProps {
  property: PropertyResponse;
  onNext: () => void;
  onBack: () => void;
}

export const StepDepreciation = ({ property, onNext, onBack }: StepDepreciationProps) => {
  const [result, setResult] = useState<DepreciationCalculationResponse | null>(null);
  const [monthlyOperatingCost, setMonthlyOperatingCost] = useState(0);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchExisting();
  }, [property.id]);

  const fetchExisting = async () => {
    setLoading(true);
    try {
      const data = await depreciationService.getByProperty(property.id);
      setResult(data);
      if (data.wholeHouseResult) {
        setMonthlyOperatingCost(data.wholeHouseResult.monthlyOperatingCost);
      } else if (data.roomResults && data.roomResults.length > 0) {
        setMonthlyOperatingCost(data.roomResults[0].monthlyOperatingCost);
      }
    } catch (err: any) {
      if (err.response?.status !== 404) {
        console.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCalculate = async () => {
    setError('');
    setCalculating(true);
    try {
      const data = await depreciationService.calculate(property.id, { monthlyOperatingCost });
      setResult(data);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || 'Lỗi khi tính toán khấu hao. (Đảm bảo đã khai báo Hợp đồng và tất cả cải tạo đã hoàn thành)');
    } finally {
      setCalculating(false);
    }
  };

  const formatMoney = (val?: number) => val ? val.toLocaleString() + 'đ' : '0đ';

  const renderResultTable = (res: DepreciationResultResponse, title: string) => (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-6">
      <div className="bg-slate-50 px-5 py-3 border-b border-slate-200">
        <h4 className="font-bold text-slate-800">{title}</h4>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4 text-sm">
          <div>
            <p className="text-slate-500 mb-1">Tổng chi phí cải tạo</p>
            <p className="font-bold text-slate-900">{formatMoney(res.totalRenovationCost)}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Tổng thiết bị mua mới</p>
            <p className="font-bold text-slate-900">{formatMoney(res.totalEquipmentCost)}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Cọc ban đầu</p>
            <p className="font-bold text-slate-900">{formatMoney(res.originalDeposit)}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Tổng mức đầu tư</p>
            <p className="font-black text-indigo-700">{formatMoney(res.totalInvestment)}</p>
          </div>

          <div>
            <p className="text-slate-500 mb-1">Giá thuê gộp/tháng</p>
            <p className="font-bold text-slate-900">{formatMoney(res.baseRent)}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Khấu hao đầu tư/tháng</p>
            <p className="font-bold text-slate-900">{formatMoney(res.monthlyDepreciation)}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Chi phí vận hành/tháng</p>
            <p className="font-bold text-slate-900">{formatMoney(res.monthlyOperatingCost)}</p>
          </div>
          <div className="bg-indigo-50 p-2 rounded-lg -m-2">
            <p className="text-indigo-800 font-bold mb-1">Giá sàn đề xuất (Hòa vốn)</p>
            <p className="font-black text-xl text-indigo-700">{formatMoney(res.suggestedMinPrice)}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">Tính toán Giá vốn (Khấu hao)</h2>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Hệ thống sẽ tổng hợp tất cả chi phí thiết bị, cải tạo, tiền cọc, tiền thuê để đưa ra mức giá hòa vốn (Giá sàn).
          </p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 mb-8">
        <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-bold mb-1">Quy tắc tính khấu hao:</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Mọi Hạng mục thi công đều phải ở trạng thái <strong>Đã hoàn thành</strong>.</li>
            <li>Khấu hao được phân bổ đều cho số tháng còn lại của Hợp đồng.</li>
          </ul>
        </div>
      </div>

      <div className="flex items-end gap-4 mb-8">
        <label className="block flex-1 max-w-sm">
          <span className="mb-1 block text-sm font-bold text-slate-700">Chi phí vận hành dự kiến hàng tháng (VNĐ)</span>
          <input 
            type="number" 
            value={monthlyOperatingCost || ''} 
            onChange={e => setMonthlyOperatingCost(Number(e.target.value))} 
            className="input-field" 
            placeholder="VD: Tiền điện cầu thang, vệ sinh chung..." 
          />
        </label>
        <button 
          onClick={handleCalculate} 
          disabled={calculating || loading} 
          className="btn-primary rounded-xl px-6 py-2.5 flex items-center gap-2 mb-0.5"
        >
          <Calculator className="w-5 h-5" />
          {calculating ? 'Đang tính...' : 'Tính Giá vốn'}
        </button>
      </div>

      {error && <div className="mb-8 p-4 bg-rose-50 text-rose-700 rounded-xl font-medium text-sm">{error}</div>}

      {loading && !result && (
        <div className="py-10 text-center text-slate-400">Đang tải kết quả cũ...</div>
      )}

      {result && (
        <div className="mb-8">
          <h3 className="font-black text-lg text-slate-800 mb-4">Kết quả tính toán</h3>
          
          {result.wholeHouseResult && renderResultTable(result.wholeHouseResult, 'Nhà nguyên căn')}

          {result.roomResults && result.roomResults.map(r => 
            renderResultTable(r, `Phòng ${r.roomNumber}`)
          )}
        </div>
      )}

      <div className="flex justify-between pt-6 border-t border-slate-100">
        <button type="button" onClick={onBack} className="rounded-xl px-6 py-3 font-bold text-slate-500 hover:bg-slate-100 flex items-center gap-2">
          <ArrowLeft className="w-5 h-5" /> Quay lại
        </button>
        <button type="button" onClick={onNext} disabled={!result} className="btn-primary rounded-xl px-8 py-3 flex items-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
          Tiếp tục <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
