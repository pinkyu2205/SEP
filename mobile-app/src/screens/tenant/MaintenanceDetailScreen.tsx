import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, TextInput, Platform, Modal, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { MaintenanceRequest } from '@/types';
import {
  formatDate, getMaintenanceCategoryLabel,
  getMaintenancePriorityLabel, getMaintenancePriorityColor, showAlert,
} from '@/utils';
import {
  MAINTENANCE_STATUS_META, MAINTENANCE_CATEGORY_EMOJI, MAINTENANCE_BILLING_HINT_META,
} from '@/constants/maintenance';
import { realMaintenanceService } from '@/services/shared/maintenanceService';
import { dtoToTenantRequest } from '@/services/shared/maintenanceMappers';
import { toSharedBill, TenantInvoice } from '@/services/tenant/billingService';
import { CameraCaptureModal } from '../../components/common/CameraCaptureModal';
import { MaintenanceProgressTimeline } from '../../components/common/MaintenanceProgressTimeline';
import { MaintenancePhotoHistory } from '../../components/common/MaintenancePhotoHistory';
import { serverNow } from '@/utils/serverTime';

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

  // Nộp ảnh đã tự sửa (Luồng B — status pending_tenant_repair, chưa nộp ảnh).
  const [selfRepairNote, setSelfRepairNote] = useState('');
  const [selfRepairUris, setSelfRepairUris] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);

  // `request` chưa có ở lần render đầu khi vào bằng deep-link (chỉ có `requestId`).
  const currentStatusMeta = (request && STATUS_META[request.status]) || STATUS_META.open;
  const priorityColor = getMaintenancePriorityColor(request?.priority ?? 'medium');
  const billingMeta = request?.billingHint && request.billingHint !== 'none'
    ? MAINTENANCE_BILLING_HINT_META[request.billingHint] : null;

  // ── Actions ────────────────────────────────────────────────────────

  const pickFromCamera = async () => {
    setPhotoMenuOpen(false);
    if (Platform.OS === 'web') { setCameraOpen(true); return; }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') { showAlert('Lỗi', 'Cần quyền camera.'); return; }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
    if (!r.canceled && r.assets[0]) setSelfRepairUris(prev => [...prev, r.assets[0].uri]);
  };
  const pickFromLibrary = async () => {
    setPhotoMenuOpen(false);
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, allowsMultipleSelection: true, selectionLimit: 5 });
    if (!r.canceled) setSelfRepairUris(prev => [...prev, ...r.assets.map(a => a.uri)]);
  };

  /** Tenant nộp ảnh đã tự sửa xong (bắt buộc ≥1 ảnh) — chờ manager verify-repair. */
  const submitSelfRepair = async () => {
    if (busy) return;
    if (selfRepairUris.length === 0) { showAlert('Thiếu ảnh', 'Cần ít nhất 1 ảnh chứng minh đã sửa xong.'); return; }
    try {
      setBusy(true);
      await realMaintenanceService.submitSelfRepair(idNum, selfRepairNote.trim() || undefined, selfRepairUris);
      await refreshReal();
      setSelfRepairNote(''); setSelfRepairUris([]);
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

  // Vào bằng deep-link (chỉ có `requestId`) thì lần render đầu chưa có dữ liệu — hiện
  // trạng thái chờ thay vì để phần bên dưới đọc `request.xxx` rồi crash. Đặt SAU toàn
  // bộ hook để không đổi số lượng hook giữa các lần render.
  if (!request) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Quay lại</Text>
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

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Quay lại</Text>
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

        {/* Ảnh hiện trạng (BEFORE) */}
        {(request.beforeImages?.length ?? request.images.length) > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🖼️ Ảnh hiện trạng</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesRow}>
              {(request.beforeImages?.length ? request.beforeImages : request.images).map((uri, i) => (
                <Image key={i} source={{ uri }} style={styles.attachmentImage} />
              ))}
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
                  <Image key={i} source={{ uri }} style={styles.attachmentImage} />
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
                <Image key={i} source={{ uri }} style={styles.attachmentImage} />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Hoá đơn (INVOICE) — ảnh + mô tả việc đã sửa */}
        {(request.invoiceImages?.length ?? 0) > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🧾 Hoá đơn sửa chữa</Text>
            {!!request.repairDescription && (
              <Text style={[styles.descText, { marginBottom: Spacing.sm }]}>{request.repairDescription}</Text>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesRow}>
              {request.invoiceImages!.map((uri, i) => (
                <Image key={i} source={{ uri }} style={styles.attachmentImage} />
              ))}
            </ScrollView>
            {request.invoiceAmount != null && billingMeta && (
              <View style={[styles.tenantPayNote, { backgroundColor: billingMeta.bg, borderColor: billingMeta.color + '40' }]}>
                <Text style={[styles.tenantPayNoteTitle, { color: billingMeta.color }]}>{billingMeta.label}</Text>
                <Text style={[styles.tenantPayNoteAmount, { color: billingMeta.color }]}>
                  {request.invoiceAmount.toLocaleString('vi-VN')} đ
                </Text>
                <Text style={[styles.tenantPayNoteText, { color: billingMeta.color }]}>{billingMeta.detail}</Text>
              </View>
            )}
          </View>
        )}

        <MaintenancePhotoHistory photos={request.photoHistory} />

        {/* Tự sửa — chưa nộp ảnh: form nộp ảnh + ghi chú */}
        {request.status === 'pending_tenant_repair' && !hasSelfRepairPhotos && (
          <View style={styles.actionSection}>
            <View style={[styles.helpCard, { backgroundColor: '#FFF7ED', marginBottom: Spacing.md }]}>
              <Text style={[styles.helpText, { color: '#C2410C' }]}>
                🛠 Bạn cần tự sửa lỗi này{remainingDays != null
                  ? remainingDays >= 0 ? ` trong ${remainingDays} ngày nữa` : ' — ĐÃ QUÁ HẠN'
                  : ''}{request.selfRepairDeadline ? ` (hạn ${formatDate(request.selfRepairDeadline)})` : ''}.
                Sửa xong thì chụp ảnh gửi để quản lý xác nhận.
              </Text>
            </View>
            <Text style={styles.sectionTitle}>Ảnh chứng minh đã sửa xong</Text>
            <View style={styles.rejectImagesRow}>
              {selfRepairUris.map((uri, i) => (
                <View key={`${uri}-${i}`} style={styles.rejectThumbWrap}>
                  <Image source={{ uri }} style={styles.rejectThumb} />
                  <TouchableOpacity
                    style={styles.rejectThumbRemove}
                    onPress={() => setSelfRepairUris(prev => prev.filter((_, idx) => idx !== i))}
                  >
                    <Text style={styles.rejectThumbRemoveText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.rejectAddBtn} onPress={() => setPhotoMenuOpen(true)}>
                <Text style={styles.rejectAddBtnText}>＋{'\n'}Ảnh</Text>
              </TouchableOpacity>
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

        {/* Nút liên hệ nếu đang xử lý */}
        {(request.status === 'open' || request.status === 'in_repair' || request.status === 'tenant_fault') && (
          <View style={styles.actionSection}>
            <View style={styles.helpCard}>
              <Text style={styles.helpText}>
                {request.status === 'open'
                  ? '⏳ Yêu cầu đang chờ quản lý kiểm tra. Cần hỗ trợ gấp? Liên hệ quản lý.'
                  : request.status === 'tenant_fault'
                    ? '🔧 Quản lý sẽ sửa hộ — bạn sẽ nhận hoá đơn sau khi hoàn tất.'
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
        onCapture={(uri) => setSelfRepairUris(prev => [...prev, uri])}
        onClose={() => setCameraOpen(false)}
      />

      {/* Menu "Thêm ảnh" — thay Alert.alert (no-op trên web) bằng modal trong UI. */}
      <Modal visible={photoMenuOpen} transparent animationType="fade" onRequestClose={() => setPhotoMenuOpen(false)}>
        <Pressable style={styles.photoMenuBackdrop} onPress={() => setPhotoMenuOpen(false)}>
          <Pressable style={styles.photoMenuCard} onPress={() => {}}>
            <Text style={styles.photoMenuTitle}>Thêm ảnh</Text>
            <TouchableOpacity style={styles.photoMenuOption} onPress={pickFromCamera}>
              <Text style={styles.photoMenuOptionText}>📷 Chụp ảnh</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoMenuOption} onPress={pickFromLibrary}>
              <Text style={styles.photoMenuOptionText}>🖼️ Chọn từ thư viện</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoMenuCancel} onPress={() => setPhotoMenuOpen(false)}>
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
  tenantPayNote: {
    borderRadius: BorderRadius.md, borderWidth: 1,
    padding: Spacing.md, marginTop: Spacing.sm,
  },
  tenantPayNoteTitle: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  tenantPayNoteAmount: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  tenantPayNoteText: { fontSize: 12, lineHeight: 18 },

  imagesRow: { marginTop: Spacing.sm },
  attachmentImage: { width: 120, height: 120, borderRadius: BorderRadius.md, marginRight: Spacing.sm, backgroundColor: Colors.divider },

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
