import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius } from '@/constants';
import { serverNow, todayIso } from '@/utils/serverTime';

/**
 * NHẮC VIỆC: CHỤP ĐỒNG HỒ, CÓ HẠN.
 *
 * NƯỚC — admin phát hành hoá đơn tổng của cả nhà là giao việc cho quản lý: đi chụp đồng hồ
 * và ghi số **từng phòng ngay trong ngày**. Để sang hôm sau thì số đọc lệch với kỳ của hoá
 * đơn nhà nước, chia cho khách không còn khớp.
 *
 * ĐIỆN (từ 10/09/2026) — ngược lại: hạn là **ngày cuối tháng**, chốt trước rồi admin mới đẩy
 * hoá đơn EVN. Truyền `deadlineRule="month_end"` để banner nói đúng mốc và đúng lý do trễ.
 * Số phòng và hạn khi đó do màn hình tự đếm, không lấy từ hoá đơn (hoá đơn chưa tồn tại).
 *
 * Trước đây màn hoá đơn chỉ hiện tổng kWh/m³ và đơn giá, không nói gì về hạn hay còn bao
 * nhiêu phòng, nên quản lý không có cách nào biết mình đang trễ. Bốn field dưới đây do BE
 * tính sẵn (17/08/2026): `roomsTotal`, `roomsDone`, `readingDeadline`, `overdue`.
 *
 * Nhà NGUYÊN CĂN không hiện banner: khách nhận hoá đơn trực tiếp từ admin, quản lý không có
 * việc gì để làm (BE để `readingDeadline = null`, `roomsTotal = 0`).
 */

export interface MeterTaskInfo {
  roomsTotal?: number;
  roomsDone?: number;
  readingDeadline?: string | null;
  overdue?: boolean;
}

/** Số ngày đã trễ so với hạn (0 = còn trong hạn). Tính theo giờ server. */
const daysLate = (deadlineIso?: string | null): number => {
  if (!deadlineIso) return 0;
  const today = todayIso(serverNow());
  if (today <= deadlineIso) return 0;
  const diff = new Date(`${today}T00:00:00`).getTime() - new Date(`${deadlineIso}T00:00:00`).getTime();
  return Math.max(0, Math.round(diff / 86_400_000));
};

const viDate = (iso?: string | null): string =>
  iso ? iso.split('-').reverse().join('/') : '';

export const MeterTaskBanner: React.FC<{
  bill: MeterTaskInfo | null | undefined;
  /** 'elec' | 'water' — chỉ để gọi tên việc cho đúng. */
  kind: 'elec' | 'water';
  /**
   * Hạn chụp bám vào mốc nào — hai luồng nay khác nhau (10/09/2026):
   *
   *   'publish_day' (NƯỚC, mặc định) — hạn là ngày admin phát hành hoá đơn tổng. Quản lý
   *     ghi số SAU khi có giấy, nên số đọc muộn một ngày là lệch với kỳ của giấy.
   *   'month_end'   (ĐIỆN)           — hạn là NGÀY CUỐI THÁNG, không liên quan tới admin.
   *     Quản lý chốt số TRƯỚC, giấy về sau; chốt muộn là công tơ đã chạy sang kỳ mới.
   *
   * Cùng một cái banner nhưng lý do trễ khác hẳn nhau, nên câu giải thích phải khác —
   * nói "hạn là ngày admin phát hành" cho tab Điện bây giờ là chỉ sai người, sai mốc.
   */
  deadlineRule?: 'publish_day' | 'month_end';
}> = ({ bill, kind, deadlineRule = 'publish_day' }) => {
  const total = bill?.roomsTotal ?? 0;
  // Nguyên căn (total = 0) hoặc chưa có hoá đơn tổng → không có việc nào để nhắc.
  if (!bill || total <= 0) return null;

  const done = bill.roomsDone ?? 0;
  const left = Math.max(0, total - done);
  const label = kind === 'water' ? 'đồng hồ nước' : 'đồng hồ điện';
  const monthEnd = deadlineRule === 'month_end';

  // Xong hết thì báo xong — im lặng sẽ khiến quản lý mở lại màn để kiểm tra cho chắc.
  if (left === 0) {
    return (
      <View style={[s.box, s.done]}>
        <Text style={s.doneText}>
          {monthEnd
            ? `✓ Đã chốt đủ ${total}/${total} phòng. Hoá đơn tự phát hành khi admin đẩy hoá đơn EVN.`
            : `✓ Đã ghi chỉ số đủ ${total}/${total} phòng cho kỳ này.`}
        </Text>
      </View>
    );
  }

  const late = daysLate(bill.readingDeadline);
  // Tin `overdue` của BE trước (BE mới là nơi biết luật), tự tính chỉ để lấy SỐ NGÀY trễ.
  const isOverdue = bill.overdue === true || late > 0;

  return (
    <View style={[s.box, isOverdue ? s.overdue : s.today]}>
      <Text style={[s.title, isOverdue ? s.overdueTitle : s.todayTitle]}>
        {isOverdue
          ? `🚨 Quá hạn ${monthEnd ? 'chốt số' : 'ghi chỉ số'}${late > 0 ? ` ${late} ngày` : ''} — còn ${left}/${total} phòng`
          : `⚡ Việc kỳ này: chụp ${label} ${left}/${total} phòng`}
      </Text>
      <Text style={s.body}>
        {monthEnd
          ? (isOverdue
            ? `Hạn là ${viDate(bill.readingDeadline)} — ngày cuối tháng. Công tơ đã chạy sang kỳ mới, `
              + 'số đọc bây giờ gồm cả phần của tháng sau: chụp ngay và ghi rõ để còn giải thích với khách.'
            : `Phải xong trong ngày ${viDate(bill.readingDeadline)} (ngày cuối tháng). Chốt xong cứ để đấy, `
              + 'khách chưa nhận gì — hoá đơn tự phát hành khi admin đẩy hoá đơn EVN của kỳ này.')
          : (isOverdue
            ? `Hạn là ${viDate(bill.readingDeadline)} (ngày admin phát hành hoá đơn). Số đọc muộn `
              + 'sẽ lệch với kỳ của hoá đơn nhà nước — ghi nốt ngay và cho chủ nhà biết vì sao trễ.'
            : 'Phải xong trong hôm nay. Để sang ngày mai thì chỉ số đọc được không còn khớp kỳ '
              + 'hoá đơn, chia cho khách sẽ sai.')}
      </Text>
    </View>
  );
};

const s = StyleSheet.create({
  box: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
  },
  today: { backgroundColor: '#FFFBEB', borderColor: '#F59E0B55' },
  overdue: { backgroundColor: '#FEF2F2', borderColor: '#EF444455' },
  done: { backgroundColor: '#F0FDF4', borderColor: '#16A34A33' },

  title: { fontSize: 14, fontWeight: '800' },
  todayTitle: { color: '#B45309' },
  overdueTitle: { color: '#B91C1C' },
  body: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginTop: 4 },
  doneText: { fontSize: 13, fontWeight: '700', color: '#15803D' },
});
