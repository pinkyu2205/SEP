import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { EquipmentDto, EquipmentMaintenanceHistoryDto } from '@/types';
import {
  formatDate, getEquipmentLifecycleLabel, getEquipmentLifecycleColor,
  getHouseAreaLabel, guessEquipmentCategory,
} from '@/utils';
import { realTenantEquipmentService } from '@/services/tenant/equipmentService';
import { serverNow } from '@/utils/serverTime';

type Tab = 'info' | 'warranty' | 'history';

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
  const equipment: EquipmentDto = route.params?.equipment;
  const [activeTab, setActiveTab] = useState<Tab>('info');
  const [history, setHistory] = useState<EquipmentMaintenanceHistoryDto[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    if (!equipment?.id) { setHistoryLoading(false); return; }
    let active = true;
    realTenantEquipmentService.getMaintenanceHistory(equipment.id)
      .then(list => { if (active) setHistory(list); })
      .catch(() => { /* offline — để trống */ })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [equipment?.id]);

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

  const warrantyEnd = equipment.warrantyEndDate ?? equipment.warrantyExpiredDate;
  const isWarrantyValid = warrantyEnd ? new Date(warrantyEnd) > serverNow() : false;
  const warrantyDaysLeft = warrantyEnd
    ? Math.ceil((new Date(warrantyEnd).getTime() - Date.now()) / 86400000)
    : 0;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'info', label: '📋 Thông tin' },
    { key: 'warranty', label: '🛡️ Bảo hành' },
    { key: 'history', label: '🔧 Lịch sử' },
  ];

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

      {/* Tab Bar */}
      <View style={styles.tabBarWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          {tabs.map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>

        {/* ── Tab: Thông tin ── */}
        {activeTab === 'info' && (
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
        )}

        {/* ── Tab: Bảo hành ── */}
        {activeTab === 'warranty' && (
          <View>
            <View style={[
              styles.warrantyBanner,
              { backgroundColor: isWarrantyValid ? Colors.successLight : Colors.errorLight },
            ]}>
              <Text style={styles.warrantyBannerIcon}>{isWarrantyValid ? '🛡️' : '⚠️'}</Text>
              <Text style={[styles.warrantyBannerStatus, { color: isWarrantyValid ? Colors.success : Colors.error }]}>
                {warrantyEnd ? (isWarrantyValid ? 'Còn bảo hành' : 'Hết bảo hành') : 'Không có thông tin bảo hành'}
              </Text>
              {warrantyEnd && (
                <Text style={styles.warrantyDate}>Hạn bảo hành: {formatDate(warrantyEnd)}</Text>
              )}
              {isWarrantyValid && warrantyDaysLeft > 0 && (
                <Text style={styles.warrantyDays}>Còn {warrantyDaysLeft} ngày</Text>
              )}
            </View>

            {isWarrantyValid ? (
              <View style={styles.warrantyNote}>
                <Text style={styles.warrantyNoteText}>
                  💡 Thiết bị còn trong thời hạn bảo hành. Nếu có sự cố do lỗi kỹ thuật, chi phí sửa chữa
                  sẽ được tính theo khấu hao thay vì đền toàn bộ.
                </Text>
              </View>
            ) : (
              !!equipment.penaltyFee && (
                <View style={[styles.warrantyNote, { backgroundColor: Colors.errorLight }]}>
                  <Text style={[styles.warrantyNoteText, { color: Colors.error }]}>
                    ⚠️ Đã hết bảo hành — nếu làm hư do sử dụng sai, mức đền dự kiến{' '}
                    {equipment.penaltyFee.toLocaleString('vi-VN')}đ.
                  </Text>
                </View>
              )
            )}
          </View>
        )}

        {/* ── Tab: Lịch sử sửa chữa ── */}
        {activeTab === 'history' && (
          <View>
            <Text style={styles.historyTitle}>Lịch sử sửa chữa</Text>
            {historyLoading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.xl }} />
            ) : history.length === 0 ? (
              <View style={styles.historyEmpty}>
                <Text style={styles.historyEmptyIcon}>📂</Text>
                <Text style={styles.historyEmptyText}>Chưa có lịch sử bảo trì cho thiết bị này</Text>
              </View>
            ) : (
              history.map((rec) => (
                <View key={rec.id} style={styles.historyCard}>
                  <View style={styles.historyCardTop}>
                    <View style={styles.historyTypeWrap}>
                      <Text style={styles.historyTypeIcon}>🔧</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyDesc}>{rec.note || rec.requestCode}</Text>
                      <Text style={styles.historyType}>{rec.requestCode}</Text>
                    </View>
                  </View>
                  <View style={styles.historyCardMeta}>
                    <Text style={styles.historyMetaItem}>📅 {formatDate(rec.maintenanceDate)}</Text>
                    {!!rec.repairCost && (
                      <Text style={[styles.historyMetaItem, { color: Colors.primary, fontWeight: '700' }]}>
                        💰 {rec.repairCost.toLocaleString('vi-VN')}đ
                      </Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* ── QR Code Section (always visible below tabs) ── */}
        <View style={styles.qrSection}>
          <Text style={styles.qrSectionTitle}>Mã QR thiết bị</Text>
          <Text style={styles.qrSectionHint}>
            QR này được dán trực tiếp trên thiết bị để hỗ trợ sửa chữa và quản lý nhanh.
          </Text>

          <View style={styles.qrBox}>
            <View style={styles.qrPattern}>
              <View style={styles.qrCornerBlock} />
              <View style={[styles.qrCornerBlock, { alignSelf: 'flex-end' }]} />
              <View style={styles.qrCenter}>
                <Text style={styles.qrCenterIcon}>📷</Text>
              </View>
              <View style={[styles.qrCornerBlock, { alignSelf: 'flex-start' }]} />
              <View style={[styles.qrCornerBlock, { alignSelf: 'flex-end', opacity: 0 }]} />
            </View>
            <Text style={styles.qrCodeText}>{equipment.qrCode}</Text>
          </View>

          <TouchableOpacity
            style={styles.reportBtn}
            onPress={() => navigation.navigate('MaintenanceCreate', { equipment })}
            activeOpacity={0.8}
          >
            <Text style={styles.reportBtnText}>🚨 Báo hỏng thiết bị này</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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

  // Tab bar
  tabBarWrap: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  tabBar: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.sm },
  tab: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
  },
  tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  tabTextActive: { color: Colors.white },

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

  // Warranty tab
  warrantyBanner: {
    borderRadius: BorderRadius.xl, padding: Spacing.xl, alignItems: 'center', gap: Spacing.xs,
  },
  warrantyBannerIcon: { fontSize: 40 },
  warrantyBannerStatus: { fontSize: 20, fontWeight: '800' },
  warrantyDate: { fontSize: 13, color: Colors.textSecondary },
  warrantyDays: { fontSize: 13, color: Colors.textSecondary },
  warrantyNote: {
    backgroundColor: Colors.successLight, borderRadius: BorderRadius.lg, padding: Spacing.base,
  },
  warrantyNoteText: { fontSize: 13, color: Colors.success, lineHeight: 20 },

  // Usage tips
  tipsCard: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg, padding: Spacing.base,
  },
  tipsTitle: { fontSize: 13, fontWeight: '700', color: Colors.primary, marginBottom: Spacing.sm },
  tipItem: { fontSize: 14, color: Colors.textSecondary, lineHeight: 24 },

  // History tab
  historyTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  historyEmpty: { alignItems: 'center', paddingVertical: Spacing.xl },
  historyEmptyIcon: { fontSize: 36, marginBottom: Spacing.sm },
  historyEmptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },

  historyCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm, marginBottom: Spacing.sm,
  },
  historyCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
  historyTypeWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center',
  },
  historyTypeIcon: { fontSize: 18 },
  historyDesc: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, lineHeight: 20 },
  historyType: { fontSize: 11, color: Colors.textMuted, marginTop: 2, fontFamily: 'monospace' },
  historyCardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: Spacing.sm },
  historyMetaItem: { fontSize: 12, color: Colors.textSecondary },

  // QR Section
  qrSection: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl, padding: Spacing.base,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  qrSectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: 4 },
  qrSectionHint: { fontSize: 12, color: Colors.textMuted, lineHeight: 18, marginBottom: Spacing.base },

  qrBox: { alignItems: 'center', marginBottom: Spacing.base },
  qrPattern: {
    width: 120, height: 120, borderWidth: 2, borderColor: Colors.border,
    borderRadius: BorderRadius.md, padding: Spacing.sm,
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: Spacing.sm, backgroundColor: Colors.background,
  },
  qrCornerBlock: {
    width: 28, height: 28, borderWidth: 3, borderColor: Colors.primary,
    borderRadius: 4,
  },
  qrCenter: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  qrCenterIcon: { fontSize: 28 },
  qrCodeText: {
    fontSize: 13, fontWeight: '700', color: Colors.textPrimary,
    fontFamily: 'monospace', letterSpacing: 1,
  },

  reportBtn: {
    paddingVertical: Spacing.base, borderRadius: BorderRadius.lg,
    backgroundColor: Colors.error, alignItems: 'center', ...Shadow.sm,
  },
  reportBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
