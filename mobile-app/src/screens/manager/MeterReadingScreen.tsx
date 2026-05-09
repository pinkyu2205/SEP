import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';

// ===================== MOCK DATA =====================
interface PropertyOption {
  id: string;
  name: string;
  rooms: RoomOption[];
}

interface RoomOption {
  id: string;
  name: string;
  tenantName: string;
  prevElectricity: number;
  prevWater: number;
  isRecorded: boolean; // Đã chốt tháng này chưa
}

const MOCK_PROPERTIES: PropertyOption[] = [
  {
    id: 'p1',
    name: 'Nhà Trọ Sunrise',
    rooms: [
      { id: 'r1', name: 'Phòng 101', tenantName: 'Nguyễn Văn A', prevElectricity: 1200, prevWater: 45, isRecorded: false },
      { id: 'r2', name: 'Phòng 102', tenantName: 'Trần Thị B', prevElectricity: 980, prevWater: 38, isRecorded: false },
      { id: 'r3', name: 'Phòng 201', tenantName: 'Lê Văn C', prevElectricity: 1450, prevWater: 52, isRecorded: true },
      { id: 'r4', name: 'Phòng 202', tenantName: 'Phạm Thị D', prevElectricity: 870, prevWater: 30, isRecorded: false },
    ],
  },
  {
    id: 'p2',
    name: 'Nhà Trọ Moonlight',
    rooms: [
      { id: 'r5', name: 'Phòng 101', tenantName: 'Hoàng Văn E', prevElectricity: 600, prevWater: 20, isRecorded: false },
      { id: 'r6', name: 'Phòng 102', tenantName: 'Vũ Thị F', prevElectricity: 750, prevWater: 28, isRecorded: false },
    ],
  },
];

const UNIT_PRICE = {
  electricity: 3500, // đ/kWh
  water: 20000,      // đ/m³
  room: 3000000,
  service: 150000,
};

