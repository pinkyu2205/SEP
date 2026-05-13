import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';

// Mock contracts for mobile (same as web)
const MOCK_CONTRACTS = [
  {
    id: 'c-am-1', code: 'HD-AM-2026-001', type: 'admin_manager',
    lessorName: 'Admin', lesseeName: 'Nguyễn Văn Quản', lesseeCccd: '079200100100', lesseePhone: '0901234567',
    propertyName: 'Nhà Nguyễn Trãi', roomCode: null,
    startDate: '15/01/2026', endDate: '15/01/2027',
    depositAmount: 50000000, rentAmount: 25000000, status: 'active',
    equipmentList: [
      { id: '1', name: 'Máy bơm nước tầng thượng', quantity: 1, condition: 'Đã sử dụng - Tốt' },
      { id: '2', name: 'Bình nước nóng Ariston 30L', quantity: 8, condition: 'Mới' },
      { id: '3', name: 'Cửa cuốn tầng trệt', quantity: 1, condition: 'Đã sử dụng - Tốt' },
    ],
  },
  {
    id: 'c-am-2', code: 'HD-AM-2026-002', type: 'admin_manager',
    lessorName: 'Admin', lesseeName: 'Trần Thị Quản', lesseeCccd: '079200100200', lesseePhone: '0912345678',
    propertyName: 'Nhà Lê Văn Sỹ', roomCode: null,
    startDate: '10/02/2026', endDate: '10/02/2027',
    depositAmount: 70000000, rentAmount: 35000000, status: 'active',
    equipmentList: [
      { id: '4', name: 'Thang máy mini', quantity: 1, condition: 'Mới' },
      { id: '5', name: 'Camera an ninh', quantity: 4, condition: 'Mới' },
    ],
  },
  {
    id: 'c-mt-1', code: 'HD-MT-2026-001', type: 'manager_tenant',
    lessorName: 'Nguyễn Văn Quản', lesseeName: 'Trần Văn A', lesseeCccd: '079201001001', lesseePhone: '0901111001',
    propertyName: 'Nhà Nguyễn Trãi', roomCode: 'P101',
    startDate: '20/01/2026', endDate: '20/01/2027',
    depositAmount: 3500000, rentAmount: 3500000, status: 'active',
    equipmentList: [
      { id: '6', name: 'Bình nước nóng Ariston 30L', quantity: 1, condition: 'Mới' },
      { id: '7', name: 'Điều hòa Daikin 9000BTU', quantity: 1, condition: 'Mới' },
      { id: '8', name: 'Giường 1m6 + Nệm', quantity: 1, condition: 'Mới' },
      { id: '9', name: 'Tủ quần áo 2 cánh', quantity: 1, condition: 'Mới' },
    ],
  },
  {
    id: 'c-mt-2', code: 'HD-MT-2026-002', type: 'manager_tenant',
    lessorName: 'Nguyễn Văn Quản', lesseeName: 'Lê Thị B', lesseeCccd: '079201001002', lesseePhone: '0901111002',
    propertyName: 'Nhà Nguyễn Trãi', roomCode: 'P102',
    startDate: '01/02/2026', endDate: '15/05/2026',
    depositAmount: 3200000, rentAmount: 3200000, status: 'expiring_soon',
    equipmentList: [
      { id: '10', name: 'Bình nước nóng Ariston 30L', quantity: 1, condition: 'Mới' },
      { id: '11', name: 'Điều hòa Panasonic 9000BTU', quantity: 1, condition: 'Mới' },
    ],
  },
  {
    id: 'c-mt-3', code: 'HD-MT-2026-003', type: 'manager_tenant',
    lessorName: 'Trần Thị Quản', lesseeName: 'Hoàng Văn E', lesseeCccd: '079201001005', lesseePhone: '0901111005',
    propertyName: 'Nhà Lê Văn Sỹ', roomCode: 'P101',
    startDate: '15/02/2026', endDate: '15/02/2027',
    depositAmount: 4000000, rentAmount: 4000000, status: 'active',
    equipmentList: [
      { id: '12', name: 'Điều hòa Casper 9000BTU', quantity: 1, condition: 'Mới' },
      { id: '13', name: 'Máy giặt Toshiba 8kg', quantity: 1, condition: 'Mới' },
    ],
  },
];

