import React, { useState } from 'react';
import { Text, TouchableOpacity, StyleSheet, StyleProp, TextStyle } from 'react-native';
import { Colors } from '@/constants';
import { maskTenantPhone, maskTenantCccd } from '@/constants/managerVisibility';

/**
 * GIÁ TRỊ CHE — BẤM ĐỂ XEM ĐỦ (SĐT / CCCD khách thuê trên app manager, 24/09/2026).
 *
 * Mặc định hiện dạng che (`•••••••011`) để số không phơi sẵn trên màn hình (chụp/share
 * màn hình, người đứng cạnh). Bấm vào thì hiện đủ, bấm lần nữa che lại — giống nút con mắt
 * `MaskedField` bên web host/admin. Rỗng thì hiện chữ thay thế, không bấm được.
 *
 * ⚠️ Chỉ chống lộ thụ động, không phải phân quyền: dữ liệu đầy đủ vẫn nằm trong response.
 */
export const MaskedValue: React.FC<{
  value?: string | null;
  kind: 'phone' | 'cccd';
  style?: StyleProp<TextStyle>;
}> = ({ value, kind, style }) => {
  const [shown, setShown] = useState(false);
  const v = (value ?? '').trim();
  const masked = kind === 'phone' ? maskTenantPhone(v) : maskTenantCccd(v);

  if (!v) return <Text style={[style, s.empty]}>{masked}</Text>;

  return (
    <TouchableOpacity
      onPress={() => setShown(x => !x)}
      activeOpacity={0.6}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel={shown ? 'Ẩn bớt' : 'Bấm để xem đầy đủ'}
      style={s.wrap}
    >
      <Text style={[style, s.value]} selectable={shown}>{shown ? v : masked}</Text>
      <Text style={s.eye}>{shown ? '🙈' : '👁'}</Text>
    </TouchableOpacity>
  );
};

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  value: { letterSpacing: 0.5 },
  eye: { fontSize: 14, color: Colors.primary },
  empty: { color: Colors.textMuted },
});
