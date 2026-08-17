import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, SectionList, TouchableOpacity,
  TextInput, ScrollView, Linking, ActivityIndicator,
} from 'react-native';
import { showAlert, isClosedContract } from '@/utils';
import { EXPIRING_SOON_DAYS } from '@/utils/contractStatus';
import { maskTenantPhone } from '@/constants/managerVisibility';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
import { Colors, Spacing, Shadow } from '@/constants';
import { managerPropertyService } from '@/services/manager/propertyService';
import { realTenantService, TenantContractResponse } from '@/services/tenant/tenantService';
// Model + sheet chi tiết dùng CHUNG với màn Quản lý nhà & phòng — xem
// components/manager/TenantDetailSheet.tsx.
import {
  TenantDetailSheet, mapContractToTenant, getDaysRemaining, hasInspection,
  getFinancialChip, getContractChip, getInspectionChip, fmtIsoDate, getAvatarColor,
  StatusBadge, InfoChip,
  type Tenant, type TenantStatus, type ChipInfo,
} from '@/components/manager/TenantDetailSheet';

type FilterKey =
  | 'all' | TenantStatus
  | 'deposit_unpaid' | 'whole_house' | 'expiring' | 'expired' | 'no_inspection';

/**
 * Bỏ chip "Quá hạn TT" (17/08/2026): nó lọc theo `unpaidBills`, mà field đó luôn là 0 vì
 * endpoint không trả công nợ theo khách — chip hiện (0) và bấm vào luôn ra danh sách rỗng.
 * Thêm lại khi BE trả công nợ từng hợp đồng.
 *
 * Mỗi chip còn lại đều lọc trên dữ liệu THẬT, và đều là một việc quản lý phải làm:
 * thu cọc · nhắc gia hạn · xử lý HĐ hết hạn chưa thanh lý · bù hiện trạng còn thiếu.
 */
const FILTER_DEFS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'active', label: 'Đang ở' },
  { key: 'pending_activation', label: 'Chờ nhận phòng' },
  { key: 'deposit_unpaid', label: 'Chưa thu cọc' },
  { key: 'expiring', label: 'Sắp hết HĐ' },
  { key: 'expired', label: 'Hết hạn HĐ' },
  { key: 'no_inspection', label: 'Thiếu hiện trạng' },
  { key: 'whole_house', label: 'Nguyên căn' },
];

const matchesFilter = (t: Tenant, filter: FilterKey): boolean => {
  const daysLeft = t.contractEndDate ? getDaysRemaining(t.contractEndDate) : null;
  switch (filter) {
    case 'all': return true;
    case 'deposit_unpaid': return !t.depositPaid && t.status !== 'moved_out';
    case 'whole_house': return t.propertyType === 'WHOLE_HOUSE';
    // "Sắp hết" KHÔNG bao gồm HĐ đã quá hạn — hai việc khác nhau: một cái là nhắc gia
    // hạn trước, một cái là hợp đồng hết hiệu lực mà khách vẫn ở, phải xử lý ngay.
    case 'expiring': return daysLeft != null && daysLeft >= 0 && daysLeft <= EXPIRING_SOON_DAYS;
    case 'expired': return daysLeft != null && daysLeft < 0;
    // Chỉ tính khách ĐÃ nhận phòng — khách chưa đón thì đương nhiên chưa có hiện trạng.
    case 'no_inspection': return t.status === 'active' && !hasInspection(t);
    default: return t.status === filter;
  }
};

