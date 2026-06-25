import { useState, useEffect } from 'react';
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
  MapPin,
  Image as ImageIcon,
  CalendarDays,
  Link2,
  Calculator,
} from 'lucide-react';
import { propertyService } from '../../services/property.service';
import type {
  OnboardingSummaryResponse,
  PropertyResponse,
  HostConfirmRequest,
  PricingMode,
  PricingCalculationResponse,
  CalculatePricingRequest,
} from '../../types/api.types';
import { HandoverEquipmentSection } from '../super-admin/nha-thue/HandoverEquipmentSection';
import { OperationalEquipmentPanel } from '../super-admin/nha-thue/OperationalEquipmentPanel';
import { PropertyMap } from '../../components/PropertyMap';

const formatVND = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

// Mô hình mới: giá đã bao gồm lợi nhuận → gửi giá override trực tiếp, không cần biên dự phòng.
const CONTINGENCY_FOR_CONFIRM = 100;

const formatDate = (d?: string) => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

const parseDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day); // local midnight, tránh lệch múi giờ
};

/** Khoảng thời gian HĐ dạng "5 năm" / "4 năm 6 tháng" (coi ngày kết thúc là trọn ngày). */
const contractDuration = (start?: string, end?: string): string => {
  if (!start || !end) return '';
  const s = parseDate(start);
  const e = parseDate(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return '';
  e.setDate(e.getDate() + 1); // +1 ngày: 01/05 → 30/04 = đúng tròn năm
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  if (e.getDate() < s.getDate()) months -= 1;
  if (months <= 0) return '';
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years > 0 && rem > 0) return `${years} năm ${rem} tháng`;
  if (years > 0) return `${years} năm`;
  return `${rem} tháng`;
};

/** Input tiền VND có phân tách hàng nghìn. */
const MoneyInput = ({
  value, onChange, placeholder, suffix = 'đ', invalid,
}: {
  value: number | '';
  onChange: (v: number | '') => void;
  placeholder?: string;
  suffix?: string;
  invalid?: boolean;
}) => (
  <div className="relative">
    <input
      type="text"
      inputMode="numeric"
      value={value === '' ? '' : Number(value).toLocaleString('vi-VN')}
      onChange={(e) => {
        const raw = e.target.value.replace(/\./g, '').replace(/[^0-9]/g, '');
        onChange(raw === '' ? '' : Number(raw));
      }}
      className={`input-field pr-12 ${invalid ? 'border-rose-300 focus:border-rose-400' : ''}`}
      placeholder={placeholder ?? '0'}
    />
    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">{suffix}</span>
  </div>
);

