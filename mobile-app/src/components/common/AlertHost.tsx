import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { registerAlertHost, type AlertRequest, type AlertButton } from '@/utils/showAlert';
import { Icon, type IconName } from './Icon';

/**
 * Nơi hiển thị mọi thông báo của app. Mount MỘT lần ở App.tsx.
 *
 * Vì sao cần: Alert.alert của react-native-web là no-op, còn window.alert/confirm thì
 * kèm dòng "localhost:8081 cho biết" và không theo giao diện app. Owner này nhận yêu cầu
 * từ showAlert() (hàm thường, gọi được ở mọi nơi kể cả ngoài component) rồi render
 * popup React — dùng chung một kiểu trên cả web lẫn native.
 *
 * Nhiều thông báo bắn liên tiếp thì xếp hàng, không đè mất cái trước.
 */

type Tone = 'info' | 'success' | 'warning' | 'danger';

const TONE: Record<Tone, { fg: string; bg: string }> = {
  info:    { fg: Colors.primary, bg: Colors.primaryBg },
  success: { fg: Colors.success, bg: Colors.successLight },
  warning: { fg: Colors.warning, bg: Colors.warningLight },
  danger:  { fg: Colors.error,   bg: Colors.errorLight },
};

/** Icon do nơi gọi chỉ định thì tông màu suy từ chính icon đó. */
const TONE_OF_ICON: Partial<Record<IconName, Tone>> = {
  success: 'success', error: 'danger', alert: 'danger', ban: 'danger',
  warning: 'warning', lock: 'warning', 'image-off': 'warning',
};

/** Đoán icon theo tiêu đề để không phải sửa hàng trăm lời gọi showAlert cũ. */
const guessIcon = (title: string, danger: boolean): { name: IconName; tone: Tone } => {
  const t = title.toLowerCase();
  if (/lỗi|thất bại|không /.test(t)) return { name: 'alert', tone: 'danger' };
  if (/thành công|đã gửi|đã lưu|hoàn tất|đã duyệt|đã thu|đã xác nhận/.test(t)) return { name: 'success', tone: 'success' };
  if (/thiếu|chưa |không hợp lệ|yếu|không khớp/.test(t)) return { name: 'warning', tone: 'warning' };
  if (/đăng xuất/.test(t)) return { name: 'logout', tone: 'danger' };
  if (/xoá|xóa/.test(t)) return { name: 'trash', tone: 'danger' };
  if (/huỷ|hủy|thanh lý|chấm dứt/.test(t)) return { name: 'alert', tone: 'danger' };
  return danger ? { name: 'warning', tone: 'danger' } : { name: 'info', tone: 'info' };
};

export const AlertHost: React.FC = () => {
  const [queue, setQueue] = useState<AlertRequest[]>([]);
  const current = queue[0];

  useEffect(() => registerAlertHost(req => setQueue(q => [...q, req])), []);

  const dismiss = useCallback((btn?: AlertButton) => {
    setQueue(q => q.slice(1));
    // Chạy callback sau khi popup đóng để tránh setState chồng lên nhau.
    setTimeout(() => btn?.onPress?.(), 0);
  }, []);

  if (!current) return null;

  const buttons: AlertButton[] = current.buttons?.length
    ? current.buttons
    : [{ text: 'OK' }];
  const cancelBtn = buttons.find(b => b.style === 'cancel');
  const hasDanger = buttons.some(b => b.style === 'destructive');
  const icon = current.icon
    ? { name: current.icon, tone: hasDanger ? 'danger' as const : TONE_OF_ICON[current.icon] ?? 'info' }
    : guessIcon(current.title, hasDanger);
  const tone = TONE[icon.tone];
  // >2 nút thì xếp dọc cho đỡ chật.
  const stacked = buttons.length > 2;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => dismiss(cancelBtn ?? buttons[0])}>
      <TouchableOpacity
        style={s.backdrop}
        activeOpacity={1}
        // Bấm nền chỉ đóng khi có nút huỷ rõ ràng — thông báo 1 nút thì bắt bấm OK
        // để chắc chắn người dùng đã đọc.
        onPress={cancelBtn ? () => dismiss(cancelBtn) : undefined}
      >
        <TouchableOpacity style={s.box} activeOpacity={1}>
          <View style={[s.iconWrap, { backgroundColor: tone.bg }]}>
            <Icon name={icon.name} size={26} color={tone.fg} />
          </View>

          <Text style={s.title}>{current.title}</Text>
          {!!current.message && <Text style={s.message}>{current.message}</Text>}

          <View style={[s.actions, stacked && s.actionsStacked]}>
            {buttons.map((b, i) => {
              const isCancel = b.style === 'cancel';
              const isDanger = b.style === 'destructive';
              return (
                <TouchableOpacity
                  key={`${b.text}-${i}`}
                  style={[
                    s.btn,
                    isCancel ? s.btnCancel : isDanger ? s.btnDanger : s.btnPrimary,
                    stacked && s.btnStacked,
                  ]}
                  onPress={() => dismiss(b)}
                >
                  <Text style={[s.btnText, isCancel && s.btnTextCancel]}>{b.text ?? 'OK'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

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
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
  },
  title:   { fontSize: 17, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  message: { fontSize: 13.5, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: 6 },

  actions:        { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg, width: '100%' },
  actionsStacked: { flexDirection: 'column-reverse' },
  btn: {
    flex: 1, borderRadius: BorderRadius.lg, paddingVertical: Spacing.md,
    alignItems: 'center', justifyContent: 'center', minHeight: 46,
  },
  btnStacked:   { flex: 0, width: '100%' },
  btnPrimary:   { backgroundColor: Colors.primary },
  btnDanger:    { backgroundColor: Colors.error },
  btnCancel:    { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  btnText:      { fontSize: 14, fontWeight: '800', color: Colors.white },
  btnTextCancel:{ color: Colors.textSecondary, fontWeight: '700' },
});
