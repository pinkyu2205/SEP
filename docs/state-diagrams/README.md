# State diagram các luồng nghiệp vụ SLMS2026

21 sơ đồ trạng thái PlantUML, mỗi file là vòng đời của một đối tượng trong một luồng. Đọc từ code service của repo BE (commit `d58925e`, nhánh `dev`): mỗi mũi tên là một chỗ code thật sự đổi trạng thái, kèm điều kiện (`[guard]`) và hành động phụ (`/ effect`). Cùng cặp với các sequence diagram ở `../sequence-diagrams/` (file 05 ↔ sequence 05–15, v.v.).

## Cách xem

```
java -jar plantuml.jar -tsvg *.puml     # ra SVG cạnh file nguồn
```

Hoặc dán nội dung file vào PlantUML trong VS Code / plantuml.com. Đã kiểm tra: cả 21 file đều render được.

## Danh sách

| # | File | Đối tượng / enum | Sequence liên quan |
|---|------|------------------|--------------------|
| 01 | user-account | `UserStatus` + kích hoạt lần đầu (firstLogin) | 01, 02, 03, 47 |
| 02 | tenant-contract | `ContractStatus` của hợp đồng thuê | 25–29, 33 |
| 03 | contract-deposit-payment-and-price-approval | `PaymentStatus` thu cọc onboard, `PriceApprovalStatus` Host duyệt giá | 26, 39 |
| 04 | contract-extension-request | `ExtensionRequestStatus` | 29 |
| 05 | maintenance-request | `MaintenanceStatus` (8 trạng thái, gồm luồng cũ) | 05–15 |
| 06 | maintenance-appointments-and-payment-gate | Lịch hẹn xem, lịch hẹn sửa, cổng thanh toán trước khi sửa | 05, 06, 10, 11 |
| 07 | property-lifecycle | `PropertyStatus` | 34, 35, 36, 37, 45 |
| 08 | renovation-session | `RenovationSessionStatus` | 34, 36 |
| 09 | room | `RoomStatus` | 35, 45 |
| 10 | equipment | `EquipmentStatus` + `EquipmentOperationalStatus` | 09, 12, 36, 42 |
| 11 | tenant-invoice | `TenantInvoiceStatus` | 16, 22, 23, 44 |
| 12 | payment-claim-and-payos-order | `PaymentClaimStatus`, `PayosOrderStatus` | 16, 17, 18 |
| 13 | invoice-dispute | `InvoiceDisputeStatus` | 22 |
| 14 | utility-bill-and-invoice | `UtilityBillStatus`, `UtilityInvoiceStatus` | 20, 21 |
| 15 | otp-verification | OTP (Twilio): hết hạn, sai quá 5 lần, xác thực | 03, 27 |
| 16 | unlock-and-override-passcodes | Mã admin → token manager, đếm nhập sai, khoá | 18, 19 |
| 17 | checkout-request | `CheckoutRequestStatus` | 30–33 |
| 18 | deposit-ledger | `DepositStatus` (suy ra, không lưu cột) | 32, 39 |
| 19 | viewing-lead | `ViewingLeadStatus` | 38 |
| 20 | master-lease | Trạng thái hiển thị của hợp đồng đầu vào (Host) | 39 |
| 21 | utility-reading-reminder-milestones | Mốc nhắc chụp công tơ (cron 08:00 / 18:00 / 20:00) | 48 |

## Những chỗ enum có nhưng code chưa ghi

Lọc ra khi đọc code để sơ đồ không vẽ mũi tên không tồn tại. Đây cũng là danh sách để hỏi BE nếu định dùng:

| Enum | Giá trị chưa có đường ghi |
|------|---------------------------|
| `UserStatus` | `INACTIVE` (chỉ là mặc định của entity), `PENDING` |
| `PropertyStatus` | `RENTED`, `MAINTENANCE`, `INACTIVE` (chỉ được kiểm tra khi đọc) |
| `PaymentStatus` | `FAILED` |
| `TenantInvoiceStatus` | `PARTIAL` (cron có quét nhưng không ai ghi) |
| `PayosOrderStatus` | `EXPIRED` (hết hạn tính bằng `expiredAt`) |
| `UtilityInvoiceStatus` | `CANCELLED` |
| `CheckoutRequestStatus` | `CANCELLED` (tenant huỷ được ghi thành `REJECTED`) |
| `EquipmentStatus` | `DISPOSED` |
| `ViewingLeadStatus` | `ASSIGNED`, `SCHEDULED`, `COMPLETED`, `CANCELLED`, `NO_SHOW` (chỉ có `NEW`) |
| `MasterLeaseStatus` | Cả enum: master lease của Host thực chất là `InboundContract`; `EXPIRING` / `EXPIRED` được tính từ `endDate`, `MasterLeaseController` cũ đang bị comment |

## Lưu ý

- Sơ đồ 18, 20 và 21 mô tả trạng thái được **suy ra khi đọc** (từ hợp đồng + bảng quyết toán, từ `endDate`, từ giờ chạy cron), không phải cột status trong DB.
- Sơ đồ 05: nền vàng là luồng cũ (`PENDING_TENANT_REPAIR`, báo lỗi rồi chờ admin duyệt). FE hiện không còn mở lối vào nhưng BE vẫn xử lý phiếu cũ.
- Sơ đồ 10: `updateEquipmentStatus` nhận mọi giá trị, không có bảng chuyển đổi, nên chỉ vẽ các chuyển đổi chính; bảng chuyển đổi của phòng (sơ đồ 09) thì có thật (`isAllowedStatusTransition`).
- Các đối tượng chỉ có một cờ thời gian (vd. `handoverAcknowledgedAt`, `termination proposed`) không vẽ thành sơ đồ riêng.
