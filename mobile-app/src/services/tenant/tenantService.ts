import AsyncStorage from '@react-native-async-storage/async-storage';
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

export interface TenantContractResponse {
  id: number;
  propertyId: number;
  roomId?: number;
  roomNumber?: string;
  tenantUserId: string;
  tenantFullName: string;
  tenantPhone: string;
  tenantCccd?: string;
  contractCode: string;
  rentAmount: number;
  deposit: number;
  moveInDate: string;
  startDate: string;
  endDate?: string;
  expectedReceptionDate?: string; // yyyy-MM-dd — ngày manager dự kiến đến đón khách
  status: string;
  paymentStatus?: string; // PENDING | PAID | FAILED | CANCELLED
  // HĐ tự động hủy no-show (quá 10 ngày sau moveInDate mà chưa kích hoạt) hoặc
  // thanh lý tay đều populate 3 field này — xem getContractTerminationTypeLabel.
  terminatedAt?: string;
  terminationReason?: string;
  terminationType?: string; // EARLY_MOVE_OUT | VIOLATION | MUTUAL_AGREEMENT | NO_SHOW | OTHER
  payosOrderCode?: number;
  payosCheckoutUrl?: string;
  payosQrCode?: string;

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

  // Chủ động hỏi PayOS & đồng bộ trạng thái thanh toán (local không có webhook)
  checkPayment: async (contractId: number): Promise<TenantContractResponse> => {
    const { data } = await realApiClient.post<TenantContractResponse>(
      `/api/v1/tenant-contracts/${contractId}/check-payment`
    );
    return data;
  },

  // Gửi OTP xác nhận hợp đồng tới SĐT khách (BE: POST /tenant-contracts/{id}/send-otp).
  // Dev OTP mode: BE không gửi SMS thật, confirm chấp nhận mọi mã 6 số. Prod (Twilio): bắt buộc
  // gọi bước này trước confirm để có mã hợp lệ. Xem tài liệu tiếp khách §7.1.
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
    body: Partial<OnboardTenantRequest>,
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
    status?: ContractPriceApprovalStatus | 'DRAFT' | 'PENDING',
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

  // Thanh lý HĐ ACTIVE/EXPIRED (manager chủ động, không qua checkout-request).
  // BE tự trả phòng về AVAILABLE + restore thiết bị (verify PASS 10/07/2026).
  // Luồng khách tự xin trả phòng dùng checkout-request (checkoutService/selfService).
  terminateContract: async (contractId: number, reason?: string): Promise<void> => {
    await realApiClient.post(`/api/v1/tenant-contracts/${contractId}/terminate`, { reason });
  },
};
