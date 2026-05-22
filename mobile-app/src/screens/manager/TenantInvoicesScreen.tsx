import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ScrollView, Modal, Dimensions, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';

const SH = Dimensions.get('window').height;
const TODAY = new Date(2026, 4, 21);

// ── Types ──────────────────────────────────────────────────────────────
type InvoiceStatus = 'pending' | 'paid' | 'overdue';
type FilterKey = 'all' | InvoiceStatus;

interface TenantInvoice {
  id: string;
  tenantId: string;
  code: string;
  billingMonth: string;
  dueDate: string;
  status: InvoiceStatus;
  rentFee: number;
  electricFee: number;
  electricDetail: string;
  waterFee: number;
  waterDetail: string;
  serviceFee: number;
  discount: number;
  depositDeduction: number;
  total: number;
  paymentDate?: string;
  paymentMethod?: string;
  propertyName: string;
  roomName: string;
  lateFeeDays?: number;
  lateFeeAmount?: number;
}

// ── Mock invoice data (all tenants, filtered by tenantId at runtime) ───
const MOCK_INVOICES: TenantInvoice[] = [
  // Trần Văn A — 1 overdue
  {
    id: 'inv-t1-may', tenantId: 't1', code: 'HD-NT-P101-0526',
    billingMonth: '05/2026', dueDate: '15/05/2026', status: 'overdue',
    rentFee: 3500000, electricFee: 455000, electricDetail: '130 kWh × 3.500đ/kWh',
    waterFee: 97500, waterDetail: '6,5 m³ × 15.000đ/m³',
    serviceFee: 300000, discount: 0, depositDeduction: 0,
    total: 4352500, propertyName: 'Nhà Nguyễn Trãi', roomName: 'P101',
    lateFeeDays: 6, lateFeeAmount: 43525,
  },
  {
    id: 'inv-t1-apr', tenantId: 't1', code: 'HD-NT-P101-0426',
    billingMonth: '04/2026', dueDate: '15/04/2026', status: 'paid',
    rentFee: 3500000, electricFee: 423500, electricDetail: '121 kWh × 3.500đ/kWh',
    waterFee: 90000, waterDetail: '6 m³ × 15.000đ/m³',
    serviceFee: 300000, discount: 0, depositDeduction: 0,
    total: 4313500, paymentDate: '12/04/2026', paymentMethod: 'Chuyển khoản',
    propertyName: 'Nhà Nguyễn Trãi', roomName: 'P101',
  },
  {
    id: 'inv-t1-mar', tenantId: 't1', code: 'HD-NT-P101-0326',
    billingMonth: '03/2026', dueDate: '15/03/2026', status: 'paid',
    rentFee: 3500000, electricFee: 406000, electricDetail: '116 kWh × 3.500đ/kWh',
    waterFee: 82500, waterDetail: '5,5 m³ × 15.000đ/m³',
    serviceFee: 300000, discount: 50000, depositDeduction: 0,
    total: 4238500, paymentDate: '10/03/2026', paymentMethod: 'Tiền mặt',
    propertyName: 'Nhà Nguyễn Trãi', roomName: 'P101',
  },
  // Lê Thị B — all paid
  {
    id: 'inv-t2-may', tenantId: 't2', code: 'HD-NT-P102-0526',
    billingMonth: '05/2026', dueDate: '15/05/2026', status: 'paid',
    rentFee: 3200000, electricFee: 392000, electricDetail: '112 kWh × 3.500đ/kWh',
    waterFee: 75000, waterDetail: '5 m³ × 15.000đ/m³',
    serviceFee: 300000, discount: 0, depositDeduction: 0,
    total: 3967000, paymentDate: '08/05/2026', paymentMethod: 'VietQR',
    propertyName: 'Nhà Nguyễn Trãi', roomName: 'P102',
  },
  {
    id: 'inv-t2-apr', tenantId: 't2', code: 'HD-NT-P102-0426',
    billingMonth: '04/2026', dueDate: '15/04/2026', status: 'paid',
    rentFee: 3200000, electricFee: 371000, electricDetail: '106 kWh × 3.500đ/kWh',
    waterFee: 67500, waterDetail: '4,5 m³ × 15.000đ/m³',
    serviceFee: 300000, discount: 0, depositDeduction: 0,
    total: 3938500, paymentDate: '14/04/2026', paymentMethod: 'Chuyển khoản',
    propertyName: 'Nhà Nguyễn Trãi', roomName: 'P102',
  },
  // Phạm Văn C — 2 overdue
  {
    id: 'inv-t3-may', tenantId: 't3', code: 'HD-NT-P201-0526',
    billingMonth: '05/2026', dueDate: '15/05/2026', status: 'overdue',
    rentFee: 3800000, electricFee: 518000, electricDetail: '148 kWh × 3.500đ/kWh',
    waterFee: 112500, waterDetail: '7,5 m³ × 15.000đ/m³',
    serviceFee: 300000, discount: 0, depositDeduction: 0,
    total: 4730500, propertyName: 'Nhà Nguyễn Trãi', roomName: 'P201',
    lateFeeDays: 6, lateFeeAmount: 47305,
  },
  {
    id: 'inv-t3-apr', tenantId: 't3', code: 'HD-NT-P201-0426',
    billingMonth: '04/2026', dueDate: '15/04/2026', status: 'overdue',
    rentFee: 3800000, electricFee: 493500, electricDetail: '141 kWh × 3.500đ/kWh',
    waterFee: 97500, waterDetail: '6,5 m³ × 15.000đ/m³',
    serviceFee: 300000, discount: 0, depositDeduction: 0,
    total: 4690500, propertyName: 'Nhà Nguyễn Trãi', roomName: 'P201',
    lateFeeDays: 36, lateFeeAmount: 140715,
  },
  {
    id: 'inv-t3-mar', tenantId: 't3', code: 'HD-NT-P201-0326',
    billingMonth: '03/2026', dueDate: '15/03/2026', status: 'paid',
    rentFee: 3800000, electricFee: 469000, electricDetail: '134 kWh × 3.500đ/kWh',
    waterFee: 82500, waterDetail: '5,5 m³ × 15.000đ/m³',
    serviceFee: 300000, discount: 100000, depositDeduction: 0,
    total: 4551500, paymentDate: '13/03/2026', paymentMethod: 'Chuyển khoản',
    propertyName: 'Nhà Nguyễn Trãi', roomName: 'P201',
  },
  // Ngô Thị D — 1 overdue
  {
    id: 'inv-t4-may', tenantId: 't4', code: 'HD-NT-P301-0526',
    billingMonth: '05/2026', dueDate: '15/05/2026', status: 'overdue',
    rentFee: 3500000, electricFee: 385000, electricDetail: '110 kWh × 3.500đ/kWh',
    waterFee: 120000, waterDetail: '8 m³ × 15.000đ/m³',
    serviceFee: 100000, discount: 0, depositDeduction: 0,
    total: 4105000, propertyName: 'Nhà Nguyễn Trãi', roomName: 'P301',
    lateFeeDays: 6, lateFeeAmount: 41050,
  },
  {
    id: 'inv-t4-apr', tenantId: 't4', code: 'HD-NT-P301-0426',
    billingMonth: '04/2026', dueDate: '15/04/2026', status: 'paid',
    rentFee: 3500000, electricFee: 360500, electricDetail: '103 kWh × 3.500đ/kWh',
    waterFee: 105000, waterDetail: '7 m³ × 15.000đ/m³',
    serviceFee: 100000, discount: 0, depositDeduction: 0,
    total: 4065500, paymentDate: '15/04/2026', paymentMethod: 'Chuyển khoản',
    propertyName: 'Nhà Nguyễn Trãi', roomName: 'P301',
  },
  // Bùi Văn H — 1 overdue
  {
    id: 'inv-t8-may', tenantId: 't8', code: 'HD-CMT8-P101-0526',
    billingMonth: '05/2026', dueDate: '15/05/2026', status: 'overdue',
    rentFee: 4000000, electricFee: 539000, electricDetail: '154 kWh × 3.500đ/kWh',
    waterFee: 106000, waterDetail: '7 m³ × 15.000đ/m³',
    serviceFee: 200000, discount: 0, depositDeduction: 0,
    total: 4845000, propertyName: 'Nhà CMT8', roomName: 'P101',
    lateFeeDays: 6, lateFeeAmount: 48450,
  },
  {
    id: 'inv-t8-apr', tenantId: 't8', code: 'HD-CMT8-P101-0426',
    billingMonth: '04/2026', dueDate: '15/04/2026', status: 'paid',
    rentFee: 4000000, electricFee: 511000, electricDetail: '146 kWh × 3.500đ/kWh',
    waterFee: 97500, waterDetail: '6,5 m³ × 15.000đ/m³',
    serviceFee: 200000, discount: 0, depositDeduction: 0,
    total: 4808500, paymentDate: '10/04/2026', paymentMethod: 'VietQR',
    propertyName: 'Nhà CMT8', roomName: 'P101',
  },
  // Cao Thị I — all paid
  {
    id: 'inv-t9-may', tenantId: 't9', code: 'HD-CMT8-P102-0526',
    billingMonth: '05/2026', dueDate: '15/05/2026', status: 'paid',
    rentFee: 3800000, electricFee: 406000, electricDetail: '116 kWh × 3.500đ/kWh',
    waterFee: 90000, waterDetail: '6 m³ × 15.000đ/m³',
    serviceFee: 200000, discount: 0, depositDeduction: 0,
    total: 4496000, paymentDate: '05/05/2026', paymentMethod: 'Chuyển khoản',
    propertyName: 'Nhà CMT8', roomName: 'P102',
  },
  // Gia đình anh Minh — 1 overdue (whole house)
  {
    id: 'inv-wh1-may', tenantId: 'wh-1', code: 'HD-NVC-0526',
    billingMonth: '05/2026', dueDate: '15/05/2026', status: 'overdue',
    rentFee: 12000000, electricFee: 647500, electricDetail: '185 kWh × 3.500đ/kWh',
    waterFee: 242500, waterDetail: '16 m³ × 15.000đ/m³ + phí cơ bản',
    serviceFee: 150000, discount: 0, depositDeduction: 0,
    total: 13040000, propertyName: 'Nhà Nguyễn Văn Cừ', roomName: 'Nhà nguyên căn',
    lateFeeDays: 6, lateFeeAmount: 130400,
  },
  {
    id: 'inv-wh1-apr', tenantId: 'wh-1', code: 'HD-NVC-0426',
    billingMonth: '04/2026', dueDate: '15/04/2026', status: 'paid',
    rentFee: 12000000, electricFee: 612500, electricDetail: '175 kWh × 3.500đ/kWh',
    waterFee: 225000, waterDetail: '15 m³ × 15.000đ/m³',
    serviceFee: 150000, discount: 0, depositDeduction: 0,
    total: 12987500, paymentDate: '13/04/2026', paymentMethod: 'Chuyển khoản',
    propertyName: 'Nhà Nguyễn Văn Cừ', roomName: 'Nhà nguyên căn',
  },
  // Công ty An Phú — all paid
  {
    id: 'inv-wh3-may', tenantId: 'wh-3', code: 'HD-THD-0526',
    billingMonth: '05/2026', dueDate: '15/05/2026', status: 'paid',
    rentFee: 18000000, electricFee: 875000, electricDetail: '250 kWh × 3.500đ/kWh',
    waterFee: 300000, waterDetail: '20 m³ × 15.000đ/m³',
    serviceFee: 500000, discount: 0, depositDeduction: 0,
    total: 19675000, paymentDate: '01/05/2026', paymentMethod: 'Chuyển khoản',
    propertyName: 'Nhà Trần Hưng Đạo', roomName: 'Nhà nguyên căn',
  },
];

