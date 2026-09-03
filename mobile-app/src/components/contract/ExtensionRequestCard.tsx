import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Colors, Spacing, BorderRadius } from '@/constants';
import { showAlert, formatDate } from '@/utils';
import {
  extensionService, EXTENSION_STATUS_META,
  type ExtensionRequest,
} from '@/services/shared/extensionService';

/**
 * XIN GIA HẠN HỢP ĐỒNG — khối trên màn chi tiết hợp đồng của khách thuê.
 *
 * ─── Luật (BE 02/09/2026) ─────────────────────────────────────────────────────
 * Cửa mở suốt 30 ngày cuối, đóng khi hết ngày áp chót. Đúng ngày cuối là hệ thống gửi
 * phiếu trả phòng cho quản lý, trừ khi còn đơn gia hạn đang chờ — lúc đó hoãn tối đa
 * 7 ngày.
 *
 * Khách xin theo **SỐ THÁNG**, không chọn ngày: khách nghĩ theo tháng, bắt họ tính ra ngày
 * kết thúc là bắt họ tự tính, mà tính sai thì đơn sai.
 *
 * ⚠️ TRẦN GIA HẠN KHÔNG ĐƯỢC GIẢI THÍCH.
 * `maxMonths` đến từ hạn hợp đồng của công ty với chủ nhà. Khách không được biết công ty
 * đang thuê lại, càng không được biết hợp đồng đó hết khi nào — biết là suy ra được vị thế
 * công ty khi thương lượng. Máy chủ đã chỉ trả đúng con số trần trụi; màn này phải giữ
 * nguyên tinh thần đó: nói được bao nhiêu tháng, KHÔNG nói vì sao. Muốn hơn thì liên hệ
 * quản lý.
 */

/** Các lựa chọn số tháng bày sẵn — cắt theo trần, khỏi bắt khách gõ số. */
const MONTH_CHOICES = [1, 3, 6, 12];

interface Props {
  contractId: number;
  /** Ẩn khối khi hợp đồng không còn hiệu lực — không xin gia hạn cho hợp đồng đã đóng. */
  active: boolean;
}

