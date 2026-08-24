import * as XLSX from 'xlsx';
import type { PropertyResponse } from '@/types/api.types';
import { normalizeVi } from '@/utils/helpers';
import {
  normalizeRoomNumber, SLOT_LABEL,
  type PropertyOccupancy, type SlotState,
} from '@/services/propertyOccupancy.service';

/**
 * SOÁT TRƯỚC FILE EXCEL ĐÓN KHÁCH — đọc ngay trên trình duyệt, chưa gửi đi đâu cả.
 *
 * ─── Vì sao cần, khi BE đã có dry-run ────────────────────────────────────────
 * Dry-run của BE trả về "dòng 7 lỗi" kèm một câu tiếng Việt. Nó đúng, nhưng nó là
 * câu trả lời cho câu hỏi "dòng nào sai", trong khi thứ admin thật sự cần biết là
 * **"căn nhà này có chứa nổi ngần này khách không"**. Hai câu hỏi khác nhau:
 *
 *   BE nói:    dòng 7, 8 — không tìm thấy phòng.
 *   Admin cần: nhà MTX#07 có 5 phòng, còn 2 trống, mà file đang xếp 6 khách vào.
 *
 * Chỉ có cách sau mới cho biết phải quay lại hỏi host, chứ không phải sửa file.
 *
 * ─── Tình huống cụ thể phải bắt cho được ─────────────────────────────────────
 * Host khai nhà có 6 phòng nhưng thực tế chỉ dựng được 5. File Excel host gửi sang
 * có 6 dòng, dòng thứ 6 trỏ vào "Phòng 106" — một phòng không tồn tại trong hệ thống.
 * Hôm nay: cả file đi lên BE, 5 dòng vào, dòng 6 rơi vào bảng "lỗi dữ liệu" với câu
 * chung chung, và không ai nhận ra gốc rễ là **hồ sơ nhà khai sai số phòng**.
 *
 * Soát trước ở đây nói thẳng cả hai vế: phòng 106 không có, và hồ sơ nhà đang khai
 * 6 phòng trong khi mới tạo 5 — sai từ khâu khai báo nhà chứ không phải khâu nhập khách.
 *
 * ─── Không thay thế dry-run ──────────────────────────────────────────────────
 * Bản soát này CHỈ kiểm phần sức chứa (nhà nào, phòng nào, còn chỗ không). Ngày tháng,
 * CCCD, giá thuê, trạng thái nhà… vẫn để BE kiểm — nó có dữ liệu đầy đủ hơn và là nơi
 * quyết định cuối cùng. Nên đây là CẢNH BÁO SỚM, không phải cổng chặn.
 */

/** Tên sheet trong file mẫu. Không thấy thì tự dò theo header. */
const SHEET_NAME = '1. Hop_Dong_Nhap_Khach';

/** Header bắt buộc để nhận ra đúng sheet dữ liệu. */
const ANCHOR_HEADER = 'ho ten khach thue';

const COLUMN_ALIASES = {
  inboundCode: ['ma hd inbound', 'ma hop dong inbound'],
  propertyCode: ['ma bds'],
  propertyName: ['ten toa nha', 'ten toa', 'ten bds'],
  leaseType: ['loai thue'],
  roomNumber: ['so phong'],
  tenantName: ['ho ten khach thue', 'ho ten khach'],
} as const;

type ColumnKey = keyof typeof COLUMN_ALIASES;

export type PreflightCode =
  | 'PROPERTY_NOT_FOUND'
  | 'PROPERTY_NOT_ACTIVE'
  | 'ROOM_MISSING'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_TAKEN'
  | 'ROOM_DUPLICATED'
  | 'WHOLE_HOUSE_TAKEN'
  | 'WHOLE_HOUSE_DUPLICATED';

export interface PreflightRow {
  /** Số dòng Excel (1-based, gồm header) — khớp `BulkImportError.rowNumber` của BE. */
  excelRow: number;
  tenantName: string;
  propertyLabel: string;
  roomNumber: string;
  wholeHouseRow: boolean;
  code?: PreflightCode;
  message?: string;
}

export interface PreflightGroup {
  /** Tên nhà đọc từ file (chưa chắc khớp hệ thống). */
  label: string;
  property?: PropertyResponse;
  occupancy?: PropertyOccupancy;
  rows: PreflightRow[];
  okCount: number;
  issueCount: number;
  /** Số dòng vượt quá số chỗ còn nhận được — >0 là phải quay lại hỏi host. */
  overCapacity: number;
}

