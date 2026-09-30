import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import realApiClient from '@/services/core/realApiClient';
import { API_CONFIG } from '@/constants/api';

/**
 * Tenant onboarding service nối backend Spring THẬT.
 */
export interface HouseholdMemberInput {
  fullName: string;
  relation?: string;
  phone?: string;
  dateOfBirth?: string; // yyyy-MM-dd
  cccd?: string;
}

// 1 dòng trong biên bản bàn giao thiết bị (snapshot theo hợp đồng).
// EXISTING = thiết bị sẵn có của nhà/phòng được bàn giao · ADDED = khách lắp thêm (chủ đầu tư mua).
export interface EquipmentSnapshotItem {
  equipmentId?: number;
  name: string;
  category: string;
  quantity: number;
  cost?: number;
  source: 'EXISTING' | 'ADDED';
  ownedBy: 'OWNER';
}

// Nội thất trong phạm vi HĐ (phòng + khu vực chung, hoặc cả căn nếu nguyên căn) —
// GET properties/{propertyId}/contract-available-equipments?roomId=. CHỈ để hiển thị
// read-only: BE tự gắn toàn bộ thiết bị ACTIVE vào HĐ, không còn tick chọn
// (FE-contract-equipment-auto.md 2026-07).
export interface ContractAvailableEquipmentItem {
  id: number;
  name: string;
  condition: string; // NEW | GOOD | DAMAGED | BROKEN
  quantity: number;
  scope?: 'ROOM' | 'SHARED'; // thiết bị của phòng hay khu vực chung
  roomNumber?: string;
  houseArea?: string;
}

// Thiết bị lắp thêm theo yêu cầu khách — chủ đầu tư mua, chưa có trong inventory lúc
// submit. BE tự tạo EquipmentCatalog (nếu chưa có) + Equipment (source=ADDED_BY_TENANT)
// và gộp vào equipmentSnapshot. KHÔNG có field quantity ở BE — FE tự lặp N dòng nếu
// quantity > 1 (xem cách buildPayload dùng field này).
export interface ContractAddedEquipmentInput {
  name: string;
  category?: string;
  cost?: number;
  roomId?: number;
  condition?: 'NEW' | 'GOOD' | 'DAMAGED' | 'BROKEN';
}

// Ảnh bằng chứng onboard (đồng hồ điện/nước, hiện trạng phòng) kèm thời điểm chụp —
// BE ưu tiên field capturedAt do FE gửi (thời điểm chụp trên thiết bị); nếu không
// gửi thì BE tự ghi LocalDateTime.now() lúc lưu (chỉ là thời điểm ghi nhận, không
// chính xác bằng chứng bằng thời điểm chụp thật). Xem FE-onboard-photo-timestamp.md.
export interface EvidencePhoto {
  url: string;
  capturedAt: string; // ISO-8601, vd new Date().toISOString() ngay lúc upload xong
}

export interface OnboardTenantRequest {
  fullName: string;
  cccd: string;
  phoneNumber: string;
  dateOfBirth?: string; // yyyy-MM-dd
  moveInDate: string; // yyyy-MM-dd
  rentAmount: number;
  deposit: number;
  endDate?: string;
  // Nội thất có sẵn: KHÔNG còn field nào để gửi — equipmentSnapshot/selectedEquipmentIds/
  // declinedEquipmentIds đã bỏ hẳn khỏi type. BE tự gắn TOÀN BỘ thiết bị ACTIVE trong
  // phạm vi HĐ và tự sinh equipmentSnapshot khi tạo/PUT/render PDF; gửi
  // selectedEquipmentIds=[] còn bị hiểu là "không gắn gì" (FE-contract-equipment-auto.md 2026-07).

