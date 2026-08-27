import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle, ArrowLeft, Cloud, HardDrive, Loader2, Save, SlidersHorizontal, UserCog,
} from 'lucide-react';
import {
  DEFAULT_PRICING_CONFIG, blendedManagerCost, costPerPropertyOf, managerPayroll,
  pendingCountByManager, pricingConfigService, propertyCountByManager,
  type ManagerPayroll, type PricingConfig, type PricingConfigSource, type ZoneManagerLink,
} from '@/services/pricingConfig.service';
import { propertyService } from '@/services/property.service';
import { zoneAssignmentService } from '@/services/zoneAssignment.service';
import { isHostApproved } from '@/pages/host/properties/propertyListState';

/**
 * LƯƠNG QUẢN LÝ VẬN HÀNH — nơi DUY NHẤT sửa và lưu lương.
 *
 * Tách khỏi trang Cấu hình duyệt giá vì hai thứ này có nhịp sống khác hẳn nhau: mục tiêu
 * lợi nhuận vài tháng mới đụng một lần, còn lương thì đổi theo nhân sự — tuyển người, tăng
 * lương, nghỉ việc. Nhét chung một trang thì mỗi lần chỉnh lương lại phải đi qua đúng cái
 * trang đang chứa những con số quyết định giá của toàn hệ thống, rất dễ sửa nhầm.
 *
 * Trang Cấu hình duyệt giá giờ chỉ ĐỌC bảng này để hiển thị.
 *
 * Số nhà phụ trách KHÔNG cho nhập tay — đếm từ bảng phân công khu vực. Nhập tay là hai chỗ
 * nói hai kiểu về cùng một sự thật.
 */

const formatVND = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

const MoneyInput = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
  <div className="relative">
    <input
      type="text"
      inputMode="numeric"
      value={value === 0 ? '' : value.toLocaleString('vi-VN')}
      placeholder="Chưa nhập"
      onChange={(e) => {
        const raw = e.target.value.replace(/\./g, '').replace(/[^0-9]/g, '');
        onChange(raw === '' ? 0 : Number(raw));
      }}
      className="input-field pr-8 text-right font-bold tabular-nums"
    />
    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">đ</span>
  </div>
);