// ===================== FILTER CHIP =====================
const FilterChip: React.FC<{
  label: string;
  count?: number;
  selected: boolean;
  onPress: () => void;
}> = ({ label, count, selected, onPress }) => (
  <TouchableOpacity
    style={[
      filterChipStyles.chip,
      selected ? filterChipStyles.chipSelected : filterChipStyles.chipUnselected,
    ]}
    onPress={onPress}
    activeOpacity={0.75}
  >
    {/* Cắt 1 dòng + chặn co chữ: tên toà nhà dài ("MTX#14 THEO_PHONG giường+quạt") làm
        chip phình quá bề ngang màn hình rồi bị cắt cụt ở rìa, kéo cả hàng lệch. */}
    <Text
      numberOfLines={1}
      style={[
        filterChipStyles.label,
        selected ? filterChipStyles.labelSelected : filterChipStyles.labelUnselected,
      ]}
    >
      {label}
    </Text>
    {count !== undefined && count !== null && (
      <View
        style={[
          filterChipStyles.countBadge,
          selected ? filterChipStyles.countBadgeSelected : filterChipStyles.countBadgeUnselected,
        ]}
      >
        <Text
          style={[
            filterChipStyles.countText,
            selected ? filterChipStyles.countTextSelected : filterChipStyles.countTextUnselected,
          ]}
        >
          {count}
        </Text>
      </View>
    )}
  </TouchableOpacity>
);

const filterChipStyles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 34,
    // 16 → 12: hai chip đầu ("Tất cả", "Đang ở") ngắn mà đệm dày làm hàng dài quá,
    // chip thứ ba đã bị đẩy ra khỏi màn.
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    // Chặn chip phình theo tên toà nhà dài — quá thì chữ tự cắt (numberOfLines={1}).
    maxWidth: 190,
  },
  chipSelected: {
    backgroundColor: '#4F46E5',
    borderColor: '#4F46E5',
  },
  chipUnselected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  labelSelected: { color: '#FFFFFF' },
  labelUnselected: { color: '#334155' },
  countBadge: {
    minWidth: 22,
    minHeight: 20,
    paddingHorizontal: 6,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeSelected: { backgroundColor: 'rgba(255,255,255,0.22)' },
  countBadgeUnselected: { backgroundColor: '#EEF2FF' },
  countText: {
    fontSize: 11,
    fontWeight: '700',
    includeFontPadding: false,
  },
  countTextSelected: { color: '#FFFFFF' },
  countTextUnselected: { color: '#4F46E5' },
});

