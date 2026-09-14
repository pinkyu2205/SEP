import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Upload ảnh/video lên Cloudinary (unsigned preset), ảnh có nén trước để tiết kiệm dữ
 * liệu nhưng vẫn giữ chất lượng tốt. Dùng chung tài khoản Cloudinary với web.
 *
 * Cấu hình trong mobile-app/.env (Expo tự nạp biến EXPO_PUBLIC_*):
 *   EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME=<cloud name giống VITE_CLOUDINARY_CLOUD_NAME của web>
 *   EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET=<upload preset unsigned giống VITE_CLOUDINARY_UPLOAD_PRESET>
 *
 * LƯU Ý (14/09/2026, thêm bằng chứng video): preset unsigned trên phải cho phép
 * resource_type=video — nếu Cloudinary console giới hạn preset này chỉ nhận ảnh, upload
 * video sẽ lỗi 4xx dù code ở đây đúng. Kiểm tra preset trên Cloudinary console trước khi
 * bật tính năng quay video cho production.
 */
const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

/** Nén + resize ảnh (cap chiều rộng 1600px, chất lượng 0.6, JPEG). Chỉ áp dụng cho ảnh —
 * ImageManipulator không xử lý được video. */
async function compressImage(uri: string): Promise<string> {
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

/** Đoán đuôi + mime type video từ URI local (mặc định mp4 khi không nhận ra đuôi). */
function guessVideoFile(uri: string): { ext: string; mime: string } {
  const match = /\.([a-zA-Z0-9]+)(?:\?|#|$)/.exec(uri);
  const ext = (match?.[1] || 'mp4').toLowerCase();
  const MIME: Record<string, string> = {
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    m4v: 'video/x-m4v',
    webm: 'video/webm',
    avi: 'video/x-msvideo',
    '3gp': 'video/3gpp',
    mkv: 'video/x-matroska',
  };
  return { ext, mime: MIME[ext] || 'video/mp4' };
}

/**
 * Upload 1 ảnh HOẶC video local URI lên Cloudinary, trả về secure_url.
 *
 * Cloudinary cần ĐÚNG endpoint theo loại file (khác `resource_type: 'auto'` để chắc chắn
 * không bị đoán nhầm loại khi đường dẫn/tên file không có đuôi rõ ràng):
 *   - ảnh:  https://api.cloudinary.com/v1_1/<cloud>/image/upload
 *   - video: https://api.cloudinary.com/v1_1/<cloud>/video/upload
 *
 * Video KHÔNG được nén ở đây — kích thước đã được hạn chế từ lúc chọn/quay
 * (videoQuality lúc quay bằng camera, videoMaxDuration 45s, xem
 * src/utils/evidenceMediaPicker.ts) theo đúng chủ trương không thêm thư viện nén video
 * native (react-native-compressor...) để khỏi phải rebuild EAS (yêu cầu mentor 14/09/2026).
 */
export async function uploadMediaToCloudinary(
  uri: string,
  mediaType: 'image' | 'video' = 'image',
): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      'Thiếu cấu hình Cloudinary cho mobile (EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME / EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET trong .env).'
    );
  }

  const isVideo = mediaType === 'video';
  const uploadUri = isVideo ? uri : await compressImage(uri);
  const { ext, mime } = isVideo ? guessVideoFile(uri) : { ext: 'jpg', mime: 'image/jpeg' };
  const name = `upload_${Date.now()}.${ext}`;

  const formData = new FormData();
  if (Platform.OS === 'web') {
    // Web: phải gửi Blob/File thật, không gửi object { uri }
    const blob = await (await fetch(uploadUri)).blob();
    formData.append('file', blob, name);
  } else {
    // Native (Android/iOS): FormData file dạng { uri, name, type }
    formData.append('file', { uri: uploadUri, name, type: mime } as any);
  }
  formData.append('upload_preset', UPLOAD_PRESET);

  const endpoint = isVideo ? 'video/upload' : 'image/upload';
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${endpoint}`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Lỗi upload ${isVideo ? 'video' : 'ảnh'} lên Cloudinary`);
  }
  const data = await res.json();
  return data.secure_url as string;
}

/** Upload 1 ảnh local URI lên Cloudinary, trả về secure_url — tương đương
 * `uploadMediaToCloudinary(uri, 'image')`, giữ lại tên cũ cho các chỗ gọi hiện có. */
export async function uploadImageToCloudinary(uri: string): Promise<string> {
  return uploadMediaToCloudinary(uri, 'image');
}
