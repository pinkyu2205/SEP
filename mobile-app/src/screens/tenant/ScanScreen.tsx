import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius } from '../../constants';
import { MOCK_EQUIPMENT_DB } from '../../store/equipmentStore';

const parseParams = (raw: string): Record<string, string> => {
  try {
    const qs = raw.split('?')[1] ?? '';
    return Object.fromEntries(
      qs.split('&').filter(Boolean).map(p => {
        const [k, v = ''] = p.split('=');
        return [k, decodeURIComponent(v)];
      }),
    );
  } catch { return {}; }
};

// QR tem thiết bị (web sinh):
//   slms://maintenance/new?equipmentId=123&roomId=45&name=...&cat=...
// → mở thẳng màn tạo yêu cầu bảo trì với phòng + thiết bị điền sẵn.
const parseMaintenanceQr = (raw: string): { equipmentId: string; roomId?: string; name?: string; cat?: string } | null => {
  if (!raw.startsWith('slms://maintenance/new')) return null;
  const p = parseParams(raw);
  if (!p['equipmentId']) return null;
  return { equipmentId: p['equipmentId'], roomId: p['roomId'], name: p['name'], cat: p['cat'] };
};

// Định dạng cũ (mock):
//   slms://tenant/maintenance-report?assetId=eq1&qr=EQ-101-AC  hoặc  EQ-101-AC
const resolveEquipmentCode = (raw: string): string => {
  if (raw.startsWith('slms://')) return parseParams(raw)['qr'] ?? '';
  return raw;
};

export const ScanScreen: React.FC = () => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedCode, setScannedCode] = useState<string | null>(null);
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

  const handleBarCodeScanned = ({ data }: { type: string; data: string }) => {
    if (scannedCode) return;
    setScannedCode(data);

    // 1) QR tem thiết bị thật → mở màn tạo yêu cầu bảo trì (điền sẵn phòng + thiết bị)
    const mqr = parseMaintenanceQr(data);
    if (mqr) {
      navigation.replace('MaintenanceCreate', {
        equipment: {
          id: mqr.equipmentId,
          roomId: mqr.roomId,
          name: mqr.name || 'Thiết bị',
          category: mqr.cat || mqr.name || 'Khác',
        },
      });
      return;
    }

    // 2) Định dạng cũ (mock) → mở chi tiết thiết bị demo
    const code = resolveEquipmentCode(data);
    const found = MOCK_EQUIPMENT_DB[code];
    if (found) {
      navigation.replace('EquipmentDetail', { equipment: found });
    } else {
      Alert.alert(
        'Không tìm thấy thiết bị',
        `Mã "${code || data}" không thuộc thiết bị nào trong hệ thống. Vui lòng quét lại hoặc liên hệ quản lý.`,
        [{ text: 'Quét lại', onPress: () => setScannedCode(null) }]
      );
    }
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
        navigation.replace('EquipmentDetail', { equipment: found });
      } else {
        Alert.alert('Không tìm thấy mã QR', 'Không nhận diện được mã QR trong ảnh. Vui lòng chụp rõ hơn hoặc quét trực tiếp.', [{ text: 'Thử lại' }]);
      }
    }, 1200);
  };

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
};

const styles = StyleSheet.create({
  permissionContainer: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  permissionEmoji: { fontSize: 48, marginBottom: Spacing.base },
  permissionTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  permissionDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xl },
  permissionBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.lg },
  permissionBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },

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
});
