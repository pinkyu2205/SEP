/**
 * Logo Hoàng Bình Land — dùng file gốc `public/logo.png` (512×394, nền trong suốt).
 *
 * Trước đây chỗ này là hình SVG tôi dựng lại theo ảnh chụp; dựng bằng mắt nên sai tỉ lệ và
 * sai cả hình. Nay dùng thẳng file thật, không đoán nữa.
 *
 * File gốc là bản LOCKUP đầy đủ: biểu tượng ở trên (y 0..300) và dòng chữ
 * "HOANG BINH LAND" ở dưới (y ~315..394). Hai component dưới đây khác nhau ở chỗ có lấy
 * phần chữ hay không — nhét cả dòng chữ vào ô 36px trên sidebar thì chỉ còn một vệt mờ.
 */

/** Tỉ lệ phần biểu tượng trong ảnh gốc — đổi ảnh thì sửa đúng một chỗ này. */
const IMG_W = 512;
const IMG_H = 394;
const MARK_H = 300;

interface MarkProps {
  /** Cỡ cạnh ô chứa (px). Mặc định 32. */
  size?: number;
  /**
   * Đổ TRẮNG toàn bộ — dùng trên nền đậm hoặc ảnh nền, nơi logo hai màu bị chìm.
   * `brightness(0)` dìm mọi màu về đen rồi `invert(1)` lật thành trắng; giữ nguyên vùng
   * trong suốt nên không sinh ra khối vuông quanh logo.
   */
  mono?: boolean;
  className?: string;
}

/** Chỉ phần biểu tượng, cắt bỏ dòng chữ bên dưới. */
export const BrandMark = ({ size = 32, mono, className }: MarkProps) => (
  <div
    className={`flex items-center justify-center ${className ?? ''}`}
    style={{ width: size, height: size }}
  >
    {/*
      Cắt bằng background thay vì <img>: đặt ảnh rộng đúng bằng ô rồi để chiều cao ô ngắn
      hơn ảnh, phần chữ tự bị tràn ra ngoài và mất. Không cần cắt file thành hai ảnh rời
      rồi phải giữ đồng bộ mỗi lần đổi logo.
    */}
    <div
      role="img"
      aria-label="Hoàng Bình Land"
      style={{
        width: size,
        height: (size * MARK_H) / IMG_W,
        backgroundImage: 'url(/logo.png)',
        backgroundSize: '100% auto',
        backgroundPosition: 'top center',
        backgroundRepeat: 'no-repeat',
        filter: mono ? 'brightness(0) invert(1)' : undefined,
      }}
    />
  </div>
);

interface LockupProps {
  /** Chiều rộng (px). Cao tự suy theo tỉ lệ ảnh. */
  width?: number;
  mono?: boolean;
  className?: string;
}

/** Biểu tượng + dòng chữ, đúng như file gốc. Dùng khi có đủ bề ngang. */
export const BrandLockup = ({ width = 160, mono, className }: LockupProps) => (
  <img
    src="/logo.png"
    alt="Hoàng Bình Land"
    className={className}
    style={{
      width,
      height: (width * IMG_H) / IMG_W,
      filter: mono ? 'brightness(0) invert(1)' : undefined,
    }}
  />
);
