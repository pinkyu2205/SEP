import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { MaintenanceCategory, MaintenancePriority } from '../../types';

const CATEGORIES: { key: MaintenanceCategory; label: string; emoji: string }[] = [
  { key: 'electrical', label: 'Điện', emoji: '⚡' },
  { key: 'plumbing', label: 'Nước / Ống', emoji: '🚰' },
  { key: 'furniture', label: 'Nội thất', emoji: '🪑' },
  { key: 'appliance', label: 'Thiết bị', emoji: '📺' },
  { key: 'other', label: 'Khác', emoji: '🔧' },
];

const PRIORITIES: { key: MaintenancePriority; label: string; color: string; desc: string }[] = [
  { key: 'low', label: 'Thấp', color: Colors.success, desc: 'Không ảnh hưởng sinh hoạt' },
  { key: 'medium', label: 'Trung bình', color: Colors.warning, desc: 'Bất tiện nhưng vẫn dùng được' },
  { key: 'high', label: 'Cao', color: Colors.error, desc: 'Cần xử lý sớm' },
  { key: 'urgent', label: 'Khẩn cấp', color: '#7C3AED', desc: 'Nguy hiểm, cần xử lý ngay' },
];

export const MaintenanceCreateScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<MaintenanceCategory | null>(null);
  const [priority, setPriority] = useState<MaintenancePriority>('medium');
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const pickImage = async () => {
    if (images.length >= 5) {
      Alert.alert('Giới hạn', 'Bạn chỉ có thể đính kèm tối đa 5 ảnh.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]) {
      setImages(prev => [...prev, result.assets[0].uri]);
    }
  };

  const takePhoto = async () => {
    if (images.length >= 5) {
      Alert.alert('Giới hạn', 'Bạn chỉ có thể đính kèm tối đa 5 ảnh.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.6,
    });
    if (!result.canceled && result.assets[0]) {
      setImages(prev => [...prev, result.assets[0].uri]);
    }
  };

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!title.trim()) { Alert.alert('Lỗi', 'Vui lòng nhập tiêu đề sự cố.'); return; }
    if (!description.trim()) { Alert.alert('Lỗi', 'Vui lòng mô tả chi tiết sự cố.'); return; }
    if (!category) { Alert.alert('Lỗi', 'Vui lòng chọn loại sự cố.'); return; }

    setSubmitting(true);
    // Simulate API call
    await new Promise(r => setTimeout(r, 1200));
    setSubmitting(false);

    Alert.alert(
      'Gửi yêu cầu thành công! 🔧',
      'Yêu cầu sửa chữa của bạn đã được gửi. Quản lý sẽ tiếp nhận và phản hồi sớm nhất.',
      [{ text: 'OK', onPress: () => navigation.goBack() }]
    );
  };

  const isValid = title.trim() && description.trim() && category;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Hủy</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Yêu cầu sửa chữa</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Tiêu đề */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Tiêu đề sự cố <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="Ví dụ: Vòi nước bị rỉ, Ổ cắm hỏng..."
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />
        </View>

        {/* Loại sự cố */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Loại sự cố <Text style={styles.required}>*</Text></Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat.key}
                style={[styles.categoryItem, category === cat.key && styles.categoryItemActive]}
                onPress={() => setCategory(cat.key)}
                activeOpacity={0.7}
              >
                <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                <Text style={[styles.categoryLabel, category === cat.key && styles.categoryLabelActive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Mức độ ưu tiên */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Mức độ ưu tiên <Text style={styles.required}>*</Text></Text>
          <View style={styles.priorityList}>
            {PRIORITIES.map(p => (
              <TouchableOpacity
                key={p.key}
                style={[styles.priorityItem, priority === p.key && { borderColor: p.color, backgroundColor: p.color + '10' }]}
                onPress={() => setPriority(p.key)}
                activeOpacity={0.7}
              >
                <View style={[styles.priorityRadio, priority === p.key && { borderColor: p.color }]}>
                  {priority === p.key && <View style={[styles.priorityRadioDot, { backgroundColor: p.color }]} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.priorityLabel, { color: p.color }]}>{p.label}</Text>
                  <Text style={styles.priorityDesc}>{p.desc}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Mô tả chi tiết */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Mô tả chi tiết <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Mô tả rõ tình trạng sự cố: vị trí, triệu chứng, thời điểm phát sinh..."
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            value={description}
            onChangeText={setDescription}
            maxLength={500}
          />
          <Text style={styles.charCount}>{description.length}/500</Text>
        </View>

        {/* Ảnh đính kèm */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Ảnh hiện trạng <Text style={styles.optional}>(Không bắt buộc)</Text></Text>
          <View style={styles.imageRow}>
            <TouchableOpacity style={styles.imageAddBtn} onPress={takePhoto}>
              <Text style={styles.imageAddEmoji}>📷</Text>
              <Text style={styles.imageAddText}>Chụp ảnh</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.imageAddBtn} onPress={pickImage}>
              <Text style={styles.imageAddEmoji}>🖼️</Text>
              <Text style={styles.imageAddText}>Thư viện</Text>
            </TouchableOpacity>
          </View>
          {images.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagePreviewRow}>
              {images.map((uri, idx) => (
                <View key={idx} style={styles.imagePreviewWrap}>
                  <Image source={{ uri }} style={styles.imagePreview} />
                  <TouchableOpacity style={styles.imageRemoveBtn} onPress={() => removeImage(idx)}>
                    <Text style={{ color: Colors.white, fontSize: 10, fontWeight: '700' }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )}
          <Text style={styles.imageHint}>Tối đa 5 ảnh · {images.length}/5</Text>
        </View>

        {/* Lưu ý */}
        <View style={styles.noticeCard}>
          <Text style={styles.noticeText}>
            💡 Sau khi gửi, quản lý sẽ tiếp nhận và phân công thợ trong vòng 24-48 giờ làm việc. Bạn sẽ nhận thông báo khi có cập nhật.
          </Text>
        </View>

        {/* Nút gửi */}
        <TouchableOpacity
          style={[styles.submitBtn, (!isValid || submitting) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!isValid || submitting}
        >
          <Text style={styles.submitBtnText}>
            {submitting ? 'Đang gửi...' : '🔧 Gửi yêu cầu sửa chữa'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
  backBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },

  scroll: { flex: 1 },
  field: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  fieldLabel: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  required: { color: Colors.error },
  optional: { color: Colors.textMuted, fontWeight: '400' },

  input: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: 15, color: Colors.textPrimary,
  },
  textArea: { height: 120, textAlignVertical: 'top' },
  charCount: { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 4 },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  categoryItem: {
    width: '18%', aspectRatio: 1, borderRadius: BorderRadius.md, backgroundColor: Colors.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: Colors.border,
  },
  categoryItemActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  categoryEmoji: { fontSize: 22 },
  categoryLabel: { fontSize: 10, fontWeight: '600', color: Colors.textMuted, marginTop: 2 },
  categoryLabelActive: { color: Colors.primary },

  priorityList: { gap: Spacing.sm },
  priorityItem: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.white, borderRadius: BorderRadius.md, padding: Spacing.md,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  priorityRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  priorityRadioDot: { width: 10, height: 10, borderRadius: 5 },
  priorityLabel: { fontSize: 14, fontWeight: '700' },
  priorityDesc: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  imageRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.sm },
  imageAddBtn: {
    flex: 1, backgroundColor: Colors.white, borderRadius: BorderRadius.md, padding: Spacing.md,
    alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
  },
  imageAddEmoji: { fontSize: 24, marginBottom: 4 },
  imageAddText: { fontSize: 13, fontWeight: '500', color: Colors.textSecondary },
  imagePreviewRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  imagePreviewWrap: { marginRight: Spacing.sm, position: 'relative' },
  imagePreview: { width: 80, height: 80, borderRadius: BorderRadius.md },
  imageRemoveBtn: {
    position: 'absolute', top: 4, right: 4, width: 20, height: 20,
    borderRadius: 10, backgroundColor: Colors.error, alignItems: 'center', justifyContent: 'center',
  },
  imageHint: { fontSize: 12, color: Colors.textMuted },

  noticeCard: {
    margin: Spacing.lg, backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md, padding: Spacing.md,
  },
  noticeText: { fontSize: 13, color: Colors.primary, lineHeight: 20 },

  submitBtn: {
    marginHorizontal: Spacing.lg, marginBottom: 40, backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg, paddingVertical: Spacing.base, alignItems: 'center', ...Shadow.md,
  },
  submitBtnDisabled: { backgroundColor: Colors.textMuted },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
});
