import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { managerPropertyService } from '@/services/manager/propertyService';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';
import { realManagerInvoiceService } from '@/services/manager/invoiceService';

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

interface PropItem { id: number; name: string; wholeHouse: boolean }
interface RentRow {
  key: string;
  contractId: number;
  roomId?: number;
  roomNumber?: string | null;
  tenantName: string;
  rentAmount: number;
  startDay: number;
}

// "2026-06" + ngày -> "2026-06-DD" (kẹp theo số ngày của tháng)
const buildDueDate = (month: string, day: number) => {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  return `${month}-${String(Math.min(day, daysInMonth)).padStart(2, '0')}`;
};

export const RentInvoiceScreen: React.FC<any> = ({ navigation }) => {
  const [props, setProps] = useState<PropItem[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [errorProps, setErrorProps] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [rows, setRows] = useState<RentRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [sendingId, setSendingId] = useState<string | null>(null);

  const loadProps = useCallback(async () => {
    try {
      setErrorProps(null);
      const scoped = await managerPropertyService.getScopedProperties();
      setProps(scoped.map(p => ({ id: p.id, name: p.propertyName, wholeHouse: p.wholeHouse === true })));
    } catch (e: any) {
      setErrorProps(e?.response?.data?.message || e?.message || 'Không tải được danh sách tòa nhà');
    } finally {
      setLoadingProps(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { loadProps(); }, [loadProps]));

  const loadRows = useCallback(async (propId: number, m: string) => {
    setLoadingRows(true);
    try {
      // Tải hợp đồng đang hiệu lực + các HĐ tiền nhà ĐÃ tạo ở BE cho kỳ này (để biết phòng nào đã gửi).
      const [contracts, existing] = await Promise.all([
        realTenantService.listByProperty(propId),
        realManagerInvoiceService.listRentInvoices(propId, m).catch(() => []),
      ]);
      const active = contracts.filter((c: TenantContractResponse) => (c.status || '').toUpperCase() === 'ACTIVE');
      const built: RentRow[] = active.map(c => {
        const start = c.startDate || c.moveInDate || '';
        const day = Number(start.split('-')[2]);
        return {
          key: String(c.id),
          contractId: c.id,
          roomId: c.roomId ?? undefined,
          roomNumber: c.roomNumber,
          tenantName: c.tenantFullName,
          rentAmount: c.rentAmount ?? 0,
          startDay: Number.isFinite(day) && day >= 1 && day <= 31 ? day : 1,
        };
      });
      setRows(built);
      // "Đã gửi" lấy từ DỮ LIỆU BE (không phải state tạm) → giữ đúng sau khi back/quay lại.
      const sent = new Set<string>();
      existing.forEach(inv => {
        const match = built.find(r =>
          (inv.contractId != null && r.contractId === inv.contractId) ||
          (inv.roomNumber != null && inv.roomNumber === r.roomNumber),
        );
        if (match) sent.add(match.key);
      });
      setSentIds(sent);
    } catch {
      setRows([]);
      setSentIds(new Set());
    } finally {
      setLoadingRows(false);
    }
  }, []);

  const onSelect = (id: number) => { setSelectedId(id); loadRows(id, month); };
  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const nm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setMonth(nm);
    if (selectedId != null) loadRows(selectedId, nm);
  };

  const postRent = (row: RentRow) => {
    if (selectedId == null) return Promise.reject(new Error('no property'));
    const body = {
      contractId: row.contractId,
      billingMonth: month,
      amount: row.rentAmount,
      dueDate: buildDueDate(month, row.startDay),
    };
    return row.roomId
      ? realManagerInvoiceService.createRoomRentInvoice(selectedId, row.roomId, body)
      : realManagerInvoiceService.createPropertyRentInvoice(selectedId, body);
  };

  const sendOne = async (row: RentRow) => {
    setSendingId(row.key);
    try {
      await postRent(row);
      setSentIds(prev => new Set(prev).add(row.key));
      Alert.alert('Đã gửi', `Hóa đơn tiền nhà ${fmt(row.rentAmount)} đã gửi cho ${row.tenantName}.`);
    } catch (e: any) {
      Alert.alert('Lỗi', e?.response?.data?.message || e?.message || 'Không gửi được hóa đơn tiền nhà.');
    } finally {
      setSendingId(null);
    }
  };

  const sendAll = async () => {
    const pending = rows.filter(r => !sentIds.has(r.key) && r.rentAmount > 0);
    if (!pending.length) { Alert.alert('Thông báo', 'Tất cả đã gửi hoặc chưa có tiền nhà hợp lệ.'); return; }
    setSendingId('__all__');
    try {
      await Promise.all(pending.map(postRent));
      setSentIds(prev => { const n = new Set(prev); pending.forEach(r => n.add(r.key)); return n; });
      Alert.alert('Đã gửi', `Đã gửi hóa đơn tiền nhà cho ${pending.length} hợp đồng.`);
    } catch (e: any) {
      Alert.alert('Lỗi', e?.response?.data?.message || e?.message || 'Không gửi được hóa đơn tiền nhà.');
    } finally {
      setSendingId(null);
    }
  };

  const [my, mm] = month.split('-');
  const monthLabel = `Tháng ${mm}/${my}`;
  const multi = props.filter(p => !p.wholeHouse);
  const whole = props.filter(p => p.wholeHouse);
  const pendingCount = rows.filter(r => !sentIds.has(r.key)).length;

  const renderPropRow = (p: PropItem) => (
    <TouchableOpacity
      key={p.id}
      style={[s.propRow, selectedId === p.id && s.propRowActive]}
      onPress={() => onSelect(p.id)}
    >
      <View style={{ flex: 1 }}>
        <Text style={s.propName}>{p.name}</Text>
        <Text style={s.propMeta}>{p.wholeHouse ? 'Nhà nguyên căn' : 'Nhà nhiều phòng'}</Text>
      </View>
      {selectedId === p.id && <Text style={s.check}>✓</Text>}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerSide}>
          <Text style={s.backText}>← Quay lại</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Gửi tiền nhà</Text>
        <View style={s.headerSide} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.sectionTitle}>Chọn tòa nhà / căn hộ</Text>

        {loadingProps ? (
          <View style={s.state}><ActivityIndicator color={Colors.primary} /><Text style={s.stateText}>Đang tải...</Text></View>
        ) : errorProps ? (
          <View style={s.state}>
            <Text style={s.stateEmoji}>⚠️</Text>
            <Text style={s.stateText}>{errorProps}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => { setLoadingProps(true); loadProps(); }}>
              <Text style={s.retryBtnText}>Thử lại</Text>
            </TouchableOpacity>
          </View>
        ) : props.length === 0 ? (
          <View style={s.state}><Text style={s.stateEmoji}>🏢</Text><Text style={s.stateText}>Chưa có tòa nhà được giao</Text></View>
        ) : (
          <>
            {multi.length > 0 && <Text style={s.groupLabel}>🏢 Nhà nhiều phòng</Text>}
            {multi.map(renderPropRow)}
            {whole.length > 0 && <Text style={[s.groupLabel, { marginTop: Spacing.md }]}>🏠 Nhà nguyên căn</Text>}
            {whole.map(renderPropRow)}
          </>
        )}

        {selectedId != null && (
          <>
            <View style={s.monthRow}>
              <TouchableOpacity style={s.monthBtn} onPress={() => shiftMonth(-1)}><Text style={s.monthBtnText}>‹</Text></TouchableOpacity>
              <Text style={s.monthLabel}>Kỳ thu: {monthLabel}</Text>
              <TouchableOpacity style={s.monthBtn} onPress={() => shiftMonth(1)}><Text style={s.monthBtnText}>›</Text></TouchableOpacity>
            </View>

            <View style={s.infoBanner}>
              <Text style={s.infoText}>Tiền nhà là hoá đơn RIÊNG (không gộp điện/nước). Hạn nộp theo ngày bắt đầu hợp đồng.</Text>
            </View>

            {loadingRows ? (
              <View style={s.state}><ActivityIndicator color={Colors.primary} /></View>
            ) : rows.length === 0 ? (
              <View style={s.state}><Text style={s.stateEmoji}>🏠</Text><Text style={s.stateText}>Chưa có hợp đồng đang hiệu lực để thu tiền nhà.</Text></View>
            ) : (
              <>
                <View style={s.progressRow}>
                  <Text style={s.progressText}>Đã gửi: {sentIds.size}/{rows.length}</Text>
                  {pendingCount > 0 && (
                    <TouchableOpacity style={s.sendAllBtn} onPress={sendAll} disabled={sendingId === '__all__'}>
                      {sendingId === '__all__' ? <ActivityIndicator color={Colors.white} /> : <Text style={s.sendAllBtnText}>Gửi tất cả →</Text>}
                    </TouchableOpacity>
                  )}
                </View>

                {rows.map(row => {
                  const sent = sentIds.has(row.key);
                  return (
                    <View key={row.key} style={[s.card, sent && s.cardSent]}>
                      <View style={s.cardHeader}>
                        <View>
                          <Text style={s.roomCode}>{row.roomNumber ? `Phòng ${row.roomNumber}` : 'Nhà nguyên căn'}</Text>
                          <Text style={s.tenant}>{row.tenantName}</Text>
                        </View>
                        <View style={[s.badge, sent ? s.badgeSent : s.badgePending]}>
                          <Text style={[s.badgeText, { color: sent ? Colors.white : Colors.textMuted }]}>{sent ? '✓ Đã gửi' : 'Chưa gửi'}</Text>
                        </View>
                      </View>
                      <Text style={s.due}>Hạn nộp: {buildDueDate(month, row.startDay)}</Text>
                      <View style={s.amountRow}>
                        <Text style={s.amount}>{fmt(row.rentAmount)}</Text>
                        {!sent && (
                          <TouchableOpacity style={s.sendBtn} onPress={() => sendOne(row)} disabled={sendingId === row.key}>
                            {sendingId === row.key ? <ActivityIndicator color={Colors.white} /> : <Text style={s.sendBtnText}>🏠 Gửi tiền nhà</Text>}
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </>
        )}
        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, ...Shadow.sm,
  },
  headerSide: { width: 80 },
  backText: { color: Colors.primary, fontWeight: '600', fontSize: 14 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
  scroll: { padding: Spacing.lg },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm },
  groupLabel: { fontSize: 11, fontWeight: '800', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.xs },

  propRow: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing.md,
    backgroundColor: Colors.white, borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  propRowActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  propName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  propMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  check: { fontSize: 16, color: Colors.primary, fontWeight: '900' },

  state: { alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.sm },
  stateEmoji: { fontSize: 32 },
  stateText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
  retryBtn: { marginTop: Spacing.xs, backgroundColor: Colors.primary, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  retryBtnText: { color: Colors.white, fontWeight: '800', fontSize: 13 },

  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.md, marginTop: Spacing.md, marginBottom: Spacing.sm },
  monthBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center' },
  monthBtnText: { fontSize: 20, color: Colors.primary, fontWeight: '900', lineHeight: 22 },
  monthLabel: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, minWidth: 150, textAlign: 'center' },

  infoBanner: { backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md, padding: Spacing.sm, marginBottom: Spacing.md, borderLeftWidth: 3, borderLeftColor: Colors.primary },
  infoText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },

  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  progressText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  sendAllBtn: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, minWidth: 96, alignItems: 'center' },
  sendAllBtnText: { fontSize: 12, fontWeight: '700', color: Colors.white },

  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm },
  cardSent: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.xs },
  roomCode: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  tenant: { fontSize: 12, color: Colors.textSecondary },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  badgePending: { backgroundColor: Colors.background },
  badgeSent: { backgroundColor: Colors.success },
  badgeText: { fontSize: 11, fontWeight: '700' },
  due: { fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.xs },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm },
  amount: { fontSize: 18, fontWeight: '800', color: Colors.primary },
  sendBtn: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, alignItems: 'center', minWidth: 130 },
  sendBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white },
});
