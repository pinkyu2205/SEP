# [FE→BE] Luồng "Tạo hợp đồng nháp" — cả 3 gap ĐÃ ĐƯỢC BE FIX ✅

> ✅ **BE ĐÃ FIX CẢ 3 GAP — xác nhận qua đọc code 09/07/2026 (tối)** (BE không đang chạy lúc verify nên chưa test sống lại, nhưng logic đọc thấy đúng và nhất quán 100% với doc `Hợp đồng thuê căn hộ — Hướng dẫn triển khai FE` mới nhất):
> 1. **Notification khi gán quản lý** — `notifyAssignedManager()` (`TenantOnboardingServiceImpl.java:708-739`) đã có, bắn cả `Notification` (type `TENANT_ONBOARDING`) lẫn push, nội dung đúng convention `"...({#contractId})"`. Được gọi ở cả 3 chỗ: tạo draft có `assignedManagerId` (dòng 185), `updateDraftContract` khi **manager thực sự đổi** (dòng 495-496, có dedup thông minh — không bắn trùng nếu gán lại đúng người cũ), và `assignManager` (dòng 523).
> 2. **`dateOfBirth` khách chính** — đã có ở cả `OnboardTenantRequest` VÀ `UpdateDraftContractRequest`, lưu vào `draftTenantDob`/`Tenant.dateOfBirth`, có placeholder `${tenantDob}` trong template (theo doc mục 8).
> 3. **`UpdateDraftContractRequest.assignedManagerId`** — nay được áp dụng đúng (dòng 469-477), kèm logic chỉ notify khi manager thật sự thay đổi.
>
> **FE đã cập nhật theo:** bỏ comment "BE chưa nhận dateOfBirth" (field giờ dùng thật); thêm `documentUrl?: string` vào `TenantContractResponse` type (BE map = `draftContractFileUrl` hoặc fallback `documentUrl` cũ — xem `resolveContractFileUrl()`); `DraftOnboardingList.tsx` link "File HĐ" giờ ưu tiên `draftContractFileUrl || documentUrl`. `npx tsc --noEmit` sạch.
>
> _Nội dung gốc bên dưới giữ làm tài liệu tham chiếu (đã fix hết, không cần đọc lại trừ khi cần lịch sử)._

<details>
<summary>Nội dung gốc (đã fix — click để xem lịch sử)</summary>

## 1. Gán quản lý (assignManager / tạo draft có assignedManagerId) — CHƯA gửi thông báo — ĐÃ FIX

## 2. Ngày sinh khách chính (`dateOfBirth`) — DTO chưa có field — ĐÃ FIX

## 3. `UpdateDraftContractRequest.assignedManagerId` — field chết, không được dùng — ĐÃ FIX

</details>

## 4. Ghi chú nhỏ còn tồn (không chặn, chỉ để BE biết)

- `POST /draft-document` khi gọi trên HĐ không phải DRAFT trả **422** (`BusinessException`), không phải **400** như bảng lỗi trong doc — FE đã code theo status thực tế (422), không phải theo doc. Không cần sửa gì, chỉ note lại cho đỡ lệch tài liệu.
- Test tay thấy 1 lỗi cosmetic nhỏ trong `ApartmentDraftTemplateBuilder`: dòng "Ông/bà: {tên}" đôi khi còn sót vài dấu chấm thừa phía sau tên (không ảnh hưởng dữ liệu, chỉ lệch hình thức khi in). Không chặn — không cần ưu tiên.

## 5. Bối cảnh FE đã làm xong (không cần chờ BE) — trang "Tạo hợp đồng nháp"

- **Format tiền VNĐ** (dấu chấm nghìn, căn phải) cho ô Giá thuê / Tiền cọc — state gốc vẫn giữ số thuần để tương thích payload.
- **Validate ngày**: "Ngày dự kiến đón khách" chỉ chọn được từ hôm nay trở đi (`min`); "Ngày kết thúc" giới hạn tối đa 5 năm kể từ hôm nay (`max`) — khớp đúng Rule 4 BE (`endDate.isAfter(today.plusYears(5))` → chặn).
- **Bỏ dropdown chọn quản lý tay** — giờ **tự động** lấy `operationManagerId` có sẵn của property đã chọn và gọi `assignManager` ngay sau khi tạo draft thành công (áp dụng cho cả 2 tab Nhập tay lẫn Upload file). Property chưa có quản lý → cảnh báo admin tự gán tay sau ở danh sách nháp (nút cũ vẫn giữ làm phương án dự phòng).
- **Luồng sinh file tự động (tab Nhập tay)**: sau tạo draft → `POST /draft-document` → upload Cloudinary (`raw`) → `PUT` lưu `draftContractFileUrl` → hiện panel "Xem hợp đồng nháp". Tab Upload file (import HĐ có sẵn) giữ nguyên hành vi cũ — dùng lại đúng file admin đã tải lên, không sinh file mới.
- Thêm ô "Ngày sinh" khách chính — BE giờ đã nhận + lưu field này (xem đầu file).

## 6. Bối cảnh test — script verify (đã hủy draft test sau khi xong)

```
POST /properties/26/rooms/28/tenant-contract {draft:true, ...} → 200, id=24, code=HD-MT-2026-00024
POST /tenant-contracts/24/draft-document → 200, 201819 bytes, đúng content-type/filename
  → file: không còn "${...}", đúng "Test Draft Document", đúng "2.500.000 VND"
POST /tenant-contracts/1/draft-document (HĐ ACTIVE) → 422 "Chỉ xuất file nháp khi hợp đồng đang ở trạng thái DRAFT"
POST /tenant-contracts/24/cancel → dọn draft test
```

⚠️ **Lưu ý cho cả nhóm:** trong lúc test phát hiện **DB local đã bị wipe + reseed** (property ID giờ 1-55, khác hẳn range cũ 23-...-81-82; tài khoản demo `0977111333` không còn tồn tại) — có thể do `SampleDataSeeder.java` bị thay đổi trong cùng commit `8a9d18d`. Ai đang dùng data demo cũ (draft/ticket/invoice test ở các session trước) cần biết là đã mất hết, phải seed lại.
