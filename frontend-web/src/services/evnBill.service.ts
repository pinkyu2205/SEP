import api from './api';

/**
 * HOÁ ĐƠN ĐIỆN EVN — phần của Admin.
 *
 * Vì sao có: trước 13/08/2026 chính manager là người chụp hoá đơn EVN rồi tự nhập tổng
 * kWh / tổng tiền trên app. Hai vấn đề: (1) mỗi manager đọc một kiểu nên đơn giá điện
 * của cùng một nhà lệch nhau giữa các kỳ, (2) không ai đối chiếu được số manager nhập
 * với hoá đơn gốc. Chốt mới: ADMIN là người tải hoá đơn EVN lên, hệ thống tính đơn giá
 * (tổng tiền ÷ tổng kWh) rồi đẩy xuống cho manager dùng — manager KHÔNG sửa được số này.
 *
 * Sau khi admin phát hành:
 *   • Nhà nguyên căn  → manager bấm gửi thẳng cho khách (tiền = đúng tổng hoá đơn EVN).
 *   • Nhà theo phòng  → manager chụp đồng hồ từng phòng, ghi chỉ số, hệ thống nhân với
 *                       đơn giá admin đã chốt rồi gửi từng phòng.
 * Nước KHÔNG đổi — manager vẫn tự nhập hoá đơn nước như cũ.
 *
 * ⚠️ BE CHƯA CÓ các endpoint dưới đây — FE gọi sẵn theo hợp đồng kỳ vọng, giống cách
 * rent-invoices đang làm. Xem doc/BE-HANDOFF-evn-bill-admin-2026-08-13.md.
 * Riêng POST /api/v1/ocr/evn-bill thì BE ĐÃ CÓ (mobile đang dùng), tái sử dụng luôn.
 */

const ADMIN = '/api/v1/admin';

/**
 * ─── ĐỔI ROUTE 18/08/2026: `/admin/evn-bills` → `/admin/utility-bills?type=ELECTRIC` ───
 *
 * File này viết trước theo contract ĐỀ XUẤT (`/admin/evn-bills`), nhưng BE chọn cách
 * khác: gộp điện và nước vào MỘT endpoint `/admin/utility-bills`, phân biệt bằng `type`
 * (`AdminUtilityBillController`). Không có route `evn-bills` nào trong BE — nên mọi lần
 * admin bấm phát hành đều nhận 404 "Route không tồn tại".
 *
 * Bên nước (`waterBill.service.ts`) đã đi đúng route này từ đầu, đó là lý do trang nước
 * chạy được trong khi trang điện thì không.
 *
 * BE dùng tên field trung tính `totalQuantity` cho cả kWh và m³; FE điện vẫn giữ tên
 * `totalKwh` cho dễ đọc nên phải map hai chiều ở `toEvnBill` / lúc gửi lên.
 */
const BASE = `${ADMIN}/utility-bills`;
const TYPE = 'ELECTRIC';

