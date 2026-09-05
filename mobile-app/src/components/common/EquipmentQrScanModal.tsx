import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors, Spacing } from '@/constants';

interface Props {
  visible: boolean;
  title?: string;
  hint?: string;
  /** Bắn đúng 1 lần mỗi lần mở modal — modal tự đóng ngay sau đó, cha tự quyết định khớp/không khớp. */
  onScan: (rawData: string) => void;
  onClose: () => void;
}

/**
 * Modal quét QR dùng chung cho các gate "so khớp đúng thiết bị" phía app (xác nhận có
 * mặt, bắt đầu sửa — xem docs/maintenance-appointment-implementation-spec.md §5). Chỉ
 * đọc mã QR, KHÔNG tự tra cứu BE — việc so khớp equipmentId là của màn gọi component
 * này, vì đây là gate chặn phía app, không phải một bước nghiệp vụ cần gọi API riêng.
 */
export const EquipmentQrScanModal: React.FC<Props> = ({ visible, title, hint, onScan, onClose }) => {
  const [permission, requestPermission] = useCameraPermissions();
  // Mỗi lần mở lại (vd sau "Quét lại") phải mở khoá — CameraView bắn onBarcodeScanned
  // liên tục nên không khoá là gọi onScan hàng chục lần cho cùng 1 mã.
  const scanLockRef = useRef(false);
  useEffect(() => { if (visible) scanLockRef.current = false; }, [visible]);

  const handleScanned = ({ data }: { data: string }) => {
    if (scanLockRef.current) return;
    scanLockRef.current = true;
    onScan(data);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {!permission ? (
          <View style={styles.center} />
        ) : !permission.granted ? (
          <View style={styles.permissionContainer}>
            <Text style={styles.permissionEmoji}>📷</Text>
            <Text style={styles.permissionTitle}>Cần quyền Camera</Text>
            <Text style={styles.permissionDesc}>Cần quyền Camera để quét mã QR trên thiết bị.</Text>
            <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
              <Text style={styles.permissionBtnText}>Cấp quyền Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.closeLink} onPress={onClose}>
              <Text style={styles.closeLinkText}>Đóng</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            onBarcodeScanned={handleScanned}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          >
            <View style={styles.overlay}>
              <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.title}>{title ?? 'Quét mã QR thiết bị'}</Text>
              <View style={styles.frame}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
              <Text style={styles.hint}>{hint ?? 'Hướng camera vào mã QR dán trên thiết bị'}</Text>
            </View>
          </CameraView>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1 },
  permissionContainer: { flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  permissionEmoji: { fontSize: 48, marginBottom: Spacing.base },
  permissionTitle: { fontSize: 20, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  permissionDesc: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xl },
  permissionBtn: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: 12 },
  permissionBtnText: { fontSize: 15, fontWeight: '700', color: Colors.white },
  closeLink: { marginTop: Spacing.lg, padding: Spacing.sm },
  closeLinkText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  title: { fontSize: 20, fontWeight: '700', color: Colors.white, marginBottom: Spacing['2xl'] },
  frame: { width: 240, height: 240, position: 'relative', marginBottom: Spacing['2xl'] },
  corner: { position: 'absolute', width: 30, height: 30, borderColor: Colors.primary, borderWidth: 3 },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  hint: { fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 22 },
  closeBtn: { position: 'absolute', top: 52, left: Spacing.lg, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});
