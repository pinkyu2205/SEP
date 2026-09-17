import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, Banknote, Building, CalendarDays, Calculator, CheckCircle2,
  DollarSign, Droplet, FileText, Hammer, Image as ImageIcon, Link2, MapPin,
  Package, Percent, PiggyBank, Send, SlidersHorizontal, Target, UserCog, Zap,
} from 'lucide-react';
import { propertyService } from '@/services/property.service';
/*
  Mọi phép "hôm nay" ở màn duyệt giá đều đi qua `serverNow()`.

  Trang này tính số tháng còn khai thác được để chia vốn cải tạo — sai một ngày ở mốc
  bắt đầu là lệch cả con số giá đề xuất, mà host bấm duyệt trên đúng con số đó.
*/
import { serverNow } from '@/utils/serverTime';
import {
  managerCostForProperty, managerOfZone, managerPayroll, pricingConfigService,
  propertyCountByManager, totalOpex,
  type ManagerPayroll, type PricingConfig, type PricingConfigSource, type ZoneManagerLink,
} from '@/services/pricingConfig.service';
import { zoneAssignmentService } from '@/services/zoneAssignment.service';
import type {
  OnboardingSummaryResponse,
  PropertyResponse,
  HostConfirmRequest,
  PricingMode,
  PricingCalculationResponse,
  CalculatePricingRequest,
  RenovationSession,
} from '@/types/api.types';
import { HandoverEquipmentSection } from '@/pages/admin/onboarding/HandoverEquipmentSection';
import { OperationalEquipmentPanel } from '@/pages/admin/onboarding/OperationalEquipmentPanel';
import { PropertyMap } from '@/components/PropertyMap';
import { RoomPriceTable } from './review/RoomPriceTable';
import { CapitalItemsPanel } from './review/CapitalItemsPanel';
import { capitalParts } from './review/capitalItems';
import { RepricingReview } from './review/RepricingReview';
import {
  BarStat, BigStat, Divider, ExplainFormula, Line, Note, Panel, derive, formatVND, shortVND,
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
  const candidates = [parseDate(start), serverNow()];
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
/**
 * Một dòng "nhãn — giá trị" chỉ đọc trong khối Mục tiêu.
 *
 * Cố ý KHÔNG dùng lại `Line` của pricingBreakdown: `Line` dành cho chuỗi phép tính (có cột
 * công thức, cỡ chữ theo bậc), còn đây chỉ là bảng thông số phẳng. Nhét vào nhau thì hai
 * khối cạnh nhau trông giống hệt nhau trong khi ý nghĩa khác hẳn — một bên là dữ kiện đầu
 * vào, một bên là kết quả tính.
 */
const ReadRow = ({ label, value, icon: Icon, hint, strong }: {
  label: string;
  value: string;
  icon?: React.ElementType;
  hint?: string;
  strong?: boolean;
}) => (
  <div className="flex items-baseline justify-between gap-3 py-1">
    <span className="flex items-center gap-1.5 text-xs text-slate-600">
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
      <span>
        {label}
        {hint && <span className="ml-1 text-[11px] text-slate-400">({hint})</span>}
      </span>
    </span>
    <span className={`shrink-0 tabular-nums ${
      strong ? 'text-sm font-black text-indigo-700' : 'text-xs font-bold text-slate-800'
    }`}>{value}</span>
  </div>
);

/**
 * Mã khách hàng điện / số danh bộ nước.
 *
 * Hiện IN HOA cho dễ dò trên tờ hoá đơn giấy — máy chủ lưu chữ thường sau khi chuẩn hoá
 * (bỏ dấu cách/gạch), còn khi đối chiếu thì hai bên đều chuẩn hoá nên hoa hay thường không
 * đổi kết quả.
 */
const UtilityCode = ({ icon: Icon, label, value }: {
  icon: React.ElementType;
  label: string;
  value?: string | null;
}) => (
  <div>
    <p className="flex items-center gap-1.5 text-xs text-slate-500">
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      {label}
    </p>
    {value ? (
      <p className="mt-0.5 break-all font-mono text-sm font-bold uppercase text-slate-900">{value}</p>
    ) : (
      <p className="mt-0.5 text-sm font-bold text-amber-600">Chưa khai</p>
    )}
  </div>
);

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

/**
 * `/host/review/:id` — chọn đúng màn duyệt giá.
 *
 * • Nhà mới tiếp nhận (chỉ có đợt cải tạo 1, hoặc không cải tạo) → [[OnboardingPriceReview]]: xem toàn bộ
 *   vốn, chốt giá lần đầu, kích hoạt cho thuê.
 * • Nhà đã có đợt cải tạo BỔ SUNG (đợt ≥ 2 — BE đánh số đợt bổ sung từ 2) → [[RepricingReview]]: nhà đang
 *   cho thuê, chỉ duyệt phần thay đổi; khách đang ở giữ giá hợp đồng.
 */
export const HostPropertyReview = () => {
  const { id } = useParams<{ id: string }>();
  const propertyId = Number(id);
  const [sessions, setSessions] = useState<RenovationSession[] | null>(null);

  useEffect(() => {
    let alive = true;
    setSessions(null);
    propertyService.getRenovationSessions(propertyId)
      .then((s) => { if (alive) setSessions(s ?? []); })
      // Không tra được đợt cải tạo thì rơi về màn duyệt giá gốc — màn đó vẫn dùng được cho mọi nhà.
      .catch(() => { if (alive) setSessions([]); });
    return () => { alive = false; };
  }, [propertyId]);

  if (sessions === null) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }
  if (sessions.some((s) => s.sessionNumber >= 2)) {
    return <RepricingReview key={propertyId} propertyId={propertyId} sessions={sessions} />;
  }
  return <OnboardingPriceReview key={propertyId} />;
};

