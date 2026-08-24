import type { PropertyOccupancy, SlotState } from '@/services/propertyOccupancy.service';

/**
 * SỨC CHỨA MỘT CĂN NHÀ — các mảnh hiển thị dùng chung.
 *
 * Dùng ở ba nơi và phải giống hệt nhau ở cả ba: khối "Chỗ trống theo nhà" trên trang Hồ
 * sơ đón khách, ô chọn nhà trong form soạn hợp đồng, và bảng soát file lúc import Excel.
 * Cùng một câu hỏi ("căn này còn chỗ không") mà mỗi màn vẽ một kiểu thì người dùng phải
 * học lại từ đầu ở màn thứ hai.
 *
 * ─── Đã qua hai lần làm lại, ghi để đừng quay về ─────────────────────────────
 *
 * **Bản 1 — một câu chạy dài.** "0/4 phòng trống · 1 đang có khách · 3 chưa sẵn sàng".
 * Mọi thứ cùng cỡ chữ nên con số quan trọng nhất chìm giữa các con số phụ, và người đọc
 * phải tự cộng nhẩm mới biết chúng có khớp tổng số phòng không.
 *
 * **Bản 2 — thanh tỉ lệ + chú giải chấm tròn.** Đọc dễ hơn nhưng vẫn hỏng ở chỗ then
 * chốt: *còn mấy chỗ* KHÔNG BAO GIỜ hiện ra thành một con số. Muốn biết căn đó còn 0 chỗ
 * thì phải đọc cái nhãn nhỏ ở góc phải, hoặc tự cộng "3 + 1 = 4/4". Thanh tỉ lệ và nhãn
 * lại nói cùng một điều hai lần mà không cái nào nổi hơn, còn chữ "4 phòng" thì trôi lơ
 * lửng cuối hàng chú giải, đọc như một mục của chú giải.
 *
 * **Bản này — dẫn bằng con số.** Ngoài cùng bên trái là SỐ CHỖ CÒN NHẬN ĐƯỢC, cỡ lớn,
 * luôn ở cùng một vị trí trên mọi thẻ nên lướt dọc cả cột thì các con số thẳng hàng.
 * Bên phải là tên nhà + từng ô phòng + một dòng giải thích. Ô phòng thay cho thanh tỉ
 * lệ: đếm được nên tổng số phòng tự hiện ra, khỏi cần nhãn "N phòng" riêng.
 */

/** Trên ngưỡng này thì ô từng phòng nhỏ li ti — chuyển sang thanh tỉ lệ. */
const SQUARES_MAX = 16;

/** Thứ tự vẽ: chỗ dùng được trước, chỗ đã mất sau — trái sang phải là "vơi dần". */
const SEGMENT_ORDER: SlotState[] = ['AVAILABLE', 'HAS_DRAFT', 'RENTED', 'MAINTENANCE', 'DRAFT'];

const SEGMENT: Record<SlotState, { fill: string; label: string }> = {
  // Xanh lá = chỗ còn nhận được khách. Màu DUY NHẤT mang nghĩa "dùng được".
  AVAILABLE: { fill: 'bg-emerald-500', label: 'trống' },
  // Hổ phách = đã có người chờ dọn vào.
  HAS_DRAFT: { fill: 'bg-amber-400', label: 'chờ đón khách' },
  // Xanh dương = đang có khách, khớp `roomStatusMap` bên cổng host. KHÔNG dùng xám: xám
  // đọc như hỏng/vô hiệu, trong khi phòng kín khách là tình trạng tốt nhất có thể.
  RENTED: { fill: 'bg-blue-400', label: 'đang thuê' },
  MAINTENANCE: { fill: 'bg-orange-400', label: 'bảo trì' },
  // Xám nhạt = phòng đã tạo nhưng chưa ai bật cho thuê. Xem `SLOT_LABEL` để biết vì sao
  // KHÔNG gọi là "chưa định giá" và vì sao nó không đồng nghĩa với "hết chỗ".
  DRAFT: { fill: 'bg-slate-300', label: 'chưa mở cho thuê' },
  OTHER: { fill: 'bg-slate-300', label: 'không khai thác' },
};

