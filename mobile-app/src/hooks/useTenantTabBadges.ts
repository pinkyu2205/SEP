/**
 * Số trên hai tab "Hoá đơn" và "Sửa chữa" của khách thuê.
 *
 * ─── Vì sao có file này ──────────────────────────────────────────────────────
 * Trước 01/09/2026 hai badge đó là số CỨNG viết thẳng trong `TenantTabNavigator`:
 *
 *     <TabIcon emoji="🧾" badge={1} />
 *     <TabIcon emoji="🔧" badge={1} />
 *
 * Không đếm gì cả — mọi khách đều thấy chấm đỏ "1" ở cả hai tab ngay từ giây đầu
 * sau khi nhận phòng, và nó không bao giờ mất. Khách vừa onboard xong, màn chính ghi
 * "Tất cả hoá đơn đã được thanh toán" mà tab vẫn báo đỏ.
 *
 * Chấm đỏ nói dối một lần là những lần sau không ai tin nữa — kể cả khi nó đúng.
 *
 * ─── Đếm cái gì ─────────────────────────────────────────────────────────────
 * Chấm đỏ nghĩa là "BẠN có việc phải làm", không phải "có thứ gì đó đang diễn ra":
 *
 *   • Hoá đơn  → hoá đơn CHƯA trả. Khách phải đi trả.
 *   • Sửa chữa → yêu cầu đang giao khách TỰ SỬA (`pending_tenant_repair`), có hạn.
 *
 * Cố ý KHÔNG đếm mọi yêu cầu đang mở: `open` / `in_repair` là việc của quản lý, khách
 * chỉ ngồi chờ. Bôi đỏ chỗ khách không làm gì được là quay lại đúng vấn đề cũ.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { realTenantBillingService } from '@/services/tenant/billingService';
import { realMaintenanceService } from '@/services/shared/maintenanceService';
import { dtoToTenantRequest } from '@/services/shared/maintenanceMappers';

export interface TenantTabBadges {
  invoices: number;
  maintenance: number;
}

export const useTenantTabBadges = (): TenantTabBadges => {
  const [badges, setBadges] = useState<TenantTabBadges>({ invoices: 0, maintenance: 0 });

  const load = useCallback(() => {
    let alive = true;
    Promise.allSettled([
      realTenantBillingService.listInvoices(),
      realMaintenanceService.getMyRequests(),
    ]).then(([inv, req]) => {
      if (!alive) return;
      // Nguồn nào hỏng thì để 0 cho nguồn đó — thà thiếu chấm đỏ còn hơn báo bừa.
      const invoices = inv.status === 'fulfilled'
        ? inv.value.filter(i => String(i.status).toUpperCase() !== 'PAID'
            && String(i.status).toUpperCase() !== 'CANCELLED').length
        : 0;
      // `getMyRequests` trả `SpringPage`, dữ liệu nằm trong `.content`.
      const maintenance = req.status === 'fulfilled'
        ? (req.value.content ?? []).map(dtoToTenantRequest)
            .filter(r => r.status === 'pending_tenant_repair').length
        : 0;
      setBadges({ invoices, maintenance });
    });
    return () => { alive = false; };
  }, []);

  // Tải lại mỗi lần quay về tab — khách trả hoá đơn xong quay ra là chấm đỏ mất ngay.
  useFocusEffect(load);

  return badges;
};
