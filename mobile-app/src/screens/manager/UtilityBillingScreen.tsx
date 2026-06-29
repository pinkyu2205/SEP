import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, FlatList, ActivityIndicator, Image, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { managerPropertyService } from '../../services/managerPropertyService';
import { realPropertyService } from '../../services/propertyService.real';
import { realTenantService, TenantContractResponse } from '../../services/tenantService.real';
import { realManagerInvoiceService, ManagerInvoice } from '../../services/managerInvoiceService.real';
import { uploadImageToCloudinary } from '../../services/cloudinary';

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
  prevElec: number;   // BE chưa có lịch sử chỉ số → tạm 0 (xem doc/ gap)
  prevWater: number;  // BE chưa có lịch sử chỉ số → tạm 0
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
 * Đọc best-effort hoá đơn EVN từ kết quả OCR (endpoint /ocr/meter trả rawText + numbers).
 * EVN tính điện bậc thang nên KHÔNG có đơn giá sẵn → chỉ lấy Tổng kWh, Tổng tiền, Kỳ.
 * Luôn cần manager xác nhận lại (BE chưa có parser hoá đơn riêng — xem doc/ gap #8).
 */
const parseEvnInvoice = (
  ocr: { reading?: string; numbers?: string[]; rawText?: string },
): { totalKwh: string; totalAmount: string; billingPeriod: string } => {
  const text = (ocr.rawText || '').replace(/\s+/g, ' ');
  const out = { totalKwh: '', totalAmount: '', billingPeriod: '' };

  // Kỳ hoá đơn: "từ 07/04/2022 đến 06/05/2022" hoặc "Tháng 5/2022"
  const range = text.match(/từ\s*(\d{1,2}\/\d{1,2}\/\d{4})\s*đến\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (range) out.billingPeriod = `${range[1]} – ${range[2]}`;
  else {
    const m = text.match(/Tháng\s*(\d{1,2})\s*\/\s*(\d{4})/i);
    if (m) out.billingPeriod = `Tháng ${m[1]}/${m[2]}`;
  }

  // Tổng tiền thanh toán (ưu tiên dòng "Tổng cộng tiền thanh toán")
  const amt =
    text.match(/Tổng cộng tiền thanh toán[^\d]*([\d.,]+)/i) ||
    text.match(/Tổng cộng[^\d]*([\d.,]+)/i);
  if (amt) out.totalAmount = onlyDigits(amt[1]);
  if (!out.totalAmount && ocr.numbers?.length) {
    const nums = ocr.numbers.map(n => Number(onlyDigits(n))).filter(n => n > 0);
    if (nums.length) out.totalAmount = String(Math.max(...nums)); // tổng tiền thường là số lớn nhất
  }

  // Tổng kWh: số gần chữ "kWh" (trước HOẶC sau, do thứ tự cột OCR khác nhau),
  // hoặc số sau "Điện tiêu thụ".
  const kwh =
    text.match(/([\d.,]+)\s*kWh/i) ||
    text.match(/kWh[^\d]*([\d.,]+)/i) ||
    text.match(/tiêu thụ[^\d]*?([\d.,]+)\s*kWh/i);
  if (kwh) out.totalKwh = onlyDigits(kwh[1]);

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
  active.forEach(c => {
    if (c.roomId != null) tenantByRoomId.set(c.roomId, c.tenantFullName);
    if (c.roomNumber) tenantByRoomNo.set(c.roomNumber, c.tenantFullName);
  });
  const isWhole = p.wholeHouse === true;

  if (isWhole) {
    const tenant = active[0]?.tenantFullName || 'Chưa có khách thuê';
    return {
      id: String(p.id),
      name: p.propertyName,
      type: 'whole_house',
      electricityRate: 0,
      waterRate: 0,
      rooms: [{ id: `house-${p.id}-unit`, code: 'Nhà nguyên căn', tenantName: tenant, prevElec: 0, prevWater: 0 }],
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
        prevElec: 0,
        prevWater: 0,
      })),
  };
};

