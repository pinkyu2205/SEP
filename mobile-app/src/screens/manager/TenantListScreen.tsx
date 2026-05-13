import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';

const MOCK_TENANTS = [
  { id: 't1', name: 'Trần Văn A', phone: '0901111001', property: 'Nhà Nguyễn Trãi', room: 'P101', status: 'active', moveIn: '20/01/2026' },
  { id: 't2', name: 'Lê Thị B', phone: '0901111002', property: 'Nhà Nguyễn Trãi', room: 'P102', status: 'active', moveIn: '01/02/2026' },
  { id: 't3', name: 'Phạm Văn C', phone: '0901111003', property: 'Nhà Nguyễn Trãi', room: 'P201', status: 'active', moveIn: '15/02/2026' },
  { id: 't4', name: 'Ngô Thị D', phone: '0901111004', property: 'Nhà Nguyễn Trãi', room: 'P301', status: 'active', moveIn: '01/03/2026' },
  { id: 't8', name: 'Bùi Văn H', phone: '0901111008', property: 'Nhà CMT8', room: 'P101', status: 'active', moveIn: '15/03/2026' },
  { id: 't9', name: 'Cao Thị I', phone: '0901111009', property: 'Nhà CMT8', room: 'P102', status: 'active', moveIn: '20/03/2026' },
  { id: 't10', name: 'Lý Văn K', phone: '0901111010', property: 'Nhà CMT8', room: 'P202', status: 'active', moveIn: '01/04/2026' },
];

const statusMap: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: 'Đang ở', color: '#16A34A', bg: '#F0FDF4' },
  pending_activation: { label: 'Chờ kích hoạt', color: '#F59E0B', bg: '#FFFBEB' },
  moved_out: { label: 'Đã rời', color: '#6B7280', bg: '#F3F4F6' },
};

export const TenantListScreen: React.FC = () => {
  const [search, setSearch] = useState('');

  const filtered = MOCK_TENANTS.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.phone.includes(search) ||
    t.room.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Khách thuê</Text>
        <Text style={styles.subtitle}>{MOCK_TENANTS.length} khách đang thuê</Text>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍  Tìm theo tên, SĐT hoặc phòng..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {filtered.map(tenant => {
          const st = statusMap[tenant.status];
          return (
            <View key={tenant.id} style={styles.card}>
              <View style={styles.cardLeft}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{tenant.name.charAt(0)}</Text>
                </View>
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.tenantName}>{tenant.name}</Text>
                <Text style={styles.tenantInfo}>📱 {tenant.phone}</Text>
                <Text style={styles.tenantInfo}>🏠 {tenant.property} - {tenant.room}</Text>
                <Text style={styles.tenantInfo}>📅 Vào: {tenant.moveIn}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: st.bg }]}>
                <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
              </View>
            </View>
          );
        })}

        {filtered.length === 0 && (
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>🔍</Text>
            <Text style={styles.emptyText}>Không tìm thấy khách thuê</Text>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { padding: Spacing.lg, paddingTop: Spacing.xl },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },

  searchContainer: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  searchInput: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md, fontSize: 14, color: Colors.textPrimary, ...Shadow.sm },

  card: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.lg, marginBottom: Spacing.md, backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm },
  cardLeft: { marginRight: Spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primaryBg, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', color: Colors.primary },
  cardBody: { flex: 1 },
  tenantName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  tenantInfo: { fontSize: 12, color: Colors.textSecondary, marginBottom: 1 },
  badge: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: BorderRadius.full },
  badgeText: { fontSize: 10, fontWeight: '700' },

  empty: { alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: 14, color: Colors.textSecondary, marginTop: Spacing.md },
});
