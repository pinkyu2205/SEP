import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { Contract, ContractStatus } from '../../types';
import { formatDate, getContractStatusLabel, getContractStatusColor, getDaysUntil } from '../../utils';

const MOCK_CONTRACTS: Contract[] = [
  {
    id: '1',
    code: 'HD-MT-2025-001',
    type: 'manager_tenant',
    lessorName: 'Trần Văn Minh (Quản lý)',
    lessorPhone: '0901234567',
    lesseeName: 'Nguyễn Văn A',
    lesseeCccd: '012345678901',
    lesseePhone: '0987654321',
    propertyName: 'Nhà 15 Nguyễn Trãi',
    roomCode: 'P201',
    roomId: 'r1',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    depositAmount: 6000000,
    rentAmount: 3000000,
    status: 'active',
    equipmentList: [
      { id: 'e1', name: 'Điều hòa Daikin 9000BTU', quantity: 1, condition: 'Tốt' },
      { id: 'e2', name: 'Giường đôi 1m6', quantity: 1, condition: 'Tốt' },
      { id: 'e3', name: 'Tủ quần áo 3 cánh', quantity: 1, condition: 'Khá' },
      { id: 'e4', name: 'Bàn học + ghế', quantity: 1, condition: 'Tốt' },
    ],
    otpVerified: true,
    signedAt: '2026-01-01',
    daysUntilExpiry: getDaysUntil('2026-12-31'),
    pdfUrl: 'https://example.com/contracts/HD-MT-2025-001.pdf',
    notes: 'Thanh toán trước ngày 5 hàng tháng. Tiền điện nước tính riêng theo chỉ số thực tế.',
  },
  {
    id: '2',
    code: 'HD-MT-2024-008',
    type: 'manager_tenant',
    lessorName: 'Trần Văn Minh (Quản lý)',
    lessorPhone: '0901234567',
    lesseeName: 'Nguyễn Văn A',
    lesseeCccd: '012345678901',
    lesseePhone: '0987654321',
    propertyName: 'Nhà 15 Nguyễn Trãi',
    roomCode: 'P201',
    roomId: 'r1',
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    depositAmount: 6000000,
    rentAmount: 2800000,
    status: 'expired',
    equipmentList: [],
    otpVerified: true,
    signedAt: '2025-01-01',
    daysUntilExpiry: -120,
  },
];

const statusFilterList: { key: 'all' | ContractStatus; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'waiting_sign', label: 'Chờ ký' },
  { key: 'active', label: 'Hiệu lực' },
  { key: 'expiring_soon', label: 'Sắp hết hạn' },
  { key: 'expired', label: 'Hết hạn' },
  { key: 'terminated', label: 'Chấm dứt' },
];

const ContractStatusBadge: React.FC<{ status: ContractStatus }> = ({ status }) => {
  const color = getContractStatusColor(status);
  return (
    <View style={[styles.badge, { backgroundColor: color + '20' }]}>
      <View style={[styles.badgeDot, { backgroundColor: color }]} />
      <Text style={[styles.badgeText, { color }]}>{getContractStatusLabel(status)}</Text>
    </View>
  );
};

