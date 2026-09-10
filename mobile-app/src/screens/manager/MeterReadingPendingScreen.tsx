import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow, meterReadingPeriodIso, toPeriodKey } from '@/constants';
import { serverNow } from '@/utils/serverTime';
import {
  meterReadingService,
  type PendingMeterReadingItem,
} from '@/services/manager/meterReadingService';

/**
 * CÔNG TƠ CÒN THIẾU TRONG KỲ — danh sách việc phải làm của manager.
 *
 * Vì sao cần: từ 13/08/2026 BE **chặn** phát hành hoá đơn điện/nước khi kỳ đó chưa có
 * ảnh công tơ (422 `METER_PHOTO_REQUIRED`). Cron có nhắc, nhưng mỗi manager chỉ nhận
 * MỘT thông báo/ngày cho TẤT CẢ nhà của mình — thông báo chỉ nói được tổng số. Màn này
 * là chỗ trả lời "cụ thể còn ở đâu".
 *
 * Đích đến của deep-link `screen: "MeterReadingPending"` mà BE gửi kèm `METER_READING_DUE`.
 *
 * ─── GOM THEO NHÀ (10/09/2026) ────────────────────────────────────────────────
 * Bản trước đổ ra một danh sách THẺ PHÒNG phẳng, sắp theo hạn chụp. Cách đó chỉ chịu được
 * khi manager quản vài nhà. Hai chuyện làm nó vỡ:
 *
 *  1. Quản 10–20 nhà chia phòng là ra hàng trăm thẻ trong một mạch cuộn duy nhất, phòng
 *     của cùng một nhà nằm rải rác không cạnh nhau.
 *  2. Từ khi điện chốt vào ngày cuối tháng, MỌI phòng điện có CÙNG một hạn — sắp theo hạn
 *     thành ra không sắp gì cả, thứ tự hiện lên gần như ngẫu nhiên.
 *
 * Mà công việc ngoài đời đi theo NHÀ: chạy tới một nhà, làm hết phòng ở đó, rồi đi nhà kế.
 * Nên màn hình phải xếp theo đúng đơn vị đó, kèm ô tìm nhà cho người quản nhiều.
 */

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

/** Dấu thanh tiếng Việt sau khi tách NFD. Viết bằng mã escape, không dán ký tự thật —
 *  ký tự tổ hợp trần rất dễ bị trình soạn thảo nuốt mất, và regex khi đó âm thầm thành vô hại. */
const COMBINING_MARKS = new RegExp('[\u0300-\u036f]', 'g');

/** Bỏ dấu để gõ "minh tan" vẫn tìm ra "Nhà Minh Tân". */
const normalizeVi = (s: string): string =>
  s.normalize('NFD').replace(COMBINING_MARKS, '').replace(/[đĐ]/g, 'd').toLowerCase();

interface RoomLine {
  key: string;
  roomId: number | null;
  roomNumber: string | null;
  /** Các loại còn thiếu của cùng một phòng — thường là ['Điện'] hoặc ['Điện', 'Nước']. */
  missing: { type: string; hasReading: boolean }[];
}

interface PropertyGroup {
  propertyId: number;
  propertyName: string;
  meterDueDate: string;
  billingDay: number;
  rooms: RoomLine[];
}

/**
 * BE trả mỗi phòng tối đa 2 dòng (điện + nước). Gộp hai lần:
 *   • theo PHÒNG — manager tới phòng đó một lần và chụp cả hai đồng hồ;
 *   • rồi theo NHÀ — đơn vị của một chuyến đi.
 */
const groupByProperty = (items: PendingMeterReadingItem[]): PropertyGroup[] => {
  const rooms = new Map<string, RoomLine & { propertyId: number; propertyName: string; meterDueDate: string; billingDay: number }>();
  for (const it of items) {
    const key = `${it.propertyId}-${it.roomId ?? 'whole'}`;
    const existing = rooms.get(key);
    const entry = { type: utilityLabel(it.utilityType), hasReading: it.hasReading };
    if (existing) {
      existing.missing.push(entry);
      continue;
    }
    rooms.set(key, {
      key,
      roomId: it.roomId,
      roomNumber: it.roomNumber,
      missing: [entry],
      propertyId: it.propertyId,
      propertyName: it.propertyName,
      meterDueDate: it.meterDueDate,
      billingDay: it.billingDay,
    });
  }

  const props = new Map<number, PropertyGroup>();
  for (const r of rooms.values()) {
    const g = props.get(r.propertyId);
    const line: RoomLine = { key: r.key, roomId: r.roomId, roomNumber: r.roomNumber, missing: r.missing };
    if (g) {
      g.rooms.push(line);
      // Hạn sớm nhất trong nhà đại diện cho cả nhà — việc gấp nhất quyết định màu thẻ.
      if ((r.meterDueDate ?? '') < (g.meterDueDate ?? '')) g.meterDueDate = r.meterDueDate;
      continue;
    }
    props.set(r.propertyId, {
      propertyId: r.propertyId,
      propertyName: r.propertyName,
      meterDueDate: r.meterDueDate,
      billingDay: r.billingDay,
      rooms: [line],
    });
  }

  return [...props.values()]
    .map(g => ({
      ...g,
      rooms: g.rooms.sort((a, b) => (a.roomNumber ?? '').localeCompare(b.roomNumber ?? '')),
    }))
    // Hạn gần nhất lên đầu; cùng hạn (chuyện thường của điện) thì xếp theo tên nhà để
    // lần nào mở ra thứ tự cũng như nhau — danh sách nhảy chỗ là không tra cứu được.
    .sort((a, b) =>
      (a.meterDueDate ?? '').localeCompare(b.meterDueDate ?? '')
      || a.propertyName.localeCompare(b.propertyName, 'vi'));
};

