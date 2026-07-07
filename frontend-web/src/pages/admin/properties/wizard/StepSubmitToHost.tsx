import { useState, useEffect } from 'react';
import { Send, CheckCircle2, AlertCircle } from 'lucide-react';
import type { PropertyResponse, PricingResponse } from '@/types/api.types';
import { propertyService } from '@/services/property.service';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const formatVND = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);

interface StepSubmitToHostProps {
  property: PropertyResponse;
  onBack: () => void;
  onSuccess: () => void;
}

export const StepSubmitToHost = ({ property, onBack, onSuccess }: StepSubmitToHostProps) => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pricing, setPricing] = useState<PricingResponse | null>(null);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successStatus, setSuccessStatus] = useState<'UNDER_RENOVATION' | 'PENDING_HOST_REVIEW' | null>(null);

  useEffect(() => {
    const fetchPricing = async () => {
      setLoading(true);
      try {
        const res = await propertyService.calculateDepreciation(property.id);
        setPricing(res);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Lỗi khi tính toán giá đề xuất');
      } finally {
        setLoading(false);
      }
    };
    fetchPricing();
  }, [property.id]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const summary = await propertyService.submitToHost(property.id);
      setConfirmOpen(false);
      setSuccessStatus(summary.status as 'UNDER_RENOVATION' | 'PENDING_HOST_REVIEW');
    } catch (err: any) {
      const data = err.response?.data;
      const msg = data?.message || data?.error || (typeof data === 'string' ? data : null)
        || `Lỗi ${err.response?.status ?? ''} khi gửi cho Host`;
      setError(msg);
      setConfirmOpen(false);
      console.error('submit-to-host error:', data);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="py-20 text-center text-slate-500">Đang tính toán giá...</div>;

  if (successStatus) {
    return (
      <div className="py-16 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-black text-slate-900">Hoàn tất Onboarding!</h2>
        
        {successStatus === 'UNDER_RENOVATION' ? (
          <div className="mt-4 mx-auto max-w-md rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">
            <p className="font-bold text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" /> Tòa nhà đang được cải tạo
            </p>
            <p className="mt-2 text-sm text-amber-700">
              Quy trình Onboarding đã chốt xong. Tuy nhiên tòa nhà cần hoàn tất cải tạo. 
              Sau khi thi công xong, hãy quay lại và bấm <b>Hoàn tất Cải tạo</b> để gửi giá cho Host duyệt.
            </p>
          </div>
        ) : (
          <div className="mt-4 mx-auto max-w-md rounded-xl border border-blue-200 bg-blue-50 p-4 text-left">
            <p className="font-bold text-blue-800 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" /> Đã gửi cho Host
            </p>
            <p className="mt-2 text-sm text-blue-700">
              Hồ sơ tòa nhà và bảng giá đề xuất đã được gửi thành công. Vui lòng chờ Host đăng nhập để xét duyệt và kích hoạt tòa nhà.
            </p>
          </div>
        )}

        <button onClick={onSuccess} className="btn-primary mt-8 rounded-xl px-8 py-3">Quay về danh sách tòa nhà</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="text-center max-w-2xl mx-auto mb-8">
        <h2 className="text-2xl font-black text-slate-900">Bảng giá tham khảo (Break-even)</h2>
        <p className="mt-2 text-sm text-slate-500">
          Hệ thống đã tự động tính toán chi phí khấu hao từ Hợp đồng Inbound, Thiết bị và chi phí Cải tạo để đưa ra mức giá sàn gợi ý.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      {pricing && (
        <div className="max-w-3xl mx-auto">
          {pricing.pricingScope === 'WHOLE_HOUSE' && pricing.wholeHouseResult && (
            <div className="rounded-2xl border-2 border-indigo-200 bg-white overflow-hidden shadow-lg shadow-indigo-100">
              <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100">
                <h3 className="font-bold text-indigo-900 text-lg">Cho thuê Nguyên Căn</h3>
              </div>
              <div className="p-6 grid grid-cols-2 gap-y-6 gap-x-8">
                <div>
                  <p className="text-sm text-slate-500 font-semibold mb-1">Tổng tiền thuê Inbound / tháng</p>
                  <p className="text-xl font-bold text-slate-800">{formatVND(pricing.wholeHouseResult.totalRentAmount)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500 font-semibold mb-1">Thời hạn hợp đồng</p>
                  <p className="text-xl font-bold text-slate-800">{pricing.wholeHouseResult.contractMonths} tháng</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500 font-semibold mb-1">Chi phí thiết bị (mua mới)</p>
                  <p className="text-xl font-bold text-slate-800">{formatVND(pricing.wholeHouseResult.totalEquipmentCost)}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500 font-semibold mb-1">Chi phí cải tạo</p>
                  <p className="text-xl font-bold text-slate-800">{formatVND(pricing.wholeHouseResult.totalRenovationCost)}</p>
                </div>
                
                <div className="col-span-2 bg-slate-50 rounded-xl p-5 border border-slate-200 flex justify-between items-center mt-2">
                  <div>
                    <p className="text-sm font-bold text-slate-700">Giá hoà vốn / tháng (Break-even)</p>
                    <p className="text-xs text-slate-500 mt-1">Bao gồm khấu hao thiết bị & cải tạo</p>
                  </div>
                  <p className="text-xl font-bold text-slate-600">{formatVND(pricing.wholeHouseResult.suggestedMinPrice)}</p>
                </div>

              </div>
            </div>
          )}

          {pricing.pricingScope === 'ROOM' && pricing.roomResults && (
            <div className="rounded-2xl border-2 border-indigo-200 bg-white overflow-hidden shadow-lg shadow-indigo-100">
              <div className="bg-indigo-50 px-6 py-4 border-b border-indigo-100 flex justify-between items-center">
                <h3 className="font-bold text-indigo-900 text-lg">Chia phòng ({pricing.roomResults.length} phòng)</h3>
                <span className="text-sm font-semibold text-indigo-700 bg-indigo-100 px-3 py-1 rounded-full">
                  Tổng giá hoà vốn: {formatVND(pricing.roomResults.reduce((sum, r) => sum + r.suggestedMinPrice, 0))}
                </span>
              </div>
              <div className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-3 px-6 text-left">Phòng</th>
                      <th className="py-3 px-6 text-right">Khấu hao</th>
                      <th className="py-3 px-6 text-right text-slate-600">Giá hoà vốn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricing.roomResults.map(r => (
                      <tr key={r.roomId} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="py-3 px-6 font-bold text-slate-800">{r.roomNumber}</td>
                        <td className="py-3 px-6 text-right text-slate-600">
                          {formatVND(r.monthlyBreakEven - (r.totalEquipmentCost / (r.contractMonths || 1)))}<br/>
                          <span className="text-xs text-slate-400">+ {formatVND(r.totalEquipmentCost / (r.contractMonths || 1))} (TB)</span>
                        </td>
                        <td className="py-3 px-6 text-right font-semibold text-slate-600">{formatVND(r.suggestedMinPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="mt-12 flex justify-between pt-6 border-t border-slate-200 max-w-3xl mx-auto">
        <button onClick={onBack} className="rounded-xl px-6 py-3 text-sm font-bold text-slate-600 hover:bg-slate-100">
          ← Quay lại sửa
        </button>
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={submitting || !pricing}
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-8 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Đang xử lý...' : <><Send className="w-4 h-4" /> Gửi Onboarding cho Host</>}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        tone="success"
        title="Gửi Onboarding cho Host?"
        message={
          <>
            Bạn chắc chắn muốn chốt quy trình Onboarding của <b className="text-slate-700">{property.propertyName}</b> và
            gửi bảng giá cho Host phê duyệt? Sau khi gửi sẽ không thể chỉnh sửa cho đến khi Host phản hồi.
          </>
        }
        confirmText="Gửi cho Host"
        loading={submitting}
        onConfirm={handleSubmit}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};
