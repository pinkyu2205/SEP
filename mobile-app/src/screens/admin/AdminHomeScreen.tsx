import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';

const MOCK_STATS = {
  totalProperties: 10,
  rentedProperties: 3,
  totalManagers: 2,
  monthlyRevenue: 78000000,
  pendingPayments: 1,
};

const QUICK_ACTIONS = [
  { id: 'onboard', icon: '🤝', label: 'Tiếp khách', screen: 'AdminOnboarding' },
  { id: 'contracts', icon: '📋', label: 'Hợp đồng', screen: 'AdminContracts' },
  { id: 'properties', icon: '🏠', label: 'Bất động sản', screen: 'AdminProperties' },
  { id: 'billing', icon: '💰', label: 'Thu tiền', screen: 'AdminBilling' },
];

export const AdminHomeScreen: React.FC<any> = ({ navigation }) => {
  const formatCurrency = (n: number) => n.toLocaleString('vi-VN') + 'đ';

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Xin chào,</Text>
            <Text style={styles.name}>Admin</Text>
          </View>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>AD</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: '#EEF2FF' }]}>
            <Text style={styles.statEmoji}>🏠</Text>
            <Text style={styles.statValue}>{MOCK_STATS.totalProperties}</Text>
            <Text style={styles.statLabel}>Tổng nhà</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#F0FDF4' }]}>
            <Text style={styles.statEmoji}>📝</Text>
            <Text style={styles.statValue}>{MOCK_STATS.rentedProperties}</Text>
            <Text style={styles.statLabel}>Đã cho thuê</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#FFF7ED' }]}>
            <Text style={styles.statEmoji}>👥</Text>
            <Text style={styles.statValue}>{MOCK_STATS.totalManagers}</Text>
            <Text style={styles.statLabel}>Manager</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#FEF2F2' }]}>
            <Text style={styles.statEmoji}>⚠️</Text>
            <Text style={styles.statValue}>{MOCK_STATS.pendingPayments}</Text>
            <Text style={styles.statLabel}>Chờ thanh toán</Text>
          </View>
        </View>

        {/* Revenue Card */}
        <View style={styles.revenueCard}>
          <Text style={styles.revenueLabel}>Doanh thu tháng này</Text>
          <Text style={styles.revenueValue}>{formatCurrency(MOCK_STATS.monthlyRevenue)}</Text>
          <Text style={styles.revenueDetail}>Từ {MOCK_STATS.rentedProperties} căn nhà cho thuê</Text>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Thao tác nhanh</Text>
        <View style={styles.actionsGrid}>
          {QUICK_ACTIONS.map(action => (
            <TouchableOpacity
              key={action.id}
              style={styles.actionCard}
              onPress={() => {
                if (action.screen === 'AdminOnboarding') {
                  navigation.navigate('AdminOnboarding');
                }
              }}
            >
              <Text style={styles.actionIcon}>{action.icon}</Text>
              <Text style={styles.actionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Contracts */}
        <Text style={styles.sectionTitle}>Hợp đồng gần đây</Text>
        <View style={styles.contractCard}>
          <View style={styles.contractRow}>
            <View>
              <Text style={styles.contractName}>Nguyễn Văn Quản</Text>
              <Text style={styles.contractSub}>Nhà Nguyễn Trãi · HD-AM-2026-001</Text>
            </View>
            <View style={styles.contractBadge}>
              <Text style={styles.contractBadgeText}>Đang thuê</Text>
            </View>
          </View>
          <View style={styles.contractDivider} />
          <View style={styles.contractRow}>
            <View>
              <Text style={styles.contractName}>Trần Thị Quản</Text>
              <Text style={styles.contractSub}>Nhà Lê Văn Sỹ · HD-AM-2026-002</Text>
            </View>
            <View style={styles.contractBadge}>
              <Text style={styles.contractBadgeText}>Đang thuê</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, paddingTop: Spacing.xl },
  greeting: { fontSize: 14, color: Colors.textSecondary },
  name: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary, marginTop: 2 },
  avatarCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: Colors.white, fontWeight: '700', fontSize: 16 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.lg, gap: Spacing.md },
  statCard: { width: '47%', padding: Spacing.base, borderRadius: BorderRadius.lg, ...Shadow.sm },
  statEmoji: { fontSize: 24, marginBottom: Spacing.xs },
  statValue: { fontSize: 28, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  revenueCard: { margin: Spacing.lg, padding: Spacing.xl, borderRadius: BorderRadius.xl, backgroundColor: Colors.primary, ...Shadow.md },
  revenueLabel: { fontSize: 14, color: 'rgba(255,255,255,0.7)' },
  revenueValue: { fontSize: 32, fontWeight: '800', color: Colors.white, marginTop: Spacing.xs },
  revenueDetail: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: Spacing.xs },

  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, paddingHorizontal: Spacing.lg, marginTop: Spacing.lg, marginBottom: Spacing.md },

  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.lg, gap: Spacing.md },
  actionCard: { width: '22%', backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md, alignItems: 'center', ...Shadow.sm },
  actionIcon: { fontSize: 28, marginBottom: Spacing.xs },
  actionLabel: { fontSize: 11, fontWeight: '600', color: Colors.textPrimary, textAlign: 'center' },

  contractCard: { marginHorizontal: Spacing.lg, backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm },
  contractRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.sm },
  contractName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  contractSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  contractBadge: { backgroundColor: '#F0FDF4', paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: BorderRadius.full },
  contractBadgeText: { fontSize: 11, fontWeight: '600', color: '#16A34A' },
  contractDivider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.sm },
});
