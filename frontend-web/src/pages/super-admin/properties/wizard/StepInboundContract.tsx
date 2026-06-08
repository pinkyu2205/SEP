import { useState, useEffect } from 'react';
import { FileText, ArrowRight, ArrowLeft, CheckCircle2 } from 'lucide-react';
import type { PropertyResponse, InboundContractResponse, CreateInboundContractRequest } from '../../../../types/api.types';
import { inboundContractService } from '../../../../services/inbound-contract.service';

interface StepInboundContractProps {
  property: PropertyResponse;
  onNext: () => void;
  onBack: () => void;
}

export const StepInboundContract = ({ property, onNext, onBack }: StepInboundContractProps) => {
  const [contract, setContract] = useState<InboundContractResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState<CreateInboundContractRequest>({
    contractCode: '',
    ownerName: '',
    baseRentPrice: 0,
    depositAmount: 0,
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    fetchContract();
  }, [property.id]);

  const fetchContract = async () => {
    setLoading(true);
    try {
      const data = await inboundContractService.getContractByProperty(property.id);
      setContract(data);
    } catch (err: any) {
      if (err.response?.status !== 404) {
        console.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.contractCode || !formData.startDate || !formData.endDate) return;
    setError('');

    try {
      setLoading(true);
      const data = await inboundContractService.signContract(property.id, formData);
      setContract(data);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || 'Lỗi khi ký hợp đồng');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-black text-slate-900">Hợp đồng gốc (Inbound Contract)</h2>
        <p className="text-sm font-medium text-slate-500 mt-1">
          Khai báo thông tin hợp đồng thuê tổng với chủ nhà. Dữ liệu này dùng để tính toán khấu hao.
        </p>
      </div>

      {loading && !contract && (
        <div className="py-10 text-center text-slate-400">Đang tải...</div>
      )}

      {!loading && contract && (
        <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-2xl mb-8 flex items-start gap-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 shrink-0" />
          <div className="flex-1">
            <h3 className="font-black text-emerald-900 text-lg mb-1">Đã ký hợp đồng gốc</h3>
            <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
              <div>
                <p className="text-emerald-700">Mã hợp đồng:</p>
                <p className="font-bold text-emerald-950">{contract.contractCode}</p>
              </div>
              <div>
                <p className="text-emerald-700">Chủ nhà:</p>
                <p className="font-bold text-emerald-950">{contract.ownerName}</p>
              </div>
              <div>
                <p className="text-emerald-700">Giá thuê/tháng:</p>
                <p className="font-bold text-emerald-950">{contract.baseRentPrice.toLocaleString()} VNĐ</p>
              </div>
              <div>
                <p className="text-emerald-700">Tiền cọc:</p>
                <p className="font-bold text-emerald-950">{contract.depositAmount.toLocaleString()} VNĐ</p>
              </div>
              <div>
                <p className="text-emerald-700">Ngày bắt đầu:</p>
                <p className="font-bold text-emerald-950">{contract.startDate}</p>
              </div>
              <div>
                <p className="text-emerald-700">Ngày kết thúc:</p>
                <p className="font-bold text-emerald-950">{contract.endDate}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && !contract && (
        <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 p-6 rounded-2xl mb-8">
          {error && <div className="mb-4 p-3 bg-rose-50 text-rose-700 rounded-lg text-sm">{error}</div>}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Mã hợp đồng *</span>
              <input required value={formData.contractCode} onChange={e => setFormData({ ...formData, contractCode: e.target.value })} className="input-field" placeholder="VD: HDG-001" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Tên chủ nhà *</span>
              <input required value={formData.ownerName} onChange={e => setFormData({ ...formData, ownerName: e.target.value })} className="input-field" placeholder="VD: Nguyễn Văn A" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Giá thuê gộp mỗi tháng (VNĐ) *</span>
              <input required type="number" value={formData.baseRentPrice || ''} onChange={e => setFormData({ ...formData, baseRentPrice: Number(e.target.value) })} className="input-field" placeholder="VD: 15000000" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Tiền cọc tổng (VNĐ) *</span>
              <input required type="number" value={formData.depositAmount || ''} onChange={e => setFormData({ ...formData, depositAmount: Number(e.target.value) })} className="input-field" placeholder="VD: 30000000" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Ngày bắt đầu hiệu lực *</span>
              <input required type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} className="input-field" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Ngày kết thúc *</span>
              <input required type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} className="input-field" />
            </label>
          </div>
          
          <div className="mt-6 flex justify-end">
            <button type="submit" disabled={loading} className="btn-primary rounded-xl px-6 py-2.5 flex items-center gap-2">
              <FileText className="w-5 h-5" /> Lưu Hợp đồng
            </button>
          </div>
        </form>
      )}

      <div className="flex justify-between pt-6 border-t border-slate-100">
        <button type="button" onClick={onBack} className="rounded-xl px-6 py-3 font-bold text-slate-500 hover:bg-slate-100 flex items-center gap-2">
          <ArrowLeft className="w-5 h-5" /> Quay lại
        </button>
        <button type="button" onClick={onNext} disabled={!contract} className="btn-primary rounded-xl px-8 py-3 flex items-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed">
          Tiếp tục <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
