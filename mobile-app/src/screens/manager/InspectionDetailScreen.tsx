import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  Modal, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import {
  getInspectionById,
  getInspectionStatusLabel,
  getInspectionTypeLabel,
  getSiblingInspection,
  RoomInspection,
} from '../../data/roomInspections';

const money = (value?: number) => value ? `${value.toLocaleString('vi-VN')}đ` : 'Không có';

const makeDraftCheckOut = (params: any): RoomInspection => ({
  id: `draft-checkout-${params.contractId || 'new'}`,
  contractId: params.contractId || 'unknown',
  tenantId: params.tenantId || 'unknown',
  tenantName: params.tenantName || 'Khách thuê',
  propertyId: params.propertyId || 'unknown',
  propertyName: params.propertyName || 'Tài sản',
  roomId: params.roomId,
  roomCode: params.roomCode,
  inspectionType: 'check_out',
  images: [],
  notes: '',
  damageNotes: '',
  depositDeductionNotes: '',
  depositDeductionAmount: 0,
  createdBy: 'Manager hiện tại',
  createdAt: new Date().toISOString().slice(0, 10),
  status: 'draft',
  timeline: [{ label: 'Đang lập biên bản check-out', at: new Date().toLocaleString('vi-VN'), by: 'Manager hiện tại' }],
});

