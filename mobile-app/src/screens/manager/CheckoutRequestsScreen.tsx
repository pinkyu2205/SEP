import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, RefreshControl, Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { formatDate } from '@/utils';
import { checkoutService } from '@/services/manager/checkoutService';
import type { CheckoutRequestDto } from '@/services/tenant/selfService';

/**
 * Manager xử lý YÊU CẦU TRẢ PHÒNG của tenant — GET/approve/reject/complete
 * /api/v1/checkout-requests (trước đây tenant gửi vào store mock, manager không có
 * màn nào để duyệt → yêu cầu rơi vào hư không; xem plan cải tiến quy trình).
 * Complete = BE terminate HĐ + phòng về AVAILABLE + restore thiết bị — hành động
 * không đảo ngược nên có confirm 2 lớp.
 */

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: 'Chờ duyệt', color: '#D97706', bg: '#FFFBEB' },
  APPROVED: { label: 'Đã duyệt — chờ trả phòng', color: '#0891B2', bg: '#ECFEFF' },
  REJECTED: { label: 'Đã từ chối', color: '#DC2626', bg: '#FEF2F2' },
  COMPLETED: { label: 'Đã hoàn tất', color: '#059669', bg: '#ECFDF5' },
  CANCELLED: { label: 'Khách đã hủy', color: '#64748B', bg: '#F1F5F9' },
};
const FALLBACK_META = { label: 'Không rõ', color: '#64748B', bg: '#F1F5F9' };

const FILTERS: { key: string | null; label: string }[] = [
  { key: null, label: 'Tất cả' },
  { key: 'PENDING', label: 'Chờ duyệt' },
  { key: 'APPROVED', label: 'Đã duyệt' },
  { key: 'COMPLETED', label: 'Hoàn tất' },
];

const todayIso = () => new Date().toISOString().slice(0, 10);
const readErr = (err: any, fallback: string): string =>
  err?.response?.data?.message || err?.message || fallback;

