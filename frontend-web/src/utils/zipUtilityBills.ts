/**
 * Đọc file .zip hoá đơn điện/nước NGAY TRÊN TRÌNH DUYỆT và đối chiếu với danh sách nhà.
 *
 * Cấu trúc mong đợi — mỗi nhà một folder, tên folder là TIỀN TỐ tên nhà:
 *
 *     hoa-don-thang-8.zip
 *     ├── MTX#124/           ← tên folder = mã nhà
 *     │   └── evn.jpg
 *     ├── MTX#125/
 *     │   └── scan.png
 *     └── MTX#01/
 *         └── hoa-don.jpg
 *
 * Bọc thêm bao nhiêu tầng cũng được — `hoadondien/thang8/MTX#125/anh.png` vẫn ra
 * "MTX#125". Xem `extractFolder`.
 *
 * ─── Vì sao khớp bằng TIỀN TỐ TÊN NHÀ ────────────────────────────────────────
 * Entity `Property` bên BE KHÔNG có cột mã nào — chỉ có `id` và `propertyName`. Bản
 * import ảnh khớp bằng mã hợp đồng lấy từ file Excel đi kèm, còn ở đây không có Excel.
 * Nên khoá khớp là token đầu của `propertyName` ("MTX#124 THEO_PHONG NT cơ bản" →
 * "MTX#124"), theo đúng quy ước đặt tên đang dùng.
 *
 * ⚠️ Đây là QUY ƯỚC, không phải ràng buộc dữ liệu: đổi tên nhà là folder cũ hết khớp,
 * và hai nhà lỡ trùng tiền tố thì không phân biệt được. Vì vậy hàm này KHÔNG tự import
 * — nó trả về bảng đối chiếu để người dùng nhìn trước, và báo riêng nhóm `ambiguous`.
 * Muốn chắc chắn thì BE thêm cột `propertyCode` unique rồi đổi `codeOfProperty` sang đọc
 * cột đó.
 */
import JSZip from 'jszip';
import type { PropertyResponse } from '@/types/api.types';

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

/**
 * Mã nhà dùng để khớp với tên folder.
 *
 * Ưu tiên `propertyCode` — cột unique BE thêm 01/09/2026, KHÔNG đổi khi ai đó sửa tên
 * nhà. Đây mới là khoá đáng tin.
 *
 * Vẫn giữ đường suy từ tên nhà làm dự phòng: BE sinh mã bằng đúng công thức này
 * (`PropertyCodeHelper.extractFromPropertyName` — token đầu, lower-case) nên hai bên ra
 * cùng kết quả, và bản ghi cũ chưa kịp backfill vẫn khớp được như trước.
 */
