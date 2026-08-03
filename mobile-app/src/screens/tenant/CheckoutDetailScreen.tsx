import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, TextInput, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import {
  Colors, Spacing, BorderRadius, Shadow, checkoutMeta, CHECKOUT_AUTO_ACCEPT_DAYS,
} from '@/constants';
import { formatDate, showAlert } from '@/utils';
import { realTenantSelfService } from '@/services/tenant/selfService';
import type { CheckoutRequestDto } from '@/services/tenant/selfService';

/**
 * Tenant theo dõi TIẾN TRÌNH TRẢ PHÒNG — dữ liệu thật GET /tenant/me/checkout-requests.
 *
 * Luồng đầy đủ (docs/PLAN-checkout-flow-2026-08-03.md):
 *   PENDING → APPROVED → INSPECTING → WAITING_TENANT → SETTLING → COMPLETED
 * Ở WAITING_TENANT khách phải ĐỒNG Ý hoặc KHÔNG ĐỒNG Ý với bảng quyết toán —
 * đây là đối trọng duy nhất của khách trước khi bị trừ tiền cọc.
 */

const TIMELINE_STEPS = [
  { label: 'Gửi yêu cầu', desc: 'Yêu cầu trả phòng đã được ghi nhận' },
  { label: 'Quản lý duyệt', desc: 'Quản lý xem xét và hẹn ngày kiểm tra phòng' },
  { label: 'Kiểm tra phòng', desc: 'Quản lý chụp ảnh hiện trạng, đối chiếu thiết bị, chốt điện/nước' },
  { label: 'Bạn xác nhận quyết toán', desc: 'Xem bảng tiền cọc và xác nhận hoặc phản hồi nếu chưa đúng' },
  { label: 'Hoàn cọc & kết thúc', desc: 'Nhận lại cọc (hoặc đóng thêm), hợp đồng kết thúc' },
];

// Map status BE -> bước ĐANG diễn ra (index của TIMELINE_STEPS).
const STATUS_TO_STEP: Record<string, number> = {
  PENDING: 1,
  APPROVED: 2,
  INSPECTING: 2,
  WAITING_TENANT: 3,
  DISPUTED: 3,
  SETTLING: 4,
  COMPLETED: 5, // vượt quá bước cuối = tất cả done
};

/** Vài trạng thái cần đổi cách xưng hô khi hiển thị cho chính khách. */
const TENANT_LABEL: Record<string, string> = {
  PENDING: 'Chờ quản lý duyệt',
  REJECTED: 'Bị từ chối',
  DISPUTED: 'Bạn đã phản hồi — chờ xử lý',
  CANCELLED: 'Đã hủy',
};
const tenantMeta = (status?: string) => {
  const m = checkoutMeta(status);
  return { ...m, label: TENANT_LABEL[(status || '').toUpperCase()] ?? m.label };
};

