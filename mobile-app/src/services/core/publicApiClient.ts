import axios from 'axios';
import { REAL_BASE_URL } from '@/constants/api';
import { syncServerTimeFromHeader } from '@/utils/serverTime';

// Trỏ về backend Spring thật (tự suy IP theo nền tảng — xem constants/api.ts).
// Endpoint public hiện dùng trong guestPropertyService là /api/v1/public/properties.
const publicApiClient = axios.create({
  baseURL: REAL_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// Client này thường chạy TRƯỚC khi đăng nhập (khách xem nhà), nên là cơ hội sớm nhất
// để bắt được giờ VPS từ header `Date` — xem @/utils/serverTime.
publicApiClient.interceptors.response.use(
  (response) => {
    syncServerTimeFromHeader((response.headers as { date?: unknown })?.date);
    return response;
  },
  (error) => {
    syncServerTimeFromHeader((error?.response?.headers as { date?: unknown })?.date);
    return Promise.reject(error);
  },
);

export default publicApiClient;
