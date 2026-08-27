import { propertyService } from './property.service';
import type { PropertyResponse, RoomResponse, TenantContractResponse } from '@/types/api.types';

/**
 * SỨC CHỨA THẬT CỦA MỘT CĂN NHÀ — còn mấy phòng trống, mấy phòng đã kín.
 *
 * ─── Vì sao cần ──────────────────────────────────────────────────────────────
 * Luồng đón khách trước 24/08/2026 làm việc gần như MÙ về sức chứa: admin soạn hợp
 * đồng cho một căn nhà mà trên màn hình không có chỗ nào nói căn đó có mấy phòng,
 * mấy phòng đang có khách, còn mấy phòng nhận được khách mới. Ô chọn nhà chỉ hiện
 * tên + địa chỉ; phải chọn xong rồi mở ô "Phòng" ra mới biết là hết chỗ.
 *
 * Với import Excel thì còn nặng hơn: cả file đi thẳng lên BE, sai chỗ nào chỉ biết
 * sau khi BE trả về danh sách dòng bị bỏ.
 *
 * ─── Nguồn sự thật: PHÒNG, không phải `totalRooms` ───────────────────────────
 * `PropertyResponse.totalRooms` là con số KHAI BÁO trên hồ sơ nhà (host/admin gõ vào
 * lúc tạo). Danh sách phòng thật (`GET /properties/{id}/rooms`) mới là thứ hợp đồng
 * gắn vào được. Hai con số này LỆCH NHAU ĐƯỢC — và đó chính là tình huống "host khai
 * 6 phòng nhưng nhà chỉ dựng được 5": khai 6, tạo thật 5, dòng Excel thứ 6 trỏ vào
 * một phòng không tồn tại.
 *
 * Nên ở đây `roomCount` (đếm thật) và `declaredRooms` (khai báo) được giữ TÁCH NHAU,
 * và `roomCountMismatch` bật lên khi lệch. Gộp làm một là mất đúng cái tín hiệu cần.
 *
 * ─── Phòng "trống" không chỉ là status AVAILABLE ─────────────────────────────
 * Một phòng AVAILABLE nhưng đã có hợp đồng nháp chờ đón khách thì KHÔNG nhận thêm
 * khách nữa. BE chưa đổi status ở bước nháp (chỉ đổi khi khách nhận phòng thật), nên
 * phải tự trừ bằng danh sách nháp — giống cách `DraftContractFormModal` vẫn lọc
 * dropdown phòng.
 */

/** Trạng thái một chỗ ở, đã tính cả hợp đồng nháp đang giữ chỗ. */
export type SlotState = 'AVAILABLE' | 'RENTED' | 'MAINTENANCE' | 'DRAFT' | 'HAS_DRAFT' | 'OTHER';

/**
 * `DRAFT` = phòng ĐÃ TẠO NHƯNG CHƯA ĐƯỢC KÍCH HOẠT.
 *
 * Không phải "chưa định giá" — giá thường đã có từ lúc host duyệt. Quy trình đúng là nhà
 * sang `ACTIVE` thì BE tự chuyển mọi phòng `DRAFT` → `AVAILABLE`
 * (`PropertyOnboardingServiceImpl.activateDraftRoomsPerRoom`), không có thao tác tay nào.
 *
 * Phòng còn kẹt ở đây nghĩa là nhà đi qua nhánh **xác nhận hoàn thành cải tạo** — nhánh
 * duy nhất set `ACTIVE` mà quên gọi hàm trên. Đó là LỖI phía BE, không phải việc ai đó
 * quên bấm. Xem doc-be/BE-BUG-cai-tao-xong-khong-mo-phong-2026-08-24.md.
 *
 * Phân biệt cho đúng là quan trọng: một căn 3 phòng đều `DRAFT` thì KHÔNG phải "hết chỗ"
 * (nghe như đã kín khách, đi tìm căn khác) mà là dữ liệu hỏng cần báo BE.
 */
export const SLOT_LABEL: Record<SlotState, string> = {
  AVAILABLE: 'trống',
  RENTED: 'đang có khách',
  MAINTENANCE: 'đang bảo trì',
  DRAFT: 'chưa mở cho thuê',
  HAS_DRAFT: 'đã có hồ sơ chờ đón',
  OTHER: 'không khai thác',
};

