import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native'
import QRCode from 'react-native-qrcode-svg'
import * as Sharing from 'expo-sharing'
import * as ImagePicker from 'expo-image-picker'
import { BorderRadius, Colors, Shadow, Spacing } from '@/constants'
import { uploadImageToCloudinary } from '@/services/core/cloudinary'
import { CameraCaptureModal } from '@/components/common'
import {
  findPersonLabel, showAlert, splitMeterReading, validateMeterPhoto, validateRoomPhoto,
} from '@/utils';
import { MeterOverrideModal } from '@/components/common';
import type { MeterOverrideKind } from '@/services/manager/meterOverrideService';
import { visionService, type VisionLabel } from '@/services/shared/visionService';
import { nowIso, serverNow, todayIso } from '@/utils/serverTime';
import { DatePickerField } from '@/components/common/DatePickerField';
import { maskTenantPhone } from '@/constants/managerVisibility';
import {
  realTenantService,
  TenantContractResponse,} from '@/services/tenant/tenantService'

// Khớp với OnboardingScreen — PayOS redirect URLs.

const onlyDigits = (s: string) => String(s).replace(/[^\d]/g, '')
const parseNum = (s: string) => Number(onlyDigits(s)) || 0
/**
 * Dãy chữ số OCR đọc được ("030815") → chuỗi chỉ số thật ("3081.5").
 *
 * Không tách thì chỉ số bị ghi to gấp 10 lần và sai luôn tiền điện cả kỳ thuê.
 * Màn này dùng số chữ số MẶC ĐỊNH (điện 5+1, nước 5+3) vì `TenantContractResponse`
 * chưa mang cấu hình của phòng — trùng đúng mặc định BE, và người nhập vẫn sửa
 * được trực tiếp trong ô.
 *
 * ⚠️ Từ 13/08/2026 đây là luồng đón khách DUY NHẤT (màn OnboardingScreenV2 cũ đã xoá 17/08/2026). Màn cũ
 * đọc `electricDecimalDigits`/`waterDecimalDigits` thật của phòng, màn này thì không —
 * phòng nào cấu hình khác mặc định sẽ phải sửa tay. Cần BE trả 2 field đó trong
 * `TenantContractResponse` để bỏ hẳn phần đoán.
 */
const toReadingValue = (raw: string, kind: 'elec' | 'water'): string => {
  const s = splitMeterReading(raw, kind)
  return s.decimalPart ? `${Number(s.integerPart)}.${s.decimalPart}` : String(Number(s.integerPart || 0))
}
const formatVnd = (v: number) => (v ? v.toLocaleString('vi-VN') : '0')
const formatDateVi = (iso?: string): string => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}
const readErr = (err: any, fallback: string): string =>
  err?.response?.data?.error || err?.response?.data?.message || err?.message || fallback

/** Đón sớm tối đa mấy ngày so với ngày vào ở — khớp `contract.max-early-move-in-days` của BE. */
const MAX_EARLY_ONBOARD_DAYS = 3

/**
 * Số ngày còn lại tới ngày vào ở (âm = đã qua).
 *
 * Để ở module-level vì DANH SÁCH và PANEL THAO TÁC phải dùng chung một cách tính —
 * lệch nhau là thẻ báo "chưa tới hạn" nhưng mở ra vẫn thao tác được như thường.
 *
 * Tính theo `moveInDate` chứ không phải `expectedReceptionDate`: BE ràng buộc trên ngày
 * vào ở (`contract.max-early-move-in-days`), ngày hẹn đón chỉ là lịch làm việc.
 */
