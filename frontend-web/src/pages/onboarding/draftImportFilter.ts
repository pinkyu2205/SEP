import type { BulkImportError } from '@/types/api.types';

/**
 * Phân loại các dòng BE từ chối khi import hợp đồng nháp.
 *
 * Trước 20/08/2026 FE phải tự dựng lại file Excel đã lọc rồi gửi lại, vì BE validate cả file
 * theo kiểu được-ăn-cả-ngã-về-không. Nay BE nhận `skipInvalidRows=true`: tự import phần sạch
 * và trả kèm `errors` của các dòng bị bỏ. FE chỉ còn việc trình bày cho dễ hiểu.
 *
 * Cũng không còn dò chuỗi tiếng Việt nữa — mỗi lỗi có `code` máy đọc được.
 */

/**
 * Lỗi "chờ đến lượt", không phải sai dữ liệu: file đúng, chỉ là nhập trước khi nhà sẵn sàng.
 * Xử lý xong bên ngoài thì import lại chính file gốc, không phải sửa ô nào.
 */
const PENDING_CODES = new Set(['PROPERTY_NOT_ACTIVE', 'PROPERTY_NO_INBOUND_LEASE']);

export const isWaitingForHostApproval = (e: BulkImportError): boolean =>
  e.code ? PENDING_CODES.has(e.code) : /chưa ACTIVE/i.test(e.message);

export interface RowSplit {
  /** Dòng chỉ vướng "chờ đến lượt" — import lại được sau, không cần sửa file. */
  waiting: number[];
  /** Dòng có lỗi dữ liệu thật — phải sửa file mới import được. */
  broken: number[];
  /** Tất cả dòng bị bỏ qua. */
  all: Set<number>;
  /** Lỗi của các dòng `broken`, giữ nguyên để hiện bảng cho admin sửa file. */
  brokenErrors: BulkImportError[];
  /** Nhà chưa sẵn sàng → số hợp đồng đang kẹt vì nó, kèm lý do kẹt. */
  waitingByProperty: WaitingProperty[];
}

export interface WaitingProperty {
  propertyName: string;
  rows: number[];
  /** `PropertyStatus` moi từ câu lỗi — mỗi trạng thái là một việc phải làm khác nhau. */
  status: string;
  /** Việc cần làm để gỡ kẹt, viết cho admin đọc. */
  todo: string;
}

/** Moi tên nhà ra khỏi câu lỗi: `BĐS 'MTX#107 ...' chưa ACTIVE (...)`. */
const propertyNameFromMessage = (message: string): string => {
  const m = message.match(/'([^']+)'/);
  return m ? m[1] : 'Không rõ nhà';
};

/** Moi `status=XXX` ra khỏi câu lỗi. */
const statusFromMessage = (message: string): string => {
  const m = message.match(/status=([A-Z_]+)/);
  return m ? m[1] : 'UNKNOWN';
};

/**
 * "Chưa ACTIVE" gộp nhiều tình huống rất khác nhau vào một câu. Tách ra vì mỗi cái là một
 * người khác phải làm một việc khác — nói chung chung "chờ duyệt" là admin đi hỏi nhầm người.
 */
const TODO_BY_STATUS: Record<string, string> = {
  PENDING_HOST_REVIEW: 'Chờ host duyệt giá',
  PENDING_OPERATION_MANAGER: 'Đã duyệt giá — còn thiếu quản lý phụ trách khu vực',
  RENOVATING: 'Đang cải tạo, chưa xong',
  INACTIVE: 'Nhà đang bị vô hiệu',
  MAINTENANCE: 'Nhà đang bảo trì',
};

const todoFor = (status: string) => TODO_BY_STATUS[status] ?? `Nhà đang ở trạng thái ${status}`;

/**
 * Chia các dòng lỗi thành 2 nhóm.
 *
 * Một dòng có thể dính cả hai loại (vừa nhà chưa duyệt, vừa sai ngày vào ở). Khi đó xếp vào
 * nhóm "sai dữ liệu" — vì nhà sẵn sàng rồi nó vẫn hỏng, nói với admin là "chờ là xong" sẽ
 * khiến họ chờ vô ích.
 */
export const splitErrorRows = (errors: BulkImportError[]): RowSplit => {
  const waiting = new Set<number>();
  const broken = new Set<number>();

  for (const e of errors) {
    if (isWaitingForHostApproval(e)) waiting.add(e.rowNumber);
    else broken.add(e.rowNumber);
  }
  for (const row of broken) waiting.delete(row);

  // Gom theo NHÀ chứ không theo dòng: admin quan tâm "còn kẹt căn nào", số dòng Excel chỉ
  // là chi tiết phụ.
  const byProperty = new Map<string, WaitingProperty>();
  for (const e of errors) {
    if (!waiting.has(e.rowNumber) || !isWaitingForHostApproval(e)) continue;
    const propertyName = propertyNameFromMessage(e.message);
    const status = statusFromMessage(e.message);
    const entry = byProperty.get(propertyName)
      ?? { propertyName, rows: [], status, todo: todoFor(status) };
    if (!entry.rows.includes(e.rowNumber)) entry.rows.push(e.rowNumber);
    byProperty.set(propertyName, entry);
  }

  const asc = (a: number, b: number) => a - b;
  return {
    waiting: [...waiting].sort(asc),
    broken: [...broken].sort(asc),
    all: new Set<number>([...waiting, ...broken]),
    brokenErrors: errors.filter((e) => broken.has(e.rowNumber)),
    waitingByProperty: [...byProperty.values()]
      .map((p) => ({ ...p, rows: p.rows.sort(asc) }))
      .sort((a, b) => b.rows.length - a.rows.length),
  };
};
