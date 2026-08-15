import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, FlatList,
  TextInput, Dimensions, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { DatePickerField } from '@/components/common/DatePickerField';
import { ManagedProperty } from '@/types/managedProperty';
import { managerPropertyService } from '@/services/manager/propertyService';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';
import { getContractTerminationTypeLabel, showAlert, isClosedContract } from '@/utils';
import { serverNow } from '@/utils/serverTime';

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

// Màn này chỉ chứa HĐ với khách thuê nên bỏ các trạng thái của luồng soạn/duyệt HĐ
// (nháp · chờ duyệt · đã duyệt · bị từ chối) — không bao giờ xuất hiện ở đây.
const FILTER_TABS: Array<{ key: 'all' | ContractStatus; label: string }> = [
  { key: 'all',             label: 'Tất cả' },
  { key: 'active',          label: 'Hiệu lực' },
  { key: 'expiring_soon',   label: 'Sắp hết hạn' },
  { key: 'expired',         label: 'Đã hết hạn' },
  { key: 'terminated',      label: 'Đã thanh lý' },
];

const fmt = (n: number | null | undefined) => (n || 0).toLocaleString('vi-VN') + 'đ';

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
            <TouchableOpacity
              style={[styles.qaBtn, styles.qaBtnPrimary]}
              onPress={(e) => { e.stopPropagation?.(); onAction('submit', contract); }}
            >
              <Text style={[styles.qaBtnText, styles.qaBtnPrimaryText]}>Gửi duyệt</Text>
            </TouchableOpacity>
          )}
          {contract.status === 'pending_approval' && (
            <TouchableOpacity style={styles.qaBtn} onPress={onPress}>
              <Text style={styles.qaBtnText}>Xem chi tiết</Text>
            </TouchableOpacity>
          )}
          {contract.status === 'rejected' && (
            <TouchableOpacity style={styles.qaBtn} onPress={onPress}>
              <Text style={styles.qaBtnText}>Xem lý do</Text>
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

          {/* Biên bản hiện trạng (ảnh check-in/check-out theo hợp đồng): BE chưa có API.
              Trước 15/08/2026 khối này đọc file mock `data/roomInspections.ts` — id trong đó
              không bao giờ khớp id hợp đồng thật nên thực tế luôn ra ô trống này, chỉ khác là
              nó vờ như tính năng đã chạy. Biên bản lúc TRẢ phòng đã có thật ở luồng
              CheckoutInspection (/api/v1/checkout-requests/{id}/inspection). */}
          <View style={detailStyles.section}>
            <SectionHeader title="Biên bản hiện trạng" />
            <View style={detailStyles.inspectionEmpty}>
              <Text style={detailStyles.inspectionEmptyTitle}>Chưa có biên bản hiện trạng.</Text>
              <Text style={detailStyles.inspectionEmptyText}>
                Biên bản trả phòng nằm ở màn "Trả phòng". Biên bản lúc nhận phòng chưa được hệ thống lưu.
              </Text>
            </View>
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
            </>
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


// ===================== PROPS =====================
interface Props {
  navigation?: any;
  route?: any;
}

// ===================== MAIN (DASHBOARD) =====================
export const ContractListScreen: React.FC<Props> = () => {
  const navigation = useNavigation<any>();
  // Tạo/sửa hợp đồng đã bỏ khỏi app manager (03/08/2026) — hợp đồng sinh ra từ
  // luồng tiếp nhận nhà (OnboardingScreenV2), màn này chỉ để xem & vận hành.
  type ViewMode = 'dashboard' | 'detail';
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const tab = 'tenant' as const; // Màn này chỉ quản lý HĐ giữa manager ↔ khách thuê.
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [managedProps, setManagedProps] = useState<ManagedProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);

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
          // HĐ đã thanh lý (khách trả phòng xong) không hiện ở màn vận hành nữa —
          // giữ đúng 1 luật với màn Hợp đồng theo nhà và màn Khách thuê.
          return apiContracts
            .filter(c => !isClosedContract(c.status))
            .map(c => mapApiToContract(c, p.name));
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

  // HĐ đã thanh lý đã bị lọc từ lúc tải — `ended` giờ chỉ còn HĐ hết hạn chưa xử lý.
  const tenantStats = useMemo(() => ({
    total: contracts.length,
    active: contracts.filter(c => c.status === 'active' || c.status === 'expiring_soon').length,
    expiring: contracts.filter(c => c.status === 'expiring_soon').length,
    ended: contracts.filter(c => c.status === 'expired').length,
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
      case 'submit':
        showAlert(
          'Gửi duyệt hợp đồng',
          `Gửi hợp đồng ${contract.code} đến Host/Admin để xem xét phê duyệt?`,
          [
            { text: 'Hủy', style: 'cancel' },
            {
              text: 'Gửi duyệt',
              onPress: () => {
                const now = serverNow().toLocaleDateString('vi-VN');
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
                showAlert('✅ Đã gửi duyệt!', 'Hợp đồng đã được gửi đến Host/Admin. Bạn sẽ nhận thông báo khi có phản hồi.');
              },
            },
          ]
        );
        break;

      case 'activate':
        showAlert(
          'Kích hoạt hợp đồng',
          `Kích hoạt hợp đồng ${contract.code}?\nOTP xác nhận sẽ được gửi đến ${contract.lesseePhone}.`,
          [
            { text: 'Hủy', style: 'cancel' },
            {
              text: 'Kích hoạt',
              onPress: () => {
                const now = serverNow().toLocaleDateString('vi-VN');
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
                showAlert('🟢 Hợp đồng đang hiệu lực!', `Hợp đồng ${contract.code} đã được kích hoạt thành công.`);
              },
            },
          ]
        );
        break;

      case 'renew':
        showAlert(
          'Gia hạn hợp đồng',
          `Gia hạn hợp đồng ${contract.code} thêm 12 tháng?`,
          [
            { text: 'Hủy', style: 'cancel' },
            {
              text: 'Gia hạn',
              onPress: () => {
                const now = serverNow().toLocaleDateString('vi-VN');
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
                showAlert('✅ Đã gia hạn!', `Hợp đồng ${contract.code} được gia hạn đến 16/05/2027.`);
              },
            },
          ]
        );
        break;

      case 'terminate':
        showAlert(
          'Thanh lý hợp đồng',
          `Thanh lý hợp đồng ${contract.code}?\nThao tác này không thể hoàn tác.`,
          [
            { text: 'Hủy', style: 'cancel' },
            {
              text: 'Xác nhận thanh lý',
              style: 'destructive',
              onPress: () => {
                const now = serverNow().toLocaleDateString('vi-VN');
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
                showAlert('✅ Đã thanh lý!', `Hợp đồng ${contract.code} đã được thanh lý.`);
              },
            },
          ]
        );
        break;
    }
  };

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
        {/* Stats row — chỉ giữ trạng thái có thật với HĐ khách thuê.
            Nháp/Chờ duyệt/Đã duyệt/Bị từ chối thuộc luồng soạn & duyệt HĐ đã bỏ. */}
        <View style={dashStyles.statsContent}>
          <View style={[dashStyles.statCard, { borderTopColor: Colors.success }]}>
            <Text style={[dashStyles.statNum, { color: Colors.success }]}>{curStats.active}</Text>
            <Text style={dashStyles.statLabel}>Đang thuê</Text>
          </View>
          <View style={[dashStyles.statCard, { borderTopColor: Colors.warning }]}>
            <Text style={[dashStyles.statNum, { color: Colors.warning }]}>{curStats.expiring}</Text>
            <Text style={dashStyles.statLabel}>Sắp hết hạn</Text>
          </View>
          <View style={[dashStyles.statCard, { borderTopColor: Colors.error }]}>
            <Text style={[dashStyles.statNum, { color: Colors.error }]}>{curStats.ended}</Text>
            <Text style={dashStyles.statLabel}>Hết hạn</Text>
          </View>
        </View>

        {/* Alert banner */}
        {tenantStats.expiring > 0 && (
          <View style={dashStyles.alertBanner}>
            <Text style={dashStyles.alertText}>
              {tenantStats.expiring} hợp đồng sắp hết hạn — liên hệ khách để gia hạn.
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
              const activeCount = bContracts.filter(c => c.status === 'active' || c.status === 'expiring_soon').length;
              const expiringCount = bContracts.filter(c => c.status === 'expiring_soon').length;
              // HĐ hết hạn mà chưa làm thủ tục trả phòng — việc cần xử lý, khác "đã thanh lý"
              // (nhóm đó đã bị lọc bỏ từ lúc tải).
              const endedCount = bContracts.filter(c => c.status === 'expired').length;
              const occ = prop.totalRooms > 0 ? Math.round((prop.occupied / prop.totalRooms) * 100) : 0;
              const needsAction = isWholeHouse ? prop.expiringContractCount : expiringCount + endedCount;
              return (
                <TouchableOpacity
                  key={prop.id}
                  style={dashStyles.buildingCard}
                  onPress={() => navigation.navigate(
                    isWholeHouse ? 'WholeHouseDetail' : 'BuildingContract',
                    { propertyId: prop.id, propertyName: prop.name },
                  )}
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
                      <Text style={dashStyles.buildingMetricLabel}>Đang thuê</Text>
                    </View>
                    <View style={dashStyles.buildingMetric}>
                      <Text style={[dashStyles.buildingMetricValue, { color: Colors.warning }]}>{expiringCount}</Text>
                      <Text style={dashStyles.buildingMetricLabel}>Sắp hết hạn</Text>
                    </View>
                    <View style={dashStyles.buildingMetric}>
                      <Text style={[dashStyles.buildingMetricValue, { color: Colors.error }]}>{endedCount}</Text>
                      <Text style={dashStyles.buildingMetricLabel}>Hết hạn</Text>
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
  // 3 thẻ cố định, chia đều thay vì cuộn ngang như lúc còn 6 trạng thái.
  statsContent: {
    flexDirection: 'row', paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm, paddingBottom: Spacing.md, gap: Spacing.sm,
  },
  statCard: {
    flex: 1, minHeight: 58, backgroundColor: Colors.white,
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
