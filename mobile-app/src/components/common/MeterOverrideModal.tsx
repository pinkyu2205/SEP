import React, { useState } from 'react';
import {
  ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { BorderRadius, Colors, Spacing } from '@/constants';
import { readApiError } from '@/utils';
import {
  meterOverrideService, type MeterOverrideKind,
} from '@/services/manager/meterOverrideService';

/**
 * Modal xin mã admin để được NHẬP TAY chỉ số đồng hồ khi không chụp được ảnh.
 *
 * Bối cảnh (mentor 07/08/2026, ý 5): camera hỏng / mất quyền / đồng hồ nằm chỗ không
 * chụp nổi thì trước đây tắc hẳn luồng đón khách. Giờ cho đi tiếp, nhưng phải qua cửa:
 * mã do admin cấp + LÝ DO bắt buộc, và BE ghi vết mọi lần dùng
 * (`GET /api/v1/admin/meter-overrides`).
 *
 * Bắt buộc nhập lý do ngay ở FE thay vì để BE chặn: người dùng biết mình phải giải
 * trình thì tự khắc hạn chế xin mã cho tiện tay — đó mới là mục đích của cái rào này.
 */
export const MeterOverrideModal: React.FC<{
  visible: boolean;
  meterKind: MeterOverrideKind;
  /** null khi hợp đồng chưa được tạo (đang ở giữa luồng đón khách). */
  contractId: number | null;
  onCancel: () => void;
  onGranted: (token: string, reason: string) => void;
}> = ({ visible, meterKind, contractId, onCancel, onGranted }) => {
  const [passcode, setPasscode] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const label = meterKind === 'ELEC' ? 'điện' : 'nước';

  const reset = () => {
    setPasscode('');
    setReason('');
    setError('');
  };

  const submit = async () => {
    if (!passcode.trim()) return setError('Nhập mã admin cấp.');
    if (reason.trim().length < 10) {
      return setError('Ghi rõ lý do không chụp được ảnh (ít nhất 10 ký tự) — lý do này được lưu lại.');
    }
    setBusy(true);
    setError('');
    try {
      const res = await meterOverrideService.verify(passcode.trim(), contractId, meterKind);
      if (!res.valid || !res.overrideToken) {
        setError(res.message || 'Mã không đúng. Liên hệ admin để lấy mã.');
        return;
      }
      onGranted(res.overrideToken, reason.trim());
      reset();
    } catch (err: any) {
      // 403 sai mã · 429 khoá 5 phút sau 5 lần sai · 500 chưa cấu hình passcode ở server.
      setError(readApiError(err, 'Không xác thực được mã. Thử lại hoặc liên hệ admin.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <Text style={s.title}>🔑 Xin mã nhập chỉ số {label}</Text>
          <Text style={s.desc}>
            Chỉ dùng khi thật sự không chụp được ảnh đồng hồ. Liên hệ admin để lấy mã —
            mỗi lần dùng đều được ghi lại kèm lý do.
          </Text>

          <Text style={s.label}>Mã admin cấp</Text>
          <TextInput
            style={s.input}
            value={passcode}
            onChangeText={(v) => { setPasscode(v); setError(''); }}
            placeholder="Nhập mã"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="characters"
            secureTextEntry
            editable={!busy}
          />

          <Text style={s.label}>Lý do không chụp được ảnh</Text>
          <TextInput
            style={[s.input, s.reasonInput]}
            value={reason}
            onChangeText={(v) => { setReason(v); setError(''); }}
            placeholder="VD: Camera máy hỏng, đồng hồ nằm trong hộp khoá của chủ nhà..."
            placeholderTextColor={Colors.textMuted}
            multiline
            editable={!busy}
          />

          {!!error && <Text style={s.error}>{error}</Text>}

          <View style={s.actions}>
            <TouchableOpacity
              style={[s.btn, s.btnGhost]}
              onPress={() => { reset(); onCancel(); }}
              disabled={busy}
            >
              <Text style={s.btnGhostText}>Huỷ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, s.btnPrimary, busy && s.btnDisabled]}
              onPress={submit}
              disabled={busy}
            >
              {busy
                ? <ActivityIndicator color={Colors.white} size="small" />
                : <Text style={s.btnPrimaryText}>Xác nhận</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  sheet: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: 8,
  },
  title: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  desc: { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
  label: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.textPrimary,
    backgroundColor: Colors.white,
  },
  reasonInput: { minHeight: 72, textAlignVertical: 'top' },
  error: { fontSize: 12, color: '#DC2626', fontWeight: '600', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: Spacing.base },
  btn: { flex: 1, borderRadius: BorderRadius.md, paddingVertical: 12, alignItems: 'center' },
  btnGhost: { backgroundColor: Colors.background },
  btnGhostText: { fontSize: 14, fontWeight: '700', color: Colors.textSecondary },
  btnPrimary: { backgroundColor: Colors.primary },
  btnPrimaryText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  btnDisabled: { opacity: 0.6 },
});
