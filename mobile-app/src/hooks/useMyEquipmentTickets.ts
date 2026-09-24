import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { EquipmentMaintenanceHistoryDto, MaintenanceReqStatus, MaintenanceRequestDto } from '@/types';
import { realMaintenanceService } from '@/services/shared/maintenanceService';

/**
 * PHIẾU BẢO TRÌ CỦA KHÁCH, GOM THEO THIẾT BỊ (24/09/2026).
 *
 * `/tenant/me/equipments/{id}/maintenance-history` và `maintenanceCount`/`lastMaintenanceDate`
 * của thiết bị BE trả rỗng/0 dù thiết bị đã có phiếu — màn thiết bị của tenant vì thế luôn
 * hiện "Chưa bảo trì lần nào" + "Mới lắp đặt". Nguồn đáng tin là phiếu của chính khách
 * (`/maintenance/my-requests`, có `equipmentId`) — suy lịch sử + trạng thái từ đó, giống
 * cách host/admin đã làm với `/maintenance-tickets`.
 */

/** Phiếu còn mở = thiết bị đang trong quá trình xử lý. */
export const OPEN_TICKET_STATUSES: MaintenanceReqStatus[] = [
  'OPEN', 'REPAIR_SCHEDULED', 'IN_REPAIR', 'TENANT_FAULT', 'PENDING_TENANT_REPAIR',
  'OUTSTANDING_DAMAGE', 'WAITING_PAYMENT',
];

export const TICKET_STATUS_META: Record<MaintenanceReqStatus, { label: string; bg: string; text: string }> = {
  OPEN: { label: 'Chờ quản lý xem', bg: '#EFF6FF', text: '#2563EB' },
  REPAIR_SCHEDULED: { label: 'Đã hẹn sửa', bg: '#EFF6FF', text: '#2563EB' },
  IN_REPAIR: { label: 'Đang sửa', bg: '#FFFBEB', text: '#D97706' },
  TENANT_FAULT: { label: 'Lỗi do sử dụng', bg: '#FEF2F2', text: '#DC2626' },
  PENDING_TENANT_REPAIR: { label: 'Bạn tự sửa', bg: '#FFFBEB', text: '#D97706' },
  OUTSTANDING_DAMAGE: { label: 'Chờ đền bù', bg: '#FEF2F2', text: '#DC2626' },
  WAITING_PAYMENT: { label: 'Chờ thanh toán', bg: '#FFFBEB', text: '#D97706' },
  CLOSED: { label: 'Đã sửa xong', bg: '#F0FDF4', text: '#059669' },
  CANCELLED: { label: 'Đã huỷ', bg: '#F1F5F9', text: '#64748B' },
};

export const isOpenTicket = (t: MaintenanceRequestDto) => OPEN_TICKET_STATUSES.includes(t.status);

/** Ngày "đã sửa" của 1 phiếu đóng — BE không có closedAt riêng. */
export const ticketDoneDate = (t: MaintenanceRequestDto) => t.resolvedAt || t.updatedAt || t.createdAt;

/** Chi phí của phiếu (nếu có) — hoá đơn sửa hoặc khoản đền bù. */
export const ticketCost = (t: MaintenanceRequestDto): number | undefined =>
  t.issuedInvoice?.grandTotal ?? t.invoiceAmount ?? t.estimatedDamageAmount ?? undefined;

export interface EquipmentTicketSummary {
  tickets: MaintenanceRequestDto[];
  open?: MaintenanceRequestDto;
  repairedCount: number;
  lastRepairedAt?: string;
}

export const summarizeTickets = (tickets: MaintenanceRequestDto[] = []): EquipmentTicketSummary => {
  const sorted = [...tickets].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const closed = sorted.filter(t => t.status === 'CLOSED');
  return {
    tickets: sorted,
    open: sorted.find(isOpenTicket),
    repairedCount: closed.length,
    lastRepairedAt: closed[0] ? ticketDoneDate(closed[0]) : undefined,
  };
};

/**
 * Trạng thái hiển thị của thiết bị cho khách: phiếu đang mở → "Đang xử lý";
 * đã từng sửa → "Tốt · đã sửa N lần" (không còn là "Mới lắp đặt"); còn lại theo BE.
 */
export const equipmentDisplayStatus = (
  beStatus: string, s: EquipmentTicketSummary,
  fallback: (st: string) => { label: string; bg: string; text: string },
) => {
  if (s.open) return { label: 'Đang xử lý sự cố', bg: '#FFFBEB', text: '#D97706' };
  if (s.repairedCount > 0 && ['NEW', 'GOOD', ''].includes((beStatus ?? '').toUpperCase())) {
    return { label: `Tốt · đã sửa ${s.repairedCount} lần`, bg: '#F0FDF4', text: '#059669' };
  }
  return fallback(beStatus);
};

/** Bản ghi lịch sử của BE (nếu có) không trùng với phiếu nào — vẫn hiện, không bỏ sót. */
export const orphanHistory = (history: EquipmentMaintenanceHistoryDto[], tickets: MaintenanceRequestDto[]) => {
  const ids = new Set(tickets.map(t => t.id));
  return history.filter(h => !ids.has(h.maintenanceRequestId));
};

/** Tải phiếu của khách 1 lần, trả Map equipmentId → phiếu. Lỗi mạng thì Map rỗng. */
export const useMyEquipmentTickets = () => {
  const [byEquipment, setByEquipment] = useState<Map<number, MaintenanceRequestDto[]>>(new Map());
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const page = await realMaintenanceService.getMyRequests({ size: 200 });
      const map = new Map<number, MaintenanceRequestDto[]>();
      for (const t of page?.content ?? []) {
        if (t.equipmentId == null) continue;
        const arr = map.get(Number(t.equipmentId)) ?? [];
        arr.push(t);
        map.set(Number(t.equipmentId), arr);
      }
      setByEquipment(map);
    } catch {
      /* giữ nguyên — màn vẫn hiện được thông tin thiết bị */
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return { byEquipment, loaded, reload: load };
};
