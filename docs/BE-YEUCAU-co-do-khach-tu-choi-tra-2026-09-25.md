# Cờ đỏ "khách từ chối trả chi phí bảo trì" — 25/09/2026

Đã đọc code thật `MaintenanceServiceImpl` / `TenantOnboardingServiceImpl` (BE `7e7af84`) trước khi viết.

## 1. Quy tắc nghiệp vụ (đã chốt)

Khách làm hư thiết bị mà **từ chối trả** chi phí sửa (manager bấm "Khách từ chối trả" lúc
`diagnose()` → `companyAbsorbedFault = true`, công ty trả hộ):

1. Hệ thống **gắn cờ đỏ ngay**, **không chia mức** (1 lần từ chối là đỏ — quy tắc kinh doanh là
   "không trả thì cân nhắc chấm dứt hợp đồng").
2. Admin xem danh sách (thường cuối tháng) trên web và quyết định từng khách:
   - **Chấm dứt HĐ**;
   - **Trừ cọc lúc trả phòng** (lấy lại số công ty đã chịu);
   - **Bỏ cờ** (bắt buộc ghi lý do).
3. **Không** bắt buộc bằng chứng khách từ chối (đã bỏ khỏi phạm vi).

## 2. Hiện trạng (đã kiểm tra trong code)

- Nhánh này chỉ ghi `companyAbsorbedFault=true` + `companyAbsorbedNote`, phiếu về `CLOSED`, **không có
  bản ghi nợ, không cron, không thông báo** — `chargeBeforeRepair` còn chặn cứng với lỗi "công ty trả hộ".
- Chỉ có bộ lọc `GET /maintenance?companyAbsorbedFault=true` (FE đã dùng được để liệt kê).
- `MaintenanceRequestResponse` **không trả `tenantContractId`** → FE phải đoán hợp đồng theo khách + nhà.
- `terminateActiveContract(...)` với `type=VIOLATION` **chỉ cho phép khi có hoá đơn quá hạn**:
  ```java
  if (!hasOverdueRent && !hasOverdueNonRent) {
      throw new BusinessException("Không thể đơn phương chấm dứt hợp đồng (vi phạm) nếu không có hoá đơn ... quá hạn.");
  }
  ```
  Ca khách từ chối trả **không có hoá đơn nào** → không chấm dứt được bằng `VIOLATION`.
  FE tạm dùng `type=OTHER` (không bị chặn) để chạy được ngay.
- `OutstandingDamageRecord` + `getOutstandingDamages` + `markOutstandingDamageResolved` đã có sẵn cơ chế
  "khoản thiệt hại xử lý lúc checkout" (đang dùng cho luồng khách tự sửa quá hạn) — **tái dùng cho "Trừ cọc"**.
  Lưu ý `createOutstandingDamageRecord` lấy `estimatedAmount` từ `estimatedDamageAmount`, mà phiếu
  công ty-trả-hộ thường để trống field đó (số thợ nằm ở `invoiceAmount`) → phải truyền đúng số.

## 3. Yêu cầu BE

### 3.1 Lưu trạng thái xem xét trên phiếu
Thêm vào `MaintenanceRequest` (chỉ có nghĩa khi `companyAbsorbedFault = true`):

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `refusal_review_status` | enum `PENDING`/`DISMISSED`/`TERMINATED`/`DEDUCT_AT_CHECKOUT` | mặc định `PENDING` khi phiếu được đánh dấu công ty trả hộ; `null` với phiếu thường |
| `refusal_reviewed_by` | uuid | admin quyết định |
| `refusal_reviewed_at` | timestamp | |
| `refusal_review_note` | text | bắt buộc với `DISMISSED` |

Migration: phiếu hiện có `company_absorbed_fault = true` → set `PENDING`.
Trả các field này (+ `tenantContractId`, đã có sẵn `companyAbsorbedFault`/`companyAbsorbedNote`) trong
`MaintenanceRequestResponse` (list + detail). FE đã khai báo tên: `refusalReviewStatus`,
`refusalReviewedAt`, `refusalReviewedByName`, `refusalReviewNote`, `tenantContractId`.

### 3.2 Endpoint quyết định — `PUT /api/v1/maintenance/{id}/refusal-review` (ROLE_ADMIN)
Body: `{ "decision": "DISMISSED" | "DEDUCT_AT_CHECKOUT", "note": "..." }` (`note` bắt buộc).
- Chỉ áp dụng khi `companyAbsorbedFault = true` và đang `PENDING`; ngược lại 400 rõ ràng.
- `DISMISSED` → ghi trạng thái + note, gỡ cờ.
- `DEDUCT_AT_CHECKOUT` → tạo `OutstandingDamageRecord` cho hợp đồng của phiếu với
  `estimatedAmount = invoiceAmount ?? estimatedDamageAmount` (không phải `estimatedDamageAmount` một mình),
  `note` = lý do khách từ chối + note admin; nhờ đó số tiền tự hiện ở quyết toán trả phòng để trừ cọc.
