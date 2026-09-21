# Sequence diagram các luồng nghiệp vụ SLMS2026

48 sơ đồ PlantUML, cùng khung với `SaveLockedMeterReading` (đánh số bước, `alt` / `opt` / `break`, cột DB ở ngoài cùng bên phải). Mỗi file đọc từ code service tương ứng trong repo BE (commit `d58925e`, nhánh `dev`), không suy đoán từ tài liệu.

## Cách xem

```
java -jar plantuml.jar -tsvg *.puml     # ra SVG cạnh file nguồn
```

Hoặc dán nội dung file vào PlantUML trong VS Code / plantuml.com. Đã kiểm tra: cả 48 file đều render được, không lỗi cú pháp.

## Danh sách

| # | File | Luồng | Kích hoạt chính |
|---|------|-------|-----------------|
| 01 | auth-register | Đăng ký tài khoản khách thuê | `POST /auth/register` |
| 02 | auth-login | Đăng nhập, cấp JWT | `POST /auth/login` |
| 03 | auth-tenant-activation | Kích hoạt tài khoản bằng OTP + đặt mật khẩu | `POST /auth/tenant-activate/*` |
| 04 | auth-change-password | Đổi mật khẩu | `POST /auth/change-password` |
| 05 | maintenance-create-request | Tenant tạo phiếu bảo trì, hẹn lịch xem | `POST /maintenance` |
| 06 | maintenance-visit-scheduling | Đổi lịch hẹn xem, manager xác nhận có mặt | `PUT /maintenance/{id}/reschedule-visit`, `/confirm-arrival` |
| 07 | maintenance-cancel | Huỷ phiếu; cron tự huỷ khi manager không tới sau 2 giờ | `PUT /maintenance/{id}/cancel`, cron 10 phút |
| 08 | maintenance-send-for-inspection | Mang thiết bị đi kiểm tra thêm | `PUT /maintenance/{id}/send-for-inspection` |
| 09 | maintenance-diagnose | Chẩn đoán hao mòn / lỗi khách, thay thiết bị, báo admin | `PUT /maintenance/{id}/diagnose` |
| 10 | maintenance-charge-before-repair | Lập hoá đơn thu khách trước khi sửa, khách thanh toán | `PUT /maintenance/{id}/charge` |
| 11 | maintenance-start-repair | Đổi lịch sửa, bắt đầu sửa | `PUT /maintenance/{id}/reschedule-repair`, `/start-repair` |
| 12 | maintenance-complete | Hoàn tất sửa chữa, thay thiết bị | `PUT /maintenance/{id}/complete` |
| 13 | maintenance-handover | Bàn giao sau kiểm tra thêm | `PUT /maintenance/{id}/handover` |
| 14 | maintenance-report-fault-admin-review | Manager báo lỗi khách, admin duyệt (luồng cũ) | `PUT /maintenance/{id}/report-fault`, `/admin-review` |
| 15 | maintenance-self-repair-verify | Khách tự sửa, manager xác nhận, cron quá hạn (luồng cũ) | `PUT /maintenance/{id}/submit-self-repair`, `/verify-repair`, cron 09:00 |
| 16 | billing-tenant-pay-invoice-payos | Tenant thanh toán hoá đơn qua PayOS, webhook, thông báo sau commit | `POST /tenant/me/invoices/{id}/payment`, `POST /payos/webhook` |
| 17 | billing-manager-verify-payment-claim | Manager xác nhận / từ chối chuyển khoản | `POST /manager/payments/{id}/verify`, `/reject` |
| 18 | billing-invoice-unlock-manager-qr | Admin cấp mã, manager mở khoá và tạo QR thu hộ | `/admin/invoice-unlock/passcodes`, `/manager/invoice-unlock/verify`, `/manager/invoices/{id}/payment-qr` |
| 19 | billing-meter-override | Admin cấp mã, manager nhập chỉ số không cần ảnh | `/admin/meter-override/passcodes`, `/manager/meter-override/verify` |
| 20 | billing-save-locked-meter-reading | Chốt chỉ số công tơ, tự phát hành hoá đơn | `POST /manager/meter-readings` |
| 21 | billing-publish-utility-bill | Admin phát hành hoá đơn điện / nước của nhà | `POST /admin/utility-bills` |
| 22 | billing-invoice-dispute | Tenant khiếu nại hoá đơn, admin kết luận | `POST /tenant/me/invoices/{id}/dispute`, `POST /admin/invoice-disputes/{id}/resolve` |
| 23 | billing-daily-sweep-cron | Cron nhắc hạn, quá hạn, phí trễ, đề nghị chấm dứt hợp đồng | cron 08:00, `POST /admin/billing/run-daily-sweep` |
| 24 | billing-manager-issue-pending-charges | Gộp khoản phát sinh thành hoá đơn | `POST /manager/pending-charges/issue-invoice` |
| 25 | contract-onboard-tenant-create | Tạo hợp đồng thuê (DRAFT / PENDING / ACTIVE) | `POST /properties/{id}/rooms/{roomId}/tenant-contract` |
| 26 | contract-deposit-payment-payos | Thu cọc + tiền nhà kỳ đầu qua PayOS | `POST /tenant-contracts/{id}/deposit-payment`, webhook |
| 27 | contract-dual-otp-activation | OTP hai bên và kích hoạt hợp đồng | `/tenant/me/contracts/{id}/send-confirm-otp`, `/confirm-otp`, `/tenant-contracts/{id}/confirm` |
| 28 | contract-terminate-extend-cancel | Huỷ, thanh lý, gia hạn, cron khách không đến | `/tenant-contracts/{id}/cancel`, `/terminate`, `/extend`, cron 08:05 |
| 29 | contract-extension-request | Tenant xin gia hạn, admin duyệt / từ chối | `/tenant/me/contracts/{id}/extension-requests`, `/admin/extension-requests/*` |
| 30 | checkout-request-lifecycle | Yêu cầu trả phòng, duyệt, hợp đồng hết hạn tự tạo phiếu | `/tenant/me/checkout-requests`, `/checkout-requests/*`, cron 00:00 |
| 31 | checkout-inspection-settlement | Kiểm tra phòng, quyết toán, khách đồng ý / phản đối | `/checkout-requests/{id}/inspection`, `/settlement/submit` |
| 32 | checkout-refund-complete | Hoàn cọc, xác nhận / khiếu nại, cấn trừ cọc, thanh lý | `/checkout-requests/{id}/refund`, `/force-settle`, `/complete` |
| 33 | checkout-cron-jobs | Cron tự chấp nhận quyết toán, khoá tài khoản, nhắc quá hạn | cron 00:00, 00:15, 08:30 |
| 34 | property-onboarding-wizard | Onboard nhà từng bước đến hoàn thành cải tạo | `/properties/draft`, `/inbound-contract`, `/onboarding-options`, `/equipments/assign`, `/renovation/complete` |
| 35 | property-submit-host-confirm-activate | Gửi Host duyệt giá, nhà ACTIVE, gán manager | `/properties/{id}/submit-to-host`, `/host-confirm`, `/operation-manager` |
| 36 | property-bulk-import-and-supplement-renovation | Import Excel onboarding, cải tạo bổ sung, thay thiết bị | `/import/onboarding-excel`, `/renovation/start`, `/import/renovation-supplement-excel` |
| 37 | zone-manager-assignment | Gán / chuyển / gỡ manager khu vực | `/zones/{id}/manager`, `/zones/manager-transfer` |
| 38 | viewing-lead-and-public-listing | Danh sách nhà công khai, lead xem nhà, wishlist | `/public/properties`, `/admin/viewing-leads`, `/me/viewing-wishlist` |
| 39 | host-portal | Thông báo, dashboard, duyệt giá hợp đồng, master lease, chi phí, hoàn cọc | `/host/*` |
| 40 | notification-push-realtime | Push token, Expo push, khay chuông, SSE, WebSocket | `/user/me/push-token`, `/notifications/*`, `/ws` |
| 41 | ocr-vision | Đọc chỉ số công tơ, hoá đơn, nhận diện ảnh, mô tả phòng | `/ocr/meter`, `/ocr/evn-bill`, `/vision/*` |
| 42 | equipment-qr-status | Quét QR thiết bị, đổi tình trạng, tạm ngưng, thêm, gán | `/equipments/by-qr/{qr}`, `/equipment/{id}/status` |
| 43 | pricing-unit-price-escalation | Đổi giá niêm yết, giá áp dụng, tăng giá định kỳ | `/properties/{id}/price`, cron 08:00 |
| 44 | billing-rent-invoice-generation | Phát hành hoá đơn tiền phòng (cron, kỳ đầu, thủ công) | cron 00:05 / 00:10, `/properties/{id}/rent-invoices` |
| 45 | property-room-management | Phòng, vô hiệu hoá / bật lại / xoá hẳn nhà | `/properties/{id}/rooms/*`, `/disable`, `/purge` |
| 46 | contract-draft-document | Xuất PDF hợp đồng nháp, lưu, xem / tải | `/tenant-contracts/{id}/draft-document`, `/document` |
| 47 | user-management-and-tenant-handover | Tài khoản, hồ sơ cá nhân, xác nhận biên bản bàn giao | `/user/*`, `/tenant/me/handover` |
| 48 | utility-meter-reading-reminder-cron | Cron nhắc chụp công tơ | cron 08:00, 18:00, 20:00 |

## Chưa vẽ

Các endpoint chỉ đọc hoặc CRUD đơn giản không có nhánh nghiệp vụ: danh sách và chi tiết (hợp đồng, hoá đơn, phòng, nhà, phiếu bảo trì), dashboard tenant / owner, `tenant-sort`, `tenants/lookup`, danh sách khoản đặt cọc của admin và manager, import ảnh nhà (`property-images-zip`), import Excel `lease-excel`, `renovation-excel`, `tenant-draft-contracts-excel` (chỉ nhắc trong file 36 và 25), hai runner khởi động (`DataSeeder`, `BackfillCheckoutAccountsRunner`).

## Lưu ý

- Các bước con của repository (`SELECT` / `INSERT`) được vẽ theo khung mẫu; ở vài chỗ mình gộp nhiều câu lệnh cùng một bảng vào một bước để sơ đồ đọc được.
- File 14 và 15 mô tả luồng cũ (báo lỗi khách chờ admin duyệt, giao khách tự sửa). FE hiện không còn mở lối vào cho luồng tự sửa, nhưng BE vẫn xử lý phiếu cũ, nên vẫn vẽ.
- File 20 giữ nguyên sơ đồ bạn gửi ban đầu, gồm cả phần đuôi bước 32 đến 37.
