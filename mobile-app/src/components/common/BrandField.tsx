import React, { useState } from 'react';
import {
  View, Text, TextInput, TextInputProps, StyleSheet, StyleProp, TextStyle,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors, Brand, Spacing, BorderRadius } from '@/constants';

/**
 * Ô NHẬP MANG MÀU THƯƠNG HIỆU — dùng cho các màn xác thực (đăng nhập, kích hoạt, quên MK).
 *
 * Khác `Input` dùng chung ở hai điểm, và cả hai đều là lý do nó tồn tại:
 *
 * 1. **Màu.** `Input` hard-code `Colors.primary` (chàm #4F46E5) cho mọi điểm nhấn. Chàm
 *    không có trong logo Hoàng Bình Land, nên đúng những màn mang mặt thương hiệu ra
 *    ngoài lại là những màn lạc tông nhất. Ở đây dùng bảng `Brand`.
 *
 * 2. **Trạng thái đang gõ.** `Input` không có: viền xám lúc rảnh, xám lúc đang gõ, chỉ đổi
 *    khi lỗi. Form đăng nhập/kích hoạt là nơi người dùng nhảy qua lại giữa các ô nhiều
 *    nhất, mất dấu con trỏ là gõ nhầm ô.
 *
 * Tự giữ state focus thay vì để màn cha quản: cha không cần biết ô nào đang gõ, mà nhấc
 * lên đó thì mỗi ký tự gõ vào là cả màn render lại.
 */

export interface BrandFieldProps extends TextInputProps {
  label?: string;
  icon?: React.ComponentProps<typeof MaterialIcons>['name'];
  /** Có lỗi thì viền + biểu tượng chuyển đỏ và câu lỗi hiện dưới ô. */
  error?: string;
  /** Câu hướng dẫn hiện khi KHÔNG có lỗi — lỗi luôn được ưu tiên, không hiện chồng. */
  hint?: string;
  /** Nút bên phải trong ô: hiện/ẩn mật khẩu, xoá nhanh... */
  right?: React.ReactNode;
  inputStyle?: StyleProp<TextStyle>;
}

export const BrandField: React.FC<BrandFieldProps> = ({
  label, icon, error, hint, right, inputStyle, ...rest
}) => {
  const [focused, setFocused] = useState(false);
  const tone = error ? Brand.red : focused ? Brand.green : Colors.border;
  const iconTone = error ? Brand.red : focused ? Brand.greenDark : Colors.textMuted;

  return (
    <View style={s.field}>
      {!!label && <Text style={s.label}>{label}</Text>}
      <View style={[s.box, { borderColor: tone }, focused && !error && s.boxFocused]}>
        {!!icon && <MaterialIcons name={icon} size={20} color={iconTone} />}
        <TextInput
          style={[s.input, inputStyle]}
          placeholderTextColor={Colors.textMuted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
        {right}
      </View>
      {error ? <Text style={s.error}>{error}</Text> : !!hint && <Text style={s.hint}>{hint}</Text>}
    </View>
  );
};

const s = StyleSheet.create({
  field: { marginBottom: Spacing.base },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 52,
    paddingHorizontal: Spacing.base,
    borderWidth: 1.5,
    borderRadius: BorderRadius.lg,
    backgroundColor: '#F7F9F7',
  },
  boxFocused: { backgroundColor: Brand.greenTint },
  input: {
    flex: 1,
    paddingVertical: Spacing.md,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  error: { marginTop: 6, fontSize: 12, color: Brand.red, fontWeight: '600' },
  hint: { marginTop: 6, fontSize: 12, color: Colors.textSecondary },
});