- `TERMINATED` **không** do FE gọi — xem 3.3.
- Idempotent: gọi lại cùng quyết định không tạo bản ghi trùng.
FE đang khoá 2 nút Bỏ cờ / Trừ cọc bằng hằng `REFUSAL_REVIEW_BE_READY = false`
(`frontend-web/src/pages/admin/RefusedPayments.tsx`) — BE ship xong FE bật cờ là chạy.

### 3.3 Chấm dứt hợp đồng
- Cho phép chấm dứt khi hợp đồng có phiếu `companyAbsorbedFault=true` đang `PENDING`, **không cần hoá đơn quá hạn**.
  Đề xuất: thêm `ContractTerminationType.REFUSED_MAINTENANCE_PAYMENT` (hoặc nới điều kiện `VIOLATION` để
  chấp nhận cờ đỏ). FE sẽ chuyển sang loại mới ngay khi BE có (hiện dùng `OTHER`).
- Trong `terminateActiveContract`: mọi phiếu `PENDING` của hợp đồng đó tự chuyển `TERMINATED` (kèm
  `refusal_reviewed_by/at` = người chấm dứt), để cờ tự vào tab "Đã xử lý" dù chấm dứt làm ở web hay mobile.

### 3.4 Thông báo cho admin
- Ngay khi phiếu bị đánh dấu công ty trả hộ (trong `diagnose()`, nhánh `companyAbsorbs`): thông báo admin
  `REFUSAL_FLAG_CREATED` ("Khách X (nhà Y, phòng Z) từ chối trả chi phí bảo trì — cờ đỏ").
- Cron **cuối tháng** (đề xuất 08:00 ngày cuối tháng, hoặc mùng 1): gửi mỗi admin 1 thông báo tổng hợp
  `REFUSAL_FLAG_DIGEST` — số khách còn `PENDING`, tổng tiền công ty đã chịu. Không gửi nếu = 0.
  Kèm event realtime để badge web tự cập nhật.

### 3.5 (Tuỳ chọn) API tổng hợp
`GET /api/v1/admin/refusal-flags?status=PENDING&propertyId=&month=YYYY-MM` — gom theo hợp đồng
(`tenantContractId`, khách, nhà/phòng, số phiếu, tổng tiền, danh sách phiếu). Hiện FE tự gom từ
`GET /maintenance?companyAbsorbedFault=true` nên **không bắt buộc**, nhưng cần nếu muốn badge số trên menu
mà không kéo cả danh sách.

## 4. Câu hỏi cần BE trả lời
1. `tenantContractId` có trả được trong `MaintenanceRequestResponse` không (đang phải ghép theo khách + nhà)?
2. Chấm dứt do cờ đỏ: thêm `ContractTerminationType` mới hay nới `VIOLATION`? (FE dùng `OTHER` tạm.)
3. `DEDUCT_AT_CHECKOUT` khi phiếu chưa `CLOSED` (chưa có `invoiceAmount`): chặn tới khi CLOSED, hay dùng số ước tính?
4. Tổng trừ vượt số cọc còn lại: phần dư xử lý sao (hiện `OutstandingDamage` có cơ chế này không)?
5. Đã `DISMISSED` rồi có cho admin đổi ý sang `DEDUCT_AT_CHECKOUT` không?
6. Khách có nhiều phiếu bị cờ: `DISMISSED`/`DEDUCT` áp cho từng phiếu hay cho cả hợp đồng một lần? (FE đang gửi lần lượt từng phiếu `PENDING`.)

## 5. Kiểm chứng khi BE ship
- Manager chọn "Khách từ chối trả" → phiếu có `refusalReviewStatus=PENDING`, admin nhận thông báo.
- `PUT .../refusal-review` `DISMISSED` không có `note` → 400; có `note` → phiếu ra khỏi tab "Cần xem xét".
- `DEDUCT_AT_CHECKOUT` → `getOutstandingDamages(tenantContractId)` trả đúng 1 bản ghi, số tiền = chi phí thợ; gọi lại không nhân đôi.
- Chấm dứt hợp đồng của khách bị cờ (không có hoá đơn quá hạn) → thành công; phiếu chuyển `TERMINATED`.
- Cron cuối tháng gửi đúng 1 thông báo/admin; không gửi khi không còn cờ `PENDING`.

## 6. Phía FE đã làm
- Web admin: trang **"Khách từ chối trả"** (`/admin/maintenance/refused`, menu Vận hành) — cờ đỏ theo khách, tab Cần xem xét / Đã xử lý,
  lọc tháng + tìm kiếm, chi tiết từng phiếu (lý do, thoả thuận, ảnh), **Chấm dứt HĐ** (chạy được ngay bằng `OTHER`);
  **Trừ cọc / Bỏ cờ** đã có UI, khoá chờ mục 3.1–3.2.
- Mobile manager: form chẩn đoán báo rõ "khách sẽ bị gắn cờ đỏ".
