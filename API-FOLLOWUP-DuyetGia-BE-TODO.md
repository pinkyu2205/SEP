# Follow-up cho Backend — Duyệt giá (sau Update Log)

> Cảm ơn team BE đã hoàn tất phần lớn. FE đã đối chiếu với code đang gọi: **đa số khớp**. Còn **1 việc bắt buộc** + **2 việc cần xác nhận** để chạy end-to-end. File này chỉ liệt kê phần còn lại — các mục đã xong không nhắc lại.

---

## 🔴 1. BẮT BUỘC — `GET /api/v1/tenant-contracts/managed` phải bao gồm `APPROVED_AWAITING_DEPOSIT`

Trong update log, endpoint `managed` đang mô tả chỉ trả HĐ *"đang chờ duyệt hoặc bị reject"*. **Thiếu `APPROVED_AWAITING_DEPOSIT`** — đây là nhóm quan trọng nhất với manager.

**Vì sao bắt buộc:** Sau khi Host **Approve**, HĐ chuyển `APPROVED_AWAITING_DEPOSIT`. Manager phải mở lại HĐ này để **thu cọc + OTP**. FE lấy HĐ để xử lý **từ chính endpoint `managed`**. Nếu list không chứa nhóm đã duyệt → manager **không thể tiếp tục thu cọc** → luồng đứng.

**Yêu cầu:** Khi gọi `GET /api/v1/tenant-contracts/managed` **không kèm `status`**, trả về HĐ của manager (theo JWT) có `priceApprovalStatus` ∈:
```
PENDING_PRICE_APPROVAL      (chờ Host duyệt)
APPROVED_AWAITING_DEPOSIT   (đã duyệt, chờ thu cọc)  ← ĐANG THIẾU
PRICE_REJECTED              (bị từ chối)
```
Khi có kèm `?status=<giá trị>` thì lọc đúng trạng thái đó.

---

## 🟡 2. CẦN XÁC NHẬN — Response của `managed` là **JSON array thuần**, KHÔNG bọc `Page`

FE đọc thẳng body như một mảng:
```jsonc
// ĐÚNG  (FE mong đợi):
[ { "id": 1, ... }, { "id": 2, ... } ]

// SAI   (FE sẽ vỡ nếu trả kiểu này):
{ "content": [ ... ], "totalElements": 2, ... }
```

> Phân biệt với `/host/contracts`: chỗ đó FE **mong đợi `Page`** (đọc `.content`). Còn `/tenant-contracts/managed` thì **mong đợi array**. Hai endpoint khác nhau.
>
> (FE đã thêm lớp phòng hờ chấp nhận cả 2 dạng, nhưng vẫn nên trả array cho đúng contract.)

Vui lòng confirm giúp endpoint `managed` đang trả array hay Page.

---

## 🟡 3. CẦN XÁC NHẬN — `HostContractDto` có `rentAmount`

Trang Host duyệt trên web hiển thị **giá đề xuất** để Host quyết định. FE đọc field `rentAmount` trong mỗi phần tử `content` của `GET /host/contracts`.

- [ ] Confirm `HostContractDto.rentAmount` có giá trị (giá đề xuất của HĐ chờ duyệt).
- [ ] (Tùy chọn) `HostContractDto.equipmentSnapshot` — nếu có sẵn, FE sẽ bổ sung hiển thị danh sách thiết bị đề xuất cho Host xem khi duyệt. Chưa có cũng không chặn.

---

## ✅ Checklist gọn cho BE

- [ ] **(Bắt buộc)** `managed` include `APPROVED_AWAITING_DEPOSIT` (cả 3 trạng thái khi không lọc).
- [ ] **(Confirm)** `managed` trả **array** (không phải `Page`).
- [ ] **(Confirm)** `HostContractDto.rentAmount` có giá trị; (tùy chọn) thêm `equipmentSnapshot`.

---

## Test nhanh để chốt (Case 2 đầy đủ)

1. Manager đón khách → "Gửi Host duyệt giá" → HĐ `PENDING_PRICE_APPROVAL`.
2. Gọi `GET /tenant-contracts/managed` → thấy HĐ này.
3. Web Host `/host/contracts?status=PENDING` → thấy HĐ (kèm `rentAmount`) → **Approve**.
4. Gọi lại `GET /tenant-contracts/managed` → **vẫn phải thấy HĐ** (giờ là `APPROVED_AWAITING_DEPOSIT`). ← đây là bước kiểm chứng mục 1.
5. Manager nhận push → mở → `deposit-payment` → `confirm {otp}` → HĐ `ACTIVE`.
6. Làm lại với **Reject** → HĐ `PRICE_REJECTED` + `priceRejectReason` → vẫn thấy trong `managed`.
