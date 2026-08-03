import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';

/**
 * Hộp thoại xác nhận trong app — thay cho window.confirm của trình duyệt.
 *
 * `showAlert` (utils/showAlert) vẫn dùng được cho thông báo nhanh, nhưng nó rơi về
 * window.confirm trên web: hộp thoại xám của Chrome, kèm dòng "localhost:8081 cho biết",
 * không theo giao diện app. Dùng component này cho các xác nhận người dùng nhìn thấy nhiều
 * (đăng xuất, thanh lý HĐ, xoá...) để đồng bộ với phần còn lại của app.
 */
export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  /** Emoji hiển thị trong vòng tròn trên cùng. Bỏ trống thì ẩn luôn vòng tròn. */
  icon?: string;
  confirmText?: string;
  cancelText?: string;
  /** Nút xác nhận màu đỏ — dùng cho hành động khó hoàn tác. */
  danger?: boolean;
  /** Đang xử lý: khoá 2 nút và hiện spinner trên nút xác nhận. */
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  visible, title, message, icon, confirmText = 'Xác nhận', cancelText = 'Huỷ',
  danger, loading, onConfirm, onCancel,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    {/* Bấm ra ngoài = huỷ; bấm trong hộp thì chặn lại để không đóng nhầm */}
    <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={loading ? undefined : onCancel}>
      <TouchableOpacity style={s.box} activeOpacity={1}>
        {!!icon && (
          <View style={[s.iconWrap, danger && s.iconWrapDanger]}>
            <Text style={s.icon}>{icon}</Text>
          </View>
        )}
        <Text style={s.title}>{title}</Text>
        {!!message && <Text style={s.message}>{message}</Text>}

        <View style={s.actions}>
          <TouchableOpacity
            style={[s.btn, s.cancelBtn, loading && s.btnDisabled]}
            onPress={onCancel}
            disabled={loading}
          >
            <Text style={s.cancelText}>{cancelText}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btn, s.confirmBtn, danger && s.confirmBtnDanger, loading && s.btnDisabled]}
            onPress={onConfirm}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <Text style={s.confirmText}>{confirmText}</Text>}
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </TouchableOpacity>
  </Modal>
);

const s = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center', justifyContent: 'center', padding: Spacing.lg,
  },
  box: {
    width: '100%', maxWidth: 340, backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl, padding: Spacing.lg, alignItems: 'center', ...Shadow.lg,
  },
  iconWrap: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primaryBg,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
  },
  iconWrapDanger: { backgroundColor: Colors.errorLight },
  icon:    { fontSize: 26 },
  title:   { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  message: { fontSize: 13.5, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: 6 },

  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg, width: '100%' },
  btn: { flex: 1, borderRadius: BorderRadius.lg, paddingVertical: Spacing.md, alignItems: 'center', justifyContent: 'center', minHeight: 46 },
  btnDisabled: { opacity: 0.6 },
  cancelBtn:   { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  cancelText:  { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  confirmBtn:  { backgroundColor: Colors.primary },
  confirmBtnDanger: { backgroundColor: Colors.error },
  confirmText: { fontSize: 14, fontWeight: '800', color: Colors.white },
});
