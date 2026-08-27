/**
 * Chi phí vận hành (Host → /host/expenses).
 *
 * Trước 15/08/2026 hai kiểu này nằm trong `utils/expenseStore.ts` — một store
 * localStorage tự SEED chi phí giả (tiền thuê 3 căn nhà mock + 5 khoản lặt vặt)
 * ngay khi module được import. Không màn nào dùng store đó nữa, chỉ import lấy kiểu,
 * nên đã xoá store và giữ lại đúng phần kiểu ở đây.
 *
 * `Expense` là hình dạng FE dùng; BE trả `ExpenseDto` (category viết hoa) và
 * `host.service.ts` map hai chiều.
 */
export type ExpenseCategory =
  | 'lease'
  | 'maintenance'
  | 'equipment'
  | 'management'
  | 'utility'
  | 'other';

export interface Expense {
  id: string;
  propertyId: string;
  propertyName: string;
  category: ExpenseCategory;
  amount: number;
  /** Định dạng 'YYYY-MM' */
  month: string;
  note?: string;
  createdAt: string;
}
