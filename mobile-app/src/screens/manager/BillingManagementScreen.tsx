import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, Alert, Image, TextInput, ScrollView, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { useBills, billsStore, SharedBill } from '../../store/billsStore';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// ===================== TYPES =====================
type BillStatus = 'pending' | 'paid' | 'overdue' | 'partial';
type Bill = SharedBill;
type PaymentMethod = 'qr' | 'bank_transfer' | 'cash' | 'ewallet';
type TabType = 'bills' | 'payments';

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
  verifiedBy?: string;
}

// ===================== MOCK DATA =====================
const VIETQR_BANK_BIN = '970422';
const VIETQR_ACCOUNT = '0865803493';

const MOCK_PAYMENTS: PaymentRecord[] = [
  {
    id: 'p1', billCode: 'HD-T5-102', tenantName: 'Lê Thị B', roomName: 'P102',
    amount: 3860000, method: 'qr', status: 'verified',
    transferContent: 'HD-T5-102 Phong 102 Le Thi B',
    createdAt: '2026-05-10T14:30:00', verifiedAt: '2026-05-10T14:35:00', verifiedBy: 'Manager',
  },
  {
    id: 'p2', billCode: 'HD-T5-101', tenantName: 'Trần Văn A', roomName: 'P101',
    amount: 4352500, method: 'bank_transfer', status: 'pending_verify',
    transferContent: 'CK tien phong thang 5 Tran Van A',
    createdAt: '2026-05-14T09:15:00',
  },
  {
    id: 'p3', billCode: 'HD-T5-201', tenantName: 'Phạm Thị C', roomName: 'P201',
    amount: 3200000, method: 'ewallet', status: 'verified',
    transferContent: 'Thanh toan qua MoMo',
    createdAt: '2026-05-12T16:45:00', verifiedAt: '2026-05-12T17:00:00', verifiedBy: 'Manager',
  },
];

const TODAY_COLLECTION = {
  count: 2,
  totalAmount: 8705000,
  items: [
    { room: 'P101', tenant: 'Trần Văn A', amount: 4352500, daysOverdue: 3 },
    { room: 'P301', tenant: 'Ngô Thị D', amount: 4352500, daysOverdue: 0 },
  ],
};

// ===================== HELPERS =====================
const buildQRUrl = (amount: number, content: string) =>
  `https://img.vietqr.io/image/${VIETQR_BANK_BIN}-${VIETQR_ACCOUNT}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(content)}&accountName=ROOMRENT`;

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';
const fmtDate = (iso: string) => {
  const [d, t] = iso.split('T');
  return `${d} ${t?.slice(0, 5) ?? ''}`.trim();
};

const STATUS_CONFIG: Record<BillStatus, { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: 'Chưa thanh toán', color: '#F59E0B', bg: '#FFFBEB', icon: '⏳' },
  paid:    { label: 'Đã thanh toán',   color: '#10B981', bg: '#F0FDF4', icon: '✅' },
  overdue: { label: 'Quá hạn',         color: '#EF4444', bg: '#FEF2F2', icon: '🚨' },
  partial: { label: 'Thanh toán một phần', color: '#3B82F6', bg: '#EFF6FF', icon: '💛' },
};

const PAYMENT_STATUS_CONFIG = {
  pending_verify: { label: 'Chờ xác nhận', color: '#F59E0B', bg: '#FFFBEB' },
  verified:       { label: 'Đã xác nhận',  color: '#10B981', bg: '#F0FDF4' },
  rejected:       { label: 'Từ chối',      color: '#EF4444', bg: '#FEF2F2' },
};

const METHOD_CONFIG: Record<PaymentMethod, { label: string; icon: string }> = {
  qr:            { label: 'QR VietQR',    icon: '📱' },
  bank_transfer: { label: 'Chuyển khoản', icon: '🏦' },
  cash:          { label: 'Tiền mặt',     icon: '💵' },
  ewallet:       { label: 'Ví điện tử',   icon: '👛' },
};

// Item icons for invoice breakdown
const ITEM_ICONS: Record<string, string> = {
  'Tiền phòng': '🏠',
  'Điện': '⚡',
  'Nước': '💧',
  'Phí dịch vụ': '🧹',
  'Phí quản lý': '🔑',
  'default': '📄',
};

const getItemIcon = (label: string) => {
  for (const key of Object.keys(ITEM_ICONS)) {
    if (label.includes(key)) return ITEM_ICONS[key];
  }
  return ITEM_ICONS['default'];
};

