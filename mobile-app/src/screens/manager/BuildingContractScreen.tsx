import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, RefreshControl, Linking, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Sharing from 'expo-sharing';
import { Colors, Spacing, BorderRadius, Shadow, RENT_AMOUNT_HIDDEN_NOTE } from '@/constants';
import {
  showAlert, readApiError, formatDate,
  CONTRACT_STATUS_META, mapContractStatus, daysUntil, isLivingStatus, isEndedStatus,
  isClosedContract, type ContractUiStatus,
} from '@/utils';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';
import { managerPropertyService } from '@/services/manager/propertyService';

/**
 * Hợp đồng khách thuê của MỘT bất động sản (quản lý bấm vào từ màn Hợp đồng).
 *
 * Dữ liệu THẬT: GET /api/v1/properties/{id}/tenant-contracts (realTenantService.
 * listByProperty) + thông tin nhà từ danh sách bất động sản manager phụ trách.
 * Trước đây màn này đọc mock `data/managedProperties` nên propertyId thật không
 * khớp gì cả → luôn hiện 0/0 "Không có hợp đồng phù hợp".
 *
 * Chỉ XEM, không sửa: hợp đồng sinh ra từ luồng đón khách (ResumeContractScreen),
 * kết thúc bằng luồng trả phòng — nên ở đây không có nút tạo/duyệt/gia hạn giả.
 */

type FilterId = 'all' | 'living' | 'expiring_soon' | 'waiting';

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'living', label: 'Đang thuê' },
  { id: 'expiring_soon', label: 'Sắp hết hạn' },
  { id: 'waiting', label: 'Chờ nhận phòng' },
];

const matchFilter = (status: ContractUiStatus, filter: FilterId): boolean => {
  if (filter === 'all') return true;
  if (filter === 'living') return isLivingStatus(status);
  if (filter === 'waiting') return status === 'waiting_deposit' || status === 'pending_approval' || status === 'rejected';
  return status === filter;
};

/** Thứ tự ưu tiên: việc cần làm trước, hết hạn chưa xử lý xuống cuối. */
const SORT_WEIGHT: Record<ContractUiStatus, number> = {
  rejected: 0, expiring_soon: 1, pending_approval: 2, waiting_deposit: 3,
  active: 4, expired: 5, terminated: 6,
};

const money = (n?: number) => `${(n || 0).toLocaleString('vi-VN')}đ`;
const roomLabel = (c: TenantContractResponse) => (c.roomNumber ? `Phòng ${c.roomNumber}` : 'Nhà nguyên căn');

/** "còn 12 ngày" / "quá hạn 3 ngày" — nói bằng lời cho dễ hiểu. */
const remainText = (endDate?: string): string | null => {
  const d = daysUntil(endDate);
  if (d == null) return null;
  if (d < 0) return `Quá hạn ${Math.abs(d)} ngày`;
  if (d === 0) return 'Hết hạn hôm nay';
  return `Còn ${d} ngày`;
};

