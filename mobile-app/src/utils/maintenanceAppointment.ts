/**
 * Helper dùng chung cho mọi màn chọn/đổi lịch hẹn bảo trì (tạo phiếu, đổi lịch xem,
 * đặt/đổi lịch sửa) — khớp validate phía BE (`MaintenanceServiceImpl`, xem
 * docs/maintenance-appointment-implementation-spec.md): giờ hành chính 07:00–18:00,
 * slot cố định 30p (visit) / 60p (repair), đổi lịch chỉ được khi CÒN TRƯỚC ngày hẹn.
 */
import { serverNow } from '@/utils/serverTime';
import { MAINTENANCE_BUSINESS_START_HOUR, MAINTENANCE_BUSINESS_END_HOUR } from '@/constants/maintenance';

const pad = (n: number) => String(n).padStart(2, '0');

/** "10/08/2026" (định dạng DatePickerField) -> {d,m,y} số, null nếu chưa chọn/parse lỗi. */
export const parseDdMmYyyy = (s: string): { d: number; m: number; y: number } | null => {
  const [d, m, y] = (s || '').split('/').map(Number);
  return d && m && y ? { d, m, y } : null;
};

/** Ghép ngày (DD/MM/YYYY) + giờ ("HH:mm") thành Date cục bộ — để so sánh/tính overlap. */
export const toLocalDateTime = (dateStr: string, time: string): Date | null => {
  const parts = parseDdMmYyyy(dateStr);
  if (!parts) return null;
  const [h, min] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  return new Date(parts.y, parts.m - 1, parts.d, h, min, 0, 0);
};

/** Date cục bộ -> "YYYY-MM-DDTHH:mm:00", khớp LocalDateTime (BE không nhận offset/Z). */
export const toApiDateTime = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

/** "YYYY-MM-DDT00:00:00" / "...T23:59:59" cho 1 ngày (DD/MM/YYYY) — dùng cho query from/to. */
export const dayRangeApi = (dateStr: string): { from: string; to: string } | null => {
  const parts = parseDdMmYyyy(dateStr);
  if (!parts) return null;
  const d = `${parts.y}-${pad(parts.m)}-${pad(parts.d)}`;
  return { from: `${d}T00:00:00`, to: `${d}T23:59:59` };
};

/**
 * Lưới giờ cố định trong giờ hành chính — slot cuối phải kết thúc đúng lúc/trước giờ
 * đóng cửa (vd slotMinutes=30 → 07:00..17:30; slotMinutes=60 → 07:00..17:00).
 */
export const buildSlotTimes = (slotMinutes: number): string[] => {
  const times: string[] = [];
  const totalMinutes = (MAINTENANCE_BUSINESS_END_HOUR - MAINTENANCE_BUSINESS_START_HOUR) * 60;
  for (let m = 0; m + slotMinutes <= totalMinutes; m += slotMinutes) {
    const hh = MAINTENANCE_BUSINESS_START_HOUR + Math.floor(m / 60);
    const mm = m % 60;
    times.push(`${pad(hh)}:${pad(mm)}`);
  }
  return times;
};

/** Còn được đổi/huỷ lịch hẹn không — BE chỉ cho khi hôm nay CÒN TRƯỚC ngày hẹn. */
export const isBeforeAppointmentDay = (appointmentIso?: string): boolean => {
  if (!appointmentIso) return false;
  const at = new Date(appointmentIso);
  if (Number.isNaN(at.getTime())) return false;
  const today = serverNow();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const atStart = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  return todayStart.getTime() < atStart.getTime();
};
