/**
 * ĐỐI CHIẾU MỘT TỜ HOÁ ĐƠN VỚI HỒ SƠ CĂN NHÀ — luật dùng chung cho phát hành lẻ và nhập lô.
 *
 * Trước đây mỗi màn tự viết một bộ luật: trang điện có, trang nước có, màn nhập .zip lại có
 * bản riêng (`rowBlocker`). Ba bản lệch nhau dần — cùng một tờ giấy, màn lẻ cho phát hành mà
 * màn lô báo đỏ. Nay chỉ còn một hàm `evaluateBill`, cả hai màn hiển thị đúng kết quả của nó.
 *
 * Mỗi mục kiểm trả về một `Check` có giọng (tone) rõ ràng:
 *   ok    — khớp hồ sơ / hợp lệ
 *   info  — đúng, nhưng có điều admin nên biết (vd khách dọn vào giữa kỳ)
 *   warn  — không chặn, nhưng phải nhìn lại (vd nhà chưa khai mã nên không đối chiếu được)
 *   block — chưa phát hành được, kèm câu nói rõ phải sửa ô nào
 *   idle  — chưa có gì để kiểm
 */
import { onlyDigits, periodProblem } from '@/utils/evnInvoiceParser';
import { firstPeriodNote, type UtilityCycle } from '@/services/utilityCycle';
import { meterReadingService, type SavedMeterReading } from '@/services/meterReading.service';
import type { KindConfig, UtilityKind } from './kinds';

export type Tone = 'ok' | 'info' | 'warn' | 'block' | 'idle';

export interface Check {
  tone: Tone;
  /** Nhãn ngắn cạnh ô nhập: "Khớp", "Lệch 88 kWh"… */
  label: string;
  /** Câu giải thích + cách gỡ. Chỉ hiện khi không phải `ok`. */
  detail?: string;
}

/** Số liệu admin đang soát cho một tờ hoá đơn — mọi số là chuỗi chữ số. */
export interface BillDraft {
  customerCode: string;
  /** Chỉ số cũ IN TRÊN GIẤY. */
  paperPrev: string;
  /** Chỉ số mới IN TRÊN GIẤY — để trống thì hệ thống tự tính = cũ + tiêu thụ. */
  paperNew: string;
  qty: string;
  amount: string;
  period: string;
}

export const EMPTY_DRAFT: BillDraft = {
  customerCode: '', paperPrev: '', paperNew: '', qty: '', amount: '', period: '',
};

export interface EvalContext {
  cfg: KindConfig;
  wholeHouse: boolean;
  storedCode?: string | null;
  /** Bối cảnh chỉ số của nhà nguyên căn. `undefined` khi chưa tra xong. */
  cycle?: UtilityCycle | null;
  cycleLoading?: boolean;
  month: number;
  year: number;
  /** Nhà chia phòng: tổng tiêu thụ của các phòng sẽ được phát hành lần này. */
  roomPendingQty?: number | null;
  /** Tổng tiêu thụ trên hoá đơn kỳ trước — để bắt đọc dư/thiếu một chữ số. */
  lastQty?: number | null;
  /** Tổng tiêu thụ in ở chỗ khác trên CÙNG tờ giấy (`BillReadout.otherTotals`). */
  paperOtherTotals?: string[] | null;
}

export interface BillEvaluation {
  code: Check;
  /** `null` = không áp dụng (nhà chia phòng — quản lý ghi từng phòng). */
  prev: Check | null;
  next: Check | null;
  qty: Check;
  amount: Check;
  period: Check;
  /** Hai số sẽ gửi lên máy chủ (chỉ nguyên căn). */
  sendPrev: number | null;
  sendNew: number | null;
  /** Chỉ số mới tự tính = cũ + tiêu thụ — làm placeholder cho ô chỉ số mới. */
  computedNew: number | null;
  unitPrice: number;
  /** Những mục đang chặn, theo thứ tự trên màn hình — dùng cho câu tóm tắt cạnh nút. */
  blockers: { field: string; label: string }[];
  ready: boolean;
}

const vn = (n: number) => n.toLocaleString('vi-VN');
const toNum = (s: string): number | null => (s === '' ? null : Number(onlyDigits(s)));

// ─── Mã khách hàng ─────────────────────────────────────────────────────────────

/**
 * Chuẩn hoá GIỐNG HỆT máy chủ (`UtilityCustomerCodeHelper.normalize`): bỏ mọi ký tự không
 * phải chữ-số rồi hạ chữ thường. Lệch cách chuẩn hoá là màn hình khoe "khớp" xong máy chủ
 * vẫn chặn — tệ hơn hẳn việc không so gì cả.
 */
