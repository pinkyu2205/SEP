import React, { useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Image, ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, BorderRadius } from '@/constants';
import { showAlert } from '@/utils';
import { uploadImageToCloudinary } from '@/services/core/cloudinary';
import { tenantInvoiceDisputeService } from '@/services/tenant/invoiceDisputeService';
import {
  DISPUTE_REASONS, DISPUTE_MIN_NOTE, DISPUTE_MAX_NOTE, DISPUTE_MAX_PHOTOS,
  type InvoiceDispute, type InvoiceDisputeReason,
} from '@/types/invoiceDispute';

/**
 * KHÁCH GỬI YÊU CẦU TRA SOÁT HOÁ ĐƠN ĐIỆN / NƯỚC.
 *
 * Ba quyết định thiết kế đáng giải thích:
 *
 * 1. BẮT CHỌN LÝ DO từ danh sách, không chỉ cho gõ tự do. Lý do quyết định người xử lý
 *    phải mở cái gì ra đối chiếu: "không phải nhà tôi" thì admin soi địa chỉ trên tờ
 *    hoá đơn, "chỉ số không khớp" thì admin phóng to ảnh đồng hồ. Một ô text trống rỗng
 *    cho ra những lời khai như "tiền cao quá" — không tra được gì.
 *
 * 2. CHO ĐÍNH ẢNH. Khiếu nại chỉ số mà khách chụp được mặt đồng hồ tại thời điểm gửi
 *    thì vụ việc gần như tự kết luận. Đây là bằng chứng đối trọng với ảnh của quản lý.
 *
 * 3. NÓI TRƯỚC HỆ QUẢ VỀ HẠN THANH TOÁN, ngay trong modal. Khách sợ nhất là "khiếu nại
 *    rồi bị tính quá hạn". Không nói ra thì nhiều người thà im lặng trả tiền sai còn
 *    hơn mạo hiểm — đúng thứ tính năng này sinh ra để tránh.
 */

interface Props {
  visible: boolean;
  invoiceId: string;
  /** 'electricity' | 'water' — chỉ để đổi câu chữ cho đúng loại. */
  invoiceType: string;
  onClose: () => void;
  /** Gửi xong: màn cha vá `invoice.dispute` để vẽ lại ngay, khỏi nạp lại API. */
  onSubmitted: (dispute: InvoiceDispute) => void;
}

