import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import {
  CheckoutRequest,
  DamageItem,
  STATUS_LABEL,
  STATUS_COLOR,
  STATUS_TO_STEP,
  REFUND_STATUS_LABEL,
  REFUND_STATUS_COLOR,
  DEMO_STATUS_PROGRESSION,
  DEMO_TRANSITION_DATA,
  checkoutStore,
  useCheckoutRequests,
} from '@/store/checkoutStore';
import { formatDate } from '@/utils';

// ── Timeline steps definition ────────────────────────────────
const TIMELINE_STEPS = [
  { label: 'Gửi yêu cầu',            icon: '📤', desc: 'Yêu cầu trả phòng đã được ghi nhận'     },
  { label: 'Chờ quản lý xác nhận',   icon: '⏳', desc: 'Quản lý đang xem xét và phản hồi'        },
  { label: 'Lên lịch kiểm tra',      icon: '📅', desc: 'Đã sắp xếp lịch kiểm tra hiện trạng'     },
  { label: 'Kiểm tra hiện trạng',    icon: '🔍', desc: 'Đang kiểm tra tình trạng phòng trực tiếp' },
  { label: 'Đối chiếu chi phí',      icon: '💰', desc: 'Tính toán khoản khấu trừ và số hoàn cọc'  },
  { label: 'Đang hoàn cọc',          icon: '💳', desc: 'Đang xử lý chuyển khoản tới tài khoản bạn'},
  { label: 'Hoàn tất trả phòng',     icon: '🎉', desc: 'Quy trình kết thúc hợp đồng hoàn tất'    },
];

const MOCK_TENANT_ID = 't1';

const DEMO_NEXT_LABEL: Record<string, string> = {
  pending_manager_approval: 'Quản lý xác nhận & lên lịch kiểm tra',
  scheduled:                'Bắt đầu kiểm tra hiện trạng',
  inspecting:               'Hoàn tất kiểm tra — có hư hỏng nhỏ',
  settlement_pending:       'Xác nhận quyết toán — bắt đầu hoàn cọc',
  refund_processing:        'Chuyển khoản hoàn cọc thành công',
};

// Section card component
const SectionCard: React.FC<{ title: string; children: React.ReactNode; noPad?: boolean }> = ({ title, children, noPad }) => (
  <View style={styles.sectionCard}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={noPad ? undefined : styles.sectionBody}>{children}</View>
  </View>
);

const InfoRow: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={[styles.infoValue, accent && { color: Colors.primary, fontWeight: '800' }]}>{value}</Text>
  </View>
);

