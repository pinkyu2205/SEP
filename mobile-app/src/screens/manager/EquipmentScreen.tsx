import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';

// ===================== MOCK DATA =====================
const MOCK_HOUSES = [
  { id: 'h1', name: 'Nhà Nguyễn Trãi' },
  { id: 'h2', name: 'Nhà Lê Văn Sỹ' },
];

const MOCK_EQUIPMENT = [
  { id: 'eq1', name: 'Điều hòa Daikin 9000BTU', houseId: 'h1', room: 'P101', category: 'Điện lạnh', status: 'active', qrCode: 'QR-101-AC' },
  { id: 'eq2', name: 'Bình nước nóng Ariston 30L', houseId: 'h1', room: 'P101', category: 'Điện nước', status: 'active', qrCode: 'QR-101-WH' },
  { id: 'eq3', name: 'Giường 1m6 + Nệm', houseId: 'h1', room: 'P101', category: 'Nội thất', status: 'active', qrCode: 'QR-101-BD' },
  { id: 'eq4', name: 'Tủ quần áo 2 cánh', houseId: 'h1', room: 'P101', category: 'Nội thất', status: 'active', qrCode: 'QR-101-WD' },
  { id: 'eq5', name: 'Điều hòa Panasonic 9000BTU', houseId: 'h1', room: 'P102', category: 'Điện lạnh', status: 'damaged', qrCode: 'QR-102-AC' },
  { id: 'eq6', name: 'Bình nước nóng Ferroli 20L', houseId: 'h1', room: 'P102', category: 'Điện nước', status: 'active', qrCode: 'QR-102-WH' },
  { id: 'eq7', name: 'Máy giặt Toshiba 8kg', houseId: 'h2', room: 'P201', category: 'Thiết bị', status: 'active', qrCode: 'QR-201-WM' },
  { id: 'eq8', name: 'Tủ lạnh Aqua 90L', houseId: 'h2', room: 'P201', category: 'Thiết bị', status: 'active', qrCode: 'QR-201-FR' },
  { id: 'eq9', name: 'Máy bơm nước tổng', houseId: 'h1', room: 'Khu vực chung', category: 'Thiết bị', status: 'active', qrCode: 'QR-C-WP' },
];

type Equipment = typeof MOCK_EQUIPMENT[0];

const statusMap: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: 'Hoạt động', color: '#16A34A', bg: '#F0FDF4' },
  damaged: { label: 'Hỏng', color: '#DC2626', bg: '#FEF2F2' },
  retired: { label: 'Thanh lý', color: '#6B7280', bg: '#F3F4F6' },
};

const CATEGORIES = ['Tất cả', 'Điện lạnh', 'Điện nước', 'Nội thất', 'Thiết bị'];

