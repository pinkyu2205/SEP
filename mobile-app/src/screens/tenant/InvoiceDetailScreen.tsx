import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { formatCurrency, formatDate, getDaysUntil } from '../../utils';
import { SharedBill, BillStatus } from '../../store/billsStore';

const STATUS_CONFIG: Record<BillStatus, { label: string; color: string; bg: string; emoji: string }> = {
  pending: { label: 'Chờ thanh toán', color: Colors.warning, bg: Colors.warningLight, emoji: '🕐' },
  paid: { label: 'Đã thanh toán', color: Colors.success, bg: Colors.successLight, emoji: '✅' },
  overdue: { label: 'Quá hạn', color: Colors.error, bg: Colors.errorLight, emoji: '⚠️' },
  partial: { label: 'Thanh toán 1 phần', color: Colors.info, bg: Colors.infoLight, emoji: '💸' },
};

const METHOD_LABEL: Record<string, string> = {
  qr: '📱 QR Code / VietQR',
  bank_transfer: '🏦 Chuyển khoản',
  cash: '💵 Tiền mặt',
  ewallet: '💳 Ví điện tử',
  other: '💳 Khác',
};

const TIMELINE_STEPS: BillStatus[] = ['pending', 'partial', 'paid'];
const TIMELINE_LABELS: Record<string, string> = {
  pending: 'Phát hành',
  partial: 'TT một phần',
  paid: 'Hoàn tất',
};

const InfoRow: React.FC<{ label: string; value: string; valueStyle?: object }> = ({ label, value, valueStyle }) => (
  <View style={rowStyles.row}>
    <Text style={rowStyles.label}>{label}</Text>
    <Text style={[rowStyles.value, valueStyle]}>{value}</Text>
  </View>
);

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 10 },
  label: { fontSize: 13, color: Colors.textMuted, flex: 1 },
  value: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, flex: 2, textAlign: 'right' },
});

