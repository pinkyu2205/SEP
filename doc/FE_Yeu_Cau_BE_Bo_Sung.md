# FE → BE: API còn thiếu / cần xác nhận

> Cập nhật sau khi FE đã nối phần lớn host portal + notifications. Đây là danh sách
> **còn thiếu** hoặc **cần BE xác nhận**. Đánh dấu: 🔴 chặn tính năng · 🟠 nên có · 🟡 xác nhận.

---

## 1. 🔴 Doanh thu theo BĐS (6 tháng) — endpoint mới
Trang **Quản lý tài chính** có bảng *"Doanh thu theo Bất động sản"* (6 tháng/từng nhà) vẫn
chạy mock vì chưa có endpoint. `property-pnl` chỉ trả 1 tháng (lãi/lỗ ròng), không phải
chuỗi doanh thu 6 tháng.

**Đề xuất:**
```
GET /api/v1/host/finance/property-revenue?from=YYYY-MM&to=YYYY-MM
→ { months: ["2025-12", ...],
    rows: [ { propertyId, propertyName, monthly: [number, ...] } ] }
```
(monthly[] khớp thứ tự months[].)

---

## 2. 🟠 Xóa / lưu trữ thông báo (web host)
Trang **Thông báo** (web) có nút "Xóa" nhưng **chưa có endpoint** → hiện chỉ xóa cục bộ,
reload là hiện lại. Cần 1 trong 2:
```
DELETE /api/v1/host/notifications/{id}        // xóa hẳn
— hoặc —
PUT    /api/v1/host/notifications/{id}/archive // ẩn khỏi danh sách
```
Nếu BE không định làm, báo FE để **đổi nút "Xóa" thành "Đánh dấu đã đọc"**.

---

## 3. 🟠 Thống nhất enum loại thông báo (2 miền)
Hiện có 2 nhóm API thông báo dùng **bộ type khác nhau**:
- `/api/v1/notifications` (mobile tenant/manager): `new_bill`, `bill_overdue`,
  `maintenance_new`, `payment_success`, `contract_expiring`, … (chữ thường).
- `/api/v1/host/notifications` (web host): `APPROVAL_NEEDED`, `CONTRACT_EXPIRY`,
  `MASTER_LEASE_EXPIRY`, `UNPAID_INVOICE`, `MAINTENANCE_DELAY`, `OCCUPANCY_ALERT`,
  `LOSS_ALERT` (UPPER).

FE đang phải maintain 2 bảng mapping. **Đề nghị BE thống nhất 1 danh mục type chung**
(hoặc cung cấp tài liệu cố định 2 bộ này để FE khỏi đoán). Không gấp nhưng nên chốt sớm.

---

## 4. 🟡 Bản đồ — toạ độ trong Property DTO
FE sẽ thêm bản đồ vị trí trên mobile (và web đã có). Cần Property/Room DTO trả
**`latitude` / `longitude`** (hoặc địa chỉ chuẩn để geocode). Xác nhận field này có sẵn
trong response danh sách/chi tiết BĐS công khai (guest) không.

---

## 5. 🟡 Real-time thông báo cho web (tùy chọn)
Web không có push như mobile → badge/list chỉ cập nhật khi vào trang hoặc bấm đọc.
Nếu BE hỗ trợ **SSE/WebSocket** (vd `GET /api/v1/host/notifications/stream`) thì FE sẽ
cập nhật badge tức thời. Nếu không, FE dùng polling nhẹ — chỉ cần BE xác nhận hướng nào.

---

## 6. 🟡 Các mục đã trao đổi — xin xác nhận trạng thái
Để FE biết phần nào nối thẳng được:
- **property-pnl** trả đủ `propertyName`, `marginPct`, `totals`? (BE đã nói có — xác nhận lại).
- **Payment webhook** tự đổi invoice → `PAID` đã chạy thật chưa? (proposal student 1).
- **Auto reconcile** payment ↔ invoice + **monthly financial summary** (cron) — đã có chưa?
- **Auto nhắc thanh toán quá hạn** (cron, student 4) — đã có chưa? (FE chỉ nhận qua notification).
- **Master Lease** endpoints (list/detail/create/update/terminate) — FE chuẩn bị dựng UI,
  xác nhận shape `MasterLease` đúng như spec Host mục 4.

---

## 7. Tóm tắt độ ưu tiên
| Ưu tiên | Mục | Vì sao |
|---|---|---|
| 🔴 | #1 property-revenue | Bảng doanh thu 6 tháng đang mock |
| 🟠 | #2 xóa/lưu trữ noti · #3 thống nhất enum | Hoàn thiện notification |
| 🟡 | #4 toạ độ · #5 real-time · #6 xác nhận | Mở rộng / làm rõ |
