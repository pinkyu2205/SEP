import React, { useCallback, useEffect, useState } from 'react'
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
import { WebView } from 'react-native-webview'
import * as Sharing from 'expo-sharing'
import * as ImagePicker from 'expo-image-picker'
import * as FileSystem from 'expo-file-system/legacy'
import Signature from 'react-native-signature-canvas'
import { BorderRadius, Colors, Shadow, Spacing } from '@/constants'
import { uploadImageToCloudinary } from '@/services/core/cloudinary'
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

// Chữ ký (base64 PNG từ SignatureScreen.onOK) -> ghi file tạm -> upload Cloudinary.
// BE không có field lưu chữ ký riêng nên chỉ dùng làm bằng chứng audit (best-effort,
// đính vào roomConditionNote) — hành động XÁC NHẬN THẬT SỰ vẫn là gọi deposit-cash-paid,
// lỗi ở bước upload này KHÔNG được chặn luồng xác nhận cọc.
const uploadSignature = async (base64Png: string): Promise<string | null> => {
  if (Platform.OS === 'web') return null
  try {
    const path = `${FileSystem.cacheDirectory}signature-${Date.now()}.png`
    const raw = base64Png.replace(/^data:image\/png;base64,/, '')
    await FileSystem.writeAsStringAsync(path, raw, { encoding: 'base64' })
    return await uploadImageToCloudinary(path)
  } catch {
    return null
  }
}

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
        Alert.alert('Lỗi', 'Thiết bị không hỗ trợ chia sẻ file.')
      }
    } catch (err: any) {
      Alert.alert('Lỗi', readErr(err, 'Không mở được file hợp đồng.'))
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
      Alert.alert('Lỗi tải dữ liệu', readErr(err, 'Không tải được danh sách hợp đồng chờ xử lý.'))
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
      <ScrollView
        contentContainerStyle={styles.listBody}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {list.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>Không có hợp đồng nào chờ xử lý.</Text>
          </View>
        ) : (
          list.map((c) => {
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
                  <Text style={styles.cardMeta}>
                    {c.contractCode}
                    {c.roomNumber ? ` · Phòng ${c.roomNumber}` : ''}
                  </Text>
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
    if (rentAmount <= 0) return Alert.alert('Lỗi', 'Giá thuê phải lớn hơn 0.')
    try {
      setBusy(true)
      const updated = await realTenantService.resubmitPriceApproval(contract.id, {
        rentAmount,
        deposit: depositVal,
      })
      Alert.alert('Đã gửi lại', 'Hợp đồng đã được gửi Host duyệt lại.')
      onChanged(updated)
    } catch (err: any) {
      Alert.alert('Lỗi', readErr(err, 'Không gửi lại được hợp đồng.'))
    } finally {
      setBusy(false)
    }
  }

  const cancel = () => {
    Alert.alert('Hủy hợp đồng?', 'Thao tác này sẽ hủy hợp đồng đang chờ. Bạn chắc chắn?', [
      { text: 'Không', style: 'cancel' },
      {
        text: 'Hủy hợp đồng',
        style: 'destructive',
        onPress: async () => {
          try {
            setBusy(true)
            await realTenantService.cancelContract(contract.id)
            Alert.alert('Đã hủy', 'Hợp đồng đã được hủy.')
            onDone()
          } catch (err: any) {
            Alert.alert('Lỗi', readErr(err, 'Không hủy được hợp đồng.'))
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
  const [photos, setPhotos] = useState<string[]>(contract.roomConditionUrls ?? [])
  const [note, setNote] = useState(contract.roomConditionNote ?? '')
  const [ocrLoading, setOcrLoading] = useState<'elec' | 'water' | null>(null)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  const hasData = photos.length > 0 || !!elecReading || !!waterReading

  const pickImage = async (useCamera: boolean): Promise<string | null> => {
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
      if (kind === 'elec') setElecUrl(url)
      else setWaterUrl(url)
      const ocr = await realTenantService.ocrMeter(url)
      if (ocr.reading) {
        if (kind === 'elec') setElecReading(ocr.reading)
        else setWaterReading(ocr.reading)
      }
    } catch (err: any) {
      Alert.alert('OCR', readErr(err, 'Không đọc được ảnh, vui lòng nhập số tay.'))
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
      setPhotos((prev) => [...prev, ...urls])
    } catch (err: any) {
      Alert.alert('Lỗi', readErr(err, 'Upload ảnh thất bại.'))
    } finally {
      setPhotoUploading(false)
    }
  }

  const save = async () => {
    try {
      setSaving(true)
      const updated = await realTenantService.updateDraftContract(contract.id, {
        initialElectricReading: elecReading ? Number(elecReading) : undefined,
        initialWaterReading: waterReading ? Number(waterReading) : undefined,
        electricMeterImageUrl: elecUrl || undefined,
        waterMeterImageUrl: waterUrl || undefined,
        roomConditionUrls: photos,
        roomConditionNote: note || undefined,
      })
      onChanged(updated)
      setExpanded(false)
      Alert.alert('Đã lưu', 'Hiện trạng phòng & chỉ số điện nước đã được cập nhật.')
    } catch (err: any) {
      Alert.alert('Lỗi', readErr(err, 'Không lưu được hiện trạng phòng.'))
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
                <TouchableOpacity
                  style={styles.secondaryBtnSm}
                  onPress={() => captureMeter(kind, false)}
                  disabled={ocrLoading !== null}
                >
                  <Text style={styles.secondaryBtnSmText}>🖼 Chọn ảnh</Text>
                </TouchableOpacity>
                {ocrLoading === kind && <ActivityIndicator color={Colors.primary} style={{ marginLeft: 8 }} />}
              </View>
              {!!(kind === 'elec' ? elecUrl : waterUrl) && (
                <Image source={{ uri: kind === 'elec' ? elecUrl : waterUrl }} style={styles.meterThumb} />
              )}
              <TextInput
                style={styles.input}
                value={kind === 'elec' ? elecReading : waterReading}
                onChangeText={kind === 'elec' ? setElecReading : setWaterReading}
                keyboardType="numeric"
                placeholder="OCR tự điền, có thể chỉnh"
                placeholderTextColor={Colors.textMuted}
              />
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
                    <Image source={{ uri }} style={styles.photoThumb} />
                    <TouchableOpacity
                      style={styles.removePhotoBtn}
                      onPress={() => setPhotos((prev) => prev.filter((x) => x !== uri))}
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
    </View>
  )
}

const signaturePadWebStyle = `.m-signature-pad--footer { margin: 0; } .m-signature-pad--body { border: none; } body,html { width: 100%; height: 100%; }`

// ===== Thu cọc tiền mặt tại chỗ: khách ký trên máy Manager rồi manager xác nhận đã
// nhận tiền — xác nhận 2 chiều, thứ tự không bắt buộc (khớp BE tài liệu §3 nhánh B). =====
const CashDepositFlow: React.FC<{
  contract: TenantContractResponse
  onChanged: (c: TenantContractResponse) => void
}> = ({ contract, onChanged }) => {
  const [tenantConfirmedAt, setTenantConfirmedAt] = useState(contract.depositCashTenantConfirmedAt ?? null)
  const [managerConfirmedAt, setManagerConfirmedAt] = useState(contract.depositCashManagerConfirmedAt ?? null)
  const [showPad, setShowPad] = useState(false)
  const [busyTenant, setBusyTenant] = useState(false)
  const [busyManager, setBusyManager] = useState(false)

  const handleSignature = async (base64: string) => {
    setShowPad(false)
    setBusyTenant(true)
    try {
      const res = await realTenantService.confirmDepositCashByTenant(contract.id, contract.tenantPhone)
      setTenantConfirmedAt(res.depositCashTenantConfirmedAt ?? new Date().toISOString())
      setManagerConfirmedAt(res.depositCashManagerConfirmedAt ?? managerConfirmedAt)
      onChanged(res)
      // Lưu chữ ký làm bằng chứng audit (best-effort) — KHÔNG chặn luồng nếu lỗi,
      // vì hành động xác nhận thật sự đã hoàn tất ở lệnh gọi deposit-cash-paid trên.
      uploadSignature(base64).then((url) => {
        if (!url) return
        realTenantService
          .updateDraftContract(contract.id, {
            roomConditionNote: `${contract.roomConditionNote ? contract.roomConditionNote + '\n' : ''}Chữ ký khách xác nhận cọc tiền mặt: ${url}`,
          })
          .catch(() => {})
      })
    } catch (err: any) {
      Alert.alert('Lỗi', readErr(err, 'Không xác nhận được — kiểm tra lại SĐT khách trên hợp đồng.'))
    } finally {
      setBusyTenant(false)
    }
  }

  const confirmManager = async () => {
    try {
      setBusyManager(true)
      const res = await realTenantService.confirmDepositCashByManager(contract.id)
      setManagerConfirmedAt(res.depositCashManagerConfirmedAt ?? new Date().toISOString())
      setTenantConfirmedAt(res.depositCashTenantConfirmedAt ?? tenantConfirmedAt)
      onChanged(res)
    } catch (err: any) {
      Alert.alert('Lỗi', readErr(err, 'Không xác nhận được đã nhận tiền.'))
    } finally {
      setBusyManager(false)
    }
  }

  return (
    <View style={{ gap: Spacing.md, marginTop: Spacing.md }}>
      <View style={styles.cashStepCard}>
        <Text style={styles.cashStepTitle}>{tenantConfirmedAt ? '✅' : '1️⃣'} Khách ký xác nhận đã trả tiền</Text>
        {tenantConfirmedAt ? (
          <Text style={styles.cashStepDone}>
            Đã xác nhận lúc {new Date(tenantConfirmedAt).toLocaleTimeString('vi-VN')}
          </Text>
        ) : (
          <TouchableOpacity
            style={[styles.primaryBtn, busyTenant && styles.btnDisabled]}
            onPress={() => setShowPad(true)}
            disabled={busyTenant}
          >
            {busyTenant ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryBtnText}>✍️ Đưa máy cho khách ký</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.cashStepCard}>
        <Text style={styles.cashStepTitle}>{managerConfirmedAt ? '✅' : '2️⃣'} Manager xác nhận đã nhận tiền</Text>
        {managerConfirmedAt ? (
          <Text style={styles.cashStepDone}>
            Đã xác nhận lúc {new Date(managerConfirmedAt).toLocaleTimeString('vi-VN')}
          </Text>
        ) : (
          <TouchableOpacity
            style={[styles.primaryBtn, busyManager && styles.btnDisabled]}
            onPress={confirmManager}
            disabled={busyManager}
          >
            {busyManager ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryBtnText}>💵 Đã nhận đủ tiền cọc</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={showPad} animationType="slide" onRequestClose={() => setShowPad(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.white }}>
          <View style={styles.signatureHeader}>
            <Text style={styles.signatureHeaderTitle}>Chữ ký xác nhận — {contract.tenantFullName}</Text>
            <TouchableOpacity onPress={() => setShowPad(false)}>
              <Text style={styles.signatureCloseText}>Đóng</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.signatureHint}>
            Đưa thiết bị cho khách ký xác nhận đã trả {formatVnd(contract.deposit)} đ tiền cọc mặt.
          </Text>
          <View style={{ flex: 1 }}>
            <Signature
              onOK={handleSignature}
              onEmpty={() => Alert.alert('Chưa ký', 'Vui lòng ký vào khung bên trên.')}
              descriptionText=""
              clearText="Xóa"
              confirmText="Xác nhận chữ ký"
              webStyle={signaturePadWebStyle}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  )
}

// ===== Đã duyệt: thu cọc (PayOS/cash) + OTP =====
const DepositOtpPanel: React.FC<{
  contract: TenantContractResponse
  onDone: () => void
  onChanged: (c: TenantContractResponse) => void
}> = ({ contract, onChanged }) => {
  const navigation = useNavigation<any>()
  const [method, setMethod] = useState<'payos' | 'cash'>('payos')
  const [payInfo, setPayInfo] = useState<TenantContractResponse>(contract)
  const [paid, setPaid] = useState(contract.paymentStatus === 'PAID')
  const [showWebView, setShowWebView] = useState(false)
  const [busy, setBusy] = useState(false)
  const [otp, setOtp] = useState('')
  const [otpSending, setOtpSending] = useState(false)
  const otpSentRef = React.useRef(false)

  // Poll trạng thái thanh toán (PayOS, local không có webhook).
  useEffect(() => {
    if (method !== 'payos' || paid) return
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
  }, [method, paid, contract.id])

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
      Alert.alert('Đã gửi lại OTP', `Mã xác nhận mới đã gửi tới ${contract.tenantPhone}.`)
    } catch (err: any) {
      Alert.alert('Lỗi', readErr(err, 'Không gửi được OTP.'))
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
      Alert.alert('Lỗi', readErr(err, 'Không tạo được liên kết thanh toán.'))
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
        Alert.alert('Chưa nhận được thanh toán', 'PayOS chưa ghi nhận giao dịch. Thử lại sau vài giây.')
      }
    } catch (err: any) {
      Alert.alert('Lỗi', readErr(err, 'Không kiểm tra được trạng thái.'))
    }
  }

  const confirm = async () => {
    if (otp.length !== 6) return Alert.alert('Lỗi', 'Vui lòng nhập mã OTP gồm 6 chữ số.')
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
      Alert.alert('Lỗi', readErr(err, 'Không hoàn tất được hợp đồng.'))
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
          <View style={styles.methodRow}>
            <TouchableOpacity
              style={[styles.methodChip, method === 'payos' && styles.methodChipActive]}
              onPress={() => setMethod('payos')}
            >
              <Text style={[styles.methodText, method === 'payos' && styles.methodTextActive]}>
                💳 Chuyển khoản (PayOS)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.methodChip, method === 'cash' && styles.methodChipActive]}
              onPress={() => setMethod('cash')}
            >
              <Text style={[styles.methodText, method === 'cash' && styles.methodTextActive]}>
                💵 Tiền mặt
              </Text>
            </TouchableOpacity>
          </View>

          {method === 'cash' ? (
            <CashDepositFlow
              contract={contract}
              onChanged={(c) => {
                onChanged(c)
                if (c.paymentStatus === 'PAID') {
                  // BE tự gửi OTP ngay khi đủ 2 xác nhận tiền mặt — bỏ qua auto-send bên dưới.
                  otpSentRef.current = true
                  setPaid(true)
                }
              }}
            />
          ) : (
            <>
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
  cardMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
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
  meterThumb: {
    width: '100%',
    height: 130,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.divider,
  },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  photoWrap: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    backgroundColor: Colors.divider,
  },
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

  cashStepCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  cashStepTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  cashStepDone: { fontSize: 12, color: Colors.success, fontWeight: '600' },

  signatureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  signatureHeaderTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, flexShrink: 1 },
  signatureCloseText: { color: Colors.primary, fontWeight: '700', fontSize: 14 },
  signatureHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
})
