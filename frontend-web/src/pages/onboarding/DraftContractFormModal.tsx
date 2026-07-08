import { useEffect, useMemo, useState } from 'react';
import { X, ShieldAlert, UploadCloud, Loader2, FileText, Keyboard, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import type { PropertyResponse, RoomResponse, OnboardTenantRequest } from '../../types/api.types';
import { propertyService } from '../../services/property.service';
import { tenantService, isTenantEligibleRole } from '../../services/tenant.service';
import { uploadToCloudinary } from '../../services/upload.service';
import { extractTenantContractData } from '../../utils/pdfExtract';

interface Props {
  onSuccess: () => void;
  onClose: () => void;
}

type ManagerItem = { id: string; fullName: string; username: string };

const todayIso = () => new Date().toISOString().split('T')[0];

/**
 * Modal tạo HỢP ĐỒNG NHÁP (DRAFT) cho luồng đón khách v2.
 * - Tab "Upload file": chọn file HĐ đã điền (DOCX/PDF) → tự bóc tách + upload lưu link → admin review/chỉnh.
 * - Tab "Nhập tay": admin nhập trực tiếp.
 * Sau khi lưu có thể gán ngay cho quản lý vận hành (gửi thông báo).
 */
export const DraftContractFormModal = ({ onSuccess, onClose }: Props) => {
  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [managers, setManagers] = useState<ManagerItem[]>([]);
  const [rooms, setRooms] = useState<RoomResponse[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  const [mode, setMode] = useState<'upload' | 'manual'>('upload');
  const [extracting, setExtracting] = useState(false);
  const [fileName, setFileName] = useState('');
  const [draftFileUrl, setDraftFileUrl] = useState('');

  const [lookupRole, setLookupRole] = useState<string | null>(null);
  const [lookupChecked, setLookupChecked] = useState(false);

  const [assignNow, setAssignNow] = useState(true);
  const [assignManagerId, setAssignManagerId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    propertyId: '',
    roomId: '',
    fullName: '',
    phoneNumber: '',
    cccd: '',
    rentAmount: '',
    deposit: '',
    depositMonths: '1',
    expectedReceptionDate: '',
    endDate: '',
  });

  useEffect(() => {
    (async () => {
      try {
        const [propPage, mgrs] = await Promise.all([
          propertyService.getProperties(0, 200),
          propertyService.getManagers().catch(() => [] as ManagerItem[]),
        ]);
        setProperties(propPage.content.filter((p) => p.status === 'ACTIVE'));
        setManagers(mgrs);
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

  // Khi đổi property: nạp phòng (nếu chia phòng) + gợi ý manager = operationManager của nhà.
  useEffect(() => {
    if (!selectedProperty) {
      setRooms([]);
      return;
    }
    setAssignManagerId(selectedProperty.operationManagerId ?? '');
    if (selectedProperty.wholeHouse === true) {
      setRooms([]);
      return;
    }
    setLoadingRooms(true);
    propertyService
      .getRooms(selectedProperty.id)
      .then((rs) => setRooms(rs.filter((r) => r.status === 'AVAILABLE')))
      .catch(() => setRooms([]))
      .finally(() => setLoadingRooms(false));
  }, [selectedProperty]);

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
        toast.success('Đã bóc tách thông tin từ file — vui lòng kiểm tra lại.');
      }
    } catch {
      toast.error('Không xử lý được file — kiểm tra lại định dạng (nên dùng DOCX/PDF số hoá).');
    } finally {
      setExtracting(false);
    }
  };

  const roleWarning = lookupChecked && !isTenantEligibleRole(lookupRole ?? undefined);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProperty) return toast.error('Vui lòng chọn bất động sản');
    if (!isWholeHouse && !form.roomId) return toast.error('Vui lòng chọn phòng');
    if (roleWarning) return toast.error('SĐT thuộc tài khoản nội bộ — không thể onboard làm khách.');

    const moveInDate = form.expectedReceptionDate || todayIso();
    const payload: OnboardTenantRequest = {
      fullName: form.fullName.trim(),
      cccd: form.cccd.trim(),
      phoneNumber: form.phoneNumber.trim(),
      moveInDate,
      rentAmount: Number(form.rentAmount),
      deposit: Number(form.deposit),
      depositMonths: Number(form.depositMonths) || 1,
      endDate: form.endDate || undefined,
      expectedReceptionDate: form.expectedReceptionDate || undefined,
      draftContractFileUrl: draftFileUrl || undefined,
    };

    setSubmitting(true);
    try {
      const draft = await tenantService.createDraft(
        selectedProperty.id,
        isWholeHouse ? null : Number(form.roomId),
        payload,
      );
      if (assignNow && assignManagerId) {
        await tenantService.assignManager(draft.id, {
          managerId: assignManagerId,
          expectedReceptionDate: form.expectedReceptionDate || undefined,
        });
      }
      toast.success(
        assignNow && assignManagerId
          ? 'Đã tạo hợp đồng nháp & gửi thông báo cho quản lý.'
          : 'Đã tạo hợp đồng nháp.',
      );
      onSuccess();
      onClose();
    } catch {
      /* interceptor đã toast */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative mx-4 max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Tạo hợp đồng nháp</h2>
            <p className="mt-0.5 text-xs text-slate-500">Đón khách v2 — nhập thông tin khách sau khi xem nhà</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {/* Tabs */}
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
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
          </div>

          {mode === 'upload' && (
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

          {/* Chọn BĐS + phòng */}
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
                  <p className="mt-1 text-xs text-rose-500">Nhà này không còn phòng trống.</p>
                )}
              </div>
            )}
          </div>

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

          {roleWarning && (
            <div className="flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              <ShieldAlert className="h-5 w-5 flex-shrink-0 text-rose-500" />
              <p>SĐT này đang là tài khoản nội bộ ({lookupRole}). Không thể onboard làm khách thuê.</p>
            </div>
          )}

          {/* Giá & cọc */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Giá thuê (đ/tháng) <span className="text-rose-500">*</span>
              </label>
              <input type="number" name="rentAmount" value={form.rentAmount} onChange={handleChange} className="input-field" min="0" required />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Tiền cọc (đ) <span className="text-rose-500">*</span>
              </label>
              <input type="number" name="deposit" value={form.deposit} onChange={handleChange} className="input-field" min="0" required />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Số tháng cọc</label>
              <select name="depositMonths" value={form.depositMonths} onChange={handleChange} className="input-field">
                <option value="1">1 tháng</option>
                <option value="2">2 tháng</option>
              </select>
            </div>
          </div>

          {/* Ngày */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Ngày dự kiến đón khách</label>
              <input type="date" name="expectedReceptionDate" value={form.expectedReceptionDate} onChange={handleChange} className="input-field" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Ngày kết thúc (tuỳ chọn)</label>
              <input type="date" name="endDate" value={form.endDate} onChange={handleChange} className="input-field" />
            </div>
          </div>

          {/* Gán quản lý */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={assignNow} onChange={(e) => setAssignNow(e.target.checked)} className="h-4 w-4 rounded" />
              Gán & gửi thông báo cho quản lý ngay
            </label>
            {assignNow && (
              <select
                value={assignManagerId}
                onChange={(e) => setAssignManagerId(e.target.value)}
                className="input-field mt-3"
              >
                <option value="">Chọn quản lý vận hành...</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName || m.username}
                    {selectedProperty?.operationManagerId === m.id ? ' (QL căn này)' : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">Hủy</button>
            <button type="submit" className="btn-primary" disabled={submitting || extracting}>
              {submitting ? 'Đang lưu...' : 'Lưu hợp đồng nháp'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