// ── Config ──────────────────────────────────────────────────────────────
const STATUS_CFG: Record<InvoiceStatus, { label: string; color: string; bg: string }> = {
  overdue: { label: 'Quá hạn', color: '#DC2626', bg: '#FEE2E2' },
  pending: { label: 'Chưa thanh toán', color: '#D97706', bg: '#FEF3C7' },
  paid:    { label: 'Đã thanh toán',   color: '#16A34A', bg: '#F0FDF4' },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',     label: 'Tất cả' },
  { key: 'overdue', label: 'Quá hạn' },
  { key: 'pending', label: 'Chưa TT' },
  { key: 'paid',    label: 'Đã thanh toán' },
];

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

// ── Invoice Detail Modal ────────────────────────────────────────────────
const InvoiceDetailModal: React.FC<{
  invoice: TenantInvoice;
  tenantName: string;
  onClose: () => void;
}> = ({ invoice, tenantName, onClose }) => {
  const cfg = STATUS_CFG[invoice.status];
  const subtotal = invoice.rentFee + invoice.electricFee + invoice.waterFee + invoice.serviceFee;
  const isUnpaid = invoice.status !== 'paid';

  const handlePay = () => {
    Alert.alert(
      'Xác nhận thanh toán',
      `Hóa đơn ${invoice.code}\nTổng tiền: ${fmt(invoice.total)}\n\nThao tác này sẽ ghi nhận thanh toán cho hóa đơn tháng ${invoice.billingMonth}.`,
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Xác nhận đã thu', style: 'default', onPress: onClose },
      ],
    );
  };

  return (
    <Modal transparent animationType="slide">
      <View style={ds.overlay}>
        <View style={ds.sheet}>
          <View style={ds.handle} />
          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={ds.content}
          >
            {/* Header */}
            <View style={ds.header}>
              <View style={ds.headerLeft}>
                <Text style={ds.invoiceCode}>{invoice.code}</Text>
                <Text style={ds.invoicePeriod}>Kỳ {invoice.billingMonth}</Text>
              </View>
              <View style={ds.headerRight}>
                <View style={[ds.statusBadge, { backgroundColor: cfg.bg }]}>
                  <Text style={[ds.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
                <TouchableOpacity onPress={onClose} style={ds.closeBtn}>
                  <Text style={ds.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Tenant info */}
            <View style={ds.section}>
              <Text style={ds.sectionTitle}>Khách thuê</Text>
              <View style={ds.infoRow}>
                <Text style={ds.infoLabel}>Tên</Text>
                <Text style={ds.infoVal}>{tenantName}</Text>
              </View>
              <View style={ds.infoRow}>
                <Text style={ds.infoLabel}>Phòng / Nhà</Text>
                <Text style={ds.infoVal}>{invoice.roomName} · {invoice.propertyName}</Text>
              </View>
              <View style={ds.infoRow}>
                <Text style={ds.infoLabel}>Hạn thanh toán</Text>
                <Text style={[ds.infoVal, isUnpaid && { color: '#DC2626', fontWeight: '700' }]}>
                  {invoice.dueDate}
                </Text>
              </View>
            </View>

            {/* Overdue warning */}
            {invoice.status === 'overdue' && invoice.lateFeeDays && (
              <View style={ds.overdueBox}>
                <Text style={ds.overdueText}>
                  ⚠️ Quá hạn {invoice.lateFeeDays} ngày · Phạt trễ hạn: {fmt(invoice.lateFeeAmount || 0)}
                </Text>
              </View>
            )}

            {/* Line items */}
            <View style={ds.section}>
              <Text style={ds.sectionTitle}>Chi tiết hóa đơn</Text>
              <LineItem label="Tiền thuê phòng" amount={invoice.rentFee} />
              <LineItem label="Tiền điện" amount={invoice.electricFee} detail={invoice.electricDetail} />
              <LineItem label="Tiền nước" amount={invoice.waterFee} detail={invoice.waterDetail} />
              {invoice.serviceFee > 0 && (
                <LineItem label="Phí dịch vụ" amount={invoice.serviceFee} />
              )}
              {subtotal !== invoice.total - invoice.discount + invoice.depositDeduction ? null : (
                <View style={ds.subtotalRow}>
                  <Text style={ds.subtotalLabel}>Tạm tính</Text>
                  <Text style={ds.subtotalVal}>{fmt(subtotal)}</Text>
                </View>
              )}
              {invoice.discount > 0 && (
                <LineItem label="Giảm giá" amount={-invoice.discount} isDiscount />
              )}
              {invoice.depositDeduction > 0 && (
                <LineItem label="Trừ tiền cọc" amount={-invoice.depositDeduction} isDiscount />
              )}
            </View>

            {/* Total */}
            <View style={ds.totalBox}>
              <Text style={ds.totalLabel}>Tổng thanh toán</Text>
              <Text style={[ds.totalAmount, { color: isUnpaid ? '#DC2626' : '#16A34A' }]}>
                {fmt(invoice.total)}
              </Text>
            </View>

            {/* Payment info */}
            {invoice.status === 'paid' && (
              <View style={ds.paidBox}>
                <Text style={ds.paidIcon}>✓</Text>
                <View>
                  <Text style={ds.paidTitle}>Đã thanh toán</Text>
                  <Text style={ds.paidSub}>
                    {invoice.paymentDate} · {invoice.paymentMethod}
                  </Text>
                </View>
              </View>
            )}

            {/* Pay action */}
            {isUnpaid && (
              <TouchableOpacity style={ds.payBtn} onPress={handlePay}>
                <Text style={ds.payBtnText}>Xác nhận đã thu tiền</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const LineItem: React.FC<{
  label: string;
  amount: number;
  detail?: string;
  isDiscount?: boolean;
}> = ({ label, amount, detail, isDiscount }) => (
  <View style={ds.lineItem}>
    <View style={ds.lineItemLeft}>
      <Text style={ds.lineItemLabel}>{label}</Text>
      {detail && <Text style={ds.lineItemDetail}>{detail}</Text>}
    </View>
    <Text style={[ds.lineItemAmount, isDiscount && { color: '#16A34A' }]}>
      {isDiscount && amount < 0 ? '-' : ''}{fmt(Math.abs(amount))}
    </Text>
  </View>
);

const ds = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: SH * 0.92,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0',
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  content: { paddingHorizontal: Spacing.xl, paddingBottom: 44, paddingTop: Spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  headerLeft: { flex: 1 },
  headerRight: { alignItems: 'flex-end', gap: 8 },
  invoiceCode: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  invoicePeriod: { fontSize: 13, color: '#64748B', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 12, fontWeight: '700' },
  closeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 12, color: '#64748B', fontWeight: '700' },

  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: Spacing.sm },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  infoLabel: { fontSize: 14, color: '#64748B' },
  infoVal: { fontSize: 14, fontWeight: '600', color: '#0F172A', textAlign: 'right', flex: 1, marginLeft: 12 },

  overdueBox: { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: Spacing.lg, borderLeftWidth: 3, borderLeftColor: '#EF4444' },
  overdueText: { fontSize: 13, fontWeight: '600', color: '#DC2626' },

  lineItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  lineItemLeft: { flex: 1 },
  lineItemLabel: { fontSize: 14, color: '#0F172A' },
  lineItemDetail: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  lineItemAmount: { fontSize: 14, fontWeight: '600', color: '#0F172A', marginLeft: 12 },

  subtotalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, marginTop: 4 },
  subtotalLabel: { fontSize: 13, color: '#64748B' },
  subtotalVal: { fontSize: 13, color: '#64748B' },

  totalBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, padding: 16, marginBottom: Spacing.md },
  totalLabel: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  totalAmount: { fontSize: 20, fontWeight: '800' },

  paidBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14, marginBottom: Spacing.md },
  paidIcon: { fontSize: 22 },
  paidTitle: { fontSize: 14, fontWeight: '700', color: '#16A34A' },
  paidSub: { fontSize: 12, color: '#64748B', marginTop: 2 },

  payBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', ...Shadow.md },
  payBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});