/** Hoá đơn EVN admin đã phát hành cho 1 nhà trong 1 kỳ. */
export interface EvnBill {
  id: number;
  propertyId: number;
  propertyName?: string;
  /** Chuỗi hiển thị, vd "01/08 – 31/08/2026". Là khoá kỳ mà manager đối chiếu. */
  billingPeriod: string;
  /** Tháng/năm dạng số — để BE chặn trùng kỳ và FE lọc nhanh. */
  month: number;
  year: number;
  totalKwh: number;
  totalAmount: number;
  /** BE tự tính = totalAmount / totalKwh, làm tròn. FE không gửi lên. */
  unitPrice?: number;
  /** Ảnh hoá đơn gốc trên Cloudinary — manager xem lại để đối chiếu. */
  imageUrl?: string | null;
  /** PUBLISHED = manager thấy và dùng được; REVOKED = admin đã thu hồi. */
  status?: 'PUBLISHED' | 'REVOKED';
  /**
   * TIẾN ĐỘ GHI CHỈ SỐ của nhà chia phòng — BE trả sẵn trong `UtilityBillResponse` từ
   * 17/08/2026, FE trước đây không khai nên dữ liệu về rồi bị bỏ.
   *
   * Đây mới là thứ admin cần sau khi phát hành: hoá đơn tổng chỉ là ĐẦU VÀO, tiền chỉ
   * thật sự tới khách khi quản lý đi đọc đủ đồng hồ từng phòng. Không có hai con số này
   * thì bảng "đã phát hành" chỉ nói được "tôi đã bấm gửi", không nói được việc đã xong.
   *
   * Nhà nguyên căn: `roomsTotal = 0` — hoá đơn đi thẳng tới khách, không có gì phải chờ.
   */
  roomsTotal?: number;
  roomsDone?: number;
  /** Hạn quản lý phải chụp xong trong ngày (`yyyy-MM-dd`). Null với nguyên căn. */
  readingDeadline?: string | null;
  /** Quá hạn mà chưa ghi đủ phòng. */
  overdue?: boolean;
  createdBy?: string;
  createdAt?: string;
}

export interface CreateEvnBillInput {
  propertyId: number;
  billingPeriod: string;
  month: number;
  year: number;
  totalKwh: number;
  totalAmount: number;
  imageUrl?: string;
  /**
   * Chỉ số công tơ CŨ / MỚI in trên giấy EVN — chỉ có nghĩa với NHÀ NGUYÊN CĂN.
   *
   * BE (bản 2 luồng) dùng luôn hai số này để TỰ phát hành hoá đơn cho khách thuê trong
   * cùng transaction, nên FE không phải gọi thêm `createForWholeHouse`. BE bản cũ bỏ qua
   * hai field này (Jackson mặc định không lỗi với field lạ) nên gửi kèm là an toàn cho
   * cả hai bản — xem chú thích ở chỗ gọi trong EvnBillPublishing.
   */
  prevReading?: number;
  newReading?: number;
}

/** Kết quả OCR ảnh hoá đơn EVN (BE: OcrEvnBillResponse, endpoint đã có sẵn). */
export interface OcrEvnBillResponse {
  rawText?: string;
  numbers?: string[];
  totalKwh?: number;
  totalAmount?: number;
  billingPeriod?: string;
}

/**
 * Bóc danh sách khỏi mọi dạng bọc BE có thể trả: mảng trần, `{items}`, `{content}`
 * (Spring `Page`) hoặc `{data}`.
 *
 * BUG 13/08/2026: bản đầu viết `return rows ?? []` với giả định BE trả MẢNG TRẦN. BE trả
 * dạng bọc nên `rows` là một object — không null nên `?? []` không cứu được, `bills.length`
 * thành `undefined`, bảng "Đã phát hành" luôn hiện "Chưa phát hành hoá đơn nào" DÙ bản ghi
 * có thật (bấm gửi lại thì BE báo 409 "Đã tồn tại hoá đơn EVN cho kỳ này", và app manager
 * đọc được bình thường vì service mobile đã bóc đúng từ đầu).
 *
 * Rút ra: đừng đoán dạng response, bóc hết mọi dạng.
 */
/**
 * `UtilityBillResponse` (BE) → `EvnBill` (FE). Chỉ khác nhau ở tên trường số lượng.
 * Giữ nguyên mọi field khác, kể cả 4 field nhiệm vụ ghi chỉ số BE thêm 17/08/2026.
 */
const toEvnBill = (row: any): EvnBill => ({
  ...row,
  totalKwh: row?.totalKwh ?? row?.totalQuantity ?? 0,
});

const unwrapList = <T,>(d: unknown): T[] => {
  if (Array.isArray(d)) return d as T[];
  const o = d as { items?: T[]; content?: T[]; data?: T[] } | null | undefined;
  return o?.items ?? o?.content ?? o?.data ?? [];
};