export const normCode = (s?: string | null) => (s ?? '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
export const showCode = (s?: string | null) => normCode(s).toUpperCase();

/**
 * Chọn mã trên giấy trong các ứng viên hai bộ đọc trả về.
 *
 * Ứng viên nào trùng mã hồ sơ thì lấy luôn — đọc ra đúng từng ký tự của mã đã lưu là bằng
 * chứng mạnh nhất có thể. Không ai trùng thì lấy ứng viên đứng đầu để admin thấy và sửa.
 */
export const pickPaperCode = (candidates: string[], stored?: string | null): string => {
  const want = normCode(stored);
  const hit = want ? candidates.find(c => normCode(c) === want) : undefined;
  return showCode(hit ?? candidates.find(c => normCode(c)) ?? '');
};

export const checkCode = (paper: string, stored: string | null | undefined, cfg: KindConfig): Check => {
  const expected = normCode(stored);
  const actual = normCode(paper);
  const label = cfg.codeLabel.toLowerCase();
  /*
    Nhà chưa khai mã: máy chủ bỏ qua đối chiếu nên không được chặn — nhưng PHẢI nói ra.
    Im lặng thì "đã kiểm, không sao" và "không kiểm gì cả" trông y hệt nhau, và một mã sai
    hiển nhiên vẫn đi qua như mã đúng (đã mất thời gian thật vì chuyện này, 11/09/2026).
  */
  if (!expected) {
    return {
      tone: 'warn',
      label: 'Không đối chiếu được',
      detail: `Nhà chưa khai ${label} nên hệ thống không bắt được hoá đơn gắn nhầm nhà. `
        + 'Bổ sung mã bằng cách nhập lại file Khởi tạo nhà.',
    };
  }
  if (!actual) {
    return {
      tone: 'block',
      label: 'Chưa có mã trên giấy',
      detail: `Nhập ${label} in trên tờ hoá đơn — máy chủ bắt buộc đối chiếu với hồ sơ (${showCode(stored)}).`,
    };
  }
  if (actual === expected) return { tone: 'ok', label: 'Khớp hồ sơ' };
  return {
    tone: 'block',
    label: 'Lệch hồ sơ',
    detail: `Giấy ghi ${actual.toUpperCase()}, hồ sơ là ${expected.toUpperCase()}. Máy đọc lệch thì sửa ô bên cạnh `
      + '(số 0 hay bị đọc thành chữ O); còn nếu giấy đúng là mã khác thì đang chọn nhầm nhà hoặc tải nhầm ảnh.',
  };
};

// ─── Đánh giá cả tờ hoá đơn ───────────────────────────────────────────────────

export const evaluateBill = (d: BillDraft, ctx: EvalContext): BillEvaluation => {
  const { cfg, wholeHouse, cycle } = ctx;
  const unit = cfg.unit;
  const qty = toNum(d.qty);
  const amount = toNum(d.amount);
  const unitPrice = qty && amount ? cfg.unitPrice(amount, qty) : 0;

  const code = checkCode(d.customerCode, ctx.storedCode, cfg);

  // ── Tiêu thụ ──
  let qtyCheck: Check;
  if (!qty) {
    qtyCheck = { tone: 'block', label: 'Chưa có', detail: `Nhập tổng ${unit} tiêu thụ in trên giấy.` };
  } else if (!wholeHouse && ctx.roomPendingQty != null && ctx.roomPendingQty > 0) {
    /*
      Nhà chia phòng: tổng các phòng đã chốt KHÔNG được vượt tờ giấy — máy chủ chặn cả lô
      (`ROOM_SUM_EXCEEDS_BILL`, có nới một tỉ lệ nhỏ). Nói trước thì admin biết là đọc sai
      tổng trên giấy hay quản lý chốt sai một phòng, thay vì bấm rồi mới ăn lỗi.
    */
    const pct = Math.round((ctx.roomPendingQty / qty) * 100);
    qtyCheck = ctx.roomPendingQty > qty
      ? {
          tone: 'warn',
          label: `Các phòng ${vn(ctx.roomPendingQty)} > giấy`,
          detail: `Các phòng đã chốt cộng lại ${vn(ctx.roomPendingQty)} ${unit}, nhiều hơn tổng trên giấy (${vn(qty)} ${unit}). `
            + 'Máy chủ sẽ từ chối nếu vượt quá ngưỡng cho phép — kiểm lại tổng trên giấy hoặc chỉ số phòng.',
        }
      : { tone: 'ok', label: `Các phòng dùng ${pct}%` };
  } else if (ctx.lastQty && ctx.lastQty > 0 && (qty > ctx.lastQty * 3 || qty * 3 < ctx.lastQty)) {
    /*
      So với kỳ trước: tiêu thụ thật có lên xuống (mùa nóng bật điều hoà), nhưng gấp hay
      bằng một phần ba kỳ trước thì gần như luôn là đọc dư/thiếu một chữ số. Chỉ nhắc,
      không chặn — nhà mới ở đủ tháng sau kỳ đầu lẻ vài ngày cũng nhảy kiểu này thật.
    */
    const ratio = qty / ctx.lastQty;
    qtyCheck = {
      tone: 'warn',
      label: ratio > 1 ? `Gấp ${vn(Math.round(ratio * 10) / 10)} lần kỳ trước` : 'Thấp bất thường',
      detail: `Kỳ trước ${vn(ctx.lastQty)} ${unit}, kỳ này ${vn(qty)} ${unit}. Kiểm lại xem có đọc dư hoặc thiếu một chữ số không.`,
    };
  } else if (ctx.lastQty && ctx.lastQty > 0) {
    const pct = Math.round(((qty - ctx.lastQty) / ctx.lastQty) * 100);
    qtyCheck = { tone: 'ok', label: pct === 0 ? 'Bằng kỳ trước' : `${pct > 0 ? '+' : '−'}${Math.abs(pct)}% so kỳ trước` };
  } else {
    qtyCheck = { tone: 'ok', label: '' };
  }

  /*
    Tờ giấy tự mâu thuẫn: EVN in tổng ở hai chỗ (dưới bảng chỉ số và trong bảng tiền), hai
    chỗ lệch nhau. Bộ đọc lấy số khớp bảng chỉ số, nhưng admin phải được biết là còn một
    số khác — không chặn, vì số kia có khi chính là chỗ OCR đọc hỏng.
  */
  const otherTotals = [...new Set((ctx.paperOtherTotals ?? []).map(Number))]
    .filter((n) => n > 0 && n !== qty);
  if (qty && otherTotals.length > 0 && qtyCheck.tone !== 'block') {
    qtyCheck = {
      tone: 'warn',
      label: 'Giấy in 2 tổng khác nhau',
      detail: `Tờ giấy còn in tổng ${otherTotals.map(vn).join(', ')} ${unit} ở chỗ khác, lệch với ${vn(qty)} ${unit} đang điền. `
        + 'Hệ thống lấy số khớp bảng chỉ số (mới − cũ). Soi lại ảnh xem số nào đúng trước khi phát hành.',
    };
  }

  // ── Tổng tiền + đơn giá ──
  let amountCheck: Check;
  if (!amount) {
    amountCheck = { tone: 'block', label: 'Chưa có', detail: 'Nhập "Tổng tiền thanh toán" in trên giấy (đã gồm thuế, phí).' };
  } else if (unitPrice > 0 && (unitPrice < cfg.priceFloor || unitPrice > cfg.priceCeil)) {
    amountCheck = {
      tone: 'warn',
      label: 'Đơn giá bất thường',
      detail: `Ra ${vn(Math.round(unitPrice))}đ/${unit}, ngoài khoảng giá ${cfg.noun} thực tế `
        + `(${vn(cfg.priceFloor)}–${vn(cfg.priceCeil)}đ). Gần như chắc chắn đọc nhầm tổng ${unit} hoặc tổng tiền.`,
    };
  } else {
    amountCheck = { tone: 'ok', label: '' };
  }

  // ── Kỳ ──
  let periodCheck: Check;
  const periodIssue = periodProblem(d.period);
  if (periodIssue) {
    periodCheck = { tone: 'block', label: 'Sai định dạng', detail: periodIssue };
  } else {
    /*
      Không so bằng với kỳ trọn tháng: kỳ thật là chu kỳ chốt số (07/08 – 06/09) nên hiếm
      khi trùng chuỗi. Chỉ soi xem có nhắc tới tháng/năm đang phát hành không — ảnh của kỳ
      khác hẳn (vd 07/04 – 06/05 khi đang làm kỳ 9) rơi vào đây.
    */
    const mm = String(ctx.month).padStart(2, '0');
    const raw = d.period.trim();
    const mentions = raw.includes(`/${mm}`) || raw.toLowerCase().includes(`tháng ${ctx.month}/`);
    periodCheck = mentions && raw.includes(String(ctx.year))
      ? { tone: 'ok', label: 'Đúng kỳ tiêu thụ' }
      : {
          tone: 'warn',
          label: `Không nhắc tới ${mm}/${ctx.year}`,
          detail: `Đang phát hành kỳ ${ctx.month}/${ctx.year} mà chuỗi kỳ không nhắc tới tháng đó — ảnh có thể là hoá đơn của kỳ khác.`,
        };
  }

  // ── Chỉ số (chỉ nguyên căn) ──
  let prev: Check | null = null;
  let next: Check | null = null;
  let sendPrev: number | null = null;
  let sendNew: number | null = null;
  let computedNew: number | null = null;

  if (wholeHouse) {
    const paperPrev = toNum(d.paperPrev);
    const close = cycle?.prevClose?.reading ?? null;

    if (ctx.cycleLoading) {
      prev = { tone: 'idle', label: 'Đang tra hồ sơ…' };
    } else if (close != null) {
      /*
        KỲ THỨ 2 TRỞ ĐI — số gửi đi là số CHỐT CỦA HỆ THỐNG, số trên giấy chỉ để đối chiếu.
        Hai số phải bằng nhau: lệch nghĩa là phần tiêu thụ ở giữa không nằm trên hoá đơn nào,
        không ai thu và về sau cũng không truy ra được. Nên lệch thì CHẶN.
      */
      sendPrev = close;
      if (paperPrev == null) {
        prev = {
          tone: 'block',
          label: 'Chưa có số trên giấy',
          detail: `Nhập chỉ số cũ in trên giấy để đối chiếu với số chốt kỳ trước (${vn(close)}).`,
        };
      } else if (paperPrev === close) {
        prev = { tone: 'ok', label: 'Nối liền kỳ trước' };
      } else {
        prev = {
          tone: 'block',
          label: `Lệch ${vn(Math.abs(paperPrev - close))} ${unit}`,
          detail: `Kỳ trước chốt ${vn(close)}, giấy kỳ này bắt đầu từ ${vn(paperPrev)} — phần ở giữa sẽ không nằm `
            + 'trên hoá đơn nào. Máy đọc nhầm thì sửa ô bên cạnh; nếu giấy đúng thì số chốt kỳ trước đang sai, cần xử lý trước.',
        };
      }
    } else {
      // KỲ ĐẦU (hoặc không tra được) — chưa có gì để nối, đi theo số trên giấy.
      sendPrev = paperPrev;
      if (paperPrev == null) {
        prev = { tone: 'block', label: 'Chưa có', detail: 'Nhập chỉ số đầu kỳ in trên giấy.' };
      } else if (cycle?.firstPeriod) {
        const note = firstPeriodNote(cycle, paperPrev, qty ?? 0);
        if (note?.kind === 'bad-prev') {
          prev = {
            tone: 'block',
            label: 'Có vẻ đọc sai',
            detail: `Thấp hơn mốc đón khách (${vn(note.handover)}) tới ${vn(note.handover - paperPrev)} ${unit} — `
              + 'nhiều hơn cả lượng tiêu thụ của kỳ. Soi lại số đầu kỳ trên ảnh.',
          };
        } else if (note?.kind === 'pre-move-in') {
          prev = {
            tone: 'info',
            label: `Công ty chịu ${vn(note.amount)} ${unit}`,
            detail: `Giấy tính từ ${vn(paperPrev)} nhưng khách nhận nhà ở mốc ${vn(note.handover)}: `
              + `${vn(note.amount)} ${unit} đầu kỳ là chi phí công ty, máy chủ tự trừ khi lập hoá đơn cho khách.`,
          };
        } else if (cycle.handover && paperPrev === Math.round(cycle.handover.reading)) {
          prev = { tone: 'ok', label: 'Khớp mốc đón khách' };
        } else {
          prev = { tone: 'ok', label: 'Kỳ đầu — theo giấy' };
        }
      } else {
        prev = {
          tone: 'warn',
          label: 'Không có số để so',
          detail: 'Không tra được chỉ số kỳ trước của nhà này — đang tin theo số trên giấy.',
        };
      }
    }

    computedNew = sendPrev != null && qty ? sendPrev + qty : null;
    const paperNew = toNum(d.paperNew);
    if (!prev || prev.tone === 'block' || prev.tone === 'idle') {
      next = { tone: 'idle', label: '' };
      sendNew = paperNew ?? computedNew;
    } else if (computedNew == null) {
      next = { tone: 'idle', label: 'Chờ tổng tiêu thụ' };
    } else if (paperNew == null) {
      /*
        Giấy không đọc được chỉ số mới thì TỰ TÍNH, không bắt gõ: máy chủ ép
        `mới − cũ = tổng tiêu thụ` (`CONSUMPTION_MISMATCH`), nên số đúng duy nhất là số này.
      */
      sendNew = computedNew;
      next = { tone: 'ok', label: 'Tự tính', detail: `= ${vn(sendPrev!)} + ${vn(qty!)}` };
    } else if (paperNew === computedNew) {
      sendNew = paperNew;
      next = { tone: 'ok', label: 'Khớp tiêu thụ' };
    } else {
      sendNew = paperNew;
      next = {
        tone: 'block',
        label: 'Không khớp tiêu thụ',
        detail: `Mới − cũ = ${vn(paperNew - sendPrev!)} ${unit}, nhưng tổng tiêu thụ là ${vn(qty!)} ${unit}. `
          + 'Một trong ba số bị đọc sai — soi lại ảnh rồi sửa đúng ô.',
      };
    }
  }

  const blockers: BillEvaluation['blockers'] = [];
  const push = (field: string, c: Check | null) => {
    if (c?.tone === 'block') blockers.push({ field, label: c.label });
  };
  push(cfg.codeLabel, code);
  push(`Chỉ số cũ`, prev);
  push(`Chỉ số mới`, next);
  push(`Tiêu thụ`, qtyCheck);
  push(`Tổng tiền`, amountCheck);
  push(`Kỳ hoá đơn`, periodCheck);
  // Chưa tra xong hồ sơ thì chưa phát hành — số gửi đi phụ thuộc vào nó.
  if (wholeHouse && ctx.cycleLoading) blockers.push({ field: 'Hồ sơ', label: 'Đang tra chỉ số kỳ trước' });

  return {
    code, prev, next,
    qty: qtyCheck, amount: amountCheck, period: periodCheck,
    sendPrev, sendNew, computedNew, unitPrice,
    blockers,
    ready: blockers.length === 0,
  };
};

/** Số mục KHÔNG chặn nhưng nên nhìn lại — để không khoe "khớp hồ sơ" khi còn lưu ý. */
export const warnCount = (ev: BillEvaluation): number =>
  [ev.code, ev.prev, ev.next, ev.qty, ev.amount, ev.period].filter((c) => c?.tone === 'warn').length;

// ─── Chỉ số từng phòng (nhà chia phòng) ───────────────────────────────────────

export type RoomState = 'pending' | 'issued' | 'missing';

export interface RoomReading extends SavedMeterReading {
  state: RoomState;
  consumption: number | null;
}

const periodIso = (month: number, year: number) => `${year}-${String(month).padStart(2, '0')}`;

/**
 * Bảng chỉ số quản lý đã chốt cho từng phòng — thứ sẽ thành hoá đơn khi admin phát hành.
 *
 * Máy chủ phát hành từ MỌI bản chốt CHƯA thành hoá đơn của nhà đó, không lọc theo kỳ. Điện
 * thì quản lý chốt đúng kỳ tiêu thụ nên hỏi một kỳ là đủ. Nước thì khác: quản lý chốt vào
 * hôm người ghi nước xuống và app lưu theo THÁNG CHỤP — hoá đơn kỳ 9 thường đi với bản chụp
 * đầu tháng 10. Nên nước hỏi cả kỳ này lẫn tháng sau rồi gộp theo phòng, ưu tiên bản còn
 * chờ phát hành (đúng thứ máy chủ sẽ dùng).
 */
export const loadRoomReadings = async (
  kind: UtilityKind, propertyId: number, month: number, year: number,
): Promise<RoomReading[]> => {
  const type = kind === 'WATER' ? 'WATER' : 'ELECTRICITY';
  const periods = [periodIso(month, year)];
  if (kind === 'WATER') {
    const nextMonth = new Date(year, month, 1); // month là 1-based → đây là tháng kế tiếp
    periods.push(periodIso(nextMonth.getMonth() + 1, nextMonth.getFullYear()));
  }
  const lists = await Promise.all(
    periods.map(p => meterReadingService.listSavedForPeriod(propertyId, p, type)),
  );

  const rank = (r: SavedMeterReading) =>
    r.newReading != null && r.invoiceId == null ? 2 : r.newReading != null ? 1 : 0;
  const byRoom = new Map<string, SavedMeterReading>();
  lists.forEach((list) => list.forEach((r) => {
    const key = String(r.roomId ?? r.contractId ?? r.roomNumber);
    const cur = byRoom.get(key);
    if (!cur || rank(r) > rank(cur)) byRoom.set(key, r);
  }));

  return [...byRoom.values()]
    .map((r): RoomReading => {
      const state: RoomState = r.invoiceId != null ? 'issued' : r.newReading != null ? 'pending' : 'missing';
      const consumption = r.newReading != null ? Number(r.newReading) - Number(r.prevReading) : null;
      return { ...r, state, consumption };
    })
    .sort((a, b) => String(a.roomNumber ?? '').localeCompare(String(b.roomNumber ?? ''), 'vi', { numeric: true }));
};

export interface RoomSummary {
  total: number;
  pending: number;
  issued: number;
  missing: number;
  pendingQty: number;
}

export const summarizeRooms = (rows: RoomReading[] | null): RoomSummary | null => {
  if (!rows) return null;
  const pendingRows = rows.filter(r => r.state === 'pending');
  return {
    total: rows.length,
    pending: pendingRows.length,
    issued: rows.filter(r => r.state === 'issued').length,
    missing: rows.filter(r => r.state === 'missing').length,
    pendingQty: pendingRows.reduce((s, r) => s + Math.max(0, r.consumption ?? 0), 0),
  };
};

// ─── Lỗi máy chủ ──────────────────────────────────────────────────────────────

/**
 * Câu báo lỗi phát hành — nói đúng ô cần sửa thay vì chép nguyên câu của máy chủ.
 * Mã lỗi nằm ở `data.code` (không phải `data.error` — đó là câu tiếng Việt).
 */
export const publishErrorMessage = (e: any, cfg: KindConfig): string => {
  const data = e?.response?.data;
  const code = data?.code;
  const label = cfg.codeLabel;
  if (code === 'CUSTOMER_CODE_MISMATCH') {
    return `${label} trên giấy không khớp hồ sơ (${showCode(data?.details?.expectedCustomerCode) || '—'}). `
      + 'Sửa ô mã rồi bấm lại — không cần quét lại ảnh.';
  }
  if (code === 'CUSTOMER_CODE_REQUIRED') {
    return `Nhà này đã khai ${label.toLowerCase()} — điền mã in trên giấy rồi bấm lại.`;
  }
  if (code === 'UTILITY_BILL_ALREADY_EXISTS' || code === 'EVN_BILL_ALREADY_EXISTS' || code === 'BILL_ALREADY_EXISTS') {
    return 'Kỳ này nhà đã có hoá đơn — thu hồi bản cũ ở bảng "Đã phát hành" nếu muốn làm lại.';
  }
  if (code === 'CONSUMPTION_MISMATCH') {
    return 'Chỉ số mới − chỉ số cũ phải bằng đúng tổng tiêu thụ trên giấy.';
  }
  if (code === 'ROOM_SUM_EXCEEDS_BILL') {
    return 'Tổng chỉ số các phòng đã chốt vượt tổng trên giấy — kiểm lại tổng tiêu thụ hoặc chỉ số từng phòng.';
  }
  if (code === 'INVOICE_ALREADY_EXISTS') {
    /*
      Nhà chia phòng: máy chủ lập hoá đơn từ MỌI bản chốt chưa gắn hoá đơn của nhà, kể cả bản
      cũ từ hồi phòng còn trống. Một phòng có hai bản như vậy thì bản thứ hai đụng bản thứ nhất
      trong cùng lượt → máy chủ huỷ CẢ NHÀ (03/10/2026, MTX#4 · MTX#5). Câu gốc "đã nhận hoá đơn"
      nghe như thành công — phải nói rõ là chưa có gì được tạo.
    */
    const said = String(data?.message || data?.error || '').trim().replace(/\.$/, '');
    return `Chưa phát hành nhà này — máy chủ báo "${said || 'trùng hoá đơn phòng'}" rồi huỷ cả lượt. `
      + 'Phòng đó còn bản chốt cũ chưa gắn hoá đơn nên bị tính hai lần trong cùng kỳ: lỗi dữ liệu phía máy chủ, sửa ở màn này không được.';
  }
  return data?.message || data?.error || e?.message || 'Không phát hành được hoá đơn.';
};
