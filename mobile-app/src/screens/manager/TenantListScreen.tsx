import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, Alert, ScrollView, Dimensions, Linking, ActivityIndicator, Platform,
} from 'react-native';
import { showAlert, isClosedContract } from '@/utils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { managerPropertyService } from '@/services/manager/propertyService';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const TODAY = new Date();

// ===================== TYPES =====================
type TenantStatus = 'active' | 'pending_activation' | 'moved_out' | 'suspended';
type TenantPropertyType = 'MULTI_ROOM' | 'WHOLE_HOUSE';
type FilterKey = 'all' | TenantStatus | 'overdue' | 'whole_house' | 'expiring';

interface HouseholdMember { name: string; relation: string }

interface Tenant {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  cccd: string;
  propertyName: string;
  propertyId: string;
  roomId: string;
  roomName: string;
  propertyType?: TenantPropertyType;
  householdMembers?: HouseholdMember[];
  status: TenantStatus;
  moveInDate: string;
  moveOutDate?: string;
  /** Đã thu đủ cọc chưa (không lưu số tiền — @/constants/managerVisibility). */
  depositPaid: boolean;
  contractId?: string;
  unpaidAmount?: number;
  unpaidBills?: number;
  openTickets?: number;
  contractEndDate?: string;
  notes?: string;
}

// ===================== MAP API → UI =====================
// Trạng thái HĐ từ BE (uppercase) → trạng thái khách thuê dùng trong UI.
// Khách đã trả phòng xong không vào tới đây nữa (lọc bỏ ngay lúc tải — isClosedContract),
// nên chỉ còn: đang ở · chờ kích hoạt · tạm ngưng. HĐ hết hạn mà chưa làm thủ tục trả
// phòng vẫn là khách đang ở — bộ lọc "Sắp hết HĐ" sẽ nhặt ra để quản lý xử lý.
const mapTenantStatus = (s?: string): TenantStatus => {
  const u = (s || '').toUpperCase();
  if (u.startsWith('PENDING')) return 'pending_activation';
  if (u === 'SUSPENDED') return 'suspended';
  return 'active';
};

const fmtIsoDate = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('vi-VN');
};

// 1 hợp đồng (BE) + thông tin nhà → 1 khách thuê (UI).
const mapContractToTenant = (
  c: TenantContractResponse,
  propertyName: string,
  isWholeHouse: boolean,
): Tenant => ({
  id: String(c.id),
  fullName: c.tenantFullName,
  phone: c.tenantPhone,
  cccd: c.tenantCccd ?? '',
  propertyName,
  propertyId: String(c.propertyId),
  roomId: String(c.roomId ?? ''),
  roomName: isWholeHouse || !c.roomNumber ? 'Nhà nguyên căn' : `Phòng ${c.roomNumber}`,
  propertyType: isWholeHouse ? 'WHOLE_HOUSE' : 'MULTI_ROOM',
  status: mapTenantStatus(c.status),
  moveInDate: fmtIsoDate(c.moveInDate || c.startDate),
  depositPaid: (c.paymentStatus || '').toUpperCase() === 'PAID',
  contractId: c.contractCode,
  contractEndDate: c.endDate,   // ISO (yyyy-MM-dd)
  // BE chưa trả công nợ/ticket theo từng khách ở endpoint này → để 0 (không bịa số).
  unpaidAmount: 0,
  unpaidBills: 0,
  openTickets: 0,
});

// ===================== HELPERS =====================
const getDaysRemaining = (dateStr: string): number =>
  Math.ceil((new Date(dateStr).getTime() - TODAY.getTime()) / 86400000);

const fmt = (n: number | null | undefined) => (n || 0).toLocaleString('vi-VN') + 'đ';

const AVATAR_PALETTE = [
  { bg: '#EEF2FF', text: '#4F46E5' },
  { bg: '#D1FAE5', text: '#065F46' },
  { bg: '#E0F2FE', text: '#0369A1' },
  { bg: '#F3E8FF', text: '#6D28D9' },
  { bg: '#FFE4E6', text: '#9F1239' },
  { bg: '#FEF9C3', text: '#713F12' },
  { bg: '#ECFDF5', text: '#047857' },
  { bg: '#FDF4FF', text: '#86198F' },
];

const getAvatarColor = (name: string) =>
  AVATAR_PALETTE[name.charCodeAt(0) % AVATAR_PALETTE.length];

interface ChipInfo { label: string; color: string; bg: string }

