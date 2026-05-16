import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal,
  Image, Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { Invoice, InvoiceStatus } from '../../types';
import { formatCurrency, formatDate, getInvoiceStatusLabel, getDaysUntil } from '../../utils';

// VietQR — MB Bank
const VIETQR_BANK_BIN = '970422';
const VIETQR_ACCOUNT = '0865803493';
const VIETQR_ACCOUNT_NAME = 'ROOMRENT';

const buildVietQRUrl = (amount: number, content: string): string =>
  `https://img.vietqr.io/image/${VIETQR_BANK_BIN}-${VIETQR_ACCOUNT}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(content)}&accountName=${encodeURIComponent(VIETQR_ACCOUNT_NAME)}`;

export const MOCK_INVOICES: Invoice[] = [
  {
    id: '1', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    month: 5, year: 2026,
    items: [
      { label: 'Tiền thuê phòng', unitPrice: 3000000, amount: 3000000 },
      { label: 'Điện (150 kWh × 3.500đ)', quantity: 150, unitPrice: 3500, amount: 525000 },
      { label: 'Nước (12 m³ × 15.000đ)', quantity: 12, unitPrice: 15000, amount: 180000 },
      { label: 'Phí dịch vụ', unitPrice: 150000, amount: 150000 },
    ],
    totalAmount: 3855000, outstandingBalance: 0, grandTotal: 3855000,
    status: 'pending', dueDate: '2026-05-15', createdAt: '2026-04-29',
    electricityConsumption: 150, waterConsumption: 12,
  },
  {
    id: '2', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    month: 4, year: 2026,
    items: [
      { label: 'Tiền thuê phòng', unitPrice: 3000000, amount: 3000000 },
      { label: 'Điện (130 kWh × 3.500đ)', quantity: 130, unitPrice: 3500, amount: 455000 },
      { label: 'Nước (10 m³ × 15.000đ)', quantity: 10, unitPrice: 15000, amount: 150000 },
      { label: 'Phí dịch vụ', unitPrice: 150000, amount: 150000 },
    ],
    totalAmount: 3755000, outstandingBalance: 0, grandTotal: 3755000,
    status: 'paid', dueDate: '2026-04-15', paidAt: '2026-04-10', createdAt: '2026-03-29',
    paymentMethod: 'qr', transactionId: 'TXN-2026-04-001',
  },
  {
    id: '3', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    month: 3, year: 2026,
    items: [
      { label: 'Tiền thuê phòng', unitPrice: 3000000, amount: 3000000 },
      { label: 'Điện (140 kWh × 3.500đ)', quantity: 140, unitPrice: 3500, amount: 490000 },
      { label: 'Nước (11 m³ × 15.000đ)', quantity: 11, unitPrice: 15000, amount: 165000 },
      { label: 'Phí dịch vụ', unitPrice: 150000, amount: 150000 },
    ],
    totalAmount: 3805000, outstandingBalance: 0, grandTotal: 3855000,
    lateFee: 50000,
    status: 'overdue', dueDate: '2026-03-15', createdAt: '2026-02-28',
  },
];

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Chờ thanh toán', color: Colors.warning, bg: Colors.warningLight },
  paid: { label: 'Đã thanh toán', color: Colors.success, bg: Colors.successLight },
  overdue: { label: 'Quá hạn', color: Colors.error, bg: Colors.errorLight },
};

const FILTER_TABS: { key: 'all' | InvoiceStatus; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'pending', label: 'Chờ TT' },
  { key: 'overdue', label: 'Quá hạn' },
  { key: 'paid', label: 'Đã TT' },
];

