import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Image, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import * as ImagePicker from 'expo-image-picker';

// ===================== MOCK DATA =====================
const MOCK_HOUSES = [
  { id: 'h1', name: 'Nhà Nguyễn Trãi', address: '123 Nguyễn Trãi, Q5', rooms: 8, status: 'available' },
  { id: 'h2', name: 'Nhà Lê Văn Sỹ', address: '456 Lê Văn Sỹ, Q3', rooms: 6, status: 'rented' },
  { id: 'h3', name: 'Nhà Trần Hưng Đạo', address: '789 Trần Hưng Đạo, Q1', rooms: 10, status: 'available' },
  { id: 'h4', name: 'Nhà Cách Mạng Tháng 8', address: '101 CMT8, Q10', rooms: 5, status: 'available' },
];

const MOCK_EQUIPMENT = [
  { id: 'e1', name: 'Máy bơm nước tầng thượng', qty: 1 },
  { id: 'e2', name: 'Bình nước nóng Ariston 30L', qty: 8 },
  { id: 'e3', name: 'Cửa cuốn tầng trệt', qty: 1 },
  { id: 'e4', name: 'Camera an ninh', qty: 4 },
  { id: 'e5', name: 'Đồng hồ điện tổng', qty: 1 },
  { id: 'e6', name: 'Đồng hồ nước tổng', qty: 1 },
];

const STEPS = ['Chọn Nhà', 'Thông Tin', 'Tài Sản', 'Hiện Trạng', 'Xác Thực'];