// ===================== TENANT CARD =====================
const TenantCard: React.FC<{
  tenant: Tenant;
  onPress: () => void;
  onQuickAction: () => void;
}> = ({ tenant, onPress, onQuickAction }) => {
  const isWholeHouse = tenant.propertyType === 'WHOLE_HOUSE';
  const avatarColor = isWholeHouse ? { bg: '#FEF3C7', text: '#B45309' } : getAvatarColor(tenant.fullName);
  const financialChip = getFinancialChip(tenant);
  const contractChip = getContractChip(tenant);
  const inspectionChip = getInspectionChip(tenant);
  // Viền đỏ dành cho việc CẦN LÀM thật: chưa thu cọc, hoặc HĐ đã quá hạn mà khách còn ở.
  const daysLeft = tenant.contractEndDate ? getDaysRemaining(tenant.contractEndDate) : null;
  const hasAlerts =
    (tenant.status === 'active' && !tenant.depositPaid) || (daysLeft != null && daysLeft < 0);

  const chips: ChipInfo[] = [];
  if (financialChip) chips.push(financialChip);
  if (contractChip) chips.push(contractChip);
  if (inspectionChip) chips.push(inspectionChip);
  if (isWholeHouse)
    chips.push({ label: '🏘 Nguyên căn', color: '#B45309', bg: '#FEF3C7' });

  return (
    <TouchableOpacity
      style={[
        cStyles.card,
        isWholeHouse && cStyles.cardWhole,
        hasAlerts && cStyles.cardAlert,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {isWholeHouse && <View style={cStyles.wholeStripe} />}

      {/* TOP: Avatar + Name + Status */}
      <View style={cStyles.topRow}>
        <View style={[cStyles.avatar, { backgroundColor: avatarColor.bg }]}>
          <Text style={[cStyles.avatarText, { color: avatarColor.text }]}>
            {isWholeHouse ? '🏠' : tenant.fullName.charAt(0)}
          </Text>
        </View>
        <View style={cStyles.nameBlock}>
          <Text style={cStyles.fullName} numberOfLines={1}>{tenant.fullName}</Text>
          {/* PHÒNG đứng trước, TÊN NHÀ theo sau và được phép cắt.
              Trước đây tên nhà đứng đầu nên trên màn hẹp luôn bị cắt đúng ở chỗ có số
              phòng ("MTX#14 THEO_PHONG giường+..."), tức mất đúng thông tin phân biệt
              các khách với nhau — trong khi cả danh sách thường cùng một nhà. */}
          {/* CHỈ số phòng — tên nhà nằm ở header của nhóm (danh sách gom theo nhà từ
              17/08/2026), in lại trên từng thẻ là vừa lặp vừa bị cắt cụt trên máy hẹp. */}
          <Text style={cStyles.locationText} numberOfLines={1}>
            <Text style={cStyles.locationRoom}>
              {isWholeHouse ? 'Nhà nguyên căn' : tenant.roomName}
            </Text>
            {!!tenant.contractCode && `  ·  ${tenant.contractCode}`}
          </Text>
        </View>
        <View style={cStyles.topRight}>
          <StatusBadge status={tenant.status} />
          <TouchableOpacity style={cStyles.moreBtn} onPress={onQuickAction} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={cStyles.moreBtnText}>•••</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* DIVIDER */}
      <View style={cStyles.divider} />

      {/* MIDDLE: Contact + Date */}
      <View style={cStyles.middleRow}>
        {/* 3 số cuối SĐT — @/constants/managerVisibility. Đủ để đối chiếu người vừa gọi
            và phân biệt hai khách trùng tên; muốn gọi thì bấm nút ••• (không hiện số). */}
        {!!tenant.phone && (
          <View style={cStyles.infoItem}>
            <Text style={cStyles.infoIcon}>📱</Text>
            <Text style={cStyles.infoText}>{maskTenantPhone(tenant.phone)}</Text>
          </View>
        )}
        <View style={cStyles.infoItem}>
          <Text style={cStyles.infoIcon}>📅</Text>
          <Text style={cStyles.infoText}>Vào {tenant.moveInDate}</Text>
        </View>
        {!!tenant.contractEndDate && (
          <View style={cStyles.infoItem}>
            <Text style={cStyles.infoIcon}>📋</Text>
            <Text style={cStyles.infoText}>HĐ đến {fmtIsoDate(tenant.contractEndDate)}</Text>
          </View>
        )}
      </View>

      {/* BOTTOM: Status chips */}
      {tenant.status !== 'moved_out' && chips.length > 0 && (
        <>
          <View style={cStyles.divider} />
          <View style={cStyles.chipsRow}>
            {chips.map((chip, i) => (
              <InfoChip key={i} {...chip} />
            ))}
          </View>
        </>
      )}
    </TouchableOpacity>
  );
};

const cStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  cardWhole: { backgroundColor: '#FFFCF5' },
  cardAlert: { borderWidth: 1, borderColor: '#FCA5A5' },
  wholeStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: '#D97706' },

  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: 20, fontWeight: '800' },
  nameBlock: { flex: 1, justifyContent: 'center' },
  fullName: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  locationText: { fontSize: 12, color: '#64748B' },
  locationRoom: { fontWeight: '700', color: '#334155' },
  topRight: { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  moreBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  moreBtnText: { fontSize: 11, color: '#94A3B8', fontWeight: '700', letterSpacing: 1 },

  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 10 },

  middleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoIcon: { fontSize: 12 },
  infoText: { fontSize: 12, color: '#475569', fontWeight: '500' },

  chipsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
});

// ===================== PROPERTY SECTION HEADER =====================
/**
 * Đầu nhóm cho MỘT NHÀ. Danh sách khách gom theo nhà (17/08/2026) vì để phẳng thì tên
 * nhà chỉ còn là dòng chữ bị cắt trên thẻ — quản lý nhiều nhà không biết khách nào ở đâu.
 *
 * Bấm vào header để thu/mở nhóm: nhà nào đang cần xử lý thì mở, còn lại xếp gọn lại.
 */
