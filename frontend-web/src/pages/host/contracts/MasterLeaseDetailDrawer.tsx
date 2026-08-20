import { type ReactNode } from 'react';
import {
  Building2, CalendarClock, FileText, Handshake, MapPin, TrendingDown,
  TrendingUp, UserRound, Users, Wallet, X,
} from 'lucide-react';
import { Overlay } from '@/components/Overlay';
import { formatCurrency } from '@/utils';
import type { PropertyResponse } from '@/types/api.types';
import type { HostContractDto, MasterLease } from '@/services/host.service';
import { daysLeft, fmtDate, statusMeta, termLabel } from '@/components/contract/contractLabels';

/**
 * Chi tiết MỘT master lease (hợp đồng Host thuê lại nhà của chủ nhà) — chỉ có ở cổng Host.
 *
 * Khác hẳn hợp đồng khách thuê: ở đây Host là bên ĐI THUÊ, nên câu hỏi quan trọng nhất
 * không phải "khách là ai" mà là **căn này có lãi không**. Vì vậy drawer đặt phần "Hiệu
 * quả khai thác" ngang hàng với điều khoản: tiền thuê vào mỗi tháng so với tổng tiền
 * đang cho thuê ra từ các hợp đồng khách còn hiệu lực trong chính căn đó.
 *
 * BE đã dọn 4 field từng hard-code (ownerPhone/deposit/paymentDay/escalationPct) và mở thêm
 * mã hợp đồng, file scan, tổng tiền cả kỳ — 19/08/2026. Đừng thêm lại mấy field đã bỏ nếu
 * entity InboundContract vẫn chưa có cột thật cho chúng.
 *
 * Phần còn lại được ghép từ dữ liệu trang đã có sẵn — bản ghi Property và danh sách hợp
 * đồng khách thuê — chứ không gọi thêm endpoint nào, nên mở drawer là hiện ngay.
 */

