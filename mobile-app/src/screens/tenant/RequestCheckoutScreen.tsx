import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
} from 'react-native';
import { showAlert } from '@/utils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  Colors, Spacing, BorderRadius, Shadow,
  isCheckoutClosed, checkoutMeta, checkoutStep, CHECKOUT_FLOW,
} from '@/constants';

import { Contract } from '@/types';
import { DatePickerField } from '@/components/common';
import { realTenantSelfService } from '@/services/tenant/selfService';
import type { CheckoutRequestDto } from '@/services/tenant/selfService';
import { serverNow } from '@/utils/serverTime';

/**
 * Tenant gửi YÊU CẦU TRẢ PHÒNG — nối API thật POST /tenant/me/checkout-requests
 * (trước đây màn này mock toàn phần: setTimeout + checkoutStore in-memory, mất hết
 * khi tắt app — xem plan cải tiến quy trình).
 * BE chưa có field riêng cho TK hoàn cọc → gộp vào `note`; ảnh hiện trạng chưa có
 * chỗ chứa nên bỏ (đề nghị BE trong API-ProcessGaps-BE-TODO.md).
 */

/**
 * Nhãn từng bước viết cho KHÁCH.
 * Nhãn gốc trong `CHECKOUT_STATUS_META` viết từ góc nhìn điều phối ("Chờ khách xác nhận"),
 * đọc trên app của chính người khách đó thì lạ — ở đây phải là "Bạn xác nhận".
 */
const TENANT_STEP_LABEL: Record<string, string> = {
  PENDING: 'Gửi yêu cầu',
  APPROVED: 'Quản lý duyệt',
  INSPECTING: 'Kiểm tra phòng',
  WAITING_TENANT: 'Bạn xác nhận quyết toán',
  SETTLING: 'Hoàn tiền cọc',
  COMPLETED: 'Hoàn tất',
};

const REASONS = [
  'Chuyển chỗ ở do công việc',
  'Mua nhà riêng',
  'Hết thời hạn hợp đồng',
  'Học tập / công tác nơi khác',
  'Lý do gia đình',
  'Lý do tài chính',
  'Lý do khác',
];

/** Khách phải báo trước ít nhất ngần này ngày để quản lý sắp lịch kiểm tra phòng. */
const MIN_NOTICE_DAYS = 7;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** "10/08/2026" (định dạng của DatePickerField) -> "2026-08-10" (định dạng BE). */
const toIsoDate = (ddmmyyyy: string): string => {
  const [d, m, y] = (ddmmyyyy || '').split('/');
  return d && m && y ? `${y}-${m}-${d}` : '';
};
const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

