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
  address: string;
  prevElectricity: number;
  prevWater: number;
  activeTenants: number; // Tổng số người đang thuê trong nhà
  isRecorded: boolean; // Đã chốt tháng này chưa
}

const INITIAL_PROPERTIES: PropertyOption[] = [
  { id: 'p1', name: 'Nhà Nguyễn Trãi', address: 'Quận 1, TP.HCM', prevElectricity: 12000, prevWater: 450, activeTenants: 8, isRecorded: false },
  { id: 'p2', name: 'Nhà Lê Văn Sỹ', address: 'Quận 3, TP.HCM', prevElectricity: 8500, prevWater: 280, activeTenants: 5, isRecorded: true },
];

const UNIT_PRICE = {
  electricity: 3500, // đ/kWh
  water: 20000,      // đ/m³
};

// ===================== COMPONENT =====================
export const MeterReadingScreen: React.FC = () => {
  const [properties, setProperties] = useState(INITIAL_PROPERTIES);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [newElectricity, setNewElectricity] = useState('');
  const [newWater, setNewWater] = useState('');

  const selectedProperty = properties.find(p => p.id === selectedPropertyId);

  // Tính toán real-time
  const elecConsumption = useMemo(() => {
    if (!selectedProperty || !newElectricity) return 0;
    const val = parseInt(newElectricity, 10);
    return isNaN(val) ? 0 : Math.max(0, val - selectedProperty.prevElectricity);
  }, [newElectricity, selectedProperty]);

  const waterConsumption = useMemo(() => {
    if (!selectedProperty || !newWater) return 0;
    const val = parseInt(newWater, 10);
    return isNaN(val) ? 0 : Math.max(0, val - selectedProperty.prevWater);
  }, [newWater, selectedProperty]);

  const elecCost = elecConsumption * UNIT_PRICE.electricity;
  const waterCost = waterConsumption * UNIT_PRICE.water;
  const totalUtilityCost = elecCost + waterCost;
  
  // Tính toán chia tiền (Split)
  const costPerTenant = selectedProperty && selectedProperty.activeTenants > 0 
    ? Math.round(totalUtilityCost / selectedProperty.activeTenants) 
    : 0;

  const handleSelectProperty = (prop: PropertyOption) => {
    setSelectedPropertyId(prop.id);
    setNewElectricity('');
    setNewWater('');
  };

  const handleSubmit = () => {
    if (!selectedProperty) return;

    const elecVal = parseInt(newElectricity, 10);
    const waterVal = parseInt(newWater, 10);

    if (isNaN(elecVal) || isNaN(waterVal)) {
      Alert.alert('Lỗi', 'Vui lòng nhập đầy đủ chỉ số điện và nước.');
      return;
    }

    if (elecVal < selectedProperty.prevElectricity) {
      Alert.alert('Lỗi', 'Chỉ số điện mới không thể nhỏ hơn chỉ số cũ.');
      return;
    }
    if (waterVal < selectedProperty.prevWater) {
      Alert.alert('Lỗi', 'Chỉ số nước mới không thể nhỏ hơn chỉ số cũ.');
      return;
    }

    Alert.alert(
      'Xác nhận chốt & Chia tiền',
      `Tòa nhà: ${selectedProperty.name}\n` +
      `Điện tiêu thụ: ${elecConsumption} kWh (${elecCost.toLocaleString('vi-VN')}đ)\n` +
      `Nước tiêu thụ: ${waterConsumption} m³ (${waterCost.toLocaleString('vi-VN')}đ)\n\n` +
      `Tổng tiền chung: ${totalUtilityCost.toLocaleString('vi-VN')}đ\n` +
      `Số người đang ở: ${selectedProperty.activeTenants} người\n` +
      `👉 Mỗi người trả: ${costPerTenant.toLocaleString('vi-VN')}đ\n\n` +
      `Hệ thống sẽ tự động gộp số tiền này vào hóa đơn phòng của từng người.`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Chốt & Tách Bill',
          onPress: () => {
            // Đánh dấu nhà đã chốt
            setProperties(prev => prev.map(p => 
              p.id === selectedProperty.id
                ? { ...p, isRecorded: true, prevElectricity: elecVal, prevWater: waterVal }
                : p
            ));
            setSelectedPropertyId(null);
            setNewElectricity('');
            setNewWater('');
            Alert.alert('Thành công!', `Đã tính toán và tách bill cho các phòng tại ${selectedProperty.name}.`);
          },
        },
      ]
    );
  };

  // Đếm tiến độ
  const totalProperties = properties.length;
  const recordedProperties = properties.filter(p => p.isRecorded).length;

  // ===================== RENDER =====================
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Chốt số Tòa nhà</Text>
          <Text style={styles.subtitle}>Chốt số tổng để hệ thống tự chia tiền</Text>
        </View>

        {/* Progress */}
        <View style={styles.progressCard}>
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>Tiến độ tháng này</Text>
            <Text style={styles.progressValue}>{recordedProperties}/{totalProperties} nhà</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${totalProperties > 0 ? (recordedProperties / totalProperties) * 100 : 0}%` }]} />
          </View>
        </View>

        {/* Danh sách Tòa nhà */}
        <Text style={styles.sectionTitle}>Danh sách Tòa nhà</Text>
        <View style={styles.propertyGrid}>
          {properties.map(p => (
            <TouchableOpacity
              key={p.id}
              style={[
                styles.propertyCard,
                selectedPropertyId === p.id && styles.propertyCardActive,
                p.isRecorded && styles.propertyCardDone,
              ]}
              onPress={() => !p.isRecorded && handleSelectProperty(p)}
              disabled={p.isRecorded}
            >
              <Text style={styles.propertyEmoji}>{p.isRecorded ? '✅' : '🏢'}</Text>
              <Text style={[
                styles.propertyName,
                selectedPropertyId === p.id && { color: Colors.white },
                p.isRecorded && { color: Colors.textMuted },
              ]}>{p.name}</Text>
              <Text style={[
                styles.propertyTenants,
                selectedPropertyId === p.id && { color: 'rgba(255,255,255,0.8)' },
                p.isRecorded && { color: Colors.textMuted },
              ]}>{p.activeTenants} người đang ở</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Form nhập chỉ số */}
        {selectedProperty && !selectedProperty.isRecorded && (
          <View style={styles.formSection}>
            <Text style={styles.sectionTitle}>Nhập chỉ số đồng hồ tổng</Text>

            {/* Điện */}
            <View style={styles.meterCard}>
              <View style={styles.meterHeader}>
                <Text style={styles.meterEmoji}>⚡</Text>
                <Text style={styles.meterTitle}>Điện tổng</Text>
                <Text style={styles.unitPrice}>{UNIT_PRICE.electricity.toLocaleString('vi-VN')}đ/kWh</Text>
              </View>
              <View style={styles.meterRow}>
                <View style={styles.meterCol}>
                  <Text style={styles.meterLabel}>Chỉ số cũ</Text>
                  <View style={styles.readonlyInput}>
                    <Text style={styles.readonlyText}>{selectedProperty.prevElectricity}</Text>
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
                <Text style={styles.meterTitle}>Nước tổng</Text>
                <Text style={styles.unitPrice}>{UNIT_PRICE.water.toLocaleString('vi-VN')}đ/m³</Text>
              </View>
              <View style={styles.meterRow}>
                <View style={styles.meterCol}>
                  <Text style={styles.meterLabel}>Chỉ số cũ</Text>
                  <View style={styles.readonlyInput}>
                    <Text style={styles.readonlyText}>{selectedProperty.prevWater}</Text>
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

            {/* Bảng tổng kết chia tiền */}
            {(elecConsumption > 0 || waterConsumption > 0) && (
              <View style={styles.summaryCard}>
                <View style={styles.summaryHeader}>
                  <Text style={styles.summaryTitle}>Dự kiến Tách Bill (Chia đều)</Text>
                  <Text style={styles.summaryBadge}>Tự động</Text>
                </View>
                
                <View style={styles.summaryLine}>
                  <Text style={styles.summaryLabel}>Tiền điện tổng</Text>
                  <Text style={styles.summaryVal}>{elecCost.toLocaleString('vi-VN')}đ</Text>
                </View>
                <View style={styles.summaryLine}>
                  <Text style={styles.summaryLabel}>Tiền nước tổng</Text>
                  <Text style={styles.summaryVal}>{waterCost.toLocaleString('vi-VN')}đ</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryLine}>
                  <Text style={styles.grandTotalLabel}>TỔNG TIỀN CHUNG</Text>
                  <Text style={styles.grandTotalVal}>{totalUtilityCost.toLocaleString('vi-VN')}đ</Text>
                </View>
                <View style={styles.splitBox}>
                  <Text style={styles.splitBoxText}>
                    Chia đều cho <Text style={{fontWeight: 'bold'}}>{selectedProperty.activeTenants} người</Text> đang ở
                  </Text>
                  <Text style={styles.splitResult}>
                    👉 Mỗi người trả: {costPerTenant.toLocaleString('vi-VN')}đ
                  </Text>
                </View>
              </View>
            )}

            {/* Nút submit */}
            <TouchableOpacity
              style={[styles.submitBtn, (!newElectricity || !newWater) && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={!newElectricity || !newWater}
            >
              <Text style={styles.submitBtnText}>🧮 Chốt số & Hệ thống tự chia tiền</Text>
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

  // Property grid
  propertyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.lg },
  propertyCard: {
    width: '47%', backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, alignItems: 'center', borderWidth: 2, borderColor: Colors.border, ...Shadow.sm,
  },
  propertyCardActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  propertyCardDone: { backgroundColor: Colors.successLight, borderColor: Colors.success, opacity: 0.6 },
  propertyEmoji: { fontSize: 28, marginBottom: Spacing.xs },
  propertyName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  propertyTenants: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },

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

  // Summary (Split Bill)
  summaryCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.lg, ...Shadow.md,
    borderWidth: 1, borderColor: Colors.primary, borderStyle: 'dashed',
  },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  summaryTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  summaryBadge: { backgroundColor: Colors.primaryBg, color: Colors.primary, fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  summaryLabel: { fontSize: 14, color: Colors.textSecondary },
  summaryVal: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  summaryDivider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.md },
  grandTotalLabel: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  grandTotalVal: { fontSize: 20, fontWeight: '800', color: Colors.primary },

  splitBox: {
    backgroundColor: '#F8FAFC', borderRadius: BorderRadius.md, padding: Spacing.md, marginTop: Spacing.md,
    borderLeftWidth: 4, borderLeftColor: Colors.primary
  },
  splitBoxText: { fontSize: 13, color: Colors.textSecondary, marginBottom: 4 },
  splitResult: { fontSize: 16, fontWeight: '800', color: Colors.primary },

  // Submit
  submitBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', ...Shadow.md, marginBottom: Spacing.lg,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
});