export interface PreflightReport {
  totalRows: number;
  okCount: number;
  issueCount: number;
  groups: PreflightGroup[];
  /** Không đọc được file (hỏng, sai định dạng, không thấy sheet) — im lặng, để BE nói. */
  parseError?: string;
  /** Nhà xuất hiện trong file — nơi gọi dùng để nạp sức chứa. */
  propertyIds: number[];
}

const EMPTY: PreflightReport = {
  totalRows: 0, okCount: 0, issueCount: 0, groups: [], propertyIds: [],
};

const norm = (v: unknown) => normalizeVi(String(v ?? '').trim()).replace(/\s+/g, ' ').trim();

/**
 * Bỏ dấu chấm/gạch để "Mã HĐ inbound" và "Ma HD  inbound:" cùng khớp một alias.
 *
 * Đổi ký tự lạ thành DẤU CÁCH chứ không xoá hẳn: hàm này còn dùng cho ô "Loại thuê", mà
 * giá trị ở đó là `NGUYEN_CAN` / `THEO_PHONG`. Xoá gạch dưới thì ra "nguyencan" — không
 * khớp được với "nguyen can", và cả nhánh nhận diện nguyên căn im lặng hỏng.
 */
const normHeader = (v: unknown) => norm(v).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Tìm dòng header trong ~10 dòng đầu — file thật hay có dòng tiêu đề/ghi chú ở trên. */
const findHeaderRow = (rows: unknown[][]): number =>
  rows.slice(0, 10).findIndex((r) => r.some((c) => normHeader(c) === ANCHOR_HEADER));

const mapColumns = (header: unknown[]): Partial<Record<ColumnKey, number>> => {
  const out: Partial<Record<ColumnKey, number>> = {};
  header.forEach((cell, idx) => {
    const h = normHeader(cell);
    if (!h) return;
    (Object.keys(COLUMN_ALIASES) as ColumnKey[]).forEach((key) => {
      if (out[key] != null) return;
      if ((COLUMN_ALIASES[key] as readonly string[]).includes(h)) out[key] = idx;
    });
  });
  return out;
};

/**
 * Khớp tên toà nhà trong file với nhà trong hệ thống.
 *
 * Chỉ khớp CHÍNH XÁC sau khi bỏ dấu và gộp khoảng trắng — cố ý không khớp mờ. Đoán
 * gần đúng ở đây nguy hiểm hơn là không đoán: nhận nhầm căn nhà nghĩa là bản soát nói
 * "còn 3 phòng trống" của một căn hoàn toàn khác, admin yên tâm bấm import rồi mới vỡ.
 * Không khớp thì báo `PROPERTY_NOT_FOUND` để người đọc tự đối chiếu.
 */
const buildPropertyIndex = (properties: PropertyResponse[]) => {
  const byName = new Map<string, PropertyResponse>();
  for (const p of properties) {
    const key = norm(p.propertyName);
    if (key && !byName.has(key)) byName.set(key, p);
  }
  return byName;
};

/** Lý do một phòng không nhận thêm khách được, viết cho admin đọc. */
const takenReason = (state: SlotState): string => SLOT_LABEL[state] ?? 'không nhận khách được';

/**
 * Đọc file và soát phần sức chứa.
 *
 * @param occupancyByProperty Sức chứa đã nạp sẵn. Bỏ trống ở lượt gọi đầu (chỉ để lấy
 *   `propertyIds` mà đi nạp), rồi gọi lại lượt hai với dữ liệu đầy đủ. Tách hai lượt vì
 *   biết nhà nào có trong file thì mới biết cần nạp phòng của nhà nào — nạp hết mọi nhà
 *   trong hệ thống chỉ để soát một file 6 dòng là phí.
 */
