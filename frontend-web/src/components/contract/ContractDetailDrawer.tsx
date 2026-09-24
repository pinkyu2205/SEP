import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle, Banknote, Building2, CalendarClock, Camera, Droplets, FileText, Info,
  Loader2, MapPin, Package, ScrollText, StickyNote, User, UserCog, Users, Wallet, X, Zap,
} from 'lucide-react';
import { Overlay } from '@/components/Overlay';
import { MaskedField } from '@/components/MaskedField';
import { tenantService } from '@/services/tenant.service';
import { openContractBlob } from '@/utils/contractFile';
import { formatCurrency } from '@/utils';
import type { PropertyResponse, TenantContractResponse } from '@/types/api.types';
import {
  EQUIPMENT_CONDITION, ESCALATION_LABEL, daysLeft, depositMonthsLabel,
  fmtDate, fmtDateTime, isEndedContract, isNeverOnboarded, isOnboardStatus, paymentMeta, snapshotToLines,
  statusMeta, termLabel, terminationTypeLabel,
} from './contractLabels';

/**
 * Chi tiết MỘT hợp đồng thuê — DÙNG CHUNG cổng Admin và cổng Host, đọc-là-chính.
 *
 * Gom về một chỗ toàn bộ thứ vốn nằm rải rác trong hồ sơ hợp đồng: khách chính + người
 * ở cùng, căn/phòng và ai đang vận hành nó, tiền (thuê · cọc · trạng thái thu), các mốc
 * thời gian, và quan trọng nhất là **biên bản bàn giao lúc đón khách** — chỉ số điện
 * nước chốt đầu kỳ, ảnh mặt đồng hồ, ảnh hiện trạng phòng, nội thất giao kèm. Thiếu mấy
 * thứ đó thì lúc khách trả phòng không còn căn cứ đối chiếu để trừ cọc, nên drawer nói
 * thẳng phần nào trống thay vì lặng lẽ bỏ qua.
 *
 * ⚠️ Hai cổng lấy danh sách từ hai endpoint khác nhau (`/tenant-contracts` cho admin,
 * `/host/contracts` cho host) và **bản rút gọn của host thiếu rất nhiều field**. Nên
 * drawer nhận `contract` là một `Partial<TenantContractResponse>` để vẽ ngay, rồi gọi
 * `GET /tenant-contracts/{id}` đắp chi tiết đầy đủ lên trên. Endpoint đó hiện chặn
 * ROLE_OWNER (403) — hỏng thì giữ nguyên phần đã có và hiện `blockedNote` thay vì báo
 * "không có dữ liệu", để không đổ oan cho quản lý là chưa lập biên bản.
 *
 * Drawer là màn ĐỌC thuần: không có nút thao tác nào. Sửa hợp đồng nháp nằm ở luồng
 * onboarding, gia hạn/chấm dứt là việc của quản lý vận hành trên mobile, và Host thì
 * không còn duyệt giá nữa. Dữ liệu riêng theo vai chèn vào qua `extra`.
 */

/** Dữ liệu tối thiểu để mở drawer — phần còn lại tự nạp thêm. */
export type ContractDetailSeed = Partial<TenantContractResponse> & { id: number };

/** Ô số liệu lớn ở đầu drawer. */
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

