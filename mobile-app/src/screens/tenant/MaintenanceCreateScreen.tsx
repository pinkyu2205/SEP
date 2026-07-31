import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Image, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { EquipmentDto, CreateMaintenanceRequestDto } from '@/types';
import { formatDate, showAlert } from '@/utils';
import { useTenantContract } from '@/hooks';
import { realMaintenanceService } from '@/services/shared/maintenanceService';
import { realTenantSelfService } from '@/services/tenant/selfService';
import { uploadImageToCloudinary } from '@/services/core/cloudinary';
import { CameraCaptureModal } from '../../components/common/CameraCaptureModal';

const equipName = (e: EquipmentDto) => e.equipmentName || e.catalogName || 'Thiết bị';

// Nhánh B (không gắn thiết bị) — 4 danh mục BE cho phép, KHÔNG gồm APPLIANCE/FURNITURE
// (2 loại đó bắt buộc phải chọn thiết bị, BE tự chặn nếu gửi ở nhánh này).
// Xem docs/FE-maintenance-non-equipment-create.md (repo BE) §3.3.
const NON_EQUIPMENT_CATEGORIES: {
  value: string; emoji: string; label: string; subtitle: string; placeholder: string;
}[] = [
  { value: 'STRUCTURAL', emoji: '🧱', label: 'Kết cấu', subtitle: 'Tường, sàn, trần, cửa, khóa', placeholder: 'vd. Sơn tường bong / thấm góc...' },
  { value: 'ELECTRICAL', emoji: '⚡', label: 'Điện cố định', subtitle: 'Ổ cắm, đèn, cầu dao', placeholder: 'vd. Ổ cắm cháy / đèn không sáng...' },
  { value: 'PLUMBING', emoji: '🚰', label: 'Nước / WC', subtitle: 'Vòi, ống, toilet, thoát sàn', placeholder: 'vd. Vòi rò / bồn cầu tắc...' },
  { value: 'OTHER', emoji: '🔘', label: 'Khác', subtitle: 'Không thuộc 3 nhóm trên', placeholder: 'Mô tả ngắn sự cố' },
];

