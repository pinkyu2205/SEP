# Handoff BE — 5 chỗ "cụt luồng" trong quy trình bảo trì + hướng xử lý đề xuất

**Ngày:** 2026-07-30
**Bối cảnh:** Audit lại toàn bộ state machine bảo trì (`MaintenanceServiceImpl.java`, status hiện tại: `PENDING → APPROVED → WAITING_TENANT_CONFIRM → CLOSED`, nhánh phụ `REJECTED`, `CANCELLED`). Phát hiện 3 chỗ khiến ticket **kẹt vĩnh viễn hoặc dữ liệu sai không có đường sửa**, và 2 chỗ thiết kế thiếu chính sách. Đây là spec đề xuất hướng sửa cho cả 5 — FE không đổi gì cho tới khi BE có API mới (trừ mục 5 cần FE thêm 1 ô nhập).

---

## 1. Khiếu nại chi phí (DISPUTED) — ticket CLOSED xong là hết đường xử lý

**Hiện trạng:** `confirm()` khi tenant bấm `agreeToCharge=false` → set `costAgreementStatus=DISPUTED`, gửi 1 notification cho manager, rồi **đóng CLOSED ngay** (`MaintenanceServiceImpl.java:329-345`). Toàn bộ 8 endpoint của module (`approve/complete/confirm/reject/review-reject/cancel`) đều `requireStatus(...)` một trạng thái cụ thể (không phải CLOSED) → **không endpoint nào chạm được ticket đã CLOSED nữa**. `ManagerPendingChargeController` cũng chỉ list/issue-invoice charge **có sẵn**, không có API tạo/sửa charge từ 1 ticket đã đóng. Kết quả: khách khiếu nại xong là xong, manager không có cách nào trong app để thương lượng lại số tiền hoặc ép thu — phải xử lý ngoài hệ thống, tiền không có hoá đơn.

**Đề xuất — API mới, không phụ thuộc `MaintenanceStatus`:**

```
PUT /api/v1/maintenance/{id}/resolve-cost
Role: MANAGER, ADMIN
```

Điều kiện duy nhất: `costAgreementStatus` đang là `DISPUTED` hoặc `PENDING` (không check `status` ticket — áp dụng được cả khi đã CLOSED).

Request body:
```json
{
  "action": "CHARGE",       // "CHARGE" | "WAIVE"
  "repairCost": 3500000,    // optional — nếu gửi thì GHI ĐÈ số tiền cũ (đã thương lượng lại với khách)
  "note": "Khách đồng ý qua điện thoại, giảm từ 4tr xuống 3.5tr"
}
```

Xử lý:
- `action=CHARGE`: nếu có `repairCost` mới thì set vào `req.repairCost`; set `costAgreementStatus=AGREED`; gọi `issueMaintenanceCharge(req)` y hệt path `agreeToCharge=true` hiện tại (tạo `TenantPendingCharge` + phát hoá đơn, dùng `resolveActiveContract` — xem mục 3 để không bị vướng "hết HĐ").
- `action=WAIVE`: set `costAgreementStatus=WAIVED` (**thêm giá trị mới** vào enum `CostAgreementStatus` — khác `NOT_APPLICABLE` để phân biệt rõ trong báo cáo: `NOT_APPLICABLE` = "chưa từng phát sinh chi phí", `WAIVED` = "có chi phí nhưng host quyết định bỏ qua"). Ghi `note` vào `costDisputeReason`.
- Cả 2 nhánh đều ghi 1 dòng `MaintenanceTimeline` mới (note kèm tên manager xử lý) để có lịch sử — quan trọng vì ticket đã CLOSED từ trước, đây là hành động "hậu kỳ".

Response: `MaintenanceRequestResponse` như các endpoint khác (đủ field `costAgreementStatus`, `repairCost`, `issuedInvoice` nếu action=CHARGE).

Mã lỗi:
- 404 nếu ticket không tồn tại.
- 400 nếu `costAgreementStatus` hiện tại không phải `PENDING`/`DISPUTED` (đã xử lý rồi hoặc chưa từng có chi phí) — message: `"Không có khoản chi phí nào đang chờ xử lý cho ticket này"`.
- 400 nếu `action=CHARGE` mà `repairCost` gửi kèm ≤ 0.

## 2. Auto-confirm giữ `PENDING` mãi mãi khi khách im lặng

**Hiện trạng:** cron tự đóng ticket sau 3 ngày không phản hồi (`autoConfirmOverdue`, `MaintenanceServiceImpl.java:464-476`), cố tình **không** tự set AGREED khi đang PENDING (đúng — tránh ép khách), nhưng sau đó cũng bị kẹt y hệt mục 1 (ticket CLOSED, không endpoint nào xử lý được `costAgreementStatus` nữa).

