import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, Banknote, Building, CalendarDays, Calculator, CheckCircle2,
  DollarSign, FileText, Hammer, Image as ImageIcon, Link2, MapPin, Package,
  Percent, PiggyBank, Send, Target,
} from 'lucide-react';
import { propertyService } from '@/services/property.service';
import type {
  OnboardingSummaryResponse,
  PropertyResponse,
  HostConfirmRequest,
  PricingMode,
  PricingCalculationResponse,
  CalculatePricingRequest,
} from '@/types/api.types';
import { HandoverEquipmentSection } from '@/pages/admin/onboarding/HandoverEquipmentSection';
import { OperationalEquipmentPanel } from '@/pages/admin/onboarding/OperationalEquipmentPanel';
import { PropertyMap } from '@/components/PropertyMap';
import { RoomPriceTable } from './review/RoomPriceTable';
import {
  BigStat, Divider, Line, Note, Panel, derive, formatVND, shortVND,
} from './review/pricingBreakdown';

/**
 * DUYỆT GIÁ & KÍCH HOẠT TÒA NHÀ (Host).
 *
 * Đây là màn Host ký một quyết định tiền bạc kéo dài vài năm, nên toàn bộ thiết kế xoay
 * quanh một câu: **con số này ở đâu ra?** Mỗi kết quả tính đều hiện kèm phép tính bằng
 * đúng những số đã nêu phía trên, và mỗi ô Host nhập đều nói rõ nó tác động vào đâu.
 *
 * Bố cục đi theo đúng thứ tự suy nghĩ, mỗi phần chiếm trọn chiều ngang:
 *   1. Tòa nhà là cái gì            → thông tin + bản đồ + ảnh
 *   2. Đã bỏ ra bao nhiêu vốn       → bóc tách thuê nhà / cải tạo / thiết bị
 *   3. Muốn lãi bao nhiêu           → 4 ô nhập, mỗi ô kèm giải thích
 *   4. Vậy phải cho thuê bao nhiêu  → chuỗi phép tính từ vốn ra giá
 *   5. Chốt giá từng phòng / cả căn → bảng sửa được
 *   6. Xác nhận                     → thanh dính đáy màn
 *
 * ⚠️ Bản trước nhét toàn bộ phần 3-6 vào cột phải rộng 1/3 màn, lại còn cuộn lồng nhau ở
 * danh sách phòng — xem [[RoomPriceTable]]. Đừng gom lại như cũ: đây là phần đọc nhiều
 * số nhất trang, nó cần chiều ngang.
 */

// Mô hình mới: giá đã bao gồm lợi nhuận → gửi giá override trực tiếp, không cần biên dự phòng.
const CONTINGENCY_FOR_CONFIRM = 100;

/**
 * CỬA SỔ BÀN GIAO cuối hợp đồng — số tháng cuối KHÔNG được tính là tháng có doanh thu.
 *
 * Hết hạn master lease thì công ty phải cho khách dọn đi (báo trước thường 30 ngày), tháo
 * nội thất, sơn sửa hoàn trả hiện trạng ban đầu cho chủ nhà gốc. Quãng đó nhà trống.
 *
 * Để thành hằng số có TÊN thay vì giấu trong phép trừ ngày: nhìn là biết đang chừa mấy tháng,
 * đổi chính sách thì sửa một chỗ, và không ai tưởng nhầm là lỗi rồi đi "sửa" nó đi.
 */
const HANDOVER_BUFFER_MONTHS = 1;

/** Dưới mốc này thì không áp buffer — HĐ 3 tháng mà trừ 1 là mất 1/3 thời gian thu tiền. */
const HANDOVER_MIN_TERM_MONTHS = 6;

const formatDate = (d?: string) => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
};

const parseDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day); // local midnight, tránh lệch múi giờ
};

/**
 * Số tháng TRỌN của hợp đồng — dùng ĐÚNG quy tắc của BE
 * (`DepreciationServiceImpl.resolveContractMonths` → `ChronoUnit.MONTHS.between`):
 * đếm số tháng đầy đủ đã trôi qua, phần lẻ chưa đủ một tháng thì bỏ.
 *
 * ⚠️ Bản trước FE cộng thêm 1 ngày vào ngày kết thúc rồi mới đếm, tức là tính theo kiểu
 * "trọn ngày cuối". Với HĐ 01/05/2027 → 31/05/2029 thì FE ra 25 tháng còn BE ra 24, và
 * trang hiện đồng thời cả hai con số ở hai chỗ khác nhau — Host nhìn vào chỉ thấy hệ
 * thống tự mâu thuẫn. Giờ FE đếm y hệt BE, và mọi nơi đều lấy `calc.contractMonths` làm
 * gốc nếu đã tính giá xong.
 */
const monthsBetween = (start?: string, end?: string): number | null => {
  if (!start || !end) return null;
  const s = parseDate(start);
  const e = parseDate(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  if (e.getDate() < s.getDate()) months -= 1;
  return months > 0 ? months : null;
};

/**
 * Số tháng thuê THỰC TẾ của hợp đồng — coi ngày kết thúc là trọn ngày, vì công ty giữ nhà
 * hết ngày đó và thu được tiền khách trọn tháng đó.
 *
 * HĐ 01/05/2027 → 31/05/2029 nằm trọn trong 25 tháng lịch (5/2027 … 5/2029). BE lại chia
 * vốn theo `ChronoUnit.MONTHS.between` = 24 tháng trọn, bỏ 30 ngày lẻ cuối. Chênh lệch đó
 * KHÔNG tạo lỗ hổng tiền — `cRent` vẫn là trọn gói tiền thuê cả kỳ nên vốn được tính đủ,
 * chia cho 24 chỉ khiến hoàn vốn nhanh hơn và giá đề xuất cao hơn một chút.
 *
 * Nhưng nó làm **lãi cả kỳ bị báo thiếu đúng một tháng doanh thu**. Nên trang tính doanh
 * thu theo số tháng THỰC TẾ này, còn phần hoàn vốn vẫn theo số tháng của BE, và nói rõ
 * chỗ lệch thay vì lặng lẽ chọn một bên.
 */
const leaseMonthsActual = (start?: string, end?: string): number | null => {
  if (!start || !end) return null;
  const e = parseDate(end);
  if (isNaN(e.getTime())) return null;
  e.setDate(e.getDate() + 1); // trọn ngày cuối: 31/05 → mốc 01/06
  const endPlus = `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`;
  return monthsBetween(start, endPlus);
};

/**
 * Số tháng CÒN khai thác được — từ ngày nhà thật sự cho thuê được tới hết hợp đồng.
 *
 * Ngày bắt đầu khai thác là mốc MUỘN NHẤT trong ba mốc: ngày hợp đồng bắt đầu, ngày cải tạo
 * xong, và hôm nay. Ba tháng cải tạo hay ba tháng nằm chờ duyệt đều là thời gian **không có
 * đồng doanh thu nào**, trong khi tiền thuê trả chủ vẫn chạy đủ.
 *
 * Vì vậy vốn phải hoàn xong trong quãng còn lại này, không phải trong cả kỳ hợp đồng. Chia
 * theo cả kỳ là định giá thiếu, và thiếu bao nhiêu thì mất đúng bấy nhiêu.
 */
const rentableMonthsLeft = (start?: string, end?: string, renovationEnd?: string): number | null => {
  if (!start || !end) return null;
  const candidates = [parseDate(start), new Date()];
  if (renovationEnd) {
    const r = parseDate(renovationEnd);
    if (!isNaN(r.getTime())) candidates.push(r);
  }
  const from = new Date(Math.max(...candidates.map((d) => d.getTime())));
  from.setHours(0, 0, 0, 0);
  const fromIso = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
  return leaseMonthsActual(fromIso, end);
};

/** 24 → "2 năm", 25 → "2 năm 1 tháng", 8 → "8 tháng". */
const monthsToLabel = (months: number): string => {
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years > 0 && rem > 0) return `${years} năm ${rem} tháng`;
  if (years > 0) return `${years} năm`;
  return `${rem} tháng`;
};

