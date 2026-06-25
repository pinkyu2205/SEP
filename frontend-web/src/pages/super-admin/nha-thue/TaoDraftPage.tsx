import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Building, Building2, CheckCircle2, Clock, DoorOpen,
  FileSpreadsheet, FileText, Image as ImageIcon, Layers, MapPin, Plus, Power, Search, Settings2,
  TrendingUp, Trash2, Upload, X, XCircle,
} from 'lucide-react';
import { propertyService } from '../../../services/property.service';
import { zoneService } from '../../../services/zone.service';
import { uploadToCloudinary } from '../../../services/upload.service';
import { extractContractData } from '../../../utils/pdfExtract';
import type { InboundContractRequest, PropertyDraftRequest, PropertyResponse, ZoneResponse } from '../../../types/api.types';
import { StepPropertyInfo } from '../properties/wizard/StepPropertyInfo';
import { KpiCard } from '../shared';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { AddressAutocomplete } from '../../../components/AddressAutocomplete';
import { PropertyMap } from '../../../components/PropertyMap';
import { LeaseImportPanel } from './LeaseImportPanel';
import { HandoverEquipmentSection } from './HandoverEquipmentSection';

const statusBadge: Record<string, { label: string; cls: string }> = {
  DRAFT:                { label: 'Nháp',                cls: 'bg-slate-100 text-slate-700' },
  UNDER_RENOVATION:     { label: 'Chờ cấu hình',        cls: 'bg-amber-100 text-amber-800' },
  RENOVATION_COMPLETED: { label: 'Đã hoàn tất cải tạo', cls: 'bg-teal-100 text-teal-800' },
  PENDING_HOST_REVIEW:  { label: 'Chờ duyệt',           cls: 'bg-blue-100 text-blue-800' },
  ACTIVE:               { label: 'Đang kinh doanh',     cls: 'bg-emerald-100 text-emerald-800' },
  DISABLED:             { label: 'Đã vô hiệu',          cls: 'bg-rose-100 text-rose-800' },
};

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
  const navigate = useNavigate();
  const [newProperty, setNewProperty] = useState<PropertyResponse | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<PropertyResponse | null>(null);

  // ─── building list ────────────────────────────────────────────────
  const [buildings, setBuildings] = useState<PropertyResponse[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [submittedDrafts, setSubmittedDrafts] = useState<number[]>(() => readSubmittedDrafts());

  // Badge: DRAFT đã bấm "Xác nhận" bước cuối → "Đã khởi tạo", DRAFT đang tạo dở → "Nháp"
  const getStatusBadge = (b: PropertyResponse): { label: string; cls: string } => {
    if (b.status === 'DRAFT' && submittedDrafts.includes(b.id)) {
      return { label: 'Đã khởi tạo', cls: 'bg-indigo-100 text-indigo-800' };
    }
    return statusBadge[b.status] ?? statusBadge.DRAFT;
  };

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
    try {
      const res = await propertyService.getProperties(0, 100);
      setBuildings(res.content);
    } catch (e) { console.error(e); }
    finally { setListLoading(false); }
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
    (acc, b) => ({
      total: acc.total + 1,
      draft: acc.draft + (b.status === 'DRAFT' && !submittedDrafts.includes(b.id) ? 1 : 0),
      active: acc.active + (b.status === 'ACTIVE' ? 1 : 0),
      rooms: acc.rooms + (b.totalRooms || 0),
    }),
    { total: 0, draft: 0, active: 0, rooms: 0 }
  ), [buildings, submittedDrafts]);

  const filtered = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return buildings.filter(b => {
      // Draft đã bấm "Xác nhận" bước cuối → nhóm lọc riêng "Đã khởi tạo" (FE-side, không phải status BE)
      const effectiveStatus = b.status === 'DRAFT' && submittedDrafts.includes(b.id)
        ? 'INITIALIZED' : b.status;
      const matchStatus = statusFilter === 'all' || effectiveStatus === statusFilter;
      const matchSearch = !kw || [b.propertyName, b.shortAddress, b.fullAddress, b.zoneName]
        .some(v => v?.toLowerCase().includes(kw));
      return matchStatus && matchSearch;
    });
  }, [buildings, statusFilter, search, submittedDrafts]);

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
  const ensureVacant = async (b: PropertyResponse): Promise<boolean> => {
    if (b.wholeHouse === false) {
      try {
        const rooms = await propertyService.getRooms(b.id);
        const rented = rooms.filter(r => r.status === 'RENTED');
        if (rented.length > 0) {
          toast.error(`Còn ${rented.length} phòng đang có khách thuê — không thể thực hiện. Chờ hết hợp đồng hoặc chuyển khách trước.`);
          return false;
        }
      } catch {
        // getRooms lỗi (vd BE thiếu migration is_deleted) → để BE quyết định cuối cùng
      }
    }
    return true;
  };

  const handleDeleteBuilding = async (b: PropertyResponse, e: React.MouseEvent) => {
    e.stopPropagation();
    if (b.status === 'ACTIVE' && !(await ensureVacant(b))) return;
    const extra = b.wholeHouse ? ' Hãy chắc chắn nhà hiện KHÔNG còn khách thuê.' : '';
    if (!window.confirm(`Xác nhận xóa tòa nhà "${b.propertyName}"? Toàn bộ hợp đồng, cải tạo, thiết bị và phòng của căn này sẽ bị xóa.${extra}`)) return;
    try {
      await propertyService.deleteProperty(b.id);
      toast.success('Đã xóa căn nhà');
      fetchBuildings();
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404) {
        // Đã bị xóa trước đó → coi như thành công, làm mới danh sách
        toast.success('Căn nhà đã được xóa trước đó');
        fetchBuildings();
      } else if (status === 403) {
        toast.error('Bạn cần quyền ADMIN để xóa căn nhà này');
      }
      // 422 (ACTIVE / đã có chỉ số điện nước) & 400: api interceptor đã hiển thị message từ BE
    }
  };

  const handleDisableBuilding = async (b: PropertyResponse, e: React.MouseEvent) => {
    e.stopPropagation();
    if (b.status === 'ACTIVE' && !(await ensureVacant(b))) return;
    const extra = b.wholeHouse ? ' Hãy chắc chắn nhà hiện KHÔNG còn khách thuê.' : '';
    if (!window.confirm(`Vô hiệu hóa tòa nhà "${b.propertyName}"?${extra}`)) return;
    try {
      await propertyService.disableProperty(b.id);
      toast.success('Đã vô hiệu hóa');
      fetchBuildings();
    } catch {
      // api interceptor đã toast lỗi
    }
  };

  const handleEnableBuilding = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Kích hoạt lại tòa nhà này?')) return;
    try {
      await propertyService.enableProperty(id);
      toast.success('Đã kích hoạt lại tòa nhà');
      fetchBuildings();
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404 || status === 405) {
        toast.error('BE chưa hỗ trợ kích hoạt lại (POST /properties/{id}/enable) — đã ghi yêu cầu cho BE');
      }
      // các lỗi khác: api interceptor đã toast
    }
  };

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
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <button onClick={backToList}
          className="mb-6 flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600 transition">
          <ArrowLeft className="h-4 w-4" /> Quay lại danh sách
        </button>

        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900">{selectedBuilding.propertyName}</h1>
            <div className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>{selectedBuilding.fullAddress || selectedBuilding.shortAddress}</span>
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${badge.cls}`}>{badge.label}</span>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-blue-50 p-4 text-center">
            <p className="text-xl font-black text-blue-700">{selectedBuilding.totalRooms || 0}</p>
            <p className="mt-0.5 text-xs font-semibold text-blue-600">Tổng phòng</p>
          </div>
          <div className="rounded-xl bg-indigo-50 p-4 text-center">
            <p className="text-xl font-black text-indigo-700">{selectedBuilding.totalFloor ?? selectedBuilding.floorCount ?? '—'}</p>
            <p className="mt-0.5 text-xs font-semibold text-indigo-600">Số tầng</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 text-center">
            <p className="text-xl font-black text-slate-700">{selectedBuilding.areaSize ? `${selectedBuilding.areaSize} m²` : '—'}</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">Diện tích</p>
          </div>
        </div>

        {/* Ảnh tòa nhà */}
        {(selectedBuilding.imageUrls?.length ?? 0) > 0 && (
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="mb-3 text-sm font-black uppercase tracking-widest text-slate-500">Hình ảnh tòa nhà</h3>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {selectedBuilding.imageUrls!.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer"
                  className="group aspect-square overflow-hidden rounded-xl border border-slate-200 block">
                  <img src={url} alt={`Ảnh ${i + 1}`} className="h-full w-full object-cover group-hover:scale-105 transition duration-200" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Thiết bị chủ nhà bàn giao (import đợt 1 — chỉ hiển thị) */}
        <HandoverEquipmentSection propertyId={selectedBuilding.id} />

        {/* Bản đồ vị trí (Goong) */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-500">
            <MapPin className="h-4 w-4 text-indigo-500" /> Vị trí trên bản đồ
          </h3>
          <PropertyMap address={selectedBuilding.fullAddress || selectedBuilding.shortAddress} />
        </div>

        <StepPropertyInfo property={selectedBuilding} onNext={() => handleFinishOnboarding(selectedBuilding.id)} nextLabel="Xác nhận & Quay về danh sách" confirmBeforeNext />
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
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Khởi tạo nhà</h1>
          <p className="text-slate-500 mt-1 text-sm font-medium">Quản lý toàn bộ tòa nhà — nhập hàng loạt từ Excel hoặc tạo thủ công</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-bold text-indigo-700 hover:bg-indigo-100 transition">
            <FileSpreadsheet className="h-4 w-4" /> Nhập từ Excel
          </button>
          <button onClick={() => setView('create-form')}
            className="btn-primary flex items-center gap-2 rounded-xl px-5 py-2.5">
            <Plus className="h-5 w-5" /> Khởi tạo mới
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Tổng tòa nhà" value={String(kpi.total)} icon={Building2} color="bg-blue-50 text-blue-700" />
        <KpiCard title="Tổng phòng" value={String(kpi.rooms)} icon={DoorOpen} color="bg-indigo-50 text-indigo-700" />
        <KpiCard title="Đang nháp" value={String(kpi.draft)} icon={TrendingUp} color="bg-slate-50 text-slate-700" />
        <KpiCard title="Đang kinh doanh" value={String(kpi.active)} icon={CheckCircle2} color="bg-emerald-50 text-emerald-700" />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="input-field pl-9" placeholder="Tìm theo tên, địa chỉ..." />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field w-52">
          <option value="all">Tất cả trạng thái</option>
          <option value="DRAFT">Nháp</option>
          <option value="INITIALIZED">Đã khởi tạo</option>
          <option value="UNDER_RENOVATION">Chờ cấu hình</option>
          <option value="RENOVATION_COMPLETED">Đã hoàn tất cải tạo</option>
          <option value="PENDING_HOST_REVIEW">Chờ duyệt</option>
          <option value="ACTIVE">Đang kinh doanh</option>
          <option value="DISABLED">Đã vô hiệu</option>
        </select>
      </div>

      {listLoading ? (
        <div className="py-16 text-center text-slate-400">Đang tải dữ liệu...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <Building2 className="mx-auto h-10 w-10 mb-3 opacity-30" />
          <p className="text-sm font-semibold">Chưa có tòa nhà nào. Hãy tạo draft đầu tiên.</p>
          <button onClick={() => setView('create-form')}
            className="mt-4 btn-primary rounded-xl px-5 py-2.5 text-sm">
            Khởi tạo tòa nhà đầu tiên
          </button>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          {filtered.map(b => {
            const badge = getStatusBadge(b);
            const isSubmittedDraft = b.status === 'DRAFT' && submittedDrafts.includes(b.id);
            return (
              <div key={b.id} onClick={() => openDetail(b)} className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-cyan-300 hover:shadow-md transition relative group">
                <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity bg-white/80 p-1 rounded-lg backdrop-blur-sm z-10">
                  {b.status === 'DISABLED' ? (
                    <>
                      {/* Đã vô hiệu → cho phép kích hoạt lại hoặc xóa vĩnh viễn */}
                      <button onClick={(e) => handleEnableBuilding(b.id, e)} title="Kích hoạt lại"
                        className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md">
                        <Power className="w-4 h-4" />
                      </button>
                      <button onClick={(e) => handleDeleteBuilding(b, e)} title="Xóa vĩnh viễn"
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  ) : b.status === 'ACTIVE' ? (
                    <>
                      {/* Đang kinh doanh → vô hiệu hóa / xóa, chỉ khi không còn khách thuê */}
                      <button onClick={(e) => handleDisableBuilding(b, e)} title="Vô hiệu hóa (cần phòng trống)"
                        className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-md">
                        <XCircle className="w-4 h-4" />
                      </button>
                      <button onClick={(e) => handleDeleteBuilding(b, e)} title="Xóa (cần phòng trống)"
                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Các trạng thái khác (Nháp/Cải tạo/Chờ duyệt...) → vô hiệu hóa; Nháp cho xóa trực tiếp */}
                      <button onClick={(e) => handleDisableBuilding(b, e)} title="Vô hiệu hóa"
                        className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-md">
                        <XCircle className="w-4 h-4" />
                      </button>
                      {b.status === 'DRAFT' && (
                        <button onClick={(e) => handleDeleteBuilding(b, e)} title="Xóa nháp"
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div className="flex items-start justify-between gap-3 pr-14">
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-slate-950 leading-tight">{b.propertyName}</p>
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                      <MapPin className="h-3 w-3 shrink-0" />
                      <span className="line-clamp-1">{b.fullAddress || b.shortAddress}</span>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-black ${badge.cls}`}>{badge.label}</span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {b.zoneName && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{b.zoneName}</span>}
                  <span className="font-bold text-emerald-600">
                    {b.wholeHouse === null ? 'Chưa chọn loại' : b.wholeHouse ? 'Nhà nguyên căn' : 'Phòng trọ'}
                  </span>
                  {b.areaSize ? <span className="text-slate-500">{b.areaSize} m²</span> : null}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-blue-50 py-2 text-blue-700">
                    <p className="font-black text-base leading-tight">{b.totalRooms || '—'}</p>
                    <p className="mt-0.5">Tổng phòng</p>
                  </div>
                  <div className="rounded-lg bg-indigo-50 py-2 text-indigo-700">
                    <p className="font-black text-base leading-tight">{b.totalFloor ?? b.floorCount ?? '—'}</p>
                    <p className="mt-0.5">Số tầng</p>
                  </div>
                  <div className="rounded-lg bg-amber-50 py-2 text-amber-700">
                    <p className="font-black text-base leading-tight">
                      {b.renovationCompleted ? 'Xong' : b.hasRenovation ? 'Chưa xong' : '—'}
                    </p>
                    <p className="mt-0.5">Cải tạo</p>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100">
                  {(b.status === 'UNDER_RENOVATION' || isSubmittedDraft) && (
                    <button onClick={(e) => { e.stopPropagation(); navigate(`/admin/buildings/configuration/${b.id}`); }}
                      className="w-full py-2.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white transition rounded-xl font-bold text-sm flex justify-center items-center gap-2">
                      <Settings2 className="w-4 h-4" /> Cấu hình khai thác
                    </button>
                  )}
                  {b.status === 'RENOVATION_COMPLETED' && (
                    <div className="w-full py-2 text-center text-xs font-semibold text-teal-600 bg-teal-50 rounded-xl flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Đã hoàn tất cải tạo — chờ gửi Host
                    </div>
                  )}
                  {b.status === 'PENDING_HOST_REVIEW' && (
                    <div className="w-full py-2 text-center text-xs font-semibold text-blue-600 bg-blue-50 rounded-xl flex items-center justify-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Đang chờ Host phê duyệt
                    </div>
                  )}
                  {b.status === 'ACTIVE' && (
                    <div className="w-full py-2 text-center text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-xl flex items-center justify-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Đang kinh doanh
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {importModal}
    </div>
  );
};
