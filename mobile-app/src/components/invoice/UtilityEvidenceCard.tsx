import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity } from 'react-native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { formatDateTime } from '@/utils';
import type { SharedBill } from '@/types/bill';

/**
 * BẰNG CHỨNG CỦA MỘT HOÁ ĐƠN ĐIỆN / NƯỚC — khối khách thuê dùng để tự kiểm.
 *
 * Vì sao tách thành component riêng: đây là thứ quyết định khiếu nại có nghĩa hay
 * không. Trước 24/08/2026 màn hoá đơn chỉ hiện *số kWh · đơn giá · thành tiền*, tức là
 * KẾT QUẢ mà không có ĐẦU VÀO. Khách muốn kiểm cũng không kiểm được gì, nên mọi thắc
 * mắc đều thành "tôi thấy tháng này cao" — không ai đối chứng nổi.
 *
 * Bày ra đúng ba thứ, theo thứ tự khách cần để tự trả lời "hoá đơn này có phải của
 * tôi và có đúng không":
 *   1. Đây có phải nhà tôi không   → địa chỉ + mã khách hàng in trên hoá đơn gốc
 *   2. Chỉ số lấy ở đâu ra          → cũ → mới, và hiệu hai số có bằng lượng tính tiền
 *   3. Có ảnh chứng minh không      → ảnh đồng hồ / ảnh hoá đơn EVN gốc, bấm xem to
 *
 * Nhãn ảnh PHẢI đổi theo loại nhà — hai loại nhà có bằng chứng khác hẳn nhau:
 *   • nguyên căn  → ảnh là TỜ HOÁ ĐƠN EVN/nước của chính căn đó (admin tải lên)
 *   • chia phòng  → ảnh là MẶT ĐỒNG HỒ của riêng phòng đó (quản lý chụp), còn tờ hoá
 *                   đơn tổng của cả nhà là ảnh thứ hai, chỉ dùng để kiểm đơn giá.
 * Gọi chung cả hai là "ảnh đồng hồ" thì khách nguyên căn mở ra thấy tờ giấy, tưởng
 * hệ thống đính nhầm.
 */

interface Props {
  invoice: SharedBill;
  /** Mở ảnh xem cỡ lớn — màn cha giữ modal xem ảnh. */
  onZoom: (url: string) => void;
}

const Row: React.FC<{ label: string; value: string; danger?: boolean; last?: boolean }> = ({
  label, value, danger, last,
}) => (
  <>
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, danger && { color: Colors.error }]}>{value}</Text>
    </View>
    {!last && <View style={s.rowDivider} />}
  </>
);

