/**
 * Báo sidebar Admin đếm lại badge ngay, không đợi lượt hỏi định kỳ.
 *
 * Gọi sau khi admin xử xong một việc có đếm trên menu (duyệt đơn gia hạn, kết luận khiếu
 * nại, cấp mã đồng hồ…) — để số trên menu giảm ngay lúc bấm, không lệch với trang đang xem.
 */
export const ADMIN_BADGES_EVENT = 'hbl:admin-badges-refresh';

export const refreshAdminBadges = () => {
  window.dispatchEvent(new Event(ADMIN_BADGES_EVENT));
};
