/**
 * THÂN HỢP ĐỒNG dùng chung cho app khách thuê.
 *
 * Tách khỏi `ContractDetailScreen` ngày 27/08/2026 khi thêm màn "Xác nhận hợp đồng":
 * khách phải đọc ĐÚNG những gì màn chi tiết hiện ra rồi mới nhập OTP, nên hai màn bắt
 * buộc hiển thị y hệt nhau. Copy sang màn mới thì bản copy sẽ trôi ngay lần BE thêm
 * field đầu tiên — và khi ấy khách xác nhận một bản hợp đồng khác bản họ xem sau này.
 *
 * Chỉ có PHẦN THÂN cuộn được. Header và các nút hành động do từng màn tự lo, vì đó
 * đúng là chỗ hai màn khác nhau: màn chi tiết có "Yêu cầu trả phòng", màn xác nhận có
 * ô nhập OTP.
 */
import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Modal,
} from 'react-native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { Contract } from '@/types';
import {
  formatDate, getContractStatusLabel, getContractStatusColor, getDaysUntil,
  getContractTerminationTypeLabel,
} from '@/utils';
import {
  ContractDetailDto, TenantHandoverResponse, mapBeContractStatus,
} from '@/services/tenant/selfService';

export const formatDateTime = (iso?: string): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
};

/** Map DTO chi tiết từ BE -> Contract dùng cho UI. */
export const mapDetail = (d: ContractDetailDto): Contract => {
  const daysUntilExpiry = d.endDate ? getDaysUntil(d.endDate) : undefined;
  return {
    id: String(d.id),
    code: d.code,
    type: 'manager_tenant',
    lessorName: d.lessorName ?? '',
    lessorPhone: d.lessorPhone,
    lesseeName: d.lesseeName ?? '',
    lesseeCccd: d.lesseeCccd ?? '',
    lesseePhone: d.lesseePhone ?? '',
    propertyName: d.propertyName ?? '',
    roomCode: d.roomCode,
    startDate: d.startDate,
    endDate: d.endDate,
    // BE trả field `deposit`, không phải `depositAmount` — đọc cả 2 phòng hờ (khớp
    // cách TenantContractScreen.toCardContract đã làm cho màn list).
    depositAmount: d.deposit ?? d.depositAmount ?? 0,
    rentAmount: d.rentAmount ?? 0,
    status: mapBeContractStatus(d.status, daysUntilExpiry),
    equipmentList: (d.equipmentList ?? []).map(e => ({
      id: String(e.id), name: e.name, quantity: e.quantity ?? 1, condition: e.condition ?? '',
    })),
    notes: d.notes,
    signedAt: d.signedAt,
    terminatedAt: d.terminatedAt,
    terminationReason: d.terminationReason,
    pdfUrl: d.pdfUrl,
    daysUntilExpiry,
  };
};

export const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={styles.sectionCard}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

export const InfoRow: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={[styles.infoValue, highlight && { color: Colors.primary, fontWeight: '700' }]}>{value}</Text>
  </View>
);

/** Xem ảnh phóng to. Cả hai màn đều cần, và cả hai đều cần đúng nút đóng này. */
export const ImageViewerModal: React.FC<{ url: string | null; onClose: () => void }> = ({ url, onClose }) => (
  <Modal visible={!!url} transparent animationType="fade">
    <View style={styles.viewer}>
      <TouchableOpacity style={styles.viewerClose} onPress={onClose}>
        <Text style={styles.viewerCloseText}>×</Text>
      </TouchableOpacity>
      {url && <Image source={{ uri: url }} style={styles.viewerImage} resizeMode="contain" />}
    </View>
  </Modal>
);

interface Props {
  contract: Contract;
  /**
   * DTO gốc, giữ bên cạnh bản đã map: các field quản lý không nằm trong type `Contract`
   * dùng chung, mà thêm vào đó chỉ để một màn dùng thì lan ra cả app.
   */
  detailDto?: ContractDetailDto | null;
  /**
   * Ảnh đồng hồ + hiện trạng lúc bàn giao. Chỉ có với HĐ đã ACTIVE (BE trả lỗi cho
   * HĐ draft/pending) — truyền null thì cả mục ẩn đi, không phải lỗi.
   */
  handover?: TenantHandoverResponse | null;
  onImagePress: (url: string) => void;
}

