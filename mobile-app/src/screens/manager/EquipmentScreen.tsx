import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { realEquipmentService } from '@/services/manager/equipmentService';
import QRCode from 'react-native-qrcode-svg';
import { managerPropertyService } from '@/services/manager/propertyService';
import { type ApiProperty } from '@/services/manager/propertyApi';
import { EquipmentSummaryCard } from '@/components/manager/EquipmentSummaryCard';
import type {
  EquipmentDto,
  EquipmentLifecycleStatus,
  MaintenanceRequestDto,
} from '@/types';
import { MAINTENANCE_STATUS_META } from '@/constants/maintenance';
import { mapBeStatus } from '@/services/shared/maintenanceMappers';
import {
  formatCurrency, formatDate,
  getEquipmentLifecycleLabel, getEquipmentLifecycleColor, getHouseAreaLabel,
  normalizeVi, readApiError, showAlert,
} from '@/utils';

/**
 * Trang thiết bị (Operations Manager) — 100% dữ liệu thật.
 *
 * Trước 15/08/2026 màn này chạy trên MOCK_HOUSES + MOCK_EQUIPMENT: 4 căn nhà và 10
 * thiết bị viết cứng trong file, nút "Thêm" chỉ push vào state, đổi trạng thái chỉ
 * đổi màu chip. Manager nhìn vào tưởng đang quản lý kho thật.
 *
 * Mỗi màn chỉ xem MỘT nhà — không có nút đổi nhà; xem `EquipmentScreen` bên dưới.
 *
 * Nguồn dữ liệu hiện tại:
 *   • Nhà      → managerPropertyService.getScopedProperties()  (lọc theo manager đăng nhập)
 *   • Thiết bị → GET /api/v1/properties/{id}/equipments
 *   • Đổi TT   → PATCH /api/v1/equipment/{id}/status
 *   • Lịch sử  → GET   /api/v1/equipment/{id}/maintenance-tickets  (trả phiếu bảo trì)
 *
 * Trạng thái dùng thẳng enum EquipmentStatus của BE (6 giá trị) thay vì bộ 5 nhãn cũ
 * của FE — bộ cũ phải map lossy (replaced/retired đều thành DISPOSED) nên bấm xong
 * load lại là nhãn nhảy sang chỗ khác.
 */

// ===================== HẰNG SỐ =====================
const STATUS_ORDER: EquipmentLifecycleStatus[] = [
  'NEW', 'GOOD', 'MAINTENANCE', 'DAMAGED', 'BROKEN', 'DISPOSED',
];

const STATUS_ICON: Record<EquipmentLifecycleStatus, string> = {
  NEW: '🆕', GOOD: '✅', MAINTENANCE: '🔧', DAMAGED: '⚠️', BROKEN: '❌', DISPOSED: '♻️',
};

/**
 * Chip lọc — ĐỦ 6 trạng thái, nhưng chỉ vẽ chip nào thật sự có thiết bị.
 *
 * ─── Vì sao đổi (30/08/2026) ─────────────────────────────────────────────────
 * Bản cũ cố định 5 chip `['all','GOOD','MAINTENANCE','BROKEN','DISPOSED']` và bỏ hẳn
 * `NEW` + `DAMAGED` "cho đỡ rối". Nhưng một nhà vừa tiếp nhận thì THIẾT BỊ NÀO CŨNG
 * `NEW` — kết quả: 4 chip cùng hiện "(0)" chiếm hai dòng, còn 10 thiết bị đang có thì
 * không chip nào lọc ra được. Giấu trạng thái đi không làm màn gọn hơn, chỉ làm bộ lọc
 * nói dối về những gì đang có.
 *
 * Nay lấy đủ 6 và lọc theo dữ liệu thật ở `visibleFilters`: nhà toàn đồ mới thì chỉ
 * thấy "Tất cả · Mới lắp đặt" — hai chip, một dòng, và bấm được.
 */
const QUICK_FILTERS: (EquipmentLifecycleStatus | 'all')[] = ['all', ...STATUS_ORDER];

/** Bảo hành còn dưới ngần này ngày thì mới đáng báo. */
const WARRANTY_WARN_DAYS = 60;

/**
 * Nhãn bảo hành — trả `null` khi CÒN HẠN DÀI, tức phần lớn thiết bị sẽ không hiện gì.
 * Chỉ hai tình huống đáng chiếm chỗ trên dòng: sắp hết hạn, và đã hết.
 */