/** `notReady` gộp DRAFT + OTHER — gom lại thành một nhóm xám duy nhất cho gọn. */
const countOf = (o: PropertyOccupancy, s: SlotState): number => {
  switch (s) {
    case 'AVAILABLE': return o.available;
    case 'HAS_DRAFT': return o.heldByDraft;
    case 'RENTED': return o.rented;
    case 'MAINTENANCE': return o.maintenance;
    case 'DRAFT': return o.notReady;
    default: return 0;
  }
};

const segmentsOf = (o: PropertyOccupancy) =>
  SEGMENT_ORDER.map((s) => ({ s, n: countOf(o, s) })).filter((x) => x.n > 0);

/**
 * Ba tình trạng, KHÔNG phải hai.
 *
 * Bản đầu chỉ có "còn chỗ / hết chỗ", nên một căn 3 phòng mà cả 3 đều chưa được bật cho
 * thuê bị dán nhãn đỏ "hết chỗ" — đọc lên như đã kín khách, trong khi nhà đó chưa có ai
 * thuê cả. Sai hoàn toàn về mặt việc-phải-làm: "hết chỗ" nghĩa là đi tìm căn khác, còn
 * đây là lỗi kích hoạt phòng phía BE (xem `RoomsNotOpenedNote`).
 */
export type CapacityTone = 'ok' | 'full' | 'setup';

export const capacityTone = (o: PropertyOccupancy): CapacityTone => {
  if (o.wholeHouse) return o.wholeHouseTaken ? 'full' : 'ok';
  if (o.roomCount === 0) return 'setup';
  if (o.available > 0) return 'ok';
  // Không còn chỗ nhưng KHÔNG phải vì kín khách — chưa ai mở phòng nào ra cho thuê.
  return o.rented === 0 && o.heldByDraft === 0 ? 'setup' : 'full';
};

/** Viền + nền thẻ. Đỏ chỉ dành cho "hết chỗ thật", không dùng cho nhà chưa mở phòng. */
export const TONE_CARD: Record<CapacityTone, string> = {
  ok: 'border-slate-200 bg-white',
  full: 'border-rose-200 bg-rose-50/40',
  setup: 'border-amber-200 bg-amber-50/40',
};

const TONE_STAT: Record<CapacityTone, string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  full: 'bg-rose-50 text-rose-700 ring-rose-200',
  setup: 'bg-amber-50 text-amber-700 ring-amber-200',
};

const TONE_NUMBER: Record<CapacityTone, string> = {
  ok: 'text-emerald-600',
  full: 'text-rose-600',
  setup: 'text-amber-600',
};

/**
 * KHỐI SỐ — số chỗ còn nhận được khách.
 *
 * Bề rộng cố định và luôn nằm ngoài cùng bên trái để các con số thẳng hàng khi lướt dọc
 * cả cột. Đây là thứ đọc trước tiên, và với phần lớn trường hợp là thứ duy nhất cần đọc.
 *
 * Nguyên căn cũng đi qua đây với 1 hoặc 0 — coi cả căn là MỘT chỗ. Nhờ vậy hai loại nhà
 * đọc theo cùng một cách thay vì nguyên căn thành một kiểu hiển thị khác hẳn.
 *
 * ─── Hai biến thể, vì hai ngữ cảnh khác nhau ─────────────────────────────────
 * `compact` (mặc định là false) dùng cho BẢNG. Trong bảng, cột đã có tiêu đề
 * "Phòng · chỗ trống" nên in lại chữ "CHỖ TRỐNG" ở từng ô là thừa; mà cái hộp có nền +
 * viền lặp lại 20 dòng thì nặng mắt, và nhãn hai chữ bị ép xuống hai dòng trong hộp
 * 52px trông rất tệ. Ở bảng chỉ cần CON SỐ, tô màu theo tình trạng.
 *
 * Thẻ (không `compact`) thì vẫn cần hộp: thẻ không có tiêu đề cột nào để dựa vào, con số
 * trần sẽ không biết là số gì. Hộp cũng là thứ neo mắt khi lướt qua lưới thẻ.
 */
