import * as XLSX from 'xlsx';
import { todayIso } from '@/utils/serverTime';

export interface SheetSpec {
  name: string;
  /** Mảng các object; key = tiêu đề cột. */
  rows: Record<string, string | number>[];
}

/** Xuất một hoặc nhiều sheet ra file .xlsx và tải về. */
export function exportToExcel(fileName: string, sheets: SheetSpec[]) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows);
    // Tự co giãn độ rộng cột theo nội dung dài nhất.
    const cols = sheet.rows.length > 0 ? Object.keys(sheet.rows[0]) : [];
    ws['!cols'] = cols.map(c => {
      const maxLen = Math.max(
        c.length,
        ...sheet.rows.map(r => String(r[c] ?? '').length),
      );
      return { wch: Math.min(Math.max(maxLen + 2, 10), 40) };
    });
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  const stamp = todayIso();
  XLSX.writeFile(wb, `${fileName}_${stamp}.xlsx`);
}
