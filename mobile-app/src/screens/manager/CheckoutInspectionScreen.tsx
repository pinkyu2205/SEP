import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Image, ActivityIndicator,
} from 'react-native';
import {
  showAlert, readApiError, validateMeterPhoto, splitMeterReading,
  validateEquipmentPhoto, classifyEquipment, requireLiveCapture,
} from '@/utils';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Colors, Spacing, BorderRadius, Shadow, checkoutMeta } from '@/constants';
import { CameraCaptureModal } from '@/components/common';
import { uploadImageToCloudinary } from '@/services/core/cloudinary';
import { checkoutService } from '@/services/manager/checkoutService';
import { realTenantService } from '@/services/tenant/tenantService';
import { visionService } from '@/services/shared/visionService';
import { realManagerInvoiceService, type UtilityInvoiceLite } from '@/services/manager/invoiceService';
import type {
  CheckoutRequestDto, CheckoutDamageItem, ContractEquipmentDto,
} from '@/services/tenant/selfService';

/**
 * BIÊN BẢN KIỂM TRA PHÒNG lúc trả (bước INSPECTING của luồng checkout).
 *
 * Điểm cốt lõi: mọi khoản trừ tiền phải ĐỐI CHIẾU với thiết bị đã bàn giao lúc khách
 * nhận nhà — manager tự ghi hư hỏng mà không có gốc so sánh thì khách cãi là thua.
 * Danh sách thiết bị lấy từ hợp đồng (`equipmentList`); nếu không tải được vẫn cho
 * ghi khoản trừ thủ công để không chặn việc vận hành.
 *
 * (Màn biên bản mock `InspectionDetailScreen` đã bị xoá 15/08/2026 — đây là màn
 * biên bản trả phòng DUY NHẤT, và là màn có API thật.)
 */

/**
 * Trần ảnh hiện trạng cho một biên bản.
 * Có trần thì `selectionLimit` chặn ngay trong thư viện ảnh, không để chọn 40 tấm rồi mới
 * biết là quá nhiều — mà mỗi tấm là một lượt upload thật.
 */
const MAX_ROOM_PHOTOS = 12;

const money = (n: number) => (n || 0).toLocaleString('vi-VN') + 'đ';
const readErr = readApiError;
/**
 * Mọi ô số ở màn này dùng `keyboardType="number-pad"`, KHÔNG phải `"numeric"`.
 *
 * Trên Android, `"numeric"` map sang `TYPE_CLASS_NUMBER | TYPE_NUMBER_FLAG_DECIMAL` — Gboard
 * có lúc dựng thanh công cụ rút gọn (mic / xoá / emoji) thay vì bàn phím số, gõ không được.
 * `"number-pad"` là bàn phím số thuần.
 *
 * ⚠️ Từ 08/08/2026 tới 27/08/2026 chỗ này SAI: OCR điền chỉ số có phần lẻ ("3081.5") mà
 * `toNum` xoá sạch dấu chấm → gửi BE 30815, lệch 10 lần so với chỉ số lúc đón khách.
 * Nay chỉ số chỉ còn phần ĐEN (số nguyên) nên `toNum` đúng trở lại — nhưng đừng để OCR
 * điền chuỗi có dấu vào đây lần nữa, xem `splitMeterReading(...).rounded` ở dưới.
 */
const toNum = (v: string) => Number((v || '').replace(/[^\d]/g, '')) || 0;
const onlyDigits = (v: string) => (v || '').replace(/[^\d]/g, '');
/** Hiện số có dấu chấm ngăn nghìn khi gõ: "3412" -> "3.412" (giá trị lưu vẫn là số trần). */
const groupThousands = (v: string) => {
  const d = onlyDigits(v);
  return d ? Number(d).toLocaleString('vi-VN') : '';
};

interface DamageDraft { amount: string; note: string }
interface ExtraDraft { label: string; amount: string }
/**
 * MỐC ĐỐI CHIẾU cho chỉ số cuối kỳ.
 *
 * Phải là chỉ số CHỐT KỲ GẦN NHẤT, không phải lúc đón khách: khách ở tháng thứ 8 mà
 * lấy mốc lúc vào ở thì "đã dùng" gộp cả 8 tháng — thu lại lần nữa số tiền khách đã
 * đóng suốt 7 tháng trước. Chỉ khách ở tháng đầu (chưa có hoá đơn nào) mới lấy mốc
 * lúc đón khách. Cùng luật với màn Hoá đơn điện nước.
 */
interface HandoverMeters {
  elec?: number;
  water?: number;
  /** Ảnh đồng hồ lúc đón khách — vẫn hiện để đối chiếu hiện trạng đồng hồ. */
  elecPhoto?: string;
  waterPhoto?: string;
  /** Mốc đang dùng đến từ đâu, để nói rõ trên màn hình. */
  elecSource?: 'last_invoice' | 'handover';
  waterSource?: 'last_invoice' | 'handover';
  /** Kỳ của hoá đơn đã lấy làm mốc, vd "2026-07". */
  elecPeriod?: string;
  waterPeriod?: string;
}
type MeterKind = 'elec' | 'water';
/** Trạng thái nhận diện ảnh đồng hồ hiện dưới ô nhập ('ok' xanh · 'warn' cam). */
interface MeterStatus { tone: 'ok' | 'warn'; text: string }

