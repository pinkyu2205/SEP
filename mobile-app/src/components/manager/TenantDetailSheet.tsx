import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Dimensions, Linking,
} from 'react-native';
import { Colors, Spacing, Shadow } from '@/constants';
import { maskTenantPhone, maskTenantCccd } from '@/constants/managerVisibility';
import { EXPIRING_SOON_DAYS } from '@/utils/contractStatus';
import { serverNow } from '@/utils/serverTime';
import type { TenantContractResponse } from '@/services/tenant/tenantService';

/**
 * KHỐI XEM CHI TIẾT KHÁCH THUÊ — dùng CHUNG cho mọi màn của quản lý.
 *
 * Tách khỏi TenantListScreen 17/08/2026: màn Quản lý nhà & phòng cũng cần xem chi tiết
 * khách của một phòng, mà điều hướng sang một màn khác thì ra một bố cục khác hẳn — cùng
 * một thứ ("chi tiết khách thuê") lại có hai hình dạng. Nay cả hai chỗ mở CÙNG một sheet
 * này, nên sửa một lần là hai chỗ giống nhau.
 *
 * Component chỉ HIỂN THỊ. Mọi thao tác đẩy ra ngoài qua `onAction` vì mỗi màn xử lý một
 * kiểu (vd trả phòng: màn Khách thuê thanh lý HĐ luôn, màn Phòng mở danh sách yêu cầu).
 */

const SCREEN_HEIGHT = Dimensions.get('window').height;
const TODAY = serverNow();
// ===================== TYPES =====================
export type TenantStatus = 'active' | 'pending_activation' | 'moved_out' | 'suspended';
export type TenantPropertyType = 'MULTI_ROOM' | 'WHOLE_HOUSE';

/**
 * Khách thuê trên màn này = MỘT hợp đồng đang hiệu lực.
 *
 * Chỉ giữ field có dữ liệu THẬT từ `TenantContractResponse`. Bản trước có
 * `email`, `notes`, `householdMembers`, `unpaidBills`, `unpaidAmount`, `openTickets`,
 * `moveOutDate` — endpoint không trả cái nào trong số đó, nên chúng vĩnh viễn rỗng/0:
 * banner "⚠️ N hoá đơn chưa thanh toán" không bao giờ hiện, ô "HĐ chưa TT" luôn đứng
 * số 0 như thể mọi khách đều sạch nợ. Bỏ hẳn thay vì để UI đoán.
 * Muốn hiện công nợ theo khách thì cần BE trả kèm ở `/properties/{id}/tenant-contracts`.
 */
export interface Tenant {
  id: string;
  fullName: string;
  /** Chỉ dùng để bấm gọi — hiển thị thì che còn 3 số cuối (maskTenantPhone). */
  phone: string;
  cccd: string;
  propertyName: string;
  propertyId: string;
  roomId: string;
  roomName: string;
  propertyType?: TenantPropertyType;
  status: TenantStatus;
  /** Status thô của BE — hiện ở dòng cuối sheet để đối chiếu khi lệch nhau. */
  rawStatus?: string;
  moveInDate: string;
  contractCode?: string;
  contractStartDate?: string;
  contractEndDate?: string;
  /** Ngày quản lý dự kiến đến đón khách (yyyy-MM-dd) — có ở HĐ chưa nhận phòng. */
  expectedReceptionDate?: string;

  // ─── Tiền cọc: chỉ trạng thái, KHÔNG số tiền (@/constants/managerVisibility) ───
  depositPaid: boolean;
  depositMonths?: number;
  depositPaidAt?: string;
  /** PAYOS | CASH | null — BE suy ra từ payosOrderCode / xác nhận tiền mặt. */
  depositMethod?: string;

  // ─── Hiện trạng lúc đón khách ───
  initialElectricReading?: number;
  initialWaterReading?: number;
  roomPhotoCount: number;
  roomConditionNote?: string;
  hasMeterPhotos: boolean;

  equipmentSnapshot?: string;
  contractFileAvailable?: boolean;
  tenantUsername?: string;
}

