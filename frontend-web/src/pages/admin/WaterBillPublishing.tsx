import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Droplets, FileArchive, FileUp, Loader2, RefreshCw, Search, Send, Trash2 } from 'lucide-react';
import {
  waterBillService, waterUnitPrice, type WaterBill,
} from '@/services/waterBill.service';
import { uploadToCloudinary } from '@/services/upload.service';
import { propertyService } from '@/services/property.service';
import { utilityInvoiceService } from '@/services/utilityInvoice.service';
import {
  loadUtilityCycle, continuityGap, firstPeriodNote, type UtilityCycle,
} from '@/services/utilityCycle';
import type { PropertyResponse } from '@/types/api.types';
import { monthPeriod, onlyDigits, periodProblem, arrearsPeriod } from '@/utils/evnInvoiceParser';
import { SectionShell, StatusPill, EmptyState, formatVnd } from './shared';
import { PropertyCombobox, ReadingProgress } from './EvnBillPublishing';
import { parseWaterInvoice } from '@/utils/waterInvoiceParser';
import { matchBillToProperty } from '@/utils/billPropertyMatch';
import { UtilityBillZipImport } from './UtilityBillZipImport';
import { useOccupiedProperties } from '@/services/useOccupiedProperties';
import { groupThousands } from '@/utils';import { normalizeVi } from '@/utils/helpers';
import { serverNow } from '@/utils/serverTime';

/**
 * PHÁT HÀNH HOÁ ĐƠN NƯỚC (admin) — song sinh với `EvnBillPublishing`.
 *
 * Cùng mô hình đã áp cho điện 13/08/2026: admin chốt hoá đơn của cả nhà, hệ thống suy
 * đơn giá m³, manager chỉ ĐỌC rồi ghi chỉ số từng phòng. Trước đó manager tự khai đơn giá
 * nước ngay trong app — không ai kiểm được.
 *
 * ⚠️ BE CHƯA CÓ ENDPOINT (14/08/2026) — xem doc/BE-NEED-water-bill-admin-2026-08-14.md.
 * Trang dựng sẵn theo contract đã chốt trong doc; BE ship là chạy, không phải sửa FE.
 * Trong lúc chờ, mọi lời gọi sẽ 404 và trang hiện đúng thông báo lỗi chứ không vỡ.
 *
 * Cố ý KHÔNG clone nguyên 1148 dòng của trang EVN: trang này giữ đúng luồng chính
 * (chọn nhà → nhập tổng m³/tổng tiền → kỳ → ảnh → phát hành → danh sách đã phát hành).
 * Việc gộp hai trang thành một component dùng chung nên làm khi cả hai đã chạy thật —
 * gộp lúc một bên còn chưa có API là tối ưu hoá dựa trên phỏng đoán.
 */

interface BillForm {
  totalQuantity: string;
  totalAmount: string;
  billingPeriod: string;
  /**
   * Chỉ số đồng hồ CŨ / MỚI in trên giấy nước. Chỉ bắt buộc với NHÀ NGUYÊN CĂN vì
   * loại đó phát hành thẳng cho khách (BE chặn: consumption = newReading − prevReading).
   * Nhà chia phòng bỏ trống — quản lý đọc đồng hồ từng phòng.
   */
  prevReading: string;
  newReading: string;
  /**
   * Chỉ số cũ IN TRÊN GIẤY, giữ RIÊNG với `prevReading` — xem chú thích cùng tên ở
   * `EvnBillPublishing`. Từ kỳ 2, `prevReading` khoá theo sổ nên không giữ lại số của giấy
   * thì hai con số đáng lẽ phải bằng nhau không bao giờ được đem ra so.
   */
  paperPrev: string;
  /** Số danh bộ trên tờ giấy — OCR điền sẵn, admin soát lại rồi mới gửi. */
  customerCode: string;
}
const EMPTY_FORM: BillForm = {
  totalQuantity: '', totalAmount: '', billingPeriod: '', prevReading: '', newReading: '',
  paperPrev: '', customerCode: '',
};

