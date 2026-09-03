import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useAuth } from '@/hooks';

/**
 * Tenant theo dõi TIẾN TRÌNH TRẢ PHÒNG — dữ liệu thật GET /tenant/me/checkout-requests.
 *
 * Luồng đầy đủ (docs/PLAN-checkout-flow-2026-08-03.md):
 *   PENDING → APPROVED → INSPECTING → WAITING_TENANT → SETTLING → COMPLETED
 * Ở WAITING_TENANT khách phải ĐỒNG Ý hoặc KHÔNG ĐỒNG Ý với bảng quyết toán —
 * đây là đối trọng duy nhất của khách trước khi bị trừ tiền cọc.
 */

/**
 * Bước cuối TÁCH LÀM HAI (20/08/2026).
 *
 * Bản cũ gộp "Hoàn cọc & kết thúc" thành một, mô tả là *"Nhận lại cọc (hoặc đóng thêm)"* —
 * câu đó thuộc mô hình **cấn trừ** đã bỏ. Theo mô hình mới, khách **thanh toán khoản cuối
 * kỳ trước**, trả đủ rồi chủ nhà mới hoàn **nguyên** cọc.
 *
 * Tách ra còn vì bên trong đó khách CÓ VIỆC PHẢI LÀM (thanh toán, rồi bấm "đã nhận đủ").
 * Gộp một chấm đứng im thì khách không biết đang chờ mình hay chờ người khác.
 */
/**
 * Mô tả THAY THẾ cho bước cuối khi khách đã xác nhận nhận đủ cọc.
 *
 * Lúc đó khách KHÔNG còn việc gì, nhưng bước vẫn chưa xong: `confirmRefund` bên BE chỉ ghi
 * `refundConfirmedAt`, không đổi status cũng không thanh lý hợp đồng — quản lý còn phải bấm
 * "Hoàn tất trả phòng" nữa.
 *
 * Nên KHÔNG tick sẵn (tick là nói dối: hợp đồng vẫn còn hiệu lực trên giấy tờ), nhưng phải
 * đổi lời để chấm xanh không bị đọc thành "đến lượt bạn làm gì đó".
 */
const LAST_STEP_WAITING_DESC =
  'Bạn đã hoàn tất phần của mình. Quản lý đang làm thủ tục thanh lý hợp đồng.';

const TIMELINE_STEPS = [
  { label: 'Gửi yêu cầu', desc: 'Yêu cầu trả phòng đã được ghi nhận' },
  { label: 'Quản lý duyệt', desc: 'Quản lý xem xét và hẹn ngày kiểm tra phòng' },
  { label: 'Kiểm tra phòng', desc: 'Quản lý chụp ảnh hiện trạng, đối chiếu thiết bị, chốt điện/nước' },
  { label: 'Bạn xác nhận quyết toán', desc: 'Xem bảng tiền và xác nhận, hoặc phản hồi nếu chưa đúng' },
  { label: 'Bạn thanh toán khoản cuối kỳ', desc: 'Tiền điện, nước và bồi thường (nếu có) — trả đủ mới được hoàn cọc' },
  { label: 'Nhận lại tiền cọc', desc: 'Chủ nhà chuyển nguyên tiền cọc trong 1–3 ngày làm việc' },
  { label: 'Kết thúc', desc: 'Hợp đồng thanh lý, thủ tục trả phòng hoàn tất' },
];

// Map status BE -> bước ĐANG diễn ra (index của TIMELINE_STEPS).
const STATUS_TO_STEP: Record<string, number> = {
  PENDING: 1,
  APPROVED: 2,
  INSPECTING: 2,
  WAITING_TENANT: 3,
  DISPUTED: 3,
  // SETTLING gồm 3 việc nối nhau; bước chính xác suy thêm từ bảng quyết toán
  // (`settlementStep` bên dưới) vì BE dùng chung một status cho cả ba.
  SETTLING: 4,
  COMPLETED: 7, // vượt quá bước cuối = tất cả done
};

