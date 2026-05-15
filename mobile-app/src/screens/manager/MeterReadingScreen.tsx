import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';

// ===================== TYPES & CONSTANTS =====================
interface PropertyOption {
  id: string;
  name: string;
  address: string;
  prevElectricity: number;
  prevWater: number;
  activeTenants: number;
  isRecorded: boolean;
  avgElecConsumption?: number;
  avgWaterConsumption?: number;
}

interface HistoryRecord {
  id: string;
  propertyId: string;
  month: number;
  year: number;
  prevElec: number;
  newElec: number;
  prevWater: number;
  newWater: number;
  elecConsumption: number;
  waterConsumption: number;
  elecCost: number;
  waterCost: number;
  totalCost: number;
  costPerTenant: number;
  activeTenants: number;
  recordedAt: string;
  invoicesGenerated: boolean;
}

const UNIT_PRICE = { electricity: 3500, water: 20000 };
const ABNORMAL_THRESHOLD = 1.5; // 50% tăng so với trung bình

const INITIAL_PROPERTIES: PropertyOption[] = [
  {
    id: 'p1', name: 'Nhà Nguyễn Trãi', address: 'Quận 1, TP.HCM',
    prevElectricity: 12340, prevWater: 523,
    activeTenants: 8, isRecorded: false,
    avgElecConsumption: 420, avgWaterConsumption: 28,
  },
  {
    id: 'p2', name: 'Nhà Lê Văn Sỹ', address: 'Quận 3, TP.HCM',
    prevElectricity: 8750, prevWater: 298,
    activeTenants: 5, isRecorded: true,
    avgElecConsumption: 310, avgWaterConsumption: 20,
  },
];

const INITIAL_HISTORY: HistoryRecord[] = [
  {
    id: 'h1', propertyId: 'p1', month: 4, year: 2026,
    prevElec: 11920, newElec: 12340, prevWater: 495, newWater: 523,
    elecConsumption: 420, waterConsumption: 28,
    elecCost: 420 * 3500, waterCost: 28 * 20000,
    totalCost: 420 * 3500 + 28 * 20000, costPerTenant: Math.round((420 * 3500 + 28 * 20000) / 8),
    activeTenants: 8, recordedAt: '2026-04-30', invoicesGenerated: true,
  },
  {
    id: 'h2', propertyId: 'p1', month: 3, year: 2026,
    prevElec: 11510, newElec: 11920, prevWater: 467, newWater: 495,
    elecConsumption: 410, waterConsumption: 28,
    elecCost: 410 * 3500, waterCost: 28 * 20000,
    totalCost: 410 * 3500 + 28 * 20000, costPerTenant: Math.round((410 * 3500 + 28 * 20000) / 8),
    activeTenants: 8, recordedAt: '2026-03-31', invoicesGenerated: true,
  },
  {
    id: 'h3', propertyId: 'p1', month: 2, year: 2026,
    prevElec: 11100, newElec: 11510, prevWater: 438, newWater: 467,
    elecConsumption: 410, waterConsumption: 29,
    elecCost: 410 * 3500, waterCost: 29 * 20000,
    totalCost: 410 * 3500 + 29 * 20000, costPerTenant: Math.round((410 * 3500 + 29 * 20000) / 8),
    activeTenants: 8, recordedAt: '2026-02-28', invoicesGenerated: true,
  },
  {
    id: 'h4', propertyId: 'p2', month: 5, year: 2026,
    prevElec: 8440, newElec: 8750, prevWater: 278, newWater: 298,
    elecConsumption: 310, waterConsumption: 20,
    elecCost: 310 * 3500, waterCost: 20 * 20000,
    totalCost: 310 * 3500 + 20 * 20000, costPerTenant: Math.round((310 * 3500 + 20 * 20000) / 5),
    activeTenants: 5, recordedAt: '2026-05-01', invoicesGenerated: true,
  },
];

type TabType = 'record' | 'history';

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

