import { useEffect, useMemo, useState } from 'react';
import { X, ShieldAlert, UploadCloud, Loader2, FileText, Keyboard, CheckCircle2, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import type { PropertyResponse, RoomResponse, OnboardTenantRequest, TenantContractResponse } from '../../types/api.types';
import { propertyService } from '../../services/property.service';
import { tenantService, isTenantEligibleRole } from '../../services/tenant.service';
import { uploadToCloudinary } from '../../services/upload.service';
import { extractTenantContractData } from '../../utils/pdfExtract';

interface Props {
  onSuccess: () => void;
  onClose: () => void;
  /** Có giá trị → mở modal ở CHẾ ĐỘ SỬA hợp đồng nháp đã tồn tại (không tạo mới). */
  editContract?: TenantContractResponse;
}

const todayIso = () => new Date().toISOString().split('T')[0];

/** yyyy-MM-dd + n năm → yyyy-MM-dd (dùng cho giới hạn ngày kết thúc). */
const addYearsIso = (dateStr: string, years: number): string => {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split('T')[0];
};

/** Giữ state raw là chuỗi CHỮ SỐ THUẦN (khớp Number(...) khi build payload); chỉ format lúc hiển thị. */
const formatVndDisplay = (raw: string): string => (raw ? Number(raw).toLocaleString('vi-VN') : '');
const parseVndInput = (displayValue: string): string => displayValue.replace(/\D/g, '');

/**
 * Modal tạo HỢP ĐỒNG NHÁP (DRAFT) cho luồng đón khách v2.
 * - Tab "Upload file": chọn file HĐ đã điền (DOCX/PDF) → tự bóc tách + upload lưu link → admin review/chỉnh.
 * - Tab "Nhập tay": admin nhập trực tiếp → sau khi lưu, BE tự fill dữ liệu vào template
 *   DOCX (POST .../draft-document) → FE upload Cloudinary → lưu draftContractFileUrl.
 * Sau khi lưu TỰ ĐỘNG gán cho quản lý phụ trách nhà (operationManagerId của property) —
 * không cho chọn tay, vì nhà đã hoạt động thì admin đã gán quản lý sẵn từ trước.
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
      targetTokens.forEach((t) => { if (candidateTokens.has(t)) overlap += 1; });
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
  DRAFT: 'chưa định giá',
  DISABLED: 'ngưng khai thác',
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

  const [lookupRole, setLookupRole] = useState<string | null>(null);
  const [lookupChecked, setLookupChecked] = useState(false);
  const [lookupEligible, setLookupEligible] = useState<boolean | null>(null);

  const [submitting, setSubmitting] = useState(false);
  // Trạng thái từng bước của chuỗi submit (tạo → gán manager → sinh file → upload) —
  // hiện text cụ thể vì bước sinh file DOCX + upload Cloudinary có thể mất vài giây.
  const [submitStage, setSubmitStage] = useState('');
  // Sau khi tạo thành công: hiện panel kết quả thay vì đóng modal ngay, để admin xem
  // link hợp đồng (nếu có) trước khi đóng.
  const [successView, setSuccessView] = useState<{ fileUrl: string | null; managerName: string | null } | null>(null);

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
    rentAmount: editContract.rentAmount != null ? String(editContract.rentAmount) : '',
    deposit: editContract.deposit != null ? String(editContract.deposit) : '',
    depositMonths: editContract.depositMonths != null ? String(editContract.depositMonths) : '1',
    expectedReceptionDate: editContract.expectedReceptionDate || '',
    endDate: editContract.endDate || '',
  } : {
    propertyId: '',
    roomId: '',
    fullName: '',
    phoneNumber: '',
    dateOfBirth: '',
    cccd: '',
    rentAmount: '',
    deposit: '',
    depositMonths: '1',
    expectedReceptionDate: '',
    endDate: '',
  });

  // Tên nhà để hiện read-only khi sửa — tra trong danh sách ĐẦY ĐỦ (không lọc ACTIVE)
  // vì property có thể đã đổi status sau khi tạo draft, vẫn phải hiện được tên.
  const editPropertyInfo = useMemo(
    () => (isEditMode ? allProperties.find((p) => p.id === editContract!.propertyId) : undefined),
    [isEditMode, allProperties, editContract],
  );

  useEffect(() => {
    (async () => {
      try {
        const propPage = await propertyService.getProperties(0, 200);
        setAllProperties(propPage.content);
        // Chỉ cho chọn nhà ACTIVE (không phải đang bảo trì/đã cho thuê nguyên căn/chưa
        // hoàn thiện onboarding...) — chặn từ gốc, không phải lọc UI đơn thuần vì BE
        // cũng ràng buộc tương tự khi tạo hợp đồng.
        setProperties(propPage.content.filter((p) => p.status === 'ACTIVE'));
      } catch {
        /* interceptor đã toast */
      }
    })();
  }, []);

  const selectedProperty = useMemo(
    () => properties.find((p) => String(p.id) === form.propertyId),
    [properties, form.propertyId],
  );
  const isWholeHouse = selectedProperty?.wholeHouse === true;

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
        // Chỉ cho chọn phòng AVAILABLE — phòng đang có khách (RENTED) hoặc đang bảo
        // trì (MAINTENANCE) không được vào dropdown. Lý do cụ thể hiện ở message bên dưới.
        setRooms(rs.filter((r) => r.status === 'AVAILABLE'));
      })
      .catch(() => { setRooms([]); setAllRoomsInProperty([]); })
      .finally(() => setLoadingRooms(false));
  }, [selectedProperty]);

  // Đếm phòng không-sẵn-sàng theo status để giải thích cho admin (thay vì chỉ báo
  // chung chung "hết phòng trống" — dễ khiến admin tưởng nhầm là lỗi hệ thống).
  const unavailableRoomsBreakdown = useMemo(() => {
    if (rooms.length > 0 || allRoomsInProperty.length === 0) return '';
    const counts: Record<string, number> = {};
    allRoomsInProperty.forEach((r) => {
      if (r.status !== 'AVAILABLE') counts[r.status] = (counts[r.status] ?? 0) + 1;
    });
    return Object.entries(counts)
      .map(([status, n]) => `${n} ${ROOM_STATUS_LABEL[status] ?? status.toLowerCase()}`)
      .join(', ');
  }, [rooms, allRoomsInProperty]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleRoomChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const roomId = e.target.value;
    const room = rooms.find((r) => String(r.id) === roomId);
    setForm((prev) => ({
      ...prev,
      roomId,
      rentAmount: room?.price != null ? String(room.price) : prev.rentAmount,
      deposit: room?.deposit != null ? String(room.deposit) : prev.deposit,
    }));
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
          expectedReceptionDate: extracted.startDate || prev.expectedReceptionDate,
          endDate: extracted.endDate || prev.endDate,
        }));

        // Gợi ý nhà theo địa chỉ bóc từ file — chỉ tự chọn nếu admin CHƯA chọn tay,
        // và chỉ khớp trong danh sách nhà đang ACTIVE (sẵn sàng cho thuê).
        if (extracted.address) {
          const match = suggestPropertyByAddress(extracted.address, properties);
          if (match) {
            setForm((prev) => ({ ...prev, propertyId: prev.propertyId || String(match.property.id) }));
            setAddressSuggestion(
              `Đã gợi ý nhà "${match.property.propertyName}" theo địa chỉ trong file — vui lòng kiểm tra lại.`,
            );
          } else {
            // Không khớp nhà nào đang sẵn sàng — thử tìm trong TOÀN BỘ danh sách để
            // báo rõ nguyên nhân (vd nhà đúng địa chỉ nhưng đang bảo trì/hết hạn).
            const blocked = suggestPropertyByAddress(extracted.address, allProperties);
            setAddressSuggestion(
              blocked
                ? `Địa chỉ trong file khớp với nhà "${blocked.property.propertyName}" nhưng nhà này hiện KHÔNG sẵn sàng cho thuê (${PROPERTY_STATUS_LABEL[blocked.property.status] ?? blocked.property.status}). Vui lòng chọn nhà khác hoặc kiểm tra lại.`
                : 'Không tự tìm được nhà khớp với địa chỉ trong file — vui lòng chọn tay.',
            );
          }
        } else {
          setAddressSuggestion('');
        }
        toast.success('Đã bóc tách thông tin từ file — vui lòng kiểm tra lại.');
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

  // Sửa hợp đồng nháp: PUT thông tin → render lại DOCX → upload Cloudinary → PUT URL
  // mới (đúng quy trình BE yêu cầu — không có bước này thì file cũ lệch dữ liệu mới).
  const handleUpdateSubmit = async () => {
    if (!editContract) return;
    setSubmitting(true);
    setSubmitStage('Đang cập nhật hợp đồng...');
    try {
      await tenantService.updateDraft(editContract.id, {
        fullName: form.fullName.trim(),
        cccd: form.cccd.trim(),
        phoneNumber: form.phoneNumber.trim(),
        dateOfBirth: form.dateOfBirth || undefined,
        moveInDate: form.expectedReceptionDate || undefined,
        rentAmount: Number(form.rentAmount),
        deposit: Number(form.deposit),
        depositMonths: Number(form.depositMonths) || 1,
        endDate: form.endDate || undefined,
        expectedReceptionDate: form.expectedReceptionDate || undefined,
      });

      setSubmitStage('Đang tạo lại file hợp đồng...');
      try {
        const blob = await tenantService.generateDraftDocument(editContract.id);
        const docxFile = new File([blob], `DRAFT-${editContract.contractCode}.docx`, {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        setSubmitStage('Đang tải file lên...');
        const url = await uploadToCloudinary(docxFile, 'raw');
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (roleWarning) return toast.error('SĐT thuộc tài khoản nội bộ — không thể onboard làm khách.');
    if (isEditMode) return handleUpdateSubmit();

    if (!selectedProperty) return toast.error('Vui lòng chọn bất động sản');
    if (!isWholeHouse && !form.roomId) return toast.error('Vui lòng chọn phòng');

    const moveInDate = form.expectedReceptionDate || todayIso();
    const payload: OnboardTenantRequest = {
      fullName: form.fullName.trim(),
      cccd: form.cccd.trim(),
      phoneNumber: form.phoneNumber.trim(),
      dateOfBirth: form.dateOfBirth || undefined,
      moveInDate,
      rentAmount: Number(form.rentAmount),
      deposit: Number(form.deposit),
      depositMonths: Number(form.depositMonths) || 1,
      endDate: form.endDate || undefined,
      expectedReceptionDate: form.expectedReceptionDate || undefined,
      draftContractFileUrl: draftFileUrl || undefined,
    };

    setSubmitting(true);
    setSubmitStage('Đang tạo hợp đồng nháp...');
    try {
      const draft = await tenantService.createDraft(
        selectedProperty.id,
        isWholeHouse ? null : Number(form.roomId),
        payload,
      );

      // Nhà đã đi vào hoạt động → đã có sẵn quản lý phụ trách (operationManagerId).
      // Gán tự động, không hỏi lại admin. Nhà nào chưa có quản lý thì báo để admin gán
      // tay sau ở danh sách nháp (nút "Gán/Đổi quản lý" vẫn giữ nguyên làm phương án dự phòng).
      let managerName: string | null = null;
      const operationManagerId = selectedProperty.operationManagerId;
      if (operationManagerId) {
        setSubmitStage('Đang gán quản lý & gửi thông báo...');
        try {
          await tenantService.assignManager(draft.id, {
            assignedManagerId: operationManagerId,
            expectedReceptionDate: form.expectedReceptionDate || undefined,
          });
          managerName = selectedProperty.operationManagerName || 'quản lý phụ trách';
        } catch {
          /* interceptor đã toast; không chặn luồng tạo hợp đồng */
        }
      }

      // Tạo tay (không phải import file có sẵn) → tự sinh file DOCX từ dữ liệu vừa
      // nhập, upload Cloudinary, lưu URL — admin có thể xem lại ngay. Import file thì
      // đã có draftFileUrl từ bước upload trong handleFileUpload, không sinh lại.
      let finalFileUrl = draftFileUrl || null;
      if (mode === 'manual') {
        setSubmitStage('Đang tạo file hợp đồng...');
        try {
          const blob = await tenantService.generateDraftDocument(draft.id);
          const docxFile = new File([blob], `DRAFT-${draft.contractCode}.docx`, {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          });
          setSubmitStage('Đang tải file lên...');
          const url = await uploadToCloudinary(docxFile, 'raw');
          await tenantService.updateDraft(draft.id, { draftContractFileUrl: url });
          finalFileUrl = url;
        } catch {
          toast.error('Đã tạo hợp đồng nháp nhưng KHÔNG sinh được file — có thể tạo lại ở danh sách nháp.');
        }
      }

      toast.success(
        managerName
          ? `Đã tạo hợp đồng nháp & gửi thông báo cho ${managerName}.`
          : 'Đã tạo hợp đồng nháp. Nhà này chưa có quản lý phụ trách — vào danh sách nháp để gán tay.',
      );
      onSuccess();
      setSuccessView({ fileUrl: finalFileUrl, managerName });
    } catch {
      /* interceptor đã toast */
    } finally {
      setSubmitting(false);
      setSubmitStage('');
    }
  };

  // Sau khi tạo thành công — panel kết quả thay cho form (view file + đóng).
  if (successView) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
        <div className="relative mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <h2 className="text-lg font-bold text-slate-900">Đã tạo hợp đồng nháp</h2>
            <p className="text-sm text-slate-500">
              {successView.managerName
                ? `Đã gửi thông báo cho ${successView.managerName}.`
                : 'Nhà này chưa có quản lý phụ trách — vào danh sách nháp để gán tay.'}
            </p>
            {successView.fileUrl && (
              <a
                href={successView.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                <FileText className="h-4 w-4" /> Xem hợp đồng nháp <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <button onClick={onClose} className="btn-primary mt-2 w-full">Đóng</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative mx-4 max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
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
              <select name="propertyId" value={form.propertyId} onChange={handleChange} className="input-field" required>
                <option value="">Chọn nhà đang cho thuê...</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.propertyName} — {p.shortAddress || p.fullAddress} {p.wholeHouse ? '(nguyên căn)' : ''}
                  </option>
                ))}
              </select>
              {/* Quản lý phụ trách nhà = operationManagerId có sẵn — tự động gán khi
                  tạo thành công, không cho chọn tay (nhà đã hoạt động thì đã có manager). */}
              {selectedProperty && (
                selectedProperty.operationManagerId ? (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Quản lý phụ trách: <span className="font-medium text-slate-700">{selectedProperty.operationManagerName || '—'}</span> (tự động gán + gửi thông báo sau khi lưu)
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-amber-600">
                    ⚠️ Nhà này chưa có quản lý phụ trách — sau khi tạo cần vào danh sách nháp để gán tay.
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
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.roomNumber}
                      {r.price != null ? ` — ${r.price.toLocaleString('vi-VN')}đ` : ''}
                    </option>
                  ))}
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
          <div className="grid grid-cols-2 gap-4">
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
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                CCCD <span className="text-rose-500">*</span>
              </label>
              <input name="cccd" value={form.cccd} onChange={handleChange} className="input-field" required />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Ngày sinh</label>
            <input
              type="date"
              name="dateOfBirth"
              value={form.dateOfBirth}
              onChange={handleChange}
              max={todayIso()}
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
                onChange={(e) => setForm((prev) => ({ ...prev, rentAmount: parseVndInput(e.target.value) }))}
                className="input-field text-right"
                placeholder="0"
                required
              />
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
                className="input-field text-right"
                placeholder="0"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Số tháng cọc</label>
              <select name="depositMonths" value={form.depositMonths} onChange={handleChange} className="input-field text-right">
                <option value="1">1 tháng</option>
                <option value="2">2 tháng</option>
              </select>
            </div>
          </div>

          {/* Ngày — đón khách chỉ được chọn từ hôm nay (CHỈ áp dụng lúc tạo mới — sửa
              draft cũ có thể đã qua ngày dự kiến, ép min=hôm nay sẽ khiến HTML5 coi
              value hiện tại là invalid và chặn submit dù field không required). Kết
              thúc tối đa 5 năm kể từ hôm nay (khớp Rule 4 BE: endDate.isAfter(today.plusYears(5))). */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Ngày dự kiến đón khách</label>
              <input
                type="date"
                name="expectedReceptionDate"
                value={form.expectedReceptionDate}
                onChange={handleChange}
                min={isEditMode ? undefined : todayIso()}
                className="input-field"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Ngày kết thúc (tuỳ chọn)</label>
              <input
                type="date"
                name="endDate"
                value={form.endDate}
                onChange={handleChange}
                min={form.expectedReceptionDate || (isEditMode ? undefined : todayIso())}
                max={addYearsIso(todayIso(), 5)}
                className="input-field"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">Hủy</button>
            <button type="submit" className="btn-primary" disabled={submitting || extracting}>
              {submitting ? (submitStage || 'Đang lưu...') : (isEditMode ? 'Cập nhật & tạo lại file' : 'Lưu hợp đồng nháp')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