const daysUntilOnboard = (c: TenantContractResponse): number | null => {
  const raw = c.moveInDate || c.expectedReceptionDate
  if (!raw) return null
  const d = new Date(`${String(raw).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const today = serverNow()
  today.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86_400_000)
}

/** Chưa tới cửa sổ đón: còn hơn MAX_EARLY_ONBOARD_DAYS ngày nữa mới tới ngày vào ở. */
const isTooEarly = (c: TenantContractResponse): boolean => {
  const d = daysUntilOnboard(c)
  return d != null && d > MAX_EARLY_ONBOARD_DAYS
}

/**
 * Một nhãn trạng thái DUY NHẤT cho mỗi hợp đồng — dùng chung cho chip lọc và nhãn
 * trên thẻ, để hai chỗ không bao giờ phân loại lệch nhau.
 */
type StatusKey = 'paid_wait_otp' | 'wait_price' | 'price_rejected' | 'wait_transfer' | 'draft'

const STATUS_KEYS: StatusKey[] = ['paid_wait_otp', 'wait_price', 'price_rejected', 'wait_transfer', 'draft']

const STATUS_UI: Record<StatusKey, { label: string; short: string; color: string; bg: string }> = {
  // Khách ĐÃ chuyển tiền nhưng chưa xong OTP là việc gấp nhất — manager chỉ cần bấm
  // tiếp là xong. Trạng thái này phải thắng mọi nhãn khác.
  paid_wait_otp:  { label: '✅ Đã thu — chờ OTP',    short: 'Chờ OTP',      color: '#047857', bg: '#ECFDF5' },
  wait_price:     { label: 'Chờ Host duyệt giá',     short: 'Chờ duyệt giá', color: '#D97706', bg: '#FFFBEB' },
  price_rejected: { label: 'Host từ chối giá',       short: 'Bị từ chối',   color: '#DC2626', bg: '#FEF2F2' },
  wait_transfer:  { label: 'Chờ khách chuyển tiền',  short: 'Chờ chuyển tiền', color: '#0891B2', bg: '#ECFEFF' },
  draft:          { label: 'Chờ đón khách',          short: 'Chờ đón',      color: '#D97706', bg: '#FFFBEB' },
}

const statusKeyOf = (c: TenantContractResponse): StatusKey => {
  const paid = c.paymentStatus === 'PAID' || !!c.depositPaidAt
  if (c.status === 'PENDING' && paid) return 'paid_wait_otp'
  if (c.priceApprovalStatus === 'PENDING_PRICE_APPROVAL') return 'wait_price'
  if (c.priceApprovalStatus === 'PRICE_REJECTED') return 'price_rejected'
  if (c.status === 'PENDING' || c.priceApprovalStatus === 'APPROVED_AWAITING_DEPOSIT') return 'wait_transfer'
  return 'draft'
}

/**
 * Ngày HẸN ĐÓN của hợp đồng (yyyy-MM-dd) — dùng cho bộ lọc theo ngày.
 * Ưu tiên `expectedReceptionDate` vì đó là lịch làm việc của manager; hồ sơ nào chưa
 * đặt lịch thì lùi về ngày vào ở.
 */
const receptionDayOf = (c: TenantContractResponse): string | null => {
  const raw = c.expectedReceptionDate || c.moveInDate
  return raw ? String(raw).slice(0, 10) : null
}

const WEEKDAYS_VI = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

/** "Thứ 7" từ 'yyyy-MM-dd' — ghép ngày trong tuần vào tiêu đề nhóm cho dễ hình dung. */
const weekdayVi = (iso: string): string => {
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? '' : WEEKDAYS_VI[d.getDay()]
}

/** yyyy-MM-dd ↔ DD/MM/YYYY (DatePickerField nhận/trả định dạng Việt). */
const isoToVi = (iso: string): string => {
  const [y, m, d] = iso.split('-')
  return d ? `${d}/${m}/${y}` : ''
}
const viToIso = (vi: string): string => {
  const [d, m, y] = vi.split('/')
  return y ? `${y}-${m}-${d}` : ''
}

type TimeKey = 'all' | 'overdue' | 'ready' | 'early'

const TIME_CHIPS: { key: TimeKey; label: string }[] = [
  { key: 'all', label: 'Mọi thời điểm' },
  { key: 'overdue', label: '⚠️ Quá hạn' },
  { key: 'ready', label: '✅ Đón được' },
  { key: 'early', label: '🗓 Chưa tới hạn' },
]

export const ResumeContractScreen: React.FC = () => {
  const navigation = useNavigation<any>()
  const route = useRoute<any>()
  const paramContractId: number | undefined = route.params?.contractId

  const [list, setList] = useState<TenantContractResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<TenantContractResponse | null>(null)
  const [viewingContract, setViewingContract] = useState(false)
  const [search, setSearch] = useState('')

  const [statusFilter, setStatusFilter] = useState<StatusKey | 'all'>('all')
  const [timeFilter, setTimeFilter] = useState<TimeKey>('all')
  /** Lọc theo ĐÚNG một ngày hẹn đón — '' = tắt. Lưu dạng ISO yyyy-MM-dd. */
  const [dateFilter, setDateFilter] = useState('')
  /** Panel lọc mặc định ĐÓNG — mở màn là thấy hợp đồng ngay, không phải cuộn qua bộ lọc. */
  const [filterOpen, setFilterOpen] = useState(false)

  /**
   * Số ngày còn lại tới ngày vào ở (âm = đã qua).
   *
   * Tính theo `moveInDate` chứ không phải `expectedReceptionDate`: BE ràng buộc trên
   * ngày vào ở (`contract.max-early-move-in-days`), còn ngày hẹn đón chỉ là lịch làm
   * việc của manager. Thiếu `moveInDate` thì lùi về ngày hẹn đón.
   */

  // Dùng todayIso(date) chứ KHÔNG toISOString(): hàm kia trả ngày theo UTC, ở VN
  // (UTC+7) mọi thời điểm trước 07:00 sáng đều ra ngày hôm trước — xem serverTime.ts.
  const activeFilterCount =
    (statusFilter !== 'all' ? 1 : 0) + (timeFilter !== 'all' ? 1 : 0) + (dateFilter ? 1 : 0)

  const clearFilters = () => {
    setStatusFilter('all'); setTimeFilter('all'); setDateFilter('')
  }

  const tomorrowIso = useMemo(() => {
    const d = serverNow()
    d.setDate(d.getDate() + 1)
    return todayIso(d)
  }, [])

  /*
   * Hợp đồng chưa tới cửa sổ đón (xem `isTooEarly` ở module-level):
   *
   * Trước 17/08/2026 những hồ sơ này bị ẨN khỏi danh sách. Lý do ẩn là có thật — BE chặn
   * ở tận bước xác thực OTP, lúc đó manager đã chụp ảnh đồng hồ, chụp hiện trạng, thu cọc
   * xong xuôi, hỏng nguyên một lượt làm việc mà tiền cọc thì đã vào.
   *
   * Nhưng ẩn đi thì manager không thấy được lịch sắp tới của mình. Nay HIỆN HẾT, đổi cách
   * bảo vệ: gắn nhãn + đếm ngược trên thẻ, và KHOÁ HẲN panel thao tác khi mở ra
   * (ContractActionPanel) — chỉ cho xem, không chụp/không thu tiền được.
   */

  const filteredList = useMemo(() => {
    let out = list

    if (statusFilter !== 'all') out = out.filter((c) => statusKeyOf(c) === statusFilter)
    if (dateFilter) out = out.filter((c) => receptionDayOf(c) === dateFilter)

    if (timeFilter !== 'all') {
      out = out.filter((c) => {
        const d = daysUntilOnboard(c)
        if (timeFilter === 'overdue') return d != null && d < 0
        if (timeFilter === 'ready') return d == null || (d >= 0 && d <= MAX_EARLY_ONBOARD_DAYS)
        return d != null && d > MAX_EARLY_ONBOARD_DAYS // 'early'
      })
    }

    const q = search.trim().toLowerCase()
    if (!q) return out
    // Trước 08/08/2026 chỉ lọc theo tên khách — mentor phản ánh "search không ra".
    // Lúc đón dở, manager thường chỉ nhớ SỐ PHÒNG hoặc SĐT chứ hiếm khi nhớ đúng
    // họ tên đầy đủ; hợp đồng nháp thì tên còn có thể để trống.
    const digits = q.replace(/[^\d]/g, '')
    return out.filter((c) => {
      const haystack = [
        c.tenantFullName,
        c.tenantPhone,
        c.roomNumber,
        c.contractCode,
        c.propertyName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (haystack.includes(q)) return true
      // Gõ SĐT có/không dấu cách, dấu chấm đều phải ra.
      return digits.length >= 3 && haystack.replace(/[^\d]/g, '').includes(digits)
    })
  }, [list, search, statusFilter, timeFilter, dateFilter])

  /** Đếm cho chip trạng thái — tính trên toàn bộ, không đổi theo bộ lọc đang chọn. */
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: list.length }
    STATUS_KEYS.forEach((k) => { c[k] = list.filter((x) => statusKeyOf(x) === k).length })
    return c
  }, [list])

  const timeCounts = useMemo(() => {
    const days = list.map(daysUntilOnboard)
    return {
      all: list.length,
      overdue: days.filter((d) => d != null && d < 0).length,
      ready: days.filter((d) => d == null || (d >= 0 && d <= MAX_EARLY_ONBOARD_DAYS)).length,
      early: days.filter((d) => d != null && d > MAX_EARLY_ONBOARD_DAYS).length,
    }
  }, [list])

  /**
   * Gom hợp đồng THEO NGÀY HẸN ĐÓN, sắp tăng dần (quá hạn lên đầu, chưa đặt ngày xuống
   * cuối). Nhờ vậy cuộn danh sách chính là đọc lịch làm việc — không cần dùng bộ lọc,
   * cũng không phải tự nhẩm "17/08 là hôm nay hay mai".
   */
  const dayGroups = useMemo(() => {
    const map = new Map<string, TenantContractResponse[]>()
    filteredList.forEach((c) => {
      const k = receptionDayOf(c) ?? ''
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(c)
    })
    return [...map.entries()]
      .map(([key, items]) => ({ key, items }))
      .sort((a, b) => {
        if (!a.key) return 1
        if (!b.key) return -1
        return a.key.localeCompare(b.key)
      })
  }, [filteredList])

  /** Nhãn tiêu đề nhóm ngày: "HÔM NAY", "NGÀY MAI", "CÒN 14 NGÀY", "QUÁ HẠN 3 NGÀY". */
  const dayHeader = (iso: string): { main: string; sub: string; color: string; bg: string } => {
    if (!iso) return { main: 'CHƯA ĐẶT NGÀY ĐÓN', sub: '', color: '#B45309', bg: '#FFFBEB' }
    const today = todayIso()
    const diff = Math.round(
      (new Date(`${iso}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000,
    )
    const sub = weekdayVi(iso)
    if (diff < 0) return { main: `QUÁ HẠN ${Math.abs(diff)} NGÀY · ${formatDateVi(iso)}`, sub, color: '#B91C1C', bg: '#FEF2F2' }
    if (diff === 0) return { main: `HÔM NAY · ${formatDateVi(iso)}`, sub, color: '#B45309', bg: '#FFF7ED' }
    if (diff === 1) return { main: `NGÀY MAI · ${formatDateVi(iso)}`, sub, color: '#0E7490', bg: '#ECFEFF' }
    return { main: `CÒN ${diff} NGÀY · ${formatDateVi(iso)}`, sub, color: Colors.textSecondary, bg: Colors.background }
  }


  /**
   * Mở hợp đồng. Chưa tới cửa sổ đón thì hỏi lại — đây là thứ thay cho việc ẩn thẻ:
   * manager vẫn xem được hồ sơ, nhưng không thể lỡ tay làm cả quy trình rồi bị BE
   * chặn ở bước cuối.
   */
  const openContract = (c: TenantContractResponse) => setSelected(c)

  const handleViewContract = async () => {
    if (!selected) return
    setViewingContract(true)
    try {
      // mimeType theo Content-Type BE trả: PDF (file mới) / DOCX (HĐ cũ) —
      // xem FE-draft-contract-pdf.md.
      const { uri, mimeType } = await realTenantService.downloadContractDocument(
        selected.id,
        selected.contractCode,
      )
      if (Platform.OS === 'web') {
        // Trên web `uri` là blob object URL (xem downloadContractDocument). Sharing là
        // module native nên isAvailableAsync() luôn false ở đây — mở tab mới để trình
        // duyệt tự xem PDF, hoặc tải xuống nếu là DOCX.
        const win = (globalThis as any).window
        const opened = win?.open(uri, '_blank')
        if (!opened) {
          showAlert(
            'Trình duyệt chặn cửa sổ mới',
            'Hãy cho phép pop-up cho trang này để xem file hợp đồng.',
          )
        }
      } else if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType,
          UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : 'org.openxmlformats.wordprocessingml.document',
          dialogTitle: 'Xem hợp đồng thuê',
        })
      } else {
        showAlert('Lỗi', 'Thiết bị không hỗ trợ chia sẻ file.')
      }
    } catch (err: any) {
      showAlert('Lỗi', readErr(err, 'Không mở được file hợp đồng.'))
    } finally {
      setViewingContract(false)
    }
  }

  const load = useCallback(async () => {
    try {
      // BE chia 3 rổ và nhánh mặc định KHÔNG bao gồm DRAFT/PENDING, nên phải gọi đủ
      // cả ba rồi gộp (dedupe theo id):
      //   • không status → 3 trạng thái duyệt giá
      //   • DRAFT        → hợp đồng nháp mới gán
      //   • PENDING      → ĐÃ tạo mã thanh toán, đang chờ khách chuyển tiền / xác thực OTP
      //
      // Thiếu nhánh PENDING chính là lỗi mentor nêu 07/08/2026: manager thoát app giữa
      // chừng rồi vào lại là mất dấu khách đang đón dở, tìm kiểu gì cũng không ra.
      const [approval, drafts, pendings] = await Promise.all([
        realTenantService.listManagedContracts(),
        realTenantService.listManagedContracts('DRAFT'),
        realTenantService.listManagedContracts('PENDING'),
      ])
      // Thứ tự gộp = thứ tự ưu tiên xử lý: đang chờ tiền/OTP gấp nhất, rồi tới nháp.
      const data = [...pendings, ...drafts, ...approval].filter(
        (c, i, arr) => arr.findIndex((x) => x.id === c.id) === i,
      )
      setList(data)

      if (paramContractId != null) {
        // Mở từ thông báo (deep-link): ưu tiên HĐ trong list.
        const found = data.find((c) => c.id === paramContractId)
        if (found) {
          setSelected(found)
        } else {
          // Phòng hờ: list chưa chứa HĐ (vd BE chưa kèm trạng thái đã duyệt)
          // -> lấy đơn lẻ để vẫn tiếp tục được.
          try {
            const single = await realTenantService.getContract(paramContractId)
            setSelected(single)
            setList((prev) =>
              prev.some((c) => c.id === single.id) ? prev : [single, ...prev],
            )
          } catch {
            /* ignore: hiển thị list rỗng/đầy đủ như bình thường */
          }
        }
      } else {
        // Refresh thường: đồng bộ HĐ đang chọn (nếu có) với dữ liệu mới.
        setSelected((prev) => (prev ? data.find((c) => c.id === prev.id) ?? prev : prev))
      }
    } catch (err: any) {
      showAlert('Lỗi tải dữ liệu', readErr(err, 'Không tải được danh sách hợp đồng chờ xử lý.'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [paramContractId])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  const onRefresh = () => {
    setRefreshing(true)
    load()
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  if (selected) {
    return (
      <SafeAreaView style={styles.safe}>
        <Header onBack={() => setSelected(null)} title={selected.status === 'DRAFT' ? 'Đón khách' : 'Tiếp tục hợp đồng'} />
        {selected.contractFileAvailable ? (
          <TouchableOpacity
            style={styles.viewContractBar}
            onPress={handleViewContract}
            disabled={viewingContract}
          >
            {viewingContract ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Text style={styles.viewContractBarText}>📄 Xem hợp đồng — {selected.contractCode}</Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.viewContractBarDisabled}>
            <Text style={styles.viewContractBarDisabledText}>Chưa có file hợp đồng — tạo ở web admin</Text>
          </View>
        )}
        <ContractActionPanel
          contract={selected}
          onDone={() => {
            setSelected(null)
            load()
          }}
          onChanged={(c) => setSelected(c)}
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <Header onBack={() => navigation.goBack()} title="Hợp đồng chờ xử lý" />
      {/* MỘT hàng: tìm kiếm + nút Lọc. Trước đây 3 hàng chip luôn mở, cộng ô tìm là
          4 hàng — ăn gần nửa màn hình điện thoại trước khi thấy hợp đồng nào. */}
      <View style={styles.topRow}>
        <TextInput
          style={styles.searchInputFlex}
          value={search}
          onChangeText={setSearch}
          placeholder="Tìm tên, SĐT, phòng, mã HĐ..."
          placeholderTextColor={Colors.textMuted}
        />
        <TouchableOpacity
          style={[styles.filterBtn, (filterOpen || activeFilterCount > 0) && styles.filterBtnOn]}
          onPress={() => setFilterOpen((o) => !o)}
        >
          <Text style={[styles.filterBtnText, (filterOpen || activeFilterCount > 0) && styles.filterBtnTextOn]}>
            ⚙︎ Lọc{activeFilterCount > 0 ? ` ${activeFilterCount}` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Đang lọc gì + kết quả, gói trong MỘT hàng. Bấm ✕ trên chip để bỏ từng cái —
          không phải mở panel ra chỉ để tắt một bộ lọc. */}
      {activeFilterCount > 0 && (
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          style={styles.chipRow} contentContainerStyle={styles.chipRowBody}
        >
          <Text style={styles.countInline}>{filteredList.length}/{list.length}</Text>
          {statusFilter !== 'all' && (
            <TouchableOpacity style={styles.activeChip} onPress={() => setStatusFilter('all')}>
              <Text style={styles.activeChipText}>{STATUS_UI[statusFilter].short} ✕</Text>
            </TouchableOpacity>
          )}
          {timeFilter !== 'all' && (
            <TouchableOpacity style={styles.activeChip} onPress={() => setTimeFilter('all')}>
              <Text style={styles.activeChipText}>
                {TIME_CHIPS.find((t) => t.key === timeFilter)?.label} ✕
              </Text>
            </TouchableOpacity>
          )}
          {!!dateFilter && (
            <TouchableOpacity style={styles.activeChip} onPress={() => setDateFilter('')}>
              <Text style={styles.activeChipText}>📅 {isoToVi(dateFilter)} ✕</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={clearFilters}>
            <Text style={styles.clearFilter}>Xoá hết</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Panel lọc — mặc định ĐÓNG. Gộp "lịch đón" và "chọn ngày" làm một nhóm vì
          cùng nói về thời điểm. */}
      {filterOpen && (
        <View style={styles.filterPanel}>
          <Text style={styles.filterLabel}>Trạng thái</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRowBody}>
            {(['all', ...STATUS_KEYS] as (StatusKey | 'all')[]).map((k) => {
              const active = statusFilter === k
              return (
                <TouchableOpacity
                  key={k}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setStatusFilter(k)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {k === 'all' ? 'Tất cả' : STATUS_UI[k].short} ({statusCounts[k] ?? 0})
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          <Text style={styles.filterLabel}>Lịch đón</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRowBody}>
            {TIME_CHIPS.map(({ key, label }) => {
              const active = timeFilter === key
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setTimeFilter(key)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {label} ({timeCounts[key]})
                  </Text>
                </TouchableOpacity>
              )
            })}
            <TouchableOpacity
              style={[styles.chip, dateFilter === todayIso() && styles.chipActive]}
              onPress={() => setDateFilter((d) => (d === todayIso() ? '' : todayIso()))}
            >
              <Text style={[styles.chipText, dateFilter === todayIso() && styles.chipTextActive]}>Hôm nay</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, dateFilter === tomorrowIso && styles.chipActive]}
              onPress={() => setDateFilter((d) => (d === tomorrowIso ? '' : tomorrowIso))}
            >
              <Text style={[styles.chipText, dateFilter === tomorrowIso && styles.chipTextActive]}>Ngày mai</Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.panelDatePicker}>
            <DatePickerField
              value={dateFilter ? isoToVi(dateFilter) : ''}
              onChange={(v) => setDateFilter(v ? viToIso(v) : '')}
              placeholder="📅 Chọn ngày khác"
            />
          </View>
        </View>
      )}
      <ScrollView
        contentContainerStyle={styles.listBody}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {list.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>Không có hợp đồng nào chờ xử lý.</Text>
          </View>
        ) : filteredList.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyText}>Không tìm thấy khách hàng nào khớp.</Text>
          </View>
        ) : (
          dayGroups.map(({ key, items }) => (
          <View key={key} style={styles.dayGroup}>
            {/* Tiêu đề ngày: đọc "HÔM NAY" / "NGÀY MAI" / "CÒN 14 NGÀY" thay vì tự nhẩm
                từ 17/08/2026. Nhóm theo ngày rồi thì cuộn danh sách = đọc lịch làm việc. */}
            {(() => {
              const h = dayHeader(key)
              return (
                <View style={[styles.dayHead, { backgroundColor: h.bg }]}>
                  <Text style={[styles.dayHeadMain, { color: h.color }]}>{h.main}</Text>
                  <Text style={[styles.dayHeadSub, { color: h.color }]}>
                    {h.sub}{h.sub ? ' · ' : ''}{items.length} khách
                  </Text>
                </View>
              )
            })()}
            {items.map((c) => {
            const meta = STATUS_UI[statusKeyOf(c)]
            const days = daysUntilOnboard(c)
            const early = days != null && days > MAX_EARLY_ONBOARD_DAYS
            const overdue = days != null && days < 0
            return (
              <TouchableOpacity
                key={c.id}
                style={[
                  styles.card,
                  // Vạch màu trái: đỏ = quá ngày vào ở, xám = chưa tới hạn đón.
                  overdue && styles.cardOverdue,
                  early && styles.cardEarly,
                ]}
                onPress={() => openContract(c)}
                activeOpacity={0.85}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{c.tenantFullName}</Text>
                  {!!c.tenantPhone && (
                    <Text style={styles.cardPhone}>📞 {maskTenantPhone(c.tenantPhone)}</Text>
                  )}
                  <Text style={styles.cardMeta}>
                    {c.contractCode}
                    {c.roomNumber ? ` · Phòng ${c.roomNumber}` : ''}
                  </Text>
                  {!!c.propertyName && <Text style={styles.cardProperty}>🏠 {c.propertyName}</Text>}
                  {/* Hiện giá thuê. BE hiện đang trả `null` cho tài khoản MANAGER
                      (`isManager ? null : c.getRentAmount()`) — chừng nào BE còn mask thì
                      dòng này ẩn, KHÔNG hiện "0 đ/tháng" như trước vì `formatVnd(null)`
                      ra "0", đọc lên thành hợp đồng miễn phí. */}
                  {c.rentAmount != null && (
                    <Text style={styles.cardPrice}>{formatVnd(c.rentAmount)} đ/tháng</Text>
                  )}
                  {/* Ngày hẹn đón đã nằm ở tiêu đề nhóm — không lặp lại trên thẻ.
                      Chỉ nói phần tiêu đề nhóm KHÔNG nói được: chưa được phép đón. */}
                  {early && (
                    <Text style={styles.cardEarlyNote}>
                      🗓 Chỉ đón sớm được {MAX_EARLY_ONBOARD_DAYS} ngày trước ngày vào ở
                    </Text>
                  )}
                  {overdue && (
                    <Text style={styles.cardOverdueNote}>
                      ⚠️ Đã qua ngày vào ở {Math.abs(days!)} ngày
                    </Text>
                  )}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              </TouchableOpacity>
            )
            })}
          </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

// ===== Panel hành động theo trạng thái =====
const ContractActionPanel: React.FC<{
  contract: TenantContractResponse
  onDone: () => void
  onChanged: (c: TenantContractResponse) => void
}> = ({ contract, onDone, onChanged }) => {
  const status = contract.priceApprovalStatus

  /**
   * CHƯA TỚI HẠN ĐÓN → chỉ cho XEM, khoá mọi thao tác.
   *
   * Trước 17/08/2026 chỗ này chỉ hỏi một hộp thoại "vẫn mở để xem thông tin?" rồi mở
   * nguyên panel thao tác — bấm OK là chụp ảnh, nhập chỉ số, thu tiền được hết. Hỏi
   * xong vẫn cho làm thì câu hỏi đó vô nghĩa, mà hậu quả thì thật: BE chặn ở bước OTP
   * SAU KHI đã thu cọc.
   */
  const early = daysUntilOnboard(contract)
  if (isTooEarly(contract)) {
    return (
      <ScrollView contentContainerStyle={styles.panelBody}>
        <View style={[styles.banner, { backgroundColor: '#FFF7ED' }]}>
          <Text style={styles.bannerIcon}>🗓</Text>
          <Text style={styles.bannerTitle}>Chưa tới hạn đón khách</Text>
          <Text style={styles.bannerDesc}>
            {contract.tenantFullName} vào ở ngày {formatDateVi(contract.moveInDate)} — còn {early} ngày.
            Hệ thống chỉ cho đón sớm tối đa {MAX_EARLY_ONBOARD_DAYS} ngày, nên chưa chốt chỉ số
            và thu tiền được.
          </Text>
          <Text style={styles.bannerReception}>
            Khách đổi lịch vào sớm hơn? Mở hồ sơ bên web để sửa ngày vào ở.
          </Text>
        </View>
      </ScrollView>
    )
  }

  if (status === 'PENDING_PRICE_APPROVAL') {
    return (
      <ScrollView contentContainerStyle={styles.panelBody}>
        <View style={[styles.banner, { backgroundColor: '#FFFBEB' }]}>
          <Text style={styles.bannerIcon}>⏳</Text>
          <Text style={styles.bannerTitle}>Đang chờ Host duyệt giá</Text>
          <Text style={styles.bannerDesc}>
            Hợp đồng {contract.contractCode}
            {contract.rentAmount != null ? ` (${formatVnd(contract.rentAmount)} đ/tháng)` : ''} đang chờ Host
            phê duyệt. Bạn sẽ được thông báo khi có phản hồi.
          </Text>
        </View>
      </ScrollView>
    )
  }

  if (status === 'PRICE_REJECTED') {
    return <RejectedPanel contract={contract} onDone={onDone} onChanged={onChanged} />
  }

  // APPROVED_AWAITING_DEPOSIT (hoặc fallback) -> thu cọc + OTP
  return <DepositOtpPanel contract={contract} onDone={onDone} onChanged={onChanged} />
}

// ===== Bị từ chối: chỉnh giá gửi lại hoặc hủy =====
const RejectedPanel: React.FC<{
  contract: TenantContractResponse
  onDone: () => void
  onChanged: (c: TenantContractResponse) => void
}> = ({ contract, onDone, onChanged }) => {
  const [editing, setEditing] = useState(false)
  /**
   * KHỞI TẠO RỖNG khi BE không trả số (13/08/2026).
   *
   * BE mask `rentAmount` và `deposit` về `null` với ROLE_MANAGER. `String(null)` ra
   * chuỗi `"null"` — mà chuỗi đó TRUTHY, nên nhánh `value={deposit ? ... : ''}` vẫn
   * chạy, `parseNum("null")` lọc hết chữ còn `""` → `Number("") || 0` → ô hiện **"0"**.
   *
   * Hậu quả thật: Host từ chối giá → manager sửa ô giá thuê, KHÔNG đụng ô cọc (nhìn
   * thấy có số nên tưởng là số cũ) → bấm gửi → hợp đồng sang Host duyệt với **cọc = 0**.
   * Im lặng, không báo lỗi gì.
   *
   * Để rỗng + placeholder thì vừa đúng thật (manager không được phép thấy giá cũ, thì
   * đừng hiện một con số làm họ tưởng đó là giá cũ) vừa buộc phải nhập có ý thức.
   */
  const [rent, setRent] = useState(contract.rentAmount != null ? String(contract.rentAmount) : '')
  const [deposit, setDeposit] = useState(contract.deposit != null ? String(contract.deposit) : '')
  const [busy, setBusy] = useState(false)

  const resubmit = async () => {
    const rentAmount = parseNum(rent)
    const depositVal = parseNum(deposit)
    if (rentAmount <= 0) return showAlert('Lỗi', 'Giá thuê phải lớn hơn 0.')
    // Chặn theo "CHƯA NHẬP" chứ không phải `depositVal <= 0`: có hợp đồng cọc bằng 0
    // thật (khách quen, chủ miễn cọc) — chặn theo số là cấm nhầm trường hợp hợp lệ.
    if (!deposit.trim()) return showAlert('Lỗi', 'Vui lòng nhập tiền cọc trước khi gửi lại.')
    try {
      setBusy(true)
      const updated = await realTenantService.resubmitPriceApproval(contract.id, {
        rentAmount,
        deposit: depositVal,
      })
      showAlert('Đã gửi lại', 'Hợp đồng đã được gửi Host duyệt lại.')
      onChanged(updated)
    } catch (err: any) {
      showAlert('Lỗi', readErr(err, 'Không gửi lại được hợp đồng.'))
    } finally {
      setBusy(false)
    }
  }

  const cancel = () => {
    showAlert('Hủy hợp đồng?', 'Thao tác này sẽ hủy hợp đồng đang chờ. Bạn chắc chắn?', [
      { text: 'Không', style: 'cancel' },
      {
        text: 'Hủy hợp đồng',
        style: 'destructive',
        onPress: async () => {
          try {
            setBusy(true)
            await realTenantService.cancelContract(contract.id)
            showAlert('Đã hủy', 'Hợp đồng đã được hủy.')
            onDone()
          } catch (err: any) {
            showAlert('Lỗi', readErr(err, 'Không hủy được hợp đồng.'))
          } finally {
            setBusy(false)
          }
        },
      },
    ])
  }

  return (
    <ScrollView contentContainerStyle={styles.panelBody}>
      <View style={[styles.banner, { backgroundColor: '#FEF2F2' }]}>
        <Text style={styles.bannerIcon}>❌</Text>
        <Text style={styles.bannerTitle}>Host đã từ chối giá</Text>
        {!!contract.priceRejectReason && (
          <Text style={styles.bannerDesc}>Lý do: {contract.priceRejectReason}</Text>
        )}
      </View>

      {editing ? (
        <View style={styles.formCard}>
          <Text style={styles.label}>Giá thuê / tháng (VNĐ)</Text>
          <TextInput
            style={styles.input}
            value={rent ? Number(parseNum(rent)).toLocaleString('vi-VN') : ''}
            onChangeText={setRent}
            keyboardType="numeric"
            placeholder="Nhập giá mới"
            placeholderTextColor={Colors.textMuted}
          />
          <Text style={[styles.label, { marginTop: Spacing.md }]}>Tiền cọc (VNĐ)</Text>
          <TextInput
            style={styles.input}
            value={deposit ? Number(parseNum(deposit)).toLocaleString('vi-VN') : ''}
            onChangeText={setDeposit}
            keyboardType="numeric"
            placeholder="Nhập tiền cọc"
            placeholderTextColor={Colors.textMuted}
          />
          <TouchableOpacity
            style={[styles.primaryBtn, busy && styles.btnDisabled]}
            onPress={resubmit}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryBtnText}>📨 Gửi Host duyệt lại</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.primaryBtn} onPress={() => setEditing(true)}>
          <Text style={styles.primaryBtnText}>✏️ Chỉnh giá & gửi lại</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={[styles.dangerBtn, busy && styles.btnDisabled]} onPress={cancel} disabled={busy}>
        <Text style={styles.dangerBtnText}>Hủy hợp đồng</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

// ===== Hiện trạng phòng + chỉ số điện nước (đón khách bước 2, có thể bổ sung/sửa
// bất cứ lúc nào trước khi hoàn tất — không chặn luồng thu cọc bên dưới). =====
const InspectionSection: React.FC<{
  contract: TenantContractResponse
  onChanged: (c: TenantContractResponse) => void
}> = ({ contract, onChanged }) => {
  const [expanded, setExpanded] = useState(false)
  const [elecUrl, setElecUrl] = useState(contract.electricMeterImageUrl ?? '')
  const [waterUrl, setWaterUrl] = useState(contract.waterMeterImageUrl ?? '')
  const [elecReading, setElecReading] = useState(
    contract.initialElectricReading != null ? String(contract.initialElectricReading) : '',
  )
  const [waterReading, setWaterReading] = useState(
    contract.initialWaterReading != null ? String(contract.initialWaterReading) : '',
  )
  // Ngày giờ chụp (client-side, lúc ảnh upload xong) — làm bằng chứng đối soát,
  // gửi kèm lên BE (FE-onboard-photo-timestamp.md). Prefill từ contract nếu đã có
  // sẵn dữ liệu (mở lại HĐ đã từng nhập trước đó).
  const [meterCapturedAt, setMeterCapturedAt] = useState<{ elec?: string; water?: string }>({
    elec: contract.electricMeterCapturedAt,
    water: contract.waterMeterCapturedAt,
  })
  const [photos, setPhotos] = useState<string[]>(contract.roomConditionUrls ?? [])
  const [photosCapturedAt, setPhotosCapturedAt] = useState<string[]>(
    (contract.roomConditionPhotos ?? []).map((p) => p.capturedAt),
  )
  const [note, setNote] = useState(contract.roomConditionNote ?? '')
  // AI mô tả hiện trạng (mentor 12/08/2026 — BE `describe-room` từ 13/08/2026).
  // `noteTouched` khởi tạo theo việc HĐ đã có ghi chú sẵn hay chưa: có sẵn nghĩa là
  // ai đó đã viết, AI không được đè lên.
  const [noteTouched, setNoteTouched] = useState(!!contract.roomConditionNote)
  const [aiDrafted, setAiDrafted] = useState(false)
  const [describing, setDescribing] = useState(false)
  const [ocrLoading, setOcrLoading] = useState<'elec' | 'water' | null>(null)
  // Các số khác OCR đọc được trên cùng ảnh — hiện thành nút bấm để đổi nhanh khi máy
  // chọn nhầm (hay gặp: bắt trúng serial "Số SX" thay vì ô chỉ số).
  const [ocrCandidates, setOcrCandidates] = useState<{ elec?: string[]; water?: string[] }>({})
  const [photoUploading, setPhotoUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  // Nút "Chọn ảnh" từ thư viện CHỈ hiện sau khi chụp bằng camera bị lỗi — tránh
  // manager tiện tay chọn ảnh cũ thay vì chụp tại chỗ (feedback demo).
  const [gallerySOS, setGallerySOS] = useState<{ elec?: boolean; water?: boolean }>({})
  // true khi manager tự gõ/sửa số (khác với OCR tự điền) — bắt buộc tick xác nhận
  // chịu trách nhiệm trước khi được lưu (feedback demo).
  const [manualEdited, setManualEdited] = useState<{ elec?: boolean; water?: boolean }>({})
  const [manualConfirmed, setManualConfirmed] = useState<{ elec?: boolean; water?: boolean }>({})
  /**
   * Mã admin cấp cho phép NHẬP TAY chỉ số khi không chụp được ảnh (mentor ý 5).
   *
   * Từ 10/08/2026 BE bắt buộc: có ghi chỉ số thì phải kèm ảnh HOẶC token
   * (`requireMeterEvidence`). Trước đó màn này KHÔNG có đường xin mã, nên manager
   * không chụp được ảnh là tắc hẳn — gõ số vào cũng bị BE chặn.
   */
  const [meterOverride, setMeterOverride] = useState<{
    elec?: { token: string; reason: string }
    water?: { token: string; reason: string }
  }>({})
  const [overrideTarget, setOverrideTarget] = useState<MeterOverrideKind | null>(null)

  /**
   * Ô chỉ số bị NIÊM PHONG cho tới khi có bằng chứng: ảnh đồng hồ, hoặc mã admin.
   *
   * Khoá ô nhập thay vì chỉ chặn lúc bấm Lưu là có chủ ý — người dùng biết ngay từ
   * đầu là phải có bằng chứng, thay vì gõ xong hết rồi mới bị đuổi về.
   */
  const meterUnlocked = (kind: 'elec' | 'water') =>
    !!(kind === 'elec' ? elecUrl : waterUrl) || !!meterOverride[kind]
  /**
   * Camera trong app đang mở cho việc gì (null = đóng).
   * Dùng CameraCaptureModal thay ImagePicker.launchCameraAsync: trên web hàm đó chỉ mở
   * hộp thoại chọn file, và modal bắt xem lại ảnh trước khi dùng.
   */
  const [cameraTarget, setCameraTarget] = useState<'elec' | 'water' | 'condition' | null>(null)
  // Xem ảnh phóng to (đồng hồ điện/nước + hiện trạng phòng) — chạm bất kỳ đâu để đóng.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewCapturedAt, setPreviewCapturedAt] = useState<string | undefined>(undefined)

  const hasData = photos.length > 0 || !!elecReading || !!waterReading

  /** Ảnh có sẵn trong máy (1 tấm). */
  const pickFromGallery = async (): Promise<string | null> => {
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 })
    return r.canceled ? null : r.assets[0].uri
  }

  /**
   * Ảnh mặt đồng hồ lúc đón khách — mốc gốc để tính tiền điện/nước cả kỳ thuê, nên
   * bắt buộc là MẶT ĐỒNG HỒ THẬT: `validateMeterPhoto` soi chữ OCR đọc được (kWh, m³,
   * tên hãng, serial...). Ảnh chỉ có con số (ghi ra giấy, chụp màn hình) hoặc chụp
   * nhầm loại đồng hồ đều bị từ chối — không lưu ảnh, không điền số.
   */
  const handleMeterPhoto = async (kind: 'elec' | 'water', uri: string) => {
    // Ảnh mới chụp — tin OCR trở lại, bỏ yêu cầu xác nhận nhập tay của lần trước.
    setManualEdited((prev) => ({ ...prev, [kind]: false }))
    setManualConfirmed((prev) => ({ ...prev, [kind]: false }))
    const label = kind === 'elec' ? 'điện' : 'nước'
    try {
      setOcrLoading(kind)
      const url = await uploadImageToCloudinary(uri)
      const capturedAt = nowIso()

      let ocr
      try {
        ocr = await realTenantService.ocrMeter(url)
      } catch (err: any) {
        // Không kiểm chứng được ảnh → vẫn giữ để không chặn việc đón khách, nhưng báo rõ.
        if (kind === 'elec') { setElecUrl(url); setMeterCapturedAt((prev) => ({ ...prev, elec: capturedAt })) }
        else { setWaterUrl(url); setMeterCapturedAt((prev) => ({ ...prev, water: capturedAt })) }
        showAlert('Chưa kiểm được ảnh', readErr(err, 'Dịch vụ đọc ảnh lỗi — nhập chỉ số tay và kiểm lại ảnh giúp.'))
        return
      }

      const check = validateMeterPhoto(kind, ocr)
      if (!check.ok) {
        showAlert(`Ảnh không phải đồng hồ ${label}`, check.reason, undefined, '🚫')
        return
      }

      // Chặn ảnh có người (mentor ý 8). `validateMeterPhoto` chỉ soi CHỮ do OCR đọc,
      // nên ảnh chụp mặt mà trong khung có bất kỳ dãy 4–8 chữ số nào (tờ lịch, số nhà,
      // màn hình điện thoại) vẫn lọt qua luật cuối của nó.
      //
      // Chỉ hỏi Vision khi OCR KHÔNG thấy đơn vị kWh/m³ (`confidence !== 'high'`):
      // đọc được đơn vị nghĩa là trong khung có mặt đồng hồ thật, không cần hỏi thêm.
      // Nhờ vậy ca dùng bình thường không tốn thêm lượt Vision nào — quan trọng vì
      // trần đang là 20 ảnh/giờ/tài khoản, mà đón một khách đã hết 2 ảnh đồng hồ.
      if (check.confidence !== 'high') {
        try {
          const person = findPersonLabel(await visionService.detectLabels(url))
          if (person) {
            showAlert(
              'Ảnh có người trong khung',
              `Máy nhận ra "${person}" trong ảnh. Chụp thẳng vào MẶT SỐ của đồng hồ ${label}, không có người che.`,
              undefined,
              '🚫',
            )
            return
          }
        } catch {
          // Vision lỗi → không chặn, giữ nguyên hành vi cũ.
        }
      }

      // Đọc được mặt đồng hồ nhưng KHÔNG tách được dãy số → gần như luôn do ảnh mờ,
      // chụp xa, loá hoặc nghiêng. TỪ CHỐI luôn thay vì giữ ảnh rồi cho gõ tay: giữ
      // lại thì bằng chứng vô dụng (nhìn ảnh không đọc nổi số) mà vẫn lưu được số bất kỳ.
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

      if (kind === 'elec') { setElecUrl(url); setMeterCapturedAt((prev) => ({ ...prev, elec: capturedAt })) }
      else { setWaterUrl(url); setMeterCapturedAt((prev) => ({ ...prev, water: capturedAt })) }

      if (kind === 'elec') setElecReading(toReadingValue(check.reading, kind))
      else setWaterReading(toReadingValue(check.reading, kind))
      setOcrCandidates((prev) => ({ ...prev, [kind]: check.candidates ?? [] }))

      if (check.confidence === 'low') {
        showAlert('Ảnh hơi mờ', `Chưa chắc chắn đây là mặt đồng hồ ${label} — xem lại ảnh và chỉ số trước khi lưu.`)
      }
    } catch (err: any) {
      showAlert('OCR', readErr(err, 'Không đọc được ảnh, vui lòng nhập số tay.'))
    } finally {
      setOcrLoading(null)
    }
  }

  /** Chọn ảnh đồng hồ từ thư viện — chỉ mở khi camera hỏng (gallerySOS). */
  const pickMeterFromGallery = async (kind: 'elec' | 'water') => {
    if (!gallerySOS[kind]) return
    const uri = await pickFromGallery()
    if (uri) await handleMeterPhoto(kind, uri)
  }

  /**
   * Nối mô tả mới vào cuối ghi chú đang có, ngăn bằng dấu chấm.
   *
   * Chỉ thêm dấu chấm khi câu trước chưa có dấu kết — không thì ra "… sạch.. Phòng…".
   */
  const joinSentences = (prev: string, add: string) => {
    const left = (prev || '').trim()
    const right = (add || '').trim()
    if (!right) return left
    if (!left) return right
    return /[.!?…]$/.test(left) ? `${left} ${right}` : `${left}. ${right}`
  }

  /**
   * Soạn ghi chú hiện trạng từ ảnh (BE `POST /api/v1/vision/describe-room`).
   *
   * Kết quả luôn là BẢN NHÁP: đổ vào ô ghi chú cho manager đọc lại và sửa, không tự
   * lưu. Biên bản hiện trạng là căn cứ trừ cọc lúc trả phòng — để máy viết rồi lưu
   * thẳng là ký một văn bản không ai đọc.
   *
   * Hai chế độ:
   *   • `append` — chạy tự động mỗi khi thêm ảnh. Chỉ mô tả ẢNH VỪA THÊM rồi nối vào
   *     cuối ghi chú. Vì chỉ thêm chứ không đè nên KHÔNG cần xét `noteTouched`: chữ
   *     manager gõ và các câu mô tả trước đó đều còn nguyên. Mỗi ảnh cũng chỉ tốn một
   *     ảnh trong payload thay vì gửi lại cả bộ.
   *   • mặc định (thay thế) — nút "Tạo lại mô tả": soạn lại từ TOÀN BỘ ảnh và ghi đè,
   *     dùng khi ghi chú đã rối và muốn làm lại từ đầu.
   *
   * Lỗi quota/model là lỗi MỀM: im lặng bỏ qua khi chạy tự động sau lúc upload, chỉ
   * báo khi manager chủ động bấm nút — không được chặn luồng đón khách.
   */
  const describeFromPhotos = async (
    urls: string[],
    opts?: { force?: boolean; append?: boolean },
  ) => {
    const force = opts?.force === true
    const append = opts?.append === true
    if (describing || urls.length === 0) return
    if (!append && noteTouched && !force) return

    try {
      setDescribing(true)
      const result = await visionService.describeRoom(urls)
      if (!result?.description) {
        if (force) showAlert('Chưa tạo được mô tả', 'Model không trả về nội dung. Nhập tay giúp nhé.')
        return
      }
      if (append) {
        setNote((prev) => joinSentences(prev, result.description))
      } else {
        setNote(result.description)
        setNoteTouched(false)
      }
      setAiDrafted(true)
    } catch (err: any) {
      if (!force) return // chạy nền sau upload — không làm phiền
      const code = err?.response?.data?.code
      showAlert(
        code === 'VISION_DESCRIBE_QUOTA' ? 'Hết lượt tạo mô tả' : 'Chưa tạo được mô tả',
        readErr(err, 'Không tạo được mô tả từ ảnh. Nhập tay giúp nhé.'),
      )
    } finally {
      setDescribing(false)
    }
  }

  /**
   * Nút "Tạo lại mô tả" — soạn lại từ TOÀN BỘ ảnh và ghi đè.
   *
   * Hỏi trước khi đè nếu ô ghi chú đang có chữ, bất kể chữ đó do manager gõ hay do AI
   * nối vào: sau vài lần thêm ảnh thì hai loại đã trộn lẫn, không tách ra được nữa nên
   * cứ có chữ là hỏi.
   */
  const regenerateDescription = () => {
    if (note.trim()) {
      showAlert('Tạo lại mô tả?', 'Ghi chú đang có sẽ bị thay bằng mô tả mới từ toàn bộ ảnh.', [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Tạo lại', onPress: () => void describeFromPhotos(photos, { force: true }) },
      ])
      return
    }
    void describeFromPhotos(photos, { force: true })
  }

  const uploadConditionPhotos = async (uris: string[]) => {
    if (uris.length === 0) return
    try {
      setPhotoUploading(true)
      const urls = await Promise.all(uris.map((u) => uploadImageToCloudinary(u)))

      // Kiểm nội dung TỪNG ảnh: ảnh hiện trạng là căn cứ trừ cọc lúc trả phòng, để
      // lọt ảnh chế / poster / ảnh đồng hồ là mất luôn bằng chứng. Vision chỉ nhận
      // URL Cloudinary nên phải upload trước rồi mới kiểm được; ảnh bị từ chối thì
      // không đưa vào danh sách (file rác trên Cloudinary chấp nhận được).
      const accepted: string[] = []
      const rejected: string[] = []
      for (const url of urls) {
        let labels: VisionLabel[] = []
        try {
          labels = await visionService.detectLabels(url)
        } catch {
          // Vision lỗi/hết quota → không chặn, xem validateRoomPhoto.
        }
        const check = validateRoomPhoto(labels)
        if (check.ok) accepted.push(url)
        else rejected.push(check.reason || 'Ảnh không hợp lệ.')
      }

      if (accepted.length > 0) {
        const now = nowIso()
        setPhotos((prev) => [...prev, ...accepted])
        setPhotosCapturedAt((prev) => [...prev, ...accepted.map(() => now)])
        // Mô tả CHỈ ẢNH VỪA THÊM rồi nối vào cuối ghi chú — mentor muốn "chụp thêm ảnh
        // thì ghi chú thêm vào", nên thêm câu chứ không soạn lại từ đầu.
        //
        // Gọi ở đây chứ KHÔNG gọi trong hàm cập nhật của `setPhotos`: hàm đó phải thuần,
        // React StrictMode chạy nó hai lần nên đặt lời gọi mạng vào trong là gửi hai
        // request và nối mô tả hai lần.
        void describeFromPhotos(accepted, { append: true })
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

  /** Chọn nhiều ảnh hiện trạng phòng từ thư viện. */
  const pickConditionFromGallery = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      quality: 0.6,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    })
    if (r.canceled) return
    await uploadConditionPhotos(r.assets.map((a) => a.uri))
  }

  /** Chỉ số của một đồng hồ, đã cắt khoảng trắng. */
  const readingOf = (kind: 'elec' | 'water') =>
    (kind === 'elec' ? elecReading : waterReading).trim()

  /**
   * Ô xác nhận chịu trách nhiệm chỉ hiện khi ĐÃ CÓ SỐ.
   *
   * Trước 13/08/2026 nó hiện ngay khi manager chạm vào ô nhập (`manualEdited`), nên tick
   * được cả khi ô còn trống — xác nhận một con số không tồn tại. Đúng ca đã gặp: xin mã
   * nhập tay, không gõ gì, tick xác nhận rồi Lưu vẫn qua.
   */
  const needsConfirm = (kind: 'elec' | 'water') =>
    !!manualEdited[kind] && !!readingOf(kind)

  /**
   * Vì sao CHƯA lưu được (null = lưu được). Dùng cho cả nút Lưu (khoá + làm mờ) lẫn câu
   * nhắc ngay dưới nút — nút xám mà không nói vì sao thì người dùng đứng hình.
   *
   * Thứ tự kiểm đi theo thứ tự thao tác trên màn: số → bằng chứng → xác nhận → ảnh phòng.
   *
   * ⚠️ Chỉ số điện VÀ nước đều BẮT BUỘC (yêu cầu 13/08/2026). Trước đây bỏ trống cả hai
   * thì lọt hết mọi chốt: vòng kiểm cũ chỉ bắt "có số mà thiếu ảnh" và "có ảnh mà thiếu
   * số", nên không nhập gì cả là lưu được — hợp đồng đón khách xong không có mốc gốc để
   * tính tiền điện nước cả kỳ thuê.
   */
  const saveBlockReason: string | null = (() => {
    const meters = [
      { kind: 'elec' as const, url: elecUrl, label: 'điện', hasCode: !!meterOverride.elec },
      { kind: 'water' as const, url: waterUrl, label: 'nước', hasCode: !!meterOverride.water },
    ]
    for (const m of meters) {
      if (!readingOf(m.kind)) {
        return `Chưa có chỉ số ${m.label}. Chụp ảnh đồng hồ để OCR tự điền, hoặc xin mã quản trị để nhập tay.`
      }
      // Bằng chứng = ảnh HOẶC mã quản trị (BE `requireMeterEvidence` từ 10/08/2026).
      if (!m.url && !m.hasCode) {
        return `Chỉ số ${m.label} chưa có bằng chứng. Cần ảnh đồng hồ, hoặc mã quản trị cấp kèm lý do.`
      }
      if (needsConfirm(m.kind) && !manualConfirmed[m.kind]) {
        return `Tick xác nhận chịu trách nhiệm cho chỉ số ${m.label} đã nhập tay.`
      }
    }
    if (photos.length === 0) {
      return 'Cần ít nhất 1 ảnh hiện trạng phòng để đối chiếu khi khách trả phòng.'
    }
    return null
  })()

  const save = async () => {
    // Lưới đỡ cuối: nút Lưu đã bị khoá theo `saveBlockReason`, nhưng vẫn kiểm lại ở đây
    // phòng trường hợp state đổi giữa lúc bấm.
    if (saveBlockReason) {
      showAlert('Chưa lưu được', saveBlockReason)
      return
    }
    try {
      setSaving(true)
      const updated = await realTenantService.updateDraftContract(contract.id, {
        initialElectricReading: elecReading ? Number(elecReading) : undefined,
        initialWaterReading: waterReading ? Number(waterReading) : undefined,
        electricMeterImageUrl: elecUrl || undefined,
        electricMeterCapturedAt: meterCapturedAt.elec,
        waterMeterImageUrl: waterUrl || undefined,
        waterMeterCapturedAt: meterCapturedAt.water,
        // Mã cho phép nhập tay khi không có ảnh. BE chỉ tiêu thụ token khi ảnh tương
        // ứng TRỐNG — có ảnh thì bỏ qua, nên gửi kèm luôn cũng không đốt mã oan.
        electricMeterOverrideToken: meterOverride.elec?.token,
        electricMeterOverrideReason: meterOverride.elec?.reason,
        waterMeterOverrideToken: meterOverride.water?.token,
        waterMeterOverrideReason: meterOverride.water?.reason,
        roomConditionUrls: photos,
        roomConditionPhotos: photos.map((url, i) => ({
          url,
          capturedAt: photosCapturedAt[i] || nowIso(),
        })),
        roomConditionNote: note || undefined,
      })
      onChanged(updated)
      setExpanded(false)
      showAlert('Đã lưu', 'Hiện trạng phòng & chỉ số điện nước đã được cập nhật.')
    } catch (err: any) {
      showAlert('Lỗi', readErr(err, 'Không lưu được hiện trạng phòng.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={styles.formCard}>
      <TouchableOpacity style={styles.inspectionHeader} onPress={() => setExpanded((v) => !v)} activeOpacity={0.7}>
        <Text style={styles.inspectionTitle}>{hasData ? '✅' : '📋'} Hiện trạng phòng & điện nước</Text>
        <Text style={styles.inspectionToggle}>{expanded ? 'Thu gọn ▲' : 'Chỉnh sửa ▼'}</Text>
      </TouchableOpacity>
      {!expanded && (
        <Text style={styles.inspectionSummary}>
          {photos.length > 0 ? `${photos.length} ảnh hiện trạng` : 'Chưa có ảnh hiện trạng'}
          {elecReading ? ` · Điện ${elecReading}` : ''}
          {waterReading ? ` · Nước ${waterReading}` : ''}
        </Text>
      )}

      {expanded && (
        <View style={{ marginTop: Spacing.md, gap: Spacing.md }}>
          <Text style={styles.meterHintText}>
            Chỉ cần chụp rõ phần hiển thị số trên đồng hồ (không cần lấy trọn cả đồng hồ).
          </Text>
          {(['elec', 'water'] as const).map((kind) => (
            <View key={kind} style={styles.meterCardSm}>
              <Text style={styles.label}>{kind === 'elec' ? '⚡ Chỉ số điện (kWh)' : '💧 Chỉ số nước (m³)'}</Text>
              <View style={styles.methodRow}>
                <TouchableOpacity
                  style={styles.secondaryBtnSm}
                  onPress={() => setCameraTarget(kind)}
                  disabled={ocrLoading !== null}
                >
                  <Text style={styles.secondaryBtnSmText}>📷 Chụp</Text>
                </TouchableOpacity>
                {gallerySOS[kind] && (
                  <TouchableOpacity
                    style={styles.secondaryBtnSm}
                    onPress={() => pickMeterFromGallery(kind)}
                    disabled={ocrLoading !== null}
                  >
                    <Text style={styles.secondaryBtnSmText}>🖼 Chọn ảnh</Text>
                  </TouchableOpacity>
                )}
                {ocrLoading === kind && <ActivityIndicator color={Colors.primary} style={{ marginLeft: 8 }} />}
              </View>
              {!gallerySOS[kind] && (
                <TouchableOpacity onPress={() => setGallerySOS((prev) => ({ ...prev, [kind]: true }))}>
                  <Text style={styles.galleryFallbackLink}>Camera không dùng được? Chọn ảnh từ thư viện</Text>
                </TouchableOpacity>
              )}
              {!!(kind === 'elec' ? elecUrl : waterUrl) && (
                <View style={styles.meterThumbWrap}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      setPreviewUrl(kind === 'elec' ? elecUrl : waterUrl)
                      setPreviewCapturedAt(meterCapturedAt[kind])
                    }}
                  >
                    <Image source={{ uri: kind === 'elec' ? elecUrl : waterUrl }} style={styles.meterThumb} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removePhotoBtn}
                    onPress={() => {
                      if (kind === 'elec') setElecUrl('')
                      else setWaterUrl('')
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
              {/* Quy ước đọc số — phải giống nhau giữa lúc đón khách và các kỳ hoá đơn
                  sau, nếu không hiệu số giữa 2 kỳ sẽ sai. */}
              <View style={styles.meterRuleBox}>
                <Text style={styles.meterRuleText}>
                  • Nhập cả phần <Text style={styles.meterRuleStrong}>ĐEN</Text>
                  {kind === 'elec' ? ' (kWh)' : ' (m³)'} lẫn phần{' '}
                  <Text style={styles.meterRuleRed}>ĐỎ</Text>, ngăn nhau bằng dấu chấm —
                  vd <Text style={styles.meterRuleStrong}>3081.5</Text>.
                </Text>
                <Text style={styles.meterRuleText}>
                  • Chữ số đang nhảy giữa 2 số → lấy số{' '}
                  <Text style={styles.meterRuleStrong}>NHỎ HƠN</Text>.
                </Text>
              </View>
              {/* Ô nhập bị KHOÁ khi chưa có ảnh và chưa xin mã — xem meterUnlocked. */}
              <TextInput
                style={[
                  styles.input,
                  styles.meterReadingInput,
                  !meterUnlocked(kind) && styles.meterReadingLocked,
                ]}
                value={kind === 'elec' ? elecReading : waterReading}
                onChangeText={(v) => {
                  if (kind === 'elec') setElecReading(v)
                  else setWaterReading(v)
                  setManualEdited((prev) => ({ ...prev, [kind]: true }))
                  setManualConfirmed((prev) => ({ ...prev, [kind]: false }))
                }}
                editable={meterUnlocked(kind)}
                keyboardType="numeric"
                placeholder={
                  meterUnlocked(kind)
                    ? 'OCR tự điền, có thể chỉnh'
                    : '🔒 Chụp ảnh đồng hồ, hoặc xin mã để nhập tay'
                }
                placeholderTextColor={Colors.textMuted}
              />

              {/* Đường xin mã — hiện khi chưa có ảnh và chưa xin. Không giấu sau bước
                  "báo camera hỏng" như màn đón khách mới: từ 10/08/2026 BE bắt buộc
                  ảnh hoặc mã, nên đây là lối duy nhất khi không chụp được. Giấu kỹ
                  quá thì manager mò không ra và tắc hẳn. */}
              {!meterUnlocked(kind) && (
                <TouchableOpacity
                  onPress={() => setOverrideTarget(kind === 'elec' ? 'ELEC' : 'WATER')}
                >
                  <Text style={styles.overrideLink}>
                    🔑 Không chụp được ảnh? Xin mã từ quản trị để nhập tay
                  </Text>
                </TouchableOpacity>
              )}

              {!!meterOverride[kind] && (
                <View style={styles.overrideBadge}>
                  <Text style={styles.overrideBadgeText} numberOfLines={2}>
                    🔑 Nhập tay có mã · {meterOverride[kind]!.reason}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setMeterOverride((prev) => ({ ...prev, [kind]: undefined }))}
                  >
                    <Text style={styles.overrideBadgeClear}>Bỏ</Text>
                  </TouchableOpacity>
                </View>
              )}
              {!!(ocrCandidates[kind]?.length) && (
                <View style={styles.ocrAltBox}>
                  <Text style={styles.ocrAltLabel}>Máy đọc nhầm? Chọn số khác trên ảnh:</Text>
                  <View style={styles.ocrAltRow}>
                    {ocrCandidates[kind]!.slice(0, 6).map((n) => (
                      <TouchableOpacity
                        key={n}
                        style={styles.ocrAltChip}
                        onPress={() => {
                          if (kind === 'elec') setElecReading(toReadingValue(n, kind))
                          else setWaterReading(toReadingValue(n, kind))
                          // Số vẫn đến từ ảnh (OCR đọc được), không phải gõ tay
                          // → không bắt tick cam kết như nhánh nhập tay.
                          setManualEdited((prev) => ({ ...prev, [kind]: false }))
                          setManualConfirmed((prev) => ({ ...prev, [kind]: false }))
                        }}
                      >
                        <Text style={styles.ocrAltChipText}>{n}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
              {/* Chỉ hiện khi đã CÓ SỐ — xem needsConfirm(). */}
              {needsConfirm(kind) && (
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
          ))}

          <View>
            <Text style={styles.label}>Ảnh hiện trạng phòng</Text>
            <View style={styles.methodRow}>
              <TouchableOpacity style={styles.secondaryBtnSm} onPress={() => setCameraTarget('condition')} disabled={photoUploading}>
                <Text style={styles.secondaryBtnSmText}>📸 Chụp ảnh</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtnSm} onPress={pickConditionFromGallery} disabled={photoUploading}>
                <Text style={styles.secondaryBtnSmText}>🖼 Chọn ảnh</Text>
              </TouchableOpacity>
              {photoUploading && <ActivityIndicator color={Colors.primary} style={{ marginLeft: 8 }} />}
            </View>
            {photos.length > 0 && (
              <View style={styles.photoGrid}>
                {photos.map((uri, i) => (
                  <View key={`${uri}-${i}`} style={styles.photoWrap}>
                    <TouchableOpacity
                      style={styles.photoThumbTouch}
                      activeOpacity={0.85}
                      onPress={() => { setPreviewUrl(uri); setPreviewCapturedAt(photosCapturedAt[i]) }}
                    >
                      <Image source={{ uri }} style={styles.photoThumb} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.removePhotoBtn}
                      onPress={() => {
                        setPhotos((prev) => prev.filter((_, idx) => idx !== i))
                        setPhotosCapturedAt((prev) => prev.filter((_, idx) => idx !== i))
                      }}
                    >
                      <Text style={styles.removePhotoText}>×</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View>
            <View style={styles.noteHead}>
              <Text style={styles.label}>Ghi chú hiện trạng</Text>
              {photos.length > 0 && (
                <TouchableOpacity
                  style={styles.aiBtn}
                  onPress={regenerateDescription}
                  disabled={describing}
                >
                  {describing ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Text style={styles.aiBtnText}>
                      {/* Đã có chữ trong ô → nút này là "làm lại từ đầu", nên phải nói
                          rõ là TẠO LẠI để không ai bấm nhầm rồi mất phần đã soạn. */}
                      ✨ {note.trim() ? 'Tạo lại mô tả' : 'Mô tả từ ảnh'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={note}
              onChangeText={(t) => {
                setNote(t)
                // Người dùng đã tự gõ → AI không được ghi đè nữa (chỉ ghi khi bấm
                // "Tạo lại mô tả"). Mất chữ manager vừa gõ vì một lần upload ảnh là
                // lỗi khó chịu hơn nhiều so với việc phải bấm thêm một nút.
                setNoteTouched(true)
              }}
              multiline
              placeholder="Tường sạch, cửa tốt, máy lạnh đã kiểm tra..."
              placeholderTextColor={Colors.textMuted}
            />
            {describing && (
              <Text style={styles.aiHint}>Đang đọc ảnh để soạn mô tả…</Text>
            )}
            {/* Bỏ điều kiện `!noteTouched`: giờ AI NỐI thêm chứ không đè, nên ô ghi chú
                thường là chữ manager gõ trộn với câu AI soạn. Vẫn phải nhắc đọc lại —
                đây là căn cứ trừ cọc lúc trả phòng. */}
            {!!note && aiDrafted && (
              <Text style={styles.aiHint}>
                ✨ Có phần do AI soạn từ ảnh — đọc lại và sửa cho đúng trước khi lưu.
              </Text>
            )}
          </View>

          {/* Nút chỉ SÁNG khi đã đủ: 2 chỉ số + bằng chứng + xác nhận (nếu nhập tay) +
              ảnh phòng. Câu nhắc bên dưới nói rõ đang thiếu gì — nút xám không lời giải
              thích là kiểu bắt người dùng tự đoán. */}
          <TouchableOpacity
            style={[styles.primaryBtn, (saving || !!saveBlockReason) && styles.btnDisabled]}
            onPress={save}
            disabled={saving || !!saveBlockReason}
          >
            {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.primaryBtnText}>💾 Lưu hiện trạng</Text>}
          </TouchableOpacity>
          {!!saveBlockReason && !saving && (
            <Text style={styles.saveBlockHint}>⚠️ {saveBlockReason}</Text>
          )}
        </View>
      )}

      {/* Xem ảnh phóng to — chạm bất kỳ đâu để đóng */}
      <Modal
        visible={!!previewUrl}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewUrl(null)}
      >
        <TouchableOpacity
          style={styles.previewBackdrop}
          activeOpacity={1}
          onPress={() => setPreviewUrl(null)}
        >
          {!!previewUrl && (
            <Image source={{ uri: previewUrl }} style={styles.previewImage} resizeMode="contain" />
          )}
          {!!previewCapturedAt && (
            <Text style={styles.previewCapturedAt}>
              🕒 Chụp lúc {new Date(previewCapturedAt).toLocaleString('vi-VN')}
            </Text>
          )}
          <TouchableOpacity style={styles.previewCloseBtn} onPress={() => setPreviewUrl(null)}>
            <Text style={styles.previewCloseText}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Camera trong app: chụp → xem lại → "Dùng ảnh này" mới tải lên.
          Ảnh hiện trạng cho chụp liên tiếp; ảnh đồng hồ chỉ 1 tấm rồi đóng. */}
      <CameraCaptureModal
        visible={cameraTarget !== null}
        multi={cameraTarget === 'condition'}
        onCapture={(uri) => {
          if (cameraTarget === 'condition') {
            void uploadConditionPhotos([uri])
          } else if (cameraTarget) {
            const kind = cameraTarget
            setCameraTarget(null)
            void handleMeterPhoto(kind, uri)
          }
        }}
        onClose={() => setCameraTarget(null)}
        onUseGalleryInstead={
          cameraTarget === 'elec' || cameraTarget === 'water'
            ? () => {
                // Camera hỏng → mở lối chọn ảnh thư viện cho đúng đồng hồ đang chụp.
                const kind = cameraTarget
                setGallerySOS((prev) => ({ ...prev, [kind]: true }))
                setCameraTarget(null)
              }
            : undefined
        }
      />

      {/* Xin mã quản trị để mở khoá ô chỉ số khi không chụp được ảnh.
          `contractId` có thật ở màn này (hợp đồng nháp đã tồn tại), khác màn đón khách
          mới nơi hợp đồng chưa được tạo nên phải gửi null. */}
      <MeterOverrideModal
        visible={overrideTarget !== null}
        meterKind={overrideTarget ?? 'ELEC'}
        contractId={contract.id}
        onCancel={() => setOverrideTarget(null)}
        onGranted={(token, reason) => {
          const kind = overrideTarget === 'WATER' ? 'water' : 'elec'
          setMeterOverride((prev) => ({ ...prev, [kind]: { token, reason } }))
          // Số gõ tay sau khi xin mã vẫn là số gõ tay → giữ nguyên yêu cầu tick cam kết.
          setManualEdited((prev) => ({ ...prev, [kind]: true }))
          setManualConfirmed((prev) => ({ ...prev, [kind]: false }))
          setOverrideTarget(null)
        }}
      />
    </View>
  )
}

// ===== Đã duyệt: thu cọc PayOS + OTP (hệ thống thu cọc 100% chuyển khoản) =====
const DepositOtpPanel: React.FC<{
  contract: TenantContractResponse
  onDone: () => void
  onChanged: (c: TenantContractResponse) => void
}> = ({ contract, onChanged }) => {
  const navigation = useNavigation<any>()
  const [payInfo, setPayInfo] = useState<TenantContractResponse>(contract)
  const [paid, setPaid] = useState(contract.paymentStatus === 'PAID')
  const [busy, setBusy] = useState(false)
  const [otp, setOtp] = useState('')
  const [otpSending, setOtpSending] = useState(false)
  const otpSentRef = React.useRef(false)

  /**
   * Đã lưu hiện trạng phòng chưa — điều kiện để lộ nút "Tạo mã thanh toán".
   *
   * Thu tiền TRƯỚC khi chốt chỉ số công tơ và chụp ảnh phòng là mất luôn bằng chứng
   * gốc: khách vào ở rồi thì không còn cách nào chứng minh hiện trạng lúc bàn giao,
   * lúc trả phòng tranh chấp hư hỏng/điện nước là không có gì đối chiếu. Chỉ số điện
   * nước còn tệ hơn — chốt sau khi khách đã dùng thì kỳ hoá đơn đầu tiên sai hẳn.
   *
   * Điều kiện khớp đúng `saveBlockReason` của InspectionSection (2 chỉ số + ≥1 ảnh
   * phòng) — không đặt lỏng hơn, kẻo nút hiện ra trong khi hiện trạng chưa lưu xong.
   * `contract` được cập nhật qua `onChanged` ngay sau khi lưu nên nút tự hiện.
   */
  const inspectionSaved =
    contract.initialElectricReading != null
    && contract.initialWaterReading != null
    && ((contract.roomConditionPhotos?.length ?? 0) > 0
      || (contract.roomConditionUrls?.length ?? 0) > 0)

  // Poll trạng thái thanh toán (PayOS, local không có webhook).
  useEffect(() => {
    if (paid) return
    const timer = setInterval(async () => {
      try {
        const c = await realTenantService.checkPayment(contract.id)
        if (c.paymentStatus === 'PAID') {
          setPaid(true)
        }
      } catch {
        /* ignore */
      }
    }, 5000)
    return () => clearInterval(timer)
  }, [paid, contract.id])

  // Giữ OTP: khi đã thu cọc xong, tự gửi OTP tới SĐT khách để kích hoạt HĐ.
  useEffect(() => {
    if (!paid || otpSentRef.current) return
    otpSentRef.current = true
    setOtpSending(true)
    realTenantService
      .sendContractOtp(contract.id)
      .catch(() => {
        otpSentRef.current = false
      })
      .finally(() => setOtpSending(false))
  }, [paid, contract.id])

  const resendOtp = async () => {
    try {
      setOtpSending(true)
      await realTenantService.sendContractOtp(contract.id)
      showAlert('Đã gửi lại OTP', `Mã xác nhận mới đã gửi tới ${maskTenantPhone(contract.tenantPhone)}.`)
    } catch (err: any) {
      showAlert('Lỗi', readErr(err, 'Không gửi được OTP.'))
    } finally {
      setOtpSending(false)
    }
  }

  const createPayment = async () => {
    try {
      setBusy(true)
      const withPay = await realTenantService.createDepositPayment(contract.id)
      setPayInfo(withPay)
    } catch (err: any) {
      showAlert('Lỗi', readErr(err, 'Không tạo được liên kết thanh toán.'))
    } finally {
      setBusy(false)
    }
  }

  const checkPaidNow = async () => {
    try {
      const c = await realTenantService.checkPayment(contract.id)
      if (c.paymentStatus === 'PAID') {
        setPaid(true)
      } else {
        showAlert('Chưa nhận được thanh toán', 'PayOS chưa ghi nhận giao dịch. Thử lại sau vài giây.')
      }
    } catch (err: any) {
      showAlert('Lỗi', readErr(err, 'Không kiểm tra được trạng thái.'))
    }
  }

  const confirm = async () => {
    if (otp.length !== 6) return showAlert('Lỗi', 'Vui lòng nhập mã OTP gồm 6 chữ số.')
    try {
      setBusy(true)
      const res = await realTenantService.confirmContract(contract.id, { otp })
      onChanged(res)
      navigation.navigate('OnboardingSuccess', {
        contractCode: res.contractCode,
        tenantFullName: res.tenantFullName,
        roomNumber: res.roomNumber,
        phone: res.tenantPhone,
        username: res.tenantUsername ?? res.tenantPhone,
        accountCreated: res.tenantAccountCreated ?? false,
        rolePromoted: res.tenantRolePromoted ?? false,
      })
    } catch (err: any) {
      showAlert('Lỗi', readErr(err, 'Không hoàn tất được hợp đồng.'))
    } finally {
      setBusy(false)
    }
  }

  // KHÔNG dựng lại số tiền ở màn manager (góp ý mentor 12/08/2026). BE đã mask
  // `deposit` / `rentAmount` / `initialPaymentAmount` / breakdown cho ROLE_MANAGER;
  // tự tính bù ở FE là vô hiệu hoá luôn phần mask đó. Số tiền hiện trong app ngân
  // hàng của khách khi quét QR.
  return (
    <ScrollView contentContainerStyle={styles.panelBody}>
      <View style={[styles.banner, { backgroundColor: '#ECFEFF' }]}>
        <Text style={styles.bannerIcon}>{contract.priceApprovalStatus === 'APPROVED_AWAITING_DEPOSIT' ? '✅' : '🤝'}</Text>
        <Text style={styles.bannerTitle}>
          {contract.priceApprovalStatus === 'APPROVED_AWAITING_DEPOSIT' ? 'Host đã duyệt giá' : 'Đón khách — thu tiền'}
        </Text>
        <Text style={styles.bannerDesc}>
          {contract.tenantFullName}. Tạo mã thanh toán để khách quét, rồi xác thực OTP
          để kích hoạt hợp đồng.
        </Text>
        {!!contract.expectedReceptionDate && (
          <Text style={styles.bannerReception}>
            📅 Hẹn đón khách ngày {formatDateVi(contract.expectedReceptionDate)}
          </Text>
        )}
      </View>

      <InspectionSection contract={contract} onChanged={onChanged} />

      {!paid ? (
        <>
          {/* Bỏ khối "Hình thức thu cọc": hệ thống thu 100% chuyển khoản qua PayOS,
              không còn tiền mặt, nên đó là một ô chọn chỉ có đúng một lựa chọn —
              chiếm chỗ mà không cho người dùng quyết định gì. */}
          {/* Chưa lưu hiện trạng thì KHÔNG hiện nút — một dòng nói đúng việc phải làm.
              (Lý do dài dòng đã bỏ: manager cần biết LÀM GÌ, không cần nghe giảng.) */}
          {!inspectionSaved ? (
            <Text style={styles.stepLockNote}>
              🔒 Lưu hiện trạng phòng xong mới thu được tiền
            </Text>
          ) : !payInfo.payosQrCode && !payInfo.payosCheckoutUrl ? (
            <TouchableOpacity
              style={[styles.primaryBtn, busy && styles.btnDisabled]}
              onPress={createPayment}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.primaryBtnText}>Tạo mã thanh toán</Text>
              )}
            </TouchableOpacity>
          ) : null}
          {!!payInfo.payosQrCode && (
            <View style={styles.qrBox}>
              <View style={styles.qrWrap}>
                <QRCode value={payInfo.payosQrCode} size={200} />
              </View>
              <Text style={styles.qrCaption}>Khách quét VietQR bằng app ngân hàng.</Text>
              {/* Từ BE 609de59/276b613 (12/08/2026) QR thu MỘT lần gồm cọc + tiền nhà chu
                  kỳ đầu. Câu cũ ở đây nói "tiền nhà thu riêng, không thu ở đây" — sai
                  hẳn, khách đọc xong sẽ tưởng còn phải trả thêm một khoản nữa. */}
              <Text style={styles.qrNextDueNote}>
                Mã này thu một lần gồm tiền cọc và tiền nhà chu kỳ đầu. Số tiền hiện
                trong app ngân hàng của khách khi quét.
              </Text>
            </View>
          )}
          {/* Đã bỏ nút "Mở trang thanh toán PayOS" và khối WebView đi kèm: khách quét mã
              QR bằng app ngân hàng CỦA KHÁCH, không ai đưa điện thoại của manager cho
              khách gõ thông tin thẻ. Mở WebView ngay trong màn đón khách chỉ khiến
              manager bấm nhầm rồi lạc khỏi luồng. Xác nhận đã chuyển bằng nút bên dưới. */}
          {(!!payInfo.payosQrCode || !!payInfo.payosCheckoutUrl) && (
            <TouchableOpacity style={styles.secondaryBtn} onPress={checkPaidNow}>
              <Text style={styles.secondaryBtnText}>Tôi đã chuyển khoản — Kiểm tra</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <View style={styles.formCard}>
          <View style={styles.paidBox}>
            <Text style={styles.paidIcon}>✅</Text>
            <Text style={styles.paidText}>Đã ghi nhận thanh toán!</Text>
          </View>
          <View style={{ marginTop: Spacing.md }}>
            <Text style={styles.label}>Mã OTP gửi tới SĐT khách</Text>
            <Text style={styles.label}>{maskTenantPhone(contract.tenantPhone)}</Text>
          </View>
          <TextInput
            style={[styles.input, styles.otpInput]}
            value={otp}
            onChangeText={setOtp}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="------"
            placeholderTextColor={Colors.textMuted}
          />
          <TouchableOpacity onPress={resendOtp} disabled={otpSending} style={{ paddingVertical: Spacing.sm }}>
            <Text style={{ color: Colors.primary, fontWeight: '600', textAlign: 'center' }}>
              {otpSending ? 'Đang gửi OTP...' : 'Gửi lại OTP'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, (otp.length !== 6 || busy) && styles.btnDisabled]}
            onPress={confirm}
            disabled={otp.length !== 6 || busy}
          >
            {busy ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryBtnText}>Hoàn tất & kích hoạt</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  )
}

const Header: React.FC<{ onBack: () => void; title?: string }> = ({ onBack, title }) => (
  <View style={styles.header}>
    <TouchableOpacity onPress={onBack} style={styles.backBtn}>
      <Text style={styles.backText}>← Back</Text>
    </TouchableOpacity>
    <Text style={styles.headerTitle}>{title ?? 'Hợp đồng chờ xử lý'}</Text>
    <View style={{ width: 70 }} />
  </View>
)

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },

  viewContractBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryBg,
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  viewContractBarText: { color: Colors.primary, fontWeight: '700', fontSize: 13 },
  viewContractBarDisabled: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  viewContractBarDisabledText: { color: Colors.textMuted, fontSize: 12, fontStyle: 'italic' },

  listBody: { padding: Spacing.lg, gap: Spacing.md },
  emptyBox: { alignItems: 'center', paddingVertical: 80, gap: Spacing.md },
  emptyIcon: { fontSize: 44 },
  emptyText: { fontSize: 14, color: Colors.textSecondary },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  cardPhone: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  cardMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  cardProperty: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  cardPrice: { fontSize: 13, fontWeight: '700', color: Colors.primary, marginTop: 4 },
  cardReception: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  stepLockNote: {
    fontSize: 12.5,
    color: '#9A3412',
    textAlign: 'center',
    paddingVertical: Spacing.sm,
  },

  cardEarlyNote: { fontSize: 11, color: '#9A3412', marginTop: 4, lineHeight: 15 },
  cardOverdueNote: { fontSize: 11, fontWeight: '700', color: Colors.error, marginTop: 4 },
  // Vạch màu bên trái để quét mắt: đỏ = quá ngày vào ở, cam nhạt = chưa tới hạn đón.
  cardOverdue: { borderLeftWidth: 3, borderLeftColor: Colors.error },
  cardEarly: { borderLeftWidth: 3, borderLeftColor: '#FDBA74' },

  chipRow: { maxHeight: 46, flexGrow: 0 },
  chipRowBody: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, gap: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },
  topRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.md,
  },
  searchInputFlex: {
    flex: 1,
    backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, paddingVertical: 9,
    fontSize: 13.5, color: Colors.textPrimary,
  },
  filterBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: 9, borderRadius: BorderRadius.md,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border,
  },
  filterBtnOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterBtnText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },
  filterBtnTextOn: { color: Colors.white },

  filterPanel: {
    marginHorizontal: Spacing.lg, marginTop: Spacing.sm,
    padding: Spacing.sm, paddingBottom: Spacing.md,
    backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.lg,
  },
  filterLabel: {
    fontSize: 11, fontWeight: '800', color: Colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.4,
    paddingHorizontal: Spacing.sm, paddingTop: Spacing.xs,
  },
  panelDatePicker: { paddingHorizontal: Spacing.sm, marginTop: Spacing.xs },

  dayGroup: { gap: Spacing.md },
  dayHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 7,
    borderRadius: BorderRadius.md,
  },
  dayHeadMain: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  dayHeadSub: { fontSize: 11, fontWeight: '600', opacity: 0.85 },

  countInline: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, alignSelf: 'center' },
  activeChip: {
    paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryBg, borderWidth: 1, borderColor: Colors.primary,
  },
  activeChipText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  clearFilter: { fontSize: 12, fontWeight: '700', color: Colors.primary, alignSelf: 'center' },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  statusText: { fontSize: 11, fontWeight: '700' },

  panelBody: { padding: Spacing.lg, gap: Spacing.md },
  banner: { borderRadius: BorderRadius.xl, padding: Spacing.lg, alignItems: 'center', gap: 6 },
  bannerIcon: { fontSize: 40 },
  bannerTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
  bannerDesc: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  bannerReception: { fontSize: 13, fontWeight: '700', color: Colors.primary, marginTop: 4 },

  formCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
  input: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  otpInput: { textAlign: 'center', letterSpacing: 8, fontSize: 20, fontWeight: '700' },

  methodRow: { flexDirection: 'row', gap: Spacing.md },
  methodChip: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  methodChipActive: { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  methodText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  methodTextActive: { color: Colors.primary },

  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  primaryBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    marginTop: Spacing.md,
  },
  secondaryBtnText: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
  dangerBtn: {
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.error,
  },
  dangerBtnText: { color: Colors.error, fontSize: 14, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },

  qrBox: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  qrAmountLabel: { fontSize: 12, color: Colors.textSecondary, marginBottom: -2 },
  qrAmount: { fontSize: 20, fontWeight: '800', color: Colors.primary },
  payBreakdown: {
    alignSelf: 'stretch',
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: 4,
  },
  payBreakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payBreakdownLabel: { fontSize: 12, color: Colors.textSecondary },
  payBreakdownValue: { fontSize: 12, fontWeight: '700', color: Colors.textPrimary },
  qrNextDueNote: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 16,
    color: '#9A3412',
    backgroundColor: '#FFF7ED',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  qrWrap: { padding: Spacing.md, backgroundColor: Colors.white, borderRadius: BorderRadius.lg, ...Shadow.sm },
  qrCaption: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },
  webviewBox: { height: 460, borderRadius: BorderRadius.lg, overflow: 'hidden', marginTop: Spacing.md },

  paidBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  paidIcon: { fontSize: 22 },
  paidText: { fontSize: 15, fontWeight: '700', color: Colors.success },

  inspectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inspectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  inspectionToggle: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  inspectionSummary: { marginTop: 4, fontSize: 12, color: Colors.textSecondary },
  meterCardSm: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  secondaryBtnSm: {
    flex: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  secondaryBtnSmText: { color: Colors.primary, fontSize: 13, fontWeight: '700' },
  meterThumbWrap: { position: 'relative' },
  meterThumb: {
    width: '100%',
    height: 130,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.divider,
  },
  meterCapturedAt: { fontSize: 11, color: Colors.textMuted, marginTop: -Spacing.xs, marginBottom: Spacing.sm },
  galleryFallbackLink: { fontSize: 11, color: Colors.textMuted, textDecorationLine: 'underline', marginTop: 4, marginBottom: 4 },
  meterHintText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2,
    borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.white,
  },
  checkboxChecked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  checkboxTick: { color: Colors.white, fontSize: 13, fontWeight: '800' },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  confirmText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 17 },
  saveBlockHint: {
    fontSize: 12, color: Colors.warning, lineHeight: 17, marginTop: Spacing.xs,
    textAlign: 'center',
  },
  // Chỉ số điện/nước căn PHẢI: đọc số theo hàng đơn vị dễ đối chiếu với mặt đồng hồ
  // hơn, và khớp thói quen hiển thị số liệu tiền/lượng.
  meterReadingInput: { textAlign: 'right' },
  /** Ô chỉ số đang bị niêm phong — nền xám để nhìn là biết chưa gõ được. */
  meterReadingLocked: {
    backgroundColor: Colors.background,
    borderStyle: 'dashed',
    color: Colors.textMuted,
  },
  overrideLink: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
    marginTop: 8,
  },
  overrideBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  overrideBadgeText: { flex: 1, fontSize: 11, color: '#9A3412' },
  overrideBadgeClear: { fontSize: 11, fontWeight: '700', color: '#9A3412' },
  meterRuleBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    gap: 2,
  },
  meterRuleText: { fontSize: 11, color: '#92400E', lineHeight: 16 },
  meterRuleStrong: { fontWeight: '800' },
  meterRuleRed: { fontWeight: '800', color: '#DC2626' },
  ocrAltBox: { marginTop: Spacing.sm },
  ocrAltLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 6 },
  ocrAltRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  ocrAltChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.divider,
    backgroundColor: Colors.white,
  },
  ocrAltChipText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  photoWrap: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    backgroundColor: Colors.divider,
  },
  photoThumbTouch: { width: '100%', height: '100%' },
  photoThumb: { width: '100%', height: '100%', backgroundColor: Colors.divider },
  removePhotoBtn: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removePhotoText: { color: Colors.white, fontSize: 18, fontWeight: '900', lineHeight: 21 },
  notesInput: { minHeight: 80, textAlignVertical: 'top' },
  // AI mô tả hiện trạng
  noteHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  aiBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.primary,
    marginBottom: 4,
  },
  aiBtnText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  aiHint: { fontSize: 11, color: Colors.textMuted, marginTop: 4, fontStyle: 'italic' },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: { width: '100%', height: '85%' },
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
  previewCloseText: { color: Colors.white, fontSize: 18, fontWeight: '700' },
  previewCapturedAt: { marginTop: Spacing.sm, color: Colors.white, fontSize: 13 },
})