export const CapacityStat = ({ occ, compact }: {
  occ: PropertyOccupancy;
  compact?: boolean;
}) => {
  const tone = capacityTone(occ);

  if (compact) {
    return (
      <span
        className={`w-7 shrink-0 text-right text-xl font-black tabular-nums ${TONE_NUMBER[tone]}`}
        title={`${occ.available} chỗ còn nhận được khách`}
      >
        {occ.available}
      </span>
    );
  }

  return (
    <div className={`flex w-16 shrink-0 flex-col items-center justify-center rounded-lg py-1.5 ring-1 ${TONE_STAT[tone]}`}>
      <span className="text-2xl font-black leading-none tabular-nums">{occ.available}</span>
      {/* `whitespace-nowrap`: hai chữ này từng bị bẻ xuống hai dòng trong hộp hẹp. */}
      <span className="mt-0.5 whitespace-nowrap text-[9px] font-bold uppercase tracking-wide opacity-70">
        chỗ trống
      </span>
    </div>
  );
};

/**
 * TỪNG Ô MỘT PHÒNG.
 *
 * Đếm được nên tổng số phòng tự hiện ra — bỏ được chữ "N phòng" trôi nổi của bản trước.
 * Nhà nhiều phòng thì ô nhỏ quá, tự chuyển sang thanh tỉ lệ (xem `SQUARES_MAX`).
 */
