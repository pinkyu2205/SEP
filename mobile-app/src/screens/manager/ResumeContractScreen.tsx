import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
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
import { WebView } from 'react-native-webview'
import * as Sharing from 'expo-sharing'
import * as ImagePicker from 'expo-image-picker'
import { BorderRadius, Colors, Shadow, Spacing } from '@/constants'
import { uploadImageToCloudinary } from '@/services/core/cloudinary'
import { showAlert } from '@/utils';
import {
  ContractPriceApprovalStatus,
  realTenantService,
  TenantContractResponse,
} from '@/services/tenant/tenantService'

// Khớp với OnboardingScreen — PayOS redirect URLs.
const PAY_SUCCESS_URL = 'https://slms.app/payment-success'
const PAY_CANCEL_URL = 'https://slms.app/payment-cancel'

const onlyDigits = (s: string) => String(s).replace(/[^\d]/g, '')
const parseNum = (s: string) => Number(onlyDigits(s)) || 0
const formatVnd = (v: number) => (v ? v.toLocaleString('vi-VN') : '0')
const formatDateVi = (iso?: string): string => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}
const readErr = (err: any, fallback: string): string =>
  err?.response?.data?.error || err?.response?.data?.message || err?.message || fallback

const STATUS_META: Record<ContractPriceApprovalStatus, { label: string; color: string; bg: string }> = {
  PENDING_PRICE_APPROVAL: { label: 'Chờ Host duyệt giá', color: '#D97706', bg: '#FFFBEB' },
  APPROVED_AWAITING_DEPOSIT: { label: 'Đã duyệt — chờ thu cọc', color: '#0891B2', bg: '#ECFEFF' },
  PRICE_REJECTED: { label: 'Host từ chối giá', color: '#DC2626', bg: '#FEF2F2' },
}

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

  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter((c) => c.tenantFullName?.toLowerCase().includes(q))
  }, [list, search])

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
      if (await Sharing.isAvailableAsync()) {
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
      // Gọi KHÔNG status chỉ trả về HĐ đang chờ/đã duyệt giá — HĐ nháp (DRAFT) mới gán
      // bị BE loại ra mặc định, phải gọi thêm status=DRAFT riêng rồi gộp (dedupe theo id,
      // ưu tiên nháp lên trước vì cần xử lý sớm nhất).
      const [pending, drafts] = await Promise.all([
        realTenantService.listManagedContracts(),
        realTenantService.listManagedContracts('DRAFT'),
      ])
      const data = [...drafts, ...pending].filter(
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
      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Tìm theo tên khách hàng..."
          placeholderTextColor={Colors.textMuted}
        />
      </View>
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
          filteredList.map((c) => {
            const meta = c.priceApprovalStatus
              ? STATUS_META[c.priceApprovalStatus]
              : c.status === 'DRAFT'
                ? { label: 'Nháp — chờ đón khách', color: '#D97706', bg: '#FFFBEB' }
                : c.status === 'PENDING'
                  ? { label: 'Chờ thu cọc', color: '#0891B2', bg: '#ECFEFF' }
                  : null
            return (
              <TouchableOpacity
                key={c.id}
                style={styles.card}
                onPress={() => setSelected(c)}
                activeOpacity={0.85}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{c.tenantFullName}</Text>
                  {!!c.tenantPhone && <Text style={styles.cardPhone}>📞 {c.tenantPhone}</Text>}
                  <Text style={styles.cardMeta}>
                    {c.contractCode}
                    {c.roomNumber ? ` · Phòng ${c.roomNumber}` : ''}
                  </Text>
                  {!!c.propertyName && <Text style={styles.cardProperty}>🏠 {c.propertyName}</Text>}
                  <Text style={styles.cardPrice}>{formatVnd(c.rentAmount)} đ/tháng</Text>
                  {!!c.expectedReceptionDate && (
                    <Text style={styles.cardReception}>📅 Hẹn đón khách: {formatDateVi(c.expectedReceptionDate)}</Text>
                  )}
                </View>
                {meta && (
                  <View style={[styles.statusBadge, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )
          })
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

  if (status === 'PENDING_PRICE_APPROVAL') {
    return (
      <ScrollView contentContainerStyle={styles.panelBody}>
        <View style={[styles.banner, { backgroundColor: '#FFFBEB' }]}>
          <Text style={styles.bannerIcon}>⏳</Text>
          <Text style={styles.bannerTitle}>Đang chờ Host duyệt giá</Text>
          <Text style={styles.bannerDesc}>
            Hợp đồng {contract.contractCode} ({formatVnd(contract.rentAmount)} đ/tháng) đang chờ Host
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
  const [rent, setRent] = useState(String(contract.rentAmount))
  const [deposit, setDeposit] = useState(String(contract.deposit))
  const [busy, setBusy] = useState(false)

  const resubmit = async () => {
    const rentAmount = parseNum(rent)
    const depositVal = parseNum(deposit)
    if (rentAmount <= 0) return showAlert('Lỗi', 'Giá thuê phải lớn hơn 0.')
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
  const [ocrLoading, setOcrLoading] = useState<'elec' | 'water' | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  // Nút "Chọn ảnh" từ thư viện CHỈ hiện sau khi chụp bằng camera bị lỗi — tránh
  // manager tiện tay chọn ảnh cũ thay vì chụp tại chỗ (feedback demo).
  const [gallerySOS, setGallerySOS] = useState<{ elec?: boolean; water?: boolean }>({})
  // true khi manager tự gõ/sửa số (khác với OCR tự điền) — bắt buộc tick xác nhận
  // chịu trách nhiệm trước khi được lưu (feedback demo).
  const [manualEdited, setManualEdited] = useState<{ elec?: boolean; water?: boolean }>({})
  const [manualConfirmed, setManualConfirmed] = useState<{ elec?: boolean; water?: boolean }>({})
  // Xem ảnh phóng to (đồng hồ điện/nước + hiện trạng phòng) — chạm bất kỳ đâu để đóng.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewCapturedAt, setPreviewCapturedAt] = useState<string | undefined>(undefined)

  const hasData = photos.length > 0 || !!elecReading || !!waterReading

  const pickImage = async (useCamera: boolean, onDenied?: () => void): Promise<string | null> => {
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (perm.status !== 'granted') {
        showAlert('Lỗi', 'Cần quyền camera. Bạn có thể chọn ảnh từ thư viện thay thế.')
        onDenied?.()
        return null
      }
      const r = await ImagePicker.launchCameraAsync({ quality: 0.6 })
      return r.canceled ? null : r.assets[0].uri
    }
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 })
    return r.canceled ? null : r.assets[0].uri
  }

  const captureMeter = async (kind: 'elec' | 'water', useCamera: boolean) => {
    if (!useCamera && !gallerySOS[kind]) return
    const uri = await pickImage(useCamera, () => setGallerySOS((prev) => ({ ...prev, [kind]: true })))
    if (!uri) return
    // Ảnh mới chụp — tin OCR trở lại, bỏ yêu cầu xác nhận nhập tay của lần trước.
    setManualEdited((prev) => ({ ...prev, [kind]: false }))
    setManualConfirmed((prev) => ({ ...prev, [kind]: false }))
    try {
      setOcrLoading(kind)
      const url = await uploadImageToCloudinary(uri)
      const capturedAt = new Date().toISOString()
      if (kind === 'elec') { setElecUrl(url); setMeterCapturedAt((prev) => ({ ...prev, elec: capturedAt })) }
      else { setWaterUrl(url); setMeterCapturedAt((prev) => ({ ...prev, water: capturedAt })) }
      const ocr = await realTenantService.ocrMeter(url)
      if (ocr.reading) {
        if (kind === 'elec') setElecReading(ocr.reading)
        else setWaterReading(ocr.reading)
      }
    } catch (err: any) {
      showAlert('OCR', readErr(err, 'Không đọc được ảnh, vui lòng nhập số tay.'))
    } finally {
      setOcrLoading(null)
    }
  }

  const addConditionPhoto = async (useCamera: boolean) => {
    let uris: string[] = []
    if (useCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync()
      if (perm.status !== 'granted') {
        showAlert('Lỗi', 'Cần quyền camera.')
        return
      }
      const r = await ImagePicker.launchCameraAsync({ quality: 0.6 })
      if (!r.canceled) uris = [r.assets[0].uri]
    } else {
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
      const urls = await Promise.all(uris.map((u) => uploadImageToCloudinary(u)))
      const now = new Date().toISOString()
      setPhotos((prev) => [...prev, ...urls])
      setPhotosCapturedAt((prev) => [...prev, ...urls.map(() => now)])
    } catch (err: any) {
      showAlert('Lỗi', readErr(err, 'Upload ảnh thất bại.'))
    } finally {
      setPhotoUploading(false)
    }
  }

  const save = async () => {
    if (
      (manualEdited.elec && !manualConfirmed.elec) ||
      (manualEdited.water && !manualConfirmed.water)
    ) {
      showAlert('Thiếu xác nhận', 'Vui lòng tick xác nhận chịu trách nhiệm cho số đã nhập tay trước khi lưu.')
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
        roomConditionUrls: photos,
        roomConditionPhotos: photos.map((url, i) => ({
          url,
          capturedAt: photosCapturedAt[i] || new Date().toISOString(),
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
                  onPress={() => captureMeter(kind, true)}
                  disabled={ocrLoading !== null}
                >
                  <Text style={styles.secondaryBtnSmText}>📷 Chụp</Text>
                </TouchableOpacity>
                {gallerySOS[kind] && (
                  <TouchableOpacity
                    style={styles.secondaryBtnSm}
                    onPress={() => captureMeter(kind, false)}
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
              <TextInput
                style={styles.input}
                value={kind === 'elec' ? elecReading : waterReading}
                onChangeText={(v) => {
                  if (kind === 'elec') setElecReading(v)
                  else setWaterReading(v)
                  setManualEdited((prev) => ({ ...prev, [kind]: true }))
                  setManualConfirmed((prev) => ({ ...prev, [kind]: false }))
                }}
                keyboardType="numeric"
                placeholder="OCR tự điền, có thể chỉnh"
                placeholderTextColor={Colors.textMuted}
              />
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
          ))}

          <View>
            <Text style={styles.label}>Ảnh hiện trạng phòng</Text>
            <View style={styles.methodRow}>
              <TouchableOpacity style={styles.secondaryBtnSm} onPress={() => addConditionPhoto(true)} disabled={photoUploading}>
                <Text style={styles.secondaryBtnSmText}>📸 Chụp ảnh</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryBtnSm} onPress={() => addConditionPhoto(false)} disabled={photoUploading}>
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
            <Text style={styles.label}>Ghi chú hiện trạng</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={note}
              onChangeText={setNote}
              multiline
              placeholder="Tường sạch, cửa tốt, máy lạnh đã kiểm tra..."
              placeholderTextColor={Colors.textMuted}
            />
          </View>

          <TouchableOpacity style={[styles.primaryBtn, saving && styles.btnDisabled]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.primaryBtnText}>💾 Lưu hiện trạng</Text>}
          </TouchableOpacity>
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
  const [showWebView, setShowWebView] = useState(false)
  const [busy, setBusy] = useState(false)
  const [otp, setOtp] = useState('')
  const [otpSending, setOtpSending] = useState(false)
  const otpSentRef = React.useRef(false)

  // Poll trạng thái thanh toán (PayOS, local không có webhook).
  useEffect(() => {
    if (paid) return
    const timer = setInterval(async () => {
      try {
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
      showAlert('Đã gửi lại OTP', `Mã xác nhận mới đã gửi tới ${contract.tenantPhone}.`)
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
        setShowWebView(false)
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

  const depositValue = contract.deposit

  return (
    <ScrollView contentContainerStyle={styles.panelBody}>
      <View style={[styles.banner, { backgroundColor: '#ECFEFF' }]}>
        <Text style={styles.bannerIcon}>{contract.priceApprovalStatus === 'APPROVED_AWAITING_DEPOSIT' ? '✅' : '🤝'}</Text>
        <Text style={styles.bannerTitle}>
          {contract.priceApprovalStatus === 'APPROVED_AWAITING_DEPOSIT' ? 'Host đã duyệt giá' : 'Đón khách — thu cọc'}
        </Text>
        <Text style={styles.bannerDesc}>
          {contract.tenantFullName} · {formatVnd(contract.rentAmount)} đ/tháng. Tiến hành thu cọc{' '}
          {formatVnd(depositValue)} đ rồi xác thực OTP để kích hoạt hợp đồng.
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
          <Text style={styles.label}>Hình thức thu cọc</Text>
          {/* Hệ thống thu cọc 100% chuyển khoản qua PayOS — không còn tiền mặt */}
          <View style={styles.methodRow}>
            <View style={[styles.methodChip, styles.methodChipActive]}>
              <Text style={[styles.methodText, styles.methodTextActive]}>
                💳 Chuyển khoản (PayOS)
              </Text>
            </View>
          </View>

          {!payInfo.payosQrCode && !payInfo.payosCheckoutUrl && (
            <TouchableOpacity
              style={[styles.primaryBtn, busy && styles.btnDisabled]}
              onPress={createPayment}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.primaryBtnText}>Tạo mã thanh toán cọc</Text>
              )}
            </TouchableOpacity>
          )}
          {!!payInfo.payosQrCode && !showWebView && (
            <View style={styles.qrBox}>
              <Text style={styles.qrAmount}>{formatVnd(depositValue)} đ</Text>
              <View style={styles.qrWrap}>
                <QRCode value={payInfo.payosQrCode} size={200} />
              </View>
              <Text style={styles.qrCaption}>Khách quét VietQR bằng app ngân hàng.</Text>
            </View>
          )}
          {!!payInfo.payosCheckoutUrl && !showWebView && (
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setShowWebView(true)}>
              <Text style={styles.primaryBtnText}>💳 Mở trang thanh toán PayOS</Text>
            </TouchableOpacity>
          )}
          {showWebView && !!payInfo.payosCheckoutUrl && (
            <View style={styles.webviewBox}>
              <WebView
                source={{ uri: payInfo.payosCheckoutUrl }}
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
            <Text style={styles.paidText}>Đã ghi nhận thu cọc!</Text>
          </View>
          <Text style={[styles.label, { marginTop: Spacing.md }]}>
            Mã OTP gửi tới SĐT khách {contract.tenantPhone}
          </Text>
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

  searchBox: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  searchInput: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 14,
    color: Colors.textPrimary,
  },
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
  qrAmount: { fontSize: 20, fontWeight: '800', color: Colors.primary },
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
