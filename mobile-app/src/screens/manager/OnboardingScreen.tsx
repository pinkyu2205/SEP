import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import QRCode from 'react-native-qrcode-svg';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { DatePickerField } from '../../components/common/DatePickerField';
import { realPropertyService, ApiProperty, ApiRoom } from '../../services/propertyService.real';
import { realTenantService, OnboardTenantRequest, TenantContractResponse } from '../../services/tenantService.real';
import { uploadImageToCloudinary } from '../../services/cloudinary';

type RentalMode = 'room' | 'whole_house';

interface HouseholdMemberForm {
  id: string;
  name: string;
  relation: string;
  phone: string;
  dateOfBirth: string; // dd/MM/yyyy
  cccd: string;
}

// URL mốc PayOS redirect về (phải khớp PAYOS_RETURN_URL / PAYOS_CANCEL_URL ở backend)
const PAY_SUCCESS_URL = 'https://slms.app/payment-success';
const PAY_CANCEL_URL = 'https://slms.app/payment-cancel';

const MODE_STEP = 'Chọn loại';
const ROOM_STEPS = [MODE_STEP, 'Chọn phòng', 'Khách thuê', 'Thành viên ở cùng', 'Điện nước', 'Hiện trạng phòng', 'Tạo hợp đồng', 'Thanh toán cọc', 'Xác nhận'];
const WHOLE_HOUSE_STEPS = [MODE_STEP, 'Chọn nhà nguyên căn', 'Khách thuê chính', 'Thành viên ở cùng', 'Điện nước', 'Hiện trạng nhà', 'Tạo hợp đồng', 'Thanh toán cọc', 'Xác nhận'];

const rentalModeOptions: Array<{ mode: RentalMode; title: string; description: string; icon: string }> = [
  { mode: 'room', title: 'Theo phòng', description: 'Chọn toà nhà và phòng trống để thêm khách thuê.', icon: '🚪' },
  { mode: 'whole_house', title: 'Thuê nguyên căn', description: 'Chọn nhà nguyên căn và thêm khách thuê chính.', icon: '🏠' },
];

// ===== Adapter dữ liệu backend -> UI =====
type UiProperty = {
  id: string; name: string; address: string;
  propertyType: 'MULTI_ROOM' | 'WHOLE_HOUSE';
  available: number; monthlyRent: number;
};
type UiRoom = { id: string; code: string; area: number; rentPrice: number; maxOccupants: number };

const mapProperty = (p: ApiProperty): UiProperty => ({
  id: String(p.id),
  name: p.propertyName,
  address: p.fullAddress || p.shortAddress || '',
  propertyType: p.wholeHouse ? 'WHOLE_HOUSE' : 'MULTI_ROOM',
  available: p.totalRooms ?? 0,
  monthlyRent: p.price ?? 0,
});
const mapRoom = (r: ApiRoom): UiRoom => ({
  id: String(r.id), code: r.roomNumber, area: r.area ?? 0, rentPrice: r.price ?? 0,
  maxOccupants: r.maxOccupants ?? 0,
});

const toIsoDate = (ddmmyyyy: string): string => {
  const [d, m, y] = (ddmmyyyy || '').split('/');
  if (!d || !m || !y) return new Date().toISOString().slice(0, 10);
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};
const readErr = (err: any, fallback: string): string => {
  const d = err?.response?.data;
  if (d?.fieldErrors) return Object.values(d.fieldErrors).join(', ');
  return d?.error || d?.message || err?.message || fallback;
};

// Định dạng tiền VNĐ
const onlyDigits = (s: string) => String(s).replace(/[^\d]/g, '');
const parseNum = (s: string) => Number(onlyDigits(s)) || 0;
const formatVnd = (v: string | number) => {
  const n = typeof v === 'number' ? v : parseNum(v);
  return n ? n.toLocaleString('vi-VN') : '';
};

