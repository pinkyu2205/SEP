import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { serverNow } from '@/utils/serverTime';
import {
  meterReadingService,
  type PendingMeterReadingItem,
} from '@/services/manager/meterReadingService';

/**
 * CÔNG TƠ CÒN THIẾU ẢNH TRONG KỲ — danh sách việc phải làm của manager.
 *
 * Vì sao cần: từ 13/08/2026 BE **chặn** phát hành hoá đơn điện/nước khi kỳ đó chưa có
 * ảnh công tơ (422 `METER_PHOTO_REQUIRED`). Cron có nhắc, nhưng mỗi manager chỉ nhận
 * MỘT thông báo/ngày và thông báo chỉ nêu tên MỘT nhà — quản 3 nhà là không biết còn
 * thiếu ở đâu. Màn này trả lời đúng câu đó.
 *
 * Đích đến của deep-link `screen: "MeterReadingPending"` mà BE gửi kèm
 * `METER_READING_DUE`.
 *
 * Bấm một dòng → sang màn Ghi điện nước của đúng nhà đó để chụp và ghi chỉ số.
 */

/** `yyyy-MM` của tháng hiện tại — khớp mặc định phía BE (Asia/Ho_Chi_Minh). */
const currentPeriod = (): string => {
  const d = serverNow();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const utilityLabel = (t: string): string =>
  t === 'WATER' ? 'Nước' : t === 'ELECTRICITY' ? 'Điện' : t;

const formatDateVi = (iso?: string): string => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

/** Số ngày còn lại tới hạn chụp; âm = đã quá hạn. */
const daysLeft = (iso?: string): number | null => {
  if (!iso) return null;
  const due = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = serverNow();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
};

interface Group {
  key: string;
  propertyId: number;
  propertyName: string;
  roomId: number | null;
  roomNumber: string | null;
  meterDueDate: string;
  billingDay: number;
  /** Các loại còn thiếu ảnh của cùng một phòng — thường là ['Điện', 'Nước']. */
  missing: { type: string; hasReading: boolean }[];
}

/**
 * BE trả mỗi phòng tối đa 2 dòng (điện + nước). Gộp lại theo phòng để manager thấy
 * "một chuyến đi" thay vì hai dòng rời — họ cầm điện thoại đi tới phòng đó một lần
 * và chụp cả hai đồng hồ.
 */
const groupByRoom = (items: PendingMeterReadingItem[]): Group[] => {
  const map = new Map<string, Group>();
  for (const it of items) {
    const key = `${it.propertyId}-${it.roomId ?? 'whole'}`;
    const existing = map.get(key);
    if (existing) {
      existing.missing.push({ type: utilityLabel(it.utilityType), hasReading: it.hasReading });
      continue;
    }
    map.set(key, {
      key,
      propertyId: it.propertyId,
      propertyName: it.propertyName,
      roomId: it.roomId,
      roomNumber: it.roomNumber,
      meterDueDate: it.meterDueDate,
      billingDay: it.billingDay,
      missing: [{ type: utilityLabel(it.utilityType), hasReading: it.hasReading }],
    });
  }
  // Hạn gần nhất lên đầu — việc gấp phải nằm trên.
  return [...map.values()].sort((a, b) => (a.meterDueDate ?? '').localeCompare(b.meterDueDate ?? ''));
};

export const MeterReadingPendingScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  // Deep-link từ thông báo có thể kèm `period`; không có thì lấy tháng hiện tại.
  const [period] = useState<string>(route.params?.period || currentPeriod());

  const [items, setItems] = useState<PendingMeterReadingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await meterReadingService.listPending(period));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  // Nạp lại mỗi lần quay về màn: manager vừa đi chụp xong ở màn Ghi điện nước thì dòng đó
  // phải biến mất, không bắt họ tự kéo refresh để biết mình đã làm gì.
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const groups = useMemo(() => groupByRoom(items), [items]);

  /**
   * `UtilityBillingScreen` ĐÃ nhận `route.params` từ 13/08/2026: nó tự chọn nhà theo
   * `propertyId` và nhảy thẳng vào bước xem hoá đơn EVN, bỏ qua bước chọn nhà.
   * (`roomId` và `period` vẫn truyền để dành, màn kia chưa dùng tới.)
   */
  const openMeterEntry = (g: Group) =>
    navigation.navigate('UtilityBilling', {
      propertyId: g.propertyId,
      roomId: g.roomId ?? undefined,
      period,
    });

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>
          Cần chụp công tơ{groups.length > 0 ? ` (${groups.length})` : ''}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.periodBar}>
        <Text style={s.periodText}>Kỳ {period.replace('-', '/')}</Text>
        <Text style={s.periodHint}>
          Chưa có ảnh thì không phát hành được hoá đơn điện/nước.
        </Text>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.body}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
            />
          }
        >
          {loadError ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyIcon}>⚠️</Text>
              <Text style={s.emptyTitle}>Không tải được danh sách</Text>
              <Text style={s.emptyText}>Kéo xuống để thử lại.</Text>
            </View>
          ) : groups.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyIcon}>✅</Text>
              <Text style={s.emptyTitle}>Đã chụp đủ</Text>
              <Text style={s.emptyText}>
                Không còn công tơ nào thiếu ảnh trong kỳ {period.replace('-', '/')}.
              </Text>
            </View>
          ) : (
            groups.map((g) => {
              const left = daysLeft(g.meterDueDate);
              const overdue = left != null && left < 0;
              const urgent = left != null && left >= 0 && left <= 1;
              return (
                <TouchableOpacity
                  key={g.key}
                  style={s.card}
                  onPress={() => openMeterEntry(g)}
                  activeOpacity={0.7}
                >
                  <View style={s.cardTop}>
                    <Text style={s.cardTitle} numberOfLines={1}>
                      {g.roomNumber ? `Phòng ${g.roomNumber}` : 'Nguyên căn'}
                    </Text>
                    <View
                      style={[
                        s.badge,
                        overdue ? s.badgeError : urgent ? s.badgeWarn : s.badgeNeutral,
                      ]}
                    >
                      <Text
                        style={[
                          s.badgeText,
                          overdue ? s.badgeTextError : urgent ? s.badgeTextWarn : s.badgeTextNeutral,
                        ]}
                      >
                        {overdue
                          ? `Quá hạn ${Math.abs(left)} ngày`
                          : left === 0
                            ? 'Hạn hôm nay'
                            : `Còn ${left} ngày`}
                      </Text>
                    </View>
                  </View>

                  <Text style={s.cardProperty} numberOfLines={1}>
                    {g.propertyName}
                  </Text>

                  <View style={s.tagRow}>
                    {g.missing.map((m) => (
                      <View key={m.type} style={s.tag}>
                        <Text style={s.tagText}>
                          {m.type}
                          {/* Đã ghi số nhưng thiếu ảnh là tình huống khác hẳn "chưa đụng
                              gì" — người trước có thể đã đi đo rồi, chỉ quên chụp. */}
                          {m.hasReading ? ' · thiếu ảnh' : ''}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <Text style={s.cardFooter}>
                    Hạn chụp {formatDateVi(g.meterDueDate)} · mốc thu tiền ngày {g.billingDay}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: { padding: Spacing.sm },
  backArrow: { fontSize: 18, fontWeight: '600', color: Colors.primary },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },

  periodBar: {
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    backgroundColor: Colors.warningLight,
  },
  periodText: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  periodHint: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: Spacing.base, gap: Spacing.md },

  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, ...Shadow.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  cardProperty: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  cardFooter: { fontSize: 11, color: Colors.textMuted, marginTop: Spacing.sm },

  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: 999 },
  badgeNeutral: { backgroundColor: Colors.divider },
  badgeWarn: { backgroundColor: Colors.warningLight },
  badgeError: { backgroundColor: Colors.errorLight },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextNeutral: { color: Colors.textSecondary },
  badgeTextWarn: { color: Colors.warning },
  badgeTextError: { color: Colors.error },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  tag: {
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: BorderRadius.sm, backgroundColor: Colors.primaryBg,
  },
  tagText: { fontSize: 12, fontWeight: '600', color: Colors.primary },

  emptyBox: { alignItems: 'center', paddingVertical: Spacing.xl * 2 },
  emptyIcon: { fontSize: 40, marginBottom: Spacing.sm },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  emptyText: { fontSize: 12, color: Colors.textSecondary, marginTop: 4, textAlign: 'center' },
});
