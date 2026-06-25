import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { MaintenanceRequest, MaintenanceStatus, MaintenanceTimeline } from '../../types';
import {
  formatDate, formatDateTime, getMaintenanceCategoryLabel,
  getMaintenancePriorityLabel, getMaintenancePriorityColor,
} from '../../utils';
import {
  MAINTENANCE_STATUS_META, MAINTENANCE_STATUS_FLOW, MAINTENANCE_CATEGORY_EMOJI,
} from '../../constants/maintenance';
import { useTenantRequests, tenantMaintenanceStore } from '../../store/maintenanceStore';

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
  ({ status, note, updatedBy: 'Nguyễn Văn A', updatedAt: nowIso() });

export const MaintenanceDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { request: routeRequest } = route.params as { request: MaintenanceRequest };

  // Ưu tiên dữ liệu live trong store (mock) để phản ánh thao tác nghiệm thu.
  const allTenant = useTenantRequests();
  const live = allTenant.find(r => r.id === routeRequest.id);
  const isMock = !!live;
  const request = live ?? routeRequest;

  const currentStatusMeta = STATUS_META[request.status] || STATUS_META.pending;
  const currentStatusIdx = ORDERED_STATUSES.indexOf(request.status as MaintenanceStatus);
  const priorityColor = getMaintenancePriorityColor(request.priority);

  const confirmSlot = (slot: string) => {
    tenantMaintenanceStore.update(request.id, {
      confirmedSlot: formatDate(slot),
      estimatedCompletionDate: slot,
      timeline: [...request.timeline, mkTenantEntry('scheduled', `Khách xác nhận lịch hẹn: ${formatDate(slot)}`)],
      updatedAt: nowIso().slice(0, 10),
    });
  };
  const confirmDone = () => {
    tenantMaintenanceStore.update(request.id, {
      status: 'confirmed',
      tenantConfirmedAt: nowIso().slice(0, 10),
      resolvedAt: nowIso().slice(0, 10),
      timeline: [...request.timeline, mkTenantEntry('confirmed', 'Khách đã nghiệm thu, đồng ý hoàn tất')],
      updatedAt: nowIso().slice(0, 10),
    });
    Alert.alert('✅ Cảm ơn bạn', 'Yêu cầu đã được xác nhận hoàn tất.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
  };
  const reopen = () => {
    tenantMaintenanceStore.update(request.id, {
      status: 'in_progress',
      timeline: [...request.timeline, mkTenantEntry('in_progress', 'Khách phản hồi chưa đạt — mở lại yêu cầu')],
      updatedAt: nowIso().slice(0, 10),
    });
    Alert.alert('Đã mở lại', 'Yêu cầu đã được mở lại để xử lý tiếp.');
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
        {request.status !== 'cancelled' && (
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
              <Text style={styles.categoryEmoji}>{CATEGORY_EMOJI[request.category]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.requestTitle}>{request.title}</Text>
                <Text style={styles.requestCategory}>{getMaintenanceCategoryLabel(request.category)}</Text>
              </View>
              <View style={[styles.priorityBadge, { backgroundColor: priorityColor + '20' }]}>
                <Text style={[styles.priorityText, { color: priorityColor }]}>
                  {getMaintenancePriorityLabel(request.priority)}
                </Text>
              </View>
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
                  <Text style={styles.metaLabel}>Thợ phụ trách</Text>
                  <Text style={styles.metaValue}>👷 {request.assignedTo}</Text>
                </View>
              )}
              {request.estimatedCompletionDate && (
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>Lịch hẹn sửa</Text>
                  <Text style={[styles.metaValue, { color: Colors.primary }]}>
                    {formatDate(request.estimatedCompletionDate)}
                  </Text>
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

        {/* Ảnh đính kèm */}
        {request.images && request.images.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🖼️ Ảnh đính kèm</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imagesRow}>
              {request.images.map((uri, i) => (
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

        {/* Xác nhận lịch hẹn (khách chọn khung giờ manager đề xuất) */}
        {isMock && request.status === 'scheduled' && (request.scheduledSlots?.length ?? 0) > 0 && !request.confirmedSlot && (
          <View style={styles.actionSection}>
            <Text style={styles.sectionTitle}>📅 Chọn khung giờ phù hợp</Text>
            {request.scheduledSlots!.map(slot => (
              <TouchableOpacity key={slot} style={styles.slotBtn} onPress={() => confirmSlot(slot)}>
                <Text style={styles.slotBtnText}>Xác nhận: {formatDate(slot)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Nghiệm thu khi đã sửa xong (DONE) */}
        {isMock && request.status === 'done' && (
          <View style={styles.actionSection}>
            <Text style={styles.sectionTitle}>🛠 Thợ báo đã sửa xong</Text>
            <Text style={[styles.helpText, { color: Colors.textSecondary, marginBottom: Spacing.md }]}>
              Vui lòng kiểm tra và xác nhận. Nếu chưa đạt, bạn có thể mở lại yêu cầu.
            </Text>
            <TouchableOpacity style={styles.confirmBtn} onPress={confirmDone}>
              <Text style={styles.confirmBtnText}>✅ Xác nhận đã ổn, hoàn tất</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reopenBtn} onPress={reopen}>
              <Text style={styles.reopenBtnText}>↩ Chưa đạt — mở lại yêu cầu</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Nút liên hệ nếu đang xử lý */}
        {(request.status === 'pending' || request.status === 'in_progress') && (
          <View style={styles.actionSection}>
            <View style={styles.helpCard}>
              <Text style={styles.helpText}>
                ❓ Cần hỗ trợ gấp? Liên hệ quản lý.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
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

  imagesRow: { marginTop: Spacing.sm },
  attachmentImage: { width: 120, height: 120, borderRadius: BorderRadius.md, marginRight: Spacing.sm },

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

  slotBtn: {
    backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.primary,
    borderRadius: BorderRadius.md, paddingVertical: Spacing.md, alignItems: 'center', marginBottom: Spacing.sm,
  },
  slotBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  confirmBtn: {
    backgroundColor: Colors.success, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', marginBottom: Spacing.sm, ...Shadow.sm,
  },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  reopenBtn: { alignItems: 'center', paddingVertical: Spacing.md },
  reopenBtnText: { fontSize: 14, fontWeight: '600', color: Colors.error },
});