export const InspectionDetailScreen: React.FC<any> = ({ navigation, route }) => {
  const params = route?.params || {};
  const existing = params.inspectionId ? getInspectionById(params.inspectionId) : undefined;
  const [draft, setDraft] = useState<RoomInspection | null>(
    params.mode === 'create_check_out' ? makeDraftCheckOut(params) : null
  );
  const inspection = draft || existing;
  const sibling = useMemo(() => inspection ? getSiblingInspection(inspection) : undefined, [inspection]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  if (!inspection) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Quay lại</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Biên bản hiện trạng</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Chưa có biên bản hiện trạng.</Text>
          <Text style={styles.emptyDesc}>Biên bản có thể đã bị xoá hoặc chưa được tạo cho hợp đồng này.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const editable = !!draft;
  const typeLabel = getInspectionTypeLabel(inspection.inspectionType);

  const addPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Lỗi', 'Cần quyền truy cập camera để chụp ảnh check-out.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.5 });
    if (!result.canceled && result.assets[0]) {
      setDraft(prev => prev ? { ...prev, images: [...prev.images, result.assets[0].uri] } : prev);
    }
  };

  const removePhoto = (uri: string) => {
    setDraft(prev => prev ? { ...prev, images: prev.images.filter(item => item !== uri) } : prev);
  };

  const updateDraft = (key: keyof RoomInspection, value: string | number) => {
    setDraft(prev => prev ? { ...prev, [key]: value } : prev);
  };

  const submitDraft = () => {
    if (!draft || draft.images.length === 0) {
      Alert.alert('Lỗi', 'Vui lòng chụp ít nhất 1 ảnh check-out.');
      return;
    }
    Alert.alert('Đã lưu biên bản check-out', 'Mock: biên bản check-out đã được gắn vào hợp đồng.');
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{typeLabel} Inspection</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroKicker}>Biên bản hiện trạng</Text>
          <Text style={styles.heroTitle}>{inspection.propertyName}{inspection.roomCode ? ` · ${inspection.roomCode}` : ''}</Text>
          <View style={styles.heroMetaRow}>
            <Text style={styles.heroPill}>{typeLabel}</Text>
            <Text style={styles.heroPill}>{getInspectionStatusLabel(inspection.status)}</Text>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <InfoBox label="Ngày lập" value={inspection.createdAt} />
          <InfoBox label="Người lập" value={inspection.createdBy} />
          <InfoBox label="Số ảnh" value={`${inspection.images.length} ảnh`} />
          <InfoBox label="Khấu trừ cọc" value={money(inspection.depositDeductionAmount)} warning />
        </View>

        <Section title="Thông tin liên quan">
          <InfoRow label="Hợp đồng" value={inspection.contractId} />
          <InfoRow label="Khách thuê" value={inspection.tenantName} />
          <InfoRow label="Tài sản" value={inspection.propertyName} />
          <InfoRow label="Phòng / Nhà" value={inspection.roomCode || 'Nhà nguyên căn'} />
        </Section>

        <Section title="Thư viện ảnh">
          {inspection.images.length === 0 ? (
            <Text style={styles.emptyText}>Chưa có ảnh check-out.</Text>
          ) : (
            <View style={styles.imageGrid}>
              {inspection.images.map((uri, index) => (
                <TouchableOpacity key={`${uri}-${index}`} style={styles.imageWrap} onPress={() => setSelectedImage(uri)}>
                  <Image source={{ uri }} style={styles.thumb} />
                  {editable && (
                    <TouchableOpacity style={styles.deletePhotoBtn} onPress={() => removePhoto(uri)}>
                      <Text style={styles.deletePhotoText}>×</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
          {editable && (
            <TouchableOpacity style={styles.cameraBtn} onPress={addPhoto}>
              <Text style={styles.cameraBtnText}>📸 Chụp thêm ảnh</Text>
            </TouchableOpacity>
          )}
        </Section>

        <Section title="Ghi chú hiện trạng">
          {editable ? (
            <TextInput
              style={styles.noteInput}
              value={draft?.notes}
              onChangeText={value => updateDraft('notes', value)}
              multiline
              placeholder="Ghi chú tình trạng bàn giao..."
              placeholderTextColor={Colors.textMuted}
            />
          ) : (
            <Text style={styles.noteText}>{inspection.notes || 'Chưa có ghi chú hiện trạng.'}</Text>
          )}
        </Section>

        {(inspection.inspectionType === 'check_out' || editable) && (
          <Section title="Thiệt hại & khấu trừ cọc">
            {editable ? (
              <>
                <TextInput
                  style={styles.noteInput}
                  value={draft?.damageNotes}
                  onChangeText={value => updateDraft('damageNotes', value)}
                  multiline
                  placeholder="Ghi chú hư hỏng phát sinh..."
                  placeholderTextColor={Colors.textMuted}
                />
                <TextInput
                  style={styles.noteInput}
                  value={draft?.depositDeductionNotes}
                  onChangeText={value => updateDraft('depositDeductionNotes', value)}
                  multiline
                  placeholder="Ghi chú khấu trừ tiền cọc..."
                  placeholderTextColor={Colors.textMuted}
                />
                <TextInput
                  style={styles.amountInput}
                  value={String(draft?.depositDeductionAmount || '')}
                  onChangeText={value => updateDraft('depositDeductionAmount', Number(value || 0))}
                  keyboardType="numeric"
                  placeholder="Số tiền khấu trừ"
                  placeholderTextColor={Colors.textMuted}
                />
              </>
            ) : (
              <>
                <Text style={styles.noteText}>{inspection.damageNotes || 'Chưa có ghi chú hư hỏng.'}</Text>
                <Text style={styles.noteText}>{inspection.depositDeductionNotes || 'Chưa có ghi chú khấu trừ cọc.'}</Text>
              </>
            )}
          </Section>
        )}

        <Section title="So sánh trước / sau">
          {sibling ? (
            <View style={styles.compareRow}>
              <CompareColumn title={getInspectionTypeLabel(sibling.inspectionType)} inspection={sibling} onImage={setSelectedImage} />
              <CompareColumn title={typeLabel} inspection={inspection} onImage={setSelectedImage} />
            </View>
          ) : (
            <Text style={styles.emptyText}>
              {inspection.inspectionType === 'check_in'
                ? 'Chưa có ảnh check-out.'
                : 'Chưa có biên bản check-in để so sánh.'}
            </Text>
          )}
        </Section>

        <Section title="Timeline biên bản">
          {inspection.timeline.map((item, index) => (
            <View key={`${item.label}-${index}`} style={styles.timelineRow}>
              <View style={styles.timelineDot} />
              <View style={styles.timelineContent}>
                <Text style={styles.timelineTitle}>{item.label}</Text>
                <Text style={styles.timelineMeta}>{item.by} · {item.at}</Text>
              </View>
            </View>
          ))}
        </Section>

        <View style={styles.futureBox}>
          <Text style={styles.futureTitle}>Future-ready</Text>
          <Text style={styles.futureText}>Có thể mở rộng cho báo cáo hư hỏng, đối chiếu AI, chữ ký xác nhận của tenant và xuất PDF bàn giao.</Text>
        </View>
      </ScrollView>

      {editable && (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.primaryBtn} onPress={submitDraft}>
            <Text style={styles.primaryBtnText}>Lưu biên bản check-out</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={!!selectedImage} transparent animationType="fade">
        <View style={styles.viewer}>
          <TouchableOpacity style={styles.viewerClose} onPress={() => setSelectedImage(null)}>
            <Text style={styles.viewerCloseText}>×</Text>
          </TouchableOpacity>
          {selectedImage && <Image source={{ uri: selectedImage }} style={styles.viewerImage} resizeMode="contain" />}
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const InfoBox = ({ label, value, warning }: { label: string; value: string; warning?: boolean }) => (
  <View style={styles.infoBox}>
    <Text style={styles.infoBoxLabel}>{label}</Text>
    <Text style={[styles.infoBoxValue, warning && { color: Colors.warning }]}>{value}</Text>
  </View>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const CompareColumn = ({
  title, inspection, onImage,
}: {
  title: string; inspection: RoomInspection; onImage: (uri: string) => void;
}) => (
  <View style={styles.compareCol}>
    <Text style={styles.compareTitle}>{title}</Text>
    {inspection.images[0] ? (
      <TouchableOpacity onPress={() => onImage(inspection.images[0])}>
        <Image source={{ uri: inspection.images[0] }} style={styles.compareImage} />
      </TouchableOpacity>
    ) : (
      <View style={styles.compareEmpty}><Text style={styles.compareEmptyText}>Không có ảnh</Text></View>
    )}
    <Text style={styles.compareMeta}>{inspection.images.length} ảnh · {inspection.createdAt}</Text>
  </View>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backText: { color: Colors.primary, fontWeight: '700', fontSize: 13, width: 82 },
  title: { flex: 1, textAlign: 'center', fontSize: 16, color: Colors.textPrimary, fontWeight: '900' },
  headerSpacer: { width: 82 },
  scroll: { padding: Spacing.base, paddingBottom: 120 },
  hero: { backgroundColor: '#EEF2FF', borderRadius: 18, padding: Spacing.lg, marginBottom: Spacing.md },
  heroKicker: { fontSize: 11, color: Colors.primary, fontWeight: '900', textTransform: 'uppercase' },
  heroTitle: { fontSize: 20, color: '#1E1B4B', fontWeight: '900', marginTop: 4 },
  heroMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  heroPill: { backgroundColor: Colors.white, color: Colors.primary, fontWeight: '800', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, fontSize: 12 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  infoBox: { width: '48%', backgroundColor: Colors.white, borderRadius: 14, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  infoBoxLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '800' },
  infoBoxValue: { fontSize: 14, color: Colors.textPrimary, fontWeight: '900', marginTop: 4 },
  section: { backgroundColor: Colors.white, borderRadius: 16, padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm },
  sectionTitle: { fontSize: 13, fontWeight: '900', color: Colors.textPrimary, marginBottom: Spacing.md },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  infoLabel: { flex: 1, fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
  infoValue: { flex: 1, fontSize: 13, color: Colors.textPrimary, fontWeight: '800', textAlign: 'right' },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  imageWrap: { width: '31%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: '#E2E8F0' },
  thumb: { width: '100%', height: '100%' },
  deletePhotoBtn: { position: 'absolute', right: 5, top: 5, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(15,23,42,0.7)', alignItems: 'center', justifyContent: 'center' },
  deletePhotoText: { color: Colors.white, fontSize: 18, lineHeight: 21, fontWeight: '900' },
  cameraBtn: { marginTop: Spacing.md, borderRadius: 12, padding: Spacing.md, alignItems: 'center', backgroundColor: Colors.primaryBg, borderWidth: 1, borderColor: '#C7D2FE' },
  cameraBtnText: { color: Colors.primary, fontWeight: '900' },
  noteText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, marginBottom: 6 },
  noteInput: { minHeight: 84, textAlignVertical: 'top', backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, marginBottom: Spacing.sm, color: Colors.textPrimary },
  amountInput: { backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, color: Colors.textPrimary },
  compareRow: { flexDirection: 'row', gap: Spacing.sm },
  compareCol: { flex: 1 },
  compareTitle: { fontSize: 12, fontWeight: '900', color: Colors.textPrimary, marginBottom: 6 },
  compareImage: { width: '100%', aspectRatio: 0.85, borderRadius: 12, backgroundColor: '#E2E8F0' },
  compareEmpty: { aspectRatio: 0.85, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  compareEmptyText: { fontSize: 12, color: Colors.textMuted },
  compareMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 5, fontWeight: '700' },
  timelineRow: { flexDirection: 'row', gap: Spacing.md, paddingVertical: 8 },
  timelineDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: Colors.primary, marginTop: 4 },
  timelineContent: { flex: 1 },
  timelineTitle: { fontSize: 13, color: Colors.textPrimary, fontWeight: '800' },
  timelineMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  futureBox: { backgroundColor: '#FFFBEB', borderRadius: 14, padding: Spacing.base, borderWidth: 1, borderColor: '#FDE68A' },
  futureTitle: { fontSize: 13, color: '#92400E', fontWeight: '900', marginBottom: 4 },
  futureText: { fontSize: 12, color: '#92400E', lineHeight: 18 },
  emptyText: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  emptyTitle: { fontSize: 17, color: Colors.textPrimary, fontWeight: '900' },
  emptyDesc: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', marginTop: 8 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: Colors.white, padding: Spacing.base, borderTopWidth: 1, borderTopColor: Colors.border },
  primaryBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: Colors.white, fontSize: 15, fontWeight: '900' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '82%' },
  viewerClose: { position: 'absolute', top: 48, right: 24, zIndex: 2, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  viewerCloseText: { color: Colors.white, fontSize: 30, lineHeight: 34 },
});
