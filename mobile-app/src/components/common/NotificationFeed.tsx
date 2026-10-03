import React from 'react';
import {
  View, Text, StyleSheet, SectionList, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius } from '@/constants';
import { formatRelativeTime } from '@/utils';
import { serverNow } from '@/utils/serverTime';
import { Icon, IconText, type IconName } from './Icon';

/**
 * DANH SÁCH THÔNG BÁO — giao diện dùng chung cho quản lý và khách thuê (03/10/2026).
 *
 * Hai màn trước đây mỗi màn một kiểu thẻ, và thẻ "chưa đọc" của màn quản lý dùng nền BÁN
 * TRONG SUỐT (`primaryBg + '60'`) chồng lên `elevation`: Android vẽ bóng đổ xuyên qua nền
 * trong suốt nên mỗi thẻ bị bọc một khung xám dày. Nay mỗi nhóm thời gian là MỘT khối
 * trắng, các dòng ngăn nhau bằng vạch mảnh, không bóng đổ; dòng chưa đọc dùng nền màu đặc.
 *
 * Màn của từng vai chỉ lo dữ liệu + điều hướng khi bấm; mọi thứ nhìn thấy nằm ở đây.
 */

export interface FeedItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  isRead: boolean;
  icon: IconName;
  /** Màu nhấn của loại thông báo (icon, nhãn mục). */
  color: string;
  /** Nền nhạt cho vòng icon. */
  bg: string;
  /** Tên mục hiện trên dòng — cũng là khoá lọc, nên nhãn luôn khớp chip bấm được. */
  category: string;
  actionLabel?: string;
}

export interface FeedFilter { key: string; label: string; count: number }

type Section = { title: string; data: FeedItem[] };

const groupByTime = (items: FeedItem[]): Section[] => {
  const now = serverNow();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOfDay(now);
  const groups: Section[] = [
    { title: 'Hôm nay', data: [] },
    { title: 'Hôm qua', data: [] },
    { title: 'Tuần này', data: [] },
    { title: 'Cũ hơn', data: [] },
  ];
  for (const n of items) {
    const t = startOfDay(new Date(n.createdAt));
    if (t >= today) groups[0].data.push(n);
    else if (t >= today - 86_400_000) groups[1].data.push(n);
    else if (t >= today - 7 * 86_400_000) groups[2].data.push(n);
    else groups[3].data.push(n);
  }
  return groups.filter((g) => g.data.length > 0);
};

/**
 * Chip lọc: "Tất cả", "Chưa đọc" rồi tới các mục ĐANG CÓ thông báo, theo thứ tự `order`.
 * Mục không có thông báo nào thì không hiện chip — bấm vào một chip để thấy danh sách
 * trống là một lần bấm phí công.
 */
export const buildFeedFilters = (items: FeedItem[], order: string[]): FeedFilter[] => {
  const count = new Map<string, number>();
  items.forEach((i) => count.set(i.category, (count.get(i.category) ?? 0) + 1));
  const cats = [...count.keys()].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return [
    { key: 'all', label: 'Tất cả', count: items.length },
    { key: 'unread', label: 'Chưa đọc', count: items.filter((i) => !i.isRead).length },
    ...cats.map((c) => ({ key: c, label: c, count: count.get(c) ?? 0 })),
  ];
};

export const applyFeedFilter = (items: FeedItem[], key: string): FeedItem[] =>
  key === 'all' ? items : key === 'unread' ? items.filter((i) => !i.isRead) : items.filter((i) => i.category === key);

