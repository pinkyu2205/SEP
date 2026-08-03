import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
} from 'react-native';
import { showAlert } from '@/utils';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '@/constants';
import {
  getPropertyById, getBuildingOps, BuildingContract, ContractStatus,
} from '@/data/managedProperties';
import {
  getInspectionsByContractId,
  getInspectionStatusLabel,
  getInspectionTypeLabel,
  RoomInspection,
} from '@/data/roomInspections';

type FilterId = 'all' | 'draft' | 'pending' | 'approved' | 'active' | 'expiring_soon' | 'rejected';
type NormalStatus = Exclude<FilterId, 'all'>;

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'draft', label: 'Nháp' },
  { id: 'pending', label: 'Chờ duyệt' },
  { id: 'approved', label: 'Đã duyệt' },
  { id: 'active', label: 'Hiệu lực' },
  { id: 'expiring_soon', label: 'Sắp hết hạn' },
  { id: 'rejected', label: 'Từ chối' },
];

const STATUS_META: Record<NormalStatus, { label: string; color: string; bg: string }> = {
  draft: { label: 'Nháp', color: Colors.textSecondary, bg: Colors.divider },
  pending: { label: 'Chờ duyệt', color: '#7C3AED', bg: '#F5F3FF' },
  approved: { label: 'Đã duyệt', color: Colors.info, bg: Colors.infoLight },
  active: { label: 'Hiệu lực', color: Colors.success, bg: Colors.successLight },
  expiring_soon: { label: 'Sắp hết hạn', color: Colors.warning, bg: Colors.warningLight },
  rejected: { label: 'Từ chối', color: Colors.error, bg: Colors.errorLight },
};

const fmt = (n: number) => `${n.toLocaleString('vi-VN')}đ`;

const normalizeStatus = (status: ContractStatus): NormalStatus => {
  if (status === 'pending_approval') return 'pending';
  if (status === 'expiring') return 'expiring_soon';
  return status as NormalStatus;
};

const contractCode = (contract: BuildingContract) =>
  contract.code || `HD-${contract.room}-${contract.startDate.slice(0, 4)}`;

