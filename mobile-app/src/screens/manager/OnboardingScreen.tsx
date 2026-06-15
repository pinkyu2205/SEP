import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { DatePickerField } from '../../components/common/DatePickerField';
import { realPropertyService, ApiProperty, ApiRoom } from '../../services/propertyService.real';
import { realTenantService, OnboardTenantRequest } from '../../services/tenantService.real';

// ===== Adapter giữa dữ liệu backend thật và UI wizard hiện có =====
type UiProperty = {
  id: string;
  name: string;
  address: string;
  propertyType: 'MULTI_ROOM' | 'WHOLE_HOUSE';
  available: number;
  rentalStatus: 'vacant' | 'occupied';
  monthlyRent: number;
};
type UiRoom = { id: string; code: string; area: number; rentPrice: number; status: 'available' };

const mapProperty = (p: ApiProperty): UiProperty => ({
  id: String(p.id),
  name: p.propertyName,
  address: p.fullAddress || p.shortAddress || '',
  propertyType: p.wholeHouse ? 'WHOLE_HOUSE' : 'MULTI_ROOM',
  available: p.totalRooms ?? 0,
  rentalStatus: 'vacant', // backend chặn trùng HĐ active nên không cần tính trước ở client
  monthlyRent: p.price ?? 0,
});
const mapRoom = (r: ApiRoom): UiRoom => ({
  id: String(r.id),
  code: r.roomNumber,
  area: r.area ?? 0,
  rentPrice: r.price ?? 0,
  status: 'available',
});

const toIsoDate = (ddmmyyyy: string): string => {
  const [d, m, y] = (ddmmyyyy || '').split('/');
  if (!d || !m || !y) return new Date().toISOString().slice(0, 10);
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};
const readErr = (err: any, fallback: string): string =>
  err?.response?.data?.error || err?.response?.data?.message || err?.message || fallback;

type RentalMode = 'room' | 'whole_house';

interface HouseholdMemberForm {
  id: string;
  name: string;
  relation: string;
  phone: string;
}

const MODE_STEP = 'Chọn loại';
const ROOM_STEPS = [MODE_STEP, 'Chọn phòng', 'Khách thuê', 'Điện nước', 'Hiện trạng phòng', 'Tạo hợp đồng', 'Xác nhận'];
const WHOLE_HOUSE_STEPS = [MODE_STEP, 'Chọn nhà nguyên căn', 'Khách thuê chính', 'Thành viên ở cùng', 'Điện nước', 'Hiện trạng nhà', 'Tạo hợp đồng', 'Xác nhận'];

const rentalModeOptions: Array<{ mode: RentalMode; title: string; description: string; icon: string }> = [
  {
    mode: 'room',
    title: 'Theo phòng',
    description: 'Chọn toà nhà và phòng trống để thêm khách thuê.',
    icon: '🚪',
  },
  {
    mode: 'whole_house',
    title: 'Thuê nguyên căn',
    description: 'Chọn nhà nguyên căn và thêm khách thuê chính.',
    icon: '🏠',
  },
];

