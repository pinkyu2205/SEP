import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { realEquipmentService } from '@/services/manager/equipmentService';
import { managerPropertyService } from '@/services/manager/propertyService';
import { realPropertyService, type ApiProperty, type ApiRoom } from '@/services/manager/propertyApi';
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
 *   • Phòng    → GET /api/v1/properties/{id}/rooms             (chỉ để chọn phòng khi thêm)
 *   • Thiết bị → GET /api/v1/properties/{id}/equipments
 *   • Đổi TT   → PATCH /api/v1/equipment/{id}/status-feature
 *   • Thêm     → POST  /api/v1/properties/{id}/equipments
 *   • Lịch sử  → GET   /api/v1/equipment/{id}/maintenance-history-feature
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

/** Chip lọc nhanh — không liệt kê đủ 6 trạng thái cho đỡ rối, phần còn lại nằm ở "Tất cả". */
const QUICK_FILTERS: (EquipmentLifecycleStatus | 'all')[] = [
  'all', 'GOOD', 'MAINTENANCE', 'BROKEN', 'DISPOSED',
];

const SOURCE_LABEL: Record<string, string> = {
  INITIAL_HANDOVER: 'Có sẵn khi nhận nhà',
  PURCHASED: 'Công ty mua mới',
  ADDED_BY_TENANT: 'Khách lắp thêm',
};

