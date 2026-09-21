import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Image, Platform, Modal, Pressable, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import QRCode from 'react-native-qrcode-svg';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import {
  useTickets, maintenanceStore, MaintenanceTicket,
  TicketStatus, TicketCategory, TicketPriority, PhotoEvidence, TimelineEntry,
} from '@/store/maintenanceStore';
import type { MaintenanceReqCategory, MaintenanceReqPriority, EquipmentDto } from '@/types';
import { realMaintenanceService } from '@/services/shared/maintenanceService';
import { dtoToTicket } from '@/services/shared/maintenanceMappers';
import { realEquipmentService } from '@/services/manager/equipmentService';
import { realTenantService } from '@/services/tenant/tenantService';
import { uploadImageToCloudinary } from '@/services/core/cloudinary';
import { parseMaintenanceInvoice } from '@/utils/maintenanceInvoiceParser';
import { CameraCaptureModal } from '../../components/common/CameraCaptureModal';
import { MaintenanceProgressTimeline } from '../../components/common/MaintenanceProgressTimeline';
import { MaintenancePhotoHistory } from '../../components/common/MaintenancePhotoHistory';
import { PhotoLightbox, type LightboxState } from '../../components/common/PhotoLightbox';
import { VideoPreviewModal } from '../../components/common/VideoPreviewModal';
import { EquipmentQrScanModal } from '../../components/common/EquipmentQrScanModal';
import { AppointmentSlotPicker } from '../../components/common/AppointmentSlotPicker';
import { useMaintenanceRealtime, useBillingRealtime } from '@/hooks/useBillingRealtime';
import {
  showAlert, formatDateTime, isVideoUrl, formatDurationLabel, remainingEvidenceSlots,
  pickEvidenceFromCamera, pickEvidenceFromLibrary, EVIDENCE_MAX_FILES,
  type EvidenceAsset, type EvidenceMediaType,
} from '@/utils';
import { serverNow, todayIso } from '@/utils/serverTime';
import { extractEquipmentIdFromQr, toEquipmentQrCode } from '@/utils/equipmentQr';
import { toLocalDateTime, toApiDateTime, isBeforeAppointmentDay } from '@/utils/maintenanceAppointment';
import {
  MAINTENANCE_STATUS_META, StatusMeta, MAINTENANCE_BILLING_HINT_META,
  EQUIPMENT_REPLACE_SUGGEST_COUNT, MAINTENANCE_REPAIR_SLOT_MINUTES,
} from '@/constants/maintenance';

// ── Config ──────────────────────────────────────────────────────────────────

/**
 * Quét QR xác nhận có mặt rồi mà quá 30' chưa nộp bước tiếp theo (duyệt/báo lỗi do
 * khách) thì bắt quét lại (07/09/2026). BE `confirmArrival()` là no-op khi
 * `visitArrivalConfirmedAt` đã có sẵn (không cập nhật lại mốc giờ), nên không thể dựa
 * vào mốc giờ CỦA BE để tính "mới quét" — phải tự lưu mốc quét THẬT trên máy (key theo
 * ticket id) và so sánh cục bộ. Chỉ áp dụng cho gate "Xác nhận có mặt": gate "Bắt đầu
 * sửa" (start-repair) quét xong là chuyển trạng thái ngay lập tức, không có bước lơ
 * lửng nào ở giữa để tính hạn 30 phút.
 */
const ARRIVAL_CONFIRM_TTL_MS = 30 * 60 * 1000;
const arrivalConfirmStorageKey = (id: number) => `maint_arrival_confirmed_at_${id}`;

const STATUS_CONFIG: Record<TicketStatus, StatusMeta> = MAINTENANCE_STATUS_META;

const PRIORITY_CONFIG = {
  urgent: { label: '🚨 Khẩn cấp',  color: '#EF4444', bg: '#FEF2F2' },
  high:   { label: '🔴 Cao',        color: '#F97316', bg: '#FFF7ED' },
  medium: { label: '🟡 Trung bình', color: '#F59E0B', bg: '#FFFBEB' },
  low:    { label: '🟢 Thấp',       color: '#10B981', bg: '#F0FDF4' },
} as const;

const CATEGORY_CONFIG: Record<TicketCategory, { label: string; icon: string }> = {
  appliance:  { label: 'Trang thiết bị',  icon: '📺' },
  furniture:  { label: 'Nội thất',        icon: '🪑' },
  plumbing:   { label: 'Nước / Ống',      icon: '🚰' },
  electrical: { label: 'Điện',            icon: '⚡' },
};

/** Thứ tự hiển thị dropdown phân loại lúc duyệt (khớp enum BE). */
const APPROVE_CATEGORY_KEYS = ['appliance', 'furniture', 'plumbing', 'electrical'] as const;
const APPROVE_PRIORITY_KEYS = ['low', 'medium', 'high', 'urgent'] as const;

const now = () => serverNow().toLocaleString('vi-VN');
const today = () => todayIso();
const mkEntry = (status: TicketStatus, note: string): TimelineEntry =>
  ({ status, note, updatedBy: 'Manager', updatedAt: now() });

const fmt = (n: number | null | undefined) => (n || 0).toLocaleString('vi-VN') + 'đ';

/** Format tiền lúc gõ (dấu chấm ngăn cách nghìn) — parse lại bằng .replace(/[^0-9]/g, ''). */
const formatMoneyInput = (text: string): string => {
  const digits = text.replace(/[^0-9]/g, '');
  return digits ? Number(digits).toLocaleString('vi-VN') : '';
};

/** Hoá đơn giờ chỉ cần ảnh + số tiền — BE vẫn bắt buộc non-blank nên tự điền ngầm. */
const DEFAULT_INVOICE_VENDOR = 'Nội bộ';

/**
 * Số tiền đền bù khi thiết bị hỏng hoàn toàn — LUÔN tự động, manager không được thêm/
 * xoá/sửa tay trong bất kỳ trường hợp nào (07/09/2026):
 *  - Còn bảo hành (hôm nay < ngày hết hạn bảo hành) và có đủ giá + ngày bắt đầu bảo
 *    hành: tính khấu hao còn lại theo đường thẳng — giá × (số ngày còn lại / tổng số
 *    ngày bảo hành).
 *  - Hết bảo hành, hoặc thiếu dữ liệu bảo hành/giá để tính khấu hao: dùng
 *    Equipment.penaltyFee (mức phạt cố định — theo đúng comment ở entity BE: "Không
 *    tính từ đơn giá hay khấu hao").
 * Trả về null khi thiết bị không có cả 2 nguồn trên — không có gì để tự điền, và
 * KHÔNG được để manager gõ tay thay thế (chặn thu phí ở nơi gọi).
 */
const computeAutoDamageAmount = (eq: EquipmentDto | null): number | null => {
  if (!eq) return null;
  const now = serverNow().getTime();
  const endStr = eq.warrantyEndDate || eq.warrantyExpiredDate;
  const end = endStr ? new Date(endStr).getTime() : null;
  const start = eq.warrantyStartDate ? new Date(eq.warrantyStartDate).getTime() : null;
  const stillUnderWarranty = end != null && !Number.isNaN(end) && now < end;
  if (stillUnderWarranty && start != null && !Number.isNaN(start) && eq.price) {
    const totalMs = end! - start;
    if (totalMs > 0) {
      const remainingMs = Math.max(0, end! - now);
      return Math.round(eq.price * (remainingMs / totalMs));
    }
  }
  return eq.penaltyFee ?? null;
};

/** Thiết bị còn trong hạn bảo hành hay không — dùng để chọn nhãn hiển thị đúng nguồn số tiền. */
const isUnderWarranty = (eq: EquipmentDto | null): boolean => {
  if (!eq) return false;
  const endStr = eq.warrantyEndDate || eq.warrantyExpiredDate;
  if (!endStr) return false;
  const end = new Date(endStr).getTime();
  return !Number.isNaN(end) && serverNow().getTime() < end;
};

const daysLeft = (deadline?: string): number | null => {
  if (!deadline) return null;
  const end = new Date(deadline).getTime();
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - serverNow().getTime()) / 86_400_000);
};

// ── Photo Evidence Row ───────────────────────────────────────────────────────

type PhotoKind = 'before' | 'after' | 'fault_evidence' | 'invoice';

const PHOTO_KIND_META: Record<PhotoKind, { label: string; color: string; icon: string }> = {
  before:         { label: '📸 Ảnh hiện trạng',   color: Colors.warning, icon: '📷' },
  after:          { label: '🖼️ Ảnh sau sửa chữa', color: Colors.success, icon: '🖼️' },
  fault_evidence: { label: '⚠️ Bằng chứng lỗi',    color: '#DC2626',      icon: '⚠️' },
  invoice:        { label: '🧾 Ảnh hoá đơn',       color: '#0369A1',      icon: '🧾' },
};

