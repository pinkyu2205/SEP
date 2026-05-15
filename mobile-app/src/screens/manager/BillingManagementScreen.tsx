import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, Alert, Image, TextInput, ScrollView, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// ===================== TYPES =====================
type BillStatus = 'pending' | 'paid' | 'overdue' | 'partial';
type PaymentMethod = 'qr' | 'bank_transfer' | 'cash';
type TabType = 'bills' | 'payments';

interface BillItem {
  label: string;
  amount: number;
}

interface Bill {
  id: string;
  code: string;
  roomName: string;
  propertyName: string;
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
  paidAt?: string;
  paidAmount?: number;
  paymentMethod?: PaymentMethod;
  transactionId?: string;
  createdAt: string;
  daysOverdue?: number;
}

interface PaymentRecord {
  id: string;
  billCode: string;
  tenantName: string;
  roomName: string;
  amount: number;
  method: PaymentMethod;
  status: 'pending_verify' | 'verified' | 'rejected';
  transferContent?: string;
  createdAt: string;
  verifiedAt?: string;
}

// ===================== MOCK DATA =====================
const VIETQR_BANK_BIN = '970422';
const VIETQR_ACCOUNT = '0865803493';
const LATE_FEE_RATE = 0.01;

const MOCK_BILLS: Bill[] = [
  {
    id: 'b1', code: 'HD-T5-101', roomName: 'P101', propertyName: 'Nhà Nguyễn Trãi',
    tenantName: 'Trần Văn A', tenantPhone: '0901111001', month: 5, year: 2026,
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
    id: 'b2', code: 'HD-T5-102', roomName: 'P102', propertyName: 'Nhà Nguyễn Trãi',
    tenantName: 'Lê Thị B', tenantPhone: '0901111002', month: 5, year: 2026,
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
    id: 'b3', code: 'HD-T5-201', roomName: 'P201', propertyName: 'Nhà Nguyễn Trãi',
    tenantName: 'Phạm Văn C', tenantPhone: '0901111003', month: 5, year: 2026,
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
    id: 'b4', code: 'HD-T5-301', roomName: 'P301', propertyName: 'Nhà Nguyễn Trãi',
    tenantName: 'Ngô Thị D', tenantPhone: '0901111004', month: 5, year: 2026,
    items: [
      { label: 'Tiền phòng', amount: 3500000 },
      { label: 'Điện (110 kWh)', amount: 385000 },
      { label: 'Nước (11 m³)', amount: 220000 },
    ],
    totalAmount: 4105000, lateFee: 0, grandTotal: 4105000,
    status: 'pending', dueDate: '2026-05-15', createdAt: '2026-05-01',
  },
  {
    id: 'b5', code: 'HD-T5-CMT-101', roomName: 'P101', propertyName: 'Nhà CMT8',
    tenantName: 'Bùi Văn H', tenantPhone: '0901111008', month: 5, year: 2026,
    items: [
      { label: 'Tiền phòng', amount: 4000000 },
      { label: 'Điện (150 kWh)', amount: 525000 },
      { label: 'Nước (16 m³)', amount: 320000 },
    ],
    totalAmount: 4845000, lateFee: 0, grandTotal: 4845000,
    status: 'pending', dueDate: '2026-05-15', createdAt: '2026-05-01',
  },
  {
    id: 'b6', code: 'HD-T4-201', roomName: 'P201', propertyName: 'Nhà Nguyễn Trãi',
    tenantName: 'Phạm Văn C', tenantPhone: '0901111003', month: 4, year: 2026,
    items: [
      { label: 'Tiền phòng', amount: 3800000 },
      { label: 'Điện (140 kWh)', amount: 490000 },
      { label: 'Nước (14 m³)', amount: 280000 },
    ],
    totalAmount: 4570000, lateFee: 45700, grandTotal: 4615700,
    status: 'overdue', dueDate: '2026-04-15', createdAt: '2026-04-01', daysOverdue: 31,
  },
];

const MOCK_PAYMENTS: PaymentRecord[] = [
  {
    id: 'p1', billCode: 'HD-T5-102', tenantName: 'Lê Thị B', roomName: 'P102',
    amount: 3860000, method: 'qr', status: 'verified',
    transferContent: 'HD-T5-102 Phong 102 Le Thi B',
    createdAt: '2026-05-10T14:30:00', verifiedAt: '2026-05-10T14:35:00',
  },
  {
    id: 'p2', billCode: 'HD-T5-101', tenantName: 'Trần Văn A', roomName: 'P101',
    amount: 4352500, method: 'bank_transfer', status: 'pending_verify',
    transferContent: 'CK tien phong thang 5 Tran Van A',
    createdAt: '2026-05-14T09:15:00',
  },
];