export const InvoiceDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { invoice } = route.params as { invoice: SharedBill };

  const cfg = STATUS_CONFIG[invoice.status];
  const isOverdue = invoice.status === 'overdue';
  const isPaid = invoice.status === 'paid';
  const daysOverdue = isOverdue ? Math.abs(getDaysUntil(invoice.dueDate)) : 0;
  const currentStepIdx = TIMELINE_STEPS.indexOf(invoice.status);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Quay lại</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chi tiết hóa đơn</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Status banner */}
        <View style={[styles.statusBanner, { backgroundColor: cfg.bg }]}>
          <Text style={styles.statusEmoji}>{cfg.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusLabel, { color: cfg.color }]}>{cfg.label}</Text>
            <Text style={styles.statusSub}>
              Tháng {String(invoice.month).padStart(2, '0')}/{invoice.year} · {invoice.roomName}
            </Text>
          </View>
          <View style={styles.codeBadge}>
            <Text style={styles.codeText}>{invoice.code}</Text>
          </View>
        </View>

        {/* Payment timeline */}
        {invoice.status !== 'overdue' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⏱ Trạng thái</Text>
            <View style={styles.card}>
              <View style={styles.timelineRow}>
                {TIMELINE_STEPS.map((step, i) => {
                  const isReached = i <= currentStepIdx && currentStepIdx >= 0;
                  const stepMeta = STATUS_CONFIG[step];
                  return (
                    <React.Fragment key={step}>
                      <View style={styles.timelineStep}>
                        <View style={[styles.timelineDot, { backgroundColor: isReached ? stepMeta.color : Colors.border }]}>
                          {isReached && <Text style={{ fontSize: 9, color: Colors.white }}>✓</Text>}
                        </View>
                        <Text style={[styles.timelineLabel, { color: isReached ? Colors.textPrimary : Colors.textMuted }]}>
                          {TIMELINE_LABELS[step]}
                        </Text>
                      </View>
                      {i < TIMELINE_STEPS.length - 1 && (
                        <View style={[styles.timelineLine, { backgroundColor: i < currentStepIdx ? Colors.success : Colors.border }]} />
                      )}
                    </React.Fragment>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {/* Overdue alert */}
        {isOverdue && (
          <View style={[styles.section]}>
            <View style={styles.overdueAlert}>
              <Text style={styles.overdueText}>
                ⚠️ Hóa đơn đã quá hạn {daysOverdue} ngày (hạn: {formatDate(invoice.dueDate)})
              </Text>
            </View>
          </View>
        )}

        {/* Invoice info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏠 Thông tin phòng</Text>
          <View style={styles.card}>
            <InfoRow label="Phòng" value={invoice.roomName} />
            <View style={styles.divider} />
            <InfoRow label="Tòa nhà" value={invoice.propertyName} />
            <View style={styles.divider} />
            <InfoRow
              label="Kỳ hóa đơn"
              value={`Tháng ${String(invoice.month).padStart(2, '0')}/${invoice.year}`}
            />
            <View style={styles.divider} />
            <InfoRow label="Hạn thanh toán" value={formatDate(invoice.dueDate)} />
          </View>
        </View>

        {/* Line items */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🧾 Chi tiết khoản thu</Text>
          <View style={styles.card}>
            {invoice.items.map((item, i) => (
              <React.Fragment key={i}>
                <View style={rowStyles.row}>
                  <Text style={rowStyles.label}>{item.label}</Text>
                  <Text style={rowStyles.value}>{formatCurrency(item.amount)}</Text>
                </View>
                {i < invoice.items.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))}
            {(invoice.lateFee ?? 0) > 0 && (
              <>
                <View style={styles.divider} />
                <View style={rowStyles.row}>
                  <Text style={[rowStyles.label, { color: Colors.error }]}>⚠️ Phí trả chậm</Text>
                  <Text style={[rowStyles.value, { color: Colors.error }]}>+{formatCurrency(invoice.lateFee)}</Text>
                </View>
              </>
            )}
            <View style={[styles.divider, { marginTop: 4 }]} />
            <View style={[rowStyles.row, { paddingTop: 12 }]}>
              <Text style={[rowStyles.label, { fontWeight: '700', color: Colors.textPrimary, fontSize: 15 }]}>Tổng cộng</Text>
              <Text style={[rowStyles.value, { fontSize: 20, fontWeight: '800', color: isOverdue ? Colors.error : Colors.primary }]}>
                {formatCurrency(invoice.grandTotal)}
              </Text>
            </View>
          </View>
        </View>

        {/* Payment info (paid only) */}
        {isPaid && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>💳 Thông tin thanh toán</Text>
            <View style={styles.card}>
              {invoice.paidAt && (
                <>
                  <InfoRow label="Ngày thanh toán" value={formatDate(invoice.paidAt)} />
                  <View style={styles.divider} />
                </>
              )}
              {invoice.paymentMethod && (
                <>
                  <InfoRow label="Phương thức" value={METHOD_LABEL[invoice.paymentMethod] ?? invoice.paymentMethod} />
                  <View style={styles.divider} />
                </>
              )}
              {invoice.transactionId && (
                <InfoRow label="Mã giao dịch" value={invoice.transactionId} />
              )}
            </View>
            <View style={[styles.confirmedBanner, { marginTop: Spacing.sm }]}>
              <Text style={styles.confirmedText}>✅ Hóa đơn đã được thanh toán đầy đủ</Text>
            </View>
          </View>
        )}

        {/* Due date reminder (unpaid) */}
        {!isPaid && (
          <View style={[styles.section, { marginBottom: 40 }]}>
            <View style={[styles.dueBanner, isOverdue && { backgroundColor: Colors.errorLight }]}>
              <Text style={[styles.dueText, isOverdue && { color: Colors.error }]}>
                {isOverdue
                  ? `🚨 Đã quá hạn ${daysOverdue} ngày — vui lòng thanh toán ngay`
                  : `📅 Vui lòng thanh toán trước ${formatDate(invoice.dueDate)}`}
              </Text>
            </View>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: { padding: Spacing.sm },
  backBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },

  scroll: { padding: Spacing.base, paddingBottom: 40 },

  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.md,
  },
  statusEmoji: { fontSize: 28 },
  statusLabel: { fontSize: 16, fontWeight: '700' },
  statusSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  codeBadge: { backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  codeText: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary },

  section: { marginBottom: Spacing.md },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.4 },

  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm },
  divider: { height: 1, backgroundColor: Colors.divider },

  timelineRow: { flexDirection: 'row', alignItems: 'flex-start' },
  timelineStep: { flex: 1, alignItems: 'center', gap: 6 },
  timelineDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  timelineLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center', lineHeight: 14 },
  timelineLine: { flex: 1, height: 2, marginTop: 13 },

  overdueAlert: { backgroundColor: Colors.errorLight, borderRadius: BorderRadius.lg, padding: Spacing.base },
  overdueText: { fontSize: 14, fontWeight: '600', color: Colors.error, lineHeight: 22 },

  confirmedBanner: { backgroundColor: Colors.successLight, borderRadius: BorderRadius.lg, padding: Spacing.base, alignItems: 'center' },
  confirmedText: { fontSize: 14, fontWeight: '600', color: Colors.success },

  dueBanner: { backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg, padding: Spacing.base, alignItems: 'center' },
  dueText: { fontSize: 13, fontWeight: '600', color: Colors.primary, textAlign: 'center' },
});
