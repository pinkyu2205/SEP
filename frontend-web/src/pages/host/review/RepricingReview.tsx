import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, Banknote, CheckCircle2, ChevronDown, ChevronRight, Hammer, RotateCcw,
  Send, Users, Wand2,
} from 'lucide-react';
import { propertyService } from '@/services/property.service';
import { hostService, type HostContractDto } from '@/services/host.service';
import {
  managerCostForProperty, managerOfZone, managerPayroll, pricingConfigService,
  propertyCountByManager, totalOpex,
  type ManagerPayroll, type PricingConfig, type ZoneManagerLink,
} from '@/services/pricingConfig.service';
import { zoneAssignmentService } from '@/services/zoneAssignment.service';
import type {
  CalculatePricingRequest, HostConfirmRequest, OnboardingSummaryResponse, PricingCalculationResponse,
  PricingCapitalItem, PropertyResponse, RenovationSession, RoomResponse,
} from '@/types/api.types';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { serverNow } from '@/utils/serverTime';
import { formatDate } from '@/utils/helpers';
import {
  BarStat, ExpandStat, ExplainFormula, Explainer, Note, Panel, formatVND, shortVND,
} from './pricingBreakdown';
import { CapitalItemsPanel } from './CapitalItemsPanel';
import { groupByStart } from './capitalItems';

/**
 * DUYỆT LẠI GIÁ SAU CẢI TẠO BỔ SUNG (Host).
 *
 * Khác hẳn màn "Duyệt giá & Kích hoạt" của nhà mới tiếp nhận ([[HostPropertyReview]]):
 * nhà này ĐÃ cho thuê, có thể đang có khách ở. Host không cần đọc lại từ đầu tiền thuê chủ nhà,
 * cải tạo lúc tiếp nhận, cách chia vốn… — những thứ đó đã duyệt rồi. Host chỉ cần trả lời 3 câu:
 *
 *   1. Đợt cải tạo vừa rồi làm gì, cái nào tính vào giá, cái nào công ty tự chịu?
 *   2. Giá niêm yết từng phòng (hoặc cả căn) đổi thành bao nhiêu?
 *   3. Khách đang ở bị ảnh hưởng gì? → KHÔNG: giữ nguyên giá hợp đồng tới khi hết hạn.
 *
 * Giá mới mặc định = giá niêm yết đang áp + phần tăng do riêng đợt này (khấu hao mới ÷ (1 − trống
 * phòng)). Không lấy thẳng giá đề xuất của máy chủ: con số đó tính lại TOÀN BỘ theo cấu hình hiện
 * tại, có thể lệch xa giá Host đã chốt từ trước dù đợt này chỉ thêm vài triệu — vẫn hiện để tham khảo.
 *
 * Quy tắc nghiệp vụ: doc-be/BE-YEUCAU-tinh-lai-gia-khi-cai-tao-bo-sung-2026-09-14.md.
 */

/** Chế độ khấu hao áp cho Host duyệt — giống màn duyệt giá gốc, giá gửi thẳng không cộng dự phòng. */
const CONTINGENCY_FOR_CONFIRM = 100;

interface Unit {
  /** roomId, hoặc 0 với nhà nguyên căn. */
  key: number;
  label: string;
  current: number;
  /** Khấu hao/tháng của các khoản vốn MỚI của đợt này mà phòng/căn này gánh. */
  newMonthly: number;
  /** Phần tăng giá đề xuất do đợt này = newMonthly ÷ (1 − trống phòng). */
  increase: number;
  floor: number;
  suggested: number;
  contract?: HostContractDto;
  /** Từng khoản vốn mới phòng/căn này gánh — để bấm vào phòng thì thấy tăng vì đâu. */
  parts: { label: string; monthly: number; shared: boolean }[];
}

const roundUp = (n: number, step: number) => Math.ceil(n / step) * step;