export const HostPropertyReview = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const propertyId = Number(id);

  const [summary, setSummary] = useState<OnboardingSummaryResponse | null>(null);
  const [property, setProperty] = useState<PropertyResponse | null>(null);
  const [operationManagerId, setOperationManagerId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // ── Mô hình định giá mới (FORWARD/REVERSE) ──
  const [mode, setMode] = useState<PricingMode>('FORWARD');
  const [pDesired, setPDesired] = useState<number | ''>('');     // FORWARD: lợi nhuận/tháng
  const [roiExpected, setRoiExpected] = useState<number | ''>(''); // REVERSE: ROI %/năm
  const [oOperation, setOOperation] = useState<number | ''>(0);   // chi phí vận hành/tháng
  const [vRatePct, setVRatePct] = useState<number>(10);           // buffer trống phòng (%)
  const [calc, setCalc] = useState<PricingCalculationResponse | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState('');
  // Giá chốt (có thể chỉnh tay) — gợi ý mặc định = suggestedPriceWithProfit
  const [wholePrice, setWholePrice] = useState<number | ''>('');
  const [roomPrices, setRoomPrices] = useState<Record<number, number>>({});

  // Nạp kết quả tính giá vào state (dùng cho cả load lại & sau khi tính).
  const applyCalc = (data: PricingCalculationResponse) => {
    setCalc(data);
    if (data.mode) setMode(data.mode);
    if (data.pDesired != null) setPDesired(Math.round(data.pDesired));
    if (data.roiExpected != null) setRoiExpected(data.roiExpected);
    if (data.oOperation != null) setOOperation(Math.round(data.oOperation));
    if (data.vRate != null) setVRatePct(Math.round(data.vRate * 100));
    if (data.wholeHouseResult) setWholePrice(Math.round(data.wholeHouseResult.suggestedPriceWithProfit));
    if (data.roomResults) {
      const init: Record<number, number> = {};
      data.roomResults.forEach((r) => { init[r.roomId] = Math.round(r.suggestedPriceWithProfit); });
      setRoomPrices(init);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [summaryData, propertyData] = await Promise.all([
          propertyService.getOnboardingSummary(propertyId),
          propertyService.getPropertyById(propertyId),
        ]);
        setSummary(summaryData);
        setProperty(propertyData);
        if (propertyData.operationManagerId) {
          setOperationManagerId(String(propertyData.operationManagerId));
        }

        // Lấy kết quả tính giá đã lưu (nếu có) — 404 = chưa tính, bỏ qua (interceptor không toast 404).
        try {
          const saved = await propertyService.getPricing(propertyId);
          applyCalc(saved);
        } catch { /* chưa có kết quả tính giá — host sẽ nhập mục tiêu rồi bấm Tính giá */ }
      } catch (err: any) {
        setError(err.response?.data?.message || err.message || 'Không tải được dữ liệu');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [propertyId]);

  const isRoomScope = (calc?.pricingScope ?? summary?.pricing?.pricingScope) === 'ROOM';
  const canEdit = summary?.status === 'PENDING_HOST_REVIEW';
  const wholeFinal = wholePrice === '' ? 0 : Number(wholePrice);

  const handleCalculate = async () => {
    setCalcError('');
    if (mode === 'FORWARD' && (pDesired === '' || Number(pDesired) < 0)) {
      setCalcError('Vui lòng nhập số tiền lãi muốn thu mỗi tháng.');
      return;
    }
    if (mode === 'REVERSE' && (roiExpected === '' || Number(roiExpected) <= 0)) {
      setCalcError('Vui lòng nhập tỷ lệ sinh lời mong muốn mỗi năm (lớn hơn 0%).');
      return;
    }
    const req: CalculatePricingRequest = {
      mode,
      oOperation: oOperation === '' ? 0 : Number(oOperation),
      vRate: vRatePct / 100,
      ...(mode === 'FORWARD' ? { pDesired: Number(pDesired) } : { roiExpected: Number(roiExpected) }),
    };
    setCalculating(true);
    try {
      const data = await propertyService.calculatePricing(propertyId, req);
      applyCalc(data);
    } catch (err: any) {
      const raw = err.response?.data?.message || err.response?.data?.error || err.message || '';
      // BE đang lỗi deserialize DTO (thiếu @NoArgsConstructor) — xem doc/BE-pricing-calculate-jackson-noargs.md
      const isDtoBug = /Type definition error|CalculateDepreciationRequest|no Creators|default constructor/i.test(raw);
      setCalcError(
        isDtoBug
          ? 'Máy chủ chưa nhận được yêu cầu tính giá (lỗi cấu hình DTO phía Backend). Đã báo team BE khắc phục — vui lòng thử lại sau.'
          : raw || 'Không tính được giá',
      );
    } finally {
      setCalculating(false);
    }
  };

  const canConfirm =
    canEdit &&
    !!calc &&
    (isRoomScope
      ? (calc.roomResults || []).length > 0 && (calc.roomResults || []).every((r) => (roomPrices[r.roomId] || 0) > 0)
      : wholeFinal > 0);

  const handleConfirm = async () => {
    if (!canConfirm || !summary || !calc) return;

    const payload: HostConfirmRequest = {
      contingencyPercent: CONTINGENCY_FOR_CONFIRM,
      ...(operationManagerId ? { operationManagerId } : {}),
    };

    if (isRoomScope) {
      payload.roomPrices = (calc.roomResults || []).map((r) => ({
        roomId: r.roomId,
        price: roomPrices[r.roomId] || Math.round(r.suggestedPriceWithProfit),
      }));
    } else {
      payload.propertyPrice = wholeFinal;
    }

    setSubmitting(true);
    setError('');
    try {
      await propertyService.hostConfirm(propertyId, payload);
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || err.message || 'Lỗi khi xác nhận');
    } finally {
      setSubmitting(false);
    }
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
        {summary.submittedToHostAt && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <CalendarDays className="h-3.5 w-3.5" /> Admin gửi duyệt: {formatDate(summary.submittedToHostAt.slice(0, 10))}
          </p>
        )}
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

            {property && (property.fullAddress || property.shortAddress) && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-slate-50 p-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{property.fullAddress || property.shortAddress}</p>
                  {property.zoneName && <p className="text-xs text-slate-500">{property.zoneName}</p>}
                </div>
              </div>
            )}

            {property && (property.fullAddress || property.shortAddress) && (
              <div className="mb-4 overflow-hidden rounded-xl border border-slate-200">
                <PropertyMap address={property.fullAddress || property.shortAddress} height={240} />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div>
                <p className="text-slate-500">Loại hình</p>
                <p className="font-bold text-slate-900">{summary.wholeHouse ? 'Nhà nguyên căn' : 'Chia phòng'}</p>
              </div>
              <div>
                <p className="text-slate-500">Diện tích</p>
                <p className="font-bold text-slate-900">{property?.areaSize ? `${property.areaSize} m²` : '—'}</p>
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
              {summary.roomsPerFloor > 0 && (
                <div>
                  <p className="text-slate-500">Phòng/tầng</p>
                  <p className="font-bold text-slate-900">{summary.roomsPerFloor}</p>
                </div>
              )}
            </div>

            {property?.descriptions && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <p className="mb-1 text-sm text-slate-500">Mô tả chi tiết</p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{property.descriptions}</p>
              </div>
            )}
          </div>

          {/* Hình ảnh tòa nhà */}
          {property?.imageUrls && property.imageUrls.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="mb-4 flex items-center gap-2 text-base font-bold text-slate-800">
                <ImageIcon className="h-5 w-5 text-indigo-500" /> Hình ảnh ({property.imageUrls.length})
              </h3>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {property.imageUrls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer"
                    className="group block aspect-square overflow-hidden rounded-xl border border-slate-200">
                    <img src={url} alt={`Ảnh ${i + 1}`} className="h-full w-full object-cover transition duration-200 group-hover:scale-105" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Thiết bị chủ nhà bàn giao (import đợt 1 — chỉ hiển thị) */}
          <HandoverEquipmentSection propertyId={propertyId} />

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
                  {contractDuration(summary.inboundContract.startDate, summary.inboundContract.endDate) && (
                    <p className="mt-0.5 text-xs font-bold text-indigo-600">
                      ({contractDuration(summary.inboundContract.startDate, summary.inboundContract.endDate)})
                    </p>
                  )}
                </div>
                {summary.inboundContract.contractScanUrl && (
                  <div className="col-span-2">
                    <a href={summary.inboundContract.contractScanUrl} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 transition">
                      <Link2 className="h-4 w-4" /> Xem bản scan hợp đồng
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Chưa có hợp đồng</p>
            )}
          </div>

          {/* Thiết bị vận hành — đầy đủ: nguồn, vị trí, tình trạng, giá tiền, bảo hành/hạn dùng */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-800 mb-4">
              <Package className="h-5 w-5 text-indigo-500" /> Thiết bị vận hành
            </h3>
            <OperationalEquipmentPanel propertyId={propertyId} />
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

        {/* Right: Pricing + Confirm — dính mượt theo khi cuộn (màn lớn) */}
        <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border-2 border-indigo-200 bg-white p-6 space-y-5">
            <div>
              <h3 className="flex items-center gap-2 text-base font-bold text-slate-800">
                <DollarSign className="h-5 w-5 text-indigo-600" /> Đặt giá cho thuê
              </h3>
              <p className="mt-1 text-xs text-slate-500">Nhập mục tiêu của bạn, hệ thống sẽ gợi ý mức giá thuê hợp lý.</p>
            </div>

            {/* ── Bước 1: Mục tiêu lợi nhuận ── */}
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-bold text-slate-700">Bạn muốn định giá theo cách nào?</p>
                <div className="grid grid-cols-2 gap-2">
                  <ModeBtn active={mode === 'FORWARD'} onClick={() => setMode('FORWARD')} icon={DollarSign} label="Theo tiền lãi" sub="Biết muốn lãi/tháng" />
                  <ModeBtn active={mode === 'REVERSE'} onClick={() => setMode('REVERSE')} icon={Percent} label="Theo % sinh lời" sub="Biết % lời/năm" />
                </div>
              </div>

              {mode === 'FORWARD' ? (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">Tiền lãi muốn thu mỗi tháng</span>
                  <MoneyInput value={pDesired} onChange={setPDesired} placeholder="VD: 10.000.000" />
                  <p className="mt-1 text-xs text-slate-400">Số tiền lời thực nhận mỗi tháng, sau khi đã trừ hết chi phí và thu hồi vốn.</p>
                </label>
              ) : (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-semibold text-slate-700">Tỷ lệ sinh lời mong muốn mỗi năm</span>
                  <div className="relative">
                    <input type="number" min={0} value={roiExpected}
                      onChange={(e) => setRoiExpected(e.target.value === '' ? '' : Number(e.target.value))}
                      className="input-field pr-10" placeholder="VD: 15" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">%</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">Phần trăm lời trên tổng vốn mỗi năm. VD: 15% nghĩa là mỗi năm lời bằng 15% số vốn bỏ ra.</p>
                </label>
              )}

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">Chi phí vận hành mỗi tháng</span>
                <MoneyInput value={oOperation} onChange={setOOperation} placeholder="0" />
                <p className="mt-1 text-xs text-slate-400">Các khoản chi cố định hằng tháng: lương quản lý, internet, vệ sinh… Để 0 nếu không có.</p>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">Phí dự phòng</span>
                <div className="relative">
                  <input type="number" min={0} max={100} value={vRatePct}
                    onChange={(e) => setVRatePct(Number(e.target.value))}
                    className="input-field pr-10" placeholder="10" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">%</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">Phần trăm phòng dự kiến có thể bị bỏ trống, để tính dư an toàn. Thường để 10%.</p>
              </label>

              <button
                type="button"
                onClick={handleCalculate}
                disabled={calculating || !canEdit}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Calculator className="h-4 w-4" />
                {calculating ? 'Đang tính...' : calc ? 'Tính lại giá thuê' : 'Tính giá cho thuê'}
              </button>
              {calcError && (
                <p className="flex items-start gap-1.5 text-xs font-semibold text-rose-600">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {calcError}
                </p>
              )}
            </div>

            {/* ── Bước 2: Kết quả tính giá ── */}
            {calc && (
              <div className="space-y-4 border-t border-slate-100 pt-5">
                {/* Tóm tắt tài chính */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-slate-500">Tóm tắt tài chính</p>
                  <div className="space-y-1.5 text-sm">
                    <PriceRow label="Tổng vốn đã bỏ ra" value={formatVND(calc.capex)} bold />
                    <PriceRow label="Thời hạn thuê nhà" value={`${calc.contractMonths} tháng`} />
                    <PriceRow label="Thu hồi vốn mỗi tháng" value={formatVND(calc.monthlyRecovery)} tone="indigo" />
                    <PriceRow label="Chi phí cần bù mỗi tháng" value={formatVND(calc.fixedOpex)} />
                    <div className="my-1.5 border-t border-slate-200" />
                    <PriceRow label="Tiền thuê cần đạt mỗi tháng" value={formatVND(calc.revenueTarget)} tone="indigo" />
                    {calc.pDesired != null && calc.pDesired > 0 && (
                      <PriceRow label="Tiền lãi mục tiêu mỗi tháng" value={formatVND(calc.pDesired)} />
                    )}
                    {calc.roiExpected != null && calc.roiExpected > 0 && (
                      <PriceRow label="Tỷ lệ sinh lời mục tiêu mỗi năm" value={`${calc.roiExpected}%`} />
                    )}
                  </div>
                </div>

                {/* ── Nhà nguyên căn ── */}
                {!isRoomScope && calc.wholeHouseResult && (() => {
                  const wh = calc.wholeHouseResult;
                  const below = wholeFinal > 0 && wholeFinal < wh.roomFloor;
                  const months = calc.contractMonths;
                  const profit = wholeFinal > 0 ? wholeFinal * months - calc.capex : 0;
                  const margin = calc.capex > 0 ? (profit / calc.capex) * 100 : 0;
                  return (
                    <div className="space-y-3">
                      <div className="flex items-stretch gap-2">
                        <div className="flex-1 rounded-xl bg-indigo-50 border border-indigo-100 px-3 py-2">
                          <p className="text-xs text-indigo-500 font-semibold mb-0.5">Giá thuê đề xuất (đã tính lãi)</p>
                          <p className="font-black text-indigo-700 text-sm">
                            {formatVND(wh.suggestedPriceWithProfit)}<span className="text-xs font-medium text-indigo-400 ml-1">/tháng</span>
                          </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-right">
                          <p className="text-xs text-slate-400 font-semibold mb-0.5">Giá tối thiểu</p>
                          <p className="font-bold text-slate-600 text-sm">{formatVND(wh.roomFloor)}</p>
                        </div>
                      </div>

                      <label className="block">
                        <span className="mb-1.5 block text-sm font-semibold text-slate-700">Giá cho thuê áp dụng / tháng (sửa được)</span>
                        <MoneyInput value={wholePrice} onChange={setWholePrice} invalid={below} />
                        <div className="mt-1.5 flex items-center justify-between">
                          <button type="button" onClick={() => setWholePrice(Math.round(wh.suggestedPriceWithProfit))}
                            className="text-xs font-semibold text-indigo-600 hover:underline">Lấy giá đề xuất</button>
                          <button type="button"
                            onClick={() => setWholePrice(Math.ceil((wholeFinal || wh.suggestedPriceWithProfit) / 100_000) * 100_000)}
                            className="text-xs font-semibold text-slate-500 hover:underline">↑ Làm tròn</button>
                        </div>
                        {below && (
                          <p className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-rose-600">
                            <AlertCircle className="h-4 w-4 shrink-0" /> Giá đang thấp hơn mức tối thiểu {formatVND(wh.roomFloor)} — có thể không đủ hoàn vốn.
                          </p>
                        )}
                      </label>

                      {wholeFinal > 0 && months > 0 && (
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-slate-500">Dự kiến cả thời hạn thuê ({months} tháng)</p>
                          <div className="space-y-1.5 text-sm">
                            <PriceRow label="Tổng tiền thu được" value={formatVND(wholeFinal * months)} />
                            <PriceRow label="Trừ vốn đầu tư" value={`− ${formatVND(calc.capex)}`} />
                            <div className="my-1.5 border-t border-slate-200" />
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-700">Lãi dự kiến</span>
                              <span className={`font-black ${profit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                {profit < 0 && '− '}{formatVND(Math.abs(profit))}
                                {margin !== 0 && <span className="ml-1 text-xs font-bold">({profit >= 0 ? '+' : '−'}{Math.abs(Math.round(margin))}%)</span>}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── Nhà chia phòng (hiển thị chi tiết từng phòng) ── */}
                {isRoomScope && calc.roomResults && calc.roomResults.length > 0 && (() => {
                  const rooms = calc.roomResults!;
                  const totalSet = rooms.reduce((s, r) => s + (roomPrices[r.roomId] || 0), 0);
                  const totalInvest = rooms.reduce((s, r) => s + (r.totalInvestment || 0), 0) || calc.capex;
                  const months = calc.contractMonths;
                  const totalProfit = totalSet > 0 ? totalSet * months - totalInvest : 0;
                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Giá thuê từng phòng ({rooms.length})</p>
                        <button type="button"
                          onClick={() => {
                            const reset: Record<number, number> = {};
                            rooms.forEach((r) => { reset[r.roomId] = Math.round(r.suggestedPriceWithProfit); });
                            setRoomPrices(reset);
                          }}
                          className="text-xs font-semibold text-indigo-600 hover:underline">Lấy giá đề xuất</button>
                      </div>

                      <div className="space-y-2.5 max-h-[34rem] overflow-y-auto pr-1">
                        {rooms.map((r) => {
                          const price = roomPrices[r.roomId] || 0;
                          const below = price > 0 && price < r.roomFloor;
                          const rMonths = r.contractMonths ?? months;
                          const rProfit = price > 0 && r.totalInvestment != null ? price * rMonths - r.totalInvestment : null;
                          return (
                            <div key={r.roomId} className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5">
                              {/* Tiêu đề phòng + diện tích */}
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-800">Phòng {r.roomNumber}</span>
                                <span className="text-xs text-slate-400">
                                  {r.area} m²{r.effectiveM2 != null ? ` · quy đổi ${r.effectiveM2} m²` : ''}
                                </span>
                              </div>

                              {/* Chi tiết vốn phân bổ cho phòng */}
                              {(r.rentShare != null || r.renovationShare != null || r.equipmentShare != null || r.totalInvestment != null) && (
                                <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5 space-y-1 text-xs">
                                  {r.rentShare != null && <PriceRow label="Tiền thuê phân bổ" value={formatVND(r.rentShare)} />}
                                  {r.renovationShare != null && <PriceRow label="Cải tạo phân bổ" value={formatVND(r.renovationShare)} />}
                                  {r.equipmentShare != null && <PriceRow label="Thiết bị phân bổ" value={formatVND(r.equipmentShare)} />}
                                  {r.totalInvestment != null && (
                                    <>
                                      <div className="my-1 border-t border-slate-200" />
                                      <PriceRow label="Tổng vốn phòng" value={formatVND(r.totalInvestment)} bold />
                                    </>
                                  )}
                                  {r.monthlyBreakEven != null && <PriceRow label="Hoàn vốn / tháng" value={formatVND(r.monthlyBreakEven)} tone="indigo" />}
                                  {r.weight != null && <PriceRow label="Trọng số phân bổ" value={`${r.weight}`} />}
                                </div>
                              )}

                              {/* Giá đề xuất + giá sàn */}
                              <div className="flex items-stretch gap-2">
                                <div className="flex-1 rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-1.5">
                                  <p className="text-[11px] text-indigo-500 font-semibold">Đề xuất (đã tính lãi)</p>
                                  <p className="font-black text-indigo-700 text-sm">{formatVND(r.suggestedPriceWithProfit)}</p>
                                </div>
                                <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5 text-right">
                                  <p className="text-[11px] text-slate-400 font-semibold">Tối thiểu</p>
                                  <p className="font-bold text-slate-600 text-sm">{formatVND(r.roomFloor)}</p>
                                </div>
                              </div>

                              {/* Giá áp dụng (sửa được) + thao tác */}
                              <div>
                                <span className="mb-1 block text-xs font-semibold text-slate-600">Giá cho thuê áp dụng / tháng (sửa được)</span>
                                <MoneyInput
                                  value={roomPrices[r.roomId] ?? ''}
                                  onChange={(v) => setRoomPrices((prev) => ({ ...prev, [r.roomId]: v === '' ? 0 : v }))}
                                  invalid={below}
                                />
                                <div className="mt-1 flex items-center justify-between">
                                  <button type="button"
                                    onClick={() => setRoomPrices((p) => ({ ...p, [r.roomId]: Math.round(r.suggestedPriceWithProfit) }))}
                                    className="text-[11px] font-semibold text-indigo-600 hover:underline">Dùng giá gợi ý</button>
                                  <button type="button"
                                    onClick={() => setRoomPrices((p) => ({ ...p, [r.roomId]: Math.ceil((price || r.suggestedPriceWithProfit) / 100_000) * 100_000 }))}
                                    className="text-[11px] font-semibold text-slate-500 hover:underline">↑ Làm tròn</button>
                                </div>
                                {below && (
                                  <p className="mt-1 flex items-start gap-1 text-xs font-semibold text-rose-600">
                                    <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Thấp hơn giá tối thiểu {formatVND(r.roomFloor)}
                                  </p>
                                )}
                              </div>

                              {/* Lãi cả kỳ của phòng */}
                              {rProfit != null && (
                                <p className="text-[11px] text-slate-500 text-right">
                                  Lãi cả kỳ ({rMonths} tháng):{' '}
                                  <span className={`font-bold ${rProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {rProfit < 0 ? '− ' : ''}{formatVND(Math.abs(rProfit))}
                                  </span>
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Tổng hợp các phòng */}
                      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-600">Tổng tiền thuê các phòng / tháng</span>
                        <span className="font-black text-emerald-800 text-sm">{formatVND(totalSet)}</span>
                      </div>
                      <p className="text-xs text-slate-400 text-right">Mục tiêu cần đạt: {formatVND(calc.revenueTarget)}</p>

                      {totalSet > 0 && months > 0 && (
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-slate-500">Dự kiến cả thời hạn thuê ({months} tháng)</p>
                          <div className="space-y-1.5 text-sm">
                            <PriceRow label="Tổng thu mọi phòng" value={formatVND(totalSet * months)} />
                            <PriceRow label="Trừ tổng vốn" value={`− ${formatVND(totalInvest)}`} />
                            <div className="my-1.5 border-t border-slate-200" />
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-700">Lãi dự kiến</span>
                              <span className={`font-black ${totalProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                {totalProfit < 0 ? '− ' : ''}{formatVND(Math.abs(totalProfit))}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {!calc && canEdit && (
              <p className="rounded-xl bg-slate-50 border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">
                Nhập mục tiêu rồi bấm <span className="font-semibold text-slate-500">"Tính giá cho thuê"</span> để xem giá đề xuất.
              </p>
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

// ─── Sub-components ───────────────────────────────────────────────────────────

const PriceRow = ({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: 'indigo' }) => (
  <div className="flex items-center justify-between gap-3">
    <span className={tone === 'indigo' ? 'font-medium text-indigo-600' : 'text-slate-500'}>{label}</span>
    <span className={bold ? 'font-black text-slate-900' : tone === 'indigo' ? 'font-bold text-indigo-700' : 'font-semibold text-slate-800'}>
      {value}
    </span>
  </div>
);

const ModeBtn = ({
  active, onClick, icon: Icon, label, sub,
}: { active: boolean; onClick: () => void; icon: typeof Percent; label: string; sub?: string }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center gap-0.5 rounded-xl border-2 px-2 py-2.5 text-xs font-bold transition ${
      active ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
    }`}
  >
    <Icon className="h-4 w-4" /> {label}
    {sub && <span className="text-[10px] font-medium text-slate-400">{sub}</span>}
  </button>
);