interface PropertySection {
  propertyName: string;
  isWholeHouse: boolean;
  /** Tổng khách của nhà này SAU khi lọc — `data` rỗng khi nhóm đang thu. */
  total: number;
  /** Số việc cần làm trong nhà: chưa thu cọc hoặc HĐ đã quá hạn. */
  todo: number;
  collapsed: boolean;
  data: Tenant[];
}

const PropertySectionHeader: React.FC<{ section: PropertySection; onToggle: () => void }> = ({
  section, onToggle,
}) => (
  <TouchableOpacity style={secStyles.wrap} onPress={onToggle} activeOpacity={0.7}>
    <Text style={secStyles.icon}>{section.isWholeHouse ? '🏠' : '🏢'}</Text>
    <View style={secStyles.textBlock}>
      <Text style={secStyles.name} numberOfLines={2}>{section.propertyName}</Text>
      <Text style={secStyles.meta}>
        {section.total} khách
        {section.todo > 0 && <Text style={secStyles.metaTodo}>{`  ·  ${section.todo} cần xử lý`}</Text>}
      </Text>
    </View>
    <Text style={secStyles.chevron}>{section.collapsed ? '▸' : '▾'}</Text>
  </TouchableOpacity>
);

const secStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F8FAFC',       // trùng màu nền màn — header dính không bị lẫn vào thẻ
    paddingTop: Spacing.md, paddingBottom: 8,
  },
  icon: { fontSize: 16 },
  textBlock: { flex: 1 },
  name: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  meta: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginTop: 1 },
  metaTodo: { color: '#D97706' },
  chevron: { fontSize: 13, color: '#94A3B8', fontWeight: '700', paddingHorizontal: 4 },
});

// ===================== SUMMARY STAT TILE =====================
/**
 * Ô thống kê BẤM ĐƯỢC — bấm là lọc luôn danh sách theo đúng con số đó, bấm lại thì bỏ lọc.
 * Trước đây 3 ô này chỉ để ngắm: quản lý thấy "4 chưa thu cọc" rồi phải tự đi tìm chip
 * tương ứng ở hàng dưới. Số nào cũng là một việc cần làm thì phải bấm được vào việc đó.
 */
const StatTile: React.FC<{
  value: number;
  label: string;
  color: string;
  bg: string;
  active: boolean;
  onPress: () => void;
}> = ({ value, label, color, bg, active, onPress }) => (
  <TouchableOpacity
    style={[stStyles.tile, { backgroundColor: bg }, active && { borderColor: color, borderWidth: 1.5 }]}
    onPress={onPress}
    activeOpacity={0.75}
  >
    <Text style={[stStyles.value, { color }]}>{value}</Text>
    <Text style={stStyles.label} numberOfLines={1}>{label}</Text>
  </TouchableOpacity>
);

const stStyles = StyleSheet.create({
  tile: {
    flex: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8,
    alignItems: 'center', borderWidth: 1.5, borderColor: 'transparent',
  },
  value: { fontSize: 22, fontWeight: '800' },
  label: { fontSize: 10, color: '#64748B', marginTop: 2, textAlign: 'center', fontWeight: '500' },
});