/**
 * ⚠️ `api` đã bóc `.data` trong response interceptor, nên các hàm dưới trả THẲNG payload.
 * Viết `const { data } = await evnBillService.list()` là bóc hai lần → undefined.
 */
export const evnBillService = {
  /** OCR ảnh hoá đơn đã upload Cloudinary. Best-effort — admin luôn phải soát lại. */
  ocr: (imageUrl: string): Promise<OcrEvnBillResponse> =>
    api.post<unknown, OcrEvnBillResponse>('/api/v1/ocr/evn-bill', { imageUrl }),

  /**
   * Phát hành hoá đơn EVN cho 1 nhà.
   * BE phải IDEMPOTENT theo (propertyId, month, year): kỳ đó đã có bản PUBLISHED thì
   * trả 409 chứ đừng tạo thêm — hai bản cùng kỳ sẽ làm manager tính theo đơn giá khác nhau.
   */
  publish: async (input: CreateEvnBillInput): Promise<EvnBill> => {
    const { totalKwh, ...rest } = input;
    // BE nhận `totalQuantity` (dùng chung cho kWh/m³) — xem ghi chú ở BASE.
    const row = await api.post<unknown, any>(BASE, {
      ...rest, type: TYPE, totalQuantity: totalKwh,
    });
    return toEvnBill(row);
  },

  list: async (params?: { propertyId?: number; month?: number; year?: number }): Promise<EvnBill[]> => {
    const raw = await api.get<unknown, unknown>(BASE, { params: { ...params, type: TYPE } });
    return unwrapList<any>(raw).map(toEvnBill);
  },

  /**
   * Danh sách đã phát hành của MỘT KỲ, gộp từ nhiều nhà.
   *
   * ⚠️ VÁ TẠM CHO BUG BE (13/08/2026): `GET /admin/evn-bills` BẮT BUỘC có `propertyId`
   * — thiếu nó thì trả `[]` bất kể month/year, dù bản ghi có thật (POST trùng trả 409,
   * và gọi lại đúng `?propertyId=` thì thấy ngay). Nên không lấy được "tất cả nhà"
   * bằng một request; phải hỏi từng nhà rồi gộp.
   *
   * Chạy theo lô để không bắn hàng trăm request cùng lúc làm nghẽn cả trình duyệt lẫn BE.
   * Nhà nào lỗi thì bỏ qua nhà đó, không làm hỏng cả bảng.
   *
   * BỎ HÀM NÀY khi BE cho `propertyId` thành tuỳ chọn — xem
   * doc/BE-HANDOFF-evn-bill-admin-2026-08-13.md.
   */
  listForPeriod: async (
    propertyIds: number[],
    month: number,
    year: number,
    batchSize = 8,
  ): Promise<EvnBill[]> => {
    const out: EvnBill[] = [];
    for (let i = 0; i < propertyIds.length; i += batchSize) {
      const batch = propertyIds.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(propertyId =>
          api.get<unknown, unknown>(BASE, { params: { propertyId, month, year, type: TYPE } })
            .then((raw) => unwrapList<any>(raw).map(toEvnBill))
            .catch(() => [] as EvnBill[]),
        ),
      );
      results.forEach(rows => out.push(...rows));
    }
    return out;
  },

  /**
   * Thu hồi bản đã phát hành (admin nhập nhầm số).
   * BE nên CHẶN thu hồi khi đã có hoá đơn điện nào của kỳ đó gửi cho khách — thu hồi lúc
   * ấy chỉ tạo ra hoá đơn mồ côi tính theo đơn giá không còn tồn tại.
   */
  revoke: (id: number): Promise<void> =>
    api.delete<unknown, void>(`${BASE}/${id}`),
};

/** Đơn giá 1 kWh = tổng tiền EVN ÷ tổng kWh. EVN tính bậc thang nên không có sẵn đơn giá. */
export const evnUnitPrice = (totalAmount: number, totalKwh: number): number =>
  totalKwh > 0 ? Math.round(totalAmount / totalKwh) : 0;
