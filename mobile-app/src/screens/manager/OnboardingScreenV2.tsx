import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFocusEffect } from '@react-navigation/native'
import * as ImagePicker from 'expo-image-picker'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { SafeAreaView } from 'react-native-safe-area-context'
import { WebView } from 'react-native-webview'
import { CameraCaptureModal } from '../../components/common/CameraCaptureModal'
import { MeterOverrideModal } from '../../components/common/MeterOverrideModal'
import type { MeterOverrideKind } from '@/services/manager/meterOverrideService'
import { DatePickerField } from '../../components/common/DatePickerField'
import { BorderRadius, Colors, Shadow, Spacing, PAY_SUCCESS_URL, PAY_CANCEL_URL } from '../../constants'
import { uploadImageToCloudinary } from '@/services/core/cloudinary'
import {
  ApiProperty,
  ApiRoom,
  realPropertyService,
} from '@/services/manager/propertyApi'
import {
  DEFAULT_DIGIT_CONFIG,
  splitMeterReading,
  showAlert,
  validateMeterPhoto,
  validateRoomPhoto,
  type MeterDigitConfig,
} from '@/utils';
import { visionService, type VisionLabel } from '@/services/shared/visionService';
import {
  ContractAddedEquipmentInput,
  ContractAvailableEquipmentItem,
  defaultTenantUsername,
  OnboardTenantRequest,
  realTenantService,
  TenantContractResponse,} from '@/services/tenant/tenantService'

type RentalMode = 'room' | 'whole_house'

interface HouseholdMemberForm {
  id: string
  name: string
  relation: string
  phone: string
  dateOfBirth: string // dd/MM/yyyy
  cccd: string
}


const MODE_STEP = 'Chọn loại'
const HANDOVER_STEP = 'Bàn giao thiết bị'
const ROOM_STEPS = [
  MODE_STEP,
  'Chọn phòng',
  'Khách thuê',
  'Thành viên ở cùng',
  'Điện nước',
  'Hiện trạng phòng',
  HANDOVER_STEP,
  'Tạo hợp đồng',
  'Thanh toán cọc',
  'Xác nhận',
]
const WHOLE_HOUSE_STEPS = [
  MODE_STEP,
  'Chọn nhà nguyên căn',
  'Khách thuê chính',
  'Thành viên ở cùng',
  'Điện nước',
  'Hiện trạng nhà',
  HANDOVER_STEP,
  'Tạo hợp đồng',
  'Thanh toán cọc',
  'Xác nhận',
]

// Danh mục thiết bị cho phần "Khách lắp thêm" (đồng bộ với EquipmentScreen).
const HANDOVER_CATEGORIES = ['Điện lạnh', 'Điện nước', 'Nội thất', 'Thiết bị', 'Hạ tầng']

// Nhãn tình trạng thiết bị (contract-available-equipments trả `condition`).
const EQUIPMENT_CONDITION_LABEL: Record<string, string> = {
  NEW: 'Mới', GOOD: 'Tốt', DAMAGED: 'Hư hại', BROKEN: 'Hỏng',
}

// 1 thiết bị khách yêu cầu lắp thêm (chủ đầu tư mua → tài sản nhà).
interface AddedEquipmentForm {
  tempId: string
  name: string
  category: string
  quantity: number
  cost: number
}

const rentalModeOptions: Array<{
  mode: RentalMode
  title: string
  description: string
  icon: string
}> = [
  {
    mode: 'room',
    title: 'Theo phòng',
    description: 'Chọn toà nhà và phòng trống để thêm khách thuê.',
    icon: '🚪',
  },
  {
    mode: 'whole_house',
    title: 'Thuê nguyên căn',
    description: 'Chọn nhà nguyên căn và thêm khách thuê chính.',
    icon: '🏠',
  },
]

// ===== Adapter dữ liệu backend -> UI =====
type UiProperty = {
  id: string
  name: string
  address: string
  propertyType: 'MULTI_ROOM' | 'WHOLE_HOUSE'
  available: number
  monthlyRent: number
}
type UiRoom = {
  id: string
  code: string
  area: number
  rentPrice: number
  maxOccupants: number
  /** Số chữ số mặt đồng hồ của phòng — dùng để cắt phần lẻ, xem meterDigitConfig. */
  elecDigits: MeterDigitConfig
  waterDigits: MeterDigitConfig
}

const mapProperty = (p: ApiProperty): UiProperty => ({
  id: String(p.id),
  name: p.propertyName,
  address: p.fullAddress || p.shortAddress || '',
  propertyType: p.wholeHouse ? 'WHOLE_HOUSE' : 'MULTI_ROOM',
  available: p.totalRooms ?? 0,
  monthlyRent: p.price ?? 0,
})
const mapRoom = (r: ApiRoom): UiRoom => ({
  id: String(r.id),
  code: r.roomNumber,
  area: r.area ?? 0,
  rentPrice: r.price ?? 0,
  maxOccupants: r.maxOccupants ?? 0,
  // BE cũ chưa trả 4 field này -> rơi về mặc định của DEFAULT_DIGIT_CONFIG.
  elecDigits: {
    integerDigits: r.elecIntegerDigits ?? DEFAULT_DIGIT_CONFIG.elec.integerDigits,
    decimalDigits: r.elecDecimalDigits ?? DEFAULT_DIGIT_CONFIG.elec.decimalDigits,
  },
  waterDigits: {
    integerDigits: r.waterIntegerDigits ?? DEFAULT_DIGIT_CONFIG.water.integerDigits,
    decimalDigits: r.waterDecimalDigits ?? DEFAULT_DIGIT_CONFIG.water.decimalDigits,
  },
})

const toIsoDate = (ddmmyyyy: string): string => {
  const [d, m, y] = (ddmmyyyy || '').split('/')
  if (!d || !m || !y) return new Date().toISOString().slice(0, 10)
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}
// Parse dd/MM/yyyy -> Date (đầu ngày), null nếu không hợp lệ
const parseDmy = (s: string): Date | null => {
  const [d, m, y] = (s || '').split('/').map(Number)
  if (!d || !m || !y) return null
  const dt = new Date(y, m - 1, d)
  return isNaN(dt.getTime()) ? null : dt
}
const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate())
// Thời hạn cho thuê tối đa (năm)
const MAX_LEASE_YEARS = 5
const readErr = (err: any, fallback: string): string => {
  const d = err?.response?.data
  if (d?.fieldErrors) return Object.values(d.fieldErrors).join(', ')
  return d?.error || d?.message || err?.message || fallback
}

// Định dạng tiền VNĐ
const onlyDigits = (s: string) => String(s).replace(/[^\d]/g, '')
const parseNum = (s: string) => Number(onlyDigits(s)) || 0
const formatVnd = (v: string | number) => {
  const n = typeof v === 'number' ? v : parseNum(v)
  return n ? n.toLocaleString('vi-VN') : ''
}

// Validate định dạng SĐT VN (10 số, đầu 0) và CCCD (12 số)
const isValidVnPhone = (s: string) => /^0\d{9}$/.test(onlyDigits(s))
const isValidCccd = (s: string) => /^\d{12}$/.test(onlyDigits(s))

// Khoá lưu nháp onboarding — dict LƯU THEO PHÒNG/CĂN để đón khách thứ 2 không đè
// mất nháp khách thứ 1 đang dở (key cũ 'onboarding_draft_v2' chỉ có 1 slot).
// Nháp chưa chọn phòng nằm tạm ở slot '_new'.
const DRAFT_KEY = 'onboarding_drafts_v3'
const LEGACY_DRAFT_KEY = 'onboarding_draft_v2'
type DraftSlots = Record<string, any>
const slotOf = (d: {
  rentalMode?: string | null
  selectedWholeHouseId?: unknown
  selectedBuildingId?: unknown
  selectedRoomId?: unknown
}): string =>
  d.rentalMode === 'whole_house'
    ? `wh:${d.selectedWholeHouseId ?? 'new'}`
    : d.rentalMode === 'room'
      ? `room:${d.selectedBuildingId ?? 'new'}:${d.selectedRoomId ?? 'new'}`
      : '_new'
const draftLabel = (d: any): string => {
  const who = d?.tenantInfo?.fullName?.trim() || d?.tenantInfo?.phone || 'khách chưa nhập tên'
  const where =
    d?.rentalMode === 'whole_house' ? 'nguyên căn'
      : d?.selectedRoomId ? `phòng #${d.selectedRoomId}`
      : 'chưa chọn phòng'
  return `${who} · ${where}`
}
const DRAFT_TTL_MS = 3 * 24 * 3600 * 1000 // nháp quá 3 ngày tự dọn

// Cooldown gửi lại OTP (giây)
const OTP_RESEND_COOLDOWN = 30

