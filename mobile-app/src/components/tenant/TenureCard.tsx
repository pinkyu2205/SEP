import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Brand, Spacing, BorderRadius } from '@/constants';
import { serverNow } from '@/utils/serverTime';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * "BẠN ĐÃ Ở ĐÂY BAO LÂU" — một dòng, ở trang chủ khách thuê và mục Tài khoản.
 *
 * Bản đầu (07/09/2026) là thẻ hai dòng, luôn nói một câu duy nhất "Bạn đã đồng hành
 * cùng chúng tôi". Ba thứ đã đổi:
 *
 *  1. ĐẾM NGÀY MÃI THÌ MẤT NGHĨA. "487 ngày" không gợi lên gì — người ta nghĩ theo
 *     tháng và năm. Nay số lớn đổi sang "1 năm 4 tháng"; chỉ tuần đầu mới đếm từng
 *     ngày, lúc đó từng ngày mới thật sự đáng đếm.
 *
 *  2. MỘT CÂU CHO MỌI CHẶNG. Người dọn vào hôm qua và người ở ba năm đọc y hệt nhau.
 *     Nay mỗi chặng một câu, và ĐÚNG NGÀY kỷ niệm tháng/năm thì đổi sang tông đỏ
 *     thương hiệu để ăn mừng.
 *
 *  3. GỌN LẠI CÒN MỘT DÒNG. Đây là lời chào, không phải số liệu — nó không đáng
 *     chiếm hai dòng phía trên thẻ phòng.
 *
 * Mốc tính theo LỊCH chứ không chia đều số ngày: "tròn một năm" là cùng ngày cùng
 * tháng năm sau, không phải ngày thứ 365 — tháng 2 và năm nhuận sẽ làm lệch.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface Tenure {
  /** Số ngày đã ở, đếm từ 1: dọn vào hôm nay là ngày thứ 1. */
  days: number;
  /** Số tháng tròn đã ở. */
  months: number;
  /** Hôm nay có đúng là ngày kỷ niệm tháng/năm không. */
  anniversary: 'year' | 'month' | null;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Số ngày của tháng — để xử lý mốc ngày 31 rơi vào tháng chỉ có 30 ngày. */
const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

export const computeTenure = (moveIn?: string | null): Tenure | null => {
  if (!moveIn) return null;
  const raw = new Date(moveIn);
  if (Number.isNaN(raw.getTime())) return null;

  const from = startOfDay(raw);
  const to   = startOfDay(serverNow());
  if (to < from) return null; // ngày dọn vào ở tương lai — chưa có gì để chào

  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;

  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  months = Math.max(0, months);

  /**
   * Người dọn vào ngày 31 mà tháng này chỉ có 30 ngày thì mừng vào ngày cuối tháng —
   * không thì họ mất mốc ở mọi tháng ngắn.
   */
  const anchor = Math.min(from.getDate(), daysInMonth(to.getFullYear(), to.getMonth()));
  const isAnniversary = months > 0 && to.getDate() === anchor;

  return {
    days,
    months,
    anniversary: isAnniversary ? (months % 12 === 0 ? 'year' : 'month') : null,
  };
};

/** Đếm ngày lúc mới, đếm tháng/năm khi đã lâu. */
const durationLabel = ({ days, months }: Tenure): string => {
  if (months < 1) return days < 14 ? `${days} ngày` : `${Math.floor(days / 7)} tuần`;
  if (months < 12) return `${months} tháng`;
  const years = Math.floor(months / 12);
  const rest  = months % 12;
  return rest === 0 ? `${years} năm` : `${years} năm ${rest} tháng`;
};

/**
 * Câu nói theo chặng, tách làm ba mảnh để phần in đậm nằm GIỮA một câu hoàn chỉnh.
 *
 * Bản một dòng đầu tiên viết "1 ngày · chào mừng bạn về nhà mới!" — con số đứng trơ
 * ở đầu dòng không nói nó đếm cái gì: còn 1 ngày nữa? hạn 1 ngày? Nay câu tự giải
 * thích lấy mình ("Bạn đã ở đây 1 ngày"), số vẫn in đậm nên vẫn là thứ đập vào mắt
 * trước, mà không ai phải đoán.
 */
const message = (t: Tenure): { emoji: string; prefix: string; value: string; suffix: string } => {
  const dur = durationLabel(t);

  if (t.anniversary === 'year') {
    return { emoji: '🎂', prefix: 'Hôm nay tròn ', value: `${t.months / 12} năm`, suffix: ' bạn ở đây. Cảm ơn bạn!' };
  }
  if (t.anniversary === 'month') {
    return { emoji: '🎉', prefix: 'Hôm nay tròn ', value: `${t.months} tháng`, suffix: ' bạn ở đây' };
  }

  const { days, months } = t;
  const say = (emoji: string, suffix: string) => ({ emoji, prefix: 'Bạn đã ở đây ', value: dur, suffix });

  if (days === 1)  return say('🎊', ' — chào mừng về nhà mới!');
  if (days <= 7)   return say('🌱', ' — những ngày đầu tiên');
  if (days <= 30)  return say('☕', ' — tuần đầu trôi qua êm đẹp');
  if (months < 3)  return say('🏡', ' — nơi này đang thành quen thuộc');
  if (months < 6)  return say('🌿', ' — cảm ơn bạn đã chọn ở lại');
  if (months < 12) return say('⭐', ' — một chặng đường dài');
  if (months < 24) return say('💎', ' — bạn là người nhà rồi');
  return say('👑', ' — khách thuê thân thiết');
};

/**
 * Ba mươi ngày cuối hợp đồng thì thẻ đổi việc: thôi kể chuyện đã ở bao lâu, chuyển
 * sang đếm ngược.
 *
 * Vì sao thay hẳn chứ không hiện cả hai: đây là một dòng, và trong tháng cuối thì
 * "còn bao lâu nữa" quan trọng hơn hẳn "đã ở bao lâu rồi" — nhất là vì cửa xin gia
 * hạn cũng chỉ mở đúng khoảng này.
 *
 * Mốc bám theo luồng gia hạn đã chốt: khách xin được từ ngày thứ 30 trước hạn cho
 * tới hết ngày áp chót; ĐÚNG ngày cuối hợp đồng thì phiếu trả phòng tự chạy, nên
 * hôm đó không rủ xin gia hạn nữa — mời một việc đã đóng cửa còn tệ hơn là im lặng.
 */
const expiring = (daysLeft: number, hasCheckout: boolean) => {
  const bold = (emoji: string, prefix: string, value: string, suffix: string) =>
    ({ emoji, prefix, value, suffix });

  // Quá hạn mà vẫn còn thấy màn này = phiếu trả phòng chưa xong. Không gộp vào nhánh
  // dưới: `daysLeft = -5` mà nói "hôm nay là ngày cuối" thì sai hẳn ngày.
  if (daysLeft < 0)   return bold('🔔', '', 'Hợp đồng đã hết hạn', '');
  if (daysLeft === 0) return bold('🔔', '', 'Hôm nay', ' là ngày cuối hợp đồng');
  if (daysLeft === 1) return bold('⏰', '', 'Ngày mai', ' là ngày cuối hợp đồng');

  // Đang có phiếu trả phòng thì đừng rủ gia hạn — khách đã chọn đường khác rồi.
  const nudge = hasCheckout
    ? ''
    : (daysLeft <= 7 ? ' — muốn ở tiếp thì xin gia hạn ngay' : ' — bạn có thể xin gia hạn');

  return bold(daysLeft <= 7 ? '⏳' : '📋', 'Hợp đồng còn ', `${daysLeft} ngày`, nudge);
};

interface Props {
  /** Ngày dọn vào ở thật; lùi về ngày hợp đồng hiệu lực nếu BE chưa trả. */
  moveInDate?: string | null;
  /** Số ngày còn lại của hợp đồng (`contract.daysLeft` của BE). */
  daysLeft?: number | null;
  /** Khách đang có phiếu trả phòng mở — để không rủ gia hạn nữa. */
  hasCheckout?: boolean;
  style?: object;
}

export const TenureCard: React.FC<Props> = ({ moveInDate, daysLeft, hasCheckout, style }) => {
  const tenure = computeTenure(moveInDate);

  const near = typeof daysLeft === 'number' && daysLeft <= 30;
  const urgent = near && (daysLeft as number) <= 7;

  // Không có ngày dọn vào MÀ cũng không sắp hết hạn thì chẳng có gì để nói.
  if (!tenure && !near) return null;

  const { emoji, prefix, value, suffix } = near
    ? expiring(daysLeft as number, !!hasCheckout)
    : message(tenure as Tenure);

  const party = !near && tenure?.anniversary != null;
  const tone  = urgent ? s.rowUrgent : near ? s.rowWarn : party ? s.rowParty : null;
  const txt   = urgent ? s.textUrgent : near ? s.textWarn : party ? s.textParty : null;

  return (
    <View style={[s.row, tone, style]}>
      <Text style={s.emoji}>{emoji}</Text>
      <Text style={[s.text, txt]} numberOfLines={2}>
        {prefix}
        <Text style={[s.value, txt]}>{value}</Text>
        {suffix}
      </Text>
    </View>
  );
};

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Brand.greenTint, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: '#D6EDD7',
    paddingVertical: Spacing.sm + 1, paddingHorizontal: Spacing.md,
  },
  // Ngày kỷ niệm đổi sang đỏ thương hiệu — màu này cả app chỉ dùng cho điểm nhấn
  // hiếm, nên nó thật sự nổi lên chứ không lẫn vào nền xanh thường ngày.
  rowParty: { backgroundColor: Brand.redTint, borderColor: '#FBD5D5' },

  /**
   * Hai nấc cho chặng cuối. Hổ phách là "để ý nhé", đỏ là "làm ngay đi" — nhảy
   * thẳng sang đỏ từ ngày thứ 30 thì tới tuần cuối không còn nấc nào để leo,
   * mà đỏ suốt một tháng thì khách quen mắt và thôi nhìn.
   */
  rowWarn:   { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  rowUrgent: { backgroundColor: Brand.redTint, borderColor: '#FBD5D5' },

  emoji: { fontSize: 15 },
  text:  { flex: 1, fontSize: 12.5, color: Brand.greenDark, lineHeight: 17 },
  value: { fontWeight: '800', color: Colors.textPrimary },
  textParty:  { color: Brand.redDark },
  textWarn:   { color: '#B45309' },
  textUrgent: { color: Brand.redDark },
});