/**
 * Tình trạng thiết bị lúc bàn giao — enum BE → tiếng Việt.
 *
 * Trước đây khối này in THẲNG `eq.condition`, nên khách đọc được đúng chữ "NEW" / "GOOD"
 * trên biên bản bàn giao của chính mình. Bản đồ tương ứng vẫn luôn tồn tại, nhưng nằm
 * trong `TenantOnboardingScreen` (đã bỏ 01/09/2026) và màn đó không dùng chung component
 * này — nên chỗ nào dùng bản đồ thì hiện tiếng Việt, chỗ này thì không.
 *
 * Giá trị lạ thì trả về nguyên văn: thà hiện mã BE còn hơn nuốt mất thông tin.
 */
const CONDITION_LABEL: Record<string, string> = {
  NEW: 'Mới', GOOD: 'Tốt', DAMAGED: 'Hư hại', BROKEN: 'Hỏng',
};
const conditionLabel = (c?: string): string =>
  (c ? CONDITION_LABEL[c.toUpperCase()] ?? c : '—');

export const ContractDetailBody: React.FC<Props> = ({
  contract, detailDto, handover, onImagePress,
}) => {
  const statusColor = getContractStatusColor(contract.status);

  return (
    <>
      <View style={[styles.statusBanner, { backgroundColor: statusColor + '15', borderColor: statusColor + '40' }]}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusText, { color: statusColor }]}>{getContractStatusLabel(contract.status)}</Text>
        {contract.signedAt && (
          <Text style={styles.signedDate}>Ký ngày {formatDate(contract.signedAt)}</Text>
        )}
      </View>

      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>Mã hợp đồng</Text>
        <Text style={styles.codeValue}>{contract.code}</Text>
      </View>

      <SectionCard title="👥 Thông tin các bên">
        <InfoRow label="Bên cho thuê" value={contract.lessorName} />
        {contract.lessorPhone && <InfoRow label="SĐT bên cho thuê" value={contract.lessorPhone} />}
        <InfoRow label="Bên thuê" value={contract.lesseeName} />
        <InfoRow label="CCCD bên thuê" value={contract.lesseeCccd} />
        <InfoRow label="SĐT bên thuê" value={contract.lesseePhone} />
      </SectionCard>

      <SectionCard title="🏠 Thông tin phòng">
        <InfoRow label="Tòa nhà" value={contract.propertyName} />
        {contract.roomCode && <InfoRow label="Phòng" value={contract.roomCode} />}
        <InfoRow label="Ngày bắt đầu" value={formatDate(contract.startDate)} />
        <InfoRow label="Ngày kết thúc" value={formatDate(contract.endDate)} />
        {contract.daysUntilExpiry !== undefined && contract.daysUntilExpiry > 0 && (
          <InfoRow label="Còn lại" value={`${contract.daysUntilExpiry} ngày`} />
        )}
      </SectionCard>

      {/*
        Hai người khác nhau, đừng gộp:
        · "Quản lý phụ trách" đổi mỗi khi công ty đổi người phụ trách khu vực.
        · "Người đón khách" là người đã bàn giao nhà cho khách — không bao giờ đổi, nên
          khách có việc về lúc nhận nhà thì gọi đúng người này.
        HĐ tạo trước 20/08/2026 chưa có dữ liệu người đón khách nên ẩn hẳn dòng đó.
      */}
      {(detailDto?.assignedManagerName || detailDto?.onboardedByManagerName) && (
        <SectionCard title="👤 Người phụ trách">
          {detailDto.assignedManagerName && (
            <InfoRow label="Quản lý phụ trách" value={detailDto.assignedManagerName} />
          )}
          {detailDto.onboardedByManagerName && (
            <>
              <InfoRow label="Người đón khách" value={detailDto.onboardedByManagerName} />
              {detailDto.onboardedByManagerPhone && (
                <InfoRow label="SĐT người đón khách" value={detailDto.onboardedByManagerPhone} />
              )}
              {detailDto.onboardedAt && (
                <InfoRow label="Ngày đón khách" value={formatDate(detailDto.onboardedAt)} />
              )}
            </>
          )}
        </SectionCard>
      )}

      <SectionCard title="💰 Tài chính">
        <InfoRow label="Tiền thuê hàng tháng" value={`${contract.rentAmount.toLocaleString('vi-VN')} đ`} highlight />
        <InfoRow label="Tiền đặt cọc" value={`${contract.depositAmount.toLocaleString('vi-VN')} đ`} />
      </SectionCard>

      {contract.equipmentList.length > 0 && (
        <SectionCard title="📦 Tài sản bàn giao">
          {contract.equipmentList.map((eq, i) => (
            <View key={eq.id} style={[styles.assetRow, i < contract.equipmentList.length - 1 && styles.assetRowBorder]}>
              <View style={styles.assetInfo}>
                <Text style={styles.assetName}>{eq.name}</Text>
                <Text style={styles.assetCondition}>Tình trạng: {conditionLabel(eq.condition)}</Text>
              </View>
              <Text style={styles.assetQty}>x{eq.quantity}</Text>
            </View>
          ))}
        </SectionCard>
      )}

      {!!handover && (
        !!handover.electricMeterImageUrl || !!handover.waterMeterImageUrl ||
        (handover.roomConditionPhotos?.length ?? 0) > 0 || (handover.roomConditionUrls?.length ?? 0) > 0
      ) && (
        <SectionCard title="📷 Hình ảnh hiện trạng lúc bàn giao">
          {(!!handover.electricMeterImageUrl || !!handover.waterMeterImageUrl) && (
            <View style={styles.meterRow}>
              {!!handover.electricMeterImageUrl && (
                <View style={styles.meterCol}>
                  <Text style={styles.meterLabel}>
                    ⚡ Điện{handover.initialElectricReading != null ? ` — ${handover.initialElectricReading} kWh` : ''}
                  </Text>
                  <TouchableOpacity onPress={() => onImagePress(handover.electricMeterImageUrl!)}>
                    <Image source={{ uri: handover.electricMeterImageUrl }} style={styles.meterThumb} />
                  </TouchableOpacity>
                  <Text style={styles.capturedAtText}>🕒 {formatDateTime(handover.electricMeterCapturedAt)}</Text>
                </View>
              )}
              {!!handover.waterMeterImageUrl && (
                <View style={styles.meterCol}>
                  <Text style={styles.meterLabel}>
                    💧 Nước{handover.initialWaterReading != null ? ` — ${handover.initialWaterReading} m³` : ''}
                  </Text>
                  <TouchableOpacity onPress={() => onImagePress(handover.waterMeterImageUrl!)}>
                    <Image source={{ uri: handover.waterMeterImageUrl }} style={styles.meterThumb} />
                  </TouchableOpacity>
                  <Text style={styles.capturedAtText}>🕒 {formatDateTime(handover.waterMeterCapturedAt)}</Text>
                </View>
              )}
            </View>
          )}

          {((handover.roomConditionPhotos?.length ?? handover.roomConditionUrls?.length ?? 0) > 0) && (
            <>
              <Text style={[styles.meterLabel, { marginTop: Spacing.md }]}>🏠 Hiện trạng phòng lúc nhận</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
                {(handover.roomConditionPhotos?.length ?? 0) > 0
                  ? handover.roomConditionPhotos!.map((p, i) => (
                      <View key={`${p.url}-${i}`} style={styles.thumbWrap}>
                        <TouchableOpacity onPress={() => onImagePress(p.url)}>
                          <Image source={{ uri: p.url }} style={styles.thumbImage} />
                        </TouchableOpacity>
                        <Text style={styles.capturedAtText}>🕒 {formatDateTime(p.capturedAt)}</Text>
                      </View>
                    ))
                  : handover.roomConditionUrls!.map((uri, i) => (
                      <TouchableOpacity key={`${uri}-${i}`} onPress={() => onImagePress(uri)}>
                        <Image source={{ uri }} style={styles.thumbImage} />
                      </TouchableOpacity>
                    ))}
              </ScrollView>
            </>
          )}
        </SectionCard>
      )}

      {contract.notes && (
        <SectionCard title="📝 Điều khoản & Ghi chú">
          <Text style={styles.notesText}>{contract.notes}</Text>
        </SectionCard>
      )}

      <SectionCard title="📜 Lịch sử">
        {contract.signedAt && (
          <View style={styles.historyItem}>
            <View style={[styles.historyDot, { backgroundColor: Colors.success }]} />
            <View>
              <Text style={styles.historyTitle}>Đã ký hợp đồng</Text>
              <Text style={styles.historyDate}>{formatDate(contract.signedAt)}</Text>
            </View>
          </View>
        )}
        <View style={styles.historyItem}>
          <View style={[styles.historyDot, { backgroundColor: Colors.primary }]} />
          <View>
            <Text style={styles.historyTitle}>Hợp đồng được tạo</Text>
            <Text style={styles.historyDate}>{formatDate(contract.startDate)}</Text>
          </View>
        </View>
        {contract.terminatedAt && (
          <View style={styles.historyItem}>
            <View style={[styles.historyDot, { backgroundColor: Colors.error }]} />
            <View>
              <Text style={styles.historyTitle}>
                Chấm dứt hợp đồng · {getContractTerminationTypeLabel(contract.terminationType)}
              </Text>
              <Text style={styles.historyDate}>{formatDate(contract.terminatedAt)}</Text>
              {contract.terminationReason && (
                <Text style={styles.historyNote}>{contract.terminationReason}</Text>
              )}
            </View>
          </View>
        )}
      </SectionCard>
    </>
  );
};

