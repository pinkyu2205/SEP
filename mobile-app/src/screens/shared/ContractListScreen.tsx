import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, FlatList,
  TextInput, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { DatePickerField } from '../../components/common/DatePickerField';

const SCREEN_HEIGHT = Dimensions.get('window').height;

// ===================== TYPES =====================
type ContractStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'active'
  | 'rejected'
  | 'expiring_soon'
  | 'expired'
  | 'terminated';

type ContractType = 'building_rental' | 'room_rental';

interface ContractEquipment {
  id: string;
  name: string;
  quantity: number;
  condition: string;
}

interface ApprovalEntry {
  action: 'created' | 'submitted' | 'approved' | 'rejected' | 'activated' | 'terminated' | 'renewed';
  by: string;
  at: string;
  note?: string;
}

interface Contract {
  id: string;
  code: string;
  type: ContractType;
  lessorName: string;
  lesseeName: string;
  lesseeCccd: string;
  lesseePhone: string;
  propertyName: string;
  roomCode?: string;
  startDate: string;
  endDate: string;
  depositAmount: number;
  rentAmount: number;
  status: ContractStatus;
  equipmentList: ContractEquipment[];
  daysUntilExpiry?: number;
  terms?: string;
  notes?: string;
  submittedBy?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  otpVerified?: boolean;
  signedAt?: string;
  terminatedAt?: string;
  terminationReason?: string;
  approvalHistory: ApprovalEntry[];
  createdAt: string;
  updatedAt: string;
}

interface ContractForm {
  type: ContractType;
  lesseeName: string;
  lesseeCccd: string;
  lesseePhone: string;
  propertyName: string;
  roomCode: string;
  startDate: string;
  endDate: string;
  rentAmount: string;
  depositAmount: string;
  terms: string;
  notes: string;
  equipmentList: ContractEquipment[];
}

// ===================== MOCK DATA =====================
const DEFAULT_TERMS =
  'Điều 1: Bên thuê có trách nhiệm bảo quản tài sản trong tình trạng tốt.\n' +
  'Điều 2: Tiền thuê thanh toán vào ngày 05 hàng tháng.\n' +
  'Điều 3: Thông báo trước 30 ngày khi chấm dứt hợp đồng.\n' +
  'Điều 4: Không được chuyển nhượng hợp đồng cho bên thứ ba.';

const MOCK_HOST_CONTRACTS: Contract[] = [
  {
    id: 'h1', code: 'HD-NH-2026-001', type: 'building_rental',
    lessorName: 'Nguyễn Văn Host', lesseeName: 'Nguyễn Văn Quản',
    lesseeCccd: '079201002001', lesseePhone: '0901222001',
    propertyName: 'Nhà Nguyễn Trãi',
    startDate: '01/01/2026', endDate: '01/01/2028',
    depositAmount: 20000000, rentAmount: 8000000,
    status: 'active', daysUntilExpiry: 228,
    otpVerified: true, signedAt: '01/01/2026',
    equipmentList: [],
    terms: DEFAULT_TERMS,
    submittedBy: 'Nguyễn Văn Host',
    approvedBy: 'Admin Hệ thống',
    approvalHistory: [
      { action: 'created', by: 'Nguyễn Văn Host', at: '28/12/2025' },
      { action: 'approved', by: 'Admin Hệ thống', at: '30/12/2025' },
      { action: 'activated', by: 'Nguyễn Văn Quản', at: '01/01/2026' },
    ],
    createdAt: '28/12/2025', updatedAt: '01/01/2026',
  },
  {
    id: 'h2', code: 'HD-NH-2026-002', type: 'building_rental',
    lessorName: 'Trần Văn Host', lesseeName: 'Nguyễn Văn Quản',
    lesseeCccd: '079201002001', lesseePhone: '0901222001',
    propertyName: 'Nhà Lê Văn Sỹ',
    startDate: '01/03/2026', endDate: '01/03/2027',
    depositAmount: 15000000, rentAmount: 6500000,
    status: 'expiring_soon', daysUntilExpiry: 18,
    otpVerified: true, signedAt: '01/03/2026',
    equipmentList: [],
    terms: DEFAULT_TERMS,
    submittedBy: 'Trần Văn Host',
    approvedBy: 'Admin Hệ thống',
    approvalHistory: [
      { action: 'created', by: 'Trần Văn Host', at: '26/02/2026' },
      { action: 'approved', by: 'Admin Hệ thống', at: '28/02/2026' },
      { action: 'activated', by: 'Nguyễn Văn Quản', at: '01/03/2026' },
    ],
    createdAt: '26/02/2026', updatedAt: '01/03/2026',
  },
  {
    id: 'h3', code: 'HD-NH-2025-003', type: 'building_rental',
    lessorName: 'Lê Văn Host', lesseeName: 'Nguyễn Văn Quản',
    lesseeCccd: '079201002001', lesseePhone: '0901222001',
    propertyName: 'Nhà Phan Đình Phùng',
    startDate: '01/06/2024', endDate: '01/06/2025',
    depositAmount: 12000000, rentAmount: 5000000,
    status: 'expired', daysUntilExpiry: -348,
    otpVerified: true, signedAt: '01/06/2024',
    equipmentList: [],
    terms: DEFAULT_TERMS,
    approvalHistory: [
      { action: 'created', by: 'Lê Văn Host', at: '28/05/2024' },
      { action: 'approved', by: 'Admin Hệ thống', at: '30/05/2024' },
      { action: 'activated', by: 'Nguyễn Văn Quản', at: '01/06/2024' },
    ],
    createdAt: '28/05/2024', updatedAt: '01/06/2024',
  },
];

