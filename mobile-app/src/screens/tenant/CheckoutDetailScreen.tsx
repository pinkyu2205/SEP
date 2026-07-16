import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { formatDate } from '@/utils';
import { realTenantSelfService } from '@/services/tenant/selfService';
import type { CheckoutRequestDto } from '@/services/tenant/selfService';

/**
 * Tenant theo dõi TIẾN TRÌNH TRẢ PHÒNG — dữ liệu thật GET /tenant/me/checkout-requests
 * (trước đây màn này chạy trên checkoutStore mock + nút "DEMO tiến bước").
 * Luồng BE: PENDING → APPROVED → COMPLETED (manager complete = terminate HĐ, trả
 * phòng/thiết bị); PENDING → REJECTED; tenant tự hủy khi còn PENDING.
 */

const TIMELINE_STEPS = [
  { label: 'Gửi yêu cầu', icon: '📤', desc: 'Yêu cầu trả phòng đã được ghi nhận' },
  { label: 'Quản lý xem xét', icon: '⏳', desc: 'Quản lý đang xem xét và phản hồi' },
  { label: 'Đã duyệt — hẹn trả phòng', icon: '📅', desc: 'Chờ đến ngày bàn giao, kiểm tra hiện trạng & quyết toán cọc' },
  { label: 'Hoàn tất trả phòng', icon: '🎉', desc: 'Hợp đồng kết thúc, phòng đã bàn giao' },
];

// Map status BE -> bước hiện tại trên timeline (index của TIMELINE_STEPS).
const STATUS_TO_STEP: Record<string, number> = {
  PENDING: 1,
  APPROVED: 2,
  COMPLETED: 4, // vượt quá bước cuối = tất cả done
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Chờ quản lý duyệt', color: '#D97706' },
  APPROVED: { label: 'Đã duyệt — chờ trả phòng', color: '#0891B2' },
  REJECTED: { label: 'Bị từ chối', color: '#DC2626' },
  COMPLETED: { label: 'Đã hoàn tất', color: '#059669' },
  CANCELLED: { label: 'Đã hủy', color: '#64748B' },
};
const FALLBACK_META = { label: 'Không rõ', color: '#64748B' };

const SectionCard: React.FC<{ title: string; children: React.ReactNode; noPad?: boolean }> = ({ title, children, noPad }) => (
  <View style={styles.sectionCard}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={noPad ? undefined : styles.sectionBody}>{children}</View>
  </View>
);

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

