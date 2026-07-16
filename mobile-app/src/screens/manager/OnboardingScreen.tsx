import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFocusEffect } from '@react-navigation/native'
import * as ImagePicker from 'expo-image-picker'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { DatePickerField } from '@/components/common/DatePickerField'
import { BorderRadius, Colors, Shadow, Spacing } from '@/constants'
import { uploadImageToCloudinary } from '@/services/core/cloudinary'
import {
  ApiProperty,
  ApiRoom,
  realPropertyService,
} from '@/services/manager/propertyApi'
import {
  EquipmentSnapshotItem,
  OnboardTenantRequest,
  realTenantService,
  TenantContractResponse,
} from '@/services/tenant/tenantService'
import { realEquipmentService } from '@/services/manager/equipmentService'
import type { EquipmentDto } from '@/types'

type RentalMode = 'room' | 'whole_house'

interface HouseholdMemberForm {
  id: string
  name: string
  relation: string
  phone: string
  dateOfBirth: string // dd/MM/yyyy
  cccd: string
}

// URL mốc PayOS redirect về (phải khớp PAYOS_RETURN_URL / PAYOS_CANCEL_URL ở backend)
const PAY_SUCCESS_URL = 'https://slms.app/payment-success'
const PAY_CANCEL_URL = 'https://slms.app/payment-cancel'

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

