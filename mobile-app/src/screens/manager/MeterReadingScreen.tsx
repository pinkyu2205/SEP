import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Platform, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { billsStore, SharedBill } from '../../store/billsStore';

// ===================== TYPES =====================
type PropertyType = 'multi_room' | 'single_unit';
type WaterBillingType = 'per_meter' | 'flat_rate';
type TabType = 'record' | 'history';
type RoomStatus = 'unrecorded' | 'draft' | 'missing_photo' | 'ready' | 'submitted';

interface RoomData {
  id: string;
  code: string;
  floor: number;
  tenantName?: string;
  occupants: number;
  prevElec: number;
  prevWater?: number;
  avgElecConsumption?: number;
  rentAmount: number;
}

interface PropertyData {
  id: string;
  name: string;
  address: string;
  type: PropertyType;
  electricityRate: number;
  waterBillingType: WaterBillingType;
  flatWaterRate?: number;
  waterRate?: number;
  serviceCharge?: number;
  isRecorded: boolean;
  rooms?: RoomData[];
  activeTenants?: number;
  prevElec?: number;
  prevWater?: number;
  rentAmount?: number;
}

interface RoomSummary {
  code: string;
  tenantName?: string;
  occupants: number;
  elecConsumption: number;
  elecCost: number;
  waterCost: number;
  totalCost: number;
  hasPhotos: boolean;
}

interface HistoryRecord {
  id: string;
  propertyId: string;
  propertyName: string;
  propertyType: PropertyType;
  waterBillingType: WaterBillingType;
  month: number;
  year: number;
  totalElecConsumption: number;
  totalWaterConsumption?: number;
  totalElecCost: number;
  totalWaterCost: number;
  totalCost: number;
  roomSummaries?: RoomSummary[];
  recordedAt: string;
  invoicesGenerated: boolean;
  hasPhotos?: boolean;
}

// ===================== CONSTANTS =====================
const CURRENT_MONTH: number = 5;
const CURRENT_YEAR: number = 2026;
const ABNORMAL_THRESHOLD = 1.5;
const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

const STATUS_CONFIG: Record<RoomStatus, { label: string; bg: string; color: string }> = {
  unrecorded:    { label: 'Chưa ghi',   bg: '#F3F4F6', color: '#9CA3AF' },
  draft:         { label: 'Đang nhập',  bg: '#FEF3C7', color: '#D97706' },
  missing_photo: { label: 'Thiếu ảnh', bg: '#FEE2E2', color: '#EF4444' },
  ready:         { label: 'Sẵn sàng',  bg: Colors.successLight, color: Colors.success },
  submitted:     { label: 'Đã gửi',    bg: Colors.successLight, color: Colors.success },
};

// ===================== MOCK DATA =====================
const INITIAL_PROPERTIES: PropertyData[] = [
  {
    id: 'p1', name: 'Nhà Nguyễn Trãi', address: '123 Nguyễn Trãi, Quận 5, TP.HCM',
    type: 'multi_room', electricityRate: 3500, waterBillingType: 'flat_rate',
    flatWaterRate: 100000, serviceCharge: 100000, isRecorded: false,
    rooms: [
      { id: 'r1', code: 'P101', floor: 1, tenantName: 'Trần Văn An',    occupants: 1, prevElec: 1250, avgElecConsumption: 85,  rentAmount: 3000000 },
      { id: 'r2', code: 'P102', floor: 1, tenantName: 'Lê Thị Bình',    occupants: 2, prevElec: 2840, avgElecConsumption: 120, rentAmount: 3500000 },
      { id: 'r3', code: 'P103', floor: 1, tenantName: 'Phạm Văn Cường', occupants: 1, prevElec: 980,  avgElecConsumption: 75,  rentAmount: 3000000 },
      { id: 'r4', code: 'P201', floor: 2, tenantName: 'Hoàng Văn Dũng', occupants: 2, prevElec: 3120, avgElecConsumption: 130, rentAmount: 4000000 },
      { id: 'r5', code: 'P202', floor: 2, tenantName: 'Trần Thị Emi',   occupants: 1, prevElec: 1560, avgElecConsumption: 90,  rentAmount: 3500000 },
    ],
  },
  {
    id: 'p2', name: 'Nhà Lê Văn Sỹ', address: '456 Lê Văn Sỹ, Quận 3, TP.HCM',
    type: 'multi_room', electricityRate: 3800, waterBillingType: 'per_meter',
    waterRate: 16000, serviceCharge: 100000, isRecorded: false,
    rooms: [
      { id: 'r6', code: 'P101', floor: 1, tenantName: 'Nguyễn Bảo Gia', occupants: 1, prevElec: 740,  prevWater: 12, avgElecConsumption: 70,  rentAmount: 3500000 },
      { id: 'r7', code: 'P102', floor: 1, tenantName: 'Vũ Minh Phương', occupants: 2, prevElec: 1890, prevWater: 28, avgElecConsumption: 110, rentAmount: 4000000 },
      { id: 'r8', code: 'P201', floor: 2, tenantName: 'Đỗ Hương Giang', occupants: 1, prevElec: 620,  prevWater: 9,  avgElecConsumption: 65,  rentAmount: 3800000 },
    ],
  },
  {
    id: 'p3', name: 'Villa Thảo Điền', address: '78 Xuân Thủy, Thảo Điền, TP.HCM',
    type: 'single_unit', electricityRate: 3500, waterBillingType: 'per_meter',
    waterRate: 15000, serviceCharge: 200000, rentAmount: 15000000,
    activeTenants: 4, prevElec: 8540, prevWater: 142, isRecorded: true,
  },
];

const INITIAL_HISTORY: HistoryRecord[] = [
  {
    id: 'h1', propertyId: 'p3', propertyName: 'Villa Thảo Điền', propertyType: 'single_unit',
    waterBillingType: 'per_meter', month: 5, year: 2026,
    totalElecConsumption: 380, totalWaterConsumption: 25,
    totalElecCost: 380 * 3500, totalWaterCost: 25 * 15000,
    totalCost: 380 * 3500 + 25 * 15000,
    recordedAt: '2026-05-01', invoicesGenerated: true, hasPhotos: true,
  },
  {
    id: 'h2', propertyId: 'p1', propertyName: 'Nhà Nguyễn Trãi', propertyType: 'multi_room',
    waterBillingType: 'flat_rate', month: 4, year: 2026,
    totalElecConsumption: 490,
    totalElecCost: 490 * 3500, totalWaterCost: 7 * 100000,
    totalCost: 490 * 3500 + 7 * 100000,
    hasPhotos: true,
    roomSummaries: [
      { code: 'P101', tenantName: 'Trần Văn An',    occupants: 1, elecConsumption: 88,  elecCost: 88  * 3500, waterCost: 100000, totalCost: 88  * 3500 + 100000, hasPhotos: true },
      { code: 'P102', tenantName: 'Lê Thị Bình',    occupants: 2, elecConsumption: 125, elecCost: 125 * 3500, waterCost: 200000, totalCost: 125 * 3500 + 200000, hasPhotos: true },
      { code: 'P103', tenantName: 'Phạm Văn Cường', occupants: 1, elecConsumption: 72,  elecCost: 72  * 3500, waterCost: 100000, totalCost: 72  * 3500 + 100000, hasPhotos: true },
      { code: 'P201', tenantName: 'Hoàng Văn Dũng', occupants: 2, elecConsumption: 135, elecCost: 135 * 3500, waterCost: 200000, totalCost: 135 * 3500 + 200000, hasPhotos: true },
      { code: 'P202', tenantName: 'Trần Thị Emi',   occupants: 1, elecConsumption: 70,  elecCost: 70  * 3500, waterCost: 100000, totalCost: 70  * 3500 + 100000, hasPhotos: true },
    ],
    recordedAt: '2026-04-30', invoicesGenerated: true,
  },
  {
    id: 'h3', propertyId: 'p2', propertyName: 'Nhà Lê Văn Sỹ', propertyType: 'multi_room',
    waterBillingType: 'per_meter', month: 4, year: 2026,
    totalElecConsumption: 245, totalWaterConsumption: 49,
    totalElecCost: 245 * 3800, totalWaterCost: 49 * 16000,
    totalCost: 245 * 3800 + 49 * 16000, hasPhotos: false,
    roomSummaries: [
      { code: 'P101', tenantName: 'Nguyễn Bảo Gia', occupants: 1, elecConsumption: 68,  elecCost: 68  * 3800, waterCost: 12 * 16000, totalCost: 68  * 3800 + 12 * 16000, hasPhotos: false },
      { code: 'P102', tenantName: 'Vũ Minh Phương', occupants: 2, elecConsumption: 112, elecCost: 112 * 3800, waterCost: 27 * 16000, totalCost: 112 * 3800 + 27 * 16000, hasPhotos: false },
      { code: 'P201', tenantName: 'Đỗ Hương Giang', occupants: 1, elecConsumption: 65,  elecCost: 65  * 3800, waterCost: 10 * 16000, totalCost: 65  * 3800 + 10 * 16000, hasPhotos: false },
    ],
    recordedAt: '2026-04-30', invoicesGenerated: true,
  },
];