export interface PropertyOccupancy {
  propertyId: number;
  propertyName: string;
  wholeHouse: boolean;
  /**
   * Trạng thái nhà (`ACTIVE`, `PENDING_HOST_REVIEW`, …).
   *
   * Cần để phân biệt hai lý do khiến một căn không có phòng nào mở cho thuê:
   *   • nhà CHƯA hoạt động → đúng quy trình, chưa tới lượt, không phải lỗi
   *   • nhà ĐÃ hoạt động   → BẤT THƯỜNG: host đã duyệt giá, đã có quản lý, mà phòng
   *     vẫn kẹt ở `DRAFT` nên không ai xếp khách vào được
   */
  propertyStatus: string;

  /** Số phòng ĐẾM THẬT từ API phòng. Nguyên căn = 0 (không chia phòng). */
  roomCount: number;
  /** `totalRooms` khai trên hồ sơ nhà — chỉ để đối chiếu, đừng dùng để tính chỗ trống. */
  declaredRooms: number;
  /** Khai báo lệch với thực tế → cảnh báo, xem chú thích đầu file. */
  roomCountMismatch: boolean;

  available: number;
  rented: number;
  maintenance: number;
  /** Phòng AVAILABLE nhưng đã có hồ sơ nháp giữ chỗ. */
  heldByDraft: number;
  /**
   * Phòng đã tạo nhưng chưa mở cho thuê (status `DRAFT`) — xem `SLOT_LABEL`.
   * Đây KHÔNG phải chỗ đã mất: bật lên là dùng được ngay.
   */
  notReady: number;

  /** Số phòng còn nhận được khách — dùng cho mọi câu "còn N chỗ". */
  availableRoomNumbers: string[];
  rooms: RoomResponse[];
  byRoomNumber: Map<string, { room: RoomResponse; state: SlotState }>;

  /** NGUYÊN CĂN: căn này đã có khách hoặc đã có hồ sơ nháp chờ đón → không nhận thêm. */
  wholeHouseTaken: boolean;
  /** Lấy được danh sách phòng không (false = API phòng lỗi, đừng kết luận gì). */
  loaded: boolean;
}

/** Chuẩn hoá số phòng để so khớp: "P.101 " và "101" phải ra cùng một chỗ. */
export const normalizeRoomNumber = (raw: unknown): string =>
  String(raw ?? '')
    .trim()
    .replace(/^(p|phong|phòng|room)[\s.\-_]*/i, '')
    .replace(/\s+/g, '')
    .toUpperCase();

/**
 * Trạng thái hiển thị của một phòng.
 *
 * THỨ TỰ XÉT QUAN TRỌNG: "đã có hồ sơ chờ đón" phải thắng status riêng của phòng
 * (trừ RENTED). Trước 24/08/2026 nhánh này xét `status` trước, nên một phòng còn ở
 * status DRAFT (chưa định giá) mà đã có hồ sơ đón khách thì bị đếm vào "chưa sẵn sàng"
 * — panel sức chứa hiện "3 chưa sẵn sàng" bên cạnh "3 hồ sơ đang chờ đón khách", cùng
 * ba phòng đó mà gọi bằng hai tên khác nhau, đọc vào không hiểu con số nào là con số nào.
 *
 * Về nghiệp vụ thì hồ sơ nháp mới là thứ quyết định: phòng đã có người chờ dọn vào thì
 * không nhận thêm khách được nữa, bất kể status nội bộ của nó là gì.
 */
const stateOf = (room: RoomResponse, draftRoomIds: Set<number>): SlotState => {
  if (room.status === 'RENTED') return 'RENTED';
  if (draftRoomIds.has(room.id)) return 'HAS_DRAFT';
  if (room.status === 'MAINTENANCE') return 'MAINTENANCE';
  if (room.status === 'DRAFT') return 'DRAFT';
  if (room.status === 'AVAILABLE') return 'AVAILABLE';
  return 'OTHER';
};

/**
 * Nguyên căn không có phòng — dựng bản tóm tắt riêng, đừng bắt nó chạy qua nhánh phòng.
 *
 * ─── Vì sao KHÔNG dùng `priceLocked` / `currentTenant` (sửa 24/08/2026) ──────
 * Bản trước coi căn là "đã có khách" khi `draft || currentTenant || priceLocked`. Hai vế
 * sau đều sai:
 *
 *   • `priceLocked` — BE đặt `= wholeHouse && (có HĐ ACTIVE **hoặc EXPIRED**)`
 *     (`PropertyServiceImpl.mapToResponse`). Hợp đồng hết hạn từ đời nào thì cờ này vẫn
 *     bật, nên một căn đang trống bị báo "đã có khách".
 *   • `currentTenant` — mapper của BE **không hề gán** field này, nó luôn undefined.
 *
 * Nay chỉ đi theo bằng chứng thật: có hợp đồng nháp giữ chỗ, hoặc nơi gọi truyền vào
 * danh sách căn đã bàn giao khách (`occupiedIds` — trang Tình trạng nhà lấy từ
 * `roomsHandedOver` của `handover-status`).
 */
