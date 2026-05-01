# RoomRent - Hệ thống Quản lý Phòng trọ Thông minh

Monorepo chứa toàn bộ mã nguồn frontend cho dự án quản lý phòng trọ.

## 📁 Cấu trúc dự án

```
SEP/
├── frontend-web/     # Admin Dashboard (React JS) - Coming soon
├── mobile-app/       # Mobile App (React Native / Expo)
└── README.md
```

## 📱 Mobile App

### Yêu cầu
- Node.js >= 18
- npm >= 9
- Expo CLI (`npx expo`)
- Expo Go app trên điện thoại (để test)

### Cài đặt & Chạy

```bash
cd mobile-app
npm install
npx expo start
```

Sau khi chạy, quét QR code bằng app **Expo Go** trên điện thoại để xem ứng dụng.

### Cấu trúc Mobile App

```
mobile-app/src/
├── assets/          # Hình ảnh, fonts, icons
├── components/      # UI Components dùng chung
│   └── common/      # Button, Card, Input, StatusBadge
├── constants/       # Colors, Typography, Spacing, API config
├── hooks/           # Custom hooks (useAuth)
├── navigation/      # React Navigation (Tabs + Stack)
├── screens/         # Các màn hình
│   ├── auth/        # Login
│   ├── tenant/      # Home, Invoices, Maintenance (Khách thuê)
│   ├── manager/     # Dashboard (Quản lý vận hành)
│   └── shared/      # Profile (dùng chung)
├── services/        # API client, Auth, Invoice, Maintenance services
├── types/           # TypeScript interfaces
└── utils/           # Helper functions (format tiền, ngày, trạng thái)
```

## 🌐 Web Dashboard

> Sẽ được triển khai trong thư mục `frontend-web/`. Coming soon.

## 👥 Thành viên nhóm

| STT | Họ tên | Vai trò |
|-----|--------|---------|
| 1   |        | Backend Specialist |
| 2   |        | Mobile Developer |
| 3   |        | Web/Frontend Developer |
| 4   |        | Integration & QA |

## 📝 License

Đồ án môn học - FPT University
