import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, FlatList, ActivityIndicator, Image, Platform,
} from 'react-native';
import { showAlert } from '@/utils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import {
  Colors, Spacing, BorderRadius, Shadow,
  UTILITY_CYCLE, UTILITY_WINDOW_TEXT, isUtilityWindowOpen,
  utilityWindowDaysLeft, utilityWindowReason,
} from '@/constants';
import { managerPropertyService } from '@/services/manager/propertyService';
import { realPropertyService } from '@/services/manager/propertyApi';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';
import { realManagerInvoiceService, ManagerInvoice } from '@/services/manager/invoiceService';
import { uploadImageToCloudinary } from '@/services/core/cloudinary';

// ===================== TYPES =====================
type MainTab  = 'electricity' | 'water' | 'history';
type ElecStep = 'select_property' | 'evn_upload' | 'room_readings' | 'review' | 'done';
type WaterStep = 'bill_entry' | 'room_readings' | 'review' | 'done';

interface EVNData {
  totalKwh: number;
  totalAmount: number;
  billingPeriod: string;
  imageUploaded: boolean;
}

interface RoomMeterReading {
  roomId: string;
  roomCode: string;
  tenantName: string;
  prevReading: number;
  newReading: string;
  hasPhoto: boolean;
  meterImageUrl?: string;  // ảnh đồng hồ đã chụp (Cloudinary)
  consumption?: number;
  fee?: number;
  sent: boolean;           // đã gửi hóa đơn cho phòng này chưa
}

interface WaterBillData {
  totalAmount: number;
  billingPeriod: string;
  pricePerM3: number;
}

