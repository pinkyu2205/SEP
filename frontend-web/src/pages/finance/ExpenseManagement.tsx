import { useEffect, useMemo, useState } from 'react';
import { Plus, Download, Trash2, Wallet, Building2, Receipt, X } from 'lucide-react';
import { MOCK_PROPERTIES } from '../../utils/mockData';
import { formatCurrency } from '../../utils';
import {
  useExpenses, expenseStore, EXPENSE_CATEGORY_META, CURRENT_MONTH,
  type ExpenseCategory,
} from '../../utils/expenseStore';
import { exportToExcel } from '../../utils/exportExcel';
import { hostService } from '../../services/host.service';

const CATEGORY_KEYS = Object.keys(EXPENSE_CATEGORY_META) as ExpenseCategory[];
// Tiền thuê căn (LEASE) do Master Lease quản lý & tính dynamic vào property-pnl →
// không cho host nhập tay để tránh khoản LEASE bị bỏ ngoài đối soát.
const MANUAL_CATEGORY_KEYS = CATEGORY_KEYS.filter(c => c !== 'lease');
const monthLabel = (m: string) => {
  const [y, mo] = m.split('-');
  return `Th${Number(mo)}/${y}`;
};

interface FormState {
  propertyId: string;
  category: ExpenseCategory;
  amount: string;
  month: string;
  note: string;
}

const emptyForm: FormState = {
  propertyId: MOCK_PROPERTIES[0]?.id ?? '',
  category: 'maintenance',
  amount: '',
  month: CURRENT_MONTH,
  note: '',
};