export const TenantContractScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [filter, setFilter] = useState<'all' | ContractStatus>('all');

  const filtered = filter === 'all'
    ? MOCK_CONTRACTS
    : MOCK_CONTRACTS.filter(c => c.status === filter);

  const activeContract = MOCK_CONTRACTS.find(c => c.status === 'active');

  const renderContract = ({ item }: { item: Contract }) => {
    const isActive = item.status === 'active';
    const isExpiringSoon = item.status === 'expiring_soon';
    const canSign = item.status === 'waiting_sign';

    return (
      <TouchableOpacity
        style={[styles.card, isActive && styles.cardActive]}
        onPress={() => navigation.navigate('ContractDetail', { contract: item })}
        activeOpacity={0.7}
      >
        {isActive && <View style={styles.activeIndicator} />}

        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.contractCode}>{item.code}</Text>
            <Text style={styles.propertyName}>{item.propertyName} · Phòng {item.roomCode}</Text>
          </View>
          <ContractStatusBadge status={item.status} />
        </View>

        <View style={styles.divider} />

        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Bên cho thuê</Text>
            <Text style={styles.infoValue}>{item.lessorName}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Tiền thuê</Text>
            <Text style={[styles.infoValue, { color: Colors.primary, fontWeight: '700' }]}>
              {item.rentAmount.toLocaleString('vi-VN')} đ/tháng
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Thời hạn</Text>
            <Text style={styles.infoValue}>{formatDate(item.startDate)} — {formatDate(item.endDate)}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Đặt cọc</Text>
            <Text style={styles.infoValue}>{item.depositAmount.toLocaleString('vi-VN')} đ</Text>
          </View>
        </View>

        {isActive && item.daysUntilExpiry !== undefined && item.daysUntilExpiry <= 60 && (
          <View style={styles.expiryWarning}>
            <Text style={styles.expiryWarningText}>
              ⚠️ Còn {item.daysUntilExpiry} ngày hết hạn hợp đồng
            </Text>
          </View>
        )}

        {isActive && item.daysUntilExpiry !== undefined && item.daysUntilExpiry > 60 && (
          <View style={styles.expiryInfo}>
            <Text style={styles.expiryInfoText}>
              📅 Còn {item.daysUntilExpiry} ngày đến khi hết hạn
            </Text>
          </View>
        )}

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.actionBtnOutline}
            onPress={() => navigation.navigate('ContractDetail', { contract: item })}
          >
            <Text style={styles.actionBtnOutlineText}>Xem chi tiết</Text>
          </TouchableOpacity>

          {canSign && (
            <TouchableOpacity
              style={styles.actionBtnPrimary}
              onPress={() => navigation.navigate('ContractDetail', { contract: item, autoScrollSign: true })}
            >
              <Text style={styles.actionBtnPrimaryText}>✍️ Ký hợp đồng</Text>
            </TouchableOpacity>
          )}

          {isActive && (
            <TouchableOpacity
              style={styles.actionBtnPrimary}
              onPress={() => navigation.navigate('ContractDetail', { contract: item })}
            >
              <Text style={styles.actionBtnPrimaryText}>Gia hạn / Chấm dứt</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const EmptyState = () => (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>📋</Text>
      <Text style={styles.emptyTitle}>Không có hợp đồng</Text>
      <Text style={styles.emptyDesc}>Bạn chưa có hợp đồng nào với trạng thái này.</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>Hợp đồng thuê</Text>
        <Text style={styles.subtitle}>Hợp đồng thuê phòng của tôi</Text>
      </View>

      {/* Tổng quan hợp đồng đang hiệu lực */}
      {activeContract && (
        <View style={styles.summaryBanner}>
          <View style={styles.summaryLeft}>
            <Text style={styles.summaryEmoji}>✅</Text>
            <View>
              <Text style={styles.summaryTitle}>Đang thuê · {activeContract.roomCode}</Text>
              <Text style={styles.summaryDesc}>{activeContract.propertyName}</Text>
            </View>
          </View>
          <View style={styles.summaryRight}>
            <Text style={styles.summaryDays}>{activeContract.daysUntilExpiry}</Text>
            <Text style={styles.summaryDaysLabel}>ngày còn lại</Text>
          </View>
        </View>
      )}

      {/* Bộ lọc trạng thái */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {statusFilterList.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        renderItem={renderContract}
        keyExtractor={c => c.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.base }} />}
        ListEmptyComponent={<EmptyState />}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },

  summaryBanner: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.primaryBg,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  summaryEmoji: { fontSize: 28 },
  summaryTitle: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  summaryDesc: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  summaryRight: { alignItems: 'center' },
  summaryDays: { fontSize: 28, fontWeight: '800', color: Colors.primary },
  summaryDaysLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  filterRow: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md, gap: Spacing.sm },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },

  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, ...Shadow.md, borderWidth: 1, borderColor: 'transparent',
  },
  cardActive: { borderColor: Colors.primary + '40' },
  activeIndicator: {
    position: 'absolute', top: 0, left: 0, width: 4,
    height: '100%', backgroundColor: Colors.primary, borderTopLeftRadius: BorderRadius.lg,
    borderBottomLeftRadius: BorderRadius.lg,
  },

  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginBottom: Spacing.md },
  contractCode: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  propertyName: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.full },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  divider: { height: 1, backgroundColor: Colors.divider, marginBottom: Spacing.md },

  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.md },
  infoItem: { width: '47%' },
  infoLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  infoValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

  expiryWarning: {
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.md,
    padding: Spacing.sm, marginBottom: Spacing.md,
  },
  expiryWarningText: { fontSize: 13, fontWeight: '600', color: Colors.error },
  expiryInfo: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md,
    padding: Spacing.sm, marginBottom: Spacing.md,
  },
  expiryInfoText: { fontSize: 13, fontWeight: '500', color: Colors.primary },

  cardActions: { flexDirection: 'row', gap: Spacing.sm },
  actionBtnOutline: {
    flex: 1, paddingVertical: Spacing.sm + 2, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  actionBtnOutlineText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  actionBtnPrimary: {
    flex: 1, paddingVertical: Spacing.sm + 2, borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary, alignItems: 'center',
  },
  actionBtnPrimaryText: { fontSize: 13, fontWeight: '700', color: Colors.white },

  empty: { paddingTop: 60, alignItems: 'center' },
  emptyEmoji: { fontSize: 48, marginBottom: Spacing.base },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', paddingHorizontal: Spacing.xl },
});
