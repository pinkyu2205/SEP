import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { getPropertyById, getBuildingOps, BuildingRoom, RoomStatus } from '../../data/managedProperties';
import {
  getInspectionsByRoom,
  getInspectionStatusLabel,
  getInspectionTypeLabel,
  RoomInspection,
} from '../../data/roomInspections';

const STATUS_META: Record<RoomStatus, { label: string; color: string; bg: string; dot: string }> = {
  occupied: { label: 'Äang thuĂª', color: '#3B82F6', bg: '#EFF6FF', dot: '#3B82F6' },
  available: { label: 'Trá»‘ng', color: '#16A34A', bg: '#F0FDF4', dot: '#16A34A' },
  maintenance: { label: 'Báº£o trĂ¬', color: '#D97706', bg: '#FEF3C7', dot: '#F59E0B' },
};

const FILTERS: { id: 'all' | RoomStatus; label: string }[] = [
  { id: 'all', label: 'Táº¥t cáº£' },
  { id: 'occupied', label: 'Äang thuĂª' },
  { id: 'available', label: 'Trá»‘ng' },
  { id: 'maintenance', label: 'Báº£o trĂ¬' },
];

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'Ä‘';

export const BuildingRoomScreen: React.FC<any> = ({ navigation, route }) => {
  const propertyId: string = route?.params?.propertyId;
  const prop = getPropertyById(propertyId);
  const [rooms, setRooms] = useState<BuildingRoom[]>(() => getBuildingOps(propertyId).rooms);
  const [filter, setFilter] = useState<'all' | RoomStatus>('all');
  const [tab, setTab] = useState<'rooms' | 'inspections'>('rooms');

  const counts = useMemo(() => ({
    occupied: rooms.filter(r => r.status === 'occupied').length,
    available: rooms.filter(r => r.status === 'available').length,
    maintenance: rooms.filter(r => r.status === 'maintenance').length,
  }), [rooms]);

  const filtered = filter === 'all' ? rooms : rooms.filter(r => r.status === filter);
  const floors = useMemo(() => Array.from(new Set(filtered.map(r => r.floor))).sort((a, b) => a - b), [filtered]);
  const inspectionHistory = useMemo(
    () => getInspectionsByRoom(propertyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [propertyId]
  );

  const checkOut = (r: BuildingRoom) => {
    const latestInspection = getInspectionsByRoom(propertyId, r.code)[0];
    Alert.alert('Tráº£ phĂ²ng', `Lập biên bản check-out phòng ${r.code} (${r.tenantName})?`, [
      { text: 'Huá»·', style: 'cancel' },
      {
        text: 'Chụp hiện trạng',
        onPress: () => navigation.navigate('InspectionDetail', {
          mode: 'create_check_out',
          contractId: latestInspection?.contractId,
          tenantId: latestInspection?.tenantId,
          tenantName: r.tenantName,
          propertyId,
          propertyName: prop?.name,
          roomId: r.id,
          roomCode: r.code,
        }),
      },
    ]);
  };

  const checkIn = (r: BuildingRoom) => {
    Alert.alert('ÄĂ³n khĂ¡ch', `Táº¡o check-in cho phĂ²ng ${r.code}?`, [
      { text: 'Huá»·', style: 'cancel' },
      { text: 'ÄĂ³n khĂ¡ch', onPress: () => navigation.navigate('Onboarding') },
    ]);
  };

  const finishMaintenance = (r: BuildingRoom) => {
    Alert.alert('HoĂ n táº¥t báº£o trĂ¬', `ÄÆ°a phĂ²ng ${r.code} vá» tráº¡ng thĂ¡i sáºµn sĂ ng?`, [
      { text: 'Huá»·', style: 'cancel' },
      { text: 'XĂ¡c nháº­n', onPress: () => setRooms(prev => prev.map(x => x.id === r.id ? { ...x, status: 'available' } : x)) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>â† Quay láº¡i</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>PhĂ²ng</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{prop?.name || ''}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabBtn, tab === 'rooms' && styles.tabBtnActive]} onPress={() => setTab('rooms')}>
          <Text style={[styles.tabText, tab === 'rooms' && styles.tabTextActive]}>Phòng</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === 'inspections' && styles.tabBtnActive]} onPress={() => setTab('inspections')}>
          <Text style={[styles.tabText, tab === 'inspections' && styles.tabTextActive]}>Lịch sử hiện trạng</Text>
        </TouchableOpacity>
      </View>

      {tab === 'rooms' && <View style={styles.summaryRow}>
        <View style={[styles.summaryBox, { backgroundColor: '#EFF6FF' }]}>
          <Text style={[styles.summaryNum, { color: '#3B82F6' }]}>{counts.occupied}</Text>
          <Text style={styles.summaryLabel}>Äang thuĂª</Text>
        </View>
        <View style={[styles.summaryBox, { backgroundColor: '#F0FDF4' }]}>
          <Text style={[styles.summaryNum, { color: '#16A34A' }]}>{counts.available}</Text>
          <Text style={styles.summaryLabel}>Trá»‘ng</Text>
        </View>
        <View style={[styles.summaryBox, { backgroundColor: '#FEF3C7' }]}>
          <Text style={[styles.summaryNum, { color: '#D97706' }]}>{counts.maintenance}</Text>
          <Text style={styles.summaryLabel}>Báº£o trĂ¬</Text>
        </View>
      </View>}

      {tab === 'rooms' && <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f.id} style={[styles.chip, filter === f.id && styles.chipActive]} onPress={() => setFilter(f.id)}>
            <Text style={[styles.chipText, filter === f.id && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {tab === 'inspections' ? (
          inspectionHistory.length === 0 ? (
            <View style={styles.emptyInspectionState}>
              <Text style={styles.emptyInspectionTitle}>Chưa có biên bản hiện trạng.</Text>
              <Text style={styles.emptyInspectionText}>Lịch sử ở đây chỉ là quick-view; dữ liệu gốc vẫn thuộc về hợp đồng.</Text>
            </View>
          ) : inspectionHistory.map(inspection => (
            <RoomInspectionHistoryCard
              key={inspection.id}
              inspection={inspection}
              onPress={() => navigation.navigate('InspectionDetail', { inspectionId: inspection.id })}
            />
          ))
        ) : floors.length === 0 ? (
          <Text style={styles.empty}>KhĂ´ng cĂ³ phĂ²ng</Text>
        ) : floors.map(floor => (
          <View key={floor} style={styles.floorGroup}>
            <Text style={styles.floorTitle}>Táº§ng {floor}</Text>
            {filtered.filter(r => r.floor === floor).map(r => {
              const st = STATUS_META[r.status];
              return (
                <View key={r.id} style={styles.roomCard}>
                  <View style={[styles.statusDot, { backgroundColor: st.dot }]} />
                  <View style={{ flex: 1 }}>
                    <View style={styles.roomTitleRow}>
                      <Text style={styles.roomCode}>{r.code}</Text>
                      <View style={[styles.badge, { backgroundColor: st.bg }]}>
                        <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.roomMeta}>
                      {r.area}mÂ² Â· {fmt(r.rentPrice)}/th{r.tenantName ? ` Â· ${r.tenantName}` : ''}
                    </Text>
                  </View>
                  {r.status === 'occupied' && (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => checkOut(r)}>
                      <Text style={styles.actionBtnText}>Tráº£ phĂ²ng</Text>
                    </TouchableOpacity>
                  )}
                  {r.status === 'available' && (
                    <TouchableOpacity style={[styles.actionBtn, styles.actionPrimary]} onPress={() => checkIn(r)}>
                      <Text style={[styles.actionBtnText, { color: Colors.white }]}>ÄĂ³n khĂ¡ch</Text>
                    </TouchableOpacity>
                  )}
                  {r.status === 'maintenance' && (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => finishMaintenance(r)}>
                      <Text style={styles.actionBtnText}>HoĂ n táº¥t</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        ))}
        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const RoomInspectionHistoryCard = ({
  inspection,
  onPress,
}: {
  inspection: RoomInspection;
  onPress: () => void;
}) => (
  <TouchableOpacity style={styles.historyCard} onPress={onPress} activeOpacity={0.82}>
    <View style={styles.historyRail}>
      <View style={styles.historyDot} />
      <View style={styles.historyLine} />
    </View>
    <View style={styles.historyBody}>
      <View style={styles.historyTop}>
        <Text style={styles.historyTitle}>{getInspectionTypeLabel(inspection.inspectionType)} · {inspection.roomCode || 'Nhà nguyên căn'}</Text>
        <Text style={styles.historyBadge}>{getInspectionStatusLabel(inspection.status)}</Text>
      </View>
      <Text style={styles.historyMeta}>{inspection.tenantName} · HĐ {inspection.contractId}</Text>
      <Text style={styles.historyMeta}>{inspection.createdAt} · {inspection.images.length} ảnh · {inspection.createdBy}</Text>
      <Text style={styles.historyNote} numberOfLines={2}>{inspection.notes || 'Chưa có ghi chú hiện trạng.'}</Text>
    </View>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: Colors.white, ...Shadow.sm },
  backText: { color: Colors.primary, fontWeight: '600', fontSize: 15, width: 60 },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },

  summaryRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  tabRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: BorderRadius.md },
  tabBtnActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: 12, fontWeight: '800', color: Colors.textSecondary },
  tabTextActive: { color: Colors.white },
  summaryBox: { flex: 1, borderRadius: BorderRadius.lg, padding: Spacing.md, alignItems: 'center' },
  summaryNum: { fontSize: 20, fontWeight: '800' },
  summaryLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  filterRow: { flexGrow: 0, marginTop: Spacing.md },
  filterContent: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  chip: { height: 32, justifyContent: 'center', paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },

  scroll: { padding: Spacing.lg },
  empty: { textAlign: 'center', color: Colors.textMuted, paddingVertical: Spacing.xl },

  floorGroup: { marginBottom: Spacing.md },
  floorTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm },
  roomCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  roomTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  roomCode: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.full },
  badgeText: { fontSize: 10, fontWeight: '700' },
  roomMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
  actionBtn: { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: BorderRadius.md, backgroundColor: Colors.primaryBg },
  actionPrimary: { backgroundColor: Colors.primary },
  actionBtnText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  historyCard: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  historyRail: { alignItems: 'center', marginRight: Spacing.md },
  historyDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.primary, marginTop: 4 },
  historyLine: { flex: 1, width: 2, backgroundColor: '#E0E7FF', marginTop: 4 },
  historyBody: { flex: 1 },
  historyTop: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  historyTitle: { flex: 1, fontSize: 14, fontWeight: '900', color: Colors.textPrimary },
  historyBadge: { fontSize: 10, fontWeight: '900', color: Colors.primary, backgroundColor: Colors.primaryBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  historyMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 3, fontWeight: '600' },
  historyNote: { fontSize: 12, color: Colors.textMuted, marginTop: 5, lineHeight: 17 },
  emptyInspectionState: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  emptyInspectionTitle: { fontSize: 15, color: Colors.textPrimary, fontWeight: '900' },
  emptyInspectionText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 19 },
});