  depositMonths?: number;
  initialElectricReading?: number;
  initialWaterReading?: number;
  electricMeterImageUrl?: string;
  electricMeterCapturedAt?: string; // ISO-8601 — thời điểm chụp ảnh đồng hồ điện
  waterMeterImageUrl?: string;
  waterMeterCapturedAt?: string; // ISO-8601 — thời điểm chụp ảnh đồng hồ nước
  /**
   * Mã cho phép NHẬP TAY chỉ số khi không chụp được ảnh (BE 08/08/2026).
   * Lấy từ `POST /api/v1/manager/meter-override/verify`, dùng một lần, TTL 15 phút.
   * BE chỉ tiêu thụ token khi ảnh đồng hồ tương ứng TRỐNG; `reason` là bắt buộc và
   * được ghi vào bảng audit cho admin soi (`GET /api/v1/admin/meter-overrides`).
   */
  electricMeterOverrideToken?: string;
  electricMeterOverrideReason?: string;
  waterMeterOverrideToken?: string;
  waterMeterOverrideReason?: string;
  roomConditionUrls?: string[]; // legacy — vẫn gửi được, BE tự set capturedAt = lúc lưu
  roomConditionPhotos?: EvidencePhoto[]; // ưu tiên field này — có capturedAt từng ảnh
  roomConditionNote?: string;
  householdMembers?: HouseholdMemberInput[];

  // mobile: tạo HĐ PENDING, cần thanh toán cọc + OTP rồi confirm
  requireDepositPayment?: boolean;
  // Case 2: manager chưa chắc giá -> BE tạo HĐ chờ Host duyệt giá, CHƯA thu cọc.
  requireHostPriceApproval?: boolean;
  // Thiết bị lắp thêm theo yêu cầu khách (vẫn được gửi) — gửi kèm ngay trong request
  // tạo/sửa để BE link đúng vào contract (KHÔNG tạo qua endpoint equipment chung riêng
  // lẻ). null/omit = giữ lắp thêm cũ; [] = xóa hết lắp thêm.
  addedEquipments?: ContractAddedEquipmentInput[];
}

/**
 * CÁCH TÍNH một khoản tiền, do BE dựng sẵn (`PaymentBreakdownResponse`, 10/08/2026).
 *
 * Mọi thứ trong đây đã được format sẵn để render thẳng. Cố ý KHÔNG tự tính lại ở FE:
 * BE làm tròn theo phép nhân chia cả tháng (HALF_UP), còn `dailyRate` trả về đã làm
 * tròn rồi — lấy nó nhân lại với số ngày là ra số lệch vài đồng so với hoá đơn thật.
 */
export interface PaymentBreakdownLine {
  key: string;            // rentAmount | depositMonths | dailyRate | billedDays | period | total…
  label: string;
  displayValue: string;   // đã format, render trực tiếp được
  amount?: number;
  unit?: string;          // VND | ngày | tháng
}

export interface PaymentBreakdown {
  kind:
    | 'DEPOSIT_ONBOARD'
    | 'RENT_FIRST_PRO_RATA'
    | 'RENT_FIRST_FULL'
    /** Vào ở ≤3 ngày cuối tháng → không phát hoá đơn, gộp sang tháng sau. */
    | 'RENT_FIRST_DEFERRED'
    | 'RENT_REGULAR'
    | 'OTHER';
  title: string;
  /** VD "(5.000.000 ÷ 30) × 6 = 1.000.000". Có thể null. */
  formula?: string | null;
  explanation: string;
  totalAmount: number;
  rentAmountMonthly?: number;
  depositMonths?: number;
  depositAmount?: number;
  dailyRate?: number;
  daysInMonth?: number;
  billedDays?: number;
  periodStart?: string;
  periodEnd?: string;
  includesMoveInDay?: boolean;
  proRated?: boolean;
  deferredToNextMonth?: boolean;
  lines: PaymentBreakdownLine[];
}