// ===================== BILL CARD =====================
const BillCard: React.FC<{ bill: Bill; onPress: () => void }> = ({ bill, onPress }) => {
  const cfg = STATUS_CONFIG[bill.status];
  return (
    <TouchableOpacity style={[styles.billCard, bill.status === 'overdue' && styles.billCardOverdue]} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.billCardHeader}>
        <View style={{ flex: 1 }}>
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
          {bill.daysOverdue != null && bill.daysOverdue > 0 && (
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
  const bills = useBills();
  const [payments, setPayments] = useState(MOCK_PAYMENTS);
  const [statusFilter, setStatusFilter] = useState<'all' | BillStatus>('all');
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [showEwalletModal, setShowEwalletModal] = useState(false);
  const [cashNote, setCashNote] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);
  const [expandedItems, setExpandedItems] = useState(false);
  const [showCollectionDetail, setShowCollectionDetail] = useState(false);

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

  const pendingVerifications = payments.filter(p => p.status === 'pending_verify').length;

  const handleMarkPaidCash = () => {
    if (!selectedBill) return;
    billsStore.updateStatus(selectedBill.id, 'paid', {
      paidAt: new Date().toISOString().split('T')[0],
      paymentMethod: 'cash',
      paidAmount: selectedBill.grandTotal,
    });
    setShowCashModal(false);
    setSelectedBill(null);
    Alert.alert('✅ Thành công', 'Đã ghi nhận thanh toán tiền mặt.');
  };

  const handleMarkPaidEwallet = () => {
    if (!selectedBill) return;
    billsStore.updateStatus(selectedBill.id, 'paid', {
      paidAt: new Date().toISOString().split('T')[0],
      paymentMethod: 'other',
      paidAmount: selectedBill.grandTotal,
    });
    setShowEwalletModal(false);
    setSelectedBill(null);
    Alert.alert('✅ Thành công', 'Đã ghi nhận thanh toán ví điện tử.');
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
                  ? { ...p, status: approved ? 'verified' : 'rejected', verifiedAt: new Date().toISOString(), verifiedBy: 'Manager' }
                  : p
              ));
              if (approved) {
                billsStore.updateByCode(payment.billCode, 'paid', {
                  paidAt: new Date().toISOString().split('T')[0],
                  paidAmount: payment.amount,
                });
              }
              setSelectedPayment(null);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Hóa đơn & Thanh toán</Text>
        <Text style={styles.subtitle}>Tháng 05/2026</Text>
      </View>

      {/* Today Collection Banner */}
      {TODAY_COLLECTION.count > 0 && (
        <TouchableOpacity
          style={styles.collectionBanner}
          onPress={() => setShowCollectionDetail(!showCollectionDetail)}
          activeOpacity={0.9}
        >
          <View style={styles.collectionBannerLeft}>
            <Text style={styles.collectionBannerIcon}>📋</Text>
            <View>
              <Text style={styles.collectionBannerTitle}>Cần thu hôm nay</Text>
              <Text style={styles.collectionBannerDesc}>
                {TODAY_COLLECTION.count} hóa đơn · Tổng: {fmt(TODAY_COLLECTION.totalAmount)}
              </Text>
            </View>
          </View>
          <Text style={styles.collectionBannerArrow}>{showCollectionDetail ? '▲' : '▼'}</Text>
        </TouchableOpacity>
      )}

      {showCollectionDetail && (
        <View style={styles.collectionDetail}>
          {TODAY_COLLECTION.items.map((item, i) => (
            <View key={i} style={styles.collectionItem}>
              <View>
                <Text style={styles.collectionItemRoom}>{item.room} · {item.tenant}</Text>
                {item.daysOverdue > 0 && (
                  <Text style={styles.collectionItemOverdue}>Quá hạn {item.daysOverdue} ngày</Text>
                )}
              </View>
              <Text style={styles.collectionItemAmount}>{fmt(item.amount)}</Text>
            </View>
          ))}
        </View>
      )}

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
        <TouchableOpacity style={[styles.tab, tab === 'bills' && styles.tabActive]} onPress={() => setTab('bills')}>
          <Text style={[styles.tabText, tab === 'bills' && styles.tabTextActive]}>
            🧾 Hóa đơn ({bills.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'payments' && styles.tabActive]} onPress={() => setTab('payments')}>
          <Text style={[styles.tabText, tab === 'payments' && styles.tabTextActive]}>
            💳 Thanh toán {pendingVerifications > 0 ? `(${pendingVerifications}!)` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'bills' ? (
        <>
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
              <BillCard bill={item} onPress={() => { setSelectedBill(item); setExpandedItems(false); }} />
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
        <FlatList
          data={payments}
          keyExtractor={i => i.id}
          renderItem={({ item }) => {
            const cfg = PAYMENT_STATUS_CONFIG[item.status];
            const methodCfg = METHOD_CONFIG[item.method];
            return (
              <TouchableOpacity style={styles.paymentCard} onPress={() => setSelectedPayment(item)}>
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
                  <View style={styles.paymentMethodRow}>
                    <Text style={styles.paymentMethodIcon}>{methodCfg.icon}</Text>
                    <Text style={styles.paymentMethod}>{methodCfg.label}</Text>
                  </View>
                  <Text style={styles.paymentAmount}>{fmt(item.amount)}</Text>
                </View>
                <View style={styles.paymentMetaRow}>
                  <Text style={styles.paymentDate}>📅 {fmtDate(item.createdAt)}</Text>
                  {item.verifiedAt && (
                    <Text style={styles.paymentVerified}>✓ {fmtDate(item.verifiedAt)}</Text>
                  )}
                </View>
                {item.transferContent && (
                  <Text style={styles.paymentContent} numberOfLines={1}>
                    Nội dung: {item.transferContent}
                  </Text>
                )}
                {item.status === 'pending_verify' && (
                  <View style={styles.verifyActions}>
                    <TouchableOpacity style={styles.rejectBtn} onPress={() => handleVerifyPayment(item.id, false)}>
                      <Text style={styles.rejectBtnText}>Từ chối</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.approveBtn} onPress={() => handleVerifyPayment(item.id, true)}>
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
      {selectedBill && !showQRModal && !showCashModal && !showEwalletModal && (
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
                  {[
                    { label: 'Khách thuê', val: selectedBill.tenantName },
                    { label: 'Phòng', val: `${selectedBill.propertyName} · ${selectedBill.roomName}` },
                    { label: 'Tháng', val: `T${String(selectedBill.month).padStart(2,'0')}/${selectedBill.year}` },
                    { label: 'Hạn thanh toán', val: selectedBill.dueDate, overdue: selectedBill.status === 'overdue' },
                  ].map((row, i) => (
                    <View key={i} style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{row.label}</Text>
                      <Text style={[styles.detailVal, row.overdue && { color: Colors.error }]}>{row.val}</Text>
                    </View>
                  ))}
                </View>

                {/* Expandable Invoice Breakdown */}
                <TouchableOpacity
                  style={styles.breakdownToggle}
                  onPress={() => setExpandedItems(!expandedItems)}
                >
                  <Text style={styles.breakdownToggleText}>Chi tiết hóa đơn</Text>
                  <Text style={styles.breakdownToggleIcon}>{expandedItems ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {expandedItems && (
                  <View style={styles.itemsSection}>
                    {selectedBill.items.map((item, i) => (
                      <View key={i} style={styles.itemRow}>
                        <View style={styles.itemLabelRow}>
                          <Text style={styles.itemIcon}>{getItemIcon(item.label)}</Text>
                          <Text style={styles.itemLabel}>{item.label}</Text>
                        </View>
                        <Text style={styles.itemAmount}>{fmt(item.amount)}</Text>
                      </View>
                    ))}
                    {selectedBill.lateFee > 0 && (
                      <View style={styles.itemRow}>
                        <View style={styles.itemLabelRow}>
                          <Text style={styles.itemIcon}>⏰</Text>
                          <Text style={[styles.itemLabel, { color: Colors.error }]}>
                            Phí trễ hạn ({selectedBill.daysOverdue} ngày)
                          </Text>
                        </View>
                        <Text style={[styles.itemAmount, { color: Colors.error }]}>{fmt(selectedBill.lateFee)}</Text>
                      </View>
                    )}
                    <View style={styles.totalRow}>
                      <Text style={styles.totalLabel}>TỔNG CỘNG</Text>
                      <Text style={styles.totalAmount}>{fmt(selectedBill.grandTotal)}</Text>
                    </View>
                  </View>
                )}

                {!expandedItems && (
                  <View style={styles.totalRowCompact}>
                    <Text style={styles.totalLabel}>TỔNG CỘNG</Text>
                    <Text style={styles.totalAmount}>{fmt(selectedBill.grandTotal)}</Text>
                  </View>
                )}

                {selectedBill.status !== 'paid' && (
                  <View style={styles.paymentActions}>
                    <Text style={styles.paymentActionsTitle}>Ghi nhận thanh toán</Text>
                    <TouchableOpacity style={styles.qrPayBtn} onPress={() => setShowQRModal(true)}>
                      <Text style={styles.qrPayBtnText}>📱 Hiện QR cho khách quét</Text>
                    </TouchableOpacity>
                    <View style={styles.payAltRow}>
                      <TouchableOpacity style={styles.payAltBtn} onPress={() => setShowCashModal(true)}>
                        <Text style={styles.payAltIcon}>💵</Text>
                        <Text style={styles.payAltText}>Tiền mặt</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.payAltBtn} onPress={() => setShowEwalletModal(true)}>
                        <Text style={styles.payAltIcon}>👛</Text>
                        <Text style={styles.payAltText}>Ví điện tử</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.payAltBtn}
                        onPress={() => {
                          billsStore.updateStatus(selectedBill.id, 'paid', {
                            paidAt: new Date().toISOString().split('T')[0],
                            paymentMethod: 'bank_transfer',
                            paidAmount: selectedBill.grandTotal,
                          });
                          setSelectedBill(null);
                          Alert.alert('✅ Thành công', 'Đã ghi nhận chuyển khoản ngân hàng.');
                        }}
                      >
                        <Text style={styles.payAltIcon}>🏦</Text>
                        <Text style={styles.payAltText}>CK ngân hàng</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {selectedBill.status === 'paid' && (
                  <View style={styles.paidInfo}>
                    <Text style={styles.paidInfoText}>
                      ✅ Đã thanh toán ngày {selectedBill.paidAt}
                      {selectedBill.paymentMethod ? `\nPhương thức: ${METHOD_CONFIG[selectedBill.paymentMethod as PaymentMethod]?.label ?? selectedBill.paymentMethod}` : ''}
                      {selectedBill.transactionId ? `\nMã GD: ${selectedBill.transactionId}` : ''}
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
                <Text style={styles.qrSubtitle}>{selectedBill.tenantName} — {fmt(selectedBill.grandTotal)}</Text>
                <View style={styles.qrImageContainer}>
                  <Image
                    source={{ uri: buildQRUrl(selectedBill.grandTotal, `${selectedBill.code} ${selectedBill.tenantName}`) }}
                    style={styles.qrImage}
                    resizeMode="contain"
                  />
                </View>
                <View style={styles.bankInfoBox}>
                  {[
                    { label: 'Ngân hàng', val: 'MB Bank' },
                    { label: 'Số TK', val: VIETQR_ACCOUNT },
                    { label: 'Số tiền', val: fmt(selectedBill.grandTotal), primary: true },
                    { label: 'Nội dung', val: `${selectedBill.code} ${selectedBill.tenantName}` },
                  ].map((row, i) => (
                    <View key={i} style={styles.bankRow}>
                      <Text style={styles.bankLabel}>{row.label}</Text>
                      <Text style={[styles.bankVal, row.primary && { color: Colors.primary, fontWeight: '800' }]}>
                        {row.val}
                      </Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  style={styles.confirmPayBtn}
                  onPress={() => {
                    billsStore.updateStatus(selectedBill.id, 'paid', {
                      paidAt: new Date().toISOString().split('T')[0],
                      paymentMethod: 'qr',
                      paidAmount: selectedBill.grandTotal,
                    });
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
              <View style={styles.cashAmountBox}>
                <Text style={styles.cashAmountLabel}>Số tiền cần thu</Text>
                <Text style={styles.cashAmount}>{fmt(selectedBill.grandTotal)}</Text>
              </View>
              <Text style={styles.cashHint}>
                Xác nhận sau khi đã đếm đủ tiền mặt từ khách thuê.
              </Text>
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
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { setShowCashModal(false); setCashNote(''); }}>
                <Text style={styles.cancelBtnText}>Hủy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* E-wallet Modal */}
      {showEwalletModal && selectedBill && (
        <Modal transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>👛 Ví điện tử</Text>
              <View style={styles.cashAmountBox}>
                <Text style={styles.cashAmountLabel}>Số tiền</Text>
                <Text style={styles.cashAmount}>{fmt(selectedBill.grandTotal)}</Text>
              </View>
              <Text style={styles.cashHint}>
                Chọn ví điện tử khách đã thanh toán:
              </Text>
              {['MoMo', 'ZaloPay', 'VNPay', 'Ví khác'].map(wallet => (
                <TouchableOpacity
                  key={wallet}
                  style={styles.ewalletOption}
                  onPress={handleMarkPaidEwallet}
                >
                  <Text style={styles.ewalletOptionText}>👛 {wallet}</Text>
                  <Text style={styles.ewalletOptionArrow}>→</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowEwalletModal(false)}>
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

  collectionBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.primary, marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  collectionBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  collectionBannerIcon: { fontSize: 20 },
  collectionBannerTitle: { fontSize: 13, fontWeight: '700', color: Colors.white },
  collectionBannerDesc: { fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  collectionBannerArrow: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '700' },
  collectionDetail: {
    marginHorizontal: Spacing.lg, backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm,
  },
  collectionItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  collectionItemRoom: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  collectionItemOverdue: { fontSize: 11, color: Colors.error, marginTop: 2 },
  collectionItemAmount: { fontSize: 14, fontWeight: '800', color: Colors.primary },

  summaryScroll: { flexGrow: 0, marginBottom: Spacing.sm },
  summaryContent: { paddingHorizontal: Spacing.lg, paddingVertical: 6, alignItems: 'center' },
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
  tab: { flex: 1, paddingVertical: Spacing.md, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary },

  filterRow: { flexGrow: 0, marginTop: Spacing.sm, marginBottom: Spacing.sm },
  filterContent: { paddingHorizontal: Spacing.lg, paddingVertical: 4, alignItems: 'center' },
  filterChip: {
    height: 34, justifyContent: 'center', paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border, marginRight: Spacing.sm,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },

  listContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: 100 },

  billCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, ...Shadow.sm, borderWidth: 1, borderColor: Colors.border,
  },
  billCardOverdue: { borderColor: Colors.error + '50', borderWidth: 1.5 },
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
  paymentAmountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  paymentMethodRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  paymentMethodIcon: { fontSize: 14 },
  paymentMethod: { fontSize: 13, color: Colors.textSecondary },
  paymentAmount: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  paymentMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  paymentDate: { fontSize: 11, color: Colors.textMuted },
  paymentVerified: { fontSize: 11, color: Colors.success, fontWeight: '600' },
  paymentContent: { fontSize: 11, color: Colors.textMuted, fontStyle: 'italic' },
  verifyActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  rejectBtn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.errorLight, alignItems: 'center' },
  rejectBtnText: { fontSize: 13, fontWeight: '600', color: Colors.error },
  approveBtn: { flex: 2, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.primary, alignItems: 'center' },
  approveBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: Spacing.md },
  emptyText: { fontSize: 14, color: Colors.textMuted },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl, padding: Spacing.xl, paddingBottom: 40,
  },
  billDetailSheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl, maxHeight: SCREEN_HEIGHT * 0.92,
  },
  billDetailContent: { padding: Spacing.xl, paddingBottom: 40 },
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

  breakdownToggle: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 10, marginBottom: Spacing.sm,
  },
  breakdownToggleText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  breakdownToggleIcon: { fontSize: 12, color: Colors.primary, fontWeight: '700' },

  itemsSection: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.md,
  },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  itemLabelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  itemIcon: { fontSize: 16, width: 24 },
  itemLabel: { fontSize: 14, color: Colors.textSecondary, flex: 1 },
  itemAmount: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.md,
    borderTopWidth: 1.5, borderColor: Colors.divider, marginTop: Spacing.sm,
  },
  totalRowCompact: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.lg,
  },
  totalLabel: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  totalAmount: { fontSize: 20, fontWeight: '800', color: Colors.primary },

  paymentActions: { marginBottom: Spacing.md },
  paymentActionsTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  qrPayBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', marginBottom: Spacing.md, ...Shadow.md,
  },
  qrPayBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  payAltRow: { flexDirection: 'row', gap: Spacing.sm },
  payAltBtn: {
    flex: 1, backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  payAltIcon: { fontSize: 20, marginBottom: 4 },
  payAltText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary, textAlign: 'center' },

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

  cashAmountBox: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg,
    padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.md,
  },
  cashAmountLabel: { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
  cashAmount: { fontSize: 28, fontWeight: '800', color: Colors.primary },
  cashHint: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.md, lineHeight: 18 },
  cashNoteInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    padding: Spacing.md, fontSize: 14, marginBottom: Spacing.lg, minHeight: 80,
  },
  cancelBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },

  ewalletOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: 14, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  ewalletOptionText: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  ewalletOptionArrow: { fontSize: 16, color: Colors.textMuted },
});