// ===================== HISTORY CARD =====================
const HistoryCard: React.FC<{ record: HistoryRecord }> = ({ record }) => (
  <View style={hStyles.card}>
    <View style={hStyles.cardHeader}>
      <Text style={hStyles.monthLabel}>
        Tháng {String(record.month).padStart(2, '0')}/{record.year}
      </Text>
      <View style={[hStyles.badge, { backgroundColor: record.invoicesGenerated ? Colors.successLight : Colors.warningLight }]}>
        <Text style={[hStyles.badgeText, { color: record.invoicesGenerated ? Colors.success : Colors.warning }]}>
          {record.invoicesGenerated ? '✓ Đã xuất bill' : '⏳ Chưa xuất'}
        </Text>
      </View>
    </View>
    <View style={hStyles.metersRow}>
      <View style={hStyles.meterItem}>
        <Text style={hStyles.meterLabel}>⚡ Điện</Text>
        <Text style={hStyles.meterValues}>{record.prevElec} → {record.newElec}</Text>
        <Text style={hStyles.consumption}>{record.elecConsumption} kWh · {fmt(record.elecCost)}</Text>
      </View>
      <View style={hStyles.meterDivider} />
      <View style={hStyles.meterItem}>
        <Text style={hStyles.meterLabel}>💧 Nước</Text>
        <Text style={hStyles.meterValues}>{record.prevWater} → {record.newWater}</Text>
        <Text style={hStyles.consumption}>{record.waterConsumption} m³ · {fmt(record.waterCost)}</Text>
      </View>
    </View>
    <View style={hStyles.cardFooter}>
      <Text style={hStyles.footerLabel}>
        Tổng: <Text style={hStyles.footerTotal}>{fmt(record.totalCost)}</Text>
        {'  '}|{'  '}{record.activeTenants} người · <Text style={hStyles.footerPer}>
          {fmt(record.costPerTenant)}/người
        </Text>
      </Text>
      <Text style={hStyles.footerDate}>{record.recordedAt}</Text>
    </View>
  </View>
);

const hStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  monthLabel: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  badgeText: { fontSize: 11, fontWeight: '600' },
  metersRow: { flexDirection: 'row', marginBottom: Spacing.md },
  meterItem: { flex: 1 },
  meterDivider: { width: 1, backgroundColor: Colors.divider, marginHorizontal: Spacing.sm },
  meterLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 2 },
  meterValues: { fontSize: 13, color: Colors.textPrimary, fontWeight: '500' },
  consumption: { fontSize: 12, color: Colors.primary, marginTop: 2 },
  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderColor: Colors.divider, paddingTop: Spacing.sm,
  },
  footerLabel: { fontSize: 12, color: Colors.textSecondary },
  footerTotal: { fontWeight: '700', color: Colors.textPrimary },
  footerPer: { fontWeight: '700', color: Colors.primary },
  footerDate: { fontSize: 11, color: Colors.textMuted },
});

