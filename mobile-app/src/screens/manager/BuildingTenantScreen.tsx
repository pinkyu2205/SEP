import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { getPropertyById, getBuildingOps, BuildingTenantInfo, PaymentRisk } from '@/data/managedProperties';

const RISK_META: Record<PaymentRisk, { label: string; color: string; bg: string }> = {
  low: { label: 'Rủi ro thấp', color: '#16A34A', bg: '#F0FDF4' },
  medium: { label: 'Cần theo dõi', color: '#D97706', bg: '#FEF3C7' },
  high: { label: 'Rủi ro cao', color: '#EF4444', bg: '#FEE2E2' },
};

const FILTERS: { id: 'all' | PaymentRisk; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'high', label: 'Rủi ro cao' },
  { id: 'medium', label: 'Theo dõi' },
  { id: 'low', label: 'Ổn định' },
];

export const BuildingTenantScreen: React.FC<any> = ({ navigation, route }) => {
  const propertyId: string = route?.params?.propertyId;
  const prop = getPropertyById(propertyId);
  const ops = getBuildingOps(propertyId);
  const [filter, setFilter] = useState<'all' | PaymentRisk>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const isWholeHouse = prop?.propertyType === 'WHOLE_HOUSE';

  const list = filter === 'all' ? ops.tenants : ops.tenants.filter(t => t.paymentRisk === filter);

  const maintenanceCount = (room: string) => ops.maintenance.filter(m => m.room === room).length;
  const hasOverdue = (room: string) => ops.invoices.some(i => i.room === room && i.status !== 'paid');

  const contact = (t: BuildingTenantInfo) => {
    Alert.alert(t.name, `Liên hệ ${t.phone}?`, [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Gọi', onPress: () => {} },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>{isWholeHouse ? 'Người đại diện thuê nhà' : 'Khách thuê'}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{prop?.name || ''}</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      {!isWholeHouse && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
          {FILTERS.map(f => (
            <TouchableOpacity key={f.id} style={[styles.chip, filter === f.id && styles.chipActive]} onPress={() => setFilter(f.id)}>
              <Text style={[styles.chipText, filter === f.id && styles.chipTextActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {isWholeHouse ? (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{prop?.tenantName?.charAt(0) || '?'}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{prop?.tenantName || 'Chưa có người đại diện'}</Text>
                <Text style={styles.meta}>Người đại diện thuê nhà · {prop?.contractEndDate ? `HĐ đến ${prop.contractEndDate}` : 'Chưa có hợp đồng'}</Text>
              </View>
            </View>
            <View style={styles.detail}>
              {(prop?.occupants || []).map(member => (
                <View key={member.name} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{member.relation}</Text>
                  <Text style={styles.detailVal}>{member.name}{member.phone ? ` · ${member.phone}` : ''}</Text>
                </View>
              ))}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Giá thuê</Text>
                <Text style={styles.detailVal}>{prop?.monthlyRent ? `${prop.monthlyRent.toLocaleString('vi-VN')}đ/tháng` : 'Chưa cấu hình'}</Text>
              </View>
            </View>
          </View>
        ) : list.length === 0 ? (
          <Text style={styles.empty}>Không có khách thuê</Text>
        ) : list.map(t => {
          const risk = RISK_META[t.paymentRisk];
          const open = openId === t.id;
          return (
            <View key={t.id} style={styles.card}>
              <TouchableOpacity style={styles.cardTop} activeOpacity={0.7} onPress={() => setOpenId(open ? null : t.id)}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{t.name.charAt(0)}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{t.name}</Text>
                  <Text style={styles.meta}>{t.room} · {t.phone}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: risk.bg }]}>
                  <Text style={[styles.badgeText, { color: risk.color }]}>{risk.label}</Text>
                </View>
              </TouchableOpacity>

              {open && (
                <View style={styles.detail}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Ngày vào ở</Text>
                    <Text style={styles.detailVal}>{t.moveInDate}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Công nợ</Text>
                    <Text style={[styles.detailVal, { color: hasOverdue(t.room) ? '#EF4444' : '#16A34A' }]}>
                      {hasOverdue(t.room) ? 'Đang nợ' : 'Đã thanh toán'}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Lịch sử bảo trì</Text>
                    <Text style={styles.detailVal}>{maintenanceCount(t.room)} phiếu</Text>
                  </View>
                  <TouchableOpacity style={styles.contactBtn} onPress={() => contact(t)}>
                    <Text style={styles.contactBtnText}>📞 Liên hệ</Text>
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

  filterRow: { flexGrow: 0, marginTop: Spacing.md },
  filterContent: { paddingHorizontal: Spacing.lg, gap: Spacing.sm },
  chip: { height: 32, justifyContent: 'center', paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },

  scroll: { padding: Spacing.lg },
  empty: { textAlign: 'center', color: Colors.textMuted, paddingVertical: Spacing.xl },

  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800', color: Colors.primary },
  name: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  meta: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  badge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  badgeText: { fontSize: 10, fontWeight: '700' },

  detail: { marginTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: Spacing.sm },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  detailLabel: { fontSize: 12, color: Colors.textSecondary },
  detailVal: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  contactBtn: { backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md, paddingVertical: Spacing.sm, alignItems: 'center', marginTop: Spacing.sm },
  contactBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
});
