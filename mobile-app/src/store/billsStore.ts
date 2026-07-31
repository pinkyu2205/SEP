import { useState, useEffect } from 'react';

// ===================== TYPES =====================
export type BillStatus = 'pending' | 'paid' | 'overdue' | 'partial' | 'cancelled';
export type BillPaymentMethod = 'qr' | 'bank_transfer' | 'cash' | 'ewallet' | 'other';
export type InvoiceType = 'rent' | 'electricity' | 'water' | 'maintenance';

export interface BillItem {
  label: string;
  amount: number;
}

export interface SharedBill {
  id: string;
  code: string;
  invoiceType: InvoiceType;
  propertyType?: 'MULTI_ROOM' | 'WHOLE_HOUSE';
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
  // Electricity-specific
  kwhUsed?: number;
  electricityRate?: number;
  // Water-specific
  m3Used?: number;
  waterRate?: number;
  // Billing period (for utility invoices)
  billingPeriod?: string;
  // PayOS (30/07/2026) — có sau khi gọi payInvoice(), dùng để hiện QR/mở trang thanh toán thật.
  payosOrderCode?: number;
  payosCheckoutUrl?: string;
  payosQrCode?: string;
}

// ===================== SEED DATA =====================
// Manager view — split into 3 invoice types per tenant per month
const MANAGER_SEED: SharedBill[] = [
  // ── P101 · Trần Văn A · Tháng 5 ──────────────────────────
  {
    id: 'b1-rent', code: 'HD-T5-101-RENT', invoiceType: 'rent',
    roomId: 'r1', roomName: 'P101', propertyId: 'p1',
    propertyName: 'Nhà Nguyễn Trãi', tenantId: 'u1', tenantName: 'Trần Văn A', tenantPhone: '0901111001',
    month: 5, year: 2026,
    items: [{ label: 'Tiền phòng', amount: 3500000 }],
    totalAmount: 3500000, lateFee: 0, grandTotal: 3500000,
    status: 'pending', dueDate: '2026-05-15', createdAt: '2026-05-01',
  },
  {
    id: 'b1-elec', code: 'HD-T5-101-ELEC', invoiceType: 'electricity',
    roomId: 'r1', roomName: 'P101', propertyId: 'p1',
    propertyName: 'Nhà Nguyễn Trãi', tenantId: 'u1', tenantName: 'Trần Văn A', tenantPhone: '0901111001',
    month: 5, year: 2026,
    items: [{ label: 'Điện (135 kWh × 3.500đ)', amount: 472500 }],
    totalAmount: 472500, lateFee: 0, grandTotal: 472500,
    status: 'pending', dueDate: '2026-05-20', createdAt: '2026-05-05',
    kwhUsed: 135, electricityRate: 3500, billingPeriod: '01/05 – 31/05/2026',
  },
  {
    id: 'b1-water', code: 'HD-T5-101-WATER', invoiceType: 'water',
    roomId: 'r1', roomName: 'P101', propertyId: 'p1',
    propertyName: 'Nhà Nguyễn Trãi', tenantId: 'u1', tenantName: 'Trần Văn A', tenantPhone: '0901111001',
    month: 5, year: 2026,
    items: [{ label: 'Nước (14 m³ × 20.000đ)', amount: 280000 }],
    totalAmount: 280000, lateFee: 0, grandTotal: 280000,
    status: 'pending', dueDate: '2026-05-20', createdAt: '2026-05-05',
    m3Used: 14, waterRate: 20000, billingPeriod: '01/05 – 31/05/2026',
  },

  // ── P102 · Lê Thị B · Tháng 5 ────────────────────────────
  {
    id: 'b2-rent', code: 'HD-T5-102-RENT', invoiceType: 'rent',
    roomId: 'r2', roomName: 'P102', propertyId: 'p1',
    propertyName: 'Nhà Nguyễn Trãi', tenantId: 'u2', tenantName: 'Lê Thị B', tenantPhone: '0901111002',
    month: 5, year: 2026,
    items: [{ label: 'Tiền phòng', amount: 3200000 }],
    totalAmount: 3200000, lateFee: 0, grandTotal: 3200000,
    status: 'paid', dueDate: '2026-05-15', paidAt: '2026-05-10',
    paidAmount: 3200000, paymentMethod: 'qr', transactionId: 'VQR-RENT-001',
    createdAt: '2026-05-01',
  },
  {
    id: 'b2-elec', code: 'HD-T5-102-ELEC', invoiceType: 'electricity',
    roomId: 'r2', roomName: 'P102', propertyId: 'p1',
    propertyName: 'Nhà Nguyễn Trãi', tenantId: 'u2', tenantName: 'Lê Thị B', tenantPhone: '0901111002',
    month: 5, year: 2026,
    items: [{ label: 'Điện (120 kWh × 3.500đ)', amount: 420000 }],
    totalAmount: 420000, lateFee: 0, grandTotal: 420000,
    status: 'paid', dueDate: '2026-05-20', paidAt: '2026-05-12',
    paidAmount: 420000, paymentMethod: 'qr', transactionId: 'VQR-ELEC-001',
    createdAt: '2026-05-05',
    kwhUsed: 120, electricityRate: 3500, billingPeriod: '01/05 – 31/05/2026',
  },
  {
    id: 'b2-water', code: 'HD-T5-102-WATER', invoiceType: 'water',
    roomId: 'r2', roomName: 'P102', propertyId: 'p1',
    propertyName: 'Nhà Nguyễn Trãi', tenantId: 'u2', tenantName: 'Lê Thị B', tenantPhone: '0901111002',
    month: 5, year: 2026,
    items: [{ label: 'Nước (12 m³ × 20.000đ)', amount: 240000 }],
    totalAmount: 240000, lateFee: 0, grandTotal: 240000,
    status: 'paid', dueDate: '2026-05-20', paidAt: '2026-05-12',
    paidAmount: 240000, paymentMethod: 'qr', transactionId: 'VQR-WATER-001',
    createdAt: '2026-05-05',
    m3Used: 12, waterRate: 20000, billingPeriod: '01/05 – 31/05/2026',
  },

  // ── P201 · Phạm Văn C · Tháng 5 ──────────────────────────
  {
    id: 'b3-rent', code: 'HD-T5-201-RENT', invoiceType: 'rent',
    roomId: 'r4', roomName: 'P201', propertyId: 'p1',
    propertyName: 'Nhà Nguyễn Trãi', tenantId: 'u3', tenantName: 'Phạm Văn C', tenantPhone: '0901111003',
    month: 5, year: 2026,
    items: [{ label: 'Tiền phòng', amount: 3800000 }, { label: 'Dịch vụ', amount: 150000 }],
    totalAmount: 3950000, lateFee: 39500, grandTotal: 3989500,
    status: 'overdue', dueDate: '2026-05-15', createdAt: '2026-05-01', daysOverdue: 1,
  },
  {
    id: 'b3-elec', code: 'HD-T5-201-ELEC', invoiceType: 'electricity',
    roomId: 'r4', roomName: 'P201', propertyId: 'p1',
    propertyName: 'Nhà Nguyễn Trãi', tenantId: 'u3', tenantName: 'Phạm Văn C', tenantPhone: '0901111003',
    month: 5, year: 2026,
    items: [{ label: 'Điện (145 kWh × 3.500đ)', amount: 507500 }],
    totalAmount: 507500, lateFee: 5075, grandTotal: 512575,
    status: 'overdue', dueDate: '2026-05-20', createdAt: '2026-05-05', daysOverdue: 1,
    kwhUsed: 145, electricityRate: 3500, billingPeriod: '01/05 – 31/05/2026',
  },
  {
    id: 'b3-water', code: 'HD-T5-201-WATER', invoiceType: 'water',
    roomId: 'r4', roomName: 'P201', propertyId: 'p1',
    propertyName: 'Nhà Nguyễn Trãi', tenantId: 'u3', tenantName: 'Phạm Văn C', tenantPhone: '0901111003',
    month: 5, year: 2026,
    items: [{ label: 'Nước (15 m³ × 20.000đ)', amount: 300000 }],
    totalAmount: 300000, lateFee: 3000, grandTotal: 303000,
    status: 'overdue', dueDate: '2026-05-20', createdAt: '2026-05-05', daysOverdue: 1,
    m3Used: 15, waterRate: 20000, billingPeriod: '01/05 – 31/05/2026',
  },

  // ── P301 · Ngô Thị D · Tháng 5 ───────────────────────────
  {
    id: 'b4-rent', code: 'HD-T5-301-RENT', invoiceType: 'rent',
    roomId: 'r9', roomName: 'P301', propertyId: 'p1',
    propertyName: 'Nhà Nguyễn Trãi', tenantId: 'u4', tenantName: 'Ngô Thị D', tenantPhone: '0901111004',
    month: 5, year: 2026,
    items: [{ label: 'Tiền phòng', amount: 3500000 }],
    totalAmount: 3500000, lateFee: 0, grandTotal: 3500000,
    status: 'pending', dueDate: '2026-05-15', createdAt: '2026-05-01',
  },
  {
    id: 'b4-elec', code: 'HD-T5-301-ELEC', invoiceType: 'electricity',
    roomId: 'r9', roomName: 'P301', propertyId: 'p1',
    propertyName: 'Nhà Nguyễn Trãi', tenantId: 'u4', tenantName: 'Ngô Thị D', tenantPhone: '0901111004',
    month: 5, year: 2026,
    items: [{ label: 'Điện (110 kWh × 3.500đ)', amount: 385000 }],
    totalAmount: 385000, lateFee: 0, grandTotal: 385000,
    status: 'pending', dueDate: '2026-05-20', createdAt: '2026-05-05',
    kwhUsed: 110, electricityRate: 3500, billingPeriod: '01/05 – 31/05/2026',
  },
  {
    id: 'b4-water', code: 'HD-T5-301-WATER', invoiceType: 'water',
    roomId: 'r9', roomName: 'P301', propertyId: 'p1',
    propertyName: 'Nhà Nguyễn Trãi', tenantId: 'u4', tenantName: 'Ngô Thị D', tenantPhone: '0901111004',
    month: 5, year: 2026,
    items: [{ label: 'Nước (11 m³ × 20.000đ)', amount: 220000 }],
    totalAmount: 220000, lateFee: 0, grandTotal: 220000,
    status: 'pending', dueDate: '2026-05-20', createdAt: '2026-05-05',
    m3Used: 11, waterRate: 20000, billingPeriod: '01/05 – 31/05/2026',
  },

  // ── Nhà CMT8 P101 · Bùi Văn H · Tháng 5 ─────────────────
  {
    id: 'b5-rent', code: 'HD-T5-CMT-101-RENT', invoiceType: 'rent',
    roomId: 'r10', roomName: 'P101', propertyId: 'p3',
    propertyName: 'Nhà CMT8', tenantId: 'u5', tenantName: 'Bùi Văn H', tenantPhone: '0901111008',
    month: 5, year: 2026,
    items: [{ label: 'Tiền phòng', amount: 4000000 }],
    totalAmount: 4000000, lateFee: 0, grandTotal: 4000000,
    status: 'pending', dueDate: '2026-05-15', createdAt: '2026-05-01',
  },
  {
    id: 'b5-elec', code: 'HD-T5-CMT-101-ELEC', invoiceType: 'electricity',
    roomId: 'r10', roomName: 'P101', propertyId: 'p3',
    propertyName: 'Nhà CMT8', tenantId: 'u5', tenantName: 'Bùi Văn H', tenantPhone: '0901111008',
    month: 5, year: 2026,
    items: [{ label: 'Điện (150 kWh × 3.500đ)', amount: 525000 }],
    totalAmount: 525000, lateFee: 0, grandTotal: 525000,
    status: 'pending', dueDate: '2026-05-20', createdAt: '2026-05-05',
    kwhUsed: 150, electricityRate: 3500, billingPeriod: '01/05 – 31/05/2026',
  },
  {
    id: 'b5-water', code: 'HD-T5-CMT-101-WATER', invoiceType: 'water',
    roomId: 'r10', roomName: 'P101', propertyId: 'p3',
    propertyName: 'Nhà CMT8', tenantId: 'u5', tenantName: 'Bùi Văn H', tenantPhone: '0901111008',
    month: 5, year: 2026,
    items: [{ label: 'Nước (16 m³ × 20.000đ)', amount: 320000 }],
    totalAmount: 320000, lateFee: 0, grandTotal: 320000,
    status: 'pending', dueDate: '2026-05-20', createdAt: '2026-05-05',
    m3Used: 16, waterRate: 20000, billingPeriod: '01/05 – 31/05/2026',
  },

  // ── P201 · Phạm Văn C · Tháng 4 (quá hạn) ───────────────
  {
    id: 'b6-rent', code: 'HD-T4-201-RENT', invoiceType: 'rent',
    roomId: 'r4', roomName: 'P201', propertyId: 'p1',
    propertyName: 'Nhà Nguyễn Trãi', tenantId: 'u3', tenantName: 'Phạm Văn C', tenantPhone: '0901111003',
    month: 4, year: 2026,
    items: [{ label: 'Tiền phòng', amount: 3800000 }],
    totalAmount: 3800000, lateFee: 38000, grandTotal: 3838000,
    status: 'overdue', dueDate: '2026-04-15', createdAt: '2026-04-01', daysOverdue: 31,
  },
  {
    id: 'b6-elec', code: 'HD-T4-201-ELEC', invoiceType: 'electricity',
    roomId: 'r4', roomName: 'P201', propertyId: 'p1',
    propertyName: 'Nhà Nguyễn Trãi', tenantId: 'u3', tenantName: 'Phạm Văn C', tenantPhone: '0901111003',
    month: 4, year: 2026,
    items: [{ label: 'Điện (140 kWh × 3.500đ)', amount: 490000 }],
    totalAmount: 490000, lateFee: 4900, grandTotal: 494900,
    status: 'overdue', dueDate: '2026-04-20', createdAt: '2026-04-05', daysOverdue: 31,
    kwhUsed: 140, electricityRate: 3500, billingPeriod: '01/04 – 30/04/2026',
  },
  {
    id: 'b6-water', code: 'HD-T4-201-WATER', invoiceType: 'water',
    roomId: 'r4', roomName: 'P201', propertyId: 'p1',
    propertyName: 'Nhà Nguyễn Trãi', tenantId: 'u3', tenantName: 'Phạm Văn C', tenantPhone: '0901111003',
    month: 4, year: 2026,
    items: [{ label: 'Nước (14 m³ × 20.000đ)', amount: 280000 }],
    totalAmount: 280000, lateFee: 2800, grandTotal: 282800,
    status: 'overdue', dueDate: '2026-04-20', createdAt: '2026-04-05', daysOverdue: 31,
    m3Used: 14, waterRate: 20000, billingPeriod: '01/04 – 30/04/2026',
  },

  // ── Nhà nguyên căn · Gia đình anh Minh · Tháng 5 ─────────
  {
    id: 'b-house-1-rent', code: 'HD-NVC-T5-RENT', invoiceType: 'rent', propertyType: 'WHOLE_HOUSE',
    roomId: 'house-1', roomName: 'Nhà nguyên căn', propertyId: 'house-1',
    propertyName: 'Nhà Nguyễn Văn Cừ', tenantId: 'wh-t1', tenantName: 'Gia đình anh Minh', tenantPhone: '0909111222',
    month: 5, year: 2026,
    items: [{ label: 'Tiền thuê nhà', amount: 12000000 }, { label: 'Giảm trừ', amount: -200000 }],
    totalAmount: 11800000, lateFee: 0, grandTotal: 11800000,
    status: 'pending', dueDate: '2026-05-15', createdAt: '2026-05-01',
  },
  {
    id: 'b-house-1-elec', code: 'HD-NVC-T5-ELEC', invoiceType: 'electricity', propertyType: 'WHOLE_HOUSE',
    roomId: 'house-1', roomName: 'Nhà nguyên căn', propertyId: 'house-1',
    propertyName: 'Nhà Nguyễn Văn Cừ', tenantId: 'wh-t1', tenantName: 'Gia đình anh Minh', tenantPhone: '0909111222',
    month: 5, year: 2026,
    items: [{ label: 'Điện (260 kWh × 3.500đ)', amount: 910000 }],
    totalAmount: 910000, lateFee: 0, grandTotal: 910000,
    status: 'pending', dueDate: '2026-05-20', createdAt: '2026-05-05',
    kwhUsed: 260, electricityRate: 3500, billingPeriod: '01/05 – 31/05/2026',
  },
  {
    id: 'b-house-1-water', code: 'HD-NVC-T5-WATER', invoiceType: 'water', propertyType: 'WHOLE_HOUSE',
    roomId: 'house-1', roomName: 'Nhà nguyên căn', propertyId: 'house-1',
    propertyName: 'Nhà Nguyễn Văn Cừ', tenantId: 'wh-t1', tenantName: 'Gia đình anh Minh', tenantPhone: '0909111222',
    month: 5, year: 2026,
    items: [{ label: 'Nước (22 m³ × 15.000đ)', amount: 330000 }],
    totalAmount: 330000, lateFee: 0, grandTotal: 330000,
    status: 'pending', dueDate: '2026-05-20', createdAt: '2026-05-05',
    m3Used: 22, waterRate: 15000, billingPeriod: '01/05 – 31/05/2026',
  },

  // ── Nhà Trần Hưng Đạo · Công ty An Phú · Tháng 5 ─────────
  {
    id: 'b-house-3-rent', code: 'HD-THD-T5-RENT', invoiceType: 'rent', propertyType: 'WHOLE_HOUSE',
    roomId: 'house-3', roomName: 'Nhà nguyên căn', propertyId: 'house-3',
    propertyName: 'Nhà Trần Hưng Đạo', tenantId: 'wh-t3', tenantName: 'Công ty An Phú', tenantPhone: '0912222333',
    month: 5, year: 2026,
    items: [{ label: 'Tiền thuê nhà', amount: 18000000 }, { label: 'Phí phát sinh', amount: 350000 }],
    totalAmount: 18350000, lateFee: 0, grandTotal: 18350000,
    status: 'paid', dueDate: '2026-05-15', paidAt: '2026-05-05',
    paidAmount: 18350000, paymentMethod: 'bank_transfer', transactionId: 'WH-THD-RENT-0526',
    createdAt: '2026-05-01',
  },
  {
    id: 'b-house-3-elec', code: 'HD-THD-T5-ELEC', invoiceType: 'electricity', propertyType: 'WHOLE_HOUSE',
    roomId: 'house-3', roomName: 'Nhà nguyên căn', propertyId: 'house-3',
    propertyName: 'Nhà Trần Hưng Đạo', tenantId: 'wh-t3', tenantName: 'Công ty An Phú', tenantPhone: '0912222333',
    month: 5, year: 2026,
    items: [{ label: 'Điện (420 kWh × 3.500đ)', amount: 1470000 }],
    totalAmount: 1470000, lateFee: 0, grandTotal: 1470000,
    status: 'paid', dueDate: '2026-05-20', paidAt: '2026-05-07',
    paidAmount: 1470000, paymentMethod: 'bank_transfer', transactionId: 'WH-THD-ELEC-0526',
    createdAt: '2026-05-05',
    kwhUsed: 420, electricityRate: 3500, billingPeriod: '01/05 – 31/05/2026',
  },
  {
    id: 'b-house-3-water', code: 'HD-THD-T5-WATER', invoiceType: 'water', propertyType: 'WHOLE_HOUSE',
    roomId: 'house-3', roomName: 'Nhà nguyên căn', propertyId: 'house-3',
    propertyName: 'Nhà Trần Hưng Đạo', tenantId: 'wh-t3', tenantName: 'Công ty An Phú', tenantPhone: '0912222333',
    month: 5, year: 2026,
    items: [{ label: 'Nước (35 m³ × 15.000đ)', amount: 525000 }],
    totalAmount: 525000, lateFee: 0, grandTotal: 525000,
    status: 'paid', dueDate: '2026-05-20', paidAt: '2026-05-07',
    paidAmount: 525000, paymentMethod: 'bank_transfer', transactionId: 'WH-THD-WATER-0526',
    createdAt: '2026-05-05',
    m3Used: 35, waterRate: 15000, billingPeriod: '01/05 – 31/05/2026',
  },
];