export const CheckoutDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  // Subscribe to store so the screen re-renders on every demo step advance
  const allRequests = useCheckoutRequests(MOCK_TENANT_ID);

  // Prefer params checkout id so we track the right request; fall back to latest
  const paramId: string | undefined = route.params?.checkout?.id;
  const checkout: CheckoutRequest | null =
    (paramId ? allRequests.find(r => r.id === paramId) : null) ??
    allRequests[0] ??
    null;

  const handleDemoAdvance = () => {
    if (!checkout) return;
    const currentIdx = DEMO_STATUS_PROGRESSION.indexOf(checkout.status);
    if (currentIdx === -1 || currentIdx >= DEMO_STATUS_PROGRESSION.length - 1) return;
    const nextStatus = DEMO_STATUS_PROGRESSION[currentIdx + 1];
    const extraData = DEMO_TRANSITION_DATA[nextStatus] ?? {};
    checkoutStore.updateById(checkout.id, { status: nextStatus, ...extraData });
  };

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

  const isCancelled = checkout.status === 'cancelled';
  const isCompleted = checkout.status === 'completed';
  const isDisputed  = checkout.status === 'disputed';
  const currentStep = isCancelled ? -1 : STATUS_TO_STEP[checkout.status] ?? 0;
  const statusColor = STATUS_COLOR[checkout.status];

  const showInspection =
    checkout.status === 'inspecting' ||
    checkout.status === 'settlement_pending' ||
    checkout.status === 'refund_processing' ||
    checkout.status === 'completed' ||
    checkout.status === 'disputed';

  const showSettlement =
    checkout.status === 'settlement_pending' ||
    checkout.status === 'refund_processing' ||
    checkout.status === 'completed' ||
    checkout.status === 'disputed';

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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>

        {/* ── Status Banner ── */}
        {isCompleted && (
          <View style={[styles.completionBanner, { backgroundColor: Colors.successLight }]}>
            <Text style={styles.completionIcon}>🎉</Text>
            <Text style={[styles.completionTitle, { color: Colors.success }]}>Trả phòng hoàn tất!</Text>
            <Text style={styles.completionDesc}>
              Hợp đồng đã kết thúc và tiền cọc đã được hoàn trả. Cảm ơn bạn đã tin tưởng sử dụng dịch vụ!
            </Text>
          </View>
        )}
        {isDisputed && (
          <View style={[styles.completionBanner, { backgroundColor: Colors.errorLight }]}>
            <Text style={styles.completionIcon}>⚠️</Text>
            <Text style={[styles.completionTitle, { color: Colors.error }]}>Yêu cầu đang tranh chấp</Text>
            <Text style={styles.completionDesc}>
              Có tranh chấp trong quá trình quyết toán. Vui lòng liên hệ quản lý để giải quyết.
            </Text>
          </View>
        )}

        {/* Status chip */}
        <View style={styles.statusRow}>
          <View style={[styles.statusChip, { backgroundColor: statusColor + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusChipText, { color: statusColor }]}>
              {STATUS_LABEL[checkout.status]}
            </Text>
          </View>
          <Text style={styles.submittedDate}>Gửi lúc {formatDate(checkout.createdAt)}</Text>
        </View>

        {/* ── Section 1: Thông tin yêu cầu ── */}
        <SectionCard title="📋 Thông tin yêu cầu">
          <InfoRow label="Phòng"           value={checkout.roomName} />
          <InfoRow label="Tòa nhà"         value={checkout.buildingName} />
          <InfoRow label="Mã hợp đồng"     value={checkout.contractCode} />
          <InfoRow label="Ngày muốn trả"   value={formatDate(checkout.requestedMoveOutDate)} />
          <InfoRow label="Lý do"           value={checkout.reason} />
          {checkout.note && <InfoRow label="Ghi chú"         value={checkout.note} />}
        </SectionCard>

        {/* ── Section 2: Timeline ── */}
        <SectionCard title="📍 Tiến trình trả phòng" noPad>
          {isCancelled
            ? (
              <View style={styles.cancelledNote}>
                <Text style={styles.cancelledText}>❌ Yêu cầu này đã bị hủy.</Text>
                {checkout.managerNote && (
                  <Text style={styles.cancelledReason}>{checkout.managerNote}</Text>
                )}
              </View>
            )
            : (
              <View style={styles.timeline}>
                {TIMELINE_STEPS.map((step, i) => {
                  const isDone   = i < currentStep;
                  const isActive = i === currentStep;
                  const isFuture = i > currentStep;
                  const isLast   = i === TIMELINE_STEPS.length - 1;

                  return (
                    <View key={i} style={styles.timelineItem}>
                      {/* Left column: dot + line */}
                      <View style={styles.timelineLeft}>
                        <View style={[
                          styles.timelineDot,
                          isDone   && styles.timelineDotDone,
                          isActive && styles.timelineDotActive,
                          isFuture && styles.timelineDotFuture,
                        ]}>
                          {isDone && <Text style={styles.timelineDotCheck}>✓</Text>}
                          {isActive && <View style={styles.timelineDotPulse} />}
                        </View>
                        {!isLast && (
                          <View style={[
                            styles.timelineLine,
                            isDone && styles.timelineLineDone,
                          ]} />
                        )}
                      </View>

                      {/* Right column: content */}
                      <View style={styles.timelineContent}>
                        <Text style={[
                          styles.timelineLabel,
                          isDone   && styles.timelineLabelDone,
                          isActive && styles.timelineLabelActive,
                          isFuture && styles.timelineLabelFuture,
                        ]}>
                          {step.label}
                        </Text>
                        <Text style={[
                          styles.timelineDesc,
                          isFuture && styles.timelineDescFuture,
                        ]}>
                          {step.desc}
                        </Text>
                        {/* Show inspection date on inspecting step */}
                        {i === 3 && checkout.inspectionDate && (
                          <View style={styles.timelineTag}>
                            <Text style={styles.timelineTagText}>
                              📅 {formatDate(checkout.inspectionDate)}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )
          }
        </SectionCard>

        {/* ── Section 3: Kết quả kiểm tra ── */}
        {showInspection && (
          <SectionCard title="🔍 Kết quả kiểm tra hiện trạng">
            {checkout.inspectionDate && (
              <InfoRow label="Ngày kiểm tra" value={formatDate(checkout.inspectionDate)} />
            )}

            {checkout.damages.length === 0
              ? (
                <View style={styles.noDamage}>
                  <Text style={styles.noDamageIcon}>✅</Text>
                  <Text style={styles.noDamageText}>
                    Không ghi nhận hư hỏng. Tiền cọc sẽ được hoàn đầy đủ theo quy định.
                  </Text>
                </View>
              )
              : (
                <>
                  <Text style={styles.damageListTitle}>
                    Hư hỏng ghi nhận ({checkout.damages.length} mục):
                  </Text>
                  {checkout.damages.map((d: DamageItem, i: number) => (
                    <View key={d.id} style={[styles.damageCard, i < checkout.damages.length - 1 && styles.damageCardBorder]}>
                      <View style={styles.damageTopRow}>
                        <Text style={styles.damageDesc}>{d.description}</Text>
                        <View style={styles.damageDeductBadge}>
                          <Text style={styles.damageDeductText}>
                            -{d.deductionAmount.toLocaleString('vi-VN')}đ
                          </Text>
                        </View>
                      </View>
                      {d.note && <Text style={styles.damageNote}>{d.note}</Text>}
                    </View>
                  ))}
                </>
              )
            }
          </SectionCard>
        )}

        {/* ── Section 4: Quyết toán tiền cọc ── */}
        {showSettlement && (
          <View style={styles.settlementCard}>
            <Text style={styles.sectionTitle}>💰 Quyết toán tiền cọc</Text>

            {/* Breakdown */}
            <View style={styles.settlementRows}>
              <View style={styles.settlementRow}>
                <Text style={styles.settlementLabel}>Tiền cọc ban đầu</Text>
                <Text style={styles.settlementValue}>
                  {checkout.depositAmount.toLocaleString('vi-VN')} đ
                </Text>
              </View>
              {checkout.unpaidBalance > 0 && (
                <View style={styles.settlementRow}>
                  <Text style={styles.settlementLabel}>(-) Công nợ còn lại</Text>
                  <Text style={[styles.settlementValue, { color: Colors.error }]}>
                    -{checkout.unpaidBalance.toLocaleString('vi-VN')} đ
                  </Text>
                </View>
              )}
              {checkout.damageDeduction > 0 && (
                <View style={styles.settlementRow}>
                  <Text style={styles.settlementLabel}>(-) Khấu trừ hư hỏng</Text>
                  <Text style={[styles.settlementValue, { color: Colors.error }]}>
                    -{checkout.damageDeduction.toLocaleString('vi-VN')} đ
                  </Text>
                </View>
              )}
              {checkout.serviceDeduction > 0 && (
                <View style={styles.settlementRow}>
                  <Text style={styles.settlementLabel}>(-) Phí dịch vụ</Text>
                  <Text style={[styles.settlementValue, { color: Colors.error }]}>
                    -{checkout.serviceDeduction.toLocaleString('vi-VN')} đ
                  </Text>
                </View>
              )}
            </View>

            {/* Total refund */}
            <View style={styles.refundTotalRow}>
              <Text style={styles.refundTotalLabel}>Số tiền hoàn lại</Text>
              <Text style={styles.refundTotalValue}>
                {checkout.finalRefundAmount.toLocaleString('vi-VN')} đ
              </Text>
            </View>

            {/* Bank account */}
            <View style={styles.bankCard}>
              <Text style={styles.bankTitle}>🏦 Tài khoản nhận tiền</Text>
              <Text style={styles.bankDetail}>{checkout.refundBankName}</Text>
              <Text style={styles.bankDetail}>{checkout.refundBankAccount}</Text>
              <Text style={styles.bankDetail}>{checkout.refundAccountHolder}</Text>
            </View>

            {/* Refund status */}
            <View style={styles.refundStatusRow}>
              <Text style={styles.refundStatusLabel}>Trạng thái hoàn cọc</Text>
              <View style={[
                styles.refundStatusBadge,
                { backgroundColor: REFUND_STATUS_COLOR[checkout.refundStatus] + '20' },
              ]}>
                <Text style={[
                  styles.refundStatusText,
                  { color: REFUND_STATUS_COLOR[checkout.refundStatus] },
                ]}>
                  {REFUND_STATUS_LABEL[checkout.refundStatus]}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ── Section 5: Ghi chú quản lý ── */}
        {checkout.managerNote && !isCancelled && (
          <SectionCard title="📝 Ghi chú từ quản lý">
            <Text style={styles.managerNote}>{checkout.managerNote}</Text>
          </SectionCard>
        )}

        {/* ── Actions ── */}
        {!isCompleted && !isCancelled && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.contactBtn}
              onPress={() => {}}
              activeOpacity={0.8}
            >
              <Text style={styles.contactBtnText}>📞 Liên hệ quản lý</Text>
            </TouchableOpacity>
          </View>
        )}

        {isCompleted && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.contactBtn, { backgroundColor: Colors.successLight, borderColor: Colors.success }]}
              activeOpacity={0.8}
            >
              <Text style={[styles.contactBtnText, { color: Colors.success }]}>
                📄 Xem lịch sử thanh toán
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Demo: Tiến bước tiếp theo ── */}
        {!isCompleted && !isCancelled && DEMO_NEXT_LABEL[checkout.status] && (
          <View style={styles.demoBox}>
            <View style={styles.demoHeader}>
              <Text style={styles.demoTag}>⚙️ DEMO</Text>
              <Text style={styles.demoHint}>Nhấn để mô phỏng hành động từ phía quản lý</Text>
            </View>
            <TouchableOpacity
              style={styles.demoBtn}
              onPress={handleDemoAdvance}
              activeOpacity={0.8}
            >
              <Text style={styles.demoBtnArrow}>▶</Text>
              <Text style={styles.demoBtnText}>{DEMO_NEXT_LABEL[checkout.status]}</Text>
            </TouchableOpacity>
          </View>
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

  // Empty state
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emptyIcon: { fontSize: 52, marginBottom: Spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xl },
  emptyBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, ...Shadow.md },
  emptyBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },

  // Completion banner
  completionBanner: {
    borderRadius: BorderRadius.xl, padding: Spacing.lg, alignItems: 'center', gap: Spacing.xs,
  },
  completionIcon: { fontSize: 40 },
  completionTitle: { fontSize: 18, fontWeight: '800' },
  completionDesc: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: 4 },

  // Status row
  statusRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusChipText: { fontSize: 13, fontWeight: '700' },
  submittedDate: { fontSize: 12, color: Colors.textMuted },

  // Section card
  sectionCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  sectionTitle: {
    fontSize: 14, fontWeight: '700', color: Colors.textPrimary,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.base, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  sectionBody: { paddingHorizontal: Spacing.base },

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: Spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  infoLabel: { fontSize: 13, color: Colors.textMuted, flex: 1 },
  infoValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, flex: 1.2, textAlign: 'right' },

  // Timeline
  timeline: { padding: Spacing.base },
  timelineItem: { flexDirection: 'row', gap: Spacing.md, minHeight: 56 },
  timelineLeft: { width: 28, alignItems: 'center' },
  timelineDot: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  timelineDotDone:   { backgroundColor: Colors.success, borderColor: Colors.success },
  timelineDotActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  timelineDotFuture: { backgroundColor: Colors.background, borderColor: Colors.divider },
  timelineDotCheck:  { fontSize: 12, fontWeight: '800', color: Colors.white },
  timelineDotPulse:  { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.white },
  timelineLine: {
    flex: 1, width: 2, backgroundColor: Colors.divider, marginVertical: 2,
  },
  timelineLineDone: { backgroundColor: Colors.success },

  timelineContent: { flex: 1, paddingBottom: Spacing.lg, paddingTop: 4 },
  timelineLabel: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  timelineLabelDone:   { color: Colors.success },
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

  cancelledNote: { padding: Spacing.base },
  cancelledText: { fontSize: 14, fontWeight: '700', color: Colors.error, marginBottom: 4 },
  cancelledReason: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },

  // Inspection
  noDamage: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    backgroundColor: Colors.successLight, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginTop: Spacing.sm,
  },
  noDamageIcon: { fontSize: 18 },
  noDamageText: { flex: 1, fontSize: 13, color: Colors.success, lineHeight: 20, fontWeight: '600' },

  damageListTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  damageCard: { paddingVertical: Spacing.sm, gap: 4 },
  damageCardBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  damageTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  damageDesc: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  damageDeductBadge: { backgroundColor: Colors.errorLight, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.full },
  damageDeductText: { fontSize: 11, fontWeight: '700', color: Colors.error },
  damageNote: { fontSize: 12, color: Colors.textMuted, fontStyle: 'italic' },

  // Settlement card
  settlementCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  settlementRows: { paddingHorizontal: Spacing.base, marginTop: Spacing.sm },
  settlementRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  settlementLabel: { fontSize: 13, color: Colors.textSecondary },
  settlementValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

  refundTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    margin: Spacing.base, paddingVertical: Spacing.md, paddingHorizontal: Spacing.base,
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg,
  },
  refundTotalLabel: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  refundTotalValue: { fontSize: 20, fontWeight: '800', color: Colors.primary },

  bankCard: {
    marginHorizontal: Spacing.base, marginBottom: Spacing.sm,
    backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.md,
    gap: 4,
  },
  bankTitle: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 4 },
  bankDetail: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

  refundStatusRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  refundStatusLabel: { fontSize: 13, color: Colors.textMuted },
  refundStatusBadge: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: BorderRadius.full },
  refundStatusText: { fontSize: 12, fontWeight: '700' },

  // Manager note
  managerNote: {
    fontSize: 14, color: Colors.textSecondary, lineHeight: 22,
    paddingHorizontal: Spacing.base, paddingBottom: Spacing.base,
  },

  // Actions
  actions: { gap: Spacing.sm },
  contactBtn: {
    borderRadius: BorderRadius.lg, paddingVertical: Spacing.md,
    alignItems: 'center', borderWidth: 1.5, borderColor: Colors.primary,
  },
  contactBtnText: { fontSize: 15, fontWeight: '700', color: Colors.primary },

  // Demo section
  demoBox: {
    borderRadius: BorderRadius.xl, borderWidth: 1.5,
    borderColor: '#F59E0B', borderStyle: 'dashed',
    backgroundColor: '#FFFBEB', padding: Spacing.md, gap: Spacing.sm,
  },
  demoHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  demoTag: {
    fontSize: 10, fontWeight: '800', color: '#92400E',
    backgroundColor: '#FDE68A', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: BorderRadius.sm, letterSpacing: 0.5,
  },
  demoHint: { fontSize: 11, color: '#92400E', flex: 1 },
  demoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: '#F59E0B', borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, ...Shadow.sm,
  },
  demoBtnArrow: { fontSize: 14, color: Colors.white, fontWeight: '800' },
  demoBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white, flex: 1 },
});