export const ExtensionRequestCard: React.FC<Props> = ({ contractId, active }) => {
  const [loading, setLoading] = useState(true);
  const [maxMonths, setMaxMonths] = useState(0);
  const [requests, setRequests] = useState<ExtensionRequest[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [months, setMonths] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  /**
   * Nạp cả trần lẫn đơn cũ.
   *
   * `Promise.allSettled` chứ không `all`: hai lệnh độc lập nhau, hỏng một cái không được
   * làm mất cái kia. Trần hỏng → coi như 0 (ẩn nút xin, an toàn); đơn hỏng → danh sách
   * rỗng, khách vẫn thấy nút.
   */
  const load = useCallback(async () => {
    const [opt, list] = await Promise.allSettled([
      extensionService.getOptions(contractId),
      extensionService.listForTenant(contractId),
    ]);
    setMaxMonths(opt.status === 'fulfilled' ? opt.value.maxMonths : 0);
    setRequests(list.status === 'fulfilled' ? list.value : []);
    setLoading(false);
  }, [contractId]);

  useEffect(() => { if (active) void load(); else setLoading(false); }, [active, load]);

  if (!active || loading) return null;

  const pending = requests.find(r => r.status === 'PENDING');
  const lastClosed = requests.find(r => r.status !== 'PENDING');
  const choices = MONTH_CHOICES.filter(m => m <= maxMonths);

  const submit = async () => {
    if (!months) return showAlert('Chưa chọn', 'Bạn muốn ở thêm bao nhiêu tháng?');
    setBusy(true);
    try {
      await extensionService.create(contractId, months, note);
      setFormOpen(false);
      setMonths(null);
      setNote('');
      await load();
      showAlert(
        'Đã gửi đơn',
        'Quản lý và bộ phận quản trị sẽ xem đơn của bạn. Bạn sẽ nhận được thông báo khi có kết quả.',
        undefined, '📝',
      );
    } catch (e: any) {
      showAlert('Không gửi được', e?.response?.data?.message || e?.message || 'Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  };

  const withdraw = () => {
    if (!pending) return;
    showAlert('Rút đơn xin gia hạn?', 'Hợp đồng sẽ kết thúc đúng hạn như cũ.', [
      { text: 'Không', style: 'cancel' },
      {
        text: 'Rút đơn',
        style: 'destructive',
        onPress: async () => {
          try {
            await extensionService.withdraw(pending.id);
            await load();
          } catch (e: any) {
            showAlert('Lỗi', e?.response?.data?.message || 'Không rút được đơn.');
          }
        },
      },
    ]);
  };

  // ── Đang có đơn chờ duyệt ────────────────────────────────────────────────
  if (pending) {
    const meta = EXTENSION_STATUS_META.PENDING;
    return (
      <View style={s.card}>
        <View style={s.head}>
          <Text style={s.title}>Đơn xin gia hạn</Text>
          <View style={[s.pill, { backgroundColor: meta.bg }]}>
            <Text style={[s.pillText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
        <Text style={s.big}>Xin ở thêm {pending.months} tháng</Text>
        {!!pending.newEndDate && (
          <Text style={s.sub}>Nếu được duyệt, hợp đồng kéo tới {formatDate(pending.newEndDate)}</Text>
        )}
        <Text style={s.hint}>{meta.tenantHint}</Text>
        <TouchableOpacity style={s.ghostBtn} onPress={withdraw}>
          <Text style={s.ghostBtnText}>Rút đơn</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Không còn cửa gia hạn ────────────────────────────────────────────────
  if (maxMonths <= 0) {
    // Cố ý KHÔNG nói vì sao — xem chú thích đầu file.
    if (!lastClosed) return null;
    const meta = EXTENSION_STATUS_META[lastClosed.status];
    return (
      <View style={s.card}>
        <View style={s.head}>
          <Text style={s.title}>Đơn xin gia hạn</Text>
          <View style={[s.pill, { backgroundColor: meta.bg }]}>
            <Text style={[s.pillText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
        <Text style={s.hint}>{meta.tenantHint}</Text>
        {!!lastClosed.rejectReason && (
          <View style={s.reasonBox}>
            <Text style={s.reasonLabel}>Lý do</Text>
            <Text style={s.reasonText}>{lastClosed.rejectReason}</Text>
          </View>
        )}
      </View>
    );
  }

  // ── Còn cửa: mời xin ─────────────────────────────────────────────────────
  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.title}>Muốn ở thêm?</Text>
      </View>

      {!!lastClosed && lastClosed.status === 'REJECTED' && !!lastClosed.rejectReason && (
        <View style={s.reasonBox}>
          <Text style={s.reasonLabel}>Đơn trước bị từ chối</Text>
          <Text style={s.reasonText}>{lastClosed.rejectReason}</Text>
        </View>
      )}

      {!formOpen ? (
        <>
          <Text style={s.sub}>
            Bạn gia hạn được tối đa <Text style={s.strong}>{maxMonths} tháng</Text>. Giá thuê giữ nguyên.
          </Text>
          <TouchableOpacity style={s.primaryBtn} onPress={() => setFormOpen(true)}>
            <Text style={s.primaryBtnText}>Xin gia hạn</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={s.label}>Ở thêm bao lâu?</Text>
          <View style={s.choices}>
            {choices.map(m => (
              <TouchableOpacity
                key={m}
                style={[s.choice, months === m && s.choiceOn]}
                onPress={() => setMonths(m)}
              >
                <Text style={[s.choiceText, months === m && s.choiceTextOn]}>{m} tháng</Text>
              </TouchableOpacity>
            ))}
            {/* Trần lẻ (vd 4) không nằm trong các lựa chọn sẵn — bày riêng để không mất
                mất lựa chọn dài nhất mà khách được phép chọn. */}
            {!MONTH_CHOICES.includes(maxMonths) && (
              <TouchableOpacity
                style={[s.choice, months === maxMonths && s.choiceOn]}
                onPress={() => setMonths(maxMonths)}
              >
                <Text style={[s.choiceText, months === maxMonths && s.choiceTextOn]}>
                  {maxMonths} tháng
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={s.label}>Lời nhắn (không bắt buộc)</Text>
          <TextInput
            style={s.input}
            value={note}
            onChangeText={setNote}
            placeholder="VD: Tôi muốn ở tiếp tới khi con học xong năm nay."
            multiline
          />

          <View style={s.row}>
            <TouchableOpacity style={s.ghostBtn} onPress={() => setFormOpen(false)} disabled={busy}>
              <Text style={s.ghostBtnText}>Huỷ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.primaryBtn, s.grow, busy && s.disabled]}
              onPress={submit}
              disabled={busy}
            >
              {busy
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={s.primaryBtnText}>Gửi đơn</Text>}
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
    padding: Spacing.lg, marginBottom: Spacing.base,
    gap: Spacing.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  pill: { borderRadius: BorderRadius.full, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 11, fontWeight: '800' },
  big: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary },
  sub: { fontSize: 14, color: Colors.textSecondary, lineHeight: 20 },
  strong: { fontWeight: '800', color: Colors.textPrimary },
  hint: { fontSize: 13, color: Colors.textMuted, lineHeight: 19 },
  label: {
    fontSize: 12, fontWeight: '700', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.4, marginTop: Spacing.xs,
  },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  choice: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
  },
  choiceOn: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  choiceText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  choiceTextOn: { color: Colors.primary, fontWeight: '800' },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    padding: Spacing.base, fontSize: 14, color: Colors.textPrimary,
    minHeight: 76, textAlignVertical: 'top',
  },
  row: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  grow: { flex: 1 },
  primaryBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.base, alignItems: 'center',
  },
  primaryBtnText: { color: Colors.white, fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  ghostBtn: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.base, paddingHorizontal: Spacing.lg, alignItems: 'center',
  },
  ghostBtnText: { color: Colors.textSecondary, fontSize: 14, fontWeight: '700' },
  reasonBox: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    padding: Spacing.base, gap: 2,
  },
  reasonLabel: {
    fontSize: 11, fontWeight: '800', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  reasonText: { fontSize: 14, color: Colors.textPrimary, lineHeight: 20 },
});
