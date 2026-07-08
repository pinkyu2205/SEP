import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Upload ảnh lên Cloudinary (unsigned preset), có nén trước để tiết kiệm dữ liệu
 * nhưng vẫn giữ chất lượng tốt. Dùng chung tài khoản Cloudinary với web.
 *
 * Cấu hình trong mobile-app/.env (Expo tự nạp biến EXPO_PUBLIC_*):
 *   EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=<cloud name giống VITE_CLOUDINARY_CLOUD_NAME của web>
 *   EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET=<upload preset unsigned giống VITE_CLOUDINARY_UPLOAD_PRESET>
 */
const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

/** Nén + resize ảnh (cap chiều rộng 1600px, chất lượng 0.6, JPEG). */
async function compress(uri: string): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1600 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch {
    // Nén lỗi -> dùng ảnh gốc
    return uri;
  }
}

/** Upload 1 ảnh local URI lên Cloudinary, trả về secure_url. */
export async function uploadImageToCloudinary(uri: string): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      'Thiếu cấu hình Cloudinary cho mobile (EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME / EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET trong .env).'
    );
  }

  const compressedUri = await compress(uri);
  const name = `upload_${Date.now()}.jpg`;

  const formData = new FormData();
  if (Platform.OS === 'web') {
    // Web: phải gửi Blob/File thật, không gửi object { uri }
    const blob = await (await fetch(compressedUri)).blob();
    formData.append('file', blob, name);
  } else {
    // Native (Android/iOS): FormData file dạng { uri, name, type }
    formData.append('file', { uri: compressedUri, name, type: 'image/jpeg' } as any);
  }
  formData.append('upload_preset', UPLOAD_PRESET);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Lỗi upload ảnh lên Cloudinary');
  }
  const data = await res.json();
  return data.secure_url as string;
}