// Nhãn vị trí trong nhà (BE trả houseArea cho thiết bị nguyên căn).
const HOUSE_AREA_LABEL: Record<string, string> = {
  LIVING_ROOM: 'Phòng khách',
  BEDROOM: 'Phòng ngủ',
  KITCHEN: 'Bếp',
  BATHROOM: 'Nhà tắm',
  BALCONY: 'Ban công',
  GARAGE: 'Gara',
  OTHER: 'Khác',
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

type DepositMethod = 'payos' | 'cash'

// Khoá lưu nháp onboarding (1 phiên đón khách dở dang)
const DRAFT_KEY = 'onboarding_draft_v1'

export const OnboardingScreen: React.FC<any> = ({ navigation }) => {
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
  const [depositMethod, setDepositMethod] = useState<DepositMethod>('payos') // PayOS hoặc thu tiền mặt
  const [householdMembers, setHouseholdMembers] = useState<
    HouseholdMemberForm[]
  >([])
  const [lookupFound, setLookupFound] = useState(false)
  const [lookupChecked, setLookupChecked] = useState(false) // đã lookup xong cho SĐT hợp lệ
  const [lookupRole, setLookupRole] = useState<string | null>(null) // role tài khoản đã có (BE trả về)

  // Lưu nháp: chỉ bắt đầu lưu sau khi đã load xong draft; đánh dấu hoàn tất để bỏ qua cảnh báo thoát
  const draftLoadedRef = useRef(false)
  const completedRef = useRef(false)

  // Điện nước + ảnh đồng hồ
  const [meters, setMeters] = useState({ elec: '', water: '' })
  const [elecMeterUrl, setElecMeterUrl] = useState('')
  const [waterMeterUrl, setWaterMeterUrl] = useState('')
  const [ocrLoading, setOcrLoading] = useState<'elec' | 'water' | null>(null)

  // Ảnh hiện trạng (Cloudinary URLs)
  const [conditionPhotos, setConditionPhotos] = useState<string[]>([])
  const [photoUploading, setPhotoUploading] = useState(false)
  const [inspectionNotes, setInspectionNotes] = useState('')

  // Bàn giao thiết bị
  const [availableEquipments, setAvailableEquipments] = useState<EquipmentDto[]>([])
  const [loadingEquipments, setLoadingEquipments] = useState(false)
  // map equipmentId -> có bàn giao cho khách không (mặc định true)
  const [handoverSelected, setHandoverSelected] = useState<Record<number, boolean>>({})
  const [addedEquipments, setAddedEquipments] = useState<AddedEquipmentForm[]>([])
  const [showAddEquipModal, setShowAddEquipModal] = useState(false)

  // Chế độ giá khi tạo HĐ: 'agreed' = đã thống nhất với Host (kích hoạt ngay) ·
  // 'approval' = gửi Host duyệt giá (tạm dừng, chưa thu cọc).
  const [priceMode, setPriceMode] = useState<'agreed' | 'approval'>('agreed')

  const [otp, setOtp] = useState('')

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
          Alert.alert(
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

  // Tải thiết bị sẵn có của phòng/nhà khi vào bước "Bàn giao thiết bị".
  useEffect(() => {
    if (currentLabel !== HANDOVER_STEP) return
    const roomId = rentalMode === 'room' ? Number(selectedRoomId) : null
    const propertyId =
      rentalMode === 'whole_house' ? Number(selectedWholeHouseId) : Number(selectedBuildingId)
    let active = true
    setLoadingEquipments(true)
    const fetcher =
      rentalMode === 'room' && roomId
        ? realEquipmentService.getByRoom(roomId)
        : realEquipmentService.getByProperty(propertyId)
    fetcher
      .then((list) => {
        if (!active) return
        setAvailableEquipments(list)
        // Mặc định bàn giao tất cả thiết bị sẵn có (giữ lựa chọn cũ nếu đã có).
        setHandoverSelected((prev) => {
          const next = { ...prev }
          list.forEach((e) => {
            if (next[e.id] === undefined) next[e.id] = true
          })
          return next
        })
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
    setDepositMethod(d.depositMethod ?? 'payos')
    setHouseholdMembers(d.householdMembers ?? [])
    setMeters(d.meters ?? { elec: '', water: '' })
    setElecMeterUrl(d.elecMeterUrl ?? '')
    setWaterMeterUrl(d.waterMeterUrl ?? '')
    setConditionPhotos(d.conditionPhotos ?? [])
    setInspectionNotes(d.inspectionNotes ?? '')
    setHandoverSelected(d.handoverSelected ?? {})
    setAddedEquipments(d.addedEquipments ?? [])
    setPriceMode(d.priceMode ?? 'agreed')
    setContract(d.contract ?? null)
    setPaid(d.paid ?? false)
  }

  // Load nháp 1 lần khi mở màn hình -> hỏi tiếp tục / làm mới
  useEffect(() => {
    ;(async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY)
        const d = raw ? JSON.parse(raw) : null
        if (d && d.rentalMode) {
          await new Promise<void>((resolve) => {
            Alert.alert(
              'Tiếp tục đón khách?',
              'Có một phiên đón khách đang dở. Bạn muốn tiếp tục hay làm mới?',
              [
                {
                  text: 'Làm mới',
                  style: 'destructive',
                  onPress: () => {
                    AsyncStorage.removeItem(DRAFT_KEY).catch(() => {})
                    resolve()
                  },
                },
                {
                  text: 'Tiếp tục',
                  onPress: () => {
                    restoreDraft(d)
                    resolve()
                  },
                },
              ],
              { cancelable: false },
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
      depositMethod,
      householdMembers,
      meters,
      elecMeterUrl,
      waterMeterUrl,
      conditionPhotos,
      inspectionNotes,
      handoverSelected,
      addedEquipments,
      priceMode,
      contract,
      paid,
    }
    const t = setTimeout(() => {
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot)).catch(() => {})
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
    depositMethod,
    householdMembers,
    meters,
    elecMeterUrl,
    waterMeterUrl,
    conditionPhotos,
    inspectionNotes,
    handoverSelected,
    addedEquipments,
    priceMode,
    contract,
    paid,
  ])

  const clearDraft = () => {
    AsyncStorage.removeItem(DRAFT_KEY).catch(() => {})
  }

  // Cảnh báo khi thoát giữa chừng (nếu đã có tiến trình & chưa hoàn tất)
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e: any) => {
      if (completedRef.current || !hasMeaningfulProgress) return
      e.preventDefault()
      Alert.alert(
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
    setConditionPhotos([])
    setInspectionNotes('')
    setOtp('')
    setEndDate('')
    setContract(null)
    setPaid(false)
    setLookupFound(false)
    setLookupChecked(false)
    setLookupRole(null)
    setDepositMethod('payos')
  }

  const updateTenantInfo = (key: keyof typeof tenantInfo, value: string) =>
    setTenantInfo((prev) => ({ ...prev, [key]: value }))

  const hasRequiredTenantInfo = () =>
    !!tenantInfo.fullName.trim() &&
    !!tenantInfo.phone.trim() &&
    !!tenantInfo.cccd.trim() &&
    rentValue > 0
  const hasRequiredMeters = () => !!meters.elec.trim() && !!meters.water.trim()

  const handleNext = async () => {
    switch (currentLabel) {
      case MODE_STEP:
        if (!rentalMode)
          return Alert.alert('Lỗi', 'Vui lòng chọn loại đón khách.')
        break
      case 'Chọn phòng':
        if (!selectedBuildingId || !selectedRoomId)
          return Alert.alert('Lỗi', 'Vui lòng chọn toà nhà và phòng trống.')
        break
      case 'Chọn nhà nguyên căn':
        if (!selectedWholeHouseId)
          return Alert.alert('Lỗi', 'Vui lòng chọn nhà nguyên căn.')
        break
      case 'Khách thuê':
      case 'Khách thuê chính':
        if (!hasRequiredTenantInfo())
          return Alert.alert('Lỗi', 'Vui lòng nhập Tên, SĐT, CCCD và giá thuê.')
        if (!isValidVnPhone(tenantInfo.phone))
          return Alert.alert(
            'SĐT không hợp lệ',
            'Số điện thoại phải gồm 10 chữ số và bắt đầu bằng số 0.',
          )
        if (!isValidCccd(tenantInfo.cccd))
          return Alert.alert(
            'CCCD không hợp lệ',
            'Số căn cước công dân phải gồm đúng 12 chữ số.',
          )
        {
          const end = parseDmy(endDate)
          if (!end)
            return Alert.alert(
              'Thiếu ngày kết thúc',
              'Vui lòng chọn ngày kết thúc hợp đồng.',
            )
          const endSod = startOfDay(end)
          if (endSod < minEndDate)
            return Alert.alert(
              'Ngày kết thúc không hợp lệ',
              'Ngày kết thúc hợp đồng phải sau ngày hợp đồng hiệu lực (hôm nay).',
            )
          if (endSod > maxEndDate)
            return Alert.alert(
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
            return Alert.alert(
              'SĐT thành viên không hợp lệ',
              `Số điện thoại của "${m.name.trim() || 'thành viên'}" phải gồm 10 chữ số và bắt đầu bằng số 0.`,
            )
          if (m.cccd.trim() && !isValidCccd(m.cccd))
            return Alert.alert(
              'CCCD thành viên không hợp lệ',
              `Số CCCD của "${m.name.trim() || 'thành viên'}" phải gồm đúng 12 chữ số.`,
            )
          if (m.dateOfBirth.trim()) {
            const dob = parseDmy(m.dateOfBirth)
            if (!dob || startOfDay(dob) > today)
              return Alert.alert(
                'Ngày sinh không hợp lệ',
                `Ngày sinh của "${m.name.trim() || 'thành viên'}" không được vượt quá ngày hiện tại.`,
              )
          }
        }
        break
      }
      case 'Điện nước':
        if (!hasRequiredMeters())
          return Alert.alert(
            'Lỗi',
            'Vui lòng ghi nhận chỉ số điện nước ban đầu.',
          )
        break
      case 'Hiện trạng phòng':
      case 'Hiện trạng nhà':
        if (conditionPhotos.length === 0)
          return Alert.alert(
            'Lỗi',
            'Vui lòng chụp/tải ít nhất 1 ảnh hiện trạng.',
          )
        break
      case HANDOVER_STEP:
        // Không bắt buộc chọn thiết bị, nhưng món lắp thêm phải có tên + số lượng > 0.
        for (const a of addedEquipments) {
          if (!a.name.trim())
            return Alert.alert('Thiếu tên thiết bị', 'Vui lòng nhập tên cho thiết bị lắp thêm.')
          if (a.quantity <= 0)
            return Alert.alert('Số lượng không hợp lệ', `Thiết bị "${a.name.trim()}" cần số lượng lớn hơn 0.`)
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
    Alert.alert(
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
  const pickImage = async (useCamera: boolean) => {
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (perm.status !== 'granted') {
        Alert.alert('Lỗi', 'Cần quyền camera.')
        return null
      }
      const r = await ImagePicker.launchCameraAsync({ quality: 0.6 })
      return r.canceled ? null : r.assets[0].uri
    }
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 })
    return r.canceled ? null : r.assets[0].uri
  }

  const captureMeter = async (kind: 'elec' | 'water', useCamera: boolean) => {
    const uri = await pickImage(useCamera)
    if (!uri) return
    try {
      setOcrLoading(kind)
      const url = await uploadImageToCloudinary(uri)
      if (kind === 'elec') setElecMeterUrl(url)
      else setWaterMeterUrl(url)
      // OCR đọc số
      const ocr = await realTenantService.ocrMeter(url)
      if (ocr.reading) {
        setMeters((prev) => ({ ...prev, [kind]: ocr.reading }))
      }
    } catch (err: any) {
      Alert.alert(
        'OCR',
        readErr(err, 'Không đọc được ảnh, vui lòng nhập số tay.'),
      )
    } finally {
      setOcrLoading(null)
    }
  }

  const addConditionPhoto = async (useCamera: boolean) => {
    let uris: string[] = []
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (perm.status !== 'granted') {
        Alert.alert('Lỗi', 'Cần quyền camera.')
        return
      }
      const r = await ImagePicker.launchCameraAsync({ quality: 0.6 })
      if (!r.canceled) uris = [r.assets[0].uri]
    } else {
      // Cho chọn nhiều ảnh cùng lúc từ thư viện
      const r = await ImagePicker.launchImageLibraryAsync({
        quality: 0.6,
        allowsMultipleSelection: true,
        selectionLimit: 10,
      })
      if (!r.canceled) uris = r.assets.map((a) => a.uri)
    }
    if (uris.length === 0) return
    try {
      setPhotoUploading(true)
      const urls = await Promise.all(
        uris.map((u) => uploadImageToCloudinary(u)),
      )
      setConditionPhotos((prev) => [...prev, ...urls])
    } catch (err: any) {
      Alert.alert('Lỗi', readErr(err, 'Upload ảnh thất bại.'))
    } finally {
      setPhotoUploading(false)
    }
  }

  // ===== Household =====
  const addHouseholdMember = () => {
    if (!canAddMember) {
      Alert.alert(
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

  // BE trả tên thiết bị ở catalogName, mô tả ở note, vị trí ở houseArea (không có field category).
  // Đọc linh hoạt để tránh hiển thị trống.
  const equipName = (e: EquipmentDto): string =>
    e.equipmentName || (e as any).name || (e as any).catalogName || 'Thiết bị'
  const equipDetail = (e: EquipmentDto): string =>
    (e as any).note ||
    HOUSE_AREA_LABEL[(e as any).houseArea as keyof typeof HOUSE_AREA_LABEL] ||
    e.category ||
    ''
  // Dùng cho snapshot (cần 1 nhãn "danh mục"): ưu tiên vị trí trong nhà.
  const equipCategory = (e: EquipmentDto): string =>
    HOUSE_AREA_LABEL[(e as any).houseArea as keyof typeof HOUSE_AREA_LABEL] ||
    e.category ||
    (e as any).catalogName ||
    ''

  // Biên bản bàn giao thiết bị (snapshot theo hợp đồng): thiết bị sẵn có được tick
  // + thiết bị khách lắp thêm (chủ đầu tư mua). Serialize thành JSON cho field equipmentSnapshot.
  const buildEquipmentSnapshotItems = (): EquipmentSnapshotItem[] => [
    ...availableEquipments
      .filter((e) => handoverSelected[e.id])
      .map((e): EquipmentSnapshotItem => ({
        equipmentId: e.id,
        name: equipName(e),
        category: equipCategory(e),
        quantity: 1,
        source: 'EXISTING',
        ownedBy: 'OWNER',
      })),
    ...addedEquipments.map((a): EquipmentSnapshotItem => ({
      name: a.name.trim(),
      category: a.category,
      quantity: a.quantity,
      cost: a.cost || undefined,
      source: 'ADDED',
      ownedBy: 'OWNER',
    })),
  ]

  const buildPayload = (): OnboardTenantRequest => ({
    fullName: tenantInfo.fullName.trim(),
    cccd: tenantInfo.cccd.trim(),
    phoneNumber: tenantInfo.phone.trim(),
    moveInDate: toIsoDate(todayStr), // ngày hợp đồng hiệu lực = hôm nay
    endDate: toIsoDate(endDate), // ngày kết thúc hợp đồng
    rentAmount: rentValue,
    deposit: depositValue,
    depositMonths,
    initialElectricReading: parseNum(meters.elec),
    initialWaterReading: parseNum(meters.water),
    electricMeterImageUrl: elecMeterUrl || undefined,
    waterMeterImageUrl: waterMeterUrl || undefined,
    roomConditionUrls: conditionPhotos,
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
    // Nội thất: KHÔNG còn gửi equipmentSnapshot/declinedEquipmentIds — BE tự gắn toàn
    // bộ thiết bị ACTIVE và tự sinh snapshot (FE-contract-equipment-auto.md 2026-07).
    // Màn hình này là bản cũ (điều hướng thật đã dùng OnboardingScreenV2) — tick chọn
    // ở UI chỉ còn tính tham khảo, không ảnh hưởng hợp đồng.
    // Case 2: chưa chắc giá -> gửi Host duyệt, BE tạo HĐ chờ duyệt và CHƯA thu cọc.
    requireHostPriceApproval: priceMode === 'approval',
    // Case 1 thu cọc luôn theo phương thức đã chọn; Case 2 hoãn tới sau khi Host duyệt.
    requireDepositPayment: priceMode === 'agreed' && depositMethod === 'payos',
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

        // Tạo thiết bị lắp thêm thành tài sản nhà (chủ đầu tư mua) — best-effort, chỉ 1 lần.
        await createAddedEquipments()
      }

      // Case 2: gửi Host duyệt giá -> KHÔNG thu cọc, dừng tại màn "chờ duyệt".
      if (priceMode === 'approval') {
        completedRef.current = true // bỏ qua cảnh báo thoát
        clearDraft()
        return
      }

      // Thu cọc tiền mặt -> bỏ qua PayOS, sang bước xác nhận thu cọc thủ công.
      if (depositMethod === 'cash') {
        setStep((prev) => prev + 1)
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
      Alert.alert('Lỗi', readErr(err, 'Không tạo được hợp đồng/thanh toán.'))
    } finally {
      setCreating(false)
    }
  }

  // Tạo các thiết bị khách lắp thêm thành tài sản của nhà/phòng. Best-effort:
  // lỗi (BE chưa sẵn / không có quyền) không chặn luồng đón khách.
  const createAddedEquipments = async () => {
    if (addedEquipments.length === 0) return
    const propertyId =
      rentalMode === 'whole_house'
        ? Number(selectedWholeHouseId)
        : Number(selectedBuildingId)
    const roomId = rentalMode === 'room' ? Number(selectedRoomId) : undefined
    await Promise.all(
      addedEquipments.map((a) =>
        realEquipmentService
          .create(propertyId, {
            equipmentName: a.name.trim(),
            category: a.category,
            roomId,
          })
          .catch(() => {
            /* best-effort: snapshot vẫn lưu kèm hợp đồng */
          }),
      ),
    )
  }

  const checkPaidNow = async () => {
    if (!contract) return
    try {
      const c = await realTenantService.checkPayment(contract.id)
      if (c.paymentStatus === 'PAID') {
        setPaid(true)
        setShowWebView(false)
      } else
        Alert.alert(
          'Chưa nhận được thanh toán',
          'PayOS chưa ghi nhận giao dịch. Vui lòng thử lại sau vài giây.',
        )
    } catch (err: any) {
      Alert.alert('Lỗi', readErr(err, 'Không kiểm tra được trạng thái.'))
    }
  }

  const verifyOTPAndSubmit = async () => {
    if (otp !== '123456')
      return Alert.alert('Lỗi', 'Mã OTP không hợp lệ (demo: 123456).')
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
        username: res.tenantUsername ?? tenantInfo.phone,
        accountCreated: res.tenantAccountCreated ?? !lookupFound,
        rolePromoted:
          res.tenantRolePromoted ?? (lookupFound && lookupRole === 'ROLE_USER'),
      })
    } catch (err: any) {
      Alert.alert('Lỗi', readErr(err, 'Không hoàn tất được hợp đồng.'))
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
          <TouchableOpacity
            style={styles.ocrBtn}
            onPress={() => captureMeter(kind, false)}
            disabled={ocrLoading !== null}
          >
            <Text style={styles.ocrBtnText}>🖼 Chọn ảnh</Text>
          </TouchableOpacity>
          {ocrLoading === kind && (
            <ActivityIndicator
              color={Colors.primary}
              style={{ marginLeft: 8 }}
            />
          )}
        </View>
        {!!url && <Image source={{ uri: url }} style={styles.meterThumb} />}
        <TextInput
          style={styles.input}
          value={meters[kind]}
          onChangeText={(v) => setMeters((prev) => ({ ...prev, [kind]: v }))}
          keyboardType='numeric'
          placeholder='OCR tự điền, có thể chỉnh'
          placeholderTextColor={Colors.textMuted}
        />
      </View>
    )
  }

  const renderMeterStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Ghi nhận điện nước ban đầu</Text>
      <Text style={styles.hint}>
        Chụp/chọn ảnh đồng hồ — hệ thống OCR tự điền chỉ số, bạn có thể chỉnh
        lại. Ảnh được lưu kèm hợp đồng.
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
                <Image source={{ uri }} style={styles.photoThumb} />
                <TouchableOpacity
                  style={styles.removePhotoBtn}
                  onPress={() =>
                    setConditionPhotos((prev) => prev.filter((x) => x !== uri))
                  }
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
        Chọn đúng thiết bị bàn giao cho khách. Bỏ tick món khách không nhận — thiết bị đó sẽ được gỡ
        khỏi phòng (giữ nguyên tình trạng, tự lắp lại khi hết hợp đồng). Có thể thêm thiết bị khách yêu
        cầu lắp thêm — do chủ đầu tư mua, tính là tài sản của nhà.
      </Text>

      {/* Thiết bị sẵn có */}
      <Text style={styles.handoverGroupTitle}>Thiết bị sẵn có</Text>
      {loadingEquipments ? (
        <View style={styles.emptyBox}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : availableEquipments.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>Phòng/nhà này chưa có thiết bị sẵn có.</Text>
        </View>
      ) : (
        availableEquipments.map((e) => {
          const checked = handoverSelected[e.id] ?? true
          return (
            <TouchableOpacity
              key={e.id}
              style={[styles.handoverRow, checked && styles.handoverRowActive]}
              onPress={() =>
                setHandoverSelected((prev) => ({ ...prev, [e.id]: !checked }))
              }
              activeOpacity={0.85}
            >
              <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                {checked && <Text style={styles.checkboxTick}>✓</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.handoverName}>{equipName(e)}</Text>
                {!!equipDetail(e) && (
                  <Text style={styles.handoverMeta}>{equipDetail(e)}</Text>
                )}
                {!!(e as any).houseArea && (
                  <Text style={styles.handoverMeta}>
                    📍 {HOUSE_AREA_LABEL[(e as any).houseArea] ?? (e as any).houseArea}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          )
        })
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
          <Text style={[styles.label, { marginTop: Spacing.base }]}>
            Hình thức thu cọc
          </Text>
          <View style={styles.methodRow}>
            <TouchableOpacity
              style={[
                styles.methodChip,
                depositMethod === 'payos' && styles.methodChipActive,
              ]}
              onPress={() => setDepositMethod('payos')}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.methodChipText,
                  depositMethod === 'payos' && styles.methodChipTextActive,
                ]}
              >
                💳 Chuyển khoản (PayOS)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.methodChip,
                depositMethod === 'cash' && styles.methodChipActive,
              ]}
              onPress={() => setDepositMethod('cash')}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.methodChipText,
                  depositMethod === 'cash' && styles.methodChipTextActive,
                ]}
              >
                💵 Tiền mặt
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            {depositMethod === 'payos'
              ? 'Nhấn "Tiếp tục" để tạo hợp đồng và sang bước thanh toán cọc qua PayOS.'
              : 'Khách nộp cọc tiền mặt trực tiếp. Nhấn "Tiếp tục" để tạo hợp đồng rồi xác nhận đã thu cọc.'}
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

  const renderCashDepositStep = () => (
    <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Thu cọc tiền mặt</Text>
      <Text style={styles.hint}>
        Xác nhận đã nhận đủ tiền cọc {formatVnd(depositValue)} đ bằng tiền mặt
        từ khách. Sau đó sang bước xác thực OTP.
      </Text>
      {paid ? (
        <View style={styles.paidBox}>
          <Text style={styles.paidIcon}>✅</Text>
          <Text style={styles.paidText}>Đã xác nhận thu cọc tiền mặt!</Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.payBtn} onPress={() => setPaid(true)}>
          <Text style={styles.payBtnText}>💵 Xác nhận đã thu cọc tiền mặt</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  )

  const renderPaymentStep = () => {
    if (depositMethod === 'cash') return renderCashDepositStep()
    return (
      <ScrollView
        style={styles.stepContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Thanh toán tiền cọc</Text>
        <Text style={styles.hint}>
          Khách chuyển khoản tiền cọc {formatVnd(depositValue)} đ qua PayOS. Sau
          khi hệ thống ghi nhận, mới sang bước xác thực OTP.
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
                <Text style={styles.qrAmount}>{formatVnd(depositValue)} đ</Text>
                <View style={styles.qrWrap}>
                  <QRCode value={contract.payosQrCode} size={220} />
                </View>
                <Text style={styles.qrCaption}>
                  Khách quét mã VietQR bằng app ngân hàng để thanh toán tiền
                  cọc.
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
        Hệ thống gửi OTP đến SĐT {tenantInfo.phone} để khách xác nhận hợp đồng.
        (Demo: nhập 123456)
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
    if (!name.trim()) return Alert.alert('Lỗi', 'Vui lòng nhập tên thiết bị.')
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
  meterThumb: {
    width: '100%',
    height: 150,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.md,
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
  qrAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.primary,
    marginBottom: Spacing.md,
  },
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
