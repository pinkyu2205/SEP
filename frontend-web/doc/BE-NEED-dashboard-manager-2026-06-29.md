# BE cần bổ sung: thông tin Manager trong Dashboard tenant — 2026-06-29

## Bối cảnh
Màn Trang chủ tenant (mobile) — card "Thông tin tòa nhà" hiển thị người liên hệ ("Chủ nhà").
Yêu cầu nghiệp vụ: tenant liên hệ **người quản lý trực tiếp (manager)**, KHÔNG phải chủ sở hữu (host/owner).

Hiện `GET /api/v1/tenant/me/dashboard` → `building` chỉ trả `hostName/hostPhone` (chủ sở hữu),
và đang rỗng → app hiện "Chủ nhà: —".

## Cần BE bổ sung
Thêm vào `DashboardBuilding` (response của `/tenant/me/dashboard`):
```
managerName: string   // họ tên manager đang quản lý property của tenant
managerPhone: string  // SĐT manager
```
(Là manager được gán quản lý property — người tenant nhận hóa đơn / liên hệ.)

FE đã gọi sẵn: ưu tiên `managerName/managerPhone`, fallback `hostName/hostPhone` nếu chưa có.
Khi BE thêm 2 field này, app tự hiển thị tên manager — không cần sửa FE.