// ===================== PHOTO CAPTURE ROW =====================
const PhotoCaptureRow: React.FC<{
  label: string;
  hasPhoto: boolean;
  onCapture: () => void;
}> = ({ label, hasPhoto, onCapture }) => (
  <View style={photoSt.wrap}>
    {hasPhoto ? (
      <View style={photoSt.captured}>
        <View style={photoSt.capturedLeft}>
          <View style={photoSt.photoThumb}>
            <Text style={{ fontSize: 20 }}>📷</Text>
          </View>
          <View>
            <Text style={photoSt.capturedText}>Ảnh đã chụp</Text>
            <Text style={photoSt.capturedSub}>Ảnh minh chứng đã lưu</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onCapture} style={photoSt.retakeBtn}>
          <Text style={photoSt.retakeText}>Chụp lại</Text>
        </TouchableOpacity>
      </View>
    ) : (
      <TouchableOpacity style={photoSt.captureBtn} onPress={onCapture} activeOpacity={0.75}>
        <Text style={photoSt.captureBtnIcon}>📷</Text>
        <Text style={photoSt.captureBtnText}>{label}</Text>
        <Text style={photoSt.required}>*</Text>
      </TouchableOpacity>
    )}
  </View>
);

const photoSt = StyleSheet.create({
  wrap: { marginTop: Spacing.sm },
  captureBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: BorderRadius.md,
    padding: Spacing.sm, backgroundColor: Colors.primaryBg,
  },
  captureBtnIcon: { fontSize: 18 },
  captureBtnText: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.primary },
  required: { fontSize: 14, color: Colors.error, fontWeight: '800' },
  captured: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.successLight, borderRadius: BorderRadius.md,
    padding: Spacing.sm, borderWidth: 1, borderColor: Colors.success + '40',
  },
  capturedLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  photoThumb: {
    width: 44, height: 44, borderRadius: BorderRadius.md,
    backgroundColor: Colors.success + '20', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: Colors.success + '40',
  },
  capturedText: { fontSize: 12, fontWeight: '700', color: Colors.success },
  capturedSub: { fontSize: 10, color: Colors.success, opacity: 0.75, marginTop: 1 },
  retakeBtn: {
    paddingHorizontal: 10, paddingVertical: 5, backgroundColor: Colors.white,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.success + '60',
  },
  retakeText: { fontSize: 11, fontWeight: '600', color: Colors.success },
});

