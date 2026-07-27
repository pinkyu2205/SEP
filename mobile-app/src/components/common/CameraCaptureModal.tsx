import { CameraView, useCameraPermissions } from 'expo-camera'
import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { BorderRadius, Colors, Spacing } from '../../constants'

/**
 * Modal chụp ảnh bằng expo-camera. Dùng thay ImagePicker.launchCameraAsync trên web,
 * vì trên web hàm đó chỉ mở file picker chứ không bật camera thật.
 * - multi=false: chụp 1 ảnh xong tự đóng.
 * - multi=true: chụp nhiều ảnh liên tiếp (mỗi ảnh gọi onCapture), bấm "Xong" để đóng.
 */
interface CameraCaptureModalProps {
  visible: boolean
  multi?: boolean
  onCapture: (uri: string) => void
  onClose: () => void
  /** Camera không dùng được (mất quyền vĩnh viễn) — cho lối thoát chọn ảnh thư viện thay thế. */
  onUseGalleryInstead?: () => void
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  visible,
  multi = false,
  onCapture,
  onClose,
  onUseGalleryInstead,
}) => {
  const camRef = useRef<CameraView>(null)
  const [permission, requestPermission] = useCameraPermissions()
  const [facing, setFacing] = useState<'back' | 'front'>('back')
  const [taking, setTaking] = useState(false)
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      requestPermission()
    }
  }, [visible, permission, requestPermission])

  const takePhoto = async () => {
    if (!camRef.current || taking) return
    try {
      setTaking(true)
      const photo = await camRef.current.takePictureAsync({ quality: 0.7 })
      if (photo?.uri) {
        onCapture(photo.uri)
        if (multi) setCount((c) => c + 1)
        else handleClose()
      }
    } finally {
      setTaking(false)
    }
  }

  const handleClose = () => {
    setCount(0)
    onClose()
  }

  return (
    <Modal visible={visible} animationType='slide' onRequestClose={handleClose}>
      <View style={styles.container}>
        {!permission?.granted ? (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionEmoji}>📷</Text>
            <Text style={styles.permissionText}>
              Cần quyền truy cập camera để chụp ảnh.
            </Text>
            <TouchableOpacity
              style={styles.permissionBtn}
              onPress={requestPermission}
            >
              <Text style={styles.permissionBtnText}>Cấp quyền camera</Text>
            </TouchableOpacity>
            {onUseGalleryInstead && (
              <TouchableOpacity
                onPress={() => { onUseGalleryInstead(); handleClose() }}
              >
                <Text style={styles.permissionCancel}>Camera không dùng được? Chọn ảnh từ thư viện</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleClose}>
              <Text style={styles.permissionCancel}>Đóng</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <CameraView ref={camRef} style={styles.camera} facing={facing} />
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
            {multi && count > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countText}>Đã chụp {count} ảnh</Text>
              </View>
            )}
            <View style={styles.controls}>
              <TouchableOpacity
                style={styles.sideBtn}
                onPress={() =>
                  setFacing((f) => (f === 'back' ? 'front' : 'back'))
                }
              >
                <Text style={styles.sideBtnText}>🔄</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.shutter}
                onPress={takePhoto}
                disabled={taking}
              >
                {taking ? (
                  <ActivityIndicator color={Colors.primary} />
                ) : (
                  <View style={styles.shutterInner} />
                )}
              </TouchableOpacity>
              {multi ? (
                <TouchableOpacity style={styles.sideBtn} onPress={handleClose}>
                  <Text style={styles.doneText}>Xong</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.sideBtn} />
              )}
            </View>
          </>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  closeBtn: {
    position: 'absolute',
    top: Spacing.xl,
    right: Spacing.base,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15,23,42,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  countBadge: {
    position: 'absolute',
    top: Spacing.xl,
    alignSelf: 'center',
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: 6,
  },
  countText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  controls: {
    position: 'absolute',
    bottom: Spacing.xl,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  sideBtn: {
    width: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideBtnText: {
    fontSize: 26,
  },
  doneText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.white,
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.base,
  },
  permissionEmoji: {
    fontSize: 48,
  },
  permissionText: {
    color: Colors.white,
    fontSize: 15,
    textAlign: 'center',
  },
  permissionBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
  },
  permissionBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  permissionCancel: {
    color: Colors.textMuted,
    fontSize: 14,
    marginTop: Spacing.sm,
  },
})
