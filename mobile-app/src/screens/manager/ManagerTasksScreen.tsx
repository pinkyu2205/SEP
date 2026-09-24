import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { useManagerTasks, type ManagerTaskItem, type TaskUrgency } from '@/hooks/useManagerTasks';

/**
 * VIỆC CỦA TÔI — toàn bộ việc manager phải làm, chia 3 mức (24/09/2026).
 *
 * Trang chủ chỉ đủ chỗ cho 2 thẻ khẩn; màn này liệt kê HẾT, cùng luật đếm với trang chủ
 * (`buildManagerTasks`). Mỗi dòng bấm vào là tới đúng màn để làm việc đó.
 */
const SECTIONS: { key: TaskUrgency; title: string; sub: string; color: string }[] = [
  { key: 'critical', title: 'Làm ngay', sub: 'Quá hạn hoặc tới hạn hôm nay', color: Colors.error },
  { key: 'warning', title: 'Cần làm', sub: 'Đang chờ bạn xử lý', color: Colors.warning },
  { key: 'upcoming', title: 'Sắp tới', sub: 'Chuẩn bị trước', color: Colors.info },
];

/**
 * Route là TAB (nằm trong `ManagerTabs`), không phải màn của stack gốc. Màn này được push lên
 * stack gốc, nên gọi thẳng `navigate('ManagerMaintenance')` là lỗi "was not handled by any
 * navigator" — phải đi qua navigator cha: `navigate('ManagerTabs', { screen, params })`.
 */
const TAB_ROUTES = new Set(['ManagerHome', 'BuildingList', 'ManagerBilling', 'ManagerMaintenance', 'ManagerProfile']);

export const ManagerTasksScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { items, loading } = useManagerTasks();

  const total = items.filter(i => i.urgency !== 'upcoming').reduce((s, i) => s + i.count, 0);

  const renderRow = (t: ManagerTaskItem, last: boolean) => (
    <TouchableOpacity
      key={t.id}
      style={[s.row, !last && s.rowBorder]}
      onPress={() => (TAB_ROUTES.has(t.route)
        ? navigation.navigate('ManagerTabs', { screen: t.route, params: t.params })
        : navigation.navigate(t.route, t.params))}
      activeOpacity={0.7}
    >
      <View style={[s.iconWrap, { backgroundColor: t.color + '18' }]}>
        <Text style={s.icon}>{t.icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.label}>{t.label}</Text>
        <Text style={s.hint}>{t.hint}</Text>
      </View>
      <View style={[s.count, { backgroundColor: t.color }]}>
        <Text style={s.countText}>{t.count}</Text>
      </View>
      <Text style={s.chevron}>›</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.back} accessibilityLabel="Quay lại">
          <Text style={s.backText}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Việc của tôi</Text>
          <Text style={s.sub}>{loading ? 'Đang tải…' : total > 0 ? `${total} việc cần làm` : 'Không có việc nào tồn đọng'}</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
          {items.length === 0 && (
            <View style={s.clear}>
              <Text style={{ fontSize: 40 }}>✅</Text>
              <Text style={s.clearText}>Mọi thứ ổn định — không có việc nào cần làm.</Text>
            </View>
          )}
          {SECTIONS.map(sec => {
            const list = items.filter(i => i.urgency === sec.key);
            if (list.length === 0) return null;
            return (
              <View key={sec.key} style={{ marginBottom: Spacing.lg }}>
                <View style={s.secHead}>
                  <View style={[s.secDot, { backgroundColor: sec.color }]} />
                  <Text style={s.secTitle}>{sec.title}</Text>
                  <Text style={s.secSub}>· {sec.sub}</Text>
                </View>
                <View style={[s.card, { borderLeftColor: sec.color }]}>
                  {list.map((t, i) => renderRow(t, i === list.length - 1))}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  back: { padding: Spacing.sm },
  backText: { fontSize: 24, lineHeight: 28, color: Colors.primary, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  sub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  body: { padding: Spacing.base, paddingBottom: 100 },
  clear: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  clearText: { fontSize: 14, color: Colors.textMuted, fontWeight: '600' },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  secDot: { width: 8, height: 8, borderRadius: 4 },
  secTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  secSub: { fontSize: 12, color: Colors.textMuted },
  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, borderWidth: 1,
    borderColor: Colors.border, borderLeftWidth: 4, overflow: 'hidden', ...Shadow.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  iconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 18 },
  label: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  hint: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  count: { minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' },
  countText: { color: Colors.white, fontSize: 12, fontWeight: '800' },
  chevron: { fontSize: 18, color: Colors.textMuted },
});
