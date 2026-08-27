import { Settings } from 'lucide-react';
import { BillingRulesCard } from './settings/BillingRulesCard';
import { SectionShell } from './shared';

/**
 * Cấu hình hệ thống — CHỈ còn phần chạy thật.
 *
 * Trước 15/08/2026 màn này render thêm 4 thẻ từ `SYSTEM_SETTINGS` (mock trong
 * utils/adminMockData.ts): mỗi thẻ có tiêu đề, mô tả, một nhãn trạng thái và nút
 * "Cấu hình" — nhưng nút đó KHÔNG làm gì cả, và trạng thái là chữ bịa. Nhìn vào tưởng
 * hệ thống có 5 nhóm cấu hình, thực tế chỉ 1 nhóm hoạt động.
 *
 * Các nhóm đã bỏ (chưa có API, ghi lại để không quên là còn nợ):
 *   • Phí dịch vụ · Phương thức thanh toán · Mẫu hợp đồng
 *   • Cấu hình thông báo · Chính sách tài khoản
 * Làm nhóm nào thì thêm lại nhóm đó — kèm API thật, không dựng vỏ trước.
 */
export const SystemConfiguration = () => {
  return (
    <SectionShell
      title="Cấu hình hệ thống"
      subtitle="Quy tắc tính tiền dùng chung cho toàn bộ hoá đơn tiền nhà, điện và nước"
      icon={Settings}
    >
      <BillingRulesCard />
    </SectionShell>
  );
};
