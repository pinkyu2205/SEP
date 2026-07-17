import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, TextInput, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { MaintenanceRequest, MaintenanceStatus, MaintenanceTimeline } from '@/types';
import {
  formatDate, formatDateTime, getMaintenanceCategoryLabel,
  getMaintenancePriorityLabel, getMaintenancePriorityColor,
} from '@/utils';
import {
  MAINTENANCE_STATUS_META, MAINTENANCE_STATUS_FLOW, MAINTENANCE_CATEGORY_EMOJI,
  MAINTENANCE_AUTO_CONFIRM_DAYS,
} from '@/constants/maintenance';
import { useTenantRequests, tenantMaintenanceStore } from '@/store/maintenanceStore';
import { realMaintenanceService } from '@/services/shared/maintenanceService';
import { dtoToTenantRequest } from '@/services/shared/maintenanceMappers';
import { CameraCaptureModal } from '../../components/common/CameraCaptureModal';

const CATEGORY_EMOJI = MAINTENANCE_CATEGORY_EMOJI;

const STATUS_META: Record<string, { label: string; color: string; emoji: string }> =
  Object.fromEntries(
    Object.entries(MAINTENANCE_STATUS_META).map(([k, m]) => [
      k, { label: m.label, color: m.color, emoji: m.icon },
    ]),
  );

const ORDERED_STATUSES = MAINTENANCE_STATUS_FLOW as MaintenanceStatus[];

const nowIso = () => new Date().toISOString();
const mkTenantEntry = (status: MaintenanceStatus, note: string): MaintenanceTimeline =>
  ({ status, note, updatedBy: 'Khách thuê', updatedAt: nowIso() });

