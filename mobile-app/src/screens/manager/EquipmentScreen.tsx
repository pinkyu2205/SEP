import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Modal, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';

// ===================== TYPES =====================
type EquipmentStatus = 'active' | 'repairing' | 'damaged' | 'replaced' | 'retired';

interface MaintenanceRecord {
  id: string;
  date: string;
  type: 'repair' | 'maintenance' | 'replacement';
  description: string;
  cost: number;
  performedBy: string;
  ticketCode?: string;
}

interface EquipmentItem {
  id: string;
  assetId: string;
  name: string;
  houseId: string;
  houseName: string;
  roomName: string;
  category: string;
  brand?: string;
  model?: string;
  qrCode: string;
  status: EquipmentStatus;
  installationDate: string;
  purchasePrice?: number;
  warrantyExpiry?: string;
  lastMaintenanceAt?: string;
  maintenanceHistory: MaintenanceRecord[];
  currentTenantName?: string;
  notes?: string;
}

// ===================== MOCK DATA =====================
const MOCK_HOUSES = [
  { id: 'h1', name: 'Nhà Nguyễn Trãi' },
  { id: 'h2', name: 'Nhà Lê Văn Sỹ' },
];

const MOCK_EQUIPMENT: EquipmentItem[] = [
  {
    id: 'eq1', assetId: 'AST-2024-001', name: 'Điều hòa Daikin 9000BTU',
    houseId: 'h1', houseName: 'Nhà Nguyễn Trãi', roomName: 'P101',
    category: 'Điện lạnh', brand: 'Daikin', model: 'FTKC25TVMV',
    qrCode: 'QR-NT-101-AC', status: 'active',
    installationDate: '01/01/2024', purchasePrice: 8500000,
    warrantyExpiry: '01/01/2026', lastMaintenanceAt: '15/03/2026',
    currentTenantName: 'Trần Văn A',
    maintenanceHistory: [
      { id: 'm1', date: '15/03/2026', type: 'maintenance', description: 'Vệ sinh định kỳ, nạp gas', cost: 350000, performedBy: 'Thợ Minh' },
      { id: 'm2', date: '10/09/2025', type: 'maintenance', description: 'Vệ sinh định kỳ', cost: 200000, performedBy: 'Thợ Minh' },
    ],
  },
  {
    id: 'eq2', assetId: 'AST-2024-002', name: 'Bình nước nóng Ariston 30L',
    houseId: 'h1', houseName: 'Nhà Nguyễn Trãi', roomName: 'P101',
    category: 'Điện nước', brand: 'Ariston', model: 'SLIM2 30V',
    qrCode: 'QR-NT-101-WH', status: 'active',
    installationDate: '01/01/2024', purchasePrice: 4200000,
    warrantyExpiry: '01/01/2027', currentTenantName: 'Trần Văn A',
    maintenanceHistory: [],
  },
  {
    id: 'eq3', assetId: 'AST-2024-003', name: 'Giường 1m6 + Nệm',
    houseId: 'h1', houseName: 'Nhà Nguyễn Trãi', roomName: 'P101',
    category: 'Nội thất', qrCode: 'QR-NT-101-BD', status: 'active',
    installationDate: '01/01/2024', purchasePrice: 5000000,
    currentTenantName: 'Trần Văn A', maintenanceHistory: [],
  },
  {
    id: 'eq5', assetId: 'AST-2024-005', name: 'Điều hòa Panasonic 9000BTU',
    houseId: 'h1', houseName: 'Nhà Nguyễn Trãi', roomName: 'P102',
    category: 'Điện lạnh', brand: 'Panasonic', model: 'CS-N9VKH-8',
    qrCode: 'QR-NT-102-AC', status: 'repairing',
    installationDate: '01/01/2024', purchasePrice: 7800000,
    warrantyExpiry: '01/01/2026', lastMaintenanceAt: '10/05/2026',
    currentTenantName: 'Lê Thị B',
    maintenanceHistory: [
      { id: 'm3', date: '10/05/2026', type: 'repair', description: 'Board mạch bị lỗi, đang chờ phụ kiện', cost: 0, performedBy: 'Trung tâm BH Panasonic', ticketCode: 'TK-2026-003' },
    ],
  },
  {
    id: 'eq6', assetId: 'AST-2023-006', name: 'Tủ lạnh Sanyo 90L cũ',
    houseId: 'h1', houseName: 'Nhà Nguyễn Trãi', roomName: 'P201',
    category: 'Thiết bị', brand: 'Sanyo', qrCode: 'QR-NT-201-FR',
    status: 'replaced', installationDate: '15/06/2023', purchasePrice: 2500000,
    currentTenantName: 'Phạm Văn C',
    notes: 'Đã thay bằng Aqua 90L mới (AST-2026-015)',
    maintenanceHistory: [
      { id: 'm4', date: '20/04/2026', type: 'replacement', description: 'Tủ bị hỏng máy nén, quyết định thanh lý và mua mới', cost: 0, performedBy: 'Manager' },
    ],
  },
  {
    id: 'eq7', assetId: 'AST-2024-007', name: 'Máy giặt Toshiba 8kg',
    houseId: 'h2', houseName: 'Nhà Lê Văn Sỹ', roomName: 'P201',
    category: 'Thiết bị', brand: 'Toshiba', model: 'AW-M905BV',
    qrCode: 'QR-LVS-201-WM', status: 'active',
    installationDate: '15/02/2024', purchasePrice: 5500000,
    warrantyExpiry: '15/02/2026', maintenanceHistory: [],
  },
  {
    id: 'eq9', assetId: 'AST-2022-009', name: 'Máy bơm nước tổng',
    houseId: 'h1', houseName: 'Nhà Nguyễn Trãi', roomName: 'Khu vực chung',
    category: 'Hạ tầng', brand: 'Pentax', model: 'CM 50-200A',
    qrCode: 'QR-NT-COM-WP', status: 'active',
    installationDate: '01/06/2022', purchasePrice: 12000000,
    warrantyExpiry: '01/06/2024', lastMaintenanceAt: '01/01/2026',
    maintenanceHistory: [
      { id: 'm5', date: '01/01/2026', type: 'maintenance', description: 'Kiểm tra tổng thể đầu năm, bơm còn tốt', cost: 500000, performedBy: 'Thợ Hùng' },
    ],
  },
];

