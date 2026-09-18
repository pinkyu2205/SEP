import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius } from '@/constants';
import { realEquipmentService } from '@/services/manager/equipmentService';
import type { EquipmentDto } from '@/types';

/**
 * THẺ THIẾT BỊ CỦA MỘT NHÀ — dùng chung cho màn chi tiết nhà chia phòng và nhà nguyên căn.
 *
 * Vì sao có (18/09/2026): màn Thiết bị đã lọc được theo nhà, nhưng từ màn chi tiết nhà thì
 * không có lối vào. Quản lý đang đứng ở nhà A phải quay về trang chủ → "Thiết bị" → chọn lại
 * nhà A; còn nhà nguyên căn thì không có đường nào khác. Thẻ này là lối vào đó, kèm luôn con
 * số đáng lo nhất — bao nhiêu món đang hỏng/đang sửa — để khỏi phải mở ra mới biết.
 *
 * Không đếm đồ đã thanh lý hay đã gỡ khỏi phòng: chúng không còn trong nhà nữa.
 */
const NEEDS_ATTENTION = new Set(['DAMAGED', 'BROKEN', 'MAINTENANCE']);

const isInUse = (e: EquipmentDto) =>
  e.status !== 'DISPOSED' && (e.operationalStatus ?? '').toUpperCase() !== 'DISABLED';

export const EquipmentSummaryCard: React.FC<{
  propertyId: number;
  onOpen: () => void;
  /** Mặc định "Thiết bị" — danh sách nhà của màn Thiết bị truyền tên nhà vào đây. */
  title?: string;
  icon?: string;
  /** Chữ đứng trước số đếm, vd "Chia phòng". */
  prefix?: string;
}> = ({ propertyId, onOpen, title = 'Thiết bị', icon = '📦', prefix }) => {
  const [items, setItems] = useState<EquipmentDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Nạp lại mỗi lần quay về: vừa đổi trạng thái thiết bị bên màn kia thì con số ở đây phải theo.
  useFocusEffect(useCallback(() => {
    let alive = true;
    realEquipmentService.getByProperty(propertyId)
      .then(list => { if (alive) { setItems(list ?? []); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [propertyId]));

  const inUse = (items ?? []).filter(isInUse);
  const attention = inUse.filter(e => NEEDS_ATTENTION.has(e.status)).length;

  const count = failed
    ? 'Không tải được — bấm để mở danh sách'
    : items == null
      ? null
      : inUse.length === 0
        ? 'Chưa có thiết bị nào'
        : `${inUse.length} thiết bị đang dùng`;
  const sub = count == null ? null : [prefix, count].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity style={st.card} onPress={onOpen} activeOpacity={0.75}>
      <View style={st.iconWrap}><Text style={st.icon}>{icon}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={st.title} numberOfLines={2}>{title}</Text>
        {sub == null
          ? <ActivityIndicator size="small" color={Colors.primary} style={st.loader} />
          : <Text style={st.sub}>{sub}</Text>}
      </View>
      {attention > 0 && (
        <View style={st.badge}>
          <Text style={st.badgeText}>{attention} cần sửa/thay</Text>
        </View>
      )}
      <Text style={st.chevron}>›</Text>
    </TouchableOpacity>
  );
};

const st = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.md, marginBottom: Spacing.md,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: BorderRadius.md,
    backgroundColor: '#0EA5E918', alignItems: 'center', justifyContent: 'center',
  },
  icon: { fontSize: 18 },
  title: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  sub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  loader: { alignSelf: 'flex-start', marginTop: 2 },
  badge: {
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: Colors.error },
  chevron: { fontSize: 18, color: Colors.textMuted },
});