/**
 * Style dùng chung cho thân hợp đồng.
 *
 * Export ra ngoài để màn chứa nó dựng header/nút bấm cùng ngôn ngữ hình ảnh (khoảng
 * cách, bo góc, đổ bóng) mà không phải khai lại — hai bộ style rời là cách chắc chắn
 * để hai màn trông lệch nhau.
 */
export const contractBodyStyles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: { padding: Spacing.sm },
  backBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },

  scroll: { flex: 1 },

  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    margin: Spacing.base, padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 14, fontWeight: '700', flex: 1 },
  signedDate: { fontSize: 12, color: Colors.textMuted },

  codeCard: {
    marginHorizontal: Spacing.base, marginBottom: Spacing.md,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm,
    alignItems: 'center',
  },
  codeLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 4 },
  codeValue: { fontSize: 20, fontWeight: '800', color: Colors.primary, letterSpacing: 1 },

  sectionCard: {
    marginHorizontal: Spacing.base, marginBottom: Spacing.md,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  infoLabel: { fontSize: 13, color: Colors.textMuted, flex: 1 },
  infoValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, flex: 1, textAlign: 'right' },

  assetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm },
  assetRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  assetInfo: { flex: 1 },
  assetName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  assetCondition: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  assetQty: { fontSize: 14, fontWeight: '700', color: Colors.primary },

  notesText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22 },

  meterRow: { flexDirection: 'row', gap: Spacing.md },
  meterCol: { flex: 1 },
  meterLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 2 },
  meterThumb: { width: '100%', height: 90, borderRadius: BorderRadius.md, marginTop: Spacing.sm, backgroundColor: Colors.divider },
  imageRow: { marginTop: Spacing.sm },
  thumbImage: { width: 90, height: 90, borderRadius: BorderRadius.md, marginRight: Spacing.sm, backgroundColor: Colors.divider },
  thumbWrap: { marginRight: Spacing.sm, width: 90 },
  capturedAtText: { fontSize: 10, color: Colors.textMuted, marginTop: 4 },

  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '82%' },
  viewerClose: { position: 'absolute', top: 48, right: 24, zIndex: 2, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  viewerCloseText: { color: Colors.white, fontSize: 30, lineHeight: 34 },

  historyItem: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingVertical: Spacing.sm },
  historyDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  historyTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  historyDate: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  historyNote: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, fontStyle: 'italic' },

  actionSection: { paddingHorizontal: Spacing.base, paddingBottom: 40, gap: Spacing.md },
  actionBtnPrimary: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', ...Shadow.md,
  },
  actionBtnPrimaryText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  actionBtnSecondary: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center',
  },
  actionBtnSecondaryText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  actionBtnOutline: {
    borderRadius: BorderRadius.lg, paddingVertical: Spacing.base,
    alignItems: 'center', borderWidth: 1.5,
  },
  actionBtnOutlineText: { fontSize: 15, fontWeight: '700' },
});

const styles = contractBodyStyles;
