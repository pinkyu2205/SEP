import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius } from '@/constants';

/**
 * Chỉ báo màn hình đang cập nhật bằng lớp nào (xem `useBillingRealtime`).
 *
 * Có mặt vì lần trước realtime chết mà KHÔNG ai biết: bên web nginx không chuyển tiếp
 * header `Upgrade` nên WebSocket chưa từng nối được, client thì lặng lẽ thử lại mỗi 5
 * giây, người dùng chỉ thấy "trạng thái không nhảy, phải thoát ra vào lại". Trên máy
 * thật còn thêm mấy đường đứt riêng (đổi Wi-Fi ↔ 4G, IP LAN của BE đổi, máy ngủ).
 * Nay nói thẳng đang ở lớp nào:
 *   • Trực tiếp  — WebSocket đang nối, khách trả tiền là đổi ngay.
 *   • Tự làm mới — WS chưa nối được, màn đang tự hỏi lại mỗi 20 giây (vẫn đúng, chỉ chậm hơn).
 */
export const RealtimeBadge: React.FC<{ connected: boolean }> = ({ connected }) => (
  <View style={[s.wrap, connected ? s.onWrap : s.offWrap]}>
    <View style={[s.dot, { backgroundColor: connected ? Colors.success : Colors.textMuted }]} />
    <Text style={[s.text, { color: connected ? Colors.success : Colors.textMuted }]}>
      {connected ? 'Trực tiếp' : 'Tự làm mới'}
    </Text>
  </View>
);

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  onWrap:  { backgroundColor: '#ECFDF5' },
  offWrap: { backgroundColor: '#F1F5F9' },
  dot:  { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
});