const wholeHouseOccupancy = (
  p: PropertyResponse,
  heldByDraft: boolean,
  rented: boolean,
): PropertyOccupancy => {
  const taken = heldByDraft || rented;
  return {
    propertyId: p.id,
    propertyName: p.propertyName,
    propertyStatus: p.status,
    wholeHouse: true,
    roomCount: 0,
    declaredRooms: p.totalRooms ?? 0,
    roomCountMismatch: false,
    available: taken ? 0 : 1,
    rented: rented ? 1 : 0,
    maintenance: 0,
    // Tách hai lý do: "chờ đón khách" (mới ký hồ sơ) khác hẳn "đã có khách" (đã dọn vào).
    heldByDraft: heldByDraft && !rented ? 1 : 0,
    notReady: 0,
    availableRoomNumbers: [],
    rooms: [],
    byRoomNumber: new Map(),
    wholeHouseTaken: taken,
    loaded: true,
  };
};

const summarize = (
  p: PropertyResponse,
  rooms: RoomResponse[],
  draftRoomIds: Set<number>,
): PropertyOccupancy => {
  const byRoomNumber = new Map<string, { room: RoomResponse; state: SlotState }>();
  let available = 0, rented = 0, maintenance = 0, heldByDraft = 0, notReady = 0;
  const availableRoomNumbers: string[] = [];

  for (const room of rooms) {
    const state = stateOf(room, draftRoomIds);
    byRoomNumber.set(normalizeRoomNumber(room.roomNumber), { room, state });
    if (state === 'AVAILABLE') { available += 1; availableRoomNumbers.push(room.roomNumber); }
    else if (state === 'RENTED') rented += 1;
    else if (state === 'MAINTENANCE') maintenance += 1;
    else if (state === 'HAS_DRAFT') heldByDraft += 1;
    else notReady += 1;
  }

  const declaredRooms = p.totalRooms ?? 0;
  return {
    propertyId: p.id,
    propertyName: p.propertyName,
    propertyStatus: p.status,
    wholeHouse: false,
    roomCount: rooms.length,
    declaredRooms,
    // Chỉ coi là lệch khi hồ sơ có khai (>0). Khai 0 nghĩa là chưa ai điền, không phải sai.
    roomCountMismatch: declaredRooms > 0 && declaredRooms !== rooms.length,
    available, rented, maintenance, heldByDraft, notReady,
    availableRoomNumbers,
    rooms,
    byRoomNumber,
    wholeHouseTaken: false,
    loaded: true,
  };
};


/**
 * SỨC CHỨA TỪ CHÍNH `PropertyResponse` — không gọi thêm request nào.
 *
 * BE bổ sung `roomCount / availableRooms / rentedRooms / maintenanceRooms /
 * notOpenedRooms` vào mọi `PropertyResponse` (`PropertyOccupancyAssembler`, batch bằng
 * 2 câu query gộp — không N+1). Nên từ 24/08/2026 phần TỔNG HỢP không cần đi hỏi
 * `/properties/{id}/rooms` từng nhà nữa; cả khối nạp theo lô + thanh tiến độ trước đây
 * sinh ra chỉ để lách chỗ thiếu này.
 *
 * Ngữ nghĩa khớp đúng cái FE đang cần — `availableRooms` của BE **đã trừ** phòng bị hợp
 * đồng DRAFT/PENDING giữ chỗ (`countTrulyAvailableByPropertyIds`), y như `available` ở
 * đây. `heldByDraft` BE không trả riêng nên suy ngược từ phần dư.
 *
 * `rooms` / `byRoomNumber` để RỖNG: đây là bản tóm tắt. Chỗ nào cần từng phòng cụ thể
 * (soát file import) thì gọi `loadPropertyOccupancy(..., { withRooms: true })`.
 */