export const RequestCheckoutScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const passedContract: Contract | undefined = route.params?.contract;

  // HĐ để trả phòng: ưu tiên contract truyền vào (từ ContractDetail), không có thì
  // lấy từ dashboard (HĐ ACTIVE hiện tại của tenant).
  const [contractId, setContractId] = useState<number | null>(
    passedContract ? Number(passedContract.id) || null : null,
  );
  const [contractCode, setContractCode] = useState(passedContract?.code ?? '');
  const [roomName, setRoomName] = useState(passedContract?.roomCode ?? '');
  const [buildingName, setBuildingName] = useState(passedContract?.propertyName ?? '');
  const [depositAmount, setDepositAmount] = useState<number | null>(passedContract?.depositAmount ?? null);
  const [loadingContract, setLoadingContract] = useState(!passedContract);
  // Đã có yêu cầu đang mở (PENDING/APPROVED) → chặn tạo trùng, mời xem tiến trình.
  const [openRequest, setOpenRequest] = useState<CheckoutRequestDto | null>(null);

  const [moveOutDate, setMoveOutDate] = useState('');
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState('');
  const [note, setNote] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [dashboard, requests] = await Promise.all([
          passedContract ? Promise.resolve(null) : realTenantSelfService.getDashboard(),
          realTenantSelfService.listMyCheckoutRequests().catch(() => [] as CheckoutRequestDto[]),
        ]);
        if (!active) return;
        if (dashboard) {
          if (!dashboard.contract) {
            showAlert('Không có hợp đồng', 'Bạn chưa có hợp đồng đang hiệu lực để trả phòng.', [
              { text: 'Đóng', onPress: () => navigation.goBack() },
            ]);
            return;
          }
          setContractId(dashboard.contract.id);
          setContractCode(dashboard.contract.code);
          setRoomName(dashboard.room?.roomNumber ?? '');
          setBuildingName(dashboard.building?.name ?? '');
          setDepositAmount(dashboard.room?.depositAmount ?? null);
        }
        // "Đang mở" = mọi trạng thái chưa đóng hồ sơ. Trước đây chỉ nhận PENDING/APPROVED
        // nên khi hồ sơ chạy tới INSPECTING/WAITING_TENANT/SETTLING thì khách lại thấy
        // form tạo mới — tưởng yêu cầu bị mất, mà bấm gửi nữa là tạo trùng.
        const open = requests.find((r) => !isCheckoutClosed(r.status));
        if (open) setOpenRequest(open);
      } catch {
        if (active) showAlert('Lỗi', 'Không tải được thông tin hợp đồng.');
      } finally {
        if (active) setLoadingContract(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const reasonText = selectedReason === 'Lý do khác' ? customReason.trim() : selectedReason ?? '';

  // Ngày sớm nhất được chọn — khoá luôn trên lịch, không để khách chọn rồi mới báo lỗi.
  const minMoveOutDate = useMemo(() => {
    const d = serverNow();
    d.setDate(d.getDate() + MIN_NOTICE_DAYS);
    return startOfDay(d);
  }, []);

  const moveOutIso = toIsoDate(moveOutDate);
  /** Mô tả ngày đã chọn cho khách đọc lại — tránh chọn nhầm thứ/ngày. */
  const moveOutSummary = useMemo(() => {
    if (!moveOutIso) return null;
    const d = startOfDay(new Date(moveOutIso));
    if (isNaN(d.getTime())) return null;
    const days = Math.round((d.getTime() - startOfDay(serverNow()).getTime()) / 86_400_000);
    return `${WEEKDAYS[d.getDay()]}, ${moveOutDate} · còn ${days} ngày nữa`;
  }, [moveOutIso, moveOutDate]);

  const handleSubmit = async () => {
    if (!contractId) return showAlert('Lỗi', 'Không xác định được hợp đồng.');
    if (!moveOutIso) {
      return showAlert('Thiếu thông tin', 'Chọn ngày bạn muốn trả phòng.');
    }
    if (startOfDay(new Date(moveOutIso)) < minMoveOutDate) {
      return showAlert(
        'Ngày quá gần',
        `Chọn ngày cách hôm nay ít nhất ${MIN_NOTICE_DAYS} ngày để quản lý kịp sắp lịch kiểm tra phòng.`,
      );
    }
    if (!reasonText) {
      return showAlert('Thiếu thông tin', 'Vui lòng chọn lý do trả phòng.');
    }

    setSubmitting(true);
    try {
      const created = await realTenantSelfService.createCheckoutRequest({
        contractId,
        expectedMoveOutDate: moveOutIso,
        reason: reasonText,
        /*
         * `note` nay chỉ còn ghi chú khách tự viết.
         *
         * Trước đây tài khoản hoàn cọc bị gộp vào đây vì BE chưa có field riêng; sau khi BE
         * thêm field thì vẫn phải giữ dòng gộp thêm một thời gian nữa vì DTO của quản lý
         * chưa đọc được. Nay `CheckoutRequestResponse` đã có đủ 3 field nên bỏ hẳn — dữ liệu
         * một chỗ, không còn hai nguồn phải giữ khớp nhau.
         */
        note: note.trim() || undefined,
        refundBankName: bankName.trim() || undefined,
        refundBankAccount: bankAccount.trim() || undefined,
        refundAccountHolder: accountHolder.trim() || undefined,
      });
      showAlert(
        '✅ Đã gửi yêu cầu trả phòng',
        'Quản lý sẽ xem xét và phản hồi. Bạn có thể theo dõi tiến trình bất cứ lúc nào.',
        [{ text: 'Xem tiến trình', onPress: () => navigation.replace('CheckoutDetail', { requestId: created.id }) }],
      );
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Không gửi được yêu cầu — thử lại sau.';
      showAlert('Lỗi', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const isValid = !!moveOutIso && !!reasonText && !!contractId;

  if (loadingContract) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={Colors.primary} size="large" /></View>
      </SafeAreaView>
    );
  }

  // Đã có yêu cầu đang mở → không cho tạo trùng
  if (openRequest) {
    // Đang chờ CHÍNH KHÁCH xác nhận bảng quyết toán → nhấn mạnh việc phải làm.
    const needsTenantAction = (openRequest.status || '').toUpperCase() === 'WAITING_TENANT';
    const meta = checkoutMeta(openRequest.status);
    const currentStep = checkoutStep(openRequest.status);
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Quay lại</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Yêu cầu trả phòng</Text>
          <View style={{ width: 72 }} />
        </View>
        {/*
          Hiện TIẾN TRÌNH ngay tại đây, không bắt bấm thêm một nút nữa mới thấy.
          Bản cũ là một emoji giữa màn hình trắng + nhãn trạng thái + nút "Xem tiến trình":
          khách vào chỉ biết "đang được xử lý", muốn biết tới đâu phải bấm tiếp. Mà đây đúng
          là màn khách mở ra để hỏi "tới đâu rồi" — câu trả lời phải nằm sẵn.
        */}
        <ScrollView contentContainerStyle={styles.openScroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.openHero, { backgroundColor: meta.bg }]}>
            <Text style={[styles.openStatus, { color: meta.color }]}>{meta.label}</Text>
            <Text style={styles.openHint}>{meta.tenantHint}</Text>
            <Text style={styles.openContract}>
              Hợp đồng {openRequest.contractCode || `#${openRequest.contractId}`}
            </Text>
          </View>

          <Text style={styles.openSectionTitle}>Tiến trình</Text>
          <View style={styles.timeline}>
            {CHECKOUT_FLOW.map((st, i) => {
              const done = currentStep >= 0 && i < currentStep;
              const active = i === currentStep;
              const stepMeta = checkoutMeta(st);
              return (
                <View key={st} style={styles.tlRow}>
                  <View style={styles.tlRail}>
                    <View style={[
                      styles.tlDot,
                      done && styles.tlDotDone,
                      active && { backgroundColor: meta.color, borderColor: meta.color },
                    ]}>
                      {done && <Text style={styles.tlCheck}>✓</Text>}
                    </View>
                    {i < CHECKOUT_FLOW.length - 1 && (
                      <View style={[styles.tlLine, done && styles.tlLineDone]} />
                    )}
                  </View>
                  <View style={styles.tlBody}>
                    <Text style={[
                      styles.tlLabel,
                      done && styles.tlLabelDone,
                      active && { color: meta.color, fontWeight: '800' },
                    ]}>
                      {TENANT_STEP_LABEL[st] ?? stepMeta.short}
                    </Text>
                    {active && !!meta.tenantHint && (
                      <Text style={styles.tlNow}>Đang ở bước này</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, needsTenantAction && styles.submitBtnUrgent]}
            onPress={() => navigation.replace('CheckoutDetail', { requestId: openRequest.id })}
          >
            <Text style={styles.submitBtnText}>
              {needsTenantAction ? 'Xem bảng quyết toán →' : 'Xem chi tiết hồ sơ →'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.openFoot}>
            Đang có một yêu cầu chưa xong nên chưa gửi thêm yêu cầu mới được.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Hủy</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Yêu cầu trả phòng</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Helper Banner */}
        <View style={styles.helperBanner}>
          <Text style={styles.helperText}>
            💡 Yêu cầu trả phòng sẽ được quản lý xác nhận trước khi tiến hành kiểm tra hiện trạng và hoàn cọc.
          </Text>
        </View>

        {/* Thông tin HĐ thật */}
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>📋 Thông tin phòng & hợp đồng</Text>
          {[
            { label: 'Phòng', value: roomName || 'Nguyên căn' },
            { label: 'Tòa nhà', value: buildingName || '—' },
            { label: 'Mã hợp đồng', value: contractCode || '—' },
            { label: 'Tiền đặt cọc', value: depositAmount != null ? `${depositAmount.toLocaleString('vi-VN')} đ` : '—' },
          ].map((row, i) => (
            <View key={i} style={[styles.infoRow, i === 3 && { borderBottomWidth: 0 }]}>
              <Text style={styles.infoLabel}>{row.label}</Text>
              <Text style={styles.infoValue}>{row.value}</Text>
            </View>
          ))}
        </View>

        {/* Ngày trả phòng */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            Ngày muốn trả phòng <Text style={styles.required}>*</Text>
          </Text>
          <DatePickerField
            value={moveOutDate}
            onChange={setMoveOutDate}
            placeholder="Chạm để chọn ngày"
            minDate={minMoveOutDate}
          />
          {moveOutSummary ? (
            <Text style={styles.fieldPicked}>📅 {moveOutSummary}</Text>
          ) : (
            <Text style={styles.fieldHint}>
              Sớm nhất là {MIN_NOTICE_DAYS} ngày kể từ hôm nay, để quản lý kịp sắp lịch kiểm tra phòng.
            </Text>
          )}
        </View>

        {/* Lý do */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            Lý do trả phòng <Text style={styles.required}>*</Text>
          </Text>
          <View style={styles.reasonGrid}>
            {REASONS.map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.reasonChip, selectedReason === r && styles.reasonChipActive]}
                onPress={() => setSelectedReason(r)}
                activeOpacity={0.7}
              >
                <Text style={[styles.reasonChipText, selectedReason === r && styles.reasonChipTextActive]}>
                  {r}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {selectedReason === 'Lý do khác' && (
            <TextInput
              style={[styles.input, { marginTop: Spacing.sm }]}
              placeholder="Vui lòng mô tả lý do..."
              value={customReason}
              onChangeText={setCustomReason}
              maxLength={200}
            />
          )}
        </View>

        {/* Ghi chú */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            Ghi chú thêm <Text style={styles.optional}>(không bắt buộc)</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Thời gian có thể kiểm tra, yêu cầu đặc biệt..."
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            value={note}
            onChangeText={setNote}
            maxLength={400}
          />
          <Text style={styles.charCount}>{note.length}/400</Text>
        </View>

        {/* TK hoàn cọc — gửi kèm trong ghi chú cho quản lý */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            Tài khoản nhận hoàn cọc <Text style={styles.optional}>(khuyến nghị)</Text>
          </Text>
          <Text style={styles.fieldHint}>Gửi kèm cho quản lý để chuyển hoàn tiền cọc sau khi quyết toán.</Text>
          <TextInput
            style={[styles.input, { marginTop: Spacing.sm }]}
            placeholder="Tên ngân hàng (ví dụ: Vietcombank, Techcombank...)"
            value={bankName}
            onChangeText={setBankName}
          />
          <TextInput
            style={[styles.input, { marginTop: Spacing.sm }]}
            placeholder="Số tài khoản"
            value={bankAccount}
            onChangeText={setBankAccount}
            keyboardType="numeric"
          />
          <TextInput
            style={[styles.input, { marginTop: Spacing.sm }]}
            placeholder="Tên chủ tài khoản (chữ in hoa)"
            value={accountHolder}
            onChangeText={v => setAccountHolder(v.toUpperCase())}
            autoCapitalize="characters"
          />
        </View>

        {/* Notice */}
        <View style={styles.noticeCard}>
          <Text style={styles.noticeText}>
            🔔 Sau khi gửi yêu cầu, quản lý sẽ liên hệ để xác nhận lịch kiểm tra phòng. Tiền cọc sẽ được hoàn trả sau khi hoàn tất kiểm tra và quyết toán.
          </Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, (!isValid || submitting) && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={!isValid || submitting}
          activeOpacity={0.8}
        >
          <Text style={styles.submitBtnText}>
            {submitting ? 'Đang gửi...' : '🏠 Gửi yêu cầu trả phòng'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: { padding: Spacing.sm },
  backText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },

  scroll: { flex: 1 },

  openScroll: { padding: Spacing.lg, paddingBottom: Spacing.xl },
  openHero: { borderRadius: BorderRadius.xl, padding: Spacing.lg, marginBottom: Spacing.lg },
  openStatus: { fontSize: 18, fontWeight: '800' },
  openHint: { fontSize: 13, color: Colors.textSecondary, marginTop: 6, lineHeight: 19 },
  openContract: { fontSize: 12, color: Colors.textMuted, marginTop: Spacing.sm },
  openSectionTitle: {
    fontSize: 11, fontWeight: '800', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: Spacing.sm,
  },
  timeline: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl,
    padding: Spacing.lg, marginBottom: Spacing.lg,
    borderWidth: 1, borderColor: Colors.border,
  },
  tlRow: { flexDirection: 'row', gap: Spacing.md },
  /** Cột chấm + đường nối; `alignItems: center` để đường nối rơi đúng tâm chấm. */
  tlRail: { alignItems: 'center', width: 20 },
  tlDot: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  tlDotDone: { backgroundColor: Colors.success, borderColor: Colors.success },
  tlCheck: { fontSize: 10, fontWeight: '900', color: Colors.white },
  tlLine: { width: 2, flex: 1, minHeight: 22, backgroundColor: Colors.border },
  tlLineDone: { backgroundColor: Colors.success },
  tlBody: { flex: 1, paddingBottom: Spacing.md },
  tlLabel: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  tlLabelDone: { color: Colors.textSecondary },
  tlNow: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  submitBtnUrgent: { backgroundColor: Colors.warning },
  openFoot: {
    fontSize: 12, color: Colors.textMuted, textAlign: 'center',
    marginTop: Spacing.md, lineHeight: 17,
  },
  openTitle: { fontSize: 17, fontWeight: '700', color: Colors.textPrimary, textAlign: 'center' },
  openDesc: {
    fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20,
    marginTop: Spacing.sm, marginBottom: Spacing.xl,
  },

  helperBanner: {
    margin: Spacing.lg, marginBottom: 0,
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg,
    padding: Spacing.base, borderLeftWidth: 3, borderLeftColor: Colors.primary,
  },
  helperText: { fontSize: 13, color: Colors.primary, lineHeight: 20 },

  infoCard: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.lg,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  infoCardTitle: {
    fontSize: 13, fontWeight: '700', color: Colors.textPrimary,
    paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  infoLabel: { fontSize: 13, color: Colors.textMuted },
  infoValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

  field: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  fieldLabel: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  fieldHint: { fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.xs },
  fieldPicked: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginTop: 6, marginBottom: Spacing.xs },
  required: { color: Colors.error },
  optional: { fontWeight: '400', color: Colors.textMuted },

  input: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    fontSize: 15, color: Colors.textPrimary,
  },
  textArea: { height: 100, textAlignVertical: 'top' },
  charCount: { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 4 },

  reasonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  reasonChip: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  reasonChipActive: { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  reasonChipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  reasonChipTextActive: { color: Colors.primary },

  noticeCard: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.lg,
    backgroundColor: '#FFF7ED', borderRadius: BorderRadius.lg,
    padding: Spacing.base, borderLeftWidth: 3, borderLeftColor: '#F59E0B',
  },
  noticeText: { fontSize: 13, color: '#92400E', lineHeight: 20 },

  submitBtn: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.xl,
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', ...Shadow.md,
  },
  submitBtnDisabled: { backgroundColor: Colors.textMuted },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
});