const MOCK_CONTRACTS: Contract[] = [
  {
    id: 'c1', code: 'HD-MT-2026-001', type: 'room_rental',
    lessorName: 'Nguyễn Văn Quản', lesseeName: 'Trần Văn An',
    lesseeCccd: '079201001001', lesseePhone: '0901111001',
    propertyName: 'Nhà Nguyễn Trãi', roomCode: 'P101',
    startDate: '01/06/2026', endDate: '01/06/2027',
    depositAmount: 3500000, rentAmount: 3500000,
    status: 'draft',
    equipmentList: [
      { id: 'e1', name: 'Điều hòa Daikin 9000BTU', quantity: 1, condition: 'Mới' },
      { id: 'e2', name: 'Giường 1m6 + Nệm', quantity: 1, condition: 'Mới' },
    ],
    terms: DEFAULT_TERMS,
    approvalHistory: [
      { action: 'created', by: 'Nguyễn Văn Quản', at: '14/05/2026 09:00' },
    ],
    createdAt: '14/05/2026', updatedAt: '14/05/2026',
  },
  {
    id: 'c2', code: 'HD-MT-2026-002', type: 'room_rental',
    lessorName: 'Nguyễn Văn Quản', lesseeName: 'Lê Thị Bình',
    lesseeCccd: '079201001002', lesseePhone: '0901111002',
    propertyName: 'Nhà Nguyễn Trãi', roomCode: 'P102',
    startDate: '01/06/2026', endDate: '01/06/2027',
    depositAmount: 3200000, rentAmount: 3200000,
    status: 'pending_approval',
    submittedBy: 'Nguyễn Văn Quản',
    submittedAt: '15/05/2026 10:30',
    equipmentList: [
      { id: 'e3', name: 'Bình nước nóng Ariston 30L', quantity: 1, condition: 'Mới' },
      { id: 'e4', name: 'Tủ quần áo 2 cánh', quantity: 1, condition: 'Mới' },
    ],
    terms: DEFAULT_TERMS,
    approvalHistory: [
      { action: 'created', by: 'Nguyễn Văn Quản', at: '13/05/2026 14:00' },
      { action: 'submitted', by: 'Nguyễn Văn Quản', at: '15/05/2026 10:30', note: 'Gửi duyệt lần đầu' },
    ],
    createdAt: '13/05/2026', updatedAt: '15/05/2026',
  },
  {
    id: 'c3', code: 'HD-MT-2026-003', type: 'room_rental',
    lessorName: 'Nguyễn Văn Quản', lesseeName: 'Phạm Văn Cường',
    lesseeCccd: '079201001003', lesseePhone: '0901111003',
    propertyName: 'Nhà Nguyễn Trãi', roomCode: 'P103',
    startDate: '01/06/2026', endDate: '01/06/2027',
    depositAmount: 3800000, rentAmount: 3800000,
    status: 'approved',
    submittedBy: 'Nguyễn Văn Quản',
    submittedAt: '10/05/2026 09:00',
    approvedBy: 'Admin Hệ thống',
    approvedAt: '12/05/2026 14:00',
    equipmentList: [
      { id: 'e5', name: 'Điều hòa Panasonic 12000BTU', quantity: 1, condition: 'Mới' },
      { id: 'e6', name: 'Bình nước nóng 30L', quantity: 1, condition: 'Mới' },
      { id: 'e7', name: 'Giường + Nệm 1m6', quantity: 1, condition: 'Mới' },
    ],
    terms: DEFAULT_TERMS,
    approvalHistory: [
      { action: 'created', by: 'Nguyễn Văn Quản', at: '09/05/2026 11:00' },
      { action: 'submitted', by: 'Nguyễn Văn Quản', at: '10/05/2026 09:00' },
      { action: 'approved', by: 'Admin Hệ thống', at: '12/05/2026 14:00', note: 'Hợp đồng hợp lệ, đủ điều kiện kích hoạt' },
    ],
    createdAt: '09/05/2026', updatedAt: '12/05/2026',
  },
  {
    id: 'c4', code: 'HD-MT-2026-004', type: 'room_rental',
    lessorName: 'Nguyễn Văn Quản', lesseeName: 'Hoàng Văn Dũng',
    lesseeCccd: '079201001004', lesseePhone: '0901111004',
    propertyName: 'Nhà Nguyễn Trãi', roomCode: 'P201',
    startDate: '01/02/2026', endDate: '01/02/2027',
    depositAmount: 4000000, rentAmount: 4000000,
    status: 'active', daysUntilExpiry: 261,
    otpVerified: true, signedAt: '01/02/2026',
    equipmentList: [
      { id: 'e8', name: 'Điều hòa Casper 9000BTU', quantity: 1, condition: 'Mới' },
      { id: 'e9', name: 'Máy giặt Toshiba 8kg', quantity: 1, condition: 'Mới' },
    ],
    terms: DEFAULT_TERMS,
    submittedBy: 'Nguyễn Văn Quản',
    submittedAt: '28/01/2026',
    approvedBy: 'Admin Hệ thống',
    approvedAt: '30/01/2026',
    approvalHistory: [
      { action: 'created', by: 'Nguyễn Văn Quản', at: '27/01/2026 10:00' },
      { action: 'submitted', by: 'Nguyễn Văn Quản', at: '28/01/2026 09:00' },
      { action: 'approved', by: 'Admin Hệ thống', at: '30/01/2026 15:00' },
      { action: 'activated', by: 'Nguyễn Văn Quản', at: '01/02/2026 08:00', note: 'Đã xác nhận OTP, hợp đồng có hiệu lực' },
    ],
    createdAt: '27/01/2026', updatedAt: '01/02/2026',
  },
  {
    id: 'c5', code: 'HD-MT-2026-005', type: 'room_rental',
    lessorName: 'Nguyễn Văn Quản', lesseeName: 'Trần Thị Emi',
    lesseeCccd: '079201001005', lesseePhone: '0901111005',
    propertyName: 'Nhà Lê Văn Sỹ', roomCode: 'P101',
    startDate: '01/06/2026', endDate: '01/06/2027',
    depositAmount: 3500000, rentAmount: 3500000,
    status: 'rejected',
    submittedBy: 'Nguyễn Văn Quản',
    submittedAt: '12/05/2026 08:30',
    rejectedBy: 'Admin Hệ thống',
    rejectedAt: '13/05/2026 16:00',
    rejectionReason: 'CCCD của khách thuê không hợp lệ, vui lòng cập nhật lại và gửi duyệt lại.',
    equipmentList: [
      { id: 'e10', name: 'Điều hòa Daikin 9000BTU', quantity: 1, condition: 'Mới' },
    ],
    terms: DEFAULT_TERMS,
    approvalHistory: [
      { action: 'created', by: 'Nguyễn Văn Quản', at: '11/05/2026 14:00' },
      { action: 'submitted', by: 'Nguyễn Văn Quản', at: '12/05/2026 08:30' },
      { action: 'rejected', by: 'Admin Hệ thống', at: '13/05/2026 16:00', note: 'CCCD của khách thuê không hợp lệ, vui lòng cập nhật lại và gửi duyệt lại.' },
    ],
    createdAt: '11/05/2026', updatedAt: '13/05/2026',
  },
  {
    id: 'c6', code: 'HD-MT-2025-006', type: 'room_rental',
    lessorName: 'Nguyễn Văn Quản', lesseeName: 'Vũ Minh Phương',
    lesseeCccd: '079201001006', lesseePhone: '0901111006',
    propertyName: 'Nhà Lê Văn Sỹ', roomCode: 'P102',
    startDate: '01/06/2025', endDate: '25/05/2026',
    depositAmount: 3000000, rentAmount: 3000000,
    status: 'expiring_soon', daysUntilExpiry: 9,
    otpVerified: true, signedAt: '01/06/2025',
    equipmentList: [
      { id: 'e11', name: 'Bình nước nóng 30L', quantity: 1, condition: 'Đã sử dụng - Tốt' },
    ],
    terms: DEFAULT_TERMS,
    submittedBy: 'Nguyễn Văn Quản',
    submittedAt: '28/05/2025',
    approvedBy: 'Admin Hệ thống',
    approvedAt: '30/05/2025',
    approvalHistory: [
      { action: 'created', by: 'Nguyễn Văn Quản', at: '27/05/2025 10:00' },
      { action: 'submitted', by: 'Nguyễn Văn Quản', at: '28/05/2025 09:00' },
      { action: 'approved', by: 'Admin Hệ thống', at: '30/05/2025 14:00' },
      { action: 'activated', by: 'Nguyễn Văn Quản', at: '01/06/2025 08:00' },
    ],
    createdAt: '27/05/2025', updatedAt: '01/06/2025',
  },
  {
    id: 'c7', code: 'HD-MT-2025-007', type: 'room_rental',
    lessorName: 'Nguyễn Văn Quản', lesseeName: 'Nguyễn Bảo Gia',
    lesseeCccd: '079201001007', lesseePhone: '0901111007',
    propertyName: 'Nhà Nguyễn Trãi', roomCode: 'P301',
    startDate: '01/04/2025', endDate: '01/04/2026',
    depositAmount: 3200000, rentAmount: 3200000,
    status: 'expired', daysUntilExpiry: -45,
    otpVerified: true, signedAt: '01/04/2025',
    equipmentList: [
      { id: 'e12', name: 'Điều hòa Daikin 9000BTU', quantity: 1, condition: 'Đã sử dụng - Tốt' },
      { id: 'e13', name: 'Giường + Nệm', quantity: 1, condition: 'Đã sử dụng - Tốt' },
    ],
    terms: DEFAULT_TERMS,
    submittedBy: 'Nguyễn Văn Quản',
    approvedBy: 'Admin Hệ thống',
    approvalHistory: [
      { action: 'created', by: 'Nguyễn Văn Quản', at: '28/03/2025' },
      { action: 'submitted', by: 'Nguyễn Văn Quản', at: '29/03/2025' },
      { action: 'approved', by: 'Admin Hệ thống', at: '31/03/2025' },
      { action: 'activated', by: 'Nguyễn Văn Quản', at: '01/04/2025' },
    ],
    createdAt: '28/03/2025', updatedAt: '01/04/2025',
  },
  {
    id: 'c8', code: 'HD-MT-2025-008', type: 'room_rental',
    lessorName: 'Nguyễn Văn Quản', lesseeName: 'Đỗ Hương Giang',
    lesseeCccd: '079201001008', lesseePhone: '0901111008',
    propertyName: 'Nhà Lê Văn Sỹ', roomCode: 'P201',
    startDate: '01/01/2025', endDate: '01/01/2026',
    depositAmount: 3500000, rentAmount: 3500000,
    status: 'terminated',
    otpVerified: true, signedAt: '01/01/2025',
    terminatedAt: '10/03/2025',
    terminationReason: 'Khách thuê chuyển đi theo yêu cầu cá nhân',
    equipmentList: [
      { id: 'e14', name: 'Điều hòa Panasonic 9000BTU', quantity: 1, condition: 'Đã sử dụng - Tốt' },
    ],
    terms: DEFAULT_TERMS,
    submittedBy: 'Nguyễn Văn Quản',
    approvedBy: 'Admin Hệ thống',
    approvalHistory: [
      { action: 'created', by: 'Nguyễn Văn Quản', at: '28/12/2024' },
      { action: 'submitted', by: 'Nguyễn Văn Quản', at: '29/12/2024' },
      { action: 'approved', by: 'Admin Hệ thống', at: '30/12/2024' },
      { action: 'activated', by: 'Nguyễn Văn Quản', at: '01/01/2025' },
      { action: 'terminated', by: 'Nguyễn Văn Quản', at: '10/03/2025', note: 'Khách thuê chuyển đi theo yêu cầu cá nhân' },
    ],
    createdAt: '28/12/2024', updatedAt: '10/03/2025',
  },
];

// ===================== CONFIG =====================
const STATUS_CONFIG: Record<ContractStatus, { label: string; color: string; bg: string; icon: string }> = {
  draft:            { label: 'Nháp',            color: '#6B7280', bg: '#F3F4F6', icon: '📝' },
  pending_approval: { label: 'Chờ duyệt',       color: '#F59E0B', bg: '#FFFBEB', icon: '⏳' },
  approved:         { label: 'Đã duyệt',        color: '#3B82F6', bg: '#EFF6FF', icon: '✅' },
  active:           { label: 'Hiệu lực',        color: '#10B981', bg: '#F0FDF4', icon: '🟢' },
  rejected:         { label: 'Bị từ chối',      color: '#EF4444', bg: '#FEF2F2', icon: '❌' },
  expiring_soon:    { label: 'Sắp hết hạn',     color: '#F97316', bg: '#FFF7ED', icon: '⏰' },
  expired:          { label: 'Đã hết hạn',      color: '#EF4444', bg: '#FEF2F2', icon: '🚫' },
  terminated:       { label: 'Đã thanh lý',     color: '#94A3B8', bg: '#F8FAFC', icon: '🔒' },
};

const APPROVAL_ACTION_CONFIG: Record<ApprovalEntry['action'], { label: string; color: string }> = {
  created:    { label: 'Tạo nháp',       color: '#6B7280' },
  submitted:  { label: 'Gửi duyệt',      color: '#F59E0B' },
  approved:   { label: 'Đã duyệt',       color: '#3B82F6' },
  rejected:   { label: 'Bị từ chối',     color: '#EF4444' },
  activated:  { label: 'Kích hoạt',      color: '#10B981' },
  terminated: { label: 'Thanh lý',       color: '#94A3B8' },
  renewed:    { label: 'Gia hạn',        color: '#8B5CF6' },
};

const FILTER_TABS: Array<{ key: 'all' | ContractStatus; label: string }> = [
  { key: 'all',             label: 'Tất cả' },
  { key: 'draft',           label: 'Nháp' },
  { key: 'pending_approval',label: 'Chờ duyệt' },
  { key: 'approved',        label: 'Đã duyệt' },
  { key: 'active',          label: 'Hiệu lực' },
  { key: 'rejected',        label: 'Từ chối' },
  { key: 'expiring_soon',   label: 'Sắp hết hạn' },
  { key: 'expired',         label: 'Đã hết hạn' },
];

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

const DEFAULT_FORM: ContractForm = {
  type: 'room_rental',
  lesseeName: '',
  lesseeCccd: '',
  lesseePhone: '',
  propertyName: '',
  roomCode: '',
  startDate: '',
  endDate: '',
  rentAmount: '',
  depositAmount: '',
  terms: DEFAULT_TERMS,
  notes: '',
  equipmentList: [],
};