// ===================== HISTORY CARD =====================
const HistoryCard: React.FC<{ record: HistoryRecord }> = ({ record }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={hStyles.card}>
      <TouchableOpacity onPress={() => setExpanded(v => !v)} activeOpacity={0.8}>
        <View style={hStyles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={hStyles.monthLabel}>Tháng {String(record.month).padStart(2, '0')}/{record.year}</Text>
            <Text style={hStyles.propertyName}>{record.propertyName}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <View style={[hStyles.typeBadge, record.propertyType === 'single_unit' && hStyles.typeBadgeSingle]}>
              <Text style={hStyles.typeBadgeText}>
                {record.propertyType === 'multi_room' ? '🏢 Nhiều phòng' : '🏠 Nguyên căn'}
              </Text>
            </View>
            <View style={[hStyles.badge, { backgroundColor: record.invoicesGenerated ? Colors.successLight : Colors.warningLight }]}>
              <Text style={[hStyles.badgeText, { color: record.invoicesGenerated ? Colors.success : Colors.warning }]}>
                {record.invoicesGenerated ? '✓ Đã tạo hóa đơn' : '⏳ Chưa tạo'}
              </Text>
            </View>
            {record.hasPhotos && (
              <View style={hStyles.photoBadge}>
                <Text style={hStyles.photoBadgeText}>📷 Có ảnh minh chứng</Text>
              </View>
            )}
          </View>
        </View>

        <View style={hStyles.metersRow}>
          <View style={hStyles.meterItem}>
            <Text style={hStyles.meterLabel}>⚡ Điện tiêu thụ</Text>
            <Text style={hStyles.meterValues}>{record.totalElecConsumption} kWh</Text>
            <Text style={hStyles.consumption}>{fmt(record.totalElecCost)}</Text>
          </View>
          <View style={hStyles.meterDivider} />
          <View style={hStyles.meterItem}>
            <Text style={hStyles.meterLabel}>
              {record.waterBillingType === 'flat_rate' ? '💧 Nước (cố định/người)' : '💧 Nước tiêu thụ'}
            </Text>
            {record.totalWaterConsumption != null
              ? <Text style={hStyles.meterValues}>{record.totalWaterConsumption} m³</Text>
              : <Text style={hStyles.meterValues}>—</Text>}
            <Text style={hStyles.consumption}>{fmt(record.totalWaterCost)}</Text>
          </View>
        </View>

        <View style={hStyles.cardFooter}>
          <Text style={hStyles.footerLabel}>
            Tổng: <Text style={hStyles.footerTotal}>{fmt(record.totalCost)}</Text>
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={hStyles.footerDate}>{record.recordedAt}</Text>
            {record.roomSummaries && (
              <Text style={{ fontSize: 12, color: Colors.primary }}>{expanded ? '▲' : '▼'}</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>

      {/* Expanded: room breakdown + photos */}
      {expanded && record.roomSummaries && (
        <View style={hStyles.roomBreakdown}>
          <Text style={hStyles.breakdownTitle}>Chi tiết từng phòng</Text>
          {record.roomSummaries.map((r, i) => (
            <View key={i} style={hStyles.breakdownRow}>
              <Text style={hStyles.breakdownCode}>{r.code}</Text>
              <Text style={hStyles.breakdownTenant} numberOfLines={1}>{r.tenantName}</Text>
              <Text style={hStyles.breakdownElec}>⚡ {r.elecConsumption} kWh</Text>
              {r.hasPhotos && (
                <TouchableOpacity
                  onPress={() => Alert.alert('📷 Ảnh đồng hồ', `Phòng ${r.code} — Ảnh đã được lưu trữ.\n\n⚡ Ảnh đồng hồ điện: đã chụp\n${record.waterBillingType === 'per_meter' ? '💧 Ảnh đồng hồ nước: đã chụp' : '💧 Nước cố định: không cần ảnh'}`)}
                  style={hStyles.viewPhotoBtn}
                >
                  <Text style={hStyles.viewPhotoBtnText}>📷</Text>
                </TouchableOpacity>
              )}
              <Text style={hStyles.breakdownTotal}>{fmt(r.totalCost)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Expanded: photo evidence for single_unit */}
      {expanded && !record.roomSummaries && record.hasPhotos && (
        <View style={hStyles.photoSection}>
          <Text style={hStyles.breakdownTitle}>Ảnh minh chứng đồng hồ</Text>
          <View style={hStyles.photoGrid}>
            <TouchableOpacity
              style={hStyles.photoPlaceholder}
              onPress={() => Alert.alert('📷 Ảnh đồng hồ điện', 'Ảnh đồng hồ điện đã được lưu trữ.')}
            >
              <Text style={{ fontSize: 28 }}>⚡</Text>
              <Text style={hStyles.photoPlaceholderLabel}>Đồng hồ điện</Text>
              <Text style={hStyles.photoPlaceholderSub}>Nhấn để xem</Text>
            </TouchableOpacity>
            {record.waterBillingType === 'per_meter' && (
              <TouchableOpacity
                style={hStyles.photoPlaceholder}
                onPress={() => Alert.alert('📷 Ảnh đồng hồ nước', 'Ảnh đồng hồ nước đã được lưu trữ.')}
              >
                <Text style={{ fontSize: 28 }}>💧</Text>
                <Text style={hStyles.photoPlaceholderLabel}>Đồng hồ nước</Text>
                <Text style={hStyles.photoPlaceholderSub}>Nhấn để xem</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const hStyles = StyleSheet.create({
  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  monthLabel: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  propertyName: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  typeBadge: { backgroundColor: Colors.primaryBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.full },
  typeBadgeSingle: { backgroundColor: '#FEF3C7' },
  typeBadgeText: { fontSize: 10, fontWeight: '600', color: Colors.primary },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  badgeText: { fontSize: 11, fontWeight: '600' },
  photoBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: '#BFDBFE' },
  photoBadgeText: { fontSize: 10, fontWeight: '600', color: '#3B82F6' },
  metersRow: { flexDirection: 'row', marginBottom: Spacing.md },
  meterItem: { flex: 1 },
  meterDivider: { width: 1, backgroundColor: Colors.divider, marginHorizontal: Spacing.sm },
  meterLabel: { fontSize: 11, fontWeight: '600', color: Colors.textSecondary, marginBottom: 2 },
  meterValues: { fontSize: 13, color: Colors.textPrimary, fontWeight: '600' },
  consumption: { fontSize: 12, color: Colors.primary, marginTop: 2 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderColor: Colors.divider, paddingTop: Spacing.sm },
  footerLabel: { fontSize: 12, color: Colors.textSecondary },
  footerTotal: { fontWeight: '700', color: Colors.textPrimary },
  footerDate: { fontSize: 11, color: Colors.textMuted },
  roomBreakdown: { marginTop: Spacing.md, backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.sm },
  breakdownTitle: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: 6 },
  breakdownCode: { fontSize: 12, fontWeight: '700', color: Colors.primary, width: 36 },
  breakdownTenant: { flex: 1, fontSize: 11, color: Colors.textSecondary },
  breakdownElec: { fontSize: 11, color: Colors.textMuted },
  breakdownTotal: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary, minWidth: 70, textAlign: 'right' },
  viewPhotoBtn: { backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  viewPhotoBtnText: { fontSize: 12 },
  photoSection: { marginTop: Spacing.md, backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.sm },
  photoGrid: { flexDirection: 'row', gap: Spacing.sm },
  photoPlaceholder: {
    flex: 1, backgroundColor: Colors.white, borderRadius: BorderRadius.md,
    padding: Spacing.md, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  photoPlaceholderLabel: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  photoPlaceholderSub: { fontSize: 10, color: Colors.primary },
});

// ===================== ROOM METER CARD =====================
const RoomMeterCard: React.FC<{
  room: RoomData;
  electricityRate: number;
  waterBillingType: WaterBillingType;
  flatWaterRate?: number;
  waterRate?: number;
  elecInput: string;
  waterInput: string;
  onElecChange: (v: string) => void;
  onWaterChange: (v: string) => void;
  elecPhoto: boolean;
  waterPhoto: boolean;
  onElecPhoto: () => void;
  onWaterPhoto: () => void;
  isSubmitted?: boolean;
  submittedSummary?: RoomSummary;
  onSubmit?: () => void;
}> = ({
  room, electricityRate, waterBillingType, flatWaterRate, waterRate,
  elecInput, waterInput, onElecChange, onWaterChange,
  elecPhoto, waterPhoto, onElecPhoto, onWaterPhoto,
  isSubmitted, submittedSummary, onSubmit,
}) => {

  // Status
  const getStatus = (): RoomStatus => {
    if (isSubmitted) return 'submitted';
    const hasElec = elecInput.trim() !== '';
    const hasWater = waterBillingType === 'flat_rate' || waterInput.trim() !== '';
    const hasElecPhoto = elecPhoto;
    const hasWaterPhoto = waterBillingType === 'flat_rate' || waterPhoto;
    if (hasElec && hasWater && hasElecPhoto && hasWaterPhoto) return 'ready';
    if ((hasElec || hasWater) && (!hasElecPhoto || (waterBillingType === 'per_meter' && !hasWaterPhoto))) return 'missing_photo';
    if (hasElec || hasWater) return 'draft';
    return 'unrecorded';
  };
  const status = getStatus();
  const statusCfg = STATUS_CONFIG[status];

  // Submitted view
  if (isSubmitted && submittedSummary) {
    return (
      <View style={[rStyles.card, rStyles.cardSubmitted]}>
        <View style={rStyles.roomHeader}>
          <View style={rStyles.roomLeft}>
            <View style={rStyles.roomCodeBadge}><Text style={rStyles.roomCode}>🚪 {room.code}</Text></View>
            <Text style={rStyles.roomTenant}>{room.tenantName ?? 'Phòng trống'}</Text>
          </View>
          <View style={rStyles.roomRight}>
            <Text style={rStyles.occupants}>👤 {room.occupants} người</Text>
            <Text style={rStyles.floorText}>Tầng {room.floor}</Text>
          </View>
          <View style={[rStyles.statusBadge, { backgroundColor: statusCfg.bg }]}>
            <Text style={[rStyles.statusBadgeText, { color: statusCfg.color }]}>✅ {statusCfg.label}</Text>
          </View>
        </View>
        <View style={rStyles.submittedBody}>
          <Text style={rStyles.submittedDetail}>⚡ {submittedSummary.elecConsumption} kWh · {fmt(submittedSummary.elecCost)}</Text>
          <Text style={rStyles.submittedDetail}>💧 Nước · {fmt(submittedSummary.waterCost)}</Text>
          {submittedSummary.hasPhotos && <Text style={rStyles.submittedDetail}>📷 Ảnh đồng hồ đã lưu</Text>}
          <Text style={rStyles.submittedTotal}>Tổng: {fmt(submittedSummary.totalCost)}</Text>
        </View>
      </View>
    );
  }

  const elecVal = parseInt(elecInput, 10);
  const elecTooLow = !isNaN(elecVal) && elecVal < room.prevElec;
  const elecConsumption = !isNaN(elecVal) && elecVal >= room.prevElec ? elecVal - room.prevElec : 0;
  const elecCost = elecConsumption * electricityRate;
  const isAbnormal = room.avgElecConsumption ? elecConsumption > room.avgElecConsumption * ABNORMAL_THRESHOLD : false;

  const waterVal = parseInt(waterInput, 10);
  const waterTooLow = waterBillingType === 'per_meter' && !isNaN(waterVal) && room.prevWater != null && waterVal < room.prevWater;
  const waterConsumption = waterBillingType === 'per_meter' && !isNaN(waterVal) && room.prevWater != null && waterVal >= room.prevWater
    ? waterVal - room.prevWater : 0;
  const flatWaterCost = waterBillingType === 'flat_rate' ? (flatWaterRate ?? 0) * room.occupants : 0;
  const waterCost = waterBillingType === 'per_meter' ? waterConsumption * (waterRate ?? 0) : flatWaterCost;

  const isDone = status === 'ready';

  return (
    <View style={[rStyles.card, isDone && rStyles.cardDone, status === 'missing_photo' && rStyles.cardMissingPhoto]}>
      {/* Header */}
      <View style={rStyles.roomHeader}>
        <View style={rStyles.roomLeft}>
          <View style={rStyles.roomCodeBadge}><Text style={rStyles.roomCode}>🚪 {room.code}</Text></View>
          <Text style={rStyles.roomTenant}>{room.tenantName ?? 'Phòng trống'}</Text>
        </View>
        <View style={rStyles.roomRight}>
          <Text style={rStyles.occupants}>👤 {room.occupants} người</Text>
          <Text style={rStyles.floorText}>Tầng {room.floor}</Text>
        </View>
        <View style={[rStyles.statusBadge, { backgroundColor: statusCfg.bg }]}>
          <Text style={[rStyles.statusBadgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
        </View>
      </View>

      {/* Electricity */}
      <View style={rStyles.meterSection}>
        <View style={rStyles.meterSectionHeader}>
          <Text style={rStyles.meterSectionLabel}>⚡ Điện</Text>
          <Text style={rStyles.meterRate}>{electricityRate.toLocaleString('vi-VN')}đ/kWh</Text>
        </View>
        <View style={rStyles.inputRow}>
          <View style={rStyles.prevBox}>
            <Text style={rStyles.prevLabel}>Tháng trước</Text>
            <Text style={rStyles.prevValue}>{room.prevElec}</Text>
          </View>
          <Text style={rStyles.arrow}>→</Text>
          <View style={{ flex: 1 }}>
            <Text style={rStyles.prevLabel}>Hiện tại *</Text>
            <TextInput
              style={[rStyles.input, (isAbnormal || elecTooLow) && rStyles.inputWarning]}
              value={elecInput}
              onChangeText={onElecChange}
              keyboardType="numeric"
              placeholder="Nhập số..."
              placeholderTextColor={Colors.textMuted}
            />
          </View>
        </View>
        {elecTooLow && (
          <Text style={rStyles.warnText}>⚠️ Chỉ số hiện tại thấp hơn tháng trước, vui lòng kiểm tra lại.</Text>
        )}
        {elecConsumption > 0 && (
          <View style={[rStyles.resultRow, isAbnormal && { backgroundColor: Colors.warningLight }]}>
            <Text style={rStyles.resultText}>
              Tiêu thụ: <Text style={rStyles.resultBold}>{elecConsumption} kWh</Text>
              {room.avgElecConsumption ? <Text style={{ color: Colors.textMuted }}> (TB: {room.avgElecConsumption})</Text> : null}
            </Text>
            <Text style={[rStyles.resultCost, isAbnormal && { color: Colors.warning }]}>{fmt(elecCost)}</Text>
          </View>
        )}
        {isAbnormal && <Text style={rStyles.warnText}>⚠️ Lượng điện tăng bất thường! Vui lòng xác nhận lại.</Text>}

        {/* Electric photo */}
        <PhotoCaptureRow
          label="Chụp đồng hồ điện"
          hasPhoto={elecPhoto}
          onCapture={onElecPhoto}
        />
      </View>

      {/* Water */}
      <View style={[rStyles.meterSection, { borderTopWidth: 1, borderTopColor: Colors.divider }]}>
        {waterBillingType === 'flat_rate' ? (
          <>
            <View style={rStyles.flatWaterRow}>
              <Text style={rStyles.meterSectionLabel}>💧 Nước</Text>
              <View style={rStyles.flatWaterBadge}>
                <Text style={rStyles.flatWaterText}>
                  Cố định: {room.occupants} người × {(flatWaterRate ?? 0).toLocaleString('vi-VN')}đ = <Text style={{ fontWeight: '800' }}>{fmt(flatWaterCost)}</Text>
                </Text>
              </View>
            </View>
            <View style={rStyles.flatWaterPhotoNote}>
              <Text style={rStyles.flatWaterPhotoNoteText}>💡 Nước tính cố định, không cần chụp đồng hồ nước.</Text>
            </View>
          </>
        ) : (
          <>
            <View style={rStyles.meterSectionHeader}>
              <Text style={rStyles.meterSectionLabel}>💧 Nước</Text>
              <Text style={rStyles.meterRate}>{(waterRate ?? 0).toLocaleString('vi-VN')}đ/m³</Text>
            </View>
            <View style={rStyles.inputRow}>
              <View style={rStyles.prevBox}>
                <Text style={rStyles.prevLabel}>Tháng trước</Text>
                <Text style={rStyles.prevValue}>{room.prevWater ?? '—'}</Text>
              </View>
              <Text style={rStyles.arrow}>→</Text>
              <View style={{ flex: 1 }}>
                <Text style={rStyles.prevLabel}>Hiện tại *</Text>
                <TextInput
                  style={[rStyles.input, waterTooLow && rStyles.inputWarning]}
                  value={waterInput}
                  onChangeText={onWaterChange}
                  keyboardType="numeric"
                  placeholder="Nhập số..."
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            </View>
            {waterTooLow && (
              <Text style={rStyles.warnText}>⚠️ Chỉ số nước thấp hơn tháng trước, vui lòng kiểm tra lại.</Text>
            )}
            {waterConsumption > 0 && (
              <View style={rStyles.resultRow}>
                <Text style={rStyles.resultText}>Tiêu thụ: <Text style={rStyles.resultBold}>{waterConsumption} m³</Text></Text>
                <Text style={rStyles.resultCost}>{fmt(waterCost)}</Text>
              </View>
            )}
            {/* Water photo */}
            <PhotoCaptureRow
              label="Chụp đồng hồ nước"
              hasPhoto={waterPhoto}
              onCapture={onWaterPhoto}
            />
          </>
        )}
      </View>

      {/* Room total */}
      {elecConsumption > 0 && (
        <View style={rStyles.roomTotal}>
          <Text style={rStyles.roomTotalLabel}>Tổng phòng này tháng {CURRENT_MONTH}</Text>
          <Text style={rStyles.roomTotalValue}>{fmt(elecCost + waterCost)}</Text>
        </View>
      )}

      {/* Validation hint */}
      {status === 'missing_photo' && (
        <View style={rStyles.missingPhotoHint}>
          <Text style={rStyles.missingPhotoHintText}>📷 Vui lòng chụp ảnh đồng hồ để hoàn tất ghi chỉ số.</Text>
        </View>
      )}

      {/* Submit button */}
      {isDone && onSubmit && (
        <TouchableOpacity style={rStyles.submitRoomBtn} onPress={onSubmit} activeOpacity={0.8}>
          <Text style={rStyles.submitRoomBtnText}>✅ Gửi chỉ số phòng {room.code} →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const rStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md, ...Shadow.sm, overflow: 'hidden',
    borderWidth: 1.5, borderColor: Colors.border,
  },
  cardDone: { borderColor: Colors.success },
  cardMissingPhoto: { borderColor: '#EF4444' },
  roomHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: Spacing.base, backgroundColor: Colors.background,
    borderBottomWidth: 1, borderBottomColor: Colors.divider, gap: Spacing.sm,
  },
  roomLeft: { flex: 1, gap: 3 },
  roomCodeBadge: { alignSelf: 'flex-start', backgroundColor: Colors.primaryBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.full },
  roomCode: { fontSize: 13, fontWeight: '800', color: Colors.primary },
  roomTenant: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  roomRight: { alignItems: 'flex-end', gap: 2 },
  occupants: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  floorText: { fontSize: 11, color: Colors.textMuted },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  meterSection: { padding: Spacing.base, paddingBottom: Spacing.sm },
  meterSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  meterSectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  meterRate: { fontSize: 11, color: Colors.textMuted },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm },
  prevBox: {
    flex: 1, backgroundColor: Colors.divider, borderRadius: BorderRadius.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8, paddingHorizontal: Spacing.md,
  },
  prevLabel: { fontSize: 10, color: Colors.textMuted, marginBottom: 2 },
  prevValue: { fontSize: 16, fontWeight: '700', color: Colors.textMuted },
  arrow: { fontSize: 18, color: Colors.textMuted, paddingBottom: 8 },
  input: {
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8, paddingHorizontal: Spacing.md,
    fontSize: 16, fontWeight: '700', color: Colors.textPrimary, backgroundColor: Colors.primaryBg,
  },
  inputWarning: { borderColor: Colors.warning, backgroundColor: Colors.warningLight },
  warnText: { fontSize: 11, color: Colors.warning, fontWeight: '700', marginTop: 4 },
  resultRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: Spacing.sm, backgroundColor: Colors.primaryBg,
    padding: Spacing.sm, borderRadius: BorderRadius.sm,
  },
  resultText: { fontSize: 12, color: Colors.textSecondary },
  resultBold: { fontWeight: '700', color: Colors.primary },
  resultCost: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  flatWaterRow: { gap: Spacing.sm },
  flatWaterBadge: { backgroundColor: '#FFFBEB', borderRadius: BorderRadius.md, padding: Spacing.sm, borderWidth: 1, borderColor: '#FDE68A' },
  flatWaterText: { fontSize: 12, color: '#92400E' },
  flatWaterPhotoNote: { marginTop: Spacing.sm, backgroundColor: '#F0FDF4', borderRadius: BorderRadius.md, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.success + '30' },
  flatWaterPhotoNoteText: { fontSize: 11, color: Colors.success, fontWeight: '500' },
  missingPhotoHint: { marginHorizontal: Spacing.base, marginBottom: Spacing.sm, backgroundColor: '#FEF2F2', borderRadius: BorderRadius.md, padding: Spacing.sm, borderWidth: 1, borderColor: '#FECACA' },
  missingPhotoHintText: { fontSize: 12, color: '#EF4444', fontWeight: '600' },
  roomTotal: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.base, backgroundColor: Colors.primaryBg,
    borderTopWidth: 1, borderTopColor: Colors.primary + '30',
  },
  roomTotalLabel: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  roomTotalValue: { fontSize: 16, fontWeight: '800', color: Colors.primary },
  submitRoomBtn: {
    backgroundColor: Colors.primary, margin: Spacing.base, marginTop: 0,
    borderRadius: BorderRadius.md, paddingVertical: Spacing.md, alignItems: 'center',
  },
  submitRoomBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  cardSubmitted: { borderColor: Colors.success, opacity: 0.9 },
  submittedBadge: { backgroundColor: Colors.successLight, paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full, marginLeft: 4 },
  submittedBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.success },
  submittedBody: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, backgroundColor: Colors.background },
  submittedDetail: { fontSize: 12, color: Colors.textSecondary, flex: 1, minWidth: '45%' },
  submittedTotal: { fontSize: 13, fontWeight: '700', color: Colors.success, width: '100%' },
});

// ===================== MAIN COMPONENT =====================
export const MeterReadingScreen: React.FC = () => {
  const [tab, setTab] = useState<TabType>('record');
  const [properties, setProperties] = useState<PropertyData[]>(INITIAL_PROPERTIES);
  const [history, setHistory] = useState<HistoryRecord[]>(INITIAL_HISTORY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState('all');

  const [roomInputs, setRoomInputs] = useState<Record<string, { elec: string; water: string }>>({});
  const [roomPhotos, setRoomPhotos] = useState<Record<string, { elec?: boolean; water?: boolean }>>({});
  const [submittedRooms, setSubmittedRooms] = useState<Record<string, RoomSummary>>({});
  const [singleInputs, setSingleInputs] = useState({ elec: '', water: '' });
  const [singlePhotos, setSinglePhotos] = useState<{ elec?: boolean; water?: boolean }>({});
  const [showModal, setShowModal] = useState(false);

  const selectedProp = properties.find(p => p.id === selectedId);

  const totalRecorded = properties.filter(p => p.isRecorded).length;
  const totalRoomsAll = properties.reduce((s, p) => s + (p.type === 'multi_room' ? (p.rooms?.length ?? 0) : 1), 0);
  const completedRoomsAll = properties.filter(p => p.isRecorded).reduce((s, p) => s + (p.type === 'multi_room' ? (p.rooms?.length ?? 0) : 1), 0);

  const handleSelectProperty = (prop: PropertyData) => {
    if (prop.isRecorded) return;
    if (selectedId === prop.id) { setSelectedId(null); return; }
    setSelectedId(prop.id);
    setRoomInputs({});
    setRoomPhotos({});
    setSubmittedRooms({});
    setSingleInputs({ elec: '', water: '' });
    setSinglePhotos({});
  };

  const setRoomInput = (roomId: string, field: 'elec' | 'water', value: string) => {
    setRoomInputs(prev => ({
      ...prev,
      [roomId]: { ...(prev[roomId] ?? { elec: '', water: '' }), [field]: value },
    }));
  };

  // Photo capture handlers
  const processRoomCapture = (room: RoomData, type: 'elec' | 'water') => {
    setRoomPhotos(prev => ({
      ...prev,
      [room.id]: { ...(prev[room.id] ?? {}), [type]: true },
    }));
    const currentInput = (type === 'elec' ? roomInputs[room.id]?.elec : roomInputs[room.id]?.water) ?? '';
    if (currentInput.trim() === '') {
      const prevVal = type === 'elec' ? room.prevElec : (room.prevWater ?? 0);
      const avgUsage = type === 'elec' ? (room.avgElecConsumption ?? 80) : 12;
      const suggested = prevVal + avgUsage;
      setTimeout(() => {
        Alert.alert(
          '🔍 Nhận diện chỉ số tự động',
          `Hệ thống đọc được: ${suggested.toLocaleString('vi-VN')}\nBạn có muốn dùng số này?\n\nCó thể nhập tay nếu ảnh không nhận diện được số.`,
          [
            { text: 'Dùng số này', onPress: () => setRoomInput(room.id, type, String(suggested)) },
            { text: 'Nhập tay', style: 'cancel' },
          ]
        );
      }, 350);
    }
  };

  const handleRoomPhoto = (room: RoomData, type: 'elec' | 'water') => {
    Alert.alert(
      `📷 Chụp ảnh đồng hồ ${type === 'elec' ? 'điện' : 'nước'}`,
      `Phòng ${room.code} — ${room.tenantName ?? 'Phòng trống'}`,
      [
        { text: '📷 Chụp ảnh', onPress: () => processRoomCapture(room, type) },
        { text: '🖼️ Chọn từ thư viện', onPress: () => processRoomCapture(room, type) },
        { text: 'Hủy', style: 'cancel' },
      ]
    );
  };

  const processSingleCapture = (prop: PropertyData, type: 'elec' | 'water') => {
    setSinglePhotos(prev => ({ ...prev, [type]: true }));
    const currentInput = type === 'elec' ? singleInputs.elec : singleInputs.water;
    if (currentInput.trim() === '') {
      const prevVal = type === 'elec' ? (prop.prevElec ?? 0) : (prop.prevWater ?? 0);
      const avgUsage = type === 'elec' ? 120 : 20;
      const suggested = prevVal + avgUsage;
      setTimeout(() => {
        Alert.alert(
          '🔍 Nhận diện chỉ số tự động',
          `Hệ thống đọc được: ${suggested.toLocaleString('vi-VN')}\nBạn có muốn dùng số này?\n\nCó thể nhập tay nếu ảnh không nhận diện được số.`,
          [
            { text: 'Dùng số này', onPress: () => setSingleInputs(prev => ({ ...prev, [type]: String(suggested) })) },
            { text: 'Nhập tay', style: 'cancel' },
          ]
        );
      }, 350);
    }
  };

  const handleSinglePhoto = (prop: PropertyData, type: 'elec' | 'water') => {
    Alert.alert(
      `📷 Chụp ảnh đồng hồ ${type === 'elec' ? 'điện' : 'nước'}`,
      prop.name,
      [
        { text: '📷 Chụp ảnh', onPress: () => processSingleCapture(prop, type) },
        { text: '🖼️ Chọn từ thư viện', onPress: () => processSingleCapture(prop, type) },
        { text: 'Hủy', style: 'cancel' },
      ]
    );
  };

  const handleSubmitRoom = (prop: PropertyData, room: RoomData) => {
    const inp = roomInputs[room.id] ?? { elec: '', water: '' };
    const photos = roomPhotos[room.id] ?? {};
    const elecVal = parseInt(inp.elec, 10);
    if (isNaN(elecVal) || elecVal < room.prevElec) {
      Alert.alert('Lỗi chỉ số', 'Chỉ số điện hiện tại phải lớn hơn hoặc bằng tháng trước.');
      return;
    }
    if (!photos.elec) {
      Alert.alert('Thiếu ảnh', 'Vui lòng chụp ảnh đồng hồ điện trước khi gửi.');
      return;
    }
    const elecConsumption = elecVal - room.prevElec;
    const elecCost = elecConsumption * prop.electricityRate;
    let waterCost = 0;
    if (prop.waterBillingType === 'flat_rate') {
      waterCost = (prop.flatWaterRate ?? 0) * room.occupants;
    } else {
      const waterVal = parseInt(inp.water, 10);
      if (isNaN(waterVal) || waterVal < (room.prevWater ?? 0)) {
        Alert.alert('Lỗi chỉ số', 'Chỉ số nước hiện tại phải lớn hơn hoặc bằng tháng trước.');
        return;
      }
      if (!photos.water) {
        Alert.alert('Thiếu ảnh', 'Vui lòng chụp ảnh đồng hồ nước trước khi gửi.');
        return;
      }
      waterCost = (waterVal - (room.prevWater ?? 0)) * (prop.waterRate ?? 0);
    }
    const summary: RoomSummary = {
      code: room.code, tenantName: room.tenantName, occupants: room.occupants,
      elecConsumption, elecCost, waterCost, totalCost: elecCost + waterCost,
      hasPhotos: !!(photos.elec && (prop.waterBillingType === 'flat_rate' || photos.water)),
    };
    const waterLine = prop.waterBillingType === 'flat_rate'
      ? `💧 Nước: ${fmt(waterCost)} (cố định)`
      : `💧 Nước: ${fmt(waterCost)}`;
    Alert.alert(
      `Gửi chỉ số phòng ${room.code}?`,
      `⚡ Điện: ${elecConsumption} kWh → ${fmt(elecCost)}\n${waterLine}\nTổng: ${fmt(summary.totalCost)}\n📷 Kèm ảnh minh chứng`,
      [
        { text: 'Kiểm tra lại', style: 'cancel' },
        {
          text: 'Xác nhận gửi',
          onPress: () => {
            const nextMonth = CURRENT_MONTH === 12 ? 1 : CURRENT_MONTH + 1;
            const nextYear = CURRENT_MONTH === 12 ? CURRENT_YEAR + 1 : CURRENT_YEAR;
            const dueDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-15`;
            const waterLabel = prop.waterBillingType === 'flat_rate'
              ? `Nước (cố định ${room.occupants} người × ${(prop.flatWaterRate ?? 0).toLocaleString('vi-VN')}đ)`
              : `Nước (${waterCost / (prop.waterRate ?? 1)} m³ × ${(prop.waterRate ?? 0).toLocaleString('vi-VN')}đ)`;
            const billItems = [
              { label: 'Tiền thuê phòng', amount: room.rentAmount },
              { label: `Điện (${elecConsumption} kWh × ${prop.electricityRate.toLocaleString('vi-VN')}đ)`, amount: elecCost },
              { label: waterLabel, amount: waterCost },
              ...(prop.serviceCharge ? [{ label: 'Phí dịch vụ', amount: prop.serviceCharge }] : []),
            ];
            const billTotal = billItems.reduce((s, i) => s + i.amount, 0);
            const newBill: SharedBill = {
              id: `bill-${Date.now()}`, code: `HD-T${CURRENT_MONTH}-${prop.id.toUpperCase()}-${room.code}`,
              roomId: room.id, roomName: room.code, propertyId: prop.id, propertyName: prop.name,
              tenantId: room.id, tenantName: room.tenantName ?? 'Khách thuê', tenantPhone: '',
              month: CURRENT_MONTH, year: CURRENT_YEAR, items: billItems,
              totalAmount: billTotal, lateFee: 0, grandTotal: billTotal,
              status: 'pending', dueDate, createdAt: new Date().toISOString().split('T')[0],
            };
            billsStore.addBills([newBill]);
            const newSubmitted = { ...submittedRooms, [room.id]: summary };
            setSubmittedRooms(newSubmitted);
            const allRooms = prop.rooms ?? [];
            const allDone = allRooms.every(r => newSubmitted[r.id] != null);
            if (allDone) {
              const allSummaries = allRooms.map(r => newSubmitted[r.id]!);
              const newRecord: HistoryRecord = {
                id: `h-${Date.now()}`, propertyId: prop.id, propertyName: prop.name,
                propertyType: 'multi_room', waterBillingType: prop.waterBillingType,
                month: CURRENT_MONTH, year: CURRENT_YEAR,
                totalElecConsumption: allSummaries.reduce((s, r) => s + r.elecConsumption, 0),
                totalElecCost: allSummaries.reduce((s, r) => s + r.elecCost, 0),
                totalWaterCost: allSummaries.reduce((s, r) => s + r.waterCost, 0),
                totalCost: allSummaries.reduce((s, r) => s + r.totalCost, 0),
                roomSummaries: allSummaries,
                recordedAt: new Date().toISOString().split('T')[0], invoicesGenerated: true,
                hasPhotos: allSummaries.every(r => r.hasPhotos),
              };
              setHistory(prev => [newRecord, ...prev]);
              setProperties(prev => prev.map(p => p.id === prop.id ? { ...p, isRecorded: true } : p));
              setSubmittedRooms({});
              setSelectedId(null);
              Alert.alert('✅ Hoàn tất!', `Tất cả ${allRooms.length} phòng đã ghi chỉ số và tạo hóa đơn!`);
            }
          },
        },
      ]
    );
  };

  const singleSummary = useMemo(() => {
    if (!selectedProp || selectedProp.type !== 'single_unit') return null;
    const elecVal = parseInt(singleInputs.elec, 10);
    if (isNaN(elecVal) || elecVal < (selectedProp.prevElec ?? 0)) return null;
    const elecConsumption = elecVal - (selectedProp.prevElec ?? 0);
    const elecCost = elecConsumption * selectedProp.electricityRate;
    const waterVal = parseInt(singleInputs.water, 10);
    if (isNaN(waterVal) || waterVal < (selectedProp.prevWater ?? 0)) return null;
    const waterConsumption = waterVal - (selectedProp.prevWater ?? 0);
    const waterCost = waterConsumption * (selectedProp.waterRate ?? 0);
    return { elecConsumption, elecCost, waterConsumption, waterCost, totalCost: elecCost + waterCost };
  }, [selectedProp, singleInputs]);

  const canSubmit = singleSummary !== null &&
    !!singlePhotos.elec &&
    (selectedProp?.waterBillingType !== 'per_meter' || !!singlePhotos.water);

  const handleSubmit = () => {
    if (!singleSummary) { Alert.alert('Còn thiếu thông tin', 'Vui lòng nhập đủ chỉ số điện và nước.'); return; }
    if (!singlePhotos.elec) { Alert.alert('Thiếu ảnh', 'Vui lòng chụp ảnh đồng hồ điện.'); return; }
    if (selectedProp?.waterBillingType === 'per_meter' && !singlePhotos.water) {
      Alert.alert('Thiếu ảnh', 'Vui lòng chụp ảnh đồng hồ nước.'); return;
    }
    setShowModal(true);
  };

  const handleConfirm = () => {
    if (!selectedProp || !singleSummary) return;
    const nextMonth = CURRENT_MONTH === 12 ? 1 : CURRENT_MONTH + 1;
    const nextYear = CURRENT_MONTH === 12 ? CURRENT_YEAR + 1 : CURRENT_YEAR;
    const dueDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-15`;
    const billItems = [
      { label: 'Tiền thuê nhà', amount: selectedProp.rentAmount ?? 0 },
      { label: `Điện (${singleSummary.elecConsumption} kWh × ${selectedProp.electricityRate.toLocaleString('vi-VN')}đ)`, amount: singleSummary.elecCost },
      { label: `Nước (${singleSummary.waterConsumption} m³ × ${(selectedProp.waterRate ?? 0).toLocaleString('vi-VN')}đ)`, amount: singleSummary.waterCost },
      ...(selectedProp.serviceCharge ? [{ label: 'Phí dịch vụ', amount: selectedProp.serviceCharge }] : []),
    ];
    const billTotal = billItems.reduce((s, i) => s + i.amount, 0);
    const newBill: SharedBill = {
      id: `bill-${Date.now()}`, code: `HD-T${CURRENT_MONTH}-${selectedProp.id.toUpperCase()}`,
      roomId: selectedProp.id, roomName: selectedProp.name, propertyId: selectedProp.id,
      propertyName: selectedProp.name, tenantId: selectedProp.id,
      tenantName: `Khách thuê ${selectedProp.name}`, tenantPhone: '',
      month: CURRENT_MONTH, year: CURRENT_YEAR, items: billItems,
      totalAmount: billTotal, lateFee: 0, grandTotal: billTotal,
      status: 'pending', dueDate, createdAt: new Date().toISOString().split('T')[0],
    };
    billsStore.addBills([newBill]);
    const newRecord: HistoryRecord = {
      id: `h-${Date.now()}`, propertyId: selectedProp.id, propertyName: selectedProp.name,
      propertyType: 'single_unit', waterBillingType: selectedProp.waterBillingType,
      month: CURRENT_MONTH, year: CURRENT_YEAR,
      totalElecConsumption: singleSummary.elecConsumption,
      totalWaterConsumption: singleSummary.waterConsumption,
      totalElecCost: singleSummary.elecCost, totalWaterCost: singleSummary.waterCost,
      totalCost: singleSummary.totalCost,
      recordedAt: new Date().toISOString().split('T')[0], invoicesGenerated: true,
      hasPhotos: !!(singlePhotos.elec && (selectedProp.waterBillingType !== 'per_meter' || singlePhotos.water)),
    };
    setHistory(prev => [newRecord, ...prev]);
    setProperties(prev => prev.map(p => p.id === selectedProp.id ? { ...p, isRecorded: true } : p));
    setShowModal(false);
    setSelectedId(null);
    Alert.alert('✅ Xong!', `Đã lưu chỉ số và tạo hóa đơn cho ${selectedProp.name}.`);
  };

  const filteredHistory = historyFilter === 'all' ? history : history.filter(h => h.propertyId === historyFilter);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['record', 'history'] as TabType[]).map(t => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'record' ? '⚡ Ghi chỉ số' : '📋 Lịch sử'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'record' ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>Ghi chỉ số điện nước</Text>
            <Text style={styles.subtitle}>Tháng {String(CURRENT_MONTH).padStart(2, '0')}/{CURRENT_YEAR}</Text>
          </View>

          {/* Progress */}
          <View style={styles.progressCard}>
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>Tiến độ tháng này</Text>
              <Text style={styles.progressValue}>{totalRecorded}/{properties.length} tòa nhà</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${properties.length > 0 ? (totalRecorded / properties.length) * 100 : 0}%` }]} />
            </View>
            <View style={styles.progressStatsRow}>
              <View style={styles.progressStat}>
                <Text style={[styles.progressStatNum, { color: Colors.success }]}>{completedRoomsAll}</Text>
                <Text style={styles.progressStatLabel}>phòng hoàn tất</Text>
              </View>
              <View style={styles.progressStatDivider} />
              <View style={styles.progressStat}>
                <Text style={[styles.progressStatNum, { color: Colors.warning }]}>{totalRoomsAll - completedRoomsAll}</Text>
                <Text style={styles.progressStatLabel}>phòng còn lại</Text>
              </View>
              <View style={styles.progressStatDivider} />
              <View style={styles.progressStat}>
                <Text style={[styles.progressStatNum, { color: Colors.primary }]}>{totalRoomsAll}</Text>
                <Text style={styles.progressStatLabel}>tổng số phòng</Text>
              </View>
            </View>
            <Text style={styles.progressHint}>
              {totalRecorded === properties.length
                ? '✅ Tất cả tòa nhà đã ghi chỉ số tháng này!'
                : `Còn ${properties.length - totalRecorded} tòa nhà · ${totalRoomsAll - completedRoomsAll} phòng chưa ghi`}
            </Text>
          </View>

          {/* OCR helper note */}
          <View style={styles.ocrNote}>
            <Text style={styles.ocrNoteText}>💡 Chụp ảnh đồng hồ để nhận diện chỉ số tự động. Có thể nhập tay nếu ảnh không nhận diện được số.</Text>
          </View>

          <Text style={styles.sectionTitle}>Chọn tòa nhà để ghi chỉ số</Text>

          {properties.map(prop => (
            <View key={prop.id}>
              <TouchableOpacity
                style={[styles.propCard, selectedId === prop.id && styles.propCardSelected, prop.isRecorded && styles.propCardDone]}
                onPress={() => handleSelectProperty(prop)}
                disabled={prop.isRecorded}
                activeOpacity={0.85}
              >
                <View style={styles.propCardTop}>
                  <Text style={styles.propEmoji}>{prop.isRecorded ? '✅' : prop.type === 'multi_room' ? '🏢' : '🏠'}</Text>
                  <View style={{ flex: 1 }}>
                    <View style={styles.propNameRow}>
                      <Text style={[styles.propName, prop.isRecorded && { color: Colors.textMuted }]}>{prop.name}</Text>
                      <View style={[styles.typeBadge, prop.type === 'single_unit' && styles.typeBadgeSingle]}>
                        <Text style={styles.typeBadgeText}>{prop.type === 'multi_room' ? 'Nhiều phòng' : 'Nguyên căn'}</Text>
                      </View>
                    </View>
                    <Text style={styles.propAddress} numberOfLines={1}>📍 {prop.address}</Text>
                  </View>
                  {!prop.isRecorded && (
                    <Text style={[styles.propChevron, selectedId === prop.id && { color: Colors.white }]}>
                      {selectedId === prop.id ? '▲' : '▼'}
                    </Text>
                  )}
                </View>
                <View style={styles.propMetaRow}>
                  {prop.type === 'multi_room' ? (
                    <>
                      <View style={styles.propMetaChip}><Text style={styles.propMetaText}>🚪 {prop.rooms?.length} phòng</Text></View>
                      <View style={styles.propMetaChip}><Text style={styles.propMetaText}>⚡ {prop.electricityRate.toLocaleString('vi-VN')}đ/kWh</Text></View>
                      <View style={[styles.propMetaChip, prop.waterBillingType === 'flat_rate' && styles.propMetaChipWater]}>
                        <Text style={styles.propMetaText}>
                          {prop.waterBillingType === 'flat_rate'
                            ? `💧 Nước cố định ${(prop.flatWaterRate ?? 0).toLocaleString('vi-VN')}đ/người`
                            : `💧 ${(prop.waterRate ?? 0).toLocaleString('vi-VN')}đ/m³`}
                        </Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={styles.propMetaChip}><Text style={styles.propMetaText}>👤 {prop.activeTenants} người thuê</Text></View>
                      <View style={styles.propMetaChip}><Text style={styles.propMetaText}>⚡ {prop.electricityRate.toLocaleString('vi-VN')}đ/kWh</Text></View>
                      <View style={styles.propMetaChip}><Text style={styles.propMetaText}>💧 {(prop.waterRate ?? 0).toLocaleString('vi-VN')}đ/m³</Text></View>
                    </>
                  )}
                  {prop.isRecorded && (
                    <View style={[styles.propMetaChip, { backgroundColor: Colors.successLight }]}>
                      <Text style={[styles.propMetaText, { color: Colors.success }]}>✓ Đã ghi tháng này</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>

              {/* Expanded form */}
              {selectedId === prop.id && !prop.isRecorded && (
                <View style={styles.formBox}>
                  {prop.type === 'multi_room' ? (
                    <>
                      <View style={styles.formBoxHeader}>
                        <Text style={styles.formBoxTitle}>
                          Ghi chỉ số từng phòng ({Object.keys(submittedRooms).length}/{prop.rooms?.length} phòng đã gửi)
                        </Text>
                        <Text style={styles.formBoxSub}>
                          {prop.waterBillingType === 'flat_rate'
                            ? '💧 Nước cố định · Chỉ cần nhập điện + chụp ảnh đồng hồ điện'
                            : '⚡💧 Nhập điện + nước · Chụp ảnh cả 2 đồng hồ'}
                        </Text>
                      </View>
                      {prop.rooms?.map(room => (
                        <RoomMeterCard
                          key={room.id}
                          room={room}
                          electricityRate={prop.electricityRate}
                          waterBillingType={prop.waterBillingType}
                          flatWaterRate={prop.flatWaterRate}
                          waterRate={prop.waterRate}
                          elecInput={roomInputs[room.id]?.elec ?? ''}
                          waterInput={roomInputs[room.id]?.water ?? ''}
                          onElecChange={v => setRoomInput(room.id, 'elec', v)}
                          onWaterChange={v => setRoomInput(room.id, 'water', v)}
                          elecPhoto={!!(roomPhotos[room.id]?.elec)}
                          waterPhoto={!!(roomPhotos[room.id]?.water)}
                          onElecPhoto={() => handleRoomPhoto(room, 'elec')}
                          onWaterPhoto={() => handleRoomPhoto(room, 'water')}
                          isSubmitted={submittedRooms[room.id] != null}
                          submittedSummary={submittedRooms[room.id]}
                          onSubmit={() => handleSubmitRoom(prop, room)}
                        />
                      ))}
                    </>
                  ) : (
                    <>
                      <View style={styles.formBoxHeader}>
                        <Text style={styles.formBoxTitle}>Ghi chỉ số đồng hồ</Text>
                        <Text style={styles.formBoxSub}>Nhà nguyên căn — Chụp ảnh + nhập chỉ số điện và nước</Text>
                      </View>

                      {/* Single: Electric */}
                      <View style={styles.singleMeterCard}>
                        <View style={styles.singleMeterHeader}>
                          <Text style={styles.singleMeterLabel}>⚡ Đồng hồ điện</Text>
                          <Text style={styles.singleMeterRate}>{prop.electricityRate.toLocaleString('vi-VN')}đ/kWh</Text>
                        </View>
                        <View style={rStyles.inputRow}>
                          <View style={rStyles.prevBox}>
                            <Text style={rStyles.prevLabel}>Tháng trước</Text>
                            <Text style={rStyles.prevValue}>{prop.prevElec}</Text>
                          </View>
                          <Text style={rStyles.arrow}>→</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={rStyles.prevLabel}>Hiện tại *</Text>
                            <TextInput
                              style={rStyles.input}
                              value={singleInputs.elec}
                              onChangeText={v => setSingleInputs(p => ({ ...p, elec: v }))}
                              keyboardType="numeric"
                              placeholder="Nhập số..."
                              placeholderTextColor={Colors.textMuted}
                            />
                          </View>
                        </View>
                        {singleSummary && (
                          <View style={rStyles.resultRow}>
                            <Text style={rStyles.resultText}>Tiêu thụ: <Text style={rStyles.resultBold}>{singleSummary.elecConsumption} kWh</Text></Text>
                            <Text style={rStyles.resultCost}>{fmt(singleSummary.elecCost)}</Text>
                          </View>
                        )}
                        <PhotoCaptureRow
                          label="Chụp đồng hồ điện"
                          hasPhoto={!!singlePhotos.elec}
                          onCapture={() => handleSinglePhoto(prop, 'elec')}
                        />
                      </View>

                      {/* Single: Water */}
                      <View style={styles.singleMeterCard}>
                        <View style={styles.singleMeterHeader}>
                          <Text style={styles.singleMeterLabel}>💧 Đồng hồ nước</Text>
                          <Text style={styles.singleMeterRate}>{(prop.waterRate ?? 0).toLocaleString('vi-VN')}đ/m³</Text>
                        </View>
                        <View style={rStyles.inputRow}>
                          <View style={rStyles.prevBox}>
                            <Text style={rStyles.prevLabel}>Tháng trước</Text>
                            <Text style={rStyles.prevValue}>{prop.prevWater}</Text>
                          </View>
                          <Text style={rStyles.arrow}>→</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={rStyles.prevLabel}>Hiện tại *</Text>
                            <TextInput
                              style={rStyles.input}
                              value={singleInputs.water}
                              onChangeText={v => setSingleInputs(p => ({ ...p, water: v }))}
                              keyboardType="numeric"
                              placeholder="Nhập số..."
                              placeholderTextColor={Colors.textMuted}
                            />
                          </View>
                        </View>
                        {singleSummary && (
                          <View style={rStyles.resultRow}>
                            <Text style={rStyles.resultText}>Tiêu thụ: <Text style={rStyles.resultBold}>{singleSummary.waterConsumption} m³</Text></Text>
                            <Text style={rStyles.resultCost}>{fmt(singleSummary.waterCost)}</Text>
                          </View>
                        )}
                        <PhotoCaptureRow
                          label="Chụp đồng hồ nước"
                          hasPhoto={!!singlePhotos.water}
                          onCapture={() => handleSinglePhoto(prop, 'water')}
                        />
                      </View>

                      {singleSummary && (
                        <View style={styles.singleTotal}>
                          <Text style={styles.singleTotalLabel}>Tổng tiền điện + nước tháng {CURRENT_MONTH}</Text>
                          <Text style={styles.singleTotalValue}>{fmt(singleSummary.totalCost)}</Text>
                          <Text style={styles.singleTotalSub}>Chia cho {prop.activeTenants} người = {fmt(Math.round(singleSummary.totalCost / (prop.activeTenants ?? 1)))}/người</Text>
                        </View>
                      )}
                    </>
                  )}

                  {prop.type === 'single_unit' && (
                    <TouchableOpacity
                      style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
                      onPress={handleSubmit}
                      disabled={!canSubmit}
                    >
                      <Text style={styles.submitBtnText}>
                        {canSubmit ? '✅ Lưu chỉ số & Tạo hóa đơn' : 'Nhập đủ chỉ số + ảnh để gửi'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          ))}
          <View style={{ height: 100 }} />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>Lịch sử ghi chỉ số</Text>
            <Text style={styles.subtitle}>Nhấn vào từng bản ghi để xem chi tiết và ảnh minh chứng</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}
            contentContainerStyle={{ paddingHorizontal: Spacing.lg }}>
            {[{ id: 'all', name: 'Tất cả' }, ...properties.map(p => ({ id: p.id, name: p.name }))].map(f => (
              <TouchableOpacity
                key={f.id}
                style={[styles.filterChip, historyFilter === f.id && styles.filterChipActive]}
                onPress={() => setHistoryFilter(f.id)}
              >
                <Text style={[styles.filterText, historyFilter === f.id && styles.filterTextActive]}>{f.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={{ paddingHorizontal: Spacing.lg }}>
            {filteredHistory.length === 0
              ? <View style={styles.emptyState}><Text style={{ fontSize: 40 }}>📊</Text><Text style={styles.emptyText}>Chưa có lịch sử</Text></View>
              : filteredHistory.map(r => <HistoryCard key={r.id} record={r} />)
            }
          </View>
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Confirm modal */}
      <Modal visible={showModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>✅ Xác nhận lưu chỉ số & Tạo hóa đơn</Text>
            {selectedProp && singleSummary && (
              <>
                <View style={styles.modalPropRow}>
                  <Text style={styles.modalPropName}>{selectedProp.name}</Text>
                  <View style={[styles.typeBadge, selectedProp.type === 'single_unit' && styles.typeBadgeSingle]}>
                    <Text style={styles.typeBadgeText}>{selectedProp.type === 'multi_room' ? 'Nhiều phòng' : 'Nguyên căn'}</Text>
                  </View>
                </View>
                <View style={styles.modalRow}><Text style={styles.modalLabel}>⚡ Điện tiêu thụ</Text><Text style={styles.modalVal}>{singleSummary.elecConsumption} kWh · {fmt(singleSummary.elecCost)}</Text></View>
                <View style={styles.modalRow}><Text style={styles.modalLabel}>💧 Nước tiêu thụ</Text><Text style={styles.modalVal}>{singleSummary.waterConsumption} m³ · {fmt(singleSummary.waterCost)}</Text></View>
                <View style={styles.modalRow}><Text style={styles.modalLabel}>📷 Ảnh minh chứng</Text><Text style={[styles.modalVal, { color: Colors.success }]}>Đã đính kèm ✓</Text></View>
                <View style={styles.modalDivider} />
                <View style={styles.modalTotalRow}>
                  <Text style={styles.modalTotalLabel}>Tổng 1 hóa đơn</Text>
                  <Text style={styles.modalTotalVal}>{fmt(singleSummary.totalCost)}</Text>
                </View>
                <View style={styles.modalHighlight}>
                  <Text style={styles.modalHighlightText}>
                    Hệ thống sẽ tạo <Text style={{ fontWeight: '800' }}>1 hóa đơn</Text> kèm ảnh minh chứng và gửi thông báo cho khách thuê.
                  </Text>
                </View>
                <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
                  <Text style={styles.confirmBtnText}>🧾 Xác nhận & Tạo hóa đơn</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                  <Text style={styles.cancelBtnText}>Kiểm tra lại</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

// ===================== STYLES =====================
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Spacing.lg, paddingBottom: 100 },
  tabBar: { flexDirection: 'row', backgroundColor: Colors.white, borderBottomWidth: 1, borderColor: Colors.divider },
  tab: { flex: 1, paddingVertical: Spacing.base, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary },
  header: { paddingTop: Spacing.lg, marginBottom: Spacing.md },
  title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  ocrNote: { backgroundColor: '#EFF6FF', borderRadius: BorderRadius.md, padding: Spacing.sm, marginBottom: Spacing.md, borderWidth: 1, borderColor: '#BFDBFE' },
  ocrNoteText: { fontSize: 12, color: '#3B82F6', fontWeight: '500', lineHeight: 18 },
  progressCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.sm },
  progressLabel: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  progressValue: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  progressBarBg: { height: 8, backgroundColor: Colors.divider, borderRadius: 4, overflow: 'hidden', marginBottom: Spacing.sm },
  progressBarFill: { height: 8, backgroundColor: Colors.primary, borderRadius: 4 },
  progressStatsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  progressStat: { flex: 1, alignItems: 'center' },
  progressStatNum: { fontSize: 20, fontWeight: '800' },
  progressStatLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 1 },
  progressStatDivider: { width: 1, height: 32, backgroundColor: Colors.divider },
  progressHint: { fontSize: 12, color: Colors.textSecondary, marginTop: Spacing.xs },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  propCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.xl, marginBottom: Spacing.xs, ...Shadow.sm, overflow: 'hidden', borderWidth: 1.5, borderColor: Colors.border },
  propCardSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary },
  propCardDone: { borderColor: Colors.success, backgroundColor: Colors.successLight, opacity: 0.85 },
  propCardTop: { flexDirection: 'row', alignItems: 'center', padding: Spacing.base, gap: Spacing.sm },
  propEmoji: { fontSize: 30 },
  propNameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 3 },
  propName: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary, flex: 1 },
  propAddress: { fontSize: 11, color: Colors.textSecondary },
  propChevron: { fontSize: 14, color: Colors.textMuted, paddingLeft: 4 },
  propMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: Spacing.base, paddingBottom: Spacing.sm },
  propMetaChip: { backgroundColor: Colors.background, paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border },
  propMetaChipWater: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  propMetaText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  typeBadge: { backgroundColor: Colors.primaryBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  typeBadgeSingle: { backgroundColor: '#FEF3C7' },
  typeBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.primary },
  formBox: { backgroundColor: Colors.background, borderWidth: 1.5, borderTopWidth: 0, borderColor: Colors.primary, borderBottomLeftRadius: BorderRadius.xl, borderBottomRightRadius: BorderRadius.xl, padding: Spacing.base, marginBottom: Spacing.md },
  formBoxHeader: { marginBottom: Spacing.md },
  formBoxTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  formBoxSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
  singleMeterCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm, borderWidth: 1, borderColor: Colors.border },
  singleMeterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  singleMeterLabel: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  singleMeterRate: { fontSize: 12, color: Colors.textMuted },
  singleTotal: { backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.primary + '40' },
  singleTotalLabel: { fontSize: 12, color: Colors.primary, fontWeight: '600' },
  singleTotalValue: { fontSize: 26, fontWeight: '800', color: Colors.primary, marginVertical: 4 },
  singleTotalSub: { fontSize: 12, color: Colors.textSecondary },
  submitBtn: { backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, paddingVertical: Spacing.base, alignItems: 'center', ...Shadow.md, marginTop: Spacing.sm },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  filterRow: { marginBottom: Spacing.md, maxHeight: 50 },
  filterChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, marginRight: Spacing.sm },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: Spacing.md },
  emptyText: { fontSize: 14, color: Colors.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.xl, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },
  modalPropRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  modalPropName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  modalLabel: { fontSize: 14, color: Colors.textSecondary },
  modalVal: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  modalDivider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.md },
  modalTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.md },
  modalTotalLabel: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  modalTotalVal: { fontSize: 22, fontWeight: '800', color: Colors.primary },
  modalHighlight: { backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.lg },
  modalHighlightText: { fontSize: 14, color: Colors.textPrimary, lineHeight: 22 },
  confirmBtn: { backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, paddingVertical: Spacing.base, alignItems: 'center', marginBottom: Spacing.md, ...Shadow.md },
  confirmBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  cancelBtn: { alignItems: 'center', paddingVertical: Spacing.sm },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
});
