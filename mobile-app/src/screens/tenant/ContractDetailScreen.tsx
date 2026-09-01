import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Linking, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Colors } from '@/constants';
import { Contract } from '@/types';
import { showAlert } from '@/utils';
import {
  realTenantSelfService, ContractDetailDto, TenantHandoverResponse,
} from '@/services/tenant/selfService';
import {
  ContractDetailBody, ImageViewerModal, mapDetail, contractBodyStyles as styles,
} from '@/components/contract/ContractDetailBody';

/**
 * Xem chi tiết một hợp đồng của khách thuê.
 *
 * Phần thân nằm ở `components/contract/ContractDetailBody` — dùng chung với màn
 * "Xác nhận hợp đồng" (ContractConfirmScreen), vì khách phải xác nhận đúng bản hợp
 * đồng mà sau này họ mở ra xem lại.
 */
export const ContractDetailScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { contractId, contract: passedContract } = route.params as {
    contractId?: number | string;
    contract?: Contract;
  };

  const [contract, setContract] = useState<Contract | null>(passedContract ?? null);
  const [loading, setLoading] = useState(!passedContract);
  const [handover, setHandover] = useState<TenantHandoverResponse | null>(null);
  const [detailDto, setDetailDto] = useState<ContractDetailDto | null>(null);
  const [viewerImage, setViewerImage] = useState<string | null>(null);

  useEffect(() => {
    if (!contractId) return;
    let active = true;
    setLoading(true);
    realTenantSelfService.getContractDetail(contractId)
      .then(d => { if (active) { setContract(mapDetail(d)); setDetailDto(d); } })
      .catch(() => { if (active) showAlert('Lỗi', 'Không tải được chi tiết hợp đồng.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [contractId]);

  // Ảnh chỉ số điện/nước + hiện trạng nhà lúc đón khách — chỉ áp dụng cho HĐ đang
  // ACTIVE (BE trả lỗi cho HĐ draft/pending/terminated), nên bỏ qua lỗi lặng lẽ
  // (ẩn section) thay vì Alert như biên bản bàn giao đầy đủ (TenantOnboardingScreen).
  useEffect(() => {
    if (!contract || (contract.status !== 'active' && contract.status !== 'expiring_soon')) {
      setHandover(null);
      return;
    }
    let active = true;
    realTenantSelfService.getHandover(Number(contract.id))
      .then(d => { if (active) setHandover(d); })
      .catch(() => { if (active) setHandover(null); });
    return () => { active = false; };
  }, [contract?.id, contract?.status]);

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

  // Tenant KHÔNG tự ký/gia hạn/chấm dứt hợp đồng qua app — mọi action đó chỉ
  // MANAGER/ADMIN gọi được (verify BE 27/07/2026, TenantContractActionController).
  // Màn này chỉ XEM; hành động thật duy nhất là "Yêu cầu trả phòng" (RequestCheckout,
  // có API tenant thật riêng — TenantCheckoutServiceImpl).
  const canTerminate = contract.status === 'active';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Quay lại</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chi tiết hợp đồng</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <ContractDetailBody
          contract={contract}
          detailDto={detailDto}
          handover={handover}
          onImagePress={setViewerImage}
        />

        <View style={styles.actionSection}>
          {contract.pdfUrl && (
            <TouchableOpacity
              style={styles.actionBtnSecondary}
              onPress={() => Linking.openURL(contract.pdfUrl!)}
            >
              <Text style={styles.actionBtnSecondaryText}>📥 Tải PDF hợp đồng</Text>
            </TouchableOpacity>
          )}

          {/* Yêu cầu trả phòng — full checkout flow, API tenant thật (không mock) */}
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

      <ImageViewerModal url={viewerImage} onClose={() => setViewerImage(null)} />
    </SafeAreaView>
  );
};
