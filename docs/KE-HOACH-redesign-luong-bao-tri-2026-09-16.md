# Đề xuất redesign luồng bảo trì (giai đoạn "manager tới hiện trường") — 16/09/2026

**Mục đích của file này:** trình bày hướng đi trước để BE + FE cùng thống nhất, **duyệt
xong mới bắt tay code** — tránh lặp lại bài học của đợt "khấu hao/báo giá" trước đó (làm
xong rồi phải viết hẳn 1 doc revert). File này CHƯA phải đặc tả kỹ thuật (payload/API
chi tiết) — nếu hướng đi được duyệt, FE sẽ soạn tiếp 1 file `BE-YEUCAU-*.md` cụ thể hoá
endpoint/field như mọi lần.

## 1. Vấn đề với luồng hiện tại

Luồng bảo trì hiện tại (đã triển khai, đang chạy) bắt manager **chọn nguyên nhân hỏng
NGAY LÚC VỪA TỚI hiện trường** — bấm "Duyệt" (hao mòn tự nhiên) hoặc "Báo lỗi do khách"
là 2 nút gọi 2 API khác nhau (`approve()` / `reject-fault()`), giá tiền sửa được nhập
*sau đó* ở bước khác.

Thực tế vận hành không như vậy: **thợ sửa mới là người xác định được nguyên nhân + báo
giá**, và có 2 khả năng:
- Thợ kiểm tra xong ngay tại chỗ → biết nguyên nhân + giá ngay lúc đó.
- Thợ phải mang thiết bị về kiểm tra thêm → **CHƯA biết nguyên nhân** lúc mang đi, chỉ
  biết được khi thợ gọi báo lại (có thể sớm hơn hoặc trễ hơn ngày dự kiến ban đầu).

Vậy nguyên nhân + giá tiền cần được tách ra khỏi thời điểm "manager vừa tới", và phải
xử lý được cả trường hợp biết muộn hơn dự kiến.

Ngoài ra, luồng hiện tại chưa có cách nào cho case: **lỗi do khách nhưng khách từ chối
trả** — hiện tại nếu xác định là lỗi khách thì hệ thống *luôn* bắt thu tiền khách trước
khi sửa/bàn giao, không có đường nào để công ty tạm ứng trả thay mà vẫn giữ lại dấu vết
để cuối tháng xem xét.

## 2. Sơ đồ luồng đề xuất

```
OPEN --quét QR "bắt đầu tiếp nhận sửa" (đổi tên từ "xác nhận có mặt")-->
  manager (đi cùng thợ) chọn 1 trong 2:

  ① SỬA ĐƯỢC NGAY ──────► mở màn "Chẩn đoán & báo giá" NGAY LÚC NÀY (mục 3)

  ② MANG ĐI KIỂM TRA THÊM ─► trạng thái mới "Đang kiểm tra" — CHƯA cần biết nguyên nhân,
                             chỉ ghi optional 1 ngày dự kiến trả máy (không ràng buộc gì)
                             ↓
                          bất kỳ lúc nào thợ gọi báo kết quả (sớm/đúng/trễ hơn dự kiến
                          đều được — không có gate theo ngày) → mở màn "Chẩn đoán & báo
                          giá" (CÙNG 1 màn dùng chung với nhánh ①)
```

Trạng thái "Đang kiểm tra" **tái dùng `REPAIR_SCHEDULED`** hiện có (đúng tinh thần mentor
"ghi sổ sách, hạn chế thêm status mới") — chỉ khác ở chỗ `faultResolutionPath`/nguyên
nhân đang để trống (chưa xác định), thay vì đã biết như cách dùng `REPAIR_SCHEDULED`
hiện tại.

## 3. Màn "Chẩn đoán & báo giá" — dùng chung cho cả 2 nhánh

Đây là màn hình duy nhất nhập nguyên nhân + tiền, thay cho việc bắt chọn nguyên nhân
ngay từ đầu như hiện tại:

