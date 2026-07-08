import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal,
  TextInput, Alert, Linking, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import { Contract } from '@/types';
import { formatDate, getContractStatusLabel, getContractStatusColor, getDaysUntil } from '@/utils';
import {
  realTenantSelfService, ContractDetailDto, mapBeContractStatus,
} from '@/services/tenant/selfService';

// Map DTO chi tiết từ BE -> Contract dùng cho UI
const mapDetail = (d: ContractDetailDto): Contract => {
  const daysUntilExpiry = d.endDate ? getDaysUntil(d.endDate) : undefined;
  return {
    id: String(d.id),
    code: d.code,
    type: 'manager_tenant',
    lessorName: d.lessorName ?? '',
    lessorPhone: d.lessorPhone,
    lesseeName: d.lesseeName ?? '',
    lesseeCccd: d.lesseeCccd ?? '',
    lesseePhone: d.lesseePhone ?? '',
    propertyName: d.propertyName ?? '',
    roomCode: d.roomCode,
    startDate: d.startDate,
    endDate: d.endDate,
    depositAmount: d.depositAmount,
    rentAmount: d.rentAmount,
    status: mapBeContractStatus(d.status, daysUntilExpiry),
    equipmentList: (d.equipmentList ?? []).map(e => ({
      id: String(e.id), name: e.name, quantity: e.quantity ?? 1, condition: e.condition ?? '',
    })),
    notes: d.notes,
    signedAt: d.signedAt,
    terminatedAt: d.terminatedAt,
    terminationReason: d.terminationReason,
    pdfUrl: d.pdfUrl,
    daysUntilExpiry,
  };
};

const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={styles.sectionCard}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const InfoRow: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={[styles.infoValue, highlight && { color: Colors.primary, fontWeight: '700' }]}>{value}</Text>
  </View>
);

