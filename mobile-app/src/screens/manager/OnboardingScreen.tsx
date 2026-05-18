import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Image, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import * as ImagePicker from 'expo-image-picker';
import { DatePickerField } from '../../components/common/DatePickerField';

// ===================== MOCK DATA =====================
const MOCK_PROPERTIES = [
  {
    id: 'p1', name: 'Nhà Trọ Sunrise',
    rooms: [
      { id: 'r1', name: 'Phòng 101 (Trống)', status: 'available' },
      { id: 'r2', name: 'Phòng 102 (Đang thuê)', status: 'occupied' },
      { id: 'r3', name: 'Phòng 201 (Trống)', status: 'available' },
    ],
  },
];

const STEPS_MANAGER = ['Chọn Phòng', 'Khách Thuê', 'Điện Nước', 'Hiện Trạng', 'Xác Thực'];
const STEPS_ADMIN = ['Chọn Nhà', 'Thông Tin', 'Hiện Trạng', 'Xác Thực'];

export const OnboardingScreen: React.FC<any> = ({ navigation, route }) => {
  const isAdmin = route?.name === 'AdminOnboarding';
  const STEPS = isAdmin ? STEPS_ADMIN : STEPS_MANAGER;
  const [step, setStep] = useState(0);

  // Form Data
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  
  const [tenantInfo, setTenantInfo] = useState({ fullName: '', phone: '', cccd: '', deposit: '3000000', startDate: '10/05/2026' });
  const [meters, setMeters] = useState({ elec: '', water: '' });
  const [photos, setPhotos] = useState<string[]>([]);
  const [otp, setOtp] = useState('');

  // Handlers
  const handleNext = () => {
    if (isAdmin) {
      if (step === 0 && !propertyId) return Alert.alert('Lỗi', 'Vui lòng chọn nhà.');
      if (step === 1 && (!tenantInfo.fullName || !tenantInfo.phone || !tenantInfo.cccd)) return Alert.alert('Lỗi', 'Vui lòng nhập Tên, SĐT và số CCCD.');
    } else {
      if (step === 0 && !roomId) return Alert.alert('Lỗi', 'Vui lòng chọn phòng trống.');
      if (step === 1 && (!tenantInfo.fullName || !tenantInfo.phone || !tenantInfo.cccd)) return Alert.alert('Lỗi', 'Vui lòng nhập Tên, SĐT và số CCCD.');
      if (step === 2 && (!meters.elec || !meters.water)) return Alert.alert('Lỗi', 'Vui lòng chốt số điện nước đầu kỳ.');
    }
    if (step < STEPS.length - 1) setStep(prev => prev + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(prev => prev - 1);
    else navigation.goBack();
  };

  const handleCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') return Alert.alert('Lỗi', 'Cần quyền truy cập camera.');
    
    const result = await ImagePicker.launchCameraAsync({ quality: 0.5 });
    if (!result.canceled && result.assets[0]) {
      setPhotos([...photos, result.assets[0].uri]);
    }
  };

  const verifyOTPAndSubmit = () => {
    if (otp !== '123456') {
      return Alert.alert('Lỗi', 'Mã OTP không hợp lệ. Vui lòng thử lại (Mock: 123456).');
    }
    
    Alert.alert(
      'Thành công 🎉', 
      `Đã tạo tài khoản cho ${tenantInfo.fullName}. Mật khẩu mặc định là 123456 đã được gửi SMS đến SĐT ${tenantInfo.phone}.`, 
      [
        { text: 'Hoàn tất', onPress: () => navigation.navigate(isAdmin ? 'AdminTabs' : 'ManagerTabs') }
      ]
    );
  };

  // Render Steps
  const renderStep0 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.sectionTitle}>{isAdmin ? 'Chọn nhà cho thuê' : 'Tòa nhà'}</Text>
      <View style={styles.row}>
        {MOCK_PROPERTIES.map(p => (
          <TouchableOpacity key={p.id} style={[styles.chip, propertyId === p.id && styles.chipActive]} onPress={() => setPropertyId(p.id)}>
            <Text style={[styles.chipText, propertyId === p.id && styles.chipTextActive]}>{p.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {propertyId && !isAdmin && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: Spacing.lg }]}>Phòng trống</Text>
          <View style={styles.roomGrid}>
            {MOCK_PROPERTIES.find(p => p.id === propertyId)?.rooms.filter(r => r.status === 'available').map(r => (
              <TouchableOpacity key={r.id} style={[styles.roomCard, roomId === r.id && styles.roomCardActive]} onPress={() => setRoomId(r.id)}>
                <Text style={styles.roomEmoji}>🚪</Text>
                <Text style={[styles.roomName, roomId === r.id && styles.chipTextActive]}>{r.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
    </View>
  );

  const renderStep1 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.sectionTitle}>Thông tin khách thuê</Text>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Họ và tên *</Text>
        <TextInput style={styles.input} value={tenantInfo.fullName} onChangeText={(t) => setTenantInfo({...tenantInfo, fullName: t})} placeholder="Nhập họ và tên..." />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Số điện thoại *</Text>
        <TextInput style={styles.input} value={tenantInfo.phone} onChangeText={(t) => setTenantInfo({...tenantInfo, phone: t})} keyboardType="phone-pad" placeholder="090..." />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Căn cước công dân *</Text>
        <TextInput style={styles.input} value={tenantInfo.cccd} onChangeText={(t) => setTenantInfo({...tenantInfo, cccd: t})} keyboardType="number-pad" placeholder="Nhập số CCCD..." />
      </View>
      
      <View style={styles.row}>
        <View style={[styles.inputGroup, { flex: 1, marginRight: Spacing.md }]}>
          <Text style={styles.label}>Ngày tính tiền</Text>
          <DatePickerField
            value={tenantInfo.startDate}
            onChange={v => setTenantInfo({ ...tenantInfo, startDate: v })}
          />
        </View>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>Tiền cọc (VNĐ)</Text>
          <TextInput style={styles.input} value={tenantInfo.deposit} onChangeText={(t) => setTenantInfo({...tenantInfo, deposit: t})} keyboardType="numeric" />
        </View>
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.sectionTitle}>Chốt số điện nước đầu kỳ</Text>
      <View style={styles.meterCard}>
        <View style={styles.meterRow}>
          <Text style={styles.meterEmoji}>⚡</Text>
          <Text style={styles.meterTitle}>Chỉ số Điện</Text>
        </View>
        <TextInput style={styles.input} value={meters.elec} onChangeText={(t) => setMeters({...meters, elec: t})} keyboardType="numeric" placeholder="Ví dụ: 1250..." />
      </View>
      
      <View style={styles.meterCard}>
        <View style={styles.meterRow}>
          <Text style={styles.meterEmoji}>💧</Text>
          <Text style={styles.meterTitle}>Chỉ số Nước</Text>
        </View>
        <TextInput style={styles.input} value={meters.water} onChangeText={(t) => setMeters({...meters, water: t})} keyboardType="numeric" placeholder="Ví dụ: 45..." />
      </View>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.sectionTitle}>Ảnh hiện trạng phòng</Text>
      <Text style={styles.hint}>Vui lòng chụp lại tường, tủ, máy lạnh... để làm bằng chứng bàn giao phòng.</Text>
      
      <TouchableOpacity style={styles.cameraBtn} onPress={handleCamera}>
        <Text style={{ fontSize: 32 }}>📸</Text>
        <Text style={styles.cameraBtnText}>Chụp ảnh mới</Text>
      </TouchableOpacity>

      <View style={styles.photoGrid}>
        {photos.map((uri, idx) => (
          <Image key={idx} source={{ uri }} style={styles.photoThumb} />
        ))}
      </View>
    </View>
  );

  const renderStep4 = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Xác nhận thông tin</Text>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLine}>Khách thuê: {tenantInfo.fullName}</Text>
        <Text style={styles.summaryLine}>SĐT: {tenantInfo.phone}</Text>
        <Text style={styles.summaryLine}>Điện đầu kỳ: {meters.elec} kWh</Text>
        <Text style={styles.summaryLine}>Nước đầu kỳ: {meters.water} m³</Text>
        <Text style={styles.summaryLine}>Tiền cọc: {parseInt(tenantInfo.deposit || '0').toLocaleString('vi-VN')} đ</Text>
      </View>

      <Text style={styles.sectionTitle}>Xác thực OTP & Khởi tạo</Text>
      <Text style={styles.hint}>
        Hệ thống đã gửi một mã OTP gồm 6 chữ số qua SMS đến SĐT {tenantInfo.phone}.
        Vui lòng đọc mã OTP để hoàn tất.
      </Text>
      
      <View style={[styles.inputGroup, { marginTop: Spacing.sm }]}>
        <Text style={styles.label}>Mã OTP (Nhập 123456 để test)</Text>
        <TextInput 
          style={[styles.input, { fontSize: 24, textAlign: 'center', letterSpacing: 5 }]} 
          value={otp} 
          onChangeText={setOtp} 
          keyboardType="number-pad" 
          maxLength={6}
          placeholder="------" 
        />
      </View>

      <TouchableOpacity style={[styles.submitBtn, { marginTop: Spacing.xl, backgroundColor: otp.length === 6 ? Colors.success : Colors.divider }]} onPress={verifyOTPAndSubmit} disabled={otp.length !== 6}>
        <Text style={[styles.submitBtnText, { color: otp.length === 6 ? Colors.white : Colors.textMuted }]}>Hoàn tất Khởi tạo</Text>
      </TouchableOpacity>
      
      <View style={{height: 100}} />
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}><Text style={styles.backText}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>{isAdmin ? 'Tiếp khách' : 'Đón khách mới'}</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Progress */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${((step + 1) / STEPS.length) * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>Bước {step + 1}: {STEPS[step]}</Text>
      </View>

      {/* Body */}
      <View style={styles.body}>
        {isAdmin ? (
          <>
            {step === 0 && renderStep0()}
            {step === 1 && renderStep1()}
            {step === 2 && renderStep3()}
            {step === 3 && renderStep4()}
          </>
        ) : (
          <>
            {step === 0 && renderStep0()}
            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}
          </>
        )}
      </View>

      {/* Footer / Next Button */}
      {step < STEPS.length - 1 && (
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: Colors.white, ...Shadow.sm },
  backBtn: { width: 60 },
  backText: { color: Colors.primary, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  
  progressContainer: { padding: Spacing.lg, backgroundColor: Colors.white, borderBottomWidth: 1, borderColor: Colors.divider },
  progressBar: { height: 6, backgroundColor: Colors.divider, borderRadius: 3, overflow: 'hidden', marginBottom: Spacing.sm },
  progressFill: { height: '100%', backgroundColor: Colors.primary },
  progressText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center' },

  body: { flex: 1, padding: Spacing.lg },
  stepContent: { flex: 1 },
  
  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  row: { flexDirection: 'row', gap: Spacing.md },
  
  chip: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.white },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },

  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  roomCard: { width: '47%', padding: Spacing.base, backgroundColor: Colors.white, borderRadius: BorderRadius.lg, borderWidth: 2, borderColor: Colors.border, alignItems: 'center' },
  roomCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  roomEmoji: { fontSize: 24, marginBottom: Spacing.xs },
  roomName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center' },

  inputGroup: { marginBottom: Spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
  input: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: 16, color: Colors.textPrimary },

  meterCard: { backgroundColor: Colors.white, padding: Spacing.base, borderRadius: BorderRadius.lg, marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  meterRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  meterEmoji: { fontSize: 20, marginRight: Spacing.sm },
  meterTitle: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },

  hint: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.lg },
  cameraBtn: { backgroundColor: Colors.white, borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed', borderRadius: BorderRadius.lg, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg },
  cameraBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, marginTop: Spacing.sm },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  photoThumb: { width: '31%', aspectRatio: 1, borderRadius: BorderRadius.md },

  summaryCard: { backgroundColor: Colors.primaryBg, padding: Spacing.lg, borderRadius: BorderRadius.lg, marginBottom: Spacing.xl },
  summaryLine: { fontSize: 15, color: Colors.primaryDark, fontWeight: '500', marginBottom: Spacing.xs },

  signatureContainer: { height: 180, backgroundColor: Colors.white, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', marginBottom: Spacing.md },
  sigActions: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xl },
  sigBtnClear: { padding: Spacing.sm },
  sigBtnTextClear: { color: Colors.error, fontWeight: '600' },
  sigBtnSave: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md },
  sigBtnText: { color: Colors.white, fontWeight: '600' },

  submitBtn: { backgroundColor: Colors.primary, padding: Spacing.lg, borderRadius: BorderRadius.lg, alignItems: 'center', marginTop: Spacing.lg },
  submitBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },

  footer: { padding: Spacing.lg, backgroundColor: Colors.white, borderTopWidth: 1, borderColor: Colors.divider },
  nextBtn: { backgroundColor: Colors.primary, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center' },
  nextBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});