export interface TenantContractResponse {
  id: number;
  propertyId: number;
  propertyName?: string;
  roomId?: number;
  roomNumber?: string;
  tenantUserId: string;
  tenantFullName: string;
  tenantPhone: string;
  tenantCccd?: string;
  contractCode: string;
  rentAmount: number;
  deposit: number;
  /** Số tháng tiền nhà dùng làm cọc — BE trả ở toResponse, dùng để ghi rõ "cọc (N tháng)". */
  depositMonths?: number;
  moveInDate: string;
  startDate: string;
  endDate?: string;
  expectedReceptionDate?: string; // yyyy-MM-dd — ngày manager dự kiến đến đón khách
  status: string;
  paymentStatus?: string; // PENDING | PAID | FAILED | CANCELLED — trạng thái thu CỌC
  /**
   * Mốc PayOS ghi nhận khoản thu lúc đón khách (tiền nhà tháng đầu + cọc), hoặc lúc
   * quản lý xác nhận tiền mặt. BE set trong `completeDepositPayment` từ 08/08/2026 —
   * trước đó chỉ có `paidAt`. Dùng để hiện "đã thu" mà không phải suy từ `paymentStatus`.
   */
  depositPaidAt?: string;
  /** BE suy ra: có payosOrderCode → 'PAYOS'; có xác nhận tiền mặt → 'CASH'; chưa thu → null. */
  depositMethod?: string;
  /**
   * Hai "chữ ký" OTP của luồng xác nhận hợp đồng (BE commit `bd2503b`, 27/08/2026) —
   * xem `shared/contractConfirmService`. Đủ CẢ HAI thì BE mới chuyển HĐ sang ACTIVE.
   *
   * ⚠️ BE cố ý KHÔNG lưu mốc "khách đã bấm gửi OTP", nên từ hai field này không phân
   * biệt được "khách chưa bấm gửi" với "đã gửi, chưa ai nhập". Đừng viết UI khẳng định
   * chắc chắn khách chưa gửi — xem `toConfirmState`.
   */
  tenantOtpVerifiedAt?: string;
  managerOtpVerifiedAt?: string;
  /** Mốc HĐ chuyển ACTIVE. Null khi còn chờ một trong hai bên. */
  activatedAt?: string;
  paidAt?: string;
  // HĐ tự động hủy no-show (quá 10 ngày sau moveInDate mà chưa kích hoạt) hoặc
  // thanh lý tay đều populate 3 field này — xem getContractTerminationTypeLabel.
  terminatedAt?: string;
  terminationReason?: string;
  terminationType?: string; // EARLY_MOVE_OUT | VIOLATION | MUTUAL_AGREEMENT | NO_SHOW | OTHER
  payosOrderCode?: number;
  payosCheckoutUrl?: string;
  payosQrCode?: string;
  /**
   * Số tiền khách phải chuyển khi đón khách — từ BE `609de59`/`276b613` (12/08/2026)
   * là khoản **GỘP**: tiền cọc + tiền nhà chu kỳ đầu (chia theo số ngày ở từ ngày nhận
   * phòng đến hết tháng). Khách quét QR trả MỘT lần, không còn hoá đơn tiền nhà kỳ đầu
   * trả sau như giai đoạn 10–12/08/2026.
   *
   * Vẫn PHẢI hiển thị field này chứ đừng tự cộng lại từ `rentAmount`/`deposit`: BE
   * dùng đúng số này để tạo link/QR PayOS, tự tính lại là có ngày lệch với số mà app
   * ngân hàng trừ của khách.
   * Chỉ có trong response của deposit-payment; các API khác không trả.
   */
  initialPaymentAmount?: number;

  /** Cách tính phần tiền cọc trong QR (BE 10/08/2026). Manager gọi thì BE trả null (ý 15). */
  depositPaymentBreakdown?: PaymentBreakdown;
  /**
   * Cách tính phần tiền nhà chu kỳ đầu — nay là MỘT PHẦN của cùng mã QR đó, không phải
   * khoản trả sau. Dùng để giải thích vì sao tổng tiền không phải "cọc chẵn".
   */
  firstRentPaymentBreakdown?: PaymentBreakdown;

