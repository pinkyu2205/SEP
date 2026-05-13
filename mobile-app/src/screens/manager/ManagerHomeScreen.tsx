import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { Card } from '../../components/common';
import { useAuth } from '../../hooks';

const MOCK_STATS = {
  totalRooms: 20,
  occupied: 16,
  available: 3,
  maintenance: 1,
  pendingRequests: 3,
  unpaidInvoices: 5,
  monthlyRevenue: 64000000,
};

interface StatCardProps {
  emoji: string;
  label: string;
  value: string | number;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ emoji, label, value, color }) => (
  <View style={[styles.statCard, { borderLeftColor: color }]}>
    <Text style={{ fontSize: 20 }}>{emoji}</Text>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

export const ManagerHomeScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const stats = MOCK_STATS;
  const occupancyRate = Math.round((stats.occupied / stats.totalRooms) * 100);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Xin chào 👋</Text>
            <Text style={styles.userName}>{user?.fullName || 'Quản lý'}</Text>
          </View>
          <TouchableOpacity style={styles.notifBtn}>
            <Text style={{ fontSize: 22 }}>🔔</Text>
          </TouchableOpacity>
        </View>

        {/* Occupancy Banner */}
        <View style={styles.banner}>
          <View style={styles.bannerContent}>
            <Text style={styles.bannerLabel}>Tỉ lệ lấp đầy</Text>
            <Text style={styles.bannerValue}>{occupancyRate}%</Text>
            <Text style={styles.bannerSub}>{stats.occupied}/{stats.totalRooms} phòng đang thuê</Text>
          </View>
          <View style={styles.bannerChart}>
            <View style={[styles.ring, { borderColor: Colors.accent }]}>
              <Text style={styles.ringText}>{occupancyRate}%</Text>
            </View>
          </View>
        </View>

        {/* Stat Cards */}
        <View style={styles.statsGrid}>
          <StatCard emoji="🟢" label="Phòng trống" value={stats.available} color={Colors.success} />
          <StatCard emoji="🔵" label="Đang thuê" value={stats.occupied} color={Colors.info} />
          <StatCard emoji="🟡" label="Bảo trì" value={stats.maintenance} color={Colors.warning} />
          <StatCard emoji="📋" label="Chờ xử lý" value={stats.pendingRequests} color={Colors.error} />
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Thao tác nhanh</Text>
        <View style={styles.actionsRow}>
          {[
            { emoji: '🤝', label: 'Đón khách', route: 'Onboarding' },
            { emoji: '🔧', label: 'Sửa chữa', route: 'ManagerMaintenance' },
            { emoji: '📊', label: 'Báo cáo', route: 'ManagerHome' },
            { emoji: '🏠', label: 'QL Phòng', route: 'RoomManage' },
          ].map((a, i) => (
            <TouchableOpacity key={i} style={styles.actionBtn} onPress={() => a.route && navigation.navigate(a.route)}>
              <Text style={{ fontSize: 24 }}>{a.emoji}</Text>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Revenue */}
        <Card title="Doanh thu tháng này" style={styles.revenueCard}>
          <Text style={styles.revenueAmount}>{stats.monthlyRevenue.toLocaleString('vi-VN')} đ</Text>
          <Text style={styles.revenueSub}>{stats.unpaidInvoices} hóa đơn chưa thanh toán</Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.lg },
  greeting: { fontSize: 14, color: Colors.textSecondary },
  userName: { fontSize: 22, fontWeight: '700', color: Colors.textPrimary, marginTop: 2 },
  notifBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', ...Shadow.sm },
  // Banner
  banner: { flexDirection: 'row', backgroundColor: Colors.primary, borderRadius: BorderRadius.xl, padding: Spacing.lg, marginBottom: Spacing.lg },
  bannerContent: { flex: 1 },
  bannerLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  bannerValue: { fontSize: 40, fontWeight: '800', color: Colors.white, marginTop: 4 },
  bannerSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  bannerChart: { justifyContent: 'center' },
  ring: { width: 70, height: 70, borderRadius: 35, borderWidth: 5, alignItems: 'center', justifyContent: 'center' },
  ringText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  // Stats
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.lg },
  statCard: { width: '47%', backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, borderLeftWidth: 4, ...Shadow.sm },
  statValue: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, marginTop: Spacing.sm },
  statLabel: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  // Section
  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.lg },
  actionBtn: { alignItems: 'center', width: '22%', backgroundColor: Colors.white, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg, ...Shadow.sm },
  actionLabel: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary, marginTop: Spacing.xs, textAlign: 'center' },
  // Revenue
  revenueCard: { marginBottom: Spacing.lg },
  revenueAmount: { fontSize: 28, fontWeight: '800', color: Colors.success },
  revenueSub: { fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
});