**Đề xuất:** dùng chung API `resolve-cost` ở mục 1 — vì điều kiện chỉ check `costAgreementStatus`, không check nguồn gốc (khách chủ động dispute hay do auto-confirm), nên không cần thêm gì riêng.

Bổ sung thêm 1 endpoint liệt kê để manager biết còn khoản nào đang treo (tránh phải nhớ):

```
GET /api/v1/maintenance/pending-cost-resolution
Role: MANAGER, ADMIN
```
Trả về danh sách ticket có `costAgreementStatus IN (PENDING, DISPUTED)` bất kể `status` — filter theo property/room như `getRequests` hiện có.

## 3. Hợp đồng kết thúc giữa chừng lúc khách đang confirm bồi thường → `confirm()` throw, ticket kẹt cứng

**Hiện trạng:** `issueMaintenanceCharge()` → `resolveActiveContract()` (`MaintenanceServiceImpl.java:548-580`) **bắt buộc** tìm được 1 `TenantContract` đang **ACTIVE** khớp phòng/tenant. Ticket hiện **không lưu contractId lúc tạo** — mọi lần cần hoá đơn đều tra lại "HĐ đang active của phòng/tenant này" tại **thời điểm confirm**, không phải thời điểm tạo ticket. Kịch bản lỗi: khách trả phòng / HĐ hết hạn đúng lúc ticket đang WAITING_TENANT_CONFIRM chờ họ đồng ý bồi thường → lúc khách bấm "Đồng ý trả tiền", `resolveActiveContract` không tìm thấy HĐ ACTIVE nào nữa → `BusinessException`, `@Transactional` rollback toàn bộ, ticket **không** chuyển CLOSED. Route thoát duy nhất còn lại là manager `cancel()` — sai ngữ nghĩa (ticket đã sửa xong, khách đã đồng ý trả, không phải "hủy yêu cầu"), báo cáo bảo trì ghi nhận sai.

**Đề xuất — gắn ticket vào đúng 1 HĐ ngay lúc tạo, không tra lại theo status:**

1. Migration: thêm cột `tenant_contract_id BIGINT NULL REFERENCES tenant_contracts(id)` vào bảng `maintenance_requests` + field `TenantContract tenantContract` (`@ManyToOne`, `@JoinColumn(name = "tenant_contract_id")`) vào entity `MaintenanceRequest`. Nullable để tương thích ticket cũ trước migration.
2. `createRequest()`: đổi `assertTenantOwnsActiveUnit`/`assertTenantOwnsActiveWholeHouse` từ trả `void`/`boolean` sang **trả luôn `TenantContract`** tìm được (logic match hiện tại giữ nguyên, chỉ đổi kiểu trả về) → set vào `req.tenantContract` khi build ticket.
3. `resolveActiveContract()` đổi thứ tự ưu tiên:
   - Nếu `req.getTenantContract() != null` → dùng thẳng, **không check status** (kể cả đã TERMINATED/EXPIRED, đây vẫn là đúng HĐ phát sinh chi phí — `TenantPendingChargeService.createAndIssueMaintenanceCharge` vốn không quan tâm status của contract truyền vào).
   - Fallback: nếu `null` (ticket cũ trước migration) → giữ nguyên logic tìm theo ACTIVE như hiện tại.

**Phạm vi ảnh hưởng:** chỉ đổi cách xác định contract lúc phát hoá đơn — không đổi hành vi các bước khác (approve/complete/confirm/reject vẫn y nguyên).

## 4. Phòng có 2 ticket cùng lúc — đóng 1 cái vô tình xoá cờ MAINTENANCE của cái kia

**Hiện trạng:** `restoreRoomStatus()` (`MaintenanceServiceImpl.java:644-651`) chỉ check "phòng có HĐ ACTIVE không" để set `RENTED`/`AVAILABLE`, không check còn `MaintenanceRequest` nào khác của **cùng phòng** đang mở. Ví dụ phòng có 2 sự cố song song (hư điều hòa + hư ống nước) → đóng ticket điều hòa sẽ xoá luôn cờ MAINTENANCE dù ticket ống nước vẫn đang sửa.