type ContractItem = typeof MOCK_CONTRACTS[0];

const statusMap: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: 'Đang hiệu lực', color: '#16A34A', bg: '#F0FDF4' },
  expiring_soon: { label: 'Sắp hết hạn', color: '#DC2626', bg: '#FEF2F2' },
  terminated: { label: 'Đã thanh lý', color: '#6B7280', bg: '#F3F4F6' },
};

interface Props {
  navigation: any;
  route?: any;
  filterRole?: 'admin' | 'manager' | 'tenant';
  filterType?: 'admin_manager' | 'manager_tenant';
}

export const ContractListScreen: React.FC<Props> = ({ navigation, filterRole, filterType }) => {
  const [selected, setSelected] = React.useState<ContractItem | null>(null);

  // Filter contracts based on role
  let contracts = MOCK_CONTRACTS;
  if (filterType) {
    contracts = contracts.filter(c => c.type === filterType);
  }

  const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

  if (selected) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.docHeader}>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <Text style={styles.backBtn}>← Quay lại</Text>
            </TouchableOpacity>
          </View>

          {/* Document */}
          <View style={styles.document}>
            {/* Document Title */}
            <View style={styles.docTitleSection}>
              <Text style={styles.docLogo}>🏠 ROOMRENT</Text>
              <View style={styles.docDivider} />
              <Text style={styles.docTitle}>
                {selected.type === 'admin_manager' ? 'HỢP ĐỒNG THUÊ NHÀ' : 'HỢP ĐỒNG THUÊ PHÒNG'}
              </Text>
              <Text style={styles.docCode}>Mã HĐ: {selected.code}</Text>
            </View>

            {/* Status Badge */}
            <View style={[styles.statusBadge, { backgroundColor: statusMap[selected.status].bg }]}>
              <View style={[styles.statusDot, { backgroundColor: statusMap[selected.status].color }]} />
              <Text style={[styles.statusText, { color: statusMap[selected.status].color }]}>
                {statusMap[selected.status].label}
              </Text>
            </View>

            {/* Điều 1: Bên cho thuê */}
            <View style={styles.clause}>
              <Text style={styles.clauseTitle}>Điều 1: Bên cho thuê (Bên A)</Text>
              <Text style={styles.clauseText}>Ông/Bà: <Text style={styles.bold}>{selected.lessorName}</Text></Text>
            </View>

            {/* Điều 2: Bên thuê */}
            <View style={styles.clause}>
              <Text style={styles.clauseTitle}>Điều 2: Bên thuê (Bên B)</Text>
              <Text style={styles.clauseText}>Ông/Bà: <Text style={styles.bold}>{selected.lesseeName}</Text></Text>
              {selected.lesseeCccd && <Text style={styles.clauseText}>CCCD: {selected.lesseeCccd}</Text>}
              {selected.lesseePhone && <Text style={styles.clauseText}>Số điện thoại: {selected.lesseePhone}</Text>}
            </View>

            {/* Điều 3: Tài sản cho thuê */}
            <View style={styles.clause}>
              <Text style={styles.clauseTitle}>Điều 3: Tài sản cho thuê</Text>
              <Text style={styles.clauseText}>{selected.propertyName}</Text>
              {selected.roomCode && <Text style={styles.clauseText}>Phòng: <Text style={styles.bold}>{selected.roomCode}</Text></Text>}
            </View>

            {/* Điều 4: Giá thuê */}
            <View style={styles.clause}>
              <Text style={styles.clauseTitle}>Điều 4: Giá thuê & Thanh toán</Text>
              <View style={styles.priceRow}>
                <View style={styles.priceBox}>
                  <Text style={styles.priceLabel}>Tiền thuê/tháng</Text>
                  <Text style={styles.priceValue}>{fmt(selected.rentAmount)}</Text>
                </View>
                <View style={styles.priceBox}>
                  <Text style={styles.priceLabel}>Tiền cọc</Text>
                  <Text style={styles.priceValue}>{fmt(selected.depositAmount)}</Text>
                </View>
              </View>
            </View>

            {/* Điều 5: Thời hạn */}
            <View style={styles.clause}>
              <Text style={styles.clauseTitle}>Điều 5: Thời hạn hợp đồng</Text>
              <Text style={styles.clauseText}>Từ ngày: <Text style={styles.bold}>{selected.startDate}</Text></Text>
              <Text style={styles.clauseText}>Đến ngày: <Text style={styles.bold}>{selected.endDate}</Text></Text>
            </View>

            {/* Điều 6: Tài sản bàn giao */}
            {selected.equipmentList.length > 0 && (
              <View style={styles.clause}>
                <Text style={styles.clauseTitle}>Điều 6: Tài sản bàn giao ({selected.equipmentList.length} món)</Text>
                <View style={styles.eqTable}>
                  {/* Table Header */}
                  <View style={styles.eqHeaderRow}>
                    <Text style={[styles.eqHeaderCell, { flex: 3 }]}>Tên tài sản</Text>
                    <Text style={[styles.eqHeaderCell, { flex: 1, textAlign: 'center' }]}>SL</Text>
                    <Text style={[styles.eqHeaderCell, { flex: 2 }]}>Tình trạng</Text>
                  </View>
                  {/* Table Rows */}
                  {selected.equipmentList.map((eq) => (
                    <View key={eq.id} style={styles.eqRow}>
                      <Text style={[styles.eqCell, { flex: 3, fontWeight: '600' }]}>{eq.name}</Text>
                      <Text style={[styles.eqCell, { flex: 1, textAlign: 'center' }]}>{eq.quantity}</Text>
                      <Text style={[styles.eqCell, { flex: 2, color: Colors.textSecondary }]}>{eq.condition}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Footer */}
            <View style={styles.docFooter}>
              <Text style={styles.docFooterText}>Xác nhận bằng mã OTP ✓</Text>
            </View>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Contract List View
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Hợp đồng</Text>
          <Text style={styles.listSubtitle}>{contracts.length} hợp đồng</Text>
        </View>

        {contracts.map(contract => (
          <TouchableOpacity key={contract.id} style={styles.contractCard} onPress={() => setSelected(contract)}>
            <View style={styles.contractCardHeader}>
              <View>
                <Text style={styles.contractCode}>{contract.code}</Text>
                <Text style={styles.contractType}>
                  {contract.type === 'admin_manager' ? '📋 HĐ Thuê Nhà' : '📝 HĐ Thuê Phòng'}
                </Text>
              </View>
              <View style={[styles.statusBadgeSmall, { backgroundColor: statusMap[contract.status].bg }]}>
                <Text style={[styles.statusTextSmall, { color: statusMap[contract.status].color }]}>
                  {statusMap[contract.status].label}
                </Text>
              </View>
            </View>

            <View style={styles.contractCardBody}>
              <View style={styles.contractInfoRow}>
                <Text style={styles.contractLabel}>Bên thuê:</Text>
                <Text style={styles.contractValue}>{contract.lesseeName}</Text>
              </View>
              <View style={styles.contractInfoRow}>
                <Text style={styles.contractLabel}>{contract.roomCode ? 'Nhà / Phòng:' : 'Nhà:'}</Text>
                <Text style={styles.contractValue}>{contract.propertyName}{contract.roomCode ? ` - ${contract.roomCode}` : ''}</Text>
              </View>
              <View style={styles.contractInfoRow}>
                <Text style={styles.contractLabel}>Tiền thuê:</Text>
                <Text style={[styles.contractValue, { color: Colors.primary, fontWeight: '700' }]}>{fmt(contract.rentAmount)}/tháng</Text>
              </View>
              <View style={styles.contractInfoRow}>
                <Text style={styles.contractLabel}>Tài sản BG:</Text>
                <Text style={styles.contractValue}>{contract.equipmentList.length} món</Text>
              </View>
            </View>

            <View style={styles.contractCardFooter}>
              <Text style={styles.contractDate}>{contract.startDate} → {contract.endDate}</Text>
              <Text style={styles.viewDetail}>Xem chi tiết →</Text>
            </View>
          </TouchableOpacity>
        ))}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  
  // List styles
  listHeader: { padding: Spacing.lg, paddingTop: Spacing.xl },
  listTitle: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  listSubtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },

  contractCard: { marginHorizontal: Spacing.lg, marginBottom: Spacing.md, backgroundColor: Colors.white, borderRadius: BorderRadius.lg, ...Shadow.sm, overflow: 'hidden' },
  contractCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: Spacing.base, borderBottomWidth: 1, borderColor: Colors.divider },
  contractCode: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  contractType: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  statusBadgeSmall: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: BorderRadius.full },
  statusTextSmall: { fontSize: 11, fontWeight: '600' },

  contractCardBody: { padding: Spacing.base },
  contractInfoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  contractLabel: { fontSize: 13, color: Colors.textSecondary },
  contractValue: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary },

  contractCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm, backgroundColor: '#F8FAFC', borderTopWidth: 1, borderColor: Colors.divider },
  contractDate: { fontSize: 12, color: Colors.textSecondary },
  viewDetail: { fontSize: 12, fontWeight: '600', color: Colors.primary },

  // Document styles
  docHeader: { padding: Spacing.lg },
  backBtn: { color: Colors.primary, fontWeight: '600', fontSize: 16 },

  document: { marginHorizontal: Spacing.lg, backgroundColor: Colors.white, borderRadius: BorderRadius.xl, ...Shadow.md, overflow: 'hidden' },
  docTitleSection: { alignItems: 'center', paddingVertical: Spacing.xl, paddingHorizontal: Spacing.lg, backgroundColor: '#F8FAFC' },
  docLogo: { fontSize: 20, fontWeight: '800', color: Colors.primary },
  docDivider: { width: 60, height: 3, backgroundColor: Colors.primary, marginVertical: Spacing.md, borderRadius: 2 },
  docTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary, textAlign: 'center' },
  docCode: { fontSize: 13, color: Colors.textSecondary, marginTop: Spacing.xs },

  statusBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, marginTop: Spacing.lg, gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '700' },

  clause: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.base, borderTopWidth: 1, borderColor: '#F1F5F9' },
  clauseTitle: { fontSize: 14, fontWeight: '700', color: Colors.primary, marginBottom: Spacing.sm },
  clauseText: { fontSize: 14, color: Colors.textPrimary, lineHeight: 22, marginBottom: 2 },
  bold: { fontWeight: '700' },

  priceRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  priceBox: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: 'center' },
  priceLabel: { fontSize: 11, color: Colors.textSecondary },
  priceValue: { fontSize: 16, fontWeight: '800', color: Colors.primary, marginTop: 4 },

  eqTable: { marginTop: Spacing.sm, borderWidth: 1, borderColor: Colors.divider, borderRadius: BorderRadius.md, overflow: 'hidden' },
  eqHeaderRow: { flexDirection: 'row', backgroundColor: '#F8FAFC', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md },
  eqHeaderCell: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase' },
  eqRow: { flexDirection: 'row', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderTopWidth: 1, borderColor: Colors.divider },
  eqCell: { fontSize: 13, color: Colors.textPrimary },

  docFooter: { padding: Spacing.lg, alignItems: 'center', borderTopWidth: 1, borderColor: '#F1F5F9', marginTop: Spacing.sm },
  docFooterText: { fontSize: 13, color: Colors.textSecondary },
});
