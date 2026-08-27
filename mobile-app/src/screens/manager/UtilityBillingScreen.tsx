import { useBillingRealtime } from '@/hooks/useBillingRealtime';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, SectionList, ActivityIndicator, Image, Platform, Modal,
} from 'react-native';
import {
  showAlert, validateMeterPhoto, splitMeterReading, roundConsumptionByMentorRule,
} from '@/utils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import {
  Colors, Spacing, BorderRadius, Shadow,
  UTILITY_WINDOW_TEXT, alreadySentReason, currentPeriod,
} from '@/constants';
import { managerPropertyService } from '@/services/manager/propertyService';
import { realPropertyService } from '@/services/manager/propertyApi';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';
import { realManagerInvoiceService, ManagerInvoice } from '@/services/manager/invoiceService';
import { managerEvnBillService, evnUnitPrice, type EvnBill } from '@/services/manager/evnBillService';
import { managerWaterBillService, waterUnitPrice, type WaterBill } from '@/services/manager/waterBillService';
import { uploadImageToCloudinary } from '@/services/core/cloudinary';
import { CameraCaptureModal } from '@/components/common';
import { serverNow, todayIso } from '@/utils/serverTime';

// ===================== TYPES =====================
type MainTab  = 'electricity' | 'water' | 'history';
/**
 * `evn_bill` = XEM hoá đơn EVN admin đã phát hành (trước 13/08/2026 là `evn_upload`,
 * manager tự chụp/nhập). Nhà nguyên căn kết thúc luôn ở bước này.
 */
type ElecStep = 'select_property' | 'evn_bill' | 'room_readings' | 'review' | 'done';
type WaterStep = 'bill_entry' | 'room_readings' | 'review' | 'done';

/**
 * Ảnh sắp chụp: chỉ còn mặt đồng hồ điện của 1 phòng.
 * Ảnh hoá đơn EVN đã chuyển sang admin tải trên web (`/admin/evn-bills`).
 */
type CameraTarget = { kind: 'meter'; roomId: string };

/** Chỉ số cũ lấy từ đâu: hoá đơn kỳ trước (kỳ 2+) hay lúc đón khách (kỳ 1). */
type PrevReadingSource = 'last_invoice' | 'handover';

/** Nói rõ số đang hiện lấy ở đâu ra — manager biết mà đối chiếu, khỏi đoán. */
const prevSourceLabel = (source?: PrevReadingSource) =>
  source === 'last_invoice' ? 'chốt kỳ trước' : 'lúc đón khách';

interface RoomMeterReading {
  roomId: string;
  roomCode: string;
  tenantName: string;
  prevReading: number;
  prevSource?: PrevReadingSource;
  newReading: string;
  hasPhoto: boolean;
  meterImageUrl?: string;  // ảnh đồng hồ đã chụp (Cloudinary)
  consumption?: number;
  fee?: number;
  sent: boolean;           // đã gửi hóa đơn cho phòng này chưa
}

interface WaterBillData {
  /** Tổng m³ trên hoá đơn admin — nhà nguyên căn thu theo số này, không theo đồng hồ. */
  totalQuantity: number;
  totalAmount: number;
  billingPeriod: string;
  pricePerM3: number;
}

interface RoomWaterReading {
  roomId: string;
  roomCode: string;
  tenantName: string;
  prevReading: number;
  prevSource?: PrevReadingSource;
  newReading: string;
  consumption?: number;
  fee?: number;
}

interface HistoryEntry {
  id: string;
  type: 'electricity' | 'water';
  propertyName: string;
  billingPeriod: string;
  totalAmount: number;
  roomCount: number;
  sentAt: string;
}

// ===================== BILLING PROPERTIES (data thật từ BE) =====================
type PropType = 'multi_room' | 'whole_house';

interface BillingRoom {
  id: string;
  code: string;
  tenantName: string;
  // Mốc DỰ PHÒNG = chỉ số ghi lúc ĐÓN KHÁCH (initialElectric/WaterReading trên HĐ),
  // chỉ dùng cho KỲ ĐẦU. Kỳ 2 trở đi lấy chỉ số mới của kỳ liền trước qua
  // fetchLastReadings() (GET /api/v1/manager/utility-invoices).
  prevElec: number;
  prevWater: number;
}

interface BillingProperty {
  id: string;
  name: string;
  type: PropType;
  electricityRate: number; // BE chưa cấp đơn giá cho manager → 0
  waterRate: number;       // BE chưa cấp đơn giá cho manager → 0
  rooms: BillingRoom[];    // multi_room: danh sách phòng; whole_house: 1 phần tử duy nhất
}

const ROOM_STATUS_RENTED = 'RENTED';

// Chịu được null/undefined: số tiền ở đây đến từ BE (hoá đơn EVN admin đẩy, hoá đơn đã
// phát hành) nên không đảm bảo là số — cùng lỗi đã làm ngã màn Lịch sử hoá đơn của khách
// thuê ngày 13/08/2026. Xem `formatCurrency` trong @/utils/helpers.
const fmt = (n: number | null | undefined) => {
  const v = Number(n);
  return (Number.isFinite(v) ? v : 0).toLocaleString('vi-VN') + 'đ';
};
const onlyDigits = (s: string) => (s || '').replace(/[^\d]/g, '');
/**
 * Cho gõ CHỈ SỐ đồng hồ có phần thập phân ("3081.5") — khác `onlyDigits` vốn xoá sạch
 * dấu chấm. Chỉ số nay lưu cả phần lẻ (chữ số đỏ trên mặt đồng hồ) nên ô nhập tay phải
 * nhận được dấu; nếu không, người dùng sửa số OCR điền là mất luôn phần lẻ.
 * Chấp nhận dấu phẩy (bàn phím tiếng Việt) và chỉ giữ MỘT dấu ngăn.
 */
const decimalDigits = (s: string) => {
  const cleaned = (s || '').replace(',', '.').replace(/[^\d.]/g, '');
  const [head, ...rest] = cleaned.split('.');
  return rest.length ? `${head}.${rest.join('')}` : head;
};
// Hiển thị số có dấu phân cách nghìn (vd "400000" -> "400.000"); rỗng nếu không có số.
const groupThousands = (s: string) => {
  const d = onlyDigits(s);
  return d ? Number(d).toLocaleString('vi-VN') : '';
};

/**
 * Kỳ thanh toán trọn tháng: "01/08 – 31/08/2026". Trước đây giá trị mặc định bị
 * hard-code "01/05 – 31/05/2026" nên mở app tháng nào cũng thấy kỳ tháng 5/2026.
 * offset: 0 = tháng này, -1 = tháng trước.
 */
const monthPeriod = (offset = 0, base = serverNow()) => {
  const d = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `01/${mm} – ${lastDay}/${mm}/${d.getFullYear()}`;
};

// Dải dấu thanh/dấu phụ Unicode (U+0300–U+036F) mà NFD tách ra khỏi nguyên âm.
// Viết bằng escape ASCII để dấu tổ hợp không nằm trần trong source.
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

// Bỏ dấu tiếng Việt: dùng cho cả tìm kiếm nhà lẫn dò nhãn trên text OCR.
const normalizeVi = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/gi, 'd')   // đ/Đ không phải tổ hợp nên NFD không tách được
    .toLowerCase()
    .trim();

/**
 * Parser hoá đơn EVN ĐÃ CHUYỂN SANG WEB (13/08/2026).
 *
 * Người tải hoá đơn giờ là admin trên `/admin/evn-bills`, nên logic OCR + dò tổng kWh /
 * tổng tiền / kỳ nằm ở `frontend-web/src/utils/evnInvoiceParser.ts`. Manager chỉ ĐỌC kết
 * quả admin đã chốt qua `managerEvnBillService` — cố tình không còn đường nhập tay ở đây,
 * vì cho manager nhập lại chính là thứ thay đổi này loại bỏ.
 *
 * OCR ảnh ĐỒNG HỒ (`realTenantService.ocrMeter`) thì GIỮ NGUYÊN — đó vẫn là việc của manager.
 */

// Map property + rooms + hợp đồng (BE) -> shape màn ghi chỉ số dùng.
const mapBillingProperty = (
  p: { id: number; propertyName: string; wholeHouse: boolean | null },
  rooms: { id: number; roomNumber: string; status: string }[],
  contracts: TenantContractResponse[],
): BillingProperty => {
  const active = contracts.filter(c => (c.status || '').toUpperCase() === 'ACTIVE');
  const tenantByRoomId = new Map<number, string>();
  const tenantByRoomNo = new Map<string, string>();
  // Chỉ số điện/nước lúc đón khách (lưu trên HĐ) → mốc "chỉ số cũ" cho hoá đơn kỳ đầu.
  const elecInitByRoomId  = new Map<number, number>();
  const elecInitByRoomNo  = new Map<string, number>();
  const waterInitByRoomId = new Map<number, number>();
  const waterInitByRoomNo = new Map<string, number>();
  active.forEach(c => {
    if (c.roomId != null) tenantByRoomId.set(c.roomId, c.tenantFullName);
    if (c.roomNumber) tenantByRoomNo.set(c.roomNumber, c.tenantFullName);
    if (c.initialElectricReading != null) {
      if (c.roomId != null) elecInitByRoomId.set(c.roomId, c.initialElectricReading);
      if (c.roomNumber) elecInitByRoomNo.set(c.roomNumber, c.initialElectricReading);
    }
    if (c.initialWaterReading != null) {
      if (c.roomId != null) waterInitByRoomId.set(c.roomId, c.initialWaterReading);
      if (c.roomNumber) waterInitByRoomNo.set(c.roomNumber, c.initialWaterReading);
    }
  });
  const isWhole = p.wholeHouse === true;

  if (isWhole) {
    // Không có hợp đồng ACTIVE = nhà đang trống -> rooms rỗng để bị lọc khỏi danh sách tính tiền.
    const unit = active[0];
    return {
      id: String(p.id),
      name: p.propertyName,
      type: 'whole_house',
      electricityRate: 0,
      waterRate: 0,
      rooms: unit
        ? [{
            id: `house-${p.id}-unit`, code: 'Nhà nguyên căn', tenantName: unit.tenantFullName,
            prevElec:  unit.initialElectricReading ?? 0,
            prevWater: unit.initialWaterReading ?? 0,
          }]
        : [],
    };
  }

  return {
    id: String(p.id),
    name: p.propertyName,
    type: 'multi_room',
    electricityRate: 0,
    waterRate: 0,
    rooms: rooms
      // chỉ tính tiền cho phòng đang có khách thuê
      .filter(r => (r.status || '').toUpperCase() === ROOM_STATUS_RENTED)
      .map(r => ({
        id: String(r.id),
        code: r.roomNumber,
        tenantName: tenantByRoomId.get(r.id) ?? tenantByRoomNo.get(r.roomNumber) ?? 'Chưa có khách thuê',
        prevElec:  elecInitByRoomId.get(r.id)  ?? elecInitByRoomNo.get(r.roomNumber)  ?? 0,
        prevWater: waterInitByRoomId.get(r.id) ?? waterInitByRoomNo.get(r.roomNumber) ?? 0,
      })),
  };
};

