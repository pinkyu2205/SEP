import { useBillingRealtime } from '@/hooks/useBillingRealtime';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, SectionList, ActivityIndicator, Image, Platform, Modal,
} from 'react-native';
import {
  showAlert, validateMeterPhoto, splitMeterReading, roundConsumption,
} from '@/utils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import {
  Colors, Spacing, BorderRadius, Shadow,
  UTILITY_WINDOW_TEXT, alreadySentReason, currentPeriod,
  METER_READING_RULE_TEXT, meterReadingPeriod, meterReadingPeriodIso, meterReadingDeadline,
} from '@/constants';
import { managerPropertyService } from '@/services/manager/propertyService';
import { realPropertyService } from '@/services/manager/propertyApi';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';
import { realManagerInvoiceService, ManagerInvoice, type UtilityInvoiceLite } from '@/services/manager/invoiceService';
import { managerEvnBillService, evnUnitPrice, type EvnBill } from '@/services/manager/evnBillService';
import { managerWaterBillService, waterUnitPrice, type WaterBill } from '@/services/manager/waterBillService';
import { savedMeterReadingService, type SavedMeterReading } from '@/services/manager/meterReadingService';
import { MeterTaskBanner } from '@/components/manager/MeterTaskBanner';
import { uploadImageToCloudinary } from '@/services/core/cloudinary';
import { CameraCaptureModal, MeterOverrideModal } from '@/components/common';
import { serverNow } from '@/utils/serverTime';

// ===================== TYPES =====================
type MainTab  = 'electricity' | 'water' | 'history';
/*
  ĐIỆN VÀ NƯỚC KHÔNG CÒN CÙNG KHUÔN (10/09/2026) — hai luồng ngược chiều nhau.

  Nước (giữ nguyên): admin phát hành hoá đơn cả nhà TRƯỚC → quản lý ghi chỉ số từng phòng
  → bấm gửi cho khách. Ba bước: chọn nhà → hoá đơn nước → chỉ số phòng.

  Điện (đổi): quản lý chốt chỉ số TRƯỚC, vào ngày cuối tháng, và chỉ số nằm chờ — không
  gửi gì cho khách. Admin đẩy hoá đơn EVN sau, máy chủ tự nhân đơn giá rồi phát hành thẳng
  cho khách. Nên tab Điện chỉ còn HAI bước: chọn nhà → chốt chỉ số. Bước "Hoá đơn EVN"
  biến mất khỏi thanh bước vì nó không còn là việc quản lý phải đi qua để làm việc tiếp
  theo; số liệu EVN nay là một thẻ trạng thái nằm ngay trên đầu bước chốt số.

  Nhà NGUYÊN CĂN vẫn không có việc gì: hoá đơn EVN chính là hoá đơn của căn đó, máy chủ
  gửi thẳng cho khách lúc admin phát hành. Bước 2 của nguyên căn chỉ để đối chiếu.
*/
type ElecStep = 'select_property' | 'room_readings' | 'done';
type WaterStep = 'select_property' | 'bill_entry' | 'room_readings' | 'done';

/**
 * Ảnh sắp chụp: mặt đồng hồ ĐIỆN hoặc NƯỚC của 1 phòng.
 *
 * `utility` là bắt buộc vì cùng một bộ máy chụp/OCR phục vụ cả hai loại: nó quyết định
 * kiểm ảnh bằng `validateMeterPhoto('elec'|'water')` (đồng hồ nước chụp nhầm ô điện sẽ
 * bị đuổi), số chữ số thập phân khi tách chỉ số (điện 1 số lẻ · nước 3 số lẻ), và ghi
 * kết quả vào đúng danh sách phòng.
 */
type MeterUtility = 'elec' | 'water';
type CameraTarget = { kind: 'meter'; utility: MeterUtility; roomId: string };

/** Chỉ số cũ lấy từ đâu: hoá đơn kỳ trước (kỳ 2+) hay lúc đón khách (kỳ 1). */
type PrevReadingSource = 'last_invoice' | 'handover';

/** Nói rõ số đang hiện lấy ở đâu ra — manager biết mà đối chiếu, khỏi đoán. */
const prevSourceLabel = (source?: PrevReadingSource) =>
  source === 'last_invoice' ? 'chốt kỳ trước' : 'lúc đón khách';

interface RoomMeterReading {
  roomId: string;
  roomCode: string;
  tenantName: string;
  prevReading: number;
  prevSource?: PrevReadingSource;
  newReading: string;
  hasPhoto: boolean;
  meterImageUrl?: string;  // ảnh đồng hồ đã chụp (Cloudinary)
  consumption?: number;
  fee?: number;
  sent: boolean;           // đã gửi hóa đơn cho phòng này chưa
  /**
   * ─── CHỈ RIÊNG ĐIỆN (10/09/2026) ─────────────────────────────────────────────
   * `saved` = chỉ số đã CHỐT và lưu lên máy chủ, nhưng CHƯA thành hoá đơn. Đây là trạng
   * thái ở giữa mà luồng cũ không có: trước kia ghi số xong là gửi luôn nên chỉ có
   * "chưa ghi" và "đã gửi". Giờ quản lý chốt số cuối tháng rồi để đấy chờ admin.
   *
   * Nước không dùng hai field này — nước ghi số xong là gửi thẳng, không có bước chờ.
   */
  saved?: boolean;
  /** Đang mở lại bản đã chốt để sửa (chỉ mở được khi chưa phát hành). */
  editing?: boolean;
  /**
   * Hợp đồng ACTIVE của phòng, do BE trả kèm chỉ số đã chốt.
   *
   * Cần cho đường lùi xin mã admin: `meterOverrideService.verify` ghi vết mã đã dùng cho
   * hợp đồng nào. Truyền `null` thì BE vẫn nhận (luồng đón khách chưa có hợp đồng), nhưng
   * ở màn này hợp đồng đã tồn tại nên gửi đúng số vẫn hơn — dấu vết mới truy được về phòng.
   */
  contractId?: number | null;
}

interface WaterBillData {
  /** Tổng m³ trên hoá đơn admin — nhà nguyên căn thu theo số này, không theo đồng hồ. */
  totalQuantity: number;
  totalAmount: number;
  billingPeriod: string;
  pricePerM3: number;
}

/**
 * Nước dùng CHUNG model với điện từ 18/08/2026 — trước đó thiếu `hasPhoto`,
 * `meterImageUrl`, `sent` nên màn nước không có ảnh đồng hồ và phải gửi cả loạt.
 * Chỉ số nước cũng là tiền, cũng cần bằng chứng ảnh y như điện.
 */
type RoomWaterReading = RoomMeterReading;

/**
 * Hoá đơn điện/nước của một phòng đã đi tới đâu.
 *
 * `viewed = null` nghĩa là KHÔNG BIẾT chứ không phải "chưa xem" — hoá đơn phát hành trước
 * khi BE gắn khoá tra cứu (30/08/2026) thì không truy được. Xem `UtilityInvoiceLite.tenantViewed`.
 */
interface DeliveryState {
  paid: boolean;
  viewed: boolean | null;
}

/**
 * Ba mốc giao hoá đơn, hiện thành MỘT dòng.
 *
 * Vì sao cần: quản lý hay bị khách nói "tôi có nhận được hoá đơn đâu". Trước đây màn này
 * chỉ nói được "đã gửi" — tức chỉ là lời của hệ thống, không đối chất được. Nay phân biệt
 * rõ khách đã MỞ hay chưa.
 */
/**
 * Đường mở lại hoá đơn ĐÃ GỬI của một phòng.
 *
 * Trước đây gửi xong là hết đường quay lại: thẻ phòng đổi sang "✓ Đã gửi" kèm một dòng
 * tóm tắt, và mọi thứ quản lý vừa làm — chỉ số đã ghi, ảnh mặt đồng hồ vừa chụp — biến
 * mất khỏi màn hình. Khách gọi lên hỏi "sao tháng này cao thế" thì quản lý không có gì
 * trong tay để trả lời, dù chính họ là người chụp tấm ảnh đó.
 *
 * Ẩn khi chưa tra được hoá đơn (mất mạng lúc nạp lịch sử) — một nút bấm vào không ra gì
 * còn tệ hơn không có nút.
 */
const ViewIssuedButton = ({ invoice, unit, onOpen }: {
  invoice?: UtilityInvoiceLite;
  unit: string;
  onOpen: (v: { invoice: UtilityInvoiceLite; unit: string }) => void;
}) => {
  if (!invoice) return null;
  return (
    <TouchableOpacity
      style={styles.viewIssuedBtn}
      onPress={() => onOpen({ invoice, unit })}
      activeOpacity={0.7}
    >
      <Text style={styles.viewIssuedText}>Xem lại hoá đơn đã gửi →</Text>
    </TouchableOpacity>
  );
};

/**
 * Hộp xem lại hoá đơn đã gửi: đủ số liệu đã chốt + ẢNH ĐỒNG HỒ quản lý đã chụp.
 *
 * Chỉ ĐỌC, không có nút sửa: hoá đơn đã tới tay khách thì sửa ở đây là sửa sau lưng họ.
 * Sai số thì đi đường khiếu nại để admin phân xử — có dấu vết, có người chịu trách nhiệm.
 */
const IssuedInvoiceSheet = ({ view, onClose, onZoom }: {
  view: { invoice: UtilityInvoiceLite; unit: string };
  onClose: () => void;
  onZoom: (url: string) => void;
}) => {
  const inv = view.invoice;
  const u = view.unit;
  const line = (label: string, value: string) => (
    <View style={styles.issuedRow}>
      <Text style={styles.issuedLabel}>{label}</Text>
      <Text style={styles.issuedValue}>{value}</Text>
    </View>
  );
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.issuedOverlay}>
        <View style={styles.issuedSheet}>
          <View style={styles.issuedHead}>
            <Text style={styles.issuedTitle}>
              Hoá đơn đã gửi{inv.roomNumber ? ` · Phòng ${inv.roomNumber}` : ''}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.issuedClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
            {!!inv.meterImageUrl && (
              <>
                <Text style={styles.issuedSectionLabel}>Ảnh đồng hồ đã chụp</Text>
                <TouchableOpacity onPress={() => onZoom(inv.meterImageUrl!)} activeOpacity={0.85}>
                  <Image source={{ uri: inv.meterImageUrl }} style={styles.issuedPhoto} resizeMode="cover" />
                  <Text style={styles.issuedPhotoHint}>Chạm để phóng to</Text>
                </TouchableOpacity>
              </>
            )}

            <Text style={styles.issuedSectionLabel}>Số liệu đã chốt</Text>
            {!!inv.billingPeriod && line('Kỳ', inv.billingPeriod)}
            {inv.prevReading != null && inv.newReading != null
              && line('Chỉ số', `${inv.prevReading} → ${inv.newReading} ${u}`)}
            {inv.consumption != null && line('Tiêu thụ', `${inv.consumption} ${u}`)}
            {inv.unitPrice != null && inv.unitPrice > 0
              && line('Đơn giá', `${Math.round(inv.unitPrice).toLocaleString('vi-VN')} đ/${u}`)}
            {inv.amount != null && line('Thành tiền', fmt(inv.amount))}
            {!!inv.tenantFullName && line('Khách thuê', inv.tenantFullName)}
            {!!inv.sentAt && line('Gửi lúc', new Date(inv.sentAt).toLocaleString('vi-VN'))}

            <Text style={styles.issuedNote}>
              Chỉ xem lại. Số liệu đã tới tay khách nên không sửa được ở đây — sai thì để
              khách khiếu nại để quản trị viên phân xử.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const DeliveryLine = ({ state }: { state?: DeliveryState }) => {
  if (!state) return null;
  const { paid, viewed } = state;
  /*
    `viewed` giờ ĐO ĐÚNG LƯỢT MỞ HOÁ ĐƠN (BE 02/09/2026).

    Trước đó nó chỉ là cờ `read` của một bản ghi thông báo, nên khách vào thẳng tab Hoá
    đơn đọc kỹ rồi gửi cả khiếu nại mà app quản lý vẫn ghi "chưa xem" — ca đã gặp thật.
    BE thêm cột `utility_invoices.tenant_viewed_at`, đặt lần đầu khách gọi endpoint chi
    tiết hoá đơn; FE app khách thuê gọi endpoint đó ngay khi mở màn (`InvoiceDetailScreen`).
    Cờ thông báo cũ vẫn được dùng làm đường lui.

    Nên câu chữ nói thẳng "hoá đơn" được. Riêng hoá đơn phát hành TRƯỚC bản vá thì cột mốc
    rỗng và rơi về cờ thông báo — có thể báo "chưa xem" dù khách đã xem. Đó là vết của
    chuyện chuyển đổi, sẽ tự hết theo các kỳ sau.

    Xem doc-be/BE-NEED-tenant-viewed-theo-luot-mo-hoa-don-2026-09-02.md.
  */
  const text = paid ? '✓ Khách đã thanh toán'
    : viewed === true ? '👁 Khách đã xem hoá đơn — chưa trả tiền'
      : viewed === false ? '📬 Đã gửi — khách chưa mở xem'
        : '📬 Đã gửi vào app khách'; // viewed == null: không tra được, đừng đoán
  const color = paid ? Colors.success : viewed === true ? Colors.info : Colors.textMuted;
  return <Text style={[styles.deliveryLine, { color }]}>{text}</Text>;
};


// ===================== BILLING PROPERTIES (data thật từ BE) =====================
type PropType = 'multi_room' | 'whole_house';

interface BillingRoom {
  id: string;
  code: string;
  tenantName: string;
  // Mốc DỰ PHÒNG = chỉ số ghi lúc ĐÓN KHÁCH (initialElectric/WaterReading trên HĐ),
  // chỉ dùng cho KỲ ĐẦU. Kỳ 2 trở đi lấy chỉ số mới của kỳ liền trước qua
  // fetchLastReadings() (GET /api/v1/manager/utility-invoices).
  prevElec: number;
  prevWater: number;
  /**
   * Ngày hợp đồng bắt đầu (`yyyy-MM-dd`).
   *
   * Dùng để loại phòng KHÔNG THUỘC kỳ đang chốt: khách dọn vào tháng 9 thì không có số
   * điện nào của tháng 8 để mà thu. Xem chỗ lọc trong `enterElecReadings`.
   */
  contractStart?: string;
}

interface BillingProperty {
  id: string;
  name: string;
  type: PropType;
  electricityRate: number; // BE chưa cấp đơn giá cho manager → 0
  waterRate: number;       // BE chưa cấp đơn giá cho manager → 0
  rooms: BillingRoom[];    // multi_room: danh sách phòng; whole_house: 1 phần tử duy nhất
}

const ROOM_STATUS_RENTED = 'RENTED';

// Chịu được null/undefined: số tiền ở đây đến từ BE (hoá đơn EVN admin đẩy, hoá đơn đã
// phát hành) nên không đảm bảo là số — cùng lỗi đã làm ngã màn Lịch sử hoá đơn của khách
// thuê ngày 13/08/2026. Xem `formatCurrency` trong @/utils/helpers.
/**
 * Tiền VND — LUÔN làm tròn về đồng.
 *
 * Đơn giá điện/nước máy chủ giữ ở scale 8 nên `tiêu thụ × đơn giá` gần như luôn ra số lẻ;
 * không làm tròn thì màn hình hiện "428.300,66đ" — con số không tồn tại ngoài đời, mà dấu
 * phẩy còn dễ bị đọc nhầm thành dấu phân nhóm nghìn.
 */
const fmt = (n: number | null | undefined) => {
  const v = Number(n);
  return Math.round(Number.isFinite(v) ? v : 0).toLocaleString('vi-VN') + 'đ';
};
const onlyDigits = (s: string) => (s || '').replace(/[^\d]/g, '');
/**
 * Ô nhập CHỈ SỐ đồng hồ — số nguyên, không dấu thập phân.
 *
 * Từ 27/08/2026 chỉ số chỉ ghi phần ĐEN (xem `roundReading` trong utils/meterPhoto).
 * Trước đó hàm này (tên cũ `decimalDigits`) cố tình cho gõ dấu chấm để giữ phần đỏ;
 * giờ giữ lại là mở đường cho chỉ số lệch đơn vị giữa hai kỳ hoá đơn, nên chặn thẳng.
 */
const readingDigits = (s: string) => onlyDigits(s);
// Hiển thị số có dấu phân cách nghìn (vd "400000" -> "400.000"); rỗng nếu không có số.
const groupThousands = (s: string) => {
  const d = onlyDigits(s);
  return d ? Number(d).toLocaleString('vi-VN') : '';
};

/**
 * Kỳ thanh toán trọn tháng: "01/08 – 31/08/2026". Trước đây giá trị mặc định bị
 * hard-code "01/05 – 31/05/2026" nên mở app tháng nào cũng thấy kỳ tháng 5/2026.
 * offset: 0 = tháng này, -1 = tháng trước.
 */
const monthPeriod = (offset = 0, base = serverNow()) => {
  const d = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `01/${mm} – ${lastDay}/${mm}/${d.getFullYear()}`;
};

// Dải dấu thanh/dấu phụ Unicode (U+0300–U+036F) mà NFD tách ra khỏi nguyên âm.
// Viết bằng escape ASCII để dấu tổ hợp không nằm trần trong source.
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

// Bỏ dấu tiếng Việt: dùng cho cả tìm kiếm nhà lẫn dò nhãn trên text OCR.
const normalizeVi = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/gi, 'd')   // đ/Đ không phải tổ hợp nên NFD không tách được
    .toLowerCase()
    .trim();

/**
 * Parser hoá đơn EVN ĐÃ CHUYỂN SANG WEB (13/08/2026).
 *
 * Người tải hoá đơn giờ là admin trên `/admin/evn-bills`, nên logic OCR + dò tổng kWh /
 * tổng tiền / kỳ nằm ở `frontend-web/src/utils/evnInvoiceParser.ts`. Manager chỉ ĐỌC kết
 * quả admin đã chốt qua `managerEvnBillService` — cố tình không còn đường nhập tay ở đây,
 * vì cho manager nhập lại chính là thứ thay đổi này loại bỏ.
 *
 * OCR ảnh ĐỒNG HỒ (`realTenantService.ocrMeter`) thì GIỮ NGUYÊN — đó vẫn là việc của manager.
 */

