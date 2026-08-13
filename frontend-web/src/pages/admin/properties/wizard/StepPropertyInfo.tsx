import { useState, useEffect, type ReactNode } from 'react';
import { Building, Package, FileText, Plus, Trash2, Check, Download, Save, AlertCircle, Lock } from 'lucide-react';
import type {
  PropertyResponse,
  ManifestItem,
  InboundContractRequest,
  InboundContractResponse,
  EquipmentCatalogItem
} from '@/types/api.types';
import { propertyService } from '@/services/property.service';
import { catalogService } from '@/services/catalog.service';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { serverNow } from '@/utils/serverTime';

// ─── Giới hạn lịch hợp đồng ───────────────────────────────────────────────
// Ngày bắt đầu: không được trước hôm nay. Ngày kết thúc: tối đa 50 năm kể từ
// ngày bắt đầu. Dùng cho thuộc tính min/max → khoá luôn trên date picker.
const fmtDateInput = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const TODAY_STR = fmtDateInput(serverNow());
const addYearsStr = (base: string, years: number) => {
  const d = base ? new Date(base) : serverNow();
  d.setFullYear(d.getFullYear() + years);
  return fmtDateInput(d);
};

interface StepPropertyInfoProps {
  property: PropertyResponse;
  onNext: () => void;
  nextLabel?: string;
  prefillContract?: Partial<InboundContractRequest>;
  /** Bật hộp thoại xác nhận lần 2 trước khi chạy onNext (dùng cho nút "Xác nhận & Quay về danh sách") */
  confirmBeforeNext?: boolean;
  confirmTitle?: string;
  confirmMessage?: ReactNode;
}

