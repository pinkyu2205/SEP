import React, { useState } from 'react';
import {
  ActivityIndicator, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { BorderRadius, Colors, Spacing } from '@/constants';
import { readApiError } from '@/utils';
import {
  meterOverrideService, type MeterOverrideKind, type MeterOverridePurpose,
} from '@/services/manager/meterOverrideService';

/**
 * Trạng thái yêu cầu xin mã gửi qua app.
 *   unsupported = BE chưa có endpoint (404) → quay về gọi điện như cũ.
 */
type RequestState = 'idle' | 'sending' | 'sent' | 'unsupported' | 'failed';

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
 *
 * Từ 24/09/2026 có thêm nút "Gửi yêu cầu cho admin": gửi lý do + loại đồng hồ + nhà/phòng
 * lên web để admin biết AI xin, cho CÁI GÌ. Mã vẫn do admin đọc qua điện thoại (hoặc
 * nhắn) — app không bao giờ tự nhận mã.
 */
export const MeterOverrideModal: React.FC<{
  visible: boolean;
  meterKind: MeterOverrideKind;
  /** null khi hợp đồng chưa được tạo (đang ở giữa luồng đón khách). */
  contractId: number | null;
  /** Xin mã ở màn nào — gửi kèm yêu cầu để admin đánh giá. */
  purpose: MeterOverridePurpose;
  propertyId?: number | null;
  roomId?: number | null;
  /** Dòng mô tả hiện trong hộp, VD "Nhà ABC · Phòng 301". */
  contextLabel?: string;
  onCancel: () => void;
  onGranted: (token: string, reason: string) => void;
}> = ({
  visible, meterKind, contractId, purpose, propertyId, roomId, contextLabel, onCancel, onGranted,
}) => {
  const [passcode, setPasscode] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [requestState, setRequestState] = useState<RequestState>('idle');

  const label = meterKind === 'ELEC' ? 'điện' : 'nước';

  const reset = () => {
    setPasscode('');
    setReason('');
    setError('');
    setRequestState('idle');
  };

  const sendRequest = async () => {
    if (reason.trim().length < 10) {
      return setError('Ghi lý do trước (ít nhất 10 ký tự) — admin đọc lý do này để quyết định cấp mã.');
    }
    setError('');
    setRequestState('sending');
    try {
      await meterOverrideService.requestPasscode({
        meterKind, purpose, contractId,
        propertyId: propertyId ?? null,
        roomId: roomId ?? null,
        reason,
      });
      setRequestState('sent');
    } catch (err: any) {
      setRequestState(err?.response?.status === 404 ? 'unsupported' : 'failed');
    }
  };

  const submit = async () => {
    if (passcode.trim().length !== 6) return setError('Mã gồm 6 chữ số admin vừa đọc cho bạn.');
    if (reason.trim().length < 10) {
      return setError('Ghi rõ lý do không chụp được ảnh (ít nhất 10 ký tự) — lý do này được lưu lại.');
    }
    setBusy(true);
    setError('');
    try {
      const res = await meterOverrideService.verify(passcode.trim(), contractId, meterKind);
      if (!res.valid || !res.overrideToken) {
        setError(res.message || 'Mã không đúng hoặc đã hết hạn. Nhờ admin tạo mã mới.');
        return;
      }
      onGranted(res.overrideToken, reason.trim());
      reset();
    } catch (err: any) {
      // 403 mã sai/hết hạn/đã dùng · 429 khoá 5 phút sau 5 lần sai.
      // Mã chỉ sống ~10 phút và chết ngay khi dùng, nên lỗi ở đây thường là "xin mã mới",
      // chứ không phải "gõ lại cho đúng" — câu chữ phải nói thẳng điều đó.
      setError(readApiError(err, 'Không xác thực được mã. Nhờ admin tạo mã mới rồi thử lại.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <Text style={s.title}>🔑 Xin mã nhập chỉ số {label}</Text>
          {!!contextLabel && <Text style={s.context}>{contextLabel}</Text>}
          <Text style={s.desc}>
            Chỉ dùng khi thật sự không chụp được ảnh đồng hồ. Ghi lý do, gửi yêu cầu cho
            admin rồi nhập mã 6 số admin đọc cho bạn — mã sống khoảng 10 phút, dùng một
            lần là hết, lần dùng nào cũng được ghi lại.
          </Text>

          <Text style={s.label}>Lý do không chụp được ảnh</Text>
          <TextInput
            style={[s.input, s.reasonInput]}
            value={reason}
            onChangeText={(v) => {
              setReason(v);
              setError('');
              // Sửa lý do sau khi đã gửi thì admin đang xem bản cũ — cho gửi lại.
              if (requestState === 'sent' || requestState === 'failed') setRequestState('idle');
            }}
            placeholder="VD: Camera máy hỏng, đồng hồ nằm trong hộp khoá của chủ nhà..."
            placeholderTextColor={Colors.textMuted}
            multiline
            editable={!busy && requestState !== 'sending'}
          />

          {/* Bước 1 — báo admin. Không bắt buộc: admin tự gọi tới / BE chưa hỗ trợ thì
              vẫn nhập mã được bình thường. */}
          {requestState === 'sent' ? (
            <View style={[s.notice, s.noticeOk]}>
              <Text style={s.noticeOkText}>
                ✅ Đã gửi yêu cầu. Admin sẽ thấy ai xin mã {label}, ở đâu và vì sao — chờ admin
                đọc mã, hoặc gọi admin nếu gấp.
              </Text>
            </View>
          ) : requestState === 'unsupported' ? (
            <View style={[s.notice, s.noticeWarn]}>
              <Text style={s.noticeWarnText}>
                Hệ thống chưa nhận yêu cầu qua app. Gọi điện cho admin để xin mã như trước.
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[s.requestBtn, requestState === 'sending' && s.btnDisabled]}
              onPress={sendRequest}
              disabled={requestState === 'sending' || busy}
            >
              {requestState === 'sending'
                ? <ActivityIndicator color={Colors.primary} size="small" />
                : <Text style={s.requestBtnText}>
                    📨 {requestState === 'failed' ? 'Gửi lại yêu cầu cho admin' : 'Gửi yêu cầu xin mã cho admin'}
                  </Text>}
            </TouchableOpacity>
          )}
          {requestState === 'failed' && (
            <Text style={s.error}>Không gửi được yêu cầu. Thử lại, hoặc gọi admin trực tiếp.</Text>
          )}

          <Text style={s.label}>Mã 6 số admin vừa cấp</Text>
          {/*
            Mã do admin bấm tạo rồi ĐỌC QUA ĐIỆN THOẠI (BE 10/08/2026, commit b3be95c).
            Vì vậy ô này cố tình KHÔNG che ký tự: nghe qua điện thoại vốn đã dễ nhầm
            0/không, 5/năm — che thêm thì gõ sai không biết sai ở đâu. Bàn phím số và
            giới hạn 6 ký tự để không gõ thừa.
          */}
          <TextInput
            style={[s.input, s.codeInput]}
            value={passcode}
            onChangeText={(v) => { setPasscode(v.replace(/[^\d]/g, '')); setError(''); }}
            placeholder="000000"
            placeholderTextColor={Colors.textMuted}
            keyboardType="number-pad"
            maxLength={6}
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
  context: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  requestBtn: {
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryBg,
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  requestBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  notice: { borderRadius: BorderRadius.md, padding: 10, marginTop: 4 },
  noticeOk: { backgroundColor: Colors.successLight },
  noticeOkText: { fontSize: 12, color: '#065F46', fontWeight: '600' },
  noticeWarn: { backgroundColor: Colors.warningLight },
  noticeWarnText: { fontSize: 12, color: '#92400E', fontWeight: '600' },
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
  /** Mã đọc qua điện thoại — chữ to, giãn ký tự để soát lại từng số cho nhanh. */
  codeInput: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 6,
    textAlign: 'center',
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
