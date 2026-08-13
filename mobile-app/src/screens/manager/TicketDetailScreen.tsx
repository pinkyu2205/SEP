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
import type { MaintenanceReqCategory, MaintenanceReqPriority, EquipmentDto } from '@/types';
import { realMaintenanceService } from '@/services/shared/maintenanceService';
import { dtoToTicket } from '@/services/shared/maintenanceMappers';
import { realPendingChargeService, PendingCharge } from '@/services/manager/pendingChargeService';
import { realEquipmentService } from '@/services/manager/equipmentService';
import { CameraCaptureModal } from '../../components/common/CameraCaptureModal';
import { MaintenanceProgressTimeline } from '../../components/common/MaintenanceProgressTimeline';
import { MaintenancePhotoHistory } from '../../components/common/MaintenancePhotoHistory';
import { showAlert } from '@/utils';
import { serverNow, todayIso } from '@/utils/serverTime';
import {
  MAINTENANCE_STATUS_META, MAINTENANCE_STATUS_FLOW, StatusMeta,
  MAINTENANCE_AUTO_CONFIRM_DAYS, EQUIPMENT_REPLACE_SUGGEST_COUNT,
} from '@/constants/maintenance';

// ── Config ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<TicketStatus, StatusMeta> = MAINTENANCE_STATUS_META;

const PRIORITY_CONFIG = {
  urgent: { label: '🚨 Khẩn cấp',  color: '#EF4444', bg: '#FEF2F2' },
  high:   { label: '🔴 Cao',        color: '#F97316', bg: '#FFF7ED' },
  medium: { label: '🟡 Trung bình', color: '#F59E0B', bg: '#FFFBEB' },
  low:    { label: '🟢 Thấp',       color: '#10B981', bg: '#F0FDF4' },
} as const;

const CATEGORY_CONFIG = {
  electrical: { label: 'Điện',            icon: '⚡' },
  plumbing:   { label: 'Nước / Ống',      icon: '🚰' },
  furniture:  { label: 'Nội thất',        icon: '🪑' },
  appliance:  { label: 'Trang thiết bị',  icon: '📺' },
  structural: { label: 'Kết cấu',         icon: '🧱' },
  other:      { label: 'Khác',            icon: '🔧' },
} as const;

/** Thứ tự hiển thị dropdown phân loại lúc duyệt (khớp enum BE). */
const APPROVE_CATEGORY_KEYS = ['appliance', 'furniture', 'structural', 'electrical', 'plumbing', 'other'] as const;
const APPROVE_PRIORITY_KEYS = ['low', 'medium', 'high', 'urgent'] as const;

const STATUS_FLOW = MAINTENANCE_STATUS_FLOW as TicketStatus[];

const now = () => serverNow().toLocaleString('vi-VN');
const today = () => todayIso();
const mkEntry = (status: TicketStatus, note: string): TimelineEntry =>
  ({ status, note, updatedBy: 'Manager', updatedAt: now() });

const fmt = (n: number | null | undefined) => (n || 0).toLocaleString('vi-VN') + 'đ';

/** Số ngày còn lại trước khi auto-confirm (3 ngày từ lúc báo sửa xong). */
const autoConfirmDaysLeft = (since?: string): number | null => {
  if (!since) return null;
  const start = new Date(since).getTime();
  if (Number.isNaN(start)) return null;
  const passed = Math.floor((Date.now() - start) / 86_400_000);
  return Math.max(0, MAINTENANCE_AUTO_CONFIRM_DAYS - passed);
};

// ── Photo Evidence Row ───────────────────────────────────────────────────────