export const occupancyFromProperty = (
  p: PropertyResponse,
  opts?: { draftWholeHouse?: boolean; occupiedWholeHouse?: boolean },
): PropertyOccupancy => {
  if (p.wholeHouse === true) {
    return wholeHouseOccupancy(p, opts?.draftWholeHouse === true, opts?.occupiedWholeHouse === true);
  }

  const roomCount = p.roomCount ?? 0;
  const available = p.availableRooms ?? 0;
  const rented = p.rentedRooms ?? 0;
  const maintenance = p.maintenanceRooms ?? 0;
  const notReady = p.notOpenedRooms ?? 0;
  // Phần dư = phòng AVAILABLE nhưng đang bị hồ sơ nháp giữ. Kẹp ở 0 phòng khi BE có
  // thêm status lạ làm phép trừ ra âm.
  const heldByDraft = Math.max(0, roomCount - available - rented - maintenance - notReady);

  const declaredRooms = p.totalRooms ?? 0;
  return {
    propertyId: p.id,
    propertyName: p.propertyName,
    propertyStatus: p.status,
    wholeHouse: false,
    roomCount,
    declaredRooms,
    roomCountMismatch: declaredRooms > 0 && roomCount > 0 && declaredRooms !== roomCount,
    available, rented, maintenance, heldByDraft, notReady,
    availableRoomNumbers: [],
    rooms: [],
    byRoomNumber: new Map(),
    wholeHouseTaken: false,
    // `roomCount == null` nghĩa là BE bản cũ chưa trả số liệu → coi như chưa biết.
    loaded: p.roomCount != null,
  };
};

/**
 * Dựng sức chứa cho một loạt nhà — bản đồng bộ, KHÔNG gọi API.
 *
 * Dùng ở mọi chỗ chỉ cần con số tổng hợp: bảng Tình trạng nhà, khối chỗ trống ở Hồ sơ
 * đón khách, ô chọn nhà trong form soạn hợp đồng.
 */
export const buildOccupancyMap = (
  properties: PropertyResponse[],
  drafts: TenantContractResponse[],
  occupiedIds?: Set<number>,
): Map<number, PropertyOccupancy> => {
  const draftWholeHousePropertyIds = new Set<number>();
  for (const d of drafts) {
    if (d.roomId == null) draftWholeHousePropertyIds.add(d.propertyId);
  }
  return new Map(properties.map((p) => [p.id, occupancyFromProperty(p, {
    draftWholeHouse: draftWholeHousePropertyIds.has(p.id),
    occupiedWholeHouse: occupiedIds?.has(p.id) === true,
  })]));
};
/** Nhà chưa nạp được phòng — mọi con số để 0 và `loaded=false` để nơi hiển thị im lặng. */
const unloaded = (p: PropertyResponse): PropertyOccupancy => ({
  propertyId: p.id,
  propertyName: p.propertyName,
  propertyStatus: p.status,
  wholeHouse: p.wholeHouse === true,
  roomCount: 0,
  declaredRooms: p.totalRooms ?? 0,
  roomCountMismatch: false,
  available: 0, rented: 0, maintenance: 0, heldByDraft: 0, notReady: 0,
  availableRoomNumbers: [],
  rooms: [],
  byRoomNumber: new Map(),
  wholeHouseTaken: false,
  loaded: false,
});

/**
 * Nạp sức chứa cho một loạt nhà.
 *
 * Chạy theo lô để không bắn hàng chục request cùng lúc — cùng lý do với
 * `evnBillService.listForPeriod`. Nhà nào lỗi thì trả bản `loaded: false` chứ không
 * làm hỏng cả bảng: thiếu số liệu một căn còn hơn trắng màn hình.
 *
 * @param properties Các nhà cần tính (đã có sẵn ở nơi gọi, khỏi gọi lại API nhà).
 * @param drafts     Hợp đồng nháp đang chờ đón khách — dùng để trừ phòng đã giữ chỗ.
 */
