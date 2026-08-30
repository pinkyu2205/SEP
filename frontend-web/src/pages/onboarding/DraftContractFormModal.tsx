import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, ShieldAlert, UploadCloud, Loader2, FileText, Keyboard, CheckCircle2, ExternalLink, Lock, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import type {
  PropertyResponse,
  RoomResponse,
  OnboardTenantRequest,
  TenantContractResponse,
  ContractAvailableEquipmentItem,
  HouseholdMemberInput,
} from '../../types/api.types';
import { propertyService } from '../../services/property.service';
import { tenantService, isTenantEligibleRole } from '../../services/tenant.service';
import { uploadToCloudinary } from '../../services/upload.service';
import { extractTenantContractData } from '../../utils/pdfExtract';
import { draftBlobToFile, openContractBlob } from '../../utils/contractFile';
import { todayIso } from '@/utils/serverTime';
import { buildOccupancyMap, type PropertyOccupancy } from '@/services/propertyOccupancy.service';
import { PropertyPicker } from './PropertyPicker';
import {
  CapacityStat, RoomSquares, CapacityBreakdown,
  RoomCountMismatchNote, RoomsNotOpenedNote, capacityTone, TONE_CARD,
} from './CapacityBar';

interface Props {
  onSuccess: () => void;
  onClose: () => void;
  /** Có giá trị → mở modal ở CHẾ ĐỘ SỬA hợp đồng nháp đã tồn tại (không tạo mới). */
  editContract?: TenantContractResponse;
}

/** yyyy-MM-dd + n năm → yyyy-MM-dd (dùng cho giới hạn ngày kết thúc). */
const addYearsIso = (dateStr: string, years: number): string => {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split('T')[0];
};

/** yyyy-MM-dd + n tháng → yyyy-MM-dd (dùng cho chip chọn nhanh ngày kết thúc). */
const addMonthsIso = (dateStr: string, months: number): string => {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
};

/** yyyy-MM-dd → dd/MM/yyyy (hiển thị trong panel tóm tắt), rỗng → '—'. */
const formatDateDisplay = (iso: string): string => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

/** Giữ state raw là chuỗi CHỮ SỐ THUẦN (khớp Number(...) khi build payload); chỉ format lúc hiển thị. */
const formatVndDisplay = (raw: string): string => (raw ? Number(raw).toLocaleString('vi-VN') : '');
const parseVndInput = (displayValue: string): string => displayValue.replace(/\D/g, '');

/** Tiền cọc luôn = giá thuê × số tháng cọc — tính lại mỗi khi 1 trong 2 giá trị đổi. */
const calcDeposit = (rentRaw: string, monthsRaw: string): string =>
  rentRaw ? String(Number(rentRaw) * (Number(monthsRaw) || 1)) : '';

// SĐT di động VN: 10 số đầu 03/05/07/08/09, hoặc dạng +84 tương ứng.
const VN_PHONE_RE = /^(0|\+84)(3|5|7|8|9)\d{8}$/;
// CCCD 12 chữ số (chuẩn CCCD gắn chip hiện hành).
const VN_CCCD_RE = /^\d{12}$/;
const normalizePhone = (s: string): string => s.replace(/[\s.-]/g, '');

// Ngày sinh hợp lệ: từ 1930 trở đi + khách phải đủ 18 tuổi mới ký được hợp đồng.
const DOB_MIN = '1930-01-01';
const DOB_MAX = addYearsIso(todayIso(), -18);

/**
 * Modal tạo HỢP ĐỒNG NHÁP (DRAFT) cho luồng đón khách v2.
 * - Tab "Upload file": chọn file HĐ đã điền (DOCX/PDF) → tự bóc tách + upload lưu link → admin review/chỉnh.
 * - Tab "Nhập tay": admin nhập trực tiếp → sau khi lưu, BE fill dữ liệu vào template và
 *   render PDF (POST .../draft-document, xem FE-draft-contract-pdf.md) → FE upload
 *   Cloudinary → lưu draftContractFileUrl.
 * Quản lý phụ trách LUÔN LÀ operationManagerId có sẵn của nhà (BE tự set) — không cho
 * chọn tay ở đây nữa. Nhà chưa có quản lý phụ trách thì KHÔNG cho tạo hợp đồng (phải
 * gán quản lý cho nhà trước, ở trang Zone/Quản lý).
 */
// Bỏ dấu tiếng Việt + hạ chữ thường + gom khoảng trắng, phục vụ so khớp địa chỉ.
const normalizeText = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Giữ token số dù chỉ 1 ký tự — "Quận 1" và "Quận 3" phải phân biệt được, không thì
// mọi quận trong cùng thành phố sẽ trùng điểm nhau. Chỉ bỏ token CHỮ 1 ký tự (rác).
const tokenize = (s: string): string[] =>
  normalizeText(s)
    .split(' ')
    .filter((t) => t.length > 1 || /^[0-9]$/.test(t));

// Khoảng cách sửa đổi (Levenshtein) có trần cắt sớm — chỉ cần biết "≤ max hay không".
const editDistanceAtMost = (a: string, b: string, max: number): boolean => {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
};

/**
 * "Kiểm tra chính tả" cho tên nhà/địa chỉ bóc từ file: token khớp khi trùng tuyệt đối,
 * HOẶC lệch tối đa 1 ký tự với token đủ dài (≥4) — chống gõ sai/OCR sai kiểu
 * "Le Lloi" ~ "Le Loi". Token ngắn và token số phải khớp tuyệt đối ("Quận 1" ≠ "Quận 3").
 */
const tokenMatches = (t: string, candidates: Set<string>): boolean => {
  if (candidates.has(t)) return true;
  if (t.length < 4 || /\d/.test(t)) return false;
  for (const c of candidates) {
    if (c.length >= 4 && !/\d/.test(c) && editDistanceAtMost(t, c, 1)) return true;
  }
  return false;
};

/**
 * Gợi ý property khớp với địa chỉ bóc từ file HĐ (đoạn text tự do, không chuẩn hoá).
 * So khớp kiểu token-overlap trên propertyName + 2 field địa chỉ — đủ dùng cho danh
 * sách BĐS đã đăng ký sẵn trong hệ thống (không phải geocoding địa chỉ tự do ngoài đời).
 * Nếu địa chỉ quá chung chung (chỉ quận/thành phố — nhiều nhà cùng khớp điểm cao ngang
 * nhau) thì CHỦ ĐỘNG TỪ CHỐI gợi ý thay vì đoán liều 1 nhà — admin tự chọn tay an toàn hơn.
 */