export const NotificationFeed: React.FC<{
  /** Đã lọc theo `activeFilter`. */
  items: FeedItem[];
  filters: FeedFilter[];
  activeFilter: string;
  onFilter: (key: string) => void;
  unreadCount: number;
  onMarkAllRead: () => void;
  onPressItem: (id: string) => void;
  refreshing: boolean;
  onRefresh: () => void;
  /** Không truyền thì không có nút quay lại (màn đang là gốc của tab). */
  onBack?: () => void;
}> = ({
  items, filters, activeFilter, onFilter, unreadCount, onMarkAllRead, onPressItem,
  refreshing, onRefresh, onBack,
}) => {
  const sections = groupByTime(items);
  const activeLabel = filters.find((f) => f.key === activeFilter)?.label;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* ── Header ── */}
      <View style={s.header}>
        {onBack && (
          <TouchableOpacity
            onPress={onBack}
            style={s.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Quay lại"
          >
            <Icon name="back" size={26} color={Colors.textPrimary} />
          </TouchableOpacity>
        )}
        <View style={s.headerText}>
          <Text style={s.headerTitle}>Thông báo</Text>
          <Text style={[s.headerSub, unreadCount > 0 && s.headerSubUnread]}>
            {unreadCount > 0 ? `${unreadCount} chưa đọc` : 'Đã đọc hết'}
          </Text>
        </View>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={onMarkAllRead} style={s.markAllBtn} activeOpacity={0.7}>
            <IconText icon="check" gap={4} iconSize={15} style={s.markAllText}>Đọc tất cả</IconText>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Chip lọc ── */}
      <View style={s.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterScroll}>
          {filters.map((f) => {
            const active = activeFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[s.chip, active && s.chipActive]}
                onPress={() => onFilter(f.key)}
                activeOpacity={0.75}
              >
                <Text style={[s.chipText, active && s.chipTextActive]}>{f.label}</Text>
                {f.count > 0 && (
                  <Text style={[s.chipCount, active && s.chipCountActive]}>{f.count}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Danh sách, nhóm theo thời gian ── */}
      <SectionList
        sections={sections}
        keyExtractor={(n) => n.id}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.list, sections.length === 0 && { flex: 1 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        renderSectionHeader={({ section }) => <Text style={s.sectionTitle}>{section.title}</Text>}
        renderItem={({ item, index, section }) => {
          const first = index === 0;
          const last = index === section.data.length - 1;
          return (
            <TouchableOpacity
              onPress={() => onPressItem(item.id)}
              activeOpacity={0.6}
              style={[
                s.row,
                !item.isRead && s.rowUnread,
                first && s.rowFirst,
                last && s.rowLast,
              ]}
            >
              <View style={[s.iconWrap, { backgroundColor: item.bg }]}>
                <Icon name={item.icon} size={18} color={item.color} />
              </View>
              <View style={[s.rowBody, !last && s.rowDivider]}>
                <View style={s.titleLine}>
                  <Text style={[s.title, !item.isRead && s.titleUnread]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {!item.isRead && <View style={s.unreadDot} />}
                </View>
                {!!item.body && <Text style={s.body} numberOfLines={2}>{item.body}</Text>}
                <View style={s.metaLine}>
                  {/* Màu của loại đã nằm ở vòng icon; chữ để xám đậm — vàng/cam nhạt trên
                      nền trắng ở cỡ chữ 12 gần như không đọc được. */}
                  <Text style={s.category} numberOfLines={1}>{item.category}</Text>
                  <Text style={s.metaDot}>·</Text>
                  <Text style={s.time}>{formatRelativeTime(item.createdAt)}</Text>
                </View>
                {item.actionLabel && (
                  <IconText icon="arrow-right" trailing gap={3} iconSize={13} style={[s.cta, { color: item.color }]}>
                    {item.actionLabel}
                  </IconText>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={(
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Icon name="bell-off" size={28} color={Colors.textMuted} />
            </View>
            <Text style={s.emptyTitle}>
              {activeFilter === 'unread' ? 'Không còn thông báo chưa đọc' : 'Chưa có thông báo nào'}
            </Text>
            <Text style={s.emptyText}>
              {activeFilter === 'all' || activeFilter === 'unread'
                ? 'Thông báo mới về hoá đơn, bảo trì và hợp đồng sẽ hiện ở đây.'
                : `Không có thông báo nào trong mục "${activeLabel ?? activeFilter}".`}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
};

const ROW_SIDE = Spacing.base; // lề trong của dòng
const ICON = 38;

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: Spacing.md,
    backgroundColor: Colors.white,
  },
  backBtn: { width: 32, height: 36, justifyContent: 'center' },
  headerText: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  headerSub: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginTop: 1 },
  headerSubUnread: { color: Colors.primary },
  markAllBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: 7,
    borderRadius: BorderRadius.full, backgroundColor: Colors.primaryBg,
  },
  markAllText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  filterBar: {
    backgroundColor: Colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border,
  },
  filterScroll: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.md, gap: Spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: BorderRadius.full, backgroundColor: Colors.divider,
  },
  chipActive: { backgroundColor: Colors.textPrimary },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },
  chipCount: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  chipCountActive: { color: 'rgba(255,255,255,0.7)' },

  list: { paddingHorizontal: Spacing.base, paddingBottom: 48 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6,
    paddingTop: Spacing.lg, paddingBottom: Spacing.sm, paddingHorizontal: 4,
  },

  // Một nhóm = một khối: viền trái/phải ở mọi dòng, bo + viền trên ở dòng đầu, bo + viền
  // dưới ở dòng cuối. Không dùng bóng đổ (xem chú thích đầu file).
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md,
    paddingLeft: ROW_SIDE,
    backgroundColor: Colors.white,
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.border,
  },
  rowUnread: { backgroundColor: '#F5F7FF' },
  rowFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: BorderRadius.lg, borderTopRightRadius: BorderRadius.lg,
  },
  rowLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: BorderRadius.lg, borderBottomRightRadius: BorderRadius.lg,
  },
  iconWrap: {
    width: ICON, height: ICON, borderRadius: ICON / 2,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 14,
  },
  // Vạch ngăn nằm dưới phần chữ, không chạy qua cột icon — kiểu danh sách quen mắt trên điện thoại.
  rowBody: { flex: 1, paddingVertical: 14, paddingRight: ROW_SIDE },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border },

  titleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  title: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '500', color: Colors.textPrimary },
  titleUnread: { fontWeight: '700' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginTop: 6 },
  body: { fontSize: 13, lineHeight: 19, color: Colors.textSecondary, marginTop: 2 },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  category: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, flexShrink: 1 },
  metaDot: { fontSize: 12, color: Colors.textMuted },
  time: { fontSize: 12, color: Colors.textMuted },
  cta: { fontSize: 12, fontWeight: '700', marginTop: 6 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 72, paddingHorizontal: Spacing.xl },
  emptyIcon: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.divider,
    alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  emptyText: { fontSize: 13, lineHeight: 20, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
});