export const BuildingContractScreen: React.FC<any> = ({ navigation, route }) => {
  const propertyId: string = route?.params?.propertyId;
  const prop = getPropertyById(propertyId);
  const [contracts, setContracts] = useState<BuildingContract[]>(() => getBuildingOps(propertyId).contracts);
  const [filter, setFilter] = useState<FilterId>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<BuildingContract | null>(null);

  const summary = useMemo(() => ({
    total: contracts.length,
    active: contracts.filter(c => normalizeStatus(c.status) === 'active').length,
    pending: contracts.filter(c => normalizeStatus(c.status) === 'pending').length,
    expiring: contracts.filter(c => normalizeStatus(c.status) === 'expiring_soon').length,
  }), [contracts]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contracts.filter(c => {
      const status = normalizeStatus(c.status);
      return (filter === 'all' || status === filter)
        && (!q || c.tenant.toLowerCase().includes(q) || c.room.toLowerCase().includes(q) || contractCode(c).toLowerCase().includes(q));
    });
  }, [contracts, filter, search]);

  const updateStatus = (contract: BuildingContract, status: ContractStatus) => {
    setContracts(prev => prev.map(item => item.id === contract.id ? { ...item, status } : item));
    setSelected(prev => prev?.id === contract.id ? { ...prev, status } : prev);
  };

  const renew = (contract: BuildingContract) => {
    showAlert('Gia hạn hợp đồng', `Gia hạn ${contractCode(contract)} thêm 12 tháng?`, [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Gia hạn',
        onPress: () => setContracts(prev => prev.map(item => {
          if (item.id !== contract.id) return item;
          const end = new Date(item.endDate);
          end.setFullYear(end.getFullYear() + 1);
          return { ...item, status: 'active', endDate: end.toISOString().slice(0, 10) };
        })),
      },
    ]);
  };

  const handleAction = (action: string, contract: BuildingContract) => {
    if (action === 'submit') updateStatus(contract, 'pending_approval');
    if (action === 'activate') updateStatus(contract, 'active');
    if (action === 'renew') renew(contract);
    if (action === 'edit') showAlert('Chỉnh sửa hợp đồng', `Mở form chỉnh sửa cho ${contractCode(contract)}.`);
  };

  const ContractActions = ({ contract }: { contract: BuildingContract }) => {
    const status = normalizeStatus(contract.status);
    if (status === 'draft') {
      return (
        <>
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleAction('edit', contract)}>
            <Text style={styles.actionText}>Sửa</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionPrimary]} onPress={() => handleAction('submit', contract)}>
            <Text style={styles.actionPrimaryText}>Gửi duyệt</Text>
          </TouchableOpacity>
        </>
      );
    }
    if (status === 'approved') {
      return (
        <TouchableOpacity style={[styles.actionBtn, styles.actionSuccess]} onPress={() => handleAction('activate', contract)}>
          <Text style={styles.actionSuccessText}>Kích hoạt</Text>
        </TouchableOpacity>
      );
    }
    if (status === 'active' || status === 'expiring_soon') {
      return (
        <TouchableOpacity style={[styles.actionBtn, styles.actionPrimary]} onPress={() => handleAction('renew', contract)}>
          <Text style={styles.actionPrimaryText}>Gia hạn</Text>
        </TouchableOpacity>
      );
    }
    if (status === 'rejected') {
      return (
        <TouchableOpacity style={[styles.actionBtn, styles.actionPrimary]} onPress={() => handleAction('edit', contract)}>
          <Text style={styles.actionPrimaryText}>Sửa & gửi lại</Text>
        </TouchableOpacity>
      );
    }
    return (
      <TouchableOpacity style={styles.actionBtn} onPress={() => setSelected(contract)}>
        <Text style={styles.actionText}>Xem chi tiết</Text>
      </TouchableOpacity>
    );
  };

  if (selected) {
    const status = normalizeStatus(selected.status);
    const meta = STATUS_META[status];
    const ops = getBuildingOps(propertyId);
    const room = ops.rooms.find(item => item.code === selected.room);
    const tenant = ops.tenants.find(item => item.room === selected.room);
    const utility = ops.utility.find(item => item.room === selected.room);
    const latestInvoice = ops.invoices.find(item => item.room === selected.room);
    const inspections = getInspectionsByContractId(selected.id);
    const submittedDate = ['pending', 'approved', 'active', 'expiring_soon'].includes(status) ? selected.startDate : 'Chưa gửi';
    const approvedDate = ['approved', 'active', 'expiring_soon'].includes(status) ? selected.startDate : 'Chưa duyệt';

    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setSelected(null)}>
            <Text style={styles.backText}>← Quay lại</Text>
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.title}>{contractCode(selected)}</Text>
            <Text style={styles.subtitle}>{prop?.name || 'Tòa nhà'}</Text>
          </View>
          <View style={{ width: 72 }} />
        </View>

        <ScrollView contentContainerStyle={styles.detailScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.detailHero}>
            <View style={{ flex: 1 }}>
              <Text style={styles.detailHeroLabel}>Mã hợp đồng</Text>
              <Text style={styles.detailHeroCode}>{contractCode(selected)}</Text>
              <Text style={styles.detailHeroSub}>{selected.tenant} · Phòng {selected.room}</Text>
            </View>
            <View style={[styles.detailStatus, { backgroundColor: meta.bg }]}>
              <Text style={[styles.detailStatusText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          </View>

          <DetailSection title="Tổng quan hợp đồng">
            <InfoRow label="Mã hợp đồng" value={contractCode(selected)} />
            <InfoRow label="Loại hợp đồng" value={selected.type === 'building_rental' ? 'Thuê nhà' : 'Thuê phòng'} />
            <InfoRow label="Trạng thái" value={meta.label} highlight />
            <InfoRow label="Ngày tạo" value={selected.startDate} />
            <InfoRow label="Ngày gửi duyệt" value={submittedDate} />
            <InfoRow label="Ngày duyệt" value={approvedDate} />
            <InfoRow label="Thời hạn" value={`${selected.startDate} → ${selected.endDate}`} />
          </DetailSection>

          <DetailSection title="Bên thuê">
            <InfoRow label="Họ tên" value={selected.tenant} />
            <InfoRow label="Số điện thoại" value={tenant?.phone || 'Chưa cập nhật'} />
            <InfoRow label="Ngày vào ở" value={tenant?.moveInDate || selected.startDate} />
            <InfoRow
              label="Rủi ro thanh toán"
              value={tenant?.paymentRisk === 'high' ? 'Cao' : tenant?.paymentRisk === 'medium' ? 'Trung bình' : 'Thấp'}
            />
          </DetailSection>

          <DetailSection title="Tài sản thuê">
            <InfoRow label="Tòa nhà" value={prop?.name || 'Chưa xác định'} />
            <InfoRow label="Địa chỉ" value={prop?.address || 'Chưa cập nhật'} />
            <InfoRow label="Phòng" value={selected.room} />
            <InfoRow label="Tầng" value={room ? `Tầng ${room.floor}` : 'Chưa cập nhật'} />
            <InfoRow label="Diện tích" value={room ? `${room.area} m²` : 'Chưa cập nhật'} />
            <InfoRow label="Trạng thái phòng" value={room?.status === 'occupied' ? 'Đang thuê' : room?.status === 'maintenance' ? 'Bảo trì' : 'Trống'} />
          </DetailSection>

          <Text style={styles.detailSectionTitle}>Tài chính</Text>
          <View style={styles.priceGrid}>
            <View style={styles.priceBox}>
              <Text style={styles.priceLabel}>Tiền thuê/tháng</Text>
              <Text style={styles.priceValue}>{fmt(selected.monthlyRent)}</Text>
            </View>
            <View style={styles.priceBox}>
              <Text style={styles.priceLabel}>Tiền cọc</Text>
              <Text style={[styles.priceValue, { color: Colors.warning }]}>{fmt(selected.depositAmount ?? selected.monthlyRent * 2)}</Text>
            </View>
          </View>
          <DetailSection>
            <InfoRow label="Hóa đơn gần nhất" value={latestInvoice ? `${latestInvoice.period} · ${fmt(latestInvoice.amount)}` : 'Chưa có'} />
            <InfoRow
              label="Trạng thái hóa đơn"
              value={latestInvoice?.status === 'paid' ? 'Đã thanh toán' : latestInvoice?.status === 'overdue' ? 'Quá hạn' : latestInvoice ? 'Chưa thanh toán' : 'Chưa có'}
            />
            <InfoRow label="Phí dịch vụ" value={prop ? `${fmt(prop.serviceCharge)}/tháng` : 'Chưa cập nhật'} />
          </DetailSection>

          <DetailSection title="Chỉ số & bàn giao">
            <InfoRow label="Điện đầu kỳ" value={utility ? `${utility.elecPrev} kWh` : 'Chưa cập nhật'} />
            <InfoRow label="Nước đầu kỳ" value={utility ? `${utility.waterPrev} m³` : 'Chưa cập nhật'} />
            <InfoRow label="Ngày chốt gần nhất" value={utility?.lastReadingDate || 'Chưa cập nhật'} />
            <InfoRow label="Ảnh hiện trạng" value={status === 'draft' || status === 'rejected' ? 'Cần bổ sung' : 'Đã lưu'} />
            <InfoRow label="Biên bản bàn giao" value={status === 'active' ? 'Đã xác nhận' : 'Chờ xác nhận'} />
          </DetailSection>

          <Text style={styles.detailSectionTitle}>Biên bản hiện trạng</Text>
          {inspections.length === 0 ? (
            <View style={styles.emptyInspectionBox}>
              <Text style={styles.emptyInspectionTitle}>Chưa có biên bản hiện trạng.</Text>
              <Text style={styles.emptyInspectionText}>Ảnh hiện trạng được quản lý theo hợp đồng, không lưu trực tiếp trong phòng.</Text>
            </View>
          ) : (
            <View style={styles.inspectionList}>
              {inspections.map(inspection => (
                <InspectionCard
                  key={inspection.id}
                  inspection={inspection}
                  onPress={() => navigation.navigate('InspectionDetail', { inspectionId: inspection.id })}
                />
              ))}
            </View>
          )}

          <Text style={styles.detailSectionTitle}>Điều khoản chính</Text>
          <View style={styles.termsCard}>
            <Text style={styles.termText}>• Thanh toán tiền thuê trước ngày 05 hằng tháng.</Text>
            <Text style={styles.termText}>• Tiền cọc được hoàn trả khi kết thúc hợp đồng nếu không phát sinh hư hỏng hoặc công nợ.</Text>
            <Text style={styles.termText}>• Khách thuê cần báo trước 30 ngày khi chấm dứt hợp đồng.</Text>
            <Text style={styles.termText}>• Không tự ý chuyển nhượng hoặc cho thuê lại phòng khi chưa được quản lý xác nhận.</Text>
          </View>

          {status === 'rejected' && selected.rejectionReason && (
            <>
              <Text style={styles.detailSectionTitle}>Lý do từ chối</Text>
              <View style={styles.rejectBox}>
                <Text style={styles.rejectTitle}>Cần chỉnh sửa trước khi gửi lại</Text>
                <Text style={styles.rejectText}>{selected.rejectionReason}</Text>
              </View>
            </>
          )}

          <Text style={styles.detailSectionTitle}>Lịch sử xử lý</Text>
          <View style={styles.timelineCard}>
            <TimelineRow title="Tạo hợp đồng" meta={`Quản lý · ${selected.startDate}`} done />
            {['pending', 'approved', 'active', 'expiring_soon'].includes(status) && (
              <TimelineRow title="Gửi duyệt" meta={`Quản lý · ${submittedDate}`} done />
            )}
            {['approved', 'active', 'expiring_soon'].includes(status) && (
              <TimelineRow title="Đã duyệt" meta={`Host/Admin · ${approvedDate}`} done />
            )}
            {['active', 'expiring_soon'].includes(status) && (
              <TimelineRow title="Kích hoạt hợp đồng" meta={`OTP xác nhận · ${selected.startDate}`} done />
            )}
          </View>

          <View style={styles.detailActions}>
            <ContractActions contract={selected} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Quay lại</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.title}>Hợp đồng</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{prop?.name || ''}</Text>
        </View>
        <View style={{ width: 72 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryRow}>
          <MiniStat label="Tổng" value={summary.total} color={Colors.primary} />
          <MiniStat label="Hiệu lực" value={summary.active} color={Colors.success} />
          <MiniStat label="Chờ duyệt" value={summary.pending} color={Colors.info} />
          <MiniStat label="Sắp hết hạn" value={summary.expiring} color={Colors.warning} />
        </View>

        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm khách thuê, phòng, mã hợp đồng"
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Text style={styles.clearText}>×</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
          {FILTERS.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[styles.chip, filter === item.id && styles.chipActive]}
              onPress={() => setFilter(item.id)}
            >
              <Text style={[styles.chipText, filter === item.id && styles.chipTextActive]} numberOfLines={1}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.resultHeader}>
          <Text style={styles.sectionTitle}>Danh sách hợp đồng</Text>
          <Text style={styles.resultCount}>{list.length}/{contracts.length}</Text>
        </View>

        {list.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>Không có hợp đồng phù hợp</Text>
          </View>
        ) : list.map(contract => {
          const status = normalizeStatus(contract.status);
          const meta = STATUS_META[status];
          return (
            <TouchableOpacity key={contract.id} style={styles.card} activeOpacity={0.75} onPress={() => setSelected(contract)}>
              <View style={styles.cardTop}>
                <View style={styles.cardTitleArea}>
                  <View style={styles.codeRow}>
                    <Text style={styles.cardCode} numberOfLines={1}>{contractCode(contract)}</Text>
                    <Text style={styles.typeText}>Thuê phòng</Text>
                  </View>
                  <Text style={styles.cardSub} numberOfLines={1}>{contract.tenant} · Phòng {contract.room}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.badgeText, { color: meta.color }]} numberOfLines={1}>{meta.label}</Text>
                </View>
              </View>

              <View style={styles.moneyRow}>
                <InfoPill label="Thuê" value={`${fmt(contract.monthlyRent)}/tháng`} />
                <InfoPill label="Cọc" value={fmt(contract.depositAmount ?? contract.monthlyRent * 2)} />
                <InfoPill label="Thời hạn" value={`${contract.startDate} → ${contract.endDate}`} wide />
              </View>

              {status === 'rejected' && contract.rejectionReason && (
                <Text style={styles.inlineWarning} numberOfLines={1}>{contract.rejectionReason}</Text>
              )}

              <View style={styles.actionRow}>
                <ContractActions contract={contract} />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
};

const DetailSection = ({ title, children }: { title?: string; children: React.ReactNode }) => (
  <>
    {title && <Text style={styles.detailSectionTitle}>{title}</Text>}
    <View style={styles.detailCard}>{children}</View>
  </>
);

const MiniStat = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <View style={styles.miniStat}>
    <Text style={[styles.miniStatValue, { color }]}>{value}</Text>
    <Text style={styles.miniStatLabel}>{label}</Text>
  </View>
);

