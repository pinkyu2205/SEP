import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { MaintenanceRequest, MaintenanceStatus } from '../../types';
import {
  formatDate, formatDateTime, getMaintenanceCategoryLabel,
  getMaintenancePriorityLabel, getMaintenancePriorityColor,
} from '../../utils';

const CATEGORY_EMOJI: Record<string, string> = {
  electrical: '⚡', plumbing: '🚰', furniture: '🪑', appliance: '📺', other: '🔧',
};

const STATUS_META: Record<string, { label: string; color: string; emoji: string }> = {
  pending: { label: 'Chờ xử lý', color: Colors.warning, emoji: '🕐' },
  accepted: { label: 'Đã tiếp nhận', color: Colors.info, emoji: '📋' },
  in_progress: { label: 'Đang xử lý', color: Colors.primary, emoji: '🔧' },
  resolved: { label: 'Hoàn tất', color: Colors.success, emoji: '✅' },
  cancelled: { label: 'Đã hủy', color: Colors.textMuted, emoji: '❌' },
};

const ORDERED_STATUSES: MaintenanceStatus[] = ['pending', 'accepted', 'in_progress', 'resolved'];

export const MaintenanceDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { request } = route.params as { request: MaintenanceRequest };

  const currentStatusMeta = STATUS_META[request.status] || STATUS_META.pending;
  const currentStatusIdx = ORDERED_STATUSES.indexOf(request.status as MaintenanceStatus);
  const priorityColor = getMaintenancePriorityColor(request.priority);

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
                  <Text style={styles.metaLabel}>Dự kiến xong</Text>
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
});
