// Đọc file .zip ảnh NGAY TRÊN TRÌNH DUYỆT để kiểm tra trước khi nhập dữ liệu.
// Đối chiếu tên folder con (mã hợp đồng) với danh sách mã trong file Excel.
// Logic tách mã / lọc file mirror đúng BE PropertyImageZipParser để khớp kết quả thật.

import JSZip from 'jszip';

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

export interface ZipImagePreview {
  /** Folder con khớp 1 mã hợp đồng trong Excel — sẽ được gắn ảnh. */
  matched: { code: string; count: number }[];
  /** Folder con KHÔNG khớp mã nào trong Excel — sẽ bị bỏ qua. */
  extra: { code: string; count: number }[];
  /** Mã hợp đồng trong Excel nhưng KHÔNG có folder ảnh. */
  missingCodes: string[];
  /** Tổng ảnh sẽ gắn (chỉ tính folder khớp). */
  totalImages: number;
}

/** {code}/img → code ; {wrap}/{code}/img → code ; sâu hơn → null (mirror BE). */
function extractCode(path: string): string | null {
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 2) return parts[0];
  if (parts.length === 3) return parts[1];
  return null;
}

function shouldIgnore(path: string): boolean {
  const lower = path.toLowerCase();
  if (lower.startsWith('__macosx/') || lower.includes('/__macosx/')) return true;
  const name = lower.slice(lower.lastIndexOf('/') + 1);
  return name === '.ds_store' || name === 'thumbs.db' || name === 'desktop.ini' || name.startsWith('._');
}

export async function inspectZipImages(file: File, excelCodes: string[]): Promise<ZipImagePreview> {
  const zip = await JSZip.loadAsync(file);
  const counts = new Map<string, number>(); // mã (giữ nguyên hoa/thường) → số ảnh

  zip.forEach((relPath, entry) => {
    if (entry.dir) return;
    const path = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (shouldIgnore(path) || !IMAGE_EXT.test(path)) return;
    const code = extractCode(path);
    if (!code) return;
    const key = code.trim();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  // Map mã Excel: lowercase → bản gốc, để khớp không phân biệt hoa/thường (giống BE).
  const excelByLower = new Map(excelCodes.map((c) => [c.trim().toLowerCase(), c.trim()]));

  const matched: { code: string; count: number }[] = [];
  const extra: { code: string; count: number }[] = [];
  let totalImages = 0;

  for (const [code, count] of counts) {
    const canonical = excelByLower.get(code.toLowerCase());
    if (canonical) {
      matched.push({ code: canonical, count });
      totalImages += count;
    } else {
      extra.push({ code, count });
    }
  }

  const matchedLower = new Set(matched.map((m) => m.code.toLowerCase()));
  const missingCodes = excelCodes
    .map((c) => c.trim())
    .filter((c) => !matchedLower.has(c.toLowerCase()));

  return { matched, extra, missingCodes, totalImages };
}