const InfoPill = ({ label, value, wide }: { label: string; value: string; wide?: boolean }) => (
  <View style={[styles.infoPill, wide && styles.infoPillWide]}>
    <Text style={styles.infoPillLabel}>{label}</Text>
    <Text style={styles.infoPillValue} numberOfLines={1}>{value}</Text>
  </View>
);

const InfoRow = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={[styles.infoValue, highlight && { color: Colors.primary }]}>{value}</Text>
  </View>
);

const TimelineRow = ({ title, meta, done }: { title: string; meta: string; done?: boolean }) => (
  <View style={styles.timelineRow}>
    <View style={[styles.timelineDot, done && styles.timelineDotDone]} />
    <View style={{ flex: 1 }}>
      <Text style={styles.timelineTitle}>{title}</Text>
      <Text style={styles.timelineMeta}>{meta}</Text>
    </View>
  </View>
);

const InspectionCard = ({ inspection, onPress }: { inspection: RoomInspection; onPress: () => void }) => (
  <TouchableOpacity style={styles.inspectionCard} onPress={onPress} activeOpacity={0.8}>
    <View style={styles.inspectionIcon}>
      <Text style={styles.inspectionIconText}>📸</Text>
    </View>
    <View style={styles.inspectionBody}>
      <View style={styles.inspectionTop}>
        <Text style={styles.inspectionTitle}>{getInspectionTypeLabel(inspection.inspectionType)} Inspection</Text>
        <Text style={styles.inspectionStatus}>{getInspectionStatusLabel(inspection.status)}</Text>
      </View>
      <Text style={styles.inspectionMeta}>
        {inspection.images.length} photos · {inspection.createdAt} · Created by {inspection.createdBy}
      </Text>
      <Text style={styles.inspectionNote} numberOfLines={2}>
        {inspection.depositDeductionAmount
          ? `Deposit deduction: ${inspection.depositDeductionAmount.toLocaleString('vi-VN')}đ`
          : inspection.notes || 'Chưa có ghi chú hiện trạng.'}
      </Text>
    </View>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.md,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backText: { color: Colors.primary, fontWeight: '700', fontSize: 13, width: 72 },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },

  scroll: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.lg },
  summaryRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  miniStat: {
    flex: 1, backgroundColor: Colors.white, borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  miniStatValue: { fontSize: 18, fontWeight: '900' },
  miniStatLabel: { fontSize: 10, color: Colors.textSecondary, marginTop: 1, fontWeight: '600' },
  searchBar: {
    height: 42, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.white, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  searchIcon: { fontSize: 17, color: Colors.textMuted },
  searchInput: { flex: 1, fontSize: 13, color: Colors.textPrimary, paddingVertical: 0 },
  clearText: { fontSize: 18, color: Colors.textMuted, paddingHorizontal: 2 },
  filterRow: { flexGrow: 0, marginBottom: Spacing.md },
  filterContent: { gap: Spacing.sm, paddingRight: Spacing.base },
  chip: {
    height: 32, justifyContent: 'center', paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border, minWidth: 58,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },
  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.textPrimary },
  resultCount: { fontSize: 12, color: Colors.textMuted, fontWeight: '700' },
  emptyBox: { backgroundColor: Colors.white, borderRadius: BorderRadius.md, padding: Spacing.lg, alignItems: 'center' },
  emptyText: { fontSize: 13, color: Colors.textMuted },
  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  cardTitleArea: { flex: 1 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardCode: { fontSize: 13, fontWeight: '900', color: Colors.primary, flexShrink: 1 },
  typeText: {
    fontSize: 10, fontWeight: '800', color: Colors.textSecondary,
    backgroundColor: Colors.divider, paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  cardSub: { fontSize: 12, color: Colors.textPrimary, marginTop: 4, fontWeight: '700' },
  badge: { maxWidth: 94, paddingHorizontal: 8, paddingVertical: 4, borderRadius: BorderRadius.full, alignItems: 'center' },
  badgeText: { fontSize: 10, fontWeight: '900' },
  moneyRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  infoPill: { flex: 1, backgroundColor: Colors.background, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm, paddingVertical: 7 },
  infoPillWide: { flex: 1.5 },
  infoPillLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '700' },
  infoPillValue: { fontSize: 11, color: Colors.textPrimary, fontWeight: '800', marginTop: 2 },
  inlineWarning: {
    marginTop: Spacing.sm, fontSize: 11, color: Colors.error, fontWeight: '700',
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm, paddingVertical: 5,
  },
  actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm, justifyContent: 'flex-end', flexWrap: 'wrap' },
  actionBtn: {
    height: 30, justifyContent: 'center', paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  actionPrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  actionSuccess: { backgroundColor: Colors.success, borderColor: Colors.success },
  actionText: { fontSize: 11, fontWeight: '800', color: Colors.textSecondary },
  actionPrimaryText: { fontSize: 11, fontWeight: '800', color: Colors.white },
  actionSuccessText: { fontSize: 11, fontWeight: '800', color: Colors.white },

  detailScroll: { padding: Spacing.base, paddingBottom: Spacing['3xl'] },
  detailHero: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  detailHeroLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '800', textTransform: 'uppercase' },
  detailHeroCode: { fontSize: 17, color: Colors.textPrimary, fontWeight: '900', marginTop: 2 },
  detailHeroSub: { fontSize: 12, color: Colors.textSecondary, fontWeight: '700', marginTop: 2 },
  detailSectionTitle: { fontSize: 13, color: Colors.textPrimary, fontWeight: '900', marginTop: Spacing.md, marginBottom: Spacing.sm },
  detailStatus: { alignSelf: 'flex-start', borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md, paddingVertical: 6 },
  detailStatusText: { fontSize: 12, fontWeight: '900' },
  detailCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  infoLabel: { fontSize: 12, color: Colors.textSecondary, flex: 0.8 },
  infoValue: { fontSize: 13, color: Colors.textPrimary, fontWeight: '800', flex: 1.2, textAlign: 'right' },
  priceGrid: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.sm },
  priceBox: {
    flex: 1, backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  priceLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '700' },
  priceValue: { fontSize: 17, color: Colors.primary, fontWeight: '900', marginTop: 4 },
  termsCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
    gap: 7,
  },
  termText: { fontSize: 12, color: Colors.textPrimary, lineHeight: 18, fontWeight: '600' },
  inspectionList: { gap: Spacing.sm },
  inspectionCard: {
    flexDirection: 'row', gap: Spacing.md, backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  inspectionIcon: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  inspectionIconText: { fontSize: 20 },
  inspectionBody: { flex: 1 },
  inspectionTop: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm },
  inspectionTitle: { flex: 1, fontSize: 13, color: Colors.textPrimary, fontWeight: '900' },
  inspectionStatus: { fontSize: 10, color: Colors.primary, fontWeight: '900' },
  inspectionMeta: { fontSize: 11, color: Colors.textMuted, fontWeight: '700', marginTop: 4 },
  inspectionNote: { fontSize: 12, color: Colors.textSecondary, lineHeight: 17, marginTop: 5 },
  emptyInspectionBox: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  emptyInspectionTitle: { fontSize: 13, color: Colors.textPrimary, fontWeight: '900' },
  emptyInspectionText: { fontSize: 12, color: Colors.textMuted, marginTop: 4, lineHeight: 18 },
  rejectBox: { padding: Spacing.md, borderRadius: BorderRadius.md, backgroundColor: Colors.errorLight },
  rejectTitle: { fontSize: 12, color: Colors.error, fontWeight: '900', marginBottom: 3 },
  rejectText: { fontSize: 12, color: Colors.error, lineHeight: 18 },
  timelineCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  timelineRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm,
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.border, marginTop: 4 },
  timelineDotDone: { backgroundColor: Colors.success },
  timelineTitle: { fontSize: 12, color: Colors.textPrimary, fontWeight: '900' },
  timelineMeta: { fontSize: 11, color: Colors.textMuted, marginTop: 2, fontWeight: '600' },
  detailActions: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'flex-end', marginTop: Spacing.md, flexWrap: 'wrap' },
});
