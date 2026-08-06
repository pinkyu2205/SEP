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

export const visionService = {
  detectLabels: async (imageUrl: string): Promise<VisionLabel[]> => {
    const { data } = await realApiClient.post<{ labels?: VisionLabel[] }>(
      '/api/v1/vision/labels',
      { imageUrl },
    );
    return data?.labels ?? [];
  },
};
