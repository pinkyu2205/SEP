import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius } from '@/constants';
import { realTenantEquipmentService } from '@/services/tenant/equipmentService';

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

// QR dán trực tiếp trên thiết bị (BE sinh, dạng "EQ-<id>") — tra cứu qua API thật.
const resolveEquipmentCode = (raw: string): string => {
  if (raw.startsWith('slms://')) return parseParams(raw)['qr'] ?? '';
  return raw;
};

export const ScanScreen: React.FC = () => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
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

  const handleBarCodeScanned = async ({ data }: { type: string; data: string }) => {
    if (scannedCode) return;
    setScannedCode(data);

    // 1) QR tem thiết bị dạng deep-link (web sinh) → mở thẳng màn báo hỏng, điền sẵn phòng + thiết bị.
    const mqr = parseMaintenanceQr(data);
    if (mqr) {
      const idNum = Number(mqr.equipmentId);
      const roomIdNum = Number(mqr.roomId);
      navigation.replace('MaintenanceCreate', {
        equipment: {
          id: Number.isFinite(idNum) ? idNum : undefined,
          roomId: Number.isFinite(roomIdNum) ? roomIdNum : undefined,
          equipmentName: mqr.name || 'Thiết bị',
          catalogName: mqr.name,
        },
      });
      return;
    }

    // 2) QR dán trên thiết bị thật (dạng "EQ-<id>") → tra cứu qua API, mở chi tiết thiết bị.
    const code = resolveEquipmentCode(data);
    setVerifying(true);
    try {
      const equipment = await realTenantEquipmentService.getByQrCode(code || data);
      navigation.replace('EquipmentDetail', { equipment });
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.response?.data?.message
        || `Mã "${code || data}" không thuộc thiết bị nào trong phòng bạn đang thuê.`;
      Alert.alert('Không tìm thấy thiết bị', msg, [
        { text: 'Quét lại', onPress: () => setScannedCode(null) },
        // QR lỗi/mờ/không đọc được — dẫn thẳng sang danh sách thiết bị của tenant để
        // chọn thay vì phải quét lại nhiều lần hoặc bí đường.
        { text: 'Chọn từ danh sách thiết bị', onPress: () => navigation.replace('RoomEquipment') },
      ]);
    } finally {
      setVerifying(false);
    }
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
        </View>
      </CameraView>

      {verifying && (
        <View style={styles.analyzingOverlay}>
          <ActivityIndicator size="large" color={Colors.white} />
          <Text style={styles.analyzingText}>Đang tra cứu thiết bị...</Text>
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
  analyzingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  analyzingText: { color: Colors.white, fontSize: 15, fontWeight: '600' },
});
