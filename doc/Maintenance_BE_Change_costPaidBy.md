# Spec thay đổi Backend — Bảo trì: `costPaidBy` & tự động Room Status

> **⚠️ ĐÃ BỊ THAY THẾ — xem `Maintenance_Improved_Flow_BE_Spec.md`.**
> Toàn bộ nội dung file này (costPaidBy, hạch toán theo payer, auto room status,
> DB/migration) đã được gộp vào spec luồng cải thiện. Giữ lại chỉ để tham chiếu
> lịch sử; đừng dùng song song để tránh mâu thuẫn (file này nói "giữ 3 trạng thái",
> trong khi spec mới mở rộng state machine).
>
> ---
>
> Tài liệu cho đồng đội Backend (repo Spring riêng). Phần Frontend (mobile + web)
> đã làm sẵn để tương thích; chỉ cần BE bổ sung theo spec dưới đây.

---

## 1. `costPaidBy` — Ai chịu chi phí sửa chữa (ưu tiên cao)

### Lý do
Hiện `resolve` luôn tạo expense (tính vào chi phí nhà) bất kể ai trả. Khi **khách thuê
tự trả**, việc vẫn ghi expense làm **net profit per property bị sai** — vi phạm
requirement two-way cash flow / lợi nhuận ròng chính xác.

### Thay đổi API

**Endpoint:** `PUT /api/v1/maintenance/{id}/resolve`

**Request body — thêm field `costPaidBy`:**
```json
{
  "repairCost": 250000,
  "resolutionNote": "Đã thay chốt cửa mới",
  "costPaidBy": "HOST"     // "HOST" | "TENANT", optional, default "HOST"
}
```

**Response (`MaintenanceRequestResponse`) — thêm field trả về:**
```json
{
  "...": "...",
  "repairCost": 250000,
  "costPaidBy": "HOST"
}
```

### Logic nghiệp vụ khi resolve
- `costPaidBy = HOST` (mặc định): tạo Expense gắn với property như hiện tại → tính vào chi phí nhà.
- `costPaidBy = TENANT`: **KHÔNG tạo Expense** cho property (khách tự chi trả), để
  không làm giảm sai net profit. Vẫn lưu `repairCost` + `costPaidBy` trên bản ghi
  maintenance để báo cáo/đối soát.
- Giữ nguyên việc cập nhật equipment maintenance history trong cả 2 trường hợp.

### DB
- Thêm cột `cost_paid_by VARCHAR(10)` (enum HOST/TENANT) vào bảng maintenance_request.
- Migration: backfill các bản ghi cũ = `HOST`.

---

## 2. Tự động Room Status = MAINTENANCE (ưu tiên trung bình)

### Lý do
User story: *"automatically update room status (Available / Occupied / Maintenance)
based on events"*. Hiện room status không tự đổi theo luồng bảo trì.

### Logic đề xuất (xử lý ở BE khi đổi trạng thái maintenance)
- Khi maintenance request của 1 phòng chuyển sang `IN_PROGRESS`
  → set room status = `MAINTENANCE`.
- Khi request chuyển `RESOLVED` hoặc `CANCELLED` **và** phòng không còn request nào
  đang mở (PENDING/IN_PROGRESS) → revert room status về trạng thái trước đó
  (`AVAILABLE` nếu trống, `RENTED`/`OCCUPIED` nếu đang có hợp đồng active).
- Chỉ áp dụng cho property dạng nhiều phòng có room thực; với nhà nguyên căn xử lý
  tương đương ở cấp property/room đại diện.

### Lưu ý FE
- Mobile đã có endpoint `PATCH /api/v1/properties/{id}/rooms/{roomId}/status` nếu cần
  fallback set thủ công, nhưng **khuyến nghị xử lý ở BE** để đảm bảo nhất quán và
  không phụ thuộc quyền của manager trên mobile.

---

## 3. Đồng bộ trạng thái (đã khớp — chỉ ghi chú)
FE đã chuẩn hóa UI về đúng 3 bước BE: `PENDING → IN_PROGRESS → RESOLVED` (+ `CANCELLED`),
bỏ bước "ACCEPTED" ảo. BE giữ nguyên enum hiện tại, không cần đổi.