export const InvoiceListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [invoices, setInvoices] = useState(MOCK_INVOICES);
  const [filter, setFilter] = useState<'all' | InvoiceStatus>('all');
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [payStep, setPayStep] = useState<'qr' | 'confirm'>('qr');

  const filtered = filter === 'all' ? invoices : invoices.filter(i => i.status === filter);
  const overdueCount = invoices.filter(i => i.status === 'overdue').length;
  const pendingTotal = invoices
    .filter(i => i.status === 'pending' || i.status === 'overdue')
    .reduce((sum, i) => sum + i.grandTotal, 0);

  const handlePay = (invoice: Invoice) => {
    setPayingInvoice(invoice);
    setPayStep('qr');
  };

  const handleConfirmPaid = () => {
    if (!payingInvoice) return;
    Alert.alert(
      'Xác nhận thanh toán',
      'Bạn đã chuyển khoản thành công? Giao dịch sẽ được quản lý xác minh trong vài giờ.',
      [
        { text: 'Chưa', style: 'cancel' },
        {
          text: 'Đã chuyển',
          onPress: () => {
            setInvoices(prev => prev.map(inv =>
              inv.id === payingInvoice.id
                ? { ...inv, status: 'paid' as InvoiceStatus, paidAt: new Date().toISOString().slice(0, 10) }
                : inv
            ));
            setPayingInvoice(null);
            Alert.alert(
              'Ghi nhận thành công! ✅',
              'Thanh toán đang chờ xác minh từ quản lý. Bạn sẽ nhận thông báo khi được xác nhận.',
            );
          },
        },
      ]
    );
  };

  const renderInvoice = ({ item }: { item: Invoice }) => {
    const cfg = STATUS_CONFIG[item.status];
    const isOverdue = item.status === 'overdue';
    const daysOverdue = isOverdue ? Math.abs(getDaysUntil(item.dueDate)) : 0;

    return (
      <View style={[styles.card, isOverdue && styles.cardOverdue]}>
        {isOverdue && <View style={styles.overdueStripe} />}

        {/* Header */}
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.invoiceMonth}>Tháng {String(item.month).padStart(2, '0')}/{item.year}</Text>
            <Text style={styles.invoiceRoom}>{item.roomName}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>

        {/* Items */}
        <View style={styles.divider} />
        {item.items.map((li, i) => (
          <View key={i} style={styles.lineRow}>
            <Text style={styles.lineLabel}>{li.label}</Text>
            <Text style={styles.lineVal}>{formatCurrency(li.amount)}</Text>
          </View>
        ))}

        {/* Phí trễ */}
        {item.lateFee && item.lateFee > 0 && (
          <View style={styles.lineRow}>
            <Text style={[styles.lineLabel, { color: Colors.error }]}>⚠️ Phí trả chậm</Text>
            <Text style={[styles.lineVal, { color: Colors.error }]}>+{formatCurrency(item.lateFee)}</Text>
          </View>
        )}

        <View style={styles.divider} />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Tổng cộng</Text>
          <Text style={[styles.totalVal, isOverdue && { color: Colors.error }]}>
            {formatCurrency(item.grandTotal)}
          </Text>
        </View>

        {/* Due date */}
        {item.status !== 'paid' && (
          <Text style={[styles.dueDate, isOverdue && { color: Colors.error }]}>
            {isOverdue
              ? `⚠️ Đã quá hạn ${daysOverdue} ngày (Hạn: ${formatDate(item.dueDate)})`
              : `📅 Hạn thanh toán: ${formatDate(item.dueDate)}`}
          </Text>
        )}

        {/* Actions */}
        {item.status === 'pending' && (
          <TouchableOpacity style={styles.payBtn} onPress={() => handlePay(item)}>
            <Text style={styles.payBtnText}>💳 Thanh toán ngay</Text>
          </TouchableOpacity>
        )}

        {item.status === 'overdue' && (
          <TouchableOpacity style={[styles.payBtn, { backgroundColor: Colors.error }]} onPress={() => handlePay(item)}>
            <Text style={styles.payBtnText}>🚨 Thanh toán ngay (Quá hạn)</Text>
          </TouchableOpacity>
        )}

        {item.status === 'paid' && (
          <View style={styles.paidInfo}>
            <Text style={styles.paidText}>✅ Đã thanh toán ngày {item.paidAt ? formatDate(item.paidAt) : ''}</Text>
            {item.paymentMethod && (
              <Text style={styles.paidMethod}>
                {item.paymentMethod === 'qr' ? 'QR Code' : item.paymentMethod}
              </Text>
            )}
          </View>
        )}

        {/* Quick detail link */}
        <TouchableOpacity
          style={styles.detailLink}
          onPress={() => navigation.navigate('PaymentHistory')}
        >
          <Text style={styles.detailLinkText}>Xem lịch sử thanh toán →</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const qrContent = payingInvoice
    ? `HD${payingInvoice.id} T${payingInvoice.month} ${payingInvoice.roomName}`
    : '';
  const qrUrl = payingInvoice ? buildVietQRUrl(payingInvoice.grandTotal, qrContent) : '';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Hóa đơn</Text>
          <Text style={styles.subtitle}>Danh sách hóa đơn hàng tháng</Text>
        </View>
        <TouchableOpacity
          style={styles.historyBtn}
          onPress={() => navigation.navigate('PaymentHistory')}
        >
          <Text style={styles.historyBtnText}>Lịch sử</Text>
        </TouchableOpacity>
      </View>

      {/* Tổng nợ cần thanh toán */}
      {pendingTotal > 0 && (
        <View style={[styles.summaryBanner, overdueCount > 0 && styles.summaryBannerError]}>
          <View>
            <Text style={styles.summaryLabel}>
              {overdueCount > 0 ? '⚠️ Cần thanh toán (bao gồm quá hạn)' : '💳 Cần thanh toán'}
            </Text>
            <Text style={[styles.summaryAmount, overdueCount > 0 && { color: Colors.error }]}>
              {formatCurrency(pendingTotal)}
            </Text>
          </View>
          {overdueCount > 0 && (
            <View style={styles.overdueBadge}>
              <Text style={styles.overdueBadgeText}>{overdueCount} quá hạn</Text>
            </View>
          )}
        </View>
      )}

      {/* Bộ lọc */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {FILTER_TABS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        renderItem={renderInvoice}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.base }} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📄</Text>
            <Text style={styles.emptyTitle}>Không có hóa đơn</Text>
            <Text style={styles.emptyDesc}>Không có hóa đơn nào với trạng thái này.</Text>
          </View>
        }
      />

      {/* ===== Modal Thanh toán VietQR ===== */}
      <Modal visible={!!payingInvoice} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setPayingInvoice(null)}>
              <Text style={{ fontSize: 16, color: Colors.textMuted }}>✕</Text>
            </TouchableOpacity>

            <Text style={styles.modalTitle}>💳 Thanh toán hóa đơn</Text>
            {payingInvoice && (
              <Text style={styles.modalSub}>
                Tháng {String(payingInvoice.month).padStart(2, '0')}/{payingInvoice.year} · {payingInvoice.roomName}
              </Text>
            )}

            {/* QR Code */}
            <View style={styles.qrContainer}>
              {payingInvoice && (
                <Image source={{ uri: qrUrl }} style={styles.qrImage} resizeMode="contain" />
              )}
            </View>

            <Text style={styles.qrHint}>
              Mở app Ngân hàng → Quét mã QR → Thông tin tự động điền sẵn
            </Text>

            {/* Thông tin CK */}
            <View style={styles.bankInfo}>
              <View style={styles.bankRow}>
                <Text style={styles.bankLabel}>Ngân hàng</Text>
                <Text style={styles.bankVal}>MB Bank</Text>
              </View>
              <View style={styles.bankRow}>
                <Text style={styles.bankLabel}>Số tài khoản</Text>
                <Text style={styles.bankVal}>{VIETQR_ACCOUNT}</Text>
              </View>
              <View style={styles.bankRow}>
                <Text style={styles.bankLabel}>Số tiền</Text>
                <Text style={[styles.bankVal, { color: Colors.primary, fontWeight: '800', fontSize: 16 }]}>
                  {payingInvoice ? formatCurrency(payingInvoice.grandTotal) : ''}
                </Text>
              </View>
              <View style={styles.bankRow}>
                <Text style={styles.bankLabel}>Nội dung CK</Text>
                <Text style={styles.bankVal}>{qrContent}</Text>
              </View>
            </View>

            {payingInvoice?.lateFee && payingInvoice.lateFee > 0 && (
              <View style={styles.lateFeeWarning}>
                <Text style={styles.lateFeeText}>
                  ⚠️ Bao gồm phí trả chậm: {formatCurrency(payingInvoice.lateFee)}
                </Text>
              </View>
            )}

            <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirmPaid}>
              <Text style={styles.confirmBtnText}>✅ Tôi đã chuyển khoản</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setPayingInvoice(null)}>
              <Text style={styles.cancelBtnText}>Để sau</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md,
  },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
  historyBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md,
  },
  historyBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  summaryBanner: {
    marginHorizontal: Spacing.lg, marginBottom: Spacing.md,
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg, padding: Spacing.base,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  summaryBannerError: { backgroundColor: Colors.errorLight },
  summaryLabel: { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
  summaryAmount: { fontSize: 22, fontWeight: '800', color: Colors.primary },
  overdueBadge: { backgroundColor: Colors.error, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs },
  overdueBadgeText: { fontSize: 12, fontWeight: '700', color: Colors.white },

  filterRow: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.sm },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.md, overflow: 'hidden' },
  cardOverdue: { borderWidth: 1.5, borderColor: Colors.error + '60' },
  overdueStripe: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, backgroundColor: Colors.error },

  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  invoiceMonth: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  invoiceRoom: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: Spacing.sm + 2, paddingVertical: Spacing.xs + 2, borderRadius: BorderRadius.full },
  statusText: { fontSize: 11, fontWeight: '700' },

  divider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.md },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xs },
  lineLabel: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
  lineVal: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  totalVal: { fontSize: 22, fontWeight: '800', color: Colors.primary },

  dueDate: { fontSize: 13, color: Colors.textSecondary, marginTop: Spacing.sm },

  payBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.md,
  },
  payBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },

  paidInfo: { marginTop: Spacing.md, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paidText: { fontSize: 13, color: Colors.success, fontWeight: '600' },
  paidMethod: { fontSize: 12, color: Colors.textMuted },

  detailLink: { marginTop: Spacing.sm, alignItems: 'flex-end' },
  detailLinkText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },

  empty: { paddingTop: 60, alignItems: 'center' },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.base },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.lg, paddingBottom: 40, maxHeight: '95%',
  },
  modalClose: {
    position: 'absolute', top: 16, right: 16, zIndex: 10,
    width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.divider,
    alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center', marginTop: Spacing.sm },
  modalSub: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: Spacing.md },

  qrContainer: {
    alignItems: 'center', backgroundColor: Colors.white,
    padding: Spacing.md, borderRadius: BorderRadius.lg,
    borderWidth: 2, borderColor: Colors.divider, alignSelf: 'center', marginBottom: Spacing.md,
  },
  qrImage: { width: 220, height: 280 },
  qrHint: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginBottom: Spacing.md, fontStyle: 'italic' },

  bankInfo: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.md,
  },
  bankRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  bankLabel: { fontSize: 13, color: Colors.textMuted },
  bankVal: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

  lateFeeWarning: {
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.md,
    padding: Spacing.sm, marginBottom: Spacing.md,
  },
  lateFeeText: { fontSize: 13, fontWeight: '600', color: Colors.error, textAlign: 'center' },

  confirmBtn: {
    backgroundColor: Colors.success, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', ...Shadow.md, marginBottom: Spacing.md,
  },
  confirmBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  cancelBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
});