const getFinancialChip = (t: Tenant): ChipInfo | null => {
  if (t.status === 'moved_out') return null;
  if (t.status === 'pending_activation')
    return { label: 'Chưa kích hoạt', color: '#94A3B8', bg: '#F1F5F9' };
  if ((t.unpaidBills || 0) > 0)
    return { label: `⚠️ ${t.unpaidBills} HĐ · ${fmt(t.unpaidAmount || 0)}`, color: '#DC2626', bg: '#FEE2E2' };
  return { label: '✓ Đã thanh toán', color: '#16A34A', bg: '#F0FDF4' };
};

const getContractChip = (t: Tenant): ChipInfo | null => {
  if (!t.contractEndDate || t.status === 'moved_out') return null;
  const days = getDaysRemaining(t.contractEndDate);
  if (days < 0) return { label: '❌ Hết hạn HĐ', color: '#DC2626', bg: '#FEE2E2' };
  if (days <= 30) return { label: `⏰ Còn ${days} ngày`, color: '#B45309', bg: '#FEF3C7' };
  if (days <= 90) return { label: `📋 Còn ${days} ngày`, color: '#0369A1', bg: '#E0F2FE' };
  return null;
};

const STATUS_CONFIG: Record<TenantStatus, { label: string; color: string; bg: string }> = {
  active: { label: 'Đang ở', color: '#16A34A', bg: '#F0FDF4' },
  pending_activation: { label: 'Chờ KH', color: '#D97706', bg: '#FFFBEB' },
  moved_out: { label: 'Đã rời', color: '#6B7280', bg: '#F3F4F6' },
  suspended: { label: 'Tạm ngưng', color: '#EF4444', bg: '#FEF2F2' },
};

const FILTER_DEFS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'active', label: 'Đang ở' },
  { key: 'pending_activation', label: 'Chờ kích hoạt' },
  { key: 'overdue', label: 'Quá hạn TT' },
  { key: 'whole_house', label: 'Nguyên căn' },
  { key: 'expiring', label: 'Sắp hết HĐ' },
];

const matchesFilter = (t: Tenant, filter: FilterKey): boolean => {
  switch (filter) {
    case 'all': return true;
    case 'overdue': return (t.unpaidBills || 0) > 0;
    case 'whole_house': return t.propertyType === 'WHOLE_HOUSE';
    case 'expiring': return !!t.contractEndDate && getDaysRemaining(t.contractEndDate) <= 30;
    default: return t.status === filter;
  }
};

// ===================== STATUS CHIP =====================
const StatusBadge: React.FC<{ status: TenantStatus }> = ({ status }) => {
  const cfg = STATUS_CONFIG[status];
  return (
    <View style={[badgeStyles.badge, { backgroundColor: cfg.bg }]}>
      <View style={[badgeStyles.dot, { backgroundColor: cfg.color }]} />
      <Text style={[badgeStyles.label, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
};

const badgeStyles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 11, fontWeight: '700' },
});

// ===================== INFO CHIP =====================
const InfoChip: React.FC<{ label: string; color: string; bg: string }> = ({ label, color, bg }) => (
  <View style={[chipStyles.chip, { backgroundColor: bg, borderColor: color + '30' }]}>
    <Text style={[chipStyles.text, { color }]}>{label}</Text>
  </View>
);

const chipStyles = StyleSheet.create({
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  text: { fontSize: 11, fontWeight: '600' },
});

// ===================== FILTER CHIP =====================
const FilterChip: React.FC<{
  label: string;
  count?: number;
  selected: boolean;
  onPress: () => void;
}> = ({ label, count, selected, onPress }) => (
  <TouchableOpacity
    style={[
      filterChipStyles.chip,
      selected ? filterChipStyles.chipSelected : filterChipStyles.chipUnselected,
    ]}
    onPress={onPress}
    activeOpacity={0.75}
  >
    <Text
      style={[
        filterChipStyles.label,
        selected ? filterChipStyles.labelSelected : filterChipStyles.labelUnselected,
      ]}
    >
      {label}
    </Text>
    {count !== undefined && count !== null && (
      <View
        style={[
          filterChipStyles.countBadge,
          selected ? filterChipStyles.countBadgeSelected : filterChipStyles.countBadgeUnselected,
        ]}
      >
        <Text
          style={[
            filterChipStyles.countText,
            selected ? filterChipStyles.countTextSelected : filterChipStyles.countTextUnselected,
          ]}
        >
          {count}
        </Text>
      </View>
    )}
  </TouchableOpacity>
);