export const BuildingContractScreen: React.FC<any> = ({ navigation, route }) => {
  const propertyId: string = String(route?.params?.propertyId ?? '');
  const paramName: string | undefined = route?.params?.propertyName;

  const [propName, setPropName] = useState(paramName ?? '');
  const [propAddress, setPropAddress] = useState('');
  const [contracts, setContracts] = useState<TenantContractResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<TenantContractResponse | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await realTenantService.listByProperty(Number(propertyId));
      // Khách đã trả phòng xong (HĐ đã thanh lý) thì bỏ hẳn khỏi màn vận hành —
      // ở đây chỉ quan tâm ai đang thuê. Lịch sử tra ở màn Hoá đơn & Thanh toán.
      setContracts(list.filter(c => !isClosedContract(c.status)));
      // Tên/địa chỉ nhà: ưu tiên tham số truyền sang, thiếu thì tra trong danh sách nhà.
      const fromContract = list.find(c => c.propertyName)?.propertyName;
      if (fromContract) setPropName(prev => prev || fromContract);
      managerPropertyService.getScopedProperties()
        .then(props => {
          const p = props.find(item => String(item.id) === propertyId);
          if (p) {
            setPropName(p.propertyName);
            setPropAddress(p.fullAddress || p.shortAddress || '');
          }
        })
        .catch(() => { /* chỉ là thông tin phụ, thiếu cũng không sao */ });
    } catch (err: any) {
      // Trước đây lỗi bị nuốt im lặng → nhìn y hệt "nhà này không có hợp đồng".
      setError(readApiError(err, 'Không tải được danh sách hợp đồng của nhà này.'));
      setContracts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [propertyId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const rows = useMemo(
    () => contracts.map(c => ({ contract: c, status: mapContractStatus(c) })),
    [contracts],
  );

  const stats = useMemo(() => ({
    total: rows.length,
    living: rows.filter(r => isLivingStatus(r.status)).length,
    expiring: rows.filter(r => r.status === 'expiring_soon').length,
    waiting: rows.filter(r => matchFilter(r.status, 'waiting')).length,
    overdue: rows.filter(r => r.status === 'expired').length,
  }), [rows]);

  const counts: Record<FilterId, number> = {
    all: stats.total, living: stats.living,
    expiring_soon: stats.expiring, waiting: stats.waiting,
  };

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(({ contract: c, status }) =>
        matchFilter(status, filter)
        && (!q
          || c.tenantFullName?.toLowerCase().includes(q)
          || c.tenantPhone?.includes(q)
          || c.roomNumber?.toLowerCase().includes(q)
          || c.contractCode?.toLowerCase().includes(q)))
      .sort((a, b) => SORT_WEIGHT[a.status] - SORT_WEIGHT[b.status]
        || (a.contract.roomNumber ?? '').localeCompare(b.contract.roomNumber ?? ''));
  }, [rows, filter, search]);

  const callTenant = (phone?: string) => {
    if (!phone) return showAlert('Thiếu số điện thoại', 'Hợp đồng này chưa có số điện thoại khách thuê.');
    // KHÔNG in số ra alert khi gọi hỏng — số điện thoại đã ẩn với manager thì đường
    // thoát lỗi cũng không được để lộ, nếu không việc ẩn ở màn chi tiết thành vô nghĩa.
    Linking.openURL(`tel:${phone}`).catch(() =>
      showAlert('Không gọi được', 'Không mở được ứng dụng gọi trên máy này.'));
  };

  const viewDocument = async (c: TenantContractResponse) => {
    setDownloading(true);
    try {
      const { uri, mimeType } = await realTenantService.downloadContractDocument(c.id, c.contractCode);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType,
          UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : 'org.openxmlformats.wordprocessingml.document',
          dialogTitle: 'Xem hợp đồng thuê',
        });
      } else {
        showAlert('Không mở được', 'Thiết bị không hỗ trợ mở file hợp đồng.');
      }
    } catch (err: any) {
      showAlert('Lỗi', readApiError(err, 'Không mở được file hợp đồng.'));
    } finally {
      setDownloading(false);
    }
  };

  // ===================== CHI TIẾT 1 HỢP ĐỒNG =====================
  if (selected) {
    const status = mapContractStatus(selected);
    const meta = CONTRACT_STATUS_META[status];
    const remain = remainText(selected.endDate);
    const photos = selected.roomConditionPhotos?.map(p => p.url) ?? selected.roomConditionUrls ?? [];
    const equipment = selected.equipmentList ?? [];

    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setSelected(null)}>
            <Text style={styles.backArrow}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>{roomLabel(selected)}</Text>
            <Text style={styles.headerSub} numberOfLines={1}>{selected.contractCode}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.detailBody} showsVerticalScrollIndicator={false}>
          {/* Trạng thái + khách thuê */}
          <View style={[styles.heroCard, { borderLeftColor: meta.color }]}>
            <View style={styles.heroTop}>
              <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                <Text style={[styles.badgeText, { color: meta.color }]}>{meta.icon} {meta.label}</Text>
              </View>
              {!!remain && !isEndedStatus(status) && (
                <Text style={[styles.heroRemain, { color: meta.color }]}>{remain}</Text>
              )}
            </View>
            <Text style={styles.heroName}>{selected.tenantFullName}</Text>
            <Text style={styles.heroHint}>{meta.hint}</Text>
          </View>

          <View style={styles.quickRow}>
            <TouchableOpacity style={styles.quickBtn} onPress={() => callTenant(selected.tenantPhone)}>
              <Text style={styles.quickBtnText}>📞 Gọi khách</Text>
            </TouchableOpacity>
            {selected.contractFileAvailable && (
              <TouchableOpacity
                style={[styles.quickBtn, styles.quickBtnPrimary]}
                onPress={() => viewDocument(selected)}
                disabled={downloading}
              >
                {downloading
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Text style={[styles.quickBtnText, styles.quickBtnPrimaryText]}>📄 Xem hợp đồng</Text>}
              </TouchableOpacity>
            )}
          </View>

          {/* SĐT và CCCD ẨN với manager (13/08/2026) — thông tin định danh cá nhân của
              khách, manager không cần đọc để vận hành. Nút "Gọi khách" ở trên VẪN gọi
              được: nó mở app điện thoại với số lấy từ dữ liệu, không hiện số ra màn hình. */}
          <Section title="Khách thuê">
            <Row label="Họ tên" value={selected.tenantFullName} />
            <Row label="Số điện thoại" value="•••" />
            <Row label="CCCD/CMND" value="•••" />
          </Section>

          {/* Không hiện số tiền thuê/cọc — hệ thống thu thẳng của khách
              (xem @/constants/managerVisibility). Chỉ hiện ĐÃ/CHƯA thu. */}
          <Section title="Tiền thuê">
            <View style={styles.priceRow}>
              <View style={styles.priceBox}>
                <Text style={styles.priceLabel}>Thuê hằng tháng</Text>
                <Text style={[styles.priceValue, { fontSize: 14, color: Colors.textSecondary }]}>
                  Hệ thống thu
                </Text>
              </View>
              <View style={styles.priceBox}>
                <Text style={styles.priceLabel}>Tiền cọc</Text>
                <Text style={[styles.priceValue, {
                  fontSize: 14,
                  color: selected.paymentStatus === 'PAID' ? Colors.success : Colors.warning,
                }]}>
                  {selected.paymentStatus === 'PAID' ? '✓ Đã thu' : 'Chưa thu'}
                </Text>
              </View>
            </View>
            <Text style={styles.hiddenAmountNote}>{RENT_AMOUNT_HIDDEN_NOTE}</Text>
            <Row
              label="Trạng thái cọc"
              value={selected.paymentStatus === 'PAID' ? 'Đã thu' : selected.paymentStatus === 'PENDING' ? 'Chưa thu' : (selected.paymentStatus || 'Chưa có')}
              last
            />
          </Section>

          <Section title="Thời hạn thuê">
            <Row label="Ngày vào ở" value={formatDate(selected.moveInDate || selected.startDate)} />
            <Row label="Bắt đầu" value={formatDate(selected.startDate)} />
            <Row label="Kết thúc" value={selected.endDate ? formatDate(selected.endDate) : 'Không thời hạn'} last={!remain} />
            {!!remain && <Row label="Còn lại" value={remain} last />}
          </Section>

          {(selected.initialElectricReading != null || selected.initialWaterReading != null
            || selected.electricMeterImageUrl || selected.waterMeterImageUrl) && (
            <Section title="Bàn giao lúc đón khách">
              <Row label="Chỉ số điện đầu" value={selected.initialElectricReading != null ? `${selected.initialElectricReading} kWh` : 'Chưa ghi'} />
              <Row label="Chỉ số nước đầu" value={selected.initialWaterReading != null ? `${selected.initialWaterReading} m³` : 'Chưa ghi'} last={!selected.electricMeterImageUrl && !selected.waterMeterImageUrl} />
              {(selected.electricMeterImageUrl || selected.waterMeterImageUrl) && (
                <View style={styles.photoStrip}>
                  {!!selected.electricMeterImageUrl && (
                    <MeterThumb label="Đồng hồ điện" uri={selected.electricMeterImageUrl} />
                  )}
                  {!!selected.waterMeterImageUrl && (
                    <MeterThumb label="Đồng hồ nước" uri={selected.waterMeterImageUrl} />
                  )}
                </View>
              )}
            </Section>
          )}

          {(photos.length > 0 || !!selected.roomConditionNote) && (
            <Section title="Hiện trạng phòng lúc bàn giao">
              {!!selected.roomConditionNote && (
                <Text style={styles.noteText}>{selected.roomConditionNote}</Text>
              )}
              {photos.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>
                  {photos.map((uri, i) => (
                    <Image key={`${uri}-${i}`} source={{ uri }} style={styles.photo} />
                  ))}
                </ScrollView>
              )}
            </Section>
          )}

          {equipment.length > 0 ? (
            <Section title={`Nội thất bàn giao (${equipment.length} món)`}>
              {equipment.map((eq, i) => (
                <Row
                  key={eq.id ?? i}
                  label={eq.roomNumber ? `${eq.name} · P${eq.roomNumber}` : eq.name}
                  value={`SL ${eq.quantity ?? 1}`}
                  last={i === equipment.length - 1}
                />
              ))}
            </Section>
          ) : !!selected.equipmentSnapshot && (
            // API danh sách không trả equipmentList — dùng tạm dòng tóm tắt BE sinh cho PDF.
            <Section title="Nội thất bàn giao">
              <Text style={styles.noteText}>{selected.equipmentSnapshot}</Text>
            </Section>
          )}

          {isEndedStatus(status) && !!selected.terminatedAt && (
            <Section title="Thanh lý hợp đồng">
              <Row label="Ngày thanh lý" value={formatDate(selected.terminatedAt)} />
              <Row label="Lý do" value={selected.terminationReason || 'Không ghi'} last />
            </Section>
          )}

          <View style={{ height: Spacing.xl }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ===================== DANH SÁCH =====================
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>Hợp đồng khách thuê</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{propName || 'Đang tải…'}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listBody}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        >
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>Không tải được dữ liệu</Text>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); load(); }}>
                <Text style={styles.retryText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Tóm tắt: đang thuê là con số quản lý cần nhất */}
              <View style={styles.summaryCard}>
                <View style={styles.summaryMain}>
                  <Text style={styles.summaryBig}>{stats.living}</Text>
                  <Text style={styles.summaryBigLabel}>khách đang thuê</Text>
                </View>
                <View style={styles.summarySide}>
                  <SummaryLine color={Colors.warning} label="Sắp hết hạn" value={stats.expiring} />
                  <SummaryLine color={Colors.info} label="Chờ nhận phòng" value={stats.waiting} />
                  <SummaryLine color={Colors.error} label="Hết hạn chưa xử lý" value={stats.overdue} />
                </View>
              </View>

              {stats.expiring > 0 && (
                <View style={styles.alertBanner}>
                  <Text style={styles.alertText}>
                    ⏰ {stats.expiring} hợp đồng sắp hết hạn — liên hệ khách để gia hạn hoặc hẹn ngày trả phòng.
                  </Text>
                </View>
              )}

              {stats.total > 0 && (
                <>
                  <View style={styles.searchBar}>
                    <Text style={styles.searchIcon}>⌕</Text>
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Tìm tên khách, số phòng, mã hợp đồng"
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

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.filterRow}
                    contentContainerStyle={styles.filterContent}
                  >
                    {FILTERS.map(f => (
                      <TouchableOpacity
                        key={f.id}
                        style={[styles.chip, filter === f.id && styles.chipActive]}
                        onPress={() => setFilter(f.id)}
                      >
                        <Text style={[styles.chipText, filter === f.id && styles.chipTextActive]}>
                          {f.label} ({counts[f.id]})
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              {list.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyIcon}>{stats.total === 0 ? '📄' : '🔍'}</Text>
                  <Text style={styles.emptyTitle}>
                    {stats.total === 0 ? 'Chưa có khách nào đang thuê' : 'Không có hợp đồng khớp'}
                  </Text>
                  <Text style={styles.emptyText}>
                    {stats.total === 0
                      ? 'Hợp đồng sẽ xuất hiện ở đây sau khi bạn đón khách vào ở. Hợp đồng đã thanh lý không hiện ở màn này.'
                      : 'Thử bỏ bớt bộ lọc hoặc xoá từ khoá tìm kiếm.'}
                  </Text>
                  {stats.total > 0 && (
                    <TouchableOpacity
                      style={styles.retryBtn}
                      onPress={() => { setFilter('all'); setSearch(''); }}
                    >
                      <Text style={styles.retryText}>Xoá bộ lọc</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : list.map(({ contract: c, status }) => {
                const meta = CONTRACT_STATUS_META[status];
                const remain = remainText(c.endDate);
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.card, { borderLeftColor: meta.color }]}
                    activeOpacity={0.75}
                    onPress={() => setSelected(c)}
                  >
                    <View style={styles.cardTop}>
                      <Text style={styles.cardRoom} numberOfLines={1}>{roomLabel(c)}</Text>
                      <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                        <Text style={[styles.badgeText, { color: meta.color }]} numberOfLines={1}>{meta.label}</Text>
                      </View>
                    </View>

                    {/* Bỏ SĐT khỏi thẻ (13/08/2026) — ẩn ở màn chi tiết mà vẫn in ra
                        đây thì coi như không ẩn. Chỉ còn tên khách. */}
                    <Text style={styles.cardTenant} numberOfLines={1}>
                      {c.tenantFullName}
                    </Text>

                    {/* Thay số tiền bằng trạng thái thu cọc — @/constants/managerVisibility. */}
                    <View style={styles.cardMoneyRow}>
                      <Text style={[styles.cardRent, {
                        fontSize: 13,
                        color: c.paymentStatus === 'PAID' ? Colors.success : Colors.warning,
                      }]}>
                        {c.paymentStatus === 'PAID' ? '✓ Đã thu cọc' : 'Chưa thu cọc'}
                      </Text>
                    </View>

                    <View style={styles.cardFooter}>
                      <Text style={styles.cardDate} numberOfLines={1}>
                        {formatDate(c.moveInDate || c.startDate)} → {c.endDate ? formatDate(c.endDate) : '—'}
                      </Text>
                      {!!remain && !isEndedStatus(status) && (
                        <Text style={[styles.cardRemain, { color: meta.color }]}>{remain}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}

              {!!propAddress && (
                <Text style={styles.addressNote} numberOfLines={2}>📍 {propAddress}</Text>
              )}
            </>
          )}

          <View style={{ height: Spacing.xl }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

// ===================== SUB COMPONENTS =====================
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.sectionCard}>{children}</View>
  </>
);

const Row: React.FC<{ label: string; value: string; last?: boolean }> = ({ label, value, last }) => (
  <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const SummaryLine: React.FC<{ color: string; label: string; value: number }> = ({ color, label, value }) => (
  <View style={styles.summaryLine}>
    <View style={[styles.summaryDot, { backgroundColor: color }]} />
    <Text style={styles.summaryLineLabel}>{label}</Text>
    <Text style={[styles.summaryLineValue, { color }]}>{value}</Text>
  </View>
);

const MeterThumb: React.FC<{ label: string; uri: string }> = ({ label, uri }) => (
  <View style={styles.meterThumb}>
    <Image source={{ uri }} style={styles.photo} />
    <Text style={styles.meterThumbLabel}>{label}</Text>
  </View>
);

// ===================== STYLES =====================
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
    backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  backArrow: { fontSize: 26, color: Colors.textPrimary, lineHeight: 30 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.textPrimary },
  headerSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },

  listBody: { padding: Spacing.base, paddingBottom: Spacing.xl },

  // Tóm tắt
  summaryCard: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  summaryMain: { alignItems: 'center', paddingRight: Spacing.md, borderRightWidth: 1, borderRightColor: Colors.divider, minWidth: 96 },
  summaryBig: { fontSize: 34, fontWeight: '900', color: Colors.success, lineHeight: 38 },
  summaryBigLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '700', textAlign: 'center' },
  summarySide: { flex: 1, gap: 6 },
  summaryLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  summaryDot: { width: 8, height: 8, borderRadius: 4 },
  summaryLineLabel: { flex: 1, fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  summaryLineValue: { fontSize: 14, fontWeight: '900' },

  alertBanner: {
    backgroundColor: Colors.warningLight, borderRadius: BorderRadius.md,
    padding: Spacing.sm, marginBottom: Spacing.sm,
  },
  alertText: { fontSize: 12, color: '#92400E', fontWeight: '700', lineHeight: 17 },

  searchBar: {
    height: 42, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    backgroundColor: Colors.white, borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  searchIcon: { fontSize: 17, color: Colors.textMuted },
  searchInput: { flex: 1, fontSize: 13, color: Colors.textPrimary, paddingVertical: 0 },
  clearText: { fontSize: 20, color: Colors.textMuted, paddingHorizontal: 2 },

  filterRow: { flexGrow: 0, marginBottom: Spacing.md },
  filterContent: { gap: Spacing.sm, paddingRight: Spacing.base },
  chip: {
    height: 32, justifyContent: 'center', paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },

  // Thẻ hợp đồng
  card: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.md, marginBottom: Spacing.sm,
    borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4, ...Shadow.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardRoom: { flex: 1, fontSize: 15, fontWeight: '900', color: Colors.textPrimary },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: BorderRadius.full },
  badgeText: { fontSize: 11, fontWeight: '900' },
  cardTenant: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600', marginTop: 4 },
  cardMoneyRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.md, marginTop: Spacing.sm },
  cardRent: { fontSize: 16, fontWeight: '900', color: Colors.primary },
  cardRentUnit: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  cardDeposit: { fontSize: 12, color: Colors.textSecondary, fontWeight: '700' },
  cardFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm,
    marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.divider,
  },
  cardDate: { flex: 1, fontSize: 11, color: Colors.textMuted, fontWeight: '700' },
  cardRemain: { fontSize: 11, fontWeight: '900' },

  addressNote: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 16 },

  // Rỗng / lỗi
  emptyBox: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    padding: Spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  emptyIcon: { fontSize: 34, marginBottom: Spacing.sm },
  emptyTitle: { fontSize: 14, fontWeight: '900', color: Colors.textPrimary, textAlign: 'center' },
  emptyText: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  errorBox: {
    backgroundColor: Colors.errorLight, borderRadius: BorderRadius.lg,
    padding: Spacing.md, alignItems: 'center',
  },
  errorTitle: { fontSize: 14, fontWeight: '900', color: Colors.error },
  errorText: { fontSize: 12, color: Colors.error, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  retryBtn: {
    marginTop: Spacing.md, height: 36, justifyContent: 'center', paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full, backgroundColor: Colors.primary,
  },
  retryText: { color: Colors.white, fontSize: 13, fontWeight: '800' },

  // Chi tiết
  detailBody: { padding: Spacing.base, paddingBottom: Spacing.xl },
  heroCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4, ...Shadow.sm,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  heroRemain: { fontSize: 12, fontWeight: '900' },
  heroName: { fontSize: 19, fontWeight: '900', color: Colors.textPrimary, marginTop: Spacing.sm },
  heroHint: { fontSize: 12, color: Colors.textSecondary, marginTop: 3, lineHeight: 17 },

  quickRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  quickBtn: {
    flex: 1, height: 42, alignItems: 'center', justifyContent: 'center',
    borderRadius: BorderRadius.md, backgroundColor: Colors.white,
    borderWidth: 1, borderColor: Colors.border,
  },
  quickBtnPrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  quickBtnText: { fontSize: 13, fontWeight: '800', color: Colors.textPrimary },
  quickBtnPrimaryText: { color: Colors.white },

  sectionTitle: { fontSize: 13, fontWeight: '900', color: Colors.textPrimary, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  sectionCard: {
    backgroundColor: Colors.white, borderRadius: BorderRadius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.md,
    paddingHorizontal: Spacing.md, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  infoLabel: { fontSize: 12, color: Colors.textSecondary, flexShrink: 1 },
  infoValue: { fontSize: 13, color: Colors.textPrimary, fontWeight: '800', flexShrink: 1, textAlign: 'right' },

  priceRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.divider },
  priceBox: { flex: 1, padding: Spacing.md },
  priceLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '700' },
  priceValue: { fontSize: 17, fontWeight: '900', color: Colors.primary, marginTop: 3 },
  hiddenAmountNote: { fontSize: 11.5, color: Colors.textMuted, lineHeight: 16, marginTop: Spacing.sm },

  noteText: { fontSize: 12, color: Colors.textPrimary, lineHeight: 18, padding: Spacing.md },
  photoStrip: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md },
  photo: { width: 96, height: 96, borderRadius: BorderRadius.md, backgroundColor: Colors.divider },
  meterThumb: { alignItems: 'center', gap: 4 },
  meterThumbLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '700' },
});