export const AdminOnboardingScreen: React.FC<any> = ({ navigation }) => {
  const [step, setStep] = useState(0);

  const [selectedHouse, setSelectedHouse] = useState<string | null>(null);
  const [managerInfo, setManagerInfo] = useState({ fullName: '', phone: '', cccd: '', deposit: '50000000', startDate: '2026-05-14', duration: '12' });
  const [checkedEquipment, setCheckedEquipment] = useState<Record<string, boolean>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [otp, setOtp] = useState('');

  const availableHouses = MOCK_HOUSES.filter(h => h.status === 'available');

  const handleNext = () => {
    if (step === 0 && !selectedHouse) return Alert.alert('Lỗi', 'Vui lòng chọn một căn nhà.');
    if (step === 1 && (!managerInfo.fullName || !managerInfo.phone || !managerInfo.cccd))
      return Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ Tên, SĐT và CCCD.');
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

  const toggleEquipment = (id: string) => {
    setCheckedEquipment(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const verifyOTPAndSubmit = () => {
    if (otp !== '123456') {
      return Alert.alert('Lỗi', 'Mã OTP không hợp lệ. Vui lòng thử lại (Mock: 123456).');
    }
    const house = MOCK_HOUSES.find(h => h.id === selectedHouse);
    const eqCount = Object.values(checkedEquipment).filter(Boolean).length;
    Alert.alert(
      'Thành công 🎉',
      `Đã bàn giao "${house?.name}" cho ${managerInfo.fullName}.\n\n• Tài sản bàn giao: ${eqCount} món\n• Tiền cọc: ${parseInt(managerInfo.deposit).toLocaleString('vi-VN')}đ\n• Thời hạn: ${managerInfo.duration} tháng\n\nMật khẩu mặc định (123456) đã gửi SMS đến ${managerInfo.phone}.`,
      [{ text: 'Hoàn tất', onPress: () => navigation.goBack() }]
    );
  };

  // ========== RENDER STEPS ==========
  const renderStep0 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.sectionTitle}>Chọn nhà nguyên căn để bàn giao</Text>
      <Text style={styles.hint}>{availableHouses.length} căn nhà đang trống, sẵn sàng cho thuê.</Text>
      {availableHouses.map(house => (
        <TouchableOpacity
          key={house.id}
          style={[styles.houseCard, selectedHouse === house.id && styles.houseCardActive]}
          onPress={() => setSelectedHouse(house.id)}
        >
          <View style={styles.houseHeader}>
            <Text style={styles.houseEmoji}>🏠</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.houseName, selectedHouse === house.id && { color: Colors.white }]}>{house.name}</Text>
              <Text style={[styles.houseAddress, selectedHouse === house.id && { color: 'rgba(255,255,255,0.8)' }]}>{house.address}</Text>
            </View>
            <View style={[styles.houseBadge, selectedHouse === house.id && { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Text style={[styles.houseBadgeText, selectedHouse === house.id && { color: Colors.white }]}>{house.rooms} phòng</Text>
            </View>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderStep1 = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Thông tin bên thuê (Manager)</Text>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Họ và tên *</Text>
        <TextInput style={styles.input} value={managerInfo.fullName} onChangeText={t => setManagerInfo({ ...managerInfo, fullName: t })} placeholder="Nhập họ và tên..." />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Số điện thoại *</Text>
        <TextInput style={styles.input} value={managerInfo.phone} onChangeText={t => setManagerInfo({ ...managerInfo, phone: t })} keyboardType="phone-pad" placeholder="090..." />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Căn cước công dân *</Text>
        <TextInput style={styles.input} value={managerInfo.cccd} onChangeText={t => setManagerInfo({ ...managerInfo, cccd: t })} keyboardType="number-pad" placeholder="Nhập số CCCD..." />
      </View>
      <View style={styles.row}>
        <View style={[styles.inputGroup, { flex: 1, marginRight: Spacing.md }]}>
          <Text style={styles.label}>Tiền cọc (VNĐ)</Text>
          <TextInput style={styles.input} value={managerInfo.deposit} onChangeText={t => setManagerInfo({ ...managerInfo, deposit: t })} keyboardType="numeric" />
        </View>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>Thời hạn (tháng)</Text>
          <TextInput style={styles.input} value={managerInfo.duration} onChangeText={t => setManagerInfo({ ...managerInfo, duration: t })} keyboardType="numeric" />
        </View>
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Ngày bắt đầu</Text>
        <TextInput style={styles.input} value={managerInfo.startDate} onChangeText={t => setManagerInfo({ ...managerInfo, startDate: t })} />
      </View>
      <View style={{ height: 60 }} />
    </ScrollView>
  );

  const renderStep2 = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Tài sản bàn giao cho Manager</Text>
      <Text style={styles.hint}>Chọn các tài sản có sẵn trong căn nhà để ghi vào hợp đồng bàn giao.</Text>
      {MOCK_EQUIPMENT.map(eq => (
        <TouchableOpacity
          key={eq.id}
          style={[styles.eqCard, checkedEquipment[eq.id] && styles.eqCardChecked]}
          onPress={() => toggleEquipment(eq.id)}
        >
          <Text style={styles.eqCheckbox}>{checkedEquipment[eq.id] ? '☑️' : '⬜'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.eqName}>{eq.name}</Text>
            <Text style={styles.eqQty}>Số lượng: {eq.qty}</Text>
          </View>
        </TouchableOpacity>
      ))}
      <View style={{ height: 60 }} />
    </ScrollView>
  );

  const renderStep3 = () => (
    <View style={styles.stepContent}>
      <Text style={styles.sectionTitle}>Ảnh hiện trạng căn nhà</Text>
      <Text style={styles.hint}>Chụp ảnh tổng thể mặt ngoài, cầu thang, sân thượng, hệ thống điện nước tổng...</Text>
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

  const renderStep4 = () => {
    const house = MOCK_HOUSES.find(h => h.id === selectedHouse);
    const eqCount = Object.values(checkedEquipment).filter(Boolean).length;
    return (
      <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Xác nhận thông tin</Text>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLine}>📍 Nhà: {house?.name}</Text>
          <Text style={styles.summaryLine}>👤 Manager: {managerInfo.fullName}</Text>
          <Text style={styles.summaryLine}>📞 SĐT: {managerInfo.phone}</Text>
          <Text style={styles.summaryLine}>💰 Tiền cọc: {parseInt(managerInfo.deposit || '0').toLocaleString('vi-VN')}đ</Text>
          <Text style={styles.summaryLine}>📦 Tài sản bàn giao: {eqCount} món</Text>
          <Text style={styles.summaryLine}>⏳ Thời hạn: {managerInfo.duration} tháng</Text>
        </View>

        <Text style={styles.sectionTitle}>Xác thực OTP & Khởi tạo</Text>
        <Text style={styles.hint}>
          Hệ thống đã gửi mã OTP 6 số qua SMS đến SĐT {managerInfo.phone}.
          Vui lòng yêu cầu Manager đọc mã để hoàn tất.
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
        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: otp.length === 6 ? Colors.success : Colors.divider }]}
          onPress={verifyOTPAndSubmit}
          disabled={otp.length !== 6}
        >
          <Text style={[styles.submitBtnText, { color: otp.length === 6 ? Colors.white : Colors.textMuted }]}>
            Hoàn tất Bàn giao
          </Text>
        </TouchableOpacity>
        <View style={{ height: 100 }} />
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}><Text style={styles.backText}>← Back</Text></TouchableOpacity>
        <Text style={styles.title}>Bàn giao nhà cho Manager</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${((step + 1) / STEPS.length) * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>Bước {step + 1}: {STEPS[step]}</Text>
      </View>

      <View style={styles.body}>
        {step === 0 && renderStep0()}
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </View>

      {step < 4 && (
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
  title: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },

  progressContainer: { padding: Spacing.lg, backgroundColor: Colors.white, borderBottomWidth: 1, borderColor: Colors.divider },
  progressBar: { height: 6, backgroundColor: Colors.divider, borderRadius: 3, overflow: 'hidden', marginBottom: Spacing.sm },
  progressFill: { height: '100%', backgroundColor: Colors.primary },
  progressText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center' },

  body: { flex: 1, padding: Spacing.lg },
  stepContent: { flex: 1 },

  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  hint: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.lg },
  row: { flexDirection: 'row' },

  // House cards
  houseCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.md, borderWidth: 2, borderColor: Colors.border, ...Shadow.sm },
  houseCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  houseHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  houseEmoji: { fontSize: 28 },
  houseName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  houseAddress: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  houseBadge: { backgroundColor: Colors.primaryBg, paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: BorderRadius.full },
  houseBadgeText: { fontSize: 12, fontWeight: '600', color: Colors.primary },

  // Input
  inputGroup: { marginBottom: Spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
  input: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: 16, color: Colors.textPrimary },

  // Equipment
  eqCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: BorderRadius.md, padding: Spacing.base, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border, gap: Spacing.md },
  eqCardChecked: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  eqCheckbox: { fontSize: 22 },
  eqName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  eqQty: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  // Camera
  cameraBtn: { backgroundColor: Colors.white, borderWidth: 2, borderColor: Colors.border, borderStyle: 'dashed', borderRadius: BorderRadius.lg, height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.lg },
  cameraBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary, marginTop: Spacing.sm },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  photoThumb: { width: '31%', aspectRatio: 1, borderRadius: BorderRadius.md },

  // Summary
  summaryCard: { backgroundColor: Colors.primaryBg, padding: Spacing.lg, borderRadius: BorderRadius.lg, marginBottom: Spacing.xl },
  summaryLine: { fontSize: 15, color: Colors.primaryDark, fontWeight: '500', marginBottom: Spacing.xs },

  // Submit
  submitBtn: { padding: Spacing.lg, borderRadius: BorderRadius.lg, alignItems: 'center', marginTop: Spacing.lg },
  submitBtnText: { fontSize: 16, fontWeight: '700' },

  // Footer
  footer: { padding: Spacing.lg, backgroundColor: Colors.white, borderTopWidth: 1, borderColor: Colors.divider },
  nextBtn: { backgroundColor: Colors.primary, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center' },
  nextBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});