// ── Invoice Card ─────────────────────────────────────────────────────────
const InvoiceCard: React.FC<{ invoice: TenantInvoice; onPress: () => void }> = ({ invoice, onPress }) => {
  const cfg = STATUS_CFG[invoice.status];
  const isUnpaid = invoice.status !== 'paid';
  return (
    <TouchableOpacity
      style={[cs.card, isUnpaid && cs.cardUnpaid]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Top row */}
      <View style={cs.topRow}>
        <View style={cs.monthBadge}>
          <Text style={cs.monthText}>Tháng</Text>
          <Text style={cs.monthNum}>{invoice.billingMonth.split('/')[0]}</Text>
          <Text style={cs.monthYear}>{invoice.billingMonth.split('/')[1]}</Text>
        </View>
        <View style={cs.topCenter}>
          <Text style={cs.invoiceCode}>{invoice.code}</Text>
          <Text style={cs.roomText}>{invoice.roomName} · {invoice.propertyName}</Text>
        </View>
        <View style={[cs.statusPill, { backgroundColor: cfg.bg }]}>
          <Text style={[cs.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      <View style={cs.divider} />

      {/* Amounts row */}
      <View style={cs.amountsRow}>
        <AmountItem label="Tiền thuê" amount={invoice.rentFee} />
        <AmountItem label="Điện" amount={invoice.electricFee} />
        <AmountItem label="Nước" amount={invoice.waterFee} />
        <AmountItem label="Dịch vụ" amount={invoice.serviceFee} />
      </View>

      <View style={cs.divider} />

      {/* Footer */}
      <View style={cs.footer}>
        <View>
          <Text style={cs.dueLabel}>Hạn TT: {invoice.dueDate}</Text>
          {invoice.status === 'overdue' && invoice.lateFeeDays && (
            <Text style={cs.lateText}>Quá hạn {invoice.lateFeeDays} ngày</Text>
          )}
          {invoice.status === 'paid' && (
            <Text style={cs.paidOnText}>Đã TT {invoice.paymentDate} · {invoice.paymentMethod}</Text>
          )}
        </View>
        <View style={cs.totalBlock}>
          <Text style={cs.totalLabel}>Tổng</Text>
          <Text style={[cs.totalAmt, { color: isUnpaid ? '#DC2626' : '#16A34A' }]}>
            {fmt(invoice.total)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const AmountItem: React.FC<{ label: string; amount: number }> = ({ label, amount }) => (
  <View style={cs.amountItem}>
    <Text style={cs.amountLabel}>{label}</Text>
    <Text style={cs.amountVal}>{(amount / 1000).toFixed(0)}K</Text>
  </View>
);

const cs = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: Spacing.base,
    marginBottom: Spacing.sm,
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  cardUnpaid: { borderWidth: 1, borderColor: '#FCA5A5' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  monthBadge: { width: 48, height: 52, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  monthText: { fontSize: 8, fontWeight: '700', color: '#6366F1', textTransform: 'uppercase', letterSpacing: 0.5 },
  monthNum: { fontSize: 20, fontWeight: '800', color: '#4F46E5', lineHeight: 24 },
  monthYear: { fontSize: 9, color: '#6366F1', fontWeight: '600' },
  topCenter: { flex: 1 },
  invoiceCode: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  roomText: { fontSize: 11, color: '#64748B', marginTop: 2 },
  statusPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 10 },
  amountsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  amountItem: { flex: 1, alignItems: 'center' },
  amountLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '500' },
  amountVal: { fontSize: 13, fontWeight: '700', color: '#334155', marginTop: 2 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  dueLabel: { fontSize: 12, color: '#64748B' },
  lateText: { fontSize: 11, color: '#DC2626', fontWeight: '600', marginTop: 2 },
  paidOnText: { fontSize: 11, color: '#16A34A', marginTop: 2 },
  totalBlock: { alignItems: 'flex-end' },
  totalLabel: { fontSize: 10, color: '#94A3B8', fontWeight: '600', textTransform: 'uppercase' },
  totalAmt: { fontSize: 16, fontWeight: '800' },
});

// ── Tenant Summary Pill ──────────────────────────────────────────────────
const TenantSummaryPill: React.FC<{
  tenantName: string; roomName: string; propertyName: string;
}> = ({ tenantName, roomName, propertyName }) => (
  <View style={ts.pill}>
    <View style={ts.avatar}>
      <Text style={ts.avatarText}>{tenantName.charAt(0)}</Text>
    </View>
    <View>
      <Text style={ts.name}>{tenantName}</Text>
      <Text style={ts.sub}>{propertyName} · {roomName}</Text>
    </View>
  </View>
);

const ts = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#EEF2FF', borderRadius: 12, padding: 12, marginBottom: Spacing.md },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#C7D2FE', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#4F46E5' },
  name: { fontSize: 14, fontWeight: '700', color: '#1E1B4B' },
  sub: { fontSize: 12, color: '#4F46E5', marginTop: 1 },
});

// ── Main Screen ──────────────────────────────────────────────────────────
export const TenantInvoicesScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { tenantId, tenantName, roomId, roomName, propertyId, propertyName, autoOpenFirst } =
    route.params as {
      tenantId: string; tenantName: string; roomId: string; roomName: string;
      propertyId: string; propertyName: string; autoOpenFirst?: boolean;
    };

  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<TenantInvoice | null>(null);

  const allInvoices = useMemo(
    () => MOCK_INVOICES.filter(inv => inv.tenantId === tenantId),
    [tenantId],
  );

  // Sort: overdue → pending → paid, then by billingMonth desc
  const sortedInvoices = useMemo(() => {
    const order: Record<InvoiceStatus, number> = { overdue: 0, pending: 1, paid: 2 };
    return [...allInvoices].sort((a, b) =>
      order[a.status] !== order[b.status]
        ? order[a.status] - order[b.status]
        : b.billingMonth.localeCompare(a.billingMonth),
    );
  }, [allInvoices]);

  const filtered = useMemo(
    () => activeFilter === 'all' ? sortedInvoices : sortedInvoices.filter(i => i.status === activeFilter),
    [sortedInvoices, activeFilter],
  );

  const counts = useMemo(() => ({
    all: allInvoices.length,
    overdue: allInvoices.filter(i => i.status === 'overdue').length,
    pending: allInvoices.filter(i => i.status === 'pending').length,
    paid: allInvoices.filter(i => i.status === 'paid').length,
  }), [allInvoices]);

  const totalUnpaid = useMemo(
    () => allInvoices.filter(i => i.status !== 'paid').reduce((s, i) => s + i.total, 0),
    [allInvoices],
  );

  // Auto-open first unpaid invoice if navigated from unpaid alert banner
  useEffect(() => {
    if (autoOpenFirst) {
      const first = sortedInvoices.find(i => i.status !== 'paid');
      if (first) setSelectedInvoice(first);
    }
  }, [autoOpenFirst, sortedInvoices]);

  return (
    <SafeAreaView style={ss.safe}>
      {/* Header */}
      <View style={ss.header}>
        <TouchableOpacity style={ss.backBtn} onPress={() => navigation.goBack()}>
          <Text style={ss.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={ss.headerCenter}>
          <Text style={ss.title} numberOfLines={1}>Hóa đơn của {tenantName}</Text>
          <Text style={ss.subtitle}>{allInvoices.length} hóa đơn</Text>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={ss.listContent}
        ListHeaderComponent={
          <>
            {/* Tenant pill */}
            <TenantSummaryPill
              tenantName={tenantName}
              roomName={roomName}
              propertyName={propertyName}
            />

            {/* Unpaid summary banner */}
            {totalUnpaid > 0 && (
              <View style={ss.unpaidBanner}>
                <Text style={ss.unpaidBannerIcon}>⚠️</Text>
                <View style={ss.unpaidBannerBody}>
                  <Text style={ss.unpaidBannerTitle}>Công nợ chưa thanh toán</Text>
                  <Text style={ss.unpaidBannerAmount}>{fmt(totalUnpaid)}</Text>
                </View>
                <Text style={ss.unpaidBannerCount}>{counts.overdue + counts.pending} HĐ</Text>
              </View>
            )}

            {/* Filter chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={ss.filterScroll}
              contentContainerStyle={ss.filterContent}
            >
              {FILTERS.map(f => {
                const active = activeFilter === f.key;
                const count = counts[f.key];
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[ss.filterChip, active && ss.filterChipActive]}
                    onPress={() => setActiveFilter(f.key)}
                    activeOpacity={0.75}
                  >
                    <Text style={[ss.filterText, active && ss.filterTextActive]}>{f.label}</Text>
                    <View style={[ss.filterBadge, active && ss.filterBadgeActive]}>
                      <Text style={[ss.filterBadgeText, active && ss.filterBadgeTextActive]}>{count}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        }
        renderItem={({ item }) => (
          <InvoiceCard invoice={item} onPress={() => setSelectedInvoice(item)} />
        )}
        ListEmptyComponent={
          <View style={ss.empty}>
            <Text style={ss.emptyIcon}>🧾</Text>
            <Text style={ss.emptyTitle}>Không có hóa đơn nào</Text>
            <Text style={ss.emptyDesc}>
              {activeFilter === 'all'
                ? 'Khách thuê này chưa có hóa đơn nào.'
                : `Không có hóa đơn "${FILTERS.find(f => f.key === activeFilter)?.label}".`}
            </Text>
          </View>
        }
      />

      {selectedInvoice && (
        <InvoiceDetailModal
          invoice={selectedInvoice}
          tenantName={tenantName}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </SafeAreaView>
  );
};

const ss = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', ...Shadow.sm },
  backBtnText: { fontSize: 28, color: '#0F172A', lineHeight: 32 },
  headerCenter: { flex: 1 },
  title: { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 1 },

  listContent: { paddingHorizontal: Spacing.lg, paddingBottom: 100, paddingTop: Spacing.sm },

  unpaidBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FEF2F2', borderRadius: 14, padding: 14,
    marginBottom: Spacing.md, borderWidth: 1, borderColor: '#FCA5A5',
  },
  unpaidBannerIcon: { fontSize: 22 },
  unpaidBannerBody: { flex: 1 },
  unpaidBannerTitle: { fontSize: 13, fontWeight: '700', color: '#991B1B' },
  unpaidBannerAmount: { fontSize: 16, fontWeight: '800', color: '#DC2626', marginTop: 2 },
  unpaidBannerCount: { fontSize: 13, fontWeight: '700', color: '#EF4444' },

  filterScroll: { flexGrow: 0, marginBottom: Spacing.md },
  filterContent: { flexDirection: 'row', paddingTop: 4, paddingBottom: 4 },
  filterChip: {
    flexShrink: 0, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 999, backgroundColor: '#FFFFFF',
    borderWidth: 1.5, borderColor: '#E2E8F0', marginRight: 8,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  filterTextActive: { color: '#FFFFFF' },
  filterBadge: {
    backgroundColor: '#EEF2FF', borderRadius: 999,
    minWidth: 22, paddingHorizontal: 5, paddingVertical: 2,
    alignItems: 'center', justifyContent: 'center', marginLeft: 6,
  },
  filterBadgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  filterBadgeText: { fontSize: 11, fontWeight: '700', color: '#4F46E5', includeFontPadding: false },
  filterBadgeTextActive: { color: '#FFFFFF' },

  empty: { alignItems: 'center', paddingTop: 64, gap: 8 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#334155' },
  emptyDesc: { fontSize: 13, color: '#94A3B8', textAlign: 'center' },
});