  // Hiện trạng phòng lúc đón khách (ảnh + ghi chú) + chỉ số đồng hồ điện/nước ban đầu.
  initialElectricReading?: number;
  initialWaterReading?: number;
  electricMeterImageUrl?: string;
  electricMeterCapturedAt?: string;
  waterMeterImageUrl?: string;
  waterMeterCapturedAt?: string;
  roomConditionUrls?: string[];
  roomConditionPhotos?: EvidencePhoto[];
  roomConditionNote?: string;

  // File hợp đồng (nháp lẫn chính thức đều dùng chung 1 URL Cloudinary — BE không
  // render file mới sau ACTIVE, xem FE-tenant-draft-contract-document.md 2026-07-09).
  // `documentUrl` là field BE map sẵn = draftContractFileUrl (ưu tiên) hoặc fallback cũ.
  // File giờ là PDF (BE đổi từ DOCX 2026-07-14, xem FE-draft-contract-pdf.md) —
  // HĐ cũ có thể còn .docx; downloadContractDocument tự phân nhánh theo Content-Type.
  draftContractFileUrl?: string;
  documentUrl?: string;
  pdfUrl?: string; // alias BE thêm 2026-07-14 — cùng URL với documentUrl
  // true khi đã có file lưu — bật nút "Xem hợp đồng". KHÔNG mở draftContractFileUrl/
  // documentUrl (Cloudinary) trực tiếp, dùng realTenantService.downloadContractDocument
  // (GET .../document/download), xem FE-view-contract.md.
  contractFileAvailable?: boolean;

  // Sau khi confirm: thông tin tài khoản tenant (BE bổ sung — xem MD work/Onboarding.md)
  tenantUsername?: string;
  tenantAccountCreated?: boolean; // true nếu vừa tạo mới tài khoản
  tenantRolePromoted?: boolean;   // true nếu vừa nâng ROLE_USER -> ROLE_TENANT

  /** Người ĐANG phụ trách — đổi mỗi khi host đổi quản lý khu vực. */
  assignedManagerName?: string;
  /**
   * Người THỰC SỰ đón khách lúc onboard (BE thêm 20/08/2026). Ghi một lần, KHÔNG bị ghi đè
   * khi đổi quản lý khu vực — nên đây mới là người trả lời được các câu hỏi về lúc bàn giao.
   * HĐ tạo trước 20/08/2026 không có dữ liệu này.
   */
  onboardedByManagerName?: string;
  onboardedByManagerPhone?: string;
  onboardedAt?: string;

  // Duyệt giá (Case 2). Tên field suy ra từ thiết kế — chỉnh nếu BE đặt khác.
  priceApprovalStatus?: ContractPriceApprovalStatus;
  priceRejectReason?: string;
  // Nội thất HĐ — read-only, BE tự gắn toàn bộ EXISTING ACTIVE (FE-contract-equipment-auto.md):
  equipmentSnapshot?: string; // text BE sinh cho PDF, vd "Giường (Tốt) x1, Tủ lạnh (Mới) x1"
  equipmentList?: ContractAvailableEquipmentItem[];          // thiết bị đã gắn HĐ (EXISTING + ADDED)
  availableEquipmentList?: ContractAvailableEquipmentItem[]; // inventory nhà trong phạm vi HĐ
  selectedExistingIds?: number[]; // ID nội thất có sẵn đã gắn (≈ toàn bộ available)
}

// Trạng thái duyệt giá của hợp đồng (Case 2 — gửi Host duyệt).
export type ContractPriceApprovalStatus =
  | 'PENDING_PRICE_APPROVAL'   // chờ Host duyệt
  | 'APPROVED_AWAITING_DEPOSIT' // Host đồng ý, chờ manager thu cọc
  | 'PRICE_REJECTED';          // Host từ chối (+ lý do)