// ===================== SCREEN =====================
export const UtilityBillingScreen: React.FC<any> = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState<MainTab>('electricity');
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
  const [waterBillForm,    setWaterBillForm]    = useState({ totalAmount: '', billingPeriod: '01/05 – 31/05/2026', pricePerM3: '20000' });

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
      setProperties(mapped);
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

  // ── Ảnh + OCR ──────────────────────────────────────────────────────────────
  const pickImage = async (useCamera: boolean): Promise<string | null> => {
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') { Alert.alert('Lỗi', 'Cần quyền camera.'); return null; }
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
    Alert.alert('Chọn ảnh', undefined, [
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
      try {
        const ocr = await realTenantService.ocrMeter(url);
        parsed = parseEvnInvoice(ocr);
      } catch {
        /* OCR lỗi -> để manager nhập tay */
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
      Alert.alert(
        got ? 'Đã quét hoá đơn' : 'Đã tải hoá đơn',
        got
          ? 'Hệ thống đã đọc sơ bộ. Vui lòng KIỂM TRA và sửa lại tổng kWh / tổng tiền / kỳ cho đúng hoá đơn.'
          : 'Chưa tự đọc được số liệu từ ảnh. Vui lòng nhập tay tổng kWh, tổng tiền và kỳ thanh toán.',
      );
    } catch {
      Alert.alert('Lỗi', 'Không tải/đọc được ảnh hoá đơn. Bạn có thể nhập tay số liệu.');
    } finally {
      setEvnScanning(false);
    }
  };

  const saveEvnEdit = () => {
    const kwh = Number(onlyDigits(evnEditForm.totalKwh));
    const amt = Number(onlyDigits(evnEditForm.totalAmount));
    if (!kwh || !amt || !evnEditForm.billingPeriod.trim()) {
      Alert.alert('Thiếu dữ liệu', 'Vui lòng điền đầy đủ thông tin hóa đơn EVN.');
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
      if (!reading) Alert.alert('OCR', 'Chưa đọc được chỉ số từ ảnh — vui lòng nhập tay.');
    } catch {
      Alert.alert('Lỗi', 'Không tải/đọc được ảnh đồng hồ. Vui lòng nhập tay.');
    } finally {
      setOcrRoomId(null);
    }
  };

  // Cập nhật 1 phòng trong danh sách chỉ số điện (nhập tay chỉ số cũ / mới).
  const updateRoomElec = (roomId: string, patch: Partial<RoomMeterReading>) =>
    setRoomElecReadings(prev => prev.map(r => (r.roomId === roomId ? { ...r, ...patch } : r)));

  // Gửi hóa đơn ĐIỆN (riêng) cho 1 phòng cụ thể (multi-room)
  const sendSingleRoomElec = async (roomId: string) => {
    if (!evnData || !selectedProperty) return;
    const room = roomElecReadings.find(r => r.roomId === roomId);
    if (!room) return;
    const newVal = Number(room.newReading);
    if (!newVal || newVal <= room.prevReading) {
      Alert.alert('Chỉ số không hợp lệ', 'Chỉ số mới phải lớn hơn chỉ số cũ.');
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
      Alert.alert('Đã gửi', `Hóa đơn điện phòng ${room.roomCode} · ${fmt(fee)} đã gửi cho ${room.tenantName}.`);
    } catch (e: any) {
      Alert.alert('Lỗi', e?.response?.data?.message || e?.message || 'Không gửi được hóa đơn điện.');
    }
  };

  // Gửi hóa đơn ĐIỆN (riêng) cho tất cả phòng chưa gửi (multi-room)
  const sendAllUnsent = async () => {
    if (!evnData || !selectedProperty) return;
    const unsent = roomElecReadings.filter(r => !r.sent && r.newReading && Number(r.newReading) > r.prevReading);
    if (!unsent.length) { Alert.alert('Thông báo', 'Tất cả phòng đã được gửi hoặc chưa nhập chỉ số hợp lệ.'); return; }

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
      Alert.alert('Đã gửi', `Đã gửi hóa đơn điện cho ${unsent.length} phòng.`);
    } catch (e: any) {
      Alert.alert('Lỗi', e?.response?.data?.message || e?.message || 'Không gửi được hóa đơn điện.');
    }
  };

  // Gửi hóa đơn ĐIỆN (riêng) cho nhà nguyên căn (whole_house)
  const sendWholeHouseElec = async () => {
    if (!evnData || !selectedProperty) return;
    const unit = roomElecReadings[0];
    if (!unit) return;
    const newVal = Number(unit.newReading);
    if (!newVal || newVal <= unit.prevReading) {
      Alert.alert('Chỉ số không hợp lệ', 'Chỉ số mới phải lớn hơn chỉ số cũ.');
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
      Alert.alert('Lỗi', e?.response?.data?.message || e?.message || 'Không gửi được hóa đơn điện.');
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
      Alert.alert('Thiếu dữ liệu', 'Vui lòng điền đầy đủ thông tin hóa đơn nước.');
      return;
    }
    setWaterBillData({ totalAmount: amt, billingPeriod: waterBillForm.billingPeriod, pricePerM3: price });
    if (waterPropertyId) initRoomWaterReadings(waterPropertyId);
  };

  const calculateWaterFees = () => {
    if (!waterBillData) return false;
    const anyMissing = roomWaterReadings.some(r => !r.newReading || Number(r.newReading) <= r.prevReading);
    if (anyMissing) { Alert.alert('Thiếu chỉ số', 'Vui lòng nhập chỉ số mới cho tất cả phòng.'); return false; }
    setRoomWaterReadings(prev => prev.map(r => {
      const consumption = Math.max(Number(r.newReading) - r.prevReading, 0);
      return { ...r, consumption, fee: Math.round(consumption * waterBillData.pricePerM3) };
    }));
    setWaterStep('review');
    return true;
  };

  const sendWaterInvoices = async () => {
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
      Alert.alert('Lỗi', e?.response?.data?.message || e?.message || 'Không gửi được hóa đơn nước.');
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
    setWaterBillForm({ totalAmount: '', billingPeriod: '01/05 – 31/05/2026', pricePerM3: '20000' });
  };

  // ───────────────────────────── RENDER ──────────────────────────────────────

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

              {!!evnImageUrl && <Image source={{ uri: evnImageUrl }} style={styles.evnThumb} resizeMode="contain" />}

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
                  <TouchableOpacity style={[styles.sendBtn, { flex: 1, marginLeft: Spacing.sm }]} onPress={sendWholeHouseElec}>
                    <Text style={styles.sendBtnText}>⚡ Gửi hóa đơn điện</Text>
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
                    <TouchableOpacity style={styles.sendAllBtn} onPress={sendAllUnsent}>
                      <Text style={styles.sendAllBtnText}>Gửi tất cả →</Text>
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
            <SectionHeader title="Bước 1: Nhập thông tin hóa đơn nước" />
            <View style={styles.card}>
              <Text style={styles.cardDesc}>Nhập thông tin từ hóa đơn nước chính thức khi có.</Text>
              <Text style={styles.formLabel}>Tổng tiền hóa đơn nước (đ) *</Text>
              <TextInput style={styles.input} keyboardType="numeric" placeholder="Ví dụ: 2.500.000"
                value={groupThousands(waterBillForm.totalAmount)}
                onChangeText={t => setWaterBillForm(f => ({ ...f, totalAmount: onlyDigits(t) }))} />
              <Text style={styles.formLabel}>Đơn giá m³ (đ) *</Text>
              <TextInput style={styles.input} keyboardType="numeric"
                value={groupThousands(waterBillForm.pricePerM3)}
                onChangeText={t => setWaterBillForm(f => ({ ...f, pricePerM3: onlyDigits(t) }))} />
              <Text style={styles.formLabel}>Kỳ thanh toán *</Text>
              <TextInput style={styles.input}
                value={waterBillForm.billingPeriod}
                onChangeText={t => setWaterBillForm(f => ({ ...f, billingPeriod: t }))} />

              <SectionHeader title="Chọn tòa nhà" />
              <PropertyPicker
                properties={properties}
                loading={loadingProps}
                error={errorProps}
                selectedId={waterPropertyId}
                onSelect={setWaterPropertyId}
                onRetry={() => { setLoadingProps(true); loadProperties(); }}
              />

              {waterPropertyId && (
                <TouchableOpacity style={[styles.primaryBtn, { marginTop: Spacing.md }]} onPress={handleWaterBillSubmit}>
                  <Text style={styles.primaryBtnText}>Tiếp theo → Nhập chỉ số phòng</Text>
                </TouchableOpacity>
              )}
            </View>
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
              <TouchableOpacity style={[styles.sendBtn, { flex: 1, marginLeft: Spacing.sm }]} onPress={sendWaterInvoices}>
                <Text style={styles.sendBtnText}>💧 Gửi hóa đơn nước</Text>
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
            <Text style={stepSt.dotText}>{i < current ? '✓' : String(i + 1)}</Text>
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

// Bộ chọn nhà (nhiều phòng / nguyên căn) + xử lý loading / lỗi / rỗng — dùng chung 2 tab.
const PropertyPicker: React.FC<{
  properties: BillingProperty[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
  showRoomCodes?: boolean;
}> = ({ properties, loading, error, selectedId, onSelect, onRetry, showRoomCodes }) => {
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
        <Text style={styles.pickerStateText}>Chưa có tòa nhà được giao</Text>
      </View>
    );
  }

  const multi = properties.filter(p => p.type === 'multi_room');
  const whole = properties.filter(p => p.type === 'whole_house');
  const row = (prop: BillingProperty, meta: string) => (
    <TouchableOpacity
      key={prop.id}
      style={[styles.propertyRow, selectedId === prop.id && styles.propertyRowActive]}
      onPress={() => onSelect(prop.id)}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.propertyName}>{prop.name}</Text>
        <Text style={styles.propertyMeta}>{meta}</Text>
      </View>
      {selectedId === prop.id && <Text style={styles.checkMark}>✓</Text>}
    </TouchableOpacity>
  );

  return (
    <>
      {multi.length > 0 && <Text style={styles.groupLabel}>🏢 Nhà nhiều phòng</Text>}
      {multi.map(prop =>
        row(
          prop,
          showRoomCodes && prop.rooms.length > 0
            ? `${prop.rooms.length} phòng · ${prop.rooms.map(r => r.code).join(', ')}`
            : `${prop.rooms.length} phòng`,
        ),
      )}
      {whole.length > 0 && (
        <Text style={[styles.groupLabel, { marginTop: Spacing.md }]}>🏠 Nhà nguyên căn</Text>
      )}
      {whole.map(prop => row(prop, `Nguyên căn · ${prop.rooms[0]?.tenantName ?? ''}`))}
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
  backText: { color: Colors.primary, fontWeight: '600', fontSize: 15, width: 70 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },

  tabBar: { flexDirection: 'row', backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabLabel: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  tabLabelActive: { color: Colors.primary },

  tabContent: { padding: Spacing.lg },

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
  checkMark:    { fontSize: 16, color: Colors.primary, fontWeight: '900' },

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
  input: {
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, padding: Spacing.sm,
    fontSize: 15, color: Colors.textPrimary, marginBottom: Spacing.xs,
  },
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
  wrap: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.lg },
  item: { alignItems: 'center', flex: 1 },
  dot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.background, borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  dotActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  dotDone:   { backgroundColor: Colors.success, borderColor: Colors.success },
  dotText:   { fontSize: 11, fontWeight: '800', color: Colors.white },
  label:       { fontSize: 10, color: Colors.textMuted,  textAlign: 'center', fontWeight: '600' },
  labelActive: { color: Colors.primary },
  line:     { flex: 0.5, height: 2, backgroundColor: Colors.border, marginBottom: 20 },
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
