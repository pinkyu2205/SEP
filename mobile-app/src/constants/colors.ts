/**
 * Color palette for the RoomRent application.
 * Sử dụng bảng màu hiện đại, tông xanh dương + tím nhẹ.
 */
export const Colors = {
  // Primary brand colors
  primary: '#4F46E5',       // Indigo-600
  primaryLight: '#818CF8',  // Indigo-400
  primaryDark: '#3730A3',   // Indigo-800
  primaryBg: '#EEF2FF',     // Indigo-50

  // Secondary / Accent
  accent: '#06B6D4',        // Cyan-500
  accentLight: '#67E8F9',   // Cyan-300
  accentDark: '#0E7490',    // Cyan-700

  // Semantic colors
  success: '#10B981',       // Emerald-500
  successLight: '#D1FAE5',  // Emerald-100
  warning: '#F59E0B',       // Amber-500
  warningLight: '#FEF3C7',  // Amber-100
  error: '#EF4444',         // Red-500
  errorLight: '#FEE2E2',    // Red-100
  info: '#3B82F6',          // Blue-500
  infoLight: '#DBEAFE',     // Blue-100

  // Neutrals
  white: '#FFFFFF',
  background: '#F8FAFC',    // Slate-50
  surface: '#FFFFFF',
  border: '#E2E8F0',        // Slate-200
  divider: '#F1F5F9',       // Slate-100
  textPrimary: '#0F172A',   // Slate-900
  textSecondary: '#64748B', // Slate-500
  textMuted: '#94A3B8',     // Slate-400
  textInverse: '#FFFFFF',

  // Overlay
  overlay: 'rgba(15, 23, 42, 0.5)',

  // Status-specific
  statusEmpty: '#10B981',       // Phòng trống - Green
  statusOccupied: '#3B82F6',    // Đang thuê - Blue
  statusMaintenance: '#F59E0B', // Bảo trì - Amber
} as const;

export type ColorKey = keyof typeof Colors;

/**
 * ─── Màu thương hiệu Hoàng Bình Land ────────────────────────────────────────
 * Lấy thẳng từ logo (`assets/logo.png`): chữ H đỏ và chữ B xanh lá ghép thành
 * hình toà nhà.
 *
 * Vì sao là bảng RIÊNG chứ không sửa `Colors.primary`: tông chàm đang được dùng
 * khắp app quản lý/khách thuê, đổi một chỗ đó là restyle mọi màn cùng lúc và
 * kéo theo hàng loạt cặp màu chữ-nền phải kiểm tra lại độ tương phản. Bảng này
 * áp cho những màn mang mặt thương hiệu ra ngoài trước (trang chủ khách vãng lai),
 * rồi lan dần.
 *
 * CÁCH DÙNG — đỏ và xanh lá cạnh nhau rất dễ thành màu Giáng sinh. Nguyên tắc:
 * xanh lá là màu chính (nút, liên kết, trạng thái còn trống), đỏ chỉ dùng cho
 * điểm nhấn hiếm (dấu thương hiệu, giá tiền, một nút hành động duy nhất mỗi màn),
 * và giữa hai màu luôn có khoảng trắng/xám.
 */
export const Brand = {
  red:       '#E3242B',
  redDark:   '#B31B21',
  redTint:   '#FEF2F2',

  green:     '#43B649',
  greenDark: '#2E8B33',
  greenTint: '#F0FAF0',

  /** Nền tối của khối đầu & khối liên hệ — đen ngả xanh lá, không phải xanh navy. */
  ink:       '#0C2114',
  inkTint:   'rgba(9, 28, 17, 0.80)',
} as const;
