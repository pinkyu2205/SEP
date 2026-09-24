import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { MaintenanceRequest, MaintenanceStatus } from '@/types';
import { formatDate } from '@/utils';
import { realMaintenanceService } from '@/services/shared/maintenanceService';
import { dtoToTenantRequest } from '@/services/shared/maintenanceMappers';
import { MAINTENANCE_STATUS_META, MAINTENANCE_CATEGORY_EMOJI } from '@/constants/maintenance';
import { useMaintenanceRealtime } from '@/hooks/useBillingRealtime';

/**
 * SỬA CHỮA (tenant) — làm lại 24/09/2026.
 *
 * Bản trước: 3 ô đếm (Chờ xử lý/Đang sửa/Hoàn tất) + 4 chip lọc nói lại đúng chừng đó,
 * nút "Lịch sử" trùng với chip "Hoàn tất", và nút "Báo hỏng" ở trạng thái rỗng bị menu
 * FAB đè lên. Giờ:
 *   • Khối "Báo sự cố" luôn hiện 3 lối vào (quét QR · chọn thiết bị · sự cố khác) —
 *     không còn FAB, không còn menu che nội dung.
 *   • 2 tab duy nhất có số đếm: Đang xử lý · Đã xong (gồm cả phiếu đã huỷ).
 *   • Thẻ phiếu gọn: thanh tiến độ 3 bước có chữ, cập nhật mới nhất 1 dòng.
 */

type Tab = 'active' | 'done';

const DONE: MaintenanceStatus[] = ['closed', 'cancelled'];
const isDone = (r: MaintenanceRequest) => DONE.includes(r.status as MaintenanceStatus);

const STEPS = ['Tiếp nhận', 'Sửa chữa', 'Hoàn tất'];
/** Bước hiện tại trên thanh tiến độ. Nhánh phụ (lỗi khách, chờ thanh toán…) nằm ở bước 2. */
const stepOf = (s: string) => (s === 'open' ? 0 : s === 'closed' ? 2 : 1);

const REPORT_OPTIONS = [
  { key: 'scan', icon: '📷', label: 'Quét QR', sub: 'trên thiết bị', route: 'Scan' },
  { key: 'list', icon: '📦', label: 'Chọn thiết bị', sub: 'trong phòng', route: 'RoomEquipment' },
  { key: 'other', icon: '📝', label: 'Sự cố khác', sub: 'sàn, tường, cửa…', route: 'MaintenanceCreate' },
] as const;

const RepairCard: React.FC<{ item: MaintenanceRequest; onPress: () => void }> = ({ item, onPress }) => {
  const meta = MAINTENANCE_STATUS_META[item.status as keyof typeof MAINTENANCE_STATUS_META]
    ?? { label: item.status, color: Colors.textMuted, bg: Colors.divider };
  const latest = item.timeline[item.timeline.length - 1];
  const cancelled = item.status === 'cancelled';
  const step = stepOf(item.status);
  const icon = (item.category && MAINTENANCE_CATEGORY_EMOJI[item.category]) ?? '🔧';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.cardTop}>
        <View style={[styles.catIcon, { backgroundColor: meta.bg }]}>
          <Text style={{ fontSize: 18 }}>{icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.equipmentName || item.title}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>{item.ticketCode} · {formatDate(item.createdAt)}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
          <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      {!!item.description && <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>}

      {!cancelled && (
        <View style={styles.steps}>
          {STEPS.map((label, i) => {
            const reached = i <= step;
            return (
              <View key={label} style={styles.stepCol}>
                <View style={[styles.stepBar, reached && { backgroundColor: i === 2 ? Colors.success : Colors.primary }]} />
                <Text style={[styles.stepLabel, reached && styles.stepLabelOn]}>{label}</Text>
              </View>
            );
          })}
        </View>
      )}

      {!!latest?.note && (
        <Text style={styles.update} numberOfLines={1}>
          💬 {latest.note} · {formatDate(latest.updatedAt)}
        </Text>
      )}

      {item.status === 'closed' && !!item.invoiceAmount && (
        <Text style={styles.cost}>Chi phí: {item.invoiceAmount.toLocaleString('vi-VN')} đ</Text>
      )}
    </TouchableOpacity>
  );
};

