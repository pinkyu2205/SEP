import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, TextInput, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { StatusBadge } from '../../components/common';
import { MaintenanceRequest, MaintenanceStatus } from '../../types';
import { getMaintenanceStatusLabel, getMaintenanceCategoryLabel, formatDate } from '../../utils';
import { useAuth } from '../../hooks';

const MOCK_REQUESTS: MaintenanceRequest[] = [
  {
    id: '1', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    title: 'Vòi nước bồn rửa bị rỉ', description: 'Vòi nước bồn rửa mặt trong toilet bị rỉ nước liên tục.',
    category: 'plumbing', status: 'pending', images: [], createdAt: '2026-04-28', updatedAt: '2026-04-28',
  },
  {
    id: '2', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    title: 'Ổ cắm điện bị cháy', description: 'Ổ cắm bên cạnh bàn học bị cháy, có mùi khét.',
    category: 'electrical', status: 'in_progress', images: [], createdAt: '2026-04-25', updatedAt: '2026-04-27',
  },
  {
    id: '3', roomId: 'r1', roomName: 'Phòng 201', tenantId: 't1', tenantName: 'Nguyễn Văn A',
    title: 'Tủ quần áo bị hỏng bản lề', description: 'Bản lề cánh tủ trái bị gãy.',
    category: 'furniture', status: 'resolved', images: [], repairCost: 150000,
    createdAt: '2026-04-20', updatedAt: '2026-04-22', resolvedAt: '2026-04-22',
  },
];

const getVariant = (s: MaintenanceStatus) =>
  s === 'resolved' ? 'success' as const : s === 'in_progress' ? 'info' as const : 'warning' as const;

const categoryEmoji: Record<string, string> = {
  electrical: '⚡', plumbing: '🚰', furniture: '🪑', appliance: '📺', other: '🔧',
};

export const MaintenanceListScreen: React.FC = () => {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  
  const [requests, setRequests] = useState<MaintenanceRequest[]>(MOCK_REQUESTS);
  const [filter, setFilter] = useState<'all' | MaintenanceStatus>('all');
  
  // Cost modal state
  const [showCostModal, setShowCostModal] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [repairCostStr, setRepairCostStr] = useState('');

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  const filters: { key: 'all' | MaintenanceStatus; label: string }[] = [
    { key: 'all', label: 'Tất cả' },
    { key: 'pending', label: 'Chờ xử lý' },
    { key: 'in_progress', label: 'Đang xử lý' },
    { key: 'resolved', label: 'Hoàn tất' },
  ];

  const handleAction = (item: MaintenanceRequest) => {
    if (!isManager) return;

    if (item.status === 'pending') {
      Alert.alert('Tiếp nhận', 'Bạn sẽ điều phối thợ đến sửa?', [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Xác nhận', onPress: () => {
          setRequests(prev => prev.map(r => r.id === item.id ? { ...r, status: 'in_progress' } : r));
        }}
      ]);
    } else if (item.status === 'in_progress') {
      setSelectedRequestId(item.id);
      setRepairCostStr('');
      setShowCostModal(true);
    }
  };

  const submitCost = () => {
    const cost = parseInt(repairCostStr.replace(/\D/g, ''), 10);
    if (isNaN(cost)) {
      Alert.alert('Lỗi', 'Vui lòng nhập số tiền hợp lệ');
      return;
    }

    setRequests(prev => prev.map(r => r.id === selectedRequestId ? { ...r, status: 'resolved', repairCost: cost } : r));
    setShowCostModal(false);
    setSelectedRequestId(null);
    Alert.alert('Thành công', 'Đã ghi nhận chi phí và hoàn tất yêu cầu.');
  };

  const renderItem = ({ item }: { item: MaintenanceRequest }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <View style={styles.categoryIcon}>
          <Text style={{ fontSize: 20 }}>{categoryEmoji[item.category] || '🔧'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardCategory}>{getMaintenanceCategoryLabel(item.category)} · {formatDate(item.createdAt)}</Text>
        </View>
        <StatusBadge label={getMaintenanceStatusLabel(item.status)} variant={getVariant(item.status)} />
      </View>
      <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
      
      {isManager && item.status !== 'resolved' && (
        <TouchableOpacity 
          style={[styles.actionBtn, item.status === 'in_progress' && styles.actionBtnSuccess]}
          onPress={() => handleAction(item)}
        >
          <Text style={styles.actionBtnText}>
            {item.status === 'pending' ? 'Tiếp nhận xử lý' : 'Đánh dấu hoàn tất'}
          </Text>
        </TouchableOpacity>
      )}
      
      {isManager && item.status === 'resolved' && item.repairCost && (
        <Text style={styles.costText}>Chi phí sửa: <Text style={{fontWeight:'bold'}}>{item.repairCost.toLocaleString('vi-VN')} đ</Text></Text>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>Sửa chữa</Text>
        <Text style={styles.subtitle}>Theo dõi yêu cầu bảo trì</Text>
      </View>
      <View style={styles.filterRow}>
        {filters.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[styles.filterText, filter === f.key && styles.filterTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
        ListEmptyComponent={<Text style={styles.empty}>Không có yêu cầu nào</Text>}
      />
      {!isManager && (
        <TouchableOpacity style={styles.fab}>
          <Text style={styles.fabText}>＋</Text>
        </TouchableOpacity>
      )}

      {/* Modal nhập chi phí */}
      <Modal visible={showCostModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nhập chi phí sửa chữa</Text>
            <Text style={styles.modalDesc}>Chi phí này sẽ được ghi nhận vào dòng tiền chi của tòa nhà.</Text>
            <TextInput
              style={styles.costInput}
              placeholder="Ví dụ: 300000"
              keyboardType="numeric"
              value={repairCostStr}
              onChangeText={setRepairCostStr}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowCostModal(false)}>
                <Text style={styles.modalBtnCancelText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnSubmit} onPress={submitCost}>
                <Text style={styles.modalBtnSubmitText}>Xác nhận</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
  filterRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm },
  filterChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.sm },
  categoryIcon: { width: 40, height: 40, borderRadius: BorderRadius.md, backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  cardCategory: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  cardDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  empty: { textAlign: 'center', color: Colors.textMuted, marginTop: Spacing['3xl'], fontSize: 14 },
  fab: { position: 'absolute', bottom: 30, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', ...Shadow.lg },
  fabText: { fontSize: 28, color: Colors.white, fontWeight: '300', marginTop: -2 },
  actionBtn: { marginTop: 12, paddingVertical: 10, borderRadius: 8, backgroundColor: Colors.primaryBg, alignItems: 'center' },
  actionBtnSuccess: { backgroundColor: Colors.successBg },
  actionBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  costText: { marginTop: 12, fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic', textAlign: 'right' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: Colors.white, borderRadius: 16, padding: 24, ...Shadow.lg },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: 8 },
  modalDesc: { fontSize: 14, color: Colors.textSecondary, marginBottom: 20 },
  costInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 24 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalBtnCancel: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 8 },
  modalBtnCancelText: { fontWeight: '600', color: Colors.textSecondary },
  modalBtnSubmit: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: Colors.primary, borderRadius: 8 },
  modalBtnSubmitText: { fontWeight: '600', color: Colors.white },
});