// ===================== HELPERS =====================
const buildQRUrl = (amount: number, content: string) =>
  `https://img.vietqr.io/image/${VIETQR_BANK_BIN}-${VIETQR_ACCOUNT}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(content)}&accountName=ROOMRENT`;

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

const STATUS_CONFIG: Record<BillStatus, { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: 'Chưa thanh toán', color: '#F59E0B', bg: '#FFFBEB', icon: '⏳' },
  paid: { label: 'Đã thanh toán', color: '#10B981', bg: '#F0FDF4', icon: '✅' },
  overdue: { label: 'Quá hạn', color: '#EF4444', bg: '#FEF2F2', icon: '🚨' },
  partial: { label: 'Thanh toán một phần', color: '#3B82F6', bg: '#EFF6FF', icon: '💛' },
};

const PAYMENT_STATUS_CONFIG = {
  pending_verify: { label: 'Chờ xác nhận', color: '#F59E0B', bg: '#FFFBEB' },
  verified: { label: 'Đã xác nhận', color: '#10B981', bg: '#F0FDF4' },
  rejected: { label: 'Từ chối', color: '#EF4444', bg: '#FEF2F2' },
};

const METHOD_LABELS: Record<PaymentMethod, string> = {
  qr: 'QR VietQR',
  bank_transfer: 'Chuyển khoản',
  cash: 'Tiền mặt',
};

