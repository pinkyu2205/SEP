/**
 * NHẬP LẠI FILE KHỞI TẠO NHÀ — đọc file ngay trên trình duyệt để biết lần nhập này còn làm
 * được gì với những căn ĐÃ CÓ trong hệ thống.
 *
 * Máy chủ (`BulkLeaseImportServiceImpl`) xử lý căn trùng mã HĐ như sau:
 *   • kiểm tra (dry-run): chỉ báo "bỏ qua", không nói mã KH điện/nước trong file có khác
 *     hồ sơ không, cũng không trả tên nhà;
 *   • nhập thật: GHI ĐÈ hai cột mã KH bằng số trong file — kể cả khi y hệt — rồi báo
 *     "Đã cập nhật mã KH".
 *
 * Nên nhập lại đúng file cũ thì màn hình nói "Đã nhập 0 căn" mà nút nhập vẫn sáng, và
 * bảng kết quả gắn nhãn "Đã khởi tạo" cho cả 6 căn chẳng có gì thay đổi (03/10/2026, file
 * 150_155). Ở đây tự so mã trong file với hồ sơ để nói thẳng: căn nào sẽ đổi mã, căn nào
 * không đổi gì — và tắt nút nhập khi không còn gì để làm.
 */
import * as XLSX from 'xlsx';
import type { PropertyResponse } from '@/types/api.types';
import { normalizeVi } from '@/utils/helpers';

const SHEET_NAME = '1. Hop_Dong_Thue';

/** Một dòng sheet hợp đồng thuê — chỉ những cột cần cho việc đối chiếu. */
export interface LeaseFileRow {
  contractCode: string;
  propertyName: string;
  elecCode: string;
  waterCode: string;
}

/** Thay đổi mã KH mà lần nhập này sẽ ghi lên một căn đã có. */
export interface CodeChange {
  kind: 'điện' | 'nước';
  from: string;
  to: string;
}

export interface ExistingLease {
  contractCode: string;
  propertyName: string;
  /**
   * Nhà khớp trong hệ thống — `undefined` khi không dò ra theo tên. Khi đó KHÔNG kết luận
   * "không đổi": file có mã thì coi như lần nhập này có thể ghi đè mã (`unknown`).
   */
  property?: PropertyResponse;
  changes: CodeChange[];
  /** File có mã KH mà không dò được hồ sơ để so — nhập thì máy chủ vẫn ghi mã trong file. */
  unknown: boolean;
}

/** Căn đã có mà lần nhập này vẫn có việc để làm (đổi mã, hoặc không so được). */
export const willTouch = (e: ExistingLease) => e.changes.length > 0 || e.unknown;

const headerKey = (s: unknown) => normalizeVi(String(s ?? '')).replace(/\s+/g, ' ').trim();

/** Chuẩn hoá mã y như máy chủ (`UtilityCustomerCodeHelper.normalize`): chỉ giữ chữ-số. */
const normCode = (s?: string | null) => (s ?? '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
const showCode = (s?: string | null) => normCode(s).toUpperCase();

export const readLeaseRows = async (file: File): Promise<LeaseFileRow[]> => {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = wb.Sheets[SHEET_NAME] ?? wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });

  // Hàng tiêu đề là hàng đầu tiên có ô "Mã hợp đồng" — file mẫu có thể có dòng tiêu đề lớn phía trên.
  const headerIdx = grid.findIndex((r) => r.some((c) => headerKey(c) === 'ma hop dong'));
  if (headerIdx < 0) return [];
  const header = grid[headerIdx].map(headerKey);
  const col = (name: string) => header.indexOf(name);
  const cCode = col('ma hop dong');
  const cName = col('ten toa nha');
  const cElec = col('ma khach hang dien');
  const cWater = col('ma khach hang nuoc');

  return grid.slice(headerIdx + 1)
    .map((r) => ({
      contractCode: String(r[cCode] ?? '').trim(),
      propertyName: cName >= 0 ? String(r[cName] ?? '').trim() : '',
      elecCode: cElec >= 0 ? String(r[cElec] ?? '').trim() : '',
      waterCode: cWater >= 0 ? String(r[cWater] ?? '').trim() : '',
    }))
    .filter((r) => r.contractCode);
};

/**
 * Khớp dòng file với nhà trong hệ thống THEO TÊN — hồ sơ nhà không mang mã HĐ thuê. Thử tên
 * đầy đủ trước, rồi tới cụm đầu ("MTX#150"), là mã nhà theo quy ước đặt tên.
 */
const findProperty = (row: LeaseFileRow, properties: PropertyResponse[]) => {
  const full = headerKey(row.propertyName);
  const hit = properties.find((p) => headerKey(p.propertyName) === full);
  if (hit) return hit;
  const head = full.split(' ')[0];
  if (!head) return undefined;
  const byHead = properties.filter((p) => headerKey(p.propertyName).split(' ')[0] === head);
  return byHead.length === 1 ? byHead[0] : undefined;
};

/**
 * Với mỗi căn máy chủ báo "đã có": lần nhập này sẽ đổi mã KH nào. Ô mã để trống trong file
 * thì máy chủ không đụng tới — không tính là thay đổi.
 */
export const diffExisting = (
  rows: LeaseFileRow[],
  existingCodes: Set<string>,
  properties: PropertyResponse[],
): ExistingLease[] =>
  rows
    .filter((r) => existingCodes.has(r.contractCode))
    .map((r) => {
      const property = findProperty(r, properties);
      const changes: CodeChange[] = [];
      if (property) {
        if (normCode(r.elecCode) && normCode(r.elecCode) !== normCode(property.electricityCustomerCode)) {
          changes.push({ kind: 'điện', from: showCode(property.electricityCustomerCode), to: showCode(r.elecCode) });
        }
        if (normCode(r.waterCode) && normCode(r.waterCode) !== normCode(property.waterCustomerCode)) {
          changes.push({ kind: 'nước', from: showCode(property.waterCustomerCode), to: showCode(r.waterCode) });
        }
      }
      return {
        contractCode: r.contractCode,
        propertyName: property?.propertyName ?? r.propertyName,
        property,
        changes,
        unknown: !property && !!(normCode(r.elecCode) || normCode(r.waterCode)),
      };
    });

export const describeChanges = (changes: CodeChange[]) =>
  changes.map((c) => `Mã KH ${c.kind}: ${c.from || '(trống)'} → ${c.to}`).join(' · ');
