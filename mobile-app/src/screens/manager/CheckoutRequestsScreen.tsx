import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow, checkoutMeta } from '@/constants';
import { formatDate, showAlert, readApiError } from '@/utils';
import { checkoutService } from '@/services/manager/checkoutService';
import type { CheckoutRequestDto } from '@/services/tenant/selfService';

/**
 * Manager xử lý YÊU CẦU TRẢ PHÒNG của tenant — /api/v1/checkout-requests.
 *
 * Màn này là TRẠM ĐIỀU PHỐI: mỗi hồ sơ hiện việc kế tiếp phải làm và nút dẫn thẳng
 * tới màn tương ứng (biên bản kiểm tra / quyết toán). Việc thanh lý HĐ nằm ở màn
 * quyết toán chứ KHÔNG đặt ở đây — complete terminate hợp đồng ngay lập tức nên chỉ
 * được mở sau khi tiền nong đã xong (xem docs/PLAN-checkout-flow-2026-08-03.md).
 */

const FILTERS: { key: string | null; label: string }[] = [
  { key: null, label: 'Tất cả' },
  { key: 'PENDING', label: 'Chờ duyệt' },
  { key: 'ACTIVE', label: 'Đang xử lý' },
  { key: 'COMPLETED', label: 'Hoàn tất' },
];

/** "Đang xử lý" gom mọi trạng thái giữa chừng để manager không phải bấm từng chip. */
const IN_PROGRESS = ['APPROVED', 'INSPECTING', 'WAITING_TENANT', 'DISPUTED', 'SETTLING'];

const matchFilter = (status: string, filter: string | null) => {
  if (!filter) return true;
  if (filter === 'ACTIVE') return IN_PROGRESS.includes(status);
  return status === filter;
};
const readErr = readApiError;

