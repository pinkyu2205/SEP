import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal,
  ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { realEquipmentService } from '@/services/manager/equipmentService';
import QRCode from 'react-native-qrcode-svg';
import { managerPropertyService } from '@/services/manager/propertyService';
import { type ApiProperty } from '@/services/manager/propertyApi';
import type {
  EquipmentDto,
  EquipmentLifecycleStatus,
  EquipmentMaintenanceHistoryDto,
} from '@/types';
import {
  formatCurrency, formatDate, formatDateTime,
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
 * Nguồn dữ liệu hiện tại:
 *   • Nhà      → managerPropertyService.getScopedProperties()  (lọc theo manager đăng nhập)
 *   • Thiết bị → GET /api/v1/properties/{id}/equipments
 *   • Đổi TT   → PATCH /api/v1/equipment/{id}/status
 *   • Lịch sử  → GET   /api/v1/equipment/{id}/maintenance-history
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
}> = ({ item, wholeHouse, houseName, onClose, onStatusChange }) => {
  const cfg = getEquipmentLifecycleColor(item.status);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const [history, setHistory] = useState<EquipmentMaintenanceHistoryDto[]>([]);
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

  const totalRepairCost = history.reduce((s, r) => s + (Number(r.repairCost) || 0), 0);
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

            {/* Lịch sử bảo trì */}
            <View style={detailStyles.section}>
              <View style={detailStyles.historyHeader}>
                <Text style={detailStyles.sectionTitle}>
                  Lịch sử bảo trì{historyLoading ? '' : ` (${history.length})`}
                </Text>
                {totalRepairCost > 0 && (
                  <Text style={detailStyles.totalCost}>Tổng: {formatCurrency(totalRepairCost)}</Text>
                )}
              </View>

              {historyLoading ? (
                <ActivityIndicator size="small" color={Colors.primary} style={{ alignSelf: 'flex-start' }} />
              ) : historyError ? (
                <Text style={detailStyles.historyErr}>{historyError}</Text>
              ) : history.length === 0 ? (
                <Text style={detailStyles.noHistory}>Chưa có lịch sử bảo trì</Text>
              ) : (
                history.map((record) => (
                  <View key={record.id} style={detailStyles.historyCard}>
                    <View style={detailStyles.historyCardHeader}>
                      <Text style={detailStyles.historyTicket}>#{record.requestCode}</Text>
                      <Text style={detailStyles.historyDate}>
                        {formatDateTime(record.maintenanceDate)}
                      </Text>
                    </View>
                    {record.note ? (
                      <Text style={detailStyles.historyDesc}>{record.note}</Text>
                    ) : null}
                    {Number(record.repairCost) > 0 && (
                      <Text style={detailStyles.historyCost}>
                        {formatCurrency(Number(record.repairCost))}
                      </Text>
                    )}
                    {(record.photoUrls?.length ?? 0) > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: Spacing.sm }}>
                        {record.photoUrls!.map((uri, i) => (
                          <Image
                            key={`${record.id}-${i}`}
                            source={{ uri }}
                            style={{ width: 72, height: 72, borderRadius: BorderRadius.md, marginRight: Spacing.sm, backgroundColor: Colors.divider }}
                          />
                        ))}
                      </ScrollView>
                    )}
                  </View>
                ))
              )}
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
  historyDate: { fontSize: 12, color: Colors.textMuted },
  historyDesc: { fontSize: 13, color: Colors.textPrimary, marginBottom: Spacing.xs, lineHeight: 18 },
  historyCost: { fontSize: 13, fontWeight: '700', color: Colors.error },
  historyTicket: { fontSize: 12, color: Colors.primary, fontWeight: '700' },
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
export const EquipmentScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  /**
   * Mở màn này từ một phòng cụ thể (bảng thao tác phòng → "Xem thiết bị trong phòng")
   * thì mở đúng nhà đó và lọc sẵn theo số phòng. Trước 17/08/2026 màn này bỏ qua route
   * params và luôn chọn `list[0]` — bấm từ phòng 101 nhà A lại ra thiết bị của nhà B.
   */
  const paramPropertyId: number | undefined =
    route?.params?.propertyId != null ? Number(route.params.propertyId) : undefined;

  const [houses, setHouses] = useState<ApiProperty[]>([]);
  const [selectedHouseId, setSelectedHouseId] = useState<number | null>(null);
  const [equipments, setEquipments] = useState<EquipmentDto[]>([]);

  const [bootLoading, setBootLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState('Tất cả');
  const [housePickerOpen, setHousePickerOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<EquipmentLifecycleStatus | 'all'>('all');
  // Lọc sẵn theo phòng vừa bấm — `eqGroup` trả về số phòng nên ô tìm khớp được luôn.
  const [search, setSearch] = useState<string>(() => route?.params?.roomCode ?? '');
  const [selectedItem, setSelectedItem] = useState<EquipmentDto | null>(null);

  // Form thêm thiết bị

  const selectedHouse = useMemo(
    () => houses.find((h) => h.id === selectedHouseId) ?? null,
    [houses, selectedHouseId],
  );
  const isWholeHouse = selectedHouse?.wholeHouse === true;

  // Nạp danh sách nhà trong phạm vi phụ trách (1 lần).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await managerPropertyService.getScopedProperties();
        if (!alive) return;
        setHouses(list);
        // Nhà từ params nếu nằm trong phạm vi phụ trách, không thì nhà đầu danh sách.
        const wanted = paramPropertyId != null && list.some((h) => h.id === paramPropertyId)
          ? paramPropertyId
          : list[0]?.id ?? null;
        setSelectedHouseId(wanted);
      } catch (err) {
        if (alive) setError(readApiError(err, 'Không tải được danh sách nhà.'));
      } finally {
        if (alive) setBootLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const loadEquipment = useCallback(async (propertyId: number, silent = false) => {
    if (!silent) setListLoading(true);
    setError(null);
    try {
      // Bỏ tải danh sách phòng: nó chỉ phục vụ ô chọn phòng của modal thêm thiết bị,
      // mà modal đó đã gỡ 20/08/2026.
      const eqs = await realEquipmentService.getByProperty(propertyId);
      setEquipments(eqs ?? []);
    } catch (err) {
      setEquipments([]);
      setError(readApiError(err, 'Không tải được danh sách thiết bị.'));
    } finally {
      setListLoading(false);
    }
  }, []);

  // Đổi nhà → nạp lại thiết bị của nhà đó, và bỏ lọc danh mục (danh mục của nhà cũ
  // thường không tồn tại ở nhà mới, giữ lại là danh sách rỗng không rõ lý do).
  useEffect(() => {
    if (selectedHouseId == null) return;
    setSelectedCategory('Tất cả');
    loadEquipment(selectedHouseId);
  }, [selectedHouseId, loadEquipment]);

  const onRefresh = useCallback(async () => {
    if (selectedHouseId == null) return;
    setRefreshing(true);
    await loadEquipment(selectedHouseId, true);
    setRefreshing(false);
  }, [selectedHouseId, loadEquipment]);

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
        normalizeVi(eqGroup(e, !!isWholeHouse)).includes(q) ||
        String(e.id) === q;
      return matchCat && matchStatus && matchSearch;
    });
  }, [equipments, selectedCategory, selectedStatus, search, isWholeHouse]);

  const grouped = useMemo(() => {
    const groups: Record<string, EquipmentDto[]> = {};
    filtered.forEach((e) => {
      const key = eqGroup(e, !!isWholeHouse);
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
   * Phân bổ tình trạng — trả lời "kho này có gì phải xử lý không" ngay trên đầu màn.
   *
   * Bản cũ chỉ ghi "Tổng: 10 thiết bị". Con số đó không cho biết điều duy nhất manager
   * cần biết khi mở màn: có cái nào đang hỏng hay chờ bảo trì không. Phải cuộn hết
   * danh sách hoặc bấm thử từng chip mới biết.
   */
  const health = useMemo(() => {
    const need = (statusCounts.MAINTENANCE ?? 0) + (statusCounts.DAMAGED ?? 0) + (statusCounts.BROKEN ?? 0);
    const fine = (statusCounts.NEW ?? 0) + (statusCounts.GOOD ?? 0);
    const gone = statusCounts.DISPOSED ?? 0;
    return { need, fine, gone, total: equipments.length };
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

  // ---------- Trạng thái rỗng toàn màn ----------
  if (bootLoading) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.centerText}>Đang tải danh sách nhà...</Text>
      </SafeAreaView>
    );
  }

  if (houses.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <Text style={{ fontSize: 40 }}>🏠</Text>
        <Text style={styles.centerTitle}>Chưa được giao nhà nào</Text>
        <Text style={styles.centerText}>
          {error ?? 'Khi host phân công khu vực, danh sách thiết bị sẽ hiện ở đây.'}
        </Text>
      </SafeAreaView>
    );
  }

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
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Trang thiết bị</Text>
            {/*
              Câu này thay cho "Tổng: N thiết bị" — xem chú thích ở `health`.
              Có cái cần xử lý thì nói ngay và tô cảnh báo; không thì nói gọn là ổn.
            */}
            <Text style={styles.subtitle} numberOfLines={1}>
              {health.total === 0 ? 'Chưa có thiết bị nào' : (
                <>
                  {health.total} thiết bị
                  {health.need > 0
                    ? <Text style={styles.subtitleWarn}> · ⚠️ {health.need} cần xử lý</Text>
                    : <Text style={styles.subtitleOk}> · ✅ tất cả đang tốt</Text>}
                  {health.gone > 0 && <Text style={styles.subtitleMuted}> · {health.gone} đã thanh lý</Text>}
                </>
              )}
            </Text>
          </View>
        </View>
      </View>

      {/*
        Chọn nhà bằng NÚT MỞ DANH SÁCH, không phải thanh chip cuộn ngang.
        Chip cũ vừa cắt cụt tên ("MTX#102 NGUYE…" — mà tên nhà là thứ duy nhất phân biệt
        chúng), vừa giấu các nhà phía sau ngoài mép phải mà không có dấu hiệu gì. Đây cũng
        không phải bộ lọc — nó chọn PHẠM VI đang xem, khác hẳn hai nhóm chip bên dưới.
      */}
      <TouchableOpacity
        style={styles.housePicker}
        onPress={() => setHousePickerOpen(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.houseEmoji}>{selectedHouse?.wholeHouse ? '🏡' : '🏠'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.housePickerName} numberOfLines={1}>
            {selectedHouse?.propertyName ?? 'Chọn nhà'}
          </Text>
          <Text style={styles.housePickerHint}>
            {selectedHouse?.wholeHouse ? 'Nguyên căn' : 'Chia phòng'} · {houses.length} nhà phụ trách
          </Text>
        </View>
        <Text style={styles.housePickerCaret}>▾</Text>
      </TouchableOpacity>

      {/* Tìm kiếm */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍  Tên thiết bị, mã QR, phòng..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Hai nhóm chip đều `flexWrap` — không chip nào bị khuất ngoài mép nữa. */}
      <View style={styles.filterGroup}>
        <Text style={styles.filterGroupLabel}>Trạng thái</Text>
        <View style={styles.chipWrap}>
          {visibleFilters.map((key) => {
            const label = key === 'all' ? 'Tất cả' : getEquipmentLifecycleLabel(key);
            const active = selectedStatus === key;
            const c = key === 'all' ? null : getEquipmentLifecycleColor(key);
            const n = statusCounts[key] ?? 0;
            const hasIssue = (key === 'MAINTENANCE' || key === 'BROKEN') && n > 0;
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
      </View>

      {/* Ẩn khi nhà chỉ có 1 danh mục — lúc đó chip không lọc được gì. */}
      {categories.length > 2 && (
        <View style={styles.filterGroup}>
          <Text style={styles.filterGroupLabel}>Danh mục</Text>
          <View style={styles.chipWrap}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.filterChip, selectedCategory === cat && styles.filterChipActive]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={[styles.filterText, selectedCategory === cat && styles.filterTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Danh sách theo phòng */}
      {listLoading ? (
        <View style={[styles.center, { flex: 1 }]}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          style={styles.listContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
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
                {equipments.length === 0
                  ? 'Nhà này chưa có thiết bị nào'
                  : 'Không có thiết bị khớp bộ lọc'}
              </Text>
            </View>
          ) : (
            grouped.map(([room, items]) => (
              <View key={room} style={styles.roomSection}>
                <Text style={styles.roomTitle}>
                  {room === 'Toàn bộ nhà' ? '🏡 Toàn bộ nhà' : room === COMMON_AREA ? `🧰 ${room}` : `🚪 ${room}`} ({items.length})
                </Text>
                {items.map((eq) => {
                  const cfg = getEquipmentLifecycleColor(eq.status);
                  const warranty = eqWarrantyEnd(eq);
                  return (
                    <TouchableOpacity key={eq.id} style={styles.eqCard} onPress={() => setSelectedItem(eq)}>
                      <View style={styles.eqCardLeft}>
                        <View style={styles.eqTitleRow}>
                          <Text style={styles.eqName} numberOfLines={1}>{eqName(eq)}</Text>
                          {eq.status !== 'GOOD' && eq.status !== 'NEW' && (
                            <View style={[styles.statusDot, { backgroundColor: cfg.bg, borderColor: cfg.text }]}>
                              <Text style={{ fontSize: 10 }}>{STATUS_ICON[eq.status]}</Text>
                            </View>
                          )}
                        </View>
                        {/*
                          Ưu tiên MÃ QR — đó là mã dán trên máy, manager đối chiếu được
                          bằng mắt. `eq.id` là khoá chính trong DB, không có nghĩa với người
                          dùng; chỉ dùng khi thiết bị chưa có mã QR.

                          Danh mục chỉ hiện khi ĐÃ phân loại: chưa nhập thì mọi dòng đều in
                          "Chưa phân loại" — lặp y hệt nhau nên không phân biệt được gì.
                        */}
                        <Text style={styles.eqAssetId}>
                          {[
                            eq.qrCode?.trim() || `#${eq.id}`,
                            eq.category?.trim(),
                            eq.operationalStatus === 'DISABLED' ? 'Đã gỡ' : null,
                          ].filter(Boolean).join(' · ')}
                        </Text>
                        {eq.maintenanceCount > 0 && (
                          <Text style={styles.eqMaint}>🔧 Đã bảo trì {eq.maintenanceCount} lần</Text>
                        )}
                      </View>
                      <View style={styles.eqCardRight}>
                        <View style={[styles.eqStatus, { backgroundColor: cfg.bg }]}>
                          <Text style={[styles.eqStatusText, { color: cfg.text }]}>
                            {getEquipmentLifecycleLabel(eq.status)}
                          </Text>
                        </View>
                        {/*
                          Bảo hành CHỈ hiện khi sắp hết hoặc đã hết.
                          Trước đây in ngày bảo hành trên MỌI dòng — cả nhà tiếp nhận cùng
                          đợt thì mọi thiết bị cùng một ngày, lặp y hệt nhau xuống hết màn
                          mà không phân biệt được gì. Còn hạn dài thì đó không phải việc
                          cần làm; hết hạn tới nơi mới là việc.
                        */}
                        {(() => {
                          const w = warrantyFlag(warranty);
                          if (!w) return null;
                          return (
                            <Text style={[styles.eqWarranty, { color: w.color }]}>
                              🛡 {w.label}
                            </Text>
                          );
                        })()}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))
          )}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* Chi tiết */}
      {selectedItem && selectedHouse && (
        <EquipmentDetailModal
          item={selectedItem}
          wholeHouse={!!isWholeHouse}
          houseName={selectedHouse.propertyName}
          onClose={() => setSelectedItem(null)}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* Chọn nhà — thay cho thanh chip cuộn ngang, hiện đủ tên và không giấu nhà nào */}
      {housePickerOpen && (
        <Modal transparent animationType="fade" onRequestClose={() => setHousePickerOpen(false)}>
          <TouchableOpacity
            style={styles.pickerBackdrop}
            activeOpacity={1}
            onPress={() => setHousePickerOpen(false)}
          >
            <View style={styles.pickerSheet}>
              <Text style={styles.pickerTitle}>Chọn nhà ({houses.length})</Text>
              <ScrollView bounces={false} style={{ maxHeight: 380 }}>
                {houses.map((h) => {
                  const active = h.id === selectedHouseId;
                  return (
                    <TouchableOpacity
                      key={h.id}
                      style={[styles.pickerRow, active && styles.pickerRowActive]}
                      onPress={() => { setSelectedHouseId(h.id); setHousePickerOpen(false); }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.houseEmoji}>{h.wholeHouse ? '🏡' : '🏠'}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pickerRowName, active && styles.pickerRowNameActive]} numberOfLines={2}>
                          {h.propertyName}
                        </Text>
                        <Text style={styles.pickerRowType}>
                          {h.wholeHouse ? 'Nguyên căn' : 'Chia phòng'}
                        </Text>
                      </View>
                      {active && <Text style={styles.pickerCheck}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.sm },
  centerTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  centerText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, paddingTop: Spacing.xl },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 28, color: Colors.textPrimary, lineHeight: 32 },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  subtitleWarn:  { color: Colors.error, fontWeight: '800' },
  subtitleOk:    { color: Colors.success, fontWeight: '700' },
  subtitleMuted: { color: Colors.textMuted },
  houseEmoji: { fontSize: 16 },

  // ── Chọn nhà ────────────────────────────────────────────────────────────
  housePicker: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.lg, marginTop: Spacing.md,
    paddingHorizontal: Spacing.md, paddingVertical: 10,
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.primary + '40',
  },
  housePickerName: { fontSize: 14, fontWeight: '800', color: Colors.primary },
  housePickerHint: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  housePickerCaret: { fontSize: 16, color: Colors.primary, fontWeight: '800' },

  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg, paddingBottom: Spacing.xl,
  },
  pickerTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.md },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: 12, paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg, marginBottom: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  pickerRowActive: { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  pickerRowName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  pickerRowNameActive: { color: Colors.primary },
  pickerRowType: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  pickerCheck: { fontSize: 16, fontWeight: '800', color: Colors.primary },

  // ── Nhóm chip lọc ───────────────────────────────────────────────────────
  filterGroup: { paddingHorizontal: Spacing.lg, marginTop: Spacing.sm },
  filterGroupLabel: {
    fontSize: 10, fontWeight: '800', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6,
  },
  /** Chip rộng theo nội dung + tự xuống dòng — không có tỉ lệ nào để tính sai. */
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  /** Lọc ra 0 kết quả → làm nhạt cho khỏi mất công bấm thử. */
  chipEmpty: { opacity: 0.45 },
  statusChip: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  statusChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  statusChipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  statusChipTextActive: { color: Colors.white },
  searchContainer: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  searchInput: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md, fontSize: 14, color: Colors.textPrimary, ...Shadow.sm },
  filterRow: { maxHeight: 48 },
  filterContent: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  filterChip: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, marginRight: Spacing.sm },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },
  listContainer: { flex: 1 },
  errorBox: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: '#FEF2F2', borderLeftWidth: 3, borderLeftColor: Colors.error, gap: Spacing.xs },
  errorText: { fontSize: 13, color: Colors.error },
  retryText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: Spacing.md },
  emptyText: { fontSize: 14, color: Colors.textSecondary },
  roomSection: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  roomTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  eqCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', backgroundColor: Colors.white, borderRadius: BorderRadius.md, padding: Spacing.base, marginBottom: Spacing.sm, ...Shadow.sm },
  eqCardLeft: { flex: 1 },
  eqCardRight: { alignItems: 'flex-end', gap: Spacing.xs, marginLeft: Spacing.sm },
  eqTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 },
  eqName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, flexShrink: 1 },
  statusDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  eqAssetId: { fontSize: 11, color: Colors.textMuted, marginBottom: 2 },
  eqMaint: { fontSize: 11, color: Colors.textSecondary, fontWeight: '500' },
  wholeHouseLocationHint: {
    fontSize: 13,
    color: '#D97706',
    fontWeight: '700',
    backgroundColor: '#FEF3C7',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  eqStatus: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  eqStatusText: { fontSize: 11, fontWeight: '600' },
  eqWarranty: { fontSize: 10, color: Colors.textMuted },
  // Modal
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  modalSubtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.lg, marginTop: 2 },
  inputGroup: { marginBottom: Spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
  input: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: 15, color: Colors.textPrimary },
  categoryRow: { flexDirection: 'row', gap: Spacing.sm },
  cancelBtn: { backgroundColor: Colors.background, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  submitBtn: { backgroundColor: Colors.primary, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  submitBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
});