export const CheckoutInspectionScreen: React.FC<any> = ({ navigation, route }) => {
  const checkoutId: number = route?.params?.checkoutId;

  const [req, setReq] = useState<CheckoutRequestDto | null>(null);
  const [equipment, setEquipment] = useState<ContractEquipmentDto[]>([]);
  const [equipmentError, setEquipmentError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  /**
   * Chụp bằng camera trong app (CameraCaptureModal) thay vì ImagePicker.launchCameraAsync:
   * trên web hàm đó chỉ mở hộp thoại chọn file, còn modal này bật camera thật và bắt
   * xác nhận lại ảnh trước khi gửi lên. Dùng chung 1 luồng cho cả web lẫn điện thoại.
   * `null` = đóng; 'room' = ảnh hiện trạng (chụp nhiều), 'elec'/'water' = ảnh đồng hồ.
   */
  const [cameraTarget, setCameraTarget] = useState<'room' | MeterKind | { equipmentId: string } | null>(null);
  const [meterBusy, setMeterBusy] = useState<MeterKind | null>(null);
  /** Đang xử lý ảnh của thiết bị nào (id) — khoá nút trong lúc upload + đọc tem. */
  const [equipBusy, setEquipBusy] = useState<string | null>(null);

  const [photos, setPhotos] = useState<string[]>([]);
  const [elecReading, setElecReading] = useState('');
  const [waterReading, setWaterReading] = useState('');
  /** Ảnh mặt đồng hồ lúc chốt số cuối kỳ. */
  const [elecMeterUrl, setElecMeterUrl] = useState('');
  const [waterMeterUrl, setWaterMeterUrl] = useState('');
  /** Kết quả nhận diện ảnh đồng hồ, hiện ngay dưới ô nhập. */
  const [meterStatus, setMeterStatus] = useState<Partial<Record<MeterKind, MeterStatus>>>({});
  const [handover, setHandover] = useState<HandoverMeters>({});
  const [note, setNote] = useState('');
  /**
   * Cam kết của quản lý về chỉ số điện/nước (mục 2).
   *
   * Hai con số này quyết định tiền điện nước kỳ cuối trừ vào cọc của khách, và khách không
   * có mặt lúc đọc đồng hồ. Bắt tick một lần buộc người ghi phải nhìn lại số mình vừa gõ,
   * và biến nó thành một hành động có chủ ý thay vì gõ xong bấm cho xong.
   */
  const [meterConfirmed, setMeterConfirmed] = useState(false);
  /** Tiến độ tải nhiều ảnh — để quản lý biết còn bao nhiêu tấm nữa. */
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  /** key = id thiết bị bị đánh dấu hư hỏng. Không có key = nguyên vẹn. */
  const [damages, setDamages] = useState<Record<string, DamageDraft>>({});
  /**
   * ĐƠN GIÁ điện/nước để tính tiền kỳ cuối ngay tại biên bản.
   *
   * Vì sao phải tạm tính: giá điện là giá BÌNH QUÂN từ hoá đơn EVN của cả nhà
   * (tổng tiền ÷ tổng kWh), mà hoá đơn tháng 8 thì đầu tháng 9 mới có. Khách đi ngày
   * 20/8 không thể chờ. Nên lấy đơn giá của kỳ gần nhất làm giá tạm, chốt tiền ngay,
   * trừ vào cọc — chênh lệch giữa 2 tháng liền kề chỉ vài phần trăm.
   * Manager sửa tay được nếu biết giá chính xác hơn.
   */
  const [unitPrice, setUnitPrice] = useState<Record<MeterKind, string>>({ elec: '', water: '' });
  /** Đơn giá đang dùng lấy từ hoá đơn kỳ nào, để ghi rõ "tạm tính theo kỳ ...". */
  const [pricePeriod, setPricePeriod] = useState<Partial<Record<MeterKind, string>>>({});

  /** Ảnh bằng chứng hư hỏng theo từng thiết bị (key = id thiết bị). */
  const [damagePhotos, setDamagePhotos] = useState<Record<string, string[]>>({});
  /** Kết quả nhận diện ảnh thiết bị, hiện ngay dưới ô nhập của món đó. */
  const [equipStatus, setEquipStatus] = useState<Record<string, MeterStatus>>({});
  const [extras, setExtras] = useState<ExtraDraft[]>([]);

  const load = useCallback(async () => {
    try {
      const detail = await checkoutService.get(checkoutId);
      setReq(detail);

      // Biên bản đã lưu trước đó (nếu manager quay lại sửa)
      const insp = detail.inspection ?? await checkoutService.getInspection(checkoutId).catch(() => null);
      if (insp) {
        setPhotos(insp.photos ?? []);
        setNote(insp.roomConditionNote ?? '');
        setElecReading(insp.electricityFinalReading != null ? String(insp.electricityFinalReading) : '');
        setWaterReading(insp.waterFinalReading != null ? String(insp.waterFinalReading) : '');
        setElecMeterUrl(insp.electricMeterImageUrl ?? '');
        setWaterMeterUrl(insp.waterMeterImageUrl ?? '');
        const dmg: Record<string, DamageDraft> = {};
        const dmgPhotos: Record<string, string[]> = {};
        const ext: ExtraDraft[] = [];
        (insp.damages ?? []).forEach(d => {
          if (d.equipmentId != null) {
            dmg[String(d.equipmentId)] = { amount: String(d.amount ?? ''), note: d.note ?? '' };
            if (d.photos?.length) dmgPhotos[String(d.equipmentId)] = d.photos;
          } else ext.push({ label: d.label, amount: String(d.amount ?? '') });
        });
        setDamages(dmg);
        setDamagePhotos(dmgPhotos);
        setExtras(ext);
      }

      // Hợp đồng: thiết bị đã bàn giao (gốc để đối chiếu hư hỏng) + chỉ số/ảnh đồng hồ
      // lúc đón khách. Mốc tính điện nước thì ưu tiên hoá đơn chốt gần nhất (xem dưới).
      try {
        const contract = await realTenantService.getContract(detail.contractId);
        setEquipment(contract.equipmentList ?? []);

        const base: HandoverMeters = {
          elec: contract.initialElectricReading ?? undefined,
          water: contract.initialWaterReading ?? undefined,
          elecPhoto: contract.electricMeterImageUrl ?? undefined,
          waterPhoto: contract.waterMeterImageUrl ?? undefined,
          elecSource: 'handover',
          waterSource: 'handover',
        };

        // Đã có hoá đơn điện/nước kỳ nào rồi thì lấy chỉ số MỚI của kỳ gần nhất làm mốc.
        // Không làm bước này thì khách ở tháng thứ 8 bị tính lại điện của cả 7 tháng trước.
        try {
          const [elecInv, waterInv] = await Promise.all([
            realManagerInvoiceService.listUtilityInvoices(contract.propertyId, { type: 'ELECTRICITY' }).catch(() => []),
            realManagerInvoiceService.listUtilityInvoices(contract.propertyId, { type: 'WATER' }).catch(() => []),
          ]);
          const latestOf = (list: UtilityInvoiceLite[]) => list
            .filter(i => (contract.roomId ? i.roomId === contract.roomId : true) && i.newReading != null)
            .sort((a, b) => (b.billingPeriod ?? '').localeCompare(a.billingPeriod ?? ''))[0];

          // Đơn giá bình quân của kỳ đó = tổng tiền ÷ số đã dùng. Đây chính là giá EVN
          // sau khi chia bậc thang, nên dùng làm giá tạm cho kỳ cuối là sát nhất.
          const priceOf = (inv?: UtilityInvoiceLite) =>
            inv && inv.amount && inv.consumption ? Math.round(inv.amount / inv.consumption) : 0;

          const lastElec = latestOf(elecInv);
          if (lastElec?.newReading != null) {
            base.elec = lastElec.newReading;
            base.elecSource = 'last_invoice';
            base.elecPeriod = lastElec.billingPeriod;
          }
          const elecPrice = priceOf(lastElec);
          if (elecPrice > 0) {
            setUnitPrice(p => ({ ...p, elec: String(elecPrice) }));
            setPricePeriod(p => ({ ...p, elec: lastElec?.billingPeriod }));
          }

          const lastWater = latestOf(waterInv);
          if (lastWater?.newReading != null) {
            base.water = lastWater.newReading;
            base.waterSource = 'last_invoice';
            base.waterPeriod = lastWater.billingPeriod;
          }
          const waterPrice = priceOf(lastWater);
          if (waterPrice > 0) {
            setUnitPrice(p => ({ ...p, water: String(waterPrice) }));
            setPricePeriod(p => ({ ...p, water: lastWater?.billingPeriod }));
          }
        } catch {
          // Không lấy được lịch sử hoá đơn → giữ mốc lúc đón khách, UI sẽ nói rõ mốc nào.
        }

        setHandover(base);
      } catch {
        setEquipmentError(true);
      }
    } catch (e: any) {
      showAlert('Lỗi', readErr(e, 'Không tải được hồ sơ trả phòng.'));
    } finally {
      setLoading(false);
    }
  }, [checkoutId]);

  useEffect(() => { load(); }, [load]);

  /** Tải 1 ảnh (đã chọn/đã xác nhận) lên Cloudinary rồi thêm vào biên bản. */
  const uploadPhoto = async (uri: string) => {
    setUploading(true);
    try {
      const url = await uploadImageToCloudinary(uri);
      setPhotos(p => [...p, url]);
    } catch (e: any) {
      showAlert('Lỗi upload', readErr(e, 'Không tải được ảnh lên.'));
    } finally {
      setUploading(false);
    }
  };

  /** Mở thư viện ảnh, trả về uri đã chọn (null nếu huỷ/không có quyền). */
  const pickImageUri = async (): Promise<string | null> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      showAlert('Thiếu quyền', 'Cần quyền truy cập thư viện ảnh.');
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
    if (result.canceled || !result.assets?.[0]) return null;
    return result.assets[0].uri;
  };

  /**
   * Mở thư viện và cho chọn NHIỀU ảnh một lượt.
   *
   * `launchImageLibraryAsync` mặc định chỉ trả 1 ảnh, nên bản cũ bắt quản lý lặp lại
   * chọn-xác nhận-chờ upload cho từng tấm. Chụp hiện trạng một phòng thường 5–10 tấm.
   */
  const pickImageUris = async (limit: number): Promise<string[]> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      showAlert('Thiếu quyền', 'Cần quyền truy cập thư viện ảnh.');
      return [];
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.6,
      allowsMultipleSelection: true,
      selectionLimit: limit,
    });
    if (result.canceled) return [];
    return (result.assets ?? []).map(a => a.uri).filter(Boolean);
  };

  /**
   * Tải lần lượt từng ảnh, KHÔNG `Promise.all`.
   *
   * Chạy song song 10 ảnh thì mạng yếu là hỏng cả loạt, mà hỏng rồi cũng không biết tấm nào
   * đã lên. Tuần tự thì giữ được phần đã lên và báo đúng số tấm còn thiếu.
   */
  const uploadPhotos = async (uris: string[]) => {
    if (uris.length === 0) return;
    setUploading(true);
    setUploadProgress({ done: 0, total: uris.length });
    const uploaded: string[] = [];
    try {
      for (const uri of uris) {
        try {
          uploaded.push(await uploadImageToCloudinary(uri));
        } catch {
          /* giữ lại phần đã lên, báo số hỏng ở dưới */
        }
        setUploadProgress(p => ({ ...p, done: p.done + 1 }));
      }
      if (uploaded.length > 0) setPhotos(p => [...p, ...uploaded]);
      const failed = uris.length - uploaded.length;
      if (failed > 0) {
        showAlert(
          'Một số ảnh chưa tải lên được',
          `${uploaded.length}/${uris.length} ảnh đã lên. Còn ${failed} ảnh hỏng — chọn lại những tấm đó.`,
        );
      }
    } finally {
      setUploading(false);
      setUploadProgress({ done: 0, total: 0 });
    }
  };

  /** Chọn ảnh hiện trạng phòng có sẵn trong máy — nhiều tấm một lượt. */
  const pickFromGallery = async () => {
    const remaining = MAX_ROOM_PHOTOS - photos.length;
    if (remaining <= 0) {
      return showAlert('Đủ ảnh rồi', `Biên bản đã có ${MAX_ROOM_PHOTOS} ảnh hiện trạng — xoá bớt nếu muốn thêm ảnh khác.`);
    }
    await uploadPhotos(await pickImageUris(remaining));
  };

  /**
   * Ảnh mặt đồng hồ lúc chốt số.
   *
   * Chỉ số điện/nước là tiền thật nên ảnh phải là MẶT ĐỒNG HỒ THẬT: OCR đọc chữ trong
   * ảnh, `validateMeterPhoto` soi xem có đơn vị (kWh/m³), tên hãng, serial... đúng loại
   * đồng hồ không. Ảnh chỉ có mấy con số (ghi ra giấy, chụp màn hình) hoặc chụp nhầm
   * loại đồng hồ đều BỊ TỪ CHỐI — không lưu ảnh, không điền số.
   */
  const uploadMeterPhoto = async (kind: MeterKind, uri: string) => {
    const setUrl = kind === 'elec' ? setElecMeterUrl : setWaterMeterUrl;
    const setReading = kind === 'elec' ? setElecReading : setWaterReading;
    const label = kind === 'elec' ? 'điện' : 'nước';

    setMeterBusy(kind);
    try {
      const url = await uploadImageToCloudinary(uri);

      let ocr;
      try {
        ocr = await realTenantService.ocrMeter(url);
      } catch {
        // Dịch vụ đọc ảnh lỗi → không kiểm chứng được. Vẫn giữ ảnh để không chặn việc
        // vận hành, nhưng nói thẳng là chưa kiểm được để người duyệt còn để ý.
        setUrl(url);
        setMeterStatus(prev => ({
          ...prev,
          [kind]: { tone: 'warn', text: 'Chưa kiểm chứng được ảnh (dịch vụ đọc ảnh lỗi) — tự đối chiếu mặt đồng hồ giúp.' },
        }));
        return;
      }

      const check = validateMeterPhoto(kind, ocr);
      if (!check.ok) {
        // Không giữ ảnh, không điền số — coi như chưa chụp.
        setMeterStatus(prev => ({ ...prev, [kind]: { tone: 'warn', text: check.reason ?? '' } }));
        showAlert(`Ảnh không phải đồng hồ ${label}`, check.reason, undefined, '🚫');
        return;
      }

      setUrl(url);
      // Tách phần lẻ (chữ số đỏ) rồi CHỈ GIỮ PHẦN ĐEN — chỉ số chốt lúc trả phòng phải
      // cùng quy ước với chỉ số chốt lúc đón khách, lệch một bên là hiệu số ra sai 10 lần.
      if (check.reading) {
        const s = splitMeterReading(check.reading, kind);
        setReading(String(s.rounded));
      }
      setMeterStatus(prev => ({
        ...prev,
        [kind]: check.confidence === 'high'
          ? {
              tone: 'ok',
              text: check.reading
                ? `Đã nhận diện đồng hồ ${label} · số đọc từ ảnh, đối chiếu lại giúp.`
                : `Đã nhận diện đồng hồ ${label} — nhập chỉ số bằng tay.`,
            }
          : {
              tone: 'warn',
              text: `Chưa chắc chắn đây là mặt đồng hồ ${label} (ảnh mờ hoặc thiếu chữ). Xem lại ảnh trước khi lưu.`,
            },
      }));
    } catch (e: any) {
      showAlert('Lỗi upload', readErr(e, 'Không tải được ảnh đồng hồ lên.'));
    } finally {
      setMeterBusy(null);
    }
  };

  const pickMeterFromGallery = async (kind: MeterKind) => {
    const uri = await pickImageUri();
    if (uri) await uploadMeterPhoto(kind, uri);
  };

  /**
   * Ảnh bằng chứng HƯ HỎNG của 1 thiết bị — mỗi ảnh là căn cứ trừ tiền cọc nên phải
   * đúng thiết bị đó, cùng tinh thần với ảnh đồng hồ:
   *   • Đồ điện máy (có tem nhãn): OCR đọc chữ trong ảnh, đòi thấy hãng/model/thông số
   *     đúng loại. Ảnh chụp giấy, chụp màn hình, hoặc chụp nhầm thiết bị khác → TỪ CHỐI.
   *   • Đồ không có chữ (giường, tủ, bàn ghế...): OCR vô nghĩa nên chỉ nhận ảnh CHỤP
   *     TRỰC TIẾP trong app — nút "Chọn từ máy" bị ẩn với nhóm này.
   */
  const uploadDamagePhoto = async (equipmentId: string, uri: string) => {
    const name = equipment.find(e => String(e.id) === equipmentId)?.name;
    const cls = classifyEquipment(name);

    setEquipBusy(equipmentId);
    try {
      const url = await uploadImageToCloudinary(uri);
      const keep = (status: MeterStatus) => {
        setDamagePhotos(prev => ({ ...prev, [equipmentId]: [...(prev[equipmentId] ?? []), url] }));
        setEquipStatus(prev => ({ ...prev, [equipmentId]: status }));
      };

      let labels;
      try {
        labels = await visionService.detectLabels(url);
        console.log('[vision]', labels.map(l => `${l.name}:${l.score.toFixed(2)}`).join(', '));
      } catch (e: any) {
        // Không nhìn được ảnh → không kiểm chứng được, vẫn giữ ảnh nhưng nói rõ.
        return keep({ tone: 'warn', text: readErr(e, 'Chưa kiểm chứng được ảnh — tự đối chiếu thiết bị giúp.') });
      }

      const result = validateEquipmentPhoto(name, labels);
      if (result.status === 'mismatch') {
        // Chỉ từ chối khi ĐỌC RA thiết bị khác — đó mới là bằng chứng chụp nhầm.
        setEquipStatus(prev => ({ ...prev, [equipmentId]: { tone: 'warn', text: result.reason ?? '' } }));
        showAlert('Ảnh có vẻ không phải thiết bị này', result.reason, undefined, '🚫');
        return;   // không lưu ảnh — coi như chưa chụp
      }

      keep(result.status === 'match'
        ? { tone: 'ok', text: `Đã nhận diện ${cls.label} trong ảnh.` }
        // Nhãn chung chung (ảnh chụp cận vết hỏng chẳng hạn) — giữ ảnh, nói rõ chưa đối chiếu được.
        : { tone: 'warn', text: 'Đã lưu ảnh. Máy chưa khẳng định được đây có phải thiết bị đó không — tự xem lại giúp.' });
    } catch (e: any) {
      showAlert('Lỗi upload', readErr(e, 'Không tải được ảnh thiết bị lên.'));
    } finally {
      setEquipBusy(null);
    }
  };

  const pickDamagePhotoFromGallery = async (equipmentId: string) => {
    const uri = await pickImageUri();
    if (uri) await uploadDamagePhoto(equipmentId, uri);
  };

  /** Ảnh vừa chụp/chọn thuộc về ô nào. */
  const handleCameraCapture = (uri: string) => {
    if (cameraTarget === 'elec' || cameraTarget === 'water') {
      const kind = cameraTarget;
      setCameraTarget(null);              // đồng hồ chỉ cần 1 ảnh → đóng camera luôn
      void uploadMeterPhoto(kind, uri);
    } else if (cameraTarget && typeof cameraTarget === 'object') {
      void uploadDamagePhoto(cameraTarget.equipmentId, uri);   // để mở, chụp nhiều góc
    } else {
      void uploadPhoto(uri);
    }
  };

  /**
   * Nút "Chọn ảnh có sẵn" trong camera — trả undefined để ẨN nút đó khi ảnh bắt buộc
   * phải chụp trực tiếp (thiết bị không có tem nhãn để máy kiểm nội dung ảnh).
   */
  const galleryFallback = (): (() => void) | undefined => {
    if (cameraTarget === 'elec' || cameraTarget === 'water') {
      const kind = cameraTarget;
      return () => pickMeterFromGallery(kind);
    }
    if (cameraTarget && typeof cameraTarget === 'object') {
      const id = cameraTarget.equipmentId;
      const name = equipment.find(e => String(e.id) === id)?.name;
      return requireLiveCapture(name) ? undefined : () => pickDamagePhotoFromGallery(id);
    }
    if (cameraTarget === 'room') return pickFromGallery;
    return undefined;
  };

  /** Số điện/nước đã dùng trong kỳ cuối = chỉ số cuối − chỉ số lúc đón khách. */
  const meterInfo = (kind: MeterKind) => {
    const prev = kind === 'elec' ? handover.elec : handover.water;
    const source = kind === 'elec' ? handover.elecSource : handover.waterSource;
    const period = kind === 'elec' ? handover.elecPeriod : handover.waterPeriod;
    const raw = kind === 'elec' ? elecReading : waterReading;
    const now = raw ? toNum(raw) : null;
    const unit = kind === 'elec' ? 'kWh' : 'm³';
    // Nói rõ mốc lấy từ đâu: chốt kỳ trước (khách ở lâu) hay lúc đón khách (tháng đầu).
    const sourceLabel = source === 'last_invoice'
      ? `Chốt kỳ ${period ?? 'trước'}`
      : 'Lúc đón khách';
    const base = { prev, now, unit, sourceLabel, source };
    if (prev == null || now == null || !raw) return { ...base, used: null, invalid: false };
    return { ...base, used: now - prev, invalid: now < prev };
  };

  /**
   * Tiền điện/nước kỳ cuối = số đã dùng × đơn giá tạm tính.
   * Trả null khi chưa đủ dữ liệu (chưa nhập số cuối, hoặc chưa có đơn giá).
   */
  const utilityCharge = (kind: MeterKind) => {
    const info = meterInfo(kind);
    const price = toNum(unitPrice[kind]);
    if (info.used == null || info.used <= 0 || info.invalid || price <= 0) return null;
    return {
      used: info.used,
      price,
      unit: info.unit,
      amount: Math.round(info.used * price),
      period: pricePeriod[kind],
    };
  };

  const toggleDamage = (id: string) => {
    setDamages(prev => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = { amount: '', note: '' };
      return next;
    });
    // Bỏ đánh dấu hư hỏng thì dọn luôn ảnh + kết quả nhận diện của món đó.
    if (damages[id]) {
      setDamagePhotos(prev => { const next = { ...prev }; delete next[id]; return next; });
      setEquipStatus(prev => { const next = { ...prev }; delete next[id]; return next; });
    }
  };

  const setDamageField = (id: string, key: keyof DamageDraft, value: string) =>
    setDamages(prev => ({ ...prev, [id]: { ...prev[id], [key]: value } }));

  /**
   * Tiền điện + nước kỳ cuối, dạng khoản trừ để đẩy vào quyết toán.
   *
   * Đi kèm hoá đơn: KHÔNG phát hành hoá đơn điện/nước riêng cho kỳ cuối rồi bắt khách
   * chuyển khoản — khách đang chuẩn bị đi, đòi rất khó. Trừ thẳng vào cọc gọn hơn;
   * cọc không đủ thì BE tự sinh khoản thu thêm ở bước quyết toán.
   */
  const utilityDamages = (): CheckoutDamageItem[] =>
    (['elec', 'water'] as MeterKind[]).flatMap(kind => {
      const c = utilityCharge(kind);
      if (!c) return [];
      const name = kind === 'elec' ? 'điện' : 'nước';
      return [{
        label: `Tiền ${name} kỳ cuối (${c.used.toLocaleString('vi-VN')} ${c.unit} × ${money(c.price)})`,
        amount: c.amount,
        note: c.period ? `Tạm tính theo đơn giá kỳ ${c.period}` : 'Đơn giá do quản lý nhập',
      }];
    });

  const damageTotal = useMemo(() => {
    const fromEquipment = Object.values(damages).reduce((s, d) => s + toNum(d.amount), 0);
    const fromExtras = extras.reduce((s, x) => s + toNum(x.amount), 0);
    const fromUtility = utilityDamages().reduce((s, d) => s + d.amount, 0);
    return fromEquipment + fromExtras + fromUtility;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [damages, extras, elecReading, waterReading, unitPrice, handover]);

  const buildDamages = (): CheckoutDamageItem[] => [
    ...Object.entries(damages).map(([id, d]) => ({
      equipmentId: Number(id) || undefined,
      label: equipment.find(e => String(e.id) === id)?.name ?? `Thiết bị #${id}`,
      amount: toNum(d.amount),
      note: d.note.trim() || undefined,
      photos: damagePhotos[id]?.length ? damagePhotos[id] : undefined,
    })),
    // KHÔNG gửi tiền điện/nước vào đây nữa (bỏ 20/08/2026).
    //
    // BE giờ tự phát hành hoá đơn ELECTRICITY/WATER riêng từ chỉ số + đơn giá gửi kèm
    // (`createFinalUtilityInvoice`), rồi gộp TOÀN BỘ `damages` thành một hoá đơn
    // COMPENSATION. Gửi tiếp dòng "Tiền điện kỳ cuối" vào đây là khách nhận hai hoá đơn
    // cho cùng một khoản — xem doc-be/BE-BUG-tien-dien-nuoc-cuoi-ky-bi-tru-hai-lan.
    //
    // Phần hiển thị "Thành tiền" trên màn vẫn giữ, nhưng chỉ là số TẠM TÍNH cho quản lý
    // ước lượng; số chốt do BE tính ở bước quyết toán.
    ...extras
      .filter(x => x.label.trim())
      .map(x => ({ label: x.label.trim(), amount: toNum(x.amount) })),
  ];

  /**
   * Những gì còn thiếu để chốt sang quyết toán.
   *
   * Trước đây mọi điều kiện chỉ kiểm lúc BẤM, mỗi lần một `showAlert`: quản lý sửa một chỗ,
   * bấm lại, lại bị chặn vì chỗ khác — không biết còn bao nhiêu việc nữa. Nay tính sẵn cả
   * danh sách, hiện ngay trên nút và khoá nút cho tới khi rỗng.
   *
   * "Chỉ lưu biên bản" KHÔNG dùng danh sách này — lưu dở là đúng nghiệp vụ, quản lý còn phải
   * ra chỗ đồng hồ chụp tiếp rồi quay lại.
   */
  /**
   * Mục 2 đã đủ dữ liệu để cam kết được chưa: cả hai đồng hồ có chỉ số hợp lệ VÀ có ảnh.
   *
   * Chưa đủ thì không hiện ô tick — nội dung cam kết nói "ảnh kèm theo là chụp tại phòng
   * này hôm nay", tick khi chưa có ảnh nào là xác nhận một thứ không tồn tại.
   */
  const meterReady = useMemo(
    () => (['elec', 'water'] as MeterKind[]).every((k) => {
      const reading = k === 'elec' ? elecReading : waterReading;
      const url = k === 'elec' ? elecMeterUrl : waterMeterUrl;
      return !!reading && !!url && !meterInfo(k).invalid;
    }),
    [elecReading, waterReading, elecMeterUrl, waterMeterUrl],
  );

  /**
   * Sửa số hoặc đổi ảnh SAU KHI đã tick → bỏ tick, bắt xác nhận lại.
   * Không có cái này thì cam kết dính vào dữ liệu cũ: tick lúc số đúng, sửa thành số khác,
   * dấu xác nhận vẫn còn nguyên và đi thẳng vào quyết toán.
   */
  useEffect(() => {
    setMeterConfirmed(false);
  }, [elecReading, waterReading, elecMeterUrl, waterMeterUrl]);

  const blockers = useMemo(() => {
    const out: string[] = [];
    if (photos.length === 0) out.push('Chụp ít nhất 1 ảnh hiện trạng phòng (mục 1)');

    (['elec', 'water'] as MeterKind[]).forEach((k) => {
      const name = k === 'elec' ? 'điện' : 'nước';
      const reading = k === 'elec' ? elecReading : waterReading;
      const url = k === 'elec' ? elecMeterUrl : waterMeterUrl;
      if (!reading) out.push(`Nhập chỉ số ${name} cuối kỳ (mục 2)`);
      else if (meterInfo(k).invalid) out.push(`Chỉ số ${name} đang nhỏ hơn lúc đón khách (mục 2)`);
      if (!url) out.push(`Chụp ảnh mặt đồng hồ ${name} (mục 2)`);
      /**
       * Có chỉ số mà chưa có đơn giá thì không tính được tiền.
       * Khách trả phòng ngay tháng đầu thì hệ thống không tự điền được (chưa có hoá đơn kỳ
       * trước), quản lý phải gõ tay. Chặn ở đây để không bấm lưu rồi mới nhận lỗi từ máy chủ.
       */
      if (reading && toNum(unitPrice[k]) <= 0) {
        out.push(`Nhập đơn giá ${name} (mục 2)`);
      }
    });

    // Chỉ nhắc tick khi ô tick đã hiện ra. Chưa đủ số/ảnh thì các dòng trên đã nói rồi,
    // thêm dòng này nữa là bảo người ta bấm một thứ chưa tồn tại trên màn hình.
    if (meterReady && !meterConfirmed) out.push('Xác nhận cam kết chỉ số điện/nước (mục 2)');

    buildDamages().forEach((d) => {
      if (d.amount <= 0) out.push(`Nhập số tiền cho khoản trừ "${d.label}"`);
    });
    Object.keys(damages).forEach((id) => {
      if (!damagePhotos[id]?.length) {
        const name = equipment.find(e => String(e.id) === id)?.name ?? 'thiết bị';
        out.push(`Chụp ảnh hư hỏng của "${name}" (mục 3)`);
      }
    });
    return out;
  }, [
    photos, elecReading, waterReading, elecMeterUrl, waterMeterUrl,
    unitPrice, meterConfirmed, damages, damagePhotos, equipment,
  ]);

  const save = async (goSettlement: boolean) => {
    if (photos.length === 0) {
      return showAlert('Thiếu ảnh', 'Chụp ít nhất 1 ảnh hiện trạng phòng — đây là bằng chứng khi khách không đồng ý khoản trừ.');
    }
    const list = buildDamages();
    const missing = list.find(d => d.amount <= 0);
    if (missing) {
      return showAlert('Thiếu số tiền', `Khoản "${missing.label}" chưa có số tiền. Nhập số tiền hoặc bỏ đánh dấu hư hỏng.`);
    }
    // Số cuối nhỏ hơn số lúc đón khách = gõ nhầm; để lọt là tính tiền điện/nước sai.
    const badMeter = (['elec', 'water'] as MeterKind[]).find(k => meterInfo(k).invalid);
    if (badMeter) {
      return showAlert(
        'Chỉ số không hợp lệ',
        `Chỉ số ${badMeter === 'elec' ? 'điện' : 'nước'} cuối kỳ đang nhỏ hơn chỉ số lúc đón khách. Kiểm tra lại trước khi lưu.`,
      );
    }
    // Có chỉ số thì phải có ảnh mặt đồng hồ đi kèm — không thì gõ số nào cũng được,
    // khách không có gì để đối chiếu.
    const noPhoto = (['elec', 'water'] as MeterKind[]).find(k =>
      (k === 'elec' ? elecReading : waterReading) && !(k === 'elec' ? elecMeterUrl : waterMeterUrl));
    if (noPhoto) {
      return showAlert(
        'Thiếu ảnh đồng hồ',
        `Đã nhập chỉ số ${noPhoto === 'elec' ? 'điện' : 'nước'} thì phải có ảnh mặt đồng hồ kèm theo để khách đối chiếu. `
        + 'Chụp ảnh đồng hồ rồi lưu lại.',
      );
    }
    // Chốt sang quyết toán = bắt đầu tính tiền, nên phải có ĐỦ chỉ số VÀ ảnh của cả hai
    // đồng hồ. Bỏ trống là mất tiền điện/nước những ngày cuối, khách đi rồi không đòi được.
    // ("Chỉ lưu biên bản" thì vẫn cho lưu dở, để quản lý ra chỗ đồng hồ chụp tiếp.)
    if (goSettlement) {
      const notClosed = (['elec', 'water'] as MeterKind[]).find(k => {
        const reading = k === 'elec' ? elecReading : waterReading;
        const url = k === 'elec' ? elecMeterUrl : waterMeterUrl;
        return !reading || !url;
      });
      if (notClosed) {
        const name = notClosed === 'elec' ? 'điện' : 'nước';
        const reading = notClosed === 'elec' ? elecReading : waterReading;
        return showAlert(
          `Chưa chốt đồng hồ ${name}`,
          reading
            ? `Đã có chỉ số ${name} nhưng thiếu ảnh mặt đồng hồ. Chụp ảnh rồi mới chốt được quyết toán.`
            : `Phải nhập chỉ số ${name} cuối kỳ và chụp ảnh mặt đồng hồ thì mới chốt được quyết toán.`,
          undefined, '📷',
        );
      }
    }
    // Cùng lý lẽ với đồng hồ: đã trừ tiền một món thì phải có ảnh món đó, không thì
    // khách chỉ nhận được con số suông và không có gì để cãi.
    const noDamagePhoto = Object.keys(damages).find(id => !(damagePhotos[id]?.length));
    if (noDamagePhoto) {
      const name = equipment.find(e => String(e.id) === noDamagePhoto)?.name ?? 'thiết bị';
      return showAlert(
        'Thiếu ảnh hư hỏng',
        `Khoản trừ cho "${name}" chưa có ảnh. Chụp ảnh chỗ hư hỏng để khách đối chiếu, `
        + 'hoặc bỏ đánh dấu hư hỏng nếu không trừ tiền món này.',
      );
    }

    setSaving(true);
    try {
      await checkoutService.saveInspection(checkoutId, {
        photos,
        roomConditionNote: note.trim() || undefined,
        electricityFinalReading: elecReading ? toNum(elecReading) : undefined,
        waterFinalReading: waterReading ? toNum(waterReading) : undefined,
        electricMeterImageUrl: elecMeterUrl || undefined,
        waterMeterImageUrl: waterMeterUrl || undefined,
        // Đơn giá quản lý gõ trên màn — với khách trả phòng ngay tháng đầu, đây là nguồn
        // DUY NHẤT để BE tính tiền điện/nước (chưa có hoá đơn kỳ trước để suy).
        electricityUnitPrice: toNum(unitPrice.elec) || undefined,
        waterUnitPrice: toNum(unitPrice.water) || undefined,
        damages: list,
      });
      if (goSettlement) navigation.replace('CheckoutSettlement', { checkoutId });
      else {
        showAlert('Đã lưu', 'Biên bản kiểm tra đã lưu. Có thể quay lại sửa trước khi gửi bảng quyết toán.');
        navigation.goBack();
      }
    } catch (e: any) {
      // 404 = máy chủ chưa có API lưu biên bản. "Not Found" trơ trọi thì không ai đoán
      // ra chuyện gì, nói thẳng cho đỡ mất công dò.
      if (e?.response?.status === 404) {
        showAlert(
          'Máy chủ chưa hỗ trợ',
          'Chức năng lưu biên bản kiểm phòng chưa có trên máy chủ đang chạy. '
          + 'Báo đội backend triển khai bản có luồng trả phòng rồi thử lại.',
          undefined, '🛠️',
        );
        return;
      }
      /**
       * BE chặn ghi biên bản ở một số trạng thái và chỉ trả đúng chuỗi tiếng Anh
       * `Invalid status for inspection` — người dùng đọc ra không biết mình vừa làm sai
       * gì hay phải làm gì tiếp.
       *
       * Gặp thật 18/08/2026: khách phản đối bảng quyết toán → hồ sơ sang DISPUTED, mà
       * `POST /checkout-requests/{id}/inspection` chỉ nhận APPROVED/INSPECTING. Tức là
       * quản lý vào sửa ĐÚNG THỨ khách đang khiếu nại (khoản trừ) thì không lưu được —
       * luồng tranh chấp không có đường quay lại. Xem BE-BUG-checkout-disputed-*.
       *
       * Bắt theo NỘI DUNG lỗi chứ không theo trạng thái: BE mở thêm trạng thái nào thì
       * nhánh này tự hết chạy, không phải sửa lại danh sách ở đây.
       */
      const rawMsg = String(e?.response?.data?.message ?? e?.message ?? '');
      if (/invalid status for inspection/i.test(rawMsg)) {
        const st = req?.status;
        showAlert(
          'Chưa lưu được biên bản',
          st === 'DISPUTED'
            ? 'Khách đã phản đối nên hồ sơ đang ở trạng thái "Khách không đồng ý". Máy chủ hiện '
              + 'CHƯA cho sửa biên bản ở trạng thái này, nên các khoản trừ vừa nhập chưa được lưu.\n\n'
              + 'Hiện chỉ gửi lại được bảng quyết toán cũ cho khách. Muốn đổi khoản trừ thì cần '
              + 'đội backend cho phép ghi biên bản khi hồ sơ bị phản đối.'
            : `Máy chủ không cho ghi biên bản khi hồ sơ đang ở trạng thái `
              + `"${checkoutMeta(st).label}". Biên bản chỉ sửa được ở bước kiểm tra phòng.`,
          undefined, '🔒',
        );
        return;
      }
      showAlert('Lỗi', readErr(e, 'Không lưu được biên bản kiểm tra.'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Biên bản kiểm tra</Text>
        <View style={{ width: 40 }} />
      </View>

      {/*
        `keyboardShouldPersistTaps="handled"` là BẮT BUỘC ở màn nhiều ô nhập.

        Mặc định của ScrollView là `"never"`: khi bàn phím đang mở, cú chạm đầu tiên vào bất
        cứ đâu chỉ để ĐÓNG bàn phím và **bị nuốt luôn** — không tới được ô bên dưới. Nên gõ
        xong chỉ số điện rồi chạm sang ô "Đơn giá" thì chỉ thấy bàn phím tắt, phải chạm lần
        hai mới vào được ô. Đúng cảm giác "không nhập tay được".

        `"handled"` cho cú chạm đi tiếp tới ô/nút, chỉ nuốt khi không có gì nhận.
      */}
      <ScrollView
        contentContainerStyle={s.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Bối cảnh */}
        <View style={s.card}>
          <Text style={s.tenantName}>{req?.tenantFullName || 'Khách thuê'}</Text>
          <Text style={s.meta}>
            {req?.propertyName || '—'}{req?.roomNumber ? ` · Phòng ${req.roomNumber}` : ' · Nguyên căn'}
          </Text>
          <Text style={s.meta}>HĐ {req?.contractCode || `#${req?.contractId}`}</Text>
        </View>

        {/* 1. Ảnh hiện trạng */}
        <Text style={s.sectionTitle}>
          1. Ảnh hiện trạng <Text style={s.required}>*</Text>
          {photos.length > 0 && (
            <Text style={s.sectionCount}>  {photos.length}/{MAX_ROOM_PHOTOS}</Text>
          )}
        </Text>
        <View style={s.card}>
          {photos.length === 0 ? (
            <Text style={s.empty}>Chưa có ảnh nào.</Text>
          ) : (
            <View style={s.photoGrid}>
              {photos.map((url, i) => (
                <View key={`${url}-${i}`} style={s.photoWrap}>
                  <Image source={{ uri: url }} style={s.photo} />
                  <TouchableOpacity
                    style={s.photoRemove}
                    onPress={() => setPhotos(p => p.filter((_, idx) => idx !== i))}
                  >
                    <Text style={s.photoRemoveText}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          <View style={s.photoActions}>
            <TouchableOpacity style={s.photoBtn} onPress={() => setCameraTarget('room')} disabled={uploading}>
              <Text style={s.photoBtnText}>📷 Chụp ảnh</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.photoBtn} onPress={pickFromGallery} disabled={uploading}>
              <Text style={s.photoBtnText}>🖼️ Chọn nhiều ảnh</Text>
            </TouchableOpacity>
          </View>
          {uploading && (
            <View style={s.uploadingRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={s.uploadingText}>
                {uploadProgress.total > 1
                  ? `Đang tải ảnh ${uploadProgress.done + 1}/${uploadProgress.total}...`
                  : 'Đang tải ảnh lên...'}
              </Text>
            </View>
          )}
        </View>

        {/* 2. Chốt điện/nước */}
        <Text style={s.sectionTitle}>2. Chỉ số điện/nước cuối kỳ</Text>
        <View style={s.card}>
          <Text style={s.helper}>
            Không chốt thì mất tiền điện/nước những ngày cuối — khách đi rồi rất khó đòi.
            Chụp ảnh mặt đồng hồ để khách không cãi được số cuối.
          </Text>
          <View style={s.readingRow}>
            {(['elec', 'water'] as MeterKind[]).map(kind => {
              const isElec = kind === 'elec';
              const info = meterInfo(kind);
              const value = isElec ? elecReading : waterReading;
              const setValue = isElec ? setElecReading : setWaterReading;
              const photo = isElec ? elecMeterUrl : waterMeterUrl;
              const status = meterStatus[kind];
              const clearPhoto = () => {
                if (isElec) setElecMeterUrl(''); else setWaterMeterUrl('');
                setMeterStatus(prev => ({ ...prev, [kind]: undefined }));
              };
              const handoverPhoto = isElec ? handover.elecPhoto : handover.waterPhoto;
              const busy = meterBusy === kind;
              const charge = utilityCharge(kind);

              return (
                <View key={kind} style={[s.meterCol, !isElec && s.meterColLast]}>
                  <Text style={s.label}>{isElec ? '⚡ Chỉ số điện' : '💧 Chỉ số nước'}</Text>

                  {/* Mốc đối chiếu — phải nói rõ lấy từ đâu, vì tiền tính theo hiệu số này */}
                  <Text style={s.meterPrev}>
                    {info.prev != null
                      ? `${info.sourceLabel}: ${info.prev.toLocaleString('vi-VN')} ${info.unit}`
                      : 'Chưa có chỉ số làm mốc'}
                  </Text>

                  {/* Chỉ số căn phải + chấm ngăn nghìn: số công tơ toàn 4–6 chữ số,
                      đọc "3.191" dễ soi hơn "3191", và thẳng hàng với đơn giá bên dưới. */}
                  <View style={[s.readingWrap, info.invalid && s.inputError]}>
                    <TextInput
                      style={s.readingInput}
                      value={groupThousands(value)}
                      onChangeText={(v) => {
                        setValue(onlyDigits(v));
                        // Sửa tay thì ghi chú "số đọc từ ảnh" hết đúng; cảnh báo về ẢNH thì giữ.
                        setMeterStatus(p => (p[kind]?.tone === 'ok' ? { ...p, [kind]: undefined } : p));
                      }}
                      keyboardType="number-pad"
                      placeholder={isElec ? '1.250' : '320'}
                      placeholderTextColor={Colors.textMuted}
                    />
                    <Text style={s.readingUnit}>{info.unit}</Text>
                  </View>

                  {/* Số đã dùng tính ngay tại chỗ để manager biết có hợp lý không */}
                  {info.invalid ? (
                    <Text style={s.meterWarn}>
                      Số cuối nhỏ hơn lúc đón khách ({info.prev?.toLocaleString('vi-VN')}) — kiểm tra lại.
                    </Text>
                  ) : info.used != null ? (
                    <Text style={s.meterUsed}>
                      Đã dùng: {info.used.toLocaleString('vi-VN')} {info.unit}
                    </Text>
                  ) : null}

                  {/* Tạm tính tiền ngay tại đây: khách đi giữa tháng, hoá đơn EVN tháng
                      này phải sang tháng sau mới có nên không thể chờ. */}
                  {info.used != null && !info.invalid && (
                    <View style={s.priceBox}>
                      <View style={s.priceRow}>
                        <Text style={s.priceLabel}>Đơn giá</Text>
                        <View style={s.priceInputWrap}>
                          <TextInput
                            style={s.priceInput}
                            value={groupThousands(unitPrice[kind])}
                            onChangeText={v => setUnitPrice(p => ({ ...p, [kind]: onlyDigits(v) }))}
                            keyboardType="number-pad"
                            placeholder="0"
                            placeholderTextColor={Colors.textMuted}
                          />
                          <Text style={s.priceUnit}>đ/{info.unit}</Text>
                        </View>
                      </View>
                      {charge ? (
                        <>
                          <View style={s.priceResultRow}>
                            <Text style={s.priceResultLabel}>Thành tiền</Text>
                            <Text style={s.priceResult}>{money(charge.amount)}</Text>
                          </View>
                          <Text style={s.priceNote}>
                            {charge.used.toLocaleString('vi-VN')} {charge.unit} × {money(charge.price)}
                            {charge.period ? ` · tạm tính theo đơn giá kỳ ${charge.period}` : ' · đơn giá bạn nhập'}
                          </Text>
                        </>
                      ) : (
                        <Text style={s.priceNote}>
                          Chưa có hoá đơn kỳ trước để lấy đơn giá — nhập tay để tính tiền kỳ cuối.
                        </Text>
                      )}
                    </View>
                  )}
                  {/* Kết quả nhận diện ảnh: nhận đúng đồng hồ / ảnh đáng ngờ / bị từ chối */}
                  {!!status && (
                    <Text style={status.tone === 'ok' ? s.meterOk : s.meterWarn}>
                      {status.tone === 'ok' ? '✓ ' : '⚠️ '}{status.text}
                    </Text>
                  )}

                  {/* Ảnh mặt đồng hồ lúc chốt */}
                  {photo ? (
                    <View style={s.meterPhotoWrap}>
                      <Image source={{ uri: photo }} style={s.meterPhoto} />
                      <TouchableOpacity style={s.photoRemove} onPress={clearPhoto}>
                        <Text style={s.photoRemoveText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {/*
                    Đã có ảnh thì nhãn phải nói việc THAY THẾ, không phải việc thêm mới.
                    Để nguyên "Chụp / Chọn" khi ảnh đã nằm ngay trên đầu nút thì người dùng
                    không biết bấm nữa sẽ ra ảnh thứ hai hay đè lên ảnh cũ — mà mỗi đồng hồ
                    chỉ giữ đúng một ảnh, bấm là đè.
                  */}
                  <View style={s.meterBtnRow}>
                    <TouchableOpacity
                      style={[s.meterBtn, busy && s.btnDisabled]}
                      onPress={() => setCameraTarget(kind)}
                      disabled={busy}
                    >
                      <Text style={s.meterBtnText}>📷 {photo ? 'Chụp lại' : 'Chụp'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.meterBtn, busy && s.btnDisabled]}
                      onPress={() => pickMeterFromGallery(kind)}
                      disabled={busy}
                    >
                      <Text style={s.meterBtnText}>🖼️ {photo ? 'Chọn ảnh khác' : 'Chọn'}</Text>
                    </TouchableOpacity>
                  </View>
                  {busy && (
                    <View style={s.uploadingRow}>
                      <ActivityIndicator size="small" color={Colors.primary} />
                      <Text style={s.uploadingText}>Đang tải & đọc số...</Text>
                    </View>
                  )}

                  {/* Ảnh đồng hồ lúc đón khách để so mặt số */}
                  {!!handoverPhoto && (
                    <View style={s.handoverBox}>
                      <Text style={s.handoverLabel}>Ảnh lúc đón khách</Text>
                      <Image source={{ uri: handoverPhoto }} style={s.handoverPhoto} />
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/*
            Cam kết về chỉ số. Hai con số này quyết định tiền điện/nước kỳ cuối trừ vào cọc,
            mà khách không có mặt lúc đọc đồng hồ — nên phải là một hành động có chủ ý, kèm
            tên người chịu trách nhiệm, chứ không phải gõ xong bấm cho xong.
          */}
          {meterReady ? (
            <TouchableOpacity
              style={[s.confirmRow, meterConfirmed && s.confirmRowOn]}
              onPress={() => setMeterConfirmed(v => !v)}
              activeOpacity={0.7}
            >
              <View style={[s.confirmBox, meterConfirmed && s.confirmBoxOn]}>
                {meterConfirmed && <Text style={s.confirmTick}>✓</Text>}
              </View>
              <Text style={[s.confirmText, meterConfirmed && s.confirmTextOn]}>
                Tôi xác nhận đã đọc đúng chỉ số trên mặt đồng hồ và ảnh kèm theo là chụp tại
                phòng này hôm nay.
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={s.confirmLocked}>
              <Text style={s.confirmLockedText}>
                Nhập đủ chỉ số điện và nước kèm ảnh mặt đồng hồ, ô xác nhận sẽ hiện ở đây.
              </Text>
            </View>
          )}
        </View>

        {/* 3. Đối chiếu thiết bị */}
        <Text style={s.sectionTitle}>3. Đối chiếu thiết bị đã bàn giao</Text>
        <View style={s.card}>
          {equipmentError ? (
            <Text style={s.empty}>
              Không tải được danh sách thiết bị của hợp đồng. Ghi khoản trừ ở mục 4 bên dưới.
            </Text>
          ) : equipment.length === 0 ? (
            <Text style={s.empty}>Hợp đồng không kèm thiết bị nào.</Text>
          ) : (
            equipment.map(item => {
              const id = String(item.id);
              const damaged = !!damages[id];
              return (
                <View key={id} style={s.eqRow}>
                  <View style={s.eqTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.eqName}>{item.name}</Text>
                      <Text style={s.eqMeta}>
                        Lúc giao: {item.condition || 'không ghi'}{item.quantity ? ` · SL ${item.quantity}` : ''}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[s.eqToggle, damaged ? s.eqToggleBad : s.eqToggleOk]}
                      onPress={() => toggleDamage(id)}
                    >
                      <Text style={[s.eqToggleText, { color: damaged ? '#DC2626' : '#059669' }]}>
                        {damaged ? '⚠️ Hư hỏng' : '✓ Nguyên vẹn'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {damaged && (
                    <View style={s.eqDamage}>
                      <TextInput
                        style={[s.input, { marginBottom: 6 }]}
                        value={damages[id].amount}
                        onChangeText={v => setDamageField(id, 'amount', v)}
                        keyboardType="number-pad"
                        placeholder="Số tiền trừ (đ)"
                        placeholderTextColor={Colors.textMuted}
                      />
                      <TextInput
                        style={s.input}
                        value={damages[id].note}
                        onChangeText={v => setDamageField(id, 'note', v)}
                        placeholder="Mô tả hư hỏng"
                        placeholderTextColor={Colors.textMuted}
                      />

                      {/* Ảnh bằng chứng — app kiểm ảnh có đúng thiết bị này không */}
                      {(damagePhotos[id]?.length ?? 0) > 0 && (
                        <View style={s.eqPhotoGrid}>
                          {damagePhotos[id].map((url, i) => (
                            <View key={`${url}-${i}`} style={s.eqPhotoWrap}>
                              <Image source={{ uri: url }} style={s.eqPhoto} />
                              <TouchableOpacity
                                style={s.photoRemove}
                                onPress={() => setDamagePhotos(prev => ({
                                  ...prev, [id]: prev[id].filter((_, idx) => idx !== i),
                                }))}
                              >
                                <Text style={s.photoRemoveText}>×</Text>
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      )}

                      <View style={s.eqPhotoActions}>
                        <TouchableOpacity
                          style={s.eqPhotoBtn}
                          onPress={() => setCameraTarget({ equipmentId: id })}
                          disabled={equipBusy === id}
                        >
                          <Text style={s.eqPhotoBtnText}>
                            {equipBusy === id ? 'Đang kiểm ảnh…' : '📷 Chụp thiết bị'}
                          </Text>
                        </TouchableOpacity>
                        {/* Đồ có tem nhãn thì cho lấy ảnh sẵn (vẫn phải qua kiểm tem).
                            Đồ không chữ không kiểm được nội dung → chỉ nhận chụp trực tiếp. */}
                        {!requireLiveCapture(item.name) && (
                          <TouchableOpacity
                            style={s.eqPhotoBtn}
                            onPress={() => pickDamagePhotoFromGallery(id)}
                            disabled={equipBusy === id}
                          >
                            <Text style={s.eqPhotoBtnText}>🖼️ Chọn từ máy</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      <Text style={[
                        s.eqPhotoHint,
                        equipStatus[id]?.tone === 'ok' && { color: '#059669' },
                        equipStatus[id]?.tone === 'warn' && { color: '#B45309' },
                      ]}>
                        {equipStatus[id]?.text
                          ?? (requireLiveCapture(item.name)
                            ? `${classifyEquipment(item.name).label} không có tem nhãn — chỉ nhận ảnh chụp trực tiếp tại phòng.`
                            : 'Chụp rõ phần tem nhãn (hãng, model) để app đối chiếu đúng thiết bị.')}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* 4. Khoản trừ khác */}
        <Text style={s.sectionTitle}>4. Khoản trừ khác</Text>
        <View style={s.card}>
          {extras.map((x, i) => (
            <View key={i} style={s.extraRow}>
              <TextInput
                style={[s.input, { flex: 2 }]}
                value={x.label}
                onChangeText={v => setExtras(list => list.map((it, idx) => idx === i ? { ...it, label: v } : it))}
                placeholder="VD: Phí vệ sinh"
                placeholderTextColor={Colors.textMuted}
              />
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={x.amount}
                onChangeText={v => setExtras(list => list.map((it, idx) => idx === i ? { ...it, amount: v } : it))}
                keyboardType="number-pad"
                placeholder="Số tiền"
                placeholderTextColor={Colors.textMuted}
              />
              <TouchableOpacity onPress={() => setExtras(list => list.filter((_, idx) => idx !== i))}>
                <Text style={s.extraRemove}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={s.addBtn} onPress={() => setExtras(list => [...list, { label: '', amount: '' }])}>
            <Text style={s.addBtnText}>+ Thêm khoản trừ</Text>
          </TouchableOpacity>
        </View>

        {/* 5. Ghi chú */}
        <Text style={s.sectionTitle}>5. Ghi chú hiện trạng</Text>
        <View style={s.card}>
          <TextInput
            style={[s.input, { height: 84, textAlignVertical: 'top' }]}
            value={note} onChangeText={setNote} multiline
            placeholder="VD: Tường phòng ngủ có vết ố, sàn còn tốt..."
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        {/* Tổng đề xuất */}
        <View style={s.totalCard}>
          <Text style={s.totalLabel}>Tổng đề xuất trừ</Text>
          <Text style={s.totalValue}>{money(damageTotal)}</Text>
        </View>
        <Text style={s.totalNote}>
          Đã gồm tiền điện/nước kỳ cuối. Số cuối cùng do hệ thống tính ở bước quyết toán
          (cộng thêm hoá đơn khách còn nợ, trừ tiền phòng những ngày không ở).
        </Text>

        {/* Nói TRƯỚC còn thiếu gì, thay vì để bấm rồi mới báo từng lỗi một. */}
        {blockers.length > 0 && (
          <View style={s.blockerBox}>
            <Text style={s.blockerTitle}>
              Còn {blockers.length} việc chưa xong để chốt quyết toán
            </Text>
            {blockers.map((b, i) => (
              <Text key={i} style={s.blockerItem}>• {b}</Text>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[s.primaryBtn, (saving || blockers.length > 0) && s.btnDisabled]}
          onPress={() => save(true)}
          disabled={saving || uploading || blockers.length > 0}
        >
          <Text style={s.primaryBtnText}>{saving ? 'Đang lưu...' : 'Lưu & sang quyết toán →'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.ghostBtn, saving && s.btnDisabled]}
          onPress={() => save(false)}
          disabled={saving || uploading}
        >
          <Text style={s.ghostBtnText}>Chỉ lưu biên bản</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Camera trong app: chụp → xem lại → "Dùng ảnh này" mới tải lên.
          Ảnh hiện trạng cho chụp liên tiếp nhiều góc; ảnh đồng hồ chỉ 1 tấm rồi đóng. */}
      <CameraCaptureModal
        visible={cameraTarget !== null}
        multi={cameraTarget === 'room' || typeof cameraTarget === 'object'}
        onCapture={handleCameraCapture}
        onClose={() => setCameraTarget(null)}
        onUseGalleryInstead={galleryFallback()}
      />
    </SafeAreaView>
  );
};

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: { padding: Spacing.sm },
  backArrow: { fontSize: 18, fontWeight: '600', color: Colors.primary },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },

  body: { padding: Spacing.lg },
  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base,
    borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md, ...Shadow.sm,
  },
  tenantName: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  meta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },

  sectionTitle: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.sm },
  required: { color: Colors.error },
  sectionCount: { fontSize: 12, fontWeight: '600', color: Colors.textMuted },
  helper: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginBottom: Spacing.sm },
  label: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
  empty: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.sm },
  input: {
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    fontSize: 14, color: Colors.textPrimary,
  },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  photoWrap: { position: 'relative' },
  photo: { width: 84, height: 84, borderRadius: BorderRadius.md, backgroundColor: Colors.divider },
  photoRemove: {
    position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: Colors.error, alignItems: 'center', justifyContent: 'center',
  },
  photoRemoveText: { color: Colors.white, fontSize: 15, fontWeight: '800', lineHeight: 17 },
  photoActions: { flexDirection: 'row', gap: Spacing.sm },
  photoBtn: {
    flex: 1, backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm, alignItems: 'center',
  },
  photoBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.sm },
  uploadingText: { fontSize: 12, color: Colors.textMuted },

  // Mỗi đồng hồ một khối RIÊNG, xếp dọc. Trước đây ép 2 cột cạnh nhau nên trên điện
  // thoại mỗi cột chỉ còn ~140px — ô đơn giá, nút chụp và ảnh chen nhau vỡ hết.
  readingRow: { gap: Spacing.lg },
  meterCol: {
    paddingBottom: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  meterColLast: { borderBottomWidth: 0, paddingBottom: 0 },
  // ── Chỉ số + ảnh đồng hồ ──
  meterPrev: { fontSize: 11, color: Colors.textMuted, marginBottom: 6 },
  inputError: { borderColor: Colors.error },
  readingWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, height: 44,
  },
  readingInput: {
    flex: 1, paddingVertical: 0,
    fontSize: 18, fontWeight: '800', color: Colors.textPrimary, textAlign: 'right',
  },
  readingUnit: { fontSize: 12, color: Colors.textSecondary, fontWeight: '700' },
  meterUsed: { fontSize: 12, fontWeight: '700', color: Colors.primary, marginTop: 6 },
  meterWarn: { fontSize: 11, fontWeight: '700', color: Colors.error, marginTop: 6, lineHeight: 16 },
  meterOk: { fontSize: 11, fontWeight: '600', color: Colors.success, marginTop: 6, lineHeight: 16 },
  meterPhotoWrap: { position: 'relative', marginTop: Spacing.sm, alignSelf: 'flex-start' },
  meterPhoto: { width: 96, height: 96, borderRadius: BorderRadius.md, backgroundColor: Colors.divider },
  meterBtnRow: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.sm },
  meterBtn: {
    flex: 1, backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm, alignItems: 'center',
  },
  meterBtnText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  handoverBox: {
    marginTop: Spacing.sm, backgroundColor: Colors.background,
    borderRadius: BorderRadius.md, padding: Spacing.sm, gap: 4,
  },
  handoverLabel: { fontSize: 10, fontWeight: '700', color: Colors.textMuted },
  handoverPhoto: { width: 72, height: 72, borderRadius: BorderRadius.sm, backgroundColor: Colors.divider },

  eqRow: { borderBottomWidth: 1, borderBottomColor: Colors.divider, paddingVertical: Spacing.sm },
  eqTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  eqName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  eqMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  eqToggle: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full, borderWidth: 1 },
  eqToggleOk: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  eqToggleBad: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  eqToggleText: { fontSize: 12, fontWeight: '700' },
  priceBox: {
    marginTop: Spacing.sm, padding: Spacing.sm,
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.md,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  priceLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '700' },
  // Ô nhập + đơn vị nằm chung một khung, số căn phải sát ngay chữ "đ/kWh" cho dễ đọc.
  priceInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4,
    height: 34, paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.white, borderRadius: BorderRadius.md,
    borderWidth: 1, borderColor: Colors.border,
  },
  priceInput: {
    flex: 1, paddingVertical: 0,
    fontSize: 14, fontWeight: '800', color: Colors.textPrimary, textAlign: 'right',
  },
  priceUnit: { fontSize: 11, color: Colors.textSecondary, fontWeight: '700' },
  priceResultRow: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginTop: Spacing.sm, paddingTop: 6, borderTopWidth: 1, borderTopColor: Colors.primary + '25',
  },
  priceResultLabel: { fontSize: 12, color: Colors.textSecondary, fontWeight: '700' },
  priceResult: { fontSize: 16, color: Colors.primary, fontWeight: '900' },
  priceNote: { fontSize: 11, color: Colors.textSecondary, marginTop: 3, lineHeight: 15 },

  eqDamage: { marginTop: Spacing.sm },
  eqPhotoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  eqPhotoWrap: { position: 'relative' },
  eqPhoto: { width: 72, height: 72, borderRadius: BorderRadius.md, backgroundColor: Colors.divider },
  eqPhotoActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  eqPhotoBtn: {
    flex: 1, height: 34, alignItems: 'center', justifyContent: 'center',
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.primary + '50',
    backgroundColor: Colors.white,
  },
  eqPhotoBtnText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  eqPhotoHint: { fontSize: 11, color: Colors.textSecondary, marginTop: 6, lineHeight: 16 },

  extraRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  extraRemove: { fontSize: 22, color: Colors.error, fontWeight: '800', paddingHorizontal: 4 },
  addBtn: { paddingVertical: Spacing.sm, alignItems: 'center' },
  addBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  totalCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base,
    borderWidth: 1, borderColor: Colors.border,
  },
  totalLabel: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  totalValue: { fontSize: 18, fontWeight: '800', color: Colors.error },
  totalNote: { fontSize: 11, color: Colors.textMuted, marginTop: 6, marginBottom: Spacing.lg, lineHeight: 16 },

  primaryBtn: { backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, paddingVertical: Spacing.md, alignItems: 'center' },
  primaryBtnText: { fontSize: 14, fontWeight: '800', color: Colors.white },
  ghostBtn: { paddingVertical: Spacing.md, alignItems: 'center', marginTop: 4 },
  ghostBtnText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  btnDisabled: { opacity: 0.45 },

  // ── Cam kết chỉ số (mục 2) ──────────────────────────────────────────────
  confirmRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    marginTop: Spacing.md, padding: Spacing.md,
    backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border,
  },
  confirmRowOn: { backgroundColor: Colors.successLight, borderColor: Colors.success },
  confirmBox: {
    width: 20, height: 20, borderRadius: 5, marginTop: 1,
    borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmBoxOn: { backgroundColor: Colors.success, borderColor: Colors.success },
  confirmTick: { fontSize: 12, fontWeight: '900', color: Colors.white },
  confirmText: { flex: 1, fontSize: 12, lineHeight: 17, color: Colors.textSecondary },
  confirmTextOn: { color: '#065F46', fontWeight: '600' },
  /** Chỗ giữ sẵn cho ô tick — nói rõ cần gì để nó hiện, thay vì im lặng không có gì. */
  confirmLocked: {
    marginTop: Spacing.md, padding: Spacing.md,
    backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed',
  },
  confirmLockedText: { fontSize: 12, lineHeight: 17, color: Colors.textMuted },

  // ── Việc còn thiếu trước khi chốt quyết toán ────────────────────────────
  blockerBox: {
    backgroundColor: Colors.warningLight, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: '#FCD34D',
  },
  blockerTitle: { fontSize: 13, fontWeight: '800', color: '#92400E', marginBottom: 6 },
  blockerItem: { fontSize: 12, color: '#92400E', lineHeight: 18 },
});