interface RoomWaterReading {
  roomId: string;
  roomCode: string;
  tenantName: string;
  prevReading: number;
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
  // Chỉ số cũ mặc định = chỉ số ghi lúc ĐÓN KHÁCH (initialElectric/WaterReading trên HĐ).
  // Đây là mốc cho hoá đơn KỲ ĐẦU. Kỳ 2 trở đi lẽ ra lấy chỉ số kỳ trước — BE chưa có
  // endpoint đọc lại chỉ số kỳ gần nhất, nên manager sửa tay (xem doc/ gap).
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

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';
const onlyDigits = (s: string) => (s || '').replace(/[^\d]/g, '');
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
const monthPeriod = (offset = 0, base = new Date()) => {
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

// Ngưỡng lọc số vô lý khi đọc hoá đơn (số bảng kê, mã số thuế, năm... hay bị OCR trộn vào).
const MAX_PLAUSIBLE_KWH = 100_000;

/**
 * Đọc best-effort hoá đơn EVN từ kết quả OCR (endpoint /ocr/meter trả rawText + numbers).
 * EVN tính điện bậc thang nên KHÔNG có đơn giá sẵn → chỉ lấy Tổng kWh, Tổng tiền, Kỳ.
 * Luôn cần manager xác nhận lại (BE chưa có parser hoá đơn riêng — xem doc/ gap #8).
 *
 * Dò nhãn trên bản BỎ DẤU vì nhiều OCR trả tiếng Việt mất dấu; chữ số không đổi khi bỏ dấu
 * nên vẫn lấy đúng giá trị.
 */
const parseEvnInvoice = (
  ocr: { reading?: string; numbers?: string[]; rawText?: string },
): { totalKwh: string; totalAmount: string; billingPeriod: string } => {
  const flat = normalizeVi((ocr.rawText || '').replace(/\s+/g, ' '));
  const out = { totalKwh: '', totalAmount: '', billingPeriod: '' };

  // ── Kỳ hoá đơn: "tu 07/04/2022 den 06/05/2022", hoặc fallback "thang 5/2022" ──
  const range = flat.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*(?:den|-|–|~)\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (range) out.billingPeriod = `${range[1]} – ${range[2]}`;
  else {
    const m = flat.match(/thang\s*(\d{1,2})\s*\/\s*(\d{4})/);
    if (m) out.billingPeriod = `Tháng ${m[1]}/${m[2]}`;
  }

  // ── Tổng tiền: ưu tiên dòng "tổng cộng tiền thanh toán" / "total payment" ──
  const amt =
    flat.match(/tong cong tien thanh toan[^\d]*([\d.,]+)/) ||
    flat.match(/total payment[^\d]*([\d.,]+)/) ||
    flat.match(/tong cong[^\d]*([\d.,]+)/) ||
    flat.match(/cong tien hang[^\d]*([\d.,]+)/);
  if (amt) out.totalAmount = onlyDigits(amt[1]);

  if (!out.totalAmount && ocr.numbers?.length) {
    // Fallback: chỉ tin số có dấu phân cách nghìn ("399.585"). Loại được số bảng kê /
    // mã số thuế viết liền (11818865) vốn hay lớn hơn cả tổng tiền.
    const moneyLike = ocr.numbers
      .filter(n => /\d{1,3}([.,]\d{3})+/.test(n))
      .map(n => Number(onlyDigits(n)))
      .filter(n => n > 0);
    if (moneyLike.length) out.totalAmount = String(Math.max(...moneyLike));
  }

  // ── Tổng kWh ──
  // Xoá ngày tháng TRƯỚC khi dò, nếu không "2022" trong "06/05/2022 kWh" bị đọc thành số kWh
  // → đơn giá sai cả chục lần. Sau đó ưu tiên "kwh <số>" (cột ĐVT rồi tới cột Số lượng).
  const noDates = flat
    .replace(/\d{1,2}\/\d{1,2}\/\d{4}/g, ' ')
    .replace(/\d{1,2}\/\d{4}/g, ' ');
  const kwh =
    noDates.match(/kwh\s*[:\-]?\s*([\d.,]+)/) ||
    noDates.match(/([\d.,]+)\s*kwh/) ||
    noDates.match(/tieu thu[^\d]*?([\d.,]+)/);
  if (kwh) {
    const n = Number(onlyDigits(kwh[1]));
    if (n > 0 && n <= MAX_PLAUSIBLE_KWH) out.totalKwh = String(n);
  }

  return out;
};

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
  const [activeTab, setActiveTab] = useState<MainTab>('electricity');
  // Cửa sổ chốt sổ: chỉ gửi hoá đơn điện/nước được trong ngày 1–10 hằng tháng,
  // để mọi nhà chốt cùng một kỳ (xem @/constants/utilityCycle).
  const windowOpen = isUtilityWindowOpen();
  const windowClosedReason = utilityWindowReason();
  const daysLeft = utilityWindowDaysLeft();
  /**
   * Chặn gửi hoá đơn khi: (1) ngoài cửa sổ ngày 1–10, hoặc (2) kỳ này đã thu đủ.
   * Trả true = bị chặn. Luôn nói rõ lý do thay vì để nút im lặng.
   */
  const blockedFromSending = (type: 'ELECTRICITY' | 'WATER') => {
    if (!windowOpen) {
      showAlert('Đã chốt sổ kỳ này', windowClosedReason ?? UTILITY_WINDOW_TEXT);
      return true;
    }
    const settled = type === 'ELECTRICITY' ? elecSettled : waterSettled;
    if (settled) {
      showAlert(
        'Kỳ này đã chốt xong',
        `Khách đã thanh toán đủ hoá đơn ${type === 'ELECTRICITY' ? 'điện' : 'nước'} của kỳ này. `
        + 'Hệ thống khoá gửi lại để tránh trùng hoá đơn — sẽ mở lại vào kỳ thanh toán tháng sau.',
      );
      return true;
    }
    return false;
  };
  // Tăng mỗi lần gửi hóa đơn để panel trạng thái tự tải lại.
  const [utilReloadKey, setUtilReloadKey] = useState(0);
  // Lịch sử hóa đơn điện/nước đã gửi (toàn bộ nhà) — dữ liệu thật từ BE.
  const [histInvoices, setHistInvoices] = useState<ManagerInvoice[]>([]);
  const [loadingHist,  setLoadingHist]  = useState(false);

  // ── Electricity state ──────────────────────────────────────────────────────
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [evnData,            setEvnData]            = useState<EVNData | null>(null);
  const [elecStep,           setElecStep]           = useState<ElecStep>('select_property');
  const [roomElecReadings,   setRoomElecReadings]   = useState<RoomMeterReading[]>([]);
  const [editingEvn,         setEditingEvn]         = useState(false);
  const [evnEditForm,        setEvnEditForm]        = useState({ totalKwh: '', totalAmount: '', billingPeriod: '' });
  const [evnImageUrl,        setEvnImageUrl]        = useState('');           // ảnh hoá đơn EVN
  const [evnScanning,        setEvnScanning]        = useState(false);        // đang upload + OCR hoá đơn
  const [ocrRoomId,          setOcrRoomId]          = useState<string | null>(null); // phòng đang OCR đồng hồ

  // ── Water state ────────────────────────────────────────────────────────────
  const [waterPropertyId,  setWaterPropertyId]  = useState<string | null>(null);
  const [waterBillData,    setWaterBillData]    = useState<WaterBillData | null>(null);
  const [waterStep,        setWaterStep]        = useState<WaterStep>('bill_entry');
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
  useEffect(() => { loadHistory(); }, [utilReloadKey, loadHistory]);

  const selectedProperty = properties.find(p => p.id === selectedPropertyId);
  const waterProperty    = properties.find(p => p.id === waterPropertyId);
  const isWholeHouse     = selectedProperty?.type === 'whole_house';

  // ── Khoá theo kỳ ───────────────────────────────────────────────────────────
  // Kỳ đã gửi hoá đơn VÀ khách đã thanh toán hết → chốt sổ, không gửi lại được.
  // Mở lại khi sang kỳ sau (tháng mới → chưa có hoá đơn nào của kỳ đó).
  const periodSettled = useCallback((propId: string | null, type: 'ELECTRICITY' | 'WATER') => {
    if (!propId) return false;
    const now = new Date();
    const list = histInvoices.filter(i =>
      i.type === type
      && i.propertyId === Number(propId)
      && i.month === now.getMonth() + 1
      && i.year === now.getFullYear());
    return list.length > 0 && list.every(i => (i.status || '').toUpperCase() === 'PAID');
  }, [histInvoices]);

  const elecSettled  = periodSettled(selectedPropertyId, 'ELECTRICITY');
  const waterSettled = periodSettled(waterPropertyId, 'WATER');
  const canSendElec  = windowOpen && !elecSettled;
  const canSendWater = windowOpen && !waterSettled;

  // ── Ảnh + OCR ──────────────────────────────────────────────────────────────
  const pickImage = async (useCamera: boolean): Promise<string | null> => {
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') { showAlert('Lỗi', 'Cần quyền camera.'); return null; }
      const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
      return r.canceled ? null : r.assets[0].uri;
    }
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    return r.canceled ? null : r.assets[0].uri;
  };

  // Hỏi nguồn ảnh (chụp / thư viện) rồi gọi tiếp.
  // Web: Alert nhiều nút không chạy callback → mở thẳng thư viện ảnh.
  const chooseImageSource = (onPick: (useCamera: boolean) => void) => {
    if (Platform.OS === 'web') { onPick(false); return; }
    showAlert('Chọn ảnh', undefined, [
      { text: '📷 Chụp ảnh', onPress: () => onPick(true) },
      { text: '🖼 Chọn từ thư viện', onPress: () => onPick(false) },
      { text: 'Huỷ', style: 'cancel' },
    ]);
  };

