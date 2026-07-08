import { Activity, AlertTriangle, Filter, ShieldCheck } from 'lucide-react';
import { AUDIT_LOGS } from '@/utils/adminMockData';
import { SectionShell, StatusPill, auditSeverityMap, roleConfig } from './shared';

export const ActivityLogsSecurity = () => {
  return (
    <SectionShell
      title="Activity Logs & Security"
      subtitle="Theo dõi audit logs, login history, hành động quan trọng và cảnh báo bất thường"
      icon={Activity}
    >
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <div className="flex items-center gap-2 text-rose-700"><AlertTriangle className="h-5 w-5" /><h3 className="font-extrabold">Suspicious activities</h3></div>
          <p className="mt-2 text-sm text-rose-700">{AUDIT_LOGS.filter(log => log.severity === 'critical').length} critical login/security event đang cần kiểm tra.</p>
        </div>
        <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4">
          <div className="flex items-center gap-2 text-cyan-800"><ShieldCheck className="h-5 w-5" /><h3 className="font-extrabold">Security settings</h3></div>
          <div className="mt-3 space-y-2 text-sm text-cyan-800">
            <label className="flex items-center justify-between gap-3"><span>Bắt buộc MFA cho Host</span><input type="checkbox" defaultChecked /></label>
            <label className="flex items-center justify-between gap-3"><span>Khóa sau 5 lần sai mật khẩu</span><input type="checkbox" defaultChecked /></label>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-slate-800"><Filter className="h-5 w-5" /><h3 className="font-extrabold">Audit coverage</h3></div>
          <p className="mt-2 text-sm text-slate-600">Ghi nhận login, thay đổi role, billing action, phê duyệt Host và cập nhật cấu hình.</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="table-header">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">Severity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {AUDIT_LOGS.map(log => (
              <tr key={log.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-xs text-slate-500">{log.createdAt}</td>
                <td className="px-4 py-3"><p className="font-bold text-slate-900">{log.actor}</p><p className="text-xs text-slate-500">{roleConfig[log.role].label}</p></td>
                <td className="px-4 py-3 text-slate-700">{log.action}</td>
                <td className="px-4 py-3 text-slate-600">{log.target}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{log.ipAddress}</td>
                <td className="px-4 py-3"><StatusPill label={auditSeverityMap[log.severity].label} color={auditSeverityMap[log.severity].color} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionShell>
  );
};
