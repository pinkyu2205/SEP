import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { localAlertStore, LocalAlert } from '@/store/localAlertStore';
import { navigateFromNotification } from '@/navigation/navigationRef';

/**
 * Băng thông báo trượt từ trên xuống khi đối phương vừa thao tác (mount 1 lần ở App.tsx).
 *
 * Vì sao cần thêm cái này dù đã bắn thông báo lên thanh thông báo của máy:
 *   • Người dùng ĐANG mở app thì banner hệ thống dễ bị bỏ qua/không hiện.
 *   • Expo Go (SDK 53+) và bản chạy thử trên web KHÔNG có push — banner này là kênh
 *     duy nhất thấy được ngay, nên demo vẫn chạy đúng.
 * Bấm vào là mở thẳng hồ sơ tương ứng, giống hệt bấm push.
 */

const SHOW_MS = 6000;

export const NotificationToast: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [queue, setQueue] = useState<LocalAlert[]>([]);
  const current = queue[0];
  const slide = useRef(new Animated.Value(-160)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nhận thông báo mới từ kho (chỉ cái vừa tới, không phải mỗi lần đánh dấu đã đọc).
  useEffect(() => localAlertStore.subscribeIncoming(a => setQueue(q => [...q, a])), []);

  const hide = useCallback((then?: () => void) => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    Animated.timing(slide, { toValue: -160, duration: 200, useNativeDriver: true }).start(() => {
      setQueue(q => q.slice(1));
      then?.();
    });
  }, [slide]);

  useEffect(() => {
    if (!current) return;
    slide.setValue(-160);
    Animated.spring(slide, { toValue: 0, useNativeDriver: true, friction: 9, tension: 60 }).start();
    timerRef.current = setTimeout(() => hide(), SHOW_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [current?.id, hide, slide]);

  if (!current) return null;

  const open = () => {
    localAlertStore.markRead(current.id);
    hide(() => navigateFromNotification({
      screen: current.screen, params: current.params, type: 'checkout_request',
    }));
  };

  return (
    <Animated.View
      style={[
        s.wrap,
        { top: insets.top + Spacing.sm, transform: [{ translateY: slide }] },
      ]}
      pointerEvents="box-none"
    >
      <TouchableOpacity style={s.card} activeOpacity={0.9} onPress={open}>
        <View style={s.iconWrap}><Text style={s.icon}>🚪</Text></View>
        <View style={s.body}>
          <Text style={s.title} numberOfLines={1}>{current.title}</Text>
          <Text style={s.text} numberOfLines={2}>{current.body}</Text>
          <Text style={s.cta}>Chạm để xem →</Text>
        </View>
        <TouchableOpacity style={s.closeBtn} onPress={() => hide()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.closeText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const s = StyleSheet.create({
  wrap: {
    position: 'absolute', left: Spacing.md, right: Spacing.md,
    // Phải nổi trên mọi màn (kể cả tab bar/floating button) nhưng dưới Modal của AlertHost.
    zIndex: 9999, ...Platform.select({ android: { elevation: 12 }, default: {} }),
  },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base, ...Shadow.lg,
  },
  iconWrap: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  icon: { fontSize: 18 },
  body: { flex: 1 },
  title: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  text: { fontSize: 12.5, color: Colors.textSecondary, lineHeight: 18, marginTop: 2 },
  cta: { fontSize: 11.5, fontWeight: '700', color: Colors.primary, marginTop: 6 },
  closeBtn: { paddingHorizontal: 4, paddingTop: 2 },
  closeText: { fontSize: 14, color: Colors.textMuted, fontWeight: '700' },
});