export const CheckoutRequestsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const [list, setList] = useState<CheckoutRequestDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  /**
   * Mặc định "Tất cả", không phải "Chờ duyệt".
   *
   * Mở màn bằng một bộ lọc thì lúc không có hồ sơ chờ, manager thấy màn trắng kèm câu
   * "Không có yêu cầu nào chờ duyệt" — không biết là thật sự rỗng hay đang bị lọc mất.
   * Vào "Tất cả" thì con số trên từng chip nói hết, và chip "Chờ duyệt" vẫn cách một chạm.
   */
  const [filter, setFilter] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Modal nhập liệu: approve (note tuỳ chọn) / reject (lý do bắt buộc).
  // Hoàn tất/thanh lý đã chuyển sang màn Quyết toán.
  const [action, setAction] = useState<{ type: 'approve' | 'reject'; req: CheckoutRequestDto } | null>(null);
  const [inputNote, setInputNote] = useState('');

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

  const filtered = list.filter((r) => matchFilter((r.status || '').toUpperCase(), filter));
  const countOf = (key: string | null) =>
    list.filter((r) => matchFilter((r.status || '').toUpperCase(), key)).length;
  const pendingCount = countOf('PENDING');

  const openAction = (type: 'approve' | 'reject', req: CheckoutRequestDto) => {
    setInputNote('');
    setAction({ type, req });
  };

  const submitAction = async () => {
    if (!action) return;
    const { type, req } = action;
    if (type === 'reject' && !inputNote.trim()) {
      return showAlert('Thiếu lý do', 'Nhập lý do từ chối để khách hiểu và điều chỉnh.');
    }
    setBusyId(req.id);
    try {
      if (type === 'approve') {
        await checkoutService.approve(req.id, inputNote.trim() || undefined);
        // Duyệt xong hồ sơ rời khỏi nhóm "Chờ duyệt" — tự nhảy sang "Đang xử lý"
        // để manager thấy nó đi tiếp, không tưởng là mất.
        setFilter('ACTIVE');
        showAlert(
          'Đã duyệt',
          'Hệ thống chốt tiền phòng tháng này theo ngày rời phòng và gửi hoá đơn kỳ cuối cho khách. '
          + 'Hồ sơ chuyển sang mục "Đang xử lý" — đến ngày hẹn, mở hồ sơ và bấm "Lập biên bản kiểm tra".',
        );
      } else {
        await checkoutService.reject(req.id, inputNote.trim());
        showAlert('Đã từ chối', 'Khách sẽ nhận thông báo kèm lý do.');
      }
      setAction(null);
      load();
    } catch (err: any) {
      showAlert('Lỗi', readErr(err, 'Không xử lý được yêu cầu.'));
    } finally {
      setBusyId(null);
    }
  };

  const ACTION_TITLE: Record<string, string> = {
    approve: 'Duyệt yêu cầu trả phòng',
    reject: 'Từ chối yêu cầu',
  };

  const goInspection = (r: CheckoutRequestDto) =>
    navigation.navigate('CheckoutInspection', { checkoutId: r.id });

  const goSettlement = (r: CheckoutRequestDto) =>
    navigation.navigate('CheckoutSettlement', { checkoutId: r.id });

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle}>Tiễn khách</Text>
          <Text style={s.headerSub}>
            {pendingCount > 0 ? `${pendingCount} yêu cầu chờ duyệt` : 'Yêu cầu trả phòng của khách'}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Filter chips — kèm số lượng để không hồ sơ nào "biến mất" khi đổi trạng thái */}
      <View style={s.filterRow}>
        {FILTERS.map((f) => {
          const n = countOf(f.key);
          return (
            <TouchableOpacity
              key={f.label}
              style={[s.filterChip, filter === f.key && s.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[s.filterChipText, filter === f.key && s.filterChipTextActive]}>
                {f.label}{n > 0 ? ` (${n})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
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
              {/*
                Phân biệt "chưa có hồ sơ nào" với "bộ lọc này rỗng".
                Bản cũ khi list rỗng hoàn toàn mà đang lọc PENDING vẫn nói "Không có yêu cầu
                nào chờ duyệt" — nghe như còn hồ sơ ở chỗ khác, manager đi bấm từng chip.
              */}
              <Text style={s.emptyTitle}>
                {list.length === 0 ? 'Chưa có khách nào xin trả phòng.'
                  : filter === 'PENDING' ? 'Không có yêu cầu nào chờ duyệt.'
                  : filter === 'ACTIVE' ? 'Không có hồ sơ nào đang xử lý.'
                  : filter === 'COMPLETED' ? 'Chưa có hồ sơ nào hoàn tất.'
                  : 'Không có yêu cầu trả phòng nào.'}
              </Text>
              {list.length === 0 && (
                <Text style={s.emptyHint}>
                  Khách gửi yêu cầu từ app của họ, hồ sơ sẽ hiện ở đây để bạn duyệt.
                </Text>
              )}
              {/* Lọc này rỗng nhưng chỗ khác có hồ sơ → chỉ đường, đừng để manager
                  tưởng dữ liệu bị mất sau khi duyệt. */}
              {list.length > 0 && (
                <View style={s.emptyHints}>
                  {FILTERS.filter(f => f.key && f.key !== filter && countOf(f.key) > 0).map(f => (
                    <TouchableOpacity key={f.label} style={s.emptyHintBtn} onPress={() => setFilter(f.key)}>
                      <Text style={s.emptyHintText}>{f.label} ({countOf(f.key)}) →</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {filtered.map((r) => {
            const status = (r.status || '').toUpperCase();
            const meta = checkoutMeta(status);
            const busy = busyId === r.id;
            return (
              <View key={r.id} style={s.card}>
                <View style={s.cardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardName}>{r.tenantFullName || 'Khách thuê'}</Text>
                    <Text style={s.cardMeta}>
                      {r.propertyName || '—'}{r.roomNumber ? ` · Phòng ${r.roomNumber}` : ' · Nguyên căn'}
                    </Text>
                    {/* SĐT ẩn với manager (13/08/2026) — xem @/constants/managerVisibility. */}
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
                  {!!r.disputeReason && (
                    <Text style={[s.cardNote, { color: '#DC2626' }]}>
                      Khách phản đối: {r.disputeReason}
                    </Text>
                  )}
                  {!!r.createdAt && <Text style={s.cardTime}>Gửi lúc {formatDate(r.createdAt)}</Text>}
                </View>

                {/* Việc kế tiếp phải làm — để manager không phải nhớ luồng */}
                {!!meta.managerHint && <Text style={s.hint}>→ {meta.managerHint}</Text>}

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
                    <TouchableOpacity style={[s.actionBtn, s.actionApprove]} onPress={() => goInspection(r)}>
                      <Text style={s.actionApproveText}>📋 Lập biên bản kiểm tra</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {status === 'INSPECTING' && (
                  <View style={s.actionRow}>
                    <TouchableOpacity style={[s.actionBtn, s.actionGhost]} onPress={() => goInspection(r)}>
                      <Text style={s.actionGhostText}>Sửa biên bản</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.actionBtn, s.actionApprove]} onPress={() => goSettlement(r)}>
                      <Text style={s.actionApproveText}>💰 Quyết toán</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {(status === 'WAITING_TENANT' || status === 'SETTLING') && (
                  <View style={s.actionRow}>
                    <TouchableOpacity
                      style={[s.actionBtn, status === 'SETTLING' ? s.actionComplete : s.actionGhost]}
                      onPress={() => goSettlement(r)}
                    >
                      <Text style={status === 'SETTLING' ? s.actionApproveText : s.actionGhostText}>
                        {status === 'SETTLING' ? '🏁 Hoàn tất trả phòng' : 'Xem bảng quyết toán'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {status === 'DISPUTED' && (
                  <View style={s.actionRow}>
                    <TouchableOpacity style={[s.actionBtn, s.actionReject]} onPress={() => goInspection(r)}>
                      <Text style={s.actionRejectText}>Sửa biên bản</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.actionBtn, s.actionApprove]} onPress={() => goSettlement(r)}>
                      <Text style={s.actionApproveText}>Gửi lại bảng tiền</Text>
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
              </Text>
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
                  {busyId != null ? 'Đang gửi...' : action?.type === 'approve' ? 'Duyệt' : 'Từ chối'}
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
  /** Dòng phụ thay cho "(N chờ)" nhét trong tiêu đề — nói rõ N là số gì. */
  headerSub: { fontSize: 11, color: Colors.textMuted, marginTop: 1 },

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

  emptyBox: { alignItems: 'center', paddingVertical: Spacing.xl * 2, paddingHorizontal: Spacing.lg },
  emptyHint: {
    fontSize: 12, color: Colors.textMuted, textAlign: 'center',
    marginTop: 6, lineHeight: 17,
  },
  emptyHints: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md, justifyContent: 'center' },
  emptyHintBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryBg, borderWidth: 1, borderColor: Colors.primary + '40',
  },
  emptyHintText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
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
  hint: { fontSize: 12, fontWeight: '600', color: Colors.primary, marginTop: Spacing.sm },

  actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  actionBtn: {
    flex: 1, borderRadius: BorderRadius.lg, paddingVertical: Spacing.md, alignItems: 'center',
  },
  actionApprove: { backgroundColor: Colors.primary },
  actionComplete: { backgroundColor: '#059669' },
  actionApproveText: { fontSize: 13, fontWeight: '700', color: Colors.white },
  actionReject: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' },
  actionRejectText: { fontSize: 13, fontWeight: '700', color: '#DC2626' },
  actionGhost: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  actionGhostText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
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