export const UtilityEvidenceCard: React.FC<Props> = ({ invoice, onZoom }) => {
  const isElectric = invoice.invoiceType === 'electricity';
  const unit = isElectric ? 'kWh' : 'm³';
  const used = isElectric ? invoice.kwhUsed : invoice.m3Used;
  const isWholeHouse = invoice.propertyType === 'WHOLE_HOUSE';

  const { prevReading, newReading, meterImageUrl, utilityBillImageUrl } = invoice;
  const hasReadings = prevReading != null && newReading != null;

  /**
   * Hiệu hai chỉ số có khớp lượng đã tính tiền không.
   *
   * Đây là phép kiểm DUY NHẤT khách tự làm được mà không cần biết gì về giá điện, nên
   * đáng để làm hộ luôn thay vì bắt khách trừ nhẩm. Lệch là dấu hiệu rõ nhất của đọc
   * nhầm mặt đồng hồ (thiếu/thừa một chữ số) — đúng loại lỗi khiếu nại sinh ra để bắt.
   *
   * BE đã ràng `consumption === newReading - prevReading` lúc tạo hoá đơn
   * (`UtilityInvoiceServiceImpl.validateInvoiceAmounts`), nên bình thường không bao giờ
   * lệch. Vẫn kiểm ở đây vì hoá đơn cũ tạo trước ràng buộc đó thì không ai bảo đảm.
   */
  const readingDelta = hasReadings ? newReading! - prevReading! : null;
  const readingMismatch =
    readingDelta != null && used != null && Math.abs(readingDelta - used) > 0.001;

  const rateText = isElectric
    ? `${(invoice.electricityRate ?? 0).toLocaleString('vi-VN')}đ/kWh`
    : `${(invoice.waterRate ?? 0).toLocaleString('vi-VN')}đ/m³`;

  // Không có gì để bày thì nói thẳng là KHÔNG có bằng chứng, đừng ẩn khối này đi.
  // Ẩn thì khách không biết lẽ ra phải có ảnh; nói ra thì khách biết mình có quyền đòi
  // — và đó chính là một lý do khiếu nại hợp lệ (NO_EVIDENCE).
  if (!hasReadings && !meterImageUrl && !utilityBillImageUrl && !invoice.billingAddress) {
    return (
      <View style={s.section}>
        <Text style={s.sectionTitle}>🔍 Căn cứ tính tiền</Text>
        <View style={[s.card, s.warnCard]}>
          <Text style={s.warnText}>
            ⚠️ Hoá đơn này chưa đính ảnh chỉ số. Bạn có quyền yêu cầu tra soát để được
            cung cấp ảnh đồng hồ / hoá đơn gốc trước khi thanh toán.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>🔍 Căn cứ tính tiền</Text>

      <View style={s.card}>
        {/* ── Đây có phải nhà mình không ── */}
        {!!invoice.billingAddress && (
          <Row label="Địa chỉ trên hoá đơn gốc" value={invoice.billingAddress} />
        )}
        {!!invoice.customerCode && (
          <Row label="Mã khách hàng" value={invoice.customerCode} />
        )}

        {/* ── Chỉ số lấy ở đâu ra ── */}
        {hasReadings && (
          <>
            <Row label="Chỉ số đầu kỳ" value={`${prevReading} ${unit}`} />
            <Row label="Chỉ số cuối kỳ" value={`${newReading} ${unit}`} />
            <Row
              label="Chênh lệch"
              value={`${newReading} − ${prevReading} = ${readingDelta} ${unit}`}
              danger={readingMismatch}
              last
            />
          </>
        )}
      </View>

      {/* Lệch thì phải nói to, và nói luôn khách nên làm gì — chứ không chỉ tô đỏ con số. */}
      {readingMismatch && (
        <View style={[s.card, s.errorCard]}>
          <Text style={s.errorText}>
            🚨 Chênh lệch chỉ số ({readingDelta} {unit}) không khớp với lượng đang tính
            tiền ({used} {unit}). Bạn nên gửi yêu cầu tra soát trước khi thanh toán.
          </Text>
        </View>
      )}

      {/* ── Ảnh bằng chứng ── */}
      {(!!meterImageUrl || !!utilityBillImageUrl) && (
        <View style={s.photoRow}>
          {!!meterImageUrl && (
            <View style={s.photoCol}>
              <Text style={s.photoLabel}>
                {isWholeHouse
                  ? `📄 Hoá đơn ${isElectric ? 'EVN' : 'nước'} của căn nhà`
                  : '📷 Đồng hồ phòng bạn'}
              </Text>
              <TouchableOpacity activeOpacity={0.85} onPress={() => onZoom(meterImageUrl)}>
                <Image source={{ uri: meterImageUrl }} style={s.thumb} />
              </TouchableOpacity>
              {!!invoice.meterCapturedAt && (
                <Text style={s.photoMeta}>🕒 {formatDateTime(invoice.meterCapturedAt)}</Text>
              )}
              <Text style={s.photoHint}>Chạm để xem cỡ lớn</Text>
            </View>
          )}

          {/*
            Ảnh hoá đơn tổng — CHỈ nhà chia phòng mới có nghĩa.
            Với nguyên căn nó trùng làm một với ảnh trên, bày hai lần thành thừa.
          */}
          {!isWholeHouse && !!utilityBillImageUrl && (
            <View style={s.photoCol}>
              <Text style={s.photoLabel}>📄 Hoá đơn cả nhà</Text>
              <TouchableOpacity activeOpacity={0.85} onPress={() => onZoom(utilityBillImageUrl)}>
                <Image source={{ uri: utilityBillImageUrl }} style={s.thumb} />
              </TouchableOpacity>
              <Text style={s.photoHint}>Để đối chiếu đơn giá</Text>
            </View>
          )}
        </View>
      )}

      {/*
        Giải thích đơn giá ở đâu ra — chỉ nhà chia phòng.
        EVN tính bậc thang nên tờ hoá đơn KHÔNG in đơn giá 1 kWh; đơn giá của hệ thống
        là tổng tiền ÷ tổng kWh của cả nhà (xem utils/evnInvoiceParser.ts bên web).
        Không nói ra thì khách lấy biểu giá EVN trên mạng so vào, thấy lệch, tưởng bị
        tính sai — một hiểu lầm rất hay xảy ra.
      */}
      {!isWholeHouse && (
        <Text style={s.footNote}>
          Đơn giá {rateText} được tính bằng tổng tiền chia tổng {unit} trên hoá đơn của
          cả nhà, nên có thể lệch so với biểu giá bậc thang bạn tra trên mạng.
        </Text>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  section: { marginBottom: Spacing.md },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: Colors.textSecondary,
    marginBottom: Spacing.sm, marginLeft: 2,
  },
  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base, ...Shadow.sm,
  },
  warnCard: { backgroundColor: Colors.warningLight, paddingVertical: Spacing.base },
  warnText: { fontSize: 13, color: '#92400E', lineHeight: 20, fontWeight: '600' },
  errorCard: {
    backgroundColor: Colors.errorLight, paddingVertical: Spacing.base,
    marginTop: Spacing.sm,
  },
  errorText: { fontSize: 13, color: '#991B1B', lineHeight: 20, fontWeight: '600' },

  row: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', paddingVertical: 11,
  },
  rowLabel: { fontSize: 13, color: Colors.textMuted, flex: 1 },
  rowValue: {
    fontSize: 13, fontWeight: '600', color: Colors.textPrimary,
    flex: 2, textAlign: 'right',
  },
  rowDivider: { height: 1, backgroundColor: Colors.divider },

  photoRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  photoCol: { flex: 1 },
  photoLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.textSecondary, marginBottom: 6,
  },
  thumb: {
    width: '100%', height: 140, borderRadius: BorderRadius.md,
    backgroundColor: Colors.divider,
  },
  photoMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  photoHint: { fontSize: 11, color: Colors.primary, marginTop: 2, fontWeight: '600' },

  footNote: {
    fontSize: 11, color: Colors.textMuted, lineHeight: 17,
    marginTop: Spacing.sm, paddingHorizontal: 2,
  },
});
