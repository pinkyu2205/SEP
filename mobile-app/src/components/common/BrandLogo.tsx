import React from 'react';
import { View, Image } from 'react-native';

/**
 * Logo Hoàng Bình Land — dùng file gốc `assets/logo.png` (512×394, nền trong suốt).
 *
 * File này trước là logo "ONION HOME" của bộ nhận diện cũ, sau đó có một giai đoạn ngắn
 * thay bằng hình SVG dựng lại theo ảnh chụp — dựng bằng mắt nên sai hình. Nay là file thật.
 *
 * Ảnh gốc là bản LOCKUP đầy đủ: biểu tượng ở trên (y 0..300) và dòng chữ
 * "HOANG BINH LAND" ở dưới (y ~315..394).
 */

const IMG_W = 512;
const IMG_H = 394;
const MARK_H = 300;

interface MarkProps {
  /** Chiều rộng (px). Mặc định 96. */
  size?: number;
}

/**
 * Chỉ phần biểu tượng, cắt bỏ dòng chữ.
 *
 * Cắt bằng khung `overflow: hidden` thấp hơn ảnh — không cần tách file thành hai ảnh rời
 * rồi phải nhớ thay cả hai mỗi lần đổi logo.
 */
export const BrandMark: React.FC<MarkProps> = ({ size = 96 }) => (
  <View style={{ width: size, height: (size * MARK_H) / IMG_W, overflow: 'hidden' }}>
    <Image
      source={require('../../../assets/logo.png')}
      style={{ width: size, height: (size * IMG_H) / IMG_W }}
      resizeMode="contain"
    />
  </View>
);

interface LockupProps {
  /** Chiều rộng (px). Cao tự suy theo tỉ lệ ảnh. */
  width?: number;
}

/** Biểu tượng + dòng chữ, đúng như file gốc. */
export const BrandLockup: React.FC<LockupProps> = ({ width = 220 }) => (
  <Image
    source={require('../../../assets/logo.png')}
    style={{ width, height: (width * IMG_H) / IMG_W }}
    resizeMode="contain"
  />
);
