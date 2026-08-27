import { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Building, Building2, CheckCircle2, Clock, DoorOpen, Eye, FilePlus,
  FileSpreadsheet, FileText, Image as ImageIcon, Layers, MapPin, Plus, Power,
  TrendingUp, Trash2, Upload, X, XCircle,
} from 'lucide-react';
import { propertyService } from '@/services/property.service';
import { zoneService } from '@/services/zone.service';
import { uploadToCloudinary } from '@/services/upload.service';
import { extractContractData } from '@/utils/pdfExtract';
import type { InboundContractRequest, PropertyDraftRequest, PropertyResponse, ZoneResponse } from '@/types/api.types';
import { StepPropertyInfo } from '@/pages/admin/properties/wizard/StepPropertyInfo';
import { StatCard, PageHero, BuildingCard, Pagination } from '@/pages/admin/shared';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { PropertyMap } from '@/components/PropertyMap';
import { LeaseImportPanel } from './LeaseImportPanel';
import { HandoverEquipmentSection } from './HandoverEquipmentSection';
import { BuildingFilterBar, ResultBar, BuildingTable, BulkActionBar } from './BuildingFilters';
import { useBuildingFilters, ONBOARDING_STEPS, type StatusOption } from './buildingFilterState';

// Module này CHỈ quan tâm bước khởi tạo hồ sơ — mọi trạng thái phía sau
// (cải tạo / duyệt giá / kinh doanh) thuộc module "Cấu hình khai thác",
// ở đây gộp hết thành "Đã khởi tạo".
const DRAFT_STATE = {
  DRAFT:       { label: 'Nháp',         cls: 'bg-slate-100 text-slate-700' },
  INITIALIZED: { label: 'Đã khởi tạo',  cls: 'bg-indigo-100 text-indigo-800' },
  DISABLED:    { label: 'Đã vô hiệu',   cls: 'bg-rose-100 text-rose-800' },
} as const;

/**
 * Lý do BE từ chối, lấy nguyên văn câu tiếng Việt BE trả về.
 *
 * Thao tác hàng loạt gọi API với `silent: true` nên interceptor KHÔNG toast — không tự
 * đọc lỗi ở đây thì lý do biến mất sạch, người dùng chỉ còn dòng "N nhà không xóa được"
 * không nói được gì và không có đường nào lần ra nguyên nhân.
 *
 * 500 hầu như luôn là ràng buộc khoá ngoại lúc dọn dữ liệu phụ thuộc (BE không dịch ra
 * câu tiếng Việt) — nói thẳng như vậy còn hơn để chữ "Lỗi hệ thống không xác định".
 */
const beReason = (err: unknown): string => {
  const e = err as { response?: { status?: number; data?: { error?: string; message?: string } } };
  const data = e?.response?.data;
  const msg = data?.error || data?.message;
  if (msg && msg !== 'Lỗi hệ thống không xác định') return msg;
  const status = e?.response?.status;
  if (status === 500) return 'BE lỗi 500 — còn dữ liệu liên quan (hóa đơn / chỉ số / hợp đồng) chưa dọn được. Xem log server.';
  if (status === 403) return 'Không đủ quyền';
  return status ? `BE trả lỗi ${status}` : 'Không gọi được máy chủ';
};

const DRAFT_STATUS_OPTIONS: StatusOption[] = [
  { value: 'all',         label: 'Tất cả',       cls: 'border-slate-900 bg-slate-900 text-white' },
  { value: 'DRAFT',       label: 'Nháp',         cls: 'border-slate-600 bg-slate-600 text-white' },
  { value: 'INITIALIZED', label: 'Đã khởi tạo',  cls: 'border-indigo-600 bg-indigo-600 text-white' },
  { value: 'DISABLED',    label: 'Đã vô hiệu',   cls: 'border-rose-600 bg-rose-600 text-white' },
];

// ─── "Đã hoàn tất khởi tạo" — đánh dấu FE-side ──────────────────────────────
// BE chưa có endpoint chuyển DRAFT → PENDING_HOST_REVIEW khi hoàn tất bước khởi
// tạo (xem doc/NOTE-CHO-TEAM-BE.md). Tạm lưu localStorage: draft nào đã bấm
// "Xác nhận & Quay về danh sách" sẽ hiển thị "Chờ duyệt" thay vì "Nháp".
const SUBMITTED_DRAFTS_KEY = 'urbannest_submitted_drafts';