const OnboardingPriceReview = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const propertyId = Number(id);

  const [summary, setSummary] = useState<OnboardingSummaryResponse | null>(null);
  const [property, setProperty] = useState<PropertyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  /**
   * Bước xác nhận cuối trước khi kích hoạt.
   *
   * Kích hoạt là hành động MỘT CHIỀU về mặt vận hành: nhà lên danh sách cho thuê, quản lý
   * khu vực nhận nhà, và từ lúc có khách vào thì giá bị khoá cho tới khi khách rời đi
   * (xem `PriceManagerPanel`). Nút cũ nằm ở thanh dính đáy trang, bấm phát là chạy luôn —
   * mà đúng lúc đó Host thường đang cuộn ở giữa trang, không nhìn thấy giá từng phòng.
   */
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [success, setSuccess] = useState(false);

  /**
   * Cách định giá mà máy chủ ĐÃ DÙNG cho kết quả đang hiện (FORWARD/REVERSE).
   *
   * Khác `cfg.mode` — cái đó là cấu hình hiện tại, còn cái này là cấu hình lúc tính. Hai
   * số có thể lệch nhau khi Host vừa đổi cấu hình mà chưa bấm tính lại, nên chuỗi giải
   * thích phép tính phải bám theo `mode` này, không bám cấu hình.
   *
   * Ba ô nhập cũ (`pDesired` / `roiExpected` / `oOperation`) đã bỏ khỏi state: trang không
   * còn cho sửa tại chỗ, và mọi chỗ hiển thị đều đọc thẳng `calc.*` của máy chủ hoặc `cfg`.
   */
  const [mode, setMode] = useState<PricingMode>('FORWARD');
  const [vRatePct, setVRatePct] = useState<number>(10);           // buffer trống phòng (%)

  /** Cấu hình duyệt giá dùng chung — nguồn duy nhất cho mọi lần tính từ nay. */
  const [cfg, setCfg] = useState<PricingConfig | null>(null);
  const [cfgSource, setCfgSource] = useState<PricingConfigSource>('default');
  /** Lương + số nhà phụ trách của từng quản lý — để lấy đúng chi phí của riêng căn này. */
  const [payroll, setPayroll] = useState<ManagerPayroll[]>([]);
  /** Bảng phân công khu vực — đường duy nhất biết ai sẽ coi căn này khi Host duyệt xong. */
  const [zoneLinks, setZoneLinks] = useState<ZoneManagerLink[]>([]);
  /** Chặn tự tính lặp: mỗi lần vào trang chỉ tự tính đúng một lần. */
  const autoCalcRef = useRef(false);
  /** Kết quả máy chủ đã lưu sẵn — chỉ dùng khi tự tính lại lúc mở trang không được. */
  const savedCalcRef = useRef<PricingCalculationResponse | null>(null);
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

        // Kết quả tính giá đã lưu (nếu có) — 404 = chưa tính, bỏ qua (interceptor không toast 404).
        // Nhà còn chờ duyệt thì KHÔNG hiện ngay: trang sẽ tự tính lại theo cấu hình (xem effect tự
        // tính bên dưới), bản lưu chỉ để dự phòng khi tính lại thất bại. Hiện trước rồi mới thay
        // thì Host kịp thấy số sai nhấp nháy một hai giây.
        try {
          const saved = await propertyService.getPricing(propertyId);
          if (summaryData.status === 'PENDING_HOST_REVIEW') savedCalcRef.current = saved;
          else applyCalc(saved);
        } catch { /* chưa có kết quả tính giá */ }
      } catch (err: any) {
        setError(err.response?.data?.message || err.message || 'Không tải được dữ liệu');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [propertyId]);

  // Cấu hình duyệt giá + bảng lương quản lý — nạp song song, không chặn trang.
  //
  // Cần cả BA nguồn:
  //   • cấu hình  → lương từng người
  //   • phân công khu vực → ai đang phụ trách khu vực của căn này
  //   • danh sách nhà → đếm mỗi người đang coi bao nhiêu căn (mẫu số chia lương)
  //
  // Quản lý của căn này tra qua KHU VỰC chứ không qua `operationManagerId`: nhà chỉ tự
  // nhận quản lý SAU khi Host duyệt giá, nên ngay lúc đang duyệt thì trường đó còn trống.
  useEffect(() => {
    let alive = true;
    Promise.all([
      pricingConfigService.load(),
      propertyService.getManagers().catch(() => [] as { id: string; fullName: string; username: string }[]),
      propertyService.getAllProperties().catch(() => null),
      zoneAssignmentService.list().catch(() => [] as ZoneManagerLink[]),
    ]).then(([{ config, source }, mgrs, page, links]) => {
      if (!alive) return;
      setCfg(config);
      setCfgSource(source);
      setZoneLinks(links);
      const count = propertyCountByManager(links, page ?? []);
      setPayroll(managerPayroll(config, mgrs, (id) => count[id] ?? 0));
    });
    return () => { alive = false; };
  }, []);

  const isRoomScope = (calc?.pricingScope ?? summary?.pricing?.pricingScope) === 'ROOM';
  const canEdit = summary?.status === 'PENDING_HOST_REVIEW';
  const wholeFinal = wholePrice === '' ? 0 : Number(wholePrice);
  // `summary.propertyName` có lúc rỗng (BE không map) → rơi về tên ở bản ghi Property,
  // không thì tiêu đề trang hiện ra cặp nháy rỗng "".
  const propertyName = summary?.propertyName?.trim() || property?.propertyName?.trim() || `Tòa nhà #${propertyId}`;

  /** Cấu hình đã đủ để tính chưa — thiếu mục tiêu lợi nhuận thì tính ra giá vô nghĩa. */
  const cfgReady = !!cfg && (cfg.mode === 'FORWARD' ? cfg.pDesired > 0 : cfg.roiExpected > 0);

  /**
   * Lương quản lý mà RIÊNG căn này phải gánh — theo người đang phụ trách KHU VỰC của nó.
   * Nhà ở Quận 1 thì lấy lương của quản lý đang giữ Quận 1, dù nhà chưa được duyệt.
   */
  const zoneLink = managerOfZone(zoneLinks, property?.zoneId);
  const ownManager = payroll.find((m) => m.managerId === zoneLink?.managerId);
  const managerCost = managerCostForProperty(payroll, zoneLinks, property?.zoneId);

  /**
   * Tính giá theo CẤU HÌNH CHUNG — không còn đọc ô nhập tại trang này nữa.
   *
   * Lương quản lý gộp vào `oOperation` trước khi gửi: máy chủ chỉ có một ô chi phí vận
   * hành, nó không biết tới khái niệm lương quản lý. Việc tách hai dòng chỉ để người đọc
   * thấy tiền đi đâu — xem `totalOpex()`.
   */
  /** @returns true nếu tính được. */
  const handleCalculate = async (): Promise<boolean> => {
    setCalcError('');
    if (!cfg) {
      setCalcError('Chưa tải được cấu hình duyệt giá. Tải lại trang hoặc mở "Cấu hình duyệt giá".');
      return false;
    }
    if (!cfgReady) {
      setCalcError(cfg.mode === 'FORWARD'
        ? 'Cấu hình chưa có tiền lãi mục tiêu. Vào "Cấu hình duyệt giá" để nhập trước.'
        : 'Cấu hình chưa có tỷ lệ sinh lời mục tiêu. Vào "Cấu hình duyệt giá" để nhập trước.');
      return false;
    }
    const req: CalculatePricingRequest = {
      mode: cfg.mode,
      oOperation: totalOpex(cfg, managerCost),
      vRate: cfg.vRatePct / 100,
      handoverBufferMonths: cfg.handoverBufferMonths,
      ...(cfg.mode === 'FORWARD' ? { pDesired: cfg.pDesired } : { roiExpected: cfg.roiExpected }),
    };
    setCalculating(true);
    try {
      const data = await propertyService.calculatePricing(propertyId, req);
      applyCalc(data);
      return true;
    } catch (err: any) {
      const raw = err.response?.data?.message || err.response?.data?.error || err.message || '';
      // BE đang lỗi deserialize DTO (thiếu @NoArgsConstructor) — xem doc/BE-pricing-calculate-jackson-noargs.md
      const isDtoBug = /Type definition error|CalculateDepreciationRequest|no Creators|default constructor/i.test(raw);
      setCalcError(
        isDtoBug
          ? 'Máy chủ chưa nhận được yêu cầu tính giá (lỗi cấu hình DTO phía Backend). Đã báo team BE khắc phục — vui lòng thử lại sau.'
          : raw || 'Không tính được giá',
      );
      return false;
    } finally {
      setCalculating(false);
    }
  };

  /**
   * TỰ TÍNH MỖI LẦN MỞ TRANG — Host không phải bấm "Tính lại theo cấu hình" nữa.
   *
   * Bản trước chỉ tự tính khi máy chủ CHƯA lưu kết quả nào. Nhưng lúc admin bấm gửi Host,
   * `submitToHost` bên BE đã tự tính một lần bằng thông số MẶC ĐỊNH và lưu lại — nên nhà nào mở
   * ra cũng "đã có kết quả", điều kiện tự tính không bao giờ đúng, Host luôn phải bấm nút. Kết
   * quả lưu sẵn đó còn sai: không theo cấu hình duyệt giá, và `GET /pricing` không trả bảng khoản
   * vốn nên tiền bỏ ra bị tính = 0 (ca thật 16/09/2026: thanh đáy báo lãi 279 triệu, tính lại mới
   * ra 81 triệu).
   *
   * Tính lại không làm mất quyết định nào của Host: giá Host chốt chỉ được lưu khi bấm
   * "Xác nhận & Kích hoạt"; trước đó kết quả tính chỉ là bản nháp của máy chủ. Nhà không còn chờ
   * duyệt thì không tính (hiện đúng bản đã lưu). Tính lỗi hoặc cấu hình chưa đủ thì mới lùi về bản
   * lưu sẵn, kèm thông báo lỗi.
   */
  useEffect(() => {
    if (autoCalcRef.current) return;
    if (!summary || !canEdit || !cfg) return;   // chờ tải xong hồ sơ + cấu hình
    autoCalcRef.current = true;
    handleCalculate().then((ok) => {
      if (!ok && savedCalcRef.current) applyCalc(savedCalcRef.current);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, canEdit, cfg]);

  /**
   * Hợp đồng với chủ nhà chưa tới ngày bắt đầu — công ty CHƯA có quyền quản lý căn này.
   * Tính sớm ở đây (trước các early-return) vì `canConfirm` cần tới.
   */
  const leaseStart = summary?.inboundContract?.startDate;
  const leaseNotStarted = (() => {
    if (!leaseStart) return false;
    const s = parseDate(leaseStart);
    if (isNaN(s.getTime())) return false;
    const today = serverNow();
    today.setHours(0, 0, 0, 0);
    return s > today;
  })();
  const daysUntilLease = leaseNotStarted && leaseStart
    ? Math.round((parseDate(leaseStart).getTime() - serverNow().setHours(0, 0, 0, 0)) / 86_400_000)
    : 0;

  /**
   * CHẶN CỨNG khi khu vực chưa có quản lý — không phải cảnh báo cho có.
   *
   * Duyệt lúc này thì giá chốt với lương quản lý = 0 và **đóng băng vĩnh viễn**: gán quản
   * lý sau không làm hệ thống tính lại, căn đó gánh thiếu chi phí suốt cả kỳ hợp đồng. Với
   * lương 15tr chia 5 nhà, HĐ 22 tháng thì đó là ~66 triệu không bao giờ thu được.
   *
   * Đây là loại sai KHÔNG sửa lại được, nên không để Host tự chịu trách nhiệm bằng một
   * dòng cảnh báo. Đường lùi vẫn còn và rất ngắn: đi gán khu vực (một thao tác) rồi quay
   * lại — nút tự mở.
   *
   * ⚠️ BE vẫn chấp nhận duyệt khi thiếu quản lý (nhà rơi vào `PENDING_OPERATION_MANAGER`).
   * Chặn ở đây là quyết định của FE, cố ý hẹp hơn BE.
   */
  const zoneHasManager = !!zoneLink;

  /**
   * LƯỚI AN TOÀN cho hai lỗi BE đã biết (doc-be/BE-NGHIEMTHU-LAN2-...-2026-09-14.md), cả hai đều
   * ra một con số giá trông bình thường nhưng sai, Host bấm duyệt là đóng băng luôn:
   *
   *   • Bảng khoản vốn không có tiền thuê chủ nhà — nhà duyệt giá trước 14/09/2026 chưa có khoản
   *     vốn phiên bản 1, đợt cải tạo bổ sung chỉ còn khoản mới. Hoàn vốn/tháng rơi từ ~3,6tr xuống
   *     vài chục nghìn một phòng.
   *   • Một phòng xuất hiện hai lần — BE không đánh dấu phiên bản giá cũ, trả cả bảng cũ lẫn mới.
   *
   * Chặn cứng như khi thiếu quản lý khu vực: đây là loại sai không sửa lại được sau khi duyệt.
   * BE sửa xong thì hai điều kiện này tự thành false, không cần gỡ.
   */
  const capitalMissingRent = !!calc?.capitalItems?.length
    && !calc.capitalItems.some((i) => i.kind === 'RENT');
  /**
   * Mọi hạng mục cải tạo của nhà (mọi đợt) phải nằm trong bảng khoản vốn đúng một lần. Lệch nghĩa là
   * BE bỏ sót hoặc tính trùng — ca đã gặp: BE dựng bù khoản vốn cho nhà cũ nhưng bỏ qua các dòng đã gắn
   * đợt 1, nên thiếu toàn bộ cải tạo (và thiết bị) lúc tiếp nhận nhà. `totalRenovationCost` của
   * onboarding summary là tổng mọi dòng cải tạo của nhà.
   */
  const renovationInItems = (calc?.capitalItems ?? [])
    .filter((i) => i.kind === 'RENOVATION')
    .reduce((s, i) => s + i.amount, 0);
  const capitalRenovationMismatch = !!calc?.capitalItems?.length && !!summary
    && Math.abs(renovationInItems - (summary.totalRenovationCost ?? 0)) > 1;
  const duplicatedRooms = (() => {
    const ids = (calc?.roomResults ?? []).map((r) => r.roomId);
    return ids.length !== new Set(ids).size;
  })();
  const pricingDataBroken = capitalMissingRent || capitalRenovationMismatch || duplicatedRooms;

  const canConfirm =
    canEdit &&
    !!calc &&
    !pricingDataBroken &&
    zoneHasManager &&
    // Kích hoạt sớm hơn ngày hợp đồng thì phải tick xác nhận đã đọc cảnh báo.
    (!leaseNotStarted || ackEarlyActivation) &&
    (isRoomScope
      ? (calc.roomResults || []).length > 0 && (calc.roomResults || []).every((r) => (roomPrices[r.roomId] || 0) > 0)
      : wholeFinal > 0);

  const handleConfirm = async () => {
    if (!canConfirm || !summary || !calc) return;
    setConfirmOpen(false);

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

  const today = serverNow();
  /**
   * Tổng theo loại cộng từ bảng khoản vốn (BE 14/09/2026). Có bảng thì mọi chỗ đọc từ đây:
   * BE trả `cRent/cRenovation/cEquipment` = 0 khi có `capitalItems`, đọc thẳng là hiện
   * "Tiền thuê trả chủ nhà 0 đ".
   */
  const parts = calc?.capitalItems?.length ? capitalParts(calc.capitalItems, today) : null;
  const d = calc ? derive(calc, parts) : null;
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
   * Vì sao mất bấy nhiêu tháng — bằng NGÀY cụ thể, không chỉ một con số.
   *
   * Câu hỏi thật từ Host (17/09/2026): HĐ chủ nhà bắt đầu 15/09, cho thuê được từ 17/09 — chỉ
   * trễ 2 ngày mà màn hình ghi "−1 tháng". Đúng, vì BE đếm bằng `ChronoUnit.MONTHS.between`:
   * chỉ tính THÁNG TRÒN. Từ 17/09/2026 tới hết HĐ là 23 tháng + 29 ngày lẻ → bỏ 29 ngày lẻ →
   * 23 tháng, so với 24 tháng của cả HĐ là mất 1. Không nói ra thì trông như máy chủ trừ bừa.
   *
   * Ngày cho thuê được = muộn nhất trong (ngày HĐ bắt đầu, ngày cải tạo xong, hôm nay) — xem
   * `InboundLeaseRules.rentableFrom`. Đoán lại lý do bằng cách so ngày để nói cho Host hiểu.
   */
  const lostExplain = (() => {
    if (lostMonths <= 0 || !inbound?.startDate || !inbound?.endDate || !calc?.rentableFrom) return null;
    const DAY = 86_400_000;
    const addMonthsClamped = (d: Date, n: number) => {
      // Giống LocalDate.plusMonths của Java: 31/01 + 1 tháng = 28/02, không tràn sang 03/03.
      const r = new Date(d.getFullYear(), d.getMonth() + n, 1);
      const lastDay = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
      r.setDate(Math.min(d.getDate(), lastDay));
      return r;
    };
    const start = parseDate(inbound.startDate);
    const from = parseDate(calc.rentableFrom);
    const endExclusive = parseDate(inbound.endDate);
    endExclusive.setDate(endExclusive.getDate() + 1); // HĐ tính trọn ngày kết thúc
    const lateDays = Math.round((from.getTime() - start.getTime()) / DAY);
    const leftoverDays = Math.max(0, Math.round((endExclusive.getTime() - addMonthsClamped(from, rentableMonths).getTime()) / DAY));

    const today = serverNow();
    today.setHours(0, 0, 0, 0);
    const same = (a?: string, b?: Date) => !!a && !!b && parseDate(a).getTime() === b.getTime();
    const reason = same(summary.renovationEndDate, from)
      ? 'ngày cải tạo xong'
      : from.getTime() === today.getTime()
        ? 'hôm nay — ngày tính giá; nhà chưa được duyệt nên trước hôm nay chưa thu được tiền'
        : 'ngày sớm nhất nhà nhận khách được';
    return { lateDays, leftoverDays, reason };
  })();

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
    const today = serverNow();
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
  /**
   * Vốn phải lấy lại trong `revenueMonths` tháng tới. Có bảng khoản vốn thì là phần CÒN LẠI của
   * từng khoản: sau đợt cải tạo bổ sung, khoản của đợt trước đã lấy lại được một phần — trừ cả
   * `capex` (tổng gốc) khỏi doanh thu của những tháng còn lại là tính lỗ sai.
   */
  const totalInvest = parts
    ? parts.remaining
    : isRoomScope
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
    // Dự phòng sửa chữa sau bảo hành cũng đã cộng vào giá — là tiền để dành cho sửa chữa,
    // không phải lãi, nên trừ ra như chi phí vận hành.
    const reserveTotal = (calc.repairReservePerMonth ?? 0) * revenueMonths;
    const net = revenue - totalInvest - opexTotal - reserveTotal;
    return {
      revenue,
      opexTotal,
      reserveTotal,
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
    const target = calc.revenueTarget;
    // Không còn số hạng "tháng đuôi dư ra": doanh thu đã chốt ở min(còn lại, số tháng chia
    // vốn) nên tháng đuôi không bao giờ được tính là tháng có tiền về.
    const parts = {
      goal: d.profitPerMonth * revenueMonths,
      /*
        Phần bù trống phòng = HIỆU lấy từ số máy chủ trả (doanh thu mục tiêu − thu tối thiểu
        − lãi mục tiêu), KHÔNG tự nhân lại vRate.

        Bản cũ tính `(hoàn vốn + vận hành + dự phòng + lãi) × vRate` vì tưởng máy chủ nhân
        (1 + v). Thực tế `PricingCalculator.applyVacancyBuffer` CHIA cho (1 − v): v = 10%
        làm giá tăng 11,1%, nên số này hụt ~5 triệu, tổng ba nguồn không khớp lãi ròng, và cả
        khối "Vì sao lãi ròng ... chứ không phải ..." biến mất — thay bằng câu "không tách
        được nguồn chênh lệch". Lấy hiệu thì luôn khớp, kể cả khi BE đổi công thức lần nữa.
      */
      buffer: Math.max(0, target - calc.fixedOpex - d.profitPerMonth) * revenueMonths,
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
          Xem toàn bộ tiền đã bỏ ra cho <span className="font-bold text-slate-700">{propertyName}</span>, đặt mục tiêu lãi, rồi chốt giá cho thuê.
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

      {pricingDataBroken && (
        <div className="mb-6 rounded-2xl border-2 border-rose-300 bg-rose-50 p-5">
          <p className="flex items-center gap-2 text-sm font-black text-rose-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Kết quả tính giá của máy chủ đang sai — chưa duyệt được căn này
          </p>
          <div className="mt-2 space-y-1.5 text-xs leading-relaxed text-rose-700">
            {capitalMissingRent && (
              <p>
                • Bảng khoản vốn <b>không có tiền thuê trả chủ nhà</b>, chỉ còn các khoản của đợt cải tạo mới. Giá gợi ý
                vì vậy thấp hơn thực tế rất nhiều — duyệt theo giá này là cho thuê lỗ suốt phần còn lại của hợp đồng.
              </p>
            )}
            {capitalRenovationMismatch && (
              <p>
                • Chi phí cải tạo trong bảng khoản vốn là <b>{formatVND(renovationInItems)}</b>, nhưng các hạng mục cải tạo
                của căn này cộng lại là <b>{formatVND(summary.totalRenovationCost ?? 0)}</b>. Máy chủ đang bỏ sót (hoặc tính
                trùng) một phần vốn nên giá gợi ý không đúng.
              </p>
            )}
            {duplicatedRooms && (
              <p>
                • Một số phòng xuất hiện <b>hai lần</b> trong kết quả (máy chủ trả cả bảng giá cũ lẫn mới), nên không biết
                dòng nào là giá đúng.
              </p>
            )}
            <p>Đã báo team BE. Sau khi BE sửa, bấm &quot;Tính lại theo cấu hình&quot; — nút Xác nhận sẽ tự mở.</p>
          </div>
        </div>
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
          {/*
            Mã KH điện / số danh bộ nước — không dính gì tới giá, nhưng đây là màn KÍCH HOẠT:
            bấm xong là nhà bắt đầu chạy thật, và mỗi tháng admin nhập hoá đơn điện/nước theo lô
            sẽ khớp nhà theo đúng hai mã này. Thiếu mã thì hoá đơn không tự đối chiếu được, mà
            lúc đó nhà đã có khách — sửa muộn hơn nhiều so với chặn lại ở đây.
            Host không tự khai được hai mã này (admin khai ở Cấu hình khai thác) nên chỉ hiện
            để đối chiếu, và chỉ cảnh báo khi thiếu.
          */}
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-sm">
            <UtilityCode
              icon={Zap}
              label="Mã KH điện"
              value={property?.electricityCustomerCode}
            />
            <UtilityCode
              icon={Droplet}
              label="Số danh bộ nước"
              value={property?.waterCustomerCode}
            />
          </div>
          {(!property?.electricityCustomerCode || !property?.waterCustomerCode) && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Nhà chưa khai đủ mã — hoá đơn {!property?.electricityCustomerCode ? 'điện' : ''}
                {!property?.electricityCustomerCode && !property?.waterCustomerCode ? ' và ' : ''}
                {!property?.waterCustomerCode ? 'nước' : ''} sau này sẽ không tự đối chiếu được với
                nhà này. Kích hoạt vẫn được, nhưng nên báo admin bổ sung ở <b>Cấu hình khai thác</b>.
              </span>
            </p>
          )}

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
          title="Tiền đã bỏ ra cho tòa nhà này"
          icon={PiggyBank}
          subtitle="Ba khoản dưới đây cộng lại là toàn bộ tiền bạn bỏ ra cho căn này — phải thu lại đủ qua tiền thuê trước khi hết hợp đồng."
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
                    {formatVND(parts?.rent ?? calc?.cRent ?? inbound.totalRentAmount)}
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
                {formatVND(parts?.renovation ?? calc?.cRenovation ?? summary.totalRenovationCost ?? 0)}
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
                host bấm "Tính giá cho thuê", dù tổng tiền bỏ ra ngay bên dưới đã hiện.

                Hai phần kia đều có sẵn từ nguồn khác (HĐ với chủ nhà, danh sách hạng mục cải
                tạo) nên phần còn lại chính là thiết bị. Manifest thiết bị KHÔNG kèm giá nên
                không cộng trực tiếp được, phải lấy hiệu.

                Chỉ hiện khi ra số không âm — âm nghĩa là ba phần không khớp tổng, lúc đó thà
                để trống còn hơn bịa một con số trông như thật.
              */}
              {(() => {
                const eq = parts?.equipment ?? calc?.cEquipment ?? (() => {
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
                Chỉ tính thiết bị công ty <b>mua mới</b> để cho thuê. Đồ chủ nhà bàn giao được ghi nhận
                riêng và <b>không</b> tính vào tiền bỏ ra.
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
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Tổng tiền đã bỏ ra</p>
                  {d?.capexMatches && (
                    <p className="mt-0.5 font-mono text-[11px] text-slate-500">
                      {shortVND(d.capexParts.rent)} + {shortVND(d.capexParts.renovation)} + {shortVND(d.capexParts.equipment)}
                    </p>
                  )}
                </div>
                <p className="text-2xl font-black tabular-nums text-white">{formatVND(calc.capex)}</p>
              </div>
              {parts && parts.depreciated > 0 && (
                <p className="mt-1.5 border-t border-slate-700 pt-1.5 text-xs text-slate-300">
                  Đã lấy lại <b className="tabular-nums text-white">{formatVND(parts.depreciated)}</b> qua tiền thuê —
                  còn phải lấy lại <b className="tabular-nums text-white">{formatVND(parts.remaining)}</b>. Chi tiết ở bảng khoản vốn bên dưới.
                </p>
              )}
            </div>
          )}
        </Panel>
      </div>

      {/* ── 2b. Từng khoản vốn — chỉ có khi máy chủ trả bảng khoản vốn ─────────
          Đây là chỗ trả lời "sau cải tạo bổ sung giá mới ở đâu ra": khoản cũ giữ nguyên mỗi
          tháng, đợt mới chỉ cộng thêm. Kèm dự phòng bảo hành và phần công ty tự chịu. */}
      {calc && parts && (
        <div className="mb-5">
          <CapitalItemsPanel
            calc={calc}
            today={today}
            rentLabel={inbound?.contractCode}
            roomLabel={(roomId) => {
              const r = calc.roomResults?.find((x) => x.roomId === roomId);
              return r?.roomNumber ? `Phòng ${r.roomNumber}` : null;
            }}
          />
        </div>
      )}

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
        {/* Mục tiêu — CHỈ ĐỌC, lấy từ cấu hình chung.
            Trước đây Host phải gõ lại 4 con số ở TỪNG căn. Nhập tay lặp lại trên hàng chục
            căn thì kiểu gì cũng lệch, mà lệch ở đây nghĩa là hai căn giống hệt nhau ra hai
            mức giá khác nhau — không giải thích được với ai. Nay chốt một lần ở
            /host/pricing-config, màn này chỉ hiện lại để Host đối chiếu rồi duyệt. */}
        <Panel title="Mục tiêu của bạn" icon={Target} tone="accent"
          subtitle="Lấy từ Cấu hình duyệt giá — áp dụng cho mọi căn nhà. Muốn đổi thì sửa ở đó, không sửa riêng từng căn.">
          <div className="space-y-3">
            {!cfg ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400">
                Đang tải cấu hình…
              </p>
            ) : (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <ReadRow
                    label="Cách tính giá"
                    value={cfg.mode === 'FORWARD' ? 'Theo tiền lãi' : 'Theo % lời mỗi năm'}
                    icon={cfg.mode === 'FORWARD' ? DollarSign : Percent}
                  />
                  <ReadRow
                    label={cfg.mode === 'FORWARD' ? 'Lãi muốn thu mỗi tháng' : 'Muốn lời bao nhiêu % mỗi năm'}
                    value={cfg.mode === 'FORWARD' ? formatVND(cfg.pDesired) : `${cfg.roiExpected}%`}
                    strong
                  />
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <ReadRow label="Chi phí vận hành khác" value={formatVND(cfg.oOperation)} />
                  {/* Nói rõ lương của AI và vì sao là người đó: cùng một con số nhưng
                      "quản lý Quận 1 chia 5 nhà" và "bình quân toàn hệ thống" là hai mức
                      độ tin cậy khác hẳn nhau. */}
                  <ReadRow
                    label={ownManager && ownManager.salary > 0
                      ? `Lương QL — ${ownManager.fullName}`
                      : 'Lương QL (bình quân)'}
                    value={formatVND(managerCost)}
                    icon={UserCog}
                    hint={ownManager && ownManager.salary > 0 && ownManager.propertyCount > 0
                      ? `${property?.zoneName ?? 'khu vực'} · ${formatVND(ownManager.salary)} ÷ ${ownManager.propertyCount} nhà đang phụ trách`
                      : zoneLink
                        ? `${zoneLink.managerFullName} phụ trách khu vực nhưng chưa nhập lương`
                        : `${property?.zoneName ?? 'Khu vực'} chưa có quản lý phụ trách`}
                  />
                  <div className="mt-2 border-t border-dashed border-slate-200 pt-2">
                    <ReadRow label="Tổng chi phí mỗi tháng" value={formatVND(totalOpex(cfg, managerCost))} strong />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  {/* Nhắc luôn mốc + ân hạn: Host đọc màn này ngay trước khi chốt giá, đó là
                      lúc cần biết mình đang cam kết điều gì với khách. */}
                  <ReadRow
                    label="Tăng giá thuê mỗi năm"
                    value={cfg.annualIncreasePct > 0 ? `+${cfg.annualIncreasePct}%` : 'Không tăng'}
                    hint={cfg.annualIncreasePct > 0
                      ? `vào 01/01 · ân hạn ${cfg.escalationGraceMonths} tháng đầu`
                      : undefined}
                  />
                  <ReadRow label="Cộng thêm phòng trống" value={`${cfg.vRatePct}%`} />
                  <ReadRow
                    label="Trừ tháng trả nhà"
                    value={`−${handoverBuffer} tháng`}
                    /* Lệch với cấu hình = chốt chặn hợp đồng ngắn đã can thiệp, KHÔNG phải
                       máy chủ bỏ qua lựa chọn của Host. Nói đúng lý do, đừng để Host đi sửa
                       cấu hình một cách vô ích. */
                    hint={cfg.handoverBufferMonths !== handoverBuffer
                      ? `Cấu hình −${cfg.handoverBufferMonths}, nhưng HĐ này còn dưới 6 tháng khai thác nên không trừ`
                      : undefined}
                  />
                </div>

                {/* ── Khu vực chưa có quản lý → CẢNH BÁO TRƯỚC KHI DUYỆT ─────────
                    Hai hậu quả, và cái thứ nhất không sửa lại được:

                    1. Giá chốt ở đây KHÔNG gồm lương quản lý (đang tính 0 đ). Duyệt xong
                       giá đóng băng — gán quản lý sau KHÔNG làm hệ thống tính lại. Nghĩa là
                       căn này gánh thiếu chi phí suốt cả kỳ hợp đồng.
                    2. `hostConfirm` (BE) chỉ đặt nhà thành ACTIVE khi tra được quản lý của
                       khu vực; không có thì nhà rơi vào PENDING_OPERATION_MANAGER — chưa cho
                       thuê được.

                    Đặt ngay trên nút bấm, không nhét vào dòng hint xám nhỏ ở trên. */}
                {!zoneHasManager && canEdit && (
                  <div className="flex gap-2.5 rounded-xl border border-rose-300 bg-rose-50 p-3">
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                    <div className="text-xs leading-relaxed text-rose-900">
                      <p className="font-bold">
                        Phải gán quản lý cho {property?.zoneName ?? 'khu vực này'} trước khi duyệt giá.
                      </p>
                      <p className="mt-0.5">
                        Giá đang tính với lương quản lý <b>0 đ</b>. Duyệt xong giá <b>đóng băng vĩnh
                        viễn</b> — gán quản lý sau không tính lại được, căn này gánh thiếu chi phí suốt
                        cả kỳ hợp đồng.
                      </p>
                      <button
                        type="button"
                        onClick={() => navigate('/host/zones')}
                        className="mt-1.5 font-bold text-rose-800 underline hover:text-rose-950"
                      >
                        Đi gán quản lý khu vực →
                      </button>
                    </div>
                  </div>
                )}

                {/* Cấu hình chỉ nằm trên máy này — nói thẳng, đừng để Host tưởng đã lưu chung. */}
                {cfgSource !== 'server' && (
                  <Note tone="amber">
                    {cfgSource === 'default'
                      ? 'Chưa ai đặt cấu hình duyệt giá — đang dùng giá trị mặc định.'
                      : 'Cấu hình này chỉ đang lưu trên trình duyệt của máy bạn, chưa lên máy chủ.'}
                  </Note>
                )}

                <button
                  type="button"
                  onClick={() => navigate('/host/pricing-config')}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-indigo-200 bg-white px-4 py-2.5 text-sm font-bold text-indigo-700 transition hover:border-indigo-400 hover:bg-indigo-50"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Sửa cấu hình duyệt giá
                </button>

                {/* Bình thường trang tự tính xong rồi. Nút này để tính lại sau khi vừa đổi
                    cấu hình — và là đường thoát khi lần tự tính đầu tiên bị lỗi mạng. */}
                <button
                  type="button"
                  onClick={handleCalculate}
                  disabled={calculating || !canEdit || !cfgReady}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Calculator className="h-4 w-4" />
                  {calculating ? 'Đang tính...' : calc ? 'Tính lại theo cấu hình' : 'Tính giá cho thuê'}
                </button>
                {calcError && <Note tone="rose">{calcError}</Note>}
              </>
            )}
          </div>
        </Panel>

        {/* Chuỗi tính */}
        <Panel title="Từ tiền bỏ ra tới giá thuê — từng bước" icon={Calculator}
          subtitle={calc ? 'Mỗi dòng là một bước tính, dùng đúng con số của dòng phía trên.' : undefined}>
          {!calc ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 p-6 text-center">
              {calculating || (canEdit && !cfg) ? (
                <>
                  <div className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-500" />
                  <p className="text-sm font-semibold text-slate-500">Đang tính giá theo cấu hình duyệt giá…</p>
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
                    Mở trang là tự tính, không cần bấm nút. Vài giây là xong.
                  </p>
                </>
              ) : (
                <>
                  <Calculator className="mb-3 h-8 w-8 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-500">Chưa có kết quả tính</p>
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
                    {calcError
                      ? <>Không tự tính được: {calcError}</>
                      : <>Bấm <b>&quot;Tính lại theo cấu hình&quot;</b> để tính giá theo cấu hình duyệt giá hiện tại.</>}
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <BigStat label="Tổng tiền bỏ ra" value={formatVND(calc.capex)} sub={`Lấy lại trong ${months} tháng`} />
                <BigStat label="Cần thu mỗi tháng" value={formatVND(calc.revenueTarget)} tone="indigo"
                  sub={`Khi phòng nào cũng có khách`} />
                <BigStat label="Lãi muốn thu / tháng" value={formatVND(d?.profitPerMonth ?? 0)} tone="emerald"
                  sub={mode === 'REVERSE' && calc.roiExpected ? `Từ ROI ${calc.roiExpected}%/năm` : 'Bạn tự đặt'} />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <Line
                  label="Tổng tiền đã bỏ ra"
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
                    label="Đã trôi mất trước khi cho thuê được"
                    formula={lostExplain && inbound?.startDate && inbound?.endDate && calc.rentableFrom ? (
                      <>
                        <span className="block">HĐ chủ nhà      {formatDate(inbound.startDate)} → {formatDate(inbound.endDate)} = {realMonths} tháng tròn</span>
                        <span className="block">Cho thuê được   {formatDate(calc.rentableFrom)} (trễ {lostExplain.lateDays} ngày)</span>
                        <span className="block">Còn khai thác   {formatDate(calc.rentableFrom)} → {formatDate(inbound.endDate)} = {rentableMonths} tháng tròn{lostExplain.leftoverDays > 0 ? ` + ${lostExplain.leftoverDays} ngày lẻ` : ''}</span>
                        <span className="block font-bold">Chỉ đếm tháng tròn → {realMonths} − {rentableMonths} = −{lostMonths} tháng</span>
                      </>
                    ) : undefined}
                    hint={lostExplain
                      ? `Vì sao ${formatDate(calc.rentableFrom)}: ${lostExplain.reason}. `
                        + (lostExplain.leftoverDays > 0
                          ? `Chỉ trễ ${lostExplain.lateDays} ngày nhưng mất trọn ${lostMonths} tháng, vì ${lostExplain.leftoverDays} ngày lẻ cuối kỳ không đủ một tháng nên máy chủ bỏ ra. `
                          : '')
                        + 'Vốn vẫn phải thu đủ, chỉ là chia cho ít tháng hơn — giá đề xuất nhích lên một chút, nghiêng về không lỗ.'
                      : calc.rentableFrom
                        ? `Cải tạo + chờ duyệt — chỉ cho thuê được từ ${formatDate(calc.rentableFrom)}`
                        : 'Cải tạo + chờ duyệt — vẫn trả tiền thuê chủ nhà nhưng không có doanh thu'}
                    value={`− ${lostMonths} tháng`}
                    tone="bad"
                    indent
                  />
                )}
                {handoverBuffer > 0 && (
                  <Line
                    label="Trừ mấy tháng cuối để trả nhà cho chủ"
                    hint="Khách dọn đi, tháo nội thất, sơn sửa hoàn trả hiện trạng cho chủ nhà — nhà trống, không thu được tiền"
                    value={`− ${handoverBuffer} tháng`}
                    tone="bad"
                    indent
                  />
                )}
                {/*
                  Hai con số "có tiền vào" và "dùng để chia tiền" chỉ khác nhau khi máy chủ đếm sai
                  (BE cũ chia vốn cho cả tháng không thu được tiền). BE đã sửa nên bình thường chúng
                  BẰNG NHAU — in hai dòng giống hệt chỉ làm người đọc tưởng là hai thứ khác nhau.
                  Gộp làm một; lệch thì mới tách ra kèm cảnh báo.
                */}
                {months > 0 && months !== revenueMonths ? (
                  <>
                    <Line
                      label="Số tháng THẬT SỰ CÓ TIỀN VÀO"
                      hint="Phải lấy lại đủ tiền trong đúng quãng này"
                      value={`${revenueMonths} tháng`}
                      tone="accent"
                    />
                    <Line
                      label="Số tháng máy chủ dùng để chia tiền"
                      hint={overCountedMonths > 0
                        ? `⚠ Nhiều hơn ${overCountedMonths} tháng so với số tháng có tiền vào → giá gợi ý bị thấp`
                        : `Ít hơn số tháng có tiền vào ${revenueMonths - months} tháng`}
                      value={`${months} tháng`}
                      tone="bad"
                    />
                  </>
                ) : (
                  <Line
                    label="Số tháng có tiền vào — dùng để chia vốn"
                    formula={`${realMonths} tháng HĐ${lostMonths > 0 ? ` − ${lostMonths} trôi mất` : ''}${handoverBuffer > 0 ? ` − ${handoverBuffer} trả nhà` : ''} = ${revenueMonths} tháng`}
                    hint={startInfo && !startInfo.started && lostMonths === 0
                      ? `Hợp đồng chưa tới ngày bắt đầu (còn ${startInfo.daysLeft} ngày) — chưa mất tháng nào ở đầu kỳ. Vốn và chi phí chia đều cho đúng số tháng này.`
                      : 'Chỉ những tháng thật sự có khách trả tiền. Vốn và chi phí được chia đều cho đúng số tháng này — tháng không thu được tiền thì không bắt gánh.'}
                    value={`${revenueMonths} tháng`}
                    tone="accent"
                  />
                )}
                <Divider />
                <Line
                  label="Mỗi tháng phải lấy lại"
                  hint={d?.recoveryFromItems
                    ? 'Cộng số tiền mỗi tháng của từng khoản vốn — mỗi khoản có lịch riêng, xem bảng khoản vốn'
                    : 'Thu về đều đặn bấy nhiêu thì hết hợp đồng vừa đủ huề, chưa lời'}
                  formula={d?.recoveryMatches
                    ? d.recoveryFromItems
                      ? `Σ ${calc.capitalItems?.length ?? 0} khoản`
                      : `${shortVND(calc.capex)} ÷ ${months} tháng`
                    : undefined}
                  value={formatVND(calc.monthlyRecovery)}
                  tone="accent"
                />
                <Line
                  label="Chi phí vận hành mỗi tháng"
                  hint="Chi phí khác + lương quản lý phân bổ, lấy từ Cấu hình duyệt giá"
                  value={formatVND(calc.oOperation ?? 0)}
                />
                {calc.repairReservePerMonth != null && (
                  <Line
                    label="Dự phòng sửa chữa sau bảo hành"
                    hint="Để dành cho những tháng thiết bị đã hết bảo hành — tính sẵn nên giá không phải tăng lúc hết bảo hành"
                    value={formatVND(calc.repairReservePerMonth)}
                  />
                )}
                <Line
                  label="Thu tối thiểu mỗi tháng"
                  hint="Không thu đủ mức này là lỗ"
                  formula={d?.opexMatches
                    ? d.reserve > 0
                      ? `${shortVND(calc.monthlyRecovery)} + ${shortVND(calc.oOperation ?? 0)} + ${shortVND(d.reserve)}`
                      : `${shortVND(calc.monthlyRecovery)} + ${shortVND(calc.oOperation ?? 0)}`
                    : undefined}
                  value={formatVND(calc.fixedOpex)}
                  tone="total"
                />
                <Divider />
                <Line
                  label="Tiền lời muốn bỏ túi mỗi tháng"
                  hint={mode === 'REVERSE' ? `Quy từ ${calc.roiExpected}% lời mỗi năm trên tổng tiền bỏ ra` : 'Lấy từ Cấu hình duyệt giá'}
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
                  label={`Cộng thêm cho tháng trống phòng ${d?.vRatePct ?? vRatePct}%`}
                  hint={revenueMonths > 0
                    ? `Phòng cho thuê không phải lúc nào cũng kín — cộng bù cho khoảng ${(revenueMonths * (d?.vRatePct ?? vRatePct) / 100).toFixed(1)} tháng trống trong ${revenueMonths} tháng`
                    : 'Cộng bù cho những tháng phòng bỏ trống'}
                  value={`+ ${formatVND(delta)}`}
                  tone="muted"
                />
                  );
                })()}
                <Divider />
                <Line
                  label="GIÁ THUÊ PHẢI ĐẠT MỖI THÁNG"
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
                    Giá gợi ý đang THẤP — không lấy lại đủ tiền
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-rose-700">
                    Hệ thống chia tiền cho <b>{months} tháng</b>, nhưng thực tế chỉ có tiền vào trong{' '}
                    <b>{revenueMonths} tháng</b>
                    {lostMonths > 0 && handoverBuffer > 0
                      ? ` (${lostMonths} tháng đã trôi vào cải tạo/chờ duyệt, ${handoverBuffer} tháng cuối chừa cho bàn giao)`
                      : lostMonths > 0
                        ? ` (${lostMonths} tháng đã trôi vào cải tạo/chờ duyệt)`
                        : ` (${handoverBuffer} tháng cuối chừa cho bàn giao & hoàn trả hiện trạng)`}.
                    Tiền thuê trả chủ vẫn tính đủ cả kỳ, nên phần tiền của {overCountedMonths} tháng dôi ra
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
                    Tiền thuê trả chủ vẫn tính <b>đủ trọn gói {formatVND(d?.capexParts.rent ?? calc.cRent ?? 0)}</b> cho cả {realMonths} tháng
                    trong tổng tiền bỏ ra, nên không tháng nào bị hụt — chỉ là phải lấy lại xong sớm hơn.
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
              ? 'Mỗi phòng một dòng, cùng loại số thẳng cột để so sánh. Bấm tên phòng để xem phòng đó gánh bao nhiêu tiền.'
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
                      <BigStat label="Giá gợi ý (đã tính lãi)" value={formatVND(wh.suggestedPriceWithProfit)} tone="indigo" sub="/tháng" />
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
                    <Line label="Tổng tiền thuê thu về"
                      hint={realMonths > revenueMonths ? `Chỉ ${revenueMonths}/${realMonths} tháng có khách` : undefined}
                      formula={wholeFinal > 0 ? `${shortVND(wholeFinal)} × ${revenueMonths} tháng` : undefined}
                      value={wholeFinal > 0 ? formatVND(wholeFinal * revenueMonths) : '—'} />
                    <Line label={parts && parts.depreciated > 0 ? 'Trừ vốn còn phải lấy lại' : 'Trừ tiền đã bỏ ra'}
                      value={`− ${formatVND(totalInvest)}`} />
                    <Divider />
                    <Line label="Lãi dự kiến cả kỳ" tone={totalProfit >= 0 ? 'good' : 'bad'} size="lg"
                      hint={totalInvest > 0 ? `Tương đương ${Math.round((totalProfit / totalInvest) * 100)}% trên vốn` : undefined}
                      value={wholeFinal > 0 ? `${totalProfit < 0 ? '− ' : ''}${formatVND(Math.abs(totalProfit))}` : '—'} />
                    <Divider />
                    <Line label="Lãi trung bình mỗi tháng" tone="good"
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
            subtitle="Chi phí vận hành đã cộng vào giá thuê nên khách trả, nhưng đó vẫn là tiền bạn chi ra hằng tháng — phải trừ đi, không thì tính lãi hai lần."
          >
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <Line
                  label="Tổng tiền thuê thu được"
                  formula={`${shortVND(totalMonthly)} × ${revenueMonths} tháng`}
                  value={formatVND(pnl.revenue)}
                />
                <Line
                  label={parts && parts.depreciated > 0
                    ? '− Vốn còn phải lấy lại (thuê nhà + cải tạo + thiết bị)'
                    : '− Tiền đã bỏ ra (thuê nhà + cải tạo + thiết bị)'}
                  hint={parts && parts.depreciated > 0
                    ? `Đã lấy lại ${formatVND(parts.depreciated)} trên tổng ${formatVND(parts.total)} qua tiền thuê trước đây`
                    : undefined}
                  value={`− ${formatVND(totalInvest)}`}
                />
                <Line
                  label="− Chi phí vận hành cả kỳ"
                  hint={`${formatVND(calc.oOperation ?? 0)}/tháng × ${revenueMonths} tháng`}
                  value={`− ${formatVND(pnl.opexTotal)}`}
                  tone="bad"
                />
                {pnl.reserveTotal > 0 && (
                  <Line
                    label="− Dự phòng sửa chữa sau bảo hành cả kỳ"
                    hint={`${formatVND(calc.repairReservePerMonth ?? 0)}/tháng × ${revenueMonths} tháng — tiền để dành sửa chữa, không phải lãi`}
                    value={`− ${formatVND(pnl.reserveTotal)}`}
                    tone="bad"
                  />
                )}
                <Divider />
                <Line
                  label="TIỀN LỜI THẬT CẢ KỲ"
                  value={`${pnl.net < 0 ? '− ' : ''}${formatVND(Math.abs(pnl.net))}`}
                  tone={pnl.net >= 0 ? 'good' : 'bad'}
                  size="lg"
                />
                <Line
                  label="Tiền lời thật trung bình mỗi tháng"
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
                <BarStat
                  className="hidden sm:block"
                  label="Tiền lời thật / tháng"
                  value={`${pnl.perMonth < 0 ? '− ' : ''}${formatVND(Math.abs(pnl.perMonth))}`}
                  valueTone={pnl.perMonth >= 0 ? 'text-emerald-700' : 'text-rose-600'}
                  sub={d && d.profitPerMonth > 0 ? `mục tiêu ${formatVND(d.profitPerMonth)}` : undefined}
                  detail={(
                    <>
                      <ExplainFormula>
                        {shortVND(pnl.net)} ÷ {revenueMonths} tháng = {formatVND(pnl.perMonth)}
                      </ExplainFormula>
                      <p>
                        Lấy lãi thật của cả kỳ chia đều số tháng có tiền vào. Đây là tiền còn lại{' '}
                        <b>sau khi</b> đã hoàn hết vốn bỏ ra và trả chi phí vận hành — khác với{' '}
                        {d && d.profitPerMonth > 0 ? <>mục tiêu {formatVND(d.profitPerMonth)} bạn đặt,</> : <>mục tiêu bạn đặt,</>}{' '}
                        vì giá chốt thường cao hơn giá đề xuất và phần bù phòng trống chưa dùng tới.
                      </p>
                    </>
                  )}
                />
                <BarStat
                  className="hidden lg:block"
                  label={`Tiền lời thật cả kỳ (${revenueMonths} tháng)`}
                  value={`${pnl.net < 0 ? '− ' : ''}${formatVND(Math.abs(pnl.net))}`}
                  valueTone={pnl.net >= 0 ? 'text-emerald-700' : 'text-rose-600'}
                  sub="đã trừ tiền bỏ ra & chi phí"
                  detail={(
                    <>
                      <ExplainFormula>
                        {shortVND(totalMonthly)} × {revenueMonths} tháng
                        {'\n'}− {shortVND(totalInvest)} tiền bỏ ra
                        {'\n'}− {shortVND(pnl.opexTotal)} vận hành
                        {pnl.reserveTotal > 0 && <>{'\n'}− {shortVND(pnl.reserveTotal)} dự phòng sửa chữa</>}
                        {'\n'}= {formatVND(pnl.net)}
                      </ExplainFormula>
                      <p>
                        Doanh thu {formatVND(pnl.revenue)} là giá chốt nhân số tháng thật sự có khách.
                        Trừ tiền bỏ ra (thuê chủ + cải tạo + thiết bị), chi phí vận hành mỗi tháng
                        {pnl.reserveTotal > 0 && ' và khoản để dành sửa chữa sau bảo hành'} thì còn lại
                        chừng này là tiền lời.
                      </p>
                    </>
                  )}
                />
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Nút xám thì PHẢI nói vì sao ngay cạnh nó. Người dùng đứng ở thanh cuối trang,
                không tự cuộn ngược lên tìm khối cảnh báo để đoán lý do. */}
            {summary.status !== 'PENDING_HOST_REVIEW' ? (
              <p className="text-xs font-semibold text-amber-600">Chỉ xác nhận được khi ở trạng thái &quot;Chờ Host duyệt&quot;</p>
            ) : pricingDataBroken ? (
              <p className="text-xs font-semibold text-rose-600">Kết quả tính giá của máy chủ đang sai — xem cảnh báo đầu trang</p>
            ) : !zoneHasManager ? (
              <button
                type="button"
                onClick={() => navigate('/host/zones')}
                className="text-xs font-bold text-rose-600 underline hover:text-rose-800"
              >
                {property?.zoneName ?? 'Khu vực'} chưa có quản lý — gán trước rồi mới duyệt được →
              </button>
            ) : leaseNotStarted && !ackEarlyActivation ? (
              <p className="text-xs font-semibold text-amber-600">
                Cần tick xác nhận ở cảnh báo phía trên — hợp đồng chủ nhà chưa tới ngày bắt đầu
              </p>
            ) : null}
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={!canConfirm || submitting}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Đang xử lý...' : (<><Send className="h-5 w-5" /> Xác nhận &amp; Kích hoạt</>)}
            </button>
          </div>
        </div>
      </div>

      {confirmOpen && calc && (
        <ActivateConfirmDialog
          propertyName={propertyName}
          isRoomScope={isRoomScope}
          rooms={(calc.roomResults || []).map((r) => ({
            roomId: r.roomId,
            label: r.roomNumber ? `Phòng ${r.roomNumber}` : `Phòng #${r.roomId}`,
            price: roomPrices[r.roomId] || 0,
          }))}
          totalMonthly={totalMonthly}
          revenueMonths={revenueMonths}
          pnl={pnl}
          targetPerMonth={d?.profitPerMonth ?? 0}
          zoneName={property?.zoneName}
          managerName={ownManager?.fullName || zoneLink?.managerFullName}
          submitting={submitting}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
};

/**
 * Hộp xác nhận cuối trước khi kích hoạt cho thuê.
 *
 * Gộp lại đúng ba thứ Host cần thấy lần cuối, mà thanh dính đáy trang KHÔNG nói được:
 *   1. GIÁ TỪNG PHÒNG — thanh đáy chỉ có tổng. Chốt nhầm một phòng thì cả bảng tổng vẫn
 *      trông bình thường, và giá sai chỉ lộ ra khi khách đầu tiên vào ở.
 *   2. LỜI THẬT so với mục tiêu — con số quyết định có nên chốt hay không.
 *   3. Chuyện gì xảy ra SAU khi bấm — phần này trước đây không nói ở đâu cả.
 */
const ActivateConfirmDialog = ({
  propertyName, isRoomScope, rooms, totalMonthly, revenueMonths, pnl, targetPerMonth,
  zoneName, managerName, submitting, onCancel, onConfirm,
}: {
  propertyName: string;
  isRoomScope: boolean;
  rooms: { roomId: number; label: string; price: number }[];
  totalMonthly: number;
  revenueMonths: number;
  pnl: { net: number; perMonth: number } | null;
  targetPerMonth: number;
  zoneName?: string;
  managerName?: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) => {
  const belowTarget = !!pnl && targetPerMonth > 0 && pnl.perMonth < targetPerMonth;
  const losing = !!pnl && pnl.perMonth < 0;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto">
      <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm" aria-hidden />
      <div className="relative flex min-h-full items-start justify-center p-4 sm:py-10"
        onClick={submitting ? undefined : onCancel}>
        <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl"
          onClick={(e) => e.stopPropagation()}>
          <div className="border-b border-slate-100 px-6 py-5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Xác nhận lần cuối</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">Kích hoạt cho thuê</h2>
            <p className="mt-0.5 truncate text-sm text-slate-500">{propertyName}</p>
          </div>

          <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-5">
            {/* Hai con số quyết định */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Giá chốt / tháng</p>
                <p className="mt-1 text-xl font-black tabular-nums text-slate-900">{formatVND(totalMonthly)}</p>
              </div>
              <div className={`rounded-xl border px-4 py-3 ${
                losing ? 'border-rose-200 bg-rose-50'
                : belowTarget ? 'border-amber-200 bg-amber-50'
                : 'border-emerald-200 bg-emerald-50'}`}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Tiền lời thật / tháng</p>
                <p className={`mt-1 text-xl font-black tabular-nums ${
                  losing ? 'text-rose-700' : belowTarget ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {pnl ? `${pnl.perMonth < 0 ? '− ' : ''}${formatVND(Math.abs(pnl.perMonth))}` : '—'}
                </p>
                {targetPerMonth > 0 && (
                  <p className="text-[11px] font-semibold text-slate-500">mục tiêu {formatVND(targetPerMonth)}</p>
                )}
              </div>
            </div>

            {(losing || belowTarget) && (
              <p className={`rounded-xl border px-3 py-2 text-xs font-semibold leading-relaxed ${
                losing ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                {losing
                  ? 'Với giá này cả kỳ đang LỖ sau khi trừ tiền bỏ ra và chi phí vận hành. Vẫn kích hoạt được, nhưng nên cân nhắc nâng giá trước.'
                  : 'Lời thật đang THẤP HƠN mục tiêu bạn đặt ra. Vẫn kích hoạt được — chỉ để bạn biết trước khi chốt.'}
              </p>
            )}

            {/* Giá TỪNG PHÒNG — thứ thanh đáy trang không hiện được */}
            {isRoomScope && rooms.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-400">
                  Giá chốt từng phòng ({rooms.length})
                </p>
                <div className="max-h-44 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                  {rooms.map((r) => (
                    <div key={r.roomId} className="flex items-center justify-between px-3 py-2">
                      <span className="text-sm font-semibold text-slate-700">{r.label}</span>
                      <span className={`text-sm font-black tabular-nums ${
                        r.price > 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                        {r.price > 0 ? formatVND(r.price) : 'chưa có giá'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              <RowLine label="Kỳ thu được tiền" value={`${revenueMonths} tháng`} />
              <RowLine label="Tiền lời thật cả kỳ"
                value={pnl ? `${pnl.net < 0 ? '− ' : ''}${formatVND(Math.abs(pnl.net))}` : '—'}
                tone={pnl && pnl.net < 0 ? 'rose' : 'emerald'} />
              <RowLine label="Quản lý sẽ nhận nhà"
                value={managerName ? `${managerName}${zoneName ? ` · ${zoneName}` : ''}` : 'Chưa xác định'} />
            </div>

            {/* Chuyện gì xảy ra sau khi bấm — trước đây không nói ở đâu cả */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-500">
                Sau khi kích hoạt
              </p>
              <ul className="space-y-1.5 text-xs leading-relaxed text-slate-600">
                <li>• Nhà lên danh sách cho thuê và quản lý khu vực bắt đầu vận hành.</li>
                <li>
                  • Giá này là giá bán cho khách vào ở. <b className="text-slate-800">Chỉ sửa được khi
                  đơn vị còn TRỐNG</b> — có khách rồi thì khoá tới lúc khách rời đi, vì hợp đồng
                  đã ký là cam kết hai chiều.
                </li>
                <li>• Muốn đổi giá thì đổi ngay bây giờ, đừng chờ tới lúc đã nhận khách.</li>
              </ul>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
            <button onClick={onCancel} disabled={submitting}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">
              Xem lại
            </button>
            <button onClick={onConfirm} disabled={submitting}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-emerald-500/30 transition hover:bg-emerald-700 disabled:opacity-50">
              <Send className="h-4 w-4" />
              {submitting ? 'Đang xử lý…' : 'Kích hoạt cho thuê'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const RowLine = ({ label, value, tone }: { label: string; value: string; tone?: 'rose' | 'emerald' }) => (
  <div className="flex items-center justify-between px-3 py-2.5">
    <span className="text-sm text-slate-500">{label}</span>
    <span className={`text-sm font-black tabular-nums ${
      tone === 'rose' ? 'text-rose-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-slate-900'}`}>
      {value}
    </span>
  </div>
);

// ─── Sub-components ───────────────────────────────────────────────────────────