/**
 * Trong SETTLING, xác định đang ở việc nào — BE không tách status nên phải suy từ dữ liệu:
 * chưa trả đủ → bước thanh toán · đã trả, chưa nhận cọc → bước nhận cọc · đã nhận → bước cuối.
 */
/**
 * Mốc host đã chuyển cọc. BE trả `refundPaidAt`, FE từng dùng tên `refundedAt` — đọc cả hai
 * để không phụ thuộc bên nào đổi tên trước.
 */
const paidAtOf = (s?: { refundPaidAt?: string; refundedAt?: string }): string | undefined =>
  s?.refundPaidAt ?? s?.refundedAt;

const settlementStep = (s?: { chargesSettled?: boolean; refundConfirmedAt?: string }): number => {
  if (!s) return 4;
  if (s.chargesSettled === false) return 4;
  return s.refundConfirmedAt ? 6 : 5;
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

/**
 * Tách chuỗi `note` trở lại đúng HAI thứ khách đã nhập RIÊNG ở màn gửi yêu cầu.
 *
 * Ở RequestCheckoutScreen khách điền tài khoản vào 3 ô dưới mục "Tài khoản nhận hoàn cọc",
 * còn ghi chú là ô khác hẳn. FE mới gộp chúng vào một chuỗi `note` lúc gửi, vì
 * `CreateCheckoutRequest` bên BE chưa nhận field riêng
 * (xem doc-be/BE-NEED-tai-khoan-hoan-coc-cho-host-thay-2026-08-20.md).
 *
 * Khuôn FE ghi ra là cố định — `TK hoàn cọc: {ngân hàng} — {số TK} — {chủ TK}` — nên tách
 * ngược lại an toàn. Dòng không khớp khuôn thì để nguyên ở phần ghi chú: thà hiện thô còn
 * hơn gắn nhãn "tài khoản" cho một dòng không phải tài khoản.
 */
const splitNote = (note?: string): { bank: string; rest: string } => {
  if (!note) return { bank: '', rest: '' };
  const bank: string[] = [];
  const rest: string[] = [];
  note.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*TK hoàn cọc\s*:\s*(.+)$/i);
    if (m) bank.push(m[1].trim());
    else if (line.trim()) rest.push(line.trim());
  });
  return { bank: bank.join('\n'), rest: rest.join('\n') };
};