export const runImportPreflight = async (
  file: File,
  properties: PropertyResponse[],
  occupancyByProperty?: Map<number, PropertyOccupancy>,
): Promise<PreflightReport> => {
  let rows: unknown[][];
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = wb.Sheets[SHEET_NAME]
      ?? wb.SheetNames.map((n) => wb.Sheets[n]).find((s) => {
        const r = XLSX.utils.sheet_to_json<unknown[]>(s, { header: 1, blankrows: true, defval: '' });
        return findHeaderRow(r) >= 0;
      });
    if (!sheet) return { ...EMPTY, parseError: 'Không tìm thấy sheet dữ liệu trong file.' };
    rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: true, defval: '' });
  } catch {
    return { ...EMPTY, parseError: 'Không đọc được file Excel.' };
  }

  const headerIdx = findHeaderRow(rows);
  if (headerIdx < 0) return { ...EMPTY, parseError: 'Không nhận ra dòng tiêu đề trong file.' };

  const col = mapColumns(rows[headerIdx]);
  if (col.tenantName == null || (col.propertyName == null && col.inboundCode == null)) {
    return { ...EMPTY, parseError: 'File thiếu cột tên khách hoặc cột tên toà nhà.' };
  }

  const index = buildPropertyIndex(properties);
  const cell = (r: unknown[], key: ColumnKey): string =>
    col[key] == null ? '' : String(r[col[key]!] ?? '').trim();

  // ── Lượt 1: đọc từng dòng, gắn nhà ────────────────────────────────────────
  interface Parsed {
    excelRow: number; tenantName: string; label: string;
    roomNumber: string; wholeHouseRow: boolean; property?: PropertyResponse;
  }
  const parsed: Parsed[] = [];

  for (let i = headerIdx + 1; i < rows.length; i += 1) {
    const r = rows[i] ?? [];
    const tenantName = cell(r, 'tenantName');
    const label = cell(r, 'propertyName') || cell(r, 'inboundCode') || cell(r, 'propertyCode');
    // Dòng trống hoàn toàn (Excel hay thừa vài chục dòng rỗng phía dưới) thì bỏ qua.
    if (!tenantName && !label) continue;

    const leaseType = normHeader(cell(r, 'leaseType'));
    const roomNumber = cell(r, 'roomNumber');
    const property = index.get(norm(cell(r, 'propertyName')));

    parsed.push({
      excelRow: i + 1,
      tenantName: tenantName || '(chưa điền tên)',
      label: label || '(chưa điền nhà)',
      roomNumber,
      // Ưu tiên hồ sơ nhà thật; chỉ khi chưa khớp được nhà mới tin cột "Loại thuê".
      wholeHouseRow: property ? property.wholeHouse === true : leaseType.includes('nguyen can'),
      property,
    });
  }

  const propertyIds = [...new Set(parsed.map((p) => p.property?.id).filter((v): v is number => v != null))];

  // Chưa có sức chứa (lượt gọi đầu) → chỉ trả danh sách nhà để nơi gọi đi nạp.
  if (!occupancyByProperty) {
    return { ...EMPTY, totalRows: parsed.length, propertyIds };
  }

  // ── Lượt 2: soát sức chứa ─────────────────────────────────────────────────
  // Đếm số lần mỗi phòng bị nhắc TRONG CHÍNH FILE NÀY: hai dòng cùng trỏ vào một phòng
  // là lỗi mà BE dry-run từng dòng không thấy được (mỗi dòng riêng lẻ đều hợp lệ).
  const roomUsage = new Map<string, number[]>();
  const wholeHouseUsage = new Map<number, number[]>();
  for (const p of parsed) {
    if (!p.property) continue;
    if (p.wholeHouseRow) {
      const arr = wholeHouseUsage.get(p.property.id) ?? [];
      arr.push(p.excelRow);
      wholeHouseUsage.set(p.property.id, arr);
    } else if (p.roomNumber) {
      const key = `${p.property.id}#${normalizeRoomNumber(p.roomNumber)}`;
      const arr = roomUsage.get(key) ?? [];
      arr.push(p.excelRow);
      roomUsage.set(key, arr);
    }
  }

  const checked: PreflightRow[] = parsed.map((p) => {
    const base: PreflightRow = {
      excelRow: p.excelRow,
      tenantName: p.tenantName,
      propertyLabel: p.property?.propertyName ?? p.label,
      roomNumber: p.roomNumber,
      wholeHouseRow: p.wholeHouseRow,
    };

    if (!p.property) {
      return {
        ...base,
        code: 'PROPERTY_NOT_FOUND',
        message: `Không tìm thấy nhà “${p.label}” trong hệ thống. Kiểm lại cột "Tên tòa nhà" cho khớp đúng tên đã tạo.`,
      };
    }
    if (p.property.status !== 'ACTIVE') {
      return {
        ...base,
        code: 'PROPERTY_NOT_ACTIVE',
        message: `Nhà đang ở trạng thái ${p.property.status}, chưa nhận khách được.`,
      };
    }

    const occ = occupancyByProperty.get(p.property.id);
    // Không nạp được phòng thì KHÔNG kết luận — thà im còn hơn báo bừa "phòng không tồn tại".
    if (!occ?.loaded) return base;

    if (p.wholeHouseRow) {
      const uses = wholeHouseUsage.get(p.property.id) ?? [];
      if (uses.length > 1 && uses[0] !== p.excelRow) {
        return {
          ...base,
          code: 'WHOLE_HOUSE_DUPLICATED',
          message: `Nhà nguyên căn này đã được xếp khách ở dòng ${uses[0]} — một căn chỉ nhận một hợp đồng.`,
        };
      }
      if (occ.wholeHouseTaken) {
        return {
          ...base,
          code: 'WHOLE_HOUSE_TAKEN',
          message: 'Nhà nguyên căn này đã có khách hoặc đã có hồ sơ chờ đón khách.',
        };
      }
      return base;
    }

    if (!p.roomNumber) {
      return {
        ...base,
        code: 'ROOM_MISSING',
        message: 'Nhà chia phòng nhưng cột "Số phòng" đang để trống.',
      };
    }

    const slot = occ.byRoomNumber.get(normalizeRoomNumber(p.roomNumber));
    if (!slot) {
      /*
       * ĐÂY là tình huống "host khai 6 phòng, nhà chỉ có 5".
       * Nói kèm số phòng thật của căn nhà, vì nếu không admin sẽ đi sửa file (sai hướng)
       * thay vì quay lại hỏi host xem căn nhà thật ra có mấy phòng.
       */
      return {
        ...base,
        code: 'ROOM_NOT_FOUND',
        message: `Nhà này không có phòng “${p.roomNumber}”. Hệ thống chỉ ghi nhận ${occ.roomCount} phòng: ${occ.rooms.map((r) => r.roomNumber).join(', ') || '(chưa tạo phòng nào)'}.`,
      };
    }

    const uses = roomUsage.get(`${p.property.id}#${normalizeRoomNumber(p.roomNumber)}`) ?? [];
    if (uses.length > 1 && uses[0] !== p.excelRow) {
      return {
        ...base,
        code: 'ROOM_DUPLICATED',
        message: `Phòng ${p.roomNumber} đã được xếp cho khách ở dòng ${uses[0]}.`,
      };
    }

    if (slot.state !== 'AVAILABLE') {
      return {
        ...base,
        code: 'ROOM_TAKEN',
        message: `Phòng ${p.roomNumber} ${takenReason(slot.state)}, không nhận thêm khách được.`,
      };
    }

    return base;
  });

  // ── Gom theo nhà ──────────────────────────────────────────────────────────
  const groupMap = new Map<string, PreflightGroup>();
  checked.forEach((row, i) => {
    const property = parsed[i].property;
    const key = property ? `id:${property.id}` : `name:${row.propertyLabel}`;
    const g = groupMap.get(key) ?? {
      label: row.propertyLabel,
      property,
      occupancy: property ? occupancyByProperty.get(property.id) : undefined,
      rows: [],
      okCount: 0,
      issueCount: 0,
      overCapacity: 0,
    };
    g.rows.push(row);
    if (row.code) g.issueCount += 1; else g.okCount += 1;
    groupMap.set(key, g);
  });

  const groups = [...groupMap.values()].map((g) => {
    /*
     * Vượt sức chứa tính trên SỐ DÒNG so với SỐ CHỖ CÒN NHẬN ĐƯỢC, không phải trên số
     * dòng lỗi. Một file 6 dòng cho căn còn 2 phòng thì kể cả khi từng dòng đều trỏ vào
     * phòng có thật, vẫn có 4 người không có chỗ. Đó là câu hỏi phải hỏi host, và nó
     * không hiện ra ở bất kỳ lỗi từng-dòng nào.
     */
    const capacity = g.occupancy?.loaded
      ? (g.occupancy.wholeHouse ? (g.occupancy.wholeHouseTaken ? 0 : 1) : g.occupancy.available)
      : null;
    return {
      ...g,
      overCapacity: capacity == null ? 0 : Math.max(0, g.rows.length - capacity),
    };
  }).sort((a, b) => (b.issueCount + b.overCapacity) - (a.issueCount + a.overCapacity));

  return {
    totalRows: checked.length,
    okCount: checked.filter((r) => !r.code).length,
    issueCount: checked.filter((r) => !!r.code).length,
    groups,
    propertyIds,
  };
};
