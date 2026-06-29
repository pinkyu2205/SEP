# API Contract — Bàn giao thiết bị & Duyệt giá khi đón khách

> **Cho team Backend.** Tài liệu này mô tả toàn bộ endpoint, request/response, trạng thái và luồng mà **Frontend (mobile manager + web host) đã code và đang gọi**. Làm đúng theo đây là FE chạy được end-to-end, không cần sửa FE.
>
> Phạm vi: bổ sung vào luồng **đón khách (tenant onboarding)** 2 tính năng:
> - **A. Bàn giao thiết bị** — ghi nhận thiết bị bàn giao cho khách (sẵn có + lắp thêm).
> - **B. Duyệt giá** — khi manager chưa chắc giá thì gửi Host duyệt trước khi thu cọc.
>
> Quy ước: base path `/api/v1`, JWT Bearer, response DTO phẳng (không bọc `{ data }`), tiền tệ là số nguyên VNĐ, ngày dạng `yyyy-MM-dd`.

---

## 1. Bức tranh tổng thể

```
Manager đón khách (mobile)
  ├─ Bước "Bàn giao thiết bị": chọn thiết bị sẵn có + thêm thiết bị lắp thêm
  │     → gửi kèm equipmentSnapshot trong body tạo hợp đồng
  │
  └─ Bước "Tạo hợp đồng": chọn 1 trong 2 chế độ giá
        ├─ CASE 1 "Đã thống nhất với Host"  (requireHostPriceApproval = false)
        │     → tạo HĐ → thu cọc → OTP → ACTIVE   (luồng cũ, không đổi)
        │
        └─ CASE 2 "Gửi Host duyệt giá"      (requireHostPriceApproval = true)
              → tạo HĐ trạng thái PENDING_PRICE_APPROVAL (CHƯA thu cọc)
              → Host duyệt trên web (/host/contracts)
                   ├─ APPROVE → APPROVED_AWAITING_DEPOSIT → manager thu cọc + OTP → ACTIVE
                   └─ REJECT (+lý do) → PRICE_REJECTED → manager chỉnh giá gửi lại / hủy
```

### Trạng thái duyệt giá (`priceApprovalStatus`)
| Giá trị | Ý nghĩa |
|---|---|
| `PENDING_PRICE_APPROVAL` | HĐ vừa tạo (Case 2), đang chờ Host duyệt. **Chưa thu cọc.** |
| `APPROVED_AWAITING_DEPOSIT` | Host đã đồng ý giá. Chờ manager thu cọc + OTP. |
| `PRICE_REJECTED` | Host từ chối. Có kèm `priceRejectReason`. |

> Case 1 (không qua duyệt) thì `priceApprovalStatus` để `null`/không set; HĐ đi theo luồng cũ.

---

## 2. PHẦN A — Bàn giao thiết bị

### 2.1. Sửa endpoint tạo hợp đồng đón khách (thêm field)

**Đã có sẵn**, chỉ **bổ sung 2 field vào request body**:

```
POST /api/v1/properties/{propertyId}/rooms/{roomId}/tenant-contract   (thuê theo phòng)
POST /api/v1/properties/{propertyId}/tenant-contract                  (thuê nguyên căn)
```

**Request body — bổ sung:**
```jsonc
{
  // ... các field cũ giữ nguyên (fullName, cccd, phoneNumber, moveInDate, endDate,
  //     rentAmount, deposit, depositMonths, initialElectricReading, ...) ...

  "equipmentSnapshot": "<chuỗi JSON, xem 2.2>",  // MỚI — biên bản bàn giao thiết bị
  "requireHostPriceApproval": false              // MỚI — xem Phần B (Case 1=false, Case 2=true)
}
```

**Yêu cầu BE:**
- Lưu `equipmentSnapshot` (kiểu text/JSON) gắn với hợp đồng. Đây là **bản đông cứng theo từng hợp đồng** (per-contract), KHÔNG dùng chung danh sách thiết bị của tòa nhà.
- Trả lại `equipmentSnapshot` trong response chi tiết hợp đồng (để FE/checkout đọc lại sau).

### 2.2. Schema của `equipmentSnapshot` (JSON đã stringify)