// Tenant view — Nguyễn Văn A — 3 separate invoice types
const TENANT_SEED: SharedBill[] = [
  // Tháng 5
  {
    id: 'inv1-rent', code: 'INV-T5-201-RENT', invoiceType: 'rent',
    roomId: 'rt1', roomName: 'Phòng 201', propertyId: 'pt1',
    propertyName: 'Nhà trọ Quận 5', tenantId: 't1', tenantName: 'Nguyễn Văn A', tenantPhone: '0901234567',
    month: 5, year: 2026,
    items: [{ label: 'Tiền thuê phòng', amount: 3000000 }, { label: 'Phí dịch vụ', amount: 150000 }],
    totalAmount: 3150000, lateFee: 0, grandTotal: 3150000,
    status: 'pending', dueDate: '2026-05-15', createdAt: '2026-04-29',
  },
  {
    id: 'inv1-elec', code: 'INV-T5-201-ELEC', invoiceType: 'electricity',
    roomId: 'rt1', roomName: 'Phòng 201', propertyId: 'pt1',
    propertyName: 'Nhà trọ Quận 5', tenantId: 't1', tenantName: 'Nguyễn Văn A', tenantPhone: '0901234567',
    month: 5, year: 2026,
    items: [{ label: 'Điện (150 kWh × 3.500đ)', amount: 525000 }],
    totalAmount: 525000, lateFee: 0, grandTotal: 525000,
    status: 'pending', dueDate: '2026-05-20', createdAt: '2026-05-03',
    kwhUsed: 150, electricityRate: 3500, billingPeriod: '01/05 – 31/05/2026',
  },
  {
    id: 'inv1-water', code: 'INV-T5-201-WATER', invoiceType: 'water',
    roomId: 'rt1', roomName: 'Phòng 201', propertyId: 'pt1',
    propertyName: 'Nhà trọ Quận 5', tenantId: 't1', tenantName: 'Nguyễn Văn A', tenantPhone: '0901234567',
    month: 5, year: 2026,
    items: [{ label: 'Nước (12 m³ × 15.000đ)', amount: 180000 }],
    totalAmount: 180000, lateFee: 0, grandTotal: 180000,
    status: 'pending', dueDate: '2026-05-20', createdAt: '2026-05-03',
    m3Used: 12, waterRate: 15000, billingPeriod: '01/05 – 31/05/2026',
  },

  // Tháng 4 (đã thanh toán)
  {
    id: 'inv2-rent', code: 'INV-T4-201-RENT', invoiceType: 'rent',
    roomId: 'rt1', roomName: 'Phòng 201', propertyId: 'pt1',
    propertyName: 'Nhà trọ Quận 5', tenantId: 't1', tenantName: 'Nguyễn Văn A', tenantPhone: '0901234567',
    month: 4, year: 2026,
    items: [{ label: 'Tiền thuê phòng', amount: 3000000 }, { label: 'Phí dịch vụ', amount: 150000 }],
    totalAmount: 3150000, lateFee: 0, grandTotal: 3150000,
    status: 'paid', dueDate: '2026-04-15', paidAt: '2026-04-10', createdAt: '2026-03-29',
    paymentMethod: 'qr', transactionId: 'TXN-2026-04-RENT',
  },
  {
    id: 'inv2-elec', code: 'INV-T4-201-ELEC', invoiceType: 'electricity',
    roomId: 'rt1', roomName: 'Phòng 201', propertyId: 'pt1',
    propertyName: 'Nhà trọ Quận 5', tenantId: 't1', tenantName: 'Nguyễn Văn A', tenantPhone: '0901234567',
    month: 4, year: 2026,
    items: [{ label: 'Điện (130 kWh × 3.500đ)', amount: 455000 }],
    totalAmount: 455000, lateFee: 0, grandTotal: 455000,
    status: 'paid', dueDate: '2026-04-20', paidAt: '2026-04-14', createdAt: '2026-04-03',
    paymentMethod: 'qr', transactionId: 'TXN-2026-04-ELEC',
    kwhUsed: 130, electricityRate: 3500, billingPeriod: '01/04 – 30/04/2026',
  },
  {
    id: 'inv2-water', code: 'INV-T4-201-WATER', invoiceType: 'water',
    roomId: 'rt1', roomName: 'Phòng 201', propertyId: 'pt1',
    propertyName: 'Nhà trọ Quận 5', tenantId: 't1', tenantName: 'Nguyễn Văn A', tenantPhone: '0901234567',
    month: 4, year: 2026,
    items: [{ label: 'Nước (10 m³ × 15.000đ)', amount: 150000 }],
    totalAmount: 150000, lateFee: 0, grandTotal: 150000,
    status: 'paid', dueDate: '2026-04-20', paidAt: '2026-04-14', createdAt: '2026-04-03',
    paymentMethod: 'qr', transactionId: 'TXN-2026-04-WATER',
    m3Used: 10, waterRate: 15000, billingPeriod: '01/04 – 30/04/2026',
  },

  // Tháng 3 (quá hạn)
  {
    id: 'inv3-rent', code: 'INV-T3-201-RENT', invoiceType: 'rent',
    roomId: 'rt1', roomName: 'Phòng 201', propertyId: 'pt1',
    propertyName: 'Nhà trọ Quận 5', tenantId: 't1', tenantName: 'Nguyễn Văn A', tenantPhone: '0901234567',
    month: 3, year: 2026,
    items: [{ label: 'Tiền thuê phòng', amount: 3000000 }, { label: 'Phí dịch vụ', amount: 150000 }],
    totalAmount: 3150000, lateFee: 50000, grandTotal: 3200000,
    status: 'overdue', dueDate: '2026-03-15', createdAt: '2026-02-28',
  },
  {
    id: 'inv3-elec', code: 'INV-T3-201-ELEC', invoiceType: 'electricity',
    roomId: 'rt1', roomName: 'Phòng 201', propertyId: 'pt1',
    propertyName: 'Nhà trọ Quận 5', tenantId: 't1', tenantName: 'Nguyễn Văn A', tenantPhone: '0901234567',
    month: 3, year: 2026,
    items: [{ label: 'Điện (140 kWh × 3.500đ)', amount: 490000 }],
    totalAmount: 490000, lateFee: 10000, grandTotal: 500000,
    status: 'overdue', dueDate: '2026-03-20', createdAt: '2026-03-03',
    kwhUsed: 140, electricityRate: 3500, billingPeriod: '01/03 – 31/03/2026',
  },
  {
    id: 'inv3-water', code: 'INV-T3-201-WATER', invoiceType: 'water',
    roomId: 'rt1', roomName: 'Phòng 201', propertyId: 'pt1',
    propertyName: 'Nhà trọ Quận 5', tenantId: 't1', tenantName: 'Nguyễn Văn A', tenantPhone: '0901234567',
    month: 3, year: 2026,
    items: [{ label: 'Nước (11 m³ × 15.000đ)', amount: 165000 }],
    totalAmount: 165000, lateFee: 5000, grandTotal: 170000,
    status: 'overdue', dueDate: '2026-03-20', createdAt: '2026-03-03',
    m3Used: 11, waterRate: 15000, billingPeriod: '01/03 – 31/03/2026',
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
  getAll() { return [..._bills]; },
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

export function useBillsByType(type: InvoiceType, tenantName?: string): SharedBill[] {
  const bills = useBills(tenantName);
  return bills.filter(b => b.invoiceType === type);
}