const PhotoEvidenceRow: React.FC<{
  type: 'before' | 'after';
  /** ảnh đã có trên server (URL) */
  urls?: string[];
  /** ảnh local vừa chụp/chọn (chưa hoặc đang upload) */
  photos: PhotoEvidence[];
  onAdd: () => void;
  disabled?: boolean;
}> = ({ type, urls = [], photos, onAdd, disabled }) => {
  const filtered = photos.filter(p => p.type === type);
  const color    = type === 'before' ? Colors.warning : Colors.success;
  const isEmpty  = urls.length === 0 && filtered.length === 0;
  return (
    <View style={phs.container}>
      <View style={phs.header}>
        <Text style={phs.label}>
          {type === 'before' ? '📸 Ảnh trước sửa chữa' : '🖼️ Ảnh sau sửa chữa'}
        </Text>
        {!disabled && (
          <TouchableOpacity style={[phs.addBtn, { borderColor: color }]} onPress={onAdd}>
            <Text style={[phs.addBtnText, { color }]}>+ Thêm ảnh</Text>
          </TouchableOpacity>
        )}
      </View>
      {isEmpty ? (
        <View style={[phs.emptyBox, { borderColor: color + '40' }]}>
          <Text style={phs.emptyIcon}>{type === 'before' ? '📷' : '🖼️'}</Text>
          <Text style={phs.emptyText}>Chưa có ảnh {type === 'before' ? 'trước' : 'sau'}</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={phs.scrollRow}>
          {urls.map((uri, i) => (
            <View key={`url-${i}`} style={[phs.photoCard, { borderColor: color + '50' }]}>
              <Image source={{ uri }} style={[phs.photoPlaceholder, { width: '100%' }]} />
            </View>
          ))}
          {filtered.map(photo => (
            <View key={photo.id} style={[phs.photoCard, { borderColor: color + '50' }]}>
              {photo.uri ? (
                <Image source={{ uri: photo.uri }} style={[phs.photoPlaceholder, { width: '100%' }]} />
              ) : (
                <View style={[phs.photoPlaceholder, { backgroundColor: color + '15' }]}>
                  <Text style={phs.photoPlaceholderIcon}>{type === 'before' ? '📸' : '🖼️'}</Text>
                </View>
              )}
              {photo.caption && <Text style={phs.photoCaption} numberOfLines={1}>{photo.caption}</Text>}
              <Text style={phs.photoDate}>{photo.capturedAt.split(' ')[0]}</Text>
            </View>
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
  photoCaption:         { fontSize: 10, color: Colors.textSecondary, padding: 4, lineHeight: 13 },
  photoDate:            { fontSize: 9, color: Colors.textMuted, paddingHorizontal: 4, paddingBottom: 4 },
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

  const [noteInput, setNoteInput] = useState('');
  const [photos,    setPhotos]    = useState<PhotoEvidence[]>(ticket?.photos || []);
  const [busy,      setBusy]      = useState(false);
  // Camera in-app cho web (launchCameraAsync trên web chỉ mở file picker)
  const [cameraFor, setCameraFor] = useState<'before' | 'after' | null>(null);
  const [photoMenuFor, setPhotoMenuFor] = useState<'before' | 'after' | null>(null);
  // Flow 17/07 chiều: manager BẮT BUỘC gán category khi duyệt, priority tùy chọn.
  // 27/07: tenant có thể đã tự chọn category lúc tạo (báo hỏng không gắn thiết bị) —
  // prefill sẵn, manager vẫn đổi được (xem docs/FE-maintenance-non-equipment-create.md).
  const [approveCategory, setApproveCategory] = useState<TicketCategory | null>(ticket?.category ?? null);
  const [approvePriority, setApprovePriority] = useState<TicketPriority | null>(null);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false);
  const [otherCategoryText, setOtherCategoryText] = useState('');
  // Ticket tạo qua QR/chọn thiết bị luôn gắn equipmentId nhưng BE để category=null (tenant
  // không được chọn category khi có equipment — xem resolveCreateCategory ở BE). 90%+ ticket
  // có equipmentId là hư trang thiết bị, nên tự gợi ý sẵn 'appliance' để manager đỡ phải bấm
  // dropdown mỗi lần — vẫn đổi được (vd nếu thực ra là nội thất) trước khi duyệt.
  useEffect(() => {
    if (!realTicket || realTicket.category || realEquipmentId == null) return;
    setApproveCategory(c => c ?? 'appliance');
  }, [realTicket, realEquipmentId]);

  // Prefill số tiền chốt thu = repairCost đang treo trên ticket (manager sửa được).
  useEffect(() => {
    if (realTicket?.repairCost != null) {
      setResolveAmountText(prev => (prev === '' ? String(realTicket.repairCost) : prev));
    }
  }, [realTicket?.repairCost]);

  // Chi phí & bên chịu trách nhiệm (28/07/2026 — BE-DONE-maintenance-damage-compensation).
  // Gợi ý số tiền: còn bảo hành → khấu hao còn lại theo price/warrantyStartDate/warrantyEndDate;
  // hết bảo hành → penaltyFee cố định; không equipmentId → để trống, manager nhập tay.
  const [costPaidBy, setCostPaidBy] = useState<'host' | 'tenant'>('host');
  const [damageCause, setDamageCause] = useState<'wear' | 'misuse' | null>(null);
  const [repairCostText, setRepairCostText] = useState('');
  const [costSuggestionNote, setCostSuggestionNote] = useState<string | null>(null);
  const [loadingPricing, setLoadingPricing] = useState(false);
  const [pricingFetched, setPricingFetched] = useState(false);
  // Manager phải tick xác nhận đã thoả thuận trực tiếp với khách về số tiền TRƯỚC khi gửi —
  // tránh trường hợp tự đặt số tiền rồi mới báo khách (khách vẫn có bước Đồng ý/Khiếu nại
  // riêng sau đó, đây là lớp cam kết bổ sung phía manager). Reset khi đổi số tiền/đổi bên chịu
  // để cam kết luôn khớp đúng con số cuối cùng gửi đi.
  const [costCommitConfirmed, setCostCommitConfirmed] = useState(false);

  // "Giữ kết quả" (review-reject approve=false) cần lý do bắt buộc — mở ô nhập trước khi gửi.
  const [keepResultOpen, setKeepResultOpen] = useState(false);
  const [keepResultNote, setKeepResultNote] = useState('');

  // Khoản bồi thường treo (costAgreementStatus pending/disputed trên ticket đã đóng/hủy) —
  // BE 30/07 /resolve-cost: CHARGE (chốt thu, sửa được số tiền) hoặc WAIVE (miễn thu).
  const [resolveAmountText, setResolveAmountText] = useState('');
  const [resolveNote, setResolveNote] = useState('');
  const [resolving, setResolving] = useState(false);

  const handleResolveCost = async (action: 'CHARGE' | 'WAIVE') => {
    if (resolving) return;
    const amount = Number(resolveAmountText.replace(/[^0-9]/g, ''));
    if (action === 'CHARGE' && (!Number.isFinite(amount) || amount <= 0)) {
      showAlert('Lỗi', 'Số tiền thu phải lớn hơn 0.');
      return;
    }
    const doSend = async () => {
      try {
        setResolving(true);
        const dto = await realMaintenanceService.resolveCost(idNum, {
          action,
          ...(action === 'CHARGE' ? { repairCost: amount } : {}),
          ...(resolveNote.trim() ? { note: resolveNote.trim() } : {}),
        });
        await refreshReal();
        showAlert(
          action === 'CHARGE' ? '🧾 Đã chốt thu' : 'Đã miễn thu',
          action === 'CHARGE'
            ? `Đã phát hành hóa đơn${dto.issuedInvoice ? ` ${dto.issuedInvoice.code ?? '#' + dto.issuedInvoice.id}` : ''} ${fmt(amount)} — khách thanh toán ngay trên app.`
            : 'Khoản bồi thường đã được miễn — không thu tiền khách.',
        );
      } catch (e: any) { showAlert('Lỗi', apiErrMsg(e, 'Không thể xử lý khoản bồi thường.')); }
      finally { setResolving(false); }
    };
    if (action === 'WAIVE') {
      showAlert('Miễn thu khoản bồi thường?', `Sẽ không thu ${ticket?.repairCost ? fmt(ticket.repairCost) : 'khoản này'} của khách nữa.`, [
        { text: 'Không', style: 'cancel' },
        { text: 'Miễn thu', style: 'destructive', onPress: () => void doSend() },
      ]);
    } else {
      await doSend();
    }
  };

  const computeSuggestedCost = (eq: EquipmentDto): { amount: number; note: string } | null => {
    if (!eq.price || !eq.warrantyEndDate) return null;
    const today = serverNow();
    const end = new Date(eq.warrantyEndDate);
    if (today > end) {
      return eq.penaltyFee != null
        ? { amount: eq.penaltyFee, note: `Hết bảo hành — mức phạt cố định ${fmt(eq.penaltyFee)}` }
        : null;
    }
    if (!eq.warrantyStartDate) return null;
    const start = new Date(eq.warrantyStartDate);
    const totalDays = (end.getTime() - start.getTime()) / 86_400_000;
    if (totalDays <= 0) return null;
    const usedDays = (today.getTime() - start.getTime()) / 86_400_000;
    const ratio = Math.max(0, (totalDays - usedDays) / totalDays);
    const amount = Math.round((eq.price * ratio) / 1000) * 1000;
    return { amount, note: `Còn bảo hành — khấu hao còn lại (${Math.round(ratio * 100)}%)` };
  };

  useEffect(() => {
    if (costPaidBy !== 'tenant' || !realEquipmentId || pricingFetched) return;
    let active = true;
    setLoadingPricing(true);
    realEquipmentService.getById(realEquipmentId)
      .then(eq => {
        if (!active) return;
        const suggested = computeSuggestedCost(eq);
        if (suggested) {
          setRepairCostText(String(suggested.amount));
          setCostSuggestionNote(suggested.note);
        }
      })
      .catch(() => { /* không có dữ liệu giá — để manager nhập tay */ })
      .finally(() => { if (active) { setLoadingPricing(false); setPricingFetched(true); } });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costPaidBy, realEquipmentId, pricingFetched]);

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

  // Khoản chờ thu (khách làm hư — luồng hóa đơn sau CLOSED): nếu BE đã tạo pending
  // charge tham chiếu ticket này thì cho manager phát hành hóa đơn ngay tại đây.
  const [pendingCharge, setPendingCharge] = useState<PendingCharge | null>(null);
  const [issuing,       setIssuing]       = useState(false);
  useEffect(() => {
    if (!isReal || ticket?.status !== 'closed') return;
    realPendingChargeService.list({ propertyId: Number(ticket.propertyId) || undefined })
      .then(list => setPendingCharge(list.find(c => (c.note || '').includes(`#${idNum}`)) ?? null))
      .catch(() => { /* offline — ẩn khối thu tiền */ });
  }, [isReal, idNum, ticket?.status, ticket?.propertyId]);

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

  const cfg         = STATUS_CONFIG[ticket.status];
  // category/priority null khi PENDING (manager gán lúc duyệt) → ẩn badge tương ứng.
  const priorityCfg = ticket.priority ? PRIORITY_CONFIG[ticket.priority] : undefined;
  const catCfg      = ticket.category ? CATEGORY_CONFIG[ticket.category] : undefined;
  const isTerminal  = ['closed', 'cancelled'].includes(ticket.status);
  const apiErrMsg = (e: any, fallback: string) =>
    e?.response?.data?.error || e?.response?.data?.message || fallback;

  // Ảnh AFTER đã có (server hoặc local) — điều kiện để "Báo sửa xong".
  const hasAfterPhoto =
    (ticket.afterImages?.length ?? 0) > 0 || photos.some(p => p.type === 'after');
  const beforeUrls = ticket.beforeImages?.length ? ticket.beforeImages : ticket.images;

  // Phát hành hóa đơn MAINTENANCE từ khoản chờ thu (khách làm hư).
  const handleIssueInvoice = async () => {
    if (!pendingCharge || issuing) return;
    setIssuing(true);
    try {
      const inv = await realPendingChargeService.issueInvoice(pendingCharge.tenantContractId, {
        chargeIds: [pendingCharge.id],
        note: `Phí bảo trì ${ticket?.ticketCode || `ticket #${idNum}`} — khách làm hư`,
      });
      setPendingCharge({ ...pendingCharge, status: 'INVOICED', invoiceId: inv.id });
      showAlert(
        '🧾 Đã phát hành hóa đơn',
        `Hóa đơn ${inv.code ?? `#${inv.id}`} (${fmt(Number(inv.grandTotal))}) đã gửi tới khách — khách thanh toán trong tab Hóa đơn.`,
      );
    } catch (e: any) {
      showAlert('Lỗi', apiErrMsg(e, 'Không phát hành được hóa đơn. Vui lòng thử lại.'));
    } finally { setIssuing(false); }
  };

  // Cập nhật store + append timeline (đường mock).
  const patchStore = (updates: Partial<MaintenanceTicket>, entry: TimelineEntry) =>
    maintenanceStore.updateTicket(ticket.id, {
      ...updates,
      photos,
      timeline: [...ticket.timeline, entry],
      updatedAt: today(),
    });

  const addLocalPhoto = async (type: 'before' | 'after', uri: string) => {
    const localId = `ph-${Date.now()}`;
    setPhotos(prev => [...prev, {
      id: localId, type, uri,
      caption:    type === 'before' ? 'Ảnh hiện trạng' : 'Ảnh sau sửa chữa',
      capturedAt: now(),
    }]);
    // Ticket thật → upload lên BE (POST /{id}/photos). Mock → chỉ lưu cục bộ.
    if (isReal) {
      try {
        await realMaintenanceService.uploadPhotos(idNum, [uri], type === 'before' ? 'BEFORE' : 'AFTER');
        await refreshReal();
        // refreshReal() vừa nạp lại beforeImages/afterImages từ BE — đã CHỨA ảnh vừa
        // upload, nên bỏ bản optimistic cục bộ để tránh hiện trùng ảnh (server + local
        // cùng render 1 ảnh, khiến "Ảnh sau sửa chữa" hiện dư so với lịch sử thật).
        setPhotos(prev => prev.filter(p => p.id !== localId));
      } catch {
        showAlert('Lỗi tải ảnh', 'Không tải được ảnh lên máy chủ. Ảnh vẫn được lưu tạm trên máy.');
      }
    }
  };

  // Menu "Thêm ảnh" trong UI (không dùng Alert.alert 3 nút) — Alert.alert là no-op
  // trên react-native-web nên menu Chụp ảnh/Thư viện trước đây không bấm được trên web.
  const pickPhotoFromCamera = async (type: 'before' | 'after') => {
    setPhotoMenuFor(null);
    if (Platform.OS === 'web') { setCameraFor(type); return; }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') { showAlert('Lỗi', 'Cần quyền camera.'); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!r.canceled && r.assets[0]) await addLocalPhoto(type, r.assets[0].uri);
  };
  const pickPhotoFromLibrary = async (type: 'before' | 'after') => {
    setPhotoMenuFor(null);
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, allowsMultipleSelection: true, selectionLimit: 5 });
    if (!r.canceled) for (const a of r.assets) await addLocalPhoto(type, a.uri);
  };

  // ── Actions theo flow mới ──────────────────────────────────────────

  /** PENDING → APPROVED: manager duyệt — BẮT BUỘC chọn category, priority tùy chọn. */
  const handleApprove = async () => {
    if (busy) return;
    if (!approveCategory) {
      showAlert('Chưa phân loại', 'Vui lòng chọn danh mục sự cố trước khi duyệt.');
      return;
    }
    if (isReal) {
      try {
        setBusy(true);
        await realMaintenanceService.approve(idNum, {
          category: approveCategory.toUpperCase() as MaintenanceReqCategory,
          priority: approvePriority ? (approvePriority.toUpperCase() as MaintenanceReqPriority) : undefined,
        });
        await refreshReal();
        showAlert('✅ Đã duyệt', 'Yêu cầu đã được duyệt — liên hệ thợ ngoài đến sửa, xong thì bấm "Báo sửa xong".');
      } catch (e: any) { showAlert('Lỗi', apiErrMsg(e, 'Không thể duyệt yêu cầu. Vui lòng thử lại.')); }
      finally { setBusy(false); }
      return;
    }
    patchStore(
      { status: 'approved', category: approveCategory, priority: approvePriority ?? undefined },
      mkEntry('approved', noteInput.trim() || `Manager duyệt yêu cầu [${approveCategory.toUpperCase()}]`),
    );
    setNoteInput('');
  };

  /** APPROVED → WAITING_TENANT_CONFIRM: báo sửa xong (bắt buộc có ảnh AFTER). */
  const handleComplete = async () => {
    if (busy) return;
    if (!hasAfterPhoto) {
      showAlert('Thiếu ảnh', 'Cần ít nhất 1 ảnh SAU sửa chữa trước khi báo xong.');
      return;
    }
    const repairCostValue = Number(repairCostText.replace(/[^\d]/g, '')) || 0;
    if (costPaidBy === 'tenant') {
      if (!damageCause) {
        showAlert('Thiếu thông tin', 'Vui lòng chọn nguyên nhân hư hỏng (hao mòn tự nhiên / khách làm hư).');
        return;
      }
      if (repairCostValue <= 0) {
        showAlert('Thiếu thông tin', 'Vui lòng nhập số tiền bồi thường hợp lệ (> 0).');
        return;
      }
      if (!costCommitConfirmed) {
        showAlert('Thiếu xác nhận', 'Vui lòng tick xác nhận đã thoả thuận số tiền bồi thường với khách trước khi gửi.');
        return;
      }
    }
    const note = noteInput.trim();
    if (isReal) {
      try {
        setBusy(true);
        await realMaintenanceService.complete(idNum, {
          ...(note ? { resolutionNote: note } : {}),
          ...(costPaidBy === 'tenant' ? {
            costPaidBy: 'TENANT',
            cause: damageCause === 'wear' ? 'WEAR' : 'MISUSE',
            repairCost: repairCostValue,
          } : {}),
        });
        await refreshReal();
        setNoteInput('');
        showAlert(
          '🛠 Đã báo sửa xong',
          costPaidBy === 'tenant'
            ? `Đã gửi khách nghiệm thu kèm yêu cầu bồi thường ${fmt(repairCostValue)}. Khách cần đồng ý trước khi hệ thống tạo hoá đơn — không tự động thu.`
            : `Đã gửi khách nghiệm thu. Khách không phản hồi sau ${MAINTENANCE_AUTO_CONFIRM_DAYS} ngày thì ticket tự đóng.`,
        );
      } catch (e: any) { showAlert('Lỗi', apiErrMsg(e, 'Không thể báo sửa xong. Vui lòng thử lại.')); }
      finally { setBusy(false); }
      return;
    }
    patchStore(
      { status: 'waiting_confirm', resolutionNote: note || undefined },
      mkEntry('waiting_confirm', note || 'Đã sửa xong — chờ khách nghiệm thu'),
    );
    setNoteInput('');
  };

  /**
   * REJECTED → manager xem xét: approve=true sửa lại, false giữ kết quả.
   * BE 30/07: approve=false BẮT BUỘC note (lý do giữ nguyên) — thiếu là 422; đồng thời
   * lần từ chối thứ 2 trở đi BE tự báo Host. UI: nút "Giữ kết quả" mở ô nhập lý do trước.
   */
  const handleReviewReject = async (approve: boolean, note?: string) => {
    if (busy) return;
    if (isReal) {
      try {
        setBusy(true);
        await realMaintenanceService.reviewReject(idNum, approve, note);
        await refreshReal();
        setKeepResultOpen(false);
        setKeepResultNote('');
        showAlert(
          approve ? '🔧 Sửa lại' : 'Giữ kết quả',
          approve
            ? 'Đã chấp nhận phản hồi của khách — ảnh AFTER cũ bị xóa, sửa lại xong hãy báo xong lần nữa.'
            : 'Đã giữ nguyên kết quả — khách xác nhận lại hoặc hệ thống tự đóng sau 3 ngày.',
        );
      } catch (e: any) { showAlert('Lỗi', apiErrMsg(e, 'Không thể xử lý. Vui lòng thử lại.')); }
      finally { setBusy(false); }
      return;
    }
    if (approve) {
      setPhotos(prev => prev.filter(p => p.type !== 'after')); // ảnh AFTER cũ bị xóa
      patchStore(
        { status: 'approved', afterImages: [] },
        mkEntry('approved', 'Manager chấp nhận phản hồi — sửa lại'),
      );
    } else {
      patchStore(
        { status: 'waiting_confirm' },
        mkEntry('waiting_confirm', 'Manager giữ nguyên kết quả — chờ khách xác nhận lại'),
      );
    }
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

  const confirmDaysLeft = autoConfirmDaysLeft(ticket.resolvedAt ?? ticket.updatedAt);

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
        </View>

        {/* ── Description ────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardSectionTitle}>Mô tả vấn đề</Text>
          <Text style={s.descText}>{ticket.description}</Text>
        </View>

        {/* ── Cảnh báo vòng đời thiết bị ───────────────────────────── */}
        {!!repairCount && repairCount >= EQUIPMENT_REPLACE_SUGGEST_COUNT && (
          <View style={s.replaceAlert}>
            <Text style={s.replaceAlertText}>
              ⚠️ Thiết bị này đã sửa {repairCount} lần — cân nhắc <Text style={{ fontWeight: '800' }}>thay mới</Text> thay vì sửa tiếp.
            </Text>
          </View>
        )}

        {/* ── Khách đã từ chối N lần ───────────────────────────────── */}
        {!!ticket.reopenCount && ticket.reopenCount > 0 && (
          <View style={s.replaceAlert}>
            <Text style={s.replaceAlertText}>
              🔄 Khách đã từ chối nghiệm thu {ticket.reopenCount} lần — kiểm tra kỹ trước khi báo xong lần nữa.
            </Text>
          </View>
        )}

        {/* ── Photos ─────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardSectionTitle}>Hình ảnh / Bằng chứng</Text>
          {/* Ảnh TRƯỚC sửa chữa là bằng chứng hiện trạng do TENANT chụp lúc tạo yêu cầu —
              manager không được thêm/sửa để tránh có ý đồ xấu (ngụy tạo hiện trạng). */}
          <PhotoEvidenceRow
            type="before" urls={beforeUrls} photos={photos}
            onAdd={() => {}}
            disabled
          />
          {['approved', 'waiting_confirm', 'rejected', 'closed'].includes(ticket.status) && (
            <PhotoEvidenceRow
              type="after" urls={ticket.afterImages} photos={photos}
              onAdd={() => setPhotoMenuFor('after')}
              disabled={ticket.status !== 'approved'}
            />
          )}
        </View>

        <MaintenancePhotoHistory photos={ticket.photoHistory} />

        {/* ── Khách từ chối (rejected): lý do + ảnh minh chứng ─────── */}
        {ticket.status === 'rejected' && (
          <View style={[s.card, { borderColor: Colors.error, borderWidth: 1.5 }]}>
            <Text style={s.cardSectionTitle}>Khách từ chối nghiệm thu</Text>
            <Text style={s.descText}>{ticket.rejectReason || 'Không có lý do.'}</Text>
            {(ticket.rejectImages?.length ?? 0) > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: Spacing.sm }}>
                {ticket.rejectImages!.map((uri, i) => (
                  <Image key={i} source={{ uri }} style={s.rejectImage} />
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* ── Chờ khách nghiệm thu ─────────────────────────────────── */}
        {ticket.status === 'waiting_confirm' && (
          <View style={[s.card, { backgroundColor: Colors.infoLight }]}>
            <Text style={[s.descText, { color: Colors.info }]}>
              ⏳ Đã báo sửa xong — chờ khách nghiệm thu.
              {confirmDaysLeft != null && ` Không phản hồi thì tự đóng sau ~${confirmDaysLeft} ngày nữa.`}
            </Text>
            {!!ticket.resolutionNote && (
              <Text style={[s.descText, { marginTop: Spacing.sm }]}>📝 {ticket.resolutionNote}</Text>
            )}
          </View>
        )}

        {/* ── Thu tiền khách làm hư (real, closed, có khoản chờ thu) ── */}
        {isReal && ticket.status === 'closed' && pendingCharge && (
          <View style={[s.card, { borderColor: Colors.success, borderWidth: 1.5 }]}>
            <Text style={s.cardSectionTitle}>Thu tiền khách (khách làm hư)</Text>
            {pendingCharge.status === 'PENDING' ? (
              <>
                <Text style={s.descText}>
                  Khoản chờ thu {fmt(Number(pendingCharge.amount))} đã ghi vào hợp đồng của khách.
                  Phát hành hóa đơn để khách thanh toán ngay trên app.
                </Text>
                <TouchableOpacity
                  style={[s.reviewBtn, { backgroundColor: Colors.success, borderColor: Colors.success, marginTop: Spacing.sm }]}
                  onPress={handleIssueInvoice}
                  disabled={issuing}
                >
                  <Text style={[s.reviewBtnText, { color: Colors.white }]}>
                    {issuing ? 'Đang phát hành…' : '🧾 Phát hành hóa đơn thu khách'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={s.descText}>
                ✅ Đã phát hành hóa đơn{pendingCharge.invoiceId ? ` #${pendingCharge.invoiceId}` : ''} — chờ khách thanh toán.
              </Text>
            )}
          </View>
        )}

        {/* ── Khoản bồi thường TREO (BE 30/07 /resolve-cost) — ticket đã đóng/hủy nhưng
            costAgreementStatus còn pending (khách im lặng / auto-confirm) hoặc disputed
            (khách khiếu nại). Manager chốt thu (sửa được số tiền) hoặc miễn thu. ── */}
        {isReal && ['closed', 'cancelled'].includes(ticket.status)
          && (ticket.costAgreementStatus === 'pending' || ticket.costAgreementStatus === 'disputed') && (
          <View style={[s.card, { borderColor: Colors.warning, borderWidth: 1.5 }]}>
            <Text style={s.cardSectionTitle}>⚠️ Khoản bồi thường chưa xử lý</Text>
            <Text style={s.descText}>
              {ticket.costAgreementStatus === 'disputed'
                ? `Khách khiếu nại số tiền ${ticket.repairCost ? fmt(ticket.repairCost) : ''}${ticket.costDisputeReason ? ` — "${ticket.costDisputeReason}"` : ''}.`
                : `Ticket đã đóng nhưng khách chưa phản hồi về khoản bồi thường ${ticket.repairCost ? fmt(ticket.repairCost) : ''}.`}
              {' '}Thỏa thuận với khách rồi chốt thu (sửa được số tiền) hoặc miễn thu.
            </Text>
            <Text style={[s.cardSectionTitle, { marginTop: Spacing.md }]}>Số tiền chốt thu</Text>
            <TextInput
              style={s.textInput}
              value={resolveAmountText}
              onChangeText={setResolveAmountText}
              keyboardType="numeric"
              placeholder="VNĐ"
              placeholderTextColor={Colors.textMuted}
            />
            <TextInput
              style={[s.textInput, { marginTop: Spacing.sm }]}
              value={resolveNote}
              onChangeText={setResolveNote}
              placeholder="Ghi chú (vd: đã thỏa thuận lại với khách qua điện thoại…)"
              placeholderTextColor={Colors.textMuted}
              multiline
            />
            <View style={[s.reviewRow, { marginTop: Spacing.sm }]}>
              <TouchableOpacity
                style={[s.reviewBtn, { backgroundColor: Colors.success, borderColor: Colors.success }]}
                onPress={() => handleResolveCost('CHARGE')}
                disabled={resolving}
              >
                <Text style={[s.reviewBtnText, { color: Colors.white }]}>
                  {resolving ? 'Đang xử lý…' : '🧾 Chốt thu & phát hóa đơn'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.reviewBtn}
                onPress={() => handleResolveCost('WAIVE')}
                disabled={resolving}
              >
                <Text style={s.reviewBtnText}>Miễn thu</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Đã xử lý khoản treo: hiện kết cục để manager khỏi thắc mắc ── */}
        {isReal && ticket.costAgreementStatus === 'waived' && (
          <View style={[s.card, { backgroundColor: Colors.infoLight }]}>
            <Text style={[s.descText, { color: Colors.info }]}>
              ℹ️ Khoản bồi thường{ticket.repairCost ? ` ${fmt(ticket.repairCost)}` : ''} đã được miễn thu
              {ticket.costDisputeReason ? ` — ${ticket.costDisputeReason}` : ''}.
            </Text>
          </View>
        )}

        {/* ── Phân loại khi duyệt (PENDING): category BẮT BUỘC, priority tùy chọn ── */}
        {ticket.status === 'pending' && (
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
                {/* Ticket không gắn thiết bị: BE chặn APPLIANCE/FURNITURE lúc tạo — ẩn luôn
                    ở bước duyệt cho khớp invariant (hư thiết bị/nội thất phải có equipmentId). */}
                {APPROVE_CATEGORY_KEYS
                  .filter(key => realEquipmentId != null || (key !== 'appliance' && key !== 'furniture'))
                  .map(key => {
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
            {approveCategory === 'other' && (
              <TextInput
                style={[s.textInput, { marginTop: Spacing.sm }]}
                value={otherCategoryText}
                onChangeText={(t) => { setOtherCategoryText(t); setNoteInput(t); }}
                placeholder="Mô tả cụ thể sự cố (vd: mối mọt, nấm mốc...)"
                placeholderTextColor={Colors.textMuted}
              />
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
          </View>
        )}

        {/* ── Note input (chưa terminal) ──────────────────────────── */}
        {!isTerminal && (
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>Ghi chú</Text>
            <TextInput
              style={[s.textInput, s.noteInput]}
              value={noteInput}
              onChangeText={setNoteInput}
              placeholder={ticket.status === 'approved' ? 'Ghi chú sau sửa (vd: đã thay block máy lạnh)...' : 'Ghi chú...'}
              placeholderTextColor={Colors.textMuted}
              multiline
            />
          </View>
        )}

        {/* ── Chi phí & bên chịu trách nhiệm (chỉ lúc chuẩn bị báo sửa xong) ── */}
        {ticket.status === 'approved' && (
          <View style={s.card}>
            <Text style={s.cardSectionTitle}>💰 Chi phí & bên chịu trách nhiệm</Text>
            <View style={s.costToggleRow}>
              <TouchableOpacity
                style={[s.costToggleBtn, costPaidBy === 'host' && s.costToggleBtnActive]}
                onPress={() => { setCostPaidBy('host'); setDamageCause(null); setCostCommitConfirmed(false); }}
              >
                <Text style={[s.costToggleText, costPaidBy === 'host' && s.costToggleTextActive]}>Chủ nhà chịu</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.costToggleBtn, costPaidBy === 'tenant' && s.costToggleBtnActive]}
                onPress={() => { setCostPaidBy('tenant'); setDamageCause('misuse'); }}
              >
                <Text style={[s.costToggleText, costPaidBy === 'tenant' && s.costToggleTextActive]}>Khách thuê chịu</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.costHint}>
              💡 Hao mòn tự nhiên (thiết bị cũ, xuống cấp theo thời gian) luôn là trách nhiệm chủ nhà —
              chỉ chọn "Khách thuê chịu" khi xác định khách dùng sai/bất cẩn làm hư.
            </Text>

            {costPaidBy === 'tenant' && (
              <>
                <Text style={[s.cardSectionTitle, { marginTop: Spacing.md }]}>Nguyên nhân</Text>
                <View style={[s.costChip, s.costChipActive, { flex: undefined, alignSelf: 'flex-start', paddingHorizontal: Spacing.md }]}>
                  <Text style={[s.costChipText, s.costChipTextActive]}>Khách làm hư</Text>
                </View>

                <Text style={[s.cardSectionTitle, { marginTop: Spacing.md }]}>Số tiền bồi thường (đ)</Text>
                {loadingPricing ? (
                  <ActivityIndicator size="small" color={Colors.primary} style={{ marginBottom: Spacing.sm }} />
                ) : (
                  <TextInput
                    style={s.textInput}
                    value={repairCostText}
                    onChangeText={(t) => { setRepairCostText(t); setCostCommitConfirmed(false); }}
                    placeholder="Nhập số tiền..."
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="numeric"
                  />
                )}
                {costSuggestionNote && (
                  <Text style={s.costHint}>💡 Gợi ý: {costSuggestionNote} — có thể sửa lại trước khi gửi.</Text>
                )}
                {!realEquipmentId && (
                  <Text style={s.costHint}>Ticket không gắn thiết bị — nhập tay theo báo giá thực tế.</Text>
                )}
                <Text style={s.costHint}>Khách phải bấm "Đồng ý" mới tạo hoá đơn — hệ thống không tự động thu tiền.</Text>

                <TouchableOpacity
                  style={s.confirmRow}
                  activeOpacity={0.7}
                  onPress={() => setCostCommitConfirmed(prev => !prev)}
                >
                  <View style={[s.checkbox, costCommitConfirmed && s.checkboxChecked]}>
                    {costCommitConfirmed && <Text style={s.checkboxTick}>✓</Text>}
                  </View>
                  <Text style={s.confirmText}>
                    Tôi cam kết số tiền tôi nhập vào đã có sự thỏa thuận giữa hai bên và khách đã đồng ý với số tiền bồi thường đó.
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* ── Timeline ────────────────────────────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardSectionTitle}>Tiến trình xử lý</Text>
          <MaintenanceProgressTimeline timeline={ticket.timeline} currentStatus={ticket.status} />
        </View>

        {/* ── Actions theo status ─────────────────────────────────── */}
        {ticket.status === 'pending' && (
          <TouchableOpacity
            style={[s.advanceBtn, !approveCategory && s.btnDisabled]}
            onPress={handleApprove}
            disabled={busy}
          >
            <Text style={s.advanceBtnText}>
              ✅ Duyệt yêu cầu{!approveCategory ? ' (chọn danh mục trước)' : ''}
            </Text>
          </TouchableOpacity>
        )}
        {ticket.status === 'approved' && (
          <TouchableOpacity
            style={[s.advanceBtn, !hasAfterPhoto && s.btnDisabled]}
            onPress={handleComplete}
            disabled={busy}
          >
            <Text style={s.advanceBtnText}>🛠 Báo sửa xong{!hasAfterPhoto ? ' (cần ảnh AFTER)' : ''}</Text>
          </TouchableOpacity>
        )}
        {ticket.status === 'rejected' && (
          <>
            <View style={s.reviewRow}>
              <TouchableOpacity
                style={[s.reviewBtn, { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                onPress={() => handleReviewReject(true)}
                disabled={busy}
              >
                <Text style={[s.reviewBtnText, { color: Colors.white }]}>🔧 Chấp nhận — sửa lại</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.reviewBtn, keepResultOpen && { borderColor: Colors.primary }]}
                onPress={() => setKeepResultOpen(o => !o)}
                disabled={busy}
              >
                <Text style={s.reviewBtnText}>Giữ kết quả{keepResultOpen ? ' ▲' : ''}</Text>
              </TouchableOpacity>
            </View>
            {/* BE bắt buộc lý do khi giữ nguyên kết quả (422 nếu thiếu) — từ chối lần 2 trở đi Host cũng được báo. */}
            {keepResultOpen && (
              <View style={[s.card, { marginTop: Spacing.sm }]}>
                <Text style={s.cardSectionTitle}>Lý do giữ nguyên kết quả (bắt buộc)</Text>
                <TextInput
                  style={s.textInput}
                  value={keepResultNote}
                  onChangeText={setKeepResultNote}
                  placeholder="Vd: thợ đã kiểm tra lại, thiết bị hoạt động bình thường…"
                  placeholderTextColor={Colors.textMuted}
                  multiline
                />
                <TouchableOpacity
                  style={[s.advanceBtn, !keepResultNote.trim() && s.btnDisabled, { marginTop: Spacing.sm }]}
                  onPress={() => handleReviewReject(false, keepResultNote.trim())}
                  disabled={busy || !keepResultNote.trim()}
                >
                  <Text style={s.advanceBtnText}>Xác nhận giữ kết quả</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {!isTerminal && (
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
    </SafeAreaView>
  );
};

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

  textInput: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.md,
    padding: Spacing.md, fontSize: 14, color: Colors.textPrimary,
  },
  noteInput:  { minHeight: 80, textAlignVertical: 'top' },

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

  reviewRow:     { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  reviewBtn:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white },
  reviewBtnText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },

  costToggleRow:      { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  costToggleBtn:       { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: BorderRadius.md, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white },
  costToggleBtnActive: { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  costToggleText:      { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  costToggleTextActive:{ color: Colors.primary, fontWeight: '700' },
  costChip:            { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: BorderRadius.full, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.white },
  costChipActive:      { backgroundColor: '#FEF2F2', borderColor: '#DC2626' },
  costChipText:        { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  costChipTextActive:  { color: '#DC2626', fontWeight: '700' },
  costHint:            { fontSize: 12, color: Colors.textMuted, marginTop: Spacing.sm, lineHeight: 17 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white,
  },
  checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkboxTick:    { color: Colors.white, fontSize: 13, fontWeight: '800' },
  confirmRow:      { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  confirmText:     { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },

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
