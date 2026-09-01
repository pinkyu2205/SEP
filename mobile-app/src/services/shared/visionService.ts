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

/**
 * Timeout RIÊNG cho describe-room — timeout chung 15s (`API_CONFIG.TIMEOUT`) là quá ngắn.
 *
 * BE tải TUẦN TỰ từng ảnh Cloudinary về máy chủ rồi mới base64 gửi model: 20s/ảnh là
 * trần của `ImageSource`, cộng thêm tối đa 30s cho Gemini. Với một ảnh thì 15s thường
 * đủ — nên luồng tự động sau khi thêm ảnh vẫn chạy được — nhưng nút "Tạo lại mô tả"
 * gửi CẢ BỘ ảnh nên gần như chắc chắn vượt 15s và ngã với `ECONNABORTED`. Đó đúng là
 * triệu chứng "thêm ảnh thì được, bấm nút thì lỗi".
 */
export const DESCRIBE_ROOM_TIMEOUT_MS = 60_000;

/**
 * BE chỉ nhận ảnh HTTPS thuộc `vision.allowed-image-hosts` (= `res.cloudinary.com`);
 * sai host hoặc sai giao thức là 422 "Chỉ chấp nhận ảnh đã upload lên hệ thống".
 *
 * Cần lọc ở FE vì danh sách ảnh của màn đón khách được nạp sẵn từ `roomConditionUrls`
 * của hợp đồng — dữ liệu cũ/seed có thể chứa URL không phải Cloudinary, và chỉ cần MỘT
 * URL hỏng là cả request chết, kể cả khi những ảnh còn lại đều hợp lệ.
 */
export const isVisionUsableUrl = (url: string): boolean =>
  /^https:\/\/res\.cloudinary\.com\//i.test(url || '');

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
    // Cắt từ CUỐI: khi vượt trần thì ảnh mới chụp mô tả hiện trạng sát thực tế hơn ảnh
    // đầu tiên. `.slice(0, n)` cũ giữ đúng mấy ảnh cũ nhất.
    const urls = imageUrls.filter(isVisionUsableUrl).slice(-DESCRIBE_ROOM_MAX_IMAGES);
    if (urls.length === 0) return null;
    const { data } = await realApiClient.post<RoomDescription>(
      '/api/v1/vision/describe-room',
      { imageUrls: urls },
      { timeout: DESCRIBE_ROOM_TIMEOUT_MS },
    );
    return data?.description ? data : null;
  },
};