const readSubmittedDrafts = (): number[] => {
  try {
    const raw = localStorage.getItem(SUBMITTED_DRAFTS_KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch { return []; }
};

const markDraftSubmitted = (id: number) => {
  const cur = readSubmittedDrafts();
  if (!cur.includes(id)) {
    localStorage.setItem(SUBMITTED_DRAFTS_KEY, JSON.stringify([...cur, id]));
  }
};

const getUserIdFromToken = (): number => {
  try {
    const token = localStorage.getItem('access_token');
    if (!token) return 1;
    const payload = JSON.parse(atob(token.split('.')[1]));
    const id = Number(payload.userId);
    return isNaN(id) ? 1 : id;
  } catch { return 1; }
};

const emptyForm = (): PropertyDraftRequest => ({
  propertyName: '', address: '', descriptions: '', zoneId: '',
  areaSize: 0, floorCount: 1, roomsPerFloor: 1,
  createdBy: getUserIdFromToken(), imageUrls: [],
});

// ─── View states ───────────────────────────────────────────────────────────────
type View = 'list' | 'create-form' | 'step-info' | 'detail';

export const TaoDraftPage = () => {
  // ─── view & selected ──────────────────────────────────────────────
  // Mặc định xem danh sách toà nhà; import Excel mở dạng popup khi bấm nút.
  const [importOpen, setImportOpen] = useState(false);
  const [view, setView] = useState<View>('list');
  const [newProperty, setNewProperty] = useState<PropertyResponse | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<PropertyResponse | null>(null);

  // ─── building list ────────────────────────────────────────────────
  const [buildings, setBuildings] = useState<PropertyResponse[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [submittedDrafts, setSubmittedDrafts] = useState<number[]>(() => readSubmittedDrafts());

  /**
   * Trạng thái theo góc nhìn của riêng module khởi tạo:
   * - DRAFT chưa bấm "Xác nhận" bước cuối → Nháp
   * - DRAFT đã xác nhận, hoặc đã sang bất kỳ bước vận hành nào → Đã khởi tạo
   * - DISABLED → Đã vô hiệu
   */
  const draftState = (b: PropertyResponse): keyof typeof DRAFT_STATE => {
    if (b.status === 'DISABLED') return 'DISABLED';
    if (b.status === 'DRAFT' && !submittedDrafts.includes(b.id)) return 'DRAFT';
    return 'INITIALIZED';
  };

  const getStatusBadge = (b: PropertyResponse) => DRAFT_STATE[draftState(b)];

  // ─── create form ──────────────────────────────────────────────────
  const [zones, setZones] = useState<ZoneResponse[]>([]);
  const [parentZoneId, setParentZoneId] = useState('');
  const [childZones, setChildZones] = useState<ZoneResponse[]>([]);
  const [childZonesLoading, setChildZonesLoading] = useState(false);
  const [totalRoomsInput, setTotalRoomsInput] = useState(1);
  const [formData, setFormData] = useState<PropertyDraftRequest>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [prefillContract, setPrefillContract] = useState<Partial<InboundContractRequest> | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfExtracting, setPdfExtracting] = useState(false);

  const fetchBuildings = async () => {
    setListLoading(true);
    setListError(false);
    try {
      const res = await propertyService.getProperties(0, 100);
      setBuildings(res.content);
    } catch (e) {
      console.error(e);
      setListError(true);
    } finally { setListLoading(false); }
  };

  useEffect(() => {
    fetchBuildings();
    zoneService.getRootZones().then(setZones).catch(console.error);
  }, []);

  // Khoá cuộn nền khi mở popup import (tránh nền cuộn lung tung phía sau).
  useEffect(() => {
    if (!importOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [importOpen]);

  const kpi = useMemo(() => buildings.reduce(
    (acc, b) => {
      const st = b.status === 'DISABLED'
        ? 'DISABLED'
        : b.status === 'DRAFT' && !submittedDrafts.includes(b.id) ? 'DRAFT' : 'INITIALIZED';
      return {
        total: acc.total + 1,
        draft: acc.draft + (st === 'DRAFT' ? 1 : 0),
        initialized: acc.initialized + (st === 'INITIALIZED' ? 1 : 0),
        rooms: acc.rooms + (b.totalRooms || 0),
      };
    },
    { total: 0, draft: 0, initialized: 0, rooms: 0 }
  ), [buildings, submittedDrafts]);

  const effectiveStatus = useCallback(
    (b: PropertyResponse): string => draftState(b),
    [submittedDrafts]
  );

  const f = useBuildingFilters(buildings, { storageKey: 'draft-list', effectiveStatus });

  // ─── form handlers ────────────────────────────────────────────────
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'number' ? Number(value) : value }));
  };

  const handleParentZoneChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const pid = e.target.value;
    setParentZoneId(pid);
    setFormData(prev => ({ ...prev, zoneId: '' }));
    setChildZones([]);
    if (!pid) return;
    setChildZonesLoading(true);
    try {
      const children = await zoneService.getChildrenZones(pid);
      setChildZones(children);
    } catch { console.error('Lỗi tải khu vực cấp 2'); }
    finally { setChildZonesLoading(false); }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setIsUploading(true);
    setUploadProgress({ done: 0, total: files.length });
    try {
      const urls = [...(formData.imageUrls || [])];
      for (let i = 0; i < files.length; i++) {
        urls.push(await uploadToCloudinary(files[i]));
        setUploadProgress({ done: i + 1, total: files.length });
        setFormData(prev => ({ ...prev, imageUrls: [...urls] }));
      }
    } catch { alert('Lỗi tải ảnh'); }
    finally {
      setIsUploading(false);
      setUploadProgress({ done: 0, total: 0 });
    }
  };

  const removeImage = (idx: number) => {
    const urls = [...(formData.imageUrls || [])];
    urls.splice(idx, 1);
    setFormData(prev => ({ ...prev, imageUrls: urls }));
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfFile(file);
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    setPdfBlobUrl(URL.createObjectURL(file));
    setPdfExtracting(true);
    const isOldDoc = file.name.toLowerCase().endsWith('.doc') &&
      !file.name.toLowerCase().endsWith('.docx');
    try {
      if (isOldDoc) {
        // .doc binary cũ — chỉ upload, không parse được phía browser
        const scanUrl = await uploadToCloudinary(file, 'raw');
        setPrefillContract({ contractScanUrl: scanUrl });
      } else {
        // PDF hoặc .docx — extract + upload song song
        const [extracted, scanUrl] = await Promise.all([
          extractContractData(file),
          uploadToCloudinary(file, 'raw'),
        ]);
        if (extracted.address) setFormData(prev => ({ ...prev, address: extracted.address }));
        if (extracted.areaSize > 0) setFormData(prev => ({ ...prev, areaSize: extracted.areaSize }));
        setPrefillContract({
          contractCode: extracted.contractCode,
          ownerName: extracted.ownerName,
          startDate: extracted.startDate,
          endDate: extracted.endDate,
          totalRentAmount: extracted.totalRentAmount,
          contractScanUrl: scanUrl,
        });
      }
    } catch {
      alert('Không thể xử lý file — kiểm tra lại định dạng');
    } finally {
      setPdfExtracting(false);
    }
  };

  // Submit form → chỉ mở hộp xác nhận lần 2 (native validation đã chạy trước khi tới đây)
  const requestCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setConfirmCreateOpen(true);
  };

  const handleCreateSubmit = async () => {
    setFormError('');
    setSubmitting(true);
    try {
      const floorCount = Number(formData.floorCount) || 1;
      const payload = {
        ...formData,
        descriptions: (formData.descriptions || '').trim() || 'Không có mô tả',
        floorCount,
        totalFloor: floorCount,
        roomsPerFloor: Number(formData.roomsPerFloor) || 1,
        totalRooms: totalRoomsInput,
      };
      const created = await propertyService.createDraft(payload as any);
      setConfirmCreateOpen(false);
      setNewProperty(created);
      setView('step-info');
    } catch (err: any) {
      setConfirmCreateOpen(false);
      setFormError(err.response?.data?.message || err.message || 'Có lỗi xảy ra');
    } finally { setSubmitting(false); }
  };

  // Chốt chặn: chỉ cho vô hiệu/xóa nhà ACTIVE khi không còn khách thuê.
  // - Nhà chia phòng: kiểm tra phòng có status RENTED.
  // - Nhà nguyên căn: không có phòng lẻ → dựa vào xác nhận thủ công ở hộp thoại.
  const ensureVacant = async (b: PropertyResponse, silent = false): Promise<boolean> => {
    if (b.wholeHouse === false) {
      try {
        const rooms = await propertyService.getRooms(b.id);
        const rented = rooms.filter(r => r.status === 'RENTED');
        if (rented.length > 0) {
          if (!silent) toast.error(`Còn ${rented.length} phòng đang có khách thuê — không thể thực hiện. Chờ hết hợp đồng hoặc chuyển khách trước.`);
          return false;
        }
      } catch {
        // getRooms lỗi (vd BE thiếu migration is_deleted) → để BE quyết định cuối cùng
      }
    }
    return true;
  };

  // ─── Chọn nhiều để vô hiệu hóa / xóa hàng loạt ───────────────────────
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkAction, setBulkAction] = useState<'disable' | 'delete' | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleRow = (id: number) =>
    setSelectedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const runBulk = async () => {
    const targets = buildings.filter(b => selectedSet.has(b.id));
    setBulkRunning(true);
    let ok = 0;
    const blocked: string[] = [];                           // còn khách thuê
    const failed: { name: string; reason: string }[] = [];  // BE từ chối, kèm lý do
    for (const b of targets) {
      if (b.status === 'ACTIVE' && !(await ensureVacant(b, true))) { blocked.push(b.propertyName); continue; }
      try {
        if (bulkAction === 'delete') await propertyService.deleteProperty(b.id, { silent: true });
        else await propertyService.disableProperty(b.id, { silent: true });
        ok++;
      } catch (err: any) {
        // 404 khi xóa = đã bị xóa trước đó → coi như thành công
        if (bulkAction === 'delete' && err?.response?.status === 404) ok++;
        else failed.push({ name: b.propertyName, reason: beReason(err) });
      }
    }
    const verb = bulkAction === 'delete' ? 'xóa' : 'vô hiệu hóa';
    if (ok > 0) toast.success(`Đã ${verb} ${ok}/${targets.length} tòa nhà`);
    if (blocked.length) toast.error(`${blocked.length} nhà còn khách thuê nên bỏ qua: ${blocked.slice(0, 3).join(', ')}${blocked.length > 3 ? '…' : ''}`);
    // Gom theo LÝ DO, không theo nhà: 8 nhà hỏng vì cùng một nguyên nhân thì đọc một
    // dòng là đủ, mà vẫn biết chính xác phải đi sửa cái gì.
    const byReason = new Map<string, string[]>();
    failed.forEach(f => byReason.set(f.reason, [...(byReason.get(f.reason) ?? []), f.name]));
    byReason.forEach((names, reason) => {
      const list = `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` … (+${names.length - 3})` : ''}`;
      // `<Toaster>` không đặt white-space nên `\n` sẽ bị nuốt — khai báo tại chỗ để lý do
      // và danh sách nhà nằm hai dòng, đọc được thay vì dính thành một câu dài.
      toast.error(`${names.length} nhà không ${verb} được — ${reason}\n${list}`, {
        duration: 10000,
        style: { whiteSpace: 'pre-line', maxWidth: 460 },
      });
    });
    setBulkRunning(false);
    setBulkAction(null);
    setSelectedIds([]);
    fetchBuildings();
  };

  // ─── Xác nhận hành động trên 1 tòa nhà (popup giữa màn hình) ─────────
  type RowAction = 'delete' | 'disable' | 'enable';
  const [rowConfirm, setRowConfirm] = useState<{ kind: RowAction; b: PropertyResponse } | null>(null);
  const [rowRunning, setRowRunning] = useState(false);

  const askRowAction = async (kind: RowAction, b: PropertyResponse, e: React.MouseEvent) => {
    e.stopPropagation();
    // Nhà đang kinh doanh còn khách thuê → chặn ngay, khỏi mở hộp thoại
    if (kind !== 'enable' && b.status === 'ACTIVE' && !(await ensureVacant(b))) return;
    setRowConfirm({ kind, b });
  };

  const runRowAction = async () => {
    if (!rowConfirm) return;
    const { kind, b } = rowConfirm;
    setRowRunning(true);
    try {
      if (kind === 'delete') {
        await propertyService.deleteProperty(b.id);
        toast.success('Đã xóa căn nhà');
      } else if (kind === 'disable') {
        await propertyService.disableProperty(b.id);
        toast.success('Đã vô hiệu hóa');
      } else {
        await propertyService.enableProperty(b.id);
        toast.success('Đã kích hoạt lại tòa nhà');
      }
      fetchBuildings();
    } catch (err: any) {
      const status = err?.response?.status;
      if (kind === 'delete' && status === 404) {
        // Đã bị xóa trước đó → coi như thành công, làm mới danh sách
        toast.success('Căn nhà đã được xóa trước đó');
        fetchBuildings();
      } else if (kind === 'delete' && status === 403) {
        toast.error('Bạn cần quyền ADMIN để xóa căn nhà này');
      } else if (kind === 'enable' && (status === 404 || status === 405)) {
        toast.error('BE chưa hỗ trợ kích hoạt lại (POST /properties/{id}/enable) — đã ghi yêu cầu cho BE');
      }
      // các lỗi khác: api interceptor đã toast message từ BE
    } finally {
      setRowRunning(false);
      setRowConfirm(null);
    }
  };

  // Nội dung hộp thoại theo từng loại hành động
  const rowConfirmProps = (() => {
    if (!rowConfirm) return null;
    const { kind, b } = rowConfirm;
    const warnWholeHouse = b.wholeHouse
      ? <> Hãy chắc chắn nhà hiện <b className="text-slate-700">KHÔNG còn khách thuê</b>.</>
      : null;
    if (kind === 'delete') return {
      tone: 'danger' as const,
      title: 'Xóa tòa nhà này?',
      confirmText: 'Xóa vĩnh viễn',
      message: <>Toàn bộ hợp đồng, cải tạo, thiết bị và phòng của <b className="text-slate-700">{b.propertyName}</b> sẽ bị
        xóa và không thể hoàn tác.{warnWholeHouse}</>,
    };
    if (kind === 'disable') return {
      tone: 'warning' as const,
      title: 'Vô hiệu hóa tòa nhà này?',
      confirmText: 'Vô hiệu hóa',
      message: <>Tòa nhà <b className="text-slate-700">{b.propertyName}</b> sẽ ngừng hoạt động trên hệ thống.{warnWholeHouse}</>,
    };
    return {
      tone: 'success' as const,
      title: 'Kích hoạt lại tòa nhà này?',
      confirmText: 'Kích hoạt lại',
      message: <>Tòa nhà <b className="text-slate-700">{b.propertyName}</b> sẽ hoạt động trở lại.</>,
    };
  })();

  const backToList = () => {
    setView('list');
    setNewProperty(null);
    setSelectedBuilding(null);
    setFormData(emptyForm());
    setFormError('');
    setParentZoneId('');
    setChildZones([]);
    setTotalRoomsInput(1);
    setPrefillContract(null);
    setPdfFile(null);
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    setPdfBlobUrl(null);
    fetchBuildings();
  };

  const openDetail = (b: PropertyResponse) => {
    setSelectedBuilding(b);
    setView('detail');
  };

  // Bấm "Xác nhận & Quay về danh sách" → đánh dấu draft đã hoàn tất khởi tạo
  const handleFinishOnboarding = (id: number) => {
    markDraftSubmitted(id);
    setSubmittedDrafts(readSubmittedDrafts());
    backToList();
  };


  // ─── Popup "Nhập từ Excel" (mở khi bấm nút ở danh sách) ─────────────
  const importModal = importOpen && (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop fixed → luôn phủ kín màn hình kể cả khi cuộn nội dung dài */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />
      <div className="relative flex min-h-full items-start justify-center p-4 sm:py-10"
        onClick={() => setImportOpen(false)}>
        <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}>
          <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b border-slate-100 bg-white px-6 py-4">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-indigo-600" />
              <h3 className="text-base font-bold text-slate-900">Nhập nhà từ Excel</h3>
            </div>
            <button onClick={() => setImportOpen(false)}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="p-6">
            <LeaseImportPanel onImported={fetchBuildings} />
          </div>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════════════════
  // VIEW: StepPropertyInfo (hợp đồng + thiết bị) sau khi tạo draft
  // ═══════════════════════════════════════════════════════════════════
  if (view === 'step-info' && newProperty) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <button onClick={backToList}
          className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition">
          <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
        </button>
        <div className="mb-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-700 mb-3">
            ✓ Draft đã tạo thành công
          </span>
          <h1 className="text-2xl font-black text-slate-900">Bước tiếp theo — Hợp đồng & Khai báo thiết bị</h1>
          <p className="text-slate-500 mt-1 font-medium">{newProperty.propertyName} · Trạng thái: DRAFT</p>
        </div>
        <StepPropertyInfo
          property={newProperty}
          onNext={() => handleFinishOnboarding(newProperty.id)}
          nextLabel="Xác nhận & Quay về danh sách"
          prefillContract={prefillContract ?? undefined}
          confirmBeforeNext
        />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // VIEW: Chi tiết tòa nhà
  // ═══════════════════════════════════════════════════════════════════
  if (view === 'detail' && selectedBuilding) {
    const badge = getStatusBadge(selectedBuilding);
    const isDraft = draftState(selectedBuilding) === 'DRAFT';
    const address = selectedBuilding.fullAddress || selectedBuilding.shortAddress;

    return (
      <div className="mx-auto max-w-6xl space-y-5">
        <button onClick={backToList}
          className="flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-indigo-600">
          <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
        </button>

        {/* ── Header hồ sơ ── */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white">
                <Building2 className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-black leading-tight text-slate-900">{selectedBuilding.propertyName}</h1>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${badge.cls}`}>{badge.label}</span>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                  <MapPin className="h-3.5 w-3.5 shrink-0" /> {address}
                </p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                  {selectedBuilding.zoneName && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{selectedBuilding.zoneName}</span>
                  )}
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-bold text-indigo-600">
                    {selectedBuilding.wholeHouse === null ? 'Chưa chọn loại hình' : selectedBuilding.wholeHouse ? 'Nhà nguyên căn' : 'Phòng trọ'}
                  </span>
                </div>
              </div>
            </div>

            {/* Thông số vật lý */}
            <div className="grid shrink-0 grid-cols-3 divide-x divide-slate-100 overflow-hidden rounded-xl border border-slate-100 bg-slate-50/60 text-center">
              {[
                { v: selectedBuilding.totalRooms || 0, l: 'Phòng' },
                { v: selectedBuilding.totalFloor ?? selectedBuilding.floorCount ?? '—', l: 'Tầng' },
                { v: selectedBuilding.areaSize ? `${selectedBuilding.areaSize} m²` : '—', l: 'Diện tích' },
              ].map(s => (
                <div key={s.l} className="px-5 py-2.5">
                  <p className="text-lg font-black leading-tight text-slate-900">{s.v}</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-400">{s.l}</p>
                </div>
              ))}
            </div>
          </div>

          {isDraft && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-sm font-semibold text-amber-800">
                Hồ sơ còn ở dạng nháp — bổ sung hợp đồng đầu vào & thiết bị bàn giao rồi bấm
                <b> “Xác nhận &amp; Quay về danh sách”</b> ở cuối trang để hoàn tất khởi tạo.
              </p>
            </div>
          )}
        </section>

        {/* ── Nội dung: 2 cột ── */}
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            {/* Hợp đồng đầu vào & khai báo thiết bị */}
            <StepPropertyInfo
              property={selectedBuilding}
              onNext={() => handleFinishOnboarding(selectedBuilding.id)}
              nextLabel="Xác nhận & Quay về danh sách"
              confirmBeforeNext
            />

            {/* Thiết bị chủ nhà bàn giao (import đợt 1 — chỉ hiển thị) */}
            <HandoverEquipmentSection propertyId={selectedBuilding.id} />
          </div>

          <div className="space-y-5">
            {/* Bản đồ vị trí (Goong) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
                <MapPin className="h-3.5 w-3.5" /> Vị trí trên bản đồ
              </h3>
              <PropertyMap address={address} />
            </div>

            {/* Ảnh tòa nhà */}
            {(selectedBuilding.imageUrls?.length ?? 0) > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
                  <ImageIcon className="h-3.5 w-3.5" /> Hình ảnh tòa nhà
                  <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                    {selectedBuilding.imageUrls!.length}
                  </span>
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {selectedBuilding.imageUrls!.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer"
                      className="group block aspect-square overflow-hidden rounded-xl border border-slate-200">
                      <img src={url} alt={`Ảnh ${i + 1}`}
                        className="h-full w-full object-cover transition duration-200 group-hover:scale-105" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Ghi chú nội bộ */}
            {selectedBuilding.descriptions && selectedBuilding.descriptions !== 'Không có mô tả' && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400">
                  <FileText className="h-3.5 w-3.5" /> Ghi chú nội bộ
                </h3>
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
                  {selectedBuilding.descriptions}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // VIEW: Form tạo mới
  // ═══════════════════════════════════════════════════════════════════
  if (view === 'create-form') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        {/* Back */}
        <button onClick={backToList}
          className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition">
          <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
        </button>

        {/* Header */}
        <div className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
            <span className="text-xs font-black uppercase tracking-widest text-indigo-600">Bước 1 / 3 — Khởi tạo hồ sơ</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900">Khởi tạo tòa nhà mới</h1>
          <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">
            Điền thông tin định danh và cấu trúc vật lý của tòa nhà. Hợp đồng đầu vào và
            khai báo thiết bị sẽ được bổ sung ngay sau khi hồ sơ được tạo.
          </p>
        </div>

        {formError && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            {formError}
          </div>
        )}

        {/* ── PDF Contract Upload ── */}
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 mb-5 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2.5 text-sm font-black uppercase tracking-widest text-indigo-600">
            <FileText className="h-4 w-4" /> Scan hợp đồng đầu vào (tuỳ chọn)
          </h3>
          <p className="mb-4 text-xs text-slate-500 leading-relaxed">
            Upload file PDF hợp đồng để tự động điền địa chỉ, diện tích và các thông tin hợp đồng vào form phía dưới.
          </p>
          <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition-all ${
            pdfExtracting
              ? 'border-indigo-400 bg-white cursor-not-allowed animate-pulse'
              : pdfFile
              ? 'border-emerald-400 bg-emerald-50'
              : 'border-indigo-200 bg-white hover:border-indigo-400 hover:bg-indigo-50'
          }`}>
            {pdfExtracting ? (
              <>
                <svg className="animate-spin h-5 w-5 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm font-semibold text-indigo-600">Đang đọc & upload hợp đồng...</span>
              </>
            ) : pdfFile ? (
              <>
                <FileText className="h-5 w-5 text-emerald-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-emerald-700 truncate">{pdfFile.name}</p>
                  <p className="text-xs text-emerald-600">
                    {prefillContract
                      ? (prefillContract.contractCode
                          ? '✓ Đã trích xuất thông tin — form bên dưới đã được điền sẵn'
                          : '✓ Đã upload — điền thông tin hợp đồng thủ công ở bước tiếp theo')
                      : 'Đang xử lý...'}
                  </p>
                  {pdfBlobUrl && (
                    <a href={pdfBlobUrl} target="_blank" rel="noreferrer"
                      className="mt-0.5 text-xs text-indigo-600 hover:underline font-semibold inline-block">
                      Xem lại hợp đồng →
                    </a>
                  )}
                </div>
                <button type="button" onClick={() => { setPdfFile(null); setPrefillContract(null); if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl); setPdfBlobUrl(null); }}
                  className="text-xs text-rose-500 hover:text-rose-700 font-semibold shrink-0">
                  Xoá
                </button>
              </>
            ) : (
              <>
                <Upload className="h-5 w-5 text-indigo-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-slate-500">Chọn file hợp đồng</p>
                  <p className="text-xs text-slate-400">PDF · DOCX (tự điền form) · DOC (chỉ lưu file)</p>
                </div>
              </>
            )}
            <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden" onChange={handlePdfUpload} disabled={pdfExtracting} />
          </label>
          {prefillContract && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              {prefillContract.contractCode && <div className="rounded-lg bg-white border border-emerald-200 px-3 py-2"><span className="text-slate-400">Số HĐ:</span> <span className="font-bold text-slate-700">{prefillContract.contractCode}</span></div>}
              {prefillContract.ownerName && <div className="rounded-lg bg-white border border-emerald-200 px-3 py-2"><span className="text-slate-400">Chủ nhà:</span> <span className="font-bold text-slate-700">{prefillContract.ownerName}</span></div>}
              {prefillContract.startDate && <div className="rounded-lg bg-white border border-emerald-200 px-3 py-2"><span className="text-slate-400">Bắt đầu:</span> <span className="font-bold text-slate-700">{prefillContract.startDate}</span></div>}
              {prefillContract.endDate && <div className="rounded-lg bg-white border border-emerald-200 px-3 py-2"><span className="text-slate-400">Kết thúc:</span> <span className="font-bold text-slate-700">{prefillContract.endDate}</span></div>}
              {prefillContract.totalRentAmount ? <div className="rounded-lg bg-white border border-emerald-200 px-3 py-2 col-span-2"><span className="text-slate-400">Giá thuê:</span> <span className="font-bold text-slate-700">{prefillContract.totalRentAmount.toLocaleString('vi-VN')} VNĐ/tháng</span></div> : null}
            </div>
          )}
        </div>

        <form onSubmit={requestCreate} className="space-y-5">
          {/* ── Section 1: Định danh ── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-5 flex items-center gap-2.5 text-sm font-black uppercase tracking-widest text-slate-500">
              <Building className="h-4 w-4 text-indigo-500" /> Thông tin định danh
            </h3>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">
                  Tên tòa nhà <span className="text-rose-500">*</span>
                </span>
                <input required name="propertyName" value={formData.propertyName} onChange={handleChange}
                  className="input-field" placeholder="VD: Hoàng Bình Land Quận 3 — tên nội bộ để nhận diện" />
              </label>

              <div className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">
                  Địa chỉ <span className="text-rose-500">*</span>
                </span>
                <AddressAutocomplete
                  required
                  name="address"
                  value={formData.address}
                  onChange={(v) => setFormData(prev => ({ ...prev, address: v }))}
                  onSelect={(sel) => setFormData(prev => ({ ...prev, address: sel.address }))}
                  placeholder="Gõ địa chỉ để gợi ý — VD: 18 Cầu Giấy, Hà Nội"
                />
                <p className="mt-1 text-xs text-slate-400">Chọn từ gợi ý của Goong để định vị chính xác trên bản đồ</p>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-slate-700">
                      Khu vực cấp 1 <span className="text-rose-500">*</span>
                    </span>
                    <select value={parentZoneId} onChange={handleParentZoneChange} className="input-field">
                      <option value="">-- Chọn tỉnh / thành phố --</option>
                      {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold text-slate-700">
                      Khu vực cấp 2 <span className="text-rose-500">*</span>
                    </span>
                    <select
                      required
                      name="zoneId"
                      value={formData.zoneId}
                      onChange={handleChange}
                      disabled={!parentZoneId || childZonesLoading}
                      className="input-field disabled:opacity-50"
                    >
                      <option value="">
                        {childZonesLoading ? 'Đang tải...' : parentZoneId ? '-- Chọn quận / huyện --' : '-- Chọn cấp 1 trước --'}
                      </option>
                      {childZones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                    </select>
                  </label>
                </div>

                {formData.zoneId && (
                  <div className="flex items-center gap-1.5 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                    {childZones.find(z => z.id === formData.zoneId)?.fullName ?? childZones.find(z => z.id === formData.zoneId)?.name}
                  </div>
                )}
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Tổng diện tích sàn (m²)</span>
                <div className="flex items-center gap-3">
                  <input type="number" min={0} name="areaSize" value={formData.areaSize} onChange={handleChange}
                    className="input-field w-36" placeholder="VD: 250" />
                  <span className="text-sm text-slate-500">m²</span>
                </div>
                <p className="mt-1 text-xs text-slate-400">Dùng để tính khấu hao & định giá</p>
              </label>
            </div>
          </div>

          {/* ── Section 2: Cấu trúc vật lý ── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-5 flex items-center gap-2.5 text-sm font-black uppercase tracking-widest text-slate-500">
              <Layers className="h-4 w-4 text-indigo-500" /> Cấu trúc vật lý
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* Số tầng */}
              <div>
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Số tầng</span>
                <div className="flex items-center rounded-xl border border-slate-200 bg-white overflow-hidden focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                  <button
                    type="button"
                    onClick={() => setFormData(s => ({ ...s, floorCount: Math.max(1, (s.floorCount ?? 1) - 1) }))}
                    className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 text-xl font-bold transition-colors select-none shrink-0"
                  >−</button>
                  <input
                    type="number" min={1} value={formData.floorCount ?? 1}
                    onChange={e => setFormData(s => ({ ...s, floorCount: Math.max(1, Number(e.target.value) || 1) }))}
                    className="flex-1 h-11 text-center text-base font-bold text-slate-900 bg-transparent border-none outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    onClick={() => setFormData(s => ({ ...s, floorCount: (s.floorCount ?? 1) + 1 }))}
                    className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 text-xl font-bold transition-colors select-none shrink-0"
                  >+</button>
                </div>
              </div>

              {/* Tổng phòng */}
              <div>
                <span className="mb-1.5 block text-sm font-bold text-slate-700">Tổng phòng</span>
                <div className="flex items-center rounded-xl border border-slate-200 bg-white overflow-hidden focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 transition-all">
                  <button
                    type="button"
                    onClick={() => setTotalRoomsInput(v => Math.max(1, v - 1))}
                    className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 text-xl font-bold transition-colors select-none shrink-0"
                  >−</button>
                  <input
                    type="number" min={1} value={totalRoomsInput}
                    onChange={e => setTotalRoomsInput(Math.max(1, Number(e.target.value)))}
                    placeholder="VD: 12"
                    className="flex-1 h-11 text-center text-base font-bold text-slate-900 bg-transparent border-none outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none placeholder:font-normal placeholder:text-slate-300"
                  />
                  <button
                    type="button"
                    onClick={() => setTotalRoomsInput(v => v + 1)}
                    className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 text-xl font-bold transition-colors select-none shrink-0"
                  >+</button>
                </div>
                <p className="mt-1 text-xs text-slate-400">Xác nhận lại chính xác ở Bước 2</p>
              </div>
            </div>
          </div>

          {/* ── Section 3: Ghi chú nội bộ ── */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="mb-5 flex items-center gap-2.5 text-sm font-black uppercase tracking-widest text-slate-500">
              <ImageIcon className="h-4 w-4 text-indigo-500" /> Ghi chú & Hình ảnh
            </h3>

            <label className="block mb-4">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Ghi chú nội bộ</span>
              <textarea name="descriptions" value={formData.descriptions} onChange={handleChange}
                className="input-field min-h-[90px]"
                placeholder="Tiện ích nổi bật, tình trạng hiện tại, lưu ý đặc biệt cho đội vận hành..." />
              <p className="mt-1 text-xs text-slate-400">Chỉ hiển thị nội bộ — không công khai cho khách thuê</p>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">Ảnh tòa nhà</span>
              <label className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-all ${
                isUploading
                  ? 'border-indigo-400 bg-indigo-50 animate-pulse cursor-not-allowed'
                  : 'border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/50'
              }`}>
                {isUploading ? (
                  <>
                    <div className="relative h-8 w-8">
                      <svg className="animate-spin h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </div>
                    <span className="text-sm font-bold text-indigo-600">
                      Đang tải {uploadProgress.done}/{uploadProgress.total} ảnh...
                    </span>
                    <div className="w-48 h-1.5 bg-indigo-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress.total ? (uploadProgress.done / uploadProgress.total) * 100 : 0}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="h-7 w-7 text-slate-300" />
                    <span className="text-sm font-semibold text-slate-500">Bấm để chọn ảnh hoặc kéo thả vào đây</span>
                    <span className="text-xs text-slate-400">PNG, JPG — dùng cho hồ sơ nội bộ</span>
                  </>
                )}
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} disabled={isUploading} />
              </label>

              {/* Grid ảnh + skeleton cho ảnh đang upload */}
              {((formData.imageUrls?.length ?? 0) > 0 || isUploading) && (
                <div className="mt-3 grid grid-cols-5 gap-2">
                  {formData.imageUrls!.map((url, idx) => (
                    <div key={idx} className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200">
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                        <button type="button" onClick={() => removeImage(idx)}
                          className="rounded-full bg-white p-1.5 text-rose-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {/* Skeleton placeholders cho ảnh chưa xong */}
                  {isUploading && Array.from({ length: uploadProgress.total - uploadProgress.done }).map((_, i) => (
                    <div key={`sk-${i}`} className="relative aspect-square rounded-lg border border-slate-200 overflow-hidden bg-slate-100">
                      <div className="absolute inset-0 animate-shimmer"
                        style={{ background: 'linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)', backgroundSize: '200% 100%' }} />
                    </div>
                  ))}
                </div>
              )}
            </label>
          </div>

          {/* ── Actions ── */}
          <div className="flex items-center justify-between pt-2">
            <button type="button" onClick={backToList}
              className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 transition">
              Hủy
            </button>
            <button type="submit" disabled={submitting || isUploading}
              className="btn-primary flex items-center gap-2 rounded-xl px-8 py-2.5 text-sm shadow-lg shadow-indigo-500/20 disabled:opacity-50 font-bold">
              {submitting ? 'Đang khởi tạo...' : <><Plus className="h-4 w-4" /> Khởi tạo tòa nhà</>}
            </button>
          </div>
        </form>

        <ConfirmDialog
          open={confirmCreateOpen}
          tone="primary"
          title="Khởi tạo tòa nhà này?"
          message={
            <>
              Tạo hồ sơ tòa nhà <b className="text-slate-700">{formData.propertyName || '(chưa đặt tên)'}</b> với{' '}
              <b className="text-slate-700">{formData.floorCount || 1} tầng · {totalRoomsInput} phòng</b>?
              Sau khi tạo bạn sẽ tiếp tục bổ sung hợp đồng & thiết bị.
            </>
          }
          confirmText="Khởi tạo"
          loading={submitting}
          onConfirm={handleCreateSubmit}
          onCancel={() => setConfirmCreateOpen(false)}
        />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // VIEW: Danh sách tòa nhà (màn hình chính)
  // ═══════════════════════════════════════════════════════════════════
  // Nút hành động (vô hiệu / xóa / kích hoạt) — dùng chung cho thẻ & bảng.
  const rowActions = (b: PropertyResponse) => (
    <>
      {b.status === 'DISABLED' ? (
        <>
          <button onClick={(e) => askRowAction('enable', b, e)} title="Kích hoạt lại"
            className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50">
            <Power className="h-4 w-4" />
          </button>
          <button onClick={(e) => askRowAction('delete', b, e)} title="Xóa vĩnh viễn"
            className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50">
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      ) : b.status === 'ACTIVE' ? (
        <>
          <button onClick={(e) => askRowAction('disable', b, e)} title="Vô hiệu hóa (cần phòng trống)"
            className="rounded-md p-1.5 text-amber-600 hover:bg-amber-50">
            <XCircle className="h-4 w-4" />
          </button>
          <button onClick={(e) => askRowAction('delete', b, e)} title="Xóa (cần phòng trống)"
            className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50">
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      ) : (
        <>
          <button onClick={(e) => askRowAction('disable', b, e)} title="Vô hiệu hóa"
            className="rounded-md p-1.5 text-amber-600 hover:bg-amber-50">
            <XCircle className="h-4 w-4" />
          </button>
          {b.status === 'DRAFT' && (
            <button onClick={(e) => askRowAction('delete', b, e)} title="Xóa nháp"
              className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </>
      )}
    </>
  );

  return (
    <div className="space-y-5">
      {/* ── Hero + stepper quy trình ── */}
      <PageHero
        eyebrow="Quy trình tiếp nhận nhà"
        title="Khởi tạo nhà"
        subtitle="Tạo hồ sơ tòa nhà, hợp đồng đầu vào & thiết bị chủ nhà bàn giao"
        icon={FilePlus}
        steps={ONBOARDING_STEPS.map(s => ({ ...s, current: s.to === '/admin/buildings/draft' }))}
      />

      {/* ── Số liệu: bấm để lọc nhanh ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Tổng tòa nhà" value={kpi.total} icon={Building2} tone="blue"
          helper="Toàn bộ hồ sơ đã tiếp nhận"
          onClick={() => f.setStatus('all')} active={f.status === 'all'} />
        <StatCard title="Tổng phòng" value={kpi.rooms} icon={DoorOpen} tone="indigo"
          helper={kpi.total ? `TB ${(kpi.rooms / kpi.total).toFixed(1)} phòng / tòa` : undefined} />
        <StatCard title="Đang nháp" value={kpi.draft} icon={TrendingUp} tone="slate"
          helper="chưa hoàn tất khởi tạo" progress={kpi.total ? kpi.draft / kpi.total : 0}
          onClick={() => f.setStatus('DRAFT')} active={f.status === 'DRAFT'} />
        <StatCard title="Đã khởi tạo" value={kpi.initialized} icon={CheckCircle2} tone="emerald"
          helper="hồ sơ đã hoàn tất" progress={kpi.total ? kpi.initialized / kpi.total : 0}
          onClick={() => f.setStatus('INITIALIZED')} active={f.status === 'INITIALIZED'} />
      </div>

      {/* ── Thanh tìm kiếm & bộ lọc ── */}
      <BuildingFilterBar
        f={f}
        statusOptions={DRAFT_STATUS_OPTIONS}
        hiddenFilters={['renovation', 'manager']}
        action={
          <button onClick={() => setImportOpen(true)}
            className="btn-primary flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5">
            <FileSpreadsheet className="h-4 w-4" /> Nhập từ Excel
          </button>
        }
      />

      {listLoading ? (
        <div className="py-16 text-center text-slate-400">Đang tải dữ liệu...</div>
      ) : listError ? (
        <div className="py-16 text-center text-slate-400">
          <XCircle className="mx-auto h-10 w-10 mb-3 text-rose-300" />
          <p className="text-sm font-semibold text-rose-500">Không tải được danh sách tòa nhà. Máy chủ có thể đang khởi động lại.</p>
          <button onClick={fetchBuildings}
            className="mt-4 btn-primary flex items-center gap-2 mx-auto rounded-xl px-5 py-2.5 text-sm">
            Thử lại
          </button>
        </div>
      ) : f.filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-16 text-center text-slate-400">
          <Building2 className="mx-auto mb-3 h-10 w-10 opacity-30" />
          {f.activeCount > 0 ? (
            <>
              <p className="text-sm font-semibold text-slate-500">Không có tòa nhà nào khớp bộ lọc hiện tại.</p>
              <button onClick={f.reset}
                className="mx-auto mt-4 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50">
                Xóa bộ lọc
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">Chưa có tòa nhà nào. Hãy nhập từ Excel để bắt đầu.</p>
              <button onClick={() => setImportOpen(true)}
                className="btn-primary mx-auto mt-4 flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm">
                <FileSpreadsheet className="h-4 w-4" /> Nhập từ Excel
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <ResultBar f={f} />

          {f.view === 'table' ? (
            <BuildingTable
              rows={f.paged}
              getBadge={getStatusBadge}
              onRowClick={openDetail}
              showRenovation={false}
              showManager={false}
              selectedIds={selectedSet}
              onToggleRow={toggleRow}
              onToggleAll={(checked) => {
                const pageIds = f.paged.map(b => b.id);
                setSelectedIds(s => checked
                  ? [...new Set([...s, ...pageIds])]
                  : s.filter(id => !pageIds.includes(id)));
              }}
              renderActions={(b) => (
                <>
                  <button onClick={() => openDetail(b)} title="Xem hồ sơ"
                    className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-600">
                    <Eye className="h-4 w-4" />
                  </button>
                  {rowActions(b)}
                </>
              )}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {f.paged.map(b => {
                const isDraft = draftState(b) === 'DRAFT';
                return (
                  <BuildingCard
                    key={b.id}
                    onClick={() => openDetail(b)}
                    name={b.propertyName}
                    address={b.fullAddress || b.shortAddress}
                    zoneName={b.zoneName}
                    typeLabel={b.wholeHouse === null ? 'Chưa chọn loại' : b.wholeHouse ? 'Nhà nguyên căn' : 'Phòng trọ'}
                    areaSize={b.areaSize}
                    totalRooms={b.totalRooms}
                    floors={b.totalFloor ?? b.floorCount ?? '—'}
                    badge={getStatusBadge(b)}
                    selected={selectedSet.has(b.id)}
                    onSelectChange={() => toggleRow(b.id)}
                    overlay={
                      <div className="absolute right-3 top-3 z-10 flex gap-1 rounded-lg bg-white/80 p-1 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                        {rowActions(b)}
                      </div>
                    }
                  >
                    <button onClick={(e) => { e.stopPropagation(); openDetail(b); }}
                      className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition ${
                        isDraft
                          ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-800 hover:text-white'
                      }`}>
                      <Eye className="h-4 w-4" /> {isDraft ? 'Tiếp tục khởi tạo' : 'Xem hồ sơ'}
                    </button>
                  </BuildingCard>
                );
              })}
            </div>
          )}

          <Pagination page={f.page} totalPages={f.totalPages} onChange={f.setPage} />
        </>
      )}

      {/* Thanh thao tác hàng loạt */}
      <BulkActionBar count={selectedIds.length} onClear={() => setSelectedIds([])}>
        <button onClick={() => setBulkAction('disable')}
          className="flex items-center gap-2 rounded-xl bg-amber-500 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-amber-600">
          <XCircle className="h-4 w-4" /> Vô hiệu hóa
        </button>
        <button onClick={() => setBulkAction('delete')}
          className="flex items-center gap-2 rounded-xl bg-rose-600 px-3.5 py-2 text-sm font-bold text-white transition hover:bg-rose-700">
          <Trash2 className="h-4 w-4" /> Xóa
        </button>
      </BulkActionBar>

      {/* Xác nhận hành động trên 1 tòa nhà */}
      {rowConfirmProps && (
        <ConfirmDialog
          open
          tone={rowConfirmProps.tone}
          title={rowConfirmProps.title}
          message={rowConfirmProps.message}
          confirmText={rowConfirmProps.confirmText}
          loading={rowRunning}
          onConfirm={runRowAction}
          onCancel={() => setRowConfirm(null)}
        />
      )}

      <ConfirmDialog
        open={!!bulkAction}
        tone="danger"
        title={bulkAction === 'delete'
          ? `Xóa ${selectedIds.length} tòa nhà đã chọn?`
          : `Vô hiệu hóa ${selectedIds.length} tòa nhà đã chọn?`}
        message={
          <>
            {bulkAction === 'delete' ? (
              <>Toàn bộ hợp đồng, cải tạo, thiết bị và phòng của <b className="text-slate-700">{selectedIds.length} căn</b> này
              sẽ bị xóa vĩnh viễn và <b className="text-slate-700">không thể hoàn tác</b>.</>
            ) : (
              <>Hệ thống sẽ vô hiệu hóa <b className="text-slate-700">{selectedIds.length} căn</b> đã chọn.</>
            )}
            <br />
            Nhà đang kinh doanh mà còn khách thuê sẽ tự động được bỏ qua.
          </>
        }
        confirmText={bulkAction === 'delete' ? 'Xóa tất cả' : 'Vô hiệu hóa tất cả'}
        loading={bulkRunning}
        onConfirm={runBulk}
        onCancel={() => setBulkAction(null)}
      />

      {importModal}
    </div>
  );
};