```jsonc
{
  "handoverDate": "2026-06-28",
  "items": [
    {
      "equipmentId": 12,        // có khi source=EXISTING (id thiết bị sẵn có); null khi ADDED
      "name": "Giường 1m6",
      "category": "Nội thất",
      "quantity": 1,
      "cost": null,             // có thể có khi ADDED (chi phí mua)
      "source": "EXISTING",     // EXISTING = thiết bị sẵn có được bàn giao | ADDED = khách lắp thêm
      "ownedBy": "OWNER"        // luôn OWNER (chủ đầu tư sở hữu)
    },
    {
      "name": "Máy lạnh Daikin",
      "category": "Điện lạnh",
      "quantity": 1,
      "cost": 8500000,
      "source": "ADDED",
      "ownedBy": "OWNER"
    }
  ]
}
```

> Ví dụ nghiệp vụ: nhà có **quạt + giường**, khách chỉ nhận **giường** → snapshot chỉ chứa giường (EXISTING). Khách yêu cầu lắp thêm **máy lạnh** → thêm 1 item ADDED. Quạt không xuất hiện trong snapshot của hợp đồng này.

### 2.3. Thiết bị FE cần đọc/tạo (đã có endpoint — xác nhận hoạt động)

| Mục đích | Method + Path | Ghi chú |
|---|---|---|
| Liệt kê thiết bị theo phòng | `GET /api/v1/equipment?roomId={roomId}` | Dùng khi thuê theo phòng |
| Liệt kê thiết bị theo nhà | `GET /api/v1/properties/{propertyId}/equipments` | Dùng khi thuê nguyên căn |
| **Tạo thiết bị lắp thêm** | `POST /api/v1/properties/{propertyId}/equipments` | Body bên dưới — thiết bị ADDED thành tài sản nhà |

**Body tạo thiết bị lắp thêm:**
```jsonc
{
  "equipmentName": "Máy lạnh Daikin",
  "category": "Điện lạnh",
  "roomId": 45        // optional — có khi gắn vào phòng cụ thể; bỏ khi nguyên căn
}
```

**EquipmentDto (response thiết bị) FE đang đọc:**
```jsonc
{
  "id": 12,
  "equipmentName": "Giường 1m6",
  "category": "Nội thất",
  "qrCode": "QR-...",            // optional
  "status": "GOOD",             // GOOD | MAINTENANCE | BROKEN | DISPOSED
  "roomId": 45,                 // optional
  "roomName": "P101",           // optional
  "propertyId": 7,
  "installationDate": "2026-01-01",
  "warrantyExpiredDate": "2028-01-01", // optional
  "maintenanceCount": 0,
  "lastMaintenanceDate": null   // optional
}
```

---

## 3. PHẦN B — Duyệt giá (Case 2)

### 3.1. Khi tạo hợp đồng với `requireHostPriceApproval = true`

BE **KHÔNG** tạo cọc, **KHÔNG** trả PayOS link. Thay vào đó:
- Tạo hợp đồng ở trạng thái `priceApprovalStatus = PENDING_PRICE_APPROVAL`.
- Hợp đồng phải xuất hiện trong danh sách Host duyệt (mục 3.4) và danh sách chờ xử lý của manager (mục 3.2).
- `status` chung của HĐ nên là `PENDING` (chưa kích hoạt).

### 3.2. (MỚI) Danh sách HĐ chờ xử lý của manager (mobile)

```
GET /api/v1/tenant-contracts/managed?status={priceApprovalStatus}
```
- `status` optional. Nếu bỏ trống → trả tất cả HĐ đang chờ xử lý của **manager đang đăng nhập** (lọc theo JWT) có `priceApprovalStatus` ∈ {PENDING_PRICE_APPROVAL, APPROVED_AWAITING_DEPOSIT, PRICE_REJECTED}.
- Trả mảng `TenantContractResponse[]` (xem 3.6).

### 3.3. (MỚI) Manager chỉnh giá & gửi duyệt lại / hủy