1. **Giá thợ báo** (nhập tay, số tiền sửa chữa thật — độc lập với số "đền bù thay thiết
   bị" đang tự tính sẵn có, 2 khoản có thể cộng chung 1 hoá đơn).
2. **Nguyên nhân**: Hao mòn tự nhiên / Lỗi do khách.
3. Nếu **Lỗi do khách** → thêm lựa chọn: **Khách đồng ý trả** / **Khách từ chối trả**.
4. Nếu đang ở nhánh ② (mang về): thêm ô ngày hẹn giao máy chính thức (bắt buộc ở bước
   này vì giờ đã chắc chắn).

### Bảng xử lý theo lựa chọn

| Nguyên nhân | Khách trả? | Xử lý |
|---|---|---|
| Hao mòn tự nhiên | — | Công ty trả — như luồng hiện tại (`approve`), không có gate thanh toán |
| Lỗi do khách | Đồng ý | Như luồng hiện tại (`reject-fault` + `manager_repair`) — lập hoá đơn = giá thợ báo, **bắt buộc thanh toán trước khi sửa/bàn giao** |
| Lỗi do khách | **Từ chối trả** | **MỚI** — công ty tự trả thay, KHÔNG lập hoá đơn cho khách, KHÔNG gate thanh toán, nhưng phiếu bị đánh dấu cờ để tra cứu cuối tháng (mục 4) |

## 4. Đánh dấu "công ty trả hộ vì khách từ chối"

Đề xuất thêm 1 field boolean mới trên `MaintenanceRequest`, ví dụ `companyAbsorbedFault`
(tên cụ thể để 2 bên thống nhất) — set `true` khi manager chọn "Khách từ chối trả" ở màn
chẩn đoán. FE sẽ dùng field này để:
- Hiện badge cảnh báo trên ticket ("⚠️ Khách từ chối trả — công ty đã trả hộ").
- Thêm bộ lọc trong danh sách bảo trì hiện có, lọc theo tenant + khoảng thời gian, để
  cuối tháng manager tự rà soát quyết định huỷ hợp đồng — **không cần** dựng riêng 1 màn
  báo cáo mới.

## 5. Những gì cần BE xác nhận/bổ sung

| # | Việc | Ghi chú |
|---|---|---|
| 1 | Cho phép vào `REPAIR_SCHEDULED` ("Đang kiểm tra") **mà không cần chọn nguyên nhân** | Endpoint hiện tại (`approve`/`reject-fault`) đều bắt xác định nguyên nhân ngay lúc gọi — cần 1 đường vào mới, ví dụ tách 1 hành động "gửi đi kiểm tra" độc lập, không thuộc `approve` hay `reject-fault` |
| 2 | 1 hành động mới nhận kết quả chẩn đoán muộn: giá + nguyên nhân + (nếu lỗi khách) khách đồng ý/từ chối + ngày giao máy — áp dụng cho CẢ 2 nhánh ①② | Có thể là 1 endpoint mới dùng chung, hoặc mở rộng `approve`/`reject-fault` để gọi được ở trạng thái "Đang kiểm tra" — nhờ BE cho ý kiến cách nào hợp với kiến trúc hiện tại hơn |
| 3 | Đường "lỗi do khách nhưng công ty trả thay" — bỏ qua hẳn việc lập hoá đơn/gate thanh toán, đi thẳng vào sửa như trường hợp công ty trả | Hiện `TENANT_FAULT` + `manager_repair` luôn bắt buộc thu tiền khách, chưa có nhánh này |
| 4 | Field cờ đánh dấu (mục 4), trả về trong `GET /{id}` và trong danh sách ticket để FE lọc | Tên field, ai/khi nào được phép bỏ tick lại (nếu có) nhờ BE góp ý |

## 6. Câu hỏi mở cần BE trả lời trước khi FE soạn đặc tả kỹ thuật

- Muốn gộp bước 1 và 2 ở mục 5 thành **1 endpoint duy nhất** linh hoạt theo trạng thái
  hiện tại của phiếu, hay tách riêng như đề xuất? BE có ràng buộc kiến trúc nào cần FE
  biết trước không?
- Field `companyAbsorbedFault` có cần lưu kèm `note`/lý do (vd manager gõ lại tóm tắt
  cuộc thoả thuận ngoài app) hay chỉ cần boolean đơn thuần?
- Có cần lưu thêm mốc thời gian "ngày dự kiến trả máy" ban đầu (thông tin tham khảo,
  không ràng buộc gì) để sau này đối chiếu thợ trả sớm/trễ bao lâu so với dự kiến không,
  hay bỏ qua vì không có giá trị nghiệp vụ?

## 7. Việc FE đã làm ngay (không phụ thuộc BE, không nằm trong phạm vi xin duyệt)

Đã fix xong: tenant bấm "chụp hình/quay video" để làm bằng chứng báo lỗi trước đây chỉ
chụp được ảnh trên Android, không quay được video. Nguyên nhân: `expo-image-picker`
trên Android không hỗ trợ mở camera với cả 2 loại ảnh+video cùng lúc (chỉ iOS làm được)
— đã tách thành 2 nút "Chụp ảnh" / "Quay video" riêng ở mọi màn có picker này (tenant tạo
phiếu, tenant nộp ảnh tự sửa, manager). Không liên quan gì tới BE, không cần duyệt.
