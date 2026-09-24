import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, TextInput, Platform, Modal, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { MaintenanceRequest } from '@/types';
import {
  formatDate, formatDateTime, formatCurrency, getMaintenanceCategoryLabel,
  getMaintenancePriorityLabel, getMaintenancePriorityColor, showAlert,
  isVideoUrl, formatDurationLabel, remainingEvidenceSlots, EVIDENCE_MAX_FILES,
  pickEvidenceFromCamera, pickEvidenceFromLibrary, type EvidenceAsset, type EvidenceMediaType,
} from '@/utils';
import {
  MAINTENANCE_STATUS_META, MAINTENANCE_CATEGORY_EMOJI, MAINTENANCE_BILLING_HINT_META,
  MAINTENANCE_VISIT_SLOT_MINUTES,
} from '@/constants/maintenance';
import { realMaintenanceService } from '@/services/shared/maintenanceService';
import { dtoToTenantRequest, toMaintenanceSharedBill } from '@/services/shared/maintenanceMappers';
import { CameraCaptureModal } from '../../components/common/CameraCaptureModal';
import { MaintenanceProgressTimeline } from '../../components/common/MaintenanceProgressTimeline';
import { MaintenancePhotoHistory } from '../../components/common/MaintenancePhotoHistory';
import { PhotoLightbox, type LightboxState } from '../../components/common/PhotoLightbox';
import { VideoPreviewModal } from '../../components/common/VideoPreviewModal';
import { AppointmentSlotPicker } from '../../components/common/AppointmentSlotPicker';
import { InvoicePaymentModal } from '@/components/invoice/InvoicePaymentModal';
import type { SharedBill } from '@/types/bill';
import { serverNow } from '@/utils/serverTime';
import { isBeforeAppointmentDay, toLocalDateTime, toApiDateTime } from '@/utils/maintenanceAppointment';
import { useMaintenanceRealtime } from '@/hooks/useBillingRealtime';

const CATEGORY_EMOJI = MAINTENANCE_CATEGORY_EMOJI;

const STATUS_META: Record<string, { label: string; color: string; emoji: string }> =
  Object.fromEntries(
    Object.entries(MAINTENANCE_STATUS_META).map(([k, m]) => [
      k, { label: m.label, color: m.color, emoji: m.icon },
    ]),
  );

const daysLeft = (deadline?: string): number | null => {
  if (!deadline) return null;
  const end = new Date(deadline).getTime();
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - serverNow().getTime()) / 86_400_000);
};