/** Gợi ý danh mục khi thêm thiết bị — BE nhận chuỗi tự do nên đây chỉ là phím tắt. */
const CATEGORY_SUGGESTIONS = ['Điện lạnh', 'Điện nước', 'Nội thất', 'Thiết bị', 'Hạ tầng'];

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
      <View style={detailStyles.overlay}>
        <ScrollView bounces={false}>
          <View style={detailStyles.content}>
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

            {/* QR — chỉ hiện khi BE thực sự có mã */}
            {item.qrCode ? (
              <View style={detailStyles.qrBox}>
                <Text style={{ fontSize: 40 }}>📱</Text>
                <Text style={detailStyles.qrCode}>{item.qrCode}</Text>
                <Text style={detailStyles.qrHint}>
                  Dán mã QR này lên thiết bị để khách scan báo sự cố
                </Text>
              </View>
            ) : null}

            {/* Thông tin */}
            <View style={detailStyles.section}>
              <Text style={detailStyles.sectionTitle}>Chi tiết thiết bị</Text>
              <Row label="Vị trí" value={`${houseName} · ${eqGroup(item, wholeHouse)}`} />
              <Row label="Danh mục" value={eqCategory(item)} />
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
                  </View>
                ))
              )}
            </View>

            <View style={{ height: 40 }} />
          </View>
        </ScrollView>
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
  const [rooms, setRooms] = useState<ApiRoom[]>([]);

  const [bootLoading, setBootLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState('Tất cả');
  const [selectedStatus, setSelectedStatus] = useState<EquipmentLifecycleStatus | 'all'>('all');
  // Lọc sẵn theo phòng vừa bấm — `eqGroup` trả về số phòng nên ô tìm khớp được luôn.
  const [search, setSearch] = useState<string>(() => route?.params?.roomCode ?? '');
  const [selectedItem, setSelectedItem] = useState<EquipmentDto | null>(null);

  // Form thêm thiết bị
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState(CATEGORY_SUGGESTIONS[2]);
  const [newCost, setNewCost] = useState('');
  const [newRoomId, setNewRoomId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      const [eqs, rms] = await Promise.all([
        realEquipmentService.getByProperty(propertyId),
        realPropertyService.getRooms(propertyId).catch(() => [] as ApiRoom[]),
      ]);
      setEquipments(eqs ?? []);
      setRooms(rms ?? []);
    } catch (err) {
      setEquipments([]);
      setError(readApiError(err, 'Không tải được danh sách thiết bị.'));
    } finally {
      setListLoading(false);
    }
  }, []);

  // Đổi nhà → nạp lại thiết bị + phòng của nhà đó.
  useEffect(() => {
    if (selectedHouseId == null) return;
    setSelectedCategory('Tất cả');
    setNewRoomId(null);
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

  const handleAdd = async () => {
    if (!newName.trim()) return showAlert('Thiếu thông tin', 'Vui lòng nhập tên thiết bị.');
    if (!newCategory.trim()) return showAlert('Thiếu thông tin', 'Vui lòng nhập danh mục.');
    if (selectedHouseId == null) return;
    if (!isWholeHouse && rooms.length > 0 && newRoomId == null) {
      return showAlert('Thiếu thông tin', 'Chọn phòng lắp thiết bị, hoặc chọn "Khu vực chung".');
    }

    setSubmitting(true);
    try {
      const cost = Number(newCost.replace(/\D/g, ''));
      await realEquipmentService.create(selectedHouseId, {
        equipmentName: newName.trim(),
        category: newCategory.trim(),
        cost: Number.isFinite(cost) && cost > 0 ? cost : undefined,
        roomId: newRoomId ?? undefined,
      });
      setShowAddModal(false);
      setNewName(''); setNewCost(''); setNewRoomId(null);
      await loadEquipment(selectedHouseId, true);
      showAlert('Đã thêm thiết bị', `"${newName.trim()}" đã được ghi nhận vào nhà này.`);
    } catch (err) {
      showAlert('Không thêm được', readApiError(err, 'Vui lòng thử lại.'));
    } finally {
      setSubmitting(false);
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
          <View>
            <Text style={styles.title}>Trang thiết bị</Text>
            <Text style={styles.subtitle}>Tổng: {equipments.length} thiết bị</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
          <Text style={styles.addBtnText}>+ Thêm</Text>
        </TouchableOpacity>
      </View>

      {/* Tab nhà */}
      <View style={styles.houseTabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.houseTabs}>
          {houses.map((h) => (
            <TouchableOpacity
              key={h.id}
              style={[styles.houseTab, selectedHouseId === h.id && styles.houseTabActive]}
              onPress={() => setSelectedHouseId(h.id)}
            >
              <Text style={styles.houseEmoji}>{h.wholeHouse ? '🏡' : '🏠'}</Text>
              <Text
                style={[styles.houseTabText, selectedHouseId === h.id && styles.houseTabTextActive]}
                numberOfLines={1}
              >
                {h.propertyName}
              </Text>
              {h.wholeHouse && (
                <Text style={[styles.houseTypeMini, selectedHouseId === h.id && styles.houseTypeMiniActive]}>
                  Nguyên căn
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Chip trạng thái */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.statusSummaryRow} contentContainerStyle={styles.statusSummaryContent}>
        {QUICK_FILTERS.map((key) => {
          const label = key === 'all' ? 'Tất cả' : getEquipmentLifecycleLabel(key);
          const active = selectedStatus === key;
          const c = key === 'all' ? null : getEquipmentLifecycleColor(key);
          const hasIssue = (key === 'MAINTENANCE' || key === 'BROKEN') && statusCounts[key] > 0;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.statusChip, active && styles.statusChipActive,
                !active && hasIssue && { borderColor: c!.text }]}
              onPress={() => setSelectedStatus(key)}
            >
              <Text style={[styles.statusChipText, active && styles.statusChipTextActive,
                !active && hasIssue && { color: c!.text }]}>
                {label} ({statusCounts[key] ?? 0})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

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

      {/* Lọc danh mục — ẩn khi nhà chỉ có 1 danh mục, chip lúc đó vô nghĩa */}
      {categories.length > 2 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={styles.filterRow} contentContainerStyle={styles.filterContent}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.filterChip, selectedCategory === cat && styles.filterChipActive]}
              onPress={() => setSelectedCategory(cat)}
            >
              <Text style={[styles.filterText, selectedCategory === cat && styles.filterTextActive]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
                        <Text style={styles.eqAssetId}>
                          #{eq.id} · {eqCategory(eq)}
                          {eq.operationalStatus === 'DISABLED' ? ' · Đã gỡ' : ''}
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
                        {warranty ? (
                          <Text style={styles.eqWarranty}>🛡 {formatDate(warranty)}</Text>
                        ) : null}
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

      {/* Thêm thiết bị */}
      {showAddModal && (
        <Modal transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
          <View style={styles.modalOverlay}>
            <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Thêm thiết bị mới</Text>
                <Text style={styles.modalSubtitle}>
                  {selectedHouse?.propertyName}{isWholeHouse ? ' · Nhà nguyên căn' : ''}
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Tên thiết bị *</Text>
                  <TextInput
                    style={styles.input} value={newName} onChangeText={setNewName}
                    placeholder="Điều hòa Daikin 9000BTU..."
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>

                {!isWholeHouse && rooms.length > 0 && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Lắp ở đâu? *</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={styles.categoryRow}>
                        <TouchableOpacity
                          style={[styles.catChip, newRoomId === null && styles.catChipActive]}
                          onPress={() => setNewRoomId(null)}
                        >
                          <Text style={[styles.catChipText, newRoomId === null && { color: Colors.white }]}>
                            {COMMON_AREA}
                          </Text>
                        </TouchableOpacity>
                        {rooms.map((r) => (
                          <TouchableOpacity
                            key={r.id}
                            style={[styles.catChip, newRoomId === r.id && styles.catChipActive]}
                            onPress={() => setNewRoomId(r.id)}
                          >
                            <Text style={[styles.catChipText, newRoomId === r.id && { color: Colors.white }]}>
                              {r.roomNumber}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                )}

                {isWholeHouse && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Vị trí</Text>
                    <Text style={styles.wholeHouseLocationHint}>Gắn trực tiếp với toàn bộ nhà nguyên căn</Text>
                  </View>
                )}

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Danh mục *</Text>
                  <TextInput
                    style={styles.input} value={newCategory} onChangeText={setNewCategory}
                    placeholder="Điện lạnh, Nội thất..."
                    placeholderTextColor={Colors.textMuted}
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: Spacing.sm }}>
                    <View style={styles.categoryRow}>
                      {CATEGORY_SUGGESTIONS.map((c) => (
                        <TouchableOpacity
                          key={c}
                          style={[styles.catChip, newCategory === c && styles.catChipActive]}
                          onPress={() => setNewCategory(c)}
                        >
                          <Text style={[styles.catChipText, newCategory === c && { color: Colors.white }]}>{c}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Chi phí mua (không bắt buộc)</Text>
                  <TextInput
                    style={styles.input} value={newCost} onChangeText={setNewCost}
                    keyboardType="numeric" placeholder="8500000"
                    placeholderTextColor={Colors.textMuted}
                  />
                </View>

                <View style={{ flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg }}>
                  <TouchableOpacity
                    style={[styles.cancelBtn, { flex: 1 }]}
                    disabled={submitting}
                    onPress={() => setShowAddModal(false)}
                  >
                    <Text style={styles.cancelBtnText}>Hủy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.submitBtn, { flex: 2 }, submitting && { opacity: 0.6 }]}
                    disabled={submitting}
                    onPress={handleAdd}
                  >
                    {submitting
                      ? <ActivityIndicator size="small" color={Colors.white} />
                      : <Text style={styles.submitBtnText}>Thêm thiết bị</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </View>
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
  addBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: BorderRadius.lg },
  addBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  houseTabsContainer: { borderBottomWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.white },
  houseTabs: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md },
  houseTab: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, gap: 6, maxWidth: 240 },
  houseTabActive: { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  houseEmoji: { fontSize: 16 },
  houseTabText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, flexShrink: 1 },
  houseTabTextActive: { color: Colors.primary },
  houseTypeMini: { fontSize: 10, fontWeight: '700', color: '#D97706', backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: BorderRadius.full },
  houseTypeMiniActive: { backgroundColor: Colors.white, color: Colors.primary },
  statusSummaryRow: { maxHeight: 46 },
  statusSummaryContent: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.sm },
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.xl, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  modalSubtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.lg, marginTop: 2 },
  inputGroup: { marginBottom: Spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
  input: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: 15, color: Colors.textPrimary },
  categoryRow: { flexDirection: 'row', gap: Spacing.sm },
  catChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  catChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catChipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  cancelBtn: { backgroundColor: Colors.background, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  submitBtn: { backgroundColor: Colors.primary, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  submitBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
});
