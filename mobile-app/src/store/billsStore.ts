import { useState, useEffect } from 'react';

// ===================== TYPES =====================
export type BillStatus = 'pending' | 'paid' | 'overdue' | 'partial';
export type BillPaymentMethod = 'qr' | 'bank_transfer' | 'cash';

export interface BillItem {
  label: string;
  amount: number;
}

export interface SharedBill {
  id: string;
  code: string;
  roomId: string;
  roomName: string;
  propertyId: string;
  propertyName: string;
  tenantId: string;
  tenantName: string;
  tenantPhone: string;
  month: number;
  year: number;
  items: BillItem[];
  totalAmount: number;
  lateFee: number;
  grandTotal: number;
  status: BillStatus;
  dueDate: string;
  createdAt: string;
  paidAt?: string;
  paidAmount?: number;
  paymentMethod?: BillPaymentMethod;
  transactionId?: string;
  daysOverdue?: number;
}

// ===================== SEED DATA =====================
// Từ BillingManagementScreen (manager view)
const MANAGER_SEED: SharedBill[] = [
  {
    id: 'b1', code: 'HD-T5-101', roomId: 'r1', roomName: 'P101', propertyId: 'p1',
    propertyName: 'Nhà Nguyễn Trãi', tenantId: 'u1', tenantName: 'Trần Văn A', tenantPhone: '0901111001',
    month: 5, year: 2026,
    items: [
      { label: 'Tiền phòng', amount: 3500000 },
      { label: 'Điện (135 kWh)', amount: 472500 },
      { label: 'Nước (14 m³)', amount: 280000 },
      { label: 'Internet', amount: 100000 },
    ],
    totalAmount: 4352500, lateFee: 0, grandTotal: 4352500,
    status: 'pending', dueDate: '2026-05-15', createdAt: '2026-05-01',
  },
  {
    id: 'b2', code: 'HD-T5-102', roomId: 'r2', roomName: 'P102', propertyId: 'p1',
    propertyName: 'Nhà Nguyễn Trãi', tenantId: 'u2', tenantName: 'Lê Thị B', tenantPhone: '0901111002',
    month: 5, year: 2026,
    items: [
      { label: 'Tiền phòng', amount: 3200000 },
      { label: 'Điện (120 kWh)', amount: 420000 },
      { label: 'Nước (12 m³)', amount: 240000 },
    ],
    totalAmount: 3860000, lateFee: 0, grandTotal: 3860000,
    status: 'paid', dueDate: '2026-05-15', paidAt: '2026-05-10',
    paidAmount: 3860000, paymentMethod: 'qr', transactionId: 'VQR-001-2026',
    createdAt: '2026-05-01',
  },
  {
    id: 'b3', code: 'HD-T5-201', roomId: 'r4', roomName: 'P201', propertyId: 'p1',
    propertyName: 'Nhà Nguyễn Trãi', tenantId: 'u3', tenantName: 'Phạm Văn C', tenantPhone: '0901111003',
    month: 5, year: 2026,
    items: [
      { label: 'Tiền phòng', amount: 3800000 },
      { label: 'Điện (145 kWh)', amount: 507500 },
      { label: 'Nước (15 m³)', amount: 300000 },
      { label: 'Dịch vụ', amount: 150000 },
    ],
    totalAmount: 4757500, lateFee: 47575, grandTotal: 4805075,
    status: 'overdue', dueDate: '2026-05-15', createdAt: '2026-05-01', daysOverdue: 1,
  },
  {
    id: 'b4', code: 'HD-T5-301', roomId: 'r9', roomName: 'P301', propertyId: 'p1',
    propertyName: 'Nhà Nguyễn Trãi', tenantId: 'u4', tenantName: 'Ngô Thị D', tenantPhone: '0901111004',
    month: 5, year: 2026,
    items: [
      { label: 'Tiền phòng', amount: 3500000 },
      { label: 'Điện (110 kWh)', amount: 385000 },
      { label: 'Nước (11 m³)', amount: 220000 },
    ],
    totalAmount: 4105000, lateFee: 0, grandTotal: 4105000,
    status: 'pending', dueDate: '2026-05-15', createdAt: '2026-05-01',
  },
  {
    id: 'b5', code: 'HD-T5-CMT-101', roomId: 'r10', roomName: 'P101', propertyId: 'p3',
    propertyName: 'Nhà CMT8', tenantId: 'u5', tenantName: 'Bùi Văn H', tenantPhone: '0901111008',
    month: 5, year: 2026,
    items: [
      { label: 'Tiền phòng', amount: 4000000 },
      { label: 'Điện (150 kWh)', amount: 525000 },
      { label: 'Nước (16 m³)', amount: 320000 },
    ],
    totalAmount: 4845000, lateFee: 0, grandTotal: 4845000,
    status: 'pending', dueDate: '2026-05-15', createdAt: '2026-05-01',
  },
  {
    id: 'b6', code: 'HD-T4-201', roomId: 'r4', roomName: 'P201', propertyId: 'p1',
    propertyName: 'Nhà Nguyễn Trãi', tenantId: 'u3', tenantName: 'Phạm Văn C', tenantPhone: '0901111003',
    month: 4, year: 2026,
    items: [
      { label: 'Tiền phòng', amount: 3800000 },
      { label: 'Điện (140 kWh)', amount: 490000 },
      { label: 'Nước (14 m³)', amount: 280000 },
    ],
    totalAmount: 4570000, lateFee: 45700, grandTotal: 4615700,
    status: 'overdue', dueDate: '2026-04-15', createdAt: '2026-04-01', daysOverdue: 31,
  },
];

