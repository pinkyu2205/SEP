import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Modal, KeyboardAvoidingView, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';

// Mock: Nhà mà Manager đang thuê (lấy từ HĐ admin_manager)
const MOCK_MY_PROPERTIES = [
  { id: 'p1', name: 'Nhà Nguyễn Trãi', address: '123 Nguyễn Trãi, Q5', totalFloors: 4 },
  { id: 'p3', name: 'Nhà CMT8', address: '456 CMT8, Q10', totalFloors: 3 },
];

interface Room {
  id: string;
  code: string;
  floor: number;
  area: number;
  maxOccupants: number;
  rentPrice: number;
  deposit: number;
  electricityRate: number;
  waterRate: number;
  status: 'available' | 'occupied' | 'maintenance';
  tenantName?: string;
}

const INITIAL_ROOMS: Record<string, Room[]> = {
  p1: [
    { id: 'r1', code: 'P101', floor: 1, area: 20, maxOccupants: 2, rentPrice: 3500000, deposit: 3500000, electricityRate: 3500, waterRate: 15000, status: 'occupied', tenantName: 'Trần Văn A' },
    { id: 'r2', code: 'P102', floor: 1, area: 18, maxOccupants: 2, rentPrice: 3200000, deposit: 3200000, electricityRate: 3500, waterRate: 15000, status: 'occupied', tenantName: 'Lê Thị B' },
    { id: 'r3', code: 'P201', floor: 2, area: 22, maxOccupants: 3, rentPrice: 3800000, deposit: 3800000, electricityRate: 3500, waterRate: 15000, status: 'available' },
    { id: 'r4', code: 'P301', floor: 3, area: 20, maxOccupants: 2, rentPrice: 3500000, deposit: 3500000, electricityRate: 3500, waterRate: 15000, status: 'occupied', tenantName: 'Ngô Thị D' },
    { id: 'r5', code: 'P302', floor: 3, area: 20, maxOccupants: 2, rentPrice: 3500000, deposit: 3500000, electricityRate: 3500, waterRate: 15000, status: 'available' },
  ],
  p3: [
    { id: 'r6', code: 'P101', floor: 1, area: 25, maxOccupants: 3, rentPrice: 4000000, deposit: 4000000, electricityRate: 3500, waterRate: 15000, status: 'occupied', tenantName: 'Bùi Văn H' },
    { id: 'r7', code: 'P102', floor: 1, area: 22, maxOccupants: 2, rentPrice: 3600000, deposit: 3600000, electricityRate: 3500, waterRate: 15000, status: 'available' },
  ],
};

const statusMap: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  available: { label: 'Trống', color: '#16A34A', bg: '#F0FDF4', emoji: '🟢' },
  occupied: { label: 'Đang thuê', color: '#3B82F6', bg: '#EFF6FF', emoji: '🔵' },
  maintenance: { label: 'Bảo trì', color: '#F59E0B', bg: '#FFFBEB', emoji: '🟡' },
};

const EMPTY_FORM = { code: '', floor: '1', area: '20', maxOccupants: '2', rentPrice: '3500000', deposit: '3500000', electricityRate: '3500', waterRate: '15000' };