export const StepPropertyInfo = ({ property, onNext, nextLabel = 'Tiếp tục cấu hình →', prefillContract, confirmBeforeNext = false, confirmTitle, confirmMessage }: StepPropertyInfoProps) => {
  const [loading, setLoading] = useState(false);
  const [confirmNextOpen, setConfirmNextOpen] = useState(false);
  
  // Manifest State
  const [catalog, setCatalog] = useState<EquipmentCatalogItem[]>([]);
  const [manifestItems, setManifestItems] = useState<ManifestItem[]>([]);
  const [manifestSaved, setManifestSaved] = useState(false);
  const [isSavingManifest, setIsSavingManifest] = useState(false);
  // Autocomplete cho dòng thiết bị đang nhập (chỉ dòng cuối được sửa tên)
  const [manifestSearch, setManifestSearch] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);

  // Contract State
  const [contract, setContract] = useState<InboundContractResponse | null>(null);
  const [contractForm, setContractForm] = useState<InboundContractRequest>({
    contractCode: '', ownerName: '', totalRentAmount: 0, startDate: '', endDate: '', contractScanUrl: ''
  });
  const [isSavingContract, setIsSavingContract] = useState(false);
  const [rentAmountDisplay, setRentAmountDisplay] = useState('');

  // Khóa chỉnh sửa Hợp đồng + Thiết bị khi tòa nhà KHÔNG còn là nháp (DRAFT):
  // đã "Cấu hình khai thác" / đang "Chờ duyệt" (PENDING_HOST_REVIEW) / đang kinh doanh.
  // Chỉ khóa input (disabled) — không hiển thị badge/banner cảnh báo cho đỡ rối.
  const locked = property.status !== 'DRAFT';

  const formatVND = (value: number) =>
    value > 0 ? value.toLocaleString('vi-VN') : '';

  const parseVND = (str: string) =>
    Number(str.replace(/\./g, '').replace(/,/g, '')) || 0;

  // So khớp không phân biệt hoa thường & dấu tiếng Việt
  const normalizeText = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();

  // Load Data
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        const [catalogData, manifestData, contractData] = await Promise.allSettled([
          catalogService.getEquipmentCatalog(),
          propertyService.getManifest(property.id),
          propertyService.getInboundContract(property.id)
        ]);

        if (catalogData.status === 'fulfilled') setCatalog(catalogData.value);
        
        if (manifestData.status === 'fulfilled' && manifestData.value.length > 0) {
          setManifestItems(manifestData.value.map(m => ({
            catalogId: m.catalogId, quantity: m.quantity, status: m.status, source: (m as any).source ?? 'INITIAL_HANDOVER'
          })));
          setManifestSaved(true);
          // Dòng cuối là dòng đang sửa — đổ sẵn tên thiết bị vào ô autocomplete
          if (catalogData.status === 'fulfilled') {
            const last = manifestData.value[manifestData.value.length - 1];
            setManifestSearch(catalogData.value.find(c => c.id === last.catalogId)?.name || '');
          }
        } else {
          // Initialize empty if no manifest
          setManifestItems([{ catalogId: 0, quantity: 1, status: 'NEW', source: 'INITIAL_HANDOVER' }]);
        }

        if (contractData.status === 'fulfilled' && contractData.value) {
          setContract(contractData.value);
          setContractForm({
            contractCode: contractData.value.contractCode,
            ownerName: contractData.value.ownerName,
            totalRentAmount: contractData.value.totalRentAmount,
            startDate: contractData.value.startDate,
            endDate: contractData.value.endDate,
            contractScanUrl: contractData.value.contractScanUrl || ''
          });
          setRentAmountDisplay(formatVND(contractData.value.totalRentAmount));
        } else if (prefillContract) {
          setContractForm(prev => ({
            ...prev,
            ...prefillContract,
            startDate: prefillContract.startDate || prev.startDate || TODAY_STR,
          }));
          if (prefillContract.totalRentAmount) {
            setRentAmountDisplay(formatVND(prefillContract.totalRentAmount));
          }
        } else {
          // Chưa có hợp đồng → mặc định ngày bắt đầu là hôm nay
          setContractForm(prev => ({ ...prev, startDate: prev.startDate || TODAY_STR }));
        }
      } catch (error) {
        console.error('Failed to init step 1', error);
      } finally {
        setLoading(false);
      }
    };
    initData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property.id]);

  // Manifest Handlers
  // Xuống dòng mới: dòng hiện tại phải hợp lệ, các dòng trên sẽ tự khoá (chỉ dòng cuối được sửa tên)
  const lastManifestRow = manifestItems[manifestItems.length - 1];
  const canAddManifestRow = !lastManifestRow || (lastManifestRow.catalogId > 0 && lastManifestRow.quantity > 0);

  const handleAddManifestRow = () => {
    if (!canAddManifestRow) return;
    setManifestItems(prev => [...prev, { catalogId: 0, quantity: 1, status: 'NEW', source: 'INITIAL_HANDOVER' }]);
    setManifestSearch('');
    setManifestSaved(false);
  };

  const handleRemoveManifestRow = (index: number) => {
    const next = manifestItems.filter((_, i) => i !== index);
    setManifestItems(next);
    // Nếu dòng đang sửa thay đổi (xoá dòng cuối) → đổ tên thiết bị của dòng cuối mới vào ô autocomplete
    const newLast = next[next.length - 1];
    setManifestSearch(newLast ? (catalog.find(c => c.id === newLast.catalogId)?.name || '') : '');
    setManifestSaved(false);
  };

  const updateManifestRow = (index: number, field: keyof ManifestItem, value: any) => {
    const updated = [...manifestItems];
    updated[index] = { ...updated[index], [field]: value };
    setManifestItems(updated);
    setManifestSaved(false);
  };

  const saveManifest = async () => {
    if (locked) return; // chỉ sửa thiết bị khi tòa nhà còn là nháp (DRAFT)
    // Validate
    const validItems = manifestItems.filter(i => i.catalogId > 0 && i.quantity > 0);
    if (manifestItems.length > 0 && validItems.length !== manifestItems.length) {
      alert('Vui lòng điền đầy đủ thông tin thiết bị (chọn thiết bị và số lượng > 0)');
      return;
    }

    setIsSavingManifest(true);
    try {
      await propertyService.putManifest(property.id, { items: validItems });
      setManifestSaved(true);
      setManifestItems(validItems.length > 0 ? validItems : [{ catalogId: 0, quantity: 1, status: 'NEW', source: 'INITIAL_HANDOVER' }]);
    } catch (err: any) {
      const d = err.response?.data;
      alert(d?.error || d?.message || d?.fieldErrors
        ? JSON.stringify(d.fieldErrors)
        : 'Lỗi lưu manifest');
    } finally {
      setIsSavingManifest(false);
    }
  };


  const saveContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return; // chỉ sửa hợp đồng khi tòa nhà còn là nháp (DRAFT)
    setIsSavingContract(true);
    try {
      const res = await propertyService.createInboundContract(property.id, contractForm);
      setContract(res);
    } catch (err) {
      alert('Lỗi lưu hợp đồng');
    } finally {
      setIsSavingContract(false);
    }
  };

  const isFormComplete = manifestSaved && contract !== null;

  if (loading) return <div className="py-20 text-center text-slate-500">Đang tải dữ liệu...</div>;

  return (
    <div className="space-y-8 pb-12">
      {/* 1A: Tóm tắt thông tin */}
      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 flex items-center gap-2">
          <Building className="h-5 w-5 text-indigo-500" />
          <h3 className="font-bold text-slate-800">Thông tin cơ bản</h3>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="col-span-2">
            <p className="text-slate-500 mb-1">Tên Tòa nhà</p>
            <p className="font-bold text-slate-900">{property.propertyName}</p>
          </div>
          <div className="col-span-2">
            <p className="text-slate-500 mb-1">Địa chỉ</p>
            <p className="font-bold text-slate-900 line-clamp-1">{property.fullAddress || property.shortAddress}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Khu vực</p>
            <p className="font-bold text-slate-900">{property.zoneName}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Diện tích</p>
            <p className="font-bold text-slate-900">{property.areaSize || 0} m²</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Số tầng</p>
            <p className="font-bold text-slate-900">{property.totalFloor ?? property.floorCount ?? 0}</p>
          </div>
          <div>
            <p className="text-slate-500 mb-1">Tổng phòng</p>
            <p className="font-bold text-slate-900">{property.totalRooms}</p>
          </div>
        </div>
      </section>

      {/* 1B: Hợp đồng */}
      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-500" />
            <h3 className="font-bold text-slate-800">Hợp đồng với chủ nhà</h3>
            {contract && <Check className="h-4 w-4 text-emerald-500 ml-2" />}
          </div>
        </div>
        <form onSubmit={saveContract} className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
            <label className="block">
              <span className="mb-1 text-sm font-bold text-slate-700">Mã hợp đồng *</span>
              <input required disabled={locked} value={contractForm.contractCode} onChange={e => setContractForm({...contractForm, contractCode: e.target.value})} className="input-field disabled:opacity-60 disabled:cursor-not-allowed" placeholder="VD: HD-001" />
            </label>
            <label className="block">
              <span className="mb-1 text-sm font-bold text-slate-700">Tên Chủ nhà *</span>
              <input required disabled={locked} value={contractForm.ownerName} onChange={e => setContractForm({...contractForm, ownerName: e.target.value})} className="input-field disabled:opacity-60 disabled:cursor-not-allowed" placeholder="Nguyễn Văn A" />
            </label>
            <label className="block">
              <span className="mb-1 text-sm font-bold text-slate-700">Tổng tiền thuê *</span>
              <div className="relative">
                <input
                  type="text"
                  required
                  disabled={locked}
                  value={rentAmountDisplay}
                  onChange={e => {
                    const raw = e.target.value.replace(/\./g, '').replace(/,/g, '');
                    if (!/^\d*$/.test(raw)) return;
                    setRentAmountDisplay(raw ? Number(raw).toLocaleString('vi-VN') : '');
                    setContractForm(prev => ({ ...prev, totalRentAmount: parseVND(raw) }));
                  }}
                  className="input-field pr-8 text-right disabled:opacity-60 disabled:cursor-not-allowed"
                  placeholder="VD: 15.000.000"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium pointer-events-none">đ</span>
              </div>
            </label>
            <label className="block">
              <span className="mb-1 text-sm font-bold text-slate-700 block">Ngày bắt đầu *</span>
              <input
                type="date"
                required
                disabled={locked}
                min={TODAY_STR}
                value={contractForm.startDate}
                onChange={e => {
                  const startDate = e.target.value;
                  setContractForm(prev => ({
                    ...prev,
                    startDate,
                    // Nếu ngày kết thúc đã vượt giới hạn 50 năm theo ngày bắt đầu mới → cắt lại
                    endDate: prev.endDate && startDate && prev.endDate > addYearsStr(startDate, 50)
                      ? addYearsStr(startDate, 50) : prev.endDate,
                  }));
                }}
                className="input-field disabled:opacity-60 disabled:cursor-not-allowed"
              />
            </label>
            <label className="block">
              <span className="mb-1 text-sm font-bold text-slate-700 block">Ngày kết thúc *</span>
              <input
                type="date"
                required
                min={contractForm.startDate || TODAY_STR}
                max={addYearsStr(contractForm.startDate || TODAY_STR, 50)}
                disabled={locked || !contractForm.startDate}
                value={contractForm.endDate}
                onChange={e => setContractForm({ ...contractForm, endDate: e.target.value })}
                className="input-field disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </label>
            {contractForm.contractScanUrl && (
              <div className="block col-span-2 md:col-span-1">
                <span className="mb-1 text-sm font-bold text-slate-700">File Hợp đồng</span>
                <a href={contractForm.contractScanUrl} download target="_blank" rel="noreferrer"
                  className="mt-1 flex items-center gap-2 text-xs text-indigo-600 hover:underline truncate">
                  <Download className="w-3.5 h-3.5 shrink-0" /> Tải xuống hợp đồng
                </a>
              </div>
            )}
          </div>
          {!locked && (
            <div className="flex justify-end">
              <button type="submit" disabled={isSavingContract} className="btn-primary py-2 px-6 rounded-xl flex items-center gap-2">
                {isSavingContract ? 'Đang lưu...' : <><Save className="w-4 h-4" /> {contract ? 'Cập nhật Hợp đồng' : 'Lưu Hợp đồng'}</>}
              </button>
            </div>
          )}
        </form>
      </section>

      {/* 1C: Manifest */}
      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-indigo-500" />
            <h3 className="font-bold text-slate-800">Khai báo trang thiết bị có sẵn</h3>
            {manifestSaved && <Check className="h-4 w-4 text-emerald-500 ml-2" />}
          </div>
          {!locked && (
            <button onClick={saveManifest} disabled={isSavingManifest} className="btn-primary py-1.5 px-4 text-sm rounded-lg flex items-center gap-2">
              {isSavingManifest ? 'Đang lưu...' : <><Save className="w-4 h-4" /> Lưu Thiết bị</>}
            </button>
          )}
        </div>
        <div className="p-5">
          {/* Header */}
          <div className="grid grid-cols-[1fr_96px_128px_48px] gap-2 pb-2 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            <span>Tên Thiết bị</span>
            <span className="text-right">Số lượng</span>
            <span>Tình trạng</span>
            <span className="text-center">Xóa</span>
          </div>

          {/* Rows */}
          <div className="space-y-2 mt-2">
            {manifestItems.map((item, idx) => {
              // Khoá toàn bộ khi tòa nhà đã rời nháp; nếu còn nháp thì chỉ khoá tên các dòng cũ (dòng cuối mới sửa được).
              const isLocked = locked || idx < manifestItems.length - 1;
              const suggestions = catalog.filter(c => normalizeText(c.name).includes(normalizeText(manifestSearch)));
              return (
                <div key={idx} className="grid grid-cols-[1fr_96px_128px_48px] gap-2 items-center border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                  {/* Tên thiết bị */}
                  <div className="relative">
                    {isLocked ? (
                      <span className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg">
                        <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                        {catalog.find(c => c.id === item.catalogId)?.name || '—'}
                      </span>
                    ) : (
                      <>
                        <input
                          value={manifestSearch}
                          onChange={e => {
                            setManifestSearch(e.target.value);
                            setShowSuggest(true);
                            if (item.catalogId !== 0) updateManifestRow(idx, 'catalogId', 0);
                          }}
                          onFocus={() => setShowSuggest(true)}
                          onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                          placeholder="Gõ tên thiết bị để tìm..."
                          className={`input-field py-1.5 text-sm ${item.catalogId > 0 ? 'border-emerald-400' : ''}`}
                        />
                        {showSuggest && (
                          <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-52 overflow-y-auto">
                            {suggestions.length === 0 ? (
                              <p className="px-3 py-2 text-xs text-slate-400">Không tìm thấy thiết bị phù hợp</p>
                            ) : suggestions.map(c => (
                              <button
                                key={c.id}
                                type="button"
                                onMouseDown={() => {
                                  updateManifestRow(idx, 'catalogId', c.id);
                                  setManifestSearch(c.name);
                                  setShowSuggest(false);
                                }}
                                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 font-medium"
                              >
                                {c.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Số lượng */}
                  {locked ? (
                    <span className="px-3 py-1.5 text-sm text-right text-slate-600">{item.quantity}</span>
                  ) : (
                    <input
                      type="number" min={1} value={item.quantity}
                      onChange={e => updateManifestRow(idx, 'quantity', Number(e.target.value))}
                      className="input-field py-1.5 text-sm text-right"
                    />
                  )}

                  {/* Tình trạng */}
                  {isLocked ? (
                    <span className="px-3 py-1.5 text-sm text-slate-500">
                      {item.status === 'NEW' ? 'Mới 100%' : 'Đang dùng tốt'}
                    </span>
                  ) : (
                    <select value={item.status} onChange={e => updateManifestRow(idx, 'status', e.target.value)} className="input-field py-1.5 text-sm">
                      <option value="NEW">Mới 100%</option>
                      <option value="GOOD">Đang dùng tốt</option>
                    </select>
                  )}

                  {/* Xóa */}
                  <div className="flex justify-center">
                    {!locked && (
                      <button onClick={() => handleRemoveManifestRow(idx)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-md">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {!locked && (
            <button
              onClick={handleAddManifestRow}
              disabled={!canAddManifestRow}
              className="mt-3 flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
              title={canAddManifestRow ? '' : 'Hoàn thành dòng hiện tại trước (chọn thiết bị và số lượng > 0)'}
            >
              <Plus className="w-4 h-4" /> Thêm thiết bị
            </button>
          )}
        </div>
      </section>

      {/* Navigation */}
      <div className="mt-8 flex justify-end pt-4 border-t border-slate-200">
        {!isFormComplete && !locked && (
          <p className="text-sm font-semibold text-amber-600 flex items-center gap-1 mr-4">
            <AlertCircle className="w-4 h-4" /> Vui lòng Lưu Thiết bị và Lưu Hợp đồng trước khi tiếp tục
          </p>
        )}
        <button
          onClick={() => (locked ? onNext() : confirmBeforeNext ? setConfirmNextOpen(true) : onNext())}
          disabled={!locked && !isFormComplete}
          className="btn-primary rounded-xl px-8 py-3 text-sm font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {locked ? 'Quay về danh sách' : nextLabel}
        </button>
      </div>

      <ConfirmDialog
        open={confirmNextOpen}
        tone="primary"
        title={confirmTitle ?? 'Xác nhận hoàn tất khởi tạo?'}
        message={confirmMessage ?? (
          <>
            Bạn chắc chắn đã nhập đúng và đầy đủ <b className="text-slate-700">hợp đồng</b> và{' '}
            <b className="text-slate-700">thiết bị</b> cho tòa nhà{' '}
            <b className="text-slate-700">{property.propertyName}</b>? Sau khi xác nhận, tòa nhà sẽ
            được đánh dấu <b className="text-slate-700">Đã khởi tạo</b> và quay về danh sách.
          </>
        )}
        confirmText="Xác nhận"
        onConfirm={() => { setConfirmNextOpen(false); onNext(); }}
        onCancel={() => setConfirmNextOpen(false)}
      />
    </div>
  );
};