const filterChipStyles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipSelected: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  chipUnselected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  labelSelected: { color: '#FFFFFF' },
  labelUnselected: { color: '#334155' },
  countBadge: {
    minWidth: 22,
    minHeight: 20,
    paddingHorizontal: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeSelected: { backgroundColor: 'rgba(255,255,255,0.22)' },
  countBadgeUnselected: { backgroundColor: '#EEF2FF' },
  countText: {
    fontSize: 11,
    fontWeight: '700',
    includeFontPadding: false,
  },
  countTextSelected: { color: '#FFFFFF' },
  countTextUnselected: { color: '#4F46E5' },
});

// ===================== TENANT DETAIL MODAL =====================
const TenantDetailModal: React.FC<{
  tenant: Tenant;
  onClose: () => void;
  onAction: (action: string, tenant: Tenant) => void;
}> = ({ tenant, onClose, onAction }) => {
  const cfg = STATUS_CONFIG[tenant.status];
  const isWholeHouse = tenant.propertyType === 'WHOLE_HOUSE';
  const avatarColor = isWholeHouse
    ? { bg: '#FEF3C7', text: '#B45309' }
    : getAvatarColor(tenant.fullName);
  const financialChip = getFinancialChip(tenant);
  const contractChip = getContractChip(tenant);

  return (
    <Modal transparent animationType="slide">
      <View style={mStyles.overlay}>
        <View style={mStyles.sheet}>
          <View style={mStyles.handle} />
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}
            contentContainerStyle={mStyles.content}>

            {/* Header */}
            <View style={mStyles.header}>
              <View style={[mStyles.avatarLarge, { backgroundColor: avatarColor.bg }]}>
                <Text style={[mStyles.avatarText, { color: avatarColor.text }]}>
                  {isWholeHouse ? '🏠' : tenant.fullName.charAt(0)}
                </Text>
              </View>
              <View style={mStyles.headerInfo}>
                <Text style={mStyles.tenantName}>{tenant.fullName}</Text>
                <Text style={mStyles.tenantSub}>
                  {tenant.propertyName} · {isWholeHouse ? 'Nhà nguyên căn' : tenant.roomName}
                </Text>
                <View style={mStyles.headerBadges}>
                  <StatusBadge status={tenant.status} />
                  {isWholeHouse && (
                    <View style={[badgeStyles.badge, { backgroundColor: '#FEF3C7' }]}>
                      <Text style={[badgeStyles.label, { color: '#B45309' }]}>🏘 Nguyên căn</Text>
                    </View>
                  )}
                </View>
              </View>
              <TouchableOpacity onPress={onClose} style={mStyles.closeBtn}>
                <Text style={mStyles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Alert banners */}
            {(tenant.unpaidBills || 0) > 0 && (
              <TouchableOpacity style={mStyles.alertBanner} onPress={() => onAction('billing_overdue', tenant)}>
                <Text style={mStyles.alertText}>
                  ⚠️ {tenant.unpaidBills} hóa đơn chưa thanh toán · {fmt(tenant.unpaidAmount || 0)}
                </Text>
                <Text style={mStyles.alertArrow}>›</Text>
              </TouchableOpacity>
            )}
            {(tenant.openTickets || 0) > 0 && (
              <TouchableOpacity
                style={[mStyles.alertBanner, { backgroundColor: '#DBEAFE', borderColor: '#3B82F640' }]}
                onPress={() => onAction('maintenance', tenant)}
              >
                <Text style={[mStyles.alertText, { color: '#1D4ED8' }]}>
                  🔧 {tenant.openTickets} yêu cầu bảo trì đang xử lý
                </Text>
                <Text style={[mStyles.alertArrow, { color: '#1D4ED8' }]}>›</Text>
              </TouchableOpacity>
            )}

            {/* Status chips */}
            {(financialChip || contractChip) && (
              <View style={mStyles.chipRow}>
                {financialChip && <InfoChip {...financialChip} />}
                {contractChip && <InfoChip {...contractChip} />}
              </View>
            )}

            {/* Personal info */}
            <View style={mStyles.section}>
              <Text style={mStyles.sectionTitle}>Thông tin liên hệ</Text>
              <InfoRow label="📱 Điện thoại" value={tenant.phone} />
              {tenant.email && <InfoRow label="✉️ Email" value={tenant.email} />}
              <InfoRow label="🪪 CCCD / MST" value={tenant.cccd} />
            </View>

            {/* Rental info */}
            <View style={mStyles.section}>
              <Text style={mStyles.sectionTitle}>{isWholeHouse ? 'Thuê nhà nguyên căn' : 'Thông tin thuê phòng'}</Text>
              <InfoRow label={isWholeHouse ? '🏠 Tài sản' : '🚪 Phòng'} value={isWholeHouse ? 'Nhà nguyên căn' : tenant.roomName} />
              <InfoRow label="📅 Ngày vào" value={tenant.moveInDate} />
              {tenant.moveOutDate && <InfoRow label="📅 Ngày ra" value={tenant.moveOutDate} />}
              {tenant.contractEndDate && (
                <InfoRow
                  label="📋 Hạn HĐ"
                  value={tenant.contractEndDate}
                  highlight={!!tenant.contractEndDate && getDaysRemaining(tenant.contractEndDate) <= 30}
                />
              )}
              {/* Không hiện số tiền cọc — @/constants/managerVisibility. */}
              <InfoRow
                label="💰 Tiền cọc"
                value={tenant.depositPaid ? 'Đã thu' : 'Chưa thu'}
                accent
              />
            </View>

            {/* Household members */}
            {isWholeHouse && tenant.householdMembers && (
              <View style={mStyles.section}>
                <Text style={mStyles.sectionTitle}>Thành viên / người sử dụng</Text>
                {tenant.householdMembers.map(m => (
                  <InfoRow key={`${m.name}-${m.relation}`} label={m.relation} value={m.name} />
                ))}
              </View>
            )}

            {/* Stats */}
            <View style={mStyles.section}>
              <Text style={mStyles.sectionTitle}>Công nợ & Dịch vụ</Text>
              <View style={mStyles.statsRow}>
                <View style={[mStyles.statBox, { borderColor: (tenant.unpaidBills || 0) > 0 ? '#EF4444' : '#10B981' }]}>
                  <Text style={[mStyles.statNum, { color: (tenant.unpaidBills || 0) > 0 ? '#EF4444' : '#10B981' }]}>
                    {tenant.unpaidBills || 0}
                  </Text>
                  <Text style={mStyles.statLabel}>HĐ chưa TT</Text>
                  {(tenant.unpaidAmount || 0) > 0 && (
                    <Text style={[mStyles.statSub, { color: '#EF4444' }]}>{fmt(tenant.unpaidAmount || 0)}</Text>
                  )}
                </View>
                <View style={[mStyles.statBox, { borderColor: (tenant.openTickets || 0) > 0 ? '#3B82F6' : '#E2E8F0' }]}>
                  <Text style={[mStyles.statNum, { color: (tenant.openTickets || 0) > 0 ? '#3B82F6' : '#64748B' }]}>
                    {tenant.openTickets || 0}
                  </Text>
                  <Text style={mStyles.statLabel}>Ticket mở</Text>
                </View>
              </View>
            </View>

            {/* Actions */}
            {tenant.status === 'active' && (
              <View style={mStyles.section}>
                <Text style={mStyles.sectionTitle}>Thao tác nhanh</Text>
                <View style={mStyles.actionsGrid}>
                  {[
                    { key: 'billing', icon: '🧾', label: 'Hóa đơn', color: Colors.warning },
                    { key: 'contract', icon: '📋', label: 'Hợp đồng', color: Colors.info },
                    { key: 'maintenance', icon: '🔧', label: 'Bảo trì', color: Colors.primary },
                    { key: 'checkout', icon: '🚪', label: isWholeHouse ? 'Trả nhà' : 'Trả phòng', color: Colors.error },
                  ].map(({ key, icon, label, color }) => (
                    <TouchableOpacity
                      key={key}
                      style={[mStyles.actionBtn, { borderColor: color + '40', backgroundColor: color + '10' }]}
                      onPress={() => onAction(key, tenant)}
                    >
                      <Text style={mStyles.actionIcon}>{icon}</Text>
                      <Text style={[mStyles.actionLabel, { color }]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {tenant.status === 'pending_activation' && (
              <TouchableOpacity
                style={mStyles.activateBtn}
                onPress={() => onAction('activate', tenant)}
              >
                <Text style={mStyles.activateBtnText}>✅ Kích hoạt phòng</Text>
              </TouchableOpacity>
            )}

            {tenant.notes && (
              <View style={mStyles.notesBox}>
                <Text style={mStyles.notesLabel}>GHI CHÚ</Text>
                <Text style={mStyles.notesText}>{tenant.notes}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const InfoRow: React.FC<{ label: string; value: string; accent?: boolean; highlight?: boolean }> = ({
  label, value, accent, highlight,
}) => (
  <View style={mStyles.infoRow}>
    <Text style={mStyles.infoLabel}>{label}</Text>
    <Text style={[
      mStyles.infoVal,
      accent && { color: Colors.primary, fontWeight: '700' },
      highlight && { color: '#B45309' },
    ]}>
      {value}
    </Text>
  </View>
);

const mStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.93,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  content: { paddingHorizontal: Spacing.xl, paddingBottom: 44, paddingTop: Spacing.md },

  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginBottom: Spacing.md },
  avatarLarge: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 26, fontWeight: '800' },
  headerInfo: { flex: 1 },
  tenantName: { fontSize: 19, fontWeight: '800', color: '#0F172A', marginBottom: 2 },
  tenantSub: { fontSize: 13, color: '#64748B', marginBottom: 6 },
  headerBadges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  closeBtnText: { fontSize: 14, color: '#64748B', fontWeight: '700' },

  alertBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7',
    borderRadius: 12, padding: Spacing.md, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: '#F59E0B40', gap: Spacing.sm,
  },
  alertText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#B45309' },
  alertArrow: { fontSize: 20, color: '#B45309' },

  chipRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: Spacing.md },

  section: { marginBottom: Spacing.lg },
  sectionTitle: {
    fontSize: 11, fontWeight: '800', color: '#94A3B8',
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: Spacing.sm,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  infoLabel: { fontSize: 14, color: '#64748B' },
  infoVal: { fontSize: 14, fontWeight: '600', color: '#0F172A', textAlign: 'right', flex: 1, marginLeft: Spacing.md },

  statsRow: { flexDirection: 'row', gap: Spacing.md },
  statBox: {
    flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12,
    padding: Spacing.md, alignItems: 'center', borderWidth: 1.5,
  },
  statNum: { fontSize: 26, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#64748B', marginTop: 2 },
  statSub: { fontSize: 11, fontWeight: '600', marginTop: 2 },

  actionsGrid: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' },
  actionBtn: {
    flex: 1, minWidth: '40%', borderRadius: 12,
    paddingVertical: Spacing.md, alignItems: 'center', borderWidth: 1.5,
  },
  actionIcon: { fontSize: 22, marginBottom: 4 },
  actionLabel: { fontSize: 11, fontWeight: '700' },

  activateBtn: {
    backgroundColor: Colors.success, borderRadius: 14,
    paddingVertical: Spacing.base, alignItems: 'center', marginBottom: Spacing.md,
    ...Shadow.md,
  },
  activateBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  notesBox: {
    backgroundColor: '#F8FAFC', borderRadius: 10, padding: Spacing.md,
    borderLeftWidth: 3, borderLeftColor: '#CBD5E1', marginBottom: Spacing.md,
  },
  notesLabel: { fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.8, marginBottom: 4 },
  notesText: { fontSize: 13, color: '#64748B', lineHeight: 20 },
});

// ===================== TENANT CARD =====================
const TenantCard: React.FC<{
  tenant: Tenant;
  onPress: () => void;
  onQuickAction: () => void;
}> = ({ tenant, onPress, onQuickAction }) => {
  const isWholeHouse = tenant.propertyType === 'WHOLE_HOUSE';
  const avatarColor = isWholeHouse ? { bg: '#FEF3C7', text: '#B45309' } : getAvatarColor(tenant.fullName);
  const financialChip = getFinancialChip(tenant);
  const contractChip = getContractChip(tenant);
  const hasAlerts = (tenant.unpaidBills || 0) > 0 || (tenant.openTickets || 0) > 0;

  const chips: ChipInfo[] = [];
  if (financialChip) chips.push(financialChip);
  if (contractChip) chips.push(contractChip);
  if ((tenant.openTickets || 0) > 0)
    chips.push({ label: `🔧 ${tenant.openTickets} bảo trì`, color: '#1D4ED8', bg: '#DBEAFE' });
  if (isWholeHouse)
    chips.push({ label: '🏘 Nguyên căn', color: '#B45309', bg: '#FEF3C7' });

  return (
    <TouchableOpacity
      style={[
        cStyles.card,
        isWholeHouse && cStyles.cardWhole,
        hasAlerts && cStyles.cardAlert,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {isWholeHouse && <View style={cStyles.wholeStripe} />}

      {/* TOP: Avatar + Name + Status */}
      <View style={cStyles.topRow}>
        <View style={[cStyles.avatar, { backgroundColor: avatarColor.bg }]}>
          <Text style={[cStyles.avatarText, { color: avatarColor.text }]}>
            {isWholeHouse ? '🏠' : tenant.fullName.charAt(0)}
          </Text>
        </View>
        <View style={cStyles.nameBlock}>
          <Text style={cStyles.fullName} numberOfLines={1}>{tenant.fullName}</Text>
          <Text style={cStyles.locationText} numberOfLines={1}>
            {tenant.propertyName} · {isWholeHouse ? 'Nhà nguyên căn' : tenant.roomName}
          </Text>
        </View>
        <View style={cStyles.topRight}>
          <StatusBadge status={tenant.status} />
          <TouchableOpacity style={cStyles.moreBtn} onPress={onQuickAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={cStyles.moreBtnText}>•••</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* DIVIDER */}
      <View style={cStyles.divider} />

      {/* MIDDLE: Contact + Date */}
      <View style={cStyles.middleRow}>
        <View style={cStyles.infoItem}>
          <Text style={cStyles.infoIcon}>📱</Text>
          <Text style={cStyles.infoText}>{tenant.phone}</Text>
        </View>
        <View style={cStyles.infoItem}>
          <Text style={cStyles.infoIcon}>📅</Text>
          <Text style={cStyles.infoText}>Vào {tenant.moveInDate}</Text>
        </View>
        {isWholeHouse && (tenant.householdMembers?.length || 0) > 0 && (
          <View style={cStyles.infoItem}>
            <Text style={cStyles.infoIcon}>👥</Text>
            <Text style={cStyles.infoText}>{tenant.householdMembers!.length} thành viên</Text>
          </View>
        )}
      </View>

      {/* BOTTOM: Status chips */}
      {tenant.status !== 'moved_out' && chips.length > 0 && (
        <>
          <View style={cStyles.divider} />
          <View style={cStyles.chipsRow}>
            {chips.map((chip, i) => (
              <InfoChip key={i} {...chip} />
            ))}
          </View>
        </>
      )}
    </TouchableOpacity>
  );
};

const cStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  cardWhole: { backgroundColor: '#FFFCF5' },
  cardAlert: { borderWidth: 1, borderColor: '#FCA5A5' },
  wholeStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: '#D97706' },

  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: 20, fontWeight: '800' },
  nameBlock: { flex: 1, justifyContent: 'center' },
  fullName: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  locationText: { fontSize: 12, color: '#64748B' },
  topRight: { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  moreBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  moreBtnText: { fontSize: 11, color: '#94A3B8', fontWeight: '700', letterSpacing: 1 },

  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 10 },

  middleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoIcon: { fontSize: 12 },
  infoText: { fontSize: 12, color: '#475569', fontWeight: '500' },

  chipsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
});

// ===================== SUMMARY STAT TILE =====================
const StatTile: React.FC<{ value: number; label: string; color: string; bg: string }> = ({
  value, label, color, bg,
}) => (
  <View style={[stStyles.tile, { backgroundColor: bg }]}>
    <Text style={[stStyles.value, { color }]}>{value}</Text>
    <Text style={stStyles.label}>{label}</Text>
  </View>
);

const stStyles = StyleSheet.create({
  tile: { flex: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center' },
  value: { fontSize: 22, fontWeight: '800' },
  label: { fontSize: 10, color: '#64748B', marginTop: 2, textAlign: 'center', fontWeight: '500' },
});

// ===================== MAIN SCREEN =====================
export const TenantListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  // Tải khách thuê THẬT: gom hợp đồng của tất cả nhà manager phụ trách.
  const load = useCallback(async () => {
    try {
      const scoped = await managerPropertyService.getScopedProperties();
      const lists = await Promise.all(
        scoped.map(async (p: any) => {
          const contracts = await realTenantService
            .listByProperty(p.id)
            .catch(() => [] as TenantContractResponse[]);
          const isWhole = p.wholeHouse === true;
          // Chỉ giữ khách ĐANG THUÊ: khách đã trả phòng xong (HĐ thanh lý) không hiện
          // ở đây nữa, tránh danh sách phình ra toàn người đã đi.
          return contracts
            .filter(c => !isClosedContract(c.status))
            .map(c => mapContractToTenant(c, p.propertyName, isWhole));
        }),
      );
      setTenants(lists.flat());
    } catch {
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const properties = useMemo(() => [...new Set(tenants.map(t => t.propertyName))], [tenants]);

  const filtered = useMemo(() => tenants.filter(t => {
    const matchSearch = !search || (
      t.fullName.toLowerCase().includes(search.toLowerCase()) ||
      t.phone.includes(search) ||
      t.roomName.toLowerCase().includes(search.toLowerCase()) ||
      t.cccd.includes(search)
    );
    return matchSearch && matchesFilter(t, activeFilter) &&
      (propertyFilter === 'all' || t.propertyName === propertyFilter);
  }), [tenants, search, activeFilter, propertyFilter]);

  const filterCounts = useMemo(() => {
    const result: Record<string, number> = {};
    FILTER_DEFS.forEach(f => {
      result[f.key] = tenants.filter(t => matchesFilter(t, f.key)).length;
    });
    return result;
  }, [tenants]);

  const propertyCounts = useMemo(() => {
    const result: Record<string, number> = {
      all: tenants.filter(t => matchesFilter(t, activeFilter)).length,
    };
    properties.forEach(propertyName => {
      result[propertyName] = tenants.filter(t =>
        matchesFilter(t, activeFilter) && t.propertyName === propertyName
      ).length;
    });
    return result;
  }, [activeFilter, properties, tenants]);

  const stats = useMemo(() => ({
    active: tenants.filter(t => t.status === 'active').length,
    overdue: tenants.filter(t => (t.unpaidBills || 0) > 0).length,
    expiring: tenants.filter(t => !!t.contractEndDate && getDaysRemaining(t.contractEndDate) <= 30).length,
  }), [tenants]);

  // Shared params passed to every tenant-scoped screen
  const tenantNavParams = (t: Tenant) => ({
    tenantId: t.id,
    tenantName: t.fullName,
    roomId: t.roomId,
    roomName: t.roomName,
    propertyId: t.propertyId,
    propertyName: t.propertyName,
  });

  const handleAction = useCallback((action: string, tenant: Tenant) => {
    const isWH = tenant.propertyType === 'WHOLE_HOUSE';
    switch (action) {
      // 'billing_overdue' — navigate directly to the first unpaid invoice detail
      case 'billing_overdue':
        setSelectedTenant(null);
        navigation.navigate('TenantInvoices', { ...tenantNavParams(tenant), autoOpenFirst: true });
        break;
      // 'billing' — open full invoice list for this tenant
      case 'billing':
        setSelectedTenant(null);
        navigation.navigate('TenantInvoices', tenantNavParams(tenant));
        break;
      case 'contract':
        setSelectedTenant(null);
        navigation.navigate('TenantContractDetail', tenantNavParams(tenant));
        break;
      case 'maintenance':
        setSelectedTenant(null);
        navigation.navigate('TenantMaintenance', tenantNavParams(tenant));
        break;
      case 'checkout': {
        const doCheckout = async () => {
          try {
            // Thanh lý chủ động (khách trả sớm / hai bên thống nhất) — KHÔNG phải
            // vi phạm, nên không dùng type VIOLATION (BE rào lại type đó).
            await realTenantService.terminateContract(Number(tenant.id), {
              type: 'MUTUAL_AGREEMENT',
              reason: `Quản lý thanh lý hợp đồng ${isWH ? 'trả nhà' : 'trả phòng'} theo thoả thuận`,
            });
            setSelectedTenant(null);
            load();
            showAlert('Thành công', `Đã ${isWH ? 'trả nhà' : 'trả phòng'} cho ${tenant.fullName}.`);
          } catch (e: any) {
            showAlert('Lỗi', e?.response?.data?.message || e?.message || 'Không kết thúc được hợp đồng — thử lại hoặc kiểm tra trạng thái HĐ.');
          }
        };
        const title = isWH ? 'Thanh lý ngay — trả nhà' : 'Thanh lý ngay — trả phòng';
        const msg = `${tenant.fullName} - ${isWH ? tenant.propertyName : tenant.roomName}\n\nThanh lý HĐ NGAY không qua yêu cầu trả phòng của khách (khách gửi yêu cầu thì duyệt ở màn "Trả phòng" ngoài trang chủ). Đảm bảo hóa đơn và tiền cọc đã xử lý xong.`;
        showAlert(title, msg, [
          { text: 'Hủy', style: 'cancel' },
          { text: isWH ? 'Trả nhà' : 'Trả phòng', style: 'destructive', onPress: doCheckout },
        ]);
        break;
      }
      case 'activate':
        setTenants(prev => prev.map(t =>
          t.id === tenant.id ? { ...t, status: 'active' } : t
        ));
        setSelectedTenant(null);
        showAlert('Kích hoạt thành công', `${isWH ? 'Nhà nguyên căn' : `Phòng ${tenant.roomName}`} đã kích hoạt cho ${tenant.fullName}.`);
        break;
    }
  }, [navigation, load]);

  const handleQuickAction = useCallback((tenant: Tenant) => {
    const isWH = tenant.propertyType === 'WHOLE_HOUSE';
    showAlert(
      tenant.fullName,
      `${tenant.propertyName} · ${isWH ? 'Nhà nguyên căn' : tenant.roomName}`,
      [
        { text: 'Xem chi tiết', onPress: () => setSelectedTenant(tenant) },
        { text: '📞 Gọi điện', onPress: () => Linking.openURL(`tel:${tenant.phone}`) },
        { text: '🧾 Hóa đơn', onPress: () => handleAction('billing', tenant) },
        { text: '🔧 Yêu cầu bảo trì', onPress: () => handleAction('maintenance', tenant) },
        { text: '📋 Hợp đồng', onPress: () => handleAction('contract', tenant) },
        { text: 'Hủy', style: 'cancel' },
      ]
    );
  }, [handleAction]);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {navigation.canGoBack() && (
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.backBtnText}>‹</Text>
            </TouchableOpacity>
          )}
          <View>
            <Text style={styles.title}>Khách thuê</Text>
            <Text style={styles.subtitle}>{filtered.length} kết quả · {stats.active} đang ở</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('ResumeContract')}>
          <Text style={styles.addBtnText}>+ Đón khách</Text>
        </TouchableOpacity>
      </View>

      {/* Summary stats */}
      <View style={styles.statsRow}>
        <StatTile value={stats.active} label="Đang ở" color="#16A34A" bg="#F0FDF4" />
        <StatTile value={stats.overdue} label="Có nợ" color="#DC2626" bg="#FEF2F2" />
        <StatTile value={stats.expiring} label="Sắp HH HĐ" color="#B45309" bg="#FFFBEB" />
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm theo tên, SĐT, phòng, CCCD..."
          placeholderTextColor="#94A3B8"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
        decelerationRate="fast"
      >
        {FILTER_DEFS.map(f => {
          const active = activeFilter === f.key;
          const count = filterCounts[f.key];
          return (
            <FilterChip
              key={f.key}
              label={f.label}
              count={count}
              selected={active}
              onPress={() => setActiveFilter(f.key)}
            />
          );
        })}
      </ScrollView>

      {/* Property filter */}
      {properties.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.propScroll}
          contentContainerStyle={styles.propContent}
          decelerationRate="fast"
        >
          {['all', ...properties].map(p => {
            const active = propertyFilter === p;
            return (
              <FilterChip
                key={p}
                label={p === 'all' ? 'Tất cả toà' : p}
                count={propertyCounts[p]}
                selected={active}
                onPress={() => setPropertyFilter(p)}
              />
            );
          })}
        </ScrollView>
      )}

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <TenantCard
            tenant={item}
            onPress={() => setSelectedTenant(item)}
            onQuickAction={() => handleQuickAction(item)}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.emptyDesc}>Đang tải khách thuê...</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTitle}>Chưa có khách thuê</Text>
              <Text style={styles.emptyDesc}>Khách thuê sẽ hiển thị khi có hợp đồng trong các nhà bạn quản lý</Text>
            </View>
          )
        }
      />

      {selectedTenant && (
        <TenantDetailModal
          tenant={selectedTenant}
          onClose={() => setSelectedTenant(null)}
          onAction={handleAction}
        />
      )}
    </SafeAreaView>
  );
};

// ===================== SCREEN STYLES =====================
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', ...Shadow.sm },
  backBtnText: { fontSize: 28, color: '#0F172A', lineHeight: 32 },
  title: { fontSize: 24, fontWeight: '800', color: '#0F172A' },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 1 },
  addBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.md, paddingVertical: 9, borderRadius: 12 },
  addBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },

  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },

  searchContainer: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.lg,
    backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 12,
    marginBottom: 10, ...Shadow.sm,
  },
  searchIcon: { fontSize: 14, marginRight: 6 },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A', paddingVertical: 11 },
  clearBtn: { padding: 4 },
  clearBtnText: { fontSize: 12, color: '#94A3B8', fontWeight: '700' },

  filterScroll: { flexGrow: 0 },
  filterContent: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 6,
    paddingBottom: 12,
    gap: 10,
  },

  propScroll: { flexGrow: 0 },
  propContent: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingTop: 0,
    paddingBottom: 10,
    gap: 10,
  },

  listContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: 100 },

  empty: { alignItems: 'center', paddingTop: 72, gap: 8 },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#334155' },
  emptyDesc: { fontSize: 13, color: '#94A3B8', textAlign: 'center' },
});