/** Nhãn tiếng Việt cho `TenantInvoiceType` BE trả trong `finalCharges`. */
const CHARGE_LABEL: Record<string, string> = {
  ELECTRICITY: 'Tiền điện kỳ cuối',
  WATER: 'Tiền nước kỳ cuối',
  COMPENSATION: 'Bồi thường hư hỏng',
  RENT: 'Tiền nhà',
  SERVICE: 'Phí dịch vụ',
  MAINTENANCE: 'Phí bảo trì',
  OTHER: 'Khoản khác',
};

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
  const { logout } = useAuth();
  const farewellShown = useRef(false);   // chỉ chào 1 lần, không hiện lại mỗi lần focus

  const [requests, setRequests] = useState<CheckoutRequestDto[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(paramRequestId ?? null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // Phản hồi bảng quyết toán
  const [busy, setBusy] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');
  // Khiếu nại CHƯA NHẬN ĐƯỢC TIỀN — khác hẳn khiếu nại bảng quyết toán ở trên:
  // cái kia cãi con số, cái này nói tiền chưa về tài khoản.
  const [noRefundOpen, setNoRefundOpen] = useState(false);
  const [noRefundReason, setNoRefundReason] = useState('');

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
  const noteParts = splitNote(checkout?.note);

  // Trả phòng xong = hợp đồng kết thúc = tài khoản ngừng hoạt động. Chào khách một câu
  // rồi đưa về màn đăng nhập (lần sau đăng nhập sẽ bị chặn ngay từ cổng — accountAccess).
  useEffect(() => {
    if (!checkout || (checkout.status || '').toUpperCase() !== 'COMPLETED') return;
    if (farewellShown.current) return;
    farewellShown.current = true;
    showAlert(
      'Đã hoàn tất trả phòng',
      'Cảm ơn bạn đã ở cùng Hoàng Bình Land. Hợp đồng đã kết thúc nên tài khoản này sẽ ngừng '
      + 'hoạt động. Bạn có thể xem lại bảng quyết toán trước khi đăng xuất.',
      [
        { text: 'Xem lại quyết toán', style: 'cancel' },
        { text: 'Đăng xuất', onPress: () => { logout(); } },
      ],
      '👋',
    );
  }, [checkout?.id, checkout?.status]);

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

  /** Khách xác nhận đã nhận đủ cọc — bước cuối khép phần tiền nong. */
  const confirmRefund = () => {
    if (!checkout) return;
    showAlert(
      'Xác nhận đã nhận đủ tiền cọc?',
      'Chỉ bấm khi bạn đã kiểm tra tài khoản và thấy tiền về đủ. Xác nhận rồi không đổi lại được.',
      [
        { text: 'Để kiểm tra lại', style: 'cancel' },
        {
          text: 'Đã nhận đủ',
          onPress: async () => {
            setBusy(true);
            try {
              await realTenantSelfService.confirmRefundReceived(checkout.id);
              showAlert('Cảm ơn bạn', 'Đã ghi nhận. Thủ tục trả phòng của bạn hoàn tất về phần tiền.');
              load();
            } catch (err: any) {
              showAlert('Lỗi', err?.response?.data?.message || 'Không ghi nhận được.');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  /**
   * Báo chưa nhận được tiền. BE bắt lý do 10–500 ký tự nên chặn ngay tại đây,
   * đừng để khách gõ xong bấm gửi mới báo lỗi.
   */
  const submitNoRefund = async () => {
    if (!checkout) return;
    const reason = noRefundReason.trim();
    if (reason.length < 10) {
      return showAlert('Thiếu thông tin', 'Mô tả rõ hơn một chút (ít nhất 10 ký tự) để bên quản lý tra soát được.');
    }
    setBusy(true);
    try {
      await realTenantSelfService.disputeRefundReceived(checkout.id, reason);
      setNoRefundOpen(false);
      setNoRefundReason('');
      showAlert('Đã gửi phản ánh', 'Chủ nhà và quản trị viên sẽ tra soát và liên hệ lại với bạn.');
      load();
    } catch (err: any) {
      showAlert('Lỗi', err?.response?.data?.message || 'Không gửi được phản ánh.');
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
  const inspection = checkout.inspection;
  const settlement = checkout.settlement;
  // SETTLING gồm 3 việc nối nhau nên phải suy thêm từ bảng quyết toán, xem `settlementStep`.
  const currentStep = status === 'SETTLING'
    ? settlementStep(settlement)
    : STATUS_TO_STEP[status] ?? 1;

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
          {/*
            Tách `note` trở lại đúng hai thứ khách đã nhập RIÊNG ở màn gửi yêu cầu.

            Khách điền tài khoản vào 3 ô dưới mục "Tài khoản nhận hoàn cọc", còn ghi chú là ô
            khác hẳn — FE mới gộp chúng vào một chuỗi `note` lúc gửi (vì BE chưa nhận field
            riêng, xem doc-be/BE-NEED-tai-khoan-hoan-coc-cho-host-thay). Hiện ngược lại dưới
            nhãn "Ghi chú" là gán cho khách thứ họ không hề gõ vào ô đó.
          */}
          {!!noteParts.bank && <InfoRow label="Tài khoản nhận hoàn cọc" value={noteParts.bank} />}
          {!!noteParts.rest && <InfoRow label="Ghi chú" value={noteParts.rest} />}
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
                        {i === TIMELINE_STEPS.length - 1 && isActive ? LAST_STEP_WAITING_DESC : step.desc}
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
            {/* Ảnh mặt đồng hồ lúc chốt — khách tự đối chiếu, khỏi phải tin lời suông. */}
            {(!!inspection.electricMeterImageUrl || !!inspection.waterMeterImageUrl) && (
              <View style={styles.meterPhotoRow}>
                {!!inspection.electricMeterImageUrl && (
                  <View style={styles.meterPhotoItem}>
                    <Text style={styles.meterPhotoLabel}>⚡ Đồng hồ điện</Text>
                    <Image source={{ uri: inspection.electricMeterImageUrl }} style={styles.inspPhoto} />
                  </View>
                )}
                {!!inspection.waterMeterImageUrl && (
                  <View style={styles.meterPhotoItem}>
                    <Text style={styles.meterPhotoLabel}>💧 Đồng hồ nước</Text>
                    <Image source={{ uri: inspection.waterMeterImageUrl }} style={styles.inspPhoto} />
                  </View>
                )}
              </View>
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

        {/*
          Bảng quyết toán — HAI KHỐI TÁCH RỜI (mô hình chốt 20/08/2026).

          Bản cũ bù trừ: cọc − nợ − hư hỏng = số nhận lại. Nay cọc KHÔNG bị trừ gì; khách
          thanh toán các khoản cuối kỳ như hoá đơn thường, trả đủ thì chủ nhà hoàn NGUYÊN cọc.
          Cọc đóng vai trò ràng buộc, không phải nguồn khấu trừ.
        */}
        {!!settlement && (
          <>
            <SectionCard title="🧾 Khoản bạn cần thanh toán">
              {(settlement.finalCharges ?? []).map(inv => (
                <View key={inv.id} style={styles.settleRow}>
                  <Text style={styles.settleLabel}>
                    {CHARGE_LABEL[inv.type ?? ''] ?? 'Hoá đơn'} {inv.code || `#${inv.id}`}
                  </Text>
                  <Text style={styles.settleValueNeg}>{money(inv.amount)}</Text>
                </View>
              ))}
              {!settlement.finalCharges?.length && settlement.chargesTotal > 0 && (
                <View style={styles.settleRow}>
                  <Text style={styles.settleLabel}>Khoản cuối kỳ</Text>
                  <Text style={styles.settleValueNeg}>{money(settlement.chargesTotal)}</Text>
                </View>
              )}

              <View style={styles.settleDivider} />
              {/*
                Trả đủ rồi thì hiện SỐ ĐÃ TRẢ, không hiện số còn nợ.
                Bản cũ luôn hiện phần còn thiếu, nên khi trả xong thành ra dòng
                "ĐÃ THANH TOÁN ĐỦ — 0đ" — đọc lên như thể khách mới trả 0 đồng.
              */}
              <View style={styles.settleRow}>
                <Text style={styles.settleTotalLabel}>
                  {settlement.chargesSettled ? 'ĐÃ THANH TOÁN ĐỦ' : 'CÒN PHẢI TRẢ'}
                </Text>
                <Text style={[
                  styles.settleTotalValue,
                  { color: settlement.chargesSettled ? Colors.success : Colors.error },
                ]}>
                  {settlement.chargesSettled
                    ? `✓ ${money(settlement.chargesPaid || settlement.chargesTotal)}`
                    : money(Math.max(0, (settlement.chargesTotal ?? 0) - (settlement.chargesPaid ?? 0)))}
                </Text>
              </View>

              {!settlement.chargesSettled && (
                <Text style={styles.refundEtaNote}>
                  Thanh toán các khoản trên trong mục Hoá đơn. Trả đủ rồi chủ nhà mới chuyển
                  lại tiền cọc cho bạn.
                </Text>
              )}
            </SectionCard>

            <SectionCard title="💰 Tiền cọc được hoàn">
              <View style={styles.settleRow}>
                <Text style={styles.settleLabel}>Tiền cọc đã đóng</Text>
                <Text style={styles.settleValueBold}>{money(settlement.depositAmount)}</Text>
              </View>
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
                <Text style={styles.settleTotalLabel}>BẠN ĐƯỢC NHẬN LẠI</Text>
                <Text style={[styles.settleTotalValue, { color: Colors.success }]}>
                  {money((settlement.depositAmount ?? 0) + (settlement.adjustmentTotal ?? 0))}
                </Text>
              </View>

              {/**
                * Nói rõ khi nào tiền về và về đâu.
                * Bảng bên quản lý KHÔNG hiện tiền cọc (chính sách managerVisibility), nên
                * app của khách là nơi DUY NHẤT nói đủ khoản này — thiếu câu này thì khách
                * xem xong không biết bao giờ nhận được tiền.
                */}
              {!paidAtOf(settlement) && (
                <Text style={styles.refundEtaNote}>
                  💸 Sau khi bạn thanh toán đủ các khoản cuối kỳ, chủ nhà chuyển tiền cọc trong
                  {' '}<Text style={{ fontWeight: '800' }}>1–3 ngày làm việc</Text>, về tài khoản
                  bạn đã điền khi gửi yêu cầu trả phòng.
                </Text>
              )}

              {!!paidAtOf(settlement) && (
                <Text style={styles.refundedNote}>
                  ✓ Chủ nhà đã chuyển cọc ngày {formatDate(paidAtOf(settlement))}
                </Text>
              )}

              {/*
                Khách xác nhận ĐÃ NHẬN ĐỦ.
                Ảnh biên lai chỉ chứng minh host đã chuyển đi, không chứng minh tiền tới đúng
                người. Thiếu bước này thì "đã hoàn cọc" là lời của một bên, khách kêu chưa
                nhận thì không có gì đối chiếu.
              */}
              {!!paidAtOf(settlement) && !settlement.refundConfirmedAt
                && !(settlement.refundDisputedAt && !settlement.refundDisputeResolvedAt) && (
                <View style={styles.confirmRefundBox}>
                  <Text style={styles.confirmRefundText}>
                    Kiểm tra tài khoản của bạn. Đã nhận đủ tiền thì bấm xác nhận để khép hồ sơ.
                  </Text>
                  <TouchableOpacity
                    style={[styles.confirmRefundBtn, busy && { opacity: 0.6 }]}
                    disabled={busy}
                    onPress={confirmRefund}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.confirmRefundBtnText}>✓ Tôi đã nhận đủ tiền cọc</Text>
                  </TouchableOpacity>

                  {/*
                    Lối ra cho trường hợp ngược lại. Để dạng chữ nhấn chứ không phải nút to
                    ngang hàng: đa số khách sẽ nhận được tiền bình thường, đặt hai nút to
                    cạnh nhau là mời bấm nhầm vào cái nặng hơn.
                  */}
                  <TouchableOpacity
                    style={styles.noRefundLink}
                    disabled={busy}
                    onPress={() => setNoRefundOpen(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.noRefundLinkText}>Tôi chưa nhận được tiền</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/*
                Đang tra soát — CHƯA có kết luận. Không hiện nút xác nhận trong lúc này,
                tránh khách lỡ tay khép hồ sơ khi khiếu nại còn treo.
              */}
              {!!settlement.refundDisputedAt && !settlement.refundDisputeResolvedAt
                && !settlement.refundConfirmedAt && (
                <View style={styles.disputeRefundBox}>
                  <Text style={styles.disputeRefundTitle}>
                    ⏳ Đang tra soát phản ánh của bạn
                  </Text>
                  <Text style={styles.disputeRefundText}>
                    Bạn đã báo chưa nhận được tiền ngày {formatDate(settlement.refundDisputedAt)}.
                    Chủ nhà và quản trị viên đang kiểm tra và sẽ liên hệ lại.
                  </Text>
                  {!!settlement.refundDisputeReason && (
                    <Text style={styles.disputeRefundReason}>
                      Nội dung bạn gửi: {settlement.refundDisputeReason}
                    </Text>
                  )}
                </View>
              )}

              {/*
                ĐÃ CÓ KẾT LUẬN. Hai kết quả rất khác nhau nên tách hẳn lời văn:
                  · RETRANSFERRED — tiền đã chuyển lại, khách phải kiểm tra và xác nhận lần nữa
                  · REJECTED      — hệ thống xác minh tiền đã tới, khách cần soát lại tài khoản
                Không tự đánh dấu khách đã nhận trong cả hai trường hợp — đó vẫn là việc của khách.
              */}
              {!!settlement.refundDisputeResolvedAt && !settlement.refundConfirmedAt && (
                <View style={[
                  styles.disputeRefundBox,
                  settlement.refundDisputeOutcome === 'RETRANSFERRED' && styles.disputeResolvedOk,
                ]}>
                  <Text style={[
                    styles.disputeRefundTitle,
                    settlement.refundDisputeOutcome === 'RETRANSFERRED' && styles.disputeResolvedOkText,
                  ]}>
                    {settlement.refundDisputeOutcome === 'RETRANSFERRED'
                      ? '✓ Đã chuyển lại tiền cọc cho bạn'
                      : 'ℹ️ Đã tra soát xong phản ánh của bạn'}
                  </Text>
                  <Text style={[
                    styles.disputeRefundText,
                    settlement.refundDisputeOutcome === 'RETRANSFERRED' && styles.disputeResolvedOkText,
                  ]}>
                    {settlement.refundDisputeOutcome === 'RETRANSFERRED'
                      ? `Xử lý ngày ${formatDate(settlement.refundDisputeResolvedAt)}. Kiểm tra lại tài khoản, nhận đủ rồi bấm xác nhận bên dưới.`
                      : `Xử lý ngày ${formatDate(settlement.refundDisputeResolvedAt)}. Hệ thống đối chiếu được giao dịch đã chuyển tới tài khoản bạn đăng ký. Vui lòng kiểm tra lại sao kê, nếu vẫn chưa thấy hãy liên hệ quản lý.`}
                  </Text>
                </View>
              )}

              {!!settlement.refundConfirmedAt && (
                <Text style={styles.refundedNote}>
                  ✓ Bạn đã xác nhận nhận đủ ngày {formatDate(settlement.refundConfirmedAt)}
                </Text>
              )}
            </SectionCard>
          </>
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

        {/*
          Actions.

          Phiếu do HỆ THỐNG tạo (hợp đồng hết hạn) thì KHÔNG hiện nút huỷ — máy chủ đã
          chặn (`CheckoutOrigin.CONTRACT_EXPIRED`), và huỷ nó cũng chẳng làm hợp đồng
          hết-hạn-ngược-lại được, chỉ xoá mất việc phải làm.

          Bày nút rồi để khách bấm vào mới nhận lỗi thì họ học được là "app hay báo lỗi",
          chứ không học được luật. Thay bằng một dòng nói thẳng.
        */}
        {status === 'PENDING' && (
          checkout.origin === 'CONTRACT_EXPIRED' ? (
            <View style={[styles.banner, { backgroundColor: Colors.background }]}>
              <Text style={styles.bannerIcon}>📋</Text>
              <Text style={[styles.bannerTitle, { color: Colors.textPrimary }]}>
                Phiếu này do hệ thống tạo
              </Text>
              <Text style={styles.bannerDesc}>
                Hợp đồng của bạn đã tới hạn nên hệ thống tự mở phiếu trả phòng. Quản lý sẽ
                liên hệ để hẹn ngày kiểm phòng. Cần hỗ trợ thì liên hệ quản lý.
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.cancelBtn, cancelling && { opacity: 0.6 }]}
              onPress={handleCancel}
              disabled={cancelling}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelBtnText}>{cancelling ? 'Đang hủy...' : '🚫 Hủy yêu cầu trả phòng'}</Text>
            </TouchableOpacity>
          )
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

      {/*
        Phản ánh CHƯA NHẬN ĐƯỢC TIỀN — tách hẳn modal khiếu nại quyết toán ở trên.
        Hai việc rất khác nhau: cái kia cãi con số trong bảng, cái này nói tiền chưa về
        tài khoản. Dùng chung một modal thì lời khách viết ra sẽ mơ hồ, người tra soát
        không biết đang phải kiểm cái gì.
      */}
      <Modal visible={noRefundOpen} transparent animationType="fade" onRequestClose={() => setNoRefundOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Bạn chưa nhận được tiền cọc?</Text>
            <Text style={styles.modalDesc}>
              Kiểm tra kỹ tài khoản trước khi gửi — chuyển khoản liên ngân hàng có thể chậm
              vài giờ. Nếu chắc chắn chưa nhận, mô tả giúp để bên quản lý tra soát.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={noRefundReason}
              onChangeText={setNoRefundReason}
              multiline
              placeholder="VD: Đã kiểm tra tài khoản Vietcombank ...831 tới hôm nay vẫn chưa thấy tiền về."
              placeholderTextColor={Colors.textMuted}
            />
            {/* Đếm ký tự vì BE bắt tối thiểu 10 — cho khách thấy trước khi bấm gửi. */}
            <Text style={styles.modalHint}>
              {noRefundReason.trim().length < 10
                ? `Cần thêm ${10 - noRefundReason.trim().length} ký tự nữa`
                : `${noRefundReason.trim().length}/500 ký tự`}
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setNoRefundOpen(false)} disabled={busy}>
                <Text style={styles.modalCancelText}>Để kiểm tra lại</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmit, busy && { opacity: 0.6 }]}
                onPress={submitNoRefund}
                disabled={busy}
              >
                <Text style={styles.modalSubmitText}>{busy ? 'Đang gửi...' : 'Gửi phản ánh'}</Text>
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
  meterPhotoRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  meterPhotoItem: { gap: 4 },
  meterPhotoLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
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
  refundEtaNote: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginTop: Spacing.sm, backgroundColor: Colors.background, padding: Spacing.sm, borderRadius: BorderRadius.md },

  // ── Khách xác nhận đã nhận đủ cọc ──
  confirmRefundBox: {
    marginTop: Spacing.md, padding: Spacing.md,
    backgroundColor: Colors.successLight, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.success + '55',
  },
  confirmRefundText: { fontSize: 12, lineHeight: 18, color: '#065F46' },
  confirmRefundBtn: {
    marginTop: Spacing.sm, paddingVertical: 11,
    borderRadius: BorderRadius.lg, backgroundColor: Colors.success,
    alignItems: 'center',
  },
  confirmRefundBtnText: { fontSize: 14, fontWeight: '800', color: Colors.white },

  // Lối ra ngược lại — chữ nhấn, KHÔNG phải nút to ngang hàng với nút xác nhận.
  noRefundLink: { marginTop: Spacing.sm, alignSelf: 'center', paddingVertical: Spacing.xs, paddingHorizontal: Spacing.sm },
  noRefundLinkText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, textDecorationLine: 'underline' },

  // ── Đang tra soát phản ánh chưa nhận tiền ──
  disputeRefundBox: {
    backgroundColor: '#FFF7ED', borderRadius: BorderRadius.lg, padding: Spacing.base,
    borderWidth: 1, borderColor: '#FDBA74', marginTop: Spacing.sm,
  },
  disputeRefundTitle: { fontSize: 14, fontWeight: '800', color: '#9A3412' },
  disputeRefundText: { marginTop: 4, fontSize: 13, lineHeight: 19, color: '#9A3412' },
  disputeRefundReason: {
    marginTop: Spacing.sm, fontSize: 12, lineHeight: 18, color: '#9A3412',
    fontStyle: 'italic', opacity: 0.85,
  },

  // Kết luận CÓ LỢI cho khách (đã chuyển lại) → xanh lá, không dùng hổ phách như lúc đang tra soát.
  disputeResolvedOk: { backgroundColor: '#ECFDF5', borderColor: '#6EE7B7' },
  disputeResolvedOkText: { color: '#065F46' },

  modalHint: { marginTop: 6, fontSize: 11, color: Colors.textMuted, textAlign: 'right' },

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
