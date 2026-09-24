import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { EquipmentDto, EquipmentMaintenanceHistoryDto } from '@/types';
import {
  formatDate, formatCurrency, getEquipmentLifecycleLabel, getEquipmentLifecycleColor,
  getHouseAreaLabel, guessEquipmentCategory, showAlert,
} from '@/utils';
import { realTenantEquipmentService } from '@/services/tenant/equipmentService';
import { useTenantContract } from '@/hooks';
import {
  useMyEquipmentTickets, summarizeTickets, equipmentDisplayStatus, orphanHistory,
  TICKET_STATUS_META, ticketCost, ticketDoneDate,
} from '@/hooks/useMyEquipmentTickets';
import { extractEquipmentIdFromQr } from '@/utils/equipmentQr';
import { EquipmentQrScanModal } from '@/components/common/EquipmentQrScanModal';

const CATEGORY_ICON: Record<string, string> = {
  electrical: '⚡',
  plumbing: '🚰',
  furniture: '🛋️',
  appliance: '❄️',
  other: '🔧',
};

const equipName = (e: EquipmentDto) => e.equipmentName || e.catalogName || 'Thiết bị';

/**
 * CHI TIẾT THIẾT BỊ (tenant) — làm lại 24/09/2026.
 *
 * Trước đây: header tím chiếm 1/3 màn hình, bảng thông tin lặp lại phòng + "Khu vực: Khác",
 * "Số lần bảo trì 0 lần" và không có lịch sử dù thiết bị đã có phiếu (BE trả rỗng), nút
 * báo hỏng nằm tận cuối. Giờ: thẻ tóm tắt gọn → phiếu đang xử lý (nếu có) → thông tin cần
 * thiết → lịch sử sửa chữa (từ phiếu của chính khách) → nút báo hỏng ghim đáy màn hình.
 */
