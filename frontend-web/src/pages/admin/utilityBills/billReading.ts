/**
 * ĐỌC LẠI MỘT TỜ HOÁ ĐƠN — nút "Đọc lại" ở màn nhập .zip.
 *
 * Dịch vụ OCR trả về y hệt cho cùng một ảnh, nên gửi lại đúng ảnh cũ chỉ có ích khi lần
 * trước dịch vụ lỗi giữa chừng. Ở đây đọc thêm hai BẢN XỬ LÝ của chính ảnh đó — Cloudinary
 * biến đổi ngay trên URL, không phải tải lại gì:
 *   • ảnh xám + làm nét: chữ số trên nền xanh (ô "Mã khách hàng" của EVN) tách nền rõ hơn;
 *   • phóng to + làm nét: chữ nhỏ trong bảng chỉ số đủ điểm ảnh cho bộ đọc.
 * Ba kết quả được gộp lại (`mergeReadouts`) chứ không lấy đại bản cuối.
 *
 * Bản xử lý nào lỗi (tài khoản Cloudinary chặn biến đổi, ảnh vượt dung lượng dịch vụ OCR…)
 * thì bỏ qua — còn ít nhất một bản đọc được là đủ.
 */
import type { BillReadout, KindConfig } from './kinds';

const CLOUDINARY_IMAGE = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/;

/** Ép JPG: bản gốc là PNG thì phóng to xong dễ vượt 1MB — trần ảnh của dịch vụ OCR. */
const VARIANTS = [
  'e_grayscale/e_sharpen:100/f_jpg,q_auto:good',
  'c_scale,w_2000/e_sharpen:60/f_jpg,q_auto:eco',
];

export const imageVariants = (url: string): string[] => {
  const m = url.match(CLOUDINARY_IMAGE);
  return m ? [url, ...VARIANTS.map((t) => `${m[1]}${t}/${m[2]}`)] : [url];
};

/** Giá trị được nhiều bản đọc ra nhất; hoà thì lấy bản đứng trước (ảnh gốc). */
const vote = (values: string[]): string => {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  let best = '';
  let top = 0;
  counts.forEach((c, v) => { if (c > top) { top = c; best = v; } });
  return best;
};

/**
 * Gộp nhiều lần đọc của CÙNG một tờ giấy.
 *
 * Chỉ số cũ / mới / tiêu thụ đi thành MỘT BỘ, không bỏ phiếu từng ô: bộ ba đã tự khớp phép
 * trừ, ghép cũ của bản này với mới của bản kia là phá đúng cái bảo đảm đó. Mã khách hàng thì
 * gom hết ứng viên — `pickPaperCode` sẽ chọn ứng viên trùng hồ sơ nếu có bản nào đọc đúng.
 */
export const mergeReadouts = (rs: BillReadout[]): BillReadout => {
  const key = (r: BillReadout) => `${r.prev}|${r.next}|${r.qty}`;
  const withReadings = rs.filter((r) => r.prev !== '' && r.next !== '');
  const best = vote(withReadings.map(key));
  const chosen = withReadings.find((r) => key(r) === best);
  const qty = chosen?.qty ?? vote(rs.map((r) => r.qty));
  return {
    rawText: rs[0]?.rawText ?? '',
    codeCandidates: [...new Set(rs.flatMap((r) => r.codeCandidates))],
    qty,
    amount: vote(rs.map((r) => r.amount)),
    period: vote(rs.map((r) => r.period)),
    prev: chosen?.prev ?? '',
    next: chosen?.next ?? '',
    otherTotals: (chosen ?? rs.find((r) => r.qty === qty))?.otherTotals ?? [],
  };
};

export const rereadBill = async (cfg: KindConfig, imageUrl: string): Promise<BillReadout> => {
  const settled = await Promise.allSettled(imageVariants(imageUrl).map((u) => cfg.read(u)));
  const ok = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));
  if (ok.length === 0) throw (settled[0] as PromiseRejectedResult).reason;
  return mergeReadouts(ok);
};
