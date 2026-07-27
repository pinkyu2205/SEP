# Handoff BE — OCR chỉ số đồng hồ & phân loại yêu cầu bảo trì

**Ngày:** 2026-07-27
**Bối cảnh:** feedback từ buổi demo với mentor. Đã tự đọc code BE (`Sub-leasing-managemant-system`) trước khi hỏi — 2 mục dưới đây là chỗ **cần đội quyết định hướng**, không phải bug.

---

## 1. OCR chỉ số điện/nước — quy tắc chọn số hiện tại KHÔNG phải "số rõ nhất"

**Code:** `OcrServiceImpl.java` (`readMeter()` → `pickBest()`).

Hiện tại BE gọi OCR.space (`OCREngine=2`), lấy toàn bộ chuỗi số xuất hiện trong ảnh bằng regex, rồi chọn **chuỗi số dài nhất**:

```java
/** Chọn cụm số dài nhất làm gợi ý (chỉ số đồng hồ thường là số dài nhất trong ảnh). */
private String pickBest(List<String> numbers) {
    return numbers.stream()
            .max((a, b) -> Integer.compare(a.replace(".", "").length(), b.replace(".", "").length()))
            .orElse("");
}
```

Đây là heuristic "số dài nhất", **không phải** "số rõ nhất / độ tin cậy cao nhất" như feedback demo yêu cầu. Lý do: OCR.space (gói đang dùng, `OCREngine=2`) không trả về điểm tin cậy (confidence score) theo từng ký tự/cụm số — API chỉ trả text thuần, nên hiện tại không có cơ sở để chọn theo "độ rõ".

**Cần đội quyết định 1 trong 2 hướng:**

| Hướng | Ưu điểm | Nhược điểm |
|---|---|---|
| A. Giữ nguyên heuristic "số dài nhất" | Không tốn thêm chi phí, không đổi code | Không đúng nghĩa "chọn số rõ nhất" — sai nếu ảnh có số khác dài hơn hoặc mờ mà tình cờ dài nhất |
| B. Đổi sang OCR provider có confidence score (vd Google Cloud Vision `TEXT_DETECTION`, trả confidence từng từ) | Chọn được đúng theo độ rõ, cải thiện chất lượng đọc | Tốn phí (Google Vision tính theo request, không free như OCR.space đang dùng), cần thêm work đổi tích hợp |

**Đề xuất tạm thời (không cần đổi provider ngay):** vẫn giữ OCR.space, nhưng cải thiện logic chọn số bằng cách kết hợp thêm ngữ cảnh — vd loại bỏ số trùng với `serial number`/mã thiết bị hay xuất hiện trên đồng hồ, ưu tiên số nằm giữa khung ảnh (nơi FE hướng dẫn manager canh khung số). Cần biết ảnh mẫu thực tế mới tinh chỉnh được — đề nghị đội gửi vài ảnh đồng hồ thật (kèm case OCR đọc sai) để thử.

---

## 2. Phân loại "bảo trì" vs "báo sửa" — chưa có field tương ứng

**Code:** `enums/MaintenanceCategory.java`.

Enum hiện tại là **hạng mục thiết bị/khu vực** (APPLIANCE, FURNITURE, STRUCTURAL, ELECTRICAL, PLUMBING, OTHER) — category do **manager gán lúc duyệt yêu cầu**, tenant không chọn khi tạo. Ví dụ feedback "sàn nhà bong tróc" và "cửa sổ hư" đều rơi vào `STRUCTURAL` — enum này không phân biệt "bảo trì định kỳ" (preventive) vs "báo sửa sự cố" (corrective/reactive), vì đó là 2 trục phân loại khác nhau (loại hạng mục vs loại tính chất công việc).

**Câu hỏi cho đội:** feedback muốn thêm 1 trục phân loại MỚI (vd `MaintenanceType`: `PREVENTIVE` / `CORRECTIVE`) tách biệt với `MaintenanceCategory` hiện có, hay chỉ cần map lại ý nghĩa của category hiện tại (vd coi `STRUCTURAL` = "bảo trì kết cấu" chung cho cả 2 case)? Nếu cần trục mới — đây là thay đổi model (thêm cột + enum + migration + FE hiển thị), cần lên kế hoạch riêng, không phải sửa nhỏ.

---

## Không cần hỏi BE — đã xác nhận là gap phía FE (mobile-app), tự xử lý

*(Ghi lại ở đây để đội BE biết, không cần hành động gì)*

**"Tenant chưa xem được hợp đồng đã ký":** BE **đã có sẵn đầy đủ** endpoint tạo + lưu file hợp đồng (`POST /tenant-contracts/{id}/draft-document` render PDF, FE upload Cloudinary rồi `PUT` lại `draftContractFileUrl`; `GET /{id}/document/download` cho tenant tải). Vấn đề là **mobile-app (luồng đón khách của manager) chưa từng gọi các API này** — chỉ web (`DraftContractImportModal.tsx`) có gọi. Đây là việc FE tự thêm bước gọi API đúng lúc trong luồng đón khách mobile (khi hợp đồng còn ở trạng thái DRAFT — API `draft-document` chỉ chạy được lúc đó), không cần BE làm gì thêm.
