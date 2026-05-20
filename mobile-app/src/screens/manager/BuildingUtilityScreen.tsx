import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { getPropertyById, getBuildingOps, BuildingUtilityReading } from '../../data/managedProperties';

export const BuildingUtilityScreen: React.FC<any> = ({ navigation, route }) => {
  const propertyId: string = route?.params?.propertyId;
  const prop = getPropertyById(propertyId);
  const [readings, setReadings] = useState<BuildingUtilityReading[]>(() => getBuildingOps(propertyId).utility);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ elec: string; water: string }>({ elec: '', water: '' });

  const missingCount = readings.filter(r => r.status === 'missing').length;

  const openRow = (r: BuildingUtilityReading) => {
    if (openId === r.id) { setOpenId(null); return; }
    setOpenId(r.id);
    setForm({ elec: '', water: '' });
  };

  const simulateOCR = () => {
    // Placeholder for camera + OCR capture — fills plausible new values.
    setForm({ elec: String(Math.floor(1300 + Math.random() * 200)), water: String(Math.floor(90 + Math.random() * 30)) });
    Alert.alert('Đã nhận diện (OCR)', 'Chỉ số từ ảnh đồng hồ đã được điền tự động. Vui lòng kiểm tra lại.');
  };

  const submit = (r: BuildingUtilityReading) => {
    const elec = Number(form.elec);
    const water = Number(form.water);
    if (!elec || !water) return Alert.alert('Thiếu dữ liệu', 'Vui lòng nhập đủ chỉ số điện và nước.');
    if (elec < r.elecPrev || water < r.waterPrev) return Alert.alert('Lỗi', 'Chỉ số mới không được nhỏ hơn chỉ số cũ.');
    setReadings(prev => prev.map(x => x.id === r.id ? {
      ...x, status: 'done', elecPrev: elec, waterPrev: water, lastReadingDate: '2026-05-20',
    } : x));
    setOpenId(null);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Chốt số điện nước</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{prop?.name || ''}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {missingCount > 0 && (
          <View style={styles.warnBanner}>
            <Text style={styles.warnText}>⚡ Còn {missingCount} phòng chưa chốt chỉ số tháng này</Text>
          </View>
        )}

        {readings.map(r => {
          const done = r.status === 'done';
          const open = openId === r.id;
          return (
            <View key={r.id} style={styles.card}>
              <TouchableOpacity style={styles.cardTop} activeOpacity={0.7} onPress={() => openRow(r)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{r.room} · {r.tenant}</Text>
                  <Text style={styles.cardMeta}>Điện: {r.elecPrev} kWh · Nước: {r.waterPrev} m³ · {r.lastReadingDate}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: done ? '#F0FDF4' : '#FEF3C7' }]}>
                  <Text style={[styles.badgeText, { color: done ? '#16A34A' : '#D97706' }]}>{done ? 'Đã chốt' : 'Chưa chốt'}</Text>
                </View>
              </TouchableOpacity>

              {open && (
                <View style={styles.form}>
                  <TouchableOpacity style={styles.ocrBtn} onPress={simulateOCR}>
                    <Text style={styles.ocrBtnText}>📷 Chụp ảnh đồng hồ (OCR)</Text>
                  </TouchableOpacity>
                  <View style={styles.formRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.formLabel}>Điện mới (kWh)</Text>
                      <TextInput style={styles.input} keyboardType="numeric" value={form.elec}
                        onChangeText={t => setForm({ ...form, elec: t })} placeholder={`> ${r.elecPrev}`} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.formLabel}>Nước mới (m³)</Text>
                      <TextInput style={styles.input} keyboardType="numeric" value={form.water}
                        onChangeText={t => setForm({ ...form, water: t })} placeholder={`> ${r.waterPrev}`} />
                    </View>
                  </View>
                  <TouchableOpacity style={styles.submitBtn} onPress={() => submit(r)}>
                    <Text style={styles.submitBtnText}>Gửi chỉ số</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, backgroundColor: Colors.white, ...Shadow.sm },
  backText: { color: Colors.primary, fontWeight: '600', fontSize: 15, width: 60 },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary },
  subtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },

  scroll: { padding: Spacing.lg },
  warnBanner: { backgroundColor: '#FEF3C7', borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.md },
  warnText: { fontSize: 13, fontWeight: '600', color: '#D97706' },

  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  cardMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  badgeText: { fontSize: 11, fontWeight: '700' },

  form: { marginTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: Spacing.md, gap: Spacing.sm },
  ocrBtn: { backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md, paddingVertical: 10, alignItems: 'center' },
  ocrBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  formRow: { flexDirection: 'row', gap: Spacing.md },
  formLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
  input: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.sm, fontSize: 15, color: Colors.textPrimary },
  submitBtn: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: Spacing.sm, alignItems: 'center', marginTop: 2 },
  submitBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },
});
