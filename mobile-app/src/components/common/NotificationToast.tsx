import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { toastBus, ToastNotice } from '@/store/toastBus';
import { navigateFromNotification } from '@/navigation/navigationRef';

/**
 * Băng thông báo trượt từ trên xuống khi có thông báo mới (mount 1 lần ở App.tsx).
 *
 * Nguồn là thông báo THẬT của BE (xem hooks/useNotificationToasts) và chỉ chạy ở nơi
 * không có push hệ thống — Expo Go và bản chạy web. Trên máy thật, banner của hệ điều
 * hành lo phần này nên băng thông báo không xuất hiện, tránh hiện 2 lần.
 * Bấm vào là mở thẳng màn tương ứng, giống hệt bấm push.
 */

const SHOW_MS = 6000;

/** Icon theo loại thông báo để nhìn phát biết việc gì. */
const iconOf = (type: string): string => {
  const t = (type || '').toUpperCase();
  if (t.includes('CHECKOUT')) return '🚪';
  if (t.includes('MAINTENANCE')) return '🔧';
  if (t.includes('OVERDUE')) return '🚨';
  if (['BILL', 'RENT', 'INVOICE', 'UTILITY', 'PAYMENT'].some(k => t.includes(k))) return '🧾';
  if (t.includes('CONTRACT') || t.includes('ASSIGN') || t.includes('ONBOARD')) return '🤝';
  return '🔔';
};

export const NotificationToast: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [queue, setQueue] = useState<ToastNotice[]>([]);
  const current = queue[0];
  const slide = useRef(new Animated.Value(-160)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => toastBus.subscribe(n => setQueue(q => [...q, n])), []);

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
    hide(() => navigateFromNotification({ type: current.type }));
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
        <View style={s.iconWrap}><Text style={s.icon}>{iconOf(current.type)}</Text></View>
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
