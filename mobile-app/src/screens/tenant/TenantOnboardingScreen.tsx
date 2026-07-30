import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { useTenantContract } from '@/hooks';
import {
  realTenantSelfService,
  TenantHandoverResponse,
  HandoverEquipmentItem,
} from '@/services/tenant/selfService';

const EQUIPMENT_CONDITION_LABEL: Record<string, string> = {
  NEW: 'Mới', GOOD: 'Tốt', DAMAGED: 'Hư hại', BROKEN: 'Hỏng',
};

const readErr = (err: any, fallback: string): string =>
  err?.response?.data?.error || err?.response?.data?.message || err?.message || fallback;

const formatDateTime = (iso?: string): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
};

/**
 * Biên bản bàn giao — hiển thị đúng dữ liệu manager đã ghi nhận lúc đón khách
 * (chỉ số điện nước, ảnh hiện trạng phòng, thiết bị bàn giao) cho tenant xem lại
 * và xác nhận đã nhận đúng. Nối GET/POST /tenant/me/handover — chỉ áp dụng cho
 * HĐ đang ACTIVE, chỉ xác nhận được 1 lần (BE chặn gọi lại).
 */
export const TenantOnboardingScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { selectedContractId } = useTenantContract();
  const [data, setData] = useState<TenantHandoverResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setNotFound(false);
    try {
      const res = await realTenantSelfService.getHandover(selectedContractId ?? undefined);
      setData(res);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setNotFound(true);
      } else {
        // Account có nhiều HĐ ACTIVE nhưng chưa chọn nhà nào (hiếm — Home luôn chốt
        // sẵn primary) — hướng dẫn quay lại Trang chủ để chọn qua picker.
        const msg = readErr(err, 'Không tải được biên bản bàn giao.');
        Alert.alert('Lỗi', msg.includes('thuê nhiều nhà')
          ? `${msg} Vào Trang chủ để chọn nhà đang xem.`
          : msg);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedContractId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirmAcknowledge = () => {
    Alert.alert(
      'Xác nhận bàn giao',
      'Bạn xác nhận đã nhận đúng phòng và thiết bị như ghi nhận dưới đây? Sau khi xác nhận sẽ KHÔNG thể chỉnh sửa lại.',
      [
        { text: 'Để sau', style: 'cancel' },
        { text: 'Xác nhận', onPress: doAcknowledge },
      ],
    );
  };

  const doAcknowledge = async () => {
    try {
      setConfirming(true);
      const res = await realTenantSelfService.acknowledgeHandover(selectedContractId ?? undefined);
      setData(res);
      Alert.alert('Đã xác nhận ✅', 'Cảm ơn bạn đã xác nhận biên bản bàn giao.');
    } catch (err: any) {
      Alert.alert('Lỗi', readErr(err, 'Không xác nhận được — vui lòng thử lại.'));
    } finally {
      setConfirming(false);
    }
  };

  const Header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Text style={styles.backBtnText}>← Quay lại</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Biên bản bàn giao</Text>
      <View style={{ width: 80 }} />
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        {Header}
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  if (notFound || !data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        {Header}
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={styles.emptyText}>Chưa có hợp đồng đang hiệu lực để xem biên bản bàn giao.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const equipmentByScope = {
    room: (data.equipmentList ?? []).filter((e) => e.scope !== 'SHARED'),
    shared: (data.equipmentList ?? []).filter((e) => e.scope === 'SHARED'),
  };

  const renderEquipment = (eq: HandoverEquipmentItem) => (
    <View key={eq.id} style={styles.assetRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.assetName}>
          {eq.name}{eq.source === 'ADDED' ? '  🆕' : ''}
        </Text>
        <Text style={styles.assetMeta}>
          {EQUIPMENT_CONDITION_LABEL[eq.condition ?? ''] ?? eq.condition ?? '—'}
          {eq.source === 'ADDED' ? ' · Lắp thêm theo yêu cầu' : ''}
        </Text>
      </View>
      <Text style={styles.assetQty}>x{eq.quantity ?? 1}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      {Header}
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Mã hợp đồng</Text>
          <Text style={styles.codeValue}>{data.contractCode}</Text>
          <Text style={styles.codeSub}>
            {data.propertyName}{data.roomNumber ? ` — Phòng ${data.roomNumber}` : ' — Nguyên căn'}
          </Text>
        </View>

        {data.acknowledged ? (
          <View style={styles.ackBanner}>
            <Text style={styles.ackBannerIcon}>✅</Text>
            <Text style={styles.ackBannerText}>
              Bạn đã xác nhận biên bản bàn giao lúc {formatDateTime(data.acknowledgedAt)}
            </Text>
          </View>
        ) : (
          <View style={styles.pendingBanner}>
            <Text style={styles.pendingBannerText}>
              ⚠️ Vui lòng kiểm tra kỹ thông tin dưới đây rồi xác nhận đã nhận đúng phòng & thiết bị.
            </Text>
          </View>
        )}

        {/* Chỉ số điện nước ban đầu */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>📊 Chỉ số điện & nước ban đầu</Text>
          <View style={styles.meterRow}>
            <View style={styles.meterCol}>
              <Text style={styles.meterLabel}>⚡ Điện (kWh)</Text>
              <Text style={styles.meterValue}>{data.initialElectricReading ?? '—'}</Text>
              {!!data.electricMeterImageUrl && (
                <>
                  <Image source={{ uri: data.electricMeterImageUrl }} style={styles.meterThumb} />
                  <Text style={styles.capturedAtText}>🕒 {formatDateTime(data.electricMeterCapturedAt)}</Text>
                </>
              )}
            </View>
            <View style={styles.meterCol}>
              <Text style={styles.meterLabel}>💧 Nước (m³)</Text>
              <Text style={styles.meterValue}>{data.initialWaterReading ?? '—'}</Text>
              {!!data.waterMeterImageUrl && (
                <>
                  <Image source={{ uri: data.waterMeterImageUrl }} style={styles.meterThumb} />
                  <Text style={styles.capturedAtText}>🕒 {formatDateTime(data.waterMeterCapturedAt)}</Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Hiện trạng phòng — ưu tiên roomConditionPhotos (có capturedAt từng ảnh),
            fallback roomConditionUrls cho HĐ cũ chưa có timestamp. */}
        {((data.roomConditionPhotos?.length ?? data.roomConditionUrls?.length ?? 0) > 0 || !!data.roomConditionNote) && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>🏠 Hiện trạng phòng lúc nhận</Text>
            {(data.roomConditionPhotos?.length ?? 0) > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
                {data.roomConditionPhotos!.map((p, i) => (
                  <View key={`${p.url}-${i}`} style={styles.thumbWrap}>
                    <Image source={{ uri: p.url }} style={styles.thumbImage} />
                    <Text style={styles.capturedAtText}>🕒 {formatDateTime(p.capturedAt)}</Text>
                  </View>
                ))}
              </ScrollView>
            ) : (data.roomConditionUrls?.length ?? 0) > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageRow}>
                {data.roomConditionUrls!.map((uri, i) => (
                  <Image key={`${uri}-${i}`} source={{ uri }} style={styles.thumbImage} />
                ))}
              </ScrollView>
            )}
            {!!data.roomConditionNote && (
              <Text style={styles.noteText}>{data.roomConditionNote}</Text>
            )}
          </View>
        )}

        {/* Thiết bị bàn giao */}
        {(data.equipmentList?.length ?? 0) > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>📦 Thiết bị bàn giao</Text>
            {equipmentByScope.room.map(renderEquipment)}
            {equipmentByScope.shared.length > 0 && (
              <>
                <Text style={styles.subLabel}>Khu vực chung</Text>
                {equipmentByScope.shared.map(renderEquipment)}
              </>
            )}
          </View>
        )}

        {!data.acknowledged && (
          <View style={styles.confirmSection}>
            <TouchableOpacity
              style={[styles.confirmBtn, confirming && styles.confirmBtnDisabled]}
              onPress={confirmAcknowledge}
              disabled={confirming}
            >
              {confirming ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.confirmBtnText}>✅ Tôi xác nhận đã nhận đúng như trên</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: { padding: Spacing.sm },
  backBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  emptyIcon: { fontSize: 44 },
  emptyText: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center' },

  scroll: { flex: 1 },

  codeCard: {
    margin: Spacing.base, backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, ...Shadow.sm, alignItems: 'center',
  },
  codeLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 4 },
  codeValue: { fontSize: 20, fontWeight: '800', color: Colors.primary, letterSpacing: 1 },
  codeSub: { fontSize: 13, color: Colors.textSecondary, marginTop: 4 },

  ackBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.base, marginBottom: Spacing.md,
    backgroundColor: '#ECFDF5', borderRadius: BorderRadius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: '#A7F3D0',
  },
  ackBannerIcon: { fontSize: 18 },
  ackBannerText: { flex: 1, fontSize: 13, color: Colors.success, fontWeight: '600' },
  pendingBanner: {
    marginHorizontal: Spacing.base, marginBottom: Spacing.md,
    backgroundColor: '#FFFBEB', borderRadius: BorderRadius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  pendingBannerText: { fontSize: 13, color: '#92400E', lineHeight: 19 },

  sectionCard: {
    marginHorizontal: Spacing.base, marginBottom: Spacing.md,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },

  meterRow: { flexDirection: 'row', gap: Spacing.md },
  meterCol: { flex: 1 },
  meterLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 2 },
  meterValue: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  meterThumb: { width: '100%', height: 90, borderRadius: BorderRadius.md, marginTop: Spacing.sm, backgroundColor: Colors.divider },

  imageRow: { marginBottom: Spacing.sm },
  thumbImage: { width: 90, height: 90, borderRadius: BorderRadius.md, marginRight: Spacing.sm, backgroundColor: Colors.divider },
  thumbWrap: { marginRight: Spacing.sm, width: 90 },
  capturedAtText: { fontSize: 10, color: Colors.textMuted, marginTop: 4 },
  noteText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },

  subLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginTop: Spacing.sm, marginBottom: 4, textTransform: 'uppercase' },
  assetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  assetName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  assetMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  assetQty: { fontSize: 14, fontWeight: '700', color: Colors.primary },

  confirmSection: { paddingHorizontal: Spacing.base, paddingBottom: 40, paddingTop: Spacing.sm },
  confirmBtn: {
    backgroundColor: Colors.success, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', ...Shadow.md,
  },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
