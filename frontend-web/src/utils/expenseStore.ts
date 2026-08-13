import { useSyncExternalStore } from 'react';
import { MOCK_PROPERTIES } from './mockData';
import { todayIso } from '@/utils/serverTime';

// ── Tháng vận hành hiện tại (đồng bộ với các trang dashboard mock) ──────────────
export const CURRENT_MONTH = '2026-05';

export type ExpenseCategory = 'lease' | 'maintenance' | 'equipment' | 'management' | 'utility' | 'other';

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

export const EXPENSE_CATEGORY_META: Record<ExpenseCategory, { label: string; color: string; dot: string }> = {
  lease:       { label: 'Thuê nhà (chủ nhà)', color: 'bg-indigo-50 text-indigo-700', dot: 'bg-indigo-500' },
  maintenance: { label: 'Bảo trì',            color: 'bg-amber-50 text-amber-700',   dot: 'bg-amber-500' },
  equipment:   { label: 'Thiết bị',           color: 'bg-cyan-50 text-cyan-700',     dot: 'bg-cyan-500' },
  management:  { label: 'Quản lý',            color: 'bg-violet-50 text-violet-700', dot: 'bg-violet-500' },
  utility:     { label: 'Điện nước',          color: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  other:       { label: 'Khác',               color: 'bg-slate-100 text-slate-600',  dot: 'bg-slate-400' },
};

const STORAGE_KEY = 'hbland_expenses_v1';

// ── Seed: chi phí thuê nhà lớn của từng property cho tháng hiện tại + vài chi phí khác ──
function seed(): Expense[] {
  const lease: Expense[] = MOCK_PROPERTIES.map((p) => ({
    id: `exp-lease-${p.id}`,
    propertyId: p.id,
    propertyName: p.name,
    category: 'lease',
    amount: p.monthlyLeaseCost,
    month: CURRENT_MONTH,
    note: 'Tiền thuê nguyên căn trả chủ nhà',
    createdAt: `${CURRENT_MONTH}-01`,
  }));
  const extras: Expense[] = [
    { id: 'exp-x1', propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', category: 'maintenance', amount: 1_200_000, month: CURRENT_MONTH, note: 'Sửa máy bơm nước', createdAt: `${CURRENT_MONTH}-08` },
    { id: 'exp-x2', propertyId: 'prop-1', propertyName: 'Nhà Nguyễn Trãi', category: 'utility',     amount: 800_000,   month: CURRENT_MONTH, note: 'Điện nước khu vực chung', createdAt: `${CURRENT_MONTH}-10` },
    { id: 'exp-x3', propertyId: 'prop-2', propertyName: 'Nhà Lê Văn Sỹ',   category: 'equipment',   amount: 5_500_000, month: CURRENT_MONTH, note: 'Mua điều hòa thay mới', createdAt: `${CURRENT_MONTH}-05` },
    { id: 'exp-x4', propertyId: 'prop-2', propertyName: 'Nhà Lê Văn Sỹ',   category: 'management',  amount: 2_000_000, month: CURRENT_MONTH, note: 'Phụ cấp quản lý', createdAt: `${CURRENT_MONTH}-01` },
    { id: 'exp-x5', propertyId: 'prop-3', propertyName: 'Nhà Cách Mạng Tháng 8', category: 'maintenance', amount: 600_000, month: CURRENT_MONTH, note: 'Thay bóng đèn hành lang', createdAt: `${CURRENT_MONTH}-12` },
  ];
  return [...lease, ...extras];
}

// ── Store nội bộ (singleton + pub/sub cho useSyncExternalStore) ─────────────────
let expenses: Expense[] = load();
const listeners = new Set<() => void>();

function load(): Expense[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  const seeded = seed();
  persist(seeded);
  return seeded;
}

function persist(next: Expense[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
}

function emit() {
  for (const l of listeners) l();
}

export const expenseStore = {
  getAll(): Expense[] {
    return expenses;
  },
  /** Thay toàn bộ danh sách bằng dữ liệu từ API (giữ reactivity). */
  hydrate(list: Expense[]) {
    expenses = list;
    persist(expenses);
    emit();
  },
  /** Chèn 1 item đã có id (vd item BE trả về sau khi tạo). */
  upsert(item: Expense) {
    expenses = [item, ...expenses.filter(e => e.id !== item.id)];
    persist(expenses);
    emit();
  },
  add(input: Omit<Expense, 'id' | 'createdAt'>) {
    const item: Expense = {
      ...input,
      id: `exp-${Date.now()}`,
      createdAt: todayIso(),
    };
    expenses = [item, ...expenses];
    persist(expenses);
    emit();
  },
  remove(id: string) {
    expenses = expenses.filter(e => e.id !== id);
    persist(expenses);
    emit();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** Hook React: danh sách chi phí, tự cập nhật khi store đổi. */
export function useExpenses(): Expense[] {
  return useSyncExternalStore(expenseStore.subscribe, expenseStore.getAll, expenseStore.getAll);
}