const suggestPropertyByAddress = (
  address: string,
  list: PropertyResponse[],
): { property: PropertyResponse; score: number } | null => {
  const targetTokens = new Set(tokenize(address));
  if (targetTokens.size === 0) return null;

  const scored = list
    .map((p) => {
      const candidateTokens = new Set(tokenize(`${p.propertyName} ${p.fullAddress} ${p.shortAddress}`));
      let overlap = 0;
      targetTokens.forEach((t) => { if (tokenMatches(t, candidateTokens)) overlap += 1; });
      return { property: p, score: overlap / targetTokens.size };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const runnerUp = scored[1];
  const tooClose = runnerUp && best.score - runnerUp.score < 0.15;
  if (!best || best.score < 0.4 || tooClose) return null;
  return best;
};

const ROOM_STATUS_LABEL: Record<string, string> = {
  RENTED: 'đang có khách',
  MAINTENANCE: 'đang bảo trì',
  // Phòng đã tạo nhưng chưa ai bật cho thuê — KHÔNG phải chưa có giá.
  DRAFT: 'chưa mở cho thuê',
  DISABLED: 'ngưng khai thác',
  // Không phải status BE — key nội bộ đánh dấu phòng AVAILABLE nhưng đã có HĐ nháp chờ đón khách.
  HAS_DRAFT: 'đã có hợp đồng nháp chờ đón khách',
};

const EQUIPMENT_CONDITION_LABEL: Record<string, string> = {
  NEW: 'Mới',
  GOOD: 'Tốt',
  DAMAGED: 'Hư hại',
  BROKEN: 'Hỏng',
};

const PROPERTY_STATUS_LABEL: Record<string, string> = {
  RENTED: 'đã cho thuê nguyên căn',
  MAINTENANCE: 'đang bảo trì',
  DISABLED: 'ngưng khai thác',
  UNDER_RENOVATION: 'đang cải tạo',
  DRAFT: 'chưa hoàn thiện onboarding',
  PENDING: 'chưa hoàn thiện onboarding',
  PENDING_EQUIPMENT_INSTALLATION: 'chưa hoàn thiện onboarding',
  RENOVATION_COMPLETED: 'chưa hoàn thiện onboarding',
  PENDING_HOST_REVIEW: 'chưa hoàn thiện onboarding',
  PENDING_OPERATION_MANAGER: 'chưa hoàn thiện onboarding',
  INACTIVE: 'ngưng hoạt động',
};

export const DraftContractFormModal = ({ onSuccess, onClose, editContract }: Props) => {
  const isEditMode = !!editContract;

  // Danh sách ĐẦY ĐỦ (mọi status) — dùng để gợi ý theo địa chỉ + giải thích lý do
  // 1 nhà không hiện trong dropdown. `properties` bên dưới là bản đã lọc ACTIVE.
  const [allProperties, setAllProperties] = useState<PropertyResponse[]>([]);
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [allRoomsInProperty, setAllRoomsInProperty] = useState<RoomResponse[]>([]);
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [addressSuggestion, setAddressSuggestion] = useState('');

  const [mode, setMode] = useState<'upload' | 'manual'>('upload');
  const [extracting, setExtracting] = useState(false);
  const [fileName, setFileName] = useState('');
  const [draftFileUrl, setDraftFileUrl] = useState('');

  // Thành viên ở cùng (householdMembers) — trước đây chỉ mobile walk-in thu được,
  // nhánh admin-tạo-draft mất hẳn dữ liệu này (ResumeContract cũng không thu).
  const [members, setMembers] = useState<Array<{ key: string; fullName: string; relation: string; phone: string }>>([]);
  const addMember = () =>
    setMembers((prev) => [...prev, { key: `m-${Date.now()}`, fullName: '', relation: '', phone: '' }]);
  const removeMember = (key: string) => setMembers((prev) => prev.filter((m) => m.key !== key));
  const patchMember = (key: string, patch: Partial<{ fullName: string; relation: string; phone: string }>) =>
    setMembers((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  const membersPayload = (): HouseholdMemberInput[] =>
    members
      .filter((m) => m.fullName.trim())
      .map((m) => ({
        fullName: m.fullName.trim(),
        relation: m.relation.trim() || undefined,
        phone: m.phone.trim() || undefined,
      }));

  const [lookupRole, setLookupRole] = useState<string | null>(null);
  const [lookupChecked, setLookupChecked] = useState(false);
  const [lookupEligible, setLookupEligible] = useState<boolean | null>(null);

  const [submitting, setSubmitting] = useState(false);
  // Trạng thái từng bước của chuỗi submit (tạo → gán manager → sinh file → upload) —
  // hiện text cụ thể vì bước render PDF + upload Cloudinary có thể mất vài giây.
  const [submitStage, setSubmitStage] = useState('');
  // Sau khi tạo thành công: hiện panel kết quả thay vì đóng modal ngay, để admin xem
  // hợp đồng (nếu có file) trước khi đóng. Xem file qua BE /document/download —
  // KHÔNG mở URL Cloudinary trực tiếp (FE-draft-contract-pdf.md).
  const [successView, setSuccessView] = useState<{
    draftId: number;
    contractCode: string | null;
    hasFile: boolean;
    managerName: string;
  } | null>(null);
  const [viewingCreated, setViewingCreated] = useState(false);
  // Submit chuỗi thao tác (tạo/sửa → gán manager → sinh file) khá tốn kém để làm lại
  // nếu gõ nhầm — chặn lại 1 bước xác nhận cuối, hiện tóm tắt toàn bộ trước khi bắn API.
  const [showSummary, setShowSummary] = useState(false);

  // Sửa hợp đồng nháp: pre-fill từ contract đã có (component remount mỗi lần mở modal
  // — xem cách DraftOnboardingList render {editing && <Modal .../>} — nên lazy
  // initializer ở đây là đủ, không cần useEffect đồng bộ lại).
  const [form, setForm] = useState(() => editContract ? {
    propertyId: String(editContract.propertyId),
    roomId: editContract.roomId != null ? String(editContract.roomId) : '',
    fullName: editContract.tenantFullName || '',
    phoneNumber: editContract.tenantPhone || '',
    dateOfBirth: editContract.tenantDateOfBirth || '',
    cccd: editContract.tenantCccd || '',
    cccdIssueDate: editContract.tenantCccdIssueDate || '',
    cccdIssuePlace: editContract.tenantCccdIssuePlace || '',
    permanentAddress: editContract.tenantPermanentAddress || '',
    rentAmount: editContract.rentAmount != null ? String(editContract.rentAmount) : '',
    deposit: editContract.deposit != null ? String(editContract.deposit) : '',
    depositMonths: editContract.depositMonths != null ? String(editContract.depositMonths) : '1',
    expectedReceptionDate: editContract.expectedReceptionDate || '',
    moveInDate: editContract.moveInDate || '',
    endDate: editContract.endDate || '',
  } : {
    propertyId: '',
    roomId: '',
    fullName: '',
    phoneNumber: '',
    dateOfBirth: '',
    cccd: '',
    cccdIssueDate: '',
    cccdIssuePlace: '',
    permanentAddress: '',
    rentAmount: '',
    deposit: '',
    depositMonths: '1',
    expectedReceptionDate: '',
    moveInDate: '',
    endDate: '',
  });

  // Dữ liệu định danh (SĐT/CCCD/ngày sinh/ngày-nơi cấp CCCD) mặc định bị làm mờ
  // và khoá khi sửa hợp đồng nháp — chỉ mở ra sau khi admin tick xác nhận, tránh
  // sửa nhầm dữ liệu định danh khách (giống bước xác nhận của Coursera).
  const [sensitiveUnlocked, setSensitiveUnlocked] = useState(false);
  const [confirmSensitiveEdit, setConfirmSensitiveEdit] = useState(false);
  const sensitiveLocked = isEditMode && !sensitiveUnlocked;

  // Tên nhà để hiện read-only khi sửa — tra trong danh sách ĐẦY ĐỦ (không lọc ACTIVE)
  // vì property có thể đã đổi status sau khi tạo draft, vẫn phải hiện được tên.
  const editPropertyInfo = useMemo(
    () => (isEditMode ? allProperties.find((p) => p.id === editContract!.propertyId) : undefined),
    [isEditMode, allProperties, editContract],
  );

  // Phòng đang có HĐ nháp chờ đón khách — loại khỏi dropdown phòng (draft không đổi
  // status phòng nên không lọc được bằng status). Nhà NGUYÊN CĂN có nháp thì ẩn cả nhà.
  // Nháp bị hủy/chuyển ACTIVE thì tự hết chặn (biến mất khỏi listDrafts / status đổi).
  const [draftRoomIds, setDraftRoomIds] = useState<Set<number>>(new Set());

  // Nội thất trong phạm vi HĐ — CHỈ hiển thị read-only cho admin xem trước. BE tự gắn
  // toàn bộ thiết bị ACTIVE (phòng + khu vực chung, hoặc cả căn) vào equipmentSnapshot
  // khi tạo/sửa HĐ và khi render PDF — không còn checkbox chọn, không gửi
  // selectedEquipmentIds (gửi [] bị hiểu là "không gắn gì"). Xem FE-contract-equipment-auto.md.
  const [availableEquipments, setAvailableEquipments] = useState<ContractAvailableEquipmentItem[]>([]);
  const [equipmentLoading, setEquipmentLoading] = useState(false);
  const [equipmentLoaded, setEquipmentLoaded] = useState(false);

  /**
   * Sức chứa từng nhà — nạp NGẦM ngay khi mở form, không chặn gì cả.
   *
   * Trước 24/08/2026 ô "Bất động sản" chỉ hiện tên + địa chỉ, nên admin chọn nhà mà
   * hoàn toàn không biết căn đó còn chỗ hay đã kín; phải chọn xong, đợi phòng tải về,
   * mở ô "Phòng" ra mới phát hiện hết chỗ rồi quay lại chọn căn khác.
   *
   * Nạp theo lô 6 nhà một lượt (xem `loadPropertyOccupancy`). Chưa xong thì `occupancyChip`
   * trả chuỗi rỗng và ô chọn trông y như cũ — không có trạng thái "đang tải" nào chắn
   * đường người dùng.
   */
  const [occupancy, setOccupancy] = useState<Map<number, PropertyOccupancy>>(new Map());

  useEffect(() => {
    (async () => {
      try {
        const [propPage, drafts] = await Promise.all([
          propertyService.getAllProperties(),
          tenantService.listDrafts().catch(() => [] as TenantContractResponse[]),
        ]);
        setAllProperties(propPage);
        const draftPropertyIds = new Set<number>();
        const roomIds = new Set<number>();
        drafts.forEach((d) => {
          if (d.roomId != null) roomIds.add(d.roomId);
          else draftPropertyIds.add(d.propertyId);
        });
        setDraftRoomIds(roomIds);
        /*
          `properties` = MỌI nhà đang khai thác, KHÔNG lọc thêm gì ở đây.
          Việc "căn nào chọn được" để một mình `visibleProperties` lo.

          Trước 24/08/2026 chỗ này có thêm một tầng lọc riêng — bỏ nhà nguyên căn đã có
          hồ sơ nháp. Hai tầng lọc nối tiếp làm con số "đã ẩn N nhà" nói dối: nó chỉ đếm
          phần tầng thứ hai giấu, còn phần tầng này giấu thì im lặng. Thực tế 11 nhà,
          không căn nào chọn được, mà dòng chú thích ghi "ẩn 4 nhà".

          Gộp về một chỗ cũng bỏ được trùng lặp: `capacityTone` đã coi nguyên căn có hồ
          sơ nháp là `full` rồi (`wholeHouseTaken`).
        */
        const activeProperties = propPage.filter((p) => p.status === 'ACTIVE');
        setProperties(activeProperties);
        // Đồng bộ, không request nào — BE trả sẵn số phòng trong `PropertyResponse`.
        setOccupancy(buildOccupancyMap(activeProperties, drafts));
      } catch {
        /* interceptor đã toast */
      }
    })();
  }, []);

  /**
   * Nhà thật sự chọn được — ẩn bớt nhà không còn nhận khách.
   *
   * Trước 24/08/2026 ô này đổ ra MỌI nhà ACTIVE, kể cả những căn đã kín khách hoặc đã
   * có đủ hồ sơ nháp giữ chỗ từ khâu import. Admin chọn vào, đợi phòng tải xong, rồi
   * mới nhận dòng chữ "nhà này không còn phòng trống" — mất công cho một lựa chọn đằng
   * nào cũng không dùng được.
   *
   * Hai cách xử lý cho hai nguyên nhân khác nhau:
   *   • `full`  — kín vì đã có khách / có hồ sơ chờ đón: ẨN HẲN. Không còn việc gì để
   *     làm với căn đó ở màn này.
   *   • `setup` — chưa mở phòng cho thuê / chưa tạo phòng: VẪN HIỆN nhưng khoá, kèm lý
   *     do. Ẩn đi thì căn đó biến mất khỏi mọi tầm mắt và không ai biết là nó đang cần
   *     kích hoạt phòng — một lỗi phía BE (xem `RoomsNotOpenedNote`).
   *
   * Nhà chưa nạp xong sức chứa thì cứ hiện — thà thừa một lựa chọn còn hơn giấu mất một
   * căn đang trống chỉ vì số liệu về chậm.
   */
  const visibleProperties = useMemo(
    () => properties.filter((p) => {
      const o = occupancy.get(p.id);
      return !o?.loaded || capacityTone(o) !== 'full';
    }),
    [properties, occupancy],
  );
  const hiddenFullCount = properties.length - visibleProperties.length;

  const selectedProperty = useMemo(
    () => properties.find((p) => String(p.id) === form.propertyId),
    [properties, form.propertyId],
  );
  const isWholeHouse = selectedProperty?.wholeHouse === true;

  /**
   * TRẦN của ô "Ngày kết thúc" — ngày muộn nhất còn hợp lệ.
   *
   * Là ngày SỚM HƠN trong hai mốc:
   *   • hôm nay + 5 năm      — Rule 4 của BE (`endDate.isAfter(today.plusYears(5))`)
   *   • `leaseEndDate`       — hạn hợp đồng công ty ký với CHỦ NHÀ GỐC
   *
   * ─── Vì sao phải chặn ngay ở ô chọn (30/08/2026) ────────────────────────────
   * Trước đây `max` chỉ có mốc 5 năm, còn hạn chủ nhà thì để `leaseWindowError` bắt
   * lúc bấm Lưu. Nghĩa là lịch vẫn cho bấm chọn 08/05/2031, admin điền tiếp cả form,
   * rồi mới ăn toast báo sai và phải quay lại sửa. Chặn ở ô chọn thì ngày sai KHÔNG
   * bấm được ngay từ đầu — trình duyệt tự làm mờ phần vượt trần trong lịch.
   *
   * `leaseWindowError` vẫn giữ làm lớp sau: nó bắt cả trường hợp trần chưa biết (nhà
   * chưa chọn, hoặc BE bản cũ không trả `leaseEndDate`) và cả mốc `leaseStartDate`.
   */
  const contractEndMax = useMemo(() => {
    const ruleCap = addYearsIso(todayIso(), 5);
    /*
      CHỈ áp trần khi tạo mới. Hợp đồng nháp cũ hoàn toàn có thể đã có `endDate` vượt
      trần hiện tại (hạn chủ nhà được sửa ngắn lại sau khi nháp được tạo). Ép `max` lúc
      đó khiến HTML5 coi giá trị đang có là invalid và chặn submit dù admin không hề
      đụng vào ô ngày — cùng cái bẫy đã ghi chú ở `min` bên dưới.
    */
    if (isEditMode) return ruleCap;
    const leaseEnd = selectedProperty?.leaseEndDate;
    return leaseEnd && leaseEnd < ruleCap ? leaseEnd : ruleCap;
  }, [isEditMode, selectedProperty]);

  /**
   * SÀN của ô "Ngày bắt đầu hợp đồng" — mốc muộn hơn giữa hôm nay và ngày hợp đồng
   * với chủ nhà gốc có hiệu lực. Vế đối xứng của `contractEndMax`.
   */
  const contractStartMin = useMemo(() => {
    const today = todayIso();
    const leaseStart = selectedProperty?.leaseStartDate;
    return leaseStart && leaseStart > today ? leaseStart : today;
  }, [selectedProperty]);

  /** Trần đang bị hạn chủ nhà siết (không phải mốc 5 năm) → nói rõ lý do cho admin. */
  const cappedByLease = !isEditMode
    && !!selectedProperty?.leaseEndDate
    && contractEndMax === selectedProperty.leaseEndDate;

  /**
   * Đổi nhà sau khi đã chọn ngày kết thúc → xoá ngày nếu nó vượt trần của nhà mới.
   *
   * Thuộc tính `max` chỉ chặn lúc CHỌN, không đụng tới giá trị đã nằm sẵn trong ô. Nên
   * nếu không có chỗ này: admin chọn 08/05/2031 cho một căn hạn dài, đổi sang căn hạn
   * tới 2027, ngày cũ đứng yên và trình duyệt chặn submit bằng một câu báo chung chung
   * ("Value must be ... or earlier") — không nói vì sao, cũng không chỉ được là do vừa
   * đổi nhà.
   *
   * XOÁ chứ không kẹp về đúng trần: kẹp là tự chọn hộ một ngày admin chưa từng đồng ý,
   * mà đây là ngày kết thúc hợp đồng.
   */
  useEffect(() => {
    if (isEditMode || !form.endDate || form.endDate <= contractEndMax) return;
    setForm((prev) => ({ ...prev, endDate: '' }));
    toast(
      `Đã xoá ngày kết thúc: nhà này chỉ cho thuê tới ${formatDateDisplay(contractEndMax)} `
      + '(hạn hợp đồng với chủ nhà). Vui lòng chọn lại.',
      { icon: '📅', duration: 6000 },
    );
  }, [contractEndMax, form.endDate, isEditMode]);

  /**
   * Hợp đồng khách phải nằm TRỌN trong hợp đồng thuê nhà ký với chủ nhà gốc.
   *
   *   • Vào ở trước ngày HĐ chủ nhà hiệu lực ⇒ cho thuê căn công ty chưa có quyền quản lý.
   *   • Kết thúc sau hạn HĐ chủ nhà ⇒ tới ngày trả nhà vẫn còn khách bên trong.
   *
   * BE đã chặn cứng (`InboundLeaseRules.assertOccupancyWindow`) nên đây chỉ là lớp chặn sớm
   * cho đỡ mất công: báo ngay lúc bấm thay vì gõ xong cả form mới nhận 400 từ server.
   * `leaseStartDate` / `leaseEndDate` do BE mở thêm trong `GET /properties/{id}` (19/08/2026)
   * — trước đó màn này không có cách nào biết hạn hợp đồng chủ nhà.
   */
  const leaseWindowError = useCallback((propertyId?: number | string): string | null => {
    const p = allProperties.find((x) => String(x.id) === String(propertyId));
    if (!p?.leaseStartDate && !p?.leaseEndDate) return null; // BE bản cũ chưa trả — để BE tự chặn

    const fmt = (d: string) => d.split('-').reverse().join('/');
    /*
      So bằng NGÀY BẮT ĐẦU HỢP ĐỒNG, không phải ngày dự kiến đón khách.

      Cửa sổ mà BE kiểm (`assertOccupancyWindow`) là khoảng khách CHIẾM DỤNG căn nhà,
      tức từ `moveInDate`. Ngày đón khách chỉ là lịch hẹn của quản lý — hai ngày đó
      được phép lệch nhau, và khi lệch thì lớp chặn sớm này so sai mốc: hoặc báo lỗi
      oan, hoặc cho qua rồi để BE trả 400 đúng thứ mà nó đáng lẽ phải chặn từ đây.
    */
    const moveIn = form.moveInDate;
    if (p.leaseStartDate && moveIn && moveIn < p.leaseStartDate) {
      return `Ngày bắt đầu hợp đồng (${fmt(moveIn)}) sớm hơn ngày hợp đồng với chủ nhà có hiệu lực `
        + `(${fmt(p.leaseStartDate)}). Công ty chưa có quyền quản lý căn này trước ngày đó.`;
    }
    if (p.leaseEndDate && form.endDate && form.endDate > p.leaseEndDate) {
      return `Ngày kết thúc hợp đồng khách (${fmt(form.endDate)}) vượt quá hạn hợp đồng với `
        + `chủ nhà (${fmt(p.leaseEndDate)}). Tới ngày trả nhà sẽ vẫn còn khách bên trong.`;
    }
    return null;
  }, [allProperties, form.moveInDate, form.endDate]);

  // Khi đổi property: nạp phòng (nếu chia phòng). Quản lý phụ trách LUÔN LÀ
  // operationManagerId có sẵn của nhà — nhà đã đi vào hoạt động thì admin đã gán quản
  // lý từ trước, không cho chọn tay ở đây nữa (tránh gán nhầm khác người phụ trách thật).
  useEffect(() => {
    if (!selectedProperty) {
      setRooms([]);
      setAllRoomsInProperty([]);
      return;
    }
    if (selectedProperty.wholeHouse === true) {
      setRooms([]);
      setAllRoomsInProperty([]);
      return;
    }
    setLoadingRooms(true);
    propertyService
      .getRooms(selectedProperty.id)
      .then((rs) => {
        setAllRoomsInProperty(rs);
        // Chỉ cho chọn phòng AVAILABLE — phòng đang có khách (RENTED), đang bảo trì
        // (MAINTENANCE) hay ĐÃ CÓ HĐ NHÁP chờ đón khách không được vào dropdown.
        // Lý do cụ thể hiện ở message bên dưới.
        setRooms(rs.filter((r) => r.status === 'AVAILABLE' && !draftRoomIds.has(r.id)));
      })
      .catch(() => { setRooms([]); setAllRoomsInProperty([]); })
      .finally(() => setLoadingRooms(false));
  }, [selectedProperty, draftRoomIds]);

  // Sửa draft: lấy danh sách nội thất trong phạm vi HĐ từ chi tiết (editContract truyền
  // vào có thể là bản rút gọn từ danh sách, gọi lại getById cho chắc mới nhất).
  useEffect(() => {
    if (!isEditMode || !editContract) return;
    setEquipmentLoading(true);
    setEquipmentLoaded(false);
    tenantService
      .getById(editContract.id)
      .then((full) => {
        setAvailableEquipments(full.availableEquipmentList ?? []);
        setMembers((full.householdMembers ?? []).map((m, i) => ({
          key: `m-${i}`,
          fullName: m.fullName ?? '',
          relation: m.relation ?? '',
          phone: m.phone ?? '',
        })));
        setEquipmentLoaded(true);
      })
      .catch(() => { /* interceptor đã toast */ })
      .finally(() => setEquipmentLoading(false));
  }, [isEditMode, editContract]);

  // Tạo mới: nạp danh sách nội thất theo phạm vi HĐ (phòng + khu vực chung, hoặc cả
  // căn nếu nguyên căn) ngay khi đã đủ property (+ room nếu chia phòng) — chỉ để admin
  // xem trước; BE sẽ tự gắn đúng danh sách ACTIVE này khi tạo HĐ.
  useEffect(() => {
    if (isEditMode) return;
    if (!selectedProperty || (!isWholeHouse && !form.roomId)) {
      setAvailableEquipments([]);
      setEquipmentLoaded(false);
      return;
    }
    setEquipmentLoading(true);
    setEquipmentLoaded(false);
    tenantService
      .getContractAvailableEquipments(selectedProperty.id, isWholeHouse ? null : Number(form.roomId))
      .then((list) => {
        setAvailableEquipments(list);
        setEquipmentLoaded(true);
      })
      .catch(() => { setAvailableEquipments([]); })
      .finally(() => setEquipmentLoading(false));
  }, [isEditMode, selectedProperty, isWholeHouse, form.roomId]);

  // Đếm phòng không-sẵn-sàng theo status để giải thích cho admin (thay vì chỉ báo
  // chung chung "hết phòng trống" — dễ khiến admin tưởng nhầm là lỗi hệ thống).
  const unavailableRoomsBreakdown = useMemo(() => {
    if (rooms.length > 0 || allRoomsInProperty.length === 0) return '';
    const counts: Record<string, number> = {};
    allRoomsInProperty.forEach((r) => {
      if (r.status !== 'AVAILABLE') counts[r.status] = (counts[r.status] ?? 0) + 1;
      else if (draftRoomIds.has(r.id)) counts.HAS_DRAFT = (counts.HAS_DRAFT ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([status, n]) => `${n} ${ROOM_STATUS_LABEL[status] ?? status.toLowerCase()}`)
      .join(', ');
  }, [rooms, allRoomsInProperty, draftRoomIds]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  /**
   * Chỉ ghi `roomId`. Giá thuê do effect đồng bộ với `approvedRent` lo (xem bên dưới).
   *
   * Trước 24/08/2026 chính hàm này tự điền `rentAmount` từ `room.price`. Hệ quả: NHÀ
   * NGUYÊN CĂN không có ô chọn phòng nên hàm không bao giờ chạy, và ô giá thuê đứng
   * nguyên ở 0đ dù host đã duyệt 37.500.000đ — cọc cũng theo đó mà ra 0.
   */
  const handleRoomChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, roomId: e.target.value }));
  };

  // Tra cứu SĐT để cảnh báo role không hợp lệ (ADMIN/MANAGER/HOST).
  const handlePhoneBlur = async () => {
    const phone = form.phoneNumber.trim();
    if (phone.length < 9) return;
    try {
      const r = await tenantService.lookupByPhone(phone);
      setLookupChecked(true);
      setLookupRole(r.exists ? r.role ?? null : null);
      setLookupEligible(r.exists ? r.eligible ?? null : null);
      if (r.exists) {
        setForm((prev) => ({
          ...prev,
          fullName: prev.fullName || r.fullName || '',
          cccd: prev.cccd || r.cccd || '',
          dateOfBirth: prev.dateOfBirth || r.dateOfBirth || '',
          cccdIssueDate: prev.cccdIssueDate || r.cccdIssueDate || '',
          cccdIssuePlace: prev.cccdIssuePlace || r.cccdIssuePlace || '',
          permanentAddress: prev.permanentAddress || r.permanentAddress || '',
        }));
      }
    } catch {
      /* bỏ qua */
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setExtracting(true);
    const isOldDoc = file.name.toLowerCase().endsWith('.doc') && !file.name.toLowerCase().endsWith('.docx');
    try {
      if (isOldDoc) {
        const url = await uploadToCloudinary(file, 'raw');
        setDraftFileUrl(url);
        toast('File .doc cũ chỉ lưu được, không tự bóc tách. Vui lòng nhập tay.', { icon: 'ℹ️' });
      } else {
        const [extracted, url] = await Promise.all([
          extractTenantContractData(file),
          uploadToCloudinary(file, 'raw'),
        ]);
        setDraftFileUrl(url);
        setForm((prev) => ({
          ...prev,
          fullName: extracted.tenantName || prev.fullName,
          cccd: extracted.tenantCccd || prev.cccd,
          phoneNumber: extracted.tenantPhone || prev.phoneNumber,
          rentAmount: extracted.rentAmount > 0 ? String(extracted.rentAmount) : prev.rentAmount,
          deposit: extracted.deposit > 0 ? String(extracted.deposit) : prev.deposit,
          /*
            `extracted.startDate` bóc từ file là NGÀY BẮT ĐẦU HỢP ĐỒNG in trên giấy —
            nên đổ vào `moveInDate` trước hết. Vẫn điền luôn ô "dự kiến đón khách" vì
            đa số hợp đồng hai ngày trùng nhau, và admin sửa lại được nếu lịch hẹn khác.
          */
          expectedReceptionDate: extracted.startDate || prev.expectedReceptionDate,
          moveInDate: extracted.startDate || prev.moveInDate,
          endDate: extracted.endDate || prev.endDate,
        }));

        // Gợi ý nhà theo TÊN NHÀ + địa chỉ bóc từ file (so khớp mờ, chịu được sai
        // chính tả 1 ký tự) — chỉ tự chọn nếu admin CHƯA chọn tay, và chỉ khớp trong
        // danh sách nhà đang ACTIVE (sẵn sàng cho thuê).
        const propertyHint = `${extracted.propertyName} ${extracted.address}`.trim();
        if (propertyHint) {
          const match = suggestPropertyByAddress(propertyHint, properties);
          if (match) {
            setForm((prev) => ({ ...prev, propertyId: prev.propertyId || String(match.property.id) }));
            const exact =
              extracted.propertyName &&
              normalizeText(extracted.propertyName) === normalizeText(match.property.propertyName);
            setAddressSuggestion(
              exact
                ? `Đã chọn nhà "${match.property.propertyName}" đúng theo tên ghi trong file.`
                : `Đã gợi ý nhà "${match.property.propertyName}" theo tên/địa chỉ trong file (khớp gần đúng — có thể file ghi sai chính tả). Vui lòng kiểm tra lại.`,
            );
          } else {
            // Không khớp nhà nào đang sẵn sàng — thử tìm trong TOÀN BỘ danh sách để
            // báo rõ nguyên nhân (vd nhà đúng địa chỉ nhưng đang bảo trì/hết hạn).
            const blocked = suggestPropertyByAddress(propertyHint, allProperties);
            setAddressSuggestion(
              blocked
                ? `Tên/địa chỉ trong file khớp với nhà "${blocked.property.propertyName}" nhưng nhà này hiện KHÔNG sẵn sàng cho thuê (${PROPERTY_STATUS_LABEL[blocked.property.status] ?? blocked.property.status}). Vui lòng chọn nhà khác hoặc kiểm tra lại.`
                : 'Không tự tìm được nhà khớp với tên/địa chỉ trong file — vui lòng chọn tay.',
            );
          }
        } else {
          setAddressSuggestion('');
        }
        // Đếm field chính bóc được — bóc rỗng mà vẫn toast success làm admin tưởng
        // đã đủ dữ liệu rồi lưu thiếu.
        const gotCount = [
          extracted.tenantName, extracted.tenantCccd, extracted.tenantPhone,
          extracted.rentAmount > 0 ? 'x' : '', extracted.deposit > 0 ? 'x' : '',
        ].filter(Boolean).length;
        if (gotCount === 0) {
          toast('Đã lưu file nhưng KHÔNG bóc tách được thông tin nào — vui lòng nhập tay.', { icon: '⚠️' });
        } else if (gotCount < 3) {
          toast(`Chỉ bóc tách được ${gotCount}/5 thông tin chính — kiểm tra và bổ sung phần còn thiếu.`, { icon: '⚠️' });
        } else {
          toast.success('Đã bóc tách thông tin từ file — vui lòng kiểm tra lại.');
        }
      }
    } catch {
      toast.error('Không xử lý được file — kiểm tra lại định dạng (nên dùng DOCX/PDF số hoá).');
    } finally {
      setExtracting(false);
    }
  };

  // Ưu tiên cờ `eligible` do BE trả; nếu BE không trả thì tự suy từ role.
  const roleWarning =
    lookupChecked &&
    (lookupEligible === null ? !isTenantEligibleRole(lookupRole ?? undefined) : !lookupEligible);

  // Validate realtime — chỉ báo lỗi khi ĐÃ nhập (không đỏ lòm form trống), chặn ở submit.
  const phoneInvalid = form.phoneNumber.trim() !== '' && !VN_PHONE_RE.test(normalizePhone(form.phoneNumber.trim()));
  const cccdInvalid = form.cccd.trim() !== '' && !VN_CCCD_RE.test(form.cccd.trim());
  // So sánh chuỗi ISO yyyy-MM-dd trực tiếp — thứ tự từ điển trùng thứ tự thời gian.
  const dobInvalid = !!form.dateOfBirth && (form.dateOfBirth < DOB_MIN || form.dateOfBirth > DOB_MAX);

  // Cọc lệch chuẩn (giá thuê × số tháng cọc) — CHỈ CẢNH BÁO, không chặn submit vì có
  // trường hợp hợp lệ admin cố ý thương lượng cọc khác chuẩn.
  const standardDeposit = calcDeposit(form.rentAmount, form.depositMonths);
  const depositMismatch = form.rentAmount !== '' && form.deposit !== '' && form.deposit !== standardDeposit;

  /**
   * GIÁ DUYỆT — giá Host đã chốt cho nhà/phòng này.
   *
   * Nhà nguyên căn thì giá nằm ở `property.price`; nhà chia phòng thì ở `room.price`.
   * Đây là con số Host phê duyệt để kinh doanh, nên hợp đồng lệch khỏi nó là chuyện
   * PHẢI thấy được — trước đây ô giá thuê tự do gõ, lệch bao nhiêu cũng lưu im lặng,
   * làm mất hết ý nghĩa của bước duyệt giá và không truy được ai đã hạ giá.
   *
   * 🎯 MÔ HÌNH ĐÃ CHỐT (PO 15/08/2026, BE làm xong cùng ngày):
   * giá hợp đồng LUÔN BẰNG giá niêm yết. Thương lượng xong thì Host cập nhật giá
   * ở màn chi tiết nhà TRƯỚC, rồi ô này chỉ đọc — không gõ tay được nữa.
   *
   * Nhờ vậy chuyện "lệch giá" không còn xảy ra để mà phải xử lý: không có đường nào
   * nhập một con số Host chưa duyệt. BE cũng tự kiểm lại nên gọi thẳng API cũng không lách được.
   */
  const approvedRent = useMemo(() => {
    if (!selectedProperty) return null;
    if (isWholeHouse) {
      const p = selectedProperty.listedPrice ?? selectedProperty.price;
      return p != null ? Number(p) : null;
    }
    const room = allRoomsInProperty.find((r) => String(r.id) === form.roomId);
    const p = room?.listedPrice ?? room?.price;
    return p != null ? Number(p) : null;
  }, [selectedProperty, isWholeHouse, allRoomsInProperty, form.roomId]);

  /** Đã tra được giá niêm yết → ô giá thuê chỉ đọc, lấy thẳng số đó. */
  const rentLocked = approvedRent != null && approvedRent > 0;

  /**
   * Đổ giá niêm yết vào ô giá thuê — NGUỒN DUY NHẤT, cho cả nguyên căn lẫn chia phòng.
   *
   * Trước đây việc này nằm trong `handleRoomChange`, tức là chỉ chạy khi CHỌN PHÒNG.
   * Nhà nguyên căn không có ô phòng nên ô giá đứng ở 0đ trong khi ô chú thích vẫn nói
   * "Lấy theo giá niêm yết Host đã duyệt" — và vì ô này `readOnly` khi đã tra được giá,
   * admin cũng không gõ tay chữa được. Cọc tính theo giá nên cũng ra 0 luôn.
   *
   * Chỉ ghi khi tra được giá > 0: `approvedRent` null nghĩa là chưa chọn xong nhà/phòng,
   * lúc đó ô mở cho gõ tay và có thể đang giữ số đọc từ file PDF upload — đừng xoá.
   * Sửa HĐ cũ thì bỏ qua hẳn, giá đã ký không được tự đổi theo giá niêm yết hiện tại.
   */
  useEffect(() => {
    if (isEditMode || approvedRent == null || approvedRent <= 0) return;
    const next = String(approvedRent);
    setForm((prev) => (prev.rentAmount === next
      ? prev
      : { ...prev, rentAmount: next, deposit: calcDeposit(next, prev.depositMonths) }));
  }, [approvedRent, isEditMode]);

  // Có field định danh nào thực sự bị đổi so với dữ liệu gốc không — chỉ khi
  // TRUE mới bắt buộc phải tick xác nhận trước khi lưu (sửa các field khác của
  // HĐ không cần xác nhận lại).
  const sensitiveFieldsChanged = isEditMode && editContract
    ? normalizePhone(form.phoneNumber.trim()) !== normalizePhone(editContract.tenantPhone || '') ||
      form.cccd.trim() !== (editContract.tenantCccd || '') ||
      form.dateOfBirth !== (editContract.tenantDateOfBirth || '') ||
      form.cccdIssueDate !== (editContract.tenantCccdIssueDate || '') ||
      form.cccdIssuePlace.trim() !== (editContract.tenantCccdIssuePlace || '')
    : false;

  // Tên phòng để hiện trong panel tóm tắt trước khi lưu.
  const selectedRoomNumber = isEditMode
    ? editContract!.roomNumber
    : rooms.find((r) => String(r.id) === form.roomId)?.roomNumber;
  const summaryPropertyName = isEditMode ? editPropertyInfo?.propertyName : selectedProperty?.propertyName;

  // Sửa hợp đồng nháp: PUT thông tin → render lại PDF → upload Cloudinary → PUT URL
  // mới (đúng quy trình BE yêu cầu — không có bước này thì file cũ lệch dữ liệu mới).
  const handleUpdateSubmit = async () => {
    if (!editContract) return;
    setSubmitting(true);
    setSubmitStage('Đang cập nhật hợp đồng...');
    try {
      await tenantService.updateDraft(editContract.id, {
        fullName: form.fullName.trim(),
        cccd: form.cccd.trim(),
        phoneNumber: normalizePhone(form.phoneNumber.trim()),
        dateOfBirth: form.dateOfBirth || undefined,
        cccdIssueDate: form.cccdIssueDate || undefined,
        cccdIssuePlace: form.cccdIssuePlace.trim() || undefined,
        permanentAddress: form.permanentAddress.trim() || undefined,
        moveInDate: form.moveInDate || undefined,
        rentAmount: Number(form.rentAmount),
        deposit: Number(form.deposit),
        depositMonths: Number(form.depositMonths) || 1,
        endDate: form.endDate || undefined,
        expectedReceptionDate: form.expectedReceptionDate || undefined,
        // Chỉ gửi khi đã prefill xong từ getById — gửi sớm sẽ xóa nhầm thành viên cũ.
        householdMembers: equipmentLoaded ? membersPayload() : undefined,
        // KHÔNG gửi selectedEquipmentIds — BE tự đồng bộ toàn bộ nội thất ACTIVE khi
        // PUT draft / render PDF (FE-contract-equipment-auto.md).
      });

      setSubmitStage('Đang tạo lại file hợp đồng...');
      try {
        const blob = await tenantService.generateDraftDocument(editContract.id);
        // PDF theo spec mới — draftBlobToFile tự nhận diện, vẫn đúng nếu BE còn trả DOCX.
        const pdfFile = await draftBlobToFile(blob, editContract.contractCode);
        setSubmitStage('Đang tải file lên...');
        const url = await uploadToCloudinary(pdfFile, 'raw');
        await tenantService.updateDraft(editContract.id, { draftContractFileUrl: url });
        toast.success('Đã cập nhật hợp đồng nháp & tạo lại file.');
      } catch {
        toast.error('Đã cập nhật thông tin nhưng KHÔNG tạo lại được file — có thể thử lại.');
      }
      onSuccess();
      onClose();
    } catch {
      /* interceptor đã toast */
    } finally {
      setSubmitting(false);
      setSubmitStage('');
    }
  };

  // Validate toàn bộ form rồi mở panel tóm tắt — CHƯA gọi API. Bấm "Xác nhận & Lưu" ở
  // panel đó mới thực sự chạy chuỗi submit (xem confirmSubmit bên dưới).
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneInvalid) return toast.error('SĐT không đúng định dạng Việt Nam (10 số, đầu 03/05/07/08/09).');
    if (cccdInvalid) return toast.error('CCCD phải gồm đúng 12 chữ số.');
    if (dobInvalid) return toast.error('Ngày sinh không hợp lệ — khách phải sinh từ 1930 và đủ 18 tuổi.');
    if (roleWarning) return toast.error('SĐT thuộc tài khoản nội bộ — không thể onboard làm khách.');
    if (sensitiveFieldsChanged && !confirmSensitiveEdit) {
      return toast.error('Vui lòng tick xác nhận trước khi lưu thay đổi thông tin định danh (SĐT/CCCD/ngày sinh).');
    }
    // Không còn guard "lệch giá": ô giá thuê giờ CHỈ ĐỌC, lấy thẳng giá niêm yết —
    // không có đường nào nhập lệch nữa. BE cũng tự kiểm lại nên gọi API cũng không lách được.
    if (!isEditMode) {
      if (!selectedProperty) return toast.error('Vui lòng chọn bất động sản');
      if (!isWholeHouse && !form.roomId) return toast.error('Vui lòng chọn phòng');
      if (!selectedProperty.operationManagerId) {
        return toast.error('Nhà này chưa có quản lý phụ trách — vui lòng gán quản lý cho nhà trước khi tạo hợp đồng.');
      }
      // Chặn ở đây thay cho nhánh `|| todayIso()` cũ: thiếu ngày bắt đầu thì phải HỎI,
      // không được tự chọn hộ rồi ghi vào hợp đồng.
      if (!form.moveInDate) return toast.error('Vui lòng chọn ngày bắt đầu hợp đồng.');
    }
    if (form.moveInDate && form.endDate && form.endDate <= form.moveInDate) {
      return toast.error('Ngày kết thúc phải sau ngày bắt đầu hợp đồng.');
    }

    // Không được cho thuê ngoài phạm vi hợp đồng với chủ nhà gốc. BE đã chặn cứng
    // (InboundLeaseRules.assertOccupancyWindow), nhưng chặn luôn ở đây để admin biết ngay
    // lúc nhập thay vì gõ xong cả form mới bị server trả 400.
    const leaseError = leaseWindowError(
      isEditMode ? editContract?.propertyId : selectedProperty?.id,
    );
    if (leaseError) return toast.error(leaseError, { duration: 7000 });

    setShowSummary(true);
  };

  const confirmSubmit = async () => {
    setShowSummary(false);
    if (isEditMode) return handleUpdateSubmit();
    if (!selectedProperty) return;

    // KHÔNG còn nhánh `|| todayIso()`: ngày bắt đầu nay là trường bắt buộc, đã chặn ở
    // handleSubmit. Nhánh cũ khiến hợp đồng khởi đầu vào một ngày không ai chọn.
    const moveInDate = form.moveInDate;
    const payload: OnboardTenantRequest = {
      fullName: form.fullName.trim(),
      cccd: form.cccd.trim(),
      phoneNumber: normalizePhone(form.phoneNumber.trim()),
      dateOfBirth: form.dateOfBirth || undefined,
      cccdIssueDate: form.cccdIssueDate || undefined,
      cccdIssuePlace: form.cccdIssuePlace.trim() || undefined,
      permanentAddress: form.permanentAddress.trim() || undefined,
      moveInDate,
      rentAmount: Number(form.rentAmount),
      deposit: Number(form.deposit),
      depositMonths: Number(form.depositMonths) || 1,
      endDate: form.endDate || undefined,
      expectedReceptionDate: form.expectedReceptionDate || undefined,
      draftContractFileUrl: draftFileUrl || undefined,
      householdMembers: membersPayload().length > 0 ? membersPayload() : undefined,
      // Nội thất có sẵn: BE tự gắn toàn bộ ACTIVE trong phạm vi HĐ — không gửi gì.
    };

    setSubmitting(true);
    setSubmitStage('Đang tạo hợp đồng nháp...');
    try {
      const draft = await tenantService.createDraft(
        selectedProperty.id,
        isWholeHouse ? null : Number(form.roomId),
        payload,
      );

      // handleSubmit đã chặn khi property chưa có operationManagerId, nên tới đây
      // BE luôn tự gán quản lý phụ trách nhà cho hợp đồng — không cần gọi API riêng.
      const managerName = selectedProperty.operationManagerName || 'quản lý phụ trách';

      // Tạo tay (không phải import file có sẵn) → BE render PDF từ dữ liệu vừa
      // nhập, upload Cloudinary, lưu URL — admin có thể xem lại ngay. Import file thì
      // đã có draftFileUrl từ bước upload trong handleFileUpload, không sinh lại.
      let finalFileUrl = draftFileUrl || null;
      if (mode === 'manual') {
        setSubmitStage('Đang tạo file hợp đồng...');
        try {
          const blob = await tenantService.generateDraftDocument(draft.id);
          const pdfFile = await draftBlobToFile(blob, draft.contractCode);
          setSubmitStage('Đang tải file lên...');
          const url = await uploadToCloudinary(pdfFile, 'raw');
          await tenantService.updateDraft(draft.id, { draftContractFileUrl: url });
          finalFileUrl = url;
        } catch {
          toast.error('Đã tạo hợp đồng nháp nhưng KHÔNG sinh được file — có thể tạo lại ở danh sách nháp.');
        }
      }

      toast.success(`Đã tạo hợp đồng nháp & gửi thông báo cho ${managerName}.`);
      onSuccess();
      setSuccessView({
        draftId: draft.id,
        contractCode: draft.contractCode || null,
        hasFile: Boolean(finalFileUrl),
        managerName,
      });
    } catch {
      /* interceptor đã toast */
    } finally {
      setSubmitting(false);
      setSubmitStage('');
    }
  };

  // Sau khi tạo thành công — panel kết quả thay cho form (view file + đóng).
  if (successView) {
    const viewCreatedContract = async () => {
      setViewingCreated(true);
      try {
        const blob = await tenantService.viewContractDocument(successView.draftId);
        openContractBlob(blob, successView.contractCode);
      } catch {
        toast.error('Không tải được file hợp đồng.');
      } finally {
        setViewingCreated(false);
      }
    };
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <div className="relative mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <h2 className="text-lg font-bold text-slate-900">Đã tạo hợp đồng nháp</h2>
            <p className="text-sm text-slate-500">Đã gửi thông báo cho {successView.managerName}.</p>
            {successView.hasFile && (
              <button
                onClick={viewCreatedContract}
                disabled={viewingCreated}
                className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
              >
                <FileText className="h-4 w-4" />
                {viewingCreated ? 'Đang tải...' : 'Xem hợp đồng nháp'}
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={onClose} className="btn-primary mt-2 w-full">Đóng</button>
          </div>
        </div>
      </div>
    );
  }

  // Panel tóm tắt — bước xác nhận cuối trước khi thực sự gọi API (tạo/sửa + gán
  // manager + render PDF là 1 chuỗi tốn kém, sai sót phát hiện muộn khó sửa).
  if (showSummary) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <div className="relative mx-4 max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
          <h2 className="text-lg font-bold text-slate-900">Xác nhận thông tin</h2>
          <p className="mt-0.5 text-xs text-slate-500">Kiểm tra lại trước khi lưu — sau bước này sẽ tạo/gán manager/sinh file.</p>

          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Bất động sản</dt>
              <dd className="text-right font-medium text-slate-800">
                {summaryPropertyName || '—'}{selectedRoomNumber ? ` — P.${selectedRoomNumber}` : ' — Nguyên căn'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Khách thuê</dt>
              <dd className="text-right font-medium text-slate-800">{form.fullName || '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">SĐT / CCCD</dt>
              <dd className="text-right font-medium text-slate-800">{normalizePhone(form.phoneNumber)} / {form.cccd}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Ngày sinh</dt>
              <dd className="text-right font-medium text-slate-800">{formatDateDisplay(form.dateOfBirth)}</dd>
            </div>
            {(form.cccdIssueDate || form.cccdIssuePlace) && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">CCCD cấp</dt>
                <dd className="text-right font-medium text-slate-800">
                  {formatDateDisplay(form.cccdIssueDate)}{form.cccdIssuePlace ? ` — ${form.cccdIssuePlace}` : ''}
                </dd>
              </div>
            )}
            {form.permanentAddress && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">Hộ khẩu thường trú</dt>
                <dd className="text-right font-medium text-slate-800">{form.permanentAddress}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Giá thuê</dt>
              <dd className="text-right font-medium text-slate-800">{formatVndDisplay(form.rentAmount)} đ/tháng</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Tiền cọc</dt>
              <dd className="text-right font-medium text-slate-800">
                {formatVndDisplay(form.deposit)} đ ({form.depositMonths} tháng)
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Dự kiến đón khách</dt>
              <dd className="text-right font-medium text-slate-800">{formatDateDisplay(form.expectedReceptionDate)}</dd>
            </div>
            {/* Ngày bắt đầu là mốc tính tiền — phải nằm trong bảng xác nhận cuối cùng,
                không thể để admin bấm "Tạo" mà chưa từng thấy nó một lần. */}
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Bắt đầu HĐ</dt>
              <dd className="text-right font-medium text-slate-800">{formatDateDisplay(form.moveInDate)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Kết thúc HĐ</dt>
              <dd className="text-right font-medium text-slate-800">{formatDateDisplay(form.endDate)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">Nội thất bàn giao</dt>
              <dd className="text-right font-medium text-slate-800">
                {equipmentLoaded ? `${availableEquipments.length} món (tự gắn toàn bộ)` : '—'}
              </dd>
            </div>
          </dl>

          {depositMismatch && (
            <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
              <ShieldAlert className="h-4 w-4 flex-shrink-0" />
              <p>Cọc đang khác chuẩn (giá thuê × số tháng = {formatVndDisplay(standardDeposit)} đ) — vẫn tiếp tục nếu đây là chủ ý.</p>
            </div>
          )}

          <div className="mt-5 flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button type="button" onClick={() => setShowSummary(false)} className="btn-secondary" disabled={submitting}>
              Quay lại sửa
            </button>
            <button type="button" onClick={confirmSubmit} className="btn-primary" disabled={submitting}>
              {submitting ? (submitStage || 'Đang lưu...') : 'Xác nhận & Lưu'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className={`relative mx-4 max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white shadow-xl ${isEditMode ? 'max-w-3xl' : 'max-w-2xl'}`}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{isEditMode ? 'Sửa hợp đồng nháp' : 'Tạo hợp đồng nháp'}</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {isEditMode
                ? `${editContract!.contractCode || ''} — sửa xong sẽ tạo lại file hợp đồng`
                : 'Đón khách v2 — nhập thông tin khách sau khi xem nhà'}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {/* Tabs — chỉ khi tạo mới; sửa thì luôn nhập tay trực tiếp */}
          {!isEditMode && <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setMode('upload')}
              className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition ${
                mode === 'upload' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              <UploadCloud className="h-4 w-4" /> Upload file (auto-điền)
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition ${
                mode === 'manual' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              <Keyboard className="h-4 w-4" /> Nhập tay
            </button>
          </div>}

          {!isEditMode && mode === 'upload' && (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center hover:border-indigo-400">
              {extracting ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                  <span className="text-sm text-slate-500">Đang bóc tách & tải file...</span>
                </>
              ) : draftFileUrl || fileName ? (
                <>
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <FileText className="h-4 w-4" /> {fileName || 'Đã tải file'}
                  </span>
                  <span className="text-xs text-slate-400">Kiểm tra lại các trường bên dưới trước khi lưu.</span>
                </>
              ) : (
                <>
                  <UploadCloud className="h-6 w-6 text-slate-400" />
                  <span className="text-sm font-medium text-slate-600">Chọn file hợp đồng (DOCX/PDF) đã điền thông tin khách</span>
                  <span className="text-xs text-slate-400">Hệ thống tự bóc tách tên, CCCD, SĐT, giá, cọc, thời hạn.</span>
                </>
              )}
              <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFileUpload} disabled={extracting} />
            </label>
          )}

          {!isEditMode && mode === 'upload' && addressSuggestion && (
            <div className="flex gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-700">
              <FileText className="h-4 w-4 flex-shrink-0" />
              <p>{addressSuggestion}</p>
            </div>
          )}

          {/* Chọn BĐS + phòng — sửa thì hiện read-only (không đổi phòng/nhà của HĐ nháp) */}
          {isEditMode ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              <span className="font-semibold text-slate-800">{editPropertyInfo?.propertyName || 'Bất động sản'}</span>
              {editContract!.roomNumber ? ` — Phòng ${editContract!.roomNumber}` : ' — Nguyên căn'}
            </div>
          ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className={isWholeHouse ? 'sm:col-span-2' : ''}>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Bất động sản <span className="text-rose-500">*</span>
              </label>
              {/*
                Ô chọn có TÌM KIẾM (`PropertyPicker`), thay cho `<select>` gốc.
                Với hơn 100 căn mà mọi tên đều bắt đầu bằng "MTX#", `<select>` gốc là ngõ
                cụt: nó chỉ nhảy theo ký tự đầu của nhãn nên gõ gì cũng vô ích, admin
                buộc phải cuộn tay để dò. Xem chú thích đầu `PropertyPicker.tsx`.
              */}
              <PropertyPicker
                properties={visibleProperties}
                occupancy={occupancy}
                value={form.propertyId}
                onChange={(id) => setForm((prev) => ({ ...prev, propertyId: id, roomId: '' }))}
              />

              {/* Nói rõ đã giấu bớt. Im lặng thì admin tìm một căn quen thuộc, không
                  thấy, tưởng nhà bị xoá khỏi hệ thống. */}
              {/*
                Dùng đúng chữ "hết chỗ" như nhãn trên thẻ sức chứa và chip lọc — cùng một
                tình trạng thì phải cùng một tên, đừng chỗ này "kín khách" chỗ kia "hết chỗ".

                Tách riêng trường hợp ẩn HẾT: lúc đó ô chọn rỗng trơn, mà một dòng "đã ẩn
                N nhà" thì không nói cho admin biết là họ đang bế tắc và phải làm gì.
              */}
              {visibleProperties.length === 0 && properties.length > 0 ? (
                <p className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                  Cả {properties.length} nhà đang khai thác đều hết chỗ — không còn phòng nào
                  nhận thêm khách. Chờ có khách trả phòng, hoặc tiếp nhận thêm nhà mới.
                </p>
              ) : hiddenFullCount > 0 && (
                <p className="mt-1 text-xs text-slate-400">
                  Chỉ hiện nhà còn chỗ — {hiddenFullCount}/{properties.length} nhà hết chỗ đã được ẩn.
                </p>
              )}

              {/*
                Bảng sức chứa của căn đang chọn.
                Tách khỏi nhãn `<option>` vì ở đây mới đủ chỗ nói VÌ SAO những phòng kia
                không dùng được — "hết chỗ" mà không nói lý do thì admin tưởng hệ thống lỗi.
              */}
              {selectedProperty && (() => {
                const occ = occupancy.get(selectedProperty.id);
                if (!occ?.loaded) return null;
                return (
                  <div className={`mt-2 rounded-lg border px-3 py-2.5 ${TONE_CARD[capacityTone(occ)]}`}>
                    {/* Cùng bố cục với khối "Chỗ trống theo nhà" ở trang Hồ sơ đón khách —
                        cùng một câu hỏi thì không nên mỗi màn một kiểu trình bày. */}
                    <div className="flex items-start gap-3">
                      <CapacityStat occ={occ} />
                      <div className="min-w-0 flex-1">
                        <RoomSquares occ={occ} />
                        <CapacityBreakdown occ={occ} />
                        {!!occ.availableRoomNumbers.length && (
                          <p className="mt-1 text-[11px] text-slate-500">
                            Nhận được khách: {occ.availableRoomNumbers.join(', ')}
                          </p>
                        )}
                      </div>
                    </div>

                    {/*
                      Hồ sơ nhà khai N phòng nhưng thực tế tạo M phòng. Nói ở đây vì đây là
                      lúc admin đang chuẩn bị xếp khách vào — biết trước thì đi hỏi lại chủ
                      nhà, thay vì soạn xong hợp đồng rồi mới phát hiện không có phòng đó.
                    */}
                    <RoomCountMismatchNote occ={occ} />
                    {/* Không kèm nút mở phòng ở đây: form này đang dở việc soạn hợp đồng,
                        đổi trạng thái phòng giữa chừng là trộn hai việc vào nhau. Chỉ nói
                        vì sao ô "Phòng" không có gì để chọn. */}
                    <RoomsNotOpenedNote occ={occ} />
                  </div>
                );
              })()}
              {/* Quản lý phụ trách nhà = operationManagerId có sẵn — tự động gán khi
                  tạo thành công, không cho chọn tay (nhà đã hoạt động thì đã có manager). */}
              {selectedProperty && (
                selectedProperty.operationManagerId ? (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Quản lý phụ trách: <span className="font-medium text-slate-700">{selectedProperty.operationManagerName || '—'}</span> (tự động gán + gửi thông báo sau khi lưu)
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs font-medium text-rose-600">
                    ⚠️ Nhà này chưa có quản lý phụ trách — không thể tạo hợp đồng. Vui lòng gán quản lý cho nhà trước.
                  </p>
                )
              )}
            </div>
            {!isWholeHouse && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Phòng <span className="text-rose-500">*</span>
                </label>
                <select
                  name="roomId"
                  value={form.roomId}
                  onChange={handleRoomChange}
                  className="input-field"
                  required={!isWholeHouse}
                  disabled={!selectedProperty || loadingRooms}
                >
                  <option value="">{loadingRooms ? 'Đang tải phòng...' : 'Chọn phòng trống...'}</option>
                  {rooms.map((r) => {
                    // Kèm giá + diện tích: chọn phòng xong là giá thuê tự điền và KHOÁ
                    // lại (`rentLocked`), nên nếu chỉ hiện mỗi số phòng thì admin chọn
                    // mù rồi mới thấy con số mình vừa chốt cho khách.
                    const price = r.appliedPrice ?? r.listedPrice ?? r.price;
                    return (
                      <option key={r.id} value={r.id}>
                        {r.roomNumber}
                        {r.area ? ` · ${r.area}m²` : ''}
                        {price ? ` · ${formatVndDisplay(String(price))}đ` : ''}
                      </option>
                    );
                  })}
                </select>
                {selectedProperty && !loadingRooms && rooms.length === 0 && (
                  <p className="mt-1 text-xs text-rose-500">
                    Nhà này không còn phòng trống{unavailableRoomsBreakdown ? ` (${unavailableRoomsBreakdown})` : ''}.
                  </p>
                )}
              </div>
            )}
          </div>
          )}

          {/* Thông tin khách */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Họ và tên khách <span className="text-rose-500">*</span>
            </label>
            <input name="fullName" value={form.fullName} onChange={handleChange} className="input-field" required />
          </div>
          {/* Thông tin định danh (SĐT/CCCD/ngày sinh) — khi SỬA hợp đồng nháp, mặc định
              làm mờ + khoá để tránh sửa nhầm dữ liệu định danh khách; admin phải bấm
              "Sửa thông tin định danh" rồi tick xác nhận mới lưu được thay đổi. */}
          {isEditMode && (
            sensitiveLocked ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="flex items-center gap-2 text-sm text-slate-500">
                  <Lock className="h-4 w-4 text-slate-400" />
                  Thông tin định danh đang bị ẩn để tránh sửa nhầm.
                </p>
                <button
                  type="button"
                  onClick={() => setSensitiveUnlocked(true)}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700"
                >
                  Sửa thông tin định danh
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <label className="flex items-start gap-2.5 text-sm text-amber-800">
                  <input
                    type="checkbox"
                    checked={confirmSensitiveEdit}
                    onChange={(e) => setConfirmSensitiveEdit(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span>
                    <span className="flex items-center gap-1.5 font-bold"><ShieldCheck className="h-4 w-4" /> Xác nhận sửa thông tin định danh</span>
                    Tôi đảm bảo những gì tôi sửa (SĐT/CCCD/ngày sinh) đều chính xác và tôi chịu trách nhiệm về thay đổi này.
                  </span>
                </label>
              </div>
            )
          )}
          <div className={sensitiveLocked ? 'pointer-events-none select-none space-y-4 opacity-60 blur-[3px]' : 'space-y-4'}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Số điện thoại <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={form.phoneNumber}
                  onChange={handleChange}
                  onBlur={handlePhoneBlur}
                  maxLength={12}
                  placeholder="09xxxxxxxx"
                  disabled={sensitiveLocked}
                  className={`input-field ${phoneInvalid ? 'border-rose-400' : ''}`}
                  required
                />
                {phoneInvalid && (
                  <p className="mt-1 text-xs text-rose-500">SĐT VN gồm 10 số, đầu 03/05/07/08/09.</p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  CCCD <span className="text-rose-500">*</span>
                </label>
                <input
                  name="cccd"
                  value={form.cccd}
                  onChange={handleChange}
                  inputMode="numeric"
                  maxLength={12}
                  placeholder="12 chữ số"
                  disabled={sensitiveLocked}
                  className={`input-field ${cccdInvalid ? 'border-rose-400' : ''}`}
                  required
                />
                {cccdInvalid && (
                  <p className="mt-1 text-xs text-rose-500">CCCD phải đủ 12 chữ số.</p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Ngày sinh</label>
                <input
                  type="date"
                  name="dateOfBirth"
                  value={form.dateOfBirth}
                  onChange={handleChange}
                  min={DOB_MIN}
                  max={DOB_MAX}
                  disabled={sensitiveLocked}
                  className={`input-field ${dobInvalid ? 'border-rose-400' : ''}`}
                />
                {dobInvalid && (
                  <p className="mt-1 text-xs text-rose-500">Từ 1930 & khách đủ 18 tuổi.</p>
                )}
              </div>
            </div>

            {/* Ngày cấp / Nơi cấp CCCD — optional, in lên PDF hợp đồng (BE 15/07) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Ngày cấp CCCD</label>
                <input
                  type="date"
                  name="cccdIssueDate"
                  value={form.cccdIssueDate}
                  onChange={handleChange}
                  max={todayIso()}
                  disabled={sensitiveLocked}
                  className="input-field"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Nơi cấp CCCD</label>
                <input
                  name="cccdIssuePlace"
                  value={form.cccdIssuePlace}
                  onChange={handleChange}
                  placeholder="VD: CA TP. Hồ Chí Minh"
                  disabled={sensitiveLocked}
                  className="input-field"
                />
              </div>
            </div>
          </div>

          {/* Hộ khẩu thường trú — optional, in lên PDF hợp đồng dòng HKTT (BE 16/07) */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Hộ khẩu thường trú</label>
            <input
              name="permanentAddress"
              value={form.permanentAddress}
              onChange={handleChange}
              placeholder="VD: 25 Nguyễn Trãi, P. Bến Thành, Q.1, TP. Hồ Chí Minh"
              className="input-field"
            />
          </div>

          {roleWarning && (
            <div className="flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <ShieldAlert className="h-5 w-5 flex-shrink-0 text-rose-500" />
              <p>SĐT này đang là tài khoản nội bộ ({lookupRole}). Không thể onboard làm khách thuê.</p>
            </div>
          )}

          {/* Giá & cọc — format dấu chấm nghìn + căn phải, state gốc vẫn là chuỗi số thuần */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Giá thuê (đ/tháng) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                name="rentAmount"
                value={formatVndDisplay(form.rentAmount)}
                onChange={(e) => setForm((prev) => {
                  const rentAmount = parseVndInput(e.target.value);
                  // Giá thuê đổi → cọc tự tính lại = giá thuê × số tháng cọc.
                  return { ...prev, rentAmount, deposit: calcDeposit(rentAmount, prev.depositMonths) };
                })}
                readOnly={rentLocked}
                className={`input-field text-right ${rentLocked ? 'cursor-not-allowed bg-slate-100 text-slate-600' : ''}`}
                placeholder="0"
                required
              />
              {rentLocked ? (
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Lấy theo giá niêm yết Host đã duyệt. Chốt giá khác với khách?{' '}
                  <Link
                    to={`/host/properties/${selectedProperty?.id}`}
                    target="_blank"
                    className="font-bold text-indigo-600 hover:underline"
                  >
                    Cập nhật giá trước
                  </Link>
                  , rồi quay lại.
                </p>
              ) : (
                <p className="mt-1 text-xs text-amber-600">
                  Chưa tra được giá niêm yết — chọn nhà/phòng trước.
                </p>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Tiền cọc (đ) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                name="deposit"
                value={formatVndDisplay(form.deposit)}
                onChange={(e) => setForm((prev) => ({ ...prev, deposit: parseVndInput(e.target.value) }))}
                className={`input-field text-right ${depositMismatch ? 'border-amber-400' : ''}`}
                placeholder="0"
                required
              />
              {depositMismatch && (
                <p className="mt-1 text-xs text-amber-600">
                  Khác chuẩn (giá thuê × số tháng = {formatVndDisplay(standardDeposit)}đ).
                </p>
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Số tháng cọc</label>
              <select
                name="depositMonths"
                value={form.depositMonths}
                onChange={(e) => setForm((prev) => ({
                  ...prev,
                  depositMonths: e.target.value,
                  // Đổi số tháng cọc → cọc tự tính lại theo giá thuê hiện tại (nếu đã có giá).
                  deposit: calcDeposit(prev.rentAmount, e.target.value) || prev.deposit,
                }))}
                className="input-field text-right"
              >
                <option value="1">1 tháng</option>
                <option value="2">2 tháng</option>
              </select>
            </div>
          </div>

          {/* Ngày — đón khách chỉ được chọn từ hôm nay (CHỈ áp dụng lúc tạo mới — sửa
              draft cũ có thể đã qua ngày dự kiến, ép min=hôm nay sẽ khiến HTML5 coi
              value hiện tại là invalid và chặn submit dù field không required). Kết
              thúc tối đa 5 năm kể từ hôm nay (khớp Rule 4 BE: endDate.isAfter(today.plusYears(5))). */}
          {/*
            BA ngày, không phải hai — xem chú thích `moveInDate` ở phần payload.

            "Ngày dự kiến đón khách" là KẾ HOẠCH (manager cần có mặt hôm nào).
            "Ngày bắt đầu hợp đồng" là MỐC PHÁP LÝ + mốc tính tiền, và là thứ BE bắt
            buộc phải có. Trước 30/08/2026 form chỉ có ô đầu rồi lặng lẽ chép sang ô
            sau, thiếu thì lấy HÔM NAY — hợp đồng khởi đầu vào một ngày không ai chọn.
          */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Ngày dự kiến đón khách</label>
              <input
                type="date"
                name="expectedReceptionDate"
                value={form.expectedReceptionDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    expectedReceptionDate: v,
                    // Điền hộ ngày bắt đầu khi admin chưa tự đặt — hai ngày này trùng
                    // nhau trong đa số hợp đồng. Đã tự sửa rồi thì KHÔNG ghi đè.
                    moveInDate: prev.moveInDate ? prev.moveInDate : v,
                  }));
                }}
                min={isEditMode ? undefined : todayIso()}
                className="input-field"
              />
              <p className="mt-1 text-xs text-slate-400">Hôm nào quản lý ra bàn giao nhà.</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Ngày bắt đầu hợp đồng {!isEditMode && <span className="text-rose-500">*</span>}
              </label>
              {/*
                Sàn = mốc MUỘN HƠN giữa "hôm nay" và ngày HĐ chủ nhà có hiệu lực — vế
                đối xứng với trần ở ô Ngày kết thúc. Trước ngày đó công ty chưa có
                quyền quản lý căn nhà nên không cho thuê được.
              */}
              <input
                type="date"
                name="moveInDate"
                value={form.moveInDate}
                onChange={handleChange}
                min={isEditMode ? undefined : contractStartMin}
                max={contractEndMax}
                className="input-field"
                required={!isEditMode}
              />
              <p className="mt-1 text-xs text-slate-400">Mốc khách vào ở và bắt đầu tính tiền.</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Ngày kết thúc {!isEditMode && <span className="text-rose-500">*</span>}
              </label>
              <input
                type="date"
                name="endDate"
                value={form.endDate}
                onChange={handleChange}
                min={form.moveInDate || (isEditMode ? undefined : todayIso())}
                max={contractEndMax}
                className="input-field"
                required={!isEditMode}
              />
              {/* Chip chọn nhanh — tính từ NGÀY BẮT ĐẦU (mốc tính kỳ hạn), không phải
                  ngày đón khách: "1 năm" nghĩa là một năm kể từ lúc khách vào ở. */}
              <div className="mt-1.5 flex gap-1.5">
                {[
                  { label: '6 tháng', endDate: addMonthsIso(form.moveInDate || todayIso(), 6) },
                  { label: '1 năm', endDate: addYearsIso(form.moveInDate || todayIso(), 1) },
                  { label: '2 năm', endDate: addYearsIso(form.moveInDate || todayIso(), 2) },
                ].map((chip) => {
                  /*
                    Chip vượt trần thì KHOÁ chứ không ẩn.

                    Ẩn đi thì admin thấy chỗ này lúc có 3 chip lúc có 1, tưởng giao diện
                    lỗi. Khoá kèm lý do thì họ đọc được ngay vì sao căn này không ký
                    được 2 năm — và đó chính là thông tin họ cần để đi thương lượng lại
                    hạn với chủ nhà.
                  */
                  const over = chip.endDate > contractEndMax;
                  return (
                    <button
                      key={chip.label}
                      type="button"
                      disabled={over}
                      title={over
                        ? `Vượt hạn hợp đồng với chủ nhà (${formatDateDisplay(contractEndMax)})`
                        : undefined}
                      onClick={() => setForm((prev) => ({ ...prev, endDate: chip.endDate }))}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                        over
                          ? 'cursor-not-allowed border-slate-100 text-slate-300'
                          : form.endDate === chip.endDate
                            ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>

              {/* Nói rõ trần đến từ đâu — "không chọn được" mà không giải thích thì
                  admin tưởng lịch bị lỗi. */}
              {cappedByLease && (
                <p className="mt-1 text-xs text-amber-600">
                  Tối đa {formatDateDisplay(contractEndMax)} — hạn hợp đồng với chủ nhà gốc.
                </p>
              )}
            </div>
          </div>

          {/* Quản lý phụ trách — luôn = operationManagerId của nhà, chỉ hiển thị
              read-only. Đổi quản lý cho nhà thì làm ở trang Zone/Quản lý, không đổi
              riêng cho từng hợp đồng. */}
          {isEditMode && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Quản lý phụ trách</label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700">
                {editPropertyInfo?.operationManagerName || editContract!.assignedManagerName || '—'}
              </div>
            </div>
          )}

          {/* Thành viên ở cùng — ghi vào householdMembers của HĐ (hộ gia đình/nguyên căn) */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700">
                Thành viên ở cùng
                <span className="ml-1.5 font-normal text-slate-400">(không bắt buộc)</span>
              </label>
              <button
                type="button"
                onClick={addMember}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              >
                + Thêm thành viên
              </button>
            </div>
            {members.length === 0 ? (
              <p className="text-xs text-slate-400">
                Khách ở cùng gia đình/bạn — thêm để ghi nhận vào hợp đồng.
              </p>
            ) : (
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.key} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={m.fullName}
                      onChange={(e) => patchMember(m.key, { fullName: e.target.value })}
                      placeholder="Họ tên"
                      className="input-field flex-1 text-sm"
                    />
                    <input
                      type="text"
                      value={m.relation}
                      onChange={(e) => patchMember(m.key, { relation: e.target.value })}
                      placeholder="Quan hệ (vợ/con...)"
                      className="input-field w-36 text-sm"
                    />
                    <input
                      type="text"
                      value={m.phone}
                      onChange={(e) => patchMember(m.key, { phone: e.target.value })}
                      placeholder="SĐT (nếu có)"
                      className="input-field w-32 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeMember(m.key)}
                      className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                      title="Xóa thành viên"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Nội thất bàn giao — READ-ONLY: BE tự gắn toàn bộ thiết bị ACTIVE trong phạm
              vi HĐ vào equipmentSnapshot/PDF, không còn checkbox chọn từng món (xem
              FE-contract-equipment-auto.md). Hiện danh sách để admin biết PDF sẽ có gì. */}
          {(isEditMode || (selectedProperty && (isWholeHouse || form.roomId))) && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Nội thất bàn giao
                {equipmentLoaded && (
                  <span className="ml-1.5 font-normal text-slate-400">
                    ({availableEquipments.length} món — tự gắn toàn bộ)
                  </span>
                )}
              </label>
              {equipmentLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Đang tải danh sách nội thất...
                </div>
              ) : availableEquipments.length === 0 ? (
                <p className="text-xs text-slate-400">
                  Nhà/phòng chưa có nội thất trong hệ thống — hợp đồng sẽ không có mục nội thất.
                  Cần thì nhập thiết bị vào nhà trước.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                  {availableEquipments.map((eq) => (
                    <div key={eq.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-400" />
                      {eq.name}{' '}
                      <span className="text-xs text-slate-400">
                        ({EQUIPMENT_CONDITION_LABEL[eq.condition] ?? eq.condition}{eq.quantity > 1 ? ` x${eq.quantity}` : ''})
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {availableEquipments.length > 0 && (
                <p className="mt-1.5 text-xs text-slate-400">
                  Toàn bộ nội thất có sẵn được tự động ghi vào hợp đồng — muốn thay đổi, cập nhật
                  thiết bị của nhà/phòng trong mục Quản lý thiết bị.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">Hủy</button>
            <button type="submit" className="btn-primary" disabled={submitting || extracting}>
              Xem lại & Lưu
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
