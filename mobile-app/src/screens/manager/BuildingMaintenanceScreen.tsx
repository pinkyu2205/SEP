import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { getPropertyById, getBuildingOps, BuildingMaintenance, MaintenanceStatus } from '../../data/managedProperties';

const FILTERS: { id: 'all' | MaintenanceStatus; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'pending', label: 'Chờ xử lý' },
  { id: 'in_progress', label: 'Đang xử lý' },
  { id: 'done', label: 'Hoàn thành' },
];

const STATUS_META: Record<MaintenanceStatus, { label: string; color: string; bg: string; next?: MaintenanceStatus; nextLabel?: string }> = {
  pending: { label: 'Chờ xử lý', color: '#D97706', bg: '#FEF3C7', next: 'in_progress', nextLabel: 'Bắt đầu xử lý' },
  in_progress: { label: 'Đang xử lý', color: '#3B82F6', bg: '#EFF6FF', next: 'done', nextLabel: 'Hoàn thành' },
  done: { label: 'Hoàn thành', color: '#16A34A', bg: '#F0FDF4' },
};

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

export const BuildingMaintenanceScreen: React.FC<any> = ({ navigation, route }) => {
  const propertyId: string = route?.params?.propertyId;
  const prop = getPropertyById(propertyId);
  const [tickets, setTickets] = useState<BuildingMaintenance[]>(() => getBuildingOps(propertyId).maintenance);
  const [filter, setFilter] = useState<'all' | MaintenanceStatus>('all');

  const list = filter === 'all' ? tickets : tickets.filter(t => t.status === filter);
  const urgentCount = tickets.filter(t => t.urgency === 'urgent' && t.status !== 'done').length;

  const advance = (t: BuildingMaintenance) => {
    const meta = STATUS_META[t.status];
    if (!meta.next) return;
    Alert.alert(meta.nextLabel || '', `Cập nhật phiếu bảo trì "${t.title}" (${t.room})?`, [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Xác nhận', onPress: () => setTickets(prev => prev.map(x => x.id === t.id ? { ...x, status: meta.next! } : x)) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Bảo trì</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{prop?.name || ''}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      {urgentCount > 0 && (
        <View style={styles.warnBanner}>
          <Text style={styles.warnText}>🔧 {urgentCount} phiếu khẩn cấp đang chờ xử lý</Text>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f.id} style={[styles.chip, filter === f.id && styles.chipActive]} onPress={() => setFilter(f.id)}>
            <Text style={[styles.chipText, filter === f.id && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {list.length === 0 ? (
          <Text style={styles.empty}>Không có phiếu bảo trì</Text>
        ) : list.map(t => {
          const st = STATUS_META[t.status];
          return (
            <View key={t.id} style={[styles.card, { borderLeftColor: t.urgency === 'urgent' ? '#EF4444' : '#F59E0B' }]}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>
                    {t.urgency === 'urgent' ? '🚨 ' : ''}{t.title}
                  </Text>
                  <Text style={styles.cardMeta}>{t.room} · báo {t.reportedDate}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: st.bg }]}>
                  <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
                </View>
              </View>

              <View style={styles.imageRow}>
                <View style={styles.imageBox}><Text style={styles.imageHint}>📷 Trước</Text></View>
                <View style={styles.imageBox}><Text style={styles.imageHint}>📷 Sau</Text></View>
                {t.cost != null && (
                  <View style={styles.costBox}>
                    <Text style={styles.costLabel}>Chi phí</Text>
                    <Text style={styles.costVal}>{fmt(t.cost)}</Text>
                  </View>
                )}
              </View>

              {st.next && (
                <TouchableOpacity style={styles.advanceBtn} onPress={() => advance(t)}>
                  <Text style={styles.advanceBtnText}>{st.nextLabel}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: Colors.white, ...Shadow.sm },
  backText: { color: Colors.primary, fontWeight: '600', fontSize: 15, width: 60 },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },

  warnBanner: { backgroundColor: '#FEE2E2', marginHorizontal: Spacing.lg, marginTop: Spacing.md, borderRadius: BorderRadius.lg, padding: Spacing.md },
  warnText: { fontSize: 13, fontWeight: '600', color: '#EF4444' },

  filterRow: { flexGrow: 0, marginTop: Spacing.md },
  filterContent: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  chip: { height: 32, justifyContent: 'center', paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },

  scroll: { padding: Spacing.lg },
  empty: { textAlign: 'center', color: Colors.textMuted, paddingVertical: Spacing.xl },

  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm, borderLeftWidth: 3 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  cardMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  badgeText: { fontSize: 11, fontWeight: '700' },

  imageRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, alignItems: 'center' },
  imageBox: { width: 64, height: 48, borderRadius: BorderRadius.md, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  imageHint: { fontSize: 10, color: Colors.textMuted },
  costBox: { marginLeft: 'auto', alignItems: 'flex-end' },
  costLabel: { fontSize: 10, color: Colors.textSecondary },
  costVal: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },

  advanceBtn: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: Spacing.sm, alignItems: 'center', marginTop: Spacing.md },
  advanceBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },
});