  // ── EVN helpers ────────────────────────────────────────────────────────────
  // Tải/chụp hoá đơn EVN -> OCR best-effort -> tự điền form để manager xác nhận.
  const scanEvnInvoice = async (useCamera: boolean) => {
    const uri = await pickImage(useCamera);
    if (!uri) return;
    try {
      setEvnScanning(true);
      const url = await uploadImageToCloudinary(uri);
      setEvnImageUrl(url);

      let parsed = { totalKwh: '', totalAmount: '', billingPeriod: '' };
      // Khi không đọc được, phải phân biệt được 3 nguyên nhân (API lỗi / OCR trả rỗng /
      // parser không khớp) — nếu không thì mọi trường hợp đều ra cùng một thông báo vô dụng.
      let diag = '';
      try {
        // Dùng /ocr/evn-bill (isTable=true, đọc bảng hoá đơn) chứ KHÔNG phải /ocr/meter
        // vốn dành cho ảnh đồng hồ.
        const ocr = await realTenantService.ocrEvnBill(url);
        const rawLen = (ocr?.rawText || '').length;
        if (__DEV__) console.log('[EVN OCR] response:', JSON.stringify(ocr));

        // Ưu tiên parser FE trên rawText: BE lấy "số dài nhất trong 80 ký tự sau nhãn" nên với
        // dòng "kWh 199 - 369.986" nó trả 369.986 làm số kWh. Chỉ dùng số của BE để bù ô còn trống.
        parsed = parseEvnInvoice(ocr);
        const beKwh = Number(ocr?.totalKwh ?? 0);
        const beAmt = Number(ocr?.totalAmount ?? 0);
        if (!parsed.totalKwh && beKwh > 0 && beKwh <= MAX_PLAUSIBLE_KWH) parsed.totalKwh = String(beKwh);
        if (!parsed.totalAmount && beAmt > 0) parsed.totalAmount = String(beAmt);
        if (!parsed.billingPeriod && ocr?.billingPeriod) parsed.billingPeriod = ocr.billingPeriod;

        if (__DEV__) console.log('[EVN OCR] parsed:', parsed);
        diag = rawLen === 0
          ? 'OCR chạy xong nhưng không trả về chữ nào (rawText rỗng) → engine OCR bên BE không đọc được ảnh này.'
          : `OCR đọc được ${rawLen} ký tự nhưng không khớp mẫu hoá đơn EVN (xem log [EVN OCR] trong terminal).`;
      } catch (err: any) {
        const status = err?.response?.status;
        diag = `Gọi API OCR lỗi${status ? ` (HTTP ${status})` : ''}: ${
          err?.response?.data?.message || err?.message || 'không rõ'
        }`;
        if (__DEV__) console.warn('[EVN OCR] lỗi:', diag, err);
      }

      setEvnEditForm(parsed);
      setEvnData({
        totalKwh: Number(parsed.totalKwh) || 0,
        totalAmount: Number(parsed.totalAmount) || 0,
        billingPeriod: parsed.billingPeriod,
        imageUploaded: true,
      });
      setEditingEvn(true); // luôn mở form để manager kiểm tra/sửa
      const got = parsed.totalKwh || parsed.totalAmount || parsed.billingPeriod;
      showAlert(
        got ? 'Đã quét hoá đơn' : 'Đã tải hoá đơn',
        got
          ? 'Hệ thống đã đọc sơ bộ. Vui lòng KIỂM TRA và sửa lại tổng kWh / tổng tiền / kỳ cho đúng hoá đơn.'
          : 'Chưa tự đọc được số liệu từ ảnh. Vui lòng nhập tay tổng kWh, tổng tiền và kỳ thanh toán.'
            + (__DEV__ && diag ? `\n\n[DEV] ${diag}` : ''),
      );
    } catch {
      showAlert('Lỗi', 'Không tải/đọc được ảnh hoá đơn. Bạn có thể nhập tay số liệu.');
    } finally {
      setEvnScanning(false);
    }
  };

