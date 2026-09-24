import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, canTerminateForUnpaidInvoice, isMeterReadingDay, isPreCollectStatus } from '@/constants';
import { activeRentingKeys, belongsToActiveTenant } from '@/utils';
import type { ManagedProperty } from '@/types/managedProperty';
import { managerPropertyService } from '@/services/manager/propertyService';
import {
  realManagerInvoiceService, ManagerInvoice, ManagerPayment,
} from '@/services/manager/invoiceService';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';
import { checkoutService } from '@/services/manager/checkoutService';
import { meterReadingService, type PendingMeterReadingItem } from '@/services/manager/meterReadingService';
import type { CheckoutRequestDto } from '@/services/tenant/selfService';
import { todayIso } from '@/utils/serverTime';

/**
 * DANH SÁCH VIỆC CỦA MANAGER — MỘT nguồn cho cả trang chủ ("My Task — hôm nay") lẫn màn
 * "Việc của tôi". Trước 24/09/2026 luật đếm nằm thẳng trong ManagerHomeScreen, và trang
 * chủ chỉ vẽ 2 thẻ khẩn đầu tiên — việc khẩn thứ 3 trở đi không hiện ở đâu cả. Tách ra đây
 * để màn tổng dùng lại đúng luật đó, số hai nơi luôn khớp nhau.
 *
 * Mức độ:
 *   • critical — làm ngay (quá hạn, tới hạn hôm nay, chặn cả kỳ thu tiền)
 *   • warning  — cần làm (đang chờ mình nhưng chưa trễ)
 *   • upcoming — sắp tới (chuẩn bị trước: khách sắp tới đón, hợp đồng sắp hết)
 */
export type TaskUrgency = 'critical' | 'warning' | 'upcoming';

export interface ManagerTaskItem {
  id: string;
  icon: string;
  label: string;
  /** Một dòng giải thích việc phải làm — hiện ở màn "Việc của tôi". */
  hint: string;
  count: number;
  urgency: TaskUrgency;
  color: string;
  route: string;
  params?: Record<string, unknown>;
}

export interface ManagerTaskInputs {
  properties: ManagedProperty[];
  invoices: ManagerInvoice[];
  payments: ManagerPayment[];
  draftContracts: TenantContractResponse[];
  activeContracts: TenantContractResponse[];
  checkouts: CheckoutRequestDto[];
  pendingMeters: PendingMeterReadingItem[];
}

/** Hợp đồng còn ≤ ngần này ngày thì đưa vào "Sắp tới" để nhắc gia hạn / chuẩn bị tiễn khách. */
const EXPIRING_DAYS = 30;
/** Khách sẽ tới đón trong ngần này ngày tới. */
const RECEPTION_AHEAD_DAYS = 7;

const addDaysIso = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Ngày đón khách: `moveInDate → expectedReceptionDate → startDate`, GIỐNG ResumeContract.
 * Hợp đồng import từ Excel để `expectedReceptionDate` null — so riêng trường đó là bỏ sót.
 */
const receptionDateOf = (c: TenantContractResponse): string | null => {
  const raw = c.moveInDate || c.expectedReceptionDate || c.startDate;
  return raw ? String(raw).slice(0, 10) : null;
};

