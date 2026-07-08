import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
import { BorderRadius, Colors, Shadow, Spacing } from '@/constants'
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

  const load = useCallback(async () => {
    try {
      const data = await realTenantService.listManagedContracts()
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
      </View>

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
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setPaid(true)}>
              <Text style={styles.primaryBtnText}>💵 Xác nhận đã thu cọc tiền mặt</Text>
            </TouchableOpacity>
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
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  statusText: { fontSize: 11, fontWeight: '700' },

  panelBody: { padding: Spacing.lg, gap: Spacing.md },
  banner: { borderRadius: BorderRadius.xl, padding: Spacing.lg, alignItems: 'center', gap: 6 },
  bannerIcon: { fontSize: 40 },
  bannerTitle: { fontSize: 17, fontWeight: '800', color: Colors.textPrimary },
  bannerDesc: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', lineHeight: 19 },

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
})