export const MASTER_LEASE_STATUS: Record<string, { label: string; color: string; dot: string }> = {
  ACTIVE: { label: 'Đang hiệu lực', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  EXPIRING: { label: 'Sắp hết hạn', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  EXPIRED: { label: 'Hết hạn', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  TERMINATED: { label: 'Đã chấm dứt', color: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
};

export const leaseStatusMeta = (status?: string) =>
  MASTER_LEASE_STATUS[status ?? ''] ?? { label: status || '—', color: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' };

const Tile = ({ label, value, hint, tone = 'slate' }: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose';
}) => {
  const ring: Record<string, string> = {
    slate: 'border-slate-200',
    indigo: 'border-indigo-200 bg-indigo-50/40',
    emerald: 'border-emerald-200 bg-emerald-50/40',
    amber: 'border-amber-200 bg-amber-50/40',
    rose: 'border-rose-200 bg-rose-50/40',
  };
  return (
    <div className={`rounded-xl border bg-white p-3 ${ring[tone]}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-base font-black leading-tight text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] font-medium text-slate-400">{hint}</p>}
    </div>
  );
};

const Card = ({ icon: Icon, title, children }: { icon: typeof Users; title: string; children: ReactNode }) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <h3 className="mb-1 flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-400">
      <Icon className="h-3.5 w-3.5" />
      {title}
    </h3>
    {children}
  </section>
);

const Field = ({ label, value, mono }: { label: string; value?: ReactNode; mono?: boolean }) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
    <span className="shrink-0 text-xs font-semibold text-slate-500">{label}</span>
    <span className={`min-w-0 break-words text-right text-sm font-semibold text-slate-800 ${mono ? 'font-mono text-xs' : ''}`}>
      {value ?? <span className="text-slate-300">—</span>}
    </span>
  </div>
);

export const MasterLeaseDetailDrawer = ({ lease, property, tenantContracts, onClose }: {
  lease: MasterLease;
  property?: PropertyResponse;
  /** Hợp đồng khách thuê của CHÍNH căn này — để tính doanh thu cho thuê ra. */
  tenantContracts: HostContractDto[];
  onClose: () => void;
}) => {
  const status = leaseStatusMeta(lease.status);
  const remaining = daysLeft(lease.endDate);
  const houseName = property?.propertyName ?? `BĐS #${lease.propertyId}`;

  // BE dựng monthlyRent = totalRentAmount ÷ số tháng, nên nhân ngược lại ra tổng cả kỳ.
  const months = (() => {
    const a = new Date(lease.startDate?.slice(0, 10) ?? '');
    const b = new Date(lease.endDate?.slice(0, 10) ?? '');
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
    return Math.max(0, Math.round((b.getTime() - a.getTime()) / (30.44 * 86_400_000)));
  })();

  // Chỉ tính HĐ còn hiệu lực: HĐ nháp/đã chấm dứt không sinh ra đồng nào.
  const runningContracts = tenantContracts.filter((c) => c.status === 'ACTIVE');
  const revenue = runningContracts.reduce((sum, c) => sum + (c.rentAmount ?? 0), 0);
  const margin = revenue - (lease.monthlyRent ?? 0);
  const marginPct = lease.monthlyRent ? Math.round((margin / lease.monthlyRent) * 100) : null;
  const profitable = margin >= 0;

  return (
    <Overlay>
      <div className="fixed inset-0 z-50 flex justify-end">
        <button aria-label="Đóng" onClick={onClose} className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" />

        <div className="relative flex h-full w-full max-w-[720px] flex-col bg-slate-50 shadow-2xl">
          {/* ── Header ── */}
          <div className="border-b border-slate-200 bg-white px-6 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 text-white shadow-lg shadow-cyan-500/25">
                  <Handshake className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-lg font-black leading-tight text-slate-950">{houseName}</p>
                  <p className="mt-0.5 truncate text-sm font-medium text-slate-500">
                    Master lease · Chủ nhà {lease.ownerName || '—'}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${status.color}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                      {status.label}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                      Host là bên đi thuê
                    </span>
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* ── Nội dung ── */}
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Thuê vào / tháng" value={formatCurrency(lease.monthlyRent ?? 0)} tone="indigo"
                hint="Tổng tiền cả kỳ ÷ số tháng" />
              <Tile label="Tổng cả kỳ" value={formatCurrency(lease.totalRentAmount ?? (lease.monthlyRent ?? 0) * Math.max(1, months))} />
              <Tile label="Thời hạn" value={termLabel(lease)}
                hint={lease.endDate ? `Hết ${fmtDate(lease.endDate)}` : 'Chưa có ngày kết thúc'} />
              {lease.status === 'ACTIVE' || lease.status === 'EXPIRING' ? (
                <Tile
                  label="Còn lại"
                  tone={remaining == null ? 'slate' : remaining < 0 ? 'rose' : remaining <= 90 ? 'amber' : 'emerald'}
                  value={remaining == null ? '—' : remaining < 0 ? `Quá ${-remaining} ngày` : `${remaining} ngày`}
                  hint={remaining != null && remaining >= 0 && remaining <= 90 ? 'Cần đàm phán gia hạn' : undefined}
                />
              ) : (
                <Tile label="Tình trạng" tone={lease.status === 'TERMINATED' ? 'rose' : 'slate'} value={status.label} />
              )}
            </div>

            {/* ── Hiệu quả khai thác ────────────────────────────────────────
                Câu hỏi thật sự của Host: căn này đang lãi hay lỗ mỗi tháng. */}
            <div className={`rounded-2xl border p-4 ${profitable ? 'border-emerald-200 bg-emerald-50/50' : 'border-rose-200 bg-rose-50/50'}`}>
              <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-400">
                {profitable ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> : <TrendingDown className="h-3.5 w-3.5 text-rose-500" />}
                Hiệu quả khai thác mỗi tháng
              </h3>

              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-white/80 px-2 py-2.5">
                  <p className="text-[11px] font-semibold text-slate-500">Cho thuê ra</p>
                  <p className="mt-0.5 text-sm font-black text-slate-900">{formatCurrency(revenue)}</p>
                </div>
                <div className="rounded-xl bg-white/80 px-2 py-2.5">
                  <p className="text-[11px] font-semibold text-slate-500">Thuê vào</p>
                  <p className="mt-0.5 text-sm font-black text-slate-900">− {formatCurrency(lease.monthlyRent ?? 0)}</p>
                </div>
                <div className={`rounded-xl px-2 py-2.5 ${profitable ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                  <p className="text-[11px] font-semibold text-white/80">Chênh lệch</p>
                  <p className="mt-0.5 text-sm font-black text-white">
                    {margin >= 0 ? '+' : '−'}{formatCurrency(Math.abs(margin))}
                  </p>
                </div>
              </div>

              <p className="mt-2 text-xs font-medium text-slate-600">
                {runningContracts.length === 0 ? (
                  <>Chưa có hợp đồng khách thuê nào còn hiệu lực trong căn này — đang lỗ trọn tiền thuê vào.</>
                ) : (
                  <>
                    Từ <b>{runningContracts.length}</b> hợp đồng khách thuê đang chạy
                    {marginPct != null && <> · biên so với tiền thuê vào <b>{marginPct >= 0 ? '+' : ''}{marginPct}%</b></>}
                  </>
                )}
              </p>

              {runningContracts.length > 0 && (
                <ul className="mt-2.5 space-y-1">
                  {runningContracts.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/70 px-3 py-1.5 text-xs">
                      <span className="min-w-0 truncate text-slate-600">
                        <span className="font-mono font-bold text-slate-700">{c.code}</span>
                        {c.roomCode ? ` · Phòng ${c.roomCode}` : ' · Nguyên căn'}
                        {c.lesseeName ? ` · ${c.lesseeName}` : ''}
                      </span>
                      <span className="shrink-0 font-bold tabular-nums text-slate-800">{formatCurrency(c.rentAmount)}</span>
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-2 text-[11px] text-slate-400">
                Chỉ tính tiền phòng theo hợp đồng — chưa trừ chi phí vận hành, sửa chữa, phòng trống.
              </p>
            </div>

            {/* ── Hợp đồng gốc ── */}
            <Card icon={UserRound} title="Hợp đồng với chủ nhà">
              <Field label="Chủ nhà" value={lease.ownerName || undefined} />
              <Field label="Mã hợp đồng" value={lease.contractCode || undefined} mono />
              <Field label="Bản scan" value={
                lease.contractScanUrl
                  ? (
                    <a href={lease.contractScanUrl} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100">
                      <FileText className="h-3.5 w-3.5" /> Mở file hợp đồng gốc
                    </a>
                  )
                  : undefined
              } />
            </Card>

            {/* ── Bất động sản ── */}
            <Card icon={Building2} title="Bất động sản thuê lại">
              <Field label="Tên toà nhà / căn" value={houseName} />
              <Field label="Địa chỉ" value={
                property?.fullAddress || property?.shortAddress
                  ? (
                    <span className="inline-flex items-start gap-1.5">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      {property.fullAddress || property.shortAddress}
                    </span>
                  )
                  : undefined
              } />
              <Field label="Khu vực" value={property?.zoneName || undefined} />
              <Field label="Hình thức khai thác" value={property?.wholeHouse ? 'Cho thuê nguyên căn' : property ? 'Chia phòng cho thuê' : undefined} />
              <Field label="Quy mô" value={
                property
                  ? `${property.totalRooms || 0} phòng${property.totalFloor ?? property.floorCount ? ` · ${property.totalFloor ?? property.floorCount} tầng` : ''}${property.areaSize ? ` · ${property.areaSize} m²` : ''}`
                  : undefined
              } />
              <Field label="Quản lý vận hành" value={property?.operationManagerName || undefined} />
            </Card>

            {/* ── Điều khoản ── */}
            <Card icon={Wallet} title="Điều khoản thuê">
              <Field label="Tiền thuê / tháng" value={formatCurrency(lease.monthlyRent ?? 0)} />
              {/* Lấy thẳng tổng cả kỳ từ BE thay vì nhân ngược monthlyRent × số tháng —
                  monthlyRent vốn là kết quả phép chia nên nhân lại sẽ lệch vài đồng. */}
              <Field label="Tổng tiền cả kỳ" value={
                lease.totalRentAmount != null
                  ? formatCurrency(lease.totalRentAmount)
                  : months > 0 ? formatCurrency((lease.monthlyRent ?? 0) * months) : undefined
              } />
            </Card>

            <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-500">
              Master lease hiện lưu: chủ nhà, mã hợp đồng, tổng tiền thuê, thời hạn và file scan.
              Tiền cọc, ngày thanh toán và điều khoản tăng giá chưa có cột lưu ở backend nên
              không hiển thị — thà thiếu còn hơn in ra số không có thật.
            </p>

            {/* ── Thời hạn ── */}
            <Card icon={CalendarClock} title="Thời hạn hợp đồng">
              <Field label="Bắt đầu" value={lease.startDate ? fmtDate(lease.startDate) : undefined} />
              <Field label="Kết thúc" value={lease.endDate ? fmtDate(lease.endDate) : undefined} />
              <Field label="Tổng thời hạn" value={termLabel(lease)} />
              <Field label="Còn lại" value={
                remaining == null ? undefined : remaining < 0 ? `Đã quá hạn ${-remaining} ngày` : `${remaining} ngày`
              } />
            </Card>

            {/* Hợp đồng khách thuê trong căn — gồm cả HĐ không còn hiệu lực, để thấy lịch sử */}
            {tenantContracts.length > 0 && (
              <Card icon={Users} title={`Hợp đồng khách thuê trong căn (${tenantContracts.length})`}>
                <div className="divide-y divide-slate-100 pt-1">
                  {tenantContracts.map((c) => {
                    const s = statusMeta(c.status);
                    return (
                      <div key={c.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            <span className="font-mono text-xs font-bold text-slate-600">{c.code}</span>
                            {c.lesseeName ? ` · ${c.lesseeName}` : ''}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {c.roomCode ? `Phòng ${c.roomCode}` : 'Nguyên căn'} · {fmtDate(c.startDate || c.moveInDate)} → {fmtDate(c.endDate)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="text-sm font-bold tabular-nums text-slate-700">{formatCurrency(c.rentAmount)}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${s.color}`}>{s.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            <p className="pb-2 text-center text-[11px] text-slate-400">
              Mã hệ thống #{lease.id} · Master lease do Host ký với chủ nhà, tách khỏi hợp đồng khách thuê.
            </p>
          </div>
        </div>
      </div>
    </Overlay>
  );
};
