import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Image,
  ScrollView, TextInput, ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, Shadow } from '../../constants';
import { Equipment } from '../../types';
import { formatDate } from '../../utils';

// Dữ liệu mẫu thiết bị — đồng bộ với web mockData.ts (MOCK_EQUIPMENTS)
const MOCK_EQUIPMENT_DB: Record<string, Equipment> = {
  'EQ-101-AC': {
    id: 'eq1', assetId: 'EQ-101-AC', name: 'Điều hòa Daikin 9000BTU',
    houseId: 'prop-1', houseName: 'Nhà Nguyễn Trãi',
    roomId: 'r1', roomName: 'Phòng P101',
    category: 'Điện lạnh', qrCode: 'EQ-101-AC',
    status: 'active', brand: 'Daikin', model: 'FTKA25UAVMV',
    serialNumber: 'SN-EQ101AC-EQ1',
    purchasePrice: 8500000, purchaseDate: '2025-01-10',
    installationDate: '2025-01-15',
    warrantyExpiry: '2028-01-15',
    lastMaintenanceAt: '2026-03-18',
    maintenanceHistory: [
      { id: 'mh1', date: '2026-03-18', type: 'maintenance', description: 'Vệ sinh lưới lọc, kiểm tra gas', cost: 250000, performedBy: 'Kỹ thuật viên Daikin' },
      { id: 'mh2', date: '2025-09-10', type: 'maintenance', description: 'Bơm gas, kiểm tra định kỳ', cost: 350000, performedBy: 'Kỹ thuật viên Daikin' },
    ],
    images: [],
    notes: 'Sử dụng chế độ Eco để tiết kiệm điện. Nhiệt độ khuyến nghị 26-28°C.',
  },
  'EQ-101-WM': {
    id: 'eq2', assetId: 'EQ-101-WM', name: 'Máy giặt Toshiba 8kg',
    houseId: 'prop-1', houseName: 'Nhà Nguyễn Trãi',
    roomId: 'r1', roomName: 'Phòng P101',
    category: 'Điện lạnh', qrCode: 'EQ-101-WM',
    status: 'active', brand: 'Toshiba', model: 'TW-BH85S2V',
    serialNumber: 'SN-EQ101WM-EQ2',
    purchasePrice: 4500000, purchaseDate: '2025-01-10',
    installationDate: '2025-01-15',
    warrantyExpiry: '2027-01-15',
    lastMaintenanceAt: '2025-12-01',
    maintenanceHistory: [],
    images: [],
    notes: 'Không giặt quá 8kg. Vệ sinh lưới lọc mỗi tháng.',
  },
  'EQ-102-AC': {
    id: 'eq3', assetId: 'EQ-102-AC', name: 'Điều hòa Panasonic 9000BTU',
    houseId: 'prop-1', houseName: 'Nhà Nguyễn Trãi',
    roomId: 'r2', roomName: 'Phòng P102',
    category: 'Điện lạnh', qrCode: 'EQ-102-AC',
    status: 'repairing', brand: 'Panasonic', model: 'CU/CS-PU9WKH-8',
    serialNumber: 'SN-EQ102AC-EQ3',
    purchasePrice: 8200000, purchaseDate: '2025-01-10',
    installationDate: '2025-01-15',
    warrantyExpiry: '2028-01-15',
    lastMaintenanceAt: '2026-04-28',
    maintenanceHistory: [
      { id: 'mh3', date: '2026-04-28', type: 'repair', description: 'Báo lỗi E4 — thợ đang kiểm tra board mạch', cost: 500000, performedBy: 'Trung tâm bảo hành Panasonic' },
    ],
    images: [],
    notes: 'Đang trong quá trình sửa chữa. Liên hệ quản lý nếu cần hỗ trợ.',
  },
  'EQ-103-FR': {
    id: 'eq4', assetId: 'EQ-103-FR', name: 'Tủ lạnh Aqua 130L',
    houseId: 'prop-1', houseName: 'Nhà Nguyễn Trãi',
    roomId: 'r3', roomName: 'Phòng P103',
    category: 'Điện lạnh', qrCode: 'EQ-103-FR',
    status: 'damaged', brand: 'Aqua', model: 'AQR-T150FA',
    serialNumber: 'SN-EQ103FR-EQ4',
    purchasePrice: 3200000, purchaseDate: '2025-01-10',
    installationDate: '2025-01-15',
    warrantyExpiry: '2027-01-15',
    lastMaintenanceAt: undefined,
    maintenanceHistory: [],
    images: [],
    notes: 'Thiết bị đang hỏng — không làm lạnh. Đã báo cáo quản lý.',
  },
  'EQ-C-WM01': {
    id: 'eq5', assetId: 'EQ-C-WM01', name: 'Máy giặt chung khu A',
    houseId: 'prop-1', houseName: 'Nhà Nguyễn Trãi',
    roomId: undefined, roomName: 'Khu vực chung',
    category: 'Điện lạnh', qrCode: 'EQ-C-WM01',
    status: 'active', brand: 'Samsung', model: 'WW10T534DAW',
    serialNumber: 'SN-EQCWM01-EQ5',
    purchasePrice: 7500000, purchaseDate: '2025-01-10',
    installationDate: '2025-01-15',
    warrantyExpiry: '2028-01-15',
    lastMaintenanceAt: '2026-02-01',
    maintenanceHistory: [],
    images: [],
    notes: 'Máy giặt dùng chung. Vui lòng không giặt đồ quá 10kg mỗi lần.',
  },
  'EQ-201-AC': {
    id: 'eq6', assetId: 'EQ-201-AC', name: 'Điều hòa Casper 9000BTU',
    houseId: 'prop-2', houseName: 'Nhà Lê Văn Sỹ',
    roomId: 'r7', roomName: 'Phòng P201',
    category: 'Điện lạnh', qrCode: 'EQ-201-AC',
    status: 'active', brand: 'Casper', model: 'IC-09TL32',
    serialNumber: 'SN-EQ201AC-EQ6',
    purchasePrice: 5500000, purchaseDate: '2025-10-15',
    installationDate: '2025-10-20',
    warrantyExpiry: '2028-10-20',
    lastMaintenanceAt: '2026-01-15',
    maintenanceHistory: [],
    images: [],
    notes: 'Nhiệt độ khuyến nghị 26-28°C. Tắt khi ra ngoài quá 30 phút.',
  },
};

