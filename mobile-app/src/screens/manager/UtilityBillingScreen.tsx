import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { billsStore, SharedBill, BillStatus } from '../../store/billsStore';

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

// ===================== MOCK PROPERTIES =====================
type PropType = 'multi_room' | 'whole_house';

interface MockRoom {
  id: string;
  code: string;
  tenantName: string;
  prevElec: number;
  prevWater: number;
}

interface MockProperty {
  id: string;
  name: string;
  type: PropType;
  electricityRate: number;
  waterRate: number;
  rooms: MockRoom[];            // multi_room: danh sách phòng; whole_house: 1 phần tử duy nhất
}

const MOCK_PROPERTIES: MockProperty[] = [
  {
    id: 'p1', name: 'Nhà Nguyễn Trãi', type: 'multi_room',
    electricityRate: 3500, waterRate: 20000,
    rooms: [
      { id: 'r1', code: 'P101', tenantName: 'Trần Văn An',    prevElec: 1250, prevWater: 45 },
      { id: 'r2', code: 'P102', tenantName: 'Lê Thị Bình',    prevElec: 2840, prevWater: 78 },
      { id: 'r3', code: 'P103', tenantName: 'Phạm Văn Cường', prevElec: 980,  prevWater: 32 },
      { id: 'r4', code: 'P201', tenantName: 'Hoàng Văn Dũng', prevElec: 3120, prevWater: 92 },
      { id: 'r5', code: 'P202', tenantName: 'Trần Thị Emi',   prevElec: 1560, prevWater: 55 },
    ],
  },
  {
    id: 'p2', name: 'Nhà Lê Văn Sỹ', type: 'multi_room',
    electricityRate: 3800, waterRate: 16000,
    rooms: [
      { id: 'r6', code: 'P101', tenantName: 'Nguyễn Bảo Gia',  prevElec: 740,  prevWater: 12 },
      { id: 'r7', code: 'P102', tenantName: 'Vũ Minh Phương',  prevElec: 1890, prevWater: 28 },
      { id: 'r8', code: 'P201', tenantName: 'Đỗ Hương Giang',  prevElec: 620,  prevWater: 9  },
    ],
  },
  // ── Nhà nguyên căn ──────────────────────────────────────────────────────────
  {
    id: 'house-1', name: 'Nhà Nguyễn Văn Cừ', type: 'whole_house',
    electricityRate: 3500, waterRate: 15000,
    rooms: [
      { id: 'house-1-unit', code: 'Nhà nguyên căn', tenantName: 'Gia đình anh Minh', prevElec: 1850, prevWater: 126 },
    ],
  },
  {
    id: 'house-3', name: 'Nhà Trần Hưng Đạo', type: 'whole_house',
    electricityRate: 3500, waterRate: 15000,
    rooms: [
      { id: 'house-3-unit', code: 'Nhà nguyên căn', tenantName: 'Công ty An Phú', prevElec: 4120, prevWater: 310 },
    ],
  },
];

const MOCK_HISTORY: HistoryEntry[] = [
  { id: 'h1', type: 'electricity', propertyName: 'Nhà Nguyễn Trãi',   billingPeriod: '01/04 – 30/04/2026', totalAmount: 2345000, roomCount: 5, sentAt: '2026-04-30' },
  { id: 'h2', type: 'water',       propertyName: 'Nhà Nguyễn Trãi',   billingPeriod: '01/04 – 30/04/2026', totalAmount: 980000,  roomCount: 5, sentAt: '2026-04-30' },
  { id: 'h3', type: 'electricity', propertyName: 'Nhà Lê Văn Sỹ',     billingPeriod: '01/04 – 30/04/2026', totalAmount: 1876000, roomCount: 3, sentAt: '2026-04-29' },
  { id: 'h4', type: 'water',       propertyName: 'Nhà Lê Văn Sỹ',     billingPeriod: '01/04 – 30/04/2026', totalAmount: 784000,  roomCount: 3, sentAt: '2026-04-29' },
  { id: 'h5', type: 'electricity', propertyName: 'Nhà Nguyễn Văn Cừ', billingPeriod: '01/04 – 30/04/2026', totalAmount: 910000,  roomCount: 1, sentAt: '2026-04-28' },
];

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

