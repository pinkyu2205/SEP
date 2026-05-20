import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { getPropertyById, getBuildingOps, BuildingContract, ContractStatus } from '../../data/managedProperties';

const FILTERS: { id: 'all' | ContractStatus; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'active', label: 'Hiệu lực' },
  { id: 'expiring', label: 'Sắp hết hạn' },
  { id: 'pending', label: 'Chờ duyệt' },
];

const STATUS_META: Record<ContractStatus, { label: string; color: string; bg: string }> = {
  active: { label: 'Hiệu lực', color: '#16A34A', bg: '#F0FDF4' },
  expiring: { label: 'Sắp hết hạn', color: '#D97706', bg: '#FEF3C7' },
  pending: { label: 'Chờ duyệt', color: '#7C3AED', bg: '#F5F3FF' },
};

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

export const BuildingContractScreen: React.FC<any> = ({ navigation, route }) => {
  const propertyId: string = route?.params?.propertyId;
  const prop = getPropertyById(propertyId);
  const [contracts, setContracts] = useState<BuildingContract[]>(() => getBuildingOps(propertyId).contracts);
  const [filter, setFilter] = useState<'all' | ContractStatus>('all');

  const list = filter === 'all' ? contracts : contracts.filter(c => c.status === filter);

  const renew = (c: BuildingContract) => {
    Alert.alert('Gia hạn hợp đồng', `Gia hạn HĐ phòng ${c.room} (${c.tenant}) thêm 12 tháng?`, [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Gia hạn', onPress: () => setContracts(prev => prev.map(x => {
        if (x.id !== c.id) return x;
        const end = new Date(x.endDate);
        end.setFullYear(end.getFullYear() + 1);
        return { ...x, status: 'active', endDate: end.toISOString().slice(0, 10) };
      })) },
    ]);
  };

  const approve = (c: BuildingContract) => {
    Alert.alert('Duyệt & ký hợp đồng', `Xác nhận ký hợp đồng phòng ${c.room} (${c.tenant})?`, [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Ký', onPress: () => setContracts(prev => prev.map(x => x.id === c.id ? { ...x, status: 'active' } : x)) },
    ]);
  };

  const terminate = (c: BuildingContract) => {
    Alert.alert('Thanh lý hợp đồng', `Thanh lý HĐ phòng ${c.room} (${c.tenant})? Hành động này sẽ kết thúc hợp đồng.`, [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Thanh lý', style: 'destructive', onPress: () => setContracts(prev => prev.filter(x => x.id !== c.id)) },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Hợp đồng</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{prop?.name || ''}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
        {FILTERS.map(f => (
          <TouchableOpacity key={f.id} style={[styles.chip, filter === f.id && styles.chipActive]} onPress={() => setFilter(f.id)}>
            <Text style={[styles.chipText, filter === f.id && styles.chipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {list.length === 0 ? (
          <Text style={styles.empty}>Không có hợp đồng</Text>
        ) : list.map(c => {
          const st = STATUS_META[c.status];
          return (
            <View key={c.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{c.room} · {c.tenant}</Text>
                  <Text style={styles.cardMeta}>{c.startDate} → {c.endDate} · {fmt(c.monthlyRent)}/th</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: st.bg }]}>
                  <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
                </View>
              </View>
              <View style={styles.actionRow}>
                {c.status === 'expiring' && (
                  <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => renew(c)}>
                    <Text style={styles.btnPrimaryText}>Gia hạn</Text>
                  </TouchableOpacity>
                )}
                {c.status === 'pending' && (
                  <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => approve(c)}>
                    <Text style={styles.btnPrimaryText}>Duyệt & ký</Text>
                  </TouchableOpacity>
                )}
                {c.status !== 'pending' && (
                  <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => terminate(c)}>
                    <Text style={styles.btnGhostText}>Thanh lý</Text>
                  </TouchableOpacity>
                )}
              </View>
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

  filterRow: { flexGrow: 0, marginTop: Spacing.md },
  filterContent: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  chip: { height: 32, justifyContent: 'center', paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },

  scroll: { padding: Spacing.lg },
  empty: { textAlign: 'center', color: Colors.textMuted, paddingVertical: Spacing.xl },

  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  cardMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  badgeText: { fontSize: 11, fontWeight: '700' },

  actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  btn: { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md, alignItems: 'center' },
  btnPrimary: { backgroundColor: Colors.primary },
  btnPrimaryText: { fontSize: 13, fontWeight: '700', color: Colors.white },
  btnGhost: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  btnGhostText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
});