// Từ InvoiceListScreen (tenant view — Nguyễn Văn A)
const TENANT_SEED: SharedBill[] = [
  {
    id: 'inv1', code: 'INV-T5-201', roomId: 'rt1', roomName: 'Phòng 201', propertyId: 'pt1',
    propertyName: 'Nhà trọ Quận 5', tenantId: 't1', tenantName: 'Nguyễn Văn A', tenantPhone: '0901234567',
    month: 5, year: 2026,
    items: [
      { label: 'Tiền thuê phòng', amount: 3000000 },
      { label: 'Điện (150 kWh × 3.500đ)', amount: 525000 },
      { label: 'Nước (12 m³ × 15.000đ)', amount: 180000 },
      { label: 'Phí dịch vụ', amount: 150000 },
    ],
    totalAmount: 3855000, lateFee: 0, grandTotal: 3855000,
    status: 'pending', dueDate: '2026-05-15', createdAt: '2026-04-29',
  },
  {
    id: 'inv2', code: 'INV-T4-201', roomId: 'rt1', roomName: 'Phòng 201', propertyId: 'pt1',
    propertyName: 'Nhà trọ Quận 5', tenantId: 't1', tenantName: 'Nguyễn Văn A', tenantPhone: '0901234567',
    month: 4, year: 2026,
    items: [
      { label: 'Tiền thuê phòng', amount: 3000000 },
      { label: 'Điện (130 kWh × 3.500đ)', amount: 455000 },
      { label: 'Nước (10 m³ × 15.000đ)', amount: 150000 },
      { label: 'Phí dịch vụ', amount: 150000 },
    ],
    totalAmount: 3755000, lateFee: 0, grandTotal: 3755000,
    status: 'paid', dueDate: '2026-04-15', paidAt: '2026-04-10', createdAt: '2026-03-29',
    paymentMethod: 'qr', transactionId: 'TXN-2026-04-001',
  },
  {
    id: 'inv3', code: 'INV-T3-201', roomId: 'rt1', roomName: 'Phòng 201', propertyId: 'pt1',
    propertyName: 'Nhà trọ Quận 5', tenantId: 't1', tenantName: 'Nguyễn Văn A', tenantPhone: '0901234567',
    month: 3, year: 2026,
    items: [
      { label: 'Tiền thuê phòng', amount: 3000000 },
      { label: 'Điện (140 kWh × 3.500đ)', amount: 490000 },
      { label: 'Nước (11 m³ × 15.000đ)', amount: 165000 },
      { label: 'Phí dịch vụ', amount: 150000 },
    ],
    totalAmount: 3805000, lateFee: 50000, grandTotal: 3855000,
    status: 'overdue', dueDate: '2026-03-15', createdAt: '2026-02-28',
  },
];

// ===================== STORE =====================
let _bills: SharedBill[] = [...MANAGER_SEED, ...TENANT_SEED];
const _listeners = new Set<() => void>();

const _notify = () => _listeners.forEach(fn => fn());

export const billsStore = {
  addBills(newBills: SharedBill[]) {
    _bills = [...newBills, ..._bills];
    _notify();
  },
  updateStatus(id: string, status: BillStatus, extra?: Partial<SharedBill>) {
    _bills = _bills.map(b => b.id === id ? { ...b, status, ...extra } : b);
    _notify();
  },
  updateByCode(code: string, status: BillStatus, extra?: Partial<SharedBill>) {
    _bills = _bills.map(b => b.code === code ? { ...b, status, ...extra } : b);
    _notify();
  },
};

// ===================== HOOKS =====================
export function useBills(tenantName?: string): SharedBill[] {
  const getSlice = () =>
    tenantName ? _bills.filter(b => b.tenantName === tenantName) : [..._bills];

  const [bills, setBills] = useState<SharedBill[]>(getSlice);

  useEffect(() => {
    const update = () => setBills(getSlice());
    _listeners.add(update);
    return () => { _listeners.delete(update); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantName]);

  return bills;
}
