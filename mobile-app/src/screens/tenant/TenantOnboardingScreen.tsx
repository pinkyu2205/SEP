import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { OnboardingAsset } from '@/types';

type Step = 'room' | 'assets' | 'meter' | 'confirm';

const STEPS: { key: Step; label: string; emoji: string }[] = [
  { key: 'room', label: 'Hiện trạng phòng', emoji: '🏠' },
  { key: 'assets', label: 'Tài sản bàn giao', emoji: '📦' },
  { key: 'meter', label: 'Điện & Nước', emoji: '📊' },
  { key: 'confirm', label: 'Xác nhận', emoji: '✅' },
];

const INITIAL_ASSETS: OnboardingAsset[] = [
  { id: 'a1', name: 'Điều hòa Daikin 9000BTU', quantity: 1, condition: 'good', confirmed: false },
  { id: 'a2', name: 'Giường đôi 1m6', quantity: 1, condition: 'good', confirmed: false },
  { id: 'a3', name: 'Tủ quần áo 3 cánh', quantity: 1, condition: 'good', confirmed: false },
  { id: 'a4', name: 'Bàn học + ghế', quantity: 1, condition: 'good', confirmed: false },
  { id: 'a5', name: 'Tủ lạnh mini Aqua', quantity: 1, condition: 'good', confirmed: false },
];

const CONDITION_OPTIONS: { key: OnboardingAsset['condition']; label: string; color: string }[] = [
  { key: 'good', label: 'Tốt', color: Colors.success },
  { key: 'fair', label: 'Bình thường', color: Colors.warning },
  { key: 'poor', label: 'Có hư hỏng', color: Colors.error },
];

