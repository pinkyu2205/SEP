import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { formatDate, getMaintenanceCategoryLabel } from '@/utils';
import { MaintenanceRequest, MaintenanceStatus } from '@/types';
import { realMaintenanceService } from '@/services/shared/maintenanceService';
import { dtoToTenantRequest } from '@/services/shared/maintenanceMappers';

// Lịch sử = ticket đã kết thúc (flow mới: closed hoặc cancelled).
const HISTORY_STATUSES: MaintenanceStatus[] = ['closed', 'cancelled'];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  closed:    { label: 'Hoàn tất', color: Colors.success, bg: Colors.successLight },
  cancelled: { label: 'Đã hủy',   color: Colors.textMuted, bg: Colors.divider },
};

const CATEGORY_EMOJI: Record<string, string> = {
  electrical: '⚡', plumbing: '🚰', furniture: '🪑', appliance: '📺', other: '🔧',
};

export const MaintenanceHistoryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  // Dữ liệu THẬT từ my-requests (trước đây đọc store mock thuần — khác hẳn màn
  // List/Detail cùng luồng đã nối real).
  const [allRequests, setAllRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const page = await realMaintenanceService.getMyRequests({ size: 200 });
      setAllRequests((page.content ?? []).map(dtoToTenantRequest));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const historyItems = allRequests.filter(r =>
    HISTORY_STATUSES.includes(r.status as MaintenanceStatus)
  );

  const renderItem = ({ item }: { item: MaintenanceRequest }) => {
    const cfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.cancelled;
    const resolvedEntry = item.timeline.find(t => t.status === 'closed' || t.status === 'cancelled');

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.75}
        onPress={() => navigation.navigate('MaintenanceDetail', { request: item })}
      >
        <View style={styles.cardTop}>
          <View style={[styles.categoryBadge, { backgroundColor: Colors.primaryBg }]}>
            <Text style={{ fontSize: 20 }}>{(item.category && CATEGORY_EMOJI[item.category]) || '🔧'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.ticketCode}>
              {item.ticketCode} · {getMaintenanceCategoryLabel(item.category)}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            📅 Tạo: {formatDate(item.createdAt)}
          </Text>
          {(item.resolvedAt || resolvedEntry?.updatedAt) && (
            <Text style={styles.metaText}>
              ✅ {item.status === 'closed' ? 'Hoàn tất' : 'Hủy'}: {formatDate((item.resolvedAt ?? resolvedEntry?.updatedAt ?? '').slice(0, 10))}
            </Text>
          )}
        </View>

        {item.assignedTo && (
          <Text style={styles.assignedText}>👷 {item.assignedTo}</Text>
        )}

        {item.repairCost != null && item.repairCost > 0 && (
          <View style={styles.costBanner}>
            <Text style={styles.costText}>
              Chi phí sửa chữa: {item.repairCost.toLocaleString('vi-VN')} đ
            </Text>
          </View>
        )}

        {resolvedEntry?.note && (
          <Text style={styles.noteText}>"{resolvedEntry.note}"</Text>
        )}
        <View style={styles.detailFooter}>
          <Text style={styles.detailLink}>Xem chi tiết →</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Lịch sử bảo trì</Text>
          <Text style={styles.subtitle}>{historyItems.length} yêu cầu đã xử lý</Text>
        </View>
      </View>

      <FlatList
        data={historyItems}
        renderItem={renderItem}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={Colors.primary} size="large" />
            </View>
          ) : loadError ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>⚠️</Text>
              <Text style={styles.emptyTitle}>Không tải được lịch sử</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); load(); }}>
                <Text style={styles.retryBtnText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🔧</Text>
              <Text style={styles.emptyTitle}>Chưa có lịch sử</Text>
              <Text style={styles.emptyDesc}>Các yêu cầu đã nghiệm thu, hoàn tất hoặc hủy sẽ hiển thị ở đây.</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center',
    ...Shadow.sm,
  },
  backBtnText: { fontSize: 20, color: Colors.textPrimary, lineHeight: 24 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: 40 },

  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, ...Shadow.md,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  categoryBadge: {
    width: 44, height: 44, borderRadius: BorderRadius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  ticketCode: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  statusText: { fontSize: 11, fontWeight: '700' },

  metaRow: { flexDirection: 'row', gap: Spacing.lg, marginBottom: Spacing.xs },
  metaText: { fontSize: 12, color: Colors.textSecondary },
  assignedText: { fontSize: 12, color: Colors.textSecondary, marginBottom: Spacing.sm },

  costBanner: {
    backgroundColor: Colors.successLight, borderRadius: BorderRadius.md,
    padding: Spacing.sm, marginTop: Spacing.sm,
  },
  costText: { fontSize: 13, fontWeight: '700', color: Colors.success },

  noteText: {
    fontSize: 13, color: Colors.textMuted, fontStyle: 'italic',
    marginTop: Spacing.sm, lineHeight: 18,
  },
  detailFooter: { marginTop: Spacing.sm, alignItems: 'flex-end' },
  detailLink: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  empty: { paddingTop: 80, alignItems: 'center' },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.base },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  retryBtn: {
    marginTop: Spacing.sm, backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg,
  },
  retryBtnText: { color: Colors.white, fontWeight: '700' },
});