export const WaterBillPublishing = () => {
  const now = serverNow();
  // Điện/nước TRẢ SAU: mở màn giữa tháng 9 thì kỳ đang làm là tháng 8 — xem `arrearsPeriod`.
  const [month, setMonth] = useState(() => arrearsPeriod(now).month);
  const [year, setYear] = useState(() => arrearsPeriod(now).year);

  const [properties, setProperties] = useState<PropertyResponse[]>([]);
  const [loadingProps, setLoadingProps] = useState(true);
  const [propertyId, setPropertyId] = useState<number | null>(null);

  const [bills, setBills] = useState<WaterBill[]>([]);
  /** Mở hộp nhập lô từ file .zip. */
  const [zipOpen, setZipOpen] = useState(false);
  const [loadingBills, setLoadingBills] = useState(false);
  const [billsError, setBillsError] = useState<string | null>(null);

  const [form, setForm] = useState<BillForm>(EMPTY_FORM);
  const [imageUrl, setImageUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  /** Lần phát hành vừa rồi có gửi thẳng cho khách thuê không (chỉ nguyên căn). */
  const [issuedToTenant, setIssuedToTenant] = useState(false);
  /** Câu nhắc sau khi đọc ảnh — OCR chỉ là gợi ý, admin vẫn phải soát. */
  const [scanNote, setScanNote] = useState<string | null>(null);
  /** Ảnh đang xem phóng to. Hoá đơn nước chữ nhỏ, xem ở khung thumbnail không đọc nổi số. */
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  /**
   * Lọc bảng "Đã phát hành" — song sinh với trang điện, sửa thì sửa cả hai.
   *
   * Một kỳ có thể hàng chục nhà; không có ô tìm thì admin phải cuộn tay dò từng dòng để
   * kiểm xem một căn đã phát hành chưa. Tìm được cả theo TÊN NHÀ lẫn CHUỖI KỲ, vì kỳ là
   * thứ in trên tờ hoá đơn giấy nên hay được hỏi theo.
   */
  const [billSearch, setBillSearch] = useState('');
  const [billStatus, setBillStatus] = useState<'all' | 'published' | 'revoked'>('all');

  const visibleBills = useMemo(() => {
    const q = normalizeVi(billSearch.trim());
    return bills
      .filter((b) => {
        if (billStatus === 'published' && b.status === 'REVOKED') return false;
        if (billStatus === 'revoked' && b.status !== 'REVOKED') return false;
        if (!q) return true;
        return normalizeVi(`${b.propertyName ?? ''} ${b.billingPeriod ?? ''}`).includes(q);
      })
      // Mới phát hành lên đầu — admin vừa bấm gửi xong không phải đi tìm dòng của mình.
      // Thiếu `createdAt` thì đẩy xuống cuối chứ không cho lên đầu nhầm.
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  }, [bills, billSearch, billStatus]);

  /**
   * Ô chọn nhà CHỈ hiện căn đang có khách ở.
   *
   * Hoá đơn điện/nước chỉ có nghĩa với căn có người ở; đổ ra cả nhà chưa ai thuê thì
   * admin phải tự nhớ căn nào đang có khách, chọn nhầm là phát hành một hoá đơn không
   * gửi cho ai. Xem `useOccupiedProperties` để biết vì sao phải hỏi `handover-status`
   * chứ không dùng được field nào trong danh sách nhà.
   *
   * CHỈ lọc ô chọn, KHÔNG lọc `properties` gốc: bảng "đã phát hành" bên dưới vẫn phải
   * tra được hoá đơn cũ của căn mà khách đã trả phòng.
   */
  const { occupiedIds } = useOccupiedProperties();
  const occupiedProperties = useMemo(
    () => (occupiedIds ? properties.filter((p) => occupiedIds.has(p.id)) : properties),
    [properties, occupiedIds],
  );
  const hiddenEmptyCount = properties.length - occupiedProperties.length;

  /**
   * Chữ OCR của ảnh, giữ lại để đối chiếu với căn nhà đang chọn — xem chú thích cùng
   * tên bên `EvnBillPublishing`. Phải là state vì admin đổi ô chọn nhà lúc nào cũng
   * được, kể cả sau khi đã tải ảnh; đó chính là cái nhầm cần bắt.
   */
  const [ocrRawText, setOcrRawText] = useState('');
  /** Số danh bộ đọc được từ ảnh — xem chú thích ở nơi hiển thị. */
  const [ocrCustomerCode, setOcrCustomerCode] = useState('');

  const selectedMonthPeriod = useMemo(
    () => monthPeriod(0, new Date(year, month - 1, 1)),
    [month, year],
  );
  const prevMonthPeriod = useMemo(
    () => monthPeriod(-1, new Date(year, month - 1, 1)),
    [month, year],
  );

  useEffect(() => {
    setForm((f) => (f.billingPeriod ? f : { ...f, billingPeriod: selectedMonthPeriod }));
  }, [selectedMonthPeriod]);

  const loadProperties = useCallback(async () => {
    setLoadingProps(true);
    try {
      const page = await propertyService.getAllProperties();
      setProperties(page ?? []);
    } catch {
      setProperties([]);
    } finally {
      setLoadingProps(false);
    }
  }, []);

  const loadBills = useCallback(async () => {
    setLoadingBills(true);
    setBillsError(null);
    try {
      setBills(await waterBillService.list({ month, year }));
    } catch (e: any) {
      // BE chưa có endpoint thì rơi vào đây — nói thẳng chứ đừng hiện "chưa có hoá đơn
      // nào", admin sẽ tưởng dữ liệu trống trong khi thực ra chưa gọi được API.
      setBillsError(e?.response?.data?.message || e?.message || 'Không tải được danh sách hoá đơn nước.');
      setBills([]);
    } finally {
      setLoadingBills(false);
    }
  }, [month, year]);

  useEffect(() => { loadProperties(); }, [loadProperties]);
  useEffect(() => { loadBills(); }, [loadBills]);

  const quantity = Number(onlyDigits(form.totalQuantity) || 0);
  const amount = Number(onlyDigits(form.totalAmount) || 0);
  /** Đơn giá CHƯA làm tròn — xem chú thích ở waterUnitPrice. Chỉ làm tròn khi in ra. */
  const unitPrice = waterUnitPrice(amount, quantity);

  /** Nhà đã có hoá đơn nước kỳ này — combobox gắn nhãn để admin khỏi chọn trùng. */
  const publishedIds = useMemo(
    () => new Set(bills.filter((b) => b.status !== 'REVOKED').map((b) => b.propertyId)),
    [bills],
  );

  const existingBill = useMemo(
    () => bills.find((b) => b.propertyId === propertyId && b.status !== 'REVOKED'),
    [bills, propertyId],
  );

  /**
   * Nguyên căn đi luồng KHÁC: phát hành thẳng cho khách thuê, quản lý chỉ nhận thông báo.
   * Xem services/utilityInvoice.service.ts.
   */
  const selectedProperty = properties.find((p) => p.id === propertyId);
  const isWholeHouse = selectedProperty?.wholeHouse === true;

  /** Ảnh hoá đơn có phải của căn nhà đang chọn không — xem @/utils/billPropertyMatch. */
  const billMatch = useMemo(
    () => matchBillToProperty(
      ocrRawText,
      selectedProperty?.fullAddress || selectedProperty?.shortAddress,
    ),
    [ocrRawText, selectedProperty],
  );
  const prevReadingNum = Number(onlyDigits(form.prevReading) || 0);
  const newReadingNum = Number(onlyDigits(form.newReading) || 0);
  /** Hiệu hai chỉ số phải bằng tổng m³ — kiểm ở FE để không nhận 422 sau khi đã tạo tổng. */
  const readingMismatch = isWholeHouse
    && !!form.prevReading && !!form.newReading
    && newReadingNum - prevReadingNum !== quantity;

  const periodIssue = periodProblem(form.billingPeriod);

  /** Chỉ số mới tự tính = chỉ số cũ + lượng tiêu thụ trên giấy. `null` = chưa đủ dữ kiện. */
  const autoNewReading = isWholeHouse && prevReadingNum > 0 && quantity > 0
    ? prevReadingNum + quantity
    : null;

  /**
   * Bối cảnh chỉ số của căn đang chọn — kỳ đầu hay kỳ tiếp. Xem khối cùng tên ở
   * `EvnBillPublishing` để biết đầy đủ lý do; nước đi đúng luồng đó, chỉ khác đơn vị.
   */
  const [cycle, setCycle] = useState<UtilityCycle | null>(null);
  const [loadingPrev, setLoadingPrev] = useState(false);
  const prevLocked = isWholeHouse && !!cycle?.prevClose;

  useEffect(() => {
    if (!propertyId || !isWholeHouse) {
      setCycle(null);
      return;
    }
    let alive = true;
    setLoadingPrev(true);
    loadUtilityCycle(propertyId, 'WATER', month, year)
      .then((c) => {
        if (!alive) return;
        setCycle(c);
        if (c.prevClose) setForm((f) => ({ ...f, prevReading: String(c.prevClose!.reading) }));
      })
      .catch(() => { if (alive) setCycle(null); })
      .finally(() => { if (alive) setLoadingPrev(false); });
    return () => { alive = false; };
  }, [propertyId, isWholeHouse, month, year]);

  /** Kỳ trước chốt ở đâu, giấy kỳ này bắt đầu từ đâu — xem `continuityGap`. */
  const paperPrevNum = form.paperPrev === '' ? null : Number(onlyDigits(form.paperPrev));
  const readingGap = continuityGap(cycle, paperPrevNum);
  const needsPaperPrev = isWholeHouse && !!cycle?.prevClose;
  const continuityBlocked = needsPaperPrev && (paperPrevNum == null || !!readingGap);
  /** Đối chiếu đầu kỳ trên giấy với mốc đón khách — chỉ có nghĩa ở kỳ đầu. */
  const firstNote = firstPeriodNote(cycle, prevReadingNum > 0 ? prevReadingNum : null, quantity);

  // Đặt SAU khối chỉ số: `continuityBlocked` phải khai báo xong mới đọc được (TDZ).
  const formReady = !!propertyId && quantity > 0 && amount > 0
    && !periodIssue && !existingBill && !continuityBlocked && firstNote?.kind !== 'bad-prev'
    && (!isWholeHouse || (!!form.prevReading && !!form.newReading && !readingMismatch));

  /**
   * Chỉ số mới là số DẪN XUẤT: cũ + tổng m³. Tính lại mỗi lần một trong hai đầu vào đổi.
   * Bản trước chỉ điền khi ô còn trống, nên OCR điền sẵn xong là sửa tổng m³ không ăn thua
   * — xem chú thích đầy đủ ở effect cùng tên trong `EvnBillPublishing`.
   */
  useEffect(() => {
    if (autoNewReading == null) return;
    const next = String(autoNewReading);
    setForm((f) => (f.newReading === next ? f : { ...f, newReading: next }));
  }, [autoNewReading]);

  /**
   * Upload ảnh rồi ĐỌC THỬ để điền sẵn 3 ô. Chỉ điền vào ô còn TRỐNG — admin đã gõ tay
   * thì OCR không được đè lên, mất số vừa gõ vì một lần đổi ảnh là lỗi khó chịu.
   */
  const pickImage = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    setScanNote(null);
    try {
      const url = await uploadToCloudinary(file);
      setImageUrl(url);
      try {
        const ocr = await waterBillService.ocr(url);
        setOcrRawText(ocr?.rawText ?? '');
        const parsed = parseWaterInvoice(ocr);
        // Tin mã của MÁY CHỦ trước parser của app — nó cũng là bên sẽ đối chiếu.
        const code = (ocr as { customerCode?: string })?.customerCode || parsed.customerCode || '';
        setOcrCustomerCode(code);
        setForm((f) => ({
          ...f,
          totalQuantity: f.totalQuantity || (parsed.totalQuantity != null ? String(parsed.totalQuantity) : ''),
          totalAmount: f.totalAmount || (parsed.totalAmount != null ? String(parsed.totalAmount) : ''),
          billingPeriod: parsed.billingPeriod || f.billingPeriod,
          // Chỉ số đồng hồ đọc từ bộ ba tự khớp phép trừ — chỉ điền ô còn trống.
          prevReading: f.prevReading || (parsed.prevReading != null ? String(parsed.prevReading) : ''),
          newReading: f.newReading || (parsed.newReading != null ? String(parsed.newReading) : ''),
          // Quét ảnh MỚI thì mã cũ hết nghĩa — ô này đè, khác các ô số ở trên.
          customerCode: code || f.customerCode,
        }));
        // Liệt kê đúng số đọc được, thay câu chung chung — admin liếc một cái là so xong
        // với tờ giấy, khỏi phải dò ngược từng ô.
        const vn = (n: number) => n.toLocaleString('vi-VN');
        const readParts = [
          parsed.newReading != null && `chỉ số mới ${vn(parsed.newReading)}`,
          parsed.prevReading != null && `chỉ số cũ ${vn(parsed.prevReading)}`,
          parsed.totalQuantity != null && `${vn(parsed.totalQuantity)} m³`,
          parsed.totalAmount != null && `${vn(parsed.totalAmount)}đ`,
          parsed.billingPeriod && `kỳ ${parsed.billingPeriod}`,
          parsed.customerCode && `danh bộ ${parsed.customerCode}`,
        ].filter(Boolean);
        setScanNote(readParts.length
          ? `Đọc được: ${readParts.join(' · ')}. Đối chiếu lại với ảnh trước khi phát hành.`
          : 'Không đọc được số từ ảnh — nhập tay giúp mình.');
      } catch {
        // OCR hỏng không được làm hỏng luôn việc đính ảnh: ảnh đã lên rồi, admin gõ tay.
        // Nhưng phải xoá rawText cũ, kẻo đem chữ của ẢNH TRƯỚC ra kết luận cho ảnh này.
        setOcrRawText('');
        setOcrCustomerCode('');
        setScanNote('Không đọc được ảnh — nhập tay giúp mình.');
      }
    } catch (e: any) {
      setPublishError(e?.message || 'Không tải được ảnh lên.');
    } finally {
      setUploading(false);
    }
  };

  const publish = async () => {
    if (!formReady || !propertyId) return;
    setPublishing(true);
    setPublishError(null);
    setIssuedToTenant(false);
    const period = form.billingPeriod.trim();
    try {
      const created = await waterBillService.create({
        propertyId,
        billingPeriod: period,
        month, year,
        totalQuantity: quantity,
        totalAmount: amount,
        imageUrl: imageUrl || undefined,
        // Nguyên căn: BE (bản 2 luồng) dùng luôn 2 số này để TỰ phát hành hoá đơn cho
        // khách trong cùng transaction. BE cũ bỏ qua field lạ nên gửi kèm là an toàn.
        prevReading: isWholeHouse ? prevReadingNum : undefined,
        newReading: isWholeHouse ? newReadingNum : undefined,
        // Bắt buộc gửi — máy chủ CHẶN khi lệch mã đã lưu của căn nhà. Xem chú thích cùng
        // tên bên EvnBillPublishing.
        customerCode: form.customerCode.trim() || undefined,
        ocrConfirmed: true,
      });

      /**
       * NGUYÊN CĂN — phát hành thẳng cho khách. Giấy nước của căn nhà đã đủ chỉ số cũ /
       * mới / tổng tiền của đúng khách đó, không phải chia cho ai nên không cần quản lý
       * đi đọc đồng hồ.
       *
       * ⚠️ Hai bước không nguyên tử — nếu bước dưới lỗi thì tổng đã tạo mà khách chưa
       * nhận. Báo lỗi rõ để admin đừng phát hành lại. Sửa gốc ở BE: xem
       * doc/BE-NEED-nguyen-can-tu-phat-hanh-hoa-don-tien-ich.
       */
      if (isWholeHouse) {
        try {
          await utilityInvoiceService.createForWholeHouse(propertyId, {
            type: 'WATER',
            billingPeriod: period,
            prevReading: prevReadingNum,
            newReading: newReadingNum,
            consumption: quantity,
            // Lấy đơn giá BE trả về nếu có: BE tính ở scale 8, FE tự chia sẽ lệch
            // và rơi vào AMOUNT_MISMATCH.
            unitPrice: created?.unitPrice ?? unitPrice,
            amount,
            meterImageUrl: imageUrl || undefined,
          });
          setIssuedToTenant(true);
        } catch (e: any) {
          /**
           * `INVOICE_ALREADY_EXISTS` KHÔNG phải lỗi: BE (bản 2 luồng) đã tự phát hành hoá
           * đơn cho khách khi tạo hoá đơn tổng, nên lệnh gọi này thành dư. Khách đã có
           * hoá đơn → coi như thành công.
           *
           * Vẫn giữ lệnh gọi vì BE/FE không deploy cùng lúc: bỏ hẳn bây giờ mà BE chưa lên
           * thì nguyên căn tạo hoá đơn tổng rồi im lặng KHÔNG gửi cho khách. XOÁ khối này
           * khi bản BE mới đã chạy ở mọi môi trường (BE yêu cầu 17/08/2026).
           */
          const code = e?.response?.data?.code;
          const msg = e?.response?.data?.message || e?.message || '';
          if (code === 'INVOICE_ALREADY_EXISTS' || /da ton tai|đã tồn tại/i.test(msg)) {
            setIssuedToTenant(true);
          } else {
            setPublishError(
              'Đã tạo hoá đơn tổng nhưng CHƯA gửi được cho khách thuê: '
              + (msg || 'lỗi không rõ')
              + '. Đừng phát hành lại — vào mục đã phát hành để gửi lại cho khách.',
            );
          }
        }
      }

      setForm({ ...EMPTY_FORM, billingPeriod: selectedMonthPeriod });
      setImageUrl('');
      setOcrRawText('');
      setOcrCustomerCode('');
      setPropertyId(null);
      await loadBills();
    } catch (e: any) {
      // Hai lỗi mã khách hàng — nói thẳng cách gỡ, và KHÔNG xoá form: máy chủ chỉ định
      // "sửa mã rồi gửi lại, không cần quét lại ảnh". Xem bản đầy đủ ở EvnBillPublishing.
      const code = e?.response?.data?.code;
      const expected = e?.response?.data?.details?.expectedCustomerCode;
      if (code === 'CUSTOMER_CODE_MISMATCH') {
        // In hai mã theo cùng một dạng thì mới thấy khác nhau ở đâu — xem chú thích đầy
        // đủ ở EvnBillPublishing.
        const norm = (s?: string) => (s ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        setPublishError(
          `Số danh bộ không khớp. Trên giấy đọc được "${norm(form.customerCode)}", `
          + `còn số đã lưu của căn nhà này là "${norm(expected) || '—'}".\n\n`
          + 'Sửa ô số danh bộ ở trên rồi bấm lại, không cần quét lại ảnh. '
          + 'Nếu số trên giấy đúng thì kiểm lại xem có đang chọn nhầm căn nhà không.',
        );
      } else if (code === 'CUSTOMER_CODE_REQUIRED') {
        setPublishError(
          'Căn nhà này đã khai số danh bộ, nên phải điền số trên tờ giấy để đối chiếu. '
          + 'Nhập vào ô "Số danh bộ trên giấy" ở trên rồi bấm lại.',
        );
      } else {
        setPublishError(e?.response?.data?.message || e?.message || 'Không phát hành được hoá đơn nước.');
      }
    } finally {
      setPublishing(false);
    }
  };

  const revoke = async (id: number) => {
    try {
      await waterBillService.revoke(id);
      await loadBills();
    } catch (e: any) {
      setBillsError(e?.response?.data?.message || e?.message || 'Không thu hồi được hoá đơn.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Lightbox — bấm bất kỳ đâu hoặc Esc để đóng. */}
      {!!zoomImage && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setZoomImage(null)}
          onKeyDown={(e) => { if (e.key === "Escape" || e.key === "Enter") setZoomImage(null); }}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-6"
        >
          <img src={zoomImage} alt="Hoá đơn nước" className="max-h-full max-w-full object-contain" />
        </div>
      )}
      <SectionShell
        icon={Droplets}
        title="Phát hành hoá đơn nước"
        subtitle="Admin chốt hoá đơn nước của từng nhà, hệ thống tính đơn giá rồi đẩy xuống cho quản lý."
        action={(
          <div className="flex items-center gap-2">
            {/* Nhập lô — một .zip cho cả danh mục, thay vì lặp 5 thao tác × N nhà. */}
            <button
              type="button"
              onClick={() => setZipOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white transition hover:bg-indigo-700"
            >
              <FileArchive className="h-4 w-4" /> Nhập từ .zip
            </button>
            {/* Nhãn này KHÔNG thừa: hai ô chọn dưới đây là kỳ TIÊU THỤ, không phải tháng
                đang phát hành — điện/nước trả sau nên hai thứ đó lệch nhau một tháng. */}
            <span
              className="text-[11px] font-black uppercase tracking-wider text-slate-400"
              title="Điện/nước trả sau: giữa tháng 9 thì hoá đơn đang phát hành là của kỳ tháng 8."
            >
              Kỳ tiêu thụ
            </span>
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
            <select
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {[year - 1, year, year + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={loadBills}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" /> Tải lại
            </button>
          </div>
        )}
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-700">
                Nhà / toà nhà <span className="text-rose-500">*</span>
              </label>
              {/* Dùng chung ô chọn nhà của trang EVN: có ô tìm + lọc theo loại. Danh sách
                  nhà dài hàng chục dòng nên `<select>` trần là phải cuộn tay để mò. */}
              <PropertyCombobox
                properties={occupiedProperties}
                value={propertyId}
                onChange={setPropertyId}
                publishedIds={publishedIds}
                disabled={loadingProps}
              />
              {/* Nói rõ đã giấu bớt — im lặng thì admin tìm một căn quen thuộc, không
                  thấy, tưởng nhà bị xoá khỏi hệ thống. */}
              {hiddenEmptyCount > 0 && (
                <p className="mt-1.5 text-xs text-slate-400">
                  Chỉ hiện nhà đang có khách ở — {hiddenEmptyCount} nhà trống đã được ẩn.
                </p>
              )}
              {!!existingBill && (
                <p className="mt-1 text-xs font-semibold text-amber-600">
                  Nhà này đã có hoá đơn nước kỳ {month}/{year} — thu hồi bản cũ trước nếu muốn phát hành lại.
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-700">Ảnh hoá đơn nước</label>
              {/* Input gốc bị ẩn: control mặc định của trình duyệt ("Chọn tệp · Không có
                  tệp nào được chọn") lạc hẳn với phần còn lại của trang. */}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickImage(e.target.files?.[0])}
              />

              {imageUrl ? (
                <div className="rounded-xl border border-slate-200 p-2">
                  <button
                    type="button"
                    onClick={() => setZoomImage(imageUrl)}
                    className="block w-full cursor-zoom-in"
                    title="Bấm để phóng to"
                  >
                    <img
                      src={imageUrl}
                      alt="Hoá đơn nước"
                      className="max-h-64 w-full rounded-lg object-contain"
                    />
                  </button>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                    >
                      Đổi ảnh khác
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setImageUrl('');
                        setOcrRawText('');
                        setOcrCustomerCode('');
                        if (fileRef.current) fileRef.current.value = '';
                      }}
                      className="flex-1 rounded-lg border border-rose-200 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      Xoá ảnh
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-8 text-slate-500 hover:border-sky-300 hover:bg-sky-50/50 disabled:opacity-60"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
                      <span className="text-sm font-semibold">Đang tải ảnh…</span>
                    </>
                  ) : (
                    <>
                      <FileUp className="h-6 w-6" />
                      <span className="text-sm font-semibold">Chọn ảnh hoá đơn nước</span>
                      <span className="text-xs text-slate-400">PNG, JPG — chụp hoặc tải từ máy</span>
                    </>
                  )}
                </button>
              )}

              {!!scanNote && (
                <p className="mt-1.5 text-xs font-semibold text-sky-700">{scanNote}</p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">
                  Tổng m³ <span className="text-rose-500">*</span>
                </label>
                {/* Chấm phân cách nghìn ngay khi gõ, giống hệt trang điện — state gốc vẫn
                    là chuỗi chỉ chữ số. Trước đây ô này để trần nên "22435000" đập vào mắt
                    không đếm nổi, mà gõ dư một số 0 là sai gấp mười lần cả hoá đơn. */}
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm tabular-nums"
                  inputMode="numeric"
                  placeholder="1.478"
                  value={groupThousands(form.totalQuantity)}
                  onChange={(e) => setForm((f) => ({ ...f, totalQuantity: onlyDigits(e.target.value) }))}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-700">
                  Tổng tiền (đ) <span className="text-rose-500">*</span>
                </label>
                <input
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm tabular-nums"
                  inputMode="numeric"
                  placeholder="22.435.000"
                  value={groupThousands(form.totalAmount)}
                  onChange={(e) => setForm((f) => ({ ...f, totalAmount: onlyDigits(e.target.value) }))}
                />
                {/* Nhập "Tổng tiền thanh toán" trên giấy (đã gồm VAT + phí BVMT), không
                    phải "Cộng tiền hàng". Không ghi chú lên UI — admin nắm nghiệp vụ
                    này, bày thêm chữ chỉ làm rối form. */}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-700">
                Kỳ thanh toán <span className="text-rose-500">*</span>
              </label>
              <input
                className={`w-full rounded-lg border px-3 py-2.5 text-sm ${
                  periodIssue ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200'}`}
                placeholder="01/09 – 30/09/2026"
                value={form.billingPeriod}
                onChange={(e) => setForm((f) => ({ ...f, billingPeriod: e.target.value }))}
              />
              {/* Ô chữ tự do nhưng KHÔNG phải muốn gõ gì cũng được — xem `periodProblem`. */}
              {periodIssue && (
                <p className="mt-1 text-xs font-bold text-rose-600">⚠ {periodIssue}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400">Điền nhanh:</span>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, billingPeriod: selectedMonthPeriod }))}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  Kỳ {month}/{year}
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, billingPeriod: prevMonthPeriod }))}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Tháng trước
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Chuỗi này hiện nguyên văn trên hoá đơn khách nhận — ghi đúng kỳ in trên giấy.
              </p>
            </div>

            {/* ── Luồng sau khi phát hành, khác nhau theo LOẠI NHÀ ──
                Nói trước khi bấm: một loại tới tay khách ngay, một loại còn phải qua quản lý
                đọc đồng hồ. Admin cần biết mình đang tạo ra việc cho ai. */}
            {!!propertyId && (
              <div className={`rounded-xl border p-4 ${
                isWholeHouse ? 'border-cyan-200 bg-cyan-50' : 'border-violet-200 bg-violet-50'
              }`}>
                <p className={`text-xs font-black uppercase tracking-wide ${
                  isWholeHouse ? 'text-cyan-700' : 'text-violet-700'
                }`}>
                  {isWholeHouse ? 'Nguyên căn — gửi thẳng cho khách thuê' : 'Nhà chia phòng — quản lý đọc đồng hồ'}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                  {isWholeHouse ? (
                    <>
                      Cả căn chỉ một khách thuê, giấy nước đã ghi đủ chỉ số cũ · mới · tổng tiền
                      của chính căn đó — không còn gì phải chia. Bấm phát hành là <b>hoá đơn tới
                      tay khách ngay</b>. Quản lý chỉ nhận thông báo để vào xem.
                    </>
                  ) : (
                    <>
                      Giấy nước chỉ có tổng của cả nhà nên phải chia về từng phòng theo đồng hồ
                      riêng. Bấm phát hành là hệ thống chốt <b>đơn giá</b> rồi giao việc cho quản
                      lý: <b>đi chụp đồng hồ và ghi số từng phòng trong NGÀY HÔM NAY</b>, rồi gửi
                      hoá đơn cho từng khách.
                    </>
                  )}
                </p>
              </div>
            )}

            {/* ── Chỉ số đồng hồ — CHỈ nguyên căn ──
                Hoá đơn nguyên căn đi thẳng tới khách nên phải mang đúng hai số in trên giấy. */}
            {isWholeHouse && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    Chỉ số cũ (m³) {!prevLocked && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    className={`w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm tabular-nums ${
                      prevLocked ? 'bg-slate-100 text-slate-600' : ''
                    }`}
                    inputMode="numeric"
                    readOnly={prevLocked}
                    placeholder={loadingPrev ? 'Đang lấy chỉ số kỳ trước…' : 'Số đầu kỳ trên giấy'}
                    value={form.prevReading}
                    onChange={(e) => setForm((f) => ({ ...f, prevReading: e.target.value }))}
                  />
                  {prevLocked ? (
                    <p className="mt-1 text-xs text-slate-500"
                      title="Số đã chốt với khách ở kỳ trước và đã thu tiền theo nó. Sửa được nghĩa là cho phép hai kỳ không nối tiếp, phần chênh biến mất khỏi mọi hoá đơn.">
                      🔒 Chốt kỳ trước{cycle?.prevClose?.at ? ` (${cycle.prevClose.at.slice(0, 7)})` : ''}
                    </p>
                  ) : !loadingPrev && propertyId && cycle?.firstPeriod ? (
                    <p className="mt-1 text-xs font-semibold text-indigo-600"
                      title="Chưa có kỳ trước để nối nên ô này mở. Từ kỳ sau hệ thống tự điền và khoá lại.">
                      Kỳ đầu — nhập số đầu kỳ trên giấy
                    </p>
                  ) : !loadingPrev && propertyId ? (
                    <p className="mt-1 text-xs text-amber-600">Chưa có chỉ số kỳ nào — nhập số đầu kỳ</p>
                  ) : null}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    Chỉ số mới (m³) <span className="text-rose-500">*</span>
                  </label>
                  {/* Ô DẪN XUẤT, không cho gõ — máy chủ ép `mới − cũ = tổng m³`. */}
                  <input
                    className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm tabular-nums text-slate-600"
                    inputMode="numeric"
                    readOnly
                    placeholder={prevReadingNum > 0 ? 'Nhập tổng m³ để tự tính' : 'Cần chỉ số cũ + tổng m³'}
                    value={form.newReading}
                    onChange={(e) => setForm((f) => ({ ...f, newReading: e.target.value }))}
                  />
                  {/* Chỉ nêu PHÉP TÍNH, phần dặn dò vào `title` — xem trang điện. */}
                  <p className="mt-1 text-xs text-slate-400" title="Giấy nước ghi khác thì sửa ô tổng m³, không sửa ở đây — máy chủ ép hiệu hai chỉ số phải bằng đúng tổng m³.">
                    {autoNewReading != null
                      ? <>= {prevReadingNum.toLocaleString('vi-VN')} + {quantity.toLocaleString('vi-VN')} m³</>
                      : 'Tự tính = chỉ số cũ + tổng m³'}
                  </p>
                </div>

                {/* KỲ ĐẦU: bày đủ hai mốc — xem khối cùng tên ở `EvnBillPublishing`. */}
                {cycle?.firstPeriod && (
                  <div className="sm:col-span-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                    {/* Không in lại số cũ / số mới — chúng nằm ngay trong hai ô phía trên. */}
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-sm font-bold text-indigo-800">
                        Kỳ đầu tiên của khách này
                        <span className="ml-1.5 font-normal text-indigo-600">
                          · đồng hồ lúc đón khách
                          {cycle.handover?.at
                            ? ` ${cycle.handover.at.slice(0, 10).split('-').reverse().join('/')}`
                            : ''}
                        </span>
                      </p>
                      <p className="text-lg font-black tabular-nums text-indigo-800">
                        {cycle.handover
                          ? `${Math.round(cycle.handover.reading).toLocaleString('vi-VN')} m³`
                          : <span className="text-sm font-semibold text-indigo-500">hợp đồng không ghi</span>}
                      </p>
                    </div>
                    {firstNote?.kind === 'pre-move-in' && newReadingNum > 0 && (
                      <p className="mt-2 flex gap-2 rounded-lg bg-white/70 p-2 text-xs leading-relaxed text-indigo-900">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
                        <span>
                          Giấy nước tính trọn tháng nhưng khách dọn vào giữa kỳ: khách trả{' '}
                          <b>{(newReadingNum - firstNote.handover).toLocaleString('vi-VN')} m³</b>,
                          còn <b>{firstNote.amount.toLocaleString('vi-VN')} m³</b> trước khi họ dọn tới là
                          chi phí công ty. Máy chủ tự cắt phần này khi lập hoá đơn cho khách.
                        </span>
                      </p>
                    )}
                    {/* Chênh lớn hơn cả lượng tiêu thụ của kỳ → đọc sai ô đầu kỳ. */}
                    {firstNote?.kind === 'bad-prev' && (
                      <p className="mt-2 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs leading-relaxed text-rose-800">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                        <span>
                          Chỉ số cũ đang nhỏ hơn mốc đón khách tới{' '}
                          <b>{(firstNote.handover - prevReadingNum).toLocaleString('vi-VN')} m³</b> — nhiều hơn
                          cả lượng tiêu thụ của kỳ này. Gần như chắc chắn ô <b>chỉ số cũ</b> đọc sai; mở ảnh
                          soi lại số đầu kỳ trên giấy.
                        </span>
                      </p>
                    )}
                  </div>
                )}

                {/* KỲ 2 TRỞ ĐI: đối chiếu giấy với sổ — xem `continuityGap`. */}
                {needsPaperPrev && (
                  <div className={`sm:col-span-2 rounded-xl border p-3 ${
                    readingGap ? 'border-rose-200 bg-rose-50'
                      : paperPrevNum == null ? 'border-amber-200 bg-amber-50'
                      : 'border-emerald-200 bg-emerald-50'}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-xs font-bold text-slate-700">
                        Số cũ IN TRÊN GIẤY nước kỳ này <span className="text-rose-500">*</span>
                      </label>
                      <input
                        className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-1 text-right text-xs font-bold tabular-nums outline-none focus:border-indigo-400"
                        inputMode="numeric"
                        placeholder="—"
                        value={form.paperPrev}
                        onChange={(e) => setForm((f) => ({ ...f, paperPrev: onlyDigits(e.target.value) }))}
                      />
                      {readingGap ? (
                        <span className="text-xs font-black text-rose-700">
                          ⚠ lệch {Math.abs(readingGap.diff).toLocaleString('vi-VN')} m³
                        </span>
                      ) : paperPrevNum != null ? (
                        <span className="text-xs font-black text-emerald-700">✓ nối liền kỳ trước</span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                      {readingGap ? (
                        <>
                          Kỳ trước chốt <b>{readingGap.expected.toLocaleString('vi-VN')}</b>, giấy kỳ này bắt
                          đầu từ <b>{readingGap.found.toLocaleString('vi-VN')}</b> — phần ở giữa không nằm
                          trên hoá đơn nào. <b>Chưa phát hành được.</b>
                        </>
                      ) : paperPrevNum == null ? (
                        <>Phải bằng chốt kỳ trước ({cycle?.prevClose?.reading.toLocaleString('vi-VN')}) mới phát hành được.</>
                      ) : (
                        <>Hai kỳ nối liền nhau.</>
                      )}
                    </p>
                  </div>
                )}
                {readingMismatch ? (
                  <p className="sm:col-span-2 text-xs font-semibold text-rose-600">
                    Chỉ số mới − chỉ số cũ = {(newReadingNum - prevReadingNum).toLocaleString('vi-VN')} m³,
                    không khớp tổng {quantity.toLocaleString('vi-VN')} m³ ở trên. Sửa cho khớp rồi mới
                    phát hành được.
                  </p>
                ) : null}
              </div>
            )}

            <div className={`rounded-xl border p-4 ${unitPrice > 0 ? 'border-sky-200 bg-sky-50' : 'border-slate-200 bg-slate-50'}`}>
              {/* Câu giải thích chuyển vào `title` — luôn đúng, không đổi theo lần bấm nào. */}
              <p
                className="text-xs font-bold uppercase tracking-wide text-slate-500"
                title="= tổng tiền ÷ tổng m³. Số đem đi tính giữ nguyên phần thập phân, chỉ chỗ hiển thị mới làm tròn. Quản lý dựng hoá đơn từng phòng trên chính con số này."
              >
                Đơn giá hệ thống sẽ dùng
              </p>
              <p className={`mt-1 text-3xl font-black tabular-nums ${unitPrice > 0 ? 'text-sky-700' : 'text-slate-300'}`}>
                {unitPrice > 0 ? `${formatVnd(Math.round(unitPrice))}/m³` : '—'}
              </p>
              {/* Số này cao hơn đơn giá in trên hoá đơn (vd 29.000đ/m³) vì giá in là giá
                  trước thuế, còn đây đã gánh VAT + phí BVMT để thu đủ tổng. Cũng không
                  ghi lên UI — cùng lý do với ô Tổng tiền. */}
            </div>

            {!!publishError && (
              <p className="flex items-start gap-1.5 text-sm font-semibold text-rose-600">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {publishError}
              </p>
            )}

            {/* Nói đúng việc đã xảy ra: khách đã có hoá đơn, hay mới chỉ giao việc
                cho quản lý. Hai kết quả khác nhau nên không dùng chung một câu. */}
            {issuedToTenant && !publishError && (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                Đã phát hành cho khách thuê — khách nhận hoá đơn và thanh toán được ngay.
                Quản lý nhận thông báo để vào xem.
              </p>
            )}

            {/*
              ── Chặn nhầm nhà (24/08/2026) ──
              Song sinh với khối cùng tên bên `EvnBillPublishing` — sửa thì sửa cả hai.
              Đặt sát nút phát hành vì đây là thứ cuối cùng cần đọc trước khi hoá đơn đi
              tới khách. Cảnh báo chứ KHÔNG chặn: OCR sai nhiều, chặn cứng sẽ có ngày
              admin cầm đúng hoá đơn mà không phát hành được.
            */}
            {billMatch.verdict === 'mismatch' && (
              <div className="rounded-lg border-2 border-rose-300 bg-rose-50 p-3">
                <p className="flex items-center gap-1.5 text-sm font-bold text-rose-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> Ảnh có vẻ KHÔNG phải của căn nhà này
                </p>
                <p className="mt-1 text-xs leading-relaxed text-rose-700">{billMatch.message}</p>
                <p className="mt-1.5 text-xs text-rose-600">
                  Đang chọn: <b>{selectedProperty?.propertyName}</b>
                  {selectedProperty?.shortAddress ? ` — ${selectedProperty.shortAddress}` : ''}
                </p>
              </div>
            )}

            {billMatch.verdict === 'weak' && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="flex items-center gap-1.5 text-sm font-bold text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> Nên kiểm lại địa chỉ trên ảnh
                </p>
                <p className="mt-1 text-xs leading-relaxed text-amber-700">{billMatch.message}</p>
              </div>
            )}

            {/* Song sinh với khối mã khách hàng bên trang EVN — xem chú thích dài ở đó. */}
            {/* Ô SỬA ĐƯỢC — song sinh với khối mã khách hàng bên trang EVN, xem chú thích ở đó. */}
            {!!propertyId && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
                <label className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
                  Số danh bộ trên giấy
                </label>
                <input
                  value={form.customerCode}
                  onChange={(e) => setForm((f) => ({ ...f, customerCode: e.target.value }))}
                  placeholder="VD: 0123456789"
                  className="mt-1 w-full rounded-lg border border-sky-200 bg-white px-3 py-2 font-mono text-base font-extrabold tracking-wide text-sky-900 outline-none focus:border-sky-400"
                />
                <p className="mt-1.5 text-xs leading-relaxed text-sky-700">
                  {ocrCustomerCode
                    ? 'Đã đọc từ ảnh. Soát lại với tờ giấy đang cầm rồi sửa nếu OCR đọc lệch.'
                    : 'Không đọc được từ ảnh — gõ tay theo tờ giấy.'}
                </p>
              </div>
            )}

            {billMatch.verdict === 'match' && (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <Check className="h-3.5 w-3.5" /> Địa chỉ trên ảnh khớp với căn nhà đang chọn.
              </p>
            )}

            <button
              type="button"
              onClick={publish}
              disabled={!formReady || publishing}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-bold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {/*
                Nhãn cũ của nhà chia phòng là "Gửi cho quản lý đọc đồng hồ" — đúng luồng
                TRƯỚC 10/09/2026, khi phát hành chỉ là giao việc. Nay quản lý đã chốt chỉ số
                từ hôm người ghi nước xuống, nên bấm nút này là hoá đơn đi thẳng tới khách.
              */}
              {isWholeHouse ? 'Phát hành & gửi cho khách thuê' : 'Phát hành & gửi cho khách các phòng đã chốt số'}
            </button>
          </div>
        </div>
      </SectionShell>

      <SectionShell
        icon={Droplets}
        title={`Đã phát hành — kỳ ${month}/${year}`}
        action={
          bills.length > 0 ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  className="w-44 bg-transparent text-sm outline-none placeholder:text-slate-400"
                  placeholder="Tìm nhà hoặc kỳ..."
                  value={billSearch}
                  onChange={(e) => setBillSearch(e.target.value)}
                />
              </div>
              {([
                { key: 'all',       label: `Tất cả ${bills.length}` },
                { key: 'published', label: `Đang hiệu lực ${bills.filter((b) => b.status !== 'REVOKED').length}` },
                { key: 'revoked',   label: `Đã thu hồi ${bills.filter((b) => b.status === 'REVOKED').length}` },
              ] as { key: typeof billStatus; label: string }[]).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setBillStatus(t.key)}
                  className={`rounded-full px-2.5 py-1.5 text-xs font-bold transition ${
                    billStatus === t.key ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) : undefined
        }
      >
        {loadingBills ? (
          <p className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
          </p>
        ) : billsError ? (
          <p className="flex items-start gap-1.5 py-6 text-sm font-semibold text-rose-600">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {billsError}
          </p>
        ) : visibleBills.length === 0 ? (
          /* Lọc không ra kết quả KHÁC HẲN chưa phát hành gì — nói chung một câu thì
             admin tưởng cả kỳ chưa gửi hoá đơn nào. */
          <EmptyState
            text={bills.length === 0
              ? `Chưa phát hành hoá đơn nước nào cho kỳ ${month}/${year}.`
              : 'Không có hoá đơn nào khớp bộ lọc — thử xoá từ khoá hoặc chọn "Tất cả".'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  {/* Cùng bố cục với trang điện — xem chú thích ở `EvnBillPublishing`. */}
                  <th className="py-2 pr-3">Nhà · kỳ</th>
                  <th className="py-2 pr-3 text-right">Số liệu tờ hoá đơn</th>
                  <th className="py-2 pr-3">Tiến độ ghi chỉ số</th>
                  <th className="py-2 pr-3">Trạng thái</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {visibleBills.map((b) => (
                  <tr key={b.id} className={`border-b border-slate-100 ${
                    b.status === 'REVOKED' ? 'opacity-50' : ''}`}>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2.5">
                        {b.imageUrl && (
                          <img src={b.imageUrl} alt="" className="h-9 w-9 shrink-0 rounded border border-slate-200 object-cover" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-800">
                            {b.propertyName ?? `#${b.propertyId}`}
                          </p>
                          <p className="truncate text-xs text-slate-400">{b.billingPeriod}</p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap py-3 pr-3 text-right">
                      <p className="font-bold tabular-nums text-slate-800">{formatVnd(b.totalAmount)}</p>
                      <p className="text-xs tabular-nums text-slate-400">
                        {b.totalQuantity?.toLocaleString('vi-VN')} m³ ·{' '}
                        <span className="font-bold text-sky-600">
                          {formatVnd(Math.round(b.unitPrice ?? waterUnitPrice(b.totalAmount, b.totalQuantity)))}/m³
                        </span>
                      </p>
                    </td>
                    <td className="py-3 pr-3"><ReadingProgress bill={b} unit="m³" /></td>
                    <td className="py-3 pr-3">
                      <StatusPill label={b.status === 'REVOKED' ? 'Đã thu hồi' : 'Đang hiệu lực'} color={b.status === 'REVOKED' ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'} />
                    </td>
                    <td className="py-3 text-right">
                      {/* Icon thay vì nút viền đỏ — xem lý do ở trang điện. */}
                      {b.status !== 'REVOKED' && (
                        <button
                          type="button"
                          title="Thu hồi hoá đơn này"
                          onClick={() => revoke(b.id)}
                          className="rounded-lg p-2 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionShell>

      {zipOpen && (
        <UtilityBillZipImport
          kind="WATER"
          properties={properties}
          month={month}
          year={year}
          defaultPeriod={selectedMonthPeriod}
          existing={bills}
          onClose={() => setZipOpen(false)}
          onDone={loadBills}
        />
      )}
    </div>
  );
};