export const MaintenanceDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  /**
   * Hai đường vào màn này:
   *   • Từ danh sách  → `{ request }` (đủ dữ liệu, hiện được ngay)
   *   • Từ THÔNG BÁO  → `{ requestId }` (chỉ có id, phải tự nạp)
   *
   * Trước 13/08/2026 chỗ này destructure thẳng `route.params` rồi đọc `routeRequest.id`
   * — vào bằng deep-link không kèm `request` là ném TypeError và **crash app khách**.
   * Notification bảo trì hiện trỏ về `MaintenanceList` nên chưa lộ, nhưng sẽ lộ ngay
   * khi BE gửi `screen: "MaintenanceDetail"`.
   */
  const params = (route.params ?? {}) as { request?: MaintenanceRequest; requestId?: number | string };
  const routeRequest = params.request;

  // Ticket luôn tới từ BE thật (id số) — nạp bản mới nhất, route param chỉ dùng khi
  // đang tải hoặc offline.
  const idNum = Number(routeRequest?.id ?? params.requestId);
  const isRealId = Number.isFinite(idNum) && idNum > 0;
  const [realRequest, setRealRequest] = useState<MaintenanceRequest | undefined>(undefined);
  useEffect(() => {
    if (!isRealId) return;
    let active = true;
    realMaintenanceService.getDetail(idNum)
      .then(dto => { if (active) setRealRequest(dtoToTenantRequest(dto)); })
      .catch(() => { /* offline: dùng bản route param */ });
    return () => { active = false; };
  }, [idNum, isRealId]);

  const request = realRequest ?? routeRequest;
  const isReal = isRealId;

  const refreshReal = async () => {
    try { setRealRequest(dtoToTenantRequest(await realMaintenanceService.getDetail(idNum))); }
    catch { /* bỏ qua */ }
  };
  const apiErrMsg = (e: any, fallback: string) =>
    e?.response?.data?.error || e?.response?.data?.message || fallback;

  // Tự nạp lại khi phiếu ĐÚNG NÀY có cập nhật (manager duyệt/báo sửa xong, admin duyệt
  // lỗi do khách...) — không cần thoát vào lại màn.
  useMaintenanceRealtime({
    enabled: isRealId,
    filter: e => e.requestId === idNum,
    onRefresh: () => { void refreshReal(); },
  });

  // Nộp ảnh/video đã tự sửa (Luồng B — status pending_tenant_repair, chưa nộp). Video
  // thêm 14/09/2026 theo yêu cầu mentor — evidenceMediaPicker.ts.
  const [selfRepairNote, setSelfRepairNote] = useState('');
  const [selfRepairAssets, setSelfRepairAssets] = useState<EvidenceAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);

  // Thanh toán chi phí bảo trì (Luồng B, lỗi do khách) — hoá đơn PayOS đã có sẵn từ
  // lúc manager complete(), chỉ cần tái dùng InvoicePaymentModal như hoá đơn thường.
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payBill, setPayBill] = useState<SharedBill | null>(null);

  // Đổi lịch hẹn xem (05/09/2026) — chỉ khi OPEN, chưa confirm-arrival, còn trước ngày hẹn.
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState<string | null>(null);
  const [rescheduleBusy, setRescheduleBusy] = useState(false);

  // `request` chưa có ở lần render đầu khi vào bằng deep-link (chỉ có `requestId`).
  const currentStatusMeta = (request && STATUS_META[request.status]) || STATUS_META.open;
  const priorityColor = getMaintenancePriorityColor(request?.priority ?? 'medium');

  /**
   * Mở 1 ảnh/video đính kèm ĐÃ upload (before/after/fault_evidence — invoice giữ nguyên
   * ảnh-only, không cần đổi). Video mở VideoPreviewModal; ảnh mở PhotoLightbox — lọc bỏ
   * video khỏi mảng lướt để lightbox không lỡ lướt tới 1 video rồi render ảnh vỡ.
   */
  const openAttachment = (uris: string[], uri: string) => {
    if (isVideoUrl(uri)) { setVideoPreviewUrl(uri); return; }
    const imageOnly = uris.filter(u => !isVideoUrl(u));
    setLightbox({ uris: imageOnly, index: imageOnly.indexOf(uri) });
  };

  // ── Actions ────────────────────────────────────────────────────────

  const pickFromCamera = async (mode: EvidenceMediaType = 'image') => {
    setPhotoMenuOpen(false);
    const remaining = remainingEvidenceSlots(selfRepairAssets.length);
    if (remaining <= 0) { showAlert('Giới hạn', `Bạn chỉ có thể đính kèm tối đa ${EVIDENCE_MAX_FILES} ảnh/video.`); return; }
    // Quay video chưa hỗ trợ trên web (CameraCaptureModal/expo-camera CameraView chỉ
    // chụp ảnh) — nút "Quay video" bị ẩn trên web ở UI, chỉ còn nhánh ảnh chạy tới đây.
    if (Platform.OS === 'web') { setCameraOpen(true); return; }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') { showAlert('Lỗi', 'Cần quyền camera.'); return; }
    const media = await pickEvidenceFromCamera(mode);
    if (media) setSelfRepairAssets(prev => [...prev, media]);
  };
  const pickFromLibrary = async () => {
    setPhotoMenuOpen(false);
    const remaining = remainingEvidenceSlots(selfRepairAssets.length);
    if (remaining <= 0) { showAlert('Giới hạn', `Bạn chỉ có thể đính kèm tối đa ${EVIDENCE_MAX_FILES} ảnh/video.`); return; }
    const picked = await pickEvidenceFromLibrary(remaining);
    if (picked.length) setSelfRepairAssets(prev => [...prev, ...picked]);
  };

  /** Tenant nộp ảnh/video đã tự sửa xong (bắt buộc ≥1) — chờ manager verify-repair. */
  const submitSelfRepair = async () => {
    if (busy) return;
    if (selfRepairAssets.length === 0) { showAlert('Thiếu ảnh', 'Cần ít nhất 1 ảnh/video chứng minh đã sửa xong.'); return; }
    try {
      setBusy(true);
      await realMaintenanceService.submitSelfRepair(idNum, selfRepairNote.trim() || undefined, selfRepairAssets);
      await refreshReal();
      setSelfRepairNote(''); setSelfRepairAssets([]);
      showAlert('✅ Đã gửi', 'Quản lý sẽ kiểm tra và xác nhận kết quả sửa chữa của bạn.');
    } catch (e: any) { showAlert('Lỗi', apiErrMsg(e, 'Không thể gửi ảnh. Vui lòng thử lại.')); }
    finally { setBusy(false); }
  };

  /** Không ổn với lần sửa trước — tạo phiếu mới nối tiếp (không còn reopen cùng phiếu). */
  const createFollowUp = () => {
    if (!request) return;
    navigation.navigate('MaintenanceCreate', {
      previousRequestId: idNum,
      prefillTitle: request.title,
      equipment: request.equipmentId ? { id: Number(request.equipmentId), equipmentName: request.equipmentName } : undefined,
    });
  };

  const openReschedule = () => {
    setRescheduleDate('');
    setRescheduleTime(null);
    setRescheduleOpen(true);
  };

  /** Đổi lịch hẹn xem — chỉ gọi được khi OPEN, chưa confirm-arrival, còn trước ngày hẹn (BE tự chặn lại). */
  const confirmReschedule = async () => {
    if (rescheduleBusy) return;
    const dt = rescheduleTime ? toLocalDateTime(rescheduleDate, rescheduleTime) : null;
    if (!dt) { showAlert('Thiếu lịch hẹn', 'Vui lòng chọn ngày và giờ hẹn mới.'); return; }
    if (dt.getTime() <= serverNow().getTime()) {
      showAlert('Lịch hẹn không hợp lệ', 'Thời điểm hẹn phải ở tương lai. Vui lòng chọn lại giờ khác.');
      return;
    }
    try {
      setRescheduleBusy(true);
      await realMaintenanceService.rescheduleVisit(idNum, { visitAppointmentAt: toApiDateTime(dt) });
      await refreshReal();
      setRescheduleOpen(false);
      showAlert('✅ Đã đổi lịch hẹn', 'Lịch hẹn xem đã được cập nhật.');
    } catch (e: any) {
      showAlert('Không thể đổi lịch', apiErrMsg(e, 'Vui lòng thử lại.'));
    } finally {
      setRescheduleBusy(false);
    }
  };

  /** Huỷ yêu cầu — tenant chỉ huỷ được khi còn OPEN. */
  const handleCancelRequest = () => {
    showAlert('Huỷ yêu cầu?', 'Bạn có chắc muốn huỷ yêu cầu sửa chữa này?', [
      { text: 'Không', style: 'cancel' },
      { text: 'Huỷ yêu cầu', style: 'destructive', onPress: async () => {
        try {
          await realMaintenanceService.cancel(idNum);
          await refreshReal();
        } catch (e: any) {
          showAlert('Không thể huỷ', apiErrMsg(e, 'Vui lòng thử lại.'));
        }
      } },
    ]);
  };

  // Vào bằng deep-link (chỉ có `requestId`) thì lần render đầu chưa có dữ liệu — hiện
  // trạng thái chờ thay vì để phần bên dưới đọc `request.xxx` rồi crash. Đặt SAU toàn
  // bộ hook để không đổi số lượng hook giữa các lần render.
  if (!request) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={[styles.backBtnText, { fontSize: 24, lineHeight: 28 }]} accessibilityLabel="Quay lại">←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Chi tiết yêu cầu</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const remainingDays = daysLeft(request.selfRepairDeadline);
  const hasSelfRepairPhotos = (request.selfRepairImages?.length ?? 0) > 0;

  // Chỉ hiện thẻ thanh toán khi tenant THỰC SỰ bị tính phí (lỗi do khách, manager sửa
  // hộ) — trường hợp chủ nhà tự trả (hao mòn) vẫn ẩn hoá đơn/chi phí như yêu cầu cũ.
  const hasTenantCharge = request.billingHint === 'tenant_charge_pending' && !!request.issuedInvoice;
  const billingHintMeta = MAINTENANCE_BILLING_HINT_META.tenant_charge_pending;
  const openPayModal = () => {
    if (!request.issuedInvoice) return;
    setPayBill(toMaintenanceSharedBill(request.issuedInvoice));
    setPayModalOpen(true);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={[styles.backBtnText, { fontSize: 24, lineHeight: 28 }]} accessibilityLabel="Quay lại">←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chi tiết yêu cầu</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Trạng thái chính */}
        <View style={[styles.statusBanner, { backgroundColor: currentStatusMeta.color + '15' }]}>
          <Text style={styles.statusEmoji}>{currentStatusMeta.emoji}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusLabel, { color: currentStatusMeta.color }]}>
              {currentStatusMeta.label}
            </Text>
            <Text style={styles.statusDate}>Cập nhật: {formatDate(request.updatedAt)}</Text>
          </View>
          <Text style={styles.ticketCode}>{request.ticketCode}</Text>
        </View>

        {/* Tiến trình xử lý — dùng chung UI với bên manager (yêu cầu 23/07/2026) */}
        <View style={styles.progressSection}>
          <Text style={styles.progressTitle}>Tiến trình xử lý</Text>
          <MaintenanceProgressTimeline timeline={request.timeline} currentStatus={request.status} />
        </View>

        {/* Thông tin yêu cầu */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📋 Thông tin yêu cầu</Text>
          </View>
          <View style={styles.infoCard}>
            <View style={styles.titleRow}>
              <Text style={styles.categoryEmoji}>{(request.category && CATEGORY_EMOJI[request.category]) ?? '🔧'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.requestTitle}>{request.title}</Text>
                <Text style={styles.requestCategory}>{getMaintenanceCategoryLabel(request.category)}</Text>
              </View>
              {/* priority do manager gán lúc duyệt — ẩn khi chưa có */}
              {!!request.priority && (
                <View style={[styles.priorityBadge, { backgroundColor: priorityColor + '20' }]}>
                  <Text style={[styles.priorityText, { color: priorityColor }]}>
                    {getMaintenancePriorityLabel(request.priority)}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.divider} />

            <Text style={styles.infoLabel}>Mô tả chi tiết</Text>
            <Text style={styles.descText}>{request.description}</Text>

            <View style={styles.metaGrid}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Phòng</Text>
                <Text style={styles.metaValue}>{request.roomName}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Ngày tạo</Text>
                <Text style={styles.metaValue}>{formatDate(request.createdAt)}</Text>
              </View>
              {request.assignedTo && (
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Quản lý phụ trách</Text>
                  <Text style={styles.metaValue}>👤 {request.assignedTo}</Text>
                </View>
              )}
              {request.resolvedAt && (
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Hoàn thành</Text>
                  <Text style={[styles.metaValue, { color: Colors.success }]}>
                    {formatDate(request.resolvedAt)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Lịch hẹn xem — chỉ còn ý nghĩa lúc OPEN (05/09/2026) */}
        {request.status === 'open' && request.visitAppointmentAt && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📅 Lịch hẹn quản lý tới xem</Text>
            <View style={styles.infoCard}>
              <Text style={styles.appointmentTime}>{formatDateTime(request.visitAppointmentAt)}</Text>
              <Text style={styles.appointmentStatus}>
                {request.visitArrivalConfirmedAt
                  ? `✓ Quản lý đã xác nhận có mặt lúc ${formatDateTime(request.visitArrivalConfirmedAt)}`
                  : '⏳ Quản lý chưa xác nhận có mặt'}
              </Text>
              <View style={styles.appointmentActions}>
                {!request.visitArrivalConfirmedAt && isBeforeAppointmentDay(request.visitAppointmentAt) && (
                  <TouchableOpacity style={styles.appointmentBtnOutline} onPress={openReschedule}>
                    <Text style={styles.appointmentBtnOutlineText}>🗓 Đổi lịch hẹn</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.appointmentBtnDanger} onPress={handleCancelRequest}>
                  <Text style={styles.appointmentBtnDangerText}>✕ Huỷ yêu cầu</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Ảnh hiện trạng (BEFORE) */}
        {(request.beforeImages?.length ?? request.images.length) > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🖼️ Ảnh hiện trạng</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesRow}>
              {(() => {
                const uris = request.beforeImages?.length ? request.beforeImages : request.images;
                return uris.map((uri, i) => (
                  <TouchableOpacity key={i} activeOpacity={0.85} onPress={() => openAttachment(uris, uri)}>
                    {isVideoUrl(uri) ? (
                      <View style={[styles.attachmentImage, styles.videoAttachmentTile]}>
                        <Text style={{ fontSize: 22 }}>🎬</Text>
                        <Text style={styles.videoAttachmentText}>▶ Xem video</Text>
                      </View>
                    ) : (
                      <Image source={{ uri }} style={styles.attachmentImage} />
                    )}
                  </TouchableOpacity>
                ));
              })()}
            </ScrollView>
          </View>
        )}

        {/* Lỗi do bạn — bằng chứng manager ghi nhận (Luồng B) */}
        {['tenant_fault', 'pending_tenant_repair', 'outstanding_damage'].includes(request.status) && (
          <View style={styles.section}>
            <View style={[styles.helpCard, { backgroundColor: '#FEF2F2' }]}>
              <Text style={[styles.helpText, { color: '#B91C1C', fontWeight: '700', marginBottom: 4 }]}>
                ⚠️ Quản lý xác định đây là lỗi do sử dụng
              </Text>
              {!!request.faultReason && (
                <Text style={[styles.helpText, { color: '#B91C1C' }]}>{request.faultReason}</Text>
              )}
            </View>
            {(request.faultEvidenceImages?.length ?? 0) > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesRow}>
                {request.faultEvidenceImages!.map((uri, i) => (
                  <TouchableOpacity key={i} activeOpacity={0.85}
                    onPress={() => openAttachment(request.faultEvidenceImages!, uri)}>
                    {isVideoUrl(uri) ? (
                      <View style={[styles.attachmentImage, styles.videoAttachmentTile]}>
                        <Text style={{ fontSize: 22 }}>🎬</Text>
                        <Text style={styles.videoAttachmentText}>▶ Xem video</Text>
                      </View>
                    ) : (
                      <Image source={{ uri }} style={styles.attachmentImage} />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* Ảnh sau sửa (AFTER) — hiện khi manager đã báo xong */}
        {(request.afterImages?.length ?? 0) > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🛠 Ảnh sau sửa chữa</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesRow}>
              {request.afterImages!.map((uri, i) => (
                <TouchableOpacity key={i} activeOpacity={0.85}
                  onPress={() => openAttachment(request.afterImages!, uri)}>
                  {isVideoUrl(uri) ? (
                    <View style={[styles.attachmentImage, styles.videoAttachmentTile]}>
                      <Text style={{ fontSize: 22 }}>🎬</Text>
                      <Text style={styles.videoAttachmentText}>▶ Xem video</Text>
                    </View>
                  ) : (
                    <Image source={{ uri }} style={styles.attachmentImage} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Cần thanh toán — DUY NHẤT trường hợp hiện hoá đơn/chi phí cho tenant (lỗi do
            khách, manager đã sửa hộ và complete() phát sinh hoá đơn PayOS). */}
        {hasTenantCharge && (
          <View style={styles.section}>
            <View style={[styles.payCard, { backgroundColor: billingHintMeta.bg, borderColor: billingHintMeta.color + '40' }]}>
              <Text style={[styles.payCardTitle, { color: billingHintMeta.color }]}>
                💳 {billingHintMeta.label}
              </Text>
              <Text style={[styles.payCardAmount, { color: billingHintMeta.color }]}>
                {formatCurrency(request.issuedInvoice!.grandTotal)}
              </Text>
              <Text style={[styles.payCardDetail, { color: billingHintMeta.color }]}>
                {billingHintMeta.detail}
              </Text>
              {!!request.issuedInvoice!.dueDate && (
                <Text style={[styles.payCardDetail, { color: billingHintMeta.color, fontWeight: '700' }]}>
                  ⏰ Hạn thanh toán: {formatDate(request.issuedInvoice!.dueDate)}
                </Text>
              )}
              {(request.invoiceImages?.length ?? 0) > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesRow}>
                  {request.invoiceImages!.map((uri, i) => (
                    <TouchableOpacity key={i} activeOpacity={0.85}
                      onPress={() => setLightbox({ uris: request.invoiceImages!, index: i })}>
                      <Image source={{ uri }} style={styles.attachmentImage} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              <TouchableOpacity style={styles.payCardBtn} onPress={openPayModal}>
                <Text style={styles.payCardBtnText}>📱 Quét QR thanh toán</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Hoá đơn/chi phí sửa chữa CHỦ ĐỘNG ẨN với tenant (yêu cầu 02/09/2026) — đây là
            giấy tờ nội bộ giữa manager/host/admin (ảnh hoá đơn, mô tả sửa, số tiền chi
            trả), tenant không cần biết. Khoản tenant THỰC SỰ phải trả (billingHint =
            tenant_charge_pending — thẻ ngay trên — hoặc deposit_deduction_pending, xử
            lý khi trừ cọc) đã có kênh riêng — không mất thông tin gì tenant cần hành
            động. */}

        <MaintenancePhotoHistory photos={request.photoHistory?.filter(p => p.type !== 'INVOICE')} />

        {/* Tự sửa — chưa nộp ảnh: form nộp ảnh + ghi chú */}
        {request.status === 'pending_tenant_repair' && !hasSelfRepairPhotos && (
          <View style={styles.actionSection}>
            <View style={[styles.helpCard, { backgroundColor: '#FFF7ED', marginBottom: Spacing.md }]}>
              <Text style={[styles.helpText, { color: '#C2410C' }]}>
                🛠 Bạn cần tự sửa lỗi này{remainingDays != null
                  ? remainingDays >= 0 ? ` trong ${remainingDays} ngày nữa` : ' — ĐÃ QUÁ HẠN'
                  : ''}{request.selfRepairDeadline ? ` (hạn ${formatDate(request.selfRepairDeadline)})` : ''}.
                Sửa xong thì chụp ảnh/video gửi để quản lý xác nhận.
              </Text>
            </View>
            <Text style={styles.sectionTitle}>Ảnh/video chứng minh đã sửa xong</Text>
            <View style={styles.rejectImagesRow}>
              {(() => {
                // Lightbox chỉ phát ảnh — lọc bỏ video khỏi danh sách lướt (video local
                // chưa upload, chưa có gì để xem trước, xem tile placeholder bên dưới).
                const imageOnlyUris = selfRepairAssets.filter(a => a.type !== 'video').map(a => a.uri);
                return selfRepairAssets.map((asset, i) => {
                  const isVideo = asset.type === 'video';
                  return (
                    <View key={`${asset.uri}-${i}`} style={styles.rejectThumbWrap}>
                      <TouchableOpacity
                        disabled={isVideo}
                        onPress={() => setLightbox({ uris: imageOnlyUris, index: imageOnlyUris.indexOf(asset.uri) })}
                      >
                        {isVideo ? (
                          <View style={[styles.rejectThumb, styles.videoRejectTile]}>
                            <Text style={{ fontSize: 20 }}>🎬</Text>
                            <Text style={styles.videoRejectTileText}>{formatDurationLabel(asset.durationMs)}</Text>
                          </View>
                        ) : (
                          <Image source={{ uri: asset.uri }} style={styles.rejectThumb} />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.rejectThumbRemove}
                        onPress={() => setSelfRepairAssets(prev => prev.filter((_, idx) => idx !== i))}
                      >
                        <Text style={styles.rejectThumbRemoveText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  );
                });
              })()}
              {selfRepairAssets.length < EVIDENCE_MAX_FILES && (
                <TouchableOpacity style={styles.rejectAddBtn} onPress={() => setPhotoMenuOpen(true)}>
                  <Text style={styles.rejectAddBtnText}>＋{'\n'}Ảnh/video</Text>
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              style={styles.rejectInput}
              value={selfRepairNote}
              onChangeText={setSelfRepairNote}
              placeholder="Ghi chú (không bắt buộc)..."
              placeholderTextColor={Colors.textMuted}
              multiline
            />
            <TouchableOpacity style={styles.confirmBtn} onPress={submitSelfRepair} disabled={busy}>
              <Text style={styles.confirmBtnText}>{busy ? 'Đang gửi...' : '✅ Gửi ảnh đã sửa xong'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tự sửa — đã nộp ảnh, chờ manager xác nhận */}
        {request.status === 'pending_tenant_repair' && hasSelfRepairPhotos && (
          <View style={styles.actionSection}>
            <View style={styles.helpCard}>
              <Text style={styles.helpText}>⏳ Đã gửi ảnh sửa chữa — chờ quản lý kiểm tra và xác nhận.</Text>
            </View>
          </View>
        )}

        {/* Chờ trừ cọc khi trả phòng */}
        {request.status === 'outstanding_damage' && (
          <View style={styles.actionSection}>
            <View style={[styles.helpCard, { backgroundColor: '#FEF2F2' }]}>
              <Text style={[styles.helpText, { color: '#B91C1C' }]}>
                💸 Chưa xử lý xong trong hạn — khoản thiệt hại này sẽ được chốt và trừ vào
                tiền cọc khi bạn trả phòng.
                {request.estimatedDamageAmount != null
                  ? ` Ước tính: ${request.estimatedDamageAmount.toLocaleString('vi-VN')} đ.`
                  : ''}
              </Text>
            </View>
          </View>
        )}

        {/* Đã sửa/bàn giao xong, chờ khách thanh toán — trả xong BE tự đóng phiếu (21/09/2026) */}
        {request.status === 'waiting_payment' && (
          <View style={styles.actionSection}>
            <View style={[styles.helpCard, { backgroundColor: '#FFFBEB' }]}>
              <Text style={[styles.helpText, { color: '#B45309' }]}>
                💳 Quản lý đã sửa xong. Vui lòng thanh toán hoá đơn để hoàn tất yêu cầu
                {request.issuedInvoice?.dueDate
                  ? ` — hạn ${formatDateTime(request.issuedInvoice.dueDate)}`
                  : ' (hạn 5 ngày kể từ lúc lập hoá đơn)'}.
                Không tính phí trễ hạn, nhưng quá hạn quản lý được quyền đề nghị chấm dứt hợp đồng.
              </Text>
            </View>
          </View>
        )}

        {/* Nút liên hệ nếu đang xử lý */}
        {(request.status === 'open' || request.status === 'repair_scheduled'
          || request.status === 'in_repair' || request.status === 'tenant_fault') && (
          <View style={styles.actionSection}>
            <View style={styles.helpCard}>
              <Text style={styles.helpText}>
                {request.status === 'open'
                  ? '⏳ Yêu cầu đang chờ quản lý kiểm tra. Cần hỗ trợ gấp? Liên hệ quản lý.'
                  : request.status === 'repair_scheduled'
                    ? `📅 Đã lên lịch sửa${request.repairAppointmentAt ? `: ${formatDateTime(request.repairAppointmentAt)}` : ''}.`
                    : request.status === 'tenant_fault'
                      ? '🔧 Quản lý sẽ sửa hộ. Hoá đơn chi phí sẽ được gửi sau khi sửa xong — bạn có 5 ngày để thanh toán.'
                      : '🔧 Đang sửa chữa. Cần hỗ trợ gấp? Liên hệ quản lý.'}
              </Text>
            </View>
          </View>
        )}

        {/* Đã hoàn tất — tạo yêu cầu mới nếu chưa ổn */}
        {request.status === 'closed' && (
          <View style={styles.actionSection}>
            <TouchableOpacity style={styles.reopenBtnOutline} onPress={createFollowUp}>
              <Text style={styles.reopenBtnOutlineText}>🔁 Vẫn chưa ổn — tạo yêu cầu mới</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <CameraCaptureModal
        visible={cameraOpen}
        multi
        onCapture={(uri) => setSelfRepairAssets(prev => [...prev, { uri, type: 'image' }])}
        onClose={() => setCameraOpen(false)}
      />

      {/* Menu "Thêm ảnh" — thay Alert.alert (no-op trên web) bằng modal trong UI. */}
      <Modal visible={photoMenuOpen} transparent animationType="fade" onRequestClose={() => setPhotoMenuOpen(false)}>
        <Pressable style={styles.photoMenuBackdrop} onPress={() => setPhotoMenuOpen(false)}>
          <Pressable style={styles.photoMenuCard} onPress={() => {}}>
            <Text style={styles.photoMenuTitle}>Thêm ảnh/video</Text>
            <TouchableOpacity style={styles.photoMenuOption} onPress={() => pickFromCamera('image')}>
              <Text style={styles.photoMenuOptionText}>📷 Chụp ảnh</Text>
            </TouchableOpacity>
            {Platform.OS !== 'web' && (
              <TouchableOpacity style={styles.photoMenuOption} onPress={() => pickFromCamera('video')}>
                <Text style={styles.photoMenuOptionText}>🎥 Quay video</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.photoMenuOption} onPress={pickFromLibrary}>
              <Text style={styles.photoMenuOptionText}>🖼️ Chọn từ thư viện</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoMenuCancel} onPress={() => setPhotoMenuOpen(false)}>
              <Text style={styles.photoMenuCancelText}>Đóng</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      <PhotoLightbox state={lightbox} onChange={setLightbox} />
      <VideoPreviewModal visible={!!videoPreviewUrl} url={videoPreviewUrl} onClose={() => setVideoPreviewUrl(null)} />

      <InvoicePaymentModal
        visible={payModalOpen}
        invoice={payBill}
        onUpdate={setPayBill}
        onClose={() => { setPayModalOpen(false); void refreshReal(); }}
      />

      {/* Đổi lịch hẹn xem */}
      <Modal visible={rescheduleOpen} transparent animationType="fade" onRequestClose={() => setRescheduleOpen(false)}>
        <Pressable style={styles.photoMenuBackdrop} onPress={() => setRescheduleOpen(false)}>
          <Pressable style={styles.photoMenuCard} onPress={() => {}}>
            <Text style={styles.photoMenuTitle}>Đổi lịch hẹn xem</Text>
            <AppointmentSlotPicker
              propertyId={request.propertyId ? Number(request.propertyId) : undefined}
              slotMinutes={MAINTENANCE_VISIT_SLOT_MINUTES}
              excludeRequestId={idNum}
              date={rescheduleDate}
              onDateChange={setRescheduleDate}
              time={rescheduleTime}
              onTimeChange={setRescheduleTime}
            />
            <TouchableOpacity
              style={[styles.confirmBtn, (!rescheduleDate || !rescheduleTime || rescheduleBusy) && { opacity: 0.5 }]}
              onPress={confirmReschedule}
              disabled={!rescheduleDate || !rescheduleTime || rescheduleBusy}
            >
              <Text style={styles.confirmBtnText}>{rescheduleBusy ? 'Đang lưu...' : '✅ Xác nhận lịch mới'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoMenuCancel} onPress={() => setRescheduleOpen(false)}>
              <Text style={styles.photoMenuCancelText}>Đóng</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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

  scroll: { flex: 1 },

  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    margin: Spacing.base, padding: Spacing.md, borderRadius: BorderRadius.lg,
  },
  statusEmoji: { fontSize: 28 },
  statusLabel: { fontSize: 16, fontWeight: '700' },
  statusDate: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  ticketCode: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },

  progressSection: {
    marginHorizontal: Spacing.base, marginBottom: Spacing.md,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm,
  },
  progressTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },

  section: { marginHorizontal: Spacing.base, marginBottom: Spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },

  infoCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginBottom: Spacing.md },
  categoryEmoji: { fontSize: 28 },
  requestTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  requestCategory: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  priorityBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  priorityText: { fontSize: 11, fontWeight: '700' },

  divider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.md },
  infoLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: Spacing.sm, textTransform: 'uppercase' },
  descText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22, marginBottom: Spacing.md },

  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  metaItem: { width: '47%' },
  metaLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 2 },
  metaValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

  imagesRow: { marginTop: Spacing.sm },
  attachmentImage: { width: 120, height: 120, borderRadius: BorderRadius.md, marginRight: Spacing.sm, backgroundColor: Colors.divider },
  videoAttachmentTile: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A', gap: 4 },
  videoAttachmentText: { color: Colors.white, fontSize: 11, fontWeight: '700' },

  appointmentTime: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  appointmentStatus: { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  appointmentActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  appointmentBtnOutline: {
    flex: 1, borderWidth: 1.5, borderColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm, alignItems: 'center',
  },
  appointmentBtnOutlineText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  appointmentBtnDanger: {
    flex: 1, borderWidth: 1.5, borderColor: Colors.error, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm, alignItems: 'center',
  },
  appointmentBtnDangerText: { fontSize: 13, fontWeight: '700', color: Colors.error },

  payCard: { borderRadius: BorderRadius.lg, borderWidth: 1.5, padding: Spacing.base, ...Shadow.sm },
  payCardTitle: { fontSize: 14, fontWeight: '800' },
  payCardAmount: { fontSize: 24, fontWeight: '800', marginTop: 4 },
  payCardDetail: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  payCardBtn: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, borderWidth: 1.5, borderColor: Colors.warning,
    paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.md,
  },
  payCardBtnText: { fontSize: 15, fontWeight: '700', color: Colors.warning },

  actionSection: { paddingHorizontal: Spacing.base, paddingBottom: 40 },
  helpCard: { backgroundColor: Colors.infoLight, borderRadius: BorderRadius.md, padding: Spacing.md },
  helpText: { fontSize: 13, color: Colors.info, lineHeight: 20 },

  confirmBtn: {
    backgroundColor: Colors.success, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', marginBottom: Spacing.sm, ...Shadow.sm,
  },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  reopenBtnOutline: {
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center',
  },
  reopenBtnOutlineText: { fontSize: 14, fontWeight: '700', color: Colors.primary },

  rejectInput: {
    backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: 14, color: Colors.textPrimary,
    minHeight: 80, textAlignVertical: 'top', marginBottom: Spacing.md,
  },
  rejectImagesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  rejectThumbWrap: { width: 72, height: 72, borderRadius: BorderRadius.md, overflow: 'hidden' },
  rejectThumb: { width: '100%', height: '100%', backgroundColor: Colors.divider },
  videoRejectTile: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A', gap: 2 },
  videoRejectTileText: { color: Colors.white, fontSize: 10, fontWeight: '700' },
  rejectThumbRemove: {
    position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(15,23,42,0.7)', alignItems: 'center', justifyContent: 'center',
  },
  rejectThumbRemoveText: { color: Colors.white, fontSize: 14, fontWeight: '900', lineHeight: 16 },
  rejectAddBtn: {
    width: 72, height: 72, borderRadius: BorderRadius.md, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white,
  },
  rejectAddBtnText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 16 },

  photoMenuBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  photoMenuCard: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.lg, paddingBottom: Spacing.xl },
  photoMenuTitle: { fontSize: 14, fontWeight: '700', color: Colors.textMuted, marginBottom: Spacing.md, textAlign: 'center' },
  photoMenuOption: { paddingVertical: Spacing.md, borderRadius: BorderRadius.md, alignItems: 'center', backgroundColor: Colors.background, marginBottom: Spacing.sm },
  photoMenuOptionText: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  photoMenuCancel: { paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.xs },
  photoMenuCancelText: { fontSize: 14, fontWeight: '600', color: Colors.error },
});