export const ExpenseManagement = () => {
  const expenses = useExpenses();
  // Nạp dữ liệu thật từ BE khi mở trang; lỗi/offline → giữ dữ liệu seed trong store.
  useEffect(() => {
    let active = true;
    hostService.listExpenses()
      .then(list => { if (active && list.length > 0) expenseStore.hydrate(list); })
      .catch(() => { /* offline: dùng store */ });
    return () => { active = false; };
  }, []);

  const [propFilter, setPropFilter] = useState('all');
  const [catFilter, setCatFilter] = useState<'all' | ExpenseCategory>('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const monthExpenses = useMemo(
    () => expenses.filter(e => e.month === CURRENT_MONTH),
    [expenses],
  );

  const totalMonth = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const leaseTotal = monthExpenses.filter(e => e.category === 'lease').reduce((s, e) => s + e.amount, 0);
  const otherTotal = totalMonth - leaseTotal;

  const filtered = useMemo(() => {
    return expenses
      .filter(e => propFilter === 'all' || e.propertyId === propFilter)
      .filter(e => catFilter === 'all' || e.category === catFilter)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [expenses, propFilter, catFilter]);

  const handleSubmit = async () => {
    const amount = parseInt(form.amount.replace(/\D/g, ''), 10);
    if (!form.propertyId || !amount || isNaN(amount)) return;
    const prop = MOCK_PROPERTIES.find(p => p.id === form.propertyId)!;
    const payload = {
      propertyId: prop.id,
      propertyName: prop.name,
      category: form.category,
      amount,
      month: form.month,
      note: form.note.trim() || undefined,
    };
    setForm(emptyForm);
    setShowForm(false);
    try {
      const created = await hostService.createExpense(payload);
      expenseStore.upsert(created);            // dùng item BE trả về (có id thật)
    } catch (e: any) {
      // Chỉ ghi cục bộ khi offline (không có response). Lỗi 4xx/5xx do BE từ chối
      // (vd 422 LEASE) → không thêm dòng rác; interceptor đã hiện toast lỗi.
      if (!e?.response) expenseStore.add(payload);
    }
  };

  const handleDelete = (id: string) => {
    expenseStore.remove(id);                    // optimistic
    hostService.deleteExpense(id).catch(() => { /* offline: đã xóa cục bộ */ });
  };

  const handleExport = () => {
    exportToExcel('ChiPhi_HoangBinhLand', [{
      name: `Chi phí ${monthLabel(CURRENT_MONTH)}`,
      rows: filtered.map(e => ({
        'Tháng': monthLabel(e.month),
        'Bất động sản': e.propertyName,
        'Loại chi phí': EXPENSE_CATEGORY_META[e.category].label,
        'Số tiền (₫)': e.amount,
        'Ghi chú': e.note ?? '',
        'Ngày ghi nhận': e.createdAt,
      })),
    }]);
  };

  const kpis = [
    { label: `Tổng chi phí ${monthLabel(CURRENT_MONTH)}`, value: formatCurrency(totalMonth), icon: Wallet, bg: 'bg-rose-50', color: 'text-rose-600', border: 'border-l-rose-500' },
    { label: 'Chi phí thuê nhà', value: formatCurrency(leaseTotal), icon: Building2, bg: 'bg-indigo-50', color: 'text-indigo-600', border: 'border-l-indigo-500' },
    { label: 'Chi phí khác', value: formatCurrency(otherTotal), icon: Receipt, bg: 'bg-amber-50', color: 'text-amber-600', border: 'border-l-amber-500' },
    { label: 'Số khoản chi', value: String(monthExpenses.length), icon: Receipt, bg: 'bg-slate-50', color: 'text-slate-600', border: 'border-l-slate-400' },
  ];

  return (
    <div className="space-y-6">
      {/* Tiêu đề */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ghi nhận Chi phí</h1>
          <p className="text-sm text-slate-500 mt-1">Chi phí thuê nhà lớn & các chi phí vận hành theo từng bất động sản</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
            <Download className="w-4 h-4" /> Xuất Excel
          </button>
          <button onClick={() => { setForm(emptyForm); setShowForm(true); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-5 h-5" /> Thêm chi phí
          </button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <div key={k.label} className={`bg-white rounded-xl shadow-sm border border-slate-100 border-l-4 ${k.border} p-5`}>
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{k.label}</p>
                <p className={`text-xl font-bold mt-1 ${k.color} truncate`}>{k.value}</p>
              </div>
              <div className={`${k.bg} p-3 rounded-xl flex-shrink-0 ml-2`}>
                <k.icon className={`w-5 h-5 ${k.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bộ lọc + bảng */}
      <div className="card overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Danh sách chi phí ({filtered.length})</h2>
          <div className="flex flex-wrap gap-2">
            <select value={propFilter} onChange={e => setPropFilter(e.target.value)} className="text-xs font-medium rounded-lg border border-slate-200 px-3 py-1.5 bg-white text-slate-700">
              <option value="all">Tất cả BĐS</option>
              {MOCK_PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={catFilter} onChange={e => setCatFilter(e.target.value as any)} className="text-xs font-medium rounded-lg border border-slate-200 px-3 py-1.5 bg-white text-slate-700">
              <option value="all">Tất cả loại</option>
              {CATEGORY_KEYS.map(c => <option key={c} value={c}>{EXPENSE_CATEGORY_META[c].label}</option>)}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-600">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-medium border-b border-slate-100">
              <tr>
                <th className="px-5 py-3.5">Tháng</th>
                <th className="px-5 py-3.5">Bất động sản</th>
                <th className="px-5 py-3.5">Loại chi phí</th>
                <th className="px-5 py-3.5 text-right">Số tiền</th>
                <th className="px-5 py-3.5">Ghi chú</th>
                <th className="px-5 py-3.5 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(e => {
                const meta = EXPENSE_CATEGORY_META[e.category];
                return (
                  <tr key={e.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5 text-slate-500">{monthLabel(e.month)}</td>
                    <td className="px-5 py-3.5 font-medium text-slate-900">{e.propertyName}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${meta.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} /> {meta.label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-rose-600 tabular-nums">{formatCurrency(e.amount)}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-500 max-w-[220px] truncate">{e.note ?? '—'}</td>
                    <td className="px-5 py-3.5 text-center">
                      <button onClick={() => handleDelete(e.id)} className="text-slate-300 hover:text-rose-500 transition-colors" title="Xóa">
                        <Trash2 className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400 text-sm">Chưa có chi phí nào phù hợp bộ lọc.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal thêm chi phí */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-slate-900">Thêm khoản chi phí</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Bất động sản</label>
                <select value={form.propertyId} onChange={e => setForm(f => ({ ...f, propertyId: e.target.value }))} className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500">
                  {MOCK_PROPERTIES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Loại chi phí</label>
                <div className="grid grid-cols-3 gap-2">
                  {MANUAL_CATEGORY_KEYS.map(c => (
                    <button key={c} type="button" onClick={() => setForm(f => ({ ...f, category: c }))}
                      className={`text-xs font-medium px-2 py-2 rounded-lg border transition-colors ${form.category === c ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                      {EXPENSE_CATEGORY_META[c].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Số tiền (₫)</label>
                  <input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} inputMode="numeric" placeholder="0" className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tháng</label>
                  <input type="month" value={form.month} onChange={e => setForm(f => ({ ...f, month: e.target.value }))} className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Ghi chú</label>
                <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="VD: Tiền thuê nhà tháng 5..." className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-colors">Hủy</button>
              <button onClick={handleSubmit} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 transition-colors shadow-sm">Lưu chi phí</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