export const RoomSquares = ({ occ }: { occ: PropertyOccupancy }) => {
  const segments = segmentsOf(occ);
  if (occ.wholeHouse || segments.length === 0) return null;

  if (occ.roomCount > SQUARES_MAX) {
    return (
      <div className="mt-1.5 flex h-2 gap-0.5 overflow-hidden rounded-full bg-slate-100">
        {segments.map(({ s, n }) => (
          <div key={s} className={SEGMENT[s].fill} style={{ flexGrow: n }}
            title={`${n} phòng ${SEGMENT[s].label}`} />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {segments.flatMap(({ s, n }) =>
        Array.from({ length: n }, (_, i) => (
          <span key={`${s}-${i}`} className={`h-2.5 w-2.5 rounded-sm ${SEGMENT[s].fill}`}
            title={`1 phòng ${SEGMENT[s].label}`} />
        )))}
    </div>
  );
};

/**
 * MỘT DÒNG GIẢI THÍCH cho các ô màu ở trên.
 *
 * Chỉ liệt kê trạng thái CÓ THẬT ở căn đó. Bỏ hẳn chấm tròn chú giải của bản trước: chấm
 * + chữ cho mỗi trạng thái làm dòng này dài gấp đôi, trong khi thứ tự chữ đã trùng thứ
 * tự ô màu nên đối chiếu được bằng mắt.
 */
export const CapacityBreakdown = ({ occ, waiting }: {
  occ: PropertyOccupancy;
  /** Số hồ sơ chờ đón — chỉ dùng cho nguyên căn, nơi không có ô phòng nào để đếm. */
  waiting?: number;
}) => {
  if (occ.wholeHouse) {
    return (
      <p className="mt-1.5 text-xs text-slate-500">
        Nhà nguyên căn
        {/* Hồ sơ nháp = mới ký, chưa dọn vào — khác hẳn đã có khách ở trong nhà. */}
        {occ.heldByDraft > 0 ? " · chờ đón khách" : occ.wholeHouseTaken ? " · đã có khách" : ""}
        {waiting && occ.heldByDraft === 0 ? ` · ${waiting} hồ sơ chờ đón` : ""}
      </p>
    );
  }

  if (occ.roomCount === 0) {
    return <p className="mt-1.5 text-xs font-semibold text-amber-700">Chưa tạo phòng nào</p>;
  }

  const parts = segmentsOf(occ)
    .filter(({ s }) => s !== 'AVAILABLE')
    .map(({ s, n }) => `${n} ${SEGMENT[s].label}`);

  return (
    <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
      {occ.roomCount} phòng
      {parts.length > 0 ? ` · ${parts.join(' · ')}` : ' · tất cả đều trống'}
    </p>
  );
};

/**
 * Dòng "hồ sơ nhà khai N phòng nhưng hệ thống có M".
 *
 * Luôn để CUỐI thẻ và gọn trong một dòng: đây là việc phải xử lý ngoài hệ thống (hỏi lại
 * chủ nhà), không phải thông tin cần khi đang xếp khách — không được tranh chỗ với con
 * số chỗ trống ở trên.
 */
export const RoomCountMismatchNote = ({ occ }: { occ: PropertyOccupancy }) => {
  if (!occ.roomCountMismatch) return null;
  return (
    <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] font-semibold leading-relaxed text-amber-700">
      ⚠️ Hồ sơ khai {occ.declaredRooms} phòng · hệ thống có {occ.roomCount}
    </p>
  );
};

/**
 * NHÀ ĐÃ HOẠT ĐỘNG NHƯNG CÒN PHÒNG KẸT `DRAFT` — lỗi phía BE, không phải việc admin quên.
 *
 * ─── Quy trình đúng ──────────────────────────────────────────────────────────
 * Host duyệt giá → nhà tự gán cho quản lý khu vực → nhà sang `ACTIVE` → **phòng tự
 * chuyển `DRAFT` → `AVAILABLE`**. Không có thao tác tay nào. BE làm đúng việc đó bằng
 * `PropertyOnboardingServiceImpl.activateDraftRoomsPerRoom`.
 *
 * ─── Lỗi thật (đọc BE 24/08/2026) ────────────────────────────────────────────
 * Có BỐN đường đưa nhà sang `ACTIVE`. Ba đường gọi `activateDraftRoomsPerRoom`:
 * `hostConfirm`, `confirmPerRoom`, và nhánh heal trong `assignOperationManager`.
 *
 * Đường thứ tư — **xác nhận hoàn thành cải tạo** — thì KHÔNG:
 *
 *     } else if (property.getOperationManagerId() != null) {
 *         property.setStatus(PropertyStatus.ACTIVE);   // set ACTIVE rồi thôi
 *     }
 *     return mapPropertyResponse(propertyRepository.save(property), ...);
 *
 * Nên mọi nhà CHIA PHÒNG CÓ CẢI TẠO đều ra `ACTIVE` với toàn bộ phòng còn `DRAFT`, dù
 * giá đã có đủ. Nhà không cải tạo đi đường `hostConfirm` nên không dính.
 *
 * ─── Vì sao KHÔNG bày nút "mở phòng" cho admin ───────────────────────────────
 * Bản đầu của khối này có nút gọi `PATCH /rooms/{id}/status` set thẳng `AVAILABLE`.
 * Bỏ, vì hai lẽ: (1) nó hợp thức hoá một bước không thuộc quy trình, (2) nó **đi vòng
 * qua hai guard** mà `activateDraftRoomsPerRoom` vẫn kiểm — phòng phải có giá và có
 * `depreciationResult`. Bấm vào là cho thuê được phòng chưa qua kiểm giá.
 *
 * Đường chữa an toàn là gọi lại `assignOperationManager` với chính quản lý hiện tại:
 * nhánh heal ở đó chạy `activateDraftRoomsPerRoom` và vẫn tôn trọng đủ guard.
 *
 * Xem doc-be/BE-BUG-cai-tao-xong-khong-mo-phong-2026-08-24.md.
 */
export const RoomsNotOpenedNote = ({ occ }: { occ: PropertyOccupancy }) => {
  // Nhà chưa ACTIVE thì phòng còn DRAFT là ĐÚNG quy trình, không phải chuyện bất thường.
  if (occ.wholeHouse || occ.propertyStatus !== 'ACTIVE' || occ.notReady === 0) return null;

  /*
    MỘT dòng, không hai. Bản trước viết cả đoạn giải thích nguyên nhân + cách xử lý ngay
    trong ô của bảng, làm dòng đó cao gấp ba dòng thường và kéo cả bảng giãn ra. Lời giải
    thích dài thuộc về `title` (rê chuột) và doc BE, không thuộc về một ô bảng.
  */
  return (
    <p
      className="mt-2 border-t border-amber-200 pt-2 text-[11px] font-semibold leading-snug text-amber-800"
      title={
        'Nhà có cải tạo bị sót bước mở phòng lúc chuyển sang hoạt động — lỗi phía máy chủ, '
        + 'không phải do thiếu thao tác. Gán lại quản lý cho nhà này sẽ kích hoạt phòng.'
      }
    >
      ⚠️ {occ.notReady} phòng chưa được kích hoạt — lỗi máy chủ, gán lại quản lý để mở.
    </p>
  );
};