export const ContractDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { contractId, contract: passedContract } = route.params as {
    contractId?: number | string;
    contract?: Contract;
  };

  const [contract, setContract] = useState<Contract | null>(passedContract ?? null);
  const [loading, setLoading] = useState(!passedContract);

  useEffect(() => {
    if (!contractId) return;
    let active = true;
    setLoading(true);
    realTenantSelfService.getContractDetail(contractId)
      .then(d => { if (active) setContract(mapDetail(d)); })
      .catch(() => { if (active) Alert.alert('Lỗi', 'Không tải được chi tiết hợp đồng.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [contractId]);

  const [showOtpModal, setShowOtpModal] = useState(false);
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [otp, setOtp] = useState('');
  const [renewMonths, setRenewMonths] = useState('12');
  const [renewNote, setRenewNote] = useState('');
  const [terminateReason, setTerminateReason] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  if (loading || !contract) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Quay lại</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Chi tiết hợp đồng</Text>
          <View style={{ width: 80 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const statusColor = getContractStatusColor(contract.status);

  const handleSendOtp = () => {
    setOtpSent(true);
    Alert.alert('OTP đã gửi', 'Mã OTP 6 số đã được gửi đến số điện thoại của bạn.');
  };

  const handleSignContract = () => {
    if (otp.length !== 6) {
      Alert.alert('Lỗi', 'Vui lòng nhập mã OTP 6 số hợp lệ.');
      return;
    }
    setShowOtpModal(false);
    Alert.alert(
      'Ký hợp đồng thành công! ✅',
      'Hợp đồng của bạn đã được ký và sẽ có hiệu lực từ ngày bắt đầu đã ghi trong hợp đồng.',
      [{ text: 'OK', onPress: () => navigation.goBack() }]
    );
  };

  const handleRenewalRequest = () => {
    const months = parseInt(renewMonths, 10);
    if (!months || months < 1 || months > 24) {
      Alert.alert('Lỗi', 'Vui lòng nhập số tháng gia hạn hợp lệ (1-24 tháng).');
      return;
    }
    setShowRenewModal(false);
    Alert.alert(
      'Gửi yêu cầu gia hạn thành công 📋',
      `Yêu cầu gia hạn ${months} tháng đã được gửi. Quản lý sẽ xem xét và phản hồi sớm nhất.`,
      [{ text: 'OK' }]
    );
  };

  const handleTerminateRequest = () => {
    if (!terminateReason.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập lý do chấm dứt hợp đồng.');
      return;
    }
    setShowTerminateModal(false);
    Alert.alert(
      'Gửi yêu cầu chấm dứt thành công',
      'Yêu cầu chấm dứt hợp đồng đã được gửi. Quản lý sẽ liên hệ để xác nhận thủ tục.',
      [{ text: 'OK' }]
    );
  };

  const canSign = contract.status === 'waiting_sign';
  const canRenew = contract.status === 'active' || contract.status === 'expiring_soon';
  const canTerminate = contract.status === 'active';

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Quay lại</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chi tiết hợp đồng</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Status Banner */}
        <View style={[styles.statusBanner, { backgroundColor: statusColor + '15', borderColor: statusColor + '40' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{getContractStatusLabel(contract.status)}</Text>
          {contract.signedAt && (
            <Text style={styles.signedDate}>Ký ngày {formatDate(contract.signedAt)}</Text>
          )}
        </View>

        {/* Contract ID */}
        <View style={styles.codeCard}>
          <Text style={styles.codeLabel}>Mã hợp đồng</Text>
          <Text style={styles.codeValue}>{contract.code}</Text>
        </View>

        {/* Thông tin các bên */}
        <SectionCard title="👥 Thông tin các bên">
          <InfoRow label="Bên cho thuê" value={contract.lessorName} />
          {contract.lessorPhone && <InfoRow label="SĐT bên cho thuê" value={contract.lessorPhone} />}
          <InfoRow label="Bên thuê" value={contract.lesseeName} />
          <InfoRow label="CCCD bên thuê" value={contract.lesseeCccd} />
          <InfoRow label="SĐT bên thuê" value={contract.lesseePhone} />
        </SectionCard>

        {/* Thông tin phòng */}
        <SectionCard title="🏠 Thông tin phòng">
          <InfoRow label="Tòa nhà" value={contract.propertyName} />
          {contract.roomCode && <InfoRow label="Phòng" value={contract.roomCode} />}
          <InfoRow label="Ngày bắt đầu" value={formatDate(contract.startDate)} />
          <InfoRow label="Ngày kết thúc" value={formatDate(contract.endDate)} />
          {contract.daysUntilExpiry !== undefined && contract.daysUntilExpiry > 0 && (
            <InfoRow label="Còn lại" value={`${contract.daysUntilExpiry} ngày`} />
          )}
        </SectionCard>

        {/* Tài chính */}
        <SectionCard title="💰 Tài chính">
          <InfoRow label="Tiền thuê hàng tháng" value={`${contract.rentAmount.toLocaleString('vi-VN')} đ`} highlight />
          <InfoRow label="Tiền đặt cọc" value={`${contract.depositAmount.toLocaleString('vi-VN')} đ`} />
        </SectionCard>

        {/* Danh sách tài sản bàn giao */}
        {contract.equipmentList.length > 0 && (
          <SectionCard title="📦 Tài sản bàn giao">
            {contract.equipmentList.map((eq, i) => (
              <View key={eq.id} style={[styles.assetRow, i < contract.equipmentList.length - 1 && styles.assetRowBorder]}>
                <View style={styles.assetInfo}>
                  <Text style={styles.assetName}>{eq.name}</Text>
                  <Text style={styles.assetCondition}>Tình trạng: {eq.condition}</Text>
                </View>
                <Text style={styles.assetQty}>x{eq.quantity}</Text>
              </View>
            ))}
          </SectionCard>
        )}

        {/* Ghi chú */}
        {contract.notes && (
          <SectionCard title="📝 Điều khoản & Ghi chú">
            <Text style={styles.notesText}>{contract.notes}</Text>
          </SectionCard>
        )}

        {/* Lịch sử ký kết */}
        <SectionCard title="📜 Lịch sử">
          {contract.signedAt && (
            <View style={styles.historyItem}>
              <View style={[styles.historyDot, { backgroundColor: Colors.success }]} />
              <View>
                <Text style={styles.historyTitle}>Đã ký hợp đồng</Text>
                <Text style={styles.historyDate}>{formatDate(contract.signedAt)}</Text>
              </View>
            </View>
          )}
          <View style={styles.historyItem}>
            <View style={[styles.historyDot, { backgroundColor: Colors.primary }]} />
            <View>
              <Text style={styles.historyTitle}>Hợp đồng được tạo</Text>
              <Text style={styles.historyDate}>{formatDate(contract.startDate)}</Text>
            </View>
          </View>
          {contract.terminatedAt && (
            <View style={styles.historyItem}>
              <View style={[styles.historyDot, { backgroundColor: Colors.error }]} />
              <View>
                <Text style={styles.historyTitle}>Chấm dứt hợp đồng</Text>
                <Text style={styles.historyDate}>{formatDate(contract.terminatedAt)}</Text>
                {contract.terminationReason && (
                  <Text style={styles.historyNote}>{contract.terminationReason}</Text>
                )}
              </View>
            </View>
          )}
        </SectionCard>

        {/* Action Buttons */}
        <View style={styles.actionSection}>
          {/* Tải PDF */}
          {contract.pdfUrl && (
            <TouchableOpacity
              style={styles.actionBtnSecondary}
              onPress={() => Linking.openURL(contract.pdfUrl!)}
            >
              <Text style={styles.actionBtnSecondaryText}>📥 Tải PDF hợp đồng</Text>
            </TouchableOpacity>
          )}

          {/* Ký hợp đồng */}
          {canSign && (
            <TouchableOpacity
              style={[styles.actionBtnPrimary, { backgroundColor: Colors.success }]}
              onPress={() => setShowOtpModal(true)}
            >
              <Text style={styles.actionBtnPrimaryText}>✍️ Ký hợp đồng qua OTP</Text>
            </TouchableOpacity>
          )}

          {/* Yêu cầu gia hạn */}
          {canRenew && (
            <TouchableOpacity
              style={styles.actionBtnPrimary}
              onPress={() => setShowRenewModal(true)}
            >
              <Text style={styles.actionBtnPrimaryText}>🔄 Yêu cầu gia hạn hợp đồng</Text>
            </TouchableOpacity>
          )}

          {/* Yêu cầu trả phòng — full checkout flow */}
          {canTerminate && (
            <TouchableOpacity
              style={[styles.actionBtnOutline, { borderColor: '#DC2626' }]}
              onPress={() => navigation.navigate('RequestCheckout', { contract })}
            >
              <Text style={[styles.actionBtnOutlineText, { color: '#DC2626' }]}>
                🚪 Yêu cầu trả phòng
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* ===== Modal OTP ký hợp đồng ===== */}
      <Modal visible={showOtpModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>✍️ Ký hợp đồng điện tử</Text>
            <Text style={styles.modalDesc}>
              Để xác nhận ký hợp đồng {contract.code}, chúng tôi sẽ gửi mã OTP đến số
              {' '}<Text style={{ fontWeight: '700' }}>{contract.lesseePhone}</Text>.
            </Text>

            {!otpSent ? (
              <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleSendOtp}>
                <Text style={styles.modalBtnPrimaryText}>📩 Gửi mã OTP</Text>
              </TouchableOpacity>
            ) : (
              <>
                <Text style={styles.otpLabel}>Nhập mã OTP 6 số:</Text>
                <TextInput
                  style={styles.otpInput}
                  placeholder="______"
                  keyboardType="numeric"
                  maxLength={6}
                  value={otp}
                  onChangeText={setOtp}
                  textAlign="center"
                />
                <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleSignContract}>
                  <Text style={styles.modalBtnPrimaryText}>✅ Xác nhận ký hợp đồng</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSendOtp}>
                  <Text style={styles.resendOtp}>Gửi lại OTP</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={styles.modalBtnCancel} onPress={() => { setShowOtpModal(false); setOtpSent(false); setOtp(''); }}>
              <Text style={styles.modalBtnCancelText}>Hủy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ===== Modal Gia hạn ===== */}
      <Modal visible={showRenewModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🔄 Yêu cầu gia hạn hợp đồng</Text>
            <Text style={styles.modalDesc}>
              Hợp đồng hiện tại hết hạn ngày <Text style={{ fontWeight: '700' }}>{formatDate(contract.endDate)}</Text>.
              Vui lòng cho biết bạn muốn gia hạn thêm bao nhiêu tháng.
            </Text>

            <Text style={styles.inputLabel}>Số tháng gia hạn (1-24):</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ví dụ: 12"
              keyboardType="numeric"
              value={renewMonths}
              onChangeText={setRenewMonths}
            />

            <Text style={styles.inputLabel}>Ghi chú thêm (không bắt buộc):</Text>
            <TextInput
              style={[styles.modalInput, { height: 80, textAlignVertical: 'top' }]}
              placeholder="Ví dụ: Muốn giữ nguyên giá thuê..."
              multiline
              value={renewNote}
              onChangeText={setRenewNote}
            />

            <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleRenewalRequest}>
              <Text style={styles.modalBtnPrimaryText}>Gửi yêu cầu gia hạn</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowRenewModal(false)}>
              <Text style={styles.modalBtnCancelText}>Hủy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ===== Modal Chấm dứt ===== */}
      <Modal visible={showTerminateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🚪 Yêu cầu chấm dứt hợp đồng</Text>
            <Text style={[styles.modalDesc, { color: Colors.error }]}>
              ⚠️ Lưu ý: Việc chấm dứt sớm hợp đồng có thể ảnh hưởng đến tiền đặt cọc. Vui lòng đọc kỹ điều khoản trước khi gửi yêu cầu.
            </Text>

            <Text style={styles.inputLabel}>Lý do chấm dứt hợp đồng:</Text>
            <TextInput
              style={[styles.modalInput, { height: 100, textAlignVertical: 'top' }]}
              placeholder="Vui lòng nêu rõ lý do..."
              multiline
              value={terminateReason}
              onChangeText={setTerminateReason}
            />

            <TouchableOpacity style={[styles.modalBtnPrimary, { backgroundColor: Colors.error }]} onPress={handleTerminateRequest}>
              <Text style={styles.modalBtnPrimaryText}>Gửi yêu cầu chấm dứt</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalBtnCancel} onPress={() => setShowTerminateModal(false)}>
              <Text style={styles.modalBtnCancelText}>Hủy</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: { padding: Spacing.sm },
  backBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  headerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },

  scroll: { flex: 1 },

  statusBanner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    margin: Spacing.base, padding: Spacing.md, borderRadius: BorderRadius.lg, borderWidth: 1,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 14, fontWeight: '700', flex: 1 },
  signedDate: { fontSize: 12, color: Colors.textMuted },

  codeCard: {
    marginHorizontal: Spacing.base, marginBottom: Spacing.md,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm,
    alignItems: 'center',
  },
  codeLabel: { fontSize: 12, color: Colors.textMuted, marginBottom: 4 },
  codeValue: { fontSize: 20, fontWeight: '800', color: Colors.primary, letterSpacing: 1 },

  sectionCard: {
    marginHorizontal: Spacing.base, marginBottom: Spacing.md,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, ...Shadow.sm,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.md },

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  infoLabel: { fontSize: 13, color: Colors.textMuted, flex: 1 },
  infoValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, flex: 1, textAlign: 'right' },

  assetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.sm },
  assetRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.divider },
  assetInfo: { flex: 1 },
  assetName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  assetCondition: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  assetQty: { fontSize: 14, fontWeight: '700', color: Colors.primary },

  notesText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22 },

  historyItem: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingVertical: Spacing.sm },
  historyDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  historyTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  historyDate: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  historyNote: { fontSize: 12, color: Colors.textSecondary, marginTop: 2, fontStyle: 'italic' },

  actionSection: { paddingHorizontal: Spacing.base, paddingBottom: 40, gap: Spacing.md },
  actionBtnPrimary: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', ...Shadow.md,
  },
  actionBtnPrimaryText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  actionBtnSecondary: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center',
  },
  actionBtnSecondaryText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  actionBtnOutline: {
    borderRadius: BorderRadius.lg, paddingVertical: Spacing.base,
    alignItems: 'center', borderWidth: 1.5,
  },
  actionBtnOutlineText: { fontSize: 15, fontWeight: '700' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: Spacing.lg, paddingBottom: 40,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.sm },
  modalDesc: { fontSize: 14, color: Colors.textSecondary, marginBottom: Spacing.lg, lineHeight: 20 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary, marginBottom: Spacing.sm },
  modalInput: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md,
    padding: Spacing.md, fontSize: 16, marginBottom: Spacing.base, color: Colors.textPrimary,
  },
  otpLabel: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: Spacing.sm },
  otpInput: {
    borderWidth: 2, borderColor: Colors.primary, borderRadius: BorderRadius.md,
    padding: Spacing.md, fontSize: 28, fontWeight: '700', color: Colors.primary,
    letterSpacing: 8, marginBottom: Spacing.base,
  },
  resendOtp: { textAlign: 'center', color: Colors.primary, fontSize: 13, fontWeight: '600', marginTop: Spacing.sm },
  modalBtnPrimary: {
    backgroundColor: Colors.primary, borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.base, alignItems: 'center', marginBottom: Spacing.md,
  },
  modalBtnPrimaryText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  modalBtnCancel: { alignItems: 'center', paddingVertical: Spacing.sm },
  modalBtnCancelText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
});