```
POST /api/v1/tenant-contracts/{id}/resubmit-approval
Body: { "rentAmount": 5000000, "deposit": 5000000 }
→ cập nhật giá, đặt lại priceApprovalStatus = PENDING_PRICE_APPROVAL, trả TenantContractResponse
```
```
POST /api/v1/tenant-contracts/{id}/cancel
→ hủy hợp đồng (đang chờ). Trả 200/204.
```

### 3.4. (Phía Host — web) Liệt kê & duyệt/từ chối

**Đã có sẵn trong host.service**, cần đảm bảo hoạt động với HĐ chờ duyệt giá:

```
GET /api/v1/host/contracts?status=PENDING          → Page<HostContractDto>
PUT /api/v1/host/contracts/{id}/approve            → đồng ý giá
PUT /api/v1/host/contracts/{id}/reject             → từ chối; Body: { "reason": "..." }
```

**Yêu cầu BE:**
- `GET .../host/contracts?status=PENDING` phải trả về các HĐ `PENDING_PRICE_APPROVAL` của Host đang đăng nhập, **kèm `rentAmount`** (giá đề xuất) và (khuyến nghị) **`equipmentSnapshot`** để Host có căn cứ duyệt.
- `approve` → đặt `priceApprovalStatus = APPROVED_AWAITING_DEPOSIT` + bắn notification cho manager (mục 4). **Không kích hoạt HĐ ngay** (vì còn chờ thu cọc).
- `reject` → đặt `priceApprovalStatus = PRICE_REJECTED`, lưu `priceRejectReason = reason` + bắn notification cho manager.

**HostContractDto (response Page.content) FE đang đọc:**
```jsonc
{
  "id": "123",
  "code": "HD-MT-2026-001",
  "lesseeName": "Nguyễn Văn A",
  "propertyName": "Nhà Nguyễn Trãi",
  "roomCode": "P101",        // optional
  "lessorName": "Hoàng Bình Land", // optional
  "rentAmount": 5000000,
  "startDate": "2026-06-28",
  "endDate": "2027-06-27",   // optional
  "status": "PENDING"        // PENDING | ACTIVE | EXPIRED | TERMINATED
}
```

### 3.5. Manager thu cọc + OTP sau khi Host duyệt (endpoint cũ — không đổi)

Khi `priceApprovalStatus = APPROVED_AWAITING_DEPOSIT`, manager mở lại HĐ và dùng **đúng các endpoint cũ**:
```
POST /api/v1/tenant-contracts/{id}/deposit-payment   → tạo link/QR PayOS
POST /api/v1/tenant-contracts/{id}/check-payment      → đồng bộ trạng thái thanh toán
POST /api/v1/tenant-contracts/{id}/confirm            → Body: { "otp": "123456" } → kích hoạt ACTIVE
GET  /api/v1/tenant-contracts/{id}                     → lấy chi tiết
```

### 3.6. TenantContractResponse (response chi tiết HĐ) FE đang đọc

```jsonc
{
  "id": 123,
  "propertyId": 7,
  "roomId": 45,                 // optional
  "roomNumber": "P101",         // optional
  "tenantUserId": "u-1",
  "tenantFullName": "Nguyễn Văn A",
  "tenantPhone": "0901234567",
  "tenantCccd": "012345678901", // optional
  "contractCode": "HD-MT-2026-001",
  "rentAmount": 5000000,
  "deposit": 5000000,
  "moveInDate": "2026-06-28",
  "startDate": "2026-06-28",
  "endDate": "2027-06-27",      // optional
  "status": "PENDING",          // PENDING | ACTIVE | EXPIRED | TERMINATED
  "paymentStatus": "PENDING",   // PENDING | PAID | FAILED | CANCELLED (optional)
  "payosOrderCode": 0,          // optional
  "payosCheckoutUrl": "...",    // optional
  "payosQrCode": "...",         // optional (chuỗi VietQR)

  // sau confirm:
  "tenantUsername": "0901234567",   // optional
  "tenantAccountCreated": true,     // optional
  "tenantRolePromoted": false,      // optional

  // duyệt giá (Case 2):
  "priceApprovalStatus": "PENDING_PRICE_APPROVAL", // optional — xem mục 1
  "priceRejectReason": "Giá cao hơn mặt bằng",     // optional — chỉ khi PRICE_REJECTED
  "equipmentSnapshot": "<chuỗi JSON>"              // optional — trả lại snapshot đã lưu
}
```

