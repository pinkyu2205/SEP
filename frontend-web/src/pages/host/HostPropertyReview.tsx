import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building,
  FileText,
  Package,
  Hammer,
  DollarSign,
  CheckCircle2,
  Users,
  Percent,
  AlertCircle,
  Send,
} from 'lucide-react';
import { propertyService } from '../../services/property.service';
import { userService } from '../../services/user.service';
import type {
  OnboardingSummaryResponse,
  HostConfirmRequest,
  HostRoomPrice,
  UserResponse,
} from '../../types/api.types';

const formatVND = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

export const HostPropertyReview = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const propertyId = Number(id);

  const [summary, setSummary] = useState<OnboardingSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Host inputs
  const [contingencyPercent, setContingencyPercent] = useState(110);
  const [manualPrice, setManualPrice] = useState<number | ''>('');
  const [useManualPrice, setUseManualPrice] = useState(false);
  const [roomPrices, setRoomPrices] = useState<Record<number, number>>({});

  // Operation managers
  const [managers, setManagers] = useState<UserResponse[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [summaryData, allUsers] = await Promise.all([
          propertyService.getOnboardingSummary(propertyId),
          userService.getAllUsers(),
        ]);
        setSummary(summaryData);

        // Filter operation managers (ROLE_MANAGER + ACTIVE)
        const mgrs = (allUsers || []).filter(
          (u) => u.role === 'ROLE_MANAGER' && u.status === 'ACTIVE'
        );
        setManagers(mgrs);
        if (mgrs.length > 0) setSelectedManagerId(mgrs[0].id);

        // Pre-populate room prices from suggested prices
        if (summaryData.pricing?.roomResults) {
          const initial: Record<number, number> = {};
          summaryData.pricing.roomResults.forEach((r) => {
            initial[r.roomId] = Math.ceil(r.suggestedMinPrice * (110 / 100));
          });
          setRoomPrices(initial);
        }
      } catch (err: any) {
        setError(err.response?.data?.message || err.message || 'Không tải được dữ liệu');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [propertyId]);

  const isRoomScope = summary?.pricing?.pricingScope === 'ROOM';
  const wholeHouseResult = summary?.pricing?.wholeHouseResult;

  const suggestedPrice = useMemo(() => {
    if (!summary) return 0;
    if (wholeHouseResult) return wholeHouseResult.suggestedMinPrice;
    return 0;
  }, [summary, wholeHouseResult]);

  const calculatedPrice = useMemo(() => {
    if (useManualPrice && manualPrice !== '') return manualPrice;
    return Math.ceil(suggestedPrice * (contingencyPercent / 100));
  }, [suggestedPrice, contingencyPercent, useManualPrice, manualPrice]);

  const canConfirm =
    summary?.status === 'PENDING_HOST_REVIEW' &&
    selectedManagerId &&
    contingencyPercent >= 100;

  const handleConfirm = async () => {
    if (!canConfirm || !summary) return;

    // Hash UUID to Long for operationManagerId
    const hashCode = (s: string) =>
      Math.abs(
        s.split('').reduce((a, b) => {
          a = (a << 5) - a + b.charCodeAt(0);
          return a & a;
        }, 0)
      ) || 1;

    const payload: HostConfirmRequest = {
      contingencyPercent,
      operationManagerId: hashCode(selectedManagerId),
    };

    if (isRoomScope) {
      payload.roomPrices = Object.entries(roomPrices).map(
        ([roomId, price]): HostRoomPrice => ({
          roomId: Number(roomId),
          price,
        })
      );
    } else if (useManualPrice && manualPrice !== '') {
      payload.propertyPrice = Number(manualPrice);
    }

    setSubmitting(true);
    setError('');
    try {
      await propertyService.hostConfirm(propertyId, payload);
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Lỗi khi xác nhận');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRoomPrice = (roomId: number, price: number) => {
    setRoomPrices((prev) => ({ ...prev, [roomId]: price }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
          <p className="mt-4 text-sm font-semibold text-slate-500">Đang tải dữ liệu tóm tắt...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-black text-slate-900">Xác nhận thành công!</h2>
        <p className="mt-3 text-slate-500">
          Tòa nhà đã chuyển sang trạng thái <span className="font-bold text-emerald-600">ACTIVE</span> và sẵn sàng kinh doanh.
        </p>
        <button
          onClick={() => navigate('/super-admin/buildings')}
          className="btn-primary mt-8 rounded-xl px-8 py-3"
        >
          Quay về danh sách tòa nhà
        </button>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="py-20 text-center text-slate-400">
        <AlertCircle className="mx-auto h-10 w-10 mb-3" />
        <p className="font-semibold">{error || 'Không tìm thấy dữ liệu'}</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm text-indigo-600 hover:underline">
          ← Quay lại
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* Header */}
      <div className="mb-8">
        <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600">
          <ArrowLeft className="h-4 w-4" /> Quay lại
        </button>
        <h1 className="text-2xl font-black text-slate-900">Duyệt giá & Kích hoạt Tòa nhà</h1>
        <p className="mt-1 text-sm text-slate-500">
          Xem tóm tắt onboarding và xác nhận giá cho thuê cho "{summary.propertyName}"
        </p>
        {summary.status === 'UNDER_RENOVATION' && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-amber-800">Tòa nhà đang trong giai đoạn cải tạo</p>
              <p className="text-sm text-amber-700 mt-1">
                Bạn chưa thể xác nhận giá cho đến khi Admin đánh dấu cải tạo hoàn tất.
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Summary info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Property Info */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-800 mb-4">
              <Building className="h-5 w-5 text-indigo-500" /> Thông tin tòa nhà
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-500">Loại hình</p>
                <p className="font-bold text-slate-900">{summary.wholeHouse ? 'Nhà nguyên căn' : 'Chia phòng'}</p>
              </div>
              <div>
                <p className="text-slate-500">Cải tạo</p>
                <p className="font-bold text-slate-900">{summary.hasRenovation ? 'Có' : 'Không'}</p>
              </div>
              <div>
                <p className="text-slate-500">Số tầng</p>
                <p className="font-bold text-slate-900">{summary.floorCount}</p>
              </div>
              <div>
                <p className="text-slate-500">Tổng phòng</p>
                <p className="font-bold text-slate-900">{summary.totalRooms}</p>
              </div>
            </div>
          </div>

          {/* Inbound Contract */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-800 mb-4">
              <FileText className="h-5 w-5 text-indigo-500" /> Hợp đồng Inbound
            </h3>
            {summary.inboundContract ? (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">Mã HĐ</p>
                  <p className="font-bold text-slate-900">{summary.inboundContract.contractCode}</p>
                </div>
                <div>
                  <p className="text-slate-500">Chủ nhà</p>
                  <p className="font-bold text-slate-900">{summary.inboundContract.ownerName}</p>
                </div>
                <div>
                  <p className="text-slate-500">Tổng tiền thuê</p>
                  <p className="font-black text-emerald-700">{formatVND(summary.inboundContract.totalRentAmount)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Thời hạn</p>
                  <p className="font-bold text-slate-900">{summary.inboundContract.startDate} → {summary.inboundContract.endDate}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Chưa có hợp đồng</p>
            )}
          </div>

          {/* Equipment Manifest */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-800 mb-4">
              <Package className="h-5 w-5 text-indigo-500" /> Thiết bị ({summary.equipmentManifest?.length || 0})
            </h3>
            {summary.equipmentManifest?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs font-bold text-slate-500 uppercase">
                      <th className="pb-2">Thiết bị</th>
                      <th className="pb-2">SL</th>
                      <th className="pb-2">Tình trạng</th>
                      <th className="pb-2">Đã gán</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.equipmentManifest.map((item) => (
                      <tr key={item.id} className="border-b border-slate-50">
                        <td className="py-2 font-semibold text-slate-900">{item.catalogName}</td>
                        <td className="py-2">{item.quantity}</td>
                        <td className="py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${item.status === 'NEW' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                            {item.status === 'NEW' ? 'Mới' : 'Tốt'}
                          </span>
                        </td>
                        <td className="py-2">
                          <span className={`font-bold ${item.assignedCount === item.quantity ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {item.assignedCount}/{item.quantity}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-400">Không có thiết bị</p>
            )}
          </div>

          {/* Renovation */}
          {summary.hasRenovation && summary.renovationLines?.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="flex items-center gap-2 text-base font-bold text-slate-800 mb-4">
                <Hammer className="h-5 w-5 text-indigo-500" /> Cải tạo — {formatVND(summary.totalRenovationCost)}
              </h3>
              <div className="space-y-2">
                {summary.renovationLines.map((line) => (
                  <div key={line.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-2.5">
                    <div>
                      <p className="font-semibold text-slate-900">{line.categoryName}</p>
                      {line.note && <p className="text-xs text-slate-500">{line.note}</p>}
                    </div>
                    <p className="font-bold text-slate-900">{formatVND(line.cost)}</p>
                  </div>
                ))}
              </div>
              {summary.renovationStartDate && (
                <p className="mt-3 text-xs text-slate-500">
                  Lịch CT: {summary.renovationStartDate} → {summary.renovationEndDate}
                  {summary.renovationCompleted && <span className="ml-2 text-emerald-600 font-bold">✓ Đã hoàn tất</span>}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right: Pricing + Confirm */}
        <div className="space-y-6">
          {/* Pricing */}
          <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/30 p-6">
            <h3 className="flex items-center gap-2 text-base font-bold text-indigo-900 mb-4">
              <DollarSign className="h-5 w-5 text-indigo-600" /> Giá đề xuất
            </h3>

            {!isRoomScope && wholeHouseResult && (
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Tổng đầu tư</span>
                  <span className="font-bold">{formatVND(wholeHouseResult.totalInvestment)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Số tháng HĐ</span>
                  <span className="font-bold">{wholeHouseResult.contractMonths}</span>
                </div>
                <div className="border-t border-indigo-200 pt-3 flex justify-between">
                  <span className="font-bold text-indigo-900">Giá hoàn vốn/tháng</span>
                  <span className="font-black text-indigo-700">{formatVND(wholeHouseResult.suggestedMinPrice)}</span>
                </div>
              </div>
            )}

            {isRoomScope && summary.pricing?.roomResults && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {summary.pricing.roomResults.map((r) => (
                  <div key={r.roomId} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                    <span className="font-semibold text-slate-900">{r.roomNumber}</span>
                    <span className="font-bold text-indigo-700">{formatVND(r.suggestedMinPrice)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Host Input */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-800">
              <Percent className="h-5 w-5 text-indigo-500" /> Xác nhận giá
            </h3>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">% Dự phòng (contingency)</span>
              <input
                type="number"
                min={100}
                value={contingencyPercent}
                onChange={(e) => setContingencyPercent(Number(e.target.value))}
                className="input-field"
                placeholder="110"
              />
              <p className="mt-1 text-xs text-slate-500">VD: 110 = giá gợi ý × 1.1</p>
            </label>

            {!isRoomScope && (
              <>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useManualPrice}
                    onChange={(e) => setUseManualPrice(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                  />
                  <span className="text-sm font-semibold text-slate-700">Ghi đè giá thủ công</span>
                </label>

                {useManualPrice && (
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-slate-700">Giá cho thuê/tháng</span>
                    <input
                      type="number"
                      value={manualPrice}
                      onChange={(e) => setManualPrice(Number(e.target.value))}
                      className="input-field"
                      placeholder="12000000"
                    />
                  </label>
                )}

                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center">
                  <p className="text-xs font-semibold text-emerald-600">Giá cuối cùng</p>
                  <p className="text-xl font-black text-emerald-800">{formatVND(calculatedPrice)}</p>
                </div>
              </>
            )}

            {isRoomScope && summary.pricing?.roomResults && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase">Giá từng phòng (tùy chỉnh)</p>
                {summary.pricing.roomResults.map((r) => (
                  <div key={r.roomId} className="flex items-center gap-3">
                    <span className="w-16 text-sm font-bold text-slate-700">{r.roomNumber}</span>
                    <input
                      type="number"
                      value={roomPrices[r.roomId] || 0}
                      onChange={(e) => handleUpdateRoomPrice(r.roomId, Number(e.target.value))}
                      className="input-field flex-1"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Operation Manager */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-800 mb-4">
              <Users className="h-5 w-5 text-indigo-500" /> Gán Quản lý Vận hành
            </h3>
            <select
              value={selectedManagerId}
              onChange={(e) => setSelectedManagerId(e.target.value)}
              className="input-field"
            >
              <option value="">-- Chọn Quản lý --</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.username} ({m.phoneNumber})
                </option>
              ))}
            </select>
          </div>

          {/* Submit */}
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || submitting}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3.5 font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              'Đang xử lý...'
            ) : (
              <>
                <Send className="h-5 w-5" /> Xác nhận & Kích hoạt
              </>
            )}
          </button>

          {summary.status !== 'PENDING_HOST_REVIEW' && (
            <p className="text-xs text-center text-amber-600 font-semibold">
              Chỉ có thể xác nhận khi trạng thái là "Chờ Host duyệt"
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