type ScanState = 'scanning' | 'equipment_detail' | 'report_form';

const STATUS_LABEL: Record<string, string> = {
  active: 'Hoạt động tốt',
  repairing: 'Đang sửa chữa',
  damaged: 'Hỏng hóc',
  replaced: 'Đã thay thế',
  retired: 'Đã thanh lý',
};

const STATUS_COLOR: Record<string, string> = {
  active: Colors.success,
  repairing: Colors.warning,
  damaged: Colors.error,
  replaced: Colors.textMuted,
  retired: Colors.textMuted,
};

export const ScanScreen: React.FC = () => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanState, setScanState] = useState<ScanState>('scanning');
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [reportDescription, setReportDescription] = useState('');
  const [reportImages, setReportImages] = useState<string[]>([]);
  const [reportCategory, setReportCategory] = useState('');
  const [activeTab, setActiveTab] = useState<'info' | 'warranty' | 'usage' | 'history'>('info');
  const [analyzingImage, setAnalyzingImage] = useState(false);

  const navigation = useNavigation<any>();

  if (!permission) return <View />;

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionEmoji}>📷</Text>
        <Text style={styles.permissionTitle}>Cần quyền Camera</Text>
        <Text style={styles.permissionDesc}>
          Chúng tôi cần quyền Camera để quét mã QR trên thiết bị trong phòng của bạn.
        </Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Cấp quyền Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Parse both formats:
  //   slms://tenant/maintenance-report?assetId=eq1&qr=EQ-101-AC  (web QR)
  //   EQ-101-AC  (raw code, fallback)
  const resolveEquipmentCode = (raw: string): string => {
    if (raw.startsWith('slms://')) {
      try {
        const qs = raw.split('?')[1] ?? '';
        const params = Object.fromEntries(qs.split('&').map(p => p.split('=')));
        return decodeURIComponent(params['qr'] ?? '');
      } catch { return ''; }
    }
    return raw;
  };

  const handleBarCodeScanned = ({ data }: { type: string; data: string }) => {
    if (scannedCode) return;
    setScannedCode(data);

    const code = resolveEquipmentCode(data);
    const found = MOCK_EQUIPMENT_DB[code];
    if (found) {
      setEquipment(found);
      setScanState('equipment_detail');
    } else {
      Alert.alert(
        'Không nhận ra mã QR',
        `Mã "${code || data}" không thuộc thiết bị nào trong hệ thống. Vui lòng quét lại hoặc liên hệ quản lý.`,
        [{ text: 'Quét lại', onPress: resetScan }]
      );
    }
  };

  const resetScan = () => {
    setScannedCode(null);
    setEquipment(null);
    setScanState('scanning');
    setReportDescription('');
    setReportImages([]);
    setReportCategory('');
    setActiveTab('info');
  };

  const pickImageToScan = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Cần quyền truy cập', 'Vui lòng cấp quyền truy cập thư viện ảnh để sử dụng tính năng này.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (result.canceled || !result.assets[0]) return;

    setAnalyzingImage(true);
    // Simulate QR decoding from image (1.2s delay for realism)
    setTimeout(() => {
      setAnalyzingImage(false);
      const mockCode = 'EQ-101-AC';
      const found = MOCK_EQUIPMENT_DB[mockCode];
      if (found) {
        setScannedCode(mockCode);
        setEquipment(found);
        setScanState('equipment_detail');
      } else {
        Alert.alert('Không tìm thấy mã QR', 'Không nhận diện được mã QR trong ảnh. Vui lòng chụp rõ hơn hoặc quét trực tiếp.', [{ text: 'Thử lại' }]);
      }
    }, 1200);
  };

  const pickImage = async () => {
    if (reportImages.length >= 3) { Alert.alert('Giới hạn', 'Tối đa 3 ảnh.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (!result.canceled && result.assets[0]) {
      setReportImages(prev => [...prev, result.assets[0].uri]);
    }
  };

  const takePhoto = async () => {
    if (reportImages.length >= 3) { Alert.alert('Giới hạn', 'Tối đa 3 ảnh.'); return; }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.6 });
    if (!result.canceled && result.assets[0]) {
      setReportImages(prev => [...prev, result.assets[0].uri]);
    }
  };

  const handleSubmitReport = () => {
    if (!reportDescription.trim()) {
      Alert.alert('Lỗi', 'Vui lòng mô tả sự cố.');
      return;
    }
    Alert.alert(
      'Báo hỏng thành công! 🔧',
      `Đã gửi báo cáo sự cố cho thiết bị ${equipment?.name}. Quản lý sẽ sớm liên hệ.`,
      [{
        text: 'Xem yêu cầu sửa chữa',
        onPress: () => {
          resetScan();
          navigation.navigate('TenantTabs', { screen: 'MaintenanceList' });
        },
      }]
    );
  };

  // ===== SCANNING VIEW =====
  if (scanState === 'scanning') {
    return (
      <View style={styles.scanContainer}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={handleBarCodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        >
          <View style={styles.scanOverlay}>
            <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>

            <Text style={styles.scanTitle}>Quét mã QR thiết bị</Text>

            <View style={styles.scanFrame}>
              <View style={[styles.scanCorner, styles.scanCornerTL]} />
              <View style={[styles.scanCorner, styles.scanCornerTR]} />
              <View style={[styles.scanCorner, styles.scanCornerBL]} />
              <View style={[styles.scanCorner, styles.scanCornerBR]} />
            </View>

            <Text style={styles.scanHint}>
              Hướng camera vào mã QR dán trên thiết bị để xem thông tin và báo hỏng
            </Text>

            <View style={styles.scanDividerRow}>
              <View style={styles.scanDividerLine} />
              <Text style={styles.scanDividerText}>hoặc</Text>
              <View style={styles.scanDividerLine} />
            </View>

            <TouchableOpacity style={styles.pickImageBtn} onPress={pickImageToScan}>
              <Text style={styles.pickImageBtnIcon}>🖼️</Text>
              <Text style={styles.pickImageBtnText}>Chọn ảnh từ thư viện</Text>
            </TouchableOpacity>
          </View>
        </CameraView>

        {analyzingImage && (
          <View style={styles.analyzingOverlay}>
            <ActivityIndicator size="large" color={Colors.white} />
            <Text style={styles.analyzingText}>Đang nhận diện mã QR...</Text>
          </View>
        )}
      </View>
    );
  }

  // ===== EQUIPMENT DETAIL VIEW =====
  if (scanState === 'equipment_detail' && equipment) {
    const statusColor = STATUS_COLOR[equipment.status] || Colors.textMuted;
    const isWarrantyValid = equipment.warrantyExpiry
      ? new Date(equipment.warrantyExpiry) > new Date()
      : false;
    const warrantyDaysLeft = equipment.warrantyExpiry
      ? Math.ceil((new Date(equipment.warrantyExpiry).getTime() - Date.now()) / 86400000)
      : 0;

    return (
      <ScrollView style={styles.detailContainer} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.detailHeader}>
          <View style={styles.equipmentIconWrap}>
            <Text style={{ fontSize: 40 }}>⚙️</Text>
          </View>
          <Text style={styles.equipmentName}>{equipment.name}</Text>
          <Text style={styles.equipmentCode}>{equipment.assetId}</Text>
          <View style={[styles.eqStatusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.eqStatusText, { color: statusColor }]}>
              {STATUS_LABEL[equipment.status]}
            </Text>
          </View>
          <Text style={styles.locationText}>📍 {equipment.roomName} · {equipment.houseName}</Text>
        </View>

        {/* Tab Navigation */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {[
            { key: 'info', label: '📋 Thông tin' },
            { key: 'warranty', label: '🛡️ Bảo hành' },
            { key: 'usage', label: '📖 Hướng dẫn' },
            { key: 'history', label: '🔧 Lịch sử' },
          ].map(tab => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key as any)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Tab: Thông tin */}
        {activeTab === 'info' && (
          <View style={styles.tabContent}>
            {[
              { label: 'Hãng sản xuất', value: equipment.brand || 'Không rõ' },
              { label: 'Model', value: equipment.model || 'Không rõ' },
              { label: 'Số serial', value: equipment.serialNumber || 'Không rõ' },
              { label: 'Ngày mua', value: equipment.purchaseDate ? formatDate(equipment.purchaseDate) : 'Không rõ' },
              { label: 'Ngày lắp đặt', value: formatDate(equipment.installationDate) },
              { label: 'Bảo trì gần nhất', value: equipment.lastMaintenanceAt ? formatDate(equipment.lastMaintenanceAt) : 'Chưa có' },
            ].map((row, i) => (
              <View key={i} style={styles.infoRow}>
                <Text style={styles.infoLabel}>{row.label}</Text>
                <Text style={styles.infoValue}>{row.value}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Tab: Bảo hành */}
        {activeTab === 'warranty' && (
          <View style={styles.tabContent}>
            <View style={[styles.warrantyCard, { backgroundColor: isWarrantyValid ? Colors.successLight : Colors.errorLight }]}>
              <Text style={{ fontSize: 36 }}>{isWarrantyValid ? '🛡️' : '⚠️'}</Text>
              <Text style={[styles.warrantyStatus, { color: isWarrantyValid ? Colors.success : Colors.error }]}>
                {isWarrantyValid ? 'Còn bảo hành' : 'Hết bảo hành'}
              </Text>
              {equipment.warrantyExpiry && (
                <Text style={styles.warrantyDate}>
                  Hạn bảo hành: {formatDate(equipment.warrantyExpiry)}
                </Text>
              )}
              {isWarrantyValid && warrantyDaysLeft > 0 && (
                <Text style={styles.warrantyDays}>Còn {warrantyDaysLeft} ngày</Text>
              )}
            </View>
            {isWarrantyValid && (
              <View style={styles.warrantyNote}>
                <Text style={styles.warrantyNoteText}>
                  💡 Thiết bị còn trong thời hạn bảo hành. Nếu có sự cố do lỗi kỹ thuật, chi phí sửa chữa sẽ do nhà sản xuất chịu.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Tab: Hướng dẫn sử dụng */}
        {activeTab === 'usage' && (
          <View style={styles.tabContent}>
            <View style={styles.usageCard}>
              <Text style={styles.usageTitle}>Hướng dẫn sử dụng</Text>
              {equipment.notes ? (
                <Text style={styles.usageText}>{equipment.notes}</Text>
              ) : (
                <Text style={styles.usageEmpty}>Chưa có hướng dẫn sử dụng cho thiết bị này.</Text>
              )}
            </View>
            <View style={styles.usageTips}>
              <Text style={styles.tipsTitle}>💡 Lưu ý chung</Text>
              <Text style={styles.tipItem}>• Không tự ý sửa chữa thiết bị</Text>
              <Text style={styles.tipItem}>• Báo ngay khi phát hiện sự cố</Text>
              <Text style={styles.tipItem}>• Vệ sinh định kỳ theo hướng dẫn</Text>
              <Text style={styles.tipItem}>• Tắt thiết bị khi không sử dụng</Text>
            </View>
          </View>
        )}

        {/* Tab: Lịch sử bảo trì */}
        {activeTab === 'history' && (
          <View style={styles.tabContent}>
            {equipment.maintenanceHistory.length === 0 ? (
              <View style={styles.emptyHistory}>
                <Text style={styles.emptyHistoryText}>Chưa có lịch sử bảo trì</Text>
              </View>
            ) : (
              equipment.maintenanceHistory.map((rec, i) => (
                <View key={i} style={styles.historyItem}>
                  <View style={styles.historyLeft}>
                    <Text style={{ fontSize: 16 }}>
                      {rec.type === 'repair' ? '🔧' : rec.type === 'maintenance' ? '🛠️' : '🔄'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyDesc}>{rec.description}</Text>
                    <Text style={styles.historyMeta}>
                      {formatDate(rec.date)} · {rec.performedBy}
                    </Text>
                    <Text style={styles.historyCost}>Chi phí: {rec.cost.toLocaleString('vi-VN')} đ</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}

        {/* Nút báo hỏng */}
        <View style={styles.reportBtnSection}>
          <TouchableOpacity
            style={styles.reportBtn}
            onPress={() => setScanState('report_form')}
          >
            <Text style={styles.reportBtnText}>🚨 Báo hỏng thiết bị này</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.rescanBtn} onPress={resetScan}>
            <Text style={styles.rescanBtnText}>📷 Quét thiết bị khác</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ===== REPORT FORM =====
  if (scanState === 'report_form' && equipment) {
    return (
      <ScrollView style={styles.reportContainer} contentContainerStyle={{ padding: Spacing.lg }}>
        <TouchableOpacity onPress={() => setScanState('equipment_detail')} style={{ marginBottom: Spacing.md }}>
          <Text style={styles.backLink}>← Quay lại thông tin thiết bị</Text>
        </TouchableOpacity>

        <Text style={styles.reportTitle}>🚨 Báo hỏng thiết bị</Text>

        <View style={styles.deviceCard}>
          <Text style={styles.deviceCardLabel}>Thiết bị báo hỏng</Text>
          <Text style={styles.deviceCardName}>{equipment.name}</Text>
          <Text style={styles.deviceCardCode}>{equipment.assetId} · {equipment.roomName}</Text>
        </View>

        <Text style={styles.fieldLabel}>Loại sự cố</Text>
        <View style={styles.issueTypes}>
          {['Không hoạt động', 'Hoạt động bất thường', 'Rò rỉ / hư hỏng bên ngoài', 'Tiếng ồn lạ', 'Khác'].map(type => (
            <TouchableOpacity
              key={type}
              style={[styles.issueTypeBtn, reportCategory === type && styles.issueTypeBtnActive]}
              onPress={() => setReportCategory(type)}
            >
              <Text style={[styles.issueTypeBtnText, reportCategory === type && styles.issueTypeBtnTextActive]}>
                {type}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Mô tả chi tiết sự cố</Text>
        <TextInput
          style={styles.reportInput}
          placeholder="Ví dụ: Điều hòa không mát, kêu to bất thường từ hôm qua..."
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          value={reportDescription}
          onChangeText={setReportDescription}
        />

        <Text style={styles.fieldLabel}>Ảnh hiện trạng (tối đa 3 ảnh)</Text>
        <View style={styles.imageButtons}>
          <TouchableOpacity style={styles.imageBtn} onPress={takePhoto}>
            <Text style={{ fontSize: 20 }}>📷</Text>
            <Text style={styles.imageBtnText}>Chụp ảnh</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.imageBtn} onPress={pickImage}>
            <Text style={{ fontSize: 20 }}>🖼️</Text>
            <Text style={styles.imageBtnText}>Thư viện</Text>
          </TouchableOpacity>
        </View>

        {reportImages.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
            {reportImages.map((uri, i) => (
              <Image key={i} source={{ uri }} style={styles.reportPreview} />
            ))}
          </ScrollView>
        )}

        <TouchableOpacity
          style={[styles.submitReportBtn, !reportDescription.trim() && styles.submitReportBtnDisabled]}
          onPress={handleSubmitReport}
          disabled={!reportDescription.trim()}
        >
          <Text style={styles.submitReportBtnText}>Gửi báo cáo sự cố</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  // Permission
  permissionContainer: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  permissionEmoji: { fontSize: 48, marginBottom: Spacing.base },
  permissionTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  permissionDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xl },
  permissionBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg },
  permissionBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },

  // Scanning
  scanContainer: { flex: 1, backgroundColor: '#000' },
  scanOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  scanTitle: { fontSize: 20, fontWeight: '700', color: Colors.white, marginBottom: Spacing['2xl'] },
  scanFrame: { width: 240, height: 240, position: 'relative', marginBottom: Spacing['2xl'] },
  scanCorner: { position: 'absolute', width: 30, height: 30, borderColor: Colors.primary, borderWidth: 3 },
  scanCornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  scanCornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  scanCornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  scanCornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  scanHint: { fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xl },
  closeBtn: { position: 'absolute', top: 52, left: Spacing.lg, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  scanDividerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.lg, width: '70%' },
  scanDividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
  scanDividerText: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  pickImageBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.full, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  pickImageBtnIcon: { fontSize: 18 },
  pickImageBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  analyzingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  analyzingText: { color: Colors.white, fontSize: 15, fontWeight: '600' },

  // Equipment Detail
  detailContainer: { flex: 1, backgroundColor: Colors.background },
  detailHeader: { backgroundColor: Colors.primary, padding: Spacing.xl, alignItems: 'center', paddingTop: 60 },
  equipmentIconWrap: { width: 80, height: 80, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  equipmentName: { fontSize: 20, fontWeight: '800', color: Colors.white, textAlign: 'center' },
  equipmentCode: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  eqStatusBadge: { marginTop: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.full },
  eqStatusText: { fontSize: 12, fontWeight: '700' },
  locationText: { marginTop: Spacing.sm, fontSize: 13, color: 'rgba(255,255,255,0.8)' },

  tabRow: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm },
  tab: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  tabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  tabTextActive: { color: Colors.white },

  tabContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  infoLabel: { fontSize: 13, color: Colors.textMuted },
  infoValue: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

  warrantyCard: { borderRadius: BorderRadius.xl, padding: Spacing.xl, alignItems: 'center', marginBottom: Spacing.md },
  warrantyStatus: { fontSize: 20, fontWeight: '800', marginTop: Spacing.sm },
  warrantyDate: { fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  warrantyDays: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  warrantyNote: { backgroundColor: Colors.successLight, borderRadius: BorderRadius.md, padding: Spacing.md },
  warrantyNoteText: { fontSize: 13, color: Colors.success, lineHeight: 20 },

  usageCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.md, ...Shadow.sm },
  usageTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  usageText: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22 },
  usageEmpty: { fontSize: 14, color: Colors.textMuted, fontStyle: 'italic' },
  usageTips: { backgroundColor: Colors.primaryBg, borderRadius: BorderRadius.lg, padding: Spacing.base },
  tipsTitle: { fontSize: 14, fontWeight: '700', color: Colors.primary, marginBottom: Spacing.sm },
  tipItem: { fontSize: 14, color: Colors.textSecondary, lineHeight: 24 },

  historyItem: { flexDirection: 'row', gap: Spacing.md, paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  historyLeft: { width: 32, alignItems: 'center', paddingTop: 4 },
  historyDesc: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary, marginBottom: 4 },
  historyMeta: { fontSize: 12, color: Colors.textMuted },
  historyCost: { fontSize: 12, color: Colors.primary, marginTop: 2 },
  emptyHistory: { padding: Spacing.xl, alignItems: 'center' },
  emptyHistoryText: { fontSize: 14, color: Colors.textMuted },

  reportBtnSection: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 60 },
  reportBtn: { backgroundColor: Colors.error, borderRadius: BorderRadius.lg, paddingVertical: Spacing.base, alignItems: 'center', ...Shadow.md },
  reportBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  rescanBtn: { borderRadius: BorderRadius.lg, paddingVertical: Spacing.md, alignItems: 'center', borderWidth: 1.5, borderColor: Colors.primary },
  rescanBtnText: { fontSize: 14, fontWeight: '700', color: Colors.primary },

  // Report Form
  reportContainer: { flex: 1, backgroundColor: Colors.background },
  backLink: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  reportTitle: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary, marginBottom: Spacing.lg },
  deviceCard: { backgroundColor: Colors.white, borderRadius: BorderRadius.lg, padding: Spacing.base, marginBottom: Spacing.lg, ...Shadow.sm, borderWidth: 1, borderColor: Colors.error + '40' },
  deviceCardLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
  deviceCardName: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  deviceCardCode: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  fieldLabel: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  issueTypes: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  issueTypeBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  issueTypeBtnActive: { backgroundColor: Colors.error, borderColor: Colors.error },
  issueTypeBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  issueTypeBtnTextActive: { color: Colors.white },
  reportInput: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.md, fontSize: 15, height: 120, marginBottom: Spacing.lg, color: Colors.textPrimary },
  imageButtons: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  imageBtn: { flex: 1, backgroundColor: Colors.white, borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed' },
  imageBtnText: { fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  reportPreview: { width: 80, height: 80, borderRadius: BorderRadius.md, marginRight: Spacing.sm },
  submitReportBtn: { backgroundColor: Colors.error, borderRadius: BorderRadius.lg, paddingVertical: Spacing.base, alignItems: 'center', ...Shadow.md, marginBottom: 40 },
  submitReportBtnDisabled: { backgroundColor: Colors.textMuted },
  submitReportBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
});
