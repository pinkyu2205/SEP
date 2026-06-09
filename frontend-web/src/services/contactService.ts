// Service xử lý yêu cầu liên hệ / đặt lịch xem nhà từ Public Website.
//
// Hiện chỉ mô phỏng gửi thành công (mock). Khi có backend:
// thay phần thân bằng `api.post('/api/v1/public/contact', payload)`.

export interface ContactRequest {
  fullName: string;
  phone: string;
  email?: string;
  /** Bất động sản quan tâm (nếu gửi từ trang chi tiết) */
  propertyId?: string;
  propertyTitle?: string;
  message?: string;
  /** Ngày mong muốn xem nhà (ISO) nếu là đặt lịch */
  preferredDate?: string;
}

export interface ContactResult {
  success: boolean;
  message: string;
}

const delay = (ms = 600) => new Promise((resolve) => setTimeout(resolve, ms));

/** Gửi yêu cầu liên hệ tư vấn / đặt lịch xem nhà */
export async function submitContact(payload: ContactRequest): Promise<ContactResult> {
  await delay();

  // Validate cơ bản phía client (backend thật sẽ validate lại).
  if (!payload.fullName.trim() || !payload.phone.trim()) {
    return { success: false, message: 'Vui lòng nhập họ tên và số điện thoại.' };
  }

  // TODO: thay bằng API thật khi backend sẵn sàng.
  console.info('[contactService] Yêu cầu liên hệ đã được gửi (mock):', payload);

  return {
    success: true,
    message: 'Cảm ơn bạn! Hoàng Bình Land sẽ liên hệ lại trong thời gian sớm nhất.',
  };
}