export interface OcrMeterResponse {
  reading: string;
  numbers: string[];
  rawText: string;
}

// BE: OcrEvnBillResponse — endpoint riêng cho ảnh HOÁ ĐƠN EVN (gọi OCR.space với isTable=true,
// đọc bảng tốt hơn /ocr/meter vốn dành cho ảnh đồng hồ). BigDecimal serialize ra number.
export interface OcrEvnBillResponse {
  totalKwh: number | null;
  totalAmount: number | null;
  billingPeriod: string;
  rawText: string;
}

// Body cho POST /tenant-contracts/{id}/confirm (BE: ConfirmContractRequest).
// ⚠️ Tên field 'otp' suy ra từ DTO BE — nếu BE đặt tên khác (vd otpCode) thì đổi lại cho khớp.
export interface ConfirmContractRequest {
  otp: string;
}

export interface TenantLookupResponse {
  exists: boolean;
  fullName?: string;
  phoneNumber?: string;
  cccd?: string;
  role?: string; // BE (khuyến nghị) trả role để FE hiển thị hint chính xác
}

// Onboarding v2: username khách thuê MỚI = SĐT thuần (BE bỏ tiền tố 't').
// Xem BE-tenant-onboarding-v2-handoff.md §3.3/§4.7.
// Dùng làm fallback khi confirm response không kèm tenantUsername.
export const defaultTenantUsername = (phone: string): string =>
  String(phone).replace(/\D/g, '');