---

## 4. Notification (đẩy cho manager)

Khi Host **approve** hoặc **reject**, BE bắn push notification tới manager phụ trách HĐ, với payload `data` để app mở đúng màn:

```jsonc
{
  "title": "Host đã duyệt giá hợp đồng HD-MT-2026-001",   // hoặc "Host đã từ chối..."
  "body": "...",
  "data": {
    "screen": "ResumeContract",
    "params": { "contractId": 123 }
  }
}
```

> FE đã xử lý deep-link: bấm vào thông báo sẽ mở thẳng màn "Tiếp tục hợp đồng" với `contractId` tương ứng.

---

## 5. Checklist cho team BE

**Phần A — Bàn giao thiết bị**
- [ ] `POST .../tenant-contract` (room & whole-house): nhận & lưu `equipmentSnapshot` (text/JSON) gắn theo HĐ.
- [ ] Trả `equipmentSnapshot` trong `GET /tenant-contracts/{id}` và (khuyến nghị) trong list Host duyệt.
- [ ] `POST /properties/{id}/equipments` tạo thiết bị lắp thêm (body `{equipmentName, category, roomId?}`) — đảm bảo hoạt động.
- [ ] `GET /equipment?roomId=` và `GET /properties/{id}/equipments` trả đúng EquipmentDto.

**Phần B — Duyệt giá**
- [ ] `POST .../tenant-contract` nhận cờ `requireHostPriceApproval`; nếu `true` → tạo HĐ `PENDING_PRICE_APPROVAL`, **KHÔNG** tạo cọc/PayOS.
- [ ] Bổ sung field `priceApprovalStatus` + `priceRejectReason` vào HĐ và response.
- [ ] `GET /api/v1/tenant-contracts/managed?status=` — list HĐ chờ xử lý của manager (lọc theo JWT).
- [ ] `POST /api/v1/tenant-contracts/{id}/resubmit-approval` (body `{rentAmount, deposit}`) → set lại `PENDING_PRICE_APPROVAL`.
- [ ] `POST /api/v1/tenant-contracts/{id}/cancel` → hủy HĐ chờ.
- [ ] `GET /host/contracts?status=PENDING` trả HĐ `PENDING_PRICE_APPROVAL` kèm `rentAmount` (+ `equipmentSnapshot`).
- [ ] `PUT /host/contracts/{id}/approve` → `APPROVED_AWAITING_DEPOSIT` (KHÔNG kích hoạt ngay) + notify manager.
- [ ] `PUT /host/contracts/{id}/reject` (body `{reason}`) → `PRICE_REJECTED` + lưu lý do + notify manager.
- [ ] Notification approve/reject với `data.screen = "ResumeContract"`, `data.params.contractId`.

**Phần thu cọc/OTP (cũ — chỉ xác nhận chạy được sau duyệt)**
- [ ] `deposit-payment`, `check-payment`, `confirm {otp}` hoạt động trên HĐ đã `APPROVED_AWAITING_DEPOSIT`.

---

## 6. Quy ước & lưu ý

- Tất cả endpoint yêu cầu JWT; phân quyền: tạo HĐ/thu cọc/duyệt-lại/hủy = ROLE_MANAGER; approve/reject = ROLE_OWNER (Host).
- `equipmentSnapshot` là **per-contract immutable** — về sau dùng cho đối chiếu khi khách trả phòng (checkout), nên cần lưu nguyên vẹn.
- Tên field duyệt giá (`priceApprovalStatus`, `priceRejectReason`, `requireHostPriceApproval`) là do FE đặt theo thiết kế. **Nếu BE muốn đổi tên, báo lại để FE chỉnh** cho khớp — nhưng giữ nguyên sẽ không phải sửa FE.
- Giá thuê trong hợp đồng khách là **giá thương lượng riêng từng HĐ** (`rentAmount`), độc lập với giá sàn của tòa/phòng (luồng Host định giá tài sản — không liên quan tài liệu này).
```
