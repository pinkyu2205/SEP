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
  Percent,
  AlertCircle,
  Send,
} from 'lucide-react';
import { propertyService } from '../../services/property.service';
import type {
  OnboardingSummaryResponse,
  HostConfirmRequest,
  HostRoomPrice,
} from '../../types/api.types';

const formatVND = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

const getUserUUID = (): string => {
  try {
    const token = localStorage.getItem('access_token');
    if (!token) return crypto.randomUUID();
    const payload = JSON.parse(atob(token.split('.')[1]));
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const val of Object.values(payload)) {
      if (typeof val === 'string' && uuidRe.test(val)) return val;
    }
    return crypto.randomUUID();
  } catch {
    return crypto.randomUUID();
  }
};

const formatDate = (d?: string) => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

export const HostPropertyReview = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const propertyId = Number(id);

  const [summary, setSummary] = useState<OnboardingSummaryResponse | null>(null);
  const [operationManagerId, setOperationManagerId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Host inputs
  const [contingencyPercent, setContingencyPercent] = useState(110);
  const [manualPrice, setManualPrice] = useState<number | ''>('');
  const [useManualPrice, setUseManualPrice] = useState(false);
  const [roomPrices, setRoomPrices] = useState<Record<number, number>>({});

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [summaryData, propertyData, managers] = await Promise.all([
          propertyService.getOnboardingSummary(propertyId),
          propertyService.getPropertyById(propertyId),
          propertyService.getManagers(),
        ]);
        setSummary(summaryData);
        const mgr = propertyData.operationManagerId
          ? String(propertyData.operationManagerId)
          : managers?.[0]?.id ?? '';
        setOperationManagerId(mgr);

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
    contingencyPercent >= 100;

  const handleConfirm = async () => {
    if (!canConfirm || !summary) return;

    const payload: HostConfirmRequest = {
      contingencyPercent,
      operationManagerId: operationManagerId || getUserUUID(),
    };

    if (isRoomScope) {
      const results = summary.pricing?.roomResults || [];
      payload.roomPrices = results.map((r): HostRoomPrice => ({
        roomId: r.roomId,
        price: useManualPrice
          ? (roomPrices[r.roomId] || Math.ceil(r.suggestedMinPrice))
          : Math.ceil(r.suggestedMinPrice * contingencyPercent / 100),
      }));
    } else if (useManualPrice && manualPrice !== '') {
      payload.propertyPrice = Number(manualPrice);
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await propertyService.hostConfirm(propertyId, payload);
      if (res.propertyStatus === 'ACTIVE') {
        setSuccess(true);
      } else if (res.propertyStatus === 'PENDING_OPERATION_MANAGER') {
        await propertyService.assignOperationManager(propertyId, payload.operationManagerId);
        setSuccess(true);
      } else {
        setSuccess(true);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Lỗi khi xác nhận');
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
          onClick={() => navigate(`/host/properties/${propertyId}`)}
          className="btn-primary mt-8 rounded-xl px-8 py-3"
        >
          Xem chi tiết tòa nhà
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
                <p className="font-bold text-slate-900">{summary.totalFloor ?? summary.floorCount ?? '—'}</p>
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
              <FileText className="h-5 w-5 text-indigo-500" /> Hợp đồng với chủ nhà gốc
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
                  <p className="font-bold text-slate-900">{formatDate(summary.inboundContract.startDate)} → {formatDate(summary.inboundContract.endDate)}</p>
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
                  Lịch CT: {formatDate(summary.renovationStartDate)} → {formatDate(summary.renovationEndDate)}
                  {summary.renovationCompleted && <span className="ml-2 text-emerald-600 font-bold">✓ Đã hoàn tất</span>}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right: Pricing + Confirm */}
        <div className="space-y-6">
          {/* Unified pricing card */}
          <div className="rounded-2xl border-2 border-indigo-200 bg-white p-6 space-y-5">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-800">
              <DollarSign className="h-5 w-5 text-indigo-600" /> Đặt giá cho thuê
            </h3>

            {/* Suggested price reference */}
            {!isRoomScope && wholeHouseResult && (
              <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3">
                <p className="text-xs text-indigo-500 font-semibold mb-1">Giá hệ thống đề xuất</p>
                <p className="text-xl font-black text-indigo-700">
                  {formatVND(wholeHouseResult.suggestedMinPrice)}
                  <span className="text-xs font-medium text-indigo-500">/tháng</span>
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {formatVND(wholeHouseResult.totalInvestment)} / {wholeHouseResult.contractMonths} tháng HĐ
                </p>
              </div>
            )}

            {/* Whole house: price mode selector */}
            {!isRoomScope && (
              <div className="space-y-3">
                <p className="text-sm font-bold text-slate-700">Cách tính giá cho thuê</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setUseManualPrice(false)}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 py-3 px-2 text-sm font-semibold transition ${
                      !useManualPrice
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <Percent className="h-4 w-4" />
                    Theo % tăng thêm
                  </button>
                  <button
                    onClick={() => setUseManualPrice(true)}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 py-3 px-2 text-sm font-semibold transition ${
                      useManualPrice
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <DollarSign className="h-4 w-4" />
                    Tự nhập giá
                  </button>
                </div>

                {!useManualPrice ? (
                  <div className="space-y-2">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-slate-700">
                        Tăng thêm so với giá đề xuất
                      </span>
                      <div className="relative">
                        <input
                          type="number"
                          min={100}
                          value={contingencyPercent}
                          onChange={(e) => setContingencyPercent(Number(e.target.value))}
                          className="input-field pr-10"
                          placeholder="110"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">%</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        100% = giữ nguyên · 110% = tăng thêm 10% · 120% = tăng thêm 20%
                      </p>
                    </label>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <span className="block text-sm font-semibold text-slate-700">Giá cho thuê mỗi tháng</span>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={manualPrice === '' ? '' : Number(manualPrice).toLocaleString('vi-VN')}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\./g, '').replace(/[^0-9]/g, '');
                          setManualPrice(raw === '' ? '' : Number(raw));
                        }}
                        className="input-field pr-14"
                        placeholder="0"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">đ</span>
                    </div>
                    {manualPrice !== '' && Number(manualPrice) > 0 && (
                      <p className="text-xs text-slate-400">
                        = <span className="font-semibold text-indigo-600">{formatVND(Number(manualPrice))}</span>
                      </p>
                    )}
                  </div>
                )}

                {/* Final price */}
                <div className="rounded-xl bg-emerald-50 border-2 border-emerald-200 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-emerald-600 mb-1">Giá cho thuê sẽ áp dụng</p>
                      <p className="text-2xl font-black text-emerald-800">
                        {formatVND(calculatedPrice)}
                        <span className="text-sm font-medium text-emerald-600">/tháng</span>
                      </p>
                      {!useManualPrice && wholeHouseResult && (
                        <p className="text-xs text-emerald-600 mt-1">
                          = {formatVND(wholeHouseResult.suggestedMinPrice)} × {contingencyPercent}%
                        </p>
                      )}
                    </div>
                    {!useManualPrice && (
                      <button
                        type="button"
                        onClick={() => {
                          const rounded = Math.ceil(Number(calculatedPrice) / 1_000_000) * 1_000_000;
                          setUseManualPrice(true);
                          setManualPrice(rounded);
                        }}
                        title="Làm tròn lên triệu gần nhất"
                        className="shrink-0 flex items-center gap-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 text-xs font-bold px-2.5 py-1.5 transition"
                      >
                        ↑ Làm tròn
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Room scope: price per room */}
            {isRoomScope && summary.pricing?.roomResults && (
              <div className="space-y-3">
                {/* Mode selector */}
                <p className="text-sm font-bold text-slate-700">Cách tính giá cho thuê</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setUseManualPrice(false)}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 py-3 px-2 text-sm font-semibold transition ${
                      !useManualPrice ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <Percent className="h-4 w-4" />
                    Theo % tăng thêm
                  </button>
                  <button
                    onClick={() => setUseManualPrice(true)}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 py-3 px-2 text-sm font-semibold transition ${
                      useManualPrice ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <DollarSign className="h-4 w-4" />
                    Tự nhập từng phòng
                  </button>
                </div>

                {/* % input */}
                {!useManualPrice && (
                  <div className="space-y-1">
                    <span className="block text-sm font-semibold text-slate-700">Tăng thêm so với giá đề xuất</span>
                    <div className="relative">
                      <input
                        type="number"
                        min={100}
                        value={contingencyPercent}
                        onChange={(e) => setContingencyPercent(Number(e.target.value))}
                        className="input-field pr-10"
                        placeholder="110"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">%</span>
                    </div>
                    <p className="text-xs text-slate-400">100% = giữ nguyên · 110% = tăng 10% · 120% = tăng 20%</p>
                  </div>
                )}

                {/* Room cards */}
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide pt-1">Giá từng phòng</p>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {summary.pricing.roomResults.map((r) => {
                    const computedPrice = useManualPrice
                      ? (roomPrices[r.roomId] || 0)
                      : Math.ceil(r.suggestedMinPrice * contingencyPercent / 100);
                    return (
                      <div key={r.roomId} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                        <span className="font-bold text-slate-800 text-sm">{r.roomNumber}</span>
                        <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2">
                          <p className="text-xs text-indigo-500 font-semibold mb-0.5">Giá hệ thống đề xuất</p>
                          <p className="font-black text-indigo-700">
                            {formatVND(r.suggestedMinPrice)}
                            <span className="text-xs font-medium text-indigo-400 ml-1">/tháng</span>
                          </p>
                        </div>
                        {useManualPrice && (
                          <div className="relative">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={roomPrices[r.roomId] ? Number(roomPrices[r.roomId]).toLocaleString('vi-VN') : ''}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/\./g, '').replace(/[^0-9]/g, '');
                                handleUpdateRoomPrice(r.roomId, raw === '' ? 0 : Number(raw));
                              }}
                              className="input-field text-sm pr-8"
                              placeholder="Nhập giá..."
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">đ</span>
                          </div>
                        )}
                        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-emerald-600">Giá cho thuê áp dụng</p>
                            <p className="font-black text-emerald-800 text-sm">{formatVND(computedPrice)}</p>
                            {!useManualPrice && (
                              <p className="text-xs text-emerald-500">{formatVND(r.suggestedMinPrice)} × {contingencyPercent}%</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const rounded = Math.ceil(computedPrice / 1_000_000) * 1_000_000;
                              setUseManualPrice(true);
                              handleUpdateRoomPrice(r.roomId, rounded);
                            }}
                            className="shrink-0 flex items-center gap-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 text-xs font-bold px-2.5 py-1.5 transition"
                          >
                            ↑ Làm tròn
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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
