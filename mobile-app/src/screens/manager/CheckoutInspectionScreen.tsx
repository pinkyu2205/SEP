import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, ActivityIndicator,
} from 'react-native';
import { showAlert, readApiError } from '@/utils';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { uploadImageToCloudinary } from '@/services/core/cloudinary';
import { checkoutService } from '@/services/manager/checkoutService';
import {
  realTenantSelfService,
  type CheckoutRequestDto, type CheckoutDamageItem, type ContractEquipmentDto,
} from '@/services/tenant/selfService';

/**
 * BIÊN BẢN KIỂM TRA PHÒNG lúc trả (bước INSPECTING của luồng checkout).
 *
 * Điểm cốt lõi: mọi khoản trừ tiền phải ĐỐI CHIẾU với thiết bị đã bàn giao lúc khách
 * nhận nhà — manager tự ghi hư hỏng mà không có gốc so sánh thì khách cãi là thua.
 * Danh sách thiết bị lấy từ hợp đồng (`equipmentList`); nếu không tải được vẫn cho
 * ghi khoản trừ thủ công để không chặn việc vận hành.
 *
 * Màn mock cũ `InspectionDetailScreen` giữ nguyên — vẫn còn 4 màn khác dùng nó.
 */

const money = (n: number) => (n || 0).toLocaleString('vi-VN') + 'đ';
const readErr = readApiError;
const toNum = (v: string) => Number((v || '').replace(/[^\d]/g, '')) || 0;

interface DamageDraft { amount: string; note: string }
interface ExtraDraft { label: string; amount: string }