// ===================== SCREEN =====================
export const UtilityBillingScreen: React.FC<any> = ({ navigation }) => {
  const route = useRoute<any>();
  const [activeTab, setActiveTab] = useState<MainTab>('electricity');
  /**
   * Chặn gửi hoá đơn khi KHÁCH ĐÓ đã nhận hoá đơn loại này trong kỳ.
   * Trả true = bị chặn. Luôn nói rõ lý do thay vì để nút im lặng.
   *
   * 13/08/2026: khoá theo NGÀY (cửa sổ 1–10) đã bỏ — gửi được mọi ngày. Thay bằng khoá
   * theo SỐ LẦN: 1 khách / 1 loại / 1 kỳ. Xem @/constants/utilityCycle.
   *
   * Khác chỗ cũ ở một điểm quan trọng: chốt cũ chỉ chặn khi khách đã trả ĐỦ tiền, nên
   * trước lúc khách trả thì manager vẫn bấm gửi lại được bao nhiêu lần cũng được. Giờ
   * cứ ĐÃ GỬI là khoá, không quan tâm đã thu tiền hay chưa.
   */
  /**
   * Lỗi BE trả về có phải "kỳ này đã gửi hoá đơn rồi" không.
   *
   * FE đã tự dò trước bằng `fetchRoomHistory` (so `billingPeriod` của hoá đơn cũ với kỳ
   * đang chốt), nhưng chuỗi kỳ do người nhập nên chỉ cần lệch một khoảng trắng hay dấu
   * gạch (– so với -) là dò trượt, nút vẫn xanh và manager bấm vào mới biết. Bắt thêm
   * lỗi của BE để khoá nút ngay tại chỗ — BE mới là bên chốt.
   */
  const isAlreadySentError = (e: any): boolean => {
    const code = e?.response?.data?.code;
    if (code === 'INVOICE_ALREADY_EXISTS') return true;
    const msg = String(e?.response?.data?.message ?? e?.message ?? '');
    return /đã nhận hoá đơn|đã nhận hóa đơn/i.test(msg);
  };

  const blockedFromSending = (
    type: 'ELECTRICITY' | 'WATER',
    roomKey: string,
    target: string,
  ) => {
    const sentKeys = type === 'ELECTRICITY' ? elecSentKeys : waterSentKeys;
    if (sentKeys.has(roomKey)) {
      showAlert('Kỳ này đã gửi rồi', alreadySentReason(type, target), undefined, '🔒');
      return true;
    }
    return false;
  };
  // Tăng mỗi lần gửi hóa đơn để panel trạng thái tự tải lại.
  const [utilReloadKey, setUtilReloadKey] = useState(0);
  // Lịch sử hóa đơn điện/nước đã gửi (toàn bộ nhà) — dữ liệu thật từ BE.
  const [histInvoices, setHistInvoices] = useState<ManagerInvoice[]>([]);
  const [loadingHist,  setLoadingHist]  = useState(false);
  /** Lọc lịch sử theo kỳ (YYYY-MM); 'all' = mọi kỳ. */
  const [histPeriod,   setHistPeriod]   = useState<string>('all');

  // ── Electricity state ──────────────────────────────────────────────────────
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [elecStep,           setElecStep]           = useState<ElecStep>('select_property');
  const [roomElecReadings,   setRoomElecReadings]   = useState<RoomMeterReading[]>([]);
  const [ocrRoomId,          setOcrRoomId]          = useState<string | null>(null); // phòng đang OCR đồng hồ
  /** Đang mở camera trong app cho việc gì (null = đóng). */
  const [cameraTarget,       setCameraTarget]       = useState<CameraTarget | null>(null);
  /** Ảnh đang xem phóng to (null = đóng). */
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  /**
   * Hoá đơn EVN của kỳ này do ADMIN phát hành (chỉ đọc). null = admin chưa đẩy.
   * Trước 13/08/2026 đây là `evnData` do chính manager chụp/nhập — xem evnBillService.
   */
  const [evnBill,        setEvnBill]        = useState<EvnBill | null>(null);
  const [evnBillLoading, setEvnBillLoading] = useState(false);
  const [evnBillError,   setEvnBillError]   = useState<string | null>(null);
  /** Đang gửi hoá đơn nhà nguyên căn (nút gửi thẳng ở bước 2). */
  const [sendingWholeHouse, setSendingWholeHouse] = useState(false);

  /**
   * Khoá "1 khách 1 hoá đơn/kỳ": tập khoá phòng ĐÃ nhận hoá đơn của kỳ đang chốt.
   * Khoá phòng = roomId dạng chuỗi; nhà nguyên căn dùng `house-<propId>-unit`.
   * Nạp từ BE mỗi lần vào bước ghi chỉ số nên khoá còn hiệu lực qua cả lần mở app khác.
   */
  const [elecSentKeys,  setElecSentKeys]  = useState<Set<string>>(new Set());
  /** Nhà nguyên căn đã gửi hoá đơn điện kỳ này — xem chú thích chỗ setElecHouseSent. */
  const [elecHouseSent, setElecHouseSent] = useState(false);
  const [waterSentKeys, setWaterSentKeys] = useState<Set<string>>(new Set());

  // ── Water state ────────────────────────────────────────────────────────────
  const [waterPropertyId,  setWaterPropertyId]  = useState<string | null>(null);
  const [waterBillData,    setWaterBillData]    = useState<WaterBillData | null>(null);
  const [waterStep,        setWaterStep]        = useState<WaterStep>('bill_entry');
  /** Hoá đơn nước admin đã chốt cho kỳ này — manager CHỈ ĐỌC (14/08/2026). */
  const [waterBill,        setWaterBill]        = useState<WaterBill | null>(null);
  const [waterBillLoading, setWaterBillLoading] = useState(false);
  const [waterBillError,   setWaterBillError]   = useState<string | null>(null);
  const [roomWaterReadings,setRoomWaterReadings]= useState<RoomWaterReading[]>([]);
  const [waterBillForm,    setWaterBillForm]    = useState({ totalAmount: '', billingPeriod: monthPeriod(), pricePerM3: '20000' });

  // Lịch sử gửi hoá đơn: BE chưa có endpoint → tạm rỗng, chỉ tích trong phiên (xem doc/ gap).
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);

  // Danh sách nhà/phòng THẬT của manager
  const [properties, setProperties] = useState<BillingProperty[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [errorProps, setErrorProps] = useState<string | null>(null);

  const loadProperties = useCallback(async () => {
    try {
      setErrorProps(null);
      const scoped = await managerPropertyService.getScopedProperties();
      const mapped = await Promise.all(
        scoped.map(async (p) => {
          const [rooms, contracts] = await Promise.all([
            realPropertyService.getRooms(p.id).catch(() => []),
            realTenantService.listByProperty(p.id).catch(() => [] as TenantContractResponse[]),
          ]);
          return mapBillingProperty(p, rooms, contracts);
        }),
      );
      // Chỉ giữ nhà đang có khách thuê (multi-room: có phòng RENTED; nguyên căn: có HĐ ACTIVE).
      // Nhà trống không phát sinh tiền điện/nước nên bỏ khỏi cả tab Điện lẫn tab Nước.
      setProperties(mapped.filter(p => p.rooms.length > 0));
    } catch (e: any) {
      setErrorProps(e?.response?.data?.message || e?.message || 'Không tải được danh sách tòa nhà');
    } finally {
      setLoadingProps(false);
    }
  }, []);

  const loadHistory = useCallback(() => {
    setLoadingHist(true);
    Promise.all([
      realManagerInvoiceService.listInvoices({ type: 'ELECTRICITY' }).catch(() => [] as ManagerInvoice[]),
      realManagerInvoiceService.listInvoices({ type: 'WATER' }).catch(() => [] as ManagerInvoice[]),
    ])
      .then(([e, w]) => setHistInvoices([...e, ...w].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))))
      .finally(() => setLoadingHist(false));
  }, []);

  useFocusEffect(useCallback(() => { loadProperties(); loadHistory(); }, [loadProperties, loadHistory]));

  /**
   * Hoá đơn điện/nước khách trả xong → nạp lại lịch sử. BE gửi kèm `utilityInvoiceId`
   * cho loại này, nhưng ở đây cứ nạp lại cả danh sách: `loadHistory` rẻ hơn nhiều so với
   * việc dò đúng dòng rồi vá tay, mà lại không sợ lệch bộ lọc kỳ đang chọn.
   */
  useBillingRealtime((event) => {
    if (event.event !== 'INVOICE_PAID') return;
    loadHistory();
  });

  /**
   * MỞ THẲNG NHÀ ĐƯỢC CHỈ ĐỊNH khi vào từ màn "Cần chụp số"
   * (`MeterReadingPendingScreen` điều hướng kèm `{ propertyId, roomId, period }`).
   *
   * Trước 13/08/2026 màn này không đọc `route.params` nên bấm từ bên kia sang vẫn rơi
   * vào bước chọn nhà từ đầu — đúng thứ màn kia sinh ra để tránh.
   *
   * `jumpedRef` để chỉ nhảy MỘT LẦN: `useFocusEffect` chạy lại mỗi lần quay lại màn,
   * không chặn thì manager bấm "Quay lại" là bị đá về bước 2 vô hạn, không thoát ra
   * bước chọn nhà được.
   */
  const jumpedRef = useRef(false);
  useEffect(() => {
    const pid = route?.params?.propertyId;
    if (jumpedRef.current || !pid || properties.length === 0) return;
    if (!properties.some(p => p.id === String(pid))) return; // nhà không thuộc manager
    jumpedRef.current = true;
    setSelectedPropertyId(String(pid));
    setActiveTab('electricity');
    enterEvnStep(String(pid));
  }, [route?.params?.propertyId, properties]);
  useEffect(() => { loadHistory(); }, [utilReloadKey, loadHistory]);

  const selectedProperty = properties.find(p => p.id === selectedPropertyId);
  const waterProperty    = properties.find(p => p.id === waterPropertyId);
  const isWholeHouse     = selectedProperty?.type === 'whole_house';

  /**
   * CHỈ SỐ CŨ CỦA KỲ ĐANG CHỐT = chỉ số MỚI của kỳ liền trước, VÀ phòng nào đã gửi kỳ này.
   *
   * Hai thứ này lấy từ cùng một lần gọi API nên gộp làm một:
   *  • `lastReadings` — kỳ 1 (phòng chưa có hoá đơn nào) lấy mốc ghi lúc đón khách; kỳ 2
   *    lấy số cuối kỳ 1, kỳ 3 lấy số cuối kỳ 2...
   *  • `sentKeys` — phòng đã có hoá đơn CÙNG `billingPeriod` với kỳ đang chốt. Đây là cái
   *    chặn gửi trùng; so bằng chuỗi kỳ chứ không bằng tháng tạo, vì hoá đơn kỳ tháng 7
   *    hoàn toàn có thể được gửi trong tháng 8.
   *
   * Khoá phòng: roomId dạng chuỗi, nhà nguyên căn dùng `house-<propId>-unit`.
   */
  /**
   * Chuẩn hoá chuỗi kỳ trước khi so.
   *
   * Chuỗi kỳ do NGƯỜI gõ ở trang admin ("01/09 – 30/09/2026") rồi được chép nguyên văn
   * sang hoá đơn. Chỉ cần dư một khoảng trắng, hay gạch ngang dài `–` đổi thành `-`, là
   * so bằng `===` trượt → FE tưởng chưa gửi, để nút xanh, manager bấm vào mới ăn lỗi của
   * BE. Gom mọi kiểu gạch về `-` và ép khoảng trắng về một dấu cách.
   */
  const normPeriod = (raw?: string | null): string =>
    (raw ?? '').replace(/[–—-]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();

  const fetchRoomHistory = async (
    propId: string,
    type: 'ELECTRICITY' | 'WATER',
    period?: string,
  ): Promise<{ lastReadings: Map<string, number>; sentKeys: Set<string>; houseSent: boolean }> => {
    const lastReadings = new Map<string, number>();
    const sentKeys = new Set<string>();
    /** Nhà nguyên căn đã có hoá đơn kỳ này chưa — cờ riêng, không phụ thuộc khoá chuỗi. */
    let houseSent = false;
    const wanted = normPeriod(period);
    try {
      // GỬI CẢ `period` để BE lọc. Đây chính là truy vấn BE dùng trong
      // `validateBillingPeriodLock` (findByFilters(propertyId, period, type)) — hỏi đúng
      // câu BE hỏi thì câu trả lời không thể lệch. Trước đây FE lấy hết mọi kỳ rồi tự so
      // chuỗi `billingPeriod`, mà chuỗi đó do admin gõ tay nên chỉ cần lệch một khoảng
      // trắng là dò trượt: nút vẫn xanh, bấm vào mới nhận "đã nhận hoá đơn của kỳ ...".
      const invoices = await realManagerInvoiceService.listUtilityInvoices(
        Number(propId), { type, period: period?.trim() || undefined },
      );
      // Mới nhất trước, để phần tử đầu tiên của mỗi phòng là kỳ gần nhất.
      const sorted = [...invoices].sort((a, b) => {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        return tb - ta || (b.id ?? 0) - (a.id ?? 0);
      });
      for (const inv of sorted) {
        // Nhà nguyên căn không có roomId → khớp theo phần tử phòng duy nhất của nhà đó.
        const isHouse = inv.roomId == null;
        const key = isHouse ? `house-${propId}-unit` : String(inv.roomId);
        if (inv.newReading != null && !lastReadings.has(key)) {
          lastReadings.set(key, Number(inv.newReading));
        }
        // Hoá đơn đã huỷ không tính là "đã gửi" — huỷ xong phải gửi lại được.
        const cancelled = (inv.status || '').toUpperCase() === 'CANCELLED';
        if (cancelled) continue;
        // BE đã lọc theo `period` rồi nên mọi dòng về đây đều thuộc kỳ đang chốt. Chỉ so
        // lại khi BE trả kèm chuỗi kỳ khác hẳn (phòng hờ BE bỏ qua tham số lọc).
        const samePeriod = !wanted || !inv.billingPeriod
          || normPeriod(inv.billingPeriod) === wanted;
        if (!samePeriod) continue;
        sentKeys.add(key);
        if (isHouse) houseSent = true;
      }
    } catch {
      // Không lấy được lịch sử → rơi về mốc lúc đón khách, manager vẫn sửa tay được.
      // Cố tình KHÔNG chặn gửi khi lỗi mạng: chặn nhầm còn tệ hơn, vì BE vẫn chặn trùng.
    }
    return { lastReadings, sentKeys, houseSent };
  };

  // ── Ảnh + OCR ──────────────────────────────────────────────────────────────
  /** Lấy ảnh có sẵn trong máy. */
  const pickFromGallery = async (): Promise<string | null> => {
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    return r.canceled ? null : r.assets[0].uri;
  };

  /**
   * Hỏi nguồn ảnh rồi xử lý.
   * "Chụp" mở CameraCaptureModal (camera trong app) cho MỌI nền tảng: trên web
   * ImagePicker.launchCameraAsync chỉ mở hộp thoại chọn file, và modal còn bắt xem
   * lại ảnh trước khi dùng — quan trọng với ảnh đồng hồ vì đó là căn cứ tính tiền.
   */
  const askPhotoSource = (target: CameraTarget) => {
    showAlert('Chọn ảnh', undefined, [
      { text: '📷 Chụp ảnh', onPress: () => setCameraTarget(target) },
      {
        text: '🖼 Chọn từ thư viện',
        onPress: async () => {
          const uri = await pickFromGallery();
          if (uri) await handlePhoto(target, uri);
        },
      },
      { text: 'Huỷ', style: 'cancel' },
    ]);
  };

  /** Ảnh đã chọn/đã chụp xong thì đưa về đúng chỗ xử lý. */
  const handlePhoto = async (target: CameraTarget, uri: string) => {
    await captureRoomMeter(target.roomId, uri);
  };

  // ── Hoá đơn EVN (admin phát hành) ──────────────────────────────────────────
  /**
   * Vào bước 2: lấy hoá đơn EVN kỳ này admin đã đẩy + lịch sử chỉ số của nhà.
   *
   * Không tìm thấy hoá đơn KHÔNG phải lỗi — nghĩa là admin chưa tải lên. Màn hình hiện
   * trạng thái chờ; manager cố tình không có đường nhập tay thay admin.
   *
   * Nạp lịch sử ngay tại đây (chứ không đợi sang bước 3) vì nhà NGUYÊN CĂN gửi thẳng ở
   * bước này, vẫn cần chỉ số cũ để ghi vào hoá đơn và cần biết kỳ này đã gửi chưa.
   */
  const enterEvnStep = async (propId: string) => {
    setElecStep('evn_bill');
    setEvnBillLoading(true);
    setEvnBillError(null);
    setEvnBill(null);

    const { month, year } = currentPeriod();
    let bill: EvnBill | null = null;
    try {
      bill = await managerEvnBillService.getForPeriod(Number(propId), month, year);
      setEvnBill(bill);
    } catch (e: any) {
      setEvnBillError(
        e?.response?.data?.message
          || e?.message
          || 'Không tải được hoá đơn điện của kỳ này.',
      );
    } finally {
      setEvnBillLoading(false);
    }

    const prop = properties.find(p => p.id === propId);
    const { lastReadings, sentKeys, houseSent } = await fetchRoomHistory(
      propId, 'ELECTRICITY', bill?.billingPeriod,
    );
    // Nhà nguyên căn: hoá đơn của BE không mang roomId nên khoá chuỗi có thể lệch với id
    // phòng ảo FE tự dựng. Dùng thẳng cờ `houseSent` để nút "đã gửi" không phụ thuộc vào
    // việc hai bên đặt tên khoá giống nhau.
    setElecHouseSent(houseSent);
    setElecSentKeys(sentKeys);
    if (prop) {
      setRoomElecReadings(prop.rooms.map(r => ({
        roomId: r.id, roomCode: r.code, tenantName: r.tenantName,
        // Kỳ 2 trở đi: chỉ số cũ = chỉ số MỚI của kỳ liền trước. Kỳ 1 (chưa có hoá đơn
        // nào) mới rơi về mốc ghi lúc đón khách.
        prevReading: lastReadings.get(r.id) ?? r.prevElec,
        prevSource: lastReadings.has(r.id) ? 'last_invoice' : 'handover',
        newReading: '', hasPhoto: false,
        // Phòng đã nhận hoá đơn kỳ này (từ lần mở app trước) hiện luôn trạng thái đã gửi.
        sent: sentKeys.has(r.id),
      })));
    }
  };

  // Xoá ảnh đồng hồ của 1 phòng. Giữ nguyên chỉ số đã nhập vì manager có thể nhập tay
  // — chỉ gỡ ảnh để không gửi ảnh sai lên hoá đơn.
  const clearRoomMeterPhoto = (roomId: string) => {
    const doClear = () =>
      setRoomElecReadings(prev => prev.map(r =>
        r.roomId === roomId ? { ...r, hasPhoto: false, meterImageUrl: undefined } : r,
      ));
    if (Platform.OS === 'web') { doClear(); return; }
    showAlert(
      'Xoá ảnh đồng hồ?',
      'Ảnh sẽ không được gửi kèm hoá đơn. Chỉ số đã nhập vẫn được giữ.',
      [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Xoá ảnh', style: 'destructive', onPress: doClear },
      ],
    );
  };

  // Chỉ số + trạng thái đã nạp sẵn ở `enterEvnStep`, đây chỉ là chuyển bước.
  const goToRoomReadings = () => setElecStep('room_readings');

  /**
   * Chụp/chọn ảnh đồng hồ điện 1 phòng -> upload + OCR -> tự điền chỉ số mới.
   *
   * Chỉ số điện là tiền thật nên ảnh phải là MẶT ĐỒNG HỒ: `validateMeterPhoto` soi chữ
   * OCR đọc được (kWh, tên hãng, serial...). Ảnh chỉ có mấy con số (ghi ra giấy, chụp
   * màn hình) hoặc chụp nhầm đồng hồ nước đều bị TỪ CHỐI — không lưu ảnh, không điền số.
   */
  const captureRoomMeter = async (roomId: string, uri: string) => {
    try {
      setOcrRoomId(roomId);
      const url = await uploadImageToCloudinary(uri);

      let ocr;
      try {
        ocr = await realTenantService.ocrMeter(url);
      } catch {
        // Không kiểm chứng được ảnh → vẫn giữ để không chặn việc chốt số, nhưng nói rõ.
        setRoomElecReadings(prev => prev.map(r =>
          r.roomId === roomId ? { ...r, hasPhoto: true, meterImageUrl: url } : r));
        showAlert(
          'Chưa kiểm được ảnh',
          'Dịch vụ đọc ảnh đang lỗi nên chưa xác nhận được đây có phải mặt đồng hồ không. Nhập chỉ số bằng tay và kiểm lại ảnh giúp.',
        );
        return;
      }

      const check = validateMeterPhoto('elec', ocr);
      if (!check.ok) {
        showAlert('Ảnh không phải đồng hồ điện', check.reason, undefined, '🚫');
        return;
      }

      // Tách phần lẻ (chữ số đỏ) khỏi dãy OCR đọc được. `onlyDigits` cũ nuốt luôn phần
      // lẻ nên "030815" thành 30815 — chỉ số to gấp 10 lần, và từ 08/08/2026 còn lệch
      // đơn vị với `prevReading` (lấy từ chỉ số lúc đón khách, nay đã có phần lẻ).
      const split = splitMeterReading(check.reading || '', 'elec');
      const reading = split.integerPart
        ? (split.decimalPart
            ? `${Number(split.integerPart)}.${split.decimalPart}`
            : String(Number(split.integerPart)))
        : '';
      setRoomElecReadings(prev => prev.map(r =>
        r.roomId === roomId
          ? { ...r, newReading: reading || r.newReading, hasPhoto: true, meterImageUrl: url }
          : r,
      ));
      if (!reading) showAlert('Đã nhận ảnh đồng hồ', 'Chưa đọc được chỉ số từ ảnh — vui lòng nhập tay.');
      else if (check.confidence === 'low') {
        showAlert('Ảnh hơi mờ', 'Chưa chắc chắn đây là mặt đồng hồ điện — kiểm tra lại ảnh và chỉ số trước khi gửi hoá đơn.');
      }
    } catch {
      showAlert('Lỗi', 'Không tải/đọc được ảnh đồng hồ. Vui lòng nhập tay.');
    } finally {
      setOcrRoomId(null);
    }
  };

  // Cập nhật 1 phòng trong danh sách chỉ số điện (nhập tay chỉ số cũ / mới).
  const updateRoomElec = (roomId: string, patch: Partial<RoomMeterReading>) =>
    setRoomElecReadings(prev => prev.map(r => (r.roomId === roomId ? { ...r, ...patch } : r)));

  /** Đơn giá 1 kWh admin đã chốt cho kỳ này. 0 khi chưa có hoá đơn EVN. */
  const elecUnitPrice = evnBill ? evnUnitPrice(evnBill) : 0;

  // Gửi hóa đơn ĐIỆN (riêng) cho 1 phòng cụ thể (multi-room)
  const sendSingleRoomElec = async (roomId: string) => {
    if (!evnBill || !selectedProperty) return;
    const room = roomElecReadings.find(r => r.roomId === roomId);
    if (!room) return;
    if (blockedFromSending('ELECTRICITY', room.roomId, `Phòng ${room.roomCode} (${room.tenantName})`)) return;
    const newVal = Number(room.newReading);
    if (!newVal || newVal <= room.prevReading) {
      showAlert('Chỉ số không hợp lệ', 'Chỉ số mới phải lớn hơn chỉ số cũ.');
      return;
    }
    const consumption = roundConsumptionByMentorRule(Math.max(newVal - room.prevReading, 0));
    const fee         = Math.round(consumption * elecUnitPrice);

    try {
      await realManagerInvoiceService.createRoomUtilityInvoice(
        Number(selectedProperty.id), Number(room.roomId),
        {
          type: 'ELECTRICITY', billingPeriod: evnBill.billingPeriod,
          prevReading: room.prevReading, newReading: newVal, consumption,
          unitPrice: elecUnitPrice, amount: fee, meterImageUrl: room.meterImageUrl,
        },
      );
      setRoomElecReadings(prev => prev.map(r =>
        r.roomId === roomId ? { ...r, consumption, fee, sent: true } : r,
      ));
      setElecSentKeys(prev => new Set(prev).add(room.roomId));
      setUtilReloadKey(k => k + 1);
      showAlert('Đã gửi', `Hóa đơn điện phòng ${room.roomCode} · ${fmt(fee)} đã gửi cho ${room.tenantName}.`);
    } catch (e: any) {
      showAlert('Lỗi', e?.response?.data?.message || e?.message || 'Không gửi được hóa đơn điện.');
    }
  };

  // Gửi hóa đơn ĐIỆN (riêng) cho tất cả phòng chưa gửi (multi-room)
  const sendAllUnsent = async () => {
    if (!evnBill || !selectedProperty) return;
    // Lọc cả `sent` (trong phiên) lẫn `elecSentKeys` (kỳ này đã gửi từ lần trước) để
    // không phòng nào nhận hoá đơn thứ hai của cùng một kỳ.
    const unsent = roomElecReadings.filter(r =>
      !r.sent && !elecSentKeys.has(r.roomId)
      && r.newReading && Number(r.newReading) > r.prevReading);
    if (!unsent.length) { showAlert('Thông báo', 'Tất cả phòng đã được gửi hoặc chưa nhập chỉ số hợp lệ.'); return; }

    const now = todayIso();

    try {
      await Promise.all(unsent.map(r => {
        const consumption = roundConsumptionByMentorRule(Math.max(Number(r.newReading) - r.prevReading, 0));
        const fee = Math.round(consumption * elecUnitPrice);
        return realManagerInvoiceService.createRoomUtilityInvoice(
          Number(selectedProperty.id), Number(r.roomId),
          {
            type: 'ELECTRICITY', billingPeriod: evnBill.billingPeriod,
            prevReading: r.prevReading, newReading: Number(r.newReading), consumption,
            unitPrice: elecUnitPrice, amount: fee, meterImageUrl: r.meterImageUrl,
          },
        );
      }));

      const sentIds = new Set(unsent.map(r => r.roomId));
      let total = 0;
      setRoomElecReadings(prev => prev.map(r => {
        if (!sentIds.has(r.roomId)) return r;
        const consumption = roundConsumptionByMentorRule(Math.max(Number(r.newReading) - r.prevReading, 0));
        const fee = Math.round(consumption * elecUnitPrice);
        total += fee;
        return { ...r, consumption, fee, sent: true };
      }));
      setElecSentKeys(prev => new Set([...prev, ...sentIds]));

      setHistoryEntries(prev => [{
        id: `he-${Date.now()}`, type: 'electricity',
        propertyName: selectedProperty.name, billingPeriod: evnBill.billingPeriod,
        totalAmount: total, roomCount: unsent.length, sentAt: now,
      }, ...prev]);

      setUtilReloadKey(k => k + 1);
      setElecStep('done');
      showAlert('Đã gửi', `Đã gửi hóa đơn điện cho ${unsent.length} phòng.`);
    } catch (e: any) {
      showAlert('Lỗi', e?.response?.data?.message || e?.message || 'Không gửi được hóa đơn điện.');
    }
  };

  /**
   * Gửi hóa đơn ĐIỆN cho nhà NGUYÊN CĂN — gửi thẳng, KHÔNG cần chụp đồng hồ.
   *
   * Cả căn nhà chỉ có một khách, và hoá đơn EVN admin đẩy xuống đã là hoá đơn của đúng
   * căn đó: tiền phải thu = đúng tổng tiền EVN, số điện tiêu thụ = đúng tổng kWh EVN.
   * Bắt manager leo lên chụp đồng hồ chỉ để chép lại con số đã biết là việc thừa —
   * đó là lý do bước 3 bị bỏ cho nhà nguyên căn từ 13/08/2026.
   *
   * Chỉ số ghi vào hoá đơn vẫn liên tục để kỳ sau còn mốc: newReading = chỉ số cũ + tổng
   * kWh của kỳ. (Nhà theo phòng thì ngược lại — vẫn phải chụp từng đồng hồ, vì đơn giá
   * dùng chung nhưng mỗi phòng tiêu thụ khác nhau.)
   */
  const sendWholeHouseElec = async () => {
    if (!evnBill || !selectedProperty) return;
    const unit = roomElecReadings[0];
    if (!unit) return;
    if (blockedFromSending('ELECTRICITY', unit.roomId, unit.tenantName)) return;

    const consumption = evnBill.totalKwh;
    const fee         = Math.round(evnBill.totalAmount); // nguyên căn trả toàn bộ tiền EVN
    const newVal      = unit.prevReading + consumption;
    /**
     * Đơn giá gửi lên BE phải là số CHƯA làm tròn.
     *
     * BE ép `tiêu thụ × đơn giá == thành tiền` (UtilityInvoiceServiceImpl
     * .validateInvoiceAmounts). Trong khi `elecUnitPrice` là số đã làm tròn để HIỂN THỊ
     * (399.585 ÷ 199 = 2007,96 → hiện "2.008đ/kWh"). Gửi 2008 lên thì BE tính
     * 199 × 2008 = 399.592, lệch 7đ so với 399.585 → chặn "Thành tiền không khớp".
     *
     * Gốc rễ: EVN tính bậc thang nên tổng tiền KHÔNG bao giờ bằng kWh × một đơn giá
     * phẳng — "đơn giá" ở đây chỉ là số bình quân suy ngược ra. Giữa hai cái sai lệch,
     * phải giữ TỔNG TIỀN đúng bằng hoá đơn EVN (khách nguyên căn trả đúng số đó), nên
     * hy sinh độ tròn của đơn giá.
     */
    const exactUnitPrice = consumption > 0 ? fee / consumption : 0;
    const now = todayIso();

    setSendingWholeHouse(true);
    try {
      await realManagerInvoiceService.createPropertyUtilityInvoice(
        Number(selectedProperty.id),
        {
          type: 'ELECTRICITY', billingPeriod: evnBill.billingPeriod,
          prevReading: unit.prevReading, newReading: newVal, consumption,
          unitPrice: exactUnitPrice, amount: fee,
          // Ảnh gửi kèm là ẢNH HOÁ ĐƠN EVN của admin, không phải ảnh đồng hồ —
          // đó mới là căn cứ khách đối chiếu được với bên điện lực.
          meterImageUrl: evnBill.imageUrl ?? undefined,
        },
      );
      setElecHouseSent(true);
      setElecSentKeys(prev => new Set(prev).add(unit.roomId));
      setRoomElecReadings(prev => prev.map(r =>
        r.roomId === unit.roomId ? { ...r, consumption, fee, sent: true } : r));
      setHistoryEntries(prev => [{
        id: `he-${Date.now()}`, type: 'electricity',
        propertyName: selectedProperty.name, billingPeriod: evnBill.billingPeriod,
        totalAmount: fee, roomCount: 1, sentAt: now,
      }, ...prev]);
      setUtilReloadKey(k => k + 1);
      setElecStep('done');
    } catch (e: any) {
      // BE báo "kỳ này đã có hoá đơn" → KHOÁ nút luôn thay vì chỉ hiện alert rồi để
      // nguyên nút xanh: manager bấm lại lần nữa cũng chỉ nhận đúng câu đó.
      // Xem isAlreadySentError.
      if (isAlreadySentError(e)) {
        setElecHouseSent(true);
        setElecSentKeys(prev => new Set(prev).add(unit.roomId));
        setRoomElecReadings(prev => prev.map(r =>
          r.roomId === unit.roomId ? { ...r, sent: true } : r));
      }
      showAlert('Lỗi', e?.response?.data?.message || e?.message || 'Không gửi được hóa đơn điện.');
    } finally {
      setSendingWholeHouse(false);
    }
  };

  // ── Water helpers ──────────────────────────────────────────────────────────
  // Nước KHÔNG đổi luồng (13/08/2026): manager vẫn tự nhập hoá đơn nước của cả nhà rồi
  // chia theo chỉ số từng phòng. Chỉ thêm khoá "1 khách 1 hoá đơn/kỳ" như bên điện.
  const initRoomWaterReadings = async (propId: string, period: string) => {
    const prop = properties.find(p => p.id === propId);
    if (!prop) return;
    const { lastReadings, sentKeys } = await fetchRoomHistory(propId, 'WATER', period);
    setWaterSentKeys(sentKeys);
    const rows: RoomWaterReading[] = prop.rooms.map(r => ({
      roomId: r.id, roomCode: r.code, tenantName: r.tenantName,
      prevReading: lastReadings.get(r.id) ?? r.prevWater,
      prevSource: lastReadings.has(r.id) ? 'last_invoice' : 'handover',
      newReading: '',
    }));

    /**
     * NHÀ NGUYÊN CĂN: BỎ QUA bước ghi chỉ số, đi thẳng tới Xem trước — giống hệt bên điện.
     *
     * Cả căn một khách, số phải thu đã nằm sẵn trên hoá đơn admin (tổng m³ + tổng tiền).
     * Bắt manager leo lên đọc đồng hồ chỉ để chép một con số KHÔNG được dùng vào tính tiền
     * là việc thừa — mà còn gây hiểu nhầm: số đọc được (5 m³) khác số trên hoá đơn (4 m³)
     * thì manager tưởng mình nhập sai.
     *
     * Chỉ số vẫn được ghi để kỳ sau còn mốc, nhưng suy ra từ hoá đơn:
     * `newReading = prevReading + tổng m³` (xem chỗ gửi hoá đơn nguyên căn).
     */
    if (prop.type === 'whole_house' && waterBill) {
      setRoomWaterReadings(rows.map((r, i) => (i === 0 ? {
        ...r,
        newReading: String(r.prevReading + waterBill.totalQuantity),
        consumption: waterBill.totalQuantity,
        fee: Math.round(waterBill.totalAmount),
      } : r)));
      setWaterStep('review');
      return;
    }

    setRoomWaterReadings(rows);
    setWaterStep('room_readings');
  };

  /**
   * Nạp hoá đơn nước ADMIN đã chốt cho kỳ hiện tại.
   * `null` = admin chưa đẩy → màn hiện trạng thái CHỜ, KHÔNG mở form nhập tay. Cho
   * manager tự khai lại đơn giá chính là thứ thay đổi 14/08/2026 loại bỏ.
   */
  const loadWaterBill = async (propId: string) => {
    setWaterBillLoading(true);
    setWaterBillError(null);
    setWaterBill(null);
    try {
      const { month, year } = currentPeriod();
      setWaterBill(await managerWaterBillService.getForPeriod(Number(propId), month, year));
    } catch (e: any) {
      setWaterBillError(
        e?.response?.data?.message || e?.message || 'Không tải được hoá đơn nước của kỳ này.',
      );
    } finally {
      setWaterBillLoading(false);
    }
  };

  const handleWaterBillSubmit = () => {
    if (!waterBill || !waterPropertyId) return;
    // Đơn giá GIỮ NGUYÊN phần thập phân: BE ép `tiêu thụ × đơn giá == thành tiền`, đưa số
    // đã làm tròn vào là lệch vài đồng rồi bị chặn — đúng lỗi đã dính bên điện.
    setWaterBillData({
      totalAmount: waterBill.totalAmount,
      billingPeriod: waterBill.billingPeriod,
      totalQuantity: waterBill.totalQuantity,
      pricePerM3: waterUnitPrice(waterBill),
    });
    initRoomWaterReadings(waterPropertyId, waterBill.billingPeriod);
  };

  const calculateWaterFees = () => {
    if (!waterBillData) return false;
    const anyMissing = roomWaterReadings.some(r => !r.newReading || Number(r.newReading) <= r.prevReading);
    if (anyMissing) { showAlert('Thiếu chỉ số', 'Vui lòng nhập chỉ số mới cho tất cả phòng.'); return false; }

    /**
     * NHÀ NGUYÊN CĂN: khách trả ĐÚNG tổng hoá đơn nước, giống hệt bên điện.
     *
     * Cả căn chỉ có một khách và hoá đơn admin đẩy xuống chính là hoá đơn của căn đó,
     * nên số phải thu = tổng tiền trên hoá đơn, số m³ = tổng m³ trên hoá đơn. Tính lại
     * bằng `hiệu chỉ số × đơn giá` là ra số KHÁC (đồng hồ nhà lệch với đồng hồ công ty
     * nước, hoặc đọc lệch kỳ) — đúng ca vừa gặp: hoá đơn 133.400đ mà hệ thống đòi
     * 166.750đ vì lấy 5 m³ đọc được thay cho 4 m³ trên giấy.
     */
    const isWholeHouse = waterProperty?.type === 'whole_house';

    setRoomWaterReadings(prev => prev.map((r, i) => {
      if (isWholeHouse && i === 0) {
        return {
          ...r,
          consumption: waterBillData.totalQuantity,
          fee: Math.round(waterBillData.totalAmount),
        };
      }
      const consumption = roundConsumptionByMentorRule(Math.max(Number(r.newReading) - r.prevReading, 0));
      return { ...r, consumption, fee: Math.round(consumption * waterBillData.pricePerM3) };
    }));
    setWaterStep('review');
    return true;
  };

  const sendWaterInvoices = async () => {
    if (!waterBillData || !waterProperty) return;
    const now = todayIso();
    const period = waterBillData.billingPeriod;
    const price  = waterBillData.pricePerM3;

    // Bỏ qua phòng đã nhận hoá đơn nước của kỳ này; hết sạch thì báo rõ chứ đừng gọi API
    // rỗng rồi hiện màn "đã gửi" như chưa có chuyện gì.
    const pending = roomWaterReadings.filter(r => !waterSentKeys.has(r.roomId));
    if (!pending.length) {
      showAlert(
        'Kỳ này đã gửi rồi',
        alreadySentReason('WATER', 'Tất cả phòng của nhà này'),
        undefined,
        '🔒',
      );
      return;
    }

    try {
      if (waterProperty.type === 'whole_house') {
        const r = pending[0];
        await realManagerInvoiceService.createPropertyUtilityInvoice(
          Number(waterProperty.id),
          {
            type: 'WATER', billingPeriod: period,
            prevReading: r.prevReading,
            /**
             * Chỉ số mới = chỉ số cũ + số m³ TRÊN HOÁ ĐƠN, không phải số manager đọc
             * được ở đồng hồ.
             *
             * BE ép `newReading − prevReading == consumption`. Nhà nguyên căn thu theo
             * tổng m³ của hoá đơn (4 m³) trong khi đồng hồ nhà đọc ra 5 m³ — gửi thẳng
             * số đọc là BE chặn "Tiêu thụ không khớp". Ghi theo hoá đơn thì mốc chỉ số
             * các kỳ sau cũng liên tục với cái đã thu tiền, không lệch dần.
             */
            newReading: r.prevReading + (r.consumption ?? 0),
            consumption: r.consumption ?? 0,
            // Đơn giá suy ngược từ chính 2 số sắp gửi, KHÔNG dùng `price` đã làm tròn:
            // BE ép `tiêu thụ × đơn giá == thành tiền`. Cùng cách đã xử lý bên điện.
            unitPrice: (r.consumption ?? 0) > 0 ? (r.fee ?? 0) / (r.consumption ?? 1) : price,
            amount: r.fee ?? 0,
            /**
             * Ảnh gửi kèm là ẢNH HOÁ ĐƠN NƯỚC của admin, không phải ảnh đồng hồ.
             *
             * BE bắt buộc có bằng chứng (`ensureMeterPhotoOrOverride`) cho cả điện lẫn
             * nước. Nhà nguyên căn không đọc đồng hồ nữa nên không có ảnh công tơ — nhưng
             * hoá đơn của công ty nước MỚI là thứ khách đối chiếu được, đúng như bên điện
             * đang gửi ảnh hoá đơn EVN. Thiếu dòng này là dính "Chưa có ảnh công tơ kỳ này".
             */
            meterImageUrl: waterBill?.imageUrl ?? undefined,
          },
        );
      } else {
        await Promise.all(pending.map(r =>
          realManagerInvoiceService.createRoomUtilityInvoice(
            Number(waterProperty.id), Number(r.roomId),
            {
              type: 'WATER', billingPeriod: period,
              prevReading: r.prevReading, newReading: Number(r.newReading),
              consumption: r.consumption ?? 0, unitPrice: price, amount: r.fee ?? 0,
            },
          ),
        ));
      }
      setWaterSentKeys(prev => new Set([...prev, ...pending.map(r => r.roomId)]));
      const totalSent = pending.reduce((s, r) => s + (r.fee ?? 0), 0);
      setHistoryEntries(prev => [{
        id: `hw-${Date.now()}`, type: 'water',
        propertyName: waterProperty.name, billingPeriod: period,
        totalAmount: totalSent, roomCount: pending.length, sentAt: now,
      }, ...prev]);
      setUtilReloadKey(k => k + 1);
      setWaterStep('done');
    } catch (e: any) {
      // Cùng lý do với bên điện: BE nói đã có hoá đơn kỳ này thì khoá luôn.
      if (isAlreadySentError(e)) {
        setWaterSentKeys(prev => new Set([...prev, ...pending.map(r => r.roomId)]));
      }
      showAlert('Lỗi', e?.response?.data?.message || e?.message || 'Không gửi được hóa đơn nước.');
    }
  };

  const resetElec = () => {
    setSelectedPropertyId(null); setEvnBill(null); setEvnBillError(null);
    setElecStep('select_property'); setRoomElecReadings([]); setElecSentKeys(new Set());
    setElecHouseSent(false);
  };

  const resetWater = () => {
    setWaterPropertyId(null); setWaterBillData(null); setWaterBill(null); setWaterBillError(null);
    setWaterStep('bill_entry'); setRoomWaterReadings([]);
    setWaterBillForm({ totalAmount: '', billingPeriod: monthPeriod(), pricePerM3: '20000' });
  };

  // ───────────────────────────── RENDER ──────────────────────────────────────

  // Ảnh đồng hồ đã chụp của 1 phòng + nút xoá (ảnh này được gửi kèm hoá đơn nên phải sửa được).
  const renderMeterPhoto = (r: RoomMeterReading) => {
    if (!r.meterImageUrl) return null;
    return (
      <View style={styles.meterThumbRow}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => setZoomImage(r.meterImageUrl!)}>
          <Image source={{ uri: r.meterImageUrl }} style={styles.meterThumb} resizeMode="cover" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.meterThumbLabel}>Ảnh đồng hồ đã chụp</Text>
          <Text style={styles.meterThumbHint}>Sẽ gửi kèm hoá đơn</Text>
        </View>
        <TouchableOpacity
          style={styles.meterThumbRemove}
          onPress={() => clearRoomMeterPhoto(r.roomId)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.meterThumbRemoveText}>🗑 Xoá</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderElecTab = () => {
    if (elecStep === 'done') {
      const sentCount = roomElecReadings.filter(r => r.sent).length;
      return (
        <View style={styles.doneWrap}>
          <Text style={styles.doneEmoji}>✅</Text>
          <Text style={styles.doneTitle}>Đã gửi hóa đơn điện!</Text>
          <Text style={styles.doneSub}>
            {isWholeHouse
              ? `Hóa đơn điện đã gửi cho ${selectedProperty?.rooms[0].tenantName}.`
              : `Đã gửi hóa đơn cho ${sentCount}/${roomElecReadings.length} phòng.`}
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={resetElec}>
            <Text style={styles.primaryBtnText}>Ghi chỉ số mới</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const stepIndex =
      elecStep === 'select_property' ? 0 :
      elecStep === 'evn_bill'        ? 1 :
      elecStep === 'room_readings'   ? 2 : 3;

    return (
      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        {/* Nhà nguyên căn chỉ còn 2 bước: hoá đơn EVN của admin đã đủ để gửi cho khách. */}
        <StepIndicator
          steps={isWholeHouse
            ? ['Chọn tòa nhà', 'Hóa đơn EVN & Gửi']
            : ['Chọn tòa nhà', 'Hóa đơn EVN', 'Chỉ số phòng', 'Xem trước']}
          current={stepIndex}
        />

        {selectedPropertyId && (
          <SentInvoicePanel propertyId={selectedPropertyId} type="ELECTRICITY" reloadKey={utilReloadKey} />
        )}

        {/* ── STEP 1: Chọn tòa nhà ─────────────────────────────────── */}
        {elecStep === 'select_property' && (
          <View>
            <SectionHeader title="Bước 1: Chọn tòa nhà / căn hộ" />

            <PropertyPicker
              properties={properties}
              loading={loadingProps}
              error={errorProps}
              selectedId={selectedPropertyId}
              onSelect={setSelectedPropertyId}
              onRetry={() => { setLoadingProps(true); loadProperties(); }}
              showRoomCodes
            />

            {selectedPropertyId && (
              <TouchableOpacity
                style={[styles.primaryBtn, { marginTop: Spacing.md }]}
                onPress={() => enterEvnStep(selectedPropertyId)}
              >
                <Text style={styles.primaryBtnText}>Tiếp theo → Xem hóa đơn EVN</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── STEP 2: Hóa đơn EVN do admin phát hành (chỉ đọc) ───── */}
        {elecStep === 'evn_bill' && (() => {
          const unit = roomElecReadings[0];
          const houseSent = elecHouseSent || (!!unit && elecSentKeys.has(unit.roomId));
          return (
            <View>
              <SectionHeader title={isWholeHouse ? 'Bước 2: Hóa đơn EVN & Gửi' : 'Bước 2: Hóa đơn EVN'} />
              {selectedProperty && (
                <View style={styles.infoBanner}>
                  <Text style={styles.infoBannerText}>
                    {selectedProperty.type === 'whole_house' ? '🏠' : '🏢'} {selectedProperty.name}
                    {selectedProperty.type === 'multi_room' && ` · ${selectedProperty.rooms.length} phòng`}
                  </Text>
                </View>
              )}

              <View style={styles.card}>
                {evnBillLoading ? (
                  <View style={styles.scanningRow}>
                    <ActivityIndicator color={Colors.primary} />
                    <Text style={styles.scanningText}>Đang tải hóa đơn điện của kỳ này...</Text>
                  </View>
                ) : evnBillError ? (
                  <View style={styles.evnWaitBox}>
                    <Text style={styles.evnWaitEmoji}>⚠️</Text>
                    <Text style={styles.evnWaitTitle}>Không tải được hóa đơn</Text>
                    <Text style={styles.evnWaitText}>{evnBillError}</Text>
                    <TouchableOpacity
                      style={[styles.primaryBtn, { marginTop: Spacing.md }]}
                      onPress={() => selectedPropertyId && enterEvnStep(selectedPropertyId)}
                    >
                      <Text style={styles.primaryBtnText}>Thử lại</Text>
                    </TouchableOpacity>
                  </View>
                ) : !evnBill ? (
                  /* Admin chưa đẩy hoá đơn — KHÔNG mở form nhập tay, đó là cả điểm của
                     thay đổi 13/08/2026. Manager chờ hoặc gọi admin. */
                  <View style={styles.evnWaitBox}>
                    <Text style={styles.evnWaitEmoji}>⏳</Text>
                    <Text style={styles.evnWaitTitle}>Chờ admin gửi hóa đơn EVN</Text>
                    <Text style={styles.evnWaitText}>
                      Admin chưa tải hóa đơn điện kỳ {currentPeriod().month}/{currentPeriod().year} của nhà này lên hệ thống.
                      {'\n\n'}Khi admin gửi xong, số liệu sẽ hiện ở đây và bạn ghi chỉ số như bình thường.
                      Liên hệ admin nếu đã quá hạn.
                    </Text>
                    <TouchableOpacity
                      style={[styles.primaryBtn, { marginTop: Spacing.md }]}
                      onPress={() => selectedPropertyId && enterEvnStep(selectedPropertyId)}
                    >
                      <Text style={styles.primaryBtnText}>🔄 Kiểm tra lại</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <View style={styles.evnResult}>
                      <View style={styles.evnResultHeader}>
                        <Text style={styles.evnResultTitle}>Admin đã chốt cho kỳ này</Text>
                        <View style={[styles.badge, styles.badgeDone]}>
                          <Text style={[styles.badgeText, { color: Colors.success }]}>Chỉ đọc</Text>
                        </View>
                      </View>
                      <EVNDataRow label="Tổng điện"     value={`${evnBill.totalKwh.toLocaleString('vi-VN')} kWh`} />
                      <EVNDataRow label="Tổng tiền"     value={fmt(evnBill.totalAmount)} />
                      <EVNDataRow label="Đơn giá điện"  value={`${fmt(elecUnitPrice)}/kWh`} highlight />
                      <EVNDataRow label="Kỳ thanh toán" value={evnBill.billingPeriod} />
                    </View>

                    {!!evnBill.imageUrl && (
                      <View style={styles.thumbWrap}>
                        {/* Bấm để phóng to — ảnh hoá đơn EVN chữ nhỏ, xem ở khung thu
                            nhỏ trên điện thoại thì không đọc nổi số để đối chiếu. */}
                        <TouchableOpacity activeOpacity={0.8} onPress={() => setZoomImage(evnBill.imageUrl!)}>
                          <Image source={{ uri: evnBill.imageUrl }} style={styles.evnThumb} resizeMode="contain" />
                        </TouchableOpacity>
                        <Text style={styles.meterThumbHint}>Ảnh hóa đơn gốc admin tải lên — dùng để đối chiếu với khách.</Text>
                      </View>
                    )}

                    <Text style={styles.cardDesc}>
                      {isWholeHouse
                        ? 'Nhà nguyên căn: khách trả đúng tổng tiền hóa đơn EVN ở trên, không cần chụp đồng hồ.'
                        : `Mỗi phòng sẽ tính theo đơn giá ${fmt(elecUnitPrice)}/kWh ở trên. Bước sau bạn chụp đồng hồ từng phòng.`}
                    </Text>
                  </>
                )}
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => setElecStep('select_property')}>
                  <Text style={styles.secondaryBtnText}>← Quay lại</Text>
                </TouchableOpacity>

                {/* Nhà nguyên căn: gửi thẳng ngay tại bước này. Nhà nhiều phòng: sang bước chỉ số. */}
                {evnBill && (isWholeHouse ? (
                  <TouchableOpacity
                    style={[styles.sendBtn, { flex: 1, marginLeft: Spacing.sm }, (houseSent || sendingWholeHouse) && styles.btnLocked]}
                    onPress={sendWholeHouseElec}
                    // Đã gửi thì khoá hẳn, đừng để bấm được rồi mới báo lỗi.
                    disabled={sendingWholeHouse || houseSent}
                  >
                    {sendingWholeHouse
                      ? <ActivityIndicator color={Colors.white} />
                      : (
                        <Text style={styles.sendBtnText}>
                          {houseSent ? '🔒 Kỳ này đã gửi' : `⚡ Gửi hóa đơn · ${fmt(evnBill.totalAmount)}`}
                        </Text>
                      )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.primaryBtn, { flex: 1, marginLeft: Spacing.sm }]}
                    onPress={goToRoomReadings}
                  >
                    <Text style={styles.primaryBtnText}>Tiếp theo → Nhập chỉ số</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })()}

        {/* ── STEP 3: Chỉ số điện từng phòng ────────────────────────
            CHỈ nhà nhiều phòng tới đây. Nhà nguyên căn đã gửi xong ở bước 2 vì hoá đơn
            EVN của admin chính là hoá đơn của căn đó — không cần chụp đồng hồ. */}
        {elecStep === 'room_readings' && evnBill && (
          <View>
            <SectionHeader title="Bước 3: Chỉ số điện từng phòng" />
            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerText}>
                EVN: {evnBill.totalKwh.toLocaleString('vi-VN')} kWh · {fmt(evnBill.totalAmount)}
                {' '}· {fmt(elecUnitPrice)}/kWh · {evnBill.billingPeriod}
              </Text>
            </View>

            {/* Tóm tắt tiến trình */}
            <View style={styles.progressRow}>
              <Text style={styles.progressText}>
                Đã gửi: {roomElecReadings.filter(r => r.sent).length}/{roomElecReadings.length} phòng
              </Text>
              {roomElecReadings.some(r => !r.sent && r.newReading && Number(r.newReading) > r.prevReading) && (
                <TouchableOpacity style={styles.sendAllBtn} onPress={sendAllUnsent}>
                  <Text style={styles.sendAllBtnText}>Gửi tất cả →</Text>
                </TouchableOpacity>
              )}
            </View>

            {roomElecReadings.map(r => (
              <View key={r.roomId} style={[styles.roomCard, r.sent && styles.roomCardSent]}>
                <View style={styles.roomCardHeader}>
                  <View>
                    <Text style={styles.roomCode}>{r.roomCode}</Text>
                    <Text style={styles.roomTenant}>{r.tenantName}</Text>
                  </View>
                  <View style={[
                    styles.badge,
                    r.sent ? styles.badgeSent : r.hasPhoto ? styles.badgeDone : styles.badgePending,
                  ]}>
                    <Text style={[styles.badgeText, {
                      color: r.sent ? Colors.white : r.hasPhoto ? Colors.success : Colors.textMuted,
                    }]}>
                      {r.sent ? '✓ Đã gửi' : r.hasPhoto ? 'Có ảnh' : 'Chưa chụp'}
                    </Text>
                  </View>
                </View>

                {r.sent && <Text style={styles.prevReading}>Chỉ số cũ: {r.prevReading} kWh</Text>}

                {r.sent ? (
                  /* Phòng đã gửi kỳ này: chỉ hiện tóm tắt, không cho gửi lần hai. */
                  <View style={styles.sentSummary}>
                    <Text style={styles.sentSummaryText}>
                      {r.consumption != null
                        ? `${r.consumption} kWh · ${fmt(r.fee ?? 0)} — đã gửi hóa đơn`
                        : 'Đã gửi hóa đơn điện của kỳ này'}
                    </Text>
                  </View>
                ) : (
                  /* Phòng chưa gửi: nhập chỉ số (chụp OCR hoặc nhập tay) + nút gửi */
                  <>
                    <Text style={styles.formLabel}>Chỉ số cũ ({prevSourceLabel(r.prevSource)})</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      placeholder="Nhập chỉ số tháng trước"
                      value={r.prevReading ? String(r.prevReading) : ''}
                      onChangeText={t => updateRoomElec(r.roomId, { prevReading: Number(decimalDigits(t)) || 0 })}
                    />
                    <Text style={styles.formLabel}>Chỉ số mới (tháng này)</Text>
                    <View style={styles.readingRow}>
                      <TextInput
                        style={[styles.input, { flex: 1, marginRight: Spacing.sm }]}
                        keyboardType="numeric"
                        placeholder={`> ${r.prevReading}`}
                        value={r.newReading}
                        onChangeText={t => updateRoomElec(r.roomId, { newReading: decimalDigits(t) })}
                      />
                      <TouchableOpacity
                        style={styles.ocrBtn}
                        onPress={() => askPhotoSource({ kind: 'meter', roomId: r.roomId })}
                        disabled={ocrRoomId === r.roomId}
                      >
                        {ocrRoomId === r.roomId
                          ? <ActivityIndicator color={Colors.primary} />
                          : <Text style={styles.ocrBtnText}>📷 OCR</Text>}
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.prevReading}>📷 Chụp đồng hồ để tự đọc, hoặc nhập tay số ở trên.</Text>
                    {renderMeterPhoto(r)}
                    {r.newReading && Number(r.newReading) > r.prevReading && (() => {
                      // Đơn giá do admin chốt, dùng chung cho mọi phòng của nhà này.
                      const consumption = roundConsumptionByMentorRule(Number(r.newReading) - r.prevReading);
                      const fee = Math.round(consumption * elecUnitPrice);
                      return (
                        <>
                          <View style={styles.calcPreview}>
                            <Text style={styles.calcPreviewText}>
                              {consumption} kWh × {fmt(elecUnitPrice)}/kWh = {fmt(fee)}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.sendRoomBtn}
                            onPress={() => sendSingleRoomElec(r.roomId)}
                          >
                            <Text style={styles.sendRoomBtnText}>
                              ⚡ Gửi hóa đơn phòng {r.roomCode} · {fmt(fee)}
                            </Text>
                          </TouchableOpacity>
                        </>
                      );
                    })()}
                  </>
                )}
              </View>
            ))}

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setElecStep('evn_bill')}>
                <Text style={styles.secondaryBtnText}>← Quay lại</Text>
              </TouchableOpacity>
              {roomElecReadings.every(r => r.sent) && (
                <TouchableOpacity style={[styles.sendBtn, { flex: 1, marginLeft: Spacing.sm }]} onPress={() => setElecStep('done')}>
                  <Text style={styles.sendBtnText}>Hoàn tất ✓</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
    );
  };

  /**
   * Đủ điều kiện sang bước ghi chỉ số: đã chọn nhà VÀ admin đã chốt hoá đơn nước kỳ này.
   *
   * Trước 14/08/2026 điều kiện là "manager đã gõ đủ tổng tiền + đơn giá + kỳ" — cùng với
   * `waterEstimate` (ước lượng m³ để manager tự soi lệch số 0). Cả hai bỏ đi theo form
   * nhập tay: số giờ lấy từ hoá đơn admin phát hành, không còn gì để gõ sai.
   */
  const waterReady = !!waterPropertyId && !!waterBill;

  const renderWaterTab = () => {
    if (waterStep === 'done') {
      return (
        <View style={styles.doneWrap}>
          <Text style={styles.doneEmoji}>✅</Text>
          <Text style={styles.doneTitle}>Đã gửi hóa đơn nước!</Text>
          <Text style={styles.doneSub}>Hóa đơn nước đã được gửi đến {roomWaterReadings.length} phòng.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={resetWater}>
            <Text style={styles.primaryBtnText}>Ghi chỉ số mới</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        <StepIndicator
          steps={['Hóa đơn nước', 'Chỉ số phòng', 'Xem trước', 'Gửi']}
          current={waterStep === 'bill_entry' ? 0 : waterStep === 'room_readings' ? 1 : waterStep === 'review' ? 2 : 3}
        />

        {waterPropertyId && (
          <SentInvoicePanel propertyId={waterPropertyId} type="WATER" reloadKey={utilReloadKey} />
        )}

        {waterStep === 'bill_entry' && (
          <View>
            {/* ── Chọn nhà ── */}
            <View style={styles.formCard}>
              <View style={styles.formCardHead}>
                <View style={styles.formCardIcon}><Text style={{ fontSize: 18 }}>🏠</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formCardTitle}>Chọn nhà cần chốt</Text>
                  <Text style={styles.formCardSub}>Chỉ số nước sẽ ghi cho các phòng của nhà này.</Text>
                </View>
              </View>
              <PropertyPicker
                properties={properties}
                loading={loadingProps}
                error={errorProps}
                selectedId={waterPropertyId}
                onSelect={(id) => { setWaterPropertyId(id); if (id) loadWaterBill(id); }}
                onRetry={() => { setLoadingProps(true); loadProperties(); }}
              />
            </View>

            {/* Thẻ hoá đơn nằm SAU thẻ chọn nhà và chỉ hiện khi đã chọn: hoá đơn là của
                một căn cụ thể, bày thẻ rỗng lên trước rồi mới cho chọn nhà là ngược với
                thao tác thật, mà thẻ chờ lại cao nên đẩy luôn ô chọn nhà khỏi màn hình. */}
            {!!waterPropertyId && (
            <View style={styles.formCard}>
              <View style={styles.formCardHead}>
                <View style={styles.formCardIcon}><Text style={{ fontSize: 18 }}>💧</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formCardTitle}>Hóa đơn nước của cả nhà</Text>
                  <Text style={styles.formCardSub}>Admin chốt hoá đơn nước của cả nhà, hệ thống chia lại cho từng phòng.</Text>
                </View>
              </View>

              {/* CHỈ ĐỌC từ 14/08/2026 — giống hệt tab Điện. Trước đây manager tự gõ tổng
                  tiền + đơn giá m³ ngay tại đây, không ai đối chiếu được với hoá đơn giấy.
                  Giờ admin phát hành trên web (/admin/water-bills), manager chỉ đọc. */}
              {!waterPropertyId ? (
                <Text style={styles.helperText}>
                  Chọn nhà bên dưới để xem hoá đơn nước admin đã chốt cho kỳ này.
                </Text>
              ) : waterBillLoading ? (
                <View style={styles.scanningRow}>
                  <ActivityIndicator color={Colors.primary} />
                  <Text style={styles.scanningText}>Đang tải hoá đơn nước của kỳ này...</Text>
                </View>
              ) : !waterBill ? (
                /* Admin chưa đẩy — KHÔNG mở form nhập tay, đó là cả điểm của thay đổi này. */
                <View style={styles.evnWaitBox}>
                  <Text style={styles.evnWaitEmoji}>⏳</Text>
                  <Text style={styles.evnWaitTitle}>Chờ admin gửi hoá đơn nước</Text>
                  <Text style={styles.evnWaitText}>
                    {waterBillError
                      || `Admin chưa tải hoá đơn nước kỳ ${currentPeriod().month}/${currentPeriod().year} của nhà này lên hệ thống.`}
                    {'\n\n'}Khi admin gửi xong, số liệu sẽ hiện ở đây và bạn ghi chỉ số như bình thường.
                  </Text>
                  <TouchableOpacity
                    style={[styles.primaryBtn, { marginTop: Spacing.md }]}
                    onPress={() => waterPropertyId && loadWaterBill(waterPropertyId)}
                  >
                    <Text style={styles.primaryBtnText}>🔄 Kiểm tra lại</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.evnResult}>
                  <View style={styles.evnResultHeader}>
                    <Text style={styles.evnResultTitle}>Admin đã chốt cho kỳ này</Text>
                    <View style={[styles.badge, styles.badgeDone]}>
                      <Text style={[styles.badgeText, { color: Colors.success }]}>Chỉ đọc</Text>
                    </View>
                  </View>
                  <EVNDataRow label="Tổng nước"     value={`${waterBill.totalQuantity.toLocaleString('vi-VN')} m³`} />
                  <EVNDataRow label="Tổng tiền"     value={fmt(waterBill.totalAmount)} />
                  <EVNDataRow label="Đơn giá nước"  value={`${fmt(Math.round(waterUnitPrice(waterBill)))}/m³`} highlight />
                  <EVNDataRow label="Kỳ thanh toán" value={waterBill.billingPeriod} />
                </View>
              )}
            </View>
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, !waterReady && styles.primaryBtnDisabled]}
              onPress={handleWaterBillSubmit}
              disabled={!waterReady}
            >
              <Text style={[styles.primaryBtnText, !waterReady && styles.primaryBtnTextDisabled]}>
                {waterProperty?.type === 'whole_house' ? 'Tiếp theo → Xem trước & gửi' : 'Tiếp theo → Nhập chỉ số phòng'}
              </Text>
            </TouchableOpacity>
            {!waterReady && (
              <Text style={styles.helperText}>
                {!waterPropertyId ? 'Chọn nhà cần chốt sổ để tiếp tục.' : 'Chờ admin phát hành hoá đơn nước của kỳ này.'}
              </Text>
            )}
          </View>
        )}

        {waterStep === 'room_readings' && waterBillData && (
          <View>
            <SectionHeader title="Bước 2: Chỉ số nước từng phòng" />
            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerText}>
                Hóa đơn nước: {fmt(waterBillData.totalAmount)} · {waterBillData.pricePerM3.toLocaleString('vi-VN')}đ/m³ · {waterBillData.billingPeriod}
              </Text>
            </View>
            {roomWaterReadings.map((r, idx) => (
              <View key={r.roomId} style={styles.roomCard}>
                <Text style={styles.roomCode}>{r.roomCode}</Text>
                <Text style={styles.roomTenant}>{r.tenantName}</Text>
                <Text style={styles.prevReading}>Chỉ số cũ ({prevSourceLabel(r.prevSource)}): {r.prevReading} m³</Text>
                <TextInput style={styles.input} keyboardType="numeric"
                  placeholder={`Chỉ số mới (> ${r.prevReading})`}
                  value={r.newReading}
                  onChangeText={t => setRoomWaterReadings(prev => prev.map((x, i) => i === idx ? { ...x, newReading: decimalDigits(t) } : x))} />
              </View>
            ))}
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setWaterStep('bill_entry')}>
                <Text style={styles.secondaryBtnText}>← Quay lại</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { flex: 1, marginLeft: Spacing.sm }]} onPress={calculateWaterFees}>
                <Text style={styles.primaryBtnText}>Tính toán & Xem trước →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {waterStep === 'review' && waterBillData && (
          <View>
            <SectionHeader title="Bước 3: Xem trước & Xác nhận" />
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Thông tin hóa đơn nước</Text>
              <EVNDataRow label="Kỳ thanh toán" value={waterBillData.billingPeriod} />
              <EVNDataRow label="Đơn giá"       value={`${fmt(waterBillData.pricePerM3)}/m³`} />
              <EVNDataRow label="Tổng tiền"     value={fmt(waterBillData.totalAmount)} highlight />
            </View>
            <Text style={styles.sectionLabel}>Phân bổ theo phòng</Text>
            {roomWaterReadings.map(r => (
              <View key={r.roomId} style={styles.reviewRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reviewRoomCode}>{r.roomCode} · {r.tenantName}</Text>
                  <Text style={styles.reviewDetail}>{r.consumption} m³</Text>
                </View>
                <Text style={styles.reviewFee}>{fmt(r.fee ?? 0)}</Text>
              </View>
            ))}
            <View style={styles.reviewTotal}>
              <Text style={styles.reviewTotalLabel}>Tổng gửi</Text>
              <Text style={styles.reviewTotalVal}>{fmt(roomWaterReadings.reduce((s, r) => s + (r.fee ?? 0), 0))}</Text>
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setWaterStep('room_readings')}>
                <Text style={styles.secondaryBtnText}>← Sửa</Text>
              </TouchableOpacity>
              {(() => {
                // Khoá khi MỌI phòng của nhà đã nhận hoá đơn nước kỳ này (1 khách 1 lần/kỳ).
                const allSent = roomWaterReadings.length > 0
                  && roomWaterReadings.every(r => waterSentKeys.has(r.roomId));
                return (
                  <TouchableOpacity
                    style={[styles.sendBtn, { flex: 1, marginLeft: Spacing.sm }, allSent && styles.btnLocked]}
                    onPress={sendWaterInvoices}
                  >
                    <Text style={styles.sendBtnText}>
                      {allSent ? '🔒 Kỳ này đã gửi' : '💧 Gửi hóa đơn nước'}
                    </Text>
                  </TouchableOpacity>
                );
              })()}
            </View>
          </View>
        )}
        <View style={{ height: 80 }} />
      </ScrollView>
    );
  };

  /**
   * Lịch sử gom theo KỲ, mới nhất trước.
   *
   * Trước 13/08/2026 đây là một danh sách phẳng: quản 5–10 nhà, mỗi kỳ vài chục hoá
   * đơn điện + nước là cuộn mãi không thấy kỳ mình cần. Nay mỗi kỳ một mục, kèm chip
   * lọc kỳ ở trên.
   */
  const histSections = useMemo(() => {
    const rows = histPeriod === 'all'
      ? histInvoices
      : histInvoices.filter(i => `${i.year}-${String(i.month).padStart(2, '0')}` === histPeriod);
    const byPeriod = new Map<string, ManagerInvoice[]>();
    for (const i of rows) {
      const key = `${i.year}-${String(i.month).padStart(2, '0')}`;
      byPeriod.set(key, [...(byPeriod.get(key) ?? []), i]);
    }
    return [...byPeriod.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => {
        const [y, m] = key.split('-');
        return {
          key,
          title: `Kỳ ${m}/${y}`,
          elec: items.filter(i => i.type === 'ELECTRICITY').length,
          water: items.filter(i => i.type === 'WATER').length,
          data: items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
        };
      });
  }, [histInvoices, histPeriod]);

  /** Các kỳ CÓ dữ liệu — dựng từ chính danh sách nên không có chip rỗng. */
  const histPeriods = useMemo(() => {
    const set = new Set(histInvoices.map(i => `${i.year}-${String(i.month).padStart(2, '0')}`));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [histInvoices]);

  const renderHistoryTab = () => (
    <SectionList
      sections={histSections}
      keyExtractor={i => String(i.id)}
      contentContainerStyle={styles.tabContent}
      showsVerticalScrollIndicator={false}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <>
          <SectionHeader title="Lịch sử hóa đơn điện / nước đã gửi" />
          {histPeriods.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.histFilterRow}>
              <TouchableOpacity
                style={[styles.histChip, histPeriod === 'all' && styles.histChipActive]}
                onPress={() => setHistPeriod('all')}
              >
                <Text style={[styles.histChipText, histPeriod === 'all' && styles.histChipTextActive]}>Mọi kỳ</Text>
              </TouchableOpacity>
              {histPeriods.map(p => {
                const [y, m] = p.split('-');
                return (
                  <TouchableOpacity
                    key={p}
                    style={[styles.histChip, histPeriod === p && styles.histChipActive]}
                    onPress={() => setHistPeriod(p)}
                  >
                    <Text style={[styles.histChipText, histPeriod === p && styles.histChipTextActive]}>{m}/{y}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </>
      }
      renderSectionHeader={({ section }) => (
        <View style={styles.histSectionHead}>
          <Text style={styles.histSectionTitle}>{section.title}</Text>
          <Text style={styles.histSectionMeta}>
            ⚡ {section.elec} · 💧 {section.water}
          </Text>
        </View>
      )}
      renderItem={({ item }) => {
        const st = UTIL_STATUS[item.status] ?? UTIL_STATUS.PENDING;
        return (
          <View style={styles.historyCard}>
            <View style={styles.historyHeader}>
              <View style={[styles.typeTag, item.type === 'ELECTRICITY' ? styles.typeTagElec : styles.typeTagWater]}>
                <Text style={styles.typeTagText}>{item.type === 'ELECTRICITY' ? '⚡ Điện' : '💧 Nước'}</Text>
              </View>
              <View style={[statusSt.badge, { backgroundColor: st.bg }]}>
                <Text style={[statusSt.badgeText, { color: st.color }]}>{st.label}</Text>
              </View>
            </View>
            <Text style={styles.historyProperty}>
              {item.propertyName}{item.roomNumber ? ` · Phòng ${item.roomNumber}` : ' · Nguyên căn'}
            </Text>
            <Text style={styles.historyPeriod}>
              T{String(item.month).padStart(2, '0')}/{item.year}{item.tenantName ? ` · ${item.tenantName}` : ''}
            </Text>
            <View style={styles.historyFooter}>
              <Text style={styles.historyRooms}>{item.code}</Text>
              <Text style={styles.historyAmount}>{fmt(item.amount)}</Text>
            </View>
          </View>
        );
      }}
      ListEmptyComponent={
        loadingHist ? (
          <View style={styles.empty}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📋</Text>
            <Text style={styles.emptyText}>Chưa có hóa đơn điện/nước nào</Text>
          </View>
        )
      }
      ListFooterComponent={<View style={{ height: 80 }} />}
    />
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ghi chỉ số & Hóa đơn</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={styles.tabBar}>
        {([
          { key: 'electricity', label: '⚡ Điện' },
          { key: 'water',       label: '💧 Nước' },
          { key: 'history',     label: '📋 Lịch sử' },
        ] as { key: MainTab; label: string }[]).map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabItem, activeTab === t.key && styles.tabItemActive]}
            onPress={() => setActiveTab(t.key)}
          >
            <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Nhắc quy tắc gửi — không còn cửa sổ ngày 1–10, chỉ còn "1 khách 1 hoá đơn/kỳ". */}
      {activeTab !== 'history' && (
        <View style={[styles.windowBar, styles.windowBarOpen]}>
          <Text style={[styles.windowBarText, { color: Colors.success }]}>
            ● {UTILITY_WINDOW_TEXT}
          </Text>
        </View>
      )}

      {activeTab === 'electricity' && renderElecTab()}
      {activeTab === 'water'       && renderWaterTab()}
      {activeTab === 'history'     && renderHistoryTab()}

      {/* Camera trong app: chụp → xem lại → "Dùng ảnh này" mới tải lên & đọc số.
          Dùng cho cả web lẫn điện thoại (web không bật được camera qua ImagePicker). */}
      {/* Xem ảnh phóng to — chạm nền hoặc nút ✕ để đóng. Dùng chung cho ảnh hoá đơn
          EVN và ảnh đồng hồ từng phòng. */}
      <Modal visible={!!zoomImage} transparent animationType="fade" onRequestClose={() => setZoomImage(null)}>
        <TouchableOpacity style={styles.zoomOverlay} activeOpacity={1} onPress={() => setZoomImage(null)}>
          {!!zoomImage && (
            <Image source={{ uri: zoomImage }} style={styles.zoomImage} resizeMode="contain" />
          )}
          <TouchableOpacity style={styles.zoomClose} onPress={() => setZoomImage(null)}>
            <Text style={styles.zoomCloseText}>✕ Đóng</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <CameraCaptureModal
        visible={cameraTarget !== null}
        onCapture={(uri) => {
          const target = cameraTarget;
          setCameraTarget(null);
          if (target) void handlePhoto(target, uri);
        }}
        onClose={() => setCameraTarget(null)}
        onUseGalleryInstead={async () => {
          const target = cameraTarget;
          setCameraTarget(null);
          const uri = await pickFromGallery();
          if (target && uri) await handlePhoto(target, uri);
        }}
      />
    </SafeAreaView>
  );
};

// ===================== SUB-COMPONENTS =====================
const StepIndicator: React.FC<{ steps: string[]; current: number }> = ({ steps, current }) => (
  <View style={stepSt.wrap}>
    {steps.map((label, i) => (
      <React.Fragment key={i}>
        <View style={stepSt.item}>
          <View style={[stepSt.dot, i < current && stepSt.dotDone, i === current && stepSt.dotActive]}>
            <Text style={[stepSt.dotText, i > current && stepSt.dotTextIdle]}>
              {i < current ? '✓' : String(i + 1)}
            </Text>
          </View>
          <Text style={[stepSt.label, i === current && stepSt.labelActive]} numberOfLines={1}>{label}</Text>
        </View>
        {i < steps.length - 1 && <View style={[stepSt.line, i < current && stepSt.lineDone]} />}
      </React.Fragment>
    ))}
  </View>
);

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <Text style={secSt.title}>{title}</Text>
);

const EVNDataRow: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <View style={evnSt.row}>
    <Text style={evnSt.label}>{label}</Text>
    <Text style={[evnSt.value, highlight && evnSt.valueHighlight]}>{value}</Text>
  </View>
);

// Trạng thái thanh toán hóa đơn điện/nước ĐÃ gửi của 1 nhà (dữ liệu thật từ BE).
const UTIL_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:   { label: 'Chưa thu', color: Colors.warning, bg: Colors.warningLight },
  PAID:      { label: 'Đã thu',   color: Colors.success, bg: Colors.successLight },
  OVERDUE:   { label: 'Quá hạn',  color: Colors.error,   bg: Colors.errorLight },
  PARTIAL:   { label: 'Một phần', color: Colors.info,    bg: Colors.infoLight },
  CANCELLED: { label: 'Đã huỷ',   color: Colors.textMuted, bg: Colors.background },
};

const SentInvoicePanel: React.FC<{
  propertyId: string | null;
  type: 'ELECTRICITY' | 'WATER';
  reloadKey: number;
}> = ({ propertyId, type, reloadKey }) => {
  const [list, setList] = useState<ManagerInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const label = type === 'ELECTRICITY' ? 'điện' : 'nước';

  useEffect(() => {
    if (!propertyId) { setList([]); return; }
    let alive = true;
    setLoading(true);
    realManagerInvoiceService.listInvoices({ type })
      .then(all => {
        if (!alive) return;
        setList(
          all.filter(i => i.propertyId === Number(propertyId))
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
        );
      })
      .catch(() => { if (alive) setList([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [propertyId, type, reloadKey]);

  if (!propertyId) return null;

  const paid   = list.filter(i => i.status === 'PAID').length;
  const unpaid = list.filter(i => i.status === 'PENDING' || i.status === 'OVERDUE').length;

  return (
    <View style={statusSt.wrap}>
      <View style={statusSt.header}>
        <Text style={statusSt.title}>Trạng thái hóa đơn {label} đã gửi</Text>
        {loading && <ActivityIndicator size="small" color={Colors.primary} />}
      </View>

      {list.length === 0 ? (
        <Text style={statusSt.empty}>
          {loading ? 'Đang tải...' : `Chưa gửi hóa đơn ${label} nào cho nhà này.`}
        </Text>
      ) : (
        <>
          <View style={statusSt.statRow}>
            <Text style={[statusSt.statChip, { color: Colors.success }]}>● Đã thu: {paid}</Text>
            <Text style={[statusSt.statChip, { color: Colors.warning }]}>● Chưa thu: {unpaid}</Text>
          </View>
          {list.map(inv => {
            const st = UTIL_STATUS[inv.status] ?? UTIL_STATUS.PENDING;
            return (
              <View key={inv.id} style={statusSt.row}>
                <View style={{ flex: 1 }}>
                  <Text style={statusSt.rowTitle}>
                    {inv.roomNumber ? `Phòng ${inv.roomNumber}` : 'Nhà nguyên căn'} · T{String(inv.month).padStart(2, '0')}/{inv.year}
                  </Text>
                  <Text style={statusSt.rowSub}>
                    {(inv.tenantName || inv.code)} · {fmt(inv.amount)}
                  </Text>
                </View>
                <View style={[statusSt.badge, { backgroundColor: st.bg }]}>
                  <Text style={[statusSt.badgeText, { color: st.color }]}>{st.label}</Text>
                </View>
              </View>
            );
          })}
        </>
      )}
    </View>
  );
};

const PICKER_PAGE_SIZE = 8; // số nhà hiện ban đầu; còn lại mở dần qua nút "Xem thêm"

type PickerFilter = 'all' | PropType;

// Bộ chọn nhà (nhiều phòng / nguyên căn) + xử lý loading / lỗi / rỗng — dùng chung 2 tab.
// Danh sách có thể lên tới hàng trăm nhà nên có tìm kiếm, lọc theo loại, phân trang,
// và tự thu gọn còn 1 thẻ sau khi đã chọn.
const PropertyPicker: React.FC<{
  properties: BillingProperty[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
  showRoomCodes?: boolean;
}> = ({ properties, loading, error, selectedId, onSelect, onRetry, showRoomCodes }) => {
  const [query,      setQuery]      = useState('');
  const [typeFilter, setTypeFilter] = useState<PickerFilter>('all');
  const [pageSize,   setPageSize]   = useState(PICKER_PAGE_SIZE);
  const [expanded,   setExpanded]   = useState(false); // mở lại danh sách khi bấm "Đổi"

  const selected = properties.find(p => p.id === selectedId) ?? null;

  // Đổi bộ lọc thì xem lại từ đầu, tránh giữ trạng thái "đã mở rộng" của lần tìm trước.
  useEffect(() => { setPageSize(PICKER_PAGE_SIZE); }, [query, typeFilter]);

  const q = normalizeVi(query);

  const filtered = useMemo(() => {
    return properties.filter(p => {
      if (typeFilter !== 'all' && p.type !== typeFilter) return false;
      if (!q) return true;
      if (normalizeVi(p.name).includes(q)) return true;
      // tìm được cả khi manager chỉ nhớ mã phòng hoặc tên khách thuê
      return p.rooms.some(r => normalizeVi(r.code).includes(q) || normalizeVi(r.tenantName).includes(q));
    });
  }, [properties, q, typeFilter]);

  if (loading) {
    return (
      <View style={styles.pickerState}>
        <ActivityIndicator color={Colors.primary} />
        <Text style={styles.pickerStateText}>Đang tải danh sách...</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.pickerState}>
        <Text style={styles.pickerStateEmoji}>⚠️</Text>
        <Text style={styles.pickerStateText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryBtnText}>Thử lại</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (properties.length === 0) {
    return (
      <View style={styles.pickerState}>
        <Text style={styles.pickerStateEmoji}>🏢</Text>
        <Text style={styles.pickerStateText}>
          Chưa có nhà nào đang có khách thuê.{'\n'}
          Nhà trống không hiển thị vì không phát sinh tiền điện / nước.
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryBtnText}>Tải lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const metaOf = (p: BillingProperty) =>
    p.type === 'whole_house'
      ? `Nguyên căn · ${p.rooms[0]?.tenantName ?? 'Chưa có khách thuê'}`
      : showRoomCodes && p.rooms.length > 0
        ? `${p.rooms.length} phòng · ${p.rooms.map(r => r.code).join(', ')}`
        : `${p.rooms.length} phòng đang thuê`;

  // ── Đã chọn: thu gọn còn 1 thẻ, giấu cả danh sách đi ──
  if (selected && !expanded) {
    return (
      /**
       * CẢ THẺ bấm được để mở lại danh sách, không chỉ mỗi chữ "Đổi".
       *
       * Chọn nhầm nhà là chuyện thường, mà nút "Đổi" là một chip nhỏ nằm sát mép phải —
       * bấm trượt vài lần là người dùng tưởng khoá luôn rồi thoát ra vào lại màn hình
       * (đúng thứ đã xảy ra khi test). Vùng bấm giờ là toàn bộ thẻ, chip "Đổi" giữ lại
       * làm dấu hiệu nhìn thấy được là "cái này đổi được".
       */
      <TouchableOpacity
        style={styles.selectedCard}
        activeOpacity={0.7}
        onPress={() => setExpanded(true)}
      >
        <Text style={styles.selectedIcon}>{selected.type === 'whole_house' ? '🏠' : '🏢'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.selectedName} numberOfLines={1}>{selected.name}</Text>
          <Text style={styles.selectedMeta} numberOfLines={1}>{metaOf(selected)}</Text>
        </View>
        <View style={styles.changeBtn} pointerEvents="none">
          <Text style={styles.changeBtnText}>Đổi</Text>
        </View>
      </TouchableOpacity>
    );
  }

  const visible = filtered.slice(0, pageSize);
  const multi   = visible.filter(p => p.type === 'multi_room');
  const whole   = visible.filter(p => p.type === 'whole_house');
  const counts  = {
    all: properties.length,
    multi_room: properties.filter(p => p.type === 'multi_room').length,
    whole_house: properties.filter(p => p.type === 'whole_house').length,
  };

  const pick = (id: string) => {
    onSelect(id);
    setExpanded(false);
    setQuery('');
  };

  const row = (prop: BillingProperty) => {
    // Khi khớp nhờ phòng/khách thuê thì nói rõ khớp ở đâu, không bắt manager tự đoán.
    const hits = q && !normalizeVi(prop.name).includes(q)
      ? prop.rooms
          .filter(r => normalizeVi(r.code).includes(q) || normalizeVi(r.tenantName).includes(q))
          .slice(0, 3)
          .map(r => `${r.code} · ${r.tenantName}`)
      : [];
    return (
      <TouchableOpacity
        key={prop.id}
        style={[styles.propertyRow, selectedId === prop.id && styles.propertyRowActive]}
        onPress={() => pick(prop.id)}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.propertyName} numberOfLines={1}>{prop.name}</Text>
          <Text style={styles.propertyMeta} numberOfLines={1}>{metaOf(prop)}</Text>
          {hits.length > 0 && (
            <Text style={styles.propertyHit} numberOfLines={1}>🔎 Khớp: {hits.join(' · ')}</Text>
          )}
        </View>
        {selectedId === prop.id && <Text style={styles.checkMark}>✓</Text>}
      </TouchableOpacity>
    );
  };

  const chip = (key: PickerFilter, label: string, n: number) => (
    <TouchableOpacity
      key={key}
      style={[styles.chip, typeFilter === key && styles.chipActive]}
      onPress={() => setTypeFilter(key)}
    >
      <Text style={[styles.chipText, typeFilter === key && styles.chipTextActive]}>{label} {n}</Text>
    </TouchableOpacity>
  );

  return (
    <>
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm theo tên nhà, phòng, khách thuê..."
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.searchClear}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.chipRow}>
        {chip('all', 'Tất cả', counts.all)}
        {chip('multi_room', '🏢 Nhiều phòng', counts.multi_room)}
        {chip('whole_house', '🏠 Nguyên căn', counts.whole_house)}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.pickerState}>
          <Text style={styles.pickerStateEmoji}>🔍</Text>
          <Text style={styles.pickerStateText}>
            Không tìm thấy nhà nào khớp{query ? ` “${query}”` : ''}.
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => { setQuery(''); setTypeFilter('all'); }}
          >
            <Text style={styles.retryBtnText}>Xoá bộ lọc</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={styles.resultCount}>
            Hiện {visible.length}/{filtered.length} nhà
            {filtered.length !== properties.length ? ` (lọc từ ${properties.length})` : ''}
          </Text>

          {multi.length > 0 && <Text style={styles.groupLabel}>🏢 Nhà nhiều phòng</Text>}
          {multi.map(row)}

          {whole.length > 0 && (
            <Text style={[styles.groupLabel, multi.length > 0 && { marginTop: Spacing.md }]}>
              🏠 Nhà nguyên căn
            </Text>
          )}
          {whole.map(row)}

          {filtered.length > visible.length && (
            <TouchableOpacity
              style={styles.moreBtn}
              onPress={() => setPageSize(n => n + PICKER_PAGE_SIZE)}
            >
              <Text style={styles.moreBtnText}>
                Xem thêm {Math.min(PICKER_PAGE_SIZE, filtered.length - visible.length)} nhà ↓
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {selected && (
        <TouchableOpacity style={styles.cancelChangeBtn} onPress={() => setExpanded(false)}>
          <Text style={styles.cancelChangeText}>Huỷ đổi · giữ “{selected.name}”</Text>
        </TouchableOpacity>
      )}
    </>
  );
};

// ===================== STYLES =====================
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, ...Shadow.sm,
  },
  // width cố định 70 làm chữ "← Quay lại" xuống dòng trên web → dùng minWidth + 1 dòng.
  backText: { color: Colors.primary, fontWeight: '600', fontSize: 15, minWidth: 80 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },

  tabBar: { flexDirection: 'row', backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  windowBar: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  windowBarOpen: { backgroundColor: Colors.successLight },
  windowBarClosed: { backgroundColor: Colors.errorLight },
  windowBarText: { fontSize: 12, fontWeight: '700', lineHeight: 17 },
  /** Nút gửi khi ngoài cửa sổ chốt sổ — vẫn bấm được để hiện lý do, nhưng nhìn là biết khoá. */
  btnLocked: { backgroundColor: Colors.textMuted, opacity: 0.7 },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabLabel: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  tabLabelActive: { color: Colors.primary },

  // Giới hạn bề ngang: trên web (manager hay mở ở laptop) form kéo giãn hết 1900px
  // thì label nằm tít bên trái còn ô nhập dài lê thê, rất khó đọc.
  tabContent: { padding: Spacing.lg, width: '100%', maxWidth: 760, alignSelf: 'center' },

  groupLabel: {
    fontSize: 11, fontWeight: '800', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: Spacing.xs, marginTop: Spacing.xs,
  },

  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm },
  cardDesc: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.md, lineHeight: 20 },

  uploadBtn: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg,
    borderWidth: 1.5, borderColor: Colors.primary, borderStyle: 'dashed',
    padding: Spacing.lg, alignItems: 'center', marginBottom: Spacing.md,
  },
  uploadBtnIcon: { fontSize: 32, marginBottom: Spacing.xs },
  uploadBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  uploadBtnSub:  { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginTop: 4 },
  scanningRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  scanningText:  { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  evnThumb:      { width: '100%', height: 200, borderRadius: BorderRadius.md, marginBottom: Spacing.md, backgroundColor: Colors.background },

  // ── Ảnh đã tải: nút gỡ / chụp lại ──
  thumbWrap: { position: 'relative', marginBottom: Spacing.sm },
  thumbRemoveBtn: {
    position: 'absolute', top: Spacing.xs, right: Spacing.xs,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  thumbRemoveIcon: { color: Colors.white, fontSize: 14, fontWeight: '900', lineHeight: 16 },
  thumbActions:    { flexDirection: 'row', gap: Spacing.sm },
  thumbActionBtn: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  thumbActionText:       { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  thumbActionDanger:     { borderColor: Colors.error },
  thumbActionDangerText: { color: Colors.error },

  // Ảnh đồng hồ 1 phòng (gửi kèm hoá đơn)
  meterThumbRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    padding: Spacing.sm, marginTop: Spacing.xs,
  },
  meterThumb:      { width: 48, height: 48, borderRadius: BorderRadius.sm, backgroundColor: Colors.border },
  meterThumbLabel: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  meterThumbHint:  { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  meterThumbRemove: {
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.error,
  },
  meterThumbRemoveText: { fontSize: 12, fontWeight: '700', color: Colors.error },

  evnResult: {
    backgroundColor: '#F0FDF4', borderRadius: BorderRadius.md,
    padding: Spacing.base, marginTop: Spacing.sm,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  evnResultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  evnResultTitle:  { fontSize: 13, fontWeight: '700', color: Colors.success },
  editLink:        { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  evnEditForm:     { marginTop: Spacing.md },

  // Trạng thái "chờ admin đẩy hoá đơn EVN" / lỗi tải — thay cho form nhập tay cũ.
  evnWaitBox:   { alignItems: 'center', paddingVertical: Spacing.lg, paddingHorizontal: Spacing.sm },
  evnWaitEmoji: { fontSize: 40, marginBottom: Spacing.sm },
  evnWaitTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.xs },
  evnWaitText:  { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19 },

  infoBanner: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md,
    padding: Spacing.sm, marginBottom: Spacing.md,
    borderLeftWidth: 3, borderLeftColor: Colors.primary,
  },
  infoBannerText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },

  propertyRow: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing.md,
    backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  propertyRowActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },

  pickerState:      { alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.sm },
  pickerStateEmoji: { fontSize: 32 },
  pickerStateText:  { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
  retryBtn:         { marginTop: Spacing.xs, backgroundColor: Colors.primary, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  retryBtnText:     { color: Colors.white, fontWeight: '800', fontSize: 13 },

  propertyName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  propertyMeta: { fontSize: 12, color: Colors.textMuted, marginRight: Spacing.sm },
  propertyHit:  { fontSize: 11, color: Colors.primary, marginTop: 2, marginRight: Spacing.sm },
  checkMark:    { fontSize: 16, color: Colors.primary, fontWeight: '900' },

  // ── Bộ chọn nhà: tìm kiếm / lọc / phân trang ──
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  searchIcon:  { fontSize: 14, marginRight: Spacing.xs },
  searchInput: { flex: 1, paddingVertical: Spacing.sm, fontSize: 14, color: Colors.textPrimary },
  searchClear: { fontSize: 15, color: Colors.textMuted, paddingHorizontal: Spacing.xs, fontWeight: '700' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  chipActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText:       { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },

  resultCount: { fontSize: 11, color: Colors.textMuted, marginBottom: Spacing.xs },

  moreBtn: {
    alignItems: 'center', paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md, borderWidth: 1, borderStyle: 'dashed',
    borderColor: Colors.primary, marginTop: Spacing.xs,
  },
  moreBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  // Thẻ gọn hiển thị nhà đang chọn (thay cho cả danh sách dài)
  selectedCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primaryBg, borderWidth: 1, borderColor: Colors.primary,
    borderRadius: BorderRadius.md, padding: Spacing.md,
  },
  selectedIcon: { fontSize: 22 },
  selectedName: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  selectedMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  changeBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: BorderRadius.full, backgroundColor: Colors.primary,
  },
  changeBtnText: { fontSize: 12, fontWeight: '800', color: Colors.white },

  cancelChangeBtn:  { alignItems: 'center', paddingVertical: Spacing.sm, marginTop: Spacing.xs },
  cancelChangeText: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },

  progressRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  progressText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  sendAllBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
  },
  sendAllBtnText: { fontSize: 12, fontWeight: '700', color: Colors.white },

  roomCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm },
  roomCardSent: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' },
  roomCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.xs },
  roomCode:   { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  roomTenant: { fontSize: 12, color: Colors.textSecondary },
  prevReading:{ fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.xs },
  readingRow: { flexDirection: 'row', alignItems: 'center' },

  badge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  badgeDone:   { backgroundColor: '#F0FDF4' },
  badgePending:{ backgroundColor: Colors.background },
  badgeSent:   { backgroundColor: Colors.success },
  badgeText:   { fontSize: 11, fontWeight: '700' },

  sentSummary: {
    backgroundColor: '#F0FDF4', borderRadius: BorderRadius.sm,
    padding: Spacing.sm, marginTop: Spacing.xs,
  },
  sentSummaryText: { fontSize: 13, color: Colors.success, fontWeight: '600' },

  calcPreview: { backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.sm, padding: Spacing.xs, marginTop: Spacing.xs },
  calcPreviewText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },

  sendRoomBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm, alignItems: 'center', marginTop: Spacing.sm,
  },
  sendRoomBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white },

  summaryCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm,
    borderLeftWidth: 4, borderLeftColor: Colors.primary,
  },
  summaryTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm },
  reviewRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginBottom: Spacing.xs, ...Shadow.sm,
  },
  reviewRoomCode: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  reviewDetail:   { fontSize: 12, color: Colors.textMuted },
  reviewFee:      { fontSize: 15, fontWeight: '800', color: Colors.primary },
  reviewTotal: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginVertical: Spacing.md,
  },
  reviewTotalLabel: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  reviewTotalVal:   { fontSize: 20, fontWeight: '800', color: Colors.primary },

  formLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4, marginTop: Spacing.sm },
  req: { color: Colors.error },
  input: {
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, padding: Spacing.sm,
    fontSize: 15, color: Colors.textPrimary, marginBottom: Spacing.xs,
  },

  // ── Form chốt nước (bước 1) ──
  formCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl, padding: Spacing.base,
    marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  formCardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.xs },
  formCardIcon: {
    width: 36, height: 36, borderRadius: BorderRadius.md,
    backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center',
  },
  formCardTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  formCardSub: { fontSize: 12, color: Colors.textMuted, lineHeight: 17, marginTop: 2 },

  fieldRow: { flexDirection: 'row', gap: Spacing.sm },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm,
  },
  inputFlex: { flex: 1, paddingVertical: Spacing.sm, fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  inputSuffix: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },

  estimateBox: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginTop: Spacing.sm,
  },
  estimateText: { fontSize: 12, color: Colors.primary },
  estimateStrong: { fontWeight: '800' },

  periodChips: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  periodChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  periodChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  periodChipText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  periodChipTextActive: { color: Colors.primary },

  primaryBtnDisabled: { backgroundColor: '#E2E8F0' },
  primaryBtnTextDisabled: { color: Colors.textMuted },
  helperText: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.sm },
  ocrBtn: { backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  ocrBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  actionRow: { flexDirection: 'row', marginTop: Spacing.md },
  primaryBtn: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, alignItems: 'center' },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  secondaryBtn: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  sendBtn: { backgroundColor: Colors.success, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, alignItems: 'center' },
  sendBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  doneEmoji: { fontSize: 64, marginBottom: Spacing.md },
  doneTitle: { fontSize: 22, fontWeight: '800', color: Colors.success, marginBottom: Spacing.sm },
  doneSub:   { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.xl },

  historyCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.sm, ...Shadow.sm },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  typeTag:     { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  typeTagElec: { backgroundColor: '#FEF9C3' },
  typeTagWater:{ backgroundColor: '#DBEAFE' },
  typeTagText: { fontSize: 12, fontWeight: '700' },
  historyDate:    { fontSize: 12, color: Colors.textMuted },
  historyProperty:{ fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  historyPeriod:  { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  historyFooter:  { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  historyRooms:   { fontSize: 12, color: Colors.textMuted },
  historyAmount:  { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },

  // Tab Lịch sử: chip lọc kỳ + tiêu đề mỗi kỳ (13/08/2026).
  histFilterRow: { flexDirection: 'row', gap: Spacing.xs, paddingBottom: Spacing.sm },
  histChip: {
    height: 30, paddingHorizontal: 12, borderRadius: BorderRadius.full,
    justifyContent: 'center', backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border,
  },
  histChipActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  histChipText:       { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  histChipTextActive: { color: Colors.white },
  histSectionHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Spacing.md, paddingBottom: Spacing.xs,
  },
  histSectionTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  histSectionMeta:  { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },

  // Xem ảnh phóng to (13/08/2026) — ảnh hoá đơn EVN và ảnh đồng hồ đều chữ nhỏ.
  zoomOverlay: {
    flex: 1, backgroundColor: 'rgba(2,6,23,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  zoomImage: { width: '96%', height: '85%' },
  zoomClose: {
    position: 'absolute', top: 44, right: 20,
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: BorderRadius.full,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  zoomCloseText: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },

  empty: { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 40, marginBottom: Spacing.sm },
  emptyText:  { fontSize: 15, color: Colors.textMuted },
});

const stepSt = StyleSheet.create({
  // Bó gọn lại giữa màn: trước đây trải hết bề ngang nên đường nối dài ngoằng
  // còn nhãn thì 10px bé xíu, nhìn không ra đang ở bước nào.
  wrap: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center',
    width: '100%', maxWidth: 460, alignSelf: 'center', marginBottom: Spacing.lg,
  },
  item: { alignItems: 'center', width: 76 },
  dot: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: Colors.white, borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 5,
  },
  dotActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dotDone:   { backgroundColor: Colors.success, borderColor: Colors.success },
  dotText:   { fontSize: 12, fontWeight: '800', color: Colors.white },
  dotTextIdle: { color: Colors.textMuted },
  label:       { fontSize: 11, color: Colors.textMuted, textAlign: 'center', fontWeight: '600' },
  labelActive: { color: Colors.primary, fontWeight: '800' },
  line:     { flex: 1, height: 2, backgroundColor: Colors.border, marginTop: 14, minWidth: 12 },
  lineDone: { backgroundColor: Colors.success },
});

const secSt = StyleSheet.create({
  title: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm, marginTop: Spacing.sm },
});

const evnSt = StyleSheet.create({
  row:            { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xs },
  label:          { fontSize: 13, color: Colors.textSecondary },
  value:          { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  valueHighlight: { color: Colors.success, fontSize: 15, fontWeight: '800' },
});

const statusSt = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  title:  { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  empty:  { fontSize: 13, color: Colors.textMuted },
  statRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.sm },
  statChip: { fontSize: 12, fontWeight: '700' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  rowTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  rowSub:   { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  badge:    { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  badgeText:{ fontSize: 11, fontWeight: '700' },
});