// ===================== MAP API → UI =====================
// Trạng thái HĐ từ BE (uppercase) → trạng thái khách thuê dùng trong UI.
// Khách đã trả phòng xong không vào tới đây nữa (lọc bỏ ngay lúc tải — isClosedContract),
// nên chỉ còn: đang ở · chờ kích hoạt · tạm ngưng. HĐ hết hạn mà chưa làm thủ tục trả
// phòng vẫn là khách đang ở — bộ lọc "Sắp hết HĐ" sẽ nhặt ra để quản lý xử lý.
export const mapTenantStatus = (s?: string): TenantStatus => {
  const u = (s || '').toUpperCase();
  if (u.startsWith('PENDING') || u === 'AWAITING_PAYMENT' || u === 'AWAITING_CONFIRM') return 'pending_activation';
  if (u === 'SUSPENDED') return 'suspended';
  // DRAFT đã bị lọc bỏ từ lúc tải (xem `loadTenants`) — nhưng vẫn chặn tường minh ở đây:
  // trước kia nó rơi vào `return 'active'` bên dưới và thành "Đang ở", đúng kiểu lỗi mà
  // nhánh mặc định âm thầm nuốt một trạng thái mới rồi gắn nhãn sai.
  if (u === 'DRAFT' || u === 'AWAITING_ONBOARD') return 'pending_activation';
  return 'active';
};

export const fmtIsoDate = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('vi-VN');
};

// 1 hợp đồng (BE) + thông tin nhà → 1 khách thuê (UI).
export const mapContractToTenant = (
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
  rawStatus: c.status,
  moveInDate: fmtIsoDate(c.moveInDate || c.startDate),
  contractCode: c.contractCode,
  contractStartDate: c.startDate,
  contractEndDate: c.endDate,   // ISO (yyyy-MM-dd)
  expectedReceptionDate: c.expectedReceptionDate,

  // Ưu tiên mốc thu thật (`depositPaidAt`) rồi mới tới `paymentStatus` — cùng lý do đã
  // ghi ở doc/BE-NEED-trang-thai-tien-coc-sai: suy trạng thái tiền từ nguồn gián tiếp
  // là chỗ sinh ra hai màn nói ngược nhau.
  depositPaid: !!c.depositPaidAt || (c.paymentStatus || '').toUpperCase() === 'PAID',
  depositMonths: c.depositMonths,
  depositPaidAt: c.depositPaidAt,
  depositMethod: c.depositMethod,

  initialElectricReading: c.initialElectricReading,
  initialWaterReading: c.initialWaterReading,
  roomPhotoCount: c.roomConditionPhotos?.length ?? c.roomConditionUrls?.length ?? 0,
  roomConditionNote: c.roomConditionNote,
  hasMeterPhotos: !!c.electricMeterImageUrl || !!c.waterMeterImageUrl,

  equipmentSnapshot: c.equipmentSnapshot,
  contractFileAvailable: c.contractFileAvailable,
  tenantUsername: c.tenantUsername,
});

// ===================== HELPERS =====================
export const getDaysRemaining = (dateStr: string): number =>
  Math.ceil((new Date(dateStr).getTime() - TODAY.getTime()) / 86400000);

/** Ngày ISO/datetime → "17/08/2026". */
const fmtDateTime = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
};

const DEPOSIT_METHOD_LABEL: Record<string, string> = {
  PAYOS: 'Chuyển khoản (PayOS)',
  CASH: 'Tiền mặt — quản lý xác nhận',
};

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

export const getAvatarColor = (name: string) =>
  AVATAR_PALETTE[name.charCodeAt(0) % AVATAR_PALETTE.length];

export interface ChipInfo { label: string; color: string; bg: string }

/**
 * Chip tình trạng THU CỌC của khách — thứ duy nhất về tiền mà endpoint này trả thật
 * (và chỉ trạng thái, không số tiền — @/constants/managerVisibility).
 *
 * ⚠️ Từng có nhãn "✓ Đã thanh toán" suy từ `unpaidBills`, mà field đó luôn để cứng 0 vì
 * BE không trả công nợ theo khách → MỌI khách đều được gắn nhãn xanh đã trả tiền, kể cả
 * người chưa đóng đồng nào. Đã bỏ cả nhãn lẫn field (17/08/2026).
 */
export const getFinancialChip = (t: Tenant): ChipInfo | null => {
  if (t.status === 'moved_out') return null;
  if (t.status === 'pending_activation')
    return { label: 'Chưa nhận phòng', color: '#94A3B8', bg: '#F1F5F9' };
  return t.depositPaid
    ? { label: '✓ Đã thu cọc', color: '#16A34A', bg: '#F0FDF4' }
    : { label: 'Chưa thu cọc', color: '#D97706', bg: '#FFFBEB' };
};