export const MeterReadingPendingScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  /*
    HAI dạng kỳ, đừng lẫn:
      • `periodKey`   — `yyyy-MM`, thứ DUY NHẤT gửi lên máy chủ.
      • `periodLabel` — chuỗi cho người đọc, giữ nguyên chữ BE gắn vào thông báo.

    Deep-link mang chuỗi hiển thị ("01/08 – 31/08/2026") chứ không phải `yyyy-MM` — gửi
    thẳng lên thì máy chủ không đọc được và âm thầm rơi về tháng hiện tại. Xem `toPeriodKey`.
  */
  /**
   * Vào từ thông báo thì BÁM đúng kỳ của thông báo; vào từ trang chủ thì xem MỌI kỳ còn tồn.
   *
   * Hai lối vào hỏi hai câu khác nhau. Bấm thông báo "kỳ 08/2026" mà màn hình đổ ra cả việc
   * của kỳ khác thì tin nhắn và màn hình nói hai chuyện. Ngược lại, vào từ ô "Phòng chưa
   * chụp công tơ" ngoài trang chủ là hỏi "còn gì phải làm", mà điện với nước lại chạy theo
   * hai lịch — chốt một kỳ ở đây là bỏ sót nửa còn lại. Xem `listAllPending`.
   */
  const pinnedPeriod: string | undefined = route.params?.period;
  const [periodLabel] = useState<string>(pinnedPeriod || meterReadingPeriodIso());
  const periodKey = useMemo(() => toPeriodKey(periodLabel), [periodLabel]);

  const [items, setItems] = useState<PendingMeterReadingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      setItems(pinnedPeriod
        ? await meterReadingService.listPending(periodKey)
        : await meterReadingService.listAllPending());
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [periodKey, pinnedPeriod]);

  // Nạp lại mỗi lần quay về màn: manager vừa đi chụp xong ở màn Ghi điện nước thì dòng đó
  // phải biến mất, không bắt họ tự kéo refresh để biết mình đã làm gì.
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  const groups = useMemo(() => groupByProperty(items), [items]);
  const visible = useMemo(() => {
    const q = normalizeVi(query.trim());
    if (!q) return groups;
    return groups.filter(g => normalizeVi(g.propertyName).includes(q));
  }, [groups, query]);

  const totalRooms = groups.reduce((n, g) => n + g.rooms.length, 0);
  // Ô tìm chỉ có ích khi danh sách đủ dài để phải cuộn tìm; ít nhà thì nó là thứ chắn đường.
  const showSearch = groups.length > 4;

  /**
   * `UtilityBillingScreen` ĐÃ nhận `route.params` từ 13/08/2026: nó tự chọn nhà theo
   * `propertyId` và nhảy thẳng vào bước chốt chỉ số, bỏ qua bước chọn nhà.
   * (`roomId` vẫn truyền để dành, màn kia chưa dùng tới.)
   */
  const openProperty = (propertyId: number, roomId?: number | null) =>
    navigation.navigate('UtilityBilling', {
      propertyId,
      roomId: roomId ?? undefined,
      period: periodKey,
    });

  const renderGroup = ({ item: g }: { item: PropertyGroup }) => {
    const left = daysLeft(g.meterDueDate);
    const overdue = left != null && left < 0;
    const urgent = left != null && left >= 0 && left <= 1;
    return (
      <TouchableOpacity
        style={[s.card, overdue && s.cardOverdue]}
        onPress={() => openProperty(g.propertyId)}
        activeOpacity={0.75}
      >
        <View style={s.cardTop}>
          <Text style={s.cardTitle} numberOfLines={2}>{g.propertyName}</Text>
          <View style={[s.badge, overdue ? s.badgeError : urgent ? s.badgeWarn : s.badgeNeutral]}>
            <Text style={[
              s.badgeText,
              overdue ? s.badgeTextError : urgent ? s.badgeTextWarn : s.badgeTextNeutral,
            ]}>
              {overdue
                ? `Quá hạn ${Math.abs(left)} ngày`
                : left === 0 ? 'Hạn hôm nay' : `Còn ${left} ngày`}
            </Text>
          </View>
        </View>

        <Text style={s.cardCount}>
          {g.rooms.length} {g.rooms[0]?.roomNumber ? 'phòng' : 'căn'} chưa chốt
        </Text>

        {/* Từng phòng bấm được riêng: manager hay đi lẻ một phòng (khách vắng nhà lúc
            trước, giờ quay lại), không phải lúc nào cũng làm cả nhà một lượt. */}
        <View style={s.roomRow}>
          {g.rooms.map(r => (
            <TouchableOpacity
              key={r.key}
              style={s.roomChip}
              onPress={() => openProperty(g.propertyId, r.roomId)}
              activeOpacity={0.7}
            >
              <Text style={s.roomChipText}>
                {r.roomNumber ? r.roomNumber : 'Nguyên căn'}
              </Text>
              <Text style={s.roomChipMeta}>
                {r.missing.map(m => m.type + (m.hasReading ? ' (thiếu ảnh)' : '')).join(' · ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.cardFooter}>
          <Text style={s.cardFooterText}>
            Hạn chụp {formatDateVi(g.meterDueDate)} · mốc thu tiền ngày {g.billingDay}
          </Text>
          <MaterialIcons name="chevron-right" size={18} color={Colors.primary} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Cần chụp công tơ</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={s.periodBar}>
        {/* Chỉ nêu kỳ khi đang bám đúng một kỳ. Gộp nhiều kỳ mà vẫn in một con số kỳ ở
            đây là dán nhãn sai lên danh sách — kỳ của từng nhà ghi ở chân mỗi thẻ. */}
        <Text style={s.periodText}>
          {pinnedPeriod ? `Kỳ ${periodLabel.replace('-', '/')}` : 'Việc còn tồn'}
          {totalRooms > 0 && ` · ${totalRooms} phòng ở ${groups.length} nhà`}
        </Text>
        <Text style={s.periodHint}>
          Điện phải chốt xong trong ngày cuối tháng · chưa có ảnh thì không phát hành được hoá đơn.
        </Text>
      </View>

      {showSearch && (
        <View style={s.searchWrap}>
          <MaterialIcons name="search" size={18} color={Colors.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="Tìm nhà..."
            placeholderTextColor={Colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialIcons name="close" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={g => String(g.propertyId)}
          renderItem={renderGroup}
          contentContainerStyle={s.body}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); void load(); }}
            />
          }
          ListEmptyComponent={
            loadError ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyIcon}>⚠️</Text>
                <Text style={s.emptyTitle}>Không tải được danh sách</Text>
                <Text style={s.emptyText}>Kéo xuống để thử lại.</Text>
              </View>
            ) : query ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyIcon}>🔍</Text>
                <Text style={s.emptyTitle}>Không có nhà nào khớp</Text>
                <Text style={s.emptyText}>Thử bớt chữ trong ô tìm.</Text>
              </View>
            ) : (
              <View style={s.emptyBox}>
                <Text style={s.emptyIcon}>✅</Text>
                <Text style={s.emptyTitle}>Đã chụp đủ</Text>
                <Text style={s.emptyText}>
                  {pinnedPeriod
                    ? `Không còn công tơ nào thiếu ảnh trong kỳ ${periodLabel.replace('-', '/')}.`
                    : 'Không còn công tơ nào thiếu ảnh. Việc chốt số điện kỳ mới mở vào ngày cuối tháng.'}
                </Text>
              </View>
            )
          }
        />
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

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginHorizontal: Spacing.base, marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, paddingVertical: Spacing.sm, fontSize: 14, color: Colors.textPrimary },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { padding: Spacing.base, gap: Spacing.md, flexGrow: 1 },

  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, ...Shadow.sm,
    borderLeftWidth: 3, borderLeftColor: 'transparent',
  },
  cardOverdue: { borderLeftColor: Colors.error },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.sm },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  cardCount: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginTop: 2 },

  roomRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  roomChip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm, backgroundColor: Colors.primaryBg,
  },
  roomChipText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  roomChipMeta: { fontSize: 10, color: Colors.textSecondary, marginTop: 1 },

  cardFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: Spacing.md, paddingTop: Spacing.sm,
    borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  cardFooterText: { flex: 1, fontSize: 11, color: Colors.textMuted },

  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: 999 },
  badgeNeutral: { backgroundColor: Colors.divider },
  badgeWarn: { backgroundColor: Colors.warningLight },
  badgeError: { backgroundColor: Colors.errorLight },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextNeutral: { color: Colors.textSecondary },
  badgeTextWarn: { color: Colors.warning },
  badgeTextError: { color: Colors.error },

  emptyBox: { alignItems: 'center', paddingVertical: Spacing.xl * 2 },
  emptyIcon: { fontSize: 40, marginBottom: Spacing.sm },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  emptyText: { fontSize: 12, color: Colors.textSecondary, marginTop: 4, textAlign: 'center' },
});
