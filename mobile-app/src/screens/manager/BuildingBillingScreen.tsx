import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, Alert, Image, TextInput, ScrollView, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { useBills, billsStore, SharedBill } from '../../store/billsStore';
import { getPropertyById } from '../../data/managedProperties';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// ===================== TYPES =====================
type BillStatus    = 'pending' | 'paid' | 'overdue' | 'partial';
type PaymentMethod = 'qr' | 'bank_transfer' | 'cash' | 'ewallet';
type FilterType    = 'all' | BillStatus;

// ===================== CONSTANTS =====================
const VIETQR_BANK_BIN = '970422';
const VIETQR_ACCOUNT  = '0865803493';

const buildQRUrl = (amount: number, content: string) =>
  `https://img.vietqr.io/image/${VIETQR_BANK_BIN}-${VIETQR_ACCOUNT}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(content)}&accountName=ROOMRENT`;

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

const STATUS_CONFIG: Record<BillStatus, { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: 'Chưa thanh toán',     color: '#F59E0B', bg: '#FFFBEB', icon: '⏳' },
  paid:    { label: 'Đã thanh toán',        color: '#10B981', bg: '#F0FDF4', icon: '✅' },
  overdue: { label: 'Quá hạn',             color: '#EF4444', bg: '#FEF2F2', icon: '🚨' },
  partial: { label: 'Thanh toán một phần', color: '#3B82F6', bg: '#EFF6FF', icon: '💛' },
};

const METHOD_CONFIG: Record<PaymentMethod, { label: string; icon: string }> = {
  qr:            { label: 'QR VietQR',    icon: '📱' },
  bank_transfer: { label: 'Chuyển khoản', icon: '🏦' },
  cash:          { label: 'Tiền mặt',     icon: '💵' },
  ewallet:       { label: 'Ví điện tử',   icon: '👛' },
};

const ITEM_ICONS: Record<string, string> = {
  'Tiền phòng': '🏠', 'Điện': '⚡', 'Nước': '💧',
  'Phí dịch vụ': '🧹', 'Phí quản lý': '🔑', 'default': '📄',
};

const FILTERS: { id: FilterType; label: string }[] = [
  { id: 'all',     label: 'Tất cả' },
  { id: 'pending', label: '⏳ Chưa thu' },
  { id: 'overdue', label: '🚨 Quá hạn' },
  { id: 'paid',    label: '✅ Đã thu' },
  { id: 'partial', label: '💛 Một phần' },
];

const STATUS_ORDER: Record<BillStatus, number> = { overdue: 0, pending: 1, partial: 2, paid: 3 };

const getItemIcon = (label: string) => {
  for (const key of Object.keys(ITEM_ICONS)) {
    if (label.includes(key)) return ITEM_ICONS[key];
  }
  return ITEM_ICONS['default'];
};

