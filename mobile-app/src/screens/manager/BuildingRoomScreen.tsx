import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { getPropertyById, getBuildingOps, BuildingRoom, RoomStatus } from '../../data/managedProperties';

const STATUS_META: Record<RoomStatus, { label: string; color: string; bg: string; dot: string }> = {
  occupied: { label: 'Đang thuê', color: '#3B82F6', bg: '#EFF6FF', dot: '#3B82F6' },
  available: { label: 'Trống', color: '#16A34A', bg: '#F0FDF4', dot: '#16A34A' },
  maintenance: { label: 'Bảo trì', color: '#D97706', bg: '#FEF3C7', dot: '#F59E0B' },
};

const FILTERS: { id: 'all' | RoomStatus; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'occupied', label: 'Đang thuê' },
  { id: 'available', label: 'Trống' },
  { id: 'maintenance', label: 'Bảo trì' },
];

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

export const BuildingRoomScreen: React.FC<any> = ({ navigation, route }) => {
  const propertyId: string = route?.params?.propertyId;
  const prop = getPropertyById(propertyId);
  const [rooms, setRooms] = useState<BuildingRoom[]>(() => getBuildingOps(propertyId).rooms);
  const [filter, setFilter] = useState<'all' | RoomStatus>('all');

  const counts = useMemo(() => ({
    occupied: rooms.filter(r => r.status === 'occupied').length,
    available: rooms.filter(r => r.status === 'available').length,
    maintenance: rooms.filter(r => r.status === 'maintenance').length,
  }), [rooms]);

  const filtered = filter === 'all' ? rooms : rooms.filter(r => r.status === filter);
  const floors = useMemo(() => Array.from(new Set(filtered.map(r => r.floor))).sort((a, b) => a - b), [filtered]);

  const checkOut = (r: BuildingRoom) => {
    Alert.alert('Trả phòng', `Xác nhận check-out phòng ${r.code} (${r.tenantName})?`, [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Check-out', style: 'destructive', onPress: () => setRooms(prev => prev.map(x => x.id === r.id ? { ...x, status: 'available', tenantName: undefined } : x)) },
    ]);
  };

  const checkIn = (r: BuildingRoom) => {
    Alert.alert('Đón khách', `Tạo check-in cho phòng ${r.code}?`, [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Đón khách', onPress: () => navigation.navigate('Onboarding') },
    ]);
  };

  const finishMaintenance = (r: BuildingRoom) => {
    Alert.alert('Hoàn tất bảo trì', `Đưa phòng ${r.code} về trạng thái sẵn sàng?`, [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Xác nhận', onPress: () => setRooms(prev => prev.map(x => x.id === r.id ? { ...x, status: 'available' } : x)) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Phòng</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{prop?.name || ''}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.summaryRow}>
        <View style={[styles.summaryBox, { backgroundColor: '#EFF6FF' }]}>
          <Text style={[styles.summaryNum, { color: '#3B82F6' }]}>{counts.occupied}</Text>
          <Text style={styles.summaryLabel}>Đang thuê</Text>
        </View>
        <View style={[styles.summaryBox, { backgroundColor: '#F0FDF4' }]}>
          <Text style={[styles.summaryNum, { color: '#16A34A' }]}>{counts.available}</Text>
          <Text style={styles.summaryLabel}>Trống</Text>
        </View>
        <View style={[styles.summaryBox, { backgroundColor: '#FEF3C7' }]}>
          <Text style={[styles.summaryNum, { color: '#D97706' }]}>{counts.maintenance}</Text>
          <Text style={styles.summaryLabel}>Bảo trì</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f.id} style={[styles.chip, filter === f.id && styles.chipActive]} onPress={() => setFilter(f.id)}>
            <Text style={[styles.chipText, filter === f.id && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {floors.length === 0 ? (
          <Text style={styles.empty}>Không có phòng</Text>
        ) : floors.map(floor => (
          <View key={floor} style={styles.floorGroup}>
            <Text style={styles.floorTitle}>Tầng {floor}</Text>
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
                      {r.area}m² · {fmt(r.rentPrice)}/th{r.tenantName ? ` · ${r.tenantName}` : ''}
                    </Text>
                  </View>
                  {r.status === 'occupied' && (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => checkOut(r)}>
                      <Text style={styles.actionBtnText}>Trả phòng</Text>
                    </TouchableOpacity>
                  )}
                  {r.status === 'available' && (
                    <TouchableOpacity style={[styles.actionBtn, styles.actionPrimary]} onPress={() => checkIn(r)}>
                      <Text style={[styles.actionBtnText, { color: Colors.white }]}>Đón khách</Text>
                    </TouchableOpacity>
                  )}
                  {r.status === 'maintenance' && (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => finishMaintenance(r)}>
                      <Text style={styles.actionBtnText}>Hoàn tất</Text>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: Colors.white, ...Shadow.sm },
  backText: { color: Colors.primary, fontWeight: '600', fontSize: 15, width: 60 },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },

  summaryRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
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
});
