# BE BUG — Gửi Onboarding cho Host bị chặn vì nhà import THIẾU lịch cải tạo

> Ghi chú cho team BE. FE chỉ đọc repo SEPBE, không sửa BE.
> Ngày phát hiện: 2026-06-18 · Người báo: FE (Tien)
> Liên quan: [BE-import-excel-status-constraint.md](./BE-import-excel-status-constraint.md) (cùng luồng Nhập nhà hàng loạt)

## 1. Triệu chứng

Màn **Định giá & Phê duyệt** (`/admin/buildings/pricing-approval`):

- Nhà được tạo bằng **Nhập nhà hàng loạt** (import Excel), trạng thái = `RENOVATION_COMPLETED`
  ("Đã hoàn tất cải tạo", cột cải tạo hiển thị **Xong**).
- Bảng định giá tính toán **OK** (hiện đủ: tiền thuê inbound, chi phí thiết bị, chi phí cải tạo
  65.000.000đ, giá hoà vốn 11.677.966đ).
- Bấm **"Gửi Onboarding cho Host"** → BE trả lỗi, FE hiển thị banner đỏ:

```
Phải nhập lịch cải tạo (ngày bắt đầu/kết thúc)
```

→ Không gửi được Host, **kẹt cứng luồng onboarding** cho mọi nhà import có cải tạo.

## 2. Nguyên nhân

Endpoint **`POST /api/v1/properties/{id}/submit-to-host`** có ràng buộc validate:
**property phải có "lịch cải tạo" (ngày bắt đầu + ngày kết thúc thi công)** thì mới cho submit.

Nhưng luồng **import Excel** (`POST /api/v1/import/onboarding-excel`) khi tạo nhà chỉ set:

| Dữ liệu | Import có set? |
|---|---|
| Trạng thái `RENOVATION_COMPLETED` | ✅ |
| `renovationCompleted = true` | ✅ |
| `hasRenovation = true` | ✅ |
| Các **dòng chi phí cải tạo** (`renovation_lines`) | ✅ |
| **Lịch cải tạo: `startDate` / `endDate`** (ngày thi công) | ❌ **BỎ SÓT** |

→ Dữ liệu nhà mâu thuẫn: **đánh dấu cải tạo đã XONG nhưng không có ngày bắt đầu/kết thúc cải tạo**.
Khi submit, validate của `submit-to-host` thấy lịch trống → chặn.

Nói cách khác: validate "phải có lịch cải tạo" được thiết kế cho **luồng thủ công** (Admin tự đi qua
bước nhập lịch ở `PUT /properties/{id}/renovation-schedule`), nhưng **luồng import bỏ qua bước đó**,
nên hai luồng không khớp nhau.

## 3. Bằng chứng phía FE (FE không sai)

- Message **"Phải nhập lịch cải tạo (ngày bắt đầu/kết thúc)"** **không tồn tại trong source FE** —
  được trả thẳng từ BE qua `err.response.data.message`, FE chỉ render lại.
- FE gọi đúng endpoint: `propertyService.submitToHost(id)` → `POST /properties/{id}/submit-to-host`,
  không gửi kèm/thiếu field nào do FE.
- Cùng nhà đó, nếu Admin đi qua màn **Cấu hình khai thác → bước cải tạo → nhập "Lịch thi công"
  (start/end) → Lưu lịch** (`PUT /properties/{id}/renovation-schedule`, body `{ startDate, endDate }`)
  thì submit-to-host **PASS**. → Khẳng định nguyên nhân đúng là **thiếu lịch cải tạo từ import**.

## 4. Cách sửa BE (chọn 1)

### ✅ Khuyên dùng — Cách A: Bỏ ràng buộc lịch cải tạo khi cải tạo đã hoàn tất

Trong validate của `submit-to-host`: **chỉ bắt buộc có `startDate`/`endDate` lịch cải tạo khi nhà
đang còn cải tạo dở** (`renovationCompleted = false`). Nếu `renovationCompleted = true`
(điển hình là nhà import — cải tạo đã xong trước khi vào hệ thống), **bỏ qua** ràng buộc này.

Lý do: với nhà import, công trình cải tạo đã hoàn thành **trước** thời điểm nhập liệu, nên "ngày thi
công bắt đầu/kết thúc" không còn ý nghĩa nghiệp vụ — không nên bắt nhập.

### Cách B: Luồng import tự set lịch cải tạo

Trong service import, khi tạo nhà có cải tạo, set luôn `renovation schedule` (`startDate`/`endDate`).
Nguồn ngày có thể lấy từ:
- cột ngày trong sheet cải tạo của Excel (nếu bổ sung), hoặc
- mặc định = ngày import (cả start lẫn end), vì cải tạo đã xong.

> Nhược điểm Cách B: phải sửa template Excel hoặc bịa ngày mặc định → kém sạch hơn Cách A.

## 5. Tiêu chí chấp nhận (Acceptance Criteria)

- [ ] Nhà tạo bằng import Excel (status `RENOVATION_COMPLETED`, có dòng cải tạo, **không** có lịch
      cải tạo) → bấm **Gửi Onboarding cho Host** trên màn Định giá → **thành công**, không còn lỗi
      "Phải nhập lịch cải tạo".
- [ ] Nhà tạo thủ công đang cải tạo dở (`renovationCompleted = false`, chưa nhập lịch) → submit-to-host
      **vẫn báo lỗi** đòi nhập lịch như cũ (giữ nguyên hành vi đúng cho luồng thủ công).
- [ ] Không phát sinh lỗi mới ở `calculate-depreciation` / `submit-to-host` cho nhà thủ công đã đủ dữ liệu.

## 6. Phạm vi ảnh hưởng

- **Chặn toàn bộ** luồng "Nhập nhà hàng loạt → Định giá → Gửi Host": mọi nhà import có cải tạo đều
  không gửi được Host cho tới khi Admin thủ công vào nhập lịch cải tạo cho từng căn.
- Workaround tạm cho Admin (trong lúc chờ BE): Cấu hình khai thác → mở nhà → bước cải tạo →
  card **"Lịch thi công"** → nhập ngày bắt đầu/kết thúc → **Lưu lịch** → quay lại Định giá → Gửi Host.

## 7. Tham chiếu endpoint

| Mục đích | Method + Path |
|---|---|
| Gửi Host (đang lỗi) | `POST /api/v1/properties/{id}/submit-to-host` |
| Nhập lịch cải tạo (workaround) | `PUT /api/v1/properties/{id}/renovation-schedule` — body `{ "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }` |
| Tạo nhà hàng loạt (gốc thiếu dữ liệu) | `POST /api/v1/import/onboarding-excel` |