// ===================== SCREEN =====================
export const UtilityBillingScreen: React.FC<any> = ({ navigation }) => {
  const [activeTab, setActiveTab] = useState<MainTab>('electricity');

  // ── Electricity state ──────────────────────────────────────────────────────
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [evnData,            setEvnData]            = useState<EVNData | null>(null);
  const [elecStep,           setElecStep]           = useState<ElecStep>('select_property');
  const [roomElecReadings,   setRoomElecReadings]   = useState<RoomMeterReading[]>([]);
  const [editingEvn,         setEditingEvn]         = useState(false);
  const [evnEditForm,        setEvnEditForm]        = useState({ totalKwh: '', totalAmount: '', billingPeriod: '' });

  // ── Water state ────────────────────────────────────────────────────────────
  const [waterPropertyId,  setWaterPropertyId]  = useState<string | null>(null);
  const [waterBillData,    setWaterBillData]    = useState<WaterBillData | null>(null);
  const [waterStep,        setWaterStep]        = useState<WaterStep>('bill_entry');
  const [roomWaterReadings,setRoomWaterReadings]= useState<RoomWaterReading[]>([]);
  const [waterBillForm,    setWaterBillForm]    = useState({ totalAmount: '', billingPeriod: '01/05 – 31/05/2026', pricePerM3: '20000' });

  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>(MOCK_HISTORY);

  const selectedProperty = MOCK_PROPERTIES.find(p => p.id === selectedPropertyId);
  const waterProperty    = MOCK_PROPERTIES.find(p => p.id === waterPropertyId);
  const isWholeHouse     = selectedProperty?.type === 'whole_house';

  // ── EVN helpers ────────────────────────────────────────────────────────────
  const simulateEVNScan = () => {
    const fakeKwh = 1240 + Math.floor(Math.random() * 200);
    const fakeAmount = Math.round(fakeKwh * 3500 * 0.9);
    setEvnData({ totalKwh: fakeKwh, totalAmount: fakeAmount, billingPeriod: '01/05 – 31/05/2026', imageUploaded: true });
    setEvnEditForm({ totalKwh: String(fakeKwh), totalAmount: String(fakeAmount), billingPeriod: '01/05 – 31/05/2026' });
    Alert.alert('Nhận diện thành công', `Tổng điện: ${fakeKwh} kWh\nTổng tiền: ${fmt(fakeAmount)}\nKỳ: 01/05 – 31/05/2026\n\nVui lòng kiểm tra và sửa nếu cần.`);
  };

  const saveEvnEdit = () => {
    const kwh = Number(evnEditForm.totalKwh);
    const amt = Number(evnEditForm.totalAmount);
    if (!kwh || !amt || !evnEditForm.billingPeriod.trim()) {
      Alert.alert('Thiếu dữ liệu', 'Vui lòng điền đầy đủ thông tin hóa đơn EVN.');
      return;
    }
    setEvnData({ totalKwh: kwh, totalAmount: amt, billingPeriod: evnEditForm.billingPeriod, imageUploaded: true });
    setEditingEvn(false);
  };

  const initRoomElecReadings = (propId: string) => {
    const prop = MOCK_PROPERTIES.find(p => p.id === propId);
    if (!prop) return;
    setRoomElecReadings(prop.rooms.map(r => ({
      roomId: r.id, roomCode: r.code, tenantName: r.tenantName,
      prevReading: r.prevElec, newReading: '', hasPhoto: false, sent: false,
    })));
    setElecStep('room_readings');
  };

  const simulateRoomOCR = (roomId: string) => {
    const room = selectedProperty?.rooms.find(r => r.id === roomId);
    if (!room) return;
    const fakeNew = room.prevElec + 80 + Math.floor(Math.random() * 80);
    setRoomElecReadings(prev => prev.map(r =>
      r.roomId === roomId ? { ...r, newReading: String(fakeNew), hasPhoto: true } : r
    ));
  };

  // Gửi hóa đơn cho 1 phòng cụ thể (multi-room)
  const sendSingleRoomElec = (roomId: string) => {
    if (!evnData || !selectedProperty) return;
    const room = roomElecReadings.find(r => r.roomId === roomId);
    if (!room) return;
    const newVal = Number(room.newReading);
    if (!newVal || newVal <= room.prevReading) {
      Alert.alert('Chỉ số không hợp lệ', 'Chỉ số mới phải lớn hơn chỉ số cũ.');
      return;
    }
    // Tính phí dựa trên đơn giá EVN (tổng tiền / tổng kWh của toà nhà)
    const totalRecorded = roomElecReadings.reduce((s, r) => {
      if (r.roomId === roomId) return s + Math.max(newVal - r.prevReading, 0);
      return s + Math.max(Number(r.newReading) - r.prevReading, 0);
    }, 0);
    const feePerKwh  = evnData.totalAmount / (totalRecorded || 1);
    const consumption = Math.max(newVal - room.prevReading, 0);
    const fee         = Math.round(consumption * feePerKwh);

    const now = new Date().toISOString().split('T')[0];
    billsStore.addBills([{
      id: `elec-${roomId}-${Date.now()}`,
      code: `HD-ELEC-${room.roomCode}-T5`,
      invoiceType: 'electricity',
      roomId: room.roomId,
      roomName: room.roomCode,
      propertyId: selectedProperty.id,
      propertyName: selectedProperty.name,
      tenantId: room.roomId,
      tenantName: room.tenantName,
      tenantPhone: '',
      month: 5, year: 2026,
      items: [{ label: `Điện (${consumption} kWh)`, amount: fee }],
      totalAmount: fee, lateFee: 0, grandTotal: fee,
      status: 'pending' as BillStatus,
      dueDate: '2026-05-25', createdAt: now,
      kwhUsed: consumption,
      electricityRate: selectedProperty.electricityRate,
      billingPeriod: evnData.billingPeriod,
    }]);

    // Đánh dấu phòng này đã gửi
    setRoomElecReadings(prev => prev.map(r =>
      r.roomId === roomId ? { ...r, consumption, fee, sent: true } : r
    ));

    Alert.alert('Đã gửi', `Hóa đơn điện phòng ${room.roomCode} · ${fmt(fee)} đã được gửi cho ${room.tenantName}.`);
  };

  // Gửi tất cả phòng chưa gửi (multi-room)
  const sendAllUnsent = () => {
    if (!evnData || !selectedProperty) return;
    const unsent = roomElecReadings.filter(r => !r.sent && r.newReading && Number(r.newReading) > r.prevReading);
    if (!unsent.length) { Alert.alert('Thông báo', 'Tất cả phòng đã được gửi hoặc chưa nhập chỉ số hợp lệ.'); return; }

    const totalRecorded = roomElecReadings.reduce((s, r) => s + Math.max(Number(r.newReading) - r.prevReading, 0), 0);
    const feePerKwh = evnData.totalAmount / (totalRecorded || 1);
    const now = new Date().toISOString().split('T')[0];

    const newBills: SharedBill[] = unsent.map(r => {
      const consumption = Math.max(Number(r.newReading) - r.prevReading, 0);
      const fee = Math.round(consumption * feePerKwh);
      return {
        id: `elec-${r.roomId}-${Date.now()}`,
        code: `HD-ELEC-${r.roomCode}-T5`,
        invoiceType: 'electricity' as const,
        roomId: r.roomId, roomName: r.roomCode,
        propertyId: selectedProperty.id, propertyName: selectedProperty.name,
        tenantId: r.roomId, tenantName: r.tenantName, tenantPhone: '',
        month: 5, year: 2026,
        items: [{ label: `Điện (${consumption} kWh)`, amount: fee }],
        totalAmount: fee, lateFee: 0, grandTotal: fee,
        status: 'pending' as BillStatus,
        dueDate: '2026-05-25', createdAt: now,
        kwhUsed: consumption, electricityRate: selectedProperty.electricityRate,
        billingPeriod: evnData.billingPeriod,
      };
    });
    billsStore.addBills(newBills);

    setRoomElecReadings(prev => prev.map(r => {
      if (!r.sent && r.newReading && Number(r.newReading) > r.prevReading) {
        const consumption = Math.max(Number(r.newReading) - r.prevReading, 0);
        const fee = Math.round(consumption * feePerKwh);
        return { ...r, consumption, fee, sent: true };
      }
      return r;
    }));

    const total = newBills.reduce((s, b) => s + b.grandTotal, 0);
    setHistoryEntries(prev => [{
      id: `he-${Date.now()}`, type: 'electricity',
      propertyName: selectedProperty.name, billingPeriod: evnData.billingPeriod,
      totalAmount: total, roomCount: newBills.length, sentAt: now,
    }, ...prev]);

    Alert.alert('Đã gửi', `Đã gửi hóa đơn điện cho ${newBills.length} phòng.`, [
      { text: 'OK', onPress: () => setElecStep('done') },
    ]);
  };

  // Gửi nhà nguyên căn (whole_house) — 1 hóa đơn duy nhất
  const sendWholeHouseElec = () => {
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

    billsStore.addBills([{
      id: `elec-${unit.roomId}-${Date.now()}`,
      code: `HD-ELEC-${selectedProperty.id.toUpperCase()}-T5`,
      invoiceType: 'electricity', propertyType: 'WHOLE_HOUSE',
      roomId: unit.roomId, roomName: unit.roomCode,
      propertyId: selectedProperty.id, propertyName: selectedProperty.name,
      tenantId: unit.roomId, tenantName: unit.tenantName, tenantPhone: '',
      month: 5, year: 2026,
      items: [{ label: `Điện (${consumption} kWh)`, amount: fee }],
      totalAmount: fee, lateFee: 0, grandTotal: fee,
      status: 'pending' as BillStatus,
      dueDate: '2026-05-25', createdAt: now,
      kwhUsed: consumption, electricityRate: selectedProperty.electricityRate,
      billingPeriod: evnData.billingPeriod,
    }]);

    setHistoryEntries(prev => [{
      id: `he-${Date.now()}`, type: 'electricity',
      propertyName: selectedProperty.name, billingPeriod: evnData.billingPeriod,
      totalAmount: fee, roomCount: 1, sentAt: now,
    }, ...prev]);
    setElecStep('done');
  };

  // ── Water helpers ──────────────────────────────────────────────────────────
  const initRoomWaterReadings = (propId: string) => {
    const prop = MOCK_PROPERTIES.find(p => p.id === propId);
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

  const sendWaterInvoices = () => {
    if (!waterBillData || !waterProperty) return;
    const now = new Date().toISOString().split('T')[0];
    const newBills: SharedBill[] = roomWaterReadings.map(r => ({
      id: `water-${r.roomId}-${Date.now()}`,
      code: `HD-WATER-${r.roomCode}-T5`,
      invoiceType: 'water' as const,
      roomId: r.roomId, roomName: r.roomCode,
      propertyId: waterProperty.id, propertyName: waterProperty.name,
      tenantId: r.roomId, tenantName: r.tenantName, tenantPhone: '',
      month: 5, year: 2026,
      items: [{ label: `Nước (${r.consumption} m³ × ${fmt(waterBillData.pricePerM3)})`, amount: r.fee ?? 0 }],
      totalAmount: r.fee ?? 0, lateFee: 0, grandTotal: r.fee ?? 0,
      status: 'pending' as BillStatus,
      dueDate: '2026-05-25', createdAt: now,
      m3Used: r.consumption, waterRate: waterBillData.pricePerM3,
      billingPeriod: waterBillData.billingPeriod,
    }));
    billsStore.addBills(newBills);
    const totalSent = newBills.reduce((s, b) => s + b.grandTotal, 0);
    setHistoryEntries(prev => [{
      id: `hw-${Date.now()}`, type: 'water',
      propertyName: waterProperty.name, billingPeriod: waterBillData.billingPeriod,
      totalAmount: totalSent, roomCount: newBills.length, sentAt: now,
    }, ...prev]);
    setWaterStep('done');
  };

  const resetElec = () => {
    setSelectedPropertyId(null); setEvnData(null);
    setElecStep('select_property'); setRoomElecReadings([]); setEditingEvn(false);
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

        {/* ── STEP 1: Chọn tòa nhà ─────────────────────────────────── */}
        {elecStep === 'select_property' && (
          <View>
            <SectionHeader title="Bước 1: Chọn tòa nhà / căn hộ" />

            <Text style={styles.groupLabel}>🏢 Nhà nhiều phòng</Text>
            {MOCK_PROPERTIES.filter(p => p.type === 'multi_room').map(prop => (
              <TouchableOpacity
                key={prop.id}
                style={[styles.propertyRow, selectedPropertyId === prop.id && styles.propertyRowActive]}
                onPress={() => setSelectedPropertyId(prop.id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.propertyName}>{prop.name}</Text>
                  <Text style={styles.propertyMeta}>{prop.rooms.length} phòng · {prop.rooms.map(r => r.code).join(', ')}</Text>
                </View>
                {selectedPropertyId === prop.id && <Text style={styles.checkMark}>✓</Text>}
              </TouchableOpacity>
            ))}

            <Text style={[styles.groupLabel, { marginTop: Spacing.md }]}>🏠 Nhà nguyên căn</Text>
            {MOCK_PROPERTIES.filter(p => p.type === 'whole_house').map(prop => (
              <TouchableOpacity
                key={prop.id}
                style={[styles.propertyRow, selectedPropertyId === prop.id && styles.propertyRowActive]}
                onPress={() => setSelectedPropertyId(prop.id)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.propertyName}>{prop.name}</Text>
                  <Text style={styles.propertyMeta}>Nguyên căn · {prop.rooms[0].tenantName}</Text>
                </View>
                {selectedPropertyId === prop.id && <Text style={styles.checkMark}>✓</Text>}
              </TouchableOpacity>
            ))}

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
              <TouchableOpacity style={styles.uploadBtn} onPress={simulateEVNScan}>
                <Text style={styles.uploadBtnIcon}>📄</Text>
                <Text style={styles.uploadBtnText}>Tải ảnh / Chụp hóa đơn EVN</Text>
                <Text style={styles.uploadBtnSub}>Tự nhận diện kWh · số tiền · kỳ thanh toán</Text>
              </TouchableOpacity>

              {evnData && !editingEvn && (
                <View style={styles.evnResult}>
                  <View style={styles.evnResultHeader}>
                    <Text style={styles.evnResultTitle}>Thông tin đã nhận diện</Text>
                    <TouchableOpacity onPress={() => setEditingEvn(true)}>
                      <Text style={styles.editLink}>✏️ Sửa</Text>
                    </TouchableOpacity>
                  </View>
                  <EVNDataRow label="Tổng điện"     value={`${evnData.totalKwh} kWh`} />
                  <EVNDataRow label="Tổng tiền"     value={fmt(evnData.totalAmount)} highlight />
                  <EVNDataRow label="Kỳ thanh toán" value={evnData.billingPeriod} />
                </View>
              )}

              {editingEvn && (
                <View style={styles.evnEditForm}>
                  <Text style={styles.formLabel}>Tổng kWh</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={evnEditForm.totalKwh}
                    onChangeText={t => setEvnEditForm(f => ({ ...f, totalKwh: t }))} />
                  <Text style={styles.formLabel}>Tổng tiền (đ)</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={evnEditForm.totalAmount}
                    onChangeText={t => setEvnEditForm(f => ({ ...f, totalAmount: t }))} />
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
                      <Text style={styles.prevReading}>Chỉ số cũ: {r.prevReading} kWh</Text>
                      <View style={styles.readingRow}>
                        <TextInput
                          style={[styles.input, { flex: 1, marginRight: Spacing.sm }]}
                          keyboardType="numeric"
                          placeholder={`> ${r.prevReading}`}
                          value={r.newReading}
                          onChangeText={t => setRoomElecReadings(prev => [{ ...prev[0], newReading: t }])}
                        />
                        <TouchableOpacity style={styles.ocrBtn} onPress={() => simulateRoomOCR(r.roomId)}>
                          <Text style={styles.ocrBtnText}>📷 OCR</Text>
                        </TouchableOpacity>
                      </View>
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

                    <Text style={styles.prevReading}>Chỉ số cũ: {r.prevReading} kWh</Text>

                    {r.sent ? (
                      /* Phòng đã gửi: hiện tóm tắt */
                      <View style={styles.sentSummary}>
                        <Text style={styles.sentSummaryText}>
                          {r.consumption} kWh · {fmt(r.fee ?? 0)} — đã gửi hóa đơn
                        </Text>
                      </View>
                    ) : (
                      /* Phòng chưa gửi: hiện input + nút gửi */
                      <>
                        <View style={styles.readingRow}>
                          <TextInput
                            style={[styles.input, { flex: 1, marginRight: Spacing.sm }]}
                            keyboardType="numeric"
                            placeholder={`> ${r.prevReading}`}
                            value={r.newReading}
                            onChangeText={t => setRoomElecReadings(prev =>
                              prev.map((x, i) => i === idx ? { ...x, newReading: t } : x)
                            )}
                          />
                          <TouchableOpacity style={styles.ocrBtn} onPress={() => simulateRoomOCR(r.roomId)}>
                            <Text style={styles.ocrBtnText}>📷 OCR</Text>
                          </TouchableOpacity>
                        </View>
                        {r.newReading && Number(r.newReading) > r.prevReading && (
                          <TouchableOpacity
                            style={styles.sendRoomBtn}
                            onPress={() => sendSingleRoomElec(r.roomId)}
                          >
                            <Text style={styles.sendRoomBtnText}>
                              ⚡ Gửi hóa đơn phòng {r.roomCode}
                            </Text>
                          </TouchableOpacity>
                        )}
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

        {waterStep === 'bill_entry' && (
          <View>
            <SectionHeader title="Bước 1: Nhập thông tin hóa đơn nước" />
            <View style={styles.card}>
              <Text style={styles.cardDesc}>Nhập thông tin từ hóa đơn nước chính thức khi có.</Text>
              <Text style={styles.formLabel}>Tổng tiền hóa đơn nước (đ) *</Text>
              <TextInput style={styles.input} keyboardType="numeric" placeholder="Ví dụ: 2500000"
                value={waterBillForm.totalAmount}
                onChangeText={t => setWaterBillForm(f => ({ ...f, totalAmount: t }))} />
              <Text style={styles.formLabel}>Đơn giá m³ (đ) *</Text>
              <TextInput style={styles.input} keyboardType="numeric"
                value={waterBillForm.pricePerM3}
                onChangeText={t => setWaterBillForm(f => ({ ...f, pricePerM3: t }))} />
              <Text style={styles.formLabel}>Kỳ thanh toán *</Text>
              <TextInput style={styles.input}
                value={waterBillForm.billingPeriod}
                onChangeText={t => setWaterBillForm(f => ({ ...f, billingPeriod: t }))} />

              <SectionHeader title="Chọn tòa nhà" />
              <Text style={styles.groupLabel}>🏢 Nhà nhiều phòng</Text>
              {MOCK_PROPERTIES.filter(p => p.type === 'multi_room').map(prop => (
                <TouchableOpacity key={prop.id}
                  style={[styles.propertyRow, waterPropertyId === prop.id && styles.propertyRowActive]}
                  onPress={() => setWaterPropertyId(prop.id)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.propertyName}>{prop.name}</Text>
                    <Text style={styles.propertyMeta}>{prop.rooms.length} phòng</Text>
                  </View>
                  {waterPropertyId === prop.id && <Text style={styles.checkMark}>✓</Text>}
                </TouchableOpacity>
              ))}
              <Text style={[styles.groupLabel, { marginTop: Spacing.sm }]}>🏠 Nhà nguyên căn</Text>
              {MOCK_PROPERTIES.filter(p => p.type === 'whole_house').map(prop => (
                <TouchableOpacity key={prop.id}
                  style={[styles.propertyRow, waterPropertyId === prop.id && styles.propertyRowActive]}
                  onPress={() => setWaterPropertyId(prop.id)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.propertyName}>{prop.name}</Text>
                    <Text style={styles.propertyMeta}>Nguyên căn · {prop.rooms[0].tenantName}</Text>
                  </View>
                  {waterPropertyId === prop.id && <Text style={styles.checkMark}>✓</Text>}
                </TouchableOpacity>
              ))}

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
      data={historyEntries}
      keyExtractor={i => i.id}
      contentContainerStyle={styles.tabContent}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={<SectionHeader title="Lịch sử ghi chỉ số & gửi hóa đơn" />}
      renderItem={({ item }) => (
        <View style={styles.historyCard}>
          <View style={styles.historyHeader}>
            <View style={[styles.typeTag, item.type === 'electricity' ? styles.typeTagElec : styles.typeTagWater]}>
              <Text style={styles.typeTagText}>{item.type === 'electricity' ? '⚡ Điện' : '💧 Nước'}</Text>
            </View>
            <Text style={styles.historyDate}>{item.sentAt}</Text>
          </View>
          <Text style={styles.historyProperty}>{item.propertyName}</Text>
          <Text style={styles.historyPeriod}>{item.billingPeriod}</Text>
          <View style={styles.historyFooter}>
            <Text style={styles.historyRooms}>{item.roomCount} {item.roomCount === 1 ? 'đơn vị' : 'phòng'}</Text>
            <Text style={styles.historyAmount}>{fmt(item.totalAmount)}</Text>
          </View>
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📋</Text>
          <Text style={styles.emptyText}>Chưa có lịch sử</Text>
        </View>
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