export const TenantOnboardingScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [currentStep, setCurrentStep] = useState<Step>('room');

  // Step 1 - Room
  const [roomNotes, setRoomNotes] = useState('');
  const [roomImages, setRoomImages] = useState<string[]>([]);

  // Step 2 - Assets
  const [assets, setAssets] = useState<OnboardingAsset[]>(INITIAL_ASSETS);

  // Step 3 - Meter
  const [electricityReading, setElectricityReading] = useState('');
  const [waterReading, setWaterReading] = useState('');
  const [meterImages, setMeterImages] = useState<string[]>([]);

  // Step 4 - Confirm
  const [agreeTerms, setAgreeTerms] = useState(false);

  const stepIndex = STEPS.findIndex(s => s.key === currentStep);

  const goNext = () => {
    const nextIdx = stepIndex + 1;
    if (nextIdx < STEPS.length) setCurrentStep(STEPS[nextIdx].key);
  };

  const goPrev = () => {
    const prevIdx = stepIndex - 1;
    if (prevIdx >= 0) setCurrentStep(STEPS[prevIdx].key);
  };

  const pickImage = async (setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.6 });
    if (!result.canceled && result.assets[0]) {
      setter(prev => [...prev, result.assets[0].uri]);
    }
  };

  const updateAsset = (id: string, field: keyof OnboardingAsset, value: any) => {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  const handleSubmit = () => {
    if (!agreeTerms) {
      Alert.alert('Lỗi', 'Vui lòng xác nhận đồng ý với các thông tin bàn giao.');
      return;
    }
    Alert.alert(
      'Xác nhận bàn giao thành công! 🏠',
      'Thông tin nhận phòng đã được ghi nhận. Chúc bạn sinh sống thoải mái!',
      [{ text: 'Hoàn thành', onPress: () => navigation.goBack() }]
    );
  };

  const canGoNext = () => {
    if (currentStep === 'room') return true;
    if (currentStep === 'assets') return assets.every(a => a.confirmed);
    if (currentStep === 'meter') return electricityReading.trim() && waterReading.trim();
    return true;
  };

  // ===== STEP INDICATOR =====
  const StepIndicator = () => (
    <View style={styles.stepIndicator}>
      {STEPS.map((step, i) => {
        const isCurrent = step.key === currentStep;
        const isDone = i < stepIndex;
        return (
          <React.Fragment key={step.key}>
            <View style={styles.stepItem}>
              <View style={[
                styles.stepCircle,
                isDone && styles.stepCircleDone,
                isCurrent && styles.stepCircleCurrent,
              ]}>
                <Text style={[styles.stepCircleText, (isDone || isCurrent) && { color: Colors.white }]}>
                  {isDone ? '✓' : step.emoji}
                </Text>
              </View>
              <Text style={[styles.stepLabel, isCurrent && styles.stepLabelCurrent]}>{step.label}</Text>
            </View>
            {i < STEPS.length - 1 && (
              <View style={[styles.stepLine, isDone && styles.stepLineDone]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );

  // ===== STEP 1: ROOM CONDITION =====
  const RoomStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>🏠 Hiện trạng phòng khi nhận</Text>
      <Text style={styles.stepDesc}>
        Kiểm tra kỹ phòng trước khi ký nhận. Nếu có vết hư hỏng sẵn, hãy ghi chú và chụp ảnh lại — những bằng chứng này bảo vệ bạn khi trả phòng.
      </Text>

      <Text style={styles.fieldLabel}>Ghi chú hư hỏng / bất thường (nếu có)</Text>
      <TextInput
        style={[styles.input, { height: 120, textAlignVertical: 'top' }]}
        placeholder="Ví dụ: Tường có vết nứt nhỏ phía cửa sổ, sàn còn tốt, cửa kéo hơi nặng..."
        multiline
        value={roomNotes}
        onChangeText={setRoomNotes}
      />

      <Text style={styles.fieldLabel}>Chụp ảnh làm bằng chứng (tường, sàn, cửa...)</Text>
      <TouchableOpacity style={styles.photoBtn} onPress={() => pickImage(setRoomImages)}>
        <Text style={{ fontSize: 20 }}>📷</Text>
        <Text style={styles.photoBtnText}>Chụp ảnh ({roomImages.length}/5)</Text>
      </TouchableOpacity>
      {roomImages.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
          {roomImages.map((uri, i) => (
            <Image key={i} source={{ uri }} style={styles.thumbImage} />
          ))}
        </ScrollView>
      )}

      <View style={styles.infoBox}>
        <Text style={styles.infoBoxText}>
          💡 Ghi chú và ảnh được lưu vào hệ thống. Khi trả phòng, manager sẽ đối chiếu với tình trạng này để xác định bồi thường (nếu có).
        </Text>
      </View>
    </View>
  );

  // ===== STEP 2: ASSETS =====
  const AssetsStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>📦 Kiểm tra tài sản trong phòng</Text>
      <Text style={styles.stepDesc}>
        Kiểm tra từng món đồ, chọn tình trạng thực tế rồi nhấn vòng tròn ✓ bên phải để xác nhận. Nếu có hư hỏng, hãy chọn "Có hư hỏng" và ghi chú thêm.
      </Text>

      {assets.map(asset => (
        <View key={asset.id} style={[styles.assetCard, asset.confirmed && styles.assetCardConfirmed]}>
          <View style={styles.assetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.assetName}>{asset.name}</Text>
              <Text style={styles.assetQty}>Số lượng: {asset.quantity}</Text>
            </View>
            <TouchableOpacity
              style={[styles.confirmCheck, asset.confirmed && styles.confirmCheckDone]}
              onPress={() => updateAsset(asset.id, 'confirmed', !asset.confirmed)}
            >
              <Text style={{ color: asset.confirmed ? Colors.white : Colors.textMuted, fontWeight: '700', fontSize: asset.confirmed ? 12 : 10 }}>
                {asset.confirmed ? '✓' : 'KT'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.conditionLabel}>Tình trạng thực tế:</Text>
          <View style={styles.conditionRow}>
            {CONDITION_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.conditionBtn, asset.condition === opt.key && { backgroundColor: opt.color + '20', borderColor: opt.color }]}
                onPress={() => updateAsset(asset.id, 'condition', opt.key)}
              >
                <Text style={[styles.conditionBtnText, asset.condition === opt.key && { color: opt.color, fontWeight: '700' }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {asset.condition === 'poor' && (
            <TextInput
              style={styles.assetNoteInput}
              placeholder="Mô tả chi tiết hư hỏng (để làm bằng chứng)..."
              value={asset.notes || ''}
              onChangeText={v => updateAsset(asset.id, 'notes', v)}
            />
          )}
        </View>
      ))}

      {!assets.every(a => a.confirmed) && (
        <Text style={styles.warningText}>
          ⚠️ Còn {assets.filter(a => !a.confirmed).length} món chưa kiểm tra — nhấn nút "KT" để xác nhận từng món.
        </Text>
      )}
    </View>
  );

  // ===== STEP 3: METER READING =====
  const MeterStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>📊 Chỉ số điện & nước khi nhận phòng</Text>
      <Text style={styles.stepDesc}>
        Ghi lại số trên mặt đồng hồ điện và nước ngay lúc này. Đây là mốc gốc — hóa đơn hàng tháng sẽ tính dựa trên phần tiêu thụ từ số này trở đi.
      </Text>

      <Text style={styles.fieldLabel}>⚡ Chỉ số điện hiện tại (kWh)</Text>
      <TextInput
        style={styles.input}
        placeholder="Ví dụ: 1250"
        keyboardType="numeric"
        value={electricityReading}
        onChangeText={setElectricityReading}
      />

      <Text style={styles.fieldLabel}>🚰 Chỉ số nước hiện tại (m³)</Text>
      <TextInput
        style={styles.input}
        placeholder="Ví dụ: 45"
        keyboardType="numeric"
        value={waterReading}
        onChangeText={setWaterReading}
      />

      <Text style={styles.fieldLabel}>📷 Chụp ảnh mặt đồng hồ làm bằng chứng</Text>
      <View style={styles.meterPhotoRow}>
        <TouchableOpacity style={styles.meterPhotoBtn} onPress={() => pickImage(setMeterImages)}>
          <Text style={{ fontSize: 24 }}>📷</Text>
          <Text style={styles.photoBtnText}>Chụp ảnh đồng hồ điện & nước</Text>
          <Text style={styles.photoBtnSub}>{meterImages.length > 0 ? `${meterImages.length} ảnh đã chụp` : 'Chưa có ảnh'}</Text>
        </TouchableOpacity>
      </View>

      {meterImages.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
          {meterImages.map((uri, i) => (
            <Image key={i} source={{ uri }} style={styles.thumbImage} />
          ))}
        </ScrollView>
      )}

      <View style={styles.infoBox}>
        <Text style={styles.infoBoxText}>
          📸 Ảnh đồng hồ là bằng chứng tránh tranh chấp về tiền điện/nước sau này. Hãy chụp rõ số trên mặt đồng hồ.
        </Text>
      </View>
    </View>
  );

  // ===== STEP 4: CONFIRM =====
  const ConfirmStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>✅ Xác nhận & Hoàn tất nhận phòng</Text>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Thông tin bàn giao của bạn</Text>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Phòng</Text>
          <Text style={styles.summaryValue}>Phòng 201 · Nhà 15 Nguyễn Trãi</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Tài sản</Text>
          <Text style={styles.summaryValue}>{assets.length} thiết bị · {assets.filter(a => a.condition === 'good').length} tốt</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Chỉ số điện</Text>
          <Text style={styles.summaryValue}>{electricityReading || '—'} kWh</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Chỉ số nước</Text>
          <Text style={styles.summaryValue}>{waterReading || '—'} m³</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Ngày nhận phòng</Text>
          <Text style={styles.summaryValue}>{new Date().toLocaleDateString('vi-VN')}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.agreeRow}
        onPress={() => setAgreeTerms(!agreeTerms)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, agreeTerms && styles.checkboxDone]}>
          {agreeTerms && <Text style={{ color: Colors.white, fontSize: 12, fontWeight: '700' }}>✓</Text>}
        </View>
        <Text style={styles.agreeText}>
          Tôi đã tự kiểm tra phòng và tài sản, đồng ý với thông tin đã ghi nhận ở trên.
        </Text>
      </TouchableOpacity>

      <View style={styles.infoBox}>
        <Text style={styles.infoBoxText}>
          ⚠️ Sau khi xác nhận, thông tin này không thể chỉnh sửa. Khi trả phòng, manager sẽ đối chiếu để xác định có thiệt hại gì không.
        </Text>
      </View>
    </View>
  );

  const renderStep = () => {
    switch (currentStep) {
      case 'room': return <RoomStep />;
      case 'assets': return <AssetsStep />;
      case 'meter': return <MeterStep />;
      case 'confirm': return <ConfirmStep />;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Quay lại</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nhận phòng</Text>
        <View style={{ width: 80 }} />
      </View>

      <StepIndicator />

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {renderStep()}
      </ScrollView>

      {/* Navigation buttons */}
      <View style={styles.navBar}>
        {stepIndex > 0 && (
          <TouchableOpacity style={styles.prevBtn} onPress={goPrev}>
            <Text style={styles.prevBtnText}>← Trước</Text>
          </TouchableOpacity>
        )}
        {currentStep !== 'confirm' ? (
          <TouchableOpacity
            style={[styles.nextBtn, !canGoNext() && styles.nextBtnDisabled, stepIndex === 0 && { flex: 1 }]}
            onPress={goNext}
            disabled={!canGoNext()}
          >
            <Text style={styles.nextBtnText}>Tiếp theo →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: Colors.success }, !agreeTerms && styles.nextBtnDisabled]}
            onPress={handleSubmit}
            disabled={!agreeTerms}
          >
            <Text style={styles.nextBtnText}>✅ Xác nhận hoàn tất</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: { padding: Spacing.sm },
  backBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },

  stepIndicator: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  stepItem: { alignItems: 'center', flex: 1 },
  stepCircle: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.divider, marginBottom: 4,
  },
  stepCircleDone: { backgroundColor: Colors.success },
  stepCircleCurrent: { backgroundColor: Colors.primary },
  stepCircleText: { fontSize: 14, color: Colors.textMuted },
  stepLabel: { fontSize: 9, color: Colors.textMuted, textAlign: 'center' },
  stepLabelCurrent: { color: Colors.primary, fontWeight: '700' },
  stepLine: { flex: 1, height: 2, backgroundColor: Colors.divider, marginBottom: 18 },
  stepLineDone: { backgroundColor: Colors.success },

  scroll: { flex: 1 },
  stepContent: { padding: Spacing.lg },
  stepTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  stepDesc: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22, marginBottom: Spacing.lg },

  fieldLabel: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: Spacing.sm, marginTop: Spacing.md },
  input: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: 15, color: Colors.textPrimary,
  },

  photoBtn: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.md, padding: Spacing.md,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    flexDirection: 'row', gap: Spacing.md,
  },
  photoBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  photoBtnSub: { fontSize: 12, color: Colors.textMuted },
  imageRow: { marginTop: Spacing.sm, marginBottom: Spacing.md },
  thumbImage: { width: 80, height: 80, borderRadius: BorderRadius.md, marginRight: Spacing.sm },

  infoBox: { backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md, padding: Spacing.md, marginTop: Spacing.lg },
  infoBoxText: { fontSize: 13, color: Colors.primary, lineHeight: 20 },

  // Assets
  assetCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md,
    marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  assetCardConfirmed: { borderColor: Colors.success },
  assetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  assetName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  assetQty: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  confirmCheck: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmCheckDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  conditionLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.sm },
  conditionRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  conditionBtn: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.divider,
  },
  conditionBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  assetNoteInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm,
    padding: Spacing.sm, fontSize: 13, color: Colors.textPrimary, marginTop: Spacing.sm,
  },
  warningText: { fontSize: 13, color: Colors.warning, fontWeight: '600', textAlign: 'center', marginTop: Spacing.md },

  // Meter
  meterPhotoRow: { marginBottom: Spacing.md },
  meterPhotoBtn: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.md, padding: Spacing.base,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    gap: Spacing.sm,
  },

  // Confirm
  summaryCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm, marginBottom: Spacing.lg },
  summaryTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  summaryLabel: { fontSize: 13, color: Colors.textMuted },
  summaryValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

  agreeRow: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start', marginBottom: Spacing.md },
  checkbox: { width: 24, height: 24, borderRadius: 4, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkboxDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  agreeText: { flex: 1, fontSize: 14, color: Colors.textSecondary, lineHeight: 22 },

  // Nav
  navBar: {
    flexDirection: 'row', gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  prevBtn: {
    flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  prevBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  nextBtn: { flex: 2, backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, paddingVertical: Spacing.md, alignItems: 'center' },
  nextBtnDisabled: { backgroundColor: Colors.textMuted },
  nextBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },
});
