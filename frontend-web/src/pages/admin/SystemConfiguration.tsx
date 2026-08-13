import { Settings } from 'lucide-react';
import { SYSTEM_SETTINGS } from '@/utils/adminMockData';
import { BillingRulesCard } from './settings/BillingRulesCard';
import { SectionShell, StatusPill } from './shared';

/**
 * Thẻ "Quy tắc tính tiền" trong `SYSTEM_SETTINGS` là mock, nút "Cấu hình" không làm gì.
 * Phần đó giờ đã có màn thật (`BillingRulesCard`) nên lọc bỏ khỏi lưới — để cả hai sẽ
 * có hai thẻ cùng chủ đề nằm cạnh nhau, một thật một giả.
 *
 * Bốn thẻ còn lại vẫn là placeholder cho tính năng chưa làm; giữ nguyên để biết còn nợ gì.
 */
const PLACEHOLDER_SETTINGS = SYSTEM_SETTINGS.filter(s => s.id !== 'billing');

export const SystemConfiguration = () => {
  return (
    <SectionShell
      title="System Configuration"
      subtitle="Quản lý billing rules, service fees, payment methods, contract templates, notification settings và account policies"
      icon={Settings}
    >
      <div className="mb-5">
        <BillingRulesCard />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {PLACEHOLDER_SETTINGS.map(setting => (
          <div key={setting.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-slate-950">{setting.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{setting.description}</p>
              </div>
              <StatusPill label={setting.status} color="bg-white text-slate-700 border border-slate-200" />
            </div>
            <button className="mt-4 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">
              Cấu hình
            </button>
          </div>
        ))}
      </div>
    </SectionShell>
  );
};