// Map property + rooms + hợp đồng (BE) -> shape màn ghi chỉ số dùng.
const mapBillingProperty = (
  p: { id: number; propertyName: string; wholeHouse: boolean | null },
  rooms: { id: number; roomNumber: string; status: string }[],
  contracts: TenantContractResponse[],
): BillingProperty => {
  const active = contracts.filter(c => (c.status || '').toUpperCase() === 'ACTIVE');
  const tenantByRoomId = new Map<number, string>();
  const tenantByRoomNo = new Map<string, string>();
  // Chỉ số điện/nước lúc đón khách (lưu trên HĐ) → mốc "chỉ số cũ" cho hoá đơn kỳ đầu.
  const startByRoomId     = new Map<number, string>();
  const startByRoomNo     = new Map<string, string>();
  const elecInitByRoomId  = new Map<number, number>();
  const elecInitByRoomNo  = new Map<string, number>();
  const waterInitByRoomId = new Map<number, number>();
  const waterInitByRoomNo = new Map<string, number>();
  active.forEach(c => {
    if (c.roomId != null) tenantByRoomId.set(c.roomId, c.tenantFullName);
    if (c.startDate) {
      if (c.roomId != null) startByRoomId.set(c.roomId, c.startDate);
      if (c.roomNumber) startByRoomNo.set(c.roomNumber, c.startDate);
    }
    if (c.roomNumber) tenantByRoomNo.set(c.roomNumber, c.tenantFullName);
    if (c.initialElectricReading != null) {
      if (c.roomId != null) elecInitByRoomId.set(c.roomId, c.initialElectricReading);
      if (c.roomNumber) elecInitByRoomNo.set(c.roomNumber, c.initialElectricReading);
    }
    if (c.initialWaterReading != null) {
      if (c.roomId != null) waterInitByRoomId.set(c.roomId, c.initialWaterReading);
      if (c.roomNumber) waterInitByRoomNo.set(c.roomNumber, c.initialWaterReading);
    }
  });
  const isWhole = p.wholeHouse === true;

  if (isWhole) {
    // Không có hợp đồng ACTIVE = nhà đang trống -> rooms rỗng để bị lọc khỏi danh sách tính tiền.
    const unit = active[0];
    return {
      id: String(p.id),
      name: p.propertyName,
      type: 'whole_house',
      electricityRate: 0,
      waterRate: 0,
      rooms: unit
        ? [{
            id: `house-${p.id}-unit`, code: 'Nhà nguyên căn', tenantName: unit.tenantFullName,
            prevElec:  unit.initialElectricReading ?? 0,
            prevWater: unit.initialWaterReading ?? 0,
          }]
        : [],
    };
  }

  return {
    id: String(p.id),
    name: p.propertyName,
    type: 'multi_room',
    electricityRate: 0,
    waterRate: 0,
    rooms: rooms
      // chỉ tính tiền cho phòng đang có khách thuê
      .filter(r => (r.status || '').toUpperCase() === ROOM_STATUS_RENTED)
      .map(r => ({
        id: String(r.id),
        code: r.roomNumber,
        tenantName: tenantByRoomId.get(r.id) ?? tenantByRoomNo.get(r.roomNumber) ?? 'Chưa có khách thuê',
        prevElec:  elecInitByRoomId.get(r.id)  ?? elecInitByRoomNo.get(r.roomNumber)  ?? 0,
        prevWater: waterInitByRoomId.get(r.id) ?? waterInitByRoomNo.get(r.roomNumber) ?? 0,
        contractStart: startByRoomId.get(r.id) ?? startByRoomNo.get(r.roomNumber),
      })),
  };
};