const warrantyFlag = (end?: string | null): { label: string; color: string } | null => {
  if (!end) return null;
  const d = new Date(`${String(end).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { label: 'Hết bảo hành', color: Colors.textMuted };
  if (days <= WARRANTY_WARN_DAYS) return { label: `BH còn ${days} ngày`, color: Colors.warning };
  return null;
};

const SOURCE_LABEL: Record<string, string> = {
  INITIAL_HANDOVER: 'Có sẵn khi nhận nhà',
  PURCHASED: 'Công ty mua mới',
  ADDED_BY_TENANT: 'Khách lắp thêm',
};

const UNCATEGORIZED = 'Chưa phân loại';
const COMMON_AREA = 'Khu vực chung';

// ===================== TIỆN ÍCH =====================
const eqName = (e: EquipmentDto): string =>
  e.equipmentName?.trim() || e.catalogName?.trim() || `Thiết bị #${e.id}`;

const eqCategory = (e: EquipmentDto): string => e.category?.trim() || UNCATEGORIZED;

/** Nhóm hiển thị: phòng nào, hay gắn thẳng vào nhà. */
const eqGroup = (e: EquipmentDto, wholeHouse: boolean): string => {
  const room = e.roomNumber?.trim() || e.roomName?.trim();
  if (room) return room;
  return wholeHouse ? 'Toàn bộ nhà' : COMMON_AREA;
};

const eqWarrantyEnd = (e: EquipmentDto): string | null | undefined =>
  e.warrantyEndDate ?? e.warrantyExpiredDate;

const eqInstalled = (e: EquipmentDto): string | null | undefined =>
  e.installationDate ?? e.warrantyStartDate;

// ===================== MODAL CHI TIẾT =====================
const EquipmentDetailModal: React.FC<{
  item: EquipmentDto;
  wholeHouse: boolean;
  houseName: string;
  onClose: () => void;
  onStatusChange: (id: number, status: EquipmentLifecycleStatus) => Promise<void>;
  /** Mở phiếu bảo trì đầy đủ (ảnh, dòng thời gian) — màn này chỉ tóm tắt. */
  onOpenTicket: (ticketId: number) => void;
}> = ({ item, wholeHouse, houseName, onClose, onStatusChange, onOpenTicket }) => {
  const cfg = getEquipmentLifecycleColor(item.status);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const [history, setHistory] = useState<MaintenanceRequestDto[]>([]);
  /** Phiếu đang mở chi tiết trong danh sách lịch sử (null = tất cả đang gọn). */
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setHistoryLoading(true);
    setHistoryError(null);
    realEquipmentService
      .getMaintenanceHistory(item.id)
      .then((rows) => { if (alive) setHistory(rows ?? []); })
      .catch((err) => {
        if (alive) setHistoryError(readApiError(err, 'Không tải được lịch sử bảo trì.'));
      })
      .finally(() => { if (alive) setHistoryLoading(false); });
    return () => { alive = false; };
  }, [item.id]);

  // Tiền sửa công ty đã chi = tổng hoá đơn sửa chữa manager nhập trên phiếu.
  const totalRepairCost = history.reduce((s, r) => s + (Number(r.invoiceAmount) || 0), 0);
  const disabled = item.operationalStatus === 'DISABLED';

  const pickStatus = async (status: EquipmentLifecycleStatus) => {
    setShowStatusPicker(false);
    setSaving(true);
    try {
      await onStatusChange(item.id, status);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      {/*
        ScrollView phải nằm TRONG khối `content`, không phải bọc ngoài.
        Bản cũ là overlay → ScrollView → content(maxHeight 92%): phần trăm chiều cao đo
        theo khung cha, mà cha ở đây là nội dung của ScrollView — vốn cao vô hạn. Nên
        `maxHeight` không chặn được gì, sheet tràn quá đáy màn hình và ô "Cập nhật trạng
        thái" cùng "Lịch sử bảo trì" bị cắt mất.
      */}
      <View style={detailStyles.overlay}>
        <View style={detailStyles.content}>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={detailStyles.header}>
              <Text style={detailStyles.title}>{eqName(item)}</Text>
              <TouchableOpacity onPress={onClose}>
                <Text style={detailStyles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Trạng thái + mã */}
            <View style={detailStyles.idRow}>
              <View style={[detailStyles.statusBadge, { backgroundColor: cfg.bg }]}>
                <Text style={detailStyles.statusIcon}>{STATUS_ICON[item.status] ?? '•'}</Text>
                <Text style={[detailStyles.statusText, { color: cfg.text }]}>
                  {getEquipmentLifecycleLabel(item.status)}
                </Text>
              </View>
              <Text style={detailStyles.assetId}>#{item.id}</Text>
            </View>

            {disabled && (
              <View style={detailStyles.disabledBox}>
                <Text style={detailStyles.disabledTitle}>Đã gỡ khỏi phòng</Text>
                <Text style={detailStyles.disabledText}>
                  Thiết bị không còn tính vào biên bản bàn giao của khách đang thuê
                  {item.disabledReason ? ` · Lý do: ${item.disabledReason}` : ''}
                </Text>
              </View>
            )}

            {/*
              Mã QR THẬT, không phải emoji.
              Bản cũ vẽ 📱 rồi ghi "Dán mã QR này lên thiết bị" — chẳng có mã nào để dán,
              chỉ có chuỗi "EQ-251". `react-native-qrcode-svg` đã nằm sẵn trong dự án và
              đang được dùng ở 3 màn khác (thu tiền, đón khách).
            */}
            {item.qrCode ? (
              <View style={detailStyles.qrBox}>
                <View style={detailStyles.qrCanvas}>
                  <QRCode value={item.qrCode} size={120} backgroundColor="#FFFFFF" />
                </View>
                <Text style={detailStyles.qrCode}>{item.qrCode}</Text>
                <Text style={detailStyles.qrHint}>
                  In và dán lên thiết bị — khách scan để báo hỏng đúng máy này
                </Text>
              </View>
            ) : null}

            {/* Thông tin */}
            <View style={detailStyles.section}>
              <Text style={detailStyles.sectionTitle}>Chi tiết thiết bị</Text>
              <Row label="Vị trí" value={`${houseName} · ${eqGroup(item, wholeHouse)}`} />
              {/* Chưa phân loại thì bỏ hẳn dòng — in "Chưa phân loại" không cho biết thêm gì. */}
              {item.category?.trim() ? <Row label="Danh mục" value={item.category.trim()} /> : null}
              {item.houseArea ? <Row label="Khu vực" value={getHouseAreaLabel(item.houseArea)} /> : null}
              {item.source ? <Row label="Nguồn gốc" value={SOURCE_LABEL[item.source] ?? item.source} /> : null}
              {item.price != null ? (
                <Row label="Giá trị" value={formatCurrency(Number(item.price))} highlight />
              ) : null}
              <Row label="Lắp đặt" value={formatDate(eqInstalled(item))} />
              {eqWarrantyEnd(item) ? (
                <Row label="Bảo hành đến" value={formatDate(eqWarrantyEnd(item))} warn />
              ) : null}
              {item.penaltyFee != null ? (
                <Row label="Phạt nếu hư" value={formatCurrency(Number(item.penaltyFee))} warn />
              ) : null}
              {item.lastMaintenanceDate ? (
                <Row label="Bảo trì gần nhất" value={formatDate(item.lastMaintenanceDate)} />
              ) : null}
              {item.note ? <Row label="Ghi chú" value={item.note} /> : null}
            </View>

            {/*
              Lịch sử bảo trì đứng TRƯỚC ô đổi trạng thái: mở một thiết bị ra thường là để
              hỏi "máy này hỏng mấy lần rồi, sửa gì" — đó là thứ phải thấy ngay.
            */}
            <View style={detailStyles.section}>
              <View style={detailStyles.historyHeader}>
                <Text style={detailStyles.sectionTitle}>
                  Lịch sử bảo trì{historyLoading ? '' : ` (${history.length})`}
                </Text>
                {totalRepairCost > 0 && (
                  <Text style={detailStyles.totalCost}>Đã chi: {formatCurrency(totalRepairCost)}</Text>
                )}
              </View>

              {historyLoading ? (
                <ActivityIndicator size="small" color={Colors.primary} style={{ alignSelf: 'flex-start' }} />
              ) : historyError ? (
                <Text style={detailStyles.historyErr}>{historyError}</Text>
              ) : history.length === 0 ? (
                <Text style={detailStyles.noHistory}>Chưa hỏng lần nào</Text>
              ) : (
                /*
                  GỌN MẶC ĐỊNH, BẤM MỚI MỞ. Mỗi lần sửa một dòng: mã · hỏng gì · trạng thái +
                  ngày. Chi tiết (sửa thế nào, lỗi do ai, tiền) chỉ mở khi bấm — bung hết ra thì
                  vài lần sửa đã dài quá một màn hình, đẩy ô đổi trạng thái xuống tít dưới.
                */
                <View style={detailStyles.historyList}>
                  {history.map((r, idx) => {
                    const st = MAINTENANCE_STATUS_META[mapBeStatus(r.status) as keyof typeof MAINTENANCE_STATUS_META]
                      ?? MAINTENANCE_STATUS_META.in_repair;
                    const what = r.title?.trim() || r.description?.trim() || 'Phiếu bảo trì';
                    const how = r.repairDescription?.trim() || r.resolutionNote?.trim();
                    const tenantFault = !!r.damageCause && r.damageCause !== 'WEAR';
                    const cost = Number(r.invoiceAmount) || 0;
                    const open = expandedId === r.id;
                    return (
                      <View key={r.id} style={idx > 0 && detailStyles.historyDivider}>
                        <TouchableOpacity
                          style={detailStyles.historyRow}
                          onPress={() => setExpandedId(open ? null : r.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={detailStyles.historyTicket}>#{r.requestCode}</Text>
                          <Text style={detailStyles.historyDesc} numberOfLines={1}>{what}</Text>
                          <Text style={[detailStyles.historyStatus, { color: st.color }]}>
                            {st.icon} {formatDate(r.resolvedAt ?? r.createdAt).slice(0, 5)}
                          </Text>
                          <Text style={detailStyles.historyCaret}>{open ? '▴' : '▾'}</Text>
                        </TouchableOpacity>

                        {open && (
                          <View style={detailStyles.historyBody}>
                            <Text style={[detailStyles.historyLine, { color: st.color, fontWeight: '700' }]}>
                              {st.label}
                            </Text>
                            {!!how && <Text style={detailStyles.historyLine}>🔧 {how}</Text>}
                            <Text style={detailStyles.historyDate}>
                              Báo {formatDate(r.createdAt)}
                              {r.resolvedAt ? ` · Xong ${formatDate(r.resolvedAt)}` : ''}
                              {r.roomName ? ` · ${r.roomName}` : ''}
                            </Text>
                            {(tenantFault || cost > 0) && (
                              <View style={detailStyles.historyFoot}>
                                {tenantFault && <Text style={detailStyles.historyFault}>⚠️ Lỗi do khách</Text>}
                                {cost > 0 && <Text style={detailStyles.historyCost}>{formatCurrency(cost)}</Text>}
                              </View>
                            )}
                            <TouchableOpacity onPress={() => onOpenTicket(r.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                              <Text style={detailStyles.historyOpen}>Xem phiếu ›</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Đổi trạng thái */}
            <View style={detailStyles.section}>
              <Text style={detailStyles.sectionTitle}>Cập nhật trạng thái</Text>
              <TouchableOpacity
                style={detailStyles.statusPickerBtn}
                disabled={saving}
                onPress={() => setShowStatusPicker(true)}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <>
                    <Text style={[detailStyles.statusPickerText, { color: cfg.text }]}>
                      {STATUS_ICON[item.status] ?? '•'} {getEquipmentLifecycleLabel(item.status)}
                    </Text>
                    <Text style={detailStyles.statusPickerArrow}>▼</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </View>

      {/* Chọn trạng thái */}
      {showStatusPicker && (
        <Modal transparent animationType="fade" onRequestClose={() => setShowStatusPicker(false)}>
          <TouchableOpacity
            style={detailStyles.pickerOverlay}
            activeOpacity={1}
            onPress={() => setShowStatusPicker(false)}
          >
            <View style={detailStyles.pickerContent}>
              <Text style={detailStyles.pickerTitle}>Cập nhật trạng thái</Text>
              {STATUS_ORDER.map((key) => {
                const c = getEquipmentLifecycleColor(key);
                return (
                  <TouchableOpacity
                    key={key}
                    style={[detailStyles.pickerOption, item.status === key && detailStyles.pickerOptionActive]}
                    onPress={() => pickStatus(key)}
                  >
                    <Text style={detailStyles.pickerOptionIcon}>{STATUS_ICON[key]}</Text>
                    <Text style={[detailStyles.pickerOptionText, { color: c.text }]}>
                      {getEquipmentLifecycleLabel(key)}
                    </Text>
                    {item.status === key && <Text style={detailStyles.pickerCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </Modal>
  );
};

const Row: React.FC<{ label: string; value: string; highlight?: boolean; warn?: boolean }> = ({
  label, value, highlight, warn,
}) => (
  <View style={detailStyles.infoRow}>
    <Text style={detailStyles.infoLabel}>{label}</Text>
    <Text
      style={[
        detailStyles.infoVal,
        highlight && { color: Colors.primary },
        warn && { color: Colors.warning },
      ]}
    >
      {value}
    </Text>
  </View>
);

const detailStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  content: {
    backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl, padding: Spacing.xl, maxHeight: '92%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  title: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, flex: 1, marginRight: Spacing.md },
  closeBtn: { fontSize: 20, color: Colors.textMuted, padding: 4 },
  idRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full },
  statusIcon: { fontSize: 14 },
  statusText: { fontSize: 13, fontWeight: '700' },
  assetId: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  disabledBox: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.md,
    borderLeftWidth: 3, borderLeftColor: Colors.textMuted, marginBottom: Spacing.lg,
  },
  disabledTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, marginBottom: 2 },
  disabledText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  qrBox: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.xl,
    padding: Spacing.lg, alignItems: 'center', marginBottom: Spacing.lg,
  },
  /** Nền trắng có đệm quanh mã — máy quét cần vùng trắng viền quanh mới bắt được. */
  qrCanvas: {
    backgroundColor: '#FFFFFF', padding: 10, borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
  },
  qrCode: { fontSize: 16, fontWeight: '800', color: Colors.primary, marginTop: 4, letterSpacing: 1 },
  qrHint: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', marginTop: Spacing.sm },
  section: { marginBottom: Spacing.lg },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderColor: Colors.divider,
  },
  infoLabel: { fontSize: 14, color: Colors.textSecondary },
  infoVal: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, textAlign: 'right', flex: 1, marginLeft: Spacing.md },
  statusPickerBtn: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    padding: Spacing.base, borderWidth: 1.5, borderColor: Colors.border, minHeight: 52,
  },
  statusPickerText: { fontSize: 15, fontWeight: '700' },
  statusPickerArrow: { fontSize: 12, color: Colors.textMuted },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  totalCost: { fontSize: 13, fontWeight: '700', color: Colors.error },
  noHistory: { fontSize: 14, color: Colors.textMuted, fontStyle: 'italic' },
  historyErr: { fontSize: 13, color: Colors.error },
  historyCard: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  historyCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  historyList: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md },
  historyDivider: { borderTopWidth: 1, borderTopColor: Colors.divider },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 10 },
  historyTicket: { fontSize: 12, color: Colors.primary, fontWeight: '700' },
  historyDesc: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  historyStatus: { fontSize: 12, fontWeight: '700' },
  historyCaret: { fontSize: 12, color: Colors.textMuted },
  historyBody: { paddingBottom: Spacing.md, gap: 3 },
  historyLine: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  historyDate: { fontSize: 11, color: Colors.textMuted },
  historyFoot: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  historyFault: { fontSize: 11, fontWeight: '700', color: Colors.error },
  historyCost: { fontSize: 13, fontWeight: '700', color: Colors.error },
  historyOpen: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginTop: 2, alignSelf: 'flex-end' },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: Spacing.xl },
  pickerContent: { backgroundColor: Colors.white, borderRadius: BorderRadius.xl, padding: Spacing.xl },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.lg },
  pickerOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.lg, marginBottom: Spacing.sm },
  pickerOptionActive: { backgroundColor: Colors.primaryBg },
  pickerOptionIcon: { fontSize: 18 },
  pickerOptionText: { fontSize: 15, fontWeight: '600', flex: 1 },
  pickerCheck: { fontSize: 16, color: Colors.primary, fontWeight: '800' },
});


// ===================== MÀN CHÍNH =====================
/**
 * HAI CHẾ ĐỘ, không còn nút đổi nhà (18/09/2026).
 *
 *  • Có `propertyId` (vào từ chi tiết nhà, từ một phòng, hoặc từ danh sách nhà bên dưới)
 *    → chỉ xem thiết bị của ĐÚNG nhà đó.
 *  • Không có (vào từ ô "Thiết bị" ở trang chủ) → danh sách nhà phụ trách; bấm nhà nào
 *    thì `push` một màn Thiết bị của nhà đó, "Quay lại" là về danh sách.
 *
 * Bản trước có thanh chọn nhà ngay trong màn: đang đứng ở nhà A mà bấm một cái là danh
 * sách đổi sang đồ của nhà B, trong khi tiêu đề và đường quay lại vẫn thuộc về nhà A.
 *
 * Lối vào từ trang chủ LUÔN là danh sách nhà, kể cả khi chỉ phụ trách 1 nhà: đó là mục
 * "chọn nhà", khác hẳn mục "thiết bị của nhà này" trong chi tiết nhà. Nhảy thẳng vào nhà
 * duy nhất thì hai lối vào trông y hệt nhau (user chốt 18/09/2026).
 */
export const EquipmentScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const paramPropertyId: number | undefined =
    route?.params?.propertyId != null ? Number(route.params.propertyId) : undefined;

  const [houses, setHouses] = useState<ApiProperty[]>([]);
  const [bootLoading, setBootLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  // Nạp danh sách nhà trong phạm vi phụ trách (1 lần) — cũng là rào quyền cho `propertyId`.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await managerPropertyService.getScopedProperties();
        if (alive) setHouses(list);
      } catch (err) {
        if (alive) setBootError(readApiError(err, 'Không tải được danh sách nhà.'));
      } finally {
        if (alive) setBootLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const house = paramPropertyId != null
    ? houses.find((h) => h.id === paramPropertyId) ?? null
    : null;

  if (bootLoading) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  if (houses.length === 0 || (paramPropertyId != null && !house)) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="Thiết bị" onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined} />
        <View style={[styles.center, { flex: 1 }]}>
          <Text style={{ fontSize: 40 }}>🏠</Text>
          <Text style={styles.centerTitle}>
            {houses.length === 0 ? 'Chưa được giao nhà nào' : 'Nhà này không thuộc phạm vi của bạn'}
          </Text>
          <Text style={styles.centerText}>
            {bootError ?? (houses.length === 0
              ? 'Khi host phân công khu vực, thiết bị của các nhà sẽ hiện ở đây.'
              : 'Liên hệ admin nếu bạn cần quản lý nhà này.')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!house) {
    return (
      <HouseList
        houses={houses}
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
        onOpen={(h) => navigation.push('Equipment', { propertyId: h.id })}
      />
    );
  }

  return (
    <HouseEquipment
      house={house}
      initialSearch={route?.params?.roomCode ?? ''}
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
    />
  );
};

// ===================== DANH SÁCH NHÀ =====================
const HouseList: React.FC<{
  houses: ApiProperty[];
  onBack?: () => void;
  onOpen: (h: ApiProperty) => void;
}> = ({ houses, onBack, onOpen }) => {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const q = normalizeVi(query.trim());
    return q ? houses.filter((h) => normalizeVi(h.propertyName).includes(q)) : houses;
  }, [houses, query]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader
        title="Thiết bị"
        subtitle={`Chọn nhà để xem thiết bị · ${houses.length} nhà phụ trách`}
        onBack={onBack}
      />
      <ScrollView contentContainerStyle={styles.houseListContent} showsVerticalScrollIndicator={false}>
        {/* Ít nhà thì ô tìm chỉ là thứ chắn đường. */}
        {houses.length > 5 && (
          <TextInput
            style={[styles.searchInput, { marginBottom: Spacing.md }]}
            placeholder="🔍  Tìm nhà..."
            placeholderTextColor={Colors.textMuted}
            value={query}
            onChangeText={setQuery}
          />
        )}
        {visible.map((h) => (
          <EquipmentSummaryCard
            key={h.id}
            propertyId={h.id}
            title={h.propertyName}
            icon={h.wholeHouse ? '🏡' : '🏠'}
            prefix={h.wholeHouse ? 'Nguyên căn' : 'Chia phòng'}
            onOpen={() => onOpen(h)}
          />
        ))}
        {visible.length === 0 && (
          <Text style={[styles.centerText, { marginTop: Spacing.xl }]}>Không có nhà nào khớp</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

// ===================== THIẾT BỊ CỦA MỘT NHÀ =====================
const HouseEquipment: React.FC<{
  house: ApiProperty;
  /** Lọc sẵn theo số phòng khi vào từ bảng thao tác của một phòng. */
  initialSearch: string;
  onBack?: () => void;
}> = ({ house, initialSearch, onBack }) => {
  const navigation = useNavigation<any>();
  const isWholeHouse = house.wholeHouse === true;

  const [equipments, setEquipments] = useState<EquipmentDto[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState('Tất cả');
  const [selectedStatus, setSelectedStatus] = useState<EquipmentLifecycleStatus | 'all'>('all');
  const [search, setSearch] = useState<string>(initialSearch);
  const [selectedItem, setSelectedItem] = useState<EquipmentDto | null>(null);

  const loadEquipment = useCallback(async (silent = false) => {
    if (!silent) setListLoading(true);
    setError(null);
    try {
      const eqs = await realEquipmentService.getByProperty(house.id);
      setEquipments(eqs ?? []);
    } catch (err) {
      setEquipments([]);
      setError(readApiError(err, 'Không tải được danh sách thiết bị.'));
    } finally {
      setListLoading(false);
    }
  }, [house.id]);

  useEffect(() => { loadEquipment(); }, [loadEquipment]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEquipment(true);
    setRefreshing(false);
  }, [loadEquipment]);

  // Danh mục lấy từ chính dữ liệu — BE cho nhập tự do nên không thể liệt kê cứng.
  const categories = useMemo(() => {
    const set = new Set(equipments.map(eqCategory));
    return ['Tất cả', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'))];
  }, [equipments]);

  const filtered = useMemo(() => {
    const q = normalizeVi(search.trim());
    return equipments.filter((e) => {
      const matchCat = selectedCategory === 'Tất cả' || eqCategory(e) === selectedCategory;
      const matchStatus = selectedStatus === 'all' || e.status === selectedStatus;
      const matchSearch =
        !q ||
        normalizeVi(eqName(e)).includes(q) ||
        normalizeVi(e.qrCode ?? '').includes(q) ||
        normalizeVi(eqGroup(e, isWholeHouse)).includes(q) ||
        String(e.id) === q;
      return matchCat && matchStatus && matchSearch;
    });
  }, [equipments, selectedCategory, selectedStatus, search, isWholeHouse]);

  const grouped = useMemo(() => {
    const groups: Record<string, EquipmentDto[]> = {};
    filtered.forEach((e) => {
      const key = eqGroup(e, isWholeHouse);
      (groups[key] ||= []).push(e);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, 'vi', { numeric: true }));
  }, [filtered, isWholeHouse]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: equipments.length };
    STATUS_ORDER.forEach((s) => {
      counts[s] = equipments.filter((e) => e.status === s).length;
    });
    return counts;
  }, [equipments]);

  /**
   * Chỉ vẽ chip có thiết bị — cộng chip đang chọn (để còn thấy đường bỏ chọn khi lọc
   * ra rỗng). Xem chú thích ở `QUICK_FILTERS`.
   */
  const visibleFilters = useMemo(
    () => QUICK_FILTERS.filter(k => k === 'all' || (statusCounts[k] ?? 0) > 0 || selectedStatus === k),
    [statusCounts, selectedStatus],
  );

  /**
   * Phân bổ tình trạng — trả lời "nhà này có gì phải xử lý không" ngay trên đầu màn,
   * khỏi phải cuộn hết danh sách hay bấm thử từng chip.
   */
  const health = useMemo(() => {
    const need = (statusCounts.MAINTENANCE ?? 0) + (statusCounts.DAMAGED ?? 0) + (statusCounts.BROKEN ?? 0);
    const gone = statusCounts.DISPOSED ?? 0;
    return { need, gone, total: equipments.length };
  }, [statusCounts, equipments.length]);

  const handleStatusChange = async (id: number, status: EquipmentLifecycleStatus) => {
    try {
      const updated = await realEquipmentService.updateStatus(id, status);
      // Vá tại chỗ để danh sách phản ánh ngay, không đợi round-trip thứ 2.
      setEquipments((prev) => prev.map((e) => (e.id === id ? { ...e, ...updated } : e)));
      showAlert('Đã cập nhật', `Trạng thái thiết bị: ${getEquipmentLifecycleLabel(status)}`);
    } catch (err) {
      showAlert('Không cập nhật được', readApiError(err, 'Vui lòng thử lại.'));
      throw err;
    }
  };

  const groupTitle = (g: string) => {
    if (g === 'Toàn bộ nhà') return '🏡 Toàn bộ nhà';
    if (g === COMMON_AREA) return `🧰 ${g}`;
    return `🚪 ${/^\d/.test(g) ? `Phòng ${g}` : g}`;
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/*
        Tên nhà nằm ở TIÊU ĐỀ, không phải trong một ô bấm được: đây là phạm vi cố định
        của màn, không phải thứ để đổi. Muốn xem nhà khác thì quay lại.
      */}
      <ScreenHeader
        title="Thiết bị"
        houseName={house.propertyName}
        houseIcon={isWholeHouse ? '🏡' : '🏠'}
        onBack={onBack}
        subtitle={listLoading ? undefined : (
          <>
            {isWholeHouse ? 'Nguyên căn' : 'Chia phòng'}
            {health.total === 0 ? ' · chưa có thiết bị' : ` · ${health.total} thiết bị`}
            {health.total > 0 && (health.need > 0
              ? <Text style={styles.subtitleWarn}> · ⚠️ {health.need} cần xử lý</Text>
              : <Text style={styles.subtitleOk}> · ✅ tất cả đang tốt</Text>)}
            {health.gone > 0 && <Text style={styles.subtitleMuted}> · {health.gone} đã thanh lý</Text>}
          </>
        )}
      />

      {listLoading ? (
        <View style={[styles.center, { flex: 1 }]}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.listContainer}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {/* Tìm + lọc cuộn cùng danh sách: ghim cố định thì trên điện thoại chúng ăn
              mất gần nửa màn hình, chỉ còn chỗ cho hai ba thiết bị. */}
          {equipments.length > 0 && (
            <>
              <TextInput
                style={styles.searchInput}
                placeholder="🔍  Tên thiết bị, mã QR, số phòng..."
                placeholderTextColor={Colors.textMuted}
                value={search}
                onChangeText={setSearch}
              />

              {/* Chỉ còn 1 chip ("Tất cả") thì bộ lọc không lọc được gì — ẩn. */}
              {visibleFilters.length > 2 && (
                <View style={styles.chipWrap}>
                  {visibleFilters.map((key) => {
                    const label = key === 'all' ? 'Tất cả' : getEquipmentLifecycleLabel(key);
                    const active = selectedStatus === key;
                    const c = key === 'all' ? null : getEquipmentLifecycleColor(key);
                    const n = statusCounts[key] ?? 0;
                    const hasIssue = (key === 'MAINTENANCE' || key === 'BROKEN' || key === 'DAMAGED') && n > 0;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[styles.statusChip, active && styles.statusChipActive,
                          !active && hasIssue && { borderColor: c!.text },
                          !active && n === 0 && styles.chipEmpty]}
                        onPress={() => setSelectedStatus(key)}
                      >
                        <Text style={[styles.statusChipText, active && styles.statusChipTextActive,
                          !active && hasIssue && { color: c!.text }]}>
                          {label} ({n})
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Ẩn khi nhà chỉ có 1 danh mục — lúc đó chip không lọc được gì. */}
              {categories.length > 2 && (
                <View style={styles.chipWrap}>
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.statusChip, selectedCategory === cat && styles.statusChipActive]}
                      onPress={() => setSelectedCategory(cat)}
                    >
                      <Text style={[styles.statusChipText, selectedCategory === cat && styles.statusChipTextActive]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={onRefresh}>
                <Text style={styles.retryText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {grouped.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 40 }}>📦</Text>
              <Text style={styles.emptyText}>
                {equipments.length === 0 ? 'Nhà này chưa có thiết bị nào' : 'Không có thiết bị khớp bộ lọc'}
              </Text>
            </View>
          ) : (
            /* Mỗi phòng MỘT thẻ, thiết bị là các dòng bên trong — mỗi món một thẻ riêng
               thì nhà 4 phòng × 2 món đã dài ba màn hình. */
            grouped.map(([room, items]) => (
              <View key={room} style={styles.roomSection}>
                <View style={styles.roomHead}>
                  <Text style={styles.roomTitle}>{groupTitle(room)}</Text>
                  <Text style={styles.roomCount}>{items.length} thiết bị</Text>
                </View>
                <View style={styles.roomCard}>
                  {items.map((eq, idx) => {
                    const cfg = getEquipmentLifecycleColor(eq.status);
                    const w = warrantyFlag(eqWarrantyEnd(eq));
                    return (
                      <TouchableOpacity
                        key={eq.id}
                        style={[styles.eqRow, idx > 0 && styles.eqRowDivider]}
                        onPress={() => setSelectedItem(eq)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.eqRowLeft}>
                          <Text style={styles.eqName} numberOfLines={1}>
                            {eq.status !== 'GOOD' && eq.status !== 'NEW' ? `${STATUS_ICON[eq.status]} ` : ''}
                            {eqName(eq)}
                          </Text>
                          {/*
                            Ưu tiên MÃ QR — đó là mã dán trên máy, manager đối chiếu được bằng
                            mắt. Danh mục chỉ hiện khi ĐÃ phân loại: chưa nhập thì dòng nào
                            cũng "Chưa phân loại", lặp y hệt nhau.
                          */}
                          <Text style={styles.eqMeta} numberOfLines={1}>
                            {[
                              eq.qrCode?.trim() || `#${eq.id}`,
                              eq.category?.trim(),
                              eq.operationalStatus === 'DISABLED' ? 'Đã gỡ' : null,
                              eq.maintenanceCount > 0 ? `🔧 ${eq.maintenanceCount} lần sửa` : null,
                            ].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                        <View style={styles.eqRowRight}>
                          <View style={[styles.eqStatus, { backgroundColor: cfg.bg }]}>
                            <Text style={[styles.eqStatusText, { color: cfg.text }]}>
                              {getEquipmentLifecycleLabel(eq.status)}
                            </Text>
                          </View>
                          {/* Bảo hành CHỈ hiện khi sắp hết hoặc đã hết — xem `warrantyFlag`. */}
                          {w && <Text style={[styles.eqWarranty, { color: w.color }]}>🛡 {w.label}</Text>}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))
          )}
          <View style={{ height: 80 }} />
        </ScrollView>
      )}

      {selectedItem && (
        <EquipmentDetailModal
          item={selectedItem}
          wholeHouse={isWholeHouse}
          houseName={house.propertyName}
          onClose={() => setSelectedItem(null)}
          onStatusChange={handleStatusChange}
          // Đóng bảng trước rồi mới sang phiếu — Modal còn mở thì phủ lên màn mới.
          onOpenTicket={(ticketId) => {
            setSelectedItem(null);
            navigation.navigate('MaintenanceTicketDetail', { ticketId });
          }}
        />
      )}
    </SafeAreaView>
  );
};

// ===================== TIÊU ĐỀ =====================
const ScreenHeader: React.FC<{
  title: string;
  houseName?: string;
  houseIcon?: string;
  subtitle?: React.ReactNode;
  onBack?: () => void;
}> = ({ title, houseName, houseIcon, subtitle, onBack }) => (
  <View style={styles.header}>
    {onBack && (
      <TouchableOpacity style={styles.backBtn} onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={styles.backBtnText}>‹</Text>
      </TouchableOpacity>
    )}
    <View style={{ flex: 1 }}>
      <Text style={styles.title}>{title}</Text>
      {!!houseName && (
        <Text style={styles.houseName} numberOfLines={2}>{houseIcon} {houseName}</Text>
      )}
      {subtitle != null && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.sm },
  centerTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  centerText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },

  // ── Tiêu đề ─────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: Spacing.md,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 28, color: Colors.textPrimary, lineHeight: 32 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  houseName: { fontSize: 14, fontWeight: '700', color: Colors.primary, marginTop: 2 },
  subtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  subtitleWarn:  { color: Colors.error, fontWeight: '800' },
  subtitleOk:    { color: Colors.success, fontWeight: '700' },
  subtitleMuted: { color: Colors.textMuted },

  // ── Danh sách nhà ───────────────────────────────────────────────────────
  houseListContent: { paddingHorizontal: Spacing.lg, paddingBottom: 80 },

  // ── Tìm + lọc ───────────────────────────────────────────────────────────
  searchInput: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md,
    fontSize: 14, color: Colors.textPrimary, ...Shadow.sm,
  },
  /** Chip rộng theo nội dung + tự xuống dòng — không chip nào khuất ngoài mép. */
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.sm },
  /** Lọc ra 0 kết quả → làm nhạt cho khỏi mất công bấm thử. */
  chipEmpty: { opacity: 0.45 },
  statusChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  statusChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  statusChipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  statusChipTextActive: { color: Colors.white },

  // ── Danh sách thiết bị ──────────────────────────────────────────────────
  listContainer: { flex: 1 },
  listContent: { paddingHorizontal: Spacing.lg },
  errorBox: {
    marginTop: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.md,
    backgroundColor: '#FEF2F2', borderLeftWidth: 3, borderLeftColor: Colors.error, gap: Spacing.xs,
  },
  errorText: { fontSize: 13, color: Colors.error },
  retryText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: Spacing.md },
  emptyText: { fontSize: 14, color: Colors.textSecondary },

  roomSection: { marginTop: Spacing.lg },
  roomHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    marginBottom: Spacing.sm,
  },
  roomTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  roomCount: { fontSize: 12, color: Colors.textMuted },
  roomCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base, ...Shadow.sm,
  },
  eqRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md },
  eqRowDivider: { borderTopWidth: 1, borderTopColor: Colors.divider },
  eqRowLeft: { flex: 1, marginRight: Spacing.sm },
  eqRowRight: { alignItems: 'flex-end', gap: 2 },
  eqName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  eqMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  eqStatus: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  eqStatusText: { fontSize: 11, fontWeight: '600' },
  eqWarranty: { fontSize: 10, color: Colors.textMuted },
});