export const CheckoutInspectionScreen: React.FC<any> = ({ navigation, route }) => {
  const checkoutId: number = route?.params?.checkoutId;

  const [req, setReq] = useState<CheckoutRequestDto | null>(null);
  const [equipment, setEquipment] = useState<ContractEquipmentDto[]>([]);
  const [equipmentError, setEquipmentError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [photos, setPhotos] = useState<string[]>([]);
  const [elecReading, setElecReading] = useState('');
  const [waterReading, setWaterReading] = useState('');
  const [note, setNote] = useState('');
  /** key = id thiết bị bị đánh dấu hư hỏng. Không có key = nguyên vẹn. */
  const [damages, setDamages] = useState<Record<string, DamageDraft>>({});
  const [extras, setExtras] = useState<ExtraDraft[]>([]);

  const load = useCallback(async () => {
    try {
      const detail = await checkoutService.get(checkoutId);
      setReq(detail);

      // Biên bản đã lưu trước đó (nếu manager quay lại sửa)
      const insp = detail.inspection ?? await checkoutService.getInspection(checkoutId).catch(() => null);
      if (insp) {
        setPhotos(insp.photos ?? []);
        setNote(insp.roomConditionNote ?? '');
        setElecReading(insp.electricityFinalReading != null ? String(insp.electricityFinalReading) : '');
        setWaterReading(insp.waterFinalReading != null ? String(insp.waterFinalReading) : '');
        const dmg: Record<string, DamageDraft> = {};
        const ext: ExtraDraft[] = [];
        (insp.damages ?? []).forEach(d => {
          if (d.equipmentId != null) dmg[String(d.equipmentId)] = { amount: String(d.amount ?? ''), note: d.note ?? '' };
          else ext.push({ label: d.label, amount: String(d.amount ?? '') });
        });
        setDamages(dmg);
        setExtras(ext);
      }

      // Thiết bị đã bàn giao — gốc để đối chiếu
      try {
        const contract = await realTenantSelfService.getContractDetail(detail.contractId);
        setEquipment(contract.equipmentList ?? []);
      } catch {
        setEquipmentError(true);
      }
    } catch (e: any) {
      showAlert('Lỗi', readErr(e, 'Không tải được hồ sơ trả phòng.'));
    } finally {
      setLoading(false);
    }
  }, [checkoutId]);

  useEffect(() => { load(); }, [load]);

  const pickPhoto = async (fromCamera: boolean) => {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      return showAlert('Thiếu quyền', fromCamera ? 'Cần quyền camera để chụp ảnh hiện trạng.' : 'Cần quyền truy cập thư viện ảnh.');
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    if (result.canceled || !result.assets?.[0]) return;

    setUploading(true);
    try {
      const url = await uploadImageToCloudinary(result.assets[0].uri);
      setPhotos(p => [...p, url]);
    } catch (e: any) {
      showAlert('Lỗi upload', readErr(e, 'Không tải được ảnh lên.'));
    } finally {
      setUploading(false);
    }
  };

  const toggleDamage = (id: string) =>
    setDamages(prev => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = { amount: '', note: '' };
      return next;
    });

  const setDamageField = (id: string, key: keyof DamageDraft, value: string) =>
    setDamages(prev => ({ ...prev, [id]: { ...prev[id], [key]: value } }));

  const damageTotal = useMemo(() => {
    const fromEquipment = Object.values(damages).reduce((s, d) => s + toNum(d.amount), 0);
    const fromExtras = extras.reduce((s, x) => s + toNum(x.amount), 0);
    return fromEquipment + fromExtras;
  }, [damages, extras]);

  const buildDamages = (): CheckoutDamageItem[] => [
    ...Object.entries(damages).map(([id, d]) => ({
      equipmentId: Number(id) || undefined,
      label: equipment.find(e => String(e.id) === id)?.name ?? `Thiết bị #${id}`,
      amount: toNum(d.amount),
      note: d.note.trim() || undefined,
    })),
    ...extras
      .filter(x => x.label.trim())
      .map(x => ({ label: x.label.trim(), amount: toNum(x.amount) })),
  ];

  const save = async (goSettlement: boolean) => {
    if (photos.length === 0) {
      return showAlert('Thiếu ảnh', 'Chụp ít nhất 1 ảnh hiện trạng phòng — đây là bằng chứng khi khách không đồng ý khoản trừ.');
    }
    const list = buildDamages();
    const missing = list.find(d => d.amount <= 0);
    if (missing) {
      return showAlert('Thiếu số tiền', `Khoản "${missing.label}" chưa có số tiền. Nhập số tiền hoặc bỏ đánh dấu hư hỏng.`);
    }

    setSaving(true);
    try {
      await checkoutService.saveInspection(checkoutId, {
        photos,
        roomConditionNote: note.trim() || undefined,
        electricityFinalReading: elecReading ? toNum(elecReading) : undefined,
        waterFinalReading: waterReading ? toNum(waterReading) : undefined,
        damages: list,
      });
      if (goSettlement) navigation.replace('CheckoutSettlement', { checkoutId });
      else {
        showAlert('Đã lưu', 'Biên bản kiểm tra đã lưu. Có thể quay lại sửa trước khi gửi bảng quyết toán.');
        navigation.goBack();
      }
    } catch (e: any) {
      showAlert('Lỗi', readErr(e, 'Không lưu được biên bản kiểm tra.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Biên bản kiểm tra</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        {/* Bối cảnh */}
        <View style={s.card}>
          <Text style={s.tenantName}>{req?.tenantFullName || 'Khách thuê'}</Text>
          <Text style={s.meta}>
            {req?.propertyName || '—'}{req?.roomNumber ? ` · Phòng ${req.roomNumber}` : ' · Nguyên căn'}
          </Text>
          <Text style={s.meta}>HĐ {req?.contractCode || `#${req?.contractId}`}</Text>
        </View>

        {/* 1. Ảnh hiện trạng */}
        <Text style={s.sectionTitle}>1. Ảnh hiện trạng <Text style={s.required}>*</Text></Text>
        <View style={s.card}>
          {photos.length === 0 ? (
            <Text style={s.empty}>Chưa có ảnh nào.</Text>
          ) : (
            <View style={s.photoGrid}>
              {photos.map((url, i) => (
                <View key={`${url}-${i}`} style={s.photoWrap}>
                  <Image source={{ uri: url }} style={s.photo} />
                  <TouchableOpacity
                    style={s.photoRemove}
                    onPress={() => setPhotos(p => p.filter((_, idx) => idx !== i))}
                  >
                    <Text style={s.photoRemoveText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          <View style={s.photoActions}>
            <TouchableOpacity style={s.photoBtn} onPress={() => pickPhoto(true)} disabled={uploading}>
              <Text style={s.photoBtnText}>📷 Chụp ảnh</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.photoBtn} onPress={() => pickPhoto(false)} disabled={uploading}>
              <Text style={s.photoBtnText}>🖼️ Chọn từ máy</Text>
            </TouchableOpacity>
          </View>
          {uploading && (
            <View style={s.uploadingRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={s.uploadingText}>Đang tải ảnh lên...</Text>
            </View>
          )}
        </View>

        {/* 2. Chốt điện/nước */}
        <Text style={s.sectionTitle}>2. Chỉ số điện/nước cuối kỳ</Text>
        <View style={s.card}>
          <Text style={s.helper}>
            Không chốt thì mất tiền điện/nước những ngày cuối — khách đi rồi rất khó đòi.
          </Text>
          <View style={s.readingRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>⚡ Chỉ số điện</Text>
              <TextInput
                style={s.input} value={elecReading} onChangeText={setElecReading}
                keyboardType="numeric" placeholder="VD: 1250" placeholderTextColor={Colors.textMuted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>💧 Chỉ số nước</Text>
              <TextInput
                style={s.input} value={waterReading} onChangeText={setWaterReading}
                keyboardType="numeric" placeholder="VD: 320" placeholderTextColor={Colors.textMuted}
              />
            </View>
          </View>
        </View>

        {/* 3. Đối chiếu thiết bị */}
        <Text style={s.sectionTitle}>3. Đối chiếu thiết bị đã bàn giao</Text>
        <View style={s.card}>
          {equipmentError ? (
            <Text style={s.empty}>
              Không tải được danh sách thiết bị của hợp đồng. Ghi khoản trừ ở mục 4 bên dưới.
            </Text>
          ) : equipment.length === 0 ? (
            <Text style={s.empty}>Hợp đồng không kèm thiết bị nào.</Text>
          ) : (
            equipment.map(item => {
              const id = String(item.id);
              const damaged = !!damages[id];
              return (
                <View key={id} style={s.eqRow}>
                  <View style={s.eqTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.eqName}>{item.name}</Text>
                      <Text style={s.eqMeta}>
                        Lúc giao: {item.condition || 'không ghi'}{item.quantity ? ` · SL ${item.quantity}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[s.eqToggle, damaged ? s.eqToggleBad : s.eqToggleOk]}
                      onPress={() => toggleDamage(id)}
                    >
                      <Text style={[s.eqToggleText, { color: damaged ? '#DC2626' : '#059669' }]}>
                        {damaged ? '⚠️ Hư hỏng' : '✓ Nguyên vẹn'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {damaged && (
                    <View style={s.eqDamage}>
                      <TextInput
                        style={[s.input, { marginBottom: 6 }]}
                        value={damages[id].amount}
                        onChangeText={v => setDamageField(id, 'amount', v)}
                        keyboardType="numeric"
                        placeholder="Số tiền trừ (đ)"
                        placeholderTextColor={Colors.textMuted}
                      />
                      <TextInput
                        style={s.input}
                        value={damages[id].note}
                        onChangeText={v => setDamageField(id, 'note', v)}
                        placeholder="Mô tả hư hỏng"
                        placeholderTextColor={Colors.textMuted}
                      />
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* 4. Khoản trừ khác */}
        <Text style={s.sectionTitle}>4. Khoản trừ khác</Text>
        <View style={s.card}>
          {extras.map((x, i) => (
            <View key={i} style={s.extraRow}>
              <TextInput
                style={[s.input, { flex: 2 }]}
                value={x.label}
                onChangeText={v => setExtras(list => list.map((it, idx) => idx === i ? { ...it, label: v } : it))}
                placeholder="VD: Phí vệ sinh"
                placeholderTextColor={Colors.textMuted}
              />
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={x.amount}
                onChangeText={v => setExtras(list => list.map((it, idx) => idx === i ? { ...it, amount: v } : it))}
                keyboardType="numeric"
                placeholder="Số tiền"
                placeholderTextColor={Colors.textMuted}
              />
              <TouchableOpacity onPress={() => setExtras(list => list.filter((_, idx) => idx !== i))}>
                <Text style={s.extraRemove}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={s.addBtn} onPress={() => setExtras(list => [...list, { label: '', amount: '' }])}>
            <Text style={s.addBtnText}>+ Thêm khoản trừ</Text>
          </TouchableOpacity>
        </View>

        {/* 5. Ghi chú */}
        <Text style={s.sectionTitle}>5. Ghi chú hiện trạng</Text>
        <View style={s.card}>
          <TextInput
            style={[s.input, { height: 84, textAlignVertical: 'top' }]}
            value={note} onChangeText={setNote} multiline
            placeholder="VD: Tường phòng ngủ có vết ố, sàn còn tốt..."
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        {/* Tổng đề xuất */}
        <View style={s.totalCard}>
          <Text style={s.totalLabel}>Tổng đề xuất trừ</Text>
          <Text style={s.totalValue}>{money(damageTotal)}</Text>
        </View>
        <Text style={s.totalNote}>
          Số cuối cùng do hệ thống tính ở bước quyết toán (cộng thêm hoá đơn khách còn nợ).
        </Text>

        <TouchableOpacity
          style={[s.primaryBtn, saving && s.btnDisabled]}
          onPress={() => save(true)}
          disabled={saving || uploading}
        >
          <Text style={s.primaryBtnText}>{saving ? 'Đang lưu...' : 'Lưu & sang quyết toán →'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.ghostBtn, saving && s.btnDisabled]}
          onPress={() => save(false)}
          disabled={saving || uploading}
        >
          <Text style={s.ghostBtnText}>Chỉ lưu biên bản</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: { padding: Spacing.sm },
  backArrow: { fontSize: 18, fontWeight: '600', color: Colors.primary },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },

  body: { padding: Spacing.lg },
  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md, ...Shadow.sm,
  },
  tenantName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  meta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  sectionTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.sm },
  required: { color: Colors.error },
  helper: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: Spacing.sm },
  label: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
  empty: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.sm },
  input: {
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: 14, color: Colors.textPrimary,
  },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  photoWrap: { position: 'relative' },
  photo: { width: 84, height: 84, borderRadius: BorderRadius.md, backgroundColor: Colors.divider },
  photoRemove: {
    position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.error, alignItems: 'center', justifyContent: 'center',
  },
  photoRemoveText: { color: Colors.white, fontSize: 15, fontWeight: '800', lineHeight: 17 },
  photoActions: { flexDirection: 'row', gap: Spacing.sm },
  photoBtn: {
    flex: 1, backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm, alignItems: 'center',
  },
  photoBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.sm },
  uploadingText: { fontSize: 12, color: Colors.textMuted },

  readingRow: { flexDirection: 'row', gap: Spacing.sm },

  eqRow: { borderBottomWidth: 1, borderBottomColor: Colors.divider, paddingVertical: Spacing.sm },
  eqTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  eqName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  eqMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  eqToggle: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full, borderWidth: 1 },
  eqToggleOk: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  eqToggleBad: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  eqToggleText: { fontSize: 12, fontWeight: '700' },
  eqDamage: { marginTop: Spacing.sm },

  extraRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  extraRemove: { fontSize: 22, color: Colors.error, fontWeight: '800', paddingHorizontal: 4 },
  addBtn: { paddingVertical: Spacing.sm, alignItems: 'center' },
  addBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  totalCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base,
    borderWidth: 1, borderColor: Colors.border,
  },
  totalLabel: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  totalValue: { fontSize: 18, fontWeight: '800', color: Colors.error },
  totalNote: { fontSize: 11, color: Colors.textMuted, marginTop: 6, marginBottom: Spacing.lg, lineHeight: 16 },

  primaryBtn: { backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, paddingVertical: Spacing.md, alignItems: 'center' },
  primaryBtnText: { fontSize: 14, fontWeight: '800', color: Colors.white },
  ghostBtn: { paddingVertical: Spacing.md, alignItems: 'center', marginTop: 4 },
  ghostBtnText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  btnDisabled: { opacity: 0.6 },
});
