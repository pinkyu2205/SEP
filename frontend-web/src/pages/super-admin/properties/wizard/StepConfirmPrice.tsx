import { useState, useEffect } from 'react';
import { BadgeCheck, ArrowLeft, TriangleAlert } from 'lucide-react';
import type { PropertyResponse, ConfirmPropertyActivationRequest, RoomPriceConfirm, DepreciationCalculationResponse } from '../../../../types/api.types';
import { activationService } from '../../../../services/activation.service';
import { depreciationService } from '../../../../services/depreciation.service';

interface StepConfirmPriceProps {
  property: PropertyResponse;
  onNext: () => void;
  onBack: () => void;
  onSuccess: () => void; // Trigger refresh of the whole wizard to show ACTIVE state
}

export const StepConfirmPrice = ({ property, onNext, onBack, onSuccess }: StepConfirmPriceProps) => {
  const [loading, setLoading] = useState(false);
  const [depreciation, setDepreciation] = useState<DepreciationCalculationResponse | null>(null);
  
  const [propertyPrice, setPropertyPrice] = useState<number>(0);
  const [propertyDeposit, setPropertyDeposit] = useState<number>(0);
  const [roomPrices, setRoomPrices] = useState<Record<number, RoomPriceConfirm>>({});
  
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDepreciation();
  }, [property.id]);

  const fetchDepreciation = async () => {
    try {
      const data = await depreciationService.getByProperty(property.id);
      setDepreciation(data);
      
      // Initialize form data based on suggested minimum prices
      if (property.wholeHouse && data.wholeHouseResult) {
        setPropertyPrice(data.wholeHouseResult.suggestedMinPrice || 0);
        setPropertyDeposit((data.wholeHouseResult.suggestedMinPrice || 0) * 1); // Cọc 1 tháng mặc định
      } else if (data.roomResults) {
        const initRooms: Record<number, RoomPriceConfirm> = {};
        data.roomResults.forEach(r => {
          if (r.roomId) {
            initRooms[r.roomId] = {
              roomId: r.roomId,
              price: r.suggestedMinPrice || 0,
              deposit: (r.suggestedMinPrice || 0) * 1
            };
          }
        });
        setRoomPrices(initRooms);
      }
    } catch (err) {
      console.error('No depreciation found', err);
    }
  };

  const handleRoomChange = (roomId: number, field: 'price' | 'deposit', value: number) => {
    setRoomPrices(prev => ({
      ...prev,
      [roomId]: {
        ...prev[roomId],
        [field]: value
      }
    }));
  };

  const handleActivate = async () => {
    setError('');
    
    // Validate
    if (property.wholeHouse) {
      const min = depreciation?.wholeHouseResult?.suggestedMinPrice || 0;
      if (propertyPrice < min) {
        setError(`Giá thuê nhà nguyên căn không được thấp hơn giá sàn (${min.toLocaleString()}đ)`);
        return;
      }
    } else {
      for (const r of Object.values(roomPrices)) {
        const min = depreciation?.roomResults?.find(x => x.roomId === r.roomId)?.suggestedMinPrice || 0;
        if (r.price < min) {
          setError(`Giá thuê phòng ${depreciation?.roomResults?.find(x => x.roomId === r.roomId)?.roomNumber} không được thấp hơn giá sàn (${min.toLocaleString()}đ)`);
          return;
        }
      }
    }

    setLoading(true);
    try {
      const payload: ConfirmPropertyActivationRequest = {
        propertyPrice: property.wholeHouse ? propertyPrice : undefined,
        propertyDeposit: property.wholeHouse ? propertyDeposit : undefined,
        roomPrices: property.wholeHouse ? undefined : Object.values(roomPrices)
      };

      await activationService.confirmActivation(property.id, payload);
      alert('Kích hoạt thành công! Tòa nhà đã sẵn sàng để kinh doanh.');
      onSuccess(); // Refresh to reflect ACTIVE status
      onNext(); // Proceed to completion
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || 'Có lỗi khi kích hoạt');
    } finally {
      setLoading(false);
    }
  };

  if (!depreciation) {
    return (
      <div className="py-10 text-center text-slate-400">
        Đang tải dữ liệu cấu hình giá...
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-black text-slate-900">Xác nhận Giá & Kích hoạt</h2>
        <p className="text-sm font-medium text-slate-500 mt-1">
          Thiết lập giá cho thuê chính thức. Giá thuê không được thấp hơn Giá sàn.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-700 text-sm font-semibold">
          <TriangleAlert className="w-5 h-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {property.wholeHouse ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-8">
          <h3 className="font-bold text-slate-800 text-lg mb-4">Cấu hình giá: Nhà nguyên căn</h3>
          <div className="bg-indigo-50 p-4 rounded-xl mb-6 flex justify-between items-center">
            <span className="font-bold text-indigo-900">Giá sàn (Khấu hao):</span>
            <span className="font-black text-xl text-indigo-700">{depreciation.wholeHouseResult?.suggestedMinPrice.toLocaleString()} VNĐ</span>
          </div>
          
          <div className="grid grid-cols-2 gap-6">
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Giá cho thuê chính thức (VNĐ/tháng) *</span>
              <input type="number" value={propertyPrice || ''} onChange={e => setPropertyPrice(Number(e.target.value))} className="input-field font-bold text-lg text-emerald-700" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Tiền cọc yêu cầu (VNĐ) *</span>
              <input type="number" value={propertyDeposit || ''} onChange={e => setPropertyDeposit(Number(e.target.value))} className="input-field" />
            </label>
          </div>
        </div>
      ) : (
        <div className="space-y-4 mb-8">
          <h3 className="font-bold text-slate-800 text-lg mb-2">Cấu hình giá cho từng phòng</h3>
          <div className="grid grid-cols-12 gap-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <div className="col-span-3">Phòng</div>
            <div className="col-span-3 text-right pr-2">Giá sàn</div>
            <div className="col-span-3">Giá cho thuê</div>
            <div className="col-span-3">Tiền cọc</div>
          </div>
          
          {depreciation.roomResults?.map(room => (
            <div key={room.roomId} className="grid grid-cols-12 gap-4 items-center bg-white border border-slate-200 p-4 rounded-xl">
              <div className="col-span-3 font-bold text-slate-900">
                Phòng {room.roomNumber}
              </div>
              <div className="col-span-3 text-right pr-4 font-black text-indigo-600">
                {room.suggestedMinPrice.toLocaleString()} đ
              </div>
              <div className="col-span-3">
                <input 
                  type="number" 
                  value={roomPrices[room.roomId!]?.price || ''} 
                  onChange={e => handleRoomChange(room.roomId!, 'price', Number(e.target.value))} 
                  className="input-field font-bold text-emerald-700" 
                />
              </div>
              <div className="col-span-3">
                <input 
                  type="number" 
                  value={roomPrices[room.roomId!]?.deposit || ''} 
                  onChange={e => handleRoomChange(room.roomId!, 'deposit', Number(e.target.value))} 
                  className="input-field" 
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between pt-6 border-t border-slate-100">
        <button type="button" onClick={onBack} className="rounded-xl px-6 py-3 font-bold text-slate-500 hover:bg-slate-100 flex items-center gap-2">
          <ArrowLeft className="w-5 h-5" /> Quay lại
        </button>
        <button type="button" onClick={handleActivate} disabled={loading} className="btn-primary bg-emerald-600 hover:bg-emerald-700 rounded-xl px-8 py-3 flex items-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50">
          <BadgeCheck className="w-5 h-5" />
          {loading ? 'Đang xử lý...' : 'Kích hoạt Tòa nhà'}
        </button>
      </div>
    </div>
  );
};
