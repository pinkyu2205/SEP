import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, FlatList,
  TextInput, Dimensions, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { DatePickerField } from '@/components/common/DatePickerField';
import { ManagedProperty } from '@/data/managedProperties';
import { managerPropertyService } from '@/services/manager/propertyService';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';
import { getContractTerminationTypeLabel } from '@/utils';
import {
  getInspectionsByContractId,
  getInspectionStatusLabel,
  getInspectionTypeLabel,
  RoomInspection,
} from '@/data/roomInspections';

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
  terminationType?: string;
  approvalHistory: ApprovalEntry[];
  createdAt: string;
  updatedAt: string;
  // ID property thật từ BE — dùng để gom HĐ theo bất động sản ở dashboard.
  _propertyId?: string;
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

// ===================== MAP API → UI =====================
// ISO (yyyy-MM-dd) -> dd/MM/yyyy. Giữ nguyên nếu không parse được.
const fmtIsoDate = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('vi-VN');
};

const daysUntil = (iso?: string): number | null =>
  iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000) : null;

// Trạng thái HĐ từ BE (status + priceApprovalStatus) -> ContractStatus của UI.
const mapApiContractStatus = (c: TenantContractResponse): ContractStatus => {
  const pa = (c.priceApprovalStatus || '').toUpperCase();
  if (pa === 'PENDING_PRICE_APPROVAL') return 'pending_approval';
  if (pa === 'PRICE_REJECTED') return 'rejected';
  if (pa === 'APPROVED_AWAITING_DEPOSIT') return 'approved';

  const s = (c.status || '').toUpperCase();
  if (s === 'TERMINATED' || s === 'CANCELLED') return 'terminated';
  if (s === 'EXPIRED') return 'expired';
  if (s === 'ACTIVE') {
    const d = daysUntil(c.endDate);
    return d != null && d >= 0 && d <= 30 ? 'expiring_soon' : 'active';
  }
  if (s === 'PENDING') return 'approved'; // đã tạo, chờ thu cọc/OTP để kích hoạt
  return 'draft';
};

// Parse biên bản thiết bị (JSON) -> danh sách tài sản bàn giao. Lỗi -> [].
const parseEquipment = (snapshot?: string): ContractEquipment[] => {
  if (!snapshot) return [];
  try {
    const parsed = JSON.parse(snapshot);
    const items = Array.isArray(parsed) ? parsed : parsed.items;
    if (!Array.isArray(items)) return [];
    return items.map((it: any, i: number) => ({
      id: String(it.equipmentId ?? i),
      name: it.name ?? 'Thiết bị',
      quantity: Number(it.quantity) || 1,
      condition: it.source === 'ADDED' ? 'Lắp thêm' : 'Sẵn có',
    }));
  } catch {
    return [];
  }
};

// 1 hợp đồng BE (TenantContractResponse) -> Contract dùng trong UI.
const mapApiToContract = (c: TenantContractResponse, propertyName: string): Contract => {
  const status = mapApiContractStatus(c);
  const d = daysUntil(c.endDate);
  return {
    id: String(c.id),
    code: c.contractCode,
    type: c.roomId ? 'room_rental' : 'building_rental',
    lessorName: '',
    lesseeName: c.tenantFullName,
    lesseeCccd: c.tenantCccd ?? '',
    lesseePhone: c.tenantPhone,
    propertyName,
    roomCode: c.roomNumber ? `P${c.roomNumber}` : undefined,
    startDate: fmtIsoDate(c.moveInDate || c.startDate),
    endDate: fmtIsoDate(c.endDate),
    depositAmount: c.deposit ?? 0,
    rentAmount: c.rentAmount ?? 0,
    status,
    equipmentList: parseEquipment(c.equipmentSnapshot),
    daysUntilExpiry: d ?? undefined,
    rejectionReason: c.priceRejectReason,
    approvalHistory: [],
    createdAt: fmtIsoDate(c.startDate),
    updatedAt: fmtIsoDate(c.startDate),
    terminatedAt: c.terminatedAt,
    terminationReason: c.terminationReason,
    terminationType: c.terminationType,
    _propertyId: String(c.propertyId),
  };
};

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
  const navigation = useNavigation<any>();
  const cfg = STATUS_CONFIG[contract.status];
  const inspections = getInspectionsByContractId(contract.id);

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

          <View style={detailStyles.section}>
            <SectionHeader title="Biên bản hiện trạng" />
            {inspections.length === 0 ? (
              <View style={detailStyles.inspectionEmpty}>
                <Text style={detailStyles.inspectionEmptyTitle}>Chưa có biên bản hiện trạng.</Text>
                <Text style={detailStyles.inspectionEmptyText}>Ảnh check-in/check-out sẽ được lưu theo hợp đồng này.</Text>
              </View>
            ) : inspections.map(inspection => (
              <ContractInspectionCard
                key={inspection.id}
                inspection={inspection}
                onPress={() => navigation.navigate('InspectionDetail', { inspectionId: inspection.id })}
              />
            ))}
          </View>

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
              <InfoRow label="Loại" value={getContractTerminationTypeLabel(contract.terminationType)} />
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