export const OnboardingScreen: React.FC<any> = ({ navigation }) => {
  const [step, setStep] = useState(0);
  const [rentalMode, setRentalMode] = useState<RentalMode | null>(null);

  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedWholeHouseId, setSelectedWholeHouseId] = useState<string | null>(null);

  const [tenantInfo, setTenantInfo] = useState({
    fullName: '',
    phone: '',
    cccd: '',
    deposit: '3000000',
    startDate: '10/05/2026',
    monthlyRent: '',
  });
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMemberForm[]>([]);
  const [meters, setMeters] = useState({ elec: '', water: '' });
  const [conditionPhotos, setConditionPhotos] = useState<string[]>([]);
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [otp, setOtp] = useState('');

  const [properties, setProperties] = useState<UiProperty[]>([]);
  const [availableRooms, setAvailableRooms] = useState<UiRoom[]>([]);

  // Load danh sách bất động sản thật khi mở màn hình
  useEffect(() => {
    realPropertyService
      .getProperties()
      .then(list => setProperties(list.map(mapProperty)))
      .catch(err =>
        Alert.alert(
          'Lỗi tải dữ liệu',
          readErr(err, 'Không tải được danh sách bất động sản. Kiểm tra đăng nhập và kết nối backend.')
        )
      );
  }, []);

  // Load phòng trống khi chọn toà (chế độ theo phòng)
  useEffect(() => {
    if (!selectedBuildingId) {
      setAvailableRooms([]);
      return;
    }
    realPropertyService
      .getRooms(Number(selectedBuildingId))
      .then(rooms => setAvailableRooms(rooms.filter(r => r.status === 'AVAILABLE').map(mapRoom)))
      .catch(() => setAvailableRooms([]));
  }, [selectedBuildingId]);

  const roomProperties = properties.filter(property => property.propertyType === 'MULTI_ROOM');
  const wholeHouseProperties = properties.filter(property => property.propertyType === 'WHOLE_HOUSE');
  const selectedBuilding = roomProperties.find(property => property.id === selectedBuildingId);
  const selectedRoom = availableRooms.find(room => room.id === selectedRoomId);
  const selectedWholeHouse = wholeHouseProperties.find(property => property.id === selectedWholeHouseId);

  const steps = rentalMode === 'whole_house' ? WHOLE_HOUSE_STEPS : ROOM_STEPS;
  const progress = ((step + 1) / steps.length) * 100;

  const setMode = (mode: RentalMode) => {
    setRentalMode(mode);
    setSelectedBuildingId(null);
    setSelectedRoomId(null);
    setSelectedWholeHouseId(null);
    setMeters({ elec: '', water: '' });
    setConditionPhotos([]);
    setInspectionNotes('');
    setOtp('');
  };

  const updateTenantInfo = (key: keyof typeof tenantInfo, value: string) => {
    setTenantInfo(prev => ({ ...prev, [key]: value }));
  };

  const handleNext = () => {
    if (step === 0 && !rentalMode) {
      return Alert.alert('Lỗi', 'Vui lòng chọn loại đón khách.');
    }

    if (rentalMode === 'room') {
      if (step === 1 && (!selectedBuildingId || !selectedRoomId)) {
        return Alert.alert('Lỗi', 'Vui lòng chọn toà nhà và phòng trống.');
      }
      if (step === 2 && !hasRequiredTenantInfo()) {
        return Alert.alert('Lỗi', 'Vui lòng nhập Tên, SĐT và số CCCD.');
      }
      if (step === 3 && !hasRequiredMeters()) {
        return Alert.alert('Lỗi', 'Vui lòng ghi nhận chỉ số điện nước ban đầu.');
      }
      if (step === 4 && conditionPhotos.length === 0) {
        return Alert.alert('Lỗi', 'Vui lòng chụp ít nhất 1 ảnh hiện trạng phòng.');
      }
    }

    if (rentalMode === 'whole_house') {
      if (step === 1 && !selectedWholeHouseId) {
        return Alert.alert('Lỗi', 'Vui lòng chọn nhà nguyên căn.');
      }
      if (step === 2 && !hasRequiredTenantInfo()) {
        return Alert.alert('Lỗi', 'Vui lòng nhập Tên, SĐT và số CCCD của khách thuê chính.');
      }
      if (step === 4 && !hasRequiredMeters()) {
        return Alert.alert('Lỗi', 'Vui lòng ghi nhận chỉ số điện nước ban đầu.');
      }
      if (step === 5 && conditionPhotos.length === 0) {
        return Alert.alert('Lỗi', 'Vui lòng chụp ít nhất 1 ảnh hiện trạng nhà.');
      }
    }

    if (step < steps.length - 1) {
      setStep(prev => prev + 1);
    }
  };

  const hasRequiredTenantInfo = () =>
    !!tenantInfo.fullName.trim() && !!tenantInfo.phone.trim() && !!tenantInfo.cccd.trim();

  const hasRequiredMeters = () =>
    !!meters.elec.trim() && !!meters.water.trim();

  const handleBack = () => {
    if (step > 0) {
      setStep(prev => prev - 1);
      return;
    }
    navigation.goBack();
  };

  const addHouseholdMember = () => {
    setHouseholdMembers(prev => [
      ...prev,
      { id: `member-${Date.now()}`, name: '', relation: '', phone: '' },
    ]);
  };

  const updateHouseholdMember = (
    id: string,
    key: keyof Omit<HouseholdMemberForm, 'id'>,
    value: string
  ) => {
    setHouseholdMembers(prev =>
      prev.map(member => member.id === id ? { ...member, [key]: value } : member)
    );
  };

  const removeHouseholdMember = (id: string) => {
    setHouseholdMembers(prev => prev.filter(member => member.id !== id));
  };

  const handleCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      return Alert.alert('Lỗi', 'Cần quyền truy cập camera để chụp ảnh hiện trạng.');
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 0.5 });
    if (!result.canceled && result.assets[0]) {
      setConditionPhotos(prev => [...prev, result.assets[0].uri]);
    }
  };

  const verifyOTPAndSubmit = async () => {
    if (otp !== '123456') {
      return Alert.alert('Lỗi', 'Mã OTP không hợp lệ. Vui lòng thử lại (demo: 123456).');
    }

    const rentVal = Number(
      tenantInfo.monthlyRent ||
      (rentalMode === 'whole_house' ? selectedWholeHouse?.monthlyRent : selectedRoom?.rentPrice) ||
      0
    );
    const payload: OnboardTenantRequest = {
      fullName: tenantInfo.fullName.trim(),
      cccd: tenantInfo.cccd.trim(),
      phoneNumber: tenantInfo.phone.trim(),
      moveInDate: toIsoDate(tenantInfo.startDate),
      rentAmount: rentVal,
      deposit: Number(tenantInfo.deposit || 0),
      equipmentSnapshot: inspectionNotes?.trim() || undefined,
    };

    try {
      const res = rentalMode === 'whole_house'
        ? await realTenantService.onboardWholeHouseTenant(Number(selectedWholeHouseId), payload)
        : await realTenantService.onboardRoomTenant(
            Number(selectedBuildingId),
            Number(selectedRoomId),
            payload
          );

      Alert.alert(
        'Thành công 🎉',
        `Đã tạo hợp đồng ${res.contractCode} cho ${res.tenantFullName}` +
        (res.roomNumber ? ` (phòng ${res.roomNumber}).` : '.') +
        `\n\nTài khoản khách thuê: t${payload.phoneNumber} / 123456`,
        [{ text: 'Hoàn tất', onPress: () => navigation.navigate('ManagerTabs') }]
      );
    } catch (err: any) {
      Alert.alert('Lỗi', readErr(err, 'Không tạo được hợp đồng. Vui lòng thử lại.'));
    }
  };

  const renderModeStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.sectionTitle}>Chọn loại đón khách</Text>
      <Text style={styles.hint}>Chọn đúng mô hình thuê để hệ thống hiển thị các bước phù hợp.</Text>

      <View style={styles.modeGrid}>
        {rentalModeOptions.map(option => {
          const selected = rentalMode === option.mode;
          return (
            <TouchableOpacity
              key={option.mode}
              style={[styles.modeCard, selected && styles.modeCardActive]}
              onPress={() => setMode(option.mode)}
              activeOpacity={0.85}
            >
              <View style={[styles.modeIconWrap, selected && styles.modeIconWrapActive]}>
                <Text style={styles.modeIcon}>{option.icon}</Text>
              </View>
              <View style={styles.modeTextBlock}>
                <Text style={[styles.modeTitle, selected && styles.modeTitleActive]}>{option.title}</Text>
                <Text style={[styles.modeDescription, selected && styles.modeDescriptionActive]}>
                  {option.description}
                </Text>
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
            <TouchableOpacity
              key={property.id}
              style={[styles.propertyCard, selected && styles.propertyCardActive]}
              onPress={() => {
                setSelectedBuildingId(property.id);
                setSelectedRoomId(null);
              }}
              activeOpacity={0.85}
            >
              <View style={styles.propertyCardTop}>
                <Text style={[styles.propertyName, selected && styles.propertyNameActive]}>{property.name}</Text>
                <Text style={[styles.countPill, selected && styles.countPillActive]}>
                  {property.available} phòng
                </Text>
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
                  <TouchableOpacity
                    key={room.id}
                    style={[styles.roomCard, selected && styles.roomCardActive]}
                    onPress={() => setSelectedRoomId(room.id)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.roomEmoji}>🚪</Text>
                    <Text style={[styles.roomName, selected && styles.roomNameActive]}>{room.code}</Text>
                    <Text style={[styles.roomMeta, selected && styles.roomMetaActive]}>
                      {room.area}m² · {room.rentPrice.toLocaleString('vi-VN')} đ
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>Toà nhà này chưa có phòng trống.</Text>
            </View>
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
          const disabled = property.rentalStatus !== 'vacant';
          return (
            <TouchableOpacity
              key={property.id}
              style={[
                styles.propertyCard,
                selected && styles.propertyCardActive,
                disabled && styles.propertyCardDisabled,
              ]}
              onPress={() => !disabled && setSelectedWholeHouseId(property.id)}
              activeOpacity={disabled ? 1 : 0.85}
            >
              <View style={styles.propertyCardTop}>
                <Text style={[styles.propertyName, selected && styles.propertyNameActive]}>{property.name}</Text>
                <Text style={[
                  styles.countPill,
                  selected && styles.countPillActive,
                  disabled && styles.countPillDisabled,
                ]}>
                  {property.rentalStatus === 'vacant' ? 'Đang trống' : 'Đã có khách'}
                </Text>
              </View>
              <Text style={[styles.propertyMeta, selected && styles.propertyMetaActive]}>{property.address}</Text>
              <Text style={[styles.propertyMeta, selected && styles.propertyMetaActive]}>
                Giá thuê: {(property.monthlyRent || 0).toLocaleString('vi-VN')} đ/tháng
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );

  const renderTenantInfoStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>
        {rentalMode === 'whole_house' ? 'Thông tin khách thuê chính' : 'Thông tin khách thuê'}
      </Text>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Họ và tên *</Text>
        <TextInput
          style={styles.input}
          value={tenantInfo.fullName}
          onChangeText={value => updateTenantInfo('fullName', value)}
          placeholder="Nhập họ và tên..."
          placeholderTextColor={Colors.textMuted}
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Số điện thoại *</Text>
        <TextInput
          style={styles.input}
          value={tenantInfo.phone}
          onChangeText={value => updateTenantInfo('phone', value)}
          keyboardType="phone-pad"
          placeholder="090..."
          placeholderTextColor={Colors.textMuted}
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Căn cước công dân *</Text>
        <TextInput
          style={styles.input}
          value={tenantInfo.cccd}
          onChangeText={value => updateTenantInfo('cccd', value)}
          keyboardType="number-pad"
          placeholder="Nhập số CCCD..."
          placeholderTextColor={Colors.textMuted}
        />
      </View>

      <View style={styles.row}>
        <View style={[styles.inputGroup, styles.rowInput]}>
          <Text style={styles.label}>Ngày tính tiền</Text>
          <DatePickerField
            value={tenantInfo.startDate}
            onChange={value => updateTenantInfo('startDate', value)}
          />
        </View>
        <View style={[styles.inputGroup, styles.rowInput]}>
          <Text style={styles.label}>Tiền cọc (VNĐ)</Text>
          <TextInput
            style={styles.input}
            value={tenantInfo.deposit}
            onChangeText={value => updateTenantInfo('deposit', value)}
            keyboardType="numeric"
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Giá thuê tháng (VNĐ)</Text>
        <TextInput
          style={styles.input}
          value={tenantInfo.monthlyRent}
          onChangeText={value => updateTenantInfo('monthlyRent', value)}
          keyboardType="numeric"
          placeholder={rentalMode === 'whole_house'
            ? String(selectedWholeHouse?.monthlyRent || '')
            : String(selectedRoom?.rentPrice || '')}
          placeholderTextColor={Colors.textMuted}
        />
      </View>
    </ScrollView>
  );

  const renderHouseholdMembersStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>Thành viên ở cùng</Text>
          <Text style={styles.hint}>Bước này không bắt buộc. Có thể bổ sung sau trong hồ sơ thuê nguyên căn.</Text>
        </View>
        <TouchableOpacity style={styles.addMemberBtn} onPress={addHouseholdMember}>
          <Text style={styles.addMemberText}>+ Thêm</Text>
        </TouchableOpacity>
      </View>

      {householdMembers.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>Chưa thêm thành viên ở cùng.</Text>
        </View>
      ) : (
        householdMembers.map((member, index) => (
          <View key={member.id} style={styles.memberCard}>
            <View style={styles.memberHeader}>
              <Text style={styles.memberTitle}>Thành viên {index + 1}</Text>
              <TouchableOpacity onPress={() => removeHouseholdMember(member.id)}>
                <Text style={styles.removeText}>Xoá</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              value={member.name}
              onChangeText={value => updateHouseholdMember(member.id, 'name', value)}
              placeholder="Họ và tên"
              placeholderTextColor={Colors.textMuted}
            />
            <View style={styles.memberInputGap} />
            <TextInput
              style={styles.input}
              value={member.relation}
              onChangeText={value => updateHouseholdMember(member.id, 'relation', value)}
              placeholder="Quan hệ với khách thuê chính"
              placeholderTextColor={Colors.textMuted}
            />
            <View style={styles.memberInputGap} />
            <TextInput
              style={styles.input}
              value={member.phone}
              onChangeText={value => updateHouseholdMember(member.id, 'phone', value)}
              keyboardType="phone-pad"
              placeholder="Số điện thoại"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
        ))
      )}
    </ScrollView>
  );

  const renderMeterStep = () => {
    const targetLabel = rentalMode === 'whole_house' ? 'nhà' : 'phòng';
    return (
      <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Ghi nhận điện nước ban đầu</Text>
        <Text style={styles.hint}>
          Chốt chỉ số đầu kỳ trước khi bàn giao {targetLabel} để làm căn cứ tính hóa đơn tháng đầu tiên.
        </Text>

        <View style={styles.meterCard}>
          <View style={styles.meterRow}>
            <Text style={styles.meterEmoji}>⚡</Text>
            <View style={styles.meterTextBlock}>
              <Text style={styles.meterTitle}>Chỉ số điện</Text>
              <Text style={styles.meterHint}>Đơn vị kWh</Text>
            </View>
          </View>
          <TextInput
            style={styles.input}
            value={meters.elec}
            onChangeText={value => setMeters(prev => ({ ...prev, elec: value }))}
            keyboardType="numeric"
            placeholder="Ví dụ: 1250"
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        <View style={styles.meterCard}>
          <View style={styles.meterRow}>
            <Text style={styles.meterEmoji}>💧</Text>
            <View style={styles.meterTextBlock}>
              <Text style={styles.meterTitle}>Chỉ số nước</Text>
              <Text style={styles.meterHint}>Đơn vị m³</Text>
            </View>
          </View>
          <TextInput
            style={styles.input}
            value={meters.water}
            onChangeText={value => setMeters(prev => ({ ...prev, water: value }))}
            keyboardType="numeric"
            placeholder="Ví dụ: 45"
            placeholderTextColor={Colors.textMuted}
          />
        </View>
      </ScrollView>
    );
  };

  const renderConditionPhotoStep = () => {
    const targetLabel = rentalMode === 'whole_house' ? 'nhà' : 'phòng';
    return (
      <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Chụp ảnh hiện trạng {targetLabel}</Text>
        <Text style={styles.hint}>
          Chụp lại tường, cửa, thiết bị, khu vực điện nước và các hạng mục bàn giao để lưu bằng chứng trước khi khách nhận {targetLabel}.
        </Text>

        <TouchableOpacity style={styles.cameraBtn} onPress={handleCamera} activeOpacity={0.85}>
          <Text style={styles.cameraIcon}>📸</Text>
          <Text style={styles.cameraBtnText}>Chụp ảnh hiện trạng</Text>
          <Text style={styles.cameraHint}>Đã chụp {conditionPhotos.length} ảnh</Text>
        </TouchableOpacity>

        {conditionPhotos.length > 0 && (
          <View style={styles.photoGrid}>
            {conditionPhotos.map((uri, index) => (
              <View key={`${uri}-${index}`} style={styles.photoWrap}>
                <Image source={{ uri }} style={styles.photoThumb} />
                <TouchableOpacity
                  style={styles.removePhotoBtn}
                  onPress={() => setConditionPhotos(prev => prev.filter(item => item !== uri))}
                >
                  <Text style={styles.removePhotoText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Ghi chú hiện trạng</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={inspectionNotes}
            onChangeText={setInspectionNotes}
            multiline
            placeholder="Ví dụ: Tường sạch, cửa hoạt động tốt, máy lạnh đã kiểm tra..."
            placeholderTextColor={Colors.textMuted}
          />
        </View>
      </ScrollView>
    );
  };

  const renderContractStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Tạo hợp đồng</Text>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Loại đón khách</Text>
        <Text style={styles.summaryValue}>
          {rentalMode === 'whole_house' ? 'Thuê nguyên căn' : 'Theo phòng'}
        </Text>

        <Text style={styles.summaryLabel}>Tài sản</Text>
        <Text style={styles.summaryValue}>
          {rentalMode === 'whole_house'
            ? selectedWholeHouse?.name
            : `${selectedBuilding?.name} · ${selectedRoom?.code}`}
        </Text>

        <Text style={styles.summaryLabel}>Khách thuê</Text>
        <Text style={styles.summaryValue}>{tenantInfo.fullName || 'Chưa nhập'}</Text>

        <Text style={styles.summaryLabel}>Ngày bắt đầu</Text>
        <Text style={styles.summaryValue}>{tenantInfo.startDate}</Text>

        <Text style={styles.summaryLabel}>Tiền cọc</Text>
        <Text style={styles.summaryValue}>
          {parseInt(tenantInfo.deposit || '0', 10).toLocaleString('vi-VN')} đ
        </Text>

        <Text style={styles.summaryLabel}>Điện nước đầu kỳ</Text>
        <Text style={styles.summaryValue}>
          Điện {meters.elec || '-'} kWh · Nước {meters.water || '-'} m³
        </Text>

        <Text style={styles.summaryLabel}>Ảnh hiện trạng</Text>
        <Text style={styles.summaryValue}>{conditionPhotos.length} ảnh</Text>

        {rentalMode === 'whole_house' && (
          <>
            <Text style={styles.summaryLabel}>Thành viên ở cùng</Text>
            <Text style={styles.summaryValue}>
              {householdMembers.filter(member => member.name.trim()).length} người
            </Text>
          </>
        )}
      </View>
      <Text style={styles.hint}>
        Hệ thống sẽ tạo hợp đồng nháp với thông tin trên và gửi OTP xác nhận đến số điện thoại khách thuê.
      </Text>
    </ScrollView>
  );

  const renderConfirmationStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Xác nhận thông tin</Text>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLine}>rentalMode: {rentalMode}</Text>
        <Text style={styles.summaryLine}>
          propertyId: {rentalMode === 'whole_house' ? selectedWholeHouseId : selectedBuildingId}
        </Text>
        <Text style={styles.summaryLine}>
          roomId: {rentalMode === 'room' ? selectedRoomId : 'Không áp dụng'}
        </Text>
        <Text style={styles.summaryLine}>Khách thuê: {tenantInfo.fullName}</Text>
        <Text style={styles.summaryLine}>SĐT: {tenantInfo.phone}</Text>
        <Text style={styles.summaryLine}>Điện đầu kỳ: {meters.elec} kWh</Text>
        <Text style={styles.summaryLine}>Nước đầu kỳ: {meters.water} m³</Text>
        <Text style={styles.summaryLine}>Ảnh hiện trạng: {conditionPhotos.length} ảnh</Text>
      </View>

      <Text style={styles.sectionTitle}>Xác thực OTP</Text>
      <Text style={styles.hint}>
        Hệ thống đã gửi một mã OTP gồm 6 chữ số qua SMS đến SĐT {tenantInfo.phone}.
      </Text>

      <View style={[styles.inputGroup, styles.otpGroup]}>
        <Text style={styles.label}>Mã OTP (Nhập 123456 để test)</Text>
        <TextInput
          style={[styles.input, styles.otpInput]}
          value={otp}
          onChangeText={setOtp}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="------"
          placeholderTextColor={Colors.textMuted}
        />
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, otp.length === 6 ? styles.submitBtnReady : styles.submitBtnDisabled]}
        onPress={verifyOTPAndSubmit}
        disabled={otp.length !== 6}
      >
        <Text style={[styles.submitBtnText, otp.length === 6 ? styles.submitTextReady : styles.submitTextDisabled]}>
          Hoàn tất khởi tạo
        </Text>
      </TouchableOpacity>
      <View style={styles.bottomSpacer} />
    </ScrollView>
  );

  const renderBody = () => {
    if (step === 0) return renderModeStep();
    if (rentalMode === 'whole_house') {
      if (step === 1) return renderWholeHouseSelectionStep();
      if (step === 2) return renderTenantInfoStep();
      if (step === 3) return renderHouseholdMembersStep();
      if (step === 4) return renderMeterStep();
      if (step === 5) return renderConditionPhotoStep();
      if (step === 6) return renderContractStep();
      return renderConfirmationStep();
    }

    if (step === 1) return renderRoomSelectionStep();
    if (step === 2) return renderTenantInfoStep();
    if (step === 3) return renderMeterStep();
    if (step === 4) return renderConditionPhotoStep();
    if (step === 5) return renderContractStep();
    return renderConfirmationStep();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Đón khách mới</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.progressText}>Bước {step + 1}: {steps[step]}</Text>
      </View>

      <View style={styles.body}>{renderBody()}</View>

      {step < steps.length - 1 && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
            <Text style={styles.nextBtnText}>Tiếp tục →</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    ...Shadow.sm,
  },
  backBtn: { width: 70 },
  backText: { color: Colors.primary, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  headerSpacer: { width: 70 },

  progressContainer: {
    padding: Spacing.lg,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderColor: Colors.divider,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.divider,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  progressFill: { height: '100%', backgroundColor: Colors.primary },
  progressText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center' },

  body: { flex: 1, padding: Spacing.lg },
  stepContent: { flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  nextSectionTitle: { marginTop: Spacing.xl },
  hint: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: Spacing.lg },

  modeGrid: { gap: Spacing.md },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    padding: Spacing.lg,
    ...Shadow.sm,
  },
  modeCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  modeIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  modeIconWrapActive: { backgroundColor: '#E0E7FF' },
  modeIcon: { fontSize: 28 },
  modeTextBlock: { flex: 1 },
  modeTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: 4 },
  modeTitleActive: { color: Colors.primary },
  modeDescription: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  modeDescriptionActive: { color: Colors.textPrimary },

  cardList: { gap: Spacing.md },
  propertyCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    padding: Spacing.base,
  },
  propertyCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  propertyCardDisabled: { opacity: 0.55 },
  propertyCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: 6,
  },
  propertyName: { flex: 1, fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  propertyNameActive: { color: Colors.primary },
  propertyMeta: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  propertyMetaActive: { color: Colors.textPrimary },
  countPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: '#EEF2FF',
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  countPillActive: { backgroundColor: Colors.primary, color: Colors.white },
  countPillDisabled: { backgroundColor: '#F1F5F9', color: Colors.textMuted },

  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  roomCard: {
    width: '47%',
    minHeight: 116,
    padding: Spacing.base,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  roomEmoji: { fontSize: 24, marginBottom: Spacing.xs },
  roomName: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  roomNameActive: { color: Colors.primary },
  roomMeta: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
  roomMetaActive: { color: Colors.textPrimary },

  inputGroup: { marginBottom: Spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
  input: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  row: { flexDirection: 'row', gap: Spacing.md },
  rowInput: { flex: 1 },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  sectionHeaderText: { flex: 1 },
  addMemberBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  addMemberText: { color: Colors.white, fontWeight: '700' },
  memberCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    marginBottom: Spacing.md,
  },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  memberTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  removeText: { fontSize: 13, fontWeight: '700', color: Colors.error },
  memberInputGap: { height: Spacing.sm },

  meterCard: {
    backgroundColor: Colors.white,
    padding: Spacing.base,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.md },
  meterEmoji: { fontSize: 24 },
  meterTextBlock: { flex: 1 },
  meterTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  meterHint: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  cameraBtn: {
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.lg,
    minHeight: 144,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
  },
  cameraIcon: { fontSize: 34, marginBottom: Spacing.sm },
  cameraBtnText: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  cameraHint: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  photoWrap: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    backgroundColor: Colors.divider,
  },
  photoThumb: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.divider,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoText: { color: Colors.white, fontSize: 18, fontWeight: '900', lineHeight: 21 },
  notesInput: { minHeight: 92, textAlignVertical: 'top', marginTop: Spacing.md },

  emptyBox: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  emptyText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },

  summaryCard: {
    backgroundColor: Colors.primaryBg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xl,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  summaryValue: { fontSize: 15, color: Colors.primaryDark, fontWeight: '700', marginBottom: Spacing.md },
  summaryLine: { fontSize: 14, color: Colors.primaryDark, fontWeight: '600', marginBottom: Spacing.xs },

  otpGroup: { marginTop: Spacing.sm },
  otpInput: { fontSize: 24, textAlign: 'center', letterSpacing: 5 },
  submitBtn: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  submitBtnReady: { backgroundColor: Colors.success },
  submitBtnDisabled: { backgroundColor: Colors.divider },
  submitBtnText: { fontSize: 16, fontWeight: '700' },
  submitTextReady: { color: Colors.white },
  submitTextDisabled: { color: Colors.textMuted },
  bottomSpacer: { height: 100 },

  footer: {
    padding: Spacing.lg,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderColor: Colors.divider,
  },
  nextBtn: {
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  nextBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});