// ===================== MAIN COMPONENT =====================
export const MeterReadingScreen: React.FC = () => {
  const [tab, setTab] = useState<TabType>('record');
  const [properties, setProperties] = useState(INITIAL_PROPERTIES);
  const [history, setHistory] = useState(INITIAL_HISTORY);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [newElectricity, setNewElectricity] = useState('');
  const [newWater, setNewWater] = useState('');
  const [historyPropertyFilter, setHistoryPropertyFilter] = useState<string>('all');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [pendingRecord, setPendingRecord] = useState<Omit<HistoryRecord, 'id' | 'invoicesGenerated'> | null>(null);

  const selectedProperty = properties.find(p => p.id === selectedPropertyId);

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
  const costPerTenant = selectedProperty && selectedProperty.activeTenants > 0
    ? Math.round(totalUtilityCost / selectedProperty.activeTenants)
    : 0;

  const isElecAbnormal = selectedProperty?.avgElecConsumption
    ? elecConsumption > selectedProperty.avgElecConsumption * ABNORMAL_THRESHOLD
    : false;
  const isWaterAbnormal = selectedProperty?.avgWaterConsumption
    ? waterConsumption > selectedProperty.avgWaterConsumption * ABNORMAL_THRESHOLD
    : false;

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
      Alert.alert('Lỗi', `Chỉ số điện mới (${elecVal}) không thể nhỏ hơn chỉ số cũ (${selectedProperty.prevElectricity}).`);
      return;
    }
    if (waterVal < selectedProperty.prevWater) {
      Alert.alert('Lỗi', `Chỉ số nước mới (${waterVal}) không thể nhỏ hơn chỉ số cũ (${selectedProperty.prevWater}).`);
      return;
    }

    if (isElecAbnormal || isWaterAbnormal) {
      Alert.alert(
        '⚠️ Tiêu thụ bất thường',
        `${isElecAbnormal ? `Điện: ${elecConsumption} kWh (TB: ${selectedProperty.avgElecConsumption} kWh)\n` : ''}` +
        `${isWaterAbnormal ? `Nước: ${waterConsumption} m³ (TB: ${selectedProperty.avgWaterConsumption} m³)\n` : ''}\n` +
        'Tiêu thụ tăng hơn 50% so với trung bình. Bạn có chắc chắn muốn tiếp tục?',
        [
          { text: 'Kiểm tra lại', style: 'cancel' },
          { text: 'Vẫn tiếp tục', onPress: () => openGenerateModal(elecVal, waterVal) },
        ]
      );
      return;
    }
    openGenerateModal(elecVal, waterVal);
  };

  const openGenerateModal = (elecVal: number, waterVal: number) => {
    if (!selectedProperty) return;
    setPendingRecord({
      propertyId: selectedProperty.id,
      month: 5,
      year: 2026,
      prevElec: selectedProperty.prevElectricity,
      newElec: elecVal,
      prevWater: selectedProperty.prevWater,
      newWater: waterVal,
      elecConsumption,
      waterConsumption,
      elecCost,
      waterCost,
      totalCost: totalUtilityCost,
      costPerTenant,
      activeTenants: selectedProperty.activeTenants,
      recordedAt: new Date().toISOString().split('T')[0],
    });
    setShowGenerateModal(true);
  };

  const handleConfirmAndGenerate = () => {
    if (!pendingRecord || !selectedProperty) return;
    const newRecord: HistoryRecord = {
      ...pendingRecord,
      id: `h-${Date.now()}`,
      invoicesGenerated: true,
    };
    setHistory(prev => [newRecord, ...prev]);
    setProperties(prev => prev.map(p =>
      p.id === selectedProperty.id
        ? { ...p, isRecorded: true, prevElectricity: newRecord.newElec, prevWater: newRecord.newWater }
        : p
    ));
    setShowGenerateModal(false);
    setSelectedPropertyId(null);
    setNewElectricity('');
    setNewWater('');
    Alert.alert(
      '✅ Chốt số thành công!',
      `Đã ghi nhận chỉ số và tự động xuất ${selectedProperty.activeTenants} hóa đơn cho các phòng tại ${selectedProperty.name}.`
    );
  };

  const filteredHistory = historyPropertyFilter === 'all'
    ? history
    : history.filter(h => h.propertyId === historyPropertyFilter);

  const totalRecorded = properties.filter(p => p.isRecorded).length;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {(['record', 'history'] as TabType[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'record' ? '⚡ Chốt số' : '📋 Lịch sử'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'record' ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Chốt số tổng</Text>
            <Text style={styles.subtitle}>Tháng 05/2026 — tự động chia bill</Text>
          </View>

          {/* Progress */}
          <View style={styles.progressCard}>
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>Tiến độ tháng 05/2026</Text>
              <Text style={styles.progressValue}>{totalRecorded}/{properties.length} tòa nhà</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, {
                width: `${properties.length > 0 ? (totalRecorded / properties.length) * 100 : 0}%`
              }]} />
            </View>
            <Text style={styles.progressHint}>
              {totalRecorded === properties.length ? '✅ Tất cả đã chốt tháng này!' : `Còn ${properties.length - totalRecorded} tòa nhà chưa chốt`}
            </Text>
          </View>

          {/* Property list */}
          <Text style={styles.sectionTitle}>Chọn tòa nhà</Text>
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
                  styles.propertyMeta,
                  selectedPropertyId === p.id && { color: 'rgba(255,255,255,0.8)' },
                  p.isRecorded && { color: Colors.textMuted },
                ]}>
                  {p.activeTenants} người đang ở
                </Text>
                {!p.isRecorded && (
                  <Text style={[
                    styles.propertyPrev,
                    selectedPropertyId === p.id && { color: 'rgba(255,255,255,0.7)' },
                  ]}>
                    Điện: {p.prevElectricity} · Nước: {p.prevWater}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Form */}
          {selectedProperty && !selectedProperty.isRecorded && (
            <View style={styles.formSection}>
              <Text style={styles.sectionTitle}>Nhập chỉ số đồng hồ tổng</Text>

              {/* Electricity */}
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
                  <View style={styles.meterArrow}><Text style={{ fontSize: 18 }}>→</Text></View>
                  <View style={styles.meterCol}>
                    <Text style={styles.meterLabel}>Chỉ số mới *</Text>
                    <TextInput
                      style={[styles.meterInput, isElecAbnormal && styles.meterInputWarning]}
                      value={newElectricity}
                      onChangeText={setNewElectricity}
                      keyboardType="numeric"
                      placeholder="Nhập số..."
                    />
                  </View>
                </View>
                {elecConsumption > 0 && (
                  <View style={[styles.consumptionRow, isElecAbnormal && { backgroundColor: Colors.warningLight }]}>
                    <View>
                      <Text style={styles.consumptionText}>
                        Tiêu thụ: <Text style={styles.consumptionVal}>{elecConsumption} kWh</Text>
                        {selectedProperty.avgElecConsumption && (
                          <Text style={{ color: Colors.textMuted }}> (TB: {selectedProperty.avgElecConsumption})</Text>
                        )}
                      </Text>
                      {isElecAbnormal && (
                        <Text style={styles.abnormalWarning}>⚠️ Tiêu thụ tăng bất thường!</Text>
                      )}
                    </View>
                    <Text style={[styles.consumptionCost, isElecAbnormal && { color: Colors.warning }]}>
                      {fmt(elecCost)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Water */}
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
                  <View style={styles.meterArrow}><Text style={{ fontSize: 18 }}>→</Text></View>
                  <View style={styles.meterCol}>
                    <Text style={styles.meterLabel}>Chỉ số mới *</Text>
                    <TextInput
                      style={[styles.meterInput, isWaterAbnormal && styles.meterInputWarning]}
                      value={newWater}
                      onChangeText={setNewWater}
                      keyboardType="numeric"
                      placeholder="Nhập số..."
                    />
                  </View>
                </View>
                {waterConsumption > 0 && (
                  <View style={[styles.consumptionRow, isWaterAbnormal && { backgroundColor: Colors.warningLight }]}>
                    <View>
                      <Text style={styles.consumptionText}>
                        Tiêu thụ: <Text style={styles.consumptionVal}>{waterConsumption} m³</Text>
                        {selectedProperty.avgWaterConsumption && (
                          <Text style={{ color: Colors.textMuted }}> (TB: {selectedProperty.avgWaterConsumption})</Text>
                        )}
                      </Text>
                      {isWaterAbnormal && (
                        <Text style={styles.abnormalWarning}>⚠️ Tiêu thụ tăng bất thường!</Text>
                      )}
                    </View>
                    <Text style={[styles.consumptionCost, isWaterAbnormal && { color: Colors.warning }]}>
                      {fmt(waterCost)}
                    </Text>
                  </View>
                )}
              </View>

              {/* Summary */}
              {(elecConsumption > 0 || waterConsumption > 0) && (
                <View style={styles.summaryCard}>
                  <View style={styles.summaryHeader}>
                    <Text style={styles.summaryTitle}>Dự kiến tách bill</Text>
                    <View style={styles.autoBadge}>
                      <Text style={styles.autoBadgeText}>Tự động</Text>
                    </View>
                  </View>
                  <View style={styles.summaryLine}>
                    <Text style={styles.summaryLabel}>⚡ Tiền điện tổng</Text>
                    <Text style={styles.summaryVal}>{fmt(elecCost)}</Text>
                  </View>
                  <View style={styles.summaryLine}>
                    <Text style={styles.summaryLabel}>💧 Tiền nước tổng</Text>
                    <Text style={styles.summaryVal}>{fmt(waterCost)}</Text>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryLine}>
                    <Text style={styles.grandTotalLabel}>TỔNG CỘNG</Text>
                    <Text style={styles.grandTotalVal}>{fmt(totalUtilityCost)}</Text>
                  </View>
                  <View style={styles.splitBox}>
                    <Text style={styles.splitBoxText}>
                      Chia đều cho <Text style={{ fontWeight: 'bold' }}>{selectedProperty.activeTenants} người</Text>
                    </Text>
                    <Text style={styles.splitResult}>👉 Mỗi người: {fmt(costPerTenant)}</Text>
                    <Text style={styles.splitNote}>
                      Sẽ tự động gộp vào hóa đơn phòng của từng người
                    </Text>
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[styles.submitBtn, (!newElectricity || !newWater) && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!newElectricity || !newWater}
              >
                <Text style={styles.submitBtnText}>🧮 Chốt số & Xuất hóa đơn tự động</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      ) : (
        /* HISTORY TAB */
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>Lịch sử chốt số</Text>
            <Text style={styles.subtitle}>Theo dõi tiêu thụ điện nước</Text>
          </View>

          {/* Property filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}
            contentContainerStyle={{ paddingHorizontal: Spacing.lg, gap: Spacing.sm }}>
            <TouchableOpacity
              style={[styles.filterChip, historyPropertyFilter === 'all' && styles.filterChipActive]}
              onPress={() => setHistoryPropertyFilter('all')}
            >
              <Text style={[styles.filterText, historyPropertyFilter === 'all' && styles.filterTextActive]}>
                Tất cả
              </Text>
            </TouchableOpacity>
            {properties.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[styles.filterChip, historyPropertyFilter === p.id && styles.filterChipActive]}
                onPress={() => setHistoryPropertyFilter(p.id)}
              >
                <Text style={[styles.filterText, historyPropertyFilter === p.id && styles.filterTextActive]}>
                  {p.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={{ paddingHorizontal: Spacing.lg }}>
            {filteredHistory.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={{ fontSize: 40 }}>📊</Text>
                <Text style={styles.emptyText}>Chưa có lịch sử chốt số</Text>
              </View>
            ) : (
              filteredHistory.map(record => (
                <HistoryCard key={record.id} record={record} />
              ))
            )}
          </View>
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Generate Invoice Modal */}
      <Modal visible={showGenerateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>✅ Xác nhận chốt & Xuất bill</Text>
            {pendingRecord && (
              <>
                <View style={styles.modalSection}>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Tòa nhà</Text>
                    <Text style={styles.modalVal}>
                      {properties.find(p => p.id === pendingRecord.propertyId)?.name}
                    </Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>Tháng</Text>
                    <Text style={styles.modalVal}>{String(pendingRecord.month).padStart(2, '0')}/{pendingRecord.year}</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>⚡ Điện ({pendingRecord.elecConsumption} kWh)</Text>
                    <Text style={styles.modalVal}>{fmt(pendingRecord.elecCost)}</Text>
                  </View>
                  <View style={styles.modalRow}>
                    <Text style={styles.modalLabel}>💧 Nước ({pendingRecord.waterConsumption} m³)</Text>
                    <Text style={styles.modalVal}>{fmt(pendingRecord.waterCost)}</Text>
                  </View>
                  <View style={styles.modalDivider} />
                  <View style={styles.modalRow}>
                    <Text style={[styles.modalLabel, { fontWeight: '700' }]}>Tổng tiền chung</Text>
                    <Text style={styles.modalTotal}>{fmt(pendingRecord.totalCost)}</Text>
                  </View>
                  <View style={styles.modalHighlight}>
                    <Text style={styles.modalHighlightText}>
                      Hệ thống sẽ tự động xuất{' '}
                      <Text style={{ fontWeight: '800' }}>{pendingRecord.activeTenants} hóa đơn</Text>
                      {' '}cho {pendingRecord.activeTenants} người ở, mỗi người trả{' '}
                      <Text style={{ fontWeight: '800' }}>{fmt(pendingRecord.costPerTenant)}</Text>
                    </Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirmAndGenerate}>
                  <Text style={styles.confirmBtnText}>🧾 Xác nhận & Xuất hóa đơn</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => { setShowGenerateModal(false); setPendingRecord(null); }}
                >
                  <Text style={styles.cancelBtnText}>Hủy</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },

  // Tabs
  tabBar: {
    flexDirection: 'row', backgroundColor: Colors.white,
    borderBottomWidth: 1, borderColor: Colors.divider,
  },
  tab: {
    flex: 1, paddingVertical: Spacing.base, alignItems: 'center',
    borderBottomWidth: 3, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary },

  header: { paddingTop: Spacing.lg, marginBottom: Spacing.md },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },

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
  progressHint: { fontSize: 12, color: Colors.textSecondary, marginTop: Spacing.xs },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },

  // Property grid
  propertyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginBottom: Spacing.lg },
  propertyCard: {
    width: '47%', backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, alignItems: 'center', borderWidth: 2, borderColor: Colors.border, ...Shadow.sm,
  },
  propertyCardActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  propertyCardDone: { backgroundColor: Colors.successLight, borderColor: Colors.success, opacity: 0.7 },
  propertyEmoji: { fontSize: 28, marginBottom: Spacing.xs },
  propertyName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  propertyMeta: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  propertyPrev: { fontSize: 10, color: Colors.textMuted, marginTop: 4, textAlign: 'center' },

  // Form
  formSection: { marginTop: Spacing.sm },
  meterCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.md,
  },
  meterHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  meterEmoji: { fontSize: 22, marginRight: Spacing.sm },
  meterTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  unitPrice: { fontSize: 12, color: Colors.textMuted },
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
  meterInputWarning: { borderColor: Colors.warning, backgroundColor: Colors.warningLight },
  consumptionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: Spacing.md, backgroundColor: Colors.primaryBg,
    padding: Spacing.sm, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md,
  },
  consumptionText: { fontSize: 13, color: Colors.textSecondary },
  consumptionVal: { fontWeight: '700', color: Colors.primary },
  consumptionCost: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  abnormalWarning: { fontSize: 11, color: Colors.warning, fontWeight: '700', marginTop: 2 },

  // Summary
  summaryCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.lg, ...Shadow.md,
    borderWidth: 1.5, borderColor: Colors.primary,
  },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  summaryTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  autoBadge: { backgroundColor: Colors.primaryBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  autoBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  summaryLabel: { fontSize: 14, color: Colors.textSecondary },
  summaryVal: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  summaryDivider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.md },
  grandTotalLabel: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  grandTotalVal: { fontSize: 22, fontWeight: '800', color: Colors.primary },
  splitBox: {
    backgroundColor: '#F8FAFC', borderRadius: BorderRadius.md,
    padding: Spacing.md, marginTop: Spacing.md, borderLeftWidth: 4, borderLeftColor: Colors.primary,
  },
  splitBoxText: { fontSize: 13, color: Colors.textSecondary, marginBottom: 4 },
  splitResult: { fontSize: 16, fontWeight: '800', color: Colors.primary },
  splitNote: { fontSize: 11, color: Colors.textMuted, marginTop: 4, fontStyle: 'italic' },

  submitBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', ...Shadow.md, marginBottom: Spacing.lg,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },

  // History filter
  filterRow: { marginBottom: Spacing.md, maxHeight: 50 },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },

  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing.md },
  emptyText: { fontSize: 14, color: Colors.textSecondary },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl, padding: Spacing.xl, paddingBottom: 40,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.lg },
  modalSection: { marginBottom: Spacing.lg },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  modalLabel: { fontSize: 14, color: Colors.textSecondary },
  modalVal: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  modalDivider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.md },
  modalTotal: { fontSize: 20, fontWeight: '800', color: Colors.primary },
  modalHighlight: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginTop: Spacing.sm,
  },
  modalHighlightText: { fontSize: 14, color: Colors.textPrimary, lineHeight: 22 },
  confirmBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', marginBottom: Spacing.md, ...Shadow.md,
  },
  confirmBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  cancelBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
});