**Đề xuất:**
```java
private void restoreRoomStatus(MaintenanceRequest req) {
    if (req.getRoom() == null) return;
    boolean stillHasOpenTicket = repository.existsByRoomIdAndStatusNotInAndIdNotAndDeletedFalse(
        req.getRoom().getId(),
        List.of(MaintenanceStatus.CLOSED, MaintenanceStatus.CANCELLED),
        req.getId());
    if (stillHasOpenTicket) return; // còn ticket khác đang xử lý — giữ nguyên MAINTENANCE
    boolean hasActiveContract = tenantContractRepository.existsByRoomIdAndStatus(
        req.getRoom().getId(), ContractStatus.ACTIVE);
    req.getRoom().setStatus(hasActiveContract ? RoomStatus.RENTED : RoomStatus.AVAILABLE);
    roomRepository.save(req.getRoom());
}
```
Cần thêm 1 method repository: `existsByRoomIdAndStatusNotInAndIdNotAndDeletedFalse(Long roomId, List<MaintenanceStatus> excludedStatuses, Long excludedId)`.

## 5. Vòng lặp REJECTED ⇄ WAITING_TENANT_CONFIRM không giới hạn, không escalate

**Hiện trạng:** nếu manager cứ chọn "không đồng ý reopen" (`reviewReject(approve=false)`) và tenant cứ tiếp tục `reject`, ticket bounce qua lại vô thời hạn. `reopenCount` chỉ để đếm, không có ngưỡng nào kích hoạt hành động khác. Không có bên thứ 3 (Host/Admin) được biết để can thiệp nếu 2 bên bất đồng kéo dài.

**Đề xuất (không chặn cứng flow, chỉ tăng minh bạch):**
1. `MaintenanceApproveRequest` (dùng chung cho `review-reject`) thêm field `note` (optional hiện tại → **bắt buộc khi `approve=false`**, tức "không đồng ý reopen"): manager phải giải thích lý do giữ nguyên kết quả sửa, ghi vào timeline thay vì note cứng "Manager không đồng ý reopen...".
2. Khi `reopenCount >= 2` tại thời điểm `reviewReject`, gửi thêm 1 notification cho **Host** của property (không chỉ tenant/manager như hiện tại) kèm nội dung "Ticket #{id} đã bị từ chối {reopenCount} lần, cần xem xét" — dùng lại `notifyPropertyManager`-style helper, đổi target sang `property.getOwnerId()`/Host tương ứng (tuỳ field nào đang map "chủ sở hữu" trên `Property`, xem cùng đường host hiện dùng cho luồng duyệt giá `PENDING_PRICE_APPROVAL`).
3. Không cần thêm trạng thái mới hay chặn transition — chỉ là thêm dữ liệu bắt buộc + 1 notification, rủi ro thấp.

**FE cần làm khi BE xong mục này:** `TicketDetailScreen.tsx` màn xử lý REJECTED (reviewReject) thêm ô nhập lý do bắt buộc khi bấm "Không đồng ý / Giữ nguyên kết quả".

---

## Tổng hợp thay đổi DB/enum cần migrate

| # | Thay đổi | Bảng/Enum |
|---|---|---|
| 1 | Thêm giá trị `WAIVED` | `CostAgreementStatus` |
| 3 | Thêm cột `tenant_contract_id BIGINT NULL` | `maintenance_requests` |
| 5 | Field `note` bắt buộc có điều kiện | DTO `MaintenanceApproveRequest` (không đổi DB) |

## Checklist test khi BE làm xong

- [ ] `resolve-cost` action=CHARGE trên ticket đang DISPUTED → tạo được pending charge + invoice, `costAgreementStatus` → AGREED.
- [ ] `resolve-cost` action=WAIVE → `costAgreementStatus` → WAIVED, không tạo invoice.
- [ ] `resolve-cost` gọi trên ticket có `costAgreementStatus=NOT_APPLICABLE` hoặc `AGREED` → 400.
- [ ] Tạo ticket mới, kiểm tra `tenant_contract_id` được set đúng ngay lúc tạo.
- [ ] Kịch bản: tạo ticket → complete (costPaidBy=TENANT) → **thanh lý HĐ** → tenant confirm agreeToCharge=true → vẫn phát hoá đơn thành công (không throw).
- [ ] Phòng có 2 ticket mở cùng lúc → đóng 1 ticket → room status vẫn là MAINTENANCE (không bị trả về RENTED/AVAILABLE).
- [ ] `reviewReject(approve=false)` thiếu `note` → 400. Có `note` → lưu đúng vào timeline. `reopenCount>=2` → Host nhận được notification.

## Phạm vi ảnh hưởng chung

Không đổi hành vi các luồng đang chạy tốt (approve/complete/confirm khi cost NOT_APPLICABLE hoặc AGREED bình thường, cancel, auto-confirm khi không có chi phí). Chỉ thêm API mới (`resolve-cost`, `pending-cost-resolution`) và vá 2 chỗ dữ liệu sai (contract, room status) — an toàn để làm độc lập, không phụ thuộc thứ tự giữa 5 mục.
