import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { formatDate } from '@/utils';
import type { MaintenancePhotoHistoryDto } from '@/types';

const GROUPS: { type: MaintenancePhotoHistoryDto['type']; label: string; color: string }[] = [
  { type: 'BEFORE', label: '📸 Trước sửa chữa', color: Colors.warning },
  { type: 'AFTER',  label: '🛠️ Sau sửa chữa',   color: Colors.success },
  { type: 'REJECT', label: '↩️ Khách từ chối',   color: Colors.error },
];

/**
 * Log ảnh đầy đủ MỌI vòng sửa/từ chối (BE 23/07/2026, field `photoHistory`) — khác với
 * beforeImages/afterImages/rejectImages chỉ là snapshot vòng hiện tại (bị reset khi sửa lại).
 * Dùng để đối chiếu khi có tranh chấp: xem lại ảnh AFTER lần 1 dù đã sang lần 2, lý do từ
 * chối lần trước dù đã được xử lý, v.v. Dùng chung cho cả tenant và manager.
 */
export const MaintenancePhotoHistory: React.FC<{ photos?: MaintenancePhotoHistoryDto[] }> = ({ photos }) => {
  if (!photos || photos.length === 0) return null;
  const sorted = [...photos].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <View style={s.card}>
      <Text style={s.title}>🗂️ Lịch sử ảnh (mọi vòng)</Text>
      {GROUPS.map(g => {
        const items = sorted.filter(p => p.type === g.type);
        if (items.length === 0) return null;
        return (
          <View key={g.type} style={s.group}>
            <Text style={[s.groupLabel, { color: g.color }]}>{g.label} ({items.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {items.map((p, i) => (
                <View key={`${p.url}-${i}`} style={[s.item, { borderColor: g.color + '50' }]}>
                  <Image source={{ uri: p.url }} style={s.thumb} />
                  <Text style={s.date}>{formatDate(p.createdAt)}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        );
      })}
    </View>
  );
};

const s = StyleSheet.create({
  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.xl, padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm, borderWidth: 1, borderColor: Colors.border },
  title: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm },
  group: { marginBottom: Spacing.sm },
  groupLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  item: { width: 88, marginRight: Spacing.sm, borderRadius: BorderRadius.md, borderWidth: 1, overflow: 'hidden' },
  thumb: { width: '100%', height: 72, backgroundColor: Colors.divider },
  date: { fontSize: 10, color: Colors.textMuted, padding: 4, textAlign: 'center' },
});