const PhotoEvidenceRow: React.FC<{
  type: PhotoKind;
  /** ảnh/video đã có trên server (URL) */
  urls?: string[];
  /** ảnh/video local vừa chụp/chọn (chưa hoặc đang upload) */
  photos: PhotoEvidence[];
  onAdd: () => void;
  disabled?: boolean;
  /** Bấm vào 1 ẢNH (server hoặc local) để xem toàn màn hình. */
  onView?: (uris: string[], index: number) => void;
  /** Bấm vào 1 VIDEO đã upload (có URL thật) để phát trong VideoPreviewModal — video
   * local chưa upload chỉ có tile placeholder, không gọi callback này. */
  onViewVideo?: (url: string) => void;
  /**
   * Xoá 1 ảnh/video LOCAL (chưa/đang upload hoặc upload lỗi) để chụp/chọn lại — CHỈ áp
   * dụng đồ local, KHÔNG áp dụng đồ đã lên server (`urls`): BE chưa có endpoint xoá ảnh
   * đã lưu — nay BE ĐÃ có `DELETE /{id}/photos` (07/09/2026), xem `onRemoveServer`.
   */
  onRemoveLocal?: (localId: string) => void;
  /**
   * Xoá 1 ảnh/video ĐÃ lên server (url nằm trong `urls`, không phải `photos` local) —
   * chỉ truyền prop này ở những chỗ được phép đổi ảnh (phiếu còn mở, đúng loại).
   */
  onRemoveServer?: (url: string) => void;
  /** INVOICE bắt buộc ảnh thật (đầu vào OCR đọc số tiền hoá đơn) — không cho chọn video,
   * chỉ đổi nhãn nút "+ Thêm ảnh" (việc chặn thật sự nằm ở nơi gọi picker). @default true */
  allowVideo?: boolean;
}> = ({ type, urls = [], photos, onAdd, disabled, onView, onViewVideo, onRemoveLocal, onRemoveServer, allowVideo = true }) => {
  const filtered = photos.filter(p => p.type === type);
  const meta     = PHOTO_KIND_META[type];
  const isEmpty  = urls.length === 0 && filtered.length === 0;
  const allUris  = [...urls, ...filtered.map(p => p.uri).filter((u): u is string => !!u)];
  const atLimit  = urls.length + filtered.length >= EVIDENCE_MAX_FILES;
  return (
    <View style={phs.container}>
      <View style={phs.header}>
        <Text style={phs.label}>{meta.label}</Text>
        {!disabled && !atLimit && (
          <TouchableOpacity style={[phs.addBtn, { borderColor: meta.color }]} onPress={onAdd}>
            <Text style={[phs.addBtnText, { color: meta.color }]}>+ Thêm {allowVideo ? 'ảnh/video' : 'ảnh'}</Text>
          </TouchableOpacity>
        )}
        {!disabled && atLimit && (
          <Text style={phs.limitText}>Đã đủ {EVIDENCE_MAX_FILES} — xoá bớt để thêm mới</Text>
        )}
      </View>
      {isEmpty ? (
        <View style={[phs.emptyBox, { borderColor: meta.color + '40' }]}>
          <Text style={phs.emptyIcon}>{meta.icon}</Text>
          <Text style={phs.emptyText}>Chưa có ảnh</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={phs.scrollRow}>
          {urls.map((uri, i) => {
            const isVideo = isVideoUrl(uri);
            return (
              <TouchableOpacity key={`url-${i}`} activeOpacity={0.85}
                style={[phs.photoCard, { borderColor: meta.color + '50' }]}
                onPress={() => isVideo ? onViewVideo?.(uri) : onView?.(allUris, i)}
              >
                {isVideo ? (
                  <View style={[phs.photoPlaceholder, phs.videoTile, { width: '100%' }]}>
                    <Text style={{ fontSize: 22 }}>🎬</Text>
                    <Text style={phs.videoPlayHint}>▶ Xem video</Text>
                  </View>
                ) : (
                  <Image source={{ uri }} style={[phs.photoPlaceholder, { width: '100%' }]} />
                )}
                {onRemoveServer && (
                  <TouchableOpacity style={phs.photoRemoveBtn} onPress={() => onRemoveServer(uri)}>
                    <Text style={phs.photoRemoveBtnText}>✕</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
          {filtered.map((photo, i) => {
            const isVideo = photo.mediaType === 'video';
            return (
              <TouchableOpacity key={photo.id} activeOpacity={0.85}
                style={[phs.photoCard, { borderColor: meta.color + '50' }]}
                // Đừng cộng urls.length + i làm chỉ số: nếu có ảnh local nào trước đó
                // thiếu uri (đang chờ đọc file) thì allUris ngắn hơn filtered, cộng dồn
                // sẽ lệch chỉ số/mở nhầm ảnh — tìm đúng vị trí thật bằng indexOf.
                onPress={() => {
                  // Video local CHƯA upload — chưa có gì thật để phát, chỉ là placeholder.
                  if (isVideo) return;
                  if (photo.uri) onView?.(allUris, allUris.indexOf(photo.uri));
                }}
              >
                {isVideo ? (
                  <View style={[phs.photoPlaceholder, { backgroundColor: meta.color + '15' }]}>
                    <Text style={phs.photoPlaceholderIcon}>🎬</Text>
                    <Text style={phs.videoDurationText}>{formatDurationLabel(photo.durationMs)}</Text>
                  </View>
                ) : photo.uri ? (
                  <Image source={{ uri: photo.uri }} style={[phs.photoPlaceholder, { width: '100%' }]} />
                ) : (
                  <View style={[phs.photoPlaceholder, { backgroundColor: meta.color + '15' }]}>
                    <Text style={phs.photoPlaceholderIcon}>{meta.icon}</Text>
                  </View>
                )}
                <Text style={phs.photoDate}>{photo.capturedAt.split(' ')[0]}</Text>
                {onRemoveLocal && (
                  <TouchableOpacity style={phs.photoRemoveBtn} onPress={() => onRemoveLocal(photo.id)}>
                    <Text style={phs.photoRemoveBtnText}>✕</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
};

const phs = StyleSheet.create({
  container:            { marginBottom: Spacing.md },
  header:               { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  label:                { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  addBtn:               { borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 3 },
  addBtnText:           { fontSize: 11, fontWeight: '700' },
  emptyBox:             { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderStyle: 'dashed', borderRadius: BorderRadius.md, padding: Spacing.md },
  emptyIcon:            { fontSize: 20 },
  emptyText:            { fontSize: 13, color: Colors.textMuted },
  scrollRow:            { flexGrow: 0 },
  photoCard:            { width: 100, marginRight: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1, overflow: 'hidden' },
  photoPlaceholder:     { height: 72, alignItems: 'center', justifyContent: 'center' },
  photoPlaceholderIcon: { fontSize: 28 },
  photoDate:            { fontSize: 9, color: Colors.textMuted, paddingHorizontal: 4, paddingVertical: 4 },
  photoRemoveBtn: {
    position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9,
    backgroundColor: 'rgba(15,23,42,0.7)', alignItems: 'center', justifyContent: 'center',
  },
  photoRemoveBtnText: { color: Colors.white, fontSize: 10, fontWeight: '900' },
  limitText:            { fontSize: 10, color: Colors.textMuted, fontStyle: 'italic', maxWidth: 160, textAlign: 'right' },
  videoTile:            { backgroundColor: '#0F172A', gap: 2 },
  videoPlayHint:        { color: Colors.white, fontSize: 10, fontWeight: '700' },
  videoDurationText:    { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, marginTop: 2 },
});

// ── Screen ──────────────────────────────────────────────────────────────────

export const TicketDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route      = useRoute<any>();
  const { ticketId } = route.params as { ticketId: string };
  const idNum = Number(ticketId);
  const isRealId = Number.isFinite(idNum) && idNum > 0;

  const allTickets = useTickets();
  const storeTicket = allTickets.find(t => t.id === ticketId);
  const [realTicket, setRealTicket] = useState<MaintenanceTicket | undefined>(undefined);
  const [realEquipmentId, setRealEquipmentId] = useState<number | undefined>(undefined);
  const isReal = !!realTicket;
  const ticket = realTicket ?? storeTicket;

  // Lấy chi tiết thật từ BE; lỗi → giữ ticket mock từ store.
  useEffect(() => {
    if (!isRealId) return;
    let active = true;
    realMaintenanceService.getDetail(idNum)
      .then(dto => { if (active) { setRealTicket(dtoToTicket(dto)); setRealEquipmentId(dto.equipmentId); } })
      .catch(() => { /* giữ store mock */ });
    return () => { active = false; };
  }, [idNum, isRealId]);

  const refreshReal = async () => {
    try {
      const dto = await realMaintenanceService.getDetail(idNum);
      setRealTicket(dtoToTicket(dto));
      setRealEquipmentId(dto.equipmentId);
    } catch { /* bỏ qua */ }
  };

  // Tự nạp lại khi ticket ĐÚNG NÀY có cập nhật (khách báo lỗi/tự sửa xong, admin duyệt,
  // bên kia huỷ...) — không cần thoát vào lại màn mới thấy.
  useMaintenanceRealtime({
    enabled: isRealId,
    filter: e => e.requestId === idNum,
    onRefresh: () => { void refreshReal(); },
  });

  // Phát hiện khách vừa thanh toán hoá đơn thiệt hại (chargeBeforeRepair, 15/09/2026) —
  // event billing riêng (không phải maintenance), không có requestId, phải đối chiếu qua
  // invoiceId === chargeInvoiceId (xem docs/BE-YEUCAU-thanh-toan-truoc-khi-sua-2026-09-15.md).
  useBillingRealtime({
    enabled: isRealId && !!ticket?.chargeInvoiceId,
    filter: e => e.event === 'INVOICE_PAID' && e.invoiceId === ticket?.chargeInvoiceId,
    onRefresh: () => { void refreshReal(); },
  });

  const [noteInput, setNoteInput] = useState('');
  const [photos,    setPhotos]    = useState<PhotoEvidence[]>(ticket?.photos || []);
  const [busy,      setBusy]      = useState(false);
  // Camera in-app cho web (launchCameraAsync trên web chỉ mở file picker)
  const [cameraFor, setCameraFor] = useState<PhotoKind | null>(null);
  const [photoMenuFor, setPhotoMenuFor] = useState<PhotoKind | null>(null);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  /** Video ĐÃ upload (URL thật) đang xem trong VideoPreviewModal — null = đóng. */
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  // Manager BẮT BUỘC gán category khi duyệt (Luồng A), priority tùy chọn. Tenant có thể
  // đã tự chọn category lúc tạo (báo hỏng không gắn thiết bị) — prefill sẵn, đổi được.
  const [approveCategory, setApproveCategory] = useState<TicketCategory | null>(ticket?.category ?? null);
  // Mặc định "Thấp" thay vì để trống — manager vẫn đổi được trước khi duyệt, chỉ đỡ
  // phải bấm dropdown cho trường hợp phổ biến nhất (đa số ticket không khẩn cấp).
  const [approvePriority, setApprovePriority] = useState<TicketPriority | null>(ticket?.priority ?? 'low');
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false);
  // Duyệt (Luồng A) — LUÔN phải chọn lịch hẹn sửa, kể cả sửa ngay lúc đó (chọn hôm nay +
  // giờ còn trống sau giờ hiện tại) — bỏ lựa chọn "sửa ngay" riêng (06/09/2026): ngoài
  // đời manager muốn sửa ngay thì cứ chọn đúng khung giờ hôm nay là được, không cần một
  // đường tắt bỏ qua bước đặt lịch. Chỉ Luồng A — Luồng B/report-fault chưa có
  // repairAppointmentAt, xem docs/maintenance-appointment-implementation-spec.md.
  const [approveRepairDate, setApproveRepairDate] = useState('');
  const [approveRepairTime, setApproveRepairTime] = useState<string | null>(null);
  // Ticket tạo qua QR/chọn thiết bị luôn gắn equipmentId nhưng BE để category=null (tenant
  // không được chọn category khi có equipment). 90%+ ticket có equipmentId là hư trang
  // thiết bị, nên tự gợi ý sẵn 'appliance' — vẫn đổi được trước khi duyệt.
  useEffect(() => {
    if (!realTicket || realTicket.category || realEquipmentId == null) return;
    setApproveCategory(c => c ?? 'appliance');
  }, [realTicket, realEquipmentId]);

  // ── Luồng mới (16/09/2026) — 2 lựa chọn cấp cao nhất khi OPEN (thay approve() +
  // reject-fault() cũ, xoá hẳn nhánh "Giao khách tự sửa" — không dùng hướng xử lý này
  // nữa): "Sửa được ngay"/"sau khi mang đi kiểm tra" dùng chung form "Chẩn đoán & báo
  // giá" (diagnose()), "Mang đi kiểm tra thêm" dùng sendForInspection(). Xem
  // docs/maintenance-diagnose-redesign-be-2026-09-16.md (BE). Phiếu CŨ đã ở
  // pending_tenant_repair (tạo trước 16/09/2026) vẫn xử lý bình thường ở dưới — chỉ bỏ
  // lối tạo mới, không đụng luồng verify-repair cho phiếu cũ.
  const [diagnoseFormOpen, setDiagnoseFormOpen] = useState(false);
  const [diagnoseQuotedAmountText, setDiagnoseQuotedAmountText] = useState('');
  const [diagnoseCause, setDiagnoseCause] = useState<'WEAR' | 'TENANT_MISUSE' | null>(null);
  const [diagnoseFaultReason, setDiagnoseFaultReason] = useState('');
  const [diagnoseTenantAgreesToPay, setDiagnoseTenantAgreesToPay] = useState<boolean | null>(null);
  const [diagnoseCompanyAbsorbedNote, setDiagnoseCompanyAbsorbedNote] = useState('');
  // "Thiết bị hỏng hoàn toàn — cần thay mới" (16/09/2026, BE commit 49201d9+d2bc708) —
  // độc lập với damageCause, áp dụng cho cả 4 nhánh. Dùng chung replacementEquipment/
  // computeAutoDamageAmount đã có sẵn cho Luồng A (cùng 1 thiết bị của ticket này) — state
  // riêng `needsReplacement` phía dưới KHÔNG dùng chung vì đó là state của form
  // handleComplete() khác hẳn màn/thời điểm này.
  const [diagnoseNeedsReplacement, setDiagnoseNeedsReplacement] = useState(false);
  // Chỉ có ý nghĩa khi gọi từ OPEN (case "sửa được ngay") — tick vào thì bắt buộc chọn
  // giờ qua AppointmentSlotPicker (dùng chung approveRepairDate/approveRepairTime bên
  // dưới); gọi từ REPAIR_SCHEDULED (sau khi mang đi kiểm tra) luôn BẮT BUỘC chọn giờ,
  // không cần checkbox này.
  const [diagnoseWantsSchedule, setDiagnoseWantsSchedule] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);

  const [inspectionFormOpen, setInspectionFormOpen] = useState(false);
  const [inspectionDate, setInspectionDate] = useState('');
  const [inspectionTime, setInspectionTime] = useState<string | null>(null);
  const [inspectionNote, setInspectionNote] = useState('');
  const [sendingForInspection, setSendingForInspection] = useState(false);

  /** Đóng hết 2 form OPEN trước khi mở 1 form khác — tránh 2 form cùng hiện. */
  const openTopLevelForm = (which: 'diagnose' | 'inspection') => {
    setDiagnoseFormOpen(which === 'diagnose');
    setInspectionFormOpen(which === 'inspection');
  };

  // ── Complete (Luồng A / Luồng B nhánh manager sửa hộ) ───────────────
  // Chỉ còn ảnh + số tiền trên UI — vendor/date/mô tả tự điền ngầm (BE vẫn bắt buộc
  // non-blank) từ ô "Ghi chú" dùng chung, không hỏi lại manager.
  const [invoiceAmountText, setInvoiceAmountText] = useState('');
  // OCR ảnh hoá đơn (best-effort, xem runInvoiceOcr) — chỉ để hiện loading nhỏ, không
  // chặn gì cả: lỗi/không đọc được thì ô tiền vẫn để trống như luồng nhập tay cũ.
  const [invoiceOcrLoading, setInvoiceOcrLoading] = useState(false);
  // "Ai chịu phí" (06/09/2026) — chỉ có ý nghĩa chọn ở Luồng A (IN_REPAIR); Luồng B
  // (TENANT_FAULT + MANAGER_REPAIR) BE luôn tự thu bất kể field này, không cần hỏi lại.
  const [chargeToTenant, setChargeToTenant] = useState(false);
  const [needsReplacement, setNeedsReplacement] = useState(false);
  const [replacementEquipment, setReplacementEquipment] = useState<EquipmentDto | null>(null);
  useEffect(() => {
    if (realEquipmentId == null) return;
    let active = true;
    realEquipmentService.getById(realEquipmentId)
      .then(eq => { if (active) setReplacementEquipment(eq); })
      .catch(() => { /* không tải được → autoDamageAmount ra null, chặn thu phí (xem dưới) */ });
    return () => { active = false; };
  }, [realEquipmentId]);
  // ── Charge (Luồng B mới, 15/09/2026) — lập hoá đơn thiệt hại TRƯỚC khi sửa/bàn giao,
  // dùng chung cho cả nhánh sửa tại chỗ (status=tenant_fault) và nhánh mang đi kiểm tra
  // thêm (status=repair_scheduled, off-site — xem màn riêng bên dưới). Chỉ cần
  // invoiceAmountText (tái dùng state ở trên) — equipmentNeedsReplacement/estimatedDamageAmount
  // đã chốt xong từ lúc diagnose()/reject-fault, /charge không có field riêng cho số đó
  // nữa (xem BE MaintenanceChargeRequest/resolveMaintenanceChargeAmount).
  const [charging, setCharging] = useState(false);
  const hasReplacementAmount = (ticket?.estimatedDamageAmount ?? 0) > 0;
  const submitCharge = async () => {
    if (charging || !ticket) return;
    const raw = invoiceAmountText.replace(/[^0-9]/g, '');
    const amount = raw ? Number(raw) : 0;
    if (!hasReplacementAmount && (!Number.isFinite(amount) || amount <= 0)) {
      showAlert('Thiếu thông tin', 'Vui lòng nhập số tiền hoá đơn hợp lệ (> 0).');
      return;
    }
    try {
      setCharging(true);
      await realMaintenanceService.chargeBeforeRepair(idNum, {
        invoiceVendor: DEFAULT_INVOICE_VENDOR,
        invoiceDate: today(),
        invoiceAmount: amount > 0 ? amount : undefined,
        equipmentNeedsReplacement: hasReplacementAmount || undefined,
      });
      await refreshReal();
      setInvoiceAmountText('');
      showAlert('🧾 Đã lập hoá đơn', 'Hệ thống đã tạo hoá đơn — khách thanh toán trong 3 ngày, bạn vẫn sửa/bàn giao được ngay.');
    } catch (e: any) { showAlert('Lỗi', apiErrMsg(e, 'Không thể lập hoá đơn. Vui lòng thử lại.')); }
    finally { setCharging(false); }
  };

  // ── Handover (Luồng B nhánh off-site, 15/09/2026) — quét QR bàn giao thiết bị sau khi
  // đã thanh toán, cùng cơ chế quét QR client-side với confirm-arrival/start-repair
  // (extractEquipmentIdFromQr — xem handleArrivalScan/handleStartRepairScan).
  const [handoverScanOpen, setHandoverScanOpen] = useState(false);
  const [handoverBusy, setHandoverBusy] = useState(false);
  const doHandover = async () => {
    if (handoverBusy || !ticket) return;
    try {
      setHandoverBusy(true);
      // Ảnh AFTER ĐÃ upload thẳng lên server ngay lúc chụp/chọn (xem addLocalPhoto →
      // uploadPhotos, giống hệt cơ chế của handleComplete()) — gửi lại `ticket.afterImages`
      // ở đây sẽ bị BE nối CSV thêm 1 lần nữa (appendCsv KHÔNG dedupe), ra ảnh trùng lặp.
      // Để trống để BE tự đọc từ `req.getAfterImageUrls()` đã lưu sẵn.
      const handedOver = await realMaintenanceService.handover(idNum, { handoverImages: [] });
      await refreshReal();
      if (handedOver?.status === 'WAITING_PAYMENT') {
        showAlert('📦 Đã bàn giao', 'Phiếu chuyển sang "Chờ thanh toán" — phiếu tự đóng khi khách thanh toán hoá đơn (hạn 3 ngày).');
      }
    } catch (e: any) {
      showAlert('Không thể bàn giao', apiErrMsg(e, 'Vui lòng thử lại.'));
    } finally {
      setHandoverBusy(false);
    }
  };
  const handleHandoverScan = (raw: string) => {
    setHandoverScanOpen(false);
    const scannedId = extractEquipmentIdFromQr(raw);
    if (!scannedId || !realEquipmentId || Number(scannedId) !== realEquipmentId) {
      showAlert(
        'QR không khớp thiết bị',
        'Mã QR quét được không khớp với thiết bị của phiếu này. Vui lòng quét lại đúng thiết bị.',
        [
          { text: 'Đóng', style: 'cancel' },
          { text: 'Quét lại', onPress: () => setHandoverScanOpen(true) },
        ],
      );
      return;
    }
    void doHandover();
  };

  // ── Verify-repair (Luồng B — tenant đã tự sửa) ──────────────────────
  const [verifyNote, setVerifyNote] = useState('');
  const [verifying,  setVerifying]  = useState(false);
  const submitVerifyRepair = async (accepted: boolean) => {
    if (verifying) return;
    const doSend = async () => {
      try {
        setVerifying(true);
        await realMaintenanceService.verifyRepair(idNum, { accepted, note: verifyNote.trim() || undefined });
        await refreshReal();
        setVerifyNote('');
        showAlert(
          accepted ? '✅ Đã chấp nhận' : 'Không đạt',
          accepted ? 'Phiếu đã hoàn tất.' : 'Ghi nhận chưa đạt — khoản thiệt hại sẽ chờ trừ cọc lúc trả phòng.',
        );
      } catch (e: any) { showAlert('Lỗi', apiErrMsg(e, 'Không thể xử lý. Vui lòng thử lại.')); }
      finally { setVerifying(false); }
    };
    if (!accepted) {
      showAlert('Xác nhận chưa đạt?', 'Khoản thiệt hại sẽ chuyển sang chờ trừ cọc khi khách trả phòng.', [
        { text: 'Không', style: 'cancel' },
        { text: 'Xác nhận', style: 'destructive', onPress: () => void doSend() },
      ]);
    } else {
      await doSend();
    }
  };

  // Vòng đời thiết bị trên dữ liệu THẬT: đếm từ lịch sử bảo trì, loại chính ticket này.
  const [equipRepairCount, setEquipRepairCount] = useState<number | undefined>(undefined);
  const [equipLastRepair, setEquipLastRepair] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!isReal || !realEquipmentId) return;
    let active = true;
    realEquipmentService.getMaintenanceHistory(realEquipmentId)
      .then((list) => {
        if (!active) return;
        const others = list.filter((h) => h.maintenanceRequestId !== idNum);
        setEquipRepairCount(others.length);
        const last = others
          .map((h) => h.maintenanceDate)
          .filter(Boolean)
          .sort()
          .pop();
        setEquipLastRepair(last);
      })
      .catch(() => { /* offline — ẩn cảnh báo */ });
    return () => { active = false; };
  }, [isReal, realEquipmentId, idNum]);
  const repairCount = ticket?.maintenanceCount ?? equipRepairCount;
  const lastRepairDate = ticket?.lastRepairDate ?? equipLastRepair;

  // ── Gate quét QR xác nhận có mặt (05/09/2026) — chặn phía app, BE chỉ ghi mốc thời
  // gian khi gọi confirm-arrival, không tự validate việc quét. Phiếu cũ không có
  // visitAppointmentAt bỏ qua gate này (khớp đúng bypass phía BE).
  const [arrivalScanOpen, setArrivalScanOpen] = useState(false);
  const [arrivalBusy, setArrivalBusy] = useState(false);
  // Mốc quét THẬT lưu cục bộ (xem ARRIVAL_CONFIRM_TTL_MS) — null = chưa quét lần nào
  // trên máy này, hoặc chưa đọc xong storage.
  const [arrivalConfirmedAtLocal, setArrivalConfirmedAtLocal] = useState<number | null>(null);
  const [arrivalCheckLoaded, setArrivalCheckLoaded] = useState(false);
  const [, forceRerenderForGate] = useState(0);

  useEffect(() => {
    if (!isRealId) { setArrivalCheckLoaded(true); return; }
    let active = true;
    AsyncStorage.getItem(arrivalConfirmStorageKey(idNum)).then((v) => {
      if (!active) return;
      setArrivalConfirmedAtLocal(v ? Number(v) : null);
      setArrivalCheckLoaded(true);
    });
    return () => { active = false; };
  }, [idNum, isRealId]);

  // Chưa đọc xong storage → tạm coi là còn mới (tránh nháy màn gate 1 khung hình đầu).
  const isArrivalFresh = !arrivalCheckLoaded
    || (arrivalConfirmedAtLocal != null && serverNow().getTime() - arrivalConfirmedAtLocal < ARRIVAL_CONFIRM_TTL_MS);
  const arrivalNeedsRescan = arrivalCheckLoaded && !!ticket?.visitArrivalConfirmedAt && !isArrivalFresh;

  /** Chặn nộp bước tiếp theo (duyệt/báo lỗi) nếu mốc quét cục bộ đã quá hạn — tính lại
   * NGAY LÚC BẤM, không dựa vào state render trước đó (người dùng có thể ngồi yên
   * >30' trên form mà không có gì khiến màn tự render lại). rescanTick chỉ để ép
   * component render lại, cho gate ở trên hiện ra thay vì đứng yên ở form cũ. */
  const blockIfArrivalStale = (): boolean => {
    if (!ticket?.visitArrivalConfirmedAt) return false; // phiếu cũ không có gate này
    const stale = arrivalConfirmedAtLocal == null
      || serverNow().getTime() - arrivalConfirmedAtLocal >= ARRIVAL_CONFIRM_TTL_MS;
    if (stale) {
      showAlert('Đã quá 30 phút', 'Vui lòng quét lại QR xác nhận có mặt để tiếp tục xử lý phiếu này.');
      forceRerenderForGate(t => t + 1);
    }
    return stale;
  };

  // ── Gate quét QR bắt đầu sửa (REPAIR_SCHEDULED → start-repair) — cùng cơ chế, chỉ
  // áp dụng nhánh "đặt lịch sửa sau" (Luồng A). Đổi lịch sửa cũng đặt ở đây, manager-only.
  const [startRepairScanOpen, setStartRepairScanOpen] = useState(false);
  const [startRepairBusy, setStartRepairBusy] = useState(false);
  const [rescheduleRepairOpen, setRescheduleRepairOpen] = useState(false);
  const [rescheduleRepairDate, setRescheduleRepairDate] = useState('');
  const [rescheduleRepairTime, setRescheduleRepairTime] = useState<string | null>(null);
  const [rescheduleRepairBusy, setRescheduleRepairBusy] = useState(false);

  const doConfirmArrival = async (qrCode?: string) => {
    if (arrivalBusy) return;
    try {
      setArrivalBusy(true);
      await realMaintenanceService.confirmArrival(idNum, qrCode);
      // BE no-op nếu đã confirm trước đó (không cập nhật lại mốc giờ) — mốc "mới quét"
      // thật sự nằm ở đây, lưu cục bộ để tính hạn 30' (xem ARRIVAL_CONFIRM_TTL_MS).
      const now = serverNow().getTime();
      await AsyncStorage.setItem(arrivalConfirmStorageKey(idNum), String(now));
      setArrivalConfirmedAtLocal(now);
      await refreshReal();
    } catch (e: any) {
      showAlert('Không thể xác nhận', e?.response?.data?.error || e?.response?.data?.message || 'Vui lòng thử lại.');
    } finally {
      setArrivalBusy(false);
    }
  };

  const handleArrivalScan = (raw: string) => {
    setArrivalScanOpen(false);
    const scannedId = extractEquipmentIdFromQr(raw);
    if (!scannedId || !realEquipmentId || Number(scannedId) !== realEquipmentId) {
      showAlert(
        'QR không khớp thiết bị',
        'Mã QR quét được không khớp với thiết bị của phiếu này. Vui lòng quét lại đúng thiết bị.',
        [
          { text: 'Đóng', style: 'cancel' },
          { text: 'Quét lại', onPress: () => setArrivalScanOpen(true) },
        ],
      );
      return;
    }
    void doConfirmArrival(toEquipmentQrCode(scannedId));
  };

  if (!ticket) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Text style={s.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Không tìm thấy ticket</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Phiếu OPEN có hẹn xem nhưng CHƯA xác nhận có mặt (hoặc mốc quét cục bộ đã quá 30'):
  // XEM phiếu tự do (BE 21/09/2026 — không còn màn chặn toàn bộ), chỉ chặn nút xử lý và
  // thay bằng thẻ quét QR. Phiếu cũ visitAppointmentAt=null bỏ qua (khớp bypass phía BE).
  const arrivalGateActive = ticket.status === 'open' && !!ticket.visitAppointmentAt
    && (!ticket.visitArrivalConfirmedAt || arrivalNeedsRescan);

  const cfg         = STATUS_CONFIG[ticket.status];
  // category/priority null khi OPEN chưa duyệt → ẩn badge tương ứng.
  const priorityCfg = ticket.priority ? PRIORITY_CONFIG[ticket.priority] : undefined;
  const catCfg      = ticket.category ? CATEGORY_CONFIG[ticket.category] : undefined;
  const isTerminal  = ['closed', 'cancelled'].includes(ticket.status);
  const apiErrMsg = (e: any, fallback: string) =>
    e?.response?.data?.error || e?.response?.data?.message || fallback;

  // Ảnh AFTER/INVOICE đã có (server hoặc local) — điều kiện để "Báo sửa xong".
  const hasAfterPhoto = (ticket.afterImages?.length ?? 0) > 0 || photos.some(p => p.type === 'after');
  const hasInvoicePhoto = (ticket.invoiceImages?.length ?? 0) > 0 || photos.some(p => p.type === 'invoice');
  const beforeUrls = ticket.beforeImages?.length ? ticket.beforeImages : ticket.images;
  // Luồng B (sửa tại chỗ — Nhánh A của thanh-toán-trước-khi-sửa): status đã là tenant_fault
  // NGAY từ diagnose() (TENANT_MISUSE + tenantAgreesToPay=true, không kèm repairAppointmentAt
  // — 16/09/2026, thay reject-fault cũ). BE 21/09/2026: diagnose() tự lập hoá đơn (hạn 3 ngày)
  // ngay lúc chẩn đoán và KHÔNG còn chặn sửa/báo xong vì chưa thanh toán — complete()/handover()
  // chỉ cần chargeInvoiceId đã có; chưa trả thì phiếu sang waiting_payment, trả xong BE tự đóng.
  const isTenantFaultManagerRepair = ticket.status === 'tenant_fault' && ticket.faultResolutionPath === 'manager_repair';
  const needsChargeBeforeRepair = isTenantFaultManagerRepair && !ticket.chargeInvoiceId;
  // `issuedInvoice` chỉ còn có mặt trong khi hoá đơn CHƯA PAID/CANCELLED (mọi GET) — còn
  // set nghĩa là còn chờ khách trả tiền; chargeInvoiceId có mà issuedInvoice không còn
  // (undefined) nghĩa là đã thanh toán xong.
  const hasUnpaidCharge = !!ticket.chargeInvoiceId && !!ticket.issuedInvoice;
  const hasIssuedCharge = !!ticket.chargeInvoiceId;
  const canComplete = ['in_repair', 'tenant_fault'].includes(ticket.status)
    && (ticket.status !== 'tenant_fault' || ticket.faultResolutionPath === 'manager_repair')
    && !needsChargeBeforeRepair;

  /** Tổng ảnh/video hiện có (server + local) theo từng loại — dùng để chặn thêm khi đã
   * đủ EVIDENCE_MAX_FILES (yêu cầu mentor 14/09/2026: tối đa 5 ảnh/video mỗi bộ, ảnh/
   * video mới chọn + ảnh/video đã có trên server cộng lại). */
  const evidenceUrlsForType = (type: PhotoKind): string[] | undefined => {
    switch (type) {
      case 'before': return beforeUrls;
      case 'after': return ticket.afterImages;
      case 'invoice': return ticket.invoiceImages;
      case 'fault_evidence': return ticket.faultEvidenceImages;
      default: return undefined;
    }
  };
  const evidenceCountFor = (type: PhotoKind): number =>
    (evidenceUrlsForType(type)?.length ?? 0) + photos.filter(p => p.type === type).length;

  // "Ai chịu phí" chỉ thật sự là lựa chọn ở Luồng A (in_repair) — Luồng B (tenant_fault,
  // manager sửa hộ) BE luôn tự thu bất kể cờ FE gửi, nên coi như true để tính UI/validate.
  const effectiveChargeToTenant = ticket.status === 'tenant_fault' ? true : chargeToTenant;
  // Chỉ cần tự tính số đền bù khi VỪA cần thay mới VỪA thu phí khách — công ty trả thì
  // không hiện/không cần số này (07/09/2026, xem computeAutoDamageAmount).
  const autoDamageAmount = (needsReplacement && effectiveChargeToTenant)
    ? computeAutoDamageAmount(replacementEquipment) : null;
  const replacementUnderWarranty = isUnderWarranty(replacementEquipment);
  // Số đền bù cho checkbox "cần thay mới" ở màn Chẩn đoán (diagnose(), 16/09/2026) —
  // KHÔNG gate theo "ai chịu phí" như autoDamageAmount ở trên: hao mòn tự nhiên vẫn cần
  // số này (công ty tự chịu, chỉ lưu tham khảo), không riêng gì lỗi khách.
  const diagnoseAutoDamageAmount = diagnoseNeedsReplacement
    ? computeAutoDamageAmount(replacementEquipment) : null;

  // Cập nhật store + append timeline (đường mock).
  const patchStore = (updates: Partial<MaintenanceTicket>, entry: TimelineEntry) =>
    maintenanceStore.updateTicket(ticket.id, {
      ...updates,
      photos,
      timeline: [...ticket.timeline, entry],
      updatedAt: today(),
    });

  const addLocalPhoto = async (type: PhotoKind, media: EvidenceAsset) => {
    const localId = `ph-${Date.now()}`;
    setPhotos(prev => [...prev, {
      id: localId, type, uri: media.uri, capturedAt: now(),
      mediaType: media.type, durationMs: media.durationMs,
    }]);
    if (isReal) {
      const beType = type === 'before' ? 'BEFORE' : type === 'after' ? 'AFTER'
        : type === 'invoice' ? 'INVOICE' : 'FAULT_EVIDENCE';
      try {
        await realMaintenanceService.uploadPhotos(idNum, [media], beType);
        await refreshReal();
        // refreshReal() vừa nạp lại snapshot ảnh từ BE — đã chứa ảnh vừa upload, bỏ bản
        // optimistic cục bộ để tránh hiện trùng ảnh.
        setPhotos(prev => prev.filter(p => p.id !== localId));
        // Ảnh hoá đơn -> thử OCR tự điền số tiền. Không await: chạy nền, không chặn/làm
        // chậm việc thêm ảnh (nhất là lúc chọn nhiều ảnh cùng lúc từ thư viện). INVOICE
        // luôn là ảnh (picker bị chặn ở pickPhotoFromCamera/Library) nên media.uri an toàn.
        if (type === 'invoice') void runInvoiceOcr(media.uri);
      } catch (e: any) {
        showAlert('Lỗi tải ảnh', apiErrMsg(e, 'Không tải được ảnh/video lên máy chủ. Vẫn được lưu tạm trên máy.'));
      }
    }
  };

  /**
   * OCR ảnh hoá đơn sửa chữa -> pre-fill `invoiceAmountText` (vẫn sửa tay được bình
   * thường, không tự gửi). Best-effort tuyệt đối: lỗi/không đọc được số thì lặng lẽ bỏ
   * qua, KHÔNG showAlert (khác với OCR đồng hồ) — vì đây chỉ là gợi ý phụ, ảnh hoá đơn
   * đã lưu thành công rồi, làm phiền manager bằng một cảnh báo cho một bước tự động không
   * ai yêu cầu là phản tác dụng.
   *
   * Tái dùng `realTenantService.ocrEvnBill` — endpoint `/api/v1/ocr/evn-bill` tên gọi là
   * "evn-bill" nhưng theo BE (`OcrServiceImpl.readUtilityBill`) chỉ OCR generic rồi dò
   * nhãn tiền tổng quát, không có gì ràng buộc riêng cho hoá đơn điện — xem
   * `maintenanceInvoiceParser.ts`. Phải upload ảnh lên Cloudinary lấy URL PUBLIC trước
   * (giống `UtilityBillingScreen.captureRoomMeter`): OCR.space tải ảnh qua URL, mà ảnh
   * lưu qua `uploadPhotos` ở trên nằm trên storage riêng của BE (`LocalPropertyImageStorage`),
   * không chắc public/ổn định bằng Cloudinary.
   */
  const runInvoiceOcr = async (uri: string) => {
    if (invoiceAmountText) return; // Manager đã có số (gõ tay hoặc OCR trước đó) -> không ghi đè.
    try {
      setInvoiceOcrLoading(true);
      const url = await uploadImageToCloudinary(uri);
      const ocr = await realTenantService.ocrEvnBill(url);
      const parsed = parseMaintenanceInvoice(ocr);
      if (parsed.totalAmount) {
        setInvoiceAmountText(current => current || formatMoneyInput(parsed.totalAmount));
      }
    } catch {
      // Best-effort — không đọc được thì để trống như luồng nhập tay cũ.
    } finally {
      setInvoiceOcrLoading(false);
    }
  };

  /**
   * Xoá 1 ảnh LOCAL để chụp/chọn lại ảnh khác. Chỉ tác động state cục bộ `photos` —
   * ảnh đã upload thành công đã bị `addLocalPhoto` gỡ khỏi `photos` ngay sau khi
   * `refreshReal()` xong (xem trên), nên nút xoá thực tế chỉ còn gặp 2 trường hợp:
   * đang trong lúc chờ upload, hoặc upload lỗi (showAlert nhưng KHÔNG tự gỡ khỏi
   * `photos` — giữ lại đúng để người dùng còn thấy mà xoá/chụp lại, xem addLocalPhoto).
   */
  const removeLocalPhoto = (localId: string) => setPhotos(prev => prev.filter(p => p.id !== localId));

  /**
   * Xoá 1 ảnh ĐÃ upload lên server (BE ship `DELETE /{id}/photos` 07/09/2026) — dùng khi
   * manager thêm nhầm ảnh (mờ, sai thiết bị...) và muốn thay ảnh khác mà không phải nhờ
   * admin xử lý ngoài luồng như trước.
   */
  const removeServerPhoto = (beType: 'BEFORE' | 'AFTER' | 'INVOICE' | 'FAULT_EVIDENCE' | 'SELF_REPAIR', url: string) => {
    showAlert('Xoá ảnh này?', 'Ảnh sẽ bị gỡ khỏi phiếu — không khôi phục lại được, chỉ có thể thêm ảnh khác.', [
      { text: 'Không', style: 'cancel' },
      { text: 'Xoá ảnh', style: 'destructive', onPress: async () => {
        try {
          await realMaintenanceService.deletePhoto(idNum, beType, url);
          await refreshReal();
        } catch (e: any) {
          showAlert('Không thể xoá', apiErrMsg(e, 'Vui lòng thử lại.'));
        }
      }},
    ]);
  };

  // Menu "Thêm ảnh" trong UI (không dùng Alert.alert 3 nút) — Alert.alert là no-op
  // trên react-native-web nên menu Chụp ảnh/Thư viện trước đây không bấm được trên web.
  //
  // INVOICE luôn chỉ nhận ẢNH (OCR đọc số tiền hoá đơn cần ảnh tĩnh, không đọc được
  // video) — giữ nguyên picker ảnh-only cũ cho type này. AFTER/FAULT_EVIDENCE cho chọn
  // lẫn ảnh/video (yêu cầu mentor 14/09/2026), tối đa EVIDENCE_MAX_FILES tổng cộng.
  const pickPhotoFromCamera = async (type: PhotoKind, mode: EvidenceMediaType = 'image') => {
    setPhotoMenuFor(null);
    const remaining = remainingEvidenceSlots(evidenceCountFor(type));
    if (remaining <= 0) {
      showAlert('Giới hạn', `Bạn chỉ có thể đính kèm tối đa ${EVIDENCE_MAX_FILES} ảnh/video.`);
      return;
    }
    if (type === 'invoice') {
      if (Platform.OS === 'web') { setCameraFor(type); return; }
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') { showAlert('Lỗi', 'Cần quyền camera.'); return; }
      const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
      if (!r.canceled && r.assets[0]) await addLocalPhoto(type, { uri: r.assets[0].uri, type: 'image' });
      return;
    }
    // Quay video chưa hỗ trợ trên web (CameraCaptureModal/expo-camera CameraView chỉ
    // chụp ảnh) — nút "Quay video" bị ẩn trên web ở UI, chỉ còn nhánh ảnh chạy tới đây.
    if (Platform.OS === 'web') { setCameraFor(type); return; }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') { showAlert('Lỗi', 'Cần quyền camera.'); return; }
    const media = await pickEvidenceFromCamera(mode);
    if (media) await addLocalPhoto(type, media);
  };
  const pickPhotoFromLibrary = async (type: PhotoKind) => {
    setPhotoMenuFor(null);
    const remaining = remainingEvidenceSlots(evidenceCountFor(type));
    if (remaining <= 0) {
      showAlert('Giới hạn', `Bạn chỉ có thể đính kèm tối đa ${EVIDENCE_MAX_FILES} ảnh/video.`);
      return;
    }
    if (type === 'invoice') {
      const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, allowsMultipleSelection: true, selectionLimit: remaining });
      if (!r.canceled) for (const a of r.assets) await addLocalPhoto(type, { uri: a.uri, type: 'image' });
      return;
    }
    const picked = await pickEvidenceFromLibrary(remaining);
    for (const media of picked) await addLocalPhoto(type, media);
  };

  // ── Actions theo flow mới ──────────────────────────────────────────

  /**
   * OPEN (sửa ngay, có/không kèm lịch sửa sau) HOẶC REPAIR_SCHEDULED chưa có damageCause
   * (sau khi mang đi kiểm tra) → diagnose(): xác định nguyên nhân + báo giá, dùng chung
   * 2 case qua `fromInspection`. Thay thế approve() (hao mòn) + nhánh MANAGER_REPAIR của
   * reject-fault() (16/09/2026, xem docs/maintenance-diagnose-redesign-be-2026-09-16.md).
   * Tái dùng approveCategory/approvePriority/approveRepairDate/approveRepairTime (state
   * cũ của form "Duyệt") — cùng field, chỉ đổi API đích.
   */
  const submitDiagnose = async (fromInspection: boolean) => {
    if (diagnosing) return;
    if (!fromInspection && blockIfArrivalStale()) return;
    if (!approveCategory) {
      showAlert('Chưa phân loại', 'Vui lòng chọn danh mục sự cố trước khi chẩn đoán.');
      return;
    }
    const rawAmount = diagnoseQuotedAmountText.replace(/[^0-9]/g, '');
    const enteredAmount = rawAmount ? Number(rawAmount) : NaN;
    // 1 lần chi phí duy nhất (BE 21/09/2026). Không thay thiết bị: nhập chi phí sửa chữa,
    // bắt buộc. Thay thiết bị: không có ô nhập — số đền bù lấy từ diagnoseAutoDamageAmount
    // (tự tính, không cho nhập tay, xem checkbox trong renderDiagnoseForm).
    let quotedRepairAmount: number | undefined;
    if (diagnoseNeedsReplacement) {
      if (!diagnoseAutoDamageAmount || diagnoseAutoDamageAmount <= 0) {
        showAlert(
          'Thiếu dữ liệu thiết bị',
          'Thiết bị chưa có dữ liệu giá + ngày bảo hành, cũng chưa có mức phạt cố định (penaltyFee) để tự tính số tiền đền bù — không thể đánh dấu thay mới cho thiết bị này.',
        );
        return;
      }
      // Thay mới: BE lấy số đền bù (estimatedDamageAmount) — không còn "chi phí phát sinh thêm".
      quotedRepairAmount = undefined;
    } else {
      if (!Number.isFinite(enteredAmount) || enteredAmount < 0) {
        showAlert('Thiếu chi phí', 'Vui lòng nhập chi phí sửa chữa hợp lệ (>= 0).');
        return;
      }
      quotedRepairAmount = enteredAmount;
    }
    if (!diagnoseCause) {
      showAlert('Chưa chọn nguyên nhân', 'Vui lòng chọn "Hao mòn tự nhiên" hoặc "Lỗi do khách".');
      return;
    }

    let tenantAgreesToPay: boolean | undefined;
    let faultReasonBody: string | undefined;
    let faultEvidenceImages: string[] | undefined;
    let companyAbsorbedNote: string | undefined;
    if (diagnoseCause === 'TENANT_MISUSE') {
      const reason = diagnoseFaultReason.trim();
      if (!reason) { showAlert('Thiếu lý do', 'Vui lòng mô tả lỗi do khách gây ra.'); return; }
      const evidenceUrls = ticket?.faultEvidenceImages ?? [];
      if (diagnoseTenantAgreesToPay == null) {
        showAlert('Chưa chọn', 'Vui lòng chọn khách có đồng ý trả chi phí hay không.');
        return;
      }
      faultReasonBody = reason;
      // Ảnh bằng chứng không còn bắt buộc (BE 21/09/2026): đã có ảnh tenant + xác nhận hiện trường.
      faultEvidenceImages = evidenceUrls.length > 0 ? evidenceUrls : undefined;
      tenantAgreesToPay = diagnoseTenantAgreesToPay;
      companyAbsorbedNote = !diagnoseTenantAgreesToPay ? (diagnoseCompanyAbsorbedNote.trim() || undefined) : undefined;
    }

    let repairAppointmentAt: string | undefined;
    if (fromInspection || diagnoseWantsSchedule) {
      const dt = approveRepairTime ? toLocalDateTime(approveRepairDate, approveRepairTime) : null;
      if (!dt) {
        showAlert('Thiếu lịch hẹn', fromInspection
          ? 'Vui lòng chọn ngày giờ hẹn giao/sửa chính thức.'
          : 'Vui lòng chọn ngày giờ hẹn sửa, hoặc bỏ chọn "Đặt lịch sửa sau".');
        return;
      }
      if (dt.getTime() <= serverNow().getTime()) {
        showAlert('Lịch hẹn không hợp lệ', 'Thời điểm hẹn phải ở tương lai. Vui lòng chọn lại giờ khác.');
        return;
      }
      repairAppointmentAt = toApiDateTime(dt);
    }

    try {
      setDiagnosing(true);
      await realMaintenanceService.diagnose(idNum, {
        quotedRepairAmount,
        equipmentNeedsReplacement: diagnoseNeedsReplacement || undefined,
        estimatedDamageAmount: diagnoseNeedsReplacement ? diagnoseAutoDamageAmount ?? undefined : undefined,
        damageCause: diagnoseCause,
        tenantAgreesToPay,
        faultReason: faultReasonBody,
        faultEvidenceImages,
        companyAbsorbedNote,
        repairAppointmentAt,
        category: approveCategory.toUpperCase() as MaintenanceReqCategory,
        priority: approvePriority ? (approvePriority.toUpperCase() as MaintenanceReqPriority) : undefined,
      });
      await refreshReal();
      setDiagnoseFormOpen(false);
      setDiagnoseQuotedAmountText(''); setDiagnoseCause(null); setDiagnoseFaultReason('');
      setDiagnoseTenantAgreesToPay(null); setDiagnoseCompanyAbsorbedNote(''); setDiagnoseWantsSchedule(false);
      setDiagnoseNeedsReplacement(false);
      showAlert(
        diagnoseCause === 'WEAR'
          ? '✅ Đã ghi nhận hao mòn tự nhiên'
          : tenantAgreesToPay === false ? '⚠️ Công ty trả hộ chi phí' : '⚠️ Đã ghi nhận lỗi do khách',
        repairAppointmentAt
          ? 'Đã đặt lịch sửa/giao máy — chờ tới đúng lịch hẹn.'
          : diagnoseCause === 'TENANT_MISUSE' && tenantAgreesToPay
            ? 'Đã lập hoá đơn cho khách (hạn 3 ngày) — bạn có thể sửa ngay.'
            : 'Đang tiến hành sửa chữa.',
      );
    } catch (e: any) { showAlert('Lỗi', apiErrMsg(e, 'Không thể ghi nhận chẩn đoán. Vui lòng thử lại.')); }
    finally { setDiagnosing(false); }
  };

  /**
   * OPEN → REPAIR_SCHEDULED, mang thiết bị đi kiểm tra thêm khi CHƯA biết nguyên nhân
   * (16/09/2026) — chẩn đoán thật làm sau qua submitDiagnose(fromInspection=true) một khi
   * thợ báo kết quả (xem branch "Đang kiểm tra", `ticket.status === 'repair_scheduled'
   * && !ticket.damageCause`).
   */
  const submitSendForInspection = async () => {
    if (sendingForInspection) return;
    if (blockIfArrivalStale()) return;
    const dt = inspectionTime ? toLocalDateTime(inspectionDate, inspectionTime) : null;
    try {
      setSendingForInspection(true);
      await realMaintenanceService.sendForInspection(idNum, {
        expectedReturnAt: dt ? toApiDateTime(dt) : undefined,
        category: approveCategory ? approveCategory.toUpperCase() : undefined,
        note: inspectionNote.trim() || undefined,
      });
      await refreshReal();
      setInspectionFormOpen(false);
      setInspectionDate(''); setInspectionTime(null); setInspectionNote('');
      showAlert(
        '📦 Đã ghi nhận — mang thiết bị đi kiểm tra thêm',
        'Khi có kết quả, vào lại phiếu để nhập chẩn đoán & báo giá.',
      );
    } catch (e: any) { showAlert('Lỗi', apiErrMsg(e, 'Không thể ghi nhận. Vui lòng thử lại.')); }
    finally { setSendingForInspection(false); }
  };

  /** IN_REPAIR/TENANT_FAULT → CLOSED: báo sửa xong (bắt buộc AFTER + INVOICE + thông tin hoá đơn). */
  const handleComplete = async () => {
    if (busy) return;
    if (!hasAfterPhoto) { showAlert('Thiếu ảnh', 'Cần ít nhất 1 ảnh SAU sửa chữa.'); return; }
    // Đã charge() TRƯỚC khi sửa (chargeInvoiceId đã set, 15/09/2026) — BE complete() bỏ
    // qua hẳn việc tạo hoá đơn (đã có + đã PAID rồi, xem canComplete ở trên), chỉ cần
    // ảnh AFTER. KHÔNG hỏi lại ảnh hoá đơn/số tiền — hỏi lại là thu trùng một khoản đã
    // thu ở bước charge().
    if (!ticket.chargeInvoiceId && !hasInvoicePhoto) {
      showAlert('Thiếu ảnh', 'Cần ít nhất 1 ảnh hoá đơn.');
      return;
    }
    const invoiceAmountRaw = invoiceAmountText.replace(/[^0-9]/g, '');
    const amount = invoiceAmountRaw ? Number(invoiceAmountRaw) : 0;
    // BE (commit afd2f17, 07/09/2026): số tiền hoá đơn chỉ bắt buộc >0 khi KHÔNG thay
    // thiết bị — thay mới thì có thể để trống/0, tiền đền bù tự tính đứng một mình đủ.
    if (!ticket.chargeInvoiceId && !needsReplacement && (!Number.isFinite(amount) || amount <= 0)) {
      showAlert('Thiếu thông tin', 'Vui lòng nhập số tiền hoá đơn hợp lệ (> 0).');
      return;
    }
    let damageAmount: number | undefined;
    if (!ticket.chargeInvoiceId && needsReplacement && effectiveChargeToTenant) {
      // Số này LUÔN tự tính (khấu hao còn lại nếu còn bảo hành, penaltyFee nếu hết) —
      // không có nguồn nào để thu tay, không cho phép nhập tay thay thế (07/09/2026).
      if (!autoDamageAmount || autoDamageAmount <= 0) {
        showAlert(
          'Thiếu dữ liệu thiết bị',
          'Thiết bị chưa có dữ liệu giá + ngày bảo hành, cũng chưa có mức phạt cố định (penaltyFee) để tự tính số tiền đền bù — không thể thu phí khách cho thiết bị này. Vui lòng bổ sung thông tin thiết bị trước khi hoàn tất.',
        );
        return;
      }
      damageAmount = autoDamageAmount;
    }
    if (isReal) {
      try {
        setBusy(true);
        const completed = await realMaintenanceService.complete(idNum, {
          resolutionNote: noteInput.trim() || undefined,
          repairDescription: noteInput.trim() || 'Đã sửa xong',
          // Đã charge() trước rồi thì complete() không dùng các field hoá đơn này nữa —
          // gửi undefined để khỏi nhầm tưởng còn thu thêm lần nữa.
          invoiceVendor: ticket.chargeInvoiceId ? undefined : DEFAULT_INVOICE_VENDOR,
          invoiceDate: ticket.chargeInvoiceId ? undefined : today(),
          invoiceAmount: ticket.chargeInvoiceId ? undefined : amount,
          // Luồng B (tenant_fault) BE luôn tự thu — chỉ Luồng A mới thật sự cần cờ này.
          chargeToTenant: ticket.status === 'in_repair' ? chargeToTenant : undefined,
          // Đã charge() trước thì đọc đúng cờ BE đã chốt lúc diagnose() — KHÔNG suy luận
          // từ estimatedDamageAmount > 0 nữa (BE giờ luôn set field này kể cả sửa thường
          // không thay gì, xem equipmentReplacementFlagged — BE commit 49201d9, 16/09/2026).
          equipmentNeedsReplacement: ticket.chargeInvoiceId
            ? (ticket.equipmentReplacementFlagged || undefined)
            : (needsReplacement || undefined),
          // BE applyEquipmentReplacementOnComplete() đọc estimatedDamageAmount TỪ REQUEST
          // này (không tự lấy lại từ phiếu đã lưu) — undefined thì nó fallback thẳng
          // sang Equipment.penaltyFee, SAI nếu giá trị thật sự (chốt lúc diagnose(), có
          // thể là khấu hao còn lại nếu còn bảo hành) khác với penaltyFee. Phải gửi lại
          // đúng số đã lưu trên phiếu cho nhánh đã charge().
          estimatedDamageAmount: ticket.chargeInvoiceId
            ? (ticket.equipmentReplacementFlagged ? ticket.estimatedDamageAmount : undefined)
            : damageAmount,
        });
        await refreshReal();
        setNoteInput(''); setInvoiceAmountText('');
        setChargeToTenant(false); setNeedsReplacement(false);
        // BE 21/09/2026: có thu khách mà chưa trả → WAITING_PAYMENT, trả xong BE tự đóng phiếu.
        const waitingPayment = completed?.status === 'WAITING_PAYMENT';
        const willCharge = !ticket.chargeInvoiceId && (ticket.status === 'tenant_fault' || chargeToTenant);
        showAlert(
          '🛠 Đã báo sửa xong',
          waitingPayment
            ? 'Phiếu chuyển sang "Chờ thanh toán" — khách thanh toán hoá đơn trong 3 ngày, phiếu tự đóng khi khách trả xong.'
            : willCharge
              ? 'Hệ thống đã tự tạo hoá đơn — khách thanh toán trong màn chi tiết yêu cầu.'
              : 'Phiếu đã hoàn tất.',
        );
      } catch (e: any) { showAlert('Lỗi', apiErrMsg(e, 'Không thể báo sửa xong. Vui lòng thử lại.')); }
      finally { setBusy(false); }
      return;
    }
    patchStore(
      { status: 'closed', resolutionNote: noteInput.trim() || undefined, repairDescription: noteInput.trim() || 'Đã sửa xong' },
      mkEntry('closed', noteInput.trim() || 'Đã sửa xong'),
    );
    setNoteInput('');
  };

  const handleCancel = () => {
    showAlert('Hủy yêu cầu?', 'Bạn có chắc muốn hủy ticket này?', [
      { text: 'Không', style: 'cancel' },
      { text: 'Hủy ticket', style: 'destructive', onPress: async () => {
        if (isReal) {
          try {
            await realMaintenanceService.cancel(idNum, noteInput.trim() || 'Không còn cần sửa');
            await refreshReal();
          } catch (e: any) {
            const msg = e?.response?.data?.message
              || (e?.response?.status === 403 ? 'Bạn không có quyền hủy yêu cầu này.' : 'Không thể hủy yêu cầu. Vui lòng thử lại.');
            showAlert('Không thể hủy', msg);
          }
          return;
        }
        patchStore({ status: 'cancelled' }, mkEntry('cancelled', 'Đã hủy yêu cầu'));
      }},
    ]);
  };

  /**
   * Form "Chẩn đoán & báo giá" (16/09/2026) — dùng chung 2 nơi: card inline khi OPEN
   * (`fromInspection=false`, gọi từ nút "🔧 Sửa được ngay" trong khối 3 lựa chọn bên
   * dưới) và màn "Đang kiểm tra" (`fromInspection=true`, early-return riêng phía trên,
   * xem `ticket.status === 'repair_scheduled' && !ticket.damageCause`). Khác nhau đúng 2
   * chỗ: lịch hẹn bắt buộc hay tuỳ chọn (qua checkbox), và nút "Quay lại" chỉ có ở case
   * inline (case màn riêng không có gì để quay lại — Huỷ yêu cầu đã có nút riêng).
   */
  const renderDiagnoseForm = (fromInspection: boolean) => (
    <View style={[s.card, { borderColor: Colors.primary, borderWidth: 1.5 }]}>
      <Text style={s.cardSectionTitle}>🔍 Chẩn đoán & báo giá</Text>

      <Text style={[s.cardSectionTitle, { marginTop: Spacing.sm }]}>
        {ticket.category ? 'Phân loại sự cố' : 'Phân loại sự cố (bắt buộc)'}
      </Text>
      <TouchableOpacity style={s.dropdownBtn} onPress={() => setCategoryMenuOpen(o => !o)} activeOpacity={0.75}>
        <Text style={[s.dropdownBtnText, !approveCategory && s.dropdownBtnPlaceholder]}>
          {approveCategory ? `${CATEGORY_CONFIG[approveCategory].icon} ${CATEGORY_CONFIG[approveCategory].label}` : 'Chọn danh mục sự cố'}
        </Text>
        <Text style={s.dropdownChevron}>{categoryMenuOpen ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {categoryMenuOpen && (
        <View style={s.dropdownList}>
          {APPROVE_CATEGORY_KEYS.map(key => {
            const c = CATEGORY_CONFIG[key];
            const active = approveCategory === key;
            return (
              <TouchableOpacity
                key={key}
                style={[s.dropdownItem, active && s.dropdownItemActive]}
                onPress={() => { setApproveCategory(key); setCategoryMenuOpen(false); }}
                activeOpacity={0.75}
              >
                <Text style={[s.dropdownItemText, active && s.dropdownItemTextActive]}>{c.icon} {c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <TouchableOpacity
        style={[s.replaceToggleRow, { marginTop: Spacing.md }]}
        onPress={() => setDiagnoseNeedsReplacement(v => !v)}
        activeOpacity={0.75}
      >
        <View style={[s.checkbox, diagnoseNeedsReplacement && s.checkboxChecked]}>
          {diagnoseNeedsReplacement && <Text style={s.checkboxMark}>✓</Text>}
        </View>
        <Text style={s.cardSectionTitle}>⚠️ Thiết bị hỏng hoàn toàn — cần thay mới</Text>
      </TouchableOpacity>
      {diagnoseNeedsReplacement && (
        <>
          <View style={[s.textInput, s.readonlyAmountBox, { marginTop: Spacing.sm }]}>
            <Text style={s.readonlyAmountText}>
              {diagnoseAutoDamageAmount ? fmt(diagnoseAutoDamageAmount) : '— Chưa có dữ liệu —'}
            </Text>
          </View>
          <Text style={s.costHint}>
            {diagnoseAutoDamageAmount
              ? isUnderWarranty(replacementEquipment)
                ? 'Còn bảo hành — số tiền này là phần khấu hao còn lại của thiết bị, tự tính, không thể sửa.'
                : 'Đã hết bảo hành — số tiền này là mức phạt cố định của thiết bị (penaltyFee), tự tính, không thể sửa.'
              : 'Thiết bị chưa có dữ liệu giá/bảo hành, cũng chưa có mức phạt cố định — không thể đánh dấu thay mới cho thiết bị này.'}
          </Text>
        </>
      )}

      {/* BE 21/09/2026: chỉ 1 lần chi phí. Thay mới → số đền bù tự tính ở trên (không nhập thêm
          "chi phí phát sinh"); không thay → nhập chi phí sửa chữa. */}
      {!diagnoseNeedsReplacement && (
        <>
          <Text style={[s.cardSectionTitle, { marginTop: Spacing.md }]}>Chi phí sửa chữa (đ)</Text>
          <TextInput
            style={[s.textInput, s.moneyInput]}
            value={diagnoseQuotedAmountText}
            onChangeText={t => setDiagnoseQuotedAmountText(formatMoneyInput(t))}
            placeholder="Nhập chi phí sửa chữa..."
            placeholderTextColor={Colors.textMuted}
            keyboardType="numeric"
          />
        </>
      )}

      <Text style={[s.cardSectionTitle, { marginTop: Spacing.md }]}>Nguyên nhân</Text>
      <View style={s.reviewRow}>
        <TouchableOpacity
          style={[s.reviewBtn, diagnoseCause === 'WEAR' && { backgroundColor: Colors.primaryBg, borderColor: Colors.primary }]}
          onPress={() => setDiagnoseCause('WEAR')}
        >
          <Text style={[s.reviewBtnText, diagnoseCause === 'WEAR' && { color: Colors.primary }]}>Hao mòn tự nhiên</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.reviewBtn, diagnoseCause === 'TENANT_MISUSE' && { backgroundColor: Colors.primaryBg, borderColor: Colors.primary }]}
          onPress={() => setDiagnoseCause('TENANT_MISUSE')}
        >
          <Text style={[s.reviewBtnText, diagnoseCause === 'TENANT_MISUSE' && { color: Colors.primary }]}>Lỗi do khách</Text>
        </TouchableOpacity>
      </View>

      {diagnoseCause === 'TENANT_MISUSE' && (
        <>
          <Text style={[s.cardSectionTitle, { marginTop: Spacing.sm }]}>Lý do</Text>
          <TextInput
            style={s.textInput}
            value={diagnoseFaultReason}
            onChangeText={setDiagnoseFaultReason}
            placeholder="Mô tả lỗi do khách gây ra (vd: tự tháo ống nước, dùng sai cách...)"
            placeholderTextColor={Colors.textMuted}
            multiline
          />
          <Text style={[s.pickHint, { marginTop: Spacing.sm }]}>
            Ảnh/video bằng chứng — không bắt buộc (đã có ảnh của khách và xác nhận tại hiện trường).
          </Text>
          <View style={{ marginTop: Spacing.sm }}>
            <PhotoEvidenceRow
              type="fault_evidence" urls={ticket.faultEvidenceImages} photos={photos}
              onAdd={() => setPhotoMenuFor('fault_evidence')}
              onView={(uris, i) => setLightbox({ uris, index: i })}
              onViewVideo={(url) => setVideoPreviewUrl(url)}
              onRemoveLocal={removeLocalPhoto}
              onRemoveServer={(url) => removeServerPhoto('FAULT_EVIDENCE', url)}
            />
          </View>

          <Text style={[s.cardSectionTitle, { marginTop: Spacing.sm }]}>Khách có đồng ý trả không?</Text>
          <View style={s.reviewRow}>
            <TouchableOpacity
              style={[s.reviewBtn, diagnoseTenantAgreesToPay === true && { backgroundColor: Colors.primaryBg, borderColor: Colors.primary }]}
              onPress={() => setDiagnoseTenantAgreesToPay(true)}
            >
              <Text style={[s.reviewBtnText, diagnoseTenantAgreesToPay === true && { color: Colors.primary }]}>Khách đồng ý trả</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.reviewBtn, diagnoseTenantAgreesToPay === false && { backgroundColor: '#FEF2F2', borderColor: '#DC2626' }]}
              onPress={() => setDiagnoseTenantAgreesToPay(false)}
            >
              <Text style={[s.reviewBtnText, diagnoseTenantAgreesToPay === false && { color: '#DC2626' }]}>Khách từ chối trả</Text>
            </TouchableOpacity>
          </View>
          {diagnoseTenantAgreesToPay === false && (
            <>
              <Text style={[s.cardSectionTitle, { marginTop: Spacing.sm }]}>Ghi chú thoả thuận (tùy chọn)</Text>
              <TextInput
                style={[s.textInput, s.noteInput]}
                value={diagnoseCompanyAbsorbedNote}
                onChangeText={setDiagnoseCompanyAbsorbedNote}
                placeholder="Tóm tắt thoả thuận ngoài app..."
                placeholderTextColor={Colors.textMuted}
                multiline
              />
              <Text style={s.pickHint}>Công ty sẽ trả hộ chi phí này — không lập hoá đơn thu khách.</Text>
            </>
          )}
        </>
      )}

      {fromInspection ? (
        <>
          <Text style={[s.cardSectionTitle, { marginTop: Spacing.md }]}>Lịch hẹn giao máy / sửa chính thức (bắt buộc)</Text>
          <AppointmentSlotPicker
            propertyId={ticket.propertyId ? Number(ticket.propertyId) : undefined}
            slotMinutes={MAINTENANCE_REPAIR_SLOT_MINUTES}
            excludeRequestId={idNum}
            date={approveRepairDate}
            onDateChange={setApproveRepairDate}
            time={approveRepairTime}
            onTimeChange={setApproveRepairTime}
          />
        </>
      ) : (
        <>
          <TouchableOpacity
            style={[s.replaceToggleRow, { marginTop: Spacing.md }]}
            onPress={() => setDiagnoseWantsSchedule(v => !v)}
            activeOpacity={0.75}
          >
            <View style={[s.checkbox, diagnoseWantsSchedule && s.checkboxChecked]}>
              {diagnoseWantsSchedule && <Text style={s.checkboxMark}>✓</Text>}
            </View>
            <Text style={s.cardSectionTitle}>🗓 Đặt lịch sửa sau thay vì sửa ngay</Text>
          </TouchableOpacity>
          {diagnoseWantsSchedule && (
            <View style={{ marginTop: Spacing.sm }}>
              <AppointmentSlotPicker
                propertyId={ticket.propertyId ? Number(ticket.propertyId) : undefined}
                slotMinutes={MAINTENANCE_REPAIR_SLOT_MINUTES}
                excludeRequestId={idNum}
                date={approveRepairDate}
                onDateChange={setApproveRepairDate}
                time={approveRepairTime}
                onTimeChange={setApproveRepairTime}
              />
            </View>
          )}
        </>
      )}

      <TouchableOpacity
        style={[s.advanceBtn, { marginTop: Spacing.md }, diagnosing && s.btnDisabled]}
        onPress={() => submitDiagnose(fromInspection)}
        disabled={diagnosing}
      >
        <Text style={s.advanceBtnText}>{diagnosing ? 'Đang gửi...' : '✅ Xác nhận chẩn đoán'}</Text>
      </TouchableOpacity>
      {!fromInspection && (
        <TouchableOpacity style={{ alignItems: 'center', paddingVertical: Spacing.sm }} onPress={() => setDiagnoseFormOpen(false)}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.textSecondary }}>← Quay lại</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const doStartRepair = async () => {
    if (startRepairBusy) return;
    try {
      setStartRepairBusy(true);
      await realMaintenanceService.startRepair(idNum);
      await refreshReal();
    } catch (e: any) {
      showAlert('Không thể bắt đầu sửa', apiErrMsg(e, 'Vui lòng thử lại.'));
    } finally {
      setStartRepairBusy(false);
    }
  };

  const handleStartRepairScan = (raw: string) => {
    setStartRepairScanOpen(false);
    const scannedId = extractEquipmentIdFromQr(raw);
    if (!scannedId || !realEquipmentId || Number(scannedId) !== realEquipmentId) {
      showAlert(
        'QR không khớp thiết bị',
        'Mã QR quét được không khớp với thiết bị của phiếu này. Vui lòng quét lại đúng thiết bị.',
        [
          { text: 'Đóng', style: 'cancel' },
          { text: 'Quét lại', onPress: () => setStartRepairScanOpen(true) },
        ],
      );
      return;
    }
    void doStartRepair();
  };

  const openRescheduleRepair = () => {
    setRescheduleRepairDate('');
    setRescheduleRepairTime(null);
    setRescheduleRepairOpen(true);
  };

  const confirmRescheduleRepair = async () => {
    if (rescheduleRepairBusy) return;
    const dt = rescheduleRepairTime ? toLocalDateTime(rescheduleRepairDate, rescheduleRepairTime) : null;
    if (!dt) { showAlert('Thiếu lịch sửa', 'Vui lòng chọn ngày và giờ sửa mới.'); return; }
    if (dt.getTime() <= serverNow().getTime()) {
      showAlert('Lịch sửa không hợp lệ', 'Thời điểm hẹn phải ở tương lai. Vui lòng chọn lại giờ khác.');
      return;
    }
    try {
      setRescheduleRepairBusy(true);
      await realMaintenanceService.rescheduleRepair(idNum, { repairAppointmentAt: toApiDateTime(dt) });
      await refreshReal();
      setRescheduleRepairOpen(false);
    } catch (e: any) {
      showAlert('Không thể đổi lịch', apiErrMsg(e, 'Vui lòng thử lại.'));
    } finally {
      setRescheduleRepairBusy(false);
    }
  };

  /**
   * Phiếu REPAIR_SCHEDULED nhưng CHƯA có damageCause (16/09/2026) — vừa qua
   * sendForInspection() (mang thiết bị đi kiểm tra thêm), chưa biết nguyên nhân. PHẢI
   * chặn TRƯỚC 2 branch repair_scheduled bên dưới (thứ tự if quan trọng): branch off-site
   * (faultResolutionPath=manager_repair) không bao giờ khớp phiếu này (BE để
   * faultResolutionPath null cho tới khi diagnose() xong), nhưng branch "Bắt đầu sửa chữa"
   * (QR gate) bên dưới thì có — phiếu chưa chẩn đoán không được phép quét QR bắt đầu sửa
   * (BE start-repair() cũng chặn cứng nếu damageCause null).
   */
  if (ticket.status === 'repair_scheduled' && !ticket.damageCause) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Text style={s.backIcon}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerCode}>{ticket.ticketCode}</Text>
            <Text style={s.headerTitle} numberOfLines={1}>{ticket.title}</Text>
          </View>
        </View>
        <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>📦 Đang mang đi kiểm tra</Text>
            <Text style={s.descText}>
              {ticket.roomName} · {ticket.tenantName}{ticket.equipmentName ? ` · ${ticket.equipmentName}` : ''}
            </Text>
            {!!ticket.expectedReturnAt && (
              <Text style={[s.pickHint, { marginTop: Spacing.sm }]}>
                Dự kiến trả máy: {formatDateTime(ticket.expectedReturnAt)}
              </Text>
            )}
            <Text style={[s.pickHint, { marginTop: Spacing.sm }]}>
              Chưa xác định nguyên nhân — khi thợ báo kết quả kiểm tra/báo giá, nhập chẩn đoán bên dưới.
            </Text>
          </View>

          {!diagnoseFormOpen ? (
            <TouchableOpacity style={[s.advanceBtn, { backgroundColor: Colors.primary }]} onPress={() => setDiagnoseFormOpen(true)}>
              <Text style={s.advanceBtnText}>📋 Nhập kết quả chẩn đoán</Text>
            </TouchableOpacity>
          ) : renderDiagnoseForm(true)}

          <TouchableOpacity style={s.cancelBtn} onPress={handleCancel}>
            <Text style={s.cancelBtnText}>Hủy yêu cầu này</Text>
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>

        <CameraCaptureModal
          visible={cameraFor !== null}
          onCapture={(uri) => { const t = cameraFor; setCameraFor(null); if (t) void addLocalPhoto(t, { uri, type: 'image' }); }}
          onClose={() => setCameraFor(null)}
        />
        <Modal visible={photoMenuFor !== null} transparent animationType="fade" onRequestClose={() => setPhotoMenuFor(null)}>
          <Pressable style={s.photoMenuBackdrop} onPress={() => setPhotoMenuFor(null)}>
            <Pressable style={s.photoMenuCard} onPress={() => {}}>
              <Text style={s.photoMenuTitle}>Thêm ảnh/video</Text>
              <TouchableOpacity style={s.photoMenuOption} onPress={() => photoMenuFor && pickPhotoFromCamera(photoMenuFor, 'image')}>
                <Text style={s.photoMenuOptionText}>📷 Chụp ảnh</Text>
              </TouchableOpacity>
              {Platform.OS !== 'web' && (
                <TouchableOpacity style={s.photoMenuOption} onPress={() => photoMenuFor && pickPhotoFromCamera(photoMenuFor, 'video')}>
                  <Text style={s.photoMenuOptionText}>🎥 Quay video</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.photoMenuOption} onPress={() => photoMenuFor && pickPhotoFromLibrary(photoMenuFor)}>
                <Text style={s.photoMenuOptionText}>🖼️ Chọn từ thư viện</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.photoMenuCancel} onPress={() => setPhotoMenuFor(null)}>
                <Text style={s.photoMenuCancelText}>Đóng</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
        <PhotoLightbox state={lightbox} onChange={setLightbox} />
        <VideoPreviewModal visible={!!videoPreviewUrl} url={videoPreviewUrl} onClose={() => setVideoPreviewUrl(null)} />
      </SafeAreaView>
    );
  }

  /**
   * Phiếu REPAIR_SCHEDULED có faultResolutionPath=manager_repair — CHỈ phiếu lỗi khách
   * (TENANT_MISUSE) mới có field này set (Luồng A hao mòn/WEAR không set — xem canComplete
   * ở trên). Khác hẳn màn "Bắt đầu sửa" (Luồng A) bên dưới: sửa/kiểm tra đã xảy ra NGOÀI
   * hiện trường (đã qua sendForInspection() rồi diagnose(), hoặc diagnose() ngay từ OPEN
   * kèm repairAppointmentAt), phiếu không quay lại IN_REPAIR mà đi thẳng CLOSED qua
   * handover() — cần lập hoá đơn + đặt lịch bàn giao + chờ thanh toán trước khi quét QR
   * bàn giao, xem docs/BE-YEUCAU-thanh-toan-truoc-khi-sua-2026-09-15.md.
   * Từ 16/09/2026, ticket ở đây LUÔN có damageCause=TENANT_MISUSE (branch phía trên đã
   * chặn hết case damageCause null) — có thể là khách đồng ý trả (gate theo chargeInvoiceId như
   * cũ) hoặc khách từ chối trả/công ty trả hộ (companyAbsorbedFault=true, bỏ qua gate
   * thanh toán — xem readyToHandover bên dưới).
   */
  if (ticket.status === 'repair_scheduled' && ticket.faultResolutionPath === 'manager_repair') {
    const canSetHandoverDate = !ticket.repairAppointmentAt || isBeforeAppointmentDay(ticket.repairAppointmentAt);
    // companyAbsorbedFault (16/09/2026): charge() bị BE chặn cứng cho case này (ném lỗi)
    // nên chargeInvoiceId sẽ MÃI MÃI null — phải tự bỏ qua gate hoá đơn,
    // không thì nút bàn giao không bao giờ bật được (xem 2 khối "Lập hoá đơn"/"Đang chờ
    // thanh toán" bên dưới cũng bị ẩn hẳn cho case này).
    const readyToHandover = (hasIssuedCharge || ticket.companyAbsorbedFault) && !!ticket.repairAppointmentAt;
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Text style={s.backIcon}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.headerCode}>{ticket.ticketCode}</Text>
            <Text style={s.headerTitle} numberOfLines={1}>{ticket.title}</Text>
          </View>
        </View>
        <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>📦 Mang thiết bị đi kiểm tra thêm</Text>
            <Text style={s.descText}>
              {ticket.roomName} · {ticket.tenantName}{ticket.equipmentName ? ` · ${ticket.equipmentName}` : ''}
            </Text>
            <Text style={[s.pickHint, { marginTop: Spacing.sm }]}>
              Lỗi do khách — {ticket.faultReason || 'không có ghi chú'}.{' '}
              {ticket.companyAbsorbedFault
                ? 'Khách từ chối trả — công ty đã trả hộ, không cần lập hoá đơn. Đặt lịch bàn giao rồi quét QR bàn giao.'
                : 'Khi có kết quả kiểm tra/báo giá: lập hoá đơn thiệt hại, đặt lịch bàn giao, rồi quét QR bàn giao (khách thanh toán trong 3 ngày, không chặn bàn giao).'}
            </Text>
          </View>

          {/* Bước 1: lập hoá đơn thiệt hại (giống hệt Nhánh A, chỉ khác thời điểm gọi) —
              BỎ QUA hẳn khi companyAbsorbedFault (BE chặn cứng charge() cho case này). */}
          {!ticket.chargeInvoiceId && !ticket.companyAbsorbedFault && (
            <View style={[s.card, { borderColor: '#DC2626', borderWidth: 1.5 }]}>
              <Text style={s.cardSectionTitle}>🧾 Lập hoá đơn thiệt hại</Text>
              {hasReplacementAmount ? (
                <View style={[s.textInput, s.readonlyAmountBox]}>
                  <Text style={s.readonlyAmountText}>
                    {ticket.equipmentReplacementFlagged ? 'Đền bù thay thiết bị' : 'Giá đã chốt lúc chẩn đoán'}: {fmt(ticket.estimatedDamageAmount)}
                  </Text>
                </View>
              ) : null}
              {!hasReplacementAmount && (
              <TextInput
                style={[s.textInput, s.moneyInput, { marginTop: Spacing.sm }]}
                value={invoiceAmountText}
                onChangeText={t => setInvoiceAmountText(formatMoneyInput(t))}
                placeholder="Số tiền hoá đơn (VNĐ)"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numeric"
              />
              )}
              <TouchableOpacity
                style={[s.advanceBtn, { backgroundColor: '#DC2626', marginTop: Spacing.md }, charging && s.btnDisabled]}
                onPress={submitCharge}
                disabled={charging}
              >
                <Text style={s.advanceBtnText}>{charging ? 'Đang lập hoá đơn...' : '🧾 Lập hoá đơn & thu tiền'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Bước 2 (song song bước 1, không cần đúng thứ tự): đặt/đổi lịch bàn giao */}
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>🗓 Lịch bàn giao</Text>
            <Text style={s.descText}>
              {ticket.repairAppointmentAt ? formatDateTime(ticket.repairAppointmentAt) : 'Chưa đặt lịch'}
            </Text>
            {canSetHandoverDate && (
              <TouchableOpacity style={[s.reviewBtn, { marginTop: Spacing.sm, alignSelf: 'flex-start', paddingHorizontal: Spacing.lg }]} onPress={openRescheduleRepair}>
                <Text style={s.reviewBtnText}>{ticket.repairAppointmentAt ? '🗓 Đổi lịch bàn giao' : '🗓 Đặt lịch bàn giao'}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Bước 3: đang chờ khách thanh toán */}
          {hasUnpaidCharge && ticket.issuedInvoice && !ticket.companyAbsorbedFault && (
            <View style={[s.card, { borderColor: '#B45309', borderWidth: 1.5, backgroundColor: '#FFFBEB' }]}>
              <Text style={[s.cardSectionTitle, { color: '#B45309' }]}>⏳ Hoá đơn đã lập — khách thanh toán trong 3 ngày</Text>
              <Text style={[s.descText, { textAlign: 'center', fontWeight: '800', fontSize: 20, color: '#B45309' }]}>
                {fmt(ticket.issuedInvoice.grandTotal)}
              </Text>
              {!!ticket.issuedInvoice.payosQrCode && (
                <View style={{ alignItems: 'center', marginTop: Spacing.md }}>
                  <QRCode value={ticket.issuedInvoice.payosQrCode} size={200} />
                </View>
              )}
              <Text style={[s.pickHint, { textAlign: 'center', marginTop: Spacing.sm }]}>
                Đưa mã QR này cho khách quét bằng app Ngân hàng để thanh toán. Trạng thái tự cập nhật khi thanh
                toán xong — không cần bấm gì thêm.
              </Text>
            </View>
          )}

          {/* Bước 4: đã lập hoá đơn (hoặc công ty trả hộ) — chụp ảnh bàn giao rồi quét QR bàn giao */}
          {(hasIssuedCharge || ticket.companyAbsorbedFault) && (
            <View style={[s.card, { borderColor: Colors.success, borderWidth: 1.5 }]}>
              <Text style={s.cardSectionTitle}>
                {ticket.companyAbsorbedFault ? '✅ Công ty trả hộ — sẵn sàng bàn giao' : '✅ Đã lập hoá đơn — sẵn sàng bàn giao (phiếu đóng khi khách trả xong)'}
              </Text>
              {!ticket.repairAppointmentAt && (
                <Text style={s.pickHint}>Vui lòng đặt lịch bàn giao ở trên trước khi quét QR.</Text>
              )}
              <PhotoEvidenceRow
                type="after" urls={ticket.afterImages} photos={photos}
                onAdd={() => setPhotoMenuFor('after')}
                onView={(uris, i) => setLightbox({ uris, index: i })}
                onViewVideo={(url) => setVideoPreviewUrl(url)}
                onRemoveLocal={removeLocalPhoto}
                onRemoveServer={(url) => removeServerPhoto('AFTER', url)}
              />
              {realEquipmentId ? (
                <TouchableOpacity
                  style={[s.advanceBtn, { marginTop: Spacing.md }, (!readyToHandover || !hasAfterPhoto || handoverBusy) && s.btnDisabled]}
                  onPress={() => setHandoverScanOpen(true)}
                  disabled={!readyToHandover || !hasAfterPhoto || handoverBusy}
                >
                  <Text style={s.advanceBtnText}>
                    {handoverBusy ? 'Đang bàn giao...' : !hasAfterPhoto ? '📷 Quét QR bàn giao (cần ảnh AFTER)' : '📷 Quét QR bàn giao'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[s.advanceBtn, { marginTop: Spacing.md }, (!readyToHandover || !hasAfterPhoto || handoverBusy) && s.btnDisabled]}
                  onPress={doHandover}
                  disabled={!readyToHandover || !hasAfterPhoto || handoverBusy}
                >
                  <Text style={s.advanceBtnText}>{handoverBusy ? 'Đang bàn giao...' : '✅ Xác nhận đã bàn giao'}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <TouchableOpacity style={s.cancelBtn} onPress={handleCancel}>
            <Text style={s.cancelBtnText}>Hủy yêu cầu này</Text>
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>

        <EquipmentQrScanModal
          visible={handoverScanOpen}
          title="Quét QR bàn giao"
          onClose={() => setHandoverScanOpen(false)}
          onScan={handleHandoverScan}
        />
        <Modal visible={rescheduleRepairOpen} transparent animationType="fade" onRequestClose={() => setRescheduleRepairOpen(false)}>
          <Pressable style={s.photoMenuBackdrop} onPress={() => setRescheduleRepairOpen(false)}>
            <Pressable style={s.photoMenuCard} onPress={() => {}}>
              <Text style={s.photoMenuTitle}>{ticket.repairAppointmentAt ? 'Đổi lịch bàn giao' : 'Đặt lịch bàn giao'}</Text>
              <AppointmentSlotPicker
                propertyId={ticket.propertyId ? Number(ticket.propertyId) : undefined}
                slotMinutes={MAINTENANCE_REPAIR_SLOT_MINUTES}
                excludeRequestId={idNum}
                date={rescheduleRepairDate}
                onDateChange={setRescheduleRepairDate}
                time={rescheduleRepairTime}
                onTimeChange={setRescheduleRepairTime}
              />
              <TouchableOpacity
                style={[s.advanceBtn, { marginTop: Spacing.md }, (!rescheduleRepairDate || !rescheduleRepairTime || rescheduleRepairBusy) && s.btnDisabled]}
                onPress={confirmRescheduleRepair}
                disabled={!rescheduleRepairDate || !rescheduleRepairTime || rescheduleRepairBusy}
              >
                <Text style={s.advanceBtnText}>{rescheduleRepairBusy ? 'Đang lưu...' : '✅ Xác nhận lịch mới'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.photoMenuCancel} onPress={() => setRescheduleRepairOpen(false)}>
                <Text style={s.photoMenuCancelText}>Đóng</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        <CameraCaptureModal
          visible={cameraFor !== null}
          onCapture={(uri) => { const t = cameraFor; setCameraFor(null); if (t) void addLocalPhoto(t, { uri, type: 'image' }); }}
          onClose={() => setCameraFor(null)}
        />
        <Modal visible={photoMenuFor !== null} transparent animationType="fade" onRequestClose={() => setPhotoMenuFor(null)}>
          <Pressable style={s.photoMenuBackdrop} onPress={() => setPhotoMenuFor(null)}>
            <Pressable style={s.photoMenuCard} onPress={() => {}}>
              <Text style={s.photoMenuTitle}>Thêm ảnh/video</Text>
              <TouchableOpacity style={s.photoMenuOption} onPress={() => photoMenuFor && pickPhotoFromCamera(photoMenuFor, 'image')}>
                <Text style={s.photoMenuOptionText}>📷 Chụp ảnh</Text>
              </TouchableOpacity>
              {Platform.OS !== 'web' && (
                <TouchableOpacity style={s.photoMenuOption} onPress={() => photoMenuFor && pickPhotoFromCamera(photoMenuFor, 'video')}>
                  <Text style={s.photoMenuOptionText}>🎥 Quay video</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.photoMenuOption} onPress={() => photoMenuFor && pickPhotoFromLibrary(photoMenuFor)}>
                <Text style={s.photoMenuOptionText}>🖼️ Chọn từ thư viện</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.photoMenuCancel} onPress={() => setPhotoMenuFor(null)}>
                <Text style={s.photoMenuCancelText}>Đóng</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
        <PhotoLightbox state={lightbox} onChange={setLightbox} />
        <VideoPreviewModal visible={!!videoPreviewUrl} url={videoPreviewUrl} onClose={() => setVideoPreviewUrl(null)} />
      </SafeAreaView>
    );
  }

  // Phiếu đã đặt lịch sửa sau (Luồng A, chọn "Đặt lịch sửa sau" lúc duyệt) — chặn xử lý
  // tiếp cho tới khi quét QR bắt đầu sửa, hoặc xác nhận thường nếu không gắn thiết bị.
  if (ticket.status === 'repair_scheduled') {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Text style={s.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Bắt đầu sửa chữa</Text>
        </View>
        <View style={arrivalGateStyles.container}>
          <Text style={arrivalGateStyles.emoji}>🔧</Text>
          <Text style={arrivalGateStyles.title}>{ticket.title}</Text>
          <Text style={arrivalGateStyles.meta}>{ticket.ticketCode} · {ticket.roomName}</Text>
          <Text style={arrivalGateStyles.appointment}>
            Lịch sửa: {formatDateTime(ticket.repairAppointmentAt)}
          </Text>
          {realEquipmentId ? (
            <>
              <Text style={arrivalGateStyles.hint}>
                Quét đúng mã QR trên thiết bị{ticket.equipmentName ? ` "${ticket.equipmentName}"` : ''} để bắt
                đầu sửa chữa.
              </Text>
              <TouchableOpacity
                style={arrivalGateStyles.btn}
                onPress={() => setStartRepairScanOpen(true)}
                disabled={startRepairBusy}
              >
                <Text style={arrivalGateStyles.btnText}>📷 Quét QR bắt đầu sửa</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={arrivalGateStyles.hint}>
                Phiếu này không gắn thiết bị cụ thể — xác nhận để bắt đầu sửa chữa.
              </Text>
              <TouchableOpacity style={arrivalGateStyles.btn} onPress={doStartRepair} disabled={startRepairBusy}>
                <Text style={arrivalGateStyles.btnText}>
                  {startRepairBusy ? 'Đang xác nhận...' : '✅ Bắt đầu sửa'}
                </Text>
              </TouchableOpacity>
            </>
          )}
          <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg }}>
            {ticket.repairAppointmentAt && isBeforeAppointmentDay(ticket.repairAppointmentAt) && (
              <TouchableOpacity style={s.reviewBtn} onPress={openRescheduleRepair}>
                <Text style={s.reviewBtnText}>🗓 Đổi lịch sửa</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.reviewBtn} onPress={handleCancel}>
              <Text style={[s.reviewBtnText, { color: '#DC2626' }]}>✕ Huỷ yêu cầu</Text>
            </TouchableOpacity>
          </View>
        </View>
        <EquipmentQrScanModal
          visible={startRepairScanOpen}
          title="Quét QR bắt đầu sửa"
          onClose={() => setStartRepairScanOpen(false)}
          onScan={handleStartRepairScan}
        />
        <Modal visible={rescheduleRepairOpen} transparent animationType="fade" onRequestClose={() => setRescheduleRepairOpen(false)}>
          <Pressable style={s.photoMenuBackdrop} onPress={() => setRescheduleRepairOpen(false)}>
            <Pressable style={s.photoMenuCard} onPress={() => {}}>
              <Text style={s.photoMenuTitle}>Đổi lịch sửa</Text>
              <AppointmentSlotPicker
                propertyId={ticket.propertyId ? Number(ticket.propertyId) : undefined}
                slotMinutes={MAINTENANCE_REPAIR_SLOT_MINUTES}
                excludeRequestId={idNum}
                date={rescheduleRepairDate}
                onDateChange={setRescheduleRepairDate}
                time={rescheduleRepairTime}
                onTimeChange={setRescheduleRepairTime}
              />
              <TouchableOpacity
                style={[s.advanceBtn, { marginTop: Spacing.md }, (!rescheduleRepairDate || !rescheduleRepairTime || rescheduleRepairBusy) && s.btnDisabled]}
                onPress={confirmRescheduleRepair}
                disabled={!rescheduleRepairDate || !rescheduleRepairTime || rescheduleRepairBusy}
              >
                <Text style={s.advanceBtnText}>{rescheduleRepairBusy ? 'Đang lưu...' : '✅ Xác nhận lịch mới'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.photoMenuCancel} onPress={() => setRescheduleRepairOpen(false)}>
                <Text style={s.photoMenuCancelText}>Đóng</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    );
  }

  const selfRepairRemainingDays = daysLeft(ticket.selfRepairDeadline);
  const tenantSubmittedSelfRepair = (ticket.selfRepairImages?.length ?? 0) > 0;
  const billingMeta = ticket.billingHint && ticket.billingHint !== 'none'
    ? MAINTENANCE_BILLING_HINT_META[ticket.billingHint] : null;

  return (
    <SafeAreaView style={s.safe}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerCode}>{ticket.ticketCode}</Text>
          <Text style={s.headerTitle} numberOfLines={1}>{ticket.title}</Text>
        </View>
        <View style={[s.statusPill, { backgroundColor: cfg.bg }]}>
          <Text style={s.statusPillIcon}>{cfg.icon}</Text>
          <Text style={[s.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* ── Badges (category/priority ẩn khi chưa duyệt — manager gán lúc duyệt) ── */}
        <View style={s.badgesRow}>
          {priorityCfg && (
            <View style={[s.badge, { backgroundColor: priorityCfg.bg }]}>
              <Text style={[s.badgeText, { color: priorityCfg.color }]}>{priorityCfg.label}</Text>
            </View>
          )}
          {catCfg ? (
            <View style={s.catBadge}>
              <Text style={s.catBadgeText}>{catCfg.icon} {catCfg.label}</Text>
            </View>
          ) : (
            <View style={s.catBadge}>
              <Text style={s.catBadgeText}>🏷 Chưa phân loại</Text>
            </View>
          )}
          <View style={[s.badge, { backgroundColor: Colors.background }]}>
            <Text style={[s.badgeText, { color: Colors.textSecondary }]}>🏢 {ticket.propertyName}</Text>
          </View>
        </View>

        {/* ── Công ty trả hộ (companyAbsorbedFault, 16/09/2026 — immutable một khi true) ── */}
        {ticket.companyAbsorbedFault && (
          <View style={[s.replaceAlert, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
            <Text style={[s.replaceAlertText, { color: '#DC2626', fontWeight: '700' }]}>
              ⚠️ Khách từ chối trả — công ty đã trả hộ
            </Text>
            {!!ticket.companyAbsorbedNote && (
              <Text style={[s.replaceAlertText, { marginTop: 4 }]}>{ticket.companyAbsorbedNote}</Text>
            )}
          </View>
        )}

        {/* ── Info card ──────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardSectionTitle}>Thông tin yêu cầu</Text>
          {([
            { label: 'Tòa nhà',    val: ticket.propertyName },
            { label: 'Phòng',      val: ticket.roomName },
            { label: 'Khách thuê', val: ticket.tenantName },
            { label: 'SĐT',        val: ticket.tenantPhone, primary: true },
            { label: 'Ngày tạo',   val: ticket.createdAt },
          ] as const).map((row, i) => (
            <View key={i} style={[s.infoRow, i === 4 && { borderBottomWidth: 0 }]}>
              <Text style={s.infoLabel}>{row.label}</Text>
              <Text style={[s.infoVal, (row as any).primary && { color: Colors.primary }]}>{row.val}</Text>
            </View>
          ))}
          {ticket.equipmentName && (
            <View style={[s.infoRow, { borderBottomWidth: 0 }]}>
              <Text style={s.infoLabel}>Thiết bị</Text>
              <View style={{ alignItems: 'flex-end', flex: 1, marginLeft: Spacing.md }}>
                <Text style={s.infoVal}>{ticket.equipmentName}</Text>
                {!!repairCount && repairCount > 0 && (
                  <Text style={s.equipHistory}>
                    Đã sửa {repairCount} lần{lastRepairDate ? ` · Cuối: ${lastRepairDate.slice(0, 10)}` : ''}
                  </Text>
                )}
              </View>
            </View>
          )}

          <View style={s.sectionDivider} />
          <Text style={[s.cardSectionTitle, { marginTop: 0 }]}>Mô tả vấn đề</Text>
          <Text style={s.descText}>{ticket.description}</Text>

          <View style={s.sectionDivider} />
          <Text style={[s.cardSectionTitle, { marginTop: 0 }]}>Ảnh hiện trạng</Text>
          {/* Ảnh TRƯỚC sửa chữa là bằng chứng hiện trạng do TENANT chụp lúc tạo yêu cầu —
              manager không được thêm/sửa để tránh có ý đồ xấu (ngụy tạo hiện trạng). */}
          <PhotoEvidenceRow type="before" urls={beforeUrls} photos={photos} onAdd={() => {}} disabled
            onView={(uris, i) => setLightbox({ uris, index: i })}
            onViewVideo={(url) => setVideoPreviewUrl(url)} />
        </View>

        {/* ── Cảnh báo vòng đời thiết bị ───────────────────────────── */}
        {!!repairCount && repairCount >= EQUIPMENT_REPLACE_SUGGEST_COUNT && (
          <View style={s.replaceAlert}>
            <Text style={s.replaceAlertText}>
              ⚠️ Thiết bị này đã sửa {repairCount} lần — cân nhắc <Text style={{ fontWeight: '800' }}>thay mới</Text> thay vì sửa tiếp.
            </Text>
          </View>
        )}

        {/* ── Thông tin thiết bị (BE 21/09/2026: snapshot trên phiếu, xem được không cần quét QR) ── */}
        {!!ticket.equipment && (
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>🧰 Thiết bị trên phiếu</Text>
            <Text style={s.descText}>
              {ticket.equipment.equipmentName || ticket.equipment.catalogName || ticket.equipmentName || `#${ticket.equipment.id}`}
              {ticket.equipment.roomNumber ? ` · Phòng ${ticket.equipment.roomNumber}` : ''}
            </Text>
            <View style={s.sectionDivider} />
            <Text style={s.descText}>🔧 Đã bảo trì: {ticket.equipment.maintenanceCount ?? 0} lần</Text>
            {!!ticket.equipment.purchasedAt && (
              <Text style={s.descText}>🛒 Ngày mua / lắp: {ticket.equipment.purchasedAt.slice(0, 10)}</Text>
            )}
            {!!ticket.equipment.remainingWarrantyLabel && (
              <Text style={s.descText}>
                🛡 Bảo hành: {ticket.equipment.remainingWarrantyLabel}
                {ticket.equipment.warrantyMonths ? ` (thời hạn ${ticket.equipment.warrantyMonths} tháng)` : ''}
              </Text>
            )}
            {ticket.equipment.remainingDepreciationAmount != null && (
              <Text style={s.descText}>
                💰 Khấu hao / giá trị đền còn lại: {fmt(ticket.equipment.remainingDepreciationAmount)}
              </Text>
            )}
          </View>
        )}

        {/* ── Ảnh sau sửa chữa + Ghi chú (gộp khi đang có thể báo sửa xong) ── */}
        {canComplete && (
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>🖼 Ảnh sau sửa chữa</Text>
            <PhotoEvidenceRow
              type="after" urls={ticket.afterImages} photos={photos}
              onAdd={() => setPhotoMenuFor('after')}
              onView={(uris, i) => setLightbox({ uris, index: i })}
              onViewVideo={(url) => setVideoPreviewUrl(url)}
              onRemoveLocal={removeLocalPhoto}
              onRemoveServer={(url) => removeServerPhoto('AFTER', url)}
            />
            <View style={s.sectionDivider} />
            <Text style={[s.cardSectionTitle, { marginTop: 0 }]}>Ghi chú</Text>
            <TextInput
              style={[s.textInput, s.noteInput]}
              value={noteInput}
              onChangeText={setNoteInput}
              placeholder="Ghi chú..."
              placeholderTextColor={Colors.textMuted}
              multiline
            />
          </View>
        )}
        {!canComplete && (ticket.afterImages?.length ?? 0) > 0 && (
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>🖼 Ảnh sau sửa chữa</Text>
            <PhotoEvidenceRow type="after" urls={ticket.afterImages} photos={photos} onAdd={() => {}} disabled
              onView={(uris, i) => setLightbox({ uris, index: i })}
              onViewVideo={(url) => setVideoPreviewUrl(url)} />
            {!!ticket.resolutionNote && (
              <Text style={[s.descText, { marginTop: Spacing.sm }]}>{ticket.resolutionNote}</Text>
            )}
          </View>
        )}

        {/* ── Hoá đơn — chỉ cần ảnh + số tiền (KHÔNG áp dụng khi đã charge() trước khi
             sửa, 15/09/2026 — hoá đơn/số tiền đã chốt xong ở bước đó, hỏi lại là thu
             trùng, xem canComplete/handleComplete) ── */}
        {canComplete && !ticket.chargeInvoiceId && (
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>🧾 Hoá đơn sửa chữa</Text>
            <PhotoEvidenceRow
              type="invoice" urls={ticket.invoiceImages} photos={photos}
              onAdd={() => setPhotoMenuFor('invoice')}
              onView={(uris, i) => setLightbox({ uris, index: i })}
              onRemoveLocal={removeLocalPhoto}
              onRemoveServer={(url) => removeServerPhoto('INVOICE', url)}
              allowVideo={false}
            />
            {invoiceOcrLoading && (
              <View style={s.invoiceOcrRow}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={s.invoiceOcrText}>Đang đọc số tiền từ ảnh hoá đơn...</Text>
              </View>
            )}
            <TextInput
              style={[s.textInput, s.moneyInput, { marginTop: Spacing.sm }]}
              value={invoiceAmountText}
              onChangeText={t => setInvoiceAmountText(formatMoneyInput(t))}
              placeholder={needsReplacement ? 'Số tiền hoá đơn (VNĐ) — để trống nếu không có' : 'Số tiền hoá đơn (VNĐ)'}
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
            />
            {ticket.status === 'tenant_fault' && (
              <Text style={s.costHint}>
                {needsReplacement
                  ? 'Thiết bị thay mới — khách trả tiền đền bù đã tự tính (không cộng thêm chi phí khác).'
                  : 'Hoàn tất sẽ tự tạo hoá đơn thu khách theo số tiền trên.'}
              </Text>
            )}
          </View>
        )}

        {/* ── Ai chịu phí (chỉ Luồng A — Luồng B lỗi khách BE luôn tự thu) ── */}
        {canComplete && !ticket.chargeInvoiceId && ticket.status === 'in_repair' && (
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>Ai chịu phí sửa chữa?</Text>
            <View style={s.payChoiceRow}>
              <TouchableOpacity
                style={[s.payChoiceBtn, !chargeToTenant && s.payChoiceBtnActive]}
                onPress={() => setChargeToTenant(false)}
                activeOpacity={0.75}
              >
                <Text style={[s.payChoiceText, !chargeToTenant && s.payChoiceTextActive]}>🏢 Công ty trả</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.payChoiceBtn, chargeToTenant && s.payChoiceBtnActive]}
                onPress={() => setChargeToTenant(true)}
                activeOpacity={0.75}
              >
                <Text style={[s.payChoiceText, chargeToTenant && s.payChoiceTextActive]}>🧑 Khách trả</Text>
              </TouchableOpacity>
            </View>
            {chargeToTenant && (
              <Text style={s.costHint}>
                {needsReplacement
                  ? 'Thiết bị thay mới — khách trả tiền đền bù đã tự tính (không cộng thêm chi phí khác). có 3 ngày để thanh toán.'
                  : 'Hoàn tất sẽ tạo hoá đơn thu khách theo số tiền hoá đơn ở trên — khách có 3 ngày để thanh toán.'}
              </Text>
            )}
          </View>
        )}

        {/* Đã charge() trước rồi — quyết định "thay mới" đã chốt lúc diagnose()
            (equipmentReplacementFlagged, 16/09/2026 — KHÔNG dùng hasReplacementAmount vì
            estimatedDamageAmount giờ luôn có giá trị dù có thay hay không), chỉ hiện lại
            để manager biết, không hỏi lại. */}
        {canComplete && !!ticket.chargeInvoiceId && ticket.equipmentReplacementFlagged && (
          <View style={[s.card, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
            <Text style={[s.cardSectionTitle, { color: '#B45309' }]}>⚠️ Thiết bị thay mới — đã đền bù</Text>
            <Text style={s.descText}>
              Tiền đền bù thay thiết bị {fmt(ticket.estimatedDamageAmount)} (chốt lúc chẩn đoán, khách thanh toán trong 3 ngày).
              Bấm "Báo sửa xong" sẽ tự cập nhật lại thiết bị.
            </Text>
          </View>
        )}

        {/* ── Thiết bị hỏng hoàn toàn, phải thay mới ─────────────────── */}
        {canComplete && !ticket.chargeInvoiceId && !!realEquipmentId && (
          <View style={s.card}>
            <TouchableOpacity
              style={s.replaceToggleRow}
              onPress={() => setNeedsReplacement(v => !v)}
              activeOpacity={0.75}
            >
              <View style={[s.checkbox, needsReplacement && s.checkboxChecked]}>
                {needsReplacement && <Text style={s.checkboxMark}>✓</Text>}
              </View>
              <Text style={s.cardSectionTitle}>⚠️ Thiết bị hỏng hoàn toàn — cần thay mới</Text>
            </TouchableOpacity>
            {/* Số tiền đền bù chỉ có ý nghĩa khi THU PHÍ KHÁCH — công ty trả thì không
                cần biết số này, chỉ cần đánh dấu thay mới + lưu hoá đơn (07/09/2026). */}
            {needsReplacement && effectiveChargeToTenant && (
              <>
                {/* Luôn tự động — manager KHÔNG được thêm/xoá/sửa số này trong bất kỳ
                    trường hợp nào, nên hiển thị dạng đọc (không phải TextInput). */}
                <View style={[s.textInput, s.readonlyAmountBox, { marginTop: Spacing.sm }]}>
                  <Text style={s.readonlyAmountText}>
                    {autoDamageAmount ? fmt(autoDamageAmount) : '— Chưa có dữ liệu —'}
                  </Text>
                </View>
                <Text style={s.costHint}>
                  {autoDamageAmount
                    ? replacementUnderWarranty
                      ? 'Còn bảo hành — số tiền này là phần khấu hao còn lại của thiết bị, tự tính, không thể sửa.'
                      : 'Đã hết bảo hành — số tiền này là mức phạt cố định của thiết bị (penaltyFee), tự tính, không thể sửa.'
                    : 'Thiết bị chưa có dữ liệu giá/bảo hành, cũng chưa có mức phạt cố định — không thể thu phí khách cho thiết bị này (không được nhập tay).'}
                  {' '}Đã tự cập nhật lại thiết bị (thay mới) khi bấm "Báo sửa xong".
                </Text>
              </>
            )}
            {needsReplacement && !effectiveChargeToTenant && (
              <Text style={[s.costHint, { marginTop: Spacing.sm }]}>
                Công ty trả — không cần số tiền đền bù, chỉ lưu lại hoá đơn/số tiền hoá đơn (nếu có) và đánh dấu
                thiết bị đã được thay mới.
              </Text>
            )}
          </View>
        )}

        {!canComplete && (ticket.invoiceImages?.length ?? 0) > 0 && (
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>🧾 Hoá đơn sửa chữa</Text>
            <PhotoEvidenceRow type="invoice" urls={ticket.invoiceImages} photos={photos} onAdd={() => {}} disabled
              onView={(uris, i) => setLightbox({ uris, index: i })} allowVideo={false} />
            {ticket.invoiceAmount != null && (
              <Text style={[s.descText, s.moneyReadout]}>{fmt(ticket.invoiceAmount)}</Text>
            )}
          </View>
        )}

        {/* Lịch sử ảnh mọi vòng — chỉ có ý nghĩa tra cứu sau khi phiếu đã đóng. */}
        {ticket.status === 'closed' && <MaintenancePhotoHistory photos={ticket.photoHistory} />}

        {/* ── Lỗi do khách (TENANT_FAULT/PENDING_TENANT_REPAIR/OUTSTANDING_DAMAGE) ── */}
        {['tenant_fault', 'pending_tenant_repair', 'outstanding_damage'].includes(ticket.status) && (
          <View style={[s.card, { borderColor: '#DC2626', borderWidth: 1.5 }]}>
            <Text style={s.cardSectionTitle}>⚠️ Lỗi do khách</Text>
            <Text style={s.descText}>{ticket.faultReason || 'Không có ghi chú.'}</Text>
            {(ticket.faultEvidenceImages?.length ?? 0) > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: Spacing.sm }}>
                {ticket.faultEvidenceImages!.map((uri, i) => {
                  const isVideo = isVideoUrl(uri);
                  return (
                    <TouchableOpacity key={i}
                      onPress={() => isVideo
                        ? setVideoPreviewUrl(uri)
                        : setLightbox({ uris: ticket.faultEvidenceImages!, index: i })}>
                      {isVideo ? (
                        <View style={[s.rejectImage, s.videoRejectTile]}>
                          <Text style={{ fontSize: 22 }}>🎬</Text>
                          <Text style={s.videoRejectTileText}>▶ Xem video</Text>
                        </View>
                      ) : (
                        <Image source={{ uri }} style={s.rejectImage} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            {/* Phiếu gửi qua report-fault (luồng mới) — faultResolutionPath luôn null. */}
            {ticket.status === 'tenant_fault' && !ticket.faultResolutionPath && (
              !ticket.adminReviewedAt ? (
                <Text style={[s.descText, { marginTop: Spacing.sm, fontWeight: '600' }]}>
                  ⏳ Đang chờ admin duyệt trên web.
                </Text>
              ) : (
                <Text style={[s.descText, { marginTop: Spacing.sm, fontWeight: '600' }]}>
                  {ticket.adminApproved ? '✅ Admin đã duyệt' : '❌ Admin không duyệt'}
                  {ticket.adminReviewedByName ? ` — ${ticket.adminReviewedByName}` : ''}
                  {ticket.adminReviewNote ? `: ${ticket.adminReviewNote}` : ''}
                </Text>
              )
            )}
            {ticket.status === 'pending_tenant_repair' && (
              <Text style={[s.descText, { marginTop: Spacing.sm, fontWeight: '600' }]}>
                Hạn tự sửa: {ticket.selfRepairDeadline ? ticket.selfRepairDeadline
                  : '—'}{selfRepairRemainingDays != null
                  ? selfRepairRemainingDays >= 0 ? ` (còn ${selfRepairRemainingDays} ngày)` : ' (ĐÃ QUÁ HẠN)'
                  : ''}
                {ticket.estimatedDamageAmount != null ? ` · Ước tính: ${fmt(ticket.estimatedDamageAmount)}` : ''}
              </Text>
            )}
          </View>
        )}

        {/* ── Lập hoá đơn thiệt hại TRƯỚC khi sửa (charge, 15/09/2026) — chỉ cho
             TENANT_FAULT + faultResolutionPath=manager_repair chưa charge(); nhánh
             off-site (REPAIR_SCHEDULED) có màn riêng bên dưới, xem needsChargeBeforeRepair. ── */}
        {needsChargeBeforeRepair && (
          <View style={[s.card, { borderColor: '#DC2626', borderWidth: 1.5 }]}>
            <Text style={s.cardSectionTitle}>🧾 Lập hoá đơn thiệt hại (thu trước khi sửa)</Text>
            <Text style={s.pickHint}>
              Bắt buộc lập hoá đơn trước khi sửa. Khách thanh toán trong 3 ngày kể từ lúc lập hoá đơn — không chặn sửa;
              nếu khách chưa trả khi báo xong, phiếu chuyển "Chờ thanh toán" và tự đóng khi khách trả.
            </Text>
            {hasReplacementAmount ? (
              <View style={[s.textInput, s.readonlyAmountBox, { marginTop: Spacing.sm }]}>
                <Text style={s.readonlyAmountText}>
                  {ticket.equipmentReplacementFlagged ? 'Đền bù thay thiết bị' : 'Giá đã chốt lúc chẩn đoán'}: {fmt(ticket.estimatedDamageAmount)}
                </Text>
              </View>
            ) : null}
            {!hasReplacementAmount && (
            <TextInput
              style={[s.textInput, s.moneyInput, { marginTop: Spacing.sm }]}
              value={invoiceAmountText}
              onChangeText={t => setInvoiceAmountText(formatMoneyInput(t))}
              placeholder="Số tiền hoá đơn (VNĐ)"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
            />
            )}
            <TouchableOpacity
              style={[s.advanceBtn, { backgroundColor: '#DC2626', marginTop: Spacing.md }, charging && s.btnDisabled]}
              onPress={submitCharge}
              disabled={charging}
            >
              <Text style={s.advanceBtnText}>{charging ? 'Đang lập hoá đơn...' : '🧾 Lập hoá đơn & thu tiền'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Đã sửa/bàn giao xong, chờ khách trả tiền (BE 21/09/2026) ── */}
        {ticket.status === 'waiting_payment' && (
          <View style={[s.card, { borderColor: '#B45309', borderWidth: 1.5, backgroundColor: '#FFFBEB' }]}>
            <Text style={[s.cardSectionTitle, { color: '#B45309' }]}>💳 Đã sửa xong — chờ khách thanh toán</Text>
            <Text style={s.pickHint}>
              Việc sửa/bàn giao đã hoàn tất. Phiếu tự đóng ngay khi khách thanh toán hoá đơn (hạn 3 ngày kể từ lúc lập).
              Quá hạn, hoá đơn chuyển quá hạn và bị tính phí trễ như hoá đơn thường — phiếu vẫn giữ "Chờ thanh toán" tới khi khách trả.
            </Text>
          </View>
        )}

        {/* ── Đang chờ khách thanh toán hoá đơn thiệt hại (charge, 15/09/2026) ── */}
        {hasUnpaidCharge && ticket.issuedInvoice && (
          <View style={[s.card, { borderColor: '#B45309', borderWidth: 1.5, backgroundColor: '#FFFBEB' }]}>
            <Text style={[s.cardSectionTitle, { color: '#B45309' }]}>⏳ Hoá đơn đã lập — chờ khách thanh toán</Text>
            <Text style={[s.descText, { textAlign: 'center', fontWeight: '800', fontSize: 20, color: '#B45309' }]}>
              {fmt(ticket.issuedInvoice.grandTotal)}
            </Text>
            {!!ticket.issuedInvoice.payosQrCode && (
              <View style={{ alignItems: 'center', marginTop: Spacing.md }}>
                <QRCode value={ticket.issuedInvoice.payosQrCode} size={200} />
              </View>
            )}
            <Text style={[s.pickHint, { textAlign: 'center', marginTop: Spacing.sm }]}>
              Đưa mã QR này cho khách quét bằng app Ngân hàng để thanh toán. Trạng thái tự cập nhật khi thanh toán
              xong — không cần bấm gì thêm.
            </Text>
            {!!ticket.issuedInvoice.dueDate && (
              <Text style={[s.pickHint, { textAlign: 'center' }]}>Hạn thanh toán: {formatDateTime(ticket.issuedInvoice.dueDate)}</Text>
            )}
          </View>
        )}

        {/* ── Chi phí (billingHint) ────────────────────────────────── */}
        {billingMeta && (
          <View style={[s.card, { backgroundColor: billingMeta.bg, borderColor: billingMeta.color + '40', borderWidth: 1 }]}>
            <Text style={[s.cardSectionTitle, { color: billingMeta.color }]}>{billingMeta.label}</Text>
            {ticket.invoiceAmount != null && (
              <Text style={[s.descText, { color: billingMeta.color, fontWeight: '700', fontSize: 18 }]}>{fmt(ticket.invoiceAmount)}</Text>
            )}
            <Text style={[s.descText, { color: billingMeta.color }]}>{billingMeta.detail}</Text>
          </View>
        )}

        {/* ── 2 lựa chọn cấp cao nhất khi OPEN (16/09/2026, bỏ "Giao khách tự sửa") ── */}
        {/* ── Bắt đầu xử lý: quét QR thiết bị (BE 21/09/2026 — xem phiếu không cần quét) ── */}
        {arrivalGateActive && (
          <View style={[s.card, { borderColor: Colors.primary, borderWidth: 1.5 }]}>
            <Text style={s.cardSectionTitle}>📍 Bắt đầu xử lý tại hiện trường</Text>
            <Text style={s.pickHint}>
              Lịch hẹn: {formatDateTime(ticket.visitAppointmentAt)}
            </Text>
            {arrivalNeedsRescan && (
              <Text style={[s.pickHint, { color: '#B45309', fontWeight: '700', marginTop: Spacing.sm }]}>
                ⏱ Đã quá 30 phút kể từ lúc xác nhận có mặt mà chưa chẩn đoán xong — quét lại để tiếp tục.
              </Text>
            )}
            {realEquipmentId ? (
              <>
                <Text style={[s.pickHint, { marginTop: Spacing.sm }]}>
                  Quét đúng mã QR trên thiết bị{ticket.equipmentName ? ` "${ticket.equipmentName}"` : ''} để bắt
                  đầu xử lý. Bạn vẫn xem được toàn bộ thông tin phiếu ở trên và bên dưới.
                </Text>
                <TouchableOpacity
                  style={[s.advanceBtn, { marginTop: Spacing.md, marginBottom: 0 }]}
                  onPress={() => setArrivalScanOpen(true)}
                  disabled={arrivalBusy}
                >
                  <Text style={s.advanceBtnText}>📷 Quét QR bắt đầu xử lý</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[s.pickHint, { marginTop: Spacing.sm }]}>
                  Phiếu này không gắn thiết bị cụ thể — xác nhận đã có mặt tại hiện trường để bắt đầu xử lý.
                </Text>
                <TouchableOpacity
                  style={[s.advanceBtn, { marginTop: Spacing.md, marginBottom: 0 }]}
                  onPress={() => { void doConfirmArrival(); }}
                  disabled={arrivalBusy}
                >
                  <Text style={s.advanceBtnText}>{arrivalBusy ? 'Đang xác nhận...' : '✅ Xác nhận đã đến'}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
        <EquipmentQrScanModal
          visible={arrivalScanOpen}
          title="Quét QR bắt đầu xử lý"
          onClose={() => setArrivalScanOpen(false)}
          onScan={handleArrivalScan}
        />

        {ticket.status === 'open' && !arrivalGateActive && !diagnoseFormOpen && !inspectionFormOpen && (
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>Chọn hướng xử lý</Text>
            <Text style={s.pickHint}>
              Xác định thợ có sửa được ngay không, hay cần mang thiết bị đi kiểm tra thêm.
            </Text>
            <TouchableOpacity
              style={[s.advanceBtn, { marginTop: Spacing.md }]}
              onPress={() => openTopLevelForm('diagnose')}
              disabled={busy}
            >
              <Text style={s.advanceBtnText}>🔧 Sửa được ngay</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.advanceBtn, { backgroundColor: '#0369A1', marginBottom: 0 }]}
              onPress={() => openTopLevelForm('inspection')}
              disabled={busy}
            >
              <Text style={s.advanceBtnText}>📦 Mang đi kiểm tra thêm</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── "Sửa được ngay" → form Chẩn đoán & báo giá (diagnose(), case OPEN) ── */}
        {ticket.status === 'open' && diagnoseFormOpen && renderDiagnoseForm(false)}

        {/* ── "Mang đi kiểm tra thêm" (sendForInspection()) ─────────── */}
        {ticket.status === 'open' && inspectionFormOpen && (
          <View style={[s.card, { borderColor: '#0369A1', borderWidth: 1.5 }]}>
            <Text style={s.cardSectionTitle}>📦 Mang thiết bị đi kiểm tra thêm</Text>
            <Text style={s.pickHint}>
              Chưa xác định được nguyên nhân — phiếu chuyển "Đã đặt lịch sửa". Khi thợ báo kết quả, quay lại phiếu
              để nhập chẩn đoán & báo giá.
            </Text>
            <Text style={[s.cardSectionTitle, { marginTop: Spacing.md }]}>Dự kiến trả máy (tùy chọn)</Text>
            <AppointmentSlotPicker
              propertyId={ticket.propertyId ? Number(ticket.propertyId) : undefined}
              slotMinutes={MAINTENANCE_REPAIR_SLOT_MINUTES}
              excludeRequestId={idNum}
              date={inspectionDate}
              onDateChange={setInspectionDate}
              time={inspectionTime}
              onTimeChange={setInspectionTime}
            />
            <Text style={[s.cardSectionTitle, { marginTop: Spacing.md }]}>Ghi chú (tùy chọn)</Text>
            <TextInput
              style={[s.textInput, s.noteInput]}
              value={inspectionNote}
              onChangeText={setInspectionNote}
              placeholder="Ghi chú..."
              placeholderTextColor={Colors.textMuted}
              multiline
            />
            <TouchableOpacity
              style={[s.advanceBtn, { backgroundColor: '#0369A1', marginTop: Spacing.md }, sendingForInspection && s.btnDisabled]}
              onPress={submitSendForInspection}
              disabled={sendingForInspection}
            >
              <Text style={s.advanceBtnText}>{sendingForInspection ? 'Đang gửi...' : '📦 Xác nhận mang đi kiểm tra'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: Spacing.sm }} onPress={() => setInspectionFormOpen(false)}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.textSecondary }}>← Quay lại</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Note input — chỉ hiện riêng ở trạng thái không có ảnh AFTER đi kèm
             (open/pending_tenant_repair); khi canComplete thì Ghi chú đã gộp vào
             block "Ảnh sau sửa chữa" phía trên. ── */}
        {!isTerminal && !diagnoseFormOpen && !inspectionFormOpen && !canComplete && (
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>Ghi chú</Text>
            <TextInput
              style={[s.textInput, s.noteInput]}
              value={noteInput}
              onChangeText={setNoteInput}
              placeholder="Ghi chú..."
              placeholderTextColor={Colors.textMuted}
              multiline
            />
          </View>
        )}

        {/* ── Chờ khách tự sửa — chưa nộp ảnh ──────────────────────── */}
        {ticket.status === 'pending_tenant_repair' && !tenantSubmittedSelfRepair && (
          <View style={[s.card, { backgroundColor: Colors.infoLight }]}>
            <Text style={[s.descText, { color: Colors.info }]}>
              ⏳ Đang chờ khách tự sửa và nộp ảnh
              {selfRepairRemainingDays != null ? ` (còn ${Math.max(0, selfRepairRemainingDays)} ngày)` : ''}.
            </Text>
          </View>
        )}

        {/* ── Khách đã nộp ảnh tự sửa — verify-repair ──────────────── */}
        {ticket.status === 'pending_tenant_repair' && tenantSubmittedSelfRepair && (
          <View style={[s.card, { borderColor: '#F97316', borderWidth: 1.5 }]}>
            <Text style={s.cardSectionTitle}>🛠 Khách đã nộp ảnh tự sửa</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {(ticket.selfRepairImages ?? []).map((uri, i) => {
                const isVideo = isVideoUrl(uri);
                return (
                  <TouchableOpacity key={i}
                    onPress={() => isVideo
                      ? setVideoPreviewUrl(uri)
                      : setLightbox({ uris: ticket.selfRepairImages ?? [], index: i })}>
                    {isVideo ? (
                      <View style={[s.rejectImage, s.videoRejectTile]}>
                        <Text style={{ fontSize: 22 }}>🎬</Text>
                        <Text style={s.videoRejectTileText}>▶ Xem video</Text>
                      </View>
                    ) : (
                      <Image source={{ uri }} style={s.rejectImage} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TextInput
              style={[s.textInput, { marginTop: Spacing.sm }]}
              value={verifyNote}
              onChangeText={setVerifyNote}
              placeholder="Ghi chú (không bắt buộc)..."
              placeholderTextColor={Colors.textMuted}
              multiline
            />
            <View style={[s.reviewRow, { marginTop: Spacing.sm }]}>
              <TouchableOpacity
                style={[s.reviewBtn, { backgroundColor: Colors.success, borderColor: Colors.success }]}
                onPress={() => submitVerifyRepair(true)}
                disabled={verifying}
              >
                <Text style={[s.reviewBtnText, { color: Colors.white }]}>✅ Đạt — đóng phiếu</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.reviewBtn, { backgroundColor: '#FEF2F2', borderColor: '#DC2626' }]}
                onPress={() => submitVerifyRepair(false)}
                disabled={verifying}
              >
                <Text style={[s.reviewBtnText, { color: '#DC2626' }]}>❌ Không đạt</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Chờ checkout trừ cọc ──────────────────────────────────── */}
        {ticket.status === 'outstanding_damage' && (
          <View style={[s.card, { backgroundColor: '#FEF2F2' }]}>
            <Text style={[s.descText, { color: '#B91C1C' }]}>
              💸 Đã ghi nhận thiệt hại — sẽ được trừ vào tiền cọc khi khách trả phòng.
            </Text>
          </View>
        )}

        {/* ── Timeline ────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardSectionTitle}>Tiến trình xử lý</Text>
          <MaintenanceProgressTimeline timeline={ticket.timeline} currentStatus={ticket.status} />
        </View>

        {/* ── Actions theo status ─────────────────────────────────── */}
        {/* Nút chọn hướng xử lý khi OPEN đã chuyển lên khối "Chọn hướng xử lý" phía trên
            (16/09/2026, xem openTopLevelForm) — ở đây chỉ còn action của các status khác. */}
        {canComplete && (
          <TouchableOpacity
            style={[s.advanceBtn, (!hasAfterPhoto || (!ticket.chargeInvoiceId && !hasInvoicePhoto)) && s.btnDisabled]}
            onPress={handleComplete}
            disabled={busy}
          >
            <Text style={s.advanceBtnText}>
              🛠 Báo sửa xong{
                !hasAfterPhoto ? ' (cần ảnh AFTER)'
                  : (!ticket.chargeInvoiceId && !hasInvoicePhoto) ? ' (cần ảnh hoá đơn)' : ''
              }
            </Text>
          </TouchableOpacity>
        )}

        {/* Admin đã duyệt/không duyệt "Lỗi do khách" là bước cuối app theo dõi (xem
            MaintenanceFaultReview bên web) — status vẫn giữ nguyên 'tenant_fault' nên
            KHÔNG rơi vào isTerminal, phải chặn riêng bằng adminReviewedAt kẻo hiện nút
            Hủy trên một phiếu admin đã kết luận xong. */}
        {!isTerminal && !ticket.adminReviewedAt && (
          <TouchableOpacity style={s.cancelBtn} onPress={handleCancel}>
            <Text style={s.cancelBtnText}>Hủy yêu cầu này</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <CameraCaptureModal
        visible={cameraFor !== null}
        onCapture={(uri) => { const t = cameraFor; setCameraFor(null); if (t) void addLocalPhoto(t, { uri, type: 'image' }); }}
        onClose={() => setCameraFor(null)}
      />

      {/* Menu "Thêm ảnh" — thay Alert.alert (no-op trên web) bằng modal trong UI. */}
      <Modal visible={photoMenuFor !== null} transparent animationType="fade" onRequestClose={() => setPhotoMenuFor(null)}>
        <Pressable style={s.photoMenuBackdrop} onPress={() => setPhotoMenuFor(null)}>
          <Pressable style={s.photoMenuCard} onPress={() => {}}>
            <Text style={s.photoMenuTitle}>{photoMenuFor === 'invoice' ? 'Thêm ảnh' : 'Thêm ảnh/video'}</Text>
            <TouchableOpacity style={s.photoMenuOption} onPress={() => photoMenuFor && pickPhotoFromCamera(photoMenuFor, 'image')}>
              <Text style={s.photoMenuOptionText}>📷 Chụp ảnh</Text>
            </TouchableOpacity>
            {photoMenuFor !== 'invoice' && Platform.OS !== 'web' && (
              <TouchableOpacity style={s.photoMenuOption} onPress={() => photoMenuFor && pickPhotoFromCamera(photoMenuFor, 'video')}>
                <Text style={s.photoMenuOptionText}>🎥 Quay video</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.photoMenuOption} onPress={() => photoMenuFor && pickPhotoFromLibrary(photoMenuFor)}>
              <Text style={s.photoMenuOptionText}>🖼️ Chọn từ thư viện</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.photoMenuCancel} onPress={() => setPhotoMenuFor(null)}>
              <Text style={s.photoMenuCancelText}>Đóng</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      <PhotoLightbox state={lightbox} onChange={setLightbox} />
      <VideoPreviewModal visible={!!videoPreviewUrl} url={videoPreviewUrl} onClose={() => setVideoPreviewUrl(null)} />
    </SafeAreaView>
  );
};

const arrivalGateStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emoji: { fontSize: 48, marginBottom: Spacing.base },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  meta: { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  appointment: { fontSize: 15, fontWeight: '700', color: Colors.primary, marginTop: Spacing.md },
  hint: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20, marginTop: Spacing.lg, marginBottom: Spacing.xl },
  btn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, ...Shadow.sm },
  btnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  content:{ paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: 40 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: Spacing.sm,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderColor: Colors.divider,
  },
  backBtn:        { padding: 4 },
  backIcon:       { fontSize: 30, color: Colors.primary, fontWeight: '300', lineHeight: 34 },
  headerCode:     { fontSize: 11, fontWeight: '700', color: Colors.primary, letterSpacing: 0.5 },
  headerTitle:    { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  statusPill:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  statusPillIcon: { fontSize: 11 },
  statusPillText: { fontSize: 10, fontWeight: '700' },

  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  badge:     { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  badgeText: { fontSize: 11, fontWeight: '700' },
  catBadge:  { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  catBadgeText: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary },

  card:            { backgroundColor: Colors.white, borderRadius: BorderRadius.xl, padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm, borderWidth: 1, borderColor: Colors.border },
  cardSectionTitle:{ fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm },

  infoRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderColor: Colors.divider },
  infoLabel:   { fontSize: 13, color: Colors.textSecondary },
  infoVal:     { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, textAlign: 'right', flex: 1, marginLeft: Spacing.md },
  equipHistory:{ fontSize: 10, color: Colors.textMuted, marginTop: 2, fontStyle: 'italic' },

  descText: { fontSize: 14, color: Colors.textPrimary, lineHeight: 22 },
  sectionDivider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.md },

  textInput: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.md,
    padding: Spacing.md, fontSize: 14, color: Colors.textPrimary,
  },
  noteInput:  { minHeight: 80, textAlignVertical: 'top' },
  moneyInput: { textAlign: 'right', fontWeight: '700' },
  moneyReadout: { textAlign: 'right', fontWeight: '800', fontSize: 18, marginTop: Spacing.sm },
  // Loading nhỏ khi đang OCR ảnh hoá đơn (best-effort, xem runInvoiceOcr).
  invoiceOcrRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm, gap: 6 },
  invoiceOcrText: { fontSize: 12, color: Colors.textMuted },
  // Số tiền đền bù tự động — hộp hiển thị, KHÔNG phải ô nhập (manager không được sửa).
  readonlyAmountBox: { backgroundColor: Colors.background, justifyContent: 'center' },
  readonlyAmountText: { textAlign: 'right', fontWeight: '700', fontSize: 14, color: Colors.textPrimary },

  replaceAlert:     { backgroundColor: '#FEF2F2', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: '#FECACA' },
  replaceAlertText: { fontSize: 13, color: '#B91C1C', lineHeight: 19 },

  rejectImage: { width: 110, height: 110, borderRadius: BorderRadius.md, marginRight: Spacing.sm, backgroundColor: Colors.divider },
  videoRejectTile: { backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center', gap: 4 },
  videoRejectTileText: { color: Colors.white, fontSize: 11, fontWeight: '700' },

  pickHint: { fontSize: 11, color: Colors.textMuted, marginTop: Spacing.sm },

  dropdownBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 12, backgroundColor: Colors.white,
  },
  dropdownBtnText:        { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  dropdownBtnPlaceholder: { color: Colors.textMuted, fontWeight: '400' },
  dropdownChevron:        { fontSize: 11, color: Colors.textMuted },
  dropdownList: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.md,
    marginTop: Spacing.xs, overflow: 'hidden', backgroundColor: Colors.white,
  },
  dropdownItem: {
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderColor: Colors.divider,
  },
  dropdownItemActive:     { backgroundColor: Colors.primaryBg },
  dropdownItemText:       { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  dropdownItemTextActive: { color: Colors.primary, fontWeight: '700' },

  reviewRow:     { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  reviewBtn:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white },
  reviewBtnText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },

  costHint: { fontSize: 12, color: Colors.textMuted, marginTop: Spacing.sm, lineHeight: 17 },

  payChoiceRow: { flexDirection: 'row', gap: Spacing.sm },
  payChoiceBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: BorderRadius.md,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white,
  },
  payChoiceBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  payChoiceText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  payChoiceTextActive: { color: Colors.primary, fontWeight: '700' },

  replaceToggleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  checkboxMark: { color: Colors.white, fontSize: 13, fontWeight: '800' },

  advanceBtn:    { backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, paddingVertical: 14, alignItems: 'center', marginBottom: Spacing.md, ...Shadow.md },
  advanceBtnText:{ fontSize: 15, fontWeight: '700', color: Colors.white },
  btnDisabled:   { opacity: 0.55 },
  cancelBtn:     { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelBtnText: { fontSize: 13, fontWeight: '600', color: Colors.error },

  photoMenuBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  photoMenuCard: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.lg, paddingBottom: Spacing.xl },
  photoMenuTitle: { fontSize: 14, fontWeight: '700', color: Colors.textMuted, marginBottom: Spacing.md, textAlign: 'center' },
  photoMenuOption: { paddingVertical: Spacing.md, borderRadius: BorderRadius.md, alignItems: 'center', backgroundColor: Colors.background, marginBottom: Spacing.sm },
  photoMenuOptionText: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  photoMenuCancel: { paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.xs },
  photoMenuCancelText: { fontSize: 14, fontWeight: '600', color: Colors.error },
});