export const EquipmentScreen: React.FC = () => {
  const [equipments, setEquipments] = useState(MOCK_EQUIPMENT);
  const [selectedHouseId, setSelectedHouseId] = useState(MOCK_HOUSES[0].id);
  const [selectedCategory, setSelectedCategory] = useState('Tất cả');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Equipment | null>(null);

  // Add form state
  const [newName, setNewName] = useState('');
  const [newRoom, setNewRoom] = useState('');
  const [newCategory, setNewCategory] = useState('Nội thất');

  // Filter by house and category
  const filtered = equipments.filter(e => {
    const matchHouse = e.houseId === selectedHouseId;
    const matchCat = selectedCategory === 'Tất cả' || e.category === selectedCategory;
    return matchHouse && matchCat;
  });

  // Group by room
  const groupedByRoom: Record<string, Equipment[]> = {};
  filtered.forEach(eq => {
    if (!groupedByRoom[eq.room]) groupedByRoom[eq.room] = [];
    groupedByRoom[eq.room].push(eq);
  });

  const handleAdd = () => {
    if (!newName.trim() || !newRoom.trim()) {
      return Alert.alert('Lỗi', 'Vui lòng nhập tên thiết bị và phòng.');
    }
    const newEq: Equipment = {
      id: `eq-${Date.now()}`,
      name: newName,
      houseId: selectedHouseId,
      room: newRoom,
      category: newCategory,
      status: 'active',
      qrCode: `QR-${newRoom}-${Date.now().toString(36).toUpperCase()}`,
    };
    setEquipments(prev => [newEq, ...prev]);
    setShowAddModal(false);
    setNewName('');
    setNewRoom('');
    const houseName = MOCK_HOUSES.find(h => h.id === selectedHouseId)?.name;
    Alert.alert('Thành công', `Đã thêm "${newName}" vào phòng ${newRoom} (${houseName}).`);
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Trang thiết bị</Text>
          <Text style={styles.subtitle}>Quản lý tài sản theo từng nhà</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
          <Text style={styles.addBtnText}>+ Thêm đồ</Text>
        </TouchableOpacity>
      </View>

      {/* House Selector (Tabs) */}
      <View style={styles.houseTabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.houseTabs}>
          {MOCK_HOUSES.map(house => (
            <TouchableOpacity
              key={house.id}
              style={[styles.houseTab, selectedHouseId === house.id && styles.houseTabActive]}
              onPress={() => setSelectedHouseId(house.id)}
            >
              <Text style={styles.houseEmoji}>🏠</Text>
              <Text style={[styles.houseTabText, selectedHouseId === house.id && styles.houseTabTextActive]}>
                {house.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Category Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: Spacing.sm }}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat}
            style={[styles.filterChip, selectedCategory === cat && styles.filterChipActive]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text style={[styles.filterText, selectedCategory === cat && styles.filterTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Equipment List grouped by room */}
      <ScrollView showsVerticalScrollIndicator={false} style={styles.listContainer}>
        {Object.keys(groupedByRoom).length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 40, marginBottom: Spacing.sm }}>📦</Text>
            <Text style={styles.emptyText}>Chưa có thiết bị nào</Text>
          </View>
        ) : (
          Object.entries(groupedByRoom).map(([room, items]) => (
            <View key={room} style={styles.roomSection}>
              <Text style={styles.roomTitle}>🚪 {room}</Text>
              {items.map(eq => {
                const st = statusMap[eq.status];
                return (
                  <TouchableOpacity key={eq.id} style={styles.eqCard} onPress={() => setSelectedItem(eq)}>
                    <View style={styles.eqCardLeft}>
                      <Text style={styles.eqName}>{eq.name}</Text>
                      <Text style={styles.eqCategory}>{eq.category}</Text>
                    </View>
                    <View style={[styles.eqStatus, { backgroundColor: st.bg }]}>
                      <Text style={[styles.eqStatusText, { color: st.color }]}>{st.label}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Detail Modal */}
      {selectedItem && (
        <Modal transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{selectedItem.name}</Text>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Nhà:</Text>
                <Text style={styles.detailValue}>{MOCK_HOUSES.find(h => h.id === selectedItem.houseId)?.name}</Text>
              </View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Phòng:</Text><Text style={styles.detailValue}>{selectedItem.room}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Danh mục:</Text><Text style={styles.detailValue}>{selectedItem.category}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Trạng thái:</Text><Text style={[styles.detailValue, { color: statusMap[selectedItem.status].color }]}>{statusMap[selectedItem.status].label}</Text></View>
              <View style={styles.detailRow}><Text style={styles.detailLabel}>Mã QR:</Text><Text style={styles.detailValue}>{selectedItem.qrCode}</Text></View>

              <View style={styles.qrBox}>
                <Text style={{ fontSize: 48 }}>📱</Text>
                <Text style={styles.qrText}>{selectedItem.qrCode}</Text>
                <Text style={styles.qrHint}>In mã QR này và dán lên thiết bị</Text>
              </View>

              <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedItem(null)}>
                <Text style={styles.closeBtnText}>Đóng</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <Modal transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Thêm thiết bị mới</Text>
              <Text style={styles.modalSubtitle}>Đang thêm vào: {MOCK_HOUSES.find(h => h.id === selectedHouseId)?.name}</Text>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Tên thiết bị *</Text>
                <TextInput style={styles.input} value={newName} onChangeText={setNewName} placeholder="Ví dụ: Điều hòa Daikin 9000BTU" />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Phòng / Khu vực *</Text>
                <TextInput style={styles.input} value={newRoom} onChangeText={setNewRoom} placeholder="Ví dụ: P101 hoặc Khu vực chung" />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Danh mục</Text>
                <View style={styles.categoryRow}>
                  {['Điện lạnh', 'Điện nước', 'Nội thất', 'Thiết bị'].map(c => (
                    <TouchableOpacity key={c} style={[styles.catChip, newCategory === c && styles.catChipActive]} onPress={() => setNewCategory(c)}>
                      <Text style={[styles.catChipText, newCategory === c && { color: Colors.white }]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg }}>
                <TouchableOpacity style={[styles.closeBtn, { flex: 1, marginTop: 0 }]} onPress={() => setShowAddModal(false)}>
                  <Text style={styles.closeBtnText}>Hủy</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.submitBtn, { flex: 1 }]} onPress={handleAdd}>
                  <Text style={styles.submitBtnText}>Thêm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, paddingTop: Spacing.xl },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  addBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: BorderRadius.lg },
  addBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },

  // House Tabs
  houseTabsContainer: { borderBottomWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.white },
  houseTabs: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md },
  houseTab: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, gap: 6 },
  houseTabActive: { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  houseEmoji: { fontSize: 16 },
  houseTabText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  houseTabTextActive: { color: Colors.primary },

  filterRow: { paddingVertical: Spacing.md, maxHeight: 60 },
  filterChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },

  listContainer: { flex: 1 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, color: Colors.textSecondary },

  roomSection: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  roomTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },

  eqCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.white, borderRadius: BorderRadius.md, padding: Spacing.base, marginBottom: Spacing.sm, ...Shadow.sm },
  eqCardLeft: { flex: 1 },
  eqName: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  eqCategory: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  eqStatus: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: BorderRadius.full },
  eqStatusText: { fontSize: 11, fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.xl, maxHeight: '80%' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  modalSubtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.lg, marginTop: 2 },

  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  detailLabel: { fontSize: 14, color: Colors.textSecondary },
  detailValue: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },

  qrBox: { alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: BorderRadius.lg, padding: Spacing.xl, marginTop: Spacing.lg },
  qrText: { fontSize: 18, fontWeight: '800', color: Colors.primary, marginTop: Spacing.sm },
  qrHint: { fontSize: 12, color: Colors.textSecondary, marginTop: Spacing.xs },

  closeBtn: { backgroundColor: Colors.background, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center', marginTop: Spacing.lg },
  closeBtnText: { fontSize: 16, fontWeight: '600', color: Colors.textSecondary },

  // Add form
  inputGroup: { marginBottom: Spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
  input: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: 16, color: Colors.textPrimary },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  catChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  catChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catChipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  submitBtn: { backgroundColor: Colors.primary, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center' },
  submitBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});
