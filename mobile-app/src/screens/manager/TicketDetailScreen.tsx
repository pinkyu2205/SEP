import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Image, Platform, Modal, Pressable, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import {
  useTickets, maintenanceStore, MaintenanceTicket,
  TicketStatus, TicketCategory, TicketPriority, PhotoEvidence, TimelineEntry,
} from '@/store/maintenanceStore';
import type { MaintenanceReqCategory, MaintenanceReqPriority } from '@/types';
import { realMaintenanceService } from '@/services/shared/maintenanceService';
import { dtoToTicket } from '@/services/shared/maintenanceMappers';
import { realEquipmentService } from '@/services/manager/equipmentService';
import { CameraCaptureModal } from '../../components/common/CameraCaptureModal';
import { MaintenanceProgressTimeline } from '../../components/common/MaintenanceProgressTimeline';
import { MaintenancePhotoHistory } from '../../components/common/MaintenancePhotoHistory';
import { PhotoLightbox, type LightboxState } from '../../components/common/PhotoLightbox';
import { EquipmentQrScanModal } from '../../components/common/EquipmentQrScanModal';
import { AppointmentSlotPicker } from '../../components/common/AppointmentSlotPicker';
import { useMaintenanceRealtime } from '@/hooks/useBillingRealtime';
import { showAlert, formatDateTime } from '@/utils';
import { serverNow, todayIso } from '@/utils/serverTime';
import { extractEquipmentIdFromQr } from '@/utils/equipmentQr';
import { toLocalDateTime, toApiDateTime, isBeforeAppointmentDay } from '@/utils/maintenanceAppointment';
import {
  MAINTENANCE_STATUS_META, StatusMeta, MAINTENANCE_BILLING_HINT_META,
  EQUIPMENT_REPLACE_SUGGEST_COUNT, MAINTENANCE_REPAIR_SLOT_MINUTES,
} from '@/constants/maintenance';

// ── Config ──────────────────────────────────────────────────────────────────

/**
 * TẠM ẨN (05/09/2026) — Luồng B (lỗi do khách) đang bị chặn ở khâu report-fault/
 * admin-review chưa hỗ trợ đặt lịch sửa như Luồng A (xem
 * docs/maintenance-appointment-implementation-spec.md). Ẩn nút để manager không tạo
 * thêm phiếu TENANT_FAULT trong lúc chờ xin BE mở rộng report-fault/admin-review.
 * Bật lại: đổi thành true (đồng thời hiện lại nút "Xem xét & duyệt" phía
 * frontend-web/src/pages/admin/MaintenanceFaultReview.tsx).
 */