export const InvoiceDisputeModal: React.FC<Props> = ({
  visible, invoiceId, invoiceType, onClose, onSubmitted,
}) => {
  const [reason, setReason] = useState<InvoiceDisputeReason | null>(null);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const selected = DISPUTE_REASONS.find(r => r.code === reason);
  const noteLen = note.trim().length;
  const canSubmit = !!reason && noteLen >= DISPUTE_MIN_NOTE && !busy && !uploading;
  const label = invoiceType === 'water' ? 'nước' : 'điện';

  const reset = () => {
    setReason(null);
    setNote('');
    setPhotos([]);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const addPhoto = async () => {
    const remaining = DISPUTE_MAX_PHOTOS - photos.length;
    if (remaining <= 0) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showAlert('Cần quyền truy cập ảnh', 'Vui lòng cho phép ứng dụng đọc thư viện ảnh để đính kèm bằng chứng.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.6,
      allowsMultipleSelection: remaining > 1,
      selectionLimit: remaining,
    });
    if (result.canceled || !result.assets?.length) return;

    setUploading(true);
    try {
      // Upload tuần tự: ảnh khiếu nại nhiều nhất 3 tấm, không đáng để bắn song song
      // rồi phải xử lý trường hợp một tấm hỏng giữa chừng.
      const urls: string[] = [];
      for (const asset of result.assets.slice(0, remaining)) {
        urls.push(await uploadImageToCloudinary(asset.uri));
      }
      setPhotos(prev => [...prev, ...urls]);
    } catch {
      showAlert('Lỗi', 'Không tải được ảnh lên. Bạn vẫn gửi được yêu cầu mà không đính ảnh.');
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (url: string) => setPhotos(prev => prev.filter(p => p !== url));

  const submit = async () => {
    if (!canSubmit || !reason) return;
    setBusy(true);
    try {
      const dispute = await tenantInvoiceDisputeService.create(invoiceId, {
        reason,
        note: note.trim(),
        photos: photos.length ? photos : undefined,
      });
      showAlert(
        'Đã gửi yêu cầu tra soát',
        'Quản trị viên sẽ kiểm tra lại hoá đơn và phản hồi cho bạn. '
        + 'Trong lúc chờ, hoá đơn này tạm ngừng tính quá hạn.',
      );
      reset();
      onSubmitted(dispute);
    } catch (err: any) {
      showAlert('Lỗi', err?.response?.data?.message || 'Không gửi được yêu cầu tra soát.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={s.overlay}>
        <View style={s.box}>
          <View style={s.head}>
            <Text style={s.title}>Báo sai hoá đơn {label}</Text>
            <Text style={s.desc}>
              Chọn điểm bạn thấy chưa đúng. Quản trị viên sẽ đối chiếu lại với ảnh gốc
              và hoá đơn của cả căn nhà.
            </Text>
          </View>

          <ScrollView style={s.body} keyboardShouldPersistTaps="handled">
            {/* ── Lý do ── */}
            <Text style={s.fieldLabel}>Vấn đề bạn gặp</Text>
            {DISPUTE_REASONS.map(r => {
              const active = reason === r.code;
              return (
                <TouchableOpacity
                  key={r.code}
                  style={[s.reasonBtn, active && s.reasonBtnActive]}
                  onPress={() => setReason(r.code)}
                  activeOpacity={0.8}
                >
                  <Text style={s.reasonIcon}>{r.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.reasonLabel, active && { color: Colors.primary }]}>
                      {r.label}
                    </Text>
                    <Text style={s.reasonHint}>{r.hint}</Text>
                  </View>
                  <View style={[s.radio, active && s.radioActive]} />
                </TouchableOpacity>
              );
            })}

            {/* ── Mô tả ── */}
            <Text style={[s.fieldLabel, { marginTop: Spacing.base }]}>
              Mô tả cụ thể <Text style={{ color: Colors.error }}>*</Text>
            </Text>
            <TextInput
              style={s.input}
              value={note}
              onChangeText={t => setNote(t.slice(0, DISPUTE_MAX_NOTE))}
              multiline
              editable={!busy}
              placeholder={selected?.placeholder ?? 'Chọn vấn đề ở trên trước, rồi mô tả cụ thể...'}
              placeholderTextColor={Colors.textMuted}
            />
            {/* Đếm ký tự vì BE bắt tối thiểu — cho khách thấy trước khi bấm gửi, giống
                modal khiếu nại hoàn cọc ở CheckoutDetailScreen. */}
            <Text style={s.counter}>
              {noteLen < DISPUTE_MIN_NOTE
                ? `Cần thêm ${DISPUTE_MIN_NOTE - noteLen} ký tự nữa`
                : `${noteLen}/${DISPUTE_MAX_NOTE} ký tự`}
            </Text>

            {/* ── Ảnh đính kèm ── */}
            <Text style={[s.fieldLabel, { marginTop: Spacing.base }]}>
              Ảnh của bạn (không bắt buộc)
            </Text>
            <Text style={s.photoNote}>
              Chụp lại mặt đồng hồ hoặc tờ hoá đơn bạn nhận được — đây là bằng chứng
              đối chứng mạnh nhất.
            </Text>
            <View style={s.photoRow}>
              {photos.map(url => (
                <View key={url} style={s.thumbWrap}>
                  <Image source={{ uri: url }} style={s.thumb} />
                  <TouchableOpacity style={s.thumbX} onPress={() => removePhoto(url)}>
                    <Text style={s.thumbXText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {photos.length < DISPUTE_MAX_PHOTOS && (
                <TouchableOpacity
                  style={s.addPhoto}
                  onPress={addPhoto}
                  disabled={uploading}
                  activeOpacity={0.8}
                >
                  {uploading
                    ? <ActivityIndicator size="small" color={Colors.primary} />
                    : <Text style={s.addPhotoText}>+ Ảnh</Text>}
                </TouchableOpacity>
              )}
            </View>

            {/* Hệ quả — đặt sát nút gửi, đây là thứ khách phân vân nhất. */}
            <View style={s.effectBox}>
              <Text style={s.effectText}>
                ℹ️ Trong lúc tra soát, hoá đơn này <Text style={s.effectStrong}>tạm ngừng
                tính quá hạn</Text> và không bị phạt trễ. Nếu yêu cầu không có căn cứ,
                hạn thanh toán sẽ chạy lại và bạn được cộng thêm vài ngày để trả.
              </Text>
            </View>
          </ScrollView>

          <View style={s.actions}>
            <TouchableOpacity style={s.cancel} onPress={close} disabled={busy}>
              <Text style={s.cancelText}>Đóng</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.submit, !canSubmit && { opacity: 0.5 }]}
              onPress={submit}
              disabled={!canSubmit}
            >
              <Text style={s.submitText}>{busy ? 'Đang gửi...' : 'Gửi yêu cầu tra soát'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: Colors.overlay,
    justifyContent: 'center', alignItems: 'center', padding: Spacing.lg,
  },
  box: {
    width: '100%', maxHeight: '88%',
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, overflow: 'hidden',
  },
  head: {
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  title: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
  desc: { fontSize: 13, color: Colors.textSecondary, marginTop: 6, lineHeight: 19 },

  body: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  fieldLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: Spacing.sm,
  },

  reasonBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    padding: Spacing.sm, marginBottom: Spacing.sm,
  },
  reasonBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  reasonIcon: { fontSize: 18 },
  reasonLabel: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  reasonHint: { fontSize: 12, color: Colors.textMuted, marginTop: 2, lineHeight: 17 },
  radio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: Colors.border,
  },
  radioActive: { borderColor: Colors.primary, backgroundColor: Colors.primary },

  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    padding: Spacing.sm, minHeight: 90, textAlignVertical: 'top',
    fontSize: 14, color: Colors.textPrimary,
  },
  counter: { fontSize: 11, color: Colors.textMuted, marginTop: 4, textAlign: 'right' },

  photoNote: { fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.sm, lineHeight: 17 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  thumbWrap: { position: 'relative' },
  thumb: { width: 72, height: 72, borderRadius: BorderRadius.md, backgroundColor: Colors.divider },
  thumbX: {
    position: 'absolute', top: -6, right: -6,
    width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.error,
    alignItems: 'center', justifyContent: 'center',
  },
  thumbXText: { color: Colors.white, fontSize: 15, fontWeight: '800', lineHeight: 18 },
  addPhoto: {
    width: 72, height: 72, borderRadius: BorderRadius.md,
    borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  addPhotoText: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  effectBox: {
    backgroundColor: Colors.infoLight, borderRadius: BorderRadius.md,
    padding: Spacing.sm, marginTop: Spacing.base, marginBottom: Spacing.md,
  },
  effectText: { fontSize: 12, color: '#1E40AF', lineHeight: 18 },
  effectStrong: { fontWeight: '800' },

  actions: {
    flexDirection: 'row', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  cancel: {
    flex: 1, paddingVertical: 13, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  cancelText: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  submit: {
    flex: 2, paddingVertical: 13, borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary, alignItems: 'center',
  },
  submitText: { fontSize: 14, fontWeight: '700', color: Colors.white },
});