// ===================== SCREEN =====================
export const BuildingBillingScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route      = useRoute<any>();
  const { propertyId, propertyName } = route.params as { propertyId: string; propertyName: string };
  const prop = getPropertyById(propertyId);
  const isWholeHouse = prop?.propertyType === 'WHOLE_HOUSE';

  const allBills      = useBills();
  const buildingBills = useMemo(
    () => allBills.filter(b => b.propertyId === propertyId),
    [allBills, propertyId],
  );

  const [search,            setSearch]            = useState('');
  const [filter,            setFilter]            = useState<FilterType>('all');
  const [selectedBill,      setSelectedBill]      = useState<SharedBill | null>(null);
  const [showQRModal,       setShowQRModal]       = useState(false);
  const [showCashModal,     setShowCashModal]     = useState(false);
  const [showEwalletModal,  setShowEwalletModal]  = useState(false);
  const [cashNote,          setCashNote]          = useState('');
  const [expandedItems,     setExpandedItems]     = useState(false);

  const filteredBills = useMemo(() => {
    let list = buildingBills;
    if (filter !== 'all') list = list.filter(b => b.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        b.tenantName.toLowerCase().includes(q) ||
        b.roomName.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
  }, [buildingBills, filter, search]);

  const stats = useMemo(() => {
    const paid    = buildingBills.filter(b => b.status === 'paid');
    const overdue = buildingBills.filter(b => b.status === 'overdue');
    return {
      total:        buildingBills.length,
      paidCount:    paid.length,
      paidAmt:      paid.reduce((s, b) => s + b.grandTotal, 0),
      overdueCount: overdue.length,
      uncollected:  buildingBills.filter(b => b.status !== 'paid').reduce((s, b) => s + b.grandTotal, 0),
    };
  }, [buildingBills]);

  const payRate  = stats.total > 0 ? Math.round((stats.paidCount / stats.total) * 100) : 0;
  const barColor = payRate >= 80 ? Colors.success : payRate >= 50 ? Colors.warning : Colors.error;

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
      paymentMethod: 'other' as any,
      paidAmount: selectedBill.grandTotal,
    });
    setShowEwalletModal(false);
    setSelectedBill(null);
    Alert.alert('✅ Thành công', 'Đã ghi nhận thanh toán ví điện tử.');
  };

  return (
    <SafeAreaView style={s.safe}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{propertyName}</Text>
          <Text style={s.headerSub}>Hóa đơn · Tháng 05/2026</Text>
        </View>
      </View>

      {/* ── Summary card ─────────────────────────────────────────── */}
      <View style={s.summaryCard}>
        <View style={s.summaryRow}>
          <View style={s.summaryStat}>
            <Text style={[s.summaryNum, { color: Colors.success }]}>{stats.paidCount}/{stats.total}</Text>
            <Text style={s.summaryLbl}>Đã thu</Text>
          </View>
          <View style={s.summarySep} />
          <View style={s.summaryStat}>
            <Text style={[s.summaryNum, { color: stats.overdueCount > 0 ? Colors.error : Colors.textMuted }]}>
              {stats.overdueCount}
            </Text>
            <Text style={s.summaryLbl}>Quá hạn</Text>
          </View>
          <View style={s.summarySep} />
          <View style={[s.summaryStat, { flex: 1.6 }]}>
            <Text style={[s.summaryAmtNum, { color: stats.uncollected > 0 ? Colors.warning : Colors.success }]}>
              {stats.uncollected > 0 ? fmt(stats.uncollected) : fmt(stats.paidAmt)}
            </Text>
            <Text style={s.summaryLbl}>{stats.uncollected > 0 ? 'Cần thu' : 'Đã thu'}</Text>
          </View>
        </View>
        <View style={s.progRow}>
          <View style={s.progBg}>
            <View style={[s.progFill, { width: `${payRate}%` as any, backgroundColor: barColor }]} />
          </View>
          <Text style={[s.progPct, { color: barColor }]}>{payRate}% đã thu</Text>
        </View>
      </View>

      {/* ── Search ───────────────────────────────────────────────── */}
      <View style={s.searchBar}>
        <Text style={s.searchIcon}>🔍</Text>
        <TextInput
          style={s.searchInput}
          placeholder={isWholeHouse ? 'Tìm theo người đại diện, mã hóa đơn...' : 'Tìm theo tên, phòng, mã hóa đơn...'}
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={s.searchClear}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Filter chips ─────────────────────────────────────────── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={s.filterScroll} contentContainerStyle={s.filterContent}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.id}
            style={[s.filterChip, filter === f.id && s.filterChipActive]}
            onPress={() => setFilter(f.id)}
          >
            <Text style={[s.filterText, filter === f.id && s.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Bill list ────────────────────────────────────────────── */}
      <FlatList
        data={filteredBills}
        keyExtractor={i => i.id}
        renderItem={({ item }) => {
          const cfg = STATUS_CONFIG[item.status];
          return (
            <TouchableOpacity
              style={[s.billCard, item.status === 'overdue' && s.billCardOverdue]}
              onPress={() => { setSelectedBill(item); setExpandedItems(false); }}
              activeOpacity={0.8}
            >
              <View style={s.billCardHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.billCode}>{item.code}</Text>
                  <Text style={s.billRoom}>{isWholeHouse || item.propertyType === 'WHOLE_HOUSE' ? 'Nhà nguyên căn' : item.roomName}</Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: cfg.bg }]}>
                  <Text style={s.statusIcon}>{cfg.icon}</Text>
                  <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              </View>
              <View style={s.billTenantRow}>
                <Text style={s.billTenant}>👤 {item.tenantName}</Text>
                <Text style={s.billMonth}>T{String(item.month).padStart(2, '0')}/{item.year}</Text>
              </View>
              <View style={s.billAmountRow}>
                <View>
                  <Text style={s.billDue}>Hạn: {item.dueDate}</Text>
                  {item.daysOverdue != null && item.daysOverdue > 0 && (
                    <Text style={s.billOverdueDays}>Quá hạn {item.daysOverdue} ngày</Text>
                  )}
                  {item.lateFee > 0 && (
                    <Text style={s.billLateFee}>Phí trễ: {fmt(item.lateFee)}</Text>
                  )}
                </View>
                <Text style={[s.billTotal, item.status === 'overdue' && { color: Colors.error }]}>
                  {fmt(item.grandTotal)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListEmptyComponent={
          <View style={s.emptyState}>
            <Text style={{ fontSize: 40 }}>🧾</Text>
            <Text style={s.emptyText}>Không có hóa đơn phù hợp</Text>
          </View>
        }
      />

      {/* ── Bill Detail Modal ─────────────────────────────────────── */}
      {selectedBill && !showQRModal && !showCashModal && !showEwalletModal && (
        <Modal transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={s.billDetailSheet}>
              <ScrollView bounces={false} showsVerticalScrollIndicator={false}
                contentContainerStyle={s.billDetailContent}>
                <View style={s.modalHeader}>
                  <Text style={s.modalTitle}>{selectedBill.code}</Text>
                  <TouchableOpacity onPress={() => setSelectedBill(null)}>
                    <Text style={s.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={[s.statusBannerFull, { backgroundColor: STATUS_CONFIG[selectedBill.status].bg }]}>
                  <Text style={s.statusBannerIcon}>{STATUS_CONFIG[selectedBill.status].icon}</Text>
                  <Text style={[s.statusBannerText, { color: STATUS_CONFIG[selectedBill.status].color }]}>
                    {STATUS_CONFIG[selectedBill.status].label}
                  </Text>
                </View>

                <View style={s.detailSection}>
                  {[
                    { label: isWholeHouse || selectedBill.propertyType === 'WHOLE_HOUSE' ? 'Người đại diện' : 'Khách thuê', val: selectedBill.tenantName },
                    { label: isWholeHouse || selectedBill.propertyType === 'WHOLE_HOUSE' ? 'Tài sản thuê' : 'Phòng', val: isWholeHouse || selectedBill.propertyType === 'WHOLE_HOUSE' ? selectedBill.propertyName : selectedBill.roomName },
                    { label: 'Tháng',      val: `T${String(selectedBill.month).padStart(2,'0')}/${selectedBill.year}` },
                    { label: 'Hạn thanh toán', val: selectedBill.dueDate, overdue: selectedBill.status === 'overdue' },
                  ].map((row, i) => (
                    <View key={i} style={s.detailRow}>
                      <Text style={s.detailLabel}>{row.label}</Text>
                      <Text style={[s.detailVal, row.overdue && { color: Colors.error }]}>{row.val}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={s.breakdownToggle}
                  onPress={() => setExpandedItems(!expandedItems)}
                >
                  <Text style={s.breakdownToggleText}>Chi tiết hóa đơn</Text>
                  <Text style={s.breakdownToggleIcon}>{expandedItems ? '▲' : '▼'}</Text>
                </TouchableOpacity>

                {expandedItems && (
                  <View style={s.itemsSection}>
                    {selectedBill.items.map((item, i) => (
                      <View key={i} style={s.itemRow}>
                        <View style={s.itemLabelRow}>
                          <Text style={s.itemIcon}>{getItemIcon(item.label)}</Text>
                          <Text style={s.itemLabel}>{item.label}</Text>
                        </View>
                        <Text style={s.itemAmount}>{fmt(item.amount)}</Text>
                      </View>
                    ))}
                    {selectedBill.lateFee > 0 && (
                      <View style={s.itemRow}>
                        <View style={s.itemLabelRow}>
                          <Text style={s.itemIcon}>⏰</Text>
                          <Text style={[s.itemLabel, { color: Colors.error }]}>
                            Phí trễ hạn ({selectedBill.daysOverdue} ngày)
                          </Text>
                        </View>
                        <Text style={[s.itemAmount, { color: Colors.error }]}>{fmt(selectedBill.lateFee)}</Text>
                      </View>
                    )}
                    <View style={s.totalRow}>
                      <Text style={s.totalLabel}>TỔNG CỘNG</Text>
                      <Text style={s.totalAmount}>{fmt(selectedBill.grandTotal)}</Text>
                    </View>
                  </View>
                )}

                {!expandedItems && (
                  <View style={s.totalRowCompact}>
                    <Text style={s.totalLabel}>TỔNG CỘNG</Text>
                    <Text style={s.totalAmount}>{fmt(selectedBill.grandTotal)}</Text>
                  </View>
                )}

                {selectedBill.status !== 'paid' && (
                  <View style={s.paymentActions}>
                    <Text style={s.paymentActionsTitle}>Ghi nhận thanh toán</Text>
                    <TouchableOpacity style={s.qrPayBtn} onPress={() => setShowQRModal(true)}>
                      <Text style={s.qrPayBtnText}>📱 Hiện QR cho khách quét</Text>
                    </TouchableOpacity>
                    <View style={s.payAltRow}>
                      <TouchableOpacity style={s.payAltBtn} onPress={() => setShowCashModal(true)}>
                        <Text style={s.payAltIcon}>💵</Text>
                        <Text style={s.payAltText}>Tiền mặt</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.payAltBtn} onPress={() => setShowEwalletModal(true)}>
                        <Text style={s.payAltIcon}>👛</Text>
                        <Text style={s.payAltText}>Ví điện tử</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.payAltBtn}
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
                        <Text style={s.payAltIcon}>🏦</Text>
                        <Text style={s.payAltText}>CK ngân hàng</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {selectedBill.status === 'paid' && (
                  <View style={s.paidInfo}>
                    <Text style={s.paidInfoText}>
                      ✅ Đã thanh toán ngày {selectedBill.paidAt}
                      {selectedBill.paymentMethod
                        ? `\nPhương thức: ${METHOD_CONFIG[selectedBill.paymentMethod as PaymentMethod]?.label ?? selectedBill.paymentMethod}`
                        : ''}
                      {selectedBill.transactionId ? `\nMã GD: ${selectedBill.transactionId}` : ''}
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* ── QR Payment Modal ──────────────────────────────────────── */}
      {showQRModal && selectedBill && (
        <Modal transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={s.billDetailSheet}>
              <ScrollView bounces={false} showsVerticalScrollIndicator={false}
                contentContainerStyle={s.billDetailContent}>
                <View style={s.modalHeader}>
                  <Text style={s.modalTitle}>QR Thanh toán</Text>
                  <TouchableOpacity onPress={() => setShowQRModal(false)}>
                    <Text style={s.modalClose}>✕</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.qrSubtitle}>{selectedBill.tenantName} — {fmt(selectedBill.grandTotal)}</Text>
                <View style={s.qrImageContainer}>
                  <Image
                    source={{ uri: buildQRUrl(selectedBill.grandTotal, `${selectedBill.code} ${selectedBill.tenantName}`) }}
                    style={s.qrImage}
                    resizeMode="contain"
                  />
                </View>
                <View style={s.bankInfoBox}>
                  {[
                    { label: 'Ngân hàng', val: 'MB Bank' },
                    { label: 'Số TK',     val: VIETQR_ACCOUNT },
                    { label: 'Số tiền',   val: fmt(selectedBill.grandTotal), primary: true },
                    { label: 'Nội dung',  val: `${selectedBill.code} ${selectedBill.tenantName}` },
                  ].map((row, i) => (
                    <View key={i} style={s.bankRow}>
                      <Text style={s.bankLabel}>{row.label}</Text>
                      <Text style={[s.bankVal, row.primary && { color: Colors.primary, fontWeight: '800' }]}>
                        {row.val}
                      </Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  style={s.confirmPayBtn}
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
                  <Text style={s.confirmPayBtnText}>✅ Xác nhận đã thanh toán</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Cash Modal ───────────────────────────────────────────── */}
      {showCashModal && selectedBill && (
        <Modal transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              <Text style={s.modalTitle}>💵 Ghi nhận tiền mặt</Text>
              <View style={s.cashAmountBox}>
                <Text style={s.cashAmountLabel}>Số tiền cần thu</Text>
                <Text style={s.cashAmount}>{fmt(selectedBill.grandTotal)}</Text>
              </View>
              <Text style={s.cashHint}>Xác nhận sau khi đã đếm đủ tiền mặt từ khách thuê.</Text>
              <TextInput
                style={s.cashNoteInput}
                placeholder="Ghi chú (tùy chọn)..."
                value={cashNote}
                onChangeText={setCashNote}
                multiline
              />
              <TouchableOpacity style={s.confirmPayBtn} onPress={handleMarkPaidCash}>
                <Text style={s.confirmPayBtnText}>✅ Xác nhận đã thu tiền mặt</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={() => { setShowCashModal(false); setCashNote(''); }}>
                <Text style={s.cancelBtnText}>Hủy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* ── E-wallet Modal ───────────────────────────────────────── */}
      {showEwalletModal && selectedBill && (
        <Modal transparent animationType="slide">
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              <Text style={s.modalTitle}>👛 Ví điện tử</Text>
              <View style={s.cashAmountBox}>
                <Text style={s.cashAmountLabel}>Số tiền</Text>
                <Text style={s.cashAmount}>{fmt(selectedBill.grandTotal)}</Text>
              </View>
              <Text style={s.cashHint}>Chọn ví điện tử khách đã thanh toán:</Text>
              {['MoMo', 'ZaloPay', 'VNPay', 'Ví khác'].map(wallet => (
                <TouchableOpacity key={wallet} style={s.ewalletOption} onPress={handleMarkPaidEwallet}>
                  <Text style={s.ewalletOptionText}>👛 {wallet}</Text>
                  <Text style={s.ewalletOptionArrow}>→</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowEwalletModal(false)}>
                <Text style={s.cancelBtnText}>Hủy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.white,
  },
  backBtn:   { padding: 4 },
  backIcon:  { fontSize: 30, color: Colors.primary, fontWeight: '300', lineHeight: 34 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  headerSub:   { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },

  summaryCard: {
    backgroundColor: Colors.white, marginHorizontal: Spacing.base, marginTop: Spacing.md,
    borderRadius: BorderRadius.xl, padding: Spacing.base,
    ...Shadow.sm, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md,
  },
  summaryRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  summaryStat:  { flex: 1, alignItems: 'center' },
  summaryNum:   { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  summaryAmtNum:{ fontSize: 13, fontWeight: '800' },
  summaryLbl:   { fontSize: 10, color: Colors.textMuted, marginTop: 2, textAlign: 'center' },
  summarySep:   { width: 1, height: 32, backgroundColor: Colors.divider },

  progRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  progBg:   { flex: 1, height: 6, backgroundColor: Colors.divider, borderRadius: 3 },
  progFill: { height: 6, borderRadius: 3 },
  progPct:  { fontSize: 11, fontWeight: '700', minWidth: 62 },

  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    ...Shadow.sm, marginHorizontal: Spacing.base, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchIcon:  { fontSize: 15 },
  searchInput: { flex: 1, fontSize: 13, color: Colors.textPrimary },
  searchClear: { fontSize: 14, color: Colors.textMuted, fontWeight: '600', padding: 4 },

  filterScroll:     { flexGrow: 0, marginBottom: Spacing.md },
  filterContent:    { paddingHorizontal: Spacing.base, paddingBottom: 4, gap: Spacing.sm },
  filterChip:       {
    height: 30, justifyContent: 'center', paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText:       { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },

  listContent: { paddingHorizontal: Spacing.base, paddingTop: 4, paddingBottom: 100 },

  billCard:        {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, ...Shadow.sm, borderWidth: 1, borderColor: Colors.border,
  },
  billCardOverdue:  { borderColor: Colors.error + '50', borderWidth: 1.5 },
  billCardHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.sm },
  billCode:         { fontSize: 14, fontWeight: '700', color: Colors.primary },
  billRoom:         { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  statusBadge:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full, gap: 4 },
  statusIcon:       { fontSize: 11 },
  statusText:       { fontSize: 11, fontWeight: '700' },
  billTenantRow:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  billTenant:       { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  billMonth:        { fontSize: 12, color: Colors.textMuted },
  billAmountRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  billDue:          { fontSize: 12, color: Colors.textSecondary },
  billOverdueDays:  { fontSize: 11, color: Colors.error, fontWeight: '700' },
  billLateFee:      { fontSize: 11, color: Colors.error },
  billTotal:        { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },

  emptyState: { alignItems: 'center', paddingTop: 80, gap: Spacing.md },
  emptyText:  { fontSize: 14, color: Colors.textMuted },

  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent:    {
    backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl, padding: Spacing.xl, paddingBottom: 40,
  },
  billDetailSheet: {
    backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl, maxHeight: SCREEN_HEIGHT * 0.92,
  },
  billDetailContent: { padding: Spacing.xl, paddingBottom: 40 },
  modalHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  modalTitle:        { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  modalClose:        { fontSize: 20, color: Colors.textMuted, fontWeight: '600', padding: 4 },

  statusBannerFull: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    padding: Spacing.md, borderRadius: BorderRadius.lg, marginBottom: Spacing.lg,
  },
  statusBannerIcon: { fontSize: 22 },
  statusBannerText: { fontSize: 16, fontWeight: '700' },

  detailSection: { marginBottom: Spacing.md },
  detailRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderColor: Colors.divider },
  detailLabel:   { fontSize: 14, color: Colors.textSecondary },
  detailVal:     { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },

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
  itemRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  itemLabelRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  itemIcon:     { fontSize: 16, width: 24 },
  itemLabel:    { fontSize: 14, color: Colors.textSecondary, flex: 1 },
  itemAmount:   { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.md,
    borderTopWidth: 1.5, borderColor: Colors.divider, marginTop: Spacing.sm,
  },
  totalRowCompact: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.lg,
  },
  totalLabel:  { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  totalAmount: { fontSize: 20, fontWeight: '800', color: Colors.primary },

  paymentActions:      { marginBottom: Spacing.md },
  paymentActionsTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  qrPayBtn:    {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', marginBottom: Spacing.md, ...Shadow.md,
  },
  qrPayBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  payAltRow:    { flexDirection: 'row', gap: Spacing.sm },
  payAltBtn:    {
    flex: 1, backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  payAltIcon: { fontSize: 20, marginBottom: 4 },
  payAltText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary, textAlign: 'center' },

  paidInfo:     { backgroundColor: Colors.successLight, borderRadius: BorderRadius.lg, padding: Spacing.md },
  paidInfoText: { fontSize: 14, color: Colors.success, lineHeight: 22, fontWeight: '500' },

  qrSubtitle:       { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.md },
  qrImageContainer: {
    alignItems: 'center', backgroundColor: Colors.white, padding: Spacing.md,
    borderRadius: BorderRadius.lg, borderWidth: 2, borderColor: Colors.divider,
    alignSelf: 'center', marginBottom: Spacing.md,
  },
  qrImage:     { width: 220, height: 280 },
  bankInfoBox: { backgroundColor: Colors.background, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.lg },
  bankRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm },
  bankLabel:   { fontSize: 13, color: Colors.textMuted },
  bankVal:     { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

  confirmPayBtn: {
    backgroundColor: Colors.success, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', marginBottom: Spacing.md, ...Shadow.md,
  },
  confirmPayBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },

  cashAmountBox:   {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg,
    padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.md,
  },
  cashAmountLabel: { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
  cashAmount:      { fontSize: 28, fontWeight: '800', color: Colors.primary },
  cashHint:        { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.md, lineHeight: 18 },
  cashNoteInput:   {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    padding: Spacing.md, fontSize: 14, marginBottom: Spacing.lg, minHeight: 80,
  },
  cancelBtn:     { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },

  ewalletOption: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: 14, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  ewalletOptionText:  { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  ewalletOptionArrow: { fontSize: 16, color: Colors.textMuted },
});