// OnboardingScreenV2 — bản đón khách khớp đầy đủ backend (xem kế hoạch tiếp khách):
// nối đúng luồng send-otp, fallback username = t{phone}, thu cọc 100% chuyển khoản PayOS,
// chặn submit khi role lookup không hợp lệ. Màn cũ OnboardingScreen được giữ làm dự phòng.
export const OnboardingScreenV2: React.FC<any> = ({ navigation }) => {
  const [step, setStep] = useState(0)
  const [rentalMode, setRentalMode] = useState<RentalMode | null>(null)

  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(
    null,
  )
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [selectedWholeHouseId, setSelectedWholeHouseId] = useState<
    string | null
  >(null)
  // Từ khoá tìm nhà ở bước chọn (lọc theo tên + địa chỉ)
  const [houseSearch, setHouseSearch] = useState('')

  const [tenantInfo, setTenantInfo] = useState({
    fullName: '',
    phone: '',
    cccd: '',
    startDate: new Date().toLocaleDateString('en-GB'), // dd/MM/yyyy — ngày hợp đồng hiệu lực (= hôm nay)
    monthlyRent: '', // chỉ chứa số
  })
  const [endDate, setEndDate] = useState('') // dd/MM/yyyy — ngày kết thúc hợp đồng
  const [depositMonths, setDepositMonths] = useState(1)
  const [householdMembers, setHouseholdMembers] = useState<
    HouseholdMemberForm[]
  >([])
  const [lookupFound, setLookupFound] = useState(false)
  const [lookupChecked, setLookupChecked] = useState(false) // đã lookup xong cho SĐT hợp lệ
  const [lookupRole, setLookupRole] = useState<string | null>(null) // role tài khoản đã có (BE trả về)

  // Lưu nháp: chỉ bắt đầu lưu sau khi đã load xong draft; đánh dấu hoàn tất để bỏ qua cảnh báo thoát
  const draftLoadedRef = useRef(false)
  const completedRef = useRef(false)

  // Điện nước + ảnh đồng hồ.
  // `meters` = phần NGUYÊN, `metersDec` = phần THẬP PHÂN (các chữ số thường in nền đỏ).
  // Tách làm hai vì mặt công tơ có hai vùng riêng và người nhập cần sửa được từng vùng;
  // gộp một ô thì không phân biệt được 3081,5 với 30815 — sai gấp 10 lần tiền điện.
  const [meters, setMeters] = useState({ elec: '', water: '' })
  const [metersDec, setMetersDec] = useState({ elec: '', water: '' })
  const [elecMeterUrl, setElecMeterUrl] = useState('')
  const [waterMeterUrl, setWaterMeterUrl] = useState('')
  const [ocrLoading, setOcrLoading] = useState<'elec' | 'water' | null>(null)
  // Ngày giờ chụp (client-side, lúc ảnh upload xong) — làm bằng chứng đối soát
  // sau này, hiện ngay trên UI cạnh ảnh/số đọc (feedback thầy 19/07).
  const [meterCapturedAt, setMeterCapturedAt] = useState<{ elec?: string; water?: string }>({})
  // Nút "Chọn ảnh" từ thư viện CHỈ hiện sau khi chụp bằng camera bị lỗi (mất quyền/không
  // dùng được) — feedback demo: tránh manager tiện tay chọn ảnh cũ thay vì chụp tại chỗ.
  const [gallerySOS, setGallerySOS] = useState<{ elec?: boolean; water?: boolean }>({})
  // Mã admin cấp cho phép nhập chỉ số KHI KHÔNG CHỤP ĐƯỢC ẢNH (mentor ý 5).
  // BE chỉ tiêu thụ token khi request KHÔNG kèm ảnh đồng hồ tương ứng, và ghi vết
  // vào bảng audit — xem services/manager/meterOverrideService.ts.
  const [meterOverride, setMeterOverride] = useState<{
    elec?: { token: string; reason: string }
    water?: { token: string; reason: string }
  }>({})
  const [overrideTarget, setOverrideTarget] = useState<MeterOverrideKind | null>(null)
  // true khi manager tự gõ/sửa số (khác với OCR tự điền) — bắt buộc tick xác nhận
  // chịu trách nhiệm trước khi được lưu (feedback demo).
  const [manualEdited, setManualEdited] = useState<{ elec?: boolean; water?: boolean }>({})
  const [manualConfirmed, setManualConfirmed] = useState<{ elec?: boolean; water?: boolean }>({})

  // Ảnh hiện trạng (Cloudinary URLs) — conditionPhotosCapturedAt cùng thứ tự/độ dài với
  // conditionPhotos (index tương ứng), gửi lên BE dạng roomConditionPhotos (bằng chứng
  // ngày giờ chụp, FE-onboard-photo-timestamp.md).
  const [conditionPhotos, setConditionPhotos] = useState<string[]>([])
  const [conditionPhotosCapturedAt, setConditionPhotosCapturedAt] = useState<string[]>([])
  const [photoUploading, setPhotoUploading] = useState(false)
  // Camera in-app (web không mở được camera qua ImagePicker) + xem ảnh phóng to
  const [cameraTarget, setCameraTarget] = useState<
    'elec' | 'water' | 'condition' | null
  >(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewCapturedAt, setPreviewCapturedAt] = useState<string | undefined>(undefined)
  const [inspectionNotes, setInspectionNotes] = useState('')

  // Bàn giao thiết bị — nội thất có sẵn CHỈ hiển thị read-only: BE tự gắn toàn bộ
  // thiết bị ACTIVE trong phạm vi HĐ, không còn tick chọn/bỏ từng món
  // (FE-contract-equipment-auto.md 2026-07). Lắp thêm vẫn thao tác được.
  const [availableEquipments, setAvailableEquipments] = useState<ContractAvailableEquipmentItem[]>([])
  const [loadingEquipments, setLoadingEquipments] = useState(false)
  const [addedEquipments, setAddedEquipments] = useState<AddedEquipmentForm[]>([])
  const [showAddEquipModal, setShowAddEquipModal] = useState(false)

  // Chế độ giá khi tạo HĐ: 'agreed' = đã thống nhất với Host (kích hoạt ngay) ·
  // 'approval' = gửi Host duyệt giá (tạm dừng, chưa thu cọc).
  const [priceMode, setPriceMode] = useState<'agreed' | 'approval'>('agreed')

  const [otp, setOtp] = useState('')
  const [otpSending, setOtpSending] = useState(false)
  const [otpCooldown, setOtpCooldown] = useState(0) // giây còn lại trước khi cho gửi lại
  const otpSentForRef = useRef<number | null>(null) // contractId đã auto-gửi OTP (tránh gửi lặp)

  // Dữ liệu thật
  const [properties, setProperties] = useState<UiProperty[]>([])
  const [availableRooms, setAvailableRooms] = useState<UiRoom[]>([])

  // Hợp đồng + thanh toán
  const [contract, setContract] = useState<TenantContractResponse | null>(null)
  const [creating, setCreating] = useState(false)
  const [showWebView, setShowWebView] = useState(false)
  const [paid, setPaid] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // Tải lại danh sách BĐS mỗi khi màn hình được focus -> sau khi đón khách xong
  // (căn nguyên căn chuyển RENTED / phòng vừa cho thuê) thì danh sách luôn cập nhật.
  useFocusEffect(
    useCallback(() => {
      // Chỉ lấy BĐS còn cho thuê được (BE đã lọc: nguyên căn chưa có khách / chia phòng còn phòng trống)
      realPropertyService
        .getRentableProperties()
        .then((list) =>
          setProperties(
            list.filter((p) => p.status === 'ACTIVE').map(mapProperty),
          ),
        )
        .catch((err) =>
          showAlert(
            'Lỗi tải dữ liệu',
            readErr(err, 'Không tải được danh sách bất động sản.'),
          ),
        )
    }, []),
  )

  useEffect(() => {
    if (!selectedBuildingId) {
      setAvailableRooms([])
      return
    }
    realPropertyService
      .getRooms(Number(selectedBuildingId))
      .then((rooms) =>
        setAvailableRooms(
          rooms.filter((r) => r.status === 'AVAILABLE').map(mapRoom),
        ),
      )
      .catch(() => setAvailableRooms([]))
  }, [selectedBuildingId])

  const roomProperties = properties.filter(
    (p) => p.propertyType === 'MULTI_ROOM',
  )
  const wholeHouseProperties = properties.filter(
    (p) => p.propertyType === 'WHOLE_HOUSE',
  )
  const selectedBuilding = roomProperties.find(
    (p) => p.id === selectedBuildingId,
  )
  const selectedRoom = availableRooms.find((r) => r.id === selectedRoomId)
  const selectedWholeHouse = wholeHouseProperties.find(
    (p) => p.id === selectedWholeHouseId,
  )
  /**
   * Số chữ số mặt đồng hồ đang áp dụng. Nhà nguyên căn không có bản ghi `room` nên
   * BE chưa có chỗ cấu hình — rơi về mặc định (điện 5+1, nước 5+3).
   */
  const meterDigitConfig = (kind: 'elec' | 'water'): MeterDigitConfig => {
    if (rentalMode === 'room' && selectedRoom) {
      return kind === 'elec' ? selectedRoom.elecDigits : selectedRoom.waterDigits
    }
    return DEFAULT_DIGIT_CONFIG[kind]
  }
  // Lọc nhà theo từ khoá tìm kiếm (tên hoặc địa chỉ, không phân biệt hoa thường)
  const matchesHouseSearch = (p: UiProperty) => {
    const kw = houseSearch.trim().toLowerCase()
    if (!kw) return true
    return (
      p.name.toLowerCase().includes(kw) ||
      p.address.toLowerCase().includes(kw)
    )
  }
  const filteredRoomProperties = roomProperties.filter(matchesHouseSearch)
  const filteredWholeHouseProperties =
    wholeHouseProperties.filter(matchesHouseSearch)

  // Prefill giá thuê theo phòng/nhà đã chọn
  useEffect(() => {
    const price =
      rentalMode === 'whole_house'
        ? selectedWholeHouse?.monthlyRent
        : selectedRoom?.rentPrice
    if (price)
      setTenantInfo((prev) => ({ ...prev, monthlyRent: String(price) }))
  }, [selectedRoomId, selectedWholeHouseId, rentalMode]) // eslint-disable-line

  // Tự tra cứu khách thuê đã có theo SĐT -> tự điền tên + CCCD
  useEffect(() => {
    const phone = tenantInfo.phone.trim()
    if (phone.length < 9) {
      setLookupFound(false)
      setLookupChecked(false)
      setLookupRole(null)
      return
    }
    const t = setTimeout(async () => {
      try {
        const r = await realTenantService.lookupByPhone(phone)
        if (r.exists) {
          setLookupFound(true)
          setLookupRole(r.role ?? null)
          setTenantInfo((prev) => ({
            ...prev,
            fullName: r.fullName || prev.fullName,
            cccd: r.cccd || prev.cccd,
          }))
        } else {
          setLookupFound(false)
          setLookupRole(null)
        }
      } catch {
        setLookupFound(false)
        setLookupRole(null)
      } finally {
        setLookupChecked(true)
      }
    }, 600)
    return () => clearTimeout(t)
  }, [tenantInfo.phone])

  const rentValue = parseNum(tenantInfo.monthlyRent)
  const depositValue = rentValue * depositMonths
  // Số khách phải chuyển lúc đón khách = CHỈ TIỀN CỌC, từ BE commit 92c87d8 (10/08/2026).
  // Trước đó QR gộp cả tiền nhà tháng đầu; giờ tiền nhà tách thành hoá đơn RENT riêng
  // (cycleType FIRST, tính theo ngày ở) phát sau khi HĐ ACTIVE, khách trả trên app.
  // Đây chỉ là số DỰ PHÒNG khi BE chưa trả `initialPaymentAmount` — cộng thêm
  // `rentValue` vào đây là đọc thừa nguyên một tháng tiền nhà cho khách.
  const totalDueValue = depositValue

  // Ngày hợp đồng hiệu lực = hôm nay (khoá cứng). Ngày kết thúc: sau hôm nay, tối đa MAX_LEASE_YEARS năm.
  const todayStr = new Date().toLocaleDateString('en-GB') // dd/MM/yyyy
  const minEndDate = (() => {
    const t = startOfDay(new Date())
    t.setDate(t.getDate() + 1)
    return t
  })()
  const maxEndDate = (() => {
    const t = startOfDay(new Date())
    t.setFullYear(t.getFullYear() + MAX_LEASE_YEARS)
    return t
  })()

  // Giới hạn số người ở cùng (chỉ áp dụng thuê theo phòng, dựa trên maxOccupants của phòng)
  const occupantLimit =
    rentalMode === 'room' ? (selectedRoom?.maxOccupants ?? 0) : 0 // 0 = không giới hạn
  const currentOccupants = 1 + householdMembers.length // khách chính + thành viên
  const canAddMember =
    occupantLimit === 0 ? true : currentOccupants < occupantLimit

  const steps = rentalMode === 'whole_house' ? WHOLE_HOUSE_STEPS : ROOM_STEPS
  const currentLabel = steps[step]
  const progress = ((step + 1) / steps.length) * 100

  // Case 2 đã gửi Host duyệt giá (HĐ đã tạo, đang chờ) -> hiện màn "chờ duyệt".
  const submittedForApproval = priceMode === 'approval' && !!contract

  // Poll trạng thái thanh toán khi ở bước "Thanh toán cọc"
  useEffect(() => {
    if (currentLabel !== 'Thanh toán cọc' || !contract || paid) return
    const timer = setInterval(async () => {
      try {
        // chủ động hỏi PayOS (local không có webhook) -> đồng bộ trạng thái
        const c = await realTenantService.checkPayment(contract.id)
        if (c.paymentStatus === 'PAID') {
          setPaid(true)
          setShowWebView(false)
        }
      } catch {
        /* ignore */
      }
    }, 5000)
    return () => clearInterval(timer)
  }, [currentLabel, contract, paid])

  // Tự gửi OTP đúng 1 lần khi vào bước "Xác nhận" (luồng BE: send-otp -> confirm).
  useEffect(() => {
    if (currentLabel !== 'Xác nhận' || !contract) return
    if (otpSentForRef.current === contract.id) return
    sendOtp(false)
  }, [currentLabel, contract])

  // Đếm ngược cooldown nút "Gửi lại OTP".
  useEffect(() => {
    if (otpCooldown <= 0) return
    const t = setInterval(() => setOtpCooldown((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [otpCooldown])

  // Tải danh sách nội thất khi vào bước "Bàn giao thiết bị" — đúng phạm vi HĐ (phòng +
  // khu vực chung, hoặc cả căn nếu nguyên căn). Chỉ để hiển thị đối chiếu: BE tự gắn
  // toàn bộ danh sách ACTIVE này vào HĐ (FE-contract-equipment-auto.md).
  useEffect(() => {
    if (currentLabel !== HANDOVER_STEP) return
    const roomId = rentalMode === 'room' ? Number(selectedRoomId) : null
    const propertyId =
      rentalMode === 'whole_house' ? Number(selectedWholeHouseId) : Number(selectedBuildingId)
    if (!propertyId || (rentalMode === 'room' && !roomId)) return
    let active = true
    setLoadingEquipments(true)
    realTenantService
      .getContractAvailableEquipments(propertyId, roomId)
      .then((list) => {
        if (active) setAvailableEquipments(list)
      })
      .catch(() => active && setAvailableEquipments([]))
      .finally(() => active && setLoadingEquipments(false))
    return () => {
      active = false
    }
  }, [currentLabel, rentalMode, selectedRoomId, selectedWholeHouseId, selectedBuildingId])

  // ===== Lưu nháp (draft) =====
  // Có tiến trình đáng kể để cảnh báo khi thoát / để lưu nháp
  const hasMeaningfulProgress =
    !!rentalMode &&
    (!!tenantInfo.fullName.trim() ||
      !!tenantInfo.phone.trim() ||
      !!selectedRoomId ||
      !!selectedWholeHouseId ||
      !!contract)

  const restoreDraft = (d: any) => {
    setStep(d.step ?? 0)
    setRentalMode(d.rentalMode ?? null)
    setSelectedBuildingId(d.selectedBuildingId ?? null)
    setSelectedRoomId(d.selectedRoomId ?? null)
    setSelectedWholeHouseId(d.selectedWholeHouseId ?? null)
    if (d.tenantInfo) setTenantInfo(d.tenantInfo)
    setEndDate(d.endDate ?? '')
    setDepositMonths(d.depositMonths ?? 1)
    setHouseholdMembers(d.householdMembers ?? [])
    setMeters(d.meters ?? { elec: '', water: '' })
    setElecMeterUrl(d.elecMeterUrl ?? '')
    setWaterMeterUrl(d.waterMeterUrl ?? '')
    setMeterCapturedAt(d.meterCapturedAt ?? {})
    setConditionPhotos(d.conditionPhotos ?? [])
    setConditionPhotosCapturedAt(d.conditionPhotosCapturedAt ?? [])
    setInspectionNotes(d.inspectionNotes ?? '')
    setAddedEquipments(d.addedEquipments ?? [])
    setPriceMode(d.priceMode ?? 'agreed')
    setContract(d.contract ?? null)
    setPaid(d.paid ?? false)
  }

  // Load nháp 1 lần khi mở màn hình -> hỏi tiếp tục / làm mới
  useEffect(() => {
    ;(async () => {
      try {
        const [legacyRaw, raw] = await Promise.all([
          AsyncStorage.getItem(LEGACY_DRAFT_KEY),
          AsyncStorage.getItem(DRAFT_KEY),
        ])
        const slots: DraftSlots = raw ? JSON.parse(raw) : {}
        // Migrate nháp đơn từ key cũ (1 lần)
        if (legacyRaw) {
          try {
            const legacy = JSON.parse(legacyRaw)
            if (legacy?.rentalMode) slots[slotOf(legacy)] = { ...legacy, savedAt: Date.now() }
          } catch { /* ignore */ }
          AsyncStorage.removeItem(LEGACY_DRAFT_KEY).catch(() => {})
        }
        // Dọn nháp quá hạn
        const now = Date.now()
        for (const k of Object.keys(slots)) {
          if (now - (slots[k]?.savedAt ?? 0) > DRAFT_TTL_MS) delete slots[k]
        }
        AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(slots)).catch(() => {})

        const entries = Object.entries(slots).filter(([, d]) => d?.rentalMode)
        if (entries.length > 0) {
          // Hỏi nháp MỚI NHẤT, hiện rõ của ai/phòng nào; các nháp khác vẫn giữ,
          // sẽ được hỏi lại lần mở sau (khi nháp này xong/xóa).
          entries.sort((a, b) => (b[1]?.savedAt ?? 0) - (a[1]?.savedAt ?? 0))
          const [key, d] = entries[0]
          const others = entries.length - 1
          await new Promise<void>((resolve) => {
            showAlert(
              'Tiếp tục đón khách?',
              `Phiên đang dở: ${draftLabel(d)}.${others > 0 ? `\nCòn ${others} nháp khác đang chờ.` : ''}`,
              [
                {
                  text: 'Xóa nháp này',
                  style: 'destructive',
                  onPress: () => {
                    delete slots[key]
                    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(slots)).catch(() => {})
                    resolve()
                  },
                },
                { text: 'Để sau (đón khách mới)', onPress: () => resolve() },
                { text: 'Tiếp tục', onPress: () => { restoreDraft(d); resolve() } },
              ],
              // Không có nút 'cancel' → AlertHost tự chặn bấm ra ngoài để đóng,
              // thay cho { cancelable: false } của Alert.alert native.
            )
          })
        }
      } catch {
        /* ignore */
      }
      draftLoadedRef.current = true
    })()
  }, [])

  // Tự lưu nháp khi dữ liệu thay đổi (debounce)
  useEffect(() => {
    if (!draftLoadedRef.current || completedRef.current) return
    const snapshot = {
      step,
      rentalMode,
      selectedBuildingId,
      selectedRoomId,
      selectedWholeHouseId,
      tenantInfo,
      endDate,
      depositMonths,
      householdMembers,
      meters,
      elecMeterUrl,
      waterMeterUrl,
      meterCapturedAt,
      conditionPhotos,
      conditionPhotosCapturedAt,
      inspectionNotes,
      addedEquipments,
      priceMode,
      contract,
      paid,
      savedAt: Date.now(),
    }
    const t = setTimeout(async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY)
        const slots: DraftSlots = raw ? JSON.parse(raw) : {}
        const key = slotOf(snapshot)
        // Đã chọn phòng/căn → nháp tạm '_new' chuyển hẳn về slot cụ thể
        if (key !== '_new') delete slots['_new']
        slots[key] = snapshot
        await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(slots))
      } catch { /* ignore */ }
    }, 500)
    return () => clearTimeout(t)
  }, [
    step,
    rentalMode,
    selectedBuildingId,
    selectedRoomId,
    selectedWholeHouseId,
    tenantInfo,
    endDate,
    depositMonths,
    householdMembers,
    meters,
    elecMeterUrl,
    waterMeterUrl,
    meterCapturedAt,
    conditionPhotos,
    conditionPhotosCapturedAt,
    inspectionNotes,
    addedEquipments,
    priceMode,
    contract,
    paid,
  ])

  const clearDraft = () => {
    ;(async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY)
        if (!raw) return
        const slots: DraftSlots = JSON.parse(raw)
        delete slots[slotOf({ rentalMode, selectedWholeHouseId, selectedBuildingId, selectedRoomId })]
        delete slots['_new']
        await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(slots))
      } catch { /* ignore */ }
    })()
  }

  // Cảnh báo khi thoát giữa chừng (nếu đã có tiến trình & chưa hoàn tất)
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (completedRef.current || !hasMeaningfulProgress) return
      e.preventDefault()
      showAlert(
        'Thoát đón khách?',
        'Tiến trình đã nhập sẽ được lưu nháp để tiếp tục sau.',
        [
          { text: 'Ở lại', style: 'cancel' },
          {
            text: 'Thoát',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ],
      )
    })
    return unsub
  }, [navigation, hasMeaningfulProgress])

  const setMode = (mode: RentalMode) => {
    setRentalMode(mode)
    setSelectedBuildingId(null)
    setSelectedRoomId(null)
    setSelectedWholeHouseId(null)
    setMeters({ elec: '', water: '' })
    setElecMeterUrl('')
    setWaterMeterUrl('')
    setMeterCapturedAt({})
    setConditionPhotos([])
    setConditionPhotosCapturedAt([])
    setInspectionNotes('')
    setOtp('')
    setEndDate('')
    setContract(null)
    setPaid(false)
    setLookupFound(false)
    setLookupChecked(false)
    setLookupRole(null)
  }

  const updateTenantInfo = (key: keyof typeof tenantInfo, value: string) =>
    setTenantInfo((prev) => ({ ...prev, [key]: value }))

  const hasRequiredTenantInfo = () =>
    !!tenantInfo.fullName.trim() &&
    !!tenantInfo.phone.trim() &&
    !!tenantInfo.cccd.trim() &&
    rentValue > 0
  // Nhập tay (gõ đè lên số OCR đọc, hoặc OCR fail phải tự gõ) bắt buộc tick xác nhận
  // chịu trách nhiệm — feedback demo: không được lưu số nhập tay mà không cam kết.
  // Ảnh đồng hồ là bằng chứng cho chỉ số — chỉ kiểm số thì xoá ảnh đi vẫn qua được bước.
  /**
   * Mỗi đồng hồ phải có BẰNG CHỨNG: ảnh mặt số, hoặc mã admin cấp kèm lý do khi
   * không chụp được (mentor ý 5). Không được bỏ trống cả hai — chỉ kiểm con số thì
   * xoá ảnh đi vẫn qua được bước.
   */
  const meterHasEvidence = (kind: 'elec' | 'water') =>
    !!(kind === 'elec' ? elecMeterUrl : waterMeterUrl) || !!meterOverride[kind]

  const hasRequiredMeters = () =>
    !!meters.elec.trim() && !!meters.water.trim() &&
    meterHasEvidence('elec') && meterHasEvidence('water') &&
    (!manualEdited.elec || manualConfirmed.elec) &&
    (!manualEdited.water || manualConfirmed.water)

  /**
   * Chỉ số thật của một đồng hồ = phần nguyên + phần lẻ.
   * Phần lẻ để trống nghĩa là mặt số không có vùng đỏ (vd công tơ 3 pha gián tiếp).
   */
  const meterValue = (kind: 'elec' | 'water'): number => {
    const int = onlyDigits(meters[kind])
    const dec = onlyDigits(metersDec[kind])
    if (!int) return 0
    return Number(dec ? `${int}.${dec}` : int)
  }

  /** Chỉ số sau khi làm tròn theo luật mentor (>5 mới lên) — chỉ để hiện đối chiếu. */
  const meterRounded = (kind: 'elec' | 'water'): number =>
    splitMeterReading(
      metersDec[kind] ? `${onlyDigits(meters[kind])}.${onlyDigits(metersDec[kind])}` : onlyDigits(meters[kind]),
      kind,
      meterDigitConfig(kind),
    ).rounded

  const handleNext = async () => {
    switch (currentLabel) {
      case MODE_STEP:
        if (!rentalMode)
          return showAlert('Lỗi', 'Vui lòng chọn loại đón khách.')
        break
      case 'Chọn phòng':
        if (!selectedBuildingId || !selectedRoomId)
          return showAlert('Lỗi', 'Vui lòng chọn toà nhà và phòng trống.')
        break
      case 'Chọn nhà nguyên căn':
        if (!selectedWholeHouseId)
          return showAlert('Lỗi', 'Vui lòng chọn nhà nguyên căn.')
        break
      case 'Khách thuê':
      case 'Khách thuê chính':
        if (!hasRequiredTenantInfo())
          return showAlert('Lỗi', 'Vui lòng nhập Tên, SĐT, CCCD và giá thuê.')
        if (!isValidVnPhone(tenantInfo.phone))
          return showAlert(
            'SĐT không hợp lệ',
            'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng số 0.',
          )
        if (!isValidCccd(tenantInfo.cccd))
          return showAlert(
            'CCCD không hợp lệ',
            'Số căn cước công dân phải gồm đúng 12 chữ số.',
          )
        // Chặn cứng nếu SĐT đã thuộc tài khoản nội bộ (không phải USER/TENANT) — onboard sẽ lỗi ở BE.
        if (
          lookupFound &&
          lookupRole &&
          lookupRole !== 'ROLE_USER' &&
          lookupRole !== 'ROLE_TENANT'
        )
          return showAlert(
            'Không thể đón khách',
            `Số điện thoại này đang là tài khoản nội bộ (${lookupRole}). Vui lòng dùng số khác cho khách thuê.`,
          )
        {
          const end = parseDmy(endDate)
          if (!end)
            return showAlert(
              'Thiếu ngày kết thúc',
              'Vui lòng chọn ngày kết thúc hợp đồng.',
            )
          const endSod = startOfDay(end)
          if (endSod < minEndDate)
            return showAlert(
              'Ngày kết thúc không hợp lệ',
              'Ngày kết thúc hợp đồng phải sau ngày hợp đồng hiệu lực (hôm nay).',
            )
          if (endSod > maxEndDate)
            return showAlert(
              'Vượt thời hạn cho thuê',
              `Thời hạn thuê tối đa là ${MAX_LEASE_YEARS} năm. Vui lòng chọn ngày kết thúc trước ${maxEndDate.toLocaleDateString('en-GB')}.`,
            )
        }
        break
      case 'Thành viên ở cùng': {
        const today = startOfDay(new Date())
        for (const m of householdMembers) {
          // Bỏ qua thành viên chưa nhập gì (sẽ bị lọc khi gửi).
          if (!m.name.trim() && !m.phone.trim() && !m.cccd.trim() && !m.dateOfBirth.trim())
            continue
          if (m.phone.trim() && !isValidVnPhone(m.phone))
            return showAlert(
              'SĐT thành viên không hợp lệ',
              `Số điện thoại của "${m.name.trim() || 'thành viên'}" phải gồm 10 chữ số và bắt đầu bằng số 0.`,
            )
          if (m.cccd.trim() && !isValidCccd(m.cccd))
            return showAlert(
              'CCCD thành viên không hợp lệ',
              `Số CCCD của "${m.name.trim() || 'thành viên'}" phải gồm đúng 12 chữ số.`,
            )
          if (m.dateOfBirth.trim()) {
            const dob = parseDmy(m.dateOfBirth)
            if (!dob || startOfDay(dob) > today)
              return showAlert(
                'Ngày sinh không hợp lệ',
                `Ngày sinh của "${m.name.trim() || 'thành viên'}" không được vượt quá ngày hiện tại.`,
              )
          }
        }
        break
      }
      case 'Điện nước':
        if (!elecMeterUrl || !waterMeterUrl)
          return showAlert(
            'Thiếu ảnh đồng hồ',
            'Cần có ảnh đồng hồ của cả điện và nước làm bằng chứng cho chỉ số ghi nhận.',
          )
        if (!hasRequiredMeters())
          return showAlert(
            'Lỗi',
            'Vui lòng ghi nhận chỉ số điện nước ban đầu.',
          )
        break
      case 'Hiện trạng phòng':
      case 'Hiện trạng nhà':
        if (conditionPhotos.length === 0)
          return showAlert(
            'Lỗi',
            'Vui lòng chụp/tải ít nhất 1 ảnh hiện trạng.',
          )
        break
      case HANDOVER_STEP:
        // Không bắt buộc chọn thiết bị, nhưng món lắp thêm phải có tên + số lượng > 0.
        for (const a of addedEquipments) {
          if (!a.name.trim())
            return showAlert('Thiếu tên thiết bị', 'Vui lòng nhập tên cho thiết bị lắp thêm.')
          if (a.quantity <= 0)
            return showAlert('Số lượng không hợp lệ', `Thiết bị "${a.name.trim()}" cần số lượng lớn hơn 0.`)
        }
        break
      case 'Tạo hợp đồng':
        await createContractAndPayment()
        return // createContractAndPayment tự chuyển bước nếu thành công
    }
    if (step < steps.length - 1) setStep((prev) => prev + 1)
  }

  const handleBack = () => {
    if (step > 0) {
      setStep((prev) => prev - 1)
      return
    }
    navigation.goBack()
  }

  // Huỷ toàn bộ quy trình đón khách -> xoá nháp, bỏ cảnh báo thoát, về trang chủ.
  const handleCancelAll = () => {
    const hasDraftContract = !!contract
    showAlert(
      'Huỷ đón khách?',
      hasDraftContract
        ? 'Toàn bộ thông tin đang nhập sẽ bị xoá. Hợp đồng nháp đã tạo sẽ không được hoàn tất.'
        : 'Toàn bộ thông tin đang nhập sẽ bị xoá.',
      [
        { text: 'Tiếp tục nhập', style: 'cancel' },
        {
          text: 'Huỷ đón khách',
          style: 'destructive',
          onPress: () => {
            completedRef.current = true // bỏ qua cảnh báo beforeRemove
            clearDraft()
            navigation.navigate('ManagerTabs')
          },
        },
      ],
    )
  }

  // ===== Ảnh + OCR =====
  // Chụp ảnh luôn đi qua CameraCaptureModal (expo-camera) — xem captureMeter /
  // addConditionPhoto. ImagePicker chỉ còn dùng để chọn ảnh có sẵn trong máy.

  /**
   * Upload ảnh đồng hồ + OCR tự điền chỉ số.
   *
   * Chỉ số lúc đón khách là MỐC GỐC tính tiền điện/nước cả kỳ thuê, nên ảnh bắt buộc
   * là mặt đồng hồ thật: `validateMeterPhoto` soi chữ OCR đọc được (kWh, m³, tên hãng,
   * serial...). Ảnh chỉ có con số (ghi ra giấy, chụp màn hình) hay chụp nhầm loại đồng
   * hồ đều bị từ chối — không lưu ảnh, không điền số.
   */
  const processMeterImage = async (kind: 'elec' | 'water', uri: string) => {
    // Ảnh mới chụp — tin OCR trở lại, bỏ yêu cầu xác nhận nhập tay của lần trước.
    setManualEdited((prev) => ({ ...prev, [kind]: false }))
    setManualConfirmed((prev) => ({ ...prev, [kind]: false }))
    const label = kind === 'elec' ? 'điện' : 'nước'
    const keepPhoto = (url: string) => {
      if (kind === 'elec') setElecMeterUrl(url)
      else setWaterMeterUrl(url)
      setMeterCapturedAt((prev) => ({ ...prev, [kind]: new Date().toISOString() }))
    }
    try {
      setOcrLoading(kind)
      const url = await uploadImageToCloudinary(uri)

      let ocr
      try {
        ocr = await realTenantService.ocrMeter(url)
      } catch (err: any) {
        // Không kiểm chứng được → vẫn giữ ảnh để không chặn việc đón khách, nhưng báo rõ.
        keepPhoto(url)
        showAlert('Chưa kiểm được ảnh', readErr(err, 'Dịch vụ đọc ảnh lỗi — nhập chỉ số tay và kiểm lại ảnh giúp.'))
        return
      }

      const check = validateMeterPhoto(kind, ocr)
      if (!check.ok) {
        showAlert(`Ảnh không phải đồng hồ ${label}`, check.reason, undefined, '🚫')
        return
      }

      // Không tách được dãy số → ảnh mờ/xa/loá. Từ chối để bắt chụp lại, vì ảnh không
      // đọc nổi số thì không còn giá trị làm bằng chứng đối soát.
      if (!check.reading) {
        showAlert(
          'Ảnh chưa đọc được chỉ số',
          `Không tách được dãy số trên đồng hồ ${label} — thường do ảnh mờ, chụp xa hoặc bị loá. `
            + 'Chụp lại gần hơn, lấy rõ phần ô số và tránh ánh sáng phản chiếu.',
          undefined,
          '🚫',
        )
        return
      }

      keepPhoto(url)
      // Cắt phần nguyên / phần lẻ theo cấu hình của chính phòng này. Dãy OCR đọc ra
      // là TOÀN BỘ ô số ("030815"), phần lẻ nằm ở cuối — không tách là ghi thành
      // 30815 thay vì 3081,5.
      const split = splitMeterReading(check.reading as string, kind, meterDigitConfig(kind))
      setMeters((prev) => ({ ...prev, [kind]: split.integerPart }))
      setMetersDec((prev) => ({ ...prev, [kind]: split.decimalPart }))
      if (check.confidence === 'low') {
        showAlert('Ảnh hơi mờ', `Chưa chắc chắn đây là mặt đồng hồ ${label} — xem lại ảnh và chỉ số trước khi lưu.`)
      }
    } catch (err: any) {
      showAlert(
        'OCR',
        readErr(err, 'Không đọc được ảnh, vui lòng nhập số tay.'),
      )
    } finally {
      setOcrLoading(null)
    }
  }

  const captureMeter = async (kind: 'elec' | 'water', useCamera: boolean) => {
    // Camera trong app cho MỌI nền tảng: web không bật được camera qua ImagePicker,
    // và modal còn bắt xem lại ảnh trước khi dùng (ảnh này là căn cứ tính tiền).
    if (useCamera) {
      setCameraTarget(kind)
      return
    }
    // Chỉ cho chọn ảnh từ thư viện sau khi đã xác nhận camera lỗi (gallerySOS).
    if (!gallerySOS[kind]) return
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 })
    if (r.canceled) return
    await processMeterImage(kind, r.assets[0].uri)
  }

  // Camera không dùng được (mất quyền, lỗi thiết bị...) — manager tự báo để mở khoá
  // nút chọn ảnh thư viện, thay vì hiện sẵn 2 lựa chọn ngang nhau.
  const reportCameraBroken = (kind: 'elec' | 'water') => {
    setGallerySOS((prev) => ({ ...prev, [kind]: true }))
  }

  const uploadConditionPhotos = async (uris: string[]) => {
    try {
      setPhotoUploading(true)
      const urls = await Promise.all(
        uris.map((u) => uploadImageToCloudinary(u)),
      )
      // Kiểm nội dung từng ảnh (xem validateRoomPhoto): chặn ảnh chế/poster/đồng hồ
      // lọt vào bộ bằng chứng hiện trạng.
      const accepted: string[] = []
      const rejected: string[] = []
      for (const url of urls) {
        let labels: VisionLabel[] = []
        try {
          labels = await visionService.detectLabels(url)
        } catch {
          // Vision lỗi → validateRoomPhoto tự cho qua, không chặn luồng đón khách.
        }
        const check = validateRoomPhoto(labels)
        if (check.ok) accepted.push(url)
        else rejected.push(check.reason || 'Ảnh không hợp lệ.')
      }

      if (accepted.length > 0) {
        const now = new Date().toISOString()
        setConditionPhotos((prev) => [...prev, ...accepted])
        setConditionPhotosCapturedAt((prev) => [...prev, ...accepted.map(() => now)])
      }
      if (rejected.length > 0) {
        showAlert(
          rejected.length === urls.length ? 'Ảnh không hợp lệ' : `Đã bỏ ${rejected.length} ảnh không hợp lệ`,
          rejected[0],
          undefined,
          '🚫',
        )
      }
    } catch (err: any) {
      showAlert('Lỗi', readErr(err, 'Upload ảnh thất bại.'))
    } finally {
      setPhotoUploading(false)
    }
  }

  const addConditionPhoto = async (useCamera: boolean) => {
    // Chụp → camera trong app (có bước xem lại ảnh), dùng chung cho web lẫn điện thoại.
    if (useCamera) {
      setCameraTarget('condition')
      return
    }
    let uris: string[] = []
    {
      // Cho chọn nhiều ảnh cùng lúc từ thư viện
      const r = await ImagePicker.launchImageLibraryAsync({
        quality: 0.6,
        allowsMultipleSelection: true,
        selectionLimit: 10,
      })
      if (!r.canceled) uris = r.assets.map((a) => a.uri)
    }
    if (uris.length === 0) return
    await uploadConditionPhotos(uris)
  }

  // Ảnh chụp từ CameraCaptureModal: đồng hồ chụp 1 ảnh rồi đóng,
  // hiện trạng cho chụp liên tiếp nhiều ảnh (modal tự giữ mở).
  const handleCameraCapture = (uri: string) => {
    if (cameraTarget === 'elec' || cameraTarget === 'water') {
      const kind = cameraTarget
      setCameraTarget(null)
      void processMeterImage(kind, uri)
    } else if (cameraTarget === 'condition') {
      void uploadConditionPhotos([uri])
    }
  }

  // ===== Household =====
  const addHouseholdMember = () => {
    if (!canAddMember) {
      showAlert(
        'Đã đủ số người',
        `Phòng này cho ở tối đa ${occupantLimit} người (gồm khách thuê chính).`,
      )
      return
    }
    setHouseholdMembers((prev) => [
      ...prev,
      {
        id: `m-${Date.now()}`,
        name: '',
        relation: '',
        phone: '',
        dateOfBirth: '',
        cccd: '',
      },
    ])
  }
  const updateHouseholdMember = (
    id: string,
    key: keyof Omit<HouseholdMemberForm, 'id'>,
    value: string,
  ) =>
    setHouseholdMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [key]: value } : m)),
    )
  const removeHouseholdMember = (id: string) =>
    setHouseholdMembers((prev) => prev.filter((m) => m.id !== id))

  // ===== Tạo HĐ + thanh toán =====

  // contract-available-equipments trả sẵn tên + tình trạng, không cần đọc linh hoạt nữa.
  const equipName = (e: ContractAvailableEquipmentItem): string => e.name || 'Thiết bị'
  const equipDetail = (e: ContractAvailableEquipmentItem): string =>
    EQUIPMENT_CONDITION_LABEL[e.condition] ?? e.condition ?? ''

  // Thiết bị lắp thêm theo yêu cầu khách — gửi kèm request tạo/sửa để BE link đúng vào
  // hợp đồng (KHÔNG tạo qua endpoint equipment chung như trước). BE không có field
  // quantity trên 1 dòng added-equipment nên lặp N dòng, chia đều chi phí.
  const buildAddedEquipmentsPayload = (): ContractAddedEquipmentInput[] =>
    addedEquipments.flatMap((a) => {
      const qty = Math.max(1, a.quantity)
      const perUnitCost = a.cost > 0 ? Math.round(a.cost / qty) : undefined
      return Array.from({ length: qty }, () => ({
        name: a.name.trim(),
        category: a.category || undefined,
        cost: perUnitCost,
      }))
    })

  const buildPayload = (): OnboardTenantRequest => ({
    fullName: tenantInfo.fullName.trim(),
    cccd: tenantInfo.cccd.trim(),
    phoneNumber: tenantInfo.phone.trim(),
    moveInDate: toIsoDate(todayStr), // ngày hợp đồng hiệu lực = hôm nay
    endDate: toIsoDate(endDate), // ngày kết thúc hợp đồng
    rentAmount: rentValue,
    deposit: depositValue,
    depositMonths,
    // Gửi GIÁ TRỊ THẬT còn nguyên phần lẻ (3081.5), không làm tròn ở đây: làm tròn
    // lúc ghi là mất số vĩnh viễn, còn giữ số lẻ thì lúc phát hành hoá đơn muốn làm
    // tròn kiểu gì cũng được. `parseNum` cũ xoá sạch dấu chấm nên không dùng lại được.
    initialElectricReading: meterValue('elec'),
    initialWaterReading: meterValue('water'),
    electricMeterImageUrl: elecMeterUrl || undefined,
    electricMeterCapturedAt: meterCapturedAt.elec,
    waterMeterImageUrl: waterMeterUrl || undefined,
    waterMeterCapturedAt: meterCapturedAt.water,
    // Mã cho phép nhập tay khi không có ảnh. BE chỉ tiêu thụ token khi ảnh tương ứng
    // TRỐNG — có ảnh thì bỏ qua, nên gửi kèm luôn cũng không sai.
    electricMeterOverrideToken: meterOverride.elec?.token,
    electricMeterOverrideReason: meterOverride.elec?.reason,
    waterMeterOverrideToken: meterOverride.water?.token,
    waterMeterOverrideReason: meterOverride.water?.reason,
    roomConditionUrls: conditionPhotos,
    roomConditionPhotos: conditionPhotos.map((url, i) => ({
      url,
      capturedAt: conditionPhotosCapturedAt[i] || new Date().toISOString(),
    })),
    roomConditionNote: inspectionNotes?.trim() || undefined,
    householdMembers: householdMembers
      .filter((m) => m.name.trim())
      .map((m) => ({
        fullName: m.name.trim(),
        relation: m.relation,
        phone: m.phone,
        dateOfBirth: m.dateOfBirth ? toIsoDate(m.dateOfBirth) : undefined,
        cccd: m.cccd,
      })),
    // Nội thất có sẵn: KHÔNG gửi selectedEquipmentIds — BE tự gắn toàn bộ thiết bị
    // ACTIVE trong phạm vi HĐ và tự sinh equipmentSnapshot (FE-contract-equipment-auto.md).
    // Thiết bị lắp thêm — gửi kèm ngay để BE link đúng vào HĐ (thay cho createAddedEquipments cũ).
    addedEquipments: buildAddedEquipmentsPayload(),
    // Case 2: chưa chắc giá -> gửi Host duyệt, BE tạo HĐ chờ duyệt và CHƯA thu cọc.
    requireHostPriceApproval: priceMode === 'approval',
    // Case 1: HĐ tạo ở PENDING chờ thu cọc PayOS + OTP (hệ thống thu cọc 100% chuyển khoản).
    requireDepositPayment: priceMode === 'agreed',
  })

  const createContractAndPayment = async () => {
    try {
      setCreating(true)

      // 1) Chỉ tạo hợp đồng khi CHƯA có. Lưu `contract` NGAY sau khi tạo (201) để lần
      //    bấm sau (vd PayOS lỗi) KHÔNG tạo hợp đồng trùng cho cùng phòng (gây HĐ mồ côi).
      let current = contract
      if (!current) {
        const payload = buildPayload()
        current =
          rentalMode === 'whole_house'
            ? await realTenantService.onboardWholeHouseTenant(
                Number(selectedWholeHouseId),
                payload,
              )
            : await realTenantService.onboardRoomTenant(
                Number(selectedBuildingId),
                Number(selectedRoomId),
                payload,
              )
        setContract(current)
      }

      // Case 2: gửi Host duyệt giá -> KHÔNG thu cọc, dừng tại màn "chờ duyệt".
      if (priceMode === 'approval') {
        completedRef.current = true // bỏ qua cảnh báo thoát
        clearDraft()
        return
      }

      // PayOS: đã có link/QR thì chỉ sang bước thanh toán (tránh tạo lại);
      // chưa có thì tạo link cọc cho ĐÚNG hợp đồng đã tạo ở trên.
      if (current.payosCheckoutUrl || current.payosQrCode) {
        setStep((prev) => prev + 1)
        return
      }
      const withPay = await realTenantService.createDepositPayment(current.id)
      setContract(withPay)
      setStep((prev) => prev + 1) // sang bước Thanh toán cọc
    } catch (err: any) {
      showAlert('Lỗi', readErr(err, 'Không tạo được hợp đồng/thanh toán.'))
    } finally {
      setCreating(false)
    }
  }

  const checkPaidNow = async () => {
    if (!contract) return
    try {
      const c = await realTenantService.checkPayment(contract.id)
      if (c.paymentStatus === 'PAID') {
        setPaid(true)
        setShowWebView(false)
      } else
        showAlert(
          'Chưa nhận được thanh toán',
          'PayOS chưa ghi nhận giao dịch. Vui lòng thử lại sau vài giây.',
        )
    } catch (err: any) {
      showAlert('Lỗi', readErr(err, 'Không kiểm tra được trạng thái.'))
    }
  }

  // Gửi (hoặc gửi lại) OTP xác nhận tới SĐT khách. Dev OTP mode: BE không gửi SMS thật.
  const sendOtp = async (manual = false) => {
    if (!contract) return
    try {
      setOtpSending(true)
      await realTenantService.sendContractOtp(contract.id)
      otpSentForRef.current = contract.id
      setOtpCooldown(OTP_RESEND_COOLDOWN)
      if (manual)
        showAlert('Đã gửi lại OTP', `Mã xác nhận mới đã gửi tới ${tenantInfo.phone}.`)
    } catch (err: any) {
      showAlert('Lỗi gửi OTP', readErr(err, 'Không gửi được mã OTP. Vui lòng thử lại.'))
    } finally {
      setOtpSending(false)
    }
  }

  const verifyOTPAndSubmit = async () => {
    // Không chặn cứng mã ở client — để BE xác thực (dev: chấp nhận mọi mã 6 số; prod: Twilio).
    if (otp.length !== 6)
      return showAlert('Lỗi', 'Vui lòng nhập mã OTP gồm 6 chữ số.')
    if (!contract) return
    try {
      setConfirming(true)
      const res = await realTenantService.confirmContract(contract.id, { otp })
      completedRef.current = true // bỏ qua cảnh báo thoát
      clearDraft()
      // Ưu tiên field từ BE (xem MD work/Onboarding.md); fallback suy luận từ kết quả lookup ở bước nhập thông tin.
      navigation.navigate('OnboardingSuccess', {
        contractCode: res.contractCode,
        tenantFullName: res.tenantFullName,
        roomNumber: res.roomNumber,
        phone: tenantInfo.phone,
        username: res.tenantUsername ?? defaultTenantUsername(tenantInfo.phone),
        accountCreated: res.tenantAccountCreated ?? !lookupFound,
        rolePromoted:
          res.tenantRolePromoted ?? (lookupFound && lookupRole === 'ROLE_USER'),
      })
    } catch (err: any) {
      showAlert('Lỗi', readErr(err, 'Không hoàn tất được hợp đồng.'))
    } finally {
      setConfirming(false)
    }
  }

  // ===== RENDER STEPS =====
  const renderModeStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.sectionTitle}>Chọn loại đón khách</Text>
      <Text style={styles.hint}>
        Chọn đúng mô hình thuê để hệ thống hiển thị các bước phù hợp.
      </Text>
      <View style={styles.modeGrid}>
        {rentalModeOptions.map((option) => {
          const selected = rentalMode === option.mode
          return (
            <TouchableOpacity
              key={option.mode}
              style={[styles.modeCard, selected && styles.modeCardActive]}
              onPress={() => setMode(option.mode)}
              activeOpacity={0.85}
            >
              <View
                style={[
                  styles.modeIconWrap,
                  selected && styles.modeIconWrapActive,
                ]}
              >
                <Text style={styles.modeIcon}>{option.icon}</Text>
              </View>
              <View style={styles.modeTextBlock}>
                <Text
                  style={[styles.modeTitle, selected && styles.modeTitleActive]}
                >
                  {option.title}
                </Text>
                <Text
                  style={[
                    styles.modeDescription,
                    selected && styles.modeDescriptionActive,
                  ]}
                >
                  {option.description}
                </Text>
              </View>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )

  const renderRoomSelectionStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Chọn toà nhà</Text>
      <TextInput
        style={styles.houseSearchInput}
        value={houseSearch}
        onChangeText={setHouseSearch}
        placeholder='🔍 Tìm toà nhà theo tên hoặc địa chỉ'
        placeholderTextColor={Colors.textMuted}
      />
      {filteredRoomProperties.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            Không tìm thấy toà nhà phù hợp.
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.houseChipRow}
        >
          {filteredRoomProperties.map((property) => {
          const selected = selectedBuildingId === property.id
          return (
            <TouchableOpacity
              key={property.id}
              style={[styles.houseChip, selected && styles.houseChipActive]}
              onPress={() => {
                setSelectedBuildingId(property.id)
                setSelectedRoomId(null)
              }}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.houseChipName,
                  selected && styles.houseChipNameActive,
                ]}
                numberOfLines={1}
              >
                {property.name}
              </Text>
              <Text
                style={[
                  styles.houseChipMeta,
                  selected && styles.houseChipMetaActive,
                ]}
                numberOfLines={1}
              >
                {property.available} phòng trống
              </Text>
            </TouchableOpacity>
          )
          })}
        </ScrollView>
      )}
      {selectedBuilding && (
        <Text style={styles.houseChipAddress} numberOfLines={1}>
          📍 {selectedBuilding.address}
        </Text>
      )}
      {selectedBuildingId ? (
        <>
          <Text style={[styles.sectionTitle, styles.nextSectionTitle]}>
            Chọn phòng trống
          </Text>
          {availableRooms.length > 0 ? (
            <View style={styles.roomGrid}>
              {availableRooms.map((room) => {
                const selected = selectedRoomId === room.id
                return (
                  <TouchableOpacity
                    key={room.id}
                    style={[styles.roomCard, selected && styles.roomCardActive]}
                    onPress={() => setSelectedRoomId(room.id)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.roomEmoji}>🚪</Text>
                    <Text
                      style={[
                        styles.roomName,
                        selected && styles.roomNameActive,
                      ]}
                    >
                      {room.code}
                    </Text>
                    <Text
                      style={[
                        styles.roomMeta,
                        selected && styles.roomMetaActive,
                      ]}
                    >
                      {room.area}m² · {formatVnd(room.rentPrice)} đ
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                Toà nhà này chưa có phòng trống.
              </Text>
            </View>
          )}
        </>
      ) : (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            Chọn một toà nhà để xem phòng trống.
          </Text>
        </View>
      )}
    </ScrollView>
  )

  const renderWholeHouseSelectionStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Chọn nhà nguyên căn</Text>
      <TextInput
        style={styles.houseSearchInput}
        value={houseSearch}
        onChangeText={setHouseSearch}
        placeholder='🔍 Tìm nhà theo tên hoặc địa chỉ'
        placeholderTextColor={Colors.textMuted}
      />
      {filteredWholeHouseProperties.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            Không tìm thấy nhà nguyên căn phù hợp.
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.houseChipRow}
        >
          {filteredWholeHouseProperties.map((property) => {
            const selected = selectedWholeHouseId === property.id
            return (
              <TouchableOpacity
                key={property.id}
                style={[styles.houseChip, selected && styles.houseChipActive]}
                onPress={() => setSelectedWholeHouseId(property.id)}
                activeOpacity={0.85}
              >
              <Text
                style={[
                  styles.houseChipName,
                  selected && styles.houseChipNameActive,
                ]}
                numberOfLines={1}
              >
                {property.name}
              </Text>
              <Text
                style={[
                  styles.houseChipMeta,
                  selected && styles.houseChipMetaActive,
                ]}
                numberOfLines={1}
              >
                {formatVnd(property.monthlyRent)} đ/tháng
              </Text>
            </TouchableOpacity>
          )
          })}
        </ScrollView>
      )}
      {selectedWholeHouse ? (
        <View style={styles.wholeHouseSummary}>
          <Text style={styles.wholeHouseSummaryName}>
            {selectedWholeHouse.name}
          </Text>
          <Text style={styles.wholeHouseSummaryMeta} numberOfLines={2}>
            📍 {selectedWholeHouse.address}
          </Text>
          <Text style={styles.wholeHouseSummaryMeta}>
            Giá thuê: {formatVnd(selectedWholeHouse.monthlyRent)} đ/tháng
          </Text>
        </View>
      ) : (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            Chọn một nhà nguyên căn để tiếp tục.
          </Text>
        </View>
      )}
    </ScrollView>
  )

  const renderTenantInfoStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>
        {rentalMode === 'whole_house'
          ? 'Thông tin khách thuê chính'
          : 'Thông tin khách thuê'}
      </Text>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Họ và tên *</Text>
        <TextInput
          style={styles.input}
          value={tenantInfo.fullName}
          onChangeText={(v) => updateTenantInfo('fullName', v)}
          placeholder='Nhập họ và tên...'
          placeholderTextColor={Colors.textMuted}
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Số điện thoại *</Text>
        <TextInput
          style={styles.input}
          value={tenantInfo.phone}
          onChangeText={(v) => updateTenantInfo('phone', onlyDigits(v))}
          keyboardType='phone-pad'
          maxLength={10}
          placeholder='090...'
          placeholderTextColor={Colors.textMuted}
        />
        {lookupFound && lookupRole === 'ROLE_USER' && (
          <Text style={styles.foundHint}>
            ✓ Đã có tài khoản app — tự điền tên & CCCD, khách sẽ được cấp quyền
            Tenant sau khi xác nhận.
          </Text>
        )}
        {lookupFound && lookupRole === 'ROLE_TENANT' && (
          <Text style={styles.foundHint}>
            ✓ Khách đã là người thuê trong hệ thống — sẽ liên kết hợp đồng mới
            này cho khách.
          </Text>
        )}
        {lookupFound &&
          lookupRole !== 'ROLE_USER' &&
          lookupRole !== 'ROLE_TENANT' && (
            <Text style={styles.warnHint}>
              ⚠️ SĐT này đang là tài khoản nội bộ (
              {lookupRole || 'không rõ vai trò'}). Hãy kiểm tra lại trước khi
              tiếp tục.
            </Text>
          )}
        {lookupChecked && !lookupFound && (
          <Text style={styles.newAccountHint}>
            ℹ️ Số này chưa có tài khoản — hệ thống sẽ tạo tài khoản mới (mật
            khẩu mặc định 123456) sau khi xác nhận OTP.
          </Text>
        )}
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Căn cước công dân *</Text>
        <TextInput
          style={styles.input}
          value={tenantInfo.cccd}
          onChangeText={(v) => updateTenantInfo('cccd', onlyDigits(v))}
          keyboardType='number-pad'
          maxLength={12}
          placeholder='Nhập 12 số CCCD...'
          placeholderTextColor={Colors.textMuted}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Giá thuê tháng (VNĐ) *</Text>
        <TextInput
          style={styles.input}
          value={formatVnd(tenantInfo.monthlyRent)}
          onChangeText={(v) => updateTenantInfo('monthlyRent', onlyDigits(v))}
          keyboardType='numeric'
          placeholder='Tự điền theo BĐS, có thể chỉnh'
          placeholderTextColor={Colors.textMuted}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Tiền cọc</Text>
        <View style={styles.monthRow}>
          {[1, 2].map((m) => (
            <TouchableOpacity
              key={m}
              style={[
                styles.monthChip,
                depositMonths === m && styles.monthChipActive,
              ]}
              onPress={() => setDepositMonths(m)}
            >
              <Text
                style={[
                  styles.monthChipText,
                  depositMonths === m && styles.monthChipTextActive,
                ]}
              >
                {m} tháng
              </Text>
            </TouchableOpacity>
          ))}
          <View style={styles.depositBox}>
            <Text style={styles.depositValue}>
              {formatVnd(depositValue) || '0'} đ
            </Text>
          </View>
        </View>
        <Text style={styles.hintSmall}>
          Cọc = giá thuê × số tháng (tự tính theo lựa chọn).
        </Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Ngày hợp đồng hiệu lực</Text>
        <View style={styles.readonlyField}>
          <Text style={styles.readonlyText}>{todayStr}</Text>
          <Text style={styles.readonlyIcon}>📅</Text>
        </View>
        {/* <Text style={styles.hintSmall}>Hợp đồng có hiệu lực từ hôm nay (không thể thay đổi).</Text> */}
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Ngày kết thúc hợp đồng *</Text>
        <DatePickerField
          value={endDate}
          onChange={setEndDate}
          minDate={minEndDate}
          maxDate={maxEndDate}
          placeholder='Chọn ngày kết thúc hợp đồng'
        />
        {/* <Text style={styles.hintSmall}>
          Phải sau ngày hiệu lực, thời hạn thuê tối đa {MAX_LEASE_YEARS} năm (đến {maxEndDate.toLocaleDateString('en-GB')}).
        </Text> */}
      </View>
    </ScrollView>
  )

  const renderHouseholdMembersStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>Thành viên ở cùng</Text>
          <Text style={styles.hint}>
            Không bắt buộc. Có thể bổ sung ngày sinh và CCCD cho từng người.
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.addMemberBtn,
            !canAddMember && styles.addMemberBtnDisabled,
          ]}
          onPress={addHouseholdMember}
          disabled={!canAddMember}
        >
          <Text style={styles.addMemberText}>+ Thêm</Text>
        </TouchableOpacity>
      </View>

      {occupantLimit > 0 && (
        <View
          style={[
            styles.occupantBanner,
            !canAddMember && styles.occupantBannerFull,
          ]}
        >
          <Text style={styles.occupantBannerText}>
            Phòng cho ở tối đa {occupantLimit} người (gồm khách chính). Hiện
            tại: {currentOccupants}/{occupantLimit}.
            {!canAddMember ? ' Đã đủ số người.' : ''}
          </Text>
        </View>
      )}
      {householdMembers.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>Chưa thêm thành viên ở cùng.</Text>
        </View>
      ) : (
        householdMembers.map((member, index) => (
          <View key={member.id} style={styles.memberCard}>
            <View style={styles.memberHeader}>
              <Text style={styles.memberTitle}>Thành viên {index + 1}</Text>
              <TouchableOpacity
                onPress={() => removeHouseholdMember(member.id)}
              >
                <Text style={styles.removeText}>Xoá</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.input}
              value={member.name}
              onChangeText={(v) => updateHouseholdMember(member.id, 'name', v)}
              placeholder='Họ và tên'
              placeholderTextColor={Colors.textMuted}
            />
            <View style={styles.memberInputGap} />
            <TextInput
              style={styles.input}
              value={member.relation}
              onChangeText={(v) =>
                updateHouseholdMember(member.id, 'relation', v)
              }
              placeholder='Quan hệ với khách thuê chính'
              placeholderTextColor={Colors.textMuted}
            />
            <View style={styles.memberInputGap} />
            <TextInput
              style={styles.input}
              value={member.phone}
              onChangeText={(v) =>
                updateHouseholdMember(member.id, 'phone', onlyDigits(v))
              }
              keyboardType='phone-pad'
              maxLength={10}
              placeholder='Số điện thoại (10 số)'
              placeholderTextColor={Colors.textMuted}
            />
            <View style={styles.memberInputGap} />
            <Text style={styles.label}>Ngày tháng năm sinh</Text>
            <DatePickerField
              value={member.dateOfBirth}
              maxDate={new Date()}
              onChange={(v) =>
                updateHouseholdMember(member.id, 'dateOfBirth', v)
              }
            />
            <TextInput
              style={styles.input}
              value={member.cccd}
              onChangeText={(v) =>
                updateHouseholdMember(member.id, 'cccd', onlyDigits(v))
              }
              keyboardType='number-pad'
              maxLength={12}
              placeholder='Số CCCD (12 số)'
              placeholderTextColor={Colors.textMuted}
            />
          </View>
        ))
      )}
    </ScrollView>
  )

  const renderMeterInput = (kind: 'elec' | 'water') => {
    const url = kind === 'elec' ? elecMeterUrl : waterMeterUrl
    return (
      <View style={styles.meterCard}>
        <View style={styles.meterRow}>
          <Text style={styles.meterEmoji}>{kind === 'elec' ? '⚡' : '💧'}</Text>
          <View style={styles.meterTextBlock}>
            <Text style={styles.meterTitle}>
              {kind === 'elec' ? 'Chỉ số điện' : 'Chỉ số nước'}
            </Text>
            <Text style={styles.meterHint}>
              {kind === 'elec' ? 'Đơn vị kWh' : 'Đơn vị m³'}
            </Text>
          </View>
        </View>
        <View style={styles.ocrBtnRow}>
          <TouchableOpacity
            style={styles.ocrBtn}
            onPress={() => captureMeter(kind, true)}
            disabled={ocrLoading !== null}
          >
            <Text style={styles.ocrBtnText}>📷 Chụp</Text>
          </TouchableOpacity>
          {/* Chỉ hiện "Chọn ảnh" sau khi báo camera lỗi — tránh tiện tay chọn ảnh cũ
              thay vì chụp tại chỗ (feedback demo). */}
          {gallerySOS[kind] && (
            <TouchableOpacity
              style={styles.ocrBtn}
              onPress={() => captureMeter(kind, false)}
              disabled={ocrLoading !== null}
            >
              <Text style={styles.ocrBtnText}>🖼 Chọn ảnh</Text>
            </TouchableOpacity>
          )}
          {ocrLoading === kind && (
            <ActivityIndicator
              color={Colors.primary}
              style={{ marginLeft: 8 }}
            />
          )}
        </View>
        {!gallerySOS[kind] && (
          <TouchableOpacity onPress={() => reportCameraBroken(kind)}>
            <Text style={styles.galleryFallbackLink}>Camera không dùng được? Chọn ảnh từ thư viện</Text>
          </TouchableOpacity>
        )}
        {/* Đường lùi CUỐI CÙNG khi cả chụp lẫn chọn ảnh đều không được (mentor ý 5).
            Chỉ hiện sau khi đã thử báo camera lỗi — không bày sẵn ngang hàng với nút
            chụp, kẻo thành lối tắt mặc định. */}
        {gallerySOS[kind] && !url && !meterOverride[kind] && (
          <TouchableOpacity onPress={() => setOverrideTarget(kind === 'elec' ? 'ELEC' : 'WATER')}>
            <Text style={styles.overrideLink}>
              🔑 Không chụp được ảnh? Xin mã từ quản trị để nhập tay
            </Text>
          </TouchableOpacity>
        )}
        {!!meterOverride[kind] && (
          <View style={styles.overrideBadge}>
            <Text style={styles.overrideBadgeText}>
              🔑 Nhập tay có mã · {meterOverride[kind]!.reason}
            </Text>
            <TouchableOpacity
              onPress={() => setMeterOverride((prev) => ({ ...prev, [kind]: undefined }))}
            >
              <Text style={styles.overrideBadgeClear}>Bỏ</Text>
            </TouchableOpacity>
          </View>
        )}
        {!!url && (
          <View style={styles.meterThumbWrap}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => { setPreviewUrl(url); setPreviewCapturedAt(meterCapturedAt[kind]) }}
            >
              <Image source={{ uri: url }} style={styles.meterThumb} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.removePhotoBtn}
              onPress={() => {
                if (kind === 'elec') setElecMeterUrl('')
                else setWaterMeterUrl('')
                setMeterCapturedAt((prev) => ({ ...prev, [kind]: undefined }))
              }}
            >
              <Text style={styles.removePhotoText}>×</Text>
            </TouchableOpacity>
          </View>
        )}
        {!!meterCapturedAt[kind] && (
          <Text style={styles.meterCapturedAt}>
            🕒 Chụp lúc {new Date(meterCapturedAt[kind]!).toLocaleString('vi-VN')}
          </Text>
        )}
        {/* Quy ước đọc số — phải giống nhau giữa lúc đón khách và các kỳ hoá đơn sau,
            nếu không hiệu số giữa 2 kỳ sẽ sai. */}
        <View style={styles.meterHintBox}>
          <Text style={styles.meterHintText}>
            • Nhập phần số <Text style={styles.meterHintStrong}>ĐEN</Text>
            {kind === 'elec' ? ' (kWh)' : ' (m³)'} vào ô trái, phần{' '}
            <Text style={styles.meterHintRed}>ĐỎ</Text> (thập phân) vào ô phải.
          </Text>
          <Text style={styles.meterHintText}>
            • Đồng hồ <Text style={styles.meterHintStrong}>không có</Text> ô đỏ (công tơ
            3 pha…) → để trống ô phải.
          </Text>
          <Text style={styles.meterHintText}>
            • Chữ số đang nhảy giữa 2 số → lấy số{' '}
            <Text style={styles.meterHintStrong}>NHỎ HƠN</Text>.
          </Text>
        </View>
        {/* Hai ô tách rời đúng như hai vùng trên mặt đồng hồ. Gộp một ô thì không
            phân biệt được 3081,5 với 30815 — chênh 10 lần tiền điện. */}
        <View style={styles.meterSplitRow}>
          <TextInput
            style={[styles.input, styles.meterReadingInput, styles.meterIntInput]}
            value={meters[kind]}
            onChangeText={(v) => {
              setMeters((prev) => ({ ...prev, [kind]: onlyDigits(v) }))
              setManualEdited((prev) => ({ ...prev, [kind]: true }))
              setManualConfirmed((prev) => ({ ...prev, [kind]: false }))
            }}
            keyboardType='numeric'
            placeholder='Phần đen'
            placeholderTextColor={Colors.textMuted}
          />
          <Text style={styles.meterSplitDot}>,</Text>
          <TextInput
            style={[styles.input, styles.meterReadingInput, styles.meterDecInput]}
            value={metersDec[kind]}
            onChangeText={(v) => {
              setMetersDec((prev) => ({
                ...prev,
                [kind]: onlyDigits(v).slice(0, meterDigitConfig(kind).decimalDigits || 3),
              }))
              setManualEdited((prev) => ({ ...prev, [kind]: true }))
              setManualConfirmed((prev) => ({ ...prev, [kind]: false }))
            }}
            keyboardType='numeric'
            placeholder='đỏ'
            placeholderTextColor={Colors.textMuted}
          />
          <Text style={styles.meterSplitUnit}>{kind === 'elec' ? 'kWh' : 'm³'}</Text>
        </View>
        {!!meters[kind] && (
          <Text style={styles.meterRoundedNote}>
            Ghi nhận <Text style={styles.meterHintStrong}>{meterValue(kind)}</Text>
            {kind === 'elec' ? ' kWh' : ' m³'}
            {!!metersDec[kind] && ` · làm tròn để tính tiền: ${meterRounded(kind)}`}
          </Text>
        )}
        {manualEdited[kind] && (
          <TouchableOpacity
            style={styles.confirmRow}
            activeOpacity={0.7}
            onPress={() => setManualConfirmed((prev) => ({ ...prev, [kind]: !prev[kind] }))}
          >
            <View style={[styles.checkbox, manualConfirmed[kind] && styles.checkboxChecked]}>
              {manualConfirmed[kind] && <Text style={styles.checkboxTick}>✓</Text>}
            </View>
            <Text style={styles.confirmText}>
              Tôi xác nhận đã nhập đúng số liệu (nhập tay, khác/thay OCR) và chịu trách nhiệm.
            </Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  const renderMeterStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Ghi nhận điện nước ban đầu</Text>
      {/* Luôn hiện rõ đang ghi cho phòng/nhà nào — tránh nhầm chỉ số khi
          manager ghi liên tiếp nhiều phòng trong 1 buổi (feedback 19/07). */}
      <View style={styles.meterRoomBadge}>
        <Text style={styles.meterRoomBadgeText}>
          📍{' '}
          {rentalMode === 'whole_house'
            ? selectedWholeHouse?.name ?? 'Nguyên căn'
            : `${selectedBuilding?.name ?? ''} · Phòng ${selectedRoom?.code ?? '—'}`}
        </Text>
      </View>
      <Text style={styles.hint}>
        Chỉ cần chụp rõ phần hiển thị số trên đồng hồ (không cần lấy trọn cả đồng hồ) —
        hệ thống OCR tự điền chỉ số, bạn có thể chỉnh lại. Ảnh được lưu kèm hợp đồng.
      </Text>
      {renderMeterInput('elec')}
      {renderMeterInput('water')}
    </ScrollView>
  )

  const renderConditionPhotoStep = () => {
    const targetLabel = rentalMode === 'whole_house' ? 'nhà' : 'phòng'
    return (
      <ScrollView
        style={styles.stepContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Ảnh hiện trạng {targetLabel}</Text>
        <Text style={styles.hint}>
          Chụp lại tường, cửa, thiết bị... để lưu bằng chứng bàn giao.
        </Text>
        <View style={styles.ocrBtnRow}>
          <TouchableOpacity
            style={styles.cameraBtn}
            onPress={() => addConditionPhoto(true)}
            disabled={photoUploading}
            activeOpacity={0.85}
          >
            <Text style={styles.cameraIcon}>📸</Text>
            <Text style={styles.cameraBtnText}>Chụp ảnh</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cameraBtn}
            onPress={() => addConditionPhoto(false)}
            disabled={photoUploading}
            activeOpacity={0.85}
          >
            <Text style={styles.cameraIcon}>🖼</Text>
            <Text style={styles.cameraBtnText}>Chọn ảnh</Text>
          </TouchableOpacity>
        </View>
        {photoUploading && (
          <View style={styles.uploadingRow}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.uploadingText}>Đang tải ảnh...</Text>
          </View>
        )}
        {conditionPhotos.length > 0 && (
          <View style={styles.photoGrid}>
            {conditionPhotos.map((uri, i) => (
              <View key={`${uri}-${i}`} style={styles.photoWrap}>
                <TouchableOpacity
                  style={styles.photoThumbTouch}
                  activeOpacity={0.85}
                  onPress={() => { setPreviewUrl(uri); setPreviewCapturedAt(conditionPhotosCapturedAt[i]) }}
                >
                  <Image source={{ uri }} style={styles.photoThumb} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.removePhotoBtn}
                  onPress={() => {
                    setConditionPhotos((prev) => prev.filter((_, idx) => idx !== i))
                    setConditionPhotosCapturedAt((prev) => prev.filter((_, idx) => idx !== i))
                  }}
                >
                  <Text style={styles.removePhotoText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Ghi chú hiện trạng</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={inspectionNotes}
            onChangeText={setInspectionNotes}
            multiline
            placeholder='Tường sạch, cửa tốt, máy lạnh đã kiểm tra...'
            placeholderTextColor={Colors.textMuted}
          />
        </View>
      </ScrollView>
    )
  }

  const addEquipmentItem = (name: string, category: string, quantity: number, cost: number) =>
    setAddedEquipments((prev) => [
      ...prev,
      { tempId: `ae-${Date.now()}`, name, category, quantity, cost },
    ])
  const removeAddedEquipment = (tempId: string) =>
    setAddedEquipments((prev) => prev.filter((a) => a.tempId !== tempId))

  const renderHandoverEquipmentStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Bàn giao thiết bị</Text>
      <Text style={styles.hint}>
        Toàn bộ nội thất có sẵn của phòng/nhà được tự động ghi vào hợp đồng — danh sách dưới chỉ để
        đối chiếu khi bàn giao, không cần tick chọn. Có thể thêm thiết bị khách yêu cầu lắp thêm — do
        chủ đầu tư mua, tính là tài sản của nhà.
      </Text>

      {/* Nội thất sẵn có — read-only, BE tự gắn toàn bộ (FE-contract-equipment-auto.md) */}
      <Text style={styles.handoverGroupTitle}>Nội thất sẵn có (tự ghi vào hợp đồng)</Text>
      {loadingEquipments ? (
        <View style={styles.emptyBox}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : availableEquipments.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            Phòng/nhà chưa có nội thất trong hệ thống — hợp đồng sẽ không có mục nội thất.
          </Text>
        </View>
      ) : (
        availableEquipments.map((e) => (
          <View key={e.id} style={styles.handoverRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.handoverName}>
                {equipName(e)}{e.quantity > 1 ? ` x${e.quantity}` : ''}
              </Text>
              {!!equipDetail(e) && (
                <Text style={styles.handoverMeta}>{equipDetail(e)}</Text>
              )}
            </View>
          </View>
        ))
      )}

      {/* Thiết bị lắp thêm */}
      <View style={styles.handoverAddHeader}>
        <Text style={styles.handoverGroupTitle}>Khách lắp thêm (chủ đầu tư mua)</Text>
        <TouchableOpacity
          style={styles.addMemberBtn}
          onPress={() => setShowAddEquipModal(true)}
        >
          <Text style={styles.addMemberText}>+ Thêm</Text>
        </TouchableOpacity>
      </View>
      {addedEquipments.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>Chưa có thiết bị lắp thêm.</Text>
        </View>
      ) : (
        addedEquipments.map((a) => (
          <View key={a.tempId} style={styles.handoverRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.handoverName}>
                {a.name} × {a.quantity}
              </Text>
              <Text style={styles.handoverMeta}>
                {a.category}
                {a.cost > 0 ? ` · ${formatVnd(a.cost)} đ` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={() => removeAddedEquipment(a.tempId)}>
              <Text style={styles.removeText}>Xoá</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      <View style={styles.handoverNote}>
        <Text style={styles.handoverNoteText}>
          💡 Nếu lắp thêm làm đổi giá thuê, hãy chỉnh giá đã thống nhất ở bước "Khách thuê" trước khi
          tạo hợp đồng.
        </Text>
      </View>
    </ScrollView>
  )

  const renderApprovalSubmittedStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <View style={styles.approvalBox}>
        <Text style={styles.approvalIcon}>📨</Text>
        <Text style={styles.approvalTitle}>Đã gửi Host duyệt giá</Text>
        <Text style={styles.approvalDesc}>
          Hợp đồng cho {tenantInfo.fullName || 'khách'} ({formatVnd(rentValue)} đ/tháng) đã được gửi cho
          Host phê duyệt. Hệ thống sẽ báo cho bạn khi Host phản hồi.
        </Text>
        <View style={styles.approvalSteps}>
          <Text style={styles.approvalStepText}>✅ Host đồng ý → bạn tiếp tục thu cọc & xác thực OTP.</Text>
          <Text style={styles.approvalStepText}>❌ Host từ chối → bạn chỉnh giá gửi lại hoặc hủy.</Text>
        </View>
        <Text style={styles.approvalHint}>
          Mở lại từ "Hợp đồng chờ xử lý" ở trang chủ để tiếp tục.
        </Text>
      </View>
      <TouchableOpacity
        style={styles.payBtn}
        onPress={() => navigation.navigate('ManagerTabs')}
      >
        <Text style={styles.payBtnText}>Về trang chủ</Text>
      </TouchableOpacity>
    </ScrollView>
  )

  const renderContractStep = () => {
    if (submittedForApproval) return renderApprovalSubmittedStep()
    return (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Xem lại & tạo hợp đồng</Text>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Tài sản</Text>
        <Text style={styles.summaryValue}>
          {rentalMode === 'whole_house'
            ? selectedWholeHouse?.name
            : `${selectedBuilding?.name} · ${selectedRoom?.code}`}
        </Text>
        <Text style={styles.summaryLabel}>Khách thuê</Text>
        <Text style={styles.summaryValue}>
          {tenantInfo.fullName || 'Chưa nhập'} · {tenantInfo.phone}
        </Text>
        <Text style={styles.summaryLabel}>Giá thuê / Cọc</Text>
        <Text style={styles.summaryValue}>
          {formatVnd(rentValue)} đ/tháng · cọc {formatVnd(depositValue)} đ (
          {depositMonths} tháng)
        </Text>
        <Text style={styles.summaryLabel}>Thời hạn hợp đồng</Text>
        <Text style={styles.summaryValue}>
          {todayStr} → {endDate || 'Chưa chọn'}
        </Text>
        <Text style={styles.summaryLabel}>Điện nước đầu kỳ</Text>
        <Text style={styles.summaryValue}>
          Điện {meters.elec || '-'} kWh · Nước {meters.water || '-'} m³
        </Text>
        <Text style={styles.summaryLabel}>Ảnh hiện trạng</Text>
        <Text style={styles.summaryValue}>{conditionPhotos.length} ảnh</Text>
        {rentalMode === 'whole_house' && (
          <>
            <Text style={styles.summaryLabel}>Thành viên ở cùng</Text>
            <Text style={styles.summaryValue}>
              {householdMembers.filter((m) => m.name.trim()).length} người
            </Text>
          </>
        )}
      </View>

      {/* Chế độ giá — Case 1 (đã thống nhất) vs Case 2 (gửi Host duyệt) */}
      <Text style={[styles.label, { marginTop: Spacing.base }]}>Giá thuê</Text>
      <View style={styles.methodRow}>
        <TouchableOpacity
          style={[styles.methodChip, priceMode === 'agreed' && styles.methodChipActive]}
          onPress={() => setPriceMode('agreed')}
          activeOpacity={0.85}
        >
          <Text style={[styles.methodChipText, priceMode === 'agreed' && styles.methodChipTextActive]}>
            ✅ Đã thống nhất với Host
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.methodChip, priceMode === 'approval' && styles.methodChipActive]}
          onPress={() => setPriceMode('approval')}
          activeOpacity={0.85}
        >
          <Text style={[styles.methodChipText, priceMode === 'approval' && styles.methodChipTextActive]}>
            📨 Gửi Host duyệt giá
          </Text>
        </TouchableOpacity>
      </View>

      {priceMode === 'agreed' ? (
        <>
          {/*
            Trước 08/08/2026 chỗ này có nhãn "Hình thức thu cọc" + 1 chip "Chuyển khoản
            (PayOS)". Chip đó không bấm được và không có lựa chọn nào khác — hệ thống
            thu cọc 100% chuyển khoản. Mentor yêu cầu bỏ vì bày ra một lựa chọn giả.
          */}
          <Text style={styles.hint}>
            Nhấn "Tiếp tục" để tạo hợp đồng và sang bước thanh toán cọc qua PayOS.
          </Text>
        </>
      ) : (
        <Text style={styles.hint}>
          Nhấn "Tiếp tục" để tạo hợp đồng và gửi Host duyệt giá. Sẽ thu cọc sau khi Host đồng ý.
        </Text>
      )}
    </ScrollView>
    )
  }

  /**
   * "Sau khi nhận nhà sẽ thu thêm" — xem trước tiền nhà chu kỳ đầu.
   *
   * Từ 10/08/2026 QR chỉ thu cọc, tiền nhà tháng vào ở phát thành hoá đơn riêng tính
   * theo số ngày ở thật. Khách vừa chuyển một khoản lớn xong mà hôm sau lại thấy hoá
   * đơn thì rất dễ nghĩ bị thu hai lần — nói trước ngay tại màn thu tiền là cách rẻ
   * nhất để tránh chuyện đó.
   *
   * Trả null khi BE không gửi (bản BE cũ, hoặc ẩn tiền khỏi manager theo ý 15) — thà
   * không hiện gì còn hơn tự tính một con số có thể lệch với hoá đơn BE phát ra.
   */
  const renderFirstRentPreview = () => {
    const b = contract?.firstRentPaymentBreakdown
    if (!b) return null

    // Vào ở ≤3 ngày cuối tháng: BE không phát hoá đơn riêng mà gộp sang tháng sau.
    const deferred = b.kind === 'RENT_FIRST_DEFERRED' || b.deferredToNextMonth
    return (
      <View style={styles.nextDueBox}>
        <View style={styles.nextDueHead}>
          <Text style={styles.nextDueTitle}>{b.title}</Text>
          {deferred ? (
            <Text style={styles.nextDueBadge}>Gộp tháng sau</Text>
          ) : (
            <Text style={styles.nextDueAmount}>{formatVnd(b.totalAmount)} đ</Text>
          )}
        </View>
        {!!b.formula && !deferred && (
          <Text style={styles.nextDueFormula}>{b.formula}</Text>
        )}
        <Text style={styles.nextDueNote}>{b.explanation}</Text>
      </View>
    )
  }

  const renderPaymentStep = () => {
    return (
      <ScrollView
        style={styles.stepContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Thanh toán tiền cọc</Text>
        <Text style={styles.hint}>
          Khách chuyển khoản {formatVnd(contract?.initialPaymentAmount ?? totalDueValue)} đ
          qua PayOS — đây là <Text style={styles.hintStrong}>tiền cọc</Text>, chưa gồm tiền
          nhà. Sau khi hệ thống ghi nhận, mới sang bước xác thực OTP.
        </Text>

        {paid ? (
          <View style={styles.paidBox}>
            <Text style={styles.paidIcon}>✅</Text>
            <Text style={styles.paidText}>Đã nhận thanh toán tiền cọc!</Text>
          </View>
        ) : (
          <>
            {!!contract?.payosQrCode && !showWebView && (
              <View style={styles.qrBox}>
                <Text style={styles.qrAmountLabel}>Tiền cọc thu qua QR</Text>
                <Text style={styles.qrAmount}>
                  {formatVnd(contract.initialPaymentAmount ?? totalDueValue)} đ
                </Text>
                {/* Tách cấu phần để manager giải thích được với khách. Dùng các dòng BE
                    dựng sẵn nếu có (`depositPaymentBreakdown.lines`) — khi ẩn tiền khỏi
                    manager thì BE trả null, lúc đó rơi về cách tính tại chỗ. */}
                <View style={styles.payBreakdown}>
                  {contract.depositPaymentBreakdown?.lines?.length ? (
                    contract.depositPaymentBreakdown.lines.map((l, i) => (
                      <View key={`${l.key}-${i}`} style={styles.payBreakdownRow}>
                        <Text style={styles.payBreakdownLabel}>• {l.label}</Text>
                        <Text style={styles.payBreakdownValue}>
                          {l.amount != null ? `${formatVnd(l.amount)} đ` : l.displayValue}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <View style={styles.payBreakdownRow}>
                      <Text style={styles.payBreakdownLabel}>• Tiền cọc ({depositMonths} tháng)</Text>
                      <Text style={styles.payBreakdownValue}>{formatVnd(depositValue)} đ</Text>
                    </View>
                  )}
                </View>

                {/* Khoản khách sẽ phải trả TIẾP sau khi nhận nhà. Nói trước ở đây để
                    manager không bị khách chất vấn "sao vừa đóng xong lại có hoá đơn". */}
                {renderFirstRentPreview()}
                <View style={styles.qrWrap}>
                  <QRCode value={contract.payosQrCode} size={220} />
                </View>
                <Text style={styles.qrCaption}>
                  Khách quét mã VietQR bằng app ngân hàng để thanh toán.
                </Text>
              </View>
            )}
            {!!contract?.payosCheckoutUrl && !showWebView && (
              <TouchableOpacity
                style={styles.payBtn}
                onPress={() => setShowWebView(true)}
              >
                <Text style={styles.payBtnText}>
                  💳 Mở trang thanh toán PayOS
                </Text>
              </TouchableOpacity>
            )}
            {showWebView && !!contract?.payosCheckoutUrl && (
              <View style={styles.webviewBox}>
                <WebView
                  source={{ uri: contract.payosCheckoutUrl }}
                  onNavigationStateChange={(nav) => {
                    if (nav.url?.startsWith(PAY_SUCCESS_URL)) {
                      setShowWebView(false)
                      checkPaidNow()
                    } else if (nav.url?.startsWith(PAY_CANCEL_URL)) {
                      setShowWebView(false)
                    }
                  }}
                />
              </View>
            )}
            <TouchableOpacity style={styles.checkBtn} onPress={checkPaidNow}>
              <Text style={styles.checkBtnText}>
                Tôi đã chuyển khoản — Kiểm tra
              </Text>
            </TouchableOpacity>
            <View style={styles.uploadingRow}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={styles.uploadingText}>
                Đang chờ xác nhận thanh toán...
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    )
  }

  const renderConfirmationStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Xác thực OTP</Text>
      <Text style={styles.hint}>
        Hệ thống đã gửi mã OTP đến SĐT {tenantInfo.phone} để khách xác nhận hợp
        đồng. Khách đọc mã cho bạn nhập vào đây.
      </Text>
      <View style={[styles.inputGroup, styles.otpGroup]}>
        <Text style={styles.label}>Mã OTP</Text>
        <TextInput
          style={[styles.input, styles.otpInput]}
          value={otp}
          onChangeText={setOtp}
          keyboardType='number-pad'
          maxLength={6}
          placeholder='------'
          placeholderTextColor={Colors.textMuted}
        />
      </View>
      <TouchableOpacity
        style={styles.resendOtpBtn}
        onPress={() => sendOtp(true)}
        disabled={otpSending || otpCooldown > 0}
      >
        {otpSending ? (
          <ActivityIndicator color={Colors.primary} />
        ) : (
          <Text style={styles.resendOtpText}>
            {otpCooldown > 0 ? `Gửi lại OTP sau ${otpCooldown}s` : 'Gửi lại OTP'}
          </Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.submitBtn,
          otp.length === 6 ? styles.submitBtnReady : styles.submitBtnDisabled,
        ]}
        onPress={verifyOTPAndSubmit}
        disabled={otp.length !== 6 || confirming}
      >
        {confirming ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <Text
            style={[
              styles.submitBtnText,
              otp.length === 6
                ? styles.submitTextReady
                : styles.submitTextDisabled,
            ]}
          >
            Hoàn tất khởi tạo
          </Text>
        )}
      </TouchableOpacity>
      <View style={styles.bottomSpacer} />
    </ScrollView>
  )

  const renderBody = () => {
    switch (currentLabel) {
      case MODE_STEP:
        return renderModeStep()
      case 'Chọn phòng':
        return renderRoomSelectionStep()
      case 'Chọn nhà nguyên căn':
        return renderWholeHouseSelectionStep()
      case 'Khách thuê':
      case 'Khách thuê chính':
        return renderTenantInfoStep()
      case 'Thành viên ở cùng':
        return renderHouseholdMembersStep()
      case 'Điện nước':
        return renderMeterStep()
      case 'Hiện trạng phòng':
      case 'Hiện trạng nhà':
        return renderConditionPhotoStep()
      case HANDOVER_STEP:
        return renderHandoverEquipmentStep()
      case 'Tạo hợp đồng':
        return renderContractStep()
      case 'Thanh toán cọc':
        return renderPaymentStep()
      case 'Xác nhận':
        return renderConfirmationStep()
      default:
        return null
    }
  }

  // Ẩn nút "Tiếp tục" ở bước cuối (Xác nhận), bước Thanh toán khi chưa trả,
  // và khi đã gửi Host duyệt giá (Case 2 — màn chờ duyệt có nút riêng).
  const showNextButton =
    currentLabel !== 'Xác nhận' &&
    !(currentLabel === 'Thanh toán cọc' && !paid) &&
    !submittedForApproval

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Đón khách mới</Text>
        <TouchableOpacity onPress={handleCancelAll} style={styles.cancelAllBtn}>
          <Text style={styles.cancelAllText}>✕ Huỷ</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.progressText}>
          Bước {step + 1}: {currentLabel}
        </Text>
      </View>

      <View style={styles.body}>{renderBody()}</View>

      {showNextButton && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.nextBtn}
            onPress={handleNext}
            disabled={creating}
          >
            {creating ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.nextBtnText}>Tiếp tục →</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {showAddEquipModal && (
        <AddEquipmentModal
          onClose={() => setShowAddEquipModal(false)}
          onAdd={(name, category, quantity, cost) => {
            addEquipmentItem(name, category, quantity, cost)
            setShowAddEquipModal(false)
          }}
        />
      )}

      {(photoUploading || ocrLoading !== null) && (
        <View style={styles.uploadOverlay}>
          <View style={styles.uploadOverlayCard}>
            <ActivityIndicator size='large' color={Colors.primary} />
            <Text style={styles.uploadOverlayText}>
              {ocrLoading !== null
                ? 'Đang tải ảnh & đọc chỉ số...'
                : 'Đang tải ảnh lên...'}
            </Text>
          </View>
        </View>
      )}

      <CameraCaptureModal
        visible={cameraTarget !== null}
        multi={cameraTarget === 'condition'}
        onCapture={handleCameraCapture}
        onClose={() => setCameraTarget(null)}
        onUseGalleryInstead={
          cameraTarget === 'elec' || cameraTarget === 'water'
            ? () => reportCameraBroken(cameraTarget)
            : undefined
        }
      />

      <MeterOverrideModal
        visible={overrideTarget !== null}
        meterKind={overrideTarget ?? 'ELEC'}
        // Hợp đồng chưa tồn tại ở bước này của luồng đón khách — BE nhận null.
        contractId={contract?.id ?? null}
        onCancel={() => setOverrideTarget(null)}
        onGranted={(token, reason) => {
          const kind = overrideTarget === 'WATER' ? 'water' : 'elec'
          setMeterOverride((prev) => ({ ...prev, [kind]: { token, reason } }))
          setOverrideTarget(null)
          // Số nhập sau khi xin mã vẫn là số gõ tay -> giữ nguyên yêu cầu tick cam kết.
          setManualEdited((prev) => ({ ...prev, [kind]: true }))
          setManualConfirmed((prev) => ({ ...prev, [kind]: false }))
        }}
      />

      {/* Xem ảnh phóng to — chạm bất kỳ đâu để đóng */}
      <Modal
        visible={!!previewUrl}
        transparent
        animationType='fade'
        onRequestClose={() => setPreviewUrl(null)}
      >
        <TouchableOpacity
          style={styles.previewBackdrop}
          activeOpacity={1}
          onPress={() => setPreviewUrl(null)}
        >
          {!!previewUrl && (
            <Image
              source={{ uri: previewUrl }}
              style={styles.previewImage}
              resizeMode='contain'
            />
          )}
          {!!previewCapturedAt && (
            <Text style={styles.previewCapturedAt}>
              🕒 Chụp lúc {new Date(previewCapturedAt).toLocaleString('vi-VN')}
            </Text>
          )}
          <TouchableOpacity
            style={styles.previewCloseBtn}
            onPress={() => setPreviewUrl(null)}
          >
            <Text style={styles.previewCloseText}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  )
}

// ===== Modal thêm thiết bị lắp thêm (chủ đầu tư mua) =====
const AddEquipmentModal: React.FC<{
  onClose: () => void
  onAdd: (name: string, category: string, quantity: number, cost: number) => void
}> = ({ onClose, onAdd }) => {
  const [name, setName] = useState('')
  const [category, setCategory] = useState(HANDOVER_CATEGORIES[0])
  const [quantity, setQuantity] = useState('1')
  const [cost, setCost] = useState('')

  const submit = () => {
    if (!name.trim()) return showAlert('Lỗi', 'Vui lòng nhập tên thiết bị.')
    const qty = Math.max(1, parseInt(quantity, 10) || 1)
    onAdd(name.trim(), category, qty, parseNum(cost))
  }

  return (
    <Modal transparent animationType='slide'>
      <View style={styles.addEquipOverlay}>
        <View style={styles.addEquipContent}>
          <Text style={styles.addEquipTitle}>Thêm thiết bị lắp thêm</Text>
          <Text style={styles.addEquipSubtitle}>Chủ đầu tư mua — tính là tài sản của nhà.</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Tên thiết bị *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder='Máy lạnh, máy giặt...'
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Danh mục</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.addEquipCatRow}>
                {HANDOVER_CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.addEquipCatChip, category === c && styles.addEquipCatChipActive]}
                    onPress={() => setCategory(c)}
                  >
                    <Text
                      style={[
                        styles.addEquipCatText,
                        category === c && styles.addEquipCatTextActive,
                      ]}
                    >
                      {c}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          <View style={styles.addEquipRow}>
            <View style={[styles.inputGroup, { flex: 1 }]}>
              <Text style={styles.label}>Số lượng</Text>
              <TextInput
                style={styles.input}
                value={quantity}
                onChangeText={(v) => setQuantity(v.replace(/[^0-9]/g, ''))}
                keyboardType='number-pad'
                placeholder='1'
                placeholderTextColor={Colors.textMuted}
              />
            </View>
            <View style={[styles.inputGroup, { flex: 2 }]}>
              <Text style={styles.label}>Chi phí (VNĐ)</Text>
              <TextInput
                style={styles.input}
                value={cost ? Number(parseNum(cost)).toLocaleString('vi-VN') : ''}
                onChangeText={(v) => setCost(v)}
                keyboardType='numeric'
                placeholder='Không bắt buộc'
                placeholderTextColor={Colors.textMuted}
              />
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.md }}>
            <TouchableOpacity style={[styles.addEquipCancelBtn, { flex: 1 }]} onPress={onClose}>
              <Text style={styles.addEquipCancelText}>Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.addEquipSubmitBtn, { flex: 2 }]} onPress={submit}>
              <Text style={styles.addEquipSubmitText}>Thêm thiết bị</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    ...Shadow.sm,
  },
  backBtn: { width: 70 },
  backText: { color: Colors.primary, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  headerSpacer: { width: 70 },
  cancelAllBtn: { width: 70, alignItems: 'flex-end' },
  cancelAllText: { color: Colors.error, fontWeight: '600' },

  progressContainer: {
    padding: Spacing.lg,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderColor: Colors.divider,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.divider,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  progressFill: { height: '100%', backgroundColor: Colors.primary },
  progressText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
    textAlign: 'center',
  },

  body: { flex: 1, padding: Spacing.lg },
  stepContent: { flex: 1 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  nextSectionTitle: { marginTop: Spacing.xl },
  hint: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
    marginBottom: Spacing.lg,
  },
  hintSmall: { fontSize: 12, color: Colors.textSecondary, marginTop: 6 },
  hintStrong: { fontWeight: '700' as const, color: Colors.textPrimary },

  readonlyField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  readonlyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600',
    flex: 1,
  },
  readonlyIcon: { fontSize: 16, opacity: 0.5 },

  modeGrid: { gap: Spacing.md },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    padding: Spacing.lg,
    ...Shadow.sm,
  },
  modeCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryBg,
  },
  modeIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  modeIconWrapActive: { backgroundColor: '#E0E7FF' },
  modeIcon: { fontSize: 28 },
  modeTextBlock: { flex: 1 },
  modeTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  modeTitleActive: { color: Colors.primary },
  modeDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  modeDescriptionActive: { color: Colors.textPrimary },

  cardList: { gap: Spacing.md },
  houseSearchInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  // Selector nhà dạng chip cuộn ngang (gọn 1 hàng -> không phải kéo dọc qua list dài)
  houseChipRow: { gap: Spacing.md, paddingVertical: 2, paddingRight: Spacing.md },
  houseChip: {
    minWidth: 150,
    maxWidth: 220,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  houseChipActive: { borderColor: Colors.primary, backgroundColor: '#EEF2FF' },
  houseChipName: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  houseChipNameActive: { color: Colors.primary },
  houseChipMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
  houseChipMetaActive: { color: Colors.primary },
  houseChipAddress: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  wholeHouseSummary: {
    marginTop: Spacing.lg,
    padding: Spacing.base,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  wholeHouseSummaryName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  wholeHouseSummaryMeta: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  propertyCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    padding: Spacing.base,
  },
  propertyCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryBg,
  },
  propertyCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: 6,
  },
  propertyName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  propertyNameActive: { color: Colors.primary },
  propertyMeta: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  propertyMetaActive: { color: Colors.textPrimary },
  countPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: '#EEF2FF',
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800',
  },
  countPillActive: { backgroundColor: Colors.primary, color: Colors.white },

  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  roomCard: {
    width: '47%',
    minHeight: 116,
    padding: Spacing.base,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryBg,
  },
  roomEmoji: { fontSize: 24, marginBottom: Spacing.xs },
  roomName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  roomNameActive: { color: Colors.primary },
  roomMeta: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  roomMetaActive: { color: Colors.textPrimary },

  inputGroup: { marginBottom: Spacing.md },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  input: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 16,
    color: Colors.textPrimary,
  },

  monthRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  monthChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  monthChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryBg,
  },
  monthChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  monthChipTextActive: { color: Colors.primary },
  methodRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  methodChip: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    alignItems: 'center',
  },
  methodChipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryBg,
  },
  methodChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  methodChipTextActive: { color: Colors.primary },
  depositBox: { flex: 1, alignItems: 'flex-end' },
  depositValue: { fontSize: 16, fontWeight: '800', color: Colors.primary },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  sectionHeaderText: { flex: 1 },
  addMemberBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  addMemberBtnDisabled: { backgroundColor: Colors.divider },
  addMemberText: { color: Colors.white, fontWeight: '700' },
  occupantBanner: {
    backgroundColor: Colors.primaryBg,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  occupantBannerFull: { backgroundColor: '#FEF2F2' },
  occupantBannerText: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  foundHint: {
    fontSize: 12,
    color: Colors.success,
    marginTop: 6,
    fontWeight: '600',
  },
  newAccountHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 6,
    fontWeight: '500',
  },
  warnHint: {
    fontSize: 12,
    color: Colors.warning,
    marginTop: 6,
    fontWeight: '600',
  },
  memberCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.base,
    marginBottom: Spacing.md,
  },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  memberTitle: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  removeText: { fontSize: 13, fontWeight: '700', color: Colors.error },
  memberInputGap: { height: Spacing.sm },

  meterRoomBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primaryBg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.sm,
  },
  meterRoomBadgeText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  meterCapturedAt: { fontSize: 11, color: Colors.textMuted, marginTop: 6 },
  // Chỉ số điện/nước căn PHẢI cho dễ đối chiếu theo hàng đơn vị với mặt đồng hồ.
  meterReadingInput: { textAlign: 'right' as const },
  meterSplitRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  meterIntInput: { flex: 3, letterSpacing: 2 },
  // Ô phần lẻ tô đỏ nhạt cho khớp vùng số đỏ trên mặt đồng hồ — nhìn là biết đang nhập vùng nào.
  meterDecInput: {
    flex: 1,
    letterSpacing: 2,
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    color: '#B91C1C',
    fontWeight: '800' as const,
  },
  meterSplitDot: { fontSize: 20, fontWeight: '800' as const, color: Colors.textMuted },
  meterSplitUnit: { fontSize: 13, fontWeight: '700' as const, color: Colors.textMuted, minWidth: 34 },
  meterRoundedNote: { fontSize: 12, color: Colors.textMuted, marginTop: 6, textAlign: 'right' as const },
  meterHintBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    gap: 2,
  },
  meterHintText: { fontSize: 11, color: '#92400E', lineHeight: 16 },
  meterHintStrong: { fontWeight: '800' as const },
  meterHintRed: { fontWeight: '800' as const, color: '#DC2626' },
  galleryFallbackLink: { fontSize: 11, color: Colors.textMuted, textDecorationLine: 'underline', marginTop: 4 },
  overrideLink: { fontSize: 11, color: '#B45309', fontWeight: '700' as const, textDecorationLine: 'underline', marginTop: 6 },
  overrideBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: BorderRadius.md,
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    marginTop: 6,
  },
  overrideBadgeText: { flex: 1, fontSize: 11, fontWeight: '700' as const, color: '#B91C1C' },
  overrideBadgeClear: { fontSize: 11, fontWeight: '700' as const, color: '#B91C1C', textDecorationLine: 'underline' },
  meterCard: {
    backgroundColor: Colors.white,
    padding: Spacing.base,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  meterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  meterEmoji: { fontSize: 24 },
  meterTextBlock: { flex: 1 },
  meterTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  meterHint: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  meterThumbWrap: {
    position: 'relative',
    marginBottom: Spacing.md,
  },
  meterThumb: {
    width: '100%',
    height: 150,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.divider,
  },
  ocrBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  ocrBtn: {
    backgroundColor: Colors.primaryBg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
  },
  ocrBtnText: { color: Colors.primary, fontWeight: '700' },

  cameraBtn: {
    flex: 1,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.lg,
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  cameraIcon: { fontSize: 28, marginBottom: Spacing.xs },
  cameraBtnText: { fontSize: 14, fontWeight: '800', color: Colors.textPrimary },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: Spacing.md,
  },
  uploadingText: { color: Colors.textSecondary, fontSize: 13 },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  photoWrap: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    backgroundColor: Colors.divider,
  },
  photoThumbTouch: {
    width: '100%',
    height: '100%',
  },
  photoThumb: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.divider,
  },
  removePhotoBtn: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 21,
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: '85%',
  },
  previewCloseBtn: {
    position: 'absolute',
    top: Spacing.xl,
    right: Spacing.base,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCloseText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  previewCapturedAt: {
    marginTop: Spacing.sm,
    color: Colors.white,
    fontSize: 13,
  },
  notesInput: {
    minHeight: 92,
    textAlignVertical: 'top',
    marginTop: Spacing.md,
  },

  emptyBox: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  emptyText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },

  summaryCard: {
    backgroundColor: Colors.primaryBg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xl,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  summaryValue: {
    fontSize: 15,
    color: Colors.primaryDark,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },

  qrBox: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  qrAmountLabel: { fontSize: 12, color: Colors.textSecondary },
  qrAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.primary,
    marginBottom: Spacing.sm,
  },
  payBreakdown: {
    alignSelf: 'stretch',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: 4,
    marginBottom: Spacing.md,
  },
  payBreakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payBreakdownLabel: { fontSize: 12, color: Colors.textSecondary },
  payBreakdownValue: { fontSize: 12, fontWeight: '700' as const, color: Colors.textPrimary },

  // Khối "sẽ thu tiếp sau khi nhận nhà" — nền khác hẳn khối QR để không bị đọc nhầm
  // thành một phần của số tiền đang phải chuyển.
  nextDueBox: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  nextDueHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  nextDueTitle: { flex: 1, fontSize: 12, fontWeight: '700' as const, color: '#9A3412' },
  nextDueAmount: { fontSize: 14, fontWeight: '800' as const, color: '#9A3412' },
  nextDueBadge: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: '#9A3412',
    backgroundColor: '#FED7AA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden' as const,
  },
  nextDueFormula: { marginTop: 6, fontSize: 12, color: '#9A3412', fontVariant: ['tabular-nums'] as const },
  nextDueNote: { marginTop: 6, fontSize: 11, color: Colors.textSecondary, lineHeight: 16 },
  qrWrap: {
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
  },
  qrCaption: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  payBtn: {
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  payBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  webviewBox: {
    height: 460,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  checkBtn: {
    borderWidth: 1,
    borderColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  checkBtnText: { color: Colors.primary, fontSize: 15, fontWeight: '700' },
  paidBox: {
    backgroundColor: '#ECFDF5',
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  paidIcon: { fontSize: 40, marginBottom: Spacing.sm },
  paidText: { fontSize: 16, fontWeight: '800', color: Colors.success },

  otpGroup: { marginTop: Spacing.sm },
  otpInput: { fontSize: 24, textAlign: 'center', letterSpacing: 5 },
  submitBtn: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  submitBtnReady: { backgroundColor: Colors.success },
  submitBtnDisabled: { backgroundColor: Colors.divider },
  submitBtnText: { fontSize: 16, fontWeight: '700' },
  submitTextReady: { color: Colors.white },
  submitTextDisabled: { color: Colors.textMuted },
  resendOtpBtn: { alignItems: 'center', paddingVertical: Spacing.sm, marginTop: Spacing.sm },
  resendOtpText: { color: Colors.primary, fontSize: 13, fontWeight: '600' },
  bottomSpacer: { height: 100 },

  footer: {
    padding: Spacing.lg,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderColor: Colors.divider,
  },
  nextBtn: {
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  nextBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },

  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  uploadOverlayCard: {
    backgroundColor: Colors.white,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    minWidth: 200,
  },
  uploadOverlayText: {
    marginTop: Spacing.md,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },

  // ===== Bàn giao thiết bị =====
  handoverGroupTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  handoverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  handoverRowActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryBg },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkboxTick: { color: Colors.white, fontSize: 14, fontWeight: '800' },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  confirmText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  handoverName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  handoverMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  handoverAddHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
  },
  handoverNote: {
    backgroundColor: '#FFFBEB',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  handoverNoteText: { fontSize: 12, color: '#92400E', lineHeight: 18 },

  // ===== Màn chờ Host duyệt giá =====
  approvalBox: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    ...Shadow.sm,
    marginBottom: Spacing.lg,
  },
  approvalIcon: { fontSize: 44, marginBottom: Spacing.sm },
  approvalTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.sm },
  approvalDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  approvalSteps: {
    alignSelf: 'stretch',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    gap: 6,
  },
  approvalStepText: { fontSize: 13, color: Colors.textPrimary, lineHeight: 19 },
  approvalHint: { fontSize: 12, color: Colors.textMuted, marginTop: Spacing.md, textAlign: 'center' },

  // ===== Modal thêm thiết bị =====
  addEquipOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  addEquipContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
    paddingBottom: 40,
  },
  addEquipTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  addEquipSubtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.lg, marginTop: 2 },
  addEquipRow: { flexDirection: 'row', gap: Spacing.md },
  addEquipCatRow: { flexDirection: 'row', gap: Spacing.sm },
  addEquipCatChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addEquipCatChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  addEquipCatText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  addEquipCatTextActive: { color: Colors.white },
  addEquipCancelBtn: {
    backgroundColor: Colors.background,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addEquipCancelText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  addEquipSubmitBtn: {
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  addEquipSubmitText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
})