const TENANT_FAULT_FLOW_ENABLED = false;

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
  /** ảnh đã có trên server (URL) */
  urls?: string[];
  /** ảnh local vừa chụp/chọn (chưa hoặc đang upload) */
  photos: PhotoEvidence[];
  onAdd: () => void;
  disabled?: boolean;
  /** Bấm vào 1 ảnh (server hoặc local) để xem toàn màn hình. */
  onView?: (uris: string[], index: number) => void;
  /**
   * Xoá 1 ảnh LOCAL (chưa/đang upload hoặc upload lỗi) để chụp/chọn lại — CHỈ áp dụng
   * ảnh local, KHÔNG áp dụng ảnh đã lên server (`urls`): BE chưa có endpoint xoá ảnh đã
   * lưu (chỉ có POST /{id}/photos, không có DELETE), nên với ảnh đã confirm phải nhờ
   * admin/BE xử lý ngoài luồng — không giả vờ xoá được ở đây.
   */
  onRemoveLocal?: (localId: string) => void;
}> = ({ type, urls = [], photos, onAdd, disabled, onView, onRemoveLocal }) => {
  const filtered = photos.filter(p => p.type === type);
  const meta     = PHOTO_KIND_META[type];
  const isEmpty  = urls.length === 0 && filtered.length === 0;
  const allUris  = [...urls, ...filtered.map(p => p.uri).filter((u): u is string => !!u)];
  return (
    <View style={phs.container}>
      <View style={phs.header}>
        <Text style={phs.label}>{meta.label}</Text>
        {!disabled && (
          <TouchableOpacity style={[phs.addBtn, { borderColor: meta.color }]} onPress={onAdd}>
            <Text style={[phs.addBtnText, { color: meta.color }]}>+ Thêm ảnh</Text>
          </TouchableOpacity>
        )}
      </View>
      {isEmpty ? (
        <View style={[phs.emptyBox, { borderColor: meta.color + '40' }]}>
          <Text style={phs.emptyIcon}>{meta.icon}</Text>
          <Text style={phs.emptyText}>Chưa có ảnh</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={phs.scrollRow}>
          {urls.map((uri, i) => (
            <TouchableOpacity key={`url-${i}`} activeOpacity={0.85}
              style={[phs.photoCard, { borderColor: meta.color + '50' }]}
              onPress={() => onView?.(allUris, i)}
            >
              <Image source={{ uri }} style={[phs.photoPlaceholder, { width: '100%' }]} />
            </TouchableOpacity>
          ))}
          {filtered.map((photo, i) => (
            <TouchableOpacity key={photo.id} activeOpacity={0.85}
              style={[phs.photoCard, { borderColor: meta.color + '50' }]}
              // Đừng cộng urls.length + i làm chỉ số: nếu có ảnh local nào trước đó
              // thiếu uri (đang chờ đọc file) thì allUris ngắn hơn filtered, cộng dồn
              // sẽ lệch chỉ số/mở nhầm ảnh — tìm đúng vị trí thật bằng indexOf.
              onPress={() => photo.uri && onView?.(allUris, allUris.indexOf(photo.uri))}
            >
              {photo.uri ? (
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
          ))}
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

  const [noteInput, setNoteInput] = useState('');
  const [photos,    setPhotos]    = useState<PhotoEvidence[]>(ticket?.photos || []);
  const [busy,      setBusy]      = useState(false);
  // Camera in-app cho web (launchCameraAsync trên web chỉ mở file picker)
  const [cameraFor, setCameraFor] = useState<PhotoKind | null>(null);
  const [photoMenuFor, setPhotoMenuFor] = useState<PhotoKind | null>(null);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  // Manager BẮT BUỘC gán category khi duyệt (Luồng A), priority tùy chọn. Tenant có thể
  // đã tự chọn category lúc tạo (báo hỏng không gắn thiết bị) — prefill sẵn, đổi được.
  const [approveCategory, setApproveCategory] = useState<TicketCategory | null>(ticket?.category ?? null);
  // Mặc định "Thấp" thay vì để trống — manager vẫn đổi được trước khi duyệt, chỉ đỡ
  // phải bấm dropdown cho trường hợp phổ biến nhất (đa số ticket không khẩn cấp).
  const [approvePriority, setApprovePriority] = useState<TicketPriority | null>(ticket?.priority ?? 'low');
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false);
  // Duyệt (Luồng A) — sửa ngay (mặc định, giữ đúng hành vi cũ) hoặc đặt lịch sửa sau
  // (05/09/2026, chỉ Luồng A — Luồng B/report-fault chưa có repairAppointmentAt, xem
  // docs/maintenance-appointment-implementation-spec.md).
  const [approveRepairLater, setApproveRepairLater] = useState(false);
  const [approveRepairDate, setApproveRepairDate] = useState('');
  const [approveRepairTime, setApproveRepairTime] = useState<string | null>(null);
  // Ticket tạo qua QR/chọn thiết bị luôn gắn equipmentId nhưng BE để category=null (tenant
  // không được chọn category khi có equipment). 90%+ ticket có equipmentId là hư trang
  // thiết bị, nên tự gợi ý sẵn 'appliance' — vẫn đổi được trước khi duyệt.
  useEffect(() => {
    if (!realTicket || realTicket.category || realEquipmentId == null) return;
    setApproveCategory(c => c ?? 'appliance');
  }, [realTicket, realEquipmentId]);

  // ── Luồng B: report-fault (lỗi do khách) — 01/09/2026: chỉ mô tả + ảnh bằng
  // chứng, không còn chọn "Hướng xử lý" — gửi thẳng cho admin duyệt trên web.
  const [faultFormOpen,   setFaultFormOpen]   = useState(false);
  const [faultReason,     setFaultReason]     = useState('');
  const [rejectingFault, setRejectingFault] = useState(false);

  const submitRejectFault = async () => {
    if (rejectingFault) return;
    const reason = faultReason.trim();
    if (!reason) { showAlert('Thiếu lý do', 'Vui lòng mô tả lỗi do khách gây ra.'); return; }
    const evidenceUrls = ticket?.faultEvidenceImages ?? [];
    if (evidenceUrls.length === 0) { showAlert('Thiếu ảnh', 'Cần ít nhất 1 ảnh bằng chứng lỗi.'); return; }
    try {
      setRejectingFault(true);
      await realMaintenanceService.reportFault(idNum, { faultReason: reason, faultEvidenceImages: evidenceUrls });
      await refreshReal();
      setFaultFormOpen(false); setFaultReason('');
      showAlert('📨 Đã gửi admin duyệt', 'Quản trị viên sẽ xem xét mô tả và ảnh bằng chứng, việc sửa/thu tiền tiếp theo xử lý ngoài hệ thống.');
    } catch (e: any) { showAlert('Lỗi', apiErrMsg(e, 'Không thể gửi báo cáo. Vui lòng thử lại.')); }
    finally { setRejectingFault(false); }
  };

  // ── Complete (Luồng A / Luồng B nhánh manager sửa hộ) ───────────────
  // Chỉ còn ảnh + số tiền trên UI — vendor/date/mô tả tự điền ngầm (BE vẫn bắt buộc
  // non-blank) từ ô "Ghi chú" dùng chung, không hỏi lại manager.
  const [invoiceAmountText, setInvoiceAmountText] = useState('');

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

  // ── Gate quét QR bắt đầu sửa (REPAIR_SCHEDULED → start-repair) — cùng cơ chế, chỉ
  // áp dụng nhánh "đặt lịch sửa sau" (Luồng A). Đổi lịch sửa cũng đặt ở đây, manager-only.
  const [startRepairScanOpen, setStartRepairScanOpen] = useState(false);
  const [startRepairBusy, setStartRepairBusy] = useState(false);
  const [rescheduleRepairOpen, setRescheduleRepairOpen] = useState(false);
  const [rescheduleRepairDate, setRescheduleRepairDate] = useState('');
  const [rescheduleRepairTime, setRescheduleRepairTime] = useState<string | null>(null);
  const [rescheduleRepairBusy, setRescheduleRepairBusy] = useState(false);

  const doConfirmArrival = async () => {
    if (arrivalBusy) return;
    try {
      setArrivalBusy(true);
      await realMaintenanceService.confirmArrival(idNum);
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
    void doConfirmArrival();
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

  // Phiếu OPEN có hẹn xem nhưng CHƯA xác nhận có mặt → chặn hẳn màn xử lý, thay bằng
  // gate quét QR (phiếu cũ visitAppointmentAt=null bỏ qua, khớp bypass phía BE).
  if (ticket.status === 'open' && ticket.visitAppointmentAt && !ticket.visitArrivalConfirmedAt) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <Text style={s.backIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={s.headerTitle}>Xác nhận có mặt</Text>
        </View>
        <View style={arrivalGateStyles.container}>
          <Text style={arrivalGateStyles.emoji}>📍</Text>
          <Text style={arrivalGateStyles.title}>{ticket.title}</Text>
          <Text style={arrivalGateStyles.meta}>{ticket.ticketCode} · {ticket.roomName}</Text>
          <Text style={arrivalGateStyles.appointment}>
            Lịch hẹn: {formatDateTime(ticket.visitAppointmentAt)}
          </Text>
          {realEquipmentId ? (
            <>
              <Text style={arrivalGateStyles.hint}>
                Quét đúng mã QR trên thiết bị{ticket.equipmentName ? ` "${ticket.equipmentName}"` : ''} để xác
                nhận đã có mặt tại hiện trường trước khi xử lý phiếu này.
              </Text>
              <TouchableOpacity
                style={arrivalGateStyles.btn}
                onPress={() => setArrivalScanOpen(true)}
                disabled={arrivalBusy}
              >
                <Text style={arrivalGateStyles.btnText}>📷 Quét QR xác nhận có mặt</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={arrivalGateStyles.hint}>
                Phiếu này không gắn thiết bị cụ thể — xác nhận đã có mặt tại hiện trường để tiếp tục xử lý.
              </Text>
              <TouchableOpacity style={arrivalGateStyles.btn} onPress={doConfirmArrival} disabled={arrivalBusy}>
                <Text style={arrivalGateStyles.btnText}>
                  {arrivalBusy ? 'Đang xác nhận...' : '✅ Xác nhận đã đến'}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        <EquipmentQrScanModal
          visible={arrivalScanOpen}
          title="Quét QR xác nhận có mặt"
          onClose={() => setArrivalScanOpen(false)}
          onScan={handleArrivalScan}
        />
      </SafeAreaView>
    );
  }

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
  const hasFaultEvidence = (ticket.faultEvidenceImages?.length ?? 0) > 0 || photos.some(p => p.type === 'fault_evidence');
  const beforeUrls = ticket.beforeImages?.length ? ticket.beforeImages : ticket.images;
  const canComplete = ['in_repair', 'tenant_fault'].includes(ticket.status)
    && (ticket.status !== 'tenant_fault' || ticket.faultResolutionPath === 'manager_repair');

  // Cập nhật store + append timeline (đường mock).
  const patchStore = (updates: Partial<MaintenanceTicket>, entry: TimelineEntry) =>
    maintenanceStore.updateTicket(ticket.id, {
      ...updates,
      photos,
      timeline: [...ticket.timeline, entry],
      updatedAt: today(),
    });

  const addLocalPhoto = async (type: PhotoKind, uri: string) => {
    const localId = `ph-${Date.now()}`;
    setPhotos(prev => [...prev, { id: localId, type, uri, capturedAt: now() }]);
    if (isReal) {
      const beType = type === 'before' ? 'BEFORE' : type === 'after' ? 'AFTER'
        : type === 'invoice' ? 'INVOICE' : 'FAULT_EVIDENCE';
      try {
        await realMaintenanceService.uploadPhotos(idNum, [uri], beType);
        await refreshReal();
        // refreshReal() vừa nạp lại snapshot ảnh từ BE — đã chứa ảnh vừa upload, bỏ bản
        // optimistic cục bộ để tránh hiện trùng ảnh.
        setPhotos(prev => prev.filter(p => p.id !== localId));
      } catch (e: any) {
        showAlert('Lỗi tải ảnh', apiErrMsg(e, 'Không tải được ảnh lên máy chủ. Ảnh vẫn được lưu tạm trên máy.'));
      }
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

  // Menu "Thêm ảnh" trong UI (không dùng Alert.alert 3 nút) — Alert.alert là no-op
  // trên react-native-web nên menu Chụp ảnh/Thư viện trước đây không bấm được trên web.
  const pickPhotoFromCamera = async (type: PhotoKind) => {
    setPhotoMenuFor(null);
    if (Platform.OS === 'web') { setCameraFor(type); return; }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') { showAlert('Lỗi', 'Cần quyền camera.'); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!r.canceled && r.assets[0]) await addLocalPhoto(type, r.assets[0].uri);
  };
  const pickPhotoFromLibrary = async (type: PhotoKind) => {
    setPhotoMenuFor(null);
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, allowsMultipleSelection: true, selectionLimit: 5 });
    if (!r.canceled) for (const a of r.assets) await addLocalPhoto(type, a.uri);
  };

  // ── Actions theo flow mới ──────────────────────────────────────────

  /** OPEN → IN_REPAIR: manager duyệt (Luồng A) — BẮT BUỘC chọn category. */
  const handleApprove = async () => {
    if (busy) return;
    if (!approveCategory) {
      showAlert('Chưa phân loại', 'Vui lòng chọn danh mục sự cố trước khi duyệt.');
      return;
    }
    let repairAppointmentAt: string | undefined;
    if (approveRepairLater) {
      const dt = approveRepairTime ? toLocalDateTime(approveRepairDate, approveRepairTime) : null;
      if (!dt) { showAlert('Thiếu lịch sửa', 'Vui lòng chọn ngày và giờ hẹn sửa.'); return; }
      if (dt.getTime() <= serverNow().getTime()) {
        showAlert('Lịch sửa không hợp lệ', 'Thời điểm hẹn phải ở tương lai. Vui lòng chọn lại giờ khác.');
        return;
      }
      repairAppointmentAt = toApiDateTime(dt);
    }
    if (isReal) {
      try {
        setBusy(true);
        await realMaintenanceService.approve(idNum, {
          category: approveCategory.toUpperCase() as MaintenanceReqCategory,
          priority: approvePriority ? (approvePriority.toUpperCase() as MaintenanceReqPriority) : undefined,
          repairAppointmentAt,
        });
        await refreshReal();
        showAlert(
          '✅ Đã duyệt',
          repairAppointmentAt
            ? 'Đã đặt lịch sửa — quét QR bắt đầu sửa đúng ngày hẹn.'
            : 'Yêu cầu đã được duyệt — sửa xong thì bấm "Báo sửa xong".',
        );
      } catch (e: any) { showAlert('Lỗi', apiErrMsg(e, 'Không thể duyệt yêu cầu. Vui lòng thử lại.')); }
      finally { setBusy(false); }
      return;
    }
    patchStore(
      { status: 'in_repair', category: approveCategory, priority: approvePriority ?? undefined },
      mkEntry('in_repair', noteInput.trim() || `Manager duyệt yêu cầu [${approveCategory.toUpperCase()}]`),
    );
    setNoteInput('');
  };

  /** IN_REPAIR/TENANT_FAULT → CLOSED: báo sửa xong (bắt buộc AFTER + INVOICE + thông tin hoá đơn). */
  const handleComplete = async () => {
    if (busy) return;
    if (!hasAfterPhoto) { showAlert('Thiếu ảnh', 'Cần ít nhất 1 ảnh SAU sửa chữa.'); return; }
    if (!hasInvoicePhoto) { showAlert('Thiếu ảnh', 'Cần ít nhất 1 ảnh hoá đơn.'); return; }
    const amount = Number(invoiceAmountText.replace(/[^0-9]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) { showAlert('Thiếu thông tin', 'Vui lòng nhập số tiền hoá đơn hợp lệ (> 0).'); return; }
    if (isReal) {
      try {
        setBusy(true);
        await realMaintenanceService.complete(idNum, {
          resolutionNote: noteInput.trim() || undefined,
          repairDescription: noteInput.trim() || 'Đã sửa xong',
          invoiceVendor: DEFAULT_INVOICE_VENDOR,
          invoiceDate: today(),
          invoiceAmount: amount,
        });
        await refreshReal();
        setNoteInput(''); setInvoiceAmountText('');
        showAlert(
          '🛠 Đã báo sửa xong',
          ticket.status === 'tenant_fault'
            ? 'Hệ thống đã tự tạo hoá đơn — khách thanh toán trong tab Hoá đơn.'
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
            onView={(uris, i) => setLightbox({ uris, index: i })} />
        </View>

        {/* ── Cảnh báo vòng đời thiết bị ───────────────────────────── */}
        {!!repairCount && repairCount >= EQUIPMENT_REPLACE_SUGGEST_COUNT && (
          <View style={s.replaceAlert}>
            <Text style={s.replaceAlertText}>
              ⚠️ Thiết bị này đã sửa {repairCount} lần — cân nhắc <Text style={{ fontWeight: '800' }}>thay mới</Text> thay vì sửa tiếp.
            </Text>
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
              onRemoveLocal={removeLocalPhoto}
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
              onView={(uris, i) => setLightbox({ uris, index: i })} />
            {!!ticket.resolutionNote && (
              <Text style={[s.descText, { marginTop: Spacing.sm }]}>{ticket.resolutionNote}</Text>
            )}
          </View>
        )}

        {/* ── Hoá đơn — chỉ cần ảnh + số tiền ────────────────────── */}
        {canComplete && (
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>🧾 Hoá đơn sửa chữa</Text>
            <PhotoEvidenceRow
              type="invoice" urls={ticket.invoiceImages} photos={photos}
              onAdd={() => setPhotoMenuFor('invoice')}
              onView={(uris, i) => setLightbox({ uris, index: i })}
              onRemoveLocal={removeLocalPhoto}
            />
            <TextInput
              style={[s.textInput, s.moneyInput, { marginTop: Spacing.sm }]}
              value={invoiceAmountText}
              onChangeText={t => setInvoiceAmountText(formatMoneyInput(t))}
              placeholder="Số tiền hoá đơn (VNĐ)"
              placeholderTextColor={Colors.textMuted}
              keyboardType="numeric"
            />
            {ticket.status === 'tenant_fault' && (
              <Text style={s.costHint}>Hoàn tất sẽ tự tạo hoá đơn thu khách theo số tiền trên.</Text>
            )}
          </View>
        )}
        {!canComplete && (ticket.invoiceImages?.length ?? 0) > 0 && (
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>🧾 Hoá đơn sửa chữa</Text>
            <PhotoEvidenceRow type="invoice" urls={ticket.invoiceImages} photos={photos} onAdd={() => {}} disabled
              onView={(uris, i) => setLightbox({ uris, index: i })} />
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
                {ticket.faultEvidenceImages!.map((uri, i) => (
                  <TouchableOpacity key={i}
                    onPress={() => setLightbox({ uris: ticket.faultEvidenceImages!, index: i })}>
                    <Image source={{ uri }} style={s.rejectImage} />
                  </TouchableOpacity>
                ))}
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

        {/* ── Phân loại + chọn hướng xử lý khi OPEN ─────────────────── */}
        {ticket.status === 'open' && !faultFormOpen && (
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>
              {ticket.category ? 'Phân loại sự cố' : 'Phân loại sự cố (bắt buộc khi duyệt)'}
            </Text>
            {!!ticket.category && (
              <Text style={s.pickHint}>Khách thuê đã chọn khi tạo yêu cầu — bạn vẫn có thể đổi.</Text>
            )}
            {!ticket.category && !!realEquipmentId && (
              <Text style={s.pickHint}>Gợi ý sẵn "Trang thiết bị" vì yêu cầu có gắn thiết bị — đổi lại nếu không đúng.</Text>
            )}
            <TouchableOpacity
              style={s.dropdownBtn}
              onPress={() => setCategoryMenuOpen(o => !o)}
              activeOpacity={0.75}
            >
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
            <Text style={s.pickHint}>Phân loại dùng cho báo cáo chi phí sau sửa chữa.</Text>

            <Text style={[s.cardSectionTitle, { marginTop: Spacing.md }]}>Mức độ ưu tiên (tùy chọn)</Text>
            <TouchableOpacity
              style={s.dropdownBtn}
              onPress={() => setPriorityMenuOpen(o => !o)}
              activeOpacity={0.75}
            >
              <Text style={[s.dropdownBtnText, !approvePriority && s.dropdownBtnPlaceholder, approvePriority && { color: PRIORITY_CONFIG[approvePriority].color, fontWeight: '700' }]}>
                {approvePriority ? PRIORITY_CONFIG[approvePriority].label : '— Không chọn —'}
              </Text>
              <Text style={s.dropdownChevron}>{priorityMenuOpen ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {priorityMenuOpen && (
              <View style={s.dropdownList}>
                <TouchableOpacity
                  style={s.dropdownItem}
                  onPress={() => { setApprovePriority(null); setPriorityMenuOpen(false); }}
                  activeOpacity={0.75}
                >
                  <Text style={s.dropdownItemText}>— Không chọn —</Text>
                </TouchableOpacity>
                {APPROVE_PRIORITY_KEYS.map(key => {
                  const p = PRIORITY_CONFIG[key];
                  const active = approvePriority === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[s.dropdownItem, active && { backgroundColor: p.bg }]}
                      onPress={() => { setApprovePriority(key); setPriorityMenuOpen(false); }}
                      activeOpacity={0.75}
                    >
                      <Text style={[s.dropdownItemText, active && { color: p.color, fontWeight: '700' }]}>{p.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <Text style={[s.cardSectionTitle, { marginTop: Spacing.md }]}>Thời điểm sửa</Text>
            <View style={s.repairChoiceRow}>
              <TouchableOpacity
                style={[s.repairChoiceBtn, !approveRepairLater && s.repairChoiceBtnActive]}
                onPress={() => setApproveRepairLater(false)}
                activeOpacity={0.75}
              >
                <Text style={[s.repairChoiceText, !approveRepairLater && s.repairChoiceTextActive]}>🔧 Sửa ngay</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.repairChoiceBtn, approveRepairLater && s.repairChoiceBtnActive]}
                onPress={() => setApproveRepairLater(true)}
                activeOpacity={0.75}
              >
                <Text style={[s.repairChoiceText, approveRepairLater && s.repairChoiceTextActive]}>📅 Đặt lịch sửa sau</Text>
              </TouchableOpacity>
            </View>
            {approveRepairLater && (
              <View style={{ marginTop: Spacing.md }}>
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
          </View>
        )}

        {/* ── Form báo lỗi do khách (Luồng B) ──────────────────────── */}
        {ticket.status === 'open' && faultFormOpen && (
          <View style={[s.card, { borderColor: '#DC2626', borderWidth: 1.5 }]}>
            <Text style={s.cardSectionTitle}>⚠️ Báo lỗi do khách</Text>
            <TextInput
              style={s.textInput}
              value={faultReason}
              onChangeText={setFaultReason}
              placeholder="Mô tả lỗi do khách gây ra (vd: tự tháo ống nước, dùng sai cách...)"
              placeholderTextColor={Colors.textMuted}
              multiline
            />
            <View style={{ marginTop: Spacing.sm }}>
              <PhotoEvidenceRow
                type="fault_evidence" urls={ticket.faultEvidenceImages} photos={photos}
                onAdd={() => setPhotoMenuFor('fault_evidence')}
                onView={(uris, i) => setLightbox({ uris, index: i })}
                onRemoveLocal={removeLocalPhoto}
              />
            </View>
            <Text style={s.pickHint}>
              Gửi xong sẽ chuyển cho admin xem xét trên web — việc sửa/thu tiền tiếp theo xử lý ngoài hệ thống.
            </Text>

            <TouchableOpacity
              style={[s.advanceBtn, { backgroundColor: '#DC2626', marginTop: Spacing.md }]}
              onPress={submitRejectFault}
              disabled={rejectingFault || !hasFaultEvidence}
            >
              <Text style={s.advanceBtnText}>
                {rejectingFault ? 'Đang gửi...' : !hasFaultEvidence ? 'Thêm ảnh bằng chứng trước' : 'Gửi cho admin duyệt'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ alignItems: 'center', paddingVertical: Spacing.sm }} onPress={() => setFaultFormOpen(false)}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.textSecondary }}>← Quay lại</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Note input — chỉ hiện riêng ở trạng thái không có ảnh AFTER đi kèm
             (open/pending_tenant_repair); khi canComplete thì Ghi chú đã gộp vào
             block "Ảnh sau sửa chữa" phía trên. ── */}
        {!isTerminal && !faultFormOpen && !canComplete && (
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
              {(ticket.selfRepairImages ?? []).map((uri, i) => (
                <TouchableOpacity key={i}
                  onPress={() => setLightbox({ uris: ticket.selfRepairImages ?? [], index: i })}>
                  <Image source={{ uri }} style={s.rejectImage} />
                </TouchableOpacity>
              ))}
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
        {ticket.status === 'open' && !faultFormOpen && (
          <>
            <TouchableOpacity
              style={[s.advanceBtn, (!approveCategory || (approveRepairLater && !approveRepairTime)) && s.btnDisabled]}
              onPress={handleApprove}
              disabled={busy}
            >
              <Text style={s.advanceBtnText}>
                ✅ Duyệt (hao mòn/lỗi chủ){!approveCategory ? ' — chọn danh mục trước'
                  : approveRepairLater && !approveRepairTime ? ' — chọn lịch sửa trước' : ''}
              </Text>
            </TouchableOpacity>
            {TENANT_FAULT_FLOW_ENABLED && (
              <TouchableOpacity
                style={[s.advanceBtn, { backgroundColor: Colors.white, borderWidth: 1.5, borderColor: '#DC2626', marginBottom: Spacing.md }]}
                onPress={() => setFaultFormOpen(true)}
                disabled={busy}
              >
                <Text style={[s.advanceBtnText, { color: '#DC2626' }]}>⚠️ Báo lỗi do khách</Text>
              </TouchableOpacity>
            )}
          </>
        )}
        {canComplete && (
          <TouchableOpacity
            style={[s.advanceBtn, (!hasAfterPhoto || !hasInvoicePhoto) && s.btnDisabled]}
            onPress={handleComplete}
            disabled={busy}
          >
            <Text style={s.advanceBtnText}>
              🛠 Báo sửa xong{(!hasAfterPhoto || !hasInvoicePhoto) ? ' (cần ảnh AFTER + hoá đơn)' : ''}
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
        onCapture={(uri) => { const t = cameraFor; setCameraFor(null); if (t) void addLocalPhoto(t, uri); }}
        onClose={() => setCameraFor(null)}
      />

      {/* Menu "Thêm ảnh" — thay Alert.alert (no-op trên web) bằng modal trong UI. */}
      <Modal visible={photoMenuFor !== null} transparent animationType="fade" onRequestClose={() => setPhotoMenuFor(null)}>
        <Pressable style={s.photoMenuBackdrop} onPress={() => setPhotoMenuFor(null)}>
          <Pressable style={s.photoMenuCard} onPress={() => {}}>
            <Text style={s.photoMenuTitle}>Thêm ảnh</Text>
            <TouchableOpacity style={s.photoMenuOption} onPress={() => photoMenuFor && pickPhotoFromCamera(photoMenuFor)}>
              <Text style={s.photoMenuOptionText}>📷 Chụp ảnh</Text>
            </TouchableOpacity>
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

  replaceAlert:     { backgroundColor: '#FEF2F2', borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md, borderWidth: 1, borderColor: '#FECACA' },
  replaceAlertText: { fontSize: 13, color: '#B91C1C', lineHeight: 19 },

  rejectImage: { width: 110, height: 110, borderRadius: BorderRadius.md, marginRight: Spacing.sm, backgroundColor: Colors.divider },

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

  repairChoiceRow: { flexDirection: 'row', gap: Spacing.sm },
  repairChoiceBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: BorderRadius.md,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white,
  },
  repairChoiceBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  repairChoiceText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  repairChoiceTextActive: { color: Colors.primary, fontWeight: '700' },

  reviewRow:     { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  reviewBtn:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white },
  reviewBtnText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },

  costHint: { fontSize: 12, color: Colors.textMuted, marginTop: Spacing.sm, lineHeight: 17 },

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