// ===================== MAIN SCREEN =====================
export const TenantListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  /**
   * Vào từ màn chi tiết một nhà thì mở sẵn ô tìm bằng tên nhà đó — danh sách gom theo
   * nhà nên chỉ còn đúng nhóm của nhà vừa xem. Đặt vào ô tìm (chứ không phải một bộ lọc
   * ẩn) để quản lý thấy vì sao danh sách đang bị thu hẹp và xoá được ngay.
   * Chỉ lấy lúc khởi tạo — sau đó ô tìm thuộc quyền người dùng.
   */
  const [search, setSearch] = useState<string>(() => route?.params?.propertyName ?? '');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  /** Tên các nhà đang thu gọn — mặc định rỗng (mở hết). */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);

  // Tải khách thuê THẬT: gom hợp đồng của tất cả nhà manager phụ trách.
  const load = useCallback(async () => {
    try {
      const scoped = await managerPropertyService.getScopedProperties();
      const lists = await Promise.all(
        scoped.map(async (p: any) => {
          const contracts = await realTenantService
            .listByProperty(p.id)
            .catch(() => [] as TenantContractResponse[]);
          const isWhole = p.wholeHouse === true;
          // Chỉ giữ khách ĐANG THUÊ. Hai đầu bị loại:
          //  • HĐ đã thanh lý (isClosedContract) — khách đã đi rồi.
          //  • HĐ còn DRAFT — khách CHƯA ĐƯỢC ĐÓN, chưa nhận phòng, chưa phải khách thuê.
          //    Trước 17/08/2026 nhóm này lọt vào đây và bị `mapTenantStatus` gắn nhãn
          //    "Đang ở" (DRAFT rơi vào nhánh mặc định `return 'active'`), nên hồ sơ mới
          //    import đã hiện thành khách đang ở — đếm trùng với màn "Hợp đồng chờ xử lý"
          //    và làm ô "Đang ở" trên đầu màn sai số.
          return contracts
            .filter(c => !isClosedContract(c.status))
            .filter(c => (c.status || '').toUpperCase() !== 'DRAFT')
            .map(c => mapContractToTenant(c, p.propertyName, isWhole));
        }),
      );
      setTenants(lists.flat());
    } catch {
      setTenants([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));


  /**
   * Tìm theo: tên · phòng · nhà · mã HĐ · SĐT · CCCD.
   *
   * SĐT/CCCD vẫn tìm trên số ĐẦY ĐỦ dù màn chỉ hiện 3 số cuối — quản lý đọc số từ ngoài
   * app (khách gọi tới, giấy tờ) rồi dán vào tìm, mà gõ 3 số cuối cũng ra vì `includes`.
   * Bỏ dấu cách hai đầu: chuỗi dán từ Zalo/SMS gần như luôn dính khoảng trắng.
   */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenants.filter(t => {
      const matchSearch = !q || (
        t.fullName.toLowerCase().includes(q) ||
        t.roomName.toLowerCase().includes(q) ||
        t.propertyName.toLowerCase().includes(q) ||
        (t.contractCode || '').toLowerCase().includes(q) ||
        t.phone.includes(q) ||
        t.cccd.includes(q)
      );
      return matchSearch && matchesFilter(t, activeFilter);
    });
  }, [tenants, search, activeFilter]);

  const filterCounts = useMemo(() => {
    const result: Record<string, number> = {};
    FILTER_DEFS.forEach(f => {
      result[f.key] = tenants.filter(t => matchesFilter(t, f.key)).length;
    });
    return result;
  }, [tenants]);

  /**
   * 3 ô đầu màn = 3 chip lọc, đếm bằng CHÍNH `matchesFilter` chứ không viết lại điều
   * kiện. Trước đây ô "Sắp HH HĐ" tự lặp lại luật `<= 30` nên khi chip đổi luật (tách
   * "hết hạn" ra khỏi "sắp hết hạn") thì con số trên đầu màn và số trong chip lệch nhau.
   */
  const stats = useMemo(() => ({
    active: tenants.filter(t => matchesFilter(t, 'active')).length,
    // Không có công nợ theo khách nên ô "Có nợ" cũ luôn là 0 — đổi sang CHƯA THU CỌC.
    depositUnpaid: tenants.filter(t => matchesFilter(t, 'deposit_unpaid')).length,
    expiring: tenants.filter(t => matchesFilter(t, 'expiring')).length,
  }), [tenants]);

  /** Bấm ô thống kê: đang lọc đúng nhóm đó thì bỏ lọc, ngược lại thì lọc. */
  const toggleFilter = useCallback((key: FilterKey) => {
    setActiveFilter(prev => (prev === key ? 'all' : key));
  }, []);

  const toggleSection = useCallback((propertyName: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (!next.delete(propertyName)) next.add(propertyName);
      return next;
    });
  }, []);

  /**
   * Gom khách theo NHÀ.
   *
   * Trong mỗi nhà xếp theo số phòng có hiểu số (`numeric: true`) — thiếu nó thì "Phòng 10"
   * đứng trước "Phòng 9" vì so sánh từng ký tự. Nhà xếp theo tên, nhưng nhà nào còn việc
   * (chưa thu cọc / HĐ quá hạn) thì đẩy lên đầu: mở màn là thấy chỗ cần làm trước.
   */
  const sections = useMemo<PropertySection[]>(() => {
    const byProperty = new Map<string, Tenant[]>();
    filtered.forEach(t => {
      const arr = byProperty.get(t.propertyName);
      if (arr) arr.push(t);
      else byProperty.set(t.propertyName, [t]);
    });

    return [...byProperty.entries()]
      .map(([propertyName, list]) => {
        const sorted = [...list].sort((a, b) =>
          a.roomName.localeCompare(b.roomName, 'vi', { numeric: true }),
        );
        const isCollapsed = collapsed.has(propertyName);
        return {
          propertyName,
          isWholeHouse: list.every(t => t.propertyType === 'WHOLE_HOUSE'),
          total: list.length,
          todo: list.filter(t =>
            matchesFilter(t, 'deposit_unpaid') || matchesFilter(t, 'expired'),
          ).length,
          collapsed: isCollapsed,
          data: isCollapsed ? [] : sorted,
        };
      })
      .sort((a, b) =>
        (b.todo > 0 ? 1 : 0) - (a.todo > 0 ? 1 : 0)
        || a.propertyName.localeCompare(b.propertyName, 'vi', { numeric: true }),
      );
  }, [filtered, collapsed]);

  /** "5 khách · 2 nhà" — số nhà là số nhóm ĐANG HIỆN, không phải tổng nhà phụ trách. */
  const subtitle = `${filtered.length} khách · ${sections.length} nhà`;

  // Shared params passed to every tenant-scoped screen
  const tenantNavParams = (t: Tenant) => ({
    tenantId: t.id,
    tenantName: t.fullName,
    roomId: t.roomId,
    roomName: t.roomName,
    propertyId: t.propertyId,
    propertyName: t.propertyName,
  });

  const handleAction = useCallback((action: string, tenant: Tenant) => {
    const isWH = tenant.propertyType === 'WHOLE_HOUSE';
    switch (action) {
      // 'billing_overdue' — navigate directly to the first unpaid invoice detail
      case 'billing_overdue':
        setSelectedTenant(null);
        navigation.navigate('TenantInvoices', { ...tenantNavParams(tenant), autoOpenFirst: true });
        break;
      // 'billing' — open full invoice list for this tenant
      case 'billing':
        setSelectedTenant(null);
        navigation.navigate('TenantInvoices', tenantNavParams(tenant));
        break;
      case 'contract':
        setSelectedTenant(null);
        navigation.navigate('TenantContractDetail', tenantNavParams(tenant));
        break;
      case 'maintenance':
        setSelectedTenant(null);
        navigation.navigate('TenantMaintenance', tenantNavParams(tenant));
        break;
      case 'checkout': {
        const doCheckout = async () => {
          try {
            // Thanh lý chủ động (khách trả sớm / hai bên thống nhất) — KHÔNG phải
            // vi phạm, nên không dùng type VIOLATION (BE rào lại type đó).
            await realTenantService.terminateContract(Number(tenant.id), {
              type: 'MUTUAL_AGREEMENT',
              reason: `Quản lý thanh lý hợp đồng ${isWH ? 'trả nhà' : 'trả phòng'} theo thoả thuận`,
            });
            setSelectedTenant(null);
            load();
            showAlert('Thành công', `Đã ${isWH ? 'trả nhà' : 'trả phòng'} cho ${tenant.fullName}.`);
          } catch (e: any) {
            showAlert('Lỗi', e?.response?.data?.message || e?.message || 'Không kết thúc được hợp đồng — thử lại hoặc kiểm tra trạng thái HĐ.');
          }
        };
        const title = isWH ? 'Thanh lý ngay — trả nhà' : 'Thanh lý ngay — trả phòng';
        const msg = `${tenant.fullName} - ${isWH ? tenant.propertyName : tenant.roomName}\n\nThanh lý HĐ NGAY không qua yêu cầu trả phòng của khách (khách gửi yêu cầu thì duyệt ở màn "Trả phòng" ngoài trang chủ). Đảm bảo hóa đơn và tiền cọc đã xử lý xong.`;
        showAlert(title, msg, [
          { text: 'Hủy', style: 'cancel' },
          { text: isWH ? 'Trả nhà' : 'Trả phòng', style: 'destructive', onPress: doCheckout },
        ]);
        break;
      }
      // Kích hoạt HĐ là việc của màn Đón khách (thu cọc → OTP của khách). Ở đây chỉ
      // dẫn đường sang đó, KHÔNG tự đổi trạng thái trong máy như bản trước.
      case 'reception':
        setSelectedTenant(null);
        // Tên param phải là `contractId` — ResumeContractScreen đọc đúng key đó rồi
        // tự mở sẵn hợp đồng (route.params?.contractId, dòng ~162).
        navigation.navigate('ResumeContract', { contractId: Number(tenant.id) });
        break;
    }
  }, [navigation, load]);

  const handleQuickAction = useCallback((tenant: Tenant) => {
    const isWH = tenant.propertyType === 'WHOLE_HOUSE';
    // Khách chưa nhận phòng thì Hoá đơn/Bảo trì chưa có gì — chỉ đưa sang màn đón khách.
    const pending = tenant.status === 'pending_activation';
    showAlert(
      tenant.fullName,
      `${tenant.propertyName} · ${isWH ? 'Nhà nguyên căn' : tenant.roomName}`,
      [
        { text: 'Xem chi tiết', onPress: () => setSelectedTenant(tenant) },
        ...(tenant.phone
          ? [{ text: '📞 Gọi điện', onPress: () => Linking.openURL(`tel:${tenant.phone}`) }]
          : []),
        ...(pending
          ? [{ text: '🚚 Đón khách', onPress: () => handleAction('reception', tenant) }]
          : [
            { text: '🧾 Hóa đơn', onPress: () => handleAction('billing', tenant) },
            { text: '🔧 Yêu cầu bảo trì', onPress: () => handleAction('maintenance', tenant) },
          ]),
        { text: '📋 Hợp đồng', onPress: () => handleAction('contract', tenant) },
        { text: 'Hủy', style: 'cancel' as const },
      ]
    );
  }, [handleAction]);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {navigation.canGoBack() && (
            <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.backBtnText}>‹</Text>
            </TouchableOpacity>
          )}
          <View>
            <Text style={styles.title}>Khách thuê</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('ResumeContract')}>
          <Text style={styles.addBtnText}>+ Đón khách</Text>
        </TouchableOpacity>
      </View>

      {/* Summary stats — bấm được, mỗi ô là một bộ lọc */}
      <View style={styles.statsRow}>
        <StatTile
          value={stats.active} label="Đang ở" color="#16A34A" bg="#F0FDF4"
          active={activeFilter === 'active'} onPress={() => toggleFilter('active')}
        />
        <StatTile
          value={stats.depositUnpaid} label="Chưa thu cọc" color="#D97706" bg="#FFFBEB"
          active={activeFilter === 'deposit_unpaid'} onPress={() => toggleFilter('deposit_unpaid')}
        />
        <StatTile
          value={stats.expiring} label="Sắp hết HĐ" color="#B45309" bg="#FFF7ED"
          active={activeFilter === 'expiring'} onPress={() => toggleFilter('expiring')}
        />
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Tìm theo tên, SĐT, phòng, CCCD..."
          placeholderTextColor="#94A3B8"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
        decelerationRate="fast"
      >
        {FILTER_DEFS.map(f => {
          const active = activeFilter === f.key;
          const count = filterCounts[f.key];
          return (
            <FilterChip
              key={f.key}
              label={f.label}
              count={count}
              selected={active}
              onPress={() => setActiveFilter(f.key)}
            />
          );
        })}
      </ScrollView>

      {/* Danh sách — GOM THEO NHÀ, header dính lại khi cuộn.
          Hàng chip "Tất cả nhà / <tên nhà>" cũ đã bỏ: header của nhóm đã mang cả tên nhà
          lẫn số khách, giữ thêm một hàng chip nữa là lặp thông tin — mà chính hàng đó là
          chỗ tên nhà dài bị cắt cụt. Cần xem riêng một nhà thì thu các nhóm khác lại,
          hoặc gõ tên nhà vào ô tìm. */}
      <SectionList
        sections={sections}
        keyExtractor={i => i.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <PropertySectionHeader
            section={section}
            onToggle={() => toggleSection(section.propertyName)}
          />
        )}
        renderItem={({ item }) => (
          <TenantCard
            tenant={item}
            onPress={() => setSelectedTenant(item)}
            onQuickAction={() => handleQuickAction(item)}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.emptyDesc}>Đang tải khách thuê...</Text>
            </View>
          ) : tenants.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🏠</Text>
              <Text style={styles.emptyTitle}>Chưa có khách thuê</Text>
              <Text style={styles.emptyDesc}>
                Khách thuê sẽ hiển thị khi có hợp đồng trong các nhà bạn quản lý
              </Text>
            </View>
          ) : (
            // Có khách nhưng bộ lọc/từ khoá loại hết — nói rõ và cho lối ra, đừng để
            // quản lý tưởng mất dữ liệu rồi đi tải lại màn.
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTitle}>Không có khách nào khớp</Text>
              <Text style={styles.emptyDesc}>
                {tenants.length} khách đang thuê, nhưng bộ lọc hoặc từ khoá hiện tại loại hết.
              </Text>
              <TouchableOpacity
                style={styles.resetBtn}
                onPress={() => { setSearch(''); setActiveFilter('all'); }}
              >
                <Text style={styles.resetBtnText}>Xoá bộ lọc</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />

      {selectedTenant && (
        <TenantDetailSheet
          tenant={selectedTenant}
          onClose={() => setSelectedTenant(null)}
          onAction={handleAction}
        />
      )}
    </SafeAreaView>
  );
};