// ===================== SCREEN =====================
export const UtilityBillingScreen: React.FC<any> = ({ navigation }) => {
  const route = useRoute<any>();
  /**
   * Mặc định vào tab Điện (việc chính ở đây là ghi chỉ số). Nhưng khi được gọi từ ô
   * "Điện/nước quá hạn" ngoài Trang chủ thì việc cần làm là XEM danh sách hoá đơn, nên
   * bên đó truyền `tab: 'history'` — vào thẳng chỗ đang cần, không bắt mò lại.
   */
  const [activeTab, setActiveTab] = useState<MainTab>(
    (route?.params?.tab as MainTab) ?? 'electricity',
  );
  /**
   * Chặn gửi hoá đơn khi KHÁCH ĐÓ đã nhận hoá đơn loại này trong kỳ.
   * Trả true = bị chặn. Luôn nói rõ lý do thay vì để nút im lặng.
   *
   * 13/08/2026: khoá theo NGÀY (cửa sổ 1–10) đã bỏ — gửi được mọi ngày. Thay bằng khoá
   * theo SỐ LẦN: 1 khách / 1 loại / 1 kỳ. Xem @/constants/utilityCycle.
   *
   * Khác chỗ cũ ở một điểm quan trọng: chốt cũ chỉ chặn khi khách đã trả ĐỦ tiền, nên
   * trước lúc khách trả thì manager vẫn bấm gửi lại được bao nhiêu lần cũng được. Giờ
   * cứ ĐÃ GỬI là khoá, không quan tâm đã thu tiền hay chưa.
   */
  /**
   * Lỗi BE trả về có phải "kỳ này đã gửi hoá đơn rồi" không.
   *
   * FE đã tự dò trước bằng `fetchRoomHistory` (so `billingPeriod` của hoá đơn cũ với kỳ
   * đang chốt), nhưng chuỗi kỳ do người nhập nên chỉ cần lệch một khoảng trắng hay dấu
   * gạch (– so với -) là dò trượt, nút vẫn xanh và manager bấm vào mới biết. Bắt thêm
   * lỗi của BE để khoá nút ngay tại chỗ — BE mới là bên chốt.
   */
  const isAlreadySentError = (e: any): boolean => {
    const code = e?.response?.data?.code;
    if (code === 'INVOICE_ALREADY_EXISTS') return true;
    const msg = String(e?.response?.data?.message ?? e?.message ?? '');
    return /đã nhận hoá đơn|đã nhận hóa đơn/i.test(msg);
  };

  const blockedFromSending = (
    type: 'ELECTRICITY' | 'WATER',
    roomKey: string,
    target: string,
  ) => {
    const sentKeys = type === 'ELECTRICITY' ? elecSentKeys : waterSentKeys;
    if (sentKeys.has(roomKey)) {
      showAlert('Kỳ này đã gửi rồi', alreadySentReason(type, target), undefined, '🔒');
      return true;
    }
    return false;
  };
  // Tăng mỗi lần gửi hóa đơn để panel trạng thái tự tải lại.
  const [utilReloadKey, setUtilReloadKey] = useState(0);
  // Lịch sử hóa đơn điện/nước đã gửi (toàn bộ nhà) — dữ liệu thật từ BE.
  const [histInvoices, setHistInvoices] = useState<ManagerInvoice[]>([]);
  const [loadingHist,  setLoadingHist]  = useState(false);
  /** Lọc lịch sử theo kỳ (YYYY-MM); 'all' = mọi kỳ. */
  const [histPeriod,   setHistPeriod]   = useState<string>('all');

  // ── Electricity state ──────────────────────────────────────────────────────
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [elecStep,           setElecStep]           = useState<ElecStep>('select_property');
  const [roomElecReadings,   setRoomElecReadings]   = useState<RoomMeterReading[]>([]);
  const [ocrRoomId,          setOcrRoomId]          = useState<string | null>(null); // phòng đang OCR đồng hồ
  /** Đang mở camera trong app cho việc gì (null = đóng). */
  const [cameraTarget,       setCameraTarget]       = useState<CameraTarget | null>(null);
  /** Ảnh đang xem phóng to (null = đóng). */
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  /** Hoá đơn đã gửi đang mở xem lại — xem `IssuedInvoiceSheet`. */
  const [issuedView, setIssuedView] = useState<{ invoice: UtilityInvoiceLite; unit: string } | null>(null);

  /**
   * Hoá đơn EVN của kỳ này do ADMIN phát hành (chỉ đọc). null = admin chưa đẩy.
   * Trước 13/08/2026 đây là `evnData` do chính manager chụp/nhập — xem evnBillService.
   */
  /**
   * Tổng tiêu thụ CÁC PHÒNG đã phát hành trong kỳ đang chốt.
   *
   * Nền để tính hạn mức còn lại: tổng các phòng không được vượt tổng trên giấy nhà nước
   * (cộng biên dự phòng). Vượt nghĩa là chắc chắn có phòng đọc nhầm — không phép cộng nào
   * cho ra nhiều điện hơn lượng công ty đã mua.
   */
  const [elecIssuedQty,  setElecIssuedQty]  = useState(0);
  const [waterIssuedQty, setWaterIssuedQty] = useState(0);
  const [evnBill,        setEvnBill]        = useState<EvnBill | null>(null);
  /**
   * Phần ĐANG GÕ mà chưa gửi — cộng vào hạn mức ngay để quản lý thấy trước khi bấm.
   *
   * Chỉ tính phòng chưa gửi: phòng đã gửi nằm trong `*IssuedQty` rồi, cộng lại là tính hai lần.
   * Chỉ số mới ≤ chỉ số cũ thì bỏ qua — đó là đang gõ dở, chưa phải số thật.
   */
  const pendingQty = (rows: RoomMeterReading[], sentKeys: Set<string>) =>
    rows.reduce((sum, r) => {
      if (r.sent || sentKeys.has(r.roomId)) return sum;
      const n = Number(r.newReading);
      return Number.isFinite(n) && n > r.prevReading ? sum + (n - r.prevReading) : sum;
    }, 0);
  const [evnBillLoading, setEvnBillLoading] = useState(false);
  const [evnBillError,   setEvnBillError]   = useState<string | null>(null);
  /**
   * Không nạp được chỉ số ĐÃ CHỐT của kỳ (endpoint mới 10/09/2026).
   *
   * Phải nói ra thay vì im lặng rơi về danh sách trống: trống trông y hệt "chưa ai chốt
   * số phòng nào", quản lý sẽ đi chụp lại cả nhà rồi bấm lưu và ăn lỗi trùng ở từng phòng.
   */
  const [elecReadingsError, setElecReadingsError] = useState<string | null>(null);
  /** Phòng đang bấm lưu chỉ số (khoá nút, tránh bấm hai lần ra hai bản ghi). */
  const [savingRoomId, setSavingRoomId] = useState<string | null>(null);
  /** Số phòng bị loại khỏi kỳ vì khách dọn vào sau khi kỳ đã khép — xem `enterElecReadings`. */
  const [elecSkippedRooms, setElecSkippedRooms] = useState(0);
  /**
   * Phòng đang mở hộp xin mã admin để chốt số KHÔNG CÓ ẢNH (null = đóng).
   *
   * Không giữ token trong state: mã đổi được đúng MỘT token, token dùng một lần và sống
   * 15 phút. Giữ lại để đó chỉ tạo ra một cái token hết hạn nằm chờ, rồi lần lưu sau lại
   * hỏng vì lý do khác hẳn. Xin xong là lưu ngay trong cùng một nhịp.
   */
  const [overrideRoomId, setOverrideRoomId] = useState<string | null>(null);
  /** Đang gửi hoá đơn nhà nguyên căn (nút gửi thẳng ở bước 2). */

  /**
   * Khoá "1 khách 1 hoá đơn/kỳ": tập khoá phòng ĐÃ nhận hoá đơn của kỳ đang chốt.
   * Khoá phòng = roomId dạng chuỗi; nhà nguyên căn dùng `house-<propId>-unit`.
   * Nạp từ BE mỗi lần vào bước ghi chỉ số nên khoá còn hiệu lực qua cả lần mở app khác.
   */
  const [elecSentKeys,  setElecSentKeys]  = useState<Set<string>>(new Set());
  const [elecDelivery,  setElecDelivery]  = useState<Map<string, DeliveryState>>(new Map());
  /** Hoá đơn ĐÃ PHÁT HÀNH kỳ này theo phòng — để mở lại xem, xem `issued` trong fetchRoomHistory. */
  const [elecIssued,   setElecIssued]   = useState<Map<string, UtilityInvoiceLite>>(new Map());
  /** Nhà nguyên căn đã gửi hoá đơn điện kỳ này — xem chú thích chỗ setElecHouseSent. */
  const [elecHouseSent, setElecHouseSent] = useState(false);
  const [waterSentKeys, setWaterSentKeys] = useState<Set<string>>(new Set());
  const [waterDelivery, setWaterDelivery] = useState<Map<string, DeliveryState>>(new Map());
  const [waterIssued,  setWaterIssued]  = useState<Map<string, UtilityInvoiceLite>>(new Map());

  // ── Water state ────────────────────────────────────────────────────────────
  const [waterPropertyId,  setWaterPropertyId]  = useState<string | null>(null);
  const [waterBillData,    setWaterBillData]    = useState<WaterBillData | null>(null);
  const [waterStep,        setWaterStep]        = useState<WaterStep>('select_property');
  /** Hoá đơn nước admin đã chốt cho kỳ này — manager CHỈ ĐỌC (14/08/2026). */
  const [waterBill,        setWaterBill]        = useState<WaterBill | null>(null);
  const [waterBillLoading, setWaterBillLoading] = useState(false);
  const [waterBillError,   setWaterBillError]   = useState<string | null>(null);
  const [roomWaterReadings,setRoomWaterReadings]= useState<RoomWaterReading[]>([]);

  // Hạn mức tiêu thụ — xem `QuotaBar`. Phải đặt SAU mọi khai báo state ở trên.
  const pendingElecQty   = pendingQty(roomElecReadings,  elecSentKeys);
  const pendingWaterQty  = pendingQty(roomWaterReadings, waterSentKeys);
  const billedElecRooms  = roomElecReadings.filter(r => r.sent || elecSentKeys.has(r.roomId)).length;
  const billedWaterRooms = roomWaterReadings.filter(r => r.sent || waterSentKeys.has(r.roomId)).length;
  const [waterBillForm,    setWaterBillForm]    = useState({ totalAmount: '', billingPeriod: monthPeriod(), pricePerM3: '20000' });


  // Danh sách nhà/phòng THẬT của manager
  const [properties, setProperties] = useState<BillingProperty[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [errorProps, setErrorProps] = useState<string | null>(null);

  const loadProperties = useCallback(async () => {
    try {
      setErrorProps(null);
      const scoped = await managerPropertyService.getScopedProperties();
      const mapped = await Promise.all(
        scoped.map(async (p) => {
          const [rooms, contracts] = await Promise.all([
            realPropertyService.getRooms(p.id).catch(() => []),
            realTenantService.listByProperty(p.id).catch(() => [] as TenantContractResponse[]),
          ]);
          return mapBillingProperty(p, rooms, contracts);
        }),
      );
      // Chỉ giữ nhà đang có khách thuê (multi-room: có phòng RENTED; nguyên căn: có HĐ ACTIVE).
      // Nhà trống không phát sinh tiền điện/nước nên bỏ khỏi cả tab Điện lẫn tab Nước.
      setProperties(mapped.filter(p => p.rooms.length > 0));
    } catch (e: any) {
      setErrorProps(e?.response?.data?.message || e?.message || 'Không tải được danh sách tòa nhà');
    } finally {
      setLoadingProps(false);
    }
  }, []);

  /** `silent` = nạp ngầm (realtime / poll): giữ danh sách đang hiện, không nháy spinner. */
  const loadHistory = useCallback((silent = false) => {
    if (!silent) setLoadingHist(true);
    Promise.all([
      realManagerInvoiceService.listInvoices({ type: 'ELECTRICITY' }).catch(() => [] as ManagerInvoice[]),
      realManagerInvoiceService.listInvoices({ type: 'WATER' }).catch(() => [] as ManagerInvoice[]),
    ])
      .then(([e, w]) => setHistInvoices([...e, ...w].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))))
      .finally(() => setLoadingHist(false));
  }, []);

  useFocusEffect(useCallback(() => { loadProperties(); loadHistory(); }, [loadProperties, loadHistory]));

  /**
   * Hoá đơn điện/nước khách trả xong → nạp lại lịch sử. BE gửi kèm `utilityInvoiceId`
   * cho loại này, nhưng ở đây cứ nạp lại cả danh sách: `loadHistory` rẻ hơn nhiều so với
   * việc dò đúng dòng rồi vá tay, mà lại không sợ lệch bộ lọc kỳ đang chọn.
   */
  useBillingRealtime({
    filter: (e) => e.event === 'INVOICE_PAID',
    onRefresh: () => loadHistory(true),
  });

  /**
   * MỞ THẲNG NHÀ ĐƯỢC CHỈ ĐỊNH khi vào từ màn "Cần chụp số"
   * (`MeterReadingPendingScreen` điều hướng kèm `{ propertyId, roomId, period }`).
   *
   * Trước 13/08/2026 màn này không đọc `route.params` nên bấm từ bên kia sang vẫn rơi
   * vào bước chọn nhà từ đầu — đúng thứ màn kia sinh ra để tránh.
   *
   * `jumpedRef` để chỉ nhảy MỘT LẦN: `useFocusEffect` chạy lại mỗi lần quay lại màn,
   * không chặn thì manager bấm "Quay lại" là bị đá về bước 2 vô hạn, không thoát ra
   * bước chọn nhà được.
   */
  /**
   * `navigate()` vào màn ĐANG nằm sẵn trong stack thì chỉ đổi `params`, `useState` ở
   * trên không chạy lại — thiếu effect này thì bấm "Điện/nước quá hạn" lần thứ hai là
   * tab không đổi, người dùng tưởng nút hỏng.
   */
  useEffect(() => {
    const t = route?.params?.tab as MainTab | undefined;
    if (t) setActiveTab(t);
  }, [route?.params]);

  /**
   * Đã nhảy cho NHÀ + KỲ nào rồi — không phải một cái công tắc bật một lần.
   *
   * Bản trước là `useRef(false)`: nhảy đúng MỘT lần cho cả vòng đời màn hình. Nó sinh ra
   * để chặn `useFocusEffect` đá người dùng ngược về bước 2 mỗi lần bấm "Quay lại", và làm
   * đúng việc đó. Nhưng nó cũng chặn luôn lần nhảy thứ hai HỢP LỆ: bấm thông báo nhà A,
   * lát sau bấm thông báo nhà B thì màn này đã nằm sẵn trong stack nên `navigate()` chỉ
   * đổi `params` — không có gì chạy lại, người dùng vẫn đứng ở nhà A và tưởng nút hỏng.
   *
   * Từ 10/09/2026 chuyện đó xảy ra thường xuyên: mỗi lần admin đẩy hoá đơn EVN là một
   * thông báo `UTILITY_INVOICE_AUTO_ISSUED_MANAGER` kèm `propertyId`, quản lý nhiều nhà sẽ
   * nhận nhiều tin liền nhau.
   *
   * Nhớ theo khoá `nhà:kỳ` thì giữ nguyên tác dụng cũ (bấm Quay lại không đổi params nên
   * không nhảy lại) mà vẫn mở đường cho tin của nhà khác.
   */
  const jumpedForRef = useRef<string | null>(null);
  useEffect(() => {
    const pid = route?.params?.propertyId;
    if (!pid || properties.length === 0) return;
    const key = `${pid}:${route?.params?.period ?? ''}`;
    if (jumpedForRef.current === key) return;
    if (!properties.some(p => p.id === String(pid))) return; // nhà không thuộc manager
    jumpedForRef.current = key;
    setSelectedPropertyId(String(pid));
    setActiveTab('electricity');
    enterElecReadings(String(pid));
  }, [route?.params?.propertyId, route?.params?.period, properties]);
  useEffect(() => { loadHistory(); }, [utilReloadKey, loadHistory]);

  const selectedProperty = properties.find(p => p.id === selectedPropertyId);
  const waterProperty    = properties.find(p => p.id === waterPropertyId);
  const isWholeHouse     = selectedProperty?.type === 'whole_house';

  /**
   * CHỈ SỐ CŨ CỦA KỲ ĐANG CHỐT = chỉ số MỚI của kỳ liền trước, VÀ phòng nào đã gửi kỳ này.
   *
   * Hai thứ này lấy từ cùng một lần gọi API nên gộp làm một:
   *  • `lastReadings` — kỳ 1 (phòng chưa có hoá đơn nào) lấy mốc ghi lúc đón khách; kỳ 2
   *    lấy số cuối kỳ 1, kỳ 3 lấy số cuối kỳ 2...
   *  • `sentKeys` — phòng đã có hoá đơn CÙNG `billingPeriod` với kỳ đang chốt. Đây là cái
   *    chặn gửi trùng; so bằng chuỗi kỳ chứ không bằng tháng tạo, vì hoá đơn kỳ tháng 7
   *    hoàn toàn có thể được gửi trong tháng 8.
   *
   * Khoá phòng: roomId dạng chuỗi, nhà nguyên căn dùng `house-<propId>-unit`.
   */
  /**
   * Chuẩn hoá chuỗi kỳ trước khi so.
   *
   * Chuỗi kỳ do NGƯỜI gõ ở trang admin ("01/09 – 30/09/2026") rồi được chép nguyên văn
   * sang hoá đơn. Chỉ cần dư một khoảng trắng, hay gạch ngang dài `–` đổi thành `-`, là
   * so bằng `===` trượt → FE tưởng chưa gửi, để nút xanh, manager bấm vào mới ăn lỗi của
   * BE. Gom mọi kiểu gạch về `-` và ép khoảng trắng về một dấu cách.
   */
  const normPeriod = (raw?: string | null): string =>
    (raw ?? '').replace(/[–—-]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();

  const fetchRoomHistory = async (
    propId: string,
    type: 'ELECTRICITY' | 'WATER',
    period?: string,
  ): Promise<{
    lastReadings: Map<string, number>;
    sentKeys: Set<string>;
    houseSent: boolean;
    /** Tổng tiêu thụ CÁC PHÒNG đã phát hành trong kỳ — nền để tính hạn mức còn lại. */
    issuedQty: number;
    /**
     * Hoá đơn kỳ này đã tới tay khách chưa — khoá giống `sentKeys`.
     *
     * Có để trả lời câu quản lý hay bị hỏi ngược: khách bảo "tôi có nhận được đâu".
     * Không có nó thì quản lý chỉ biết "hệ thống báo đã gửi", không đối chất được.
     */
    delivery: Map<string, DeliveryState>;
    /**
     * HOÁ ĐƠN ĐÃ PHÁT HÀNH của kỳ này, giữ nguyên vẹn theo từng phòng.
     *
     * Bản trước đọc danh sách này rồi chỉ giữ lại đúng hai thứ: "đã gửi chưa" và "khách
     * xem chưa" — mọi số liệu còn lại (chỉ số, đơn giá, thành tiền, ẢNH ĐỒNG HỒ) bị vứt
     * ngay tại vòng lặp. Nên gửi xong là quản lý không còn đường nào xem lại mình đã
     * chụp cái gì và gửi số bao nhiêu, kể cả khi khách gọi lên hỏi.
     */
    issued: Map<string, UtilityInvoiceLite>;
  }> => {
    const lastReadings = new Map<string, number>();
    const sentKeys = new Set<string>();
    const delivery = new Map<string, DeliveryState>();
    const issued = new Map<string, UtilityInvoiceLite>();
    let issuedQty = 0;
    /** Nhà nguyên căn đã có hoá đơn kỳ này chưa — cờ riêng, không phụ thuộc khoá chuỗi. */
    let houseSent = false;
    const wanted = normPeriod(period);
    try {
      // GỬI CẢ `period` để BE lọc. Đây chính là truy vấn BE dùng trong
      // `validateBillingPeriodLock` (findByFilters(propertyId, period, type)) — hỏi đúng
      // câu BE hỏi thì câu trả lời không thể lệch. Trước đây FE lấy hết mọi kỳ rồi tự so
      // chuỗi `billingPeriod`, mà chuỗi đó do admin gõ tay nên chỉ cần lệch một khoảng
      // trắng là dò trượt: nút vẫn xanh, bấm vào mới nhận "đã nhận hoá đơn của kỳ ...".
      const invoices = await realManagerInvoiceService.listUtilityInvoices(
        Number(propId), { type, period: period?.trim() || undefined },
      );
      // Mới nhất trước, để phần tử đầu tiên của mỗi phòng là kỳ gần nhất.
      const sorted = [...invoices].sort((a, b) => {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        return tb - ta || (b.id ?? 0) - (a.id ?? 0);
      });
      for (const inv of sorted) {
        // Nhà nguyên căn không có roomId → khớp theo phần tử phòng duy nhất của nhà đó.
        const isHouse = inv.roomId == null;
        const key = isHouse ? `house-${propId}-unit` : String(inv.roomId);
        if (inv.newReading != null && !lastReadings.has(key)) {
          lastReadings.set(key, Number(inv.newReading));
        }
        // Hoá đơn đã huỷ không tính là "đã gửi" — huỷ xong phải gửi lại được.
        const cancelled = (inv.status || '').toUpperCase() === 'CANCELLED';
        if (cancelled) continue;
        /*
          BE đã lọc theo `period` rồi nên mọi dòng về đây đều thuộc kỳ đang chốt. Chỉ so
          lại khi BE trả kèm chuỗi kỳ khác hẳn (phòng hờ BE bỏ qua tham số lọc).

          KHÔNG BIẾT KỲ (`wanted` rỗng) thì coi như CHƯA phòng nào nhận hoá đơn, chứ không
          phải mọi phòng đều đã nhận. Chuỗi kỳ lấy từ hoá đơn cả nhà của admin, nên rỗng
          nghĩa là admin chưa phát hành — mà hoá đơn phòng chỉ sinh ra TỪ hoá đơn đó, nên
          kỳ này chắc chắn chưa có phòng nào. Nhánh cũ (`!wanted` → đúng) vô hại khi màn
          hình còn chặn không cho vào bước chỉ số lúc thiếu hoá đơn; từ 10/09/2026 tab Điện
          vào thẳng bước chốt số nên nó sẽ khoá nhầm TOÀN BỘ phòng bằng hoá đơn của kỳ cũ.
        */
        const samePeriod = wanted
          ? (!inv.billingPeriod || normPeriod(inv.billingPeriod) === wanted)
          : false;
        if (!samePeriod) continue;
        sentKeys.add(key);
        // Mảng đã sắp mới-nhất-trước nên bản ghi ĐẦU TIÊN của mỗi phòng là kỳ gần nhất;
        // đừng để hoá đơn cũ hơn ghi đè trạng thái.
        if (!delivery.has(key)) {
          delivery.set(key, {
            paid: (inv.status || '').toUpperCase() === 'PAID',
            viewed: inv.tenantViewed ?? null,
          });
          // Cùng điều kiện "bản ghi đầu tiên" với `delivery` — mảng đã sắp mới-nhất-trước.
          issued.set(key, inv);
        }
        if (isHouse) houseSent = true;
        // Chỉ cộng hoá đơn PHÒNG: hạn mức là để so tổng các phòng với giấy của cả toà.
        if (!isHouse && inv.consumption != null) issuedQty += Number(inv.consumption);
      }
    } catch {
      // Không lấy được lịch sử → rơi về mốc lúc đón khách, manager vẫn sửa tay được.
      // Cố tình KHÔNG chặn gửi khi lỗi mạng: chặn nhầm còn tệ hơn, vì BE vẫn chặn trùng.
    }
    return { lastReadings, sentKeys, houseSent, issuedQty, delivery, issued };
  };

  // ── Ảnh + OCR ──────────────────────────────────────────────────────────────
  /** Lấy ảnh có sẵn trong máy. */
  const pickFromGallery = async (): Promise<string | null> => {
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    return r.canceled ? null : r.assets[0].uri;
  };

  /**
   * Hỏi nguồn ảnh rồi xử lý.
   * "Chụp" mở CameraCaptureModal (camera trong app) cho MỌI nền tảng: trên web
   * ImagePicker.launchCameraAsync chỉ mở hộp thoại chọn file, và modal còn bắt xem
   * lại ảnh trước khi dùng — quan trọng với ảnh đồng hồ vì đó là căn cứ tính tiền.
   */
  const askPhotoSource = (target: CameraTarget) => {
    showAlert('Chọn ảnh', undefined, [
      { text: '📷 Chụp ảnh', onPress: () => setCameraTarget(target) },
      {
        text: '🖼 Chọn từ thư viện',
        onPress: async () => {
          const uri = await pickFromGallery();
          if (uri) await handlePhoto(target, uri);
        },
      },
      { text: 'Huỷ', style: 'cancel' },
    ]);
  };

  /** Ảnh đã chọn/đã chụp xong thì đưa về đúng chỗ xử lý. */
  const handlePhoto = async (target: CameraTarget, uri: string) => {
    await captureRoomMeter(target.utility, target.roomId, uri);
  };

  // ── Bước chốt chỉ số điện ──────────────────────────────────────────────────
  /**
   * Vào bước chốt số: lấy CHỈ SỐ ĐÃ CHỐT của kỳ + hoá đơn EVN (nếu admin đã đẩy) + lịch
   * sử hoá đơn phòng.
   *
   * Thứ tự quan trọng ở đây đã ĐẢO so với bản trước 10/09/2026. Trước kia hoá đơn EVN là
   * ĐIỀU KIỆN VÀO: không có nó thì màn hình dừng ở câu "Chờ admin gửi hóa đơn EVN" và
   * quản lý không ghi được gì. Nay hoá đơn EVN chỉ là THÔNG TIN THÊM — việc chốt số phải
   * làm xong trước ngày cuối tháng, còn giấy nhà nước thì tháng sau mới về. Bắt chờ giấy
   * mới cho chụp chính là thứ đổi luồng này gỡ bỏ.
   *
   * Ba lời gọi độc lập nhau nên chạy song song; lỗi của lời gọi này không chặn lời gọi kia
   * (chưa có hoá đơn EVN vẫn phải chốt được số).
   */
  const enterElecReadings = async (propId: string) => {
    setElecStep('room_readings');
    setEvnBillLoading(true);
    setEvnBillError(null);
    setElecReadingsError(null);
    setEvnBill(null);

    const { month, year } = meterReadingPeriod();
    const periodIso = meterReadingPeriodIso();

    const [billRes, savedRes] = await Promise.allSettled([
      managerEvnBillService.getForPeriod(Number(propId), month, year),
      savedMeterReadingService.listForPeriod(Number(propId), periodIso, 'ELECTRICITY'),
    ]);

    const bill = billRes.status === 'fulfilled' ? billRes.value : null;
    setEvnBill(bill);
    if (billRes.status === 'rejected') {
      const e: any = billRes.reason;
      setEvnBillError(
        e?.response?.data?.message || e?.message || 'Không tải được hoá đơn điện của kỳ này.',
      );
    }
    setEvnBillLoading(false);

    /** Chỉ số đã chốt, tra theo roomId. Nhà nguyên căn để `roomId = null` nên bỏ qua. */
    const savedByRoom = new Map<string, SavedMeterReading>();
    if (savedRes.status === 'fulfilled') {
      for (const row of savedRes.value) {
        if (row.roomId != null) savedByRoom.set(String(row.roomId), row);
      }
    } else {
      const e: any = savedRes.reason;
      setElecReadingsError(
        e?.response?.data?.message || e?.message || 'Không tải được chỉ số đã chốt của kỳ này.',
      );
    }

    const prop = properties.find(p => p.id === propId);
    const { lastReadings, sentKeys, houseSent, issuedQty, delivery, issued } = await fetchRoomHistory(
      propId, 'ELECTRICITY', bill?.billingPeriod,
    );

    /*
      BỎ PHÒNG CHƯA CÓ KHÁCH TRONG KỲ ĐANG CHỐT.

      Khách dọn vào tháng 9 thì không có số điện nào của tháng 8 để thu — phần đó thuộc về
      quãng nhà còn trống, công ty chịu. Trước 10/09/2026 màn này liệt kê MỌI phòng đang có
      người ở, bất kể kỳ, nên nó mời quản lý chốt số cho một kỳ khách chưa tới, và máy chủ
      thì phát hành hoá đơn thật cho khách đó (đã xảy ra với phòng 103 nhà MTX#123).

      Đây đúng luật máy chủ đang áp cho danh sách "cần chụp công tơ"
      (`collectElectricPending`: bỏ HĐ có `startDate` sau ngày cuối kỳ). Hai màn phải cùng
      một luật, nếu không thì màn này báo còn 4 phòng trong khi màn kia báo không còn gì.
    */
    const periodEnd = meterReadingDeadline();
    const inPeriod = (prop?.rooms ?? []).filter(r => !r.contractStart || r.contractStart <= periodEnd);
    const skipped = (prop?.rooms.length ?? 0) - inPeriod.length;
    setElecSkippedRooms(skipped);
    // Nhà nguyên căn: hoá đơn của BE không mang roomId nên khoá chuỗi có thể lệch với id
    // phòng ảo FE tự dựng. Dùng thẳng cờ `houseSent` để nút "đã gửi" không phụ thuộc vào
    // việc hai bên đặt tên khoá giống nhau.
    setElecDelivery(delivery);
    setElecIssued(issued);
    setElecHouseSent(houseSent);
    setElecSentKeys(sentKeys);
    setElecIssuedQty(issuedQty);
    if (prop) {
      setRoomElecReadings(inPeriod.map(r => {
        const saved = savedByRoom.get(r.id);
        /*
          Ba nguồn chỉ số cũ, xếp theo độ tin cậy giảm dần:
            1. bản CHỐT của chính kỳ này (quản lý đã đi chụp rồi, kể cả từ lần mở app trước)
            2. chỉ số mới của hoá đơn kỳ liền trước
            3. mốc ghi lúc đón khách (kỳ đầu tiên của hợp đồng)
        */
        const prevReading = saved?.prevReading ?? lastReadings.get(r.id) ?? r.prevElec;
        const prevSource: PrevReadingSource =
          saved?.prevSource === 'HANDOVER' ? 'handover'
            : saved ? 'last_invoice'
              : lastReadings.has(r.id) ? 'last_invoice' : 'handover';
        return {
          roomId: r.id, roomCode: r.code, tenantName: r.tenantName,
          prevReading,
          prevSource,
          newReading: saved?.newReading != null ? String(saved.newReading) : '',
          hasPhoto: !!saved?.meterImageUrl,
          meterImageUrl: saved?.meterImageUrl ?? undefined,
          consumption: saved?.newReading != null
            ? roundConsumption(Math.max(saved.newReading - prevReading, 0))
            : undefined,
          saved: saved?.newReading != null,
          contractId: saved?.contractId ?? null,
          // Phòng đã nhận hoá đơn kỳ này (máy chủ tự phát hành khi admin đẩy hoá đơn EVN).
          sent: sentKeys.has(r.id) || saved?.invoiceId != null,
        };
      }));
    }
  };

  // Xoá ảnh đồng hồ của 1 phòng. Giữ nguyên chỉ số đã nhập vì manager có thể nhập tay
  // — chỉ gỡ ảnh để không gửi ảnh sai lên hoá đơn.
  const clearRoomMeterPhoto = (roomId: string, utility: MeterUtility = 'elec') => {
    const setList = utility === 'water' ? setRoomWaterReadings : setRoomElecReadings;
    const doClear = () =>
      setList(prev => prev.map(r =>
        r.roomId === roomId ? { ...r, hasPhoto: false, meterImageUrl: undefined } : r,
      ));
    if (Platform.OS === 'web') { doClear(); return; }
    showAlert(
      'Xoá ảnh đồng hồ?',
      'Ảnh sẽ không được gửi kèm hoá đơn. Chỉ số đã nhập vẫn được giữ.',
      [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Xoá ảnh', style: 'destructive', onPress: doClear },
      ],
    );
  };

  /** Mở lại một phòng ĐÃ CHỐT để sửa. Chỉ gọi được khi chưa phát hành — xem nút gọi nó. */
  const editRoomElecReading = (roomId: string) =>
    setRoomElecReadings(prev => prev.map(r =>
      r.roomId === roomId ? { ...r, editing: true } : r));

  /**
   * Chụp/chọn ảnh đồng hồ điện 1 phòng -> upload + OCR -> tự điền chỉ số mới.
   *
   * Chỉ số điện là tiền thật nên ảnh phải là MẶT ĐỒNG HỒ: `validateMeterPhoto` soi chữ
   * OCR đọc được (kWh, tên hãng, serial...). Ảnh chỉ có mấy con số (ghi ra giấy, chụp
   * màn hình) hoặc chụp nhầm đồng hồ nước đều bị TỪ CHỐI — không lưu ảnh, không điền số.
   */
  const captureRoomMeter = async (utility: MeterUtility, roomId: string, uri: string) => {
    const isWater = utility === 'water';
    const setList = isWater ? setRoomWaterReadings : setRoomElecReadings;
    const label = isWater ? 'nước' : 'điện';
    try {
      setOcrRoomId(roomId);
      const url = await uploadImageToCloudinary(uri);

      let ocr;
      try {
        ocr = await realTenantService.ocrMeter(url);
      } catch {
        // Không kiểm chứng được ảnh → vẫn giữ để không chặn việc chốt số, nhưng nói rõ.
        setList(prev => prev.map(r =>
          r.roomId === roomId ? { ...r, hasPhoto: true, meterImageUrl: url } : r));
        showAlert(
          'Chưa kiểm được ảnh',
          'Dịch vụ đọc ảnh đang lỗi nên chưa xác nhận được đây có phải mặt đồng hồ không. Nhập chỉ số bằng tay và kiểm lại ảnh giúp.',
        );
        return;
      }

      const check = validateMeterPhoto(utility, ocr);
      if (!check.ok) {
        showAlert(`Ảnh không phải đồng hồ ${label}`, check.reason, undefined, '🚫');
        return;
      }

      // Tách phần lẻ (chữ số đỏ) khỏi dãy OCR đọc được rồi CHỈ GIỮ PHẦN ĐEN. Vẫn phải
      // tách trước: `onlyDigits` trên chuỗi gốc nuốt luôn phần lẻ nên "030815" thành
      // 30815 — chỉ số to gấp 10 lần. Số chữ số lẻ khác nhau theo loại (điện 1 · nước 3)
      // — xem DEFAULT_DIGIT_CONFIG. Từ 27/08/2026 chỉ ghi số đen, đỏ ≥ nửa thì lên 1.
      const split = splitMeterReading(check.reading || '', utility);
      const reading = split.integerPart ? String(split.rounded) : '';
      setList(prev => prev.map(r =>
        r.roomId === roomId
          ? { ...r, newReading: reading || r.newReading, hasPhoto: true, meterImageUrl: url }
          : r,
      ));
      if (!reading) showAlert('Đã nhận ảnh đồng hồ', 'Chưa đọc được chỉ số từ ảnh — vui lòng nhập tay.');
      else if (check.confidence === 'low') {
        showAlert('Ảnh hơi mờ', `Chưa chắc chắn đây là mặt đồng hồ ${label} — kiểm tra lại ảnh và chỉ số trước khi gửi hoá đơn.`);
      }
    } catch {
      showAlert('Lỗi', `Không tải/đọc được ảnh đồng hồ ${label}. Vui lòng nhập tay.`);
    } finally {
      setOcrRoomId(null);
    }
  };

  // Cập nhật 1 phòng trong danh sách chỉ số điện (nhập tay chỉ số cũ / mới).
  const updateRoomElec = (roomId: string, patch: Partial<RoomMeterReading>) =>
    setRoomElecReadings(prev => prev.map(r => (r.roomId === roomId ? { ...r, ...patch } : r)));

  /** Đơn giá 1 kWh admin đã chốt cho kỳ này. 0 khi chưa có hoá đơn EVN. */
  const elecUnitPrice = evnBill ? evnUnitPrice(evnBill) : 0;

  /**
   * CHỐT chỉ số điện của 1 phòng — LƯU LẠI, KHÔNG gửi cho khách.
   *
   * Thay cho `sendSingleRoomElec` (bỏ 10/09/2026). Hàm cũ phát hành hoá đơn ngay tại đây,
   * nên nó bắt buộc phải có `evnBill` để lấy đơn giá — tức quản lý không chốt được số
   * trước khi giấy nhà nước về, đúng thứ luồng mới sửa. Nay việc nhân đơn giá và phát hành
   * là của máy chủ, chạy lúc admin đẩy hoá đơn EVN; ở đây chỉ lưu chỉ số + ảnh đồng hồ.
   *
   * KHÔNG gọi `blockedFromSending`: khoá đó là "mỗi khách 1 hoá đơn/kỳ", mà lưu chỉ số
   * chưa phải phát hành hoá đơn. Cái chặn ở đây là `sent` — đã thành hoá đơn thì hết sửa.
   */
  const saveRoomElecReading = async (
    roomId: string,
    /** Có mã admin thì được chốt số KHÔNG CẦN ẢNH — xem `MeterOverrideModal`. */
    override?: { token: string; reason: string },
  ) => {
    if (!selectedProperty) return;
    const room = roomElecReadings.find(r => r.roomId === roomId);
    if (!room) return;
    if (room.sent) {
      showAlert(
        'Đã phát hành, không sửa được',
        `Chỉ số phòng ${room.roomCode} đã thành hoá đơn gửi cho ${room.tenantName}. `
          + 'Số sai thì nhờ admin huỷ hoá đơn rồi chốt lại.',
        undefined, '🔒',
      );
      return;
    }
    const newVal = Number(room.newReading);
    if (!newVal || newVal <= room.prevReading) {
      showAlert('Chỉ số không hợp lệ', 'Chỉ số mới phải lớn hơn chỉ số cũ.');
      return;
    }
    /*
      Ảnh đồng hồ là bằng chứng của con số. Thiếu ảnh thì BE chặn ngay tại lệnh lưu
      (`METER_PHOTO_REQUIRED`), nên chặn sớm ở đây để quản lý biết lúc còn đứng ở hiện
      trường, chứ không phải sau khi đã rời đi.

      Nhưng KHÔNG bỏ mặc ở đó: đồng hồ hỏng, phòng khoá, chỗ đặt công tơ không giơ máy vào
      nổi — những chuyện có thật. BE nhận `overrideToken` đúng cho tình huống này, nên chỗ
      này phải mở được cửa đó thay vì chỉ đọc cho người ta nghe là "đi xin mã đi".
    */
    if (!room.meterImageUrl && !override) {
      showAlert(
        'Thiếu ảnh đồng hồ',
        `Phòng ${room.roomCode} chưa có ảnh mặt đồng hồ. Chụp ảnh là xong.\n\n`
          + 'Nếu thật sự không chụp được (đồng hồ hỏng, không vào được phòng), xin admin '
          + 'cấp mã 6 số rồi nhập vào đây — mọi lần dùng mã đều được ghi vết kèm lý do.',
        [
          { text: 'Để chụp lại', style: 'cancel' },
          { text: 'Xin mã admin', onPress: () => setOverrideRoomId(roomId) },
        ],
        '📷',
      );
      return;
    }

    const consumption = roundConsumption(Math.max(newVal - room.prevReading, 0));
    setSavingRoomId(roomId);
    try {
      const result = await savedMeterReadingService.save({
        propertyId: Number(selectedProperty.id),
        roomId: Number(room.roomId),
        period: meterReadingPeriodIso(),
        utilityType: 'ELECTRICITY',
        prevReading: room.prevReading,
        newReading: newVal,
        meterImageUrl: room.meterImageUrl,
        overrideToken: override?.token,
        overrideReason: override?.reason,
      });

      /*
        ĐỌC `invoiceId` TRẢ VỀ, đừng mặc định là "đã chốt, đang chờ".

        Máy chủ phát hành NGAY trong chính lệnh lưu này nếu hoá đơn EVN của kỳ đã có sẵn —
        tức là quản lý chốt muộn, sau khi admin đã đẩy giấy lên. Khi đó khách nhận hoá đơn
        lập tức. Báo "khách CHƯA nhận gì" trong đúng tình huống đó là nói ngược sự thật, và
        thẻ phòng sẽ nằm sai trạng thái cho tới lần mở lại màn hình.
      */
      const issuedNow = result?.invoiceId != null;
      setRoomElecReadings(prev => prev.map(r =>
        r.roomId === roomId
          ? { ...r, consumption, saved: true, editing: false, sent: issuedNow }
          : r,
      ));
      if (issuedNow) {
        setElecSentKeys(prev => new Set(prev).add(room.roomId));
        setUtilReloadKey(k => k + 1);
      }
      showAlert(
        issuedNow ? 'Đã gửi hoá đơn' : 'Đã chốt số',
        issuedNow
          ? `Phòng ${room.roomCode}: ${consumption} kWh. Admin đã đẩy hoá đơn EVN của kỳ này từ `
            + `trước, nên hệ thống tính tiền và gửi thẳng cho ${room.tenantName} luôn.`
          : `Phòng ${room.roomCode}: ${consumption} kWh. Chỉ số nằm chờ, khách CHƯA nhận gì. `
            + 'Hoá đơn sẽ tự phát hành khi admin đẩy hoá đơn EVN của kỳ này.',
        undefined, '✅',
      );
    } catch (e: any) {
      /*
        `READING_ALREADY_ISSUED` = admin vừa đẩy hoá đơn EVN trong lúc quản lý còn đang mở
        màn này, nên chỉ số đã thành hoá đơn trong tay khách. Chỉ hiện lỗi thôi là để lại
        một cái thẻ phòng nói "chưa chốt" bên cạnh một nút bấm vào là báo lỗi — quản lý sẽ
        bấm lại vài lần rồi tưởng app hỏng. Nạp lại để màn hình tự kể đúng chuyện.
      */
      if (e?.response?.data?.code === 'READING_ALREADY_ISSUED') {
        showAlert(
          'Hoá đơn vừa phát hành',
          `Admin đã đẩy hoá đơn EVN của kỳ này, chỉ số phòng ${room.roomCode} đã thành hoá đơn `
            + 'gửi cho khách. Số sai thì nhờ admin huỷ hoá đơn rồi chốt lại.',
          undefined, '🔒',
        );
        if (selectedPropertyId) void enterElecReadings(selectedPropertyId);
        return;
      }
      showAlert('Lỗi', e?.response?.data?.message || e?.message || 'Không lưu được chỉ số.');
    } finally {
      setSavingRoomId(null);
    }
  };

  /** Chốt MỌI phòng đã nhập đủ chỉ số + ảnh mà chưa lưu — bản gộp của hàm trên. */
  const saveAllElecReadings = async () => {
    if (!selectedProperty) return;
    const targets = roomElecReadings.filter(r =>
      !r.sent && !r.saved && r.meterImageUrl
      && r.newReading && Number(r.newReading) > r.prevReading);
    if (!targets.length) {
      showAlert('Chưa có gì để chốt', 'Các phòng còn lại chưa có ảnh đồng hồ hoặc chưa nhập chỉ số hợp lệ.');
      return;
    }

    /*
      `allSettled` chứ không `all`: một phòng lỗi thì các phòng còn lại vẫn phải được lưu.
      Đây đúng là bài học của luồng gửi hoá đơn cả loạt ngày 18/08/2026 — `Promise.all`
      dừng giữa chừng và quản lý không biết phòng nào đã đi, phòng nào chưa.
    */
    setSavingRoomId('__all__');
    const results = await Promise.allSettled(targets.map(r =>
      savedMeterReadingService.save({
        propertyId: Number(selectedProperty.id),
        roomId: Number(r.roomId),
        period: meterReadingPeriodIso(),
        utilityType: 'ELECTRICITY',
        prevReading: r.prevReading,
        newReading: Number(r.newReading),
        meterImageUrl: r.meterImageUrl,
      })));
    setSavingRoomId(null);

    // Cùng lý do với hàm chốt lẻ ở trên: `invoiceId` trong kết quả nói phòng đó đã thành
    // hoá đơn ngay hay còn nằm chờ. Hai trạng thái này hiện khác nhau trên thẻ phòng.
    const okIds = new Set<string>();
    const issuedIds = new Set<string>();
    targets.forEach((r, i) => {
      const res = results[i];
      if (res.status !== 'fulfilled') return;
      okIds.add(r.roomId);
      if (res.value?.invoiceId != null) issuedIds.add(r.roomId);
    });

    setRoomElecReadings(prev => prev.map(r => {
      if (!okIds.has(r.roomId)) return r;
      const consumption = roundConsumption(Math.max(Number(r.newReading) - r.prevReading, 0));
      return { ...r, consumption, saved: true, editing: false, sent: issuedIds.has(r.roomId) };
    }));
    if (issuedIds.size > 0) {
      setElecSentKeys(prev => new Set([...prev, ...issuedIds]));
      setUtilReloadKey(k => k + 1);
    }

    const failed = targets.length - okIds.size;
    const tail = issuedIds.size === okIds.size && okIds.size > 0
      ? 'Hoá đơn EVN của kỳ đã có sẵn nên hệ thống gửi thẳng cho khách luôn.'
      : issuedIds.size > 0
        ? `${issuedIds.size} phòng đã gửi hoá đơn cho khách, số còn lại nằm chờ admin đẩy hoá đơn EVN.`
        : 'Hoá đơn sẽ tự phát hành khi admin đẩy hoá đơn EVN của kỳ này.';
    showAlert(
      failed ? 'Chốt xong một phần' : 'Đã chốt số',
      failed
        ? `${okIds.size}/${targets.length} phòng đã chốt. ${failed} phòng lỗi — thử lại từng phòng để xem lý do.`
        : `${okIds.size} phòng đã chốt số. ${tail}`,
      undefined, failed ? '⚠️' : '✅',
    );
  };

  /**
   * Gửi hóa đơn ĐIỆN cho nhà NGUYÊN CĂN — gửi thẳng, KHÔNG cần chụp đồng hồ.
   *
   * Cả căn nhà chỉ có một khách, và hoá đơn EVN admin đẩy xuống đã là hoá đơn của đúng
   * căn đó: tiền phải thu = đúng tổng tiền EVN, số điện tiêu thụ = đúng tổng kWh EVN.
   * Bắt manager leo lên chụp đồng hồ chỉ để chép lại con số đã biết là việc thừa —
   * đó là lý do bước 3 bị bỏ cho nhà nguyên căn từ 13/08/2026.
   *
   * Chỉ số ghi vào hoá đơn vẫn liên tục để kỳ sau còn mốc: newReading = chỉ số cũ + tổng
   * kWh của kỳ. (Nhà theo phòng thì ngược lại — vẫn phải chụp từng đồng hồ, vì đơn giá
   * dùng chung nhưng mỗi phòng tiêu thụ khác nhau.)
   */
  /**
   * `sendWholeHouseElec` đã XOÁ 18/08/2026 cùng nút "⚡ Gửi hóa đơn" của luồng nguyên căn.
   *
   * BE nay tự phát hành hoá đơn nguyên căn cho khách ngay khi admin tải hoá đơn lên
   * (`createFromWholeHouseBill`, cùng transaction). Giữ hàm này lại thì nó chỉ còn một
   * kết cục: gọi API rồi nhận `INVOICE_ALREADY_EXISTS`. Nhà chia phòng vẫn dùng
   * `sendRoomInvoices` như cũ.
   */


  // ── Water helpers ──────────────────────────────────────────────────────────
  // Nước KHÔNG đổi luồng (13/08/2026): manager vẫn tự nhập hoá đơn nước của cả nhà rồi
  // chia theo chỉ số từng phòng. Chỉ thêm khoá "1 khách 1 hoá đơn/kỳ" như bên điện.
  const initRoomWaterReadings = async (propId: string, period: string) => {
    const prop = properties.find(p => p.id === propId);
    if (!prop) return;
    const { lastReadings, sentKeys, issuedQty, delivery, issued } = await fetchRoomHistory(propId, 'WATER', period);
    setWaterDelivery(delivery);
    setWaterIssued(issued);
    setWaterIssuedQty(issuedQty);
    setWaterSentKeys(sentKeys);
    const rows: RoomWaterReading[] = prop.rooms.map(r => ({
      roomId: r.id, roomCode: r.code, tenantName: r.tenantName,
      prevReading: lastReadings.get(r.id) ?? r.prevWater,
      prevSource: lastReadings.has(r.id) ? 'last_invoice' : 'handover',
      newReading: '',
      // Dùng chung model với điện: có ảnh đồng hồ và cờ đã gửi từng phòng.
      hasPhoto: false,
      sent: sentKeys.has(r.id),
    }));

    /**
     * NHÀ NGUYÊN CĂN: BỎ QUA bước ghi chỉ số, đi thẳng tới Xem trước — giống hệt bên điện.
     *
     * Cả căn một khách, số phải thu đã nằm sẵn trên hoá đơn admin (tổng m³ + tổng tiền).
     * Bắt manager leo lên đọc đồng hồ chỉ để chép một con số KHÔNG được dùng vào tính tiền
     * là việc thừa — mà còn gây hiểu nhầm: số đọc được (5 m³) khác số trên hoá đơn (4 m³)
     * thì manager tưởng mình nhập sai.
     *
     * Chỉ số vẫn được ghi để kỳ sau còn mốc, nhưng suy ra từ hoá đơn:
     * `newReading = prevReading + tổng m³` (xem chỗ gửi hoá đơn nguyên căn).
     */
    /*
      Nhánh NHÀ NGUYÊN CĂN đã bỏ 18/08/2026: admin phát hành là hệ thống gửi thẳng cho
      khách, quản lý không còn bước nào ở tab nước. Trước đây nhánh này dựng sẵn số rồi
      nhảy tới "Xem trước & gửi" — bấm gửi bây giờ chỉ nhận `INVOICE_ALREADY_EXISTS`.
    */

    setRoomWaterReadings(rows);
    setWaterStep('room_readings');
  };

  /**
   * Nạp hoá đơn nước ADMIN đã chốt cho kỳ hiện tại.
   * `null` = admin chưa đẩy → màn hiện trạng thái CHỜ, KHÔNG mở form nhập tay. Cho
   * manager tự khai lại đơn giá chính là thứ thay đổi 14/08/2026 loại bỏ.
   */
  const loadWaterBill = async (propId: string) => {
    setWaterBillLoading(true);
    setWaterBillError(null);
    setWaterBill(null);
    try {
      const { month, year } = currentPeriod();
      setWaterBill(await managerWaterBillService.getForPeriod(Number(propId), month, year));
    } catch (e: any) {
      setWaterBillError(
        e?.response?.data?.message || e?.message || 'Không tải được hoá đơn nước của kỳ này.',
      );
    } finally {
      setWaterBillLoading(false);
    }
  };

  const handleWaterBillSubmit = () => {
    if (!waterBill || !waterPropertyId) return;
    // Đơn giá GIỮ NGUYÊN phần thập phân: BE ép `tiêu thụ × đơn giá == thành tiền`, đưa số
    // đã làm tròn vào là lệch vài đồng rồi bị chặn — đúng lỗi đã dính bên điện.
    setWaterBillData({
      totalAmount: waterBill.totalAmount,
      billingPeriod: waterBill.billingPeriod,
      totalQuantity: waterBill.totalQuantity,
      pricePerM3: waterUnitPrice(waterBill),
    });
    initRoomWaterReadings(waterPropertyId, waterBill.billingPeriod);
  };

  /**
   * `calculateWaterFees` đã xoá 18/08/2026 cùng bước "Xem trước": tiền của từng phòng nay
   * tính ngay trên thẻ phòng (xem khối `waterStep === 'room_readings'`) rồi gửi lẻ, nên
   * không còn lúc nào phải tính sẵn cho cả nhà.
   */


  /** Đơn giá 1 m³ admin đã chốt cho kỳ này. 0 khi chưa có hoá đơn nước. */
  const waterUnitPriceExact = waterBill ? waterUnitPrice(waterBill) : 0;

  // Cập nhật 1 phòng trong danh sách chỉ số nước (nhập tay chỉ số cũ / mới).
  const updateRoomWater = (roomId: string, patch: Partial<RoomMeterReading>) =>
    setRoomWaterReadings(prev => prev.map(r => (r.roomId === roomId ? { ...r, ...patch } : r)));

  /**
   * Gửi hoá đơn NƯỚC cho 1 phòng — bản song sinh của `sendSingleRoomElec`.
   *
   * Từ 18/08/2026 nước đi đúng luồng của điện: gửi từng phòng ngay tại chỗ thay vì gom
   * hết rồi bấm "Gửi hoá đơn nước" một lượt. Lý do đổi: gửi cả loạt thì một phòng lỗi
   * (khách đã nhận kỳ này, chỉ số không hợp lệ) làm cả mẻ dừng giữa chừng, mà manager
   * không biết phòng nào đã đi phòng nào chưa. Gửi lẻ thì mỗi phòng tự chịu trách nhiệm
   * và trạng thái hiện ngay trên thẻ phòng đó.
   */
  const sendSingleRoomWater = async (roomId: string) => {
    if (!waterBill || !waterProperty) return;
    const room = roomWaterReadings.find(r => r.roomId === roomId);
    if (!room) return;
    if (blockedFromSending('WATER', room.roomId, `Phòng ${room.roomCode} (${room.tenantName})`)) return;
    const newVal = Number(room.newReading);
    if (!newVal || newVal <= room.prevReading) {
      showAlert('Chỉ số không hợp lệ', 'Chỉ số mới phải lớn hơn chỉ số cũ.');
      return;
    }
    const consumption = roundConsumption(Math.max(newVal - room.prevReading, 0));
    const fee         = Math.round(consumption * waterUnitPriceExact);

    try {
      await realManagerInvoiceService.createRoomUtilityInvoice(
        Number(waterProperty.id), Number(room.roomId),
        {
          type: 'WATER', billingPeriod: waterBill.billingPeriod,
          prevReading: room.prevReading, newReading: newVal, consumption,
          // Đơn giá giữ NGUYÊN phần thập phân: BE ép `tiêu thụ × đơn giá == thành tiền`,
          // đưa số đã làm tròn vào là lệch vài đồng và bị chặn AMOUNT_MISMATCH.
          unitPrice: waterUnitPriceExact, amount: fee, meterImageUrl: room.meterImageUrl,
        },
      );
      setRoomWaterReadings(prev => prev.map(r =>
        r.roomId === roomId ? { ...r, consumption, fee, sent: true } : r,
      ));
      setWaterSentKeys(prev => new Set(prev).add(room.roomId));
      setUtilReloadKey(k => k + 1);
      showAlert('Đã gửi', `Hóa đơn nước phòng ${room.roomCode} · ${fmt(fee)} đã gửi cho ${room.tenantName}.`);
    } catch (e: any) {
      showAlert('Lỗi', e?.response?.data?.message || e?.message || 'Không gửi được hóa đơn nước.');
    }
  };

  /** Gửi nước cho MỌI phòng còn thiếu — bản song sinh của `sendAllUnsent` bên điện. */
  const sendAllUnsentWater = async () => {
    if (!waterBill || !waterProperty) return;
    const targets = roomWaterReadings.filter(
      r => !r.sent && r.newReading && Number(r.newReading) > r.prevReading,
    );
    if (targets.length === 0) {
      showAlert('Chưa có phòng nào để gửi', 'Nhập chỉ số mới lớn hơn chỉ số cũ trước đã.');
      return;
    }
    for (const room of targets) {
      // Gửi tuần tự: BE khoá theo (phòng, kỳ) nên bắn song song dễ dính khoá lẫn nhau,
      // và gửi tuần tự thì lỗi ở phòng nào cũng không ảnh hưởng phòng đã gửi trước đó.
      await sendSingleRoomWater(room.roomId);
    }
  };

  /**
   * `sendWaterInvoices` (gửi cả loạt) đã xoá 18/08/2026 — thay bằng `sendSingleRoomWater`
   * + `sendAllUnsentWater`, đúng cách bên điện đang làm.
   */


  const resetElec = () => {
    setSelectedPropertyId(null); setEvnBill(null); setEvnBillError(null);
    setElecReadingsError(null);
    setElecStep('select_property'); setRoomElecReadings([]); setElecSentKeys(new Set());
    setElecHouseSent(false);
  };

  const resetWater = () => {
    setWaterPropertyId(null); setWaterBillData(null); setWaterBill(null); setWaterBillError(null);
    setWaterStep('select_property'); setRoomWaterReadings([]);
    setWaterBillForm({ totalAmount: '', billingPeriod: monthPeriod(), pricePerM3: '20000' });
  };

  // ───────────────────────────── RENDER ──────────────────────────────────────

  /**
   * Ảnh đồng hồ đã chụp của 1 phòng + nút xoá (ảnh này được gửi kèm hoá đơn nên phải sửa được).
   * `utility` để xoá đúng danh sách — điện và nước dùng chung hàm này.
   *
   * `readOnly` cho ảnh ĐÃ NẰM TRÊN MÁY CHỦ (chỉ số điện đã chốt): nút xoá ở đó chỉ gỡ ảnh
   * khỏi state của app, ảnh trên máy chủ vẫn nguyên — quản lý bấm xong tưởng đã xoá, rồi
   * hoá đơn phát hành ra vẫn kèm đúng tấm ảnh đó. Muốn đổi ảnh thì bấm "Sửa chỉ số" rồi
   * chụp lại, lúc đó bản lưu mới thật sự bị ghi đè.
   */
  const renderMeterPhoto = (
    r: RoomMeterReading,
    utility: MeterUtility = 'elec',
    readOnly = false,
  ) => {
    if (!r.meterImageUrl) return null;
    return (
      <View style={styles.meterThumbRow}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => setZoomImage(r.meterImageUrl!)}>
          <Image source={{ uri: r.meterImageUrl }} style={styles.meterThumb} resizeMode="cover" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.meterThumbLabel}>Ảnh đồng hồ đã chụp</Text>
          <Text style={styles.meterThumbHint}>
            {readOnly ? 'Đã lưu cùng chỉ số · sẽ gửi kèm hoá đơn' : 'Sẽ gửi kèm hoá đơn'}
          </Text>
        </View>
        {!readOnly && (
          <TouchableOpacity
            style={styles.meterThumbRemove}
            onPress={() => clearRoomMeterPhoto(r.roomId, utility)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.meterThumbRemoveText}>🗑 Xoá</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderElecTab = () => {
    /*
      Kỳ của tab Điện là KỲ CHỐT SỐ, không phải kỳ tính tiền — hai thứ chỉ lệch nhau đúng
      ngày cuối tháng, nhưng đúng cái ngày đó mới là ngày quản lý phải đi chụp. Xem
      `meterReadingPeriod` trong constants/utilityCycle.
    */
    const { month: readMonth, year: readYear } = meterReadingPeriod();
    const periodLabel = `${String(readMonth).padStart(2, '0')}/${readYear}`;
    const deadline = meterReadingDeadline();

    if (elecStep === 'done') {
      const savedCount = roomElecReadings.filter(r => r.saved || r.sent).length;
      return (
        <View style={styles.doneWrap}>
          <Text style={styles.doneEmoji}>✅</Text>
          <Text style={styles.doneTitle}>Đã chốt số kỳ {periodLabel}</Text>
          <Text style={styles.doneSub}>
            {savedCount}/{roomElecReadings.length} phòng đã có chỉ số và ảnh đồng hồ.
            {'\n\n'}Khách CHƯA nhận gì. Hoá đơn tự phát hành khi admin đẩy hoá đơn EVN của kỳ này —
            lúc đó bạn và khách đều được báo.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={resetElec}>
            <Text style={styles.primaryBtnText}>Chốt số nhà khác</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const stepIndex = elecStep === 'select_property' ? 0 : 1;

    /**
     * Việc còn lại của kỳ, dựng từ chính danh sách phòng đang hiện.
     *
     * Không lấy `roomsDone`/`readingDeadline` của hoá đơn EVN như trước: bốn field đó do BE
     * tính theo mốc CŨ (hạn = ngày admin phát hành) và chỉ tồn tại KHI đã có hoá đơn — mà
     * việc chụp bây giờ phải xong TRƯỚC lúc có hoá đơn. Đếm tại chỗ thì luôn có số để hiện.
     */
    const elecTask = {
      roomsTotal: roomElecReadings.length,
      roomsDone: roomElecReadings.filter(r => r.saved || r.sent).length,
      readingDeadline: deadline,
    };
    const savableRooms = roomElecReadings.filter(r =>
      !r.sent && !r.saved && r.meterImageUrl
      && r.newReading && Number(r.newReading) > r.prevReading);

    return (
      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        {/*
          HAI bước, không còn bước "Hoá đơn EVN" ở giữa (10/09/2026).

          Bước đó từng là cửa ải: không có hoá đơn thì không đi tiếp được. Nay hoá đơn EVN
          về sau khi quản lý đã chốt số, nên giữ nó làm một nấc bắt buộc là dựng lại đúng
          cái rào vừa gỡ. Số liệu EVN chuyển thành thẻ trạng thái trong bước chốt số.

          Nguyên căn vẫn 2 nấc nhưng nấc 2 là CHỈ XEM: hoá đơn EVN chính là hoá đơn của căn
          đó, máy chủ gửi thẳng cho khách lúc admin phát hành (BE `createFromWholeHouseBill`).
        */}
        <StepIndicator
          steps={isWholeHouse
            ? ['Chọn nhà', 'Hoá đơn đã gửi khách']
            : ['Chọn nhà', 'Chốt chỉ số']}
          current={stepIndex}
          note={METER_READING_RULE_TEXT}
        />

        {selectedPropertyId && (
          <SentInvoicePanel propertyId={selectedPropertyId} type="ELECTRICITY" reloadKey={utilReloadKey} />
        )}

        {/* ── BƯỚC 1: Chọn tòa nhà ─────────────────────────────────── */}
        {elecStep === 'select_property' && (
          <View>
            <SectionHeader title={`Nhà nào cần chốt số kỳ ${periodLabel}?`} />

            <PropertyPicker
              properties={properties}
              loading={loadingProps}
              error={errorProps}
              selectedId={selectedPropertyId}
              onSelect={setSelectedPropertyId}
              onRetry={() => { setLoadingProps(true); loadProperties(); }}
              showRoomCodes
            />

            {selectedPropertyId && (
              <TouchableOpacity
                style={[styles.primaryBtn, { marginTop: Spacing.md }]}
                onPress={() => enterElecReadings(selectedPropertyId)}
              >
                <Text style={styles.primaryBtnText}>Tiếp theo → Chốt chỉ số</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── BƯỚC 2: Chốt chỉ số từng phòng ───────────────────────── */}
        {elecStep === 'room_readings' && (
          <View>
            <SectionHeader
              title={isWholeHouse ? 'Hoá đơn điện của căn nhà' : `Chốt chỉ số điện kỳ ${periodLabel}`}
            />
            {selectedProperty && (
              <View style={styles.infoBanner}>
                <Text style={styles.infoBannerText}>
                  {selectedProperty.type === 'whole_house' ? '🏠' : '🏢'} {selectedProperty.name}
                  {selectedProperty.type === 'multi_room' && ` · ${selectedProperty.rooms.length} phòng`}
                </Text>
              </View>
            )}

            {/* Việc phải làm đứng TRƯỚC số liệu: quản lý mở màn này là để biết cần làm gì,
                không phải để ngắm tổng kWh. Nguyên căn không có việc nên không hiện. */}
            {!isWholeHouse && <MeterTaskBanner bill={elecTask} kind="elec" deadlineRule="month_end" />}

            {/* ── Thẻ trạng thái hoá đơn EVN của kỳ ── */}
            <View style={styles.card}>
              {evnBillLoading ? (
                <View style={styles.scanningRow}>
                  <ActivityIndicator color={Colors.primary} />
                  <Text style={styles.scanningText}>Đang tải hóa đơn điện của kỳ này...</Text>
                </View>
              ) : evnBillError ? (
                <View style={styles.evnWaitBox}>
                  <Text style={styles.evnWaitEmoji}>⚠️</Text>
                  <Text style={styles.evnWaitTitle}>Không tải được hóa đơn</Text>
                  <Text style={styles.evnWaitText}>{evnBillError}</Text>
                  <TouchableOpacity
                    style={[styles.primaryBtn, { marginTop: Spacing.md }]}
                    onPress={() => selectedPropertyId && enterElecReadings(selectedPropertyId)}
                  >
                    <Text style={styles.primaryBtnText}>Thử lại</Text>
                  </TouchableOpacity>
                </View>
              ) : !evnBill ? (
                /*
                  CHƯA CÓ HOÁ ĐƠN EVN — và đó là chuyện BÌNH THƯỜNG, không phải lỗi.

                  Đây là chỗ đổi nghĩa lớn nhất của màn hình. Câu cũ ("Chờ admin gửi hóa đơn
                  EVN … khi admin gửi xong bạn ghi chỉ số như bình thường") biến việc chụp
                  đồng hồ thành việc phải xếp hàng sau admin. Giấy nhà nước tháng sau mới về,
                  còn công tơ thì hết ngày cuối tháng là khép kỳ — chờ giấy là chỉ số đã trôi.
                */
                <View style={styles.evnWaitBox}>
                  <Text style={styles.evnWaitEmoji}>⏳</Text>
                  <Text style={styles.evnWaitTitle}>Admin chưa đẩy hoá đơn EVN kỳ {periodLabel}</Text>
                  <Text style={styles.evnWaitText}>
                    {isWholeHouse
                      ? 'Nhà nguyên căn không cần chụp đồng hồ: hoá đơn EVN chính là hoá đơn của căn này, '
                        + 'hệ thống gửi thẳng cho khách ngay khi admin đẩy lên.'
                      : 'Không sao — cứ chốt chỉ số bên dưới. Khách CHƯA nhận gì cả.\n\n'
                        + 'Khi admin đẩy hoá đơn EVN của kỳ này lên, hệ thống tự nhân đơn giá với chỉ số '
                        + 'bạn đã chốt rồi gửi hoá đơn thẳng cho từng khách. Bạn và khách đều được báo lúc đó.'}
                  </Text>
                  <TouchableOpacity
                    style={[styles.primaryBtn, { marginTop: Spacing.md }]}
                    onPress={() => selectedPropertyId && enterElecReadings(selectedPropertyId)}
                  >
                    <Text style={styles.primaryBtnText}>🔄 Kiểm tra lại</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={styles.evnResult}>
                    <View style={styles.evnResultHeader}>
                      <Text style={styles.evnResultTitle}>Admin đã chốt cho kỳ này</Text>
                      <View style={[styles.badge, styles.badgeDone]}>
                        <Text style={[styles.badgeText, { color: Colors.success }]}>Chỉ đọc</Text>
                      </View>
                    </View>
                    <EVNDataRow label="Tổng điện"     value={`${evnBill.totalKwh.toLocaleString('vi-VN')} kWh`} />
                    <EVNDataRow label="Tổng tiền"     value={fmt(evnBill.totalAmount)} />
                    <EVNDataRow label="Đơn giá điện"  value={`${fmt(elecUnitPrice)}/kWh`} highlight />
                    <EVNDataRow label="Kỳ thanh toán" value={evnBill.billingPeriod} />
                  </View>

                  {!!evnBill.imageUrl && (
                    <View style={styles.thumbWrap}>
                      {/* Bấm để phóng to — ảnh hoá đơn EVN chữ nhỏ, xem ở khung thu
                          nhỏ trên điện thoại thì không đọc nổi số để đối chiếu. */}
                      <TouchableOpacity activeOpacity={0.8} onPress={() => setZoomImage(evnBill.imageUrl!)}>
                        <Image source={{ uri: evnBill.imageUrl }} style={styles.evnThumb} resizeMode="contain" />
                      </TouchableOpacity>
                      <Text style={styles.meterThumbHint}>Ảnh hóa đơn gốc admin tải lên — dùng để đối chiếu với khách.</Text>
                    </View>
                  )}

                  <Text style={styles.cardDesc}>
                    {isWholeHouse
                      ? 'Hoá đơn này đã được phát hành cho khách thuê ngay khi admin tải lên — '
                        + 'khách xem và thanh toán trong app của họ. Bạn không cần chụp đồng hồ hay gửi gì; '
                        + 'mục này để đối chiếu khi khách thắc mắc.'
                      : `Hệ thống đã tính theo đơn giá ${fmt(elecUnitPrice)}/kWh và gửi hoá đơn cho các phòng `
                        + 'đã chốt số. Phòng nào còn thiếu chỉ số thì chốt nốt bên dưới — hoá đơn phát hành ngay sau đó.'}
                  </Text>
                </>
              )}
            </View>

            {isWholeHouse ? (
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={() => setElecStep('select_property')}>
                  <Text style={styles.secondaryBtnText}>← Quay lại</Text>
                </TouchableOpacity>
                {evnBill && (
                  <View style={[styles.readonlyNote, { flex: 1, marginLeft: Spacing.sm }]}>
                    <Text style={styles.readonlyNoteText}>
                      ✓ Khách đã nhận hoá đơn · {fmt(evnBill.totalAmount)}
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <>
                {/* Nạp hụt chỉ số đã chốt: nói ra, đừng để danh sách trống giả làm "chưa ai chốt". */}
                {!!elecReadingsError && (
                  <View style={styles.evnWaitBox}>
                    <Text style={styles.evnWaitEmoji}>⚠️</Text>
                    <Text style={styles.evnWaitTitle}>Không tải được chỉ số đã chốt</Text>
                    <Text style={styles.evnWaitText}>
                      {elecReadingsError}
                      {'\n\n'}Các phòng bên dưới có thể đang hiện là "chưa chốt" dù thực tế đã chốt rồi.
                      Tải lại trước khi nhập để khỏi chốt đè.
                    </Text>
                    <TouchableOpacity
                      style={[styles.primaryBtn, { marginTop: Spacing.md }]}
                      onPress={() => selectedPropertyId && enterElecReadings(selectedPropertyId)}
                    >
                      <Text style={styles.primaryBtnText}>🔄 Tải lại</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/*
                  Phòng bị loại khỏi kỳ phải được NÓI RA. Không nói thì quản lý mở nhà 4
                  phòng ra thấy 1 phòng, hoặc thấy trống trơn, và không có cách nào biết đó
                  là đúng hay là app hỏng — rồi sẽ đi hỏi admin.
                */}
                {elecSkippedRooms > 0 && (
                  <View style={styles.infoBanner}>
                    <Text style={styles.infoBannerText}>
                      {roomElecReadings.length === 0
                        ? `Kỳ ${periodLabel} chưa có phòng nào để chốt: cả ${elecSkippedRooms} phòng đều đón khách sau khi kỳ này khép. Tiền điện của kỳ này thuộc quãng nhà còn trống, công ty chịu.`
                        : `Đã bỏ qua ${elecSkippedRooms} phòng đón khách sau khi kỳ ${periodLabel} khép — khách chưa ở thì không có số điện của kỳ này để thu.`}
                    </Text>
                  </View>
                )}

                <View style={styles.progressRow}>
                  <Text style={styles.progressText}>
                    Đã chốt: {elecTask.roomsDone}/{elecTask.roomsTotal} phòng
                  </Text>
                  {savableRooms.length > 0 && (
                    <TouchableOpacity
                      style={styles.sendAllBtn}
                      onPress={saveAllElecReadings}
                      disabled={savingRoomId === '__all__'}
                    >
                      {savingRoomId === '__all__'
                        ? <ActivityIndicator color={Colors.primary} />
                        : (
                          <Text style={styles.sendAllBtnText}>
                            {/* Cùng lý do với nút của từng phòng: có hoá đơn EVN rồi thì
                                bấm cái này là gửi cho cả loạt khách, không phải lưu nháp. */}
                            {evnBill ? 'Chốt & gửi' : 'Chốt'} {savableRooms.length} phòng →
                          </Text>
                        )}
                    </TouchableOpacity>
                  )}
                </View>

                {/* Hạn mức chỉ có nghĩa khi đã biết tổng trên giấy nhà nước. Chưa có hoá đơn
                    EVN thì không có gì để so — `QuotaBar` tự trả null, để đây cho rõ ý. */}
                <QuotaBar
                  total={evnBill?.totalKwh ?? 0}
                  serverCap={evnBill?.roomSumCap}
                  issued={evnBill?.roomSumQuantity ?? elecIssuedQty}
                  pending={pendingElecQty}
                  unit="kWh"
                  billedRooms={billedElecRooms}
                  totalRooms={roomElecReadings.length}
                />

                {roomElecReadings.map(r => {
                  /*
                    BA trạng thái của một phòng, và chúng không thể lẫn nhau:
                      • đã phát hành (`sent`) — chỉ số đã thành tiền trong tay khách, hết sửa
                      • đã chốt, chờ phát hành (`saved`) — số nằm trên máy chủ, khách chưa thấy
                      • chưa chốt — còn phải đi chụp
                    Trạng thái giữa là thứ luồng cũ không có; thiếu nó thì quản lý chụp xong
                    không biết mình đã xong việc hay chưa.
                  */
                  const showForm = !r.sent && (!r.saved || r.editing);
                  const newVal = Number(r.newReading);
                  const validReading = !!r.newReading && newVal > r.prevReading;
                  const consumption = validReading
                    ? roundConsumption(newVal - r.prevReading)
                    : null;
                  return (
                    <View key={r.roomId} style={[styles.roomCard, r.sent && styles.roomCardSent]}>
                      <View style={styles.roomCardHeader}>
                        <View>
                          <Text style={styles.roomCode}>{r.roomCode}</Text>
                          <Text style={styles.roomTenant}>{r.tenantName}</Text>
                        </View>
                        <View style={[
                          styles.badge,
                          r.sent ? styles.badgeSent : r.saved ? styles.badgeDone : styles.badgePending,
                        ]}>
                          <Text style={[styles.badgeText, {
                            color: r.sent ? Colors.white : r.saved ? Colors.success : Colors.textMuted,
                          }]}>
                            {r.sent ? '✓ Đã gửi khách' : r.saved ? '✓ Đã chốt số' : 'Chưa chốt'}
                          </Text>
                        </View>
                      </View>

                      {(r.sent || r.saved) && (
                        <Text style={styles.prevReading}>Chỉ số cũ: {r.prevReading} kWh</Text>
                      )}

                      {r.sent ? (
                        /* Đã phát hành: tóm tắt + đường mở lại xem. Không có nút sửa —
                           hoá đơn đã tới tay khách thì sửa ở đây là sửa sau lưng họ. */
                        <View style={styles.sentSummary}>
                          <Text style={styles.sentSummaryText}>
                            {r.consumption != null
                              ? `${r.consumption} kWh · ${fmt(r.fee ?? Math.round(r.consumption * elecUnitPrice))} — đã gửi hóa đơn`
                              : 'Đã gửi hóa đơn điện của kỳ này'}
                          </Text>
                          <DeliveryLine state={elecDelivery.get(r.roomId)} />
                          <ViewIssuedButton
                            invoice={elecIssued.get(r.roomId)}
                            unit="kWh"
                            onOpen={setIssuedView}
                          />
                        </View>
                      ) : r.saved && !r.editing ? (
                        /* Đã chốt, CHỜ PHÁT HÀNH — cố tình không hiện số tiền chắc nịch khi
                           chưa có hoá đơn EVN: đơn giá của kỳ chưa tồn tại, đoán ra một con
                           số ở đây là đưa quản lý cái giá họ sẽ đọc cho khách nghe. */
                        <View style={styles.sentSummary}>
                          <Text style={styles.sentSummaryText}>
                            {r.prevReading} → {r.newReading} kWh
                            {r.consumption != null ? ` · tiêu thụ ${r.consumption} kWh` : ''}
                          </Text>
                          <Text style={styles.prevReading}>
                            {evnBill
                              ? `Đang chờ hệ thống phát hành · tạm tính ${fmt(Math.round((r.consumption ?? 0) * elecUnitPrice))}`
                              : 'Khách chưa nhận gì. Tiền tính khi admin đẩy hoá đơn EVN của kỳ này.'}
                          </Text>
                          {renderMeterPhoto(r, 'elec', true)}
                          <TouchableOpacity
                            style={[styles.secondaryBtn, { marginTop: Spacing.sm }]}
                            onPress={() => editRoomElecReading(r.roomId)}
                          >
                            <Text style={styles.secondaryBtnText}>✏️ Sửa chỉ số</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}

                      {showForm && (
                        <>
                          <Text style={styles.formLabel}>Chỉ số cũ ({prevSourceLabel(r.prevSource)})</Text>
                          <TextInput
                            style={styles.input}
                            keyboardType="numeric"
                            placeholder="Nhập chỉ số tháng trước"
                            value={r.prevReading ? String(r.prevReading) : ''}
                            onChangeText={t => updateRoomElec(r.roomId, { prevReading: Number(readingDigits(t)) || 0 })}
                          />
                          <Text style={styles.formLabel}>Chỉ số mới (chốt kỳ {periodLabel})</Text>
                          <View style={styles.readingRow}>
                            <TextInput
                              style={[styles.input, { flex: 1, marginRight: Spacing.sm }]}
                              keyboardType="numeric"
                              placeholder={`> ${r.prevReading}`}
                              value={r.newReading}
                              onChangeText={t => updateRoomElec(r.roomId, { newReading: readingDigits(t) })}
                            />
                            <TouchableOpacity
                              style={styles.ocrBtn}
                              onPress={() => askPhotoSource({ kind: 'meter', utility: 'elec', roomId: r.roomId })}
                              disabled={ocrRoomId === r.roomId}
                            >
                              {ocrRoomId === r.roomId
                                ? <ActivityIndicator color={Colors.primary} />
                                : <Text style={styles.ocrBtnText}>📷 OCR</Text>}
                            </TouchableOpacity>
                          </View>
                          <Text style={styles.prevReading}>📷 Chụp đồng hồ để tự đọc, hoặc nhập tay số ở trên.</Text>
                          {renderMeterPhoto(r)}
                          {validReading && (
                            <>
                              <View style={styles.calcPreview}>
                                <Text style={styles.calcPreviewText}>
                                  {/* Có hoá đơn EVN thì hiện luôn thành tiền; chưa có thì CHỈ
                                      hiện tiêu thụ. Mượn đơn giá kỳ trước vào đây là đưa quản
                                      lý một con số họ sẽ đọc cho khách nghe. */}
                                  {evnBill
                                    ? `${consumption} kWh × ${fmt(elecUnitPrice)}/kWh = ${fmt(Math.round((consumption ?? 0) * elecUnitPrice))}`
                                    : `Tiêu thụ ${consumption} kWh · thành tiền tính khi admin đẩy hoá đơn EVN`}
                                </Text>
                              </View>
                              {/*
                                NÚT NÓI ĐÚNG THỨ NÓ SẮP LÀM.

                                Chưa có hoá đơn EVN thì bấm là chốt số, sửa lại được thoải
                                mái. Nhưng nếu admin đã đẩy giấy lên rồi (quản lý chốt muộn),
                                máy chủ phát hành NGAY trong chính lệnh này — tiền tới tay
                                khách và hết đường sửa. Hai việc khác hẳn nhau về mức không
                                thể quay lại, nên không được dùng chung một chữ "Chốt số".
                              */}
                              <TouchableOpacity
                                style={styles.sendRoomBtn}
                                onPress={() => saveRoomElecReading(r.roomId)}
                                disabled={savingRoomId === r.roomId}
                              >
                                {savingRoomId === r.roomId
                                  ? <ActivityIndicator color={Colors.white} />
                                  : (
                                    <Text style={styles.sendRoomBtnText}>
                                      {evnBill
                                        ? `⚡ Chốt & gửi hoá đơn · ${fmt(Math.round((consumption ?? 0) * elecUnitPrice))}`
                                        : `💾 Chốt số phòng ${r.roomCode} · ${consumption} kWh`}
                                    </Text>
                                  )}
                              </TouchableOpacity>
                              {!!evnBill && (
                                <Text style={styles.prevReading}>
                                  Admin đã đẩy hoá đơn EVN kỳ này — bấm là khách nhận hoá đơn ngay,
                                  không sửa lại được.
                                </Text>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </View>
                  );
                })}

                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={() => setElecStep('select_property')}>
                    <Text style={styles.secondaryBtnText}>← Đổi nhà</Text>
                  </TouchableOpacity>
                  {roomElecReadings.length > 0 && roomElecReadings.every(r => r.saved || r.sent) && (
                    <TouchableOpacity
                      style={[styles.sendBtn, { flex: 1, marginLeft: Spacing.sm }]}
                      onPress={() => setElecStep('done')}
                    >
                      <Text style={styles.sendBtnText}>Hoàn tất ✓</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
    );
  };

  /**
   * Đủ điều kiện sang bước ghi chỉ số: đã chọn nhà VÀ admin đã chốt hoá đơn nước kỳ này.
   *
   * Trước 14/08/2026 điều kiện là "manager đã gõ đủ tổng tiền + đơn giá + kỳ" — cùng với
   * `waterEstimate` (ước lượng m³ để manager tự soi lệch số 0). Cả hai bỏ đi theo form
   * nhập tay: số giờ lấy từ hoá đơn admin phát hành, không còn gì để gõ sai.
   */
  const waterReady = !!waterPropertyId && !!waterBill;

  const renderWaterTab = () => {
    if (waterStep === 'done') {
      return (
        <View style={styles.doneWrap}>
          <Text style={styles.doneEmoji}>✅</Text>
          <Text style={styles.doneTitle}>Đã gửi hóa đơn nước!</Text>
          <Text style={styles.doneSub}>Hóa đơn nước đã được gửi đến {roomWaterReadings.length} phòng.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={resetWater}>
            <Text style={styles.primaryBtnText}>Ghi chỉ số mới</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.tabContent} showsVerticalScrollIndicator={false}>
        {/* Nước đi đúng luồng điện: gửi từng phòng ngay ở bước chỉ số, không còn
            bước "Xem trước & gửi" gộp cả nhà. */}
        {/* Cùng khuôn 3 bước với tab Điện — xem chú thích ở `type ElecStep`. */}
        <StepIndicator
          steps={['Chọn nhà', 'Hoá đơn nước', 'Chỉ số phòng']}
          current={waterStep === 'select_property' ? 0 : waterStep === 'bill_entry' ? 1 : 2}
          note={UTILITY_WINDOW_TEXT}
        />

        {waterPropertyId && (
          <SentInvoicePanel propertyId={waterPropertyId} type="WATER" reloadKey={utilReloadKey} />
        )}

        {/* ── BƯỚC 1: Chọn nhà (tách riêng để trùng khuôn với tab Điện) ── */}
        {waterStep === 'select_property' && (
          <View style={styles.formCard}>
            <View style={styles.formCardHead}>
              <View style={styles.formCardIcon}><Text style={{ fontSize: 18 }}>🏠</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.formCardTitle}>Chọn nhà cần chốt</Text>
                <Text style={styles.formCardSub}>Chỉ số nước sẽ ghi cho các phòng của nhà này.</Text>
              </View>
            </View>
            <PropertyPicker
              properties={properties}
              loading={loadingProps}
              error={errorProps}
              selectedId={waterPropertyId}
              onSelect={(id) => {
                setWaterPropertyId(id);
                // Chọn xong đi thẳng sang bước hoá đơn — không bắt bấm thêm nút "Tiếp".
                if (id) { loadWaterBill(id); setWaterStep('bill_entry'); }
              }}
              onRetry={() => { setLoadingProps(true); loadProperties(); }}
            />
          </View>
        )}

        {waterStep === 'bill_entry' && (
          <View>
            {/* Đổi nhà: quay lại bước 1, giống nút "Đổi tòa nhà" bên tab Điện. */}
            <TouchableOpacity
              style={styles.changePropBtn}
              onPress={() => setWaterStep('select_property')}
            >
              <Text style={styles.changePropText}>
                🏠  {waterProperty?.name ?? 'Đã chọn nhà'} — đổi nhà khác
              </Text>
            </TouchableOpacity>

            {/* Thẻ hoá đơn nằm SAU thẻ chọn nhà và chỉ hiện khi đã chọn: hoá đơn là của
                một căn cụ thể, bày thẻ rỗng lên trước rồi mới cho chọn nhà là ngược với
                thao tác thật, mà thẻ chờ lại cao nên đẩy luôn ô chọn nhà khỏi màn hình. */}
            {!!waterPropertyId && (
            <View style={styles.formCard}>
              <View style={styles.formCardHead}>
                <View style={styles.formCardIcon}><Text style={{ fontSize: 18 }}>💧</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formCardTitle}>Hóa đơn nước của cả nhà</Text>
                  <Text style={styles.formCardSub}>Admin chốt hoá đơn nước của cả nhà, hệ thống chia lại cho từng phòng.</Text>
                </View>
              </View>

              {/* CHỈ ĐỌC từ 14/08/2026 — giống hệt tab Điện. Trước đây manager tự gõ tổng
                  tiền + đơn giá m³ ngay tại đây, không ai đối chiếu được với hoá đơn giấy.
                  Giờ admin phát hành trên web (/admin/water-bills), manager chỉ đọc. */}
              {!waterPropertyId ? (
                <Text style={styles.helperText}>
                  Chọn nhà bên dưới để xem hoá đơn nước admin đã chốt cho kỳ này.
                </Text>
              ) : waterBillLoading ? (
                <View style={styles.scanningRow}>
                  <ActivityIndicator color={Colors.primary} />
                  <Text style={styles.scanningText}>Đang tải hoá đơn nước của kỳ này...</Text>
                </View>
              ) : !waterBill ? (
                /* Admin chưa đẩy — KHÔNG mở form nhập tay, đó là cả điểm của thay đổi này. */
                <View style={styles.evnWaitBox}>
                  <Text style={styles.evnWaitEmoji}>⏳</Text>
                  <Text style={styles.evnWaitTitle}>Chờ admin gửi hoá đơn nước</Text>
                  <Text style={styles.evnWaitText}>
                    {waterBillError
                      || `Admin chưa tải hoá đơn nước kỳ ${currentPeriod().month}/${currentPeriod().year} của nhà này lên hệ thống.`}
                    {'\n\n'}Khi admin gửi xong, số liệu sẽ hiện ở đây và bạn ghi chỉ số như bình thường.
                  </Text>
                  <TouchableOpacity
                    style={[styles.primaryBtn, { marginTop: Spacing.md }]}
                    onPress={() => waterPropertyId && loadWaterBill(waterPropertyId)}
                  >
                    <Text style={styles.primaryBtnText}>🔄 Kiểm tra lại</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                <MeterTaskBanner bill={waterBill} kind="water" />
                <View style={styles.evnResult}>
                  <View style={styles.evnResultHeader}>
                    <Text style={styles.evnResultTitle}>Admin đã chốt cho kỳ này</Text>
                    <View style={[styles.badge, styles.badgeDone]}>
                      <Text style={[styles.badgeText, { color: Colors.success }]}>Chỉ đọc</Text>
                    </View>
                  </View>
                  <EVNDataRow label="Tổng nước"     value={`${waterBill.totalQuantity.toLocaleString('vi-VN')} m³`} />
                  <EVNDataRow label="Tổng tiền"     value={fmt(waterBill.totalAmount)} />
                  <EVNDataRow label="Đơn giá nước"  value={`${fmt(Math.round(waterUnitPrice(waterBill)))}/m³`} highlight />
                  <EVNDataRow label="Kỳ thanh toán" value={waterBill.billingPeriod} />
                </View>
                </>
              )}
            </View>
            )}

            {/*
              NGUYÊN CĂN: không còn bước nào cho quản lý.

              Từ 17/08/2026 admin phát hành hoá đơn nước nguyên căn là hệ thống gửi thẳng cho
              khách trong cùng transaction. Nút "Tiếp theo → Xem trước & gửi" cũ dẫn quản lý
              qua bước ghi chỉ số rồi gửi, mà gửi thì BE trả `INVOICE_ALREADY_EXISTS` —
              trông như app hỏng dù việc đã xong. Nhà chia phòng giữ nguyên luồng cũ.
            */}
            {waterProperty?.type === 'whole_house' ? (
              waterBill ? (
                <View style={styles.readonlyNote}>
                  <Text style={styles.readonlyNoteText}>
                    ✓ Khách đã nhận hoá đơn nước · {fmt(waterBill.totalAmount)}
                  </Text>
                </View>
              ) : null
            ) : (
              <TouchableOpacity
                style={[styles.primaryBtn, !waterReady && styles.primaryBtnDisabled]}
                onPress={handleWaterBillSubmit}
                disabled={!waterReady}
              >
                <Text style={[styles.primaryBtnText, !waterReady && styles.primaryBtnTextDisabled]}>
                  Tiếp theo → Nhập chỉ số phòng
                </Text>
              </TouchableOpacity>
            )}
            {!waterReady && (
              <Text style={styles.helperText}>
                {!waterPropertyId ? 'Chọn nhà cần chốt sổ để tiếp tục.' : 'Chờ admin phát hành hoá đơn nước của kỳ này.'}
              </Text>
            )}
          </View>
        )}

        {waterStep === 'room_readings' && waterBill && (
          <View>
            <SectionHeader title="Chỉ số nước từng phòng" />
            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerText}>
                Hóa đơn nước: {waterBill.totalQuantity.toLocaleString('vi-VN')} m³ · {fmt(waterBill.totalAmount)}
                {' '}· {fmt(Math.round(waterUnitPriceExact))}/m³ · {waterBill.billingPeriod}
              </Text>
            </View>

            {/* Tóm tắt tiến trình — giống hệt bên điện */}
            <View style={styles.progressRow}>
              <Text style={styles.progressText}>
                Đã gửi: {roomWaterReadings.filter(r => r.sent).length}/{roomWaterReadings.length} phòng
              </Text>
              {roomWaterReadings.some(r => !r.sent && r.newReading && Number(r.newReading) > r.prevReading) && (
                <TouchableOpacity style={styles.sendAllBtn} onPress={sendAllUnsentWater}>
                  <Text style={styles.sendAllBtnText}>Gửi tất cả →</Text>
                </TouchableOpacity>
              )}
            </View>

            <QuotaBar
              total={waterBill?.totalQuantity ?? 0}
              serverCap={waterBill?.roomSumCap}
              issued={waterBill?.roomSumQuantity ?? waterIssuedQty}
              pending={pendingWaterQty}
              unit="m³"
              billedRooms={billedWaterRooms}
              totalRooms={roomWaterReadings.length}
            />

            {roomWaterReadings.map(r => (
              <View key={r.roomId} style={[styles.roomCard, r.sent && styles.roomCardSent]}>
                <View style={styles.roomCardHeader}>
                  <View>
                    <Text style={styles.roomCode}>{r.roomCode}</Text>
                    <Text style={styles.roomTenant}>{r.tenantName}</Text>
                  </View>
                  <View style={[
                    styles.badge,
                    r.sent ? styles.badgeSent : r.hasPhoto ? styles.badgeDone : styles.badgePending,
                  ]}>
                    <Text style={[styles.badgeText, {
                      color: r.sent ? Colors.white : r.hasPhoto ? Colors.success : Colors.textMuted,
                    }]}>
                      {r.sent ? '✓ Đã gửi' : r.hasPhoto ? 'Có ảnh' : 'Chưa chụp'}
                    </Text>
                  </View>
                </View>

                {r.sent && <Text style={styles.prevReading}>Chỉ số cũ: {r.prevReading} m³</Text>}

                {r.sent ? (
                  /* Phòng đã gửi kỳ này: chỉ hiện tóm tắt, không cho gửi lần hai. */
                  <View style={styles.sentSummary}>
                    <Text style={styles.sentSummaryText}>
                      {r.consumption != null
                        ? `${r.consumption} m³ · ${fmt(r.fee ?? 0)} — đã gửi hóa đơn`
                        : 'Đã gửi hóa đơn nước của kỳ này'}
                    </Text>
                    <DeliveryLine state={waterDelivery.get(r.roomId)} />
                    <ViewIssuedButton
                      invoice={waterIssued.get(r.roomId)}
                      unit="m³"
                      onOpen={setIssuedView}
                    />
                  </View>
                ) : (
                  <>
                    <Text style={styles.formLabel}>Chỉ số cũ ({prevSourceLabel(r.prevSource)})</Text>
                    <TextInput
                      style={styles.input}
                      keyboardType="numeric"
                      placeholder="Nhập chỉ số tháng trước"
                      value={r.prevReading ? String(r.prevReading) : ''}
                      onChangeText={t => updateRoomWater(r.roomId, { prevReading: Number(readingDigits(t)) || 0 })}
                    />
                    <Text style={styles.formLabel}>Chỉ số mới (tháng này)</Text>
                    <View style={styles.readingRow}>
                      <TextInput
                        style={[styles.input, { flex: 1, marginRight: Spacing.sm }]}
                        keyboardType="numeric"
                        placeholder={`> ${r.prevReading}`}
                        value={r.newReading}
                        onChangeText={t => updateRoomWater(r.roomId, { newReading: readingDigits(t) })}
                      />
                      <TouchableOpacity
                        style={styles.ocrBtn}
                        onPress={() => askPhotoSource({ kind: 'meter', utility: 'water', roomId: r.roomId })}
                        disabled={ocrRoomId === r.roomId}
                      >
                        {ocrRoomId === r.roomId
                          ? <ActivityIndicator color={Colors.primary} />
                          : <Text style={styles.ocrBtnText}>📷 OCR</Text>}
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.prevReading}>📷 Chụp đồng hồ để tự đọc, hoặc nhập tay số ở trên.</Text>
                    {renderMeterPhoto(r, 'water')}
                    {r.newReading && Number(r.newReading) > r.prevReading && (() => {
                      const consumption = roundConsumption(Number(r.newReading) - r.prevReading);
                      const fee = Math.round(consumption * waterUnitPriceExact);
                      return (
                        <>
                          <View style={styles.calcPreview}>
                            <Text style={styles.calcPreviewText}>
                              {consumption} m³ × {fmt(Math.round(waterUnitPriceExact))}/m³ = {fmt(fee)}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.sendRoomBtn}
                            onPress={() => sendSingleRoomWater(r.roomId)}
                          >
                            <Text style={styles.sendRoomBtnText}>
                              💧 Gửi hóa đơn phòng {r.roomCode} · {fmt(fee)}
                            </Text>
                          </TouchableOpacity>
                        </>
                      );
                    })()}
                  </>
                )}
              </View>
            ))}

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => setWaterStep('bill_entry')}>
                <Text style={styles.secondaryBtnText}>← Quay lại</Text>
              </TouchableOpacity>
              {roomWaterReadings.every(r => r.sent) && (
                <TouchableOpacity style={[styles.sendBtn, { flex: 1, marginLeft: Spacing.sm }]} onPress={() => setWaterStep('done')}>
                  <Text style={styles.sendBtnText}>Hoàn tất ✓</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/*
          Bước "Xem trước & gửi" đã BỎ 18/08/2026 — nước nay gửi từng phòng ngay tại bước
          chỉ số, đúng như điện. Gộp cả nhà rồi bấm một nút có hai chỗ dở: một phòng lỗi là
          cả mẻ dừng giữa chừng mà không biết phòng nào đã đi, và nhà nguyên căn thì hoá đơn
          đã do hệ thống gửi cho khách từ lúc admin phát hành.
        */}
        <View style={{ height: 80 }} />
      </ScrollView>
    );
  };

  /**
   * Lịch sử gom theo KỲ, mới nhất trước.
   *
   * Trước 13/08/2026 đây là một danh sách phẳng: quản 5–10 nhà, mỗi kỳ vài chục hoá
   * đơn điện + nước là cuộn mãi không thấy kỳ mình cần. Nay mỗi kỳ một mục, kèm chip
   * lọc kỳ ở trên.
   */
  const histSections = useMemo(() => {
    const rows = histPeriod === 'all'
      ? histInvoices
      : histInvoices.filter(i => `${i.year}-${String(i.month).padStart(2, '0')}` === histPeriod);
    const byPeriod = new Map<string, ManagerInvoice[]>();
    for (const i of rows) {
      const key = `${i.year}-${String(i.month).padStart(2, '0')}`;
      byPeriod.set(key, [...(byPeriod.get(key) ?? []), i]);
    }
    return [...byPeriod.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, items]) => {
        const [y, m] = key.split('-');
        return {
          key,
          title: `Kỳ ${m}/${y}`,
          elec: items.filter(i => i.type === 'ELECTRICITY').length,
          water: items.filter(i => i.type === 'WATER').length,
          data: items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
        };
      });
  }, [histInvoices, histPeriod]);

  /** Các kỳ CÓ dữ liệu — dựng từ chính danh sách nên không có chip rỗng. */
  const histPeriods = useMemo(() => {
    const set = new Set(histInvoices.map(i => `${i.year}-${String(i.month).padStart(2, '0')}`));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [histInvoices]);

  const renderHistoryTab = () => (
    <SectionList
      sections={histSections}
      keyExtractor={i => String(i.id)}
      contentContainerStyle={styles.tabContent}
      showsVerticalScrollIndicator={false}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <>
          <SectionHeader title="Lịch sử hóa đơn điện / nước đã gửi" />
          {histPeriods.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.histFilterRow}>
              <TouchableOpacity
                style={[styles.histChip, histPeriod === 'all' && styles.histChipActive]}
                onPress={() => setHistPeriod('all')}
              >
                <Text style={[styles.histChipText, histPeriod === 'all' && styles.histChipTextActive]}>Mọi kỳ</Text>
              </TouchableOpacity>
              {histPeriods.map(p => {
                const [y, m] = p.split('-');
                return (
                  <TouchableOpacity
                    key={p}
                    style={[styles.histChip, histPeriod === p && styles.histChipActive]}
                    onPress={() => setHistPeriod(p)}
                  >
                    <Text style={[styles.histChipText, histPeriod === p && styles.histChipTextActive]}>{m}/{y}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </>
      }
      renderSectionHeader={({ section }) => (
        <View style={styles.histSectionHead}>
          <Text style={styles.histSectionTitle}>{section.title}</Text>
          <Text style={styles.histSectionMeta}>
            ⚡ {section.elec} · 💧 {section.water}
          </Text>
        </View>
      )}
      renderItem={({ item }) => {
        const st = UTIL_STATUS[item.status] ?? UTIL_STATUS.PENDING;
        return (
          <View style={styles.historyCard}>
            <View style={styles.historyHeader}>
              <View style={[styles.typeTag, item.type === 'ELECTRICITY' ? styles.typeTagElec : styles.typeTagWater]}>
                <Text style={styles.typeTagText}>{item.type === 'ELECTRICITY' ? '⚡ Điện' : '💧 Nước'}</Text>
              </View>
              <View style={[statusSt.badge, { backgroundColor: st.bg }]}>
                <Text style={[statusSt.badgeText, { color: st.color }]}>{st.label}</Text>
              </View>
            </View>
            <Text style={styles.historyProperty}>
              {item.propertyName}{item.roomNumber ? ` · Phòng ${item.roomNumber}` : ' · Nguyên căn'}
            </Text>
            <Text style={styles.historyPeriod}>
              T{String(item.month).padStart(2, '0')}/{item.year}{item.tenantName ? ` · ${item.tenantName}` : ''}
            </Text>
            <View style={styles.historyFooter}>
              <Text style={styles.historyRooms}>{item.code}</Text>
              <Text style={styles.historyAmount}>{fmt(item.amount)}</Text>
            </View>
          </View>
        );
      }}
      ListEmptyComponent={
        loadingHist ? (
          <View style={styles.empty}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>📋</Text>
            <Text style={styles.emptyText}>Chưa có hóa đơn điện/nước nào</Text>
          </View>
        )
      }
      ListFooterComponent={<View style={{ height: 80 }} />}
    />
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ghi chỉ số & Hóa đơn</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={styles.tabBar}>
        {([
          { key: 'electricity', label: '⚡ Điện' },
          { key: 'water',       label: '💧 Nước' },
          { key: 'history',     label: '📋 Lịch sử' },
        ] as { key: MainTab; label: string }[]).map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tabItem, activeTab === t.key && styles.tabItemActive]}
            onPress={() => setActiveTab(t.key)}
          >
            <Text style={[styles.tabLabel, activeTab === t.key && styles.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/*
        Dải quy tắc gửi ĐÃ BỎ khỏi đây (30/08/2026) — nay là dòng `note` nhỏ trong thanh
        bước. Nó là chú thích chứ không phải cảnh báo: chiếm một dải xanh chạy hết bề
        ngang, thường trực trên mọi bước, chỉ để nhắc một quy tắc không đổi.
      */}

      {activeTab === 'electricity' && renderElecTab()}
      {activeTab === 'water'       && renderWaterTab()}
      {activeTab === 'history'     && renderHistoryTab()}

      {/* Camera trong app: chụp → xem lại → "Dùng ảnh này" mới tải lên & đọc số.
          Dùng cho cả web lẫn điện thoại (web không bật được camera qua ImagePicker). */}
      {/* Xem ảnh phóng to — chạm nền hoặc nút ✕ để đóng. Dùng chung cho ảnh hoá đơn
          EVN và ảnh đồng hồ từng phòng. */}
      <Modal visible={!!zoomImage} transparent animationType="fade" onRequestClose={() => setZoomImage(null)}>
        <TouchableOpacity style={styles.zoomOverlay} activeOpacity={1} onPress={() => setZoomImage(null)}>
          {!!zoomImage && (
            <Image source={{ uri: zoomImage }} style={styles.zoomImage} resizeMode="contain" />
          )}
          <TouchableOpacity style={styles.zoomClose} onPress={() => setZoomImage(null)}>
            <Text style={styles.zoomCloseText}>✕ Đóng</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {issuedView && (
        <IssuedInvoiceSheet
          view={issuedView}
          onClose={() => setIssuedView(null)}
          onZoom={(url) => { setIssuedView(null); setZoomImage(url); }}
        />
      )}

      <CameraCaptureModal
        visible={cameraTarget !== null}
        onCapture={(uri) => {
          const target = cameraTarget;
          setCameraTarget(null);
          if (target) void handlePhoto(target, uri);
        }}
        onClose={() => setCameraTarget(null)}
        onUseGalleryInstead={async () => {
          const target = cameraTarget;
          setCameraTarget(null);
          const uri = await pickFromGallery();
          if (target && uri) await handlePhoto(target, uri);
        }}
      />

      {/*
        Xin mã admin để chốt số không cần ảnh. Xin được là LƯU LUÔN, không bắt bấm lại nút
        chốt: token dùng một lần và chỉ sống 15 phút, để người dùng cầm nó đi làm việc khác
        rồi quay lại là hỏng theo một cách chẳng liên quan gì tới việc họ vừa làm.
      */}
      <MeterOverrideModal
        visible={overrideRoomId !== null}
        meterKind="ELEC"
        contractId={
          roomElecReadings.find(r => r.roomId === overrideRoomId)?.contractId ?? null
        }
        onCancel={() => setOverrideRoomId(null)}
        onGranted={(token, reason) => {
          const roomId = overrideRoomId;
          setOverrideRoomId(null);
          if (roomId) void saveRoomElecReading(roomId, { token, reason });
        }}
      />
    </SafeAreaView>
  );
};

// ===================== SUB-COMPONENTS =====================
/**
 * Thanh bước — MỘT dòng chữ + thanh chia đoạn.
 *
 * ─── Vì sao thu lại (30/08/2026) ─────────────────────────────────────────────
 * Bản cũ vẽ 4 ô tròn có số + nhãn dưới mỗi ô, cao ~90px. Cộng với thanh tab, dải
 * chính sách và dòng "Bước 1: Chọn tòa nhà / căn hộ" ngay bên dưới thì phần KHUNG
 * chiếm gần một phần ba màn trước khi tới nội dung thật — trên điện thoại thì đó là
 * chỗ đáng lẽ dành cho danh sách phòng.
 *
 * Tệ hơn: nhãn bước lặp lại y nguyên ở tiêu đề bên dưới. Cùng một chữ nói hai lần,
 * tốn hai khối chỗ. Nay thanh bước tự xưng tên bước hiện tại nên tiêu đề kia bỏ được.
 *
 * `note` là dòng quy tắc gửi (trước đây là một dải riêng chạy hết bề ngang) — nhét vào
 * đây vì nó chỉ là chú thích, không đáng một khối riêng.
 */
const StepIndicator: React.FC<{ steps: string[]; current: number; note?: string }> = ({
  steps, current, note,
}) => (
  <View style={stepSt.wrap}>
    <View style={stepSt.head}>
      <Text style={stepSt.counter}>Bước {Math.min(current + 1, steps.length)}/{steps.length}</Text>
      <Text style={stepSt.name} numberOfLines={1}>{steps[current] ?? steps[steps.length - 1]}</Text>
    </View>
    <View style={stepSt.bar}>
      {steps.map((_, i) => (
        <View
          key={i}
          style={[
            stepSt.seg,
            i < current && stepSt.segDone,
            i === current && stepSt.segActive,
            i > 0 && stepSt.segGap,
          ]}
        />
      ))}
    </View>
    {!!note && <Text style={stepSt.note}>{note}</Text>}
  </View>
);

const SectionHeader: React.FC<{ title: string }> = ({ title }) => (
  <Text style={secSt.title}>{title}</Text>
);

/**
 * Biên dự phòng — CHỈ dùng khi máy chủ chưa trả `roomSumCap`.
 *
 * Biên thật là cấu hình phía máy chủ (`billing.utility.room-sum-tolerance-percent`), và BE
 * trả sẵn `roomSumCap` từ 27/08/2026. Tự nhân hệ số ở app là có ngày hai bên dùng hai mức
 * khác nhau — app báo "còn dư 20 kWh" mà bấm gửi lại ăn 422.
 */
const ROOM_SUM_TOLERANCE_FALLBACK = 0.1;

/**
 * HẠN MỨC TIÊU THỤ CÒN LẠI của cả toà — chỉ nhà chia phòng.
 *
 * Tổng tiêu thụ các phòng cộng lại KHÔNG được vượt tổng trên giấy nhà nước (cộng 10% biên).
 * Vượt nghĩa là chắc chắn có phòng đọc nhầm — gõ thừa số 0, đọc nhầm hàng, ghi nhầm phòng.
 * Không phép cộng nào cho ra nhiều điện hơn lượng công ty đã mua.
 *
 * Hiện NGAY LÚC ĐANG GÕ chứ không đợi bấm gửi: chặn ở phòng cuối cùng thì quản lý đã đi hết
 * các phòng rồi mới biết phải quay lại dò, mà lỗi thường nằm ở phòng ghi trước đó. Thấy hạn
 * mức tụt bất thường từ phòng thứ hai là họ tự phát hiện ngay.
 *
 * Con số đang gõ (chưa gửi) cũng được cộng vào — đó mới là thứ quản lý cần thấy trước khi bấm.
 */
const QuotaBar: React.FC<{
  total: number;
  /** Trần máy chủ trả về. Thiếu thì mới tự nhân biên dự phòng. */
  serverCap?: number;
  /** Tổng phòng đã phát hành — ưu tiên số máy chủ, thiếu thì dùng số app tự cộng. */
  issued: number;
  pending: number;
  unit: string;
  billedRooms: number;
  totalRooms: number;
}> = ({ total, serverCap, issued, pending, unit, billedRooms, totalRooms }) => {
  if (!total) return null;
  const cap = serverCap && serverCap > 0
    ? Math.round(serverCap)
    : Math.round(total * (1 + ROOM_SUM_TOLERANCE_FALLBACK));
  const used = issued + pending;
  const left = cap - used;
  const over = left < 0;
  const ratio = Math.min(used / cap, 1);
  const tone = over ? Colors.error : ratio > 0.9 ? Colors.warning : Colors.success;

  return (
    <View style={[qs.box, over && qs.boxOver]}>
      <View style={qs.head}>
        <Text style={qs.title}>
          Đã ghi {billedRooms}/{totalRooms} phòng
        </Text>
        <Text style={[qs.left, { color: tone }]}>
          {over
            ? `Vượt ${Math.abs(left).toLocaleString('vi-VN')} ${unit}`
            : `Còn ${left.toLocaleString('vi-VN')} ${unit}`}
        </Text>
      </View>
      <View style={qs.track}>
        <View style={[qs.fill, { width: `${ratio * 100}%`, backgroundColor: tone }]} />
      </View>
      <Text style={qs.sub}>
        {used.toLocaleString('vi-VN')} / {cap.toLocaleString('vi-VN')} {unit}
        {'  ·  '}giấy {total.toLocaleString('vi-VN')} {unit} + {Math.max(0, Math.round((cap / total - 1) * 100))}% dự phòng
      </Text>
      {over && (
        <Text style={qs.warn}>
          Tổng các phòng đã vượt giấy nhà nước. Kiểm lại chỉ số đã ghi — nhiều khả năng có phòng
          đọc nhầm, và lỗi thường ở phòng ghi trước chứ không phải phòng đang gõ.
        </Text>
      )}
    </View>
  );
};

const qs = StyleSheet.create({
  box: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md,
    marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  boxOver: { borderColor: Colors.error, backgroundColor: Colors.errorLight },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  left: { fontSize: 13, fontWeight: '800' },
  track: { height: 6, borderRadius: 3, backgroundColor: Colors.border, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  sub: { marginTop: 6, fontSize: 11, color: Colors.textMuted },
  warn: { marginTop: 6, fontSize: 11, lineHeight: 16, fontWeight: '600', color: Colors.error },
});

const EVNDataRow: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <View style={evnSt.row}>
    <Text style={evnSt.label}>{label}</Text>
    <Text style={[evnSt.value, highlight && evnSt.valueHighlight]}>{value}</Text>
  </View>
);

// Trạng thái thanh toán hóa đơn điện/nước ĐÃ gửi của 1 nhà (dữ liệu thật từ BE).
const UTIL_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:   { label: 'Chưa thu', color: Colors.warning, bg: Colors.warningLight },
  PAID:      { label: 'Đã thu',   color: Colors.success, bg: Colors.successLight },
  OVERDUE:   { label: 'Quá hạn',  color: Colors.error,   bg: Colors.errorLight },
  PARTIAL:   { label: 'Một phần', color: Colors.info,    bg: Colors.infoLight },
  CANCELLED: { label: 'Đã huỷ',   color: Colors.textMuted, bg: Colors.background },
};

const SentInvoicePanel: React.FC<{
  propertyId: string | null;
  type: 'ELECTRICITY' | 'WATER';
  reloadKey: number;
}> = ({ propertyId, type, reloadKey }) => {
  const [list, setList] = useState<ManagerInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const label = type === 'ELECTRICITY' ? 'điện' : 'nước';

  useEffect(() => {
    if (!propertyId) { setList([]); return; }
    let alive = true;
    setLoading(true);
    realManagerInvoiceService.listInvoices({ type })
      .then(all => {
        if (!alive) return;
        setList(
          all.filter(i => i.propertyId === Number(propertyId))
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
        );
      })
      .catch(() => { if (alive) setList([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [propertyId, type, reloadKey]);

  if (!propertyId) return null;

  const paid   = list.filter(i => i.status === 'PAID').length;
  const unpaid = list.filter(i => i.status === 'PENDING' || i.status === 'OVERDUE').length;

  return (
    <View style={statusSt.wrap}>
      <View style={statusSt.header}>
        <Text style={statusSt.title}>Trạng thái hóa đơn {label} đã gửi</Text>
        {loading && <ActivityIndicator size="small" color={Colors.primary} />}
      </View>

      {list.length === 0 ? (
        <Text style={statusSt.empty}>
          {loading ? 'Đang tải...' : `Chưa gửi hóa đơn ${label} nào cho nhà này.`}
        </Text>
      ) : (
        <>
          <View style={statusSt.statRow}>
            <Text style={[statusSt.statChip, { color: Colors.success }]}>● Đã thu: {paid}</Text>
            <Text style={[statusSt.statChip, { color: Colors.warning }]}>● Chưa thu: {unpaid}</Text>
          </View>
          {list.map(inv => {
            const st = UTIL_STATUS[inv.status] ?? UTIL_STATUS.PENDING;
            return (
              <View key={inv.id} style={statusSt.row}>
                <View style={{ flex: 1 }}>
                  <Text style={statusSt.rowTitle}>
                    {inv.roomNumber ? `Phòng ${inv.roomNumber}` : 'Nhà nguyên căn'} · T{String(inv.month).padStart(2, '0')}/{inv.year}
                  </Text>
                  <Text style={statusSt.rowSub}>
                    {(inv.tenantName || inv.code)} · {fmt(inv.amount)}
                  </Text>
                </View>
                <View style={[statusSt.badge, { backgroundColor: st.bg }]}>
                  <Text style={[statusSt.badgeText, { color: st.color }]}>{st.label}</Text>
                </View>
              </View>
            );
          })}
        </>
      )}
    </View>
  );
};

const PICKER_PAGE_SIZE = 8; // số nhà hiện ban đầu; còn lại mở dần qua nút "Xem thêm"

type PickerFilter = 'all' | PropType;

// Bộ chọn nhà (nhiều phòng / nguyên căn) + xử lý loading / lỗi / rỗng — dùng chung 2 tab.
// Danh sách có thể lên tới hàng trăm nhà nên có tìm kiếm, lọc theo loại, phân trang,
// và tự thu gọn còn 1 thẻ sau khi đã chọn.
const PropertyPicker: React.FC<{
  properties: BillingProperty[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRetry: () => void;
  showRoomCodes?: boolean;
}> = ({ properties, loading, error, selectedId, onSelect, onRetry, showRoomCodes }) => {
  const [query,      setQuery]      = useState('');
  const [typeFilter, setTypeFilter] = useState<PickerFilter>('all');
  const [pageSize,   setPageSize]   = useState(PICKER_PAGE_SIZE);
  const [expanded,   setExpanded]   = useState(false); // mở lại danh sách khi bấm "Đổi"

  const selected = properties.find(p => p.id === selectedId) ?? null;

  // Đổi bộ lọc thì xem lại từ đầu, tránh giữ trạng thái "đã mở rộng" của lần tìm trước.
  useEffect(() => { setPageSize(PICKER_PAGE_SIZE); }, [query, typeFilter]);

  const q = normalizeVi(query);

  const filtered = useMemo(() => {
    return properties.filter(p => {
      if (typeFilter !== 'all' && p.type !== typeFilter) return false;
      if (!q) return true;
      if (normalizeVi(p.name).includes(q)) return true;
      // tìm được cả khi manager chỉ nhớ mã phòng hoặc tên khách thuê
      return p.rooms.some(r => normalizeVi(r.code).includes(q) || normalizeVi(r.tenantName).includes(q));
    });
  }, [properties, q, typeFilter]);

  if (loading) {
    return (
      <View style={styles.pickerState}>
        <ActivityIndicator color={Colors.primary} />
        <Text style={styles.pickerStateText}>Đang tải danh sách...</Text>
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.pickerState}>
        <Text style={styles.pickerStateEmoji}>⚠️</Text>
        <Text style={styles.pickerStateText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryBtnText}>Thử lại</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (properties.length === 0) {
    return (
      /*
        Gọn lại thành một khối viền nhạt (30/08/2026): bản cũ căn giữa với emoji 32px và
        nhiều khoảng đệm nên chiếm gần hết màn cho một tin nhắn 2 dòng, phần dưới trống trơn.
        Câu chữ giữ nguyên — nó giải thích ĐÚNG lý do danh sách rỗng, bỏ đi thì quản lý
        tưởng app hỏng.
      */
      <View style={styles.emptyPick}>
        <Text style={styles.emptyPickTitle}>Chưa có nhà nào đang có khách thuê</Text>
        <Text style={styles.emptyPickText}>
          Nhà trống không hiển thị vì không phát sinh tiền điện / nước.
        </Text>
        <TouchableOpacity style={styles.emptyPickBtn} onPress={onRetry}>
          <Text style={styles.emptyPickBtnText}>Tải lại</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const metaOf = (p: BillingProperty) =>
    p.type === 'whole_house'
      ? `Nguyên căn · ${p.rooms[0]?.tenantName ?? 'Chưa có khách thuê'}`
      : showRoomCodes && p.rooms.length > 0
        ? `${p.rooms.length} phòng · ${p.rooms.map(r => r.code).join(', ')}`
        : `${p.rooms.length} phòng đang thuê`;

  // ── Đã chọn: thu gọn còn 1 thẻ, giấu cả danh sách đi ──
  if (selected && !expanded) {
    return (
      /**
       * CẢ THẺ bấm được để mở lại danh sách, không chỉ mỗi chữ "Đổi".
       *
       * Chọn nhầm nhà là chuyện thường, mà nút "Đổi" là một chip nhỏ nằm sát mép phải —
       * bấm trượt vài lần là người dùng tưởng khoá luôn rồi thoát ra vào lại màn hình
       * (đúng thứ đã xảy ra khi test). Vùng bấm giờ là toàn bộ thẻ, chip "Đổi" giữ lại
       * làm dấu hiệu nhìn thấy được là "cái này đổi được".
       */
      <TouchableOpacity
        style={styles.selectedCard}
        activeOpacity={0.7}
        onPress={() => setExpanded(true)}
      >
        <Text style={styles.selectedIcon}>{selected.type === 'whole_house' ? '🏠' : '🏢'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.selectedName} numberOfLines={1}>{selected.name}</Text>
          <Text style={styles.selectedMeta} numberOfLines={1}>{metaOf(selected)}</Text>
        </View>
        <View style={styles.changeBtn} pointerEvents="none">
          <Text style={styles.changeBtnText}>Đổi</Text>
        </View>
      </TouchableOpacity>
    );
  }

  const visible = filtered.slice(0, pageSize);
  const multi   = visible.filter(p => p.type === 'multi_room');
  const whole   = visible.filter(p => p.type === 'whole_house');
  const counts  = {
    all: properties.length,
    multi_room: properties.filter(p => p.type === 'multi_room').length,
    whole_house: properties.filter(p => p.type === 'whole_house').length,
  };

  const pick = (id: string) => {
    onSelect(id);
    setExpanded(false);
    setQuery('');
  };

  const row = (prop: BillingProperty) => {
    // Khi khớp nhờ phòng/khách thuê thì nói rõ khớp ở đâu, không bắt manager tự đoán.
    const hits = q && !normalizeVi(prop.name).includes(q)
      ? prop.rooms
          .filter(r => normalizeVi(r.code).includes(q) || normalizeVi(r.tenantName).includes(q))
          .slice(0, 3)
          .map(r => `${r.code} · ${r.tenantName}`)
      : [];
    return (
      <TouchableOpacity
        key={prop.id}
        style={[styles.propertyRow, selectedId === prop.id && styles.propertyRowActive]}
        onPress={() => pick(prop.id)}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.propertyName} numberOfLines={1}>{prop.name}</Text>
          <Text style={styles.propertyMeta} numberOfLines={1}>{metaOf(prop)}</Text>
          {hits.length > 0 && (
            <Text style={styles.propertyHit} numberOfLines={1}>🔎 Khớp: {hits.join(' · ')}</Text>
          )}
        </View>
        {selectedId === prop.id && <Text style={styles.checkMark}>✓</Text>}
      </TouchableOpacity>
    );
  };

  const chip = (key: PickerFilter, label: string, n: number) => (
    <TouchableOpacity
      key={key}
      style={[styles.chip, typeFilter === key && styles.chipActive]}
      onPress={() => setTypeFilter(key)}
    >
      <Text style={[styles.chipText, typeFilter === key && styles.chipTextActive]}>{label} {n}</Text>
    </TouchableOpacity>
  );

  return (
    <>
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm theo tên nhà, phòng, khách thuê..."
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.searchClear}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.chipRow}>
        {chip('all', 'Tất cả', counts.all)}
        {chip('multi_room', '🏢 Nhiều phòng', counts.multi_room)}
        {chip('whole_house', '🏠 Nguyên căn', counts.whole_house)}
      </View>

      {filtered.length === 0 ? (
        <View style={styles.pickerState}>
          <Text style={styles.pickerStateEmoji}>🔍</Text>
          <Text style={styles.pickerStateText}>
            Không tìm thấy nhà nào khớp{query ? ` “${query}”` : ''}.
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => { setQuery(''); setTypeFilter('all'); }}
          >
            <Text style={styles.retryBtnText}>Xoá bộ lọc</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={styles.resultCount}>
            Hiện {visible.length}/{filtered.length} nhà
            {filtered.length !== properties.length ? ` (lọc từ ${properties.length})` : ''}
          </Text>

          {multi.length > 0 && <Text style={styles.groupLabel}>🏢 Nhà nhiều phòng</Text>}
          {multi.map(row)}

          {whole.length > 0 && (
            <Text style={[styles.groupLabel, multi.length > 0 && { marginTop: Spacing.md }]}>
              🏠 Nhà nguyên căn
            </Text>
          )}
          {whole.map(row)}

          {filtered.length > visible.length && (
            <TouchableOpacity
              style={styles.moreBtn}
              onPress={() => setPageSize(n => n + PICKER_PAGE_SIZE)}
            >
              <Text style={styles.moreBtnText}>
                Xem thêm {Math.min(PICKER_PAGE_SIZE, filtered.length - visible.length)} nhà ↓
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {selected && (
        <TouchableOpacity style={styles.cancelChangeBtn} onPress={() => setExpanded(false)}>
          <Text style={styles.cancelChangeText}>Huỷ đổi · giữ “{selected.name}”</Text>
        </TouchableOpacity>
      )}
    </>
  );
};

// ===================== STYLES =====================
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, ...Shadow.sm,
  },
  // width cố định 70 làm chữ "← Quay lại" xuống dòng trên web → dùng minWidth + 1 dòng.
  backText: { color: Colors.primary, fontWeight: '600', fontSize: 15, minWidth: 80 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },

  tabBar: { flexDirection: 'row', backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.border },
  /** Nút gửi khi ngoài cửa sổ chốt sổ — vẫn bấm được để hiện lý do, nhưng nhìn là biết khoá. */
  btnLocked: { backgroundColor: Colors.textMuted, opacity: 0.7 },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabLabel: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  tabLabelActive: { color: Colors.primary },

  // Giới hạn bề ngang: trên web (manager hay mở ở laptop) form kéo giãn hết 1900px
  // thì label nằm tít bên trái còn ô nhập dài lê thê, rất khó đọc.
  tabContent: { padding: Spacing.lg, width: '100%', maxWidth: 760, alignSelf: 'center' },

  groupLabel: {
    fontSize: 11, fontWeight: '800', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: Spacing.xs, marginTop: Spacing.xs,
  },

  card: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm },
  cardDesc: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.md, lineHeight: 20 },

  uploadBtn: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg,
    borderWidth: 1.5, borderColor: Colors.primary, borderStyle: 'dashed',
    padding: Spacing.lg, alignItems: 'center', marginBottom: Spacing.md,
  },
  uploadBtnIcon: { fontSize: 32, marginBottom: Spacing.xs },
  uploadBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  uploadBtnSub:  { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginTop: 4 },
  scanningRow:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  scanningText:  { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  evnThumb:      { width: '100%', height: 200, borderRadius: BorderRadius.md, marginBottom: Spacing.md, backgroundColor: Colors.background },

  // ── Ảnh đã tải: nút gỡ / chụp lại ──
  thumbWrap: { position: 'relative', marginBottom: Spacing.sm },
  thumbRemoveBtn: {
    position: 'absolute', top: Spacing.xs, right: Spacing.xs,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  thumbRemoveIcon: { color: Colors.white, fontSize: 14, fontWeight: '900', lineHeight: 16 },
  thumbActions:    { flexDirection: 'row', gap: Spacing.sm },
  thumbActionBtn: {
    flex: 1, alignItems: 'center', paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  thumbActionText:       { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  thumbActionDanger:     { borderColor: Colors.error },
  thumbActionDangerText: { color: Colors.error },

  // Ảnh đồng hồ 1 phòng (gửi kèm hoá đơn)
  meterThumbRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    padding: Spacing.sm, marginTop: Spacing.xs,
  },
  meterThumb:      { width: 48, height: 48, borderRadius: BorderRadius.sm, backgroundColor: Colors.border },
  meterThumbLabel: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  meterThumbHint:  { fontSize: 11, color: Colors.textMuted, marginTop: 1 },
  meterThumbRemove: {
    paddingHorizontal: Spacing.sm, paddingVertical: 6,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.error,
  },
  meterThumbRemoveText: { fontSize: 12, fontWeight: '700', color: Colors.error },

  evnResult: {
    backgroundColor: '#F0FDF4', borderRadius: BorderRadius.md,
    padding: Spacing.base, marginTop: Spacing.sm,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  evnResultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  evnResultTitle:  { fontSize: 13, fontWeight: '700', color: Colors.success },
  editLink:        { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  evnEditForm:     { marginTop: Spacing.md },

  // Trạng thái "chờ admin đẩy hoá đơn EVN" / lỗi tải — thay cho form nhập tay cũ.
  evnWaitBox:   { alignItems: 'center', paddingVertical: Spacing.lg, paddingHorizontal: Spacing.sm },
  evnWaitEmoji: { fontSize: 40, marginBottom: Spacing.sm },
  evnWaitTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.xs },
  evnWaitText:  { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19 },

  infoBanner: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md,
    padding: Spacing.sm, marginBottom: Spacing.md,
    borderLeftWidth: 3, borderLeftColor: Colors.primary,
  },
  infoBannerText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },

  propertyRow: {
    flexDirection: 'row', alignItems: 'center', padding: Spacing.md,
    backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border,
  },
  propertyRowActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },

  pickerState:      { alignItems: 'center', paddingVertical: Spacing.lg, gap: Spacing.sm },
  pickerStateEmoji: { fontSize: 32 },
  emptyPick: {
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
    borderRadius: BorderRadius.lg, padding: Spacing.base, alignItems: 'center',
  },
  emptyPickTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  emptyPickText: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', marginTop: 4, lineHeight: 17 },
  emptyPickBtn: {
    marginTop: Spacing.sm, backgroundColor: Colors.primaryBg,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.base, paddingVertical: 7,
  },
  emptyPickBtnText: { fontSize: 13, fontWeight: '800', color: Colors.primary },
  pickerStateText:  { fontSize: 13, color: Colors.textMuted, textAlign: 'center' },
  retryBtn:         { marginTop: Spacing.xs, backgroundColor: Colors.primary, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  retryBtnText:     { color: Colors.white, fontWeight: '800', fontSize: 13 },

  propertyName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  propertyMeta: { fontSize: 12, color: Colors.textMuted, marginRight: Spacing.sm },
  propertyHit:  { fontSize: 11, color: Colors.primary, marginTop: 2, marginRight: Spacing.sm },
  checkMark:    { fontSize: 16, color: Colors.primary, fontWeight: '900' },

  // ── Bộ chọn nhà: tìm kiếm / lọc / phân trang ──
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  searchIcon:  { fontSize: 14, marginRight: Spacing.xs },
  searchInput: { flex: 1, paddingVertical: Spacing.sm, fontSize: 14, color: Colors.textPrimary },
  searchClear: { fontSize: 15, color: Colors.textMuted, paddingHorizontal: Spacing.xs, fontWeight: '700' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  chipActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText:       { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },

  resultCount: { fontSize: 11, color: Colors.textMuted, marginBottom: Spacing.xs },

  moreBtn: {
    alignItems: 'center', paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md, borderWidth: 1, borderStyle: 'dashed',
    borderColor: Colors.primary, marginTop: Spacing.xs,
  },
  moreBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  // Thẻ gọn hiển thị nhà đang chọn (thay cho cả danh sách dài)
  selectedCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primaryBg, borderWidth: 1, borderColor: Colors.primary,
    borderRadius: BorderRadius.md, padding: Spacing.md,
  },
  selectedIcon: { fontSize: 22 },
  selectedName: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  selectedMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  changeBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: BorderRadius.full, backgroundColor: Colors.primary,
  },
  changeBtnText: { fontSize: 12, fontWeight: '800', color: Colors.white },

  cancelChangeBtn:  { alignItems: 'center', paddingVertical: Spacing.sm, marginTop: Spacing.xs },
  cancelChangeText: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },

  progressRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  progressText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  sendAllBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
  },
  sendAllBtnText: { fontSize: 12, fontWeight: '700', color: Colors.white },

  roomCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm },
  roomCardSent: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' },
  roomCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.xs },
  roomCode:   { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  roomTenant: { fontSize: 12, color: Colors.textSecondary },
  prevReading:{ fontSize: 12, color: Colors.textMuted, marginBottom: Spacing.xs },
  readingRow: { flexDirection: 'row', alignItems: 'center' },

  badge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: BorderRadius.full },
  badgeDone:   { backgroundColor: '#F0FDF4' },
  badgePending:{ backgroundColor: Colors.background },
  badgeSent:   { backgroundColor: Colors.success },
  badgeText:   { fontSize: 11, fontWeight: '700' },

  sentSummary: {
    backgroundColor: '#F0FDF4', borderRadius: BorderRadius.sm,
    padding: Spacing.sm, marginTop: Spacing.xs,
  },
  sentSummaryText: { fontSize: 13, color: Colors.success, fontWeight: '600' },

  // ── Xem lại hoá đơn đã gửi ──
  viewIssuedBtn: { marginTop: Spacing.sm, alignSelf: 'flex-start' },
  viewIssuedText: {
    fontSize: 13, fontWeight: '700', color: Colors.primary,
    textDecorationLine: 'underline',
  },
  issuedOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  issuedSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl,
    maxHeight: '88%',
  },
  issuedHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.base,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  issuedTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  issuedClose: { fontSize: 16, color: Colors.textMuted, paddingLeft: Spacing.md },
  issuedSectionLabel: {
    fontSize: 11, fontWeight: '800', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: Spacing.sm,
    marginTop: Spacing.base,
  },
  issuedPhoto: {
    width: '100%', height: 220, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  issuedPhotoHint: {
    fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.xs,
  },
  issuedRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  issuedLabel: { fontSize: 13, color: Colors.textSecondary },
  issuedValue: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  issuedNote: {
    marginTop: Spacing.base, fontSize: 12, lineHeight: 18, color: Colors.textMuted,
  },
  changePropBtn: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.base, paddingVertical: 10, marginBottom: Spacing.sm,
  },
  changePropText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  deliveryLine: { fontSize: 12, fontWeight: '600', marginTop: 4 },

  calcPreview: { backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.sm, padding: Spacing.xs, marginTop: Spacing.xs },
  calcPreviewText: { fontSize: 12, color: Colors.primary, fontWeight: '600' },

  sendRoomBtn: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm, alignItems: 'center', marginTop: Spacing.sm,
  },
  sendRoomBtnText: { fontSize: 13, fontWeight: '700', color: Colors.white },

  summaryCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm,
    borderLeftWidth: 4, borderLeftColor: Colors.primary,
  },
  summaryTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm },
  reviewRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginBottom: Spacing.xs, ...Shadow.sm,
  },
  reviewRoomCode: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  reviewDetail:   { fontSize: 12, color: Colors.textMuted },
  reviewFee:      { fontSize: 15, fontWeight: '800', color: Colors.primary },
  reviewTotal: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginVertical: Spacing.md,
  },
  reviewTotalLabel: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  reviewTotalVal:   { fontSize: 20, fontWeight: '800', color: Colors.primary },

  formLabel: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4, marginTop: Spacing.sm },
  req: { color: Colors.error },
  input: {
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, padding: Spacing.sm,
    fontSize: 15, color: Colors.textPrimary, marginBottom: Spacing.xs,
  },

  // ── Form chốt nước (bước 1) ──
  formCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.xl, padding: Spacing.base,
    marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  formCardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.xs },
  formCardIcon: {
    width: 36, height: 36, borderRadius: BorderRadius.md,
    backgroundColor: Colors.primaryBg, alignItems: 'center', justifyContent: 'center',
  },
  formCardTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  formCardSub: { fontSize: 12, color: Colors.textMuted, lineHeight: 17, marginTop: 2 },

  fieldRow: { flexDirection: 'row', gap: Spacing.sm },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm,
  },
  inputFlex: { flex: 1, paddingVertical: Spacing.sm, fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  inputSuffix: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },

  estimateBox: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginTop: Spacing.sm,
  },
  estimateText: { fontSize: 12, color: Colors.primary },
  estimateStrong: { fontWeight: '800' },

  periodChips: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  periodChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  periodChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  periodChipText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  periodChipTextActive: { color: Colors.primary },

  primaryBtnDisabled: { backgroundColor: '#E2E8F0' },
  primaryBtnTextDisabled: { color: Colors.textMuted },
  helperText: { fontSize: 12, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.sm },
  ocrBtn: { backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  ocrBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  actionRow: { flexDirection: 'row', marginTop: Spacing.md },
  primaryBtn: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, alignItems: 'center' },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  secondaryBtn: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  // Ô xác nhận CHỈ ĐỌC thay cho nút gửi ở luồng nguyên căn — cao bằng nút để hàng không lệch.
  readonlyNote: {
    backgroundColor: '#F0FDF4', borderRadius: BorderRadius.lg, borderWidth: 1,
    borderColor: '#16A34A33', paddingVertical: 14, paddingHorizontal: Spacing.md,
    alignItems: 'center', justifyContent: 'center',
  },
  readonlyNoteText: { fontSize: 13, fontWeight: '700', color: '#15803D', textAlign: 'center' },
  sendBtn: { backgroundColor: Colors.success, borderRadius: BorderRadius.md, paddingVertical: Spacing.md, alignItems: 'center' },
  sendBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  doneEmoji: { fontSize: 64, marginBottom: Spacing.md },
  doneTitle: { fontSize: 22, fontWeight: '800', color: Colors.success, marginBottom: Spacing.sm },
  doneSub:   { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', marginBottom: Spacing.xl },

  historyCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.sm, ...Shadow.sm },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  typeTag:     { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  typeTagElec: { backgroundColor: '#FEF9C3' },
  typeTagWater:{ backgroundColor: '#DBEAFE' },
  typeTagText: { fontSize: 12, fontWeight: '700' },
  historyDate:    { fontSize: 12, color: Colors.textMuted },
  historyProperty:{ fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  historyPeriod:  { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  historyFooter:  { flexDirection: 'row', justifyContent: 'space-between', marginTop: Spacing.sm },
  historyRooms:   { fontSize: 12, color: Colors.textMuted },
  historyAmount:  { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },

  // Tab Lịch sử: chip lọc kỳ + tiêu đề mỗi kỳ (13/08/2026).
  histFilterRow: { flexDirection: 'row', gap: Spacing.xs, paddingBottom: Spacing.sm },
  histChip: {
    height: 30, paddingHorizontal: 12, borderRadius: BorderRadius.full,
    justifyContent: 'center', backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border,
  },
  histChipActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  histChipText:       { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  histChipTextActive: { color: Colors.white },
  histSectionHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Spacing.md, paddingBottom: Spacing.xs,
  },
  histSectionTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  histSectionMeta:  { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },

  // Xem ảnh phóng to (13/08/2026) — ảnh hoá đơn EVN và ảnh đồng hồ đều chữ nhỏ.
  zoomOverlay: {
    flex: 1, backgroundColor: 'rgba(2,6,23,0.92)',
    alignItems: 'center', justifyContent: 'center',
  },
  zoomImage: { width: '96%', height: '85%' },
  zoomClose: {
    position: 'absolute', top: 44, right: 20,
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: BorderRadius.full,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  zoomCloseText: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },

  empty: { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 40, marginBottom: Spacing.sm },
  emptyText:  { fontSize: 15, color: Colors.textMuted },
});

const stepSt = StyleSheet.create({
  wrap: { marginBottom: Spacing.base },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 6 },
  counter: {
    fontSize: 11, fontWeight: '900', color: Colors.primary,
    backgroundColor: Colors.primaryBg, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999,
    overflow: 'hidden',
  },
  name: { flex: 1, fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  bar: { flexDirection: 'row', height: 4 },
  seg: { flex: 1, borderRadius: 2, backgroundColor: Colors.border },
  segGap: { marginLeft: 4 },
  segDone: { backgroundColor: Colors.success },
  segActive: { backgroundColor: Colors.primary },
  note: { fontSize: 11, color: Colors.textMuted, marginTop: 6 },
});

const secSt = StyleSheet.create({
  title: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary, marginBottom: Spacing.sm, marginTop: Spacing.sm },
});

const evnSt = StyleSheet.create({
  row:            { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.xs },
  label:          { fontSize: 13, color: Colors.textSecondary },
  value:          { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  valueHighlight: { color: Colors.success, fontSize: 15, fontWeight: '800' },
});

const statusSt = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  title:  { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  empty:  { fontSize: 13, color: Colors.textMuted },
  statRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.sm },
  statChip: { fontSize: 12, fontWeight: '700' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  rowTitle: { fontSize: 13, fontWeight: '700', color: Colors.textPrimary },
  rowSub:   { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  badge:    { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  badgeText:{ fontSize: 11, fontWeight: '700' },
});