export const MaintenanceListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [tab, setTab] = useState<Tab>('active');
  const [remote, setRemote] = useState<MaintenanceRequest[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Lỗi API → báo rõ ràng thay vì âm thầm hiện danh sách rỗng.
  const [loadError, setLoadError] = useState(false);

  const silentLoad = React.useCallback(() => {
    let active = true;
    realMaintenanceService.getMyRequests({ size: 200 })
      .then(page => {
        if (!active) return;
        setRemote(page.content.map(dtoToTenantRequest));
        setLoadError(false);
      })
      .catch(() => {
        if (!active) return;
        // Chỉ báo lỗi khi chưa từng tải được gì — đã có dữ liệu thì giữ nguyên.
        setRemote(prev => {
          if (prev == null) setLoadError(true);
          return prev;
        });
      });
    return () => { active = false; };
  }, []);

  useFocusEffect(React.useCallback(() => silentLoad(), [silentLoad]));

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    realMaintenanceService.getMyRequests({ size: 200 })
      .then(page => { setRemote(page.content.map(dtoToTenantRequest)); setLoadError(false); })
      .catch(() => { /* giữ dữ liệu hiện tại */ })
      .finally(() => setRefreshing(false));
  }, []);

  // Ticket đổi trạng thái (manager duyệt/báo sửa xong…) → nạp ngầm.
  useMaintenanceRealtime({ onRefresh: silentLoad });

  const all = remote ?? [];
  const activeList = all.filter(r => !isDone(r));
  const doneList = all.filter(isDone);
  const list = (tab === 'active' ? activeList : doneList)
    .slice()
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  const header = (
    <View style={{ gap: Spacing.md, marginBottom: Spacing.md }}>
      {/* Báo sự cố — 3 lối vào luôn hiện */}
      <View style={styles.reportCard}>
        <Text style={styles.reportTitle}>Có gì bị hỏng?</Text>
        <View style={styles.reportRow}>
          {REPORT_OPTIONS.map(o => (
            <TouchableOpacity
              key={o.key}
              style={styles.reportOpt}
              activeOpacity={0.8}
              onPress={() => navigation.navigate(o.route)}
            >
              <View style={styles.reportIcon}><Text style={{ fontSize: 20 }}>{o.icon}</Text></View>
              <Text style={styles.reportLabel}>{o.label}</Text>
              <Text style={styles.reportSub}>{o.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 2 tab */}
      <View style={styles.segment}>
        {([
          { key: 'active', label: 'Đang xử lý', count: activeList.length },
          { key: 'done', label: 'Đã xong', count: doneList.length },
        ] as const).map(t => {
          const on = tab === t.key;
          return (
            <TouchableOpacity key={t.key} style={[styles.segBtn, on && styles.segBtnOn]} onPress={() => setTab(t.key)}>
              <Text style={[styles.segText, on && styles.segTextOn]}>{t.label}</Text>
              <View style={[styles.segCount, on && styles.segCountOn]}>
                <Text style={[styles.segCountText, on && styles.segCountTextOn]}>{t.count}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Sửa chữa</Text>
        <Text style={styles.subtitle}>Báo hỏng và theo dõi tiến độ sửa</Text>
      </View>

      <FlatList
        data={list}
        keyExtractor={r => r.id}
        renderItem={({ item }) => (
          <RepairCard item={item} onPress={() => navigation.navigate('MaintenanceDetail', { request: item })} />
        )}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
        ListEmptyComponent={
          loadError ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>⚠️</Text>
              <Text style={styles.emptyTitle}>Không tải được danh sách</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={onRefresh}>
                <Text style={styles.retryText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          ) : remote == null ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>{tab === 'active' ? '✅' : '🗂️'}</Text>
              <Text style={styles.emptyTitle}>
                {tab === 'active' ? 'Không có sự cố nào đang xử lý' : 'Chưa có phiếu nào hoàn tất'}
              </Text>
              {tab === 'active' && (
                <Text style={styles.emptyDesc}>Có gì hỏng, chọn một cách báo ở khối phía trên.</Text>
              )}
            </View>
          )
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },

  list: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xs, paddingBottom: 110 },

  // Báo sự cố
  reportCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  reportTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.sm },
  reportRow: { flexDirection: 'row', gap: Spacing.sm },
  reportOpt: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.md, paddingHorizontal: 4,
    borderRadius: BorderRadius.lg, backgroundColor: Colors.primaryBg,
  },
  reportIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.white,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  reportLabel: { fontSize: 12, fontWeight: '800', color: Colors.primary, textAlign: 'center' },
  reportSub: { fontSize: 10, color: Colors.textMuted, marginTop: 1, textAlign: 'center' },

  // Tab
  segment: {
    flexDirection: 'row', backgroundColor: Colors.divider, borderRadius: BorderRadius.full, padding: 3,
  },
  segBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 8, borderRadius: BorderRadius.full,
  },
  segBtnOn: { backgroundColor: Colors.white, ...Shadow.sm },
  segText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  segTextOn: { color: Colors.textPrimary },
  segCount: {
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5,
    backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center',
  },
  segCountOn: { backgroundColor: Colors.primary },
  segCountText: { fontSize: 11, fontWeight: '800', color: Colors.textMuted },
  segCountTextOn: { color: Colors.white },

  // Thẻ phiếu
  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  catIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  cardMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: BorderRadius.full },
  statusText: { fontSize: 11, fontWeight: '700' },
  cardDesc: { fontSize: 13, color: Colors.textSecondary, marginTop: Spacing.sm, lineHeight: 19 },

  steps: { flexDirection: 'row', gap: 4, marginTop: Spacing.md },
  stepCol: { flex: 1 },
  stepBar: { height: 4, borderRadius: 2, backgroundColor: Colors.divider },
  stepLabel: { fontSize: 10, color: Colors.textMuted, marginTop: 4, fontWeight: '600' },
  stepLabelOn: { color: Colors.textPrimary },

  update: { fontSize: 12, color: Colors.textSecondary, marginTop: Spacing.sm },
  cost: { fontSize: 12, fontWeight: '700', color: Colors.success, marginTop: Spacing.sm },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 6, paddingHorizontal: Spacing.lg },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  emptyDesc: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
  retryBtn: {
    marginTop: Spacing.sm, backgroundColor: Colors.primary, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm,
  },
  retryText: { color: Colors.white, fontWeight: '700' },
});