export const ManagerSalaryPage = () => {
  const navigate = useNavigate();
  const [cfg, setCfg] = useState<PricingConfig>(DEFAULT_PRICING_CONFIG);
  const [source, setSource] = useState<PricingConfigSource>('default');
  const [managers, setManagers] = useState<{ id: string; fullName: string }[]>([]);
  const [propsByManager, setPropsByManager] = useState<Record<string, number>>({});
  /** Trong số đó, bao nhiêu căn còn chờ Host duyệt giá — chưa thực sự bàn giao cho quản lý. */
  const [pendingByManager, setPendingByManager] = useState<Record<string, number>>({});
  const [zonesByManager, setZonesByManager] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([
      pricingConfigService.load(),
      propertyService.getManagers().catch(() => [] as { id: string; fullName: string; username: string }[]),
      propertyService.getProperties(0, 500).catch(() => null),
      zoneAssignmentService.list().catch(() => [] as ZoneManagerLink[]),
    ]).then(([{ config, source: s }, mgrs, page, links]) => {
      if (!alive) return;
      setCfg(config);
      setSource(s);
      setManagers(mgrs.map((m) => ({ id: m.id, fullName: m.fullName })));
      setPropsByManager(propertyCountByManager(links, page?.content ?? []));
      setPendingByManager(pendingCountByManager(links, page?.content ?? [], isHostApproved));
      const zones = new Map<string, string[]>();
      links.forEach((l) => {
        zones.set(l.managerId, [...(zones.get(l.managerId) ?? []), l.zoneName || l.zoneId]);
      });
      setZonesByManager(zones);
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const setSalary = (managerId: string, salary: number) =>
    setCfg((c) => {
      const next = { ...c.managerSalaries };
      if (salary > 0) next[managerId] = salary;
      else delete next[managerId];        // xoá trắng ô = chưa nhập, không lưu số 0
      return { ...c, managerSalaries: next };
    });

  const handleSave = async () => {
    setSaving(true);
    const where = await pricingConfigService.save(cfg);
    setSource(where);
    setSaving(false);
    toast.success(where === 'server'
      ? 'Đã lưu bảng lương lên máy chủ.'
      : 'Đã lưu trên máy này — máy chủ chưa có nơi lưu bảng lương.');
  };

  const payroll: ManagerPayroll[] = managerPayroll(cfg, managers, (id) => propsByManager[id] ?? 0);
  const totalSalary = payroll.reduce((s, m) => s + m.salary, 0);
  const totalProps = payroll.reduce((s, m) => s + m.propertyCount, 0);
  const blended = blendedManagerCost(payroll);
  /** Có lương nhưng chưa được giao nhà nào — lương đó chưa vào giá của căn nào cả. */
  const idlePaid = payroll.filter((m) => m.salary > 0 && m.propertyCount === 0);
  const totalPending = Object.values(pendingByManager).reduce((s, n) => s + n, 0);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Đang tải bảng lương…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl pb-16">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900">Lương quản lý vận hành</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Lương ở đây đi thẳng vào giá thuê: mỗi căn gánh <b>lương ÷ số nhà</b> người đó phụ trách.
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${
          source === 'server'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-amber-200 bg-amber-50 text-amber-700'
        }`}>
          {source === 'server' ? <Cloud className="h-3.5 w-3.5" /> : <HardDrive className="h-3.5 w-3.5" />}
          {source === 'server' ? 'Đã đồng bộ máy chủ' : 'Chỉ lưu trên máy này'}
        </span>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
          <UserCog className="h-4 w-4 text-slate-400" /> Bảng lương
        </h2>

        {managers.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-400">
            Chưa có quản lý vận hành nào trong hệ thống.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="pb-2 text-left font-bold">Quản lý</th>
                  <th className="pb-2 text-right font-bold">Lương / tháng</th>
                  <th className="pb-2 text-right font-bold">Phụ trách</th>
                  <th className="pb-2 text-right font-bold">Mỗi nhà gánh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payroll.map((m, i) => (
                  <tr key={m.managerId}>
                    <td className="py-2.5 pr-3">
                      <p className="font-bold text-slate-800">{m.fullName}</p>
                      <p className="text-[11px] text-slate-400">
                        Quản lý số {i + 1}
                        {zonesByManager.get(m.managerId)?.length
                          ? ` · phân công ${zonesByManager.get(m.managerId)!.join(', ')}`
                          : ' · chưa phân công khu vực'}
                      </p>
                    </td>
                    <td className="w-44 py-2.5 pl-2">
                      <MoneyInput value={m.salary} onChange={(v) => setSalary(m.managerId, v)} />
                    </td>
                    {/* "Phụ trách" chứ không phải "đang coi": nhà chờ Host duyệt giá thì chưa
                        bàn giao, quản lý chưa thực sự coi cái gì. Ghi rõ phần chờ duyệt để
                        không đá nhau với màn Khu vực (màn đó đọc `operationManagerId`, nhà
                        chưa duyệt thì trống nên hiện "Chưa gán"). */}
                    <td className="py-2.5 pl-3 text-right">
                      <span className="font-bold tabular-nums text-slate-700">
                        {m.propertyCount} nhà
                      </span>
                      {(pendingByManager[m.managerId] ?? 0) > 0 && (
                        <p className="text-[10px] font-semibold text-amber-600">
                          {pendingByManager[m.managerId]} chờ duyệt giá
                        </p>
                      )}
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      {m.salary > 0 && m.propertyCount === 0 ? (
                        <span className="text-[11px] font-bold text-amber-600">chưa có nhà</span>
                      ) : (
                        <span className="font-black tabular-nums text-indigo-700">
                          {formatVND(costPerPropertyOf(m))}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200">
                  <td className="pt-2.5 font-bold text-slate-700">Tổng quỹ lương</td>
                  <td className="pt-2.5 text-right font-black tabular-nums text-slate-900">
                    {formatVND(totalSalary)}
                  </td>
                  <td className="pt-2.5 text-right font-bold tabular-nums text-slate-700">{totalProps} nhà</td>
                  <td className="pt-2.5 text-right font-black tabular-nums text-indigo-700">
                    {formatVND(blended)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {idlePaid.length > 0 && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
            <b>{idlePaid.map((m) => m.fullName).join(', ')}</b> đã có lương nhưng chưa phụ trách nhà nào,
            nên lương đó <b>chưa được tính vào giá của căn nào cả</b> — công ty đang tự chịu
            {' '}{formatVND(idlePaid.reduce((s, m) => s + m.salary, 0))}/tháng. Gán khu vực cho họ ở
            {' '}<b>Khu vực &amp; Quản lý</b>.
          </p>
        )}

        {/* Cột "Phụ trách" đếm theo BẢNG PHÂN CÔNG KHU VỰC, còn màn Khu vực đọc
            `property.operationManagerId` — nhà chỉ nhận id đó SAU khi Host duyệt giá. Hai
            màn vì thế hiện khác nhau khi còn nhà chờ duyệt, và nếu không nói ra thì trông
            như hệ thống tự mâu thuẫn. */}
        {totalPending > 0 && (
          <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            Đang có <b>{totalPending} nhà chờ Host duyệt giá</b>. Chúng được tính vào mẫu số chia
            lương vì quản lý khu vực sẽ nhận chúng, nhưng <b>chưa bàn giao</b> — nên màn
            {' '}<b>Khu vực &amp; Quản lý</b> vẫn hiện &quot;Chưa gán&quot;. Hai màn không mâu thuẫn:
            một bên là <u>phân công khu vực</u>, một bên là <u>nhà đã thực sự về tay quản lý</u>.
          </p>
        )}

        {/* Đánh đổi đã biết của cách chia theo số nhà thực — nói trước, đừng để Host phát
            hiện qua việc khách hỏi vì sao hai căn giống nhau khác giá. */}
        <div className="mt-3 flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-slate-400" />
          <p className="text-xs leading-relaxed text-slate-600">
            Mẫu số là <b>số nhà đang phụ trách</b>, nên nó đổi mỗi khi khu vực nhận thêm nhà: coi 1 nhà
            thì căn đó gánh trọn lương, tới căn thứ 5 chỉ còn 1/5. Giá của căn <b>đã duyệt</b> giữ nguyên
            theo mức lúc duyệt — nên căn duyệt sớm gánh nhiều hơn căn duyệt muộn. Đổi lại, quỹ lương
            luôn được thu hồi đủ và bạn không phải đoán trước tháng này admin sẽ gửi bao nhiêu nhà.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Đang lưu…' : 'Lưu bảng lương'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/host/pricing-config')}
            className="flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700"
          >
            <SlidersHorizontal className="h-4 w-4" /> Cấu hình duyệt giá
          </button>
          <button
            type="button"
            onClick={() => navigate('/host/zones')}
            className="flex items-center justify-center gap-1.5 px-2 py-2.5 text-sm font-bold text-slate-500 transition hover:text-indigo-600"
          >
            <ArrowLeft className="h-4 w-4" /> Khu vực &amp; Quản lý
          </button>
        </div>
      </section>
    </div>
  );
};
