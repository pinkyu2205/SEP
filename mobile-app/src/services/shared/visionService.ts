import realApiClient from '@/services/core/realApiClient';

/**
 * Nhận diện VẬT THỂ trong ảnh — BE VisionController, POST /api/v1/vision/labels.
 *
 * Khác OCR (chỉ đọc chữ): endpoint này trả về danh sách nhãn tiếng Anh của những thứ
 * MÁY NHÌN THẤY trong ảnh ("air conditioner", "bed", "hand"...), nên kiểm được cả đồ
 * không in chữ như giường, tủ, bếp.
 *
 * Ràng buộc phía BE (VisionServiceImpl):
 *   • cả TENANT lẫn MANAGER gọi được (isAuthenticated)
 *   • chỉ nhận URL https thuộc Cloudinary của hệ thống → phải upload ảnh TRƯỚC rồi mới gọi
 *   • tối đa 20 ảnh/giờ/tài khoản, vượt thì ném lỗi kèm thông báo tiếng Việt
 */

export interface VisionLabel {
  /** Nhãn tiếng Anh, vd "air conditioner". */
  name: string;
  /** Độ tin cậy 0..1. */
  score: number;
}

/** Số ảnh tối đa BE nhận trong một lần mô tả (`vision.describe.max-images`, mặc định 8). */
export const DESCRIBE_ROOM_MAX_IMAGES = 8;

export interface RoomDescription {
  /** Đoạn mô tả tiếng Việt, dùng làm BẢN NHÁP cho người nhập sửa. */
  description: string;
  /** Model BE dùng, vd "gemini-2.0-flash". Chỉ để log/debug. */
  model?: string;
}

export const visionService = {
  detectLabels: async (imageUrl: string): Promise<VisionLabel[]> => {
    const { data } = await realApiClient.post<{ labels?: VisionLabel[] }>(
      '/api/v1/vision/labels',
      { imageUrl },
    );
    return data?.labels ?? [];
  },

  /**
   * Nhiều ảnh hiện trạng → MỘT đoạn mô tả (BE `POST /api/v1/vision/describe-room`,
   * commit BE 731acad ngày 13/08/2026).
   *
   * Khác `detectLabels`: gửi cả bộ ảnh trong một request để model viết một đoạn thống
   * nhất. Gọi từng ảnh rồi tự nối ở FE sẽ ra mấy câu rời rạc lặp ý và tốn quota gấp N lần.
   *
   * Ràng buộc BE:
   *   • MANAGER / ADMIN, 1–{@link DESCRIBE_ROOM_MAX_IMAGES} ảnh, URL https Cloudinary
   *     → phải upload TRƯỚC rồi mới gọi
   *   • quota riêng, không dùng chung với /labels (mặc định 40 request/giờ/tài khoản)
   *
   * Lỗi trả về 422 kèm `code`:
   *   • `VISION_DESCRIBE_QUOTA`       — hết lượt trong giờ
   *   • `VISION_DESCRIBE_UNAVAILABLE` — chưa cấu hình key / model lỗi / ảnh lỗi
   *
   * Cả hai đều là lỗi MỀM: người dùng gõ tay được, đừng chặn luồng đón khách.
   */
  describeRoom: async (imageUrls: string[]): Promise<RoomDescription | null> => {
    const urls = imageUrls.filter(Boolean).slice(0, DESCRIBE_ROOM_MAX_IMAGES);
    if (urls.length === 0) return null;
    const { data } = await realApiClient.post<RoomDescription>(
      '/api/v1/vision/describe-room',
      { imageUrls: urls },
    );
    return data?.description ? data : null;
  },
};
