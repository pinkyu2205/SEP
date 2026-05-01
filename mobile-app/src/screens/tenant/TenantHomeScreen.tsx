import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { Card } from '../../components/common';
import { useAuth } from '../../hooks';
import { getCurrentMonthYear } from '../../utils';

// Mock summary data — sẽ thay bằng API call thực tế
const MOCK_SUMMARY = {
  roomName: 'Phòng 201',
  propertyName: 'Nhà 15 Nguyễn Trãi',
  currentInvoice: {
    total: 3850000,
    status: 'pending' as const,
    dueDate: '2026-05-15',
  },
  pendingMaintenance: 1,
  notifications: 3,
};

interface QuickActionProps {
  emoji: string;
  label: string;
  sublabel?: string;
  color: string;
  onPress: () => void;
}

const QuickAction: React.FC<QuickActionProps> = ({ emoji, label, sublabel, color, onPress }) => (
  <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.7}>
    <View style={[styles.quickActionIcon, { backgroundColor: color + '15' }]}>
      <Text style={styles.quickActionEmoji}>{emoji}</Text>
    </View>
    <Text style={styles.quickActionLabel}>{label}</Text>
    {sublabel && <Text style={styles.quickActionSublabel}>{sublabel}</Text>}
  </TouchableOpacity>
);

export const TenantHomeScreen: React.FC = () => {
  const { user, logout } = useAuth();
  const navigation = useNavigation<any>();
  const summary = MOCK_SUMMARY;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Xin chào 👋</Text>
            <Text style={styles.userName}>{user?.fullName || 'Khách thuê'}</Text>
          </View>
          <TouchableOpacity style={styles.notifBadge}>
            <Text style={styles.notifEmoji}>🔔</Text>
            {summary.notifications > 0 && (
              <View style={styles.notifCount}>
                <Text style={styles.notifCountText}>{summary.notifications}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Room Info Card */}
        <View style={styles.roomCard}>
          <View style={styles.roomCardOverlay}>
            <Text style={styles.roomCardLabel}>Phòng của bạn</Text>
            <Text style={styles.roomCardName}>{summary.roomName}</Text>
            <Text style={styles.roomCardProperty}>{summary.propertyName}</Text>
          </View>
        </View>

        {/* Invoice Summary */}
        <Card style={styles.invoiceCard}>
          <View style={styles.invoiceHeader}>
            <View>
              <Text style={styles.invoiceLabel}>{getCurrentMonthYear()}</Text>
              <Text style={styles.invoiceAmount}>
                {summary.currentInvoice.total.toLocaleString('vi-VN')} đ
              </Text>
            </View>
            <View style={[styles.statusDot, { backgroundColor: Colors.warning }]}>
              <Text style={styles.statusDotText}>Chờ TT</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.payButton}
            onPress={() => navigation.navigate('InvoiceList')}
          >
            <Text style={styles.payButtonText}>Xem & Thanh toán →</Text>
          </TouchableOpacity>
        </Card>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Thao tác nhanh</Text>
        <View style={styles.quickActionsGrid}>
          <QuickAction
            emoji="📄"
            label="Hóa đơn"
            sublabel="Xem chi tiết"
            color={Colors.primary}
            onPress={() => navigation.navigate('InvoiceList')}
          />
          <QuickAction
            emoji="🔧"
            label="Sửa chữa"
            sublabel={`${summary.pendingMaintenance} đang chờ`}
            color={Colors.warning}
            onPress={() => navigation.navigate('MaintenanceList')}
          />
          <QuickAction
            emoji="📱"
            label="QR Code"
            sublabel="Thanh toán"
            color={Colors.accent}
            onPress={() => {}}
          />
          <QuickAction
            emoji="👤"
            label="Hồ sơ"
            sublabel="Tài khoản"
            color={Colors.success}
            onPress={() => {}}
          />
        </View>

        {/* Recent Notifications */}
        <Text style={styles.sectionTitle}>Thông báo gần đây</Text>
        <Card style={styles.notifCard}>
          <View style={styles.notifItem}>
            <Text style={styles.notifItemEmoji}>💳</Text>
            <View style={styles.notifItemContent}>
              <Text style={styles.notifItemTitle}>Hóa đơn tháng 4 đã được tạo</Text>
              <Text style={styles.notifItemTime}>2 giờ trước</Text>
            </View>
          </View>
          <View style={styles.notifDivider} />
          <View style={styles.notifItem}>
            <Text style={styles.notifItemEmoji}>✅</Text>
            <View style={styles.notifItemContent}>
              <Text style={styles.notifItemTitle}>Yêu cầu sửa vòi nước đã giải quyết</Text>
              <Text style={styles.notifItemTime}>1 ngày trước</Text>
            </View>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing['3xl'],
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  greeting: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  notifBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.sm,
  },
  notifEmoji: {
    fontSize: 22,
  },
  notifCount: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: Colors.error,
    borderRadius: 10,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifCountText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  // Room Card
  roomCard: {
    height: 120,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.primary,
    marginBottom: Spacing.base,
    overflow: 'hidden',
  },
  roomCardOverlay: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(79, 70, 229, 0.9)',
  },
  roomCardLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  roomCardName: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.white,
    marginTop: 2,
  },
  roomCardProperty: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  // Invoice Card
  invoiceCard: {
    marginBottom: Spacing.lg,
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  invoiceLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  invoiceAmount: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginTop: 2,
  },
  statusDot: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
  },
  statusDotText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.white,
  },
  payButton: {
    backgroundColor: Colors.primaryBg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  payButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primary,
  },
  // Section Title
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  // Quick Actions
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  quickAction: {
    width: '47%',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    ...Shadow.sm,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  quickActionEmoji: {
    fontSize: 22,
  },
  quickActionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  quickActionSublabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  // Notifications
  notifCard: {
    marginBottom: Spacing.lg,
  },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  notifItemEmoji: {
    fontSize: 20,
  },
  notifItemContent: {
    flex: 1,
  },
  notifItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  notifItemTime: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  notifDivider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginVertical: Spacing.md,
  },
});