export const buildManagerTasks = (d: ManagerTaskInputs): ManagerTaskItem[] => {
  const today = todayIso();

  // Chỉ đếm việc manager CÒN LÀM ĐƯỢC: hoá đơn của khách đã chấm dứt HĐ xử lý ở luồng
  // tất toán trả phòng, không thuộc về đây (BE vẫn giữ OVERDUE nên phải tự lọc).
  const renting = activeRentingKeys(d.activeContracts);
  const inv = d.invoices.filter(i => belongsToActiveTenant(i, renting));
  const isUtility = (i: ManagerInvoice) => i.type === 'ELECTRICITY' || i.type === 'WATER';
  const overdueRent = inv.filter(i => i.status === 'OVERDUE' && i.type !== 'ELECTRICITY' && i.type !== 'WATER').length;
  const overdueUtility = inv.filter(i => i.status === 'OVERDUE' && isUtility(i)).length;
  // Mọi loại hoá đơn (24/09/2026): tiền nhà từ ngày 8; loại khác quá 5 ngày kể từ ngày phát hành.
  const terminable = inv.filter(i => canTerminateForUnpaidInvoice(i)).length;
  const pendingVerify = d.payments.filter(p => p.status === 'PENDING_VERIFY').length;

  const receptionDue = d.draftContracts.filter(c => { const r = receptionDateOf(c); return !!r && r <= today; }).length;
  const receptionSoon = d.draftContracts.filter(c => {
    const r = receptionDateOf(c);
    return !!r && r > today && r <= addDaysIso(today, RECEPTION_AHEAD_DAYS);
  }).length;

  const checkoutPending = d.checkouts.filter(c => (c.status || '').toUpperCase() === 'PENDING').length;
  const checkoutInProgress = d.checkouts.filter(c =>
    ['APPROVED', 'INSPECTING', 'DISPUTED', 'SETTLING'].includes((c.status || '').toUpperCase())).length;

  const maintenance = d.properties.reduce((s, p) => s + p.maintenance, 0);
  const pendingElec = d.pendingMeters.filter(r => r.utilityType === 'ELECTRICITY').length;
  const pendingWater = d.pendingMeters.length - pendingElec;
  const elecDueToday = isMeterReadingDay();

  const expiring = d.activeContracts.filter(c => {
    const end = c.endDate ? String(c.endDate).slice(0, 10) : null;
    return !!end && end >= today && end <= addDaysIso(today, EXPIRING_DAYS);
  }).length;

  const all: ManagerTaskItem[] = [
    // ── Làm ngay ──
    { id: 'reception', icon: '🤝', label: 'Khách đến hạn đón', hint: 'Đã tới hoặc quá ngày vào ở — đi bàn giao phòng',
      count: receptionDue, urgency: 'critical', color: Colors.primary, route: 'ResumeContract' },
    { id: 'rentOverdue', icon: '🧾', label: 'Tiền nhà quá hạn', hint: 'Nhắc khách trả, hoặc ghi nhận khách đã trả tiền mặt',
      count: overdueRent, urgency: 'critical', color: Colors.error, route: 'ManagerPaymentHistory', params: { filter: 'DEBT' } },
    { id: 'rentTerminate', icon: '⛔', label: 'Nợ quá hạn — được chấm dứt HĐ', hint: 'Khách nợ quá hạn đủ lâu để chấm dứt hợp đồng',
      count: terminable, urgency: 'critical', color: Colors.error, route: 'ManagerPaymentHistory', params: { filter: 'DEBT' } },
    // Nợ quá hạn → tab "Đang nợ" của Tiền khách thuê: gom theo từng khách, đủ cả tiền nhà lẫn điện nước.
    { id: 'utilOverdue', icon: '⚡', label: 'Điện/nước quá hạn', hint: 'Hoá đơn điện nước khách chưa trả',
      count: overdueUtility, urgency: 'critical', color: Colors.error, route: 'ManagerPaymentHistory', params: { filter: 'DEBT' } },
    { id: 'maintenance', icon: '🔧', label: 'Bảo trì cần xử lý', hint: 'Phiếu sửa chữa đang mở ở các nhà bạn quản lý',
      count: maintenance, urgency: 'critical', color: Colors.error, route: 'ManagerMaintenance' },
    { id: 'checkoutPending', icon: '🚪', label: 'Yêu cầu trả phòng chờ duyệt', hint: 'Khách vừa gửi — duyệt để hẹn ngày kiểm tra phòng',
      count: checkoutPending, urgency: 'critical', color: '#DC2626', route: 'CheckoutRequests' },
    // Chưa chụp công tơ thì không phát hành được hoá đơn — chặn cả kỳ thu tiền.
    { id: 'elec', icon: '⚡', label: elecDueToday ? 'Chốt chỉ số điện — hạn hôm nay' : 'Chỉ số điện quá hạn chưa chốt',
      hint: 'Chụp công tơ điện từng phòng', count: pendingElec, urgency: 'critical', color: Colors.warning, route: 'MeterReadingPending' },
    { id: 'water', icon: '💧', label: 'Phòng chưa chụp đồng hồ nước', hint: 'Chụp đồng hồ nước theo lịch người ghi',
      count: pendingWater, urgency: 'critical', color: Colors.warning, route: 'MeterReadingPending' },

    // ── Cần làm ──
    { id: 'verify', icon: '💳', label: 'Chờ xác nhận thanh toán', hint: 'Khách báo đã chuyển khoản — kiểm tra rồi xác nhận',
      count: pendingVerify, urgency: 'warning', color: Colors.warning, route: 'ManagerBilling' },
    { id: 'checkoutProgress', icon: '📋', label: 'Hồ sơ trả phòng đang xử lý', hint: 'Kiểm tra phòng, lập biên bản, quyết toán cọc',
      count: checkoutInProgress, urgency: 'warning', color: '#DC2626', route: 'CheckoutRequests' },

    // ── Sắp tới ──
    { id: 'receptionSoon', icon: '📅', label: `Khách sẽ đến trong ${RECEPTION_AHEAD_DAYS} ngày`, hint: 'Chuẩn bị phòng, hẹn giờ bàn giao',
      count: receptionSoon, urgency: 'upcoming', color: Colors.info, route: 'ResumeContract' },
    { id: 'expiring', icon: '⏳', label: `Hợp đồng hết hạn trong ${EXPIRING_DAYS} ngày`, hint: 'Hỏi khách gia hạn hay dọn đi',
      count: expiring, urgency: 'upcoming', color: Colors.info, route: 'ManagerContracts' },
  ];
  return all.filter(t => t.count > 0);
};

/** Tự tải đủ dữ liệu rồi dựng danh sách việc — cho màn "Việc của tôi". */
export const useManagerTasks = () => {
  const [items, setItems] = useState<ManagerTaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [properties, invoices, payments, draftContracts, checkouts, pendingMeters] = await Promise.all([
        managerPropertyService.getManagedProperties(),
        realManagerInvoiceService.listInvoices().catch(() => [] as ManagerInvoice[]),
        realManagerInvoiceService.listPayments().catch(() => [] as ManagerPayment[]),
        // BE 24/09/2026: DRAFT chỉ là "chưa tới ngày" — tới ngày đón cron chuyển sang AWAITING_ONBOARD,
        // đã chụp xong thì AWAITING_PAYMENT. Cả 3 bước này còn việc của manager (chưa thu tiền),
        // nên lấy cả pipeline (RECEPTION) rồi lọc — chỉ hỏi DRAFT là mất hết việc "đón khách hôm nay".
        realTenantService.listManagedContracts('RECEPTION')
          .then(list => list.filter(c => isPreCollectStatus(c.status)))
          .catch(() => [] as TenantContractResponse[]),
        checkoutService.list().catch(() => [] as CheckoutRequestDto[]),
        meterReadingService.listAllPending().catch(() => [] as PendingMeterReadingItem[]),
      ]);
      const activeContracts = await realTenantService
        .listActiveByProperties(properties.map(p => Number(p.id)))
        .catch(() => [] as TenantContractResponse[]);
      setItems(buildManagerTasks({
        properties, invoices, payments, draftContracts, activeContracts, checkouts, pendingMeters,
      }));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return { items, loading, reload: load };
};