export const EquipmentDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { selectedContractId } = useTenantContract();
  const equipment: EquipmentDto = route.params?.equipment;
  const [scanVisible, setScanVisible] = useState(false);
  const [checkingScan, setCheckingScan] = useState(false);

  // Chi tiết (ngày mua, bảo hành, khấu hao) + lịch sử của BE. Lỗi mạng thì giữ dữ liệu danh sách.
  const [detail, setDetail] = useState<EquipmentDto | null>(null);
  const [history, setHistory] = useState<EquipmentMaintenanceHistoryDto[]>([]);
  useEffect(() => {
    const id = equipment?.id;
    if (id == null) return;
    let alive = true;
    realTenantEquipmentService.getMyEquipmentById(id)
      .then(d => { if (alive) setDetail(d); })
      .catch(() => { /* giữ dữ liệu từ danh sách */ });
    realTenantEquipmentService.getMyEquipmentHistory(id)
      .then(h => { if (alive) setHistory(h ?? []); })
      .catch(() => { /* BE chưa có lịch sử — dùng phiếu của khách */ });
    return () => { alive = false; };
  }, [equipment?.id]);

  // Nguồn lịch sử chính: phiếu bảo trì của khách gắn với thiết bị này.
  const { byEquipment, loaded: ticketsLoaded } = useMyEquipmentTickets();
  const summary = useMemo(
    () => summarizeTickets(equipment ? byEquipment.get(Number(equipment.id)) : []),
    [byEquipment, equipment],
  );
  const extraHistory = useMemo(() => orphanHistory(history, summary.tickets), [history, summary.tickets]);

  /**
   * Bắt buộc quét đúng QR dán trên thiết bị trước khi mở form báo hỏng (06/09/2026) —
   * tránh tenant bấm nhầm thiết bị trong danh sách rồi báo sai tên máy. Quét lệch nhưng
   * TRÙNG với 1 thiết bị khác trong phòng/nhà thì gợi ý chuyển sang đúng thiết bị đó
   * thay vì chỉ báo lỗi suông — đỡ phải quay lại danh sách tự tìm lại thiết bị.
   */
  const handleScan = async (raw: string) => {
    setScanVisible(false);
    const scannedId = extractEquipmentIdFromQr(raw);
    if (!scannedId) {
      showAlert('Mã QR không hợp lệ', 'Không đọc được mã QR vừa quét. Vui lòng quét lại đúng tem dán trên thiết bị.');
      return;
    }
    if (scannedId === String(equipment.id)) {
      navigation.navigate('MaintenanceCreate', { equipment });
      return;
    }
    setCheckingScan(true);
    try {
      const list = await realTenantEquipmentService.getMyEquipments(selectedContractId ?? undefined);
      const other = list.find(e => String(e.id) === scannedId);
      if (other) {
        showAlert(
          'Không đúng thiết bị này',
          `Có phải bạn đang muốn báo hỏng thiết bị "${equipName(other)}" đúng không?`,
          [
            { text: 'Không phải', style: 'cancel' },
            { text: 'Đúng vậy', onPress: () => navigation.navigate('MaintenanceCreate', { equipment: other }) },
          ],
        );
      } else {
        showAlert('Không khớp thiết bị', 'Mã QR vừa quét không khớp với thiết bị nào trong danh sách của bạn. Vui lòng quét đúng tem dán trên thiết bị cần báo hỏng.');
      }
    } catch {
      showAlert('Lỗi', 'Không kiểm tra được mã QR vừa quét. Vui lòng thử lại.');
    } finally {
      setCheckingScan(false);
    }
  };

  if (!equipment) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>Không tìm thấy thông tin thiết bị.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.errorBtn}>
            <Text style={styles.errorBtnText}>Quay lại</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const eq: EquipmentDto = detail ? {
    ...equipment,
    purchasedAt: detail.purchasedAt,
    warrantyMonths: detail.warrantyMonths ?? equipment.warrantyMonths,
    remainingWarrantyLabel: detail.remainingWarrantyLabel,
    remainingDepreciationAmount: detail.remainingDepreciationAmount,
  } : equipment;
  const name = equipName(eq);
  const categoryIcon = CATEGORY_ICON[guessEquipmentCategory(name)] ?? '🔧';
  const status = equipmentDisplayStatus(equipment.status, summary, st => ({
    label: getEquipmentLifecycleLabel(st), ...getEquipmentLifecycleColor(st),
  }));
  const roomLabel = eq.roomName ?? eq.roomNumber;
  const areaLabel = eq.houseArea ? getHouseAreaLabel(eq.houseArea) : '';
  const installed = eq.purchasedAt ?? eq.installationDate;
  const repairTotal = summary.repairedCount + extraHistory.length;

  const infoRows = [
    ...(areaLabel && areaLabel !== 'Khác' ? [{ label: 'Khu vực', value: areaLabel }] : []),
    { label: 'Ngày lắp đặt', value: installed ? formatDate(installed as string) : 'Chưa có' },
    ...(eq.remainingWarrantyLabel ? [{
      label: 'Bảo hành',
      value: eq.warrantyMonths ? `${eq.remainingWarrantyLabel} (${eq.warrantyMonths} tháng)` : eq.remainingWarrantyLabel,
    }] : []),
    ...(eq.remainingDepreciationAmount != null ? [{
      label: 'Đền bù nếu làm hỏng',
      value: formatCurrency(eq.remainingDepreciationAmount),
      hint: 'Chỉ áp dụng khi hỏng do lỗi sử dụng',
    }] : []),
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Quay lại">
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chi tiết thiết bị</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
        {/* Tóm tắt */}
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.iconBox}><Text style={styles.iconText}>{categoryIcon}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.equipName} numberOfLines={2}>{name}</Text>
              <Text style={styles.equipMeta}>
                {eq.qrCode}{roomLabel ? `  ·  Phòng ${roomLabel}` : ''}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                <Text style={[styles.statusBadgeText, { color: status.text }]}>{status.label}</Text>
              </View>
            </View>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{repairTotal}</Text>
              <Text style={styles.heroStatLabel}>lần đã sửa</Text>
            </View>
            <View style={styles.heroDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>
                {summary.lastRepairedAt ? formatDate(summary.lastRepairedAt) : '—'}
              </Text>
              <Text style={styles.heroStatLabel}>sửa gần nhất</Text>
            </View>
          </View>
        </View>

        {/* Phiếu đang xử lý */}
        {summary.open && (
          <TouchableOpacity
            style={styles.openBanner}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('MaintenanceDetail', { requestId: summary.open!.id })}
          >
            <Text style={styles.openIcon}>🔧</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.openTitle}>
                Phiếu {summary.open.requestCode} · {TICKET_STATUS_META[summary.open.status]?.label ?? summary.open.status}
              </Text>
              <Text style={styles.openSub}>Thiết bị đang được xử lý — bấm để xem tiến độ</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}

        {/* Thông tin */}
        <View style={styles.section}>
          {infoRows.map((row, i) => (
            <View key={row.label} style={[styles.infoRow, i === infoRows.length - 1 && { borderBottomWidth: 0 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>{row.label}</Text>
                {'hint' in row && !!row.hint && <Text style={styles.infoHint}>{row.hint}</Text>}
              </View>
              <Text style={styles.infoValue}>{row.value}</Text>
            </View>
          ))}
        </View>

        {!!equipment.note && (
          <View style={styles.noteCard}>
            <Text style={styles.noteLabel}>Ghi chú từ quản lý</Text>
            <Text style={styles.noteText}>{equipment.note}</Text>
          </View>
        )}

        {/* Lịch sử sửa chữa */}
        <Text style={styles.sectionTitle}>Lịch sử sửa chữa</Text>
        <View style={styles.section}>
          {!ticketsLoaded ? (
            <View style={styles.emptyBox}><ActivityIndicator color={Colors.primary} /></View>
          ) : summary.tickets.length === 0 && extraHistory.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>Thiết bị chưa phải sửa lần nào.</Text>
            </View>
          ) : (
            <>
              {summary.tickets.map((t, i) => {
                const meta = TICKET_STATUS_META[t.status] ?? { label: t.status, bg: Colors.divider, text: Colors.textMuted };
                const cost = ticketCost(t);
                const done = t.status === 'CLOSED';
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.histRow, i > 0 && styles.histBorder]}
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('MaintenanceDetail', { requestId: t.id })}
                  >
                    <View style={[styles.histDot, { backgroundColor: meta.text }]} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.histHead}>
                        <Text style={styles.histCode}>{t.requestCode}</Text>
                        <View style={[styles.histChip, { backgroundColor: meta.bg }]}>
                          <Text style={[styles.histChipText, { color: meta.text }]}>{meta.label}</Text>
                        </View>
                      </View>
                      <Text style={styles.histDesc} numberOfLines={2}>
                        {t.repairDescription || t.resolutionNote || t.description || t.title || 'Báo hỏng thiết bị'}
                      </Text>
                      <Text style={styles.histMeta}>
                        {done ? `Sửa xong ${formatDate(ticketDoneDate(t))}` : `Báo ngày ${formatDate(t.createdAt)}`}
                        {cost != null && cost > 0 ? `  ·  ${formatCurrency(cost)}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </TouchableOpacity>
                );
              })}
              {extraHistory.map((h, i) => (
                <View key={`h-${h.id}`} style={[styles.histRow, (summary.tickets.length > 0 || i > 0) && styles.histBorder]}>
                  <View style={[styles.histDot, { backgroundColor: '#059669' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.histCode}>{h.requestCode ? `Phiếu ${h.requestCode}` : 'Bảo trì'}</Text>
                    {!!h.note && <Text style={styles.histDesc} numberOfLines={2}>{h.note}</Text>}
                    <Text style={styles.histMeta}>
                      {formatDate(h.maintenanceDate)}
                      {h.repairCost != null && h.repairCost > 0 ? `  ·  ${formatCurrency(h.repairCost)}` : ''}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </View>

        <Text style={styles.tip}>Không tự tháo lắp, sửa chữa thiết bị — báo ngay cho quản lý khi có sự cố.</Text>
      </ScrollView>

      {/* Nút báo hỏng ghim đáy — không phải cuộn mới thấy */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.reportBtn, checkingScan && { opacity: 0.6 }]}
          onPress={() => setScanVisible(true)}
          disabled={checkingScan}
          activeOpacity={0.8}
        >
          <Text style={styles.reportBtnText}>
            {checkingScan ? 'Đang kiểm tra mã QR…' : '📷  Quét QR để báo hỏng'}
          </Text>
        </TouchableOpacity>
      </View>

      <EquipmentQrScanModal
        visible={scanVisible}
        title="Quét QR thiết bị cần báo hỏng"
        hint={`Hướng camera vào mã QR dán trên "${name}" để xác nhận đúng thiết bị`}
        onScan={handleScan}
        onClose={() => setScanVisible(false)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  errorText: { fontSize: 15, color: Colors.textSecondary, marginBottom: Spacing.lg },
  errorBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg },
  errorBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.xs,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 30, lineHeight: 34, color: Colors.textPrimary },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },

  body: { padding: Spacing.base, gap: Spacing.md, paddingBottom: 110 },

  hero: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, borderWidth: 1,
    borderColor: Colors.border, padding: Spacing.base, ...Shadow.sm,
  },
  heroTop: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  iconBox: {
    width: 60, height: 60, borderRadius: 16, backgroundColor: Colors.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  iconText: { fontSize: 30 },
  equipName: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  equipMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  statusBadge: {
    alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  heroStats: {
    flexDirection: 'row', marginTop: Spacing.md, paddingTop: Spacing.md,
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatValue: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  heroStatLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  heroDivider: { width: 1, backgroundColor: Colors.divider },

  openBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: '#FFFBEB', borderRadius: BorderRadius.lg, borderWidth: 1,
    borderColor: '#FCD34D', padding: Spacing.md,
  },
  openIcon: { fontSize: 20 },
  openTitle: { fontSize: 13, fontWeight: '800', color: '#92400E' },
  openSub: { fontSize: 12, color: '#B45309', marginTop: 2 },

  section: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, marginTop: Spacing.xs, marginBottom: -4 },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  infoLabel: { fontSize: 13, color: Colors.textMuted },
  infoHint: { fontSize: 11, color: Colors.textMuted, marginTop: 1, fontStyle: 'italic' },
  infoValue: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary, textAlign: 'right' },

  noteCard: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
  },
  noteLabel: { fontSize: 11, fontWeight: '700', color: Colors.primary, textTransform: 'uppercase', letterSpacing: 0.4 },
  noteText: { fontSize: 14, color: Colors.textSecondary, marginTop: 4, lineHeight: 20 },

  emptyBox: { paddingVertical: Spacing.lg, alignItems: 'center' },
  emptyText: { fontSize: 13, color: Colors.textMuted },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  histBorder: { borderTopWidth: 1, borderTopColor: Colors.divider },
  histDot: { width: 8, height: 8, borderRadius: 4, alignSelf: 'flex-start', marginTop: 6 },
  histHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  histCode: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  histChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: BorderRadius.full },
  histChipText: { fontSize: 11, fontWeight: '700' },
  histDesc: { fontSize: 13, color: Colors.textSecondary, marginTop: 3, lineHeight: 18 },
  histMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 3 },
  chevron: { fontSize: 20, color: Colors.textMuted },

  tip: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', paddingHorizontal: Spacing.lg },

  footer: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: Spacing.base, paddingBottom: Spacing.lg,
    backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  reportBtn: {
    paddingVertical: Spacing.md + 2, borderRadius: BorderRadius.lg,
    backgroundColor: Colors.error, alignItems: 'center', ...Shadow.sm,
  },
  reportBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