export const OnboardingScreen: React.FC<any> = ({ navigation }) => {
  const [step, setStep] = useState(0);
  const [rentalMode, setRentalMode] = useState<RentalMode | null>(null);

  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedWholeHouseId, setSelectedWholeHouseId] = useState<string | null>(null);

  const [tenantInfo, setTenantInfo] = useState({
    fullName: '', phone: '', cccd: '',
    startDate: new Date().toLocaleDateString('en-GB'), // dd/MM/yyyy
    monthlyRent: '', // chỉ chứa số
  });
  const [depositMonths, setDepositMonths] = useState(1);
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMemberForm[]>([]);
  const [lookupFound, setLookupFound] = useState(false);

  // Điện nước + ảnh đồng hồ
  const [meters, setMeters] = useState({ elec: '', water: '' });
  const [elecMeterUrl, setElecMeterUrl] = useState('');
  const [waterMeterUrl, setWaterMeterUrl] = useState('');
  const [ocrLoading, setOcrLoading] = useState<'elec' | 'water' | null>(null);

  // Ảnh hiện trạng (Cloudinary URLs)
  const [conditionPhotos, setConditionPhotos] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [inspectionNotes, setInspectionNotes] = useState('');

  const [otp, setOtp] = useState('');

  // Dữ liệu thật
  const [properties, setProperties] = useState<UiProperty[]>([]);
  const [availableRooms, setAvailableRooms] = useState<UiRoom[]>([]);

  // Hợp đồng + thanh toán
  const [contract, setContract] = useState<TenantContractResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [showWebView, setShowWebView] = useState(false);
  const [paid, setPaid] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    realPropertyService.getProperties()
      .then(list => setProperties(list.map(mapProperty)))
      .catch(err => Alert.alert('Lỗi tải dữ liệu', readErr(err, 'Không tải được danh sách bất động sản.')));
  }, []);

  useEffect(() => {
    if (!selectedBuildingId) { setAvailableRooms([]); return; }
    realPropertyService.getRooms(Number(selectedBuildingId))
      .then(rooms => setAvailableRooms(rooms.filter(r => r.status === 'AVAILABLE').map(mapRoom)))
      .catch(() => setAvailableRooms([]));
  }, [selectedBuildingId]);

  const roomProperties = properties.filter(p => p.propertyType === 'MULTI_ROOM');
  const wholeHouseProperties = properties.filter(p => p.propertyType === 'WHOLE_HOUSE');
  const selectedBuilding = roomProperties.find(p => p.id === selectedBuildingId);
  const selectedRoom = availableRooms.find(r => r.id === selectedRoomId);
  const selectedWholeHouse = wholeHouseProperties.find(p => p.id === selectedWholeHouseId);

  // Prefill giá thuê theo phòng/nhà đã chọn
  useEffect(() => {
    const price = rentalMode === 'whole_house' ? selectedWholeHouse?.monthlyRent : selectedRoom?.rentPrice;
    if (price) setTenantInfo(prev => ({ ...prev, monthlyRent: String(price) }));
  }, [selectedRoomId, selectedWholeHouseId, rentalMode]); // eslint-disable-line

  // Tự tra cứu khách thuê đã có theo SĐT -> tự điền tên + CCCD
  useEffect(() => {
    const phone = tenantInfo.phone.trim();
    if (phone.length < 9) { setLookupFound(false); return; }
    const t = setTimeout(async () => {
      try {
        const r = await realTenantService.lookupByPhone(phone);
        if (r.exists) {
          setLookupFound(true);
          setTenantInfo(prev => ({
            ...prev,
            fullName: r.fullName || prev.fullName,
            cccd: r.cccd || prev.cccd,
          }));
        } else {
          setLookupFound(false);
        }
      } catch {
        setLookupFound(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [tenantInfo.phone]);

  const rentValue = parseNum(tenantInfo.monthlyRent);
  const depositValue = rentValue * depositMonths;

  // Giới hạn số người ở cùng (chỉ áp dụng thuê theo phòng, dựa trên maxOccupants của phòng)
  const occupantLimit = rentalMode === 'room' ? (selectedRoom?.maxOccupants ?? 0) : 0; // 0 = không giới hạn
  const currentOccupants = 1 + householdMembers.length; // khách chính + thành viên
  const canAddMember = occupantLimit === 0 ? true : currentOccupants < occupantLimit;

  const steps = rentalMode === 'whole_house' ? WHOLE_HOUSE_STEPS : ROOM_STEPS;
  const currentLabel = steps[step];
  const progress = ((step + 1) / steps.length) * 100;

  // Poll trạng thái thanh toán khi ở bước "Thanh toán cọc"
  useEffect(() => {
    if (currentLabel !== 'Thanh toán cọc' || !contract || paid) return;
    const timer = setInterval(async () => {
      try {
        // chủ động hỏi PayOS (local không có webhook) -> đồng bộ trạng thái
        const c = await realTenantService.checkPayment(contract.id);
        if (c.paymentStatus === 'PAID') { setPaid(true); setShowWebView(false); }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(timer);
  }, [currentLabel, contract, paid]);

  const setMode = (mode: RentalMode) => {
    setRentalMode(mode);
    setSelectedBuildingId(null);
    setSelectedRoomId(null);
    setSelectedWholeHouseId(null);
    setMeters({ elec: '', water: '' });
    setElecMeterUrl(''); setWaterMeterUrl('');
    setConditionPhotos([]);
    setInspectionNotes('');
    setOtp('');
    setContract(null); setPaid(false);
  };

  const updateTenantInfo = (key: keyof typeof tenantInfo, value: string) =>
    setTenantInfo(prev => ({ ...prev, [key]: value }));

  const hasRequiredTenantInfo = () =>
    !!tenantInfo.fullName.trim() && !!tenantInfo.phone.trim() && !!tenantInfo.cccd.trim() && rentValue > 0;
  const hasRequiredMeters = () => !!meters.elec.trim() && !!meters.water.trim();

  const handleNext = async () => {
    switch (currentLabel) {
      case MODE_STEP:
        if (!rentalMode) return Alert.alert('Lỗi', 'Vui lòng chọn loại đón khách.');
        break;
      case 'Chọn phòng':
        if (!selectedBuildingId || !selectedRoomId) return Alert.alert('Lỗi', 'Vui lòng chọn toà nhà và phòng trống.');
        break;
      case 'Chọn nhà nguyên căn':
        if (!selectedWholeHouseId) return Alert.alert('Lỗi', 'Vui lòng chọn nhà nguyên căn.');
        break;
      case 'Khách thuê':
      case 'Khách thuê chính':
        if (!hasRequiredTenantInfo()) return Alert.alert('Lỗi', 'Vui lòng nhập Tên, SĐT, CCCD và giá thuê.');
        break;
      case 'Điện nước':
        if (!hasRequiredMeters()) return Alert.alert('Lỗi', 'Vui lòng ghi nhận chỉ số điện nước ban đầu.');
        break;
      case 'Hiện trạng phòng':
      case 'Hiện trạng nhà':
        if (conditionPhotos.length === 0) return Alert.alert('Lỗi', 'Vui lòng chụp/tải ít nhất 1 ảnh hiện trạng.');
        break;
      case 'Tạo hợp đồng':
        await createContractAndPayment();
        return; // createContractAndPayment tự chuyển bước nếu thành công
    }
    if (step < steps.length - 1) setStep(prev => prev + 1);
  };

  const handleBack = () => {
    if (step > 0) { setStep(prev => prev - 1); return; }
    navigation.goBack();
  };

  // ===== Ảnh + OCR =====
  const pickImage = async (useCamera: boolean) => {
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') { Alert.alert('Lỗi', 'Cần quyền camera.'); return null; }
      const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
      return r.canceled ? null : r.assets[0].uri;
    }
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    return r.canceled ? null : r.assets[0].uri;
  };

  const captureMeter = async (kind: 'elec' | 'water', useCamera: boolean) => {
    const uri = await pickImage(useCamera);
    if (!uri) return;
    try {
      setOcrLoading(kind);
      const url = await uploadImageToCloudinary(uri);
      if (kind === 'elec') setElecMeterUrl(url); else setWaterMeterUrl(url);
      // OCR đọc số
      const ocr = await realTenantService.ocrMeter(url);
      if (ocr.reading) {
        setMeters(prev => ({ ...prev, [kind]: ocr.reading }));
      }
    } catch (err: any) {
      Alert.alert('OCR', readErr(err, 'Không đọc được ảnh, vui lòng nhập số tay.'));
    } finally {
      setOcrLoading(null);
    }
  };

  const addConditionPhoto = async (useCamera: boolean) => {
    let uris: string[] = [];
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') { Alert.alert('Lỗi', 'Cần quyền camera.'); return; }
      const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
      if (!r.canceled) uris = [r.assets[0].uri];
    } else {
      // Cho chọn nhiều ảnh cùng lúc từ thư viện
      const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, allowsMultipleSelection: true, selectionLimit: 10 });
      if (!r.canceled) uris = r.assets.map(a => a.uri);
    }
    if (uris.length === 0) return;
    try {
      setPhotoUploading(true);
      const urls = await Promise.all(uris.map(u => uploadImageToCloudinary(u)));
      setConditionPhotos(prev => [...prev, ...urls]);
    } catch (err: any) {
      Alert.alert('Lỗi', readErr(err, 'Upload ảnh thất bại.'));
    } finally {
      setPhotoUploading(false);
    }
  };

  // ===== Household =====
  const addHouseholdMember = () => {
    if (!canAddMember) {
      Alert.alert('Đã đủ số người', `Phòng này cho ở tối đa ${occupantLimit} người (gồm khách thuê chính).`);
      return;
    }
    setHouseholdMembers(prev => [...prev, { id: `m-${Date.now()}`, name: '', relation: '', phone: '', dateOfBirth: '', cccd: '' }]);
  };
  const updateHouseholdMember = (id: string, key: keyof Omit<HouseholdMemberForm, 'id'>, value: string) =>
    setHouseholdMembers(prev => prev.map(m => m.id === id ? { ...m, [key]: value } : m));
  const removeHouseholdMember = (id: string) =>
    setHouseholdMembers(prev => prev.filter(m => m.id !== id));

  // ===== Tạo HĐ + thanh toán =====
  const buildPayload = (): OnboardTenantRequest => ({
    fullName: tenantInfo.fullName.trim(),
    cccd: tenantInfo.cccd.trim(),
    phoneNumber: tenantInfo.phone.trim(),
    moveInDate: toIsoDate(tenantInfo.startDate),
    rentAmount: rentValue,
    deposit: depositValue,
    depositMonths,
    initialElectricReading: parseNum(meters.elec),
    initialWaterReading: parseNum(meters.water),
    electricMeterImageUrl: elecMeterUrl || undefined,
    waterMeterImageUrl: waterMeterUrl || undefined,
    roomConditionUrls: conditionPhotos,
    roomConditionNote: inspectionNotes?.trim() || undefined,
    householdMembers: householdMembers.filter(m => m.name.trim()).map(m => ({
      fullName: m.name.trim(), relation: m.relation, phone: m.phone,
      dateOfBirth: m.dateOfBirth ? toIsoDate(m.dateOfBirth) : undefined, cccd: m.cccd,
    })),
    requireDepositPayment: true,
  });

  const createContractAndPayment = async () => {
    if (contract) { setStep(prev => prev + 1); return; } // đã tạo rồi
    try {
      setCreating(true);
      const payload = buildPayload();
      const created = rentalMode === 'whole_house'
        ? await realTenantService.onboardWholeHouseTenant(Number(selectedWholeHouseId), payload)
        : await realTenantService.onboardRoomTenant(Number(selectedBuildingId), Number(selectedRoomId), payload);

      // Tạo link thanh toán cọc
      const withPay = await realTenantService.createDepositPayment(created.id);
      setContract(withPay);
      setStep(prev => prev + 1); // sang bước Thanh toán cọc
    } catch (err: any) {
      Alert.alert('Lỗi', readErr(err, 'Không tạo được hợp đồng/thanh toán.'));
    } finally {
      setCreating(false);
    }
  };

  const checkPaidNow = async () => {
    if (!contract) return;
    try {
      const c = await realTenantService.checkPayment(contract.id);
      if (c.paymentStatus === 'PAID') { setPaid(true); setShowWebView(false); }
      else Alert.alert('Chưa nhận được thanh toán', 'PayOS chưa ghi nhận giao dịch. Vui lòng thử lại sau vài giây.');
    } catch (err: any) {
      Alert.alert('Lỗi', readErr(err, 'Không kiểm tra được trạng thái.'));
    }
  };

  const verifyOTPAndSubmit = async () => {
    if (otp !== '123456') return Alert.alert('Lỗi', 'Mã OTP không hợp lệ (demo: 123456).');
    if (!contract) return;
    try {
      setConfirming(true);
      const res = await realTenantService.confirmContract(contract.id);
      Alert.alert(
        'Thành công 🎉',
        `Đã hoàn tất hợp đồng ${res.contractCode} cho ${res.tenantFullName}` +
        (res.roomNumber ? ` (phòng ${res.roomNumber}).` : '.') +
        `\n\nTài khoản khách: t${tenantInfo.phone} / 123456`,
        [{ text: 'Hoàn tất', onPress: () => navigation.navigate('ManagerTabs') }]
      );
    } catch (err: any) {
      Alert.alert('Lỗi', readErr(err, 'Không hoàn tất được hợp đồng.'));
    } finally {
      setConfirming(false);
    }
  };

  // ===== RENDER STEPS =====
  const renderModeStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.sectionTitle}>Chọn loại đón khách</Text>
      <Text style={styles.hint}>Chọn đúng mô hình thuê để hệ thống hiển thị các bước phù hợp.</Text>
      <View style={styles.modeGrid}>
        {rentalModeOptions.map(option => {
          const selected = rentalMode === option.mode;
          return (
            <TouchableOpacity key={option.mode} style={[styles.modeCard, selected && styles.modeCardActive]} onPress={() => setMode(option.mode)} activeOpacity={0.85}>
              <View style={[styles.modeIconWrap, selected && styles.modeIconWrapActive]}><Text style={styles.modeIcon}>{option.icon}</Text></View>
              <View style={styles.modeTextBlock}>
                <Text style={[styles.modeTitle, selected && styles.modeTitleActive]}>{option.title}</Text>
                <Text style={[styles.modeDescription, selected && styles.modeDescriptionActive]}>{option.description}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderRoomSelectionStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Chọn toà nhà</Text>
      <View style={styles.cardList}>
        {roomProperties.map(property => {
          const selected = selectedBuildingId === property.id;
          return (
            <TouchableOpacity key={property.id} style={[styles.propertyCard, selected && styles.propertyCardActive]}
              onPress={() => { setSelectedBuildingId(property.id); setSelectedRoomId(null); }} activeOpacity={0.85}>
              <View style={styles.propertyCardTop}>
                <Text style={[styles.propertyName, selected && styles.propertyNameActive]}>{property.name}</Text>
                <Text style={[styles.countPill, selected && styles.countPillActive]}>{property.available} phòng</Text>
              </View>
              <Text style={[styles.propertyMeta, selected && styles.propertyMetaActive]}>{property.address}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {selectedBuildingId && (
        <>
          <Text style={[styles.sectionTitle, styles.nextSectionTitle]}>Chọn phòng trống</Text>
          {availableRooms.length > 0 ? (
            <View style={styles.roomGrid}>
              {availableRooms.map(room => {
                const selected = selectedRoomId === room.id;
                return (
                  <TouchableOpacity key={room.id} style={[styles.roomCard, selected && styles.roomCardActive]} onPress={() => setSelectedRoomId(room.id)} activeOpacity={0.85}>
                    <Text style={styles.roomEmoji}>🚪</Text>
                    <Text style={[styles.roomName, selected && styles.roomNameActive]}>{room.code}</Text>
                    <Text style={[styles.roomMeta, selected && styles.roomMetaActive]}>{room.area}m² · {formatVnd(room.rentPrice)} đ</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyBox}><Text style={styles.emptyText}>Toà nhà này chưa có phòng trống.</Text></View>
          )}
        </>
      )}
    </ScrollView>
  );

  const renderWholeHouseSelectionStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Chọn nhà nguyên căn</Text>
      <View style={styles.cardList}>
        {wholeHouseProperties.map(property => {
          const selected = selectedWholeHouseId === property.id;
          return (
            <TouchableOpacity key={property.id} style={[styles.propertyCard, selected && styles.propertyCardActive]} onPress={() => setSelectedWholeHouseId(property.id)} activeOpacity={0.85}>
              <View style={styles.propertyCardTop}>
                <Text style={[styles.propertyName, selected && styles.propertyNameActive]}>{property.name}</Text>
              </View>
              <Text style={[styles.propertyMeta, selected && styles.propertyMetaActive]}>{property.address}</Text>
              <Text style={[styles.propertyMeta, selected && styles.propertyMetaActive]}>Giá thuê: {formatVnd(property.monthlyRent)} đ/tháng</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderTenantInfoStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>{rentalMode === 'whole_house' ? 'Thông tin khách thuê chính' : 'Thông tin khách thuê'}</Text>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Họ và tên *</Text>
        <TextInput style={styles.input} value={tenantInfo.fullName} onChangeText={v => updateTenantInfo('fullName', v)} placeholder="Nhập họ và tên..." placeholderTextColor={Colors.textMuted} />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Số điện thoại *</Text>
        <TextInput style={styles.input} value={tenantInfo.phone} onChangeText={v => updateTenantInfo('phone', v)} keyboardType="phone-pad" placeholder="090..." placeholderTextColor={Colors.textMuted} />
        {lookupFound && (
          <Text style={styles.foundHint}>✓ Đã tìm thấy khách thuê trong hệ thống — tự điền tên & CCCD.</Text>
        )}
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Căn cước công dân *</Text>
        <TextInput style={styles.input} value={tenantInfo.cccd} onChangeText={v => updateTenantInfo('cccd', v)} keyboardType="number-pad" placeholder="Nhập số CCCD..." placeholderTextColor={Colors.textMuted} />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Giá thuê tháng (VNĐ) *</Text>
        <TextInput
          style={styles.input}
          value={formatVnd(tenantInfo.monthlyRent)}
          onChangeText={v => updateTenantInfo('monthlyRent', onlyDigits(v))}
          keyboardType="numeric"
          placeholder="Tự điền theo BĐS, có thể chỉnh"
          placeholderTextColor={Colors.textMuted}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Tiền cọc</Text>
        <View style={styles.monthRow}>
          {[1, 2].map(m => (
            <TouchableOpacity key={m} style={[styles.monthChip, depositMonths === m && styles.monthChipActive]} onPress={() => setDepositMonths(m)}>
              <Text style={[styles.monthChipText, depositMonths === m && styles.monthChipTextActive]}>{m} tháng</Text>
            </TouchableOpacity>
          ))}
          <View style={styles.depositBox}>
            <Text style={styles.depositValue}>{formatVnd(depositValue) || '0'} đ</Text>
          </View>
        </View>
        <Text style={styles.hintSmall}>Cọc = giá thuê × số tháng (tự tính theo lựa chọn).</Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Ngày bắt đầu tính tiền</Text>
        <DatePickerField value={tenantInfo.startDate} onChange={v => updateTenantInfo('startDate', v)} />
      </View>
    </ScrollView>
  );

  const renderHouseholdMembersStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>Thành viên ở cùng</Text>
          <Text style={styles.hint}>Không bắt buộc. Có thể bổ sung ngày sinh và CCCD cho từng người.</Text>
        </View>
        <TouchableOpacity
          style={[styles.addMemberBtn, !canAddMember && styles.addMemberBtnDisabled]}
          onPress={addHouseholdMember}
          disabled={!canAddMember}
        >
          <Text style={styles.addMemberText}>+ Thêm</Text>
        </TouchableOpacity>
      </View>

      {occupantLimit > 0 && (
        <View style={[styles.occupantBanner, !canAddMember && styles.occupantBannerFull]}>
          <Text style={styles.occupantBannerText}>
            Phòng cho ở tối đa {occupantLimit} người (gồm khách chính). Hiện tại: {currentOccupants}/{occupantLimit}.
            {!canAddMember ? ' Đã đủ số người.' : ''}
          </Text>
        </View>
      )}
      {householdMembers.length === 0 ? (
        <View style={styles.emptyBox}><Text style={styles.emptyText}>Chưa thêm thành viên ở cùng.</Text></View>
      ) : householdMembers.map((member, index) => (
        <View key={member.id} style={styles.memberCard}>
          <View style={styles.memberHeader}>
            <Text style={styles.memberTitle}>Thành viên {index + 1}</Text>
            <TouchableOpacity onPress={() => removeHouseholdMember(member.id)}><Text style={styles.removeText}>Xoá</Text></TouchableOpacity>
          </View>
          <TextInput style={styles.input} value={member.name} onChangeText={v => updateHouseholdMember(member.id, 'name', v)} placeholder="Họ và tên" placeholderTextColor={Colors.textMuted} />
          <View style={styles.memberInputGap} />
          <TextInput style={styles.input} value={member.relation} onChangeText={v => updateHouseholdMember(member.id, 'relation', v)} placeholder="Quan hệ với khách thuê chính" placeholderTextColor={Colors.textMuted} />
          <View style={styles.memberInputGap} />
          <TextInput style={styles.input} value={member.phone} onChangeText={v => updateHouseholdMember(member.id, 'phone', v)} keyboardType="phone-pad" placeholder="Số điện thoại" placeholderTextColor={Colors.textMuted} />
          <View style={styles.memberInputGap} />
          <Text style={styles.label}>Ngày tháng năm sinh</Text>
          <DatePickerField value={member.dateOfBirth} onChange={v => updateHouseholdMember(member.id, 'dateOfBirth', v)} />
          <TextInput style={styles.input} value={member.cccd} onChangeText={v => updateHouseholdMember(member.id, 'cccd', v)} keyboardType="number-pad" placeholder="Số CCCD" placeholderTextColor={Colors.textMuted} />
        </View>
      ))}
    </ScrollView>
  );

  const renderMeterInput = (kind: 'elec' | 'water') => {
    const url = kind === 'elec' ? elecMeterUrl : waterMeterUrl;
    return (
      <View style={styles.meterCard}>
        <View style={styles.meterRow}>
          <Text style={styles.meterEmoji}>{kind === 'elec' ? '⚡' : '💧'}</Text>
          <View style={styles.meterTextBlock}>
            <Text style={styles.meterTitle}>{kind === 'elec' ? 'Chỉ số điện' : 'Chỉ số nước'}</Text>
            <Text style={styles.meterHint}>{kind === 'elec' ? 'Đơn vị kWh' : 'Đơn vị m³'}</Text>
          </View>
        </View>
        <View style={styles.ocrBtnRow}>
          <TouchableOpacity style={styles.ocrBtn} onPress={() => captureMeter(kind, true)} disabled={ocrLoading !== null}>
            <Text style={styles.ocrBtnText}>📷 Chụp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ocrBtn} onPress={() => captureMeter(kind, false)} disabled={ocrLoading !== null}>
            <Text style={styles.ocrBtnText}>🖼 Chọn ảnh</Text>
          </TouchableOpacity>
          {ocrLoading === kind && <ActivityIndicator color={Colors.primary} style={{ marginLeft: 8 }} />}
        </View>
        {!!url && <Image source={{ uri: url }} style={styles.meterThumb} />}
        <TextInput
          style={styles.input}
          value={meters[kind]}
          onChangeText={v => setMeters(prev => ({ ...prev, [kind]: v }))}
          keyboardType="numeric"
          placeholder="OCR tự điền, có thể chỉnh"
          placeholderTextColor={Colors.textMuted}
        />
      </View>
    );
  };

  const renderMeterStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Ghi nhận điện nước ban đầu</Text>
      <Text style={styles.hint}>Chụp/chọn ảnh đồng hồ — hệ thống OCR tự điền chỉ số, bạn có thể chỉnh lại. Ảnh được lưu kèm hợp đồng.</Text>
      {renderMeterInput('elec')}
      {renderMeterInput('water')}
    </ScrollView>
  );

  const renderConditionPhotoStep = () => {
    const targetLabel = rentalMode === 'whole_house' ? 'nhà' : 'phòng';
    return (
      <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Ảnh hiện trạng {targetLabel}</Text>
        <Text style={styles.hint}>Chụp lại tường, cửa, thiết bị... để lưu bằng chứng bàn giao.</Text>
        <View style={styles.ocrBtnRow}>
          <TouchableOpacity style={styles.cameraBtn} onPress={() => addConditionPhoto(true)} disabled={photoUploading} activeOpacity={0.85}>
            <Text style={styles.cameraIcon}>📸</Text>
            <Text style={styles.cameraBtnText}>Chụp ảnh</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cameraBtn} onPress={() => addConditionPhoto(false)} disabled={photoUploading} activeOpacity={0.85}>
            <Text style={styles.cameraIcon}>🖼</Text>
            <Text style={styles.cameraBtnText}>Chọn ảnh</Text>
          </TouchableOpacity>
        </View>
        {photoUploading && <View style={styles.uploadingRow}><ActivityIndicator color={Colors.primary} /><Text style={styles.uploadingText}>Đang tải ảnh...</Text></View>}
        {conditionPhotos.length > 0 && (
          <View style={styles.photoGrid}>
            {conditionPhotos.map((uri, i) => (
              <View key={`${uri}-${i}`} style={styles.photoWrap}>
                <Image source={{ uri }} style={styles.photoThumb} />
                <TouchableOpacity style={styles.removePhotoBtn} onPress={() => setConditionPhotos(prev => prev.filter(x => x !== uri))}>
                  <Text style={styles.removePhotoText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Ghi chú hiện trạng</Text>
          <TextInput style={[styles.input, styles.notesInput]} value={inspectionNotes} onChangeText={setInspectionNotes} multiline placeholder="Tường sạch, cửa tốt, máy lạnh đã kiểm tra..." placeholderTextColor={Colors.textMuted} />
        </View>
      </ScrollView>
    );
  };

  const renderContractStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Xem lại & tạo hợp đồng</Text>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Tài sản</Text>
        <Text style={styles.summaryValue}>{rentalMode === 'whole_house' ? selectedWholeHouse?.name : `${selectedBuilding?.name} · ${selectedRoom?.code}`}</Text>
        <Text style={styles.summaryLabel}>Khách thuê</Text>
        <Text style={styles.summaryValue}>{tenantInfo.fullName || 'Chưa nhập'} · {tenantInfo.phone}</Text>
        <Text style={styles.summaryLabel}>Giá thuê / Cọc</Text>
        <Text style={styles.summaryValue}>{formatVnd(rentValue)} đ/tháng · cọc {formatVnd(depositValue)} đ ({depositMonths} tháng)</Text>
        <Text style={styles.summaryLabel}>Điện nước đầu kỳ</Text>
        <Text style={styles.summaryValue}>Điện {meters.elec || '-'} kWh · Nước {meters.water || '-'} m³</Text>
        <Text style={styles.summaryLabel}>Ảnh hiện trạng</Text>
        <Text style={styles.summaryValue}>{conditionPhotos.length} ảnh</Text>
        {rentalMode === 'whole_house' && (
          <>
            <Text style={styles.summaryLabel}>Thành viên ở cùng</Text>
            <Text style={styles.summaryValue}>{householdMembers.filter(m => m.name.trim()).length} người</Text>
          </>
        )}
      </View>
      <Text style={styles.hint}>Nhấn "Tiếp tục" để tạo hợp đồng và sang bước thanh toán tiền cọc.</Text>
    </ScrollView>
  );

  const renderPaymentStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Thanh toán tiền cọc</Text>
      <Text style={styles.hint}>Khách chuyển khoản tiền cọc {formatVnd(depositValue)} đ qua PayOS. Sau khi hệ thống ghi nhận, mới sang bước xác thực OTP.</Text>

      {paid ? (
        <View style={styles.paidBox}>
          <Text style={styles.paidIcon}>✅</Text>
          <Text style={styles.paidText}>Đã nhận thanh toán tiền cọc!</Text>
        </View>
      ) : (
        <>
          {!!contract?.payosQrCode && !showWebView && (
            <View style={styles.qrBox}>
              <Text style={styles.qrAmount}>{formatVnd(depositValue)} đ</Text>
              <View style={styles.qrWrap}>
                <QRCode value={contract.payosQrCode} size={220} />
              </View>
              <Text style={styles.qrCaption}>Khách quét mã VietQR bằng app ngân hàng để thanh toán tiền cọc.</Text>
            </View>
          )}
          {!!contract?.payosCheckoutUrl && !showWebView && (
            <TouchableOpacity style={styles.payBtn} onPress={() => setShowWebView(true)}>
              <Text style={styles.payBtnText}>💳 Mở trang thanh toán PayOS</Text>
            </TouchableOpacity>
          )}
          {showWebView && !!contract?.payosCheckoutUrl && (
            <View style={styles.webviewBox}>
              <WebView
                source={{ uri: contract.payosCheckoutUrl }}
                onNavigationStateChange={(nav) => {
                  if (nav.url?.startsWith(PAY_SUCCESS_URL)) { setShowWebView(false); checkPaidNow(); }
                  else if (nav.url?.startsWith(PAY_CANCEL_URL)) { setShowWebView(false); }
                }}
              />
            </View>
          )}
          <TouchableOpacity style={styles.checkBtn} onPress={checkPaidNow}>
            <Text style={styles.checkBtnText}>Tôi đã chuyển khoản — Kiểm tra</Text>
          </TouchableOpacity>
          <View style={styles.uploadingRow}><ActivityIndicator color={Colors.primary} /><Text style={styles.uploadingText}>Đang chờ xác nhận thanh toán...</Text></View>
        </>
      )}
    </ScrollView>
  );

  const renderConfirmationStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Xác thực OTP</Text>
      <Text style={styles.hint}>Hệ thống gửi OTP đến SĐT {tenantInfo.phone} để khách xác nhận hợp đồng. (Demo: nhập 123456)</Text>
      <View style={[styles.inputGroup, styles.otpGroup]}>
        <Text style={styles.label}>Mã OTP</Text>
        <TextInput style={[styles.input, styles.otpInput]} value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} placeholder="------" placeholderTextColor={Colors.textMuted} />
      </View>
      <TouchableOpacity
        style={[styles.submitBtn, otp.length === 6 ? styles.submitBtnReady : styles.submitBtnDisabled]}
        onPress={verifyOTPAndSubmit}
        disabled={otp.length !== 6 || confirming}
      >
        {confirming ? <ActivityIndicator color={Colors.white} /> : (
          <Text style={[styles.submitBtnText, otp.length === 6 ? styles.submitTextReady : styles.submitTextDisabled]}>Hoàn tất khởi tạo</Text>
        )}
      </TouchableOpacity>
      <View style={styles.bottomSpacer} />
    </ScrollView>
  );

  const renderBody = () => {
    switch (currentLabel) {
      case MODE_STEP: return renderModeStep();
      case 'Chọn phòng': return renderRoomSelectionStep();
      case 'Chọn nhà nguyên căn': return renderWholeHouseSelectionStep();
      case 'Khách thuê':
      case 'Khách thuê chính': return renderTenantInfoStep();
      case 'Thành viên ở cùng': return renderHouseholdMembersStep();
      case 'Điện nước': return renderMeterStep();
      case 'Hiện trạng phòng':
      case 'Hiện trạng nhà': return renderConditionPhotoStep();
      case 'Tạo hợp đồng': return renderContractStep();
      case 'Thanh toán cọc': return renderPaymentStep();
      case 'Xác nhận': return renderConfirmationStep();
      default: return null;
    }
  };

  // Ẩn nút "Tiếp tục" ở bước cuối (Xác nhận) và bước Thanh toán khi chưa trả
  const showNextButton = currentLabel !== 'Xác nhận' && !(currentLabel === 'Thanh toán cọc' && !paid);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}><Text style={styles.backText}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>Đón khách mới</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
        <Text style={styles.progressText}>Bước {step + 1}: {currentLabel}</Text>
      </View>

      <View style={styles.body}>{renderBody()}</View>

      {showNextButton && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.nextBtn} onPress={handleNext} disabled={creating}>
            {creating ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.nextBtnText}>Tiếp tục →</Text>}
          </TouchableOpacity>
        </View>
      )}

      {(photoUploading || ocrLoading !== null) && (
        <View style={styles.uploadOverlay}>
          <View style={styles.uploadOverlayCard}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.uploadOverlayText}>
              {ocrLoading !== null ? 'Đang tải ảnh & đọc chỉ số...' : 'Đang tải ảnh lên...'}
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: Colors.white, ...Shadow.sm },
  backBtn: { width: 70 },
  backText: { color: Colors.primary, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  headerSpacer: { width: 70 },

  progressContainer: { padding: Spacing.lg, backgroundColor: Colors.white, borderBottomWidth: 1, borderColor: Colors.divider },
  progressBar: { height: 6, backgroundColor: Colors.divider, borderRadius: 3, overflow: 'hidden', marginBottom: Spacing.sm },
  progressFill: { height: '100%', backgroundColor: Colors.primary },
  progressText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center' },

  body: { flex: 1, padding: Spacing.lg },
  stepContent: { flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  nextSectionTitle: { marginTop: Spacing.xl },
  hint: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: Spacing.lg },
  hintSmall: { fontSize: 12, color: Colors.textSecondary, marginTop: 6 },

  modeGrid: { gap: Spacing.md },
  modeCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, backgroundColor: Colors.white, borderRadius: BorderRadius.lg, borderWidth: 2, borderColor: Colors.border, padding: Spacing.lg, ...Shadow.sm },
  modeCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  modeIconWrap: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9' },
  modeIconWrapActive: { backgroundColor: '#E0E7FF' },
  modeIcon: { fontSize: 28 },
  modeTextBlock: { flex: 1 },
  modeTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  modeTitleActive: { color: Colors.primary },
  modeDescription: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  modeDescriptionActive: { color: Colors.textPrimary },

  cardList: { gap: Spacing.md },
  propertyCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, borderWidth: 2, borderColor: Colors.border, padding: Spacing.base },
  propertyCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  propertyCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: 6 },
  propertyName: { flex: 1, fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  propertyNameActive: { color: Colors.primary },
  propertyMeta: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  propertyMetaActive: { color: Colors.textPrimary },
  countPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: BorderRadius.full, backgroundColor: '#EEF2FF', color: Colors.primary, fontSize: 11, fontWeight: '800' },
  countPillActive: { backgroundColor: Colors.primary, color: Colors.white },

  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  roomCard: { width: '47%', minHeight: 116, padding: Spacing.base, backgroundColor: Colors.white, borderRadius: BorderRadius.lg, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  roomCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  roomEmoji: { fontSize: 24, marginBottom: Spacing.xs },
  roomName: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  roomNameActive: { color: Colors.primary },
  roomMeta: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
  roomMetaActive: { color: Colors.textPrimary },

  inputGroup: { marginBottom: Spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
  input: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: 16, color: Colors.textPrimary },

  monthRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  monthChip: { paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  monthChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  monthChipText: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  monthChipTextActive: { color: Colors.primary },
  depositBox: { flex: 1, alignItems: 'flex-end' },
  depositValue: { fontSize: 16, fontWeight: '800', color: Colors.primary },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  sectionHeaderText: { flex: 1 },
  addMemberBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md },
  addMemberBtnDisabled: { backgroundColor: Colors.divider },
  addMemberText: { color: Colors.white, fontWeight: '700' },
  occupantBanner: { backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md },
  occupantBannerFull: { backgroundColor: '#FEF2F2' },
  occupantBannerText: { fontSize: 13, color: Colors.textPrimary, fontWeight: '600' },
  foundHint: { fontSize: 12, color: Colors.success, marginTop: 6, fontWeight: '600' },
  memberCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.base, marginBottom: Spacing.md },
  memberHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  memberTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  removeText: { fontSize: 13, fontWeight: '700', color: Colors.error },
  memberInputGap: { height: Spacing.sm },

  meterCard: { backgroundColor: Colors.white, padding: Spacing.base, borderRadius: BorderRadius.lg, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  meterEmoji: { fontSize: 24 },
  meterTextBlock: { flex: 1 },
  meterTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  meterHint: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  meterThumb: { width: '100%', height: 150, borderRadius: BorderRadius.md, marginBottom: Spacing.md, backgroundColor: Colors.divider },
  ocrBtnRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  ocrBtn: { backgroundColor: Colors.primaryBg, paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: BorderRadius.md },
  ocrBtnText: { color: Colors.primary, fontWeight: '700' },

  cameraBtn: { flex: 1, backgroundColor: Colors.white, borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed', borderRadius: BorderRadius.lg, minHeight: 96, alignItems: 'center', justifyContent: 'center', padding: Spacing.md },
  cameraIcon: { fontSize: 28, marginBottom: Spacing.xs },
  cameraBtnText: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: Spacing.md },
  uploadingText: { color: Colors.textSecondary, fontSize: 13 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  photoWrap: { width: '31%', aspectRatio: 1, borderRadius: BorderRadius.md, overflow: 'hidden', backgroundColor: Colors.divider },
  photoThumb: { width: '100%', height: '100%', backgroundColor: Colors.divider },
  removePhotoBtn: { position: 'absolute', top: 5, right: 5, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(15,23,42,0.7)', alignItems: 'center', justifyContent: 'center' },
  removePhotoText: { color: Colors.white, fontSize: 18, fontWeight: '900', lineHeight: 21 },
  notesInput: { minHeight: 92, textAlignVertical: 'top', marginTop: Spacing.md },

  emptyBox: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, alignItems: 'center' },
  emptyText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },

  summaryCard: { backgroundColor: Colors.primaryBg, padding: Spacing.lg, borderRadius: BorderRadius.lg, marginBottom: Spacing.xl },
  summaryLabel: { fontSize: 11, fontWeight: '800', color: Colors.primary, textTransform: 'uppercase', marginBottom: 3 },
  summaryValue: { fontSize: 15, color: Colors.primaryDark, fontWeight: '700', marginBottom: Spacing.md },

  qrBox: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, alignItems: 'center', marginBottom: Spacing.md },
  qrAmount: { fontSize: 22, fontWeight: '800', color: Colors.primary, marginBottom: Spacing.md },
  qrWrap: { padding: Spacing.md, backgroundColor: Colors.white, borderRadius: BorderRadius.md },
  qrCaption: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.md },
  payBtn: { backgroundColor: Colors.primary, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center', marginBottom: Spacing.md },
  payBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  webviewBox: { height: 460, borderRadius: BorderRadius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md },
  checkBtn: { borderWidth: 1, borderColor: Colors.primary, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center' },
  checkBtnText: { color: Colors.primary, fontSize: 15, fontWeight: '700' },
  paidBox: { backgroundColor: '#ECFDF5', borderRadius: BorderRadius.lg, padding: Spacing.xl, alignItems: 'center' },
  paidIcon: { fontSize: 40, marginBottom: Spacing.sm },
  paidText: { fontSize: 16, fontWeight: '800', color: Colors.success },

  otpGroup: { marginTop: Spacing.sm },
  otpInput: { fontSize: 24, textAlign: 'center', letterSpacing: 5 },
  submitBtn: { padding: Spacing.lg, borderRadius: BorderRadius.lg, alignItems: 'center', marginTop: Spacing.lg },
  submitBtnReady: { backgroundColor: Colors.success },
  submitBtnDisabled: { backgroundColor: Colors.divider },
  submitBtnText: { fontSize: 16, fontWeight: '700' },
  submitTextReady: { color: Colors.white },
  submitTextDisabled: { color: Colors.textMuted },
  bottomSpacer: { height: 100 },

  footer: { padding: Spacing.lg, backgroundColor: Colors.white, borderTopWidth: 1, borderColor: Colors.divider },
  nextBtn: { backgroundColor: Colors.primary, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center' },
  nextBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },

  uploadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  uploadOverlayCard: { backgroundColor: Colors.white, paddingVertical: Spacing.xl, paddingHorizontal: Spacing.xl, borderRadius: BorderRadius.lg, alignItems: 'center', minWidth: 200 },
  uploadOverlayText: { marginTop: Spacing.md, fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
});
