import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { showAlert } from './showAlert';

/**
 * Chọn ảnh/video làm bằng chứng bảo trì (before / after / fault_evidence / self_repair —
 * KHÔNG áp dụng cho invoice, hoá đơn vẫn bắt buộc ảnh tĩnh cho OCR đọc hoá đơn, xem chỗ
 * gọi ở TicketDetailScreen). Yêu cầu mentor 14/09/2026: cho phép cả ảnh lẫn video trộn
 * chung 1 danh sách (không phải toggle chọn 1 trong 2 loại).
 *
 * KHÔNG dùng thư viện nén video native (expo-av/expo-video/react-native-video/
 * react-native-compressor...) — team đang tránh mọi thay đổi cần rebuild EAS sau chuỗi
 * build cloud lỗi liên tiếp gần đây. Toàn bộ "nén" video ở đây chỉ dựa vào option sẵn có
 * của expo-image-picker lúc chọn/quay (videoQuality, videoMaxDuration).
 */

/** Số ảnh/video tối đa cho 1 bộ bằng chứng — ảnh/video đã có trên server + vừa chọn local cộng lại. */
export const EVIDENCE_MAX_FILES = 5;

/** Video dài hơn mốc này (mili-giây) bị từ chối ngay lúc chọn/quay. */
export const EVIDENCE_MAX_VIDEO_DURATION_MS = 45_000;

export type EvidenceMediaType = 'image' | 'video';

export interface EvidenceAsset {
  uri: string;
  type: EvidenceMediaType;
  /** Chỉ có khi type==='video' (mili-giây) — ImagePicker.ImagePickerAsset.duration. */
  durationMs?: number;
}

/** Đuôi file video phổ biến — ảnh/video đã lên server chỉ còn lại URL (BE lưu chung 1
 * cột CSV chuỗi URL, không có cột đánh dấu loại file riêng), nên phải đoán qua đuôi. */
const VIDEO_EXT_RE = /\.(mp4|mov|m4v|webm|avi|3gp|3gpp|mkv)(\?|$)/i;

/** Nhận diện 1 URL đã upload có phải video hay không, dựa theo đuôi file trong URL. */
export const isVideoUrl = (url: string | undefined | null): boolean =>
  !!url && VIDEO_EXT_RE.test(url);

/** Số chỗ trống còn lại trong bộ bằng chứng (server + local cộng lại, tối đa EVIDENCE_MAX_FILES). */
export const remainingEvidenceSlots = (currentCount: number): number =>
  Math.max(0, EVIDENCE_MAX_FILES - currentCount);

/** "0:32" — dùng cho tile placeholder video local chưa upload (chưa có gì để phát thật). */
export const formatDurationLabel = (ms?: number | null): string => {
  if (!ms || ms <= 0) return '0:00';
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const toEvidenceAsset = (asset: ImagePicker.ImagePickerAsset): EvidenceAsset => ({
  uri: asset.uri,
  type: asset.type === 'video' ? 'video' : 'image',
  durationMs: asset.type === 'video' ? (asset.duration ?? undefined) : undefined,
});

/**
 * Chọn ảnh/video từ thư viện — cho lẫn cả 2 loại trong 1 lần chọn. `remaining` là số ô
 * còn trống (5 - số ảnh/video hiện có, server + local) — set thẳng vào `selectionLimit`
 * để hệ thống tự chặn chọn dư ngay trong UI thư viện.
 *
 * Video chọn từ thư viện KHÔNG bị `videoMaxDuration` chặn (option đó chỉ có tác dụng lúc
 * quay bằng camera) nên phải tự kiểm tra `asset.duration` sau khi chọn — video quá 45s
 * bị loại khỏi kết quả (không huỷ bỏ cả lượt chọn, các ảnh/video hợp lệ khác vẫn giữ).
 */
export async function pickEvidenceFromLibrary(remaining: number): Promise<EvidenceAsset[]> {
  if (remaining <= 0) {
    showAlert('Giới hạn', `Bạn chỉ có thể đính kèm tối đa ${EVIDENCE_MAX_FILES} ảnh/video.`);
    return [];
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: true,
    selectionLimit: remaining,
    quality: 0.6,
  });
  if (result.canceled) return [];

  const accepted: EvidenceAsset[] = [];
  let rejectedTooLong = 0;
  for (const asset of result.assets) {
    const media = toEvidenceAsset(asset);
    if (media.type === 'video' && (media.durationMs ?? 0) > EVIDENCE_MAX_VIDEO_DURATION_MS) {
      rejectedTooLong += 1;
      continue;
    }
    accepted.push(media);
  }
  if (rejectedTooLong > 0) {
    showAlert(
      'Video quá dài',
      rejectedTooLong === 1
        ? 'Video bạn chọn dài hơn 45 giây — vui lòng chọn video ngắn hơn hoặc cắt bớt trước khi gửi.'
        : `${rejectedTooLong} video bạn chọn dài hơn 45 giây — vui lòng chọn video ngắn hơn 45 giây.`,
    );
  }
  return accepted;
}

/**
 * Chụp ảnh HOẶC quay video bằng camera hệ thống — PHẢI truyền đúng `mode` cần dùng.
 *
 * 16/09/2026: trước đây truyền `mediaTypes: ['images', 'videos']` (cả 2 loại cùng lúc)
 * với kỳ vọng người dùng tự chọn ảnh/video ngay trong UI camera hệ thống — chỉ đúng trên
 * iOS. Trên Android, `launchCameraAsync` KHÔNG hỗ trợ trộn 2 loại: truyền cả 2 khiến máy
 * luôn mở thẳng camera CHỤP ẢNH, không có cách nào chuyển sang quay video (xác nhận qua
 * test thật trên Vivo — tenant bấm "chụp hình/quay video" chỉ chụp được ảnh). Phải tách
 * hẳn 2 nút "Chụp ảnh"/"Quay video" ở UI gọi hàm này với đúng 1 mediaTypes mỗi lần.
 *
 * Video quay giới hạn cứng 45s qua `videoMaxDuration`. Chất lượng video hạ xuống Medium
 * trên iOS để đỡ nặng dung lượng; Android không có tuỳ chọn chất lượng video trong
 * expo-image-picker (~17.0.11 — không có field nào tương đương `videoQuality` cho
 * Android), đành chấp nhận file gốc — KHÔNG thêm thư viện nén native để bù (xem ghi chú
 * đầu file).
 */
export async function pickEvidenceFromCamera(mode: EvidenceMediaType): Promise<EvidenceAsset | null> {
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: mode === 'video' ? ['videos'] : ['images'],
    quality: 0.6,
    videoMaxDuration: 45,
    videoQuality: Platform.OS === 'ios' ? ImagePicker.UIImagePickerControllerQualityType.Medium : undefined,
  });
  if (result.canceled || !result.assets[0]) return null;
  return toEvidenceAsset(result.assets[0]);
}