export const getContractChip = (t: Tenant): ChipInfo | null => {
  if (!t.contractEndDate || t.status === 'moved_out') return null;
  const days = getDaysRemaining(t.contractEndDate);
  if (days < 0) return { label: `❌ Hết hạn ${-days} ngày`, color: '#DC2626', bg: '#FEE2E2' };
  if (days <= EXPIRING_SOON_DAYS) return { label: `⏰ Còn ${days} ngày`, color: '#B45309', bg: '#FEF3C7' };
  if (days <= 90) return { label: `📋 Còn ${days} ngày`, color: '#0369A1', bg: '#E0F2FE' };
  return null;
};

/** Đã lưu hiện trạng lúc đón khách chưa: cần cả 2 chỉ số + ít nhất 1 ảnh phòng. */
export const hasInspection = (t: Tenant): boolean =>
  t.initialElectricReading != null && t.initialWaterReading != null && t.roomPhotoCount > 0;

/** Cảnh báo thiếu hiện trạng — chỉ khách đã nhận phòng mới cần. */
export const getInspectionChip = (t: Tenant): ChipInfo | null =>
  t.status === 'active' && !hasInspection(t)
    ? { label: '📷 Thiếu hiện trạng', color: '#7C3AED', bg: '#F5F3FF' }
    : null;

export const STATUS_CONFIG: Record<TenantStatus, { label: string; color: string; bg: string }> = {
  active: { label: 'Đang ở', color: '#16A34A', bg: '#F0FDF4' },
  pending_activation: { label: 'Chờ nhận', color: '#D97706', bg: '#FFFBEB' },
  moved_out: { label: 'Đã rời', color: '#6B7280', bg: '#F3F4F6' },
  suspended: { label: 'Tạm ngưng', color: '#EF4444', bg: '#FEF2F2' },
};