export const RepricingReview = ({ propertyId, sessions }: {
  propertyId: number;
  sessions: RenovationSession[];
}) => {
  const navigate = useNavigate();

  const [summary, setSummary] = useState<OnboardingSummaryResponse | null>(null);
  const [property, setProperty] = useState<PropertyResponse | null>(null);
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [contracts, setContracts] = useState<HostContractDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [cfg, setCfg] = useState<PricingConfig | null>(null);
  const [payroll, setPayroll] = useState<ManagerPayroll[]>([]);
  const [zoneLinks, setZoneLinks] = useState<ZoneManagerLink[]>([]);

  const [calc, setCalc] = useState<PricingCalculationResponse | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState('');
  const autoCalcRef = useRef(false);

  /** Giá niêm yết mới Host chốt — key = roomId (0 = cả căn). */
  const [prices, setPrices] = useState<Record<number, number>>({});
  const pricesInitRef = useRef(false);
  const [showItems, setShowItems] = useState(false);
  /** Dòng hạng mục / phòng đang mở phần "tính thế nào" — mặc định đóng hết. */
  const [openLine, setOpenLine] = useState<string | null>(null);
  const [openUnit, setOpenUnit] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [s, p] = await Promise.all([
          propertyService.getOnboardingSummary(propertyId),
          propertyService.getPropertyById(propertyId),
        ]);
        const [rs, cs] = await Promise.all([
          p.wholeHouse ? Promise.resolve([] as RoomResponse[]) : propertyService.getRooms(propertyId).catch(() => []),
          hostService.listAllContracts({ propertyId, status: 'ACTIVE' }).catch(() => [] as HostContractDto[]),
        ]);
        if (!alive) return;
        setSummary(s); setProperty(p); setRooms(rs); setContracts(cs);
      } catch (err: any) {
        if (alive) setError(err.response?.data?.message || err.message || 'Không tải được dữ liệu');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [propertyId]);

  // Cấu hình duyệt giá + lương quản lý khu vực — cùng nguồn với màn duyệt giá gốc, để giá tính ra
  // ở hai màn giống hệt nhau.
  useEffect(() => {
    let alive = true;
    Promise.all([
      pricingConfigService.load(),
      propertyService.getManagers().catch(() => [] as { id: string; fullName: string; username: string }[]),
      propertyService.getAllProperties().catch(() => null),
      zoneAssignmentService.list().catch(() => [] as ZoneManagerLink[]),
    ]).then(([{ config }, mgrs, page, links]) => {
      if (!alive) return;
      setCfg(config);
      setZoneLinks(links);
      const count = propertyCountByManager(links, page ?? []);
      setPayroll(managerPayroll(config, mgrs, (id) => count[id] ?? 0));
    });
    return () => { alive = false; };
  }, []);

  const canEdit = summary?.status === 'PENDING_HOST_REVIEW';
  const cfgReady = !!cfg && (cfg.mode === 'FORWARD' ? cfg.pDesired > 0 : cfg.roiExpected > 0);
  const zoneLink = managerOfZone(zoneLinks, property?.zoneId);
  const managerCost = managerCostForProperty(payroll, zoneLinks, property?.zoneId);

  /**
   * Luôn tính lại khi mở trang (khác màn gốc chỉ tính khi chưa có kết quả): `GET /pricing` chưa trả
   * bảng khoản vốn, mà không có bảng đó thì không tách được phần tăng do riêng đợt này.
   */
  const handleCalculate = async () => {
    if (!cfg || !cfgReady) return;
    setCalcError('');
    setCalculating(true);
    const req: CalculatePricingRequest = {
      mode: cfg.mode,
      oOperation: totalOpex(cfg, managerCost),
      vRate: cfg.vRatePct / 100,
      handoverBufferMonths: cfg.handoverBufferMonths,
      ...(cfg.mode === 'FORWARD' ? { pDesired: cfg.pDesired } : { roiExpected: cfg.roiExpected }),
    };
    try {
      setCalc(await propertyService.calculatePricing(propertyId, req));
    } catch (err: any) {
      setCalcError(err.response?.data?.message || err.response?.data?.error || err.message || 'Không tính được giá');
    } finally {
      setCalculating(false);
    }
  };

  useEffect(() => {
    // cfg, payroll, zoneLinks được set cùng một lượt (xem effect trên) nên có cfg là đủ để ra lương quản lý.
    if (autoCalcRef.current || !summary || !cfgReady || !canEdit) return;
    autoCalcRef.current = true;
    handleCalculate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, cfgReady, canEdit]);

  // ── Đợt bổ sung mới nhất ──────────────────────────────────────────────────
  const session = [...sessions].sort((a, b) => b.sessionNumber - a.sessionNumber)[0];
  const sessionLines = session?.lines ?? [];
  const sessionEquipments = (session?.equipments ?? []).filter((e) => e.source === 'PURCHASED');
  const lineIds = new Set(sessionLines.map((l) => l.id));
  const equipmentIds = new Set(sessionEquipments.map((e) => e.id));

  const items = calc?.capitalItems ?? [];
  const hasSourceIds = items.some((i) => i.sourceId != null);
  /**
   * Khoản vốn của riêng đợt này. BE có `sourceId` thì khớp theo hạng mục của đợt; BE cũ chưa trả thì
   * lấy nhóm có ngày bắt đầu khấu hao muộn nhất (khoản của đợt trước giữ ngày cũ).
   */
  const newItems: PricingCapitalItem[] = hasSourceIds
    ? items.filter((i) => i.sourceId != null && (
      (i.kind === 'RENOVATION' && lineIds.has(i.sourceId))
      || ((i.kind === 'EQUIPMENT' || i.kind === 'EQUIPMENT_UPGRADE') && equipmentIds.has(i.sourceId))))
    : (() => { const g = groupByStart(items); return g.length > 1 ? g[g.length - 1].items : []; })();

  const itemOfLine = (id: number) => newItems.find((i) => i.kind === 'RENOVATION' && i.sourceId === id);
  const itemOfEquipment = (id: number) =>
    newItems.find((i) => (i.kind === 'EQUIPMENT' || i.kind === 'EQUIPMENT_UPGRADE') && i.sourceId === id);

  const sessionRenovationCost = sessionLines.reduce((s, l) => s + (l.cost || 0), 0);
  const sessionEquipmentCost = sessionEquipments.reduce((s, e) => s + (e.price || 0), 0);
  const sessionTotal = sessionRenovationCost + sessionEquipmentCost;
  const intoPrice = newItems.reduce((s, i) => s + i.amount, 0);
  const equivalent = calc?.companyAbsorbed?.equivalentReplacement ?? 0;

  // ── Đơn vị định giá: từng phòng, hoặc cả căn ─────────────────────────────
  const vRate = calc?.vRate ?? (cfg ? cfg.vRatePct / 100 : 0.1);
  const wholeHouse = calc ? calc.pricingScope === 'WHOLE_HOUSE' : !!property?.wholeHouse;
  const roomCount = calc?.roomResults?.length ?? 0;

  /** Tên hiển thị của một khoản vốn — BE mới có `itemName`, BE cũ thì dò theo hạng mục của đợt. */
  const itemLabel = (i: PricingCapitalItem) => {
    if (i.itemName) return i.itemName;
    if (i.kind === 'RENOVATION') return sessionLines.find((l) => l.id === i.sourceId)?.categoryName ?? 'Cải tạo';
    return sessionEquipments.find((e) => e.id === i.sourceId)?.catalogName ?? 'Thiết bị';
  };
  const kindLabel = (i: PricingCapitalItem) =>
    i.kind === 'RENOVATION' ? 'cải tạo' : i.kind === 'EQUIPMENT_UPGRADE' ? 'nâng cấp' : 'thiết bị';

  const units: Unit[] = !calc ? [] : wholeHouse
    ? (calc.wholeHouseResult ? [(() => {
      const newMonthly = newItems.reduce((s, i) => s + i.monthlyAmount, 0);
      return {
        key: 0,
        label: 'Cả căn',
        current: property?.listedPrice ?? property?.price ?? 0,
        newMonthly,
        increase: vRate < 1 ? Math.round(newMonthly / (1 - vRate)) : 0,
        floor: calc.wholeHouseResult.roomFloor,
        suggested: calc.wholeHouseResult.suggestedPriceWithProfit,
        contract: contracts.find((c) => !c.roomCode) ?? contracts[0],
        parts: newItems.map((i) => ({ label: `${itemLabel(i)} (${kindLabel(i)})`, monthly: i.monthlyAmount, shared: false })),
      };
    })()] : [])
    : (calc.roomResults ?? []).map((r) => {
      const room = rooms.find((x) => x.id === r.roomId);
      const parts = newItems
        .filter((i) => i.roomId == null || i.roomId === r.roomId)
        .map((i) => ({
          label: `${itemLabel(i)} (${kindLabel(i)})`,
          monthly: i.roomId == null ? i.monthlyAmount / Math.max(roomCount, 1) : i.monthlyAmount,
          shared: i.roomId == null,
        }));
      const newMonthly = parts.reduce((s, p) => s + p.monthly, 0);
      return {
        key: r.roomId,
        label: `Phòng ${r.roomNumber}`,
        current: room?.listedPrice ?? room?.price ?? 0,
        newMonthly,
        increase: vRate < 1 ? Math.round(newMonthly / (1 - vRate)) : 0,
        floor: r.roomFloor,
        suggested: r.suggestedPriceWithProfit,
        contract: contracts.find((c) => c.roomCode === r.roomNumber),
        parts,
      };
    });

  const defaultPrice = (u: Unit) => (u.current > 0 ? roundUp(u.current + u.increase, 1_000) : Math.round(u.suggested));

  useEffect(() => {
    if (pricesInitRef.current || units.length === 0) return;
    pricesInitRef.current = true;
    setPrices(Object.fromEntries(units.map((u) => [u.key, defaultPrice(u)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units.length]);

  const setAll = (fn: (u: Unit) => number) => setPrices(Object.fromEntries(units.map((u) => [u.key, fn(u)])));

  // ── Lưới an toàn — cùng các lỗi BE đã biết như màn duyệt giá gốc ──────────
  const missingRent = items.length > 0 && !items.some((i) => i.kind === 'RENT');
  const renovationInItems = items.filter((i) => i.kind === 'RENOVATION').reduce((s, i) => s + i.amount, 0);
  const renovationMismatch = items.length > 0 && !!summary
    && Math.abs(renovationInItems - (summary.totalRenovationCost ?? 0)) > 1;
  const duplicatedRooms = (() => {
    const ids = (calc?.roomResults ?? []).map((r) => r.roomId);
    return ids.length !== new Set(ids).size;
  })();
  const dataBroken = missingRent || renovationMismatch || duplicatedRooms;

  const rented = units.filter((u) => u.contract);
  const vacant = units.filter((u) => !u.contract);

  /**
   * Phần tăng do RIÊNG đợt này mà khách đang ở chưa trả, vì họ giữ giá hợp đồng tới khi hết hạn:
   * Σ (phần tăng/tháng × số tháng còn lại của hợp đồng).
   *
   * KHÔNG dùng `companyAbsorbed.tenantsOnOldPrice` của BE ở màn này: BE lấy (giá hoà vốn mới − giá
   * hợp đồng), tức gộp cả khoản chênh đã có từ trước đợt cải tạo — hợp đồng ký thấp hơn giá niêm yết
   * là ra hàng trăm triệu, đọc như thể đợt cải tạo gây ra.
   */
  const monthsUntil = (iso?: string) => {
    if (!iso) return 0;
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    if (!y) return 0;
    const now = serverNow();
    let diff = (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
    if (d > now.getDate()) diff += 1; // tháng đang dở vẫn còn thu giá cũ
    return Math.max(0, diff);
  };
  const absorbedByTenants = rented.reduce((s, u) => s + u.increase * monthsUntil(u.contract?.endDate), 0);
  const totalCurrent = units.reduce((s, u) => s + u.current, 0);
  const totalNew = units.reduce((s, u) => s + (prices[u.key] || 0), 0);
  const allPriced = units.length > 0 && units.every((u) => (prices[u.key] || 0) > 0);

  const canConfirm = canEdit && !!calc && !dataBroken && !!zoneLink && allPriced && !calculating;

  const handleConfirm = async () => {
    if (!canConfirm || !calc) return;
    setConfirmOpen(false);
    const payload: HostConfirmRequest = { contingencyPercent: CONTINGENCY_FOR_CONFIRM };
    if (wholeHouse) payload.propertyPrice = prices[0];
    else payload.roomPrices = units.map((u) => ({ roomId: u.key, price: prices[u.key] }));
    setSubmitting(true);
    setError('');
    try {
      await propertyService.hostConfirm(propertyId, payload);
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.message || err.response?.data?.error || err.message || 'Lỗi khi duyệt giá');
    } finally {
      setSubmitting(false);
    }
  };

  const today = serverNow();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
          <CheckCircle2 className="h-10 w-10 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-black text-slate-900">Đã duyệt giá mới</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-500">
          {vacant.length > 0 && <>{vacant.length} {wholeHouse ? 'căn' : 'phòng'} trống áp giá mới ngay. </>}
          {rented.length > 0 && <>{rented.length} {wholeHouse ? 'căn' : 'phòng'} đang có khách giữ nguyên giá hợp đồng, giá mới áp khi hết hạn hoặc gia hạn.</>}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button onClick={() => navigate(`/host/properties/${propertyId}`)} className="btn-primary rounded-xl px-8 py-3">
            Xem chi tiết tòa nhà
          </button>
          <button onClick={() => navigate('/host/properties')}
            className="rounded-xl border border-slate-200 px-6 py-3 text-sm font-bold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700">
            Về danh sách
          </button>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="py-20 text-center text-slate-400">
        <AlertCircle className="mx-auto mb-3 h-10 w-10" />
        <p className="font-semibold">{error || 'Không tìm thấy dữ liệu'}</p>
      </div>
    );
  }

  const propertyName = summary.propertyName?.trim() || property?.propertyName?.trim() || `Tòa nhà #${propertyId}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-5">
        <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600">
          <ArrowLeft className="h-4 w-4" /> Quay lại
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black text-slate-900">Duyệt lại giá sau cải tạo bổ sung</h1>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-800">
            Đợt {session?.sessionNumber ?? '—'}
          </span>
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-700">Nhà đang cho thuê</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          <span className="font-bold text-slate-700">{propertyName}</span>
          {property?.zoneName && <> · {property.zoneName}</>}
          {session?.endDate && <> · cải tạo xong {formatDate(session.endDate)}</>}
        </p>
      </div>

      <div className="mb-5">
        <Note>
          Căn này đã cho thuê từ trước, giá cũ đã được duyệt. Bạn chỉ cần xem đợt cải tạo vừa làm và chốt{' '}
          <b>giá niêm yết mới</b>. <b>Khách đang ở giữ nguyên giá trong hợp đồng</b> tới khi hết hạn — giá mới áp cho
          {wholeHouse ? ' khách mới' : ' phòng trống, khách mới'} và khi gia hạn.
        </Note>
      </div>

      {error && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div>}

      {dataBroken && (
        <div className="mb-5 rounded-2xl border-2 border-rose-300 bg-rose-50 p-5 text-xs leading-relaxed text-rose-700">
          <p className="mb-1.5 flex items-center gap-2 text-sm font-black">
            <AlertCircle className="h-4 w-4 shrink-0" /> Kết quả tính giá của máy chủ đang sai — chưa duyệt được
          </p>
          {missingRent && <p>• Bảng khoản vốn không có tiền thuê trả chủ nhà.</p>}
          {renovationMismatch && (
            <p>
              • Chi phí cải tạo trong bảng khoản vốn là <b>{formatVND(renovationInItems)}</b>, nhưng mọi hạng mục cải tạo của
              căn này cộng lại là <b>{formatVND(summary.totalRenovationCost ?? 0)}</b> — máy chủ bỏ sót vốn của đợt trước.
            </p>
          )}
          {duplicatedRooms && <p>• Một số phòng xuất hiện hai lần (máy chủ trả cả bảng giá cũ lẫn mới).</p>}
          <p className="mt-1">Đã báo team BE. Sửa xong mở lại trang này là tính lại.</p>
        </div>
      )}

      {!cfgReady && cfg && (
        <div className="mb-5"><Note tone="amber">Cấu hình duyệt giá chưa có mục tiêu lãi — vào &quot;Cấu hình duyệt giá&quot; nhập trước rồi mở lại trang.</Note></div>
      )}
      {calcError && <div className="mb-5"><Note tone="rose">{calcError}</Note></div>}
      {!zoneLink && zoneLinks.length > 0 && canEdit && (
        <div className="mb-5">
          <Note tone="rose">
            {property?.zoneName ?? 'Khu vực này'} đang không có quản lý phụ trách — máy chủ không cho duyệt giá khi thiếu quản lý.{' '}
            <button onClick={() => navigate('/host/zones')} className="font-bold underline">Gán quản lý khu vực →</button>
          </Note>
        </div>
      )}

      {/* ── 1. Đợt cải tạo này làm gì ──────────────────────────────────────── */}
      <div className="mb-5">
        <Panel title={`Đợt cải tạo ${session?.sessionNumber ?? ''} làm gì`} icon={Hammer}
          subtitle="Cái gì làm nhà tốt hơn thì tính vào giá; thay đồ hỏng bằng loại tương đương thì công ty chịu. Bấm vào từng thẻ, từng dòng để xem cách tính.">
          <div className="grid items-start gap-3 sm:grid-cols-3">
            <ExpandStat label="Tổng chi đợt này" value={formatVND(sessionTotal)}
              sub={`Cải tạo ${shortVND(sessionRenovationCost)} · thiết bị ${shortVND(sessionEquipmentCost)}`}
              detail={(
                <>
                  <ExplainFormula>
                    {`Cải tạo  ${sessionLines.length} hạng mục   ${formatVND(sessionRenovationCost)}`}
                    {`\nThiết bị ${sessionEquipments.length} món mua      ${formatVND(sessionEquipmentCost)}`}
                    {`\n= ${formatVND(sessionTotal)}`}
                  </ExplainFormula>
                  <p>
                    Là toàn bộ tiền đã chi ra ở đợt này, <b>chưa phân loại</b>. Không phải cả số này đều vào
                    giá — thẻ bên cạnh tách phần tính vào giá và phần công ty tự chịu.
                  </p>
                </>
              )} />
            <ExpandStat label="Tính vào giá" value={calc ? formatVND(intoPrice) : '—'} tone="indigo"
              sub={calc ? `+${formatVND(newItems.reduce((s, i) => s + i.monthlyAmount, 0))}/tháng khấu hao` : 'Chia đều cho số tháng thuê còn lại'}
              detail={calc && (
                newItems.length === 0 ? (
                  <p>Đợt này không có khoản nào tính vào giá.</p>
                ) : (
                  <>
                    <ExplainFormula>
                      {newItems.map((i) => `${itemLabel(i)}: ${shortVND(i.amount)} ÷ ${i.months} = ${formatVND(i.monthlyAmount)}`).join('\n')}
                      {`\n= ${formatVND(intoPrice)} · ${formatVND(newItems.reduce((s, i) => s + i.monthlyAmount, 0))}/tháng`}
                    </ExplainFormula>
                    <p>
                      Mỗi khoản chia đều cho <b>số tháng thuê còn lại</b> của hợp đồng chủ nhà (không phải cả kỳ) —
                      thu hồi xong đúng lúc trả nhà. Thiết bị <b>nâng cấp</b> chỉ tính phần đắt hơn máy cũ.
                    </p>
                  </>
                )
              )} />
            <ExpandStat label="Công ty tự chịu" value={calc ? formatVND(equivalent) : '—'} tone="amber"
              sub="Thay thiết bị tương đương"
              detail={calc && (
                <>
                  <ExplainFormula>
                    Với mỗi thiết bị thay thế: phần = min(giá máy mới, giá máy cũ){`\n`}Cộng lại = {formatVND(equivalent)}
                  </ExplainFormula>
                  <p>
                    Thay đồ hỏng bằng đồ <b>cùng tầm giá</b> chỉ giữ đúng chất lượng đã hứa với khách, nên
                    không được tính thêm vào giá thuê. Máy cũ vẫn chạy tiếp lịch khấu hao cũ. Máy mới đắt
                    hơn thì phần chênh mới vào giá (dòng "nâng cấp").
                  </p>
                </>
              )} />
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 font-bold">Hạng mục</th>
                  <th className="px-3 py-2.5 font-bold">Vị trí</th>
                  <th className="px-3 py-2.5 text-right font-bold">Chi phí</th>
                  <th className="px-3 py-2.5 font-bold">Tính giá thế nào</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessionLines.map((l) => {
                  const it = itemOfLine(l.id);
                  const rowKey = `l-${l.id}`;
                  const open = openLine === rowKey;
                  return (
                    <Fragment key={rowKey}>
                      <tr onClick={() => setOpenLine(open ? null : rowKey)} className="cursor-pointer transition hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <p className="flex items-center gap-1.5 font-semibold text-slate-700">
                            {open ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
                            Cải tạo · {l.categoryName}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">{wholeHouse ? 'Cả căn' : 'Chia đều các phòng'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatVND(l.cost)}</td>
                        <td className="px-3 py-2 text-xs">
                          {!calc ? '—' : it
                            ? <span className="font-semibold text-indigo-700">Tính vào giá · +{formatVND(it.monthlyAmount)}/tháng</span>
                            : <span className="text-slate-400">Chưa thấy trong bảng khoản vốn</span>}
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={4} className="space-y-2 px-3 pb-3 pl-8 pt-1 text-xs leading-relaxed text-slate-600">
                            {l.note && <p className="text-slate-500">Ghi chú: {l.note}</p>}
                            {!calc ? <p>Chưa có kết quả tính giá.</p> : it ? (
                              <>
                                <ExplainFormula>
                                  {`${formatVND(it.amount)} ÷ ${it.months} tháng còn lại = ${formatVND(it.monthlyAmount)}/tháng`}
                                  {!wholeHouse && roomCount > 0
                                    && `\nchia đều ${roomCount} phòng → ${formatVND(it.monthlyAmount / roomCount)}/phòng/tháng`}
                                </ExplainFormula>
                                <p>
                                  Cải tạo làm cả căn tốt hơn nên <b>tính vào giá</b>.{' '}
                                  {wholeHouse ? 'Căn nguyên căn gánh toàn bộ.' : 'Đây là khu dùng chung nên mọi phòng gánh như nhau.'}{' '}
                                  Trước khi vào giá còn chia thêm cho (1 − {Math.round(vRate * 100)}%) để bù tháng trống.
                                </p>
                              </>
                            ) : (
                              <p>Máy chủ chưa đưa hạng mục này vào bảng khoản vốn — số này chưa làm tăng giá.</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {sessionEquipments.map((e) => {
                  const it = itemOfEquipment(e.id);
                  const rowKey = `e-${e.id}`;
                  const open = openLine === rowKey;
                  const where = e.roomNumber ? `Phòng ${e.roomNumber}` : e.houseArea ? 'Khu vực chung' : 'Cả căn';
                  return (
                    <Fragment key={rowKey}>
                      <tr onClick={() => setOpenLine(open ? null : rowKey)} className="cursor-pointer transition hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <p className="flex items-center gap-1.5 font-semibold text-slate-700">
                            {open ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
                            {e.catalogName}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">{where}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatVND(e.price)}</td>
                        <td className="px-3 py-2 text-xs">
                          {!calc ? '—' : !it
                            ? <span className="font-semibold text-amber-700">Thay đồ tương đương · công ty chịu</span>
                            : it.kind === 'EQUIPMENT_UPGRADE'
                              ? <span className="font-semibold text-indigo-700">Nâng cấp · tính phần đắt hơn {formatVND(it.amount)}</span>
                              : <span className="font-semibold text-indigo-700">Thêm mới · +{formatVND(it.monthlyAmount)}/tháng</span>}
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={4} className="space-y-2 px-3 pb-3 pl-8 pt-1 text-xs leading-relaxed text-slate-600">
                            {e.note && <p className="text-slate-500">Ghi chú: {e.note}</p>}
                            {!calc ? <p>Chưa có kết quả tính giá.</p> : !it ? (
                              <p>
                                Máy mới <b>{formatVND(e.price)}</b> không đắt hơn máy đang thay, nên chỉ là giữ nguyên chất
                                lượng đã hứa với khách — <b>công ty chịu</b>, không tăng giá. Máy cũ chạy tiếp lịch khấu hao cũ.
                              </p>
                            ) : it.kind === 'EQUIPMENT_UPGRADE' ? (
                              <>
                                <ExplainFormula>
                                  {`Máy mới ${formatVND(e.price)} − máy cũ ${formatVND(e.price - it.amount)} = nâng cấp ${formatVND(it.amount)}`}
                                  {`\n${formatVND(it.amount)} ÷ ${it.months} tháng = ${formatVND(it.monthlyAmount)}/tháng`}
                                </ExplainFormula>
                                <p>
                                  Chỉ <b>phần đắt hơn</b> mới tính vào giá; phần {formatVND(e.price - it.amount)} bằng giá máy cũ
                                  công ty chịu. {e.roomNumber ? `Riêng phòng ${e.roomNumber} gánh.` : 'Khu vực chung nên chia đều các phòng.'}
                                </p>
                              </>
                            ) : (
                              <>
                                <ExplainFormula>
                                  {`${formatVND(it.amount)} ÷ ${it.months} tháng = ${formatVND(it.monthlyAmount)}/tháng`}
                                  {!e.roomNumber && !wholeHouse && roomCount > 0
                                    && `\nkhu vực chung ÷ ${roomCount} phòng → ${formatVND(it.monthlyAmount / roomCount)}/phòng/tháng`}
                                </ExplainFormula>
                                <p>
                                  Thiết bị <b>lắp thêm</b> làm nhà tốt hơn nên tính toàn bộ vào giá.{' '}
                                  {e.roomNumber ? <>Chỉ <b>phòng {e.roomNumber}</b> gánh, phòng khác không tăng vì món này.</> : wholeHouse ? 'Căn nguyên căn gánh toàn bộ.' : 'Đặt ở khu vực chung nên chia đều mọi phòng.'}
                                </p>
                              </>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {sessionLines.length === 0 && sessionEquipments.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-400">Đợt này chưa ghi nhận hạng mục nào</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {/* ── 2. Giá mới ─────────────────────────────────────────────────────── */}
      <div className="mb-5">
        <Panel title={wholeHouse ? 'Giá niêm yết mới của căn' : `Giá niêm yết mới từng phòng (${units.length} phòng)`} icon={Banknote}
          subtitle={`Gợi ý = giá cũ + phần tăng do đợt này. Sửa được từng ô; bấm tên ${wholeHouse ? 'căn' : 'phòng'} để xem tăng vì đâu.`}>
          <Explainer className="mb-3" title="Quy tắc tính giá niêm yết mới">
            <ExplainFormula>
              {`Khấu hao mới/tháng = Σ khoản vốn của đợt này mà ${wholeHouse ? 'căn' : 'phòng'} gánh`}
              {`\nTăng giá = khấu hao mới ÷ (1 − ${Math.round(vRate * 100)}% trống phòng)`}
              {`\nGiá gợi ý = giá đang niêm yết + tăng giá, làm tròn lên 1.000đ`}
            </ExplainFormula>
            <p>
              Chỉ cộng <b>phần của riêng đợt này</b> lên giá đã duyệt từ trước — không tính lại toàn bộ, vì giá cũ Host
              đã chốt (có thể cao hơn đề xuất lúc đó). {!wholeHouse && <>Khoản dùng chung (cải tạo, thiết bị khu vực
              chung) chia đều mọi phòng; thiết bị lắp riêng phòng nào thì chỉ phòng đó gánh. </>}
              Chia thêm cho (1 − {Math.round(vRate * 100)}%) để bù những tháng phòng bỏ trống.
            </p>
            <p>
              Ô tô đỏ "<b>Dưới hoà vốn</b>" là giá thấp hơn mức tối thiểu để không lỗ. "Giá đề xuất khi tính lại toàn bộ"
              ở cuối bảng chỉ để tham khảo.
            </p>
          </Explainer>
          {!calc ? (
            <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
              {calculating ? 'Đang tính giá…' : 'Chưa có kết quả tính giá'}
            </p>
          ) : (
            <>
              {canEdit && (
                <div className="mb-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setAll(defaultPrice)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100">
                    <RotateCcw className="h-3.5 w-3.5" /> Giá cũ + phần cải tạo
                  </button>
                  <button type="button" onClick={() => setAll((u) => u.current || Math.round(u.suggested))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
                    Giữ nguyên giá cũ
                  </button>
                  <button type="button" onClick={() => setAll((u) => roundUp(prices[u.key] || defaultPrice(u), 100_000))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
                    <Wand2 className="h-3.5 w-3.5" /> Làm tròn lên 100k
                  </button>
                </div>
              )}

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2.5 font-bold">{wholeHouse ? 'Căn' : 'Phòng'}</th>
                      <th className="px-3 py-2.5 font-bold">Hiện tại</th>
                      <th className="px-3 py-2.5 text-right font-bold">Giá đang niêm yết</th>
                      <th className="px-3 py-2.5 text-right font-bold">Tăng do đợt này</th>
                      <th className="w-[12rem] border-x border-indigo-100 bg-indigo-50/70 px-3 py-2.5 text-right font-black text-indigo-700">Giá niêm yết mới</th>
                      <th className="px-3 py-2.5 font-bold">Áp dụng từ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {units.map((u) => {
                      const price = prices[u.key] || 0;
                      const below = price > 0 && price < u.floor;
                      const diff = u.current > 0 ? price - u.current : 0;
                      const unitOpen = openUnit === u.key;
                      return (
                        <Fragment key={u.key}>
                        <tr className={below ? 'bg-rose-50/40' : undefined}>
                          <td className="px-3 py-2.5">
                            <button type="button" onClick={() => setOpenUnit(unitOpen ? null : u.key)}
                              title={unitOpen ? 'Thu gọn' : 'Xem tăng giá vì đâu'}
                              className="flex items-center gap-1.5 font-bold text-slate-800 hover:text-indigo-700">
                              {unitOpen ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
                              {u.label}
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            {u.contract ? (
                              <span className="block">
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-700">
                                  <Users className="h-3 w-3" /> Đang thuê
                                </span>
                                <span className="mt-0.5 block text-slate-500">
                                  {u.contract.lesseeName ?? 'Khách thuê'} · HĐ {formatVND(u.contract.rentAmount)}
                                </span>
                              </span>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-500">Trống</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{u.current > 0 ? formatVND(u.current) : '—'}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            <span className={u.increase > 0 ? 'font-semibold text-indigo-700' : 'text-slate-400'}>
                              {u.increase > 0 ? `+${formatVND(u.increase)}` : '0 đ'}
                            </span>
                          </td>
                          <td className="border-x border-indigo-100 bg-indigo-50/40 px-3 py-2">
                            {canEdit ? (
                              <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 ${below ? 'border-rose-300 bg-rose-50' : 'border-slate-300 bg-white focus-within:border-indigo-500'}`}>
                                <input
                                  type="text" inputMode="numeric"
                                  value={price ? price.toLocaleString('vi-VN') : ''}
                                  onChange={(ev) => {
                                    const raw = ev.target.value.replace(/[^0-9]/g, '');
                                    setPrices({ ...prices, [u.key]: raw === '' ? 0 : Number(raw) });
                                  }}
                                  className="w-full min-w-0 bg-transparent text-right text-sm font-bold tabular-nums outline-none"
                                />
                                <span className="text-xs text-slate-400">đ</span>
                              </div>
                            ) : (
                              <p className="text-right font-bold tabular-nums">{formatVND(price)}</p>
                            )}
                            <p className={`mt-1 h-3.5 text-right text-[10px] font-bold leading-none tabular-nums ${below ? 'text-rose-600' : diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-amber-600' : 'text-transparent'}`}>
                              {below ? `Dưới hoà vốn ${shortVND(u.floor)}` : diff !== 0 ? `${diff > 0 ? '+' : '−'}${shortVND(Math.abs(diff))} so với cũ` : '.'}
                            </p>
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            {u.contract ? (
                              <span className="text-slate-600">
                                Khi HĐ hết hạn{u.contract.endDate && <> <b>{formatDate(u.contract.endDate)}</b></>}
                                <span className="block text-[11px] text-slate-400">hoặc khi gia hạn</span>
                              </span>
                            ) : (
                              <span className="font-bold text-emerald-700">Ngay khi duyệt</span>
                            )}
                          </td>
                        </tr>
                        {unitOpen && (
                          <tr className="bg-slate-50/70">
                            <td colSpan={6} className="space-y-2 px-3 pb-3 pl-8 pt-1 text-xs leading-relaxed text-slate-600">
                              {u.parts.length === 0 ? (
                                <p>Đợt này không có khoản nào {wholeHouse ? 'căn' : 'phòng'} này phải gánh — giá gợi ý giữ nguyên giá cũ.</p>
                              ) : (
                                <>
                                  <ExplainFormula>
                                    {u.parts.map((p) => `${p.label}${p.shared ? ` ÷ ${roomCount} phòng` : ''}: ${formatVND(p.monthly)}/tháng`).join('\n')}
                                    {`\n= khấu hao mới ${formatVND(u.newMonthly)}/tháng`}
                                    {`\n÷ (1 − ${Math.round(vRate * 100)}%) = tăng ${formatVND(u.increase)}/tháng`}
                                    {u.current > 0 && `\ngiá cũ ${formatVND(u.current)} + ${formatVND(u.increase)} → làm tròn ${formatVND(defaultPrice(u))}`}
                                  </ExplainFormula>
                                  <p>
                                    {u.parts.some((p) => !p.shared) && !wholeHouse
                                      ? <>Có khoản <b>lắp riêng</b> cho {u.label.toLowerCase()} nên tăng nhiều hơn phòng khác. </>
                                      : !wholeHouse ? <>Chỉ gánh phần dùng chung, như mọi phòng khác. </> : null}
                                    Hoà vốn tối thiểu {formatVND(u.floor)}/tháng — nhập thấp hơn sẽ báo đỏ.
                                  </p>
                                  {u.contract && (
                                    <p className="text-amber-700">
                                      Đang có khách thuê giá hợp đồng {formatVND(u.contract.rentAmount)} — khách <b>không</b> bị tăng;
                                      giá mới áp khi hợp đồng hết hạn{u.contract.endDate && <> ({formatDate(u.contract.endDate)})</>} hoặc gia hạn.
                                    </p>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  {units.length > 1 && (
                    <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                      <tr>
                        <td colSpan={2} className="px-3 py-3 font-black text-slate-700">Tổng {units.length} phòng</td>
                        <td className="px-3 py-3 text-right font-bold tabular-nums text-slate-600">{formatVND(totalCurrent)}</td>
                        <td className="px-3 py-3 text-right font-bold tabular-nums text-indigo-700">+{formatVND(units.reduce((s, u) => s + u.increase, 0))}</td>
                        <td className="border-x border-indigo-100 bg-indigo-50/70 px-3 py-3 text-right font-black tabular-nums text-indigo-800">{formatVND(totalNew)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                Giá đề xuất khi tính lại toàn bộ theo cấu hình hiện tại:{' '}
                {units.map((u, i) => <span key={u.key}>{i > 0 && ' · '}{u.label} {shortVND(u.suggested)}</span>)}.
                {canEdit && (
                  <button type="button" onClick={() => setAll((u) => Math.round(u.suggested))}
                    className="ml-1 font-bold text-indigo-600 hover:underline">Dùng giá này</button>
                )}
              </p>
            </>
          )}
        </Panel>
      </div>

      {/* ── 3. Khách đang ở ────────────────────────────────────────────────── */}
      {calc && (
        <div className="mb-5">
          <Panel title="Khách đang ở" icon={Users}>
            {rented.length === 0 ? (
              <p className="text-sm text-slate-500">
                {wholeHouse ? 'Căn đang trống' : 'Không phòng nào có khách'} — giá mới áp dụng ngay khi duyệt.
              </p>
            ) : (
              <div className="space-y-2 text-sm text-slate-600">
                <p>
                  <b className="text-slate-800">{rented.length} {wholeHouse ? 'hợp đồng' : 'phòng'} đang có khách</b> — tiền thuê
                  hằng tháng của họ <b>không đổi</b>. Hoá đơn vẫn tính theo giá trong hợp đồng.
                </p>
                {absorbedByTenants > 0 && (
                  <>
                    <p className="text-xs text-slate-500">
                      Phần tăng do đợt này mà khách đang ở chưa trả tới khi hết hợp đồng — công ty tự chịu:{' '}
                      <b className="text-amber-700">khoảng {formatVND(absorbedByTenants)}</b>.
                    </p>
                    <Explainer title="Khoản công ty tự chịu tính thế nào">
                      <ExplainFormula>
                        {rented.map((u) => `${u.label}: tăng ${formatVND(u.increase)} × ${monthsUntil(u.contract?.endDate)} tháng còn lại HĐ = ${formatVND(u.increase * monthsUntil(u.contract?.endDate))}`).join('\n')}
                        {`\n= ${formatVND(absorbedByTenants)}`}
                      </ExplainFormula>
                      <p>
                        Chỉ tính <b>phần tăng do riêng đợt cải tạo này</b>, nhân số tháng còn lại tới ngày hết hợp đồng
                        (tháng đang dở vẫn tính, vì khách còn trả giá cũ). Không gộp khoản chênh đã có từ trước — hợp đồng
                        ký thấp hơn giá niêm yết cũ không phải do đợt cải tạo gây ra.
                      </p>
                    </Explainer>
                  </>
                )}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* ── Chi tiết khoản vốn — đóng sẵn, chỉ để tra cứu ───────────────────── */}
      {calc && items.length > 0 && (
        <div className="mb-5">
          <button type="button" onClick={() => setShowItems((v) => !v)}
            className="mb-3 flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-indigo-600">
            {showItems ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Xem chi tiết từng khoản vốn và lịch khấu hao
          </button>
          {showItems && (
            <CapitalItemsPanel
              calc={calc}
              today={today}
              rentLabel={summary.inboundContract?.contractCode}
              roomLabel={(roomId) => {
                const r = calc.roomResults?.find((x) => x.roomId === roomId);
                return r?.roomNumber ? `Phòng ${r.roomNumber}` : null;
              }}
            />
          )}
        </div>
      )}

      {/* ── Thanh duyệt dính đáy ───────────────────────────────────────────── */}
      <div className="sticky bottom-0 z-30 -mx-4 mt-5 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <BarStat
            label="Giá niêm yết mới / tháng"
            value={(
              <>
                {totalNew > 0 ? formatVND(totalNew) : '—'}
                {totalCurrent > 0 && totalNew > 0 && (
                  <span className={`ml-2 text-xs font-bold ${totalNew >= totalCurrent ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {totalNew >= totalCurrent ? '+' : '−'}{formatVND(Math.abs(totalNew - totalCurrent))} so với cũ
                  </span>
                )}
              </>
            )}
            detail={units.length === 0 ? <p>Chưa có kết quả tính giá.</p> : (
              <>
                <ExplainFormula>
                  {units.map((u) => `${u.label}: ${formatVND(u.current)} → ${formatVND(prices[u.key] || 0)}`).join('\n')}
                  {`\nTổng: ${formatVND(totalCurrent)} → ${formatVND(totalNew)}`}
                </ExplainFormula>
                <p>
                  Cộng giá niêm yết mới của {wholeHouse ? 'căn' : `${units.length} phòng`} — là số bạn đang nhập ở bảng
                  trên, chưa phải tiền thu thật: {rented.length > 0
                    ? `${rented.length} ${wholeHouse ? 'căn' : 'phòng'} đang có khách vẫn trả giá hợp đồng tới khi hết hạn.`
                    : 'không phòng nào đang có khách nên áp ngay khi duyệt.'}
                </p>
              </>
            )}
          />
          <div className="flex items-center gap-3">
            {!canEdit ? (
              <p className="text-xs font-semibold text-amber-600">Chỉ duyệt được khi ở trạng thái &quot;Chờ Host duyệt&quot;</p>
            ) : dataBroken ? (
              <p className="text-xs font-semibold text-rose-600">Kết quả tính giá đang sai — xem cảnh báo đầu trang</p>
            ) : !zoneLink ? (
              <p className="text-xs font-semibold text-rose-600">Khu vực chưa có quản lý</p>
            ) : !allPriced && calc ? (
              <p className="text-xs font-semibold text-amber-600">Nhập giá cho mọi {wholeHouse ? 'căn' : 'phòng'}</p>
            ) : null}
            <button onClick={() => setConfirmOpen(true)} disabled={!canConfirm || submitting}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
              {submitting ? 'Đang xử lý...' : (<><Send className="h-5 w-5" /> Duyệt giá mới</>)}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        tone="success"
        title="Duyệt giá niêm yết mới?"
        message={
          <>
            Giá niêm yết {wholeHouse ? 'của căn' : `${units.length} phòng`} đổi từ <b className="text-slate-700">{formatVND(totalCurrent)}</b> thành{' '}
            <b className="text-slate-700">{formatVND(totalNew)}</b>/tháng.
            {vacant.length > 0 && <> {vacant.length} {wholeHouse ? 'căn' : 'phòng'} trống áp dụng ngay.</>}
            {rented.length > 0 && <> {rented.length} {wholeHouse ? 'căn' : 'phòng'} đang có khách giữ nguyên giá hợp đồng tới khi hết hạn.</>}
          </>
        }
        confirmText="Duyệt giá mới"
        loading={submitting}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
};