const STATUS_CONFIG: Record<EquipmentStatus, { label: string; color: string; bg: string; icon: string }> = {
  active: { label: 'Hoạt động', color: '#16A34A', bg: '#F0FDF4', icon: '✅' },
  repairing: { label: 'Đang sửa', color: '#F59E0B', bg: '#FFFBEB', icon: '🔧' },
  damaged: { label: 'Hỏng', color: '#EF4444', bg: '#FEF2F2', icon: '❌' },
  replaced: { label: 'Đã thay', color: '#6B7280', bg: '#F3F4F6', icon: '🔄' },
  retired: { label: 'Thanh lý', color: '#94A3B8', bg: '#F8FAFC', icon: '♻️' },
};

const CATEGORIES = ['Tất cả', 'Điện lạnh', 'Điện nước', 'Nội thất', 'Thiết bị', 'Hạ tầng'];

const fmt = (n: number) => n.toLocaleString('vi-VN') + 'đ';

const MAINTENANCE_TYPE_LABELS = { repair: 'Sửa chữa', maintenance: 'Bảo trì định kỳ', replacement: 'Thay thế' };

// ===================== EQUIPMENT DETAIL MODAL =====================
const EquipmentDetailModal: React.FC<{
  item: EquipmentItem;
  onClose: () => void;
  onStatusChange: (id: string, status: EquipmentStatus) => void;
}> = ({ item, onClose, onStatusChange }) => {
  const cfg = STATUS_CONFIG[item.status];
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  const totalMaintenanceCost = item.maintenanceHistory.reduce((s, r) => s + r.cost, 0);

  return (
    <Modal transparent animationType="slide">
      <View style={detailStyles.overlay}>
        <ScrollView bounces={false}>
          <View style={detailStyles.content}>
            {/* Header */}
            <View style={detailStyles.header}>
              <Text style={detailStyles.title}>{item.name}</Text>
              <TouchableOpacity onPress={onClose}>
                <Text style={detailStyles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Status + Asset ID */}
            <View style={detailStyles.idRow}>
              <View style={[detailStyles.statusBadge, { backgroundColor: cfg.bg }]}>
                <Text style={detailStyles.statusIcon}>{cfg.icon}</Text>
                <Text style={[detailStyles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
              <Text style={detailStyles.assetId}>#{item.assetId}</Text>
            </View>

            {/* QR Code */}
            <View style={detailStyles.qrBox}>
              <View style={detailStyles.qrVisual}>
                <Text style={{ fontSize: 48 }}>📱</Text>
                <Text style={detailStyles.qrCode}>{item.qrCode}</Text>
              </View>
              <Text style={detailStyles.qrHint}>Dán mã QR này lên thiết bị để khách scan báo sự cố</Text>
            </View>

            {/* Info */}
            <View style={detailStyles.section}>
              <Text style={detailStyles.sectionTitle}>Chi tiết thiết bị</Text>
              <View style={detailStyles.infoRow}><Text style={detailStyles.infoLabel}>Vị trí</Text><Text style={detailStyles.infoVal}>{item.houseName} · {item.roomName}</Text></View>
              <View style={detailStyles.infoRow}><Text style={detailStyles.infoLabel}>Danh mục</Text><Text style={detailStyles.infoVal}>{item.category}</Text></View>
              {item.brand && <View style={detailStyles.infoRow}><Text style={detailStyles.infoLabel}>Hãng</Text><Text style={detailStyles.infoVal}>{item.brand}{item.model ? ` - ${item.model}` : ''}</Text></View>}
              {item.purchasePrice && <View style={detailStyles.infoRow}><Text style={detailStyles.infoLabel}>Giá mua</Text><Text style={[detailStyles.infoVal, { color: Colors.primary }]}>{fmt(item.purchasePrice)}</Text></View>}
              <View style={detailStyles.infoRow}><Text style={detailStyles.infoLabel}>Lắp đặt</Text><Text style={detailStyles.infoVal}>{item.installationDate}</Text></View>
              {item.warrantyExpiry && (
                <View style={detailStyles.infoRow}>
                  <Text style={detailStyles.infoLabel}>Bảo hành</Text>
                  <Text style={[detailStyles.infoVal, { color: Colors.warning }]}>
                    Hết: {item.warrantyExpiry}
                  </Text>
                </View>
              )}
              {item.currentTenantName && (
                <View style={detailStyles.infoRow}>
                  <Text style={detailStyles.infoLabel}>Người đang dùng</Text>
                  <Text style={[detailStyles.infoVal, { color: Colors.primary }]}>{item.currentTenantName}</Text>
                </View>
              )}
              {item.lastMaintenanceAt && (
                <View style={detailStyles.infoRow}>
                  <Text style={detailStyles.infoLabel}>Bảo trì gần nhất</Text>
                  <Text style={detailStyles.infoVal}>{item.lastMaintenanceAt}</Text>
                </View>
              )}
            </View>

            {/* Status change */}
            <View style={detailStyles.section}>
              <Text style={detailStyles.sectionTitle}>Cập nhật trạng thái</Text>
              <TouchableOpacity
                style={detailStyles.statusPickerBtn}
                onPress={() => setShowStatusPicker(true)}
              >
                <Text style={[detailStyles.statusPickerText, { color: cfg.color }]}>
                  {cfg.icon} {cfg.label}
                </Text>
                <Text style={detailStyles.statusPickerArrow}>▼</Text>
              </TouchableOpacity>
            </View>

            {/* Maintenance history */}
            <View style={detailStyles.section}>
              <View style={detailStyles.historyHeader}>
                <Text style={detailStyles.sectionTitle}>
                  Lịch sử bảo trì ({item.maintenanceHistory.length})
                </Text>
                {totalMaintenanceCost > 0 && (
                  <Text style={detailStyles.totalCost}>Tổng: {fmt(totalMaintenanceCost)}</Text>
                )}
              </View>
              {item.maintenanceHistory.length === 0 ? (
                <Text style={detailStyles.noHistory}>Chưa có lịch sử bảo trì</Text>
              ) : (
                item.maintenanceHistory.map((record, i) => (
                  <View key={record.id} style={detailStyles.historyCard}>
                    <View style={detailStyles.historyCardHeader}>
                      <View style={[detailStyles.historyTypeBadge, {
                        backgroundColor: record.type === 'repair' ? Colors.warningLight
                          : record.type === 'replacement' ? Colors.infoLight
                          : Colors.successLight
                      }]}>
                        <Text style={[detailStyles.historyTypeText, {
                          color: record.type === 'repair' ? Colors.warning
                            : record.type === 'replacement' ? Colors.info
                            : Colors.success
                        }]}>{MAINTENANCE_TYPE_LABELS[record.type]}</Text>
                      </View>
                      <Text style={detailStyles.historyDate}>{record.date}</Text>
                    </View>
                    <Text style={detailStyles.historyDesc}>{record.description}</Text>
                    <View style={detailStyles.historyFooter}>
                      <Text style={detailStyles.historyBy}>👤 {record.performedBy}</Text>
                      {record.cost > 0 && (
                        <Text style={detailStyles.historyCost}>{fmt(record.cost)}</Text>
                      )}
                      {record.ticketCode && (
                        <Text style={detailStyles.historyTicket}>#{record.ticketCode}</Text>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>

            {item.notes && (
              <View style={detailStyles.notesBox}>
                <Text style={detailStyles.notesLabel}>Ghi chú</Text>
                <Text style={detailStyles.notesText}>{item.notes}</Text>
              </View>
            )}

            <View style={{ height: 40 }} />
          </View>
        </ScrollView>
      </View>

      {/* Status Picker */}
      {showStatusPicker && (
        <Modal transparent animationType="fade">
          <TouchableOpacity
            style={detailStyles.pickerOverlay}
            onPress={() => setShowStatusPicker(false)}
          >
            <View style={detailStyles.pickerContent}>
              <Text style={detailStyles.pickerTitle}>Cập nhật trạng thái</Text>
              {(Object.entries(STATUS_CONFIG) as [EquipmentStatus, typeof STATUS_CONFIG[EquipmentStatus]][]).map(([key, val]) => (
                <TouchableOpacity
                  key={key}
                  style={[detailStyles.pickerOption, item.status === key && detailStyles.pickerOptionActive]}
                  onPress={() => {
                    onStatusChange(item.id, key);
                    setShowStatusPicker(false);
                    onClose();
                  }}
                >
                  <Text style={detailStyles.pickerOptionIcon}>{val.icon}</Text>
                  <Text style={[detailStyles.pickerOptionText, { color: val.color }]}>{val.label}</Text>
                  {item.status === key && <Text style={detailStyles.pickerCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </Modal>
  );
};

const detailStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  content: {
    backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl, padding: Spacing.xl, maxHeight: '92%',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  title: { fontSize: 18, fontWeight: '800', color: Colors.textPrimary, flex: 1, marginRight: Spacing.md },
  closeBtn: { fontSize: 20, color: Colors.textMuted, padding: 4 },
  idRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full },
  statusIcon: { fontSize: 14 },
  statusText: { fontSize: 13, fontWeight: '700' },
  assetId: { fontSize: 13, fontWeight: '600', color: Colors.textMuted, fontFamily: 'monospace' },
  qrBox: {
    backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.xl,
    padding: Spacing.lg, alignItems: 'center', marginBottom: Spacing.lg,
  },
  qrVisual: { alignItems: 'center', marginBottom: Spacing.sm },
  qrCode: { fontSize: 16, fontWeight: '800', color: Colors.primary, marginTop: 4, letterSpacing: 1 },
  qrHint: { fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },
  section: { marginBottom: Spacing.lg },
  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: Colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.sm,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderColor: Colors.divider,
  },
  infoLabel: { fontSize: 14, color: Colors.textSecondary },
  infoVal: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, textAlign: 'right', flex: 1, marginLeft: Spacing.md },
  statusPickerBtn: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.background, borderRadius: BorderRadius.lg,
    padding: Spacing.base, borderWidth: 1.5, borderColor: Colors.border,
  },
  statusPickerText: { fontSize: 15, fontWeight: '700' },
  statusPickerArrow: { fontSize: 12, color: Colors.textMuted },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  totalCost: { fontSize: 13, fontWeight: '700', color: Colors.error },
  noHistory: { fontSize: 14, color: Colors.textMuted, fontStyle: 'italic' },
  historyCard: {
    backgroundColor: Colors.background, borderRadius: BorderRadius.md,
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  historyCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xs },
  historyTypeBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  historyTypeText: { fontSize: 11, fontWeight: '700' },
  historyDate: { fontSize: 12, color: Colors.textMuted },
  historyDesc: { fontSize: 13, color: Colors.textPrimary, marginBottom: Spacing.sm, lineHeight: 18 },
  historyFooter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  historyBy: { fontSize: 12, color: Colors.textSecondary, flex: 1 },
  historyCost: { fontSize: 13, fontWeight: '700', color: Colors.error },
  historyTicket: { fontSize: 11, color: Colors.primary, fontWeight: '600' },
  notesBox: { backgroundColor: Colors.background, borderRadius: BorderRadius.md, padding: Spacing.md, borderLeftWidth: 3, borderLeftColor: Colors.warning },
  notesLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 4 },
  notesText: { fontSize: 13, color: Colors.textSecondary },
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: Spacing.xl },
  pickerContent: { backgroundColor: Colors.white, borderRadius: BorderRadius.xl, padding: Spacing.xl },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.lg },
  pickerOption: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: BorderRadius.lg, marginBottom: Spacing.sm },
  pickerOptionActive: { backgroundColor: Colors.primaryBg },
  pickerOptionIcon: { fontSize: 18 },
  pickerOptionText: { fontSize: 15, fontWeight: '600', flex: 1 },
  pickerCheck: { fontSize: 16, color: Colors.primary, fontWeight: '800' },
});

// ===================== MAIN COMPONENT =====================
export const EquipmentScreen: React.FC = () => {
  const [equipments, setEquipments] = useState(MOCK_EQUIPMENT);
  const [selectedHouseId, setSelectedHouseId] = useState(MOCK_HOUSES[0].id);
  const [selectedCategory, setSelectedCategory] = useState('Tất cả');
  const [selectedStatus, setSelectedStatus] = useState<'all' | EquipmentStatus>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<EquipmentItem | null>(null);
  const [search, setSearch] = useState('');

  // Add form
  const [newName, setNewName] = useState('');
  const [newRoom, setNewRoom] = useState('');
  const [newCategory, setNewCategory] = useState('Nội thất');
  const [newBrand, setNewBrand] = useState('');

  const filtered = useMemo(() => {
    return equipments.filter(e => {
      const matchHouse = e.houseId === selectedHouseId;
      const matchCat = selectedCategory === 'Tất cả' || e.category === selectedCategory;
      const matchStatus = selectedStatus === 'all' || e.status === selectedStatus;
      const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.assetId.toLowerCase().includes(search.toLowerCase()) ||
        e.qrCode.toLowerCase().includes(search.toLowerCase());
      return matchHouse && matchCat && matchStatus && matchSearch;
    });
  }, [equipments, selectedHouseId, selectedCategory, selectedStatus, search]);

  const groupedByRoom = useMemo(() => {
    const groups: Record<string, EquipmentItem[]> = {};
    filtered.forEach(eq => {
      if (!groups[eq.roomName]) groups[eq.roomName] = [];
      groups[eq.roomName].push(eq);
    });
    return groups;
  }, [filtered]);

  const statusCounts = useMemo(() => {
    const houseEquip = equipments.filter(e => e.houseId === selectedHouseId);
    return {
      all: houseEquip.length,
      active: houseEquip.filter(e => e.status === 'active').length,
      repairing: houseEquip.filter(e => e.status === 'repairing').length,
      damaged: houseEquip.filter(e => e.status === 'damaged').length,
      replaced: houseEquip.filter(e => e.status === 'replaced').length,
      retired: houseEquip.filter(e => e.status === 'retired').length,
    };
  }, [equipments, selectedHouseId]);

  const handleStatusChange = (id: string, status: EquipmentStatus) => {
    setEquipments(prev => prev.map(e => e.id === id ? { ...e, status } : e));
    Alert.alert('✅ Cập nhật thành công', `Trạng thái đã được cập nhật: ${STATUS_CONFIG[status].label}`);
  };

  const handleAdd = () => {
    if (!newName.trim() || !newRoom.trim()) {
      return Alert.alert('Lỗi', 'Vui lòng nhập tên thiết bị và phòng.');
    }
    const assetId = `AST-${new Date().getFullYear()}-${String(equipments.length + 1).padStart(3, '0')}`;
    const qrCode = `QR-${newRoom.toUpperCase().replace(/\s/g, '')}-${Date.now().toString(36).toUpperCase()}`;
    const newEq: EquipmentItem = {
      id: `eq-${Date.now()}`,
      assetId,
      name: newName,
      houseId: selectedHouseId,
      houseName: MOCK_HOUSES.find(h => h.id === selectedHouseId)?.name || '',
      roomName: newRoom,
      category: newCategory,
      brand: newBrand || undefined,
      qrCode,
      status: 'active',
      installationDate: new Date().toLocaleDateString('vi-VN'),
      maintenanceHistory: [],
    };
    setEquipments(prev => [newEq, ...prev]);
    setShowAddModal(false);
    setNewName(''); setNewRoom(''); setNewBrand('');
    Alert.alert('✅ Thêm thành công!', `Thiết bị "${newName}" đã được thêm với mã ${assetId}.`);
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Trang thiết bị</Text>
          <Text style={styles.subtitle}>Tổng: {equipments.filter(e => e.houseId === selectedHouseId).length} thiết bị</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
          <Text style={styles.addBtnText}>+ Thêm</Text>
        </TouchableOpacity>
      </View>

      {/* House Tabs */}
      <View style={styles.houseTabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.houseTabs}>
          {MOCK_HOUSES.map(h => (
            <TouchableOpacity
              key={h.id}
              style={[styles.houseTab, selectedHouseId === h.id && styles.houseTabActive]}
              onPress={() => setSelectedHouseId(h.id)}
            >
              <Text style={styles.houseEmoji}>🏠</Text>
              <Text style={[styles.houseTabText, selectedHouseId === h.id && styles.houseTabTextActive]}>
                {h.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Status Summary */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.statusSummaryRow} contentContainerStyle={styles.statusSummaryContent}>
        {([
          ['all', 'Tất cả'],
          ['active', 'Hoạt động'],
          ['repairing', 'Đang sửa'],
          ['damaged', 'Hỏng'],
        ] as const).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.statusChip,
              selectedStatus === key && styles.statusChipActive,
              key === 'repairing' && statusCounts.repairing > 0 && styles.statusChipWarning,
              key === 'damaged' && statusCounts.damaged > 0 && styles.statusChipDanger,
            ]}
            onPress={() => setSelectedStatus(key)}
          >
            <Text style={[styles.statusChipText,
              selectedStatus === key && styles.statusChipTextActive,
              key === 'repairing' && statusCounts.repairing > 0 && { color: Colors.warning },
              key === 'damaged' && statusCounts.damaged > 0 && { color: Colors.error },
            ]}>
              {label} ({statusCounts[key as keyof typeof statusCounts]})
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍  Tên, mã tài sản, QR code..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* Category filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.filterRow} contentContainerStyle={styles.filterContent}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity
            key={cat}
            style={[styles.filterChip, selectedCategory === cat && styles.filterChipActive]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text style={[styles.filterText, selectedCategory === cat && styles.filterTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Equipment list grouped by room */}
      <ScrollView showsVerticalScrollIndicator={false} style={styles.listContainer}>
        {Object.keys(groupedByRoom).length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 40 }}>📦</Text>
            <Text style={styles.emptyText}>Không tìm thấy thiết bị</Text>
          </View>
        ) : (
          Object.entries(groupedByRoom).map(([room, items]) => (
            <View key={room} style={styles.roomSection}>
              <Text style={styles.roomTitle}>🚪 {room} ({items.length})</Text>
              {items.map(eq => {
                const cfg = STATUS_CONFIG[eq.status];
                return (
                  <TouchableOpacity key={eq.id} style={styles.eqCard} onPress={() => setSelectedItem(eq)}>
                    <View style={styles.eqCardLeft}>
                      <View style={styles.eqTitleRow}>
                        <Text style={styles.eqName}>{eq.name}</Text>
                        {eq.status !== 'active' && (
                          <View style={[styles.statusDot, { backgroundColor: cfg.color + '20', borderColor: cfg.color }]}>
                            <Text style={{ fontSize: 10 }}>{cfg.icon}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.eqAssetId}>#{eq.assetId} · {eq.category}</Text>
                      {eq.currentTenantName && (
                        <Text style={styles.eqTenant}>👤 {eq.currentTenantName}</Text>
                      )}
                    </View>
                    <View style={styles.eqCardRight}>
                      <View style={[styles.eqStatus, { backgroundColor: cfg.bg }]}>
                        <Text style={[styles.eqStatusText, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                      {eq.warrantyExpiry && (
                        <Text style={styles.eqWarranty}>🛡 {eq.warrantyExpiry}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Detail Modal */}
      {selectedItem && (
        <EquipmentDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* Add Modal */}
      {showAddModal && (
        <Modal transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Thêm thiết bị mới</Text>
              <Text style={styles.modalSubtitle}>
                {MOCK_HOUSES.find(h => h.id === selectedHouseId)?.name}
              </Text>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Tên thiết bị *</Text>
                <TextInput style={styles.input} value={newName} onChangeText={setNewName} placeholder="Điều hòa Daikin 9000BTU..." />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Phòng / Khu vực *</Text>
                <TextInput style={styles.input} value={newRoom} onChangeText={setNewRoom} placeholder="P101 / Khu vực chung..." />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Hãng sản xuất</Text>
                <TextInput style={styles.input} value={newBrand} onChangeText={setNewBrand} placeholder="Daikin, Panasonic..." />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Danh mục</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.categoryRow}>
                    {['Điện lạnh', 'Điện nước', 'Nội thất', 'Thiết bị', 'Hạ tầng'].map(c => (
                      <TouchableOpacity
                        key={c}
                        style={[styles.catChip, newCategory === c && styles.catChipActive]}
                        onPress={() => setNewCategory(c)}
                      >
                        <Text style={[styles.catChipText, newCategory === c && { color: Colors.white }]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
              <View style={{ flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.lg }}>
                <TouchableOpacity style={[styles.cancelBtn, { flex: 1 }]} onPress={() => setShowAddModal(false)}>
                  <Text style={styles.cancelBtnText}>Hủy</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.submitBtn, { flex: 2 }]} onPress={handleAdd}>
                  <Text style={styles.submitBtnText}>Thêm thiết bị</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.lg, paddingTop: Spacing.xl },
  title: { fontSize: 24, fontWeight: '800', color: Colors.textPrimary },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  addBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: BorderRadius.lg },
  addBtnText: { color: Colors.white, fontWeight: '700', fontSize: 13 },
  houseTabsContainer: { borderBottomWidth: 1, borderColor: Colors.divider, backgroundColor: Colors.white },
  houseTabs: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.md },
  houseTab: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.background, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, gap: 6 },
  houseTabActive: { backgroundColor: Colors.primaryBg, borderColor: Colors.primary },
  houseEmoji: { fontSize: 16 },
  houseTabText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  houseTabTextActive: { color: Colors.primary },
  statusSummaryRow: { maxHeight: 46 },
  statusSummaryContent: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.sm },
  statusChip: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  statusChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  statusChipWarning: { borderColor: Colors.warning },
  statusChipDanger: { borderColor: Colors.error },
  statusChipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  statusChipTextActive: { color: Colors.white },
  searchContainer: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  searchInput: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.md, fontSize: 14, color: Colors.textPrimary, ...Shadow.sm },
  filterRow: { maxHeight: 48 },
  filterContent: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.sm },
  filterChip: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  filterTextActive: { color: Colors.white },
  listContainer: { flex: 1 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: Spacing.md },
  emptyText: { fontSize: 14, color: Colors.textSecondary },
  roomSection: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  roomTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  eqCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', backgroundColor: Colors.white, borderRadius: BorderRadius.md, padding: Spacing.base, marginBottom: Spacing.sm, ...Shadow.sm },
  eqCardLeft: { flex: 1 },
  eqCardRight: { alignItems: 'flex-end', gap: Spacing.xs },
  eqTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 2 },
  eqName: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, flex: 1 },
  statusDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  eqAssetId: { fontSize: 11, color: Colors.textMuted, marginBottom: 2 },
  eqTenant: { fontSize: 11, color: Colors.primary, fontWeight: '500' },
  eqStatus: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  eqStatusText: { fontSize: 11, fontWeight: '600' },
  eqWarranty: { fontSize: 10, color: Colors.textMuted },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Colors.white, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.xl, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: Colors.textPrimary },
  modalSubtitle: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.lg, marginTop: 2 },
  inputGroup: { marginBottom: Spacing.md },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: 4 },
  input: { backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: 15, color: Colors.textPrimary },
  categoryRow: { flexDirection: 'row', gap: Spacing.sm },
  catChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  catChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  catChipText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  cancelBtn: { backgroundColor: Colors.background, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: Colors.textSecondary },
  submitBtn: { backgroundColor: Colors.primary, padding: Spacing.md, borderRadius: BorderRadius.lg, alignItems: 'center' },
  submitBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
});