/** Input tiền VND có phân tách hàng nghìn. */
const MoneyInput = ({
  value, onChange, placeholder, suffix = 'đ', invalid, disabled,
}: {
  value: number | '';
  onChange: (v: number | '') => void;
  placeholder?: string;
  suffix?: string;
  invalid?: boolean;
  disabled?: boolean;
}) => (
  <div className="relative">
    <input
      type="text"
      inputMode="numeric"
      disabled={disabled}
      value={value === '' ? '' : Number(value).toLocaleString('vi-VN')}
      onChange={(e) => {
        const raw = e.target.value.replace(/\./g, '').replace(/[^0-9]/g, '');
        onChange(raw === '' ? '' : Number(raw));
      }}
      className={`input-field pr-12 text-right font-bold tabular-nums ${invalid ? 'border-rose-300 focus:border-rose-400' : ''}`}
      placeholder={placeholder ?? '0'}
    />
    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">{suffix}</span>
  </div>
);

export const HostPropertyReview = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const propertyId = Number(id);

  const [summary, setSummary] = useState<OnboardingSummaryResponse | null>(null);
  const [property, setProperty] = useState<PropertyResponse | null>(null);
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
  /**
   * Host đã tự xác nhận là biết nhà chưa tới ngày hợp đồng với chủ nhà mà vẫn kích hoạt.
   *
   * Không chặn cứng vì duyệt giá sớm là việc hợp lệ (chốt giá trước cho kịp mở bán). Nhưng
   * kích hoạt = nhà vào trạng thái ACTIVE = quản lý đón khách được ngay, kể cả trước ngày
   * công ty thật sự có quyền quản lý căn đó. Nên bắt tick một lần cho chắc là đã đọc.
   */
  const [ackEarlyActivation, setAckEarlyActivation] = useState(false);

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
  // `summary.propertyName` có lúc rỗng (BE không map) → rơi về tên ở bản ghi Property,
  // không thì tiêu đề trang hiện ra cặp nháy rỗng "".
  const propertyName = summary?.propertyName?.trim() || property?.propertyName?.trim() || `Tòa nhà #${propertyId}`;

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

  /**
   * Hợp đồng với chủ nhà chưa tới ngày bắt đầu — công ty CHƯA có quyền quản lý căn này.
   * Tính sớm ở đây (trước các early-return) vì `canConfirm` cần tới.
   */
  const leaseStart = summary?.inboundContract?.startDate;
  const leaseNotStarted = (() => {
    if (!leaseStart) return false;
    const s = parseDate(leaseStart);
    if (isNaN(s.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return s > today;
  })();
  const daysUntilLease = leaseNotStarted && leaseStart
    ? Math.round((parseDate(leaseStart).getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000)
    : 0;

  const canConfirm =
    canEdit &&
    !!calc &&
    // Kích hoạt sớm hơn ngày hợp đồng thì phải tick xác nhận đã đọc cảnh báo.
    (!leaseNotStarted || ackEarlyActivation) &&
    (isRoomScope
      ? (calc.roomResults || []).length > 0 && (calc.roomResults || []).every((r) => (roomPrices[r.roomId] || 0) > 0)
      : wholeFinal > 0);

  const handleConfirm = async () => {
    if (!canConfirm || !summary || !calc) return;

    // KHÔNG gửi operationManagerId nữa: quản lý vận hành được phân công theo KHU VỰC
    // (màn /host/zones), không gán riêng cho từng nhà. Nhà thuộc quận chưa có quản lý sẽ
    // ở trạng thái PENDING_OPERATION_MANAGER cho tới khi Host gán cho khu vực đó.
    const payload: HostConfirmRequest = { contingencyPercent: CONTINGENCY_FOR_CONFIRM };

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
      <div className="flex min-h-[60vh] items-center justify-center">
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
        <p className="mt-3 text-slate-500">Đã chốt giá cho tòa nhà.</p>
        <p className="mt-2 text-sm text-slate-500">
          Nhà sẽ do quản lý của khu vực
          {property?.zoneName ? <span className="font-semibold text-slate-700"> {property.zoneName}</span> : ''}{' '}
          phụ trách. Nếu khu vực chưa có quản lý, nhà chờ ở trạng thái{' '}
          <span className="font-semibold text-violet-600">Chờ gán quản lý</span> cho tới khi bạn gán.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button onClick={() => navigate(`/host/properties/${propertyId}`)} className="btn-primary rounded-xl px-8 py-3">
            Xem chi tiết tòa nhà
          </button>
          <button
            onClick={() => navigate('/host/zones')}
            className="rounded-xl border border-slate-200 px-6 py-3 text-sm font-bold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700"
          >
            Gán quản lý khu vực
          </button>
        </div>
        <button
          onClick={() => navigate('/host/properties')}
          className="mx-auto mt-5 flex items-center gap-1.5 text-sm font-bold text-slate-500 transition hover:text-indigo-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Về danh sách bất động sản
        </button>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="py-20 text-center text-slate-400">
        <AlertCircle className="mx-auto mb-3 h-10 w-10" />
        <p className="font-semibold">{error || 'Không tìm thấy dữ liệu'}</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm text-indigo-600 hover:underline">← Quay lại</button>
      </div>
    );
  }

  const d = calc ? derive(calc) : null;
  const months = calc?.contractMonths ?? 0;
  const inbound = summary.inboundContract;
  // ── BA con số thời hạn, khác nhau có chủ đích. Trang hiện cả ba chứ không giấu bên nào,
  //    vì lẫn lộn giữa chúng là cách nhanh nhất để định giá sai cả một hợp đồng.
  // ── BỐN con số thời hạn — nay LẤY THẲNG TỪ MÁY CHỦ, không tự tính nữa.
  //
  // BE (19/08/2026) đã bóc sẵn trong `InboundLeaseRules.RevenueWindow` và trả về đủ:
  //   • leaseMonths     — thời hạn HĐ chủ nhà, tính trọn ngày kết thúc
  //   • rentableFrom    — ngày đầu tiên nhà cho thuê được (max của HĐ bắt đầu / cải tạo xong / hôm nay)
  //   • rentableMonths  — số tháng còn khai thác, tính từ rentableFrom
  //   • revenueMonths   — rentableMonths − cửa sổ bàn giao; đây cũng chính là `contractMonths`
  //                       mà BE dùng làm mẫu số chia vốn
  //
  // Trước đây FE tự suy cả bốn số này để đối chiếu và cảnh báo khi máy chủ đếm sai. Nay máy
  // chủ đếm đúng nên giữ hai bộ công thức song song chỉ tạo nguy cơ lệch nhau — bỏ hẳn bản
  // của FE, chỉ giữ đường lui khi gọi API cũ chưa trả field mới.
  const modelMonths = calc?.contractMonths ?? monthsBetween(inbound?.startDate, inbound?.endDate) ?? 0;
  const realMonths = calc?.leaseMonths
    ?? leaseMonthsActual(inbound?.startDate, inbound?.endDate)
    ?? modelMonths;
  const rentableMonths = calc?.rentableMonths
    ?? rentableMonthsLeft(inbound?.startDate, inbound?.endDate, summary.renovationEndDate)
    ?? realMonths;
  const handoverBuffer = calc?.handoverBufferMonths
    ?? (rentableMonths >= HANDOVER_MIN_TERM_MONTHS ? HANDOVER_BUFFER_MONTHS : 0);

  /** Số tháng THẬT SỰ THU ĐƯỢC TIỀN — mẫu số chia vốn và cũng là kỳ tính doanh thu. */
  const revenueMonths = calc?.revenueMonths ?? Math.max(1, rentableMonths - handoverBuffer);

  /** Tháng trôi mất ở ĐẦU kỳ (cải tạo / chờ duyệt) — chỉ để hiển thị chuỗi trừ dần. */
  const lostMonths = Math.max(0, realMonths - rentableMonths);

  /**
   * Máy chủ chia vốn cho nhiều tháng hơn số tháng thu được tiền ⇒ giá đề xuất thiếu.
   * Sau khi BE sửa thì luôn = 0; giữ lại làm lưới an toàn phòng khi chạy với BE bản cũ.
   */
  const overCountedMonths = Math.max(0, modelMonths - revenueMonths);

  /**
   * Hợp đồng đã tới ngày bắt đầu chưa. Cần nói thẳng ra vì hai tình huống dưới đây nhìn
   * giống hệt nhau trên màn hình mà ý nghĩa ngược nhau:
   *   • HĐ bắt đầu 01/05/2027, hôm nay 19/08/2026 → CHƯA bắt đầu, chưa mất tháng nào.
   *   • HĐ bắt đầu 01/05/2026, hôm nay 19/08/2026 → đã trôi 3 tháng không doanh thu.
   * Khác nhau đúng một chữ số ở phần năm, in cỡ nhỏ màu xám thì rất dễ đọc nhầm.
   */
  const startInfo = (() => {
    if (!inbound?.startDate) return null;
    const start = parseDate(inbound.startDate);
    if (isNaN(start.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (start <= today) return { started: true, daysLeft: 0 };
    return {
      started: false,
      daysLeft: Math.round((start.getTime() - today.getTime()) / 86_400_000),
    };
  })();

  /**
   * Tổng diện tích các phòng vượt hẳn diện tích cả căn ⇒ dữ liệu diện tích hỏng.
   * Nới 5% cho sai số làm tròn, vượt hơn thế mới coi là sai — phòng cộng lại luôn phải
   * NHỎ hơn cả căn vì còn hành lang, cầu thang, khu vực chung.
   */
  const roomAreaIssue = (() => {
    const rooms = calc?.roomResults;
    const propertyArea = property?.areaSize;
    if (!rooms?.length || !propertyArea) return null;
    const sum = rooms.reduce((s, r) => s + (r.area || 0), 0);
    if (sum <= propertyArea * 1.05) return null;
    return { sum: Math.round(sum * 10) / 10, propertyArea };
  })();

  // Tổng đang chốt + lãi cả kỳ, dùng chung cho thanh xác nhận dính đáy.
  const totalMonthly = isRoomScope
    ? (calc?.roomResults || []).reduce((s, r) => s + (roomPrices[r.roomId] || 0), 0)
    : wholeFinal;
  const totalInvest = isRoomScope
    ? (calc?.roomResults || []).reduce((s, r) => s + (r.totalInvestment || 0), 0) || (calc?.capex ?? 0)
    : (calc?.capex ?? 0);
  // Doanh thu tính theo số tháng THẬT của hợp đồng, không theo số tháng cắt cụt của BE —
  // nếu không thì lãi cả kỳ bị báo thiếu đúng một tháng tiền thuê.
  const totalProfit = totalMonthly > 0 && revenueMonths > 0 ? totalMonthly * revenueMonths - totalInvest : 0;

  /**
   * BÁO CÁO LÃI LỖ THẬT của cả kỳ.
   *
   * ⚠️ Bản trước chỉ lấy `tổng thu − vốn đầu tư` rồi gọi đó là "lãi cả kỳ" — QUÊN TRỪ CHI PHÍ
   * VẬN HÀNH. Với chi phí vận hành 20tr/tháng suốt 25 tháng thì con số bị thổi lên 500 triệu:
   * host nhập mục tiêu lãi 1tr/tháng mà màn hình báo lãi 652tr, không cách nào đối chiếu được.
   *
   * Chi phí vận hành đã được cộng vào GIÁ THUÊ (khách trả), nhưng nó vẫn là tiền chi ra hằng
   * tháng nên phải trừ khỏi lợi nhuận. Không trừ là tính lãi hai lần.
   */
  const pnl = (() => {
    if (!calc || totalMonthly <= 0 || revenueMonths <= 0) return null;
    const revenue = totalMonthly * revenueMonths;
    const opexTotal = (calc.oOperation ?? 0) * revenueMonths;
    const net = revenue - totalInvest - opexTotal;
    return {
      revenue,
      opexTotal,
      net,
      perMonth: net / revenueMonths,
      /** Lãi TRƯỚC chi phí vận hành — con số cũ, giữ lại để không ai tưởng số bị mất đi đâu. */
      beforeOpex: revenue - totalInvest,
    };
  })();

  /**
   * Vì sao lãi ròng lại VƯỢT mục tiêu host đặt ra. Bốn nguồn dưới đây cộng lại phải đúng bằng
   * lãi ròng; nếu không khớp (BE đổi công thức) thì không hiện, thà im còn hơn giải thích sai.
   */
  const surplus = (() => {
    if (!calc || !d || !pnl) return null;
    const vRate = calc.vRate ?? 0;
    const recovery = calc.monthlyRecovery;
    const target = calc.revenueTarget;
    // Không còn số hạng "tháng đuôi dư ra": doanh thu đã chốt ở min(còn lại, số tháng chia
    // vốn) nên tháng đuôi không bao giờ được tính là tháng có tiền về.
    const parts = {
      goal: d.profitPerMonth * revenueMonths,
      buffer: (recovery + (calc.oOperation ?? 0) + d.profitPerMonth) * vRate * revenueMonths,
      above: (totalMonthly - target) * revenueMonths,
    };
    const sum = parts.goal + parts.buffer + parts.above;
    return Math.abs(sum - pnl.net) <= 1000 ? parts : null;
  })();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600">
          <ArrowLeft className="h-4 w-4" /> Quay lại
        </button>
        <h1 className="text-2xl font-black text-slate-900">Duyệt giá &amp; Kích hoạt Tòa nhà</h1>
        <p className="mt-1 text-sm text-slate-500">
          Xem toàn bộ vốn đã bỏ ra cho <span className="font-bold text-slate-700">{propertyName}</span>, đặt mục tiêu lãi, rồi chốt giá cho thuê.
        </p>
        {summary.submittedToHostAt && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <CalendarDays className="h-3.5 w-3.5" /> Admin gửi duyệt: {formatDate(summary.submittedToHostAt.slice(0, 10))}
          </p>
        )}
        {summary.status === 'UNDER_RENOVATION' && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-bold text-amber-800">Tòa nhà đang trong giai đoạn cải tạo</p>
              <p className="mt-1 text-sm text-amber-700">Bạn chưa thể xác nhận giá cho đến khi Admin đánh dấu cải tạo hoàn tất.</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>
      )}

      {/* ── 1. Tòa nhà ──────────────────────────────────────────────────────── */}
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Thông tin tòa nhà" icon={Building}>
          {property && (property.fullAddress || property.shortAddress) && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-slate-50 p-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{property.fullAddress || property.shortAddress}</p>
                {property.zoneName && <p className="text-xs text-slate-500">{property.zoneName}</p>}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-500">Loại hình</p>
              <p className="font-bold text-slate-900">{summary.wholeHouse ? 'Nhà nguyên căn' : 'Chia phòng'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Diện tích</p>
              <p className="font-bold text-slate-900">{property?.areaSize ? `${property.areaSize} m²` : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Cải tạo</p>
              <p className="font-bold text-slate-900">{summary.hasRenovation ? 'Có' : 'Không'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Số tầng</p>
              <p className="font-bold text-slate-900">{summary.totalFloor ?? summary.floorCount ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Tổng phòng</p>
              <p className="font-bold text-slate-900">{summary.totalRooms}</p>
            </div>
            {summary.roomsPerFloor > 0 && (
              <div>
                <p className="text-xs text-slate-500">Phòng/tầng</p>
                <p className="font-bold text-slate-900">{summary.roomsPerFloor}</p>
              </div>
            )}
          </div>
          {property?.descriptions && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className="mb-1 text-xs text-slate-500">Mô tả chi tiết</p>
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{property.descriptions}</p>
            </div>
          )}
        </Panel>

        <div className="space-y-5">
          {property && (property.fullAddress || property.shortAddress) && (
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <PropertyMap address={property.fullAddress || property.shortAddress} height={240} />
            </div>
          )}
          {property?.imageUrls && property.imageUrls.length > 0 && (
            <Panel title={`Hình ảnh (${property.imageUrls.length})`} icon={ImageIcon}>
              <div className="grid grid-cols-4 gap-2">
                {property.imageUrls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer"
                    className="group block aspect-square overflow-hidden rounded-xl border border-slate-200">
                    <img src={url} alt={`Ảnh ${i + 1}`} className="h-full w-full object-cover transition duration-200 group-hover:scale-105" />
                  </a>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>

      {/* ── 2. Vốn đã bỏ ra ─────────────────────────────────────────────────── */}
      <div className="mb-5">
        <Panel
          title="Vốn đã bỏ ra cho tòa nhà này"
          icon={PiggyBank}
          subtitle="Ba khoản dưới đây cộng lại thành tổng vốn — chính là số tiền phải thu hồi được qua tiền thuê trong suốt thời hạn hợp đồng."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Tiền thuê trả chủ nhà */}
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-slate-500">
                <FileText className="h-3.5 w-3.5" /> 1. Tiền thuê trả chủ nhà
              </p>
              {inbound ? (
                <>
                  <p className="mt-2 text-xl font-black tabular-nums text-slate-900">
                    {formatVND(calc?.cRent ?? inbound.totalRentAmount)}
                  </p>
                  <div className="mt-2 space-y-0.5 text-xs">
                    <p className="text-slate-500">Mã HĐ: <span className="font-mono font-bold text-slate-700">{inbound.contractCode}</span></p>
                    <p className="text-slate-500">Chủ nhà: <span className="font-semibold text-slate-700">{inbound.ownerName}</span></p>
                    <p className="text-slate-500">{formatDate(inbound.startDate)} → {formatDate(inbound.endDate)}</p>
                    {/* Thời hạn THẬT của hợp đồng — đây là con số phải khớp với tờ giấy ký
                        với chủ nhà, không phải con số nội bộ dùng để chia vốn. */}
                    {realMonths > 0 && (
                      <p className="font-bold text-indigo-600">
                        {realMonths} tháng <span className="font-medium text-slate-400">· {monthsToLabel(realMonths)}</span>
                      </p>
                    )}
                    {/* Nói thẳng HĐ đã chạy chưa — đọc nhầm năm ở dòng ngày là chuyện rất dễ xảy ra */}
                    {startInfo && (
                      startInfo.started ? (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Đang trong thời hạn thuê
                        </span>
                      ) : (
                        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                          Chưa tới ngày bắt đầu · còn {startInfo.daysLeft} ngày
                        </span>
                      )
                    )}
                  </div>
                  {inbound.contractScanUrl && (
                    <a href={inbound.contractScanUrl} target="_blank" rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100">
                      <Link2 className="h-3.5 w-3.5" /> Xem bản scan
                    </a>
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-400">Chưa có hợp đồng với chủ nhà</p>
              )}
            </div>

            {/* Cải tạo */}
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-slate-500">
                <Hammer className="h-3.5 w-3.5" /> 2. Chi phí cải tạo
              </p>
              <p className="mt-2 text-xl font-black tabular-nums text-slate-900">
                {formatVND(calc?.cRenovation ?? summary.totalRenovationCost ?? 0)}
              </p>
              {summary.renovationLines?.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {summary.renovationLines.map((l) => (
                    <div key={l.id} className="flex items-start justify-between gap-2 text-xs">
                      <span className="min-w-0 text-slate-500">
                        {l.categoryName}
                        {l.note && <span className="block text-[11px] text-slate-400">{l.note}</span>}
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-slate-700">{formatVND(l.cost)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-400">Không có hạng mục cải tạo.</p>
              )}
              {summary.renovationStartDate && (
                <p className="mt-2 text-[11px] text-slate-400">
                  {formatDate(summary.renovationStartDate)} → {formatDate(summary.renovationEndDate)}
                  {summary.renovationCompleted && <span className="ml-1.5 font-bold text-emerald-600">✓ hoàn tất</span>}
                </p>
              )}
            </div>

            {/* Thiết bị */}
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-slate-500">
                <Package className="h-3.5 w-3.5" /> 3. Thiết bị mua mới
              </p>
              {/*
                Suy ngược khi máy chủ chưa trả `cEquipment`.

                `GET /properties/{id}/pricing` (chạy lúc mở trang) chỉ trả `capex`, KHÔNG trả ba
                thành phần — chỉ `POST /calculate` mới có. Nên trước đây ô này trống cho tới khi
                host bấm "Tính giá cho thuê", dù tổng vốn ngay bên dưới đã hiện.

                Hai phần kia đều có sẵn từ nguồn khác (HĐ với chủ nhà, danh sách hạng mục cải
                tạo) nên phần còn lại chính là thiết bị. Manifest thiết bị KHÔNG kèm giá nên
                không cộng trực tiếp được, phải lấy hiệu.

                Chỉ hiện khi ra số không âm — âm nghĩa là ba phần không khớp tổng, lúc đó thà
                để trống còn hơn bịa một con số trông như thật.
              */}
              {(() => {
                const eq = calc?.cEquipment ?? (() => {
                  const rent = calc?.cRent ?? inbound?.totalRentAmount;
                  const reno = calc?.cRenovation ?? summary.totalRenovationCost;
                  if (calc?.capex == null || rent == null || reno == null) return null;
                  const rest = calc.capex - rent - reno;
                  return rest >= 0 ? rest : null;
                })();
                return (
                  <>
                    <p className="mt-2 text-xl font-black tabular-nums text-slate-900">
                      {eq != null ? formatVND(eq) : '—'}
                    </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Chỉ tính thiết bị công ty <b>mua mới</b> để khai thác. Đồ chủ nhà bàn giao được ghi nhận
                riêng và <b>không</b> tính vào vốn.
              </p>
                    {eq == null && (
                      <p className="mt-2 text-[11px] text-slate-400">
                        Bấm &quot;Tính giá cho thuê&quot; để máy chủ trả về số này.
                      </p>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Tổng vốn — có phép cộng để đối chiếu */}
          {calc && (
            <div className="mt-4 rounded-xl border-2 border-slate-900 bg-slate-900 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Tổng vốn đầu tư</p>
                  {d?.capexMatches && (
                    <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                      {shortVND(d.capexParts.rent)} + {shortVND(d.capexParts.renovation)} + {shortVND(d.capexParts.equipment)}
                    </p>
                  )}
                </div>
                <p className="text-2xl font-black tabular-nums text-white">{formatVND(calc.capex)}</p>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* ── Thiết bị chi tiết — ĐÓNG SẴN ─────────────────────────────────────
          Một toà 50 phòng dễ có vài trăm thiết bị. Bung sẵn thì hai khối này chiếm mấy màn
          hình và đẩy phần chốt giá xuống tít dưới, trong khi ở màn duyệt giá thì thiết bị
          chỉ là tài liệu tra cứu — con số cần thiết (tổng giá trị) đã nằm ở ô "Thiết bị mua
          mới" của phần Vốn. Tiêu đề vẫn hiện tóm tắt nên đóng vẫn nắm được ý chính. */}
      <div className="mb-5 grid gap-3">
        <HandoverEquipmentSection propertyId={propertyId} collapsible />
        <OperationalEquipmentPanel propertyId={propertyId} collapsible />
      </div>

      {/* ── 3 + 4. Mục tiêu và chuỗi tính ra giá ─────────────────────────────── */}
      <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
        {/* Ô nhập */}
        <Panel title="Mục tiêu của bạn" icon={Target} tone="accent"
          subtitle="Bốn con số dưới đây là toàn bộ những gì bạn phải nhập. Mọi thứ còn lại hệ thống tự tính.">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-bold text-slate-700">Bạn muốn định giá theo cách nào?</p>
              <div className="grid grid-cols-2 gap-2">
                <ModeBtn active={mode === 'FORWARD'} onClick={() => setMode('FORWARD')} icon={DollarSign}
                  label="Theo tiền lãi" sub="Biết muốn lãi/tháng" />
                <ModeBtn active={mode === 'REVERSE'} onClick={() => setMode('REVERSE')} icon={Percent}
                  label="Theo % sinh lời" sub="Biết % lời/năm" />
              </div>
            </div>

            {mode === 'FORWARD' ? (
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">① Tiền lãi muốn thu mỗi tháng</span>
                <MoneyInput value={pDesired} onChange={setPDesired} placeholder="VD: 10.000.000" disabled={!canEdit} />
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Tiền lời <b>thực nhận</b> mỗi tháng, sau khi đã trừ chi phí vận hành và trừ phần thu hồi vốn.
                  Số này cộng thẳng vào tiền thuê cần đạt.
                </p>
              </label>
            ) : (
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-slate-700">① Tỷ lệ sinh lời mong muốn mỗi năm</span>
                <div className="relative">
                  <input type="number" min={0} value={roiExpected} disabled={!canEdit}
                    onChange={(e) => setRoiExpected(e.target.value === '' ? '' : Number(e.target.value))}
                    className="input-field pr-10 text-right font-bold tabular-nums" placeholder="VD: 15" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">%</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Phần trăm lời trên tổng vốn mỗi năm.
                  {calc && roiExpected !== '' && Number(roiExpected) > 0 && (
                    <> Với vốn {formatVND(calc.capex)} thì {roiExpected}%/năm ≈{' '}
                      <b className="text-indigo-700">{formatVND((calc.capex * Number(roiExpected)) / 100 / 12)}</b> lãi mỗi tháng.
                    </>
                  )}
                </p>
              </label>
            )}

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">② Chi phí vận hành mỗi tháng</span>
              <MoneyInput value={oOperation} onChange={setOOperation} placeholder="0" disabled={!canEdit} />
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Chi cố định hằng tháng: lương quản lý, internet, vệ sinh, bảo trì định kỳ…
                Đây là <b>tiền mặt chi ra mỗi tháng</b>, khác với vốn đầu tư ban đầu. Để 0 nếu không có.
              </p>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-slate-700">③ Biên dự phòng trống phòng</span>
              <div className="relative">
                <input type="number" min={0} max={99} value={vRatePct} disabled={!canEdit}
                  onChange={(e) => setVRatePct(Number(e.target.value))}
                  className="input-field pr-10 text-right font-bold tabular-nums" placeholder="10" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">%</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Cộng thêm {vRatePct}% vào giá để bù những tháng phòng bỏ trống — tương đương dự phòng
                khoảng <b>{(revenueMonths * vRatePct / 100).toFixed(1)} tháng trống</b> trong {revenueMonths} tháng khai thác. Thường để 10%.
              </p>
            </label>

            <button
              type="button"
              onClick={handleCalculate}
              disabled={calculating || !canEdit}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Calculator className="h-4 w-4" />
              {calculating ? 'Đang tính...' : calc ? 'Tính lại giá thuê' : 'Tính giá cho thuê'}
            </button>
            {calcError && <Note tone="rose">{calcError}</Note>}
          </div>
        </Panel>

        {/* Chuỗi tính */}
        <Panel title="Từ vốn ra giá thuê — từng bước" icon={Calculator}
          subtitle={calc ? 'Mỗi dòng là một bước tính, dùng đúng con số của dòng phía trên.' : undefined}>
          {!calc ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 p-6 text-center">
              <Calculator className="mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm font-semibold text-slate-500">Chưa có kết quả tính</p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
                Nhập mục tiêu bên trái rồi bấm <b>&quot;Tính giá cho thuê&quot;</b>. Hệ thống sẽ hiện toàn bộ
                phép tính từ tổng vốn cho tới giá thuê từng phòng.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <BigStat label="Tổng vốn" value={formatVND(calc.capex)} sub={`Thu hồi trong ${months} tháng`} />
                <BigStat label="Cần thu mỗi tháng" value={formatVND(calc.revenueTarget)} tone="indigo"
                  sub={`Khi lấp đầy 100%`} />
                <BigStat label="Lãi mục tiêu / tháng" value={formatVND(d?.profitPerMonth ?? 0)} tone="emerald"
                  sub={mode === 'REVERSE' && calc.roiExpected ? `Từ ROI ${calc.roiExpected}%/năm` : 'Bạn tự đặt'} />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <Line
                  label="Tổng vốn đầu tư"
                  hint="Tiền thuê trả chủ + cải tạo + thiết bị mua mới"
                  formula={d?.capexMatches
                    ? `${shortVND(d.capexParts.rent)} + ${shortVND(d.capexParts.renovation)} + ${shortVND(d.capexParts.equipment)}`
                    : undefined}
                  value={formatVND(calc.capex)}
                  tone="total"
                />
                <Line
                  label="Thời hạn hợp đồng với chủ nhà"
                  hint={`${monthsToLabel(realMonths)} — theo đúng ngày ghi trên hợp đồng`}
                  value={`${realMonths} tháng`}
                />
                {lostMonths > 0 && (
                  <Line
                    label="Đã trôi mất trước khi khai thác được"
                    hint={calc.rentableFrom
                      ? `Cải tạo + chờ duyệt — chỉ khai thác được từ ${formatDate(calc.rentableFrom)}`
                      : 'Cải tạo + chờ duyệt — vẫn trả tiền thuê chủ nhà nhưng không có doanh thu'}
                    value={`− ${lostMonths} tháng`}
                    tone="bad"
                    indent
                  />
                )}
                {handoverBuffer > 0 && (
                  <Line
                    label="Trừ cửa sổ bàn giao cuối kỳ"
                    hint="Khách dọn đi, tháo nội thất, sơn sửa hoàn trả hiện trạng cho chủ nhà — nhà trống, không thu được tiền"
                    value={`− ${handoverBuffer} tháng`}
                    tone="bad"
                    indent
                  />
                )}
                <Line
                  label="Số tháng THẬT SỰ THU ĐƯỢC TIỀN"
                  hint={startInfo && !startInfo.started && lostMonths === 0
                    ? `Hợp đồng chưa tới ngày bắt đầu (còn ${startInfo.daysLeft} ngày) — chưa mất tháng nào ở đầu kỳ`
                    : 'Vốn phải hoàn xong trong đúng quãng này'}
                  value={`${revenueMonths} tháng`}
                  tone="accent"
                />
                <Line
                  label="Số tháng máy chủ dùng để chia vốn"
                  hint={overCountedMonths > 0
                    ? `⚠ Nhiều hơn ${overCountedMonths} tháng so với số tháng thu được tiền → giá đề xuất bị thiếu`
                    : 'Khớp với số tháng thu được tiền'}
                  value={`${months} tháng`}
                  tone={overCountedMonths > 0 ? 'bad' : 'plain'}
                />
                <Divider />
                <Line
                  label="Hoàn vốn mỗi tháng"
                  hint="Phần vốn phải thu về đều mỗi tháng để hết hạn HĐ là hoà"
                  formula={d?.recoveryMatches ? `${shortVND(calc.capex)} ÷ ${months} tháng` : undefined}
                  value={formatVND(calc.monthlyRecovery)}
                  tone="accent"
                />
                <Line
                  label="Chi phí vận hành mỗi tháng"
                  hint="Số bạn nhập ở ô ②"
                  value={formatVND(calc.oOperation ?? 0)}
                />
                <Line
                  label="Chi phí nền mỗi tháng"
                  hint="Không thu đủ mức này là lỗ"
                  formula={d?.opexMatches ? `${shortVND(calc.monthlyRecovery)} + ${shortVND(calc.oOperation ?? 0)}` : undefined}
                  value={formatVND(calc.fixedOpex)}
                  tone="total"
                />
                <Divider />
                <Line
                  label="Lãi muốn thu mỗi tháng"
                  hint={mode === 'REVERSE' ? `Quy từ ROI ${calc.roiExpected}%/năm trên tổng vốn` : 'Số bạn nhập ở ô ①'}
                  formula={mode === 'REVERSE' && calc.roiExpected
                    ? `${shortVND(calc.capex)} × ${calc.roiExpected}% ÷ 12 tháng`
                    : undefined}
                  value={formatVND(d?.profitPerMonth ?? 0)}
                  tone="good"
                />
                {/*
                  Hiện SỐ TIỀN cộng thêm, không hiện phép chia.

                  Bản cũ để `÷ 0.80` — đó là một toán tử, không phải một con số: người đọc
                  không biết nó làm giá tăng bao nhiêu, phải tự nhẩm mới ra. Mà đây lại là
                  khoản chênh lớn thứ hai trong cả bảng, chỉ sau tiền hoàn vốn.

                  Lấy hiệu của kết quả cuối trừ đi phần trước đó nên luôn khớp với con số
                  máy chủ trả về, dù công thức bên trong có đổi.
                */}
                {(() => {
                  /*
                    Phần trăm hiện trong công thức được SUY NGƯỢC từ số tiền thật
                    (delta ÷ gốc), không lấy thẳng `vRatePct`.

                    Lý do: máy chủ đang nhân (1+v), nếu sau này đổi sang chia (1−v) thì phần
                    cộng thêm không còn đúng bằng v% của gốc nữa — v=20% sẽ thành +25%. Suy
                    ngược thì con số luôn khớp với tiền thật, không bao giờ nói sai.
                  */
                  const base = calc.fixedOpex + (d?.profitPerMonth ?? 0);
                  const delta = Math.max(0, calc.revenueTarget - base);
                  const effPct = base > 0 ? (delta / base) * 100 : 0;
                  return (
                <Line
                  formula={base > 0 ? `${shortVND(base)} × ${effPct.toFixed(effPct % 1 === 0 ? 0 : 1)}%` : undefined}
                  label={`Bù trống phòng ${d?.vRatePct ?? vRatePct}%`}
                  hint={revenueMonths > 0
                    ? `Dự phòng cho khoảng ${(revenueMonths * (d?.vRatePct ?? vRatePct) / 100).toFixed(1)} tháng phòng trống trong ${revenueMonths} tháng khai thác`
                    : 'Dự phòng cho những tháng phòng bị bỏ trống'}
                  value={`+ ${formatVND(delta)}`}
                  tone="muted"
                />
                  );
                })()}
                <Divider />
                <Line
                  label="TIỀN THUÊ CẦN ĐẠT MỖI THÁNG"
                  hint="Tổng tiền thuê tất cả các phòng, khi phòng nào cũng có khách"
                  formula={d?.targetMatches
                    ? `${shortVND(calc.fixedOpex)} + ${shortVND(d.profitPerMonth)} + ${shortVND(Math.max(0, calc.revenueTarget - calc.fixedOpex - d.profitPerMonth))} bù trống`
                    : undefined}
                  value={formatVND(calc.revenueTarget)}
                  tone="accent"
                  size="lg"
                />
              </div>

              {/* ⚠️ CẢNH BÁO NẶNG NHẤT TRANG — gộp cả hai nguyên nhân làm mất tháng thu tiền
                  (đầu kỳ trôi vào cải tạo/chờ duyệt, cuối kỳ chừa cho bàn giao) vì hậu quả
                  giống hệt nhau: máy chủ chia vốn cho nhiều tháng hơn số tháng thật sự có
                  tiền về ⇒ giá đề xuất thiếu ⇒ hoàn không đủ vốn. */}
              {overCountedMonths > 0 && (
                <div className="rounded-xl border-2 border-rose-300 bg-rose-50 p-4">
                  <p className="flex items-center gap-2 text-sm font-black text-rose-700">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Giá đề xuất đang THIẾU — hoàn không đủ vốn
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-rose-700">
                    Máy chủ chia vốn cho <b>{months} tháng</b>, nhưng thực tế chỉ thu được tiền trong{' '}
                    <b>{revenueMonths} tháng</b>
                    {lostMonths > 0 && handoverBuffer > 0
                      ? ` (${lostMonths} tháng đã trôi vào cải tạo/chờ duyệt, ${handoverBuffer} tháng cuối chừa cho bàn giao)`
                      : lostMonths > 0
                        ? ` (${lostMonths} tháng đã trôi vào cải tạo/chờ duyệt)`
                        : ` (${handoverBuffer} tháng cuối chừa cho bàn giao & hoàn trả hiện trạng)`}.
                    Tiền thuê trả chủ vẫn tính đủ cả kỳ, nên phần vốn của {overCountedMonths} tháng dôi ra
                    không có nguồn nào hoàn.
                  </p>
                  <div className="mt-2.5 space-y-1 rounded-lg bg-white/70 p-3">
                    <Line label={`Hoàn vốn/tháng máy chủ đang tính (÷ ${months})`} value={formatVND(calc.capex / months)} />
                    <Line label={`Đáng lẽ phải là (÷ ${revenueMonths})`} value={formatVND(calc.capex / revenueMonths)} tone="bad" />
                    <Divider />
                    <Line
                      label={`Thu đủ ${revenueMonths} tháng theo giá đề xuất thì còn hụt`}
                      formula={`${shortVND(calc.capex)} − ${shortVND((calc.capex / months) * revenueMonths)}`}
                      value={formatVND(calc.capex - (calc.capex / months) * revenueMonths)}
                      tone="bad"
                      size="lg"
                    />
                  </div>
                  <p className="mt-2 text-xs font-semibold text-rose-700">
                    Nên nâng giá chốt lên tối thiểu{' '}
                    <b>{formatVND((calc.capex / revenueMonths) - (calc.capex / months))}</b>/tháng so với giá đề xuất,
                    hoặc chờ backend sửa cách đếm tháng. Đã ghi phiếu đề nghị.
                  </p>
                </div>
              )}

              {/* Máy chủ đếm khớp — nói rõ tháng đuôi đã được chừa, để không ai tưởng thiếu */}
              {overCountedMonths === 0 && realMonths - revenueMonths > 0 && (
                <Note>
                  <b>Hợp đồng dài {realMonths} tháng nhưng chỉ {revenueMonths} tháng được tính có doanh thu.</b>{' '}
                  {realMonths - revenueMonths} tháng cuối để dành làm <b>cửa sổ bàn giao</b>: cho khách dọn đi,
                  tháo nội thất, sơn sửa hoàn trả hiện trạng cho chủ nhà gốc — quãng đó không có khách nào ở.
                  <span className="mt-1 block">
                    Tiền thuê trả chủ vẫn tính <b>đủ trọn gói {formatVND(calc.cRent ?? 0)}</b> cho cả {realMonths} tháng
                    trong tổng vốn, nên không tháng nào bị hụt tiền — vốn chỉ được ép hoàn xong sớm hơn.
                  </span>
                  <span className="mt-1 block">
                    Doanh thu và lãi ở bảng bên dưới đều tính theo <b>{revenueMonths} tháng</b>.
                  </span>
                </Note>
              )}

              {d && !(d.capexMatches && d.recoveryMatches && d.opexMatches && d.targetMatches) && (
                <Note>
                  Một vài phép tính không hiện được vì máy chủ dùng công thức khác với công thức
                  giao diện đang biết. Các con số phía trên vẫn là số máy chủ trả về và dùng để chốt giá.
                </Note>
              )}
            </div>
          )}
        </Panel>
      </div>

      {/* ── 5. Chốt giá ─────────────────────────────────────────────────────── */}
      {calc && (
        <div className="mb-5">
          <Panel
            title={isRoomScope ? `Chốt giá thuê từng phòng (${calc.roomResults?.length ?? 0} phòng)` : 'Chốt giá thuê cả căn'}
            icon={Banknote}
            subtitle={isRoomScope
              ? 'Mỗi phòng một dòng, cùng loại số thẳng cột để so sánh. Bấm tên phòng để xem phòng đó gánh bao nhiêu vốn.'
              : 'Giá đề xuất đã bao gồm lãi mục tiêu. Bạn có thể sửa, hệ thống sẽ cảnh báo nếu xuống dưới mức hoà vốn.'}
          >
            {isRoomScope && calc.roomResults && calc.roomResults.length > 0 ? (
              <>
                {/* Diện tích phòng vô lý → phân bổ vốn theo trọng số cũng sai theo.
                    Nguyên nhân đã biết: import Excel đọc số thập phân sai (29,6 → 296),
                    xem doc-be/BE-BUG-import-excel-so-thap-phan-nhan-10-2026-08-19.md */}
                {roomAreaIssue && (
                  <div className="mb-3">
                    <Note tone="rose">
                      <b>Diện tích phòng trong dữ liệu không hợp lý.</b> Tổng diện tích{' '}
                      {calc.roomResults.length} phòng là <b>{roomAreaIssue.sum} m²</b> trong khi cả căn chỉ có{' '}
                      <b>{roomAreaIssue.propertyArea} m²</b>. Nhiều khả năng số thập phân bị nhân 10 lúc import
                      (vd 29,6 m² thành 296 m²).
                      <span className="mt-1 block">
                        Giá thuê từng phòng được chia theo <b>trọng số diện tích</b>, nên nếu các phòng không
                        bằng nhau thì phần chia vốn bên dưới đang sai. Nên sửa lại diện tích phòng rồi tính giá
                        lại trước khi chốt. Đã ghi phiếu đề nghị backend sửa cách đọc file.
                      </span>
                    </Note>
                  </div>
                )}
                <RoomPriceTable
                  calc={calc}
                  rooms={calc.roomResults}
                  prices={roomPrices}
                  onChange={setRoomPrices}
                  readOnly={!canEdit}
                  revenueMonths={revenueMonths}
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Tổng tiền thuê các phòng / tháng</p>
                    <p className="mt-0.5 text-xs text-slate-400">Mục tiêu cần đạt: {formatVND(calc.revenueTarget)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-black tabular-nums ${totalMonthly >= calc.revenueTarget ? 'text-emerald-700' : 'text-amber-600'}`}>
                      {formatVND(totalMonthly)}
                    </p>
                    <p className={`text-xs font-bold ${totalMonthly >= calc.revenueTarget ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {totalMonthly >= calc.revenueTarget
                        ? `Vượt mục tiêu ${formatVND(totalMonthly - calc.revenueTarget)}`
                        : `Còn thiếu ${formatVND(calc.revenueTarget - totalMonthly)}`}
                    </p>
                  </div>
                </div>
              </>
            ) : !isRoomScope && calc.wholeHouseResult ? (() => {
              const wh = calc.wholeHouseResult!;
              const below = wholeFinal > 0 && wholeFinal < wh.roomFloor;
              const diff = wholeFinal - Math.round(wh.suggestedPriceWithProfit);
              return (
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <BigStat label="Giá đề xuất (đã có lãi)" value={formatVND(wh.suggestedPriceWithProfit)} tone="indigo" sub="/tháng" />
                    </div>
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-slate-700">Giá cho thuê áp dụng / tháng</span>
                      <MoneyInput value={wholePrice} onChange={setWholePrice} invalid={below} disabled={!canEdit} />
                      {canEdit && (
                        <div className="mt-1.5 flex items-center justify-between">
                          <button type="button" onClick={() => setWholePrice(Math.round(wh.suggestedPriceWithProfit))}
                            className="text-xs font-semibold text-indigo-600 hover:underline">Lấy giá đề xuất</button>
                          <button type="button"
                            onClick={() => setWholePrice(Math.ceil((wholeFinal || wh.suggestedPriceWithProfit) / 100_000) * 100_000)}
                            className="text-xs font-semibold text-slate-500 hover:underline">↑ Làm tròn 100k</button>
                        </div>
                      )}
                      {wholeFinal > 0 && diff !== 0 && (
                        <p className={`mt-1 text-xs font-bold ${diff > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {diff > 0 ? '+' : '−'}{formatVND(Math.abs(diff))} so với giá đề xuất
                        </p>
                      )}
                      {below && (
                        <Note tone="rose">
                          Giá đang thấp hơn mức hoà vốn {formatVND(wh.roomFloor)} — cho thuê ở mức này sẽ
                          không thu hồi đủ vốn trong {months} tháng hợp đồng.
                        </Note>
                      )}
                    </label>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                    <p className="mb-1 text-xs font-black uppercase tracking-wide text-slate-500">
                      Nếu chốt giá này, cả kỳ {revenueMonths} tháng
                    </p>
                    <Line label="Tổng tiền thu được"
                      hint={realMonths > revenueMonths ? `Chỉ ${revenueMonths}/${realMonths} tháng có khách` : undefined}
                      formula={wholeFinal > 0 ? `${shortVND(wholeFinal)} × ${revenueMonths} tháng` : undefined}
                      value={wholeFinal > 0 ? formatVND(wholeFinal * revenueMonths) : '—'} />
                    <Line label="Trừ tổng vốn đầu tư" value={`− ${formatVND(calc.capex)}`} />
                    <Divider />
                    <Line label="Lãi dự kiến cả kỳ" tone={totalProfit >= 0 ? 'good' : 'bad'} size="lg"
                      hint={calc.capex > 0 ? `Tương đương ${Math.round((totalProfit / calc.capex) * 100)}% trên vốn` : undefined}
                      value={wholeFinal > 0 ? `${totalProfit < 0 ? '− ' : ''}${formatVND(Math.abs(totalProfit))}` : '—'} />
                    <Divider />
                    <Line label="Lãi bình quân mỗi tháng" tone="good"
                      formula={wholeFinal > 0 ? `${shortVND(totalProfit)} ÷ ${revenueMonths} tháng` : undefined}
                      value={wholeFinal > 0 && revenueMonths > 0 ? formatVND(totalProfit / revenueMonths) : '—'} />
                  </div>
                </div>
              );
            })() : (
              <Note tone="amber">
                Máy chủ chưa trả về kết quả giá cho loại hình này. Thử bấm &quot;Tính lại giá thuê&quot;.
              </Note>
            )}
          </Panel>
        </div>
      )}

      {/* ── 5b. Lãi lỗ thật của cả kỳ ────────────────────────────────────────
          Đặt sau phần chốt giá vì nó là HỆ QUẢ của giá vừa chốt. Đây là bảng duy nhất
          trên trang trừ đủ CẢ HAI khoản: vốn đầu tư và chi phí vận hành. */}
      {calc && pnl && (
        <div className="mb-5">
          <Panel
            title={`Lãi lỗ thật của cả kỳ ${revenueMonths} tháng`}
            icon={PiggyBank}
            subtitle="Chi phí vận hành đã được cộng vào giá thuê nên khách trả, nhưng vẫn là tiền chi ra mỗi tháng — phải trừ khỏi lợi nhuận, không thì tính lãi hai lần."
          >
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <Line
                  label="Tổng tiền thuê thu được"
                  formula={`${shortVND(totalMonthly)} × ${revenueMonths} tháng`}
                  value={formatVND(pnl.revenue)}
                />
                <Line label="− Vốn đầu tư (thuê nhà + cải tạo + thiết bị)" value={`− ${formatVND(totalInvest)}`} />
                <Line
                  label="− Chi phí vận hành cả kỳ"
                  hint={`${formatVND(calc.oOperation ?? 0)}/tháng × ${revenueMonths} tháng`}
                  value={`− ${formatVND(pnl.opexTotal)}`}
                  tone="bad"
                />
                <Divider />
                <Line
                  label="LÃI RÒNG CẢ KỲ"
                  value={`${pnl.net < 0 ? '− ' : ''}${formatVND(Math.abs(pnl.net))}`}
                  tone={pnl.net >= 0 ? 'good' : 'bad'}
                  size="lg"
                />
                <Line
                  label="Lãi ròng bình quân mỗi tháng"
                  hint={d && d.profitPerMonth > 0 ? `Mục tiêu bạn đặt: ${formatVND(d.profitPerMonth)}/tháng` : undefined}
                  formula={`${shortVND(pnl.net)} ÷ ${revenueMonths} tháng`}
                  value={`${pnl.perMonth < 0 ? '− ' : ''}${formatVND(Math.abs(pnl.perMonth))}`}
                  tone={pnl.net >= 0 ? 'good' : 'bad'}
                />
              </div>

              {/* Vì sao lãi ròng KHÁC mục tiêu — không giải thích thì con số này vô nghĩa */}
              <div>
                {surplus ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                    <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700">
                      Vì sao lãi ròng {formatVND(pnl.perMonth)}/tháng chứ không phải {formatVND(d?.profitPerMonth ?? 0)}
                    </p>
                    <div className="mt-2">
                      <Line label={`Lãi mục tiêu bạn đặt × ${revenueMonths} tháng`} value={formatVND(surplus.goal)} />
                      <Line
                        label={`Biên dự phòng trống phòng ${d?.vRatePct ?? 0}%`}
                        hint="Giá đã cộng sẵn phần bù; nếu phòng luôn kín thì phần bù này thành lãi"
                        value={`+ ${formatVND(surplus.buffer)}`}
                        tone="good"
                      />
                      {Math.abs(surplus.above) > 1000 && (
                        <Line
                          label={surplus.above > 0 ? 'Bạn chốt giá cao hơn đề xuất' : 'Bạn chốt giá thấp hơn đề xuất'}
                          hint={`${formatVND(Math.abs(totalMonthly - calc.revenueTarget))}/tháng so với doanh thu mục tiêu ${formatVND(calc.revenueTarget)}`}
                          value={`${surplus.above > 0 ? '+ ' : '− '}${formatVND(Math.abs(surplus.above))}`}
                          tone={surplus.above > 0 ? 'good' : 'bad'}
                        />
                      )}
                      <Divider />
                      <Line label="Cộng lại" value={formatVND(pnl.net)} tone="total" />
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                      Phần vượt mục tiêu chủ yếu đến từ biên dự phòng trống phòng — nó chỉ thành lãi
                      khi phòng cho thuê được liên tục. Tháng nào có phòng trống thì phần đó bị ăn mất,
                      đúng như mục đích của nó.
                    </p>
                  </div>
                ) : (
                  <Note>
                    Không tách được các nguồn tạo ra chênh lệch so với mục tiêu vì máy chủ dùng công
                    thức khác với công thức giao diện đang biết. Con số lãi ròng bên trái vẫn đúng.
                  </Note>
                )}
              </div>
            </div>
          </Panel>
        </div>
      )}

      {/* ── 5c. Kích hoạt trước ngày hợp đồng ────────────────────────────────
          Kích hoạt = nhà vào ACTIVE = quản lý đón khách được NGAY, kể cả trước ngày công ty
          thật sự có quyền quản lý căn đó. Máy chủ hiện KHÔNG chặn: `hostConfirm` chỉ kiểm tra
          trạng thái/cải tạo/đã tính giá, còn `onboardTenant` chỉ ép ngày vào ở = hôm nay chứ
          không đối chiếu với ngày hợp đồng chủ nhà. Nên rào ở đây. */}
      {leaseNotStarted && canEdit && (
        <div className="mb-5 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
          <p className="flex items-center gap-2 text-sm font-black text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Hợp đồng với chủ nhà chưa tới ngày bắt đầu
          </p>
          <p className="mt-2 text-xs leading-relaxed text-amber-800">
            Hợp đồng bắt đầu <b>{formatDate(leaseStart)}</b> — còn <b>{daysUntilLease} ngày</b> nữa.
            Duyệt giá trước thì không sao, nhưng bấm &quot;Xác nhận &amp; Kích hoạt&quot; sẽ đưa nhà
            sang trạng thái <b>Đang khai thác</b> ngay hôm nay, và quản lý vận hành có thể đón khách
            vào ở <b>trước ngày công ty có quyền quản lý căn này</b>.
          </p>
          <div className="mt-2.5 space-y-1 rounded-lg bg-white/70 p-3 text-xs text-slate-600">
            <p>• Khách dọn vào trước {formatDate(leaseStart)} là ở trên căn nhà công ty <b>chưa thuê</b> — rủi ro pháp lý nếu chủ nhà chưa bàn giao.</p>
            <p>• Tiền thuê thu của khách trong quãng đó không có hợp đồng đầu vào tương ứng để đối chiếu.</p>
            <p>• Nếu chủ nhà giao nhà trễ, công ty phải tự đền khách phần đã thu.</p>
          </div>
          <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-xs font-semibold text-amber-900">
            <input
              type="checkbox"
              checked={ackEarlyActivation}
              onChange={(e) => setAckEarlyActivation(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-amber-400 text-amber-600 focus:ring-amber-500"
            />
            <span>
              Tôi hiểu và vẫn muốn kích hoạt ngay. Sẽ dặn quản lý <b>không đón khách trước {formatDate(leaseStart)}</b>.
            </span>
          </label>
        </div>
      )}

      {/* ── 6. Thanh xác nhận dính đáy ───────────────────────────────────────
          `sticky` chứ KHÔNG `fixed`: vùng cuộn thật là <main> của HostLayout, còn `fixed`
          neo theo viewport nên thanh này từng tràn sang phủ luôn cột menu bên trái. Sticky
          bám đúng bề ngang của nội dung và tự nhả ra khi cuộn tới cuối trang. */}
      <div className="sticky bottom-0 z-30 -mx-4 mt-5 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Giá chốt / tháng</p>
              <p className="text-lg font-black tabular-nums text-slate-900">
                {totalMonthly > 0 ? formatVND(totalMonthly) : '—'}
              </p>
            </div>
            {/* Thanh đáy chỉ hiện thứ Host thật sự quyết định dựa vào: giá chốt, và LÃI RÒNG —
                lãi đã trừ cả vốn lẫn chi phí vận hành. Bản trước hiện "So với mục tiêu
                +395.450" = chênh lệch giữa giá chốt và doanh thu mục tiêu/tháng; con số đó
                vừa mơ hồ (mục tiêu gì?) vừa không phải điều Host cần biết lúc bấm Xác nhận. */}
            {calc && pnl && (
              <>
                <div className="hidden sm:block">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Lãi ròng / tháng</p>
                  <p className={`text-lg font-black tabular-nums ${pnl.perMonth >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {pnl.perMonth < 0 ? '− ' : ''}{formatVND(Math.abs(pnl.perMonth))}
                  </p>
                  {d && d.profitPerMonth > 0 && (
                    <p className="text-[11px] font-semibold text-slate-400">
                      mục tiêu {formatVND(d.profitPerMonth)}
                    </p>
                  )}
                </div>
                <div className="hidden lg:block">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    Lãi ròng cả kỳ ({revenueMonths} tháng)
                  </p>
                  <p className={`text-lg font-black tabular-nums ${pnl.net >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {pnl.net < 0 ? '− ' : ''}{formatVND(Math.abs(pnl.net))}
                  </p>
                  <p className="text-[11px] font-semibold text-slate-400">đã trừ vốn &amp; vận hành</p>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {summary.status !== 'PENDING_HOST_REVIEW' ? (
              <p className="text-xs font-semibold text-amber-600">Chỉ xác nhận được khi ở trạng thái &quot;Chờ Host duyệt&quot;</p>
            ) : leaseNotStarted && !ackEarlyActivation ? (
              <p className="text-xs font-semibold text-amber-600">
                Cần tick xác nhận ở cảnh báo phía trên — hợp đồng chủ nhà chưa tới ngày bắt đầu
              </p>
            ) : null}
            <button
              onClick={handleConfirm}
              disabled={!canConfirm || submitting}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Đang xử lý...' : (<><Send className="h-5 w-5" /> Xác nhận &amp; Kích hoạt</>)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const ModeBtn = ({
  active, onClick, icon: Icon, label, sub,
}: { active: boolean; onClick: () => void; icon: typeof Percent; label: string; sub?: string }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center gap-0.5 rounded-xl border-2 px-2 py-2.5 text-xs font-bold transition ${
      active ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
    }`}
  >
    <Icon className="h-4 w-4" /> {label}
    {sub && <span className="text-[10px] font-medium text-slate-400">{sub}</span>}
  </button>
);