export const CheckoutDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const paramRequestId: number | undefined = route.params?.requestId;

  const [requests, setRequests] = useState<CheckoutRequestDto[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(paramRequestId ?? null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await realTenantSelfService.listMyCheckoutRequests();
      // Mới nhất lên đầu (BE có thể trả ASC)
      list.sort((a, b) => b.id - a.id);
      setRequests(list);
      setSelectedId((prev) => prev ?? list[0]?.id ?? null);
    } catch {
      Alert.alert('Lỗi', 'Không tải được yêu cầu trả phòng.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const checkout = requests.find((r) => r.id === selectedId) ?? requests[0] ?? null;

  const handleCancel = () => {
    if (!checkout) return;
    Alert.alert('Hủy yêu cầu trả phòng?', 'Bạn có thể gửi lại yêu cầu mới sau nếu đổi ý.', [
      { text: 'Không' },
      {
        text: 'Hủy yêu cầu',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            await realTenantSelfService.cancelCheckoutRequest(checkout.id);
            Alert.alert('Đã hủy', 'Yêu cầu trả phòng đã được hủy.');
            load();
          } catch (err: any) {
            Alert.alert('Lỗi', err?.response?.data?.message || 'Không hủy được yêu cầu.');
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyState}><ActivityIndicator color={Colors.primary} size="large" /></View>
      </SafeAreaView>
    );
  }

  if (!checkout) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Tiến trình trả phòng</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🏠</Text>
          <Text style={styles.emptyTitle}>Chưa có yêu cầu trả phòng</Text>
          <Text style={styles.emptyDesc}>
            Bạn chưa gửi yêu cầu trả phòng nào. Khi cần kết thúc hợp đồng, vui lòng sử dụng tính năng này.
          </Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => navigation.navigate('RequestCheckout')}
          >
            <Text style={styles.emptyBtnText}>🏠 Tạo yêu cầu trả phòng</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const status = (checkout.status || '').toUpperCase();
  const meta = STATUS_META[status] ?? FALLBACK_META;
  const isRejected = status === 'REJECTED';
  const isCancelled = status === 'CANCELLED';
  const isCompleted = status === 'COMPLETED';
  const currentStep = STATUS_TO_STEP[status] ?? 1;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tiến trình trả phòng</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* Nhiều yêu cầu (đã hủy/bị từ chối trước đó) → chip chuyển xem */}
        {requests.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
            <View style={styles.switchRow}>
              {requests.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.switchChip, r.id === checkout.id && styles.switchChipActive]}
                  onPress={() => setSelectedId(r.id)}
                >
                  <Text style={[styles.switchChipText, r.id === checkout.id && styles.switchChipTextActive]}>
                    #{r.id} · {(STATUS_META[(r.status || '').toUpperCase()] ?? FALLBACK_META).label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {/* Banner kết cục */}
        {isCompleted && (
          <View style={[styles.banner, { backgroundColor: Colors.successLight }]}>
            <Text style={styles.bannerIcon}>🎉</Text>
            <Text style={[styles.bannerTitle, { color: Colors.success }]}>Trả phòng hoàn tất!</Text>
            <Text style={styles.bannerDesc}>
              Hợp đồng đã kết thúc{checkout.completedAt ? ` ngày ${formatDate(checkout.completedAt)}` : ''}.
              Liên hệ quản lý về việc hoàn cọc nếu chưa nhận được.
            </Text>
          </View>
        )}
        {isRejected && (
          <View style={[styles.banner, { backgroundColor: Colors.errorLight }]}>
            <Text style={styles.bannerIcon}>❌</Text>
            <Text style={[styles.bannerTitle, { color: Colors.error }]}>Yêu cầu bị từ chối</Text>
            <Text style={styles.bannerDesc}>
              {checkout.rejectReason || 'Quản lý đã từ chối yêu cầu này. Liên hệ quản lý để biết thêm chi tiết.'}
            </Text>
          </View>
        )}
        {isCancelled && (
          <View style={[styles.banner, { backgroundColor: '#F1F5F9' }]}>
            <Text style={styles.bannerIcon}>🚫</Text>
            <Text style={[styles.bannerTitle, { color: '#475569' }]}>Yêu cầu đã hủy</Text>
            <Text style={styles.bannerDesc}>Bạn đã hủy yêu cầu này. Có thể gửi yêu cầu mới bất cứ lúc nào.</Text>
          </View>
        )}

        {/* Status chip */}
        <View style={styles.statusRow}>
          <View style={[styles.statusChip, { backgroundColor: meta.color + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: meta.color }]} />
            <Text style={[styles.statusChipText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          {!!checkout.createdAt && (
            <Text style={styles.submittedDate}>Gửi lúc {formatDate(checkout.createdAt)}</Text>
          )}
        </View>

        {/* Thông tin yêu cầu */}
        <SectionCard title="📋 Thông tin yêu cầu">
          <InfoRow label="Phòng" value={checkout.roomNumber || 'Nguyên căn'} />
          <InfoRow label="Tòa nhà" value={checkout.propertyName || '—'} />
          <InfoRow label="Mã hợp đồng" value={checkout.contractCode || `#${checkout.contractId}`} />
          <InfoRow label="Ngày muốn trả" value={checkout.expectedMoveOutDate ? formatDate(checkout.expectedMoveOutDate) : '—'} />
          <InfoRow label="Lý do" value={checkout.reason || '—'} />
          {!!checkout.note && <InfoRow label="Ghi chú" value={checkout.note} />}
        </SectionCard>

        {/* Timeline */}
        {!isCancelled && !isRejected && (
          <SectionCard title="📍 Tiến trình" noPad>
            <View style={styles.timeline}>
              {TIMELINE_STEPS.map((step, i) => {
                const isDone = i < currentStep;
                const isActive = i === currentStep;
                const isLast = i === TIMELINE_STEPS.length - 1;
                return (
                  <View key={i} style={styles.timelineItem}>
                    <View style={styles.timelineLeft}>
                      <View style={[
                        styles.timelineDot,
                        isDone && styles.timelineDotDone,
                        isActive && styles.timelineDotActive,
                      ]}>
                        {isDone ? <Text style={styles.timelineDotCheck}>✓</Text>
                          : isActive ? <View style={styles.timelineDotPulse} /> : null}
                      </View>
                      {!isLast && <View style={[styles.timelineLine, isDone && styles.timelineLineDone]} />}
                    </View>
                    <View style={styles.timelineContent}>
                      <Text style={[
                        styles.timelineLabel,
                        isDone && styles.timelineLabelDone,
                        isActive && styles.timelineLabelActive,
                        !isDone && !isActive && styles.timelineLabelFuture,
                      ]}>
                        {step.label}
                      </Text>
                      <Text style={[styles.timelineDesc, !isDone && !isActive && styles.timelineDescFuture]}>
                        {step.desc}
                      </Text>
                      {i === 2 && status === 'APPROVED' && checkout.expectedMoveOutDate && (
                        <View style={styles.timelineTag}>
                          <Text style={styles.timelineTagText}>📅 Dự kiến {formatDate(checkout.expectedMoveOutDate)}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </SectionCard>
        )}

        {/* Phản hồi của quản lý */}
        {(checkout.managerNote || checkout.reviewedByName) && (
          <SectionCard title="📝 Phản hồi từ quản lý">
            {!!checkout.reviewedByName && (
              <InfoRow label="Người xử lý" value={checkout.reviewedByName} />
            )}
            {!!checkout.reviewedAt && (
              <InfoRow label="Thời điểm" value={formatDate(checkout.reviewedAt)} />
            )}
            {!!checkout.managerNote && (
              <Text style={styles.managerNote}>{checkout.managerNote}</Text>
            )}
          </SectionCard>
        )}

        {/* Actions */}
        {status === 'PENDING' && (
          <TouchableOpacity
            style={[styles.cancelBtn, cancelling && { opacity: 0.6 }]}
            onPress={handleCancel}
            disabled={cancelling}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelBtnText}>{cancelling ? 'Đang hủy...' : '🚫 Hủy yêu cầu trả phòng'}</Text>
          </TouchableOpacity>
        )}
        {(isCancelled || isRejected) && (
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => navigation.replace('RequestCheckout')}
            activeOpacity={0.8}
          >
            <Text style={styles.emptyBtnText}>🏠 Gửi yêu cầu mới</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: { padding: Spacing.sm },
  backArrow: { fontSize: 18, fontWeight: '600', color: Colors.primary },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },

  body: { padding: Spacing.lg, gap: Spacing.md },

  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emptyIcon: { fontSize: 52, marginBottom: Spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xl },
  emptyBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center', ...Shadow.md },
  emptyBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },

  switchRow: { flexDirection: 'row', gap: Spacing.sm },
  switchChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  switchChipActive: { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  switchChipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  switchChipTextActive: { color: Colors.primary },

  banner: { borderRadius: BorderRadius.xl, padding: Spacing.lg, alignItems: 'center', gap: Spacing.xs },
  bannerIcon: { fontSize: 40 },
  bannerTitle: { fontSize: 18, fontWeight: '800' },
  bannerDesc: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: 4 },

  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusChipText: { fontSize: 13, fontWeight: '700' },
  submittedDate: { fontSize: 12, color: Colors.textMuted },

  sectionCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  sectionTitle: {
    fontSize: 14, fontWeight: '700', color: Colors.textPrimary,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.base, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  sectionBody: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm },

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  infoLabel: { fontSize: 13, color: Colors.textMuted, flex: 1 },
  infoValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, flex: 1.4, textAlign: 'right' },

  timeline: { padding: Spacing.base },
  timelineItem: { flexDirection: 'row', gap: Spacing.md, minHeight: 56 },
  timelineLeft: { width: 28, alignItems: 'center' },
  timelineDot: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.divider,
    backgroundColor: Colors.background,
  },
  timelineDotDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  timelineDotActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  timelineDotCheck: { fontSize: 12, fontWeight: '800', color: Colors.white },
  timelineDotPulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.white },
  timelineLine: { flex: 1, width: 2, backgroundColor: Colors.divider, marginVertical: 2 },
  timelineLineDone: { backgroundColor: Colors.success },

  timelineContent: { flex: 1, paddingBottom: Spacing.lg, paddingTop: 4 },
  timelineLabel: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  timelineLabelDone: { color: Colors.success },
  timelineLabelActive: { color: Colors.primary },
  timelineLabelFuture: { color: Colors.textMuted },
  timelineDesc: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, lineHeight: 18 },
  timelineDescFuture: { color: Colors.textMuted },
  timelineTag: {
    marginTop: 4, alignSelf: 'flex-start',
    backgroundColor: Colors.primaryBg, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  timelineTagText: { fontSize: 11, fontWeight: '600', color: Colors.primary },

  managerNote: {
    fontSize: 14, color: Colors.textSecondary, lineHeight: 22,
    paddingVertical: Spacing.sm,
  },

  cancelBtn: {
    borderRadius: BorderRadius.lg, paddingVertical: Spacing.md,
    alignItems: 'center', borderWidth: 1.5, borderColor: Colors.error,
  },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: Colors.error },
});