export const codeOfProperty = (p: PropertyResponse): string => {
  const code = (p.propertyCode || '').trim().toLowerCase();
  if (code) return code;
  return (p.propertyName || '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
};

/** File hoá đơn của một nhà, đã đọc ra `File` để upload tiếp. */
export interface ZipBillEntry {
  property: PropertyResponse;
  /** Tên folder trong zip, giữ nguyên hoa/thường để hiển thị lại cho đúng. */
  folder: string;
  /** Ảnh đầu tiên trong folder — dùng để OCR. */
  file: File;
  /** Số ảnh trong folder; >1 thì chỉ lấy ảnh đầu, phần còn lại là bản chụp thêm. */
  imageCount: number;
}

export interface ZipBillPreview {
  matched: ZipBillEntry[];
  /** Folder không khớp nhà nào — sẽ bị bỏ qua. */
  unknownFolders: { folder: string; imageCount: number }[];
  /** Folder khớp từ 2 nhà trở lên (trùng tiền tố) — KHÔNG import, phải sửa tên nhà. */
  ambiguous: { folder: string; propertyNames: string[] }[];
  /** Folder có tên đúng nhưng không chứa file ảnh nào. */
  emptyFolders: string[];
}

/**
 * Mã nhà = tên FOLDER CHỨA TRỰC TIẾP tấm ảnh, sâu bao nhiêu tầng cũng được.
 *
 * ─── Vì sao không đếm số tầng ────────────────────────────────────────────────
 * Bản đầu bắt đúng 2 hoặc 3 tầng, bê nguyên luật của `zipImageInspect` — nhưng bản
 * đó phải khớp với `PropertyImageZipParser` chạy ở BE. Import này giải nén HOÀN TOÀN
 * trên trình duyệt, không có parser nào bên kia để khớp, nên ràng buộc đó là tự trói.
 *
 * Hậu quả thật: cây thư mục `hoadondien/thang8/MTX#125/anh.png` — người dùng bấm nén
 * ở thư mục ngoài cùng là ra 4 tầng, cả file zip bị bỏ qua sạch mà không hiểu vì sao.
 * Nén ở đâu là thói quen của từng người, không nên là điều kiện để phần mềm chạy.
 *
 * Lấy folder cha của file ảnh thì mọi cách nén đều ra cùng một kết quả. Ảnh nằm ngay
 * gốc zip (không có folder cha) thì vẫn trả null — không có mã nào để khớp.
 */
const extractFolder = (path: string): string | null => {
  const parts = path.split('/').filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : null;
};

const shouldIgnore = (path: string): boolean => {
  const lower = path.toLowerCase();
  if (lower.startsWith('__macosx/') || lower.includes('/__macosx/')) return true;
  const name = lower.slice(lower.lastIndexOf('/') + 1);
  return name === '.ds_store' || name === 'thumbs.db' || name === 'desktop.ini' || name.startsWith('._');
};

export async function inspectZipBills(
  zipFile: File,
  properties: PropertyResponse[],
): Promise<ZipBillPreview> {
  const zip = await JSZip.loadAsync(zipFile);

  // folder (giữ nguyên hoa/thường) → danh sách entry ảnh, sắp theo tên để "ảnh đầu
  // tiên" là một lựa chọn ỔN ĐỊNH chứ không phụ thuộc thứ tự nén.
  const byFolder = new Map<string, { name: string; entry: JSZip.JSZipObject }[]>();

  zip.forEach((relPath, entry) => {
    if (entry.dir) return;
    const path = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (shouldIgnore(path)) return;
    const folder = extractFolder(path);
    if (!folder) return;
    const bucket = byFolder.get(folder) ?? [];
    if (!byFolder.has(folder)) byFolder.set(folder, bucket);
    if (IMAGE_EXT.test(path)) bucket.push({ name: path, entry });
  });

  // Tiền tố nhà → các nhà mang tiền tố đó (thường 1, >1 là trùng).
  const byCode = new Map<string, PropertyResponse[]>();
  for (const p of properties) {
    const code = codeOfProperty(p);
    if (!code) continue;
    const list = byCode.get(code) ?? [];
    if (!byCode.has(code)) byCode.set(code, list);
    list.push(p);
  }

  const matched: ZipBillEntry[] = [];
  const unknownFolders: ZipBillPreview['unknownFolders'] = [];
  const ambiguous: ZipBillPreview['ambiguous'] = [];
  const emptyFolders: string[] = [];

  for (const [folder, images] of byFolder) {
    const hits = byCode.get(folder.trim().toLowerCase());
    if (!hits || hits.length === 0) {
      unknownFolders.push({ folder, imageCount: images.length });
      continue;
    }
    if (hits.length > 1) {
      ambiguous.push({ folder, propertyNames: hits.map((p) => p.propertyName) });
      continue;
    }
    if (images.length === 0) {
      emptyFolders.push(folder);
      continue;
    }
    images.sort((a, b) => a.name.localeCompare(b.name));
    const first = images[0];
    const blob = await first.entry.async('blob');
    const fileName = first.name.slice(first.name.lastIndexOf('/') + 1);
    matched.push({
      property: hits[0],
      folder,
      file: new File([blob], fileName, { type: blob.type || 'image/jpeg' }),
      imageCount: images.length,
    });
  }

  // Nhà nào lên trước cho dễ dò: theo đúng thứ tự tên.
  matched.sort((a, b) => a.property.propertyName.localeCompare(b.property.propertyName, 'vi'));
  return { matched, unknownFolders, ambiguous, emptyFolders };
}