export const StatusBadge: React.FC<{ status: TenantStatus }> = ({ status }) => {
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
export const InfoChip: React.FC<{ label: string; color: string; bg: string }> = ({ label, color, bg }) => (
  <View style={[chipStyles.chip, { backgroundColor: bg, borderColor: color + '30' }]}>
    <Text style={[chipStyles.text, { color }]}>{label}</Text>
  </View>
);

const chipStyles = StyleSheet.create({
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  text: { fontSize: 11, fontWeight: '600' },
});

// ===================== SHEET =====================
export const TenantDetailSheet: React.FC<{
  tenant: Tenant;
  onClose: () => void;
  onAction: (action: string, tenant: Tenant) => void;
}> = ({ tenant, onClose, onAction }) => {
  const isWholeHouse = tenant.propertyType === 'WHOLE_HOUSE';
  const avatarColor = isWholeHouse
    ? { bg: '#FEF3C7', text: '#B45309' }
    : getAvatarColor(tenant.fullName);
  const financialChip = getFinancialChip(tenant);
  const contractChip = getContractChip(tenant);
  const inspectionChip = getInspectionChip(tenant);

  const daysLeft = tenant.contractEndDate ? getDaysRemaining(tenant.contractEndDate) : null;
  const remainingText =
    daysLeft == null ? '' : daysLeft < 0 ? ` · quá ${-daysLeft} ngày` : ` · còn ${daysLeft} ngày`;

  /** Có ít nhất một mẩu dữ liệu hiện trạng → hiện chi tiết (kèm chỗ nào còn thiếu). */
  const hasAnyInspectionData =
    tenant.initialElectricReading != null
    || tenant.initialWaterReading != null
    || tenant.roomPhotoCount > 0
    || tenant.hasMeterPhotos
    || !!tenant.roomConditionNote;

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
                <Text style={mStyles.tenantName} numberOfLines={2}>{tenant.fullName}</Text>
                {/* Phòng trước, tên nhà sau và được phép cắt — giống thẻ trong danh sách.
                    Tên nhà dài ("MTX#13 THEO_PHONG full NT") đứng đầu thì trên máy hẹp
                    bị cắt đúng chỗ có số phòng, mất luôn thông tin cần nhất. */}
                <Text style={mStyles.tenantSub} numberOfLines={1}>
                  {isWholeHouse ? 'Nhà nguyên căn' : tenant.roomName} · {tenant.propertyName}
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

            {/* Status chips */}
            {(financialChip || contractChip || inspectionChip) && (
              <View style={mStyles.chipRow}>
                {financialChip && <InfoChip {...financialChip} />}
                {contractChip && <InfoChip {...contractChip} />}
                {inspectionChip && <InfoChip {...inspectionChip} />}
              </View>
            )}

            {/* ─── HỢP ĐỒNG ─── */}
            <View style={mStyles.section}>
              <Text style={mStyles.sectionTitle}>Hợp đồng thuê</Text>
              {!!tenant.contractCode && <InfoRow label="🔖 Mã hợp đồng" value={tenant.contractCode} />}
              <InfoRow
                label={isWholeHouse ? '🏠 Tài sản' : '🚪 Phòng'}
                value={isWholeHouse ? `${tenant.propertyName} — nguyên căn` : `${tenant.roomName} · ${tenant.propertyName}`}
              />
              {tenant.status === 'pending_activation' && !!tenant.expectedReceptionDate && (
                <InfoRow label="🚚 Hẹn đón khách" value={fmtIsoDate(tenant.expectedReceptionDate)} accent />
              )}
              <InfoRow label="📅 Ngày vào ở" value={tenant.moveInDate || '—'} />
              {!!tenant.contractStartDate && tenant.contractStartDate !== tenant.moveInDate && (
                <InfoRow label="📆 HĐ hiệu lực từ" value={fmtIsoDate(tenant.contractStartDate)} />
              )}
              {!!tenant.contractEndDate && (
                <InfoRow
                  label="📋 Hạn hợp đồng"
                  value={`${fmtIsoDate(tenant.contractEndDate)}${remainingText}`}
                  highlight={getDaysRemaining(tenant.contractEndDate) <= EXPIRING_SOON_DAYS}
                />
              )}
            </View>

            {/* ─── TIỀN CỌC — chỉ trạng thái, không số tiền ─── */}
            <View style={mStyles.section}>
              <Text style={mStyles.sectionTitle}>Tiền cọc</Text>
              <InfoRow
                label="💰 Trạng thái"
                value={tenant.depositPaid ? '✓ Đã thu' : 'Chưa thu'}
                accent={tenant.depositPaid}
                highlight={!tenant.depositPaid}
              />
              {!!tenant.depositMonths && (
                <InfoRow label="📐 Mức cọc" value={`${tenant.depositMonths} tháng tiền nhà`} />
              )}
              {!!tenant.depositPaidAt && (
                <InfoRow label="🕒 Thu lúc" value={fmtDateTime(tenant.depositPaidAt)} />
              )}
              {!!tenant.depositMethod && (
                <InfoRow
                  label="🏦 Hình thức"
                  value={DEPOSIT_METHOD_LABEL[tenant.depositMethod.toUpperCase()] ?? tenant.depositMethod}
                />
              )}
              {/* Một dòng là đủ — @/constants/managerVisibility có câu giải thích dài,
                  nhưng nhét cả câu vào mỗi lần mở sheet thì đọc mệt. */}
              <Text style={mStyles.sectionNote}>Không hiển thị số tiền cọc — chỉ trạng thái đã/chưa thu.</Text>
            </View>

            {/* ─── HIỆN TRẠNG LÚC ĐÓN KHÁCH ─── */}
            <View style={mStyles.section}>
              <Text style={mStyles.sectionTitle}>Hiện trạng lúc đón khách</Text>
              {tenant.status === 'pending_activation' ? (
                <Text style={mStyles.sectionNote}>
                  Chưa đón khách — ghi chỉ số điện/nước và chụp ảnh phòng ở bước đón khách.
                </Text>
              ) : hasAnyInspectionData ? (
                <>
                  <InfoRow
                    label="⚡ Chỉ số điện đầu"
                    value={tenant.initialElectricReading != null ? `${tenant.initialElectricReading} kWh` : 'Chưa ghi'}
                    highlight={tenant.initialElectricReading == null}
                  />
                  <InfoRow
                    label="💧 Chỉ số nước đầu"
                    value={tenant.initialWaterReading != null ? `${tenant.initialWaterReading} m³` : 'Chưa ghi'}
                    highlight={tenant.initialWaterReading == null}
                  />
                  <InfoRow
                    label="📷 Ảnh hiện trạng"
                    value={tenant.roomPhotoCount > 0 ? `${tenant.roomPhotoCount} ảnh phòng` : 'Chưa có ảnh'}
                    highlight={tenant.roomPhotoCount === 0}
                  />
                  {tenant.hasMeterPhotos && <InfoRow label="🔢 Ảnh đồng hồ" value="Đã chụp" />}
                  {!!tenant.roomConditionNote && (
                    <View style={mStyles.notesBox}>
                      <Text style={mStyles.notesLabel}>GHI CHÚ HIỆN TRẠNG</Text>
                      <Text style={mStyles.notesText}>{tenant.roomConditionNote}</Text>
                    </View>
                  )}
                </>
              ) : (
                // Khách đã nhận phòng mà không có mống hiện trạng nào là VẤN ĐỀ, không
                // phải "chưa tới bước đó" — thiếu bằng chứng đầu kỳ thì lúc trả phòng
                // không có gì đối chiếu, và hoá đơn điện/nước kỳ đầu không chốt được.
                <View style={mStyles.warnBox}>
                  <Text style={mStyles.warnText}>
                    ⚠️ Chưa lưu hiện trạng phòng và chỉ số điện/nước đầu kỳ.
                  </Text>
                </View>
              )}
            </View>

            {/* ─── NỘI THẤT (BE tự gắn theo inventory nhà) ─── */}
            {!!tenant.equipmentSnapshot && (
              <View style={mStyles.section}>
                <Text style={mStyles.sectionTitle}>Nội thất kèm hợp đồng</Text>
                <Text style={mStyles.bodyText}>{tenant.equipmentSnapshot}</Text>
              </View>
            )}

            {/* ─── LIÊN HỆ ─── */}
            <View style={mStyles.section}>
              <Text style={mStyles.sectionTitle}>Thông tin liên hệ</Text>
              {/* Chỉ hiện 3 SỐ CUỐI, không có nút xem đủ — @/constants/managerVisibility.
                  Trước 17/08/2026 chỗ này lệch nhau: SĐT ẩn sạch còn CCCD hiện NGUYÊN SỐ,
                  tức chính sách chỉ thực thi một nửa mà nửa hở lại là giấy tờ tuỳ thân. */}
              <InfoRow
                label="📱 Điện thoại"
                value={maskTenantPhone(tenant.phone)}
                right={
                  !!tenant.phone && (
                    <TouchableOpacity
                      style={mStyles.callBtn}
                      onPress={() => Linking.openURL(`tel:${tenant.phone}`)}
                    >
                      <Text style={mStyles.callBtnText}>Gọi</Text>
                    </TouchableOpacity>
                  )
                }
              />
              <InfoRow label="🪪 CCCD / MST" value={maskTenantCccd(tenant.cccd)} />
              {!!tenant.tenantUsername && (
                <InfoRow label="👤 Tài khoản app" value={tenant.tenantUsername} />
              )}
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

            {/* Khách chưa nhận phòng: đưa sang màn Đón khách — nơi thật sự kích hoạt được HĐ.
                Trước 17/08/2026 nút "✅ Kích hoạt phòng" ở đây chỉ đổi state trong máy rồi
                báo "Kích hoạt thành công": không gọi API nào, thoát màn là mất, mà quản lý
                lại tin là xong. Kích hoạt thật cần thu cọc + OTP của khách. */}
            {tenant.status === 'pending_activation' && (
              <TouchableOpacity
                style={mStyles.activateBtn}
                onPress={() => onAction('reception', tenant)}
              >
                <Text style={mStyles.activateBtnText}>🚚 Sang màn đón khách</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const InfoRow: React.FC<{
  label: string;
  value: string;
  accent?: boolean;
  highlight?: boolean;
  /** Nút phụ nằm cuối dòng (vd "Gọi" cạnh số điện thoại). */
  right?: React.ReactNode;
}> = ({ label, value, accent, highlight, right }) => (
  <View style={mStyles.infoRow}>
    <Text style={mStyles.infoLabel}>{label}</Text>
    <Text style={[
      mStyles.infoVal,
      accent && { color: Colors.primary, fontWeight: '700' },
      highlight && { color: '#B45309' },
    ]}>
      {value}
    </Text>
    {right}
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

  sectionNote: { fontSize: 12, color: '#94A3B8', lineHeight: 18, marginTop: Spacing.sm },
  bodyText: { fontSize: 13, color: '#334155', lineHeight: 20 },

  callBtn: {
    marginLeft: 10, paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 999, backgroundColor: '#EEF2FF',
  },
  callBtnText: { fontSize: 12, fontWeight: '700', color: '#4F46E5' },

  warnBox: {
    backgroundColor: '#FFFBEB', borderRadius: 12, padding: Spacing.md,
    borderWidth: 1, borderColor: '#F59E0B40',
  },
  warnText: { fontSize: 13, color: '#B45309', lineHeight: 19, fontWeight: '500' },

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

