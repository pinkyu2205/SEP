# BE Bug — enum `WAIVED` thiếu trong DB check constraint, `resolve-cost` action=WAIVE chết 500

**Ngày:** 2026-07-30
**Liên quan:** commit `80c02d3` (implement `BE-HANDOFF-maintenance-flow-deadends-2026-07-30.md`)

## Hiện tượng

`PUT /api/v1/maintenance/{id}/resolve-cost` với `{"action":"WAIVE"}` trả **500**:

```
ERROR: new row for relation "maintenance_requests" violates check constraint
"maintenance_requests_cost_agreement_status_check"
```

## Nguyên nhân

Commit thêm giá trị `WAIVED` vào enum Java `CostAgreementStatus`, nhưng check constraint trong DB (do Hibernate sinh từ trước) vẫn chỉ cho phép 4 giá trị cũ (`NOT_APPLICABLE`, `PENDING`, `AGREED`, `DISPUTED`). Hibernate `ddl-auto: update` **không bao giờ tự cập nhật check constraint có sẵn** — đây là lần thứ 3 dính đúng pattern này (trước đó: thiếu `TENANT_ACTIVATION` trong `otp_purpose_check`, thiếu `RENTED` trong `properties_status_check`).

## Fix đề xuất

Thêm vào `DatabaseSchemaMigration` (file này đã có sẵn pattern `ensurePropertyStatusConstraint()` để copy):

```java
private void ensureCostAgreementStatusConstraint() {
    jdbcTemplate.execute("""
        ALTER TABLE maintenance_requests DROP CONSTRAINT IF EXISTS maintenance_requests_cost_agreement_status_check;
        ALTER TABLE maintenance_requests ADD CONSTRAINT maintenance_requests_cost_agreement_status_check
          CHECK (cost_agreement_status::text = ANY (ARRAY[
            'NOT_APPLICABLE','PENDING','AGREED','DISPUTED','WAIVED']::text[]))
        """);
}
```
(gọi trong `run(...)` cùng chỗ các ensure khác — điều chỉnh theo helper thật của file.)

**Đề xuất dài hạn:** mỗi lần thêm giá trị enum mới cho field có `@Enumerated(EnumType.STRING)` + DB có check constraint, bắt buộc kèm 1 dòng migration trong `DatabaseSchemaMigration` — nên grep `_check` trong schema trước khi merge.

## Trạng thái DB local của FE

Mình đã tự `ALTER TABLE` nới constraint ở DB local (thêm `WAIVED`) để test tiếp — **các máy/môi trường khác deploy code này sẽ vẫn dính 500** cho tới khi BE thêm migration trên.

## Đã test lại sau khi vá (đều PASS)

- WAIVE trên ticket CANCELLED có cost PENDING → 200, `costAgreementStatus=WAIVED`, timeline ghi "Manager miễn thu...".
- Gọi lại lần 2 → 422 "Không có khoản chi phí nào đang chờ xử lý".
- `GET /pending-cost-resolution` → hết ticket treo (trả `[]`).
- Action sai (`FOO`) → 422 đúng message.

## Ghi chú thêm (không chặn, nhưng nên biết)

`notifyPropertyHost(...)` (escalation khi `reopenCount >= 2`) đang gửi `HostNotification` tới `property.getManagedBy()` — field này khắp codebase đang dùng làm **manager** (xem `notifyPropertyManager`, `HostPortalServiceImpl.approveContract` đặt tên biến `manager`). Host portal chỉ hiện notification của đúng `userId` đăng nhập (role OWNER), nên notification escalation này sẽ nằm trong hộp của manager — người không bao giờ mở host portal → **Host thực tế không nhận được**. Gốc rễ: entity `Property` hiện không có field nào trỏ tới Owner/Host (chỉ có `createdBy Long`, `operationManagerId`, `managedBy`), nên "Host của property X" chưa resolve được từ data model. Cần team BE quyết: thêm field `owner_id` cho Property, hoặc tạm chấp nhận gửi cho manager và đổi type notification.