// ===================== COMPONENT =====================
export const MeterReadingScreen: React.FC = () => {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [newElectricity, setNewElectricity] = useState('');
  const [newWater, setNewWater] = useState('');
  const [rooms, setRooms] = useState(MOCK_PROPERTIES);

  const selectedProperty = rooms.find(p => p.id === selectedPropertyId);
  const selectedRoom = selectedProperty?.rooms.find(r => r.id === selectedRoomId);

  // Tính toán real-time
  const elecConsumption = useMemo(() => {
    if (!selectedRoom || !newElectricity) return 0;
    const val = parseInt(newElectricity, 10);
    return isNaN(val) ? 0 : Math.max(0, val - selectedRoom.prevElectricity);
  }, [newElectricity, selectedRoom]);

  const waterConsumption = useMemo(() => {
    if (!selectedRoom || !newWater) return 0;
    const val = parseInt(newWater, 10);
    return isNaN(val) ? 0 : Math.max(0, val - selectedRoom.prevWater);
  }, [newWater, selectedRoom]);

  const elecCost = elecConsumption * UNIT_PRICE.electricity;
  const waterCost = waterConsumption * UNIT_PRICE.water;
  const totalInvoice = UNIT_PRICE.room + elecCost + waterCost + UNIT_PRICE.service;

  const handleSelectRoom = (room: RoomOption) => {
    setSelectedRoomId(room.id);
    setNewElectricity('');
    setNewWater('');
  };

  const handleSubmit = () => {
    if (!selectedRoom) return;

    const elecVal = parseInt(newElectricity, 10);
    const waterVal = parseInt(newWater, 10);

    if (isNaN(elecVal) || isNaN(waterVal)) {
      Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ chỉ số điện và nước.');
      return;
    }

    if (elecVal < selectedRoom.prevElectricity) {
      Alert.alert('Lỗi', 'Chỉ số điện mới không thể nhỏ hơn chỉ số cũ.');
      return;
    }
    if (waterVal < selectedRoom.prevWater) {
      Alert.alert('Lỗi', 'Chỉ số nước mới không thể nhỏ hơn chỉ số cũ.');
      return;
    }

    Alert.alert(
      'Xác nhận chốt số',
      `Phòng: ${selectedRoom.name}\n` +
      `Điện tiêu thụ: ${elecConsumption} kWh (${elecCost.toLocaleString('vi-VN')}đ)\n` +
      `Nước tiêu thụ: ${waterConsumption} m³ (${waterCost.toLocaleString('vi-VN')}đ)\n\n` +
      `Tổng hóa đơn: ${totalInvoice.toLocaleString('vi-VN')}đ\n\n` +
      `Hóa đơn sẽ được gửi cho ${selectedRoom.tenantName}.`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Chốt & Phát hành',
          onPress: () => {
            // Đánh dấu phòng đã chốt
            setRooms(prev => prev.map(p => ({
              ...p,
              rooms: p.rooms.map(r =>
                r.id === selectedRoom.id
                  ? { ...r, isRecorded: true, prevElectricity: elecVal, prevWater: waterVal }
                  : r
              ),
            })));
            setSelectedRoomId(null);
            setNewElectricity('');
            setNewWater('');
            Alert.alert('Thành công!', `Đã phát hành hóa đơn cho ${selectedRoom.name}.`);
          },
        },
      ]
    );
  };

  // Đếm tổng số phòng đã chốt / tổng phòng
  const totalRooms = rooms.reduce((acc, p) => acc + p.rooms.length, 0);
  const recordedRooms = rooms.reduce((acc, p) => acc + p.rooms.filter(r => r.isRecorded).length, 0);

  // ===================== RENDER =====================
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Chốt điện nước</Text>
          <Text style={styles.subtitle}>Tháng 05/2026</Text>
        </View>

        {/* Progress */}
        <View style={styles.progressCard}>
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>Tiến độ chốt số</Text>
            <Text style={styles.progressValue}>{recordedRooms}/{totalRooms} phòng</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${totalRooms > 0 ? (recordedRooms / totalRooms) * 100 : 0}%` }]} />
          </View>
        </View>

        {/* Chọn Tòa nhà */}
        <Text style={styles.sectionTitle}>Chọn tòa nhà</Text>
        <View style={styles.propertyRow}>
          {rooms.map(p => {
            const recorded = p.rooms.filter(r => r.isRecorded).length;
            const total = p.rooms.length;
            const allDone = recorded === total;
            return (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.propertyChip,
                  selectedPropertyId === p.id && styles.propertyChipActive,
                  allDone && styles.propertyChipDone,
                ]}
                onPress={() => {
                  setSelectedPropertyId(p.id);
                  setSelectedRoomId(null);
                }}
              >
                <Text style={[
                  styles.propertyChipText,
                  selectedPropertyId === p.id && styles.propertyChipTextActive,
                ]}>
                  {p.name}
                </Text>
                <Text style={[
                  styles.propertyChipSub,
                  selectedPropertyId === p.id && { color: 'rgba(255,255,255,0.8)' },
                ]}>
                  {allDone ? '✅ Hoàn tất' : `${recorded}/${total} phòng`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Danh sách Phòng */}
        {selectedProperty && (
          <>
            <Text style={styles.sectionTitle}>Chọn phòng</Text>
            <View style={styles.roomGrid}>
              {selectedProperty.rooms.map(room => (
                <TouchableOpacity
                  key={room.id}
                  style={[
                    styles.roomCard,
                    selectedRoomId === room.id && styles.roomCardActive,
                    room.isRecorded && styles.roomCardDone,
                  ]}
                  onPress={() => !room.isRecorded && handleSelectRoom(room)}
                  disabled={room.isRecorded}
                >
                  <Text style={styles.roomEmoji}>{room.isRecorded ? '✅' : '🚪'}</Text>
                  <Text style={[
                    styles.roomName,
                    selectedRoomId === room.id && { color: Colors.white },
                    room.isRecorded && { color: Colors.textMuted },
                  ]}>{room.name}</Text>
                  <Text style={[
                    styles.roomTenant,
                    selectedRoomId === room.id && { color: 'rgba(255,255,255,0.8)' },
                    room.isRecorded && { color: Colors.textMuted },
                  ]}>{room.tenantName}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Form nhập chỉ số */}
        {selectedRoom && !selectedRoom.isRecorded && (
          <View style={styles.formSection}>
            <Text style={styles.sectionTitle}>Nhập chỉ số — {selectedRoom.name}</Text>

            {/* Điện */}
            <View style={styles.meterCard}>
              <View style={styles.meterHeader}>
                <Text style={styles.meterEmoji}>⚡</Text>
                <Text style={styles.meterTitle}>Điện</Text>
                <Text style={styles.unitPrice}>{UNIT_PRICE.electricity.toLocaleString('vi-VN')}đ/kWh</Text>
              </View>
              <View style={styles.meterRow}>
                <View style={styles.meterCol}>
                  <Text style={styles.meterLabel}>Chỉ số cũ</Text>
                  <View style={styles.readonlyInput}>
                    <Text style={styles.readonlyText}>{selectedRoom.prevElectricity}</Text>
                  </View>
                </View>
                <View style={styles.meterArrow}>
                  <Text style={{ fontSize: 18 }}>→</Text>
                </View>
                <View style={styles.meterCol}>
                  <Text style={styles.meterLabel}>Chỉ số mới</Text>
                  <TextInput
                    style={styles.meterInput}
                    value={newElectricity}
                    onChangeText={setNewElectricity}
                    keyboardType="numeric"
                    placeholder="Nhập số..."
                  />
                </View>
              </View>
              {elecConsumption > 0 && (
                <View style={styles.consumptionRow}>
                  <Text style={styles.consumptionText}>Tiêu thụ: <Text style={styles.consumptionVal}>{elecConsumption} kWh</Text></Text>
                  <Text style={styles.consumptionCost}>{elecCost.toLocaleString('vi-VN')}đ</Text>
                </View>
              )}
            </View>

            {/* Nước */}
            <View style={styles.meterCard}>
              <View style={styles.meterHeader}>
                <Text style={styles.meterEmoji}>💧</Text>
                <Text style={styles.meterTitle}>Nước</Text>
                <Text style={styles.unitPrice}>{UNIT_PRICE.water.toLocaleString('vi-VN')}đ/m³</Text>
              </View>
              <View style={styles.meterRow}>
                <View style={styles.meterCol}>
                  <Text style={styles.meterLabel}>Chỉ số cũ</Text>
                  <View style={styles.readonlyInput}>
                    <Text style={styles.readonlyText}>{selectedRoom.prevWater}</Text>
                  </View>
                </View>
                <View style={styles.meterArrow}>
                  <Text style={{ fontSize: 18 }}>→</Text>
                </View>
                <View style={styles.meterCol}>
                  <Text style={styles.meterLabel}>Chỉ số mới</Text>
                  <TextInput
                    style={styles.meterInput}
                    value={newWater}
                    onChangeText={setNewWater}
                    keyboardType="numeric"
                    placeholder="Nhập số..."
                  />
                </View>
              </View>
              {waterConsumption > 0 && (
                <View style={styles.consumptionRow}>
                  <Text style={styles.consumptionText}>Tiêu thụ: <Text style={styles.consumptionVal}>{waterConsumption} m³</Text></Text>
                  <Text style={styles.consumptionCost}>{waterCost.toLocaleString('vi-VN')}đ</Text>
                </View>
              )}
            </View>

            {/* Bảng tổng kết hóa đơn */}
            {(elecConsumption > 0 || waterConsumption > 0) && (
              <View style={styles.summaryCard}>
                <Text style={styles.summaryTitle}>Bảng tổng kết hóa đơn</Text>
                <View style={styles.summaryLine}>
                  <Text style={styles.summaryLabel}>Tiền phòng</Text>
                  <Text style={styles.summaryVal}>{UNIT_PRICE.room.toLocaleString('vi-VN')}đ</Text>
                </View>
                <View style={styles.summaryLine}>
                  <Text style={styles.summaryLabel}>Tiền điện ({elecConsumption} kWh)</Text>
                  <Text style={styles.summaryVal}>{elecCost.toLocaleString('vi-VN')}đ</Text>
                </View>
                <View style={styles.summaryLine}>
                  <Text style={styles.summaryLabel}>Tiền nước ({waterConsumption} m³)</Text>
                  <Text style={styles.summaryVal}>{waterCost.toLocaleString('vi-VN')}đ</Text>
                </View>
                <View style={styles.summaryLine}>
                  <Text style={styles.summaryLabel}>Phí dịch vụ</Text>
                  <Text style={styles.summaryVal}>{UNIT_PRICE.service.toLocaleString('vi-VN')}đ</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryLine}>
                  <Text style={styles.grandTotalLabel}>TỔNG CỘNG</Text>
                  <Text style={styles.grandTotalVal}>{totalInvoice.toLocaleString('vi-VN')}đ</Text>
                </View>
              </View>
            )}

            {/* Nút submit */}
            <TouchableOpacity
              style={[styles.submitBtn, (!newElectricity || !newWater) && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!newElectricity || !newWater}
            >
              <Text style={styles.submitBtnText}>📋 Chốt & Phát hành hóa đơn</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// ===================== STYLES =====================
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  header: { paddingTop: Spacing.lg, marginBottom: Spacing.md },
  title: { fontSize: 26, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 14, color: Colors.textSecondary, marginTop: 2 },

  // Progress
  progressCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.lg, ...Shadow.sm,
  },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  progressLabel: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  progressValue: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  progressBarBg: { height: 8, backgroundColor: Colors.divider, borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: 8, backgroundColor: Colors.primary, borderRadius: 4 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },

  // Property chips
  propertyRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg, flexWrap: 'wrap' },
  propertyChip: {
    flex: 1, minWidth: '45%', backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, borderWidth: 2, borderColor: Colors.border, ...Shadow.sm,
  },
  propertyChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  propertyChipDone: { borderColor: Colors.success, opacity: 0.7 },
  propertyChipText: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  propertyChipTextActive: { color: Colors.white },
  propertyChipSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },

  // Room grid
  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.lg },
  roomCard: {
    width: '47%', backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, alignItems: 'center', borderWidth: 2, borderColor: Colors.border, ...Shadow.sm,
  },
  roomCardActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  roomCardDone: { backgroundColor: Colors.successLight, borderColor: Colors.success, opacity: 0.6 },
  roomEmoji: { fontSize: 24, marginBottom: Spacing.xs },
  roomName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  roomTenant: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  // Form
  formSection: { marginTop: Spacing.sm },
  meterCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.md,
  },
  meterHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  meterEmoji: { fontSize: 22, marginRight: Spacing.sm },
  meterTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  unitPrice: { fontSize: 12, color: Colors.textMuted, fontWeight: '500' },

  meterRow: { flexDirection: 'row', alignItems: 'center' },
  meterCol: { flex: 1 },
  meterArrow: { paddingHorizontal: Spacing.md, paddingTop: 20 },
  meterLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.xs, fontWeight: '600' },
  readonlyInput: {
    backgroundColor: Colors.divider, borderRadius: BorderRadius.md,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10, paddingHorizontal: Spacing.md,
  },
  readonlyText: { fontSize: 18, fontWeight: '700', color: Colors.textMuted },
  meterInput: {
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10, paddingHorizontal: Spacing.md,
    fontSize: 18, fontWeight: '700', color: Colors.textPrimary, backgroundColor: Colors.primaryBg,
  },

  consumptionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: Spacing.md, backgroundColor: Colors.primaryBg,
    padding: Spacing.sm, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md,
  },
  consumptionText: { fontSize: 13, color: Colors.textSecondary },
  consumptionVal: { fontWeight: '700', color: Colors.primary },
  consumptionCost: { fontSize: 14, fontWeight: '700', color: Colors.primary },

  // Summary
  summaryCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.lg, ...Shadow.md,
    borderWidth: 1, borderColor: Colors.primary, borderStyle: 'dashed',
  },
  summaryTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  summaryLabel: { fontSize: 14, color: Colors.textSecondary },
  summaryVal: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  summaryDivider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.md },
  grandTotalLabel: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  grandTotalVal: { fontSize: 20, fontWeight: '800', color: Colors.primary },

  // Submit
  submitBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', ...Shadow.md, marginBottom: Spacing.lg,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
});