export const realTenantService = {
  // Thiết bị có thể chọn cho HĐ theo đúng phạm vi (phòng + khu vực chung, hoặc cả căn
  // nếu bỏ roomId) — xem FE-contract-handover-equipment.md §3.1.
  getContractAvailableEquipments: async (
    propertyId: number,
    roomId?: number | null,
  ): Promise<ContractAvailableEquipmentItem[]> => {
    const { data } = await realApiClient.get<ContractAvailableEquipmentItem[]>(
      `/api/v1/properties/${propertyId}/contract-available-equipments`,
      { params: roomId != null ? { roomId } : {} },
    );
    return data ?? [];
  },

  onboardRoomTenant: async (
    propertyId: number,
    roomId: number,
    body: OnboardTenantRequest
  ): Promise<TenantContractResponse> => {
    const { data } = await realApiClient.post<TenantContractResponse>(
      `/api/v1/properties/${propertyId}/rooms/${roomId}/tenant-contract`,
      body
    );
    return data;
  },

  onboardWholeHouseTenant: async (
    propertyId: number,
    body: OnboardTenantRequest
  ): Promise<TenantContractResponse> => {
    const { data } = await realApiClient.post<TenantContractResponse>(
      `/api/v1/properties/${propertyId}/tenant-contract`,
      body
    );
    return data;
  },

  listByProperty: async (propertyId: number): Promise<TenantContractResponse[]> => {
    const { data } = await realApiClient.get<TenantContractResponse[]>(
      `/api/v1/properties/${propertyId}/tenant-contracts`
    );
    return data ?? [];
  },

  /**
   * HĐ ĐANG HIỆU LỰC của nhiều nhà — cho các màn tổng hợp của manager (Trang chủ,
   * Hoá đơn tiền nhà) biết phòng nào còn khách, để loại hoá đơn của khách đã chấm dứt.
   *
   * Vì sao không dùng `listManagedContracts('ACTIVE')` cho gọn: endpoint đó trả rỗng
   * (13/08/2026, thử với nhiều tài khoản manager) nên bộ lọc thành vô hiệu — im lặng,
   * không lỗi, rất khó phát hiện. `listByProperty` thì đang chạy thật ở màn
   * BuildingBilling, nên đi đường đó cho chắc.
   *
   * Chạy theo lô để không bắn hàng loạt request cùng lúc; nhà nào lỗi thì bỏ qua nhà đó.
   */
  listActiveByProperties: async (propertyIds: number[]): Promise<TenantContractResponse[]> => {
    const out: TenantContractResponse[] = [];
    const ids = [...new Set(propertyIds.filter(Number.isFinite))];
    for (let i = 0; i < ids.length; i += 6) {
      const batch = ids.slice(i, i + 6);
      const res = await Promise.all(
        batch.map(id => realTenantService.listByProperty(id).catch(() => [] as TenantContractResponse[])),
      );
      res.forEach(r => out.push(...r));
    }
    return out.filter(c => (c.status || '').toUpperCase() === 'ACTIVE');
  },

  // OCR chỉ số đồng hồ từ ảnh đã upload Cloudinary
  ocrMeter: async (imageUrl: string): Promise<OcrMeterResponse> => {
    const { data } = await realApiClient.post<OcrMeterResponse>('/api/v1/ocr/meter', { imageUrl });
    return data;
  },

  // OCR hoá đơn EVN — dùng cho ảnh hoá đơn, KHÔNG dùng ocrMeter (khác cấu hình isTable).
  ocrEvnBill: async (imageUrl: string): Promise<OcrEvnBillResponse> => {
    const { data } = await realApiClient.post<OcrEvnBillResponse>('/api/v1/ocr/evn-bill', { imageUrl });
    return data;
  },

  // Tra cứu khách thuê đã có theo SĐT để tự điền form
  lookupByPhone: async (phone: string): Promise<TenantLookupResponse> => {
    const { data } = await realApiClient.get<TenantLookupResponse>('/api/v1/tenants/lookup', {
      params: { phone },
    });
    return data;
  },

  // PayOS: tạo link/QR thanh toán cọc cho HĐ
  createDepositPayment: async (contractId: number): Promise<TenantContractResponse> => {
    const { data } = await realApiClient.post<TenantContractResponse>(
      `/api/v1/tenant-contracts/${contractId}/deposit-payment`
    );
    return data;
  },

  // Poll trạng thái HĐ / thanh toán
  getContract: async (contractId: number): Promise<TenantContractResponse> => {
    const { data } = await realApiClient.get<TenantContractResponse>(
      `/api/v1/tenant-contracts/${contractId}`
    );
    return data;
  },

  /**
   * Gia hạn hợp đồng đang chạy — dời `endDate`, kèm giá mới nếu có.
   * `PATCH /tenant-contracts/{id}/extend` (BE 01/09/2026, quyền MANAGER|ADMIN).
   *
   * BE tự chặn: chỉ nhận HĐ `ACTIVE`, ngày mới phải sau ngày cũ và không vượt quá hạn
   * hợp đồng với chủ nhà gốc. Đổi giá thì ghi vào lịch sử giá loại `HOP_DONG`.
   *
   * Đây là đường DUY NHẤT để khách ở tiếp. Không gia hạn trước ngày hết hạn thì hôm sau
   * cron đổi HĐ sang EXPIRED và tự mở phiếu trả phòng — lúc đó phải huỷ phiếu, không
   * gia hạn được nữa.
   */
  extendContract: async (
    contractId: number,
    body: { newEndDate: string; newRentAmount?: number },
  ): Promise<TenantContractResponse> => {
    const { data } = await realApiClient.patch<TenantContractResponse>(
      `/api/v1/tenant-contracts/${contractId}/extend`, body,
    );
    return data;
  },

  // Chủ động hỏi PayOS & đồng bộ trạng thái thanh toán (local không có webhook)
  checkPayment: async (contractId: number): Promise<TenantContractResponse> => {
    const { data } = await realApiClient.post<TenantContractResponse>(
      `/api/v1/tenant-contracts/${contractId}/check-payment`
    );
    return data;
  },

  // Gửi OTP xác nhận hợp đồng (BE: POST /tenant-contracts/{id}/send-otp).
  //
  // ⚠️ Comment cũ ở đây ghi "Dev OTP mode: confirm chấp nhận mọi mã 6 số" — SAI. Đọc
  // `OtpServiceImpl.verifyOrThrow` thì không có nhánh nào bỏ qua việc so mã; khi chưa
  // cấu hình Twilio, BE chỉ `log.warn` mã ra console chứ không nới lỏng kiểm tra. Gõ
  // bừa 6 số luôn trả "Mã OTP không đúng" — lúc test phải lấy mã từ log server.
  sendContractOtp: async (contractId: number): Promise<void> => {
    await realApiClient.post(`/api/v1/tenant-contracts/${contractId}/send-otp`);
  },

  // Hoàn tất HĐ sau khi đã thanh toán cọc + OTP.
  // BE: confirm(Long id, @RequestBody ConfirmContractRequest) -> BẮT BUỘC có body (chứa mã OTP).
  confirmContract: async (
    contractId: number,
    body: ConfirmContractRequest,
  ): Promise<TenantContractResponse> => {
    const { data } = await realApiClient.post<TenantContractResponse>(
      `/api/v1/tenant-contracts/${contractId}/confirm`,
      body,
    );
    return data;
  },

  // PUT /tenant-contracts/{id} — cập nhật draft: ảnh hiện trạng phòng, chỉ số điện
  // nước ban đầu, ghi chú... (xem tài liệu đón khách §2c/2d).
  updateDraftContract: async (
    contractId: number,
    // `completeCapture: true` (BE 24/09/2026) = chụp xong → AWAITING_ONBOARD → AWAITING_PAYMENT.
    body: Partial<OnboardTenantRequest> & { completeCapture?: boolean },
  ): Promise<TenantContractResponse> => {
    const { data } = await realApiClient.put<TenantContractResponse>(
      `/api/v1/tenant-contracts/${contractId}`,
      body,
    );
    return data;
  },

  // ===== Duyệt giá (Case 2) — phụ thuộc BE, tên endpoint suy ra từ thiết kế =====

  // Danh sách HĐ chờ xử lý của manager: gồm DRAFT/PENDING được gán (đón khách v2)
  // và các HĐ chờ/đã duyệt/bị từ chối giá. Chấp nhận array thuần lẫn Spring Page.
  listManagedContracts: async (
    // 'ACTIVE' thêm 13/08/2026: các màn việc-cần-làm của manager cần biết phòng nào
    // CÒN khách để loại hoá đơn của khách đã chấm dứt HĐ (xem belongsToActiveTenant).
    status?: ContractPriceApprovalStatus | 'DRAFT' | 'AWAITING_ONBOARD' | 'AWAITING_PAYMENT' | 'AWAITING_CONFIRM'
      | 'RECEPTION' | 'PENDING' | 'ACTIVE',
  ): Promise<TenantContractResponse[]> => {
    const { data } = await realApiClient.get<
      TenantContractResponse[] | { content?: TenantContractResponse[] }
    >('/api/v1/tenant-contracts/managed', { params: status ? { status } : {} });
    if (Array.isArray(data)) return data;
    return data?.content ?? [];
  },

  // Manager chỉnh giá sau khi Host từ chối -> gửi Host duyệt lại.
  resubmitPriceApproval: async (
    contractId: number,
    body: { rentAmount: number; deposit: number },
  ): Promise<TenantContractResponse> => {
    const { data } = await realApiClient.post<TenantContractResponse>(
      `/api/v1/tenant-contracts/${contractId}/resubmit-approval`,
      body,
    );
    return data;
  },

  // Tải file HĐ đã lưu về máy để xem (nút "Xem hợp đồng") — KHÔNG mở
  // draftContractFileUrl/documentUrl (Cloudinary) trực tiếp, xem FE-view-contract.md.
  // File mới là PDF, HĐ cũ có thể còn DOCX (FE-draft-contract-pdf.md) — đặt đuôi file
  // theo Content-Type response rồi trả kèm mimeType cho caller Sharing.shareAsync.
  downloadContractDocument: async (
    contractId: number,
    contractCode: string,
  ): Promise<{ uri: string; mimeType: string }> => {
    const token = await AsyncStorage.getItem('accessToken');
    const url = `${API_CONFIG.REAL_BASE_URL}/api/v1/tenant-contracts/${contractId}/document/download`;

    // WEB: expo-file-system là module native, downloadAsync/moveAsync KHÔNG tồn tại
    // trên react-native-web — gọi vào là ném "The method or property
    // expo-file-system.downloadAsync is not available on web". Dùng fetch + Blob rồi
    // trả về object URL; caller mở bằng window.open thay cho Sharing (cũng native-only).
    if (Platform.OS === 'web') {
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error('Không tải được hợp đồng.');
      const contentType = res.headers.get('content-type') ?? '';
      const isDocxWeb =
        contentType.includes('wordprocessingml') || contentType.includes('msword');
      const blob = await res.blob();
      return {
        uri: (globalThis as any).URL.createObjectURL(blob),
        mimeType: isDocxWeb
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/pdf',
      };
    }

    // Tải về tên tạm — chưa biết PDF hay DOCX trước khi đọc header response.
    const tmpUri = `${FileSystem.cacheDirectory}${contractCode}.tmp`;
    const result = await FileSystem.downloadAsync(url, tmpUri, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (result.status !== 200) {
      throw new Error('Không tải được hợp đồng.');
    }
    const contentType =
      result.headers['Content-Type'] ?? result.headers['content-type'] ?? '';
    // Header thiếu/octet-stream → mặc định PDF theo spec BE mới.
    const isDocx = contentType.includes('wordprocessingml') || contentType.includes('msword');
    const mimeType = isDocx
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/pdf';
    const finalUri = `${FileSystem.cacheDirectory}${contractCode}.${isDocx ? 'docx' : 'pdf'}`;
    await FileSystem.deleteAsync(finalUri, { idempotent: true });
    await FileSystem.moveAsync({ from: result.uri, to: finalUri });
    return { uri: finalUri, mimeType };
  },

  // Hủy hợp đồng (khi manager quyết định không tiếp tục onboarding).
  cancelContract: async (contractId: number): Promise<void> => {
    await realApiClient.post(`/api/v1/tenant-contracts/${contractId}/cancel`);
  },

  /**
   * Thanh lý HĐ ACTIVE/EXPIRED (manager chủ động, không qua checkout-request).
   * BE tự trả phòng về AVAILABLE + restore thiết bị (verify PASS 10/07/2026).
   * Luồng khách tự xin trả phòng dùng checkout-request (checkoutService/selfService).
   *
   * `type` và `reason` là BẮT BUỘC ở BE (TerminateContractRequest) — thiếu là 400.
   * Riêng VIOLATION bị BE rào: phải có hoá đơn tiền phòng quá hạn > 3 ngày
   * (từ ngày 8, xem @/constants/rentCycle) thì mới chấm dứt được.
   */
  terminateContract: async (
    contractId: number,
    options: {
      type?: 'EARLY_MOVE_OUT' | 'VIOLATION' | 'MUTUAL_AGREEMENT' | 'NO_SHOW' | 'OTHER';
      reason?: string;
      /** Ngày chấm dứt thực tế (yyyy-MM-dd) — bỏ trống thì BE lấy hôm nay. */
      effectiveDate?: string;
      note?: string;
    } = {},
  ): Promise<void> => {
    await realApiClient.post(`/api/v1/tenant-contracts/${contractId}/terminate`, {
      type: options.type ?? 'MUTUAL_AGREEMENT',
      reason: options.reason ?? 'Quản lý thanh lý hợp đồng',
      effectiveDate: options.effectiveDate,
      note: options.note,
    });
  },
};