export const loadPropertyOccupancy = async (
  properties: PropertyResponse[],
  drafts: TenantContractResponse[],
  batchSize = 6,
  /**
   * Gọi sau MỖI LÔ, kèm số nhà đã xong / tổng.
   *
   * Có để màn "Tình trạng nhà" (25+ nhà, mỗi nhà một request) vẽ dần thay vì ngồi im
   * chờ hết rồi mới hiện. Không truyền thì hành vi y như cũ.
   */
  onBatch?: (partial: Map<number, PropertyOccupancy>, done: number, total: number) => void,
  /**
   * Căn NGUYÊN CĂN đã bàn giao khách thật (không phải chỉ có hồ sơ nháp).
   *
   * Danh sách nhà của BE không có tín hiệu nào tin được cho việc này — `currentTenant`
   * luôn rỗng, `priceLocked` thì bật cả với hợp đồng đã hết hạn. Nên nơi nào biết thì
   * truyền vào: trang Tình trạng nhà lấy từ `roomsHandedOver` của `handover-status`.
   * Không truyền thì chỉ dựa vào hồ sơ nháp — thà thiếu còn hơn báo sai "đã có khách".
   */
  occupiedIds?: Set<number>,
): Promise<Map<number, PropertyOccupancy>> => {
  const draftRoomIds = new Set<number>();
  const draftWholeHousePropertyIds = new Set<number>();
  for (const d of drafts) {
    if (d.roomId != null) draftRoomIds.add(d.roomId);
    else draftWholeHousePropertyIds.add(d.propertyId);
  }

  const out = new Map<number, PropertyOccupancy>();
  const needRooms: PropertyResponse[] = [];

  for (const p of properties) {
    if (p.wholeHouse === true) {
      out.set(p.id, wholeHouseOccupancy(
        p,
        draftWholeHousePropertyIds.has(p.id),
        occupiedIds?.has(p.id) === true,
      ));
    } else {
      needRooms.push(p);
    }
  }

  for (let i = 0; i < needRooms.length; i += batchSize) {
    const batch = needRooms.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((p) =>
        propertyService.getRooms(p.id)
          .then((rooms) => summarize(p, Array.isArray(rooms) ? rooms : [], draftRoomIds))
          .catch(() => unloaded(p)),
      ),
    );
    results.forEach((o) => out.set(o.propertyId, o));
    // Bản sao mới mỗi lô: nơi gọi thường nhét thẳng vào state React, đưa cùng một
    // instance Map thì React so sánh thấy y hệt và không vẽ lại.
    onBatch?.(new Map(out), Math.min(i + batchSize, needRooms.length), needRooms.length);
  }

  return out;
};


/**
 * Nhãn ngắn nhét vừa một dòng `<option>` — chỉ phần admin cần để CHỌN nhà.
 *
 * Đây là chỗ DUY NHẤT còn dùng chữ thay vì thanh tỉ lệ: bên trong `<option>` không vẽ
 * được gì cả, mà quyết định chọn nhà nào lại diễn ra ngay tại đó. Vào form rồi mới biết
 * căn vừa chọn đã kín thì đã phải quay ra chọn lại.
 *
 * Trả chuỗi rỗng khi chưa nạp xong: `<option>` nhấp nháy đổi chữ giữa chừng khó chịu
 * hơn là hiện thiếu vài giây, và ô chọn vẫn dùng được bình thường trong lúc đó.
 */
export const occupancyChip = (o: PropertyOccupancy | undefined): string => {
  if (!o || !o.loaded) return '';
  if (o.wholeHouse) return o.wholeHouseTaken ? 'đã có khách' : 'còn trống';
  if (o.roomCount === 0) return 'chưa tạo phòng nào';
  if (o.available > 0) return `còn ${o.available}/${o.roomCount} phòng`;
  /*
    Hết chỗ vì KÍN KHÁCH và hết chỗ vì CHƯA MỞ PHÒNG là hai chuyện khác nhau — cùng lý do
    đã tách `capacityTone` thành ba mức. Chỗ này từng gọi cả hai là "hết chỗ", nên MTX#07
    và MTX#08 (chưa có ai thuê, chỉ là phòng kẹt trạng thái) hiện thành "hết chỗ (3 phòng)"
    — đọc lên như đã kín khách.

    Không gọi `capacityTone` để tránh vòng phụ thuộc ngược từ service sang trang; điều kiện
    ở đây trùng đúng nhánh `setup` của nó.
  */
  return o.rented === 0 && o.heldByDraft === 0
    ? `chưa mở phòng (${o.roomCount} phòng)`
    : `hết chỗ (${o.roomCount} phòng)`;
};

/*
 * Trước 24/08/2026 ở đây còn `occupancySummary()` — gộp mọi con số thành một câu
 * ("0/4 phòng trống · 1 đang có khách · 3 chưa sẵn sàng"). Bỏ hẳn: cách trình bày đó
 * chôn con số quan trọng nhất giữa các con số phụ và bắt người đọc tự cộng nhẩm.
 * Thay bằng thanh tỉ lệ + chú giải — xem `pages/onboarding/CapacityBar.tsx`.
 */