export const CheckoutRequestsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [list, setList] = useState<CheckoutRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<string | null>('PENDING');
  const [busyId, setBusyId] = useState<number | null>(null);

  // Modal nhập liệu: approve (note tuỳ chọn) / reject (lý do bắt buộc) / complete (ngày + note)
  const [action, setAction] = useState<{ type: 'approve' | 'reject' | 'complete'; req: CheckoutRequestDto } | null>(null);
  const [inputNote, setInputNote] = useState('');
  const [inputDate, setInputDate] = useState(todayIso());

  const load = useCallback(async () => {
    try {
      const data = await checkoutService.list();
      data.sort((a, b) => b.id - a.id);
      setList(data);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = filter ? list.filter((r) => (r.status || '').toUpperCase() === filter) : list;
  const pendingCount = list.filter((r) => (r.status || '').toUpperCase() === 'PENDING').length;

  const openAction = (type: 'approve' | 'reject' | 'complete', req: CheckoutRequestDto) => {
    setInputNote('');
    setInputDate(req.expectedMoveOutDate || todayIso());
    setAction({ type, req });
  };

  const submitAction = async () => {
    if (!action) return;
    const { type, req } = action;
    if (type === 'reject' && !inputNote.trim()) {
      return Alert.alert('Thiếu lý do', 'Nhập lý do từ chối để khách hiểu và điều chỉnh.');
    }
    if (type === 'complete' && !/^\d{4}-\d{2}-\d{2}$/.test(inputDate.trim())) {
      return Alert.alert('Ngày không hợp lệ', 'Nhập ngày trả phòng thực tế dạng YYYY-MM-DD.');
    }
    setBusyId(req.id);
    try {
      if (type === 'approve') {
        await checkoutService.approve(req.id, inputNote.trim() || undefined);
        Alert.alert('Đã duyệt', 'Khách sẽ nhận thông báo — đến ngày hẹn hãy kiểm tra phòng rồi bấm "Hoàn tất trả phòng".');
      } else if (type === 'reject') {
        await checkoutService.reject(req.id, inputNote.trim());
        Alert.alert('Đã từ chối', 'Khách sẽ nhận thông báo kèm lý do.');
      } else {
        await checkoutService.complete(req.id, {
          actualMoveOutDate: inputDate.trim(),
          note: inputNote.trim() || undefined,
        });
        Alert.alert('Hoàn tất', 'Hợp đồng đã thanh lý, phòng trở về trạng thái trống.');
      }
      setAction(null);
      load();
    } catch (err: any) {
      Alert.alert('Lỗi', readErr(err, 'Không xử lý được yêu cầu.'));
    } finally {
      setBusyId(null);
    }
  };

  const ACTION_TITLE: Record<string, string> = {
    approve: 'Duyệt yêu cầu trả phòng',
    reject: 'Từ chối yêu cầu',
    complete: 'Hoàn tất trả phòng (thanh lý HĐ)',
  };

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Yêu cầu trả phòng{pendingCount > 0 ? ` (${pendingCount} chờ)` : ''}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Filter chips */}
      <View style={s.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.label}
            style={[s.filterChip, filter === f.key && s.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[s.filterChipText, filter === f.key && s.filterChipTextActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
      ) : loadError ? (
        <View style={s.center}>
          <Text style={{ fontSize: 40, marginBottom: Spacing.md }}>⚠️</Text>
          <Text style={s.emptyTitle}>Không tải được danh sách</Text>
          <TouchableOpacity style={s.retryBtn} onPress={() => { setLoading(true); load(); }}>
            <Text style={s.retryBtnText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={s.body}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {filtered.length === 0 && (
            <View style={s.emptyBox}>
              <Text style={{ fontSize: 40, marginBottom: Spacing.sm }}>🚪</Text>
              <Text style={s.emptyTitle}>
                {filter === 'PENDING' ? 'Không có yêu cầu nào chờ duyệt.' : 'Không có yêu cầu trả phòng nào.'}
              </Text>
            </View>
          )}

          {filtered.map((r) => {
            const status = (r.status || '').toUpperCase();
            const meta = STATUS_META[status] ?? FALLBACK_META;
            const busy = busyId === r.id;
            return (
              <View key={r.id} style={s.card}>
                <View style={s.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardName}>{r.tenantFullName || 'Khách thuê'}</Text>
                    <Text style={s.cardMeta}>
                      {r.propertyName || '—'}{r.roomNumber ? ` · Phòng ${r.roomNumber}` : ' · Nguyên căn'}
                    </Text>
                    {!!r.tenantPhone && <Text style={s.cardMeta}>📞 {r.tenantPhone}</Text>}
                  </View>
                  <View style={[s.statusChip, { backgroundColor: meta.bg }]}>
                    <Text style={[s.statusChipText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                </View>

                <View style={s.cardRows}>
                  <Text style={s.cardRow}>📋 HĐ {r.contractCode || `#${r.contractId}`}</Text>
                  {!!r.expectedMoveOutDate && (
                    <Text style={s.cardRow}>📅 Muốn trả: {formatDate(r.expectedMoveOutDate)}</Text>
                  )}
                  {!!r.reason && <Text style={s.cardRow}>💬 {r.reason}</Text>}
                  {!!r.note && <Text style={s.cardNote}>{r.note}</Text>}
                  {!!r.rejectReason && <Text style={[s.cardNote, { color: '#DC2626' }]}>Lý do từ chối: {r.rejectReason}</Text>}
                  {!!r.managerNote && <Text style={s.cardNote}>Ghi chú QL: {r.managerNote}</Text>}
                  {!!r.createdAt && <Text style={s.cardTime}>Gửi lúc {formatDate(r.createdAt)}</Text>}
                </View>

                {status === 'PENDING' && (
                  <View style={s.actionRow}>
                    <TouchableOpacity
                      style={[s.actionBtn, s.actionReject, busy && s.actionDisabled]}
                      disabled={busy}
                      onPress={() => openAction('reject', r)}
                    >
                      <Text style={s.actionRejectText}>Từ chối</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.actionBtn, s.actionApprove, busy && s.actionDisabled]}
                      disabled={busy}
                      onPress={() => openAction('approve', r)}
                    >
                      <Text style={s.actionApproveText}>{busy ? 'Đang xử lý...' : '✓ Duyệt yêu cầu'}</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {status === 'APPROVED' && (
                  <View style={s.actionRow}>
                    <TouchableOpacity
                      style={[s.actionBtn, s.actionComplete, busy && s.actionDisabled]}
                      disabled={busy}
                      onPress={() => openAction('complete', r)}
                    >
                      <Text style={s.actionApproveText}>
                        {busy ? 'Đang xử lý...' : '🏁 Hoàn tất trả phòng (thanh lý HĐ)'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* Modal nhập liệu cho approve / reject / complete */}
      <Modal visible={!!action} transparent animationType="fade" onRequestClose={() => setAction(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>{action ? ACTION_TITLE[action.type] : ''}</Text>
            {action && (
              <Text style={s.modalDesc}>
                {action.req.tenantFullName || 'Khách'} — HĐ {action.req.contractCode || `#${action.req.contractId}`}
                {action.type === 'complete'
                  ? '\n⚠️ Hành động này THANH LÝ hợp đồng: phòng về trạng thái trống, thiết bị được khôi phục. Không đảo ngược được.'
                  : ''}
              </Text>
            )}

            {action?.type === 'complete' && (
              <>
                <Text style={s.modalLabel}>Ngày trả phòng thực tế</Text>
                <TextInput
                  style={s.modalInput}
                  value={inputDate}
                  onChangeText={setInputDate}
                  placeholder="YYYY-MM-DD"
                  keyboardType="numbers-and-punctuation"
                />
              </>
            )}

            <Text style={s.modalLabel}>
              {action?.type === 'reject' ? 'Lý do từ chối (bắt buộc)' : 'Ghi chú (tuỳ chọn)'}
            </Text>
            <TextInput
              style={[s.modalInput, { height: 80, textAlignVertical: 'top' }]}
              value={inputNote}
              onChangeText={setInputNote}
              multiline
              placeholder={
                action?.type === 'reject'
                  ? 'VD: HĐ còn hạn 6 tháng, cần trao đổi trước...'
                  : 'VD: Hẹn kiểm tra phòng sáng thứ 7...'
              }
            />

            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setAction(null)} disabled={busyId != null}>
                <Text style={s.modalCancelText}>Đóng</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  s.modalSubmit,
                  action?.type === 'reject' && { backgroundColor: '#DC2626' },
                  busyId != null && s.actionDisabled,
                ]}
                onPress={submitAction}
                disabled={busyId != null}
              >
                <Text style={s.modalSubmitText}>
                  {busyId != null ? 'Đang gửi...'
                    : action?.type === 'approve' ? 'Duyệt'
                    : action?.type === 'reject' ? 'Từ chối'
                    : 'Hoàn tất & thanh lý'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: { padding: Spacing.sm },
  backArrow: { fontSize: 18, fontWeight: '600', color: Colors.primary },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },

  filterRow: {
    flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md, backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  filterChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: BorderRadius.full, backgroundColor: Colors.background,
    borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  filterChipTextActive: { color: Colors.primary },

  body: { padding: Spacing.lg, gap: Spacing.md },

  emptyBox: { alignItems: 'center', paddingVertical: Spacing.xl * 2 },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary, textAlign: 'center' },
  retryBtn: {
    marginTop: Spacing.md, backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg,
  },
  retryBtnText: { color: Colors.white, fontWeight: '700' },

  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    borderWidth: 1, borderColor: Colors.border, padding: Spacing.base, ...Shadow.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  cardName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  cardMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  statusChip: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: BorderRadius.full },
  statusChipText: { fontSize: 11, fontWeight: '700' },

  cardRows: { marginTop: Spacing.sm, gap: 3 },
  cardRow: { fontSize: 13, color: Colors.textSecondary },
  cardNote: {
    fontSize: 12, color: Colors.textMuted, fontStyle: 'italic',
    backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    padding: Spacing.sm, marginTop: 4,
  },
  cardTime: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },

  actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  actionBtn: {
    flex: 1, borderRadius: BorderRadius.lg, paddingVertical: Spacing.md, alignItems: 'center',
  },
  actionApprove: { backgroundColor: Colors.primary },
  actionComplete: { backgroundColor: '#059669' },
  actionApproveText: { fontSize: 13, fontWeight: '700', color: Colors.white },
  actionReject: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  actionRejectText: { fontSize: 13, fontWeight: '700', color: '#DC2626' },
  actionDisabled: { opacity: 0.6 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: Spacing.lg,
  },
  modalBox: {
    width: '100%', backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl, padding: Spacing.lg,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  modalDesc: { fontSize: 13, color: Colors.textSecondary, marginTop: 6, lineHeight: 20 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginTop: Spacing.md, marginBottom: 6 },
  modalInput: {
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2,
    fontSize: 14, color: Colors.textPrimary,
  },
  modalActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  modalCancel: {
    flex: 1, borderRadius: BorderRadius.lg, paddingVertical: Spacing.md, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  modalSubmit: {
    flex: 1.4, borderRadius: BorderRadius.lg, paddingVertical: Spacing.md,
    alignItems: 'center', backgroundColor: Colors.primary,
  },
  modalSubmitText: { fontSize: 14, fontWeight: '700', color: Colors.white },
});
