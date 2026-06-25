# Spec Backend — Luồng Bảo trì cải thiện (rich)

> Cho đồng đội Backend (repo Spring riêng). Frontend (mobile) đã triển khai **đầy
> đủ luồng rich trên store/mock để demo end-to-end**. Để chạy thật xuyên vai trò
> (tenant ↔ manager ↔ admin) qua BE, cần bổ sung như dưới đây.
>
> Bỏ qua (theo yêu cầu): luồng chat trên ticket, chấm sao/đánh giá.
>
> **⚠️ File này THAY THẾ `Maintenance_BE_Change_costPaidBy.md`** — đã gộp toàn bộ
> nội dung costPaidBy + auto room status vào đây (mục 2, 4, 6). Dùng file này làm
> nguồn duy nhất; file cũ chỉ giữ để tham chiếu lịch sử.

## 1. Mở rộng state machine

Hiện BE: `PENDING / IN_PROGRESS / RESOLVED / CANCELLED`.
Đề xuất mở rộng:

```
PENDING ─► ACKNOWLEDGED ─► SCHEDULED ─► IN_PROGRESS ─► [PENDING_APPROVAL] ─► DONE ─► CONFIRMED
              │                │             │  ▲                                      ▲
              │                │             └─ ON_HOLD ─┘                     REOPENED ┘
              └──────────────── CANCELLED ◄──────────────
```

| Trạng thái | Ý nghĩa | Người chuyển |
|---|---|---|
| PENDING | Mới tạo | tenant |
| ACKNOWLEDGED | Manager đã tiếp nhận, gán KTV | manager |
| SCHEDULED | Manager đề xuất khung giờ | manager |
| (tenant confirm slot) | tenant chọn khung giờ → lưu `confirmedSlot` | tenant |
| IN_PROGRESS | Đang thi công (yêu cầu có ảnh "trước") | manager |
| ON_HOLD | Tạm dừng (chờ phụ tùng), kèm `onHoldReason` | manager |
| PENDING_APPROVAL | Chi phí vượt ngưỡng, chờ Admin duyệt | hệ thống |
| DONE | Đã sửa xong (yêu cầu có ảnh "sau"), chờ tenant nghiệm thu | manager |
| CONFIRMED | Tenant nghiệm thu đạt → đóng | tenant |
| REOPENED→IN_PROGRESS | Tenant chưa đạt → mở lại | tenant |
| CANCELLED | Hủy | manager |

## 2. Field mới (MaintenanceRequest + Response)

```
acknowledgedAt: datetime
scheduledSlots: string[]        // khung giờ manager đề xuất
confirmedSlot: string           // tenant chọn
onHoldReason: string
approvalStatus: enum(NONE, PENDING, APPROVED, REJECTED)
doneAt: datetime
tenantConfirmedAt: datetime
reopenCount: int
technicianId: string            // tham chiếu thư mục KTV
costPaidBy: enum(HOST, TENANT)  // optional, default HOST — xem mục 4
cause: enum(WEAR, MISUSE)       // nguyên nhân, phục vụ mục 4
```

**DB & migration:**
- Thêm các cột tương ứng vào bảng `maintenance_request`, trong đó
  `cost_paid_by VARCHAR(10)` (enum HOST/TENANT).
- Migration: **backfill các bản ghi cũ `cost_paid_by = HOST`** (mặc định cũ là
  chủ nhà trả).
- Các field bổ sung đều trả về trong `MaintenanceRequestResponse`.

## 3. Endpoint đề xuất

- `PUT /maintenance/{id}/acknowledge` { technicianId, note }
- `PUT /maintenance/{id}/schedule` { scheduledSlots[], note }
- `PUT /maintenance/{id}/confirm-schedule` { slot }            ← tenant
- `PUT /maintenance/{id}/status` { status: IN_PROGRESS|ON_HOLD, onHoldReason?, note }
- `PUT /maintenance/{id}/done` { repairCost, costPaidBy, cause, resolutionNote }
  → nếu `repairCost > THRESHOLD` ⇒ chuyển PENDING_APPROVAL thay vì DONE.
  → **Tương thích:** FE hiện đang gọi `PUT /maintenance/{id}/resolve` với body
    `{ repairCost, resolutionNote, costPaidBy }`. BE có thể giữ `/resolve` (nhận thêm
    `costPaidBy`, `cause` và áp logic ngưỡng) thay vì đổi tên thành `/done`, để FE
    không phải sửa. Chọn 1 và thống nhất với FE.
- `PUT /maintenance/{id}/approve` { approve: boolean }          ← admin
- `PUT /maintenance/{id}/confirm` { accept: boolean }           ← tenant (DONE→CONFIRMED hoặc REOPEN→IN_PROGRESS)

Gate ảnh: từ chối `IN_PROGRESS` nếu chưa có ảnh "before"; từ chối `done` nếu chưa có ảnh "after".

## 4. Hạch toán chi phí (đúng net profit) — quan trọng

Khi ticket đạt trạng thái terminal CONFIRMED:
- `costPaidBy = HOST` → tạo **Expense** gắn property (chi phí nhà).
- `costPaidBy = TENANT`:
  - nếu hợp đồng còn hiệu lực → **tự sinh 1 dòng phí trong hóa đơn tháng kế tiếp** của phòng (không tạo expense).
  - nếu phát hiện lúc trả phòng và `cause = MISUSE` → **trừ vào tiền cọc** khi tất toán.
- Luôn cập nhật **lịch sử + vòng đời thiết bị**; nếu `maintenanceCount >= N` hoặc tổng chi phí sửa vượt % giá mua → gắn cờ "khuyến nghị thay mới".

## 5. Ngưỡng & SLA (đồng bộ với FE)
- Ngưỡng duyệt chi phí: 2.000.000đ (`MAINTENANCE_COST_APPROVAL_THRESHOLD`).
- SLA mục tiêu (ngày) theo ưu tiên: urgent 1, high 2, medium 4, low 7. Quá hạn → cờ cảnh báo + (tùy chọn) tự leo thang ưu tiên.

## 6. Auto room status
- IN_PROGRESS → room = MAINTENANCE; CONFIRMED/CANCELLED và phòng hết ticket mở → revert.

## 7. Thông báo
- Tới manager: có yêu cầu mới (PENDING).
- Tới tenant: ACKNOWLEDGED, SCHEDULED (chọn giờ), DONE (mời nghiệm thu), CONFIRMED.
- Tới admin: PENDING_APPROVAL.
