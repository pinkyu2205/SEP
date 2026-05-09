import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, Image, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { StatusBadge } from '../../components/common';
import { Invoice, InvoiceStatus } from '../../types';
import { formatCurrency, getInvoiceStatusLabel } from '../../utils';

const MOCK_INVOICES: Invoice[] = [
  {
    id: '1', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    month: 4, year: 2026,
    items: [
      { label: 'Tiền phòng', unitPrice: 3000000, amount: 3000000 },
      { label: 'Điện (150 kWh)', quantity: 150, unitPrice: 3500, amount: 525000 },
      { label: 'Nước (12 m³)', quantity: 12, unitPrice: 15000, amount: 180000 },
      { label: 'Phí dịch vụ', unitPrice: 150000, amount: 150000 },
    ],
    totalAmount: 3855000, outstandingBalance: 0, grandTotal: 3855000,
    status: 'pending', dueDate: '2026-05-15', createdAt: '2026-04-29',
  },
  {
    id: '2', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    month: 3, year: 2026,
    items: [
      { label: 'Tiền phòng', unitPrice: 3000000, amount: 3000000 },
      { label: 'Điện (130 kWh)', quantity: 130, unitPrice: 3500, amount: 455000 },
      { label: 'Nước (10 m³)', quantity: 10, unitPrice: 15000, amount: 150000 },
      { label: 'Phí dịch vụ', unitPrice: 150000, amount: 150000 },
    ],
    totalAmount: 3755000, outstandingBalance: 0, grandTotal: 3755000,
    status: 'paid', dueDate: '2026-04-15', paidAt: '2026-04-10', createdAt: '2026-03-29',
  },
];

// VietQR constants — MB Bank
const VIETQR_BANK_BIN = '970422'; // MB Bank BIN
const VIETQR_ACCOUNT = '0865803493';
const VIETQR_ACCOUNT_NAME = 'ROOMRENT';

const getVariant = (s: InvoiceStatus) =>
  s === 'paid' ? 'success' as const : s === 'overdue' ? 'error' as const : 'warning' as const;

const buildVietQRUrl = (amount: number, content: string): string => {
  const encodedContent = encodeURIComponent(content);
  return `https://img.vietqr.io/image/${VIETQR_BANK_BIN}-${VIETQR_ACCOUNT}-compact2.png?amount=${amount}&addInfo=${encodedContent}&accountName=${encodeURIComponent(VIETQR_ACCOUNT_NAME)}`;
};

export const InvoiceListScreen: React.FC = () => {
  const [invoices, setInvoices] = useState(MOCK_INVOICES);
  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);

  const handlePay = (invoice: Invoice) => {
    setPayingInvoice(invoice);
  };

  const handleConfirmPaid = () => {
    if (!payingInvoice) return;
    Alert.alert(
      'Xác nhận',
      'Bạn đã chuyển khoản thành công cho hóa đơn này?',
      [
        { text: 'Chưa', style: 'cancel' },
        {
          text: 'Đã chuyển',
          onPress: () => {
            setInvoices(prev =>
              prev.map(inv =>
                inv.id === payingInvoice.id
                  ? { ...inv, status: 'paid' as InvoiceStatus, paidAt: new Date().toISOString().slice(0, 10) }
                  : inv
              )
            );
            setPayingInvoice(null);
            Alert.alert('Thành công!', 'Hóa đơn đã được ghi nhận thanh toán. Cảm ơn bạn!');
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: Invoice }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.7}>
      <View style={styles.row}>
        <View>
          <Text style={styles.month}>Tháng {String(item.month).padStart(2, '0')}/{item.year}</Text>
          <Text style={styles.room}>{item.roomName}</Text>
        </View>
        <StatusBadge label={getInvoiceStatusLabel(item.status)} variant={getVariant(item.status)} />
      </View>
      <View style={styles.divider} />
      {item.items.map((li, i) => (
        <View key={i} style={styles.lineRow}>
          <Text style={styles.lineLabel}>{li.label}</Text>
          <Text style={styles.lineVal}>{formatCurrency(li.amount)}</Text>
        </View>
      ))}
      <View style={styles.divider} />
      <View style={styles.row}>
        <Text style={styles.totalLabel}>Tổng cộng</Text>
        <Text style={styles.totalVal}>{formatCurrency(item.grandTotal)}</Text>
      </View>
      {item.status === 'pending' && (
        <TouchableOpacity style={styles.payBtn} onPress={() => handlePay(item)}>
          <Text style={styles.payText}>💳 Thanh toán ngay</Text>
        </TouchableOpacity>
      )}
      {item.status === 'paid' && item.paidAt && (
        <Text style={styles.paidDate}>✅ Đã thanh toán {item.paidAt}</Text>
      )}
    </TouchableOpacity>
  );

  const qrContent = payingInvoice
    ? `HD${payingInvoice.id} T${payingInvoice.month} ${payingInvoice.roomName}`
    : '';
  const qrUrl = payingInvoice ? buildVietQRUrl(payingInvoice.grandTotal, qrContent) : '';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Hóa đơn</Text>
        <Text style={styles.subtitle}>Danh sách hóa đơn hàng tháng</Text>
      </View>
      <FlatList
        data={invoices}
        renderItem={renderItem}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.base }} />}
      />

      {/* ============ VIETQR PAYMENT MODAL ============ */}
      <Modal visible={!!payingInvoice} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Close button */}
            <TouchableOpacity style={styles.modalClose} onPress={() => setPayingInvoice(null)}>
              <Text style={{ fontSize: 18, color: Colors.textMuted }}>✕</Text>
            </TouchableOpacity>

            <Text style={styles.modalTitle}>Thanh toán hóa đơn</Text>
            {payingInvoice && (
              <Text style={styles.modalSub}>
                Tháng {String(payingInvoice.month).padStart(2, '0')}/{payingInvoice.year} — {payingInvoice.roomName}
              </Text>
            )}

            {/* QR Code */}
            <View style={styles.qrContainer}>
              {payingInvoice && (
                <Image
                  source={{ uri: qrUrl }}
                  style={styles.qrImage}
                  resizeMode="contain"
                />
              )}
            </View>

            <Text style={styles.qrHint}>
              Mở app Ngân hàng → Quét mã QR → Thông tin sẽ được tự động điền sẵn
            </Text>

            {/* Thông tin chuyển khoản */}
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
                <Text style={[styles.bankVal, { color: Colors.primary, fontWeight: '800' }]}>
                  {payingInvoice ? formatCurrency(payingInvoice.grandTotal) : ''}
                </Text>
              </View>
              <View style={styles.bankRow}>
                <Text style={styles.bankLabel}>Nội dung CK</Text>
                <Text style={styles.bankVal}>{qrContent}</Text>
              </View>
            </View>

            {/* Action buttons */}
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
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },
  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  month: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  room: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  divider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.md },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xs },
  lineLabel: { fontSize: 14, color: Colors.textSecondary },
  lineVal: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary },
  totalLabel: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  totalVal: { fontSize: 20, fontWeight: '800', color: Colors.primary },
  payBtn: { backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.md },
  payText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  paidDate: { fontSize: 13, color: Colors.success, fontWeight: '600', marginTop: Spacing.md, textAlign: 'right' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.lg, paddingBottom: 40, maxHeight: '92%',
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
    padding: Spacing.base, marginBottom: Spacing.lg,
  },
  bankRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  bankLabel: { fontSize: 13, color: Colors.textMuted },
  bankVal: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

  confirmBtn: {
    backgroundColor: Colors.success, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', ...Shadow.md, marginBottom: Spacing.md,
  },
  confirmBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  cancelBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
});