  // Xoá ảnh hoá đơn EVN đã tải nhầm/chụp mờ + số liệu OCR đọc từ nó, đưa bước 2 về trạng thái đầu.
  // (Alert nhiều nút không chạy callback trên web — xoá thẳng như chooseImageSource đang làm.)
  const clearEvnImage = () => {
    const doClear = () => {
      setEvnImageUrl('');
      setEvnData(null);
      setEvnEditForm({ totalKwh: '', totalAmount: '', billingPeriod: '' });
      setEditingEvn(false);
    };
    if (Platform.OS === 'web') { doClear(); return; }
    showAlert(
      'Xoá ảnh hoá đơn EVN?',
      'Ảnh và số liệu đã nhận diện (kWh, tổng tiền, kỳ) sẽ bị xoá. Bạn có thể tải/chụp lại ảnh khác.',
      [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Xoá', style: 'destructive', onPress: doClear },
      ],
    );
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

  const saveEvnEdit = () => {
    const kwh = Number(onlyDigits(evnEditForm.totalKwh));
    const amt = Number(onlyDigits(evnEditForm.totalAmount));
    if (!kwh || !amt || !evnEditForm.billingPeriod.trim()) {
      showAlert('Thiếu dữ liệu', 'Vui lòng điền đầy đủ thông tin hóa đơn EVN.');
      return;
    }
    setEvnData({ totalKwh: kwh, totalAmount: amt, billingPeriod: evnEditForm.billingPeriod, imageUploaded: true });
    setEditingEvn(false);
  };

  const initRoomElecReadings = (propId: string) => {
    const prop = properties.find(p => p.id === propId);
    if (!prop) return;
    setRoomElecReadings(prop.rooms.map(r => ({
      roomId: r.id, roomCode: r.code, tenantName: r.tenantName,
      prevReading: r.prevElec, newReading: '', hasPhoto: false, sent: false,
    })));
    setElecStep('room_readings');
  };

  // Chụp/chọn ảnh đồng hồ điện 1 phòng -> upload + OCR -> tự điền chỉ số mới.
  const captureRoomMeter = async (roomId: string, useCamera: boolean) => {
    const uri = await pickImage(useCamera);
    if (!uri) return;
    try {
      setOcrRoomId(roomId);
      const url = await uploadImageToCloudinary(uri);
      let reading = '';
      try {
        const ocr = await realTenantService.ocrMeter(url);
        reading = onlyDigits(ocr.reading || '');
      } catch {
        /* OCR lỗi -> nhập tay */
      }
      setRoomElecReadings(prev => prev.map(r =>
        r.roomId === roomId
          ? { ...r, newReading: reading || r.newReading, hasPhoto: true, meterImageUrl: url }
          : r,
      ));
      if (!reading) showAlert('OCR', 'Chưa đọc được chỉ số từ ảnh — vui lòng nhập tay.');
    } catch {
      showAlert('Lỗi', 'Không tải/đọc được ảnh đồng hồ. Vui lòng nhập tay.');
    } finally {
      setOcrRoomId(null);
    }
  };

  // Cập nhật 1 phòng trong danh sách chỉ số điện (nhập tay chỉ số cũ / mới).
  const updateRoomElec = (roomId: string, patch: Partial<RoomMeterReading>) =>
    setRoomElecReadings(prev => prev.map(r => (r.roomId === roomId ? { ...r, ...patch } : r)));

  // Gửi hóa đơn ĐIỆN (riêng) cho 1 phòng cụ thể (multi-room)
  const sendSingleRoomElec = async (roomId: string) => {
    if (blockedFromSending('ELECTRICITY')) return;
    if (!evnData || !selectedProperty) return;
    const room = roomElecReadings.find(r => r.roomId === roomId);
    if (!room) return;
    const newVal = Number(room.newReading);
    if (!newVal || newVal <= room.prevReading) {
      showAlert('Chỉ số không hợp lệ', 'Chỉ số mới phải lớn hơn chỉ số cũ.');
      return;
    }
    // Đơn giá 1 kWh = tổng tiền EVN ÷ tổng kWh ghi trên hoá đơn nhà nước.
    const feePerKwh   = evnData.totalKwh > 0 ? evnData.totalAmount / evnData.totalKwh : 0;
    const consumption = Math.max(newVal - room.prevReading, 0);
    const fee         = Math.round(consumption * feePerKwh);

    try {
      await realManagerInvoiceService.createRoomUtilityInvoice(
        Number(selectedProperty.id), Number(room.roomId),
        {
          type: 'ELECTRICITY', billingPeriod: evnData.billingPeriod,
          prevReading: room.prevReading, newReading: newVal, consumption,
          unitPrice: Math.round(feePerKwh), amount: fee, meterImageUrl: room.meterImageUrl,
        },
      );
      setRoomElecReadings(prev => prev.map(r =>
        r.roomId === roomId ? { ...r, consumption, fee, sent: true } : r,
      ));
      setUtilReloadKey(k => k + 1);
      showAlert('Đã gửi', `Hóa đơn điện phòng ${room.roomCode} · ${fmt(fee)} đã gửi cho ${room.tenantName}.`);
    } catch (e: any) {
      showAlert('Lỗi', e?.response?.data?.message || e?.message || 'Không gửi được hóa đơn điện.');
    }
  };

  // Gửi hóa đơn ĐIỆN (riêng) cho tất cả phòng chưa gửi (multi-room)
  const sendAllUnsent = async () => {
    if (blockedFromSending('ELECTRICITY')) return;
    if (!evnData || !selectedProperty) return;
    const unsent = roomElecReadings.filter(r => !r.sent && r.newReading && Number(r.newReading) > r.prevReading);
    if (!unsent.length) { showAlert('Thông báo', 'Tất cả phòng đã được gửi hoặc chưa nhập chỉ số hợp lệ.'); return; }

    // Đơn giá 1 kWh = tổng tiền EVN ÷ tổng kWh ghi trên hoá đơn nhà nước.
    const feePerKwh = evnData.totalKwh > 0 ? evnData.totalAmount / evnData.totalKwh : 0;
    const now = new Date().toISOString().split('T')[0];

    try {
      await Promise.all(unsent.map(r => {
        const consumption = Math.max(Number(r.newReading) - r.prevReading, 0);
        const fee = Math.round(consumption * feePerKwh);
        return realManagerInvoiceService.createRoomUtilityInvoice(
          Number(selectedProperty.id), Number(r.roomId),
          {
            type: 'ELECTRICITY', billingPeriod: evnData.billingPeriod,
            prevReading: r.prevReading, newReading: Number(r.newReading), consumption,
            unitPrice: Math.round(feePerKwh), amount: fee, meterImageUrl: r.meterImageUrl,
          },
        );
      }));

      let total = 0;
      setRoomElecReadings(prev => prev.map(r => {
        if (!r.sent && r.newReading && Number(r.newReading) > r.prevReading) {
          const consumption = Math.max(Number(r.newReading) - r.prevReading, 0);
          const fee = Math.round(consumption * feePerKwh);
          total += fee;
          return { ...r, consumption, fee, sent: true };
        }
        return r;
      }));

      setHistoryEntries(prev => [{
        id: `he-${Date.now()}`, type: 'electricity',
        propertyName: selectedProperty.name, billingPeriod: evnData.billingPeriod,
        totalAmount: total, roomCount: unsent.length, sentAt: now,
      }, ...prev]);

      setUtilReloadKey(k => k + 1);
      setElecStep('done');
      showAlert('Đã gửi', `Đã gửi hóa đơn điện cho ${unsent.length} phòng.`);
    } catch (e: any) {
      showAlert('Lỗi', e?.response?.data?.message || e?.message || 'Không gửi được hóa đơn điện.');
    }
  };

  // Gửi hóa đơn ĐIỆN (riêng) cho nhà nguyên căn (whole_house)
  const sendWholeHouseElec = async () => {
    if (blockedFromSending('ELECTRICITY')) return;
    if (!evnData || !selectedProperty) return;
    const unit = roomElecReadings[0];
    if (!unit) return;
    const newVal = Number(unit.newReading);
    if (!newVal || newVal <= unit.prevReading) {
      showAlert('Chỉ số không hợp lệ', 'Chỉ số mới phải lớn hơn chỉ số cũ.');
      return;
    }
    const consumption = newVal - unit.prevReading;
    const fee = Math.round(evnData.totalAmount); // nhà nguyên căn trả toàn bộ tiền EVN
    const now = new Date().toISOString().split('T')[0];

    try {
      await realManagerInvoiceService.createPropertyUtilityInvoice(
        Number(selectedProperty.id),
        {
          type: 'ELECTRICITY', billingPeriod: evnData.billingPeriod,
          prevReading: unit.prevReading, newReading: newVal, consumption,
          unitPrice: consumption > 0 ? Math.round(fee / consumption) : 0,
          amount: fee, meterImageUrl: unit.meterImageUrl,
        },
      );
      setHistoryEntries(prev => [{
        id: `he-${Date.now()}`, type: 'electricity',
        propertyName: selectedProperty.name, billingPeriod: evnData.billingPeriod,
        totalAmount: fee, roomCount: 1, sentAt: now,
      }, ...prev]);
      setUtilReloadKey(k => k + 1);
      setElecStep('done');
    } catch (e: any) {
      showAlert('Lỗi', e?.response?.data?.message || e?.message || 'Không gửi được hóa đơn điện.');
    }
  };

  // ── Water helpers ──────────────────────────────────────────────────────────
  const initRoomWaterReadings = (propId: string) => {
    const prop = properties.find(p => p.id === propId);
    if (!prop) return;
    setRoomWaterReadings(prop.rooms.map(r => ({
      roomId: r.id, roomCode: r.code, tenantName: r.tenantName,
      prevReading: r.prevWater, newReading: '',
    })));
    setWaterStep('room_readings');
  };

  const handleWaterBillSubmit = () => {
    const amt   = Number(waterBillForm.totalAmount);
    const price = Number(waterBillForm.pricePerM3);
    if (!amt || !price || !waterBillForm.billingPeriod.trim()) {
      showAlert('Thiếu dữ liệu', 'Vui lòng điền đầy đủ thông tin hóa đơn nước.');
      return;
    }
    setWaterBillData({ totalAmount: amt, billingPeriod: waterBillForm.billingPeriod, pricePerM3: price });
    if (waterPropertyId) initRoomWaterReadings(waterPropertyId);
  };

  const calculateWaterFees = () => {
    if (!waterBillData) return false;
    const anyMissing = roomWaterReadings.some(r => !r.newReading || Number(r.newReading) <= r.prevReading);
    if (anyMissing) { showAlert('Thiếu chỉ số', 'Vui lòng nhập chỉ số mới cho tất cả phòng.'); return false; }
    setRoomWaterReadings(prev => prev.map(r => {
      const consumption = Math.max(Number(r.newReading) - r.prevReading, 0);
      return { ...r, consumption, fee: Math.round(consumption * waterBillData.pricePerM3) };
    }));
    setWaterStep('review');
    return true;
  };

  const sendWaterInvoices = async () => {
    if (blockedFromSending('WATER')) return;
    if (!waterBillData || !waterProperty) return;
    const now = new Date().toISOString().split('T')[0];
    const period = waterBillData.billingPeriod;
    const price  = waterBillData.pricePerM3;
    try {
      if (waterProperty.type === 'whole_house') {
        const r = roomWaterReadings[0];
        await realManagerInvoiceService.createPropertyUtilityInvoice(
          Number(waterProperty.id),
          {
            type: 'WATER', billingPeriod: period,
            prevReading: r.prevReading, newReading: Number(r.newReading),
            consumption: r.consumption ?? 0, unitPrice: price, amount: r.fee ?? 0,
          },
        );
      } else {
        await Promise.all(roomWaterReadings.map(r =>
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
      const totalSent = roomWaterReadings.reduce((s, r) => s + (r.fee ?? 0), 0);
      setHistoryEntries(prev => [{
        id: `hw-${Date.now()}`, type: 'water',
        propertyName: waterProperty.name, billingPeriod: period,
        totalAmount: totalSent, roomCount: roomWaterReadings.length, sentAt: now,
      }, ...prev]);
      setUtilReloadKey(k => k + 1);
      setWaterStep('done');
    } catch (e: any) {
      showAlert('Lỗi', e?.response?.data?.message || e?.message || 'Không gửi được hóa đơn nước.');
    }
  };

  const resetElec = () => {
    setSelectedPropertyId(null); setEvnData(null);
    setElecStep('select_property'); setRoomElecReadings([]); setEditingEvn(false);
    setEvnImageUrl(''); setEvnScanning(false);
  };

  const resetWater = () => {
    setWaterPropertyId(null); setWaterBillData(null);
    setWaterStep('bill_entry'); setRoomWaterReadings([]);
    setWaterBillForm({ totalAmount: '', billingPeriod: monthPeriod(), pricePerM3: '20000' });
  };

  // ───────────────────────────── RENDER ──────────────────────────────────────

  // Ảnh đồng hồ đã chụp của 1 phòng + nút xoá (ảnh này được gửi kèm hoá đơn nên phải sửa được).
  const renderMeterPhoto = (r: RoomMeterReading) => {
    if (!r.meterImageUrl) return null;
    return (
      <View style={styles.meterThumbRow}>
        <Image source={{ uri: r.meterImageUrl }} style={styles.meterThumb} resizeMode="cover" />
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
      elecStep === 'evn_upload'      ? 1 :
      elecStep === 'room_readings'   ? 2 : 3;

    return (
      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        <StepIndicator
          steps={['Chọn tòa nhà', 'Hóa đơn EVN', isWholeHouse ? 'Chỉ số & Gửi' : 'Chỉ số phòng', 'Xem trước']}
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
                onPress={() => setElecStep('evn_upload')}
              >
                <Text style={styles.primaryBtnText}>Tiếp theo → Tải hóa đơn EVN</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── STEP 2: Tải / Chụp hóa đơn EVN ─────────────────────── */}
        {elecStep === 'evn_upload' && (
          <View>
            <SectionHeader title="Bước 2: Tải / Chụp hóa đơn EVN" />
            {selectedProperty && (
              <View style={styles.infoBanner}>
                <Text style={styles.infoBannerText}>
                  {selectedProperty.type === 'whole_house' ? '🏠' : '🏢'} {selectedProperty.name}
                  {selectedProperty.type === 'multi_room' && ` · ${selectedProperty.rooms.length} phòng`}
                </Text>
              </View>
            )}
            <View style={styles.card}>
              <Text style={styles.cardDesc}>
                Tải ảnh hoặc chụp hóa đơn điện chính thức từ EVN. Hệ thống sẽ tự động nhận diện tổng kWh, tổng tiền và kỳ thanh toán.
              </Text>
              <TouchableOpacity
                style={styles.uploadBtn}
                onPress={() => chooseImageSource(scanEvnInvoice)}
                disabled={evnScanning}
              >
                <Text style={styles.uploadBtnIcon}>📄</Text>
                <Text style={styles.uploadBtnText}>Tải ảnh / Chụp hóa đơn EVN</Text>
                <Text style={styles.uploadBtnSub}>Tự nhận diện kWh · số tiền · kỳ thanh toán</Text>
              </TouchableOpacity>

              {evnScanning && (
                <View style={styles.scanningRow}>
                  <ActivityIndicator color={Colors.primary} />
                  <Text style={styles.scanningText}>Đang tải & đọc hóa đơn...</Text>
                </View>
              )}

              {!!evnImageUrl && (
                <View style={styles.thumbWrap}>
                  <Image source={{ uri: evnImageUrl }} style={styles.evnThumb} resizeMode="contain" />
                  <TouchableOpacity
                    style={styles.thumbRemoveBtn}
                    onPress={clearEvnImage}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.thumbRemoveIcon}>✕</Text>
                  </TouchableOpacity>
                  <View style={styles.thumbActions}>
                    <TouchableOpacity
                      style={styles.thumbActionBtn}
                      onPress={() => chooseImageSource(scanEvnInvoice)}
                      disabled={evnScanning}
                    >
                      <Text style={styles.thumbActionText}>🔄 Chụp lại</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.thumbActionBtn, styles.thumbActionDanger]}
                      onPress={clearEvnImage}
                    >
                      <Text style={[styles.thumbActionText, styles.thumbActionDangerText]}>🗑 Xoá ảnh</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {evnData && !editingEvn && (
                <View style={styles.evnResult}>
                  <View style={styles.evnResultHeader}>
                    <Text style={styles.evnResultTitle}>Thông tin đã nhận diện</Text>
                    <TouchableOpacity onPress={() => setEditingEvn(true)}>
                      <Text style={styles.editLink}>✏️ Sửa</Text>
                    </TouchableOpacity>
                  </View>
                  <EVNDataRow label="Tổng điện"     value={`${evnData.totalKwh} kWh`} />
                  <EVNDataRow label="Tổng tiền"     value={fmt(evnData.totalAmount)} />
                  <EVNDataRow
                    label="Đơn giá điện"
                    value={`${fmt(evnData.totalKwh > 0 ? Math.round(evnData.totalAmount / evnData.totalKwh) : 0)}/kWh`}
                    highlight
                  />
                  <EVNDataRow label="Kỳ thanh toán" value={evnData.billingPeriod} />
                </View>
              )}

              {editingEvn && (
                <View style={styles.evnEditForm}>
                  <Text style={styles.formLabel}>Tổng kWh</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={groupThousands(evnEditForm.totalKwh)}
                    onChangeText={t => setEvnEditForm(f => ({ ...f, totalKwh: onlyDigits(t) }))} />
                  <Text style={styles.formLabel}>Tổng tiền (đ)</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={groupThousands(evnEditForm.totalAmount)}
                    onChangeText={t => setEvnEditForm(f => ({ ...f, totalAmount: onlyDigits(t) }))} />
                  <Text style={styles.formLabel}>Kỳ thanh toán</Text>
                  <TextInput style={styles.input} value={evnEditForm.billingPeriod}
                    onChangeText={t => setEvnEditForm(f => ({ ...f, billingPeriod: t }))} />
                  <TouchableOpacity style={styles.primaryBtn} onPress={saveEvnEdit}>
                    <Text style={styles.primaryBtnText}>Lưu</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setElecStep('select_property')}>
                <Text style={styles.secondaryBtnText}>← Quay lại</Text>
              </TouchableOpacity>
              {evnData && !editingEvn && (
                <TouchableOpacity
                  style={[styles.primaryBtn, { flex: 1, marginLeft: Spacing.sm }]}
                  onPress={() => selectedPropertyId && initRoomElecReadings(selectedPropertyId)}
                >
                  <Text style={styles.primaryBtnText}>Tiếp theo → Nhập chỉ số</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ── STEP 3: Chỉ số phòng ─────────────────────────────────── */}
        {elecStep === 'room_readings' && evnData && (
          <View>
            {isWholeHouse ? (
              /* ── Nhà nguyên căn: 1 card duy nhất ── */
              <>
                <SectionHeader title="Bước 3: Chỉ số điện nhà nguyên căn" />
                <View style={styles.infoBanner}>
                  <Text style={styles.infoBannerText}>
                    EVN: {evnData.totalKwh} kWh · {fmt(evnData.totalAmount)} · {evnData.billingPeriod}
                  </Text>
                </View>
                {roomElecReadings[0] && (() => {
                  const r = roomElecReadings[0];
                  return (
                    <View style={styles.roomCard}>
                      <View style={styles.roomCardHeader}>
                        <View>
                          <Text style={styles.roomCode}>{r.roomCode}</Text>
                          <Text style={styles.roomTenant}>{r.tenantName}</Text>
                        </View>
                        {r.hasPhoto && (
                          <View style={[styles.badge, styles.badgeDone]}>
                            <Text style={[styles.badgeText, { color: Colors.success }]}>Có ảnh</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.formLabel}>Chỉ số cũ (tháng trước)</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="numeric"
                        placeholder="Nhập chỉ số tháng trước"
                        value={r.prevReading ? String(r.prevReading) : ''}
                        onChangeText={t => updateRoomElec(r.roomId, { prevReading: Number(onlyDigits(t)) })}
                      />
                      <Text style={styles.formLabel}>Chỉ số mới (tháng này)</Text>
                      <View style={styles.readingRow}>
                        <TextInput
                          style={[styles.input, { flex: 1, marginRight: Spacing.sm }]}
                          keyboardType="numeric"
                          placeholder={`> ${r.prevReading}`}
                          value={r.newReading}
                          onChangeText={t => updateRoomElec(r.roomId, { newReading: onlyDigits(t) })}
                        />
                        <TouchableOpacity
                          style={styles.ocrBtn}
                          onPress={() => chooseImageSource(cam => captureRoomMeter(r.roomId, cam))}
                          disabled={ocrRoomId === r.roomId}
                        >
                          {ocrRoomId === r.roomId
                            ? <ActivityIndicator color={Colors.primary} />
                            : <Text style={styles.ocrBtnText}>📷 OCR</Text>}
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.prevReading}>📷 Chụp đồng hồ để tự đọc, hoặc nhập tay số ở trên.</Text>
                      {renderMeterPhoto(r)}
                      {r.newReading && Number(r.newReading) > r.prevReading && (
                        <View style={styles.calcPreview}>
                          <Text style={styles.calcPreviewText}>
                            Tiêu thụ: {Number(r.newReading) - r.prevReading} kWh · Tiền điện: {fmt(evnData.totalAmount)}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })()}
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => setElecStep('evn_upload')}>
                    <Text style={styles.secondaryBtnText}>← Quay lại</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sendBtn, { flex: 1, marginLeft: Spacing.sm }, !canSendElec && styles.btnLocked]}
                    onPress={sendWholeHouseElec}
                  >
                    <Text style={styles.sendBtnText}>{canSendElec ? '⚡ Gửi hóa đơn điện' : elecSettled ? '🔒 Kỳ này đã thu đủ' : '🔒 Đã chốt sổ'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              /* ── Nhà nhiều phòng: mỗi phòng gửi riêng lẻ ── */
              <>
                <SectionHeader title="Bước 3: Chỉ số điện từng phòng" />
                <View style={styles.infoBanner}>
                  <Text style={styles.infoBannerText}>
                    EVN: {evnData.totalKwh} kWh · {fmt(evnData.totalAmount)} · {evnData.billingPeriod}
                  </Text>
                </View>

                {/* Tóm tắt tiến trình */}
                <View style={styles.progressRow}>
                  <Text style={styles.progressText}>
                    Đã gửi: {roomElecReadings.filter(r => r.sent).length}/{roomElecReadings.length} phòng
                  </Text>
                  {roomElecReadings.some(r => !r.sent && r.newReading && Number(r.newReading) > r.prevReading) && (
                    <TouchableOpacity
                      style={[styles.sendAllBtn, !canSendElec && styles.btnLocked]}
                      onPress={sendAllUnsent}
                    >
                      <Text style={styles.sendAllBtnText}>{canSendElec ? 'Gửi tất cả →' : elecSettled ? '🔒 Đã thu đủ' : '🔒 Đã chốt sổ'}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {roomElecReadings.map((r, idx) => (
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
                      /* Phòng đã gửi: hiện tóm tắt */
                      <View style={styles.sentSummary}>
                        <Text style={styles.sentSummaryText}>
                          {r.consumption} kWh · {fmt(r.fee ?? 0)} — đã gửi hóa đơn
                        </Text>
                      </View>
                    ) : (
                      /* Phòng chưa gửi: nhập chỉ số (chụp OCR hoặc nhập tay) + nút gửi */
                      <>
                        <Text style={styles.formLabel}>Chỉ số cũ (tháng trước)</Text>
                        <TextInput
                          style={styles.input}
                          keyboardType="numeric"
                          placeholder="Nhập chỉ số tháng trước"
                          value={r.prevReading ? String(r.prevReading) : ''}
                          onChangeText={t => updateRoomElec(r.roomId, { prevReading: Number(onlyDigits(t)) })}
                        />
                        <Text style={styles.formLabel}>Chỉ số mới (tháng này)</Text>
                        <View style={styles.readingRow}>
                          <TextInput
                            style={[styles.input, { flex: 1, marginRight: Spacing.sm }]}
                            keyboardType="numeric"
                            placeholder={`> ${r.prevReading}`}
                            value={r.newReading}
                            onChangeText={t => updateRoomElec(r.roomId, { newReading: onlyDigits(t) })}
                          />
                          <TouchableOpacity
                            style={styles.ocrBtn}
                            onPress={() => chooseImageSource(cam => captureRoomMeter(r.roomId, cam))}
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
                          const unitPrice = evnData.totalKwh > 0 ? evnData.totalAmount / evnData.totalKwh : 0;
                          const consumption = Number(r.newReading) - r.prevReading;
                          const fee = Math.round(consumption * unitPrice);
                          return (
                            <>
                              <View style={styles.calcPreview}>
                                <Text style={styles.calcPreviewText}>
                                  {consumption} kWh × {fmt(Math.round(unitPrice))}/kWh = {fmt(fee)}
                                </Text>
                              </View>
                              <TouchableOpacity
                                style={[styles.sendRoomBtn, !canSendElec && styles.btnLocked]}
                                onPress={() => sendSingleRoomElec(r.roomId)}
                              >
                                <Text style={styles.sendRoomBtnText}>
                                  {canSendElec
                                    ? `⚡ Gửi hóa đơn phòng ${r.roomCode} · ${fmt(fee)}`
                                    : elecSettled
                                      ? '🔒 Kỳ này đã thu đủ'
                                      : '🔒 Ngoài hạn chốt sổ (ngày 1–10)'}
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
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => setElecStep('evn_upload')}>
                    <Text style={styles.secondaryBtnText}>← Quay lại</Text>
                  </TouchableOpacity>
                  {roomElecReadings.every(r => r.sent) && (
                    <TouchableOpacity style={[styles.sendBtn, { flex: 1, marginLeft: Spacing.sm }]} onPress={() => setElecStep('done')}>
                      <Text style={styles.sendBtnText}>Hoàn tất ✓</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
    );
  };

  // Ước lượng số m³ toàn nhà từ tổng tiền ÷ đơn giá — để manager tự soi lệch số 0.
  const waterEstimate = useMemo(() => {
    const total = Number(waterBillForm.totalAmount);
    const price = Number(waterBillForm.pricePerM3);
    if (!total || !price) return null;
    return Math.round((total / price) * 10) / 10;
  }, [waterBillForm.totalAmount, waterBillForm.pricePerM3]);

  const waterReady =
    !!waterBillForm.totalAmount && !!waterBillForm.pricePerM3
    && !!waterBillForm.billingPeriod.trim() && !!waterPropertyId;

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
            {/* ── Hoá đơn nước của cả nhà ── */}
            <View style={styles.formCard}>
              <View style={styles.formCardHead}>
                <View style={styles.formCardIcon}><Text style={{ fontSize: 18 }}>💧</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formCardTitle}>Hóa đơn nước của cả nhà</Text>
                  <Text style={styles.formCardSub}>Nhập theo hóa đơn nước chính thức, hệ thống chia lại cho từng phòng.</Text>
                </View>
              </View>

              <View style={styles.fieldRow}>
                <View style={{ flex: 1.4 }}>
                  <Text style={styles.formLabel}>Tổng tiền hóa đơn <Text style={styles.req}>*</Text></Text>
                  <View style={styles.inputWrap}>
                    <TextInput
                      style={styles.inputFlex} keyboardType="numeric" placeholder="2.500.000"
                      placeholderTextColor={Colors.textMuted}
                      value={groupThousands(waterBillForm.totalAmount)}
                      onChangeText={t => setWaterBillForm(f => ({ ...f, totalAmount: onlyDigits(t) }))}
                    />
                    <Text style={styles.inputSuffix}>đ</Text>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Đơn giá <Text style={styles.req}>*</Text></Text>
                  <View style={styles.inputWrap}>
                    <TextInput
                      style={styles.inputFlex} keyboardType="numeric"
                      placeholderTextColor={Colors.textMuted}
                      value={groupThousands(waterBillForm.pricePerM3)}
                      onChangeText={t => setWaterBillForm(f => ({ ...f, pricePerM3: onlyDigits(t) }))}
                    />
                    <Text style={styles.inputSuffix}>đ/m³</Text>
                  </View>
                </View>
              </View>

              {/* Kiểm tra chéo ngay khi nhập — sai số 0 ở đâu là thấy liền */}
              {waterEstimate != null && (
                <View style={styles.estimateBox}>
                  <Text style={styles.estimateText}>
                    ≈ <Text style={styles.estimateStrong}>{waterEstimate.toLocaleString('vi-VN')} m³</Text> toàn nhà trong kỳ này
                  </Text>
                </View>
              )}

              <Text style={styles.formLabel}>Kỳ thanh toán <Text style={styles.req}>*</Text></Text>
              <View style={styles.periodChips}>
                {(() => {
                  const thisMonth = monthPeriod(0);
                  const active = waterBillForm.billingPeriod === thisMonth;
                  return (
                    <TouchableOpacity
                      style={[styles.periodChip, active && styles.periodChipActive]}
                      onPress={() => setWaterBillForm(f => ({ ...f, billingPeriod: thisMonth }))}
                    >
                      <Text style={[styles.periodChipText, active && styles.periodChipTextActive]}>Tháng này</Text>
                    </TouchableOpacity>
                  );
                })()}
              </View>
              <TextInput
                style={styles.input}
                value={waterBillForm.billingPeriod}
                onChangeText={t => setWaterBillForm(f => ({ ...f, billingPeriod: t }))}
              />
            </View>

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
                onSelect={setWaterPropertyId}
                onRetry={() => { setLoadingProps(true); loadProperties(); }}
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, !waterReady && styles.primaryBtnDisabled]}
              onPress={handleWaterBillSubmit}
              disabled={!waterReady}
            >
              <Text style={[styles.primaryBtnText, !waterReady && styles.primaryBtnTextDisabled]}>
                Tiếp theo → Nhập chỉ số phòng
              </Text>
            </TouchableOpacity>
            {!waterReady && (
              <Text style={styles.helperText}>
                {!waterBillForm.totalAmount ? 'Nhập tổng tiền hóa đơn nước để tiếp tục.'
                  : !waterBillForm.pricePerM3 ? 'Nhập đơn giá m³ để tiếp tục.'
                  : !waterBillForm.billingPeriod.trim() ? 'Nhập kỳ thanh toán để tiếp tục.'
                  : 'Chọn nhà cần chốt sổ để tiếp tục.'}
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
                <Text style={styles.prevReading}>Chỉ số cũ: {r.prevReading} m³</Text>
                <TextInput style={styles.input} keyboardType="numeric"
                  placeholder={`Chỉ số mới (> ${r.prevReading})`}
                  value={r.newReading}
                  onChangeText={t => setRoomWaterReadings(prev => prev.map((x, i) => i === idx ? { ...x, newReading: t } : x))} />
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
              <TouchableOpacity
                style={[styles.sendBtn, { flex: 1, marginLeft: Spacing.sm }, !canSendWater && styles.btnLocked]}
                onPress={sendWaterInvoices}
              >
                <Text style={styles.sendBtnText}>{canSendWater ? '💧 Gửi hóa đơn nước' : waterSettled ? '🔒 Kỳ này đã thu đủ' : '🔒 Đã chốt sổ'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        <View style={{ height: 80 }} />
      </ScrollView>
    );
  };

  const renderHistoryTab = () => (
    <FlatList
      data={histInvoices}
      keyExtractor={i => String(i.id)}
      contentContainerStyle={styles.tabContent}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={<SectionHeader title="Lịch sử hóa đơn điện / nước đã gửi" />}
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

      {/* Cửa sổ chốt sổ — hiện ở cả 2 tab điện/nước để manager biết còn gửi được không */}
      {activeTab !== 'history' && (() => {
        const settled = activeTab === 'electricity' ? elecSettled : waterSettled;
        const canSend = activeTab === 'electricity' ? canSendElec : canSendWater;
        return (
          <View style={[styles.windowBar, canSend ? styles.windowBarOpen : styles.windowBarClosed]}>
            <Text style={[styles.windowBarText, { color: canSend ? Colors.success : Colors.error }]}>
              {canSend
                ? `● Đang mở chốt sổ — còn ${daysLeft} ngày (hết ngày ${UTILITY_CYCLE.closeDay})`
                : settled
                  ? '🔒 Kỳ này đã thu đủ và chốt sổ — mở lại vào kỳ thanh toán tháng sau.'
                  : `🔒 ${windowClosedReason}`}
            </Text>
          </View>
        );
      })()}

      {activeTab === 'electricity' && renderElecTab()}
      {activeTab === 'water'       && renderWaterTab()}
      {activeTab === 'history'     && renderHistoryTab()}
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
      <View style={styles.selectedCard}>
        <Text style={styles.selectedIcon}>{selected.type === 'whole_house' ? '🏠' : '🏢'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.selectedName} numberOfLines={1}>{selected.name}</Text>
          <Text style={styles.selectedMeta} numberOfLines={1}>{metaOf(selected)}</Text>
        </View>
        <TouchableOpacity style={styles.changeBtn} onPress={() => setExpanded(true)}>
          <Text style={styles.changeBtnText}>Đổi</Text>
        </TouchableOpacity>
      </View>
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
