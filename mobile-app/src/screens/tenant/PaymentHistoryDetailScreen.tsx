import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { PaymentTransaction } from '../../types';
import { formatCurrency, formatDateTime } from '../../utils';

const METHOD_CONFIG: Record<string, { label: string; emoji: string }> = {
  qr: { label: 'QR Code / VietQR', emoji: '📱' },
  bank_transfer: { label: 'Chuyển khoản ngân hàng', emoji: '🏦' },
  cash: { label: 'Tiền mặt', emoji: '💵' },
  other: { label: 'Khác', emoji: '💳' },
};

const STATUS_META: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  pending: { label: 'Chờ xác nhận', color: Colors.warning, bg: Colors.warningLight, emoji: '🕐' },
  processing: { label: 'Đang xử lý', color: Colors.info, bg: Colors.infoLight, emoji: '⏳' },
  verified: { label: 'Đã xác nhận', color: Colors.success, bg: Colors.successLight, emoji: '✅' },
  rejected: { label: 'Bị từ chối', color: Colors.error, bg: Colors.errorLight, emoji: '❌' },
};

const TIMELINE_STEPS = ['pending', 'processing', 'verified'] as const;
const TIMELINE_LABELS: Record<string, string> = {
  pending: 'Tạo giao dịch',
  processing: 'Đang xử lý',
  verified: 'Xác nhận thành công',
};

const InfoRow: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <View style={infoStyles.row}>
    <Text style={infoStyles.label}>{label}</Text>
    <Text style={[infoStyles.value, accent && { color: Colors.primary, fontWeight: '700' }]}>{value}</Text>
  </View>
);

const infoStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 10 },
  label: { fontSize: 13, color: Colors.textMuted, flex: 1 },
  value: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, flex: 2, textAlign: 'right' },
});

export const PaymentHistoryDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { transaction } = route.params as { transaction: PaymentTransaction };

  const method = METHOD_CONFIG[transaction.method] || METHOD_CONFIG.other;
  const status = STATUS_META[transaction.status] || STATUS_META.pending;
  const currentStepIdx = TIMELINE_STEPS.indexOf(transaction.status as typeof TIMELINE_STEPS[number]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Quay lại</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chi tiết giao dịch</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Status banner */}
        <View style={[styles.statusBanner, { backgroundColor: status.bg }]}>
          <Text style={styles.statusEmoji}>{status.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusLabel, { color: status.color }]}>{status.label}</Text>
            <Text style={styles.statusSub}>{method.emoji} {method.label}</Text>
          </View>
          <Text style={styles.amountBig}>{formatCurrency(transaction.amount)}</Text>
        </View>

        {/* Transaction timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⏱ Trạng thái giao dịch</Text>
          <View style={styles.card}>
            <View style={styles.timelineRow}>
              {TIMELINE_STEPS.map((step, i) => {
                const isReached = i <= currentStepIdx && transaction.status !== 'rejected';
                const isCurrent = i === currentStepIdx;
                const stepColor = isReached ? STATUS_META[step]?.color ?? Colors.primary : Colors.border;
                return (
                  <React.Fragment key={step}>
                    <View style={styles.timelineStep}>
                      <View style={[styles.timelineDot, { backgroundColor: stepColor }]}>
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
            {transaction.status === 'rejected' && (
              <View style={styles.rejectedBanner}>
                <Text style={styles.rejectedText}>❌ Giao dịch bị từ chối. Liên hệ quản lý để biết thêm chi tiết.</Text>
              </View>
            )}
          </View>
        </View>

        {/* Transaction info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🧾 Thông tin giao dịch</Text>
          <View style={styles.card}>
            <InfoRow label="Mã hóa đơn" value={transaction.invoiceCode} />
            <View style={styles.divider} />
            <InfoRow label="Phòng" value={transaction.roomName} />
            <View style={styles.divider} />
            <InfoRow label="Số tiền" value={formatCurrency(transaction.amount)} accent />
            <View style={styles.divider} />
            <InfoRow label="Phương thức" value={`${method.emoji}  ${method.label}`} />
            {transaction.bankCode && (
              <>
                <View style={styles.divider} />
                <InfoRow label="Ngân hàng" value={transaction.bankCode} />
              </>
            )}
            {transaction.bankAccount && (
              <>
                <View style={styles.divider} />
                <InfoRow label="Số tài khoản" value={transaction.bankAccount} />
              </>
            )}
            {transaction.transferContent && (
              <>
                <View style={styles.divider} />
                <InfoRow label="Nội dung CK" value={transaction.transferContent} />
              </>
            )}
          </View>
        </View>

        {/* Time info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📅 Thời gian</Text>
          <View style={styles.card}>
            <InfoRow label="Thời gian GD" value={formatDateTime(transaction.createdAt)} />
            {transaction.verifiedAt && (
              <>
                <View style={styles.divider} />
                <InfoRow label="Xác nhận lúc" value={formatDateTime(transaction.verifiedAt)} />
              </>
            )}
            {transaction.verifiedBy && (
              <>
                <View style={styles.divider} />
                <InfoRow label="Xác nhận bởi" value={transaction.verifiedBy} />
              </>
            )}
          </View>
        </View>

        {/* Notes */}
        {transaction.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📝 Ghi chú</Text>
            <View style={styles.card}>
              <Text style={styles.noteText}>{transaction.notes}</Text>
            </View>
          </View>
        )}

        {/* Verified confirmed */}
        {transaction.status === 'verified' && (
          <View style={[styles.section, { marginBottom: 40 }]}>
            <View style={styles.confirmedBanner}>
              <Text style={styles.confirmedText}>
                ✅ Giao dịch đã được xác nhận thành công bởi quản lý
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
  amountBig: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },

  section: { marginBottom: Spacing.md },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.4 },

  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm },
  divider: { height: 1, backgroundColor: Colors.divider },

  timelineRow: { flexDirection: 'row', alignItems: 'flex-start' },
  timelineStep: { flex: 1, alignItems: 'center', gap: 6 },
  timelineDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  timelineLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center', lineHeight: 14 },
  timelineLine: { flex: 1, height: 2, marginTop: 13 },

  rejectedBanner: { marginTop: Spacing.md, backgroundColor: Colors.errorLight, borderRadius: BorderRadius.md, padding: Spacing.md },
  rejectedText: { fontSize: 13, color: Colors.error, fontWeight: '500', lineHeight: 20 },

  noteText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22 },

  confirmedBanner: {
    backgroundColor: Colors.successLight, borderRadius: BorderRadius.lg,
    padding: Spacing.base, alignItems: 'center',
  },
  confirmedText: { fontSize: 14, fontWeight: '600', color: Colors.success, textAlign: 'center', lineHeight: 22 },
});