export const MaintenanceCreateScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { selectedContractId } = useTenantContract();
  const equipment: EquipmentDto | undefined = route.params?.equipment;
  // Không có equipment (vào từ "Sự cố khác") → bắt buộc chọn danh mục trước khi gửi.
  const needsCategory = !equipment;

  const [title, setTitle] = useState(equipment ? equipName(equipment) : '');
  const [category, setCategory] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [descExpanded, setDescExpanded] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const selectedCategory = NON_EQUIPMENT_CATEGORIES.find(c => c.value === category);
  const titlePlaceholder = equipment
    ? 'Ví dụ: Vòi nước bị rỉ, Ổ cắm hỏng...'
    : selectedCategory?.placeholder ?? 'Chọn danh mục bên trên trước';

  const pickImage = async () => {
    if (images.length >= 5) { showAlert('Giới hạn', 'Bạn chỉ có thể đính kèm tối đa 5 ảnh.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 5 - images.length, quality: 0.6 });
    if (!result.canceled) setImages(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, 5));
  };

  const takePhoto = async () => {
    if (images.length >= 5) { showAlert('Giới hạn', 'Bạn chỉ có thể đính kèm tối đa 5 ảnh.'); return; }
    // Web: launchCameraAsync chỉ mở file picker → dùng camera modal in-app.
    if (Platform.OS === 'web') { setCameraOpen(true); return; }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.6 });
    if (!result.canceled && result.assets[0]) setImages(prev => [...prev, result.assets[0].uri]);
  };

  const removeImage = (idx: number) => setImages(prev => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (!title.trim()) { showAlert('Lỗi', 'Vui lòng nhập tiêu đề sự cố.'); return; }
    // Không gắn thiết bị → BE bắt buộc category (STRUCTURAL/ELECTRICAL/PLUMBING/OTHER).
    if (needsCategory && !category) { showAlert('Lỗi', 'Vui lòng chọn danh mục hư hỏng.'); return; }
    // Flow mới: BE bắt buộc ≥1 ảnh hiện trạng (BEFORE) khi tạo yêu cầu.
    if (images.length === 0) { showAlert('Thiếu ảnh', 'Cần ít nhất 1 ảnh hiện trạng để tạo yêu cầu.'); return; }

    setSubmitting(true);

    try {
      // roomId: ưu tiên từ QR thiết bị. Không có thì dùng dashboard — nguồn sự thật duy
      // nhất — KHÔNG suy ra từ list thiết bị (phòng trống nội thất vẫn hợp lệ).
      // Nguyên căn (WHOLE_HOUSE): roomId để trống nhưng BẮT BUỘC gửi propertyId thay
      // thế — BE không tự suy được nữa (fix 27/07, trước đó thiếu propertyId gây 500).
      // Xem docs/BE-FIX-maintenance-wholehouse-roomId-2026-07-27.md (repo BE).
      let roomIdNum: number | undefined = Number(equipment?.roomId ?? NaN);
      if (!Number.isFinite(roomIdNum) || roomIdNum <= 0) roomIdNum = undefined;
      let propertyIdNum: number | undefined;

      if (roomIdNum === undefined) {
        // Nhiều HĐ ACTIVE → lấy đúng phòng/nhà của nhà đang chọn (selectedContractId),
        // không phải cứ HĐ mới nhất — xem docs/FE-multi-contract-per-phone.md.
        const dash = await realTenantSelfService.getDashboard(selectedContractId ?? undefined);

        if (!dash.contract) {
          setSubmitting(false);
          showAlert('Lỗi', 'Không tìm thấy hợp đồng đang hiệu lực. Vui lòng kiểm tra hợp đồng của bạn.');
          return;
        }

        // BE không trả field `contract.type` (dù type khai báo có) — dùng đúng tín hiệu
        // BE thực sự cung cấp: `room.id` null = HĐ nguyên căn (WHOLE_HOUSE), có giá trị =
        // thuê theo phòng (ROOM). Trước đây check `dash.contract.type === 'ROOM'` luôn
        // false vì field không tồn tại → mọi tenant thuê theo phòng bị tưởng nhầm là
        // nguyên căn, gửi propertyId thay vì roomId, BE báo "không có HĐ nguyên căn".
        const dashRoomId = Number(dash.room?.id ?? dash.contract.roomId ?? NaN);
        if (Number.isFinite(dashRoomId) && dashRoomId > 0) {
          roomIdNum = dashRoomId;
        } else {
          // Nguyên căn: không gửi roomId, thay bằng propertyId từ dashboard.
          const dashPropertyId = Number(dash.building?.propertyId ?? dash.contract.propertyId ?? NaN);
          if (!Number.isFinite(dashPropertyId) || dashPropertyId <= 0) {
            setSubmitting(false);
            showAlert('Lỗi', 'Không xác định được nhà đang thuê. Vui lòng liên hệ quản lý vận hành để được hỗ trợ.');
            return;
          }
          propertyIdNum = dashPropertyId;
        }
      }

      const uploaded: string[] = [];
      for (const uri of images) {
        try { uploaded.push(await uploadImageToCloudinary(uri)); } catch { /* bỏ ảnh lỗi */ }
      }
      if (uploaded.length === 0) {
        setSubmitting(false);
        showAlert('Lỗi', 'Không tải được ảnh lên máy chủ — cần ít nhất 1 ảnh hiện trạng. Vui lòng thử lại.');
        return;
      }
      const equipmentIdNum = Number(equipment?.id ?? NaN);
      // priority luôn do manager gán khi duyệt. category: bắt buộc khi không có thiết bị
      // (nhánh B), optional khi có thiết bị (nhánh A — manager gán lúc duyệt như cũ).
      const body: CreateMaintenanceRequestDto = {
        roomId: roomIdNum,
        propertyId: propertyIdNum,
        equipmentId: Number.isFinite(equipmentIdNum) && equipmentIdNum > 0 ? equipmentIdNum : undefined,
        title: title.trim(),
        description: description.trim() || undefined,
        category: category ?? undefined,
        images: uploaded,
      };
      await realMaintenanceService.createRequest(body);
      setSubmitting(false);
      showAlert(
        '🔧 Gửi yêu cầu thành công!',
        'Yêu cầu sửa chữa của bạn đã được gửi. Quản lý vận hành sẽ tiếp nhận và phản hồi sớm nhất.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
      return;
    } catch (e: any) {
      setSubmitting(false);
      const msg = e?.response?.data?.error || e?.response?.data?.message || e?.message || 'Không thể kết nối máy chủ.';
      showAlert('Gửi yêu cầu thất bại', msg);
    }
  };

  const isValid = !!title.trim() && images.length > 0 && (!needsCategory || !!category);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Hủy</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {equipment ? 'Báo hỏng thiết bị' : 'Yêu cầu sửa chữa'}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Equipment info card (QR flow only) */}
        {equipment && (
          <View style={styles.equipmentCard}>
            <View style={styles.equipmentCardHeader}>
              <View style={styles.equipmentIconWrap}>
                <Text style={{ fontSize: 22 }}>⚙️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.equipmentName}>{equipName(equipment)}</Text>
                {(equipment.roomName || equipment.roomNumber) && (
                  <Text style={styles.equipmentMeta}>📍 {equipment.roomName ?? equipment.roomNumber}</Text>
                )}
                {equipment.qrCode && (
                  <Text style={styles.equipmentQr}>QR: {equipment.qrCode}</Text>
                )}
              </View>
              <View style={styles.qrBadge}>
                <Text style={styles.qrBadgeText}>📷 QR</Text>
              </View>
            </View>

            <View style={styles.equipmentCardDivider} />

            <View style={styles.equipmentInfoRow}>
              {equipment.installationDate && (
                <View style={styles.equipmentInfoItem}>
                  <Text style={styles.equipmentInfoLabel}>Ngày lắp đặt</Text>
                  <Text style={styles.equipmentInfoValue}>{formatDate(equipment.installationDate)}</Text>
                </View>
              )}
              <View style={styles.equipmentInfoItem}>
                <Text style={styles.equipmentInfoLabel}>Bảo trì gần nhất</Text>
                <Text style={[styles.equipmentInfoValue, !equipment.lastMaintenanceDate && { color: Colors.textMuted }]}>
                  {equipment.lastMaintenanceDate ? formatDate(equipment.lastMaintenanceDate) : 'Chưa có'}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Danh mục — chỉ hiện khi không gắn thiết bị (nhánh B); nhánh A để manager
            gán lúc duyệt như cũ. */}
        {needsCategory && (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Danh mục <Text style={styles.required}>*</Text></Text>
            <View style={styles.categoryGrid}>
              {NON_EQUIPMENT_CATEGORIES.map(c => {
                const active = category === c.value;
                return (
                  <TouchableOpacity
                    key={c.value}
                    style={[styles.categoryCard, active && styles.categoryCardActive]}
                    onPress={() => setCategory(c.value)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.categoryEmoji}>{c.emoji}</Text>
                    <Text style={[styles.categoryLabel, active && styles.categoryLabelActive]}>{c.label}</Text>
                    <Text style={styles.categorySubtitle}>{c.subtitle}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Tiêu đề */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Tiêu đề sự cố <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            placeholder={titlePlaceholder}
            value={title}
            onChangeText={setTitle}
            maxLength={200}
          />
        </View>

        {/* Mô tả — không bắt buộc, thu gọn mặc định để form gọn */}
        <View style={styles.field}>
          {descExpanded ? (
            <>
              <Text style={styles.fieldLabel}>Mô tả <Text style={styles.optional}>(không bắt buộc)</Text></Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder={equipment
                  ? `Mô tả sự cố của ${equipName(equipment)}: triệu chứng, thời điểm phát sinh, mức độ ảnh hưởng...`
                  : 'Mô tả rõ tình trạng sự cố: vị trí, triệu chứng, thời điểm phát sinh...'}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                value={description}
                onChangeText={setDescription}
                maxLength={500}
              />
              <Text style={styles.charCount}>{description.length}/500</Text>
            </>
          ) : (
            <TouchableOpacity onPress={() => setDescExpanded(true)}>
              <Text style={styles.addDescLink}>✎ Thêm mô tả (không bắt buộc)</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Ảnh đính kèm */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Ảnh hiện trạng <Text style={styles.required}>*</Text></Text>
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
          <Text style={styles.imageHint}>Bắt buộc ít nhất 1 ảnh · Tối đa 5 ảnh · {images.length}/5</Text>
        </View>

        {/* Lưu ý */}
        <View style={styles.noticeCard}>
          <Text style={styles.noticeText}>
            {equipment
              ? `💡 Thông tin thiết bị "${equipName(equipment)}" sẽ được gửi kèm yêu cầu giúp quản lý xử lý nhanh hơn.`
              : '💡 Sau khi gửi, quản lý sẽ tiếp nhận và phân công thợ trong vòng 24-48 giờ làm việc. Bạn sẽ nhận thông báo khi có cập nhật.'}
          </Text>
        </View>

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

      <CameraCaptureModal
        visible={cameraOpen}
        multi
        onCapture={(uri) => setImages(prev => (prev.length >= 5 ? prev : [...prev, uri]))}
        onClose={() => setCameraOpen(false)}
      />
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

  // Equipment card (QR pre-fill)
  equipmentCard: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.lg,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1.5, borderColor: Colors.primary + '40',
    padding: Spacing.base, ...Shadow.sm,
  },
  equipmentCardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  equipmentIconWrap: {
    width: 44, height: 44, borderRadius: BorderRadius.md,
    backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center',
  },
  equipmentName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  equipmentMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  equipmentQr: { fontSize: 11, color: Colors.textMuted, marginTop: 2, fontFamily: 'monospace' },
  qrBadge: {
    backgroundColor: Colors.primaryBg, paddingHorizontal: Spacing.sm,
    paddingVertical: 3, borderRadius: BorderRadius.full,
  },
  qrBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  equipmentCardDivider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.md },
  equipmentInfoRow: { flexDirection: 'row', gap: Spacing.lg },
  equipmentInfoItem: { flex: 1 },
  equipmentInfoLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 2 },
  equipmentInfoValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

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
  addDescLink: { fontSize: 13, fontWeight: '600', color: Colors.primary },

  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  categoryCard: {
    width: '47%', backgroundColor: Colors.white, borderRadius: BorderRadius.md,
    borderWidth: 1.5, borderColor: Colors.border, padding: Spacing.md,
  },
  categoryCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  categoryEmoji: { fontSize: 22, marginBottom: 4 },
  categoryLabel: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  categoryLabelActive: { color: Colors.primary },
  categorySubtitle: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },

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