export const MaintenanceDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { request: routeRequest } = route.params as { request: MaintenanceRequest };

  // Ưu tiên dữ liệu live trong store (mock) để phản ánh thao tác nghiệm thu.
  const allTenant = useTenantRequests();
  const live = allTenant.find(r => r.id === routeRequest.id);
  const isMock = !!live;

  // Ticket thật (id số, không có trong store mock): nạp bản mới nhất từ BE.
  const idNum = Number(routeRequest.id);
  const isRealId = !isMock && Number.isFinite(idNum) && idNum > 0;
  const [realRequest, setRealRequest] = useState<MaintenanceRequest | undefined>(undefined);
  useEffect(() => {
    if (!isRealId) return;
    let active = true;
    realMaintenanceService.getDetail(idNum)
      .then(dto => { if (active) setRealRequest(dtoToTenantRequest(dto)); })
      .catch(() => { /* offline: dùng bản route param */ });
    return () => { active = false; };
  }, [idNum, isRealId]);

  const request = live ?? realRequest ?? routeRequest;
  const isReal = isRealId;

  const refreshReal = async () => {
    try { setRealRequest(dtoToTenantRequest(await realMaintenanceService.getDetail(idNum))); }
    catch { /* bỏ qua */ }
  };
  const apiErrMsg = (e: any, fallback: string) =>
    e?.response?.data?.error || e?.response?.data?.message || fallback;

  // Form từ chối nghiệm thu (reason + ảnh minh chứng, bắt buộc cả hai).
  const [rejectMode,   setRejectMode]   = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectUris,   setRejectUris]   = useState<string[]>([]);
  const [busy,         setBusy]         = useState(false);
  const [cameraOpen,   setCameraOpen]   = useState(false);

  const currentStatusMeta = STATUS_META[request.status] || STATUS_META.pending;
  const currentStatusIdx = ORDERED_STATUSES.indexOf(request.status as MaintenanceStatus);
  const priorityColor = getMaintenancePriorityColor(request.priority);

  // ── Actions ────────────────────────────────────────────────────────

  /** Tenant xác nhận đã sửa xong → CLOSED. */
  const confirmDone = async () => {
    if (busy) return;
    if (isReal) {
      try {
        setBusy(true);
        await realMaintenanceService.confirm(idNum);
        Alert.alert('✅ Cảm ơn bạn', 'Yêu cầu đã được xác nhận hoàn tất.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } catch (e: any) { Alert.alert('Lỗi', apiErrMsg(e, 'Không thể nghiệm thu. Vui lòng thử lại.')); }
      finally { setBusy(false); }
      return;
    }
    tenantMaintenanceStore.update(request.id, {
      status: 'closed',
      tenantConfirmedAt: nowIso().slice(0, 10),
      resolvedAt: nowIso().slice(0, 10),
      timeline: [...request.timeline, mkTenantEntry('closed', 'Khách đã nghiệm thu, đồng ý hoàn tất')],
      updatedAt: nowIso().slice(0, 10),
    });
    Alert.alert('✅ Cảm ơn bạn', 'Yêu cầu đã được xác nhận hoàn tất.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
  };

  const pickRejectImages = () => {
    Alert.alert('Thêm ảnh minh chứng', undefined, [
      { text: 'Chụp ảnh', onPress: async () => {
        if (Platform.OS === 'web') { setCameraOpen(true); return; }
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status !== 'granted') { Alert.alert('Lỗi', 'Cần quyền camera.'); return; }
        const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
        if (!r.canceled && r.assets[0]) setRejectUris(prev => [...prev, r.assets[0].uri]);
      }},
      { text: 'Chọn từ thư viện', onPress: async () => {
        const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, allowsMultipleSelection: true, selectionLimit: 5 });
        if (!r.canceled) setRejectUris(prev => [...prev, ...r.assets.map(a => a.uri)]);
      }},
      { text: 'Đóng', style: 'cancel' },
    ]);
  };

  /** Tenant từ chối nghiệm thu (bắt buộc lý do + ≥1 ảnh) → REJECTED. */
  const submitReject = async () => {
    if (busy) return;
    const reason = rejectReason.trim();
    if (!reason) { Alert.alert('Thiếu lý do', 'Vui lòng nhập lý do chưa đạt.'); return; }
    if (rejectUris.length === 0) { Alert.alert('Thiếu ảnh', 'Cần ít nhất 1 ảnh minh chứng.'); return; }
    if (isReal) {
      try {
        setBusy(true);
        await realMaintenanceService.reject(idNum, reason, rejectUris);
        await refreshReal();
        setRejectMode(false); setRejectReason(''); setRejectUris([]);
        Alert.alert('Đã gửi phản hồi', 'Quản lý sẽ xem xét và xử lý lại.');
      } catch (e: any) { Alert.alert('Lỗi', apiErrMsg(e, 'Không thể gửi phản hồi. Vui lòng thử lại.')); }
      finally { setBusy(false); }
      return;
    }
    tenantMaintenanceStore.update(request.id, {
      status: 'rejected',
      rejectReason: reason,
      rejectImages: rejectUris,
      timeline: [...request.timeline, mkTenantEntry('rejected', `Khách từ chối: ${reason}`)],
      updatedAt: nowIso().slice(0, 10),
    });
    setRejectMode(false); setRejectReason(''); setRejectUris([]);
    Alert.alert('Đã gửi phản hồi', 'Quản lý sẽ xem xét và xử lý lại.');
  };

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

        {/* Thanh tiến độ */}
        {request.status !== 'cancelled' && request.status !== 'rejected' && (
          <View style={styles.progressSection}>
            <Text style={styles.progressTitle}>Tiến độ xử lý</Text>
            <View style={styles.progressBar}>
              {ORDERED_STATUSES.map((s, i) => {
                const isReached = i <= currentStatusIdx;
                const meta = STATUS_META[s];
                return (
                  <View key={s} style={styles.progressStep}>
                    <View style={[styles.progressDot, { backgroundColor: isReached ? meta.color : Colors.border }]}>
                      {isReached && <Text style={{ fontSize: 8, color: Colors.white }}>✓</Text>}
                    </View>
                    {i < ORDERED_STATUSES.length - 1 && (
                      <View style={[styles.progressLine, { backgroundColor: i < currentStatusIdx ? Colors.primary : Colors.border }]} />
                    )}
                    <Text style={[styles.progressLabel, { color: isReached ? meta.color : Colors.textMuted }]}>
                      {meta.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

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
              {request.repairCost !== undefined && (
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Chi phí sửa</Text>
                  <Text style={[styles.metaValue, { color: Colors.success, fontWeight: '700' }]}>
                    {request.repairCost.toLocaleString('vi-VN')} đ
                  </Text>
                </View>
              )}
              {!!request.reopenCount && request.reopenCount > 0 && (
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Đã từ chối</Text>
                  <Text style={[styles.metaValue, { color: Colors.error }]}>{request.reopenCount} lần</Text>
                </View>
              )}
              {/* Khách làm hư → chi phí sẽ vào hóa đơn kỳ tới (luồng hóa đơn sau CLOSED). */}
              {(request.costPaidBy ?? '').toUpperCase() === 'TENANT' &&
                (request.repairCost ?? 0) > 0 && (
                <View style={styles.tenantPayNote}>
                  <Text style={styles.tenantPayNoteText}>
                    💰 Chi phí sửa chữa này do bạn chi trả (hư hỏng do sử dụng) — sẽ được
                    đưa vào hóa đơn kỳ tới. Xem trước ở tab Hóa đơn, mục "Khoản chờ thu".
                  </Text>
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

        {/* Lịch sử xử lý (Timeline) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📜 Lịch sử xử lý</Text>
          <View style={styles.timelineCard}>
            {[...request.timeline].reverse().map((event, i) => {
              const meta = STATUS_META[event.status] || STATUS_META.pending;
              const isFirst = i === 0;
              return (
                <View key={i} style={styles.timelineItem}>
                  <View style={styles.timelineLeft}>
                    <View style={[styles.timelineDot, { backgroundColor: isFirst ? meta.color : Colors.border }]}>
                      <Text style={{ fontSize: 8, color: Colors.white }}>
                        {isFirst ? '●' : ''}
                      </Text>
                    </View>
                    {i < request.timeline.length - 1 && (
                      <View style={styles.timelineConnector} />
                    )}
                  </View>
                  <View style={styles.timelineContent}>
                    <View style={styles.timelineHeader}>
                      <Text style={[styles.timelineStatus, { color: isFirst ? meta.color : Colors.textPrimary }]}>
                        {meta.label}
                      </Text>
                      <Text style={styles.timelineDate}>
                        {formatDateTime(event.updatedAt)}
                      </Text>
                    </View>
                    <Text style={styles.timelineNote}>{event.note}</Text>
                    <Text style={styles.timelineBy}>— {event.updatedBy}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Nghiệm thu (WAITING_TENANT_CONFIRM) */}
        {request.status === 'waiting_confirm' && !rejectMode && (
          <View style={styles.actionSection}>
            <Text style={styles.sectionTitle}>🛠 Quản lý báo đã sửa xong</Text>
            {!!request.resolutionNote && (
              <Text style={[styles.helpText, { color: Colors.textSecondary, marginBottom: Spacing.sm }]}>
                📝 {request.resolutionNote}
              </Text>
            )}
            <Text style={[styles.helpText, { color: Colors.textSecondary, marginBottom: Spacing.md }]}>
              Vui lòng kiểm tra và xác nhận. Không phản hồi sau {MAINTENANCE_AUTO_CONFIRM_DAYS} ngày,
              hệ thống sẽ tự xác nhận hoàn tất.
            </Text>
            <TouchableOpacity style={styles.confirmBtn} onPress={confirmDone} disabled={busy}>
              <Text style={styles.confirmBtnText}>✅ Đã OK — xác nhận hoàn tất</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reopenBtn} onPress={() => setRejectMode(true)}>
              <Text style={styles.reopenBtnText}>↩ Chưa ổn — gửi phản hồi</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Form từ chối nghiệm thu */}
        {request.status === 'waiting_confirm' && rejectMode && (
          <View style={styles.actionSection}>
            <Text style={styles.sectionTitle}>↩ Chưa ổn — cho biết lý do</Text>
            <TextInput
              style={styles.rejectInput}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="VD: Máy vẫn không lạnh sau khi thợ đến..."
              placeholderTextColor={Colors.textMuted}
              multiline
            />
            <View style={styles.rejectImagesRow}>
              {rejectUris.map((uri, i) => (
                <View key={`${uri}-${i}`} style={styles.rejectThumbWrap}>
                  <Image source={{ uri }} style={styles.rejectThumb} />
                  <TouchableOpacity
                    style={styles.rejectThumbRemove}
                    onPress={() => setRejectUris(prev => prev.filter((_, idx) => idx !== i))}
                  >
                    <Text style={styles.rejectThumbRemoveText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.rejectAddBtn} onPress={pickRejectImages}>
                <Text style={styles.rejectAddBtnText}>＋{'\n'}Ảnh</Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.helpText, { color: Colors.textMuted, marginBottom: Spacing.md }]}>
              Cần ít nhất 1 ảnh minh chứng để quản lý xem xét.
            </Text>
            <TouchableOpacity style={styles.rejectSubmitBtn} onPress={submitReject} disabled={busy}>
              <Text style={styles.confirmBtnText}>{busy ? 'Đang gửi...' : 'Gửi phản hồi chưa đạt'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reopenBtn} onPress={() => setRejectMode(false)}>
              <Text style={[styles.reopenBtnText, { color: Colors.textSecondary }]}>← Quay lại</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Đã từ chối — chờ manager xem xét */}
        {request.status === 'rejected' && (
          <View style={styles.actionSection}>
            <View style={[styles.helpCard, { backgroundColor: '#FEF2F2' }]}>
              <Text style={[styles.helpText, { color: '#B91C1C' }]}>
                ↩ Bạn đã từ chối nghiệm thu{request.rejectReason ? `: "${request.rejectReason}"` : ''}.
                Quản lý đang xem xét — bạn sẽ nhận thông báo khi có kết quả.
              </Text>
            </View>
          </View>
        )}

        {/* Nút liên hệ nếu đang xử lý */}
        {(request.status === 'pending' || request.status === 'approved') && (
          <View style={styles.actionSection}>
            <View style={styles.helpCard}>
              <Text style={styles.helpText}>
                {request.status === 'pending'
                  ? '⏳ Yêu cầu đang chờ quản lý duyệt. Cần hỗ trợ gấp? Liên hệ quản lý.'
                  : '🔧 Đã duyệt — thợ sẽ đến sửa. Cần hỗ trợ gấp? Liên hệ quản lý.'}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>

      <CameraCaptureModal
        visible={cameraOpen}
        multi
        onCapture={(uri) => setRejectUris(prev => [...prev, uri])}
        onClose={() => setCameraOpen(false)}
      />
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
  progressBar: { flexDirection: 'row', alignItems: 'flex-start' },
  progressStep: { flex: 1, alignItems: 'center' },
  progressDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  progressLine: { position: 'absolute', top: 12, left: '50%', right: '-50%', height: 2 },
  progressLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },

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
    backgroundColor: '#FFFBEB', borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: '#FDE68A',
    padding: Spacing.md, marginTop: Spacing.sm,
  },
  tenantPayNoteText: { fontSize: 12, color: '#92400E', lineHeight: 18 },

  imagesRow: { marginTop: Spacing.sm },
  attachmentImage: { width: 120, height: 120, borderRadius: BorderRadius.md, marginRight: Spacing.sm, backgroundColor: Colors.divider },

  timelineCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm },
  timelineItem: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  timelineLeft: { alignItems: 'center' },
  timelineDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  timelineConnector: { width: 2, flex: 1, backgroundColor: Colors.divider, marginTop: 4 },
  timelineContent: { flex: 1, paddingBottom: Spacing.md },
  timelineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  timelineStatus: { fontSize: 14, fontWeight: '700' },
  timelineDate: { fontSize: 11, color: Colors.textMuted },
  timelineNote: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  timelineBy: { fontSize: 11, color: Colors.textMuted, marginTop: 4, fontStyle: 'italic' },

  actionSection: { paddingHorizontal: Spacing.base, paddingBottom: 40 },
  helpCard: { backgroundColor: Colors.infoLight, borderRadius: BorderRadius.md, padding: Spacing.md },
  helpText: { fontSize: 13, color: Colors.info, lineHeight: 20 },

  confirmBtn: {
    backgroundColor: Colors.success, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', marginBottom: Spacing.sm, ...Shadow.sm,
  },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  reopenBtn: { alignItems: 'center', paddingVertical: Spacing.md },
  reopenBtnText: { fontSize: 14, fontWeight: '600', color: Colors.error },

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
  rejectSubmitBtn: {
    backgroundColor: Colors.error, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', marginBottom: Spacing.sm, ...Shadow.sm,
  },
});