const ContractInspectionCard = ({
  inspection,
  onPress,
}: {
  inspection: RoomInspection;
  onPress: () => void;
}) => (
  <TouchableOpacity style={detailStyles.inspectionCard} onPress={onPress} activeOpacity={0.82}>
    <Text style={detailStyles.inspectionIcon}>📸</Text>
    <View style={detailStyles.inspectionBody}>
      <Text style={detailStyles.inspectionTitle}>{getInspectionTypeLabel(inspection.inspectionType)} Inspection</Text>
      <Text style={detailStyles.inspectionMeta}>
        {inspection.images.length} photos · {inspection.createdAt} · {inspection.createdBy}
      </Text>
      <Text style={detailStyles.inspectionMeta}>{getInspectionStatusLabel(inspection.status)}</Text>
      {inspection.depositDeductionAmount ? (
        <Text style={detailStyles.inspectionDeduction}>
          Deposit deduction: {inspection.depositDeductionAmount.toLocaleString('vi-VN')}đ
        </Text>
      ) : null}
    </View>
  </TouchableOpacity>
);

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
}

// ===================== MAIN (DASHBOARD) =====================
export const ContractListScreen: React.FC<Props> = () => {
  const navigation = useNavigation<any>();
  type ViewMode = 'dashboard' | 'detail' | 'create';
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const tab = 'tenant' as const; // Màn này chỉ quản lý HĐ giữa manager ↔ khách thuê.
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [managedProps, setManagedProps] = useState<ManagedProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);

  // Tải HĐ THẬT: gom hợp đồng của tất cả nhà manager phụ trách.
  const load = useCallback(async () => {
    try {
      const props = await managerPropertyService.getManagedProperties();
      setManagedProps(props);
      const lists = await Promise.all(
        props.map(async (p) => {
          const apiContracts = await realTenantService
            .listByProperty(Number(p.id))
            .catch(() => [] as TenantContractResponse[]);
          return apiContracts.map(c => mapApiToContract(c, p.name));
        }),
      );
      setContracts(lists.flat());
    } catch {
      setManagedProps([]);
      setContracts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const tenantStats = useMemo(() => ({
    total: contracts.length,
    active: contracts.filter(c => c.status === 'active').length,
    approved: contracts.filter(c => c.status === 'approved').length,
    expiring: contracts.filter(c => c.status === 'expiring_soon').length,
    pending: contracts.filter(c => c.status === 'pending_approval').length,
    draft: contracts.filter(c => c.status === 'draft').length,
    rejected: contracts.filter(c => c.status === 'rejected').length,
  }), [contracts]);

  const buildingCards = useMemo(() =>
    managedProps.map(p => ({
      prop: p,
      bContracts: contracts.filter(c => c._propertyId === p.id),
    })),
    [managedProps, contracts]
  );

  const recentActivity = useMemo(() =>
    contracts.filter(c => ['pending_approval', 'expiring_soon', 'rejected', 'draft'].includes(c.status)).slice(0, 5),
    [contracts]
  );

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
                setViewMode('dashboard');
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
                setViewMode('dashboard');
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
                setViewMode('dashboard');
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
                setViewMode('dashboard');
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
    setViewMode('dashboard');
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
    setViewMode('dashboard');
    Alert.alert('✅ Đã gửi duyệt!', 'Hợp đồng đã được gửi đến Host/Admin để xem xét.');
  };

  if (viewMode === 'create') {
    return (
      <CreateContractView
        initial={editingContract}
        onBack={() => { setEditingContract(null); setViewMode('dashboard'); }}
        onSaveDraft={handleSaveDraft}
        onSubmit={handleSubmitNew}
      />
    );
  }

  if (viewMode === 'detail' && selectedContract) {
    return (
      <ContractDetailView
        contract={selectedContract}
        onBack={() => { setSelectedContract(null); setViewMode('dashboard'); }}
        onAction={handleAction}
      />
    );
  }

  const curStats = tenantStats;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={dashStyles.header}>
        <View style={dashStyles.headerLeft}>
          {navigation.canGoBack() && (
            <TouchableOpacity style={dashStyles.backBtn} onPress={() => navigation.goBack()}>
              <Text style={dashStyles.backBtnText}>‹</Text>
            </TouchableOpacity>
          )}
          <Text style={dashStyles.headerTitle}>Hợp đồng</Text>
        </View>
        <TouchableOpacity style={dashStyles.createBtn} onPress={() => { setEditingContract(null); setViewMode('create'); }}>
          <Text style={dashStyles.createBtnText}>+ Tạo HĐ</Text>
        </TouchableOpacity>
      </View>

      {/* Tổng số HĐ với khách thuê */}
      <View style={dashStyles.tabRow}>
        <View style={[dashStyles.tabPill, dashStyles.tabPillActive]}>
          <Text style={[dashStyles.tabPillText, dashStyles.tabPillTextActive]}>
            🚪 Hợp đồng với khách thuê ({contracts.length})
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={dashStyles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Stats row */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={dashStyles.statsContent}>
          <View style={[dashStyles.statCard, { borderTopColor: Colors.success }]}>
            <Text style={[dashStyles.statNum, { color: Colors.success }]}>{curStats.active}</Text>
            <Text style={dashStyles.statLabel}>Hiệu lực</Text>
          </View>
          <View style={[dashStyles.statCard, { borderTopColor: Colors.info }]}>
            <Text style={[dashStyles.statNum, { color: Colors.info }]}>{curStats.pending}</Text>
            <Text style={dashStyles.statLabel}>Chờ duyệt</Text>
          </View>
          <View style={[dashStyles.statCard, { borderTopColor: Colors.primary }]}>
            <Text style={[dashStyles.statNum, { color: Colors.primary }]}>{curStats.approved}</Text>
            <Text style={dashStyles.statLabel}>Đã duyệt</Text>
          </View>
          <View style={[dashStyles.statCard, { borderTopColor: Colors.textMuted }]}>
            <Text style={[dashStyles.statNum, { color: Colors.textMuted }]}>{curStats.draft}</Text>
            <Text style={dashStyles.statLabel}>Nháp</Text>
          </View>
          <View style={[dashStyles.statCard, { borderTopColor: Colors.warning }]}>
            <Text style={[dashStyles.statNum, { color: Colors.warning }]}>{curStats.expiring}</Text>
            <Text style={dashStyles.statLabel}>Sắp hết hạn</Text>
          </View>
          <View style={[dashStyles.statCard, { borderTopColor: Colors.error }]}>
            <Text style={[dashStyles.statNum, { color: Colors.error }]}>{curStats.rejected}</Text>
            <Text style={dashStyles.statLabel}>Bị từ chối</Text>
          </View>
        </ScrollView>

        {/* Alert banner */}
        {(tenantStats.expiring > 0 || tenantStats.pending > 0 || tenantStats.rejected > 0) && (
          <View style={dashStyles.alertBanner}>
            <Text style={dashStyles.alertText}>
              {[
                tenantStats.expiring > 0 && `${tenantStats.expiring} sắp hết hạn`,
                tenantStats.pending > 0 && `${tenantStats.pending} chờ duyệt`,
                tenantStats.rejected > 0 && `${tenantStats.rejected} bị từ chối`,
              ].filter(Boolean).join(' · ')}
            </Text>
          </View>
        )}

        {loading ? (
          <View style={{ paddingVertical: 48 }}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <>
            {/* Building cards */}
            <Text style={dashStyles.sectionTitle}>Theo bất động sản</Text>
            {buildingCards.length === 0 && (
              <View style={dashStyles.emptyBox}>
                <Text style={dashStyles.emptyText}>🏠  Chưa có bất động sản nào được phân công</Text>
              </View>
            )}
            {buildingCards.map(({ prop, bContracts }) => {
              const isWholeHouse = prop.propertyType === 'WHOLE_HOUSE';
              const activeCount = bContracts.filter(c => c.status === 'active').length;
              const expiringCount = bContracts.filter(c => c.status === 'expiring_soon').length;
              const pendingCount = bContracts.filter(c => c.status === 'pending_approval').length;
              const occ = prop.totalRooms > 0 ? Math.round((prop.occupied / prop.totalRooms) * 100) : 0;
              const needsAction = isWholeHouse ? prop.expiringContractCount : expiringCount + pendingCount;
              return (
                <TouchableOpacity
                  key={prop.id}
                  style={dashStyles.buildingCard}
                  onPress={() => navigation.navigate(isWholeHouse ? 'WholeHouseDetail' : 'BuildingContract', { propertyId: prop.id })}
                  activeOpacity={0.7}
                >
                  <View style={dashStyles.buildingCardTop}>
                    <Text style={dashStyles.buildingName}>{prop.name}</Text>
                    {needsAction > 0 ? (
                      <View style={dashStyles.warningBadge}>
                        <Text style={dashStyles.warningBadgeText}>{needsAction} cần xử lý</Text>
                      </View>
                    ) : (
                      <Text style={dashStyles.buildingArrow}>›</Text>
                    )}
                  </View>
                  <Text style={dashStyles.buildingMeta}>
                    {isWholeHouse
                      ? `${prop.district} · Nhà nguyên căn · ${prop.tenantName || 'Chưa có khách'}`
                      : `${prop.district} · ${prop.occupied}/${prop.totalRooms} phòng đang thuê (${occ}%)`}
                  </Text>
                  <View style={dashStyles.buildingMetricRow}>
                    <View style={dashStyles.buildingMetric}>
                      <Text style={dashStyles.buildingMetricValue}>{bContracts.length}</Text>
                      <Text style={dashStyles.buildingMetricLabel}>Tổng HĐ</Text>
                    </View>
                    <View style={dashStyles.buildingMetric}>
                      <Text style={[dashStyles.buildingMetricValue, { color: Colors.success }]}>{activeCount}</Text>
                      <Text style={dashStyles.buildingMetricLabel}>Hiệu lực</Text>
                    </View>
                    <View style={dashStyles.buildingMetric}>
                      <Text style={[dashStyles.buildingMetricValue, { color: Colors.info }]}>{pendingCount}</Text>
                      <Text style={dashStyles.buildingMetricLabel}>Chờ duyệt</Text>
                    </View>
                    <View style={dashStyles.buildingMetric}>
                      <Text style={[dashStyles.buildingMetricValue, { color: Colors.warning }]}>{expiringCount}</Text>
                      <Text style={dashStyles.buildingMetricLabel}>Sắp hết hạn</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}

            {/* Recent activity */}
            {recentActivity.length > 0 && (
              <>
                <Text style={dashStyles.sectionTitle}>Hoạt động gần đây</Text>
                {recentActivity.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={dashStyles.activityRow}
                    activeOpacity={0.75}
                    onPress={() => { setSelectedContract(c); setViewMode('detail'); }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={dashStyles.activityTitle} numberOfLines={1}>{c.code} · {c.lesseeName}</Text>
                      <Text style={dashStyles.activityMeta} numberOfLines={1}>{c.propertyName}{c.roomCode ? ` · ${c.roomCode}` : ''}</Text>
                    </View>
                    <Text style={dashStyles.activityStatus}>{STATUS_CONFIG[c.status].label}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
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

const dashStyles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  backBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center',
  },
  backBtnText: { fontSize: 24, lineHeight: 26, color: Colors.primary, fontWeight: '900' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: Colors.textPrimary },
  createBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
  },
  createBtnText: { color: Colors.white, fontWeight: '800', fontSize: 12 },

  tabRow: {
    flexDirection: 'row', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
  },
  tabPill: {
    flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center',
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.background, paddingHorizontal: Spacing.sm,
  },
  tabPillActive: { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  tabPillText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '800' },
  tabPillTextActive: { color: Colors.primary },

  scrollContent: { paddingBottom: Spacing.lg },
  statsContent: {
    paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  statCard: {
    width: 86, minHeight: 58, backgroundColor: Colors.white,
    borderRadius: BorderRadius.md, borderTopWidth: 3,
    borderWidth: 1, borderColor: Colors.border,
    paddingVertical: 7, alignItems: 'center', justifyContent: 'center',
  },
  statNum: { fontSize: 18, fontWeight: '900' },
  statLabel: { fontSize: 10, color: Colors.textSecondary, fontWeight: '700', marginTop: 2, textAlign: 'center' },

  alertBanner: {
    marginHorizontal: Spacing.base, marginBottom: Spacing.md,
    backgroundColor: Colors.warningLight, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 8,
  },
  alertText: { color: Colors.warning, fontSize: 12, fontWeight: '800' },
  sectionTitle: {
    fontSize: 15, fontWeight: '900', color: Colors.textPrimary,
    marginHorizontal: Spacing.base, marginTop: Spacing.sm, marginBottom: Spacing.sm,
  },

  buildingCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.base, marginBottom: Spacing.sm,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    ...Shadow.sm,
  },
  buildingCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  buildingName: { flex: 1, fontSize: 14, fontWeight: '900', color: Colors.textPrimary },
  buildingArrow: { fontSize: 22, color: Colors.textMuted, fontWeight: '700' },
  buildingMeta: { fontSize: 11, color: Colors.textSecondary, marginTop: 3, fontWeight: '600' },
  warningBadge: {
    backgroundColor: Colors.warningLight, borderRadius: BorderRadius.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  warningBadgeText: { fontSize: 10, color: Colors.warning, fontWeight: '900' },
  buildingMetricRow: {
    flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm,
  },
  buildingMetric: {
    flex: 1, backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    paddingVertical: 7, alignItems: 'center',
  },
  buildingMetricValue: { fontSize: 14, fontWeight: '900', color: Colors.textPrimary },
  buildingMetricLabel: { fontSize: 9, color: Colors.textMuted, fontWeight: '700', marginTop: 1 },
  buildingTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  buildingTag: { borderRadius: BorderRadius.full, paddingHorizontal: 8, paddingVertical: 4 },
  buildingTagText: { fontSize: 10, fontWeight: '800' },

  activityRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.base, marginBottom: Spacing.sm,
    backgroundColor: Colors.white, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  activityTitle: { fontSize: 12, color: Colors.textPrimary, fontWeight: '800' },
  activityMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  activityStatus: { fontSize: 11, color: Colors.primary, fontWeight: '900' },

  emptyBox: {
    marginHorizontal: Spacing.base, backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg, padding: Spacing.lg, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  emptyText: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
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

  inspectionCard: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.base,
    borderBottomWidth: 1,
    borderColor: Colors.divider,
  },
  inspectionIcon: { fontSize: 22 },
  inspectionBody: { flex: 1 },
  inspectionTitle: { fontSize: 13, color: Colors.textPrimary, fontWeight: '900' },
  inspectionMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 3, fontWeight: '600' },
  inspectionDeduction: { fontSize: 12, color: Colors.warning, marginTop: 4, fontWeight: '900' },
  inspectionEmpty: { padding: Spacing.base },
  inspectionEmptyTitle: { fontSize: 13, color: Colors.textPrimary, fontWeight: '900' },
  inspectionEmptyText: { fontSize: 12, color: Colors.textMuted, marginTop: 4, lineHeight: 18 },

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
