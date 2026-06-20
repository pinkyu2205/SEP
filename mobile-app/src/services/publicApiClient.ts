import axios from 'axios';
import { REAL_BASE_URL } from '../constants/api';

// Trỏ về backend Spring thật (tự suy IP theo nền tảng — xem constants/api.ts).
// Endpoint public hiện dùng trong guestPropertyService là /api/v1/public/properties.
const publicApiClient = axios.create({
  baseURL: REAL_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

export default publicApiClient;