// ===================== BILL CARD =====================
const BillCard: React.FC<{ bill: Bill; onPress: () => void }> = ({ bill, onPress }) => {
  const cfg = STATUS_CONFIG[bill.status];
  return (
    <TouchableOpacity style={styles.billCard} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.billCardHeader}>
        <View>
          <Text style={styles.billCode}>{bill.code}</Text>
          <Text style={styles.billRoom}>{bill.propertyName} · {bill.roomName}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
          <Text style={styles.statusIcon}>{cfg.icon}</Text>
          <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>
      <View style={styles.billTenantRow}>
        <Text style={styles.billTenant}>👤 {bill.tenantName}</Text>
        <Text style={styles.billMonth}>T{String(bill.month).padStart(2, '0')}/{bill.year}</Text>
      </View>
      <View style={styles.billAmountRow}>
        <View>
          <Text style={styles.billDue}>Hạn: {bill.dueDate}</Text>
          {bill.daysOverdue && bill.daysOverdue > 0 && (
            <Text style={styles.billOverdueDays}>Quá hạn {bill.daysOverdue} ngày</Text>
          )}
          {bill.lateFee > 0 && (
            <Text style={styles.billLateFee}>Phí trễ: {fmt(bill.lateFee)}</Text>
          )}
        </View>
        <Text style={[styles.billTotal, bill.status === 'overdue' && { color: Colors.error }]}>
          {fmt(bill.grandTotal)}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

// ===================== MAIN =====================
export const BillingManagementScreen: React.FC = () => {
  const [tab, setTab] = useState<TabType>('bills');
  const [bills, setBills] = useState(MOCK_BILLS);
  const [payments, setPayments] = useState(MOCK_PAYMENTS);
  const [statusFilter, setStatusFilter] = useState<'all' | BillStatus>('all');
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [cashNote, setCashNote] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);

  const filteredBills = useMemo(() => {
    if (statusFilter === 'all') return bills;
    return bills.filter(b => b.status === statusFilter);
  }, [bills, statusFilter]);

  const billStats = useMemo(() => ({
    total: bills.length,
    paid: bills.filter(b => b.status === 'paid').length,
    pending: bills.filter(b => b.status === 'pending').length,
    overdue: bills.filter(b => b.status === 'overdue').length,
    totalRevenue: bills.filter(b => b.status === 'paid').reduce((s, b) => s + b.grandTotal, 0),
    totalDebt: bills.filter(b => b.status !== 'paid').reduce((s, b) => s + b.grandTotal, 0),
  }), [bills]);

  const handleMarkPaidCash = () => {
    if (!selectedBill) return;
    setBills(prev => prev.map(b =>
      b.id === selectedBill.id
        ? { ...b, status: 'paid', paidAt: new Date().toISOString().split('T')[0], paymentMethod: 'cash', paidAmount: b.grandTotal }
        : b
    ));
    setShowCashModal(false);
    setSelectedBill(null);
    Alert.alert('✅ Thành công', 'Đã ghi nhận thanh toán tiền mặt.');
  };

  const handleVerifyPayment = (paymentId: string, approved: boolean) => {
    Alert.alert(
      approved ? 'Xác nhận thanh toán?' : 'Từ chối thanh toán?',
      approved ? 'Xác nhận đã nhận đủ tiền từ khách thuê?' : 'Từ chối giao dịch này?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: approved ? 'Xác nhận' : 'Từ chối',
          style: approved ? 'default' : 'destructive',
          onPress: () => {
            const payment = payments.find(p => p.id === paymentId);
            if (payment) {
              setPayments(prev => prev.map(p =>
                p.id === paymentId
                  ? { ...p, status: approved ? 'verified' : 'rejected', verifiedAt: new Date().toISOString() }
                  : p
              ));
              if (approved) {
                setBills(prev => prev.map(b =>
                  b.code === payment.billCode
                    ? { ...b, status: 'paid', paidAt: new Date().toISOString().split('T')[0], paidAmount: payment.amount }
                    : b
                ));
              }
              setSelectedPayment(null);
            }
          },
        },
      ]
    );
  };

  const pendingVerifications = payments.filter(p => p.status === 'pending_verify').length;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Hóa đơn & Thanh toán</Text>
        <Text style={styles.subtitle}>Tháng 05/2026</Text>
      </View>

      {/* Summary Cards */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.summaryScroll} contentContainerStyle={styles.summaryContent}>
        <View style={[styles.summaryCard, { borderTopColor: Colors.success }]}>
          <Text style={styles.summaryNum}>{billStats.paid}</Text>
          <Text style={styles.summaryLabel}>Đã thu</Text>
          <Text style={styles.summaryAmount}>{(billStats.totalRevenue / 1_000_000).toFixed(1)}tr</Text>
        </View>
        <View style={[styles.summaryCard, { borderTopColor: Colors.warning }]}>
          <Text style={[styles.summaryNum, { color: Colors.warning }]}>{billStats.pending}</Text>
          <Text style={styles.summaryLabel}>Chưa thu</Text>
          <Text style={[styles.summaryAmount, { color: Colors.warning }]}>
            {(bills.filter(b => b.status === 'pending').reduce((s, b) => s + b.grandTotal, 0) / 1_000_000).toFixed(1)}tr
          </Text>
        </View>
        <View style={[styles.summaryCard, { borderTopColor: Colors.error }]}>
          <Text style={[styles.summaryNum, { color: Colors.error }]}>{billStats.overdue}</Text>
          <Text style={styles.summaryLabel}>Quá hạn</Text>
          <Text style={[styles.summaryAmount, { color: Colors.error }]}>
            {(bills.filter(b => b.status === 'overdue').reduce((s, b) => s + b.grandTotal, 0) / 1_000_000).toFixed(1)}tr
          </Text>
        </View>
        <View style={[styles.summaryCard, { borderTopColor: Colors.info }]}>
          <Text style={[styles.summaryNum, { color: Colors.info }]}>{pendingVerifications}</Text>
          <Text style={styles.summaryLabel}>Chờ xác nhận</Text>
          <Text style={[styles.summaryAmount, { color: Colors.info }]}>Giao dịch</Text>
        </View>
      </ScrollView>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === 'bills' && styles.tabActive]}
          onPress={() => setTab('bills')}
        >
          <Text style={[styles.tabText, tab === 'bills' && styles.tabTextActive]}>
            🧾 Hóa đơn ({bills.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'payments' && styles.tabActive]}
          onPress={() => setTab('payments')}
        >
          <Text style={[styles.tabText, tab === 'payments' && styles.tabTextActive]}>
            💳 Thanh toán {pendingVerifications > 0 ? `(${pendingVerifications}!)` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'bills' ? (
        <>
          {/* Status Filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={styles.filterRow} contentContainerStyle={styles.filterContent}>
            {(['all', 'pending', 'overdue', 'paid'] as const).map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
                onPress={() => setStatusFilter(s)}
              >
                <Text style={[styles.filterText, statusFilter === s && styles.filterTextActive]}>
                  {s === 'all' ? 'Tất cả' : STATUS_CONFIG[s].label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <FlatList
            data={filteredBills}
            keyExtractor={i => i.id}
            renderItem={({ item }) => (
              <BillCard bill={item} onPress={() => setSelectedBill(item)} />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={{ fontSize: 40 }}>🧾</Text>
                <Text style={styles.emptyText}>Không có hóa đơn</Text>
              </View>
            }
          />
        </>
      ) : (
        /* PAYMENTS TAB */
        <FlatList
          data={payments}
          keyExtractor={i => i.id}
          renderItem={({ item }) => {
            const cfg = PAYMENT_STATUS_CONFIG[item.status];
            return (
              <TouchableOpacity
                style={styles.paymentCard}
                onPress={() => setSelectedPayment(item)}
              >
                <View style={styles.paymentCardHeader}>
                  <View>
                    <Text style={styles.paymentCode}>{item.billCode}</Text>
                    <Text style={styles.paymentTenant}>{item.tenantName} · {item.roomName}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                    <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>
                <View style={styles.paymentAmountRow}>
                  <Text style={styles.paymentMethod}>{METHOD_LABELS[item.method]}</Text>
                  <Text style={styles.paymentAmount}>{fmt(item.amount)}</Text>
                </View>
                <Text style={styles.paymentDate}>{item.createdAt.split('T')[0]} {item.createdAt.split('T')[1]?.slice(0, 5)}</Text>
                {item.status === 'pending_verify' && (
                  <View style={styles.verifyActions}>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => handleVerifyPayment(item.id, false)}
                    >
                      <Text style={styles.rejectBtnText}>Từ chối</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.approveBtn}
                      onPress={() => handleVerifyPayment(item.id, true)}
                    >
                      <Text style={styles.approveBtnText}>✓ Xác nhận đã nhận</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 40 }}>💳</Text>
              <Text style={styles.emptyText}>Chưa có giao dịch nào</Text>
            </View>
          }
        />
      )}

      {/* Bill Detail Modal */}
      {selectedBill && !showQRModal && !showCashModal && (
        <Modal transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.billDetailSheet}>
              <ScrollView bounces={false} showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.billDetailContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{selectedBill.code}</Text>
                  <TouchableOpacity onPress={() => setSelectedBill(null)}>
                    <Text style={styles.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.statusBannerFull, { backgroundColor: STATUS_CONFIG[selectedBill.status].bg }]}>
                  <Text style={styles.statusBannerIcon}>{STATUS_CONFIG[selectedBill.status].icon}</Text>
                  <Text style={[styles.statusBannerText, { color: STATUS_CONFIG[selectedBill.status].color }]}>
                    {STATUS_CONFIG[selectedBill.status].label}
                  </Text>
                </View>

                <View style={styles.detailSection}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Khách thuê</Text>
                    <Text style={styles.detailVal}>{selectedBill.tenantName}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Phòng</Text>
                    <Text style={styles.detailVal}>{selectedBill.propertyName} · {selectedBill.roomName}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Tháng</Text>
                    <Text style={styles.detailVal}>T{String(selectedBill.month).padStart(2, '0')}/{selectedBill.year}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Hạn thanh toán</Text>
                    <Text style={[styles.detailVal, selectedBill.status === 'overdue' && { color: Colors.error }]}>
                      {selectedBill.dueDate}
                    </Text>
                  </View>
                </View>

                <View style={styles.itemsSection}>
                  {selectedBill.items.map((item, i) => (
                    <View key={i} style={styles.itemRow}>
                      <Text style={styles.itemLabel}>{item.label}</Text>
                      <Text style={styles.itemAmount}>{fmt(item.amount)}</Text>
                    </View>
                  ))}
                  {selectedBill.lateFee > 0 && (
                    <View style={styles.itemRow}>
                      <Text style={[styles.itemLabel, { color: Colors.error }]}>
                        Phí trễ hạn ({selectedBill.daysOverdue} ngày)
                      </Text>
                      <Text style={[styles.itemAmount, { color: Colors.error }]}>{fmt(selectedBill.lateFee)}</Text>
                    </View>
                  )}
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>TỔNG CỘNG</Text>
                    <Text style={styles.totalAmount}>{fmt(selectedBill.grandTotal)}</Text>
                  </View>
                </View>

                {selectedBill.status !== 'paid' && (
                  <View style={styles.paymentActions}>
                    <Text style={styles.paymentActionsTitle}>Ghi nhận thanh toán</Text>
                    <TouchableOpacity
                      style={styles.qrPayBtn}
                      onPress={() => setShowQRModal(true)}
                    >
                      <Text style={styles.qrPayBtnText}>📱 Hiện QR cho khách quét</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cashPayBtn}
                      onPress={() => setShowCashModal(true)}
                    >
                      <Text style={styles.cashPayBtnText}>💵 Ghi nhận tiền mặt</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {selectedBill.status === 'paid' && (
                  <View style={styles.paidInfo}>
                    <Text style={styles.paidInfoText}>
                      ✅ Đã thanh toán ngày {selectedBill.paidAt}
                      {selectedBill.paymentMethod && `\nPhương thức: ${METHOD_LABELS[selectedBill.paymentMethod]}`}
                      {selectedBill.transactionId && `\nMã GD: ${selectedBill.transactionId}`}
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* QR Payment Modal */}
      {showQRModal && selectedBill && (
        <Modal transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.billDetailSheet}>
              <ScrollView bounces={false} showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.billDetailContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>QR Thanh toán</Text>
                <TouchableOpacity onPress={() => setShowQRModal(false)}>
                  <Text style={styles.modalClose}>✕</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.qrSubtitle}>
                {selectedBill.tenantName} — {fmt(selectedBill.grandTotal)}
              </Text>
              <View style={styles.qrImageContainer}>
                <Image
                  source={{ uri: buildQRUrl(selectedBill.grandTotal, `${selectedBill.code} ${selectedBill.tenantName}`) }}
                  style={styles.qrImage}
                  resizeMode="contain"
                />
              </View>
              <View style={styles.bankInfoBox}>
                <View style={styles.bankRow}><Text style={styles.bankLabel}>Ngân hàng</Text><Text style={styles.bankVal}>MB Bank</Text></View>
                <View style={styles.bankRow}><Text style={styles.bankLabel}>Số TK</Text><Text style={styles.bankVal}>{VIETQR_ACCOUNT}</Text></View>
                <View style={styles.bankRow}>
                  <Text style={styles.bankLabel}>Số tiền</Text>
                  <Text style={[styles.bankVal, { color: Colors.primary, fontWeight: '800' }]}>{fmt(selectedBill.grandTotal)}</Text>
                </View>
                <View style={styles.bankRow}>
                  <Text style={styles.bankLabel}>Nội dung</Text>
                  <Text style={styles.bankVal}>{selectedBill.code} {selectedBill.tenantName}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.confirmPayBtn}
                onPress={() => {
                  setBills(prev => prev.map(b =>
                    b.id === selectedBill.id
                      ? { ...b, status: 'paid', paidAt: new Date().toISOString().split('T')[0], paymentMethod: 'qr', paidAmount: b.grandTotal }
                      : b
                  ));
                  setShowQRModal(false);
                  setSelectedBill(null);
                  Alert.alert('✅ Đã ghi nhận!', 'Thanh toán QR được xác nhận.');
                }}
              >
                <Text style={styles.confirmPayBtnText}>✅ Xác nhận đã thanh toán</Text>
              </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Cash Payment Modal */}
      {showCashModal && selectedBill && (
        <Modal transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>💵 Ghi nhận tiền mặt</Text>
              <Text style={styles.cashAmount}>Số tiền: {fmt(selectedBill.grandTotal)}</Text>
              <TextInput
                style={styles.cashNoteInput}
                placeholder="Ghi chú (tùy chọn)..."
                value={cashNote}
                onChangeText={setCashNote}
                multiline
              />
              <TouchableOpacity style={styles.confirmPayBtn} onPress={handleMarkPaidCash}>
                <Text style={styles.confirmPayBtnText}>✅ Xác nhận đã thu tiền mặt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setShowCashModal(false); setCashNote(''); }}
              >
                <Text style={styles.cancelBtnText}>Hủy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },

  summaryScroll: { height: 108 },
  summaryContent: { paddingHorizontal: Spacing.lg, paddingVertical: 8, alignItems: 'flex-start' },
  summaryCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
    borderTopWidth: 3, ...Shadow.sm,
    minWidth: 90, alignItems: 'center', marginRight: Spacing.md,
  },
  summaryNum: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  summaryLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },
  summaryAmount: { fontSize: 11, fontWeight: '700', color: Colors.success, marginTop: 2 },

  tabBar: {
    flexDirection: 'row', backgroundColor: Colors.white,
    borderBottomWidth: 1, borderColor: Colors.divider,
  },
  tab: {
    flex: 1, paddingVertical: Spacing.md, alignItems: 'center',
    borderBottomWidth: 3, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary },

  filterRow: { height: 50 },
  filterContent: { paddingHorizontal: Spacing.lg, paddingVertical: 8, alignItems: 'flex-start' },
  filterChip: {
    height: 34, justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border, marginRight: Spacing.sm,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },

  listContent: { paddingHorizontal: Spacing.lg, paddingBottom: 100, paddingTop: Spacing.md },

  billCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, ...Shadow.sm,
  },
  billCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm },
  billCode: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  billRoom: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full, gap: 4 },
  statusIcon: { fontSize: 11 },
  statusText: { fontSize: 11, fontWeight: '700' },
  billTenantRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  billTenant: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  billMonth: { fontSize: 12, color: Colors.textMuted },
  billAmountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  billDue: { fontSize: 12, color: Colors.textSecondary },
  billOverdueDays: { fontSize: 11, color: Colors.error, fontWeight: '700' },
  billLateFee: { fontSize: 11, color: Colors.error },
  billTotal: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },

  paymentCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, ...Shadow.sm,
  },
  paymentCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm },
  paymentCode: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  paymentTenant: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  paymentAmountRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  paymentMethod: { fontSize: 13, color: Colors.textSecondary },
  paymentAmount: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  paymentDate: { fontSize: 11, color: Colors.textMuted },
  verifyActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  rejectBtn: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md,
    backgroundColor: Colors.errorLight, alignItems: 'center',
  },
  rejectBtnText: { fontSize: 13, fontWeight: '600', color: Colors.error },
  approveBtn: {
    flex: 2, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary, alignItems: 'center',
  },
  approveBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: Spacing.md },
  emptyText: { fontSize: 14, color: Colors.textMuted },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl, padding: Spacing.xl, paddingBottom: 40, maxHeight: '90%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  modalClose: { fontSize: 20, color: Colors.textMuted, fontWeight: '600', padding: 4 },

  statusBannerFull: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md, borderRadius: BorderRadius.lg, marginBottom: Spacing.lg,
  },
  statusBannerIcon: { fontSize: 22 },
  statusBannerText: { fontSize: 16, fontWeight: '700' },

  detailSection: { marginBottom: Spacing.md },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderColor: Colors.divider },
  detailLabel: { fontSize: 14, color: Colors.textSecondary },
  detailVal: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },

  itemsSection: { backgroundColor: Colors.background, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.lg },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  itemLabel: { fontSize: 14, color: Colors.textSecondary },
  itemAmount: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.md, borderTopWidth: 1.5, borderColor: Colors.divider, marginTop: Spacing.sm },
  totalLabel: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  totalAmount: { fontSize: 20, fontWeight: '800', color: Colors.primary },

  paymentActions: { marginBottom: Spacing.md },
  paymentActionsTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  qrPayBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', marginBottom: Spacing.md, ...Shadow.md,
  },
  qrPayBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  cashPayBtn: {
    backgroundColor: Colors.successLight, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center',
  },
  cashPayBtnText: { fontSize: 15, fontWeight: '700', color: Colors.success },

  paidInfo: { backgroundColor: Colors.successLight, borderRadius: BorderRadius.lg, padding: Spacing.md },
  paidInfoText: { fontSize: 14, color: Colors.success, lineHeight: 22, fontWeight: '500' },

  qrSubtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.md },
  qrImageContainer: {
    alignItems: 'center', backgroundColor: Colors.white, padding: Spacing.md,
    borderRadius: BorderRadius.lg, borderWidth: 2, borderColor: Colors.divider,
    alignSelf: 'center', marginBottom: Spacing.md,
  },
  qrImage: { width: 220, height: 280 },
  bankInfoBox: { backgroundColor: Colors.background, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.lg },
  bankRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm },
  bankLabel: { fontSize: 13, color: Colors.textMuted },
  bankVal: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

  confirmPayBtn: {
    backgroundColor: Colors.success, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', marginBottom: Spacing.md, ...Shadow.md,
  },
  confirmPayBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  cashAmount: { fontSize: 22, fontWeight: '800', color: Colors.primary, textAlign: 'center', marginBottom: Spacing.lg },
  cashNoteInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    padding: Spacing.md, fontSize: 14, marginBottom: Spacing.lg, minHeight: 80,
  },
  cancelBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },

  billDetailSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    maxHeight: SCREEN_HEIGHT * 0.92,
  },
  billDetailContent: { padding: Spacing.xl, paddingBottom: 40 },
});