const money = (n: number) => (n || 0).toLocaleString('vi-VN') + 'đ';

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
  // Phản hồi bảng quyết toán
  const [busy, setBusy] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');

  const load = useCallback(async () => {
    try {
      const list = await realTenantSelfService.listMyCheckoutRequests();
      // Mới nhất lên đầu (BE có thể trả ASC)
      list.sort((a, b) => b.id - a.id);
      setRequests(list);
      setSelectedId((prev) => prev ?? list[0]?.id ?? null);
    } catch {
      showAlert('Lỗi', 'Không tải được yêu cầu trả phòng.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const checkout = requests.find((r) => r.id === selectedId) ?? requests[0] ?? null;

  const handleCancel = () => {
    if (!checkout) return;
    showAlert('Hủy yêu cầu trả phòng?', 'Bạn có thể gửi lại yêu cầu mới sau nếu đổi ý.', [
      { text: 'Không' },
      {
        text: 'Hủy yêu cầu',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            await realTenantSelfService.cancelCheckoutRequest(checkout.id);
            showAlert('Đã hủy', 'Yêu cầu trả phòng đã được hủy.');
            load();
          } catch (err: any) {
            showAlert('Lỗi', err?.response?.data?.message || 'Không hủy được yêu cầu.');
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  const handleAccept = () => {
    if (!checkout) return;
    showAlert(
      'Đồng ý với bảng quyết toán?',
      'Sau khi đồng ý, quản lý sẽ hoàn cọc (hoặc bạn đóng thêm phần còn thiếu) và hợp đồng kết thúc.',
      [
        { text: 'Để xem lại' },
        {
          text: 'Đồng ý',
          onPress: async () => {
            setBusy(true);
            try {
              await realTenantSelfService.acceptSettlement(checkout.id);
              showAlert('Đã xác nhận', 'Cảm ơn bạn. Quản lý sẽ tiến hành hoàn cọc.');
              load();
            } catch (err: any) {
              showAlert('Lỗi', err?.response?.data?.message || 'Không gửi được xác nhận.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const submitDispute = async () => {
    if (!checkout) return;
    if (!disputeReason.trim()) {
      return showAlert('Thiếu lý do', 'Ghi rõ khoản nào bạn thấy chưa đúng để quản lý xem lại.');
    }
    setBusy(true);
    try {
      await realTenantSelfService.disputeSettlement(checkout.id, { reason: disputeReason.trim() });
      setDisputeOpen(false);
      setDisputeReason('');
      showAlert('Đã gửi phản hồi', 'Chủ nhà và quản lý đã được thông báo để xem lại biên bản.');
      load();
    } catch (err: any) {
      showAlert('Lỗi', err?.response?.data?.message || 'Không gửi được phản hồi.');
    } finally {
      setBusy(false);
    }
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
  const meta = tenantMeta(status);
  const isRejected = status === 'REJECTED';
  const isCancelled = status === 'CANCELLED';
  const isCompleted = status === 'COMPLETED';
  const currentStep = STATUS_TO_STEP[status] ?? 1;
  const inspection = checkout.inspection;
  const settlement = checkout.settlement;

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
                    #{r.id} · {tenantMeta(r.status).label}
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

        {/* Biên bản kiểm tra phòng */}
        {!!inspection && (
          <SectionCard title="📷 Biên bản kiểm tra phòng">
            {!!inspection.photos?.length && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.sm }}>
                <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                  {inspection.photos.map((url, i) => (
                    <Image key={`${url}-${i}`} source={{ uri: url }} style={styles.inspPhoto} />
                  ))}
                </View>
              </ScrollView>
            )}
            {inspection.electricityFinalReading != null && (
              <InfoRow label="Chỉ số điện cuối" value={`${inspection.electricityFinalReading}`} />
            )}
            {inspection.waterFinalReading != null && (
              <InfoRow label="Chỉ số nước cuối" value={`${inspection.waterFinalReading}`} />
            )}
            {!!inspection.roomConditionNote && (
              <Text style={styles.managerNote}>{inspection.roomConditionNote}</Text>
            )}
            {!!inspection.damages?.length && (
              <View style={{ marginTop: Spacing.sm }}>
                <Text style={styles.subTitle}>Hư hỏng ghi nhận</Text>
                {inspection.damages.map((d, i) => (
                  <View key={i} style={styles.damageRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.damageLabel}>{d.label}</Text>
                      {!!d.note && <Text style={styles.damageNote}>{d.note}</Text>}
                    </View>
                    <Text style={styles.damageAmount}>{money(d.amount)}</Text>
                  </View>
                ))}
              </View>
            )}
          </SectionCard>
        )}

        {/* Bảng quyết toán cọc */}
        {!!settlement && (
          <SectionCard title="💰 Quyết toán tiền cọc">
            <View style={styles.settleRow}>
              <Text style={styles.settleLabel}>Tiền cọc</Text>
              <Text style={styles.settleValueBold}>{money(settlement.depositAmount)}</Text>
            </View>
            {(settlement.unpaidInvoices ?? []).map(inv => (
              <View key={inv.id} style={styles.settleRow}>
                <Text style={styles.settleLabel}>− Hoá đơn {inv.code || `#${inv.id}`}</Text>
                <Text style={styles.settleValueNeg}>−{money(inv.amount)}</Text>
              </View>
            ))}
            {!settlement.unpaidInvoices?.length && settlement.unpaidTotal > 0 && (
              <View style={styles.settleRow}>
                <Text style={styles.settleLabel}>− Hoá đơn chưa thanh toán</Text>
                <Text style={styles.settleValueNeg}>−{money(settlement.unpaidTotal)}</Text>
              </View>
            )}
            {settlement.damageTotal > 0 && (
              <View style={styles.settleRow}>
                <Text style={styles.settleLabel}>− Hư hỏng</Text>
                <Text style={styles.settleValueNeg}>−{money(settlement.damageTotal)}</Text>
              </View>
            )}
            {(settlement.adjustments ?? []).map((a, i) => (
              <View key={`adj-${i}`} style={styles.settleRow}>
                <Text style={styles.settleLabel}>{a.amount < 0 ? '− ' : '+ '}{a.label}</Text>
                <Text style={a.amount < 0 ? styles.settleValueNeg : styles.settleValue}>
                  {a.amount < 0 ? '−' : '+'}{money(Math.abs(a.amount))}
                </Text>
              </View>
            ))}

            <View style={styles.settleDivider} />
            <View style={styles.settleRow}>
              <Text style={styles.settleTotalLabel}>
                {settlement.refundAmount > 0 ? 'BẠN ĐƯỢC NHẬN LẠI'
                  : settlement.extraChargeAmount > 0 ? 'BẠN CẦN ĐÓNG THÊM' : 'KHÔNG PHÁT SINH'}
              </Text>
              <Text style={[
                styles.settleTotalValue,
                { color: settlement.extraChargeAmount > 0 ? Colors.error : Colors.success },
              ]}>
                {money(settlement.refundAmount > 0 ? settlement.refundAmount : settlement.extraChargeAmount)}
              </Text>
            </View>

            {!!settlement.refundedAt && (
              <Text style={styles.refundedNote}>
                ✓ Quản lý đã hoàn cọc ngày {formatDate(settlement.refundedAt)}
              </Text>
            )}
          </SectionCard>
        )}

        {/* Khách xác nhận bảng quyết toán */}
        {status === 'WAITING_TENANT' && (
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>Bạn có đồng ý với bảng quyết toán trên?</Text>
            <Text style={styles.confirmDesc}>
              {checkout.tenantResponseDeadline
                ? `Hạn phản hồi: ${formatDate(checkout.tenantResponseDeadline)}. `
                : ''}
              Quá {CHECKOUT_AUTO_ACCEPT_DAYS} ngày không phản hồi, hệ thống xem như bạn đồng ý.
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={[styles.disputeBtn, busy && { opacity: 0.6 }]}
                onPress={() => setDisputeOpen(true)}
                disabled={busy}
              >
                <Text style={styles.disputeBtnText}>Không đồng ý</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.acceptBtn, busy && { opacity: 0.6 }]}
                onPress={handleAccept}
                disabled={busy}
              >
                <Text style={styles.acceptBtnText}>✓ Đồng ý</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {status === 'DISPUTED' && !!checkout.disputeReason && (
          <View style={[styles.banner, { backgroundColor: Colors.warningLight }]}>
            <Text style={styles.bannerIcon}>⏳</Text>
            <Text style={[styles.bannerTitle, { color: '#B45309' }]}>Đang xử lý phản hồi của bạn</Text>
            <Text style={styles.bannerDesc}>"{checkout.disputeReason}"</Text>
          </View>
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

      {/* Modal: khách nêu lý do không đồng ý bảng quyết toán */}
      <Modal visible={disputeOpen} transparent animationType="fade" onRequestClose={() => setDisputeOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Khoản nào chưa đúng?</Text>
            <Text style={styles.modalDesc}>
              Ghi rõ khoản bạn thấy chưa hợp lý. Chủ nhà và quản lý sẽ nhận được phản hồi này để xem lại biên bản.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={disputeReason}
              onChangeText={setDisputeReason}
              multiline
              placeholder="VD: Vết ố trên tường đã có từ lúc tôi nhận phòng, có trong ảnh bàn giao..."
              placeholderTextColor={Colors.textMuted}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setDisputeOpen(false)} disabled={busy}>
                <Text style={styles.modalCancelText}>Đóng</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, busy && { opacity: 0.6 }]}
                onPress={submitDispute}
                disabled={busy}
              >
                <Text style={styles.modalSubmitText}>{busy ? 'Đang gửi...' : 'Gửi phản hồi'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

  // ── Biên bản kiểm tra ──
  inspPhoto: { width: 110, height: 110, borderRadius: BorderRadius.md, backgroundColor: Colors.divider },
  subTitle: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary, marginBottom: 4 },
  damageRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    paddingVertical: 6, borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  damageLabel: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  damageNote: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  damageAmount: { fontSize: 13, fontWeight: '700', color: Colors.error },

  // ── Bảng quyết toán ──
  settleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm, paddingVertical: 5 },
  settleLabel: { flex: 1, fontSize: 13, color: Colors.textSecondary },
  settleValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  settleValueBold: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  settleValueNeg: { fontSize: 13, fontWeight: '600', color: Colors.error },
  settleDivider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.sm },
  settleTotalLabel: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary, letterSpacing: 0.4 },
  settleTotalValue: { fontSize: 19, fontWeight: '800' },
  refundedNote: { fontSize: 12, fontWeight: '700', color: Colors.success, marginTop: Spacing.sm },

  // ── Khối xác nhận của khách ──
  confirmBox: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl, padding: Spacing.base,
    borderWidth: 1.5, borderColor: Colors.primary, marginBottom: Spacing.md, ...Shadow.sm,
  },
  confirmTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  confirmDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginTop: 4 },
  confirmActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  disputeBtn: {
    flex: 1, borderRadius: BorderRadius.lg, paddingVertical: Spacing.md, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.error, backgroundColor: Colors.errorLight,
  },
  disputeBtnText: { fontSize: 14, fontWeight: '700', color: Colors.error },
  acceptBtn: {
    flex: 1.4, borderRadius: BorderRadius.lg, paddingVertical: Spacing.md,
    alignItems: 'center', backgroundColor: Colors.primary,
  },
  acceptBtnText: { fontSize: 14, fontWeight: '800', color: Colors.white },

  // ── Modal phản đối ──
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: Spacing.lg,
  },
  modalBox: { width: '100%', backgroundColor: Colors.white, borderRadius: BorderRadius.xl, padding: Spacing.lg },
  modalTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  modalDesc: { fontSize: 13, color: Colors.textSecondary, marginTop: 6, lineHeight: 19 },
  modalInput: {
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: 14, color: Colors.textPrimary, height: 96, textAlignVertical: 'top',
    marginTop: Spacing.md,
  },
  modalActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  modalCancel: {
    flex: 1, borderRadius: BorderRadius.lg, paddingVertical: Spacing.md, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  modalSubmit: {
    flex: 1.4, borderRadius: BorderRadius.lg, paddingVertical: Spacing.md,
    alignItems: 'center', backgroundColor: Colors.error,
  },
  modalSubmitText: { fontSize: 14, fontWeight: '700', color: Colors.white },
});