export const RoomManageScreen: React.FC<any> = ({ navigation }) => {
  const [selectedProperty, setSelectedProperty] = useState<string | null>(null);
  const [allRooms, setAllRooms] = useState<Record<string, Room[]>>(INITIAL_ROOMS);
  const [showModal, setShowModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const property = MOCK_MY_PROPERTIES.find(p => p.id === selectedProperty);
  const rooms = selectedProperty ? (allRooms[selectedProperty] || []) : [];
  const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

  const openAddModal = () => {
    setEditingRoom(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEditModal = (room: Room) => {
    setEditingRoom(room);
    setForm({
      code: room.code, floor: String(room.floor), area: String(room.area),
      maxOccupants: String(room.maxOccupants), rentPrice: String(room.rentPrice),
      deposit: String(room.deposit), electricityRate: String(room.electricityRate),
      waterRate: String(room.waterRate),
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.code.trim()) return Alert.alert('Lỗi', 'Vui lòng nhập mã phòng.');
    if (!selectedProperty) return;

    if (editingRoom) {
      setAllRooms(prev => ({
        ...prev,
        [selectedProperty]: prev[selectedProperty].map(r =>
          r.id === editingRoom.id ? {
            ...r, code: form.code, floor: Number(form.floor), area: Number(form.area),
            maxOccupants: Number(form.maxOccupants), rentPrice: Number(form.rentPrice),
            deposit: Number(form.deposit), electricityRate: Number(form.electricityRate),
            waterRate: Number(form.waterRate),
          } : r
        ),
      }));
    } else {
      const newRoom: Room = {
        id: `r-${Date.now()}`, code: form.code, floor: Number(form.floor),
        area: Number(form.area), maxOccupants: Number(form.maxOccupants),
        rentPrice: Number(form.rentPrice), deposit: Number(form.deposit),
        electricityRate: Number(form.electricityRate), waterRate: Number(form.waterRate),
        status: 'available',
      };
      setAllRooms(prev => ({
        ...prev,
        [selectedProperty]: [...(prev[selectedProperty] || []), newRoom],
      }));
    }
    setShowModal(false);
  };

  const handleDelete = (room: Room) => {
    if (room.status === 'occupied') return Alert.alert('Lỗi', 'Không thể xóa phòng đang có khách thuê.');
    Alert.alert('Xác nhận', `Xóa phòng ${room.code}?`, [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => {
        if (!selectedProperty) return;
        setAllRooms(prev => ({
          ...prev,
          [selectedProperty]: prev[selectedProperty].filter(r => r.id !== room.id),
        }));
      }},
    ]);
  };

  // Property Selection View
  if (!selectedProperty) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Quay lại</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Quản lý phòng</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={styles.body}>
          <Text style={styles.sectionTitle}>Chọn nhà bạn đang thuê</Text>
          <Text style={styles.hint}>Chọn một căn nhà để xem và quản lý phòng</Text>

          {MOCK_MY_PROPERTIES.map(p => {
            const propRooms = allRooms[p.id] || [];
            const occupied = propRooms.filter(r => r.status === 'occupied').length;
            const available = propRooms.filter(r => r.status === 'available').length;
            return (
              <TouchableOpacity key={p.id} style={styles.propertyCard} onPress={() => setSelectedProperty(p.id)}>
                <View style={styles.propertyIcon}><Text style={{ fontSize: 28 }}>🏠</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.propertyName}>{p.name}</Text>
                  <Text style={styles.propertyAddress}>{p.address}</Text>
                  <View style={styles.propertyStats}>
                    <Text style={styles.statChip}>🚪 {propRooms.length} phòng</Text>
                    <Text style={styles.statChip}>🔵 {occupied} đang thuê</Text>
                    <Text style={styles.statChip}>🟢 {available} trống</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 20, color: Colors.textMuted }}>→</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Room List View
  const occupied = rooms.filter(r => r.status === 'occupied').length;
  const available = rooms.filter(r => r.status === 'available').length;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setSelectedProperty(null)}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{property?.name}</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Summary */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryChip, { backgroundColor: '#EFF6FF' }]}>
          <Text style={styles.summaryNum}>{rooms.length}</Text>
          <Text style={styles.summaryLabel}>Tổng</Text>
        </View>
        <View style={[styles.summaryChip, { backgroundColor: '#F0FDF4' }]}>
          <Text style={[styles.summaryNum, { color: '#16A34A' }]}>{available}</Text>
          <Text style={styles.summaryLabel}>Trống</Text>
        </View>
        <View style={[styles.summaryChip, { backgroundColor: '#EFF6FF' }]}>
          <Text style={[styles.summaryNum, { color: '#3B82F6' }]}>{occupied}</Text>
          <Text style={styles.summaryLabel}>Đang thuê</Text>
        </View>
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        {rooms.map(room => {
          const st = statusMap[room.status];
          return (
            <View key={room.id} style={styles.roomCard}>
              <View style={styles.roomHeader}>
                <View style={styles.roomTitleRow}>
                  <Text style={{ fontSize: 18 }}>🚪</Text>
                  <Text style={styles.roomCode}>{room.code}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: st.bg }]}>
                    <Text style={[styles.statusText, { color: st.color }]}>{st.emoji} {st.label}</Text>
                  </View>
                </View>
                <Text style={styles.roomFloor}>Tầng {room.floor} · {room.area}m² · {room.maxOccupants} người</Text>
              </View>

              <View style={styles.roomPriceRow}>
                <View>
                  <Text style={styles.priceLabel}>Giá thuê</Text>
                  <Text style={styles.priceValue}>{fmt(room.rentPrice)}</Text>
                </View>
                <View>
                  <Text style={styles.priceLabel}>Tiền cọc</Text>
                  <Text style={styles.priceValue}>{fmt(room.deposit)}</Text>
                </View>
                <View>
                  <Text style={styles.priceLabel}>Điện/Nước</Text>
                  <Text style={styles.priceValue}>{fmt(room.electricityRate)}/{fmt(room.waterRate)}</Text>
                </View>
              </View>

              {room.tenantName && (
                <View style={styles.tenantRow}>
                  <Text style={styles.tenantLabel}>👤 Khách thuê:</Text>
                  <Text style={styles.tenantName}>{room.tenantName}</Text>
                </View>
              )}

              <View style={styles.roomActions}>
                <TouchableOpacity style={styles.editBtn} onPress={() => openEditModal(room)}>
                  <Text style={styles.editBtnText}>✏️ Sửa</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(room)}>
                  <Text style={styles.deleteBtnText}>🗑️ Xóa</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {rooms.length === 0 && (
          <View style={styles.empty}>
            <Text style={{ fontSize: 48 }}>🚪</Text>
            <Text style={styles.emptyText}>Chưa có phòng nào</Text>
            <Text style={styles.hint}>Bấm nút bên dưới để thêm phòng mới</Text>
          </View>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB Add */}
      <TouchableOpacity style={styles.fab} onPress={openAddModal}>
        <Text style={styles.fabText}>+ Thêm phòng</Text>
      </TouchableOpacity>

      {/* Add/Edit Modal */}
      <Modal visible={showModal} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingRoom ? `Sửa phòng ${editingRoom.code}` : 'Thêm phòng mới'}</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={{ fontSize: 20, color: Colors.textMuted }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.formSection}>Thông tin cơ bản</Text>
              <View style={styles.formRow}>
                <View style={{ flex: 1, marginRight: Spacing.sm }}>
                  <Text style={styles.formLabel}>Mã phòng *</Text>
                  <TextInput style={styles.formInput} value={form.code} onChangeText={t => setForm({...form, code: t})} placeholder="VD: P101" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Tầng</Text>
                  <TextInput style={styles.formInput} value={form.floor} onChangeText={t => setForm({...form, floor: t})} keyboardType="numeric" />
                </View>
              </View>
              <View style={styles.formRow}>
                <View style={{ flex: 1, marginRight: Spacing.sm }}>
                  <Text style={styles.formLabel}>Diện tích (m²)</Text>
                  <TextInput style={styles.formInput} value={form.area} onChangeText={t => setForm({...form, area: t})} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Sức chứa (người)</Text>
                  <TextInput style={styles.formInput} value={form.maxOccupants} onChangeText={t => setForm({...form, maxOccupants: t})} keyboardType="numeric" />
                </View>
              </View>

              <Text style={styles.formSection}>Cấu hình tài chính</Text>
              <View style={styles.formRow}>
                <View style={{ flex: 1, marginRight: Spacing.sm }}>
                  <Text style={styles.formLabel}>Giá thuê (₫/tháng)</Text>
                  <TextInput style={styles.formInput} value={form.rentPrice} onChangeText={t => setForm({...form, rentPrice: t})} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Tiền cọc (₫)</Text>
                  <TextInput style={styles.formInput} value={form.deposit} onChangeText={t => setForm({...form, deposit: t})} keyboardType="numeric" />
                </View>
              </View>
              <View style={styles.formRow}>
                <View style={{ flex: 1, marginRight: Spacing.sm }}>
                  <Text style={styles.formLabel}>Điện (₫/kWh)</Text>
                  <TextInput style={styles.formInput} value={form.electricityRate} onChangeText={t => setForm({...form, electricityRate: t})} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Nước (₫/m³)</Text>
                  <TextInput style={styles.formInput} value={form.waterRate} onChangeText={t => setForm({...form, waterRate: t})} keyboardType="numeric" />
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelBtnText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
                <Text style={styles.saveBtnText}>{editingRoom ? 'Cập nhật' : 'Tạo phòng'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: Colors.white, ...Shadow.sm },
  backText: { color: Colors.primary, fontWeight: '600', fontSize: 15 },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  body: { flex: 1, padding: Spacing.lg },

  sectionTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.xs },
  hint: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.lg },

  // Property Selection
  propertyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm },
  propertyIcon: { width: 56, height: 56, borderRadius: BorderRadius.lg, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginRight: Spacing.md },
  propertyName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  propertyAddress: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  propertyStats: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  statChip: { fontSize: 11, color: Colors.textSecondary, backgroundColor: '#F8FAFC', paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.full },

  // Summary
  summaryRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md },
  summaryChip: { flex: 1, borderRadius: BorderRadius.lg, padding: Spacing.md, alignItems: 'center' },
  summaryNum: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  summaryLabel: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  // Room Card
  roomCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, marginBottom: Spacing.md, ...Shadow.sm, overflow: 'hidden' },
  roomHeader: { padding: Spacing.base, borderBottomWidth: 1, borderColor: Colors.divider },
  roomTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  roomCode: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  statusBadge: { paddingHorizontal: Spacing.md, paddingVertical: 3, borderRadius: BorderRadius.full },
  statusText: { fontSize: 11, fontWeight: '700' },
  roomFloor: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },

  roomPriceRow: { flexDirection: 'row', justifyContent: 'space-between', padding: Spacing.base },
  priceLabel: { fontSize: 10, color: Colors.textSecondary, textTransform: 'uppercase' },
  priceValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginTop: 2 },

  tenantRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm, gap: Spacing.xs },
  tenantLabel: { fontSize: 12, color: Colors.textSecondary },
  tenantName: { fontSize: 13, fontWeight: '600', color: Colors.primary },

  roomActions: { flexDirection: 'row', borderTopWidth: 1, borderColor: Colors.divider },
  editBtn: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', borderRightWidth: 1, borderColor: Colors.divider },
  editBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },
  deleteBtn: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center' },
  deleteBtnText: { fontSize: 13, fontWeight: '600', color: '#DC2626' },

  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { fontSize: 16, fontWeight: '600', color: Colors.textSecondary, marginTop: Spacing.md },

  // FAB
  fab: { position: 'absolute', bottom: 30, right: Spacing.lg, left: Spacing.lg, backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, padding: Spacing.md, alignItems: 'center', ...Shadow.md },
  fabText: { color: Colors.white, fontSize: 16, fontWeight: '700' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', padding: Spacing.lg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  modalTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  modalFooter: { flexDirection: 'row', gap: Spacing.md, paddingTop: Spacing.lg, borderTopWidth: 1, borderColor: Colors.divider },
  cancelBtn: { flex: 1, padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  saveBtn: { flex: 1, padding: Spacing.md, borderRadius: BorderRadius.lg, backgroundColor: Colors.primary, alignItems: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },

  formSection: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', marginTop: Spacing.md, marginBottom: Spacing.sm },
  formRow: { flexDirection: 'row', marginBottom: Spacing.md },
  formLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
  formInput: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: 15, color: Colors.textPrimary },
});