const Card = ({ icon: Icon, title, action, children }: {
  icon: typeof User;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="mb-1 flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-slate-400">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h3>
      {action}
    </div>
    {children}
  </section>
);

/** Một dòng "nhãn — giá trị". Giá trị rỗng vẫn hiện gạch ngang để thấy chỗ nào còn thiếu. */
const Field = ({ label, value, mono }: { label: string; value?: ReactNode; mono?: boolean }) => (
  <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
    <span className="shrink-0 text-xs font-semibold text-slate-500">{label}</span>
    <span className={`min-w-0 break-words text-right text-sm font-semibold text-slate-800 ${mono ? 'font-mono text-xs' : ''}`}>
      {value ?? <span className="text-slate-300">—</span>}
    </span>
  </div>
);

const orDash = (v?: string | number | null): ReactNode =>
  v === null || v === undefined || v === '' ? undefined : String(v);

export const ContractDetailDrawer = ({
  contract, property, propertyName, onClose, blockedNote, extra,
}: {
  /** Bản ghi từ danh sách — vẽ ngay, sau đó được bổ sung bằng chi tiết đầy đủ. */
  contract: ContractDetailSeed;
  /** Có thì hiện thêm địa chỉ / khu vực / quản lý khu vực. */
  property?: PropertyResponse;
  /** Dùng khi chỉ biết TÊN nhà mà không có bản ghi Property (trường hợp cổng Host). */
  propertyName?: string;
  onClose: () => void;
  /** Câu giải thích khi máy chủ không cho vai này đọc hồ sơ đầy đủ. */
  blockedNote?: string;
  /** Khối thông tin riêng theo vai, chèn sau phần Tài chính. */
  extra?: ReactNode;
}) => {
  const [detail, setDetail] = useState<ContractDetailSeed>(contract);
  const [loading, setLoading] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setDetail(contract);
    setBlocked(false);
    // `/host/contracts` trả id dạng chuỗi — nếu không ép được về số thì không có gì để
    // hỏi BE, cứ vẽ bằng phần đã có thay vì gọi `/tenant-contracts/NaN`.
    if (!Number.isFinite(contract.id)) { setBlocked(true); return; }
    setLoading(true);
    tenantService.getById(contract.id, { silent: true })
      .then((full) => { if (alive) setDetail((prev) => ({ ...prev, ...full })); })
      .catch(() => { if (alive) setBlocked(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [contract]);

  const status = statusMeta(detail.status);
  const remaining = daysLeft(detail.endDate);
  const payment = paymentMeta(detail);
  const houseName = property?.propertyName ?? propertyName ?? `Nhà #${detail.propertyId ?? '—'}`;

  const hasFile = !!(detail.contractFileAvailable || detail.draftContractFileUrl || detail.documentUrl || detail.pdfUrl);

  const openFile = async () => {
    setFileBusy(true);
    try {
      const blob = await tenantService.viewContractDocument(detail.id);
      openContractBlob(blob, detail.contractCode);
    } catch {
      // Interceptor api.ts đã toast lỗi thật (vd 422 khi BE chưa render file).
    } finally {
      setFileBusy(false);
    }
  };

  // Ảnh hiện trạng phòng: bản mới có kèm thời điểm chụp, bản cũ chỉ có URL.
  const photos = detail.roomConditionPhotos?.length
    ? detail.roomConditionPhotos
    : (detail.roomConditionUrls ?? []).map((url) => ({ url, capturedAt: undefined }));

  const meters = [
    {
      key: 'electric', label: 'Chỉ số điện đầu kỳ', unit: 'kWh', icon: Zap, tint: 'text-amber-500',
      value: detail.initialElectricReading, img: detail.electricMeterImageUrl, at: detail.electricMeterCapturedAt,
    },
    {
      key: 'water', label: 'Chỉ số nước đầu kỳ', unit: 'm³', icon: Droplets, tint: 'text-sky-500',
      value: detail.initialWaterReading, img: detail.waterMeterImageUrl, at: detail.waterMeterCapturedAt,
    },
  ];
  const hasHandover = meters.some((m) => m.value != null || m.img) || photos.length > 0 || !!detail.roomConditionNote;
  // Chỉ HĐ đã đón khách mới ĐÁNG LẼ phải có biên bản. Nháp/chờ kích hoạt thì trống là
  // đúng quy trình — cảnh báo ở đó chỉ tổ gây nhiễu.
  //
  // TERMINATED/EXPIRED KHÔNG mặc nhiên là "đã đón khách": hợp đồng ký/nhập rồi huỷ trước
  // khi bàn giao cũng mang đúng hai trạng thái đó. Vơ hết vào thì màn hình khẳng định
  // "Hợp đồng đã đón khách nhưng chưa có biên bản bàn giao" cho một hợp đồng chưa hề có ai
  // dọn vào ở — sai sự thật, lại còn giục quản lý đi bổ sung ảnh cho hợp đồng đã chết.
  const handoverExpected = detail.status === 'ACTIVE'
    || (isEndedContract(detail.status) && !isNeverOnboarded(detail));

  const equipments = detail.equipmentList?.length ? detail.equipmentList : detail.availableEquipmentList ?? [];
  const snapshotLines = equipments.length === 0 ? snapshotToLines(detail.equipmentSnapshot) : [];

  const members = detail.householdMembers ?? [];

  /** Máy chủ chặn đọc hồ sơ đầy đủ → nói rõ là "chưa xem được", không phải "không có". */
  const restricted = blocked && !!blockedNote;

  return (
    <Overlay>
      <div className="fixed inset-0 z-50 flex justify-end">
        <button aria-label="Đóng" onClick={onClose} className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" />

        <div className="relative flex h-full w-full max-w-[720px] flex-col bg-slate-50 shadow-2xl">
          {/* ── Header ─────────────────────────────────────────────────────── */}
          <div className="border-b border-slate-200 bg-white px-6 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/25">
                  <FileText className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-mono text-lg font-black leading-tight text-slate-950">
                    {detail.contractCode || `HĐ #${detail.id}`}
                  </p>
                  <p className="mt-0.5 truncate text-sm font-medium text-slate-500">
                    {detail.tenantFullName || 'Chưa có khách'} · {houseName}
                    {detail.roomNumber ? ` · Phòng ${detail.roomNumber}` : ' · Nguyên căn'}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${status.color}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                      {status.label}
                    </span>
                    {payment && (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${payment.color}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${payment.dot}`} />
                        {payment.label}
                      </span>
                    )}
                    {loading && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                        <Loader2 className="h-3 w-3 animate-spin" /> Đang tải chi tiết…
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={onClose} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            {hasFile && (
              <button onClick={openFile} disabled={fileBusy} className="btn-secondary mt-3 inline-flex items-center gap-2">
                {fileBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScrollText className="h-4 w-4" />}
                {fileBusy ? 'Đang mở file…' : 'Xem file hợp đồng'}
              </button>
            )}
          </div>

          {/* ── Nội dung ───────────────────────────────────────────────────── */}
          <div className="flex-1 space-y-3 overflow-y-auto p-5">
            {restricted && (
              <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-600">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>{blockedNote}</span>
              </div>
            )}

            {/* Bốn con số quyết định nhất, đọc trong một liếc mắt */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Giá thuê / tháng" value={formatCurrency(detail.rentAmount ?? 0)} tone="indigo"
                hint={detail.listedPrice && detail.listedPrice !== detail.rentAmount
                  ? `Niêm yết ${formatCurrency(detail.listedPrice)}` : undefined} />
              <Tile label="Tiền cọc" value={detail.deposit ? formatCurrency(detail.deposit) : '—'}
                hint={depositMonthsLabel(detail) || undefined} />
              <Tile label="Thời hạn" value={termLabel(detail)}
                hint={detail.endDate ? `Hết ${fmtDate(detail.endDate)}` : 'Chưa có ngày kết thúc'} />
              {/* "Còn lại" chỉ có nghĩa với HĐ đang chạy — nháp thì chưa tính, đã kết
                  thúc thì không còn gì để đếm. */}
              {detail.status === 'ACTIVE' ? (
                <Tile
                  label="Còn lại"
                  tone={remaining == null ? 'slate' : remaining < 0 ? 'rose' : remaining <= 60 ? 'amber' : 'emerald'}
                  value={remaining == null ? '—' : remaining < 0 ? `Quá ${-remaining} ngày` : `${remaining} ngày`}
                  hint={remaining != null && remaining >= 0 && remaining <= 60 ? 'Cần chốt gia hạn' : undefined}
                />
              ) : (
                <Tile
                  label="Tình trạng"
                  tone={detail.status === 'TERMINATED' ? 'rose' : 'slate'}
                  value={status.label}
                  hint={isOnboardStatus(detail.status) || detail.status === 'PENDING' ? 'Chưa bắt đầu tính thời hạn' : undefined}
                />
              )}
            </div>

            {/* Chấm dứt — đặt lên đầu vì nó đổi ý nghĩa của mọi thông tin bên dưới */}
            {detail.status === 'TERMINATED' && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
                <h3 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-rose-500">
                  <AlertTriangle className="h-3.5 w-3.5" /> Hợp đồng đã chấm dứt
                </h3>
                {detail.terminationType || detail.terminatedAt || detail.terminationReason ? (
                  <>
                    <p className="mt-1.5 text-sm font-black text-rose-700">{terminationTypeLabel(detail.terminationType)}</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">Thời điểm: {fmtDateTime(detail.terminatedAt)}</p>
                    {detail.terminationReason && (
                      <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-sm text-slate-700">
                        <span className="font-bold">Lý do: </span>{detail.terminationReason}
                      </p>
                    )}
                    {detail.terminationType === 'NO_SHOW' && (
                      <p className="mt-2 text-xs font-medium text-rose-600">
                        Hệ thống tự huỷ do quá 10 ngày kể từ ngày nhận phòng mà khách không đến.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-1.5 text-xs text-slate-500">
                    {restricted ? 'Chưa xem được lý do chấm dứt.' : 'Không có ghi chú lý do chấm dứt.'}
                  </p>
                )}
              </div>
            )}

            {/* ── Khách thuê ── */}
            <Card icon={User} title="Khách thuê chính">
              <Field label="Họ và tên" value={orDash(detail.tenantFullName)} />
              <Field label="Số điện thoại" value={
                detail.tenantPhone
                  ? <MaskedField value={detail.tenantPhone} emptyText="—" head={3} tail={2} className="text-sm" />
                  : undefined
              } />
              <Field label="Số CCCD" value={
                detail.tenantCccd
                  ? <MaskedField value={detail.tenantCccd} emptyText="—" head={3} tail={3} className="text-sm" />
                  : undefined
              } />
              <Field label="Ngày sinh" value={detail.tenantDateOfBirth ? fmtDate(detail.tenantDateOfBirth) : undefined} />
              <Field label="Ngày cấp CCCD" value={detail.tenantCccdIssueDate ? fmtDate(detail.tenantCccdIssueDate) : undefined} />
              <Field label="Nơi cấp CCCD" value={orDash(detail.tenantCccdIssuePlace)} />
              <Field label="Hộ khẩu thường trú" value={orDash(detail.tenantPermanentAddress)} />
              <Field label="Tài khoản đăng nhập" value={orDash(detail.tenantUsername)} mono />
            </Card>

            {/* ── Người ở cùng ── */}
            {members.length > 0 && (
              <Card icon={Users} title={`Người ở cùng (${members.length})`}>
                <div className="space-y-2 pt-1">
                  {members.map((m, i) => (
                    <div key={`${m.fullName}-${i}`} className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2">
                      <p className="text-sm font-bold text-slate-800">
                        {m.fullName}
                        {m.relation && <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500">{m.relation}</span>}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-slate-500">
                        {m.dateOfBirth && <span>Sinh {fmtDate(m.dateOfBirth)}</span>}
                        {m.phone && <MaskedField value={m.phone} prefix="SĐT" emptyText="" head={3} tail={2} className="text-xs" />}
                        {m.cccd && <MaskedField value={m.cccd} prefix="CCCD" emptyText="" head={3} tail={3} className="text-xs" />}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* ── Bất động sản & phân công ── */}
            <Card icon={Building2} title="Bất động sản & phân công">
              <Field label="Toà nhà / căn" value={houseName} />
              <Field label="Phạm vi thuê" value={detail.roomNumber ? `Phòng ${detail.roomNumber}` : 'Nguyên căn'} />
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
              <Field label="Khu vực" value={orDash(property?.zoneName)} />
              <Field label="Quản lý vận hành khu vực" value={
                property?.operationManagerName
                  ? <span className="inline-flex items-center gap-1.5"><UserCog className="h-3.5 w-3.5 text-slate-400" />{property.operationManagerName}</span>
                  : undefined
              } />
              {/*
                Hai dòng khác nhau, đừng gộp:
                · `assignedManager` = người phụ trách HIỆN TẠI, bị ghi đè mỗi lần đổi quản lý
                  khu vực (`updateAssignedManagerByZoneId`).
                · `onboardedByManager` = người THỰC SỰ đón khách, ghi một lần lúc onboard và
                  không bao giờ đổi (BE thêm 20/08/2026).
                HĐ tạo trước 20/08/2026 không có dữ liệu người đón khách — ẩn dòng đó đi thay
                vì hiện gạch ngang, để không gợi ý là dữ liệu bị thiếu.
              */}
              <Field label="Quản lý phụ trách hiện tại" value={orDash(detail.assignedManagerName)} />
              {detail.onboardedByManagerName && (
                <Field label="Người đón khách" value={
                  <span className="inline-flex flex-wrap items-center gap-x-1.5">
                    <UserCog className="h-3.5 w-3.5 text-slate-400" />
                    {detail.onboardedByManagerName}
                    {detail.onboardedByManagerPhone && (
                      <span className="text-slate-400">· {detail.onboardedByManagerPhone}</span>
                    )}
                    {detail.onboardedAt && (
                      <span className="text-slate-400">· {fmtDate(detail.onboardedAt)}</span>
                    )}
                  </span>
                } />
              )}
              <Field label="Ngày hẹn đón khách" value={detail.expectedReceptionDate ? fmtDate(detail.expectedReceptionDate) : undefined} />
            </Card>

            {/* ── Mốc thời gian ── */}
            <Card icon={CalendarClock} title="Mốc thời gian">
              <Field label="Ngày nhận phòng" value={detail.moveInDate ? fmtDate(detail.moveInDate) : undefined} />
              <Field label="Hiệu lực từ" value={detail.startDate ? fmtDate(detail.startDate) : undefined} />
              <Field label="Hiệu lực đến" value={detail.endDate ? fmtDate(detail.endDate) : undefined} />
              <Field label="Thời hạn thuê" value={termLabel(detail)} />
              <Field label="Ngày ký" value={detail.signedAt ? fmtDateTime(detail.signedAt) : undefined} />
            </Card>

            {/* ── Tài chính ── */}
            <Card icon={Wallet} title="Tài chính">
              <Field label="Giá thuê / tháng" value={formatCurrency(detail.rentAmount ?? 0)} />
              {detail.listedPrice != null && detail.rentAmount != null && (
                <Field label="Giá niêm yết" value={
                  <span className={detail.listedPrice !== detail.rentAmount ? 'text-amber-600' : undefined}>
                    {formatCurrency(detail.listedPrice)}
                    {detail.listedPrice !== detail.rentAmount && (
                      <span className="ml-1.5 text-[11px] font-bold">
                        ({detail.rentAmount > detail.listedPrice ? '+' : '−'}
                        {formatCurrency(Math.abs(detail.rentAmount - detail.listedPrice))} so với giá chốt)
                      </span>
                    )}
                  </span>
                } />
              )}
              <Field label="Tiền cọc" value={
                detail.deposit
                  ? <span className="inline-flex items-center gap-1.5">
                      <Banknote className="h-3.5 w-3.5 text-slate-400" />{formatCurrency(detail.deposit)}
                      {depositMonthsLabel(detail) && <span className="text-[11px] font-medium text-slate-400">{depositMonthsLabel(detail)}</span>}
                    </span>
                  : undefined
              } />
              <Field label="Trạng thái thu tiền" value={
                payment
                  ? <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${payment.color}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${payment.dot}`} />{payment.label}
                    </span>
                  : orDash(detail.paymentStatus)
              } />
              <Field label="Điều khoản tăng giá" value={
                detail.rentEscalationType
                  ? <>
                      {ESCALATION_LABEL[detail.rentEscalationType] ?? detail.rentEscalationType}
                      {(detail.rentEscalationPercent ?? 0) > 0 && ` · ${detail.rentEscalationPercent}%/năm`}
                    </>
                  : undefined
              } />
              {/* Mốc tăng kế tiếp — lấy THẲNG từ máy chủ, không tự suy.
                  Quy tắc ân hạn + chống áp trùng nằm ở BE (`AnnualCalendarEscalation`); FE
                  tính lại là có ngày lệch với con số máy chủ dùng để thu tiền, mà đây là
                  dòng khách thuê đọc để biết tháng sau phải trả bao nhiêu. */}
              {detail.nextEscalationDate && (
                <Field label="Tăng giá kế tiếp" value={
                  <span className="font-bold text-amber-700">
                    {fmtDate(detail.nextEscalationDate)}
                    {detail.nextEscalationAmount != null && (
                      <> · {formatCurrency(detail.nextEscalationAmount)}/tháng</>
                    )}
                  </span>
                } />
              )}
            </Card>

            {extra}

            {/* ── Biên bản bàn giao ──────────────────────────────────────────
                Căn cứ duy nhất để đối chiếu lúc khách trả phòng: chỉ số công tơ chốt
                đầu kỳ + ảnh mặt đồng hồ + ảnh hiện trạng. Thiếu thì nói rõ là thiếu. */}
            <Card icon={Camera} title="Biên bản bàn giao lúc đón khách">
              {!hasHandover ? (
                restricted ? (
                  <p className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500">
                    Chưa xem được biên bản bàn giao với vai hiện tại — không có nghĩa là quản lý
                    chưa lập. Khối này tự hiện khi máy chủ mở quyền.
                  </p>
                ) : handoverExpected ? (
                  <p className="rounded-xl border border-dashed border-amber-200 bg-amber-50/60 px-3 py-3 text-xs font-medium text-amber-700">
                    Hợp đồng đã đón khách nhưng chưa có biên bản bàn giao. Lúc khách trả phòng sẽ
                    không có căn cứ đối chiếu để trừ cọc — cần nhắc quản lý bổ sung ảnh hiện trạng
                    và chỉ số điện/nước.
                  </p>
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-500">
                    Chưa đón khách nên chưa có biên bản bàn giao — quản lý sẽ lập khi giao phòng.
                  </p>
                )
              ) : (
                <div className="space-y-3 pt-1">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {meters.map((m) => (
                      <div key={m.key} className="rounded-xl border border-slate-200 p-3">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                          <m.icon className={`h-3.5 w-3.5 ${m.tint}`} />{m.label}
                        </p>
                        <p className="mt-0.5 text-lg font-black text-slate-900">
                          {m.value != null ? `${m.value.toLocaleString('vi-VN')} ${m.unit}` : '—'}
                        </p>
                        {m.img ? (
                          <a href={m.img} target="_blank" rel="noreferrer"
                            className="mt-2 block overflow-hidden rounded-lg border border-slate-200">
                            <img src={m.img} alt={m.label} className="h-28 w-full object-cover transition hover:scale-105" />
                          </a>
                        ) : (
                          <p className="mt-2 rounded-lg bg-slate-50 px-2 py-3 text-center text-xs text-slate-400">
                            Không có ảnh đồng hồ
                          </p>
                        )}
                        {m.at && <p className="mt-1 text-[11px] text-slate-400">Chụp {fmtDateTime(m.at)}</p>}
                      </div>
                    ))}
                  </div>

                  {photos.length > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-semibold text-slate-500">Ảnh hiện trạng phòng ({photos.length})</p>
                      <div className="grid grid-cols-3 gap-2">
                        {photos.map((p) => (
                          <a key={p.url} href={p.url} target="_blank" rel="noreferrer"
                            className="block overflow-hidden rounded-lg border border-slate-200">
                            <img src={p.url} alt="Hiện trạng phòng lúc bàn giao"
                              className="h-24 w-full object-cover transition hover:scale-105" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {detail.roomConditionNote && (
                    <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <span className="font-bold">Ghi chú hiện trạng: </span>{detail.roomConditionNote}
                    </p>
                  )}
                </div>
              )}
            </Card>

            {/* ── Nội thất bàn giao ── */}
            {(equipments.length > 0 || snapshotLines.length > 0) && (
              <Card icon={Package} title={`Nội thất bàn giao (${equipments.length || snapshotLines.length} món)`}>
                {equipments.length > 0 ? (
                  <div className="divide-y divide-slate-100 pt-1">
                    {equipments.map((e) => {
                      const cond = EQUIPMENT_CONDITION[e.condition];
                      return (
                        <div key={e.id} className="flex items-center justify-between gap-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-800">{e.name}</p>
                            <p className="text-[11px] text-slate-400">
                              {e.scope === 'SHARED' ? 'Khu vực chung' : e.roomNumber ? `Phòng ${e.roomNumber}` : 'Trong phạm vi thuê'}
                              {e.houseArea ? ` · ${e.houseArea}` : ''}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {cond && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${cond.color}`}>{cond.label}</span>}
                            <span className="text-sm font-black tabular-nums text-slate-700">x{e.quantity}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <ul className="space-y-1.5 pt-1 text-sm text-slate-700">
                    {snapshotLines.map((line, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />{line}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {/* ── Ghi chú ── */}
            {detail.notes && (
              <Card icon={StickyNote} title="Ghi chú hợp đồng">
                <p className="whitespace-pre-wrap pt-1 text-sm text-slate-700">{detail.notes}</p>
              </Card>
            )}

            <p className="pb-2 text-center text-[11px] text-slate-400">
              Mã hệ thống #{detail.id} · Thao tác gia hạn / chấm dứt thực hiện ở app quản lý vận hành.
            </p>
          </div>

        </div>
      </div>
    </Overlay>
  );
};