// ===================== CONTRACT CARD =====================
const ContractCard: React.FC<{
  contract: Contract;
  onPress: () => void;
  onAction: (action: string, contract: Contract) => void;
}> = ({ contract, onPress, onAction }) => {
  const cfg = STATUS_CONFIG[contract.status];
  const isUrgent = contract.status === 'rejected' || (contract.status === 'expiring_soon' && (contract.daysUntilExpiry || 0) <= 7);

  return (
    <TouchableOpacity
      style={[styles.card, isUrgent && styles.cardUrgent]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Card Header */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.cardCode}>{contract.code}</Text>
          <View style={styles.cardTypeBadge}>
            <Text style={styles.cardTypeText}>
              {contract.type === 'building_rental' ? 'Thuê nhà' : 'Thuê phòng'}
            </Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
          <Text style={styles.statusIcon}>{cfg.icon}</Text>
          <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      {/* Card Body */}
      <View style={styles.cardBody}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Bên thuê</Text>
          <Text style={styles.infoValue}>{contract.lesseeName}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{contract.roomCode ? 'Nhà · Phòng' : 'Nhà'}</Text>
          <Text style={styles.infoValue}>
            {contract.propertyName}{contract.roomCode ? ` · ${contract.roomCode}` : ''}
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Tiền thuê</Text>
          <Text style={[styles.infoValue, { color: Colors.primary, fontWeight: '700' }]}>
            {fmt(contract.rentAmount)}/tháng
          </Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Tiền cọc</Text>
          <Text style={styles.infoValue}>{fmt(contract.depositAmount)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Tài sản BG</Text>
          <Text style={styles.infoValue}>{contract.equipmentList.length} món</Text>
        </View>
      </View>

      {/* Rejection reason banner */}
      {contract.status === 'rejected' && contract.rejectionReason && (
        <View style={styles.rejectionBanner}>
          <Text style={styles.rejectionBannerText} numberOfLines={2}>
            ❌ Lý do từ chối: {contract.rejectionReason}
          </Text>
        </View>
      )}

      {/* Expiry banner */}
      {contract.status === 'expiring_soon' && (
        <View style={styles.expiryBanner}>
          <Text style={styles.expiryBannerText}>
            ⏰ Còn {contract.daysUntilExpiry} ngày hết hạn
          </Text>
        </View>
      )}

      {/* Card Footer */}
      <View style={styles.cardFooter}>
        <Text style={styles.cardDate}>{contract.startDate} → {contract.endDate}</Text>

        {/* Quick action buttons */}
        <View style={styles.quickActions}>
          {contract.status === 'draft' && (
            <>
              <TouchableOpacity
                style={styles.qaBtn}
                onPress={(e) => { e.stopPropagation?.(); onAction('edit', contract); }}
              >
                <Text style={styles.qaBtnText}>Sửa</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.qaBtn, styles.qaBtnPrimary]}
                onPress={(e) => { e.stopPropagation?.(); onAction('submit', contract); }}
              >
                <Text style={[styles.qaBtnText, styles.qaBtnPrimaryText]}>Gửi duyệt</Text>
              </TouchableOpacity>
            </>
          )}
          {contract.status === 'pending_approval' && (
            <TouchableOpacity style={styles.qaBtn} onPress={onPress}>
              <Text style={styles.qaBtnText}>Xem chi tiết</Text>
            </TouchableOpacity>
          )}
          {contract.status === 'rejected' && (
            <TouchableOpacity
              style={[styles.qaBtn, styles.qaBtnPrimary]}
              onPress={(e) => { e.stopPropagation?.(); onAction('edit', contract); }}
            >
              <Text style={[styles.qaBtnText, styles.qaBtnPrimaryText]}>Sửa & Gửi lại</Text>
            </TouchableOpacity>
          )}
          {contract.status === 'approved' && (
            <TouchableOpacity
              style={[styles.qaBtn, styles.qaBtnSuccess]}
              onPress={(e) => { e.stopPropagation?.(); onAction('activate', contract); }}
            >
              <Text style={[styles.qaBtnText, styles.qaBtnSuccessText]}>Kích hoạt</Text>
            </TouchableOpacity>
          )}
          {(contract.status === 'active' || contract.status === 'expiring_soon') && (
            <TouchableOpacity
              style={[styles.qaBtn, styles.qaBtnPrimary]}
              onPress={(e) => { e.stopPropagation?.(); onAction('renew', contract); }}
            >
              <Text style={[styles.qaBtnText, styles.qaBtnPrimaryText]}>Gia hạn</Text>
            </TouchableOpacity>
          )}
          {contract.status === 'expired' && (
            <TouchableOpacity
              style={[styles.qaBtn, styles.qaBtnPrimary]}
              onPress={(e) => { e.stopPropagation?.(); onAction('renew', contract); }}
            >
              <Text style={[styles.qaBtnText, styles.qaBtnPrimaryText]}>Gia hạn</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ===================== CONTRACT DETAIL VIEW =====================
const ContractDetailView: React.FC<{
  contract: Contract;
  onBack: () => void;
  onAction: (action: string, contract: Contract) => void;
}> = ({ contract, onBack, onAction }) => {
  const cfg = STATUS_CONFIG[contract.status];

  const SectionHeader = ({ title }: { title: string }) => (
    <View style={detailStyles.sectionHeader}>
      <View style={detailStyles.sectionAccent} />
      <Text style={detailStyles.sectionTitle}>{title}</Text>
    </View>
  );

  const InfoRow = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
    <View style={detailStyles.infoRow}>
      <Text style={detailStyles.infoLabel}>{label}</Text>
      <Text style={[detailStyles.infoValue, highlight && { color: Colors.primary, fontWeight: '700' }]}>{value}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* Top bar */}
      <View style={detailStyles.topBar}>
        <TouchableOpacity style={detailStyles.backBtn} onPress={onBack}>
          <Text style={detailStyles.backBtnText}>← Quay lại</Text>
        </TouchableOpacity>
        <Text style={detailStyles.topBarTitle} numberOfLines={1}>{contract.code}</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Status Banner */}
        <View style={[detailStyles.statusBanner, { backgroundColor: cfg.bg, borderColor: cfg.color + '40' }]}>
          <Text style={detailStyles.statusBannerIcon}>{cfg.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[detailStyles.statusBannerLabel, { color: cfg.color }]}>{cfg.label}</Text>
            {contract.status === 'pending_approval' && (
              <Text style={detailStyles.statusBannerSub}>Đang chờ Host/Admin xem xét</Text>
            )}
            {contract.status === 'approved' && (
              <Text style={[detailStyles.statusBannerSub, { color: Colors.info }]}>
                Duyệt bởi {contract.approvedBy} · {contract.approvedAt}
              </Text>
            )}
            {contract.status === 'expiring_soon' && (
              <Text style={[detailStyles.statusBannerSub, { color: Colors.warning }]}>
                Còn {contract.daysUntilExpiry} ngày đến ngày hết hạn
              </Text>
            )}
            {contract.status === 'expired' && (
              <Text style={[detailStyles.statusBannerSub, { color: Colors.error }]}>
                Đã hết hạn {Math.abs(contract.daysUntilExpiry || 0)} ngày
              </Text>
            )}
          </View>
        </View>

        {/* Rejection Alert */}
        {contract.status === 'rejected' && contract.rejectionReason && (
          <View style={detailStyles.rejectionAlert}>
            <Text style={detailStyles.rejectionAlertTitle}>❌ Lý do từ chối</Text>
            <Text style={detailStyles.rejectionAlertText}>{contract.rejectionReason}</Text>
            <Text style={detailStyles.rejectionAlertSub}>
              Từ chối bởi {contract.rejectedBy} · {contract.rejectedAt}
            </Text>
          </View>
        )}

        <View style={detailStyles.body}>
          {/* Contract overview */}
          <View style={detailStyles.section}>
            <SectionHeader title="Tổng quan hợp đồng" />
            <InfoRow label="Mã hợp đồng" value={contract.code} />
            <InfoRow label="Loại hợp đồng" value={contract.type === 'building_rental' ? 'Hợp đồng thuê nhà' : 'Hợp đồng thuê phòng'} />
            <InfoRow label="Ngày tạo" value={contract.createdAt} />
            {contract.submittedBy && <InfoRow label="Người lập HĐ" value={contract.submittedBy} />}
            {contract.submittedAt && <InfoRow label="Ngày gửi duyệt" value={contract.submittedAt} />}
          </View>

          {/* Tenant info */}
          <View style={detailStyles.section}>
            <SectionHeader title="Thông tin bên thuê (Bên B)" />
            <InfoRow label="Họ tên" value={contract.lesseeName} />
            <InfoRow label="CCCD/CMND" value={contract.lesseeCccd} />
            <InfoRow label="Số điện thoại" value={contract.lesseePhone} />
          </View>

          {/* Property info */}
          <View style={detailStyles.section}>
            <SectionHeader title="Tài sản cho thuê" />
            <InfoRow label="Tòa nhà/Nhà" value={contract.propertyName} />
            {contract.roomCode && <InfoRow label="Phòng" value={contract.roomCode} />}
            <InfoRow label="Bên cho thuê" value={contract.lessorName} />
          </View>

          {/* Financial */}
          <View style={detailStyles.section}>
            <SectionHeader title="Tiền thuê & Đặt cọc" />
            <View style={detailStyles.priceRow}>
              <View style={detailStyles.priceBox}>
                <Text style={detailStyles.priceLabel}>Tiền thuê/tháng</Text>
                <Text style={detailStyles.priceValue}>{fmt(contract.rentAmount)}</Text>
              </View>
              <View style={detailStyles.priceBox}>
                <Text style={detailStyles.priceLabel}>Tiền đặt cọc</Text>
                <Text style={[detailStyles.priceValue, { color: Colors.warning }]}>
                  {fmt(contract.depositAmount)}
                </Text>
              </View>
            </View>
            <InfoRow label="Ngày bắt đầu" value={contract.startDate} />
            <InfoRow label="Ngày kết thúc" value={contract.endDate} />
          </View>

          {/* Terms */}
          {contract.terms && (
            <View style={detailStyles.section}>
              <SectionHeader title="Điều khoản hợp đồng" />
              <View style={detailStyles.termsBox}>
                <Text style={detailStyles.termsText}>{contract.terms}</Text>
              </View>
            </View>
          )}

          {/* Equipment */}
          {contract.equipmentList.length > 0 && (
            <View style={detailStyles.section}>
              <SectionHeader title={`Tài sản bàn giao (${contract.equipmentList.length} món)`} />
              <View style={detailStyles.eqTable}>
                <View style={detailStyles.eqHeaderRow}>
                  <Text style={[detailStyles.eqHeaderCell, { flex: 3 }]}>Tên tài sản</Text>
                  <Text style={[detailStyles.eqHeaderCell, { flex: 1, textAlign: 'center' }]}>SL</Text>
                  <Text style={[detailStyles.eqHeaderCell, { flex: 2 }]}>Tình trạng</Text>
                </View>
                {contract.equipmentList.map(eq => (
                  <View key={eq.id} style={detailStyles.eqRow}>
                    <Text style={[detailStyles.eqCell, { flex: 3, fontWeight: '600' }]}>{eq.name}</Text>
                    <Text style={[detailStyles.eqCell, { flex: 1, textAlign: 'center' }]}>{eq.quantity}</Text>
                    <Text style={[detailStyles.eqCell, { flex: 2, color: Colors.textSecondary }]}>{eq.condition}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Approval History */}
          <View style={detailStyles.section}>
            <SectionHeader title="Lịch sử phê duyệt" />
            {contract.approvalHistory.map((entry, idx) => {
              const acfg = APPROVAL_ACTION_CONFIG[entry.action];
              const isLast = idx === contract.approvalHistory.length - 1;
              return (
                <View key={idx} style={detailStyles.timelineEntry}>
                  <View style={detailStyles.timelineLeft}>
                    <View style={[detailStyles.timelineDot, { backgroundColor: acfg.color }]} />
                    {!isLast && <View style={detailStyles.timelineLine} />}
                  </View>
                  <View style={detailStyles.timelineContent}>
                    <Text style={[detailStyles.timelineAction, { color: acfg.color }]}>{acfg.label}</Text>
                    <Text style={detailStyles.timelineBy}>{entry.by} · {entry.at}</Text>
                    {entry.note && <Text style={detailStyles.timelineNote}>{entry.note}</Text>}
                  </View>
                </View>
              );
            })}
          </View>

          {/* OTP / Signature */}
          {contract.otpVerified && (
            <View style={detailStyles.section}>
              <SectionHeader title="Xác nhận & Chữ ký" />
              <View style={detailStyles.otpBox}>
                <Text style={detailStyles.otpBoxIcon}>✅</Text>
                <View>
                  <Text style={detailStyles.otpBoxLabel}>Đã xác nhận OTP</Text>
                  <Text style={detailStyles.otpBoxSub}>Ngày ký: {contract.signedAt}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Termination info */}
          {contract.status === 'terminated' && contract.terminatedAt && (
            <View style={detailStyles.section}>
              <SectionHeader title="Thông tin thanh lý" />
              <InfoRow label="Ngày thanh lý" value={contract.terminatedAt} />
              {contract.terminationReason && (
                <InfoRow label="Lý do" value={contract.terminationReason} />
              )}
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={detailStyles.actionArea}>
          {contract.status === 'draft' && (
            <>
              <TouchableOpacity
                style={detailStyles.actionBtnPrimary}
                onPress={() => onAction('submit', contract)}
              >
                <Text style={detailStyles.actionBtnPrimaryText}>⬆️ Gửi duyệt cho Host</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={detailStyles.actionBtnSecondary}
                onPress={() => onAction('edit', contract)}
              >
                <Text style={detailStyles.actionBtnSecondaryText}>✏️ Chỉnh sửa hợp đồng</Text>
              </TouchableOpacity>
            </>
          )}
          {contract.status === 'rejected' && (
            <TouchableOpacity
              style={detailStyles.actionBtnPrimary}
              onPress={() => onAction('edit', contract)}
            >
              <Text style={detailStyles.actionBtnPrimaryText}>✏️ Sửa & Gửi lại</Text>
            </TouchableOpacity>
          )}
          {contract.status === 'approved' && (
            <TouchableOpacity
              style={detailStyles.actionBtnSuccess}
              onPress={() => onAction('activate', contract)}
            >
              <Text style={detailStyles.actionBtnPrimaryText}>🟢 Kích hoạt hợp đồng</Text>
            </TouchableOpacity>
          )}
          {(contract.status === 'active' || contract.status === 'expiring_soon') && (
            <>
              <TouchableOpacity
                style={detailStyles.actionBtnPrimary}
                onPress={() => onAction('renew', contract)}
              >
                <Text style={detailStyles.actionBtnPrimaryText}>🔄 Gia hạn hợp đồng</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={detailStyles.actionBtnDanger}
                onPress={() => onAction('terminate', contract)}
              >
                <Text style={detailStyles.actionBtnDangerText}>🔒 Thanh lý hợp đồng</Text>
              </TouchableOpacity>
            </>
          )}
          {contract.status === 'expired' && (
            <TouchableOpacity
              style={detailStyles.actionBtnPrimary}
              onPress={() => onAction('renew', contract)}
            >
              <Text style={detailStyles.actionBtnPrimaryText}>🔄 Gia hạn hợp đồng</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

// ===================== AVAILABLE PROPERTIES & ROOMS =====================
interface HostEquipment { id: string; name: string; quantity: number; condition: string }

const AVAILABLE_PROPERTIES: {
  id: string; name: string;
  rooms: { code: string; rentSuggested: number; equipment: HostEquipment[] }[]
}[] = [
  {
    id: 'prop-1',
    name: 'Nhà Nguyễn Trãi',
    rooms: [
      {
        code: 'P301', rentSuggested: 3000000,
        equipment: [
          { id: 'eq-p301-1', name: 'Điều hòa Daikin 9000BTU', quantity: 1, condition: 'Mới' },
          { id: 'eq-p301-2', name: 'Giường đôi 1m6 + Nệm', quantity: 1, condition: 'Mới' },
          { id: 'eq-p301-3', name: 'Tủ quần áo 3 cánh', quantity: 1, condition: 'Mới' },
        ],
      },
      {
        code: 'P302', rentSuggested: 3200000,
        equipment: [
          { id: 'eq-p302-1', name: 'Điều hòa Panasonic 9000BTU', quantity: 1, condition: 'Mới' },
          { id: 'eq-p302-2', name: 'Máy giặt Toshiba 8kg', quantity: 1, condition: 'Mới' },
          { id: 'eq-p302-3', name: 'Bình nước nóng 30L', quantity: 1, condition: 'Mới' },
          { id: 'eq-p302-4', name: 'Tủ lạnh mini Aqua', quantity: 1, condition: 'Mới' },
        ],
      },
      {
        code: 'P303', rentSuggested: 3200000,
        equipment: [
          { id: 'eq-p303-1', name: 'Điều hòa Casper 9000BTU', quantity: 1, condition: 'Mới' },
          { id: 'eq-p303-2', name: 'Giường đôi 1m6', quantity: 1, condition: 'Mới' },
          { id: 'eq-p303-3', name: 'Bàn học + ghế', quantity: 1, condition: 'Mới' },
        ],
      },
    ],
  },
  {
    id: 'prop-2',
    name: 'Nhà Lê Văn Sỹ',
    rooms: [
      {
        code: 'P101', rentSuggested: 3500000,
        equipment: [
          { id: 'eq-lv-p101-1', name: 'Điều hòa Daikin 12000BTU', quantity: 1, condition: 'Mới' },
          { id: 'eq-lv-p101-2', name: 'Giường đôi 1m8', quantity: 1, condition: 'Mới' },
          { id: 'eq-lv-p101-3', name: 'Bình nước nóng Ariston 30L', quantity: 1, condition: 'Mới' },
        ],
      },
      {
        code: 'P102', rentSuggested: 3500000,
        equipment: [
          { id: 'eq-lv-p102-1', name: 'Điều hòa Samsung 9000BTU', quantity: 1, condition: 'Mới' },
          { id: 'eq-lv-p102-2', name: 'Máy giặt Electrolux 7kg', quantity: 1, condition: 'Mới' },
        ],
      },
      {
        code: 'P201', rentSuggested: 3800000,
        equipment: [
          { id: 'eq-lv-p201-1', name: 'Điều hòa Casper 9000BTU', quantity: 1, condition: 'Mới' },
          { id: 'eq-lv-p201-2', name: 'Giường đôi 1m6 + Nệm', quantity: 1, condition: 'Mới' },
          { id: 'eq-lv-p201-3', name: 'Tủ quần áo 2 cánh', quantity: 1, condition: 'Mới' },
          { id: 'eq-lv-p201-4', name: 'Bàn học + ghế', quantity: 1, condition: 'Mới' },
        ],
      },
    ],
  },
];

// ===================== CREATE CONTRACT VIEW =====================
const CreateContractView: React.FC<{
  initial?: Contract | null;
  onBack: () => void;
  onSaveDraft: (form: ContractForm) => void;
  onSubmit: (form: ContractForm) => void;
}> = ({ initial, onBack, onSaveDraft, onSubmit }) => {
  const [form, setForm] = useState<ContractForm>(() =>
    initial
      ? {
          type: initial.type,
          lesseeName: initial.lesseeName,
          lesseeCccd: initial.lesseeCccd,
          lesseePhone: initial.lesseePhone,
          propertyName: initial.propertyName,
          roomCode: initial.roomCode || '',
          startDate: initial.startDate,
          endDate: initial.endDate,
          rentAmount: String(initial.rentAmount),
          depositAmount: String(initial.depositAmount),
          terms: initial.terms || DEFAULT_TERMS,
          notes: initial.notes || '',
          equipmentList: initial.equipmentList,
        }
      : { ...DEFAULT_FORM }
  );

  const [showPropertyPicker, setShowPropertyPicker] = useState(false);
  const [showRoomPicker, setShowRoomPicker] = useState(false);

  const selectedProperty = AVAILABLE_PROPERTIES.find(p => p.name === form.propertyName);
  const availableRooms = selectedProperty?.rooms ?? [];

  const set = (key: keyof ContractForm, value: any) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const validate = (): string | null => {
    if (!form.lesseeName.trim()) return 'Vui lòng nhập tên bên thuê';
    if (!form.lesseeCccd.trim()) return 'Vui lòng nhập số CCCD/CMND';
    if (!form.lesseePhone.trim()) return 'Vui lòng nhập số điện thoại';
    if (!form.propertyName.trim()) return 'Vui lòng nhập tên nhà/tòa nhà';
    if (form.type === 'room_rental' && !form.roomCode.trim()) return 'Vui lòng nhập mã phòng';
    if (!form.startDate.trim()) return 'Vui lòng nhập ngày bắt đầu';
    if (!form.endDate.trim()) return 'Vui lòng nhập ngày kết thúc';
    if (!form.rentAmount.trim()) return 'Vui lòng nhập tiền thuê';
    if (!form.depositAmount.trim()) return 'Vui lòng nhập tiền đặt cọc';
    return null;
  };

  const handleSaveDraft = () => onSaveDraft(form);

  const handleSubmit = () => {
    const err = validate();
    if (err) { Alert.alert('Thiếu thông tin', err); return; }
    Alert.alert(
      'Xác nhận gửi duyệt',
      'Hợp đồng sẽ được gửi đến Host/Admin để xem xét. Bạn không thể chỉnh sửa cho đến khi có phản hồi.',
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Gửi duyệt', onPress: () => onSubmit(form) },
      ]
    );
  };

  const SectionHeader = ({ icon, title }: { icon: string; title: string }) => (
    <View style={createStyles.sectionHeader}>
      <Text style={createStyles.sectionIcon}>{icon}</Text>
      <Text style={createStyles.sectionTitle}>{title}</Text>
    </View>
  );

  const FieldLabel = ({ label, required }: { label: string; required?: boolean }) => (
    <Text style={createStyles.fieldLabel}>
      {label}{required && <Text style={{ color: Colors.error }}> *</Text>}
    </Text>
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* Top bar */}
      <View style={createStyles.topBar}>
        <TouchableOpacity onPress={onBack}>
          <Text style={createStyles.backBtn}>← Hủy</Text>
        </TouchableOpacity>
        <Text style={createStyles.topBarTitle}>
          {initial ? 'Chỉnh sửa hợp đồng' : 'Tạo hợp đồng mới'}
        </Text>
        <TouchableOpacity onPress={handleSaveDraft}>
          <Text style={createStyles.saveDraftBtn}>Lưu nháp</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={createStyles.scroll} showsVerticalScrollIndicator={false}>
        {/* Contract type info (read-only for manager) */}
        <View style={createStyles.section}>
          <SectionHeader icon="📋" title="Loại hợp đồng" />
          <View style={[createStyles.typeBtn, createStyles.typeBtnActive, { opacity: 1 }]}>
            <Text style={createStyles.typeBtnIcon}>🚪</Text>
            <View style={{ flex: 1 }}>
              <Text style={[createStyles.typeBtnLabel, createStyles.typeBtnLabelActive]}>
                Hợp đồng thuê phòng
              </Text>
              <Text style={[createStyles.typeBtnSub, { color: Colors.primary }]}>
                Manager → Khách thuê
              </Text>
            </View>
            <Text style={{ fontSize: 16 }}>✓</Text>
          </View>
        </View>

        {/* Tenant info */}
        <View style={createStyles.section}>
          <SectionHeader icon="👤" title="Thông tin bên thuê" />
          <FieldLabel label="Họ tên đầy đủ" required />
          <TextInput
            style={createStyles.input}
            placeholder="Ví dụ: Nguyễn Văn An"
            placeholderTextColor={Colors.textMuted}
            value={form.lesseeName}
            onChangeText={v => set('lesseeName', v)}
          />
          <FieldLabel label="Số CCCD/CMND" required />
          <TextInput
            style={createStyles.input}
            placeholder="12 chữ số"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numeric"
            maxLength={12}
            value={form.lesseeCccd}
            onChangeText={v => set('lesseeCccd', v)}
          />
          <FieldLabel label="Số điện thoại" required />
          <TextInput
            style={createStyles.input}
            placeholder="0901234567"
            placeholderTextColor={Colors.textMuted}
            keyboardType="phone-pad"
            value={form.lesseePhone}
            onChangeText={v => set('lesseePhone', v)}
          />
          <TouchableOpacity style={createStyles.uploadBtn}>
            <Text style={createStyles.uploadBtnText}>📎 Tải ảnh CCCD/CMND (tuỳ chọn)</Text>
          </TouchableOpacity>
        </View>

        {/* Property / Room */}
        <View style={createStyles.section}>
          <SectionHeader icon="🏠" title="Tài sản cho thuê" />
          <FieldLabel label="Tên nhà/tòa nhà" required />
          <TouchableOpacity
            style={[createStyles.input, createStyles.dropdownBtn]}
            onPress={() => { setShowPropertyPicker(v => !v); setShowRoomPicker(false); }}
          >
            <Text style={form.propertyName ? createStyles.dropdownVal : createStyles.dropdownPlaceholder}>
              {form.propertyName || 'Chọn nhà/tòa nhà...'}
            </Text>
            <Text style={createStyles.dropdownArrow}>{showPropertyPicker ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {showPropertyPicker && (
            <View style={createStyles.dropdownList}>
              {AVAILABLE_PROPERTIES.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[createStyles.dropdownItem, form.propertyName === p.name && createStyles.dropdownItemActive]}
                  onPress={() => {
                    set('propertyName', p.name);
                    set('roomCode', '');
                    setShowPropertyPicker(false);
                  }}
                >
                  <Text style={[createStyles.dropdownItemText, form.propertyName === p.name && { color: Colors.primary, fontWeight: '700' }]}>
                    🏠 {p.name}
                  </Text>
                  <Text style={createStyles.dropdownItemSub}>{p.rooms.length} phòng trống</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {form.type === 'room_rental' && (
            <>
              <FieldLabel label="Phòng trống" required />
              <TouchableOpacity
                style={[createStyles.input, createStyles.dropdownBtn, !selectedProperty && createStyles.dropdownDisabled]}
                onPress={() => { if (selectedProperty) { setShowRoomPicker(v => !v); setShowPropertyPicker(false); } }}
              >
                <Text style={form.roomCode ? createStyles.dropdownVal : createStyles.dropdownPlaceholder}>
                  {form.roomCode || (selectedProperty ? 'Chọn phòng...' : 'Chọn nhà trước')}
                </Text>
                <Text style={createStyles.dropdownArrow}>{showRoomPicker ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {showRoomPicker && availableRooms.length > 0 && (
                <View style={createStyles.dropdownList}>
                  {availableRooms.map(r => (
                    <TouchableOpacity
                      key={r.code}
                      style={[createStyles.dropdownItem, form.roomCode === r.code && createStyles.dropdownItemActive]}
                      onPress={() => {
                        set('roomCode', r.code);
                        if (!form.rentAmount) set('rentAmount', String(r.rentSuggested));
                        set('equipmentList', r.equipment.map(e => ({ id: e.id, name: e.name, quantity: e.quantity, condition: e.condition })));
                        setShowRoomPicker(false);
                      }}
                    >
                      <Text style={[createStyles.dropdownItemText, form.roomCode === r.code && { color: Colors.primary, fontWeight: '700' }]}>
                        🚪 {r.code}
                      </Text>
                      <Text style={createStyles.dropdownItemSub}>Gợi ý: {fmt(r.rentSuggested)}/tháng</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}
        </View>

        {/* Financial */}
        <View style={createStyles.section}>
          <SectionHeader icon="💰" title="Tiền thuê & Đặt cọc" />
          <FieldLabel label="Tiền thuê hàng tháng (VNĐ)" required />
          <TextInput
            style={createStyles.input}
            placeholder="Ví dụ: 3500000"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numeric"
            value={form.rentAmount}
            onChangeText={v => set('rentAmount', v)}
          />
          {form.rentAmount !== '' && !isNaN(Number(form.rentAmount)) && (
            <Text style={createStyles.formatHint}>{fmt(Number(form.rentAmount))}/tháng</Text>
          )}
          <FieldLabel label="Tiền đặt cọc (VNĐ)" required />
          <TextInput
            style={createStyles.input}
            placeholder="Ví dụ: 7000000"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numeric"
            value={form.depositAmount}
            onChangeText={v => set('depositAmount', v)}
          />
          {form.depositAmount !== '' && !isNaN(Number(form.depositAmount)) && (
            <Text style={createStyles.formatHint}>{fmt(Number(form.depositAmount))}</Text>
          )}
        </View>

        {/* Dates */}
        <View style={createStyles.section}>
          <SectionHeader icon="📅" title="Thời hạn hợp đồng" />

          {/* Quick duration shortcuts */}
          <View style={createStyles.durationRow}>
            {[
              { label: '1 năm',   months: 12 },
              { label: '2 năm',   months: 24 },
              { label: '3 năm',   months: 36 },
            ].map(opt => {
              const isActive = (() => {
                if (!form.startDate || !form.endDate) return false;
                const [ds, ms, ys] = form.startDate.split('/').map(Number);
                const [de, me, ye] = form.endDate.split('/').map(Number);
                if (!ds || !ms || !ys || !de || !me || !ye) return false;
                const start = new Date(ys, ms - 1, ds);
                const expected = new Date(ys, ms - 1 + opt.months, ds);
                const end = new Date(ye, me - 1, de);
                return expected.getTime() === end.getTime();
              })();
              return (
                <TouchableOpacity
                  key={opt.label}
                  style={[createStyles.durationChip, isActive && createStyles.durationChipActive]}
                  onPress={() => {
                    const base = form.startDate || (() => {
                      const t = new Date();
                      return `${String(t.getDate()).padStart(2,'0')}/${String(t.getMonth()+1).padStart(2,'0')}/${t.getFullYear()}`;
                    })();
                    const [d, m, y] = base.split('/').map(Number);
                    if (!d || !m || !y) return;
                    if (!form.startDate) set('startDate', base);
                    const end = new Date(y, m - 1 + opt.months, d);
                    const ed = `${String(end.getDate()).padStart(2,'0')}/${String(end.getMonth()+1).padStart(2,'0')}/${end.getFullYear()}`;
                    set('endDate', ed);
                  }}
                >
                  <Text style={[createStyles.durationChipText, isActive && createStyles.durationChipTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={createStyles.dateRow}>
            <View style={{ flex: 1 }}>
              <FieldLabel label="Ngày bắt đầu" required />
              <DatePickerField
                value={form.startDate}
                onChange={v => {
                  set('startDate', v);
                  // Recalculate end date if a duration was active
                  if (form.endDate) {
                    const [ds, ms, ys] = v.split('/').map(Number);
                    const [de, me, ye] = form.endDate.split('/').map(Number);
                    if (ds && ms && ys && de && me && ye) {
                      const totalMonths = (ye - ys) * 12 + (me - ms);
                      if ([6, 12, 24, 36].includes(totalMonths)) {
                        const end = new Date(ys, ms - 1 + totalMonths, ds);
                        set('endDate', `${String(end.getDate()).padStart(2,'0')}/${String(end.getMonth()+1).padStart(2,'0')}/${end.getFullYear()}`);
                      }
                    }
                  }
                }}
              />
            </View>
            <View style={createStyles.dateSep}>
              <Text style={createStyles.dateSepText}>→</Text>
            </View>
            <View style={{ flex: 1 }}>
              <FieldLabel label="Ngày kết thúc" required />
              <DatePickerField
                value={form.endDate}
                onChange={v => set('endDate', v)}
              />
            </View>
          </View>
        </View>

        {/* Terms */}
        <View style={createStyles.section}>
          <SectionHeader icon="📜" title="Điều khoản hợp đồng" />
          <TextInput
            style={[createStyles.input, createStyles.textArea]}
            placeholder="Nhập các điều khoản..."
            placeholderTextColor={Colors.textMuted}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            value={form.terms}
            onChangeText={v => set('terms', v)}
          />
        </View>

        {/* Equipment */}
        <View style={createStyles.section}>
          <View style={createStyles.sectionHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={createStyles.sectionIcon}>🛠️</Text>
              <Text style={createStyles.sectionTitle}>Tài sản bàn giao</Text>
            </View>
            <View style={createStyles.hostBadge}>
              <Text style={createStyles.hostBadgeText}>📋 Từ Host</Text>
            </View>
          </View>

          {form.equipmentList.length === 0 ? (
            <View style={createStyles.emptyEqBox}>
              <Text style={createStyles.emptyEqText}>
                {form.roomCode
                  ? 'Phòng này chưa có thiết bị được thiết lập.'
                  : 'Chọn phòng để hiển thị tài sản bàn giao do Host thiết lập.'}
              </Text>
            </View>
          ) : (
            <>
              {form.equipmentList.map((eq, i) => (
                <View key={eq.id} style={[createStyles.eqItem, i === form.equipmentList.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={createStyles.eqItemIcon}>
                    <Text style={{ fontSize: 16 }}>⚙️</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={createStyles.eqItemName}>{eq.name}</Text>
                    <Text style={createStyles.eqItemSub}>SL: {eq.quantity} · {eq.condition}</Text>
                  </View>
                  <View style={createStyles.eqConditionBadge}>
                    <Text style={createStyles.eqConditionText}>{eq.condition}</Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </View>

        {/* Notes */}
        <View style={createStyles.section}>
          <SectionHeader icon="📝" title="Ghi chú (tuỳ chọn)" />
          <TextInput
            style={[createStyles.input, { minHeight: 80, textAlignVertical: 'top' }]}
            placeholder="Ghi chú thêm về hợp đồng..."
            placeholderTextColor={Colors.textMuted}
            multiline
            value={form.notes}
            onChangeText={v => set('notes', v)}
          />
        </View>

        <View style={{ height: 160 }} />
      </ScrollView>

      {/* Sticky footer actions */}
      <View style={createStyles.footer}>
        <TouchableOpacity style={createStyles.footerDraftBtn} onPress={handleSaveDraft}>
          <Text style={createStyles.footerDraftBtnText}>💾 Lưu nháp</Text>
        </TouchableOpacity>
        <TouchableOpacity style={createStyles.footerSubmitBtn} onPress={handleSubmit}>
          <Text style={createStyles.footerSubmitBtnText}>⬆️ Gửi duyệt Host</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

// ===================== PROPS =====================
interface Props {
  navigation?: any;
  route?: any;
  filterRole?: 'manager' | 'tenant';
  filterType?: 'building_rental' | 'room_rental';
}

// ===================== MAIN =====================
export const ContractListScreen: React.FC<Props> = ({ filterRole, filterType }) => {
  const navigation = useNavigation<any>();
  type ViewMode = 'list' | 'detail' | 'create';
  type ContractSection = 'tenant' | 'host';
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [contracts, setContracts] = useState<Contract[]>(MOCK_CONTRACTS);
  const [hostContracts] = useState<Contract[]>(MOCK_HOST_CONTRACTS);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | ContractStatus>('all');
  const [activeSection, setActiveSection] = useState<ContractSection>('tenant');

  const isManager = !filterRole || filterRole === 'manager';

  const displayContracts = useMemo(() => {
    if (isManager) {
      return activeSection === 'tenant' ? contracts : hostContracts;
    }
    let list = contracts;
    if (filterType) list = list.filter(c => c.type === filterType);
    if (filterRole === 'tenant') list = list.filter(c => c.type === 'room_rental');
    return list;
  }, [contracts, hostContracts, filterRole, filterType, activeSection, isManager]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return displayContracts;
    return displayContracts.filter(c => c.status === statusFilter);
  }, [displayContracts, statusFilter]);

  const stats = useMemo(() => ({
    total: displayContracts.length,
    draft: displayContracts.filter(c => c.status === 'draft').length,
    pending: displayContracts.filter(c => c.status === 'pending_approval').length,
    approved: displayContracts.filter(c => c.status === 'approved').length,
    active: displayContracts.filter(c => c.status === 'active' || c.status === 'expiring_soon').length,
    rejected: displayContracts.filter(c => c.status === 'rejected').length,
    expired: displayContracts.filter(c => c.status === 'expired').length,
  }), [displayContracts]);

  const handleAction = (action: string, contract: Contract) => {
    switch (action) {
      case 'edit':
        setEditingContract(contract);
        setViewMode('create');
        break;

      case 'submit':
        Alert.alert(
          'Gửi duyệt hợp đồng',
          `Gửi hợp đồng ${contract.code} đến Host/Admin để xem xét phê duyệt?`,
          [
            { text: 'Hủy', style: 'cancel' },
            {
              text: 'Gửi duyệt',
              onPress: () => {
                const now = new Date().toLocaleDateString('vi-VN');
                setContracts(prev => prev.map(c =>
                  c.id === contract.id
                    ? {
                        ...c,
                        status: 'pending_approval',
                        submittedBy: 'Nguyễn Văn Quản',
                        submittedAt: now,
                        approvalHistory: [
                          ...c.approvalHistory,
                          { action: 'submitted', by: 'Nguyễn Văn Quản', at: now, note: 'Gửi duyệt lần đầu' },
                        ],
                        updatedAt: now,
                      }
                    : c
                ));
                setSelectedContract(null);
                setViewMode('list');
                Alert.alert('✅ Đã gửi duyệt!', 'Hợp đồng đã được gửi đến Host/Admin. Bạn sẽ nhận thông báo khi có phản hồi.');
              },
            },
          ]
        );
        break;

      case 'activate':
        Alert.alert(
          'Kích hoạt hợp đồng',
          `Kích hoạt hợp đồng ${contract.code}?\nOTP xác nhận sẽ được gửi đến ${contract.lesseePhone}.`,
          [
            { text: 'Hủy', style: 'cancel' },
            {
              text: 'Kích hoạt',
              onPress: () => {
                const now = new Date().toLocaleDateString('vi-VN');
                setContracts(prev => prev.map(c =>
                  c.id === contract.id
                    ? {
                        ...c,
                        status: 'active',
                        otpVerified: true,
                        signedAt: now,
                        daysUntilExpiry: 365,
                        approvalHistory: [
                          ...c.approvalHistory,
                          { action: 'activated', by: 'Nguyễn Văn Quản', at: now, note: 'Đã xác nhận OTP, hợp đồng có hiệu lực' },
                        ],
                        updatedAt: now,
                      }
                    : c
                ));
                setSelectedContract(null);
                setViewMode('list');
                Alert.alert('🟢 Hợp đồng đang hiệu lực!', `Hợp đồng ${contract.code} đã được kích hoạt thành công.`);
              },
            },
          ]
        );
        break;

      case 'renew':
        Alert.alert(
          'Gia hạn hợp đồng',
          `Gia hạn hợp đồng ${contract.code} thêm 12 tháng?`,
          [
            { text: 'Hủy', style: 'cancel' },
            {
              text: 'Gia hạn',
              onPress: () => {
                const now = new Date().toLocaleDateString('vi-VN');
                setContracts(prev => prev.map(c =>
                  c.id === contract.id
                    ? {
                        ...c,
                        status: 'active',
                        endDate: '16/05/2027',
                        daysUntilExpiry: 365,
                        approvalHistory: [
                          ...c.approvalHistory,
                          { action: 'renewed', by: 'Nguyễn Văn Quản', at: now, note: 'Gia hạn thêm 12 tháng' },
                        ],
                        updatedAt: now,
                      }
                    : c
                ));
                setSelectedContract(null);
                setViewMode('list');
                Alert.alert('✅ Đã gia hạn!', `Hợp đồng ${contract.code} được gia hạn đến 16/05/2027.`);
              },
            },
          ]
        );
        break;

      case 'terminate':
        Alert.alert(
          'Thanh lý hợp đồng',
          `Thanh lý hợp đồng ${contract.code}?\nThao tác này không thể hoàn tác.`,
          [
            { text: 'Hủy', style: 'cancel' },
            {
              text: 'Xác nhận thanh lý',
              style: 'destructive',
              onPress: () => {
                const now = new Date().toLocaleDateString('vi-VN');
                setContracts(prev => prev.map(c =>
                  c.id === contract.id
                    ? {
                        ...c,
                        status: 'terminated',
                        terminatedAt: now,
                        approvalHistory: [
                          ...c.approvalHistory,
                          { action: 'terminated', by: 'Nguyễn Văn Quản', at: now },
                        ],
                        updatedAt: now,
                      }
                    : c
                ));
                setSelectedContract(null);
                setViewMode('list');
                Alert.alert('✅ Đã thanh lý!', `Hợp đồng ${contract.code} đã được thanh lý.`);
              },
            },
          ]
        );
        break;
    }
  };

  const handleSaveDraft = (form: ContractForm) => {
    const now = new Date().toLocaleDateString('vi-VN');
    if (editingContract) {
      setContracts(prev => prev.map(c =>
        c.id === editingContract.id
          ? {
              ...c,
              type: form.type,
              lesseeName: form.lesseeName,
              lesseeCccd: form.lesseeCccd,
              lesseePhone: form.lesseePhone,
              propertyName: form.propertyName,
              roomCode: form.roomCode || undefined,
              startDate: form.startDate,
              endDate: form.endDate,
              rentAmount: Number(form.rentAmount) || 0,
              depositAmount: Number(form.depositAmount) || 0,
              terms: form.terms,
              notes: form.notes,
              equipmentList: form.equipmentList,
              status: 'draft',
              updatedAt: now,
            }
          : c
      ));
    } else {
      const newContract: Contract = {
        id: `c-new-${Date.now()}`,
        code: `HD-MT-2026-${String(contracts.length + 1).padStart(3, '0')}`,
        type: form.type,
        lessorName: 'Nguyễn Văn Quản',
        lesseeName: form.lesseeName,
        lesseeCccd: form.lesseeCccd,
        lesseePhone: form.lesseePhone,
        propertyName: form.propertyName,
        roomCode: form.type === 'room_rental' ? form.roomCode : undefined,
        startDate: form.startDate,
        endDate: form.endDate,
        rentAmount: Number(form.rentAmount) || 0,
        depositAmount: Number(form.depositAmount) || 0,
        status: 'draft',
        equipmentList: form.equipmentList,
        terms: form.terms,
        notes: form.notes,
        approvalHistory: [{ action: 'created', by: 'Nguyễn Văn Quản', at: now }],
        createdAt: now,
        updatedAt: now,
      };
      setContracts(prev => [newContract, ...prev]);
    }
    setEditingContract(null);
    setViewMode('list');
    Alert.alert('💾 Đã lưu nháp', 'Hợp đồng đã được lưu vào danh sách nháp.');
  };

  const handleSubmitNew = (form: ContractForm) => {
    const now = new Date().toLocaleDateString('vi-VN');
    const newContract: Contract = {
      id: `c-new-${Date.now()}`,
      code: `HD-MT-2026-${String(contracts.length + 1).padStart(3, '0')}`,
      type: form.type,
      lessorName: 'Nguyễn Văn Quản',
      lesseeName: form.lesseeName,
      lesseeCccd: form.lesseeCccd,
      lesseePhone: form.lesseePhone,
      propertyName: form.propertyName,
      roomCode: form.type === 'room_rental' ? form.roomCode : undefined,
      startDate: form.startDate,
      endDate: form.endDate,
      rentAmount: Number(form.rentAmount) || 0,
      depositAmount: Number(form.depositAmount) || 0,
      status: 'pending_approval',
      submittedBy: 'Nguyễn Văn Quản',
      submittedAt: now,
      equipmentList: form.equipmentList,
      terms: form.terms,
      notes: form.notes,
      approvalHistory: [
        { action: 'created', by: 'Nguyễn Văn Quản', at: now },
        { action: 'submitted', by: 'Nguyễn Văn Quản', at: now },
      ],
      createdAt: now,
      updatedAt: now,
    };
    setContracts(prev => [newContract, ...prev]);
    setEditingContract(null);
    setViewMode('list');
    Alert.alert('✅ Đã gửi duyệt!', 'Hợp đồng đã được gửi đến Host/Admin để xem xét.');
  };

  // Render create view
  if (viewMode === 'create') {
    return (
      <CreateContractView
        initial={editingContract}
        onBack={() => { setEditingContract(null); setViewMode('list'); }}
        onSaveDraft={handleSaveDraft}
        onSubmit={handleSubmitNew}
      />
    );
  }

  // Render detail view
  if (viewMode === 'detail' && selectedContract) {
    return (
      <ContractDetailView
        contract={selectedContract}
        onBack={() => { setSelectedContract(null); setViewMode('list'); }}
        onAction={handleAction}
      />
    );
  }

  // Render list view
  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.listHeader}>
        <View style={styles.listHeaderLeft}>
          {navigation.canGoBack() && (
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.backBtnText}>‹</Text>
            </TouchableOpacity>
          )}
          <View>
            <Text style={styles.listTitle}>Hợp đồng</Text>
            <Text style={styles.listSubtitle}>{displayContracts.length} hợp đồng</Text>
          </View>
        </View>
        {isManager && activeSection === 'tenant' && (
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => { setEditingContract(null); setViewMode('create'); }}
          >
            <Text style={styles.createBtnText}>+ Tạo HĐ</Text>
          </TouchableOpacity>
        )}
        {(!isManager) && (
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => { setEditingContract(null); setViewMode('create'); }}
          >
            <Text style={styles.createBtnText}>+ Tạo HĐ</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Manager section tabs */}
      {isManager && (
        <View style={styles.sectionTabRow}>
          <TouchableOpacity
            style={[styles.sectionTab, activeSection === 'tenant' && styles.sectionTabActive]}
            onPress={() => { setActiveSection('tenant'); setStatusFilter('all'); }}
          >
            <Text style={[styles.sectionTabText, activeSection === 'tenant' && styles.sectionTabTextActive]}>
              🚪 Với khách thuê
            </Text>
            <View style={[styles.sectionTabBadge, activeSection === 'tenant' && styles.sectionTabBadgeActive]}>
              <Text style={[styles.sectionTabBadgeText, activeSection === 'tenant' && styles.sectionTabBadgeTextActive]}>
                {contracts.length}
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sectionTab, activeSection === 'host' && styles.sectionTabActive]}
            onPress={() => { setActiveSection('host'); setStatusFilter('all'); }}
          >
            <Text style={[styles.sectionTabText, activeSection === 'host' && styles.sectionTabTextActive]}>
              🏢 Với Host/Admin
            </Text>
            <View style={[styles.sectionTabBadge, activeSection === 'host' && styles.sectionTabBadgeActive]}>
              <Text style={[styles.sectionTabBadgeText, activeSection === 'host' && styles.sectionTabBadgeTextActive]}>
                {hostContracts.length}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* Stats row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.statsScroll} contentContainerStyle={styles.statsContent}>
        <View style={[styles.statCard, { borderTopColor: Colors.success }]}>
          <Text style={[styles.statNum, { color: Colors.success }]}>{stats.active}</Text>
          <Text style={styles.statLabel}>Hiệu lực</Text>
        </View>
        {stats.pending > 0 && (
          <View style={[styles.statCard, { borderTopColor: Colors.warning }]}>
            <Text style={[styles.statNum, { color: Colors.warning }]}>{stats.pending}</Text>
            <Text style={styles.statLabel}>Chờ duyệt</Text>
          </View>
        )}
        {stats.approved > 0 && (
          <View style={[styles.statCard, { borderTopColor: Colors.info }]}>
            <Text style={[styles.statNum, { color: Colors.info }]}>{stats.approved}</Text>
            <Text style={styles.statLabel}>Đã duyệt</Text>
          </View>
        )}
        {stats.draft > 0 && (
          <View style={[styles.statCard, { borderTopColor: Colors.textMuted }]}>
            <Text style={[styles.statNum, { color: Colors.textMuted }]}>{stats.draft}</Text>
            <Text style={styles.statLabel}>Nháp</Text>
          </View>
        )}
        {stats.rejected > 0 && (
          <View style={[styles.statCard, { borderTopColor: Colors.error }]}>
            <Text style={[styles.statNum, { color: Colors.error }]}>{stats.rejected}</Text>
            <Text style={styles.statLabel}>Bị từ chối</Text>
          </View>
        )}
        {stats.expired > 0 && (
          <View style={[styles.statCard, { borderTopColor: Colors.error }]}>
            <Text style={[styles.statNum, { color: Colors.error }]}>{stats.expired}</Text>
            <Text style={styles.statLabel}>Đã hết hạn</Text>
          </View>
        )}
      </ScrollView>

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.filterRow} contentContainerStyle={styles.filterContent}>
        {FILTER_TABS.map(tab => {
          const count = tab.key === 'all'
            ? displayContracts.length
            : displayContracts.filter(c => c.status === tab.key).length;
          if (tab.key !== 'all' && count === 0) return null;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.filterChip, statusFilter === tab.key && styles.filterChipActive]}
              onPress={() => setStatusFilter(tab.key)}
            >
              <Text style={[styles.filterText, statusFilter === tab.key && styles.filterTextActive]}>
                {tab.label} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Contract list */}
      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        renderItem={({ item }) => (
          <ContractCard
            contract={item}
            onPress={() => { setSelectedContract(item); setViewMode('detail'); }}
            onAction={handleAction}
          />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>Chưa có hợp đồng</Text>
            {isManager && activeSection === 'host' ? (
              <Text style={styles.emptyDesc}>Hợp đồng thuê nhà từ Host/Admin sẽ hiển thị tại đây.</Text>
            ) : (
              <>
                <Text style={styles.emptyDesc}>Nhấn "+ Tạo HĐ" để tạo hợp đồng với khách thuê.</Text>
                <TouchableOpacity
                  style={styles.emptyCreateBtn}
                  onPress={() => { setEditingContract(null); setViewMode('create'); }}
                >
                  <Text style={styles.emptyCreateBtnText}>+ Tạo hợp đồng</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
};

// ===================== STYLES =====================
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  listHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing.sm,
  },
  listHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 28, color: Colors.textPrimary, lineHeight: 32 },
  listTitle: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  listSubtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  createBtn: {
    backgroundColor: Colors.primary, paddingHorizontal: Spacing.md,
    paddingVertical: 10, borderRadius: BorderRadius.lg, ...Shadow.sm,
  },
  createBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },

statsScroll: {
  flexGrow: 0,
  marginBottom: Spacing.sm,
},
statsContent: {
  paddingHorizontal: Spacing.lg,
  paddingVertical: 4,
  alignItems: 'center',
},
statCard: {
  backgroundColor: Colors.white,
  borderRadius: BorderRadius.lg,
  paddingVertical: Spacing.sm,
  paddingHorizontal: Spacing.md,
  borderTopWidth: 3,
  ...Shadow.sm,
  minWidth: 78,
  alignItems: 'center',
  marginRight: Spacing.md,
},
  statNum: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  statLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 2, textAlign: 'center' },

filterRow: {
  flexGrow: 0,
  marginTop: Spacing.xs,
  marginBottom: Spacing.sm,
},
filterContent: {
  paddingHorizontal: Spacing.lg,
  paddingVertical: 4,
  alignItems: 'center',
},
  filterChip: {
    height: 34, justifyContent: 'center', paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border, marginRight: Spacing.sm,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },

listContent: {
  paddingHorizontal: Spacing.lg,
  paddingTop: Spacing.sm,
  paddingBottom: 100,
},

  // Contract card
  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, ...Shadow.sm, overflow: 'hidden',
  },
  cardUrgent: { borderWidth: 1.5, borderColor: Colors.error },

  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.base, borderBottomWidth: 1, borderColor: Colors.divider,
  },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 },
  cardCode: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  cardTypeBadge: { backgroundColor: Colors.primaryBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  cardTypeText: { fontSize: 11, fontWeight: '600', color: Colors.primary },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: BorderRadius.full,
  },
  statusIcon: { fontSize: 11 },
  statusText: { fontSize: 11, fontWeight: '700' },

  cardBody: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  infoLabel: { fontSize: 12, color: Colors.textSecondary },
  infoValue: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary, textAlign: 'right', flex: 1, marginLeft: 8 },

  rejectionBanner: { backgroundColor: Colors.errorLight, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm },
  rejectionBannerText: { fontSize: 12, color: Colors.error, fontWeight: '600' },
  expiryBanner: { backgroundColor: Colors.warningLight, paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm },
  expiryBannerText: { fontSize: 12, color: Colors.warning, fontWeight: '700' },

  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    backgroundColor: Colors.divider, borderTopWidth: 1, borderColor: Colors.border,
  },
  cardDate: { fontSize: 11, color: Colors.textSecondary },
  quickActions: { flexDirection: 'row', gap: 6 },
  qaBtn: {
    height: 28, justifyContent: 'center', paddingHorizontal: 10,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  qaBtnPrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  qaBtnSuccess: { backgroundColor: Colors.success, borderColor: Colors.success },
  qaBtnText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  qaBtnPrimaryText: { color: Colors.white },
  qaBtnSuccessText: { color: Colors.white },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 80, paddingBottom: 40 },
  emptyIcon: { fontSize: 56, marginBottom: Spacing.md },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.xs },
  emptyDesc: { fontSize: 14, color: Colors.textSecondary, marginBottom: Spacing.xl, textAlign: 'center' },
  emptyCreateBtn: {
    backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg, ...Shadow.md,
  },
  emptyCreateBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },

  // Section tabs (manager: tenant vs host)
  sectionTabRow: {
    flexDirection: 'row', marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: 4,
    ...Shadow.sm,
  },
  sectionTab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: BorderRadius.md, gap: 6,
  },
  sectionTabActive: { backgroundColor: Colors.primary },
  sectionTabText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  sectionTabTextActive: { color: Colors.white },
  sectionTabBadge: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.full,
    minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  sectionTabBadgeActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  sectionTabBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  sectionTabBadgeTextActive: { color: Colors.white },
});

// ===================== DETAIL STYLES =====================
const detailStyles = StyleSheet.create({
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.white,
  },
  backBtn: { width: 80 },
  backBtnText: { color: Colors.primary, fontWeight: '600', fontSize: 15 },
  topBarTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, flex: 1, textAlign: 'center' },

  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    margin: Spacing.lg, padding: Spacing.base, borderRadius: BorderRadius.lg, borderWidth: 1,
  },
  statusBannerIcon: { fontSize: 28 },
  statusBannerLabel: { fontSize: 16, fontWeight: '700' },
  statusBannerSub: { fontSize: 12, marginTop: 2, color: Colors.textSecondary },

  rejectionAlert: {
    marginHorizontal: Spacing.lg, marginBottom: Spacing.sm,
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.lg,
    padding: Spacing.base, borderWidth: 1, borderColor: Colors.error + '50',
  },
  rejectionAlertTitle: { fontSize: 14, fontWeight: '700', color: Colors.error, marginBottom: 4 },
  rejectionAlertText: { fontSize: 13, color: Colors.error, lineHeight: 20 },
  rejectionAlertSub: { fontSize: 11, color: Colors.error + 'AA', marginTop: 4 },

  body: { paddingHorizontal: Spacing.lg },

  section: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md, overflow: 'hidden', ...Shadow.sm,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderColor: Colors.divider, backgroundColor: '#FAFBFC',
  },
  sectionAccent: { width: 4, height: 18, backgroundColor: Colors.primary, borderRadius: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: 10,
    borderBottomWidth: 1, borderColor: Colors.divider,
  },
  infoLabel: { fontSize: 13, color: Colors.textSecondary },
  infoValue: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary, textAlign: 'right', flex: 1, marginLeft: 12 },

  priceRow: { flexDirection: 'row', gap: Spacing.md, padding: Spacing.base },
  priceBox: {
    flex: 1, backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    padding: Spacing.md, alignItems: 'center',
  },
  priceLabel: { fontSize: 11, color: Colors.textSecondary },
  priceValue: { fontSize: 18, fontWeight: '800', color: Colors.primary, marginTop: 4 },

  termsBox: { padding: Spacing.base },
  termsText: { fontSize: 13, color: Colors.textPrimary, lineHeight: 22 },

  eqTable: { marginHorizontal: Spacing.base, marginBottom: Spacing.base, borderWidth: 1, borderColor: Colors.divider, borderRadius: BorderRadius.md, overflow: 'hidden' },
  eqHeaderRow: { flexDirection: 'row', backgroundColor: Colors.background, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md },
  eqHeaderCell: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase' },
  eqRow: { flexDirection: 'row', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderTopWidth: 1, borderColor: Colors.divider },
  eqCell: { fontSize: 13, color: Colors.textPrimary },

  // Approval history timeline
  timelineEntry: { flexDirection: 'row', paddingHorizontal: Spacing.base, paddingTop: Spacing.md },
  timelineLeft: { width: 24, alignItems: 'center' },
  timelineDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  timelineLine: { width: 2, flex: 1, backgroundColor: Colors.divider, marginTop: 4, marginBottom: -4 },
  timelineContent: { flex: 1, paddingLeft: Spacing.sm, paddingBottom: Spacing.md },
  timelineAction: { fontSize: 13, fontWeight: '700' },
  timelineBy: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  timelineNote: {
    fontSize: 12, color: Colors.textPrimary, marginTop: 4,
    backgroundColor: Colors.background, padding: Spacing.sm, borderRadius: BorderRadius.md,
    lineHeight: 18,
  },

  otpBox: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    margin: Spacing.base, padding: Spacing.base,
    backgroundColor: Colors.successLight, borderRadius: BorderRadius.md,
  },
  otpBoxIcon: { fontSize: 24 },
  otpBoxLabel: { fontSize: 14, fontWeight: '700', color: Colors.success },
  otpBoxSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },

  actionArea: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, gap: Spacing.md },
  actionBtnPrimary: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', ...Shadow.md,
  },
  actionBtnSuccess: {
    backgroundColor: Colors.success, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', ...Shadow.md,
  },
  actionBtnSecondary: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.primary,
  },
  actionBtnDanger: {
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.error,
  },
  actionBtnPrimaryText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  actionBtnSecondaryText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  actionBtnDangerText: { fontSize: 15, fontWeight: '700', color: Colors.error },
});

// ===================== CREATE STYLES =====================
const createStyles = StyleSheet.create({
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.white,
  },
  backBtn: { color: Colors.error, fontWeight: '600', fontSize: 15, width: 48 },
  topBarTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  saveDraftBtn: { color: Colors.primary, fontWeight: '700', fontSize: 14, width: 72, textAlign: 'right' },

  scroll: { flex: 1 },

  section: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    margin: Spacing.lg, marginBottom: 0, padding: Spacing.lg, ...Shadow.sm,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.md },
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: Spacing.md,
  },
  sectionIcon: { fontSize: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },

  typeRow: { flexDirection: 'row', gap: Spacing.md },
  typeBtn: {
    flex: 1, padding: Spacing.md, borderRadius: BorderRadius.lg,
    borderWidth: 2, borderColor: Colors.border, alignItems: 'center',
    backgroundColor: Colors.background,
  },
  typeBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  typeBtnIcon: { fontSize: 28, marginBottom: 6 },
  typeBtnLabel: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  typeBtnLabelActive: { color: Colors.primary },
  typeBtnSub: { fontSize: 11, color: Colors.textMuted, marginTop: 3, textAlign: 'center' },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 5, marginTop: 10 },

  input: {
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 12,
    fontSize: 14, color: Colors.textPrimary,
  },
  dropdownBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dropdownPlaceholder: { fontSize: 14, color: Colors.textMuted, flex: 1 },
  dropdownVal: { fontSize: 14, color: Colors.textPrimary, fontWeight: '500', flex: 1 },
  dropdownArrow: { fontSize: 11, color: Colors.textMuted, marginLeft: Spacing.sm },
  dropdownDisabled: { opacity: 0.5 },
  dropdownList: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    backgroundColor: Colors.white, marginBottom: Spacing.sm, overflow: 'hidden', ...Shadow.sm,
  },
  dropdownItem: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  dropdownItemActive: { backgroundColor: Colors.primaryBg },
  dropdownItemText: { fontSize: 14, color: Colors.textPrimary },
  dropdownItemSub: { fontSize: 12, color: Colors.textMuted },
  textArea: { minHeight: 120, textAlignVertical: 'top', paddingTop: Spacing.md },
  formatHint: { fontSize: 12, color: Colors.primary, fontWeight: '600', marginTop: 4 },

  durationRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  durationChip: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full,
    borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center',
    backgroundColor: Colors.white,
  },
  durationChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  durationChipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  durationChipTextActive: { color: Colors.white },

  dateRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 0 },
  dateSep: { width: 28, alignItems: 'center', paddingBottom: 14 },
  dateSepText: { color: Colors.textMuted, fontSize: 18 },

  uploadBtn: {
    marginTop: Spacing.md, borderWidth: 1.5, borderColor: Colors.border,
    borderStyle: 'dashed', borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md, alignItems: 'center',
  },
  uploadBtnText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },

  addEqBtn: {
    backgroundColor: Colors.primaryBg, paddingHorizontal: Spacing.md,
    paddingVertical: 6, borderRadius: BorderRadius.full,
  },
  addEqBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  emptyEqText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.md },

  hostBadge: { backgroundColor: Colors.primaryBg, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  hostBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.primary },
  emptyEqBox: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.base, alignItems: 'center' },
  eqItemIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.sm },
  eqConditionBadge: { backgroundColor: Colors.successLight, paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  eqConditionText: { fontSize: 10, fontWeight: '700', color: Colors.success },

  eqItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  eqItemName: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  eqItemSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  eqRemoveBtn: { fontSize: 16, color: Colors.error, paddingLeft: Spacing.sm },

  eqForm: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    marginTop: Spacing.sm,
  },
  eqFormTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  eqFormRow: { flexDirection: 'row', alignItems: 'flex-start' },
  eqFormActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  eqCancelBtn: {
    flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border, alignItems: 'center',
  },
  eqCancelBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  eqConfirmBtn: {
    flex: 2, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary, alignItems: 'center',
  },
  eqConfirmBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white },

  footer: {
    flexDirection: 'row', gap: Spacing.md,
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.base,
    backgroundColor: Colors.white, borderTopWidth: 1, borderColor: Colors.divider,
    ...Shadow.md,
  },
  footerDraftBtn: {
    flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg,
    borderWidth: 1.5, borderColor: Colors.primary, alignItems: 'center',
  },
  footerDraftBtnText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  footerSubmitBtn: {
    flex: 2, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary, alignItems: 'center', ...Shadow.sm,
  },
  footerSubmitBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
