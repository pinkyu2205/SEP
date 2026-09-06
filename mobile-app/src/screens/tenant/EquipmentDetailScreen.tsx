import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { EquipmentDto } from '@/types';
import {
  formatDate, getEquipmentLifecycleLabel, getEquipmentLifecycleColor,
  getHouseAreaLabel, guessEquipmentCategory, showAlert,
} from '@/utils';
import { realTenantEquipmentService } from '@/services/tenant/equipmentService';
import { useTenantContract } from '@/hooks';
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

export const EquipmentDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { selectedContractId } = useTenantContract();
  const equipment: EquipmentDto = route.params?.equipment;
  const [scanVisible, setScanVisible] = useState(false);
  const [checkingScan, setCheckingScan] = useState(false);

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

  const name = equipName(equipment);
  const statusStyle = getEquipmentLifecycleColor(equipment.status);
  const categoryIcon = CATEGORY_ICON[guessEquipmentCategory(name)] ?? '🔧';

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" />

      {/* Colored Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>

        <View style={styles.headerBody}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>{categoryIcon}</Text>
          </View>
          <Text style={styles.equipName}>{name}</Text>
          <Text style={styles.equipCode}>{equipment.qrCode}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>
              {getEquipmentLifecycleLabel(equipment.status)}
            </Text>
          </View>
          <Text style={styles.locationText}>
            📍 {equipment.roomName ?? equipment.roomNumber ?? 'Khu vực chung'}
            {equipment.houseArea ? ` · ${getHouseAreaLabel(equipment.houseArea)}` : ''}
          </Text>
        </View>
      </View>

      {/*
        Bỏ tab "Bảo hành"/"Lịch sử sửa chữa" (06/09/2026) — tenant chọn 1 thiết bị từ
        danh sách chỉ cần đúng thông tin thiết bị đó để quyết định có báo hỏng hay
        không, không cần xem lại lịch sử/bảo hành ở đây.
      */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
        <View>
            <View style={styles.section}>
              {[
                { label: 'Khu vực', value: getHouseAreaLabel(equipment.houseArea) },
                { label: 'Phòng', value: equipment.roomName ?? equipment.roomNumber ?? 'Khu vực chung' },
                { label: 'Ngày lắp đặt', value: equipment.installationDate ? formatDate(equipment.installationDate) : 'Chưa có' },
                { label: 'Bảo trì gần nhất', value: equipment.lastMaintenanceDate ? formatDate(equipment.lastMaintenanceDate) : 'Chưa có' },
                { label: 'Số lần bảo trì', value: `${equipment.maintenanceCount} lần` },
              ].map((row, i, arr) => (
                <View key={i} style={[styles.infoRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                  <Text style={styles.infoLabel}>{row.label}</Text>
                  <Text style={styles.infoValue}>{row.value}</Text>
                </View>
              ))}
            </View>

            {/* Ghi chú từ quản lý */}
            {equipment.note && (
              <View style={styles.notesCard}>
                <Text style={styles.notesTitle}>📝 Ghi chú từ quản lý</Text>
                <Text style={styles.notesText}>{equipment.note}</Text>
              </View>
            )}

            <View style={styles.tipsCard}>
              <Text style={styles.tipsTitle}>💡 Lưu ý chung</Text>
              <Text style={styles.tipItem}>• Không tự ý tháo lắp, sửa chữa thiết bị</Text>
              <Text style={styles.tipItem}>• Báo ngay cho quản lý khi phát hiện sự cố</Text>
              <Text style={styles.tipItem}>• Tắt thiết bị khi ra khỏi phòng</Text>
            </View>
          </View>

        {/*
          Ẩn khối mã QR (06/09/2026) — chỉ còn nút báo hỏng; QR giờ dùng để XÁC NHẬN
          đúng thiết bị ngay khi bấm nút, không cần hiện lại hình QR ở đây nữa.
        */}
        <TouchableOpacity
          style={[styles.reportBtn, checkingScan && { opacity: 0.6 }]}
          onPress={() => setScanVisible(true)}
          disabled={checkingScan}
          activeOpacity={0.8}
        >
          <Text style={styles.reportBtnText}>
            {checkingScan ? 'Đang kiểm tra mã QR…' : '🚨 Báo hỏng thiết bị này'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

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

  // Error state
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  errorText: { fontSize: 15, color: Colors.textSecondary, marginBottom: Spacing.lg },
  errorBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg },
  errorBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  // Header
  header: { backgroundColor: Colors.primary, paddingBottom: Spacing.xl },
  backBtn: {
    position: 'absolute', top: 12, left: Spacing.lg, zIndex: 10,
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20,
  },
  backArrow: { fontSize: 28, color: Colors.white, lineHeight: 32 },
  headerBody: { alignItems: 'center', paddingTop: 56, paddingHorizontal: Spacing.xl },
  iconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
  },
  iconText: { fontSize: 36 },
  equipName: { fontSize: 20, fontWeight: '800', color: Colors.white, textAlign: 'center' },
  equipCode: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4, fontFamily: 'monospace' },
  statusBadge: { marginTop: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: BorderRadius.full },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  locationText: { marginTop: Spacing.sm, fontSize: 13, color: 'rgba(255,255,255,0.8)' },

  body: { padding: Spacing.lg, gap: Spacing.md },

  // Info tab
  section: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  infoLabel: { fontSize: 13, color: Colors.textMuted },
  infoValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, textAlign: 'right', maxWidth: '55%' },

  notesCard: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg,
    padding: Spacing.base, borderWidth: 1, borderColor: Colors.primary + '30',
  },
  notesTitle: { fontSize: 13, fontWeight: '700', color: Colors.primary, marginBottom: Spacing.sm },
  notesText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22 },

  // Usage tips
  tipsCard: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg, padding: Spacing.base,
  },
  tipsTitle: { fontSize: 13, fontWeight: '700', color: Colors.primary, marginBottom: Spacing.sm },
  tipItem: { fontSize: 14, color: Colors.textSecondary, lineHeight: 24 },

  reportBtn: {
    paddingVertical: Spacing.base, borderRadius: BorderRadius.lg,
    backgroundColor: Colors.error, alignItems: 'center', ...Shadow.sm,
  },
  reportBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
