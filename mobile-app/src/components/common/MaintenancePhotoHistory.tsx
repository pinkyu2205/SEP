import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { formatDate, isVideoUrl } from '@/utils';
import type { MaintenancePhotoHistoryDto } from '@/types';
import { PhotoLightbox, type LightboxState } from './PhotoLightbox';
import { VideoPreviewModal } from './VideoPreviewModal';

const GROUPS: { type: MaintenancePhotoHistoryDto['type']; label: string; color: string }[] = [
  { type: 'BEFORE',         label: '📸 Hiện trạng ban đầu', color: Colors.warning },
  { type: 'FAULT_EVIDENCE', label: '⚠️ Bằng chứng lỗi',      color: '#DC2626' },
  { type: 'SELF_REPAIR',    label: '🛠 Tenant tự sửa',       color: '#F97316' },
  { type: 'AFTER',          label: '🖼️ Sau sửa chữa',        color: Colors.success },
  { type: 'INVOICE',        label: '🧾 Hoá đơn',             color: '#0369A1' },
];

/**
 * Log ảnh đầy đủ MỌI vòng (append-only, field `photoHistory`) — khác với
 * beforeImages/afterImages/invoiceImages... chỉ là snapshot vòng hiện tại. Dùng để đối
 * chiếu khi có tranh chấp. Dùng chung cho cả tenant và manager.
 */
export const MaintenancePhotoHistory: React.FC<{ photos?: MaintenancePhotoHistoryDto[] }> = ({ photos }) => {
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  if (!photos || photos.length === 0) return null;
  const sorted = [...photos].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <View style={s.card}>
      <Text style={s.title}>🗂️ Lịch sử ảnh (mọi vòng)</Text>
      {GROUPS.map(g => {
        const items = sorted.filter(p => p.type === g.type);
        if (items.length === 0) return null;
        const uris = items.map(p => p.url);
        return (
          <View key={g.type} style={s.group}>
            <Text style={[s.groupLabel, { color: g.color }]}>{g.label} ({items.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {items.map((p, i) => {
                const isVideo = isVideoUrl(p.url);
                return (
                  <TouchableOpacity key={`${p.url}-${i}`} activeOpacity={0.85}
                    style={[s.item, { borderColor: g.color + '50' }]}
                    onPress={() => isVideo ? setVideoPreviewUrl(p.url) : setLightbox({ uris, index: i })}
                  >
                    {isVideo ? (
                      <View style={[s.thumb, s.videoThumb]}>
                        <Text style={{ fontSize: 18 }}>🎬</Text>
                      </View>
                    ) : (
                      <Image source={{ uri: p.url }} style={s.thumb} />
                    )}
                    <Text style={s.date}>{formatDate(p.createdAt)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        );
      })}
      <PhotoLightbox state={lightbox} onChange={setLightbox} />
      <VideoPreviewModal visible={!!videoPreviewUrl} url={videoPreviewUrl} onClose={() => setVideoPreviewUrl(null)} />
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
  videoThumb: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A' },
  date: { fontSize: 10, color: Colors.textMuted, padding: 4, textAlign: 'center' },
});