// ===================== SCREEN STYLES =====================
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', ...Shadow.sm },
  backBtnText: { fontSize: 28, color: '#0F172A', lineHeight: 32 },
  title: { fontSize: 24, fontWeight: '800', color: '#0F172A' },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 1 },
  addBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.md, paddingVertical: 9, borderRadius: 12 },
  addBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },

  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },

  searchContainer: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: Spacing.lg,
    backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 12,
    marginBottom: 10, ...Shadow.sm,
  },
  searchIcon: { fontSize: 14, marginRight: 6 },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A', paddingVertical: 11 },
  clearBtn: { padding: 4 },
  clearBtnText: { fontSize: 12, color: '#94A3B8', fontWeight: '700' },

  filterScroll: { flexGrow: 0 },
  filterContent: {
    flexDirection: 'row',
    paddingLeft: Spacing.lg,
    paddingRight: Spacing.xl,
    paddingTop: 6,
    paddingBottom: 8,
    gap: 8,
  },

  listContent: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: 100 },

  empty: { alignItems: 'center', paddingTop: 72, gap: 8, paddingHorizontal: Spacing.lg },
  emptyIcon: { fontSize: 44 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#334155' },
  emptyDesc: { fontSize: 13, color: '#94A3B8', textAlign: 'center' },
  resetBtn: {
    marginTop: 6, paddingHorizontal: 18, paddingVertical: 9,
    borderRadius: 999, backgroundColor: '#EEF2FF',
  },
  resetBtnText: { fontSize: 13, fontWeight: '700', color: '#4F46E5' },
});
