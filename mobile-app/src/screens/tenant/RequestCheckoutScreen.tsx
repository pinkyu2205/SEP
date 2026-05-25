import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { Contract } from '../../types';
import { formatDate } from '../../utils';
import { checkoutStore, CheckoutRequest } from '../../store/checkoutStore';

const REASONS = [
  'Chuyển chỗ ở do công việc',
  'Mua nhà riêng',
  'Hết thời hạn hợp đồng',
  'Học tập / công tác nơi khác',
  'Lý do gia đình',
  'Lý do tài chính',
  'Lý do khác',
];

const MOCK_CONTRACT = {
  code: 'HD-MT-2025-001',
  roomName: 'Phòng P101',
  buildingName: 'Nhà Nguyễn Trãi',
  depositAmount: 7000000,
};

export const RequestCheckoutScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const contract: Contract | undefined = route.params?.contract;

  const contractCode    = contract?.code         ?? MOCK_CONTRACT.code;
  const roomName        = contract?.roomCode      ?? MOCK_CONTRACT.roomName;
  const buildingName    = contract?.propertyName  ?? MOCK_CONTRACT.buildingName;
  const depositAmount   = contract?.depositAmount ?? MOCK_CONTRACT.depositAmount;

  const [moveOutDate,         setMoveOutDate]         = useState('');
  const [selectedReason,      setSelectedReason]      = useState<string | null>(null);
  const [customReason,        setCustomReason]        = useState('');
  const [note,                setNote]                = useState('');
  const [bankName,            setBankName]            = useState('');
  const [bankAccount,         setBankAccount]         = useState('');
  const [accountHolder,       setAccountHolder]       = useState('');
  const [photos,              setPhotos]              = useState<string[]>([]);
  const [submitting,          setSubmitting]          = useState(false);

  const reasonText = selectedReason === 'Lý do khác' ? customReason.trim() : selectedReason ?? '';

  const pickPhoto = async () => {
    if (photos.length >= 5) {
      Alert.alert('Giới hạn', 'Tối đa 5 ảnh được đính kèm.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      setPhotos(prev => [...prev, result.assets[0].uri]);
    }
  };

  const takePhoto = async () => {
    if (photos.length >= 5) {
      Alert.alert('Giới hạn', 'Tối đa 5 ảnh được đính kèm.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      setPhotos(prev => [...prev, result.assets[0].uri]);
    }
  };

  const removePhoto = (idx: number) => setPhotos(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (!moveOutDate.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập ngày muốn trả phòng.');
      return;
    }
    if (!reasonText) {
      Alert.alert('Thiếu thông tin', 'Vui lòng chọn lý do trả phòng.');
      return;
    }
    if (!bankName.trim() || !bankAccount.trim() || !accountHolder.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng điền đầy đủ thông tin tài khoản nhận hoàn cọc.');
      return;
    }

    setSubmitting(true);
    await new Promise(r => setTimeout(r, 1400));
    setSubmitting(false);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);

    const newRequest: CheckoutRequest = {
      id:                   `co-${Date.now()}`,
      tenantId:             't1',
      tenantName:           'Nguyễn Văn A',
      roomId:               'r1',
      roomName,
      buildingId:           'prop-1',
      buildingName,
      contractId:           'ct-001',
      contractCode,
      requestedMoveOutDate: moveOutDate.trim(),
      reason:               reasonText,
      note:                 note.trim() || undefined,
      refundBankAccount:    bankAccount.trim(),
      refundBankName:       bankName.trim(),
      refundAccountHolder:  accountHolder.trim(),
      photos,
      status:               'pending_manager_approval',
      damages:              [],
      depositAmount,
      unpaidBalance:        0,
      damageDeduction:      0,
      serviceDeduction:     0,
      finalRefundAmount:    depositAmount,
      refundStatus:         'pending',
      createdAt:            dateStr,
      updatedAt:            dateStr,
    };

    checkoutStore.add(newRequest);

    Alert.alert(
      '✅ Gửi yêu cầu thành công!',
      'Yêu cầu trả phòng của bạn đã được ghi nhận. Quản lý sẽ xác nhận và liên hệ trong thời gian sớm nhất.',
      [
        {
          text: 'Xem tiến trình',
          onPress: () => navigation.replace('CheckoutDetail', { checkout: newRequest }),
        },
      ]
    );
  };

  const isValid = moveOutDate.trim() && reasonText && bankName.trim() && bankAccount.trim() && accountHolder.trim();

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Hủy</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Yêu cầu trả phòng</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Helper Banner */}
        <View style={styles.helperBanner}>
          <Text style={styles.helperText}>
            💡 Yêu cầu trả phòng sẽ được quản lý xác nhận trước khi tiến hành kiểm tra hiện trạng và hoàn cọc.
          </Text>
        </View>

        {/* Pre-filled info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>📋 Thông tin phòng & hợp đồng</Text>
          {[
            { label: 'Phòng',         value: roomName },
            { label: 'Tòa nhà',       value: buildingName },
            { label: 'Mã hợp đồng',   value: contractCode },
            { label: 'Tiền đặt cọc',  value: `${depositAmount.toLocaleString('vi-VN')} đ` },
          ].map((row, i) => (
            <View key={i} style={[styles.infoRow, i === 3 && { borderBottomWidth: 0 }]}>
              <Text style={styles.infoLabel}>{row.label}</Text>
              <Text style={styles.infoValue}>{row.value}</Text>
            </View>
          ))}
        </View>

        {/* Move-out date */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            Ngày muốn trả phòng <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD (ví dụ: 2026-06-30)"
            value={moveOutDate}
            onChangeText={setMoveOutDate}
            keyboardType="numbers-and-punctuation"
          />
          <Text style={styles.fieldHint}>Ít nhất 7 ngày kể từ hôm nay để quản lý sắp xếp kiểm tra.</Text>
        </View>

        {/* Reason selection */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            Lý do trả phòng <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.reasonGrid}>
            {REASONS.map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.reasonChip, selectedReason === r && styles.reasonChipActive]}
                onPress={() => setSelectedReason(r)}
                activeOpacity={0.7}
              >
                <Text style={[styles.reasonChipText, selectedReason === r && styles.reasonChipTextActive]}>
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {selectedReason === 'Lý do khác' && (
            <TextInput
              style={[styles.input, { marginTop: Spacing.sm }]}
              placeholder="Vui lòng mô tả lý do..."
              value={customReason}
              onChangeText={setCustomReason}
              maxLength={200}
            />
          )}
        </View>

        {/* Additional note */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            Ghi chú thêm <Text style={styles.optional}>(không bắt buộc)</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Thời gian có thể kiểm tra, yêu cầu đặc biệt..."
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            value={note}
            onChangeText={setNote}
            maxLength={400}
          />
          <Text style={styles.charCount}>{note.length}/400</Text>
        </View>

        {/* Bank account for refund */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            Tài khoản nhận hoàn cọc <Text style={styles.required}>*</Text>
          </Text>
          <Text style={styles.fieldHint}>Thông tin tài khoản ngân hàng để nhận tiền cọc hoàn trả.</Text>
          <TextInput
            style={[styles.input, { marginTop: Spacing.sm }]}
            placeholder="Tên ngân hàng (ví dụ: Vietcombank, Techcombank...)"
            value={bankName}
            onChangeText={setBankName}
          />
          <TextInput
            style={[styles.input, { marginTop: Spacing.sm }]}
            placeholder="Số tài khoản"
            value={bankAccount}
            onChangeText={setBankAccount}
            keyboardType="numeric"
          />
          <TextInput
            style={[styles.input, { marginTop: Spacing.sm }]}
            placeholder="Tên chủ tài khoản (chữ in hoa)"
            value={accountHolder}
            onChangeText={v => setAccountHolder(v.toUpperCase())}
            autoCapitalize="characters"
          />
        </View>

        {/* Photos */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            Ảnh hiện trạng phòng <Text style={styles.optional}>(không bắt buộc)</Text>
          </Text>
          <Text style={styles.fieldHint}>Đính kèm ảnh phòng hiện tại làm bằng chứng tham khảo.</Text>
          <View style={styles.photoRow}>
            <TouchableOpacity style={styles.photoAddBtn} onPress={takePhoto}>
              <Text style={styles.photoAddIcon}>📷</Text>
              <Text style={styles.photoAddText}>Chụp ảnh</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoAddBtn} onPress={pickPhoto}>
              <Text style={styles.photoAddIcon}>🖼️</Text>
              <Text style={styles.photoAddText}>Thư viện</Text>
            </TouchableOpacity>
          </View>
          {photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: Spacing.sm }}>
              {photos.map((uri, idx) => (
                <View key={idx} style={styles.photoWrap}>
                  <Image source={{ uri }} style={styles.photoThumb} />
                  <TouchableOpacity style={styles.photoRemove} onPress={() => removePhoto(idx)}>
                    <Text style={{ color: Colors.white, fontSize: 10, fontWeight: '700' }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
          <Text style={styles.charCount}>{photos.length}/5 ảnh</Text>
        </View>

        {/* Notice */}
        <View style={styles.noticeCard}>
          <Text style={styles.noticeText}>
            🔔 Sau khi gửi yêu cầu, quản lý sẽ liên hệ để xác nhận lịch kiểm tra phòng. Tiền cọc sẽ được hoàn trả sau khi hoàn tất kiểm tra và quyết toán.
          </Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, (!isValid || submitting) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!isValid || submitting}
          activeOpacity={0.8}
        >
          <Text style={styles.submitBtnText}>
            {submitting ? 'Đang gửi...' : '🏠 Gửi yêu cầu trả phòng'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: { padding: Spacing.sm },
  backText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },

  scroll: { flex: 1 },

  helperBanner: {
    margin: Spacing.lg, marginBottom: 0,
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg,
    padding: Spacing.base, borderLeftWidth: 3, borderLeftColor: Colors.primary,
  },
  helperText: { fontSize: 13, color: Colors.primary, lineHeight: 20 },

  infoCard: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.lg,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  infoCardTitle: {
    fontSize: 13, fontWeight: '700', color: Colors.textPrimary,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  infoLabel: { fontSize: 13, color: Colors.textMuted },
  infoValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

  field: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  fieldLabel: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  fieldHint: { fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.xs },
  required: { color: Colors.error },
  optional: { fontWeight: '400', color: Colors.textMuted },

  input: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    fontSize: 15, color: Colors.textPrimary,
  },
  textArea: { height: 100, textAlignVertical: 'top' },
  charCount: { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 4 },

  reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  reasonChip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  reasonChipActive: { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  reasonChipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  reasonChipTextActive: { color: Colors.primary },

  photoRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  photoAddBtn: {
    flex: 1, backgroundColor: Colors.white, borderRadius: BorderRadius.md,
    padding: Spacing.md, alignItems: 'center', borderWidth: 1,
    borderColor: Colors.border, borderStyle: 'dashed',
  },
  photoAddIcon: { fontSize: 22, marginBottom: 4 },
  photoAddText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  photoWrap: { marginRight: Spacing.sm, position: 'relative' },
  photoThumb: { width: 80, height: 80, borderRadius: BorderRadius.md },
  photoRemove: {
    position: 'absolute', top: 4, right: 4, width: 20, height: 20,
    borderRadius: 10, backgroundColor: Colors.error, alignItems: 'center', justifyContent: 'center',
  },

  noticeCard: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.lg,
    backgroundColor: '#FFF7ED', borderRadius: BorderRadius.lg,
    padding: Spacing.base, borderLeftWidth: 3, borderLeftColor: '#F59E0B',
  },
  noticeText: { fontSize: 13, color: '#92400E', lineHeight: 20 },

  submitBtn: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.xl,
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', ...Shadow.md,
  },
  submitBtnDisabled: { backgroundColor: Colors.textMuted },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
});
